import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRoutes } from "../../src/server/routes.mjs";
import { createFileList, stampOf } from "../../src/server/stamps.mjs";

// The preview server's routes that hand out a file (src/server/routes.mjs, the dev server's and the
// release's): what each answers when there is none (404, nothing else), the headers of one that is
// there (caching, nosniff, the type), and what its slug may be (a report's slug, as everywhere else);
// a request naming another host is refused before any of them (403). The routes are called as either
// server calls them, with a request and a response of their own. Then the stamps the editor's modules and the
// kit's files are named by (src/server/stamps.mjs), and a report's page as the server keeps it
// (src/server/page-cache.mjs: tests/unit/fixtures/preview-pages.mjs, in a studio of its own), and a
// custom page as the server shows it (tests/unit/fixtures/custom-pages.mjs, in a studio of its own).

// The edit service keeps its token in a directory of its own, not the dev server's.
const routes = createRoutes({ stateDirectory: mkdtempSync(path.join(tmpdir(), "routes-state-")), logger: { info() {}, warn() {}, error() {} } });
const PORT = 4999; // the port the requests came in on

// What the routes did: they answered (status, headers, body) or passed the request on.
function ask(url, method = "GET", host = `127.0.0.1:${PORT}`) {
  return new Promise((resolve, reject) => {
    const headers = new Map();
    const response = {
      statusCode: 200,
      setHeader: (name, value) => headers.set(name.toLowerCase(), value),
      end(body) {
        resolve({ status: this.statusCode, headers, body, passed: false });
      },
    };
    routes.handle({ url, method, headers: { host }, socket: { localPort: PORT } }, response, (error) => (error ? reject(error) : resolve({ status: null, headers, body: null, passed: true })));
  });
}

// Another host (a page elsewhere whose name resolves to this machine), or none: 403 before anything is read.
for (const host of ["evil.example:4999", "127.0.0.1:5000", "localhost", ""]) {
  for (const url of ["/generated/demo.html", "/__gallery/edit/asset/demo/assets/a.png", "/", "/__gallery/events?slug=demo"]) {
    const answer = await ask(url, "GET", host);
    assert.equal(answer.status, 403, `${host} ${url}`);
  }
}
assert.equal((await ask("/generated/a--b.html", "GET", `localhost:${PORT}`)).passed, true, "localhost:<port> is this server too");
// The workbench asked for by localhost (a GET or HEAD of / or /index.html) is sent to 127.0.0.1 with its path
// and query (toLoopback): the origin Gallery's servers vouch for to show their drafts, never localhost's.
for (const [url, method, to] of [["/", "GET", "/"], ["/index.html?x=1", "GET", "/index.html?x=1"], ["/?a=b", "HEAD", "/?a=b"]]) {
  const answer = await ask(url, method, `localhost:${PORT}`);
  assert.deepEqual([answer.status, answer.headers.get("location"), answer.headers.get("cache-control")], [302, `http://127.0.0.1:${PORT}${to}`, "no-store"], `${method} ${url} at localhost: sent to 127.0.0.1`);
}
assert.equal((await ask("/", "GET")).passed, true, "the workbench at 127.0.0.1: served");
assert.equal((await ask("/", "POST", `localhost:${PORT}`)).passed, true, "no GET: not sent");

// Nothing there: 404 with no type, no caching header and no body.
for (const url of [
  "/__gallery/edit/icon?value=assets/none.png&slug=no-such-report",
  "/__gallery/edit/asset/no-such-report/assets/none.png",
  "/__gallery/edit/emoji-library/none.png",
  "/__gallery/edit/file/no-such-report/assets/none.pdf",
  "/__gallery/edit/embed/no-such-report/assets/none.pdf",
  "/__gallery/edit/src/shared/none.mjs",
  "/__gallery/edit/src/shared/emoji/data/none.json",
]) {
  const answer = await ask(url);
  assert.equal(answer.status, 404, url);
  assert.equal(answer.headers.size, 0, `${url}: nothing else is said`);
  assert.equal(answer.body, undefined, url);
}

// A slug is a report's slug: the file routes answer 404 to one that is not (consecutive hyphens),
// reading nothing (media-route.mjs), and the report route leaves it to whoever answers next.
for (const url of ["/__gallery/edit/asset/a--b/assets/x.png", "/__gallery/edit/file/a--b/assets/x.pdf", "/__gallery/edit/embed/a--b/assets/x.pdf"]) {
  const answer = await ask(url);
  assert.equal(answer.status, 404, url);
  assert.equal(answer.headers.size, 0, `${url}: nothing else is said`);
}
assert.equal((await ask("/generated/a--b.html")).passed, true, "the report route leaves a slug that is not one");

// A page icon as one image: never changing, so the browser keeps it.
const icon = await ask(`/__gallery/edit/icon?value=${encodeURIComponent("😀")}`);
assert.equal(icon.status, 200);
assert.equal(icon.headers.get("content-type"), "image/svg+xml");
assert.equal(icon.headers.get("cache-control"), "max-age=31536000, immutable");

// A module of the editor, KaTeX's mhchem and the emoji data: their type and caching.
const module = await ask("/__gallery/edit/src/shared/components/index.mjs");
assert.equal(module.status, 200);
assert.equal(module.headers.get("content-type"), "text/javascript; charset=utf-8");
assert.equal(module.headers.get("cache-control"), "no-store");
assert.ok(module.body.includes("COMPONENTS"));
// Under a stamp (what a page imports): the same module, kept for good.
const stamped = await ask("/__gallery/edit/v/0123456789abcdef/src/shared/components/index.mjs");
assert.equal(stamped.status, 200);
assert.equal(stamped.headers.get("content-type"), "text/javascript; charset=utf-8");
assert.equal(stamped.headers.get("cache-control"), "max-age=31536000, immutable");
assert.equal(stamped.body, module.body);
assert.equal((await ask("/__gallery/edit/v/0123456789abcdef/src/editor/components/files.mjs")).passed, true, "under a stamp, still no server writer");
assert.equal((await ask("/__gallery/edit/v/nothex/src/shared/components/index.mjs")).passed, true, "a stamp is 16 hex digits");
const mhchem = await ask("/__gallery/edit/mhchem.js");
assert.equal(mhchem.status, 200);
assert.equal(mhchem.headers.get("content-type"), "text/javascript; charset=utf-8");
const emoji = await ask("/__gallery/edit/src/shared/emoji/data/categories.json");
if (emoji.status === 200) {
  assert.equal(emoji.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(emoji.headers.get("cache-control"), "max-age=86400");
}
assert.equal((await ask("/__gallery/edit/v/0123456789abcdef/src/shared/emoji/data/categories.json")).status, emoji.status, "the emoji data under a stamp too (fetched beside the module that asks)");
// The server's own writers are never served to the page.
assert.equal((await ask("/__gallery/edit/src/editor/components/files.mjs")).passed, true, "components/files.mjs is not a browser module");
assert.equal((await ask("/__gallery/edit/src/editor/components/code/file.mjs")).passed, true, "nor a component's file.mjs");

// A stamp: the same while nothing changes, another once a file is written (its time and size) or
// taken out; a file added counts once the list is told (the watcher tells it).
{
  const folder = mkdtempSync(path.join(tmpdir(), "stamps-"));
  const file = (name) => path.join(folder, name);
  writeFileSync(file("a.mjs"), "export const a = 1;");
  writeFileSync(file("b.txt"), "not a module");
  const list = createFileList([folder], (name) => name.endsWith(".mjs"));
  assert.deepEqual(await list.files(), [file("a.mjs")], "only the files it keeps");
  const first = await stampOf(await list.files());
  assert.match(first, /^[a-f0-9]{16}$/);
  assert.equal(await stampOf(await list.files()), first, "nothing changed: the same stamp");
  writeFileSync(file("a.mjs"), "export const a = 22;");
  utimesSync(file("a.mjs"), new Date(2020, 0, 1), new Date(2020, 0, 1));
  const written = await stampOf(await list.files());
  assert.notEqual(written, first, "written: another stamp");
  writeFileSync(file("c.mjs"), "export const c = 3;");
  assert.equal(await stampOf(await list.files()), written, "a file added is not listed until the list is told");
  list.changed();
  assert.deepEqual(await list.files(), [file("a.mjs"), file("c.mjs")]);
  rmSync(file("c.mjs"));
  assert.notEqual(await stampOf(await list.files()), written, "a file listed and gone counts as gone");
  rmSync(folder, { recursive: true, force: true });
}

// A report's page kept and made again (in a process of its own: its studio is a temporary one).
{
  const studio = mkdtempSync(path.join(tmpdir(), "preview-pages-"));
  const run = spawnSync(process.execPath, [path.join(import.meta.dirname, "fixtures", "preview-pages.mjs")], { encoding: "utf8", env: { ...process.env, GALLERY_WORKSPACE: path.join(studio, "reports"), GALLERY_DEFAULT_WORKSPACE: path.join(studio, "reports") } });
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  rmSync(studio, { recursive: true, force: true });
}

// A custom page as the server shows it, and its live channel (in a process of its own: a workspace of its own).
{
  const studio = mkdtempSync(path.join(tmpdir(), "custom-pages-"));
  const run = spawnSync(process.execPath, [path.join(import.meta.dirname, "fixtures", "custom-pages.mjs")], { encoding: "utf8", env: { ...process.env, GALLERY_WORKSPACE: path.join(studio, "reports"), GALLERY_DEFAULT_WORKSPACE: path.join(studio, "reports") } });
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  rmSync(studio, { recursive: true, force: true });
}

console.log("Checked the preview's routes: another host refused (403) before anything; its file routes: nothing there answered 404 and nothing else, a page icon's type and caching, the type and caching of an editor module (kept for good under a stamp, never by its path alone), the kit's files under their stamps, mhchem and the emoji data, a slug only as a document's slug, and the server's own writers never served; the stamps of files; a document's page kept for its text and stamps, made again when its folder changes (at once, or once the watcher tells of a change its time does not show); and a custom page at /pages/<slug> (the kit's tags every custom page loads and the board's, after its main, under their stamps; its live script and the workbench's session; no editor; each card with its id and base, and the page map; none for a page not there; its own files at /pages/<slug>/assets/<file>, a picture by its type and any other handed out, nothing else of its folder, and its references to them addressed there; the page service's library), what the watcher's changes under pages/ are, and its channel told a write once, by its version.");

await routes.close();
