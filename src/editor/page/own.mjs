import { isInkClass } from "./marks.mjs";
import { TAB } from "../components/paragraph/index.mjs";

// Inline elements of the report's own (docs/editor.md, "In-place text editing"): a phrasing element
// the editor has no format for (a span with a class, style or attribute of the report's own: a
// number badge in a heading, a citation in a cell; a cite, a small, an abbr…), and a format bar's tag
// that carries attributes of its own and holds no words (a drawn arrow, <i class="arr-r"></i>). In a
// text block it is an atom, as an inline formula is: shown and written back as the file has it, its
// words not edited, the words around it editable. Judged from an element's tag, its attributes as the
// file writes them and whether it holds words, so that the scanner's parse5 nodes (source/blocks.mjs)
// and the page's elements (core.mjs) are judged alike. Not the editor's own: a text color or
// highlight (the kit's classes alone), small text's end part, a formula, a link.

const PHRASING = new Set([
  "span", "abbr", "cite", "dfn", "small", "mark", "q", "time", "data", "bdi", "bdo", "kbd", "samp", "var",
  "ins", "del", "strike", "font", "big", "tt", "nobr", "acronym",
]);
const FORMATS = new Set(["strong", "em", "b", "i", "u", "s", "code", "sup", "sub"]);

/** `attributes`: [{ name, value }] as the file writes them; `words`: whether it holds any. */
export function ownInline(tag, attributes, words) {
  if (FORMATS.has(tag)) return attributes.length > 0 && !words;
  if (!PHRASING.has(tag)) return false;
  if (tag !== "span") return true;
  const classes = attributes.length === 1 && attributes[0].name === "class" ? attributes[0].value.trim().split(/\s+/).filter(Boolean) : null;
  if (classes?.length > 0 && (classes.every(isInkClass) || classes.join(" ") === TAB)) return false;
  return !attributes.some(({ name, value }) => name === "class" && value.split(/\s+/).includes("doc-math-inline"));
}
