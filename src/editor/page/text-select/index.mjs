import { chipBox } from "../chip-fills.mjs";
import { DETAILS, DIALOG } from "../../components/kit.mjs";
import { boxRole } from "../../components/registry.mjs";
import { UNIT, can, isEmpty, isHost, mergeInto, partsOf, removalTarget, takeOut, textEnd, unitElement } from "../core.mjs";
import { atomOf, caretAt, caretAtOffset, dragPlace, editable, hosts, pointRange, select } from "../caret.mjs";
import { edgeFollower } from "../edge-scroll.mjs";
import { FOLDED } from "../folded.mjs";
import { gapScore } from "../geometry.mjs";
import { endsGesture, gestureLock } from "../gesture.mjs";
import { joinCode } from "../marks.mjs";
import { own } from "../overlays.mjs";
import { keptByComponent } from "../page-objects.mjs";
import { addStyle, element } from "../ui.mjs";
import { Z } from "../../../shared/layers.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// Selecting text across blocks: a press in text dragged into other blocks selects the text
// between. Each block is a text
// block of its own here, and the browser keeps a selection inside one, so once the pointer leaves
// the block the press began in, the page takes the selection over: from where the press began to the
// text under the pointer (or the nearest block's, beside or between blocks; the page scrolls near
// the window's edges), drawn with the CSS Custom Highlight API in the selection's own colors, the
// browser's selecting held off meanwhile; back in that block, the browser's again. Shift+click in
// another block selects from the caret to there.
// Its text is that of body text, headings and list items (in quotes, highlight blocks, callouts, columns…),
// and the page's title's, which a deletion takes its part of but never joins with the body's (a
// selection runs from the page's title into the blocks; the user's: what is left of the body stays in the body).
// A block holding none (a code block, a table, a file, an image, a formula block, a
// divider…) is taken whole as it passes it, filled as a selected block is (selection/ mark), its
// own text not marked: over one, an end of the selection stands before it or after it, as the drag
// goes, and a press begun in one (its code, a cell) takes it whole once it has left it.
// The selection stays after the press: Ctrl+C copies it (its blocks, each of its type, the first and
// the last partly: clipboard/ copyAcross), Ctrl+X too and deletes it; Backspace, Delete, typing,
// Enter and a paste delete it first (the first block keeps its text before the selection and takes
// the last block's after it; the blocks between go, those taken whole among them; one undo step),
// Esc selects its blocks, an arrow collapses it. The format
// bar shows for it once the press ends (format-bar/: its text formatted, piece by piece, one undo
// step; its blocks turned into another type together, drawn again over them; no link, formula or
// card), and its keys format it too; a press on the bar keeps it. Ctrl+A selects the blocks of the
// first container holding all it touches (select-all/). Anything else (a press, Ctrl+Z) lets it go.

const NAME = "ge-cross"; // its ranges (what it holds; the scenarios read them), drawn by the strips below
const SHOWN = "ge-cross-shown"; // the same, drawn by the browser: in a modal dialog, which the page's layer is under
// Selected text looks the same in a block (the browser's) and across blocks (the page's), whatever
// the system's colors: the text keeps its color on the palette's selection blue (as the link box's stand-in, links/).
// The browser draws a selection a line high, so its lines meet; a highlight (the CSS Custom Highlight
// API) only as high as the letters, which leaves a gap between lines. So across blocks the page draws
// it as the browser does: a strip a line high over each line of each block's selected text (from its
// first letter to its last), in a layer of its own at the page's origin (it scrolls with the page)
// blended over the page, so the text keeps its color and the blue is the browser's (the palette's
// selection strip: multiplied on a light page, screened on a dark one).
const SELECTED = "var(--ge-select)";
const STYLE = `
  ${gestureLock("data-ge-cross", { select: true })}
  :is([data-ge-block], [data-ge-new])::selection, :is([data-ge-block], [data-ge-new]) ::selection { color: inherit; background-color: ${SELECTED}; }
  ::highlight(${NAME}) { color: inherit; background-color: transparent; }
  ::highlight(${SHOWN}) { color: inherit; background-color: ${SELECTED}; }
  .ge-cross-layer { position: absolute; left: 0; top: 0; width: 0; height: 0; overflow: visible; pointer-events: none; z-index: ${Z.layer}; mix-blend-mode: multiply; }
  .ge-cross-layer > span { position: absolute; left: 0; top: 0; background: var(--ge-select-strip); }
  :root[data-doc-theme="dark"] .ge-cross-layer { mix-blend-mode: screen; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-doc-theme="light"]) .ge-cross-layer { mix-blend-mode: screen; }
  }
`;

// The boxes of what `range` holds, a chip of `chips` (those it holds whole) its own box and no piece of it.
function boxesOf(range, chips) {
  const boxes = [];
  const words = range.cloneRange();
  for (const chip of chips) {
    words.setEndBefore(chip);
    boxes.push(...words.getClientRects(), ...chip.getClientRects());
    words.setEnd(range.endContainer, range.endOffset);
    words.setStartAfter(chip);
  }
  boxes.push(...words.getClientRects());
  return boxes;
}

// The strips over each line of `texts` ([{ host, range }]), relative to `origin` (the layer's corner
// in the window): a line's from its first letter to its last, a line high (the block's line-height),
// centred on its letters; what a range holds that is a block of its own (taller than a line) left out,
// and a chip of the text it holds whole a strip of its own, over all of it (the layer's strips blend as
// one), but for one the line wraps, its pieces on their lines.
function lineStrips(texts, origin) {
  const strips = [];
  for (const { host, range } of texts) {
    const style = getComputedStyle(host);
    const height = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.6;
    const chips = [...host.querySelectorAll("[data-ge-atom]")].filter((chip) => holds(range, chip));
    const lines = [];
    for (const rect of boxesOf(range, chips)) {
      if (rect.width === 0 || rect.height > height * 1.5) continue;
      const middle = (rect.top + rect.bottom) / 2;
      const line = lines.find((each) => Math.abs(each.middle - middle) < height / 2);
      if (line) {
        line.left = Math.min(line.left, rect.left);
        line.right = Math.max(line.right, rect.right);
      } else lines.push({ middle, left: rect.left, right: rect.right });
    }
    for (const line of lines) strips.push({ left: line.left - origin.left, top: line.middle - height / 2 - origin.top, width: line.right - line.left, height });
    for (const chip of chips) {
      if (chip.getClientRects().length > 1) continue;
      const box = chipBox(chip);
      strips.push({ left: box.left - origin.left, top: box.top - origin.top, width: box.width, height: box.height });
    }
  }
  return strips;
}

// The text blocks it takes text from, and a deletion joins: body text, headings, list items.
const isText = (host) => isHost(host) && (host.getAttribute("data-ge-kind") ?? "flow") === "flow";
// The page's title: text it takes too (drawn, copied, deleted), kept apart: a deletion leaves it what
// stands outside the selection and joins nothing to it (remove).
const isTitle = (host) => isHost(host) && host.getAttribute("data-ge-kind") === "title";
const isPiece = (host) => isText(host) || isTitle(host);
const textHosts = (unit) => [...unit.querySelectorAll("[data-ge-block], [data-ge-new]")].filter((node) => isHost(node) && isText(node));

// The outermost block around `node` holding no text of the body (a code block, a table, a file…),
// taken whole, or null.
function wholeOf(node) {
  let whole = null;
  for (let unit = (node?.nodeType === 1 ? node : node?.parentElement)?.closest(UNIT); unit?.closest("main"); unit = unit.parentElement?.closest(UNIT)) {
    if ((isHost(unit) && isText(unit)) || textHosts(unit).length > 0) break;
    whole = unit;
  }
  return whole;
}

// The text a press can begin in: a text block's, or what a block taken whole edits as its own (a
// code block's code), or null.
function textAt(node) {
  const host = editable(node);
  if (host) return host;
  const own = (node?.nodeType === 1 ? node : node?.parentElement)?.closest('[contenteditable="true"]');
  return own?.closest("main") && wholeOf(own) ? own : null;
}

// Whether a block is no block of a selection between its ends, taken or deleted only with the block
// around it: a part of that block (a card's title, a tabs area's tab: tabs are no blocks a
// selection holds), or in a tab not shown (a tab's panel not shown counts as not on the page).
const ownPart = (unit) => (!unit.parentElement?.hasAttribute("data-ge-box") && !isHost(unit))
  || boxRole(unit.parentElement.getAttribute("data-ge-box-kind")) === "tabs" || Boolean(unit.parentElement.closest("main [hidden]"));

// The place right before a block (with what goes with it: core.mjs partsOf) or right after it.
function edge(unit, after) {
  const parts = partsOf(unit);
  const node = after ? parts.at(-1) : parts[0];
  const index = [...node.parentNode.childNodes].indexOf(node);
  return { host: null, unit, node: node.parentNode, offset: after ? index + 1 : index };
}

// Whether point a comes before point b in the page.
function before(a, b) {
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  return range.comparePoint(b.node, b.offset) > 0;
}

const rangeOf = ({ start, end }) => {
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
};

// Whether `range` holds all of `node`.
function holds(range, node) {
  const own = document.createRange();
  own.selectNode(node);
  return range.compareBoundaryPoints(Range.START_TO_START, own) <= 0 && range.compareBoundaryPoints(Range.END_TO_END, own) >= 0;
}

/**
 * isEditing(); struct(parents, touched, mutate): the editor's undoable structural change; say;
 * keepText(unit): why a block may not go (block-info.mjs); selectUnits(units): select blocks;
 * markUnits(units): fill blocks as selected without selecting them (blocks.mjs); split(host): Enter
 * in a text block (typing/). copy(data, range, { texts, wholes }, cut): it written to the clipboard's
 * `data`, whether it was (clipboard/ copyAcross: a cut it refuses deletes nothing). claims(from, to):
 * whether a drag from text block `from` into `to` is another tool's (a table's cells:
 * table/cells.mjs), which then selects; the press is no longer this one's. keeps(node): a press on it keeps the selection (the format bar); formatKey(event):
 * a key that formats it, handled (the format bar's keys); changed(): it was drawn by a press that
 * ended, or let go (the format bar shows or hides). selectAll(event, touched): whether a key over it
 * was Ctrl+A, handled (select-all/: the first container holding all it touches, as blocks),
 * `touched()` letting it go and giving the blocks it touches.
 */
export function createTextSelection({ isEditing, struct, say, keepText, selectUnits, markUnits = () => {}, split, copy: write, claims = () => false, keeps = () => false, formatKey = () => false, changed = () => {}, selectAll = () => false }) {
  addStyle(STYLE);
  const supported = Boolean(globalThis.CSS?.highlights && globalThis.Highlight);
  let press = null; // the main button down in text: { anchor, crossing }
  let cross = null; // the page's selection: { start, end } (points { host, node, offset }, in page order; host null at a block's edge)
  let swallow = false; // a Shift+click drew it: the mousedown after the press does nothing

  // ---------- points ----------

  // Where the pointer is in the page's text, `from` being the selection's other end: the body text
  // under it; over a block taken whole, before it or after it (whichever leaves it inside); else the
  // nearest text block by height (at its start above it, its end below it, beside it the nearest
  // place on that line).
  function pointAt(x, y, from) {
    const place = dragPlace([from.node, from.offset], x, y);
    const host = place && editable(place[0]);
    if (host?.closest("main") && isPiece(host)) return { host, node: place[0], offset: place[1] };
    const whole = wholeOf(document.elementFromPoint(x, y));
    if (whole) return edge(whole, !from || before(from, edge(whole, false)));
    let best = null;
    let bestScore = null;
    for (const each of hosts().filter((node) => node.closest("main") && isPiece(node))) {
      const rect = each.getBoundingClientRect();
      // By height, then (level ones: columns side by side) by width; of nested ones, the innermost.
      const score = gapScore(rect, x, y);
      if (!bestScore || score[0] < bestScore[0] || (score[0] === bestScore[0] && score[1] <= bestScore[1])) {
        best = each;
        bestScore = score;
      }
    }
    if (!best) return null;
    const rect = best.getBoundingClientRect();
    if (y < rect.top) return { host: best, node: best, offset: 0 };
    if (y > rect.bottom) return { host: best, node: best, offset: textEnd(best) };
    const inside = pointRange(Math.min(Math.max(x, rect.left + 1), rect.right - 1), y);
    if (inside && editable(inside.startContainer) === best) return { host: best, node: inside.startContainer, offset: inside.startOffset };
    return { host: best, node: best, offset: x < rect.left + rect.width / 2 ? 0 : textEnd(best) };
  }

  // Where the selection starts, `focus` being its other end: the press's place in body text; begun
  // in a block taken whole (its code, a cell), that block's edge away from `focus`.
  function startOf(anchor, focus) {
    if (isPiece(anchor.host)) return anchor;
    const whole = wholeOf(anchor.host) ?? unitElement(anchor.host);
    if (!whole) return anchor;
    const head = edge(whole, false);
    return before(head, focus) ? head : edge(whole, true);
  }

  // ---------- what it holds ----------

  // Its text, by text block ({ host, range }, the block's own text: not the lists it holds), and the
  // blocks it takes whole (outermost), each in page order.
  function piecesOf(selection) {
    const range = rangeOf(selection);
    // A closed disclosure it holds all of is taken whole (its content folded away is no text to
    // draw); in one it holds a part of (from its title on), what is folded away is no piece either.
    const closed = [...document.querySelectorAll(`main ${DETAILS.match}:not([open])`)];
    const wholeClosed = closed.filter((details) => holds(range, details) && !closed.some((other) => other !== details && other.contains(details) && holds(range, other)));
    const folded = (host) => closed.some((details) => details.contains(host) && (wholeClosed.includes(details) || !details.querySelector(DETAILS.label)?.contains(host)));
    // A text block between its ends has all its own text in it; one holding an end (a list item, a
    // flowchart's step, holding the block the selection starts or ends in) only the part of its own
    // text it reaches: none when its text stands before the start (the selection begun in a block the
    // item holds) or after the end.
    const reaches = (host) => host === selection.start.host || host === selection.end.host || (range.isPointInRange(host, 0) && range.isPointInRange(host, textEnd(host)));
    const texts = hosts().filter((host) => host.closest("main") && isPiece(host) && range.intersectsNode(host) && reaches(host) && !folded(host)).map((host) => {
      const part = document.createRange();
      part.setStart(host, 0);
      part.setEnd(host, textEnd(host));
      if (host === selection.start.host) part.setStart(selection.start.node, selection.start.offset);
      if (host === selection.end.host) part.setEnd(selection.end.node, selection.end.offset);
      return { host, range: part };
    });
    // What a folded heading hides (fold/) between the ends goes with the selection, wherever in the
    // heading's words it begins: its text blocks' text in full and its other blocks whole (below), as
    // a deletion takes the blocks between the ends whole (unitsBetween), so a copy or a cut carries
    // what the deletion takes. An end is never in what is hidden (hosts() are those shown), so what is
    // hidden and in the range lies between the ends.
    const hidden = [...document.querySelectorAll(`main [${FOLDED}] :is([data-ge-block], [data-ge-new]), main :is([data-ge-block], [data-ge-new])[${FOLDED}]`)]
      .filter((host) => isHost(host) && isText(host) && range.intersectsNode(host) && !folded(host));
    for (const host of hidden) {
      const part = document.createRange();
      part.setStart(host, 0);
      part.setEnd(host, textEnd(host));
      texts.push({ host, range: part });
    }
    if (hidden.length > 0) texts.sort((a, b) => (a.host.compareDocumentPosition(b.host) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const wholes = [...wholeClosed];
    for (const unit of document.querySelectorAll(`main :is(${UNIT})`)) {
      if (wholes.some((other) => other === unit || other.contains(unit))) continue;
      if (ownPart(unit)) continue;
      if ((isHost(unit) && isText(unit)) || textHosts(unit).length > 0 || !holds(range, unit)) continue;
      wholes.push(unit);
    }
    return { texts, wholes };
  }

  // The outermost blocks wholly between its two ends (not holding either), which a deletion takes.
  function unitsBetween(selection) {
    const range = rangeOf(selection);
    const ends = [selection.start.host, selection.end.host].filter(Boolean);
    const chosen = [];
    for (const unit of document.querySelectorAll(`main :is(${UNIT})`)) {
      if (ends.some((host) => unit === host || unit.contains(host))) continue;
      if (chosen.some((other) => other.contains(unit))) continue;
      if (ownPart(unit)) continue; // with the block
      if (holds(range, unit)) chosen.push(unit);
    }
    return chosen;
  }

  // The blocks it touches, outermost: those wholly between its ends, and the blocks of its two ends
  // (a block whose text blocks it all reaches, as a list whose every item it reaches, for them).
  function blocksTouched(selection) {
    const between = unitsBetween(selection);
    const reached = new Set(piecesOf(selection).texts.map(({ host }) => host));
    const covered = (host) => reached.has(host) || between.some((unit) => unit.contains(host));
    const units = new Set(between);
    for (const host of [selection.start.host, selection.end.host].filter(Boolean)) {
      let unit = unitElement(host);
      for (let outer = unit?.parentElement?.closest(UNIT); outer?.closest("main") && [...outer.querySelectorAll("[data-ge-block], [data-ge-new]")].filter(isHost).every(covered); outer = outer.parentElement?.closest(UNIT)) unit = outer;
      if (unit) units.add(unit);
    }
    return [...units].filter((unit) => ![...units].some((other) => other !== unit && other.contains(unit)));
  }

  // ---------- drawing ----------

  function draw(a, b) {
    cross = before(a, b) ? { start: a, end: b } : { start: b, end: a };
    getSelection().removeAllRanges(); // the page's own from now
    const { texts, wholes } = piecesOf(cross);
    CSS.highlights.set(NAME, new Highlight(...texts.map(({ range }) => range)));
    paint(texts);
    markUnits(wholes);
  }

  // Its text drawn: the strips (lineStrips) in the page's layer, or, in a modal dialog, the browser's highlight.
  let layer = null;
  function paint(texts) {
    const inDialog = texts.some(({ host }) => host.closest("dialog[open]")?.matches(":modal"));
    if (inDialog) CSS.highlights.set(SHOWN, new Highlight(...texts.map(({ range }) => range)));
    else CSS.highlights.delete(SHOWN);
    layer ??= element("div", { class: "ge-cross-layer", "data-doc-dev": "" });
    if (!layer.isConnected) document.body.append(layer);
    const strips = inDialog ? [] : lineStrips(texts, layer.getBoundingClientRect());
    while (layer.children.length > strips.length) layer.lastChild.remove();
    while (layer.children.length < strips.length) layer.append(own(element("span"), "cross-selection", { alive: () => cross !== null }));
    strips.forEach(({ left, top, width, height }, index) => Object.assign(layer.children[index].style, {
      transform: `translate(${Math.round(left)}px, ${Math.round(top)}px)`, width: `${Math.round(width)}px`, height: `${Math.round(height)}px`,
    }));
  }

  function letGo() {
    if (!cross) return;
    cross = null;
    if (supported) {
      CSS.highlights.delete(NAME);
      CSS.highlights.delete(SHOWN);
    }
    layer?.replaceChildren();
    markUnits([]);
    changed();
  }

  // The page laid out again (the window resized): the strips over the text where it is now.
  window.addEventListener("resize", () => {
    if (cross) paint(piecesOf(cross).texts);
  });

  // Drawn again over its text changed in place (formatted, its blocks turned into another type:
  // `texts` its pieces' new ranges in page order): its ends in text where they were, at a block's
  // edge as they were (one still on the page).
  function redraw(texts) {
    if (!cross || texts.length === 0) return;
    const first = texts[0].range;
    const last = texts.at(-1).range;
    const edge = (point) => !point.host && point.node.isConnected;
    const start = edge(cross.start) ? cross.start : { host: texts[0].host, node: first.startContainer, offset: first.startOffset };
    const end = edge(cross.end) ? cross.end : { host: texts.at(-1).host, node: last.endContainer, offset: last.endOffset };
    draw(start, end);
  }

  // Drawn again over its text blocks turned into another type (`texts`: where its pieces are now, in
  // page order), so a conversion keeps the selection; when one of them holds no text of
  // the body now (a disclosure's title, code), let go instead. Returns whether it is drawn.
  function reselect(texts) {
    if (!cross) return false;
    if (texts.length === 0 || !texts.every(({ host }) => host.isConnected && isText(host))) {
      letGo();
      return false;
    }
    redraw(texts);
    return true;
  }

  // ---------- the press ----------

  document.addEventListener("pointerdown", (event) => {
    if (cross && keeps(event.target)) return; // the format bar's buttons act on it
    const extending = event.shiftKey && cross;
    const shiftFrom = event.shiftKey ? (cross?.start ?? caretPoint()) : null;
    letGo();
    if (!supported || !isEditing() || event.button !== 0 || event.pointerType !== "mouse" || event.ctrlKey || event.metaKey || event.altKey) return;
    // In text, or anywhere in a block taken whole (its code, not open yet; a file's row), which the
    // press then stands for, but for what a component keeps: a drag there is its own.
    const host = textAt(event.target) ?? (keptByComponent(event.target) ? null : wholeOf(event.target));
    if (!host?.closest("main")) return;
    // Shift+click in another block: from the caret (or the selection's start) to there (unless it is
    // another tool's: cells of a table).
    if (shiftFrom && shiftFrom.host !== host && !claims(shiftFrom.host, host)) {
      const to = pointAt(event.clientX, event.clientY, shiftFrom);
      if (!to) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      swallow = true; // and the browser's own selecting on the mousedown after it
      draw(startOf(shiftFrom, to), to);
      changed();
      return;
    }
    if (extending) return;
    const at = pointRange(event.clientX, event.clientY);
    if (!at || (textAt(at.startContainer) ?? wholeOf(at.startContainer)) !== host) return;
    // Beside a chip the browser's place may be in its text: the place beside it.
    const [node, offset] = atomOf(event.target) ? [at.startContainer, at.startOffset] : dragPlace([at.startContainer, at.startOffset], event.clientX, event.clientY);
    press = { anchor: { host, node, offset }, crossing: false, whole: isText(host) ? null : wholeOf(host) };
  }, true);
  document.addEventListener("mousedown", (event) => {
    if (!swallow) return;
    swallow = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  document.addEventListener("pointermove", (event) => {
    if (!press || !(event.buttons & 1)) return;
    press.x = event.clientX;
    press.y = event.clientY;
    // Into another tool's blocks (a table's cells, from a cell): theirs.
    const at = pointRange(press.x, press.y);
    const under = at ? textAt(at.startContainer) : null;
    if (under && under !== press.anchor.host && claims(press.anchor.host, under)) {
      if (press.crossing) letGo();
      release();
      return;
    }
    // Still in the block taken whole the press began in: the block's own (its code's selection).
    if (press.whole?.contains(document.elementFromPoint(press.x, press.y))) {
      if (!press.crossing) return;
      press.crossing = false;
      document.documentElement.removeAttribute("data-ge-cross");
      letGo();
      return;
    }
    const focus = under === press.anchor.host ? { host: under, node: at.startContainer, offset: at.startOffset } : pointAt(press.x, press.y, press.anchor);
    if (!focus) return;
    if (focus.host === press.anchor.host) {
      if (!press.crossing) return;
      // Back in the block the press began in: the browser's selection again.
      press.crossing = false;
      document.documentElement.removeAttribute("data-ge-cross");
      letGo();
      const range = document.createRange();
      range.setStart(press.anchor.node, press.anchor.offset);
      range.collapse(true);
      select(range);
      getSelection().extend(focus.node, focus.offset);
      return;
    }
    if (!press.crossing) {
      press.crossing = true;
      document.documentElement.setAttribute("data-ge-cross", "");
    }
    draw(startOf(press.anchor, focus), focus);
    scrolling.wake();
  }, true);

  // Near the top or bottom edge of what it started in (the window, or a detail card's content) that
  // scrolls (as long as the pointer stays there), the selection reaching what comes into view: a task
  // of the editor's frames (edge-scroll.mjs).
  const scrolling = edgeFollower("text selection", {
    pointer: () => (press?.crossing ? press : null),
    scroller: () => press.anchor.host.closest(DIALOG.openContent),
    scrolled() {
      const focus = pointAt(press.x, press.y, press.anchor);
      if (focus && focus.host !== press.anchor.host) draw(startOf(press.anchor, focus), focus);
    },
    fail: () => release(),
  });

  const release = () => {
    if (!press) return;
    press = null;
    document.documentElement.removeAttribute("data-ge-cross");
    if (cross) changed();
  };
  document.addEventListener("pointerup", release, true);
  // The press ends the other ways too (the pointer cancelled, the window blurred, the page hidden).
  endsGesture({ active: () => Boolean(press), cancel: release });

  // The caret as a point, or null.
  function caretPoint() {
    const selection = getSelection();
    if (!selection.rangeCount) return null;
    const host = editable(selection.anchorNode);
    return host?.closest("main") ? { host, node: selection.anchorNode, offset: selection.anchorOffset } : null;
  }

  // The caret at `point`; at a block's edge, in the body text nearest it that way (`forward`: after
  // it), or the other way when there is none.
  function caretTo(point, forward) {
    if (point.host) {
      const range = document.createRange();
      range.setStart(point.node, point.offset);
      point.host.focus({ preventScroll: true });
      select(range);
      return;
    }
    const texts = hosts().filter((host) => host.closest("main") && isPiece(host));
    const next = texts.find((host) => before(point, { node: host, offset: 0 }));
    const previous = texts.filter((host) => before({ node: host, offset: textEnd(host) }, point)).at(-1);
    const host = forward ? next ?? previous : previous ?? next;
    if (host) caretAt(host, host === next ? "start" : "end");
  }

  // Delete it: the first block keeps its text before it and takes the last block's after it, the
  // blocks between go (those taken whole among them); one undo step, the caret where it began. From
  // the page's title (`apart`) nothing joins: the title keeps what stands before it (empty, it says
  // 未命名文档), the last block what stands after it in a block of its own (gone when that is nothing).
  // Returns whether it went.
  function remove() {
    const selection = cross;
    const { start, end } = selection;
    letGo();
    if (!(start.host ?? start.node).isConnected || !(end.host ?? end.node).isConnected) return false;
    const apart = isTitle(start.host) || isTitle(end.host);
    if (![start.host, end.host].every((host) => !host || isPiece(host))) {
      say(t("跨块删除只支持正文、标题和列表里的文字。"));
      return false;
    }
    // A block between goes as a selected block would (keepText: block-info.mjs), a text block between
    // unless it cannot be deleted (a block taken whole, a formula block too, by the first rule only).
    const units = unitsBetween(selection);
    const reason = units.map((unit) => keepText(unit) ?? (isText(unit) && !can(unit, "remove") ? t("这里有不能删除的块。") : null)).find(Boolean);
    if (reason) {
      say(reason, "note", 6000);
      return false;
    }
    let offset = 0;
    if (start.host) {
      const head = document.createRange();
      head.setStart(start.host, 0);
      head.setEnd(start.node, start.offset);
      offset = head.toString().length;
    }
    // What goes: the blocks between, and a container they (and the last block, joined) leave
    // empty, as when blocks are deleted (core.mjs removalTarget).
    const targets = units.map((unit) => removalTarget(unit, new Set(units))).filter((node, index, all) => all.indexOf(node) === index);
    const endTarget = start.host && end.host ? removalTarget(end.host, new Set([...units, end.host])) : null;
    const parents = [...new Set([start.host, end.host, ...[end.host, endTarget, ...targets].map((node) => node?.parentElement)].filter(Boolean))];
    const touched = [start.host, end.host].filter(Boolean);
    // With neither end in text, the caret goes to the text after where the blocks were (else before).
    const beside = start.host || end.host ? null : end;
    const result = struct(parents, touched, () => {
      if (end.host) {
        const lead = document.createRange();
        lead.setStart(end.host, 0);
        lead.setEnd(end.node, end.offset);
        lead.deleteContents();
      }
      if (start.host) {
        const tail = document.createRange();
        tail.setStart(start.node, start.offset);
        tail.setEnd(start.host, textEnd(start.host));
        tail.deleteContents();
      }
      for (const target of targets) takeOut(target);
      // Joined unless the two cannot be (a block that may not merge, lists that cannot go along):
      // then each keeps what is left of its text. Apart from the title, the last block left empty
      // goes as the blocks between do (it was all selected), else it stays with its rest.
      if (apart) {
        const last = isTitle(end.host) ? null : end.host;
        if (last && endTarget && isEmpty(last) && can(last, "remove") && !keepText(endTarget)) takeOut(endTarget);
      } else if (start.host && end.host && mergeInto(start.host, end.host, { anyKind: true }) && endTarget !== end.host && endTarget.isConnected) takeOut(endTarget);
      if (start.host && !apart) joinCode(start.host); // inline code meeting inline code at the join is one piece
      if (isTitle(start.host) && isEmpty(start.host)) start.host.replaceChildren(); // no <br> left in an emptied title
      return { touched: touched.filter((host) => host.isConnected), focus: start.host ?? end.host ?? null };
    });
    if (!result) return false;
    if (start.host) {
      start.host.focus({ preventScroll: true }); // the block pressed in may have gone (a selection drawn upwards)
      caretAtOffset(start.host, offset);
    } else if (end.host?.isConnected) caretAt(end.host, "start");
    else if (beside?.node.isConnected) caretTo({ host: null, node: beside.node, offset: Math.min(beside.offset, beside.node.childNodes.length) }, true);
    return true;
  }

  // ---------- keys and the clipboard ----------

  document.addEventListener("keydown", (event) => {
    if (!cross) return;
    const key = event.key;
    const mod = event.ctrlKey || event.metaKey;
    if (["Shift", "Control", "Meta", "Alt"].includes(key) || (mod && ["c", "x", "v"].includes(key.toLowerCase()))) return; // the clipboard's events do it
    if (key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      const units = blocksTouched(cross);
      letGo();
      selectUnits(units);
      return;
    }
    if (key.startsWith("Arrow") && !mod) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const back = key === "ArrowLeft" || key === "ArrowUp";
      const point = back ? cross.start : cross.end;
      letGo();
      caretTo(point, !back);
      return;
    }
    if (key === "Backspace" || key === "Delete") {
      event.preventDefault();
      event.stopImmediatePropagation();
      remove();
      return;
    }
    if (key === "Enter") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!remove()) return;
      const host = editable(getSelection().anchorNode);
      if (host) split(host);
      return;
    }
    // Typing (an input method too): what is typed replaces it.
    if ((key.length === 1 && !mod) || event.keyCode === 229) {
      if (!remove()) event.preventDefault();
      return;
    }
    // Ctrl+A: the blocks of the first container holding all it touches (select-all/).
    if (selectAll(event, () => {
      const units = blocksTouched(cross);
      letGo();
      return units;
    })) {
      event.stopImmediatePropagation();
      return;
    }
    // The format keys format it (the format bar's), it staying.
    if (mod && formatKey(event)) {
      event.stopImmediatePropagation();
      return;
    }
    letGo();
  }, true);

  // Text put in without a key before it (some input methods, dictation): it replaces it too, typed
  // where the deletion leaves the caret.
  document.addEventListener("beforeinput", (event) => {
    if (!cross) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const text = event.inputType === "insertText" || event.inputType === "insertReplacementText" ? event.data ?? event.dataTransfer?.getData("text/plain") : null;
    if ((event.inputType.startsWith("insert") || event.inputType.startsWith("delete")) && remove() && text) document.execCommand("insertText", false, text);
    else letGo();
  }, true);

  // Copied (cut: deleted after, unless the copy refused it).
  const copy = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    return write(event.clipboardData, rangeOf(cross), piecesOf(cross), event.type === "cut");
  };
  document.addEventListener("copy", (event) => { if (cross) copy(event); }, true);
  document.addEventListener("cut", (event) => {
    if (cross && copy(event)) remove();
  }, true);
  document.addEventListener("paste", (event) => {
    if (!cross) return;
    // What is pasted replaces it: deleted first, the paste goes on at the caret.
    if (!remove()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  return {
    /** Whether the page holds a selection across blocks. */
    get active() { return cross !== null; },
    /** Its text, by text block ({ host, range }, page order), or null when there is none. */
    texts: () => (cross ? piecesOf(cross).texts : null),
    /** The blocks it takes whole (outermost, page order), or null when there is none. */
    wholes: () => (cross ? piecesOf(cross).wholes : null),
    redraw,
    reselect,
    letGo,
  };
}
