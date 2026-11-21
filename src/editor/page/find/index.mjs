import { addStyle } from "../ui.mjs";

// A report opened from 搜索文档 at a hit (the workbench's search, shared/search.mjs): the page finds
// the words again in its text (the time they occur after the same text as the hit's, else the hit's
// nth time, else the first), scrolls them to the window's upper middle and marks them in a search
// yellow (the CSS Custom Highlight API: nothing in the page changes) until the reader
// presses or types, or 4 seconds pass. Words in a detail card: it opens, and they are scrolled so in
// its content. Words in a closed disclosure or a hidden panel: what holds them is brought into view
// instead. The text is read as the server reads the file: a line a block, the header and formulas
// left out, runs of spaces as one, case alike.

const NAME = "ge-found";
const STYLE = `
  ::highlight(${NAME}) { color: inherit; background-color: light-dark(rgba(255, 203, 0, .42), rgba(255, 196, 0, .32)); }
`;
const SKIP = "script, style, template, noscript, svg, .katex, main > header";
const BLOCK = "p, li, h1, h2, h3, h4, h5, h6, td, th, caption, summary, figcaption, pre, blockquote, dt, dd, div, section, figure, details";

// The page's text as one string, its blocks a line each, and where each of its characters comes from.
function pageText(root) {
  let text = "";
  const at = []; // index in text -> { node, offset } (null for a line's end)
  let block = null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const own = node.parentElement.closest(BLOCK);
    if (own !== block && text && !text.endsWith("\n")) {
      text += "\n";
      at.push(null);
    }
    block = own;
    const value = node.nodeValue;
    for (let offset = 0; offset < value.length; offset++) {
      let char = value[offset];
      if (char === "\u200b") continue;
      if (/\s/.test(char)) {
        if (!text || text.endsWith(" ") || text.endsWith("\n")) continue;
        char = " ";
      }
      text += char;
      at.push({ node, offset });
    }
  }
  return { text, at };
}

let clear = null;

/**
 * Show `words` where the hit was ({ before, index }): { ok, shown }. `open(node)`: what opens by
 * itself to show `node` opened, the box it scrolls in returned, or null (dialog/page.mjs show).
 */
export function revealText({ text: words, before = "", index = 0 }, open = () => null) {
  clear?.();
  const query = String(words ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const main = document.querySelector("main");
  if (!query || !main) return { ok: false, reason: "missing" };
  addStyle(STYLE);
  const { text, at } = pageText(main);
  const lower = text.toLowerCase();
  const found = [];
  for (let from = lower.indexOf(query); from >= 0; from = lower.indexOf(query, from + query.length)) found.push(from);
  if (!found.length) return { ok: false, reason: "missing" };
  const context = String(before).replace(/\s+/g, " ").toLowerCase();
  const start = (context ? found.find((from) => lower.slice(Math.max(0, from - context.length), from).endsWith(context)) : undefined) ?? found[index] ?? found[0];
  const first = at[start];
  const last = at[start + query.length - 1];
  if (!first || !last) return { ok: false, reason: "missing" };
  const range = document.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset + 1);
  const box = open(first.node);

  // Hidden (a closed disclosure, a panel not shown): its nearest shown container is what comes into view.
  let shown = range.getClientRects().length > 0;
  let target = range;
  if (!shown) {
    for (let node = first.node.parentElement; node && node !== main; node = node.parentElement) {
      if (node.getClientRects().length) {
        target = node;
        break;
      }
    }
  }
  const rect = target.getBoundingClientRect();
  if (box) box.scrollTop += rect.top - box.getBoundingClientRect().top - box.clientHeight * 0.35;
  else scrollTo({ top: Math.max(0, scrollY + rect.top - innerHeight * 0.35), behavior: "instant" });
  if (!shown) return { ok: true, shown: false };

  const highlight = new Highlight(range);
  CSS.highlights.set(NAME, highlight);
  const timer = setTimeout(() => clear?.(), 4000);
  const done = () => {
    clearTimeout(timer);
    if (CSS.highlights.get(NAME) === highlight) CSS.highlights.delete(NAME);
    removeEventListener("pointerdown", done, true);
    removeEventListener("keydown", done, true);
    clear = null;
  };
  addEventListener("pointerdown", done, true);
  addEventListener("keydown", done, true);
  clear = done;
  return { ok: true, shown: true };
}
