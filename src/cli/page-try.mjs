import fsp from "node:fs/promises";
import path from "node:path";
import { parse } from "parse5";
import { problemIn, readCatalog } from "../shared/component-catalog.mjs";
import { isInstance } from "../shared/components/index.mjs";
import { ATTRIBUTE } from "../shared/components/installed.mjs";
import { attr, walk } from "../shared/html-tree.mjs";
import { readPage, withCardIds } from "../shared/page-cards.mjs";
import { pageExists, pageFiles } from "../shared/pages.mjs";
import { layoutOf } from "../shared/workspace.mjs";
import { findBrowser, lookingArguments, startBrowser } from "../transfer/browser.mjs";
import { UsageError } from "./arguments.mjs";
import { firstLine } from "./component-look.mjs";
import { BEGIN, READY, SAVING, changesOf, dropScratch, dropStale, gestureOf, madeSaid, partsOf, scratchCopy, stepsCalled, stepsOf, stoppedTrial, trial, trialSaid } from "./component-try.mjs";
import { missingPageSaid } from "./page.mjs";
import { shown } from "./report-start.mjs";
import { serverFor } from "./server-process.mjs";

// gallery page try <slug> <card id> <gesture> [--then <key>] [--replace] [--keep] | --steps <file> [--keep]
// (./usage.mjs): what a reader does to one card of a custom page, made in the page with the pointer and
// the keys, and what it wrote: gallery block try's gestures, its steps, its undo and its read back
// (./component-try.mjs trial, the one trial both run), aimed at the instance of the card that
// data-card-id names (pageHost: the host a trial is made in, a document's being documentHost). By
// default on a scratch copy of the page (its page.html, its page.json and assets/, in
// .gallery/try/try-<8 hex>/, which shared/pages.mjs pageFiles serves as any page's and lists nowhere):
// page.html is never written and no page of the user's shows the trial; --keep makes it on the page
// itself. The copy's page alone (/pages/<slug>, the Agent's own) opens on the workspace's server, found
// or started as gallery page open does, in a headless Chrome or Edge of its own, and is taken as come to
// edit once the kit says it is ready and the board said its blocks may write (doc-editable). A write is
// what the page service is sent (POST /__gallery/pages/<slug>/cards, heard on the tab: pageSaves) and
// what page.html holds once each op is answered. Only the card's data parts may change, its settings
// among them (a part its manifest edits as data): what changed anywhere else (its place, its own markup
// outside them, another card, the page's own HTML) fails, named (outsideWhat), each id the page
// service gives a card that had none set aside. The undo is the page's own (the board's Ctrl+Z), a
// press for each write, until the parts are as they were before each step; the read back a fresh page
// of a second copy (or the page itself with --keep), where the card is to mount, write nothing as it
// opens and show what it showed. Exits as gallery block try does: 0, 1 for a problem of the block's
// (or a write outside the card's data), 2 for a mistake in the command line, 3 not seen through.

/** What "as it was" sets aside on a custom page: the ids the page service gives the cards that have none, with its first write. */
export const PAGE_ASIDE = "card ids aside";
/** What the Wrote line says of a write inside the card's data parts alone. */
export const PAGE_INSIDE_ALONE = "nothing else in page.html changed (card ids aside)";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const CARDS_ROUTE = /^\/__gallery\/pages\/[a-z0-9-]+\/cards$/;

/** The parsed instance of a card's markup read alone (its section, or the page): the first there is (partsOf's `at`). */
export const firstInstance = (text) => {
  let found = null;
  walk(parse(text, { sourceCodeLocationInfo: true }), (node) => { found ??= isInstance(node) ? node : null; }, { inTemplates: false });
  return found;
};

// A card's markup in `text` as two pieces: its frame's start tag without its place (data-x, -y, -w and
// -h), and what follows it, its instance and its end tag.
const unplaced = (text, card) => {
  const end = card.node.sourceCodeLocation.startTag.endOffset;
  return { frame: text.slice(card.start, end).replace(/\s+data-[xywh]="[^"]*"/g, ""), rest: text.slice(end, card.end) };
};

/**
 * What changed in page.html between `was` and `now` (the texts as the cards' ids make them:
 * withCardIds) outside the data parts of card `id`, in a reader's words, one clause each: a card's
 * place (its data-x, -y, -w and -h as written, or its board), the card itself outside its data parts (its frame's
 * attributes, what its instance holds besides them: `found`, its block, the data parts alone), another
 * card's markup, a card taken out or put in, else the page's own HTML (its head, its style, a header).
 */
export function outsideWhat(was, now, id, found) {
  const [before, after] = [readPage(was).cards, readPage(now).cards];
  const said = [];
  const named = (card) => `card ${card.id}${card.block ? ` (${card.block})` : ""}`;
  const cells = (card) => ["x", "y", "w", "h"].map((axis) => `${axis} ${attr(card.node, `data-${axis}`) ?? "-"}`).join(", ");
  for (const card of before) {
    const other = after.find((one) => one.id === card.id);
    if (!other) {
      said.push(`${named(card)} taken out`);
      continue;
    }
    const board = card.board !== other.board;
    if (board || cells(card) !== cells(other)) said.push(`${named(card)}'s place, ${cells(card)}${board ? ` on ${card.board}` : ""} then ${cells(other)}${board ? ` on ${other.board}` : ""}`);
    // Its markup but its place: its frame's start tag without data-x, -y, -w and -h, then the rest.
    const [a, b] = [unplaced(was, card), unplaced(now, other)];
    if (a.frame === b.frame && a.rest === b.rest) continue;
    if (card.id !== id) {
      said.push(named(card));
      continue;
    }
    if (a.frame !== b.frame) said.push(`${named(card)}'s own frame (an attribute of its <section> but its place)`);
    const [inA, inB] = [partsOf(a.rest, firstInstance, found), partsOf(b.rest, firstInstance, found)];
    if (!inA || !inB) said.push(`${named(card)}'s instance`);
    else if (inA.outside !== inB.outside) said.push(`${named(card)} itself, outside its data parts (a part edited as text or none, or what its instance holds besides its parts)`);
  }
  for (const card of after) if (!before.some((one) => one.id === card.id)) said.push(`a ${named(card)} put in`);
  // The page's own HTML: the text outside every card, the blanks between its tags aside.
  const own = (text, cards) => {
    let rest = "";
    let cursor = 0;
    for (const card of [...cards].sort((x, y) => x.start - y.start)) {
      rest += text.slice(cursor, card.start);
      cursor = card.end;
    }
    return (rest + text.slice(cursor)).replace(/\s+/g, " ");
  };
  if (own(was, before) !== own(now, after) || !said.length) said.push("the page's own HTML outside its cards (its head, its style, its header)");
  return said.join("; ");
}

/**
 * What tells `after` from `before` (page.html's texts) of the instance of card `card`, as changesOf
 * says it (`found`: its block, the data parts alone, the ones a reader's gesture may change), the cards'
 * ids given first as the page service gives them (withCardIds); what changed outside them is said
 * (`outside.what`, outsideWhat).
 */
export function cardChangesOf(before, after, { card, found }) {
  const [was, now] = [withCardIds(before).text, withCardIds(after).text];
  const at = (text) => readPage(text).cards.find((one) => one.id === card)?.instance ?? null;
  const changed = changesOf(was, now, at, found);
  if (changed.outside) changed.outside = { ...changed.outside, what: outsideWhat(was, now, card, found) };
  return changed;
}

// The page in `tab` come to edit: the kit's ready mark, and the board's doc-editable heard (trial's
// listener: __galleryTryEditable); false when it did not in READY ms. One that loads itself again
// meanwhile is waited for in the page it brings.
async function cameToEdit(tab) {
  try {
    await tab.waitForSelector("[data-doc-ready]", { timeout: READY }).catch((error) => {
      if (error.name === "TimeoutError") throw error;
      return tab.waitForSelector("[data-doc-ready]", { timeout: READY });
    });
    await tab.waitForFunction(() => globalThis.__galleryTryEditable === true && Boolean(document.querySelector("script[data-ge-page]")), { timeout: READY });
    return true;
  } catch (error) {
    if (error.name !== "TimeoutError") throw error;
    return false;
  }
}

// Why a write of a custom page's board stays where it stands (pageSaves' states).
function stayedSaid(state) {
  if (state?.startsWith("stopped")) return `the page service refused the board's write (${state.slice("stopped".length).trim() || "no reason given"}), and the page showed itself again as the file holds it`;
  return ({
    refused: "the page service refused the board's write: the card was changed or taken out meanwhile (someone else's write of page.html), and the page showed itself again as the file holds it",
    offline: "the page could not reach the server (offline)",
    reloading: "the page loaded itself again (page.html or a custom block it holds changed meanwhile, or the page service refused a write)",
    syncing: `its write took more than ${SAVING / 1000}s to be answered`,
  })[state];
}

/**
 * How the writes of a custom page in `tab` are heard (a trial host's `saves`): each op sent to the page
 * service (POST /__gallery/pages/<slug>/cards: the board's, or any script's of the page) and its answer,
 * from the tab's own requests. An op is answered once its answer's head comes, which the service sends
 * once the file is written (a body no script reads may never be said to finish loading); its body, read
 * then, says a refusal's reason. { mark() (the ops sent so far), until(since) (once a gesture or an undo:
 * "saved" when each op sent since `since` was answered with ok, the page holding still a moment after
 * for one sent right after it; "unchanged" when none was sent in BEGIN ms; "refused" (the card changed or
 * gone), "stopped <reason>" (any other refusal), "offline" (no answer), "syncing" (one unanswered after
 * SAVING ms)) }.
 */
export function pageSaves(tab) {
  const ops = [];
  const of = new Map();
  tab.on("request", (request) => {
    if (request.method() !== "POST" || !CARDS_ROUTE.test(new URL(request.url()).pathname)) return;
    const op = { done: false, status: null, answer: null, failed: null };
    ops.push(op);
    of.set(request, op);
  });
  tab.on("response", (response) => {
    const op = of.get(response.request());
    if (!op) return;
    op.status = response.status();
    op.done = true;
    if (op.status !== 200) response.json().then((answer) => { op.answer = answer; }, () => {});
  });
  tab.on("requestfailed", (request) => {
    const op = of.get(request);
    if (!op) return;
    op.failed = request.failure()?.errorText ?? "failed";
    op.done = true;
  });
  return {
    mark: async () => ops.length,
    async until(since) {
      const start = Date.now();
      for (let still = 0; ; await sleep(100)) {
        const seen = ops.slice(since);
        if (seen.length === 0) {
          if (Date.now() - start > BEGIN) return "unchanged";
          continue;
        }
        if (seen.some((op) => !op.done)) {
          still = 0;
          if (Date.now() - start > SAVING) return "syncing";
          continue;
        }
        if (++still < 4) continue; // answered: a moment more, for an op the board sends right after (and a refusal's body)
        if (seen.some((op) => op.failed)) return "offline";
        const refused = seen.find((op) => op.status !== 200);
        if (refused) return refused.answer?.refused || (refused.status === 409 && !refused.answer) ? "refused" : `stopped ${refused.answer?.reason ?? `HTTP ${refused.status}`}`;
        return "saved";
      }
    },
  };
}

/**
 * The host of a trial on card `card` of a custom page (component-try.mjs trial's `host`), its block
 * `found`: the instance found by the card's data-card-id, the page come to edit as the board starts,
 * its writes heard as the page service's ops, the changes those of the card's data parts (a part its
 * manifest edits as data: its settings too), and anything else that changed a problem, named.
 */
export function pageHost({ card, found }) {
  const data = { ...found, parts: Object.fromEntries(Object.entries(found.parts).filter(([, part]) => part.edit === "data")) };
  return {
    where: { card },
    ready: cameToEdit,
    saves: pageSaves,
    changes: (a, b) => cardChangesOf(a, b, { card, found: data }),
    plain: () => false,
    stayed: stayedSaid,
    outside: "problem",
    outsideSaid: (outside) => `card ${card}'s data parts: ${outside.what}, where a reader's gesture on the card is to change its data parts alone`,
    aside: PAGE_ASIDE,
    inside: PAGE_INSIDE_ALONE,
    // The picture shows the card, its frame with it, as the page draws it.
    framed: (node) => node.closest(".gallery-card") ?? node,
  };
}

/** A card of a page as a list of them says it: its id, its block and its cells. */
const cardSaid = (card) => `  ${card.id}  ${card.block ?? "(no instance)"}  x ${card.x}, y ${card.y}, w ${card.w}, h ${card.h}${card.board ? `  on board ${card.board}` : ""}`;

/**
 * gallery page try: `named` the page and the card, `values` the options' values, `seconds` what
 * --key, --type and --select take after their selector, `keep` --keep, `replace` --replace.
 */
export async function pageTryCommand(root, { named, values, seconds = {}, keep, replace = false }) {
  if (named.length === 0) throw new UsageError("Name the page and the card: gallery page try <slug> <card id> and the gesture.");
  if (named.length === 1) throw new UsageError(`Name the card of ${named[0]} to try: gallery page try ${named[0]} <card id> and the gesture (its data-card-id; gallery page check ${named[0]} lists the cards).`);
  if (named.length > 2) throw new UsageError("gallery page try takes a page's slug and a card's id.");
  const gesture = await gestureOf(values, seconds, replace); // null with --steps, read once the page is known
  const [slug, id] = named;
  const stepsFile = values.has("--steps") ? path.resolve(values.get("--steps")) : null;
  const trying = gesture ? [gesture] : await stepsOf(stepsFile);
  const files = pageFiles(slug, root);
  if (!pageExists(slug, root)) {
    console.error(await missingPageSaid(slug, root));
    process.exit(1);
  }
  const source = await fsp.readFile(files.html, "utf8");
  // The cards as the page shows them: each with the id the page service gives one that has none.
  const { cards } = readPage(withCardIds(source).text);
  const card = cards.find((one) => one.id === id);
  if (!card) throw new UsageError(cards.length ? `${slug} has no card ${id}: its cards are\n${cards.map(cardSaid).join("\n")}` : `${slug} has no card yet: gallery page add ${slug} <block> puts one on it.`);
  const name = path.basename(files.html);
  const line = card.node.sourceCodeLocation?.startLine ?? null;
  if (!card.instance) {
    console.error(`Card ${id} of ${slug} (${name}:${line}) holds no instance of a custom block (an element with ${ATTRIBUTE}): there is nothing on it to try.`);
    process.exit(1);
  }
  const block = card.block;
  const catalog = readCatalog(root);
  const found = catalog.packages.get(block);
  if (!found) {
    const problem = catalog.problems.get(block);
    console.error(problem?.off ? `${block} is turned off in 设置 › 组件列表: its card says so on the page and runs nothing.` : problem ? `${block} does not load (${problemIn("en", problem.problem)}), so its card runs nothing: gallery block check ${block} says why.` : `No custom block ${block} in this workspace, so its card runs nothing: gallery block list says which there are${block.startsWith("gallery/") ? `, and gallery block add ${block.slice("gallery/".length)} puts one of Gallery's own in` : ""}.`);
    process.exit(1);
  }
  if (!found.places.includes("page")) {
    console.error(`${block} is a block of documents (its manifest's places has no "page"): on a custom page its card says so and runs nothing, so there is nothing to try there (gallery block try tries it in a document).`);
    process.exit(1);
  }
  console.log(`${block} in card ${id} of ${slug}, at ${name}:${line}: ${shown(files.html)}`);
  if (stepsFile) console.log(`Steps: ${trying.length} from ${shown(stepsFile)}, made one after another in one page`);
  const server = await serverFor({ command: `gallery page try ${slug}` });
  if (!server.ok) {
    console.log(`UNVERIFIED ${slug}: ${server.message}`);
    process.exitCode = 3;
    return;
  }
  const { pageAloneOf } = await import("./page.mjs");
  await dropStale(root);
  const copies = []; // the scratch copies made, each taken away at the end
  const copyOf = async (text) => {
    const copy = await scratchCopy(root, { directory: files.folder, files, text });
    copies.push(copy.slug);
    return copy;
  };
  const host = pageHost({ card: id, found });
  try {
    const page = keep ? { slug, file: files.html } : await copyOf(source);
    const address = pageAloneOf(server.port, page.slug);
    console.log(keep
      ? `Page: ${address} (the custom page alone, editable: the Agent's own; --keep: what ${stepsCalled(trying)} write stays in ${name}, and every page open on it shows it, the user's too; the server runs on after this command)`
      : `Page: ${address} (a scratch copy of ${slug}, its page alone, editable, made for this trial and gone at its end: ${name} is not written, and no page of the user's shows the trial; the server runs on after this command)`);
    const executablePath = findBrowser();
    if (!executablePath) {
      console.log(`UNVERIFIED ${slug}: no Chrome, Edge or Chromium found (GALLERY_BROWSER=<its executable> picks one), so nothing was tried`);
      process.exitCode = 3;
      return;
    }
    let running;
    try {
      running = await startBrowser({ executablePath, args: lookingArguments() });
    } catch (error) {
      console.log(`UNVERIFIED ${slug}: the browser ${executablePath} did not start, twice, each time with a fresh profile (${firstLine(error)}; GALLERY_BROWSER=<its executable> picks another), so nothing was tried`);
      process.exitCode = 3;
      return;
    }
    const out = path.join(layoutOf(root).qa, slug, "try");
    try {
      await fsp.rm(out, { recursive: true, force: true });
      await fsp.mkdir(out, { recursive: true });
      // The page a read back opens, and its file: a second copy of what the steps wrote, or page.html with --keep.
      const fresh = async (text) => {
        if (keep) return { address, file: page.file };
        const copy = await copyOf(text);
        return { address: pageAloneOf(server.port, copy.slug), file: copy.file };
      };
      let result;
      try {
        result = await trial(running.browser, { root, address, fresh, steps: trying, keep, file: page.file, name, line, found, out, host });
      } catch (error) {
        if (error instanceof UsageError && error.made) console.log(madeSaid({ name, steps: trying, keep, host }, error.made).join("\n"));
        if (error.stuck) return stoppedTrial(slug, error, name, keep);
        throw error;
      }
      const { lines, code } = trialSaid({ slug, name, steps: trying, keep, host }, result);
      console.log(lines.join("\n"));
      process.exitCode = code;
    } finally {
      await running.close();
    }
  } finally {
    for (const copy of copies) await dropScratch(root, copy);
  }
}
