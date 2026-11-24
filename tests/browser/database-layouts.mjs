// Browser scenarios of a database's layouts of cards (render/kit/database/views/: board, list, gallery,
// calendar), spread into scenarios.mjs: each drawn with nothing written as it shows, in Gallery's colors light
// and dark, in Chinese and English; a board's card dragged within and across columns (its cell and its place one
// step of undo), a column dragged (the options' order), renamed, a new one; a calendar's item dragged to another
// day and one dragged out of 未排期 (its date written); a card and a line opening their record, the round + making one.
import fs from "node:fs/promises";
import path from "node:path";
import { SAMPLE } from "../fixtures/database/sample.mjs";
import { TASKS } from "./database.mjs";

// GALLERY_TEST_SHOTS=<folder> keeps the pictures the scenarios take (none taken without it).
const SHOTS = process.env.GALLERY_TEST_SHOTS || null;

const pageOf = (title, body) => (text) => text.replace(/<script>[\s\S]*?<\/script>/g, "<script></script>").replace(/<main([^>]*)>[\s\S]*<\/main>/, `<main$1>
    <header class="doc-header"><h1 class="doc-title">${title}</h1></header>
    ${body}
  </main>`);

// TASKS with a view of each layout of cards besides its table and board.
const BOARD = '{ "id": "v2", "name": "推进看板", "layout": "board", "boardBy": "status" }';
const ALL = TASKS.replace(BOARD, `${BOARD},
          { "id": "v3", "name": "日历", "layout": "calendar", "dateBy": "due" },
          { "id": "v4", "name": "清单", "layout": "list" },
          { "id": "v5", "name": "卡片", "layout": "gallery" }`);

const jsonIn = (text) => {
  const script = /<div class="doc-database"[\s\S]*?<script type="application\/json">([\s\S]*?)<\/script>/.exec(text)?.[1];
  return script ? JSON.parse(script) : null;
};
const databaseIn = (text) => (/<div class="doc-database"[\s\S]*?<\/div>/.exec(text)?.[0] ?? "").replace(/\s+/g, " ");
const rowsIn = (text) => [...(/<tbody>([\s\S]*?)<\/tbody>/.exec(databaseIn(text))?.[1] ?? "").matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((row) => [...row[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((cell) => cell[1]));
const optionsIn = (text, column) => jsonIn(text)?.columns.find((each) => each.id === column)?.options.map((option) => option.name);
const boardIn = (text) => jsonIn(text)?.views.find((view) => view.id === "v2");

async function shoot(t, name) {
  if (!SHOTS) return;
  await fs.mkdir(SHOTS, { recursive: true });
  await t.page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

// The database at the window's top, so that a picture shows it.
async function toTop(t) {
  await t.page.evaluate(() => {
    const host = document.querySelector(".doc-database");
    window.scrollBy(0, host.getBoundingClientRect().top - 16);
  });
  await t.sleep(120);
}

// The document's theme and the UI's language (the kit reads them as it draws).
async function look(t, theme, language) {
  await t.page.evaluate((theme, language) => {
    document.documentElement.setAttribute("data-doc-theme", theme);
    document.documentElement.setAttribute("data-ge-language", language);
    dispatchEvent(new Event("doc-theme-change"));
  }, theme, language);
  await t.sleep(150);
}

// The database drawn and ready to take edits.
async function drawn(t) {
  await t.page.waitForFunction(() => document.querySelector(".doc-database-app .db-head") && document.documentElement.hasAttribute("data-ge-editing"), { polling: 50, timeout: 15000 });
  await t.sleep(200);
}

// The view at `index` shown (its tab clicked); the views' names change with the language, their order does not.
async function showView(t, index) {
  await t.page.evaluate((index) => [...document.querySelectorAll(".doc-database-app .tab")][index].click(), index);
  await t.sleep(250);
}

// Where an element (the first a selector finds, or whose words hold `words`) stands: its middle, or a point `dx`, `dy` in from its top left.
async function spot(t, selector, { words = null, dx = null, dy = null } = {}) {
  const box = await t.page.evaluate((selector, words) => {
    const node = [...document.querySelectorAll(selector)].find((each) => !words || each.textContent.includes(words));
    if (!node) return null;
    node.scrollIntoView({ block: "nearest", inline: "nearest" });
    const rect = node.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }, selector, words);
  if (!box) throw new Error(`nothing found by ${selector}${words ? ` holding ${words}` : ""}`);
  return { x: box.left + (dx ?? box.width / 2), y: box.top + (dy ?? box.height / 2) };
}

// A press at `from`, the pointer moved to `to` in steps, let go (`shot`: a picture taken just before).
async function dragFrom(t, from, to, steps = 14, shot = null) {
  const { page } = t;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= steps; step++) await page.mouse.move(from.x + ((to.x - from.x) * step) / steps, from.y + ((to.y - from.y) * step) / steps);
  await t.sleep(120);
  if (shot) await shoot(t, shot);
  await page.mouse.up();
  await t.sleep(250);
}

// Undo with the focus on the database's head (the page's undo).
async function undo(t) {
  await t.page.evaluate(() => { const head = document.querySelector(".doc-database-app .db-head"); head.setAttribute("tabindex", "-1"); head.focus(); });
  await t.combo("Control", "z");
  await t.settle();
}

// The calendar's month made 2026年11月 (its head's back and forward pressed), whatever today is.
async function november(t) {
  for (let step = 0; step < 60; step++) {
    const now = await t.page.evaluate(() => document.querySelector(".doc-database-app .cal-title")?.textContent ?? "");
    const [year, month] = (now.match(/\d+/g) ?? []).map(Number);
    if (year === 2026 && month === 11) return;
    const back = year * 12 + month > 2026 * 12 + 11;
    await t.page.evaluate((back) => document.querySelectorAll(".doc-database-app .cal-head .icon-btn")[back ? 0 : 1].click(), back);
    await t.sleep(60);
  }
  throw new Error("the calendar never showed 2026年11月");
}

// A color as the page computes it (rgb(), or color(srgb …) of a color-mix), as [r, g, b, alpha] of 0–255 and 0–1.
const rgbOf = (said) => {
  const numbers = (said.match(/[\d.]+/g) ?? []).map(Number);
  if (said.startsWith("color(")) return [...numbers.slice(0, 3).map((value) => Math.round(value * 255)), numbers[3] ?? 1];
  return [...numbers.slice(0, 3), numbers[3] ?? 1];
};
const near = (got, want, by = 2) => want.every((value, at) => Math.abs(got[at] - value) <= (at === 3 ? 0.02 : by));

// The title of the record open in its details (its field's words), or null where none is open.
const peekTitle = (t) => t.page.evaluate(() => {
  const peek = document.querySelector(".doc-database-app .peek, .doc-database-pages[data-doc-peek]");
  if (!peek) return null;
  const field = peek.querySelector("textarea, input");
  return `${field?.value ?? ""} ${peek.textContent}`;
});

export const databaseLayoutScenarios = {
  // Each layout of cards drawn from a database as a team writes one (the sample's board, calendar, list and
  // wall of cards): its parts there, nothing written as it shows or as the reader goes from one to another, in
  // Gallery's colors (a board's column its option's fill, a card the floating fill, its pills each its option's
  // mark and ink) light and dark, its words in English where the UI speaks it.
  async databaseLayoutsShown(t) {
    const { page } = t;
    await t.agentEdit(pageOf("产品迭代任务", `<p>前文</p>\n    ${SAMPLE}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    await t.settle();
    await look(t, "light", "zh");
    const before = await t.read();
    const layouts = [[1, "board"], [3, "calendar"], [5, "list"], [6, "gallery"]];
    const seen = {};
    for (const [index, name] of layouts) {
      await showView(t, index);
      seen[name] = await page.evaluate(() => ({
        columns: [...document.querySelectorAll(".doc-database-app .board-col")].map((column) => `${column.querySelector(".board-name").textContent}:${column.querySelectorAll(".card").length}`),
        days: document.querySelectorAll(".doc-database-app .cal-day").length,
        undated: document.querySelector(".doc-database-app .cal-head > .btn")?.textContent ?? "",
        lines: document.querySelectorAll(".doc-database-app .list-row").length,
        cards: document.querySelectorAll(".doc-database-app .gallery > .card").length,
        later: document.querySelectorAll(".doc-database-app .db-later").length,
      }));
    }
    t.check(JSON.stringify(seen.board.columns) === JSON.stringify(["待开始:6", "进行中:5", "评审中:3", "已完成:4"]), "the board: a column per option in their order, the records in each", JSON.stringify(seen.board));
    t.check(seen.calendar.days >= 28 && seen.calendar.days % 7 === 0 && seen.calendar.undated.includes("2"), "the calendar: whole weeks, two records with no date under 未排期", JSON.stringify(seen.calendar));
    t.check(seen.list.lines === 18 && seen.gallery.cards === 18, "the list and the wall of cards: a line and a card per record", JSON.stringify([seen.list, seen.gallery]));
    t.check(Object.values(seen).every((each) => each.later === 0), "no placeholder left");
    await t.sleep(400);
    t.check((await t.state()) === "saved" && (await t.read()) === before, "showing them writes nothing");
    // Gallery's colors, light and dark: 进行中's column its blue fill at 70%, a card on it the floating fill with a
    // touch of the blue, the P0 pill on it the red mark, its words of the red's hue.
    const colors = () => page.evaluate(() => {
      const column = [...document.querySelectorAll(".doc-database-app .board-col")].find((node) => node.textContent.includes("进行中"));
      const card = [...column.querySelectorAll(".card")].find((node) => node.textContent.includes("公式引擎"));
      const pill = [...card.querySelectorAll(".pill")].find((node) => node.textContent === "P0");
      const style = (node, property) => getComputedStyle(node)[property];
      return { column: style(column, "backgroundColor"), card: style(card, "backgroundColor"), pill: style(pill, "backgroundColor"), ink: style(pill, "color"), more: style(document.querySelector(".doc-database-app .card-more"), "boxShadow") };
    });
    await showView(t, 1);
    const light = await colors();
    const lightOk = near(rgbOf(light.column), [229, 242, 252, 0.7]) && near(rgbOf(light.pill), [254, 215, 209]) && rgbOf(light.ink)[0] > rgbOf(light.ink)[2] + 40 && light.more === "none";
    t.check(lightOk, "light: the blue fill, the red mark with red words, the card's ··· with no shadow", JSON.stringify(light));
    await look(t, "dark", "zh");
    const dark = await colors();
    const darkOk = near(rgbOf(dark.column), [35, 56, 80, 0.7]) && near(rgbOf(dark.pill), [102, 54, 50]) && rgbOf(dark.card)[0] < 80 && rgbOf(dark.ink)[0] > rgbOf(dark.ink)[2] + 40;
    t.check(darkOk, "dark: the kit's dark fill and mark, the card a dark ground", JSON.stringify(dark));
    // The pictures: each layout light and dark, in Chinese and in English.
    for (const [theme, language] of [["light", "zh"], ["dark", "zh"], ["light", "en"], ["dark", "en"]]) {
      await look(t, theme, language);
      for (const [index, name] of layouts) {
        await showView(t, index);
        await toTop(t);
        await shoot(t, `${name}-${theme}-${language}`);
      }
    }
    // A board's column menu and 未排期, dark, in Chinese and English.
    for (const language of ["zh", "en"]) {
      await look(t, "dark", language);
      await showView(t, 1);
      await toTop(t);
      await page.mouse.move(...Object.values(await spot(t, ".doc-database-app .board-col .board-head")));
      await t.sleep(150);
      await page.mouse.click(...Object.values(await spot(t, ".doc-database-app .board-col .board-acts .icon-btn")));
      await t.sleep(250);
      await shoot(t, `board-column-menu-dark-${language}`);
      await page.keyboard.press("Escape");
      await showView(t, 3);
      await toTop(t);
      await page.evaluate(() => document.querySelector(".doc-database-app .cal-head > .btn").click());
      await t.sleep(250);
      await shoot(t, `calendar-undated-dark-${language}`);
      await page.keyboard.press("Escape");
    }
    await showView(t, 6);
    const english = await page.evaluate(() => ({ add: document.querySelector(".doc-database-app .gallery .end-plus")?.getAttribute("aria-label") }));
    t.check(english.add === "New", "its words in English", JSON.stringify(english));
    await look(t, "light", "zh");
    await t.sleep(300);
    t.check((await t.state()) === "saved" && (await t.read()) === before, "and still nothing written");
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // A board's card dragged into another column above a card there, then within that column: its cell and its
  // place in the file's records, each one step of undo, and the board drawing it there; with a sort on, a card
  // dropped changes its cell alone (the sort orders the column).
  async databaseBoardCards(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${ALL}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    await showView(t, 1);
    const original = rowsIn(await t.read());
    const order = (rows) => rows.map((row) => row[0]);
    await look(t, "light", "zh");
    await toTop(t);
    // 日历视图 (待开始) into 进行中, above 公式引擎.
    await dragFrom(t, await spot(t, ".doc-database-app .card", { words: "日历视图", dx: 30, dy: 14 }), await spot(t, ".doc-database-app .card", { words: "公式引擎", dx: 30, dy: 6 }), 14, "board-card-dragging");
    await t.settle();
    let rows = rowsIn(await t.read());
    t.check(rows.find((row) => row[0] === "日历视图")?.[1] === "进行中" && JSON.stringify(order(rows)) === JSON.stringify(["登录页改版", "日历视图", "公式引擎"]), "into 进行中 above 公式引擎: its cell and its place", JSON.stringify(rows.map((row) => row.slice(0, 2))));
    const drawnColumn = () => page.evaluate(() => [...[...document.querySelectorAll(".doc-database-app .board-col")].find((node) => node.textContent.includes("进行中")).querySelectorAll(".card .card-title")].map((node) => node.textContent));
    t.check(JSON.stringify(await drawnColumn()) === JSON.stringify(["日历视图", "公式引擎"]), "drawn there", JSON.stringify(await drawnColumn()));
    // Within the column: 公式引擎 above 日历视图.
    await dragFrom(t, await spot(t, ".doc-database-app .card", { words: "公式引擎", dx: 30, dy: 14 }), await spot(t, ".doc-database-app .card", { words: "日历视图", dx: 30, dy: 4 }));
    await t.settle();
    rows = rowsIn(await t.read());
    t.check(JSON.stringify(order(rows)) === JSON.stringify(["登录页改版", "公式引擎", "日历视图"]) && rows[1][1] === "进行中", "within the column: its place alone", JSON.stringify(rows.map((row) => row.slice(0, 2))));
    t.check(JSON.stringify(await drawnColumn()) === JSON.stringify(["公式引擎", "日历视图"]), "drawn so", JSON.stringify(await drawnColumn()));
    await shoot(t, "board-card-moved");
    await undo(t);
    rows = rowsIn(await t.read());
    t.check(JSON.stringify(order(rows)) === JSON.stringify(["登录页改版", "日历视图", "公式引擎"]), "one undo: the move within the column back", JSON.stringify(order(rows)));
    await undo(t);
    t.check(JSON.stringify(rowsIn(await t.read())) === JSON.stringify(original), "a second: the move across back, cell and place", JSON.stringify(rowsIn(await t.read()).map((row) => row.slice(0, 2))));
    // A press and no move opens the record.
    await page.mouse.click(...Object.values(await spot(t, ".doc-database-app .card", { words: "公式引擎", dx: 40, dy: 12 })));
    await t.sleep(300);
    t.check((await peekTitle(t))?.includes("公式引擎"), "a card pressed opens its record", String(await peekTitle(t)));
    await page.keyboard.press("Escape");
    await t.sleep(200);
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // A board's card dragged with the cards making room (views/card-drag.js): it lifts (its copy under the pointer, its
  // room a soft fill), the cards of the column it goes into sliding apart where it would land and those of the column
  // it left closing up (their places sampled frame by frame: each goes through places between where it stood and
  // where it goes), where it lands by the card itself (its top past a card's middle, the pointer's height no matter);
  // let go, its cell and its place written as before, one undo, nothing of the drag left; within its column the
  // same; Esc while it is held: everything back where it was, nothing written, and the release after it opens nothing.
  async databaseBoardMotion(t) {
    const { page } = t;
    const more = ALL.replace("</tbody>", `  <tr><td>接口文档</td><td>待开始</td><td>周舟</td><td></td><td></td><td>8</td><td>0</td><td></td><td></td></tr>
          <tr><td>性能优化</td><td>进行中</td><td>林夏</td><td></td><td></td><td>16</td><td>0.5</td><td></td><td></td></tr>
          <tr><td>埋点</td><td>进行中</td><td>周舟</td><td></td><td></td><td>4</td><td>0.2</td><td></td><td></td></tr>
        </tbody>`);
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${more}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    await showView(t, 1);
    await look(t, "light", "zh");
    await toTop(t);
    const original = rowsIn(await t.read());
    const order = (rows) => rows.map((row) => row[0]);
    const boxOf = (title) => page.evaluate((title) => {
      const node = [...document.querySelectorAll(".doc-database-app .board .card")].find((each) => each.textContent.includes(title));
      const rect = node.getBoundingClientRect();
      return { left: rect.left, top: rect.top, height: rect.height, width: rect.width };
    }, title);
    const column = (key) => page.evaluate((key) => [...document.querySelectorAll(`.doc-database-app .board-col[data-col="${key}"] .card .card-title`)].map((node) => node.textContent), key);
    // The tops of the cards titled `titles`, each frame from now for about two thirds of a second.
    const sample = (titles) => page.evaluate((titles) => {
      window.__boardSamples = [];
      const tick = () => {
        window.__boardSamples.push(titles.map((title) => [...document.querySelectorAll(".doc-database-app .board .card")].find((each) => each.textContent.includes(title))?.getBoundingClientRect().top ?? null));
        if (window.__boardSamples.length < 40) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, titles);
    const samples = async () => {
      await t.sleep(700);
      return page.evaluate(() => window.__boardSamples);
    };
    // Whether the tops of one card go from `from` to `to` through places between (slid, not jumped).
    const slid = (tops, from, to) => Math.abs(tops[0] - from) < 2 && Math.abs(tops.at(-1) - to) < 2 && tops.some((top) => Math.abs(top - from) > 3 && Math.abs(top - to) > 3);
    const left = () => page.evaluate(() => ({
      ghosts: document.querySelectorAll(".doc-database-app .drag-ghost").length,
      gaps: document.querySelectorAll(".doc-database-app .card-gap").length,
      styled: [...document.querySelectorAll(".doc-database-app .card-slot, .doc-database-app .board .card")].filter((node) => /transform|transition|visibility/.test(node.getAttribute("style") ?? "")).length,
      dragging: document.querySelector(".doc-database-app").classList.contains("is-dragging"),
    }));
    const clean = (said) => said.ghosts === 0 && said.gaps === 0 && said.styled === 0 && !said.dragging;

    // 日历视图 (待开始's first) into 进行中: first above 公式引擎, then, its top past 公式引擎's middle, below it.
    const calendar = await boxOf("日历视图");
    const formula = await boxOf("公式引擎");
    const perf = await boxOf("性能优化");
    const docs = await boxOf("接口文档");
    const press = { x: calendar.left + 30, y: calendar.top + 14 };
    await page.mouse.move(press.x, press.y);
    await page.mouse.down();
    await page.mouse.move(press.x + 20, press.y, { steps: 3 });
    await t.sleep(100);
    const lifted = await page.evaluate(() => ({ ghost: Boolean(document.querySelector(".doc-database-app .drag-ghost.board-lift .card")), gap: document.querySelector(".doc-database-app .card-gap")?.closest("[data-col]")?.dataset.col, line: Boolean(document.querySelector(".doc-database-app .drop-line")) }));
    t.check(lifted.ghost && lifted.gap === "待开始" && !lifted.line, "held: its copy lifted under the pointer, its room where it was, no drop line", JSON.stringify(lifted));
    await sample(["公式引擎", "性能优化", "接口文档"]);
    await page.mouse.move(formula.left + 30, formula.top - 6, { steps: 6 });
    let tops = await samples();
    const step = calendar.height + 8;
    const gapAt = () => page.evaluate(() => {
      const gap = document.querySelector(".doc-database-app .card-gap");
      return { col: gap?.closest("[data-col]")?.dataset.col, at: gap ? [...gap.parentElement.children].indexOf(gap) : -1 };
    });
    let gap = await gapAt();
    t.check(gap.col === "进行中" && gap.at === 0, "over 进行中 above its first card: the room there", JSON.stringify(gap));
    t.check(slid(tops.map((each) => each[0]), formula.top, formula.top + step) && slid(tops.map((each) => each[1]), perf.top, perf.top + step), "the cards of 进行中 slid down to open it (frame by frame)", JSON.stringify(tops.map((each) => each.slice(0, 2).map(Math.round))));
    t.check(slid(tops.map((each) => each[2]), docs.top, docs.top - step), "接口文档 slid up in 待开始, closing where it was", JSON.stringify(tops.map((each) => Math.round(each[2]))));
    // Its top just past 公式引擎's middle (and half the gap), the pointer well above 公式引擎's bottom: below it.
    await sample(["公式引擎"]);
    await page.mouse.move(formula.left + 30, formula.top + formula.height / 2 + 4 + 3 + 14, { steps: 4 });
    tops = await samples();
    gap = await gapAt();
    t.check(gap.col === "进行中" && gap.at === 1 && slid(tops.map((each) => each[0]), formula.top + step, formula.top), "its top past 公式引擎's middle: the room below it, 公式引擎 sliding back up", JSON.stringify({ gap, tops: tops.map((each) => Math.round(each[0])) }));
    await shoot(t, "board-card-making-room");
    await page.mouse.up();
    await t.sleep(400);
    await t.settle();
    let rows = rowsIn(await t.read());
    t.check(rows.find((row) => row[0] === "日历视图")?.[1] === "进行中" && JSON.stringify(order(rows)) === JSON.stringify(["登录页改版", "公式引擎", "接口文档", "日历视图", "性能优化", "埋点"]), "let go: its cell and its place in the records", JSON.stringify(rows.map((row) => row.slice(0, 2))));
    t.check(JSON.stringify(await column("进行中")) === JSON.stringify(["公式引擎", "日历视图", "性能优化", "埋点"]) && JSON.stringify(await column("待开始")) === JSON.stringify(["接口文档"]), "drawn where its room was", JSON.stringify([await column("进行中"), await column("待开始")]));
    let after = await left();
    t.check(clean(after), "nothing of the drag left: no copy, no room, no slide's style", JSON.stringify(after));
    await undo(t);
    t.check(JSON.stringify(rowsIn(await t.read())) === JSON.stringify(original), "one undo: cell and place back", JSON.stringify(order(rowsIn(await t.read()))));

    // Within 进行中: 埋点 above 公式引擎, the two above it sliding down.
    await toTop(t);
    const dots = await boxOf("埋点");
    const top = await boxOf("公式引擎");
    const second = await boxOf("性能优化");
    await page.mouse.move(dots.left + 30, dots.top + 14);
    await page.mouse.down();
    await page.mouse.move(dots.left + 30, dots.top + 4, { steps: 3 });
    await t.sleep(100);
    await sample(["公式引擎", "性能优化"]);
    await page.mouse.move(top.left + 30, top.top - 10 + 14, { steps: 6 });
    tops = await samples();
    const by = dots.height + 8;
    t.check(slid(tops.map((each) => each[0]), top.top, top.top + by) && slid(tops.map((each) => each[1]), second.top, second.top + by), "within its column: the cards above it slid down", JSON.stringify(tops.map((each) => each.map(Math.round))));
    await page.mouse.up();
    await t.sleep(400);
    await t.settle();
    rows = rowsIn(await t.read());
    t.check(JSON.stringify(order(rows)) === JSON.stringify(["登录页改版", "埋点", "公式引擎", "日历视图", "接口文档", "性能优化"]) && rows[1][1] === "进行中", "its place alone written", JSON.stringify(rows.map((row) => row.slice(0, 2))));
    t.check(JSON.stringify(await column("进行中")) === JSON.stringify(["埋点", "公式引擎", "性能优化"]), "drawn so", JSON.stringify(await column("进行中")));
    await undo(t);
    t.check(JSON.stringify(rowsIn(await t.read())) === JSON.stringify(original), "one undo", JSON.stringify(order(rowsIn(await t.read()))));

    // Held at the board's right edge: the board scrolls under it, and it goes into the column brought in.
    await toTop(t);
    const docsNow = await boxOf("接口文档");
    const frame = await page.evaluate(() => {
      const board = document.querySelector(".doc-database-app .board");
      const rect = board.getBoundingClientRect();
      return { right: rect.right, scroll: board.scrollLeft, room: board.scrollWidth - board.clientWidth };
    });
    await page.mouse.move(docsNow.left + 30, docsNow.top + 14);
    await page.mouse.down();
    await page.mouse.move(frame.right - 8, docsNow.top + 14, { steps: 10 });
    await t.sleep(700);
    const scrolled = await page.evaluate(() => ({ scroll: document.querySelector(".doc-database-app .board").scrollLeft, gap: document.querySelector(".doc-database-app .card-gap")?.closest("[data-col]")?.dataset.col }));
    await page.mouse.up();
    await t.sleep(400);
    await t.settle();
    rows = rowsIn(await t.read());
    t.check(frame.room > 20 && scrolled.scroll > frame.scroll + 20 && scrolled.gap === "已完成" && rows.find((row) => row[0] === "接口文档")?.[1] === "已完成", "held at the board's right edge: the board scrolled, the room in the column brought in, its cell written", JSON.stringify({ frame, scrolled, rows: rows.map((row) => row.slice(0, 2)) }));
    await undo(t);
    t.check(JSON.stringify(rowsIn(await t.read())) === JSON.stringify(original), "one undo", JSON.stringify(order(rowsIn(await t.read()))));

    // Esc while held (in the dark): back as it was, nothing written, the release opening nothing.
    await page.evaluate(() => { document.querySelector(".doc-database-app .board").scrollLeft = 0; });
    await look(t, "dark", "zh");
    await toTop(t);
    const text = await t.read();
    const still = await Promise.all(["日历视图", "接口文档", "公式引擎", "性能优化"].map(boxOf));
    const held = await boxOf("公式引擎");
    await page.mouse.move(held.left + 30, held.top + 14);
    await page.mouse.down();
    await page.mouse.move(still[1].left + 30, still[1].top - 6, { steps: 8 });
    await t.sleep(250);
    const moved = await page.evaluate(() => document.querySelector(".doc-database-app .card-gap")?.closest("[data-col]")?.dataset.col);
    await shoot(t, "board-card-held-dark");
    await page.keyboard.press("Escape");
    await t.sleep(450);
    const back = await Promise.all(["日历视图", "接口文档", "公式引擎", "性能优化"].map(boxOf));
    await page.mouse.up();
    await t.sleep(300);
    after = await left();
    t.check(moved === "待开始" && back.every((box, at) => Math.abs(box.top - still[at].top) < 1 && Math.abs(box.left - still[at].left) < 1) && clean(after), "Esc while held: every card back where it was, nothing of the drag left", JSON.stringify({ moved, still, back, after }));
    t.check((await t.read()) === text && (await peekTitle(t)) === null, "nothing written, and the release opens no record", String(await peekTitle(t)));

    // For a reader who asks for less motion: the room opens at once, nothing slides; the drop the same.
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await toTop(t);
    const calm = await boxOf("接口文档");
    const target = await boxOf("公式引擎");
    await page.mouse.move(calm.left + 30, calm.top + 14);
    await page.mouse.down();
    await page.mouse.move(calm.left + 50, calm.top + 14, { steps: 3 });
    await t.sleep(100);
    await sample(["公式引擎"]);
    await page.mouse.move(target.left + 30, target.top - 6, { steps: 6 });
    tops = (await samples()).map((each) => each[0]);
    await page.mouse.up();
    await t.sleep(200);
    await t.settle();
    const jumped = tops.every((top) => Math.abs(top - target.top) < 1 || Math.abs(top - (target.top + calm.height + 8)) < 1);
    t.check(jumped && Math.abs(tops.at(-1) - (target.top + calm.height + 8)) < 1 && rowsIn(await t.read()).find((row) => row[0] === "接口文档")?.[1] === "进行中" && clean(await left()), "less motion: the cards at once where they go, the drop written, nothing left", JSON.stringify(tops.map(Math.round)));
    await page.emulateMediaFeatures([]);
    await undo(t);

    // Held near the window's bottom in a short window: the page scrolls under it.
    const size = page.viewport();
    await page.setViewport({ ...size, height: 420 });
    await t.sleep(300);
    await toTop(t);
    const low = await boxOf("接口文档");
    const from = await page.evaluate(() => scrollY);
    await page.mouse.move(low.left + 30, low.top + 14);
    await page.mouse.down();
    await page.mouse.move(low.left + 30, 420 - 6, { steps: 8 });
    await t.sleep(600);
    const down = await page.evaluate(() => scrollY);
    await page.keyboard.press("Escape");
    await t.sleep(400);
    await page.mouse.up();
    await page.setViewport(size);
    await t.sleep(300);
    t.check(down > from + 40 && clean(await left()), "held near the window's bottom: the page scrolled under it; Esc, nothing left", JSON.stringify({ from, down }));
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // A board's column dragged by its left part: the next column gives way once the dragged one's right edge is past
  // that column's middle, the pointer far from it (ui/reorder.js by src/shared/drag-place.mjs: by the column, not the
  // pointer); let go, the options' order written, one undo; Esc while held puts it back and writes nothing, the
  // release after it naming nothing.
  async databaseBoardColumnEdge(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${ALL}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    await showView(t, 1);
    await look(t, "light", "zh");
    await toTop(t);
    const boxes = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".doc-database-app .board-col")].map((node) => {
      const rect = node.getBoundingClientRect();
      const head = node.querySelector(".board-head").getBoundingClientRect();
      return [node.dataset.col, { left: rect.left, right: rect.right, width: rect.width, head: head.top + head.height / 2, shift: new DOMMatrixReadOnly(getComputedStyle(node).transform).m41 }];
    })));
    const before = await boxes();
    const first = before["待开始"];
    const next = before["进行中"];
    const press = { x: first.left + 20, y: first.head };
    // Its right edge 4px past the next one's middle: the pointer still far left of that middle.
    const by = next.left + next.width / 2 + 4 - first.right;
    const to = press.x + by;
    await page.mouse.move(press.x, press.y);
    await page.mouse.down();
    await page.mouse.move(press.x + 10, press.y, { steps: 2 });
    await page.mouse.move(to, press.y, { steps: 10 });
    await t.sleep(300);
    const during = await boxes();
    t.check(to < next.left + next.width / 2 - 100 && during["进行中"].shift < -(next.width - 1) && Math.abs(during["已完成"].shift) < 0.5, "its edge past the next one's middle, the pointer far from it: the next has given way, the one after it stays", JSON.stringify({ to, next, during }));
    await page.mouse.up();
    await t.sleep(300);
    await t.settle();
    t.check(JSON.stringify(optionsIn(await t.read(), "status")) === JSON.stringify(["进行中", "待开始", "已完成"]), "let go: the options' order written", JSON.stringify(optionsIn(await t.read(), "status")));
    await undo(t);
    t.check(JSON.stringify(optionsIn(await t.read(), "status")) === JSON.stringify(["待开始", "进行中", "已完成"]), "one undo", JSON.stringify(optionsIn(await t.read(), "status")));
    // Short of the middle: nothing gives way.
    await toTop(t);
    const again = (await boxes())["待开始"];
    await page.mouse.move(again.left + 20, again.head);
    await page.mouse.down();
    await page.mouse.move(again.left + 30, again.head, { steps: 2 });
    await page.mouse.move(again.left + 20 + by - 16, again.head, { steps: 6 });
    await t.sleep(300);
    const short = await boxes();
    t.check(Math.abs(short["进行中"].shift) < 0.5, "its edge short of the next one's middle: nothing gives way", JSON.stringify(short));
    await page.mouse.move(again.left + 20 + by + 40, again.head, { steps: 3 });
    await t.sleep(250);
    const text = await t.read();
    await page.keyboard.press("Escape");
    await t.sleep(350);
    const back = await boxes();
    await page.mouse.up();
    await t.sleep(300);
    const naming = await page.evaluate(() => Boolean(document.querySelector(".doc-database-app .board-name-input")));
    t.check(Object.values(back).every((box) => Math.abs(box.shift) < 0.5) && (await t.read()) === text && !naming, "Esc while held: the columns back, nothing written, the release naming nothing", JSON.stringify({ back, naming }));
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // The same with a sort on the board: the card dropped into another column takes its cell, the records keep their order.
  async databaseBoardSorted(t) {
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${TASKS.replace(BOARD, BOARD.replace(' }', ', "sorts": [{ "prop": "est", "dir": "desc" }] }'))}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    await showView(t, 1);
    const original = rowsIn(await t.read());
    await dragFrom(t, await spot(t, ".doc-database-app .card", { words: "登录页改版", dx: 30, dy: 14 }), await spot(t, ".doc-database-app .board-col[data-col=\"进行中\"] .board-head"));
    await t.settle();
    const rows = rowsIn(await t.read());
    t.check(rows[0][0] === "登录页改版" && rows[0][1] === "进行中" && JSON.stringify(rows.map((row) => row[0])) === JSON.stringify(original.map((row) => row[0])), "sorted: its cell changes, the records' order stays", JSON.stringify(rows.map((row) => row.slice(0, 2))));
    await undo(t);
    t.check(JSON.stringify(rowsIn(await t.read())) === JSON.stringify(original), "one undo", JSON.stringify(rowsIn(await t.read()).map((row) => row.slice(0, 2))));
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // A board's columns: one dragged before another (the options' order in the file, one step); one's name typed
  // in its head (the option and every cell of it renamed, one step); its menu (rename, counts as done, delete, its
  // colors); a new one from the round + past the last, named where it stands.
  async databaseBoardColumns(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${ALL}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    await showView(t, 1);
    await look(t, "light", "zh");
    // 进行中's head dragged before 待开始.
    await dragFrom(t, await spot(t, '.doc-database-app .board-col[data-col="进行中"] .board-head', { dx: 70, dy: 16 }), await spot(t, '.doc-database-app .board-col[data-col="待开始"] .board-head', { dx: 10, dy: 16 }), 20);
    await t.settle();
    t.check(JSON.stringify(optionsIn(await t.read(), "status")) === JSON.stringify(["进行中", "待开始", "已完成"]), "a column dragged: its option first in the file", JSON.stringify(optionsIn(await t.read(), "status")));
    const drawnOrder = await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .board-col")].map((column) => column.dataset.col));
    t.check(JSON.stringify(drawnOrder) === JSON.stringify(["进行中", "待开始", "已完成"]), "and drawn so", JSON.stringify(drawnOrder));
    await undo(t);
    t.check(JSON.stringify(optionsIn(await t.read(), "status")) === JSON.stringify(["待开始", "进行中", "已完成"]), "one undo puts it back", JSON.stringify(optionsIn(await t.read(), "status")));
    // 待开始's name typed where it stands.
    await page.mouse.click(...Object.values(await spot(t, '.doc-database-app .board-col[data-col="待开始"] .board-name .pill')));
    await t.sleep(200);
    const field = await page.evaluate(() => document.activeElement?.classList.contains("board-name-input"));
    t.check(field, "its pill pressed: its name in a field where it stands");
    await t.combo("Control", "a");
    await t.type("排队");
    await toTop(t);
    await shoot(t, "board-column-rename");
    await t.press("Enter");
    await t.settle();
    let text = await t.read();
    t.check(optionsIn(text, "status")?.[0] === "排队" && rowsIn(text).find((row) => row[0] === "日历视图")?.[1] === "排队", "renamed: the option and its cells", JSON.stringify([optionsIn(text, "status"), rowsIn(text).map((row) => row[1])]));
    await undo(t);
    t.check(optionsIn(await t.read(), "status")?.[0] === "待开始", "one undo for the typing", JSON.stringify(optionsIn(await t.read(), "status")));
    // 已完成's menu: rename, counts as done, delete, its colors.
    await page.mouse.move(...Object.values(await spot(t, '.doc-database-app .board-col[data-col="已完成"] .board-head')));
    await t.sleep(150);
    await page.evaluate(() => document.querySelector('.doc-database-app .board-col[data-col="已完成"] .board-acts .icon-btn').click());
    await t.sleep(250);
    await toTop(t);
    await shoot(t, "board-column-menu-light");
    const menu = await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .popover .menu-item")].map((row) => row.textContent.trim()));
    // Its colors as the editor's color pickers draw theirs: ten swatches, its own (green) the one chosen.
    const swatches = await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .popover .color-grid .color-cell")].map((cell) => `${cell.getAttribute("aria-label")}${cell.getAttribute("aria-current") === "true" ? "*" : ""}`));
    t.check(["重命名", "视为已完成", "删除这一列"].every((words) => menu.includes(words)) && swatches.length === 10 && swatches.includes("绿色*") && swatches.filter((each) => each.endsWith("*")).length === 1, "its menu: rename, counts as done, delete, its colors (swatches, its own chosen)", JSON.stringify({ menu, swatches }));
    await page.keyboard.press("Escape");
    await t.sleep(200);
    // A new column from the round + past the last, named where it stands.
    await page.mouse.move(...Object.values(await spot(t, ".doc-database-app .col-add-zone")));
    await t.sleep(250);
    await page.mouse.click(...Object.values(await spot(t, ".doc-database-app .col-add-zone .end-plus")));
    await t.sleep(300);
    const typing = await page.evaluate(() => document.activeElement?.classList.contains("board-name-input") ? document.activeElement.value : null);
    t.check(typing === "新分组", "a new column, its name in a field", String(typing));
    await t.combo("Control", "a");
    await t.type("阻塞");
    await t.press("Enter");
    await t.settle();
    t.check(JSON.stringify(optionsIn(await t.read(), "status")) === JSON.stringify(["待开始", "进行中", "已完成", "阻塞"]), "the new option in the file, named", JSON.stringify(optionsIn(await t.read(), "status")));
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // A calendar: an item dragged to another day writes that day (one step of undo); 未排期 lists the record whose
  // date is no date, and its item dragged out onto a day writes that day too, the card faded while it is held.
  async databaseCalendarDrag(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${ALL}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    await look(t, "light", "zh");
    await showView(t, 2);
    await november(t);
    const before = await t.read();
    await dragFrom(t, await spot(t, '.doc-database-app .cal-day[data-day="2026-11-12"] .cal-item', { dx: 20, dy: 8 }), await spot(t, '.doc-database-app .cal-day[data-day="2026-11-20"]'));
    await t.settle();
    let rows = rowsIn(await t.read());
    t.check(rows.find((row) => row[0] === "登录页改版")?.[4] === "2026-11-20", "dragged to the 20th: its date in the file", JSON.stringify(rows.map((row) => row[4])));
    const there = await page.evaluate(() => document.querySelector('.doc-database-app .cal-day[data-day="2026-11-20"]').textContent.includes("登录页改版"));
    t.check(there, "and drawn on that day");
    await undo(t);
    t.check(rowsIn(await t.read()).find((row) => row[0] === "登录页改版")?.[4] === "2026-11-12", "one undo puts it back");
    // 未排期: 日历视图, whose 截止日期 says 下周.
    await page.evaluate(() => document.querySelector(".doc-database-app .cal-head > .btn").click());
    await t.sleep(300);
    const listed = await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .cal-pop .cal-item")].map((item) => item.textContent));
    t.check(listed.length === 1 && listed[0].includes("日历视图"), "未排期 lists the record with no date", JSON.stringify(listed));
    await toTop(t);
    await shoot(t, "calendar-undated-light");
    // Held and moved out over the month: the card fades away; let go on the 18th.
    const from = await spot(t, ".doc-database-app .cal-pop .cal-item", { dx: 20, dy: 10 });
    const to = await spot(t, '.doc-database-app .cal-day[data-day="2026-11-18"]');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let step = 1; step <= 14; step++) await page.mouse.move(from.x + ((to.x - from.x) * step) / 14, from.y + ((to.y - from.y) * step) / 14);
    await t.sleep(150);
    await shoot(t, "calendar-dragging-out");
    const held = await page.evaluate(() => ({ faded: document.querySelector(".doc-database-app .cal-pop")?.classList.contains("dragging-out"), over: document.querySelector(".doc-database-app .cal-day.over")?.dataset.day }));
    await page.mouse.up();
    await t.settle();
    t.check(held.faded === true && held.over === "2026-11-18", "while it is held the card fades away, the day under it marked", JSON.stringify(held));
    rows = rowsIn(await t.read());
    t.check(rows.find((row) => row[0] === "日历视图")?.[4] === "2026-11-18", "let go on the 18th: its date written", JSON.stringify(rows.map((row) => row[4])));
    const after = await page.evaluate(() => ({ open: Boolean(document.querySelector(".doc-database-app .cal-pop")), faded: document.querySelector(".doc-database-app .cal-pop")?.classList.contains("dragging-out"), items: document.querySelectorAll(".doc-database-app .cal-pop .cal-item").length, count: document.querySelector(".doc-database-app .cal-head > .btn").textContent }));
    t.check(after.open && !after.faded && after.items === 0 && after.count.includes("0"), "the card shows again, holding none", JSON.stringify(after));
    await page.keyboard.press("Escape");
    await undo(t);
    t.check(JSON.stringify(rowsIn(await t.read())) === JSON.stringify(rowsIn(before)), "one undo: the records as they were", JSON.stringify(rowsIn(await t.read()).map((row) => row[4])));
    // A day's +: a record of that day, opened.
    await page.mouse.move(...Object.values(await spot(t, '.doc-database-app .cal-day[data-day="2026-11-26"]')));
    await t.sleep(200);
    await page.mouse.click(...Object.values(await spot(t, '.doc-database-app .cal-day[data-day="2026-11-26"] .hover-only')));
    await t.settle();
    rows = rowsIn(await t.read());
    const peek = await page.evaluate(() => Boolean(document.querySelector(".doc-database-app .peek, .doc-database-pages[data-doc-peek]")));
    t.check(rows.length === 4 && rows[3][4] === "2026-11-26" && peek, "a day's +: a record of that day, opened", JSON.stringify(rows.map((row) => row[4])));
    await page.keyboard.press("Escape");
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // A wall of cards and a list: a card and a line pressed open their record; a card's ··· (flat, no shadow) gives its
  // menu; the round + past the last makes a record, opened.
  async databaseCardsOpen(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${ALL}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    await showView(t, 4);
    await page.mouse.click(...Object.values(await spot(t, ".doc-database-app .gallery > .card", { words: "公式引擎", dx: 60, dy: 50 })));
    await t.sleep(350);
    t.check((await peekTitle(t))?.includes("公式引擎"), "a card pressed: its record open", String(await peekTitle(t)));
    await page.keyboard.press("Escape");
    await t.sleep(250);
    // The ···: Gallery's flat button, its menu.
    const card = await spot(t, ".doc-database-app .gallery > .card", { words: "登录页改版", dx: 60, dy: 30 });
    await page.mouse.move(card.x, card.y);
    await t.sleep(200);
    const flat = await page.evaluate(() => {
      const more = [...document.querySelectorAll(".doc-database-app .gallery > .card")].find((node) => node.textContent.includes("登录页改版")).querySelector(".card-more");
      const style = getComputedStyle(more);
      return { shadow: style.boxShadow, fill: style.backgroundColor, shown: style.opacity };
    });
    t.check(flat.shadow === "none" && flat.fill === "rgba(0, 0, 0, 0)" && flat.shown === "1", "its ···: no shadow, no fill at rest", JSON.stringify(flat));
    await shoot(t, "gallery-card-hover");
    await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .gallery > .card")].find((node) => node.textContent.includes("登录页改版")).querySelector(".card-more").click());
    await t.sleep(250);
    const menu = await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .popover .menu-item")].map((row) => row.textContent.trim()));
    t.check(menu.includes("创建副本") && menu.includes("删除"), "its menu", JSON.stringify(menu));
    await page.keyboard.press("Escape");
    // The round + past the last card: a record, opened.
    const end = await spot(t, ".doc-database-app .gallery .end-zone");
    await page.mouse.move(end.x, end.y);
    await t.sleep(250);
    await page.mouse.click(end.x, end.y);
    await t.settle();
    t.check(rowsIn(await t.read()).length === 4 && Boolean(await peekTitle(t) !== null), "the round +: a record, opened", JSON.stringify(rowsIn(await t.read()).length));
    await page.keyboard.press("Escape");
    await t.sleep(250);
    // The list: a line pressed.
    await showView(t, 3);
    await page.mouse.click(...Object.values(await spot(t, ".doc-database-app .list-row", { words: "公式引擎" })));
    await t.sleep(350);
    t.check((await peekTitle(t))?.includes("公式引擎"), "a line pressed: its record open", String(await peekTitle(t)));
    await page.keyboard.press("Escape");
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // A layout's own settings in the view's settings (布局): a board's card size and what its columns are by, each
  // written into the view (one step of undo) and drawn at once.
  async databaseLayoutSettings(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>
    ${ALL}
    <p>后文</p>`));
    await t.open();
    await drawn(t);
    await showView(t, 1);
    const row = (words) => page.evaluate((words) => [...document.querySelectorAll(".doc-database-app .popover .menu-item")].find((node) => node.textContent.includes(words)).click(), words);
    await page.evaluate(() => document.querySelector(".doc-database-app .tool-settings").click());
    await t.sleep(250);
    await row("布局");
    await t.sleep(250);
    await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .popover .seg button")].find((button) => button.textContent === "大").click());
    await t.settle();
    const size = await page.evaluate(() => [document.querySelector(".doc-database-app .board").className, document.querySelector(".doc-database-app .board-col").getBoundingClientRect().width]);
    t.check(boardIn(await t.read())?.cardSize === "l" && size[0].includes("size-l") && Math.round(size[1]) === 324, "大: the view's card size in the file, its columns wider", JSON.stringify([boardIn(await t.read()), size]));
    await row("分栏依据");
    await t.sleep(250);
    await row("负责人");
    await t.settle();
    const columns = await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .board-col")].map((column) => column.dataset.col));
    t.check(boardIn(await t.read())?.boardBy === "owner" && JSON.stringify(columns) === JSON.stringify(["林夏", "周舟"]), "its columns by 负责人", JSON.stringify([boardIn(await t.read()), columns]));
    await page.keyboard.press("Escape");
    await undo(t);
    t.check(boardIn(await t.read())?.boardBy === "status", "one undo: by 状态 again", JSON.stringify(boardIn(await t.read())));
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // In an export each layout of cards draws its records read-only: no ···, no +, no column's menu, nothing moves
  // when dragged; a card still opens its record, a calendar still goes from month to month.
  async databaseLayoutsExport(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>
    ${ALL}
    <p>后文</p>`));
    const url = t.exportReport();
    const errors = [];
    const listen = (message) => { if (message.type() === "error") errors.push(message.text()); };
    page.on("console", listen);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url, { waitUntil: "load" });
    await page.waitForSelector(".doc-database-app .db-head", { timeout: 15000 });
    const shown = (selector) => page.evaluate((selector) => [...document.querySelectorAll(selector)].filter((node) => node.getClientRects().length > 0 && !node.closest("[hidden]")).length, selector);
    const tools = ".doc-database-app :is(.card-more, .end-plus, .board-acts, .col-add-zone, .cal-day .icon-btn)";
    const seen = {};
    for (const [index, name] of [[1, "board"], [2, "calendar"], [3, "list"], [4, "gallery"]]) {
      await showView(t, index);
      seen[name] = await shown(tools);
    }
    t.check(Object.values(seen).every((count) => count === 0), "no control of editing in any layout", JSON.stringify(seen));
    await showView(t, 1);
    const before = await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .board-col")].map((column) => `${column.dataset.col}:${column.querySelectorAll(".card").length}`).join());
    await dragFrom(t, await spot(t, ".doc-database-app .card", { words: "日历视图", dx: 30, dy: 14 }), await spot(t, ".doc-database-app .card", { words: "公式引擎", dx: 30, dy: 6 }));
    const after = await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .board-col")].map((column) => `${column.dataset.col}:${column.querySelectorAll(".card").length}`).join());
    t.check(before === after, "a card dragged moves nothing", JSON.stringify([before, after]));
    await page.mouse.click(...Object.values(await spot(t, ".doc-database-app .card", { words: "公式引擎", dx: 40, dy: 12 })));
    await t.sleep(300);
    t.check((await peekTitle(t))?.includes("公式引擎"), "a card opens its record", String(await peekTitle(t)));
    await page.keyboard.press("Escape");
    await showView(t, 2);
    const month = await page.evaluate(() => document.querySelector(".doc-database-app .cal-title").textContent);
    await page.evaluate(() => document.querySelectorAll(".doc-database-app .cal-head .icon-btn")[1].click());
    await t.sleep(150);
    const next = await page.evaluate(() => document.querySelector(".doc-database-app .cal-title").textContent);
    t.check(month !== next, "the calendar goes to the next month", JSON.stringify([month, next]));
    page.off("console", listen);
    t.check(errors.length === 0, "no errors in the export", JSON.stringify(errors));
  },

  // A board with no select to make columns of, a calendar with no date: each says so, writing nothing as it shows, and
  // offers to choose one: its button opens the view's settings at its layout.
  async databaseLayoutsEmpty(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>
    <div class="doc-database">
      <script type="application/json">{ "columns": [{ "id": "title", "name": "任务", "type": "title" }, { "id": "owner", "name": "负责人", "type": "text" }], "views": [{ "id": "v1", "name": "看板", "layout": "board" }, { "id": "v2", "name": "日历", "layout": "calendar" }] }</script>
      <table>
        <thead><tr><th data-column="title">任务</th><th data-column="owner">负责人</th></tr></thead>
        <tbody><tr><td>写方案</td><td>林夏</td></tr><tr><td>评审</td><td>周舟</td></tr></tbody>
      </table>
    </div>
    <p>后文</p>`));
    await t.open();
    await drawn(t);
    await t.settle();
    await look(t, "light", "zh");
    const before = await t.read();
    const said = await page.evaluate(() => document.querySelector(".doc-database-app .db-body .empty-state")?.textContent);
    t.check(said?.includes("看板按一个单选属性分栏") && said.includes("选择分栏依据"), "a board with no select says so and offers to choose one", String(said));
    await toTop(t);
    await shoot(t, "board-empty");
    await page.evaluate(() => document.querySelector(".doc-database-app .db-body .empty-state button").click());
    await t.sleep(300);
    const settings = await page.evaluate(() => ({ title: document.querySelector(".doc-database-app .popover .page-title")?.textContent, rows: [...document.querySelectorAll(".doc-database-app .popover .menu-item")].map((row) => row.textContent.trim()) }));
    t.check(settings.title === "布局" && settings.rows.some((words) => words.startsWith("分栏依据")), "its button: the view's settings at its layout, 分栏依据 there", JSON.stringify(settings));
    await page.keyboard.press("Escape");
    await t.sleep(200);
    await showView(t, 1);
    const calendar = await page.evaluate(() => document.querySelector(".doc-database-app .db-body .empty-state")?.textContent);
    t.check(calendar?.includes("日历按一个日期属性排布") && calendar.includes("选择日期依据"), "a calendar with no date says so and offers to choose one", String(calendar));
    await t.sleep(300);
    t.check((await t.state()) === "saved" && (await t.read()) === before, "nothing written as they show");
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },
  // The edges of what scrolls in a database (the user's 2026-11-24): the board within the database's own edges (no
  // card past them, where the page's selection of the block ends), fading at an edge columns lie past, its cards in
  // their column's color family in the dark too; the table's right edge fading while columns lie past it; a cell's options running on to just inside its line and fading
  // there, not cut short; a header's name not moving as it turns into the field it is typed in; a tab pressed
  // that stands partly past the row's edge sliding in whole.
  async databaseEdges(t) {
    const { page } = t;
    await t.agentEdit(pageOf("产品迭代任务", `<p>前文</p>
    ${SAMPLE}
    <p>后文</p>`));
    await t.open();
    await drawn(t);
    await t.settle();
    await look(t, "light", "zh");
    let before = await t.read();
    await showView(t, 1);
    await toTop(t);
    const board = () => page.evaluate(() => {
      const node = document.querySelector(".doc-database-app .board");
      const host = document.querySelector(".doc-database").getBoundingClientRect();
      const box = node.getBoundingClientRect();
      return { inside: box.left >= host.left - 0.5 && box.right <= host.right + 0.5, start: node.classList.contains("more-start"), end: node.classList.contains("more-end"), mask: getComputedStyle(node).maskImage, room: node.scrollWidth - node.clientWidth };
    });
    const scrollBoard = async (to) => { await page.evaluate((to) => { const node = document.querySelector(".doc-database-app .board"); node.scrollLeft = to === "end" ? node.scrollWidth : to; }, to); await t.sleep(250); };
    let seen = await board();
    t.check(seen.inside && seen.room > 50, "the board scrolls within the database's edges", JSON.stringify(seen));
    t.check(!seen.start && seen.end && seen.mask.includes("linear-gradient"), "at its start: its right edge fades, its left does not", JSON.stringify(seen));
    // The fades follow the scroll itself (the scroll's progress drives them, in the frame the board moves in: a fast
    // swipe left the classes' fade a step behind): 5px scrolled, a 5px fade at the start; 4px from the end, 4px there.
    const follows = await page.evaluate(async () => {
      if (!CSS.supports("animation-timeline: scroll()")) return { skipped: true };
      const node = document.querySelector(".doc-database-app .board");
      const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      node.scrollLeft = 5;
      await frame();
      const start = getComputedStyle(node).getPropertyValue("--board-fade-start");
      node.scrollLeft = node.scrollWidth - node.clientWidth - 4;
      await frame();
      const end = getComputedStyle(node).getPropertyValue("--board-fade-end");
      node.scrollLeft = 0;
      await frame();
      return { start, end };
    });
    t.check(follows.skipped || (follows.start === "5px" && follows.end === "4px"), "the fades follow the scroll itself", JSON.stringify(follows));
    // Swiped sideways, then the wheel turned down over it: the page scrolls, the board never up or down (the user's
    // 2026-11-24: the wheel moved the board up and down and not the page).
    const over = await page.evaluate(() => { const r = document.querySelector(".doc-database-app .board").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 60 }; });
    await page.mouse.move(over.x, over.y);
    await page.mouse.wheel({ deltaX: 120 });
    await t.sleep(150);
    const pageBefore = await page.evaluate(() => scrollY);
    for (let turn = 0; turn < 3; turn++) {
      await page.mouse.wheel({ deltaY: 100 });
      await t.sleep(120);
    }
    const wheeled = await page.evaluate((before) => { const node = document.querySelector(".doc-database-app .board"); return { boardTop: node.scrollTop, overflowY: getComputedStyle(node).overflowY, page: scrollY - before }; }, pageBefore);
    t.check(wheeled.boardTop === 0 && wheeled.overflowY === "hidden" && wheeled.page > 0, "the wheel down over the board scrolls the page, never the board", JSON.stringify(wheeled));
    await page.evaluate(() => { document.querySelector(".doc-database-app .board").scrollLeft = 0; });
    await toTop(t);
    await scrollBoard(Math.round(seen.room / 2));
    seen = await board();
    t.check(seen.start && seen.end, "scrolled halfway: both edges fade", JSON.stringify(seen));
    await scrollBoard("end");
    seen = await board();
    t.check(seen.start && !seen.end, "at its end: its left edge alone", JSON.stringify(seen));
    await scrollBoard(0);
    await look(t, "dark", "zh");
    const card = await page.evaluate(() => {
      const column = [...document.querySelectorAll(".doc-database-app .board-col")].find((node) => node.textContent.includes("进行中"));
      return getComputedStyle(column.querySelector(".card")).backgroundColor;
    });
    const [r, , b] = rgbOf(card);
    t.check(b > r + 8 && r < 80, "dark: a card on 进行中 a dark ground of its blue", card);
    await look(t, "light", "zh");
    // The table: a narrow column's options run on and fade; a header's name stays where it was as it is typed.
    await showView(t, 0);
    await toTop(t);
    // Its handle on the middle line of its tabs' row (its data's words in a <script> take no room: passed by).
    const tabRow = await page.evaluate(() => { const r = document.querySelector(".doc-database-app .tab.on").getBoundingClientRect(); return { x: r.left + 30, y: r.top + r.height / 2 }; });
    await page.mouse.move(tabRow.x, tabRow.y, { steps: 4 });
    await t.sleep(300);
    const grip = await page.evaluate(() => { const r = document.querySelector(".ge-handle .ge-grip")?.getBoundingClientRect(); return r ? r.top + r.height / 2 : null; });
    t.check(grip !== null && Math.abs(grip - tabRow.y) <= 1, "its handle on its tabs' middle line", JSON.stringify({ grip, tabs: tabRow.y }));
    const tableEdge = () => page.evaluate(() => { const wrap = document.querySelector(".doc-database-app .tbl-wrap"); return { more: wrap.classList.contains("more-end"), mask: getComputedStyle(wrap).maskImage, room: wrap.scrollWidth - wrap.clientWidth }; });
    let edge = await tableEdge();
    t.check(edge.room > 50 && edge.more && edge.mask.includes("linear-gradient"), "the table: its right edge fades while columns lie past it", JSON.stringify(edge));
    await page.evaluate(() => { const wrap = document.querySelector(".doc-database-app .tbl-wrap"); wrap.scrollLeft = wrap.scrollWidth; });
    await t.sleep(250);
    edge = await tableEdge();
    t.check(!edge.more, "scrolled to its end: no fade", JSON.stringify(edge));
    await page.evaluate(() => { document.querySelector(".doc-database-app .tbl-wrap").scrollLeft = 0; });
    await t.sleep(150);
    await page.evaluate(() => { for (const node of document.querySelectorAll('.doc-database-app [data-prop="tags"], .doc-database-app [data-head="tags"]')) node.style.width = "84px"; });
    const tags = await page.evaluate(() => {
      const cell = [...document.querySelectorAll('.doc-database-app .td[data-prop="tags"]')].find((node) => node.querySelectorAll(".pill").length > 1);
      const wrap = cell.querySelector(":scope > .cell-tags");
      const line = cell.getBoundingClientRect().right - parseFloat(getComputedStyle(cell).borderRightWidth);
      return { wrap: Boolean(wrap), reach: wrap && Math.abs(wrap.getBoundingClientRect().right - line) < 1, past: wrap && wrap.scrollWidth > wrap.clientWidth, mask: wrap && getComputedStyle(wrap).maskImage };
    });
    t.check(tags.wrap && tags.reach && tags.past && tags.mask.includes("linear-gradient"), "a cell's options run on to its line and fade there", JSON.stringify(tags));
    const name = await page.evaluate(() => {
      const th = document.querySelectorAll(".doc-database-app .th[data-head]")[1];
      const rect = th.querySelector(".th-name").getBoundingClientRect();
      const style = getComputedStyle(th);
      return { top: rect.top, height: rect.height, line: style.lineHeight, tall: style.height, x: rect.left + 20, y: rect.top + rect.height / 2 };
    });
    await page.mouse.click(name.x, name.y);
    await t.sleep(250);
    const field = await page.evaluate(() => {
      const input = document.querySelector(".doc-database-app .th.head-edit .th-input");
      const rect = input?.getBoundingClientRect();
      return rect ? { top: rect.top, height: rect.height, focused: document.activeElement === input, all: getSelection().toString() === input.value } : null;
    });
    // A press soon after, which the system counts as the opening click's second: a caret where it lands, the words
    // not selected again; then the words selected again for what follows.
    await page.mouse.move(name.x - 8, name.y);
    await page.mouse.down({ clickCount: 2 });
    await page.mouse.up({ clickCount: 2 });
    await t.sleep(100);
    const caret = await page.evaluate(() => ({ collapsed: getSelection().isCollapsed, editing: Boolean(document.querySelector(".doc-database-app .th.head-edit")) }));
    t.check(field?.all && caret.collapsed && caret.editing, "its words selected as it opens; a second press soon after puts a caret there", JSON.stringify({ field, caret }));
    await page.evaluate(() => document.querySelector(".doc-database-app .th.head-edit .th-input").select());
    t.check(field?.focused && Math.abs(field.top - name.top) < 0.5 && Math.abs(field.height - name.height) < 0.5, "its field over its name exactly, on the same line", JSON.stringify({ name, field }));
    // The field is the name's words made editable (an input set its words a device pixel lower at some screen
    // scales): the same font, line and words where the name's were.
    const same = await page.evaluate(() => {
      const input = document.querySelector(".doc-database-app .th.head-edit .th-input");
      const range = document.createRange();
      range.selectNodeContents(input);
      const words = range.getBoundingClientRect();
      return { tag: input.localName, editable: input.isContentEditable, left: words.left, top: words.top, font: getComputedStyle(input).font, head: getComputedStyle(input.closest(".th")).font };
    });
    t.check(same.tag !== "input" && same.editable && same.font === same.head, "the field: the name's own words made editable, in the header's font", JSON.stringify(same));
    // Its words selected by a drag from past their end back over them: the column stays where it is.
    const box = await page.evaluate(() => {
      const th = document.querySelector(".doc-database-app .th.head-edit");
      const input = th.querySelector(".th-input");
      const range = document.createRange();
      range.selectNodeContents(input);
      const words = range.getBoundingClientRect();
      return { from: { x: Math.min(th.getBoundingClientRect().right - 12, words.right + 30), y: words.top + words.height / 2 }, to: { x: words.left + 2, y: words.top + words.height / 2 }, order: [...document.querySelectorAll(".doc-database-app .th[data-head]")].map((node) => node.dataset.head).join() };
    });
    await page.mouse.move(box.from.x, box.from.y);
    await page.mouse.down();
    await page.mouse.move(box.to.x, box.to.y, { steps: 12 });
    const held = await page.evaluate(() => ({ moving: Boolean(document.querySelector(".doc-database-app .th.moving, .doc-database-app .tghost")), picked: getSelection().toString() }));
    await page.mouse.up();
    await t.sleep(150);
    const order = await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .th[data-head]")].map((node) => node.dataset.head).join());
    t.check(!held.moving && held.picked.length > 0 && order === box.order, "its words selected by a drag, the column not dragged", JSON.stringify({ held, order, was: box.order }));
    // A line break pasted is a space: the field stays one line.
    await page.evaluate(() => {
      const input = document.querySelector(".doc-database-app .th.head-edit .th-input");
      input.focus();
      input.setSelectionRange(input.value.length);
      document.execCommand("insertText", false, "甲\n乙");
    });
    await t.sleep(100);
    const line = await page.evaluate(() => { const input = document.querySelector(".doc-database-app .th.head-edit .th-input"); return { value: input.value, elements: input.children.length }; });
    t.check(line.value.endsWith("甲 乙") && line.elements === 0, "a line break pasted into it is a space", JSON.stringify(line));
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await t.sleep(200);
    await t.settle();
    // Written as one line: the column's name in the file holds the space.
    const renamed = await t.read();
    const header = renamed.match(/<th data-column="status">([^<]*)<\/th>/)?.[1] ?? "";
    t.check(header.endsWith("甲 乙"), "the name written as one line", header);
    // An input method in it: what it composes stays in the field, the word it commits is the name.
    const third = await page.evaluate(() => {
      const rect = document.querySelectorAll(".doc-database-app .th[data-head]")[2].querySelector(".th-name").getBoundingClientRect();
      return { x: rect.left + 10, y: rect.top + rect.height / 2 };
    });
    await page.mouse.click(third.x, third.y);
    await t.sleep(250);
    await page.evaluate(() => { const input = document.querySelector(".doc-database-app .th.head-edit .th-input"); input.setSelectionRange(input.value.length); });
    const client = await page.createCDPSession();
    await client.send("Input.imeSetComposition", { text: "ke", selectionStart: 2, selectionEnd: 2 });
    const composing = await page.evaluate(() => document.querySelector(".doc-database-app .th.head-edit .th-input").value);
    await client.send("Input.insertText", { text: "可" });
    await client.detach();
    await t.sleep(100);
    const chosen = await page.evaluate(() => document.querySelector(".doc-database-app .th.head-edit .th-input").value);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await t.sleep(200);
    await t.settle();
    before = await t.read();
    const third_ = before.match(/<th data-column="priority">([^<]*)<\/th>/)?.[1] ?? "";
    t.check(composing === "优先级ke" && chosen === "优先级可" && third_ === "优先级可", "an input method: its letters in the field as it composes, the word chosen written", JSON.stringify({ composing, chosen, written: third_ }));
    // A cell's editor (a number's, a date's) opened by a click: the press soon after it, which the system counts as
    // that click's second or third, puts a caret where it lands, not the word or the line selected.
    for (const prop of ["est", "due"]) {
      const cell = await page.evaluate((prop) => {
        const td = document.querySelectorAll(`.doc-database-app .td[data-prop="${prop}"]`)[1];
        td.scrollIntoView({ block: "center", inline: "nearest" });
        const r = td.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }, prop);
      await page.mouse.click(cell.x, cell.y);
      await t.sleep(120);
      await page.mouse.click(cell.x, cell.y);
      await t.sleep(200);
      const opened = await page.evaluate(() => { const field = document.activeElement; return { tag: field?.localName, value: field?.value, start: field?.selectionStart, end: field?.selectionEnd }; });
      const word = await page.evaluate(() => { const field = document.activeElement; const r = field.getBoundingClientRect(); const style = getComputedStyle(field); return { x: r.left + parseFloat(style.paddingLeft) + 4, y: r.top + r.height / 2 }; });
      await page.mouse.move(word.x, word.y);
      await page.mouse.down({ clickCount: 3 });
      await page.mouse.up({ clickCount: 3 });
      await t.sleep(100);
      const after = await page.evaluate(() => { const field = document.activeElement; return { tag: field?.localName, start: field?.selectionStart, end: field?.selectionEnd, length: field?.value?.length }; });
      t.check(["input", "textarea"].includes(opened.tag) && after.start === after.end && after.start < after.length, `${prop}: a press soon after the editor opened puts a caret where it lands`, JSON.stringify({ opened, after }));
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await t.sleep(200);
    }
    before = await t.read();
    // A tab partly past the row's edge, pressed: the row slides (several frames) until it stands in whole.
    await page.setViewport({ width: 900, height: 900 });
    await t.sleep(300);
    const slide = await page.evaluate(async () => {
      const tabs = document.querySelector(".doc-database-app .tabs");
      const all = [...tabs.querySelectorAll(":scope > .tab")];
      const last = all[all.length - 1];
      const past = () => last.getBoundingClientRect().right - tabs.getBoundingClientRect().right;
      const before = past();
      last.click();
      const track = [];
      for (let frame = 0; frame < 40; frame++) {
        await new Promise((done) => requestAnimationFrame(done));
        track.push(Math.round(tabs.scrollLeft));
      }
      return { before, after: past(), steps: new Set(track).size, on: last.classList.contains("on") };
    });
    t.check(slide.before > 0 && slide.after <= -8 && slide.steps > 3 && slide.on, "a tab partly hidden, pressed: the row slides it in whole", JSON.stringify(slide));
    await t.sleep(300);
    t.check((await t.state()) === "saved" && (await t.read()) === before, "nothing written by any of it");
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },
};
