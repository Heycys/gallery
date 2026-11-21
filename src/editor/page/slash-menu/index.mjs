import { MENU_GROUPS, takesFormula, textFilters } from "../../components/registry.mjs";
import { FORMULA_ICON, LINK_ICON, PAGE_ICON } from "../../components/icons.mjs";
import { caretRect, hostOf } from "../caret.mjs";
import { can, isFirstLine } from "../core.mjs";
import { belowTargets, convertible, typeOf, typedTargets } from "../convert.mjs";
import { rangeAt, rangeOffsets } from "../marks.mjs";
import { createMenu } from "../menu.mjs";
import { offered } from "../offered.mjs";
import { menuRow, variantKeys } from "../page-objects.mjs";
import { recentList } from "../storage.mjs";
import { createTypedField, nothingAfter } from "../typed-field.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// The "/" menu (docs/editor.md, "New blocks and conversions"): "/" (or "、", "／", the same key with a Chinese input method) typed in
// a text block opens a menu of blocks at the caret, filtered by what follows it (label, pinyin,
// initials; while composing too). In a block holding nothing else, a block chosen is what the block
// turns into; in one with text, a new block of the type goes below it (insertBelow), and so it does
// below a flowchart node's first line (its title, which turns into nothing: core.mjs firstLineOf); 公式,
// 链接 and 页面 go where the "/" was. In text no block can come of (a table's cell, a caption, a card's
// title: what takes links, as the "@" menu goes by) it holds those three alone. Unfiltered, the menu
// shows 建议 (the four blocks used last, kept on this computer) and the blocks by group, the
// workspace's component packages the last of those
// (自定义块: variants, "installed:<id>", each named as the reader reads and found by its
// words, offered where a block of its own stands: convert.mjs); filtered, one list. 240px wide, at most min(448px, 40vh)
// high (its rows scroll), below the caret or above it where there is more room; ↑/↓, Enter or Tab
// and Esc work while it is open. It closes when the "/" goes, the caret leaves for another block or
// before the "/", what follows starts with a space or ends with two, or three more characters are
// typed after nothing matched (a "、" in the middle of text, a Chinese list's comma most often, at
// once), none of it while an input method composes. The block handle's "+" opens it with no "/" (in
// the empty block it made: `add`), filtered by what is typed there. The card
// is menu.mjs; markdown/ tells it what is typed. Over the "/…" typed (what is typed after the "+") lies the
// pale field the "@" menu has (typed-field.mjs), drawn over the text and never in
// it, with 输入以搜索 after a lone "/" where nothing follows it and no input method composes (the "+"'s
// empty line says 输入以筛选… by its placeholder: typing/ updatePlaceholder). The card stands under the "/"
// itself, 12px below its line (8px under the "+"'s), wherever the caret has gone along the line.

/** The characters that open the menu: "/", and what the same key types with a Chinese input method. */
export const SLASH = new Set(["/", "、", "／"]);

// The rows not blocks of their own, which go where the "/" was (the 内联 group).
const INLINE = {
  // 公式 is the format bar's (an inline formula; a formula block of its own would be 公式块).
  "inline:formula": { label: t("公式"), icon: FORMULA_ICON, words: "公式 行内公式 gongshi hangneigongshi gs hngs equation inline math latex tex $" },
  "inline:link": { label: t("链接"), icon: LINK_ICON, words: "链接 超链接 lianjie chaolianjie lj link url href" },
  "inline:page": { label: t("页面"), icon: PAGE_ICON, words: "页面 页面块 子页面 yemian yemiankuai ziyemian ym zym page subpage mention" },
};

// Groups of the unfiltered menu: 基本区块, 高级区块 (media, code, tabs and formula blocks: what
// holds more than text; the types' own `menu`, registry.mjs MENU_GROUPS), 自定义块 (what the variants
// are now: the workspace's custom blocks, the group once called 组件), and what is no block under 内联.
const SECTIONS = [
  { title: t("基本区块"), types: () => MENU_GROUPS.basic },
  { title: t("高级区块"), types: () => MENU_GROUPS.advanced },
  { title: t("自定义块"), types: variantKeys },
];

const infoOf = (key) => INLINE[key] ?? menuRow(key);

/**
 * How well a row (a block type, or 公式 / 链接 / 页面) matches what the reader typed after "/": 0 when
 * its name is just that, 1 when one of its words (pinyin, initials, English) is, 2 when one starts
 * with it, 3 when one has it inside; null when none (so "gl" is 高亮块 before 折叠列表's
 * "toggle", "链接" the link before 网页书签, which has the word).
 */
export function matchScore(type, query) {
  const text = query.trim().toLowerCase().replace(/\s/g, "");
  if (!text) return 0;
  const { label, words } = infoOf(type);
  const names = [label.replace(/\s/g, "").toLowerCase(), ...words.split(" ")];
  if (names[0] === text) return 0;
  if (names.includes(text)) return 1;
  if (names.some((name) => name.startsWith(text))) return 2;
  if (names[0].includes(text) || (text.length > 1 && names.some((name) => name.includes(text)))) return 3;
  return null;
}

/** Whether a row matches what the reader typed after "/". */
export const typeMatches = (type, query) => matchScore(type, query) !== null;

// ---------- the blocks used last (建议) ----------

const recent = recentList("gallery-edit:recent-types", { max: 8, valid: (key) => typeof key === "string" && Boolean(infoOf(key)) });

/** The rows chosen last, newest first. */
export const recentTypes = () => recent.read();

/** A row chosen: first among the recent ones. */
export const rememberType = (key) => recent.use(key);

/**
 * The menu's items for `those` (block types, and 公式 / 链接 / 页面 as "inline:formula" / "inline:link" / "inline:page"),
 * but what the reader hid (offered.mjs) and a package's row that went while a card stood open, run(key) choosing one: filtered by `query`, one list; else
 * 建议 and the groups. The block menu's 在下方新建 shows the same (block-menu/). `blocks`: in a block
 * holding nothing but the "/…", whose type it would become — the blocks that match come before what
 * goes in the text (/gs: 公式块, then 公式), as in text the best match comes first (公式, then 公式块).
 */
export function typeItems(those, run, query = "", { blocks = false } = {}) {
  const keys = offered(those).filter(infoOf);
  const rowOf = (key) => ({ ...infoOf(key), run: () => run(key) });
  if (query) {
    // Best match first, the menu's order within each (sort is stable).
    const rank = (key, score) => (blocks && INLINE[key] ? 10 : 0) + score;
    return keys.map((key) => [key, matchScore(key, query)]).filter(([, score]) => score !== null).sort((a, b) => rank(a[0], a[1]) - rank(b[0], b[1])).map(([key]) => rowOf(key));
  }
  const items = [];
  const recent = recentTypes().filter((key) => keys.includes(key)).slice(0, 4);
  if (recent.length > 0) items.push({ title: t("建议") }, ...recent.map(rowOf));
  for (const { title, types } of SECTIONS) {
    const shown = types().filter((key) => keys.includes(key));
    if (shown.length > 0) items.push({ title }, ...shown.map(rowOf));
  }
  const inline = keys.filter((key) => INLINE[key]);
  if (inline.length > 0) items.push({ title: t("内联") }, ...inline.map(rowOf));
  return items;
}

/**
 * convert(host, type, typed): the block, holding nothing but the "/…" typed (`typed`, a range of it),
 * turned into the type (editor.mjs convertHost); insertBelow(host, type, typed): a new block of the
 * type below the block, the typed "/…" taken away; inline.formula(host, typed), inline.link(host,
 * typed) and inline.page(host, typed): a formula, a link or a page block where the "/…" was, its field
 * open. composing():
 * whether an input method is composing (editor.mjs). closed(host): the menu the "+" opened in `host`
 * closed (its hint, 输入以筛选…, goes: typing/ updatePlaceholder). over(): the menu closed, however
 * it was opened, before a row chosen does what it does (typing/spaces.mjs settles a "、" after both).
 */
export function createSlashMenu({ convert, insertBelow, inline, composing = () => false, closed = () => {}, over = () => {} }) {
  const menu = createMenu();
  const typedField = createTypedField("ge-slash", "slash field");
  let slash = null; // { host, at, char, quiet, missed }: the block, where the "/" is (a character offset), which

  const caretOffset = (host) => {
    const selection = getSelection();
    return selection.rangeCount && selection.isCollapsed && host.contains(selection.anchorNode) ? rangeOffsets(host, selection.getRangeAt(0))[1] : null;
  };

  // Where the card stands: under the "/" itself (the caret's place before the "/", that line's top
  // and bottom; the "+" menu's, where it opened), measured anew each time it is
  // placed, so it follows the line as the page scrolls or the line wraps, and never slides along as
  // the reader types (it was the caret's place, 4px before it, until 2026-11-17).
  function rect({ host, at }) {
    let caret = null;
    try {
      caret = caretRect(rangeAt(host, [at, at]));
    } catch {
      caret = null; // the "/" went with the text it stood in: the block's own box
    }
    const box = host.getBoundingClientRect();
    return caret && (caret.top || caret.bottom) ? { left: caret.left, right: caret.left, top: caret.top, bottom: caret.bottom } : { left: box.left, right: box.left, top: box.top, bottom: box.bottom };
  }

  // The "/…" typed (`state`: where the menu opened), as a range of the block, or null when it is not
  // there any more (deleted, or the caret before it). Opened by the handle's "+" (`char` null: no
  // "/"), what is typed from where it opened, nothing at first.
  function typedRange(state) {
    const caret = caretOffset(state.host);
    if (caret === null || caret < state.at || (state.char && caret === state.at)) return null;
    const range = rangeAt(state.host, [state.at, caret]);
    return !state.char || range.toString()[0] === state.char ? range : null;
  }

  // The field over the "/…" typed, 输入以搜索 after a lone "/" (none while an input method composes, nor where
  // words follow it); it follows the line as the page moves (a task of frames.mjs, the page's loop, loaded
  // with the first menu: this module's rows are read where there is no page too), and goes with the menu.
  // Returns whether it stands.
  function paint() {
    const typed = slash && menu.isOpen && slash.host.isConnected ? typedRange(slash) : null;
    if (!typed) {
      typedField.clear();
      return false;
    }
    const bare = Boolean(slash.char) && typed.toString() === slash.char && !composing() && nothingAfter(slash.host, typed);
    typedField.paint(typed, slash.host, bare ? t("输入以搜索") : null);
    return true;
  }
  let follower = null;
  const field = {
    wake() {
      if (follower) return follower.wake();
      import("../frames.mjs").then(({ FOLLOW, task }) => {
        follower ??= task("slash field", { run: () => (paint() ? FOLLOW : false), fail: () => typedField.clear() });
        follower.wake();
      });
    },
  };

  // Whether a block can come of a "/" typed in it: what it turns into, or a block below it.
  const takesBlocks = (host) => convertible(host) || can(host, "split");

  // Whether the block holds nothing but the "/…": then a block chosen is what it turns into (a node's
  // title never: what is chosen goes below it).
  const alone = (host, typed) => !isFirstLine(host) && host.textContent.replace(/\s/g, "") === typed.toString().replace(/\s/g, "") && !host.querySelector("[data-ge-atom]");

  // The rows for what follows the "/"; null closes the menu. While a Chinese input method composes
  // pinyin there, it shows it with its syllables apart ("gs" as "g's" or "g s"): what is looked for is
  // its letters, as Enter puts them in (the menu staying open for a second Enter to choose).
  function rows() {
    const state = slash;
    const { host } = state;
    const typed = typedRange(state);
    if (!typed) return null;
    const written = typed.toString().slice(state.char ? 1 : 0).replace(/ /g, " ");
    const query = composing() ? written.replace(/['\s]/g, "") : written;
    if (/^\s/.test(query) || /\s\s$/.test(query) || (query.length > 16 && !composing())) return null;
    const empty = alone(host, typed);
    const blocks = !takesBlocks(host) ? [] : empty ? typedTargets(host, true) : belowTargets(host);
    const keys = [...blocks, ...(can(host, "links") ? Object.keys(INLINE).filter((key) => key !== "inline:formula" || takesFormula(host)) : [])];
    const found = typeItems(keys, (key) => choose(state, key), query, { blocks: empty }); // the menu closes before a row runs
    if (found.length > 0) {
      slash.missed = null;
      return found;
    }
    // Letters being composed are no text yet: what they turn into is looked for once they do, a
    // package's name that its words do not spell in pinyin among it.
    if (composing()) return found;
    if (slash.quiet) return null; // "甲、乙": a comma, not a menu
    slash.missed ??= query.length;
    return query.length - slash.missed >= 3 ? null : found;
  }

  function open() {
    const found = rows();
    if (!found) {
      slash = null;
      return;
    }
    menu.open(found, rect(slash), {
      label: t("插入块"),
      empty: t("没有结果"),
      width: 240,
      height: Math.min(448, Math.round(innerHeight * 0.4)),
      gap: slash.char ? 12 : 8, // 12px under a typed "/", 8px under the "+"'s empty line
      onClose: () => {
        const added = slash && !slash.char ? slash.host : null;
        slash = null;
        typedField.clear();
        field.wake();
        if (added) closed(added);
        over();
      },
    });
    paint();
    field.wake();
  }

  // The rows follow what is typed after the "/", and the menu its block.
  function update() {
    const found = slash?.host.isConnected ? rows() : null;
    if (found) {
      menu.update(found, rect(slash));
      paint();
      field.wake();
    } else menu.close();
  }

  // The typed "/…" goes, then: the block turns into the type (it held nothing else), a block of the
  // type goes below it, or a formula or link goes where the "/" was.
  function choose(state, key) {
    const { host } = state;
    const typed = typedRange(state);
    menu.close();
    if (!typed || !infoOf(key)) return; // (a package's row, its package gone while the menu stood)
    rememberType(key);
    // Opened by the "+" and nothing typed: the empty block's own type chosen changes nothing (no
    // undo step that does nothing).
    if (!state.char && typed.collapsed && typeOf(host) === key && alone(host, typed)) return;
    if (key === "inline:formula") return inline.formula(host, typed);
    if (key === "inline:link") return inline.link(host, typed);
    if (key === "inline:page") return inline.page(host, typed);
    if (alone(host, typed)) return convert(host, key, typed);
    // At the block's end, the spaces typed before the "/" go with it (they were for the menu).
    const [start, end] = rangeOffsets(host, typed);
    const rest = document.createRange();
    rest.selectNodeContents(host);
    rest.setStart(typed.endContainer, typed.endOffset);
    let from = start;
    if (!rest.toString().trim()) while (from > 0 && /^\s$/.test(rangeAt(host, [from - 1, from]).toString())) from--;
    insertBelow(host, key, from < start ? rangeAt(host, [from, end]) : typed);
  }

  return {
    /**
     * Text typed in `host`, `before` the caret: the menu opens when it ends with a "/" standing at the
     * block's start, after a space, a whole in the text or a character no Latin word or address has
     * ("and/or" and "https:/" open nothing; "、" anywhere), in a text block a block can be made from, or
     * that takes links. `whole`: the block's text. `data`: what was typed, the input's or a composition's
     * end: only a typed "/" opens it (the text inserted starts with it), not one the caret has
     * come to stand after by a deletion, an undo or an arrow key. Returns whether it opened.
     */
    typed(host, before, whole, data) {
      const char = before.at(-1);
      if (!SLASH.has(char) || !SLASH.has(data?.at(-1)) || !textFilters(host) || can(host, "plain") || !(takesBlocks(host) || can(host, "links"))) return false;
      const caret = caretOffset(host);
      if (caret === null) return false;
      const previous = before.at(-2);
      const word = previous !== undefined && !/\s/.test(previous) && /[\x21-\x7e]/.test(previous);
      if (char !== "、" && word && !rangeAt(host, [caret - 2, caret - 1]).cloneContents().querySelector("[data-ge-atom]")) return false;
      slash = { host, at: caret - 1, char, quiet: char === "、" && whole !== char, missed: null };
      open();
      return Boolean(slash);
    },
    /**
     * The menu opened with no "/" typed, at the caret in `host` (an empty block the block handle's
     * "+" made): unfiltered, then filtered by what is typed from there, the
     * rest as after a "/" (a block chosen is what the empty block turns into). Returns whether it opened.
     */
    add(host) {
      const caret = caretOffset(host);
      if (caret === null) return false;
      slash = { host, at: caret, char: null, quiet: false, missed: null };
      open();
      return Boolean(slash);
    },
    /** The block the menu is open in, opened by the "+" (`add`), or null. */
    get adding() { return slash && !slash.char && menu.isOpen ? slash.host : null; },
    update,
    close: () => menu.close(),
    /**
     * Keys while the menu is open, in its block (the caret's: a block a list item holds is edited in
     * the item's element, which the keys go to, hostOf). Returns true when handled.
     */
    key(event) {
      if (!menu.isOpen || hostOf(event) !== slash?.host || event.isComposing || event.keyCode === 229) return false;
      if (!menu.arrow(event)) {
        if ((event.key === "Enter" || event.key === "Tab") && menu.hasChoice) menu.choose();
        else if (event.key === "Escape") menu.close();
        else {
          if (event.key === "Enter") menu.close();
          return false;
        }
      }
      event.preventDefault();
      return true;
    },
    /** The block the menu is open for, or null. */
    get host() { return slash?.host ?? null; },
    contains: (node) => menu.contains(node),
    get nodes() { return [...menu.nodes, ...typedField.nodes]; },
  };
}
