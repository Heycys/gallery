import { fileURLToPath } from "node:url";
import { startProductionServer } from "./production.mjs";
import { EXIT_CRASHED, EXIT_REPLACED, startWorker, supervise } from "./supervisor.mjs";

// The release's server process (dist/server.mjs, the bundle of this file: src/cli/release-build.mjs):
// `node dist/server.mjs --port <n>`, started by a gallery command (src/cli/server-process.mjs),
// detached, its workspace in GALLERY_WORKSPACE, its output in the workspace's .gallery/logs/server.log.
// Started so, it is the keeper (./supervisor.mjs): the server itself runs as its child, the same file
// with --worker, and is started again when it ends unexpectedly. The worker runs until POST
// /__gallery/workspace/stop, a signal, its package replaced (./production.mjs) or its keeper gone.

const at = process.argv.indexOf("--port");
const port = at === -1 ? Number.NaN : Number(process.argv[at + 1]);
if (!Number.isInteger(port) || port <= 0 || port >= 65536) {
  console.error("Usage: node dist/server.mjs --port <n> (GALLERY_WORKSPACE names the workspace). The gallery command starts it: gallery open.");
  process.exit(2);
}
const stamp = () => new Date().toISOString();

if (!process.argv.includes("--worker")) {
  const entry = fileURLToPath(import.meta.url);
  process.exitCode = await supervise({ start: (restarts) => startWorker(entry, ["--port", String(port)], restarts) });
} else {
  // A promise failed with no one waiting for it: said, and the server goes on (one request's or one
  // background task's failure, never the whole service's). An exception thrown out of a callback leaves
  // the process in a state no one can vouch for: said, and the worker ends for its keeper to start a
  // new one (the pages reconnect; what they had not saved is kept in the browser until then).
  process.on("unhandledRejection", (reason) => {
    console.error(`[gallery] ${stamp()} a promise failed with no one waiting for it (the server goes on): ${reason?.stack ?? reason}`);
  });
  process.on("uncaughtException", (error) => {
    console.error(`[gallery] ${stamp()} the server failed (its keeper starts it again): ${error?.stack ?? error}`);
    process.exit(EXIT_CRASHED);
  });
  let routes = null;
  let keeperGone = false;
  // The keeper gone (ended by another process, or the command that started it gave up on it): this worker stops too.
  process.once("disconnect", () => { keeperGone = true; routes?.stop(); });
  try {
    const started = await startProductionServer({ port, exit: (code = 0, why) => process.exit(why === "replaced" ? EXIT_REPLACED : code) });
    routes = started.routes;
    console.log(`[gallery] ${stamp()} listening on http://127.0.0.1:${started.port}/ (pid ${process.pid}, keeper ${process.ppid})`);
    if (keeperGone) routes.stop();
    else process.send?.({ type: "listening", port: started.port });
  } catch (error) {
    console.error(`[gallery] could not start on port ${port}: ${error.message}`);
    process.exit(1);
  }
  // The tests' crash (tests/release/restart-smoke.mjs): the first worker throws out of a timer after so many ms.
  const crashAfter = Number(process.env.GALLERY_TEST_CRASH_AFTER);
  if (crashAfter > 0 && process.env.GALLERY_WORKER_RESTARTS === "0") setTimeout(() => { throw new Error("GALLERY_TEST_CRASH_AFTER: the tests' crash"); }, crashAfter);
}
