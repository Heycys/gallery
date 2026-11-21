// Changing attributes of an element's start tag where the file has it: every other byte of the tag
// stays. The one writer of attribute changes: a unit's sizes and attributes (apply.mjs sizeUnit,
// attributeUnit) and a table cell's tag, class, style, scope and spans (table.mjs) go through it.

import { attributeSpan, tagEnd } from "./text.mjs";

// An attribute as the file writes it: { value: its text, entities as written (a decoded value would
// write &quot; and &amp; back as the characters), quote: the quote it has (a double one when it has
// none) }.
function written(source, range) {
  const raw = source.slice(range.startOffset, range.endOffset);
  const quoted = /^[^=\s]+\s*=\s*(["'])([\s\S]*)\1$/.exec(raw);
  return quoted ? { value: quoted[2], quote: quoted[1] } : { value: raw.replace(/^[^=\s]+\s*=?\s*/, ""), quote: '"' };
}

/**
 * The splices ({ start, end, text }, offsets in `source`) that make `changes` in a start tag
 * (`startTag`: parse5's location of it, with its attributes): [[name, value]], value
 *   a string       the attribute set: replaced where it stands (written with double quotes), else
 *                  written at the end of the tag; "" writes the name alone
 *   null           the attribute taken out, with the whitespace before it
 *   (old) => text  the attribute set to the text this returns (null: taken out), `old` what the
 *                  file has ({ value, quote }, null without the attribute); a replaced attribute
 *                  keeps its quote
 */
export function attributeSplices(source, startTag, changes) {
  let at = tagEnd(source, startTag.endOffset - 1);
  while (at - 1 > startTag.startOffset && /\s/.test(source[at - 1])) at--;
  const splices = [];
  for (const [name, change] of changes) {
    const range = startTag.attrs?.[name];
    const old = range ? written(source, range) : null;
    const value = typeof change === "function" ? change(old) : change;
    const quote = old && typeof change === "function" ? old.quote : '"';
    const text = value === null ? "" : value === "" && typeof change !== "function" ? name : `${name}=${quote}${value}${quote}`;
    if (range && value === null) {
      splices.push({ ...attributeSpan(source, range.startOffset, range.endOffset), text });
    } else if (range) splices.push({ start: range.startOffset, end: range.endOffset, text });
    else if (value !== null) splices.push({ start: at, end: at, text: ` ${text}` });
  }
  return splices;
}

/**
 * An element's start tag as the file has it with `changes` made (attributeSplices), as `tag` when
 * given (a td made a th).
 */
export function startTagWith(source, node, changes, tag) {
  const location = node.sourceCodeLocation.startTag;
  let text = source.slice(location.startOffset, location.endOffset);
  // Last first, so that each offset holds; splices at one place keep their order.
  const splices = attributeSplices(source, location, changes).map((splice, index) => ({ ...splice, index }));
  for (const { start, end, text: put } of splices.sort((a, b) => b.start - a.start || b.index - a.index)) {
    text = text.slice(0, start - location.startOffset) + put + text.slice(end - location.startOffset);
  }
  return tag ? text.replace(/^<\w+/, `<${tag}`) : text;
}
