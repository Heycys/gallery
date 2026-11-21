import "../unit/workspace-env.mjs"; // the tests' temporary workspace and data folder, unless GALLERY_WORKSPACE names a workspace
import { fileURLToPath } from "node:url";
import { createStudio } from "./harness.mjs";
import { cleanFixture, scenarios } from "./scenarios.mjs";
import { UsageError, parseArguments, recordTimes, runSharded } from "./shards.mjs";
import { sweepStaleTemp } from "../sweep-temp.mjs";

// Real-browser regression tests of the live preview and its editor, for maintainers (this
// directory is not in the release package). See docs/testing.md.
//
//   npm run test:browser                 every scenario
//   npm run test:browser -- save merge   the scenarios whose names are given
//   node tests/browser/run.mjs --shards 4 [--retry] [names]
//                                        the same scenarios in 4 runs at once (shards.mjs): each with ports and
//                                        a Vite cache of its own, balanced by the last time of each scenario,
//                                        then each run's summary, the failures, and with --retry the failed
//                                        ones once more, saying which passed only then
//
// Ends with the elapsed time (split into the studio's start, the scenarios and its stop) and the ten
// slowest scenarios (each one's time includes the reset of the studio before it), for planning a gate;
// every run keeps each scenario's time in node_modules/.cache/scenario-times.json, which --shards balances by.
//
// Needs an installed Chrome or Edge (GALLERY_BROWSER=<path to its executable> picks one).

sweepStaleTemp(); // what earlier runs left in the temporary folder (browser profiles of killed runs)

let parsed;
try {
  parsed = parseArguments(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof UsageError)) throw error;
  console.error(error.message);
  process.exit(2);
}
const only = parsed.names;
const unknown = only.filter((name) => !(name in scenarios));
if (unknown.length > 0) {
  console.error(`Unknown scenario: ${unknown.join(", ")}\nScenarios: ${Object.keys(scenarios).join(", ")}`);
  process.exit(2);
}
if (parsed.shards !== null) {
  const all = Object.keys(scenarios);
  try {
    process.exit(await runSharded({ names: only.length > 0 ? all.filter((name) => only.includes(name)) : all, all, shards: parsed.shards, retry: parsed.retry, entry: fileURLToPath(import.meta.url) }));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(error.message);
    process.exit(2);
  }
}

const started = Date.now();
let studio;
try {
  studio = await createStudio();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const ready = Date.now();
console.log(`Browser: ${studio.browser}`);
let failures = 0;
let ran = 0;
const durations = [];
let scenariosEnded = 0;
try {
  for (const [name, scenario] of Object.entries(scenarios)) {
    if (only.length > 0 && !only.includes(name)) continue;
    console.log(`# ${name}`);
    ran++;
    const began = Date.now();
    const t = await studio.begin({ ids: !cleanFixture.has(name) });
    try {
      await scenario(t);
    } catch (error) {
      t.fail(`stopped: ${error.stack ?? error.message}${error.cause ? `\n  caused by: ${error.cause.message ?? error.cause}` : ""}`);
    }
    const errors = t.takeErrors();
    t.check(errors.length === 0, "no page errors", errors.join(" | "));
    failures += t.failures;
    durations.push([name, Date.now() - began]);
  }
} finally {
  scenariosEnded = Date.now();
  await studio.close();
}
const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;
const ended = Date.now();
recordTimes(durations);
console.log(`Elapsed ${seconds(ended - started)} (start ${seconds(ready - started)}, scenarios ${seconds(scenariosEnded - ready)}, stop ${seconds(ended - scenariosEnded)}). Slowest of ${ran}:`);
for (const [name, ms] of durations.sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${seconds(ms).padStart(7)}  ${name}`);
console.log(failures > 0 ? `${failures} check(s) failed in ${ran} scenario(s).` : `Checked ${ran} browser scenario(s): all passed.`);
process.exit(failures > 0 ? 1 : 0);
