import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { shownSource } from "../editor/source.mjs";
import { offlineCustomPage, offlineReports } from "../render/pipeline.mjs";
import { iconImage } from "../render/emoji.mjs";
import { parseReport } from "../render/report-tree.mjs";
import { createNetRoute } from "../server/net-route.mjs";
import { CELL, GAP, defaultSize } from "../shared/board-places.mjs";
import { PICTURES, readCatalog } from "../shared/component-catalog.mjs";
import { ATTRIBUTE, INSTANCE } from "../shared/components/installed.mjs";
import { fileLanguage, htmlLang } from "../shared/file-language.mjs";
import { QUERY_ROUTE, WORKSPACE_GLOBAL } from "../shared/workspace-query.mjs";
import { writeAtomic } from "../shared/files.mjs";
import { isShippedId, recordOf } from "../shared/shipped-blocks.mjs";
import { documentDirectory, documentFiles, layoutOf } from "../shared/workspace.mjs";
import { settle } from "../transfer/browser.mjs";
import { createActivity } from "../workbench/activity.mjs";
import { createIndex } from "../workbench/index.mjs";
import { ANSWER, answered, copyPackage, outerInstances, refuseDialogs } from "./component-look.mjs";

// The picture of a block the add-block lists show beside its row (the owner, 2026-11-17: the
// block's real, whole picture, not a drawing of it, made as the block is made, light and dark). gallery
// block check makes it as a side of its look (./component-look.mjs lookAtPackage, in the same browser),
// and writes it into the block's folder once the check passes (./component-check.mjs): nothing for an
// Agent to run or to look at. The two packs Gallery ships have theirs made by a maintainer
// (./pack-pictures.mjs) and kept in src/packs/.
//
// What is pictured is the first instance of example.html (as a writer fills it, which the check runs
// too), where the block lives:
//   - a card of a custom page (its places hold page): that instance alone on a board, in its card's frame at the size a new
//     card takes (board-places.mjs defaultSize; one the page measures, as tall as its content), the page's
//     ground around it: the custom page's own tags, the kit's and the board's, copied into one file
//     (render/pipeline.mjs offlineCustomPage), where what it reads of the workspace is answered as the
//     server answers it (workbench/index.mjs query, of the workspace the check runs in) and what it asks of
//     the net by the server's own route (server/net-route.mjs: the hosts the reader allowed it, by the
//     workspace's keys, its cache; one not allowed is refused for its consent, which the card then shows, as
//     it would on the reader's page). Nothing else of the page reaches the network.
//   - a block of a document: the whole example in a document's page as its export draws it (a view of a table
//     there reads the table above it; what it reads of the workspace, the snapshot an export embeds: snapshotOf),
//     the picture cut to the first instance; its reading column as wide as
//     the menus show a picture (READING: WIDEST less the ground around it, the window a desktop's), so that
//     the picture is shown at its own size and its words read as they do in a document: the block as it
//     stands in a column that wide (a column of 分栏), where it lays itself out again, not the whole reading
//     width scaled down to half (a 看板 at 712 shown at 400 had words of 6px, 2026-11-18). One whose content
//     takes more than that (a 看板's three columns at their least) stands in a column as wide as it takes,
//     whole, and is scaled down.
// Each theme in turn (prefers-color-scheme, as the check's pictures), once what it asked for was answered
// and the page holds still (transfer/browser.mjs settle), cut to the card or the instance with MARGIN of
// the page's ground around it, at twice its size in CSS pixels, a picture wider than WIDEST scaled down to
// that, one taller than TALLEST cut there; WebP at QUALITY. A maintainer's run (./pack-pictures.mjs) may give the
// page a clock of its own (`clock`: the time its scripts read) and answer what it asks of the net itself (`net`).

/** How wide, in CSS pixels, the menus show a picture at most: one wider is made at this width. */
export const WIDEST = 480;
/** The page's ground around the block, in CSS pixels. */
export const MARGIN = 16;
/** How tall a picture is at most, in CSS pixels of the block as it is drawn. */
export const TALLEST = 900;
/** How many device pixels a CSS pixel is in a picture. */
export const DENSITY = 2;
const QUALITY = 90;
const SLUG = "block-picture";
// The window a picture is made in: a board's twelve columns, and a desktop's for a document (its reading column READING).
const WINDOW = { page: 1040, document: 800, height: 900 };
/** The reading column a block of documents is pictured in, in CSS pixels: a picture of it is then WIDEST wide, shown at its size. */
export const READING = WIDEST - 2 * MARGIN;
// The server's route of a document's icon as one picture (src/server/routes.mjs).
const ICON_ROUTE = "/__gallery/edit/icon";
// How long what a card asked for (the workspace, the net) may take to be answered.
const ASKING = 15_000;

/**
 * The size of a WebP picture in pixels, { width, height }, read from its header (a lossy, a lossless or an
 * extended one), or null for bytes that are none.
 */
export function webpSize(bytes) {
  if (bytes.length < 30 || bytes.toString("latin1", 0, 4) !== "RIFF" || bytes.toString("latin1", 8, 12) !== "WEBP") return null;
  const chunk = bytes.toString("latin1", 12, 16);
  if (chunk === "VP8 ") return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  if (chunk === "VP8L") return { width: 1 + (((bytes[22] & 0x3f) << 8) | bytes[21]), height: 1 + (((bytes[24] & 0x0f) << 10) | (bytes[23] << 2) | ((bytes[22] & 0xc0) >> 6)) };
  if (chunk === "VP8X") return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
  return null;
}

/** Whether a block is pictured as a card of a custom page (its places hold page), not as a document's. */
export const asCard = (found) => found.places?.includes("page") === true;

// The first instance of the block in `example` (outerInstances: one in no other), as written, or null.
function firstInstance(example, found) {
  const [node] = outerInstances(parseReport(`<!doctype html><html><head></head><body>${example}</body></html>`), found);
  if (!node) return null;
  const { startOffset, endOffset } = node.sourceCodeLocation;
  const offset = "<!doctype html><html><head></head><body>".length;
  return example.slice(startOffset - offset, endOffset - offset);
}

// The packages a markup names (its instances' and those in their slots), each one copied into `temp`.
async function copyPackages(markup, found, packages, temp) {
  for (const id of new Set([found.id, ...[...markup.matchAll(new RegExp(`${ATTRIBUTE}="([^"]+)"`, "g"))].map(([, named]) => named)])) {
    const other = id === found.id ? found : packages.get(id);
    if (other) await copyPackage(other, temp);
  }
}

// The custom page a card is pictured on: one board, the card at its first place, its default size.
const cardPage = (instance, { w, h }, lang) => `<!doctype html>
<html lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${SLUG}</title></head>
<body>
  <main class="gallery-page" data-page-id="${SLUG}">
    <div class="gallery-board" data-board-id="picture">
      <section class="gallery-card" data-card-id="picture" data-x="0" data-y="0" data-w="${w}" data-h="${h}">
${instance}
      </section>
    </div>
  </main>
</body>
</html>
`;

// The document a block of documents is pictured in: the instance alone, as its export draws it.
const documentPage = (instance, lang) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${SLUG}</title></head><body><main class="doc-page" data-doc-id="${SLUG}">${instance}\n</main></body></html>\n`;

// The exported document `html` with its reading column READING wide (the kit's --doc-content-max-width, its
// own declaration of it outweighed), the window\'s width and the rest of its look as they are.
const inColumn = (html) => html.replace(/<\/head>/i, `<style>:root { --doc-content-max-width: ${READING}px !important; }</style></head>`);

/**
 * Given before the page's scripts run, where a run gives the page a clock of its own: the time they read
 * (Date, Date.now) starts at `at` (ms) and goes on from there; what is timed (timers, frames) is not touched.
 */
function clockAt(at) {
  const Real = Date;
  const offset = at - Real.now();
  class Shifted extends Real {
    constructor(...given) {
      if (given.length === 0) super(Real.now() + offset);
      else super(...given);
    }
    static now() {
      return Real.now() + offset;
    }
  }
  globalThis.Date = Shifted;
}

/**
 * Given before the page's scripts run (a card's page): what the kit asks of the workspace (a fetch of
 * `route`, the address `global` names) and of the net (doc-net-fetch) answered by the functions the tab
 * was given (__galleryPictureQuery, __galleryPictureNet), what waits for an answer counted in
 * __galleryPicture.pending.
 */
function answering(route, global) {
  if (globalThis.__galleryPicture) return;
  const watch = { pending: 0 };
  globalThis.__galleryPicture = watch;
  globalThis[global] = route;
  const original = globalThis.fetch;
  globalThis.fetch = function (input) {
    let url = null;
    try {
      url = new URL(typeof input === "string" ? input : input?.url ?? String(input), location.href);
    } catch {}
    // A file's page: the route under its drive on Windows (file:///C:/__gallery/…).
    if (!url?.pathname.endsWith(route)) return original.apply(this, arguments);
    watch.pending += 1;
    return globalThis.__galleryPictureQuery(url.searchParams.get("kind") ?? "", url.searchParams.get("options") ?? "{}", url.searchParams.get("doc"))
      .then(({ status, body }) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }))
      .finally(() => { watch.pending -= 1; });
  };
  addEventListener("doc-net-fetch", (event) => {
    if (event.defaultPrevented || !event.cancelable) return;
    event.preventDefault();
    watch.pending += 1;
    event.detail.answer(globalThis.__galleryPictureNet(event.detail.ask).finally(() => { watch.pending -= 1; }));
  });
}

// In the page: whether nothing it asked for waits for an answer, within `ms`.
function answeredAll(ms) {
  return new Promise((resolve) => {
    const started = Date.now();
    const look = () => {
      if (!globalThis.__galleryPicture?.pending) resolve(true);
      else if (Date.now() - started > ms) resolve(false);
      else setTimeout(look, 50);
    };
    look();
  });
}

// In the page: a card whose height the page measures (no size of its manifest's) made as tall as its content, in cells.
function measured({ cell, gap }) {
  const card = document.querySelector(".gallery-card");
  if (!card) return;
  const rows = Math.max(1, Math.min(24, Math.ceil((card.scrollHeight + gap) / (cell + gap))));
  card.dataset.h = String(rows);
  card.style.setProperty("--gallery-h", String(rows));
}

// In the page: how much wider than it stands the first instance's content is (its own scroll, or that of a part
// of it that scrolls or clips across: a 看板's columns side by side at their least width), in CSS px.
function overflowOf(instance) {
  const node = document.querySelector(instance);
  if (!node) return 0;
  let most = node.scrollWidth - node.clientWidth;
  for (const part of node.querySelectorAll("*")) {
    if (/auto|scroll|hidden|clip/.test(getComputedStyle(part).overflowX)) most = Math.max(most, part.scrollWidth - part.clientWidth);
  }
  return Math.max(0, most);
}

// In the page: its reading column `width` CSS px wide.
function columnOf(width) {
  document.documentElement.style.setProperty("--doc-content-max-width", `${width}px`, "important");
}

// In the page: the box pictured, in the page's coordinates: the card (a custom page's), else the first instance, or null.
function boxOf(instance) {
  const node = document.querySelector(".gallery-page .gallery-card") ?? document.querySelector(instance);
  if (!node) return null;
  const { left, top, width, height } = node.getBoundingClientRect();
  return { x: left + scrollX, y: top + scrollY, width, height, page: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight } };
}

/** The part of the page a picture shows around `box` (boxOf's): MARGIN more each side, within the page, TALLEST at most, and how much it is scaled. */
export function clipOf(box) {
  const x = Math.max(0, Math.floor(box.x - MARGIN));
  const y = Math.max(0, Math.floor(box.y - MARGIN));
  const width = Math.min(box.page.width, Math.ceil(box.x + box.width + MARGIN)) - x;
  const height = Math.min(Math.ceil(box.height + 2 * MARGIN), TALLEST, box.page.height - y);
  return { x, y, width, height, scale: Math.min(1, WIDEST / width) };
}

/**
 * The pictures of package `found` of the workspace at `root` (its `catalog`, readCatalog's), made of the
 * first instance `example` holds, in a context of its own in `browser`: { light, dark } (WebP bytes), or
 * null where the example holds no instance or nothing was drawn. Throws what stopped it (a page that
 * does not answer: `answered`'s error). `language`: the one its page is written in (the language Gallery
 * writes in); `clock`: the time (ms) the page's scripts start at, where not the computer's; `net(ask)`: what
 * answers a card's fetch of the net (doc-net-fetch's ask: its answer), where not the workspace's own route.
 */
export async function blockPictures(browser, { root, found, example, catalog = readCatalog(root, undefined, { on: found.id }), answer = ANSWER, language = fileLanguage(), clock = null, net = null }) {
  const instance = example ? firstInstance(example, found) : null;
  if (!instance) return null;
  const card = asCard(found);
  const temp = await fsp.mkdtemp(path.join(os.tmpdir(), "gallery-block-picture-"));
  let context = null;
  try {
    await copyPackages(card ? instance : example, found, catalog.packages, temp);
    const lang = htmlLang(language);
    const copied = readCatalog(temp);
    // The workspace's facts at the page's clock, where it has its own (its week, its today): what a card reads
    // of the workspace is answered by them, and a block of documents' export embeds them.
    const now = clock === null ? undefined : () => new Date(clock);
    const index = createIndex({ root, read: readDocument(root), activity: createActivity({ file: layoutOf(root).activity, now }), now });
    let html;
    const size = defaultSize(found.card);
    if (card) html = await offlineCustomPage(cardPage(instance, size, lang), { catalog: copied });
    else {
      const folder = path.join(temp, SLUG);
      await fsp.mkdir(folder);
      const made = new Date(clock ?? Date.now());
      await fsp.writeFile(path.join(folder, "doc.html"), shownSource(documentPage(example, lang)).text);
      await fsp.writeFile(path.join(folder, "doc.json"), JSON.stringify({ title: nameOf(found, language), description: SLUG, type: "component", created: made.toISOString() }));
      for (const name of ["doc.html", "doc.json"]) await fsp.utimes(path.join(folder, name), made, made);
      html = inColumn(await (await offlineReports({ directory: temp, catalog: copied, workspace: () => snapshotOf(index, temp, now) }))(SLUG));
    }
    const file = path.join(temp, "picture.html");
    await fsp.writeFile(file, html);

    const ask = (promise, doing) => answered(promise, doing, answer);
    context = await ask(browser.createBrowserContext(), "a browser context opened for the picture");
    const tab = await ask(context.newPage(), "a tab opened for the picture");
    await ask(refuseDialogs(tab, new Set()), "the picture's tab was set to refuse dialogs");
    // Nothing of the page reaches the network but through what answers it below; a document's icon (a card
    // listing documents: /__gallery/edit/icon, the server's one picture of an icon's value) is drawn as the server draws it.
    await ask(tab.setRequestInterception(true), "the picture's tab was set to keep to its file");
    tab.on("request", (request) => {
      if (request.isInterceptResolutionHandled()) return;
      const url = new URL(request.url());
      if (url.protocol === "file:" && url.pathname.endsWith(ICON_ROUTE)) {
        const image = iconImage({ value: url.searchParams.get("value") ?? "", slug: url.searchParams.get("slug"), tab: url.searchParams.has("tab"), reportsDirectory: root });
        request.respond(image ? { status: 200, contentType: image.type, body: image.body } : { status: 404 }).catch(() => {});
        return;
      }
      (/^(?:file|data|blob):$/i.test(url.protocol) ? request.continue() : request.abort("blockedbyclient")).catch(() => {});
    });
    if (card) {
      const route = net ? null : createNetRoute({ root, catalog: () => readCatalog(root, undefined, { on: found.id }) });
      await ask(tab.exposeFunction("__galleryPictureQuery", async (kind, options, doc) => {
        let given;
        try {
          given = JSON.parse(options);
        } catch {
          return { status: 400, body: { ok: false, reason: "options", message: "options is JSON" } };
        }
        const [status, body] = await index.query(kind, given, { doc });
        return { status, body };
      }), "the picture's tab was given the workspace");
      await ask(tab.exposeFunction("__galleryPictureNet", (asked) => Promise.resolve().then(() => (net ? net(asked) : route.answer(asked))).catch(() => ({ ok: false, code: "offline" }))), "the picture's tab was given the net");
      await ask(tab.evaluateOnNewDocument(answering, QUERY_ROUTE, WORKSPACE_GLOBAL), "the picture's tab was given its answers");
    }
    if (clock !== null) await ask(tab.evaluateOnNewDocument(clockAt, clock), "the picture's tab was given its clock");
    await ask(tab.setViewport({ width: card ? WINDOW.page : WINDOW.document, height: WINDOW.height, deviceScaleFactor: DENSITY }), "the picture's window was sized");
    const selector = `:is(${INSTANCE})[${ATTRIBUTE}="${found.id}"]`;
    const pictures = {};
    for (const theme of ["light", "dark"]) {
      await ask(tab.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme }]), `the ${theme} theme came for the picture`);
      if (theme === "light") {
        await answered(tab.goto(pathToFileURL(file).href, { waitUntil: "load", timeout: 0 }), "the picture's page opened", 60_000);
        await answered(settle(tab, { timeout: 10_000 }), "the picture's page was drawn", 60_000);
        if (card) await ask(tab.evaluate(answeredAll, ASKING), "what the card asked for was answered");
        if (card && size.measured) await ask(tab.evaluate(measured, { cell: CELL, gap: GAP }), "the card was made as tall as its content");
        // A block of documents whose content does not fit READING (a 看板's columns at their least) stands in a column as wide as it takes: whole, scaled down to WIDEST.
        const over = card ? 0 : await ask(tab.evaluate(overflowOf, selector), "the block's width was measured");
        if (over > 1) {
          await ask(tab.evaluate(columnOf, READING + Math.ceil(over)), "the block was given the width it takes");
          await answered(settle(tab, { timeout: 10_000 }), "the picture's page was drawn at that width", 60_000);
        }
      }
      if (card) await ask(tab.evaluate(answeredAll, ASKING), "what the card asked for was answered");
      await answered(settle(tab, { timeout: 10_000 }), `the picture's page was drawn ${theme}`, 60_000);
      const box = await ask(tab.evaluate(boxOf, selector), "the block was found on the picture's page");
      if (!box || box.width < 1 || box.height < 1) return null;
      const clip = clipOf(box);
      pictures[theme] = Buffer.from(await ask(tab.screenshot({ type: "webp", quality: QUALITY, clip, captureBeyondViewport: true }), `the ${theme} picture was taken`));
    }
    return pictures;
  } finally {
    await context?.close().catch(() => {});
    await fsp.rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
  }
}

/**
 * What the picture's export of a block of documents embeds of the workspace (where its blocks read
 * it: render/pipeline.mjs offlineReports): what an export of a document of workspace `index` (createIndex's)
 * embeds, the facts of the workspace as a card's reads are answered, and its own document's, the picture's page
 * in `temp` (workspace.query("document"): when it was made and written, at the page's clock where it has one,
 * its words; no one wrote it); so that a block that reads them is pictured as it reads, not as an export that
 * kept none (2026-11-18: a line under a title of when it was made and written showed its offline words). The
 * tables an export keeps are those its instances asked the server for, which no one did of this page: none.
 */
async function snapshotOf(index, temp, now) {
  const snapshot = (await index.snapshot(SLUG)) ?? {};
  const [status, own] = await createIndex({ root: temp, read: readDocument(temp), now }).query("document", { slug: SLUG });
  return status === 200 ? { ...snapshot, document: own.data } : snapshot;
}

/** The block's name in `language` (its manifest's: a string or { zh, en }), the title of the document it is pictured in. */
function nameOf(found, language) {
  const name = found.name;
  if (typeof name === "string" && name) return name;
  return [name?.[language], name?.zh, name?.en].find((value) => typeof value === "string" && value) ?? SLUG;
}

// How the workspace's facts read a document: its file as its pages show it (as gallery export's snapshot reads it).
const readDocument = (root) => async (slug) => {
  const source = await fsp.readFile(documentFiles(documentDirectory(slug, root)).html, "utf8").catch(() => null);
  return source === null ? null : { source, text: shownSource(source).text };
};

/**
 * Whether gallery block check writes the pictures of block `id` of the workspace at `root`: not of one of
 * Gallery's own (its packs ship theirs, and a copy as added is to stay as Gallery ships it), nor of one a
 * pack installed (.gallery/blocks.json: its pack brought its own, and its folder stays as installed, so that
 * the pack can update it).
 */
export const picturesWritten = (root, id) => !isShippedId(id) && !Object.hasOwn(recordOf(root), id);

/** `pictures` (blockPictures') written into the block's `folder` by their names (PICTURES), each only where it is not what is there: the names written. */
export async function writePictures(folder, pictures) {
  const written = [];
  for (const theme of ["light", "dark"]) {
    const file = path.join(folder, PICTURES[theme]);
    const was = await fsp.readFile(file).catch(() => null);
    if (was?.equals(pictures[theme])) continue;
    await writeAtomic(file, pictures[theme]);
    written.push(PICTURES[theme]);
  }
  return written;
}
