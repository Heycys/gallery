import { Worker } from "node:worker_threads";
import { refusal, said } from "../shared/i18n/index.mjs";

// The conversion worker (worker.mjs): started when a job comes, one job after another, stopped when
// idle for a minute (its jsdom documents with it). A job that fails rejects with the worker's message
// (said()'s text and values with it, when the error carried them: worker.mjs). Its heap is held to WORKER_HEAP:
// a file made to fill the memory ends the worker (its job failing, 转换进程意外退出), never the server it runs in.

const IDLE = 60_000;
const WORKER_HEAP = { maxOldGenerationSizeMb: 2048, maxYoungGenerationSizeMb: 64 };
let worker = null;
let serial = 0;
let timer = 0;
const pending = new Map(); // id -> { resolve, reject }

function start() {
  // Of the process's own flags, none that only an --eval's string takes (--input-type: a process run as
  // node --input-type=module -e …, the tests' way, would have the worker refuse its file).
  const execArgv = process.execArgv.filter((flag) => !flag.startsWith("--input-type"));
  worker = new Worker(new URL("./worker.mjs", import.meta.url), { resourceLimits: WORKER_HEAP, execArgv });
  worker.on("message", ({ id, result, error }) => {
    const job = pending.get(id);
    if (!job) return;
    pending.delete(id);
    if (error) job.reject(Object.assign(new Error(error.message), error));
    else job.resolve(result);
    if (pending.size === 0) {
      worker?.unref(); // nothing to wait for: the process may end
      idle();
    }
  });
  const fail = (error) => {
    for (const job of pending.values()) job.reject(error);
    pending.clear();
    worker = null;
  };
  worker.on("error", fail);
  worker.on("exit", (code) => fail(refusal(said("转换进程意外退出（{0}）", code))));
}

function idle() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (pending.size === 0 && worker) {
      const stopping = worker;
      worker = null;
      stopping.removeAllListeners("exit");
      stopping.terminate();
    }
  }, IDLE);
  timer.unref?.();
}

/** Run job `type` with `payload` in the worker; its result. */
export function runJob(type, payload) {
  clearTimeout(timer);
  if (!worker) start();
  const id = ++serial;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.ref(); // a job pending keeps the process
    worker.postMessage({ id, type, payload });
  });
}
