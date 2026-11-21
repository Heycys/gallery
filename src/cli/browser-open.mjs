import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// The default browser opened at an address, for gallery open and page open (new, import and duplicate
// with --open): Windows by rundll32's
// FileProtocolHandler (start would read the "#" and "&" of an address as its own), macOS by open,
// Linux by xdg-open when there is a display (DISPLAY or WAYLAND_DISPLAY) and xdg-open is there, WSL
// by Windows' cmd.exe /c start (the browser is Windows'). Never waited for: the browser runs on after
// the command; a failure is said in a line, never the command's failure. GALLERY_NO_BROWSER=1 (and
// open's and page open's --no-browser) opens none.

const set = (value) => !["", "0", undefined].includes(value);
const onPath = (name, env) => (env.PATH ?? "").split(path.delimiter).some((folder) => folder && existsSync(path.join(folder, name)));
const isWsl = () => {
  try {
    return process.platform === "linux" && /microsoft/i.test(readFileSync("/proc/version", "utf8"));
  } catch {
    return false;
  }
};

/**
 * How the default browser is opened at `address` on this system: { command, args } or { skip: why }.
 * The words of a link go percent-encoded, as no system's code page can spoil them on the way.
 * `platform`, `env` and `wsl`: the tests'.
 */
export function browserCommand(address, { platform = process.platform, env = process.env, wsl = isWsl() } = {}) {
  const url = encodeURI(address);
  if (set(env.GALLERY_NO_BROWSER)) return { skip: "GALLERY_NO_BROWSER is set" };
  if (platform === "win32") return { command: path.join(env.SystemRoot || env.windir || "C:\\Windows", "System32", "rundll32.exe"), args: ["url.dll,FileProtocolHandler", url] };
  if (platform === "darwin") return { command: "open", args: [url] };
  if (wsl) return { command: "cmd.exe", args: ["/c", "start", '""', url.replace(/[&^]/g, "^$&")] };
  if (!env.DISPLAY && !env.WAYLAND_DISPLAY) return { skip: "no display here (neither DISPLAY nor WAYLAND_DISPLAY is set)" };
  if (!onPath("xdg-open", env)) return { skip: "xdg-open is not installed" };
  return { command: "xdg-open", args: [url] };
}

/** What a command says once it opened the default browser at its address. */
export const OPENED_LINE = "Opened it in the default browser (if that is not Chrome or Edge, open the address there to edit).";
/** What a command says of opening the default browser: OPENED_LINE, or why it opened none. */
export const browserSaid = (opened) => (opened.opened ? OPENED_LINE : `Not opened in a browser: ${opened.why}.`);

/** Open the default browser at `url`: { opened: true } or { opened: false, why }. */
export async function openBrowser(url, options) {
  const how = browserCommand(url, options);
  if (how.skip) return { opened: false, why: how.skip };
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(how.command, how.args, { detached: true, stdio: "ignore", windowsHide: true });
    } catch (error) {
      return resolve({ opened: false, why: `${path.basename(how.command)} did not start (${error.code ?? error.message})` });
    }
    child.once("error", (error) => resolve({ opened: false, why: `${path.basename(how.command)} did not start (${error.code ?? error.message})` }));
    child.once("spawn", () => {
      child.unref();
      resolve({ opened: true });
    });
  });
}
