import fs from "node:fs";
import { glyphSvg } from "../render/emoji.mjs";
import { readCatalog, SETTINGS_PART } from "../shared/component-catalog.mjs";
import { iconKind } from "../shared/emoji/icon-value.mjs";
import { narrowPlaces } from "../shared/board-places.mjs";
import { cardsOf } from "../shared/page-cards.mjs";
import { headOf, pageExists, pageFiles, readPageMeta, setPageMeta } from "../shared/pages.mjs";
import { findPreviewServer } from "../shared/preview-server.mjs";
import { headPage, pageHeadKey } from "../shared/sidebar-head.mjs";
import { createWorkspaceService } from "../workbench/service.mjs";
import { UsageError } from "./arguments.mjs";
import { missingPageSaid, pageServiceOp, settingsGiven } from "./page.mjs";
import { shown } from "./report-start.mjs";
import { throughServer as workspaceServer } from "./tree.mjs";

// What the sidebar's menus and a page's own gestures do to a custom page, for an Agent the user asks
// (since 2026-11-11): gallery page set <slug> [--title] [--icon] (the sidebar's
// 重命名, and an icon), gallery page move <slug> (--after <page> | --first) (the sidebar head's drag),
// gallery page card <slug> <card id> (--set | --move | --size | --remove) (a card's settings, its drag and
// resize, its removal) and gallery page reset-cards <slug> (the page menu's 恢复默认卡片). The commands call
// the functions the interface calls: the title is src/shared/pages.mjs renamePage's (setPageMeta), the head
// the workbench service's `head` (through the workspace's running server when there is one, else the same
// code here), the cards the page service's place, settings, remove and restore-defaults
// (src/editor/page-service.mjs), through the running server's queue or the same code here (./page.mjs
// pageServiceOp): the open page shows each change at once. Each prints what changed. Exits 0 done; 1 when a page, a card or a block is not there or the service refuses; 2 for
// a mistake in the command line.

const tidy = (value) => value.replace(/\s+/g, " ").trim();
const quoted = (value) => (value === null || value === undefined ? "none" : JSON.stringify(value));
// An icon of the 图标 tab as Git Bash hands it over: a Windows path of its own in place of the word's first / (gallery set's too).
const unbashed = (value) => value.replace(/^[a-z]:\/(?:[^/]+\/)*?(?=icons\/(?:tabler\/)?[^/]+$)/i, "/");

/** The page `slug` must exist: else its absence is said and the command ends (exit 1). */
async function requirePage(root, slug) {
  const meta = await readPageMeta(slug, root);
  if (!meta) {
    console.error(await missingPageSaid(slug, root));
    process.exit(1);
  }
  return meta;
}

// ---------- set ----------

export async function setPage(root, [slug, ...more], _options, values) {
  if (!slug || more.length) throw new UsageError("Name one page, then what to set: --title, --icon.");
  if (!values.has("--title") && !values.has("--icon")) throw new UsageError('Say what to set: --title "<title>", --icon <emoji|icon|none>.');
  const title = values.has("--title") ? tidy(values.get("--title")) : undefined;
  if (title === "") throw new UsageError("--title takes the words of the title: a page's title is never empty.");
  if (title !== undefined && title.length > 200) throw new UsageError("A page's title is 200 characters at most.");
  let icon;
  if (values.has("--icon")) {
    const value = unbashed(values.get("--icon").trim());
    const kind = value === "none" ? "none" : iconKind(value);
    if (!["none", "emoji", "glyph"].includes(kind) || /["<>&]/.test(value)) throw new UsageError(`Not an icon a custom page takes: ${value} (an emoji, none, or an icon of the 图标 tab as /icons/<name>_<color>.svg; not a picture).`);
    if (kind === "glyph" && !glyphSvg(value)) throw new UsageError(`No such icon of the 图标 tab: ${value}.`);
    icon = kind === "none" ? null : value;
  }
  const was = await requirePage(root, slug);
  let now;
  try {
    now = await setPageMeta(slug, { title, icon }, root);
  } catch (error) {
    if (error.code === "title") throw new UsageError(error.message);
    throw error;
  }
  const said = [
    ...(title !== undefined && now.title !== was.title ? [`  title: ${quoted(was.title)} → ${quoted(now.title)}`] : []),
    ...(icon !== undefined && now.icon !== was.icon ? [`  icon: ${quoted(was.icon)} → ${quoted(now.icon)}`] : []),
  ];
  if (!said.length) return void console.log(`Nothing to change: ${slug} has ${values.size === 1 ? "that already" : "those already"}.`);
  console.log(`Set the page ${slug} (page.json):`);
  for (const line of said) console.log(line);
  if (title !== undefined && now.title !== was.title) console.log(`提示：page.html's own <title> is the page's, written by you: it was not changed (the sidebar shows page.json's title). Change it too where the page should say the new name.`);
}

// ---------- move ----------

// A workspace command (the workbench service's `head`) through the workspace's running server, else here.
async function workspaceCommand(root, name, body) {
  const server = await findPreviewServer();
  const answer = server ? await workspaceServer(server, body, name) : null;
  if (answer) return answer;
  const [, result] = await createWorkspaceService({ edits: {}, reports: {}, reportsDirectory: root }).run(name, body);
  return result;
}

export async function movePage(root, [slug, ...more], options, values) {
  if (!slug || more.length) throw new UsageError("gallery page move takes one page's slug.");
  const after = values.get("--after");
  const first = options.has("--first");
  if (after === undefined && !first) throw new UsageError("Say where it goes: --after <page> or --first.");
  if (after !== undefined && first) throw new UsageError("--after and --first are two places: give one.");
  await requirePage(root, slug);
  if (after !== undefined) {
    if (after === slug) {
      console.error(`${slug} cannot go after itself.`);
      process.exit(1);
    }
    if (!pageExists(after, root)) {
      console.error(`No page "${after}" to put ${slug} after: gallery page list lists those there are.`);
      process.exit(1);
    }
  }
  const head = await headOf(root);
  const key = pageHeadKey(slug);
  const rest = head.filter((one) => one !== key);
  // --first: before the first page's row (新建 and 搜索 stay where they are); --after: right after that page's row.
  const at = first ? rest.findIndex((one) => headPage(one) !== null) : rest.indexOf(pageHeadKey(after)) + 1;
  const order = [...rest];
  order.splice(at === -1 ? order.length : at, 0, key);
  const listed = async () => (await headOf(root)).map(headPage).filter(Boolean);
  if (order.join() === head.join()) {
    console.log(`${slug} is there already.`);
    console.log(`Pages, in the sidebar's order: ${(await listed()).join(", ")}`);
    return;
  }
  const answer = await workspaceCommand(root, "head", { order });
  if (!answer?.ok) {
    console.error(`Not moved: ${answer?.message ?? answer?.reason ?? "no answer"}.`);
    process.exit(1);
  }
  console.log(`Moved the page ${slug} ${first ? "to the first place among the pages" : `after ${after}`} in the sidebar's head.`);
  console.log(`Pages, in the sidebar's order: ${(await listed()).join(", ")}`);
}

// ---------- card ----------

// What a card op's refusal says, by its reason (the service's `reason`, or `refused`): each a function of
// { id: the card, slug: the page, key: what the service names (a setting's key) }.
const REFUSED = {
  gone: ({ id }) => `The card ${id} is not on the page any more.`,
  changed: ({ id }) => `The card ${id} kept changing while it was being written (the open page, or another write): run this again.`,
  resize: ({ id }) => `The card ${id}'s block cannot be resized (its manifest's card has no resize, or the size is none it takes): --move still moves it.`,
  cells: () => "--move and --size take whole numbers: x and y from 0, w from 1 to 12 and h from 1.",
  block: ({ id }) => `The card ${id}'s block does not load, so its data cannot be written: gallery block check says why.`,
  settings: ({ id }) => `The card ${id} has no settings part, or its block no settings: --set goes with a block whose manifest has some.`,
  values: ({ id, key }) => `The card ${id}'s setting ${key ? `"${key}" ` : ""}does not take that value (a text of 10,000 characters at most, a number, a date, one of a select's options, a switch's true or false).`,
  size: () => "page.html would grow past 1,000,000 bytes.",
  busy: () => "page.html was written again and again meanwhile: run this again.",
  defaults: ({ slug }) => `The page ${slug} has no default cards: only a page whose page.json says "defaultCards": true (the default home page) has.`,
  missing: ({ slug }) => `No custom page "${slug}".`,
};
const refusalSaid = (answer, status, fields) => {
  const reason = answer?.reason ?? answer?.refused;
  return REFUSED[reason]?.({ ...fields, key: answer?.message }) ?? `Not written (${status}: ${reason ?? "no answer"}${answer?.message ? `: ${answer.message}` : ""}).`;
};

// The card `id` of page `slug` as the page service sees it now ({ id, board, x, y, w, h, narrow, base, block }), or null.
function cardNow(root, slug, id) {
  const cards = cardsOf(fs.readFileSync(pageFiles(slug, root).html, "utf8"));
  return { card: cards.find((one) => one.id === id) ?? null, cards };
}

// Card `id`'s place in its board's narrow view as the page draws it (`cards`: cardsOf's; narrowPlaces), or null.
function narrowNow(cards, id) {
  const board = cards.find((one) => one.id === id)?.board;
  const on = cards.filter((one) => one.board === board);
  const at = on.findIndex((one) => one.id === id);
  return at === -1 ? null : narrowPlaces(on)[at];
}

// One op on a card (the service holds each to the card's base: a hash of its markup), read again up to three
// times where another write changed the card meanwhile. { status, answer, viaServer }.
async function cardOp(root, slug, id, body) {
  let last;
  for (let tries = 0; tries < 3; tries++) {
    const { card } = cardNow(root, slug, id);
    if (!card) return { status: 409, answer: { ok: false, refused: "gone" } };
    last = await pageServiceOp(root, slug, { ...body, card: id, base: card.base, agent: true });
    if (last.answer?.refused !== "changed") break;
  }
  return last;
}

const cellsSaid = ({ x, y, w, h }) => `x ${x}, y ${y}, w ${w}, h ${h}`;
const NUMBERS = /^(\d+),(\d+)$/;

// A card's settings part as the service shows it (a JSON text), parsed, or {}.
const settingsIn = (part) => {
  try {
    const value = JSON.parse(part ?? "");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
};

export async function cardCommand(root, [slug, id, ...more], options, values, sets = []) {
  if (!slug || !id || more.length) throw new UsageError("gallery page card takes a page's slug and a card's id (gallery page check lists the cards): gallery page card <slug> <card id> --set|--move|--size|--remove.");
  const remove = options.has("--remove");
  // --narrow: --move and --size act on the board's narrow view (its own layout, NARROW columns: the page as a
  // narrow window shows it), as a drag there does; the wide view's places stay.
  const narrow = options.has("--narrow");
  const moveWritten = values.get("--move");
  const sizeWritten = values.get("--size");
  if (!sets.length && moveWritten === undefined && sizeWritten === undefined && !remove) throw new UsageError("Say what to do with the card: --set <key>=<value>, --move <x>,<y>, --size <w>,<h>, or --remove.");
  if (remove && (sets.length || moveWritten !== undefined || sizeWritten !== undefined)) throw new UsageError("--remove goes alone: it takes the card off the page.");
  if (narrow && moveWritten === undefined && sizeWritten === undefined) throw new UsageError("--narrow goes with --move or --size: the card's place in the narrow view (8 columns).");
  const move = moveWritten === undefined ? null : NUMBERS.exec(moveWritten);
  if (moveWritten !== undefined && !move) throw new UsageError(REFUSED.cells());
  const size = sizeWritten === undefined ? null : NUMBERS.exec(sizeWritten);
  if (sizeWritten !== undefined && (!size || Number(size[1]) < 1 || Number(size[2]) < 1)) throw new UsageError(REFUSED.cells());
  if (!pageExists(slug, root)) {
    console.error(await missingPageSaid(slug, root));
    process.exit(1);
  }
  const { card: before, cards } = cardNow(root, slug, id);
  if (!before) {
    console.error(`No card "${id}" on the page ${slug}: ${cards.length ? `its cards are ${cards.map((one) => one.id).join(", ")}` : "it has none"} (gallery page check lists them).`);
    process.exit(1);
  }
  // The settings, held to the block's fields before anything is written (a UsageError, exit 2).
  let settings = null;
  if (sets.length) {
    const found = readCatalog(root).packages.get(before.block);
    if (!found) {
      console.error(REFUSED.block({ id }));
      process.exit(1);
    }
    settings = settingsGiven(sets, found);
  }
  let latest = { cards, answer: null };
  let wasSettings = null;
  let viaServer = false;
  const failed = ({ answer, status }) => {
    console.error(`Not ${remove ? "removed" : "changed"}: ${refusalSaid(answer, status, { id, slug })}${latest.answer ? " (the place was written already; the settings were not)" : ""}`);
    process.exit(1);
  };
  if (remove) {
    const done = await cardOp(root, slug, id, { op: "remove" });
    if (!done.answer?.ok) failed(done);
    console.log(`Removed the card ${id} (${before.block ?? "no block"}, board ${before.board}: ${cellsSaid(before)}) from ${shown(pageFiles(slug, root).html)}${done.viaServer ? " (through the workspace's running server: an open page shows it at once)" : ""}.`);
    console.log(`Its data went with it (page.html as it was is kept in .gallery/state/pages/${slug}/, the last 20 versions); gallery page add ${slug} ${before.block ?? "<block>"} puts a new card of its block in.`);
    return;
  }
  if (move || size) {
    const done = await cardOp(root, slug, id, { op: "place", ...(narrow ? { view: "narrow" } : {}), ...(move ? { x: Number(move[1]), y: Number(move[2]) } : {}), ...(size ? { w: Number(size[1]), h: Number(size[2]) } : {}) });
    if (!done.answer?.ok) failed(done);
    latest = { cards: done.answer.cards, answer: done.answer };
    viaServer ||= done.viaServer;
  }
  if (settings) {
    const done = await cardOp(root, slug, id, { op: "settings", values: settings });
    if (!done.answer?.ok) failed(done);
    latest = { cards: done.answer.cards, answer: done.answer };
    wasSettings = settingsIn(done.answer.parts?.[SETTINGS_PART]?.was);
    viaServer ||= done.viaServer;
  }
  // The view acted on: the wide places, or with --narrow the narrow ones, each card's before as the narrow view
  // drew it (narrowPlaces: one of no narrow place where the view puts it).
  const inView = (one, all) => (narrow ? { ...one, ...(narrowNow(all, one.id) ?? {}) } : one);
  const now = inView(latest.cards.find((one) => one.id === id) ?? before, latest.cards);
  const was = inView(before, cards);
  const differs = (a, b) => a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h;
  const moved = latest.cards.map((one) => inView(one, latest.cards)).filter((one) => one.id !== id && cards.some((old) => old.id === one.id && differs(inView(old, cards), one)));
  console.log(`The card ${id} of ${slug} (${now.block ?? "no block"}) on board ${now.board}${narrow ? " (its narrow view)" : ""}: ${cellsSaid(now)}${!differs(now, was) ? " (the place as it was)" : ` (was ${cellsSaid(was)})`}${viaServer ? " (through the workspace's running server: an open page shows it at once)" : ""}.`);
  if (size && (now.w !== Number(size[1]) || now.h !== Number(size[2]))) console.log(`  The block's sizes gave ${now.w} × ${now.h} for the ${size[1]} × ${size[2]} asked.`);
  if (moved.length) console.log(`  Pushed down under it, as it met them: ${moved.map((one) => `${one.id} (y ${one.y})`).join(", ")}; no card moved up.`);
  if (settings) {
    const given = Object.entries(settings).map(([key, value]) => `${key}=${JSON.stringify(value)}${wasSettings && Object.hasOwn(wasSettings, key) && JSON.stringify(wasSettings[key]) !== JSON.stringify(value) ? ` (was ${JSON.stringify(wasSettings[key])})` : ""}`);
    console.log(`  Settings written: ${given.join(", ")}`);
  }
}

// ---------- reset-cards ----------

// Why a default block was not put back, as the service's `reason` says it.
const SKIPPED = { disabled: "turned off in 设置 › 组件列表", missing: "not in the workspace", places: "not a block a page takes", board: "the page has no board" };

export async function resetCards(root, [slug, ...more]) {
  if (!slug || more.length) throw new UsageError("gallery page reset-cards takes one page's slug.");
  if (!pageExists(slug, root)) {
    console.error(await missingPageSaid(slug, root));
    process.exit(1);
  }
  const { status, answer, viaServer } = await pageServiceOp(root, slug, { op: "restore-defaults", agent: true });
  if (!answer?.ok) {
    console.error(`Nothing put back: ${refusalSaid(answer, status, { slug })}`);
    process.exit(1);
  }
  const file = shown(pageFiles(slug, root).html);
  const added = answer.added ?? [];
  const skipped = answer.skipped ?? [];
  if (added.length === 0 && skipped.length === 0) return void console.log(`The page ${slug} holds a card of every default block already: nothing to put back.`);
  if (added.length) {
    console.log(`Put back ${added.length} default card${added.length === 1 ? "" : "s"} on ${file}${viaServer ? " (through the workspace's running server: an open page shows them at once)" : ""}:`);
    for (const { card, block } of added) {
      const cell = answer.cards.find((one) => one.id === card);
      console.log(`  data-card-id="${card}" of ${block}${cell ? `, board ${cell.board}: ${cellsSaid(cell)}` : ""}`);
    }
  } else console.log(`No default card was put back on ${file}.`);
  for (const { block, reason } of skipped) console.log(`  Not put back: ${block} (${SKIPPED[reason] ?? reason})`);
}
