import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import { promisify } from "node:util";
import { keepDropped } from "../../src/editor/dropped-annotations.mjs";
import { keepRewrite } from "../../src/editor/rewrites.mjs";
import { createEditService } from "../../src/editor/service.mjs";
import { findUnits, naturalize } from "../../src/editor/source.mjs";
import { commandArguments, documentArguments, openAsked, UsageError, usageFailureText } from "../../src/cli/arguments.mjs";
import { browserCommand } from "../../src/cli/browser-open.mjs";
import { readCommandLine, versionOf } from "../../src/cli/gallery.mjs";
import { HOME_NOT_MADE } from "../../src/cli/page.mjs";
import { buildSkill } from "../../src/cli/package-skill.mjs";
import { recordOf } from "../../src/cli/skill-record.mjs";
import { CACHE_FILE, cacheDirectory, checkOff, FRESH, latestUrl, newerLine, npmSettings, parseNpmrc, refreshEnv, registryOf, RETRY, skillFolders, skillLine, stale, versionNotes, viaNpx } from "../../src/cli/updates.mjs";
import { idLines } from "../../src/cli/hand-in.mjs";
import { browserLine, firstPort, FIRST_PORT, serverLine, USER_LINE } from "../../src/cli/server-process.mjs";
import { COMMANDS, OVERVIEW, TRY_SYNOPSIS, USAGE, helpText } from "../../src/cli/usage.mjs";
import { usedAssets } from "../../src/render/assets.mjs";
import { createReportFromStarter } from "../../src/render/reports.mjs";
import { pageId, pageLink } from "../../src/shared/page-links.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { serviceLocation } from "../../src/shared/service-location.mjs";
import { workspaceId } from "../../src/shared/workspace-registry.mjs";
import { announcePreviewServer, compareVersions, findPreviewServer, previewServerFor, sameDirectory } from "../../src/shared/preview-server.mjs";
import { createZip } from "../../src/transfer/zip.mjs";
import { createWorkspaceService } from "../../src/workbench/service.mjs";

// The gallery command (src/cli/bin.mjs, src/cli/gallery.mjs), each command run as a user runs it, in
// a workspace of its own (--workspace <dir>, which every command takes; GALLERY_WORKSPACE otherwise).
// The command line, read before anything is: --help and -h print the command's usage (src/cli/usage.mjs)
// and exit 0, as does gallery help <command>; an unknown command or option, a wrong number of
// arguments, no document named (check names none: every one), documents named with --all, a name that
// is not a slug ("Natural", "../outside") or one the workspace keeps (exports) print why, then the
// usage's first line and where the rest is (gallery <command> --help), and exit 2, none of them
// reading or writing a document. --version prints the version alone, fast (nothing but the
// dispatcher, the usage, package.json and its notes' module loaded), and so does the dispatcher run by itself;
// after it, a 技能 line for each Gallery skill where gallery skill install writes one (the agents' homes,
// the current folder's) older than this gallery or saying no version, with the command (--project for a
// project's), and a 新版本 line when the cache of the registry's answer knows a newer Gallery (none with
// GALLERY_NO_UPDATE_CHECK, CI or NO_UPDATE_NOTIFIER, which start no check either); a stale cache starts a
// detached check (a registry of the test's own on 127.0.0.1) that --version never waits for, claimed
// in the cache first so that no run meanwhile starts another, and none where the cache cannot be
// written; a registry that fails or answers no version leaves no line and no error; the registry and
// the proxy npm's own (a mirror and a proxy in the user's .npmrc); run by npx, both lines' npx form. init makes a workspace (gallery.json, .gallery/),
// once, and --from copies an older Gallery's documents into it, the old folder left byte for byte.
// new says where it wrote (the workspace), where 写作偏好 is (made from the default once, never over
// the user's, an empty one said so), the next steps, and last the server's address (left alone with
// --no-preview or GALLERY_NO_PREVIEW, which every command here runs with but where the test asks
// otherwise); its description is optional; a document that exists, the 写作偏好 page's slug, a link a
// document holds and a slug of the trash are refused. list lists the documents (the one edited last first; the 写作偏好 page and folders no
// command opens left out; a document's place in the tree when it is under another), or those words name (the best first, the
// titles' then the text's), its first line the workspace; --tree as the sidebar shows them, a document and those under it too.
// new --under, --after and --first place the new one in the tree (checked before anything is made); move moves one with
// those under it (no document's file changes), refusing a place under itself, an --after at another level, the 写作偏好
// page and what is not there, each at once with others (the outline's lock); set changes a title, an icon, a description
// in doc.html's header and doc.json alike, the rest of the file as it was.
// check reads a natural document as its preview shows it and leaves its file byte for byte (what the
// export will write said by line, the blocks it will give an id at their lines when they are few);
// export hands it in (the kit's markup and an id for every block, said by line; no line asking to re-read
// the file), and last the deliverable's absolute path; a document its quick checks fail is not written.
// Both say first, once, what the preview wrote when the reader edited and the 批注 it deleted. While
// the workspace's server runs, the hand-in is its (found by its announcement, however the directory
// is spelled; one whose process is gone leaves the command to write the file itself). A server keeps
// its announcement while it listens. gallery open finds that server by its announcement and, once it
// answers there as announced, gives the page's address, marked as the Agent's, and last the one to
// hand the user (the workbench's; new's and import's inside a sentence to send as it is); an
// announcement left behind is passed over, one whose port takes the request and gives no answer has
// no server started beside it, a port another workspace's server holds is never taken; an older
// Gallery's server (a command's) is replaced, a newer one or npm run dev's used. import makes
// documents of a Markdown file (its pictures copied, what it could not bring said by line), of a Word
// file, and of a zip of pages (one document each, nested in the outline as in the zip). No command here
// started a server (tests/unit/cli-server.mjs starts real ones).

const run = promisify(execFile);
const bin = path.join(projectRoot, "src", "cli", "bin.mjs");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-cli-"));
const reports = path.join(root, "reports");
const previousHome = process.env.GALLERY_DEFAULT_WORKSPACE;
process.env.GALLERY_DEFAULT_WORKSPACE = reports; // the workspace most commands here use
// A process that runs while the test does, standing for another server's (a server's process).
const sleeper = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", windowsHide: true });
// The gallery command in workspace `workspace` (its --workspace; null: none, the environment's).
// Every command leaves the server and the browser alone (GALLERY_NO_PREVIEW, GALLERY_NO_BROWSER), but where `env` asks otherwise.
// None reads this user's skills or cache, or asks a registry (what --version says after the version): the
// agents' homes and the cache are the test's, the registry's check off but where the test turns it on.
const quiet = { CLAUDE_CONFIG_DIR: path.join(root, "agents", "claude"), CODEX_HOME: path.join(root, "agents", "codex"), GALLERY_CACHE_DIR: path.join(root, "cache"), GALLERY_NO_UPDATE_CHECK: "1" };
const gallery = async (args, workspace = reports, env = {}) => {
  try {
    const { stdout, stderr } = await run(process.execPath, [bin, ...(workspace ? ["--workspace", workspace] : []), ...args], { cwd: root, timeout: 120000, env: { ...process.env, ...quiet, GALLERY_DEFAULT_WORKSPACE: workspace ?? reports, GALLERY_NO_PREVIEW: "1", GALLERY_NO_BROWSER: "1", ...env } });
    return { code: 0, stdout, stderr };
  } catch (error) {
    if (typeof error.code !== "number") throw error;
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
};
const linesOf = (text) => text.trimEnd().split(/\r?\n/);
const shownPath = (file) => path.resolve(file); // as the system writes it
// A digest of a folder's every file (path and bytes): what an old folder copied from must keep.
async function digestOf(directory) {
  const hash = createHash("sha256");
  const walk = async (folder) => {
    for (const entry of (await fs.readdir(folder, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) await walk(full);
      else hash.update(`${path.relative(directory, full)}\n`).update(await fs.readFile(full));
    }
  };
  await walk(directory);
  return hash.digest("hex");
}

try {
  // ---------- the command line, read in this process ----------
  // The dispatcher: --version, help, --workspace anywhere before "--" (twice the same is one), init's
  // <dir> its workspace, a command's --help; mistakes with the usage they are said with.
  assert.deepEqual(readCommandLine(["--version"]), { version: true });
  assert.deepEqual(readCommandLine([]), { help: OVERVIEW });
  assert.deepEqual(readCommandLine(["help", "qa"]), { help: USAGE.qa });
  assert.deepEqual(readCommandLine(["export", "a", "-h"]), { help: USAGE.export });
  assert.deepEqual(readCommandLine(["--workspace", "w", "check", "a"]), { command: "check", argv: ["a"], flag: "w" });
  assert.deepEqual(readCommandLine(["new", "a", "--workspace=w", "--", "-T", "--workspace", "x"]), { command: "new", argv: ["a", "--", "-T", "--workspace", "x"], flag: "w" }, "after -- every argument is the command's");
  assert.deepEqual(readCommandLine(["init", "here", "--from", "old"]), { command: "init", argv: ["here", "--from", "old"], flag: "here" }, "init's <dir> is its workspace");
  assert.deepEqual(readCommandLine(["init", "--from", "old"]).flag, null);
  assert.deepEqual(readCommandLine(["init", "--name", "项目", "here"]).flag, "here", "init's --name takes its value: the name is no folder");
  // gallery component is gallery block's other name: the same command, its usage the same.
  assert.deepEqual(readCommandLine(["component", "list"]), { command: "block", argv: ["list"], flag: null });
  // A command with subcommands says a line for each (gallery help block), or one in full (tests/unit/cli-pages-blocks.mjs); USAGE.block is the whole of it.
  assert.deepEqual(readCommandLine(["help", "component"]), { help: helpText("block").text });
  assert.deepEqual(readCommandLine(["component", "add", "--help"]), { help: helpText("block", "add").text });
  assert.ok(!COMMANDS.includes("component") && COMMANDS.includes("block") && USAGE.block.includes("gallery component … is another name for gallery block …"), "help names the one, and says the other");
  for (const [argv, error] of [
    [["bogus"], `No such command: bogus (${COMMANDS.join(", ")}).`],
    [["--tiles"], "Unknown option: --tiles (the command comes first: gallery <command> [options])."],
    [["help", "bogus"], `No such command: bogus (${COMMANDS.join(", ")}).`],
    [["check", "--workspace"], "--workspace takes a folder: --workspace <dir>"],
    [["--workspace", "a", "check", "--workspace", "b"], "Two workspaces named: a and b."],
    [["init", "a", "--workspace", "b"], "Two workspaces named: a and --workspace b."],
    [["init", "a", "b"], "Name one folder at most."],
    [["--version", "x"], "--version takes nothing else."],
  ]) assert.equal(readCommandLine(argv).error, error, argv.join(" "));
  // A command's options and slugs.
  assert.deepEqual(commandArguments({ options: ["--tiles"], values: ["--blocks"], argv: ["a", "--blocks=x,y", "--tiles", "--", "--b"] }), { positional: ["a", "--b"], options: new Set(["--tiles"]), values: new Map([["--blocks", "x,y"]]) });
  assert.deepEqual(commandArguments({ values: ["--blocks"], argv: ["--blocks", "x", "a"] }).values.get("--blocks"), "x");
  assert.throws(() => commandArguments({ values: ["--blocks"], argv: ["--blocks", "--tiles"] }), (error) => error instanceof UsageError && error.message === "--blocks takes a value");
  assert.throws(() => commandArguments({ argv: ["-x"] }), /Unknown option: -x/);
  await assert.rejects(documentArguments({ argv: ["exports"] }), /Not a document's slug: exports \(a name the workspace keeps for itself\)\./);
  await assert.rejects(documentArguments({ argv: [] }), /Name a document \(or pass --all\)\./);
  assert.equal(usageFailureText(USAGE.qa, "x"), `x\n${USAGE.qa.split("\n")[0]}   (gallery qa --help says more)`);
  assert.equal(usageFailureText("Usage: npm run skill:package", "x"), "x\nUsage: npm run skill:package   (npm run skill:package -- --help says more)");
  for (const command of COMMANDS) assert.ok(USAGE[command].startsWith(`Usage: gallery ${command}`), `${command}'s usage`);
  // gallery block's usage says what check prints and writes: the note on pinyin by the rule it
  // goes by, the way back line and its notes, and every picture it leaves (component-look.mjs), the
  // overviews first, as the Pictures line names them.
  {
    const component = USAGE.block.replace(/\s+/g, " ");
    for (const said of ["a note on a Chinese name no word of its words spells whole in pinyin, a syllable a character", "a way back line: what the component's example wrote", "a note on a write that lays a part out anew", "listens for dragover and not for dragenter", "overview-light.png and overview-dark.png, the three widths of a theme side by side", "each at 360, 736 and 1024px wide, light and dark", "edit-1024-light.png and edit-360-light.png, as the editing page draws it"]) {
      assert.ok(component.includes(said), `gallery block's usage says ${said}`);
    }
    assert.ok(!component.includes("spell in no pinyin"), "gallery block's usage says the pinyin rule check goes by");
    // check --documents: each document's instances, run as the example is, no document written.
    assert.ok(USAGE.block.includes("gallery block check <id> [--documents]"), "gallery block's usage gives check --documents");
    for (const said of ["--documents adds a section for each document of the workspace that holds instances of it", "each problem at its line of the document's file (board/doc.html:15)", "It writes no document."]) assert.ok(component.includes(said), `gallery block's usage says of check --documents ${said}`);
    // And try: its gestures, --then and --steps, the scratch copy it is made on, what it prints of each
    // write (its lines) and of the undos, the fresh page, the picture to open, and its exit codes. The
    // document named <slug>, as every other command and the guide name it, its link and a whole
    // address too; an instance in another's slot one of them.
    for (const form of ["--press <selector> [--then <key>] [--keep]", "--drag <selector> --to <selector> [--then <key>] [--keep]", "--key <selector> <key> [--then <key>] [--keep]", "--type <selector> <words> [--replace] [--then <key>] [--keep]", "--select <selector> <value> [--then <key>] [--keep]", "--steps <file> [--keep]"]) assert.ok(USAGE.block.includes(`gallery block try <slug> [<instance id>] ${form}`), `gallery block's usage gives try ${form}`);
    assert.ok(!USAGE.block.includes("<doc>") && !OVERVIEW.includes("<doc>"), "try names its document <slug>");
    for (const said of ["It makes it on a scratch copy of the document (<workspace>/.gallery/try/try-<8 hex>/, gone at the end, whatever came of it): doc.html is not written", "--keep makes it on the document itself and leaves what it wrote", "the copy's page alone, editable", "<slug> names the document, as its link or a whole address does too", "ASCII key by key and the rest through an input method, composed then committed", "an option of a <select>, by its value or its words", "--then <key> presses a key after it where the focus is", "--steps <file> makes several, one after another in one page: a JSON list of steps", "An instance in another's slot is one of them", "then those lines (- and +)", "Wrote: nothing of a step that wrote nothing", "the focus taken off a field of the instance first (a field that writes as it loses the focus writes then), and Ctrl+Z pressed once for each write the page took, the last first (each context.edit is an undo step of its own: a step that wrote twice takes two)", "write nothing as it opens (its file the same once it has come to edit)", "what it shows otherwise that is none of what the steps wrote (a filter or a tab chosen, an editor left open, words typed and not committed: what the page showed and never wrote) is a note", "Then it opens what the steps wrote in a fresh page", "<workspace>/.gallery/qa/<slug>/try/after.png", "open it when you want to see it", "Exits 1 when no step wrote anything", "shows what the steps wrote otherwise than the page did after them (fresh.png pictures it)", "one found at a step after others were made is said after what those wrote, which with --keep stays in doc.html", "a drag that ends on what it drags", "an option a <select> has not, a steps file that does not read"]) {
      assert.ok(component.includes(said), `gallery block's usage says of try ${said}`);
    }
    assert.ok(OVERVIEW.includes("gallery block try <slug> --press <selector>"), "help names gallery block try");
    // A mistake in a command line of try is said with try's lines of the usage.
    assert.equal(TRY_SYNOPSIS, ["Usage: gallery block try <slug> [<instance id>] --press <selector> [--then <key>] [--keep]", "       gallery block try <slug> [<instance id>] --drag <selector> --to <selector> [--then <key>] [--keep]", "       gallery block try <slug> [<instance id>] --key <selector> <key> [--then <key>] [--keep]", "       gallery block try <slug> [<instance id>] --type <selector> <words> [--replace] [--then <key>] [--keep]", "       gallery block try <slug> [<instance id>] --select <selector> <value> [--then <key>] [--keep]", "       gallery block try <slug> [<instance id>] --steps <file> [--keep]"].join("\n"));
    assert.equal(usageFailureText(USAGE.block, "x", TRY_SYNOPSIS), `x\n${TRY_SYNOPSIS}   (gallery block --help says more)`);
  }
  assert.ok(COMMANDS.every((command) => OVERVIEW.includes(`gallery ${command}`)), "help names every command");
  // The default candidate range starts at GALLERY_PORT or 8080; a saved port keeps priority.
  assert.equal(firstPort({}), FIRST_PORT);
  assert.equal(FIRST_PORT, 8080);
  assert.equal(firstPort({ GALLERY_PORT: "4240" }), 4240);
  assert.equal(firstPort({ GALLERY_PORT: "x" }), FIRST_PORT);
  assert.deepEqual([compareVersions("0.1.0", "0.1.10"), compareVersions("0.2.0", "0.1.9"), compareVersions("0.1.0", "0.1.0")], [-1, 1, 0]);
  // The default browser, by system: never waited for; skipped where nothing can open one.
  const url = "http://127.0.0.1:4317/#a-b";
  assert.deepEqual(browserCommand(url, { platform: "win32", env: { SystemRoot: "C:\\Windows" }, wsl: false }), { command: path.join("C:\\Windows", "System32", "rundll32.exe"), args: ["url.dll,FileProtocolHandler", url] });
  assert.deepEqual(browserCommand(url, { platform: "darwin", env: {}, wsl: false }), { command: "open", args: [url] });
  assert.deepEqual(browserCommand(url, { platform: "linux", env: {}, wsl: true }).command, "cmd.exe");
  assert.match(browserCommand(url, { platform: "linux", env: {}, wsl: false }).skip, /no display/);
  assert.match(browserCommand(url, { platform: "linux", env: { DISPLAY: ":0", PATH: "" }, wsl: false }).skip, /xdg-open/);
  assert.match(browserCommand(url, { platform: "darwin", env: { GALLERY_NO_BROWSER: "1" }, wsl: false }).skip, /GALLERY_NO_BROWSER/);
  assert.deepEqual(browserCommand("http://127.0.0.1:4317/#项目周报-k3xv9q2a", { platform: "darwin", env: {}, wsl: false }).args, ["http://127.0.0.1:4317/#%E9%A1%B9%E7%9B%AE%E5%91%A8%E6%8A%A5-k3xv9q2a"], "a link's words percent-encoded");
  // The browser a command opens (browserLine): at the address its last line gives, none without one (no
  // server), none with --no-browser; GALLERY_NO_BROWSER, set here for this process as for every command
  // the test runs, opens none. gallery open and page open ask it by default; new, import and duplicate only
  // with --open (openAsked: --no-browser still taken, and with --open a mistake of the command line).
  assert.deepEqual([openAsked(new Set()), openAsked(new Set(["--no-browser"])), openAsked(new Set(["--open"]))], [false, false, true]);
  assert.throws(() => openAsked(new Set(["--open", "--no-browser"])), (error) => error instanceof UsageError && error.message === "--open and --no-browser say opposite things: give one.");
  process.env.GALLERY_NO_BROWSER = "1";
  const given = [`${USER_LINE}${url}`];
  assert.equal(await browserLine(["Preview: not started (--no-preview or GALLERY_NO_PREVIEW): …"], new Set()), null, "no address: no browser, no line");
  assert.equal(await browserLine(given, new Set(["--no-browser"])), "Not opened in a browser (--no-browser).");
  assert.equal(await browserLine(given, new Set()), "Not opened in a browser: GALLERY_NO_BROWSER is set.");

  // --version: the version alone, as fast as node itself nearly (the dispatcher loads no command).
  const timed = async (args) => {
    let best = Infinity;
    for (let attempt = 0; attempt < 3; attempt++) {
      const start = performance.now();
      await run(process.execPath, args, { cwd: root, env: { ...process.env, ...quiet } });
      best = Math.min(best, performance.now() - start);
    }
    return best;
  };
  const versionRun = await gallery(["--version"], null);
  assert.deepEqual([versionRun.code, versionRun.stdout, versionRun.stderr], [0, `${versionOf()}\n`, ""]);
  assert.equal(versionOf(), JSON.parse(await fs.readFile(path.join(projectRoot, "package.json"), "utf8")).version);
  const [bare, version] = [await timed(["-e", "0"]), await timed([bin, "--version"])];
  assert.ok(version < bare * 1.5 + 30, `gallery --version took ${Math.round(version)} ms, node -e 0 ${Math.round(bare)} ms`);
  // The usage of the commands with subcommands (gallery block, gallery page) is kept by subcommand in ./usage-sections.mjs, which imports nothing.
  for (const file of ["gallery.mjs", "usage.mjs", "usage-sections.mjs"]) {
    const imports = [...(await fs.readFile(path.join(projectRoot, "src", "cli", file), "utf8")).matchAll(/^import .* from "([^"]+)";$/gm)].map((match) => match[1]);
    assert.deepEqual(imports.filter((spec) => !spec.startsWith("node:") && spec !== "./usage.mjs" && !(file === "usage.mjs" && spec === "./usage-sections.mjs")), [], `${file} imports nothing but node's and the usage at load`);
  }
  // --version's notes load Node's modules and three small ones of their own, none reaching the workspace's.
  const importsOf = async (file) => [...(await fs.readFile(file, "utf8")).matchAll(/^import .* from "([^"]+)";$/gm)].map((match) => match[1]).filter((spec) => !spec.startsWith("node:"));
  assert.deepEqual(await importsOf(path.join(projectRoot, "src", "cli", "updates.mjs")), ["../shared/user-directory.mjs", "../shared/versions.mjs", "./skill-record.mjs"], "updates.mjs imports nothing heavy");
  for (const file of ["src/shared/user-directory.mjs", "src/shared/versions.mjs", "src/cli/skill-record.mjs"]) assert.deepEqual(await importsOf(path.join(projectRoot, file)), [], `${file} imports nothing but node's`);
  // The dispatcher run itself runs the command line, as src/cli/bin.mjs has it run; imported, it runs nothing.
  const dispatcher = await run(process.execPath, [path.join(projectRoot, "src", "cli", "gallery.mjs"), "--version"], { cwd: root, env: { ...process.env, ...quiet } });
  assert.equal(dispatcher.stdout, `${versionOf()}\n`, "node src/cli/gallery.mjs --version");

  // ---------- what --version says after the version ----------
  // Its pieces, in this process: where the cache is on each system (GALLERY_CACHE_DIR first), the
  // registry asked (GALLERY_REGISTRY, else npm's settings, else npm's own), the check's environment
  // (npm's proxy), the lines run by npx, when the cache is stale, what turns the check off, and the
  // folders gallery skill install writes the skill in, each once.
  {
    const home = path.join(root, "home");
    assert.equal(cacheDirectory({ env: { GALLERY_CACHE_DIR: "c", LOCALAPPDATA: "l" }, platform: "win32", home }), path.resolve("c"));
    assert.equal(cacheDirectory({ env: { LOCALAPPDATA: path.join(home, "Local") }, platform: "win32", home }), path.join(home, "Local", "gallery"));
    assert.equal(cacheDirectory({ env: {}, platform: "win32", home }), path.join(home, "AppData", "Local", "gallery"));
    assert.equal(cacheDirectory({ env: { XDG_CACHE_HOME: path.join(home, "x") }, platform: "darwin", home }), path.join(home, "Library", "Caches", "gallery"));
    assert.equal(cacheDirectory({ env: { XDG_CACHE_HOME: path.join(home, "x") }, platform: "linux", home }), path.join(home, "x", "gallery"));
    assert.equal(cacheDirectory({ env: {}, platform: "linux", home }), path.join(home, ".cache", "gallery"));
    // npm's settings read from folders of the test's own (a home, a node and the npm beside it): none yet.
    const npmrcs = path.join(root, "npmrcs");
    const node = path.join(npmrcs, "node");
    const execPath = path.join(node, "bin", "node");
    const settings = (env) => npmSettings({ env, home, platform: "linux", execPath });
    const none = () => undefined;
    assert.equal(registryOf({}, none), "https://registry.npmjs.org/");
    assert.equal(registryOf({}, settings({})), "https://registry.npmjs.org/", "npm says none: npm's own");
    assert.equal(registryOf({}, settings({ npm_config_registry: "https://registry.npmmirror.com" })), "https://registry.npmmirror.com/", "npm's registry, a mirror");
    assert.equal(registryOf({ GALLERY_REGISTRY: "http://127.0.0.1:9/npm/" }, settings({ npm_config_registry: "https://registry.npmmirror.com/" })), "http://127.0.0.1:9/npm/");
    assert.equal(latestUrl("https://registry.npmjs.org/"), "https://registry.npmjs.org/@heycys%2fgallery/latest");
    // npm's settings as npm finds them for npm i -g, which a global gallery's environment does not carry
    // (npm's shim runs node itself): an .npmrc as npm reads it; the environment's, then the user's .npmrc
    // ($HOME's, or npm_config_userconfig), the global npmrc (<prefix>/etc/npmrc, its prefix the
    // environment's, the user's, the builtin npmrc's, PREFIX, node's folder; or npm_config_globalconfig),
    // the builtin npmrc beside the npm that comes with node; the scope's registry before the registry.
    assert.deepEqual(parseNpmrc(`${String.fromCharCode(0xfeff)}; a comment\n# another\nregistry = "https://a.example/" \nproxy=http://p.example:1 ; a note\n@heycys:registry=\${MIRROR}/npm/\nempty=\${NOPE?}\nkept=\${NOPE}\n//a.example/:_authToken=x\n[section]\nregistry=https://b.example/\n`, { MIRROR: "https://m.example" }), {
      registry: "https://a.example/", proxy: "http://p.example:1", "@heycys:registry": "https://m.example/npm/", empty: "", kept: "${NOPE}", "//a.example/:_authToken": "x",
    }, "an .npmrc: comments, quotes, a note after ;, ${VAR} and ${VAR?}, a section's own left out");
    const write = async (file, text) => {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, text);
    };
    await write(path.join(home, ".npmrc"), "registry=https://user.example/\nprefix=~/npm-global\n");
    await write(path.join(home, "npm-global", "etc", "npmrc"), "registry=https://global.example/\n@heycys:registry=https://scoped.example/\nproxy=http://proxy.example:8080\n");
    await write(path.join(node, "lib", "node_modules", "npm", "npmrc"), "prefix=${BUILTIN}\nregistry=https://builtin.example/\nnoproxy=builtin.example\n");
    await write(path.join(npmrcs, "builtin-prefix", "etc", "npmrc"), "registry=https://builtin-prefix.example/\n");
    await write(path.join(node, "etc", "npmrc"), "registry=https://node-prefix.example/\n");
    assert.equal(registryOf({}, settings({})), "https://scoped.example/", "the scope's registry (the global npmrc's, its prefix the user's ~/) before the user's registry");
    assert.equal(settings({})("registry"), "https://user.example/", "the user's .npmrc before the global's");
    assert.equal(registryOf({}, settings({ npm_config_registry: "https://env.example" })), "https://scoped.example/", "the environment's registry, but not before the scope's");
    assert.equal(registryOf({}, settings({ "NPM_CONFIG_@heycys:registry": "https://env-scoped.example" })), "https://env-scoped.example/", "the environment's, in any case");
    assert.equal(registryOf({}, settings({ npm_config_userconfig: path.join(npmrcs, "none"), BUILTIN: path.join(npmrcs, "builtin-prefix") })), "https://builtin-prefix.example/", "no user .npmrc: the builtin npmrc's prefix");
    assert.equal(registryOf({}, settings({ npm_config_userconfig: path.join(npmrcs, "none"), npm_config_globalconfig: path.join(npmrcs, "none") })), "https://builtin.example/", "the builtin npmrc last");
    await fs.rm(path.join(node, "lib"), { recursive: true });
    assert.equal(registryOf({}, settings({ npm_config_userconfig: path.join(npmrcs, "none") })), "https://node-prefix.example/", "no builtin npmrc: node's folder the prefix");
    assert.equal(registryOf({}, settings({ npm_config_userconfig: path.join(npmrcs, "none"), npm_config_prefix: path.join(npmrcs, "builtin-prefix") })), "https://builtin-prefix.example/", "the environment's prefix");
    assert.equal(registryOf({}, npmSettings({ env: { HOME: path.join(npmrcs, "none") }, platform: "linux", execPath })), "https://node-prefix.example/", "$HOME's .npmrc, as npm reads it");
    // The check's process: Node's fetch through a proxy (NODE_USE_ENV_PROXY), npm's proxy and noproxy
    // in place of the environment's (in any case), as npm takes them.
    const child = refreshEnv({ http_proxy: "http://env.example:1", HTTPS_PROXY: "http://env.example:1", no_proxy: "localhost", PATH: "p" }, settings({}));
    assert.deepEqual(child, { PATH: "p", no_proxy: "localhost", NODE_USE_ENV_PROXY: "1", HTTPS_PROXY: "http://proxy.example:8080", HTTP_PROXY: "http://proxy.example:8080" }, "npm's proxy");
    assert.deepEqual(refreshEnv({ https_proxy: "http://env.example:1", no_proxy: "localhost" }, settings({ npm_config_noproxy: "a.example" })), { NODE_USE_ENV_PROXY: "1", HTTPS_PROXY: "http://proxy.example:8080", HTTP_PROXY: "http://proxy.example:8080", NO_PROXY: "a.example" }, "npm's noproxy");
    assert.deepEqual(refreshEnv({ https_proxy: "http://env.example:1" }, none), { https_proxy: "http://env.example:1", NODE_USE_ENV_PROXY: "1" }, "no proxy of npm's: the environment's");
    // Run by npx (npm's _npx folder): both lines give the npx form, as no gallery command is installed.
    assert.deepEqual([viaNpx(path.join(home, "npm-cache", "_npx", "0a1b", "node_modules", "@heycys", "gallery", "dist", "cli.mjs")), viaNpx(path.join(home, "npm", "node_modules", "@heycys", "gallery", "dist", "cli.mjs"))], [true, false]);
    assert.ok(skillLine("f", "0.1.0", "0.1.2", true, true).endsWith("问过用户后运行 npx -y @heycys/gallery@^0.1.2 skill install --project（之后新开的 Agent 会话才读到新技能）"), "a skill line by npx");
    assert.ok(newerLine("0.2.0", "0.1.2", true).endsWith("问过用户后运行 npx -y @heycys/gallery@^0.2.0 skill install（之后新开的 Agent 会话才读到新技能）") && !newerLine("0.2.0", "0.1.2", true).includes("npm i -g"), "the npm line by npx");
    const npxHome = path.join(npmrcs, "npx");
    await write(path.join(npxHome, "claude", "skills", "gallery", "SKILL.md"), `---\nname: gallery\n---\n\n${recordOf("0.1.0")}.\n`);
    const npxCache = path.join(npxHome, "cache");
    await write(path.join(npxCache, CACHE_FILE), JSON.stringify({ checked: Date.now(), registry: "http://127.0.0.1:9/", latest: "0.2.0" }));
    const npxEnv = { CLAUDE_CONFIG_DIR: path.join(npxHome, "claude"), CODEX_HOME: path.join(npxHome, "codex"), GALLERY_CACHE_DIR: npxCache, GALLERY_REGISTRY: "http://127.0.0.1:9/" };
    assert.deepEqual(versionNotes("0.1.2", { env: npxEnv, cwd: npxHome, npx: true }), [
      skillLine(path.join(npxHome, "claude", "skills", "gallery"), "0.1.0", "0.1.2", false, true),
      newerLine("0.2.0", "0.1.2", true),
    ], "--version's lines by npx");
    assert.equal(viaNpx(), false, "this checkout is no npx folder");
    const at = Date.parse("2026-11-07T12:00:00Z");
    const registry = "https://registry.npmjs.org/";
    assert.deepEqual([
      stale(null, registry, at),
      stale({ checked: at - FRESH + 1000, registry, latest: "0.1.1" }, registry, at),
      stale({ checked: at - FRESH, registry, latest: "0.1.1" }, registry, at),
      stale({ checked: at - 1000, registry: "https://registry.npmmirror.com/", latest: "0.1.1" }, registry, at),
      stale({ checked: at - RETRY + 1000, registry, latest: null, failed: true }, registry, at),
      stale({ checked: at - RETRY, registry, latest: null, failed: true }, registry, at),
      stale({ checked: at + 60_000, registry, latest: "0.1.1" }, registry, at),
    ], [true, false, true, true, false, true, true], "stale: none, a day old, another registry's, an hour after a failure, from the future");
    assert.deepEqual([{}, { GALLERY_NO_UPDATE_CHECK: "1" }, { GALLERY_NO_UPDATE_CHECK: "0" }, { CI: "true" }, { CI: "false" }, { NO_UPDATE_NOTIFIER: "1" }].map(checkOff), [false, true, false, true, false, true]);
    const project = path.join(root, "project");
    const folders = skillFolders({ env: { CLAUDE_CONFIG_DIR: path.join(project, ".claude"), CODEX_HOME: path.join(root, "codex-home") }, cwd: project });
    assert.deepEqual(folders, [
      { folder: path.join(project, ".claude", "skills", "gallery"), project: false },
      { folder: path.join(root, "codex-home", "skills", "gallery"), project: false },
      { folder: path.join(project, ".codex", "skills", "gallery"), project: true },
    ], "each folder once: a project whose .claude is the agent's home is the home");
    await fs.rm(home, { recursive: true, force: true });
    await fs.rm(npmrcs, { recursive: true, force: true });
  }

  // The commands, run as the Agent runs them: in a project folder, with the agents' homes and the
  // cache of the test's own, and a registry of its own on 127.0.0.1 that counts what it is asked.
  {
    const base = path.join(root, "notes");
    const claude = path.join(base, "claude");
    const codex = path.join(base, "codex");
    const project = path.join(base, "project");
    const cache = path.join(base, "cache");
    const cacheFile = path.join(cache, CACHE_FILE);
    await fs.mkdir(project, { recursive: true });
    const version = versionOf();
    const older = "0.0.9";
    const asked = [];
    let answer = () => ({ status: 200, body: JSON.stringify({ name: "@heycys/gallery", version: "9.1.0" }), delay: 0 });
    const npm = http.createServer((request, response) => {
      asked.push(request.url);
      const { status, body, delay } = answer();
      setTimeout(() => response.writeHead(status, { "Content-Type": "application/json" }).end(body), delay);
    });
    await new Promise((resolve) => npm.listen(0, "127.0.0.1", resolve));
    const registry = `http://127.0.0.1:${npm.address().port}/`;
    // The check on, as on a user's machine: none of what turns it off, npm's registry the test's; npm's
    // settings and the proxies of this machine's environment left out, its .npmrc files (the user's and
    // the global one) the test's, none unless the test writes them.
    const npmrc = path.join(base, "npmrc");
    const on = {
      CLAUDE_CONFIG_DIR: claude, CODEX_HOME: codex, GALLERY_CACHE_DIR: cache, GALLERY_REGISTRY: registry, GALLERY_NO_UPDATE_CHECK: "", CI: "", NO_UPDATE_NOTIFIER: "",
      npm_config_userconfig: npmrc, npm_config_globalconfig: path.join(base, "global-npmrc"),
    };
    const machine = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^npm_config_|proxy/i.test(key)));
    const versionRun = async (env = {}, cwd = project) => {
      const started = performance.now();
      const { stdout, stderr } = await run(process.execPath, [bin, "--version"], { cwd, env: { ...machine, ...on, ...env } });
      return { lines: linesOf(stdout), stderr, ms: performance.now() - started };
    };
    // The check run to its end: the cache no longer the claim --version wrote as it started it.
    const checkDone = async () => {
      const cached = await readCacheFile();
      return cached !== null && cached.checking === undefined;
    };
    const skillMd = (record) => `---\nname: gallery\ndescription: "x"\n---\n\n# Gallery\n\n## Before anything: the gallery command\n\n${record ? `${recordOf(record)} and needs it.` : "This skill needs it."}\n`;
    const putSkill = async (folder, text) => {
      await fs.mkdir(folder, { recursive: true });
      await fs.writeFile(path.join(folder, "SKILL.md"), text);
    };
    const settle = async (test, what, ms = 15_000) => {
      for (const until = Date.now() + ms; Date.now() < until; await new Promise((resolve) => setTimeout(resolve, 100))) if (await test()) return;
      assert.fail(`not within ${ms} ms: ${what}`);
    };
    const readCacheFile = async () => JSON.parse(await fs.readFile(cacheFile, "utf8").catch(() => "null"));
    const fresh = (fields) => fs.mkdir(cache, { recursive: true }).then(() => fs.writeFile(cacheFile, JSON.stringify({ checked: Date.now(), registry, ...fields })));
    try {
      // Skills: Claude Code's made by an older Gallery, Codex's saying no version, the project's .claude
      // one older too (gallery skill install --project), its .codex one this version's; one line each,
      // in that order, the version first. Then a skill of the same version, a newer one, one of
      // something else and a git checkout: none.
      await fresh({ latest: version });
      await putSkill(path.join(claude, "skills", "gallery"), skillMd(older));
      await putSkill(path.join(codex, "skills", "gallery"), skillMd(null));
      await putSkill(path.join(project, ".claude", "skills", "gallery"), skillMd(older));
      await putSkill(path.join(project, ".codex", "skills", "gallery"), skillMd(version));
      const four = await versionRun();
      assert.deepEqual(four.lines, [
        version,
        skillLine(path.join(claude, "skills", "gallery"), older, version, false),
        skillLine(path.join(codex, "skills", "gallery"), null, version, false),
        skillLine(path.join(project, ".claude", "skills", "gallery"), older, version, true),
      ]);
      assert.equal(four.stderr, "");
      assert.ok(four.lines[1].endsWith("问过用户后运行 gallery skill install（之后新开的 Agent 会话才读到新技能）") && four.lines[3].includes("运行 gallery skill install --project（"), four.lines.join("\n"));
      assert.ok(four.lines[2].includes("是旧版 Gallery（没写版本）的，比这个 gallery"), four.lines[2]);
      await putSkill(path.join(claude, "skills", "gallery"), skillMd(version));
      await putSkill(path.join(codex, "skills", "gallery"), skillMd("99.0.0"));
      await putSkill(path.join(project, ".claude", "skills", "gallery"), skillMd(older).replace("name: gallery", "name: another"));
      await putSkill(path.join(project, ".codex", "skills", "gallery"), skillMd(older));
      await fs.mkdir(path.join(project, ".codex", "skills", "gallery", ".git"));
      assert.deepEqual((await versionRun()).lines, [version], "the same version, a newer one, another skill and a git checkout: nothing to say");
      // The skill the packager makes says the version that made it: this version's says nothing, an older one's its version.
      buildSkill(path.join(claude, "skills", "gallery"), { version });
      assert.deepEqual((await versionRun()).lines, [version], "the skill made for this version");
      buildSkill(path.join(claude, "skills", "gallery"), { version: older });
      assert.deepEqual((await versionRun()).lines, [version, skillLine(path.join(claude, "skills", "gallery"), older, version, false)], "the skill made for an older version");
      await fs.rm(claude, { recursive: true });
      await fs.rm(codex, { recursive: true });
      await fs.rm(path.join(project, ".claude"), { recursive: true });
      await fs.rm(path.join(project, ".codex"), { recursive: true });

      // npm: a cache that knows a newer version says it, with what to run; one that knows this version,
      // an older one or no version as npm writes one says nothing. A fresh cache asks the registry nothing.
      await fresh({ latest: "9.0.0" });
      const newer = await versionRun();
      assert.deepEqual(newer.lines, [version, newerLine("9.0.0", version)]);
      assert.equal(newer.lines[1], `新版本：npm 上有 Gallery 9.0.0，这个 gallery 是 ${version}；问过用户后运行 npm i -g @heycys/gallery@^9.0.0，再运行 gallery skill install（之后新开的 Agent 会话才读到新技能）`);
      for (const latest of [version, older, "9.0.0-beta.1", "9.0.0\u001b[31m", null]) {
        await fresh({ latest });
        assert.deepEqual((await versionRun()).lines, [version], `a cache that knows ${JSON.stringify(latest)}`);
      }
      // GALLERY_NO_UPDATE_CHECK, CI and NO_UPDATE_NOTIFIER: no line from a cache that knows a newer
      // version, and no check started, though the cache is two days old.
      await fs.writeFile(cacheFile, JSON.stringify({ checked: Date.now() - 2 * FRESH, registry, latest: "9.0.0" }));
      for (const off of [{ GALLERY_NO_UPDATE_CHECK: "1" }, { CI: "true" }, { NO_UPDATE_NOTIFIER: "1" }]) assert.deepEqual((await versionRun(off)).lines, [version], JSON.stringify(off));
      await new Promise((resolve) => setTimeout(resolve, 1500));
      assert.deepEqual(asked, [], "the registry was asked nothing");

      // A stale cache: --version says what it knows (an older version: nothing) and starts a check it does
      // not wait for (the registry answers 2 s later); the check writes the cache, and the next --version says it.
      await fs.writeFile(cacheFile, JSON.stringify({ checked: Date.now() - 2 * FRESH, registry, latest: older }));
      let answered = null;
      answer = () => {
        setTimeout(() => (answered = performance.now()), 2000);
        return { status: 200, body: JSON.stringify({ name: "@heycys/gallery", version: "9.1.0" }), delay: 2000 };
      };
      const before = performance.now();
      const staleRun = await versionRun();
      assert.deepEqual([staleRun.lines, staleRun.stderr], [[version], ""]);
      assert.ok(answered === null && staleRun.ms < 2000, `--version did not wait for the registry (${Math.round(staleRun.ms)} ms)`);
      // It claimed the check before starting it: the cache says a check runs (failed till it answers,
      // the version known before kept), so the runs meanwhile (other sessions' tasks) start none.
      const claimed = await readCacheFile();
      assert.deepEqual([claimed.registry, claimed.latest, claimed.failed, claimed.checking, Math.abs(Date.now() - claimed.checked) < 60_000], [registry, older, true, true, true], JSON.stringify(claimed));
      for (let again = 0; again < 2; again++) assert.deepEqual((await versionRun()).lines, [version], "a run while the check runs");
      await settle(async () => (await readCacheFile())?.latest === "9.1.0", "the check wrote the cache");
      assert.ok(answered !== null && answered - before >= 1900, "written once the registry answered");
      assert.deepEqual(asked, ["/@heycys%2fgallery/latest"], "the registry asked once, for the package's latest, though --version ran three times");
      const cached = await readCacheFile();
      assert.deepEqual([cached.registry, cached.failed, cached.checking, Math.abs(Date.now() - cached.checked) < 60_000], [registry, undefined, undefined, true]);
      assert.deepEqual((await versionRun()).lines, [version, newerLine("9.1.0", version)], "the next --version says it");
      assert.equal(asked.length, 1, "a fresh cache asks nothing");

      // A registry that fails (500, an answer with no version as npm writes one, a port nobody listens
      // on): no line, no error; the cache says the check failed and keeps the version known before.
      for (const [failing, kept] of [[{ status: 500, body: "{}" }, null], [{ status: 200, body: JSON.stringify({ version: "latest; rm -rf ~" }) }, null], [{ status: 200, body: "not json" }, "0.0.8"]]) {
        await fs.rm(cacheFile, { force: true });
        if (kept) await fs.writeFile(cacheFile, JSON.stringify({ checked: Date.now() - 2 * FRESH, registry, latest: kept }));
        answer = () => ({ ...failing, delay: 0 });
        const failed = await versionRun();
        assert.deepEqual([failed.lines, failed.stderr], [[version], ""], failing.body);
        await settle(async () => (await checkDone()) && (await readCacheFile()).failed === true, `the failed check written (${failing.body})`);
        assert.deepEqual((await readCacheFile()).latest, kept, "the version known before kept");
      }
      const asking = asked.length;
      assert.deepEqual((await versionRun()).lines, [version], "a failed check is not tried again within the hour");
      await new Promise((resolve) => setTimeout(resolve, 500));
      assert.equal(asked.length, asking);
      const closed = await new Promise((resolve) => {
        const probe = http.createServer().listen(0, "127.0.0.1", () => {
          const { port } = probe.address();
          probe.close(() => resolve(port));
        });
      });
      const nowhere = `http://127.0.0.1:${closed}/`;
      await fs.rm(cacheFile, { force: true });
      const unreachable = await versionRun({ GALLERY_REGISTRY: nowhere });
      assert.deepEqual([unreachable.lines, unreachable.stderr], [[version], ""]);
      await settle(async () => (await checkDone()) && (await readCacheFile()).registry === nowhere, "the failed check of a registry nobody listens on written");
      assert.deepEqual([(await readCacheFile()).failed, (await readCacheFile()).latest], [true, null]);

      // A cache folder that cannot be written (a sandbox's): no check starts, its answer could never be
      // read; so none on every run either, and the registry is asked nothing.
      answer = () => ({ status: 200, body: JSON.stringify({ name: "@heycys/gallery", version: "9.1.0" }), delay: 0 });
      const blocked = path.join(base, "a-file");
      await fs.writeFile(blocked, "");
      const asked0 = asked.length;
      for (let again = 0; again < 2; again++) {
        const unwritable = await versionRun({ GALLERY_CACHE_DIR: path.join(blocked, "cache") });
        assert.deepEqual([unwritable.lines, unwritable.stderr], [[version], ""], "a cache that cannot be written");
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
      assert.equal(asked.length, asked0, "no check started where the cache cannot be written");

      // The registry npm installs from, though npm's shim leaves no npm_config_registry to a global
      // gallery: a mirror the user's .npmrc names (npm config set registry …) is asked, and another
      // registry's version is not believed (a fresh cache of npm's own that knows 9.0.0 says nothing,
      // and is checked again of the mirror at once).
      const mirror = `${registry}mirror/`;
      await fs.writeFile(npmrc, `; npm config set registry\nregistry=${mirror}\n`);
      await fresh({ latest: "9.0.0" });
      const mirrored = await versionRun({ GALLERY_REGISTRY: "" });
      assert.deepEqual([mirrored.lines, mirrored.stderr], [[version], ""], "npm's own registry's version, the mirror asked");
      await settle(async () => (await checkDone()) && (await readCacheFile()).registry === mirror, "the mirror's answer written");
      assert.deepEqual([asked.at(-1), (await readCacheFile()).latest], ["/mirror/@heycys%2fgallery/latest", "9.1.0"]);
      assert.deepEqual((await versionRun({ GALLERY_REGISTRY: "" })).lines, [version, newerLine("9.1.0", version)], "the mirror's version said");

      // Behind a proxy (Node's fetch takes one where it honours NODE_USE_ENV_PROXY): npm's, from the
      // .npmrc, is the way to the registry, a host this machine cannot reach (.invalid) but through it.
      if (process.allowedNodeEnvironmentFlags.has("--use-env-proxy")) {
        const tunnels = [];
        const proxy = http.createServer((request, response) => response.writeHead(405).end());
        proxy.on("connect", (request, socket, head) => {
          tunnels.push(request.url);
          const upstream = net.connect(npm.address().port, "127.0.0.1", () => {
            socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
            if (head?.length) upstream.write(head);
            upstream.pipe(socket);
            socket.pipe(upstream);
          });
          upstream.on("error", () => socket.destroy());
          socket.on("error", () => upstream.destroy());
        });
        await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
        try {
          await fs.writeFile(npmrc, `registry=http://registry.invalid/mirror/\nproxy=http://127.0.0.1:${proxy.address().port}/\n`);
          await fs.rm(cacheFile, { force: true });
          const proxied = await versionRun({ GALLERY_REGISTRY: "" });
          assert.deepEqual([proxied.lines, proxied.stderr], [[version], ""]);
          await settle(async () => (await checkDone()) && (await readCacheFile()).registry === "http://registry.invalid/mirror/", "the answer through the proxy written");
          assert.deepEqual([tunnels, asked.at(-1), (await readCacheFile()).latest, (await readCacheFile()).failed], [["registry.invalid:80"], "/mirror/@heycys%2fgallery/latest", "9.1.0", undefined]);
        } finally {
          proxy.closeAllConnections();
          proxy.close();
        }
      }
    } finally {
      npm.closeAllConnections();
      npm.close();
      await fs.rm(base, { recursive: true, force: true, maxRetries: 5 });
    }
  }

  // ---------- a workspace with a natural document ----------
  await fs.mkdir(reports);
  await createReportFromStarter("natural", "自然写法", "说明", { directory: reports });
  const file = path.join(reports, "natural", "doc.html");
  const starter = await fs.readFile(file, "utf8");
  const original = starter.replace(/\n[ \t]*<!-- Starter content:[^\n]*-->\n[ \t]*<section\b[^>]*\sdata-doc-placeholder\b[\s\S]*?<\/section>/, "\n    <p>一段 <mark>标记过</mark> 的文字。</p>");
  assert.notEqual(original, starter, "the starter's section replaced");
  await fs.writeFile(file, original);
  assert.ok(naturalize(original).changes.length > 0, "a command that ran would rewrite the document");
  // The same document outside the workspace, which "../outside" would reach.
  const outside = path.join(root, "outside", "doc.html");
  await fs.cp(path.dirname(file), path.dirname(outside), { recursive: true });

  const cases = [
    [["check", "--help"], 0, "check"],
    [["export", "-h"], 0, "export"],
    [["export", "natural", "--bogus", "--help"], 0, "export"],
    [["new", "--help"], 0, "new"],
    [["import", "-h"], 0, "import"],
    [["qa", "--help"], 0, "qa"],
    [["help", "open"], 0, "open"],
    [["export", "--bogus"], 2, "export", "Unknown option: --bogus"],
    [["check", "natural", "--dry-run"], 2, "check", "Unknown option: --dry-run"],
    [["export"], 2, "export", "Name a document (or pass --all)."],
    [["export", "--allow-failures"], 2, "export", "Name a document (or pass --all)."],
    [["check", "natural", "--all"], 2, "check", "Name documents or pass --all, not both."],
    [["new", "fresh"], 2, "new", "Name the slug and the title (then a description, if you choose one), each quoted when it has spaces."],
    [["new", "fresh", "标题", "说明", "多余"], 2, "new", "Name the slug and the title (then a description, if you choose one), each quoted when it has spaces."],
    [["check", "Natural"], 2, "check", "Not a document's slug, link or address: Natural (gallery list shows them)."],
    [["export", "natural", "../outside"], 2, "export", "Not a document's slug, link or address: ../outside (gallery list shows them)."],
    [["check", "周报-k3xv9q2a"], 2, "check", "Not a document's slug, link or address: 周报-k3xv9q2a (gallery list shows them)."],
    [["open", "http://127.0.0.1:4317/#周报-k3xv9q2a/ab12cd34"], 2, "open", "Not a document's slug, link or address: http://127.0.0.1:4317/#周报-k3xv9q2a/ab12cd34 (gallery list shows them)."],
    [["new", "exports", "标题"], 2, "new", "Not a document's slug: exports (a name the workspace keeps for itself)."],
    [["check", "--", "--Natural"], 2, "check", "Not a document's slug, link or address: --Natural (gallery list shows them)."],
    [["new", "fresh", "标题", "说明", "--force"], 2, "new", "Unknown option: --force"],
    [["new", "fresh", "-Q3 回顾", "说明"], 2, "new", "Unknown option: -Q3 回顾"],
    [["new", "fresh", "标题", "--open", "--no-browser"], 2, "new", "--open and --no-browser say opposite things: give one."],
    [["import", "notes.md", "--no-browser", "--open"], 2, "import", "--open and --no-browser say opposite things: give one."],
    [["duplicate", "natural", "--open", "--no-browser"], 2, "duplicate", "--open and --no-browser say opposite things: give one."],
    [["import"], 2, "import", "Name the file; then the slug and the title, if you choose them."],
    [["import", "notes.md", "q3", "标题", "多余"], 2, "import", "Name the file; then the slug and the title, if you choose them."],
    [["import", "notes.md", "Notes"], 2, "import", "Not a document's slug: Notes (lowercase kebab-case)."],
    [["import", "notes.md", "--force"], 2, "import", "Unknown option: --force"],
    [["import", "figure.png"], 2, "import", "Not a kind of file gallery import takes: figure.png (.md .markdown .mdx .txt .text .html .htm .xhtml .csv .tsv .docx .pdf .epub .zip)."],
    [["qa", "natural", "--blocks"], 2, "qa", "--blocks takes a value"],
    [["qa", "natural", "--blocks=,,"], 2, "qa", "--blocks takes block ids: --blocks <id,…>"],
    [["qa", "natural", "other", "--blocks", "a1"], 2, "qa", "--blocks names blocks of one document: name one."],
    [["open", "natural", "other"], 2, "open", "Name one document at most."],
    [["stop", "now"], 2, "stop", "gallery stop takes no arguments: now"],
    [["serve", "--port", "x"], 2, "serve", "--port takes a port number: x"],
    [["list", "--all", "--tree"], 2, "list", "--all and --tree go apart: --tree is the current workspace's tree."],
    [["list", "--every"], 2, "list", "Unknown option: --every"],
  ];
  const kept = await gallery(["new", "components", "标题"]);
  assert.deepEqual([kept.code, kept.stderr.trim()], [1, '"components" is a name the workspace keeps for itself: choose another slug.'], "the packages' folder is no new document's name, a folder of that name there or not");
  const results = await Promise.all(cases.map(([args]) => gallery(args)));
  for (const [index, [args, code, command, message]] of cases.entries()) {
    const { code: exit, stdout, stderr } = results[index];
    const what = args.join(" ");
    assert.equal(exit, code, `${what}: exit code\n${stdout}${stderr}`);
    const [printed, quiet] = code === 0 ? [stdout, stderr] : [stderr, stdout];
    assert.equal(quiet, "", `${what}: nothing else`);
    if (code === 0) {
      assert.equal(printed, `${USAGE[command]}\n`, `${what}: its usage`);
      continue;
    }
    // A mistake: why first, then one line, the usage's first, and where the rest is.
    assert.deepEqual(linesOf(printed), [message, `${USAGE[command].split("\n")[0]}   (gallery ${command} --help says more)`], what);
  }
  const unknown = await gallery(["bogus"]);
  assert.deepEqual([unknown.code, linesOf(unknown.stderr)], [2, [`No such command: bogus (${COMMANDS.join(", ")}).`, `${OVERVIEW.split("\n")[0]}   (gallery help says more)`]]);
  const help = await gallery([], null);
  assert.deepEqual([help.code, help.stdout], [0, `${OVERVIEW}\n`]);
  assert.equal(await fs.readFile(file, "utf8"), original, "the document keeps every byte");
  assert.equal(await fs.readFile(outside, "utf8"), original, "so does the one outside the workspace");
  assert.deepEqual((await fs.readdir(root)).sort(), ["outside", "reports"], "no export, backup or folder made");
  assert.deepEqual((await fs.readdir(reports)).sort(), [".gallery", "gallery.json", "natural"], "no document made (the workspace made, by the first command that reads it)");
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(reports, "gallery.json"), "utf8")), { gallery: "workspace", version: 1 });

  // ---------- the workspace each command uses ----------
  // --workspace, else GALLERY_WORKSPACE, else the nearest gallery.json up (this one's, from inside it),
  // else ~/Documents/Gallery (HOME and USERPROFILE a folder of the test's: made there, with its gallery.json).
  const inside = path.join(reports, "natural");
  const nearest = await run(process.execPath, [bin, "list"], { cwd: inside, env: { ...process.env, GALLERY_WORKSPACE: "", GALLERY_NO_PREVIEW: "1" } });
  assert.equal(linesOf(nearest.stdout)[0], `工作区：${reports}`, "the nearest gallery.json up");
  const byEnv = await run(process.execPath, [bin, "list"], { cwd: root, env: { ...process.env, GALLERY_WORKSPACE: reports } });
  assert.equal(linesOf(byEnv.stdout)[0], `工作区：${reports}`, "GALLERY_WORKSPACE");
  const home = path.join(root, "home");
  await fs.mkdir(home);
  const byDefault = await run(process.execPath, [bin, "list"], { cwd: home, env: { ...process.env, GALLERY_WORKSPACE: "", GALLERY_DEFAULT_WORKSPACE: "", HOME: home, USERPROFILE: home } });
  assert.equal(linesOf(byDefault.stdout)[0], `工作区：${path.join(home, "Documents", "Gallery")}`, "~/Documents/Gallery");
  assert.ok(await fs.stat(path.join(home, "Documents", "Gallery", "gallery.json")), "made with its gallery.json");
  const stopNothing = await run(process.execPath, [bin, "stop"], { cwd: home, env: { ...process.env, GALLERY_WORKSPACE: path.join(home, "never") } });
  assert.equal(stopNothing.stdout, "No Gallery server runs.\n");
  assert.equal(await fs.stat(path.join(home, "never")).catch(() => null), null, "stop makes no workspace");
  // Another program's gallery.json is not a workspace of Gallery's: refused, said so.
  const foreign = path.join(root, "foreign");
  await fs.mkdir(foreign);
  await fs.writeFile(path.join(foreign, "gallery.json"), '{ "photos": [] }\n');
  const refusedForeign = await gallery(["list"], foreign);
  assert.deepEqual([refusedForeign.code, refusedForeign.stderr.trim()], [1, `${path.join(foreign, "gallery.json")} is not Gallery's (another program's file of that name): pass --workspace <another folder> for Gallery's documents.`]);
  // Its own file with a slip in it: said as that, for it may be no other program's at all.
  await fs.writeFile(path.join(foreign, "gallery.json"), '{ "gallery": "workspace", "version": 1, }\n');
  const refusedSlip = await gallery(["list"], foreign);
  assert.deepEqual([refusedSlip.code, refusedSlip.stderr.trim()], [1, `${path.join(foreign, "gallery.json")} does not read as JSON: mend the file, or pass --workspace <another folder> for Gallery's documents.`]);
  // A byte-order mark is no slip: an editor on Windows writes one, as PowerShell's Set-Content does.
  await fs.writeFile(path.join(foreign, "gallery.json"), '\uFEFF{ "gallery": "workspace", "version": 1 }\n');
  const marked = await gallery(["list"], foreign);
  assert.equal(marked.code, 0, marked.stderr);
  // A workspace that cannot be written: said with what to do (a file where the folder would be).
  const blocked = path.join(root, "blocked");
  await fs.writeFile(blocked, "");
  const unwritable = await gallery(["list"], path.join(blocked, "ws"));
  assert.equal(unwritable.code, 1);
  assert.match(unwritable.stderr.trim(), /^Cannot write the workspace .*blocked[\\/]ws \((ENOTDIR|EEXIST|ENOENT)\): allow Gallery to write there, or pass --workspace <a folder you may write>\.$/, unwritable.stderr);

  // ---------- init ----------
  const made = path.join(root, "made");
  const initMade = await gallery(["init", made], null);
  assert.equal(initMade.code, 0, initMade.stderr);
  assert.deepEqual(linesOf(initMade.stdout), [`工作区：${made}（新建）`, '下一步：gallery new <slug> "<title>" makes a document; gallery open opens Gallery.']);
  assert.equal(await fs.stat(path.join(made, ".gallery")).catch(() => null), null, "foreign init creates only its marker");
  assert.equal(linesOf((await gallery(["init"], made)).stdout)[0], `工作区：${made}（已有）`, "once: a second init keeps it");
  const there = (file) => fs.stat(file).then(() => true, () => false);
  assert.ok(!await there(path.join(made, "pages")), "GALLERY_NO_DEFAULT_HOME (every unit test's): no home page");
  // The default home page (src/editor/home-page.mjs), as the server's first start makes it: said once, never again.
  const homed = path.join(root, "homed");
  const initHome = await gallery(["init", homed], null, { GALLERY_NO_DEFAULT_HOME: "", GALLERY_DEFAULT_WORKSPACE: homed });
  assert.equal(initHome.code, 0, initHome.stderr);
  assert.deepEqual(linesOf(initHome.stdout), [
    `工作区：${homed}（新建）`,
    `首页：${path.join(homed, "pages", "home", "page.html")} (the home page, its cards Gallery's today and note; the workbench opens it first)`,
    '下一步：gallery new <slug> "<title>" makes a document; gallery open opens the workbench.',
  ]);
  const homeText = await fs.readFile(path.join(homed, "pages", "home", "page.html"), "utf8");
  assert.ok(homeText.includes('data-doc-component="gallery/today"') && homeText.includes('data-doc-component="gallery/note"') && await there(path.join(homed, "components", "gallery", "today", "component.json")) && await there(path.join(homed, "components", "gallery", "note", "component.json")), "its cards (today and the note among the six), their blocks put in");
  assert.equal(JSON.parse(await fs.readFile(path.join(homed, "gallery.json"), "utf8")).pages.homeMade, true);
  await fs.rm(path.join(homed, "pages"), { recursive: true });
  const initAgain = await gallery(["init", homed], null, { GALLERY_NO_DEFAULT_HOME: "", GALLERY_DEFAULT_WORKSPACE: homed });
  assert.ok(linesOf(initAgain.stdout).length === 2 && !await there(path.join(homed, "pages")), "made once: taken away, a second init makes none");
  // A home that cannot be made (a file where the pages' folder goes): said, the workspace made all the same, init ending well.
  const homeBlocked = path.join(root, "homeBlocked");
  await fs.mkdir(homeBlocked, { recursive: true });
  await fs.writeFile(path.join(homeBlocked, "pages"), "not a folder");
  const initBlocked = await gallery(["init", homeBlocked], null, { GALLERY_NO_DEFAULT_HOME: "", GALLERY_DEFAULT_WORKSPACE: homeBlocked });
  assert.equal(initBlocked.code, 0, initBlocked.stderr);
  assert.deepEqual(linesOf(initBlocked.stdout), [`工作区：${homeBlocked}（新建）`, '下一步：gallery new <slug> "<title>" makes a document; gallery open opens the workbench.']);
  assert.match(initBlocked.stderr.trim(), /^首页：The default home page was not made \(.+\); a later start tries again\.$/, "and why the home page is not there");
  const plain = path.join(root, "plain");
  const listed = await gallery(["list"], plain, { GALLERY_NO_DEFAULT_HOME: "" });
  assert.ok(listed.code === 0 && await there(path.join(plain, "gallery.json")) && !await there(path.join(plain, "pages")), "another command, which makes a workspace, makes no home page");
  // So that a workspace like that is told what its home page waits for: the Agent's SKILL.md says every one that
  // Gallery has opened has it, and gallery page list and gallery page add home say what to do where none is yet
  // (start the server), not to make one by gallery page new, which would keep the server from making the default.
  // In place of "no custom pages": that is what there is to say, the page to come being the home page's. Every command that asks for it (open,
  // add, try, check) says the same alone, in place of "no custom page home". gallery page new home is no longer refused (no page is
  // special by its slug, the user's word of 2026-11-09): where none is there, it makes one, as below.
  assert.deepEqual(linesOf((await gallery(["page", "list"], plain, { GALLERY_NO_DEFAULT_HOME: "" })).stdout), [`工作区：${plain}`, HOME_NOT_MADE], "gallery page list says the home page is not made yet, and no more");
  for (const args of [["page", "open", "home", "--no-browser"], ["page", "try", "home", "c1", "--press", ".a"], ["page", "check", "home"]]) {
    const unmade = await gallery(args, plain, { GALLERY_NO_DEFAULT_HOME: "" });
    assert.deepEqual([unmade.code, unmade.stderr.trim()], [1, HOME_NOT_MADE], `${args.join(" ")}: the home page waits for the server, which is all it says`);
  }
  assert.ok(!await there(path.join(plain, "pages")), "and none was made");
  assert.match((await gallery(["page", "check", "other"], plain, { GALLERY_NO_DEFAULT_HOME: "" })).stderr, /^No custom page "other": /, "another page that is not there is said plainly");
  assert.ok((await gallery(["page", "list"], plain)).stdout.includes("not made yet") === false, "said nothing where no server would make one (GALLERY_NO_DEFAULT_HOME)");
  const addUnmade = await gallery(["page", "add", "home", "gallery/today"], plain, { GALLERY_NO_DEFAULT_HOME: "" });
  assert.deepEqual([addUnmade.code, linesOf(addUnmade.stderr).at(-1), linesOf(addUnmade.stderr).length], [1, HOME_NOT_MADE, 1], "an add to the home page that is not there says what it waits for, and no more");
  assert.equal(linesOf((await gallery(["page", "add", "other", "gallery/today"], plain, { GALLERY_NO_DEFAULT_HOME: "" })).stderr).length, 1, "and one to another page nothing");
  // gallery open of the home page's name, a name that is no document's: the error of a document that is not there, then where
  // the page opens (an Agent testing the skill, 2026-11-09, typed gallery open home), or, before it is made, what it waits for.
  const openUnmade = await gallery(["open", "home", "--no-browser"], plain, { GALLERY_NO_DEFAULT_HOME: "" });
  assert.deepEqual([openUnmade.code, linesOf(openUnmade.stderr).length, linesOf(openUnmade.stderr)[0].startsWith('问题：No document "home": '), linesOf(openUnmade.stderr).at(-1)], [1, 2, true, HOME_NOT_MADE], openUnmade.stderr);
  assert.equal(linesOf((await gallery(["page", "list"], homed, { GALLERY_NO_DEFAULT_HOME: "" })).stdout).some((line) => line === HOME_NOT_MADE), false, "a workspace whose home was made (and taken away) says nothing");
  const madeHome = await gallery(["page", "new", "home", "首页"], plain, { GALLERY_NO_DEFAULT_HOME: "" });
  assert.ok(madeHome.code === 0 && await there(path.join(plain, "pages", "home", "page.html")), `gallery page new home where none is: made, a page as any\n${madeHome.stderr}`);
  assert.equal(linesOf((await gallery(["page", "list"], plain, { GALLERY_NO_DEFAULT_HOME: "" })).stdout).some((line) => line === HOME_NOT_MADE), false, "nor one that has its home page");
  const openPage = await gallery(["open", "home", "--no-browser"], plain, { GALLERY_NO_DEFAULT_HOME: "" });
  assert.deepEqual([openPage.code, linesOf(openPage.stderr).at(-1)], [1, '"home" is a custom page, not a document: gallery page open home --no-browser gives its address.'], openPage.stderr);
  await fs.rm(path.join(plain, "pages"), { recursive: true });
  // --from: an older Gallery's reports/ folder copied in, each part said; the old folder byte for byte.
  const old = path.join(root, "old-skill", "reports");
  const oldPage = (title) => `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title></head><body><main class="doc-page" data-doc-id="x"><h1 class="doc-title">${title}</h1><p>正文</p></main></body></html>\n`;
  const oldDocument = async (slug, names, metadata = {}) => {
    await fs.mkdir(path.join(old, slug), { recursive: true });
    await fs.writeFile(path.join(old, slug, names[0]), oldPage(slug));
    await fs.writeFile(path.join(old, slug, names[1]), JSON.stringify({ title: slug, description: "d", type: "report", ...metadata }));
  };
  await oldDocument("alpha", ["report.html", "report.json"]);
  await oldDocument("beta", ["doc.html", "doc.json"]);
  await oldDocument("natural", ["report.html", "report.json"]); // its slug taken in the workspace below
  await oldDocument("Weird Name", ["report.html", "report.json"]);
  await oldDocument("instructions", ["report.html", "report.json"], { instructions: true });
  await fs.writeFile(path.join(old, "preferences.md"), "# 写作偏好\n\n旧的。\n");
  await fs.writeFile(path.join(old, ".workspace.json"), JSON.stringify({ version: 1, children: { "": ["alpha", "natural"], alpha: ["beta"] } }));
  await fs.mkdir(path.join(old, ".emoji-library"));
  await fs.writeFile(path.join(old, ".emoji-library", "e1.png"), "png");
  await fs.writeFile(path.join(old, ".emoji-library", "library.json"), JSON.stringify([{ id: "e1", name: "e1", file: "e1.png" }]));
  const oldHistory = path.join(root, "old-skill", "node_modules", ".cache", "report-edit", "history", "alpha");
  await fs.mkdir(oldHistory, { recursive: true });
  await fs.writeFile(path.join(oldHistory, "1.html"), "v1");
  const oldDigest = await digestOf(path.join(root, "old-skill"));
  const copiedInto = path.join(root, "copied");
  await createReportFromStarter("natural", "已有", "说明", { directory: copiedInto });
  const fromOld = await gallery(["init", "--from", old], copiedInto);
  assert.equal(fromOld.code, 0, fromOld.stderr);
  assert.deepEqual(linesOf(fromOld.stdout), [
    `工作区：${copiedInto}（新建）`,
    `Copied 2 documents from ${old}: alpha, beta`,
    "Skipped (the slug is taken here, or the folder's name is no slug): Weird Name, natural",
    `写作偏好：copied (${path.join(copiedInto, "preferences.md")})`,
    "Sidebar order: copied",
    "写作偏好's page: copied",
    "Emoji library: 1 added",
    "Recent versions: 1 document",
    '下一步：gallery new <slug> "<title>" makes a document; gallery open opens the workbench.',
  ]);
  assert.ok((await fs.stat(path.join(copiedInto, "alpha", "report.html"))).isFile(), "an old document keeps its old names");
  assert.equal(await fs.readFile(path.join(copiedInto, "natural", "doc.json"), "utf8").then((text) => JSON.parse(text).title), "已有", "a document there kept");
  assert.equal(await digestOf(path.join(root, "old-skill")), oldDigest, "the old folder byte for byte");
  const fromAgain = await gallery(["init", "--from", old], copiedInto);
  assert.deepEqual(linesOf(fromAgain.stdout).slice(1, 3), [`Copied no documents from ${old}.`, "Skipped (the slug is taken here, or the folder's name is no slug): Weird Name, alpha, beta, natural"]);
  assert.ok(linesOf(fromAgain.stdout).includes(`写作偏好：kept the workspace's (${path.join(copiedInto, "preferences.md")}); the old one was not copied`));
  const noFrom = await gallery(["init", "--from", path.join(root, "nope")], copiedInto);
  assert.deepEqual([noFrom.code, noFrom.stderr.trim()], [1, `No such folder: ${path.join(root, "nope")} (--from names an older Gallery's reports/ folder).`]);

  // ---------- new ----------
  // Where it wrote (the workspace), where 写作偏好 is (none yet: made from the default, byte for
  // byte), the next steps as SKILL.md's workflow has them, and last the server (left alone here,
  // said with how to start it); a title that starts with a minus taken after "--". The starter's
  // page holds no description and no script; the description is optional (新文档).
  const steps = (slug) => [
    "下一步：replace the starter section with the document, as ordinary HTML (gallery check fails while the starter section remains). The write that replaces the starter is not marked; every write after it is shown to the user as your changes (「Agent 已修改」).",
    `提示：when it is written, run gallery qa ${slug} (it exports first)`,
    `提示：The server was not started (--no-preview or GALLERY_NO_PREVIEW): gallery open ${slug} --no-browser starts it and prints the address to give the user.`,
  ];
  // A workspace with no name of its own (but the default one) is told how to name it after its project
  // (src/cli/workspaces.mjs nameHint): reports/ is a generic folder's name, so it goes by the folder above.
  const preferences = path.join(reports, "preferences/通用写作.md");
  const preferenceLines = (file = preferences) => ['写作偏好：以下是启用的文档，按标题和内容选择本次任务适用的规则（gallery preferences list）。', `  通用写作：${shownPath(file)}`];
  const preferencesDefault = await fs.readFile(path.join(projectRoot, "src", "shared", "writing-preferences.md"), "utf8");
  await fs.rm(preferences, { force: true }); // made by the lists above
  const preferenceConfig = JSON.parse(await fs.readFile(path.join(reports, 'gallery.json'), 'utf8'));
  delete preferenceConfig.preferences.initialized;
  await fs.writeFile(path.join(reports, 'gallery.json'), JSON.stringify(preferenceConfig)); // fresh-install fixture
  // gallery list makes 写作偏好 when there is none (an Agent's first command may be a list, and what it prints is what it
  // reads first), and says so on a line of its own, once: the second list says nothing of it.
  const listedFirst = await gallery(["list"]);
  assert.equal(listedFirst.code, 0, listedFirst.stderr);
  assert.deepEqual(linesOf(listedFirst.stdout).slice(0, 4), [
    `工作区：${reports}`,
    ...preferenceLines(),
    '提示：preferences/通用写作.md was made now from Gallery defaults. Only change writing preferences when the user requests it.',
  ]);
  const listedTree = await gallery(["list", "--tree"]);
  assert.ok(!listedTree.stdout.includes("was made now from") && !listedTree.stdout.includes("这次按默认的写作偏好新建"), "made once");
  await fs.rm(preferences, { force: true });
  await fs.writeFile(path.join(reports, 'gallery.json'), JSON.stringify(preferenceConfig));
  assert.ok(linesOf((await gallery(["list", "--tree"])).stdout).some((line) => line.startsWith("提示：preferences/")), "list --tree says it too");
  await fs.rm(preferences, { force: true });
  await fs.writeFile(path.join(reports, 'gallery.json'), JSON.stringify(preferenceConfig));
  const madeNew = await gallery(["new", "fresh", "-5% 的季度", "说明"]);
  assert.equal(madeNew.code, 0, madeNew.stderr);
  assert.deepEqual(linesOf(madeNew.stdout), [
    `Created ${shownPath(path.join(reports, "fresh", "doc.html"))} and doc.json`,
    `工作区：${reports}`,
    ...preferenceLines(),
    ...steps("fresh"),
  ]);
  assert.equal(await fs.readFile(preferences, "utf8"), preferencesDefault, "写作偏好 made from the default");
  const fresh = await fs.readFile(path.join(reports, "fresh", "doc.html"), "utf8");
  assert.ok(fresh.includes("<title>-5% 的季度</title>"), "the title");
  assert.ok(!fresh.includes("说明") && !fresh.includes("<script") && !fresh.includes("custom-chart"), "no description, no script, no comment naming a card");
  assert.equal(JSON.parse(await fs.readFile(path.join(reports, "fresh", "doc.json"), "utf8")).type, "report", "a neutral type");
  assert.deepEqual([...usedAssets(fresh)], [], "a document from the starter loads no optional shared asset");
  await fs.writeFile(preferences, "# 写作偏好\n\n先写结论。\n");
  const dashed = await gallery(["new", "fresh-q3", "--no-preview", "--", "-Q3 回顾"], reports, { GALLERY_NO_PREVIEW: "" });
  assert.equal(dashed.code, 0, dashed.stderr);
  assert.ok((await fs.readFile(path.join(reports, "fresh-q3", "doc.html"), "utf8")).includes("<title>-Q3 回顾</title>"), "the title after --");
  assert.equal(JSON.parse(await fs.readFile(path.join(reports, "fresh-q3", "doc.json"), "utf8")).description, "新文档", "no description given: 新文档");
  assert.deepEqual(linesOf(dashed.stdout).slice(1), [`工作区：${reports}`, ...preferenceLines(), ...steps("fresh-q3")]);
  assert.equal(await fs.readFile(preferences, "utf8"), "# 写作偏好\n\n先写结论。\n", "the user's own, as they were");
  await fs.writeFile(preferences, "# 写作偏好\n");
  const empty = await gallery(["new", "fresh-q4", "第四季度", "说明"]);
  assert.ok(empty.code === 0 && empty.stdout.includes(preferenceLines().join('\n')) && (await fs.readFile(preferences, "utf8")) === "# 写作偏好\n", empty.stdout);
  const twice = await gallery(["new", "fresh", "又一份"]);
  assert.deepEqual([twice.code, twice.stderr.trim()], [1, `Document already exists: ${shownPath(path.join(reports, "fresh"))}`]);
  await fs.mkdir(path.join(reports, ".gallery", "pages", "my-preferences"), { recursive: true });
  const pageSlug = await gallery(["new", "my-preferences", "标题"]);
  assert.deepEqual([pageSlug.code, pageSlug.stderr.trim()], [1, '"my-preferences" is the 写作偏好 page\'s slug: choose another slug.']);
  await fs.rm(path.join(reports, ".gallery", "pages"), { recursive: true });
  // A custom page (gallery page new: shared/pages.mjs) and a document share one set of slugs; pages is kept.
  {
    // An announcement a server stopped without closing left behind, its process's number one that runs (the
    // test's own) and its port answering no more: page new gives no address of it (the 交给用户 line is the
    // Agent's first message to the user) and says to start the server first, before any card, and page
    // list gives the path after the port (the whole addresses with a server that answers: cli-server.mjs).
    const closed = net.createServer();
    await new Promise((resolve) => closed.listen(0, "127.0.0.1", resolve));
    const deadPort = closed.address().port;
    await new Promise((resolve) => closed.close(resolve));
    const forget = await announcePreviewServer({ home: reports, port: deadPort, token: "7".repeat(32), every: 0 });
    const made = await gallery(["page", "new", "board", "看板"]);
    assert.equal(made.code, 0, made.stderr);
    assert.equal(linesOf(made.stdout)[0], `Created ${shownPath(path.join(reports, "pages", "board", "page.html"))} and page.json`);
    assert.ok(!made.stdout.includes(USER_LINE) && !made.stdout.includes(String(deadPort)), `no address of a server that is gone:\n${made.stdout}`);
    assert.equal(linesOf(made.stdout).at(-1), "下一步：run gallery page open board --no-browser now (it starts the server) and send the user the address on its 交给用户 line, in a message of its own (the page is theirs to watch as its cards arrive); then write page.html: a board of cards (each <section class=\"gallery-card\" data-card-id=\"…\" data-x data-y data-w data-h> around one custom block's instance; gallery page add places one), or any HTML, CSS and script of your own (references/pages-and-data.md); at the end tell them where it is in the sidebar (under 新建 and 搜索, its title).");
    const listedStale = await gallery(["page", "list"]);
    assert.ok(linesOf(listedStale.stdout).includes(`  地址：/#@board   ${shownPath(path.join(reports, "pages", "board", "page.html"))}`), listedStale.stdout);
    await forget();
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(reports, "pages", "board", "page.json"), "utf8")), { title: "看板" });
    const onPage = await gallery(["new", "board", "标题"]);
    assert.deepEqual([onPage.code, onPage.stderr.trim()], [1, '"board" is a custom page\'s slug (documents and custom pages share one set of names: gallery page list lists them): choose another slug.']);
    const onDocument = await gallery(["page", "new", "fresh", "标题"]);
    assert.deepEqual([onDocument.code, onDocument.stderr.trim()], [1, '"fresh" is a document\'s slug (documents and custom pages share one set of names): choose another slug.']);
    for (const kept of [["new", "pages", "页"], ["page", "new", "pages", "页"], ["page", "new", "assets", "页"]]) {
      const refused = await gallery(kept);
      assert.deepEqual([refused.code, refused.stderr.trim()], [1, `"${kept.at(-2)}" is a name the workspace keeps for itself: choose another slug.`], kept.join(" "));
    }
    await gallery(["page", "new", "home", "首页"]);
    const listed = await gallery(["page", "list"]);
    assert.deepEqual(linesOf(listed.stdout), [`工作区：${reports}`, "Custom pages, in the sidebar's order (2):", "- board  看板", `  地址：/#@board   ${shownPath(path.join(reports, "pages", "board", "page.html"))}`, "- home  首页", `  地址：/#@home   ${shownPath(path.join(reports, "pages", "home", "page.html"))}`], "in the sidebar's order, the page made last last (no page first by its slug), each with its address and file");
    const missing = await gallery(["page", "open", "nope"]);
    assert.deepEqual([missing.code, missing.stderr.trim()], [1, `No custom page "nope": ${shownPath(path.join(reports, "pages", "nope", "page.html"))} does not exist (gallery page list lists those there are).`]);
    for (const [args, said] of [[["page"], "Say what to do: new, list, open, add, set, move, card, reset-cards, try, check."], [["page", "bogus"], "No such page command: bogus (new, list, open, add, set, move, card, reset-cards, try, check)."], [["page", "new", "x"], "Name the slug and the title, the title quoted when it has spaces."], [["page", "list", "--no-browser"], "--no-browser goes with open, not list."],
      [["page", "add", "home"], "gallery page add takes a page's slug and a block's id (gallery block list lists them)."], [["page", "add", "home", "local/memo", "--x", "1"], "--x and --y go together: a place is both."],
      [["page", "add", "home", "local/memo", "--w", "0"], "--x, --y, --w and --h are whole numbers (x and y from 0, w and h from 1)."], [["page", "list", "--x", "1"], "--x go with add, not list."],
      [["page", "check", "home", "--press", ".a"], "--press goes with try, not check."], [["page", "add", "home", "local/memo", "--keep"], "--keep goes with try, not add."], [["page", "try", "home", "c1", "--x", "1", "--press", ".a"], "--x go with add, not try."],
      [["page", "check"], "gallery page check takes one page's slug."], [["page", "check", "home", "board"], "gallery page check takes one page's slug."]]) {
      const wrong = await gallery(args);
      assert.deepEqual([wrong.code, linesOf(wrong.stderr)[0]], [2, said], args.join(" "));
    }
    // A mistake in a command line of page try is said with try's lines of the usage, and before anything is opened.
    for (const [args, said] of [[["page", "try"], "Name the page and the card: gallery page try <slug> <card id> and the gesture."], [["page", "try", "home", "--press", ".a"], "Name the card of home to try: gallery page try home <card id> and the gesture (its data-card-id; gallery page check home lists the cards)."],
      [["page", "try", "home", "c1"], "Say the gesture: --press <selector>, --drag <selector> --to <selector>, --key <selector> <key>, --type <selector> <words> or --select <selector> <value>; or --steps <file>."], [["page", "try", "home", "c1", "--key", ".a"], "--key takes a selector and a key: --key <selector> <key> (Enter, Space, ArrowRight, a letter, Shift+Tab)."],
      [["page", "try", "home", "c9", "--press", ".a"], "home has no card yet: gallery page add home <block> puts one on it."]]) {
      const wrong = await gallery(args);
      assert.deepEqual([wrong.code, linesOf(wrong.stderr)[0]], [2, said], args.join(" "));
      assert.ok(wrong.stderr.includes("Usage: gallery page try <slug> <card id> --press <selector> [--then <key>] [--keep]") && !wrong.stderr.includes("gallery page new"), `${args.join(" ")}: page try's lines of the usage\n${wrong.stderr}`);
    }
    const noPage = await gallery(["page", "try", "nope", "c1", "--press", ".a"]);
    assert.deepEqual([noPage.code, noPage.stderr.trim()], [1, `No custom page "nope": ${shownPath(path.join(reports, "pages", "nope", "page.html"))} does not exist (gallery page list lists those there are).`]);
    const noCheck = await gallery(["page", "check", "nope"]);
    assert.deepEqual([noCheck.code, noCheck.stderr.trim()], [1, `No custom page "nope": ${shownPath(path.join(reports, "pages", "nope", "page.html"))} does not exist (gallery page list lists those there are).`]);
    // gallery page add (no server here: the file written as the page service writes it, src/editor/page-service.mjs).
    const blocks = path.join(projectRoot, "tests", "fixtures", "page-blocks", "local");
    for (const name of ["memo", "hello"]) await fs.cp(path.join(blocks, name), path.join(reports, "components", "local", name), { recursive: true });
    await fs.cp(path.join(projectRoot, "tests", "fixtures", "components", "local", "tally"), path.join(reports, "components", "local", "tally"), { recursive: true });
    const homeFile = path.join(reports, "pages", "home", "page.html");
    const first = await gallery(["page", "add", "home", "local/memo"]);
    assert.equal(first.code, 0, first.stderr);
    assert.deepEqual(linesOf(first.stdout).slice(0, 2), [`Added a card of local/memo to ${shownPath(homeFile)}:`, '  data-card-id="c1" on board main: x 0, y 0, w 4, h 2'], "its id and cells, memo's first size at the first free spot");
    const second = await gallery(["page", "add", "home", "local/memo", "--x", "0", "--y", "0"]);
    assert.deepEqual(linesOf(second.stdout).slice(1, 3), ['  data-card-id="c2" on board main: x 0, y 0, w 4, h 2', "  Pushed down under it, as it met them: c1 (y 2); no card moved up."], "put where it is told, c1 pushed under it");
    const third = await gallery(["page", "add", "home", "local/hello", "--board", "main"]);
    assert.equal(linesOf(third.stdout)[1], '  data-card-id="c3" on board main: x 4, y 0, w 6, h 1', "the first free spot for 6 x 1");
    const text = await fs.readFile(homeFile, "utf8");
    assert.ok(text.includes('<section class="gallery-card" data-card-id="c1" data-x="0" data-y="2" data-w="4" data-h="2">\n        <div data-doc-component="local/memo">'), text);
    const pageState = path.join(reports, ".gallery", "state", "pages", "home");
    assert.equal((await fs.readdir(pageState)).filter((name) => name.endsWith(".html")).length, 3, "the file kept before each write");
    // Each told as the Agent's (agent: true), no gesture of the user's that gallery page check would mark.
    const told = (await fs.readFile(path.join(pageState, "writes.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(told.map(({ op, by, cards }) => [op, by, cards]), [["add", "agent", { c1: ["added"] }], ["add", "agent", { c1: ["cells"], c2: ["added"] }], ["add", "agent", { c3: ["added"] }]], JSON.stringify(told));
    for (const [args, said] of [
      [["page", "add", "home", "local/tally"], "local/tally is a block of documents (its manifest's places has no \"page\"): it does not go on a custom page. To make it a card too, write \"places\": [\"document\", \"page\"] in its component.json (\"card\": { \"sizes\": [[4, 3]] } sizes it; on a page no text part is edited: what a reader changes there goes in a data part), then run this again."],
      [["page", "add", "home", "local/none"], "No custom block local/none in this workspace: gallery block list lists them."],
      [["page", "add", "home", "card"], "gallery/card is one of Gallery's own blocks, not yet in this workspace: gallery block add card puts it in; then run this again."],
      [["page", "add", "home", "local/memo", "--board", "side"], "No board \"side\" on this page: its <div class=\"gallery-board\" data-board-id=\"…\">s are the ones there are."],
      [["page", "add", "nope", "local/memo"], `No custom page "nope": ${shownPath(path.join(reports, "pages", "nope", "page.html"))} does not exist (gallery page list lists those there are).`],
    ]) {
      const refused = await gallery(args);
      assert.deepEqual([refused.code, refused.stderr.trim()], [1, said], args.join(" "));
    }
    assert.equal(await fs.readFile(homeFile, "utf8"), text, "a refused add writes nothing");
    // A card put into a free spot with a card under it in its columns: nothing pushed, none said to be.
    const below = await gallery(["page", "add", "home", "local/memo", "--x", "4", "--y", "4"]);
    assert.equal(linesOf(below.stdout)[1], '  data-card-id="c4" on board main: x 4, y 4, w 4, h 2', below.stderr);
    const hole = await gallery(["page", "add", "home", "local/memo"]);
    assert.equal(linesOf(hole.stdout)[1], '  data-card-id="c5" on board main: x 4, y 1, w 4, h 2', "the free spot under hello, c4 under it");
    assert.ok(!/under it/.test(hole.stdout), `nothing pushed, no card said to be under it: ${hole.stdout}`);
    // --set <key>=<value>: a block's settings written with the add, in its one write, each held to its field's type before anything
    // is written (found testing the skill with Agents, 2026-11-09: a weather card handed over with no city, the way to give it one a hand edit of page.html).
    // Added with none, a block with a setting it cannot do without says so after the card.
    assert.equal((await gallery(["block", "add", "weather"])).code, 0);
    const bare = await gallery(["page", "add", "home", "weather"]);
    assert.equal(bare.code, 0, bare.stderr);
    assert.ok(linesOf(bare.stdout).at(-1).startsWith('gallery/weather needs its setting city (City, 城市) before the card shows anything, and this card has none: ask the user for it, or take it from what the workspace says (写作偏好, the documents) and tell them in the handoff which you did. Give it with the add (--set city=<value>); for this card, write it in its settings part of '), bare.stdout);
    const withCity = await gallery(["page", "add", "home", "weather", "--set", "city=上海", "--set=unit=℉"]);
    assert.equal(withCity.code, 0, withCity.stderr);
    assert.ok(linesOf(withCity.stdout).includes('  Settings written with it: city="上海", unit="℉"') && linesOf(withCity.stdout).some((line) => line.startsWith("The rest of its data is as the block's template writes it")), withCity.stdout);
    assert.ok(!withCity.stdout.includes("needs its setting"), "a card with its city asks for nothing");
    const afterSets = await fs.readFile(homeFile, "utf8");
    const weatherCard = afterSets.slice(afterSets.indexOf('data-card-id="c7"'));
    assert.match(weatherCard, /<script type="application\/json">\{\s*"city":\s*"上海",\s*"unit":\s*"℉"\s*\}<\/script>/, weatherCard);
    const setTold = (await fs.readFile(path.join(pageState, "writes.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line)).at(-1);
    assert.deepEqual([setTold.op, setTold.by, setTold.cards.c7], ["add", "agent", ["added"]], "one write, the Agent's: no second one for the settings");
    for (const [args, said, code] of [
      [["page", "add", "home", "weather", "--set", "town=x"], 'gallery/weather has no setting "town": its settings are city (City), unit (Unit).', 2],
      [["page", "add", "home", "weather", "--set", "unit=K"], "The setting unit of gallery/weather is one of ℃, ℉: --set unit=<one of them>.", 2],
      [["page", "add", "home", "weather", "--set", "city"], "--set takes a setting's key and its value: --set <key>=<value> (--set city=上海).", 2],
      [["page", "add", "home", "local/memo", "--set", "a=b"], 'local/memo has no setting "a": it has no settings.', 2],
      [["page", "check", "home", "--set", "city=x"], "--set goes with add and card, not check.", 2],
    ]) {
      const wrong = await gallery(args);
      assert.deepEqual([wrong.code, linesOf(wrong.stderr)[0]], [code, said], args.join(" "));
    }
    assert.equal(await fs.readFile(homeFile, "utf8"), afterSets, "a refused --set writes nothing");
    await fs.rm(path.join(reports, "components", "gallery"), { recursive: true, force: true });
    await fs.rm(path.join(reports, ".gallery", "blocks.json"), { force: true });
    for (const name of ["memo", "hello", "tally"]) await fs.rm(path.join(reports, "components", "local", name), { recursive: true });
    await fs.rm(path.join(reports, "pages"), { recursive: true });
    await fs.rm(path.join(reports, ".gallery", "state", "pages"), { recursive: true, force: true });
  }
  // A slug of the trash is refused: the page there goes by it, and its address would open the new one.
  // A title takes no slug: a page's link holds its own id.
  {
    await gallery(["new", "named", "pagex"], reports);
    const free = await gallery(["new", "pagex", "又一份"], reports);
    assert.equal(free.code, 0, free.stderr);
    await fs.rm(path.join(reports, "pagex"), { recursive: true });
    const trashFolder = path.join(reports, ".gallery", "trash");
    await fs.mkdir(path.join(trashFolder, "a1-binned", "report"), { recursive: true });
    await fs.writeFile(path.join(trashFolder, "a1-binned", "report", "doc.html"), "<!doctype html>");
    await fs.writeFile(path.join(trashFolder, "a1-binned", "entry.json"), JSON.stringify({ id: "a1-binned", slug: "binned", title: "回收区里的", at: 1, parent: "", index: 0 }));
    const binned = await gallery(["new", "binned", "又一份"], reports);
    assert.deepEqual([binned.code, binned.stderr.trim()], [1, '"binned" is the slug of something in the trash: choose another slug.']);
    assert.equal(await fs.access(path.join(reports, "binned")).then(() => true, () => false), false, "nothing made");
    // The Agent's slug is kept, even one of the workbench's own look (doc- and eight characters, whose eight are the page id):
    // unless another name of the workspace has that id (a document by its hash, one of the trash), which would give two documents one address.
    const idOfBinned = `doc-${pageId("binned")}`;
    const sharing = await gallery(["new", idOfBinned, "又一份"], reports);
    assert.deepEqual([sharing.code, sharing.stderr.trim()], [1, `"${idOfBinned}" would have the page id (${pageId("binned")}) of "binned" in this workspace, and two documents may not share an address: choose another slug.`]);
    assert.equal((await gallery(["new", "idholder", "占着号的"], reports)).code, 0);
    const idOfHolder = `doc-${pageId("idholder")}`;
    const sharingFolder = await gallery(["new", idOfHolder, "又一份"], reports);
    assert.deepEqual([sharingFolder.code, sharingFolder.stderr.trim()], [1, `"${idOfHolder}" would have the page id (${pageId("idholder")}) of "idholder" in this workspace, and two documents may not share an address: choose another slug.`]);
    assert.equal(await fs.access(path.join(reports, idOfHolder)).then(() => true, () => false), false, "nothing made");
    const kept = await gallery(["new", "doc-fresh001", "自己起的名字"], reports);
    assert.equal(kept.code, 0, kept.stderr);
    assert.equal(JSON.parse(await fs.readFile(path.join(reports, "doc-fresh001", "doc.json"), "utf8")).title, "自己起的名字", "a free doc-<id> is the Agent's slug as any");
    assert.equal(pageId("doc-fresh001"), "fresh001", "and its address ends with the eight");
    await fs.rm(path.join(reports, "doc-fresh001"), { recursive: true });
    await fs.rm(path.join(reports, "idholder"), { recursive: true });
    // A command told of a document in the trash says so, by any name it goes by.
    for (const name of ["binned", pageId("binned"), `http://localhost:9/#回收区里的-${pageId("binned")}/ab12cd34`]) {
      const said = await gallery(["check", name], reports);
      assert.deepEqual([said.code, linesOf(said.stderr)[0]], [2, `${name} is a document in the trash ("回收区里的"): it has to be restored in the workbench first.`]);
    }
    // gallery list, the way from an address to a document, says the same when nothing else is found.
    for (const name of ["binned", pageId("binned"), `http://localhost:9/#回收区里的-${pageId("binned")}/ab12cd34`, "C:/Program Files/Git/#回收区里的-" + pageId("binned")]) {
      const said = await gallery(["list", name], reports);
      assert.deepEqual([said.code, linesOf(said.stdout).at(-1)], [0, `${name} is a document in the trash ("回收区里的"): it has to be restored in the workbench first.`], said.stdout);
    }
    // A custom page of the trash (an entry of kind page) is said to be one, never a document.
    await fs.mkdir(path.join(trashFolder, "a2-shelved", "page"), { recursive: true });
    await fs.writeFile(path.join(trashFolder, "a2-shelved", "page", "page.html"), "<!doctype html>");
    await fs.writeFile(path.join(trashFolder, "a2-shelved", "entry.json"), JSON.stringify({ id: "a2-shelved", kind: "page", slug: "shelved", title: "书单", at: 2, parent: "", index: -1 }));
    const pageSaid = 'shelved is a custom page in the trash ("书单"), not a document: once it is restored in the workbench, gallery page open shelved --no-browser gives its address.';
    const checked = await gallery(["check", "shelved"], reports);
    assert.deepEqual([checked.code, linesOf(checked.stderr)[0]], [2, pageSaid], checked.stderr);
    const listed = await gallery(["list", "shelved"], reports);
    assert.deepEqual([listed.code, linesOf(listed.stdout).at(-1)], [0, pageSaid], listed.stdout);
    await fs.rm(path.join(trashFolder, "a2-shelved"), { recursive: true });
    await fs.rm(path.join(trashFolder, "a1-binned"), { recursive: true });
    await fs.rm(path.join(reports, "named"), { recursive: true });
  }

  {
    // list: every document, the one edited last first, each with its slug and title, its
    // description, its last edit and its file; the 写作偏好 page and folders no command opens (a name
    // that is no slug, no doc.html in it) left out. With words: those whose title, description or
    // slug holds any of them, the best first; Chinese found inside words; none found said so.
    const folders = [
      ["weekly", { title: "检索排序周报", description: "每周的排序评测", type: "report" }, true],
      ["ranking-notes", { title: "排序笔记", description: "检索与排序的笔记", type: "report" }, true],
      ["instructions", { title: "写作偏好", description: "d", type: "report", instructions: true }, true],
      ["Weird Name", { title: "不是 slug", description: "d", type: "report" }, true],
      ["no-page", { title: "没有页面", description: "d", type: "report" }, false],
    ];
    for (const [index, [slug, metadata, page]] of folders.entries()) {
      await fs.mkdir(path.join(reports, slug));
      await fs.writeFile(path.join(reports, slug, "report.json"), JSON.stringify(metadata));
      if (page) {
        await fs.writeFile(path.join(reports, slug, "report.html"), fresh);
        const at = new Date(Date.now() + (index + 1) * 60_000); // weekly, then ranking-notes: edited after the fresh ones
        await fs.utimes(path.join(reports, slug, "report.html"), at, at);
      }
    }
    const listing = await gallery(["list"]);
    assert.equal(listing.code, 0, listing.stderr);
    const lines = linesOf(listing.stdout);
    assert.deepEqual(lines.slice(0, 4), [`工作区：${reports}`, ...preferenceLines(), "6 documents, the one edited last first:"], listing.stdout);
    const heads = lines.filter((line) => !line.startsWith(" ")).slice(3);
    assert.deepEqual(heads.slice(0, 2), ["ranking-notes  排序笔记", "weekly  检索排序周报"], listing.stdout);
    assert.deepEqual(heads.slice(2).sort(), ["fresh  -5% 的季度", "fresh-q3  -Q3 回顾", "fresh-q4  第四季度", "natural  自然写法"].sort(), listing.stdout);
    const block = lines.slice(lines.indexOf("weekly  检索排序周报"), lines.indexOf("weekly  检索排序周报") + 5);
    assert.deepEqual([block[1], block[2], block[4]], ["  说明：每周的排序评测", `  地址：/#检索排序周报-${pageId("weekly")}`, `  ${shownPath(path.join(reports, "weekly", "report.html"))}`]);
    // Listed from a workspace that is not home, the address names that workspace first (~ws-<id>/), as gallery open gives it.
    const away = await gallery(["list", "weekly"], reports, { GALLERY_DEFAULT_WORKSPACE: path.join(root, "list-home") });
    assert.ok(linesOf(away.stdout).includes(`  地址：/#~${workspaceId(reports)}/检索排序周报-${pageId("weekly")}`), away.stdout);
    assert.match(block[3], /^ {2}上次编辑：\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    // An address a person hands over, or its link, finds its document, by a title it has left too.
    for (const name of [`http://127.0.0.1:4317/#${encodeURIComponent("旧的标题")}-${pageId("weekly")}/ab12cd34`, `检索排序周报-${pageId("weekly")}`, pageId("weekly"), `#${pageId("weekly")}`]) {
      const found = linesOf((await gallery(["list", name])).stdout);
      // One document found by name: the last line is the address to give the user, here the hint that no server runs.
      assert.deepEqual(found.filter((line) => !line.startsWith(" ")).slice(2), ["1 of 6 documents, the best match first:", "weekly  检索排序周报", "提示：Gallery 没在运行，所以还没有完整的地址可以交给用户；交稿时运行 gallery open weekly --no-browser，打出 交给用户 那一行。"], name);
    }
    // Git Bash writes a path of its own over what starts with /, as /#<link> does: every command reads it.
    const bash = `C:/Program Files/Git/#检索排序周报-${pageId("weekly")}`;
    assert.deepEqual(linesOf((await gallery(["list", bash])).stdout).filter((line) => !line.startsWith(" ")).slice(2, 4), ["1 of 6 documents, the best match first:", "weekly  检索排序周报"], "the address gallery list prints, handed back in Git Bash");
    assert.deepEqual(linesOf((await gallery(["list", `${bash}/ab12cd34`])).stdout).filter((line) => !line.startsWith(" ")).slice(2, 4), ["1 of 6 documents, the best match first:", "weekly  检索排序周报"], "with a block");
    assert.deepEqual(linesOf((await gallery(["list", `https://example.com/#${pageId("weekly")}`])).stdout).at(-1).slice(0, 12), "No document'", "a web address is no document's");
    // A title that leaves no words is the id alone, whatever the file leaves out: list and open give one address.
    {
      const untitled = path.join(reports, "weekly", "report.json");
      const kept = await fs.readFile(untitled, "utf8");
      for (const written of ['{ "title": "" }', "{}"]) {
        await fs.writeFile(untitled, written);
        const block = linesOf((await gallery(["list", pageId("weekly")])).stdout);
        assert.deepEqual([block.find((line) => line.startsWith("weekly")), block.find((line) => line.includes("地址："))], ["weekly  weekly", `  地址：/#${pageId("weekly")}`], written);
      }
      await fs.writeFile(untitled, kept);
    }
    assert.ok(linesOf((await gallery(["list", "fresh"])).stdout).includes("3 of 6 documents, the best match first:"), "a folder name is a word like any");
    const named = linesOf((await gallery(["list", "--", "检索", "排序"])).stdout);
    assert.deepEqual(named.filter((line) => !line.startsWith(" ")).slice(2), ["2 of 6 documents, the best match first:", "weekly  检索排序周报", "ranking-notes  排序笔记"], "both hold both words: the one with both in its title first");
    const one = linesOf((await gallery(["list", "Q4"])).stdout);
    assert.deepEqual(one.filter((line) => !line.startsWith(" ")).slice(2), ["1 of 6 documents, the best match first:", "fresh-q4  第四季度", "提示：Gallery 没在运行，所以还没有完整的地址可以交给用户；交稿时运行 gallery open fresh-q4 --no-browser，打出 交给用户 那一行。"], "a slug's words, upper and lower case alike; one document found: the address to give the user ends the list (here the hint that no server runs)");
    const none = await gallery(["list", "鹦鹉螺"]);
    assert.ok(none.code === 0 && none.stdout.trimEnd().endsWith('No document\'s title, description, slug or text holds "鹦鹉螺": gallery list lists all 6.'), none.stdout);
    for (const [slug] of folders) await fs.rm(path.join(reports, slug), { recursive: true });
    for (const slug of ["fresh-q3", "fresh-q4"]) await fs.rm(path.join(reports, slug), { recursive: true });
    await fs.rm(preferences);
  }

  // ---------- the sidebar's tree: list --tree, new --under/--after/--first, move, set ----------
  // With no server running (tests/unit/cli-server.mjs runs one): the outline written here, under its lock.
  {
    const tree = path.join(root, "tree");
    const g = (args) => gallery(args, tree, { GALLERY_DATA_DIR: path.join(root, "tree-data") });
    const stored = async () => JSON.parse(await fs.readFile(path.join(tree, ".gallery", "outline.json"), "utf8")).children;
    const made = (slug) => fs.access(path.join(tree, slug)).then(() => true, () => false);
    for (const [slug, title] of [["project", "项目"], ["loose", "零散"]]) assert.equal((await g(["new", slug, title, "说明"])).code, 0);
    // new --under: last under it; with --first, first; --after (named by its link here): right after it, at its level.
    const under = await g(["new", "notes", "排序笔记", "--under", "project"]);
    assert.deepEqual([under.code, linesOf(under.stdout)[1]], [0, "Placed it under project (项目), the only document there."], under.stdout + under.stderr);
    assert.equal(linesOf((await g(["new", "weekly", "检索排序周报", "--under", "project", "--first"])).stdout)[1], "Placed it under project (项目), first.");
    assert.equal(linesOf((await g(["new", "sub", "子文档", "--after", pageLink({ slug: "weekly", title: "检索排序周报" })])).stdout)[1], "Placed it under project (项目), right after weekly (检索排序周报).");
    assert.deepEqual(await stored(), { "": ["loose", "project"], project: ["weekly", "sub", "notes"] }, "the two made before any place in it, in the order of their folders");
    assert.equal(linesOf((await g(["new", "plain", "不放哪里"])).stdout).some((line) => line.startsWith("Placed")), false, "neither: at the top level, said as before");
    await fs.rm(path.join(tree, "plain"), { recursive: true });
    // Refused before anything is made: a document that is not there, an --after at another level, the
    // 写作偏好 page; a document of the trash and two places at once are mistakes in the command line.
    await fs.mkdir(path.join(tree, ".gallery", "pages", "writing-preferences"), { recursive: true });
    await fs.writeFile(path.join(tree, ".gallery", "pages", "writing-preferences", "doc.html"), "<!doctype html><main></main>");
    await fs.mkdir(path.join(tree, ".gallery", "trash", "a1-binned", "report"), { recursive: true });
    await fs.writeFile(path.join(tree, ".gallery", "trash", "a1-binned", "report", "doc.html"), "<!doctype html>");
    await fs.writeFile(path.join(tree, ".gallery", "trash", "a1-binned", "entry.json"), JSON.stringify({ id: "a1-binned", slug: "binned", title: "回收区里的", at: 1, parent: "", index: 0 }));
    for (const [args, code, said] of [
      [["--under", "nothing"], 1, 'No document "nothing" (--under): gallery list --tree shows the documents and where they are. Nothing made.'],
      [["--under", "project", "--after", "loose"], 1, "loose (零散) is not under project (项目): --after names a document at the level it goes to. Nothing made."],
      [["--under", "writing-preferences"], 1, "writing-preferences is the 写作偏好 page, which the sidebar lists apart: it moves nowhere and holds no documents (--under). Nothing made."],
      [["--under", "binned"], 2, 'binned is a document in the trash ("回收区里的"): it has to be restored in the workbench first.'],
      [["--after", "loose", "--first"], 2, "--after and --first are two places: give one."],
    ]) {
      const refused = await g(["new", "refused", "不该有", ...args]);
      assert.deepEqual([refused.code, linesOf(refused.stderr)[0]], [code, said], args.join(" "));
      assert.equal(await made("refused"), false, `nothing made: ${args.join(" ")}`);
    }

    // list --tree: the sidebar's order, a level two spaces in, each line its slug, title, description, last edit.
    const whole = linesOf((await g(["list", "--tree"])).stdout).slice(3);
    assert.deepEqual(whole.map((line) => line.replace(/ {2}（.*）$/, "")), ["5 documents, as the sidebar shows them (one under another indented):", "loose  零散", "project  项目", "  weekly  检索排序周报", "  sub  子文档", "  notes  排序笔记"]);
    assert.match(whole[2], /^project {2}项目 {2}（说明：说明；上次编辑：\d{4}-\d\d-\d\d \d\d:\d\d）$/);
    assert.match(whole[4], /^ {2}sub {2}子文档 {2}（说明：新文档；上次编辑：/);
    // --tree <document>: where it is, then it and those under it.
    assert.deepEqual(linesOf((await g(["list", "--tree", "project"])).stdout).slice(3).map((line) => line.replace(/ {2}（.*）$/, "")), ["位置：顶层", "project (项目) and the 3 documents under it, as the sidebar shows them:", "project  项目", "  weekly  检索排序周报", "  sub  子文档", "  notes  排序笔记"]);
    assert.deepEqual(linesOf((await g(["list", "--tree", "notes"])).stdout).slice(3).map((line) => line.replace(/ {2}（.*）$/, "")), ["位置：project (项目)", "notes (排序笔记), with no document under it:", "notes  排序笔记"]);
    assert.deepEqual([(await g(["list", "--tree", "nothing"])).code, (await g(["list", "--tree", "a", "b"])).code, (await g(["list", "--tree", "binned"])).code], [1, 2, 2]);
    // The flat list: where a document is when it is under another; words found in a document's text
    // come after those its title, description or slug holds, with the first place.
    const flat = linesOf((await g(["list", "排序"])).stdout);
    const notesAt = flat.indexOf("notes  排序笔记");
    assert.deepEqual(flat.slice(notesAt, notesAt + 3), ["notes  排序笔记", "  说明：新文档", "  位置：project (项目)"], flat.join("\n"));
    const loose = path.join(tree, "loose", "doc.html");
    await fs.writeFile(loose, (await fs.readFile(loose, "utf8")).replace(/<p>[^<]*<\/p>/, "<p>一只鹦鹉螺的壳，排序之外。</p>"));
    const found = linesOf((await g(["list", "鹦鹉螺", "子文档"])).stdout).slice(3);
    assert.deepEqual(found.filter((line) => !/^ {2}(地址|上次编辑|[A-Z]:|\/)/.test(line)), ["2 of 5 documents, the best match first:", "sub  子文档", "  说明：新文档", "  位置：project (项目)", "loose  零散", "  说明：说明", "  正文：一只鹦鹉螺的壳，排序之外。"]);
    assert.ok(linesOf((await g(["list", "排序"])).stdout).indexOf("loose  零散") > notesAt, "a title's match before a text's");
    assert.equal(linesOf((await g(["list", "没有的词"])).stdout).at(-1), 'No document\'s title, description, slug or text holds "没有的词": gallery list lists all 5.');

    // move: with the documents under it, said where it went and where it was; no document's file changes.
    const files = async () => Promise.all(["project", "loose", "notes", "weekly", "sub"].map((slug) => fs.readFile(path.join(tree, slug, "doc.html"), "utf8")));
    const before = await files();
    const moved = await g(["move", "loose", "--under", "notes"]);
    assert.deepEqual([moved.code, ...linesOf(moved.stdout)], [0, "Moved loose (零散): now under notes (排序笔记), the only document there; it was at the top level, first.", "位置：project (项目) › notes (排序笔记)"], moved.stderr);
    const again = await g(["move", "loose", "--under", "notes"]);
    assert.deepEqual([again.code, linesOf(again.stdout)[0]], [0, "loose (零散) is there already: under notes (排序笔记), the only document there."]);
    const up = await g(["move", "notes", "--top", "--after", "project"]);
    assert.equal(linesOf(up.stdout)[0], "Moved notes (排序笔记) with the 1 document under it: now at the top level, right after project (项目), last; it was under project (项目), right after sub (子文档), last.");
    assert.equal(linesOf((await g(["move", "sub", "--first"])).stdout)[0], "Moved sub (子文档): now under project (项目), first; it was under project (项目), right after weekly (检索排序周报), last.");
    assert.deepEqual(await stored(), { "": ["project", "notes"], project: ["sub", "weekly"], notes: ["loose"] });
    assert.deepEqual(await files(), before, "no document's file changes");
    for (const [args, code, said] of [
      [["notes", "--under", "loose"], 1, "notes (排序笔记) cannot go under loose (零散), which is under it."],
      [["notes", "--under", "notes"], 1, "notes (排序笔记) cannot go under itself."],
      [["notes", "--after", "notes"], 1, "notes (排序笔记) cannot go after itself."],
      [["notes", "--after", "loose"], 1, "notes (排序笔记) cannot go after loose (零散), which is under it."],
      [["project", "--after", "sub"], 1, "project (项目) cannot go after sub (子文档), which is under it."],
      [["notes", "--under", "project", "--after", "loose"], 1, "loose (零散) is not under project (项目): --after names a document at the level it goes to."],
      [["nothing", "--top"], 1, 'No document "nothing" (the document to move): gallery list --tree shows the documents and where they are.'],
      [["writing-preferences", "--top"], 1, "writing-preferences is the 写作偏好 page, which the sidebar lists apart: it moves nowhere and holds no documents (the document to move)."],
      [["notes", "--under", "binned"], 2, 'binned is a document in the trash ("回收区里的"): it has to be restored in the workbench first.'],
      [["notes"], 2, "Say where it goes: --under <document>, --top or --column <column>, and --after <document> or --first."],
      [["notes", "--under", "project", "--top"], 2, "--under and --top are two places: give one."],
      [["notes", "loose", "--top"], 2, "Name the document to move, one."],
    ]) {
      const refused = await g(["move", ...args]);
      assert.deepEqual([refused.code, linesOf(refused.stderr)[0]], [code, said], args.join(" "));
    }
    assert.deepEqual(await stored(), { "": ["project", "notes"], project: ["sub", "weekly"], notes: ["loose"] }, "a refused move changes nothing");
    // Moves run at once (an Agent's parallel commands) are each written: the outline's lock.
    const many = ["m1", "m2", "m3", "m4"];
    for (const slug of many) await g(["new", slug, slug.toUpperCase()]);
    const ran = await Promise.all(many.map((slug) => g(["move", slug, "--under", "notes"])));
    assert.deepEqual(ran.map(({ code }) => code), [0, 0, 0, 0], ran.map(({ stderr }) => stderr).join("\n"));
    assert.deepEqual([...(await stored()).notes].sort(), ["loose", ...many], "none lost");
    assert.equal(await fs.access(path.join(tree, ".gallery", "outline.lock")).then(() => true, () => false), false, "the lock let go");

    // set: the title in the h1, <title> and doc.json; the icon in the header and doc.json; the description in doc.json; the rest of doc.html as it was.
    const page = path.join(tree, "weekly", "doc.html");
    const header = /<header class="doc-header">[\s\S]*?<\/header>/;
    const plainBefore = await fs.readFile(page, "utf8");
    const set = await g(["set", "weekly", "--title", "周报  <第二版>", "--icon", "📊", "--description", "新的说明"]);
    assert.deepEqual([set.code, ...linesOf(set.stdout)], [0, "Set weekly:",
      '  title: "检索排序周报" → "周报 <第二版>" (doc.html\'s h1 and <title>, doc.json)',
      '  icon: none → "📊" (doc.html\'s header, doc.json)',
      '  description: "新文档" → "新的说明" (doc.json)'], set.stderr);
    const written = await fs.readFile(page, "utf8");
    assert.equal(header.exec(written)[0], '<header class="doc-header">\n      <div class="doc-icon">📊</div>\n      <h1 class="doc-title">周报 &lt;第二版&gt;</h1>\n    </header>');
    assert.match(written, /<title>周报 &lt;第二版&gt;<\/title>/);
    assert.equal(written.replace(header, "").replace(/<title>.*<\/title>/, ""), plainBefore.replace(header, "").replace(/<title>.*<\/title>/, ""), "nothing else of doc.html changes");
    const { created: madeAt, ...metadataSet } = JSON.parse(await fs.readFile(path.join(tree, "weekly", "doc.json"), "utf8"));
    assert.deepEqual(metadataSet, { title: "周报 <第二版>", description: "新的说明", type: "report", icon: "📊" });
    assert.ok(Number.isFinite(Date.parse(madeAt)), "gallery new's created kept by gallery set");
    // An icon of the 图标 tab, as Git Bash hands it over too; none takes it away, with its line.
    assert.equal((await g(["set", "weekly", "--icon", "C:/Program Files/Git/icons/airplane_blue.svg"])).code, 0);
    assert.match(await fs.readFile(page, "utf8"), /\n {6}<div class="doc-icon" data-icon="\/icons\/airplane_blue\.svg"><\/div>\n {6}<h1/);
    assert.equal(JSON.parse(await fs.readFile(path.join(tree, "weekly", "doc.json"), "utf8")).icon, "/icons/airplane_blue.svg");
    assert.equal((await g(["set", "weekly", "--icon", "none"])).code, 0);
    assert.equal(header.exec(await fs.readFile(page, "utf8"))[0], '<header class="doc-header">\n      <h1 class="doc-title">周报 &lt;第二版&gt;</h1>\n    </header>');
    assert.equal(JSON.parse(await fs.readFile(path.join(tree, "weekly", "doc.json"), "utf8")).icon, undefined);
    assert.deepEqual(linesOf((await g(["set", "weekly", "--description", "新的说明"])).stdout), ["Nothing to change: weekly has that already."]);
    await fs.writeFile(path.join(tree, "sub", "doc.html"), "<!doctype html><html><head><title>x</title></head><body><main><p>没有标题</p></main></body></html>");
    for (const [args, code, said] of [
      [["weekly"], 2, 'Say what to set: --title "<title>", --icon <emoji|none|…>, --description "<text>", --font/--size/--spacing/--width <value>, --full on|off, --wide-tables on|off, or --all.'],
      [["weekly", "--title", "  "], 2, "--title takes the words of the title: a document's title is never empty."],
      [["weekly", "--icon", "abc"], 2, "Not a page icon: abc (an emoji, none, an icon of the 图标 tab as /icons/<name>_<color>.svg, a picture of the document's assets/, or the name of a custom emoji: gallery emoji list lists them)."],
      [["weekly", "--icon", "/icons/nothing-such_blue.svg"], 2, "No such icon of the 图标 tab: /icons/nothing-such_blue.svg."],
      [["weekly", "--icon", "assets/logo.png"], 1, `No picture assets/logo.png in ${shownPath(path.join(tree, "weekly"))}: put it in its assets/ first.`],
      [["sub", "--title", "新"], 1, `${shownPath(path.join(tree, "sub", "doc.html"))} has no title to set: write it as an h1.doc-title in the page's header (writing-html.md, "The page").`],
      [["writing-preferences", "--title", "新"], 1, "writing-preferences is the 写作偏好 page: only the user changes it."],
      [["nothing", "--title", "新"], 1, `No document "nothing": ${shownPath(path.join(tree, "nothing", "doc.html"))} does not exist (gallery list lists those there are).`],
      [["binned", "--title", "新"], 2, 'binned is a document in the trash ("回收区里的"): it has to be restored in the workbench first.'],
    ]) {
      const refused = await g(["set", ...args]);
      assert.deepEqual([refused.code, linesOf(refused.stderr)[0]], [code, said], args.join(" "));
    }
  }

  // ---------- check and export ----------
  // Check writes nothing; the export hands the document in. Both first say, once, what the preview
  // wrote as the kit's markup when the reader edited the document (the edit service's record).
  const said = (stdout) => /^preview \S*natural[\\/]doc\.html: at \d\d:\d\d, when the reader edited the page, the preview wrote your natural HTML as the kit's markup: line 12 details, line 20 chart t1$/.test(stdout.split(/\r?\n/)[0]);
  const rewrote = () => keepRewrite({ stateDirectory: path.join(reports, ".gallery", "state"), reportsDirectory: reports, slug: "natural", time: new Date().toISOString(), changes: [{ line: 20, rule: "chart", key: "t1" }, { line: 12, rule: "details" }] });
  await rewrote();
  for (const name of [`http://localhost:1/#${encodeURIComponent("一个旧标题")}-${pageId("natural")}`, pageLink({ slug: "natural", title: "自然写法" }), `${pageId("natural")}/ab12cd34`, "/generated/natural.html"]) {
    const each = await gallery(["check", name, "natural", "--allow-failures"]);
    assert.ok(each.code === 0 && (each.stdout.match(/natural \S*natural[\\/]doc\.html: mark/g) ?? []).length === 1, `${name}: that document, once: ${each.stdout}${each.stderr}`);
    await rewrote();
  }
  const checked = await gallery(["check", "natural"]);
  assert.equal(checked.code, 0, checked.stdout + checked.stderr);
  assert.ok(said(checked.stdout) && checked.stdout.includes("  those lines are the file's as you had left it"), `check says what the preview wrote, first: ${checked.stdout}`);
  assert.match(checked.stdout, /natural \S*natural[\\/]doc\.html: mark \(line \d+\) not rewritten yet: the export rewrites them in this file as the kit's markup \(nothing to fix\)/, checked.stdout);
  const paragraphLine = original.slice(0, original.indexOf("<p>一段")).split("\n").length;
  assert.ok(checked.stdout.replace(/\r\n/g, "\n").includes(`${path.sep}natural${path.sep}doc.html: 1 block without an id yet: the export gives it one\n  line ${paragraphLine} <p>\n`), checked.stdout);
  assert.match(checked.stdout, /OK {3}natural/);
  assert.ok(checked.stdout.includes("Checked 1 document: 1 passed, 0 failed."), checked.stdout);
  // None named: every document (natural, and fresh, whose starter section fails it).
  const all = await gallery(["check"]);
  assert.equal(all.code, 1, all.stdout + all.stderr);
  assert.ok(all.stdout.includes("Checked 2 documents: 1 passed, 1 failed.") && all.stderr.trimEnd().endsWith("1 document failed: fresh"), all.stdout + all.stderr);
  assert.equal((await gallery(["check", "--allow-failures"])).code, 0, "--allow-failures");
  await fs.rm(path.join(reports, "fresh"), { recursive: true });
  // The 批注 Gallery deleted, their words gone: said once, by the check as by the export.
  const deleted = () => keepDropped({ stateDirectory: path.join(reports, ".gallery", "state"), reportsDirectory: reports, slug: "natural", time: new Date().toISOString(), items: [{ id: "lob25hue", text: "补一句", quote: "一段标记过", kind: "text" }] });
  const deletion = (stdout) => /^annotations \S*[\\/]natural[\\/]annotations\.json: at \d\d:\d\d, Gallery deleted 1 批注 \(annotation\) whose words are gone from the document \(rewritten or deleted\):\n {2}lob25hue "补一句" on "一段标记过"\n/m.test(stdout.replace(/\r\n/g, "\n"))
  await deleted();
  const told = await gallery(["check", "natural"]);
  assert.ok(told.code === 0 && deletion(told.stdout), `the check says the deletion: ${told.stdout}`);
  assert.ok(!deletion((await gallery(["check", "natural"])).stdout), "once");
  await deleted();
  assert.equal(await fs.readFile(file, "utf8"), original, "check leaves the natural file byte for byte");
  const exported = await gallery(["export", "natural"]);
  assert.equal(exported.code, 0, exported.stdout + exported.stderr);
  assert.ok(!exported.stdout.includes("when the reader edited"), "said once");
  assert.ok(deletion(exported.stdout), `the export says the deletion: ${exported.stdout}`);
  const handed = await fs.readFile(file, "utf8");
  assert.ok(handed.includes('<span class="doc-highlight-yellow">标记过</span>'), "the kit's markup");
  assert.deepEqual(findUnits(handed).units.filter((unit) => !unit.blockId).map((unit) => unit.tag), [], "every block has an id");
  const lines = linesOf(exported.stdout);
  assert.ok(lines.some((line) => /^natural \S*natural[\\/]doc\.html: mark \(line \d+\) rewritten in this file as the kit's markup \(nothing to fix\); the words and numbers are unchanged$/.test(line)), exported.stdout);
  const counted = lines.findIndex((line) => /^ids \S*natural[\\/]doc\.html: 1 block given an id$/.test(line));
  assert.ok(counted >= 0, exported.stdout);
  const [, givenLine, givenId] = /^ {2}line (\d+) <p> → ([a-z][a-z0-9]{7})$/.exec(lines[counted + 1]) ?? [];
  assert.ok(givenId && handed.split("\n")[Number(givenLine) - 1].includes(`<p data-block-id="${givenId}">一段`), `${lines[counted + 1]}\n${handed}`);
  // What it made first (its absolute path), then what the hand-in wrote (no 重读 line: whether to read
  // the file again is the Agent's), and last the deliverable, the export's absolute path (the workspace's exports/).
  const deliverablePath = path.join(reports, "exports", "natural.html");
  const deliverable = `离线文件（用户要文件时再给）：${deliverablePath}`;
  const exportedAt = lines.findIndex((line) => line.startsWith(`Exported ${deliverablePath} (`));
  assert.ok(exportedAt >= 0 && exportedAt < lines.findIndex((line) => line.startsWith("natural ")), exported.stdout);
  assert.equal(lines.at(-2), lines[counted + 1], "what the hand-in wrote, then the deliverable");
  assert.ok(!lines.some((line) => line.startsWith("重读")), exported.stdout);
  assert.equal(lines.at(-1), deliverable, "the last line: the deliverable");
  await rewrote();
  const again = await gallery(["export", "natural"]);
  assert.equal(again.code, 0, again.stdout + again.stderr);
  assert.ok(said(again.stdout), `the export says it too, first: ${again.stdout}`);
  assert.equal(await fs.readFile(file, "utf8"), handed, "a second export changes nothing");
  assert.ok(!/^(natural|ids|重读：)/m.test(again.stdout), again.stdout);
  assert.equal(linesOf(again.stdout).at(-1), deliverable, "the deliverable whenever it exports");
  // doc.json written alone (its title not the h1's): said by its title line, then the deliverable.
  const metadataFile = path.join(reports, "natural", "doc.json");
  const metadata = await fs.readFile(metadataFile, "utf8");
  await fs.writeFile(metadataFile, JSON.stringify({ ...JSON.parse(metadata), title: "旧名字" }));
  const retitled = await gallery(["export", "natural"]);
  assert.equal(retitled.code, 0, retitled.stdout + retitled.stderr);
  assert.equal(await fs.readFile(file, "utf8"), handed, "doc.html as it was");
  assert.equal(JSON.parse(await fs.readFile(metadataFile, "utf8")).title, "自然写法", "doc.json's title the h1's");
  assert.deepEqual(linesOf(retitled.stdout).slice(-2), [
    `title ${shownPath(path.dirname(file))}: doc.json's title written as its h1 says it: "自然写法"`,
    deliverable,
  ], retitled.stdout);
  await fs.writeFile(metadataFile, JSON.stringify({ ...JSON.parse(metadata), title: "旧名字" }));
  await fs.writeFile(file, original);
  const both = await gallery(["export", "natural"]);
  assert.equal(both.code, 0, both.stdout + both.stderr);
  const bothLines = linesOf(both.stdout);
  assert.ok(bothLines.includes(`title ${shownPath(path.dirname(file))}: doc.json's title written as its h1 says it: "自然写法"`) && bothLines.some((line) => /^ids \S*natural[\\/]doc\.html: 1 block given an id$/.test(line)) && !bothLines.some((line) => line.startsWith("重读")), both.stdout);
  await fs.writeFile(file, handed);
  await fs.writeFile(metadataFile, metadata);
  // How many it lists: ten blocks given an id, more counted alone.
  const many = (count) => Array.from({ length: count }, (_, index) => ({ id: `i${String(index).padStart(7, "0")}`, line: index + 10, tag: "<p>" }));
  const listing = idLines(file, many(10));
  assert.equal(listing.length, 11, listing.join("\n"));
  assert.match(listing[0], /^ids \S*natural[\\/]doc\.html: 10 blocks given an id$/);
  assert.equal(listing[1], "  line 10 <p> → i0000000");
  assert.deepEqual(idLines(file, many(35)).map((line) => line.replace(/^ids \S+: /, "")), ["35 blocks given an id"], "a first export's: counted alone");
  assert.deepEqual(idLines(file, undefined, 3).map((line) => line.replace(/^ids \S+: /, "")), ["3 blocks given an id"]);
  assert.equal(idLines(file, many(10), 10, { pending: true }).length, 11, "ten listed");
  assert.deepEqual(idLines(file, many(11), 11, { pending: true }).map((line) => line.replace(/^ids \S+: /, "")), ["11 blocks without an id yet: the export gives each one"]);

  // Through a running server (its edit service here, its ids its own: s0000001…), found where it
  // says it listens; one whose process is gone is not asked.
  const natural = original.replace("<p>一段", "<p>另一段");
  await fs.writeFile(file, natural);
  let count = 0;
  const service = createEditService({ reportsDirectory: reports, ids: () => `s${String(++count).padStart(7, "0")}` });
  const server = http.createServer(service.handInRequest);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const serverFile = serviceLocation().serverFile; // the workspace's announcement
  const forget = await announcePreviewServer({ home: reports, port: server.address().port, token: service.token });
  try {
    const served = await gallery(["export", "natural"]);
    assert.equal(served.code, 0, served.stdout + served.stderr);
    const text = await fs.readFile(file, "utf8");
    assert.ok(text.includes('<p data-block-id="s0000001">另一段 <span class="doc-highlight-yellow">标记过</span> 的文字。</p>'), `the server wrote it: ${text.match(/<p[^>]*>另一段[^\n]*/)?.[0]}`);
    assert.match(served.stdout.replace(/\r\n/g, "\n"), /^ids \S*natural[\\/]doc\.html: 1 block given an id\n {2}line \d+ <p> → s0000001$/m, "the server's ids said as the command's");
  } finally {
    await forget();
    server.close();
  }
  await fs.writeFile(file, natural);
  assert.equal(await fs.stat(serverFile).catch(() => null), null, "taken away when the server closes");
  // A server started again in the same process (Vite restarting): the first one's closing takes away
  // only its own announcement, not the one written over it.
  const first = await announcePreviewServer({ home: reports, port: 1, token: "1".repeat(32) });
  await assert.rejects(announcePreviewServer({ home: reports, port: 2, token: "2".repeat(32) }), /already runs/);
  const second = await announcePreviewServer({ home: reports, port: 1, token: "2".repeat(32) });
  await first();
  assert.deepEqual(await findPreviewServer(), { port: 1, token: "2".repeat(32), pid: process.pid, keeper: null }, "the second announcement stays");
  if (process.platform === "win32") {
    const other = reports.replace(/^[a-z]/i, (letter) => (letter === letter.toUpperCase() ? letter.toLowerCase() : letter.toUpperCase()));
    assert.ok(sameDirectory(other, reports));
  }
  await second();

  // A server keeps its announcement while it listens: written again when the file is gone or names
  // a process that is gone; left while it names another process that runs; never again once the
  // server closed, nor into a workspace that is gone. A server that closes gives the announcement it
  // was written over back to its server while that one's process runs, and else takes it away.
  {
    const kept = path.join(root, "kept-workspace");
    await fs.mkdir(kept);
    const settle = () => new Promise((resolve) => setTimeout(resolve, 250));
    const keptPort = async () => (await findPreviewServer())?.port;
    const keeping = await announcePreviewServer({ home: kept, port: 3, token: "3".repeat(32), every: 20 });
    const keptFile = serviceLocation().serverFile;
    await fs.rm(keptFile);
    await settle();
    assert.equal(await keptPort(), 3, "written again when the file is gone");
    const another = (pid) => `${JSON.stringify({ port: 4, pid, home: path.resolve(kept), token: "4".repeat(32), nonce: "another", kind: "dev", version: "0.0.0" })}\n`;
    await fs.writeFile(keptFile, another(sleeper.pid));
    await settle();
    assert.equal(await keptPort(), 4, "another running server's left");
    await fs.writeFile(keptFile, another(2147483646));
    await settle();
    assert.equal(await keptPort(), 3, "one whose process is gone written over");
    await keeping();
    await settle();
    assert.equal(await fs.stat(keptFile).catch(() => null), null, "never again once it closed");
    const gone = await announcePreviewServer({ home: kept, port: 5, token: "5".repeat(32), every: 0 });
    await fs.rm(keptFile, { force: true });
    await gone();
    assert.equal(await fs.stat(path.join(serviceLocation().data, "server.lock")).catch(() => null), null, "closing releases its lease even when the announcement was removed");
    await fs.rm(kept, { recursive: true });
  }

  await fs.rm(serverFile, { force: true });
  await fs.writeFile(serverFile, JSON.stringify({home: reports, port: 9, token: "0".repeat(32), pid: 2147483646}));
  const direct = await gallery(["export", "natural"]);
  assert.equal(direct.code, 0, direct.stdout + direct.stderr);
  assert.ok(/<p data-block-id="[a-z][a-z0-9]{7}">另一段 <span class="doc-highlight-yellow">/.test(await fs.readFile(file, "utf8")) && !(await fs.readFile(file, "utf8")).includes("s0000"), "a server that is gone: written here");

  // ---------- open, new and import with a server running ----------
  // This workspace's server is the one its announcement names, once it answers there as that server
  // (GET /__gallery/workspace/info: the announcement's token, its process, this workspace). Each server here
  // is a workspace service of its own (its token its own) and the document's page.
  const serverOf = async (directory) => {
    const edits = createEditService({ reportsDirectory: directory });
    const workspace = createWorkspaceService({ edits, reportsDirectory: directory, reports: {} });
    const asked = []; // the edit service's routes a command asked of it (none here answers)
    const listening = http.createServer((request, response) => {
      if (request.url === "/__gallery/workspace/info") return response.writeHead(200, {"Content-Type":"application/json"}).end(JSON.stringify({ token: edits.token, server: { pid: process.pid, home: directory, data: serviceLocation().data, kind: "dev" } }));
      const name = request.url.match(/^\/__gallery\/workspace\/([a-z]+)(?:\?|$)/)?.[1];
      if (name) return workspace.handle(request, response, name);
      if (request.url.includes("/__gallery/edit/")) {
        asked.push(request.url.replace(/^.*\/__gallery\/edit\//, ""));
        return response.writeHead(404).end();
      }
      const slug = request.url.match(/^\/generated\/([a-z0-9-]+)\.html(?:\?|$)/)?.[1];
      if (slug) {
        return fs.readFile(path.join(directory, slug, "doc.html"), "utf8").then(
          (text) => response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(`<!doctype html>${/<title>[^<]*<\/title>/.exec(text)?.[0] ?? ""}`),
          () => response.writeHead(404).end(),
        );
      }
      response.writeHead(404).end();
    });
    await new Promise((resolve) => listening.listen(0, "127.0.0.1", resolve));
    return { server: listening, port: listening.address().port, token: edits.token, edits, asked };
  };
  const ours = await serverOf(reports);
  const elsewhere = await serverOf(path.join(root, "another-workspace"));
  const goneServer = await serverOf(reports);
  await new Promise((resolve) => goneServer.server.close(resolve)); // its port answers no more
  const forwarding = http.createServer((request, response) => response.writeHead(302, { Location: `http://127.0.0.1:${ours.port}${request.url}` }).end());
  const silent = http.createServer(() => {});
  for (const listening of [forwarding, silent]) await new Promise((resolve) => listening.listen(0, "127.0.0.1", resolve));
  const startedOn = [];
  const stopped = [];
  const choose = (options) => previewServerFor({
    reportsDirectory: reports, ports: Array.from({ length: 10 }, (_, index) => elsewhere.port + index),
    start: async (port) => (startedOn.push(port), { pid: 0 }),
    stop: async (found) => (stopped.push(found.port), { ok: true, killed: false }),
    ...options,
  });
  // An announcement as a server writes it, its process named `pid`, of `kind` and `version`.
  const announce = async ({ port, token }, pid = process.pid, { kind = "dev", version = undefined } = {}) => {
    await fs.writeFile(serverFile, JSON.stringify({home:reports, port, token, kind, version: version ?? versionOf(), pid}));
  };
  try {
    // Announced and answering: found and used, never a port looked at, by the command as by the function.
    await announce(ours);
    assert.deepEqual(await findPreviewServer({ answering: true }), { port: ours.port, token: ours.token, pid: process.pid, keeper: null });
    assert.deepEqual(await choose(), { port: ours.port, started: null, passed: [], replaced: null, running: { pid: process.pid, kind: "dev", version: versionOf() } });
    assert.deepEqual(startedOn, [], "nothing started");
    // The workspace, the page's marked
    // as the Agent's, the address to give the user (the workbench's, Chrome or Edge), and whether a
    // browser was opened. new and import end the same way, the address alone after one colon (a
    // sentence to forward "as it is" went to the handoff: found testing the skill with Agents, 2026-10-28).
    const opened = (slug, title) => [
      ...(slug ? [`Agent 自用（只有文档页，不交给用户）：http://127.0.0.1:${ours.port}/generated/${slug}.html?agent`] : []),
      `交给用户（现在就把这个地址给用户；用 Chrome 或 Edge 打开）：http://127.0.0.1:${ours.port}/${slug ? `#${pageLink({ slug, title })}` : ""}`,
    ];
    // (natural's baseline, which its exports above wrote, taken away: gallery open writes it again, below.)
    await fs.rm(path.join(reports, ".gallery", "qa", "natural", "blocks.json"), { force: true });
    // The review of the Agent's changes (docs/editor.md "Agent's changes") needs no step of the Agent's:
    // the write that fills a new document (its title alone, then the file as it is) is no change, and
    // gallery open asks the server nothing of the review (no edit route: the first writing that it
    // ended, POST /__gallery/edit/round, is gone since 2026-11-13); the next write is reviewed.
    const naturalText = await fs.readFile(file, "utf8");
    await ours.edits.noteTaken("natural", naturalText.replace(/(<main[^>]*>)[^]*<\/main>/, '$1<header class="doc-header"><h1 class="doc-title">自然写法</h1></header></main>'));
    assert.equal(await ours.edits.noteTaken("natural", naturalText), false, "the first write of a new document: the starter filled, no review");
    ours.asked.length = 0;
    const openedNatural = await gallery(["open", "natural"]);
    assert.equal(openedNatural.code, 0, openedNatural.stdout + openedNatural.stderr);
    assert.deepEqual(linesOf(openedNatural.stdout), [`工作区：${reports}`, ...opened("natural", "自然写法"), "Not opened in a browser: GALLERY_NO_BROWSER is set."]);
    assert.deepEqual(ours.asked, [], "gallery open asks the edit service nothing");
    assert.equal(await ours.edits.noteTaken("natural", naturalText.replace("</main>", "<p>下一轮写的。</p></main>")), true, "the Agent's next write starts a review");
    await ours.edits.forgetChanges("natural");
    const openedBare = await gallery(["open", "--no-browser"]);
    assert.deepEqual(linesOf(openedBare.stdout), [`工作区：${reports}`, ...opened(null), "Not opened in a browser (--no-browser)."], "no slug: the workbench");
    const byAddress = await gallery(["open", `http://127.0.0.1:1/#${encodeURIComponent("一个旧标题")}-${pageId("natural")}/ab12cd34`, "--no-browser"]);
    assert.deepEqual([byAddress.code, linesOf(byAddress.stdout).slice(1, -1)], [0, [...opened("natural", "自然写法").slice(0, -1), `${opened("natural", "自然写法").at(-1)}/ab12cd34`]], `an address: its document and block, by the title of now: ${byAddress.stdout}${byAddress.stderr}`);
    const missing = await gallery(["open", "missing"]);
    assert.deepEqual([missing.code, missing.stderr.trim()], [1, `问题：No document "missing": ${path.join(reports, "missing", "doc.html")} does not exist (gallery new missing "<标题>" makes one; gallery list lists those there are).`]);
    // new and import end with the address (the environment variable unset), their 下一步 line starting
    // with sending it to the user, what follows it with what to write (never "read …": found testing the skill with
    // Agents, 2026-10-30), and open no browser, saying nothing of one (the user, 2026-11-13: the Agent sends the
    // address, and the workbench marks a page an Agent changed with a blue dot); the skills of before's
    // --no-browser changes nothing. With --open they open it at the document before the address, said as
    // gallery open says it (here none: GALLERY_NO_BROWSER). gallery duplicate likewise.
    const opening = "Not opened in a browser: GALLERY_NO_BROWSER is set.";
    const live = await gallery(["new", "live", "实时预览", "说明"], reports, { GALLERY_NO_PREVIEW: "" });
    assert.equal(live.code, 0, live.stdout + live.stderr);
    assert.deepEqual(linesOf(live.stdout).slice(-4), [
      `下一步：send the user http://127.0.0.1:${ours.port}/#${pageLink({ slug: "live", title: "实时预览" })} now, in a message of its own, so that they can open the document while you work; then replace the starter section with the document, as ordinary HTML (gallery check fails while the starter section remains). The write that replaces the starter is not marked; every write after it is shown to the user as your changes (「Agent 已修改」).`,
      steps("live")[1],
      ...opened("live", "实时预览"),
    ]);
    assert.ok(!/Opened it in|Not opened in a browser/.test(live.stdout), live.stdout);
    const liveOld = await gallery(["new", "live-old", "旧技能", "--no-browser"], reports, { GALLERY_NO_PREVIEW: "" });
    assert.deepEqual([liveOld.code, linesOf(liveOld.stdout).slice(-3)], [0, [steps("live-old")[1], ...opened("live-old", "旧技能")]], liveOld.stdout + liveOld.stderr);
    const liveOpen = await gallery(["new", "live-open", "打开看看", "--open"], reports, { GALLERY_NO_PREVIEW: "" });
    assert.deepEqual([liveOpen.code, linesOf(liveOpen.stdout).slice(-4)], [0, [steps("live-open")[1], opening, ...opened("live-open", "打开看看")]], liveOpen.stdout + liveOpen.stderr);
    const liveNotes = path.join(root, "live.md");
    await fs.writeFile(liveNotes, "# Live Notes\n\n正文。\n");
    const liveImport = await gallery(["import", liveNotes], reports, { GALLERY_NO_PREVIEW: "0" });
    assert.equal(liveImport.code, 0, liveImport.stdout + liveImport.stderr);
    assert.deepEqual(linesOf(liveImport.stdout).slice(-4), [
      `下一步：send the user http://127.0.0.1:${ours.port}/#${pageLink({ slug: "live-notes", title: "Live Notes" })} now, in a message of its own, so that they can open the document while you work; then edit ${shownPath(path.join(reports, "live-notes", "doc.html"))} into the document as 写作偏好 asks.`,
      "提示：when they are written, run gallery qa live-notes (it exports first)",
      ...opened("live-notes", "Live Notes"),
    ]);
    const openedNotes = path.join(root, "opened.md");
    await fs.writeFile(openedNotes, "# Opened Notes\n\n正文。\n");
    const importOpen = await gallery(["import", openedNotes, "--open"], reports, { GALLERY_NO_PREVIEW: "" });
    assert.deepEqual([importOpen.code, linesOf(importOpen.stdout).slice(-4)], [0, ["提示：when they are written, run gallery qa opened-notes (it exports first)", opening, ...opened("opened-notes", "Opened Notes")]], importOpen.stdout + importOpen.stderr);
    const copies = [];
    for (const [args, browser] of [[[], []], [["--open"], [opening]]]) {
      const copied = await gallery(["duplicate", "live", ...args], reports, { GALLERY_NO_PREVIEW: "" });
      assert.equal(copied.code, 0, copied.stdout + copied.stderr);
      const copy = /as (doc-[a-z0-9]{8}) /.exec(copied.stdout)?.[1];
      copies.push(copy);
      const lines = linesOf(copied.stdout);
      assert.ok(lines.at(-3 - browser.length).startsWith(`下一步：send the user http://127.0.0.1:${ours.port}/#`), copied.stdout);
      assert.deepEqual(lines.slice(-2 - browser.length), [...browser, ...opened(copy, "实时预览（副本）")], copied.stdout);
      assert.equal(/Opened it in|Not opened in a browser/.test(copied.stdout), browser.length > 0, copied.stdout);
    }
    // gallery qa's baseline (src/cli/qa-baseline.mjs): gallery open writes one of a document that has
    // none (natural's, taken away above), before a round of changes; new and import, whose document is new, never do.
    const baselined = (slug) => fs.access(path.join(reports, ".gallery", "qa", slug, "blocks.json")).then(() => true, () => false);
    assert.deepEqual([await baselined("natural"), await baselined("live"), await baselined("live-notes")], [true, false, false]);
    for (const slug of ["live", "live-old", "live-open", "live-notes", "opened-notes", ...copies]) await fs.rm(path.join(reports, slug), { recursive: true });
    // npm run dev's server is stopped where it runs: gallery stop refuses, its process untouched.
    const devStop = await gallery(["stop"]);
    assert.deepEqual([devStop.code, devStop.stderr.trim()], [1, `The shared Gallery server is npm run dev's (port ${ours.port}, pid ${process.pid}): stop it where it runs.`]);

    // Versions: a command's server of an older Gallery is stopped and replaced; a newer one is used,
    // and so is npm run dev's whatever its version; a newer one that does not answer is said with how
    // to update.
    await announce(ours, process.pid, { kind: "cli", version: "0.0.1" });
    const replacing = await choose();
    assert.deepEqual([replacing.port, replacing.replaced, stopped], [elsewhere.port + 1, { pid: process.pid, version: "0.0.1" }, [ours.port]], "an older one stopped, one started on the first free port");
    startedOn.length = 0;
    await announce(ours, process.pid, { kind: "cli", version: "99.0.0" });
    assert.deepEqual((await choose()).running, { pid: process.pid, kind: "cli", version: "99.0.0" }, "a newer one used");
    await announce(ours, process.pid, { kind: "dev", version: "0.0.1" });
    assert.equal((await choose()).port, ours.port, "npm run dev's, older, used");
    assert.deepEqual([startedOn, stopped], [[], [ours.port]]);
    await announce({ port: silent.address().port, token: ours.token }, process.pid, { kind: "cli", version: "99.0.0" });
    assert.deepEqual((await choose({ timeout: 300 })).busy, { port: silent.address().port, pid: process.pid, version: "99.0.0", newer: true });

    // An announcement left behind is passed over: its process gone; its process there (a number used
    // again) and its port answering no more, or answering as another workspace's server, or as this
    // one's with another token, or sending the request on. The export asks without the answer.
    const stale = [
      [ours, 2147483646],
      [ours, sleeper.pid],
      [{ port: goneServer.port, token: goneServer.token }],
      [elsewhere],
      [{ port: ours.port, token: "0".repeat(32) }],
      [{ port: forwarding.address().port, token: ours.token }],
    ];
    for (const [server, pid] of stale) {
      await announce(server, pid);
      assert.equal(await findPreviewServer({ answering: true }), null, `stale: port ${server.port}, pid ${pid ?? "here"}`);
      assert.equal((await findPreviewServer())?.port, pid === 2147483646 ? undefined : server.port);
    }
    // gallery stop never ends a process an announcement left behind names (a number used again).
    await announce({ port: goneServer.port, token: goneServer.token }, sleeper.pid, { kind: "cli" });
    const staleStop = await gallery(["stop"]);
    assert.deepEqual([staleStop.code, staleStop.stdout.trim(), sleeper.exitCode], [0, "No Gallery server runs.", null]);
    // With none of this workspace's answering, a server is started on the first free port: never on
    // the one another workspace's server holds.
    const chosen = await choose();
    assert.equal(chosen.passed[0], `${elsewhere.port} (in use)`, "another workspace's server on the first port: passed over");
    assert.ok(chosen.port > elsewhere.port && !chosen.passed.includes(`${chosen.port} (in use)`), JSON.stringify(chosen));
    assert.deepEqual(startedOn, [chosen.port], "one started, on that port");
    // The ports passed said in the line's own words, no brackets in its brackets (found testing the
    // skill with Agents, 2026-10-29: "started now (4317 is taken; 4318 was taken as the server started)").
    assert.ok(serverLine({ port: 4319, pid: 3012, kind: "cli", started: true, passed: ["4317 (in use)", "4318 (taken by another program while the server started)"] }).startsWith("提示：Gallery's shared server is on port 4319 (pid 3012, started now, after passing over 4317 (in use) and 4318 (taken by another program while the server started); its log: "));
    assert.ok(serverLine({ port: 4318, pid: 1, kind: "cli", started: true, passed: ["4317 (in use)"] }).includes("(pid 1, started now, after passing over 4317 (in use); its log: "));
    // A server that ran already, on the port the last command found it on, is not said: only news is (started, replaced, another port).
    assert.equal(serverLine({ port: 4318, pid: 1, kind: "cli", started: false, replaced: null, passed: [], movedFrom: null }), null);
    assert.equal(serverLine({ port: 4318, pid: 1, kind: "dev", started: false }), null, "a development server too");
    assert.ok(serverLine({ port: 4318, pid: 1, kind: "cli", started: false, movedFrom: 4317 }).startsWith("提示：Gallery's shared server is on port 4318 (pid 1). It was on port 4317 before: an address with that port no longer works; use the ones below. This command is done;"));
    assert.ok(serverLine({ port: 4318, pid: 1, kind: "cli", started: false, replaced: { pid: 9, version: "0.1.0" } }).includes("it replaced Gallery 0.1.0's server, pid 9"));
    // One announced whose port takes the request and gives no answer in time: this workspace's
    // server, busy or stuck, and none started beside it.
    await announce({ port: silent.address().port, token: ours.token });
    assert.deepEqual(await choose({ timeout: 300 }), { port: null, started: null, passed: [], replaced: null, busy: { port: silent.address().port, pid: process.pid, version: versionOf(), newer: false } });
    assert.deepEqual(startedOn, [chosen.port], "none started beside a busy one");
  } finally {
    ours.server.close();
    elsewhere.server.close();
    forwarding.close();
    silent.closeAllConnections();
    silent.close();
  }
  await fs.rm(serverFile, { force: true });

  // A copy that kept its block id: the export fails, nothing written or exported, the repeated id said
  // as the check says it, at the file's lines.
  const copied = natural.replace("<p>另一段", '<p data-block-id="twice">一</p>\n    <p data-block-id="twice">另一段');
  await fs.writeFile(file, copied);
  await fs.rm(path.join(reports, "exports"), { recursive: true, force: true });
  const lineOf = (index) => copied.slice(0, index).split("\n").length;
  const at = [copied.indexOf('data-block-id="twice"'), copied.lastIndexOf('data-block-id="twice"')].map(lineOf);
  const refused = await gallery(["export", "natural"]);
  assert.equal(refused.code, 1, refused.stdout + refused.stderr);
  assert.ok(refused.stderr.includes(`data-block-id repeats: "twice" on lines ${at[0]} and ${at[1]}; each id names one block`), refused.stderr);
  assert.equal(await fs.readFile(file, "utf8"), copied, "nothing written");
  assert.equal(await fs.readFile(path.join(reports, "exports", "natural.html"), "utf8").catch(() => null), null, "nothing exported");
  assert.match(refused.stderr.replace(/\r\n/g, "\n"), /^\nFAIL natural: 1 problem\n {2}- data-block-id repeats/, refused.stderr);
  assert.match(refused.stderr.trimEnd(), /\n1 document failed: natural \(the failures are listed first, above\)$/, refused.stderr);
  assert.equal((await gallery(["export", "natural", "--allow-failures"])).code, 0, "--allow-failures");
  // A <details> given the kit's class but written as a plain one: fails as the check says it, nothing written.
  const kitClassed = natural.replace("<p>另一段", '<details class="doc-details"><summary>更多</summary><p>甲</p></details>\n    <p>另一段');
  await fs.writeFile(file, kitClassed);
  const classed = await gallery(["export", "natural"]);
  assert.equal(classed.code, 1, classed.stdout + classed.stderr);
  assert.ok(classed.stderr.includes("details (line ") && classed.stderr.includes("carries the kit's class without the kit's parts: write a plain <details> without the class") && !classed.stderr.includes("has no label"), classed.stderr);
  assert.equal(await fs.readFile(file, "utf8"), kitClassed, "nothing written: no id in a file that was not exported");
  await fs.writeFile(file, copied);

  // A server new cannot start (no port free, none of this workspace's running): the document is made
  // all the same, and the last lines say why and how to start it.
  const holder = http.createServer((request, response) => response.writeHead(404).end());
  await new Promise((resolve) => holder.listen(0, "127.0.0.1", resolve));
  const takenPort = holder.address().port;
  try {
    const noPort = await run(process.execPath, ["--input-type=module", "-e", `const { previewOfNew } = await import(${JSON.stringify(new URL("../../src/cli/server-process.mjs", import.meta.url).href)}); console.log((await previewOfNew("natural", { skipped: false, command: "test", ports: [${takenPort}] })).join("\\n"));`], { cwd: projectRoot, env: { ...process.env, GALLERY_WORKSPACE: reports } });
    assert.deepEqual(linesOf(noPort.stdout), [
      `问题：The server was not started: No server for this data directory runs, and no port from ${takenPort} to ${takenPort} is free to start one on: stop a server on one of them (or name another first port: GALLERY_PORT=<n>), then run gallery open natural --no-browser.`,
      "  When that is fixed, gallery open natural --no-browser starts it and prints the address to give the user.",
    ]);
    // gallery open and gallery page open are said to be run again as they were run, an Agent's --no-browser kept.
    const again = await run(process.execPath, ["--input-type=module", "-e", `const { serverFor } = await import(${JSON.stringify(new URL("../../src/cli/server-process.mjs", import.meta.url).href)}); for (const command of ["gallery open natural", "gallery open natural --no-browser", "gallery page open home --no-browser"]) console.log((await serverFor({ slug: command.includes("page") ? null : "natural", command, ports: [${takenPort}] })).message.split("then run ").at(-1));`], { cwd: projectRoot, env: { ...process.env, GALLERY_WORKSPACE: reports } });
    assert.deepEqual(linesOf(again.stdout), ["gallery open natural.", "gallery open natural --no-browser.", "gallery page open home --no-browser."], again.stdout + again.stderr);
  } finally {
    holder.close();
  }

  // A workspace with no documents yet: check (none named, or --all) has none and says how one is made.
  const emptyWorkspace = path.join(root, "empty");
  for (const args of [["check"], ["check", "--all"], ["export", "--all"]]) {
    const none = await gallery(args, emptyWorkspace);
    assert.deepEqual([none.code, none.stderr.trim()], [1, `No documents in ${emptyWorkspace} yet: gallery new <slug> "<title>" makes one.`], args.join(" "));
  }
  const idsWritten = await gallery(["new", "first", "第一份"], emptyWorkspace);
  assert.equal(idsWritten.code, 0);
  // add-block-ids.mjs, a maintainers' script that writes doc.html too: what it wrote, and no 重读 line.
  const ids = await run(process.execPath, [path.join(projectRoot, "src", "cli", "add-block-ids.mjs"), "first"], { env: { ...process.env, GALLERY_WORKSPACE: emptyWorkspace } });
  assert.ok(linesOf(ids.stdout).some((line) => line.startsWith(`${shownPath(path.join(emptyWorkspace, "first", "doc.html"))}: `)) && !/重读/.test(ids.stdout), ids.stdout);

  // ---------- import ----------
  // A Markdown file (a workspace of its own): its slug made of its title (a number on when it is
  // taken; the file's name, else doc-<a new page id> as the workbench names a new document, for a title with no Latin word of three letters), what it
  // made, its picture copied, the one it could not find said at its line, the text an HTML block kept
  // as written leaves read-only, then new's lines and the next steps; it passes gallery check. A slug
  // and a title given are taken; a slug that exists, or a file that is not there, exits 1.
  const mdWorkspace = path.join(root, "md");
  const materials = path.join(root, "materials");
  await fs.mkdir(path.join(materials, "img"), { recursive: true });
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  await fs.writeFile(path.join(materials, "img", "dot.png"), PNG);
  const notes = path.join(materials, "notes.md");
  await fs.writeFile(notes, "# Weekly Eval: Q3\n\n综合得分 $S$ 取各题平均，价格 $5 不是公式。\n\n## 结果\n\n| 实验 | 得分 |\n|---|---:|\n| A | 49.8 |\n\n![点](img/dot.png)\n\n![没了](img/gone.png)\n");
  const fromMd = await gallery(["import", notes], mdWorkspace);
  assert.equal(fromMd.code, 0, fromMd.stdout + fromMd.stderr);
  const weekly = path.join(mdWorkspace, "weekly-eval-q3");
  assert.deepEqual(linesOf(fromMd.stdout), [
    `Created ${shownPath(path.join(weekly, "doc.html"))} and doc.json from notes.md`,
    "Title: Weekly Eval: Q3",
    `Made: 1 section, 1 heading, 1 paragraph, 1 table, 1 formula, 1 picture (1 file in ${shownPath(path.join(weekly, "assets"))})`,
    "Not brought as the file has it (1):",
    "  line 13: the picture img/gone.png was not found: left out",
    `工作区：${mdWorkspace}`,
    ...preferenceLines(path.join(mdWorkspace, 'preferences/通用写作.md')),
    `下一步：edit ${shownPath(path.join(weekly, "doc.html"))} into the document as 写作偏好 asks.`,
    "提示：when they are written, run gallery qa weekly-eval-q3 (it exports first)",
    "提示：The server was not started (--no-preview or GALLERY_NO_PREVIEW): gallery open weekly-eval-q3 --no-browser starts it and prints the address to give the user.",
  ]);
  const weeklyHtml = await fs.readFile(path.join(weekly, "doc.html"), "utf8");
  assert.ok(weeklyHtml.includes("<title>Weekly Eval: Q3</title>") && weeklyHtml.includes('<p>综合得分 <span class="doc-math-inline">\\(S\\)</span> 取各题平均，价格 $5 不是公式。</p>') && /<section class="doc-section">\n\s*<h2>结果<\/h2>/.test(weeklyHtml), weeklyHtml);
  const { created: importedAt, ...importedMetadata } = JSON.parse(await fs.readFile(path.join(weekly, "doc.json"), "utf8"));
  assert.deepEqual(importedMetadata, { title: "Weekly Eval: Q3", description: "导入自 notes.md", type: "report" });
  assert.ok(Number.isFinite(Date.parse(importedAt)), "an import's document made now: its created");
  assert.equal((await fs.readdir(path.join(weekly, "assets"))).length, 1, "its picture copied");
  const mdChecked = await gallery(["check", "weekly-eval-q3"], mdWorkspace);
  assert.equal(mdChecked.code, 0, mdChecked.stdout + mdChecked.stderr);
  const retaken = await gallery(["import", notes], mdWorkspace);
  assert.ok(retaken.code === 0 && retaken.stdout.includes(`weekly-eval-q3-2${path.sep}doc.html`), `a slug taken: a number on: ${retaken.stdout}`);
  const namedMd = await gallery(["import", notes, "q3", "第三季度评测"], mdWorkspace);
  assert.ok(namedMd.code === 0 && namedMd.stdout.includes("Title: 第三季度评测") && JSON.parse(await fs.readFile(path.join(mdWorkspace, "q3", "doc.json"), "utf8")).title === "第三季度评测", namedMd.stdout + namedMd.stderr);
  const chinese = path.join(materials, "周报.md");
  await fs.writeFile(chinese, "# 周报 v2.2\n\n正文。\n");
  const unnamed = await gallery(["import", chinese], mdWorkspace);
  const unnamedSlug = /[\\/]md[\\/](doc-[a-z][a-z0-9]{7})[\\/]doc\.html/.exec(unnamed.stdout)?.[1];
  assert.ok(unnamed.code === 0 && unnamedSlug && unnamed.stdout.includes("Title: 周报 v2.2"), `a title whose Latin is a version alone, a file name of none: doc- and a new page id, as the workbench names a new document: ${unnamed.stdout}${unnamed.stderr}`);
  const raw = path.join(materials, "raw.md");
  await fs.writeFile(raw, "# Raw HTML\n\n<table>\n<tr><td><p>甲</p>乙</td></tr>\n</table>\n");
  const rawMade = await gallery(["import", raw], mdWorkspace);
  assert.ok(rawMade.code === 0 && rawMade.stdout.includes("\nMade: 1 HTML block kept as written\nText the preview leaves read-only (1), by doc.html's lines as gallery check gives them:\n  line ")
    && rawMade.stdout.includes(": <td>: a block (<p>) amid the words: give the words a paragraph of their own\n"), rawMade.stdout + rawMade.stderr);
  const before = (await fs.readdir(mdWorkspace)).sort();
  const takenSlug = await gallery(["import", notes, "q3"], mdWorkspace);
  assert.deepEqual([takenSlug.code, takenSlug.stderr.trim()], [1, `Document already exists: ${shownPath(path.join(mdWorkspace, "q3"))}`]);
  const absent = await gallery(["import", path.join(materials, "nope.md")], mdWorkspace);
  assert.deepEqual([absent.code, absent.stderr.trim()], [1, `No such file: ${path.join(materials, "nope.md")}`]);
  assert.deepEqual((await fs.readdir(mdWorkspace)).sort(), before, "nothing made");
  assert.deepEqual(before, [".gallery", unnamedSlug, "gallery.json", "preferences", "q3", "raw-html", "weekly-eval-q3", "weekly-eval-q3-2"]);
  // The slug made of a title passes over one of the trash, and a slug of the trash named is refused.
  {
    const titled = path.join(materials, "plain.md");
    await fs.writeFile(titled, "# Plain Notes\n\n正文。\n");
    const entry = path.join(mdWorkspace, ".gallery", "trash", "a1-binned");
    await fs.mkdir(entry, { recursive: true });
    await fs.writeFile(path.join(entry, "entry.json"), JSON.stringify({ id: "a1-binned", slug: "plain-notes", title: "回收区里的", at: 1, parent: "", index: 0 }));
    const passed = await gallery(["import", titled], mdWorkspace);
    assert.ok(passed.code === 0 && passed.stdout.includes(`plain-notes-2${path.sep}doc.html`), `a slug of the trash: a number on: ${passed.stdout}${passed.stderr}`);
    const refusedSlug = await gallery(["import", titled, "plain-notes"], mdWorkspace);
    assert.deepEqual([refusedSlug.code, refusedSlug.stderr.trim()], [1, '"plain-notes" is the slug of something in the trash: choose another slug.']);
    const refusedId = await gallery(["import", titled, `doc-${pageId("plain-notes")}`], mdWorkspace);
    assert.deepEqual([refusedId.code, refusedId.stderr.trim()], [1, `"doc-${pageId("plain-notes")}" would have the page id (${pageId("plain-notes")}) of "plain-notes" in this workspace, and two documents may not share an address: choose another slug.`], "a doc-<id> slug whose id the trash's page has: refused as gallery new does");
    await fs.rm(path.join(mdWorkspace, "plain-notes-2"), { recursive: true });
    await fs.rm(entry, { recursive: true });
  }
  // A Word file: one document, its heading, list and table.
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const docx = path.join(materials, "Quarterly Plan.docx");
  await fs.writeFile(docx, createZip([
    { name: "word/document.xml", data: `<w:document ${W}><w:body><w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>章</w:t></w:r></w:p><w:p><w:r><w:t>正文</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>2</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>` },
    { name: "word/styles.xml", data: `<w:styles ${W}><w:style w:styleId="Heading2"><w:name w:val="heading 2"/></w:style></w:styles>` },
  ]));
  const fromWord = await gallery(["import", docx], mdWorkspace);
  assert.equal(fromWord.code, 0, fromWord.stdout + fromWord.stderr);
  assert.deepEqual(linesOf(fromWord.stdout).slice(0, 3), [`Created ${shownPath(path.join(mdWorkspace, "quarterly-plan", "doc.html"))} and doc.json from Quarterly Plan.docx`, "Title: Quarterly Plan", "Made: 1 heading, 1 paragraph, 1 table"], fromWord.stdout);
  // A zip of pages: one document a page, nested as in the zip (folders and links), in the outline too.
  const zip = path.join(materials, "notes.zip");
  await fs.writeFile(zip, createZip([
    { name: "Alpha.md", data: "# Alpha\n\n[Beta](Beta.md)\n\n文字" },
    { name: "Beta.md", data: "# Beta\n\nB 的正文" },
    { name: "Alpha/Gamma.md", data: "# Gamma\n\nC 的正文" },
    { name: "Delta.md", data: "# Delta\n\n独立" },
  ]));
  const fromZip = await gallery(["import", zip, "notes", "笔记"], mdWorkspace);
  assert.equal(fromZip.code, 0, fromZip.stdout + fromZip.stderr);
  const zipLines = linesOf(fromZip.stdout);
  assert.deepEqual(zipLines.filter((line) => /^\s+[a-z-]+ {2}/.test(line)).map((line) => line.replace(/ {2}\S*doc\.html$/, "")), ["  notes  笔记", "    beta  Beta", "    gamma  Gamma", "  delta  Delta"], fromZip.stdout);
  assert.equal(zipLines[0], "Created 4 documents from notes.zip (each nested as in the file):");
  assert.ok(zipLines.includes("提示：when they are written, run gallery qa notes beta gamma delta (it exports first)"), fromZip.stdout);
  const outline = JSON.parse(await fs.readFile(path.join(mdWorkspace, ".gallery", "outline.json"), "utf8"));
  assert.deepEqual([outline.children.notes, outline.children[""].slice(-2)], [["beta", "gamma"], ["notes", "delta"]], "nested in the outline");
  assert.equal(JSON.parse(await fs.readFile(path.join(mdWorkspace, "beta", "doc.json"), "utf8")).description, "导入自 Beta.md");

  // No command here started a service, whose log now belongs to the shared data directory.
  assert.equal(await fs.stat(serviceLocation().serverLog).catch(() => null), null, 'no shared server started');

  // skill:package takes no argument (there is one skill): said before anything is packaged.
  const release = path.join(projectRoot, "release");
  const releaseBefore = await fs.stat(release).then((stat) => stat.mtimeMs, () => null);
  for (const [argument, saidPackage] of [["minimal", "Unknown argument: minimal (skill:package takes none: there is one skill)."], ["--minimal", "Unknown option: --minimal"]]) {
    const packaged = await run(process.execPath, [path.join(projectRoot, "src", "cli", "package-skill.mjs"), argument]).then(() => ({ code: 0 }), (error) => error);
    assert.equal(packaged.code, 2, packaged.stdout + packaged.stderr);
    assert.deepEqual(linesOf(packaged.stderr), [saidPackage, "Usage: npm run skill:package   (npm run skill:package -- --help says more)"], packaged.stderr);
    assert.equal(packaged.stdout, "", "nothing packaged");
  }
  assert.equal(await fs.stat(release).then((stat) => stat.mtimeMs, () => null), releaseBefore, "release/ as it was");
} finally {
  sleeper.kill();
  process.env.GALLERY_DEFAULT_WORKSPACE = previousHome;
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
}

console.log("Checked the gallery command: the command line (--version fast, its first line the version, then a line for each Gallery skill older than it and one for a newer Gallery a cache of the registry knows, the cache checked again in the background when stale and never waited for, claimed first so that one check runs at once, none where the cache cannot be written, of the registry npm installs from through npm's proxy (the user's .npmrc), another registry's version not believed, a failing registry saying nothing, run by npx the npx form of both lines, no check with GALLERY_NO_UPDATE_CHECK, CI or NO_UPDATE_NOTIFIER; help and --help, unknown commands and options, no document, documents with --all, names that are no slug or the workspace's own, --workspace anywhere and init's <dir>; why first, then the usage line, exit 0 or 2, nothing read or written), the workspace each command uses (--workspace, GALLERY_WORKSPACE, the nearest gallery.json up, ~/Documents/Gallery made on first use; stop making none; another program's gallery.json and a folder that cannot be written refused), init (made once; the default home page with it, said, once and never again, none from another command; --from copying an older Gallery's documents, 写作偏好, sidebar order, page, emoji and versions, each said, the old folder byte for byte), new (the workspace, 写作偏好 made once and never over the user's, next steps, the server left alone, a title after --, the description optional, a document or page slug taken refused; page new, list and open's refusals, a custom page's slug and a document's one set, pages kept, list and an add to home saying the home page is not made yet while no server has made it (and nothing once it was made, taken away or turned off); page add of a block at the first free spot or where told, those it meets pushed down, its id and cells said, the file kept, a block of documents, one not there and one of Gallery's own not yet added refused; page try's and page check's command lines and a page not there), list (a document's place in the tree, the text searched after titles), the sidebar's tree (list --tree whole and from a document; new --under, --after and --first; move with what is under it, refused under itself, at another level, for the 写作偏好 page, a document not there or in the trash, parallel moves none lost, no document's file changed; set of the title, icon and description, the rest of doc.html as it was, and its refusals), check (none named: all) and export (absolute paths, the deliverable last, through a running server's queue or here, repeated ids failing first), a server's announcement kept and given back, open, new and import giving the Agent's address and the user's from the announced server (the baseline written by open alone, which asks the edit service nothing), an older Gallery's server replaced and a newer or npm run dev's used, stale announcements passed over and their processes never ended by stop, ports another workspace's server holds passed over, a busy server never doubled, no port free said with how to start one; import of Markdown (slug, pictures, what it could not bring, read-only text), of Word and of a zip of pages nested in the outline; and the browser each system opens.");
