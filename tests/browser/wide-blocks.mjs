// Browser scenarios of 宽表格 and 宽多维表格 block by block (src/shared/table-across.mjs WIDE, the kit's tables/across.js
// and database/across.js), spread into scenarios.mjs: a table's and a database's own switch in its block menu (written
// as data-doc-wide on its element, one undo step, in gallery read and the export), the page's switch setting every one
// (the workbench's 更多, gallery set), every view of a wide database as wide as its table views, what the page editor
// draws beside a wide block (its handle and 批注's markers clear of it, a section's bar dotted across it), and a section
// holding one selected, filled block by block.
import fs from "node:fs/promises";
import path from "node:path";

// GALLERY_TEST_SHOTS=<folder> keeps the pictures the scenarios take (none taken without it).
const SHOTS = process.env.GALLERY_TEST_SHOTS || null;

async function shoot(t, name) {
  if (!SHOTS) return;
  await fs.mkdir(SHOTS, { recursive: true });
  await t.page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

async function waitFor(t, test, timeout = 10000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    try {
      if (await test()) return true;
    } catch (error) {
      if (!/context was destroyed/i.test(error.message)) throw error;
    }
    await t.sleep(150);
  }
  return false;
}

const months = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月"];
const row = (name, seed) => `<tr><td>${name}</td>${months.map((_, i) => `<td>${(1000 + ((seed * 37 + i * 113) % 900) + i * 0.3).toFixed(1)}</td>`).join("")}</tr>`;
// A table of twelve columns (wider than the text at the default look), `more` on its frame.
const twelve = (id, more = "", rows = ["线上渠道收入", "线下门店收入", "会员续费"]) => `<div class="doc-table-wrap"${more}>
      <table class="doc-table" id="${id}">
        <thead><tr><th>项目</th>${months.map((month) => `<th>${month}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((name, index) => row(name, index + 1)).join("")}</tbody>
      </table>
    </div>`;

// A database of a title column (240px), a select column (120px) its board goes by and `columns` more of 200px, two
// records; a table view and a board unless `views` says others; `more` on its element.
function database(id, columns, { more = "", views = null } = {}) {
  const names = Array.from({ length: columns }, (_, i) => `列 ${i + 1}`);
  const json = {
    columns: [{ id: "t", name: "名称", type: "title", width: 240 }, { id: "s", name: "状态", type: "select", width: 120, options: [{ name: "待开始", color: "gray" }, { name: "进行中", color: "blue" }, { name: "已完成", color: "green" }] }, ...names.map((name, i) => ({ id: `c${i + 1}`, name, type: "text", width: 200 }))],
    views: views ?? [{ id: "v1", name: "表格", layout: "table" }, { id: "v2", name: "看板", layout: "board", boardBy: "s" }],
  };
  return `<div class="doc-database" id="${id}"${more}>
      <script type="application/json">${JSON.stringify(json)}</script>
      <table><thead><tr><th data-column="t">名称</th><th data-column="s">状态</th>${names.map((name, i) => `<th data-column="c${i + 1}">${name}</th>`).join("")}</tr></thead>
      <tbody><tr><td>甲</td><td>待开始</td>${names.map((_, i) => `<td>${i}</td>`).join("")}</tr><tr><td>乙</td><td>进行中</td>${names.map((_, i) => `<td>${i * 2}</td>`).join("")}</tr></tbody></table>
    </div>`;
}

// The document "wideb": a table of twelve columns in a section (#wide12, 839px of columns, wider than the 712px text), a
// narrow one (#narrow3), one of twelve in a disclosure (#inside); a database in a section (#db3: 1000px of table, wider
// than the text), a narrow one (#dbnarrow: 600px), one whose two table views differ (#dbtwo: its first hides two
// columns, 400px; its second 800px) and one with a board alone (#dbboard). `table` and `db` go on #wide12's frame and
// #db3; `look`: doc.json's.
async function wideBlocksDocument(t, { look = null, table = "", db = "" } = {}) {
  const body = `
    <p>这一段正文标出正文栏的左右两边。</p>
    <section class="doc-section">
      <h2>分区里的宽表</h2>
      <p>分区里的一段正文。</p>
      ${twelve("wide12", table)}
      <p>表格下面的一段。</p>
    </section>
    <div class="doc-table-wrap">
      <table class="doc-table" id="narrow3">
        <thead><tr><th>名称</th><th>数量</th><th>说明</th></tr></thead>
        <tbody><tr><td>甲</td><td>12</td><td>一段说明</td></tr><tr><td>乙</td><td>7</td><td>另一段说明</td></tr></tbody>
      </table>
    </div>
    <details class="doc-details" open>
      <summary><span class="doc-details-summary-label">折叠块里的宽表</span></summary>
      <div class="doc-details-content">
        ${twelve("inside", "", ["甲渠道", "乙渠道"])}
      </div>
    </details>
    <section class="doc-section">
      <h2>分区里的多维表格</h2>
      <p>分区里的另一段正文。</p>
      ${database("db3", 3, { more: `${db} data-block-id="dbblk003"` })}
      <p>多维表格下面的一段。</p>
    </section>
    ${database("dbnarrow", 1)}
    ${database("dbtwo", 2, { views: [{ id: "v1", name: "少几列", layout: "table", hidden: ["c1", "c2"] }, { id: "v2", name: "全部", layout: "table" }, { id: "v3", name: "看板", layout: "board", boardBy: "s" }] })}
    ${database("dbboard", 4, { views: [{ id: "v1", name: "看板", layout: "board", boardBy: "s" }] })}
    <p>最后一段正文。</p>`;
  t.newReport("wideb", "宽块");
  const starter = await t.read("wideb");
  await t.write(starter.replace(/\n[ \t]*<!-- Starter content:[^\n]*-->\n[ \t]*<section\b[^>]*\sdata-doc-placeholder\b[\s\S]*?<\/section>/, body), "wideb");
  if (look) {
    const file = path.join(t.root, "reports", "wideb", "doc.json");
    await fs.writeFile(file, `${JSON.stringify({ ...JSON.parse(await fs.readFile(file, "utf8")), look }, null, 2)}\n`);
  }
}

// What a page (or a frame) of wideBlocksDocument shows: the text's column, each table's frame and each database's
// drawing (its edges, whether it is placed past the text, the width its views take as it says).
function wideMeasure() {
  const box = (node) => {
    const rect = node.getBoundingClientRect();
    return { left: Math.round(rect.left * 10) / 10, right: Math.round(rect.right * 10) / 10, top: Math.round(rect.top), bottom: Math.round(rect.bottom) };
  };
  const tables = Object.fromEntries(["wide12", "narrow3", "inside"].map((id) => {
    const wrap = document.getElementById(id)?.closest(".doc-table-wrap");
    return [id, wrap && { ...box(wrap), across: wrap.hasAttribute("data-doc-across") }];
  }));
  const databases = Object.fromEntries(["db3", "dbnarrow", "dbtwo", "dbboard"].map((id) => {
    const app = document.getElementById(id)?.querySelector(":scope > .doc-database-app");
    return [id, app && { ...box(app), wide: app.classList.contains("is-wide"), views: Number(app.getAttribute("data-doc-views-width")), view: app.querySelector(".tab.active, .tab[aria-selected='true']")?.textContent ?? null }];
  }));
  const main = document.querySelector("main.doc-page");
  const style = getComputedStyle(main);
  const rect = main.getBoundingClientRect();
  const column = { left: rect.left + parseFloat(style.paddingLeft), right: rect.right - parseFloat(style.paddingRight) };
  return { column, tables, databases, width: document.documentElement.clientWidth };
}

// The open page's own words of #wide12's frame and #db3 (data-doc-wide), as the file holds them.
const ownWords = (text) => ({
  wide12: /<div class="doc-table-wrap"([^>]*)>\s*<table class="doc-table" id="wide12"/.exec(text)?.[1].match(/data-doc-wide="(\w+)"/)?.[1] ?? null,
  db3: /<div class="doc-database" id="db3"([^>]*)>/.exec(text)?.[1].match(/data-doc-wide="(\w+)"/)?.[1] ?? null,
  all: (text.match(/data-doc-wide=/g) ?? []).length,
});

// The block menu of the block holding `selector` opened from its handle (the pointer on its left part, `dy` below its
// top): its rows ({ label, checked }).
async function menuOf(t, selector, { dy = 20 } = {}) {
  const { page } = t;
  await page.keyboard.press("Escape");
  await t.sleep(150);
  const at = await page.evaluate((selector, dy) => {
    const node = document.querySelector(selector);
    const block = node.closest(".doc-database") ?? node.closest(".doc-table-wrap") ?? node;
    block.scrollIntoView({ block: "center" });
    const shown = block.querySelector(":scope > .doc-database-app") ?? block;
    const rect = shown.getBoundingClientRect();
    return { x: rect.left + 30, y: rect.top + dy };
  }, selector, dy);
  await page.mouse.move(at.x - 40, at.y, { steps: 2 });
  await page.mouse.move(at.x, at.y, { steps: 3 });
  await t.sleep(250);
  const grip = await page.evaluate(() => { const node = document.querySelector(".ge-handle .ge-grip"); const rect = node?.getBoundingClientRect(); return rect && rect.width > 0 ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null; });
  if (!grip) return null;
  await page.mouse.click(grip.x, grip.y);
  await page.waitForSelector(".ge-pop-row", { visible: true, timeout: 5000 });
  await t.sleep(150);
  return page.evaluate(() => [...document.querySelectorAll(".ge-pop-row")].filter((node) => node.getClientRects().length > 0).map((node) => ({ label: node.querySelector(".ge-pop-label")?.textContent ?? node.textContent, checked: node.getAttribute("aria-checked") === "true", role: node.getAttribute("role") })));
}

// The row labelled `label` of the open menu clicked.
async function choose(t, label) {
  await t.page.evaluate((label) => [...document.querySelectorAll(".ge-pop-row")].find((node) => node.querySelector(".ge-pop-label")?.textContent === label).click(), label);
  await t.sleep(300);
}

// The document's theme (the kit's colors) light or dark.
async function theme(t, which, target = t.page) {
  await target.evaluate((which) => {
    document.documentElement.setAttribute("data-doc-theme", which);
    dispatchEvent(new Event("doc-theme-change"));
  }, which);
  await t.sleep(150);
}

const near = (a, b, slack = 1.5) => Math.abs(a - b) <= slack;

// The section's bar as it shows (handle/), or null: its box and its pieces down it, each a solid strip (its line its
// ::before) or a dotted stretch (its dots a path in an <svg>), with its edges, its colour, how many dots it has and
// whether it takes the pointer.
function barMeasure() {
  const bar = document.querySelector(".ge-section-bar");
  const rect = bar?.isConnected ? bar.getBoundingClientRect() : null;
  if (!rect || rect.height === 0) return null;
  const pieces = [...bar.children].map((piece) => {
    const box = piece.getBoundingClientRect();
    const dots = piece.querySelector("path");
    return {
      kind: piece.classList.contains("ge-section-bar-dots") ? "dots" : "solid",
      top: box.top, bottom: box.bottom, left: box.left, right: box.right,
      ink: dots ? getComputedStyle(dots).fill : getComputedStyle(piece, "::before").backgroundColor,
      dots: dots ? (dots.getAttribute("d").match(/M/g) ?? []).length : 0,
      span: dots ? (() => { const r = dots.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; })() : null,
      takes: getComputedStyle(piece).pointerEvents,
    };
  });
  return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, pieces };
}

// The section around `id`, the wide block (`part`), the text's column and the blocks the section holds (client
// coordinates), the section brought into view first.
function sectionMeasure(id, part) {
  const section = document.getElementById(id).closest("section");
  section.scrollIntoView({ block: "center" });
  const box = (node) => { const rect = node.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }; };
  const main = document.querySelector("main.doc-page");
  const style = getComputedStyle(main);
  const rect = main.getBoundingClientRect();
  return {
    section: box(section), block: box(document.querySelector(part)),
    column: { left: rect.left + parseFloat(style.paddingLeft), right: rect.right - parseFloat(style.paddingRight) },
    units: [...section.children].filter((child) => child.hasAttribute("data-ge-unit")).length,
  };
}

// The selection's fills (selection/: .ge-halo) that show, and the selected blocks.
const fillsMeasure = () => ({
  fills: [...document.querySelectorAll(".ge-halo")].filter((node) => node.getClientRects().length > 0).map((node) => { const rect = node.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }; }),
  picked: window.__gallerySelected().map((node) => node.localName + (node.id ? `#${node.id}` : "")),
});

// A picture of the part of the window `clip` is (CSS px of the window; taken at its device scale; the screenshot's clip
// is the document's, so the page's scroll is added).
async function shootClip(t, name, clip) {
  if (!SHOTS) return;
  await fs.mkdir(SHOTS, { recursive: true });
  const scroll = await t.page.evaluate(() => ({ x: scrollX, y: scrollY }));
  await t.page.screenshot({ path: path.join(SHOTS, `${name}.png`), clip: { x: Math.max(0, clip.x) + scroll.x, y: Math.max(0, clip.y) + scroll.y, width: clip.width, height: clip.height }, captureBeyondViewport: false });
}

export const wideBlockScenarios = {
  // A table's own 宽表格 in its block menu (page/table/ wideRow; the user's 2026-11-23: 宽表格和宽多维表格建议在超宽表和多维表格
  // 的手柄选项卡里面也有这个对应的选项，相当于是直接控制这个表格的，之前的右上角的那个是控制这个页面的): offered for a table wider than the
  // text standing in the body, not for a narrow one nor one in a disclosure; off as the page's look is. A click places
  // it past the text at once and writes data-doc-wide="on" on its frame alone; the switch then checked; one Ctrl+Z puts
  // it back in the text and the word away, Ctrl+Y again. gallery read says it on the table's line; the export carries
  // it (the table past the text there though the look is not wide), and the reader's own 宽表格 in its display menu
  // sets every table, this one's word aside, as the page's switch does (on, then off: back in the text).
  async wideTableBlockSwitch(t) {
    const { page } = t;
    await page.setViewport({ width: 1280, height: 900 });
    await wideBlocksDocument(t);
    await t.open("wideb");
    await page.waitForFunction(() => document.querySelectorAll(".doc-database-app").length === 4, { timeout: 15000 });
    await t.sleep(400);
    let now = await page.evaluate(wideMeasure);
    t.check(!now.tables.wide12.across && near(now.tables.wide12.left, now.column.left, 2), "the look not wide: the wide table in the text", JSON.stringify(now.tables.wide12));

    let rows = await menuOf(t, "#wide12");
    const wide = rows?.find((each) => each.label === "宽表格");
    const labels = (rows ?? []).map((each) => each.label);
    t.check(wide && !wide.checked && labels.indexOf("对齐") > 0 && labels.indexOf("宽表格") === labels.indexOf("对齐") - 1, "its block menu: 宽表格, off, right above 对齐 (the user's 2026-11-24)", JSON.stringify(labels));
    await shoot(t, "table-menu");
    const narrow = await menuOf(t, "#narrow3");
    t.check(narrow && !narrow.some((each) => each.label === "宽表格") && narrow.some((each) => each.label === "铺满正文宽度"), "a table narrower than the text: no 宽表格", JSON.stringify(narrow?.map((each) => each.label)));
    const inside = await menuOf(t, "#inside");
    t.check(inside && !inside.some((each) => each.label === "宽表格"), "a wide table in a disclosure: no 宽表格", JSON.stringify(inside?.map((each) => each.label)));

    await menuOf(t, "#wide12");
    await choose(t, "宽表格");
    t.check(await waitFor(t, async () => (await page.evaluate(wideMeasure)).tables.wide12.across), "on: placed past the text at once");
    now = await page.evaluate(wideMeasure);
    t.check(now.tables.wide12.left < now.column.left - 20 && now.tables.wide12.right > now.column.right + 20 && near((now.tables.wide12.left + now.tables.wide12.right) / 2, (now.column.left + now.column.right) / 2, 2) && !now.tables.inside.across, "past the text on both sides, centred; the one in a disclosure as it was", JSON.stringify(now));
    await t.settle();
    let file = await t.read("wideb");
    t.check(ownWords(file).wide12 === "on" && ownWords(file).all === 1, "its frame alone says data-doc-wide=\"on\" in doc.html", JSON.stringify(ownWords(file)));
    rows = await menuOf(t, "#wide12");
    t.check(rows?.find((each) => each.label === "宽表格")?.checked === true, "the switch checked now", JSON.stringify(rows));
    await page.keyboard.press("Escape");
    await t.sleep(150);

    await t.combo("Control", "z");
    await t.settle();
    file = await t.read("wideb");
    t.check(ownWords(file).all === 0 && await waitFor(t, async () => !(await page.evaluate(wideMeasure)).tables.wide12.across), "one Ctrl+Z: its word gone, back in the text", JSON.stringify(ownWords(file)));
    await t.combo("Control", "y");
    await t.settle();
    t.check(ownWords(await t.read("wideb")).wide12 === "on" && await waitFor(t, async () => (await page.evaluate(wideMeasure)).tables.wide12.across), "Ctrl+Y: on again");

    const read = t.gallery("read", "wideb");
    t.check(/表格 ·[^\n]*data-doc-wide="on"/.test(read), "gallery read says it on the table's line", read.split("\n").filter((line) => line.includes("表格 ·")).join("\n"));

    const url = t.exportReport("wideb");
    await page.goto(url, { waitUntil: "load" });
    await page.waitForSelector(".doc-table-wrap[data-doc-across]", { timeout: 15000 });
    await t.sleep(300);
    now = await page.evaluate(wideMeasure);
    t.check(now.tables.wide12.across && now.tables.wide12.left < now.column.left - 20 && !now.tables.inside.across, "the exported file: the table past the text by its own word", JSON.stringify(now.tables));
    const flipReader = async () => {
      await page.click(".doc-display-button");
      await page.waitForSelector(".doc-display-menu:not([hidden])", { timeout: 5000 });
      await page.click(".doc-display-item[data-doc-tables]");
      await t.sleep(300);
      await page.keyboard.press("Escape");
    };
    const item = await page.evaluate(() => document.querySelector(".doc-display-item[data-doc-tables]")?.getAttribute("aria-checked"));
    t.check(item === "false", "its display menu's 宽表格: off, as the page's look is", item);
    await flipReader();
    await flipReader();
    t.check(await waitFor(t, async () => !(await page.evaluate(wideMeasure)).tables.wide12.across), "the reader's 宽表格 on, then off: every table in the text, its own word aside", JSON.stringify((await page.evaluate(wideMeasure)).tables.wide12));
    await page.reload({ waitUntil: "load" });
    await page.waitForSelector(".doc-table-wrap", { timeout: 15000 });
    await t.sleep(500);
    t.check(!(await page.evaluate(wideMeasure)).tables.wide12.across, "and so after a reload (the reader's choice kept)");
  },

  // A database's own 宽多维表格 in its block menu (components/database/page.mjs menuItems): offered for one whose table
  // views are wider than the text (by the width its drawing says they take), standing in the body, not for a narrow one. A
  // click places its drawing past the text and writes data-doc-wide="on" on it alone; its board as wide as its table;
  // the switch then checked; one Ctrl+Z back. gallery read says it on its line. Light and dark, at 1280.
  async wideDatabaseBlockSwitch(t) {
    const { page } = t;
    await page.setViewport({ width: 1280, height: 900 });
    await wideBlocksDocument(t);
    await t.open("wideb");
    await page.waitForFunction(() => document.querySelectorAll(".doc-database-app").length === 4, { timeout: 15000 });
    await t.sleep(400);
    let now = await page.evaluate(wideMeasure);
    t.check(!now.databases.db3.wide && now.databases.db3.views === 1000 && now.databases.dbnarrow.views === 600 && now.databases.dbtwo.views === 800 && now.databases.dbboard.views === 0, "not wide: the databases in the text, each drawing saying the width of its table views (the board alone none)", JSON.stringify(now.databases));

    let rows = await menuOf(t, "#db3");
    t.check(rows?.some((each) => each.label === "宽多维表格" && !each.checked), "its block menu: 宽多维表格, off", JSON.stringify(rows?.map((each) => each.label)));
    const narrow = await menuOf(t, "#dbnarrow");
    t.check(narrow && !narrow.some((each) => each.label === "宽多维表格"), "a database narrower than the text: none", JSON.stringify(narrow?.map((each) => each.label)));

    await menuOf(t, "#db3");
    await choose(t, "宽多维表格");
    t.check(await waitFor(t, async () => (await page.evaluate(wideMeasure)).databases.db3.wide), "on: its drawing past the text at once");
    now = await page.evaluate(wideMeasure);
    const db3 = now.databases.db3;
    t.check(db3.left < now.column.left - 20 && db3.right > now.column.right + 20 && near((db3.left + db3.right) / 2, (now.column.left + now.column.right) / 2, 2) && !now.databases.dbtwo.wide, "past the text on both sides, centred, the others as they were", JSON.stringify(now.databases));
    await t.settle();
    let file = await t.read("wideb");
    t.check(ownWords(file).db3 === "on" && ownWords(file).all === 1, "the database alone says data-doc-wide=\"on\" in doc.html", JSON.stringify(ownWords(file)));
    rows = await menuOf(t, "#db3");
    t.check(rows?.find((each) => each.label === "宽多维表格")?.checked === true, "the switch checked now", JSON.stringify(rows));
    await page.keyboard.press("Escape");
    await t.sleep(150);
    await page.mouse.move(5, 5);
    for (const which of ["light", "dark"]) {
      await theme(t, which);
      await shoot(t, `database-wide-table-${which}`);
    }
    await page.evaluate(() => [...document.querySelectorAll("#db3 .doc-database-app .tab")][1].click());
    await t.sleep(400);
    const board = (await page.evaluate(wideMeasure)).databases.db3;
    t.check(near(board.left, db3.left) && near(board.right, db3.right) && board.wide, "its board: as wide as its table, where it was", JSON.stringify({ table: db3, board }));
    for (const which of ["light", "dark"]) {
      await theme(t, which);
      await shoot(t, `database-wide-board-${which}`);
    }
    await page.evaluate(() => [...document.querySelectorAll("#db3 .doc-database-app .tab")][0].click());
    await t.sleep(300);
    await t.settle();

    const read = t.gallery("read", "wideb");
    t.check(/多维表格 ·[^\n]*data-doc-wide="on"/.test(read), "gallery read says it on the database's line", read.split("\n").filter((line) => line.includes("多维表格 ·")).join("\n"));

    await page.evaluate(() => { const head = document.querySelector("#db3 .doc-database-app .db-head"); head?.setAttribute("tabindex", "-1"); head?.focus(); });
    await t.combo("Control", "z");
    await t.settle();
    file = await t.read("wideb");
    t.check(ownWords(file).all === 0 && await waitFor(t, async () => !(await page.evaluate(wideMeasure)).databases.db3.wide), "one Ctrl+Z: its word gone, back in the text", JSON.stringify(ownWords(file)));
  },

  // The page's 宽表格 and 宽多维表格 (the workbench's 更多: LookMenu.tsx, chooseLook's `follow`) set every table (database)
  // of the page: the blocks' own words go from doc.html with the click (one undo step of the page's, which puts them
  // back), the look written as ever; 宽表格 leaves the databases' alone. A table's own "off" over a wide page keeps it
  // in the text. gallery set --wide-tables takes the tables' words away too, and says so.
  async wideFollowsPage(t) {
    const { page } = t;
    await page.setViewport({ width: 1440, height: 900 });
    await wideBlocksDocument(t, { look: { tables: "wide" }, table: ' data-doc-wide="off"', db: ' data-doc-wide="off"' });
    const homePage = async () => {
      await page.goto(t.home(), { waitUntil: "load" });
      await page.waitForSelector('.row[data-scope="tree"]', { timeout: 20000 });
      await page.evaluate(() => { location.hash = "wideb"; });
      await page.waitForFunction(() => {
        const frame = document.querySelector("iframe.report-frame:not([data-pending])");
        return frame?.getAttribute("src") === "/generated/wideb.html" && frame.contentDocument?.querySelector("[data-doc-ready]") && frame.contentDocument.querySelector("html[data-ge-save]");
      }, { timeout: 20000 });
      await t.sleep(600);
    };
    await homePage();
    const frame = () => page.frames().find((each) => each.url().includes("/generated/wideb.html") && !each.isDetached() && each.parentFrame() === page.mainFrame());
    const measure = () => frame().evaluate(wideMeasure);
    await frame().waitForFunction(() => document.querySelectorAll(".doc-database-app").length === 4, { timeout: 15000 });
    let now = await measure();
    t.check(!now.tables.wide12.across && now.tables.inside && !now.databases.db3.wide, "the page's look wide, the table's own off: in the text", JSON.stringify(now.tables.wide12));
    const flip = async (label) => {
      await page.mouse.move(5, 600);
      await page.click('.tb-right [aria-label="操作"]');
      await page.waitForSelector(".menu .menu-item", { timeout: 5000 });
      await t.sleep(150);
      await page.evaluate((label) => [...document.querySelectorAll(".menu .menu-item")].find((row) => row.querySelector(".mi-label").textContent === label).click(), label);
      await t.sleep(300);
      for (let tries = 0; tries < 3 && (await page.evaluate(() => Boolean(document.querySelector(".menu")))); tries++) await page.keyboard.press("Escape");
    };
    const settled = () => frame().waitForFunction(() => document.documentElement.getAttribute("data-ge-save") === "saved", { timeout: 15000 }).then(() => t.sleep(300));

    await flip("宽表格"); // off: every table in the text, the table's own word gone
    await settled();
    let file = await t.read("wideb");
    t.check(ownWords(file).wide12 === null && ownWords(file).db3 === "off", "宽表格 flipped: the table's own word gone from doc.html, the database's kept", JSON.stringify(ownWords(file)));
    await flip("宽表格"); // on again
    t.check(await waitFor(t, async () => (await measure()).tables.wide12.across), "on: the table past the text, its own word no more");
    t.check(await waitFor(t, async () => (await t.readJson("wideb")).look?.tables === "wide"), "look.tables written as ever");

    await flip("宽多维表格");
    t.check(await waitFor(t, async () => (await measure()).databases.db3.wide), "宽多维表格 on: the database past the text, its own off gone");
    await settled();
    file = await t.read("wideb");
    t.check(ownWords(file).all === 0, "no block's own word left in doc.html", JSON.stringify(ownWords(file)));
    // The caret put in the page's last paragraph (a click there), then the page's Ctrl+Z.
    const spot = await page.evaluate(() => {
      const element = document.querySelector("iframe.report-frame:not([data-pending])");
      const box = element.getBoundingClientRect();
      const paragraph = [...element.contentDocument.querySelectorAll("main p")].at(-1);
      paragraph.scrollIntoView({ block: "center" });
      const rect = paragraph.getBoundingClientRect();
      return { x: box.left + rect.left + 30, y: box.top + rect.top + rect.height / 2 };
    });
    await page.mouse.click(spot.x, spot.y);
    await t.sleep(200);
    await t.combo("Control", "z");
    await settled();
    t.check(ownWords(await t.read("wideb")).db3 === "off" && await waitFor(t, async () => !(await measure()).databases.db3.wide), "the page's Ctrl+Z puts the database's own off back (one step)", JSON.stringify(ownWords(await t.read("wideb"))));

    await t.write((await t.read("wideb")).replace(/(<div class="doc-table-wrap")([^>]*>\s*<table class="doc-table" id="wide12")/, '$1 data-doc-wide="on"$2'), "wideb");
    t.check(await waitFor(t, async () => (await measure()).tables.wide12.across), "an Agent's data-doc-wide=\"on\" taken in: past the text");
    const said = t.gallery("set", "wideb", "--wide-tables", "off");
    t.check(/1 block's own wide tables setting taken away/.test(said) && ownWords(await t.read("wideb")).wide12 === null && ownWords(await t.read("wideb")).db3 === "off", "gallery set --wide-tables takes the tables' words away and says so, the database's kept", said);
  },

  // Every view of a wide database takes one width (the kit's database/across.js viewsWidth; the user's 2026-11-23:
  // 变成宽多维表格之后只有表格类似是宽的，但是看板什么的还是和之前的一样窄的，就是这些要同步，都是一样的宽的): its board as wide as
  // its table; one whose table views differ, as wide as the widest whichever shows (its narrower table filling it); one
  // whose table views fit the text, and one with a board alone, in the text whatever they show. On a narrow screen
  // (the kit's narrow layout) none goes past the text, and the block menu offers no 宽多维表格.
  async wideDatabaseViews(t) {
    const { page } = t;
    await page.setViewport({ width: 1280, height: 900 });
    await wideBlocksDocument(t, { look: { databases: "wide" } });
    await t.open("wideb");
    await page.waitForFunction(() => document.querySelectorAll(".doc-database-app").length === 4, { timeout: 15000 });
    await t.sleep(400);
    const show = async (id, at) => {
      await page.evaluate((id, at) => [...document.querySelectorAll(`#${id} .doc-database-app .tab`)][at].click(), id, at);
      await t.sleep(350);
      return (await page.evaluate(wideMeasure)).databases[id];
    };
    const column = (await page.evaluate(wideMeasure)).column;
    const views = { db3: [await show("db3", 0), await show("db3", 1)], dbtwo: [await show("dbtwo", 0), await show("dbtwo", 1), await show("dbtwo", 2)], dbnarrow: [await show("dbnarrow", 0), await show("dbnarrow", 1)], dbboard: [await show("dbboard", 0)] };
    const same = (list) => list.every((one) => near(one.left, list[0].left) && near(one.right, list[0].right) && one.wide === list[0].wide);
    t.check(same(views.db3) && views.db3[0].wide && near(views.db3[0].right - views.db3[0].left, 1000, 2), "#db3: its table and its board one width, its table's (1000px)", JSON.stringify(views.db3));
    t.check(same(views.dbtwo) && views.dbtwo[0].wide && near(views.dbtwo[0].right - views.dbtwo[0].left, 800, 2), "#dbtwo: each of its views as wide as its widest table view (800px), its narrower table too", JSON.stringify(views.dbtwo));
    t.check(same(views.dbnarrow) && !views.dbnarrow[0].wide && near(views.dbnarrow[0].left, column.left, 2), "#dbnarrow: its table fits the text, so its board stays in it too", JSON.stringify(views.dbnarrow));
    t.check(!views.dbboard[0].wide && views.dbboard[0].views === 0 && near(views.dbboard[0].left, column.left, 2), "#dbboard: no table view, in the text", JSON.stringify(views.dbboard));
    await page.keyboard.press("Escape"); // a click on the tab shown opened its menu
    await page.evaluate(() => document.querySelector("#dbtwo").scrollIntoView({ block: "center" }));
    await page.mouse.move(5, 5);
    await shoot(t, "database-views-dbtwo-board");

    await page.setViewport({ width: 700, height: 900 });
    await t.sleep(500);
    const narrow = await page.evaluate(wideMeasure);
    t.check(Object.values(narrow.databases).every((one) => !one.wide), "a narrow screen: none past the text", JSON.stringify(narrow.databases));
    await shoot(t, "database-views-narrow");
    const rows = await menuOf(t, "#db3");
    t.check(rows && !rows.some((each) => each.label === "宽多维表格"), "and its block menu has no 宽多维表格 there", JSON.stringify(rows?.map((each) => each.label)));
  },

  // What the page editor draws beside a wide block (the user's 2026-11-23: 手柄没有同步过去，仍然是在原来的位置。然后右侧分区的
  // 竖线也是直接贯穿了，批注的位置也是没有在正确位置; and 2026-11-24 of the section's bar: 原本就是在标准正文宽度内的就仍然是和之前一样的
  // 右边，然后仍然是竖线，并且穿过宽表，只是穿过的部分变成了圆点虚线): a wide database's handle left of its drawing (geometry.mjs
  // extentOf: the drawing is past its host's box), a wide table's left of its frame; the bar of the section a wide block
  // stands in where it always stood, at the text's right edge, along the section, dotted across the block
  // (wideSectionBar has its pieces to the pixel), the pointer over the block there lighting no bar (the block keeps
  // it); a 批注's marker beside the database's line and the bar beside its block right of the drawing (annotate/
  // pastText), in a window with no room for the cards. Light and dark, at 1280 and at 940.
  async wideBlocksBeside(t) {
    const { page } = t;
    await page.setViewport({ width: 1280, height: 900 });
    await wideBlocksDocument(t, { look: { tables: "wide", databases: "wide" } });
    await t.open("wideb");
    await page.waitForFunction(() => document.querySelectorAll(".doc-database-app.is-wide").length === 2, { timeout: 15000 });
    await t.sleep(400);
    const rectOf = (selector) => page.evaluate((selector) => { const node = document.querySelector(selector); const rect = node?.getBoundingClientRect(); return rect && rect.width > 0 ? rect.toJSON() : null; }, selector);
    const sectionOf = (id) => page.evaluate((id) => document.getElementById(id).closest("section").getBoundingClientRect().toJSON(), id);

    for (const [id, part] of [["db3", "#db3 > .doc-database-app"], ["wide12", ".doc-table-wrap:has(> #wide12)"]]) {
      await page.evaluate((id) => document.getElementById(id).scrollIntoView({ block: "center" }), id);
      await t.sleep(250);
      const block = await rectOf(part);
      await page.mouse.move(block.left + 40, block.top + 15, { steps: 3 });
      await t.sleep(300);
      const handle = await rectOf(".ge-handle .ge-grip");
      t.check(handle && handle.right <= block.left + 1 && handle.right >= block.left - 20, `${id}: its handle left of it, where it stands`, JSON.stringify({ handle, block }));
      await shoot(t, `beside-${id}-handle`);

      const section = await sectionOf(id);
      await page.mouse.move(section.right + 10, block.top + (block.bottom - block.top) / 2, { steps: 3 });
      await t.sleep(300);
      const over = await rectOf(".ge-section-bar");
      t.check(!over, `${id}: the pointer over it at the text's right edge lights no section bar there`, JSON.stringify({ over, section, block }));
      await page.mouse.move(block.right + 12, block.top + (block.bottom - block.top) / 2, { steps: 4 });
      await t.sleep(300);
      t.check(!(await rectOf(".ge-section-bar")), `${id}: nor right of it (the bar stands at the text's edge)`);
      await page.mouse.move(section.right + 10, section.top + 12, { steps: 4 });
      await t.sleep(300);
      const bar = await page.evaluate(barMeasure);
      t.check(bar && near(bar.left, section.right + 6, 1) && near(bar.top, section.top, 1) && near(bar.bottom, section.bottom, 1) && bar.pieces.map((piece) => piece.kind).join() === "solid,dots,solid", `${id}: beside the section's heading, its bar at the text's right edge along the section, dotted across it`, JSON.stringify({ bar, block, section }));
      for (const which of ["light", "dark"]) {
        await theme(t, which);
        await shoot(t, `beside-${id}-section-bar-${which}`);
      }
    }

    await page.setViewport({ width: 940, height: 900 });
    await fs.writeFile(path.join(t.root, "reports", "wideb", "annotations.json"), JSON.stringify({ v: 1, items: [
      { id: "wide0001", created: "2026-11-20T10:00:00.000Z", updated: "2026-11-20T10:00:00.000Z", text: "核对线下门店", anchor: { kind: "text", blocks: [], quote: "线下门店收入", prefix: "", suffix: "" } },
      { id: "wide0002", created: "2026-11-20T10:00:00.000Z", updated: "2026-11-20T10:00:00.000Z", text: "多维表格的批注", anchor: { kind: "blocks", blocks: ["dbblk003"], quote: "多维表格" } },
    ] }));
    t.check(await waitFor(t, () => page.evaluate(() => document.querySelectorAll(".ge-note-marker").length >= 2), 15000), "at 940 the 批注 are markers (no room for their cards)");
    await t.sleep(500);
    await page.evaluate(() => document.getElementById("db3").scrollIntoView({ block: "center" }));
    await t.sleep(400);
    const placed = await page.evaluate(() => {
      const rect = (node) => node?.getBoundingClientRect().toJSON() ?? null;
      const drawing = rect(document.querySelector("#db3 > .doc-database-app"));
      const markers = [...document.querySelectorAll(".ge-note-marker")].map(rect).filter((one) => one.top < drawing.bottom && one.bottom > drawing.top);
      const bars = [...document.querySelectorAll(".ge-note-bar")].map(rect).filter((one) => one.height > 0 && one.top < drawing.bottom && one.bottom > drawing.top);
      return { drawing, markers, bars, wide: document.querySelector("#db3 > .doc-database-app").classList.contains("is-wide"), width: document.documentElement.clientWidth };
    });
    t.check(placed.wide && placed.markers.length === 1 && placed.markers[0].left >= placed.drawing.right && placed.markers[0].right <= placed.width, "its 批注's marker right of the wide database, in the window", JSON.stringify(placed));
    t.check(placed.bars.length > 0 && placed.bars.every((one) => one.left >= placed.drawing.right), "the bar beside its block right of the drawing too", JSON.stringify(placed));
    await page.mouse.move(5, 5);
    for (const which of ["light", "dark"]) {
      await theme(t, which);
      await shoot(t, `beside-940-notes-${which}`);
    }
  },

  // The bar of a section holding a wide table or a wide 多维表格 (handle/ placeBar, crossings; the user's 2026-11-24: 原本就是
  // 在标准正文宽度内的就仍然是和之前一样的右边，然后仍然是竖线，并且穿过宽表，只是穿过的部分变成了圆点虚线，穿出的恢复正常): where it always
  // stood, 6px right of the text, solid down to the block, dotted across it (the dotted stretch the block's height to the
  // pixel, its dots on the solid line's line and in its colour, taking no pointer: the block keeps it), solid again
  // below; the pointer over the block at the text's right edge lights no bar, beside the paragraph after it the bar
  // again. At 125% and 225%, light and dark; by the page's switches and by each block's own; one solid bar for a
  // section whose blocks are all in the text, and on a narrow screen (nothing wide there).
  async wideSectionBar(t) {
    const { page } = t;
    const PARTS = [["wide12", ".doc-table-wrap:has(> #wide12)"], ["db3", "#db3 > .doc-database-app"]];
    const hover = async (x, y) => {
      await page.mouse.move(x, y, { steps: 4 });
      await t.sleep(300);
      return page.evaluate(barMeasure);
    };
    // The bar of the section around `id` beside its heading: crossed (solid, dotted, solid) or whole (one solid piece).
    const barBeside = async (id, part, label, { crossed, scale = 1, shots = false }) => {
      await page.mouse.move(5, 5);
      const at = await page.evaluate(sectionMeasure, id, part);
      await t.sleep(250);
      const bar = await hover(at.section.right + 10, at.section.top + 12);
      const kinds = bar?.pieces.map((piece) => piece.kind).join() ?? null;
      const along = bar && near(bar.left, at.section.right + 6, 1) && near(bar.top, at.section.top, 1) && near(bar.bottom, at.section.bottom, 1.5);
      if (!crossed) {
        t.check(along && kinds === "solid" && near(bar.pieces[0].top, at.section.top, 1) && near(bar.pieces[0].bottom, at.section.bottom, 1.5) && bar.pieces[0].takes === "auto", `${label}: one solid bar along the section at the text's right edge, as ever`, JSON.stringify({ bar, at }));
        return;
      }
      const [above, dots, below] = bar?.pieces ?? [];
      t.check(along && kinds === "solid,dots,solid", `${label}: at the text's right edge along the section, solid, dotted, solid`, JSON.stringify({ bar, at }));
      t.check(kinds === "solid,dots,solid" && near(above.top, at.section.top, 1) && near(above.bottom, at.block.top, 1) && near(dots.top, at.block.top, 1) && near(dots.bottom, at.block.bottom, 1) && near(below.top, at.block.bottom, 1) && near(below.bottom, at.section.bottom, 1.5), `${label}: the dotted stretch the block's own height, to the pixel`, JSON.stringify({ pieces: bar?.pieces, block: at.block }));
      t.check(kinds === "solid,dots,solid" && dots.dots >= Math.floor((at.block.bottom - at.block.top - 12) / 9) && dots.span.top >= dots.top + 3 && dots.span.bottom <= dots.bottom - 3 && near(dots.span.left, bar.left + 6, 0.6) && near(dots.span.right, bar.left + 10, 0.6) && dots.ink === above.ink && above.ink === below.ink, `${label}: its dots down the solid line's line (4px, 8px apart), clear of its ends, in its colour`, JSON.stringify({ dots, above }));
      t.check(kinds === "solid,dots,solid" && dots.takes === "none" && above.takes === "auto" && below.takes === "auto", `${label}: the dotted stretch takes no pointer, the solid ones do`, JSON.stringify(bar?.pieces.map((piece) => piece.takes)));
      const under = bar && await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest(".ge-section-bar, .doc-table-wrap, .doc-database")?.className ?? null, { x: bar.left + 8, y: (at.block.top + at.block.bottom) / 2 });
      t.check(/doc-table-wrap|doc-database/.test(under ?? ""), `${label}: on the dotted stretch the pointer is the block's`, under);
      if (shots) {
        // A picture beside the heading, the pointer off the strip (the bar at rest), and one with the pointer on it.
        await hover(at.section.right + 1, at.section.top + 12);
        for (const which of ["light", "dark"]) {
          await theme(t, which);
          await shootClip(t, `bar-${id}-${scale}-${which}-crossing`, { x: bar.left - 60, y: at.block.top - 36, width: 136, height: 72 });
          await shootClip(t, `bar-${id}-${scale}-${which}`, { x: at.column.left - 40, y: at.section.top - 16, width: bar.right - at.column.left + 140, height: at.section.bottom - at.section.top + 32 });
        }
        await theme(t, "light");
      }
      t.check(!(await hover(at.section.right + 10, (at.block.top + at.block.bottom) / 2)), `${label}: the pointer over the block at the text's right edge lights no bar`);
      const again = await hover(at.section.right + 10, at.section.bottom - 8);
      t.check(again?.pieces.map((piece) => piece.kind).join() === "solid,dots,solid", `${label}: beside the paragraph after it, the bar again`, JSON.stringify(again));
    };
    const ready = async (wide) => {
      await t.open("wideb");
      await page.waitForFunction((wide) => document.querySelectorAll(".doc-database-app").length === 4 && document.querySelectorAll(".doc-database-app.is-wide").length === wide, { timeout: 15000 }, wide);
      await t.sleep(400);
    };
    const lookOf = async (look) => {
      const file = path.join(t.root, "reports", "wideb", "doc.json");
      const { look: _, ...rest } = JSON.parse(await fs.readFile(file, "utf8"));
      await fs.writeFile(file, `${JSON.stringify(look ? { ...rest, look } : rest, null, 2)}\n`);
    };

    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1.25 });
    await wideBlocksDocument(t, { look: { tables: "wide", databases: "wide" } });
    for (const scale of [1.25, 2.25]) {
      await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: scale });
      await ready(2);
      for (const [id, part] of PARTS) await barBeside(id, part, `the page's switches, ${scale * 100}%, ${id}`, { crossed: true, scale, shots: true });
    }

    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await lookOf(null);
    await t.write((await t.read("wideb")).replace(/(<div class="doc-table-wrap")([^>]*>\s*<table class="doc-table" id="wide12")/, '$1 data-doc-wide="on"$2').replace(/(<div class="doc-database" id="db3")/, '$1 data-doc-wide="on"'), "wideb");
    await ready(1);
    for (const [id, part] of PARTS) await barBeside(id, part, `each block's own switch, ${id}`, { crossed: true });

    await t.write((await t.read("wideb")).replaceAll(' data-doc-wide="on"', ""), "wideb");
    await ready(0);
    for (const [id, part] of PARTS) await barBeside(id, part, `nothing wide, ${id}`, { crossed: false });

    await lookOf({ tables: "wide", databases: "wide" });
    await page.setViewport({ width: 700, height: 900 });
    await ready(0);
    for (const [id, part] of PARTS) await barBeside(id, part, `a narrow screen, ${id}`, { crossed: false });
    await page.setViewport({ width: 1280, height: 900 });
  },

  // A section holding a wide table or a wide 多维表格, selected by a click on its bar (selection/ filledOn; the user's
  // 2026-11-24: 不要之前的那个全部都在一个框里了，变成了各自都选了一下，那就用的是各自本来自己就有的两个选框): the section selected as ever, each
  // block in it filled as it is selected alone, the wide one's fill out to its drawing past the text, the others' the
  // text's, none over the whole section; Delete takes the section away as ever, Ctrl+Z brings it back. By the page's
  // switches and by a block's own; a section whose blocks are all in the text, and one on a narrow screen, one fill
  // over the section as before. Light and dark.
  async wideSectionSelect(t) {
    const { page } = t;
    const PARTS = { wide12: ".doc-table-wrap:has(> #wide12)", db3: "#db3 > .doc-database-app" };
    const select = async (id) => {
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await page.mouse.move(5, 5);
      const at = await page.evaluate(sectionMeasure, id, PARTS[id]);
      await t.sleep(250);
      await page.mouse.move(at.section.right + 10, at.section.top + 12, { steps: 4 });
      await t.sleep(300);
      const bar = await page.evaluate(barMeasure);
      if (!bar) return { at, fills: [], picked: [] };
      await page.mouse.click(bar.left + 8, at.section.top + 12);
      await page.waitForSelector(".ge-pop-row", { visible: true, timeout: 5000 });
      await page.keyboard.press("Escape"); // the menu closed, the section still selected
      await page.mouse.move(5, 5);
      await t.sleep(250);
      return { at, ...(await page.evaluate(fillsMeasure)) };
    };
    const perBlock = (seen, label) => {
      const { at, fills, picked } = seen;
      const wide = fills.filter((fill) => fill.left < at.column.left - 20 && fill.right > at.column.right + 20);
      const text = fills.filter((fill) => fill.left >= at.column.left - 7 && fill.right <= at.column.right + 7);
      t.check(picked.join() === "section", `${label}: the section selected, as ever`, JSON.stringify(picked));
      t.check(fills.length === at.units && wide.length === 1 && text.length === at.units - 1, `${label}: a fill on each of its ${at.units} blocks, the wide one's past the text, the others' the text's`, JSON.stringify({ fills, at }));
      t.check(wide.length === 1 && near(wide[0].left, at.block.left, 7) && near(wide[0].right, at.block.right, 7) && near(wide[0].top, at.block.top, 7) && near(wide[0].bottom, at.block.bottom, 7), `${label}: the wide block's fill its own, out to its drawing`, JSON.stringify({ wide, block: at.block }));
      t.check(!fills.some((fill) => near(fill.top, at.section.top, 7) && near(fill.bottom, at.section.bottom, 7)), `${label}: no fill over the whole section`, JSON.stringify(fills));
    };
    const whole = (seen, label) => {
      const { at, fills, picked } = seen;
      t.check(picked.join() === "section" && fills.length === 1 && near(fills[0].top, at.section.top, 7) && near(fills[0].bottom, at.section.bottom, 7) && fills[0].left >= at.column.left - 7 && fills[0].right <= at.column.right + 7, `${label}: one fill over the section, as before`, JSON.stringify(seen));
    };
    const ready = async (wide) => {
      await t.open("wideb");
      await page.waitForFunction((wide) => document.querySelectorAll(".doc-database-app").length === 4 && document.querySelectorAll(".doc-database-app.is-wide").length === wide, { timeout: 15000 }, wide);
      await t.sleep(400);
    };
    const lookOf = async (look) => {
      const file = path.join(t.root, "reports", "wideb", "doc.json");
      const { look: _, ...rest } = JSON.parse(await fs.readFile(file, "utf8"));
      await fs.writeFile(file, `${JSON.stringify(look ? { ...rest, look } : rest, null, 2)}\n`);
    };

    await page.setViewport({ width: 1280, height: 900 });
    await wideBlocksDocument(t, { look: { tables: "wide", databases: "wide" } });
    await ready(2);
    for (const id of ["wide12", "db3"]) {
      const seen = await select(id);
      perBlock(seen, `the page's switches, ${id}`);
      for (const which of ["light", "dark"]) {
        await theme(t, which);
        await shootClip(t, `select-${id}-${which}`, { x: seen.at.block.left - 40, y: seen.at.section.top - 24, width: seen.at.block.right - seen.at.block.left + 80, height: seen.at.section.bottom - seen.at.section.top + 48 });
      }
      await theme(t, "light");
    }
    // Delete takes the selected section away whole, the wide block with it; one Ctrl+Z brings it back.
    await select("wide12");
    await page.keyboard.press("Delete");
    await t.settle();
    t.check(await page.evaluate(() => !document.getElementById("wide12")) && !(await t.read("wideb")).includes('id="wide12"'), "Delete: the section gone, its wide table with it");
    await t.combo("Control", "z");
    await t.settle();
    t.check(await waitFor(t, () => page.evaluate(() => Boolean(document.getElementById("wide12")?.closest("section")))) && (await t.read("wideb")).includes('id="wide12"'), "Ctrl+Z: back");

    await lookOf(null);
    await t.write((await t.read("wideb")).replace(/(<div class="doc-table-wrap")([^>]*>\s*<table class="doc-table" id="wide12")/, '$1 data-doc-wide="on"$2'), "wideb");
    await ready(0);
    await page.waitForSelector(".doc-table-wrap[data-doc-across]", { timeout: 15000 });
    perBlock(await select("wide12"), "the table's own switch");
    whole(await select("db3"), "the database not wide (its own switch off as the page's)");

    await t.write((await t.read("wideb")).replaceAll(' data-doc-wide="on"', ""), "wideb");
    await ready(0);
    whole(await select("wide12"), "nothing wide");

    await lookOf({ tables: "wide", databases: "wide" });
    await page.setViewport({ width: 700, height: 900 });
    await ready(0);
    const narrow = await select("wide12");
    whole(narrow, "a narrow screen");
    await shootClip(t, "select-narrow", { x: 0, y: narrow.at.section.top - 24, width: 700, height: narrow.at.section.bottom - narrow.at.section.top + 48 });
    await page.setViewport({ width: 1280, height: 900 });
  },
};
