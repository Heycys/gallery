import { LINE, WORD, ZWSP, isInlineItem, numberWithUnit } from "../../../shared/inline-spacing.mjs";

// The space between Chinese and a Latin letter or digit, and between inline code or a formula and the
// word beside it (docs/editor.md, "Browser side"): typing puts it in where there is none (autoSpace,
// typing/index.mjs), and an edit that leaves it standing where none belongs takes it out, in the same
// step (the user's of 2026-11-19: letters typed between Chinese characters by mistake, deleted one by
// one, left the two spaces typed around them; a word typed in front of the space after it, Chinese
// typed after the word, left a space between two Chinese characters). One rule for every text block,
// and it reads the text alone, not who wrote the space. A space that stood alone between such a pair
// before the edit, right beside what the edit changed, loses its reason, and goes, in two ways only:
// the edit put Chinese or a Chinese mark beside it, or it deleted the Latin letter, digit, inline code
// or formula beside it; and only when no such pair stands either side of it now and what is on its
// other side is no Latin word, code or formula (that space stays, punctuation typed or not: "Run `npm`,
// install", "C++ 语言": a "+", "#" or "%" after a letter ends a word here, though autoSpace puts no space
// after one). Latin punctuation and symbols typed never take one (a review, 2026-11-20: "(" typed
// before code in English, "." typed after a word by mistake and deleted again). A line break put beside
// it (Enter, Shift+Enter) always takes it: a line's edge is no neighbour. A "、", "／" or "＠" that opens
// the "/" or "@" menu is looked at once the menu is closed: still there, as any Chinese mark; taken by
// the menu with its query, nothing.
// A deletion never takes a space the reader typed there with the space bar (theirs to delete: no
// Backspace lands on the character before it), and typing takes one only for Chinese put beside it,
// as long as the block's text runs on from their typing in this page. Two spaces where one stood go to
// one, never the reader's: a space typed beside the rule's one, or a deletion bringing two of the
// rule's together. Enter takes the rule's space where the line breaks (beside the caret, never one
// across code the caret is in). What the browser does stays its own: the rule runs
// on its input, once a composition is over (compositionend), and only on the spaces beside what changed.

// Chinese (and Japanese kana), and the Latin letters and digits autoSpace spaces them from.
export const HAN = /[\u2e80-\u2eff\u2f00-\u2fdf\u3040-\u309f\u30a0-\u30fa\u30fc-\u30ff\u3100-\u312f\u3200-\u32ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const LATIN = /[A-Za-z0-9]/;
/** Whether characters `a` and `b` (`before` the one ahead of `a`) take a space between them as typed: Chinese beside Latin, not a number and its unit. */
export const needsSpace = (a, b, before) => ((HAN.test(a) && LATIN.test(b)) || (LATIN.test(a) && HAN.test(b))) && !numberWithUnit(a, b, before);

/**
 * Whether a line's text (the words typed just now left out) writes Chinese and Latin letters or digits
 * together more often than apart: typing in it puts no space between them (autoSpace's writtenTogether).
 * A number's unit is no sign either way, nor is a "%" (30%的), a "+" or a "#".
 */
export function writesTogether(text) {
  let close = 0;
  let apart = 0;
  for (let at = 1; at < text.length; at++) {
    if (needsSpace(text[at - 1], text[at], text[at - 2])) close++;
    else if (text[at] === " " && needsSpace(text[at - 1], text[at + 1] ?? "", text[at - 2])) apart++;
  }
  return close > apart;
}

// A word's end as the rule reads a space beside it: a Latin letter or digit, or a "+", "#" or "%" after
// one (C++, C#, 50%: pangu.js's). Only what the rule reads: autoSpace puts no space after one (100+种, 3#楼).
const latinEnd = (a, before) => a !== undefined && (LATIN.test(a) || (/[+#%]/.test(a) && before !== undefined && (LATIN.test(before) || before === "+")));
// A space the rule reads between `a` and `b`: Chinese beside a Latin word, C++'s end too (not a number and its unit).
const joins = (a, b, before) => ((HAN.test(a) && LATIN.test(b)) || (latinEnd(a, before) && HAN.test(b))) && !numberWithUnit(a, b, before);

/** Inline code or a formula, in a line's text (lineText). */
export const ITEM = "\ufffc";
// A chip of the text (a link shown with its icon, a page's chip) or a block the text block holds: no word.
const OTHER = "\u0000";
const SPACE = " ";

// Whether the space between `a` and `b` is one the spacing rule puts there (`before`: the character
// ahead of `a`): Chinese beside Latin, or inline code or a formula beside a word or beside another one.
// None at a line's edge (a regular expression would read undefined as the word "undefined").
const pairs = (a, b, before) => a !== undefined && b !== undefined && (joins(a, b, before) || (a === ITEM && (b === ITEM || WORD.test(b))) || (b === ITEM && WORD.test(a)));
// What keeps the space beside it whatever is typed or deleted on its other side: a Latin word (a letter
// or digit of no Chinese, C++'s end), inline code or a formula (`before`: the character ahead of it).
const english = (character, before) => character !== undefined && (character === ITEM || (WORD.test(character) && !HAN.test(character)) || latinEnd(character, before));
// What deleted beside the space takes its reason away: a Latin letter or digit (C++'s end), code or a formula.
const latinOrItem = (character, before) => character !== undefined && (character === ITEM || latinEnd(character, before));
// The characters that open the "/" and "@" menus (slash-menu/ SLASH, at-menu/ AT): one typed alone is
// looked at once its menu is over, which may take it into a block with its query (createSpacing's park).
const MENUS = new Set(["、", "／", "＠"]);
// Chinese or a Chinese mark (non-Latin punctuation): what, put beside the space, takes its reason away;
// beside a space the reader typed (`mine`), Chinese alone.
const putsAway = (character, mine) => character !== undefined && (HAN.test(character)
  || (!mine && character.charCodeAt(0) > 127 && /\p{P}/u.test(character)));

/** Whether `text[index]` is a space standing alone between a pair the spacing rule spaces. */
export function separates(text, index) {
  if (text[index] !== SPACE || index < 1 || index >= text.length - 1) return false;
  const [a, b] = [text[index - 1], text[index + 1]];
  return a !== SPACE && b !== SPACE && pairs(a, b, text[index - 2]);
}

/**
 * The text of a text block as the rule reads it: its characters in order, a non-breaking space as a
 * space, the editor's pads (pads.mjs) left out, inline code and a formula one ITEM each, a line break
 * or a block it holds a line's end, any other chip (contenteditable) a character of no word, an empty
 * formula or link left out (data-ge-empty: not there, as shared/inline-spacing.mjs has it). `at[index]`:
 * the text node and offset of each character (or the element, offset -1).
 */
export function lineText(host) {
  let text = "";
  const at = [];
  const walk = (parent) => {
    for (const node of parent.childNodes) {
      if (node.nodeType === 3) {
        for (let index = 0; index < node.length; index++) {
          const character = node.data[index];
          if (character === ZWSP) continue;
          text += character === "\u00a0" ? SPACE : character;
          at.push([node, index]);
        }
      } else if (node.nodeType === 1 && !node.hasAttribute("data-ge-empty")) {
        const stands = isInlineItem(node) ? ITEM : LINE.test(node.tagName) ? "\n" : node.hasAttribute("contenteditable") ? OTHER : null;
        if (stands === null) walk(node);
        else {
          text += stands;
          at.push([node, -1]);
        }
      }
    }
  };
  walk(host);
  return { text, at };
}

/** How many characters of `line` (lineText) stand before the point (`container`, `offset`). */
export function indexAt(line, container, offset) {
  const point = container.ownerDocument.createRange();
  try {
    point.setStart(container, offset);
  } catch {
    return line.at.length;
  }
  const end = ([node, index]) => (index >= 0 ? [node, index + 1] : [node.parentNode, Array.prototype.indexOf.call(node.parentNode.childNodes, node) + 1]);
  let low = 0;
  let high = line.at.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    let past;
    try {
      past = point.comparePoint(...end(line.at[middle])) <= 0;
    } catch {
      past = false;
    }
    if (past) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * Where one edit made `before` into `after` (the line's text before and after it): `at` characters
 * the same at the start, then `removed` of `before` in place of `put` of `after`, the rest the same.
 * The edit lies between the selection before it (`start`, `end`) and the caret after it (`caret`, null
 * when not known), which says where it was within a run of the same characters (a space typed next to
 * a space).
 */
export function editOf(before, after, { start = 0, end = before.length, caret = null } = {}) {
  const most = Math.min(before.length, after.length);
  let at = 0;
  const atMost = Math.min(most, start, caret ?? most);
  while (at < atMost && before[at] === after[at]) at++;
  let tail = 0;
  const tailMost = Math.min(most - at, before.length - end, caret === null ? most : after.length - caret);
  while (tail < tailMost && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  return { at, removed: before.length - at - tail, put: after.length - at - tail };
}

/**
 * The spaces of `after` the edit (editOf) leaves without a reason, by the rule: each space right beside
 * what it changed that separated a pair before it (separates), where no pair stands either side of it
 * now, nothing Latin, no code or formula is on its other side, and the edit put Chinese or a Chinese
 * mark beside it or deleted a Latin letter, digit, code or formula beside it; or the edit put a line
 * break beside it, whatever is on its other side, the reader's own too; then, of a run
 * of spaces the edit left two or more in (a space typed beside one, a deletion bringing two together),
 * the rule's ones but one. Never one the reader typed (`own`: indices of `after`) but for Chinese put
 * beside it. Their indices, the last first.
 */
export function stranded(before, after, { at, removed, put }, own = new Set()) {
  if (removed === 0 && put === 0) return [];
  const end = at + put;
  const deleting = put === 0;
  const spacesPut = !deleting && [...after.slice(at, end)].every((character) => character === SPACE);
  // Whether the space at `each` (`was` in `before`), before the edit (`left`) or after it, lost its reason.
  const lost = (each, left, was) => {
    if (each !== (left ? at - 1 : end)) return false; // not right beside the edit
    const edge = left ? after[each + 1] : after[each - 1]; // what the edit left beside it
    if (!deleting && edge === "\n") return true; // a line break (Shift+Enter): the line's edge, as Enter's
    if (english(left ? after[each - 1] : after[each + 1], left ? after[each - 2] : undefined)) return false;
    if (pairs(after[each - 1], after[each + 1], after[each - 2])) return false;
    if (!deleting) return putsAway(edge, own.has(each));
    return !own.has(each) && (left ? latinOrItem(before[was + 1]) : latinOrItem(before[was - 1], before[was - 2]));
  };
  let low = at;
  while (low > 0 && after[low - 1] === SPACE) low--;
  let high = end;
  while (high < after.length && after[high] === SPACE) high++;
  const out = [];
  for (let index = low; index < high;) {
    if (after[index] !== SPACE) {
      index++;
      continue;
    }
    let close = index;
    while (close < high && after[close] === SPACE) close++;
    const run = [];
    for (let each = index; each < close; each++) {
      const typed = each >= at && each < end; // what the edit put in
      const left = each < at;
      const was = typed ? -1 : left ? each : each - put + removed;
      const rule = !typed && separates(before, was);
      run.push({ each, rule, mine: own.has(each), gone: rule && lost(each, left, was) });
    }
    // Two or more left where one stood: the rule's go but one, the reader's and what was typed staying first.
    const kept = run.filter((space) => !space.gone);
    if (kept.length > 1 && (deleting || spacesPut)) {
      const extra = kept.filter((space) => space.rule && !space.mine);
      while (kept.length > 1 && extra.length > 0) {
        const gone = extra.pop();
        gone.gone = true;
        kept.splice(kept.indexOf(gone), 1);
      }
    }
    out.push(...run.filter((space) => space.gone).map((space) => space.each));
    index = close;
  }
  return out.reverse();
}

/**
 * The rule on the page: `before(host, kind)` as an edit begins (the beforeinput of what the browser
 * types or deletes, a cut, compositionstart, a paste), `after(host, kind, data)` once it is done and
 * autoSpace has run (input, compositionend, the paste's insertion), before the step is recorded, so
 * that what goes is part of the step: one undo brings back the space with what was deleted.
 * `kind`: "input" (taken back after the task it came in: an input of the browser follows its
 * beforeinput at once, and one with none, execCommand's, finds none), "composition", "paste".
 * `data`: what was typed, spaces typed alone being the reader's from then on. What was taken is
 * used once: every after() lets it go, matched or not, and so does forget() (an edit no after() follows:
 * what a menu's query is). A "、", "／" or "＠" typed alone is parked instead (after() changes nothing):
 * `parkedHost()` names its block, and `settle(host)`, once no menu is open there, puts the rule to what
 * is there then, from the text before it was typed: nothing when it is gone (a menu took it), else as an
 * after() would; whether anything went (its step to be recorded). The next before() lets a parked one go.
 * `split(host, range)`: Enter, inside its step, before the block splits at the caret: the rule's space
 * right at the break goes, whatever is on its other side, never one when the caret is in code, a formula
 * or a chip (which the break goes through).
 */
export function createSpacing() {
  let taken = null; // the text as an edit began: { host, kind, text, start, end }
  let parked = null; // the same, for a menu's character typed beside it: { host, text, start, end, at, char }
  const typed = new WeakMap(); // host -> { text, at }: the spaces the reader typed, while the text is as it was left

  function before(host, kind = "input") {
    const selection = host.ownerDocument.getSelection();
    if (!selection?.rangeCount) {
      taken = null;
      return;
    }
    const range = selection.getRangeAt(0);
    const line = lineText(host);
    if (typed.get(host) && typed.get(host).text !== line.text) typed.delete(host);
    parked = null;
    const now = { host, kind, text: line.text, start: indexAt(line, range.startContainer, range.startOffset), end: indexAt(line, range.endContainer, range.endOffset) };
    taken = now;
    if (kind === "input") setTimeout(() => { if (taken === now) taken = null; });
  }

  function after(host, kind = "input", data = "") {
    const was = taken;
    taken = null;
    if (!was || was.host !== host || (was.kind === "paste") !== (kind === "paste") || !host.isConnected) return false;
    return apply(host, was, kind !== "paste" ? data : "", true);
  }

  // The rule from `was` (the text as the edit began) to the text now; `mayPark`: a menu's character
  // typed alone is parked rather than looked at.
  function apply(host, was, data, mayPark) {
    const line = lineText(host);
    const selection = host.ownerDocument.getSelection();
    const caret = selection?.rangeCount && selection.isCollapsed && host.contains(selection.anchorNode) ? indexAt(line, selection.anchorNode, selection.anchorOffset) : null;
    const edit = editOf(was.text, line.text, { start: was.start, end: was.end, caret });
    if (mayPark && MENUS.has(data) && edit.removed === 0 && edit.put === 1 && line.text[edit.at] === data) {
      parked = { host, text: was.text, start: was.start, end: was.end, at: edit.at, char: data };
      return false;
    }
    const mine = typed.get(host)?.text === was.text ? typed.get(host).at : [];
    const own = new Set();
    for (const index of mine) {
      if (index < edit.at) own.add(index);
      else if (index >= edit.at + edit.removed) own.add(index - edit.removed + edit.put);
    }
    const out = stranded(was.text, line.text, edit, own);
    // Spaces typed alone are the reader's from now on, but for one typed beside the space after a word,
    // which is that space still (the one it stood beside goes).
    if (out.length === 0 && /^[ \u00a0]+$/.test(data) && edit.put === data.length && edit.removed === 0) {
      for (let index = edit.at; index < edit.at + edit.put; index++) own.add(index);
    }
    for (const index of out) {
      const [node, offset] = line.at[index];
      node.deleteData(offset, 1); // the caret, a live range, moves with the text
    }
    let text = line.text;
    for (const index of out) text = text.slice(0, index) + text.slice(index + 1);
    typed.set(host, { text, at: [...own].map((index) => index - out.filter((gone) => gone < index).length) });
    return out.length > 0;
  }

  function split(host, range) {
    typed.delete(host);
    if (!range.collapsed) return;
    const line = lineText(host);
    if (line.at.some(([node, index]) => index < 0 && node.contains(range.startContainer))) return; // in code, a formula, a chip
    const caret = indexAt(line, range.startContainer, range.startOffset);
    // The space after the caret begins the new line, the one before it ends this one: at a line's edge,
    // whatever is on its other side.
    for (const index of [caret, caret - 1]) {
      if (!separates(line.text, index)) continue;
      const [node, offset] = line.at[index];
      node.deleteData(offset, 1);
    }
  }

  function settle(host) {
    const was = parked;
    if (!was || was.host !== host) return false;
    parked = null;
    if (!host.isConnected || lineText(host).text[was.at] !== was.char) return false; // the menu took it
    return apply(host, was, "", false);
  }

  const forget = () => { taken = null; };
  return { before, after, split, forget, settle, parkedHost: () => parked?.host ?? null };
}
