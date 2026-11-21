import { readFileSync, statSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { offUntilInstalled } from "../shared/block-packs.mjs";
import { LANGUAGE_PICTURES, PICTURES, SETTINGS_PART, currentCatalog, packageAddress, pictureOf, templateOf } from "../shared/component-catalog.mjs";
import { packOf, refusedInCopy, unlistedBy } from "../shared/components/installed.mjs";
import { writeAtomic } from "../shared/files.mjs";
import { sendJson, serveFound } from "../shared/http.mjs";
import { jsonIn } from "../shared/json-layout.mjs";
import { GRID, NARROW, defaultSize, dropped, freeSpot, narrowPlaces, onBoard, pushDown, settle, sizeFor } from "../shared/board-places.mjs";
import { CARD_ID_PATTERN, baseOf, cardMarkup, cardWith, cardsChanged, cardsOf, freeCardId, oneCard, readPage, withCard, withCardIds, withCells, withoutCard } from "../shared/page-cards.mjs";
import { FIRST_BOARD, HOME, HOME_CARDS, HOME_SIZES, closeHomeHint, pageExists, pageFiles, pageVersion, tellHomeCards } from "../shared/pages.mjs";
import { OWN_SCOPE, PACK_FILE, readPackManifest } from "../shared/pack-manifest.mjs";
import { packsDirectory } from "../shared/paths.mjs";
import { sameDirectory } from "../shared/preview-server.mjs";
import { addShipped, followShipped, isShippedId, shippedBlocks, shippedPackIds, shippedState } from "../shared/shipped-blocks.mjs";
import { walk } from "../shared/html-tree.mjs";
import { closePageHint, pageDefaults } from "../shared/pages.mjs";
import { FILES } from "./components/files.mjs";

// The page service (docs/render.md "A custom page"):
// the one way a custom page's own gestures reach its page.html, as a document's reach its doc.html
// through the edit service. POST /__gallery/pages/<slug>/cards takes one op, checked as every write
// of the server is (Host, Origin, the token, a JSON body: the edit service's check) and run in the
// queue the server's other writes run in (its respond), one at a time:
//
//   place     a card at other cells; the cards it then shares a cell with pushed down, never one up; a
//             drop's (the page's drag) with `swap`, the card it exchanges with (board-places.mjs landing):
//             the two exchanged where that is clean on the board as the file has it now (`dropped`,
//             board-places.mjs exchange: the two changing sides within the cells they span, no third card
//             met, none moved up), else pushed down as a place without it
//   arrange   several cards at cells of their own at once, others pushed down where they then meet
//             (what the page's undo of a place or a resize sends: the cards it pushed go back up)
//   (place and arrange with `view: "narrow"` act on the board's narrow view: NARROW columns, each card's
//   data-narrow-x, -y, -w and -h, the view as the page draws it (board-places.mjs narrowPlaces) its start;
//   what they write is every card of the board whose narrow place is not what the view now has, so that the
//   narrow view arranged once has a place of its own for each card. The user's word of 2026-11-13: the
//   wide view and the narrow one each arranged, the same cards on both.)
//   add       a card of a block, at the first free spot by the block's default size (or where it is
//             told), in the wide view and, where the board's narrow view has places of its own or the add
//             says `view: "narrow"` (the page's narrow view added to), at the narrow view's first free spot
//             too, Gallery's own block put into the workspace first when it is not there yet (and
//             a copy as it was added brought up to Gallery's: shared/shipped-blocks.mjs followShipped,
//             which the library runs too); or, with `html`, a card as remove gave it back (the page's
//             undo of a remove)
//   remove    a card taken out
//   edit      a block's data part (or several) written, as the editor's commit writes one in a
//             document (installed/file.mjs rewrite: the part's inside alone, what fits)
//   settings  the values of a card's settings (its manifest's `settings`) written into its settings part
//   restore-defaults  a page's with the default cards (its page.json's defaultCards, the default home
//             page's: shared/pages.mjs pageDefaults), a card of each of its default blocks
//             (shared/pages.mjs HOME_CARDS) that no card of it holds, put in as `add` puts one, at the
//             first free spot by its default size, every other card and byte as it was
//
// Each names its card by its id and is held to the card's base, a hash of its markup as the file
// writes it (shared/page-cards.mjs): another card changed meanwhile, or the page's head, changes
// nothing of it; this card changed is refused, { refused: "changed" }, and a card no longer there,
// { refused: "gone" } (409). A page whose cards have no id gets them with its first write (cardIds:
// the ids it was served with). The file is read again right before it is replaced (writeAtomic's
// expect: a write between the two runs the op again), and kept as it was before, in
// .gallery/state/pages/<slug>/, the last KEEP; each write is told there too, in writes.jsonl (WRITES_FILE,
// the last WRITES: { at, op, by, cards }, `by` "agent" for an op that says `agent: true`, gallery page
// add's, "gallery" for a write Gallery makes of its own accord (apply's `by` option: the default home
// page's cards, src/editor/home-page.mjs), else "page", a reader's gesture on the page; `cards` the cards
// it changed, cardsChanged), which gallery page check marks the user's changes and Gallery's own by. An op answers { ok: true, version (the page's now),
// before (the version it was applied to: another than the page knew says someone else wrote it
// meanwhile, which the page then shows), cards: [{ id, board, x, y, w, h, base, block }] }, and what
// the page's undo needs: an add the card's id and its markup (`card`, `html`; and `pushed`, the ids
// of the cards it pushed down, which gallery page add says), a remove the card it
// took out (`removed`: { id, board, html }), an edit and a settings each part's inside before and
// after (`parts`: name -> { was, now }), as the page shows them (`shown`: its own files' addresses
// where the server serves them), which its undo puts on the page and sends back, and a restore-defaults
// the cards it put in (`added`: [{ card, block, html, name }], the add's own for each) and the default
// blocks it did not (`skipped`: [{ block, reason, name }], reason as an add's refusal says it: disabled,
// missing, places, board).
//
// POST /__gallery/pages/<slug>/hint (checked and queued as the cards' ops are) closes the page's
// first-open note for good (shared/pages.mjs closePageHint, .gallery/hints.json): the page map says
// `hint` no more; with { cards: true } its note of new default cards (every default card told of:
// tellHomeCards), which a restore-defaults that wrote tells too: the page map says `news` no more.

/** How many versions of a page.html are kept before its writes. */
export const KEEP = 20;
/** The file of a page's folder of the state its writes are told in, a JSON line each, and how many of them stay. */
export const WRITES_FILE = "writes.jsonl";
export const WRITES = 200;

/**
 * The writes the page service told of page `slug` (its state in `stateDirectory`) at `since` (a time
 * in ms) or after: [{ at, op, by ("page": a reader's gesture; "agent": gallery page add's; "gallery": Gallery's own, the default home page's cards), cards: { <id>:
 * kinds } }], the oldest first; none where it told none.
 */
export async function pageWritesSince(stateDirectory, slug, since) {
  const text = await fs.readFile(path.join(stateDirectory, "pages", slug, WRITES_FILE), "utf8").catch(() => "");
  return text.split("\n").flatMap((line) => {
    try {
      const write = JSON.parse(line);
      return write && typeof write.at === "number" && write.at >= since && write.cards && typeof write.cards === "object" ? [write] : [];
    } catch {
      return [];
    }
  });
}

// Who wrote each page.html last through the service (its path -> { text, by }, by as writes.jsonl says it), in
// this process, whichever server's service wrote it: what the routes ask of a write the watcher tells
// (pageWriterOf), so that a reader's gesture on the page, or Gallery's own write, is no page written by
// someone else (server/updates.mjs; an Agent's write of the file itself, or gallery page add's, is).
const lastWrites = new Map();

/** Who wrote `file` (a page.html) as `text` holds it: the service's last write of it ("page", "agent" or "gallery"), or null (anyone else's, or none). */
export function pageWriterOf(file, text) {
  const last = lastWrites.get(path.resolve(file));
  return last && typeof text === "string" && last.text === text ? last.by : null;
}

const OPS = ["place", "arrange", "add", "remove", "edit", "settings", "restore-defaults"];
const isCount = (value) => Number.isInteger(value) && value >= 0;
const isSize = (value) => Number.isInteger(value) && value >= 1;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const fail = (status, reason, message) => [status, { ok: false, reason, ...(message ? { message } : {}) }];

/**
 * A part's markup as a block's edit sends it (`html`, what its page shows), each address of a file of
 * the page's own assets/ written back as the folder's (assets/<file>): the page is served with them
 * addressed where the server serves them, /pages/<slug>/assets/<file> (render/page-html.mjs
 * withPageAssets), which the file never holds. An address in an attribute, after a quote, or in a
 * style's url( ), and one in a srcset after its comma.
 */
export function withOwnAssets(html, slug) {
  return typeof html === "string" ? html.replace(new RegExp(`(^|[\\s"'(,=])/pages/${slug}/assets/`, "g"), "$1assets/") : html;
}

const refused = (why) => [409, { ok: false, refused: why }];

// A picture file as it is now (its size and when it was written, short), what its address in the library carries
// so that a picture made again is fetched anew, or null where there is none.
function pictureMark(file) {
  try {
    const { size, mtimeMs } = statSync(file);
    return `${size.toString(36)}-${Math.round(mtimeMs).toString(36)}`;
  } catch {
    return null;
  }
}

// What a page's block is to its cards (the catalog's word for it): { state ("page": it runs on a
// custom page; "document": its places lack page; "disabled": turned off), card, settings, places,
// fit, bare, name, parts (where each part it edits as data is: name -> its selector) }, or null for one
// the workspace has not (or that does not load: its kit says why).
export function blockOn(catalog, id) {
  const found = catalog.packages.get(id);
  if (found) {
    return {
      state: found.places.includes("page") ? "page" : "document", card: found.card, settings: found.settings, places: found.places,
      fit: found.card.fit, bare: found.card.bare, name: found.name,
      parts: Object.fromEntries(Object.entries(found.parts).filter(([, part]) => part.edit === "data").map(([name, part]) => [name, part.at])),
    };
  }
  if (catalog.settings.disabled.includes(id) && catalog.problems.has(id)) return { state: "disabled", card: null, settings: [], places: [], fit: "fixed", bare: false, name: null, parts: {} };
  return null;
}

// Whether `value` can be setting `field`'s value (its type's, a select's one of its options).
function fitsSetting(value, { type, options }) {
  if (type === "text" || type === "document") return typeof value === "string" && value.length <= 10_000;
  if (type === "number") return (typeof value === "number" && Number.isFinite(value)) || value === null;
  if (type === "select") return options.includes(value);
  if (type === "date") return value === "" || (typeof value === "string" && DATE.test(value));
  if (type === "switch") return typeof value === "boolean";
  return false;
}

/**
 * The cells an op names, held to whole numbers: { x, y, w, h } or null where any is not one. `need`:
 * the fields it must give (x and y for a place; w and h are its own where not given).
 */
function cellsIn(body, { x, y, w, h }) {
  const at = { x: body.x ?? x, y: body.y ?? y, w: body.w ?? w, h: body.h ?? h };
  return isCount(at.x) && isCount(at.y) && isSize(at.w) && isSize(at.h) ? at : null;
}

/**
 * `root`: the workspace; `edits`: the edit service (its check and its queue); `stateDirectory`: its
 * state, where the kept versions go; `catalog()`: the catalog in use (shared/component-catalog.mjs
 * currentCatalog); `catalogTaken()`: what the server does once a block was put into components/ (its
 * watcher takes the catalog at once and tells the pages); `shipped`: the folder of Gallery's own blocks
 * (the package's, a test's of its own); `log(text)`: the server's log; `shown(html, slug)`: a part's
 * inside as page `slug` shows it (the server's: render/page-html.mjs withPageAssets, its own files'
 * addresses where it serves them), what an edit's and a settings' `parts` answer with.
 */
export function createPageService({ root, edits, stateDirectory, catalog = () => currentCatalog(root), catalogTaken = () => {}, shipped = undefined, log = () => {}, shown = (html) => html }) {
  let kept = 0;
  // Page.html as it was, kept before a write replaces it: the newest KEEP of them stay.
  async function keep(slug, text) {
    const folder = path.join(stateDirectory, "pages", slug);
    await fs.mkdir(folder, { recursive: true });
    kept = (kept + 1) % 10000;
    await fs.writeFile(path.join(folder, `${String(Date.now()).padStart(15, "0")}-${String(kept).padStart(4, "0")}.html`), text);
    const names = (await fs.readdir(folder)).filter((name) => /^\d{15}-\d{4}\.html$/.test(name)).sort();
    for (const name of names.slice(0, Math.max(0, names.length - KEEP))) await fs.rm(path.join(folder, name), { force: true });
  }
  // A write told in the page's writes.jsonl, the newest WRITES kept: what a page check tells the user's
  // gestures by. One that cannot be told takes nothing from the write.
  async function tell(slug, write) {
    const file = path.join(stateDirectory, "pages", slug, WRITES_FILE);
    try {
      const lines = (await fs.readFile(file, "utf8").catch(() => "")).split("\n").filter(Boolean);
      lines.push(JSON.stringify({ at: Date.now(), ...write }));
      await writeAtomic(file, `${lines.slice(-WRITES).join("\n")}\n`);
    } catch (error) {
      log(`the write of ${slug}'s page.html could not be told in ${WRITES_FILE}: ${error.message}`);
    }
  }

  // The card an op names, held to its base: { card } or the refusal.
  function cardNamed(text, body) {
    if (typeof body.card !== "string") return { error: fail(400, "card") };
    const card = readPage(text).cards.find((one) => one.id === body.card);
    if (!card) return { error: refused("gone") };
    if (typeof body.base !== "string" || baseOf(text, card) !== body.base) return { error: refused("changed") };
    return { card };
  }
  const boardCards = (text, board) => readPage(text).cards.filter((card) => card.board === board).map(({ id, x, y, w, h }) => ({ id, x, y, w, h }));
  // The narrow view of board `board` as the page draws it (narrowPlaces), its cards in the file's order;
  // whether any card of it has a narrow place of its own; and what an op of the view writes: every card of
  // the board whose written narrow place is not what `after` gives it (one with none written among them).
  const narrowOf = (text, board) => narrowPlaces(readPage(text).cards.filter((card) => card.board === board).map(({ id, x, y, w, h, narrow }) => ({ id, x, y, w, h, narrow })));
  const hasNarrow = (text, board) => readPage(text).cards.some((card) => card.board === board && card.narrow);
  const narrowWrites = (text, board, after) => {
    const written = new Map(readPage(text).cards.filter((card) => card.board === board).map((card) => [card.id, card.narrow]));
    return new Map(after.filter((card) => {
      const was = written.get(card.id);
      return !was || was.x !== card.x || was.y !== card.y || was.w !== card.w || was.h !== card.h;
    }).map((card) => [card.id, card]));
  };
  // The narrow view written as `after` has it, where it is the view an op acts on, or where its places are its own.
  const withNarrow = (text, board, after) => withCells(text, narrowWrites(text, board, after), { narrow: true });
  const changes = (before, after) => new Map(after.filter((card) => {
    const was = before.find((one) => one.id === card.id);
    return !was || was.x !== card.x || was.y !== card.y || was.w !== card.w || was.h !== card.h;
  }).map((card) => [card.id, card]));

  // What a part of a card's instance holds, by the editor's reading of it (installed/file.mjs dataOf).
  const dataIn = (text, card, packages) => FILES.installed.dataOf(text, card.instance, packages) ?? {};
  // The parts written: { text, parts: name -> { was, now } }, or the refusal.
  function writeParts(text, card, parts, packages) {
    if (!card.instance || !packages.has(card.block)) return { error: fail(409, "block") };
    const was = dataIn(text, card, packages);
    const splices = FILES.installed.rewrite(text, card.instance, parts, { packages });
    if (!splices) return { error: fail(400, "part") };
    const next = [...splices].sort((a, b) => b.start - a.start).reduce((out, { start, end, text: put }) => out.slice(0, start) + put + out.slice(end), text);
    const now = dataIn(next, readPage(next).cards.find((one) => one.id === card.id), packages);
    return { text: next, parts: Object.fromEntries(Object.keys(parts).map((name) => [name, { was: was[name] ?? "", now: now[name] ?? "" }])) };
  }
  // A write's parts as the page shows them (`shown`), which the page's undo puts on it.
  function partsShown(parts, slug) {
    return Object.fromEntries(Object.entries(parts).map(([name, { was, now }]) => [name, { was: shown(was, slug), now: shown(now, slug) }]));
  }

  // Each op on `text` (every card with its id), the catalog in use: { text, extra } or { error }.
  const run = {
    place(text, body, { packages }) {
      const { card, error } = cardNamed(text, body);
      if (error) return { error };
      const narrow = body.view === "narrow";
      const columns = narrow ? NARROW : GRID.columns;
      const before = narrow ? narrowOf(text, card.board) : boardCards(text, card.board);
      const own = before.find((one) => one.id === card.id);
      let cells = cellsIn(body, own);
      if (!cells) return { error: fail(400, "cells") };
      if (body.swap !== undefined && typeof body.swap !== "string") return { error: fail(400, "swap") };
      const found = packages.get(card.block);
      // A size of its own, where its block lets it be resized (held to its sizes, or to its min and max);
      // a block whose height is its content's (no card.h nor sizes) takes any height, which the page measured.
      if (cells.w !== own.w || cells.h !== own.h) {
        const measured = found && !found.card.sizes && found.card.h === null && cells.w === own.w;
        if (found && !found.card.resize && !measured) return { error: fail(409, "resize") };
        if (found && !measured) cells = { ...cells, ...sizeFor(found.card, cells, columns) };
      }
      // A drop's exchange checked again on the file as it is now (an Agent may have written it while the card
      // was held): where it is no longer clean, the cards met pushed down, as a place of no exchange.
      const after = dropped(before, { id: card.id, ...cells, ...(body.swap !== undefined ? { swap: body.swap } : {}) }, columns);
      return { text: narrow ? withNarrow(text, card.board, after) : withCells(text, changes(before, after)) };
    },
    arrange(text, body) {
      if (!Array.isArray(body.cards) || body.cards.length === 0) return { error: fail(400, "cards") };
      const narrow = body.view === "narrow";
      const named = [];
      for (const entry of body.cards) {
        const { card, error } = cardNamed(text, entry ?? {});
        if (error) return { error };
        const cells = cellsIn(entry, narrow ? narrowOf(text, card.board).find((one) => one.id === card.id) : card);
        if (!cells) return { error: fail(400, "cells") };
        named.push({ card, cells: onBoard(cells, narrow ? NARROW : GRID.columns) });
      }
      let next = text;
      for (const board of new Set(named.map(({ card }) => card.board))) {
        const before = narrow ? narrowOf(next, board) : boardCards(next, board);
        const placed = named.filter(({ card }) => card.board === board);
        const set = before.map((one) => ({ ...one, ...(placed.find(({ card }) => card.id === one.id)?.cells ?? {}) }));
        const after = settle(set, placed.map(({ card }) => card.id));
        next = narrow ? withNarrow(next, board, after) : withCells(next, changes(before, after));
      }
      return { text: next };
    },
    async add(text, body, context) {
      const { boards, cards } = readPage(text);
      if (body.html !== undefined) return addCard(text, body, { boards, cards });
      if (typeof body.block !== "string") return { error: fail(400, "block") };
      const board = typeof body.board === "string" ? boards.find((one) => one.id === body.board) : boards.find((one) => one.id === FIRST_BOARD) ?? boards[0];
      if (!board) return { error: fail(409, "board") };
      // Gallery's own block as it was added, brought up to Gallery's first (followShipped, once a process).
      if (isShippedId(body.block, shipped) && followShipped(root, { ids: [body.block], directory: shipped, log }).updated.length > 0) {
        catalogTaken();
        context.refresh();
      }
      let found = context.packages.get(body.block);
      // Gallery's own block, not yet in the workspace, put in first; never one gallery.json turns off,
      // which the catalog says only of one there (it would be put in and then refused).
      const off = context.catalog.settings.disabled.includes(body.block);
      if (!found && !off && !context.catalog.problems.has(body.block) && isShippedId(body.block, shipped)) {
        const block = shippedBlocks(shipped).find(({ id }) => id === body.block);
        if (block && block.places.includes("page") && !shippedState(root, block).added) {
          addShipped(root, block);
          log(`${body.block} added to the workspace for a card of a custom page`);
          catalogTaken();
          context.refresh();
          found = context.packages.get(body.block);
        }
      }
      if (!found) return { error: fail(409, context.catalog.settings.disabled.includes(body.block) ? "disabled" : "missing") };
      if (!found.places.includes("page")) return { error: fail(409, "places") };
      const template = templateOf(found);
      if (!template) return { error: fail(409, "template") };
      if ((body.w !== undefined && !isSize(body.w)) || (body.h !== undefined && !isSize(body.h))) return { error: fail(400, "cells") };
      const size = defaultSize(found.card);
      const asked = body.w !== undefined || body.h !== undefined ? sizeFor(found.card, { w: body.w ?? size.w, h: body.h ?? size.h }) : size;
      const placed = board.cards.map(({ id, x, y, w, h }) => ({ id, x, y, w, h }));
      const spot = body.x !== undefined || body.y !== undefined ? { x: body.x ?? 0, y: body.y ?? 0 } : freeSpot(placed, asked);
      if (!isCount(spot.x) || !isCount(spot.y)) return { error: fail(400, "cells") };
      const id = freeCardId(cards.map((card) => card.id));
      const cells = onBoard({ ...spot, w: asked.w, h: asked.h });
      const eol = text.includes("\r\n") ? "\r\n" : "\n";
      const markup = cardMarkup({ id, ...cells }, template, "", eol);
      const put = withCard(text, board.id, markup);
      const met = changes(placed, pushDown(placed, { id, ...cells }).filter((card) => card.id !== id));
      let pushed = withCells(put.text, met);
      // The narrow view: the card at its first free spot there too (narrowPlaces puts a card of no narrow
      // place there), written where the view has places of its own or is the one added to.
      if (body.view === "narrow" || hasNarrow(text, board.id)) pushed = withNarrow(pushed, board.id, narrowOf(pushed, board.id));
      let written = readPage(pushed).cards.find((card) => card.id === id);
      // Settings given with the add (gallery page add --set): written as the card's own 设置… writes them, the
      // settings op below, checked against the block's fields, in this one write: the card is never on the page
      // without them, and a value the block refuses refuses the add.
      if (body.settings !== undefined) {
        const set = run.settings(pushed, { card: id, base: baseOf(pushed, written), values: body.settings }, context);
        if (set.error) return set;
        pushed = set.text;
        written = readPage(pushed).cards.find((card) => card.id === id);
      }
      return { text: pushed, extra: { card: id, html: pushed.slice(written.start, written.end), measure: size.measured && body.h === undefined, pushed: [...met.keys()] } };
    },
    remove(text, body) {
      const { card, error } = cardNamed(text, body);
      if (error) return { error };
      const { text: next, html } = withoutCard(text, card.id);
      return { text: next, extra: { removed: { id: card.id, board: card.board, html } } };
    },
    edit(text, body, { packages, slug }) {
      const { card, error } = cardNamed(text, body);
      if (error) return { error };
      const asked = body.parts !== undefined ? body.parts : typeof body.part === "string" ? { [body.part]: body.html } : null;
      if (!asked || typeof asked !== "object" || Array.isArray(asked) || Object.keys(asked).length === 0) return { error: fail(400, "part") };
      const parts = Object.fromEntries(Object.entries(asked).map(([name, html]) => [name, withOwnAssets(html, slug)]));
      const written = writeParts(text, card, parts, packages);
      return written.error ? written : { text: written.text, extra: { parts: partsShown(written.parts, slug) } };
    },
    settings(text, body, { packages, slug }) {
      const { card, error } = cardNamed(text, body);
      if (error) return { error };
      const found = packages.get(card.block);
      const fields = found?.settings ?? [];
      if (!found || fields.length === 0) return { error: fail(409, "settings") };
      const values = body.values;
      if (!values || typeof values !== "object" || Array.isArray(values)) return { error: fail(400, "values") };
      for (const [key, value] of Object.entries(values)) {
        const field = fields.find((one) => one.key === key);
        if (!field || !fitsSetting(value, field)) return { error: fail(400, "values", key) };
      }
      const held = dataIn(text, card, packages)[SETTINGS_PART];
      if (held === undefined) return { error: fail(409, "settings") };
      let current = {};
      try {
        current = held.trim() ? JSON.parse(held) : {};
      } catch {
        current = {};
      }
      if (!current || typeof current !== "object" || Array.isArray(current)) current = {};
      const next = { ...current, ...values };
      if (JSON.stringify(next) === JSON.stringify(current)) return { text, extra: { parts: partsShown({ [SETTINGS_PART]: { was: held, now: held } }, slug) } };
      const inside = held.trim() ? jsonIn(held, next) : JSON.stringify(next);
      const written = writeParts(text, card, { [SETTINGS_PART]: inside }, packages);
      return written.error ? written : { text: written.text, extra: { parts: partsShown(written.parts, slug) } };
    },
    // The home page's default blocks no card holds, each put in as `add` puts one (Gallery's own put
    // into the workspace first, a block turned off or not there skipped), in HOME_CARDS' order, each of its
    // size there (HOME_SIZES, else its block's default) at the first free spot the ones before it left:
    // nothing pushed, nothing else written.
    async "restore-defaults"(text, body, context) {
      if (!pageDefaults(context.slug, root)) return { error: fail(409, "defaults") };
      const held = new Set(readPage(text).cards.map((card) => card.block));
      let next = text;
      const added = [];
      const skipped = [];
      for (const block of HOME_CARDS) {
        if (held.has(block)) continue;
        const [w, h] = HOME_SIZES[block] ?? [];
        const done = await run.add(next, { op: "add", block, ...(w ? { w, h } : {}) }, context);
        const name = context.packages.get(block)?.name ?? shippedBlocks(shipped).find(({ id }) => id === block)?.title ?? null;
        if (done.error) {
          skipped.push({ block, reason: done.error[1].reason, name });
          continue;
        }
        next = done.text;
        added.push({ card: done.extra.card, block, html: done.extra.html, name });
      }
      return { text: next, extra: { added, skipped } };
    },
  };

  // A card as remove gave it back, put on its board again where it stood (or where `x`, `y` say), those
  // it meets pushed down; another id where its own is taken now. Nothing of it may run (refusedInCopy: no
  // script, handler or frame), as what a clipboard brings into a document.
  function addCard(text, body, { boards, cards }) {
    if (typeof body.html !== "string" || body.html.length > 1_100_000) return { error: fail(400, "html") };
    const markup = body.html.trim();
    const card = oneCard(markup);
    if (!card) return { error: fail(400, "html") };
    let held = refusedInCopy(card.node.tagName, card.node.attrs ?? []);
    walk(card.node, (node) => { held ||= refusedInCopy(node.tagName, node.attrs ?? []); });
    if (held) return { error: fail(400, "html") };
    const board = boards.find((one) => one.id === (typeof body.board === "string" ? body.board : FIRST_BOARD)) ?? boards[0];
    if (!board) return { error: fail(409, "board") };
    if ((body.x !== undefined && !isCount(body.x)) || (body.y !== undefined && !isCount(body.y))) return { error: fail(400, "cells") };
    const taken = cards.map((one) => one.id);
    const id = card.id && !taken.includes(card.id) && CARD_ID_PATTERN.test(card.id) ? card.id : freeCardId(taken);
    const cells = onBoard({ x: body.x ?? card.x, y: body.y ?? card.y, w: card.w, h: card.h });
    const placed = board.cards.map(({ id: other, x, y, w, h }) => ({ id: other, x, y, w, h }));
    const put = withCard(text, board.id, cardWith(markup, { id, ...cells }));
    const met = changes(placed, pushDown(placed, { id, ...cells }).filter((one) => one.id !== id));
    let pushed = withCells(put.text, met);
    // Its narrow place, as it was written, put back too, the cards of the narrow view it meets pushed down;
    // one of none, where the view has places of its own, at the view's first free spot.
    if (card.narrow || hasNarrow(text, board.id)) {
      const others = narrowOf(text, board.id);
      const after = card.narrow ? pushDown(others, { id, ...card.narrow }, NARROW) : narrowOf(pushed, board.id);
      pushed = withNarrow(pushed, board.id, after);
    }
    const now = readPage(pushed).cards.find((one) => one.id === id);
    return { text: pushed, extra: { card: id, html: pushed.slice(now.start, now.end), pushed: [...met.keys()] } };
  }

  // An op on page `slug`, in the queue: [status, body]. `by` says who wrote it when the writer is Gallery
  // itself ("gallery": makeDefaultHome's restore-defaults), told in writes.jsonl; an op that comes in a
  // request never names its writer but by its own `agent` flag (the Agent's gallery page add), so that a
  // reader's gesture stays the reader's.
  async function apply(slug, body, { by } = {}) {
    if (!body || typeof body !== "object" || !OPS.includes(body.op)) return fail(400, "op");
    if (body.workspace !== undefined && (typeof body.workspace !== "string" || !sameDirectory(body.workspace, root))) return fail(409, "elsewhere", "这个预览服务器管的是另一个目录的文档");
    if (!pageExists(slug, root)) return fail(404, "missing");
    const files = pageFiles(slug, root);
    for (let tries = 0; tries < 3; tries++) {
      const [source, meta] = await Promise.all([fs.readFile(files.html, "utf8").catch(() => null), fs.readFile(files.json, "utf8").catch(() => "")]);
      if (source === null) return fail(404, "missing");
      if (Buffer.byteLength(source) > 1_000_000) return fail(413, "size");
      const before = pageVersion(source, meta);
      const own = withCardIds(source).text;
      let held = catalog();
      const context = { slug, get catalog() { return held; }, get packages() { return held.packages; }, refresh: () => { held = catalog(); } };
      const done = await run[body.op](own, body, context);
      if (done.error) return done.error;
      const text = done.text;
      if (Buffer.byteLength(text) > 1_000_000) return fail(413, "size");
      if (text !== source) {
        await keep(slug, source);
        if (!(await writeAtomic(files.html, text, { expect: source }))) continue; // written meanwhile: the op again, on what is there now
        const writer = by === "gallery" ? "gallery" : body.agent === true ? "agent" : "page";
        lastWrites.set(path.resolve(files.html), { text, by: writer });
        await tell(slug, { op: body.op, by: writer, cards: cardsChanged(source, text) });
      }
      // The home page's default cards put back: the reader knows of them all (its note of new cards goes).
      if (body.op === "restore-defaults") await tellHomeCards(root).catch(() => {});
      return [200, { ok: true, version: pageVersion(text, meta), before, cards: cardsOf(text), ...(done.extra ?? {}) }];
    }
    return fail(409, "busy");
  }

  // What a card of a page can be (添加自定义块's library): the blocks whose places hold page and that load
  // (one turned off is none, nor one unlisted: 设置 › 组件列表's master switch off, unlistedBy, nor one of a pack switched
  // off: its pack card's; a pack of Gallery's off at first and not installed yet counts as off: offUntilInstalled),
  // and Gallery's own the workspace has not yet, which an add puts in, but one
  // gallery.json turns off (the catalog says only of one there). Each says its `picture` (component-catalog.mjs
  // pictureOf: { light, dark } of its PICTURES and, under a language's code, of each LANGUAGE_PICTURES pair it has: the
  // route's of an installed block, by its stamp; this route's `picture` of one of Gallery's own not added yet, each
  // under its pictureMark), or null where it has not its own two. Each says its pack (`pack`: the one it counts in, packOf,
  // and what its pack.json names it), which the menu makes a section of, under the pack's name (the
  // user's word of 2026-11-09, in place of the pack's name in grey after a block's that has another's
  // name): the packs in 设置 › 组件列表's order (the default pack, Gallery's own in their order, then the
  // others by id), each's blocks by their names in `language`.
  function library(language = "zh", slug = HOME) {
    // Gallery's own blocks as they were added brought up to Gallery's first (followShipped, once a process).
    if (followShipped(root, { directory: shipped, log }).updated.length > 0) catalogTaken();
    const held = catalog();
    const packsOff = [...(held.settings.packsOff ?? []), ...offUntilInstalled(root, held.settings.packs)];
    // A block by the pack it counts in (packOf: its scope, but Gallery's own blocks for documents alone, none of these, the default pack's).
    const listed = ({ id, places, listed: byDefault }) => !unlistedBy(id, byDefault, held.settings) && !packsOff.includes(packOf(id, places));
    // A pack's name: the workspace's, or for one of Gallery's own not installed here, its pack.json in the package's.
    const packName = (pack) => held.packs?.get(pack) ?? shippedPackName(pack);
    const shippedPackName = (pack) => {
      try {
        return readPackManifest(readFileSync(path.join(shipped ?? packsDirectory, pack, PACK_FILE), "utf8")).name;
      } catch {
        return null;
      }
    };
    const blocks = [...held.packages.values()].filter((found) => found.places.includes("page") && listed(found)).map((found) => ({
      id: found.id, name: found.name, description: found.description, picture: pictureOf(found),
      size: defaultSize(found.card), installed: true, settings: found.settings.length > 0, pack: { id: packOf(found.id, found.places), name: packName(packOf(found.id, found.places)) },
    }));
    for (const block of shippedBlocks(shipped)) {
      if (!block.places.includes("page") || held.packages.has(block.id) || held.problems.has(block.id) || held.settings.disabled.includes(block.id) || !listed(block) || shippedState(root, block).added) continue;
      // A pair of its pictures by this route, each under its mark (the file as it is now: a picture made again keeps no address of before), or null where it has not both.
      const pair = (names, language) => {
        const marks = Object.values(names).map((name) => pictureMark(path.join(block.folder, name)));
        if (marks.includes(null)) return null;
        const at = (theme, mark) => `/__gallery/pages/${encodeURIComponent(slug)}/picture?id=${encodeURIComponent(block.id)}&theme=${theme}${language ? `&language=${language}` : ""}&v=${mark}`;
        return { light: at("light", marks[0]), dark: at("dark", marks[1]) };
      };
      const picture = pair(PICTURES, null);
      for (const [language, names] of Object.entries(LANGUAGE_PICTURES)) {
        const other = picture && pair(names, language);
        if (other) picture[language] = other;
      }
      let card = null;
      try {
        card = JSON.parse(readFileSync(path.join(block.folder, "component.json"), "utf8")).card ?? null;
      } catch {}
      blocks.push({ id: block.id, name: block.title, description: block.description, picture, size: defaultSize(card), installed: false, settings: false, pack: { id: packOf(block.id, block.places), name: packName(packOf(block.id, block.places)) } });
    }
    const named = (block) => block.name?.[language] ?? block.name?.zh ?? block.id;
    // The packs as shared/block-packs.mjs workspacePacks orders them (the default pack, Gallery's own, then the rest by id), each's blocks by name.
    const packIds = shippedPackIds(shipped);
    const rank = ({ pack }) => (pack.id === OWN_SCOPE ? -1 : packIds.includes(pack.id) ? packIds.indexOf(pack.id) : packIds.length);
    return blocks.sort((a, b) => rank(a) - rank(b) || (a.pack.id === b.pack.id ? 0 : a.pack.id < b.pack.id ? -1 : 1) || named(a).localeCompare(named(b), "zh-CN") || (a.id < b.id ? -1 : 1));
  }

  // A page's first-open note closed, or with `cards` its note of new default cards: [status, body].
  async function closeHint(slug, body) {
    if (!pageExists(slug, root)) return fail(404, "missing");
    if (body?.cards === true) await tellHomeCards(root);
    else await closePageHint(root, slug);
    return [200, { ok: true }];
  }

  /** Answer /__gallery/pages/<slug>/<what>: POST cards (an op), POST hint (a page's first-open note closed), GET library, GET picture (one of a block's of Gallery's own not added yet). */
  function handle(request, response, slug, what) {
    if ((what === "cards" || what === "hint") && request.method === "POST") {
      return edits.respond(async (checkedRequest) => {
        const checked = await edits.check(checkedRequest);
        if (checked.error) return checked.error;
        return what === "hint" ? closeHint(slug, checked.body) : apply(slug, checked.body);
      })(request, response);
    }
    if (what === "library" && request.method === "GET") {
      const host = request.headers.host ?? "";
      const port = request.socket.localPort;
      if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return sendJson(response, 403, { ok: false, reason: "host" });
      if (!pageExists(slug, root)) return sendJson(response, 404, { ok: false, reason: "missing" });
      const language = new URL(request.url ?? "/", "http://localhost").searchParams.get("language") === "en" ? "en" : "zh";
      return sendJson(response, 200, { ok: true, blocks: library(language, slug) });
    }
    // A picture of one of Gallery's own blocks the workspace has not added (library's `picture`): ?id=<its id>&theme=light|dark,
    // &language=en for its English pair, its bytes as the package ships them; kept by the browser for good under its
    // mark (&v=: pictureMark, the file as it is now), as a block's own files are under their stamp.
    if (what === "picture" && request.method === "GET") {
      const query = new URL(request.url ?? "/", "http://localhost").searchParams;
      const block = shippedBlocks(shipped).find(({ id }) => id === query.get("id"));
      const language = query.get("language");
      const names = language === null ? PICTURES : Object.hasOwn(LANGUAGE_PICTURES, language) ? LANGUAGE_PICTURES[language] : null;
      const file = names && Object.hasOwn(names, query.get("theme") ?? "") && block ? path.join(block.folder, names[query.get("theme")]) : null;
      return (async () => {
        const mark = file ? pictureMark(file) : null;
        const bytes = mark ? await fs.readFile(file).catch(() => null) : null;
        serveFound(response, bytes, { type: bytes ? "image/webp" : undefined, headers: { "X-Content-Type-Options": "nosniff", "Cache-Control": bytes && query.get("v") === mark ? "max-age=31536000, immutable" : "no-store" } });
      })();
    }
    const known = ["cards", "library", "hint", "picture"].includes(what);
    return sendJson(response, known ? 405 : 404, { ok: false, reason: known ? "method" : "unknown" });
  }

  return { handle, apply, library };
}
