// Browser scenarios of the database (多维表格: src/shared/database.mjs, render/kit/database/,
// src/editor/components/database/), spread into scenarios.mjs: made from the "/" menu, its cells,
// options, dates, checkboxes and numbers edited, each change one step of the document's undo, a board's
// card dragged, a view's filter and sort written into its JSON, an Agent's write while the page is open,
// a conflict, an export that reads only, the dark theme.
import fs from "node:fs/promises";
import path from "node:path";
import { projectRoot } from "../../src/shared/paths.mjs";
import { SAMPLE } from "../fixtures/database/sample.mjs";


// GALLERY_TEST_SHOTS=<folder> keeps the pictures the scenarios take (none taken without it).
const SHOTS = process.env.GALLERY_TEST_SHOTS || null;

// The report's page written anew: its title and `body`, no script of its own.
const pageOf = (title, body) => (text) => text.replace(/<script>[\s\S]*?<\/script>/g, "<script></script>").replace(/<main([^>]*)>[\s\S]*<\/main>/, `<main$1>
    <header class="doc-header"><h1 class="doc-title">${title}</h1></header>
    ${body}
  </main>`);

/** A database as an Agent writes one: its columns and views, then a table of its records. */
export const TASKS = `<div class="doc-database">
      <script type="application/json">
      {
        "columns": [
          { "id": "title", "name": "任务", "type": "title", "width": 220 },
          { "id": "status", "name": "状态", "type": "select", "options": [{ "name": "待开始", "color": "gray" }, { "name": "进行中", "color": "blue" }, { "name": "已完成", "color": "green", "done": true }] },
          { "id": "owner", "name": "负责人", "type": "select", "options": [{ "name": "林夏", "color": "blue" }, { "name": "周舟", "color": "brown" }] },
          { "id": "tags", "name": "标签", "type": "multi", "options": [{ "name": "前端", "color": "blue" }, { "name": "后端", "color": "purple" }] },
          { "id": "due", "name": "截止日期", "type": "date" },
          { "id": "est", "name": "估时", "type": "number" },
          { "id": "progress", "name": "进度", "type": "number", "numberFormat": { "format": "percent", "decimals": 0, "display": "bar" } },
          { "id": "accepted", "name": "已验收", "type": "checkbox" },
          { "id": "remain", "name": "剩余工时", "type": "formula", "formula": "ROUND({est} * (1 - {progress}), 1)" },
          { "id": "notes", "name": "备注", "type": "text", "notes": true }
        ],
        "views": [
          { "id": "v1", "name": "全部任务", "layout": "table" },
          { "id": "v2", "name": "推进看板", "layout": "board", "boardBy": "status" }
        ]
      }
      </script>
      <table>
        <thead><tr><th data-column="title">任务</th><th data-column="status">状态</th><th data-column="owner">负责人</th><th data-column="tags">标签</th><th data-column="due">截止日期</th><th data-column="est">估时</th><th data-column="progress">进度</th><th data-column="accepted">已验收</th><th data-column="notes">备注</th></tr></thead>
        <tbody>
          <tr><td>登录页改版</td><td>已完成</td><td>林夏</td><td>前端</td><td>2026-11-12</td><td>12</td><td>1</td><td>✓</td><td></td></tr>
          <tr><td>公式引擎</td><td>进行中</td><td>周舟</td><td>后端</td><td>2026-11-30</td><td>30</td><td>0.35</td><td></td><td>只做四则运算</td></tr>
          <tr><td>日历视图</td><td>待开始</td><td>林夏</td><td>前端, 后端</td><td>下周</td><td>20</td><td>0</td><td></td><td></td></tr>
        </tbody>
      </table>
    </div>`;

// What the file holds of the database, its blanks folded.
const databaseIn = (text) => (/<div class="doc-database"[\s\S]*?<\/div>/.exec(text)?.[0] ?? "").replace(/\s+/g, " ");
const jsonIn = (text) => {
  const script = /<div class="doc-database"[\s\S]*?<script type="application\/json">([\s\S]*?)<\/script>/.exec(text)?.[1];
  return script ? JSON.parse(script) : null;
};
const rowsIn = (text) => [...(/<tbody>([\s\S]*?)<\/tbody>/.exec(databaseIn(text))?.[1] ?? "").matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((row) => [...row[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((cell) => cell[1]));

async function shoot(t, name, element = null) {
  if (!SHOTS) return;
  await fs.mkdir(SHOTS, { recursive: true });
  const target = element ? await t.page.$(element) : null;
  await (target ?? t.page).screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

// The database drawn and ready to take edits.
async function drawn(t) {
  await t.page.waitForFunction(() => document.querySelector(".doc-database-app .db-head") && document.documentElement.hasAttribute("data-ge-editing"), { polling: 50, timeout: 15000 });
  await t.sleep(200);
}

// A cell of the table (its row and column on screen), clicked.
async function clickCell(t, r, c, { count = 1 } = {}) {
  // A drawing that was just made (or made again after the page's commit) may draw its rows a frame later.
  await t.page.waitForFunction((r, c) => document.querySelector(`.doc-database-app [data-cell="${r}-${c}"]`), { polling: 50, timeout: 5000 }, r, c).catch(() => {});
  const box = await t.page.evaluate((r, c) => {
    const cell = document.querySelector(`.doc-database-app [data-cell="${r}-${c}"]`);
    cell?.scrollIntoView({ block: "center", inline: "center" });
    const rect = cell?.getBoundingClientRect();
    return rect ? { x: rect.left + Math.min(rect.width / 2, 40), y: rect.top + rect.height / 2 } : null;
  }, r, c);
  if (!box) throw new Error(`no cell ${r}-${c}`);
  await t.page.mouse.click(box.x, box.y, { clickCount: count });
  await t.sleep(120);
}

// What a selector finds (the first), clicked with the mouse where it shows.
async function clickOn(t, selector) {
  const box = await t.page.evaluate((selector) => {
    const node = document.querySelector(selector);
    node?.scrollIntoView({ block: "center" });
    const rect = node?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  }, selector);
  if (!box) throw new Error(`nothing found by ${selector}`);
  await t.page.mouse.click(box.x, box.y);
  await t.sleep(300);
}

export const databaseScenarios = {
  // "/" makes a database (多维表格, next to the table in the menu): three columns, three empty records, the
  // kit drawing it at once; a title typed in its first cell is in the file, one step of undo.
  async databaseSlash(t) {
    const { page } = t;
    await t.agentEdit(pageOf("多维表格", "<p>前文</p>\n    <p>后文</p>"));
    await t.open();
    await t.caret("前文");
    await t.press("Enter");
    await t.type("/dwbg");
    await t.sleep(300);
    const offered = await page.evaluate(() => [...document.querySelectorAll(".ge-pop .ge-pop-row")].map((row) => row.textContent.trim()).slice(0, 3));
    await t.press("Enter");
    await drawn(t);
    t.check(offered[0]?.includes("多维表格"), "/dwbg offers 多维表格 first", JSON.stringify(offered));
    await t.settle();
    let text = await t.read();
    t.check(/<p[^>]*>前文<\/p>\s*<div class="doc-database"[^>]*>\s*<script type="application\/json">/.test(text) && rowsIn(text).length === 3 && jsonIn(text)?.columns?.length === 3, "the new database is in the file: its JSON, three records", databaseIn(text).slice(0, 400));
    await shoot(t, "slash-new");
    await clickCell(t, 0, 0);
    await t.press("Enter");
    await t.type("登录页改版");
    await t.press("Enter");
    await t.settle();
    text = await t.read();
    t.check(rowsIn(text)[0]?.[0] === "登录页改版", "the title typed is the first record's", JSON.stringify(rowsIn(text)));
    await page.evaluate(() => document.querySelector(".doc-database-app .tbl-wrap").focus());
    await t.combo("Control", "z");
    await t.settle();
    text = await t.read();
    t.check(rowsIn(text)[0]?.[0] === "", "Ctrl+Z on the table undoes it: one step", JSON.stringify(rowsIn(text)));
    const drawnTitle = await page.evaluate(() => document.querySelector('.doc-database-app [data-cell="0-0"]')?.textContent.trim());
    t.check(!drawnTitle?.includes("登录页改版"), "and the drawing follows the file", drawnTitle);
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // An Agent's database: a select, a date, a checkbox and a number changed in their cells, each in the
  // file as its value is written (an option by its name, a date as 2026-12-01, a checked box ✓, a number
  // as it is), each one step of the document's undo, undone and redone in turn; the formula worked out
  // where it shows and in no cell of the file; the notes column in no table column; the date the Agent
  // wrote that is no date kept as written.
  async databaseCells(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${TASKS}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    const heads = await page.evaluate(() => [...document.querySelectorAll(".doc-database-app [data-head]")].map((head) => head.textContent.trim()));
    const shown = await page.evaluate(() => ({ remain: document.querySelector('.doc-database-app [data-cell="1-8"]')?.textContent.trim(), due: document.querySelector('.doc-database-app [data-cell="2-4"] .v-dirty')?.textContent }));
    t.check(!heads.some((name) => name.includes("备注")) && heads.some((name) => name.includes("剩余工时")), "the notes are no table column; the formula is", JSON.stringify(heads));
    t.check(shown.remain === "19.5" && shown.due === "下周", "the formula worked out (30 × 0.65), the date that is none shown as written", JSON.stringify(shown));
    const original = rowsIn(await t.read());
    // A select: 已完成 → 待开始.
    await clickCell(t, 0, 1);
    await t.press("Enter");
    await t.type("待开始");
    await t.press("Enter");
    await t.settle();
    t.check(rowsIn(await t.read())[0][1] === "待开始", "a select written by its option's name", JSON.stringify(rowsIn(await t.read())[0]));
    // A date, typed.
    await page.keyboard.press("Escape");
    await clickCell(t, 1, 4);
    await t.press("Enter");
    await t.type("2026-12-01");
    await t.press("Enter");
    await t.settle();
    t.check(rowsIn(await t.read())[1][4] === "2026-12-01", "a date written as 2026-12-01", JSON.stringify(rowsIn(await t.read())[1]));
    // A checkbox, clicked.
    await page.keyboard.press("Escape");
    await clickCell(t, 1, 7);
    await t.settle();
    t.check(rowsIn(await t.read())[1][7] === "✓", "a box checked by a click is ✓", JSON.stringify(rowsIn(await t.read())[1]));
    // A number, typed over.
    await clickCell(t, 1, 5);
    await t.type("32");
    await t.press("Enter");
    await t.settle();
    const edited = rowsIn(await t.read());
    t.check(edited[1][5] === "32", "a number written as it is", JSON.stringify(edited[1]));
    const json = jsonIn(await t.read());
    t.check(!databaseIn(await t.read()).includes("剩余工时") || json.columns.some((column) => column.id === "remain" && column.formula), "the formula column has no cells in the table", databaseIn(await t.read()).slice(0, 200));
    // Four steps of undo, one each, and four of redo.
    await page.evaluate(() => document.querySelector(".doc-database-app .tbl-wrap").focus());
    const undone = [];
    for (let step = 0; step < 4; step++) {
      await t.combo("Control", "z");
      await t.settle();
      undone.push(rowsIn(await t.read()));
    }
    t.check(undone[0][1][5] === "30" && undone[0][1][7] === "✓" && undone[1][1][7] === "" && undone[2][1][4] === "2026-11-30" && JSON.stringify(undone[3]) === JSON.stringify(original), "each change one step of undo, the last back to what the Agent wrote", JSON.stringify(undone.map((rows) => rows.slice(0, 2))));
    for (let step = 0; step < 4; step++) {
      await t.combo("Control", "y");
      await t.settle();
    }
    const redone = rowsIn(await t.read());
    const drawnRow = await page.evaluate(() => [...document.querySelectorAll('.doc-database-app [data-rowid]')][1]?.textContent);
    t.check(JSON.stringify(redone) === JSON.stringify(edited) && drawnRow?.includes("32"), "four redos: the changes back, the drawing too", JSON.stringify([redone[1], drawnRow]));
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // A board's card dragged to another column: its select in the file is that column's option, one step of undo.
  async databaseBoard(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${TASKS}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .tab")][1].click());
    await page.waitForSelector(".doc-database-app .board-col");
    await t.sleep(200);
    const at = await page.evaluate(() => {
      const card = [...document.querySelectorAll(".doc-database-app .card")].find((node) => node.textContent.includes("日历视图"));
      const column = [...document.querySelectorAll(".doc-database-app .board-col")].find((node) => node.textContent.includes("进行中"));
      const from = card.getBoundingClientRect(), to = column.getBoundingClientRect();
      return { x: from.left + 30, y: from.top + 14, tx: to.left + to.width / 2, ty: to.bottom - 12 };
    });
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    for (let step = 1; step <= 12; step++) await page.mouse.move(at.x + ((at.tx - at.x) * step) / 12, at.y + ((at.ty - at.y) * step) / 12);
    await t.sleep(100);
    await page.mouse.up();
    await t.settle();
    const rows = rowsIn(await t.read());
    t.check(rows.find((row) => row[0] === "日历视图")?.[1] === "进行中", "the card dragged to 进行中: its cell in the file says so", JSON.stringify(rows));
    const column = await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .board-col")].find((node) => node.textContent.includes("进行中"))?.textContent);
    t.check(column?.includes("日历视图"), "and it stands in that column", column);
    await shoot(t, "board-dragged");
    await page.evaluate(() => document.querySelector(".doc-database-app .board").focus?.());
    await page.evaluate(() => document.querySelector(".doc-database-app .tab").focus?.());
    await page.evaluate(() => { const target = document.querySelector(".doc-database-app .db-head"); target.setAttribute("tabindex", "-1"); target.focus(); });
    await t.combo("Control", "z");
    await t.settle();
    t.check(rowsIn(await t.read()).find((row) => row[0] === "日历视图")?.[1] === "待开始", "one undo puts it back", JSON.stringify(rowsIn(await t.read())));
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // A view's tab dragged by its left end (ui/reorder.js): the tab after it gives way once the dragged one's right
  // edge is past that tab's middle (src/shared/drag-place.mjs: by the tab, not the pointer, which is still over the
  // dragged tab's own place), not before; let go, the views' order in the file, one undo; Esc while held puts it
  // back, writes nothing, and the release after it opens no menu.
  async databaseTabsEdge(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${TASKS}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    const tabs = () => page.evaluate(() => [...document.querySelectorAll(".doc-database-app .tab")].map((tab) => {
      tab.scrollIntoView({ block: "center", inline: "nearest" });
      const rect = tab.getBoundingClientRect();
      return { name: tab.textContent.trim(), left: rect.left, right: rect.right, width: rect.width, y: rect.top + rect.height / 2, shift: new DOMMatrixReadOnly(getComputedStyle(tab).transform).m41 };
    }));
    const views = async () => jsonIn(await t.read()).views.map((view) => view.id).join();
    const [first, second] = await tabs();
    const press = { x: first.left + 6, y: first.y };
    const past = second.left + second.width / 2 + 3 - first.right; // its right edge 3px past the next one's middle
    await page.mouse.move(press.x, press.y);
    await page.mouse.down();
    await page.mouse.move(press.x + 8, press.y, { steps: 2 });
    await page.mouse.move(press.x + past - 12, press.y, { steps: 4 });
    await t.sleep(250);
    const short = await tabs();
    await page.mouse.move(press.x + past, press.y, { steps: 2 });
    await t.sleep(250);
    const during = await tabs();
    t.check(Math.abs(short[1].shift) < 0.5 && during[1].shift < -(first.width - 1) && press.x + past < second.left + second.width / 2, "its edge short of the next tab's middle: nothing moves; past it (the pointer short of it): the next tab has given way", JSON.stringify({ first, second, short, during }));
    await page.mouse.up();
    await t.sleep(300);
    await t.settle();
    t.check((await views()) === "v2,v1", "let go: the views' order in the file", await views());
    const head = async () => { const target = await page.$(".doc-database-app .db-head"); await page.evaluate((node) => { node.setAttribute("tabindex", "-1"); node.focus(); }, target); };
    await head();
    await t.combo("Control", "z");
    await t.settle();
    t.check((await views()) === "v1,v2", "one undo", await views());
    // Esc while held.
    const text = await t.read();
    const [again] = await tabs();
    await page.mouse.move(again.left + 6, again.y);
    await page.mouse.down();
    await page.mouse.move(again.left + 14, again.y, { steps: 2 });
    await page.mouse.move(again.left + 6 + past + 20, again.y, { steps: 4 });
    await t.sleep(250);
    await page.keyboard.press("Escape");
    await t.sleep(350);
    const back = await tabs();
    await page.mouse.up();
    await t.sleep(300);
    const menu = await page.evaluate(() => Boolean(document.querySelector(".doc-database-app .popover")));
    t.check(back.every((tab) => Math.abs(tab.shift) < 0.5) && (await t.read()) === text && !menu, "Esc while held: the tabs back, nothing written, the release opening no menu", JSON.stringify({ back, menu }));
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // A select's options reordered in its options' editor (编辑选项, props.js): one dragged up lifts and the others
  // make room as its top passes their middles (ui/reorder.js, as the settings' lines), let go the options' order in
  // the file, one undo.
  async databaseOptionsOrder(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${TASKS}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    await clickOn(t, '.doc-database-app [data-head="status"]');
    await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .popover .menu-item")].find((node) => node.textContent.includes("编辑选项")).click());
    await t.sleep(300);
    const rows = () => page.evaluate(() => [...document.querySelectorAll(".doc-database-app .popover .opt-row")].map((row) => {
      const rect = row.getBoundingClientRect();
      return { name: row.textContent, left: rect.left, top: rect.top, bottom: rect.bottom, height: rect.height, shift: new DOMMatrixReadOnly(getComputedStyle(row).transform).m42 };
    }));
    const options = async () => jsonIn(await t.read()).columns.find((column) => column.id === "status").options.map((option) => option.name).join();
    const before = await rows();
    t.check(before.length === 3, "the options' editor lists the three options", JSON.stringify(before));
    const press = { x: before[2].left + 14, y: before[2].top + before[2].height / 2 };
    // Its top 4px past the first one's middle: both above it give way.
    const by = before[0].top + before[0].height / 2 - 4 - before[2].top;
    await page.mouse.move(press.x, press.y);
    await page.mouse.down();
    await page.mouse.move(press.x, press.y - 8, { steps: 2 });
    await page.mouse.move(press.x, press.y + by, { steps: 6 });
    await t.sleep(300);
    const during = await rows();
    t.check(during[0].shift > before[2].height - 1 && during[1].shift > before[2].height - 1 && Boolean(await page.$(".doc-database-app .opt-row.reorder-lift")), "held: it lifts and the two above it give way", JSON.stringify(during));
    await page.mouse.up();
    await t.sleep(300);
    await t.settle();
    t.check((await options()) === "已完成,待开始,进行中", "let go: the options' order in the file", await options());
    await page.keyboard.press("Escape");
    await t.sleep(200);
    await page.evaluate(() => { const target = document.querySelector(".doc-database-app .db-head"); target.setAttribute("tabindex", "-1"); target.focus(); });
    await t.combo("Control", "z");
    await t.settle();
    t.check((await options()) === "待开始,进行中,已完成", "one undo", await options());
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // A filter added from the toolbar and a sort from a header's arrow are written into the view's JSON
  // (an option by its id, which is its name where the Agent gave none); which view shows is the reader's
  // and never the file's.
  async databaseViewJson(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${TASKS}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    const before = await t.read();
    // The board shown and back: nothing written.
    await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .tab")][1].click());
    await t.sleep(300);
    await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .tab")][0].click());
    await t.sleep(600);
    t.check((await t.state()) === "saved" && (await t.read()) === before, "switching views writes nothing");
    // A filter: 状态 is 进行中.
    await page.evaluate(() => document.querySelector(".doc-database-app .tool-filter").click());
    await t.sleep(250);
    await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .popover .menu-item")].find((row) => row.textContent.includes("状态")).click());
    await t.sleep(250);
    await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .popover .fe-opt")].find((row) => row.textContent.includes("进行中")).click());
    await t.sleep(250);
    await page.keyboard.press("Escape");
    await t.settle();
    let json = jsonIn(await t.read());
    const filter = json.views[0].filters?.[0];
    t.check(filter?.prop === "status" && filter.op === "is" && JSON.stringify(filter.value) === JSON.stringify(["进行中"]), "the filter is the view's, in the file", JSON.stringify(json.views[0]));
    const shownRows = await page.evaluate(() => [...document.querySelectorAll(".doc-database-app [data-rowid]")].map((row) => row.textContent));
    t.check(shownRows.length === 1 && shownRows[0].includes("公式引擎"), "and the table shows what it lets through", JSON.stringify(shownRows));
    // A sort from the 估时 header's arrow.
    await page.evaluate(() => document.querySelector('.doc-database-app [data-head="est"] .th-sort-btn').click());
    await t.settle();
    json = jsonIn(await t.read());
    t.check(JSON.stringify(json.views[0].sorts) === JSON.stringify([{ prop: "est", dir: "asc" }]), "the header's arrow sorts the view, in the file", JSON.stringify(json.views[0]));
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // An Agent adds a record while the page is open: the drawing shows it (the page takes the file's part
  // in), and the reader's next change writes over the Agent's file, the record kept.
  async databaseAgentRow(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${TASKS}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    await t.agentEdit((text) => text.replace("</tbody>", "  <tr><td>Agent 新加的任务</td><td>进行中</td><td>周舟</td><td></td><td>2026-12-03</td><td>8</td><td>0.1</td><td></td><td></td></tr>\n        </tbody>"));
    await page.waitForFunction(() => [...document.querySelectorAll(".doc-database-app [data-rowid]")].some((row) => row.textContent.includes("Agent 新加的任务")), { polling: 100, timeout: 15000 }).catch(() => {});
    const rows = await page.evaluate(() => [...document.querySelectorAll(".doc-database-app [data-rowid]")].map((row) => row.textContent));
    t.check(rows.length === 4 && rows[3].includes("Agent 新加的任务"), "the Agent's record is drawn", JSON.stringify(rows));
    await clickCell(t, 0, 5);
    await t.type("13");
    await t.press("Enter");
    await t.settle();
    const file = rowsIn(await t.read());
    t.check(file.length === 4 && file[0][5] === "13" && file[3][0] === "Agent 新加的任务", "the reader's change and the Agent's record both in the file", JSON.stringify(file));
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // The reader and the Agent change the database at once: the conflict card any block's write over
  // someone else's has; 仍然调整 writes the reader's, and one undo gives back the Agent's.
  async databaseConflict(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${TASKS}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    await t.offline();
    await clickCell(t, 0, 5);
    await t.type("15");
    await t.press("Enter");
    await t.sleep(300);
    await t.agentEdit((text) => text.replace("<td>公式引擎</td>", "<td>公式引擎（Agent）</td>"));
    await t.offline(false);
    await t.combo("Control", "s");
    await t.settle("held");
    const card = await page.evaluate(() => document.querySelector(".ge-conflict")?.textContent ?? null);
    t.check(Boolean(card?.includes("Agent")), "a conflict card", card);
    await page.waitForFunction(() => [...document.querySelectorAll(".ge-conflict button")].some((node) => node.textContent === "仍然调整" && !node.disabled), { timeout: 10000 });
    await page.evaluate(() => [...document.querySelectorAll(".ge-conflict button")].find((node) => node.textContent === "仍然调整").click());
    await t.settle();
    let rows = rowsIn(await t.read());
    t.check(rows[0][5] === "15" && rows[1][0] === "公式引擎", "仍然调整: the reader's database in the file", JSON.stringify(rows));
    await page.evaluate(() => document.querySelector(".doc-database-app .tbl-wrap").focus());
    await t.combo("Control", "z");
    await t.settle();
    rows = rowsIn(await t.read());
    t.check(rows[1][0] === "公式引擎（Agent）", "one undo gives back the Agent's", JSON.stringify(rows));
  },

  // An export: the database drawn in the offline file, its views switched, filtered and opened, nothing
  // to change it with, no failure on its console.
  async databaseExport(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${TASKS}\n    <p>后文</p>`));
    const url = t.exportReport();
    const errors = [];
    const listen = (message) => { if (message.type() === "error") errors.push(message.text()); };
    page.on("console", listen);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url, { waitUntil: "load" });
    await page.waitForSelector(".doc-database-app .db-head", { timeout: 15000 });
    await t.sleep(300);
    const look = await page.evaluate(() => ({
      rows: document.querySelectorAll(".doc-database-app [data-rowid]").length,
      handles: [...document.querySelectorAll(".doc-database-app :is(.row-handle, .edge-plus, .tab-add, .fill-add, .resizer)")].filter((node) => node.getClientRects().length > 0 && getComputedStyle(node).display !== "none").length,
      table: getComputedStyle(document.querySelector(".doc-database > table")).display,
    }));
    t.check(look.rows === 3 && look.handles === 0 && look.table === "none", "the export draws it, with nothing to change it with", JSON.stringify(look));
    // Drawn once there: its tabs named from the first drawing on (keyed() fills what it makes).
    const tabs = await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .tab")].map((tab) => tab.textContent.trim()));
    t.check(JSON.stringify(tabs) === JSON.stringify(["全部任务", "推进看板"]), "its tabs named", JSON.stringify(tabs));
    // The board: its columns, nothing to change them with (no hidden-columns button, no new group), a card opening
    // its record.
    await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .tab")][1].click());
    await t.sleep(300);
    const board = await page.evaluate(() => {
      const seen = (node) => Boolean(node) && node.getClientRects().length > 0;
      return {
        columns: [...document.querySelectorAll(".doc-database-app .board-col")].filter(seen).map((column) => column.querySelectorAll(".board-cards .card").length),
        hiddenButton: seen(document.querySelector(".doc-database-app .board-hidden")),
        newGroup: seen(document.querySelector(".doc-database-app .col-add-zone")),
      };
    });
    t.check(board.columns.length === 3 && board.columns.every((count) => count === 1) && !board.hiddenButton && !board.newGroup, "its views switch: the board, a column of each status with its card, nothing to change it with", JSON.stringify(board));
    await page.evaluate(() => document.querySelector(".doc-database-app .board-cards .card").click());
    await t.sleep(300);
    const cardPeek = await page.evaluate(() => Boolean(document.querySelector(".doc-database-app .peek, .doc-database-pages[data-doc-peek]")));
    t.check(cardPeek, "a card of the board opens its record", String(cardPeek));
    await page.keyboard.press("Escape");
    await t.sleep(200);
    await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .tab")][0].click());
    await t.sleep(300);
    await page.evaluate(() => document.querySelector(".doc-database-app [data-rowid] .open-btn").click());
    await t.sleep(300);
    const peek = await page.evaluate(() => ({ open: Boolean(document.querySelector(".doc-database-app .peek, .doc-database-pages[data-doc-peek]")), fields: document.querySelectorAll(".doc-database-app textarea:not([readonly])").length }));
    t.check(peek.open && peek.fields === 0, "a record opens, its fields read only", JSON.stringify(peek));
    await page.keyboard.press("Escape");
    await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .tab")][0].click());
    await t.sleep(200);
    await page.evaluate(() => document.querySelector('.doc-database-app [data-head="est"] .th-sort-btn').click());
    await t.sleep(200);
    const order = await page.evaluate(() => [...document.querySelectorAll(".doc-database-app [data-rowid]")].map((row) => row.querySelector(".v-title").textContent.trim()));
    t.check(JSON.stringify(order) === JSON.stringify(["登录页改版", "日历视图", "公式引擎"]), "sorted by 估时, for this reading", JSON.stringify(order));
    await shoot(t, "export-sorted");
    page.off("console", listen);
    t.check(errors.length === 0, "no errors in the export", JSON.stringify(errors));
    const exported = await t.exported();
    t.check(/<div class="doc-database"[^>]*>\s*<script type="application\/json">/.test(exported) && /data-doc-kit="database-inline"/.test(exported) && !/<div class="doc-database-app"/.test(exported), "the file holds the database as written, the kit's script inline, no drawing", String(exported.length));
  },

  // The dark theme: what it draws takes the kit's tokens (its options the nine colors' dark marks, its
  // menus the floating fill), never the light ones.
  async databaseDark(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${TASKS}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    await page.evaluate(() => { document.documentElement.setAttribute("data-doc-theme", "dark"); dispatchEvent(new Event("doc-theme-change")); });
    await t.sleep(200);
    await clickOn(t, ".doc-database-app .tool-settings");
    const colors = await page.evaluate(() => {
      const pill = [...document.querySelectorAll(".doc-database-app .pill")].find((node) => node.textContent.includes("进行中"));
      const menu = document.querySelector(".doc-database-app .popover");
      return { pill: getComputedStyle(pill).backgroundColor, menu: getComputedStyle(menu).backgroundColor, text: getComputedStyle(document.querySelector(".doc-database-app")).color, page: getComputedStyle(document.body).backgroundColor };
    });
    // The blue mark of the dark palette (src/shared/colors.mjs), the floating fill and the text of the dark tokens.
    t.check(colors.pill === "rgb(41, 69, 100)" && colors.menu === "rgb(37, 37, 37)" && colors.text === "rgb(243, 243, 243)", "the dark tokens and the nine colors' dark marks", JSON.stringify(colors));
    await shoot(t, "dark-settings");
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // A table an Agent wrote with no JSON: columns of words named by its header, the first the title; the
  // reader's first change writes the JSON in, before the table, and the cell as typed.
  async databaseNoJson(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>
    <div class="doc-database">
      <table>
        <thead><tr><th>任务</th><th>负责人</th></tr></thead>
        <tbody><tr><td>写方案</td><td>林夏</td></tr><tr><td>评审</td><td>周舟</td></tr></tbody>
      </table>
    </div>
    <p>后文</p>`));
    await t.open();
    await drawn(t);
    const heads = await page.evaluate(() => [...document.querySelectorAll(".doc-database-app [data-head]")].map((head) => head.textContent.trim()));
    t.check(JSON.stringify(heads) === JSON.stringify(["任务", "负责人"]), "its header's words are its columns", JSON.stringify(heads));
    await clickCell(t, 1, 1);
    await t.press("Enter");
    await t.combo("Control", "a");
    await t.type("苏禾"); // words that are no key of a keyboard: typed in the cell's field, as an input method puts them
    await t.press("Enter");
    await t.settle();
    const text = await t.read();
    const json = jsonIn(text);
    t.check(json?.columns?.map((column) => `${column.name}:${column.type}`).join() === "任务:title,负责人:text" && rowsIn(text)[1][1] === "苏禾" && /<th data-column="c1">任务<\/th>/.test(databaseIn(text)), "the first change writes its JSON in and names its columns", databaseIn(text).slice(0, 500));
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },
  // A clipboard of Gallery's own blocks, as any web page can write one, carrying a database whose markup has
  // what runs (a handler of its own, a picture with a handler in a cell, a link to code): nothing of it runs,
  // stands on the page or reaches the file; one of the format alone is pasted, made anew of its parts.
  async databasePasteSafe(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", "<p>前文</p>\n    <p>后文</p>"));
    await t.open();
    const paste = (html) => page.evaluate((html) => {
      const data = new DataTransfer();
      data.setData("application/x-gallery-blocks", JSON.stringify({ v: 1, report: "elsewhere", blocks: [{ type: "database", html, header: true, rows: [["a"]] }] }));
      data.setData("text/plain", "贴来的字");
      (document.activeElement ?? document.body).dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    }, html);
    for (const html of [
      '<div class="doc-database"><img src="data:x" onerror="window.__ran = (window.__ran || 0) + 1"><table><tbody><tr><td>a</td></tr></tbody></table></div>',
      '<div class="doc-database"><table><tbody><tr><td><img src="data:x" onerror="window.__ran = (window.__ran || 0) + 1">a</td></tr></tbody></table></div>',
      '<div class="doc-database"><table><thead><tr><th>链接</th></tr></thead><tbody><tr><td><a href="javascript:window.__ran=1">a</a></td></tr></tbody></table></div>',
    ]) {
      await t.caret("前文");
      await t.press("End");
      await paste(html);
      await t.sleep(600);
    }
    const seen = await page.evaluate(() => ({ ran: window.__ran ?? 0, on: document.querySelectorAll("main img, main [onerror], main a[href^='javascript']").length }));
    t.check(seen.ran === 0 && seen.on === 0, "nothing of it runs or stands on the page", JSON.stringify(seen));
    await t.settle();
    let text = await t.read();
    t.check(!/onerror|<img|javascript:/i.test(text), "nor reaches the file", text.slice(text.indexOf("<main"), text.indexOf("<main") + 600));
    await t.caret("后文");
    await t.press("End");
    await paste('<div class="doc-database"><script type="application/json">{"columns":[{"id":"t","name":"任务","type":"title"}],"views":[{"id":"v1","layout":"table"}]}</script><table><thead><tr><th data-column="t">任务</th></tr></thead><tbody><tr><td>贴来的记录</td></tr></tbody></table></div>');
    await t.page.waitForFunction(() => document.querySelector(".doc-database-app .db-head"), { timeout: 15000 }).catch(() => {});
    await t.settle();
    text = await t.read();
    t.check(rowsIn(text)[0]?.[0] === "贴来的记录" && jsonIn(text)?.columns?.[0]?.name === "任务", "a database of its format alone is pasted", databaseIn(text).slice(0, 300));
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // A table with no JSON: the first change writes the JSON in, one step with the change; its undo is saved and
  // gives the file back as it was, byte for byte (no script), its redo the change again.
  async databaseNoJsonUndo(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>
    <div class="doc-database">
      <table>
        <thead><tr><th>任务</th><th>负责人</th></tr></thead>
        <tbody><tr><td>写方案</td><td>林夏</td></tr><tr><td>评审</td><td>周舟</td></tr></tbody>
      </table>
    </div>
    <p>后文</p>`));
    await t.open();
    await drawn(t);
    await t.settle();
    // The block as the file holds it, but for the id the first commit gives it.
    const blockOf = (text) => (/<div class="doc-database"[\s\S]*?<\/div>/.exec(text)?.[0] ?? "").replace(/ data-block-id="[^"]*"/, "");
    const original = blockOf(await t.read());
    await clickCell(t, 1, 1);
    await t.press("Enter");
    await t.combo("Control", "a");
    await t.type("苏禾");
    await t.press("Enter");
    await t.settle();
    t.check(jsonIn(await t.read()) !== null && rowsIn(await t.read())[1]?.[1] === "苏禾", "the change and its JSON written", databaseIn(await t.read()).slice(0, 200));
    await page.evaluate(() => document.querySelector(".doc-database-app .tbl-wrap").focus());
    await t.combo("Control", "z");
    let saved = true;
    try { await t.settle(); } catch { saved = false; }
    const undone = blockOf(await t.read());
    t.check(saved && undone === original, "its undo is saved: the file as it was, byte for byte", JSON.stringify({ saved, state: await t.state(), original, undone }));
    t.check(!(await page.$(".ge-conflict")), "no card");
    await page.evaluate(() => document.querySelector(".doc-database-app .tbl-wrap").focus());
    await t.combo("Control", "y");
    await t.settle();
    t.check(rowsIn(await t.read())[1]?.[1] === "苏禾" && jsonIn(await t.read()) !== null, "its redo writes the change and the JSON again", databaseIn(await t.read()).slice(0, 200));
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // A write the page refuses (more than one commit holds) of a table with no JSON: nothing of it is left on the
  // page (no empty script put in for it), the file as it was, the drawing as the file says.
  async databaseRefusedWrite(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>
    <div class="doc-database">
      <table>
        <thead><tr><th>任务</th><th>负责人</th></tr></thead>
        <tbody><tr><td>写方案</td><td>林夏</td></tr></tbody>
      </table>
    </div>
    <p>后文</p>`));
    await t.open();
    await drawn(t);
    await t.settle();
    const before = await t.read();
    await clickCell(t, 0, 1);
    await t.press("Enter");
    await page.evaluate(() => {
      const field = document.querySelector(".doc-database-app .cell-editor textarea, .doc-database-app .cell-editor input");
      const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value").set;
      set.call(field, "很长".repeat(600000));
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await t.press("Enter");
    await t.sleep(1500);
    const left = await page.evaluate(() => ({ scripts: document.querySelectorAll(".doc-database > script").length, drawn: document.querySelector('.doc-database-app [data-cell="0-1"]')?.textContent.slice(0, 20) }));
    t.check(left.scripts === 0, "no empty script left on the page", JSON.stringify(left));
    t.check(left.drawn?.includes("林夏"), "the drawing as the file says", JSON.stringify(left));
    t.check((await t.read()) === before, "the file as it was");
    t.takeErrors();
  },

  // JSON an Agent left that does not read, and a table the format cannot hold (a <tfoot>): each drawn read-only
  // with a note saying why, nothing written.
  async databaseReadOnly(t) {
    const { page } = t;
    const broken = TASKS.replace('{ "id": "v2", "name": "推进看板", "layout": "board", "boardBy": "status" }', '{ "id": "v2", "name": "推进看板", "layout": "board", "boardBy": "status" },');
    const footed = `<div class="doc-database">
      <table>
        <thead><tr><th>任务</th><th>估时</th></tr></thead>
        <tbody><tr><td>写方案</td><td>3</td></tr></tbody>
        <tfoot><tr><td>合计</td><td>3</td></tr></tfoot>
      </table>
    </div>`;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${broken}\n    <p>中间</p>\n    ${footed}\n    <p>后文</p>`));
    await t.open();
    await page.waitForFunction(() => document.querySelectorAll(".doc-database-app .db-head").length === 2 && document.documentElement.hasAttribute("data-ge-editing"), { timeout: 15000 });
    await t.sleep(300);
    await t.settle();
    const before = await t.read();
    const notes = await page.evaluate(() => [...document.querySelectorAll(".doc-database-app")].map((app) => app.querySelector(".db-note")?.textContent ?? null));
    t.check(/JSON/.test(notes[0] ?? "") && /只读|只能看/.test(notes[0] ?? ""), "the broken JSON's: read-only, said", JSON.stringify(notes));
    t.check(/tfoot|表尾/.test(notes[1] ?? ""), "the table with a <tfoot>: read-only, said", JSON.stringify(notes));
    await clickCell(t, 0, 0);
    await t.press("Enter");
    await t.type("改");
    await t.press("Enter");
    await t.sleep(1200);
    t.check((await t.read()) === before, "nothing written", databaseIn(await t.read()).slice(0, 200));
    t.takeErrors();
  },

  // A record's title typed in its details (written once the reader pauses), Enter, Ctrl+Z at once: what waits
  // is written first, so the undo takes the title back alone, the change before it kept; Ctrl+Y the title again.
  async databaseUndoPending(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${TASKS}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    await clickCell(t, 0, 5);
    await t.type("13");
    await t.press("Enter");
    await t.settle();
    await page.keyboard.press("Escape");
    await page.evaluate(() => [...document.querySelectorAll(".doc-database-app [data-rowid]")][1].querySelector(".open-btn")?.click());
    await page.waitForSelector(".doc-database-app textarea.peek-title");
    await page.evaluate(() => { const area = document.querySelector(".doc-database-app textarea.peek-title"); area.focus(); area.setSelectionRange(area.value.length, area.value.length); });
    await t.type("（改名）");
    await t.press("Enter");
    await t.combo("Control", "z");
    await t.settle();
    let rows = rowsIn(await t.read());
    t.check(rows[0]?.[5] === "13" && rows[1]?.[0] === "公式引擎", "the undo took back the title alone", JSON.stringify(rows.map((row) => [row[0], row[5]])));
    await t.combo("Control", "y");
    await t.settle();
    rows = rowsIn(await t.read());
    t.check(rows[0]?.[5] === "13" && rows[1]?.[0] === "公式引擎（改名）", "the redo the title again", JSON.stringify(rows.map((row) => [row[0], row[5]])));
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // Words typed in a record's title in its details (written a character at a time) when its parts change under the drawing
  // (as a pull puts someone else's write in): the field keeps what was typed, the drawing shows the change, and
  // what was typed is in the file. (An Agent's write while the reader types: databaseTypingPull.)
  async databasePendingPull(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${TASKS}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    const titleOf = async (row) => {
      await page.evaluate((row) => [...document.querySelectorAll(".doc-database-app [data-rowid]")][row].querySelector(".open-btn")?.click(), row);
      await page.waitForSelector(".doc-database-app textarea.peek-title");
      await page.evaluate(() => { const field = document.querySelector(".doc-database-app textarea.peek-title"); field.focus(); field.setSelectionRange(field.value.length, field.value.length); });
    };
    await titleOf(0);
    await t.type("读者写的");
    // At once, before the pause: another record's cell changed in the table part, as a pull changes it.
    await page.evaluate(() => {
      const cell = [...document.querySelectorAll(".doc-database > table tbody tr")][2].cells[0];
      cell.textContent = "日历视图（拉来的）";
    });
    await t.sleep(200);
    const field = await page.evaluate(() => document.querySelector(".doc-database-app textarea.peek-title")?.value);
    const shown = await page.evaluate(() => document.querySelector(".doc-database > .doc-database-app").textContent.includes("日历视图（拉来的）"));
    await page.evaluate(() => document.activeElement?.blur());
    await t.settle();
    const text = await t.read();
    t.check(field === "登录页改版读者写的" && shown, "the change drawn, the reader's words still in the field", JSON.stringify({ field, shown }));
    t.check(text.includes("登录页改版读者写的"), "what was typed is in the file", databaseIn(text).slice(0, 700));
    t.takeErrors();
  },

  // A database in a custom block. In the block's own region (its template's: no unit of the document's, which
  // no commit could write) the kit draws none, its table shown as the file has it, and nothing of it is
  // written (the drawing would say it reads only, and the page refuses its writes, were one drawn there); in
  // the block's slot (the document's again) it is drawn, edited and saved as anywhere.
  async databaseInBlock(t) {
    const { page } = t;
    const folder = path.join(t.root, "reports", "components", "local", "brief");
    await fs.cp(path.join(projectRoot, "tests", "fixtures", "components", "local", "brief"), folder, { recursive: true });
    const small = (title) => `<div class="doc-database">
        <script type="application/json">{ "columns": [{ "id": "t", "name": "任务", "type": "title" }, { "id": "n", "name": "估时", "type": "number" }], "views": [{ "id": "v1", "layout": "table" }] }</script>
        <table>
          <thead><tr><th data-column="t">任务</th><th data-column="n">估时</th></tr></thead>
          <tbody><tr><td>${title}</td><td>1</td></tr></tbody>
        </table>
      </div>`;
    try {
      const { origin } = new URL(t.home());
      const ready = async () => (await (await fetch(`${origin}/__gallery/workspace/components`)).json()).packages.some(({ id, state }) => id === "local/brief" && state === "normal");
      for (let tries = 0; tries < 60 && !(await ready()); tries++) await t.sleep(250);
      await t.agentEdit(pageOf("任务", `<p>前文</p>
    <div class="brief" data-doc-component="local/brief">
      <h3>要点</h3>
      ${small("块里的")}
      <div class="brief-body" data-doc-slot="body">
      ${small("槽里的")}
      </div>
    </div>
    <p>后文</p>`));
      await t.open();
      await drawn(t);
      await t.sleep(500);
      await t.settle();
      const seen = await page.evaluate(() => [...document.querySelectorAll(".doc-database")].map((host) => ({ title: host.querySelector("td")?.textContent, drawn: Boolean(host.querySelector(":scope > .doc-database-app")), note: host.querySelector(".db-note")?.textContent ?? null, table: host.querySelector(":scope > table").getClientRects().length > 0 })));
      t.check(seen.length === 2 && seen[0].title === "块里的" && !seen[0].drawn && seen[0].table, "in the block's own region none is drawn: its table as the file has it", JSON.stringify(seen));
      t.check(seen[1]?.title === "槽里的" && seen[1].drawn && seen[1].note === null, "in its slot it is drawn, with no note", JSON.stringify(seen));
      // The own one's cell pressed and typed in: the block's region, nothing of it written.
      const box = await page.evaluate(() => {
        const cell = document.querySelectorAll(".doc-database")[0].querySelector("tbody td");
        const rect = cell.getBoundingClientRect();
        return { x: rect.left + 10, y: rect.top + rect.height / 2 };
      });
      await page.mouse.click(box.x, box.y);
      await t.type("9");
      await t.sleep(1200);
      t.check(/<td>块里的<\/td><td>1<\/td>/.test(await t.read()), "the own one's table is not written", "");
      const cell = await page.evaluate(() => {
        const node = document.querySelectorAll(".doc-database-app")[0].querySelector('[data-cell="0-1"]');
        node.scrollIntoView({ block: "center" });
        const rect = node.getBoundingClientRect();
        return { x: rect.left + 20, y: rect.top + rect.height / 2 };
      });
      await page.mouse.click(cell.x, cell.y);
      await t.sleep(150);
      await t.type("5");
      await t.press("Enter");
      await t.settle();
      const text = await t.read();
      t.check(/<td>槽里的<\/td><td>5<\/td>/.test(text) && /<td>块里的<\/td><td>1<\/td>/.test(text), "the slot's edited and saved, the own one as it was", databaseIn(text.slice(text.indexOf('data-doc-slot="body"'))).slice(0, 300));
      t.takeErrors();
    } finally {
      await fs.rm(folder, { recursive: true, force: true });
      await t.sleep(1500);
    }
  },
  // A database as a team writes one (tests/fixtures/database/sample.mjs: 18 records, 14 columns, 7 views), its
  // urls and a title and notes long runs of more than 20 characters: the kit's passes over the page's text
  // leave it alone (no span in its parts or its drawing), it is editable with no note, and a cell's change
  // goes in leaving every other cell as it was.
  async databaseLongRuns(t) {
    const { page } = t;
    await t.agentEdit(pageOf("产品迭代任务", `<p>规格在 https://example.com/spec/database-block-overview 里。</p>\n    ${SAMPLE}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    await t.sleep(500);
    await t.settle();
    const seen = await page.evaluate(() => ({
      inDatabase: document.querySelectorAll(".doc-database .doc-long-run, .doc-database .doc-range, .doc-database .katex").length,
      note: document.querySelector(".doc-database-app .db-note")?.textContent ?? null,
      add: Boolean(document.querySelector(".doc-database-app .tab-add")),
    }));
    t.check(seen.inDatabase === 0, "nothing of the kit's in the database", JSON.stringify(seen));
    t.check(seen.note === null && seen.add, "editable, no note", JSON.stringify(seen));
    const before = rowsIn(await t.read());
    await clickCell(t, 0, 0);
    await t.press("Enter");
    await t.combo("Control", "a");
    await t.type("登录页改版（二期）");
    await t.press("Enter");
    await t.settle();
    const after = rowsIn(await t.read());
    const changed = after.flatMap((row, at) => row.map((cell, index) => [at, index, cell]).filter(([, index, cell]) => cell !== before[at]?.[index]));
    t.check(after.length === 18 && changed.length === 1 && changed[0][2] === "登录页改版（二期）", "one cell changed, every other as it was (urls, the long words)", JSON.stringify(changed));
    t.check(after.some((row) => row.includes("https://example.com/spec/formula")) && after.some((row) => row[0] === "使用说明 GettingStartedWithTheDatabaseBlockGuide"), "the urls and the long title as written", "");
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },
  // A column's name typed in its header (each character written at once, the typing one step of undo), Esc,
  // and Ctrl+Z at once with the focus on the page: the undo takes back the name, the cell changed before it
  // kept; Ctrl+Y gives the name again.
  async databaseRenameUndo(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${TASKS}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    await clickCell(t, 0, 5);
    await t.type("13");
    await t.press("Enter");
    await t.settle();
    await page.keyboard.press("Escape");
    // The header pressed (where it stands, the table not scrolled under its frozen first column): its name typed in.
    const head = await page.evaluate(() => {
      for (const wrap of document.querySelectorAll(".doc-database-app .tbl-wrap")) wrap.scrollLeft = 0;
      const node = document.querySelector('.doc-database-app [data-head="owner"]');
      node.scrollIntoView({ block: "center", inline: "nearest" });
      const rect = node.getBoundingClientRect();
      const at = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      return { ...at, hit: document.elementFromPoint(at.x, at.y)?.closest("[data-head]")?.getAttribute("data-head") };
    });
    t.check(head.hit === "owner", "the owner header under the pointer", JSON.stringify(head));
    await page.mouse.click(head.x, head.y);
    await page.waitForSelector(".doc-database-app .th-input");
    await page.evaluate(() => { const node = document.querySelector(".doc-database-app .th-input"); node.focus(); node.setSelectionRange(node.value.length, node.value.length); });
    await t.type("X");
    await page.keyboard.press("Escape");
    await t.sleep(50);
    await page.evaluate(() => document.activeElement?.blur?.());
    await t.combo("Control", "z");
    await t.settle();
    const heads = (text) => [...databaseIn(text).matchAll(/<th data-column="owner">([^<]*)<\/th>/g)].map((found) => found[1]).join();
    let text = await t.read();
    t.check(rowsIn(text)[0]?.[5] === "13" && heads(text) === "负责人", "the undo took back the name alone", JSON.stringify({ est: rowsIn(text)[0]?.[5], head: heads(text) }));
    await t.combo("Control", "y");
    await t.settle();
    text = await t.read();
    t.check(rowsIn(text)[0]?.[5] === "13" && heads(text) === "负责人X", "the redo the name again", JSON.stringify({ est: rowsIn(text)[0]?.[5], head: heads(text), page: await page.evaluate(() => document.querySelector('.doc-database > table th[data-column="owner"]')?.textContent), focus: await page.evaluate(() => document.activeElement?.tagName + "." + document.activeElement?.className), state: await t.state(), say: await t.status() }));
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // A title typed a character at a time in a record's details while an Agent writes another record of the same
  // database: no character typed is lost and the page is not loaded again: the words are in the file, with the
  // Agent's change, or a conflict card holds them and 仍然调整 writes them.
  async databaseTypingPull(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${TASKS}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    await page.evaluate(() => { window.__stayed = true; });
    await page.evaluate(() => document.querySelector(".doc-database-app [data-rowid] .open-btn")?.click());
    await page.waitForSelector(".doc-database-app textarea.peek-title");
    await page.evaluate(() => { const field = document.querySelector(".doc-database-app textarea.peek-title"); field.focus(); field.setSelectionRange(field.value.length, field.value.length); });
    const words = "读者一直在写的标题内容";
    for (const [at, character] of [...words].entries()) {
      await page.keyboard.sendCharacter(character);
      await t.sleep(150);
      if (at === 3) await t.agentEdit((text) => text.replace("<td>日历视图</td>", "<td>日历视图（Agent）</td>"));
    }
    await t.sleep(2500);
    const stayed = await page.evaluate(() => window.__stayed === true);
    t.check(stayed, "the page not loaded again", "");
    if (await page.$(".ge-conflict")) {
      await page.waitForFunction(() => [...document.querySelectorAll(".ge-conflict button")].some((node) => node.textContent === "仍然调整" && !node.disabled), { timeout: 10000 });
      await page.evaluate(() => [...document.querySelectorAll(".ge-conflict button")].find((node) => node.textContent === "仍然调整").click());
    }
    await page.evaluate(() => document.activeElement?.blur?.());
    await t.settle();
    const text = await t.read();
    t.check(text.includes(words), "every character typed in the file", databaseIn(text).slice(0, 500));
    t.takeErrors();
  },

  // An Agent's table with attributes that change nothing it holds (scope, class, id, title, data-*): editable
  // with no note, a cell's change keeping its attributes and every other row's and cell's as they were.
  async databaseAttributes(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>
    <div class="doc-database">
      <script type="application/json">{ "columns": [{ "id": "t", "name": "任务", "type": "title" }, { "id": "n", "name": "估时", "type": "number" }], "views": [{ "id": "v1", "layout": "table" }] }</script>
      <table>
        <thead><tr><th scope="col" data-column="t">任务</th><th scope="col" title="小时" data-column="n">估时</th></tr></thead>
        <tbody id="records"><tr class="row" data-id="a"><td class="name">写方案</td><td data-unit="h">3</td></tr><tr><td>评审</td><td class="num">5</td></tr></tbody>
      </table>
    </div>
    <p>后文</p>`));
    await t.open();
    await drawn(t);
    t.check(!(await page.$(".doc-database-app .db-note")), "editable, no note");
    await clickCell(t, 0, 1);
    await t.type("4");
    await t.press("Enter");
    await t.settle();
    const text = databaseIn(await t.read());
    t.check(text.includes('<td data-unit="h">4</td>') && text.includes('<tr class="row" data-id="a"><td class="name">写方案</td>') && text.includes('<tr><td>评审</td><td class="num">5</td></tr>') && text.includes('<tbody id="records">') && text.includes('<th scope="col" title="小时" data-column="n">估时</th>'), "the change in, every attribute kept", text);
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },
  // What a database's drawing holds back unwritten (doc-holding on its host: a column's width while it is
  // dragged) counts as unsaved (data-ge-save is not "saved"), keeps the page from being shown again for an
  // Agent's write, and is asked for (doc-flush) before an undo and as the page is hidden; the drag's width is
  // written as it ends.
  async databaseHolding(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${TASKS}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    await t.settle();
    const save = () => page.evaluate(() => document.documentElement.getAttribute("data-ge-save"));
    // A column's width dragged: held back while the pointer is down, written as it is let go.
    const grip = await page.evaluate(() => {
      const node = document.querySelector('.doc-database-app [data-head="owner"] .resizer');
      const rect = node.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    await page.mouse.move(grip.x, grip.y);
    await page.mouse.down();
    await page.mouse.move(grip.x + 60, grip.y, { steps: 4 });
    await t.sleep(300);
    const during = await save();
    await page.mouse.up();
    await t.settle();
    const width = jsonIn(await t.read())?.columns?.find((column) => column.id === "owner")?.width;
    t.check(during !== "saved" && width > 0, "a drag held back counts as unsaved, and is written as it ends", JSON.stringify({ during, width }));
    // Held back as a drawing says it: the page asks for it before an undo and as it is hidden, and is not shown again meanwhile.
    await page.evaluate(() => {
      window.__stayed = true;
      window.__flushed = 0;
      const host = document.querySelector(".doc-database");
      host.addEventListener("doc-flush", () => {
        window.__flushed++;
        host.dispatchEvent(new CustomEvent("doc-holding", { bubbles: true, detail: false }));
      });
      host.dispatchEvent(new CustomEvent("doc-holding", { bubbles: true, detail: true }));
    });
    await t.sleep(200);
    const held = await save();
    await t.agentEdit((text) => text.replace("<p>后文</p>", "<p>后文（Agent）</p>"));
    await t.sleep(2500);
    const stayed = await page.evaluate(() => window.__stayed === true);
    t.check(held !== "saved" && stayed, "held back: unsaved, the page not shown again for the Agent's write", JSON.stringify({ held, stayed }));
    await page.evaluate(() => document.activeElement?.blur?.());
    await t.combo("Control", "z");
    await t.sleep(300);
    const afterUndo = await page.evaluate(() => window.__flushed);
    await page.evaluate(() => {
      document.querySelector(".doc-database").dispatchEvent(new CustomEvent("doc-holding", { bubbles: true, detail: true }));
      window.dispatchEvent(new Event("pagehide"));
    });
    const afterHide = await page.evaluate(() => window.__flushed);
    t.check(afterUndo >= 1 && afterHide > afterUndo, "asked to write it before the undo and as the page is hidden", JSON.stringify({ afterUndo, afterHide }));
    t.takeErrors();
  },
  // The drawing's look and the user's first comments on it (2026-11-23): the tools whose rule is on say so by their
  // icon's color alone (no fill); a filter of buttons has a line around it and its chosen button a neutral fill, no
  // blue; the view's settings are a card of Gallery's menu (about 250px, gray small headings, no ×, switches); adding a
  // view lists the layouts with no gray words under them; a tab's right click opens its menu as a click on the one
  // shown does; a header pressed edits its name over its words exactly (no shift of the words or of the header);
  // 新建属性 past the last column lists the view's hidden columns first; focus rings drawn inside what clips them;
  // the tabs fading where they overflow, with no bounce (its bottom scrollbar giving way at an end: scrollSqueezeDatabase).
  async databaseNativeLook(t) {
    const { page } = t;
    await t.agentEdit(pageOf("产品迭代任务", `<p>前文</p>\n    ${SAMPLE}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    // The tools: with a filter on, the filter tool's icon in the accent, no fill.
    const tool = await page.evaluate(() => {
      const button = document.querySelector(".doc-database-app .tool-filter");
      const style = getComputedStyle(button);
      return { accent: button.classList.contains("accent"), fill: style.backgroundColor, color: style.color, accentColor: getComputedStyle(document.documentElement).getPropertyValue("--doc-accent").trim() };
    });
    t.check(tool.accent && /rgba\(0, 0, 0, 0\)|transparent/.test(tool.fill), "a tool whose rule is on: its icon in the accent, no fill", JSON.stringify(tool));
    // The filter of buttons: one light fill, no line; its chosen button a neutral near-white, raised by no shadow, its
    // words medium.
    const segments = await page.evaluate(() => {
      const bar = document.querySelector(".doc-database-app .segments");
      const on = bar?.querySelector(".seg-btn.on");
      return bar && { line: getComputedStyle(bar).boxShadow, border: getComputedStyle(bar).borderStyle, fill: getComputedStyle(bar).backgroundColor, on: on && getComputedStyle(on).backgroundColor, onShadow: on && getComputedStyle(on).boxShadow, weight: on && getComputedStyle(on).fontWeight };
    });
    const [r, g, b] = (segments?.on ?? "").match(/\d+/g)?.map(Number) ?? [];
    const [fr, fg, fb, fa] = (segments?.fill ?? "").match(/[\d.]+/g)?.map(Number) ?? [];
    t.check(segments && segments.line === "none" && segments.border === "none" && fa > 0 && fa <= 0.05 && Math.max(fr, fg, fb) - Math.min(fr, fg, fb) <= 12 && r === 255 && g === 255 && b === 255 && segments.onShadow === "none" && segments.weight === "500", "the filter of buttons: a light fill and no line, its chosen button near-white (no blue, no shadow), its words medium", JSON.stringify(segments));
    // The view's settings: Gallery's menu card.
    await clickOn(t, ".doc-database-app .tool-settings");
    const settings = await page.evaluate(() => {
      const card = document.querySelector(".doc-database-app .popover");
      const weights = [...card.querySelectorAll(".menu-label-row, .page-title")].map((node) => getComputedStyle(node).fontWeight);
      const wide = card.getBoundingClientRect().width;
      return { width: wide, weights, close: [...card.querySelectorAll("button")].some((node) => /关闭|×/.test(node.getAttribute("aria-label") ?? node.textContent)), switches: card.querySelectorAll(".switch").length };
    });
    t.check(settings.width >= 236 && settings.width <= 264 && settings.weights.every((weight) => Number(weight) <= 500) && !settings.close && settings.switches >= 3, "the view's settings: a card of Gallery's menu width, gray small headings, no ×, switches for what is on or off", JSON.stringify(settings));
    await t.press("Escape");
    await t.sleep(200);
    // Adding a view: the layouts as a grid of cards (the view settings' 布局's look), their names alone.
    await page.evaluate(() => document.querySelector(".doc-database-app .tab-add").click());
    await t.sleep(300);
    const layouts = await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .popover .add-view-grid .layout-btn")].map((row) => row.textContent.trim()));
    t.check(JSON.stringify(layouts) === JSON.stringify(["表格", "看板", "列表", "卡片", "日历", "图表"]), "添加视图: the six layouts as cards, by their names, no gray words", JSON.stringify(layouts));
    await t.press("Escape");
    await t.sleep(200);
    // A tab's right click: its menu, as a click on the one shown.
    const tab = await page.evaluate(() => {
      const node = [...document.querySelectorAll(".doc-database-app .tab")][2];
      node.scrollIntoView({ block: "center", inline: "nearest" });
      const rect = node.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, name: node.textContent.trim() };
    });
    await page.mouse.click(tab.x, tab.y, { button: "right" });
    await t.sleep(300);
    const tabMenu = await page.evaluate(() => ({ rows: [...document.querySelectorAll(".doc-database-app .popover .menu-item")].map((row) => row.textContent.trim()), on: document.querySelector(".doc-database-app .tab.on")?.textContent.trim() }));
    t.check(tabMenu.rows.includes("重命名") && tabMenu.rows.includes("删除视图") && tabMenu.on === tab.name, "a tab's right click: that view shown and its menu open", JSON.stringify(tabMenu));
    await t.press("Escape");
    await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .tab")][0].click());
    await t.sleep(300);
    // A header pressed: its name typed where it stands, the words and the header not moved by a pixel.
    const before = await page.evaluate(() => {
      for (const wrap of document.querySelectorAll(".doc-database-app .tbl-wrap")) wrap.scrollLeft = 0;
      const head = document.querySelector('.doc-database-app [data-head="owner"]');
      head.scrollIntoView({ block: "center", inline: "nearest" });
      const name = head.querySelector(".th-name").getBoundingClientRect();
      const next = head.nextElementSibling.getBoundingClientRect();
      return { x: name.left + name.width / 2, y: name.top + name.height / 2, left: name.left, top: name.top, height: name.height, head: head.getBoundingClientRect().width, next: next.left };
    });
    await page.mouse.click(before.x, before.y);
    await page.waitForSelector(".doc-database-app .th-input");
    const after = await page.evaluate(() => {
      const head = document.querySelector('.doc-database-app [data-head="owner"]');
      const input = head.querySelector(".th-input");
      const range = document.createRange();
      range.selectNodeContents(head.querySelector(".th-input"));
      const words = range.getBoundingClientRect();
      const style = getComputedStyle(input);
      const label = getComputedStyle(head.querySelector(".th-input-wrap"));
      return { left: input.getBoundingClientRect().left, top: input.getBoundingClientRect().top, height: input.getBoundingClientRect().height, wordsLeft: words.left, font: style.font, labelFont: label.font, head: head.getBoundingClientRect().width, next: head.nextElementSibling.getBoundingClientRect().left };
    });
    t.check(Math.abs(after.left - before.left) < 0.5 && Math.abs(after.top - before.top) < 0.5 && Math.abs(after.height - before.height) < 0.5 && after.font === after.labelFont && Math.abs(after.head - before.head) < 0.5 && Math.abs(after.next - before.next) < 0.5,
      "a header's name typed where it stands: the field over its words exactly, the header and the next one not moved", JSON.stringify({ before, after }));
    await t.press("Escape");
    await t.sleep(200);
    // 新建属性 past the last column: the view's hidden columns first, shown again with a click.
    await page.evaluate(() => {
      const wrap = document.querySelector(".doc-database-app .tbl-wrap");
      wrap.scrollLeft = wrap.scrollWidth;
    });
    await t.sleep(200);
    await page.evaluate(() => document.querySelector(".doc-database-app .fill-add").click());
    await t.sleep(300);
    const add = await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .popover > *")].map((node) => node.textContent.trim()).slice(0, 6));
    t.check(add[0] === "隐藏的属性" && add.slice(1).some((words) => words.startsWith("用户价值")), "新建属性: the hidden columns listed first", JSON.stringify(add));
    await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .popover .hidden-prop")].find((row) => row.textContent.includes("用户价值")).click());
    await t.settle();
    const shown = await page.evaluate(() => [...document.querySelectorAll(".doc-database-app [data-head]")].map((head) => head.textContent.trim()));
    t.check(shown.some((name) => name.includes("用户价值")), "a click shows it again", JSON.stringify(shown));
    // Focus rings inside what clips them.
    const ring = await page.evaluate(() => [...document.styleSheets].flatMap((sheet) => { try { return [...sheet.cssRules]; } catch { return []; } }).filter((rule) => rule.selectorText?.includes(".doc-database-app :focus-visible")).map((rule) => rule.style.outlineOffset));
    t.check(ring.includes("-2px"), "a focus ring is drawn inside what it rings (nothing clips it)", JSON.stringify(ring));
    await t.press("Escape");
    // The tabs in a narrow window: they scroll with no bounce, fading where tabs lie past an end.
    await page.setViewport({ width: 900, height: 900 });
    await t.sleep(400);
    const fades = async () => page.evaluate(() => {
      const tabs = document.querySelector(".doc-database-app .tabs");
      return { start: tabs.classList.contains("more-start"), end: tabs.classList.contains("more-end"), overflows: tabs.scrollWidth > tabs.clientWidth, bounce: getComputedStyle(tabs).overscrollBehaviorX };
    });
    const atStart = await fades();
    await page.evaluate(() => { const tabs = document.querySelector(".doc-database-app .tabs"); tabs.scrollLeft = tabs.scrollWidth; });
    await t.sleep(200);
    const atEnd = await fades();
    t.check(atStart.overflows && !atStart.start && atStart.end && atEnd.start && !atEnd.end && atStart.bounce === "none", "the tabs overflowing: a fade at the end tabs lie past, none at the other, no bounce", JSON.stringify({ atStart, atEnd }));
    await page.setViewport({ width: 1440, height: 900 });
    await shoot(t, "native-look");
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // A record's details (the user's comments of 2026-11-23): no bar of their own; closing them, the record before and
  // after and which one it is in a small bar at their top right, no ··· there; their left edge dragged changes their
  // width from where it was pressed (no jump), pressed alone it puts them away; they stand in the top layer (nothing of
  // the page over them), the menus they open over them.
  async databasePeek(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${TASKS}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    await page.evaluate(() => document.querySelectorAll(".doc-database-app [data-rowid] .open-btn")[1].click());
    await page.waitForSelector(".doc-database-app .peek, .doc-database-pages[data-doc-peek]");
    await t.sleep(300);
    const peek = await page.evaluate(() => {
      const panel = document.querySelector(".doc-database-app .peek, .doc-database-pages[data-doc-peek]");
      const nav = panel.querySelector(".peek-nav");
      return { top: panel.matches(":popover-open"), bar: Boolean(panel.querySelector(".peek-top")), nav: nav?.querySelector(".peek-count")?.textContent.trim(), more: [...panel.querySelectorAll(".doc-database-app button")].some((node) => /更多/.test(node.getAttribute("aria-label") ?? "")), navRight: panel.getBoundingClientRect().right - nav.getBoundingClientRect().right, navTop: nav.getBoundingClientRect().top - panel.getBoundingClientRect().top };
    });
    t.check(peek.top && !peek.bar && peek.nav === "2 / 3" && !peek.more && peek.navRight < 30 && peek.navTop < 30, "the details: in the top layer, no bar, the small bar of before, after and 2 / 3 at their top right, no ···", JSON.stringify(peek));
    // A label's menu opened over them (in the top layer after them).
    await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .peek-label")].find((node) => node.textContent.includes("状态")).click());
    await t.sleep(300);
    const over = await page.evaluate(() => {
      const card = document.querySelector(".doc-database-app .popover");
      if (!card) return null;
      const box = card.getBoundingClientRect();
      const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return { open: card.matches(":popover-open"), onTop: card.contains(top) };
    });
    t.check(over?.open && over.onTop, "a label's menu stands over the details", JSON.stringify(over));
    await t.press("Escape");
    await t.sleep(200);
    await t.press("ArrowDown");
    await t.sleep(250);
    t.check((await page.evaluate(() => document.querySelector(".doc-database-app .peek-title").value)) === "日历视图", "↓: the record after");
    // The edge dragged: no jump as it starts, the width following the pointer.
    const edge = await page.evaluate(() => {
      const node = document.querySelector(".doc-database-app .peek-edge");
      const rect = node.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + 200, width: document.querySelector(".doc-database-app .peek, .doc-database-pages[data-doc-peek]").getBoundingClientRect().width };
    });
    await page.mouse.move(edge.x, edge.y);
    await page.mouse.down();
    await page.mouse.move(edge.x + 4, edge.y);
    const small = await page.evaluate(() => document.querySelector(".doc-database-app .peek, .doc-database-pages[data-doc-peek]").getBoundingClientRect().width);
    await page.mouse.move(edge.x - 60, edge.y, { steps: 4 });
    const wide = await page.evaluate(() => document.querySelector(".doc-database-app .peek, .doc-database-pages[data-doc-peek]").getBoundingClientRect().width);
    await page.mouse.up();
    await t.sleep(200);
    t.check(Math.abs(small - (edge.width - 4)) <= 1 && Math.abs(wide - (edge.width + 60)) <= 1, "the edge dragged: its width follows the pointer from where it was pressed, no jump", JSON.stringify({ edge, small, wide }));
    // Pressed alone: put away.
    const at = await page.evaluate(() => { const rect = document.querySelector(".doc-database-app .peek-edge").getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + 300 }; });
    await page.mouse.click(at.x, at.y);
    await t.sleep(300);
    t.check(!(await page.$(".doc-database-app .peek, .doc-database-pages[data-doc-peek]")), "the edge pressed alone puts the details away");
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },
  // The table view's tools: the arrows move the selection (Shift grows it), cells pasted as words between tabs and lines
  // (a spreadsheet's: quoted words over lines, \r\n) from the selection on, new records where it runs past the last;
  // Ctrl+D fills down; Delete clears; the + in the room left of the rows puts a record in after a row (its title
  // edited); a row's handle dragged moves it; a header dragged moves its column; the calculation row's sum, written into
  // the view; grouped by a select, a heading row per group folded by a click. Each change one step of undo.
  async databaseTableTools(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${TASKS}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    const frameOf = () => page.evaluate(() => {
      const sel = document.querySelector(".doc-database-app .td.cursor");
      const cell = (r, c) => document.querySelector(`.doc-database-app [data-cell="${r}-${c}"]`).getBoundingClientRect();
      const box = sel?.getBoundingClientRect() ?? { top: -1, bottom: -1, left: -1 };
      const a = cell(2, 2);
      return { hidden: !sel, top: box.top, bottom: box.bottom, left: box.left, a: { top: a.top, left: a.left } };
    });
    // The arrows: from 0-1 down two and right one, Shift+↑ grows it up one.
    await clickCell(t, 0, 1);
    await t.press("ArrowDown");
    await t.press("ArrowDown");
    await t.press("ArrowRight");
    let seen = await frameOf();
    t.check(!seen.hidden && Math.abs(seen.top - seen.a.top) <= 2 && Math.abs(seen.left - seen.a.left) <= 2, "the arrows move the selection: the cell two down and one right framed", JSON.stringify(seen));
    // A paste of a spreadsheet's words from 1-0: quoted words over two lines, \r\n between rows, a row past the last made.
    await clickCell(t, 1, 0);
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData("text/plain", '"公式引擎\n（二期）"\t已完成\r\n新任务\t进行中\r\n');
      document.querySelector(".doc-database-app .tbl-wrap").dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await t.settle();
    let rows = rowsIn(await t.read());
    t.check(rows.length === 3 && rows[1][0] === "公式引擎<br>（二期）" && rows[1][1] === "已完成" && rows[2][0] === "新任务" && rows[2][1] === "进行中", "a spreadsheet's cells pasted from the selection on (a cell's lines kept, \\r\\n between rows)", JSON.stringify(rows));
    await clickCell(t, 2, 0);
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData("text/plain", "第三行\t待开始\n第四行\t已完成");
      document.querySelector(".doc-database-app .tbl-wrap").dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await t.settle();
    rows = rowsIn(await t.read());
    t.check(rows.length === 4 && rows[3][0] === "第四行" && rows[3][1] === "已完成", "a paste past the last record makes a new one", JSON.stringify(rows.map((row) => row.slice(0, 2))));
    // Ctrl+D: the first row's status down the two below it.
    await clickCell(t, 0, 1);
    await page.keyboard.down("Shift");
    await clickCell(t, 2, 1);
    await page.keyboard.up("Shift");
    await t.combo("Control", "d");
    await t.settle();
    rows = rowsIn(await t.read());
    t.check(rows[1][1] === rows[0][1] && rows[2][1] === rows[0][1] && rows[3][1] === "已完成", "Ctrl+D fills down the selection", JSON.stringify(rows.map((row) => row[1])));
    // Delete clears.
    const owner = rowsIn(await t.read())[3][2];
    await clickCell(t, 3, 2);
    await t.press("Delete");
    await t.settle();
    t.check(rowsIn(await t.read())[3][2] === "", "Delete clears the cell", JSON.stringify(rowsIn(await t.read())[3]));
    // One undo: the clear back.
    await page.evaluate(() => document.querySelector(".doc-database-app .tbl-wrap").focus());
    await t.combo("Control", "z");
    await t.settle();
    rows = rowsIn(await t.read());
    t.check(rows[3][2] === owner && rows[1][1] === rows[0][1], "one undo takes the clear back alone", JSON.stringify(rows.map((row) => row.slice(0, 3))));
    // The + after the first row: a record put in there, its title edited.
    const edge = await page.evaluate(() => {
      const row = document.querySelector('.doc-database-app [data-cell="0-0"]').getBoundingClientRect();
      return { x: row.left - 16, y: row.bottom - 3, bottom: row.bottom };
    });
    await page.mouse.move(edge.x, edge.y);
    await t.sleep(200);
    const plus = await page.evaluate((bottom) => {
      const nodes = [...document.querySelectorAll(".doc-database-app .edge-plus")].map((node) => node.getBoundingClientRect());
      const after = nodes.find((rect) => Math.abs(rect.top + rect.height / 2 - bottom) < 3);
      return after ? { x: after.left + after.width / 2, y: after.top + after.height / 2 } : null;
    }, edge.bottom);
    t.check(Boolean(plus), "the pointer in the room left of the rows: a + at the nearest row edge", JSON.stringify(plus));
    if (plus) {
      await page.mouse.move(plus.x, plus.y);
      await t.sleep(150);
      await page.mouse.down();
      await page.mouse.up();
      await t.sleep(300);
      await t.type("插进来的");
      await t.press("Enter");
      await t.settle();
      rows = rowsIn(await t.read());
      t.check(rows.length === 5 && rows[1][0] === "插进来的", "the + put a record in after the first, its title typed at once", JSON.stringify(rows.map((row) => row[0])));
    }
    // A row's handle dragged: the first record below the third.
    await page.keyboard.press("Escape");
    const grip = await page.evaluate(() => {
      const first = document.querySelector('.doc-database-app [data-cell="0-0"]').getBoundingClientRect();
      const third = document.querySelector('.doc-database-app [data-cell="2-0"]').getBoundingClientRect();
      return { x: first.left + 40, y: first.top + first.height / 2, to: third.top + third.height * 0.8 };
    });
    await page.mouse.move(grip.x, grip.y);
    await t.sleep(200);
    const handle = await page.evaluate(() => {
      const node = document.querySelector('.doc-database-app [data-cell="0-0"]').parentElement.querySelector(".row-handle");
      const rect = node?.getBoundingClientRect();
      return rect && getComputedStyle(node).opacity === "1" ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
    });
    t.check(Boolean(handle), "the row's handle shows in the room at its left", JSON.stringify(handle));
    if (handle) {
      const before = rowsIn(await t.read()).map((row) => row[0]);
      await page.mouse.move(handle.x, handle.y);
      await page.mouse.down();
      await page.mouse.move(handle.x, handle.y + 10, { steps: 2 });
      await page.mouse.move(handle.x, grip.to, { steps: 6 });
      const ghost = await page.evaluate(() => Boolean(document.querySelector(".doc-database-app .tghost")) && Boolean(document.querySelector(".doc-database-app .tr.drop-before, .doc-database-app .tr.drop-after")));
      await page.mouse.up();
      await t.settle();
      const after = rowsIn(await t.read()).map((row) => row[0]);
      t.check(ghost && after[2] === before[0] && after[0] === before[1], "dragged by its handle (a ghost and a line where it lands meanwhile), the row moves below the third", JSON.stringify({ ghost, before, after }));
      // Clicked, the handle picks its row: every cell of it lit, none framed as the keys' place, its menu open
      // (the user's 2026-11-24: the first cell's frame stayed and the row was not lit).
      await page.mouse.click(grip.x + 30, grip.y);
      await t.sleep(150);
      await page.mouse.move(grip.x, grip.y);
      await t.sleep(200);
      const again = await page.evaluate(() => { const rect = document.querySelector('.doc-database-app [data-cell="0-0"]').parentElement.querySelector(".row-handle").getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; });
      await page.mouse.click(again.x, again.y);
      await t.sleep(250);
      const picked = await page.evaluate(() => {
        const cells = [...document.querySelector('.doc-database-app [data-cell="0-0"]').parentElement.querySelectorAll(".td[data-cell]")];
        return { lit: cells.filter((cell) => cell.classList.contains("in-sel")).length, cells: cells.length, framed: document.querySelectorAll(".doc-database-app .td.cursor").length, menu: Boolean(document.querySelector(".doc-database-app .popover")) };
      });
      t.check(picked.lit === picked.cells && picked.framed === 0 && picked.menu, "the handle clicked: its row lit across, no cell framed, its menu open", JSON.stringify(picked));
      await page.keyboard.press("Escape");
      await t.sleep(150);
    }
    // A header dragged: 负责人 past 标签.
    const heads = await page.evaluate(() => {
      for (const wrap of document.querySelectorAll(".doc-database-app .tbl-wrap")) wrap.scrollLeft = 0;
      const owner = document.querySelector('.doc-database-app [data-head="owner"]').getBoundingClientRect();
      const tags = document.querySelector('.doc-database-app [data-head="tags"]').getBoundingClientRect();
      return { x: owner.left + 20, y: owner.top + owner.height / 2, to: tags.right - 10 };
    });
    await page.mouse.move(heads.x, heads.y);
    await page.mouse.down();
    await page.mouse.move(heads.x + 10, heads.y, { steps: 2 });
    await page.mouse.move(heads.to, heads.y, { steps: 6 });
    await page.mouse.up();
    await t.settle();
    const order = jsonIn(await t.read()).columns.map((column) => column.id);
    t.check(order.indexOf("owner") === order.indexOf("tags") + 1, "a header dragged moves its column", JSON.stringify(order));
    // The calculation row: shown from the settings, 估时's sum, written into the view.
    await clickOn(t, ".doc-database-app .tool-settings");
    await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .popover .check-item")].find((row) => row.textContent.includes("显示计算行")).click());
    await t.press("Escape");
    await t.settle();
    await page.evaluate(() => {
      const cell = [...document.querySelectorAll(".doc-database-app .calc-row .calc-cell")][[...document.querySelectorAll(".doc-database-app [data-head]")].findIndex((head) => head.dataset.head === "est")];
      cell.scrollIntoView({ block: "center", inline: "center" });
      cell.click();
    });
    await t.sleep(300);
    await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .popover .menu-item")].find((row) => row.textContent.trim() === "求和").click());
    await t.settle();
    const view = jsonIn(await t.read()).views[0];
    const sum = await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .calc-row .calc-cell")].map((cell) => cell.textContent.trim()).find((words) => words.startsWith("求和")));
    t.check(view.showCalc === true && view.calc?.est === "sum" && /求和\s*\d/.test(sum ?? ""), "the calculation row: shown, 估时's sum worked out, both in the view", JSON.stringify({ calc: view.calc, showCalc: view.showCalc, sum }));
    // Grouped by 状态: a heading row per group, folded by a click.
    await clickOn(t, ".doc-database-app .tool-settings");
    await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .popover .menu-item")].find((row) => row.textContent.includes("分组")).click());
    await t.sleep(200);
    await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .popover .menu-item")].find((row) => row.textContent.trim() === "状态").click());
    await t.press("Escape");
    await t.settle();
    const groups = await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .group-row")].map((row) => row.textContent.trim()));
    t.check(groups.length >= 2 && jsonIn(await t.read()).views[0].groupBy === "status", "grouped by 状态: a heading row per group, in the view", JSON.stringify(groups));
    const shownBefore = await page.evaluate(() => document.querySelectorAll(".doc-database-app .tr[data-rowid]").length);
    await page.evaluate(() => document.querySelector(".doc-database-app .group-row .group-head").click());
    await t.sleep(200);
    const shownAfter = await page.evaluate(() => document.querySelectorAll(".doc-database-app .tr[data-rowid]").length);
    t.check(shownAfter < shownBefore, "a group's heading folds it", JSON.stringify({ shownBefore, shownAfter }));
    await shoot(t, "table-tools");
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // A table view of 500 records draws the rows in the window's sight and a screen's worth around them, spacers standing
  // for the rest: switching to it is quick; the page scrolled to its end, the last rows drawn; Ctrl+↓ selects the last
  // record (its row brought into sight, framed) and what is typed in its cell is written.
  async databaseLongTable(t) {
    const { page } = t;
    const rows = Array.from({ length: 500 }, (_, at) => `<tr><td>任务 ${at + 1}</td><td>${["待开始", "进行中", "已完成"][at % 3]}</td><td>${["林夏", "周舟"][at % 2]}</td><td>前端</td><td>2026-12-${String((at % 28) + 1).padStart(2, "0")}</td><td>${at % 40}</td><td>${(at % 10) / 10}</td><td>${at % 5 ? "" : "✓"}</td><td></td></tr>`).join("\n");
    await t.agentEdit(pageOf("五百条", `<p>前文</p>\n    ${TASKS.replace(/<tbody>[\s\S]*<\/tbody>/, `<tbody>\n${rows}\n</tbody>`)}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    const drawnRows = () => page.evaluate(() => document.querySelectorAll(".doc-database-app .tr[data-rowid]").length);
    const first = await drawnRows();
    t.check(first > 10 && first < 120, "500 records: the rows in sight and around them drawn, not all", String(first));
    const switching = [];
    for (let round = 0; round < 3; round++) {
      for (const at of [1, 0]) {
        switching.push(await page.evaluate(async (at) => {
          const start = performance.now();
          [...document.querySelectorAll(".doc-database-app .tab")][at].click();
          await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
          return performance.now() - start;
        }, at));
      }
    }
    const back = switching.filter((_, at) => at % 2 === 1).sort((a, b) => a - b)[1];
    t.check(back < 400, "switching to the table view of 500 records is quick", JSON.stringify(switching.map(Math.round)));
    // Scrolled to its end: the last record drawn.
    await page.evaluate(() => document.querySelector(".doc-database-app .tbl").lastElementChild.scrollIntoView({ block: "end" }));
    await t.sleep(300);
    const last = await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .tr[data-rowid]")].pop()?.textContent ?? "");
    t.check(last.includes("任务 500"), "scrolled to its end, the last record drawn", last.slice(0, 40));
    // Back to the top, then Ctrl+↓: the last record selected, brought into sight; typed over.
    await page.evaluate(() => document.querySelector(".doc-database-app .tbl").scrollIntoView({ block: "start" }));
    await t.sleep(200);
    await clickCell(t, 0, 0);
    await t.combo("Control", "ArrowDown");
    await t.sleep(300);
    const sel = await page.evaluate(() => {
      const cell = document.querySelector('.doc-database-app [data-cell="499-0"]');
      const box = cell?.getBoundingClientRect();
      return { framed: Boolean(cell?.classList.contains("cursor")), seen: Boolean(box) && box.top >= 0 && box.bottom <= innerHeight };
    });
    t.check(sel.framed && sel.seen, "Ctrl+↓: the last record selected, its row drawn and in sight, framed", JSON.stringify(sel));
    await t.press("Enter");
    await t.combo("Control", "a");
    await t.type("最后一条");
    await t.press("Enter");
    await t.settle();
    const file = rowsIn(await t.read());
    t.check(file.length === 500 && file[499][0] === "最后一条", "typed over: the last record's title in the file", JSON.stringify(file[499]));
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // A character typed in a cell of a database of 500 records costs the page little: each a write of its own
  // (the page's check of what it wrote looks at the row it changed, the row alone goes into the part, the
  // drawing lays out no other cell anew, the commit's looks at the page are quick), everything the page does
  // for it until the next (the commit and its answer too) under a generous bound of main-thread time in a
  // headless browser (40 ms: about 21 on the machine of 2026-11-23, 47 before), what was typed in the file, one
  // step of undo taking all of it out.
  async databaseTypingCost(t) {
    const { page } = t;
    const rows = Array.from({ length: 500 }, (_, at) => `<tr><td>任务 ${at + 1}</td><td>${["待开始", "进行中", "已完成"][at % 3]}</td><td>${["林夏", "周舟"][at % 2]}</td><td>前端</td><td>2026-12-${String((at % 28) + 1).padStart(2, "0")}</td><td>${at % 40}</td><td>${(at % 10) / 10}</td><td>${at % 5 ? "" : "✓"}</td><td></td></tr>`).join("\n");
    await t.agentEdit(pageOf("五百条", `<p>前文</p>\n    ${TASKS.replace(/<tbody>[\s\S]*<\/tbody>/, `<tbody>\n${rows}\n</tbody>`)}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    await clickCell(t, 0, 0);
    await t.press("Enter");
    await t.type("x"); // the first write checks the whole table (nothing known of it yet)
    await t.sleep(250);
    const cdp = await page.createCDPSession();
    await cdp.send("Performance.enable");
    const busy = async () => (await cdp.send("Performance.getMetrics")).metrics.find((metric) => metric.name === "TaskDuration").value * 1000;
    const costs = [];
    for (const letter of "abcdefghijkl") {
      const before = await busy();
      await page.keyboard.type(letter);
      await t.sleep(250);
      costs.push((await busy()) - before);
    }
    await cdp.detach().catch(() => {});
    const median = [...costs].sort((a, b) => a - b)[Math.floor(costs.length / 2)];
    t.check(median < 40, "a character typed in a database of 500 records: under 40 ms of the page's main thread (median), the commit and its answer with it", JSON.stringify(costs.map(Math.round)));
    await t.press("Enter");
    await t.settle();
    const file = rowsIn(await t.read());
    t.check(file.length === 500 && file[0][0] === "任务 1xabcdefghijkl" && file[1][0] === "任务 2", "what was typed in the file, every other record as it was", JSON.stringify(file.slice(0, 2)));
    await t.combo("Control", "z");
    await t.settle();
    const undone = rowsIn(await t.read());
    t.check(undone[0][0] === "任务 1", "one step of undo takes all of it out", JSON.stringify(undone[0]));
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // Each header cell is a column of its own: an Agent's table with no JSON headed 任务 / 备注 / 备注 draws three
  // columns, and the reader's first edit writes all three back with their cells. Two header cells naming one
  // column (data-column) the format cannot hold: read-only, said, nothing written.
  async databaseSameHeaders(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>
    <div class="doc-database">
      <table>
        <thead><tr><th>任务</th><th>备注</th><th>备注</th></tr></thead>
        <tbody><tr><td>写方案</td><td>第一份备注</td><td>第二份备注</td></tr><tr><td>评审</td><td>甲</td><td>乙</td></tr></tbody>
      </table>
    </div>
    <p>中间</p>
    <div class="doc-database">
      <script type="application/json">{ "columns": [{ "id": "t", "name": "任务", "type": "title" }, { "id": "n", "name": "说明", "type": "text" }], "views": [{ "id": "v1", "layout": "table" }] }</script>
      <table>
        <thead><tr><th data-column="t">任务</th><th data-column="n">说明</th><th data-column="n">说明二</th></tr></thead>
        <tbody><tr><td>写方案</td><td>x</td><td>y</td></tr></tbody>
      </table>
    </div>
    <p>后文</p>`));
    await t.open();
    await page.waitForFunction(() => document.querySelectorAll(".doc-database-app .db-head").length === 2 && document.documentElement.hasAttribute("data-ge-editing"), { timeout: 15000 });
    await t.sleep(300);
    const heads = await page.evaluate(() => [...document.querySelectorAll(".doc-database-app")].map((app) => [...app.querySelectorAll("[data-head]")].map((head) => head.textContent.trim())));
    t.check(JSON.stringify(heads[0]) === JSON.stringify(["任务", "备注", "备注"]), "two header cells of the same words: two columns", JSON.stringify(heads));
    const notes = await page.evaluate(() => [...document.querySelectorAll(".doc-database-app")].map((app) => app.querySelector(".db-note")?.textContent ?? null));
    t.check(notes[0] === null && /data-column/.test(notes[1] ?? "") && heads[1].includes("说明二"), "two cells of one data-column: read-only, said, every cell drawn", JSON.stringify(notes));
    await t.settle();
    // The second one as the file holds it, but for the ids the commits give the blocks.
    const second = (text) => text.slice(text.indexOf("<p>中间</p>"), text.indexOf("<p>后文</p>")).replace(/ data-block-id="[^"]*"/g, "");
    const kept = second(await t.read());
    await clickCell(t, 0, 0);
    await t.press("Enter");
    await t.combo("Control", "a");
    await t.type("写方案（改）");
    await t.press("Enter");
    await t.settle();
    const text = await t.read();
    t.check(rowsIn(text)[0]?.join("|") === "写方案（改）|第一份备注|第二份备注" && rowsIn(text)[1]?.join("|") === "评审|甲|乙" && jsonIn(text)?.columns?.map((column) => column.name).join() === "任务,备注,备注", "the first edit writes every column back with its cells", databaseIn(text).slice(0, 700));
    t.check(second(text) === kept, "the read-only one as it was", JSON.stringify([kept, second(text)]));
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // Two databases of the same column and record ids (one copied from the other): words typed in one and,
  // within a second, in the other are two steps of undo, the first undo taking back the second's alone.
  async databaseTwoUndo(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${TASKS}\n    <p>中间</p>\n    ${TASKS.replace("登录页改版", "第二个表")}\n    <p>后文</p>`));
    await t.open();
    await page.waitForFunction(() => document.querySelectorAll(".doc-database-app .db-head").length === 2 && document.documentElement.hasAttribute("data-ge-editing"), { timeout: 15000 });
    await t.sleep(300);
    const typeIn = async (nth, words) => {
      const box = await page.evaluate((nth) => {
        const cell = document.querySelectorAll(".doc-database-app")[nth].querySelector('[data-cell="0-0"]');
        cell.scrollIntoView({ block: "center" });
        const rect = cell.getBoundingClientRect();
        return { x: rect.left + Math.min(rect.width / 2, 40), y: rect.top + rect.height / 2 };
      }, nth);
      await page.mouse.click(box.x, box.y);
      await t.sleep(80);
      await t.press("Enter");
      await t.combo("Control", "a");
      await t.type(words);
      await t.press("Enter");
    };
    const began = Date.now();
    await typeIn(0, "甲");
    await typeIn(1, "乙");
    const took = Date.now() - began;
    await t.settle();
    const titles = (text) => [...text.matchAll(/<div class="doc-database"[\s\S]*?<\/div>/g)].map((found) => /<tbody>\s*<tr><td>([^<]*)<\/td>/.exec(found[0])?.[1]);
    t.check(JSON.stringify(titles(await t.read())) === JSON.stringify(["甲", "乙"]), "both typed in", JSON.stringify(titles(await t.read())));
    await page.evaluate(() => document.querySelectorAll(".doc-database-app .tbl-wrap")[1].focus());
    await t.combo("Control", "z");
    await t.settle();
    t.check(JSON.stringify(titles(await t.read())) === JSON.stringify(["甲", "第二个表"]), `one undo takes back the second's typing alone (typed ${took} ms apart)`, JSON.stringify(titles(await t.read())));
    await t.combo("Control", "z");
    await t.settle();
    t.check(JSON.stringify(titles(await t.read())) === JSON.stringify(["登录页改版", "第二个表"]), "the next the first's", JSON.stringify(titles(await t.read())));
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // Esc puts back the value a cell held as editing began, as it was: a percent of more places than it shows
  // (0.123456, its editor opening at 12.3456), a number typed over with a pause between the keys, a date typed
  // (its month closes first); and leaves no step of undo: the next undo takes back the change before it.
  async databaseEscape(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${TASKS.replace("<td>30</td><td>0.35</td>", "<td>30</td><td>0.123456</td>")}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    // A change to be undone after the Esc.
    await clickCell(t, 2, 5);
    await t.type("9");
    await t.press("Enter");
    await t.settle();
    t.check(rowsIn(await t.read())[2]?.[5] === "9", "a change first", JSON.stringify(rowsIn(await t.read())[2]));
    await page.keyboard.press("Escape");
    await clickCell(t, 1, 6);
    await t.press("Enter");
    await t.sleep(150);
    const opened = await page.evaluate(() => document.querySelector(".doc-database-app .cell-editor-input")?.value ?? null);
    t.check(opened === "12.3456", "a percent's editor opens at every digit of it", String(opened));
    await t.type("9");
    await t.sleep(150);
    await t.press("Backspace");
    await t.sleep(150);
    await t.press("Escape");
    await t.settle();
    t.check(rowsIn(await t.read())[1]?.[6] === "0.123456", "Esc leaves the percent the file had, every digit", String(rowsIn(await t.read())[1]?.[6]));
    await clickCell(t, 0, 5);
    await t.press("Enter");
    await t.type("5");
    await t.sleep(1300); // a pause: the typing goes on in a step of its own
    await t.type("6");
    await t.sleep(150);
    await t.press("Escape");
    await t.settle();
    t.check(rowsIn(await t.read())[0]?.[5] === "12", "Esc after a pause: the number as it was", String(rowsIn(await t.read())[0]?.[5]));
    await clickCell(t, 1, 4);
    await t.press("Enter");
    await t.sleep(200);
    await t.combo("Control", "a");
    await t.type("2027-01-05");
    await t.sleep(200);
    await t.press("Escape");
    await t.sleep(400);
    await t.settle();
    const open = await page.evaluate(() => Boolean(document.querySelector(".doc-database-app .cell-editor")));
    t.check(rowsIn(await t.read())[1]?.[4] === "2026-11-30" && !open, "a date's Esc: the date as it was, the editor shut", JSON.stringify({ date: rowsIn(await t.read())[1]?.[4], open }));
    await page.evaluate(() => document.querySelector(".doc-database-app .tbl-wrap").focus());
    await t.combo("Control", "z");
    await t.settle();
    const undone = rowsIn(await t.read());
    t.check(undone[2]?.[5] === "20" && undone[1]?.[6] === "0.123456" && undone[0]?.[5] === "12", "no step of undo left by what Esc took back: the next undo takes back the change before", JSON.stringify(undone.map((row) => [row[5], row[6]])));
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // A new option typed with what parts names in a cell (，、): in a multi-select several options, in a single
  // select one whose name has a space there; the file, read again, says the same.
  async databaseOptionComma(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${TASKS}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    const pills = () => page.evaluate(() => [...document.querySelectorAll('.doc-database-app [data-cell="0-3"] .pill-text')].map((node) => node.textContent));
    await clickCell(t, 0, 3);
    await t.press("Enter");
    await t.sleep(150);
    await t.type("甲，乙");
    await t.sleep(150);
    const offered = await page.evaluate(() => [...document.querySelectorAll(".picker-row")].find((row) => row.textContent.includes("创建"))?.querySelectorAll(".pill-text").length ?? 0);
    await t.press("Enter");
    await t.sleep(150);
    await page.keyboard.press("Escape");
    await t.settle();
    let text = await t.read();
    const tags = jsonIn(text)?.columns?.find((column) => column.id === "tags")?.options?.map((option) => option.name);
    t.check(offered === 2 && rowsIn(text)[0]?.[3] === "前端, 甲, 乙" && tags?.includes("甲") && tags?.includes("乙"), "a multi-select: two options made, as its cell reads them", JSON.stringify({ offered, cell: rowsIn(text)[0]?.[3], tags }));
    const before = await pills();
    await clickCell(t, 0, 1);
    await t.press("Enter");
    await t.sleep(150);
    await t.type("丙，丁");
    await t.press("Enter");
    await t.settle();
    text = await t.read();
    t.check(rowsIn(text)[0]?.[1] === "丙 丁" && jsonIn(text)?.columns?.find((column) => column.id === "status")?.options?.some((option) => option.name === "丙 丁"), "a single select: one option, a space for the comma", rowsIn(text)[0]?.[1]);
    await t.open();
    await drawn(t);
    t.check(JSON.stringify(await pills()) === JSON.stringify(before) && JSON.stringify(before) === JSON.stringify(["前端", "甲", "乙"]), "read again, the same pills", JSON.stringify({ before, after: await pills() }));
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // A multi-select's option named with a semicolon (研发;测试) is one option wherever its words go: typed in its
  // cell, filled down (Ctrl+D) and pasted into another cell's editor; no option is made of its halves.
  async databaseOptionSemicolon(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${TASKS}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    const tagNames = (text) => jsonIn(text)?.columns?.find((column) => column.id === "tags")?.options?.map((option) => option.name) ?? [];
    await clickCell(t, 0, 3);
    await t.press("Enter");
    await t.sleep(150);
    await t.type("研发;测试");
    await t.sleep(150);
    await t.press("Enter");
    await t.sleep(150);
    await page.keyboard.press("Escape");
    await t.settle();
    let text = await t.read();
    t.check(rowsIn(text)[0]?.[3] === "前端, 研发;测试" && tagNames(text).filter((name) => name.includes("研发")).join("|") === "研发;测试", "typed: one option", JSON.stringify({ cell: rowsIn(text)[0]?.[3], options: tagNames(text) }));
    await page.keyboard.press("Escape");
    await clickCell(t, 0, 3);
    await page.keyboard.down("Shift");
    await clickCell(t, 1, 3);
    await page.keyboard.up("Shift");
    await t.combo("Control", "d");
    await t.settle();
    text = await t.read();
    t.check(rowsIn(text)[1]?.[3] === rowsIn(text)[0]?.[3] && !tagNames(text).includes("研发") && !tagNames(text).includes("测试"), "filled down: the same options, none made of its halves", JSON.stringify({ cells: rowsIn(text).map((row) => row[3]), options: tagNames(text) }));
    await page.keyboard.press("Escape");
    await clickCell(t, 2, 3);
    await t.press("Enter");
    await t.sleep(150);
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData("text/plain", "研发;测试");
      document.querySelector(".cell-editor-q").dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await t.sleep(150);
    await page.keyboard.press("Escape");
    await t.settle();
    text = await t.read();
    t.check(rowsIn(text)[2]?.[3] === "前端, 后端, 研发;测试" && !tagNames(text).includes("研发"), "pasted: the option of that name", JSON.stringify({ cell: rowsIn(text)[2]?.[3], options: tagNames(text) }));
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // A row the reader did not change stays as the file had it, byte for byte (an Agent's attributes as it
  // spelled them, its entities), as the reader changes another.
  async databaseKeptBytes(t) {
    const row = `<tr class='row' title="a<b>c" data-x="&#65;&amp;"><td>写方案</td><td>3</td></tr>`;
    await t.agentEdit(pageOf("任务", `<p>前文</p>
    <div class="doc-database">
      <script type="application/json">{ "columns": [{ "id": "t", "name": "任务", "type": "title" }, { "id": "n", "name": "估时", "type": "number" }], "views": [{ "id": "v1", "layout": "table" }] }</script>
      <table>
        <thead><tr><th data-column='t'>任务</th><th data-column="n">估时</th></tr></thead>
        <tbody>
          ${row}
          <tr><td>评审</td><td>5</td></tr>
        </tbody>
      </table>
    </div>
    <p>后文</p>`));
    await t.open();
    await drawn(t);
    t.check(!(await t.page.$(".doc-database-app .db-note")), "editable, no note");
    const tableOf = (text) => /<table>[\s\S]*?<\/table>/.exec(text)?.[0] ?? "";
    const before = tableOf(await t.read());
    await clickCell(t, 1, 1);
    await t.type("8");
    await t.press("Enter");
    await t.settle();
    const after = tableOf(await t.read());
    t.check(before.includes(row) && after === before.replace("<td>5</td>", "<td>8</td>"), "every byte of its table as the file had it but the changed cell's", JSON.stringify(after));
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // An Agent's table laid out a tag a line, every cell on a line of its own: the reader's edits of one cell and
  // then another, and their undo, leave its header and every row they did not change as the Agent laid them out.
  async databaseKeptLines(t) {
    const { page } = t;
    const row = (cells) => ["          <tr>", ...cells.map((cell) => `            <td>${cell}</td>`), "          </tr>"].join("\n");
    const head = ["        <thead>", "          <tr>", '            <th data-column="t">任务</th>', '            <th data-column="n">估时</th>', "          </tr>", "        </thead>"].join("\n");
    await t.agentEdit(pageOf("任务", `<p>前文</p>
    <div class="doc-database">
      <script type="application/json">{ "columns": [{ "id": "t", "name": "任务", "type": "title" }, { "id": "n", "name": "估时", "type": "number" }], "views": [{ "id": "v1", "layout": "table" }] }</script>
      <table>
${head}
        <tbody>
${row(["写方案", "3"])}
${row(["评审", "5"])}
${row(["上线", "2"])}
        </tbody>
      </table>
    </div>
    <p>后文</p>`));
    await t.open();
    await drawn(t);
    const tableOf = (text) => /<table>[\s\S]*?<\/table>/.exec(text)?.[0] ?? "";
    const before = tableOf(await t.read());
    await clickCell(t, 1, 1);
    await t.type("8");
    await t.press("Enter");
    await t.settle();
    let after = tableOf(await t.read());
    t.check(after === before.replace(row(["评审", "5"]), "          <tr><td>评审</td><td>8</td></tr>"), "one cell typed: its row written anew, the header and the other rows as the Agent laid them out", JSON.stringify(after));
    await page.keyboard.press("Escape");
    await clickCell(t, 2, 1);
    await t.type("6");
    await t.press("Enter");
    await t.settle();
    after = tableOf(await t.read());
    t.check(after.includes(head) && after.includes(row(["写方案", "3"])) && after.includes("<tr><td>评审</td><td>8</td></tr>") && after.includes("<tr><td>上线</td><td>6</td></tr>"), "another typed: still so", JSON.stringify(after));
    await page.evaluate(() => document.querySelector(".doc-database-app .tbl-wrap").focus());
    await t.combo("Control", "z");
    await t.settle();
    await t.combo("Control", "z");
    await t.settle();
    after = tableOf(await t.read());
    const cells = [...after.matchAll(/<td>([^<]*)<\/td>/g)].map((found) => found[1]);
    t.check(JSON.stringify(cells) === JSON.stringify(["写方案", "3", "评审", "5", "上线", "2"]) && after.includes(head) && after.includes(row(["写方案", "3"])), "both undone: the values back, the rows never changed as they were", JSON.stringify(after));
    t.check(!(await page.$(".ge-conflict")), "no conflict card");
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // A url's value that is an address of code is no link anywhere it shows (the cell, its open button, the
  // record's details); one of the web is.
  async databaseUrlCode(t) {
    const { page } = t;
    await t.agentEdit(pageOf("链接", `<p>前文</p>
    <div class="doc-database">
      <script type="application/json">{ "columns": [{ "id": "t", "name": "任务", "type": "title" }, { "id": "u", "name": "链接", "type": "url" }], "views": [{ "id": "v1", "layout": "table" }, { "id": "v2", "layout": "list" }] }</script>
      <table>
        <thead><tr><th data-column="t">任务</th><th data-column="u">链接</th></tr></thead>
        <tbody><tr><td>写方案</td><td>javascript:void(window.__ran=1)</td></tr><tr><td>评审</td><td>https://example.com/spec</td></tr></tbody>
      </table>
    </div>
    <p>后文</p>`));
    await t.open();
    await drawn(t);
    const hrefs = () => page.evaluate(() => [...document.querySelectorAll(".doc-database-app a[href]")].map((a) => a.getAttribute("href")));
    await clickCell(t, 0, 1);
    await clickCell(t, 1, 1);
    let found = await hrefs();
    t.check(!found.some((href) => /^\s*javascript:/i.test(href)) && found.includes("https://example.com/spec"), "in the table: the web's address a link, the code's none", JSON.stringify(found));
    t.check(await page.evaluate(() => document.querySelector('.doc-database-app [data-cell="0-1"]')?.textContent.includes("javascript:")), "the code's words shown as words");
    await page.evaluate(() => document.querySelector('.doc-database-app [data-rowid] .open-btn, .doc-database-app .open-btn')?.click());
    await page.waitForSelector(".doc-database-app .peek, .doc-database-pages[data-doc-peek]", { timeout: 5000 }).catch(() => {});
    await t.sleep(300);
    found = await hrefs();
    t.check(!found.some((href) => /^\s*javascript:/i.test(href)), "nor in the record's details", JSON.stringify(found));
    t.check(await page.evaluate(() => window.__ran === undefined), "nothing ran");
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

};
