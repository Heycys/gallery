// Browser scenarios of a database's chart view (render/kit/database/views/chart.js), spread into scenarios.mjs: the
// sample database's 工时统计 (the sum of 估时 by 负责人) drawn as its records say, nothing written as it draws, a
// filter changing it; its kind, categories, measure and number set in the view's settings, each written into the
// view's chart, one step of undo each; the dark theme's colors; an export drawing it, in English where the page is;
// nothing to draw, and one category.
import fs from "node:fs/promises";
import path from "node:path";
import { SAMPLE } from "../fixtures/database/sample.mjs";

// GALLERY_TEST_SHOTS=<folder> keeps the pictures the scenarios take (none taken without it).
const SHOTS = process.env.GALLERY_TEST_SHOTS || null;

const pageOf = (title, body) => (text) => text.replace(/<script>[\s\S]*?<\/script>/g, "<script></script>").replace(/<main([^>]*)>[\s\S]*<\/main>/, `<main$1>
    <header class="doc-header"><h1 class="doc-title">${title}</h1></header>
    ${body}
  </main>`);
const withSample = pageOf("产品迭代任务", `<p>前文</p>\n    ${SAMPLE}\n    <p>后文</p>`);

const jsonIn = (text) => {
  const script = /<div class="doc-database"[\s\S]*?<script type="application\/json">([\s\S]*?)<\/script>/.exec(text)?.[1];
  return script ? JSON.parse(script) : null;
};
const chartIn = (text, id = "v5") => jsonIn(text)?.views.find((view) => view.id === id)?.chart ?? null;

// The picture of the database (and of a card open over it), kept where GALLERY_TEST_SHOTS says.
async function shoot(t, name) {
  if (!SHOTS) return;
  await fs.mkdir(SHOTS, { recursive: true });
  // No focus ring of a test's own focus, and a card that is closing gone.
  await t.page.evaluate(() => document.activeElement?.blur?.());
  await t.sleep(250);
  const clip = await t.page.evaluate(() => {
    const boxes = [document.querySelector(".doc-database"), ...document.querySelectorAll(".doc-database-app .popover")].filter(Boolean).map((node) => node.getBoundingClientRect());
    const left = Math.min(...boxes.map((box) => box.left)) - 16;
    const top = Math.min(...boxes.map((box) => box.top)) - 16;
    const right = Math.max(...boxes.map((box) => box.right)) + 16;
    const bottom = Math.max(...boxes.map((box) => box.bottom)) + 16;
    return { x: Math.max(0, left), y: Math.max(0, top + scrollY), width: right - Math.max(0, left), height: bottom - top };
  });
  await t.page.screenshot({ path: path.join(SHOTS, `${name}.png`), clip, captureBeyondViewport: true });
}

async function drawn(t) {
  await t.page.waitForFunction(() => document.querySelector(".doc-database-app .db-head") && document.documentElement.hasAttribute("data-ge-editing"), { polling: 50, timeout: 15000 });
  await t.sleep(200);
}

// The page's theme, whatever the system's is.
async function theme(t, name) {
  await t.page.evaluate((name) => { document.documentElement.setAttribute("data-doc-theme", name); dispatchEvent(new Event("doc-theme-change")); }, name);
  await t.sleep(150);
}

// The view of the tab named `name` shown.
// (By its name, or by its view's id: a tab's words come with the drawing's second update, which an export's
// first drawing has not had yet.)
async function showTab(t, name, id = null) {
  const found = await t.page.evaluate((name, id) => {
    const tabs = [...document.querySelectorAll(".doc-database-app .tab")];
    const tab = tabs.find((node) => node.textContent.trim() === name) ?? (id ? tabs.find((node) => node.dataset.key === id) : null);
    tab?.click();
    return tab ? true : [...document.querySelectorAll(".doc-database-app .tab")].map((node) => node.textContent.trim()).join("|");
  }, name, id);
  if (found !== true) throw new Error(`no tab ${name}: ${found}`);
  await t.sleep(250);
  await t.page.evaluate(() => document.querySelector(".doc-database")?.scrollIntoView({ block: "start" }));
  await t.sleep(100);
}

// What the chart draws: its head's words, and each category's words, value and mark (a donut's: its legend's rows).
const chartShown = (t) => t.page.evaluate(() => {
  const app = document.querySelector(".doc-database-app");
  const view = app.querySelector(".chart-view");
  const empty = app.querySelector(".db-body .empty-state");
  if (!view && !empty) return null;
  const caption = view?.querySelectorAll(".chart-caption > span") ?? [];
  const groups = [...(view?.querySelectorAll(".chart-svg > g") ?? [])].filter((g) => g.querySelector("rect"));
  const items = groups.map((g) => {
    const mark = g.querySelector("path.fill, circle.line-dot");
    const box = mark?.getBoundingClientRect();
    const words = [...g.querySelectorAll("text.axis")].pop();
    return {
      label: words?.textContent ?? "",
      value: g.querySelector("text.val")?.textContent ?? "",
      height: box ? Math.round(box.height) : 0,
      width: box ? Math.round(box.width) : 0,
      fill: mark ? getComputedStyle(mark).fill : "",
    };
  });
  return {
    title: caption[0]?.textContent.trim() ?? "",
    said: caption[1]?.textContent.trim() ?? "",
    edit: Boolean(view?.querySelector(".chart-caption .btn")),
    kind: view?.querySelector(".donut-svg") ? "donut" : view?.querySelector(".line-path") ? "line" : view?.querySelector(".axis.cat") ? "bar" : items.length ? "column" : "none",
    empty: empty?.textContent.trim() ?? null,
    keys: [...(view?.querySelectorAll(".legend-row") ?? [])].map((row) => row.textContent.trim()),
    items,
  };
});

// The chart's settings opened from its own button: the view's settings card at its layout.
async function openChartSettings(t) {
  await t.page.evaluate(() => document.querySelector(".doc-database-app .chart-caption .btn")?.click());
  await t.page.waitForSelector(".doc-database-app .popover .chart-kinds", { timeout: 5000 });
  await t.sleep(150);
}
const pressInCard = (t, selector, words) => t.page.evaluate((selector, words) => {
  const node = [...document.querySelectorAll(`.doc-database-app .popover ${selector}`)].find((each) => each.textContent.trim().includes(words));
  node?.click();
  return Boolean(node);
}, selector, words);

// Ctrl+Z with the focus in the database (its head), as a reader's undo of what they did there.
async function undo(t) {
  await t.page.keyboard.press("Escape");
  await t.page.evaluate(() => {
    const target = document.querySelector(".doc-database-app .db-head");
    target.setAttribute("tabindex", "-1");
    target.focus();
  });
  await t.combo("Control", "z");
  await t.settle();
  await t.sleep(200);
}

export const databaseChartScenarios = {
  // The sample's 工时统计 is the sum of 估时 by 负责人: four columns in the options' order and colors, their
  // values over them, the head saying what it shows, the total and the records; drawn, nothing is written.
  // Under the pointer a column says its value and share, the others fade. A filter of the view (状态 is 进行中)
  // draws it again from the records it lets through; one undo gives back the whole.
  async databaseChart(t) {
    const { page } = t;
    await t.agentEdit(withSample);
    await t.open();
    await drawn(t);
    await theme(t, "light");
    await t.settle();
    const before = await t.read();
    await showTab(t, "工时统计");
    await t.sleep(700);
    t.check((await t.state()) === "saved" && (await t.read()) === before, "the chart drawn, nothing written");
    let shown = await chartShown(t);
    const pairs = shown?.items.map((item) => `${item.label}=${item.value}`);
    t.check(JSON.stringify(pairs) === JSON.stringify(["林夏=49", "周舟=77", "陈默=41", "苏禾=58"]), "the sum of 估时 by 负责人, in the options' order", JSON.stringify(pairs));
    const heights = shown.items.map((item) => item.height);
    t.check(heights[1] === Math.max(...heights) && Math.abs(heights[0] / heights[1] - 49 / 77) < 0.03 && Math.abs(heights[2] / heights[1] - 41 / 77) < 0.03, "each column as tall as its value", JSON.stringify(heights));
    t.check(/^rgb/.test(shown.items[0].fill) && new Set(shown.items.map((item) => item.fill)).size === 4, "each column in its option's color", JSON.stringify(shown.items.map((item) => item.fill)));
    t.check(/估时之和/.test(shown.title) && /按负责人/.test(shown.title) && shown.said === "合计 225 · 18 条记录，跟随当前筛选" && shown.edit, "the head: what it shows, the total, the records; the edit button", JSON.stringify(shown));
    // The pointer on 周舟's column: its numbers by the pointer, the others fade.
    const at = await page.evaluate(() => {
      const box = document.querySelectorAll(".doc-database-app .chart-svg path.fill")[1].getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    });
    await page.mouse.move(at.x, at.y);
    await t.sleep(400);
    const hover = await page.evaluate(() => ({
      tip: document.querySelector(".doc-database-app .chart-tip")?.textContent ?? null,
      faded: [...document.querySelectorAll(".doc-database-app .chart-svg path.fill")].map((mark) => getComputedStyle(mark).opacity),
    }));
    t.check(hover.tip?.startsWith("周舟") && /77/.test(hover.tip) && /占 34%/.test(hover.tip) && hover.faded[1] === "1" && Number(hover.faded[0]) < 1, "under the pointer: its value and share, the others faded", JSON.stringify(hover));
    await shoot(t, "chart-column-light-zh");
    await page.mouse.move(5, 5);
    // A filter of the view: 状态 is 进行中.
    await page.evaluate(() => document.querySelector(".doc-database-app .tool-filter").click());
    await t.sleep(250);
    t.check(await pressInCard(t, ".menu-item", "状态"), "the filter's column picked");
    await t.sleep(250);
    t.check(await pressInCard(t, ".fe-opt", "进行中"), "its option picked");
    await page.keyboard.press("Escape");
    await t.settle();
    await t.sleep(300);
    const filters = jsonIn(await t.read()).views.find((view) => view.id === "v5").filters;
    t.check(filters?.length === 1 && filters[0].prop === "status", "the filter is the view's, in the file", JSON.stringify(filters));
    shown = await chartShown(t);
    t.check(JSON.stringify(shown.items.map((item) => `${item.label}=${item.value}`)) === JSON.stringify(["林夏=16", "周舟=54", "陈默=22", "苏禾=0"]) && shown.said === "合计 92 · 5 条记录，跟随当前筛选", "the chart of the records the filter lets through", JSON.stringify(shown));
    await shoot(t, "chart-filtered");
    await undo(t);
    shown = await chartShown(t);
    t.check(shown.said === "合计 225 · 18 条记录，跟随当前筛选" && (jsonIn(await t.read()).views.find((view) => view.id === "v5").filters ?? []).every((filter) => !filter.value?.length), "one undo: the filter chooses nothing, the whole again", JSON.stringify(shown?.said));
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // Its settings, opened from its own button over the chart (the view's settings at its layout): the kind, the
  // categories, the measure and the number, each written into the view's chart, the drawing following, one
  // Ctrl+Z each giving back the chart before it.
  async databaseChartSettings(t) {
    const { page } = t;
    await t.agentEdit(withSample);
    await t.open();
    await drawn(t);
    await theme(t, "light");
    await showTab(t, "工时统计");
    await openChartSettings(t);
    await shoot(t, "chart-settings-zh");
    const start = chartIn(await t.read());
    const step = async (label, run, expect, drawnAs) => {
      const ok = await run();
      await t.settle();
      await t.sleep(250);
      const now = chartIn(await t.read());
      t.check(ok && JSON.stringify(now) === JSON.stringify(expect), `${label}: written into the view's chart`, JSON.stringify(now));
      const shown = await chartShown(t);
      t.check(drawnAs(shown), `${label}: drawn so`, JSON.stringify(shown));
      return shown;
    };
    // The kind: bars, a line, a donut; each one step.
    await step("bars", () => pressInCard(t, ".chart-kinds .layout-btn", "条形图"), { ...start, kind: "bar" }, (shown) => shown.kind === "bar" && shown.items.length === 4);
    await page.keyboard.press("Escape");
    await shoot(t, "chart-bar-light-zh");
    await undo(t);
    t.check(JSON.stringify(chartIn(await t.read())) === JSON.stringify(start) && (await chartShown(t)).kind === "column", "one undo: columns again", JSON.stringify(chartIn(await t.read())));
    await openChartSettings(t);
    await step("a line", () => pressInCard(t, ".chart-kinds .layout-btn", "折线图"), { ...start, kind: "line" }, (shown) => shown.kind === "line" && shown.items.every((item) => item.value));
    await page.keyboard.press("Escape");
    await shoot(t, "chart-line-light-zh");
    await openChartSettings(t);
    await step("a donut", () => pressInCard(t, ".chart-kinds .layout-btn", "环形图"), { ...start, kind: "donut" }, (shown) => shown.kind === "donut" && shown.keys.length === 4 && shown.keys[1].includes("周舟") && shown.keys[1].includes("77") && shown.keys[1].includes("34%"));
    await page.keyboard.press("Escape");
    await shoot(t, "chart-donut-light-zh");
    // The pointer on 周舟's legend row: its slice stands out, the middle says its value.
    await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .legend-row")][1].dispatchEvent(new MouseEvent("mouseenter")));
    await t.sleep(150);
    const middle = await page.evaluate(() => ({
      words: [...document.querySelectorAll(".doc-database-app .donut-svg text")].map((node) => node.textContent).join(""),
      faded: [...document.querySelectorAll(".doc-database-app .donut-svg path.fill")].map((slice) => getComputedStyle(slice).opacity),
    }));
    t.check(middle.words === "77周舟" && middle.faded[1] === "1" && Number(middle.faded[0]) < 1, "a legend row under the pointer: its slice stands out, the middle says it", JSON.stringify(middle));
    await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .legend-row")][1].dispatchEvent(new MouseEvent("mouseleave")));
    await undo(t);
    t.check(chartIn(await t.read()).kind === "line", "one undo: the line again");
    await undo(t);
    t.check(JSON.stringify(chartIn(await t.read())) === JSON.stringify(start), "and the columns");
    // The measure: a count of the records.
    await openChartSettings(t);
    await step("a count", () => pressInCard(t, ".seg button", "计数"), { ...start, agg: "count" }, (shown) => JSON.stringify(shown.items.map((item) => item.value)) === JSON.stringify(["5", "4", "5", "4"]) && /记录数/.test(shown.title) && shown.said === "合计 18 · 18 条记录，跟随当前筛选");
    await page.keyboard.press("Escape");
    await undo(t);
    t.check(JSON.stringify(chartIn(await t.read())) === JSON.stringify(start), "one undo: the sum again");
    // The categories: 优先级.
    await openChartSettings(t);
    await pressInCard(t, ".menu-item", "分类（横轴）");
    await t.sleep(200);
    await step("by 优先级", () => pressInCard(t, ".menu-item", "优先级"), { ...start, x: "priority" }, (shown) => JSON.stringify(shown.items.map((item) => `${item.label}=${item.value}`)) === JSON.stringify(["P0=78", "P1=106", "P2=41"]));
    await page.keyboard.press("Escape");
    await undo(t);
    t.check(JSON.stringify(chartIn(await t.read())) === JSON.stringify(start), "one undo: by 负责人 again");
    // The number: 剩余工时, a formula.
    await openChartSettings(t);
    await pressInCard(t, ".menu-item", "统计哪个数字");
    await t.sleep(200);
    await step("the sum of 剩余工时", () => pressInCard(t, ".menu-item", "剩余工时"), { ...start, y: "remain" }, (shown) => /剩余工时之和/.test(shown.title) && shown.items[1].value === "47.4");
    await page.keyboard.press("Escape");
    await undo(t);
    t.check(JSON.stringify(chartIn(await t.read())) === JSON.stringify(start), "one undo: 估时 again");
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // The dark theme: the columns in the nine colors' dark inks, the axis words and the grid's lines the dark theme's.
  async databaseChartDark(t) {
    const { page } = t;
    await t.agentEdit(withSample);
    await t.open();
    await drawn(t);
    await theme(t, "light");
    await showTab(t, "工时统计");
    const colorsOf = () => page.evaluate(() => ({
      mark: getComputedStyle(document.querySelector(".doc-database-app .chart-svg path.fill")).fill,
      axis: getComputedStyle(document.querySelector(".doc-database-app .chart-svg .axis")).fill,
      rule: getComputedStyle(document.querySelector(".doc-database-app .chart-svg .grid-line")).stroke,
      said: getComputedStyle(document.querySelector(".doc-database-app .chart-caption .muted")).color,
    }));
    const light = await colorsOf();
    await page.evaluate(() => { document.documentElement.setAttribute("data-doc-theme", "dark"); dispatchEvent(new Event("doc-theme-change")); });
    await t.sleep(300);
    const colors = await colorsOf();
    t.check(Object.keys(colors).every((key) => colors[key] !== light[key]), "the dark tokens: the option's ink, the axis, the grid and the head's words all the dark theme's", JSON.stringify({ light, colors }));
    await shoot(t, "chart-column-dark-zh");
    for (const [kind, name] of [["条形图", "bar"], ["折线图", "line"], ["环形图", "donut"]]) {
      await openChartSettings(t);
      if (name === "bar") await shoot(t, "chart-settings-dark-zh");
      await pressInCard(t, ".chart-kinds .layout-btn", kind);
      await t.settle();
      await page.keyboard.press("Escape");
      await t.sleep(250);
      await shoot(t, `chart-${name}-dark-zh`);
    }
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // Gallery in English (data-ge-language): the head, its button, the empty words and the settings in English,
  // each kind drawn; the categories' and columns' names as the file has them.
  async databaseChartEnglish(t) {
    const { page } = t;
    await t.agentEdit(withSample);
    await t.open();
    await drawn(t);
    await theme(t, "light");
    await page.evaluate(() => document.documentElement.setAttribute("data-ge-language", "en"));
    await showTab(t, "工时统计");
    let shown = await chartShown(t);
    t.check(/^Sum of 估时/.test(shown.title) && /by 负责人$/.test(shown.title) && shown.said === "Total 225 · 18 records, as filtered", "the head in English", JSON.stringify(shown));
    const button = await page.evaluate(() => document.querySelector(".doc-database-app .chart-caption .btn")?.textContent);
    t.check(button === "Edit the chart", "its button", button);
    await shoot(t, "chart-column-light-en");
    await openChartSettings(t);
    const rows = await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .popover .menu-item, .doc-database-app .popover .layout-btn")].map((row) => row.textContent.trim()));
    t.check(["Column", "Bar", "Line", "Donut"].every((kind) => rows.includes(kind)) && rows.some((row) => row.startsWith("Categories (x axis)")) && rows.some((row) => row.startsWith("Which number")), "the chart's settings in English", JSON.stringify(rows));
    const layouts = await page.evaluate(() => ({ grids: document.querySelectorAll(".doc-database-app .popover .layout-grid:not(.chart-kinds)").length, head: document.querySelector(".doc-database-app .popover .page-head, .doc-database-app .popover .menu-heading")?.textContent.trim() }));
    t.check(layouts.grids === 0, "the chart's own button: its chart alone, no layouts to choose", JSON.stringify(layouts));
    await shoot(t, "chart-settings-en");
    for (const [kind, name] of [["Bar", "bar"], ["Line", "line"], ["Donut", "donut"]]) {
      if (!(await page.$(".doc-database-app .popover .chart-kinds"))) await openChartSettings(t);
      await pressInCard(t, ".chart-kinds .layout-btn", kind);
      await t.settle();
      await page.keyboard.press("Escape");
      await shoot(t, `chart-${name}-light-en`);
    }
    shown = await chartShown(t);
    t.check(shown.kind === "donut" && shown.keys[1].includes("周舟"), "the donut", JSON.stringify(shown.keys));
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // An export: the chart drawn in the offline file as on the page; a page in English says it in English.
  async databaseChartExport(t) {
    const { page } = t;
    await t.agentEdit((text) => withSample(text).replace(/<html lang="[^"]*"/, '<html lang="en"'));
    const url = t.exportReport();
    const errors = [];
    const listen = (message) => { if (message.type() === "error") errors.push(message.text()); };
    page.on("console", listen);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url, { waitUntil: "load" });
    await page.waitForSelector(".doc-database-app .db-head", { timeout: 15000 });
    await t.sleep(300);
    await theme(t, "light");
    await showTab(t, "工时统计", "v5");
    await t.sleep(300);
    const shown = await chartShown(t);
    t.check(JSON.stringify(shown?.items.map((item) => `${item.label}=${item.value}`)) === JSON.stringify(["林夏=49", "周舟=77", "陈默=41", "苏禾=58"]), "the export draws the chart", JSON.stringify(shown));
    t.check(/^Sum of 估时/.test(shown.title) && /by 负责人$/.test(shown.title) && shown.said === "Total 225 · 18 records, as filtered", "in English", JSON.stringify(shown));
    await shoot(t, "chart-column-light-en-export");
    page.off("console", listen);
    t.check(errors.length === 0, "no errors in the export", JSON.stringify(errors));
  },

  // What it draws from every database: nothing to draw yet (no column of categories: the words and a button to set
  // it up), one category alone.
  async databaseChartStates(t) {
    const { page } = t;
    const views = (list) => (text) => text.replace(/"views": \[[\s\S]*?\n {8}\]/, `"views": ${JSON.stringify(list)}`);
    await t.agentEdit((text) => views([
      { id: "v1", name: "没设置", layout: "chart" },
      { id: "v2", name: "一类", layout: "chart", chart: { kind: "column", x: "priority", agg: "count" } },
      { id: "v3", name: "按日期", layout: "chart", chart: { kind: "column", x: "due", agg: "sum", y: "est" } },
      { id: "v4", name: "条形", layout: "chart", chart: { kind: "bar", x: "due", agg: "avg", y: "progress" } },
    ])(withSample(text)).replace(/<td>P[12]<\/td>/g, "<td>P0</td>"));
    await t.open();
    await drawn(t);
    await theme(t, "light");
    await t.settle();
    const before = await t.read();
    let shown = await chartShown(t);
    t.check(shown?.empty?.includes("选一个属性作为分类") && shown.empty.includes("设置图表"), "no categories: what to do, and the button", JSON.stringify(shown));
    await shoot(t, "chart-empty-zh");
    await page.evaluate(() => document.querySelector(".doc-database-app .db-body .empty-state .btn").click());
    await page.waitForSelector(".doc-database-app .popover .chart-kinds", { timeout: 5000 });
    t.check(true, "the button opens the chart's settings");
    await page.keyboard.press("Escape");
    await showTab(t, "一类");
    shown = await chartShown(t);
    t.check(JSON.stringify(shown.items.map((item) => `${item.label}=${item.value}`)) === JSON.stringify(["P0=18", "P1=0", "P2=0"]) && shown.items[0].width <= 56, "one category: one column, the options with none at 0", JSON.stringify(shown.items));
    await shoot(t, "chart-one-zh");
    t.check((await t.read()) === before, "nothing written as views of charts are drawn");
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // Its colors (the settings' 颜色 › page): 自动 at first (each category its option's color); one of the nine picked,
  // written into the view's chart as its color, every category a shade of it (the first the deepest, each apart from
  // the others, all of that hue, the palest still clear of the page) in light and in dark, a donut's legend in the same
  // shades, a line in its ink; one Ctrl+Z each giving back the colors before; an export drawing the shades the file
  // says.
  async databaseChartColors(t) {
    const { page } = t;
    await t.agentEdit(withSample);
    await t.open();
    await drawn(t);
    await theme(t, "light");
    await showTab(t, "工时统计");
    const start = chartIn(await t.read());
    // A color as the screen shows it, [r, g, b] (a color-mix() computes to oklab or color(): painted to read it back).
    const rgbOf = (colors) => page.evaluate((colors) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      return colors.map((color) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)]; });
    }, colors);
    const rgb = async (color) => (await rgbOf([color]))[0];
    const fills = async () => rgbOf((await chartShown(t)).items.map((item) => item.fill));
    const ground = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    // Relative luminance and contrast (WCAG), for "clear of the page".
    const lum = ([r, g, b]) => [r, g, b].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((sum, v, at) => sum + v * [0.2126, 0.7152, 0.0722][at], 0);
    const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const auto = await fills();
    t.check(auto.length === 4 && new Set(auto.map(String)).size === 4, "自动: four columns in their options' colors", JSON.stringify(auto));
    // The settings' row and its page.
    await openChartSettings(t);
    const row = await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .popover .menu-item")].find((node) => node.textContent.includes("颜色"))?.textContent.trim());
    t.check(row === "颜色自动", "the settings say 颜色 自动", row);
    await pressInCard(t, ".menu-item", "颜色");
    await t.sleep(200);
    const listed = await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .popover .menu-item")].map((node) => ({ words: node.textContent.trim(), checked: Boolean(node.querySelector(".menu-check")), ramp: node.querySelectorAll(".chart-ramp > span").length })));
    t.check(listed.length === 10 && listed[0].words === "自动" && listed[0].checked && listed.slice(1).map((each) => each.words).join() === "灰色,棕色,橙色,黄色,绿色,蓝色,紫色,粉色,红色" && listed.every((each) => each.ramp === 4), "its page: 自动 (checked) and the nine, each with four of its colors", JSON.stringify(listed));
    await shoot(t, "chart-colors-page");
    await pressInCard(t, ".menu-item", "蓝色");
    await t.settle();
    await t.sleep(250);
    t.check(JSON.stringify(chartIn(await t.read())) === JSON.stringify({ ...start, color: "blue" }), "written into the view's chart as its color", JSON.stringify(chartIn(await t.read())));
    await page.keyboard.press("Escape");
    await t.sleep(200);
    const blue = await fills();
    const lightness = blue.map(lum);
    t.check(blue.every(([r, g, b]) => b > r && b > g - 10) && lightness.every((each, at) => at === 0 || each > lightness[at - 1]) && new Set(blue.map(String)).size === 4, "four shades of blue, the first the deepest", JSON.stringify(blue));
    const page0 = await rgb(await ground());
    t.check(contrast(blue[3], page0) >= 1.5, "the palest clear of the page", String(contrast(blue[3], page0)));
    await shoot(t, "chart-blue-light-zh");
    // Dark: the same shades, the dark ones (the deepest the brightest), clear of the page.
    await theme(t, "dark");
    await t.sleep(200);
    const dark = await fills();
    const page1 = await rgb(await ground());
    t.check(dark.every(([r, g, b]) => b > r) && dark.every((each, at) => String(each) !== String(blue[at])) && dark.map(lum).every((each, at, all) => at === 0 || each < all[at - 1]) && contrast(dark[3], page1) >= 1.5, "dark: shades of blue, the deepest the brightest, the palest clear of the page", JSON.stringify({ dark, contrast: contrast(dark[3], page1) }));
    await shoot(t, "chart-blue-dark-zh");
    await theme(t, "light");
    // A donut: its slices and its legend's swatches the same shades.
    await openChartSettings(t);
    await pressInCard(t, ".chart-kinds .layout-btn", "环形图");
    await t.settle();
    await page.keyboard.press("Escape");
    await t.sleep(250);
    const donut = await page.evaluate(() => ({
      slices: [...document.querySelectorAll(".doc-database-app .donut-svg path.fill")].map((node) => getComputedStyle(node).fill),
      legend: [...document.querySelectorAll(".doc-database-app .legend-row .sw")].map((node) => getComputedStyle(node).backgroundColor),
    }));
    t.check(donut.slices.length === 4 && (await rgbOf(donut.slices)).join("|") === (await rgbOf(donut.legend)).join("|") && new Set((await rgbOf(donut.slices)).map(String)).size === 4, "a donut: its slices and its legend in the same four shades", JSON.stringify(donut));
    await shoot(t, "chart-blue-donut-light-zh");
    // A line: in the color's ink.
    await openChartSettings(t);
    await pressInCard(t, ".chart-kinds .layout-btn", "折线图");
    await t.settle();
    await page.keyboard.press("Escape");
    await t.sleep(250);
    const line = await page.evaluate(() => ({ line: getComputedStyle(document.querySelector(".doc-database-app .line-path")).stroke, dot: getComputedStyle(document.querySelector(".doc-database-app .line-dot")).stroke }));
    t.check((await rgb(line.line)).join() === "56,125,201" && line.dot === line.line, "a line in the blue's ink", JSON.stringify(line));
    // One Ctrl+Z each: the donut, the columns, and 自动 again (the file's chart as it was).
    await undo(t);
    await undo(t);
    t.check(JSON.stringify(chartIn(await t.read())) === JSON.stringify({ ...start, color: "blue" }), "two undos: the columns in blue", JSON.stringify(chartIn(await t.read())));
    await undo(t);
    t.check(JSON.stringify(chartIn(await t.read())) === JSON.stringify(start), "and one more: 自动 again, no color written", JSON.stringify(chartIn(await t.read())));
    t.check(JSON.stringify(await fills()) === JSON.stringify(auto), "drawn in its options' colors again", JSON.stringify(await fills()));
    // 自动 picked back from a color: none written.
    await openChartSettings(t);
    await pressInCard(t, ".menu-item", "颜色");
    await t.sleep(150);
    await pressInCard(t, ".menu-item", "红色");
    await t.settle();
    await openChartSettings(t);
    await pressInCard(t, ".menu-item", "颜色");
    await t.sleep(150);
    await pressInCard(t, ".menu-item", "自动");
    await t.settle();
    await t.sleep(200);
    t.check(JSON.stringify(chartIn(await t.read())) === JSON.stringify(start), "自动 picked again: the view's chart without a color", JSON.stringify(chartIn(await t.read())));
    t.check(t.takeErrors().length === 0, "no errors on the page");
    // An export: the shades the file says.
    await t.agentEdit((text) => text.replace(/("id": "v5",[\s\S]*?"chart": \{[^}]*?)("y": "est")/, '$1$2, "color": "green"'));
    t.check(chartIn(await t.read())?.color === "green", "the file says green", JSON.stringify(chartIn(await t.read())));
    const url = t.exportReport();
    await page.goto(url, { waitUntil: "load" });
    await page.waitForSelector(".doc-database-app .db-head", { timeout: 15000 });
    await t.sleep(300);
    await theme(t, "light");
    await showTab(t, "工时统计", "v5");
    await t.sleep(300);
    const exported = await fills();
    t.check(exported.length === 4 && exported.every(([r, g, b]) => g > r && g > b) && new Set(exported.map(String)).size === 4, "the export draws four shades of green", JSON.stringify(exported));
    await shoot(t, "chart-green-export");
  },
};
