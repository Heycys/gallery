// Browser scenarios of the scrollbars the kit draws (src/render/kit/scrollbar.js), spread into scenarios.mjs: a
// table frame's rails and a database's sideways one. Their thumbs follow the scroll on the compositor (a scroll
// timeline), so what is checked is what the browser draws: every composited frame of a slow scroll recorded
// (CDP's screencast) and read from its pixels, the content's place by the edges of a row's cells painted red and
// blue by turns, the thumb's by its color; and presses and drags on the rails, in either theme, at the narrow
// layout, in the exported file and on paper. Their giving way past an end is scroll-squeeze.mjs's.
import { SAMPLE } from "../fixtures/database/sample.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (value, places = 2) => (value === null || value === undefined ? value : Math.round(value * 10 ** places) / 10 ** places);
const median = (values) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; };
const DELTA = 1.5; // px of a touchpad's slow swipe, every EVERY ms
const EVERY = 8;

// A document of a wide table frame (40 columns of unlike widths, so that the edges of a row's cells say where the
// columns are) and a database, the page under them long enough to scroll.
async function writeDocument(t) {
  const row = (at) => `<tr>${Array.from({ length: 40 }, (_, index) => `<td>第${at}行${index + 1}列${"宽".repeat(index % 4)}</td>`).join("")}</tr>`;
  const rows = Array.from({ length: 60 }, (_, index) => `<tr><td>第 ${index + 1} 行</td><td>${index}</td></tr>`).join("");
  await t.agentEdit((text) => text.replace(/<script>[\s\S]*?<\/script>/g, "<script></script>").replace(/<main([^>]*)>[\s\S]*<\/main>/, `<main$1>
    <header class="doc-header"><h1 class="doc-title">滚动条</h1></header>
    <p>前文</p>
    <div class="doc-table-wrap" id="wide"><table class="doc-table"><tbody>${[1, 2, 3, 4, 5, 6].map(row).join("")}</tbody></table></div>
    <p>中间</p>
    <div class="doc-table-wrap" id="tall"><table class="doc-table"><thead><tr><th>行</th><th>值</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${SAMPLE}
    ${Array.from({ length: 30 }, (_, index) => `<p>后文第 ${index + 1} 段</p>`).join("")}
  </main>`));
}
const ready = (page) => page.waitForFunction(() => document.querySelector("#wide .doc-scrollbars[data-x]") && document.querySelector("#tall .doc-scrollbars[data-y]") && document.querySelector(".doc-database-app .tbl-frame .scroll-rail"), { polling: 50, timeout: 15000 }).catch(() => {});

const TARGETS = [
  { name: "a table frame's bottom thumb", scroller: "#wide", rail: "#wide .doc-scrollbar--x", cells: "#wide tr:nth-child(3) > *", scanFrom: 20 },
  { name: "a database table view's thumb", scroller: ".doc-database-app .tbl-wrap", rail: ".doc-database-app .tbl-frame .doc-scrollbar", cells: ".doc-database-app .tbl > .tr:nth-child(4) > .td", scanFrom: 300 },
];
// The row under the pointer and the one measured are the third of the frame and the fourth of the view: near the
// frame's top the page editor's column grip comes under the pointer. The editor's column separator (an overlay
// outside the frame, at the column edge nearest the pointer) lets the wheel through here: as the columns scroll
// under a still pointer an edge comes under it, the separator with it, and wheel events landing on it scroll
// nothing (the editor's, not the scrollbar's).
const PAINT = `
  .ge-tcol, .ge-tcol * { pointer-events: none !important; }
  :root:root { --doc-scrollbar-thumb: rgb(0 200 0) !important; --doc-scrollbar-thumb-active: rgb(0 200 0) !important; }
  #wide tr:nth-child(3) > :nth-child(odd), .doc-database-app .tbl > .tr:nth-child(4) > .td:nth-child(odd) { background: rgb(255 0 0) !important; color: rgb(255 0 0) !important; }
  #wide tr:nth-child(3) > :nth-child(even), .doc-database-app .tbl > .tr:nth-child(4) > .td:nth-child(even) { background: rgb(0 0 255) !important; color: rgb(0 0 255) !important; }
  .doc-database-app .tbl > .tr:nth-child(4) > .td * { visibility: hidden !important; }`;

// One scroller scrolled slowly sideways while the main thread is kept busy (a 45 ms task every 100 ms), every frame
// drawn meanwhile recorded and read: how many frames its thumb was out of step with its content (more than 1.5 px
// from where the content puts it, by a line through three frames at rest), and how many it stood still while the
// content moved.
async function slowScroll(t, cdp, decoder, target) {
  const { page } = t;
  const geometry = await page.evaluate((target) => {
    const scroller = document.querySelector(target.scroller);
    scroller.scrollIntoView({ block: "center" });
    scroller.scrollLeft = 0;
    const box = scroller.getBoundingClientRect();
    const cells = [...document.querySelectorAll(target.cells)];
    const row = cells[0].getBoundingClientRect();
    const thumb = document.querySelector(`${target.rail} .doc-scrollbar-thumb`).getBoundingClientRect();
    return { left: box.left, right: box.right, rowY: row.top + row.height / 2, thumbY: thumb.top + thumb.height / 2, bounds: cells.map((cell) => cell.getBoundingClientRect().right - box.left), range: scroller.scrollWidth - scroller.clientWidth, width: innerWidth };
  }, target);
  const at = { x: geometry.left + Math.min(240, (geometry.right - geometry.left) / 2), y: geometry.rowY };
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: at.x, y: at.y });
  await sleep(300);
  const start = 30;
  const distance = Math.min(300, geometry.range - 2 * start);
  const frames = [];
  const onFrame = (event) => { frames.push({ data: event.data, t: event.metadata.timestamp }); cdp.send("Page.screencastFrameAck", { sessionId: event.sessionId }).catch(() => {}); };
  cdp.on("Page.screencastFrame", onFrame);
  const setLeft = (left) => page.evaluate((selector, left) => { document.querySelector(selector).scrollLeft = left; }, target.scroller, left);
  const rest = async (left) => {
    await setLeft(left);
    await sleep(300);
    const scrolled = await page.evaluate((selector) => document.querySelector(selector).scrollLeft, target.scroller);
    frames.length = 0;
    await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
    await page.evaluate(() => { document.body.style.outline = "1px solid transparent"; }); // a frame is sent once something changes
    await sleep(200);
    await page.evaluate(() => { document.body.style.outline = ""; });
    await sleep(200);
    await cdp.send("Page.stopScreencast");
    return { scrolled, frame: frames.at(-1) };
  };
  const rests = [await rest(start), await rest(start + distance / 2), await rest(start + distance)];
  await setLeft(start);
  await sleep(300);
  // The rail's style and its thumb's written as it scrolls (none: the timeline moves the thumb).
  await page.evaluate((rail) => {
    window.__written = 0;
    window.__watch = new MutationObserver((records) => { window.__written += records.length; });
    const node = document.querySelector(rail);
    for (const each of [node, node.querySelector(".doc-scrollbar-thumb")]) window.__watch.observe(each, { attributes: true, attributeFilter: ["style"] });
    window.__busy = setInterval(() => { const end = performance.now() + 45; while (performance.now() < end); }, 100);
  }, target.rail);
  frames.length = 0;
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 95, everyNthFrame: 1 });
  await sleep(150);
  const began = Date.now();
  const sent = [];
  // Sent on time whatever the page does, as a touchpad's events come (not each after the last one's answer, which
  // waits for a busy main thread).
  for (let index = 0; index * DELTA < distance; index++) {
    while (Date.now() - began < index * EVERY) await sleep(1);
    sent.push(cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: at.x, y: at.y, deltaX: DELTA, deltaY: 0, timestamp: began / 1000 + (index * EVERY) / 1000 }));
  }
  await Promise.all(sent);
  await sleep(400);
  await cdp.send("Page.stopScreencast");
  cdp.off("Page.screencastFrame", onFrame);
  const written = await page.evaluate(() => { clearInterval(window.__busy); window.__watch.disconnect(); return window.__written; });
  const moving = frames.splice(0).sort((a, b) => a.t - b.t);

  // Each frame's pixels: the edges between red and blue along the row, the thumb's green along its line.
  const scale = (await decoder.evaluate(async (data) => (await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob())).width, rests[0].frame.data)) / geometry.width;
  const scan = { rowY: Math.round(geometry.rowY * scale), thumbY: Math.round(geometry.thumbY * scale), from: Math.round((geometry.left + target.scanFrom) * scale), to: Math.round((geometry.right - 40) * scale), railFrom: Math.round(geometry.left * scale), railTo: Math.round(geometry.right * scale) };
  const read = (frame, type) => decoder.evaluate(async (data, type, scan) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/${type};base64,${data}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    const line = (y, from, to) => context.getImageData(from, y, to - from, 1).data;
    const row = line(scan.rowY, scan.from, scan.to);
    const kinds = [];
    for (let x = 0; x < row.length / 4; x++) {
      const [r, g, b] = [row[x * 4], row[x * 4 + 1], row[x * 4 + 2]];
      kinds.push(r > 150 && b < 110 && g < 110 ? "r" : b > 150 && r < 110 && g < 110 ? "b" : "-");
    }
    const edges = [];
    let last = -1;
    for (let x = 0; x < kinds.length; x++) {
      if (kinds[x] === "-") continue;
      if (last >= 0 && kinds[last] !== kinds[x] && x - last < 12) edges.push(scan.from + (last + x) / 2);
      last = x;
    }
    const rail = line(scan.thumbY, scan.railFrom, scan.railTo);
    let first = -1;
    let end = -1;
    for (let x = 0; x < rail.length / 4; x++) {
      const [r, g, b] = [rail[x * 4], rail[x * 4 + 1], rail[x * 4 + 2]];
      if (g > 120 && r < 110 && b < 110) { if (first < 0) first = x; end = x; }
    }
    return { edges, thumb: first < 0 ? null : (scan.railFrom * 2 + first + end + 1) / 2 };
  }, frame.data, type, scan);
  // Where the content is: the place, within a window, at which the most of a frame's edges fall on the cells' ends.
  const predicted = (k, s, offset) => (geometry.left + geometry.bounds[k] - s) * scale + offset;
  const nearest = (edge, s, offset) => {
    let best = -1;
    for (let k = 0; k < geometry.bounds.length; k++) if (best < 0 || Math.abs(predicted(k, s, offset) - edge) < Math.abs(predicted(best, s, offset) - edge)) best = k;
    return best;
  };
  const still = await Promise.all(rests.map(async (each) => ({ scrolled: each.scrolled, ...(each.frame ? await read(each.frame, "png") : { edges: [], thumb: null }) })));
  const offset = median(still[0].edges.map((edge) => edge - predicted(nearest(edge, still[0].scrolled, 0), still[0].scrolled, 0))) ?? 0;
  const fitting = (edges, s, within) => edges.flatMap((edge) => {
    const k = nearest(edge, s, offset);
    return Math.abs(predicted(k, s, offset) - edge) < within ? [geometry.left + geometry.bounds[k] - (edge - offset) / scale] : [];
  });
  const contentOf = (edges, low, high, want) => {
    let best = null;
    for (const edge of edges) for (let k = 0; k < geometry.bounds.length; k++) {
      const s = geometry.left + geometry.bounds[k] - (edge - offset) / scale;
      if (s < low || s > high) continue;
      const fits = fitting(edges, s, 1.5).length;
      if (!best || fits > best.fits || (fits === best.fits && Math.abs(s - want) < Math.abs(best.s - want))) best = { s, fits };
    }
    return best ? median(fitting(edges, best.s, 2 * scale)) : null;
  };
  const points = still.map((each) => ({ s: contentOf(each.edges, each.scrolled - 5, each.scrolled + 5, each.scrolled), c: each.thumb })).filter((each) => each.s !== null && each.c !== null);
  if (points.length < 2) return { calibrated: false, rests: still.map((each) => ({ edges: each.edges.length, thumb: each.thumb })) };
  const [p, q] = [points[0], points.at(-1)];
  const b = (q.c - p.c) / (q.s - p.s);
  const a = p.c - b * p.s;
  let guess = { s: start, t: moving[0]?.t ?? 0 };
  const measured = [];
  for (const frame of moving) {
    const seen = await read(frame, "jpeg");
    const since = Math.max(0, frame.t - guess.t) * 1000;
    const s = contentOf(seen.edges, guess.s - 3, guess.s + since * (DELTA / EVERY) * 1.6 + 8, guess.s + since * (DELTA / EVERY));
    if (s === null) continue;
    guess = { s, t: frame.t };
    measured.push({ s, thumb: seen.thumb, off: seen.thumb === null ? null : seen.thumb - (a + b * s) });
  }
  const firstMove = measured.findIndex((frame) => frame.s > start + 0.7);
  let lastMove = measured.length - 1;
  while (lastMove > 0 && Math.abs(measured[lastMove].s - measured[lastMove - 1].s) < 0.3) lastMove--;
  const during = (firstMove < 0 ? [] : measured.slice(firstMove, lastMove + 1)).filter((frame) => frame.off !== null);
  let stood = 0;
  for (let k = 1; k < during.length; k++) if (Math.abs((during[k].s - during[k - 1].s) * b) > 1.2 && Math.abs(during[k].thumb - during[k - 1].thumb) < 0.3) stood++;
  return {
    calibrated: true, scale: round(scale), frames: during.length, scrolled: round(guess.s - start, 1), written,
    out: during.filter((frame) => Math.abs(frame.off) > 1.5).length, stood, worst: round(Math.max(0, ...during.map((frame) => Math.abs(frame.off)))),
  };
}

// A decoder of the recorded frames: a blank page of the same browser (its canvas), closed at the end; the page
// measured brought to the front again (a page behind another draws no frames and answers no input).
async function openDecoder(page) {
  const blank = await page.browserContext().newPage();
  await blank.goto("about:blank");
  await page.bringToFront();
  return { evaluate: (fn, ...rest) => blank.evaluate(fn, ...rest), close: () => blank.close() };
}

// Where a rail's thumb is drawn, and where the content's place puts it (its track's start plus its travel times how
// far along the content is), px.
const thumbOf = (page, scroller, rail, axis = "x") => page.evaluate((scroller, rail, axis) => {
  const node = document.querySelector(scroller);
  const track = document.querySelector(rail);
  const thumb = track.querySelector(".doc-scrollbar-thumb").getBoundingClientRect();
  const box = track.getBoundingClientRect();
  const along = axis === "x" ? node.scrollLeft / (node.scrollWidth - node.clientWidth) : node.scrollTop / (node.scrollHeight - node.clientHeight);
  const travel = parseFloat(track.style.getPropertyValue("--doc-scrollbar-travel"));
  const start = axis === "x" ? thumb.left - box.left : thumb.top - box.top;
  return { start, want: travel * along, size: axis === "x" ? thumb.width : thumb.height, scrolled: axis === "x" ? node.scrollLeft : node.scrollTop, along, box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom }, centre: axis === "x" ? thumb.left + thumb.width / 2 : thumb.top + thumb.height / 2, timeline: track.hasAttribute("data-timeline") };
}, scroller, rail, axis);

export const scrollbarScenarios = {
  // A slow swipe sideways on a touchpad (1.5 px every 8 ms) over a table frame and over a database's table view,
  // the page's main thread kept busy meanwhile: the thumb in step with the columns in every frame the browser drew
  // (the thumb on the compositor's timeline; placed by script on every scroll, it lagged a frame or more behind
  // whenever the main thread was busy, and stood still while the columns moved: the user's 2026-11-24), and
  // nothing written on the rail as it scrolls.
  async scrollbarInStep(t) {
    const { page } = t;
    await writeDocument(t);
    await t.open();
    await ready(page);
    await page.addStyleTag({ content: PAINT });
    await sleep(300);
    const timelines = await page.evaluate(() => [...document.querySelectorAll(".doc-scrollbar")].every((rail) => rail.hasAttribute("data-timeline")));
    t.check(timelines, "the browser has scroll timelines: every rail is moved by its scroller's");
    const cdp = await page.createCDPSession();
    const decoder = await openDecoder(page);
    try {
      for (const target of TARGETS) {
        const seen = await slowScroll(t, cdp, decoder, target);
        console.log(`  ${target.name}: ${JSON.stringify(seen)}`);
        t.check(seen.calibrated && seen.frames >= 20 && seen.scrolled > 200 && seen.out <= 2 && seen.stood <= 2 && seen.written === 0,
          `${target.name}: a slow swipe with the main thread busy, the thumb in step with the content in every frame drawn, nothing written as it scrolls`, JSON.stringify(seen));
      }
    } finally {
      await decoder.close().catch(() => {});
      await cdp.detach().catch(() => {});
    }
  },

  // A press on a rail beside its thumb takes the thumb there (centred under the pointer), a drag of it scrolls the
  // content by the thumb's travel, and the page's editor hears neither: a table frame's bottom and right rails and a
  // database table view's.
  async scrollbarPressDrag(t) {
    const { page } = t;
    await writeDocument(t);
    await t.open();
    await ready(page);
    await page.evaluate(() => {
      window.__heard = 0;
      document.addEventListener("pointerdown", () => window.__heard++, true);
    });
    const cases = [
      { name: "a table frame's bottom rail", scroller: "#wide", rail: "#wide .doc-scrollbar--x", axis: "x" },
      { name: "a table frame's right rail", scroller: "#tall", rail: "#tall .doc-scrollbar--y", axis: "y" },
      { name: "a database table view's rail", scroller: ".doc-database-app .tbl-wrap", rail: ".doc-database-app .tbl-frame .doc-scrollbar", axis: "x" },
    ];
    for (const each of cases) {
      await page.evaluate((scroller) => { const node = document.querySelector(scroller); node.scrollIntoView({ block: "center" }); node.scrollLeft = 0; node.scrollTop = 0; }, each.scroller);
      await sleep(300);
      const rest = await thumbOf(page, each.scroller, each.rail, each.axis);
      const over = { x: (rest.box.left + rest.box.right) / 2, y: (rest.box.top + rest.box.bottom) / 2 };
      await page.mouse.move(over.x, over.y, { steps: 3 });
      await sleep(250);
      // Beside the thumb, two thirds along its track.
      const press = each.axis === "x" ? { x: rest.box.left + (rest.box.right - rest.box.left) * 0.66, y: over.y } : { x: over.x, y: rest.box.top + (rest.box.bottom - rest.box.top) * 0.66 };
      await page.mouse.move(press.x, press.y, { steps: 3 });
      await page.mouse.down();
      await sleep(150);
      const pressed = await thumbOf(page, each.scroller, each.rail, each.axis);
      const pointer = each.axis === "x" ? press.x : press.y;
      await page.mouse.move(press.x + (each.axis === "x" ? -60 : 0), press.y + (each.axis === "y" ? -60 : 0), { steps: 6 });
      await sleep(150);
      const dragged = await thumbOf(page, each.scroller, each.rail, each.axis);
      await page.mouse.up();
      await sleep(150);
      const heard = await page.evaluate(() => window.__heard);
      const seen = { rest: round(rest.start), pressed: [round(pressed.centre), round(pointer), round(pressed.start), round(pressed.want)], dragged: [round(pressed.centre - dragged.centre), round(dragged.start), round(dragged.want)], scrolled: [round(pressed.scrolled), round(dragged.scrolled)], heard, timeline: pressed.timeline };
      t.check(Math.abs(pressed.centre - pointer) < 1.5 && Math.abs(pressed.start - pressed.want) < 1 && pressed.scrolled > 0,
        `${each.name}: a press beside the thumb takes it there, centred under the pointer, the content scrolled to match`, JSON.stringify(seen));
      t.check(Math.abs(pressed.centre - dragged.centre - 60) < 1.5 && Math.abs(dragged.start - dragged.want) < 1 && dragged.scrolled < pressed.scrolled && heard === 0,
        `${each.name}: dragged back 60 px, the thumb 60 px back and the content with it; the page's editor heard no press`, JSON.stringify(seen));
    }
  },

  // The rails as a reader sees them: the thumb in the kit's color, light and dark, and at its place for the
  // content's, at the kit's width and at the narrow layout (760px); in the exported file (no editor) drawn and moved
  // by the timeline as in the editor; none on paper.
  async scrollbarLooks(t) {
    const { page } = t;
    await writeDocument(t);
    await t.open();
    await ready(page);
    const looks = async (label) => {
      for (const scheme of ["light", "dark"]) {
        await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
        await sleep(200);
        for (const [scroller, rail] of [["#wide", "#wide .doc-scrollbar--x"], [".doc-database-app .tbl-wrap", ".doc-database-app .tbl-frame .doc-scrollbar"]]) {
          // Its color once its transition to the theme's is done (a second at most).
          const color = await page.evaluate(async (scroller, rail, end) => {
            const node = document.querySelector(scroller);
            node.scrollIntoView({ block: "center" });
            node.scrollLeft = end;
            const thumb = document.querySelector(rail).querySelector(".doc-scrollbar-thumb");
            const probe = document.createElement("div");
            probe.style.color = getComputedStyle(thumb).getPropertyValue("--doc-scrollbar-thumb");
            thumb.after(probe);
            const want = getComputedStyle(probe).color;
            probe.remove();
            for (let waited = 0; waited < 1000 && getComputedStyle(thumb).backgroundColor !== want; waited += 50) await new Promise((resolve) => setTimeout(resolve, 50));
            return { drawn: getComputedStyle(thumb).backgroundColor, want };
          }, scroller, rail, 1e6);
          await sleep(250);
          const place = await thumbOf(page, scroller, rail);
          const box = await page.evaluate((scroller, rail) => {
            const frame = document.querySelector(scroller).getBoundingClientRect();
            const track = document.querySelector(rail).getBoundingClientRect();
            return { inside: track.left >= frame.left - 0.5 && track.right <= frame.right + 0.5 && track.bottom <= frame.bottom + 0.5 + 12 };
          }, scroller, rail);
          t.check(color.drawn === color.want && Math.abs(place.start - place.want) < 1 && place.along > 0.99 && box.inside && place.timeline,
            `${label}, ${scheme}: ${scroller === "#wide" ? "a table frame's" : "a database's"} thumb in the kit's color, at the end of its track scrolled to the end, its rail inside the frame`, JSON.stringify({ color, place: { start: round(place.start), want: round(place.want), along: round(place.along) }, box }));
        }
      }
      await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
    };
    await looks("the editor at 1280px");
    await page.setViewport({ width: 760, height: 900 });
    await sleep(500);
    await looks("the editor at 760px");
    await page.setViewport({ width: 1280, height: 900 });
    // The exported file: its rails drawn and moved by the timeline, nothing of the editor in the page.
    const url = t.exportReport();
    await page.goto(url, { waitUntil: "load" });
    await page.waitForSelector("[data-doc-ready]", { timeout: 15000 });
    await ready(page);
    await sleep(400);
    const editor = await page.evaluate(() => document.documentElement.hasAttribute("data-ge-editing"));
    t.check(!editor, "the exported file has no editor");
    await looks("the exported file");
    // On paper: no rails.
    await page.emulateMediaType("print");
    const printed = await page.evaluate(() => [...document.querySelectorAll(".doc-scrollbar")].map((rail) => rail.getClientRects().length));
    await page.emulateMediaType(null);
    t.check(printed.length > 0 && printed.every((boxes) => boxes === 0), "on paper no rail is drawn", JSON.stringify(printed));
  },

  // The pointer at rest on a column's edge, where the page editor's strip to size the column stands (an overlay over
  // the frame): a turn of the wheel there scrolls the table, and so do the turns after it (the strip passes the first
  // on to the frame and lets the rest through until the pointer moves: table/widths.mjs passWheel), where before the
  // table stood still under it.
  async tableWheelOverEdge(t) {
    const { page } = t;
    await writeDocument(t);
    await t.open();
    await ready(page);
    const box = await page.evaluate(() => {
      const frame = document.querySelector("#wide");
      frame.scrollIntoView({ block: "center" });
      frame.scrollLeft = 0;
      const cell = frame.querySelector("tr:nth-child(4) > :nth-child(2)").getBoundingClientRect();
      return { x: cell.left + 10, y: cell.top + cell.height / 2 };
    });
    await page.mouse.move(box.x, box.y, { steps: 3 });
    await t.sleep(300);
    const strip = await page.evaluate((y) => {
      const frame = document.querySelector("#wide").getBoundingClientRect();
      const strips = [...document.querySelectorAll(".ge-tcol")].map((node) => node.getBoundingClientRect()).filter((rect) => rect.width > 0 && rect.left > frame.left + 40 && rect.right < frame.right - 40);
      const rect = strips[0];
      return rect ? { x: rect.left + rect.width / 2, y } : null;
    }, box.y);
    t.check(Boolean(strip), "a column's strip in sight", JSON.stringify(strip));
    if (!strip) return;
    await page.mouse.move(strip.x, strip.y);
    await t.sleep(200);
    const on = await page.evaluate((strip) => document.elementFromPoint(strip.x, strip.y)?.closest(".ge-tcol") ? "strip" : "other", strip);
    const lefts = [await page.evaluate(() => document.querySelector("#wide").scrollLeft)];
    for (let turn = 0; turn < 4; turn++) {
      await page.mouse.wheel({ deltaX: 60 });
      await t.sleep(120);
      lefts.push(await page.evaluate(() => document.querySelector("#wide").scrollLeft));
    }
    t.check(on === "strip" && lefts.every((left, at) => at === 0 || left > lefts[at - 1]), "the wheel on a column's strip scrolls the table, every turn", JSON.stringify({ on, lefts }));
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },
};
