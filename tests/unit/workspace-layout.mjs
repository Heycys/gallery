import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createEditService } from "../../src/editor/service.mjs";
import { createReportFromStarter, loadReports } from "../../src/render/reports.mjs";
import { spawnSync } from "node:child_process";
import { copiedLines } from "../../src/cli/init.mjs";
import { adoptWorkspace, changeOf, ignoredIn } from "../../src/server/index.mjs";
import { HOME_ICON, NO_DEFAULT_HOME, homeFailure, homeOff, makeDefaultHome } from "../../src/editor/home-page.mjs";
import { readPage } from "../../src/shared/page-cards.mjs";
import { iconImage } from "../../src/render/emoji.mjs";
import { iconKind } from "../../src/shared/emoji/icon-value.mjs";
import { HOME_CARDS, createPage, pageFiles, pagesSettings } from "../../src/shared/pages.mjs";
import { workspaceRoot } from "../../src/shared/paths.mjs";
import {
  COMPONENTS_FOLDER, PAGES_FOLDER, PAGE_SLUG, RESERVED, WORKSPACE_MARK, adoptOldLayout, copyOldDocuments, documentDirectory, documentFiles, documentsFolder,
  ensureWorkspace, findWorkspace, idHolder, isDocSlug, isSlugName, keptName, layoutOf, listDocumentSlugs, newDocSlug, packageFolders, pageNames, pageSlug, slugTaken,
} from "../../src/shared/workspace.mjs";
import { DOC_SLUG, earlierId, pageId } from "../../src/shared/page-links.mjs";
import { createWorkspaceService } from "../../src/workbench/service.mjs";

// The workspace and its layout (src/shared/workspace.mjs, docs/internals.md "Where things live"):
// where it is found (--workspace, GALLERY_WORKSPACE, the nearest gallery.json of ours up, else
// ~/Documents/Gallery), what makes it (gallery.json and .gallery/, never over what is there), which
// folders are documents (doc.html, or an old one's report.html: read and written under its names),
// where the 写作偏好 page is (.gallery/pages/), what the preview's watcher leaves alone, the copy of an
// old reports/ folder (gallery init --from) and the adoption of a workspace's own old layout (the dev
// checkout's), each of which only reads the old folder; and the default home page (src/editor/home-page.mjs):
// made once for a workspace (gallery.json's pages.homeMade), never again, a pages/home there kept and
// only marked, none where gallery.json does not read or the slug is a document's, none from
// ensureWorkspace, none with GALLERY_NO_DEFAULT_HOME (which every unit test runs with).

const root = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-layout-"));
const write = async (file, text) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text);
};
const exists = (file) => fs.access(file).then(() => true, () => false);
const page = (slug, title) => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head><body>
<main class="doc-page" data-doc-id="${slug}" aria-label="${title}">
  <header class="doc-header"><h1 class="doc-title">${title}</h1></header>
  <p data-block-id="p0000001">正文。</p>
</main>
</body></html>
`;
const metadata = (title, more = {}) => `${JSON.stringify({ title, description: "说明", type: "note", ...more }, null, 2)}\n`;
// A folder's every file and its bytes, as one digest: what "only read" is held to.
async function digestOf(folder) {
  const hash = createHash("sha256");
  const walk = async (at) => {
    for (const entry of (await fs.readdir(at, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const file = path.join(at, entry.name);
      hash.update(path.relative(folder, file));
      if (entry.isDirectory()) await walk(file);
      else hash.update(await fs.readFile(file));
    }
  };
  await walk(folder);
  return hash.digest("hex");
}

try {
  // ---------- where a workspace is ----------
  {
    const home = path.join(root, "home");
    const deep = path.join(root, "found", "a", "b");
    await fs.mkdir(deep, { recursive: true });
    const none = { env: {}, cwd: deep, home };
    assert.deepEqual(findWorkspace(none), { root: path.join(home, "Documents", "Gallery"), how: "default" }, "nothing found: ~/Documents/Gallery");
    // Another program's gallery.json on the way up is not ours; ours is found from below it.
    await write(path.join(root, "found", "a", "gallery.json"), JSON.stringify({ name: "someone else's" }));
    assert.equal(findWorkspace(none).how, "default", "another program's gallery.json is not a workspace");
    await write(path.join(root, "found", "a", "gallery.json"), `\uFEFF${JSON.stringify(WORKSPACE_MARK)}`);
    assert.deepEqual(findWorkspace(none), { root: path.join(root, "found", "a"), how: "found" }, "a byte-order mark, which an editor on Windows may write, is none of what it says");
    await write(path.join(root, "found", "a", "gallery.json"), JSON.stringify({ name: "someone else's" }));
    await write(path.join(root, "found", "gallery.json"), JSON.stringify(WORKSPACE_MARK));
    assert.deepEqual(findWorkspace(none), { root: path.join(root, "found"), how: "found" }, "the nearest gallery.json of ours up");
    assert.deepEqual(findWorkspace({ ...none, env: { GALLERY_WORKSPACE: "rel" } }), { root: path.join(deep, "rel"), how: "env" }, "the environment before what is found");
    assert.deepEqual(findWorkspace({ ...none, env: { GALLERY_WORKSPACE: "x" }, flag: "flagged" }), { root: path.join(deep, "flagged"), how: "flag" }, "--workspace before all");
    // The tests never resolve the user's own (run.mjs and every file set GALLERY_WORKSPACE first).
    assert.equal(findWorkspace().how, "env", "the tests' workspace is named, never ~/Documents/Gallery");
    assert.equal(workspaceRoot, path.resolve(process.env.GALLERY_WORKSPACE));
  }

  // ---------- the Documents folder the default workspace is made in ----------
  {
    const home = path.join(root, "people", "ann");
    const there = new Set();
    const exists = (folder) => there.has(path.normalize(folder));
    const windows = (value, more = {}) => documentsFolder({
      home, env: { USERPROFILE: home, OneDrive: path.join(home, "OneDrive") }, platform: "win32", realHome: home,
      readRegistry: () => value, exists, ...more,
    });
    const onedrive = path.join(home, "OneDrive", "Documents");
    there.add(path.join(home, "Documents")).add(onedrive);
    assert.equal(windows("%USERPROFILE%\\Documents"), path.join(home, "Documents"), "Windows as set up: %USERPROFILE%\\Documents");
    assert.equal(windows(onedrive), onedrive, "OneDrive backing Documents up: the folder Explorer shows");
    assert.equal(windows("%OneDrive%\\Documents"), onedrive, "its variables expanded, by any case");
    const chinese = path.join(home, "OneDrive - 公司", "文档");
    there.add(chinese);
    assert.equal(windows(chinese), chinese, "a folder named in Chinese whole");
    assert.equal(windows("%NOWHERE%\\Documents"), path.join(home, "Documents"), "a variable not set: <home>\\Documents");
    assert.equal(windows("D:\\Missing\\Documents"), path.join(home, "Documents"), "a folder not there: <home>\\Documents");
    assert.equal(windows("Documents"), path.join(home, "Documents"), "a value that is no absolute path: <home>\\Documents");
    assert.equal(windows(null), path.join(home, "Documents"), "reg.exe found nothing: <home>\\Documents");
    assert.equal(windows(onedrive, { readRegistry: () => { throw new Error("no reg.exe"); } }), path.join(home, "Documents"), "reg.exe failing: <home>\\Documents");
    let asked = false;
    const sandbox = path.join(root, "sandbox");
    assert.equal(windows(onedrive, { home: sandbox, readRegistry: () => (asked = true, onedrive) }), path.join(sandbox, "Documents"), "another HOME/USERPROFILE (a test, a sandbox): its own Documents");
    assert.equal(asked, false, "the user's registry not even read for another home");
    assert.equal(windows(onedrive, { realHome: null }), path.join(home, "Documents"), "the user's home unknown: <home>\\Documents");

    const linux = (text, more = {}) => documentsFolder({ home, env: {}, platform: "linux", readText: () => text, exists, ...more });
    const wen = path.join(home, "文档");
    there.add(wen);
    assert.equal(linux('XDG_DESKTOP_DIR="$HOME/桌面"\nXDG_DOCUMENTS_DIR="$HOME/文档"\n'), wen, "Linux: the XDG documents folder (~/文档 on a Chinese desktop)");
    assert.equal(linux('XDG_DOCUMENTS_DIR="$HOME/"\n'), path.join(home, "Documents"), "XDG's folder turned off ($HOME): <home>/Documents");
    assert.equal(linux('XDG_DOCUMENTS_DIR="$HOME/Gone"\n'), path.join(home, "Documents"), "a folder not there: <home>/Documents");
    assert.equal(linux("", { readText: () => { throw new Error("ENOENT"); } }), path.join(home, "Documents"), "no user-dirs.dirs: <home>/Documents");
    let read = null;
    linux("", { env: { XDG_CONFIG_HOME: path.join(root, "config") }, readText: (file) => { read = file; return ""; } });
    assert.equal(read, path.join(root, "config", "user-dirs.dirs"), "XDG_CONFIG_HOME where it is set");
    assert.equal(documentsFolder({ home, env: {}, platform: "darwin", readRegistry: () => onedrive, readText: () => 'XDG_DOCUMENTS_DIR="$HOME/文档"', exists }), path.join(home, "Documents"), "macOS: ~/Documents");
    // This system's own, read for real: an absolute folder, and for a home not the user's, that home's Documents.
    assert.ok(path.isAbsolute(documentsFolder()), "this system's Documents folder");
    assert.equal(documentsFolder({ home: sandbox, env: {} }), path.join(sandbox, "Documents"), "a home of the test's: its Documents");
  }

  // ---------- making one ----------
  {
    const made = path.join(root, "made");
    assert.deepEqual(await ensureWorkspace(made), { made: true, ours: true, reads: true });
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(made, "gallery.json"), "utf8")), WORKSPACE_MARK);
    assert.ok(await exists(path.join(made, ".gallery", "state")), ".gallery/ with its state folder");
    await fs.writeFile(path.join(made, "gallery.json"), `${JSON.stringify(WORKSPACE_MARK)}\n// the user's`);
    assert.deepEqual(await ensureWorkspace(made), { made: false, ours: false, reads: false }, "again: nothing made, a gallery.json there never written over");
    assert.equal(await fs.readFile(path.join(made, "gallery.json"), "utf8"), `${JSON.stringify(WORKSPACE_MARK)}\n// the user's`);
    const layout = layoutOf(made);
    assert.deepEqual([layout.preferences, layout.exports, layout.outline, layout.trash], [
      path.join(made, "preferences.md"), path.join(made, "exports"), path.join(made, ".gallery", "outline.json"), path.join(made, ".gallery", "trash"),
    ]);
  }

  // ---------- documents: names, slugs, the page ----------
  const ws = path.join(root, "ws");
  await ensureWorkspace(ws);
  await write(path.join(ws, "new-one", "doc.html"), page("new-one", "新"));
  await write(path.join(ws, "new-one", "doc.json"), metadata("新"));
  await write(path.join(ws, "old-one", "report.html"), page("old-one", "旧"));
  await write(path.join(ws, "old-one", "report.json"), metadata("旧"));
  await write(path.join(ws, "both", "doc.html"), page("both", "两个"));
  await write(path.join(ws, "both", "doc.json"), metadata("两个"));
  await write(path.join(ws, "both", "report.html"), page("both", "不读的"));
  await write(path.join(ws, "materials", "notes.txt"), "a user's own folder: no document");
  await write(path.join(ws, "exports", "doc.html"), "exports/ is never a document");
  await write(path.join(ws, ".hidden", "doc.html"), "a dot name is never a document");
  await write(path.join(ws, "instructions", "report.html"), page("instructions", "写作偏好"));
  await write(path.join(ws, "instructions", "report.json"), metadata("写作偏好", { instructions: true }));
  {
    assert.deepEqual(documentFiles(path.join(ws, "new-one")), { html: path.join(ws, "new-one", "doc.html"), json: path.join(ws, "new-one", "doc.json"), old: false, both: false });
    assert.deepEqual(documentFiles(path.join(ws, "old-one")), { html: path.join(ws, "old-one", "report.html"), json: path.join(ws, "old-one", "report.json"), old: true, both: false }, "an old document's names");
    assert.deepEqual(documentFiles(path.join(ws, "both")), { html: path.join(ws, "both", "doc.html"), json: path.join(ws, "both", "doc.json"), old: false, both: true }, "both there: doc.html wins");
    assert.equal(documentFiles(path.join(ws, "nothing-yet")).html, path.join(ws, "nothing-yet", "doc.html"), "a document to be made: the new names");
    assert.deepEqual(await listDocumentSlugs(ws), ["both", "new-one", "old-one"], "no exports/, no dot name, no folder without a document, no old 写作偏好 page");
    assert.equal(await pageSlug(ws), null, "no page in .gallery/pages/ yet");
    for (const name of ["exports", "generated", "con", "nul", "com1", "lpt9"]) assert.ok(RESERVED.has(name) && !isSlugName(name), `${name} is reserved`);
    assert.ok(isSlugName("weekly-eval") && !isSlugName("Weekly") && !isSlugName(".gallery"));
    assert.ok(slugTaken("old-one", ws) && slugTaken("exports", ws) && !slugTaken("free", ws));

    // components/: a name no new document takes, and nothing that vanishes. The folder is no document
    // when it holds none; a document called so stays one, whatever packages stand beside it.
    assert.equal(COMPONENTS_FOLDER, "components");
    assert.ok(keptName("components") && keptName("exports") && !keptName("free") && !RESERVED.has("components") && isSlugName("components"), "kept for new documents, reserved for none");
    assert.ok(slugTaken("components", ws), "taken with no such folder there");
    await assert.rejects(() => createReportFromStarter("components", "题", "说明", { directory: ws }), { code: "EEXIST" });
    assert.equal(await fs.access(path.join(ws, "components")).then(() => true, () => false), false, "and nothing made");
    await write(path.join(ws, "components", "local", "strip", "component.json"), "{}");
    await write(path.join(ws, "components", "local", "half-written", "kit.js"), "");
    await write(path.join(ws, "components", ".git", "x", "component.json"), "{}");
    await write(path.join(ws, "components", "stray.json"), "{}");
    assert.ok(!(await listDocumentSlugs(ws)).includes("components"), "with packages alone it is no document");
    assert.deepEqual(packageFolders(ws).map(({ id, folder }) => [id, path.relative(ws, folder)]), [["local/strip", path.join("components", "local", "strip")]], "a folder two down holding a manifest, and no other");
    await write(path.join(ws, "components", "doc.html"), page("components", "组件"));
    assert.ok((await listDocumentSlugs(ws)).includes("components"), "one made before the packages stays a document beside them");
    assert.deepEqual(packageFolders(ws).map(({ id }) => id), ["local/strip"], "and its packages stay packages");
    await fs.rm(path.join(ws, "components"), { recursive: true });
    assert.deepEqual(packageFolders(ws), [], "no folder, no packages");
    // pages/ (the custom pages, shared/pages.mjs): the same, a name kept and nothing hidden; a custom
    // page's slug is taken for a document, as a document's is for a page (tests/unit/pages.mjs).
    assert.equal(PAGES_FOLDER, "pages");
    assert.ok(keptName("pages") && !RESERVED.has("pages") && isSlugName("pages") && slugTaken("pages", ws), "pages kept for new documents, reserved for none");
    assert.equal(layoutOf(ws).customPages, path.join(ws, "pages"), "the custom pages at the root");
    assert.equal(layoutOf(ws).preferencesPage, path.join(ws, ".gallery", "pages"), "the 写作偏好 page's folder under its own name");
    await write(path.join(ws, "pages", "board", "page.html"), "<!doctype html><main class=\"gallery-page\"></main>");
    assert.ok(slugTaken("board", ws) && !(await listDocumentSlugs(ws)).includes("pages") && !(await listDocumentSlugs(ws)).includes("board"), "a page's slug taken; pages/ with pages alone is no document, nor a page one");
    await write(path.join(ws, "pages", "doc.html"), page("pages", "页"));
    assert.ok((await listDocumentSlugs(ws)).includes("pages"), "a document called pages, made before them, stays a document beside the pages");
    await fs.rm(path.join(ws, "pages"), { recursive: true });
    const loaded = await loadReports(["new-one", "old-one", "both"], { directory: ws });
    assert.deepEqual(loaded.reports.map((report) => [report.slug, path.basename(report.htmlPath), report.metadata.title]), [["new-one", "doc.html", "新"], ["old-one", "report.html", "旧"], ["both", "doc.html", "两个"]], "each read under its own names");
    // A new document: doc.html and doc.json; the 写作偏好 page in .gallery/pages/, its slug taken.
    const made = await createReportFromStarter("fresh", "新建", "说明", { directory: ws });
    assert.ok(await exists(path.join(made.directory, "doc.html")) && await exists(path.join(made.directory, "doc.json")) && !(await exists(path.join(made.directory, "report.html"))));
    const pageMade = await createReportFromStarter(PAGE_SLUG, "写作偏好", "说明", { directory: ws, page: true, blank: true });
    assert.equal(pageMade.directory, path.join(ws, ".gallery", "pages", PAGE_SLUG));
    assert.equal(await pageSlug(ws), PAGE_SLUG);
    assert.equal(documentDirectory(PAGE_SLUG, ws), pageMade.directory, "the page's folder by its slug");
    assert.equal(documentDirectory("fresh", ws), path.join(ws, "fresh"));
    // A scratch copy of gallery block try's, in .gallery/try/: its folder by its slug where no
    // folder at the root has that name, and listed nowhere; a document of that name at the root wins.
    const scratch = path.join(ws, ".gallery", "try", "try-0a1b2c3d");
    await fs.mkdir(scratch, { recursive: true });
    await fs.writeFile(path.join(scratch, "doc.html"), "<!doctype html><title>t</title>");
    assert.equal(documentDirectory("try-0a1b2c3d", ws), scratch, "a scratch copy's folder by its slug");
    assert.ok(!(await listDocumentSlugs(ws)).includes("try-0a1b2c3d"), "a scratch copy never listed");
    await fs.mkdir(path.join(ws, "try-0a1b2c3d"));
    assert.equal(documentDirectory("try-0a1b2c3d", ws), path.join(ws, "try-0a1b2c3d"), "a folder at the root of its name wins");
    await fs.rm(path.join(ws, "try-0a1b2c3d"), { recursive: true });
    await fs.rm(path.join(ws, ".gallery", "try"), { recursive: true });
    assert.ok(slugTaken(PAGE_SLUG, ws), "a page's slug is taken");
    await assert.rejects(createReportFromStarter(PAGE_SLUG, "又一个", "说明", { directory: ws }), { code: "EEXIST" }, "no document under a page's slug");
    await assert.rejects(createReportFromStarter("exports", "导出", "说明", { directory: ws }), { code: "EEXIST" }, "nor under exports");
    assert.ok(!(await listDocumentSlugs(ws)).includes(PAGE_SLUG), "the page never listed");
    const service = createWorkspaceService({ edits: createEditService({ reportsDirectory: ws }), reportsDirectory: ws, reports: {} });
    assert.ok(!Object.values((await service.outline()).children).flat().includes(PAGE_SLUG) && !((await service.outline()).children[""] ?? []).includes("instructions"), "nor in the outline");
    assert.equal(await service.freeSlug(PAGE_SLUG), `${PAGE_SLUG}-2`, "a new document never takes it");
  }

  // ---------- a new document's folder: doc-<its page id> ----------
  // newDocSlug names it (src/shared/workspace.mjs): the id's shape (page-links.mjs DOC_SLUG), an id no
  // name of the workspace has (a folder at the root, a custom page's, the 写作偏好 page's, a slug of the
  // trash; an old name's id is its hash's), its folder free. The random source is the test's.
  {
    const here = path.join(root, "ids");
    await write(path.join(here, "report", "doc.html"), page("report", "旧"));
    await write(path.join(here, "doc-tacti90g", "doc.html"), page("doc-tacti90g", "新"));
    await write(path.join(here, "pages", "board", "page.html"), "<!doctype html><main class=\"gallery-page\"></main>");
    await write(path.join(here, ".gallery", "pages", "doc-prefs000", "doc.html"), page("doc-prefs000", "写作偏好"));
    await write(path.join(here, ".gallery", "trash", "a1-binned", "entry.json"), JSON.stringify({ id: "a1-binned", kind: "document", slug: "binned", title: "回收区里的", at: 1, parent: "", index: 0 }));
    await write(path.join(here, ".hidden", "doc.html"), "a dot name has no address");
    const FIRST = "abcdefghijklmnopqrstuvwxyz";
    const REST = `${FIRST}0123456789`;
    // The numbers that make the source pick each id in turn, then the same for ever.
    const picking = (...ids) => {
      const numbers = ids.flatMap((id) => [...id].map((letter, at) => (at === 0 ? (FIRST.indexOf(letter) + 0.5) / 26 : (REST.indexOf(letter) + 0.5) / 36)));
      let at = 0;
      return () => numbers[Math.min(at++, numbers.length - 1)];
    };
    assert.deepEqual([...(await pageNames(here))].sort(), ["binned", "board", "doc-prefs000", "doc-tacti90g", "pages", "report"], "the names with an address: the root's folders, the custom pages', the 写作偏好 page's and the trash's");
    // Each pick that another name's id holds is passed over: an old name's hash (report, board, binned), a doc-<id> folder's own, the 写作偏好 page's.
    // And the id a doc-<id> folder went by before its own eight were its id (earlierId): addresses written then still open it, none of them is made another's.
    const held = [pageId("report"), pageId("board"), pageId("binned"), "tacti90g", "prefs000", pageId("pages"), earlierId("doc-tacti90g"), earlierId("doc-prefs000")];
    assert.equal(await newDocSlug(here, { random: picking(...held, "fresh001") }), "doc-fresh001", "the first pick no name's id holds");
    assert.equal(await newDocSlug(here, { random: picking("fresh002", "fresh003") }), "doc-fresh002", "the first pick when none holds it");
    assert.match(await newDocSlug(here), DOC_SLUG, "from Math.random: the shape");
    assert.ok(!(await pageNames(here)).has(await newDocSlug(here)), "and no name of the workspace");
    // A folder of that name made meanwhile (a pick the file system holds that no id said): the next pick.
    await fs.mkdir(path.join(here, "doc-fresh004"));
    assert.equal(await newDocSlug(here, { random: picking("fresh004", "fresh005") }), "doc-fresh005", "a folder there passes over");
    await fs.rmdir(path.join(here, "doc-fresh004"));
    // The doc-<id> name another name's id spoils: idHolder says whose id it is.
    assert.equal(await idHolder(`doc-${pageId("report")}`, here), "report", "the hash id of an old name");
    assert.equal(await idHolder(`doc-${pageId("binned")}`, here), "binned", "a document of the trash");
    assert.equal(await idHolder("doc-fresh001", here), null, "a free id");
    assert.equal(await idHolder("doc-tacti90g", here), null, "a folder's own id is no other name's");
    assert.ok(isDocSlug("doc-fresh001") && !isDocSlug("doc-2") && !isDocSlug("report"));
  }

  // ---------- a commit writes the document's own file ----------
  {
    const edits = createEditService({ reportsDirectory: ws });
    for (const [slug, name] of [["old-one", "report.html"], ["new-one", "doc.html"], [PAGE_SLUG, "doc.html"]]) {
      const read = await edits.read(slug);
      assert.equal(path.basename(read.file), name, `${slug}: read from ${name}`);
      const renamed = await edits.renameReport(slug, `改名 ${slug}`);
      assert.ok(renamed.ok, JSON.stringify(renamed));
      const folder = documentDirectory(slug, ws);
      assert.ok((await fs.readFile(path.join(folder, name), "utf8")).includes(`改名 ${slug}</h1>`), `${slug}: written into ${name}`);
      assert.equal(JSON.parse(await fs.readFile(path.join(folder, name.replace(".html", ".json")), "utf8")).title, `改名 ${slug}`, `${slug}: and its metadata`);
    }
    assert.ok(!(await exists(path.join(ws, "old-one", "doc.html"))) && !(await exists(path.join(ws, "new-one", "report.html"))), "never the other name");
    const handed = await edits.handIn("old-one");
    assert.ok(handed.ok, JSON.stringify(handed));
  }

  // ---------- exports are the user's: nothing in exports/ removed ----------
  {
    await write(path.join(ws, "exports", "gone-document.html"), "a deliverable of a document trashed since");
    await write(path.join(ws, "exports", "mine.html"), "a file the user saved there");
    const exported = spawnSync(process.execPath, [path.join(import.meta.dirname, "..", "..", "src", "cli", "bin.mjs"), "export", "new-one"], { encoding: "utf8", env: { ...process.env, GALLERY_WORKSPACE: ws } });
    assert.equal(exported.status, 0, exported.stdout + exported.stderr);
    assert.ok(await exists(path.join(ws, "exports", "new-one.html")), "exported into the workspace's exports/");
    assert.ok(await exists(path.join(ws, "exports", "gone-document.html")) && await exists(path.join(ws, "exports", "mine.html")), "every other file of exports/ left");
    assert.ok(await exists(path.join(ws, ".gallery", "built", "new-one.html")), "the built preview in .gallery/built/");
  }

  // ---------- what the commands walk ----------
  // A workspace's packages are no document of the commands that take them all, whatever they hold.
  {
    const gallery = (...args) => spawnSync(process.execPath, [path.join(import.meta.dirname, "..", "..", "src", "cli", "bin.mjs"), ...args], { encoding: "utf8", env: { ...process.env, GALLERY_WORKSPACE: ws, GALLERY_NO_BROWSER: "1" } });
    gallery("list"); // its first run makes the default 写作偏好, and says so
    const before = gallery("list").stdout;
    await write(path.join(ws, "components", "local", "strip", "component.json"), "{ id: ");
    await write(path.join(ws, "components", "local", "strip", "example.html"), page("strip", "示例"));
    await write(path.join(ws, "components", "local", "strip", "doc.html"), page("strip", "不是文档"));
    assert.equal(gallery("list").stdout, before, "gallery list");
    const checked = gallery("check", "--all");
    assert.ok(!/components|strip/.test(checked.stdout + checked.stderr), `gallery check --all: ${checked.stdout}${checked.stderr}`);
    const exported = gallery("export", "--all");
    assert.ok(!/components|strip/.test(exported.stdout + exported.stderr), `gallery export --all: ${exported.stdout}${exported.stderr}`);
    assert.ok(!(await exists(path.join(ws, "exports", "components.html"))) && !(await exists(path.join(ws, "exports", "strip.html"))));
    await fs.rm(path.join(ws, "components"), { recursive: true });
  }

  // ---------- what the preview's watcher hears ----------
  {
    const ignored = ignoredIn(ws);
    const at = (...parts) => path.join(ws, ...parts);
    assert.ok(ignored(at(".gallery", "state", "history", "a", "x.html")) && ignored(at(".gallery", "outline.json")) && ignored(at("exports", "a.html")), "Gallery's own and the exports left alone");
    assert.ok(!ignored(at(".gallery")) && !ignored(at(".gallery", "pages", PAGE_SLUG, "doc.html")) && !ignored(at("new-one", "doc.html")), "the pages and the documents heard");
    assert.deepEqual(changeOf(ws, at("new-one", "doc.html")), { slug: "new-one", name: "doc.html" });
    assert.deepEqual(changeOf(ws, at("old-one", "report.json")), { slug: "old-one", name: "report.json" });
    assert.deepEqual(changeOf(ws, at("new-one", "assets", "a.png")), { slug: "new-one", name: null }, "a file of its folder");
    assert.deepEqual(changeOf(ws, at(".gallery", "pages", PAGE_SLUG, "doc.html")), { slug: PAGE_SLUG, name: "doc.html" }, "the 写作偏好 page's commits heard");
    assert.deepEqual(changeOf(ws, at(".gallery", "pages", PAGE_SLUG, "annotations.json")), { slug: PAGE_SLUG, name: "annotations.json" });
    assert.ok(!ignored(at("components", "local", "strip", "kit.js")), "the packages heard");
    assert.deepEqual(changeOf(ws, at("components", "local", "strip", "component.json")), { slug: "components", name: null, packages: true }, "a package's file: the catalog is looked at");
    assert.deepEqual(changeOf(ws, at("components")), { slug: "components", name: null, packages: true }, "the folder itself");
    assert.deepEqual(changeOf(ws, at("components", "doc.html")), { slug: "components", name: "doc.html", packages: true }, "a document called components stays one");
    assert.ok(!ignored(at("pages", "home", "page.html")), "the custom pages heard");
    assert.deepEqual(changeOf(ws, at("pages", "home", "page.json")), { page: "home", name: "page.json" }, "a custom page's file: its page");
    assert.deepEqual(changeOf(ws, at("pages", "doc.html")), { slug: "pages", name: "doc.html" }, "a document called pages stays one");
    assert.equal(changeOf(ws, at("components", "local", "strip", ".kit.js.123.tmp")), null, "a write's temp file is no change");
    assert.deepEqual(changeOf(ws, at("gallery.json")), { slug: null, name: "gallery.json", packages: true }, "what it says of the components: the catalog is looked at, and no document's");
    assert.equal(changeOf(ws, at(".gallery.json.123.tmp")), null, "and a write of it is no change");
    assert.deepEqual(changeOf(ws, at(".gallery", "pages", "components", "doc.html")), { slug: "components", name: "doc.html" }, "a page of that name is no folder of packages");
    for (const file of [at(".gallery", "state", "token"), at(".gallery", ".outline.json.123.456.tmp"), at("new-one", ".doc.html.123.456.tmp"), at("exports", "x.html"), path.join(root, "elsewhere", "doc.html"), at("Weird Name", "doc.html")]) {
      assert.equal(changeOf(ws, file), null, file);
    }
  }

  // ---------- gallery init --from: an old reports/ folder copied, never changed ----------
  {
    const old = path.join(root, "old-skill", "reports");
    await write(path.join(old, "alpha", "report.html"), page("alpha", "甲"));
    await write(path.join(old, "alpha", "report.json"), metadata("甲"));
    await write(path.join(old, "alpha", "assets", "a.png"), "png");
    await write(path.join(old, "beta", "report.html"), page("beta", "乙"));
    await write(path.join(old, "beta", "report.json"), metadata("乙"));
    await write(path.join(old, "taken", "report.html"), page("taken", "冲突"));
    await write(path.join(old, "taken", "report.json"), metadata("冲突"));
    await write(path.join(old, "instructions", "report.html"), page("instructions", "写作偏好"));
    await write(path.join(old, "instructions", "report.json"), metadata("写作偏好", { instructions: true }));
    await write(path.join(old, "preferences.md"), "# 写作偏好\n\n旧的。\n");
    await write(path.join(old, ".workspace.json"), JSON.stringify({ version: 1, children: { "": ["beta", "taken"], beta: ["alpha"] } }));
    await write(path.join(old, ".emoji-library", "library.json"), JSON.stringify([{ id: "e1", name: "logo", file: "emoji-1.png" }]));
    await write(path.join(old, ".emoji-library", "emoji-1.png"), "png");
    await write(path.join(old, ".trash", "x-1", "entry.json"), "{}");
    await write(path.join(old, "..", "exports", "alpha.html"), "an old export");
    await write(path.join(old, "..", "node_modules", ".cache", "report-edit", "history", "alpha", "20261001T000000Z-0123456789abcdef.html"), "a version");
    const before = await digestOf(path.dirname(old));

    const to = path.join(root, "to");
    await ensureWorkspace(to);
    await write(path.join(to, "taken", "doc.html"), page("taken", "已有"));
    await write(path.join(to, "taken", "doc.json"), metadata("已有"));
    const result = await copyOldDocuments({ from: old, to });
    assert.ok(result.copied.length > 0 && !(await exists(path.join(to, "components"))), "no packages there: no folder made");
    assert.deepEqual(result, { copied: ["alpha", "beta"], skipped: ["taken"], kept: [], preferences: "copied", outline: "copied", page: "copied", emoji: 1, history: 1, packages: [] });
    assert.equal(await fs.readFile(path.join(to, "alpha", "report.html"), "utf8"), page("alpha", "甲"), "copied under its old names");
    assert.ok(await exists(path.join(to, "alpha", "assets", "a.png")));
    assert.equal(await fs.readFile(path.join(to, "taken", "doc.html"), "utf8"), page("taken", "已有"), "a slug taken: the workspace's kept");
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(to, ".gallery", "outline.json"), "utf8")).children, { "": ["beta"], beta: ["alpha"] }, "the old order, of the documents copied");
    assert.equal(await fs.readFile(path.join(to, "preferences.md"), "utf8"), "# 写作偏好\n\n旧的。\n");
    assert.equal(await pageSlug(to), "instructions", "the 写作偏好 page into .gallery/pages/, its slug kept");
    assert.ok(!(await exists(path.join(to, "instructions"))));
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(to, ".gallery", "emoji-library", "library.json"), "utf8")).map((entry) => entry.id), ["e1"]);
    assert.ok(await exists(path.join(to, ".gallery", "state", "history", "alpha", "20261001T000000Z-0123456789abcdef.html")), "its recent versions");
    assert.ok(!(await exists(path.join(to, ".gallery", "trash", "x-1"))) && !(await exists(path.join(to, "exports"))), "never the trash nor the exports");
    // Again, into a workspace that has its own of everything: nothing over what is there.
    await write(path.join(old, "gamma", "report.html"), page("gamma", "丙"));
    await write(path.join(old, "gamma", "report.json"), metadata("丙"));
    const beforeAgain = await digestOf(path.dirname(old));
    const again = await copyOldDocuments({ from: old, to });
    assert.deepEqual(again, { copied: ["gamma"], skipped: ["alpha", "beta", "taken"], kept: [], preferences: "kept", outline: "appended", page: "kept", emoji: 0, history: 0, packages: [] });
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(to, ".gallery", "outline.json"), "utf8")).children[""], ["beta", "gamma"], "the copied ones added at the top");
    assert.equal(await digestOf(path.dirname(old)), beforeAgain, "the old folder only read");
    assert.notEqual(before, beforeAgain); // (gamma written by the test in between)
    // Another workspace's packages come along, each one this workspace does not hold; a document
    // called components does not: no new one takes the name.
    await write(path.join(old, "components", "local", "strip", "component.json"), "theirs");
    await write(path.join(old, "components", "local", "strip", "kit.js"), "theirs");
    await write(path.join(old, "components", "local", "mine", "component.json"), "theirs");
    await write(path.join(old, "components", "doc.html"), page("components", "组件"));
    await write(path.join(to, "components", "local", "mine", "component.json"), "ours");
    const packages = await copyOldDocuments({ from: old, to });
    assert.deepEqual(packages.packages, ["local/strip"]);
    assert.ok(packages.kept.includes("components") && !packages.skipped.includes("components") && !(await exists(path.join(to, "components", "doc.html"))), "no document of that name, and said so apart from a slug taken");
    assert.ok(copiedLines(packages, old, to).includes("Left behind (a name a workspace keeps for itself, for its custom blocks here, which no new document takes): components"), "its own line");
    assert.equal(await fs.readFile(path.join(to, "components", "local", "strip", "kit.js"), "utf8"), "theirs", "a package whole");
    assert.equal(await fs.readFile(path.join(to, "components", "local", "mine", "component.json"), "utf8"), "ours", "never over one that is there");
  }

  // ---------- a workspace's own old layout adopted once ----------
  {
    const dev = path.join(root, "dev", "reports");
    const devState = path.join(root, "dev", "node_modules", ".cache", "report-edit");
    await write(path.join(dev, "gallery.json"), JSON.stringify(WORKSPACE_MARK));
    await write(path.join(dev, "one", "report.html"), page("one", "一"));
    await write(path.join(dev, "one", "report.json"), metadata("一"));
    await write(path.join(dev, ".workspace.json"), JSON.stringify({ version: 1, children: { "": ["one"] } }));
    await write(path.join(dev, ".trash", "abc-1", "entry.json"), JSON.stringify({ id: "abc-1" }));
    await write(path.join(dev, ".emoji-library", "library.json"), "[]");
    await write(path.join(dev, "instructions", "report.html"), page("instructions", "写作偏好"));
    await write(path.join(dev, "instructions", "report.json"), metadata("写作偏好", { instructions: true }));
    await write(path.join(devState, "token"), "f".repeat(32));
    await write(path.join(devState, "snapshots", "0123456789abcdef.html"), "a snapshot");
    await write(path.join(devState, "history", "one", "20261001T000000Z-0123456789abcdef.html"), "a version");
    await write(path.join(devState, "history", "elsewhere", "20261001T000000Z-0123456789abcdef.html"), "another checkout's");
    const key = createHash("sha256").update(process.platform === "win32" ? path.resolve(dev).toLowerCase() : path.resolve(dev)).digest("hex").slice(0, 16);
    await write(path.join(devState, "rewrites", key, "one", "20261001T000000Z-00000000.json"), "{}");
    await write(path.join(devState, "rewrites", "0".repeat(16), "one", "20261001T000000Z-11111111.json"), "{}");
    const oldTree = await digestOf(path.join(root, "dev"));
    const first = await adoptOldLayout(dev, { devState });
    assert.equal(first.adopted, true);
    const state = path.join(dev, ".gallery", "state");
    assert.ok(await exists(path.join(dev, ".gallery", "outline.json")) && await exists(path.join(dev, ".gallery", "trash", "abc-1", "entry.json")) && await exists(path.join(dev, ".gallery", "emoji-library", "library.json")));
    assert.equal(await pageSlug(dev), "instructions", "the old page copied into .gallery/pages/");
    assert.deepEqual(await listDocumentSlugs(dev), ["one"], "and never listed at the root");
    assert.equal(await fs.readFile(path.join(state, "token"), "utf8"), "f".repeat(32), "the token: open pages keep saving");
    assert.ok(await exists(path.join(state, "snapshots", "0123456789abcdef.html")) && await exists(path.join(state, "history", "one", "20261001T000000Z-0123456789abcdef.html")));
    assert.ok(!(await exists(path.join(state, "history", "elsewhere"))), "only this workspace's documents' versions");
    assert.deepEqual(await fs.readdir(path.join(state, "rewrites", "one")), ["20261001T000000Z-00000000.json"], "only this workspace's key, the key level dropped");
    // The old copies are left; a second call does nothing.
    await fs.rm(path.join(dev, ".gallery", "outline.json"));
    assert.deepEqual(await adoptOldLayout(dev, { devState }), { adopted: false, copied: [] });
    assert.ok(!(await exists(path.join(dev, ".gallery", "outline.json"))), "never again: migrated.json says it was done");
    await fs.rm(path.join(dev, ".gallery"), { recursive: true });
    assert.equal(await digestOf(path.join(root, "dev")), oldTree, "the old layout as it was, its old copies left");
  }

  // ---------- the default home page, made once ----------
  {
    const on = {}; // an environment without GALLERY_NO_DEFAULT_HOME
    assert.ok(homeOff() && process.env[NO_DEFAULT_HOME] === "1", "every unit test runs with it set (workspace-env.mjs)");
    assert.ok(!homeOff({ [NO_DEFAULT_HOME]: "" }) && !homeOff({ [NO_DEFAULT_HOME]: "0" }) && !homeOff({ [NO_DEFAULT_HOME]: "false" }) && homeOff({ [NO_DEFAULT_HOME]: "yes" }), "set but to \"\", \"0\" or \"false\"");
    const fresh = path.join(root, "home-new");
    await ensureWorkspace(fresh);
    assert.ok(!(await exists(path.join(fresh, "pages"))), "ensureWorkspace, which every command runs, makes none");
    assert.deepEqual(await makeDefaultHome(fresh), { did: "off" }, "GALLERY_NO_DEFAULT_HOME: none");
    assert.ok(!(await exists(path.join(fresh, "pages"))));
    // A new workspace: pages/home, 首页, a card of today and one of note, Gallery's own put in as gallery block add puts them.
    const made = await makeDefaultHome(fresh, { env: on });
    const homeHtml = await fs.readFile(pageFiles("home", fresh).html, "utf8");
    const cards = readPage(homeHtml).cards.map(({ id, block, x, y, w, h }) => ({ id, block, x, y, w, h }));
    assert.equal(made.did, "made", JSON.stringify(made));
    assert.deepEqual(cards, [
      ...[["c1", "gallery/today", 0, 0, 4, 2], ["c2", "gallery/weather", 4, 0, 4, 2], ["c3", "gallery/countdown", 8, 0, 2, 2], ["c4", "gallery/habit", 10, 0, 2, 2], ["c5", "gallery/stats", 0, 2, 8, 2], ["c6", "gallery/todos", 8, 2, 4, 6], ["c7", "gallery/heatmap", 0, 4, 8, 4], ["c8", "gallery/recent", 0, 8, 4, 4], ["c9", "gallery/note", 4, 8, 4, 4], ["c10", "gallery/static", 8, 8, 4, 4]].map(([id, block, x, y, w, h]) => ({ id, block, x, y, w, h })),
    ], "each default block's card at the first free spot by its size on the home (HOME_SIZES, else its block's default): the home as designed 2026-11-09, twelve by twelve cells, none left empty");
    assert.deepEqual([...made.cards], ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "c10"]);
    assert.ok(/<title>首页<\/title>/.test(homeHtml) && /<main class="gallery-page" data-page-id="home">/.test(homeHtml) && !/<script(?![^>]*application\/json)/.test(homeHtml), "a page as gallery page new writes it: 首页, no script of its own");
    assert.deepEqual(JSON.parse(await fs.readFile(pageFiles("home", fresh).json, "utf8")), { title: "首页", icon: HOME_ICON, defaultCards: true, hint: true }, "a page as any: what it has of its own is its page.json's (its default cards, its note, its house)");
    for (const id of HOME_CARDS) assert.ok(await exists(path.join(fresh, "components", ...id.split("/"), "component.json")), `${id} put into components/`);
    assert.deepEqual(Object.keys(JSON.parse(await fs.readFile(layoutOf(fresh).blocks, "utf8"))).sort(), [...HOME_CARDS].sort(), "their versions and fingerprints kept, as gallery block add keeps them");
    assert.deepEqual(JSON.parse(await fs.readFile(layoutOf(fresh).marker, "utf8")), { ...WORKSPACE_MARK, pages: { homeMade: true } }, "gallery.json says it was made, nothing else changed");
    // Once: a second start makes nothing, and neither does one after the home page was taken away.
    assert.deepEqual(await makeDefaultHome(fresh, { env: on }), { did: "done" });
    assert.equal(await fs.readFile(pageFiles("home", fresh).html, "utf8"), homeHtml, "the second start: the page as it was");
    await fs.rm(path.join(fresh, "pages", "home"), { recursive: true });
    assert.deepEqual(await makeDefaultHome(fresh, { env: on }), { did: "done" }, "homeMade and no pages/home: nothing made");
    assert.ok(!(await exists(pageFiles("home", fresh).html)), "a home taken away stays away");
    // A home page made while it was special by its slug (its page.json saying neither defaultCards nor hint): given them
    // once, as a start finds it, the house too where it has no icon; a page called home made after that is a page as it is.
    const adopt = path.join(root, "home-adopt");
    await ensureWorkspace(adopt);
    await fs.writeFile(layoutOf(adopt).marker, `${JSON.stringify({ ...WORKSPACE_MARK, pages: { homeMade: true } }, null, 2)}\n`);
    await createPage("home", "首页", { root: adopt });
    const adoptHtml = await fs.readFile(pageFiles("home", adopt).html, "utf8");
    assert.deepEqual(await makeDefaultHome(adopt, { env: on }), { did: "done" });
    assert.deepEqual(JSON.parse(await fs.readFile(pageFiles("home", adopt).json, "utf8")), { title: "首页", icon: HOME_ICON, defaultCards: true, hint: true }, "the old home's page.json says what it had");
    assert.equal(await fs.readFile(pageFiles("home", adopt).html, "utf8"), adoptHtml, "its page.html as it was");
    await fs.rm(pageFiles("home", adopt).folder, { recursive: true });
    await createPage("home", "Agent 的页", { root: adopt });
    await makeDefaultHome(adopt, { env: on });
    assert.deepEqual(JSON.parse(await fs.readFile(pageFiles("home", adopt).json, "utf8")), { title: "Agent 的页" }, "once: a page called home made since is left as it is");
    // The house in lines (the user's word of 2026-11-09: no filled icon in the sidebar head), drawn by the icon route as
    // the mask the sidebar paints in its icon gray and as a tab's in its gray; a home made with MingCute's filled house
    // (a development build's) given it once, every other field as it was; an icon chosen since then kept.
    assert.equal(HOME_ICON, "/icons/lucide/house.svg");
    const lines = String(iconImage({ value: HOME_ICON })?.body ?? "");
    assert.ok(/stroke="#000"/.test(lines) && /fill="none"/.test(lines) && /stroke-width="1\.75"/.test(lines) && !/fill="#/.test(lines), `the icon route draws it in lines, black for the mask: ${lines}`);
    assert.ok(/viewBox="1 1 22 22"/.test(String(iconImage({ value: HOME_ICON, tab: true })?.body ?? "")), "and a tab's, cropped as a page with no icon's");
    assert.equal(iconKind(HOME_ICON), null, "no icon a document may have");
    const filled = path.join(root, "home-filled");
    await ensureWorkspace(filled);
    await fs.writeFile(layoutOf(filled).marker, `${JSON.stringify({ ...WORKSPACE_MARK, pages: { homeMade: true } }, null, 2)}\n`);
    await createPage("home", "首页", { root: filled, icon: "/icons/home-1_lightgray.svg", defaultCards: true, hint: true });
    await fs.writeFile(layoutOf(filled).hints, `${JSON.stringify({ homeAdopted: true })}\n`);
    assert.deepEqual(await makeDefaultHome(filled, { env: on }), { did: "done" });
    assert.deepEqual(JSON.parse(await fs.readFile(pageFiles("home", filled).json, "utf8")), { title: "首页", icon: HOME_ICON, defaultCards: true, hint: true }, "the filled house given the house in lines");
    await fs.writeFile(pageFiles("home", filled).json, `${JSON.stringify({ title: "首页", icon: "/icons/home-1_lightgray.svg", defaultCards: true, hint: true }, null, 2)}\n`);
    await makeDefaultHome(filled, { env: on });
    assert.equal(JSON.parse(await fs.readFile(pageFiles("home", filled).json, "utf8")).icon, "/icons/home-1_lightgray.svg", "once: the filled house chosen again is kept");
    // An existing workspace, a document in it, no homeMade yet: made (the first start of a Gallery that makes it).
    const old = path.join(root, "home-old");
    await write(path.join(old, "gallery.json"), `${JSON.stringify({ ...WORKSPACE_MARK, components: { hidden: [], disabled: [] } }, null, 2)}\n`);
    await write(path.join(old, "notes", "doc.html"), page("notes", "笔记"));
    await write(path.join(old, "notes", "doc.json"), metadata("笔记"));
    assert.equal((await makeDefaultHome(old, { env: on })).did, "made");
    assert.deepEqual(pagesSettings(old), { order: [], homeMade: true });
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(old, "gallery.json"), "utf8")).components, { hidden: [], disabled: [] }, "what else gallery.json says kept");
    assert.deepEqual(await listDocumentSlugs(old), ["notes"], "its documents as they were");
    // A pages/home there already (an Agent's): kept byte for byte, only marked; no block put in.
    const agents = path.join(root, "home-agent");
    await ensureWorkspace(agents);
    await createPage("home", "我的首页", { root: agents });
    const theirs = await fs.readFile(pageFiles("home", agents).html, "utf8");
    assert.deepEqual(await makeDefaultHome(agents, { env: on }), { did: "kept" });
    assert.ok((await fs.readFile(pageFiles("home", agents).html, "utf8")) === theirs && !(await exists(path.join(agents, "components"))) && pagesSettings(agents).homeMade, "kept as it is, marked");
    // None where gallery.json does not read as Gallery's (nothing could say it was made), nor where a document is called home.
    const broken = path.join(root, "home-broken");
    await write(path.join(broken, "gallery.json"), "{ half");
    assert.deepEqual(await makeDefaultHome(broken, { env: on }), { did: "unread" });
    assert.ok(!(await exists(path.join(broken, "pages"))) && (await fs.readFile(path.join(broken, "gallery.json"), "utf8")) === "{ half", "nothing made, gallery.json as it was");
    const named = path.join(root, "home-named");
    await ensureWorkspace(named);
    await write(path.join(named, "home", "doc.html"), page("home", "家"));
    await write(path.join(named, "home", "doc.json"), metadata("家"));
    const taken = await makeDefaultHome(named, { env: on });
    assert.ok(taken.did === "taken" && /document's slug/.test(taken.why) && !pagesSettings(named).homeMade && !(await exists(path.join(named, "pages"))), "a document called home: none, and not marked (a start tries again)");
    // Nothing of it stops a start: what it cannot make or write is an answer (failed, the step and why: homeFailure's line, which
    // a start and gallery init say), never a throw, and nothing marked, so that a later start tries again.
    const blocked = path.join(root, "home-blocked");
    await ensureWorkspace(blocked);
    await write(path.join(blocked, "pages"), "a file where the pages' folder goes");
    const failed = await makeDefaultHome(blocked, { env: on });
    assert.ok(failed.did === "failed" && failed.stage === "page" && failed.file === null && failed.why && !pagesSettings(blocked).homeMade, JSON.stringify(failed));
    assert.match(homeFailure(failed), /^The default home page was not made \(.+\); a later start tries again\.$/);
    if (process.platform === "win32") {
      // A gallery.json Windows keeps read-only (a tool's checkout): the page made, its mark refused (EPERM), each start the same, none thrown.
      const locked = path.join(root, "home-locked");
      await ensureWorkspace(locked);
      await fs.chmod(layoutOf(locked).marker, 0o444);
      try {
        const first = await makeDefaultHome(locked, { env: on });
        assert.ok(first.did === "failed" && first.stage === "mark" && first.file === pageFiles("home", locked).html && /EPERM|EACCES/.test(first.why) && readPage(await fs.readFile(first.file, "utf8")).cards.length === HOME_CARDS.length, JSON.stringify(first));
        assert.match(homeFailure(first), /is there, but gallery\.json could not say it was made/);
        const again = await makeDefaultHome(locked, { env: on });
        assert.ok(again.did === "failed" && again.stage === "mark", JSON.stringify(again));
        assert.equal(JSON.parse(await fs.readFile(layoutOf(locked).marker, "utf8")).pages, undefined, "gallery.json as it was");
      } finally {
        await fs.chmod(layoutOf(locked).marker, 0o644);
      }
    }
    // The dev server's start (adoptWorkspace) makes it, as the release's does (tests/unit/fixtures/production-server.mjs).
    const dev = path.join(root, "home-dev");
    delete process.env[NO_DEFAULT_HOME];
    try {
      const adopted = await adoptWorkspace(dev);
      assert.equal(adopted.home.did, "made", JSON.stringify(adopted));
      assert.ok(await exists(pageFiles("home", dev).html) && pagesSettings(dev).homeMade);
      assert.equal((await adoptWorkspace(dev)).home.did, "done", "and a second start makes none");
      const warned = [];
      const warn = console.warn;
      console.warn = (line) => warned.push(line);
      try {
        assert.equal((await adoptWorkspace(blocked)).home.did, "failed", "a home that cannot be made: the start goes on");
      } finally {
        console.warn = warn;
      }
      assert.deepEqual(warned, [`[gallery] ${homeFailure(failed)}`], "and says so");
    } finally {
      process.env[NO_DEFAULT_HOME] = "1";
    }
  }
} finally {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
}

console.log("Checked the workspace and its layout: where it is found (--workspace, GALLERY_WORKSPACE, the nearest gallery.json of ours, ~/Documents/Gallery; the tests never the user's), the Documents folder it is made in (Windows' as Explorer shows it, OneDrive's and a Chinese name whole, a variable unset or a folder not there passed over, never read for another home; Linux's XDG folder, turned off or not there passed over; macOS ~/Documents), made once (gallery.json never written over), documents (doc.html/doc.json, an old one's report.html/report.json read and written under its names, both there: doc.html; no exports/, dot name, reserved name, folder without a document or old 写作偏好 page), the 写作偏好 page in .gallery/pages/ (its slug taken, never listed), a new document's folder (doc-<its page id>, an id no folder, page or trash entry of the workspace has, a pick that is held passed over, whose id another name spoils said by idHolder), commits into each document's own file, exports never removed, what the watcher hears (the page's files too), gallery init --from's copy (each part, slugs taken skipped, the old folder only read), a workspace's old layout adopted once (its old copies left), and the default home page made once (today and note at the first free spots, their blocks put in, gallery.json's pages.homeMade; none again, nor after it was taken away; an Agent's pages/home kept and marked; none for a gallery.json that does not read or a document called home, nothing thrown where it cannot be made or marked (said, a start going on), none from ensureWorkspace or with GALLERY_NO_DEFAULT_HOME; the dev server's start makes it).");
