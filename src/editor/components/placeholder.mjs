import { MEDIA_BLOCKS, MEDIA_CLASS } from "../../shared/components/index.mjs";
import { MENTION_PAGE } from "../../shared/components/mention.mjs";
import { FORMULA_ICON, LINK_ICON, PAGE_ICON } from "./icons.mjs";
import { BLOCK_TYPES } from "./registry.mjs";
import { TEX_MARK } from "../../shared/math-marks.mjs";
import { barClass } from "./placeholder-bar.mjs";
import { inLanguage, t } from "../../shared/i18n/index.mjs";

// What a block or an inline atom left empty shows while the page is edited, to be filled later
// (docs/editor.md, "Empty blocks"); the file has the empty block, which no reader sees:
//
//   - 图片, 文件, 网页书签 and 嵌入 hold a gray bar (each media type's `bar`), a 公式块 is one
//     itself (an empty .doc-math-block, its TeX mark and words drawn before and after it). One look
//     for all five, whatever
//     the block is once filled: the media gap above and below, the bar 12px in (36px at its end), its
//     icon 25px wide and 12px before its words, 14px gray words, corners of 10px, tinted under the
//     pointer; what the editor draws over it (a selected block's fill, overlay-layer.mjs) 6px past
//     it, its corners 16px.
//   - An inline formula, link or page block left empty (data-ge-empty "formula", "link" or "page":
//     \(\), an empty <a class="doc-link-mention">, with data-doc-page for a page block) is a gray chip in the text, its icon and its name inside it
//     (an empty formula: √x 新公式), so that the browser keeps a caret beside it and
//     deletes it as it does a formula; tinted blue while its box or card is open. A formula that does
//     not read (√x 无效的公式) is the same gray chip with those words, as it is typed and once its box
//     is left, its TeX in the file as typed, and a formula block so its gray bar: one look, the box
//     open or not (KaTeX's reason is the box's), and the kit's for a reader (styles/math.css).
//
// All of it is there from the first paint, not once the editor has started: the server serves the
// page so (showEmpty, in the page's own markup) and this look in its head (EMPTY_STYLE: service.mjs
// preview), and the editor makes the same markup for what becomes empty on the page. Their words are
// the UI's language's: the server, which does not know it (the reader's browser keeps it), serves
// them in Chinese, and the page's first script (emptyWordsScript, in its head) says them again in
// English before the page shows when its root says the UI is English (data-ge-language, src/shared/
// i18n languageScript); the look's words (a formula block's) are in both, the root choosing.

/** The media blocks' bars (the `bar` of each one's type), by the class of their figure: each its markup, its words in the language t() says them in. */
export const MEDIA_BARS = Object.defineProperties({}, Object.fromEntries(MEDIA_BLOCKS.filter((id) => BLOCK_TYPES[id]).map((id) => [MEDIA_CLASS[id], { enumerable: true, get: () => BLOCK_TYPES[id].bar() }])));
const EMPTY_MEDIA = new RegExp(`<figure class="(${Object.keys(MEDIA_BARS).join("|")})"([^>]*)>\\s*</figure>`, "g");

// What a formula, link or page block left empty holds, and a formula being edited that does not read: its icon and its words.
const CHIPS = { formula: [FORMULA_ICON, () => t("新公式")], link: [LINK_ICON, () => t("链接")], page: [PAGE_ICON, () => t("页面")], invalid: [FORMULA_ICON, () => t("无效的公式")] };

/** The markup inside a chip of `kind` ("formula", "link", "page"; "invalid"): its icon and its name. */
export const chipHtml = (kind) => `${CHIPS[kind][0]}<span>${CHIPS[kind][1]()}</span>`;

/** Mark `chip` (an inline formula or link) as left empty, of `kind` ("formula", "link" or "page"). */
export function markEmpty(chip, kind) {
  chip.setAttribute("data-ge-empty", kind);
  chip.innerHTML = chipHtml(kind);
}

/**
 * The page as served for editing (service.mjs preview) with what is empty as the editor shows it:
 * an empty media figure holds its bar, an empty formula block nothing (its look is :empty's), an empty
 * inline formula or link its chip; their words in Chinese (emptyWordsScript says them in English).
 */
export function showEmpty(html) {
  return inLanguage("zh", () => html
    .replace(EMPTY_MEDIA, (_, name, rest) => `<figure class="${name}"${rest}>${MEDIA_BARS[name]}</figure>`)
    .replace(/(<div class="doc-math-block"[^>]*>)\s*\\\[\s*\\\]\s*(<\/div>)/g, "$1$2")
    .replace(/<span class="doc-math-inline"([^>]*)>\s*\\\(\s*\\\)\s*<\/span>/g, (_, rest) => `<span class="doc-math-inline"${rest} data-ge-empty="formula">${chipHtml("formula")}</span>`)
    .replace(/<a class="doc-link-mention"([^>]*)><\/a>/g, (_, rest) => {
      const kind = rest.includes(MENTION_PAGE) ? "page" : "link";
      return `<a class="doc-link-mention"${rest} data-ge-empty="${kind}">${chipHtml(kind)}</a>`;
    }));
}

// The words of what showEmpty serves, [Chinese, English] each.
const servedWords = () => {
  const words = () => [
    ...Object.keys(MEDIA_BARS).map((name) => /<span>([^<]*)<\/span><\/div>$/.exec(MEDIA_BARS[name])?.[1] ?? ""),
    ...["formula", "link", "page"].map((kind) => CHIPS[kind][1]()),
  ];
  const [zh, en] = [inLanguage("zh", words), inLanguage("en", words)];
  return zh.map((word, index) => [word, en[index]]).filter(([chinese, english]) => chinese && chinese !== english);
};

/**
 * The script in the head of a page served for editing (service.mjs preview) that says what showEmpty
 * served in English, as the page has loaded and before it shows (the kit holds its first paint till
 * the frame after), when the page's root says the UI is English (data-ge-language): the words of
 * each empty media block's bar and each empty chip.
 */
export function emptyWordsScript() {
  const spans = [...Object.keys(MEDIA_BARS).map((name) => `.${name} > .${barClass(name)} > span`), "[data-ge-empty] > span"].join(", ");
  const run = (pairs, spans) => document.addEventListener("DOMContentLoaded", () => {
    if (document.documentElement.getAttribute("data-ge-language") !== "en") return;
    const english = new Map(pairs);
    for (const span of document.querySelectorAll(spans)) if (english.has(span.textContent)) span.textContent = english.get(span.textContent);
  }, { once: true });
  const json = (value) => JSON.stringify(value).replace(/</g, "\\u003c"); // in a <script>: never a tag
  return `document.currentScript.remove(); (${run})(${json(servedWords())}, ${json(spans)});`;
}

// A gray bar's rules: `block`, the block holding it (its gap and what is drawn over it); `bar`, the
// bar (the block itself for a formula); `icon`, its icon (an svg, or the bar's ::before).
const barStyle = ({ block, bar, icon }) => `
  ${block} { width: 100%; margin-block: var(--doc-media-gap); --doc-box-radius: 10px; --doc-box-reach: 6px; }
  ${bar} { box-sizing: border-box; display: flex; align-items: center; width: 100%; padding: 12px 36px 12px 12px; border-radius: 10px; text-align: start;
    background: var(--ge-field); color: var(--ge-tx2); font-size: 14px; line-height: 1.5; cursor: pointer; user-select: none; transition: background 20ms ease-in; }
  ${bar}:hover { background: var(--ge-hover); }
  ${icon} { flex: none; width: 25px; height: 25px; margin-inline-end: 12px; }`;

// A formula block left empty: served empty, or its chip empty on the page (components/math/page.mjs).
const TEX = '.doc-math-block:is(:empty, [data-ge-kind="tex"]:has(> .ge-math-chip:empty))';
const TEX_INVALID = '.doc-math-block[data-ge-kind="tex"]:has(> .ge-math-chip[data-ge-empty="invalid"]:empty)';
const TEX_MASK = `${TEX_MARK} center / contain no-repeat`;
const CHIP = ":is(.doc-math-inline, .doc-link-mention)[data-ge-empty]";

/** The look of what is empty, in the head of every page the editor edits (service.mjs preview). */
export const EMPTY_STYLE = `${Object.keys(MEDIA_BARS).map((name) => {
  const bar = `.${name} > .${barClass(name)}`;
  // Every bar's icon is one of the editor's line drawings (icons.mjs svg), with no size or color of its own: drawn as its other line icons are.
  return barStyle({ block: `.${name}:has(> .${barClass(name)})`, bar, icon: `${bar} svg` })
    + `\n  ${bar} svg { fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }`;
}).join("")}
  ${barStyle({ block: TEX, bar: TEX, icon: `${TEX}::before` })}
  ${TEX}::before { content: ""; background: currentColor; -webkit-mask: ${TEX_MASK}; mask: ${TEX_MASK}; }
  ${TEX}::after { content: ${JSON.stringify(inLanguage("zh", () => t("添加一个 TeX 公式")))}; }
  :root[data-ge-language="en"] ${TEX}::after { content: ${JSON.stringify(inLanguage("en", () => t("添加一个 TeX 公式")))}; }
  ${TEX_INVALID}::after { content: ${JSON.stringify(inLanguage("zh", () => t("无效的公式")))}; }
  :root[data-ge-language="en"] ${TEX_INVALID}::after { content: ${JSON.stringify(inLanguage("en", () => t("无效的公式")))}; }
  /* One line of inline boxes (not a flex box, whose parts the browser copies as lines of their own). */
  ${CHIP} { display: inline-block; margin: 0 2px; padding: 1px 7px 1px 6px; border-radius: 4px; vertical-align: top; white-space: nowrap;
    background: light-dark(#f0efed, #383836); color: var(--ge-tx2); font-size: .9em; line-height: 1.4; text-decoration: none; cursor: pointer; transition: background 20ms ease-in; }
  :is(${CHIP}) > svg { display: inline-block; width: 1.1em; height: 1.1em; margin-inline-end: 4px; vertical-align: -.2em; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
  :is(.doc-math-inline, .doc-link-mention)[data-ge-empty]:hover { background: light-dark(#e9e8e6, #403f3d); }
  :is(.doc-math-inline, .doc-link-mention)[data-ge-empty]:is([data-ge-formula-edit], [data-ge-link-edit]) { background: var(--ge-fill); }
`;
