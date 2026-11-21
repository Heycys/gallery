import { BLOCK_TYPES, sizeValue } from "../registry.mjs";
import { LINE_START, lineStart } from "../../../shared/code-lines.mjs";
import { hasClass } from "../../../shared/html-tree.mjs";
import { CODE_HEIGHT, FOLDED_LINES, validFolded, validLanguage } from "./index.mjs";

// 代码块 in report.html (the server's, source/): a code block made or converted on the page is
// written as <div class="doc-code" data-language="…"><div class="doc-code-title">…</div><pre>
// <code>…</code></pre></div>, its title plain text (empty: the kit shows 代码块), its code as it is
// (escaped), its language (highlighting), the number its first line shows (a pasted copy of an
// excerpt), the lines it has folded and its height (a frame it scrolls in) on the div.

/** A code block's markup; `id`: its id attribute (` data-block-id="…"`), or none. */
export const codeHtml = (spec, html, language, height, id = "", title = "", folded = "", first = "") =>
  `<div class="${spec.className}"${language ? ` data-language="${language}"` : ""}${first ? ` ${LINE_START}="${first}"` : ""}${folded ? ` ${FOLDED_LINES}="${folded}"` : ""}${height ? ` style="${CODE_HEIGHT}: ${height}"` : ""}${id}><div class="doc-code-title">${title}</div><pre><code>${html}</code></pre></div>`;

/**
 * Whether an attribute of a code block is the code block's own, as codeHtml writes it (its
 * language, its folded lines, its height) or an Agent's code takes it in (the number of its first
 * line, src/shared/code-lines.mjs): turned back into text (undo of a conversion into code), the
 * block leaves it.
 */
export const codeAttribute = (name, value) => name === "data-language" || name === FOLDED_LINES || name === LINE_START
  || (name === "style" && new RegExp(`^\\s*${CODE_HEIGHT}\\s*:[^;]*;?\\s*$`).test(value ?? ""));

/** A code block's title as written: escaped plain text on one line, at most 200 characters. */
export const validTitle = (value) => typeof value === "string" && value.length <= 200 && !/[<>\n]|&(?!(amp|lt|gt|quot|#39);)/.test(value);

/**
 * A code block's language, folded lines, height, title and first line's number (as the page writes
 * one: a whole number from 1, its digits alone), as the page sent them.
 */
const validCode = (node) => (node.language === undefined || validLanguage(node.language))
  && (node.folded === undefined || validFolded(node.folded))
  && (node.height === undefined || sizeValue("code", CODE_HEIGHT, node.height) === node.height)
  && (node.title === undefined || validTitle(node.title))
  && (node.lineStart === undefined || (typeof node.lineStart === "string" && String(lineStart(node.lineStart)) === node.lineStart));

// A code block in the shape codeHtml writes: <div class="doc-code" …><div
// class="doc-code-title">…</div><pre><code>…</code></pre></div>.
function writtenCode(unit) {
  const { node } = unit;
  if (unit.tag !== "div" || unit.nested || !hasClass(node, BLOCK_TYPES.code.className)) return false;
  const only = (parent, tags) => {
    const children = parent.childNodes ?? [];
    const elements = children.filter((child) => child.tagName);
    return elements.length === tags.length && elements.every((element, index) => element.tagName === tags[index]) && children.every((child) => child.tagName || !(child.value ?? "").trim()) ? elements : null;
  };
  const parts = only(node, ["div", "pre"]);
  return Boolean(parts) && hasClass(parts[0], "doc-code-title") && Boolean(only(parts[1], ["code"]));
}

// What the server does with it (components/files.mjs): its fields are checked, a block made or
// converted on the page is written by codeHtml, and one it wrote turns back into text, leaving its
// own attributes.
export default {
  code: {
    fields: ["language", "folded", "height", "title", "lineStart"],
    check: validCode,
    leaf: (spec, node, id) => codeHtml(spec, node.html, node.language, node.height, id, node.title, node.folded, node.lineStart),
    written: writtenCode,
    attribute: codeAttribute,
  },
};
