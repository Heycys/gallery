import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createReportFromStarter } from "../../../src/render/reports.mjs";
import { createRoutes } from "../../../src/server/routes.mjs";
import { createPage, pageFiles } from "../../../src/shared/pages.mjs";
import { reportsDirectory } from "../../../src/shared/paths.mjs";

// Run by tests/unit/updates.mjs in a workspace of its own (GALLERY_WORKSPACE, the default one too): the
// workbench's stream told "updated <key>" of a page someone else wrote (src/server/updates.mjs, wired in
// src/server/routes.mjs), as the watcher tells the routes of the writes.

const PORT = 4997;
// A document as gallery new makes one (the starter's), and that text with a paragraph of `words` before its main ends.
const fileOf = (slug) => path.join(reportsDirectory, slug, "doc.html");
const starters = new Map();
const make = async (slug) => {
  await createReportFromStarter(slug, slug, "测试用的文档", { directory: reportsDirectory, blank: true });
  starters.set(slug, fs.readFileSync(fileOf(slug), "utf8"));
};
const page = (slug, words) => starters.get(slug).replace("</main>", `<p>${words}</p>\n</main>`);
await make("alpha");
await make("beta");
await createPage("board", "看板", { root: reportsDirectory });

const routes = createRoutes({ reportsDirectory, stateDirectory: mkdtempSync(path.join(tmpdir(), "updated-pages-state-")), logger: { warn() {}, error() {}, info() {} } });
const heard = [];
const stream = { writeHead() {}, write: (text) => heard.push(text), end() {} };
routes.handle({ url: "/__gallery/events?workspace", method: "GET", headers: { host: `127.0.0.1:${PORT}` }, socket: { localPort: PORT }, on() {} }, stream, () => {});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const updated = () => heard.filter((text) => text.startsWith("data: updated ")).map((text) => text.slice("data: updated ".length).trim());
// What the stream says within `ms` of `act` (the announcement waits for a write's quiet moment, 1.5 s).
async function after(act, ms = 2600) {
  heard.length = 0;
  await act();
  await sleep(ms);
  return updated();
}
await sleep(600); // the start's take of each document and page

// An Agent's write of a document's file: told once, by its slug.
assert.deepEqual(await after(() => {
  fs.writeFileSync(fileOf("beta"), page("beta", "Agent 改了这段话。"));
  routes.changed("change", fileOf("beta"));
}), ["beta"], "someone else's write of beta");
// The same text told again (a watcher's second event, a write of the same bytes): no update.
assert.deepEqual(await after(() => {
  fs.writeFileSync(fileOf("beta"), page("beta", "Agent 改了这段话。"));
  routes.changed("change", fileOf("beta"));
}), [], "the same text again");
// doc.json alone (a look, a description): no update.
assert.deepEqual(await after(() => {
  fs.writeFileSync(path.join(reportsDirectory, "alpha", "doc.json"), `${JSON.stringify({ title: "alpha", description: "说明" })}\n`);
  routes.changed("change", path.join(reportsDirectory, "alpha", "doc.json"));
}), [], "doc.json alone");
// The reader's own write through the edit service (a rename: its h1, by the service as the reader's): no update.
assert.deepEqual(await after(async () => {
  const done = await routes.edits.renameReport("alpha", "阿尔法");
  assert.equal(done.ok, true, JSON.stringify(done));
  routes.changed("change", fileOf("alpha"));
}), [], "the reader's rename");
// A document made after the start (gallery new, the workbench's 新建): no update; its next write by someone else is one.
assert.deepEqual(await after(async () => {
  await make("gamma");
  routes.changed("addDir", path.join(reportsDirectory, "gamma"));
  routes.changed("add", fileOf("gamma"));
}), [], "a document made");
assert.deepEqual(await after(() => {
  fs.writeFileSync(fileOf("gamma"), page("gamma", "Agent 写好了内容。"));
  routes.changed("change", fileOf("gamma"));
}), ["gamma"], "and then written by someone else");
// A custom page's page.html written by someone else: @<slug>.
const board = pageFiles("board", reportsDirectory);
assert.deepEqual(await after(() => {
  fs.writeFileSync(board.html, fs.readFileSync(board.html, "utf8").replace("</main>", "<p>Agent 加的。</p>\n</main>"));
  routes.changed("change", board.html);
}, 800), ["@board"], "a custom page written by someone else");
// Its page.json alone (a rename in the sidebar): no update.
assert.deepEqual(await after(() => {
  const meta = JSON.parse(fs.readFileSync(board.json, "utf8"));
  fs.writeFileSync(board.json, `${JSON.stringify({ ...meta, title: "看板二" }, null, 2)}\n`);
  routes.changed("change", board.json);
}, 800), [], "its page.json alone");

// No page hears it: a document's stream is not told.
const pageHeard = [];
routes.handle({ url: "/__gallery/events?slug=beta", method: "GET", headers: { host: `127.0.0.1:${PORT}` }, socket: { localPort: PORT }, on() {} }, { writeHead() {}, write: (text) => pageHeard.push(text), end() {} }, () => {});
await after(() => {
  fs.writeFileSync(fileOf("beta"), page("beta", "Agent 又改了。"));
  routes.changed("change", fileOf("beta"));
});
assert.ok(pageHeard.some((text) => text.startsWith("data: report ")) && !pageHeard.some((text) => text.startsWith("data: updated ")), "a document's page hears its report, never updated");

await routes.close();
console.log("updated pages told");
