import os from "node:os";
import path from "node:path";

// The user's own folders for Gallery, outside every workspace: "cache", what may be thrown away (the
// update check's answer, src/cli/updates.mjs), and "data", what Gallery keeps of the machine (the
// registry of the workspaces used on it, ./workspace-registry.mjs). One function, so that every system
// finds them alike. Node's built-ins only: gallery --version reads it, and stays as fast as Node's start.

/**
 * The folder of `kind` ("cache" or "data"): GALLERY_CACHE_DIR or GALLERY_DATA_DIR when set (the tests
 * name folders of their own); else on Windows %LOCALAPPDATA%\gallery for both; on macOS
 * ~/Library/Caches/gallery and ~/Library/Application Support/gallery; elsewhere $XDG_CACHE_HOME/gallery
 * (~/.cache/gallery) and $XDG_STATE_HOME/gallery (~/.local/state/gallery). Only a path: nothing is made.
 */
export function userDirectory(kind, { env = process.env, platform = process.platform, home = os.homedir() } = {}) {
  const cache = kind === "cache";
  const own = cache ? env.GALLERY_CACHE_DIR : env.GALLERY_DATA_DIR;
  if (own) return path.resolve(own);
  if (platform === "win32") return path.join(env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "gallery");
  if (platform === "darwin") return path.join(home, "Library", cache ? "Caches" : "Application Support", "gallery");
  return cache
    ? path.join(env.XDG_CACHE_HOME || path.join(home, ".cache"), "gallery")
    : path.join(env.XDG_STATE_HOME || path.join(home, ".local", "state"), "gallery");
}
