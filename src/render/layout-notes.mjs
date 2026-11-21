import { kitNamespace } from "../shared/old-names.mjs";
import { attr, hasClass } from "../shared/html-tree.mjs";
import { chartDeclarationNotes } from "./chart-declarations.mjs";
import { parseReport } from "./report-tree.mjs";

// Notes on a report's layout: what may be worth a look, never a failure. Body text may stand
// straight in the page or a Sheet panel, before, between or instead of sections; only a run of it
// between two sections that does not start with a heading of its own reads like text the section
// above was meant to hold. Everything else (a flat report, a preface, an epilogue, a run with its
// own heading) is as intended, and gets no note. Body text fills the reading column: a width of
// the report's own on paragraphs, list items, headings or the kit's text groups makes their lines
// break early, with an extra right margin (docs/visual-design.md), and gets a note too;
// widgets styling text of their own (a selector with a class of the report's own) do not. What is
// worth a look in a chart drawn from a table (a card with no title, a header naming a column twice:
// chartDeclarationNotes) are notes too.

const isSection = (node) => node.tagName === "section" && hasClass(node, "doc-section");
const NOT_TEXT = new Set(["section", "header", "footer", "nav", "script", "style", "template", "dialog", "link", "meta"]);
const isBodyText = (node) => !NOT_TEXT.has(node.tagName);
const textOf = (node) => node.nodeName === "#text" ? node.value : (node.childNodes ?? []).map(textOf).join("");

// The page and its Sheet panels: where body text and chapters stand side by side.
function roots(node, found = []) {
  for (const child of node.childNodes ?? []) {
    if (!child.tagName) continue;
    if ((child.tagName === "main" && hasClass(child, "doc-page")) || attr(child, "data-doc-sheet") !== undefined) found.push(child);
    roots(child.tagName === "template" ? child.content : child, found);
  }
  return found;
}

// Body text: paragraphs, list items, headings, quotes and the kit's text groups.
const TEXT = /^(p|li|h[1-4]|blockquote|ul|ol)$/;
const KIT_TEXT = ["doc-summary", "doc-panel", "doc-note", "doc-callout"];
const isText = (node) => TEXT.test(node.tagName) || KIT_TEXT.some((name) => hasClass(node, name));
// A width or max-width that can make text narrower than its column (not none, auto, 100%...).
const WIDE = new Set(["none", "auto", "100%", "inherit", "initial", "unset", "revert"]);
const narrows = (declarations) => [...declarations.matchAll(/(?:^|[;{\s])(?:max-)?width\s*:\s*([^;}]+)/gi)]
  .some(([, value]) => !WIDE.has(value.replace(/!important/i, "").trim().toLowerCase()));
// A selector for body text as such: its last part a text tag or a kit text group, and nothing in it
// the report's own (a class that is not the kit's, an id).
const textSelector = (selector) => {
  const last = selector.trim().split(/\s*[\s>+~]\s*/).at(-1) ?? "";
  const target = /^(p|li|h[1-4]|blockquote|ul|ol)\b/.test(last) || KIT_TEXT.some((name) => last.includes(`.${name}`));
  const own = [...selector.matchAll(/\.([\w-]+)/g)].some(([, name]) => !kitNamespace(name)) || selector.includes("#");
  return target && !own;
};

function narrowedText(document) {
  const found = [];
  const visit = (node, inMain) => {
    for (const child of node.childNodes ?? []) {
      if (!child.tagName) continue;
      const main = inMain || (child.tagName === "main" && hasClass(child, "doc-page"));
      if (main && isText(child) && narrows(attr(child, "style") ?? "")) found.push(`<${child.tagName}> with style="${attr(child, "style").trim()}"`);
      if (child.tagName === "style") {
        const css = textOf(child).replace(/\/\*[\s\S]*?\*\//g, "");
        for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
          if (!narrows(body)) continue;
          for (const selector of selectors.split(",")) if (textSelector(selector)) found.push(`"${selector.trim()}" in the document's style`);
        }
      }
      visit(child.tagName === "template" ? child.content : child, main);
    }
  };
  visit(document, false);
  return found;
}

/**
 * Notes on the layout of a report's HTML: [message]. `written`: its file's text, when `html` is the
 * file as the intake makes it in memory (chartDeclarationNotes).
 */
export function layoutNotes(html, { written = html } = {}) {
  const notes = [];
  const document = parseReport(html);
  const narrowed = narrowedText(document);
  if (narrowed.length > 0) notes.push(`body text given a width of its own (${narrowed.slice(0, 3).join("; ")}${narrowed.length > 3 ? `; ${narrowed.length - 3} more` : ""}): its lines break before the reading column's edge, leaving an extra right margin; let body text fill the column`);
  for (const box of roots(document)) {
    const children = box.childNodes.filter((child) => child.tagName);
    children.forEach((node, index) => {
      if (!isSection(node)) return;
      let end = index + 1;
      while (end < children.length && isBodyText(children[end])) end++;
      const run = children.slice(index + 1, end);
      if (run.length === 0 || !isSection(children[end] ?? {}) || /^h[1-4]$/.test(run[0].tagName)) return;
      const title = node.childNodes.map((child) => child.tagName ? child : null).filter(Boolean).map(textOf).find((text) => text.trim())?.replace(/\s+/g, " ").trim().slice(0, 40) ?? "";
      // Which they are: from the first one's line, by its tag and its first words (found testing the
      // skill with Agents, 2026-11-06: the note named the section and not the blocks, with no line
      // to find them by).
      const [first] = run;
      const words = textOf(first).replace(/\s+/g, " ").trim();
      const said = `<${first.tagName}>${words ? ` "${words.length > 30 ? `${words.slice(0, 30)}…` : words}"` : ""}`;
      const line = first.sourceCodeLocation?.startLine;
      notes.push(`${run.length} block${run.length === 1 ? "" : "s"} of body text right after the section "${title}" stand outside it${line ? ` (line ${line})` : ""}, ${run.length === 1 ? `the ${said}` : `the first a ${said}`}, between two sections, with no heading of their own: fine if meant, otherwise they belong inside that section`);
    });
  }
  notes.push(...chartDeclarationNotes(html, { written }));
  return notes;
}
