import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { parse } from "parse5";
import { loadKitFile } from "../../src/render/kit-build.mjs";
import { chartDeclarationFailures, chartDeclarationNotes, VIEW_ROWS } from "../../src/render/chart-declarations.mjs";
import { relinkMade } from "../../src/editor/source/chart-keys.mjs";
import { rewriteTable } from "../../src/editor/source/table.mjs";
import { relinkCopies } from "../../src/editor/page/clipboard/own/chart-keys.mjs";
import FILE from "../../src/editor/components/installed/file.mjs";
import { descriptionOf } from "../../src/shared/component-catalog.mjs";
import { readTable, rowsOf } from "../../src/render/kit/runtime/table-reading.js";

// The views of a table (docs/editor.md "Table views", docs/render.md "Charts from a
// table" and "A custom block on a page"): the kit's one reading of a table (runtime/table-reading.js)
// and its watcher, context.table() and its intents, the keys pasted and committed, the instance a view made from "/"
// is, written with its key, the checks of a view, and a table's rows kept a row a line.

// What the page's realm made, in this one's (deepEqual holds to the prototypes).
const plain = (value) => JSON.parse(JSON.stringify(value));

// ---------- the reading, alone ----------
{
  const { window } = new JSDOM(`<table><thead><tr><th>任务</th><th data-sort-type="text">编号</th><th>工时</th></tr></thead><tbody>
    <tr><td><a href="../plan/doc.html#b1">写方案</a></td><td>12</td><td>3.5</td></tr><tr><td><a href="#own">做评审</a></td><td>7</td><td></td></tr></tbody></table>
    <table><tbody><tr><td>组</td><td>值</td></tr><tr><td>甲</td><td>1</td></tr></tbody></table>
    <table><tbody><tr><th>组</th><th>值</th></tr><tr><td colspan="2">甲</td></tr></tbody></table>`);
  const [first, second, merged] = window.document.querySelectorAll("table");
  const read = readTable(first);
  assert.deepEqual([read.names, read.types, read.rows.length, read.merged, read.header === first.tHead.rows[0]], [["任务", "编号", "工时"], [null, "text", null], 2, false, true]);
  const rows = rowsOf(read, "here");
  assert.deepEqual(rows.map(({ values }) => ({ ...values })), [{ 任务: "写方案", 编号: "12", 工时: 3.5 }, { 任务: "做评审", 编号: "7", 工时: null }], "values as a chart reads them, a text column's words");
  assert.deepEqual(rows.map(({ links }) => links.map((link) => ({ ...link }))), [[{ slug: "plan", title: "写方案", block: "b1" }], [{ slug: "here", title: "做评审", block: "own" }]], "links to documents, one of its own by its slug");
  assert.ok(Object.isFrozen(rows[0]) && Object.isFrozen(rows[0].values) && rows[0].el === first.tBodies[0].rows[0]);
  const headless = readTable(second);
  assert.deepEqual([headless.header, headless.first === second.rows[0], headless.names, headless.rows.length], [null, true, ["组", "值"], 1], "with no header row, its first row names the columns (csvParse)");
  assert.equal(readTable(merged).merged, true, "a cell spanning others: merged");
}

// ---------- the kit in a page ----------
const [runtime] = await Promise.all([loadKitFile("runtime.js")]);
function page(body, { head = "" } = {}) {
  const dom = new JSDOM(`<!doctype html><html><head>${head}</head><body><main class="doc-page" data-doc-id="tasks">${body}</main></body></html>`, { url: "https://report.test/report.html", runScripts: "outside-only" });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  const frames = new Map();
  let frame = 0;
  w.requestAnimationFrame = (fn) => { frames.set(++frame, fn); return frame; };
  w.cancelAnimationFrame = (id) => frames.delete(id);
  w.eval(runtime);
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let pass = 0; frames.size && pass < 10; pass++) {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((fn) => fn());
    }
  };
  return { w, settle };
}
const TABLE = `<div class="doc-table-wrap" data-doc-chart-source="t1"><table class="doc-table"><thead><tr><th>任务</th><th>状态</th></tr></thead><tbody>
  <tr><td>写方案</td><td>待办</td></tr><tr><td>做评审</td><td>进行中</td></tr><tr><td>发布</td><td>待办</td></tr></tbody></table></div>`;
const VIEW = (id = "local/view", from = "t1") => `<div data-doc-component="${id}"${from ? ` data-doc-from="${from}"` : ""}></div>`;
// The packages a page is told of: one that reads tables, one whose needs hold none.
const tell = (w) => {
  w.DocKit.describe({ id: "local/view", match: '[data-doc-component="local/view"]', parts: {}, needs: ["tables"] });
  w.DocKit.describe({ id: "local/plain", match: '[data-doc-component="local/plain"]', parts: {} });
  w.eval(`window.contexts = new Map(); window.told = [];
    for (const id of ["local/view", "local/plain"]) DocKit.component({ id, on: ["data"], mount(host, context) { window.contexts.set(host, context); return { update: (reason, detail) => window.told.push([host.getAttribute("data-doc-from"), reason, detail]) }; } });`);
};
{
  const { w, settle } = page(`${TABLE}${VIEW()}${VIEW()}${VIEW("local/plain")}${VIEW("local/view", null)}`);
  tell(w);
  await settle();
  const [view, other, noTables, unbound] = w.document.querySelectorAll("[data-doc-component]");
  const context = w.contexts.get(view);
  const table = context.table();
  assert.deepEqual(plain([table.columns, table.rows.map(({ values }) => values.任务)]), [["任务", "状态"], ["写方案", "做评审", "发布"]], "a view reads its table's rows");
  assert.equal(w.contexts.get(other).table().rows[0], table.rows[0], "two views of one table read it once: the same rows");
  assert.equal(w.contexts.get(noTables).table(), null, "a block whose needs hold no tables reads none");
  assert.equal(w.contexts.get(unbound).table(), null, "a view with no key reads none");
  // Intents: asked of whoever edits the page, false where nothing takes them or the page takes no edits.
  const asked = [];
  w.document.addEventListener("doc-table-intent", (event) => {
    asked.push({ ...event.detail, table: event.detail.table === w.document.querySelector("table"), row: event.detail.row?.cells[0].textContent ?? null, before: event.detail.before?.cells[0].textContent ?? null, after: event.detail.after?.cells[0].textContent ?? null });
    if (w.taking) event.preventDefault();
  });
  assert.equal(table.set(table.rows[0], "任务", "写好方案"), false, "nothing asked before the page takes edits");
  assert.equal(asked.length, 0);
  w.dispatchEvent(new w.Event("doc-editable"));
  assert.equal(table.set(table.rows[0], "任务", "写好方案"), false, "no taker: false");
  w.taking = true;
  assert.deepEqual(plain([
    table.set(table.rows[0], "状态", "已完成"),
    table.move(table.rows[1], { before: table.rows[0], values: { 状态: "待办" } }),
    table.move(table.rows[0], { after: table.rows[2] }),
    table.add({ 任务: "新", 状态: "待办" }, { after: table.rows[2] }),
    table.add({ 任务: "末" }),
    table.remove(table.rows[2]),
  ]), [true, true, true, true, true, true]);
  assert.deepEqual(plain(asked.slice(1).map(({ op, table: same, row, before, after, cells }) => [op, same, row, before, after, cells ?? null])), [
    ["set", true, "写方案", null, null, [[1, "已完成"]]],
    ["move", true, "做评审", "写方案", null, [[1, "待办"]]],
    ["move", true, "写方案", null, "发布", []],
    ["add", true, null, null, "发布", [[0, "新"], [1, "待办"]]],
    ["add", true, null, null, null, [[0, "末"]]],
    ["remove", true, "发布", null, null, null],
  ], "each intent its row elements and its cells by the header's place");
  assert.throws(() => table.set(table.rows[0], "负责人", "x"), /no column "负责人" in the table: its columns are "任务", "状态"/, "a name the header does not have throws");
  // What a view hears: data ("table") once its rows change, not for what leaves them as they were.
  w.told.length = 0;
  const heard = [];
  const stop = table.subscribe(() => heard.push("heard"));
  w.document.querySelector("tbody td").textContent = "写好方案";
  await settle();
  assert.deepEqual(plain([heard, w.told.filter(([from]) => from === "t1").map(([, reason, detail]) => `${reason} ${detail}`)]), [["heard"], ["data table", "data table"]], "a cell typed: each view of it hears data, the listener its change");
  const fresh = context.table();
  assert.notEqual(fresh.rows[0], table.rows[0], "the row typed in is a row anew");
  assert.equal(fresh.rows[1], table.rows[1], "the rows that did not change are the same objects");
  w.document.querySelector("thead th").setAttribute("aria-sort", "none");
  await settle();
  assert.equal(heard.length, 1, "an attribute that changes no value: nothing heard");
  const body = w.document.querySelector("tbody");
  body.append(body.rows[0]);
  w.document.querySelector("thead th").setAttribute("aria-sort", "ascending");
  await settle();
  assert.deepEqual(plain([heard.length, context.table().rows.map(({ values }) => values.任务)]), [1, ["写好方案", "做评审", "发布"]], "a reader's sort (aria-sort): its rows in the file's order, nothing heard");
  w.document.querySelector("thead th").setAttribute("aria-sort", "none");
  await settle();
  assert.equal(heard.length, 2, "and once that order is the page's, heard");
  stop();
  w.document.querySelector("tbody td").textContent = "x";
  await settle();
  assert.equal(heard.length, 2, "a listener taken off hears nothing");
  // A view's key changed: it reads the other table, and hears so.
  w.told.length = 0;
  view.setAttribute("data-doc-from", "t9");
  await settle();
  assert.deepEqual(plain([context.table(), w.told.filter(([from]) => from === "t9").length]), [null, 1], "its key changed to one no table carries: none, and heard");
  // The table's key taken off (an undo of the step that put a view in), a cell typed meanwhile, the key
  // put back (its redo): the cell read as it is now, nothing kept of it from before.
  view.setAttribute("data-doc-from", "t1");
  await settle();
  const frame = w.document.querySelector(".doc-table-wrap");
  assert.equal(context.table().rows[1].values.任务, "发布");
  frame.removeAttribute("data-doc-chart-source");
  await settle();
  w.document.querySelectorAll("tbody tr")[1].cells[0].textContent = "发布了";
  await settle();
  frame.setAttribute("data-doc-chart-source", "t1");
  await settle();
  assert.equal(context.table().rows[1].values.任务, "发布了", "a cell changed while its table had no key is read anew once it has one again");
  // Merged cells: none to read.
  w.document.querySelector("tbody td").setAttribute("colspan", "2");
  await settle();
  assert.equal(context.table(), null, "a cell spanning others: none");
}
{
  // In an export: read, never asked.
  const { w, settle } = page(`${TABLE}${VIEW()}`, { head: '<meta name="generator" content="Gallery">' });
  tell(w);
  await settle();
  const context = w.contexts.get(w.document.querySelector("[data-doc-component]"));
  let asked = 0;
  w.document.addEventListener("doc-table-intent", (event) => { asked += 1; event.preventDefault(); });
  w.dispatchEvent(new w.Event("doc-editable"));
  const table = context.table();
  assert.deepEqual(plain([context.place, table.rows.length, table.set(table.rows[0], "任务", "x"), table.remove(table.rows[0]), table.canEdit(), asked]), ["export", 3, false, false, false, 0], "an export reads its table and asks nothing");
}
{
  // canEdit(): asked as an intent is, with no change (op "check"), which a view shows read-only by: false
  // before the page edits (nothing asked) and with no taker, true where the editor would take one.
  const { w, settle } = page(`${TABLE}${VIEW()}`);
  tell(w);
  await settle();
  const table = w.contexts.get(w.document.querySelector("[data-doc-component]")).table();
  const ops = [];
  w.document.addEventListener("doc-table-intent", (event) => {
    ops.push(event.detail.op);
    if (w.taking) event.preventDefault();
  });
  assert.equal(table.canEdit(), false, "before the page edits");
  w.dispatchEvent(new w.Event("doc-editable"));
  assert.equal(table.canEdit(), false, "no taker");
  w.taking = true;
  assert.equal(table.canEdit(), true, "the editor takes it");
  assert.deepEqual([ops, w.document.querySelector("tbody td").textContent], [["check", "check"], "写方案"], "asked with no change, nothing before the page edits");
}
{
  // On a custom page: none.
  const { w, settle } = page(`<main class="gallery-page">${TABLE}${VIEW()}</main>`);
  tell(w);
  await settle();
  assert.equal(w.contexts.get(w.document.querySelector("[data-doc-component]")).table(), null, "on a custom page a view reads no table");
}

// ---------- what the kit is told of a block ----------
assert.deepEqual(descriptionOf({ id: "local/view", match: "m", parts: {}, needs: ["tables"] }).needs, ["tables"]);
assert.equal("needs" in descriptionOf({ id: "local/plain", match: "m", parts: {}, needs: [] }), false, "needs told only where a block has any");

// ---------- the keys pasted ----------
{
  const { window } = new JSDOM(`<main>${TABLE}${VIEW()}</main>`);
  const doc = window.document;
  const made = (html) => {
    const template = doc.createElement("template");
    template.innerHTML = html;
    return [...template.content.children];
  };
  const pair = made(`${TABLE}${VIEW()}`);
  relinkCopies(doc, pair);
  assert.deepEqual([pair[0].getAttribute("data-doc-chart-source"), pair[1].getAttribute("data-doc-from")], ["t2", "t2"], "a table and its view pasted together: a pair of their own");
  const alone = made(VIEW());
  relinkCopies(doc, alone);
  assert.equal(alone[0].getAttribute("data-doc-from"), "t1", "a view pasted alone keeps its key");
  const table = made(TABLE);
  relinkCopies(doc, table);
  assert.equal(table[0].hasAttribute("data-doc-chart-source"), false, "a table pasted alone where one carries its key: a table alone");
  // From another document (`same` false), where this one's table carrying t1 is no table of theirs.
  const away = made(VIEW());
  relinkCopies(doc, away, { same: false });
  assert.equal(away[0].hasAttribute("data-doc-from"), false, "a view pasted alone into another document: its key taken off, no table of the document read");
  const card = made('<figure class="doc-figure"><div data-doc-chart="dots" data-doc-chart-data="t1"></div></figure>');
  relinkCopies(doc, card, { same: false });
  assert.equal(card[0].querySelector("[data-doc-chart]").hasAttribute("data-doc-chart-data"), false, "a card the same");
  const pairAway = made(`${TABLE}${VIEW()}`);
  relinkCopies(doc, pairAway, { same: false });
  assert.deepEqual([pairAway[0].getAttribute("data-doc-chart-source"), pairAway[1].getAttribute("data-doc-from")], ["t2", "t2"], "a table and its view pasted into another document: a pair of their own there");
  const { window: empty } = new JSDOM("<main><p>空</p></main>");
  const lone = made(TABLE);
  relinkCopies(empty.document, lone, { same: false });
  assert.equal(lone[0].hasAttribute("data-doc-chart-source"), false, "a table pasted alone into another document: a table alone, though none there carries its key");
  const kept = made(TABLE);
  relinkCopies(empty.document, kept);
  assert.equal(kept[0].getAttribute("data-doc-chart-source"), "t1", "in its own document, none carrying its key: kept");
}

// ---------- the keys committed ----------
{
  const file = (views) => `<main>
<div class="doc-table-wrap" data-doc-chart-source="t1" data-block-id="agent001"><table><tr><td>a</td></tr></table></div>
<div class="doc-table-wrap" data-doc-chart-source="t1" data-block-id="table002"><table><tr><td>b</td></tr></table></div>
${views}
</main>`;
  const made = relinkMade(file('<div data-doc-component="local/view" data-doc-from="t1" data-block-id="view0003"></div>'), new Set(["view0003"]), new Set(["table002"]));
  assert.deepEqual(made.keys, { t1: "t2" }, "a view made and a table keyed with the key an Agent's table carries: both a key of their own");
  assert.match(made.text, /data-doc-chart-source="t2" data-block-id="table002"/);
  assert.match(made.text, /data-doc-from="t2" data-block-id="view0003"/);
  assert.match(made.text, /data-doc-chart-source="t1" data-block-id="agent001"/, "the Agent's table keeps its key");
  const alone = relinkMade(file(""), new Set(), new Set(["table002"]));
  assert.deepEqual([alone.keys, alone.text.includes('<div class="doc-table-wrap" data-block-id="table002">')], [{ t1: null }, true], "a table keyed with no view, another carrying its key: its key taken off");
  const none = relinkMade(file(""), new Set(), new Set());
  assert.deepEqual(none.keys, {}, "nothing made or keyed: nothing changed");
}

// ---------- an instance a view made from "/" is: written with its key ----------
{
  const packages = new Map([["local/view", { id: "local/view", template: '<div class="view" data-doc-component="local/view" data-doc-from="old"><h3>视图</h3></div>', parts: {} }]]);
  const written = (markup) => markup;
  assert.equal(FILE.installed.source({ package: "local/view", from: "t3" }, { packages, written }), '<div class="view" data-doc-component="local/view" data-doc-from="t3"><h3>视图</h3></div>', "its key in place of the template's");
  assert.equal(FILE.installed.source({ package: "local/view", from: "3 bad" }, { packages, written }), null, "no key: refused");
  assert.equal(FILE.installed.source({ package: "local/view", html: '<div data-doc-component="local/view" data-doc-from="t1"></div>', from: "t2" }, { packages, written }), '<div data-doc-component="local/view" data-doc-from="t2"></div>', "what a paste carried, with the key the paste gave it");
  assert.equal(FILE.installed.source({ package: "local/view", html: '<div class="view" data-doc-component="local/view" data-doc-from="t1"><h3>视图</h3></div>', from: null }, { packages, written }), '<div class="view" data-doc-component="local/view"><h3>视图</h3></div>', "one carried with no key on the page (pasted into another document): written with none");
  const plainMarkup = '<div  data-doc-component="local/view" title=a><h3>视图</h3></div>';
  assert.equal(FILE.installed.source({ package: "local/view", html: plainMarkup, from: null }, { packages, written }), FILE.installed.source({ package: "local/view", html: plainMarkup }, { packages, written }), "a carried instance with no key to take off: written as with no `from`");
}

// ---------- the checks ----------
{
  const doc = (body) => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>t</title></head><body><main data-doc-id="x">${body}</main></body></html>`;
  const failures = chartDeclarationFailures(doc(`${TABLE}${VIEW("local/view", "t9")}<p data-doc-from="t1">字</p>${VIEW("local/view", "1 bad")}`));
  assert.deepEqual(failures.map((line) => line.replace(/\(line \d+\)/g, "(line)")), [
    'local/view (line): no table\'s frame carries data-doc-chart-source="t9", so the view has no table to read: put the table back, or delete the view',
    '<p> (line) carries data-doc-from="t1", which only a view of a table carries: an instance of a custom block (<div data-doc-component="<scope>/<name>">) whose block\'s needs hold "tables"; take it off',
    'local/view (line): data-doc-from="1 bad" is no key: a letter, then letters, digits, "_" or "-", 32 at most, as the table\'s frame writes it in data-doc-chart-source',
  ]);
  assert.deepEqual(chartDeclarationFailures(doc(`${TABLE}${TABLE}${VIEW()}`)).map((line) => line.replace(/lines? [\d, ]+/g, "lines")), ['local/view (line 1): 2 tables carry data-doc-chart-source="t1" (lines): a key names one table (the view reads the first); take it off the copies'].map((line) => line.replace(/lines? [\d, ]+/g, "lines")));
  assert.deepEqual(chartDeclarationFailures(doc(`${TABLE}${VIEW()}`)), [], "a view of its table: nothing to say");
  const long = `<div class="doc-table-wrap" data-doc-chart-source="t1"><table><thead><tr><th>a</th></tr></thead><tbody>${"<tr><td>1</td></tr>".repeat(VIEW_ROWS + 1)}</tbody></table></div>`;
  const merged = '<div class="doc-table-wrap" data-doc-chart-source="t2"><table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td colspan="2">1</td></tr></tbody></table></div>';
  const notes = chartDeclarationNotes(doc(`${long}${VIEW()}${merged}${VIEW("local/view", "t2")}`));
  assert.ok(notes.some((note) => note.includes(`has ${VIEW_ROWS + 1} rows: every view of a table reads it again as it is typed in`)), notes.join("\n"));
  assert.ok(notes.some((note) => note.includes("has merged cells, which no view reads")), notes.join("\n"));
  // A view written before the table it reads works, and is no failure; it is a note naming the instance and the
  // table's key (found testing the skill with Agents, 2026-11-09: three views written above the table each block's writing.md says to
  // write them after). The one after its table, and a view beside one before, are told apart.
  const before = (list) => list.filter((note) => note.includes("stands before the table it reads"));
  assert.deepEqual(chartDeclarationFailures(doc(`${VIEW()}${TABLE}`)), [], "a view before its table: no failure");
  assert.deepEqual(before(chartDeclarationNotes(doc(`${TABLE}${VIEW()}`))), [], "after its table: nothing to say");
  assert.deepEqual(before(chartDeclarationNotes(doc(`${VIEW()}${TABLE}`))).map((note) => note.replace(/line \d+/g, "line N")), [
    'local/view (line N) stands before the table it reads (data-doc-chart-source="t1", line N): it works there, but each block\'s writing.md writes the table first and the view after it, as its example does: move the view below the table, unless the document is meant to open on it',
  ]);
  assert.equal(before(chartDeclarationNotes(doc(`${VIEW("local/a")}${TABLE}${VIEW("local/b")}`))).length, 1, "only the one above");
}

// ---------- a table's rows a line, section by section ----------
{
  const source = `<div class="doc-table-wrap">
  <table class="doc-table">
    <thead><tr><th>任务</th></tr></thead>
    <tbody>
      <tr><td>甲</td></tr>
      <tr><td>乙</td></tr>
    </tbody>
  </table>
</div>`;
  const node = parse(source, { sourceCodeLocationInfo: true }).childNodes[0].childNodes[1].childNodes[0];
  const rows = (order) => [{ head: true, from: 0, cells: [{ from: [0, 0], tag: "th" }] }, ...order.map((from) => ({ head: false, from, cells: [{ from: [from, 0], tag: "td" }] }))];
  const { start, end, text } = rewriteTable(source, node, { rows: rows([2, 1]) }, { validCell: () => true });
  assert.equal(source.slice(0, start) + text + source.slice(end), source.replace("<tr><td>甲</td></tr>\n      <tr><td>乙</td></tr>", "<tr><td>乙</td></tr>\n      <tr><td>甲</td></tr>"), "a head on one line beside a body a row a line: rows moved in the body keep it so");
}

console.log("Checked the views of a table: the kit's one reading of a table (its header, a first row naming the columns where it has none, values and links as a chart and a view read them, merged cells); context.table() (for a block whose needs hold tables, not on a custom page, none with no key, no table or merged cells; two views reading one table once, their rows the same objects; each intent asked of the page editor with its rows and cells, false with no taker, before the page takes edits and in an export, a column the header lacks throwing; canEdit() asked as an intent with no change); what a view hears (data and its listeners once its rows change, not an attribute that changes nothing nor a reader's sort, its key changed, a row typed in a row anew and the others the same); what the kit is told of a block's needs; the keys pasted (a pair of their own, a view alone keeping its key, a table alone losing it; from another document a view or a card alone and a table alone losing theirs, a pair one of its own there) and committed (a view made and a table keyed against an Agent's key, a table keyed alone); the instance 视图 › makes written with its key, one carried with none on the page with none; the checks of a view (no table, two, no key, on no instance, merged cells, more rows than the bound); a table's rows a line kept section by section.");
