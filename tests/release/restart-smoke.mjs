import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

// The installed package's server and its keeper (src/server/supervisor.mjs), run last by the release
// smoke test (./smoke.mjs) once the package's files were compared: a crash (GALLERY_TEST_CRASH_AFTER)
// and the package replaced (its release.json changed) each bring a new server on the same port, which
// answers; gallery stop stops it for good, the keeper with it; the keeper ended, its server stops too.
// release.json is put back as it was installed at the end.
export async function restartSmoke({ bin, installed, temp, env, port, cwd }) {
  const data = path.join(temp, "data");
  const log = path.join(data, "logs", "server.log");
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const runs = (pid) => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === "EPERM"; } };
  const until = async (test, what, ms = 20000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await test()) return; await sleep(250); }
    assert.fail(`${what}, within ${ms} ms. The server's log:\n${fs.readFileSync(log, "utf8").split("\n").slice(-30).join("\n")}`);
  };
  const gallery = (args, extra = {}) => {
    const result = spawnSync(process.execPath, [bin, ...args], { cwd, env: { ...env, ...extra }, encoding: "utf8", timeout: 120_000 });
    assert.equal(result.status, 0, `gallery ${args.join(" ")}: exit ${result.status}\n${result.stdout}\n${result.stderr}`);
    return result;
  };
  const announced = () => { try { return JSON.parse(fs.readFileSync(path.join(data, "server.json"), "utf8")); } catch { return null; } };
  const answers = async () => { try { return (await fetch(`http://127.0.0.1:${port}/__gallery/workspace/info`)).status === 200; } catch { return false; } };
  const keeperOf = (pid) => {
    const all = [...fs.readFileSync(log, "utf8").matchAll(/listening on http:\/\/127\.0\.0\.1:(\d+)\/ \(pid (\d+), keeper (\d+)\)/g)];
    const line = all.findLast((match) => Number(match[2]) === pid);
    assert.ok(line, `the log says server ${pid}'s keeper`);
    return Number(line[3]);
  };
  const releaseFile = path.join(installed, "release.json");
  const releaseText = fs.readFileSync(releaseFile, "utf8");
  try {
    // A crash: the first worker throws out of a timer 3 s in; its keeper starts another on the same port.
    gallery(["open", "--no-browser"], { GALLERY_TEST_CRASH_AFTER: "3000" });
    const first = announced();
    assert.equal(first?.port, port, "the server on the smoke's port");
    const keeper = keeperOf(first.pid);
    await until(async () => { const now = announced(); return now && now.pid !== first.pid && runs(now.pid) && (await answers()); }, "a crashed server started again, answering");
    const second = announced();
    assert.equal(second.port, port, "on the same port");
    assert.equal(keeperOf(second.pid), keeper, "by the same keeper");
    assert.equal(runs(first.pid), false, "the crashed one gone");
    const said = fs.readFileSync(log, "utf8");
    assert.match(said, /the server failed \(its keeper starts it again\): Error: GALLERY_TEST_CRASH_AFTER/);
    assert.match(said, /the server ended \(exit 70\): starting it again in 1s/);

    // The package replaced (an upgrade's new release.json): the server stops, its keeper starts the package's new one.
    fs.writeFileSync(releaseFile, `${releaseText.trimEnd()}\n\n`);
    await until(async () => { const now = announced(); return now && now.pid !== second.pid && runs(now.pid) && (await answers()); }, "the server started again after its package was replaced", 30000);
    const third = announced();
    assert.equal(keeperOf(third.pid), keeper, "by the same keeper");
    assert.match(fs.readFileSync(log, "utf8"), /the server ended \(exit 75\): starting it again in 2s/);

    // gallery stop: the server and its keeper gone, and nothing started again.
    gallery(["stop"]);
    await until(() => !runs(third.pid) && !runs(keeper), "the server and its keeper gone after gallery stop");
    await sleep(3000);
    assert.equal(announced(), null, "no server announced after gallery stop");
    assert.equal(await answers(), false, "nothing answers after gallery stop");

    // The keeper ended by another process: its server stops too (on Windows the system ends it with its
    // keeper, libuv's job object, before it can take its announcement away: one naming no running
    // process is no server's, readAnnouncement's rule, and the next command starts one as ever).
    gallery(["open", "--no-browser"]);
    const fourth = announced();
    const fourthKeeper = keeperOf(fourth.pid);
    process.kill(fourthKeeper);
    await until(() => !runs(fourth.pid), "the server stopped once its keeper was ended");
    await until(() => { const now = announced(); return now === null || !runs(now.pid); }, "its announcement naming no running server");
    gallery(["open", "--no-browser"]);
    await until(async () => { const now = announced(); return now && now.pid !== fourth.pid && runs(now.pid) && (await answers()); }, "gallery open starting a server again after that");
    gallery(["stop"]);
  } finally {
    const now = announced();
    if (now && runs(now.pid)) spawnSync(process.execPath, [bin, "stop"], { cwd, env, encoding: "utf8", timeout: 60_000 });
    fs.writeFileSync(releaseFile, releaseText);
  }
  console.log("Server keeper smoke passed: a crash and a replaced package each brought a new server on the same port by the same keeper; gallery stop stopped both for good; a keeper ended took its server with it.");
}
