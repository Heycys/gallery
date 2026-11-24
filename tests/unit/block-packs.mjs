import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NO_PACKS, OFF_AT_FIRST, installOfficialPacks, installPack, offUntilInstalled, packsSkipped, readPack, removePack, workspacePacks } from "../../src/shared/block-packs.mjs";
import { componentSettings, forgetCatalog, menuOf, packageStates, readCatalog, settingsLine, writeComponentSettings } from "../../src/shared/component-catalog.mjs";
import { inDocumentMenus } from "../../src/shared/components/installed.mjs";
import { inLanguage, told } from "../../src/shared/i18n/index.mjs";
import { readPackManifest } from "../../src/shared/pack-manifest.mjs";
import { packsDirectory, projectRoot } from "../../src/shared/paths.mjs";
import { fingerprintOf, recordOf, shippedBlocks, shippedPackIds } from "../../src/shared/shipped-blocks.mjs";
import { ensureWorkspace } from "../../src/shared/workspace.mjs";
import { createPageService } from "../../src/editor/page-service.mjs";
import { createComponentSettings } from "../../src/server/component-settings.mjs";
import { packFilesAt, packFilesOfZip } from "../../src/transfer/pack-source.mjs";
import { createZip } from "../../src/transfer/zip.mjs";

// Block packs (自定义块包: src/shared/block-packs.mjs, decided 2026-11-09; docs/render.md
// "Block packs"): pack.json read and refused with why; a pack installed from a folder and from a zip (its
// folder at the top or what it holds), its blocks' and its own fingerprints recorded; installed again, a
// block as it was installed replaced, one changed since kept, one the new version has not taken out, the
// pack.json the same way; refused: a file pointing out of it, a block that does not name itself, a broken
// pack.json, one of Gallery's ids, an id a scope of the workspace holds that no install put there; the
// workspace's packs listed (Gallery's own, installed, the workspace's own); removed (never Gallery's, never
// a scope no install put there); Gallery's two packs installed once as a workspace starts (柔光风格 off),
// then brought up to Gallery's (a block changed kept, one taken away by hand left away, one new added),
// none under GALLERY_NO_PACKS; the switch (components.packs) keeping a pack's blocks from every menu and
// the library, the line a page hears, 组件列表's read and write; the library's blocks by pack (a section of
// each in the menu), in 组件列表's order of packs, no grey pack name; and the command, its lines and exit codes.

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-packs-"));
const FIXTURE = path.join(projectRoot, "tests", "fixtures", "packs", "my-cards");
const SOFT_NOTE = path.join(projectRoot, "tests", "fixtures", "packs", "soft-note");
let made = 0;
const workspace = async (name = `ws-${made++}`) => {
  const root = path.join(temp, name);
  await ensureWorkspace(root);
  return root;
};
const refusedWith = (code) => (error) => error.code === code;
const filesOf = (folder) => packFilesAt(folder);
const englishOf = (error) => inLanguage("en", () => told(error));
// A copy of the fixture to change, in a folder of its own.
const copyOf = (name, change = () => {}) => {
  const folder = path.join(temp, "sources", name);
  fs.rmSync(folder, { recursive: true, force: true });
  fs.cpSync(FIXTURE, folder, { recursive: true });
  change(folder);
  return folder;
};
const setVersion = (file, version) => fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/"version": "[^"]*"/, `"version": "${version}"`));

try {
  // ---------- pack.json ----------
  {
    const good = { id: "my-cards", name: "卡片", version: "1.0.0" };
    assert.deepEqual(readPackManifest(JSON.stringify(good)), { id: "my-cards", name: { zh: "卡片", en: "卡片" }, description: null, version: "1.0.0", author: null, homepage: null, icon: null }, "one string of words is both languages'; what it leaves out is null");
    assert.deepEqual(readPackManifest(`\uFEFF${JSON.stringify({ ...good, name: { zh: "卡片", en: "Cards" }, author: " 小林 ", icon: "🃏", homepage: "https://example.com/cards" })}`).name, { zh: "卡片", en: "Cards" }, "an editor's byte-order mark; { zh, en }");
    const refusals = [
      ["{ id: ", "pack.json is not JSON"],
      ["[]", "pack.json is to be an object"],
      [JSON.stringify({ ...good, extra: 1 }), "extra is not a field pack.json may hold"],
      [JSON.stringify({ name: "卡片", version: "1.0.0" }), "pack.json has no id"],
      [JSON.stringify({ ...good, id: "My Cards" }), "pack.json's id is lowercase letters, digits and hyphens, as my-cards"],
      [JSON.stringify({ ...good, id: "con" }), "pack.json's id is lowercase letters, digits and hyphens, as my-cards"],
      [JSON.stringify({ ...good, id: "local" }), "local is kept for the workspace's own blocks: give the pack another id"],
      [JSON.stringify({ ...good, version: "1.0" }), "pack.json's version is three numbers, as 1.0.0"],
      [JSON.stringify({ ...good, name: { zh: "卡片" } }), "pack.json's name is words, or { zh, en }: words in both languages"],
      [JSON.stringify({ ...good, homepage: "ftp://x" }), "pack.json's homepage is an address that starts with http or https"],
      [JSON.stringify({ ...good, icon: "<b>" }), "pack.json's icon is an emoji or a character or two"],
    ];
    for (const [text, said] of refusals) {
      assert.throws(() => readPackManifest(text), (error) => error.code === "manifest" && englishOf(error) === said, `${text}: ${said}`);
    }
    for (const id of shippedPackIds()) assert.equal(readPackManifest(fs.readFileSync(path.join(packsDirectory, id, "pack.json"), "utf8")).id, id, `Gallery's ${id}: its pack.json reads, its id its folder's`);
    assert.deepEqual(shippedPackIds(), ["gallery", "gallery-soft"], "Gallery's two packs");
  }

  // ---------- install from a folder, again, a newer version ----------
  {
    const root = await workspace("folder");
    const first = installPack(root, filesOf(FIXTURE));
    assert.deepEqual([first.did, first.id, first.version, first.from, first.added], ["installed", "my-cards", "1.0.0", null, ["my-cards/greet", "my-cards/note"]], "installed: each block added");
    const folder = path.join(root, "components", "my-cards");
    assert.deepEqual(fs.readdirSync(folder).sort(), ["greet", "note", "pack.json"], "its folder as the pack's");
    const record = recordOf(root);
    assert.deepEqual(record["my-cards/greet"], { version: "1.0.0", fingerprint: fingerprintOf(path.join(FIXTURE, "greet")) }, "each block's version and fingerprint, as gallery block add records one");
    assert.deepEqual(Object.keys(record.packs), ["my-cards"], "and the pack's");
    assert.deepEqual(record.packs["my-cards"].blocks, ["my-cards/greet", "my-cards/note"]);
    const catalog = readCatalog(root);
    assert.deepEqual([...catalog.packages.keys()].sort(), ["my-cards/greet", "my-cards/note"], "both load");
    assert.deepEqual(catalog.packs.get("my-cards"), { zh: "我的卡片", en: "My cards" }, "the catalog knows the pack's name");
    assert.equal(installPack(root, filesOf(FIXTURE)).did, "same", "installed again as it is: nothing to do");

    // The user changes greet; a newer version changes greet and note's words, takes out nothing but adds hello.
    fs.appendFileSync(path.join(folder, "greet", "template.html"), "<!-- mine -->\n");
    const newer = copyOf("newer", (at) => {
      setVersion(path.join(at, "pack.json"), "1.1.0");
      fs.writeFileSync(path.join(at, "greet", "template.html"), '<div data-doc-component="my-cards/greet">\n  <p>晚上好。</p>\n</div>\n');
      fs.writeFileSync(path.join(at, "note", "template.html"), '<div data-doc-component="my-cards/note">\n  <p>记两笔。</p>\n</div>\n');
      fs.cpSync(path.join(at, "greet"), path.join(at, "hello"), { recursive: true });
      fs.writeFileSync(path.join(at, "hello", "component.json"), fs.readFileSync(path.join(at, "hello", "component.json"), "utf8").replace("my-cards/greet", "my-cards/hello"));
      fs.writeFileSync(path.join(at, "hello", "template.html"), '<div data-doc-component="my-cards/hello">\n  <p>你好。</p>\n</div>\n');
    });
    const updated = installPack(root, filesOf(newer));
    assert.deepEqual([updated.did, updated.from, updated.version, updated.added, updated.updated, updated.kept], ["updated", "1.0.0", "1.1.0", ["my-cards/hello"], ["my-cards/note"], ["my-cards/greet"]], "a block as installed replaced, one changed since kept, a new one added");
    assert.ok(fs.readFileSync(path.join(folder, "greet", "template.html"), "utf8").includes("<!-- mine -->") && fs.readFileSync(path.join(folder, "note", "template.html"), "utf8").includes("记两笔"), "the changed greet kept, the note the new version's");
    assert.equal(JSON.parse(fs.readFileSync(path.join(folder, "pack.json"), "utf8")).version, "1.1.0", "its pack.json the new one's, as it was installed");
    assert.deepEqual(workspacePacks(root).find(({ id }) => id === "my-cards").changed, ["my-cards/greet"], "the list says what changed since it was installed");

    // A version without note: taken out, as it is as installed.
    const fewer = copyOf("fewer", (at) => {
      setVersion(path.join(at, "pack.json"), "1.2.0");
      fs.rmSync(path.join(at, "note"), { recursive: true });
      fs.cpSync(path.join(newer, "hello"), path.join(at, "hello"), { recursive: true });
      fs.cpSync(path.join(newer, "greet"), path.join(at, "greet"), { recursive: true });
    });
    const third = installPack(root, filesOf(fewer));
    assert.deepEqual([third.removed, third.kept, fs.existsSync(path.join(folder, "note")), recordOf(root)["my-cards/note"]], [["my-cards/note"], ["my-cards/greet"], false, undefined], "a block the new version has not: taken out with its record");

    // pack.json changed by hand is kept on the next install, and said.
    fs.writeFileSync(path.join(folder, "pack.json"), fs.readFileSync(path.join(folder, "pack.json"), "utf8").replace("小林", "小王"));
    const fourth = installPack(root, filesOf(copyOf("fourth", (at) => setVersion(path.join(at, "pack.json"), "1.3.0"))));
    assert.ok(fourth.ownKept && fs.readFileSync(path.join(folder, "pack.json"), "utf8").includes("小王"), "a pack.json changed since: kept");
  }

  // ---------- zips ----------
  {
    const entries = (folder, top = "") => fs.readdirSync(folder, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile())
      .map((entry) => { const name = path.relative(folder, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"); return { name: `${top}${name}`, data: fs.readFileSync(path.join(folder, name)) }; });
    const zipAt = (name, files) => {
      const file = path.join(temp, "zips", name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, createZip(files));
      return file;
    };
    const flat = zipAt("flat.zip", entries(FIXTURE));
    const nested = zipAt("nested.zip", [...entries(FIXTURE, "my-cards/"), { name: "__MACOSX/my-cards/._pack.json", data: "x" }, { name: "my-cards/.DS_Store", data: "x" }]);
    for (const zip of [flat, nested]) {
      const root = await workspace();
      const done = installPack(root, packFilesAt(zip));
      assert.deepEqual([done.did, done.added], ["installed", ["my-cards/greet", "my-cards/note"]], `${path.basename(zip)}: installed`);
      assert.deepEqual(fs.readdirSync(path.join(root, "components", "my-cards")).sort(), ["greet", "note", "pack.json"], `${path.basename(zip)}: nothing a system wrote`);
    }
    // Uploaded bytes (组件列表's 选择 zip 文件…) read the same way.
    assert.deepEqual(packFilesOfZip(fs.readFileSync(flat)).map(({ name }) => name).sort(), entries(FIXTURE).map(({ name }) => name).sort(), "a zip's bytes");
    assert.throws(() => packFilesOfZip(Buffer.from("not a zip")), refusedWith("kind"), "bytes of no zip");
    // A zip bomb (pack-install's 导入): an entry declared 1 KB that inflates to 64 MB passes the check of the
    // declared sizes and is refused as it is read, once past its size, never inflated whole.
    const bomb = Buffer.from(createZip([...entries(FIXTURE), { name: "greet/bomb.bin", data: Buffer.alloc(64 * 1024 * 1024) }]));
    const bombAt = bomb.indexOf(Buffer.from("greet/bomb.bin"));
    bomb.writeUInt32LE(1024, bombAt - 30 + 22); // its local header's size
    bomb.writeUInt32LE(1024, bomb.lastIndexOf(Buffer.from("greet/bomb.bin")) - 46 + 24); // its central record's
    assert.throws(() => packFilesOfZip(bomb), (error) => error.code === "size" && /bomb\.bin/.test(error.message), "a zip bomb: refused, too large");
    // A zip that points out of itself installs nothing.
    const evil = zipAt("evil.zip", [...entries(FIXTURE), { name: "../escaped.txt", data: "x" }]);
    const root = await workspace();
    assert.throws(() => installPack(root, packFilesAt(evil)), (error) => error.code === "path" && englishOf(error) === "../escaped.txt points outside the pack: not installed", "a path out of it");
    for (const name of ["/abs.txt", "C:/drive.txt", "a/./b.txt", "a\\..\\..\\b.txt"]) assert.throws(() => readPack([...entries(FIXTURE), { name, data: Buffer.from("x") }]), refusedWith("path"), name);
    assert.ok(!fs.existsSync(path.join(root, "components", "my-cards")) && !fs.existsSync(path.join(temp, "escaped.txt")), "nothing written");
    assert.throws(() => installPack(root, packFilesAt(zipAt("loose.zip", [{ name: "a/x.txt", data: "x" }, { name: "b/y.txt", data: "y" }]))), refusedWith("manifest"), "a zip of no pack");
    const notZip = path.join(temp, "zips", "plain.txt");
    fs.writeFileSync(notZip, "plain");
    assert.throws(() => packFilesAt(notZip), refusedWith("kind"), "a file of no zip");
    assert.throws(() => packFilesAt(path.join(temp, "nowhere")), refusedWith("missing"), "nothing there");
  }

  // ---------- refusals ----------
  {
    const root = await workspace("refused");
    const broken = copyOf("broken", (at) => fs.writeFileSync(path.join(at, "pack.json"), "{ id: "));
    assert.throws(() => installPack(root, filesOf(broken)), refusedWith("manifest"), "a broken pack.json");
    const misnamed = copyOf("misnamed", (at) => fs.writeFileSync(path.join(at, "greet", "component.json"), fs.readFileSync(path.join(at, "greet", "component.json"), "utf8").replace("my-cards/greet", "my-cards/other")));
    assert.throws(() => installPack(root, filesOf(misnamed)), (error) => error.code === "block" && englishOf(error) === "greet/component.json's id is to be my-cards/greet", "a block that does not name itself");
    const bare = copyOf("bare", (at) => fs.rmSync(path.join(at, "greet", "component.json")));
    assert.throws(() => installPack(root, filesOf(bare)), refusedWith("block"), "a block folder with no manifest");
    const official = copyOf("official", (at) => fs.writeFileSync(path.join(at, "pack.json"), fs.readFileSync(path.join(at, "pack.json"), "utf8").replace('"my-cards"', '"gallery"')));
    assert.throws(() => installPack(root, filesOf(official)), (error) => error.code === "official" && englishOf(error) === "gallery is the id of one of Gallery's own packs: give this pack another id", "one of Gallery's ids");
    fs.mkdirSync(path.join(root, "components", "my-cards", "mine"), { recursive: true });
    fs.writeFileSync(path.join(root, "components", "my-cards", "mine", "component.json"), "{}");
    assert.throws(() => installPack(root, filesOf(FIXTURE)), (error) => error.code === "taken" && englishOf(error).startsWith("The workspace has components/my-cards already"), "a scope someone wrote there");
    assert.deepEqual(fs.readdirSync(path.join(root, "components", "my-cards")), ["mine"], "left as it was");
  }

  // ---------- list and remove ----------
  {
    const root = await workspace("listed");
    installPack(root, filesOf(FIXTURE));
    fs.mkdirSync(path.join(root, "components", "local", "mine"), { recursive: true });
    fs.cpSync(path.join(FIXTURE, "greet"), path.join(root, "components", "local", "mine"), { recursive: true });
    fs.writeFileSync(path.join(root, "components", "local", "mine", "component.json"), fs.readFileSync(path.join(FIXTURE, "greet", "component.json"), "utf8").replace("my-cards/greet", "local/mine"));
    fs.mkdirSync(path.join(root, "components", "gallery-soft"), { recursive: true });
    fs.copyFileSync(path.join(packsDirectory, "gallery-soft", "pack.json"), path.join(root, "components", "gallery-soft", "pack.json"));
    const listed = workspacePacks(root);
    assert.deepEqual(listed.map(({ id, kind, blocks, enabled }) => [id, kind, blocks, enabled]), [["local", "default", 1, true], ["gallery-soft", "official", 0, true], ["my-cards", "installed", 2, true]], "the default pack first (local/, where a block of no pack named goes), Gallery's own, then installed (a pack of no blocks too)");
    assert.deepEqual([listed[0].name, listed[0].description.zh], [{ zh: "默认块包", en: "Default pack" }, "文档里常用的卡片和指标，以及 Agent 写自定义块时没有指定块包的块。只写一个块，不用另建块包。"], "the default pack: its name and words, no pack.json");
    assert.deepEqual(listed.find(({ id }) => id === "my-cards"), { id: "my-cards", name: { zh: "我的卡片", en: "My cards" }, description: { zh: "两张自己画的卡片：问候和便签。", en: "Two cards of one's own: a greeting and a note." }, version: "1.0.0", author: "小林", homepage: null, icon: "🃏", kind: "installed", problem: null, blocks: 2, enabled: true, changed: [], newer: null }, "what its card says");
    fs.writeFileSync(path.join(root, "components", "local", "pack.json"), "{ broken");
    assert.equal(workspacePacks(root).find(({ id }) => id === "local").problem.en, "pack.json is not JSON", "a pack.json that does not read: why");
    fs.rmSync(path.join(root, "components", "local", "pack.json"));
    assert.throws(() => removePack(root, "gallery-soft"), (error) => error.code === "official" && englishOf(error) === "gallery-soft is one of Gallery's own packs and can't be removed: turn it off in Settings › Components", "never one of Gallery's");
    assert.throws(() => removePack(root, "local"), refusedWith("own"), "never a scope no install put there");
    assert.throws(() => removePack(root, "nothing"), refusedWith("missing"), "none there");
    assert.deepEqual(removePack(root, "my-cards"), { id: "my-cards", version: "1.0.0", blocks: ["my-cards/greet", "my-cards/note"] }, "removed");
    assert.ok(!fs.existsSync(path.join(root, "components", "my-cards")) && !Object.keys(recordOf(root)).some((key) => key.startsWith("my-cards/")) && !recordOf(root).packs["my-cards"], "its folder and records gone");
    assert.equal(installPack(root, filesOf(FIXTURE)).did, "installed", "and it installs again as new");
  }

  // ---------- Gallery's own packs, as a workspace starts ----------
  {
    assert.ok(packsSkipped() && process.env[NO_PACKS] === "1", "every unit test runs with GALLERY_NO_PACKS (workspace-env.mjs)");
    assert.ok(!packsSkipped({ [NO_PACKS]: "" }) && !packsSkipped({ [NO_PACKS]: "0" }) && packsSkipped({ [NO_PACKS]: "yes" }));
    const off = await workspace("official-off");
    assert.deepEqual(await installOfficialPacks(off), { did: "off", packs: [] }, "GALLERY_NO_PACKS: none");
    assert.ok(!fs.existsSync(path.join(off, "components")), "nothing written");
    // Nothing installed, no switch written: 柔光风格 is off as its first install would leave it, so the library (Gallery's own blocks from the package) holds Gallery 风格's alone, in plain names.
    assert.deepEqual(offUntilInstalled(off, {}), ["gallery-soft"]);
    assert.deepEqual(offUntilInstalled(off, { "gallery-soft": true }), [], "a switch written (on) is the reader's");
    assert.deepEqual(offUntilInstalled(off, { "gallery-soft": false }), [], "and off is in packsOff already");
    const bare = createPageService({ root: off, edits: null, stateDirectory: path.join(off, ".gallery", "state"), catalog: () => readCatalog(off) }).library("zh");
    assert.ok(bare.length > 0 && bare.every(({ pack, of }) => pack.id === "gallery" && of === undefined), `the library with no pack installed: Gallery 风格's blocks, none of 柔光风格's, no grey name: ${bare.map(({ id }) => id).join(" ")}`);
    await writeComponentSettings(off, { pack: "gallery-soft", enabled: true });
    const both = createPageService({ root: off, edits: null, stateDirectory: path.join(off, ".gallery", "state"), catalog: () => readCatalog(off) }).library("zh");
    const softBlocks = both.filter(({ id }) => id.startsWith("gallery-soft/"));
    const firstSoft = both.findIndex(({ id }) => id.startsWith("gallery-soft/"));
    assert.ok(softBlocks.length > 0 && softBlocks.every(({ pack, of }) => pack.name?.zh === "柔光风格" && of === undefined) && both.slice(0, firstSoft).every(({ pack }) => pack.id === "gallery") && both.slice(firstSoft).every(({ pack }) => pack.id === "gallery-soft"),
      "switched on by hand: 柔光风格's blocks come in, after Gallery 风格's (a section each), each saying its pack's name (its pack.json's, installed or not), none a grey one", both.map(({ id }) => id).join(" "));
    const byName = (list) => list.map(({ name }) => name.zh);
    assert.deepEqual(byName(softBlocks), [...byName(softBlocks)].sort((a, b) => a.localeCompare(b, "zh-CN")), "a pack's blocks by name");
    await writeComponentSettings(off, { pack: "gallery-soft", enabled: false });

    // A copy of Gallery's packs to change (a newer Gallery), the package's untouched.
    const shipped = path.join(temp, "shipped-packs");
    fs.cpSync(packsDirectory, shipped, { recursive: true });
    fs.rmSync(path.join(shipped, "gallery-soft", "note"), { recursive: true, force: true }); // a block 柔光风格 gets in a newer Gallery (below)
    const root = await workspace("official");
    const heard = [];
    const first = await installOfficialPacks(root, { directory: shipped, env: {}, log: (line) => heard.push(line) });
    const gallery = shippedBlocks(shipped).filter(({ pack }) => pack === "gallery");
    assert.deepEqual(first.packs.map(({ id, did, first: once }) => [id, did, once]), [["gallery", "installed", true], ["gallery-soft", "installed", true]], "both installed, once");
    assert.deepEqual(first.packs[0].added, gallery.map(({ id }) => id), "Gallery 风格: each of its blocks");
    assert.deepEqual(componentSettings(root).packs, { "gallery-soft": false }, "柔光风格 switched off as it is first installed");
    assert.deepEqual(OFF_AT_FIRST, ["gallery-soft"]);
    assert.ok(heard.length === 2 && heard[1].endsWith("switched off: 设置 › 组件列表 turns it on"), heard.join("\n"));
    assert.deepEqual(workspacePacks(root).map(({ id, kind, enabled }) => [id, kind, enabled]), [["local", "default", true], ["gallery", "official", true], ["gallery-soft", "official", false]], "the default pack first, Gallery's two after it");
    // Gallery's own blocks for documents count in the default pack (packOf), Gallery 风格 holding its page cards alone, though one folder holds them all.
    const counted = Object.fromEntries(workspacePacks(root, { directory: shipped }).map(({ id, blocks }) => [id, blocks]));
    const forDocuments = gallery.filter(({ places }) => !places.includes("page")).map(({ id }) => id).sort();
    assert.deepEqual(forDocuments, ["gallery/card", "gallery/chart-card", "gallery/metric"], "Gallery's own blocks for documents alone");
    assert.deepEqual([counted.local, counted.gallery], [forDocuments.length, gallery.length - forDocuments.length], "组件列表: those in the default pack, Gallery 风格 its page cards alone");
    assert.ok(forDocuments.every((id) => fs.existsSync(path.join(root, "components", ...id.split("/"), "component.json"))) && first.packs[0].added.includes("gallery/metric"), "installed by Gallery 风格's install into components/gallery/<name>/, their ids as ever");
    const states = packageStates(readCatalog(root));
    assert.deepEqual(states.filter(({ pack }) => pack === "local").map(({ id }) => id), forDocuments, "each row's pack: the default pack's");
    heard.length = 0;
    const again = await installOfficialPacks(root, { directory: shipped, env: {}, log: (line) => heard.push(line) });
    assert.deepEqual([again.packs.map(({ did }) => did), heard], [["same", "same"], []], "a second start: nothing to do, nothing said");

    // The reader turns 柔光风格 on: a later start leaves it on.
    await writeComponentSettings(root, { pack: "gallery-soft", enabled: true });
    await installOfficialPacks(root, { directory: shipped, env: {}, log: () => {} });
    assert.deepEqual(componentSettings(root).packs, { "gallery-soft": true }, "the reader's switch kept");

    // A newer Gallery: today changed, a new block in 柔光风格, note changed by the reader, habit taken away by hand.
    const workspaceNote = path.join(root, "components", "gallery", "note");
    fs.appendFileSync(path.join(workspaceNote, "style.css"), "/* mine */\n");
    fs.rmSync(path.join(root, "components", "gallery", "habit"), { recursive: true });
    fs.appendFileSync(path.join(shipped, "gallery", "today", "style.css"), "/* newer */\n");
    fs.appendFileSync(path.join(shipped, "gallery", "note", "style.css"), "/* newer */\n");
    setVersion(path.join(shipped, "gallery", "note", "component.json"), "9.0.0");
    fs.cpSync(SOFT_NOTE, path.join(shipped, "gallery-soft", "note"), { recursive: true });
    setVersion(path.join(shipped, "gallery", "pack.json"), "1.3.0");
    heard.length = 0;
    const later = await installOfficialPacks(root, { directory: shipped, env: {}, log: (line) => heard.push(line) });
    const [own, soft] = later.packs;
    assert.deepEqual([own.did, own.updated, own.kept, own.skipped], ["updated", ["gallery/today"], ["gallery/note"], ["gallery/habit"]], "a block as installed updated, one changed kept, one taken away left away");
    assert.deepEqual([soft.did, soft.added], ["updated", ["gallery-soft/note"]], "a block new in a pack added");
    assert.ok(fs.readFileSync(path.join(root, "components", "gallery", "today", "style.css"), "utf8").endsWith("/* newer */\n") && fs.readFileSync(path.join(workspaceNote, "style.css"), "utf8").endsWith("/* mine */\n") && !fs.existsSync(path.join(root, "components", "gallery", "habit")));
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, "components", "gallery", "pack.json"), "utf8")).version, "1.3.0", "its pack.json the new one's");
    assert.ok(heard.some((line) => line.includes("updated to this Gallery's: gallery/today")) && heard.some((line) => line.includes("has new blocks: gallery-soft/note")), heard.join("\n"));
    const listed = workspacePacks(root, { directory: shipped }).find(({ id }) => id === "gallery");
    assert.deepEqual([listed.changed, listed.newer], [["gallery/note"], "1.3.0"], "组件列表: the pack changed since, by its note, and Gallery's newer version not put over it");

    // An older workspace whose blocks gallery block add put in: the first install takes them as they are.
    const older = await workspace("official-older");
    const { addShipped } = await import("../../src/shared/shipped-blocks.mjs");
    addShipped(older, shippedBlocks(shipped).find(({ id }) => id === "gallery/today"));
    const adopted = await installOfficialPacks(older, { directory: shipped, env: {}, log: () => {} });
    assert.ok(adopted.packs[0].same.includes("gallery/today") && !adopted.packs[0].added.includes("gallery/today") && adopted.packs[0].added.length === gallery.length - 1, "the block added before kept as it is, the rest added");
    // A gallery.json not Gallery's: none installed (nothing could switch 柔光风格 off).
    const foreign = path.join(temp, "foreign");
    fs.mkdirSync(foreign, { recursive: true });
    fs.writeFileSync(path.join(foreign, "gallery.json"), "{ broken");
    assert.deepEqual(await installOfficialPacks(foreign, { directory: shipped, env: {} }), { did: "unread", packs: [] });
  }

  // ---------- the switch ----------
  {
    const root = await workspace("switch");
    installPack(root, filesOf(FIXTURE));
    fs.mkdirSync(path.join(root, "components", "gallery"), { recursive: true });
    fs.cpSync(path.join(packsDirectory, "gallery", "note"), path.join(root, "components", "gallery", "note"), { recursive: true });
    fs.cpSync(path.join(packsDirectory, "gallery", "metric"), path.join(root, "components", "gallery", "metric"), { recursive: true });
    fs.copyFileSync(path.join(packsDirectory, "gallery", "pack.json"), path.join(root, "components", "gallery", "pack.json"));
    const on = readCatalog(root);
    assert.deepEqual(menuOf(on).filter(({ id }) => id.startsWith("gallery/")).map(({ id, pack }) => [id, pack]), [["gallery/metric", { id: "local", name: { zh: "默认块包", en: "Default pack" } }], ["gallery/note", { id: "gallery", name: { zh: "Gallery 风格", en: "Gallery style" } }]], "Gallery's metric counts in the default pack, its note in Gallery 风格 (packOf), one folder holding both");
    assert.deepEqual(menuOf(on).filter(({ id }) => id.startsWith("my-cards/")).map(({ id, state, pack }) => [id, state, pack]), [["my-cards/greet", "hidden", { id: "my-cards", name: { zh: "我的卡片", en: "My cards" } }], ["my-cards/note", "normal", { id: "my-cards", name: { zh: "我的卡片", en: "My cards" } }]], "the page's map: each block's pack and its name");
    const library = (catalog) => createPageService({ root, edits: null, stateDirectory: path.join(root, ".gallery", "state"), catalog: () => catalog, shipped: path.join(temp, "no-packs") }).library("zh");
    assert.deepEqual(library(on).map(({ id, pack, of }) => [id, pack.name?.zh ?? null, of ?? null]), [["gallery/note", "Gallery 风格", null], ["my-cards/note", "我的卡片", null], ["my-cards/greet", "我的卡片", null]], "the library: a pack's blocks together (a section each in the menu), each saying its pack, no grey name");
    assert.deepEqual(library(on).filter(({ id }) => id === "my-cards/note").map(({ pack }) => pack), [{ id: "my-cards", name: { zh: "我的卡片", en: "My cards" } }]);
    await writeComponentSettings(root, { pack: "my-cards", enabled: false });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "gallery.json"), "utf8")).components.packs, { "my-cards": { enabled: false } }, "gallery.json's components.packs");
    const off = readCatalog(root);
    assert.deepEqual([off.settings.packsOff, off.stamp === on.stamp], [["my-cards"], false], "the catalog's settings and stamp say it");
    assert.deepEqual(menuOf(off).filter(({ id }) => id.startsWith("my-cards/")).map(({ state }) => state), ["hidden", "hidden"], "no menu offers its blocks");
    assert.deepEqual([...off.packages.keys()].sort(), ["gallery/metric", "gallery/note", "my-cards/greet", "my-cards/note"], "they load all the same: what is written of them shows");
    assert.deepEqual(library(off).map(({ id }) => id), ["gallery/note"], "the library: none of its blocks");
    assert.equal(settingsLine(off.settings), "settings      my-cards ", "the line a page hears: its sixth list");
    assert.equal(inDocumentMenus(["document"], { packsOff: ["my-cards"] }, "my-cards/note"), false, "the one rule the server and the page run");
    assert.equal(inDocumentMenus(["document"], { packsOff: ["my-cards"] }, "local/note"), true);
    assert.deepEqual([inDocumentMenus(["document"], { packsOff: ["gallery"] }, "gallery/metric"), inDocumentMenus(["document"], { packsOff: ["local"] }, "gallery/metric"), inDocumentMenus(["page"], { shown: ["gallery/note"], packsOff: ["gallery"] }, "gallery/note")], [true, false, false],
      "Gallery 风格 off leaves Gallery's own blocks for documents in the menus, the default pack off takes them out; its page cards go with Gallery 风格");
    assert.equal(packageStates(off).find(({ id }) => id === "my-cards/note").menu, true, "a block's own switch says what it would be: the pack's is a switch of its own");
    // 组件列表: read and write.
    const settings = createComponentSettings({ root, taken: () => forgetCatalog(root) });
    const read = settings.read();
    assert.deepEqual(read.packs.map(({ id, enabled, blocks }) => [id, enabled, blocks]), [["local", true, 1], ["gallery", true, 1], ["my-cards", false, 2]], "the pack cards: the default pack first, holding Gallery's metric");
    assert.deepEqual(read.packages.map(({ id, pack }) => [id, pack]), [["gallery/metric", "local"], ["gallery/note", "gallery"], ["my-cards/greet", "my-cards"], ["my-cards/note", "my-cards"]], "each row's pack");
    // A workspace whose Gallery's own blocks are those for documents alone (gallery block add card, no pack installed): no card of Gallery 风格, the block in the default pack's.
    const bare = await workspace("documents-only");
    fs.cpSync(path.join(packsDirectory, "gallery", "card"), path.join(bare, "components", "gallery", "card"), { recursive: true });
    assert.deepEqual(workspacePacks(bare).map(({ id, blocks }) => [id, blocks]), [["local", 1]], "no Gallery 风格 card for a block that counts in the default pack");
    fs.writeFileSync(path.join(bare, "components", "gallery", "card", "component.json"), "{ broken");
    assert.deepEqual(workspacePacks(bare).map(({ id, blocks }) => [id, blocks]), [["local", 1]], "one whose manifest does not read counts by Gallery's");
    const written = await settings.write({ pack: "my-cards", enabled: true });
    assert.equal(written.packs.find(({ id }) => id === "my-cards").enabled, true, "switched on, answering as read");
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "gallery.json"), "utf8")).components.packs, { "my-cards": { enabled: true } }, "written on, not taken out");
    await assert.rejects(settings.write({ pack: "nothing", enabled: false }), (error) => englishOf(error) === "No such block pack");
    await assert.rejects(settings.write({ pack: "my-cards", enabled: "no" }), (error) => englishOf(error) === "That setting isn't valid");
    // 导入: by a path, and refused with why.
    const other = await workspace("import");
    const importer = createComponentSettings({ root: other, taken: () => forgetCatalog(other) });
    const answer = importer.install({ path: FIXTURE });
    assert.deepEqual([answer.installed.did, answer.packs.map(({ id }) => id)], ["installed", ["local", "my-cards"]], "installed, answering as read");
    assert.throws(() => importer.install({ path: "" }), refusedWith("path"));
    assert.throws(() => importer.install({ path: path.join(temp, "nowhere") }), refusedWith("missing"));
    assert.throws(() => importer.install({ zip: Buffer.from("plain").toString("base64") }), refusedWith("kind"));
  }

  // ---------- the command ----------
  {
    const run = promisify(execFile);
    const bin = path.join(projectRoot, "src", "cli", "bin.mjs");
    const root = await workspace("command");
    const gallery = (args) => run(process.execPath, [bin, "--workspace", root, "block", ...args], { cwd: temp, env: { ...process.env, GALLERY_DEFAULT_WORKSPACE: root, GALLERY_NO_BROWSER: "1", GALLERY_NO_UPDATE_CHECK: "1" } }).then(({ stdout, stderr }) => ({ code: 0, stdout, stderr }), (error) => ({ code: error.code, stdout: error.stdout, stderr: error.stderr }));
    const lines = (text) => text.trimEnd().split(/\r?\n/);
    const installed = await gallery(["pack", "install", FIXTURE]);
    assert.equal(installed.code, 0, installed.stderr);
    assert.deepEqual(lines(installed.stdout).slice(0, 2), [`Installed the pack my-cards 1.0.0 (我的卡片 / My cards), 2 blocks: ${path.join(root, "components", "my-cards")}`, "  added: my-cards/greet, my-cards/note"]);
    const again = await gallery(["pack", "install", FIXTURE]);
    assert.ok(again.code === 0 && again.stdout.startsWith("The pack my-cards 1.0.0 is in already, as installed:"), again.stdout);
    const listed = await gallery(["pack", "list"]);
    assert.deepEqual(lines(listed.stdout), [
      `工作区：${root}`,
      "默认块包 / Default pack  (local, the default pack: Gallery's own blocks for documents, and where a block made with no pack named goes, on, 0 blocks)",
      "  说明：文档里常用的卡片和指标，以及 Agent 写自定义块时没有指定块包的块。只写一个块，不用另建块包。 / The card and metric documents use, and an Agent's custom block when it names no pack: a single block needs no pack of its own.",
      "我的卡片 / My cards  (my-cards 1.0.0, a pack installed, on, 2 blocks, by 小林)",
      "  说明：两张自己画的卡片：问候和便签。 / Two cards of one's own: a greeting and a note.",
    ], "the default pack first, then the pack installed");
    const refused = await gallery(["pack", "remove", "gallery"]);
    assert.deepEqual([refused.code, refused.stderr.trim()], [1, "Not removed: gallery is one of Gallery's own packs and can't be removed: turn it off in Settings › Components"]);
    const scoped = await gallery(["new", "my-cards/extra"]);
    assert.ok(scoped.code === 2 && scoped.stderr.startsWith("The scope my-cards/ is the pack my-cards's, which gallery block pack install put in"), scoped.stderr);
    const shippedScope = await gallery(["new", "gallery-soft/extra"]);
    assert.ok(shippedScope.code === 2 && shippedScope.stderr.startsWith("The scope gallery-soft/ is kept for Gallery's own blocks"), shippedScope.stderr);
    const missing = await gallery(["pack", "install", path.join(temp, "nowhere")]);
    assert.deepEqual([missing.code, missing.stderr.trim()], [1, `Not installed: ${path.join(temp, "nowhere")} was not found`]);
    const usage = await gallery(["pack", "frobnicate"]);
    assert.ok(usage.code === 2 && usage.stderr.includes("No such pack command: frobnicate (install, list, remove, on, off).") && usage.stderr.includes("Usage: gallery block pack install <folder|zip>"), usage.stderr);
    const two = await gallery(["pack", "install"]);
    assert.ok(two.code === 2 && two.stderr.includes("gallery block pack install takes one folder or zip"), two.stderr);
    const removed = await gallery(["pack", "remove", "my-cards"]);
    assert.deepEqual([removed.code, removed.stdout.trim()], [0, "Removed the pack my-cards 1.0.0 (2 blocks): what documents and pages hold of its blocks stays, shown as blocks that are not there."]);
    const empty = await gallery(["pack", "list"]);
    assert.deepEqual(lines(empty.stdout).filter((line) => !line.startsWith("  ")), [`工作区：${root}`, "默认块包 / Default pack  (local, the default pack: Gallery's own blocks for documents, and where a block made with no pack named goes, on, 0 blocks)", "No other block packs: gallery block pack install <folder|zip> installs one."], "the default pack alone, and that no other is installed");
  }
} finally {
  fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5 });
}

console.log("Checked block packs: pack.json read and refused with why; a pack installed from a folder and from a zip (its folder at the top or what it holds, what a system wrote left out), recorded as Gallery's own blocks are; installed again, a block as installed replaced, one changed since kept, one the new version has not taken out, a pack.json changed kept; refused for a path out of it, a block that does not name itself, a broken pack.json, one of Gallery's ids and a scope someone wrote; the packs listed (Gallery's own, installed, the workspace's own) and removed (never Gallery's or a scope no install put there); Gallery's two packs installed once as a workspace starts (柔光风格 off), brought up to Gallery's with a changed block kept, one taken away left away and a new one added, none under GALLERY_NO_PACKS; Gallery's own blocks for documents counting in the default pack (Gallery 风格 its page cards alone, its switch none of theirs); the switch keeping a pack's blocks from every menu and the library, the line a page hears, 组件列表's read and write and 导入; the library's blocks by pack, no grey name; the command's lines and exit codes.");
