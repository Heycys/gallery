import path from "node:path";
import { homeOff } from "../editor/home-page.mjs";
import { createPageService } from "../editor/page-service.mjs";
import { readCatalog } from "../shared/component-catalog.mjs";
import { editStateDirectory, reportsDirectory } from "../shared/paths.mjs";
import { FIRST_BOARD, HOME, createPage, listPages, pageExists, pageFiles, pageSlugRefused, pagesSettings, readPageMeta } from "../shared/pages.mjs";
import { findPreviewServer } from "../shared/preview-server.mjs";
import { SHIPPED_SCOPE, isShippedId, shippedBlock } from "../shared/shipped-blocks.mjs";
import { commandArguments, isOption, UsageError } from "./arguments.mjs";
import { GESTURES, pairsOf } from "./component.mjs";
import { shown } from "./report-start.mjs";
import { AGENT_LINE, USER_LINE, addressOf, browserLine, serverFor, serverLines } from "./server-process.mjs";
import { PAGE_TRY_SYNOPSIS, synopsisOf } from "./usage.mjs";

// gallery page new <slug> "<title>" | list [--json] | open <slug> [--no-browser] | add <slug> <block> [--board
// <id>] [--x --y --w --h] [--set <key>=<value>]… | set <slug> [--title] [--icon] | move <slug> (--after <page> |
// --first) | card <slug> <card id> (--set --move --size | --remove) | reset-cards <slug> (./page-manage.mjs: what
// the sidebar's menus and a page's own gestures do, for an Agent the user asks) | try <slug> <card id> <gesture…>
// [--keep] | check <slug> (./usage.mjs): the
// workspace's custom pages (自定义页, src/shared/pages.mjs),
// for an Agent: new makes one (pages/<slug>/ with page.html, its title and one empty board, and
// page.json), list says which there are, in the sidebar's order, open gives one's address on the
// workspace's server (found or started, as gallery open does) and opens the browser there
// (--no-browser, or GALLERY_NO_BROWSER=1, opens none), and add puts a card of a block on a board: at the
// first free spot by the block's default size, or where --x, --y (and --w, --h) say, those it meets
// pushed down, its card id given, its settings written with it where --set gives some (each `key=value`,
// held to the setting's type by settingsGiven, written by the service's settings op in the add's own
// write: testing the skill with Agents on 2026-11-09, there was no way to give a weather card its city but a hand edit of
// page.html) (the page service's add: src/editor/page-service.mjs, the one rule the
// page's own 添加自定义块 follows), written through the workspace's running server when there is one (its
// queue, so that an open page's gestures and this write never race; the page shows the card at once),
// else into page.html here, the file kept first as the service keeps it; try makes a reader's gestures
// on one card in the page (./page-try.mjs: gallery block try's, aimed at a card) and check says what is
// wrong with a page and what changed in it (./page-check.mjs). A page's slug and a document's are one
// set of names, and no page is special by its slug: new makes `home` as any page, where none is there
// (the default home page, 首页, is one a server makes as it first starts in a workspace, src/editor/home-page.mjs,
// which another command never does: list, and open, add, try and check of `home`, say that it comes
// then, in place of "no custom page", while it is not made yet; a page an Agent makes as `home` before
// that start is the workspace's home page, kept as it is, and Gallery's is made no more). A page new
// makes goes last among the sidebar's head rows (shared/pages.mjs createPage). With a server running, new ends with the 交给用户 line gallery open has (the
// page's address, sent to the user at once) and list gives each page's whole address.
// Exits 0 done; 1 when the slug is refused or the page is not there, the block is not one a page takes,
// or no server answers; 2 for a mistake in the command line.

/** A custom page's address in the workbench of the server on `port`: #@<slug>. */
export const pageAddressOf = (port, slug) => `${addressOf(port)}#@${slug}`;
/** The custom page alone, as the server shows it (/pages/<slug>), for the Agent's own look. */
export const pageAloneOf = (port, slug) => `http://127.0.0.1:${port}/pages/${slug}`;

// What list and an add to home say while the home page is not made yet (HOME_NOT_MADE), or null: there is
// no pages/home, gallery.json does not say one was made (a home the user took away stays away, said
// nothing of), the slug is not a document's or the trash's, and no GALLERY_NO_DEFAULT_HOME keeps the server
// from making one.
export const HOME_NOT_MADE = "The default home page (首页, slug home) is not made yet: Gallery makes it, with its own cards, when its server first starts in this workspace. gallery open --no-browser starts it: run that once, then gallery page list again.";
async function homeNotMade(root) {
  if (homeOff() || pageExists(HOME, root) || pagesSettings(root).homeMade || await pageSlugRefused(HOME, root)) return null;
  return HOME_NOT_MADE;
}

/**
 * What is said of the custom page `slug` that is not there: for the home page that waits for the
 * server's first start (HOME_NOT_MADE), that alone, in place of "no custom page"; else the plain line.
 */
export async function missingPageSaid(slug, root) {
  const unmade = slug === HOME ? await homeNotMade(root) : null;
  return unmade ?? `No custom page "${slug}": ${shown(pageFiles(slug, root).html)} does not exist (gallery page list lists those there are).`;
}

// The port of the workspace's server for the 交给用户 line and the list's whole addresses, or null when
// none runs (or one of another workspace's, an older Gallery's: findPreviewServer's own check). Only one
// that answers there as the server its announcement names (`answering`, as gallery open asks): a server
// stopped without closing leaves its announcement behind, and its process's number may be another
// program's by now, so that the address would be a dead one, the Agent's first message to the user.
async function runningPort(root) {
  return (await findPreviewServer({ answering: true, timeout: 2000 }))?.port ?? null;
}

async function newPage(root, [slug, title, ...more]) {
  if (!slug || !title?.trim() || more.length) throw new UsageError("Name the slug and the title, the title quoted when it has spaces.");
  const refused = await pageSlugRefused(slug, root);
  if (refused) {
    console.error(refused);
    process.exit(1);
  }
  const files = await createPage(slug, title, { root });
  console.log(`Created ${shown(files.html)} and page.json`);
  console.log(`It is listed in the workbench's sidebar, last among the rows under 新建 and 搜索 (the user may drag it elsewhere), and shows one empty board (data-board-id="main"): use it, or write the page as you like.`);
  const port = await runningPort(root);
  const write = `write page.html: a board of cards (each <section class="gallery-card" data-card-id="…" data-x data-y data-w data-h> around one custom block's instance; gallery page add places one), or any HTML, CSS and script of your own (references/pages-and-data.md)`;
  const sidebar = `at the end tell them where it is in the sidebar (under 新建 and 搜索, its title)`;
  // The address sent to the user now, either way (skills/gallery/references/pages-and-data.md, Working on a custom page, step 2),
  // so that they watch the cards arrive: with no server, the command that starts one and prints it comes first;
  // when the cards are written is the Agent's.
  if (port) {
    console.log(`下一步：send the user the address on the last line now, in a message of its own (the page is theirs to watch as its cards arrive); ${write}; ${sidebar}.`);
    console.log(`${USER_LINE}${pageAddressOf(port, slug)}`);
  } else console.log(`下一步：run gallery page open ${slug} --no-browser now (it starts the server) and send the user the address on its 交给用户 line, in a message of its own (the page is theirs to watch as its cards arrive); then ${write}; ${sidebar}.`);
}

async function listAll(root, rest, options) {
  if (rest.length) throw new UsageError("gallery page list takes nothing else.");
  const pages = await listPages(root);
  const unmade = await homeNotMade(root);
  if (options.has("--json")) {
    // One JSON object, nothing else (the fields of ./usage-sections.mjs, only ever added to).
    const port = await runningPort(root);
    console.log(JSON.stringify({
      workspace: path.resolve(root),
      server: port ? { port } : null,
      pages: pages.map(({ slug, title, icon, defaultCards }) => ({ slug, title, icon, defaultCards, address: port ? pageAddressOf(port, slug) : `/#@${slug}`, file: path.resolve(pageFiles(slug, root).html) })),
      homeNotMade: Boolean(unmade),
    }, null, 2));
    return;
  }
  console.log(`工作区：${shown(root)}`);
  // No page at all, and the home page the one to come: that is what is said, not that there is none to make.
  if (pages.length === 0 && !unmade) console.log(`No custom pages yet: gallery page new <slug> "<标题>" makes one.`);
  else if (pages.length > 0) console.log(`Custom pages, in the sidebar's order (${pages.length}):`);
  // With a server running the whole address, the one to give the user; else the path after its port.
  const port = pages.length ? await runningPort(root) : null;
  for (const { slug, title, icon } of pages) {
    console.log(`- ${slug}  ${icon ? `${icon} ` : ""}${title}`);
    console.log(`  地址：${port ? pageAddressOf(port, slug) : `/#@${slug}`}   ${shown(pageFiles(slug, root).html)}`);
  }
  if (unmade) console.log(unmade);
}

async function openPage(root, [slug, ...more], options) {
  if (!slug || more.length) throw new UsageError("gallery page open takes one page's slug.");
  const page = await readPageMeta(slug, root);
  if (!page) {
    console.error(await missingPageSaid(slug, root));
    process.exit(1);
  }
  console.log(`工作区：${shown(root)}`);
  const result = await serverFor({ command: `gallery page open ${slug}${options.has("--no-browser") ? " --no-browser" : ""}` });
  if (!result.ok) {
    console.error(`问题：${result.message}`);
    process.exit(1);
  }
  const lines = [...serverLines(result), `${AGENT_LINE}${pageAloneOf(result.port, slug)}`, `${USER_LINE}${pageAddressOf(result.port, slug)}`];
  for (const line of lines) console.log(line);
  console.log(await browserLine(lines, options));
}

// The add through the workspace's server (`server`: its announcement): its answer as [status, body], or
// null when no server of this workspace takes it (none runs any more, another's took the port, an older
// Gallery's that has no page service): the card is then written here.
async function throughServer(server, slug, body) {
  const host = `127.0.0.1:${server.port}`;
  try {
    const response = await fetch(`http://${host}/__gallery/pages/${slug}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: `http://${host}`, "X-Gallery-Token": server.token },
      body: JSON.stringify({ ...body, workspace: reportsDirectory }),
      signal: AbortSignal.timeout(30000),
    });
    const answer = await response.json().catch(() => null);
    if (!answer || ["elsewhere", "token", "host", "origin", "unknown", "method"].includes(answer.reason)) return null;
    return [response.status, answer];
  } catch {
    return null;
  }
}

// How long an add waits for the running server to take a block the disk holds and its catalog has not yet, in ms.
const TAKING = 8000;
// The refusals of the server that the disk, read just before, did not make: a catalog not caught up yet.
const BEHIND = new Set(["missing", "places", "settings", "values"]);

/**
 * An op of the page service (src/editor/page-service.mjs) on page `slug` with `body`: through the workspace's
 * running server when there is one that takes it (its queue, so that an open page's gestures and this write
 * never race; the page shows the change at once), else by the same code here. An add of a block just put into
 * components/ (or a manifest just changed) is asked again for a few seconds while the server's catalog has not
 * taken it: a refusal of BEHIND's that the disk, read just before by the caller, did not make. { status, answer,
 * viaServer }, the answer as the service gives it ({ ok: true, … } or { ok: false, reason | refused, … }).
 */
export async function pageServiceOp(root, slug, body, catalog = null) {
  const server = await findPreviewServer();
  let viaServer = server ? await throughServer(server, slug, body) : null;
  for (let tries = 0; body.op === "add" && BEHIND.has(viaServer?.[1]?.reason) && tries < TAKING / 250; tries++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    viaServer = await throughServer(server, slug, body);
  }
  // Here the catalog is read again each time the service asks (a block of Gallery's own it puts in is then there).
  const [status, answer] = viaServer ?? await createPageService({ root, stateDirectory: editStateDirectory, catalog: catalog ?? (() => readCatalog(root)) }).apply(slug, body);
  return { status, answer, viaServer: Boolean(viaServer) };
}

// What a refused add says, by its reason (the service's).
const REFUSED = {
  places: (id) => `${id} is a block of documents (its manifest's places has no "page"): it does not go on a custom page. To make it a card too, write "places": ["document", "page"] in its component.json ("card": { "sizes": [[4, 3]] } sizes it; on a page no text part is edited: what a reader changes there goes in a data part), then run this again.`,
  disabled: (id) => `${id} is turned off (设置 › 组件列表 停用): nothing of it loads, on a page or in a document.`,
  missing: (id) => `No custom block ${id} in this workspace: gallery block list lists them.`,
  template: (id) => `${id} has no template.html a new card can be made of (gallery block check ${id} says why).`,
  board: (id, board) => `No board "${board}" on this page: its <div class="gallery-board" data-board-id="…">s are the ones there are.`,
  cells: () => "--x, --y, --w and --h are whole numbers (x and y from 0, w and h from 1).",
  busy: () => "page.html was written again and again meanwhile: run this again.",
  size: () => "page.html would grow past 1,000,000 bytes.",
  values: (id, _, key) => `${id}'s setting ${key ? `"${key}" ` : ""}does not take that value (a text of 10,000 characters at most, a number, a date, one of a select's options, a switch's true or false).`,
  settings: (id) => `${id} has no settings, or a card of it no settings part: --set goes with a block whose manifest has some.`,
};

/**
 * Each `--set <key>=<value>` (or `--set=<key>=<value>`) of `argv`, taken out: { argv, given } with `given`
 * a list of [key, words] in the order written. The words after the first "=" are the value, so that no
 * JSON is quoted on a command line (a Windows PowerShell 5.1 takes the quotes out of an argument it hands a
 * program); a --set with none, or with no key, is a mistake.
 */
export function setsOf(argv) {
  const end = argv.indexOf("--");
  const given = [];
  const rest = [];
  for (let at = 0; at < argv.length; at++) {
    const argument = argv[at];
    if (end !== -1 && at >= end) rest.push(argument);
    else if (argument === "--set" || argument.startsWith("--set=")) {
      const written = argument === "--set" ? argv[at + 1] : argument.slice("--set=".length);
      if (argument === "--set") at += 1;
      const equals = written?.indexOf("=") ?? -1;
      if (written === undefined || equals < 1) throw new UsageError("--set takes a setting's key and its value: --set <key>=<value> (--set city=上海).");
      given.push([written.slice(0, equals), written.slice(equals + 1)]);
    } else rest.push(argument);
  }
  return { argv: rest, given };
}

// A switch's words, as --set says them.
const SWITCH_WORDS = new Map([["true", true], ["yes", true], ["on", true], ["1", true], ["false", false], ["no", false], ["off", false], ["0", false]]);

/**
 * The settings `sets` (setsOf's given) of block `found` as the card's settings part holds them, each value
 * held to its field's type (a number, a select's option, a switch's true or false, a date as YYYY-MM-DD);
 * a key the block has no setting of, or a value its type refuses, is a UsageError saying what the block
 * takes. { key: value }.
 */
export function settingsGiven(sets, found) {
  const fields = found.settings ?? [];
  const listed = () => (fields.length ? `its settings are ${fields.map(({ key, label }) => `${key} (${label?.en ?? label?.zh ?? key})`).join(", ")}` : "it has no settings");
  const values = {};
  for (const [key, words] of sets) {
    const field = fields.find((one) => one.key === key);
    if (!field) throw new UsageError(`${found.id} has no setting "${key}": ${listed()}.`);
    if (Object.hasOwn(values, key)) throw new UsageError(`--set ${key} is given twice.`);
    if (field.type === "number") {
      if (words.trim() !== "" && !Number.isFinite(Number(words))) throw new UsageError(`The setting ${key} of ${found.id} is a number: --set ${key}=<number>, or --set ${key}= for none.`);
      values[key] = words.trim() === "" ? null : Number(words);
    } else if (field.type === "switch") {
      if (!SWITCH_WORDS.has(words.trim().toLowerCase())) throw new UsageError(`The setting ${key} of ${found.id} is a switch: --set ${key}=true or --set ${key}=false.`);
      values[key] = SWITCH_WORDS.get(words.trim().toLowerCase());
    } else if (field.type === "select") {
      if (!field.options.includes(words)) throw new UsageError(`The setting ${key} of ${found.id} is one of ${field.options.join(", ")}: --set ${key}=<one of them>.`);
      values[key] = words;
    } else if (field.type === "date") {
      if (words !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(words)) throw new UsageError(`The setting ${key} of ${found.id} is a date, written YYYY-MM-DD: --set ${key}=2027-02-06.`);
      values[key] = words;
    } else values[key] = words; // text, document
  }
  return values;
}

/**
 * The required settings of `found` (its manifest's, `required`) a card would hold nothing in: each [{ key, label }]
 * whose value in `values` (the card's settings part parsed) is missing or empty, where the field's default is
 * none either.
 */
export function emptyRequiredOf(found, values) {
  const own = values && typeof values === "object" && !Array.isArray(values) ? values : {};
  return (found.settings ?? []).filter((field) => field.required && field.type !== "switch").filter(({ key, default: fallback }) => {
    const value = Object.hasOwn(own, key) ? own[key] : fallback;
    return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
  }).map(({ key, label }) => ({ key, label: label?.en ?? label?.zh ?? key, zh: label?.zh ?? null }));
}

async function addCard(root, [slug, written, ...more], _, values, __, sets = []) {
  if (!slug || !written || more.length) throw new UsageError("gallery page add takes a page's slug and a block's id (gallery block list lists them).");
  const cells = {};
  for (const axis of ["x", "y", "w", "h"]) {
    const value = values.get(`--${axis}`);
    if (value === undefined) continue;
    if (!/^\d+$/.test(value) || ((axis === "w" || axis === "h") && Number(value) < 1)) throw new UsageError(REFUSED.cells());
    cells[axis] = Number(value);
  }
  if ((cells.x === undefined) !== (cells.y === undefined)) throw new UsageError("--x and --y go together: a place is both.");
  if (!pageExists(slug, root)) {
    console.error(await missingPageSaid(slug, root));
    process.exit(1);
  }
  // The block: its id, or one of Gallery's own by its name; one a page takes, there in the workspace.
  const own = !written.includes("/") ? shippedBlock(written) : null;
  const id = written.includes("/") ? written : own ? own.id : written;
  const catalog = readCatalog(root);
  const found = catalog.packages.get(id);
  if (!found) {
    const shipped = isShippedId(id) ? shippedBlock(id) : null;
    if (catalog.settings.disabled.includes(id)) console.error(REFUSED.disabled(id)); // one of Gallery's own too: put in, it would still be off
    else if (shipped) console.error(`${id} is one of Gallery's own blocks, not yet in this workspace: gallery block add ${shipped.pack === SHIPPED_SCOPE ? shipped.name : shipped.id} puts it in; then run this again.`);
    else console.error(catalog.problems.has(id) ? `${id} does not load (gallery block check ${id} says why).` : REFUSED.missing(id));
    process.exit(1);
  }
  if (!found.places.includes("page")) {
    console.error(REFUSED.places(id));
    process.exit(1);
  }
  const board = values.get("--board");
  // The settings --set gives, held to the block's fields before anything is written.
  const settings = sets.length ? settingsGiven(sets, found) : null;
  // agent: an add of the Agent's, no reader's gesture (the page service tells it so: gallery page check
  // marks the user's own changes by what it tells).
  const body = { op: "add", block: id, ...(board ? { board } : {}), ...cells, ...(settings ? { settings } : {}), agent: true };
  // A block just put into components/ (gallery block add, a block written a moment ago) is one the
  // server takes once components/ holds still (its catalog watch): until then it answers that it has
  // none, which the disk says it has, and the add is asked again, a few seconds at most.
  const { status, answer, viaServer } = await pageServiceOp(root, slug, body, () => catalog);
  if (!answer?.ok) {
    const reason = answer?.reason;
    console.error(REFUSED[reason]?.(id, board ?? FIRST_BOARD, answer?.message) ?? `Not added (${status}: ${reason ?? "no answer"}${answer?.message ? `: ${answer.message}` : ""}).`);
    process.exit(1);
  }
  const card = answer.cards.find((one) => one.id === answer.card);
  // The cards the add pushed down, as the service says (none where it went into a free spot).
  const pushed = (answer.pushed ?? []).map((id) => answer.cards.find((one) => one.id === id)).filter(Boolean);
  console.log(`Added a card of ${id} to ${shown(pageFiles(slug, root).html)}${viaServer ? " (through the workspace's running server: an open page shows it at once)" : ""}:`);
  console.log(`  data-card-id="${card.id}" on board ${card.board}: x ${card.x}, y ${card.y}, w ${card.w}, h ${card.h}${answer.measure ? " (its block gives no height: 2 cells, --h sets another)" : ""}`);
  if (pushed.length) console.log(`  Pushed down under it, as it met them: ${pushed.map((one) => `${one.id} (y ${one.y})`).join(", ")}; no card moved up.`);
  if (settings) console.log(`  Settings written with it: ${Object.entries(settings).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(", ")}`);
  console.log(settings
    ? `The rest of its data is as the block's template writes it, in the card's instance: write it there if it is to hold something else, leaving every other card as it is.`
    : `Its data is as the block's template writes it, in the card's instance: write it there if it is to hold something else, leaving every other card as it is.`);
  // A setting the block cannot show anything without, that the card holds none of: the user's to give, or the workspace's to say.
  const empty = emptyRequiredOf(found, { ...(settings ?? {}) });
  if (empty.length) {
    const list = empty.map(({ key, label, zh }) => `${key} (${zh && zh !== label ? `${label}, ${zh}` : label})`).join(", ");
    console.log(`${id} needs its setting ${list} before the card shows anything, and this card has none: ask the user for it, or take it from what the workspace says (写作偏好, the documents) and tell them in the handoff which you did. Give it with the add (${empty.map(({ key }) => `--set ${key}=<value>`).join(" ")}); for this card, write it in its settings part of ${shown(pageFiles(slug, root).html)} (the <script type="application/json"> of data-card-id="${card.id}": {"${empty[0].key}":"…"}), or the user fills it in on the card (the grip at its top right › 设置…).`);
  }
}

// The subcommands that manage a page (./page-manage.mjs), loaded when run.
const manage = (name) => async (root, named, options, values, seconds, sets) => (await import("./page-manage.mjs"))[name](root, named, options, values, sets);

const SUBCOMMANDS = {
  new: newPage, list: listAll, open: openPage, add: addCard,
  set: manage("setPage"), move: manage("movePage"), card: manage("cardCommand"), "reset-cards": manage("resetCards"),
  try: async (root, named, options, values, seconds) => (await import("./page-try.mjs")).pageTryCommand(root, { named, values, seconds, keep: options.has("--keep"), replace: options.has("--replace") }),
  check: async (root, named) => (await import("./page-check.mjs")).pageCheckCommand(root, named),
};
// What add alone takes.
const CELLS = ["--board", "--x", "--y", "--w", "--h"];
// The options of the subcommands that manage a page, each with the subcommands it goes with.
const ONLY = { "--json": ["list"], "--title": ["set"], "--icon": ["set"], "--after": ["move"], "--first": ["move"], "--move": ["card"], "--size": ["card"], "--remove": ["card"], "--narrow": ["card"] };

export async function run(argv) {
  try {
    return await subcommand(argv);
  } catch (error) {
    // A mistake in a command line of try is said with try's lines of the usage.
    const what = argv.find((argument) => !isOption(argument));
    if (error instanceof UsageError && what === "try") error.synopsis = PAGE_TRY_SYNOPSIS;
    // The subcommands that manage a page say their own lines of the usage.
    if (error instanceof UsageError && ["set", "move", "card", "reset-cards"].includes(what)) error.synopsis = synopsisOf("page", what);
    throw error;
  }
}

async function subcommand(argv) {
  // --key's, --type's and --select's second argument taken out first, as gallery block try's (component.mjs pairsOf).
  const { argv: paired, seconds } = pairsOf(argv);
  // --set <key>=<value>, as many as there are, taken out before the others are read (a value of one name each).
  const { argv: taken, given: sets } = setsOf(paired);
  const { positional, options, values } = commandArguments({ options: ["--no-browser", "--keep", "--replace", "--json", "--first", "--remove", "--narrow"], values: [...CELLS, ...GESTURES, "--title", "--icon", "--after", "--move", "--size"], argv: taken });
  const [what, ...rest] = positional;
  const said = Object.keys(SUBCOMMANDS).join(", ");
  if (!what) throw new UsageError(`Say what to do: ${said}.`);
  if (!Object.hasOwn(SUBCOMMANDS, what)) throw new UsageError(`No such page command: ${what} (${said}).`);
  if (options.has("--no-browser") && what !== "open") throw new UsageError(`--no-browser goes with open, not ${what}.`);
  const trying = [...GESTURES.filter((name) => values.has(name)), ...Object.keys(seconds).filter((name) => !values.has(name)), ...(options.has("--keep") ? ["--keep"] : []), ...(options.has("--replace") ? ["--replace"] : [])];
  if (trying.length && what !== "try") throw new UsageError(`${trying[0]} goes with try, not ${what}.`);
  const cells = CELLS.filter((name) => values.has(name));
  if (cells.length && what !== "add") throw new UsageError(`${cells.join(", ")} go with add, not ${what}.`);
  if (sets.length && what !== "add" && what !== "card") throw new UsageError(`--set goes with add and card, not ${what}.`);
  for (const [option, owners] of Object.entries(ONLY)) {
    if ((options.has(option) || values.has(option)) && !owners.includes(what)) throw new UsageError(`${option} goes with ${owners.join(" and ")}, not ${what}.`);
  }
  return SUBCOMMANDS[what](reportsDirectory, rest, options, values, seconds, sets);
}
