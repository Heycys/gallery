import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSkill, packageSkill, SKILL_FILES, skillRange } from "../../src/cli/package-skill.mjs";
import { kindOf, targetsOf } from "../../src/cli/skill.mjs";
import { recordOf } from "../../src/cli/skill-record.mjs";
import { skillLine } from "../../src/cli/updates.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { readZip } from "../../src/transfer/zip.mjs";

// gallery skill install (src/cli/skill.mjs) and the skill it writes (src/cli/package-skill.mjs), run as
// a user runs the command (src/cli/bin.mjs), each run with a home of its own: HOME, USERPROFILE,
// CLAUDE_CONFIG_DIR and CODEX_HOME all temporary folders (never this user's: Claude Code reads its
// skills from CLAUDE_CONFIG_DIR when that is set), and a workspace of its own. Into --dir: written
// once (the skill buildSkill makes, file for file), a second time nothing changed, over an older
// Gallery skill replaced (its files gone, no folder of the swap left beside it), the workspace never
// made (nothing was copied into it). Refused, nothing changed, exit 1: a folder of something else, a
// git checkout, an older skill whose preview server runs. Over an older Gallery's skill (the whole
// tools) in Claude Code's skills folder, with another under its old name (html-report-studio) beside
// it and a skill of something else: their documents copied into the workspace (the old names kept),
// the recent versions and the exports too (an export whose name is taken left), each moved whole to
// <workspace>/.gallery/old-skill-<date>[-n]/ (a digest of each folder before and after), the other
// skill left, one Gallery skill in the folder. Which agents: those whose home is there, else Claude
// Code's; --agent one; --project the project's folders; --dir alone, and never with them; gallery
// --version saying nothing of the skills it wrote, and of one made older a line it answers. And
// skill:package's ZIP holds gallery/ and the skill's files alone, its SKILL.md saying the range.

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "skill-install-"));
const bin = path.join(projectRoot, "src", "cli", "bin.mjs");
const { version } = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
const { range } = skillRange(version);
let round = 0;

/** A fresh home (HOME, USERPROFILE, CLAUDE_CONFIG_DIR, CODEX_HOME under it: `agents` the ones made) and workspace. */
function setting({ agents = [] } = {}) {
  const base = path.join(temp, `run-${++round}`);
  const home = path.join(base, "home");
  fs.mkdirSync(home, { recursive: true });
  const claude = path.join(base, "claude-config");
  const codex = path.join(base, "codex-home");
  if (agents.includes("claude")) fs.mkdirSync(claude);
  if (agents.includes("codex")) fs.mkdirSync(codex);
  const workspace = path.join(base, "workspace");
  const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: claude, CODEX_HOME: codex, GALLERY_WORKSPACE: workspace, GALLERY_NO_PREVIEW: "1", GALLERY_NO_BROWSER: "1" };
  return { base, home, claude, codex, workspace, env };
}
const gallery = (args, { env, cwd = temp }) => {
  const result = spawnSync(process.execPath, [bin, ...args], { cwd, env, encoding: "utf8" });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr, lines: result.stdout.split(/\r?\n/).filter(Boolean) };
};
// A folder as its files and their hashes, to say that it is the same.
const digest = (folder) => fs.readdirSync(folder, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile())
  .map((entry) => path.join(entry.parentPath, entry.name)).map((file) => `${path.relative(folder, file).split(path.sep).join("/")} ${createHash("sha256").update(fs.readFileSync(file)).digest("hex")}`).sort();
const write = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const skillMd = (name) => `---\nname: ${name}\ndescription: "x"\n---\n\n# ${name}\n`;
/** An older Gallery skill, the whole tools, in `folder`: its SKILL.md named `name`, its documents `slugs`. */
function fatSkill(folder, { name = "gallery", slugs = ["a"], exports = [] } = {}) {
  write(path.join(folder, "SKILL.md"), skillMd(name));
  write(path.join(folder, "package.json"), '{ "name": "gallery", "version": "0.2.0" }\n');
  write(path.join(folder, "src", "cli", "new-report.mjs"), "// the old tools\n");
  for (const slug of slugs) {
    write(path.join(folder, "reports", slug, "report.html"), `<!doctype html><html><head><title>${slug}</title></head><body><main class="doc-page"><h1>${slug}</h1></main></body></html>\n`);
    write(path.join(folder, "reports", slug, "report.json"), `{ "title": "${slug}", "description": "d", "type": "report" }\n`);
    write(path.join(folder, "node_modules", ".cache", "report-edit", "history", slug, "1.html"), "an earlier version\n");
  }
  write(path.join(folder, "reports", "preferences.md"), "# 写作偏好\n\n旧的。\n");
  write(path.join(folder, "node_modules", "left-pad", "index.js"), "module.exports = 1;\n");
  for (const name of exports) write(path.join(folder, "exports", `${name}.html`), `<p>${name} from the old skill</p>\n`);
}

try {
  // ---------- the skill itself ----------
  const expected = path.join(temp, "expected");
  const files = buildSkill(expected, { version });
  const wanted = SKILL_FILES.flatMap((file) => (file === "sdk" ? fs.readdirSync(path.join(projectRoot, "skills", "gallery", "sdk")).map((name) => `sdk/${name}`) : [file]));
  assert.deepEqual([...files].sort(), [...wanted].sort(), "the skill holds SKILL_FILES and nothing else");
  assert.ok(!files.some((file) => /^(src|reports|node_modules)\/|^package(-lock)?\.json$/.test(file)), "no tools in the skill");
  assert.ok(fs.readFileSync(path.join(expected, "SKILL.md"), "utf8").includes(`npm i -g @heycys/gallery@${range}`), "its SKILL.md says the range");

  // skill:package's outputs, into a release folder of the test's own.
  const release = path.join(temp, "release");
  write(path.join(release, "npm", "kept.txt"), "release:build's\n");
  write(path.join(release, "gallery-skill-0.0.1.zip"), "an older one");
  write(path.join(release, "gallery", "PACKAGE-MANIFEST.json"), "{}");
  const made = packageSkill(release, { version });
  assert.equal(made.archive, path.join(release, `gallery-skill-${version}.zip`));
  assert.deepEqual(fs.readdirSync(release).sort(), ["PACKAGE-MANIFEST.json", `gallery-skill-${version}.zip`, `gallery-skill-${version}.zip.sha256`, "npm", "skill"].sort(), "only its own outputs replaced, release:build's left");
  const zipped = readZip(fs.readFileSync(made.archive));
  assert.deepEqual(zipped.map(({ name }) => name).sort(), files.map((file) => `gallery/${file}`).sort(), "the ZIP holds gallery/ and the skill's files alone");
  for (const { name, data } of zipped) assert.ok(data.equals(fs.readFileSync(path.join(expected, name.slice("gallery/".length)))), `${name} as the skill holds it`);
  assert.equal(fs.readFileSync(`${made.archive}.sha256`, "utf8"), `${made.sha256}  gallery-skill-${version}.zip\n`);
  const manifest = JSON.parse(fs.readFileSync(path.join(release, "PACKAGE-MANIFEST.json"), "utf8"));
  assert.equal(manifest.requires, `@heycys/gallery@${range}`);
  assert.equal(manifest.files.length, files.length);

  // ---------- --dir: fresh, again, over an older Gallery skill ----------
  {
    const { env, base, workspace } = setting();
    const target = path.join(base, "elsewhere", "gallery");
    const first = gallery(["skill", "install", "--dir", target], { env });
    assert.equal(first.code, 0, first.stderr);
    assert.deepEqual(first.lines, [`Installed the Gallery skill ${version}: ${target}`, "下一步：open a new Agent session to use it."]);
    assert.deepEqual(digest(target), digest(expected), "the skill as buildSkill makes it");
    const again = gallery(["skill", "install", "--dir", target], { env });
    assert.deepEqual([again.code, again.lines], [0, [`The Gallery skill ${version} is installed already, unchanged: ${target}`]]);
    // An older Gallery skill there: a file it had and this one has not goes.
    write(path.join(target, "references", "gone.md"), "an older reference\n");
    write(path.join(target, "SKILL.md"), skillMd("gallery"));
    const updated = gallery(["skill", "install", "--dir", target], { env });
    assert.deepEqual([updated.code, updated.lines], [0, [`Updated the Gallery skill ${version}: ${target}`, "下一步：open a new Agent session to use it."]], updated.stderr);
    assert.deepEqual(digest(target), digest(expected), "replaced whole");
    assert.deepEqual(fs.readdirSync(path.dirname(target)), ["gallery"], "no folder of the swap left beside it");
    assert.equal(fs.existsSync(workspace), false, "no workspace made: nothing was copied into one");
  }

  // ---------- refusals ----------
  {
    const { env, base } = setting();
    const other = path.join(base, "other");
    write(path.join(other, "README.md"), "someone's folder\n");
    const before = digest(other);
    const refused = gallery(["skill", "install", "--dir", other], { env });
    assert.equal(refused.code, 1);
    assert.match(refused.stderr, /holds something that is not a Gallery skill \(it holds no Gallery skill\): move it away, or pass --dir <another folder>\.\r?\nNothing was changed\./);
    assert.deepEqual(digest(other), before, "left as it was");
    // A git checkout of Gallery itself (it looks like an older skill: SKILL.md, package.json, src/) is never moved.
    const checkout = path.join(base, "checkout");
    fatSkill(checkout);
    write(path.join(checkout, ".git", "HEAD"), "ref: refs/heads/main\n");
    const git = gallery(["skill", "install", "--dir", checkout], { env });
    assert.equal(git.code, 1);
    assert.match(git.stderr, /\(it is a git checkout\)/);
    assert.ok(fs.existsSync(path.join(checkout, "src")), "the checkout left");
    assert.equal(kindOf(path.join(base, "nothing")).kind, "absent");
    fs.mkdirSync(path.join(base, "empty"));
    assert.equal(kindOf(path.join(base, "empty")).kind, "absent", "an empty folder is no content");
  }
  {
    // An older skill whose preview server runs (its announcement names a running process): refused, nothing moved or copied.
    const { env, claude, workspace } = setting({ agents: ["claude"] });
    const old = path.join(claude, "skills", "gallery");
    fatSkill(old);
    const sleeper = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" });
    try {
      write(path.join(old, "node_modules", ".cache", "report-edit", "servers", "0123456789abcdef.json"), JSON.stringify({ port: 4173, pid: sleeper.pid, reports: path.join(old, "reports") }));
      const before = digest(old);
      const refused = gallery(["skill", "install"], { env });
      assert.equal(refused.code, 1, refused.stdout);
      assert.ok(refused.stderr.includes(`has its preview server running (pid ${sleeper.pid}, port 4173): stop it first`), refused.stderr);
      assert.deepEqual(digest(old), before, "the old skill as it was");
      assert.equal(fs.existsSync(workspace), false, "nothing copied");
    } finally {
      sleeper.kill();
    }
  }

  // ---------- over older skills in Claude Code's skills folder ----------
  {
    const { env, claude, workspace } = setting({ agents: ["claude"] });
    const skills = path.join(claude, "skills");
    const old = path.join(skills, "gallery");
    const renamed = path.join(skills, "html-report-studio");
    const unrelated = path.join(skills, "pdf");
    fatSkill(old, { slugs: ["a", "taken"], exports: ["a", "taken"] });
    fatSkill(renamed, { name: "html-report-studio", slugs: ["b"] });
    write(path.join(unrelated, "SKILL.md"), skillMd("pdf"));
    // The workspace already holds a document and an export of the same names.
    write(path.join(workspace, "gallery.json"), '{ "gallery": "workspace", "version": 1 }\n');
    write(path.join(workspace, "taken", "doc.html"), "<h1>the workspace's own</h1>\n");
    write(path.join(workspace, "exports", "taken.html"), "the workspace's own export\n");
    const digests = [digest(old), digest(renamed)];
    const unrelatedBefore = digest(unrelated);
    const done = gallery(["skill", "install"], { env });
    assert.equal(done.code, 0, done.stderr);
    const day = new Date();
    const moved = path.join(workspace, ".gallery", `old-skill-${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`);
    const out = done.stdout;
    assert.equal(done.lines[0], `工作区：${workspace}`);
    for (const said of [
      `An older Gallery skill (the whole tools) is in ${old}: its documents go into the workspace, then it moves out of the skills folder.`,
      `  Copied 1 document from ${path.join(old, "reports")}: a`,
      "  Skipped (the slug is taken here, or the folder's name is no slug): taken",
      `  Exports: copied 1 file into ${path.join(workspace, "exports")}: a.html`,
      `  Exports not copied (the name is taken in ${path.join(workspace, "exports")}; they stay in the moved folder's exports/): taken.html`,
      `  Copied 1 document from ${path.join(renamed, "reports")}: b`,
      `Installed the Gallery skill ${version} for Claude Code: ${old}`,
      "下一步：open a new Agent session to use it.",
    ]) assert.ok(done.lines.includes(said), `says: ${said}\n${out}`);
    assert.ok(done.lines.some((line) => line.startsWith(`  Moved the old skill to ${moved} (`) && line.includes("its node_modules/") && line.includes("may be deleted")), out);
    assert.ok(done.lines.some((line) => line.startsWith(`  Moved the old skill to ${moved}-2 (`)), out);
    // The documents under their old names, their recent versions, the export; the workspace's own kept.
    assert.ok(fs.existsSync(path.join(workspace, "a", "report.html")) && !fs.existsSync(path.join(workspace, "a", "doc.html")), "an old document keeps its names");
    assert.ok(fs.existsSync(path.join(workspace, "b", "report.json")));
    assert.equal(fs.readFileSync(path.join(workspace, ".gallery", "state", "history", "a", "1.html"), "utf8"), "an earlier version\n");
    assert.equal(fs.readFileSync(path.join(workspace, "taken", "doc.html"), "utf8"), "<h1>the workspace's own</h1>\n");
    assert.equal(fs.readFileSync(path.join(workspace, "exports", "taken.html"), "utf8"), "the workspace's own export\n");
    assert.equal(fs.readFileSync(path.join(workspace, "exports", "a.html"), "utf8"), "<p>a from the old skill</p>\n");
    assert.equal(fs.readFileSync(path.join(workspace, "preferences.md"), "utf8"), "# 写作偏好\n\n旧的。\n", "写作偏好 copied from the first");
    // Each old skill moved whole (its node_modules too), never deleted; the other skill left; one Gallery skill.
    assert.deepEqual([digest(moved), digest(`${moved}-2`)].sort(), [...digests].sort(), "each old skill whole in .gallery/old-skill-*");
    assert.deepEqual(digest(unrelated), unrelatedBefore);
    assert.deepEqual(fs.readdirSync(skills).sort(), ["gallery", "pdf"]);
    assert.deepEqual(digest(old), digest(expected), "the thin skill where the old one was");
    const again = gallery(["skill", "install"], { env });
    assert.deepEqual([again.code, again.lines], [0, [`The Gallery skill ${version} for Claude Code is installed already, unchanged: ${old}`]], "idempotent");
  }

  // ---------- which agents ----------
  {
    const cwd = path.join(temp, "project");
    fs.mkdirSync(cwd, { recursive: true });
    const both = setting({ agents: ["claude", "codex"] });
    assert.deepEqual(targetsOf({ env: both.env, cwd }).map(({ target }) => target), [path.join(both.claude, "skills", "gallery"), path.join(both.codex, "skills", "gallery")], "every agent whose home is there");
    const done = gallery(["skill", "install"], { env: both.env });
    assert.equal(done.code, 0, done.stderr);
    assert.deepEqual(done.lines, [`Installed the Gallery skill ${version} for Claude Code: ${path.join(both.claude, "skills", "gallery")}`, `Installed the Gallery skill ${version} for Codex: ${path.join(both.codex, "skills", "gallery")}`, "下一步：open a new Agent session to use it."]);
    // gallery --version (the registry's check off) says nothing of the skills it wrote: they say this
    // version made them. Of one that says an older version, a line whose command brings it to this one.
    const versionLines = (env, at = temp) => gallery(["--version"], { env: { ...env, GALLERY_NO_UPDATE_CHECK: "1" }, cwd: at }).lines;
    assert.deepEqual(versionLines(both.env), [version], "the skills installed are this version's");
    const claudeSkill = path.join(both.claude, "skills", "gallery");
    fs.writeFileSync(path.join(claudeSkill, "SKILL.md"), fs.readFileSync(path.join(claudeSkill, "SKILL.md"), "utf8").replace(recordOf(version), recordOf("0.0.1")));
    assert.deepEqual(versionLines(both.env), [version, skillLine(claudeSkill, "0.0.1", version, false)]);
    assert.equal(gallery(["skill", "install"], { env: both.env }).code, 0);
    assert.deepEqual(versionLines(both.env), [version], "gallery skill install brought it to this version");
    const none = setting();
    assert.deepEqual(targetsOf({ env: none.env, cwd }).map(({ agent, target }) => [agent, target]), [["claude", path.join(none.claude, "skills", "gallery")]], "neither: Claude Code's");
    assert.deepEqual(targetsOf({ env: both.env, cwd, agent: "codex" }).map(({ target }) => target), [path.join(both.codex, "skills", "gallery")]);
    // With CLAUDE_CONFIG_DIR unset, Claude Code's home is ~/.claude.
    const homeOnly = { ...none.env };
    delete homeOnly.CLAUDE_CONFIG_DIR;
    const fromHome = spawnSync(process.execPath, ["--input-type=module", "-e", `import { targetsOf } from ${JSON.stringify(new URL("../../src/cli/skill.mjs", import.meta.url).href)}; console.log(targetsOf({ agent: "claude" })[0].target);`], { env: homeOnly, encoding: "utf8" });
    assert.equal(fromHome.stdout.trim(), path.join(none.home, ".claude", "skills", "gallery"), fromHome.stderr);
    // --project: the project's folders (those there, else Claude Code's).
    assert.deepEqual(targetsOf({ env: both.env, cwd, project: true }).map(({ target }) => target), [path.join(cwd, ".claude", "skills", "gallery")]);
    fs.mkdirSync(path.join(cwd, ".codex"));
    assert.deepEqual(targetsOf({ env: both.env, cwd, project: true }).map(({ target }) => target), [path.join(cwd, ".codex", "skills", "gallery")]);
    const project = gallery(["skill", "install", "--project", "--agent", "claude"], { env: both.env, cwd });
    assert.equal(project.code, 0, project.stderr);
    assert.deepEqual(digest(path.join(cwd, ".claude", "skills", "gallery")), digest(expected));
    assert.deepEqual(versionLines(both.env, cwd), [version], "the project's skill is this version's");
    // The command line.
    for (const [args, said] of [
      [["skill"], "Say what to do: gallery skill install."],
      [["skill", "remove"], "No such skill command: remove (install)."],
      [["skill", "install", "x"], "gallery skill install takes no other argument: x"],
      [["skill", "install", "--agent", "cursor"], "--agent is claude or codex, not cursor."],
      [["skill", "install", "--dir", "x", "--project"], "--dir names the skill's folder itself: not with --agent or --project."],
    ]) {
      const wrong = gallery(args, { env: both.env, cwd });
      assert.deepEqual([wrong.code, wrong.stderr.split(/\r?\n/).filter(Boolean)], [2, [said, "Usage: gallery skill install [--agent claude|codex] [--project] [--dir <path>]   (gallery skill --help says more)"]], args.join(" "));
    }
  }
} finally {
  fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5 });
}
console.log("Checked gallery skill install: the skill SKILL_FILES make (and skill:package's ZIP of it), written into --dir, again unchanged, over an older Gallery skill replaced; a folder of something else, a git checkout and an older skill whose server runs refused with nothing changed; older skills in Claude Code's folder (one under the old name) moved whole into the workspace's .gallery/ after their documents, recent versions and exports were copied; the agents' folders (homes there, CLAUDE_CONFIG_DIR, ~/.claude, --agent, --project), gallery --version finding the skills written this version's and one made older said, and the command line.");
