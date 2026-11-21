import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { packageRoot } from "./paths.mjs";
import { compareVersions } from "./versions.mjs";
import { defaultWorkspace } from "./workspace.mjs";
import { serviceLocation } from "./service-location.mjs";

// One service per data directory: commands verify the announcement before reusing its port.
// Documents in every registered folder use the same service and retain owner-qualified paths.

// A directory as one name, however it was reached: on Windows a drive letter and the folders' names
// may be typed in either case (`cd /d d:\…` in cmd gives d:\), and they name the same directory.
const canonical = (directory) => {
  const resolved = path.resolve(directory);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
};
/** Whether two paths name the same directory (a service home or data directory). */
export const sameDirectory = (a, b) => canonical(a) === canonical(b);

const fileOf = () => serviceLocation().serverFile;
/** Gallery's version, as its package says it (a server of another version is another Gallery's). */
export const galleryVersion = (() => {
  try {
    return JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

// Whether a process runs (only asked: nothing is sent to it).
const runs = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
};

/** Acquire the data-directory lifetime lease and publish the sole service identity.
 * The returned closer removes only this instance’s announcement and lease. A server run by a keeper
 * (src/server/supervisor.mjs: its parent, over an IPC channel) names it too, as `keeper`: the process
 * the gallery command started, which it knows its server by. */
export async function announcePreviewServer({ home = defaultWorkspace(), port, token, kind = "dev", version = galleryVersion, every = 1000 }) {
  const file = fileOf();
  const nonce = randomBytes(8).toString("hex");
  const keeper = typeof process.send === "function" && Number(process.env.GALLERY_KEEPER_PID) === process.ppid ? { keeper: process.ppid } : {};
  const text = `${JSON.stringify({ port, pid: process.pid, ...keeper, home: path.resolve(home), token, nonce, kind, version, started: new Date().toISOString() })}\n`;
  const save = (content) => fs.writeFile(file, content, { mode: 0o600 });
  await fs.mkdir(path.dirname(file), { recursive: true });
  const lease = path.join(path.dirname(file), "server.lock");
  for (let attempt = 0; ; attempt++) {
    try { await fs.writeFile(lease, text, { flag: "wx", mode: 0o600 }); break; }
    catch (error) {
      if (error.code !== "EEXIST" || attempt > 3) throw error;
      const owner = await fs.readFile(lease, "utf8").then(JSON.parse).catch(() => null);
      if (!owner) throw new Error("Gallery is starting; retry shortly.");
      if (runs(owner.pid)) {
        if (owner.pid === process.pid && owner.port === port) { await fs.writeFile(lease, text); break; }
        throw new Error(`Gallery already runs on port ${owner.port} (pid ${owner.pid}).`);
      }
      await fs.rm(lease, { force: true });
    }
  }
  try { await save(text); } catch (error) {
    const owner = await fs.readFile(lease, "utf8").then(JSON.parse).catch(() => null);
    if (owner?.nonce === nonce) await fs.rm(lease, { force: true });
    throw error;
  }
  let closed = false;
  const look = async () => {
    let there = null;
    try {
      there = JSON.parse(await fs.readFile(file, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") return; // being written (by another server), or not an announcement: left
    }
    if (there && (there.nonce === nonce || !Number.isInteger(there.pid) || runs(there.pid))) return;
    if (closed) return;
    await fs.mkdir(path.dirname(file)).catch(() => {});
    await save(text).catch(() => {});
  };
  let looking = Promise.resolve();
  const keeping = every > 0 ? setInterval(() => (looking = looking.then(look).catch(() => {})), every) : null;
  keeping?.unref();
  return async () => {
    closed = true;
    clearInterval(keeping);
    await looking;
    const announcement = await fs.readFile(file, "utf8").then(JSON.parse).catch(() => null);
    if (announcement?.nonce === nonce) await fs.rm(file, { force: true }).catch(() => {});
    const owner = await fs.readFile(lease, "utf8").then(JSON.parse).catch(() => null);
    if (owner?.nonce === nonce) await fs.rm(lease, { force: true }).catch(() => {});
  };
}

// The data-directory service announcement, while its process runs.
export async function readAnnouncement() {
  let found;
  try {
    found = JSON.parse(await fs.readFile(fileOf(), "utf8"));
  } catch {
    return null;
  }
  if (!Number.isInteger(found?.port) || !Number.isInteger(found.pid) || typeof found.token !== "string" || typeof found.home !== "string") return null;
  return runs(found.pid) ? found : null;
}

/** Whether process `pid` runs (only asked: nothing is sent to it). */
export const processRuns = runs;

/**
 * How the server an announcement names answers on its port, within `timeout` ms: "yes", as that
 * server (GET /__gallery/workspace/info there names the announcement's token, its process, home and data directory, docs/workbench.md; there itself, not where it sends the request on to); "no", as none (a
 * server stopped without closing leaves its announcement behind, and by now its process's number may
 * be another program's, its port another server's); or "busy": the port took the request and gave no
 * answer in time.
 */
export async function answerOf(found, timeout = 10_000) {
  try {
    const response = await fetch(`http://127.0.0.1:${found.port}/__gallery/workspace/info`, { redirect: "error", signal: AbortSignal.timeout(timeout) });
    const info = response.ok ? await response.json() : null;
    const same = info?.token === found.token && info.server?.pid === found.pid && typeof info.server.home === "string" && sameDirectory(info.server.home, found.home) && sameDirectory(info.server.data, serviceLocation().data);
    if (process.env.GALLERY_SANDBOX && info?.server?.sandbox !== process.env.GALLERY_SANDBOX) return "no";
    return same ? "yes" : "no";
  } catch (error) {
    return error?.name === "TimeoutError" ? "busy" : "no";
  }
}

/**
 * The running server for this data directory: { port, token, pid, keeper } (keeper: its keeper's pid, or null), or null when none says it runs. With
 * `answering`, only one that answers on its port as the server its announcement names, within
 * `timeout` ms (gallery open, which gives its address to the user); gallery export asks without it,
 * its hand-in's own request telling whether the server takes it (a server slow to answer may still
 * write the file).
 */
export async function findPreviewServer({ answering = false, timeout = 10_000 } = {}) {
  const found = await readAnnouncement();
  if (!found || (answering && await answerOf(found, timeout) !== "yes")) return null;
  return { port: found.port, token: found.token, pid: found.pid, keeper: Number.isInteger(found.keeper) ? found.keeper : null };
}

/**
 * Whether `port` of 127.0.0.1 is free: nothing holds it (held for a moment), and nothing answers on
 * it (a server listening on every address may leave 127.0.0.1 alone to be held).
 */
export const portIsFree = (port) => new Promise((resolve) => {
  const holder = net.createServer();
  holder.once("error", () => resolve(false));
  holder.listen(port, "127.0.0.1", () => holder.close(() => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", (error) => resolve(error.code === "ECONNREFUSED"));
  }));
});

/** -1, 0 or 1 as version `a` is older than, the same as or newer than `b` (./versions.mjs, which gallery --version reads too). */
export { compareVersions };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Whether process `pid` is gone within `ms` (asked every 100 ms).
async function goneWithin(pid, ms) {
  for (const until = Date.now() + ms; Date.now() < until; await sleep(100)) if (!runs(pid)) return true;
  return !runs(pid);
}

/**
 * Stop the server announcement `found` names, which answered as that server during this call
 * (answerOf "yes": its process is this server's, never a number used again): POST
 * /__gallery/workspace/stop (its token; the server finishes the saves in its queue, closes and exits), then,
 * when its process still runs after `wait` ms, that process killed. Resolves to { ok: true, killed }
 * or { ok: false, reason: "dev" (npm run dev's: stopped where it runs) | "running" (it would not stop), message }.
 */
export async function stopServer(found, { wait = 10_000, force = !process.env.GALLERY_SANDBOX } = {}) {
  const host = `127.0.0.1:${found.port}`;
  let status = 0;
  try {
    const response = await fetch(`http://${host}/__gallery/workspace/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: `http://${host}`, "X-Gallery-Token": found.token },
      body: "{}",
      signal: AbortSignal.timeout(wait),
    });
    status = response.status;
    await response.text().catch(() => "");
  } catch {} // it closed as it answered, or did not answer: its process says
  if (status === 409) return { ok: false, reason: "dev", message: `The shared Gallery server is npm run dev's (port ${found.port}, pid ${found.pid}): stop it where it runs.` };
  if (await goneWithin(found.pid, wait)) return { ok: true, killed: false };
  if (force) {
    try {
      process.kill(found.pid);
    } catch {}
    if (await goneWithin(found.pid, 3000)) return { ok: true, killed: true };
  }
  return { ok: false, reason: "running", message: `The server on port ${found.port} (pid ${found.pid}) did not stop: end that process yourself.` };
}

/**
 * The shared service, for a command that needs one (src/cli/server-process.mjs serverFor): the
 * one its announcement names when it answers there within `timeout` ms (as findPreviewServer with
 * `answering`), or else one `start(port)` starts on the first free port of `ports`. A server of
 * Gallery's of an older `version` (a command's, kind "cli": never npm run dev's) is stopped first
 * (`stop(found)`, stopServer) and replaced; a newer one, or npm run dev's of any version, is used.
 * Resolves to { port, started: what `start` gave, or null for a server that ran already, running: {
 * pid, kind, version } of that one, replaced: { pid, version } of the one stopped, or null, passed:
 * the ports passed over, as "4317 (in use)" }; `port` is null when none of `ports` is free; when the
 * announced server's port took the request and gave no answer in time, with `busy: { port, pid,
 * version, newer }`: the shared Gallery server, busy or stuck, and none is started beside it; and when
 * an older one would not stop, with `stuck: { port, pid, message }`.
 */
export async function previewServerFor({ ports, start, stop = stopServer, timeout = 10_000, version = galleryVersion }) {
  const found = await readAnnouncement();
  const answer = found ? await answerOf(found, timeout) : "no";
  const kind = found?.kind === "dev" ? "dev" : "cli";
  const order = found ? compareVersions(found.version, version) : 0;
  if (answer === "busy") return { port: null, started: null, passed: [], replaced: null, busy: { port: found.port, pid: found.pid, version: found.version ?? null, newer: kind === "cli" && order > 0 } };
  let replaced = null;
  if (answer === "yes") {
    if (kind === "dev" || order >= 0) return { port: found.port, started: null, passed: [], replaced: null, running: { pid: found.pid, kind, version: found.version ?? null } };
    const stopped = await stop(found);
    if (!stopped.ok) return { port: null, started: null, passed: [], replaced: null, stuck: { port: found.port, pid: found.pid, message: stopped.message } };
    replaced = { pid: found.pid, version: found.version ?? null };
  }
  const passed = [];
  for (const port of ports) {
    if (await portIsFree(port)) return { port, started: await start(port), passed, replaced };
    passed.push(`${port} (in use)`);
  }
  return { port: null, started: null, passed, replaced };
}
