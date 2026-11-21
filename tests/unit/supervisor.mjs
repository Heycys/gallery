import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DELAYS, EXIT_CRASHED, EXIT_REPLACED, STEADY, restartable, startWorker, supervise } from "../../src/server/supervisor.mjs";

// The release server's keeper (src/server/supervisor.mjs): which ends start another worker, the waits
// between them, giving up, and never bringing back a server stopped, ended by another process, never
// served, or taken over by another.

// Which ends ask for another worker.
for (const code of [EXIT_CRASHED, EXIT_REPLACED, 3, 134, 139, 0xc0000005, 0xc0000409]) assert.equal(restartable(code), true, `exit ${code} restarts`);
for (const code of [0, 1, 2, null]) assert.equal(restartable(code), false, `exit ${code} does not`);
assert.equal(restartable(null, "SIGSEGV"), true);
assert.equal(restartable(null, "SIGABRT"), true);
for (const signal of ["SIGTERM", "SIGKILL", "SIGINT", "SIGHUP"]) assert.equal(restartable(null, signal), false, `${signal} does not`);

// A fake worker: each `plan` entry says whether it listens, then how it ends.
const run = async (plans, { others = async () => false, clock = null } = {}) => {
  const started = [];
  const waits = [];
  let time = 0;
  const code = await supervise({
    start: (restarts) => {
      const plan = plans[started.length];
      assert.ok(plan, `no worker ${started.length + 1} planned`);
      const worker = Object.assign(new EventEmitter(), { pid: 1000 + started.length, kill() {} });
      started.push(restarts);
      setImmediate(() => {
        if (plan.listen !== false) worker.emit("message", { type: "listening", port: 8080 });
        time += plan.ran ?? 10;
        worker.emit("exit", plan.code ?? null, plan.signal ?? null);
      });
      return worker;
    },
    others, log: { log() {} }, signals: [],
    sleep: async (ms) => { waits.push(ms); }, now: clock ?? (() => time),
  });
  return { code, started, waits };
};

{ // A crash after serving: another worker after 1s, which stops as asked.
  const { code, started, waits } = await run([{ code: EXIT_CRASHED }, { code: 0 }]);
  assert.equal(code, 0);
  assert.deepEqual(started, [0, 1], "the second worker told it is a restart");
  assert.deepEqual(waits, [1000]);
}
{ // Stopped, or ended by another process (gallery stop's kill: 1, or a signal): never brought back.
  assert.deepEqual((await run([{ code: 0 }])).started, [0]);
  assert.equal((await run([{ code: 1 }])).code, 1);
  assert.deepEqual((await run([{ signal: "SIGTERM" }])).started, [0]);
}
{ // Never served (its port taken, or a crash while starting): ended with its code, for the command to report.
  const failed = await run([{ listen: false, code: 1 }]);
  assert.deepEqual([failed.code, failed.started], [1, [0]]);
  const crashed = await run([{ listen: false, code: EXIT_CRASHED }]);
  assert.deepEqual([crashed.code, crashed.started], [EXIT_CRASHED, [0]]);
}
{ // Crashing again and again: the waits grow, then it gives up.
  const plans = Array.from({ length: DELAYS.length + 1 }, () => ({ code: EXIT_CRASHED }));
  const { code, started, waits } = await run(plans);
  assert.equal(code, EXIT_CRASHED);
  assert.equal(started.length, DELAYS.length + 1);
  assert.deepEqual(waits, DELAYS);
}
{ // A worker that served a while starts the count over.
  const plans = [{ code: EXIT_CRASHED }, { code: EXIT_CRASHED }, { code: EXIT_CRASHED, ran: STEADY + 1 }, { code: 0 }];
  assert.deepEqual((await run(plans)).waits, [1000, 2000, 1000]);
}
{ // After serving once, a worker that crashes before it serves (an upgrade's files still being written) is retried.
  assert.deepEqual((await run([{ code: EXIT_REPLACED }, { listen: false, code: EXIT_CRASHED }, { code: 0 }])).waits, [2000, 2000]);
}
{ // The package replaced: at least 2s for its files to settle.
  assert.deepEqual((await run([{ code: EXIT_REPLACED }, { code: 0 }])).waits, [2000]);
}
{ // Another Gallery server took over meanwhile: not started again.
  const { code, started } = await run([{ code: EXIT_CRASHED }], { others: async (pid) => pid === 1000 });
  assert.deepEqual([code, started], [0, [0]]);
}

// Real processes: workers over an IPC channel, told their restart count, the second started after the
// first crashed, the keeper ending as the second stops.
const root = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-supervisor-"));
try {
  const entry = path.join(root, "worker.mjs");
  const said = path.join(root, "said.txt");
  await fs.writeFile(entry, `import fs from "node:fs";
fs.appendFileSync(${JSON.stringify(said)}, process.argv.slice(2).join(" ") + " restarts=" + process.env.GALLERY_WORKER_RESTARTS + "\\n");
process.send({ type: "listening", port: 1 });
setTimeout(() => process.exit(process.env.GALLERY_WORKER_RESTARTS === "0" ? ${EXIT_CRASHED} : 0), 50);
`);
  const waits = [];
  const code = await supervise({ start: (restarts) => startWorker(entry, ["--port", "1"], restarts), others: async () => false, log: { log() {} }, signals: [], sleep: async (ms) => { waits.push(ms); } });
  assert.equal(code, 0);
  assert.deepEqual(waits, [1000]);
  assert.deepEqual((await fs.readFile(said, "utf8")).trim().split("\n"), ["--port 1 --worker restarts=0", "--port 1 --worker restarts=1"]);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

console.log("Checked the server's keeper: which ends start another worker (a crash, the package replaced, abort, an NTSTATUS crash, a crash signal) and which never do (stopped, ended by another process, a signal, never served), the waits growing and giving up, the count starting over after a steady run, retrying an upgrade's worker that crashed before serving, another server taking over, and real workers over IPC told their restart count.");
