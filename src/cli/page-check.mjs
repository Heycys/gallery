import { existsSync } from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { parse } from "parse5";
import { pageWritesSince } from "../editor/page-service.mjs";
import { referencesWhere } from "../render/asset-references.mjs";
import { problemIn, readCatalog } from "../shared/component-catalog.mjs";
import { isInstance } from "../shared/components/index.mjs";
import { ATTRIBUTE, INSTANCE } from "../shared/components/installed.mjs";
import { attr, hasClass, walk } from "../shared/html-tree.mjs";
import { assetFile, imageFile, referencedFile } from "../shared/media.mjs";
import { CARD_ID_PATTERN, readPage, unplacedOf, withCardIds } from "../shared/page-cards.mjs";
import { pageAssetAddress, pageExists, pageFiles } from "../shared/pages.mjs";
import { SHIPPED_SCOPE, isShippedId, shippedBlock } from "../shared/shipped-blocks.mjs";
import { layoutOf } from "../shared/workspace.mjs";
import { CLOSING, closed, findBrowser, lookingArguments, startBrowser } from "../transfer/browser.mjs";
import { UsageError } from "./arguments.mjs";
import { ANSWER, LOADING, LOOKING, QUERIES, STEP, STILL, answered, changedLines, firstLine, linesChanged, partsSaid, refuseDialogs, seconds, stuckSaid, watchQueries, wentAway } from "./component-look.mjs";
import { dropScratch, dropStale, drawn, partsOf, scratchCopy, writtenLines } from "./component-try.mjs";
import { emptyRequiredOf, missingPageSaid } from "./page.mjs";
import { firstInstance } from "./page-try.mjs";
import { unopenedSaid } from "./qa.mjs";
import { shown } from "./report-start.mjs";
import { serverFor } from "./server-process.mjs";

// gallery page check <slug> (./usage.mjs): what is wrong with a custom page, each problem a line with
// its place in page.html ("FAIL page.html:12: …"), and what changed in it since it was last checked:
//   the structure (structureProblems), what still matters on a page that is free HTML (the
//     Agent's own scripts, frames and stylesheets are its to write, none of them a problem): where it
//     has boards or cards, its boards in <main class="gallery-page">, each board's and each
//     card's id there, of [a-z0-9-] and once in the page, each card a board's child holding one
//     instance, its cells whole numbers on the board (0 <= x, 1 <= w <= 12, x + w <= 12, 0 <= y,
//     1 <= h <= 24) and sharing a cell with no card of its board, its block in the workspace, loading,
//     not turned off and with page in its places; and each reference to a file of the page's own
//     (assets/<file>, the folder the server serves at /pages/<slug>/assets/) to one that is there, by
//     a name the route serves, no frame's but a picture's (the route serves a page's own pictures by
//     their type, its stylesheets and scripts as such, and any other file as bytes for saving, so that a
//     frame of a file there downloads it; a link, a font, a video or audio uses the bytes), a picture, a
//     stylesheet or a script written any other way relative being one nothing serves;
//   the changes (pageChanges) since the page as the last check that found nothing looked at it
//     (.gallery/qa/<slug>/checked.html, written then, its time the time it read page.html), or, before
//     any, since the newest version the page service kept before a write (.gallery/state/pages/<slug>/):
//     cards added, taken out, moved (on their board or to another), resized, their data parts changed
//     (each part's lines, as gallery page try says a write's), a card's own markup and the page's own
//     HTML outside its cards; each change the page wrote since, a gesture of the user's on it (the
//     page service's writes.jsonl, markedTheUsers), marked USERS_MARK, never the Agent's to put back, and
//     each Gallery put there itself (the default home page's cards, a write told `by` "gallery"),
//     marked GALLERYS_MARK, neither the user's nor the Agent's;
//   the look (look): the page on the workspace's server (found or started as gallery page open does), a
//     scratch copy of it so that nothing a block does as it opens writes page.html, in a headless Chrome
//     or Edge at 1280, 1920 and 600px wide (600: a narrow board, fewer columns of the same cells), light and dark, each
//     look pictured whole in .gallery/qa/<slug>/check/ (emptied each run), once the page's reads of the
//     workspace are answered (watchQueries: a card whose block needs "workspace" shows nothing before; one
//     still unanswered after QUERIES ms is a "note" line naming the card, no failure, said on the OK line
//     too): a card whose content does not
//     fit it (it scrolls in the card), a card drawn out of its board, the page wider than the window, a
//     block that failed, a picture that does not load, what the console and the requests say.
// Exits 1 for a problem; 3 when the look could not be made (no server or browser: UNVERIFIED), the
// structure checked all the same; 2 for a mistake in the command line; else 0, the page then the
// baseline the next check's changes are told against.

/** The widths a page check looks at the page in: a laptop's and a screen's (the same twelve columns of the fixed cell, in more room), and a narrow board's. */
export const LOOK_WIDTHS = [1280, 1920, 600];
export const THEMES = ["light", "dark"];
const HEIGHT = 900;
const READY = 30_000; // how long a page may take to be drawn once it has opened

// What shows a file in a frame of its own: a file the route hands out for saving it downloads instead.
const FRAMES = new Set(["iframe", "frame", "object", "embed"]);
const WHOLE = /^\d+$/;
const RANGES = { x: [0, 11], y: [0, Infinity], w: [1, 12], h: [1, 24] };

/**
 * What is wrong with page.html `text` (custom page `slug`, its folder `folder`) as a
 * custom page, by the workspace's catalog `catalog` (readCatalog's): [{ line, what }], in the file's order.
 */
export function structureProblems(text, { catalog, folder, slug }) {
  const problems = [];
  const at = (node) => node?.sourceCodeLocation?.startLine ?? 1;
  const problem = (node, what) => problems.push({ line: typeof node === "number" ? node : at(node), what });
  const tree = parse(text.replace(/^﻿/, " "), { sourceCodeLocationInfo: true });
  const mains = [];
  const boards = [];
  walk(tree, (node) => {
    if (!node.tagName) return;
    if (node.tagName === "main" && hasClass(node, "gallery-page")) mains.push(node);
    if (hasClass(node, "gallery-board")) boards.push(node);
    if (hasClass(node, "gallery-card") && !hasClass(node.parentNode, "gallery-board")) problem(node, `a card (class gallery-card) that is no board's child: each card stands right in a <div class="gallery-board" data-board-id="…">, which lays it out, and this one is laid out by none`);
  }, { inTemplates: false });
  // A page with no board and no card is the Agent's own HTML, wherever it stands; one with them holds them in <main class="gallery-page">.
  if (mains.length === 0 && (boards.length > 0 || readPage(text).cards.length > 0)) problem(1, `no <main class="gallery-page">: a page's boards stand in one (it is how a block knows it is on a page: context.place "page", and how the page follows the theme)`);
  // The boards: in the page's main, each with an id of its own.
  const boardIds = new Map();
  for (const board of boards) {
    let inside = board.parentNode;
    while (inside && !(inside.tagName === "main" && hasClass(inside, "gallery-page"))) inside = inside.parentNode;
    if (mains.length && !inside) problem(board, `a board outside <main class="gallery-page">: its cards' blocks would not know they are on a page`);
    const id = attr(board, "data-board-id");
    if (id === undefined || id === "") problem(board, `a board with no data-board-id: write one (main, side…), of lowercase letters, digits and hyphens, once in the page`);
    else if (!CARD_ID_PATTERN.test(id)) problem(board, `data-board-id="${id}": a board's id is lowercase letters, digits and single hyphens (main, side-2)`);
    else if (boardIds.has(id)) problem(board, `data-board-id="${id}" again (line ${boardIds.get(id)} has it): each board's id is its own`);
    else boardIds.set(id, at(board));
  }
  // The cards: each with an id of its own, one instance, its cells on the board, its block one a page runs.
  const cardIds = new Map();
  const placed = new Map(); // a board -> its cards with whole cells, { id, x, y, w, h, line }
  for (const card of readPage(text).cards) {
    const { node } = card;
    const id = attr(node, "data-card-id");
    const called = id && CARD_ID_PATTERN.test(id) ? `card ${id}` : "this card";
    if (id === undefined || id === "") problem(node, `a card with no data-card-id: write one (c<n>, the lowest none holds, or a name of your own), of lowercase letters, digits and hyphens: its place, its writes and the reader's state go by it`);
    else if (!CARD_ID_PATTERN.test(id)) problem(node, `data-card-id="${id}": a card's id is lowercase letters, digits and single hyphens (c3, water)`);
    else if (cardIds.has(id)) problem(node, `data-card-id="${id}" again (line ${cardIds.get(id)} has it): each card's id is its own, and the page's writes go by it`);
    else cardIds.set(id, at(node));
    let instances = 0;
    walk(node, (inner) => { if (inner !== node && isInstance(inner)) instances += 1; }, { inTemplates: false });
    if (instances === 0) problem(node, `${called} holds no instance of a custom block (an element with ${ATTRIBUTE}): a card is one block's instance, gallery/static's for what only shows`);
    else if (instances > 1) problem(node, `${called} holds ${instances} instances: a card holds one (put each on a card of its own)`);
    else if (card.instance && card.instance.parentNode !== node) problem(card.instance, `${called}'s instance stands inside another element of the card: write it right in the card's <section>`);
    const cells = {};
    for (const axis of ["x", "y", "w", "h"]) {
      const value = attr(node, `data-${axis}`);
      const [low, high] = RANGES[axis];
      if (value === undefined) problem(node, `${called} has no data-${axis}: a card says its place and size in whole cells, data-x data-y data-w data-h`);
      else if (!WHOLE.test(value.trim())) problem(node, `${called}'s data-${axis}="${value}" is no whole number`);
      else if (Number(value) < low || Number(value) > high) problem(node, `${called}'s data-${axis}="${value}": ${axis} is ${high === Infinity ? `${low} or more` : `${low} to ${high}`}${axis === "w" ? " (a row is 12 cells)" : ""}`);
      else cells[axis] = Number(value);
    }
    if (cells.x !== undefined && cells.w !== undefined && cells.x + cells.w > 12) problem(node, `${called} reaches past the row's end: data-x ${cells.x} and data-w ${cells.w} make ${cells.x + cells.w}, and a row is 12 cells (x + w is 12 at most)`);
    else if (Object.keys(cells).length === 4) placed.set(card.board, [...(placed.get(card.board) ?? []), { id: id ?? null, ...cells, line: at(node) }]);
    if (card.block) blockProblem(card.block, catalog, (what) => problem(card.instance, `${called}'s block ${card.block}: ${what}`));
  }
  // No two cards of a board share a cell.
  for (const cards of placed.values()) {
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        const [a, b] = [cards[i], cards[j]];
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
          problem(b.line, `card ${b.id ?? "here"} (x ${b.x}, y ${b.y}, ${b.w} × ${b.h}) shares cells with card ${a.id ?? `at line ${a.line}`} (x ${a.x}, y ${a.y}, ${a.w} × ${a.h}): no two cards of a board overlap; move one to a free spot (gallery page add finds one for a new card)`);
        }
      }
    }
  }
  problems.push(...referenceProblems(text, { folder, slug }));
  return problems.sort((a, b) => a.line - b.line);
}

// What is wrong with a card's block, said to `say`: none in the workspace, one of Gallery's own not yet
// added, one turned off, one that does not load, one of documents alone.
function blockProblem(id, catalog, say) {
  const found = catalog.packages.get(id);
  if (found) {
    if (!found.places.includes("page")) say(`a block of documents (its manifest's places has no "page"): on a custom page its card says so and runs nothing`);
    return;
  }
  const problem = catalog.problems.get(id);
  if (catalog.settings.disabled.includes(id)) say(`turned off in 设置 › 组件列表: its card says so and runs nothing (the user turns it on again)`);
  else if (problem) say(`it does not load (${problemIn("en", problem.problem)}): gallery block check ${id} says why`);
  else if (isShippedId(id) && shippedBlock(id)) say(`one of Gallery's own blocks, not yet in this workspace: gallery block add ${shippedBlock(id).pack === SHIPPED_SCOPE ? shippedBlock(id).name : id} puts it in`);
  else say(`no custom block of that id in this workspace: gallery block list lists them`);
}

// The references of page.html `text` to files: one to its own assets/ (assets/<file>, or the address
// the server serves it at) to a file there by a name the route serves; a picture, a frame, a stylesheet, a
// script or a font written relative any other way is one nothing serves on a custom page (a link, <a href>, may
// name another page or a document by a relative address, and is not looked at).
function referenceProblems(text, { folder, slug }) {
  const problems = [];
  const own = `${pageAssetAddress(slug, "assets/")}`;
  for (const reference of referencesWhere(text, () => true)) {
    const value = reference.value.trim();
    const link = ["a", "area"].includes(reference.node.tagName) && reference.how === "href";
    const file = referencedFile(value) ?? (value.startsWith(own) ? referencedFile(value.slice(own.length - "assets/".length)) : null);
    const quoted = `"${value.length > 60 ? `${value.slice(0, 60)}…` : value}"`;
    const said = reference.how === "css" ? `<style>'s url() ${quoted}` : `<${reference.node.tagName}>'s ${reference.how === "style" ? "style url()" : reference.how} ${quoted}`;
    if (file !== null) {
      if (!assetFile(file)) problems.push({ line: reference.line, what: `${said} names a file the server serves none by: the page's own files go right in pages/${slug}/assets/, each named with letters, digits, dots, dashes and underscores (assets/cover.png)` });
      // The route sends a file that is no picture, stylesheet or script as bytes for saving (octet-stream,
      // nosniff, attachment): a frame of it downloads it; a font, a video or audio uses the bytes.
      else if (FRAMES.has(reference.node.tagName) && !imageFile(file)) problems.push({ line: reference.line, what: `${said}: a frame of a file of the page's assets/ downloads it and shows nothing, as the server hands out a page's own file that is no picture, stylesheet or script for saving only: write what it shows in the page itself, frame a site by its https address, or offer the file with a link, <a href="${file}" download>` });
      else if (!existsSync(path.join(folder, file))) problems.push({ line: reference.line, what: `${said}: ${file} is not in the page's folder (${shown(path.join(folder, "assets"))}): put the file there${imageFile(file) ? "" : ", or link to it"}` });
      continue;
    }
    if (link || !value || /^(?:[a-z][a-z0-9+.-]*:|\/|#|\?)/i.test(value)) continue;
    problems.push({ line: reference.line, what: `${said} is relative to /pages/${slug}, where nothing is served: put the file in pages/${slug}/assets/ and write assets/<file>` });
  }
  return problems;
}

// ---------- settings no one gave ----------

/**
 * The cards whose block cannot show anything without a setting (its manifest's settings, `required`) that
 * the card's settings part leaves empty, by the workspace's catalog `catalog`: [{ id, block, line, empty:
 * [{ key, label, zh }] }], in the page's order. A setting counts as empty where the part has no value for it,
 * or an empty one, and its default is none (a weather card with no city, a countdown with no date): the card
 * then shows its ask for one, not what it is for, which no picture of the page says.
 */
export function emptyRequired(text, catalog) {
  const own = withCardIds(text).text;
  const found = [];
  for (const card of readPage(own).cards) {
    const block = card.block ? catalog.packages.get(card.block) : null;
    if (!block?.settings?.some((field) => field.required) || !block.parts.settings) continue;
    const part = partsOf(unplacedOf(own, card), firstInstance, { ...block, parts: { settings: block.parts.settings } })?.parts.find(({ name }) => name === "settings");
    let values = {};
    try {
      values = part?.text.trim() ? JSON.parse(part.text) : {};
    } catch {
      continue; // a part that is no JSON is another check's
    }
    const empty = emptyRequiredOf(block, values);
    if (empty.length) found.push({ id: card.id, block: card.block, line: card.node.sourceCodeLocation?.startLine ?? 1, empty });
  }
  return found;
}

/** What a note says of one card of emptyRequired's. */
export const emptyRequiredSaid = ({ id, block, empty }) => `card ${id} (${block}) holds no ${empty.map(({ key, label, zh }) => `${key} (${zh && zh !== label ? `${label}, ${zh}` : label})`).join(" and no ")} in its settings, which it cannot show anything without: it shows its ask for one (the grip at its top right › 设置…), and no picture of the page shows what it is for. Ask the user for it, or take it from what the workspace says (写作偏好, the documents), write it in the card's settings part, and tell them in the handoff which you did`;

// ---------- what changed ----------

// A card's place as written, "x 0, y 2, 4 × 2" (its raw attributes), and its board where the page has
// more than one (`boards`): "x 0, y 2, 4 × 2 on side".
const cellsSaid = (card, boards = false) => {
  const value = (axis) => attr(card.node, `data-${axis}`) ?? "-";
  return `x ${value("x")}, y ${value("y")}, ${value("w")} × ${value("h")}${boards ? ` on ${card.board ?? "-"}` : ""}`;
};
// Where a card stands, its board and its x and y as written; its size, its w and h.
const placeOf = (card) => `${card.board},${attr(card.node, "data-x")},${attr(card.node, "data-y")}`;
const sizeOf = (card) => `${attr(card.node, "data-w")},${attr(card.node, "data-h")}`;

/**
 * What tells page.html `after` from `before`, card by card, by the workspace's catalog: { added, removed,
 * moved, resized, data, markup, page }: each card added (taken out) { id, block, cells }; moved and
 * resized { id, block, was, now } (their cells said, and their board where the page has more than
 * one: a card on another board is moved, its cells the same or not); data { id, block, parts } (a part its block edits
 * as data, each with the lines it took out and put in: changesOf's parts); markup { id, block } (a card
 * changed outside its place and its data parts, or one of a block the workspace has not); page, the
 * lines of the page's own HTML outside its cards that changed ({ removed, added }) or null; and
 * `kept`, the cards that did not change. The cards' ids are read as the page service gives them.
 */
export function pageChanges(before, after, catalog) {
  const [was, now] = [withCardIds(before).text, withCardIds(after).text];
  const [a, b] = [readPage(was).cards, readPage(now).cards];
  const boards = new Set([...a, ...b].map((card) => card.board)).size > 1;
  const said = (card) => cellsSaid(card, boards);
  const changes = { added: [], removed: [], moved: [], resized: [], data: [], markup: [], page: null, kept: 0 };
  for (const card of a) if (!b.some((one) => one.id === card.id)) changes.removed.push({ id: card.id, block: card.block, cells: said(card) });
  for (const card of b) if (!a.some((one) => one.id === card.id)) changes.added.push({ id: card.id, block: card.block, cells: said(card) });
  for (const card of b) {
    const old = a.find((one) => one.id === card.id);
    if (!old) continue;
    const [moved, resized] = [placeOf(old) !== placeOf(card), sizeOf(old) !== sizeOf(card)];
    if (moved) changes.moved.push({ id: card.id, block: card.block, was: said(old), now: said(card) });
    if (resized) changes.resized.push({ id: card.id, block: card.block, was: said(old), now: said(card) });
    // Its markup but its place, its data parts told from the rest by its block (its manifest's parts).
    const [markupA, markupB] = [unplacedOf(was, old), unplacedOf(now, card)];
    if (markupA === markupB) {
      if (!moved && !resized) changes.kept += 1;
      continue;
    }
    const found = old.block === card.block ? catalog.packages.get(card.block) : null;
    const data = found ? { ...found, parts: Object.fromEntries(Object.entries(found.parts).filter(([, part]) => part.edit === "data")) } : null;
    const [inA, inB] = data ? [partsOf(markupA, firstInstance, data), partsOf(markupB, firstInstance, data)] : [null, null];
    if (!inA || !inB) {
      changes.markup.push({ id: card.id, block: found ? card.block : null });
      continue;
    }
    const parts = inA.parts.flatMap(({ name, text }, index) => (text === inB.parts[index].text ? [] : [{ name, ...linesChanged(text, inB.parts[index].text), runs: changedLines(text, inB.parts[index].text) }]));
    if (parts.length) changes.data.push({ id: card.id, block: card.block, parts });
    if (inA.outside !== inB.outside) changes.markup.push({ id: card.id, block: card.block });
  }
  // The page's own HTML: the text outside every card, the same cards on either side taken out.
  const outside = (text, cards) => {
    let rest = "";
    let cursor = 0;
    for (const card of [...cards].sort((x, y) => x.start - y.start)) {
      rest += text.slice(cursor, card.start);
      cursor = card.end;
    }
    return rest + text.slice(cursor);
  };
  // The blanks between its tags aside: a card put in or taken out takes its line with it.
  const [pageA, pageB] = [outside(was, a), outside(now, b)];
  const blanks = (text) => text.replace(/\s+/g, " ");
  if (blanks(pageA) !== blanks(pageB)) changes.page = linesChanged(pageA.replace(/^\s*\n/gm, ""), pageB.replace(/^\s*\n/gm, ""));
  return changes;
}

/** What a change the page wrote since the baseline, a gesture of the user's on it, ends its line with. */
export const USERS_MARK = "(the user's, on the page)";
/**
 * What a change Gallery made itself since the baseline ends its line with: the cards of the default home
 * page (src/editor/home-page.mjs), which its page service told as Gallery's own, `by` "gallery", so that an
 * Agent's first check of a new workspace's home page reads them as neither the user's gestures nor its own.
 */
export const GALLERYS_MARK = "(put there by Gallery)";

/**
 * `changes` (pageChanges') with each change the page wrote since their baseline marked `user: true`: a
 * gesture of the user's on the page, by the page service's writes since (`writes`: pageWritesSince's,
 * those `by` the page; gallery page add's are the Agent's), a card added or taken out by a write that
 * added it or took it out, one moved or resized by one that changed its cells, its data or its markup
 * by one that changed its content (shared/page-cards.mjs cardsChanged's kinds). A change Gallery's own
 * writes made (`by` "gallery") and the page's did not is marked `gallery: true`: the user's mark wins
 * where both wrote that kind of change to the card (a reader's own 恢复默认卡片 is a write by the page).
 */
export function markedTheUsers(changes, writes) {
  const told = (writer) => {
    const kinds = new Map();
    for (const write of writes) {
      if (write.by !== writer) continue;
      for (const [id, list] of Object.entries(write.cards ?? {})) kinds.set(id, new Set([...(kinds.get(id) ?? []), ...(Array.isArray(list) ? list : [])]));
    }
    return kinds;
  };
  const users = told("page");
  const gallerys = told("gallery");
  const by = (kind) => (change) => {
    const user = Boolean(users.get(change.id)?.has(kind));
    return { ...change, user, ...(!user && gallerys.get(change.id)?.has(kind) ? { gallery: true } : {}) };
  };
  return {
    ...changes, added: changes.added.map(by("added")), removed: changes.removed.map(by("removed")), moved: changes.moved.map(by("cells")),
    resized: changes.resized.map(by("cells")), data: changes.data.map(by("content")), markup: changes.markup.map(by("content")),
  };
}

/** The lines that say pageChanges' `changes` (`since`: what they are told against, as a line ends), the user's own marked (markedTheUsers). */
export function changesSaid(changes, since) {
  const named = ({ id, block }) => `${id}${block ? ` (${block})` : ""}`;
  const mark = (card) => (card.user ? ` ${USERS_MARK}` : card.gallery ? ` ${GALLERYS_MARK}` : "");
  const lines = [];
  for (const card of changes.added) lines.push(`  added    ${named(card)} at ${card.cells}${mark(card)}`);
  for (const card of changes.removed) lines.push(`  removed  ${named(card)}, which stood at ${card.cells}${mark(card)}`);
  for (const card of changes.moved) lines.push(`  moved    ${named(card)}: ${card.was} then ${card.now}${mark(card)}`);
  for (const card of changes.resized) if (!changes.moved.some((one) => one.id === card.id)) lines.push(`  resized  ${named(card)}: ${card.was} then ${card.now}${mark(card)}`);
  for (const card of changes.data) lines.push(`  data     ${named(card)}: ${partsSaid(card.parts)}${mark(card)}`, ...writtenLines(card.parts).map((line) => `         ${line}`));
  for (const card of changes.markup) lines.push(`  markup   ${named(card)}: its markup outside its place and its data parts${card.block ? "" : " (a block the workspace has not: its markup whole)"}${mark(card)}`);
  if (changes.page) lines.push(`  page     its own HTML outside the cards: -${changes.page.removed} +${changes.page.added} of its ${changes.page.lines} line${changes.page.lines === 1 ? "" : "s"}`);
  if (lines.length === 0) return [`No change since ${since}: every card where it was, with the data it had.`];
  const marked = ["added", "removed", "moved", "resized", "data", "markup"].some((kind) => changes[kind].some((card) => card.user));
  const gallerys = ["added", "removed", "moved", "resized", "data", "markup"].some((kind) => changes[kind].some((card) => card.gallery));
  return [
    `Changes since ${since}:`, ...lines, ...(changes.kept ? [changes.kept === 1 ? "  The other card as it was." : `  The other ${changes.kept} cards as they were.`] : []),
    ...(marked ? [`  Each change marked ${USERS_MARK} is the user's own gesture on the page since then (a move, a resize, a card added or deleted there, what they typed in it), which the page wrote: leave it as it is, never put it back.`] : []),
    ...(gallerys ? [`  Each change marked ${GALLERYS_MARK} is Gallery's own doing, not the user's and not yours: the cards it put on the home page when it made it (问候与日期, 便签): leave it as it is.`] : []),
  ];
}

/**
 * What a page check tells its changes against: the page as the last check that found nothing looked at
 * it ({ text, since, at: the time it read page.html, its file's mtime }), else the newest version the
 * page service kept before a write (`at`: when it kept it, right before that write), else null.
 */
export async function baselineOf(root, slug) {
  const { qa, state } = layoutOf(root);
  const checked = path.join(qa, slug, "checked.html");
  const text = await fsp.readFile(checked, "utf8").catch(() => null);
  if (text !== null) {
    const { mtime } = await fsp.stat(checked);
    return { text, since: `the last check that found nothing (${stamp(mtime)}, local time, ${shown(checked)})`, at: mtime.getTime() };
  }
  const folder = path.join(state, "pages", slug);
  const kept = (await fsp.readdir(folder).catch(() => [])).filter((name) => /^\d{15}-\d{4}\.html$/.test(name)).sort();
  if (kept.length === 0) return null;
  const newest = path.join(folder, kept.at(-1));
  const at = Number(kept.at(-1).slice(0, 15));
  return { text: await fsp.readFile(newest, "utf8"), since: `the page as it was before its last write (${stamp(new Date(at))}, local time; used because no check has passed yet)`, at };
}
const stamp = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

// ---------- the look ----------

// Called in the page: what a look finds of its cards and of the page (`instance`: what an instance of a
// custom block is, installed.mjs INSTANCE; `attribute`: the one that names its block), and the reads of the
// workspace (workspace.query) the page still waits an answer to (watchQueries): { kind, block, waited }.
function looked(instance, attribute) {
  const tag = (node) => `<${node.localName}${node.getAttribute("src") ? ` src="${node.getAttribute("src").slice(0, 80)}"` : ""}>`;
  const cards = [...document.querySelectorAll(".gallery-board > .gallery-card")].map((card) => {
    const board = card.parentElement.getBoundingClientRect();
    const box = card.getBoundingClientRect();
    const held = [...card.children].find((child) => child.matches(instance));
    return {
      id: card.getAttribute("data-card-id"),
      block: held?.getAttribute(attribute) ?? null,
      out: box.width > 0 && (box.left < board.left - 1 || box.right > board.right + 1),
      tall: card.scrollHeight > card.clientHeight + 1 ? { needs: card.scrollHeight, has: card.clientHeight } : null,
      wide: card.scrollWidth > card.clientWidth + 1 ? { needs: card.scrollWidth, has: card.clientWidth } : null,
      fallback: Boolean(held?.hasAttribute("data-doc-fallback")),
      error: (card.querySelector(".doc-kit-error")?.textContent ?? "").trim() || null,
      broken: [...card.querySelectorAll("img")].filter((img) => img.complete && img.naturalWidth === 0).map(tag),
    };
  });
  const broken = [...document.querySelectorAll("img")].filter((img) => !img.closest(".gallery-card") && img.complete && img.naturalWidth === 0).map(tag);
  const width = document.documentElement.scrollWidth;
  const stuck = [...(globalThis.__galleryQueries?.pending.values() ?? [])].map(({ kind, block, at }) => ({ kind, block, waited: Date.now() - at }));
  return { cards, broken, stuck, wide: width > innerWidth + 1 ? width : 0, columns: document.querySelector(".gallery-board")?.getAttribute("data-columns") ?? null };
}

/**
 * The page at `address` looked at in `browser` at each width and theme, pictured whole into `out`:
 * { problems: [{ card, kind, what, looks }], notes, pictures, unverified, stuck }, each problem once with
 * the looks it was found in ("1280 light"). A note is a problem's shape and no failure: a card pictured
 * before the workspace answered what it reads (the page waits `wait` ms, QUERIES, for the answers once
 * it is drawn: a card whose block needs "workspace" shows nothing until one comes), said of the cards
 * that read the workspace (`readers`: the ids of the blocks that do) when the read cannot be told to a
 * block.
 *
 * Nothing waits without a bound. Each step of a look is asked of the browser with one (answered:
 * `limits`.answer, the page's opening .loading, its drawing .ready); the look of one width and theme
 * as a whole has one too (.looking), which holds for what no step's does, a call the browser never
 * answers, however it is asked (testing the skill with Agents, 2026-11-09: a check that waited 15 minutes at its
 * second picture); and a tab or a context that will not close is let go after .closing ms. A look that
 * stops answering is a problem of the page, said with the step it waited for and `stuck` true: the looks
 * after it are not made, and the caller closes the browser, which ends what still waits.
 */
export async function look(browser, { address, out, readers = new Set(), wait = QUERIES, limits = {} }) {
  const { loading = LOADING, ready = READY, answer = ANSWER, closing = CLOSING, looking = LOOKING } = limits;
  const found = new Map(); // a problem's key -> { card, what, looks }
  const noted = new Map(); // a note's key -> { card, what, looks }
  const pictures = [];
  let given = false; // the look given up: what it goes on to find is no one's
  const add = (key, card, what, view, into = found) => {
    if (given) return;
    const entry = into.get(key) ?? { card, what, looks: [] };
    entry.looks.push(view);
    into.set(key, entry);
  };
  let doing = "a browser context opened"; // what the look in hand waits for
  const ask = (promise, what, ms = answer) => {
    doing = what;
    return answered(promise, what, ms);
  };
  const views = LOOK_WIDTHS.flatMap((width) => THEMES.map((theme) => ({ width, theme, view: `${width} ${theme}` })));
  let context = null;
  const lookAt = async ({ width, theme, view }) => {
    const tab = await ask(context.newPage(), "a tab opened");
    try {
      tab.on("pageerror", (error) => add(`error ${firstLine(error)}`, null, `the page threw: ${firstLine(error)}`, view));
      tab.on("console", (message) => {
        if (message.type() === "error" && !/^Failed to load resource/.test(message.text())) add(`console ${message.text().split("\n")[0]}`, null, `the console says ${message.text().split("\n")[0]}`, view);
      });
      tab.on("response", (response) => {
        const url = new URL(response.url());
        if (response.status() >= 400 && url.origin === new URL(address).origin && url.pathname !== "/favicon.ico") add(`request ${url.pathname}`, null, `${url.pathname} answered ${response.status()}`, view);
      });
      await ask(refuseDialogs(tab, { add: (type) => add(`dialog ${type}`, null, `it opened a dialog (${type}), which stops a reader's page until it is answered`, view) }), "the tab was set to refuse dialogs");
      await ask(watchQueries(tab), "the tab was set to watch the page's reads of the workspace");
      await ask(tab.setViewport({ width, height: HEIGHT }), `the window went to ${width}px`);
      await ask(tab.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme }]), `the ${theme} theme came`);
      await ask(tab.goto(address, { waitUntil: "load", timeout: 0 }), "the page opened", loading);
      await ask(tab.waitForSelector("html[data-doc-ready][data-doc-drawn]", { timeout: 0 }), "the page was drawn (its html got data-doc-drawn)", ready);
      await ask(tab.evaluate(() => document.fonts?.ready.then(() => true)), "the page's fonts loaded");
      const main = await ask(tab.$("main"), "the page's main was found") ?? await ask(tab.$("body"), "the page's body was found");
      await ask(main.evaluate(drawn, { still: STILL, step: STEP, wait }), "the page held still");
      const seen = await ask(tab.evaluate(looked, INSTANCE, ATTRIBUTE), "the page was looked at");
      for (const { kind, block, waited } of seen.stuck) {
        const asking = seen.cards.filter((card) => (block ? card.block === block : readers.has(card.block)));
        const what = (whose) => `the workspace had not answered ${whose} read of "${kind}" ${Math.round(waited / 1000)} s after it asked, so its picture shows it before it drew what it reads, which the picture then does not tell (open the page in Gallery to see it)`;
        if (asking.length) for (const card of asking) add(`unanswered ${card.id} ${kind}`, card.id, what("its"), view, noted);
        else add(`unanswered ${kind}`, null, what("a card's"), view, noted);
      }
      if (seen.wide) add("wide", null, `the page is ${seen.wide}px wide in a window ${width}px wide: something of its own reaches past the window (a width of its own, a long word), and a reader scrolls it sideways`, view);
      for (const picture of seen.broken) add(`broken ${picture}`, null, `a picture that does not load: ${picture}`, view);
      for (const card of seen.cards) {
        if (card.fallback) add(`fallback ${card.id}`, card.id, `its block failed: the card shows what its instance holds, read-only${card.error ? ` (${card.error.slice(0, 200)})` : ""}`, view);
        if (card.out) add(`out ${card.id}`, card.id, "it is drawn out of its board", view);
        if (card.tall) add(`tall ${card.id}`, card.id, `what it holds does not fit it: ${card.tall.needs}px high in a card that shows ${card.tall.has}px, the rest scrolling inside the card (give the card more cells, data-h, or a size its block lists; a block whose content grows says card.fit "content")`, view);
        if (card.wide) add(`wide ${card.id}`, card.id, `what it holds is wider than the card: ${card.wide.needs}px in a card ${card.wide.has}px wide`, view);
        for (const picture of card.broken) add(`broken ${card.id} ${picture}`, card.id, `a picture that does not load: ${picture}`, view);
      }
      const picture = path.join(out, `${width}-${theme}.png`);
      await ask(tab.screenshot({ path: picture, fullPage: true }), "the page was pictured");
      if (!given) pictures.push(picture);
    } finally {
      await closed(tab.close(), closing);
    }
  };
  const result = (rest) => ({ problems: [...found.values()], notes: [...noted.values()], pictures, unverified: null, stuck: false, ...rest });
  let at = null; // the look in hand
  try {
    context = await ask(browser.createBrowserContext(), "a browser context opened");
    for (const each of views) {
      at = each;
      await within(lookAt(each), looking, () => doing);
    }
    return result({});
  } catch (error) {
    if (await wentAway(browser)) return result({ unverified: `the browser went while it looked (${firstLine(error)})` });
    if (!error.stuck) return result({ unverified: `the look stopped: ${firstLine(error)}` });
    add("stopped", null, stoppedSaid(error, views.indexOf(at ?? views[0]) < views.length - 1), (at ?? views[0]).view);
    return result({ stuck: true });
  } finally {
    given = true;
    await closed(context?.close(), closing);
  }
}

// A look of its own that is given up after `ms` ms, with what it waited for then (`doing()`) as the stopped one's: the bound
// of a look as a whole, which each step's own does not stand for.
function within(attempt, ms, doing) {
  let timer = 0;
  const late = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error(doing()), { stuck: true, doing: doing(), limit: ms, whole: true })), ms); });
  return Promise.race([attempt, late]).finally(() => clearTimeout(timer));
}

// What a look that stopped answering says (stuckSaid's words for a step, or the whole look's), and what follows from it.
function stoppedSaid(error, later) {
  const waited = error.whole ? `the look was not done in ${seconds(error.limit)}, waiting until ${error.doing}` : stuckSaid(error);
  return `${waited}; the look stopped here and the browser was closed${later ? ", so the looks after it were not made" : ""}. A script of the page that never ends does this, and so may a browser that stalled: run the check once more, and if it stops at the same place again, the page holds it up`;
}

// The looks a problem was found in, said together: "at 1280 and 1920, light and dark".
function looksSaid(looks) {
  const widths = [...new Set(looks.map((view) => view.split(" ")[0]))];
  const themes = [...new Set(looks.map((view) => view.split(" ")[1]))];
  const list = (items) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);
  return `at ${list(widths)}px${themes.length === THEMES.length ? "" : `, ${list(themes)}`}`;
}

/** gallery page check: `named`, the page's slug. */
export async function pageCheckCommand(root, named) {
  if (named.length !== 1) throw new UsageError("gallery page check takes one page's slug.");
  const [slug] = named;
  const files = pageFiles(slug, root);
  if (!pageExists(slug, root)) {
    console.error(await missingPageSaid(slug, root));
    process.exit(1);
  }
  // When page.html was read: the time of the baseline this check keeps, which the page's writes after it are told against.
  const readAt = new Date();
  const text = await fsp.readFile(files.html, "utf8");
  const name = path.basename(files.html);
  const catalog = readCatalog(root);
  const { boards, cards } = readPage(text);
  console.log(`${slug}: ${shown(files.html)}, ${boards.length} board${boards.length === 1 ? "" : "s"} and ${cards.length} card${cards.length === 1 ? "" : "s"}`);
  const lines = []; // the problems, said before the verdict
  const structure = structureProblems(text, { catalog, folder: files.folder, slug });
  for (const { line, what } of structure) lines.push(`  FAIL ${name}:${line}: ${what}`);
  console.log(structure.length ? `Structure: ${structure.length} problem${structure.length === 1 ? "" : "s"}` : "Structure: nothing wrong (the page's own HTML, scripts and frames its own; every board's and card's id once, one instance a card, the cells on the board and none shared, every block one a page runs, every file of assets/ there)");
  for (const line of lines) console.log(line);
  // The cards and their ids as the page shows them.
  for (const card of readPage(withCardIds(text).text).cards) console.log(`  ${card.id}  ${card.block ?? "(no instance)"}  x ${card.x}, y ${card.y}, ${card.w} × ${card.h}${boards.length > 1 ? `  on ${card.board}` : ""}  ${name}:${card.node.sourceCodeLocation?.startLine}`);
  // Notes, no failures: a card that asks for what no one gave it.
  const asking = emptyRequired(text, catalog);
  for (const card of asking) console.log(`  note ${name}:${card.line}: ${emptyRequiredSaid(card)}`);
  const baseline = await baselineOf(root, slug);
  const writes = baseline ? await pageWritesSince(layoutOf(root).state, slug, baseline.at) : [];
  console.log((baseline ? changesSaid(markedTheUsers(pageChanges(baseline.text, text, catalog), writes), baseline.since) : ["No earlier version to tell changes against: the next check that finds nothing keeps this one, and says what changed since."]).join("\n"));

  const cardLine = new Map(readPage(withCardIds(text).text).cards.map((card) => [card.id, card.node.sourceCodeLocation?.startLine ?? 1]));
  const verdict = (problems, unverified = null, unanswered = 0) => {
    if (problems) return { line: `FAIL ${slug}: ${problems} problem${problems === 1 ? "" : "s"}`, code: 1 };
    if (unverified) return { line: `UNVERIFIED ${slug}: ${unverified}; its structure was checked, and nothing is wrong with it`, code: 3 };
    // A card pictured before the workspace answered it is no failure, and the picture says nothing of what it shows: said where the last line is read too.
    // So is a card that asks for a setting no one gave: its picture is the ask.
    const asked = asking.length ? `; and ${asking.length === 1 ? "one card asks" : `${asking.length} cards ask`} for a setting no one gave (see "note" above): ${asking.map(({ id, empty }) => `${id} (${empty.map(({ key }) => key).join(", ")})`).join(", ")}` : "";
    return { line: `OK   ${slug}: its structure, and its ${cards.length} card${cards.length === 1 ? "" : "s"} at ${LOOK_WIDTHS.join(", ")}px in light and dark${unanswered ? `; but ${unanswered === 1 ? "one card was" : `${unanswered} cards were`} pictured before the workspace answered it (see "note" above), so ${unanswered === 1 ? "its picture does" : "their pictures do"} not show what ${unanswered === 1 ? "it reads" : "they read"}` : ""}${asked}`, code: 0 };
  };
  const server = await serverFor({ command: `gallery page check ${slug}` });
  const end = async (problems, unverified, unanswered = 0) => {
    const { line, code } = verdict(problems, unverified, unanswered);
    console.log(line);
    if (code === 0) {
      const kept = path.join(layoutOf(root).qa, slug, "checked.html");
      await fsp.mkdir(path.dirname(kept), { recursive: true });
      await fsp.writeFile(kept, text);
      await fsp.utimes(kept, readAt, readAt);
    }
    process.exitCode = code;
  };
  if (!server.ok) return end(structure.length, `${server.message}, so the page was not looked at`);
  const executablePath = findBrowser();
  if (!executablePath) return end(structure.length, "no Chrome, Edge or Chromium found (GALLERY_BROWSER=<its executable> picks one), so the page was not looked at");
  await dropStale(root);
  const copy = await scratchCopy(root, { directory: files.folder, files, text });
  const out = path.join(layoutOf(root).qa, slug, "check");
  let running = null;
  try {
    const { pageAloneOf } = await import("./page.mjs");
    const address = pageAloneOf(server.port, copy.slug);
    console.log(`Looked at: ${address} (a scratch copy of ${slug}, gone at the end: nothing a block does as it opens writes ${name}), at ${LOOK_WIDTHS.join(", ")}px, light and dark`);
    try {
      running = await startBrowser({ executablePath, args: lookingArguments() });
    } catch (error) {
      return end(structure.length, `the browser ${executablePath} did not start, twice (${firstLine(error)}), so the page was not looked at`);
    }
    await fsp.rm(out, { recursive: true, force: true });
    await fsp.mkdir(out, { recursive: true });
    const readers = new Set([...catalog.packages.values()].filter(({ needs }) => needs?.includes("workspace")).map(({ id }) => id));
    const seen = await look(running.browser, { address, out, readers });
    // A look that stopped answering leaves the browser with calls it never answers: closed before the verdict says so.
    if (seen.stuck) {
      await running.close();
      running = null;
    }
    for (const { card, what, looks } of seen.problems) console.log(`  FAIL ${name}:${card ? cardLine.get(card) ?? 1 : 1}: ${card ? `card ${card}: ` : ""}${what} (${looksSaid(looks)})`);
    // Not a failure: a card the workspace had not answered when it was pictured. Each is told with its block, whose card it is.
    const blockOf = new Map(readPage(text).cards.map((card) => [card.id, card.block]));
    for (const { card, what, looks } of seen.notes) console.log(`  note ${name}:${card ? cardLine.get(card) ?? 1 : 1}: ${card ? `card ${card}${blockOf.get(card) ? ` (${blockOf.get(card)})` : ""}: ` : ""}${what} (${looksSaid(looks)})`);
    if (seen.pictures.length) {
      console.log(`Pictures of the page in ${shown(out)}: ${seen.pictures.map((file) => path.basename(file)).join(", ")}`);
      // A hint: where the pictures are, the page at 1280 in the light theme named as the whole of it; none needs opening.
      console.log(unopenedSaid([{ folder: path.dirname(out), files: seen.pictures }], { first: seen.pictures.filter((file) => /(?:^|[\\/])1280-light\.png$/.test(file)) }));
    }
    return end(structure.length + seen.problems.length, seen.unverified, new Set(seen.notes.map(({ card }) => card ?? "")).size);
  } finally {
    await running?.close();
    await dropScratch(root, copy.slug);
  }
}
