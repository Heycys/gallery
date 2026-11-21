import { createHash } from "node:crypto";
import { parse } from "parse5";
import { NARROW_ATTRIBUTES, cellsOf, narrowCellsOf } from "./card-size.mjs";
import { escapeAttribute } from "./escape.mjs";
import { attr, elementsOf, hasClass, walk } from "./html-tree.mjs";
import { ATTRIBUTE } from "./components/installed.mjs";

// The cards of a custom page's page.html as the server reads and writes them (docs/render.md
// "A custom page"): its boards
// (div.gallery-board, data-board-id), each card a direct child of one (.gallery-card, data-card-id,
// data-x, data-y, data-w, data-h) around one instance of a custom block. What the page service
// (src/editor/page-service.mjs), gallery page add and the page as it is served (src/server/routes.mjs)
// read of a page, and the text they write: every change is a splice of the file's own text (an
// attribute's value, a card put in or taken out), every other byte staying, as a document's commits
// write. A card's id is what everything goes by: one that has none (or one that is no id, or one a
// card before it took) is given the lowest c<n> no card holds, in the file's order, the same ids
// however often it is read, so that the page shows a card by the id its first write gives it. A card's
// base (what a write to it is held to) is a hash of its markup, its frame's attributes and
// its instance, once those ids are in. Node's (parse5), the server's and the command line's.

/** What a card's id and a board's may be. */
export const CARD_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The attributes the author of a custom page writes on its boards and cards: the page's
 * own, which no document's component describes (tests/unit/components.mjs takes them as known names).
 */
export const PAGE_ATTRIBUTES = Object.freeze(["data-board-id", "data-card-id", "data-x", "data-y", "data-w", "data-h", ...Object.values(NARROW_ATTRIBUTES)]);

const BOARD_CLASS = "gallery-board";
const CARD_CLASS = "gallery-card";
const isInstanceNode = (node) => (node.tagName === "div" || node.tagName === "section") && attr(node, ATTRIBUTE) !== undefined;

/** A hash of `text` as the page service names a version of a card by: 16 hex digits, line endings as \n. */
export const hashOf = (text) => createHash("sha256").update(text.replace(/\r\n?/g, "\n")).digest("hex").slice(0, 16);

const parsed = (text) => parse(text.replace(/^﻿/, " "), { sourceCodeLocationInfo: true });

/**
 * What page.html `text` holds: { boards: [{ id, node, cards }], cards } where each card is { id (as
 * written: null where it has none), node, board (its board's id, or null), x, y, w, h (the cells the
 * board draws it at: card-size.mjs cellsOf), narrow (its place in the board's narrow view as written, or
 * null: narrowCellsOf), instance (the instance it holds, or null), block (its
 * block's id, or null), start, end (its place in the text), closed (written with its own end tag) }.
 * A card is a board's child; a board is any element of the class, its cards in the file's order.
 */
export function readPage(text) {
  const boards = [];
  walk(parsed(text), (node) => {
    if (!hasClass(node, BOARD_CLASS)) return;
    const cards = elementsOf(node).filter((child) => hasClass(child, CARD_CLASS) && child.sourceCodeLocation).map((child) => {
      let instance = elementsOf(child).find(isInstanceNode) ?? null;
      if (!instance) walk(child, (inner) => { instance ??= isInstanceNode(inner) ? inner : null; });
      const place = child.sourceCodeLocation;
      const dataset = { x: attr(child, "data-x"), y: attr(child, "data-y"), w: attr(child, "data-w"), h: attr(child, "data-h"),
        narrowX: attr(child, NARROW_ATTRIBUTES.x), narrowY: attr(child, NARROW_ATTRIBUTES.y), narrowW: attr(child, NARROW_ATTRIBUTES.w), narrowH: attr(child, NARROW_ATTRIBUTES.h) };
      return {
        id: attr(child, "data-card-id") ?? null, node: child, board: attr(node, "data-board-id") ?? null, ...cellsOf({ dataset }), narrow: narrowCellsOf({ dataset }),
        instance, block: instance ? attr(instance, ATTRIBUTE) : null, start: place.startOffset, end: place.endOffset, closed: Boolean(place.endTag),
      };
    });
    boards.push({ id: attr(node, "data-board-id") ?? null, node, cards });
  }, { inTemplates: false });
  return { boards, cards: boards.flatMap((board) => board.cards) };
}

/** The ids the cards of a page go by, in the file's order: each its own where it is an id no card before it took, else the lowest c<n> none holds. */
export function cardIds(cards) {
  const held = new Set(cards.map(({ id }) => id).filter((id) => typeof id === "string" && CARD_ID_PATTERN.test(id)));
  const taken = new Set();
  let next = 1;
  return cards.map(({ id }) => {
    if (typeof id === "string" && CARD_ID_PATTERN.test(id) && !taken.has(id)) {
      taken.add(id);
      return id;
    }
    while (held.has(`c${next}`) || taken.has(`c${next}`)) next++;
    const made = `c${next}`;
    taken.add(made);
    return made;
  });
}

/** The lowest c<n> none of `ids` is. */
export function freeCardId(ids) {
  const held = new Set(ids);
  let n = 1;
  while (held.has(`c${n}`)) n++;
  return `c${n}`;
}

// The splices that set an element's attributes (`values`: name -> value, null to take one off),
// [{ start, end, text }]: an attribute there gets its value written anew, in double quotes; one not
// there goes in after `after` where the element has that attribute (a card's narrow place after its
// data-h: the wide place, then the narrow one), else after its class (or its tag's name), in the order given.
function attributeSplices(text, node, values, { after = null } = {}) {
  const { startTag } = node.sourceCodeLocation;
  const places = startTag.attrs ?? {};
  const splices = [];
  const fresh = [];
  for (const [name, value] of Object.entries(values)) {
    const place = places[name];
    if (place) {
      splices.push({ start: place.startOffset, end: place.endOffset, text: value === null ? "" : `${name}="${escapeAttribute(String(value))}"` });
      if (value === null && text[place.startOffset - 1] === " ") splices.at(-1).start -= 1;
    } else if (value !== null) fresh.push(` ${name}="${escapeAttribute(String(value))}"`);
  }
  if (fresh.length) {
    const at = (after && places[after]?.endOffset) ?? places.class?.endOffset ?? startTag.startOffset + 1 + node.tagName.length;
    splices.push({ start: at, end: at, text: fresh.join("") });
  }
  return splices;
}

/** `text` with `splices` ([{ start, end, text }], none overlapping) made, from the last on. */
export function spliced(text, splices) {
  return [...splices].sort((a, b) => b.start - a.start || b.end - a.end).reduce((out, { start, end, text: put }) => out.slice(0, start) + put + out.slice(end), text);
}

/**
 * Page.html `text` with every card given an id (cardIds): { text, filled: the ids given, by the
 * cards' order }. The same text when each has its own.
 */
export function withCardIds(text) {
  const { cards } = readPage(text);
  const ids = cardIds(cards);
  const splices = cards.flatMap((card, index) => (card.id === ids[index] ? [] : attributeSplices(text, card.node, { "data-card-id": ids[index] })));
  return { text: splices.length ? spliced(text, splices) : text, filled: cards.flatMap((card, index) => (card.id === ids[index] ? [] : [ids[index]])) };
}

/** A card's base: the hash of its markup as `text` writes it (its frame's attributes and its instance). */
export const baseOf = (text, card) => hashOf(text.slice(card.start, card.end));

/**
 * The cards of page.html `text` as the page service answers with them, once every card has its id
 * (withCardIds; `text` already so when it was written): [{ id, board, x, y, w, h, narrow, base, block }].
 */
export function cardsOf(text) {
  const own = withCardIds(text).text;
  return readPage(own).cards.map((card) => ({ id: card.id, board: card.board, x: card.x, y: card.y, w: card.w, h: card.h, narrow: card.narrow, base: baseOf(own, card), block: card.block }));
}

// A card's place as page.html writes it: its board, then its data-x, -y, -w and -h, and its narrow view's, as written.
const placeWritten = (card) => [card.board, ...["x", "y", "w", "h"].map((axis) => attr(card.node, `data-${axis}`)), ...Object.values(NARROW_ATTRIBUTES).map((name) => attr(card.node, name))].join(",");

/**
 * A card's markup in `text` without its place (the data-x, -y, -w and -h of its start tag, and data-narrow-*): what tells
 * a change of its own (its frame's other attributes, its instance) from a move.
 */
export function unplacedOf(text, card) {
  const end = card.node.sourceCodeLocation.startTag.endOffset;
  return text.slice(card.start, end).replace(/\s+data-(?:narrow-)?[xywh]="[^"]*"/g, "") + text.slice(end, card.end);
}

/**
 * The cards page.html `after` changed of `before`, each by the id the page service gives it
 * (withCardIds): { <id>: kinds }, a kind "added", "removed", "cells" (another board, or its data-x, -y,
 * -w or -h, or its narrow view's, as written: placeWritten) or "content" (its markup but its place: unplacedOf); a card that
 * did not change is none of it. What the page service tells of each write (its writes.jsonl).
 */
export function cardsChanged(before, after) {
  const [was, now] = [withCardIds(before).text, withCardIds(after).text];
  const [a, b] = [readPage(was).cards, readPage(now).cards];
  const changed = {};
  for (const card of a) if (!b.some((one) => one.id === card.id)) changed[card.id] = ["removed"];
  for (const card of b) {
    const old = a.find((one) => one.id === card.id);
    if (!old) {
      changed[card.id] = ["added"];
      continue;
    }
    const kinds = [...(placeWritten(old) !== placeWritten(card) ? ["cells"] : []), ...(unplacedOf(was, old) !== unplacedOf(now, card) ? ["content"] : [])];
    if (kinds.length) changed[card.id] = kinds;
  }
  return changed;
}

/**
 * `text` (every card with its id) with each card `cells` names (id -> { x, y, w, h }) at those cells: its
 * data-x, -y, -w and -h written, or with `narrow` its place in the board's narrow view (data-narrow-*).
 */
export function withCells(text, cells, { narrow = false } = {}) {
  const nameOf = (axis) => (narrow ? NARROW_ATTRIBUTES[axis] : `data-${axis}`);
  const { cards } = readPage(text);
  const splices = cards.flatMap((card) => {
    const to = cells.get(card.id);
    if (!to) return [];
    const values = {};
    for (const axis of ["x", "y", "w", "h"]) if (to[axis] !== undefined && attr(card.node, nameOf(axis)) !== String(to[axis])) values[nameOf(axis)] = to[axis];
    return Object.keys(values).length ? attributeSplices(text, card.node, values, { after: narrow ? "data-h" : null }) : [];
  });
  return splices.length ? spliced(text, splices) : text;
}

// Where a card's markup stands with what goes with it: its whole line, its line break with it (the
// file's last line to the end of the text), when only blanks stand before and after it there; else the
// markup alone, whatever shares its line with it staying where it is, its indent too (a page written on
// one line: the cards after it and the closing tags).
function lineOf(text, start, end) {
  const before = text.lastIndexOf("\n", start - 1) + 1;
  const after = text.indexOf("\n", end);
  const rest = after === -1 ? text.slice(end) : text.slice(end, after);
  if (!/^[ \t]*$/.test(text.slice(before, start)) || !/^[ \t\r]*$/.test(rest)) return { from: start, to: end };
  return { from: before, to: after === -1 ? text.length : after + 1 };
}

/** `text` with card `id` taken out, and the card as it was written: { text, html }, or null when no card has that id. */
export function withoutCard(text, id) {
  const card = readPage(text).cards.find((one) => one.id === id);
  if (!card) return null;
  const { from, to } = lineOf(text, card.start, card.end);
  return { text: text.slice(0, from) + text.slice(to), html: text.slice(card.start, card.end) };
}

// The blanks a line of `text` starts with, at `offset`.
const indentAt = (text, offset) => /^[ \t]*/.exec(text.slice(text.lastIndexOf("\n", offset - 1) + 1))[0];

/** `markup` with each line after its first taken `by` further in. */
const indented = (markup, by) => markup.replace(/\r?\n/g, (eol) => `${eol}${by}`);

/**
 * The markup of a new card: `<section class="gallery-card" data-card-id data-x data-y data-w data-h>`
 * around `instance` (one instance's markup, as a block's template is), at `indent` (its first line's
 * blanks, which the text it goes in gives), the instance two spaces further in.
 */
export function cardMarkup({ id, x, y, w, h }, instance, indent = "", eol = "\n") {
  const open = `<section class="${CARD_CLASS}" data-card-id="${escapeAttribute(id)}" data-x="${x}" data-y="${y}" data-w="${w}" data-h="${h}">`;
  return `${open}${eol}${indent}  ${indented(instance.trim().replace(/\r?\n/g, eol), `${indent}  `)}${eol}${indent}</section>`;
}

/**
 * `text` with the card `markup` (cardMarkup's, or a card as withoutCard gave it) put last in board
 * `board` (its data-board-id), on a line of its own, as far in as its cards are (two spaces further in
 * than the board where it has none): { text, start } (where the card starts), or null when no board
 * has that id. `markup` that starts at an indent of its own is put back at the board's.
 */
export function withCard(text, board, markup) {
  const found = readPage(text).boards.find((one) => one.id === board);
  if (!found) return null;
  const { node } = found;
  const place = node.sourceCodeLocation;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const last = found.cards.at(-1);
  const indent = last ? indentAt(text, last.start) : `${indentAt(text, place.startOffset)}  `;
  // The indent the card's markup stood at (its end tag's line, what withoutCard leaves of it), each of its
  // lines moved from there to this board's: none where the two are one, so that a card put back where it
  // was is its old text again, byte for byte.
  const from = markup.match(/\n([ \t]*)<\/[a-z]+>\s*$/)?.[1] ?? "";
  const body = markup.trim().replace(/\r?\n/g, "\n").split("\n").map((line, index) => (index === 0 || from === indent ? line : line.startsWith(from) ? `${indent}${line.slice(from.length)}` : line)).join(eol);
  if (place.endTag) {
    const close = place.endTag.startOffset;
    const lineStart = text.lastIndexOf("\n", close - 1) + 1;
    const onOwnLine = /^[ \t]*$/.test(text.slice(lineStart, close));
    const at = onOwnLine ? lineStart : close;
    const put = `${onOwnLine ? "" : eol}${indent}${body}${eol}`;
    return { text: text.slice(0, at) + put + text.slice(at), start: at + put.indexOf(body) };
  }
  const at = place.endOffset;
  const put = `${eol}${indent}${body}`;
  return { text: text.slice(0, at) + put + text.slice(at), start: at + put.indexOf(body) };
}

/**
 * Page.html `text` as it is served (src/server/routes.mjs): every card with its id (withCardIds), and
 * on each card what the page's board reads of it and no file holds (all data-ge-*, which nothing writes
 * back): `data-ge-base`, its base; and by what `blockOf(id)` says of its block ({ fit, bare, runs }, or
 * null for one there is none of), `data-ge-fit="content"`, `data-ge-bare`, and `data-ge-state`
 * (`document`: a block whose places lack page; `disabled`: turned off; `missing`: none there) with its
 * instance put in a <template> (`data-ge-held`) where the block does not run on the page, so that no
 * script starts it and the board shows a note instead.
 */
export function servedPage(text, { blockOf = () => null } = {}) {
  const own = withCardIds(text).text;
  const splices = [];
  for (const card of readPage(own).cards) {
    const block = card.block ? blockOf(card.block) : null;
    const values = { "data-ge-base": baseOf(own, card) };
    if (block?.fit === "content") values["data-ge-fit"] = "content";
    if (block?.bare) values["data-ge-bare"] = "";
    const state = card.block === null ? null : block?.state ?? "missing";
    if (state && state !== "page") values["data-ge-state"] = state;
    splices.push(...attributeSplices(own, card.node, values));
    if (card.instance && block && state !== "page" && state !== "missing") {
      const { startOffset, endOffset } = card.instance.sourceCodeLocation;
      splices.push({ start: startOffset, end: startOffset, text: "<template data-ge-held>" }, { start: endOffset, end: endOffset, text: "</template>" });
    }
  }
  return spliced(own, splices);
}

// A card's markup read on a board of its own: { text, card, from, to } (where the markup is in the text).
function alone(markup) {
  const before = `<!doctype html><html><head></head><body><div class="${BOARD_CLASS}">`;
  const text = `${before}${markup}</div></body></html>`;
  const [board] = readPage(text).boards;
  return { text, board, from: before.length, to: before.length + markup.length };
}

/** Whether `markup` reads as one card and nothing else (a comment aside), closed by its own end tag, holding one instance of a block: its card, or null. */
export function oneCard(markup) {
  const { board } = alone(markup);
  if (!board || board.cards.length !== 1) return null;
  const strays = elementsOf(board.node).length !== 1 || board.node.childNodes.some((node) => node.nodeName === "#text" && node.value.trim());
  const [card] = board.cards;
  return strays || !card.closed || !card.instance || card.instance.parentNode !== card.node ? null : card;
}

/** A card's `markup` (oneCard's) with its id and cells set: { id, x, y, w, h }. */
export function cardWith(markup, { id, x, y, w, h }) {
  const { text, board, from, to } = alone(markup);
  const values = { "data-card-id": id, "data-x": x, "data-y": y, "data-w": w, "data-h": h };
  const splices = attributeSplices(text, board.cards[0].node, values);
  const grown = splices.reduce((sum, { start, end, text: put }) => sum + put.length - (end - start), 0);
  return spliced(text, splices).slice(from, to + grown);
}
