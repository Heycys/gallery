import { boxKind, can, isEmpty, isFirstLine, limitText, ownHTML } from "../core.mjs";
import { editable, select, selectionContext } from "../caret.mjs";
import { turnTargets, typeOf } from "../convert.mjs";
import { formulaBoxNode, openFormula } from "../formula/index.mjs";
import { linkAround, linkBoxNode, openLink } from "../links/index.mjs";
import { formatRange, markAround, markValue, rangeAt, rangeOffsets } from "../marks.mjs";
import { pageOfType } from "../page-objects.mjs";
import { textAnchor } from "../placement.mjs";
import { ZWSP, spaceAround } from "../../../shared/inline-spacing.mjs";
import { createFormatBar } from "./bar.mjs";
import { brushed, currentEffects, describeEffects, effectChanges, noteEffects } from "./brush.mjs";
import { useColor } from "./colors.mjs";
import { FROM_SELECTION, isLead, takesFormula } from "../../components/registry.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// Inline formatting (docs/editor.md, "Inline formatting"): the bar over selected text (bar.mjs:
// the format brush, the colors, bold, underline, clearing the format, inline code, a formula, and
// under "更多" a link, strikethrough, italic, a detail card and 批注; and the block's type to turn it
// into another) shows once the mouse is released over a selection inside one block that takes marks,
// and the keys (FORMAT_KEYS, SHIFT_KEYS). Bold, italic, strikethrough, underline (Ctrl+U: red, 2px)
// and inline code toggle; a color, or an underline's color or weight, picked in a panel sets a kit
// class; clearing takes all of them off (links stay). Each change goes through marks.mjs
// formatRange as one undo step that brings its selection back, and is remembered by the format
// brush (brush.mjs), which its button (and Ctrl+Shift+H) puts on other text. The link item opens
// the link box (links/), the formula button the formula box (formula/); the card item makes the
// selected text the entry of a new detail card (components/dialog/page.mjs); turning the block goes
// through the editor's conversion (convert.mjs, one undo step).
// Text selected across blocks (text-select/: body text, headings, list items) has the bar too, once
// the press ends: a format goes on each block's piece of it (a toggle on unless every piece has it),
// one undo step, the selection drawn again over it. Its blocks' types are there too when it holds
// nothing but text ("多个类型" for a mix), turned together (editor.mjs convertAll, one
// undo step) and the selection drawn again over their text where it is then. The link, the formula
// and the card are not for several blocks, their buttons off.

/** Ctrl (⌘) + these keys format the selected text. */
export const FORMAT_KEYS = { b: "bold", i: "italic", u: "underline", e: "code" };
/** Ctrl (⌘) + Alt + \ clears the format (Ctrl+\ alone is the workbench's sidebar). */
const CLEAR_KEY = "\\";
/** Ctrl (⌘) + Shift + these keys. */
const SHIFT_KEYS = { s: "strike", x: "strike", e: "formula", h: "brush" };

// The formats a caret with nothing selected keeps for the next text typed there (pending formats):
// the toggles, by what they are called in the status line. A flowchart node's empty
// first line keeps bold so by itself (armed: its title is bold by default, <p><strong>…</strong></p>,
// the <strong> real markup the reader may take off): a new node, one emptied, one a conversion made.
const CARRIED = { bold: t("加粗"), italic: t("斜体"), underline: t("下划线"), strike: t("删除线"), code: t("行内代码") };

// What "清除格式" takes off: every mark the bar sets but links.
const CLEAR = [["bold", false], ["italic", false], ["underline", false], ["strike", false], ["code", false], ["text", null], ["highlight", null]];
// The format a change touches, as the brush remembers it (inline code it does not).
const FACET = { bold: "bold", italic: "italic", strike: "strike", text: "text", highlight: "highlight", underline: "underline", underlineColor: "underline", underlineWeight: "underline" };

/**
 * active(): whether the bar may show (editing, no input method composing). say: the status line.
 * recordStep(host, before, selection): a change of a block's text as its own undo step
 * (history.mjs).
 * convert(host, type): turn a text block into another type (editor.mjs convertHost).
 * struct(parents, touched, mutate): the editor's undoable change of several blocks (history.mjs).
 * cross: the selection across blocks (text-select/): texts() its pieces ({ host, range }) or null,
 * wholes() the blocks it takes whole, redraw(texts) once they are formatted, reselect(texts) once
 * they are turned (false when it let go). turnIntoAll(hosts): what text blocks can be turned into
 * together ({ types, current, first }, convert.mjs groupTargets), convertAll(hosts, type) turns
 * them (editor.mjs: its outcome, `hosts` where each one's text is now, or null); selectBlocks(units).
 * annotates(): whether the selection now can be annotated (annotate/: "更多" shows its 批注);
 * annotate() does it.
 */
export function createFormatting({ active, say, recordStep, struct, convert, cross, turnIntoAll = () => null, convertAll = () => null, selectBlocks = () => {}, annotates = () => false, annotate = () => {} }) {
  let pointerHeld = false; // the bar waits until the mouse is released
  let pressKept = false; // the press is a component's: released, it brings no bar back
  let pending = false;
  let carry = null; // { host, at, marks: Map(name -> on), armed? }: the formats the next text typed at the caret `at` (visible characters into the block) takes
  let declined = null; // the empty first line whose armed bold the reader let go (Ctrl+B, the bar): not armed again until the caret leaves it or something is typed
  let shownFor = null; // the selection the bar shows for ({ host, at }): its panels go when it moves on

  // changes: [[name, value]], applied in order as one undo step. value undefined toggles
  // bold/italic/underline/strike/code; true or false sets it; a color name or null sets (or
  // removes) text color or highlight. What it leaves on the text is remembered by the brush, unless
  // it is the brush being put on (`brushing`). Returns whether it applied.
  function format(changes, brushing = false) {
    const context = selectionContext();
    const pieces = context ? null : crossPieces();
    if (pieces) return formatPieces(pieces, changes);
    if (!context) return void carryFormat(changes);
    const { host } = context;
    let { range } = context;
    if (can(host, "plain")) return void say(limitText(host, "format"));
    if (changes.some(([name, value]) => name === "code" && value !== false) && range.cloneContents().querySelector("[data-ge-atom]")) return void say(t("公式和带图标的链接不能放进行内代码。"));
    const before = ownHTML(host);
    for (const [name, value] of changes) {
      range = formatRange(host, range, name, value === undefined ? markValue(host, range, name) !== true : value);
    }
    // Text made inline code stands a space apart from the words beside it (shared/inline-spacing.mjs spaceAround).
    if (changes.some(([name]) => name === "code") && markValue(host, range, "code") === true) {
      [...host.querySelectorAll("code")].filter((code) => range.intersectsNode(code)).forEach(spaceAround);
    }
    select(range);
    const offsets = rangeOffsets(host, range);
    if (ownHTML(host) !== before) recordStep(host, before, offsets);
    const at = { start: offsets[0], end: offsets[1] };
    if (brushing) brushed(host, at);
    else {
      const touched = {};
      for (const facet of new Set(changes.map(([name]) => FACET[name]).filter(Boolean))) touched[facet] = facetOn(host, range, facet);
      if (Object.keys(touched).length > 0) noteEffects(host, at, touched);
    }
    schedule();
    return true;
  }

  // The pieces of the selection across blocks that take marks (not a plain block's, not an empty
  // one at a block's end), or null.
  function crossPieces() {
    const pieces = cross.texts()?.filter(({ host, range }) => !range.collapsed && !can(host, "plain"));
    return pieces?.length > 0 ? pieces : null;
  }

  // `changes` on each piece of the selection across blocks, one undo step (a toggle on unless every
  // piece has it), the selection drawn again over them. The brush remembers the first piece's.
  function formatPieces(pieces, changes) {
    if (changes.some(([name, value]) => name === "code" && value !== false) && pieces.some(({ range }) => range.cloneContents().querySelector("[data-ge-atom]"))) return void say(t("公式和带图标的链接不能放进行内代码。"));
    const values = changes.map(([name, value]) => [name, value === undefined ? !pieces.every(({ host, range }) => markValue(host, range, name) === true) : value]);
    const hosts = pieces.map(({ host }) => host);
    let done = pieces;
    const result = struct([], hosts, () => {
      done = pieces.map(({ host, range }) => {
        for (const [name, value] of values) range = formatRange(host, range, name, value);
        if (values.some(([name, value]) => name === "code" && value)) [...host.querySelectorAll("code")].filter((code) => range.intersectsNode(code)).forEach(spaceAround);
        return { host, range };
      });
      return { touched: hosts, focus: null };
    });
    if (!result) return false;
    cross.redraw(done);
    const [{ host, range }] = done;
    const [start, end] = rangeOffsets(host, range);
    const touched = {};
    for (const facet of new Set(changes.map(([name]) => FACET[name]).filter(Boolean))) touched[facet] = facetOn(host, range, facet);
    if (Object.keys(touched).length > 0) noteEffects(host, { start, end }, touched);
    schedule();
    return true;
  }

  // The visible characters (no pads) between the block's start and a point.
  function charsBefore(host, node, offset) {
    const before = document.createRange();
    before.setStart(host, 0);
    before.setEnd(node, offset);
    return before.toString().replaceAll(ZWSP, "").length;
  }

  // With nothing selected a toggle (bold, italic, underline, strikethrough, code) is kept for the next
  // text typed at the caret: pressed again it is let go; the caret
  // moving elsewhere forgets it (moved); the text typed takes it (typed).
  function carryFormat(changes) {
    const selection = getSelection();
    const host = selection.rangeCount && selection.isCollapsed ? editable(selection.anchorNode) : null;
    const [[name, value] = []] = changes;
    if (!host || changes.length !== 1 || value !== undefined || !CARRIED[name]) return void say(t("先选中要设置格式的文字。"));
    if (can(host, "plain")) return void say(limitText(host, "format"));
    const at = charsBefore(host, selection.anchorNode, selection.anchorOffset);
    const armed = Boolean(carry?.armed && carry.host === host);
    if (carry?.host !== host || carry.at !== at) carry = { host, at, marks: new Map() };
    const now = carry.marks.get(name) ?? markAround(host, selection.anchorNode, name);
    if (now === markAround(host, selection.anchorNode, name)) carry.marks.set(name, !now);
    else carry.marks.delete(name);
    const asked = [...carry.marks].map(([each, on]) => (on ? CARRIED[each] : t("不{0}", CARRIED[each])));
    if (asked.length === 0) {
      carry = null;
      if (armed) declined = host; // the title's bold let go: it stays so while the caret is here
    }
    say(asked.length > 0 ? t("接着打的字：{0} · 再按一次取消", asked.join("、")) : t("接着打的字照旧"));
  }

  // The text just typed (`data`, the caret right after it): it takes the formats the caret kept, and
  // the caret goes on after it. Whatever was typed, the caret's memory is spent.
  function typed(host, data) {
    const asked = carry;
    carry = null;
    declined = null; // bold let go in an empty title holds for what is typed next only: emptied again, it is armed again
    const selection = getSelection();
    const node = selection.anchorNode;
    if (!asked || asked.host !== host || !data || !selection.rangeCount || !selection.isCollapsed || node?.nodeType !== 3 || !host.contains(node)) return;
    const start = selection.anchorOffset - data.length;
    if (start < 0 || node.data.slice(start, selection.anchorOffset) !== data || charsBefore(host, node, start) !== asked.at) return;
    let range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, selection.anchorOffset);
    for (const [name, on] of asked.marks) range = formatRange(host, range, name, on);
    if (asked.marks.get("code")) [...host.querySelectorAll("code")].filter((code) => range.intersectsNode(code)).forEach(spaceAround);
    range.collapse(false);
    select(range);
  }

  // The caret moved off the place that kept a format (an input method composing may move it freely);
  // in a flowchart node's empty first line, bold is armed (arm).
  function moved() {
    if (carry) {
      const selection = getSelection();
      const node = selection.anchorNode;
      if (!selection.rangeCount || !selection.isCollapsed || editable(node) !== carry.host || charsBefore(carry.host, node, selection.anchorOffset) !== carry.at) carry = null;
      else if (carry.armed && !armable(carry.host)) carry = null; // no title of a node any more (moved out, written in)
    }
    arm();
  }

  // A flowchart node's empty first line, which takes marks: what is typed there is bold (core.mjs firstLineOf).
  const armable = (host) => isFirstLine(host) && isEmpty(host) && !can(host, "plain");

  // Bold armed at a caret in a node's empty first line, as Ctrl+B with nothing selected arms it (the
  // reader's Ctrl+B there lets it go, `declined`, until the caret leaves the line or something is typed).
  function arm() {
    const selection = getSelection();
    const host = selection.rangeCount && selection.isCollapsed ? editable(selection.anchorNode) : null;
    if (declined && declined !== host) declined = null;
    if (carry || !host || host === declined || !armable(host)) return;
    carry = { host, at: 0, marks: new Map([["bold", true]]), armed: true };
  }

  // A format as the selected text has it now: true, a color, an underline's { color, weight }, or
  // false / null when it is not on all of it.
  function facetOn(host, range, facet) {
    if (facet === "text" || facet === "highlight") return markValue(host, range, facet);
    if (facet !== "underline") return markValue(host, range, facet) === true;
    if (markValue(host, range, "underline") !== true) return false;
    return { color: markValue(host, range, "underlineColor") ?? "default", weight: markValue(host, range, "underlineWeight") ?? "default" };
  }


  // A button of the bar, or a key.
  function run(command, value) {
    const context = selectionContext();
    const makes = FROM_SELECTION.some(({ type }) => type === command);
    if (!context && crossPieces() && (makes || ["link", "formula"].includes(command))) return say(t("选中的文字跨了几块：链接、公式和详情卡片只能加在一块里的文字上。"));
    if (command === "link") return context ? openLink(context.host) : say(t("先选中要加链接的文字。"));
    if (command === "formula") return context ? openFormula(context.host) : say(t("先选中要变成公式的文字。"));
    if (makes) return pageOfType(command).fromSelection(); // a block made from the selected text
    if (command === "annotate") return annotate();
    if (command === "turn") {
      if (!context) return turnAcross(value);
      bar.hide();
      return convert(context.host, value);
    }
    if (command === "clear") return format(CLEAR);
    if (command === "text" || command === "highlight") {
      useColor(command, value);
      return format([[command, value]]);
    }
    // The format brush (and Ctrl+Shift+H): the formats it remembers on the selected text.
    if (command === "brush") {
      const effects = currentEffects();
      if (Object.keys(effects).length === 0) return say(t("还没有可应用的格式：先给一段文字设置格式，再选中别的文字点它。"));
      if (format(effectChanges(effects), true)) say(t("已应用{0} · Ctrl+Z 撤销", describeEffects(effects)));
      return;
    }
    format([[command, value]]);
  }

  const bar = createFormatBar(run);

  // The bar follows the selection, once what changed it is done.
  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      update();
    }, 0);
  }

  // The panels go when the selection the bar shows for moves on.
  function showingFor(host, at) {
    if (shownFor && (shownFor.host !== host || shownFor.at !== at)) bar.closeSub();
    shownFor = { host, at };
  }

  function update() {
    const free = active() && !pointerHeld && !linkBoxNode() && !formulaBoxNode();
    const context = free ? selectionContext() : null;
    const pieces = free && !context ? crossPieces() : null;
    if (pieces) return showAcross(pieces);
    if (!context || can(context.host, "plain") || context.host.hasAttribute("data-ge-part")) return bar.hide();
    const { host, range } = context;
    showingFor(host, rangeOffsets(host, range).join());
    const types = turnTargets(host);
    const mark = (name) => markValue(host, range, name);
    const code = mark("code") === true;
    bar.show(textAnchor(range), {
      bold: mark("bold") === true,
      italic: mark("italic") === true,
      underline: mark("underline") === true,
      strike: mark("strike") === true,
      code,
      text: mark("text"),
      highlight: mark("highlight"),
      underlineColor: mark("underlineColor"), // "default" (the red), a color, or null (not one throughout)
      underlineWeight: mark("underlineWeight"),
      link: Boolean(linkAround(host, range)),
      links: can(host, "links"),
      fromSelection: can(host, "links") && Boolean(document.querySelector("main[data-ge-box]")),
      formula: !code && takesFormula(host), // over a formula: edits it
      annotates: annotates(),
      block: types.length > 0 ? { current: typeOf(host), types } : null,
    });
  }

  // The text blocks of the selection across blocks, when it holds nothing but text (no block taken
  // whole: a selection is turned only when every piece of it is a block's text; a highlight block's
  // icon it goes over, its box's lead, is no block of the body), and what they can be turned into
  // together ({ hosts, types, current, first }), or null. A block it only touches at its start
  // (nothing of it selected) is not among them; an empty one it goes over is.
  function crossTurn() {
    const pieces = cross.texts();
    const lead = (unit) => isLead(boxKind(unit.parentElement), unit.getAttribute("data-ge-unit-kind"));
    if (!pieces || (cross.wholes?.() ?? []).some((unit) => !lead(unit))) return null;
    const hosts = [...new Set(pieces.filter(({ host, range }) => !range.collapsed || isEmpty(host)).map(({ host }) => host))];
    const turn = hosts.length > 0 ? turnIntoAll(hosts) : null;
    return turn && { ...turn, hosts };
  }

  // The blocks of the selection across blocks turned into `type` together (one undo step), the
  // selection drawn again over their text where it is now; blocks
  // that hold no text of the body then (a disclosure, code) are selected instead.
  function turnAcross(type) {
    const turn = crossTurn();
    if (!turn) return;
    const pieces = cross.texts().map(({ host, range }) => ({ host, offsets: rangeOffsets(host, range) }));
    const outcome = convertAll(turn.hosts, type);
    if (!outcome) return;
    const texts = pieces.map(({ host, offsets }) => {
      const now = outcome.hosts.get(host) ?? host;
      return now?.isConnected ? { host: now, range: rangeAt(now, offsets) } : null;
    }).filter(Boolean);
    if (!cross.reselect(texts)) selectBlocks(outcome.units);
    schedule();
  }

  // The bar for text selected across blocks: what every piece has on (a color the same in all of
  // them), by the end of its last piece, and the types its blocks can be turned into together; no
  // link, formula or card.
  function showAcross(pieces) {
    showingFor(pieces[0].host, pieces.map(({ host, range }) => rangeOffsets(host, range).join()).join("|"));
    const all = (name) => pieces.every(({ host, range }) => markValue(host, range, name) === true);
    const same = (name) => {
      const values = pieces.map(({ host, range }) => markValue(host, range, name));
      return values.every((value) => value === values[0]) ? values[0] : null;
    };
    const whole = document.createRange();
    whole.setStart(pieces[0].range.startContainer, pieces[0].range.startOffset);
    whole.setEnd(pieces.at(-1).range.endContainer, pieces.at(-1).range.endOffset);
    const underline = all("underline");
    const turn = crossTurn();
    bar.show(textAnchor(whole), {
      bold: all("bold"), italic: all("italic"), underline, strike: all("strike"), code: all("code"),
      text: same("text"), highlight: same("highlight"),
      underlineColor: underline ? same("underlineColor") : null, underlineWeight: underline ? same("underlineWeight") : null,
      link: false, links: false, fromSelection: false, formula: false, annotates: annotates(), block: turn && { current: turn.current, types: turn.types, first: turn.first },
    });
  }

  return {
    format,
    typed,
    moved,
    /** Whether bold is armed at the caret (a flowchart node's empty first line), for the tests. */
    get armed() { return Boolean(carry?.armed && carry.marks.get("bold")); },
    schedule,
    hide: () => bar.hide(),
    /** Keys in text: Esc closes the bar's panel, else the bar; the format keys. Returns true when handled. */
    key(event) {
      const ctrl = event.ctrlKey || event.metaKey;
      const mod = ctrl && !event.altKey;
      const key = event.key.toLowerCase();
      const name = ctrl && event.altKey && !event.shiftKey && key === CLEAR_KEY ? "clear" : !mod ? null : event.shiftKey ? SHIFT_KEYS[key] : FORMAT_KEYS[key];
      if (event.key === "Escape" && bar.visible) {
        event.preventDefault();
        if (!bar.closeSub()) bar.hide();
      } else if (name) {
        event.preventDefault();
        run(name);
      } else return false;
      return true;
    },
    /**
     * A press on the page (`main`: the main button): the bar hides until it is released. One a component
     * keeps (`kept`: on its button, on what it draws) is none the editor answers: released, it brings no
     * bar back over words selected before it, which the press did not move.
     */
    pressed(main, kept = false) {
      pointerHeld = main;
      pressKept = kept;
      bar.hide();
    },
    /** The press ended. */
    released() {
      pointerHeld = false;
      if (!pressKept) schedule();
      pressKept = false;
    },
    /** Whether a node is part of the bar. */
    holds: (node) => bar.holds(node),
    get visible() { return bar.visible; },
    get node() { return bar.node; },
  };
}
