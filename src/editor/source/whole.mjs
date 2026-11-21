import { parse } from "parse5";
import { COMPONENTS, instancesOf, partOf } from "../../shared/components/index.mjs";
import { attr } from "../../shared/html-tree.mjs";
import { findElement } from "./html.mjs";

// A report's file half written (docs/editor.md, "Writing"): an Agent changes a structure in several
// edits, each replacing one stretch of the file, and between two of them the file is a page its
// author does not mean: a disclosure opened and not closed yet (its </details> comes with the next
// edit), a close written before its open, a Sheet area's tabs written before their panels. The
// preview takes no file that shows such a sign until it is whole again, or until it has held it a
// while (settle.mjs: a file that stays so is its author's, odd as it is, and the checks speak of it).
// Only these signs count, each one a page a browser reads otherwise than its author wrote it:
//   - no <main> in the file: a write caught between emptying it and filling it, or still in its head
//     (one caught any later leaves <main> open), or a file that holds no page;
//   - a block element whose end tag is not in the file (a section, a div, a disclosure, a table, a
//     list…: the parser closes it wherever something around it ends), or an end tag of one that
//     closes nothing (the parser drops it);
//   - a component whose parts that go together do not pair, one to one (its description's `pairs`:
//     each Sheet tab its panel; the kit refuses to start one that does not).
// Not an element whose end tag may be left out (p, li, td, tr, thead, option…: a browser closes it
// where the next one starts, as its author meant), and nothing in what is no markup: a comment, an
// attribute's value, a script, a style, code (pre, code, and kbd, samp, var: their text is the
// author's sample), a template, a drawing (svg, math).

const PAIRED = new Set(["main", "section", "article", "aside", "nav", "header", "footer", "div", "details", "dialog", "figure", "blockquote", "table", "ul", "ol", "dl"]);
const NO_MARKUP = new Set(["script", "style", "template", "textarea", "title", "xmp", "iframe", "noembed", "noframes", "noscript", "plaintext", "pre", "code", "kbd", "samp", "var", "svg", "math"]);
const PAIRING = COMPONENTS.filter((component) => component.match && component.pairs);

/**
 * The signs that report `source` is half written, in the order of the file: [{ key, tag, line, text }],
 * `key` what it is (`<details> not closed`, `</div> closes nothing`, `sheets: tabs and panels do not
 * pair`), `tag` its tag as written, its blanks one (the start tag not closed, the end tag closing
 * nothing, the area's start tag: what tells it from another of its kind), `text` the key with its
 * line. None: the file is whole.
 */
export function halfWritten(source) {
  // A byte order mark is read as a browser decodes it away (as the render's parseReport reads it).
  const text = source.replace(/^﻿/, " ");
  const document = parse(text, { sourceCodeLocationInfo: true });
  const lineAt = (offset) => text.slice(0, offset).split("\n").length;
  const signs = [];
  const sign = (key, offset, end) => signs.push({ key, tag: text.slice(offset, end).replace(/\s+/g, " "), line: lineAt(offset), offset });
  if (!findElement(document, "main")) sign("no <main> in the file", 0, 0);
  const masked = []; // [start, end): what is no markup, where an end tag is none
  const closing = new Set(); // where each end tag that closed its element begins
  const visit = (node) => {
    for (const child of node.childNodes ?? []) {
      const at = child.sourceCodeLocation;
      if (child.nodeName === "#comment") {
        if (at) masked.push([at.startOffset, at.endOffset]);
        continue;
      }
      if (!child.tagName) continue;
      if (at?.startTag) masked.push([at.startTag.startOffset, at.startTag.endOffset]); // its attributes' values
      if (NO_MARKUP.has(child.tagName)) {
        if (at) masked.push([at.startOffset, at.endOffset ?? text.length]);
        continue;
      }
      if (at?.endTag) closing.add(at.endTag.startOffset);
      // One the parser made (a tbody nobody wrote, a copy of a formatting element) has no start tag.
      if (PAIRED.has(child.tagName) && at?.startTag && !at.endTag) sign(`<${child.tagName}> not closed`, at.startTag.startOffset, at.startTag.endOffset);
      visit(child);
    }
  };
  visit(document);
  // The end tags in the markup that closed nothing: every end tag of a block element the parser
  // took is one closing it.
  masked.sort((a, b) => a[0] - b[0]);
  let markup = "";
  let from = 0;
  for (const [start, end] of masked) {
    if (end <= from) continue;
    markup += text.slice(from, Math.max(from, start)) + " ".repeat(end - Math.max(from, start));
    from = end;
  }
  markup += text.slice(from);
  for (const found of markup.matchAll(/<\/([A-Za-z][A-Za-z0-9]*)[^<>]*>?/g)) {
    const name = found[1].toLowerCase();
    if (PAIRED.has(name) && !closing.has(found.index)) sign(`</${name}> closes nothing`, found.index, found.index + found[0].length);
  }
  for (const component of PAIRING) {
    for (const host of instancesOf(document, component)) {
      for (const { a, attrA, b, attrB } of component.pairs) {
        const keysA = partOf(host, component.parts[a].at).map((node) => attr(node, attrA));
        const keysB = partOf(host, component.parts[b].at).map((node) => attr(node, attrB));
        const once = (keys) => new Set(keys).size === keys.length;
        const paired = once(keysA) && once(keysB) && keysA.length === keysB.length && keysA.every((key) => keysB.includes(key));
        const at = host.sourceCodeLocation;
        if (!paired && at) sign(`${component.id}: ${a} and ${b} do not pair`, at.startOffset, at.startTag?.endOffset ?? at.startOffset);
      }
    }
  }
  return signs.sort((x, y) => x.offset - y.offset).map(({ key, tag, line }) => ({ key, tag, line, text: `${key} (line ${line})` }));
}
