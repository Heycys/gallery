import "../unit/workspace-env.mjs"; // the tests' temporary workspace and data folder, unless GALLERY_WORKSPACE names a workspace
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { addBlockIds, findUnits, hashOf, naturalize, shownSource } from "../../src/editor/source.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { createStudio } from "./harness.mjs";

// Editing on the page at random, on a new report (flat, or its paragraph in a section): typing,
// Enter, Backspace (in text and at a block's start), Tab and Shift+Tab, "- " turning a paragraph
// into a list, arrows, undo and redo, and commits at random moments (Ctrl+S, or a pause), so that
// the reader keeps typing while one is on its way. With nobody else writing the file, two things
// must hold: no conflict ever shows, and once everything is saved, the file reads as the page does
// and is the kit's markup through and through, nothing in it natural HTML (naturalize changes
// nothing: the page would otherwise take its own write for someone else's) (docs/testing.md,
// "Editing at random").
//
// `--more`: block operations too: Markdown turning a block into a heading, a quote or a numbered
// item, a code block or a divider; Esc selecting the block, then Delete, or Ctrl+Shift+↑/↓ moving it;
// two lines pasted; its block menu turning it into another type, making a section below it,
// dissolving its section or making columns; it and the block above or below it selected and turned
// together into another type (their block menu's grid); dragging it by its handle. `--agent`: an
// Agent writes the file meanwhile (rewording, deleting and adding paragraphs, or exporting it: every
// block given an id, as gallery export hands a report in), the reader types
// words of their own (q1x, q2x…), and the page reloads by itself when it may: conflicts may show
// then, but every word of the reader's the page shows in the end is in the file, held for the
// reader (a block flagged with a conflict), or listed (what a page could not put back), but for
// those in a paragraph the Agent deleted (its choice); and so is every word a page showed as it went
// to show the file again by itself, or on the page shown again (keptAfterReload).
//
// `--instances` (with either or both of the others): the report starts with an instance of each of
// the fixtures' packages that write back (tests/fixtures/components/local/rows, kanban, scorecard)
// after its paragraph, or (a seed in three) in a tab panel, a list item and a column, the first of them
// followed by one of local/brief, a slot of two paragraphs, the document's blocks in an instance (the
// steps on a text part of an instance land in those too, and those on one selected select a block of
// the slot), and a step in
// three is one on instances: one made by "/" and its name, the caret put in a text part of one by a
// click (where the steps type on, a word in three by an input method), a component's own gesture
// with the real pointer (a card of the task board dragged to another column or within one, a dot of
// the scorecard pressed, a row of the rows dragged onto another, sent down or counted), undo and
// redo, and one selected (Esc) and deleted, moved by Ctrl+Shift+↑/↓, copied (Ctrl+C) and pasted
// (Ctrl+V) within the document, or dragged by its handle. With nobody else writing, an instance reads
// in the file as on the page too (its data parts as DocKit.dehydrate leaves them on the page against
// the file's own markup of them), and gallery check passes the file. With `--agent`, the Agent also
// writes an instance (words of its own, a1y, a2y…, in a part of its data, in a text part or in a
// paragraph of a slot; or deletes or moves it), and its paragraphs carry such words, half of its writes
// made between the commits on
// their way and half while one is; or it writes back the whole file as it read it a few steps earlier,
// since its last write and the page's last showing, with a paragraph of its own, putting back what the
// reader saved since, which the page asks of before it shows that write (the revert check: texts,
// blocks made or moved, what components wrote); the reader answers a conflict's card now and then,
// with the pointer. Then every word of the Agent's is in the file but for what it deleted itself, what
// the reader wrote over by a choice (仍然…, 保留我的, 恢复我的), what is held or listed, and what the
// reader took off the page by a step that takes words away (Backspace, a deletion, a paste, undo or
// redo, a conversion); the reader's words given up by a choice (保留 Agent 的, 用文件里的, 接受…) need not
// be; what a component wrote, on an instance neither held nor given up, is in the file as on the page
// but for the Agent's words, whenever the page is saved with nothing on its way (from there it shows
// the file again by itself, which would put the file's in place of a write it never sent), and so is
// every word of the reader's it shows; and gallery check passes. A word of the Agent's lost by a write
// made while a commit was on its way, whose answer says the server saw no write but the page's
// (`foreign` false) and after which the file lacks it, fell in the gap writeAtomic
// (src/shared/files.mjs) documents between its last look at the file and its rename, which no page
// could know of: it is said, not counted.
//
// With --agent the page takes a write of words or of blocks of words in where it stands (its pull, page/pull/;
// GALLERY_TEST_PULL=off: never, every write shown by loading the page anew, for a run to compare): a pull
// that leaves the page holding something to commit says so on the console (a page error), and at the end,
// once the page is saved and shows all the file has (no data-ge-behind), its text blocks read as those of
// the document opened anew in a page beside it. The page's words are read block by block (a space between two
// blocks: a word Enter split is two words, as in the file).
//
// `--words` (with --agent): the Agent's writes change words alone (one to three paragraphs or items of a list
// given words of its own, at their end or start), a step in four its write: what the page takes in where it stands
// most often. `--structure` (with --agent): its writes put paragraphs and items of a list in, take them out and
// move them (a paragraph after another or to the end, an item after another, in its list or another, never the last
// of its list taken out or away), now and then two at once, a step in four its write: what the page takes in where
// it stands by arranging its blocks as the file has them. The rules are those of --agent; the reader's
// words in what the Agent took out are its choice, in what it moved still the reader's. With either, a step in
// twelve of the reader's answers a card where there is one (a paragraph with no id the Agent moved while the reader
// typed in it: the server no longer finds it where it stood), so that one card does not hold every later write back.
//
// `--changes` (with --agent): 显示变更 on (the scenarios' studio has it off), the session's start kept
// at once, so that the Agent's writes are marked on the page while the reader edits: the words it took
// out shown in the paragraphs (page/changes/gone-words.mjs), the blocks it deleted a ghost in room made
// for them (ghost.mjs); and a paragraph it rewords loses words of its own where it has some ("（AI 改"
// becomes "（AI 修订", "AI 加的段落" "AI 段落"), never the reader's. All of the above holds as without
// them: none of it may reach the file.
//
//   npm run test:fuzz -- [first seed] [how many] [steps] [--more] [--agent] [--instances] [--changes] [--words|--structure]
//
// A failing seed prints the operations it ran and the file; run it again alone to look into it.

const WORDS = ["是", "的", "ab", "地方", "x", "好", "c d"];
// Where a session starts: a new report as 新建文档 makes it (one empty paragraph in the page), or
// that paragraph in a section, as an Agent's report holds its text.
const STARTS = {
  flat: `<main$1>
    <header class="doc-header">
      <h1 class="doc-title">未命名报告</h1>
    </header>

    <p></p>
  </main>`,
  section: `<main$1>
    <header class="doc-header">
      <h1 class="doc-title">未命名报告</h1>
    </header>

    <section class="doc-section">
      <p></p>
    </section>
  </main>`,
};

// With --instances, the packages of the fixtures' that write back (tests/fixtures/components/local/,
// which every studio's workspace holds): by id, the name "/" finds each by, its letters as an input
// method composes them, and the id of the one a session starts with.
const WRITERS = [
  { id: "local/rows", name: "排序表", letters: "pai'xu'biao", block: "rows0001" },
  { id: "local/kanban", name: "任务看板", letters: "ren'wu'kan'ban", block: "kanban01" },
  { id: "local/scorecard", name: "评分表", letters: "ping'fen'biao", block: "scores01" },
];
// An instance of each as its template makes it, with an id, as an Agent's report holds one (a component
// writes back only to an instance the file names), its lines at `indent`.
const writerAt = ({ id, block }, indent) => fs.readFileSync(path.join(projectRoot, "tests", "fixtures", "components", id, "template.html"), "utf8")
  .replace(/<!--[\s\S]*?-->\s*/g, "").trim().replace(`data-doc-component="${id}"`, `$& data-block-id="${block}"`).replace(/\n/g, `\n${indent}`);
// An instance of local/brief, a slot of two paragraphs, with an id, its lines at `indent`.
const briefAt = (indent) => ['<div class="brief" data-doc-component="local/brief" data-block-id="brief001">', "  <h3>要点</h3>", '  <div class="brief-body" data-doc-slot="body">', "    <p>插槽一段</p>", "    <p>插槽二段</p>", "  </div>", "</div>"].join(`\n${indent}`);
// One of each after the session's paragraph, the brief after the first.
const writersAt = (indent) => WRITERS.map((writer, index) => writerAt(writer, indent) + (index === 0 ? `\n${indent}${briefAt(indent)}` : "")).join(`\n${indent}`);
// Or each in a container of its own, after a paragraph there: the rows in the first panel of a tab area,
// the task board in a list item, the scorecard in a column (`places`).
const PLACES = `<main$1>
    <header class="doc-header">
      <h1 class="doc-title">未命名报告</h1>
    </header>

    <p></p>
    <section class="doc-sheet-shell" data-doc-sheets="tabs0001" aria-label="选项卡">
      <div class="doc-sheet-tabs" aria-label="选项卡"><button class="doc-sheet-tab" type="button" data-sheet-tab="tab-0001">甲页</button><button class="doc-sheet-tab" type="button" data-sheet-tab="tab-0002">乙页</button></div>
      <div data-doc-sheet="tab-0001">
        <p>甲页一段</p>
        ${writerAt(WRITERS[0], "        ")}
        ${briefAt("        ")}
      </div>
      <div data-doc-sheet="tab-0002">
        <p>乙页一段</p>
      </div>
    </section>

    <ul>
      <li>条目一
        ${writerAt(WRITERS[1], "        ")}
      </li>
      <li>条目二</li>
    </ul>

    <div class="doc-columns">
      <div class="doc-column">
        <p>左栏一段</p>
        ${writerAt(WRITERS[2], "        ")}
      </div>
      <div class="doc-column">
        <p>右栏一段</p>
      </div>
    </div>
  </main>`;
// The letters an input method composes for the words typed (the word itself for those of letters).
const LETTERS = { 是: "shi", 的: "de", 地方: "di'fang", 好: "hao" };

// The Agent's own words (--instances) in a text or markup: a1y, a2y…, apart from any other letter or
// digit, outside tags (a block's id may hold the like).
const agentWordsIn = (text) => text.replace(/<[^>]*>/g, " ").match(/(?<![A-Za-z0-9])a\d+y(?![A-Za-z0-9])/g) ?? [];
// The reader's steps that may take words off the page: Backspace, a block or an instance deleted, a
// paste (over what is selected), undo and redo, a block turned into another type.
const TAKES_AWAY = /^(Backspace|Home Backspace|select Delete|instance delete|instance copy|paste|undo|redo|menu type|group type)$/;

// The version a page is told of a file by (the edit service's: the hash of the file as pages see it).
const versionOf = (text) => hashOf(shownSource(text).text);
// How long the rules wait for the page to hold what an Agent's write put back of the reader's: its pages
// are told of a write once it has not changed for a moment (QUIET, src/editor/settle.mjs, 1.5 s), the
// page then asks what it put back (POST /__gallery/edit/reverted), whose answer may wait for a file held
// half written (WAIT, 10 s); on a busy machine each takes longer.
const KEPT_WITHIN = 20000;

// A small, fast generator, the same operations for the same seed.
const generator = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
};

// The report's content as the reader sees it: tags, own text and nesting; empty blocks are not
// written (an empty paragraph, an empty item), so they do not count. What an item holds is not its
// own text (HELD_TAGS, list/): between its blocks the file has spaces the page does not. An instance
// of a package is its package, the words of each text part, the inside of each data part, as the
// kit's dehydrate leaves it (what a commit compares a data part with), and the blocks of each slot.
function shape() {
  const HELD = "p, h1, h2, h3, h4, h5, h6, ul, ol, div, figure, blockquote, details, hr, table, pre";
  const words = (node) => node.textContent.replace(/\s+/g, " ").trim();
  const instance = (node) => {
    const id = node.getAttribute("data-doc-component");
    const copy = globalThis.DocKit.dehydrate(node.cloneNode(true));
    const parts = Object.entries(globalThis.DocKit.description(id)?.parts ?? {}).flatMap(([name, { at, edit }]) => {
      if (edit === "text") return [...copy.querySelectorAll(at)].map((part) => `${name}:${words(part)}`);
      const slot = edit === "flow" && copy.querySelector(at);
      if (slot) return [`${name}[${walk(slot).join(",")}]`];
      const part = edit === "data" && copy.querySelector(at);
      return part ? [`${name}=${part.innerHTML}`] : [];
    });
    return `${id}{${parts.join("|")}}`;
  };
  const walk = (node) => {
    const out = [];
    for (const child of node.children) {
      if (child.closest("[data-doc-dev]") || child.matches("header, script, style, .doc-code-fold, .doc-code-tools")) continue;
      const tag = child.localName;
      if (child.matches("[data-doc-component]")) out.push(instance(child));
      else if (["p", "h1", "h2", "h3", "h4", "li"].includes(tag)) {
        const own = [...child.childNodes].filter((kid) => !(kid.nodeType === 1 && kid.matches(HELD)))
          .map((kid) => kid.textContent).join("").replace(/ /g, " ").replace(/\s+/g, " ").trim();
        // An empty one counts too: the file keeps it (a free text block may be empty).
        const kids = walk(child);
        out.push(`${tag}:${own}${kids.length ? `[${kids.join(",")}]` : ""}`);
      } else if (["ul", "ol", "section", "blockquote", "div"].includes(tag)) {
        const kids = walk(child);
        if (kids.length > 0) out.push(`${tag}[${kids.join(",")}]`);
      }
    }
    return out;
  };
  return walk(document.querySelector("main")).join(" ");
}

// In the page, given the file: each data part of each instance the page shows, as DocKit.dehydrate
// leaves it, that differs from the file's own markup of it (that instance's, by its id), the Agent's
// own words and rows left out of both and blanks between tags not counted, but for an instance held for
// the reader or given up on a card; `gone` for one the file does not hold.
function writtenApart(file) {
  const flat = (html) => html.replace(/<tr><td>a\d+y<\/td>(?:<td>[^<]*<\/td>)*<\/tr>/g, "").replace(/ a\d+y(?![A-Za-z0-9])/g, "").replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();
  const parsed = new DOMParser().parseFromString(file, "text/html");
  const apart = [];
  for (const node of document.querySelectorAll("main [data-doc-component]")) {
    if (node.closest('[data-ge-flag], [data-ge-lock="given-up"]') || node.querySelector('[data-ge-flag], [data-ge-lock="given-up"]')) continue;
    const parts = Object.entries(globalThis.DocKit.description(node.getAttribute("data-doc-component"))?.parts ?? {}).filter(([, { edit }]) => edit === "data");
    const id = node.getAttribute("data-block-id");
    const there = id && parsed.querySelector(`main [data-block-id="${id}"]`);
    if (parts.length === 0) continue;
    if (!there) {
      apart.push({ id, gone: true });
      continue;
    }
    const copy = globalThis.DocKit.dehydrate(node.cloneNode(true));
    for (const [name, { at }] of parts) {
      const [mine, theirs] = [copy, there].map((instance) => flat(instance.querySelector(at)?.innerHTML ?? ""));
      if (mine !== theirs) apart.push({ id, name, page: mine, file: theirs });
    }
  }
  return apart;
}

// What gallery check says of the report, every instance in it well-formed by its manifest: null when it passes.
function checked(t) {
  try {
    t.checkReport();
    return null;
  } catch (error) {
    return `gallery check fails the file: ${error.message.replace(/\s+/g, " ").slice(0, 600)}`;
  }
}

/**
 * One session, `steps` operations from `seed`, on a new report (`start`: "flat", as 新建文档 makes
 * it; "section", its paragraph in a section; with instances "places" too, theirs in containers; by
 * default one or the other by the seed). Returns { problem, ops, file, notes }: problem null when the
 * rules held, notes what is said of it all the same (a word lost in the server's documented gap).
 */
export async function session(t, seed, steps = 40, start = null, { more = false, agent = false, instances = false, changes = false, writes = "mixed" } = {}) {
  const random = generator(seed);
  const pick = (items) => items[Math.floor(random() * items.length)];
  const { page } = t;
  const where = start ?? (instances && seed % 3 === 2 ? "places" : seed % 2 === 0 ? "flat" : "section");
  const begun = !instances ? STARTS[where] : where === "places" ? PLACES : STARTS[where].replace(/( *)<p><\/p>/, (line, indent) => `${line}\n${indent}${writersAt(indent)}`);
  const notes = [];
  await t.agentEdit((text) => text.replace(/<script>[\s\S]*?<\/script>/g, "<script></script>").replace(/<main([^>]*)>[\s\S]*<\/main>/, begun));
  await t.open();
  if (changes) { // 显示变更 on, and the session's start (the Agent's write of it) kept
    await page.evaluate(() => localStorage.setItem("gallery:preferences", JSON.stringify({ editFrame: true, showChanges: true })));
    await t.open();
    await page.waitForSelector('.ge-changes:not([hidden]) button[data-action="accept"]', { timeout: 8000 }).then(() => page.evaluate(() => document.querySelector('.ge-changes button[data-action="accept"]').click())).catch(() => {});
    await page.waitForFunction(() => !document.querySelector(".ge-changes:not([hidden])"), { timeout: 5000 }).catch(() => {});
  }
  // FUZZ_TRACE=1: every commit and its answer, with the file after it, between the operations.
  const trace = [];
  if (process.env.FUZZ_TRACE) {
    const brief = (value) => JSON.stringify(value ?? null).replace(/"(blockId|hash|openHash)":"\w+",?/g, "");
    page.on("response", async (response) => {
      if (!response.url().includes("/__gallery/edit/commit")) return;
      try {
        const request = JSON.parse(response.request().postData() ?? "{}");
        const answer = await response.json();
        const file = (await t.read()).match(/<\/header>([\s\S]*)<\/main>/)?.[1].replace(/\s+/g, " ").replace(/ data-block-id="(\w+)"/g, "#$1") ?? "";
        trace.push(`  >> texts ${brief(request.texts?.map((entry) => [entry.block, entry.parts]))}\n     units ${brief(request.units)}\n  << ${brief(answer.texts?.filter((entry) => entry.status !== "applied"))} ${brief(answer.units?.filter((entry) => entry.status !== "applied"))}\n     file: ${file}`);
      } catch (error) {
        trace.push(`  (trace: ${error.message})`);
      }
    });
  }
  await page.evaluate(() => document.querySelector("main > p, main section p").focus());
  const combo = async (modifier, key) => {
    await page.keyboard.down(modifier);
    await page.keyboard.press(key);
    await page.keyboard.up(modifier);
  };
  const combo2 = async (modifiers, key) => {
    for (const modifier of modifiers) await page.keyboard.down(modifier);
    await page.keyboard.press(key);
    for (const modifier of [...modifiers].reverse()) await page.keyboard.up(modifier);
  };
  const conflicts = () => page.evaluate(() => document.querySelectorAll(".ge-conflict").length + (document.documentElement.getAttribute("data-ge-save") === "held" ? 1 : 0));
  // The reader's own words, with an Agent writing: each typed once.
  let serial = 0;
  const word = () => agent ? ` q${++serial}x` : pick(WORDS);
  // Back into a text block after a block operation (or a reload): the first one shown, at its end.
  const refocus = () => page.evaluate(() => {
    const host = [...document.querySelectorAll("main [contenteditable='true']")].find((node) => node.getClientRects().length > 0 && !node.closest("header"));
    if (!host) return;
    host.focus();
    const range = document.createRange();
    range.selectNodeContents(host);
    range.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
  // The caret in a text block shown (`parts`: a text part of an instance) picked by `roll`, at its start
  // or its end: whether there was one. In a text part a click puts it there, at the edge of its first or
  // last line of words, as the reader's would (one with no words takes it as the others do).
  const into = async (roll, { parts = false, start = false } = {}) => {
    const at = await page.evaluate((roll, parts, start) => {
      const hosts = [...document.querySelectorAll(parts ? "main [data-doc-component] [contenteditable='true']" : "main [contenteditable='true']")].filter((node) => node.getClientRects().length > 0 && !node.closest("header"));
      const host = hosts[Math.floor(roll * hosts.length)];
      if (!host) return null;
      host.scrollIntoView({ block: "center" });
      const range = document.createRange();
      range.selectNodeContents(host);
      const lines = [...range.getClientRects()].filter((rect) => rect.width > 0);
      const line = start ? lines[0] : lines.at(-1);
      const point = parts && line ? { x: start ? line.left + 1 : line.right - 1, y: line.top + line.height / 2 } : null;
      if (point && document.elementFromPoint(point.x, point.y)?.closest("[contenteditable='true']") === host) return point;
      host.focus();
      range.collapse(start);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      return {};
    }, roll, parts, start);
    if (at?.x !== undefined) await page.mouse.click(at.x, at.y);
    return Boolean(at);
  };
  // Words put in by an input method as Microsoft Pinyin puts them: its letters composed one more at a
  // time, each a key of 229, then the words committed in their place.
  const client = instances ? await page.createCDPSession() : null;
  const key = (type, name, code) => client.send("Input.dispatchKeyEvent", { type, key: name, code: "KeyA", windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
  const compose = async (letters, words) => {
    for (let end = 1; end <= letters.length; end++) {
      await key("rawKeyDown", "Process", 229);
      await client.send("Input.imeSetComposition", { text: letters.slice(0, end), selectionStart: end, selectionEnd: end });
      await key("keyUp", "a", 65);
    }
    await client.send("Input.insertText", { text: words });
  };
  // The block the caret is in dragged by its handle, as many pixels up (negative) or down as `by()` says.
  const dragByHandle = async (by) => {
    const rect = await page.evaluate(() => {
      const host = document.activeElement?.closest?.("[contenteditable='true']");
      if (!host || host.closest("header")) return null;
      host.scrollIntoView({ block: "center" });
      return host.getBoundingClientRect().toJSON();
    });
    if (!rect) return;
    await page.mouse.move(rect.left + 20, rect.top + Math.min(rect.height / 2, 12));
    await t.sleep(150);
    const grip = await page.$(".ge-handle .ge-grip");
    const box = grip && await grip.boundingBox().catch(() => null); // (a grip the page drew anew meanwhile, or took away with a reload of its own: no drag)
    if (box) {
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      const to = y + by();
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y + (to > y ? 6 : -6), { steps: 2 });
      await page.mouse.move(x + 30, to, { steps: 8 });
      await t.sleep(80);
      await page.mouse.up();
      await t.sleep(150);
    }
    await page.keyboard.press("Escape");
    await refocus();
  };
  // A press, or a drag from one point to another, with the real pointer.
  const drag = async ({ from, to }) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    await t.sleep(150);
  };
  // The gestures of the fixtures' components, on an instance shown (none in a tab panel not shown) picked
  // by a roll, and what they are made on picked by others: where the pointer goes, or null where there is
  // nothing to do it on.
  const GESTURES = {
    // A card of the task board to the end of a column, or onto the upper half of another card.
    card: (rolls) => page.evaluate((rolls) => {
      // (Its filter may hide cards: the keys of a Tab from a component's button may have gone there.)
      const hosts = [...document.querySelectorAll('main [data-doc-component="local/kanban"]')].filter((host) => host.getClientRects().length > 0 && host.querySelector(".kanban-board:not([hidden]) .kanban-card:not([hidden])"));
      const host = hosts[Math.floor(rolls[0] * hosts.length)];
      if (!host) return null;
      host.scrollIntoView({ block: "center" });
      const cards = [...host.querySelectorAll(".kanban-card:not([hidden])")];
      const card = cards[Math.floor(rolls[1] * cards.length)];
      const targets = [...host.querySelectorAll(".kanban-column"), ...cards.filter((other) => other !== card)];
      const target = targets[Math.floor(rolls[2] * targets.length)];
      const at = card.getBoundingClientRect();
      const onto = target.getBoundingClientRect();
      return { from: { x: at.left + 24, y: at.top + at.height / 2 }, to: { x: onto.left + 24, y: target.matches(".kanban-column") ? onto.bottom - 6 : onto.top + 4 } };
    }, rolls),
    // A dot of the scorecard pressed.
    dot: (rolls) => page.evaluate((rolls) => {
      const dots = [...document.querySelectorAll('main [data-doc-component="local/scorecard"] .scorecard-dot:not(:disabled)')].filter((dot) => dot.getClientRects().length > 0);
      const dot = dots[Math.floor(rolls[0] * dots.length)];
      if (!dot) return null;
      dot.scrollIntoView({ block: "center" });
      const at = dot.getBoundingClientRect();
      const point = { x: at.left + at.width / 2, y: at.top + at.height / 2 };
      return { from: point, to: point };
    }, rolls),
    // The rows' list: a row dragged onto another, a row's 下移 pressed, or its counter.
    row: (rolls) => page.evaluate((rolls) => {
      const hosts = [...document.querySelectorAll('main [data-doc-component="local/rows"]')].filter((host) => host.getClientRects().length > 0 && host.querySelector(".rows-drawn[data-writes] li"));
      const host = hosts[Math.floor(rolls[0] * hosts.length)];
      if (!host) return null;
      host.scrollIntoView({ block: "center" });
      const rows = [...host.querySelectorAll(".rows-drawn li[data-row]")];
      const middle = (node, left = 8) => {
        const at = node.getBoundingClientRect();
        return { x: left === null ? at.left + at.width / 2 : at.left + left, y: at.top + at.height / 2 };
      };
      const counter = host.querySelector(".rows-count");
      if (rolls[1] < 0.2 && counter) return { from: middle(counter), to: middle(counter) };
      const row = rows[Math.floor(rolls[2] * rows.length)];
      if (!row) return null;
      if (rolls[1] < 0.5) return { from: middle(row.querySelector(".rows-down"), null), to: middle(row.querySelector(".rows-down"), null) };
      return { from: middle(row), to: middle(rows[Math.floor(rolls[3] * rows.length)]) };
    }, rolls),
  };
  // The Agent's writes: one of the file's paragraphs (outside the header) reworded, deleted, or with
  // one of its own after it; or an export's: every block that has none given an id (addBlockIds),
  // which a page whose commits name blocks by what they said when it opened must not notice.
  const agentRemoved = new Set(); // the reader's words in paragraphs the Agent deleted (with --instances, its own words too)
  // With --instances, what the Agent writes carries words of its own (a1y, a2y…), each written once.
  const agentWords = new Set();
  const agentWord = () => {
    const each = `a${agentWords.size + 1}y`;
    agentWords.add(each);
    return each;
  };
  const agentDeleted = new Set(); // the ids of the instances it deleted
  // With --instances, the file as the Agent read it after each step since its last write and the page's
  // last showing (the newest last, at most READS of them), which it may write back whole (agentStale).
  const READS = 6;
  let readSince = [];
  const removed = (markup) => { for (const each of markup.match(/q\d+x|a\d+y/g) ?? []) agentRemoved.add(each); }; // the Agent's choice
  // What the page has shown (with --instances, after each step): the Agent's words (`seen`), and of those
  // it showed and shows no more, the step that took them off and whether the page was shown again in it
  // (`offPage`); and the ids of its blocks since it was last opened (`shownIds`).
  const seen = new Set();
  const offPage = new Map();
  const shownIds = new Set();
  let showing = new Set();
  const noteShown = async (op, reloaded) => {
    const now = await page.evaluate(() => ({ text: document.querySelector("main")?.textContent ?? null, ids: [...document.querySelectorAll("main [data-block-id]")].map((node) => node.getAttribute("data-block-id")) })).catch(() => null);
    if (now?.text == null) return; // the page going away: what it shows is read after the next step
    const words = new Set(agentWordsIn(now.text));
    for (const each of showing) if (!words.has(each)) offPage.set(each, { op, reloaded });
    for (const each of words) {
      seen.add(each);
      offPage.delete(each);
    }
    showing = words;
    for (const id of now.ids) shownIds.add(id);
  };
  // What the reader chose on a conflict's card: their own words it gave up (保留 Agent 的, 用文件里的…) and
  // the blocks whose change it gave up, by id, which the page shows as they were until it is shown
  // again; and the Agent's words it wrote over (仍然…, 保留我的, 恢复我的): what the file held of the block
  // it was about, and what the card showed of it (that of a block the reader deleted, which is off the
  // page, but was shown since the page was last opened). The button pressed with the pointer, as the
  // reader's would be; one something stands over is no press of theirs.
  const givenUp = new Set();
  const givenUpBlocks = new Set();
  const forced = new Set();
  const answer = async () => {
    const file = await t.read();
    const chosen = await page.evaluate((rolls) => {
      const cards = [...document.querySelectorAll(".ge-conflict")];
      const card = cards[Math.floor(rolls[0] * cards.length)];
      const choices = card ? [...card.querySelectorAll(".ge-actions > button")].filter((node) => !node.disabled && !node.textContent.startsWith("复制")) : [];
      const choice = choices[Math.floor(rolls[1] * choices.length)];
      if (!choice) return null;
      choice.scrollIntoView({ block: "center" });
      const at = choice.getBoundingClientRect();
      const point = { x: at.left + at.width / 2, y: at.top + at.height / 2 };
      if (!choice.contains(document.elementFromPoint(point.x, point.y))) return null;
      window.__flaggedBefore = [...document.querySelectorAll('[data-ge-flag="conflict"]')];
      const flagged = window.__flaggedBefore.map((node) => ({ words: node.textContent, id: node.closest("[data-block-id]")?.getAttribute("data-block-id") ?? null }));
      const shown = [...document.querySelectorAll("main [data-block-id]")].map((node) => node.getAttribute("data-block-id"));
      return { label: choice.textContent, flagged, card: card.textContent, shown, point };
    }, [random(), random()]);
    if (!chosen) return;
    await page.mouse.click(chosen.point.x, chosen.point.y);
    trace.push(`     chose ${chosen.label}`);
    await t.sleep(500);
    // The blocks its card was about: those no longer flagged (all of them, where the page was shown again).
    const done = await page.evaluate(() => window.__flaggedBefore?.map((node) => !node.isConnected || node.getAttribute("data-ge-flag") !== "conflict") ?? null).catch(() => null);
    const about = chosen.flagged.filter((each, index) => !done || done[index]);
    if (/^(仍然|保留我的|恢复我的)/.test(chosen.label)) {
      const { units } = findUnits(file);
      for (const each of agentWordsIn(chosen.card)) forced.add(each);
      // 仍然删除: of a block the reader deleted, which is off the page, what the file held.
      const deleted = chosen.label === "仍然删除" ? units.filter((unit) => unit.blockId && shownIds.has(unit.blockId) && !chosen.shown.includes(unit.blockId)).map((unit) => unit.blockId) : [];
      for (const id of [...about.map((each) => each.id), ...deleted]) {
        const unit = id && units.find((each) => each.blockId === id);
        if (unit) for (const each of agentWordsIn(file.slice(unit.start, unit.end))) forced.add(each);
      }
    } else if (/^(保留 Agent 的|用文件里的|接受|撤销这一块|保留它)/.test(chosen.label)) {
      for (const each of chosen.card.match(/q\d+x/g) ?? []) givenUp.add(each);
      for (const { words, id } of about) {
        for (const each of words.match(/q\d+x/g) ?? []) givenUp.add(each);
        if (id) givenUpBlocks.add(id);
      }
    }
  };
  // The commits on their way, sent and not answered (`open`), and how many were sent. With --instances,
  // where what the Agent writes is held to be in the file, half of its writes wait until none is on its
  // way and half land whenever they come, while the server works on one too: it looks at the file again
  // right before it writes a commit and makes the commit again on what it finds, but that look is a
  // check, not a lock (writeAtomic in src/shared/files.mjs), and a write landing between it and the
  // rename is lost, which no page could know of. The Agent's words of a write made while a commit was on
  // its way (`raced`, by commit) are lost there when that commit's answer says the server wrote over the
  // version the page knew (`foreign` false: it saw no write but the page's) and the file right after
  // lacks them, nothing having been sent since (`gapLost`, said, not counted).
  let onTheirWay = 0;
  let sent = 0;
  const open = new Set();
  const raced = new Map();
  const gapLost = new Set();
  const answered = []; // what each such answer was found to say, awaited before the end
  let writing = null; // the Agent's words of the write landing now
  const isCommit = (request) => request.method() === "POST" && request.url().includes("/__gallery/edit/commit");
  const race = (request, words) => raced.set(request, [...(raced.get(request) ?? []), ...words]);
  const gapOf = async (request, words, since) => {
    try {
      const asked = JSON.parse(request.postData() ?? "{}");
      const answer = await request.response()?.json();
      if (typeof asked.known !== "string" || answer?.wrote !== true || answer.foreign !== false) return;
      let file = "";
      for (let tries = 0; tries < 10 && !/<\/html>\s*$/.test(file); tries++) file = await t.read().catch(() => ""); // whole, not read while the Agent writes it
      if (sent !== since) return;
      const there = new Set(agentWordsIn(file));
      const lost = words.filter((each) => !there.has(each));
      for (const each of lost) gapLost.add(each);
      if (lost.length > 0) notes.push(`${lost.join(" ")} lost in the server's documented gap (writeAtomic, src/shared/files.mjs): written while a commit was on its way that wrote over the version the page knew`);
    } catch {}
  };
  // The versions of the file the server answered a commit or a revert check about, or the Agent wrote
  // (agentEdit): what the file was before a write of the Agent's, to tell a revert check asked of that
  // write from one asked before it (askedOf).
  const versionsSeen = new Set();
  page.on("response", async (response) => {
    if (!/\/__gallery\/edit\/(commit|reverted)/.test(response.url())) return;
    const answer = await response.json().catch(() => null);
    if (typeof answer?.version === "string") versionsSeen.add(answer.version);
  });
  page.on("request", (request) => {
    if (!isCommit(request)) return;
    onTheirWay++;
    sent++;
    open.add(request);
    if (writing) race(request, writing);
  });
  page.on("requestfailed", (request) => {
    if (!isCommit(request)) return;
    onTheirWay--;
    open.delete(request);
    raced.delete(request);
  });
  page.on("requestfinished", (request) => {
    if (!isCommit(request)) return;
    onTheirWay--;
    open.delete(request);
    if (raced.has(request)) answered.push(gapOf(request, raced.get(request), sent));
    raced.delete(request);
  });
  // The Agent's write of the file (`change` maps its text to the new text); with FUZZ_TRACE, what it
  // changed in the trace, what stays before and after it left out.
  const agentEdit = async (change) => {
    const waits = instances && random() < 0.5;
    for (const until = Date.now() + 5000; waits && onTheirWay > 0 && Date.now() < until;) await t.sleep(20);
    try {
      await t.agentEdit((text) => {
        const next = change(text);
        if (process.env.FUZZ_TRACE) {
          let start = 0;
          while (start < text.length && text[start] === next[start]) start++;
          let end = 0;
          while (end < text.length - start && end < next.length - start && text.at(-1 - end) === next.at(-1 - end)) end++;
          trace.push(`     agent${onTheirWay > 0 ? " (a commit on its way)" : ""}: ${JSON.stringify(text.slice(start, text.length - end)).slice(0, 400)} -> ${JSON.stringify(next.slice(start, next.length - end)).slice(0, 400)}`);
        }
        if (instances) {
          const had = new Set(agentWordsIn(text));
          writing = agentWordsIn(next).filter((each) => !had.has(each));
          for (const request of open) race(request, writing);
        }
        versionsSeen.add(versionOf(text));
        versionsSeen.add(versionOf(next));
        return next;
      });
    } finally {
      writing = null;
      readSince = [];
    }
  };
  // The file's paragraphs of words alone, outside the header and any instance: what the Agent's writes
  // change.
  const paragraphsIn = (text) => {
    const own = findUnits(text).units.filter((unit) => unit.kind === "installed");
    return [...text.matchAll(/\n[ \t]*<p\b[^>]*>([^<]*)<\/p>/g)].filter((hit) => !hit[0].includes("doc-title") && !own.some((unit) => unit.start <= hit.index && hit.index < unit.end));
  };
  // The page's revert check (POST /__gallery/edit/reverted) answered about the file as a write of the
  // Agent's left it or as it is later, its version none of `known()` (those the file had before it; null
  // until it is written, what answers before being about the file before), or null after KEPT_WITHIN (a
  // page with nothing of its own to ask of asks nothing). Not any answer: one to a check the page asked a
  // moment before the write, about the file before it, comes after the write too (a commit's answer
  // saying someone wrote first asks one at once), and the page, hearing of the write a moment later
  // (QUIET), asks again then; nor within a fixed time, as it once was (3 s, which a busy machine overran:
  // the page saved, the write not yet told it, fuzz seed 4102 under load).
  const askedOf = (known) => new Promise((resolve) => {
    const done = (answer) => {
      clearTimeout(timer);
      page.off("response", heard);
      resolve(answer);
    };
    const heard = async (response) => {
      if (!response.url().includes("/__gallery/edit/reverted")) return;
      const answer = await response.json().catch(() => null);
      if (answer?.ok && typeof answer.version === "string" && known() && !known().has(answer.version)) done(answer);
    };
    const timer = setTimeout(() => done(null), KEPT_WITHIN);
    page.on("response", heard);
  });
  // With --instances, the Agent writes back the whole file as it read it a few steps earlier (one of
  // readSince but the newest), with a paragraph of its own after one of its paragraphs (an Agent writes
  // back what it read with its change, never byte for byte a version the page wrote a moment ago, which
  // the page takes for its own write announced late): what the reader saved since goes from the file,
  // what they deleted comes back, and the page, hearing of it, asks what that put back of its own (POST
  // /__gallery/edit/reverted), whose answer about that write is waited for (askedOf), so that what holds
  // it for the reader stands before the rules are held to it (which look again a while for what they do
  // not find held yet: lookAgain). Nothing read that long ago: the paragraph added to the file as it is.
  const agentStale = async (roll) => {
    const earlier = readSince.slice(0, -1);
    const read = earlier.length > 0 ? earlier[Math.floor(roll * earlier.length)] : null;
    let before = null;
    const asked = read !== null ? askedOf(() => before) : null;
    await agentEdit((text) => {
      before = new Set([...versionsSeen, versionOf(text)]);
      const written = read ?? text;
      const found = paragraphsIn(written);
      if (found.length === 0) return `${written}\n`;
      const hit = found[Math.floor(random() * found.length)];
      const end = hit.index + hit[0].length;
      return `${written.slice(0, end)}\n    <p>AI 加的段落 ${agentWord()}。</p>${written.slice(end)}`;
    });
    if (read !== null) {
      await asked;
      await t.sleep(150);
    }
  };
  const agentWrite = async (roll) => {
    await agentEdit((text) => {
      const found = paragraphsIn(text);
      if (found.length === 0) return `${text}\n`; // nothing to change: a write all the same
      const hit = found[Math.floor(random() * found.length)];
      if (roll >= 0.9) {
        const { text: ided } = addBlockIds(text);
        return ided === text ? `${text}\n` : ided;
      }
      const mark = () => (instances ? ` ${agentWord()}` : "");
      // With --changes, a paragraph reworded loses words of the Agent's own where it has some (shown taken out), none of the reader's.
      const reword = (markup) => {
        if (changes) {
          if (markup.includes("（AI 改")) return markup.replace("（AI 改", "（AI 修订");
          if (markup.includes("AI 加的段落")) return markup.replace("AI 加的段落", "AI 段落");
        }
        return markup.replace(/<\/p>$/, `（AI 改${mark()}）</p>`);
      };
      const next = roll < 0.4 ? reword(hit[0]) : roll < 0.7 ? "" : `${hit[0]}\n    <p>AI 加的段落${mark()}。</p>`;
      if (next === "") removed(hit[0]);
      return text.slice(0, hit.index) + next + text.slice(hit.index + hit[0].length);
    });
  };
  // The file's items of a list of words alone (outside any instance), each with whether another item of its list
  // stands right before or after it (`others`: one that may go without leaving its list empty).
  const itemsIn = (text) => {
    const own = findUnits(text).units.filter((unit) => unit.kind === "installed");
    return [...text.matchAll(/<li\b[^>]*>([^<]*)<\/li>/g)].filter((hit) => !own.some((unit) => unit.start <= hit.index && hit.index < unit.end)).map((hit) => {
      hit.others = /<\/li>\s*$/.test(text.slice(0, hit.index)) || /^\s*<li\b/.test(text.slice(hit.index + hit[0].length));
      return hit;
    });
  };
  // --words: one to three paragraphs or items given words of the Agent's, at their end or their start.
  const agentReword = async (roll) => {
    await agentEdit((text) => {
      const found = [...paragraphsIn(text), ...itemsIn(text)].sort((a, b) => b.index - a.index);
      if (found.length === 0) return `${text}\n`;
      const chosen = new Set();
      for (let count = 1 + Math.floor(roll * 3); count > 0; count--) chosen.add(found[Math.floor(random() * found.length)]);
      let next = text;
      for (const hit of found.filter((each) => chosen.has(each))) { // from the end, so that each index still holds
        const markup = random() < 0.5 ? hit[0].replace(/<\/(p|li)>$/, "（AI 改）</$1>") : hit[0].replace(/(<(?:p|li)\b[^>]*>)/, "$1AI 补：");
        next = next.slice(0, hit.index) + markup + next.slice(hit.index + hit[0].length);
      }
      return next;
    });
  };
  // --structure: paragraphs and items put in, taken out, moved; now and then two at once.
  const agentStructure = async (roll) => {
    await agentEdit((text) => {
      const once = (text, roll) => {
        const paragraphs = paragraphsIn(text);
        const items = itemsIn(text);
        const at = (list) => list[Math.floor(random() * list.length)];
        const cut = (hit) => text.slice(0, hit.index) + text.slice(hit.index + hit[0].length);
        if (roll < 0.2 || paragraphs.length === 0) { // a paragraph put in, after one or at the end
          const hit = paragraphs.length > 0 ? at(paragraphs) : null;
          const end = hit ? hit.index + hit[0].length : text.lastIndexOf("</main>");
          return `${text.slice(0, end)}\n    <p>AI 加的段落。</p>${text.slice(end)}`;
        }
        if (roll < 0.4) { // a paragraph taken out
          const hit = at(paragraphs);
          removed(hit[0]);
          return cut(hit);
        }
        if (roll < 0.6) { // a paragraph moved after another, or to the end
          const hit = at(paragraphs);
          const rest = cut(hit);
          const others = paragraphsIn(rest);
          const after = others.length > 0 && random() < 0.7 ? at(others) : null;
          const end = after ? after.index + after[0].length : rest.lastIndexOf("</main>");
          return rest.slice(0, end) + hit[0] + rest.slice(end);
        }
        if (items.length === 0) return `${text}\n`;
        const item = at(items);
        if (roll < 0.75) { // an item put in after one
          const end = item.index + item[0].length;
          return `${text.slice(0, end)}<li>AI 加的条目</li>${text.slice(end)}`;
        }
        if (!item.others) return `${text}\n`; // the last of its list stays
        if (roll < 0.87) { // an item taken out
          removed(item[0]);
          return cut(item);
        }
        const rest = cut(item); // an item moved after another
        const others = itemsIn(rest);
        if (others.length === 0) return `${text}\n`;
        const after = at(others);
        const end = after.index + after[0].length;
        return rest.slice(0, end) + item[0] + rest.slice(end);
      };
      const first = once(text, roll);
      const next = random() < 0.2 ? once(first, random()) : first;
      return next === text ? `${text}\n` : next; // a paragraph moved where it stood: a write all the same
    });
  };
  // With --instances, the Agent writes an instance of the file's: words of its own in a part of its data
  // (a row's first cell, or one more row, of a table; a name in a script of data) or in a text part, or
  // it deletes the instance, or moves it after another block of the page's flow.
  const agentInstanceWrite = async (roll) => {
    await agentEdit((text) => {
      const { units, boxes } = findUnits(text);
      const own = units.filter((unit) => unit.kind === "installed");
      if (own.length === 0) return `${text}\n`;
      const unit = own[Math.floor(random() * own.length)];
      const markup = text.slice(unit.start, unit.end);
      const line = text.lastIndexOf("\n", unit.start);
      const [before, after] = [text.slice(0, line), text.slice(unit.end)];
      const within = (pattern, change) => {
        const hits = [...markup.matchAll(pattern)];
        const hit = hits[Math.floor(random() * hits.length)];
        return hit ? text.slice(0, unit.start) + markup.slice(0, hit.index) + change(hit) + markup.slice(hit.index + hit[0].length) + after : `${text}\n`;
      };
      if (roll < 0.4) {
        if (markup.includes("<tbody>") && random() < 0.3) return within(/<\/tbody>/g, () => `<tr><td>${agentWord()}</td>${markup.includes("<th>状态</th>") ? "<td>待办</td><td></td>" : ""}</tr></tbody>`);
        return within(/<tr><td>([^<]*)<\/td>|"name": ?"([^"]*)"/g, (hit) => hit[0].replace(/(<\/td>|"$)/, ` ${agentWord()}$1`));
      }
      if (roll < 0.65) return within(/<(h3|p)\b[^>]*>([\s\S]*?)<\/\1>/g, (hit) => hit[0].replace(/<\/(h3|p)>$/, ` ${agentWord()}$&`));
      if (roll < 0.85) {
        removed(markup);
        agentDeleted.add(unit.blockId);
        return before + after;
      }
      const flow = new Set(boxes.filter((box) => box.kind === "main" || box.kind === "section").map((box) => box.id));
      const places = units.filter((other) => other !== unit && flow.has(other.box) && (other.end <= line || other.start >= unit.end));
      const place = places[Math.floor(random() * places.length)];
      if (!place) return `${text}\n`;
      const indent = /[ \t]*$/.exec(text.slice(0, place.start))[0];
      const moved = (head, at) => head.slice(0, at) + `\n${indent}${markup}` + head.slice(at);
      const next = place.end <= line ? moved(before, place.end) + after : before + moved(after, place.end - unit.end);
      return next === text ? `${text}\n` : next; // after the block it follows: a write all the same
    });
  };
  const ops = [];
  let problem = null;
  // The page going away in the middle (a reload, a link followed) is a finding, not a crash.
  const left = [];
  let reloads = 0;
  // The writes the page took in where it stood (its pull: data-ge-pulls), 0 on a page that is going; those of the
  // pages before the one shown now (`pullsTaken`), and the count the one shown now had at the last step (said in
  // the seed's line with the reloads, so that a run says how much of it the pull took).
  let pullsTaken = 0;
  let pullsShown = 0;
  const pullsOf = () => page.evaluate(() => Number(document.documentElement.getAttribute("data-ge-pulls") ?? 0)).catch(() => 0);
  // With the pull on, the page that took writes in where it stood is what a load of the file shows: once it is
  // saved and shows all the file has (data-ge-behind gone; held for the reader, or behind still after a while:
  // nothing to compare), its text blocks read as those of the document opened anew in a page beside it, the
  // file the same before and after (an Agent's write meanwhile: nothing to compare).
  const sameAsLoaded = async () => {
    if ((await pullsOf()) === 0) return null;
    const ready = await page.waitForFunction(() => document.documentElement.getAttribute("data-ge-save") === "saved" && !document.documentElement.hasAttribute("data-ge-behind"), { timeout: 20000 }).then(() => true, () => false);
    if (!ready) return null;
    // A code block's code is left out: a load leaves it to the code component unmarked (the kit draws its lines), where a
    // block made on the page is marked (fuzz --more --agent seed 8102: an empty code block made by the reader).
    const blocks = () => [...document.querySelectorAll("main [data-ge-block]:not([data-ge-new]):not(code)")].map((node) => `${node.localName}:${node.textContent.replace(/[\s\u00a0\u200b]+/g, " ").trim()}`).join(" | "); // spaces as the file has them (a typed one the page holds as a no-break space)
    const before = await t.read();
    const other = await page.browserContext().newPage();
    try {
      await other.goto(t.url(), { waitUntil: "load" });
      await other.waitForSelector("html[data-ge-editing][data-ge-save]", { timeout: 15000 });
      const loaded = await other.evaluate(blocks);
      if ((await t.read()) !== before) return null;
      // A write the session's last step made the page may not have heard yet (not behind until it does: fuzz seed
      // 7001, the last step the Agent's): read again a while, until it shows it, saved and not behind.
      let shown = await page.evaluate(blocks);
      for (const until = Date.now() + 10000; shown !== loaded && Date.now() < until;) {
        await t.sleep(250);
        shown = await page.evaluate(() => document.documentElement.getAttribute("data-ge-save") === "saved" && !document.documentElement.hasAttribute("data-ge-behind")) ? await page.evaluate(blocks) : shown;
      }
      if ((await t.read()) !== before) return null;
      return shown === loaded ? null : `the page that took writes in where it stood differs from the file opened anew\n    page: ${shown}\n    anew: ${loaded}`;
    } finally {
      await other.close().catch(() => {});
    }
  };
  const leaving = (frame) => {
    if (frame !== page.mainFrame()) return;
    // With an Agent writing, the page shows the file by reloading once nothing waits: what it gave
    // up then shows as the file has it.
    if (agent && frame.url().startsWith(t.url())) {
      reloads++;
      givenUpBlocks.clear();
      shownIds.clear();
      readSince = [];
    } else left.push(`${frame.url()} (focus was on ${focused})`);
  };
  let focused = "";
  page.on("framenavigated", leaving);
  // With an Agent writing, what the page shows of the reader's words, what it holds for them (blocks
  // flagged, a conflict, a block with no place; conflict cards; rows of columns made on the page, not
  // written while a column is empty), and what is listed (what a page could not put back).
  const read = () => page.evaluate(() => {
    const lost = (() => {
      try {
        return Object.keys(localStorage).filter((key) => key.endsWith(":lost")).map((key) => localStorage.getItem(key)).join(" ");
      } catch {
        return "";
      }
    })();
    return {
      // The words of each block apart (a space where the text goes into another block): a word Enter split in
      // two blocks is two words on the page as in the file (seed 8004 once read "q14x q" and "15x" as q15x).
      shown: (() => {
        const blockOf = (node) => node.parentElement?.closest("p, li, h1, h2, h3, h4, h5, h6, td, th, pre, blockquote, figcaption, summary, dt, dd, div, section") ?? null;
        const walker = document.createTreeWalker(document.querySelector("main"), NodeFilter.SHOW_TEXT);
        let text = "";
        let last;
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const block = blockOf(node);
          if (last !== undefined && block !== last) text += " ";
          text += node.data;
          last = block;
        }
        return text;
      })(),
      held: [
        ...document.querySelectorAll("[data-ge-flag], .ge-conflict, .doc-columns[data-ge-new]"),
        // New paragraphs or items next to a flagged block: written with it (split off it), held with it.
        ...[...document.querySelectorAll("[data-ge-flag]")].flatMap((node) => {
          const parts = [];
          for (const step of ["previousElementSibling", "nextElementSibling"]) {
            for (let at = node[step]; at?.matches("[data-ge-new]:not([data-ge-unit])") && /^(P|LI)$/.test(at.tagName); at = at[step]) parts.push(at);
          }
          return parts;
        }),
        ...[...document.querySelectorAll("main li")].filter((item) => item.querySelector("li") && ![...item.childNodes].some((child) => !/^(UL|OL)$/.test(child.tagName ?? "") && child.textContent.trim())),
      ].map((node) => node.textContent).join(" "),
      listed: lost,
    };
  });
  const words = (text) => text.match(/q\d+x/g) ?? [];
  // The reader's words the page shows in neither the file (`file`), a block held for them nor the list
  // (`texts`, read()'s), but those in a paragraph the Agent deleted and those given up by a choice.
  const missingFrom = (file, texts) => {
    const kept = new Set([...words(file), ...words(texts.held), ...words(texts.listed)]);
    return words(texts.shown).filter((each) => !kept.has(each) && !agentRemoved.has(each) && !givenUp.has(each));
  };
  // What components wrote that the file does not hold as the page does (writtenApart), but on an
  // instance given up since the page was last shown and one the Agent deleted.
  const apartFrom = async (file) => (await page.evaluate(writtenApart, file)).filter(({ id, gone }) => !givenUpBlocks.has(id) && !(gone && agentDeleted.has(id)));
  // The reader's words `missing` looked for again, every quarter second for KEPT_WITHIN, until each is in
  // the file, a block held for them or the list (`shown`: or on the page, as a page shown again shows the
  // file), and, with `apart`, until what components wrote is in the file as on the page: an Agent's write
  // is told the page a moment after it (QUIET), and the page asks what it put back before it holds it
  // (askedOf), so a look right after it finds the page saved on what it had; slower on a busy machine.
  // The words never found by then, and what components wrote that still differs: { missing, apart }.
  const lookAgain = async (missing, { shown = false, apart = false } = {}) => {
    let differ = [];
    for (const until = Date.now() + KEPT_WITHIN; ;) {
      try {
        const file = await t.read();
        const texts = await read();
        const kept = new Set([...words(file), ...words(texts.held), ...words(texts.listed), ...(shown ? words(texts.shown) : [])]);
        missing = missing.filter((each) => !kept.has(each) && !agentRemoved.has(each) && !givenUp.has(each));
        differ = apart ? await apartFrom(file) : [];
        if ((missing.length === 0 && differ.length === 0) || Date.now() > until) return { missing, apart: differ };
      } catch (error) { // the page going away or not drawn yet (a reload): looked at again
        if (!/context was destroyed|Cannot find context|does not belong to the document|navigat|detached|Target closed|reading 'textContent'/i.test(error.message)) throw error;
        if (Date.now() > until) return { missing, apart: differ };
      }
      await t.sleep(250);
    }
  };
  // The reader's words each page showed as it went to show the file again by itself (its data-ge-save
  // turning to "reloading"): the page shown again shows them, holds them or lists them (lookAgain), as
  // a page reloads only once all it shows is in the file and an Agent's write landing after its last
  // question of what that put back is asked of by the page it shows (autosave opened()). A page shown
  // again takes these words off the page, where the rules on what it shows no longer see them.
  const goingAway = [];
  if (agent) {
    await page.exposeFunction("__fuzzReloading", (text) => goingAway.push(text));
    const watchReload = () => new MutationObserver(() => {
      if (document.documentElement?.getAttribute("data-ge-save") === "reloading") window.__fuzzReloading?.(document.querySelector("main")?.textContent ?? "");
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-ge-save"] });
    await page.evaluateOnNewDocument(watchReload);
    await page.evaluate(watchReload);
  }
  const keptAfterReload = async (step) => {
    if (goingAway.length === 0) return null;
    const missing = [...new Set(goingAway.splice(0).flatMap(words))];
    const { missing: lost } = await lookAgain(missing, { shown: true });
    return lost.length > 0 ? `words the page showed as it went to show the file again by itself, after step ${step}, in neither the file, the page shown again, a conflict, nor the list: ${lost.join(" ")}` : null;
  };
  // With an Agent writing, after a step that leaves the page saved with nothing on its way (from there
  // it shows the file again by itself, putting the file's in place of anything it took and never sent):
  // every word of the reader's it shows is in the file, held or listed, and with --instances what
  // components wrote is in the file as on the page. Nothing is said when the page moved on meanwhile (a
  // commit sent, the page shown again, its state another), or went away.
  const savedApart = async (step) => {
    const saved = () => page.evaluate(() => document.documentElement.getAttribute("data-ge-save") === "saved");
    const [sentBefore, reloadsBefore] = [sent, reloads];
    try {
      if (onTheirWay > 0 || !(await saved())) return null;
      const file = await t.read();
      const texts = await read();
      let apart = instances ? await apartFrom(file) : [];
      if (onTheirWay > 0 || sent !== sentBefore || reloads !== reloadsBefore || !(await saved())) return null;
      let missing = missingFrom(file, texts);
      if (missing.length > 0 || apart.length > 0) ({ missing, apart } = await lookAgain(missing, { apart: instances }));
      if (missing.length > 0) return `saved after step ${step}, words on the page in neither the file, a conflict, nor the list, ${KEPT_WITHIN / 1000} s on: ${missing.join(" ")}`;
      if (apart.length > 0) return `saved after step ${step}, what components wrote differs on the page and in the file, ${KEPT_WITHIN / 1000} s on: ${JSON.stringify(apart).slice(0, 1500)}`;
    } catch (error) {
      if (!/context was destroyed|Cannot find context|does not belong to the document|navigat|detached|Target closed/i.test(error.message)) throw error;
    }
    return null;
  };
  // With an Agent writing: saved, or holding conflicts for the reader, and the page shown again if it
  // was to show the file (as it does once nothing waits), so that what it shows is what it holds.
  const quiet = async () => {
    for (let tries = 0; ; tries++) {
      const before = reloads;
      await page.waitForFunction(() => ["saved", "held"].includes(document.documentElement.getAttribute("data-ge-save")), { timeout: 20000 });
      if (!instances) return;
      await t.sleep(1500);
      if (reloads === before || tries === 3) return;
      await t.ready();
    }
  };
  // One operation, then the rules.
  const one = async (step) => {
      focused = await page.evaluate(() => {
        const node = document.activeElement;
        return node ? `${node.localName}${node.className ? `.${String(node.className).split(" ")[0]}` : ""}${node.getAttribute("contenteditable") ? "[editable]" : ""}` : "nothing";
      });
      const roll = random();
      // With --more, a step in four is a block operation; with --agent, one in twelve the Agent's (with
      // --instances, two in five of those an instance's, three in ten a file it read earlier written back).
      const extra = more || agent ? random() : 1; // without them, the very steps of before
      // With --instances, a step in three is one on an instance, and a word in three typed by an input method.
      const own = instances ? random() : 1;
      // With --words or --structure, a step in four the Agent's (a roll of its own: the block operations keep theirs), and
      // one in twelve of the reader's an answer to a card (where there is one: a paragraph without an id the Agent moved
      // while the reader typed in it is a card, which held would hold every later write back).
      const theirs = agent && (writes !== "mixed" ? random() < 0.25 : extra < (instances ? 0.12 : 0.08));
      const answers = agent && !theirs && writes !== "mixed" && random() < 1 / 12;
      const which = theirs && instances ? random() : 1;
      const op = answers ? "answer" : theirs ? `agent ${which < 0.4 ? "instance " : which < 0.7 ? "stale " : ""}${random().toFixed(3)}`
        : own < 0.33 ? pick([`insert ${pick(WRITERS).name}`, "part", "part", "card", "card", "dot", "dot", "row", "row", "instance up", "instance down", "instance delete", "instance copy", "instance drag", "undo", "redo", ...(agent ? ["answer", "answer"] : [])])
        : more && extra < 0.25 ? pick(["# ", "> ", "1. ", "select Delete", "select up", "select down", "code", "divider", "paste", "menu 在下方新建分区", "menu 解散分区", "menu type", "menu 分栏", "group type", "drag up", "drag down"])
          : roll < 0.30 ? `${instances && random() < 1 / 3 ? "ime" : "type"} ${word()}` : roll < 0.42 ? "Enter" : roll < 0.52 ? "Backspace" : roll < 0.58 ? "Home Backspace"
            : roll < 0.66 ? "Tab" : roll < 0.72 ? "Shift+Tab" : roll < 0.76 ? "list" : roll < 0.82 ? pick(["ArrowUp", "ArrowDown", "End", "Home"])
              : roll < 0.86 ? pick(["undo", "redo"]) : roll < 0.95 ? "save" : "pause";
      ops.push(op);
      trace.push(`${step}. ${op}`);
      const reloadsBefore = reloads;
      const pullsBefore = agent ? await pullsOf() : 0;
      if (pullsBefore < pullsShown) pullsTaken += pullsShown; // a page shown anew counts from none
      pullsShown = pullsBefore;
      if (op.startsWith("type ")) await page.keyboard.type(op.slice(5));
      else if (op.startsWith("ime ")) await compose(LETTERS[op.slice(4)] ?? op.slice(4).replace(/\s/g, ""), op.slice(4));
      else if (op.startsWith("agent instance ")) await agentInstanceWrite(Number(op.slice(15)));
      else if (op.startsWith("agent stale ")) await agentStale(Number(op.slice(12)));
      else if (op.startsWith("agent ") && writes === "words") await agentReword(Number(op.slice(6)));
      else if (op.startsWith("agent ") && writes === "structure") await agentStructure(Number(op.slice(6)));
      else if (op.startsWith("agent ")) await agentWrite(Number(op.slice(6)));
      else if (op === "answer") await answer();
      else if (op.startsWith("insert ")) {
        // A block of a package by "/" and its name (typed, or by the input method), in a new paragraph
        // or below the block the caret is in.
        const { name, letters } = WRITERS.find((writer) => writer.name === op.slice(7));
        if (!(await page.evaluate(() => document.activeElement?.matches("main [contenteditable='true']")))) await refocus();
        await page.keyboard.press(random() < 0.5 ? "Enter" : "End");
        await page.keyboard.type("/");
        if (random() < 0.3) await compose(letters, name);
        else await page.keyboard.type(name);
        await t.sleep(200);
        await page.keyboard.press("Enter");
        await t.sleep(300);
      } else if (op === "part") await into(random(), { parts: true, start: random() < 0.3 });
      else if (op in GESTURES) {
        // The component's own gesture, with the real pointer; the focus left where it put it, or back in a text block.
        const gesture = await GESTURES[op]([random(), random(), random(), random()]);
        if (gesture) await drag(gesture);
        if (random() < 0.5) await refocus();
      } else if (op.startsWith("instance ")) {
        // An instance selected (Esc from a text part of it), then deleted, moved by Ctrl+Shift+↑/↓, or
        // copied (Ctrl+C) and pasted (Ctrl+V) where the caret goes, when the copy put anything on the
        // clipboard (the types the page gave it, read after its own handler); or dragged by its handle.
        if (await into(random(), { parts: true })) {
          if (op === "instance drag") await dragByHandle(() => (random() < 0.5 ? -1 : 1) * (60 + Math.floor(random() * 160)));
          else {
            await page.keyboard.press("Escape");
            await t.sleep(60);
            let copied = false;
            if (op === "instance copy") {
              await page.evaluate(() => {
                window.__fuzzCopied = [];
                document.addEventListener("copy", (event) => { window.__fuzzCopied = [...(event.clipboardData?.types ?? [])]; }, { capture: true, once: true });
              });
              await combo("Control", "c");
              copied = await page.evaluate(() => window.__fuzzCopied.length > 0);
            }
            if (op === "instance delete") await page.keyboard.press("Delete");
            else if (op !== "instance copy") await combo2(["Control", "Shift"], op === "instance up" ? "ArrowUp" : "ArrowDown");
            await t.sleep(60);
            await page.keyboard.press("Escape");
            if (copied && await into(random(), { start: random() < 0.2 })) {
              await combo("Control", "v");
              await t.sleep(200);
            } else await refocus();
          }
        }
      }
      else if (op === "# " || op === "> " || op === "1. ") {
        await page.keyboard.press("Home");
        await page.keyboard.type(op);
      } else if (op.startsWith("select ")) {
        await page.keyboard.press("Escape");
        await t.sleep(60);
        if (op === "select Delete") await page.keyboard.press("Delete");
        else await combo2(["Control", "Shift"], op === "select up" ? "ArrowUp" : "ArrowDown");
        await t.sleep(60);
        await page.keyboard.press("Escape");
        await refocus();
      } else if (op === "code" || op === "divider") {
        // An empty block holding nothing but "```" or "---" becomes a code block or a divider.
        await page.keyboard.press("End");
        await page.keyboard.press("Enter");
        await page.keyboard.type(op === "code" ? "```" : "---");
        await t.sleep(60);
        await refocus();
      } else if (op === "paste") {
        // Two lines pasted where the caret is: the second a block of its own.
        await page.evaluate(() => {
          const data = new DataTransfer();
          data.setData("text/plain", "贴一\n贴二");
          document.activeElement?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
        });
      } else if (op.startsWith("menu ")) {
        // A row of the block menu of the block the caret is in, from its handle (nothing when it
        // has no such row, or it is not on offer).
        const rect = await page.evaluate(() => {
          const host = document.activeElement?.closest?.("[contenteditable='true']");
          if (!host || host.closest("header")) return null;
          host.scrollIntoView({ block: "center" });
          return host.getBoundingClientRect().toJSON();
        });
        if (rect) {
          await page.mouse.move(rect.left + 20, rect.top + Math.min(rect.height / 2, 12));
          await t.sleep(150);
          const grip = await page.$(".ge-handle .ge-grip");
          if (grip) {
            await grip.click().catch(() => {});
            await page.waitForSelector(".ge-pop .ge-pop-row", { visible: true, timeout: 2000 }).catch(() => {});
            // "type": one of the types it can be turned into (the menu's grid), not its own.
            await page.evaluate((label, roll) => {
              if (label === "type") {
                const types = [...document.querySelectorAll(".ge-pop .ge-type")].filter((cell) => cell.getClientRects().length > 0 && cell.getAttribute("aria-current") !== "true" && !cell.disabled);
                types[Math.floor(roll * types.length)]?.click();
              } else [...document.querySelectorAll(".ge-pop-row")].find((row) => row.getClientRects().length > 0 && row.textContent.startsWith(label) && !row.disabled)?.click();
            }, op.slice(5), random());
            await t.sleep(100);
          }
          await page.keyboard.press("Escape");
          await page.keyboard.press("Escape");
          await refocus();
        }
      } else if (op === "group type") {
        // The block the caret is in and the one above or below it selected (Esc, Shift+↑/↓), the menu
        // of the first opened from its handle (theirs, when it is one of them), and one of the types
        // they can all be turned into (nothing when none is on offer).
        await page.keyboard.press("Escape");
        await t.sleep(60);
        await combo("Shift", random() < 0.5 ? "ArrowUp" : "ArrowDown");
        await t.sleep(60);
        const rect = await page.evaluate(() => {
          const first = window.__gallerySelected?.()[0];
          const host = first && (first.matches("[contenteditable='true']") ? first : first.querySelector("[contenteditable='true']"));
          if (!host || host.closest("header")) return null;
          host.scrollIntoView({ block: "center" });
          return host.getBoundingClientRect().toJSON();
        });
        if (rect) {
          await page.mouse.move(rect.left + 20, rect.top + Math.min(rect.height / 2, 12));
          await t.sleep(150);
          const grip = await page.$(".ge-handle .ge-grip");
          if (grip) {
            await grip.click().catch(() => {});
            await page.waitForSelector(".ge-pop .ge-pop-row", { visible: true, timeout: 2000 }).catch(() => {});
            await page.evaluate((roll) => {
              const types = [...document.querySelectorAll(".ge-pop .ge-type")].filter((cell) => cell.getClientRects().length > 0 && cell.getAttribute("aria-current") !== "true" && !cell.disabled);
              types[Math.floor(roll * types.length)]?.click();
            }, random());
            await t.sleep(100);
          }
        }
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        await refocus();
      } else if (op.startsWith("drag ")) {
        // The block the caret is in dragged by its handle, a block's height or two up or down.
        await dragByHandle(() => (op === "drag up" ? -1 : 1) * (40 + Math.floor(random() * 50)));
      } else if (op === "Home Backspace") {
        await page.keyboard.press("Home");
        await page.keyboard.press("Backspace");
      } else if (op === "Shift+Tab") await combo("Shift", "Tab");
      else if (op === "list") {
        await page.keyboard.press("Enter");
        await page.keyboard.type("- ");
      } else if (op === "undo" || op === "redo") await combo("Control", op === "undo" ? "z" : "y");
      else if (op === "save") await combo("Control", "s");
      else if (op === "pause") await t.sleep(2000); // longer than the autosave's wait: a commit goes
      else await page.keyboard.press(op);
      await t.sleep(Math.floor(random() * 120));
      if (reloads > reloadsBefore) { // the page showed the Agent's write: editing again
        await t.ready();
        await refocus();
      }
      // FUZZ_TRACE=2: the page's blocks after each step too (unit number, + for new, ~ for a conversion's stand-in).
      if (process.env.FUZZ_TRACE === "2") {
        // With the pull's count and last outcome, and whether the page is behind the file (data-ge-behind).
        trace.push(`     pull: ${await page.evaluate(() => JSON.stringify({ ...(window.__galleryOverlays?.().pull ?? {}), behind: document.documentElement.hasAttribute("data-ge-behind"), save: document.documentElement.getAttribute("data-ge-save") })).catch(() => "?")}`);
        trace.push(`     page: ${await page.evaluate(() => [...document.querySelectorAll("main [data-ge-unit], main [data-ge-new]")].filter((node) => !node.closest("header")).map((node) => `${node.localName}${node.hasAttribute("data-ge-new") ? "+" : ""}${node.getAttribute("data-ge-unit") ?? ""}${node.getAttribute("data-ge-convert") ? `~${node.getAttribute("data-ge-convert")}` : ""}${node.getAttribute("data-block-id") ? `#${node.getAttribute("data-block-id").slice(0, 4)}` : ""}:${[...node.childNodes].filter((kid) => kid.nodeType === 3).map((kid) => kid.data).join("").trim()}`).join(" "))}`);
      }
      if (agent && instances) {
        await noteShown(op, reloads > reloadsBefore || (await pullsOf()) > pullsBefore); // the file's words in place of what it showed
        readSince = [...readSince, await t.read()].slice(-READS);
      }
      if (!agent && await conflicts()) {
        const cards = await page.evaluate(() => [...document.querySelectorAll(".ge-conflict")].map((node) => node.innerText.replace(/\s+/g, " ").slice(0, 160)).join(" | "));
        problem = `a conflict after step ${step}: ${cards || await t.status()}`;
      }
      const errors = t.takeErrors();
      if (errors.length > 0) problem = `a page error after step ${step}: ${errors.join(" | ")}`;
      if (left.length > 0) problem = `the page went to ${left.join(", ")} after step ${step}`;
      if (agent && !problem) problem = await keptAfterReload(step);
      if (agent && !problem) problem = await savedApart(step);
  };
  // The operations, one after another, until one of the rules breaks. With an Agent writing, the
  // page may be reloading under an operation (it shows the Agent's write): editing again, on with
  // the next.
  const play = async () => {
    for (let step = 0; step < steps && !problem; step++) {
      try {
        await one(step);
      } catch (error) {
        if (!agent || !/context was destroyed|Cannot find context|does not belong to the document|navigat|detached|Target closed/i.test(error.message)) throw error;
        await t.ready();
        await refocus();
      }
    }
  };
  try {
    await play();
  } catch (error) {
    problem = `${left.length > 0 ? `the page went to ${left.join(", ")}` : "the session broke off"} after step ${ops.length - 1}: ${error.message}`;
  } finally {
    page.off("framenavigated", leaving);
  }
  if (problem) {
    const file = (await t.read()).match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1].replace(/\s+/g, " ").trim() ?? "";
    if (trace.some((line) => line.startsWith("  "))) console.log(trace.join("\n"));
    return { problem, ops, file, notes };
  }
  if (agent) {
    // Every word of the reader's the page shows: in the file, in a block held for the reader (a
    // conflict), or listed; and the page settles (saved, or holding conflicts for the reader).
    await combo("Control", "s");
    // What the page holds, and the file, once it has settled; again should it be shown again meanwhile.
    let file;
    let texts;
    let differ;
    for (let tries = 0; ; tries++) {
      try {
        await quiet();
      } catch {
        problem ??= `never settled: ${await t.state()}, ${await t.status()}`;
      }
      try {
        file = await t.read();
        texts = await read();
        differ = instances ? await apartFrom(file) : [];
        break;
      } catch (error) {
        if (tries === 2 || !/context was destroyed|Cannot find context|does not belong to the document|navigat|detached|reading 'textContent'/i.test(error.message)) throw error; // (or not drawn yet: a slow page)
        await t.ready();
      }
    }
    let missing = missingFrom(file, texts);
    if (!problem && missing.length > 0) {
      ({ missing } = await lookAgain(missing));
      try { // what the page holds now, for the rules below
        [file, texts] = [await t.read(), await read()];
        differ = instances ? await apartFrom(file) : [];
      } catch (error) {
        if (!/context was destroyed|Cannot find context|does not belong to the document|navigat|detached|reading 'textContent'/i.test(error.message)) throw error;
      }
    }
    if (!problem && missing.length > 0) problem = `words on the page in neither the file, a conflict, nor the list, ${KEPT_WITHIN / 1000} s on: ${missing.join(" ")} (the page: ${await t.state()}, ${await t.status()})`;
    if (!problem) problem = await keptAfterReload("the last");
    if (!problem) problem = await sameAsLoaded();
    const lastShown = await pullsOf();
    notes.push(`${pullsTaken + Math.max(lastShown, pullsShown)} write(s) taken in where the page stood, ${reloads} shown anew`);
    if (!problem && instances) {
      // The Agent's words: in the file, but those it deleted itself, those the reader wrote over by a
      // choice, those held or listed with the reader's, those the reader took off the page by a step
      // that takes words away (not one the page was shown again in: the file's in place of what it
      // showed), and those lost in the server's documented gap. What the reader's components wrote: on
      // the page as in the file, but for what the Agent wrote there since, an instance held or given up
      // on a card, and one the Agent deleted.
      await Promise.all(answered);
      const there = new Set(agentWordsIn(file));
      const onPage = new Set(agentWordsIn(texts.shown));
      const keptToo = new Set([...agentWordsIn(texts.held), ...agentWordsIn(texts.listed)]);
      const takenAway = (each) => seen.has(each) && !onPage.has(each) && offPage.has(each) && !offPage.get(each).reloaded && TAKES_AWAY.test(offPage.get(each).op);
      const lost = [...agentWords].filter((each) => !there.has(each) && !agentRemoved.has(each) && !forced.has(each) && !keptToo.has(each) && !takenAway(each));
      const unexplained = lost.filter((each) => !gapLost.has(each));
      if (unexplained.length > 0) problem = `words the Agent wrote in neither the file, a conflict, nor the list, nor taken out by the reader: ${unexplained.map((each) => (offPage.has(each) ? `${each} (off the page at ${offPage.get(each).op}${offPage.get(each).reloaded ? ", shown again" : ""})` : each)).join(" ")}`;
      if (!problem && differ.length > 0) problem = `what components wrote differs on the page and in the file: ${JSON.stringify(differ).slice(0, 1500)}`;
      if (!problem) problem = checked(t);
    }
    const fileText = (file.match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? "").replace(/\s+/g, " ").trim();
    if (problem && trace.some((line) => line.startsWith("  "))) console.log(trace.join("\n"));
    return { problem, ops, file: fileText, notes };
  }
  await combo("Control", "s");
  try {
    await t.settle("saved", 20000);
  } catch {
    problem = `never saved: ${await t.state()}, ${await t.status()}`;
  }
  // Blocks not finished are not written until they are (a row of columns with one empty:
  // docs/editor.md): nothing to compare. What components wrote is compared
  // with the file's own markup of it, the rest with the page opened again on the file.
  const waitsForText = await page.evaluate(() => document.documentElement.hasAttribute("data-ge-drafts"));
  if (!problem && !waitsForText) {
    const onPage = await page.evaluate(shape);
    const apart = instances ? await page.evaluate(writtenApart, await t.read()) : [];
    await t.open();
    const inFile = await page.evaluate(shape);
    if (onPage !== inFile) problem = `the file differs from the page\n    page: ${onPage}\n    file: ${inFile}`;
    else if (apart.length > 0) problem = `what components wrote differs on the page and in the file: ${JSON.stringify(apart).slice(0, 1500)}`;
  }
  const natural = naturalize(await t.read()).changes;
  if (!problem && natural.length > 0) problem = `the file the editor wrote is not all the kit's: naturalize would change ${natural.map(({ line, rule }) => `${rule} (line ${line})`).join(", ")}`;
  if (!problem && instances) problem = checked(t);
  const file = (await t.read()).match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1].replace(/\s+/g, " ").trim() ?? "";
  if (problem && trace.some((line) => line.startsWith("  "))) console.log(trace.join("\n"));
  return { problem, ops, file, notes };
}

// Run on its own: seeds first..first+count-1.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flags = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
  const [first = 1, count = 20, steps = 40] = process.argv.slice(2).filter((arg) => !arg.startsWith("--")).map(Number);
  const options = { more: flags.includes("--more"), agent: flags.includes("--agent"), instances: flags.includes("--instances"), changes: flags.includes("--changes"), writes: flags.includes("--structure") ? "structure" : flags.includes("--words") ? "words" : "mixed" };
  const studio = await createStudio();
  const failed = [];
  try {
    for (let seed = first; seed < first + count; seed++) {
      const t = await studio.begin();
      const { problem, ops, file, notes } = await session(t, seed, steps, undefined, options);
      console.log(`seed ${seed}: ${problem ? "FAIL" : "ok"}${notes.length > 0 ? ` (${notes.join("; ")})` : ""}`);
      if (problem) {
        failed.push(seed);
        console.log(`  ${problem}\n  ops: ${ops.join(" · ")}\n  file: ${file.slice(0, 800)}`);
      }
    }
  } finally {
    await studio.close();
  }
  const what = `${options.agent ? `every word of the reader's${options.instances ? " and the Agent's, and every component's write," : ""} in the file, held or listed` : "no conflict, the file as the page"}${options.instances ? ", gallery check passing it" : ""}`;
  console.log(failed.length === 0 ? `Checked ${count} random session(s) of ${steps} steps${options.instances ? " with instances of packages" : ""}${options.more ? " with block operations" : ""}${options.agent ? ` with an Agent writing${options.writes === "mixed" ? "" : ` (${options.writes === "words" ? "words alone" : "blocks put in, taken out and moved"})`}` : ""}${options.changes ? ", its changes marked" : ""}: ${what}.` : `${failed.length} of ${count} failed: ${failed.join(", ")}`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}
