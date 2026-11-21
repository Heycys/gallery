// A document's look (字体与布局 and 全宽, under the workbench's 更多): its font, the size of its
// text, the spacing of its lines and blocks, the width of its reading column and whether it is shown
// at the full width of the page whatever that is (全宽). The document's own, a field of the document
// as its title is: `look` in its
// doc.json (report.json in a document made before Gallery 0.1), over the workspace's default look,
// `look` in its gallery.json (which the card's 应用到全部文档 writes, every document's own taken away:
// ./workspace-look.mjs), choice by choice (effectiveLook). The workspace's keeps each choice that is
// not the default, the field gone when none is; a doc.json each choice that is not the workspace's,
// the field gone when none is:
//
//   "look": { "font": "serif" | "mixed", "size": "small" | "large", "spacing": "compact" | "loose", "width": "narrow" | "wide", "full": "full", "tables": "wide" }
//
// A doc.json may say a default too ("font": "sans", "size": "default"…): 默认 chosen on a page while
// the workspace's default says otherwise. The look a document shows is never written in doc.html: the
// render puts it on the page's <html> as data attributes
// (withLook, render/report-html.mjs: the preview, 演示视图, a build, an export, its PDF), which the
// kit's tokens read (styles/tokens.css, @kit-look, written by render/look-css.mjs); a page takes a
// change at once (`doc-look-request`, the kit's ui.js: the workbench's choice, sent by the page's
// session, and doc.json changed, said by the preview's live reload). A value it does not know is the
// default. docs/render.md "A document's look" says what each choice does.

import { LOOK_ATTRIBUTES } from "./components/page.mjs";

/** Each choice and its values, the default first. */
export const LOOK = Object.freeze({
  font: Object.freeze(["sans", "serif", "mixed"]), // 等线体, 衬线体, 混合体 (the title and headings serif)
  size: Object.freeze(["default", "small", "large"]), // 字体大小: 小号, 默认, 大号
  spacing: Object.freeze(["default", "compact", "loose"]), // 正文间距: 紧凑, 默认, 宽松
  width: Object.freeze(["default", "narrow", "wide"]), // 正文宽度: 偏窄, 默认, 偏宽
  // 全宽 (the 更多 menu's switch under 目录): the page at the full width of its area, whatever its 正文宽度 is; its attribute is
  // the kit's own data-doc-width="full", the reader's display menu's 全宽显示 too (components/page.mjs LOOK_ATTRIBUTES)
  full: Object.freeze(["default", "full"]),
  // 宽表格 (the 更多 menu's switch under 全宽, the user's 表格跨越边界): a table wider than the text, standing
  // in the body itself (no container's), is centred on its line and goes past the text's edges on both sides, as
  // far as the page's area at full width; past that it scrolls in its frame as ever (the kit's tables/across.js).
  // Its attribute is data-doc-tables="wide" (components/page.mjs LOOK_ATTRIBUTES), the reader's display menu has it too.
  tables: Object.freeze(["default", "wide"]),
});

/** The attribute each choice is on <html> by: the page's description says them (components/page.mjs). */
export { LOOK_ATTRIBUTES };

/**
 * 字体大小: the factor every size of the text takes, and its line height with it (body text 15px, 16px,
 * 18px): the type alone, not the gaps between blocks (正文间距's) nor the column's width (正文宽度's).
 * 14px for 小号 set small text and captions at 11px, too small for Chinese; 17px was hard
 * to tell from 16px.
 */
export const SIZE_FACTOR = Object.freeze({ default: 1, small: 15 / 16, large: 18 / 16 });

/**
 * 正文间距: what a line's leading (its line height less its font size) and the gaps between blocks
 * are taken at (body text's line 24px, 26px, 28px at 16px; a paragraph's gap 9px, 12px, 15px at any
 * 字体大小).
 */
export const SPACING = Object.freeze({
  default: Object.freeze({ leading: 1, gaps: 1 }),
  compact: Object.freeze({ leading: 0.8, gaps: 0.75 }),
  loose: Object.freeze({ leading: 1.2, gaps: 1.25 }),
});

/**
 * 正文宽度: the reading column in px, whatever the 字体大小 (which changes the type alone): 默认 the
 * kit's 712px (tokens.css --doc-content-max-width), 44 characters of Chinese body text to a line at the
 * default 16px; 偏窄 and 偏宽 the widths of 40 and 48 of them (40.5 and 48.5 times 16px, as 712 is 44.5
 * times it). The user counted a line in characters only to fix these widths (2026-11-07: until then
 * they were counted at the size chosen, so 大号 widened the column too). A narrow window narrows it as
 * ever.
 */
export const WIDTH = Object.freeze({ default: 712, narrow: 648, wide: 776 });

/**
 * The serif (衬线体, and 混合体's title and headings): the system's own book serifs, nothing to download
 * (the sidebar's Gallery wordmark is set in the first of them), then the Chinese serifs: Songti SC
 * (macOS), Noto or Source Han Serif where installed, SimSun (Windows).
 */
export const SERIF_FONT = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "Songti SC", "Noto Serif SC", "Noto Serif CJK SC", "Source Han Serif SC", SimSun, serif';

const isPlain = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** A look as kept: the choices `value` makes that are known and not the default, {} for none. */
export function lookOf(value) {
  const look = {};
  if (!isPlain(value)) return look;
  for (const [key, choices] of Object.entries(LOOK)) {
    const chosen = value[key];
    if (typeof chosen === "string" && choices.includes(chosen) && chosen !== choices[0]) look[key] = chosen;
  }
  return look;
}

/** Each choice of a look, the default where it makes none: { font, size, spacing, width, full, tables }. */
export const fullLook = (value) => ({ ...Object.fromEntries(Object.entries(LOOK).map(([key, [first]]) => [key, first])), ...lookOf(value) });

/** Whether two looks are the same. */
export const sameLook = (a, b) => JSON.stringify(lookOf(a)) === JSON.stringify(lookOf(b));

/**
 * A document's own look as its doc.json keeps it: each known choice `value` makes, the default too
 * ("sans", "default": 默认 chosen on a page while the workspace's default look says otherwise), {} for
 * none. lookOf is what it shows of that alone.
 */
export function ownLookOf(value) {
  const look = {};
  if (!isPlain(value)) return look;
  for (const [key, choices] of Object.entries(LOOK)) {
    const chosen = value[key];
    if (typeof chosen === "string" && choices.includes(chosen)) look[key] = chosen;
  }
  return look;
}

/**
 * The look a document shows (lookOf's form: the defaults left out), choice by choice: its own (doc.json's
 * `look`, ownLookOf), else the workspace's default look (gallery.json's `look`, 应用到全部文档), else the
 * default.
 */
export const effectiveLook = (own, workspace) => lookOf({ ...lookOf(workspace), ...ownLookOf(own) });

/**
 * What a document's doc.json keeps for it to show `look` under the workspace's default look
 * `workspace`: each choice that is not the workspace's, a default too (ownLookOf), {} when it shows
 * the workspace's own.
 */
export function ownLookFor(look, workspace) {
  const [shown, base] = [fullLook(look), fullLook(workspace)];
  return Object.fromEntries(Object.keys(LOOK).filter((key) => shown[key] !== base[key]).map((key) => [key, shown[key]]));
}

/** A legacy full-look request: retain explicit choices for fields whose displayed value did not change. */
export function updatedOwnLook(own, workspace, look) {
  const before = fullLook(effectiveLook(own, workspace));
  const after = fullLook(look);
  const changed = ownLookFor(look, workspace);
  const kept = ownLookOf(own);
  for (const key of Object.keys(LOOK)) {
    if (before[key] === after[key]) continue;
    if (Object.hasOwn(changed, key)) kept[key] = changed[key];
    else delete kept[key];
  }
  return kept;
}

/**
 * A document's doc.json (its parsed object) with its own look as given (ownLookOf: an explicit default
 * kept): in the field's place when it had one, else last; the field gone when it makes no choice.
 * Every other field stays as it is.
 */
export function withLookField(metadata, look) {
  const next = ownLookOf(look);
  const keep = Object.keys(next).length > 0;
  const base = isPlain(metadata) ? metadata : {};
  if (!Object.hasOwn(base, "look")) return keep ? { ...base, look: next } : { ...base };
  return Object.fromEntries(Object.entries(base).flatMap(([key, value]) => (key !== "look" ? [[key, value]] : keep ? [[key, next]] : [])));
}

/** The look's attributes on <html>: [name, value] for each choice that is not the default. */
export const lookAttributes = (look) => Object.entries(lookOf(look)).map(([key, value]) => [LOOK_ATTRIBUTES[key], value]);

const ATTRIBUTE_VALUE = String.raw`(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?`;

/**
 * A page's text with the look on its <html> start tag (the first one), as the render serves and
 * exports it: whatever look attributes the file writes there taken off (doc.json is their one home),
 * the look's put on. A page without an <html> tag is returned as it is.
 */
export function withLook(html, look) {
  const text = String(html ?? "");
  const found = /<html\b[^>]*>/i.exec(text);
  if (!found) return text;
  let tag = found[0];
  for (const name of Object.values(LOOK_ATTRIBUTES)) tag = tag.replace(new RegExp(String.raw`\s${name}${ATTRIBUTE_VALUE}(?=[\s/>])`, "gi"), "");
  const added = lookAttributes(look).map(([name, value]) => ` ${name}="${value}"`).join("");
  if (added) tag = tag.replace(/\s*>$/, (end) => `${added}${end.trimStart()}`);
  return text.slice(0, found.index) + tag + text.slice(found.index + found[0].length);
}

/** The look an element (the page's <html>) carries by its attributes. */
export function lookOfElement(element) {
  return lookOf(Object.fromEntries(Object.entries(LOOK_ATTRIBUTES).map(([key, name]) => [key, element?.getAttribute?.(name) ?? undefined])));
}

/** Put a look on an element (the page's <html>) by its attributes; whether anything changed. */
export function setLookOn(element, look) {
  const next = lookOf(look);
  let changed = false;
  for (const [key, name] of Object.entries(LOOK_ATTRIBUTES)) {
    const value = next[key] ?? null;
    if (element.getAttribute(name) === value) continue;
    if (value === null) element.removeAttribute(name);
    else element.setAttribute(name, value);
    changed = true;
  }
  return changed;
}

/** A look as a line's word (the preview's live reload says "look <word>"): "font=serif&size=small", "" for the default. */
export const lookWord = (look) => Object.entries(lookOf(look)).map(([key, value]) => `${key}=${value}`).join("&");

/** The look a word says (lookWord's inverse; anything else the default). */
export const lookOfWord = (word) => lookOf(Object.fromEntries(new URLSearchParams(String(word ?? ""))));
