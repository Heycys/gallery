import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { projectRoot } from "../../src/shared/paths.mjs";

// The browser scenarios split over several runs at once (`node tests/browser/run.mjs --shards N`,
// docs/testing.md "Sharding"): each run is a run.mjs of its own, on a share of the scenarios, with its
// own range of GALLERY_TEST_PORTS and (harness.mjs) its own cache for Vite's optimized dependencies,
// so that none of them meets another's server. The shares are balanced by what each scenario took the
// last time (TIMES_FILE, which every run.mjs keeps up to date), the runs' summary lines and the failures
// of each are told in the end, and --retry runs what failed once more, alone, and says which passed
// only then. Nothing here starts a browser: the pieces that decide (the shares, the ranges, the
// arguments) are plain functions, which tests/unit/shards.mjs holds.

/** What each scenario took the last time it ran, in ms, by name (node_modules/.cache, shared by the worktrees). */
export const TIMES_FILE = path.join(projectRoot, "node_modules", ".cache", "scenario-times.json");
/** What a scenario nobody has timed costs in the balance, when no other scenario has a time to take a middle of. */
export const UNTIMED_MS = 8000;
/** The ports a run is given when GALLERY_TEST_PORTS names none: this many to each, from this one (above the dev servers' and the workspace servers'). */
export const DEFAULT_PORTS = { from: 4400, each: 40 };
/** A run needs at least this many ports of GALLERY_TEST_PORTS (a studio's server, and the servers some scenarios start beside it). */
export const LEAST_PORTS = 6;
/** Most runs at once: the machine's studios are 6 (harness.mjs GALLERY_TEST_STUDIOS), but a run waiting for one costs nothing. */
export const MOST_SHARDS = 16;

export class UsageError extends Error {}

/** The arguments of run.mjs: { shards (null: one run in this process), retry, names }. */
export function parseArguments(argv) {
  let shards = null;
  let retry = false;
  const names = [];
  for (let index = 0; index < argv.length; index++) {
    const word = argv[index];
    const inline = /^--shards=(.*)$/.exec(word);
    if (inline || word === "--shards") {
      const value = inline ? inline[1] : argv[++index];
      if (!/^\d+$/.test(value ?? "") || Number(value) < 1 || Number(value) > MOST_SHARDS) throw new UsageError(`--shards takes a number from 1 to ${MOST_SHARDS}, not ${JSON.stringify(value ?? "")}.`);
      shards = Number(value);
    } else if (word === "--retry") retry = true;
    else if (word.startsWith("--")) throw new UsageError(`Unknown option ${word}: run.mjs takes --shards N, --retry and scenario names.`);
    else names.push(word);
  }
  if (retry && shards === null) throw new UsageError("--retry goes with --shards N (a single run is run again by running it again).");
  return { shards, retry, names };
}

/** What each scenario took the last time (an object by name; nothing on a missing or unreadable file). */
export function readTimes(file = TIMES_FILE) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, ms]) => Number.isFinite(ms) && ms >= 0));
  } catch {
    return {};
  }
}

/**
 * Put the times of a run ([[name, ms], …]) into the file, over what it held (read again now: several
 * runs end at about the same time, each adds its own scenarios), by a file written and renamed.
 */
export function recordTimes(durations, file = TIMES_FILE) {
  if (durations.length === 0) return;
  try {
    const times = { ...readTimes(file), ...Object.fromEntries(durations.map(([name, ms]) => [name, Math.round(ms)])) };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(times, null, 1)}\n`);
    fs.renameSync(temporary, file);
  } catch {} // the balance of a later run is the only loss
}

/**
 * The scenarios `names` (in the order run.mjs runs them, `all`) in at most `count` shares of about the
 * same time: the longest first, each into the share with the least so far. An untimed scenario costs the
 * middle of the timed ones. Each share keeps `all`'s order. [{ names, ms }], never an empty share.
 */
export function planShards(names, times, count, all = names) {
  const known = names.map((name) => times[name]).filter((ms) => Number.isFinite(ms)).sort((a, b) => a - b);
  const guess = known.length ? known[Math.floor(known.length / 2)] : UNTIMED_MS;
  const cost = (name) => (Number.isFinite(times[name]) ? times[name] : guess);
  const shares = Array.from({ length: Math.max(1, Math.min(count, names.length)) }, () => ({ names: [], ms: 0 }));
  for (const name of [...names].sort((a, b) => cost(b) - cost(a) || all.indexOf(a) - all.indexOf(b))) {
    const share = shares.reduce((least, one) => (one.ms < least.ms ? one : least));
    share.names.push(name);
    share.ms += cost(name);
  }
  for (const share of shares) share.names.sort((a, b) => all.indexOf(a) - all.indexOf(b));
  return shares;
}

/**
 * The GALLERY_TEST_PORTS of each of `count` runs: GALLERY_TEST_PORTS ("5300-5399", `spec`) cut into equal
 * parts when it is set, else DEFAULT_PORTS' ranges. ["low-high", …].
 */
export function portRanges(spec, count) {
  if (spec === undefined || spec === "") return Array.from({ length: count }, (_, index) => `${DEFAULT_PORTS.from + index * DEFAULT_PORTS.each}-${DEFAULT_PORTS.from + (index + 1) * DEFAULT_PORTS.each - 1}`);
  const range = /^(\d+)-(\d+)$/.exec(spec);
  if (!range || Number(range[1]) > Number(range[2])) throw new UsageError(`GALLERY_TEST_PORTS is ${JSON.stringify(spec)}: it should be a range, as 5300-5399.`);
  const low = Number(range[1]);
  const each = Math.floor((Number(range[2]) - low + 1) / count);
  if (each < LEAST_PORTS) throw new UsageError(`GALLERY_TEST_PORTS ${spec} has ports for ${Math.floor((Number(range[2]) - low + 1) / LEAST_PORTS)} runs of ${LEAST_PORTS} each, not ${count}: widen it or ask for fewer shards.`);
  return Array.from({ length: count }, (_, index) => `${low + index * each}-${low + (index + 1) * each - 1}`);
}

/** What a run's output says, line by line: which scenario it is in, the FAIL lines, its summary. */
export function createReader(list) {
  const state = { current: null, started: new Set(), finished: new Set(), fails: [], failed: new Set(), summary: "", tail: [] };
  const finish = () => {
    if (state.current) state.finished.add(state.current);
    state.current = null;
  };
  state.line = (line) => {
    state.tail.push(line); // the last lines, told when a run stopped with no summary
    if (state.tail.length > 6) state.tail.shift();
    const heading = /^# (\S+)$/.exec(line);
    if (heading && list.includes(heading[1])) {
      finish();
      state.current = heading[1];
      state.started.add(heading[1]);
    } else if (/^\s+FAIL /.test(line)) {
      state.fails.push({ scenario: state.current, line: line.trim() });
      if (state.current) state.failed.add(state.current);
    } else if (/^(Checked \d+ browser scenario|\d+ check\(s\) failed in )/.test(line)) {
      finish();
      state.summary = line;
    }
  };
  /** The scenarios of the run that failed: those with a FAIL line, and when it stopped with no summary the one it stopped in and those after. */
  state.failures = () => new Set([...state.failed, ...(state.summary ? [] : list.filter((name) => !state.finished.has(name)))]);
  return state;
}

// Run one share as a run.mjs of its own, its output written to `file`; resolves with what the reader made of it.
function runShare({ label, list, ports, file, entry, onProgress }) {
  return new Promise((resolve) => {
    const out = fs.createWriteStream(file);
    const child = spawn(process.execPath, [entry, ...list], { cwd: projectRoot, env: { ...process.env, GALLERY_TEST_PORTS: ports, GALLERY_TEST_KIT_BUILT: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    const reader = createReader(list);
    let said = 0;
    createInterface({ input: child.stdout }).on("line", (line) => {
      out.write(`${line}\n`);
      reader.line(line);
      if (reader.finished.size >= said + 25) { said = reader.finished.size; onProgress?.(label, said, list.length); }
    });
    createInterface({ input: child.stderr }).on("line", (line) => { out.write(`${line}\n`); reader.line(line); });
    child.on("error", (error) => out.write(`${error.stack ?? error.message}\n`));
    child.on("close", (code) => out.end(() => resolve({ label, list, ports, file, code, reader })));
    runShare.children.add(child);
    child.on("close", () => runShare.children.delete(child));
  });
}
runShare.children = new Set();

/**
 * The scenarios `names` (of `all`) in `shards` runs at once, then the account of them; with `retry`, what
 * failed once more in one run. Resolves with the process's exit code: 0 all passed (a failure that passed on
 * retry is told, and counts as passed), 1 something failed.
 */
export async function runSharded({ names, all, shards, retry, entry, log = console.log }) {
  const ports = portRanges(process.env.GALLERY_TEST_PORTS, Math.min(shards, names.length));
  const shares = planShards(names, readTimes(), shards, all);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const directory = path.join(os.tmpdir(), "gallery-shards", `${stamp}-${process.pid}`);
  fs.mkdirSync(directory, { recursive: true });
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { for (const child of runShare.children) child.kill(); process.exit(130); });
  log(`${names.length} scenario(s) in ${shares.length} run(s); each run's whole output in ${directory}`);
  shares.forEach((share, index) => log(`  run ${index + 1}: ${share.names.length} scenario(s), about ${Math.round(share.ms / 1000)}s, ports ${ports[index]}`));
  // The shared kit once, for all of them (GALLERY_TEST_KIT_BUILT: the harness does not build it again, the runs would write the same files at once).
  const built = spawnSync(process.execPath, [path.join(projectRoot, "src", "cli", "build-kit.mjs")], { cwd: projectRoot, encoding: "utf8" });
  if (built.status !== 0) {
    log(["The shared kit did not build:", built.stdout, built.stderr].join("\n"));
    return 1;
  }
  const began = Date.now();
  const progress = (label, done, total) => log(`  ${label}: ${done}/${total} done`);
  const results = await Promise.all(shares.map((share, index) => runShare({ label: `run ${index + 1}`, list: share.names, ports: ports[index], file: path.join(directory, `run-${index + 1}.log`), entry, onProgress: progress })));

  const failed = new Set();
  for (const result of results) {
    log(`\n${result.label} (exit ${result.code}): ${result.reader.summary || "no summary line: the run stopped early, read its output"}\n  ${result.file}`);
    for (const { scenario, line } of result.reader.fails) log(`  ${scenario ?? "(before the first scenario)"}: ${line}`);
    if (!result.reader.summary) for (const line of result.reader.tail) log(`  | ${line}`);
    for (const name of result.reader.failures()) failed.add(name);
    if (result.code !== 0 && result.reader.failures().size === 0) for (const name of result.list) failed.add(name); // exited badly saying nothing: all of its are in doubt
  }
  const seconds = Math.round((Date.now() - began) / 1000);
  log(`\n${names.length} scenario(s) in ${shares.length} run(s), ${seconds}s: ${failed.size ? `${failed.size} failed: ${[...failed].join(" ")}` : "all passed"}`);
  if (failed.size === 0) return 0;
  if (!retry) return 1;

  const again = [...failed].sort((a, b) => all.indexOf(a) - all.indexOf(b));
  log(`\n--retry: ${again.join(" ")} once more, in one run`);
  const [range] = portRanges(process.env.GALLERY_TEST_PORTS, 1);
  const second = await runShare({ label: "retry", list: again, ports: range, file: path.join(directory, "retry.log"), entry });
  log(`retry (exit ${second.code}): ${second.reader.summary || "no summary line: the run stopped early, read its output"}\n  ${second.file}`);
  for (const { scenario, line } of second.reader.fails) log(`  ${scenario ?? "(before the first scenario)"}: ${line}`);
  if (!second.reader.summary) for (const line of second.reader.tail) log(`  | ${line}`);
  const still = second.reader.failures();
  if (second.code !== 0 && still.size === 0) for (const name of again) still.add(name);
  const only = again.filter((name) => !still.has(name));
  if (only.length) log(`Failed in the split runs and passed only on retry (flaky, or bound by the load of a shared machine): ${only.join(" ")}`);
  if (still.size) log(`Failed on retry too: ${[...still].join(" ")}`);
  else log("Everything passed once the failures were run again.");
  return still.size ? 1 : 0;
}
