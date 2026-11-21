import { parse, parseFragment } from "parse5";
import { IDENTITY } from "../components/registry.mjs";
import { SHEETS, TABLE } from "../components/kit.mjs";
import { escapeAttribute, escapeText } from "../../shared/escape.mjs";
import { isInstance, matchesNode } from "../../shared/components/index.mjs";
import { attr } from "../../shared/html-tree.mjs";
import { CHART_SOURCE, TABLE_READERS } from "../../shared/table-chart.mjs";
import { freshPrefix, referencedIds, rewrite } from "../../shared/copy-ids.mjs";
import { unitKind, VOID_UNITS } from "./units.mjs";

// Editing the source text itself: escaping, a unit's plain text, the report's title in <title>,
// a style attribute's declarations, a deleted unit's source made ready to put back, lines moved to
// a new indentation, and whole lines taken out with their line breaks.

/** Attributes as a start tag has them: a bare name for an empty value. */
export const attributesText = (attributes = {}) => Object.entries(attributes)
  .map(([name, value]) => (value === "" ? ` ${name}` : ` ${name}="${escapeAttribute(String(value))}"`)).join("");

/**
 * Where to write into a start tag whose ">" is at `at`: right before it, or before the "/" of a
 * self-closing one (<hr/>).
 */
export const tagEnd = (source, at) => (source[at - 1] === "/" ? at - 1 : at);

/**
 * The range that takes an attribute out of its start tag (`start` to `end`: where parse5 or a
 * unit's record has it), the whitespace before it with it: <p class="a" id="b"> loses ` id="b"`,
 * and a tag broken over lines does not keep a line of whitespace.
 */
export function attributeSpan(source, start, end) {
  let from = start;
  while (from > 0 && /\s/.test(source[from - 1])) from--;
  return { start: from, end };
}

export function textOf(html) {
  const collect = (node) => node.nodeName === "#text" ? node.value : (node.childNodes ?? []).map(collect).join("");
  return collect(parseFragment(html)).replace(/\s+/g, " ").trim();
}

// The report title also appears in <title>: replace it there when it occurs exactly once. An untitled
// report's (`from` empty) is empty too: the title written in it whole, when it still is.
export function retitle(current, { from, to }) {
  const title = findTitle(parse(current, { sourceCodeLocationInfo: true }));
  const location = title?.sourceCodeLocation;
  if (!location?.endTag) return null;
  const inner = current.slice(location.startTag.endOffset, location.endTag.startOffset);
  if (!from) return inner.trim() === "" ? { start: location.startTag.endOffset, end: location.endTag.startOffset, text: escapeText(to) } : null;
  const needle = escapeText(from);
  const at = inner.indexOf(needle);
  if (at < 0 || inner.indexOf(needle, at + 1) >= 0) return null;
  const start = location.startTag.endOffset + at;
  return { start, end: start + needle.length, text: escapeText(to) };
}

function findTitle(node) {
  for (const child of node.childNodes ?? []) {
    if (child.tagName === "title") return child;
    if (child.tagName === "body") continue;
    const found = child.tagName && findTitle(child);
    if (found) return found;
  }
  return null;
}

// The declarations of a style attribute as written (entities and all), split at the semicolons
// that end them: not inside quotes, parentheses or an entity such as &quot;.
export function declarationsOf(style) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let from = 0;
  for (let index = 0; index < style.length; index++) {
    const char = style[index];
    if (char === "&") {
      const entity = /^&(#\d+|#x[\da-f]+|[a-z]\w*);/i.exec(style.slice(index));
      if (entity) index += entity[0].length - 1;
    } else if (quote) {
      if (char === quote) quote = null;
      else if (char === "\\") index++;
    } else if (char === '"' || char === "'") quote = char;
    else if (char === "(") depth++;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (char === ";" && depth === 0) {
      parts.push(style.slice(from, index));
      from = index + 1;
    }
  }
  parts.push(style.slice(from));
  return parts.map((part) => part.trim()).filter(Boolean);
}

/**
 * A style attribute's text (as written: entities and all) with `changes` ([[property, value | null]])
 * made: only the declarations named change, every other byte of them stays; a property not there
 * is written at the end. The text is "" when no declaration is left.
 */
export function declarationsWith(style, changes) {
  const declarations = declarationsOf(style);
  for (const [name, value] of changes) {
    const index = declarations.findIndex((declaration) => declaration.slice(0, declaration.indexOf(":")).trim() === name);
    if (value === null) {
      if (index >= 0) declarations.splice(index, 1);
    } else if (index >= 0) declarations[index] = `${name}: ${value}`;
    else declarations.push(`${name}: ${value}`);
  }
  return declarations.join("; ");
}

const RAW_TEXT = new Set(["pre", "textarea", "script", "style"]);

// A unit's source as commitEdits took it out, to be put back: the comments above it, a table's
// scope line and the element itself, nothing else; a Sheet tab, its panel after it (tabSource).
// { element, source, kind } or null; a tab's also { panel: the panel's source }.
export function restoredUnit(source) {
  if (typeof source !== "string" || !source.trim()) return null;
  const fragment = parseFragment(source, { sourceCodeLocationInfo: true });
  const nodes = fragment.childNodes.filter((node) => node.nodeName !== "#comment" && !(node.nodeName === "#text" && !node.value.trim()));
  const [tab, panel] = nodes;
  if (nodes.length === 2 && tab.tagName === "button" && matchesNode(tab, SHEETS.tab) && panel.tagName && panel.sourceCodeLocation?.endTag
    && attr(tab, SHEETS.tabKey) && attr(panel, SHEETS.panelKey) === attr(tab, SHEETS.tabKey)) {
    const cut = tab.sourceCodeLocation.endOffset;
    return { element: tab, source: source.slice(0, cut), panel: source.slice(cut).replace(/^\s+/, ""), kind: "tab" };
  }
  const element = nodes.at(-1);
  const lead = nodes.length === 2 ? nodes[0] : null;
  if (!element?.tagName || !element.sourceCodeLocation?.startTag || nodes.length > 2) return null;
  if (lead && !(lead.tagName && matchesNode(lead, TABLE.lead) && matchesNode(element, TABLE.frame))) return null;
  const kind = unitKind(element);
  return { element, source, kind };
}

/** Every id of `source` (a page), each element's (in a template's content too): what a copy's ids are kept apart from (copiedSource). */
export function idsOf(source) {
  const ids = [];
  const visit = (node) => {
    for (const child of node.childNodes ?? []) {
      if (!child.tagName) continue;
      const id = attr(child, "id");
      if (id) ids.push(id);
      visit(child.tagName === "template" ? child.content : child);
    }
  };
  visit(parse(source));
  return ids;
}

/** A Sheet tab's source to put back (restoredUnit): the tab, then its panel on a line of its own, each from column 0. */
export const tabSource = (current, unit) => `${reindent(current.slice(unit.start, unit.end), lineIndent(current, unit.start), "")}\n${reindent(current.slice(unit.companion.start, unit.companion.end), lineIndent(current, unit.companion.start), "")}`;

/**
 * A copy of a unit as the file has it (`current` from its start to its end, the comments above it
 * and a table's scope line with it), its block ids and ids taken out: the copy gets a block id of
 * its own when it is written, and an id names one element. But for the ids the copy names itself
 * (an SVG's marker by url(#id), a symbol by href="#id", a field by a label's `for`:
 * src/shared/copy-ids.mjs): those are given a prefix of the copy's own (the first c1-, c2- … no id of `taken` starts with), every reference in
 * it written to match, so that its drawing draws; `taken` (the ids of the file, and those the
 * copies of the same commit were given, which it gains) keeps two copies apart. `keys`
 * ({ old: new | null }, checked: components/figure copyKeys) are the keys of the charts drawn from
 * tables in it that the page gave the copy (page/clipboard/own/chart-keys.mjs): each written with
 * its new value, a table's taken off where it is null.
 */
export function copiedSource(current, unit, { keys = null, taken = null } = {}) {
  const text = current.slice(unit.start, unit.end);
  const cuts = [];
  const fragment = parseFragment(text, { sourceCodeLocationInfo: true });
  // The ids defined in it that it names itself, each with its new name.
  const all = [];
  const gather = (node) => {
    for (const child of node.childNodes ?? []) {
      if (!child.tagName) continue;
      all.push(child);
      gather(child.tagName === "template" ? child.content : child);
    }
  };
  gather(fragment);
  const named = referencedIds(all.flatMap((node) => node.attrs));
  const kept = new Set(all.map((node) => attr(node, "id")).filter((id) => id && named.has(id)));
  const renamed = new Map();
  if (kept.size > 0) {
    const ids = taken ?? new Set(idsOf(current));
    const prefix = freshPrefix(ids);
    for (const id of kept) {
      renamed.set(id, `${prefix}${id}`);
      ids.add(`${prefix}${id}`);
    }
  }
  const visit = (node) => {
    for (const child of node.childNodes ?? []) {
      if (!child.tagName) continue;
      for (const name of [IDENTITY, "id"]) {
        const at = child.sourceCodeLocation?.attrs?.[name];
        if (!at) continue;
        if (name === "id" && renamed.has(attr(child, "id"))) cuts.push({ start: at.startOffset, end: at.endOffset, text: `id="${escapeAttribute(renamed.get(attr(child, "id")))}"` });
        else cuts.push(attributeSpan(text, at.startOffset, at.endOffset));
      }
      // What names a kept id, written to match.
      for (const { name, prefix, value } of renamed.size > 0 ? child.attrs : []) {
        const written = prefix ? `${prefix}:${name}` : name;
        const next = rewrite(written, value, renamed);
        const at = child.sourceCodeLocation?.attrs?.[written];
        if (next !== null && at) cuts.push({ start: at.startOffset, end: at.endOffset, text: `${written}="${escapeAttribute(next)}"` });
      }
      for (const name of [...TABLE_READERS, CHART_SOURCE]) {
        const at = child.sourceCodeLocation?.attrs?.[name];
        const key = attr(child, name);
        if (!at || !keys || !Object.hasOwn(keys, key)) continue;
        if (keys[key] !== null) cuts.push({ start: at.startOffset, end: at.endOffset, text: `${name}="${escapeAttribute(keys[key])}"` });
        else if (name === CHART_SOURCE) cuts.push(attributeSpan(text, at.startOffset, at.endOffset));
      }
      visit(child.tagName === "template" ? child.content : child);
    }
  };
  visit(fragment);
  const copied = cuts.sort((a, b) => b.start - a.start).reduce((out, { start, end, text: put = "" }) => out.slice(0, start) + put + out.slice(end), text);
  return reindent(copied, lineIndent(current, unit.start), ""); // as a deleted unit's source is kept
}

// A moved unit's lines after the first take the indentation of its new place (`to` instead of
// `from`); lines inside <pre>, <textarea>, <script> or <style> are content and stay, and so do those
// inside an instance of a package, all of which is its component's and the Agent's to write.
export function reindent(text, from, to) {
  if (from === null || to === null || from === to || !text.includes("\n")) return text;
  const raw = [];
  const visit = (node) => {
    for (const child of node.childNodes ?? []) {
      if (!child.tagName) continue;
      const location = child.sourceCodeLocation;
      if ((RAW_TEXT.has(child.tagName) || isInstance(child)) && location?.startTag && location.endTag) raw.push([location.startTag.endOffset, location.endTag.startOffset]);
      else visit(child.tagName === "template" ? child.content : child);
    }
  };
  visit(parseFragment(text, { sourceCodeLocationInfo: true }));
  let output = "";
  let offset = 0;
  for (const line of text.split(/(?<=\n)/)) {
    const content = raw.some(([start, end]) => offset > start && offset <= end);
    const empty = line === "\n" || line === "\r\n"; // a blank line stays blank
    output += offset > 0 && !content && !empty && line.startsWith(from) ? to + line.slice(from.length) : line;
    offset += line.length;
  }
  return output;
}

export function lineIndent(text, position) {
  const lead = text.slice(text.lastIndexOf("\n", position - 1) + 1, position);
  return /^[ \t]*$/.test(lead) ? lead : null;
}

export function removeLines(text, start, end) {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const newline = text.indexOf("\n", end);
  const lineEnd = newline < 0 ? text.length : newline + 1;
  const ownLines = /^[ \t]*$/.test(text.slice(lineStart, start)) && /^[ \t]*\r?\n?$/.test(text.slice(end, lineEnd));
  return ownLines ? { start: lineStart, end: lineEnd, text: "" } : { start, end, text: "" };
}

// A unit leaving its place (deleted or moved) takes its lines along, and a blank line next to it
// when that keeps the spacing of the blocks around it: between blank lines one of them goes (the
// one after); at the start or end of its container the one on the inside goes. A blank line
// between it and a neighbour on one side only separates groups of blocks and stays.
export function cutLines(text, start, end) {
  // The last lists of a list item leaving: its end tag comes back to the end of its text, as an
  // item without lists is written, so that the item's text is what it says and no more.
  const tail = /^\s*(?=<\/li\s*>)/i.exec(text.slice(end, end + 400));
  if (tail) return { start: start - /\s*$/.exec(text.slice(Math.max(0, start - 400), start))[0].length, end: end + tail[0].length, text: "" };
  const cut = removeLines(text, start, end);
  if (cut.start === start && cut.end === end) return cut; // shares its lines with other content
  const blankLine = /^[ \t]*\r?\n$/;
  const next = text.indexOf("\n", cut.end);
  const nextBlank = next >= 0 && blankLine.test(text.slice(cut.end, next + 1));
  const previous = text.lastIndexOf("\n", cut.start - 2) + 1;
  const previousBlank = cut.start > 0 && blankLine.test(text.slice(previous, cut.start));
  // What comes right before and after: the container's start tag or end tag, or a neighbour.
  const before = text.slice(0, start).trimEnd();
  const tag = before.endsWith(">") ? before.slice(before.lastIndexOf("<")) : "";
  const first = /^<[a-z]/i.test(tag) && !/\/\s*>$/.test(tag) && !VOID_UNITS.has(tag.match(/^<([a-z0-9-]+)/i)?.[1].toLowerCase());
  const last = /^\s*<\//.test(text.slice(end, end + 200));
  if (nextBlank && (previousBlank || first)) return { ...cut, end: next + 1 };
  if (previousBlank && last) return { ...cut, start: previous };
  return cut;
}
