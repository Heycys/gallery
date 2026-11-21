import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { projectRoot } from "../../src/shared/paths.mjs";
import { userDirectory } from "../../src/shared/user-directory.mjs";
import { GENERIC_NAMES, namedFolder, nameProblem, ownName, workspaceLabels, workspaceName, writeWorkspaceName } from "../../src/shared/workspace-name.mjs";
import {
  forgetWorkspace, readRegistry, registerQuietly, registerWorkspace, registryFile, registryOf, scanForWorkspaces, SEEN_EVERY, updateRegistry, workspaceId, workspaceKey,
} from "../../src/shared/workspace-registry.mjs";

// The machine's registry of workspaces and their names (src/shared/workspace-registry.mjs,
// workspace-name.mjs, user-directory.mjs; decided 2026-11-08):
// the user's folders on each system (GALLERY_DATA_DIR and GALLERY_CACHE_DIR first); a workspace's key and
// short id; the registry read (an entry twice, in two spellings on Windows, kept once with its latest
// `seen`; what is no entry left out; a file that does not read an empty registry), a workspace
// registered (added, `seen` written again an hour later at the soonest, including temporary paths;
// a folder with no gallery.json of Gallery’s is not registered), many registered at once with none lost, a data folder that cannot be written given up at once (not after
// the lock's wait), forgotten by path or id; the scan (6 levels, no node_modules, .git, dot folder or
// recycle bin, no folder in a workspace, another program's gallery.json none); the name rule
// (gallery.json's name; else the folder's, climbing past the generic names, never to the home, the
// Documents folder or a drive's root; a drive's root called by the drive; two of the same name told
// apart by the folder above, then by their own paths, never alike) and the name written into
// gallery.json with all else it holds and its own layout (BOM, line ends, order, one line). Then the commands, in workspaces of the test's own outside its
// processes' temporary folder (TEMP, TMP and TMPDIR a folder of its own): every command but stop and
// skill registers its workspace, one in the temporary folder none; init --name and workspaces --name
// write the name; new says how to name a workspace with none (not the default one, nor one named);
// workspaces lists them (the current one first, names, ids, documents, 不在了), --scan registers what a
// folder holds, --forget forgets (exit 1 for none), two at once exit 2; list --all finds the documents of
// every workspace, each after its 工作区 line, writing nothing in any (no 写作偏好 made). The server's
// start registers its workspace too: tests/unit/production-server.mjs.

const run = promisify(execFile);
const root = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-registry-"));
const write = async (file, text) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text);
};
const workspace = async (folder, extra = {}) => {
  await write(path.join(folder, "gallery.json"), `${JSON.stringify({ gallery: "workspace", version: 1, ...extra }, null, 2)}\n`);
  return folder;
};
const windows = process.platform === "win32";

try {
  // ---------- the user's folders ----------
  {
    const home = path.join(root, "home");
    const data = (env, platform) => userDirectory("data", { env, platform, home });
    const cache = (env, platform) => userDirectory("cache", { env, platform, home });
    assert.equal(data({ GALLERY_DATA_DIR: "d", GALLERY_CACHE_DIR: "c" }, "win32"), path.resolve("d"));
    assert.equal(cache({ GALLERY_DATA_DIR: "d", GALLERY_CACHE_DIR: "c" }, "linux"), path.resolve("c"));
    assert.equal(data({ LOCALAPPDATA: path.join(home, "L") }, "win32"), path.join(home, "L", "gallery"), "Windows: %LOCALAPPDATA%\\gallery");
    assert.equal(data({}, "win32"), path.join(home, "AppData", "Local", "gallery"));
    assert.equal(cache({ LOCALAPPDATA: path.join(home, "L") }, "win32"), path.join(home, "L", "gallery"), "the cache beside it on Windows");
    assert.equal(data({}, "darwin"), path.join(home, "Library", "Application Support", "gallery"));
    assert.equal(cache({}, "darwin"), path.join(home, "Library", "Caches", "gallery"));
    assert.equal(data({ XDG_STATE_HOME: path.join(home, "s") }, "linux"), path.join(home, "s", "gallery"));
    assert.equal(data({}, "linux"), path.join(home, ".local", "state", "gallery"));
    assert.equal(cache({}, "linux"), path.join(home, ".cache", "gallery"));
    assert.equal(registryFile({ env: { GALLERY_DATA_DIR: path.join(root, "x") } }), path.join(root, "x", "workspaces.json"));
    assert.equal(registryFile(), path.join(process.env.GALLERY_DATA_DIR, "workspaces.json"), "the tests' own, workspace-env.mjs");
  }

  // ---------- keys and ids ----------
  {
    assert.match(workspaceId(path.join(root, "a")), /^ws-[0-9a-f]{6}$/);
    assert.equal(workspaceId(path.join(root, "a")), workspaceId(path.join(root, "b", "..", "a")), "one id however the path is written");
    assert.notEqual(workspaceId(path.join(root, "a")), workspaceId(path.join(root, "b")));
    assert.equal(workspaceKey("C:\\Docs\\Gallery", "win32"), workspaceKey("c:\\docs\\gallery", "win32"), "Windows: upper and lower case alike");
    assert.equal(workspaceId("C:\\Docs\\Gallery", "win32"), workspaceId("c:\\DOCS\\gallery", "win32"));
  }

  // ---------- the registry read ----------
  {
    const a = path.join(root, "a");
    const read = registryOf(`\uFEFF${JSON.stringify({ version: 1, workspaces: [
      { root: a, seen: "2026-11-01T00:00:00.000Z" }, { root: "relative", seen: "2026-11-01T00:00:00.000Z" }, { seen: "x" }, null,
      { root: path.join(root, "b"), seen: "not a time" }, { root: a, seen: "2026-11-02T00:00:00.000Z" },
    ] })}`);
    assert.deepEqual(read, { version: 1, workspaces: [{ root: a, seen: "2026-11-02T00:00:00.000Z" }, { root: path.join(root, "b"), seen: "1970-01-01T00:00:00.000Z" }] }, "once each, the latest seen; no relative path, no non-entry");
    assert.deepEqual(registryOf("{ half"), { version: 1, workspaces: [] });
    assert.deepEqual(registryOf(null), { version: 1, workspaces: [] });
    if (windows) assert.equal(registryOf(JSON.stringify({ workspaces: [{ root: a, seen: "2026-11-01T00:00:00.000Z" }, { root: a.toUpperCase(), seen: "2026-11-01T00:00:00.000Z" }] })).workspaces.length, 1, "two spellings, one entry");
  }

  // ---------- registering ----------
  {
    const file = path.join(root, "data-1", "workspaces.json");
    const tmp = path.join(root, "tmp");
    await fs.mkdir(tmp, { recursive: true });
    const one = await workspace(path.join(root, "spaces", "one"));
    const t0 = Date.parse("2026-11-08T10:00:00.000Z");
    assert.equal(await registerWorkspace(path.join(root, "spaces", "none"), { file }), "none", "no gallery.json: none");
    await write(path.join(root, "spaces", "theirs", "gallery.json"), JSON.stringify({ name: "another program" }));
    assert.equal(await registerWorkspace(path.join(root, "spaces", "theirs"), { file }), "none", "another program's gallery.json: none");
    const inTemp = await workspace(path.join(tmp, "trial"));
    assert.equal(await registerWorkspace(inTemp, { file }), "added");
    assert.equal(readRegistry({ file }).workspaces[0].root, inTemp);
    await forgetWorkspace(inTemp, { file });
    assert.equal(await registerWorkspace(one, { file, now: t0 }), "added");
    assert.equal(await registerWorkspace(one, { file, now: t0 + SEEN_EVERY - 1 }), "fresh", "seen within the hour: nothing written");
    assert.equal(readRegistry({ file }).workspaces[0].seen, new Date(t0).toISOString());
    assert.equal(await registerWorkspace(windows ? one.toUpperCase() : one, { file, now: t0 + SEEN_EVERY }), "seen", "an hour later: seen again");
    assert.equal(readRegistry({ file }).workspaces[0].seen, new Date(t0 + SEEN_EVERY).toISOString());
    assert.equal(await registerWorkspace(one, { file, now: t0 + SEEN_EVERY + 1, force: true }), "seen", "forced");
    assert.deepEqual(readRegistry({ file }).workspaces.map(({ root: each }) => each), [one], "one entry, as first written");
    // Many at once, as many commands run together: none lost (a write over a file changed meanwhile is made again on it).
    const many = await Promise.all(Array.from({ length: 12 }, (_, index) => workspace(path.join(root, "spaces", `m${index}`))));
    await Promise.all(many.map((each) => registerWorkspace(each, { file })));
    assert.deepEqual(new Set(readRegistry({ file }).workspaces.map(({ root: each }) => each)), new Set([one, ...many]), "every one registered");
    assert.deepEqual((await fs.readdir(path.dirname(file))).filter((name) => name !== "workspaces.json"), [], "no file left beside it");
    // A data folder that cannot be written (Windows' rights; macOS's sandbox of an Agent gives EPERM as
    // Windows does): given up at once, where waiting for a lock (3 s twice) held every command up.
    if (windows || process.getuid?.() !== 0) {
      const denied = path.join(root, "data-denied");
      await fs.mkdir(denied);
      const deniedFile = path.join(denied, "workspaces.json");
      if (windows) await run("icacls", [denied, "/deny", "*S-1-1-0:(W)"]);
      else await fs.chmod(denied, 0o555);
      try {
        const started = Date.now();
        await assert.rejects(registerWorkspace(one, { file: deniedFile, force: true }), (error) => ["EPERM", "EACCES"].includes(error.code));
        const took = Date.now() - started;
        assert.ok(took < 2000, `a folder that cannot be written given up at once, not after the lock's wait (${took} ms)`);
        assert.equal(await registerQuietly(one, { file: deniedFile }), "failed", "and passed over for a command");
      } finally {
        if (windows) await run("icacls", [denied, "/remove:d", "*S-1-1-0"]);
        else await fs.chmod(denied, 0o755);
      }
      await assert.rejects(fs.stat(deniedFile));
    }
    // Forgetting: by path (any spelling on Windows) or by id; what names none forgets nothing.
    assert.deepEqual(await forgetWorkspace(windows ? many[0].toUpperCase() : many[0], { file }), [many[0]]);
    assert.deepEqual(await forgetWorkspace(workspaceId(many[1]), { file }), [many[1]]);
    assert.deepEqual(await forgetWorkspace(path.join(root, "nowhere"), { file }), []);
    assert.equal(readRegistry({ file }).workspaces.length, 11);
    // A workspace whose folder is gone stays (a drive may come back).
    await fs.rm(many[2], { recursive: true });
    assert.ok(readRegistry({ file }).workspaces.some(({ root: each }) => each === many[2]));
    // updateRegistry: null writes nothing.
    const before = await fs.readFile(file, "utf8");
    await updateRegistry(() => null, { file });
    assert.equal(await fs.readFile(file, "utf8"), before);
  }

  // ---------- the scan ----------
  {
    const top = path.join(root, "scan");
    const deep = await workspace(path.join(top, "1", "2", "3", "4", "5", "deep")); // 6 levels down
    const deeper = await workspace(path.join(top, "1", "2", "3", "4", "5", "6", "deeper")); // 7
    const near = await workspace(path.join(top, "near"));
    await workspace(path.join(near, "inner")); // in a workspace: not looked for
    await workspace(path.join(top, "node_modules", "pkg"));
    await workspace(path.join(top, ".hidden", "w"));
    await workspace(path.join(top, "x", ".git", "w"));
    await write(path.join(top, "theirs", "gallery.json"), "{}");
    await workspace(path.join(top, "$RECYCLE.BIN", "S-1-5-21-1", "$R1A2B3C")); // a workspace thrown away on Windows
    await workspace(path.join(top, "$Recycle.Bin", "S-1-5-21-1", "$R4D5E6F"));
    const { found, read } = await scanForWorkspaces(top);
    assert.deepEqual(found, [deep, near].sort(), "6 levels down, none in node_modules, .git, a dot folder, the recycle bin or a workspace, no other program's");
    assert.ok(!found.includes(deeper) && read > 0);
    assert.deepEqual((await scanForWorkspaces(top, { depth: 1 })).found, [near]);
    const cut = await scanForWorkspaces(top, { limit: 3 });
    assert.ok(cut.cut && cut.read === 3, "stopped at the limit, said so");
  }

  // ---------- names ----------
  {
    const stops = [path.join(root, "home"), path.join(root, "home", "Documents")];
    const named = async (folder, extra) => workspaceName(await workspace(folder, extra), { stops });
    assert.deepEqual(GENERIC_NAMES, ["gallery", "docs", "outputs", "reports", "文档"]);
    assert.equal((await named(path.join(root, "proj", "outputs", "gallery"))).name, "proj", "past gallery and outputs");
    assert.equal((await named(path.join(root, "Proj2", "Reports"))).name, "Proj2", "upper and lower case alike");
    assert.equal((await named(path.join(root, "proj3", "文档"))).name, "proj3");
    assert.equal((await named(path.join(root, "home", "Documents", "Gallery"))).name, "Gallery", "never to the Documents folder");
    assert.equal((await named(path.join(root, "home", "Documents", "outputs", "gallery"))).name, "outputs", "nor past it");
    assert.equal((await named(path.join(root, "home", "gallery"))).name, "gallery", "nor to the home");
    assert.equal(namedFolder(path.parse(root).root + "docs", { stops }), path.parse(root).root + "docs", "a drive's root's folder keeps its name");
    const drive = workspaceName(path.parse(root).root, { stops, readText: () => { throw new Error("none"); } });
    assert.deepEqual([drive.name, drive.above], [windows ? path.parse(root).root.slice(0, -1) : "/", null], "a workspace that is a drive's root: called by the drive, never \"\"");
    const own = await named(path.join(root, "proj4", "gallery"), { name: "  Agentless\n项目  " });
    assert.deepEqual([own.name, own.own, own.above], ["Agentless 项目", true, "proj4"], "gallery.json's name, on one line");
    assert.equal(ownName(await workspace(path.join(root, "long"), { name: "长".repeat(100) })).length, 80);
    assert.equal(ownName(path.join(root, "nowhere")), null);
    await write(path.join(root, "notours", "gallery.json"), JSON.stringify({ name: "x" }));
    assert.equal(ownName(path.join(root, "notours")), null, "another program's name is none");
    // Two of the same name: the folder above each; that the same too: each one's own path, never two alike.
    const labelled = (folder) => ({ root: folder, ...workspaceName(folder, { stops }) });
    const entries = [
      labelled(path.join(root, "a", "notes")), labelled(path.join(root, "b", "notes")), labelled(path.join(root, "c", "Other")),
      labelled(path.join(root, "d", "x", "NOTES")), labelled(path.join(root, "e", "x", "notes")),
    ];
    assert.deepEqual(workspaceLabels(entries).map(({ name, above }) => [name, above]), [
      ["notes", "a"], ["notes", "b"], ["Other", null], ["NOTES", path.join(root, "d", "x", "NOTES")], ["notes", path.join(root, "e", "x", "notes")],
    ]);
    // Side by side with one name of their own, and two of one project climbing to its folder: their paths.
    const twins = [
      labelled(await workspace(path.join(root, "work", "a"), { name: "周报" })), labelled(await workspace(path.join(root, "work", "b"), { name: "周报" })),
      labelled(path.join(root, "code", "proj", "docs")), labelled(path.join(root, "code", "proj", "outputs", "gallery")),
    ];
    const twinLabels = workspaceLabels(twins);
    assert.deepEqual(twinLabels.map(({ name, above }) => [name, above]), twins.map(({ root: each, name }) => [name, each]));
    assert.deepEqual(twinLabels.map(({ name }) => name), ["周报", "周报", "proj", "proj"]);
    assert.equal(new Set(workspaceLabels([...entries, ...twins]).map(({ name, above }) => `${name.toLowerCase()} ${above}`)).size, entries.length + twins.length, "no two labels alike");
    // Writing the name: right after the mark, all else kept; a wrong name or another program's file refused.
    assert.ok(nameProblem("") && nameProblem("  ") && nameProblem("a\nb") && nameProblem("x".repeat(81)) && !nameProblem("Agentless 项目"));
    const marked = await workspace(path.join(root, "named"), { look: { font: "serif" }, components: { hidden: ["a/b"] } });
    assert.deepEqual(await writeWorkspaceName(marked, " 项目 A "), { name: "项目 A", before: null });
    const written = JSON.parse(await fs.readFile(path.join(marked, "gallery.json"), "utf8"));
    assert.deepEqual(Object.keys(written), ["gallery", "version", "name", "look", "components"]);
    assert.deepEqual([written.name, written.look, written.components], ["项目 A", { font: "serif" }, { hidden: ["a/b"] }]);
    assert.deepEqual(await writeWorkspaceName(marked, "项目 B"), { name: "项目 B", before: "项目 A" });
    await assert.rejects(writeWorkspaceName(marked, "a\nb"), /one line/);
    // The file's own layout kept, as a person keeps it: BOM, CRLF, its keys' order, what stands on one line.
    const kept = await workspace(path.join(root, "kept"));
    const keptFile = path.join(kept, "gallery.json");
    const bom = String.fromCharCode(0xfeff);
    await fs.writeFile(keptFile, `${bom}{"version":1,"gallery":"workspace","look": { "font": "serif" }}\r\n`);
    await writeWorkspaceName(kept, "项目");
    assert.equal(await fs.readFile(keptFile, "utf8"), `${bom}{"version":1,"gallery":"workspace","name":"项目","look": { "font": "serif" }}\r\n`, "on one line, right after the mark");
    const laid = (name) => `{\r\n  "gallery": "workspace",\r\n  "version": 1,${name ? `\r\n  "name": "${name}",` : ""}\r\n  "look": { "font": "serif" }\r\n}\r\n`;
    await fs.writeFile(keptFile, laid(null));
    await writeWorkspaceName(kept, "甲");
    assert.equal(await fs.readFile(keptFile, "utf8"), laid("甲"), "a line of its own after the mark, CRLF");
    assert.deepEqual(await writeWorkspaceName(kept, "乙"), { name: "乙", before: "甲" });
    assert.equal(await fs.readFile(keptFile, "utf8"), laid("乙"), "renamed in its place, nothing else changed");
    await assert.rejects(writeWorkspaceName(path.join(root, "notours"), "x"), /not Gallery's/);
  }

  // ---------- the commands ----------
  {
    const bin = path.join(projectRoot, "src", "cli", "bin.mjs");
    const temp = path.join(root, "cmd-tmp");
    const data = path.join(root, "cmd-data");
    const home = path.join(root, "cmd-home");
    await fs.mkdir(temp, { recursive: true });
    const env = {
      ...process.env, GALLERY_DATA_DIR: data, TEMP: temp, TMP: temp, TMPDIR: temp, HOME: home, USERPROFILE: home,
      GALLERY_NO_PREVIEW: "1", GALLERY_NO_BROWSER: "1", GALLERY_NO_UPDATE_CHECK: "1", GALLERY_CACHE_DIR: path.join(root, "cmd-cache"),
      CLAUDE_CONFIG_DIR: path.join(root, "agents", "claude"), CODEX_HOME: path.join(root, "agents", "codex"),
    };
    delete env.GALLERY_WORKSPACE;
    delete env.GALLERY_DEFAULT_WORKSPACE; // This case tests discovery through its isolated HOME.
    const gallery = async (args, more = {}) => {
      try {
        const { stdout, stderr } = await run(process.execPath, [bin, ...args], { cwd: root, env: { ...env, ...more } });
        return { code: 0, stdout, stderr };
      } catch (error) {
        if (typeof error.code !== "number") throw error;
        return { code: error.code, stdout: error.stdout, stderr: error.stderr };
      }
    };
    const lines = (text) => text.trimEnd().split(/\r?\n/);
    const registered = async () => readRegistry({ file: path.join(data, "workspaces.json") }).workspaces.map(({ root: each }) => each);
    const spaces = path.join(root, "cmd");
    const project = path.join(spaces, "agentless", "outputs", "gallery");
    const other = path.join(spaces, "other");
    const third = path.join(spaces, "third");

    // init --name, and init without: both registered; stop never registers.
    const initNamed = await gallery(["init", other, "--name", "其他项目"]);
    assert.equal(initNamed.code, 0, initNamed.stderr);
    assert.deepEqual(lines(initNamed.stdout).slice(0, 2), [`工作区：${other}（新建）`, "名字：其他项目"]);
    assert.equal(JSON.parse(await fs.readFile(path.join(other, "gallery.json"), "utf8")).name, "其他项目");
    assert.equal((await gallery(["init", path.join(spaces, "bad"), "--name", "x".repeat(81)])).code, 2, "a name too long: exit 2");
    await assert.rejects(fs.stat(path.join(spaces, "bad")), "and nothing made");
    const stopped = await gallery(["stop", "--workspace", third]);
    assert.equal(stopped.code, 0, stopped.stderr);
    assert.deepEqual(await registered(), [other], "stop registers nothing");
    // new in a workspace with no name: the line saying how to name it; registered.
    const made = await gallery(["new", "agentless-report", "Agentless 项目汇报", "结论与数据", "--workspace", project]);
    assert.equal(made.code, 0, made.stderr);
    const hint = `提示：这个工作区还没有名字（别处按文件夹叫它"agentless"）；它是为一个项目建的，就用 gallery workspaces --name "<项目名>" 写上项目名`;
    assert.ok(lines(made.stdout).includes(hint), made.stdout);
    assert.ok(!(await gallery(["new", "plan", "计划", "--workspace", other])).stdout.includes("这个工作区还没有名字"), "none in a workspace with a name");
    assert.ok(!(await gallery(["new", "mine", "我的"])).stdout.includes("这个工作区还没有名字"), "none in the default workspace (the user's own)");
    const fallback = path.join(home, "Documents", "Gallery");
    assert.deepEqual(new Set(await registered()), new Set([other, project, fallback]), "every command's workspace registered");
    // Explicitly used workspaces are registered even in a temporary folder.
    const trial = path.join(temp, "trial");
    assert.equal((await gallery(["list", "--workspace", trial])).code, 0);
    assert.ok((await registered()).includes(trial), "all explicitly used workspaces are registered; tests isolate their data directory");

    // workspaces: the current one first, names, ids, documents; a gone one 不在了.
    await gallery(["new", "notes", "笔记", "--workspace", third]);
    await fs.rm(third, { recursive: true });
    const listed = await gallery(["workspaces", "--workspace", other]);
    assert.equal(listed.code, 0, listed.stderr);
    const out = lines(listed.stdout);
    assert.equal(out.shift(), "Gallery 服务：未启动");
    assert.equal(out[0], "5 workspaces on this machine's registry; the current one first (*):");
    assert.equal(out[1], `* 其他项目  ${workspaceId(other)}`);
    assert.equal(out[2], `    路径：${other}`);
    assert.match(out[3], /^ {4}文档：1 篇；上次编辑：\d{4}-\d\d-\d\d \d\d:\d\d$/);
    assert.ok(out.includes(`  agentless  ${workspaceId(project)}  （没有起名：用的是文件夹的名字）`), listed.stdout);
    assert.ok(out.includes(`  third  ${workspaceId(third)}  （不在了：文件夹或它的 gallery.json 找不到了）`), listed.stdout);
    assert.ok(out.indexOf(`    路径：${third}`) > out.indexOf(`    路径：${project}`), "a gone one last");
    assert.ok(listed.stdout.includes("gallery workspaces --forget <路径>"));
    assert.equal((await gallery(["workspaces", "--scan", "--forget", third])).code, 2, "two at once: exit 2");
    assert.equal((await gallery(["workspaces", "somewhere"])).code, 2, "no folder but --scan's");
    // --forget, by path; what is not registered: exit 1.
    const forgot = await gallery(["workspaces", "--forget", third]);
    assert.deepEqual([forgot.code, forgot.stdout.trim()], [0, `Forgot ${third} (only the registry changed: nothing on disk).`]);
    assert.equal((await gallery(["workspaces", "--forget", third])).code, 1);
    // --name: the current workspace named, made first when it is not there; a wrong name exit 2.
    const fresh = path.join(spaces, "fresh");
    const naming = await gallery(["workspaces", "--name", "新项目", "--workspace", fresh]);
    assert.equal(naming.code, 0, naming.stderr);
    assert.equal(JSON.parse(await fs.readFile(path.join(fresh, "gallery.json"), "utf8")).name, "新项目");
    assert.ok((await registered()).includes(fresh));
    assert.equal((await gallery(["workspaces", "--name", "a\tb", "--workspace", fresh])).code, 2);
    // --scan: what a folder holds, registered; said new or known.
    const found = await workspace(path.join(spaces, "found", "deep", "reports"));
    const scanned = await gallery(["workspaces", "--scan", spaces]);
    assert.equal(scanned.code, 0, scanned.stderr);
    assert.ok(scanned.stdout.includes(`  新登记：${found}（deep）`) &&scanned.stdout.includes(`  已登记：${other}（其他项目）`), scanned.stdout);
    assert.ok((await registered()).includes(found));
    assert.equal((await gallery(["workspaces", "--scan", path.join(spaces, "nope")])).code, 1);
    // Two called alike in one folder (the folder above them alike too): each told apart by its own path.
    const twin = path.join(spaces, "twin");
    assert.equal((await gallery(["workspaces", "--name", "其他项目", "--workspace", twin])).code, 0);
    const twins = lines((await gallery(["workspaces", "--workspace", other])).stdout);
    assert.equal(twins[2], `* 其他项目（${other}）  ${workspaceId(other)}`, twins.join("\n"));
    assert.ok(twins.includes(`  其他项目（${twin}）  ${workspaceId(twin)}`), twins.join("\n"));

    // list --all: the documents of every workspace, each after its 工作区; nothing written in any.
    const filesOf = async (folder) => (await fs.readdir(folder, { recursive: true })).sort();
    const before = await filesOf(project);
    await fs.rm(path.join(other, "preferences.md"), { force: true });
    const all = await gallery(["list", "agentless", "--all", "--workspace", other]);
    assert.equal(all.code, 0, all.stderr);
    const allLines = lines(all.stdout);
    const at = allLines.indexOf(`工作区：${project}`);
    assert.ok(at > 0 && allLines[at + 1] === "agentless-report  Agentless 项目汇报" && allLines[at + 2] === "  说明：结论与数据", all.stdout);
    assert.ok(allLines.includes(`  ${path.join(project, "agentless-report", "doc.html")}`));
    assert.ok(!all.stdout.includes("写作偏好"), "no 写作偏好 line");
    assert.deepEqual(await filesOf(project), before, "nothing written in another workspace");
    await assert.rejects(fs.stat(path.join(other, "preferences.md")), "nor 写作偏好 made in the current one");
    const everything = lines((await gallery(["list", "--all", "--workspace", other])).stdout);
    assert.equal(everything[everything.indexOf(`工作区：${other}`) + 1], "plan  计划", "no words: every document");
    assert.ok(everything.includes(`工作区：${fallback}`) && everything.includes(`工作区：${project}`));
    const none = await gallery(["list", "nothing-like-this", "--all", "--workspace", other]);
    assert.ok(none.code === 0 && none.stdout.includes('holds "nothing-like-this"'), none.stdout);
    assert.equal((await gallery(["list", "--all", "--tree", "--workspace", other])).code, 2, "--all and --tree: exit 2");
  }
} finally {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
}

console.log("Checked the machine's registry of workspaces and their names (src/shared/workspace-registry.mjs, workspace-name.mjs, user-directory.mjs) and the commands on them: gallery workspaces (--scan, --name, --forget), init --name, new's hint, list --all.");
