import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { examine, writable } from "../../src/cli/doctor.mjs";
import { attentionLine, readCommandLine, versionOf } from "../../src/cli/gallery.mjs";
import { attentionNotes, CACHE_FILE, npmStatus, registryOf, skillStates } from "../../src/cli/updates.mjs";
import { createReportFromStarter } from "../../src/render/reports.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { USAGE } from "../../src/cli/usage.mjs";

// gallery doctor (src/cli/doctor.mjs, docs/internals.md "Doctor") and the line the other commands end
// with when something needs handling (src/cli/gallery.mjs attentionLine, src/cli/updates.mjs
// attentionNotes): each check good, a problem or a note, a single next step by the order of the
// problems, the exit code and --json, the workspace never made, the cache read and the registry never
// asked, and the 需要处理 line said only when there is something to handle (and never with --json,
// doctor, serve or startup, nor under GALLERY_NO_UPDATE_CHECK).

const run = promisify(execFile);
const bin = path.join(projectRoot, "src", "cli", "bin.mjs");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-doctor-"));
const folder = (name) => path.join(root, name);
const VERSION = versionOf();
const OLD = "0.0.1";
const registry = "http://127.0.0.1:9/"; // nothing listens: no test here asks it

/** A SKILL.md of Gallery `version` (null: one that says none) in <home>/skills/gallery. */
async function skillIn(home, version) {
  const directory = path.join(home, "skills", "gallery");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, "SKILL.md"), `---\nname: gallery\n---\n${version ? `This skill is Gallery ${version}'s\n` : "no version here\n"}`);
  return directory;
}

/** An environment with the agents' homes and the update cache of the test's own, the cache holding `latest` (checked just now), or none. */
async function environment(name, { latest = null, off = true } = {}) {
  const base = folder(name);
  const env = {
    CLAUDE_CONFIG_DIR: path.join(base, "claude"), CODEX_HOME: path.join(base, "codex"), GALLERY_CACHE_DIR: path.join(base, "cache"),
    GALLERY_REGISTRY: registry, GALLERY_NO_UPDATE_CHECK: off ? "1" : "", CI: "", NO_UPDATE_NOTIFIER: "", GALLERY_BROWSER: process.execPath,
  };
  await fs.mkdir(env.CLAUDE_CONFIG_DIR, { recursive: true });
  await fs.mkdir(env.CODEX_HOME, { recursive: true });
  if (latest) {
    await fs.mkdir(env.GALLERY_CACHE_DIR, { recursive: true });
    await fs.writeFile(path.join(env.GALLERY_CACHE_DIR, CACHE_FILE), JSON.stringify({ checked: Date.now(), registry, latest }));
  }
  return { base, env, claude: env.CLAUDE_CONFIG_DIR, workspace: path.join(base, "ws") };
}

const gallery = async (args, env, { cwd = root } = {}) => {
  try {
    const { stdout, stderr } = await run(process.execPath, [bin, ...args], { cwd, timeout: 60000, env: { ...process.env, GALLERY_NO_BROWSER: "1", GALLERY_NO_AUTOSTART: "1", GALLERY_NO_PREVIEW: "1", ...env } });
    return { code: 0, stdout, stderr };
  } catch (error) {
    if (typeof error.code !== "number") throw error;
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
};
const linesOf = (text) => text.trimEnd().split(/\r?\n/);
const byId = (checks) => Object.fromEntries(checks.map((check) => [check.id, check]));

try {
  // ---------- examine: each check good, a problem or a note ----------
  {
    const { env, claude, workspace } = await environment("good");
    await fs.mkdir(workspace, { recursive: true });
    await skillIn(claude, VERSION);
    const good = await examine({ version: VERSION, workspace, how: "flag", env, cwd: root, node: "24.1.0", browser: { path: "/x/chrome" } });
    assert.equal(good.ok, true);
    assert.equal(good.next, null, "nothing to do: no next step");
    assert.deepEqual(good.checks.map(({ id, status }) => [id, status]), [["node", "ok"], ["gallery", "note"], ["skill", "ok"], ["workspace", "ok"], ["browser", "ok"]], "the update check is off here: a note");
    assert.deepEqual(Object.keys(good.checks[0]).slice(0, 3), ["id", "status", "text"], "id, status and text first in each check");
    assert.equal(byId(good.checks).workspace.path, workspace);
    assert.equal(byId(good.checks).workspace.writable, true);
    assert.deepEqual(byId(good.checks).skill.installed.map(({ folder: at, project, version, older }) => [at, project, version, older]), [[path.join(claude, "skills", "gallery"), false, VERSION, false]]);
    assert.ok(byId(good.checks).node.text.includes("24.1.0"));
  }

  // No skill found anywhere is a note, not a problem: the skill may be loaded some other way.
  {
    const { env, workspace } = await environment("no-skill");
    await fs.mkdir(workspace, { recursive: true });
    const none = await examine({ version: VERSION, workspace, env, cwd: root, browser: { path: "/x/chrome" } });
    assert.equal(byId(none.checks).skill.status, "note");
    assert.deepEqual(byId(none.checks).skill.installed, []);
    assert.equal(none.ok, true);
  }

  // A skill older than this gallery (or saying no version): the problem with the one next step; a project's with --project.
  {
    const { env, claude, workspace } = await environment("old-skill");
    await fs.mkdir(workspace, { recursive: true });
    await skillIn(claude, OLD);
    const old = await examine({ version: VERSION, workspace, env, cwd: root, browser: { path: "/x/chrome" } });
    assert.equal(old.ok, false);
    assert.equal(byId(old.checks).skill.status, "problem");
    assert.equal(old.next, "运行 gallery skill install，然后开一个新的会话");
    assert.equal(byId(old.checks).skill.installed[0].older, true);
    assert.ok(byId(old.checks).skill.text.includes(`Gallery ${OLD}`) && byId(old.checks).skill.text.includes(`比这个 gallery ${VERSION} 旧`));
    // A project's skill too (the current folder's .claude/): both commands in the one step.
    const project = folder("old-skill-project");
    await skillIn(path.join(project, ".claude"), null);
    const both = await examine({ version: VERSION, workspace, env, cwd: project, browser: { path: "/x/chrome" } });
    assert.equal(both.next, "运行 gallery skill install，再运行 gallery skill install --project，然后开一个新的会话");
    assert.ok(byId(both.checks).skill.text.includes("旧版 Gallery（没写版本）"));
    // Run by npx, where there is no gallery command: the npx form.
    const npx = await examine({ version: VERSION, workspace, env, cwd: root, npx: true, browser: { path: "/x/chrome" } });
    assert.equal(npx.next, `运行 npx -y @heycys/gallery@^${VERSION} skill install，然后开一个新的会话`);
  }

  // A skill newer than this gallery: this gallery is the one to update (the user asked first).
  {
    const { env, claude, workspace } = await environment("new-skill");
    await fs.mkdir(workspace, { recursive: true });
    await skillIn(claude, "8.0.0");
    const ahead = await examine({ version: VERSION, workspace, env, cwd: root, browser: { path: "/x/chrome" } });
    assert.equal(byId(ahead.checks).skill.status, "problem");
    assert.match(ahead.next, /^问过用户后运行 npm i -g @heycys\/gallery@\^8\.0\.0，把 gallery 升到技能的版本，然后开一个新的会话$/);
  }

  // npm's newer version, as the cache knows it, never asked: a problem to ask the user about, after the skill's.
  {
    const { env, claude, workspace } = await environment("npm-newer", { latest: "9.0.0", off: false });
    await fs.mkdir(workspace, { recursive: true });
    await skillIn(claude, VERSION);
    assert.deepEqual(npmStatus(VERSION, { env }), { off: false, latest: "9.0.0", newer: true, checking: false });
    const newer = await examine({ version: VERSION, workspace, env, cwd: root, browser: { path: "/x/chrome" } });
    assert.equal(byId(newer.checks).gallery.status, "problem");
    assert.equal(byId(newer.checks).gallery.latest, "9.0.0");
    assert.equal(newer.next, "问过用户后运行 npm i -g @heycys/gallery@^9.0.0，再运行 gallery skill install，然后开一个新的会话");
    await skillIn(claude, OLD);
    const first = await examine({ version: VERSION, workspace, env, cwd: root, browser: { path: "/x/chrome" } });
    assert.equal(first.next, "运行 gallery skill install，然后开一个新的会话", "the skill first: one step, the order of the problems");
    assert.equal(first.checks.filter((check) => check.status === "problem").length, 2, "both are said");
    // The cache knowing this version, or an older one: good, with what npm has.
    for (const latest of [VERSION, "0.1.0"]) {
      const same = await environment(`npm-same-${latest}`, { latest, off: false });
      await fs.mkdir(same.workspace, { recursive: true });
      const fine = await examine({ version: VERSION, workspace: same.workspace, env: same.env, cwd: root, browser: { path: "/x/chrome" } });
      assert.equal(byId(fine.checks).gallery.status, "ok");
      assert.equal(byId(fine.checks).gallery.latest, latest);
    }
    // A cache of another registry is not believed.
    assert.equal(npmStatus(VERSION, { env: { ...env, GALLERY_REGISTRY: "http://127.0.0.1:8/" } }).latest, null);
    assert.equal(registryOf(env), registry);
  }

  // The workspace: made or not, written or not, another program's gallery.json.
  {
    const { env, base } = await environment("workspace");
    const made = path.join(base, "made");
    await fs.mkdir(made);
    await fs.writeFile(path.join(made, "gallery.json"), JSON.stringify({ gallery: "workspace", version: 1 }));
    assert.deepEqual(await writable(made), { exists: true, writable: true });
    assert.deepEqual(await fs.readdir(made), ["gallery.json"], "the file it tried is taken away");
    const later = path.join(base, "not", "made", "yet");
    assert.deepEqual(await writable(later), { exists: false, writable: true }, "not made yet: the nearest folder above is the one tried");
    assert.equal(await fs.stat(path.join(base, "not")).then(() => true, () => false), false, "and nothing made");
    const asFile = path.join(base, "a-file");
    await fs.writeFile(asFile, "x");
    assert.equal((await writable(path.join(asFile, "inside"))).writable, false, "under a file: not writable");
    const foreign = path.join(base, "foreign");
    await fs.mkdir(foreign);
    await fs.writeFile(path.join(foreign, "gallery.json"), JSON.stringify({ name: "another program's" }));
    assert.equal((await writable(foreign)).foreign, "ours");
    const broken = path.join(base, "broken");
    await fs.mkdir(broken);
    await fs.writeFile(path.join(broken, "gallery.json"), "{ not json");
    assert.equal((await writable(broken)).foreign, "json");

    const none = await examine({ version: VERSION, workspace: later, how: "env", env, cwd: root, browser: { path: "/x/chrome" } });
    assert.equal(byId(none.checks).workspace.exists, false);
    assert.equal(byId(none.checks).workspace.status, "ok");
    assert.ok(byId(none.checks).workspace.text.includes("还没建") && byId(none.checks).workspace.text.includes("GALLERY_WORKSPACE"));
    const bad = await examine({ version: VERSION, workspace: path.join(asFile, "inside"), env, cwd: root, browser: { path: "/x/chrome" } });
    assert.equal(byId(bad.checks).workspace.status, "problem");
    assert.match(bad.next, /^给 Gallery 一个能写的文件夹：每条命令加 --workspace <文件夹>，或设环境变量 GALLERY_WORKSPACE$/);
    const other = await examine({ version: VERSION, workspace: foreign, env, cwd: root, browser: { path: "/x/chrome" } });
    assert.equal(byId(other.checks).workspace.status, "problem");
    assert.ok(byId(other.checks).workspace.text.includes("不是 Gallery 的") && other.next.startsWith("换一个文件夹放 Gallery 的文档"));
    const mended = await examine({ version: VERSION, workspace: broken, env, cwd: root, browser: { path: "/x/chrome" } });
    assert.ok(mended.next.startsWith(`修好 ${path.join(broken, "gallery.json")}`));
  }

  // No browser, and Node too old: the order of the problems (Node, workspace, skill, npm, browser).
  {
    const { env, claude, workspace } = await environment("order", { latest: "9.0.0", off: false });
    await skillIn(claude, OLD);
    await fs.mkdir(workspace, { recursive: true });
    const nothing = { path: null, why: "找不到 Chrome 或 Edge" };
    const all = await examine({ version: VERSION, workspace, env, cwd: root, node: "20.0.0", browser: nothing });
    assert.deepEqual(all.checks.map(({ id, status }) => [id, status]), [["node", "problem"], ["gallery", "problem"], ["skill", "problem"], ["workspace", "ok"], ["browser", "problem"]]);
    assert.ok(all.next.startsWith("装 Node 22.13 或更新的版本"), all.next);
    const noBrowser = await examine({ version: VERSION, workspace, env: { ...env, GALLERY_NO_UPDATE_CHECK: "1" }, cwd: root, browser: nothing });
    assert.equal(noBrowser.next, "运行 gallery skill install，然后开一个新的会话", "the skill before the browser");
    await skillIn(claude, VERSION);
    const last = await examine({ version: VERSION, workspace, env: { ...env, GALLERY_NO_UPDATE_CHECK: "1" }, cwd: root, browser: nothing });
    assert.equal(byId(last.checks).browser.status, "problem");
    assert.equal(byId(last.checks).browser.path, null);
    assert.match(last.next, /^装 Chrome 或 Edge，或用 GALLERY_BROWSER=<浏览器的可执行文件> 指一个；/);
  }

  // ---------- the command ----------
  assert.ok(USAGE.doctor.startsWith("Usage: gallery doctor [--json]") && !USAGE.doctor.includes("Not built yet"), "the usage is written");
  assert.deepEqual(readCommandLine(["doctor", "--json"]), { command: "doctor", argv: ["--json"], flag: null });
  {
    const { env, claude, workspace } = await environment("command");
    await skillIn(claude, VERSION);
    const missing = path.join(root, "command", "workspace-not-made"); // doctor makes no workspace
    const good = await gallery(["--workspace", missing, "doctor"], env);
    assert.equal(good.code, 0, good.stdout + good.stderr);
    const lines = linesOf(good.stdout);
    assert.ok(lines.every((line, at) => at === lines.length - 1 || /^(好|问题|提示)  /.test(line)), good.stdout);
    assert.equal(lines.at(-1), "一切正常。");
    assert.equal(lines.length, 6, `one line a check and the last: ${good.stdout}`);
    assert.equal(good.stderr, "");
    assert.equal(await fs.stat(missing).then(() => true, () => false), false, "no workspace made");
    assert.equal(await fs.stat(path.join(root, "command", "claude", "skills", "gallery", "SKILL.md")).then(() => true, () => false), true);

    // A problem: exit 1, one 下一步 line (the last).
    await skillIn(claude, OLD);
    const bad = await gallery(["--workspace", workspace, "doctor"], env);
    assert.equal(bad.code, 1, bad.stdout + bad.stderr);
    const text = linesOf(bad.stdout);
    assert.equal(text.filter((line) => line.startsWith("下一步：")).length, 1);
    assert.equal(text.at(-1), "下一步：运行 gallery skill install，然后开一个新的会话");
    assert.ok(text.some((line) => line.startsWith("问题  技能 ")));
    assert.ok(!text.includes("一切正常。"));

    // --json: one object, 2-space indented, the fields the usage says.
    const json = await gallery(["--workspace", workspace, "doctor", "--json"], env);
    assert.equal(json.code, 1);
    assert.ok(json.stdout.startsWith("{\n  \""), "indented by two spaces");
    const parsed = JSON.parse(json.stdout);
    assert.deepEqual(Object.keys(parsed), ["ok", "version", "workspace", "checks", "next"]);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.next, "运行 gallery skill install，然后开一个新的会话");
    assert.deepEqual(parsed.checks.map((check) => check.id), ["node", "gallery", "skill", "workspace", "browser"]);
    assert.ok(parsed.checks.every((check) => ["ok", "problem", "note"].includes(check.status) && typeof check.text === "string"));
    assert.equal(json.stdout.trimEnd().split("\n").filter((line) => line.startsWith("需要处理")).length, 0, "doctor says no 需要处理 line");
    await skillIn(claude, VERSION);
    const fine = JSON.parse((await gallery(["--workspace", workspace, "doctor", "--json"], env)).stdout);
    assert.deepEqual([fine.ok, fine.next], [true, null]);

    // A browser GALLERY_BROWSER names that is not there is a problem.
    const lost = await gallery(["--workspace", workspace, "doctor"], { ...env, GALLERY_BROWSER: path.join(root, "no-such-browser.exe") });
    assert.equal(lost.code, 1);
    assert.ok(lost.stdout.includes("GALLERY_BROWSER 指的") && linesOf(lost.stdout).at(-1).startsWith("下一步：装 Chrome 或 Edge"), lost.stdout);

    // A wrong option: exit 2, the usage's first line.
    const wrong = await gallery(["--workspace", workspace, "doctor", "--fix"], env);
    assert.equal(wrong.code, 2);
    assert.ok(wrong.stderr.includes("Unknown option: --fix") && wrong.stderr.includes("Usage: gallery doctor [--json]"), wrong.stderr);
  }

  // ---------- 需要处理: the line the other commands end with ----------
  {
    const old = await environment("notice", { off: false });
    await skillIn(old.claude, OLD);
    const line = "需要处理：装了的技能比这个 gallery 旧（运行 gallery doctor）";
    assert.deepEqual(attentionNotes(VERSION, { env: old.env, cwd: root }), ["装了的技能比这个 gallery 旧"]);
    const said = await gallery(["--workspace", old.workspace, "list"], old.env);
    assert.equal(said.code, 0, said.stdout + said.stderr);
    assert.equal(linesOf(said.stdout).at(-1), line, said.stdout);
    assert.equal(said.stdout.split(line).length - 1, 1, "once");
    assert.equal(said.stderr, "");
    // Under GALLERY_NO_UPDATE_CHECK, CI or NO_UPDATE_NOTIFIER: none.
    for (const off of [{ GALLERY_NO_UPDATE_CHECK: "1" }, { CI: "true" }, { NO_UPDATE_NOTIFIER: "1" }]) {
      const quiet = await gallery(["--workspace", old.workspace, "list"], { ...old.env, ...off });
      assert.ok(!quiet.stdout.includes("需要处理") && !quiet.stderr.includes("需要处理"), JSON.stringify(off));
    }
    // Not when nothing is to be handled: a skill of this version, a cache that knows no newer one.
    await skillIn(old.claude, VERSION);
    const fine = await gallery(["--workspace", old.workspace, "list"], old.env);
    assert.ok(!fine.stdout.includes("需要处理"), fine.stdout);
    // Not with --version (the version alone first), with help, nor after doctor.
    await skillIn(old.claude, OLD);
    assert.ok(!(await gallery(["help", "list"], old.env)).stdout.includes("需要处理"));
    const version = await gallery(["--version"], old.env);
    assert.equal(linesOf(version.stdout)[0], VERSION);
    assert.ok(linesOf(version.stdout).slice(1).every((each) => each.startsWith("技能：") || each.startsWith("新版本：")), version.stdout);
    assert.ok(!(await gallery(["--workspace", old.workspace, "doctor"], old.env)).stdout.includes("需要处理"));
    // Not after a wrong command line (exit 2).
    const wrong = await gallery(["--workspace", old.workspace, "list", "--nope"], old.env);
    assert.equal(wrong.code, 2);
    assert.ok(!wrong.stdout.includes("需要处理") && !wrong.stderr.includes("需要处理"));

    // A newer Gallery on npm, from the cache (the cache never asked: the registry above has no listener): no
    // command ends with it (the user, 2026-11-13: told once a task, not at the end of every command);
    // gallery --version says it (新版本：, which the Agent tells the user) and so does gallery doctor.
    const newer = await environment("notice-npm", { latest: "9.0.0", off: false });
    const npm = await gallery(["--workspace", newer.workspace, "list"], newer.env);
    assert.ok(npm.code === 0 && !npm.stdout.includes("需要处理") && !npm.stderr.includes("需要处理"), npm.stdout + npm.stderr);
    assert.deepEqual(attentionNotes(VERSION, { env: newer.env, cwd: root }), []);
    const told = await gallery(["--version"], newer.env);
    assert.ok(linesOf(told.stdout).some((line) => line.startsWith("新版本：npm 上有 Gallery 9.0.0")), told.stdout);
    // A skill older than gallery still is: the line names it alone.
    await skillIn(newer.claude, OLD);
    const twice = await gallery(["--workspace", newer.workspace, "list"], newer.env);
    assert.equal(linesOf(twice.stdout).at(-1), "需要处理：装了的技能比这个 gallery 旧（运行 gallery doctor）", "the skill alone");
    assert.deepEqual(skillStates(VERSION, { env: newer.env, cwd: root }).map(({ older }) => older), [true]);

    // The line itself: none with --json (a program reads it), serve or startup; the npx form of the command.
    const before = { ...process.env };
    Object.assign(process.env, newer.env);
    try {
      assert.equal(await attentionLine("list", ["--json"], VERSION), null);
      assert.equal(await attentionLine("list", ["--", "--json"], VERSION) === null, false, "after -- it is a word of the command's");
      assert.equal(await attentionLine("doctor", [], VERSION), null);
      assert.equal(await attentionLine("serve", [], VERSION), null);
      assert.equal(await attentionLine("startup", [], VERSION), null);
      assert.equal(await attentionLine("list", [], VERSION), "需要处理：装了的技能比这个 gallery 旧（运行 gallery doctor）");
    } finally {
      for (const key of Object.keys(newer.env)) {
        if (before[key] === undefined) delete process.env[key];
        else process.env[key] = before[key];
      }
    }
  }
  // ---------- gallery check: what used to be a rule an Agent kept by heart ----------
  // A made-up block id, an id moved onto the paragraph of a list item, and a folder marked "instructions": true
  // each fail the check with how to mend it (src/render/identity-checks.mjs); a document of ids Gallery made passes.
  {
    const { env, workspace } = await environment("identity");
    await fs.mkdir(workspace, { recursive: true });
    const make = async (slug, body) => {
      await createReportFromStarter(slug, `文档 ${slug}`, "说明", { directory: workspace });
      const file = path.join(workspace, slug, "doc.html");
      const starter = await fs.readFile(file, "utf8");
      const page = starter.replace(/\n[ \t]*<!-- Starter content:[^\n]*-->\n[ \t]*<section\b[^>]*\sdata-doc-placeholder\b[\s\S]*?<\/section>/, `\n    ${body}`);
      assert.notEqual(page, starter);
      await fs.writeFile(file, page);
      return file;
    };
    const good = await make("good", '<p data-block-id="k3xv9q2a">一段</p>\n    <ul><li data-block-id="aaaaaaaa">项</li></ul>');
    await make("invented", '<h2 data-block-id="intro">一节</h2>');
    await make("moved", '<ul>\n      <li><p data-block-id="k3xv9q2a">项</p></li>\n    </ul>');
    await make("hidden", "<p>一段</p>");
    const hiddenJson = path.join(workspace, "hidden", "doc.json");
    await fs.writeFile(hiddenJson, JSON.stringify({ ...JSON.parse(await fs.readFile(hiddenJson, "utf8")), instructions: true }, null, 2));
    const before = await fs.readFile(good, "utf8");

    const passing = await gallery(["--workspace", workspace, "check", "good"], env);
    assert.equal(passing.code, 0, passing.stdout + passing.stderr);
    assert.ok(passing.stdout.includes("OK   good") && passing.stdout.includes("Checked 1 document: 1 passed, 0 failed."), passing.stdout);

    const invented = await gallery(["--workspace", workspace, "check", "invented"], env);
    assert.equal(invented.code, 1);
    assert.match(invented.stderr, /FAIL invented: 1 problem\n  - data-block-id is not an id Gallery made: "intro" \(line \d+\); an id is eight lowercase letters and digits/);
    const moved = await gallery(["--workspace", workspace, "check", "moved"], env);
    assert.equal(moved.code, 1);
    assert.match(moved.stderr, /FAIL moved: 1 problem\n  - line \d+: the list item has no data-block-id but the paragraph in it has one \("k3xv9q2a", line \d+\)/);

    // A folder marked "instructions": true is no document to the workspace; named, or among all, it fails, saying so.
    const named = await gallery(["--workspace", workspace, "check", "hidden"], env);
    assert.equal(named.code, 1, named.stdout + named.stderr);
    assert.ok(named.stderr.includes('FAIL hidden: 1 problem\n  - doc.json says "instructions": true') && named.stderr.trimEnd().endsWith("1 document failed: hidden"), named.stderr);
    assert.ok(named.stdout.includes("Checked 1 document: 0 passed, 1 failed."), named.stdout);
    assert.equal((await gallery(["--workspace", workspace, "check", "hidden", "--allow-failures"], env)).code, 0);
    const mixed = await gallery(["--workspace", workspace, "check", "good", "hidden"], env);
    assert.equal(mixed.code, 1);
    assert.ok(mixed.stdout.includes("OK   good") && mixed.stderr.includes("FAIL hidden") && mixed.stderr.trimEnd().endsWith("1 document failed: hidden"), mixed.stdout + mixed.stderr);
    const every = await gallery(["--workspace", workspace, "check"], env);
    assert.equal(every.code, 1);
    assert.deepEqual([...every.stderr.matchAll(/^FAIL (\S+):/gm)].map(([, slug]) => slug).sort(), ["hidden", "invented", "moved"], "every one that fails, among all");
    assert.ok(every.stdout.includes("OK   good"), every.stdout);
    assert.equal(await fs.readFile(good, "utf8"), before, "check writes nothing");

    // Once the mark is out, the document is a document again.
    const { instructions, ...ordinary } = JSON.parse(await fs.readFile(hiddenJson, "utf8"));
    assert.equal(instructions, true);
    await fs.writeFile(hiddenJson, JSON.stringify(ordinary));
    const mended = await gallery(["--workspace", workspace, "check", "hidden"], env);
    assert.equal(mended.code, 0, mended.stdout + mended.stderr);

    // doc.json's title and icon follow the page: gallery check says so as a document with a title of its own in doc.json alone is written over by the export.
    const json = path.join(workspace, "good", "doc.json");
    await fs.writeFile(json, JSON.stringify({ ...JSON.parse(await fs.readFile(json, "utf8")), title: "手改的标题" }, null, 2));
    const retitled = await gallery(["--workspace", workspace, "check", "good"], env);
    assert.equal(retitled.code, 0, "a note, not a failure: the export mends it");
    assert.ok(retitled.stdout.includes("doc.json's title not as its h1 says it yet") && retitled.stdout.includes("change it with gallery set good --title … (it writes both), for what is put in doc.json alone is written over by the export"), retitled.stdout);
  }
  console.log("Checked gallery doctor: each check (Node, Gallery and npm's newer one from the cache, the skills older or newer, the workspace written or not and never made, the browser), one next step by the order of the problems, the exit code, --json; and the 需要处理 line the other commands end with: said once when a skill is older, never for a newer one on npm (gallery --version and doctor say that), none under GALLERY_NO_UPDATE_CHECK, with --json, help, --version, doctor or a wrong command line; and gallery check failing a made-up block id, an id moved onto a list item's paragraph and a folder marked \"instructions\": true, each with how to mend it, and noting that doc.json's title follows the page.");
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
