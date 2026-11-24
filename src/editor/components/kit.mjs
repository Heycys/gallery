import { componentOf, MEDIA_BLOCKS } from "../../shared/components/index.mjs";

// The facts of the kit's markup the editor finds blocks by, as the components' descriptions say
// them (src/shared/components/; docs/internals.md, "Components"), for the page (Element.matches,
// querySelector) and the server (matchesNode, partOf on parse5's tree) alike: the editor never
// spells them itself. How the editor treats each component stays in its folder here.

const component = (id) => componentOf(id);
const part = (id, name) => component(id).parts[name].at;
/** The last compound of a part's chain: what the element itself is (".doc-sheet-tab"). */
export const stepOf = (at) => at.split(">").at(-1).trim();
/** The class a compound of one class names (".doc-dialog-content" -> "doc-dialog-content"). */
export const classOf = (selector) => /^\.([\w-]+)$/.exec(selector)?.[1] ?? null;

const pair = component("sheets").pairs[0];
const rowAt = part("sheets", "row").replace(/^:scope > /, "");
export const SHEETS = Object.freeze({
  match: component("sheets").match,
  row: part("sheets", "row"), // the tab row, a child of the area
  rowAt, // the tab row wherever it stands, for matches and closest
  tabsOfRow: ":scope > " + stepOf(part("sheets", "tabs")), // the tabs of a tab row (querySelectorAll on it)
  tabIn: rowAt + " " + stepOf(part("sheets", "tabs")), // a tab found from inside it (closest)
  tabs: part("sheets", "tabs"), // its tabs
  panels: part("sheets", "panels"), // the panels, children of the area
  tab: stepOf(part("sheets", "tabs")), // what a tab is
  tabKey: pair.attrA, // a tab's key, its panel's the same
  panelKey: pair.attrB,
});

export const DIALOG = Object.freeze({
  match: component("dialog").match,
  content: part("dialog", "content"),
  heading: component("heading").match, // a block of its content a card may go by
  short: "h2, h3", // the heading a card written the short way may start with, which it takes as an h3
  open: `${component("dialog").match}[open]`, // the card shown now
  openContent: `${component("dialog").match}[open] ${stepOf(part("dialog", "content"))}`, // its content, where it scrolls
});

/**
 * A surface of the document's in the top layer that is no modal dialog: a database's record details showing its body
 * (the kit's database/peek.js marks its pages so while they are the details). The editor draws its tools there, as
 * in an open detail card, so that they stand over what it shows.
 */
export const SURFACE = "[data-doc-surface]";

/** In such a surface, the body it shows (the slot of the record the details are of, peek.js SHOWN): its page. */
export const SURFACE_BODY = ":scope > [data-doc-slot][data-doc-shown]";

/**
 * A database's record's body (a slot of its pages: src/shared/database.mjs), the document's blocks shown in its record's
 * details alone: no heading of one is the page's outline's (outline/read.mjs LEFT_OUT), as none of a detail card is.
 */
export const RECORD_BODY = ".doc-database-pages > [data-doc-slot]";

export const DETAILS = Object.freeze({
  match: component("details").match,
  label: part("details", "label"),
  content: part("details", "content"),
});

export const CODE = Object.freeze({
  match: component("code").match,
  title: part("code", "title"),
  pre: part("code", "code"),
});

/** A highlight block, the opening summary included: the one place the editor says which elements are one. */
export const HIGHLIGHT = Object.freeze({ match: component("highlight").match });

/** A callout (提示块). */
export const CALLOUT = Object.freeze({ match: component("callout").match });

// A display formula block and an inline one (the math description's two rules).
const [mathInline, mathBlock] = component("math").match.split(",").map((rule) => rule.trim());
export const MATH = Object.freeze({ inline: mathInline, block: mathBlock });

/** The media blocks (an image, a file, a bookmark, an embed): the figures whose caption is a text block of its own. */
export const MEDIA = MEDIA_BLOCKS.map((id) => component(id).match).join(", ");

export const TABLE = Object.freeze({ frame: component("table").frame, lead: component("table").lead });
export const SECTION = Object.freeze({ match: component("section").match });
export const PAGE = Object.freeze({ header: component("page").header, title: component("page").title });
export const PARAGRAPH = Object.freeze({ tail: component("paragraph").tail });
