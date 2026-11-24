// Browser scenarios of the scrollbars the kit draws giving way past an end (src/render/kit/scroll-squeeze.js), spread
// into scenarios.mjs: a table frame's bottom and right thumbs and a database's sideways one (its table view and its
// board), each driven as a reader's hand drives it, by wheel events sent through the browser's own input (CDP's
// mouseWheel, each with its time stamp, so the page reads them as a touchpad's sent 8 ms apart): a touchpad pushing
// on past the end, its fingers lifting (the momentum after them, decaying), a quick swipe that coasts to the end (one bump), a
// mouse's notches with Shift, and the thumb dragged past the end. The thumb is measured every frame.
import { SAMPLE } from "../fixtures/database/sample.mjs";

const EVERY = 8; // ms between a touchpad's events, as their time stamps say
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A hand's steps: `count` deltas from `from` px to `to` px each, jittered by up to `jitter` of themselves (the same
// each run: a seeded sequence), between 3 and 30 px, never whole pixels.
function handSteps(count, from, to, jitter, seed = 11) {
  let state = seed;
  const random = () => (state = (state * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: count }, (_, at) => {
    const base = from + ((to - from) * at) / Math.max(1, count - 1);
    const size = Math.min(30, Math.max(3, base * (1 + (random() * 2 - 1) * jitter)));
    return Math.round(size * 1000) / 1000 + (Number.isInteger(size) ? 0.013 : 0);
  });
}

// A touchpad's momentum after the fingers lift: from `last` px, each event `ratio` of the one before, until under 0.4 px.
function momentumSteps(last, ratio) {
  const steps = [];
  for (let size = last * ratio; size >= 0.4; size *= ratio) steps.push(Math.round(size * 1000) / 1000);
  return steps;
}

// Wheel events sent through the browser's input at (x, y): each of `steps` px along `axis` (signed), its time stamp
// `every` ms after the one before, none sent sooner than its time stamp says. Shift turns a vertical wheel sideways.
async function wheel(cdp, at, steps, { axis = "x", every = EVERY, shift = false } = {}) {
  const startedAt = Date.now();
  const stamp = startedAt / 1000;
  for (let index = 0; index < steps.length; index++) {
    while (Date.now() - startedAt < index * every) await sleep(1);
    const delta = steps[index];
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseWheel", x: at.x, y: at.y, deltaX: axis === "x" ? delta : 0, deltaY: axis === "y" ? delta : 0,
      modifiers: shift ? 8 : 0, timestamp: stamp + (index * every) / 1000,
    });
  }
}

// The thumb `thumb` (a selector) measured every frame from now on, and the wheel events the page heard (when, how far).
async function startSampling(page, thumb, axis) {
  await page.evaluate((thumb, axis) => {
    const node = document.querySelector(thumb);
    const seen = { frames: [], events: [], on: true };
    window.__squeezeSeen = seen;
    const measure = () => {
      if (!seen.on) return;
      const box = node.getBoundingClientRect();
      seen.frames.push({ t: performance.now(), size: axis === "x" ? box.width : box.height, start: axis === "x" ? box.left : box.top, end: axis === "x" ? box.right : box.bottom });
      requestAnimationFrame(measure);
    };
    requestAnimationFrame(measure);
    seen.listen = (event) => seen.events.push({ t: performance.now(), d: axis === "x" ? event.deltaX || event.deltaY : event.deltaY });
    addEventListener("wheel", seen.listen, { capture: true, passive: true });
  }, thumb, axis);
}
async function stopSampling(page) {
  return page.evaluate(() => {
    const seen = window.__squeezeSeen;
    seen.on = false;
    removeEventListener("wheel", seen.listen, { capture: true });
    return { frames: seen.frames, events: seen.events };
  });
}

const round = (value) => Math.round(value * 100) / 100;

// The five ways of pushing at the end of what `scroller` (a selector) scrolls, its thumb `thumb`, along `axis` ("x"
// sideways, "y" down): a hand pushing then lifting, a swipe coasting there, a mouse's notches, a drag of the thumb.
// `label` names it in the checks; `wheels: false` leaves the wheel out (the right thumb of a frame whose page takes it).
async function pushAtEnds(t, cdp, { scroller, thumb, axis = "x", label, wheels = true, before = async () => {} }) {
  const { page } = t;
  const place = async (to) => {
    await before();
    await page.evaluate((scroller, axis, to) => {
      const node = document.querySelector(scroller);
      const range = axis === "x" ? node.scrollWidth - node.clientWidth : node.scrollHeight - node.clientHeight;
      node[axis === "x" ? "scrollLeft" : "scrollTop"] = to === "end" ? range : to === "start" ? 0 : range - to;
    }, scroller, axis, to);
    await sleep(250); // the rail placed again where the content now is
    return page.evaluate((scroller, thumb, axis) => {
      const node = document.querySelector(scroller);
      const range = axis === "x" ? node.scrollWidth - node.clientWidth : node.scrollHeight - node.clientHeight;
      const box = node.getBoundingClientRect();
      const bar = document.querySelector(thumb).getBoundingClientRect();
      return { x: box.left + Math.min(box.width / 2, 240), y: box.top + Math.min(box.height / 2, 120), range, thumb: { x: bar.left + bar.width / 2, y: bar.top + bar.height / 2 } };
    }, scroller, thumb, axis);
  };
  const rest = (ms = 350) => sleep(ms);
  const scrolled = () => page.evaluate((scroller, axis) => { const node = document.querySelector(scroller); return node[axis === "x" ? "scrollLeft" : "scrollTop"]; }, scroller, axis);
  const whole = async () => page.evaluate((thumb, axis) => { const box = document.querySelector(thumb).getBoundingClientRect(); return axis === "x" ? box.width : box.height; }, thumb, axis);

  if (wheels) {
    // (a) A touchpad pushing on at the end, then (b) its fingers lifting: the momentum after them.
    const at = await place("end");
    await page.mouse.move(at.x, at.y);
    await rest();
    const size = await whole();
    const hand = handSteps(32, 12, 12, 0.35);
    const coast = momentumSteps(hand.at(-1), 0.94);
    await startSampling(page, thumb, axis);
    await wheel(cdp, at, [...hand, ...coast], { axis });
    await sleep(500);
    const { frames, events } = await stopSampling(page);
    const squeeze = frames.map((frame) => ({ t: frame.t, given: size - frame.size, end: frame.end }));
    const lastHand = events[hand.length - 1]?.t ?? Infinity;
    const pushing = squeeze.filter((frame) => frame.t >= events[0].t && frame.t <= lastHand);
    const most = Math.max(...squeeze.map((frame) => frame.given));
    // The squeeze over the push: its gain in each third of the push's frames, and any fall of over a pixel from
    // the most it had reached (a spring back while the hand still pushed), unless the events had stopped coming then
    // for longer than a hand's pause (a machine too busy to send them).
    const thirds = [0, 1, 2].map((part) => pushing.slice(Math.floor((pushing.length * part) / 3), Math.floor((pushing.length * (part + 1)) / 3)));
    const gains = thirds.map((part) => round((part.at(-1)?.given ?? 0) - (part[0]?.given ?? 0)));
    let reached = 0;
    const dips = [];
    for (const frame of pushing) {
      reached = Math.max(reached, frame.given);
      const waited = events.filter((event) => event.t <= frame.t).slice(-2);
      const stalled = waited.length === 2 && frame.t - waited[1].t > 50;
      if (reached - frame.given > 1 && !stalled) dips.push(round(frame.t - events[0].t));
    }
    const atEndOfPush = pushing.at(-1)?.given ?? 0;
    const farEnd = round(Math.max(...pushing.map((frame) => Math.abs(frame.end - pushing[0].end))));
    t.check(atEndOfPush > 8 && most <= size * 0.5 + 0.5 && gains[0] > gains[2] * 1.5 && gains[2] >= 0 && dips.length === 0 && farEnd < 1,
      `${label}: a touchpad pushing on at the end squeezes the thumb, the more the further, by less and less (never past half), its far end against the end, no spring back while it pushes`,
      JSON.stringify({ size: round(size), atEndOfPush: round(atEndOfPush), most: round(most), gains, dips, farEnd }));
    // After the last of the hand's events: the thumb springs back within a few of the momentum's events, and the
    // momentum still coming never squeezes it again.
    const after = squeeze.filter((frame) => frame.t > lastHand);
    const backAt = after.findIndex((frame, index) => index > 0 && frame.given < after[index - 1].given - 0.3);
    const backFrame = after[backAt];
    const momentumBefore = backFrame ? events.filter((event) => event.t > lastHand && event.t <= backFrame.t).length : Infinity;
    // Drawn a frame or two late (the spring that follows the push), the last pushes may show just after it: the
    // squeeze stops growing 40 ms after the last push at the latest.
    const settledAt = after.find((frame) => frame.t >= lastHand + 40);
    const grew = settledAt && (backAt < 0 || settledAt.t < backFrame.t)
      ? after.filter((frame) => frame.t > settledAt.t && (backAt < 0 || frame.t < backFrame.t)).reduce((most, frame) => Math.max(most, frame.given - settledAt.given), 0)
      : 0;
    const again = backAt < 0 ? [] : after.slice(backAt).filter((frame, index, list) => index > 0 && frame.given > list[index - 1].given + 0.3).map((frame) => round(frame.t - lastHand));
    const wholeAt = backAt < 0 ? null : after.slice(backAt).find((frame) => frame.given <= 0.5);
    const coastingUntil = events.at(-1).t;
    console.log(`  ${label}: squeezed ${round(atEndOfPush)} of ${round(size)} px; the spring back began ${backFrame ? round(backFrame.t - lastHand) : "—"} ms after the last push (${momentumBefore} momentum events), whole ${wholeAt ? round(wholeAt.t - lastHand) : "—"} ms after it, the momentum going on to ${round(coastingUntil - lastHand)} ms`);
    t.check(backAt > 0 && momentumBefore <= 6 && grew < 0.5 && again.length === 0 && wholeAt && wholeAt.t - backFrame.t < 450 && wholeAt.t < coastingUntil,
      `${label}: the fingers lifted, it springs back within a few momentum events, at once whole again, never squeezed again by the momentum`,
      JSON.stringify({ backAfter: backFrame && round(backFrame.t - lastHand), momentumBefore, grew: round(grew), again, wholeAfter: wholeAt && round(wholeAt.t - lastHand) }));

    // (c) A quick swipe from inside that coasts to the end: one bump as it gets there, by the speed it came at
    // (scroll-squeeze.js bumpOf: within its least and most), sprung back, never squeezed again by the momentum still
    // coming, whole again at the end.
    const from = await place(420);
    await page.mouse.move(from.x, from.y);
    await rest();
    const flick = [22.31, 27.42, 29.13, 28.27, 26.71];
    await startSampling(page, thumb, axis);
    await wheel(cdp, from, [...flick, ...momentumSteps(flick.at(-1), 0.95)], { axis });
    await sleep(400);
    const swiped = await stopSampling(page);
    const reachedEnd = (await scrolled()) >= from.range - 1;
    const given = swiped.frames.map((frame) => size - frame.size);
    const peak = Math.max(...given);
    const peakAt = given.indexOf(peak);
    const bumped = given.slice(peakAt + 1).filter((value, at, list) => at > 0 && value > list[at - 1] + 0.5).length;
    t.check(reachedEnd && peak >= 2.5 && peak <= 28.5 && bumped === 0 && given.at(-1) < 0.5, `${label}: a quick swipe that coasts to the end: one bump by its speed, sprung back, never squeezed again`, JSON.stringify({ reachedEnd, peak: round(peak), again: bumped, last: round(given.at(-1)), size: round(size) }));

    // (d) A mouse's notches with Shift (100 px each, sideways), each alone: a little squeeze, whole again soon; four
    // in a quick run: more, and whole again soon after the last.
    if (axis === "x") {
      const notchAt = await place("end");
      await page.mouse.move(notchAt.x, notchAt.y);
      await rest();
      const peaks = [];
      for (let notch = 0; notch < 2; notch++) {
        await startSampling(page, thumb, axis);
        await wheel(cdp, notchAt, [100], { axis: "y", shift: true });
        await sleep(520);
        const { frames: notched } = await stopSampling(page);
        peaks.push({ most: round(Math.max(...notched.map((frame) => size - frame.size))), last: round(size - notched.at(-1).size) });
      }
      await startSampling(page, thumb, axis);
      await wheel(cdp, notchAt, [100, 100, 100, 100], { axis: "y", shift: true, every: 30 });
      const runEnd = Date.now();
      await sleep(600);
      const { frames: run } = await stopSampling(page);
      const runMost = Math.max(...run.map((frame) => size - frame.size));
      t.check(peaks.every(({ most, last }) => most > 3 && most < size * 0.2 && last <= 0.5) && runMost > peaks[0].most * 1.5 && size - run.at(-1).size <= 0.5 && Date.now() - runEnd >= 600,
        `${label}: a mouse's notch (Shift) squeezes a little and springs back soon; a quick run of notches more`, JSON.stringify({ peaks, runMost: round(runMost), size: round(size) }));
    }
  }

  // (e) The thumb dragged past the end: it gives way by how far the pointer goes past, by less and less, the content
  // not moving; let go, it springs back. Then past the start, from that end.
  const atDrag = await place("end");
  const before0 = await scrolled();
  const size = await whole();
  const grip = atDrag.thumb;
  await page.mouse.move(grip.x, grip.y);
  await page.mouse.down();
  const given = [];
  let lastAt = 0;
  for (const past of [20, 40, 80, 160, 240]) {
    await page.mouse.move(grip.x + (axis === "x" ? past : 0), grip.y + (axis === "y" ? past : 0), { steps: Math.max(2, Math.round((past - lastAt) / 10)) });
    lastAt = past;
    await sleep(140);
    given.push(round(size - (await whole())));
  }
  const heldStill = (await scrolled()) === before0;
  await page.mouse.up();
  await sleep(450);
  const backWhole = round(size - (await whole()));
  const perPx = [given[0] / 20, (given[1] - given[0]) / 20, (given[3] - given[2]) / 80, (given[4] - given[3]) / 80].map(round);
  t.check(given.every((value, index) => value > (given[index - 1] ?? 0)) && given[4] <= size * 0.5 + 0.5 && perPx[0] > perPx[3] * 2 && heldStill && backWhole <= 0.5,
    `${label}: its thumb dragged past the end gives way the more the further, by less and less, the content not moving; let go, it springs back`,
    JSON.stringify({ size: round(size), given, perPx, heldStill, backWhole }));
  const atStart = await place("start");
  const startEdge = await page.evaluate((thumb, axis) => { const box = document.querySelector(thumb).getBoundingClientRect(); return axis === "x" ? box.left : box.top; }, thumb, axis);
  await page.mouse.move(atStart.thumb.x, atStart.thumb.y);
  await page.mouse.down();
  await page.mouse.move(atStart.thumb.x - (axis === "x" ? 80 : 0), atStart.thumb.y - (axis === "y" ? 80 : 0), { steps: 8 });
  await sleep(140);
  const fromStart = await page.evaluate((thumb, axis) => { const box = document.querySelector(thumb).getBoundingClientRect(); return axis === "x" ? { start: box.left, size: box.width } : { start: box.top, size: box.height }; }, thumb, axis);
  await page.mouse.up();
  await sleep(450);
  t.check(size - fromStart.size > 3 && Math.abs(fromStart.start - startEdge) < 0.5 && size - (await whole()) <= 0.5,
    `${label}: dragged past the start, squeezed from that end (its start staying against it), and whole again let go`, JSON.stringify({ size: round(size), squeezed: round(size - fromStart.size), moved: round(fromStart.start - startEdge) }));
}

export const squeezeScenarios = {
  // A table frame's scrollbars giving way past an end (tables/scrollbars.js, scroll-squeeze.js): the bottom thumb of
  // a wide frame by a touchpad's push and lift, a swipe coasting to the end, a mouse's notches and a drag; the right
  // thumb of a tall frame by a drag, and by the wheel only where nothing around it takes the push: below the frame's
  // bottom the page scrolls on and the thumb stays whole, the page at its own end too it gives way.
  async scrollSqueezeTable(t) {
    const { page } = t;
    const rows = Array.from({ length: 60 }, (_, index) => `<tr><td>第 ${index + 1} 行</td><td>${index}</td></tr>`).join("");
    const wide = `<tr>${Array.from({ length: 14 }, (_, index) => `<td>很宽的第 ${index + 1} 列内容</td>`).join("")}</tr>`;
    await t.agentEdit((text) => text.replace(/<script>[\s\S]*?<\/script>/g, "<script></script>").replace(/<main([^>]*)>[\s\S]*<\/main>/, `<main$1>
    <header class="doc-header"><h1 class="doc-title">挤压</h1></header>
    <div class="doc-table-wrap" id="wide"><table class="doc-table"><tbody>${wide}${wide}${wide}</tbody></table></div>
    ${Array.from({ length: 8 }, (_, index) => `<p>中间第 ${index + 1} 段</p>`).join("")}
    <div class="doc-table-wrap" id="tall"><table class="doc-table"><thead><tr><th>行</th><th>值</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${Array.from({ length: 8 }, (_, index) => `<p>结尾第 ${index + 1} 段</p>`).join("")}
  </main>`));
    await t.open();
    await page.waitForFunction(() => document.querySelector("#tall .doc-scrollbars[data-y]") && document.querySelector("#wide .doc-scrollbars[data-x]"), { timeout: 5000 }).catch(() => {});
    const cdp = await page.createCDPSession();
    const intoView = (id) => async () => { await page.evaluate((id) => document.querySelector(id).scrollIntoView({ block: "center" }), id); await sleep(150); };
    await pushAtEnds(t, cdp, { scroller: "#wide", thumb: "#wide .doc-scrollbar--x > .doc-scrollbar-thumb", label: "a table frame's bottom thumb", before: intoView("#wide") });
    await pushAtEnds(t, cdp, { scroller: "#tall", thumb: "#tall .doc-scrollbar--y > .doc-scrollbar-thumb", axis: "y", wheels: false, label: "a table frame's right thumb", before: intoView("#tall") });

    // Down at the tall frame's bottom: the page scrolls on, the thumb whole; the page at its end too, the push
    // squeezes the thumb from its bottom, and the fingers lifting spring it back.
    const tallThumb = "#tall .doc-scrollbar--y > .doc-scrollbar-thumb";
    const thumbBox = () => page.evaluate((thumb) => { const box = document.querySelector(thumb).getBoundingClientRect(); return { height: box.height, bottom: box.bottom }; }, tallThumb);
    const over = await page.evaluate(() => {
      const frame = document.querySelector("#tall");
      frame.scrollIntoView({ block: "start" });
      frame.scrollTop = frame.scrollHeight;
      const box = frame.getBoundingClientRect();
      return { x: box.left + 80, y: box.top + Math.min(box.height / 2, 200), page: scrollY };
    });
    await sleep(300);
    const wholeTall = await thumbBox();
    await page.mouse.move(over.x, over.y);
    await startSampling(page, tallThumb, "y");
    await wheel(cdp, over, handSteps(12, 10, 14, 0.2), { axis: "y" });
    await sleep(200);
    const passed = await stopSampling(page);
    const pageAfter = await page.evaluate(() => scrollY);
    t.check(pageAfter > over.page + 40 && Math.min(...passed.frames.map((frame) => frame.size)) >= wholeTall.height - 0.5,
      "below a tall frame's bottom the page scrolls on, its right thumb whole", JSON.stringify({ page: [over.page, pageAfter], least: round(Math.min(...passed.frames.map((frame) => frame.size))), whole: round(wholeTall.height) }));
    const atBottom = await page.evaluate(() => {
      scrollTo(0, document.documentElement.scrollHeight);
      const frame = document.querySelector("#tall");
      frame.scrollTop = frame.scrollHeight;
      const box = frame.getBoundingClientRect();
      return { x: box.left + 80, y: Math.max(box.top + 40, Math.min(box.bottom - 40, innerHeight - 120)), page: scrollY, inView: box.top < innerHeight - 80 };
    });
    await sleep(300);
    const restingTall = await thumbBox();
    await page.mouse.move(atBottom.x, atBottom.y);
    const hand = handSteps(24, 8, 16, 0.3, 5);
    await startSampling(page, tallThumb, "y");
    await wheel(cdp, atBottom, [...hand, ...momentumSteps(hand.at(-1), 0.94)], { axis: "y" });
    await sleep(500);
    const pushedDown = await stopSampling(page);
    const lastHand = pushedDown.events[hand.length - 1].t;
    const squeezed = Math.max(...pushedDown.frames.filter((frame) => frame.t <= lastHand + 20).map((frame) => restingTall.height - frame.size));
    const bottoms = pushedDown.frames.map((frame) => Math.abs(frame.end - restingTall.bottom));
    const stayed = await page.evaluate(() => scrollY);
    t.check(atBottom.inView && stayed === atBottom.page && squeezed > 5 && Math.max(...bottoms) < 1 && restingTall.height - pushedDown.frames.at(-1).size <= 0.5,
      "the page at its end too: the push down squeezes the right thumb from its bottom, and the fingers lifting spring it back", JSON.stringify({ inView: atBottom.inView, page: [atBottom.page, stayed], squeezed: round(squeezed), bottom: round(Math.max(...bottoms)), last: round(restingTall.height - pushedDown.frames.at(-1).size) }));
    await cdp.detach().catch(() => {});
  },

  // A database's sideways rail giving way past an end (database/ui/rail.js, scroll-squeeze.js), under its table view
  // and its board: a touchpad's push and lift, a swipe coasting to the end, a mouse's notches and a drag of the thumb.
  async scrollSqueezeDatabase(t) {
    const { page } = t;
    await t.agentEdit((text) => text.replace(/<script>[\s\S]*?<\/script>/g, "<script></script>").replace(/<main([^>]*)>[\s\S]*<\/main>/, `<main$1>
    <header class="doc-header"><h1 class="doc-title">挤压</h1></header>
    <p>前文</p>
    ${SAMPLE}
    ${Array.from({ length: 12 }, (_, index) => `<p>后文第 ${index + 1} 段</p>`).join("")}
  </main>`));
    await t.open();
    await page.waitForFunction(() => document.querySelector(".doc-database-app .tbl-frame .scroll-rail"), { polling: 50, timeout: 15000 }).catch(() => {});
    await sleep(300);
    const cdp = await page.createCDPSession();
    const intoView = (selector) => async () => { await page.evaluate((selector) => document.querySelector(selector).scrollIntoView({ block: "center" }), selector); await sleep(150); };
    await pushAtEnds(t, cdp, { scroller: ".doc-database-app .tbl-wrap", thumb: ".doc-database-app .tbl-frame .doc-scrollbar-thumb", label: "a database's table view", before: intoView(".doc-database-app .tbl-wrap") });
    // Its board: the view of the sample's that is one, shown.
    const board = await page.evaluate(() => {
      const tab = [...document.querySelectorAll(".doc-database-app .tab")].find((node) => /看板/.test(node.textContent));
      tab?.click();
      return Boolean(tab);
    });
    await page.waitForFunction(() => document.querySelector(".doc-database-app .board-frame .scroll-rail"), { polling: 50, timeout: 5000 }).catch(() => {});
    await sleep(300);
    const railed = await page.evaluate(() => Boolean(document.querySelector(".doc-database-app .board-frame .scroll-rail")));
    if (t.check(board && railed, "the sample's board shown, wider than the page, with its rail", JSON.stringify({ board, railed }))) {
      await pushAtEnds(t, cdp, { scroller: ".doc-database-app .board", thumb: ".doc-database-app .board-frame .doc-scrollbar-thumb", label: "a database's board", before: intoView(".doc-database-app .board") });
    }
    await cdp.detach().catch(() => {});
  },
};
