import { escapeText } from "../../../shared/escape.mjs";
import { FOLD_ARROW } from "../../../shared/code-folds.mjs";
import { FOLDED_LINES, LINE_START, NOWRAP, lineStart, validFolded } from "../../../shared/code-lines.mjs";
import { ZWSP } from "../../../shared/inline-spacing.mjs";
import { CODE_ICON } from "../icons.mjs";
import { CODE } from "../kit.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { fenced, labeled } from "../read-rows.mjs";

// 代码块: div.doc-code, a header (its title, .doc-code-title, a text block of plain text; the
// kit's fold arrow, language, copy and wrap beside it) above its pre, whose code is one text block of
// plain text with its line breaks. The kit highlights it
// (code.js) by its data-language, the language the reader picks in the header's menu, else by the
// one it looks like (自动识别: its title's file extension, else its code); folded
// (doc-code--folded) it shows its header alone, and its long lines wrap unless it has
// doc-code--nowrap: classes the reader switches with the header's buttons. Its frame's height is
// a size, past which the code scrolls. Its lines are numbered from its data-line-start (an Agent's
// excerpt numbered as in its file; 1 without one), on the page as by the kit: the editor keeps the
// attribute and never sets it. This module is what it is and its text model, which the save engine
// needs too: what code a code block's text block holds, its line numbers while edited. page.mjs:
// editing it on the page; file.mjs: its markup in report.html.
//
// Where the engines reach it (src/editor/page/ unless named): editor.mjs, typing/ and clipboard/
// (Enter, Tab, typing, a paste, a press on it, the arrow keys reaching it, undo: page.mjs `keys`, `typed`, `type`, `press`, `openAt`, `afterText`), convert.mjs (a block turned into
// code, "```": page.mjs `create`), editor.mjs (a new one highlighted: `onCreated`; Enter on one
// selected: `activate`), core.mjs (its code in a save: `inner`, nodeOf, convertedUnits), clipboard/own/
// (copying it: `clipboard`, and `build` in page.mjs), resize/ (its height: the bottom edge) and page.mjs (its block menu row 显示全部代码),
// hints/ (`readOnly`: an unopened one counts as editable), ../source/ (finding its title and its text: codeBlock;
// LEAVES, leafHtml).
// Its look: the kit's styles/code.css, highlighted by code.js (src/render/kit/).
const COPIED_LANGUAGE = /^[a-z][\w+#.-]{0,23}$/i; // a language as the clipboard may say one
export const CODE_HEIGHT = "--doc-code-height";
export const FOLDED = "doc-code--folded";
export const LANGUAGE = "data-language";
// A language's name as code.js knows it (typescript, python, bash, text…).
const LANGUAGE_NAME = /^[a-z][\w+#.-]{0,23}$/i;
/** Whether a value is a language name as code.js knows them (data-language). */
export const validLanguage = (value) => typeof value === "string" && LANGUAGE_NAME.test(value);
export { FOLDED_LINES, NOWRAP, validFolded };

// What its text and its title can do: stay empty, hold plain text only.
const CODE_CAPS = () => ["empty", "plain"];

// A code block's title, language and lines, as the file holds them.
function readCode(unit, { plain }) {
  const code = unit.querySelector("pre code") ?? unit.querySelector("pre");
  return { title: plain(unit.querySelector(":scope > .doc-code-title")), language: unit.getAttribute(LANGUAGE) ?? "", lines: (code?.textContent ?? "").replace(/\n$/, "").split("\n") };
}

export default {
  name: "code",
  listed: () => t("代码块"),
  readOnly: [
    { rank: 10, at: "pre[data-ge-code], pre[data-ge-open], .doc-code-fold, .doc-code-range, .doc-code-tools", says: null }, // its code opens on a click; its header's buttons work, its range of lines is the kit's (code.js)
    { rank: 20, at: '.doc-code:has(code[contenteditable="true"])', says: null }, // one made on the page or pasted: its code is edited where it is
    { rank: 40, at: "pre, .doc-code", says: t("这个代码块是页面自己生成的，或者写法特殊，暂不能在页面上修改，可以让 Agent 修改。") },
  ],
  units: {
    code: {
      name: t("代码块"),
      match: [{ rank: 100, class: "doc-code" }],
      boxed: true,
      resizable: ".doc-code:is([data-ge-unit], [data-ge-new])", // its bottom edge, also while it is new
      removedEmpty: "anywhere", // from its title or its code
      colors: ["background"],
      sizes: { [CODE_HEIGHT]: { min: 40, max: 4000, px: true, height: true } }, // past it the code scrolls in its frame
      toggles: [FOLDED, NOWRAP], // folded to its header, its long lines scrolled: the header's buttons
      attributes: {
        [LANGUAGE]: validLanguage, // its language, picked in the header's menu
        [FOLDED_LINES]: validFolded, // the lines whose structure is folded, by the arrows left of their numbers
      },
      // gallery read (../read-rows.mjs): a ── row of its language, title and lines, then its code fenced as it is.
      read: {
        name: "代码块",
        rows(node, { tools }) {
          const { title, language, lines } = readCode(node.el, tools);
          const pre = node.el.querySelector(":scope > pre");
          const preLooks = pre ? tools.looks(pre).trim() : "";
          return labeled(node, `代码块${language ? ` · ${language}` : ""}${title ? ` ·「${title}」` : ""} · ${lines.length} 行${tools.looks(node.el, { skip: [LANGUAGE] })}${preLooks ? ` pre ${preLooks}` : ""}`, fenced(language, lines));
        },
        words: (node, { tools }) => readCode(node.el, tools).lines,
        data: (node, { tools }) => {
          const { title, language } = readCode(node.el, tools);
          return { language: language || null, title: title || null, lineStart: lineStart(node.el.getAttribute(LINE_START)) ?? null };
        },
      },
    },
  },
  components: ["doc-code"],
  placeholders: { title: t("请输入代码块名称") }, // what an empty title says while edited
  hosts: {
    code: { name: t("代码块"), caps: CODE_CAPS, opensBefore: false, textFilters: false, closed: true, inner: (element) => escapeText(codeText(element)) }, // Enter stays inside its code, including at the start
    codeTitle: { name: t("代码块标题"), caps: CODE_CAPS, parts: [["code", "title"]] }, // one line; empty, the kit shows 代码块
  },
  types: {
    code: { // its text block is the code element in its pre; its title another
      turn: 14, menu: ["advanced", 17],
      tag: "div", className: "doc-code", kind: "code", inside: "code",
      empty: true, // written with no code too (an empty one stays)
      // Copied with its title, its language when one was picked (not 自动识别) and the number its first
      // line shows, an excerpt numbered as in its file; a page export writes its title too. Its page.mjs
      // makes it again.
      clipboard: {
        kind: "code", claims: ".doc-code",
        read(unit, { plain }) {
          const code = unit.querySelector("pre code") ?? unit.querySelector("pre");
          return { title: plain(unit.querySelector(":scope > .doc-code-title")), language: unit.getAttribute(LANGUAGE) ?? "", lines: (code?.textContent ?? "").replace(/\n$/, "").split("\n") };
        },
        describe(node, { page, plain }) {
          if (!node.matches(".doc-code")) return undefined;
          const text = page("code").textOf(node);
          const title = plain(node.querySelector(":scope > .doc-code-title"));
          const language = codeLanguage(node);
          const first = lineStart(node.getAttribute(LINE_START));
          return text === null ? null : { type: "code", text, ...(title ? { title } : {}), ...(language ? { language } : {}), ...(first ? { lineStart: first } : {}) };
        },
        check: (block, { string }) => string(block.text) && (block.title === undefined || string(block.title, 200)) && (block.language === undefined || (string(block.language) && COPIED_LANGUAGE.test(block.language)))
          && (block.lineStart === undefined || (Number.isInteger(block.lineStart) && lineStart(String(block.lineStart)) === block.lineStart)),
        text: (block) => block.text.split("\n").map(escapeText),
      },
      // What the save engines need of it (core.mjs nodeOf, convertedUnits): its text (the code
      // element), what goes with it (language, folds, height, title, the number its first line shows:
      // a pasted copy of an excerpt), its pre and itself the parts a new one's text blocks are of.
      textHost: (element) => element.querySelector(":scope > pre > code") ?? element,
      extras: (element, { sizeValue, serializeInner }) => {
        const title = codeTitle(element);
        const extras = {
          language: codeLanguage(element),
          folded: codeFolded(element),
          height: sizeValue("code", CODE_HEIGHT, element.style?.getPropertyValue(CODE_HEIGHT) ?? ""),
          // Its title as the server writes it: plain text on one line, ">" escaped too (validTitle).
          title: title ? serializeInner(title).replace(/<br\s*\/?>/g, "").replace(/>/g, "&gt;").replace(/\s+/g, " ").trim() : "",
          lineStart: String(lineStart(element.getAttribute(LINE_START)) ?? ""),
        };
        return Object.fromEntries(Object.entries(extras).filter(([, value]) => value));
      },
      part: "pre, .doc-code",
      label: t("代码块"), icon: CODE_ICON,
      hint: "```", markdown: [{ match: /^```$/, alone: true }], words: "代码块 代码 daimakuai daima dmk dm code pre",
      glance: { row: 7, name: "代码块", write: "`<pre data-title=\"…\"><code class=\"language-…\">`", after: "`div.doc-code[data-language]`", rule: "Text and lists" },
    },
  },
};

// ---------- the text model ----------
// A code block's text block is plain text with its line breaks. While edited it ends with one
// line break of its own, so the browser shows (and lets the caret onto) a last empty line; that
// break is not part of the code.

/** The code a code block's text block holds. */
export function codeText(element) {
  let text = "";
  const visit = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) text += child.data === ZWSP ? "" : child.data;
      else if (child.nodeName === "BR") text += "\n";
      else if (child.nodeType === 1) visit(child);
    }
  };
  visit(element);
  return text.replace(/ /g, " ").replace(/\n$/, "");
}

/** Fill a code block's text block with code, as plain text ending with its own line break. */
export function setCode(element, text) {
  element.textContent = `${text}\n`;
}

/**
 * Open an original code block for editing: the highlighted lines the kit drew make way for its
 * source text, in a `code` element that is the text block (data-ge-block="id"). Returns it.
 */
export function openCode(pre, id, inner) {
  const template = pre.ownerDocument.createElement("template");
  template.innerHTML = inner;
  const host = pre.ownerDocument.createElement("code");
  for (const [name, value] of [["data-ge-block", String(id)], ["data-ge-kind", "code"], ["data-ge-caps", CODE_CAPS().join(" ")], ["contenteditable", "true"], ["spellcheck", "false"]]) {
    host.setAttribute(name, value);
  }
  setCode(host, template.content.textContent);
  pre.replaceChildren(host);
  pre.removeAttribute("data-ge-code");
  pre.setAttribute("data-ge-open", "");
  syncGutter(host);
  return host;
}

// The open code is a span a line (page.mjs highlight: .ge-code-line, each but the first starting
// with the line break before it), marked when its structure folds (--foldable), when it is folded
// (--folded) and when a fold hides it (--hidden).
export const LINE = "ge-code-line";
export const linesOf = (host) => [...host.children].filter((node) => node.classList.contains(LINE));

/**
 * The line numbers beside a code block's code while it is edited (the kit draws them otherwise):
 * a column of their own before the code, never part of it, a number at each line's first row (a
 * wrapped line takes more), none for the lines a fold hides; left of the numbers, as the kit's, a
 * column under the block's own fold arrow for the arrows of the lines that start a structure
 * (ge-code-fold). Its numbers start where the block says (data-line-start, as the kit's: an
 * excerpt numbered as in its file), else at 1. The block's folded lines (data-folded-lines, counted
 * in the block from 1) follow its lines'. No numbers when the block hides them (the column stays).
 * Kept in step as the code's width changes (a window, a column resized).
 */
export function syncGutter(host) {
  const pre = host.closest("pre");
  const block = pre?.closest(CODE.match);
  if (!pre) return;
  const doc = host.ownerDocument;
  const numbered = block?.dataset.lineNumbers !== "false";
  const first = lineStart(block?.getAttribute(LINE_START)) ?? 1;
  const lines = linesOf(host);
  if (block && lines.length > 0) {
    const folded = lines.flatMap((line, index) => line.classList.contains(`${LINE}--folded`) ? [index + 1] : []).join(" ");
    if ((block.getAttribute(FOLDED_LINES) ?? "") !== folded) folded ? block.setAttribute(FOLDED_LINES, folded) : block.removeAttribute(FOLDED_LINES);
  }
  let gutter = pre.querySelector(":scope > .ge-code-gutter");
  if (!gutter) {
    gutter = doc.createElement("span");
    gutter.className = "ge-code-gutter";
    for (const [name, value] of [["aria-hidden", "true"], ["contenteditable", "false"], ["data-doc-dev", ""]]) gutter.setAttribute(name, value);
    pre.prepend(gutter);
  }
  const wraps = !block?.classList.contains(NOWRAP);
  const height = lineHeight(host);
  let rows;
  if (lines.length > 0) {
    rows = lines.map((line, index) => ({
      index,
      rows: line.classList.contains(`${LINE}--hidden`) ? 0 : wraps ? rowsIn(line, height) : 1,
      foldable: line.classList.contains(`${LINE}--foldable`),
      folded: line.classList.contains(`${LINE}--folded`),
    }));
  } else {
    // Not drawn in lines (the kit's highlighter missing): its text's lines.
    const count = codeText(host).split("\n").length;
    const taken = wraps ? rowsOf(host, count, height) : null;
    rows = Array.from({ length: count }, (_, index) => ({ index, rows: taken?.[index] ?? 1, foldable: false, folded: false }));
  }
  const key = `${numbered}|${first}|${rows.map((row) => `${row.rows}${row.foldable ? (row.folded ? "f" : "o") : ""}`).join(",")}`;
  if (gutter.geKey !== key) {
    gutter.geKey = key;
    // Its numbers as wide as its last one, as the kit's; without numbers, the code on its title's line.
    gutter.style.setProperty("--ge-code-digits", String(String(first + rows.length - 1).length));
    gutter.classList.toggle("ge-code-gutter--bare", !numbered);
    gutter.replaceChildren(...rows.filter((row) => row.rows > 0).map((row) => {
      const entry = doc.createElement("span");
      entry.className = "ge-code-row";
      if (row.rows > 1) entry.style.height = `${row.rows * height}px`;
      const arrow = doc.createElement("span");
      arrow.className = row.foldable ? "ge-code-fold" : "ge-code-slot";
      if (row.foldable) {
        arrow.setAttribute("data-line", String(row.index));
        if (row.folded) arrow.setAttribute("data-folded", "");
        arrow.innerHTML = FOLD_ARROW;
      }
      entry.append(arrow);
      if (numbered) {
        const number = doc.createElement("span");
        number.className = "ge-code-number";
        number.textContent = String(first + row.index);
        entry.append(number);
      }
      return entry;
    }));
  }
  watch(host);
}

const lineHeight = (host) => parseFloat(host.ownerDocument.defaultView?.getComputedStyle(host).lineHeight) || 20;

// How many rows a line of the open code takes (its text past the line break it starts with): its
// pieces' rows, 1 while it is not laid out.
function rowsIn(line, height) {
  const range = line.ownerDocument.createRange();
  range.selectNodeContents(line);
  const first = line.firstChild;
  if (first?.nodeType === 3 && first.data.startsWith("\n")) range.setStart(first, 1);
  const rects = [...range.getClientRects()].filter((rect) => rect.height > 0);
  if (rects.length === 0) return 1;
  const top = Math.min(...rects.map((rect) => rect.top));
  return new Set(rects.map((rect) => Math.round((rect.top - top) / height))).size;
}

// How many rows each of a text block's lines takes, by the height of its text (1 each while the
// block is not laid out: folded, hidden).
function rowsOf(host, count, height) {
  const rows = new Array(count).fill(1);
  const view = host.ownerDocument.defaultView;
  if (!view || count > 3000 || host.getClientRects().length === 0) return rows;
  const range = host.ownerDocument.createRange();
  range.setStart(host, 0);
  let line = 0;
  const measure = () => {
    const taken = Math.round(range.getBoundingClientRect().height / height);
    if (taken > 1) rows[line] = taken;
    line++;
  };
  const walker = host.ownerDocument.createTreeWalker(host, 4); // its text nodes
  for (let node = walker.nextNode(); node && line < count; node = walker.nextNode()) {
    for (let at = node.data.indexOf("\n"); at >= 0 && line < count; at = node.data.indexOf("\n", at + 1)) {
      range.setEnd(node, at);
      measure();
      range.setStart(node, at + 1);
    }
  }
  if (line < count) {
    range.setEnd(host, host.childNodes.length);
    measure();
  }
  return rows;
}

// Text blocks whose line numbers follow their width (wrapped lines take more or fewer rows).
const watched = new WeakSet();
let resizes = null;
function watch(host) {
  const view = host.ownerDocument.defaultView;
  if (watched.has(host) || !view?.ResizeObserver) return;
  resizes ??= new view.ResizeObserver((entries) => {
    for (const { target } of entries) if (target.isConnected) syncGutter(target);
  });
  watched.add(host);
  resizes.observe(host);
}

/** The baseline of a code block not opened yet: its source text as a save would write it. */
export function codeBaseline(inner, doc = globalThis.document) {
  const template = doc.createElement("template");
  template.innerHTML = inner;
  return escapeText(template.content.textContent);
}

/** The language a code block has of its own (its data-language: picked, not 自动识别), or null. */
export function codeLanguage(node) {
  const value = node?.closest?.(CODE.match)?.getAttribute(LANGUAGE) ?? "";
  return validLanguage(value) ? value : null;
}

/** The lines a code block has folded, as written (its data-folded-lines), or null. */
export function codeFolded(node) {
  const value = node?.closest?.(CODE.match)?.getAttribute(FOLDED_LINES) ?? "";
  return validFolded(value) ? value : null;
}

/** A code block's pre and title, found as its shared description says (src/shared/components/code.mjs). */
/** Whether a text block is a code block's code. */
export const isCode = (host) => host?.getAttribute("data-ge-kind") === "code";
export const codePre = (block) => block?.querySelector(CODE.pre) ?? null;
export const codeTitle = (block) => block?.querySelector(CODE.title) ?? null;
