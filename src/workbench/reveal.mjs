import { spawn } from "node:child_process";
import path from "node:path";
const set = (value) => !["", "0", undefined].includes(value);

export function revealCommand(target, { platform = process.platform, env = process.env } = {}) {
  if (set(env.GALLERY_NO_BROWSER)) return { skip: "GALLERY_NO_BROWSER is set" };
  if (platform === "win32") return { command: path.join(env.SystemRoot || env.windir || "C:\\Windows", "explorer.exe"), args: [`/select,"${target}"`], verbatim: true };
  if (platform === "darwin") return { command: "open", args: ["-R", target] };
  if (!env.DISPLAY && !env.WAYLAND_DISPLAY) return { skip: "no display here (neither DISPLAY nor WAYLAND_DISPLAY is set)" };
  return { command: "xdg-open", args: [path.dirname(target)] };
}

/** Open the file manager at `target`: { opened: true } or { opened: false, why }. Never waited for. */
export function reveal(target, options) {
  const how = revealCommand(target, options);
  if (how.skip) return Promise.resolve({ opened: false, why: how.skip });
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(how.command, how.args, { detached: true, stdio: "ignore", windowsHide: false, windowsVerbatimArguments: Boolean(how.verbatim) });
    } catch (error) {
      return resolve({ opened: false, why: error.code ?? error.message });
    }
    child.once("error", (error) => resolve({ opened: false, why: error.code ?? error.message }));
    child.once("spawn", () => {
      child.unref();
      resolve({ opened: true });
    });
  });
}
