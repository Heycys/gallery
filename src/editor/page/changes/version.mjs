import { rangeOf, readText } from "../annotate/anchors.mjs";
import { nestedBlocks } from "../core.mjs";
import { createBars, createFills } from "../fills.mjs";
import { addStyle } from "../ui.mjs";
import { GHOST_STYLE, createGhosts } from "./ghost.mjs";
import { goneMark, placeOf, putMark, takeMark } from "./gone-words.mjs";
import { WORDS_STYLE, wordMarks } from "./words.mjs";

// 历史版本's view of a recent version (docs/workbench.md "History"; the preview's /generated/<slug>.html?present&version=…,
// src/server/routes.mjs versionPage): what it changed of the version kept before it, marked on its page as the Agent's
// changes are marked on a document's (docs/editor.md "Agent's changes"), so that the two read alike. The server marked
// the blocks in the text it rendered (source/changes.mjs markedVersion: diffRows, the blocks aligned by their ids and
// kinds, as the review's): a block added, or changed with no words to tell, filled green (fills.mjs), a block whose
// words changed has its words compared with the version before's (`data-ge-hist-was`) word by word, those added the
// green highlight and those taken out shown in red struck through where they were (words.mjs, gone-words.mjs), and
// beside each a green bar in the left margin; the blocks deleted a ghost where they stood, its red bar (ghost.mjs).
// The same modules as the editor's own, under the same stamp (a document's page has loaded them already), and none of
// the editor: nothing here is a block, a commit or an undo step, and nothing reaches a file (the page is frozen and
// writes nothing). Drawn once the kit has drawn the page (data-doc-ready), placed again whenever it may have moved
// (its size, the window's, a picture loaded, a disclosure or a tab opened); not drawn while the dialog's 显示改动 is
// off: the address's marks=off, then the event `doc-history-marks` ({ shown }) the workbench sends each frame as the
// switch changes, drawn or taken down at once. Printed, none of it.

const EVENT = "doc-history-marks";
const STYLE = `
  ${WORDS_STYLE}
  ${GHOST_STYLE}
  @media print { ::highlight(ge-diff-add) { background-color: transparent; text-decoration: none; } .ge-diff-del, .ge-diff-halo, .ge-diff-bar { display: none; } }
`;

const highlights = () => Boolean(globalThis.CSS?.highlights && globalThis.Highlight);
// A text block's words as the server reads them: a list item's own, not the blocks it holds (changes/index.mjs readBlock).
const readBlock = (block) => {
  const held = nestedBlocks(block);
  return readText([block], held.length ? { skip: (child) => held.includes(child) } : undefined);
};
// The groups of blocks deleted (markedVersion's JSON), [] when none reads.
function groups() {
  try {
    const value = JSON.parse(document.querySelector("script[data-ge-hist-ghosts]")?.textContent ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

let shown = new URLSearchParams(location.search).get("marks") !== "off";
let started = false;
const filled = new Set(); // blocks filled green: added, or changed with no words to tell
const barred = new Set(); // blocks with a bar beside them: those and the ones whose words changed
let dels = []; // the words taken out shown
const fills = createFills({ kind: "changes", className: "ge-diff-halo", stands: (block) => filled.has(block) });
const bars = createBars({ kind: "changes", className: "ge-diff-bar", stands: (block) => barred.has(block) });
const ghosts = createGhosts();

function takeDown() {
  fills.clear();
  bars.clear();
  ghosts.clear();
  for (const node of dels) if (node.isConnected) takeMark(node);
  dels = [];
  filled.clear();
  barred.clear();
  if (highlights()) CSS.highlights.delete("ge-diff-add");
}

function draw() {
  takeDown();
  if (!shown) return;
  addStyle(STYLE);
  for (const block of document.querySelectorAll('[data-ge-hist="add"]')) {
    filled.add(block);
    barred.add(block);
  }
  for (const block of document.querySelectorAll('[data-ge-hist="words"]')) barred.add(block);
  const ranges = [];
  for (const block of document.querySelectorAll("[data-ge-hist-was]")) {
    const text = readBlock(block);
    const { ins, cuts } = wordMarks(block.getAttribute("data-ge-hist-was"), text.text);
    ranges.push(...ins.map(([from, to]) => rangeOf(text, from, to)).filter(Boolean));
    for (const { at, text: words } of [...cuts].reverse()) {
      const where = placeOf(text, at);
      if (!where) continue;
      const node = goneMark(words, document, { before: text.text[at - 1], after: text.text[at] });
      putMark(node, where);
      dels.push(node);
    }
  }
  if (highlights() && ranges.length) {
    const highlight = new Highlight(...ranges);
    highlight.priority = -1;
    CSS.highlights.set("ge-diff-add", highlight);
  }
  const deleted = groups();
  for (const [name, edge] of [["data-ge-hist-before", "before"], ["data-ge-hist-after", "after"], ["data-ge-hist-into", "into"]]) {
    for (const anchor of document.querySelectorAll(`[${name}]`)) {
      const group = deleted[Number(anchor.getAttribute(name))];
      if (group) ghosts.add(group, anchor, edge);
    }
  }
  place();
}

// The ghosts where their rooms are (made first: they move what is below them), then the fills and the bars.
function place() {
  if (!shown) return;
  ghosts.place();
  fills.paint([...filled].filter((block) => block.isConnected));
  bars.paint([...barred].filter((block) => block.isConnected));
}
let queued = 0;
const later = () => {
  if (started && !queued) queued = requestAnimationFrame(() => { queued = 0; place(); });
};

function start() {
  if (started) return;
  started = true;
  draw();
  const watch = new ResizeObserver(later);
  watch.observe(document.documentElement);
  if (document.body) watch.observe(document.body);
  const main = document.querySelector("main");
  if (main) watch.observe(main);
  addEventListener("resize", later);
  for (const type of ["load", "toggle", "click", "transitionend"]) document.addEventListener(type, later, true);
  document.fonts?.ready.then(later);
}

addEventListener(EVENT, (event) => {
  const next = event.detail?.shown !== false;
  if (next === shown) return;
  shown = next;
  if (started) draw();
});

// Once the kit has drawn the page; a page that never says so (a kit that failed) is marked once it has loaded.
if (document.documentElement.hasAttribute("data-doc-ready")) start();
else {
  const ready = new MutationObserver(() => {
    if (!document.documentElement.hasAttribute("data-doc-ready")) return;
    ready.disconnect();
    start();
  });
  ready.observe(document.documentElement, { attributes: true, attributeFilter: ["data-doc-ready"] });
  addEventListener("load", () => setTimeout(() => { ready.disconnect(); start(); }, 1500), { once: true });
}
