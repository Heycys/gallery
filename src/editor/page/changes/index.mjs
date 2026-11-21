import { t } from "../../../shared/i18n/index.mjs";
import { onPreferences, preference, setPreference } from "../../../shared/preferences.mjs";
import { readText, rangeOf } from "../annotate/anchors.mjs";
import { heardKey } from "../../../shared/session.mjs";
import { GONE_WORDS, nestedBlocks } from "../core.mjs";
import { createBars, createFills } from "../fills.mjs";
import { FOLLOW, task } from "../frames.mjs";
import { onSettle, own, provide } from "../overlays.mjs";
import { failure, postAnswer } from "../post.mjs";
import { addStyle, still } from "../ui.mjs";
import { UNDO_SHOWN, createBar } from "./bar.mjs";
import { GHOST_STYLE, createGhosts } from "./ghost.mjs";
import { editsBy, goneMark, placeOf, putMark, takeMark } from "./gone-words.mjs";
import { WORDS_STYLE, wordMarks } from "./words.mjs";

// The Agent's changes on the page (docs/editor.md "Agent's changes"), shown for the reader to review:
// what an Agent wrote to the report since the reader last kept or reverted it (the server's review,
// editor/changes.mjs, read at the editor's start and never holding it back, drawn once the page is
// ready), marked without a change to the file: a block added (or changed with no words to tell, or
// whose words cannot be compared) a green fill (fills.mjs), words added the 批注's look in green (a
// CSS highlight under the 批注's own), the words taken out shown where they were, in red struck
// through (gone-words.mjs: an empty inline mark of the editor's own, its words drawn by CSS, which
// nothing that reads or writes the block's content takes), the blocks deleted shown where they were,
// a ghost of them in red struck through in room made for it (ghost.mjs, drawn in the overlay layer:
// nothing of it in the document). Nothing to rest the pointer on: all of it shows at once. The reader
// editing a block takes its words taken out away first (the keys, input, an input method, a paste,
// cut or drop in it, the format bar over it), and they are not drawn in it again until the caret has
// left it (the review read again then). A block's words are compared with the baseline only while the page
// holds them as the file does: one holding words of the reader's the file does not have (a change waiting,
// on its way, held back by a conflict card) has none of them marked, which would paint the reader's words as
// the Agent's, until they are saved. The bar at the window's bottom (bar.mjs) says how many blocks
// and offers 撤回 (the server writes the baseline back: the reader's own saved edits stay; undone within
// UNDO_SHOWN from the bar of the page shown again) and 确认 (no more marks). The two numbers on the bar
// are switches (bar.mjs; the reader's, kept in the browser): the green one the marks of what was added or
// changed (the fills and the words added), the red one what was taken out (the words struck through, the
// ghosts), on both, all of it, off both, the page as the file has it. 显示变更 off (设置),
// nothing is drawn and a review read is kept at once, quietly. The page reads the review again when
// its server says it changed (another tab kept it, an Agent wrote more) and 1.5s after a commit of its
// own while the bar shows. Not on a page opened on its own in a frame (?solo), printed, or presented
// (the preview's ?present has no editor).
//
// Beside every block it marks green (added, changed whole, or with words of the Agent's marked), and beside
// every ghost, a 2px bar in the left margin (fills.mjs createBars; the ghost's own ::before), green and red:
// the eye runs down one margin and finds every place, a one-character edit too (a design review, 2026-11-17).
// A write arriving while the page is open lights what it brought once: what is under review now and was
// not when the page last drew it (`known`, by the blocks' refs, the ghosts' words; a block keeps the key it was
// first seen by) starts at --ge-diff-*-arrive, holds a moment and settles to its resting tint over ARRIVE; a
// block whose words alone changed gets a fill of its own for that time (`ge-diff-glow`, from the arrival's green
// to none), the words' marks staying as they are (a CSS highlight cannot be animated). Nothing replays: a redraw
// of the same review (the reread after a commit, a switch of the bar, the caret leaving a block) finds nothing
// new, a redraw within ARRIVE goes on with the arrival where it was (a negative delay), and the page's first draw
// lights nothing (opening a document under review). A reader who prefers reduced motion has it too, as it is
// colour only, at ARRIVE_STILL with no hold. Out of sight (another tab, a window minimized) what came is held and
// lit when the page shows again; a page shown anew for someone else's write takes as known what the page before
// it drew (the tab's sessionStorage, read while the write it was shown anew for is recent). On 确认 what is drawn
// fades out over LEAVE before it is taken down (the words' green at once: a CSS highlight cannot fade; at once
// for reduced motion, as the editor's fades are); 撤回 takes it down at once.

const ROUTE = "/__gallery/edit/changes";
const ARRIVE = 1100; // ms: an arrival's light, from its start to the resting tint
const ARRIVE_STILL = 400; // ms: the same for a reader who prefers reduced motion, no hold
const LEAVE = 160; // ms: 确认's marks fading out
const ANEW_RECENT = 15000; // ms: a page loaded this soon after its tab heard a write it showed anew is that write's
const REREAD_AFTER = 1500; // after a commit of the page's own, the review read again this long after (the reader paused)
const LEFT_AFTER = 150; // the caret left a block the reader edited: the review read again this long after (once saved)
const KEEP_TRIES = 3; // a quiet keep refused (the review grew meanwhile) is tried again this often
// What may edit the block it happens in: its words taken out go first (gone-words.mjs editsBy for a key).
const EDITS = ["keydown", "beforeinput", "compositionstart", "paste", "cut", "drop", "dragstart"];

const STYLE = `
  ${WORDS_STYLE}
  ${GHOST_STYLE}
  /* An arrival (the header's note): strong for a seventh of the time, then easing to the resting tint, or to none. */
  @keyframes ge-diff-arrive { 0%, 14% { background-color: var(--ge-diff-add-arrive); } 100% { background-color: var(--ge-diff-add-fill); } }
  @keyframes ge-diff-arrive-del { 0%, 14% { background-color: var(--ge-diff-del-arrive); } 100% { background-color: var(--ge-diff-del-fill); } }
  @keyframes ge-diff-glow { 0%, 14% { background-color: var(--ge-diff-add-arrive); } 100% { background-color: transparent; } }
  .ge-diff-halo[data-ge-arriving] { animation: ge-diff-arrive ${ARRIVE}ms cubic-bezier(.2, .8, .2, 1) both; }
  .ge-diff-ghost[data-ge-arriving] { animation: ge-diff-arrive-del ${ARRIVE}ms cubic-bezier(.2, .8, .2, 1) both; }
  .ge-diff-glow { background: transparent; }
  .ge-diff-glow[data-ge-arriving] { animation: ge-diff-glow ${ARRIVE}ms cubic-bezier(.2, .8, .2, 1) both; }
  /* Reduced motion: colour only all the same, from the arrival's tint straight to the resting one. */
  @keyframes ge-diff-arrive-still { from { background-color: var(--ge-diff-add-arrive); } to { background-color: var(--ge-diff-add-fill); } }
  @keyframes ge-diff-arrive-del-still { from { background-color: var(--ge-diff-del-arrive); } to { background-color: var(--ge-diff-del-fill); } }
  @keyframes ge-diff-glow-still { from { background-color: var(--ge-diff-add-arrive); } to { background-color: transparent; } }
  @media (prefers-reduced-motion: reduce) {
    .ge-diff-halo[data-ge-arriving] { animation: ge-diff-arrive-still ${ARRIVE_STILL}ms ease-out both; }
    .ge-diff-ghost[data-ge-arriving] { animation: ge-diff-arrive-del-still ${ARRIVE_STILL}ms ease-out both; }
    .ge-diff-glow[data-ge-arriving] { animation: ge-diff-glow-still ${ARRIVE_STILL}ms ease-out both; }
  }
  @media print { ::highlight(ge-diff-add) { background-color: transparent; text-decoration: none; } .ge-diff-del, .ge-diff-halo, .ge-diff-glow, .ge-diff-bar { display: none; } }
`;

const highlights = () => Boolean(globalThis.CSS?.highlights && globalThis.Highlight);
const holdsSelection = (block) => {
  const selection = getSelection();
  return selection.rangeCount > 0 && (block.contains(selection.anchorNode) || block.contains(selection.focusNode));
};

/**
 * slug, token: the map's; commits(), autosave(): the page's (made later than this); flush(): what
 * waits saved now (as Ctrl+S); say(text, kind); session: sessionStorage (storage.mjs storageOf), where
 * a revert's undo is kept over the page shown again; across: the selection across blocks (text-select/:
 * texts(), redraw(texts)), kept on its words while marks go and come. Returns { start(),
 * pulled(), committed(receipt), leave() }.
 */
export function createChanges({ slug, token, commits, autosave, flush, say, session, across = null }) {
  const undoKey = `gallery-edit:${slug}:changes-undo`;
  const shows = () => preference("showChanges");
  const marksAdded = () => preference("showChangesAdded");
  const marksRemoved = () => preference("showChangesRemoved");
  let applied = ""; // the three switches as the page was last drawn by them
  let review = null; // the review as last read and drawn: { stamp, counts, added, changed, removed }
  let started = false;
  let left = false;
  let busy = false; // 撤回, 确认 or 撤销 under way
  let reading = read(); // at once: the page's start does not wait for it
  let rereadTimer = 0;
  let keepTries = 0;
  let offering = 0; // until when the bar offers 撤销 of this tab's revert
  const filled = new Set(); // block elements filled green
  const changedBlocks = new Map(); // a text block -> its words in the baseline
  const added = new Map(); // a text block -> the ranges of its words added (the green highlight's)
  let dels = []; // the words taken out shown: { node, block }
  const edited = new Set(); // text blocks the reader edited since their words taken out were drawn
  const unmarked = new Set(); // changed text blocks left unmarked for the reader's unsaved words, the caret in them
  const ghosts = createGhosts();
  let fills = null;
  let bars = null; // beside every block filled or with words marked (wordUnits)
  let glows = null; // an arrival's fill over a block whose words alone changed
  const wordUnits = new Set(); // units with words of theirs marked and no fill
  // An arrival (the header's note): the keys of what was under review as the page last drew it (null: nothing
  // drawn yet, or the marks off, so nothing is new), when each key's light began, and those come out of sight.
  const seenKey = `gallery-edit:${slug}:changes-seen`;
  let known = null;
  const lit = new Map(); // key -> performance.now() of its light's start
  const held = new Set();
  const keyOf = new WeakMap(); // a unit -> the key it was first seen by (a ref by its hash becomes one by its id once edited)
  let litTimer = 0;
  const bar = createBar({
    revert: () => revert(),
    accept: () => keep(),
    shown: (name) => preference(name),
    toggle(name) {
      setPreference(name, !preference(name));
      applied = switches();
      bar.sync();
      draw();
    },
  });

  function read() {
    return postAnswer(ROUTE, token, { slug, action: "read" });
  }

  // ---------- finding the blocks it names (in the file now) ----------
  const unitOf = (id) => document.querySelector(`[data-ge-unit="${id}"]`);
  const body = () => document.querySelector("main");
  function find(ref) {
    if (!ref) return null;
    const main = body() ?? document;
    if (ref.title) return main.querySelector('[data-ge-kind="title"]'); // the page's own title, as the editor made it a text block
    if (ref.id) return main.querySelector(`[data-block-id="${CSS.escape(ref.id)}"]`);
    if (typeof ref.hash !== "string") return null;
    const list = commits();
    if (!list) return null;
    let nth = 0;
    for (const node of main.querySelectorAll("[data-ge-unit]")) {
      if (list.fileHash(Number(node.getAttribute("data-ge-unit"))) !== ref.hash) continue;
      if (nth++ === ref.nth) return node;
    }
    return null;
  }
  // A unit's own text blocks in the page's order (the server's: its scope line's first, if a table's).
  function ownBlocks(unit, ref) {
    if (ref.title) return [unit];
    const owner = (block) => {
      const at = block.closest("[data-ge-unit], [data-ge-lead]");
      return at?.hasAttribute("data-ge-lead") && !at.hasAttribute("data-ge-unit") ? unitOf(at.getAttribute("data-ge-lead")) : at;
    };
    const lead = document.querySelector(`[data-ge-lead="${unit.getAttribute("data-ge-unit")}"]`);
    const within = (root) => [root, ...root.querySelectorAll("[data-ge-block]")].filter((block) => block.hasAttribute("data-ge-block") && owner(block) === unit);
    return [...(lead && lead !== unit ? within(lead) : []), ...within(unit)];
  }
  // A text block's words as the server reads them: a list item's own, not the blocks it holds.
  const readBlock = (block) => {
    const held = nestedBlocks(block);
    return readText([block], held.length ? { skip: (child) => held.includes(child) } : undefined);
  };
  // Whether a text block holds words of the reader's the file does not have: a change of it waiting, on its
  // way, held back by a conflict card or given up for the file's words not shown yet (the commits' collect():
  // the page's blocks otherwise than as last committed or taken in).
  const unsaved = () => {
    const ids = new Set((commits()?.collect().edits ?? []).map((edit) => String(edit.id)));
    return (block) => ids.has(block.getAttribute("data-ge-block"));
  };

  // ---------- drawing ----------
  const frames = task("changes", { run: place, fail: () => keepingAcross(takeDown) });
  // A selection across blocks (text-select/) kept on its words while marks go and come: its ends are
  // points of its own, which a text node joined again (takeMark) would leave off the page, and so its
  // pieces' live ranges are taken first (a text node split, putMark, they follow; one joined, takeMark
  // sets them) and it is drawn again from them.
  function keepingAcross(change) {
    const texts = across?.texts() ?? null;
    change(texts ? texts.map(({ range }) => range) : []);
    if (texts) across.redraw(texts);
  }
  function takeDown(ranges = []) {
    fills?.clear();
    bars?.clear();
    glows?.clear();
    wordUnits.clear();
    for (const { node } of dels) if (node.isConnected) takeMark(node, ranges);
    dels = [];
    ghosts.clear();
    filled.clear();
    changedBlocks.clear();
    added.clear();
    if (highlights()) CSS.highlights.delete("ge-diff-add");
  }

  const switches = () => `${shows()}${marksAdded()}${marksRemoved()}`;
  function draw() {
    keepingAcross((ranges) => drawNow(ranges));
  }
  function drawNow(ranges) {
    takeDown(ranges);
    applied = switches();
    if (!review || !shows()) {
      edited.clear();
      unmarked.clear();
      known = review || !shows() ? null : new Set(); // nothing under review: whatever comes next is new; the marks off, nothing is
      if (known) remember(known);
      return;
    }
    addStyle(STYLE);
    fills ??= createFills({ kind: "changes", className: "ge-diff-halo", stands: (block) => filled.has(block), made: (block, fill) => arriving(fill, keyOf.get(block)) });
    bars ??= createBars({ kind: "changes", className: "ge-diff-bar", stands: (block) => filled.has(block) || wordUnits.has(block) });
    // A glow stands while its key is lit (forgotten, the frames woken, it goes before any audit could find it over).
    glows ??= createFills({ kind: "changes", className: "ge-diff-glow", stands: (block) => wordUnits.has(block) && lit.has(keyOf.get(block)), made: (block, fill) => arriving(fill, keyOf.get(block)) });
    const green = marksAdded();
    const red = marksRemoved();
    // What is under review now, whatever the switches show (a switch pressed brings nothing new), and what of it is new.
    const keys = new Set();
    const unitKey = (unit, ref) => {
      if (!keyOf.has(unit)) keyOf.set(unit, refKey(ref));
      keys.add(keyOf.get(unit));
    };
    for (const group of review.removed) keys.add(ghostKey(group));
    for (const { ref } of review.added) {
      const unit = find(ref);
      if (!unit) continue;
      unitKey(unit, ref);
      if (green) filled.add(unit);
    }
    const unitOf = new Map(); // a text block whose words are marked -> its unit
    // A block's words are compared with the baseline only where the page holds them as the file does: the
    // reader's words the file does not have (unsaved) would be the Agent's, so such a block has none of its
    // words marked until they are saved (the review read again after the commit, or as the caret leaves it).
    const waits = unsaved();
    const skipped = new Set();
    for (const change of review.changed) {
      const unit = find(change.ref);
      if (!unit) continue;
      unitKey(unit, change.ref);
      if (change.whole) {
        if (green) filled.add(unit);
        continue;
      }
      const blocks = ownBlocks(unit, change.ref);
      for (const { nth, base } of change.texts ?? []) {
        if (!blocks[nth]) continue;
        if (waits(blocks[nth])) skipped.add(blocks[nth]);
        else {
          changedBlocks.set(blocks[nth], base);
          unitOf.set(blocks[nth], unit);
        }
      }
    }
    // A unit with words of its own marked and no fill has its bar all the same (and its glow when it arrives).
    if (green) for (const unit of unitOf.values()) if (!filled.has(unit)) wordUnits.add(unit);
    const before = known;
    known = keys;
    remember(keys);
    if (before) light([...keys].filter((key) => !before.has(key)));
    // One left unmarked with the caret in it is read again as the caret leaves it (its words undone to the
    // file's are saved by no commit, which would read it again).
    unmarked.clear();
    for (const block of skipped) if (holdsSelection(block)) unmarked.add(block);
    // A block the reader edited keeps its words taken out away while the caret is in it.
    for (const block of [...edited]) if (!changedBlocks.has(block) || !holdsSelection(block)) edited.delete(block);
    for (const [block, base] of changedBlocks) markWords(block, base, !edited.has(block));
    paintAdded();
    for (const group of red ? review.removed : []) {
      const anchor = group.before ? find(group.before) : group.after ? find(group.after) : body();
      if (anchor) arriving(ghosts.add(group, anchor, group.before ? "before" : group.after ? "after" : "into").drawn, ghostKey(group));
    }
    if (filled.size || wordUnits.size || added.size || dels.length || ghosts.count) frames.wake();
  }

  // ---------- an arrival (the header's note) ----------
  // A unit's key by the ref it was first seen by; a ghost's by the words of what was deleted (no ref of its place,
  // which the reader editing the block beside it changes).
  const refKey = (ref) => (ref.title ? "title" : ref.id ? `id:${ref.id}` : `hash:${ref.hash}:${ref.nth ?? 0}`);
  const ghostKey = (group) => `gone:${group.rows.map((row) => `${row.tag ?? ""}|${row.text ?? ""}`).join("\n")}`;
  // What this page drew, for a page shown anew in the tab for someone else's write (start()).
  const remember = (keys) => session?.set(seenKey, JSON.stringify([...keys]));
  // How long a light lasts: shorter, with no hold, for a reader who prefers reduced motion (STYLE's media query).
  const span = () => (still() ? ARRIVE_STILL : ARRIVE);
  // `fresh` keys light now; out of sight, once the page shows again.
  function light(fresh) {
    if (fresh.length === 0) return;
    if (document.visibilityState !== "visible") {
      fresh.forEach((key) => held.add(key));
      return;
    }
    const now = performance.now();
    for (const key of fresh) lit.set(key, now);
    // Once over, the glows go and the keys are forgotten.
    clearTimeout(litTimer);
    litTimer = setTimeout(() => {
      const at = performance.now();
      for (const [key, start] of lit) if (at - start >= span()) lit.delete(key);
      frames.wake();
    }, span() + 50);
  }
  const elapsed = (key) => (key && lit.has(key) ? performance.now() - lit.get(key) : Infinity);
  const glowing = (key) => elapsed(key) < span();
  // A fill or a ghost made while its key's light lasts: it goes on with the light where it is (made again by a
  // redraw within ARRIVE, it does not start over). Its light over, the mark is its resting self, the attribute
  // gone (a node taken off the page and put back, a fill of a block in a Sheet not shown, would play it again).
  function arriving(node, key) {
    const since = elapsed(key);
    if (!(since < span())) return;
    node.setAttribute("data-ge-arriving", "");
    node.style.animationDelay = `${-Math.round(since)}ms`;
    setTimeout(() => {
      node.removeAttribute("data-ge-arriving");
      node.style.animationDelay = "";
    }, span() - since + 20);
  }
  document.addEventListener("visibilitychange", shownAgain);
  function shownAgain() {
    if (document.visibilityState !== "visible" || held.size === 0 || left) return;
    const fresh = [...held];
    held.clear();
    light(fresh);
    draw();
  }

  // A changed text block's marks: the ranges of its words added (live: they follow the reader's
  // typing), and, `taken`, its words taken out put in where they were (from the last, so that each
  // place read before is still where it was: a text node is split only after it).
  function markWords(block, base, taken) {
    const text = readBlock(block);
    const { ins, cuts } = wordMarks(base, text.text);
    added.set(block, marksAdded() ? ins.map(([from, to]) => rangeOf(text, from, to)).filter(Boolean) : []);
    if (!taken || !marksRemoved()) return;
    for (const { at, text: words } of [...cuts].reverse()) {
      const where = placeOf(text, at);
      if (!where) continue;
      const node = goneMark(words, document, { before: text.text[at - 1], after: text.text[at] });
      const entry = { node, block };
      own(node, "changes", { owner: block, alive: () => block.contains(node) && dels.includes(entry) });
      putMark(node, where);
      dels.push(entry);
    }
  }

  function paintAdded() {
    if (!highlights()) return;
    const ranges = [...added.values()].flat();
    if (ranges.length === 0) return void CSS.highlights.delete("ge-diff-add");
    const highlight = new Highlight(...ranges);
    highlight.priority = -1; // a 批注's marks over these
    CSS.highlights.set("ge-diff-add", highlight);
  }

  // Each frame something may have moved: the fills where their blocks are, the ghosts where their rooms are.
  function place() {
    if (!review) return false;
    fills?.paint([...filled].filter((block) => block.isConnected));
    bars?.paint([...filled, ...wordUnits].filter((block) => block.isConnected));
    glows?.paint([...wordUnits].filter((block) => block.isConnected && glowing(keyOf.get(block))));
    ghosts.place();
    return filled.size || wordUnits.size || ghosts.count ? FOLLOW : false;
  }

  // What the page's edits took off the page goes with it (a block deleted, its marks): the words taken
  // out shown in a block deleted or turned into another are taken out of it too, so that undo, which
  // puts the very same element back, puts back none of them.
  // A copy of a mark that a change made (a cell turned into a header cell or back, cells merged or
  // filled, a disclosure's title made a paragraph, a block duplicated: whatever clones a block's
  // content) stands for nothing and goes at once, before the overlays' audit would find it a stray:
  // the review read again after the change's commit draws the words taken out where they are then.
  onSettle(() => {
    const drawn = dels.length > 0;
    for (const block of [...filled]) if (!block.isConnected) filled.delete(block);
    for (const block of [...wordUnits]) if (!block.isConnected) wordUnits.delete(block);
    dels = dels.filter((entry) => {
      if (entry.block.isConnected && entry.node.isConnected) return true;
      if (entry.node.parentNode) takeMark(entry.node);
      return false;
    });
    if (drawn) {
      const ours = new Set(dels.map((entry) => entry.node));
      for (const node of document.querySelectorAll(`main ${GONE_WORDS}`)) if (!ours.has(node)) takeMark(node);
    }
    ghosts.settle();
  });

  // ---------- the reader edits a block holding words taken out ----------
  // They go first, before the edit touches the block (window, capture: before the editor's own
  // listeners): the text either side of each one text node again, the caret where it was, and the
  // block's words added marked anew (a range that ended in the half that went would cover the wrong
  // words). The block is `edited`: drawn without them until the caret leaves it.
  // The blocks an edit may touch: the one it happens in, those the selection reaches, the browser's
  // or the page's across blocks (text-select/, which the browser's then holds none of).
  function blocksOf(event) {
    const selection = getSelection();
    const range = selection.rangeCount ? selection.getRangeAt(0) : null;
    const target = event?.target instanceof Node ? event.target : null;
    const reached = across?.texts()?.map(({ host }) => host) ?? [];
    const hit = new Set();
    for (const { block } of dels) {
      if (hit.has(block)) continue;
      if ((target && block.contains(target)) || (range && range.intersectsNode(block)) || reached.some((host) => host === block || host.contains(block) || block.contains(host))) hit.add(block);
    }
    return hit;
  }
  function takeOut(blocks) {
    if (blocks.size === 0) return;
    keepingAcross((ranges) => {
      for (const entry of dels) if (blocks.has(entry.block) && entry.node.isConnected) takeMark(entry.node, ranges);
    });
    dels = dels.filter((entry) => !blocks.has(entry.block));
    for (const block of blocks) {
      edited.add(block);
      const base = changedBlocks.get(block);
      if (base !== undefined) markWords(block, base, false);
    }
    paintAdded();
  }
  function editing(event) {
    if (dels.length === 0 || (event.type === "keydown" && !editsBy(event))) return;
    takeOut(blocksOf(event));
  }
  // The format bar over words of such a block (its buttons keep the selection where it is).
  function pressed(event) {
    if (dels.length > 0 && event.target instanceof Element && event.target.closest(".ge-format")) takeOut(blocksOf(null));
  }
  // The caret left a block the reader edited (or one left unmarked for their unsaved words): the review read
  // again once what waits is saved, and drawn.
  function moved() {
    if (edited.size === 0 && unmarked.size === 0) return;
    let leaving = false;
    for (const blocks of [edited, unmarked]) {
      for (const block of [...blocks]) {
        if (block.isConnected && holdsSelection(block)) continue;
        blocks.delete(block);
        leaving = true;
      }
    }
    if (leaving) rereadSaved(LEFT_AFTER);
  }
  for (const type of EDITS) addEventListener(type, editing, true);
  addEventListener("pointerdown", pressed, true);
  document.addEventListener("selectionchange", moved);

  // ---------- what the server says ----------
  function take(answer) {
    if (left) return;
    review = answer?.ok && answer.pending ? answer : null;
    if (review && !shows()) return void keep({ quiet: true });
    if (busy) return;
    if (review) bar.counts(review.counts);
    else if (Date.now() >= offering) bar.hide();
    draw();
  }
  async function reread() {
    clearTimeout(rereadTimer);
    if (left || !started) return;
    reading = read();
    take(await reading);
  }
  // Read again `after` ms from now, once nothing waits to be saved (the reader paused).
  function rereadSaved(after) {
    clearTimeout(rereadTimer);
    const again = () => {
      if (autosave()?.state.waiting > 0) rereadTimer = setTimeout(again, REREAD_AFTER);
      else reread();
    };
    rereadTimer = setTimeout(again, after);
  }

  // 确认: the review ended; `quiet`, as the setting being off does it (nothing said).
  async function keep({ quiet = false } = {}) {
    if (!review || busy) return;
    const stamp = review.stamp;
    const seen = known; // refused, what was under review is no arrival when it is drawn again
    busy = true;
    review = null;
    bar.hide();
    const posting = postAnswer(ROUTE, token, { slug, action: "accept", stamp });
    // A review read while 确认 is under way is take()'s to set and this one's to show (busy): the one kept, read
    // before the server ended it, is over; a newer one (a write since) is drawn, with its bar, once 确认 is answered.
    const over = () => {
      if (review?.stamp === stamp) review = null;
    };
    if (!quiet) await fadeOut();
    over();
    draw();
    const answer = await posting;
    busy = false;
    if (answer.ok) {
      keepTries = 0;
      over();
      if (review) {
        bar.counts(review.counts);
        draw();
      }
      return;
    }
    if (seen && known) known = new Set([...known, ...seen]);
    // Refused (the review grew meanwhile, the file was held): read again, and kept again when quiet, a few times at most.
    if (quiet) {
      if (++keepTries > KEEP_TRIES) return;
    } else if (answer.reason === "changed") say(failure(answer, t("Agent 刚刚又改了文档，再看一眼")), "note");
    else say(t("没能确认：{0}", failure(answer, t("预览服务器出错"))), "error");
    reread();
  }

  // 确认's marks fade out (the header's note): the fills, bars, glows and ghosts and the words taken out, the words'
  // green at once; nothing for a reader who prefers reduced motion. Resolves when they have; a draw meanwhile (a
  // write read while 确认 is under way) takes them down at once.
  function fadeOut() {
    if (still()) return Promise.resolve();
    if (highlights()) CSS.highlights.delete("ge-diff-add");
    const nodes = document.querySelectorAll('[data-ge-overlay="changes"]'); // every mark this module draws (overlays.mjs own)
    const fades = [...nodes].map((node) => node.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: LEAVE, easing: "ease-out", fill: "forwards" })).filter(Boolean);
    return Promise.all(fades.map((fade) => fade.finished.catch(() => {})));
  }

  // 撤回: what waits is saved first, and nothing may wait for the reader (a conflict); then the server
  // writes the baseline, and the page is shown again as after a write of its own (autosave showOwn: no
  // question of what that write put back of the reader's, which the reader asked for).
  async function revert() {
    if (!review || busy) return;
    const stamp = review.stamp;
    busy = true;
    await flush();
    const state = autosave()?.state;
    if (!state || state.waiting > 0 || state.syncing || state.held > 0 || state.offline) {
      busy = false;
      say(t("还有修改没保存或有冲突待处理，处理完再撤回"), "error");
      return;
    }
    let answer = null;
    const shown = await autosave().showOwn(async () => {
      answer = await postAnswer(ROUTE, token, { slug, action: "revert", stamp });
      if (!answer.ok || answer.none) return false;
      session?.set(undoKey, JSON.stringify({ undo: answer.undo, at: Date.now() }));
      return answer.version || true; // the version it wrote: the page shown again on another asks what that put back
    });
    if (shown === "pulled") { // taken in where the page stands (pull/): 撤销 offered here
      busy = false;
      undoShown();
      reread();
      return;
    }
    if (shown) return; // the page goes: the one shown again offers 撤销
    busy = false;
    if (answer?.ok) return void reread(); // nothing was under review any more
    say(answer?.reason === "changed" ? failure(answer, t("Agent 刚刚又改了文档，再看一眼")) : t("没能撤回：{0}", failure(answer ?? {}, t("预览服务器出错"))), answer?.reason === "changed" ? "note" : "error");
    reread();
  }

  // 撤销 of a revert: the server writes back what the revert wrote over, while the file is still the revert's.
  async function undo(id) {
    if (busy) return;
    busy = true;
    offering = 0;
    session?.remove(undoKey);
    bar.hide();
    await flush();
    let answer = null;
    const shown = await autosave().showOwn(async () => {
      answer = await postAnswer(ROUTE, token, { slug, action: "undo", undo: id });
      return answer.ok ? answer.version || true : false;
    });
    if (shown === "pulled") {
      busy = false;
      reread();
      return;
    }
    if (shown) return;
    busy = false;
    say(t("没能撤销：{0}", failure(answer ?? {}, t("预览服务器出错"))), "error");
  }

  // A revert of this tab's, the page shown again since: 撤销 on the bar for what is left of UNDO_SHOWN.
  function undoShown() {
    let kept = null;
    try { kept = JSON.parse(session?.get(undoKey) ?? "null"); } catch {}
    const remaining = kept && typeof kept.undo === "string" ? UNDO_SHOWN - (Date.now() - kept.at) : 0;
    if (remaining <= 0) {
      session?.remove(undoKey);
      return false;
    }
    offering = Date.now() + remaining;
    bar.reverted(remaining, () => undo(kept.undo));
    setTimeout(() => session?.remove(undoKey), remaining);
    return true;
  }

  // The server's word that the review changed (another tab kept or reverted it, the Agent wrote more).
  const heard = () => {
    clearTimeout(rereadTimer);
    rereadTimer = setTimeout(reread, 100);
  };
  addEventListener("doc-changes-changed", heard);
  // 显示变更 switched (设置, another page of the origin): off, what is under review is kept and nothing drawn; on, read again.
  // The bar's switches pressed in another page: drawn again as they now are.
  onPreferences(() => {
    if (!started || left) return;
    const before = applied;
    if (!shows()) {
      if (review) keep({ quiet: true });
      return;
    }
    if (review && before.startsWith("true") && switches() !== before) {
      bar.sync();
      draw();
      return;
    }
    reread();
  });

  provide("changes", () => ({ pending: Boolean(review), counts: review?.counts ?? null, filled: filled.size, bars: bars?.count ?? 0, words: dels.length, ghosts: ghosts.count, edited: edited.size, arriving: [...lit.keys()].filter(glowing).length }));

  return {
    /** The page is ready: what was read is drawn (the bar, or 撤销 after a revert of this tab's). */
    async start() {
      if (started) return;
      started = true;
      undoShown();
      // Shown anew for someone else's write (the tab heard it a moment ago): what the page before drew is known.
      let heard = 0;
      try { heard = Number(sessionStorage.getItem(heardKey(slug))) || 0; } catch {}
      if (heard && Date.now() - heard < ANEW_RECENT) {
        try {
          const keys = JSON.parse(session?.get(seenKey) ?? "null");
          if (Array.isArray(keys)) known = new Set(keys);
        } catch {}
      }
      take(await reading);
    },
    /** Someone else's write was taken in where the page stands (pull/): the review read again and drawn on what it shows now. */
    pulled() {
      if (started && !left) heard();
    },
    /** A commit of the page's was taken in: while the bar shows, the review is read again once the reader pauses. */
    committed(receipt) {
      if (!receipt?.wrote || !review || !started) return;
      rereadSaved(REREAD_AFTER);
    },
    /** The page goes. */
    leave() {
      left = true;
      clearTimeout(rereadTimer);
      removeEventListener("doc-changes-changed", heard);
      for (const type of EDITS) removeEventListener(type, editing, true);
      removeEventListener("pointerdown", pressed, true);
      document.removeEventListener("selectionchange", moved);
      document.removeEventListener("visibilitychange", shownAgain);
      clearTimeout(litTimer);
    },
  };
}
