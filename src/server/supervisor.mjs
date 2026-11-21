import { spawn } from "node:child_process";
import { readAnnouncement } from "../shared/preview-server.mjs";

// The release server's keeper (docs/render.md, "Live preview"). dist/server.mjs started by a gallery
// command (./start.mjs) runs as this small process, which runs the server itself as its child (the same
// file with --worker) and starts it again when it ends unexpectedly, so that a page open in the browser
// reconnects within seconds (its edits kept meanwhile) instead of finding no server until the next login
// or gallery command: a bug thrown out of a timer or a callback, the process out of memory, or the package
// replaced under it (an upgrade, whose files the next worker then runs). It never brings back a server
// that was asked to stop (POST /__gallery/workspace/stop, a signal: exit 0), one another process ended
// (gallery stop when the server did not stop by itself: TerminateProcess's 1, or a signal), one that
// could not start at all (its port taken: the gallery command reports it as before), or one another
// Gallery server has taken over from. Its child ends with it: the IPC channel closing tells the worker
// to stop.

/** The worker's exit codes that ask for another worker: an uncaught exception, the package replaced. */
export const EXIT_CRASHED = 70;
export const EXIT_REPLACED = 75;
/** The waits before each next worker, then none (given up); a worker up for STEADY ms starts the count over. */
export const DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];
export const STEADY = 60_000;

const CRASH_SIGNALS = new Set(["SIGABRT", "SIGSEGV", "SIGBUS", "SIGILL", "SIGFPE"]);

/**
 * Whether a worker that ended with `code` (or `signal`) is to be started again: one that crashed or
 * whose package was replaced, never one stopped or ended on purpose. 3 is abort() on Windows (V8 out
 * of memory), 0xC0000000 and up an NTSTATUS crash (an access violation, a stack overflow), 134 and 139
 * an abort and a segfault as a POSIX shell says them.
 */
export function restartable(code, signal = null) {
  if (signal) return CRASH_SIGNALS.has(signal);
  return code === EXIT_CRASHED || code === EXIT_REPLACED || code === 3 || code === 134 || code === 139 || (Number.isInteger(code) && code >= 0xc0000000);
}

const sleeping = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run workers until one ends for good; resolves to the exit code to end with. `start(restarts)` starts
 * a worker (a ChildProcess with an IPC channel, saying { type: "listening" } once it serves);
 * `others(pid)` says whether another server now serves the data directory (not worker `pid`);
 * `signals`: those passed on to the worker, after which none is started again.
 */
export async function supervise({
  start, others = async (pid) => { const found = await readAnnouncement(); return Boolean(found && found.pid !== pid); },
  log = console, sleep = sleeping, now = Date.now, signals = ["SIGINT", "SIGTERM", "SIGHUP"],
} = {}) {
  let stopping = false;
  let worker = null;
  const passOn = (signal) => () => { stopping = true; try { worker?.kill(signal); } catch {} };
  const handlers = signals.map((signal) => [signal, passOn(signal)]);
  for (const [signal, handler] of handlers) process.on(signal, handler);
  const say = (line) => log.log(`[gallery] ${new Date().toISOString()} keeper (pid ${process.pid}): ${line}`);
  try {
    let restarts = 0;
    let failures = 0;
    let served = false; // a worker of this keeper has listened
    for (;;) {
      const began = now();
      worker = start(restarts);
      let listening = false;
      worker.on("message", (message) => { if (message?.type === "listening") listening = served = true; });
      const { code, signal } = await new Promise((resolve) => {
        worker.once("error", (error) => resolve({ code: 1, signal: null, error }));
        worker.once("exit", (code, signal) => resolve({ code, signal }));
      });
      const ended = signal ? `signal ${signal}` : `exit ${code}`;
      if (stopping) return code ?? 0;
      if (!restartable(code, signal)) return code ?? 1; // stopped, ended by another process, or failed to start
      if (!served) return code ?? 1; // never served: the command that started it reports why
      if (now() - began >= STEADY) failures = 0;
      if (failures >= DELAYS.length) {
        say(`the server ended (${ended}) ${failures + 1} times in a row; not started again. Run gallery open to start it.`);
        return code ?? 1;
      }
      const wait = Math.max(DELAYS[failures], code === EXIT_REPLACED ? 2000 : 0); // the new package's files settle
      failures += 1;
      say(`the server ended (${ended}${listening ? "" : ", before it served"}): starting it again in ${wait / 1000}s.`);
      await sleep(wait);
      if (stopping) return 0;
      if (await others(worker.pid).catch(() => false)) {
        say("another Gallery server serves this data directory now; not started again.");
        return 0;
      }
      restarts += 1;
    }
  } finally {
    for (const [signal, handler] of handlers) process.off(signal, handler);
  }
}

/** A worker: `entry` (dist/server.mjs) with `args` and --worker, its output where the keeper's goes. */
export function startWorker(entry, args, restarts, env = process.env) {
  return spawn(process.execPath, [entry, ...args, "--worker"], {
    env: { ...env, GALLERY_WORKER_RESTARTS: String(restarts), GALLERY_KEEPER_PID: String(process.pid) },
    stdio: ["ignore", "inherit", "inherit", "ipc"],
    windowsHide: true,
  });
}
