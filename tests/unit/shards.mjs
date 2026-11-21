import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { projectRoot } from "../../src/shared/paths.mjs";
import { DEFAULT_PORTS, LEAST_PORTS, MOST_SHARDS, UsageError, createReader, parseArguments, planShards, portRanges, readTimes, recordTimes } from "../browser/shards.mjs";

// run.mjs --shards (tests/browser/shards.mjs, docs/testing.md "Sharding"): what decides before any browser
// starts. The arguments, the shares balanced by each scenario's last time (an untimed one the middle of the
// timed), the port range of each run (GALLERY_TEST_PORTS cut into equal parts, else the default ranges, none
// shared, and refused where it is too narrow), the times file merged and written whole, and the reading of a
// run's output (the scenario it is in, the FAIL lines, the summary; a run that stopped with no summary has
// failed the scenario it stopped in and those after it). The harness and the Vite config the cache is
// held to by their text, as the scenarios of a run cannot say it: a studio's server gets a cache of its own.

// ---------- the arguments ----------
assert.deepEqual(parseArguments([]), { shards: null, retry: false, names: [] });
assert.deepEqual(parseArguments(["save", "merge"]), { shards: null, retry: false, names: ["save", "merge"] });
assert.deepEqual(parseArguments(["--shards", "4", "save"]), { shards: 4, retry: false, names: ["save"] });
assert.deepEqual(parseArguments(["save", "--shards=3", "--retry", "merge"]), { shards: 3, retry: true, names: ["save", "merge"] });
for (const bad of [["--shards"], ["--shards", "0"], ["--shards", "x"], ["--shards", String(MOST_SHARDS + 1)], ["--shards=2.5"], ["--retry"], ["--nope"]]) {
  assert.throws(() => parseArguments(bad), UsageError, `refused: ${bad.join(" ")}`);
}

// ---------- the shares ----------
const all = Array.from({ length: 40 }, (_, index) => `s${String(index).padStart(2, "0")}`);
const times = Object.fromEntries(all.map((name, index) => [name, 1000 + ((index * 7919) % 31) * 700]));
const total = (names, one = times) => names.reduce((sum, name) => sum + one[name], 0);
for (const count of [1, 2, 3, 4, 6, 8]) {
  const shares = planShards(all, times, count);
  assert.equal(shares.length, count);
  assert.deepEqual(shares.flatMap((share) => share.names).sort(), [...all].sort(), `${count} shares: every scenario once`);
  for (const share of shares) assert.deepEqual(share.names, all.filter((name) => share.names.includes(name)), "each share in the order run.mjs runs them");
  for (const share of shares) assert.equal(share.ms, total(share.names), "a share says its time");
  const longest = Math.max(...all.map((name) => times[name]));
  const spread = Math.max(...shares.map((share) => share.ms)) - Math.min(...shares.map((share) => share.ms));
  assert.ok(spread <= longest, `${count} shares: no more apart than the longest scenario (${spread} of ${longest})`);
}
assert.equal(planShards(["a", "b"], {}, 5).length, 2, "never a share with nothing in it");
assert.equal(planShards([], {}, 3).length, 1, "no scenario: one empty share, which runs nothing");
// An untimed scenario costs the middle of the timed ones, and with no time at all they are all alike.
const guessed = planShards(["a", "b", "c", "d"], { a: 100, b: 9000, c: 5000 }, 2);
assert.deepEqual(guessed.map((share) => share.ms).sort((x, y) => x - y), [9100, 10000], "the longest first, each into the least: 9000 and 100, 5000 and the untimed d's 5000");
assert.equal(guessed.reduce((sum, share) => sum + share.ms, 0), 100 + 9000 + 5000 + 5000, "an untimed scenario counts as the middle of the timed (5000)");
const alike = planShards(["a", "b", "c", "d"], {}, 2);
assert.deepEqual(alike.map((share) => share.names.length), [2, 2], "untimed alike: split evenly");
// A longer list than the one run.mjs runs: the order is `all`'s.
assert.deepEqual(planShards(["z", "y"], {}, 1, ["y", "z"])[0].names, ["y", "z"]);

// ---------- the ports ----------
assert.deepEqual(portRanges(undefined, 3), [0, 1, 2].map((index) => `${DEFAULT_PORTS.from + index * DEFAULT_PORTS.each}-${DEFAULT_PORTS.from + (index + 1) * DEFAULT_PORTS.each - 1}`), "no GALLERY_TEST_PORTS: the default ranges");
assert.deepEqual(portRanges("", 1), [`${DEFAULT_PORTS.from}-${DEFAULT_PORTS.from + DEFAULT_PORTS.each - 1}`]);
assert.deepEqual(portRanges("5300-5399", 4), ["5300-5324", "5325-5349", "5350-5374", "5375-5399"], "a range cut into equal parts");
assert.deepEqual(portRanges("5300-5399", 1), ["5300-5399"], "one run keeps all of it");
assert.deepEqual(portRanges("5300-5310", 1), ["5300-5310"]);
{
  const ranges = portRanges("5300-5399", 3).map((range) => range.split("-").map(Number));
  for (let index = 1; index < ranges.length; index++) assert.ok(ranges[index][0] > ranges[index - 1][1], "no two runs share a port");
  const defaults = portRanges(undefined, MOST_SHARDS).map((range) => range.split("-").map(Number));
  for (let index = 1; index < defaults.length; index++) assert.ok(defaults[index][0] > defaults[index - 1][1], "nor do the default ranges");
}
assert.throws(() => portRanges("5300-5310", 4), (error) => error instanceof UsageError && /widen it or ask for fewer/.test(error.message), `too narrow for ${LEAST_PORTS} ports each`);
for (const bad of ["abc", "5400-5300", "5300"]) assert.throws(() => portRanges(bad, 2), UsageError, `refused: ${bad}`);

// ---------- the times ----------
{
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-shards-test-"));
  try {
    const file = path.join(directory, "cache", "scenario-times.json");
    assert.deepEqual(readTimes(file), {}, "no file: no times");
    recordTimes([["a", 1200.4], ["b", 800]], file);
    assert.deepEqual(readTimes(file), { a: 1200, b: 800 }, "written whole, in whole ms");
    recordTimes([["b", 950], ["c", 40]], file);
    assert.deepEqual(readTimes(file), { a: 1200, b: 950, c: 40 }, "a later run adds to what is there and replaces what it ran again");
    recordTimes([], file);
    assert.deepEqual(readTimes(file), { a: 1200, b: 950, c: 40 }, "nothing run: nothing changed");
    assert.deepEqual(fs.readdirSync(path.dirname(file)), ["scenario-times.json"], "no temporary file left");
    fs.writeFileSync(file, "{ not json");
    assert.deepEqual(readTimes(file), {}, "a file that does not read: no times");
    recordTimes([["a", 5]], file);
    assert.deepEqual(readTimes(file), { a: 5 }, "and the next run writes it again");
    fs.writeFileSync(file, JSON.stringify({ a: 7, b: "x", c: -1, d: null }));
    assert.deepEqual(readTimes(file), { a: 7 }, "only numbers that are times are read");
    fs.writeFileSync(file, "[1, 2]");
    assert.deepEqual(readTimes(file), {}, "an array is no table of times");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

// ---------- reading a run's output ----------
{
  const list = ["alpha", "beta", "gamma"];
  const fed = (lines) => {
    const reader = createReader(list);
    for (const line of lines) reader.line(line);
    return reader;
  };
  const whole = fed(["Browser: chrome", "# alpha", "  PASS one", "# beta", "  FAIL two — {\"x\":1}", "  PASS three", "# gamma", "  PASS four", "Elapsed 3.0s", "1 check(s) failed in 3 scenario(s)."]);
  assert.deepEqual([...whole.failures()], ["beta"], "a FAIL line fails the scenario it is in");
  assert.deepEqual(whole.fails.map((fail) => fail.scenario), ["beta"]);
  assert.equal(whole.summary, "1 check(s) failed in 3 scenario(s).");
  const passed = fed(["# alpha", "  PASS one", "# beta", "  PASS two", "# gamma", "  PASS three", "Checked 3 browser scenario(s): all passed."]);
  assert.equal(passed.failures().size, 0);
  assert.equal(passed.summary, "Checked 3 browser scenario(s): all passed.");
  // A run that stopped with no summary: the scenario it was in and those it did not reach failed.
  const stopped = fed(["# alpha", "  PASS one", "# beta", "  PASS two"]);
  assert.deepEqual([...stopped.failures()].sort(), ["beta", "gamma"], "the run's end with no summary: beta (stopped in) and gamma (not reached)");
  const never = fed(["The preview server did not start:"]);
  assert.deepEqual([...never.failures()].sort(), list, "none started: all failed");
  // A heading that is no scenario of the run (a line the page printed) changes nothing; a FAIL before the first one is told, failing none.
  const stray = fed(["  FAIL first thing", "# not-ours", "# alpha", "  PASS ok", "Checked 1 browser scenario(s): all passed."]);
  assert.equal(stray.fails.length, 1);
  assert.equal(stray.fails[0].scenario, null);
  assert.equal(stray.failures().size, 0, "a FAIL before any scenario is told and fails none by name");
}

// ---------- the harness and Vite: a studio's server has a cache of its own ----------
{
  const vite = fs.readFileSync(path.join(projectRoot, "src", "vite.config.ts"), "utf8");
  assert.match(vite, /process\.env\.GALLERY_VITE_CACHE_DIR/, "src/vite.config.ts takes cacheDir from GALLERY_VITE_CACHE_DIR");
  assert.match(vite, /cacheDir/);
  const harness = fs.readFileSync(path.join(projectRoot, "tests", "browser", "harness.mjs"), "utf8");
  assert.match(harness, /GALLERY_VITE_CACHE_DIR: viteCacheOf\(root\)/, "the harness gives each studio's server one of its own");
  assert.match(harness, /vite-test/, "under node_modules/.cache, taken away with the studio");
  assert.match(harness, /GALLERY_TEST_KIT_BUILT/, "and builds the kit unless a launcher did");
}

console.log("Checked run.mjs --shards: the arguments, the shares balanced by the last times (an untimed scenario the middle), the port ranges (none shared, refused when too narrow), the times file merged and written whole, a run's output read (its scenario, FAIL lines, summary, a run that stopped with none), and a Vite cache of each studio's own.");
