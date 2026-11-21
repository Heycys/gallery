import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { launcherFile, packageRoot, release } from "./paths.mjs";
import { serviceLocation } from "./service-location.mjs";
import { defaultWorkspace } from "./workspace.mjs";
import { writeAtomic } from "./files.mjs";

const execute = promisify(execFile);
const RUN = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const NAME = "HeycysGallery";
const LABEL = "com.heycys.gallery";
const xml = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]);
const quoted = value => '"' + String(value).replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1') + '"';
const read = file => fs.readFile(file, "utf8").catch(error => { if (error.code === "ENOENT") return null; throw error; });

// One user-level login item, pointing to the installed CLI. The CLI reuses serverFor's
// single-service lock, saved port and hidden process creation; it never opens a browser.
// No postinstall hook or administrator access. The server's keeper (src/server/supervisor.mjs) starts a
// crashed server again, never a stopped one: gallery stop stays stopped.
export function createStartup({ platform = process.platform, home = os.homedir(), data = serviceLocation().data,
  workspace = defaultWorkspace(), node = process.execPath, cli = launcherFile,
  available = release && /[\\/]node_modules[\\/]@heycys[\\/]gallery$/.test(packageRoot) && !/(?:^|[\\/])_npx[\\/]/.test(packageRoot) && process.env.GALLERY_NO_AUTOSTART !== "1",
  run = (program, args) => execute(program, args, { windowsHide: true, timeout: 10000 }) } = {}) {
  const supported = platform === "win32" || platform === "darwin";
  const settings = path.join(data, "startup.json");
  const script = path.join(data, "startup.js");
  const plist = path.join(home, "Library", "LaunchAgents", `${LABEL}.plist`);
  let queue = Promise.resolve();
  const serial = task => { const next = queue.then(task); queue = next.catch(() => {}); return next; };
  const config = async () => {
    const text = await read(settings);
    const value = text === null ? {} : JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value) || (value.enabled !== undefined && typeof value.enabled !== "boolean")) throw new Error("Invalid Gallery startup settings");
    return { text, value };
  };
  async function registration() {
    if (platform === "darwin") return read(plist);
    if (platform !== "win32") return null;
    try {
      const { stdout } = await run("reg.exe", ["query", RUN, "/v", NAME]);
      return /REG_SZ\s+(.+?)\s*$/m.exec(stdout)?.[1] ?? null;
    } catch (error) { if (error.code === 1) return null; throw error; }
  }
  const command = [path.join(process.env.SystemRoot || "C:\\Windows", "System32", "wscript.exe"), "//B", "//Nologo", script].map(quoted).join(" ");
  const environment = { GALLERY_DATA_DIR: data, GALLERY_DEFAULT_WORKSPACE: workspace, GALLERY_WORKSPACE: workspace, GALLERY_NO_BROWSER: "1", GALLERY_NO_UPDATE_CHECK: "1" };
  const windowsScript = `// Gallery login launcher. Window style 0: no console or browser.\nvar shell = new ActiveXObject("WScript.Shell");\nvar env = shell.Environment("Process");\n${Object.entries(environment).map(([key, value]) => `env(${JSON.stringify(key)}) = ${JSON.stringify(value)};`).join("\n")}\nshell.Run(${JSON.stringify([node, cli, "startup", "run"].map(quoted).join(" "))}, 0, false);\n`;
  const macPlist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>
<key>Label</key><string>${LABEL}</string>
<key>ProgramArguments</key><array>${[node, cli, "startup", "run"].map(value => `<string>${xml(value)}</string>`).join("")}</array>
<key>RunAtLoad</key><true/>
<key>AbandonProcessGroup</key><true/>
<key>EnvironmentVariables</key><dict>${Object.entries(environment).map(([key, value]) => `<key>${xml(key)}</key><string>${xml(value)}</string>`).join("")}</dict>
<key>StandardOutPath</key><string>${xml(path.join(data, "logs", "startup.log"))}</string>
<key>StandardErrorPath</key><string>${xml(path.join(data, "logs", "startup.log"))}</string>
</dict></plist>\n`;
  const desired = platform === "win32" ? command : macPlist;
  async function apply(enabled) {
    const current = await registration();
    if (enabled) {
      await fs.mkdir(path.join(data, "logs"), { recursive: true });
      if (platform === "win32") {
        // WSH reads ANSI by default. ASCII Unicode escapes preserve Chinese user paths
        // independently of the machine's active code page.
        const encoded = windowsScript.replace(/[^\x00-\x7f]/g, character => "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0"));
        if (await read(script) !== encoded) await writeAtomic(script, encoded);
        if (current !== desired) await run("reg.exe", ["add", RUN, "/v", NAME, "/t", "REG_SZ", "/d", command, "/f"]);
      } else if (current !== desired) {
        await fs.mkdir(path.dirname(plist), { recursive: true });
        await writeAtomic(plist, macPlist);
      }
    } else if (current !== null) {
      if (platform === "win32") await run("reg.exe", ["delete", RUN, "/v", NAME, "/f"]);
      else await fs.unlink(plist);
    }
  }
  async function status() {
    const { value } = await config();
    const installed = supported && available && await registration() !== null;
    return { supported, available: supported && available, enabled: Boolean(installed) && value.enabled !== false, requested: value.enabled !== false };
  }
  return {
    status,
    sync: () => serial(async () => { if (supported && available) await apply((await config()).value.enabled !== false); return status(); }),
    set: enabled => serial(async () => {
      if (typeof enabled !== "boolean") throw new Error("enabled must be a boolean");
      if (!supported || !available) throw new Error("Autostart requires an installed Gallery package on Windows or macOS");
      const { text, value } = await config();
      await fs.mkdir(data, { recursive: true });
      // Persist the user's choice first. A failed OS operation remains retryable, and a
      // disabled choice can never be silently turned back on by the next package update.
      if (!await writeAtomic(settings, JSON.stringify({ ...value, enabled }, null, 2) + "\n", { expect: text })) throw new Error("Startup settings changed; try again");
      await apply(enabled);
      return status();
    }),
  };
}

let manager;
export const startup = () => manager ??= createStartup();
