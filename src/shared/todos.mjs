import { parse } from "parse5";
import { TODO } from "./components/list.mjs";
import { sha256 } from "./files.mjs";
import { attr, BLOCK_LEVEL, elementsOf, hasClass } from "./html-tree.mjs";

// A document's to-dos as its pages show them (the items of its to-do lists, ul.doc-todo): what the
// workspace's facts list (src/workbench/index.mjs, workspace.query("todos")) and what a check of one
// from another page finds it by (src/editor/todos.mjs, workspace.setTodo), the one
// reading for both, so that a ref the facts gave names the item the write looks for. Pure but for the
// parser and the hash: no DOM.

const SKIPPED = new Set(["script", "style", "template", "noscript", "svg", "math"]);
const HEADING = /^h([1-6])$/;
const tidy = (text) => text.replace(/[\s​]+/g, " ").trim();

// The words an element holds, as a reader reads them: its text, a line break a space, nothing of a script,
// a style or a drawing; `stop(child)`: a child left out with what it holds.
function wordsOf(node, stop = () => false) {
  let text = "";
  const visit = (current) => {
    for (const child of current.childNodes ?? []) {
      if (child.nodeName === "#text") text += child.value;
      else if (child.tagName === "br") text += " ";
      else if (child.tagName && !SKIPPED.has(child.tagName) && !stop(child)) visit(child);
    }
  };
  visit(node);
  return tidy(text);
}

// A to-do's own words: what the item holds before its lists and the blocks it holds (a paragraph, a
// picture), or, where it holds no words of its own (an item written <li><p>…</p></li>), its first block's.
function itemWords(item) {
  const own = wordsOf(item, (child) => BLOCK_LEVEL.has(child.tagName));
  if (own) return own;
  const first = elementsOf(item).find((child) => BLOCK_LEVEL.has(child.tagName) && child.tagName !== "ul" && child.tagName !== "ol");
  return first ? wordsOf(first, (child) => child.tagName === "ul" || child.tagName === "ol") : "";
}

/**
 * The to-dos of a document's `text` (its page's HTML, as its pages see it), in their order: [{ text,
 * done, block, path, nth }], `path` the headings above it (their words, the outermost first: an h2 under
 * an h1 of the body, the document's title never one), `nth` which of the to-dos of the same words under
 * the same path it is (0 the first). With `at`, each says where its <li> starts in `text` too (`at`, the
 * offset of its start tag), which the editor's units name it by (source/units.mjs elStart).
 */
export function todosOf(text, { at = false } = {}) {
  const root = parse(String(text), { sourceCodeLocationInfo: at });
  const headings = []; // [{ level, words }]
  const todos = [];
  const seen = new Map();
  const visit = (node) => {
    for (const child of elementsOf(node)) {
      if (SKIPPED.has(child.tagName)) continue;
      const heading = HEADING.exec(child.tagName);
      if (heading && !hasClass(child, "doc-title")) {
        const level = Number(heading[1]);
        while (headings.length && headings.at(-1).level >= level) headings.pop();
        const words = wordsOf(child);
        if (words) headings.push({ level, words });
        continue;
      }
      if (child.tagName === "li" && child.parentNode?.tagName === "ul" && hasClass(child.parentNode, TODO)) {
        const path = headings.map(({ words }) => words);
        const words = itemWords(child);
        const key = JSON.stringify([words, path]);
        const nth = seen.get(key) ?? 0;
        seen.set(key, nth + 1);
        todos.push({ text: words, done: attr(child, "data-checked") !== undefined, block: attr(child, "data-block-id") ?? null, path, nth, ...(at ? { at: child.sourceCodeLocation?.startOffset ?? -1 } : {}) });
      }
      visit(child);
    }
  };
  visit(root);
  return todos;
}

/**
 * The version of a document's file the facts read its to-dos from (the hash of its text, as a to-do's
 * ref carries it: workspace.query("todos")), which a check of one finds it by its place in (`nth`) while
 * the file is still that one.
 */
export const fileVersion = (source) => sha256(source).slice(0, 16);
