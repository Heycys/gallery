// Browser scenarios of a database's records' bodies (src/shared/database.mjs: a slot of div.doc-database-pages a
// record, data-doc-slot="record:<id>", its row data-record="<id>"), spread into scenarios.mjs: a body made by the
// first word typed in a record's details (one undo step), "/" making a heading and a list there, a picture pasted,
// no database offered or taken there, another record's details showing its own body, old notes turned into the
// body on the first edit, an export showing a body read only, gallery read and Markdown saying bodies under their
// records' titles, and the details at the side: one scrollbar, at the window's right, theirs, sliding in and out.
import fs from "node:fs/promises";
import path from "node:path";
import { TASKS } from "./database.mjs";

// GALLERY_TEST_SHOTS=<folder> keeps the pictures the scenarios take (none taken without it).
const SHOTS = process.env.GALLERY_TEST_SHOTS || null;

// The report's page written anew: its title and `body`, no script of its own.
const pageOf = (title, body) => (text) => text.replace(/<script>[\s\S]*?<\/script>/g, "<script></script>").replace(/<main([^>]*)>[\s\S]*<\/main>/, `<main$1>
    <header class="doc-header"><h1 class="doc-title">${title}</h1></header>
    ${body}
  </main>`);

// A database with bodies as an Agent writes one: the first record's body a heading and a paragraph, the third's a list.
export const WITH_BODIES = TASKS
  .replace("<tr><td>登录页改版</td>", '<tr data-record="login"><td>登录页改版</td>')
  .replace("<tr><td>日历视图</td>", '<tr data-record="calendar"><td>日历视图</td>')
  .replace(/(<\/table>)/, `$1
      <div class="doc-database-pages">
        <div data-doc-slot="record:login">
          <h2>改版要点</h2>
          <p>登录页的正文：先做手机号登录。</p>
        </div>
        <div data-doc-slot="record:calendar">
          <ul>
            <li>月视图</li>
            <li>拖动改日期</li>
          </ul>
        </div>
      </div>`);

async function shoot(t, name) {
  if (!SHOTS) return;
  await fs.mkdir(SHOTS, { recursive: true });
  await t.page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

// The database drawn and ready to take edits.
async function drawn(t) {
  await t.page.waitForFunction(() => document.querySelector(".doc-database-app .db-head") && document.documentElement.hasAttribute("data-ge-editing"), { polling: 50, timeout: 15000 });
  await t.sleep(200);
}

// The details of the record of row `at` (0: the first) opened by its open button, done sliding in.
async function openRecord(t, at) {
  await t.page.evaluate((at) => document.querySelectorAll(".doc-database-app [data-rowid] .open-btn")[at].click(), at);
  await t.page.waitForFunction(() => document.querySelector(".doc-database-app .peek, .doc-database-pages[data-doc-peek]"), { polling: 50, timeout: 5000 });
  await t.sleep(450);
}

// What the details show: where they are drawn, the title, the body's blocks or the field where it would be.
const detailsNow = (t) => t.page.evaluate(() => {
  const pages = document.querySelector(".doc-database-pages[data-doc-peek]");
  const panel = pages ?? document.querySelector(".doc-database-app .peek");
  if (!panel) return null;
  const slot = pages?.querySelector(":scope > [data-doc-slot][data-doc-shown]");
  return {
    where: pages ? "pages" : "layer",
    open: panel.matches(":popover-open"),
    surface: Boolean(pages?.hasAttribute("data-doc-surface")),
    title: panel.querySelector(".peek-title")?.value ?? null,
    slot: slot?.getAttribute("data-doc-slot") ?? null,
    provisional: Boolean(slot?.hasAttribute("data-ge-provisional")),
    editable: Boolean(slot?.querySelector(":scope > [contenteditable=true]")),
    body: slot ? [...slot.children].filter((child) => !child.hasAttribute("data-doc-dev")).map((child) => `${child.localName}:${child.textContent.replace(/\s+/g, " ").trim()}`) : null,
    hidden: pages ? [...pages.querySelectorAll(":scope > [data-doc-slot]:not([data-doc-shown])")].map((node) => getComputedStyle(node).display) : [],
    field: panel.querySelector(".peek-body-new") ? { text: panel.querySelector(".peek-body-new").textContent, editable: panel.querySelector(".peek-body-new").isContentEditable } : null,
  };
});

// A small PNG made in the page, pasted at the focus as a file.
async function pastePicture(t) {
  await t.page.evaluate(async () => {
    const canvas = new OffscreenCanvas(48, 24);
    const draw = canvas.getContext("2d");
    draw.fillStyle = "#4a8";
    draw.fillRect(0, 0, 48, 24);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "body.png", { type: "image/png" }));
    document.activeElement.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
  });
}

// Where two texts first differ, for a check's detail.
const differ = (a, b) => { let at = 0; while (at < a.length && a[at] === b[at]) at++; return at >= a.length && a.length === b.length ? "" : JSON.stringify({ at, was: a.slice(Math.max(0, at - 80), at + 120), now: b.slice(Math.max(0, at - 80), at + 120) }); };

// The file's body, its blocks' ids left out (with the first save of a document with a database its head gains the
// kit's files and its blocks their ids).
const mainOf = (text) => (/<main[\s\S]*<\/main>/.exec(text)?.[0] ?? text).replace(/ data-block-id="[^"]*"/g, "");

// The file's database part: its pages, its blanks folded.
const pagesIn = (text) => (/<div class="doc-database-pages">[\s\S]*?\n {6}<\/div>/.exec(text)?.[0] ?? (/<div class="doc-database-pages">[\s\S]*$/.exec(text)?.[0] ?? "")).replace(/\s+/g, " ");
const rowOf = (text, title) => new RegExp(`<tr[^>]*><td>${title}</td>`).exec(text)?.[0] ?? "";

export const databaseBodyScenarios = {
  // A box selection in a record's details at the side takes blocks of the body they show alone, none of the page
  // under them; one drawn on the page while they stand there stops at their edge, taking none of the body (the
  // user's 2026-11-24: drawn in the details it took the page's blocks behind them).
  async databaseRecordMarquee(t) {
    const { page } = t;
    const before = Array.from({ length: 8 }, (_, at) => `<p>前文第 ${at + 1} 段，一段足够长的正文，让它在页面上一直排到右边详情盖住的地方为止，好看出框选有没有碰到它。</p>`).join("\n    ");
    await t.agentEdit(pageOf("任务", `${before}
    ${WITH_BODIES}
    <p>后文</p>`));
    await t.open();
    await drawn(t);
    await page.evaluate(() => document.querySelector(".doc-database").scrollIntoView({ block: "start" }));
    await t.sleep(200);
    await openRecord(t, 0);
    const spots = await page.evaluate(() => {
      const pages = document.querySelector(".doc-database-pages[data-doc-peek]");
      const panel = pages.getBoundingClientRect();
      const slot = pages.querySelector(":scope > [data-doc-slot][data-doc-shown]");
      const blocks = [...slot.children].filter((child) => !child.hasAttribute("data-doc-dev"));
      const first = blocks[0].getBoundingClientRect();
      const last = blocks.at(-1).getBoundingClientRect();
      const main = document.querySelector("main").getBoundingClientRect();
      return { from: { x: panel.right - 40, y: Math.min(panel.bottom - 20, last.bottom + 40) }, to: { x: panel.left + 40, y: panel.top + 60 }, panel: { left: panel.left }, page: { x: Math.max(4, main.left - 24), y: 60 }, into: { x: panel.left + 200, y: Math.min(panel.bottom - 20, last.bottom + 40) } };
    });
    const picked = () => page.evaluate(() => window.__gallerySelected().map((node) => ({ inBody: Boolean(node.closest(".doc-database-pages")), words: node.textContent.trim().slice(0, 6) })));
    const box = async (from, to) => {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 12 });
      const seen = await picked();
      await page.mouse.up();
      await t.sleep(150);
      await page.keyboard.press("Escape");
      await t.sleep(150);
      return seen;
    };
    const inside = await box(spots.from, spots.to);
    t.check(inside.length > 0 && inside.every((node) => node.inBody), "drawn in the details: blocks of the body alone, none of the page behind", JSON.stringify(inside));
    const fromPage = await box(spots.page, spots.into);
    t.check(fromPage.length > 0 && fromPage.every((node) => !node.inBody), "drawn on the page into the details: the page's blocks alone, none of the body", JSON.stringify(fromPage));
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // A record with no body: its details drawn around the body it would have, the page's own (an empty paragraph the
  // file has not got), the editor's there before anything is written: nothing written by opening them or clicking
  // in it, the handle beside it, "/" opening the editor's menu at once. The first word typed makes it the file's (its
  // row data-record, a slot in the pages after the table, made by the commit) with nothing on the screen moving (the
  // same slot and paragraph, the caret in it, the details not drawn again), one undo step taking it all away and
  // leaving an empty paragraph to type in again, redo bringing it back; so for what an input method composes and for
  // a paste. "/" there makes a heading and a list, a picture pasted is an image in it.
  async databaseRecordBody(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${TASKS}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    const original = mainOf(await t.read());
    await openRecord(t, 0);
    let now = await detailsNow(t);
    t.check(now?.where === "pages" && now.open && now.surface && now.provisional && now.editable && now.body?.join("|") === "p:" && !now.field, "a record with no body: its details drawn around an empty paragraph of the editor's, the body it would have", JSON.stringify(now));
    const paragraph = '.doc-database-pages[data-doc-peek] > [data-doc-shown] > p';
    await page.click(paragraph);
    await t.sleep(300);
    const clicked = await page.evaluate((at) => {
      const node = document.querySelector(at);
      return { focused: document.activeElement === node, says: node?.getAttribute("data-ge-placeholder") ?? null };
    }, paragraph);
    t.check(clicked.focused && Boolean(clicked.says), "a click puts the caret in it, the editor's placeholder there", JSON.stringify(clicked));
    await shoot(t, "empty-body");
    // The handle beside it, as beside any block.
    const spot = await page.evaluate((at) => { const box = document.querySelector(at).getBoundingClientRect(); return { x: box.left + 20, y: box.top + box.height / 2 }; }, paragraph);
    await page.mouse.move(spot.x, spot.y);
    await page.mouse.move(spot.x + 4, spot.y, { steps: 3 });
    await t.sleep(300);
    const handle = await page.evaluate(() => { const grip = document.querySelector(".ge-handle .ge-grip"); const box = grip?.getBoundingClientRect(); return Boolean(box && box.width > 0 && getComputedStyle(document.querySelector(".ge-handle")).visibility !== "hidden"); });
    t.check(handle, "the handle beside it on hover");
    await page.click(paragraph);
    await t.sleep(1500);
    t.check(mainOf(await t.read()) === original && (await t.state()) === "saved", "opening the details and clicking in the body write nothing", await t.state());
    // The first word: nothing on the screen moves as the body becomes the file's.
    await page.evaluate((at) => {
      const node = document.querySelector(at);
      const panel = node.closest(".doc-database-pages");
      window.__bodyWatch = { node, slot: node.parentElement, pin: panel.querySelector(".db-peek-pin"), top: node.getBoundingClientRect().top, frames: [] };
      const watch = window.__bodyWatch;
      const frame = () => {
        const now = document.querySelector(at);
        watch.frames.push({ same: now === watch.node, open: panel.matches(":popover-open"), top: Math.round((now?.getBoundingClientRect().top ?? -1) * 10) / 10 });
        if (watch.frames.length < 60) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }, paragraph);
    await t.type("hello");
    await t.sleep(1100);
    const steady = await page.evaluate((at) => {
      const watch = window.__bodyWatch;
      const node = document.querySelector(at);
      return {
        same: node === watch.node && node.parentElement === watch.slot && watch.slot.isConnected,
        pin: watch.pin.isConnected && watch.pin === node.closest(".doc-database-pages").querySelector(".db-peek-pin"),
        focused: document.activeElement === node,
        provisional: watch.slot.hasAttribute("data-ge-provisional"),
        tops: [...new Set(watch.frames.map((each) => each.top))],
        flicker: watch.frames.filter((each) => !each.same || !each.open).length,
        text: node.textContent,
      };
    }, paragraph);
    await shoot(t, "first-word");
    t.check(steady.same && steady.pin && steady.focused && !steady.provisional && steady.tops.length === 1 && steady.flicker === 0 && steady.text === "hello", "typing: the same slot and paragraph, the caret in it, the details not drawn again, nothing moved, no frame without them", JSON.stringify(steady));
    now = await detailsNow(t);
    await t.settle();
    let text = await t.read();
    const id = /^record:(.+)$/.exec(now?.slot ?? "")?.[1] ?? "?";
    t.check(rowOf(text, "登录页改版").includes(`data-record="${id}"`) && pagesIn(text).includes(`data-doc-slot="record:${id}"`) && /<p data-block-id="[^"]+">hello<\/p>/.test(pagesIn(text)), "in the file: the row's id, its slot after the table, the paragraph in it", `${rowOf(text, "登录页改版")} ${pagesIn(text)}`);
    // One undo: the body, the row's id and all; an empty paragraph to type in again, the caret in it.
    await t.combo("Control", "z");
    await t.sleep(400);
    now = await detailsNow(t);
    const caret = await page.evaluate((at) => document.activeElement === document.querySelector(at), paragraph);
    t.check(now?.where === "pages" && now.provisional && now.body?.join("|") === "p:" && caret, "undo: no body, an empty paragraph again, the caret in it", JSON.stringify({ now, caret }));
    await t.settle();
    text = await t.read();
    t.check(mainOf(text) === original, "undo: the file as it was (no slot, no pages, no id)", differ(original, mainOf(text)));
    await t.combo("Control", "y");
    await t.sleep(400);
    await t.settle();
    now = await detailsNow(t);
    text = await t.read();
    t.check(!now?.provisional && now?.body?.join("|") === "p:hello" && /<p data-block-id="[^"]+">hello<\/p>/.test(pagesIn(text)) && rowOf(text, "登录页改版").includes("data-record="), "redo: the body back, in the file too", JSON.stringify(now));
    await t.combo("Control", "z");
    await t.sleep(400);
    await t.settle();
    t.check(mainOf(await t.read()) === original, "undone again: the file as it was");
    // What an input method composes: nothing written while it composes, the body the file's once it is chosen, one undo.
    await page.click(paragraph);
    await t.sleep(200);
    const client = await page.createCDPSession();
    await client.send("Input.imeSetComposition", { text: "ni", selectionStart: 2, selectionEnd: 2 });
    await t.sleep(300);
    const composing = await page.evaluate((at) => ({ provisional: document.querySelector(at).parentElement.hasAttribute("data-ge-provisional"), text: document.querySelector(at).textContent }), paragraph);
    await client.send("Input.insertText", { text: "你" });
    await client.detach();
    await t.sleep(300);
    const composed = await page.evaluate((at) => ({ provisional: document.querySelector(at).parentElement.hasAttribute("data-ge-provisional"), text: document.querySelector(at).textContent, focused: document.activeElement === document.querySelector(at) }), paragraph);
    await t.settle();
    t.check(composing.provisional && composing.text === "ni" && !composed.provisional && composed.text === "你" && composed.focused && pagesIn(await t.read()).includes(">你</p>"), "an input method: nothing made while it composes, the body the file's with what it put in", JSON.stringify({ composing, composed }));
    await t.combo("Control", "z");
    await t.sleep(400);
    await t.settle();
    t.check(mainOf(await t.read()) === original && (await detailsNow(t))?.provisional, "its undo: one step, the file as it was");
    // A paste: the body the file's with what was pasted, one undo.
    await page.click(paragraph);
    await t.sleep(200);
    await page.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.setData("text/plain", "粘贴的正文");
      document.activeElement.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
    });
    await t.sleep(300);
    await t.settle();
    now = await detailsNow(t);
    t.check(!now?.provisional && now?.body?.join("|") === "p:粘贴的正文" && pagesIn(await t.read()).includes("粘贴的正文"), "a paste: the body the file's, the words in it", JSON.stringify(now));
    await t.combo("Control", "z");
    await t.sleep(400);
    await t.settle();
    t.check(mainOf(await t.read()) === original && (await detailsNow(t))?.provisional, "its undo: one step, the file as it was", `${rowOf(await t.read(), "登录页改版")} ${pagesIn(await t.read())}`);
    // "/" there: the editor's menu at once; a heading, then a list, then a picture pasted.
    await page.click(paragraph);
    await t.sleep(100);
    await t.type("/");
    const menu = await page.evaluate(() => {
      const card = document.querySelector(".ge-pop");
      const pages = document.querySelector(".doc-database-pages[data-doc-peek]");
      if (!card) return null;
      const box = card.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + Math.min(20, box.height / 2));
      return { inSurface: Boolean(pages?.contains(card)), onTop: card.contains(hit) };
    });
    t.check(menu?.inSurface && menu.onTop, "\"/\" there: the editor's menu at once, in the details, over them", JSON.stringify(menu));
    await shoot(t, "slash-menu");
    await t.type("多维");
    await t.sleep(250);
    const offered = await page.evaluate(() => [...(document.querySelector(".ge-pop")?.querySelectorAll("*") ?? [])].some((node) => node.childElementCount === 0 && node.textContent.trim() === "多维表格"));
    t.check(!offered, "no 多维表格 offered in a body");
    for (let index = 0; index < 2; index++) await t.press("Backspace");
    await t.type("h2");
    await t.sleep(250);
    await t.press("Enter");
    await t.type("要点");
    await t.press("Enter");
    await t.type("/ul");
    await t.sleep(250);
    await t.press("Enter");
    await t.type("第一项");
    await t.sleep(200);
    await t.press("Enter");
    await t.press("Enter");
    await pastePicture(t);
    await page.waitForFunction(() => document.querySelector(".doc-database-pages [data-doc-shown] figure.doc-image img"), { polling: 50, timeout: 10000 }).catch(() => {});
    await t.settle();
    await shoot(t, "body-made");
    text = await t.read();
    const pages = pagesIn(text);
    t.check(/<h2[^>]*>要点<\/h2>/.test(pages) && /<ul[^>]*>\s*<li[^>]*>第一项<\/li>\s*<\/ul>/.test(pages) && /class="doc-image/.test(pages), "in the file: the heading, the list and the picture in the body", pages.slice(0, 600));
    // Closed: nothing of the body before its first word stays on the page; another record opened and closed writes nothing.
    await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .peek-nav button")].find((node) => /关闭/.test(node.getAttribute("aria-label") ?? "")).click());
    await t.sleep(500);
    const written = await t.read();
    await openRecord(t, 1);
    await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .peek-nav button")].find((node) => /下一条/.test(node.getAttribute("aria-label") ?? "")).click());
    await t.sleep(400);
    await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .peek-nav button")].find((node) => /关闭/.test(node.getAttribute("aria-label") ?? "")).click());
    await t.sleep(600);
    await t.settle();
    const left = await page.evaluate(() => document.querySelectorAll("[data-ge-provisional]").length);
    t.check(left === 0 && (await t.read()) === written, "closed: no body before its first word left on the page, nothing written by opening others", String(left));
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // The body before a record's first word, at its edges: Backspace in it and a click below it write nothing (the
  // caret goes into its paragraph); Enter there is the editor's (two paragraphs, the file's, one undo); records with
  // none gone through one after another write nothing and leave nothing; an undo with the details closed takes the
  // body away all the same; an Agent's write while the details stand leaves them a body to type in.
  async databaseRecordBodyEdges(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${TASKS}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    const original = mainOf(await t.read());
    const paragraph = ".doc-database-pages[data-doc-peek] > [data-doc-shown] > p";
    const nav = (label) => page.evaluate((label) => [...document.querySelectorAll(".doc-database-app .peek-nav button")].find((node) => new RegExp(label).test(node.getAttribute("aria-label") ?? "")).click(), label);
    await openRecord(t, 0);
    // Backspace in the empty paragraph, a click on the details' blank under it.
    await page.click(paragraph);
    await t.press("Backspace");
    await t.sleep(200);
    const below = await page.evaluate(() => {
      const panel = document.querySelector(".doc-database-pages[data-doc-peek]");
      const box = panel.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.bottom - 40 };
    });
    await page.evaluate(() => document.activeElement?.blur());
    await page.mouse.click(below.x, below.y);
    await t.sleep(300);
    const after = await page.evaluate((at) => ({ focused: document.activeElement === document.querySelector(at), body: [...document.querySelector(at).parentElement.children].map((node) => node.localName), mainEnd: document.querySelector("main").lastElementChild.textContent.trim() }), paragraph);
    await t.sleep(1200);
    t.check(after.focused && after.body.join() === "p" && after.mainEnd === "后文" && mainOf(await t.read()) === original && (await t.state()) === "saved", "Backspace there and a click under it: the caret in its paragraph, nothing made, nothing written", JSON.stringify(after));
    // The pointer in the details' blank beside the body: the handle of the body's block, none of the page's behind them.
    const handleBeside = async () => {
      const gutter = await page.evaluate((at) => {
        const box = document.querySelector(at).getBoundingClientRect();
        return { x: box.left - 20, y: box.top + box.height / 2, top: box.top, bottom: box.bottom };
      }, paragraph);
      await page.mouse.move(gutter.x, gutter.y + 30);
      await page.mouse.move(gutter.x, gutter.y, { steps: 4 });
      await t.sleep(300);
      const shown = await page.evaluate(() => {
        const handle = document.querySelector(".ge-handle");
        const box = handle?.getBoundingClientRect();
        return box && getComputedStyle(handle).visibility !== "hidden" && box.width > 0 ? { middle: box.top + box.height / 2 } : null;
      });
      return { ok: Boolean(shown && shown.middle >= gutter.top - 2 && shown.middle <= gutter.bottom + 2), shown, gutter };
    };
    const spareHandle = await handleBeside();
    t.check(spareHandle.ok, "the pointer in the blank beside the body: the handle of its paragraph", JSON.stringify(spareHandle));
    // Enter: an empty line more, nothing written; a word in it then makes the body the file's with both lines, one
    // undo taking the word and the body away, the next the line; nothing written by any of it once undone.
    await page.click(paragraph);
    await t.press("Enter");
    await t.sleep(300);
    let now = await detailsNow(t);
    await t.sleep(1200);
    t.check(now?.provisional && now.body?.join("|") === "p:|p:" && mainOf(await t.read()) === original && (await t.state()) === "saved", "Enter there: two empty lines, still nothing written", JSON.stringify(now));
    await t.type("第二行");
    await t.settle();
    now = await detailsNow(t);
    let text = await t.read();
    t.check(!now?.provisional && now?.body?.join("|") === "p:|p:第二行" && (pagesIn(text).match(/<p /g) ?? []).length === 2 && pagesIn(text).includes("第二行") && rowOf(text, "登录页改版").includes("data-record="), "a word in the second: the body the file's, both lines", JSON.stringify(now));
    await t.combo("Control", "z");
    await t.sleep(400);
    await t.settle();
    t.check(mainOf(await t.read()) === original && (await detailsNow(t))?.provisional, "its undo: the file as it was", differ(original, mainOf(await t.read())));
    await t.combo("Control", "z");
    await t.sleep(400);
    await t.settle();
    now = await detailsNow(t);
    t.check(mainOf(await t.read()) === original && now?.provisional && now.body?.join("|") === "p:", "the next undo: one empty line, nothing written", JSON.stringify(now));
    await page.click(paragraph);
    await t.type("又一句");
    await t.settle();
    text = await t.read();
    const realHandle = await handleBeside();
    t.check(realHandle.ok, "beside a body the file has: the same handle", JSON.stringify(realHandle));
    t.check(/<p data-block-id="[^"]+">又一句<\/p>/.test(pagesIn(text)) && (pagesIn(text).match(/<p /g) ?? []).length === 1 && (await t.state()) === "saved", "a word typed then: the body the file's, that line alone", pagesIn(text));
    await t.combo("Control", "z");
    await t.sleep(400);
    await t.settle();
    t.check(mainOf(await t.read()) === original, "undone: the file as it was");
    // Through the records one after another, each with none: nothing written, nothing left.
    for (let at = 0; at < 3; at++) {
      await nav("下一条");
      await t.sleep(350);
      now = await detailsNow(t);
      if (!now?.provisional || now.body?.join("|") !== "p:" ) break;
    }
    t.check(now?.provisional, "the next records: each its body to type in", JSON.stringify(now));
    await nav("上一条");
    await t.sleep(350);
    const spares = await page.evaluate(() => document.querySelectorAll("[data-ge-provisional][data-doc-slot]").length);
    await t.sleep(1200);
    t.check(spares === 1 && mainOf(await t.read()) === original && (await t.state()) === "saved", "one body before its first word on the page at a time, nothing written", String(spares));
    // A word, the details closed, then undo on the page: the body taken away all the same.
    await page.click(paragraph);
    await t.type("关了再撤销");
    await t.settle();
    await nav("关闭");
    await t.sleep(500);
    await t.caret("前文");
    await t.combo("Control", "z");
    await t.sleep(400);
    await t.settle();
    t.check(mainOf(await t.read()) === original, "undo with the details closed: the file as it was", differ(original, mainOf(await t.read())));
    await t.combo("Control", "y");
    await t.sleep(400);
    await t.settle();
    t.check(pagesIn(await t.read()).includes("关了再撤销"), "and redo: the body back");
    await t.combo("Control", "z");
    await t.sleep(400);
    await t.settle();
    // An Agent's write while the details of a record with none stand: a body to type in still, and the word goes in.
    await openRecord(t, 1);
    const reloaded = t.reloaded().catch(() => null);
    await t.agentEdit((file) => file.replace("<p>后文</p>", "<p>后文，Agent 又写了一句</p>"));
    await Promise.race([reloaded, t.sleep(4000)]);
    await t.sleep(800);
    now = await detailsNow(t);
    if (!now) {
      await openRecord(t, 1);
      now = await detailsNow(t);
    }
    t.check(now?.provisional && now.body?.join("|") === "p:只做四则运算", "after an Agent's write: its details stand around a body to type in (its notes in it)", JSON.stringify(now));
    await page.click(paragraph);
    await t.type("写入之后");
    await t.settle();
    text = await t.read();
    t.check(pagesIn(text).includes("写入之后") && text.includes("Agent 又写了一句"), "the word typed then is written, with the Agent's", pagesIn(text).slice(0, 300));
    // An Agent's write of the database itself (a cell of another record) while the details of one with none stand: so too.
    await nav("下一条");
    await t.sleep(400);
    const before = await detailsNow(t);
    await t.agentEdit((file) => file.replace("<td>待开始</td><td>林夏</td><td>前端, 后端</td>", "<td>进行中</td><td>林夏</td><td>前端, 后端</td>"));
    await t.sleep(2500);
    now = await detailsNow(t);
    if (!now) {
      await openRecord(t, 2);
      now = await detailsNow(t);
    }
    t.check(before?.provisional && now?.provisional && now.title === "日历视图" && now.body?.join("|") === "p:", "after an Agent's write of the database: its details around a body to type in still", JSON.stringify({ before, now }));
    await page.click(paragraph);
    await t.type("日历的正文");
    await t.settle();
    text = await t.read();
    t.check(pagesIn(text).includes("日历的正文") && /<tr data-record="[^"]+"><td>日历视图<\/td><td>进行中<\/td>/.test(text), "the word typed then is written, the Agent's cell kept", rowOf(text, "日历视图"));
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // An Agent's bodies: each record's details show its own (the others hidden), another record of none the body it
  // would have; old notes are the words of its first paragraph, the file's once a word is typed there (one step: the
  // notes gone from their cell), and the details at the side have one scrollbar, theirs, at the window's right.
  async databaseRecordBodies(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${WITH_BODIES}\n    ${Array.from({ length: 40 }, (_, at) => `<p>后文 ${at + 1}</p>`).join("\n    ")}`));
    await t.open();
    await drawn(t);
    await openRecord(t, 0);
    let now = await detailsNow(t);
    t.check(now?.where === "pages" && now.slot === "record:login" && now.body?.join("|") === "h2:改版要点|p:登录页的正文：先做手机号登录。" && now.hidden.every((shown) => shown === "none"), "its own body shown in its details, the others hidden", JSON.stringify(now));
    // The editor's own: a block there takes the caret and words.
    await t.caret("先做手机号登录", { after: "先做" });
    await t.type("和邮箱");
    await t.settle();
    t.check((await t.read()).includes("先做和邮箱手机号登录"), "a body's words typed are written as any block's");
    await t.press("Escape");
    await t.sleep(150);
    // ↓ to the next record (notes, no body): the paragraph of the body it would have holds its notes.
    await page.evaluate(() => document.activeElement?.blur());
    await t.sleep(100);
    await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .peek-nav button")].find((node) => /下一条/.test(node.getAttribute("aria-label") ?? "")).click());
    await t.sleep(400);
    now = await detailsNow(t);
    const props = () => page.evaluate(() => [...document.querySelectorAll(".doc-database-pages[data-doc-peek] .peek-prop .peek-name")].map((node) => node.textContent));
    const notesShown = (await props()).includes("备注");
    t.check(now?.where === "pages" && now.provisional && now.body?.join("|") === "p:只做四则运算" && !notesShown, "the next record: no body, its notes the words of the body it would have (not among its values)", JSON.stringify({ now, notesShown }));
    // A word typed at its end: the body the file's, its notes its first paragraph, the notes gone, one step.
    await t.caret("只做四则运算", { where: "end" });
    await t.type("和括号");
    await t.sleep(300);
    now = await detailsNow(t);
    t.check(now?.where === "pages" && !now.provisional && now.body?.join("|") === "p:只做四则运算和括号", "the notes the body's first paragraph, the word typed after them", JSON.stringify(now));
    await t.settle();
    let text = await t.read();
    t.check(/<tr data-record="[^"]+"><td>公式引擎<\/td>[\s\S]*?<td><\/td><\/tr>/.test(text) && pagesIn(text).includes("只做四则运算和括号"), "in the file: the notes' cell empty, the words in the body", rowOf(text, "公式引擎"));
    await t.combo("Control", "z");
    await t.sleep(400);
    now = await detailsNow(t);
    t.check(now?.where === "pages" && now.provisional && now.body?.join("|") === "p:只做四则运算", "undo: the notes back, no body", JSON.stringify(now));
    await t.settle();
    text = await t.read();
    t.check(text.includes("<td>只做四则运算</td>") && !text.includes("和括号"), "undo: the file's notes as they were");
    // A key typed in the middle of the notes: it lands where the caret was.
    await t.caret("只做四则运算", { after: "只做" });
    await t.type("x");
    await t.sleep(300);
    now = await detailsNow(t);
    t.check(now?.body?.join("|").replace(/ /g, "") === "p:只做x四则运算", "a key typed amid the notes lands where the caret was (the editor's spaces beside a Latin letter aside)", JSON.stringify(now));
    await t.combo("Control", "z");
    await t.sleep(400);
    await t.settle();
    await page.evaluate(() => [...document.querySelectorAll(".doc-database-app .peek-nav button")].find((node) => /关闭/.test(node.getAttribute("aria-label") ?? "")).click());
    await t.sleep(500);

    // The details at the side: one scrollbar at the window's right, theirs (the page's out of sight), light and dark,
    // at 1280 and in a narrower window; the wheel over the page still scrolls it. A body long enough to scroll.
    await t.agentEdit((text) => text.replace(/(<p[^>]*>登录页的正文：[^<]*<\/p>)/, `$1${Array.from({ length: 30 }, (_, at) => `
          <p>正文第 ${at + 1} 段</p>`).join("")}`));
    for (const [width, scheme] of [[1280, "light"], [900, "dark"]]) {
      await t.withScrollbars(async (shown) => {
        await shown.setViewport({ width, height: 800 });
        await shown.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
        await shown.goto(t.url(), { waitUntil: "load" });
        await shown.waitForFunction(() => document.querySelector(".doc-database-app .db-head"), { polling: 50, timeout: 15000 });
        await new Promise((done) => setTimeout(done, 400));
        const before = await shown.evaluate(() => ({ bar: innerWidth - document.documentElement.clientWidth, left: document.querySelector("main").getBoundingClientRect().left }));
        await shown.evaluate(() => document.querySelectorAll(".doc-database-app [data-rowid] .open-btn")[0].click());
        await new Promise((done) => setTimeout(done, 600));
        const open = await shown.evaluate(() => {
          const panel = document.querySelector(".doc-database-pages[data-doc-peek]");
          const box = panel.getBoundingClientRect();
          return { bar: innerWidth - document.documentElement.clientWidth, right: box.right, width: innerWidth, own: panel.offsetWidth - panel.clientWidth - parseFloat(getComputedStyle(panel).borderLeftWidth), scrolls: panel.scrollHeight > panel.clientHeight, left: document.querySelector("main").getBoundingClientRect().left };
        });
        t.check(before.bar > 0 && open.bar === 0 && Math.abs(open.right - open.width) < 1 && open.own > 0 && open.scrolls && Math.abs(open.left - before.left) < 1, `${width} ${scheme}: one scrollbar, the details', at the window's right; the page's out of sight, nothing of it moved`, JSON.stringify({ before, open }));
        // The details' own scrollbar scrolls them.
        const scrolled = await shown.evaluate(() => {
          const panel = document.querySelector(".doc-database-pages[data-doc-peek]");
          panel.scrollTop = 200;
          return panel.scrollTop;
        });
        t.check(scrolled === 200, `${width} ${scheme}: the details scroll by their own scrollbar`, String(scrolled));
        if (SHOTS) await shown.screenshot({ path: path.join(SHOTS, `side-${width}-${scheme}.png`) });
        await shown.evaluate(() => { document.querySelector(".doc-database-pages[data-doc-peek]").scrollTop = 0; });
        // The wheel over the page (left of the details) scrolls the page.
        const y0 = await shown.evaluate(() => scrollY);
        await shown.mouse.move(80, 400);
        await shown.mouse.wheel({ deltaY: 300 });
        await new Promise((done) => setTimeout(done, 300));
        t.check((await shown.evaluate(() => scrollY)) > y0, `${width} ${scheme}: the wheel over the page still scrolls it`);
        // Closed: the page's scrollbar back.
        await shown.keyboard.press("Escape");
        await new Promise((done) => setTimeout(done, 600));
        t.check((await shown.evaluate(() => innerWidth - document.documentElement.clientWidth)) === before.bar && !(await shown.$(".doc-database-pages[data-doc-peek]")), `${width} ${scheme}: closed, the page's scrollbar back`);
      });
    }
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // The details at the side slide in and out as the workbench's sidebar does: their transform and opacity change
  // over some frames as they open and as they close, and nothing of them stays.
  async databaseRecordMotion(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${WITH_BODIES}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    const watch = () => page.evaluate(() => new Promise((done) => {
      const seen = [];
      const start = performance.now();
      const frame = () => {
        const panel = document.querySelector(".doc-database-pages[data-doc-peek], .doc-database-app .peek");
        if (panel) {
          const style = getComputedStyle(panel);
          seen.push({ transform: style.transform, opacity: Number(style.opacity) });
        } else seen.push(null);
        if (performance.now() - start < 520) requestAnimationFrame(frame);
        else done(seen);
      };
      requestAnimationFrame(frame);
    }));
    await page.evaluate(() => document.querySelectorAll(".doc-database-app [data-rowid] .open-btn")[0].click());
    const opening = await watch();
    const moving = opening.filter((each) => each && (each.transform !== "none" || each.opacity < 1));
    const last = opening.at(-1);
    t.check(moving.length >= 3 && new Set(moving.map((each) => each.transform)).size >= 3 && last?.transform === "none" && last.opacity === 1, "opening: it slides in and fades in over some frames, then stands", JSON.stringify({ moving: moving.length, last }));
    await t.press("Escape");
    const closing = await watch();
    const going = closing.filter((each) => each && (each.transform !== "none" || each.opacity < 1));
    t.check(going.length >= 3 && closing.at(-1) === null, "closing: it slides out and fades out over some frames, then is gone", JSON.stringify({ going: going.length, last: closing.at(-1) }));
    t.check(await page.evaluate(() => !document.documentElement.classList.contains("doc-peek-side") && !document.querySelector("[data-doc-shown], [data-doc-surface]")), "nothing of it stays: no mark on the page, the pages hidden again");
    // Opened in the middle (the view's open "center"): its pages over a veil, as they were before (no slide), the body in them.
    await t.agentEdit((text) => text.replace('{ "id": "v1", "name": "全部任务", "layout": "table" }', '{ "id": "v1", "name": "全部任务", "layout": "table", "open": "center" }'));
    await t.open();
    await drawn(t);
    await page.evaluate(() => document.querySelectorAll(".doc-database-app [data-rowid] .open-btn")[0].click());
    await t.sleep(400);
    const center = await page.evaluate(() => {
      const pages = document.querySelector('.doc-database-pages[data-doc-peek="center"]');
      const mask = document.querySelector(".doc-database-app .peek-mask");
      const box = pages?.getBoundingClientRect();
      return { open: Boolean(pages?.matches(":popover-open")), mask: Boolean(mask?.matches(":popover-open")), middle: box ? Math.abs(box.left + box.width / 2 - innerWidth / 2) < 2 : false, body: pages?.querySelector("[data-doc-shown] h2")?.textContent ?? null, side: document.documentElement.classList.contains("doc-peek-side") };
    });
    t.check(center.open && center.mask && center.middle && center.body === "改版要点" && !center.side, "in the middle: its pages over the veil, centred, the body in them, the page's scrollbar as it was", JSON.stringify(center));
    await shoot(t, "center");
    await t.press("Escape");
    await t.sleep(300);
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },

  // A database with bodies copied and pasted: the copy carries them (its markup with their slots empty, their blocks
  // apart, made anew), each body in the copy its own blocks, edited and saved as any; the clipboard's database pasted
  // in a body goes nowhere (a body holds no database).
  async databaseRecordBodyCopy(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${WITH_BODIES}\n    <p>后文</p>`));
    await t.open();
    await drawn(t);
    await t.caret("前文");
    await t.press("Escape");
    await t.press("ArrowDown");
    const picked = await page.evaluate(() => [...document.querySelectorAll("[data-ge-selected]")].map((node) => node.className));
    await t.combo("Control", "c");
    await t.sleep(200);
    await t.caret("后文");
    await t.combo("Control", "v");
    await t.sleep(800);
    await t.settle();
    let text = await t.read();
    const databases = text.split('<div class="doc-database"').slice(1).map((each) => each.split("<p>后文")[0].split("</main>")[0]);
    t.check(databases.length === 2 && databases.every((each) => each.includes("改版要点") && each.includes("拖动改日期")) && /<h2 data-block-id="[^"]+">改版要点<\/h2>/.test(databases[1]) && /\n\s+<h2 /.test(databases[1]), "the copy carries the bodies: two databases, the copy's blocks with ids of their own, a line each", JSON.stringify({ picked, count: databases.length, copy: databases[1]?.slice(-700) }));
    // The copy's body edited.
    await page.evaluate(() => document.querySelectorAll(".doc-database")[1].querySelectorAll(".doc-database-app [data-rowid] .open-btn")[0].click());
    await t.sleep(500);
    const now = await detailsNow(t);
    t.check(now?.where === "pages" && now.body?.[0] === "h2:改版要点", "the copy's record shows its own body", JSON.stringify(now));
    await page.evaluate(() => {
      const heading = document.querySelectorAll(".doc-database")[1].querySelector('[data-doc-slot="record:login"] h2');
      heading.focus();
      const range = document.createRange();
      range.selectNodeContents(heading);
      range.collapse(false);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    await t.type("（副本）");
    await t.settle();
    text = await t.read();
    t.check((text.match(/改版要点（副本）/g) ?? []).length === 1 && text.indexOf("改版要点（副本）") > text.lastIndexOf('<div class="doc-database"'), "the copy's body typed in: in its own database, the first's as it was");
    // The database pasted in a body: nothing goes in.
    await t.combo("Control", "v");
    await t.sleep(600);
    await t.settle();
    text = await t.read();
    t.check((text.match(/<div class="doc-database"/g) ?? []).length === 2, "a database pasted in a body is refused", String((text.match(/<div class="doc-database"/g) ?? []).length));
    t.takeErrors();
  },

  // Readers with no drawing: gallery read says each body under its record's title, the Markdown export writes them
  // after the table; an export shows a body in its record's details, read only.
  async databaseRecordBodyRead(t) {
    const { page } = t;
    await t.agentEdit(pageOf("任务", `<p>前文</p>\n    ${WITH_BODIES}\n    <p>后文</p>`));
    const read = t.gallery("read", "sample");
    t.check(/正文「登录页改版」（record:login）/.test(read) && read.indexOf("改版要点") > read.indexOf("正文「登录页改版」") && /正文「日历视图」/.test(read), "gallery read: each body boxed under its record's title", read.slice(read.indexOf("正文"), read.indexOf("正文") + 300));
    const markdown = t.gallery("read", "sample", "--format", "markdown");
    t.check(/\*\*登录页改版\*\*\s+## 改版要点\s+登录页的正文/.test(markdown) && /\*\*日历视图\*\*\s+- 月视图/.test(markdown) && markdown.indexOf("**登录页改版**") > markdown.indexOf("| 登录页改版"), "Markdown: after the table, each body under its record's title in bold", markdown.slice(markdown.indexOf("| 任务"), markdown.indexOf("| 任务") + 700));
    const check = t.checkReport();
    t.check(!/the <div> inside the database is none of it/.test(check), "gallery check takes its pages", check.slice(0, 400));
    const file = t.exportReport();
    await page.goto(file, { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelector(".doc-database-app .db-head"), { polling: 50, timeout: 15000 });
    await t.sleep(300);
    await page.evaluate(() => document.querySelectorAll(".doc-database-app [data-rowid] .open-btn")[0]?.click() ?? [...document.querySelectorAll(".doc-database-app [data-rowid]")][0]?.click());
    await t.sleep(600);
    const shown = await page.evaluate(() => {
      const pages = document.querySelector(".doc-database-pages[data-doc-peek]");
      const slot = pages?.querySelector("[data-doc-shown]");
      return { body: slot?.textContent.replace(/\s+/g, " ").trim() ?? null, editable: Boolean(slot?.querySelector("[contenteditable=true]")) };
    });
    t.check(shown.body?.includes("改版要点") && !shown.editable, "the export: the body in the record's details, read only", JSON.stringify(shown));
    t.check(t.takeErrors().length === 0, "no errors on the page");
  },
};
