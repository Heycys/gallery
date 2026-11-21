// A Sheet area (选项卡区块, tabs): a row of tabs and one panel per tab, paired by key; each
// panel a flow like the page; framed, or plain (doc-sheet-shell--plain: no frame, nothing in
// from the flow's edge). sheets.js switches them.

import { attr, elementsOf } from "../html-tree.mjs";

/** What a Sheet area and its row of tabs are called (aria-label) as the editor writes one in a file, in the file's language (page.mjs pageLanguage). */
export const SHEETS_LABEL = { zh: "选项卡", en: "Tabs" };

// The headings that name a tab written the short way.
const TAB_HEADINGS = new Set(["h2", "h3", "h4"]);
const closed = (node) => Boolean(node.sourceCodeLocation?.startTag && node.sourceCodeLocation.endTag);
const line = (node) => (node.sourceCodeLocation?.startLine ? ` (line ${node.sourceCodeLocation.startLine})` : "");
const words = (node) => (node.nodeName === "#text" ? /\S/.test(node.value) : (node.childNodes ?? []).some(words));

/**
 * A Sheet area written the short way (parse5's tree, with its places in the file), which the intake
 * makes the kit's (src/editor/source/natural.mjs): an element of data-doc-sheets (its name, or none)
 * holding nothing but <section>s (blanks and comments between them), one a tab, each of no attribute
 * and closed in the file, starting with its heading (h2–h4, with words; no element or words before
 * it), the tab's name, the rest its panel. { tabs: [{ section, heading }] }; { why } for an area in
 * neither form (no row of tabs, no panel), what keeps it from being one; null for an area of the
 * kit's (a row of tabs, or a panel).
 */
export function shortSheets(node) {
  const children = elementsOf(node);
  if (children.some((child) => attr(child, "data-doc-sheet") !== undefined || (attr(child, "class") ?? "").split(/\s+/).includes("doc-sheet-tabs"))) return null;
  const loose = (node.childNodes ?? []).find((child) => child.nodeName === "#text" && /\S/.test(child.value));
  if (loose) return { why: "words straight in it" };
  const other = children.find((child) => child.tagName !== "section");
  if (other) return { why: `a <${other.tagName}>${line(other)} beside its sections` };
  if (!children.length) return { why: "no <section> in it" };
  const tabs = [];
  for (const section of children) {
    if (!closed(section)) return { why: `its <section>${line(section)} is not closed in the file` };
    if (section.attrs.length) return { why: `its <section>${line(section)} has an attribute of its own (${section.attrs.map((entry) => entry.name).join(", ")})` };
    const heading = elementsOf(section).find((child) => TAB_HEADINGS.has(child.tagName));
    if (!heading) return { why: `its <section>${line(section)} has no heading (<h2>–<h4>)` };
    // Its heading first: what stood before it would be the panel's while the heading names the tab.
    const before = section.childNodes.slice(0, section.childNodes.indexOf(heading));
    if (before.some((child) => child.tagName || words(child))) return { why: `its <section>${line(section)} does not start with its heading` };
    if (!closed(heading) || !words(heading)) return { why: `the heading of its <section>${line(section)} ${closed(heading) ? "has no words" : "is not closed in the file"}` };
    tabs.push({ section, heading });
  }
  return { tabs };
}

export default {
  id: "sheets",
  category: "container",
  match: "[data-doc-sheets]",
  assets: ["sheets"],
  uses: [/data-doc-sheets/],
  parts: {
    row: { at: ":scope > .doc-sheet-tabs", edit: "none", max: 1 },
    tabs: { at: ":scope > .doc-sheet-tabs > .doc-sheet-tab", edit: "text" },
    panels: { at: ":scope > [data-doc-sheet]", edit: "flow", groups: false },
  },
  pairs: [{ a: "tabs", attrA: "data-sheet-tab", b: "panels", attrB: "data-doc-sheet" }],
  attrs: {
    "data-doc-sheets": "a Sheet area",
    "data-sheet-tab": "a tab's key",
    "data-doc-sheet": "a panel's key, its tab's",
    "data-tab-icon": "a tab's emoji, shown before its name",
  },
  classes: ["doc-sheet-shell", "doc-sheet-shell--plain", "doc-sheet-tabs", "doc-sheet-tab"],
  fills: {
    ".doc-sheet-tabs": ["role"],
    "[data-sheet-tab]": ["id", "role", "aria-controls"],
    "[data-doc-sheet]": ["id", "role", "aria-labelledby"],
  },
  runtime: {
    state: {
      "[data-doc-sheets]": ["data-active-sheet"],
      "[data-sheet-tab]": ["aria-selected", "tabindex", "is-active"],
      "[data-doc-sheet]": ["hidden", "aria-hidden"],
    },
    internal: ["doc-sheets", "doc-tabs-fade-*"], // ids it gives: doc-sheets-<n>-tab-<i>; its styles' keyframes (the fades at the ends of a row that scrolls)
  },
};
