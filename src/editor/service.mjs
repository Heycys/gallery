import { documentKey } from "../shared/workspace-address.mjs";
import { serviceLocation } from "../shared/service-location.mjs";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { FILE as NOTES_FILE } from "../shared/annotations.mjs";
import { currentCatalog, menuOf } from "../shared/component-catalog.mjs";
import { escapeTyped } from "../shared/escape.mjs";
import { writeAtomic } from "../shared/files.mjs";
import { sendJson } from "../shared/http.mjs";
import { newNames } from "../shared/new-names.mjs";
import { REQUEST_ID } from "../shared/ids.mjs";
import { earlyMoveScript } from "../shared/reading-place.mjs";
import { UPLOAD_REQUEST_LIMIT } from "../shared/media.mjs";
import { reportsDirectory as defaultReportsDirectory } from "../shared/paths.mjs";
import { sameDirectory } from "../shared/preview-server.mjs";
import { slugPattern } from "../shared/reports.mjs";
import { TODO_MOST } from "../shared/workspace-query.mjs";
import { documentDirectory, documentFiles, isDocumentSource } from "../shared/workspace.mjs";
import { createAnnotations } from "./annotations.mjs";
import { createChanges } from "./changes.mjs";
import { historyDirectory, keepSummariesIn, keepVersionIn, listVersionsIn, readSummariesIn, readVersionIn, versionNamed } from "./history.mjs";
import { droppedLines, droppedOf, keepDropped } from "./dropped-annotations.mjs";
import { createMediaStore } from "./media-store.mjs";
import { keepRewrite, takeRewrites } from "./rewrites.mjs";
import { createSettle, WAIT } from "./settle.mjs";
import { locateTodos, todoCommit } from "./todos.mjs";
import { applyEdits, blockChanges, changeLines, changedBlocks, commitEdits, findBlocks, frameOf, handedInSource, hashOf, headerChanged, inStep, instrument, markedVersion, randomBlockId, rebaseOnto, retitledBase, revertCheck, shownSource, textRows } from "./source.mjs";
import { EMPTY_STYLE, emptyWordsScript, showEmpty } from "./components/placeholder.mjs";
import { HOST_NAMES, KIND_NAMES } from "./components/registry.mjs";
import { TOKENS } from "./page/look.mjs";
import { MARGIN_STYLE, earlyMarginScript } from "./page/margin.mjs";

// Local endpoints behind in-place editing in `npm run dev:local`: the page's commits (autosave)
// and an export's write of a report's file (the hand-in, which gallery export asks for while this
// server runs, so that it goes through the queue commits run in).
// Listening on 127.0.0.1 does not stop other sites open in the same browser from posting to it
// (or DNS rebinding), so every request needs the exact Host/Origin, a JSON body and the token
// embedded in the preview page. It only ever writes a document's doc.html (and the title in doc.json;
// report.html and report.json in a document made before Gallery 0.1: shared/workspace.mjs
// documentFiles), and the reader's 批注 beside it (annotations.json: annotations.mjs).
//
// With a state directory, the token and the source versions pages were opened on (what their
// commits name blocks by until they have ids) are kept on disk, so a page opened before the preview
// server restarted still saves and merges as before; so is each report as it was before and after
// each of its writes, and as each write of anyone else's left it, with who made it (history/<slug>/,
// the recent versions, history.mjs: the workbench's 历史版本, gallery history), the answer
// to each commit of the last while (receipts/<slug>/), for a commit sent again, and what a reader's
// edit wrote of an Agent's natural HTML as the kit's markup (rewrites/, rewrites.mjs) and the 批注 a
// check deleted, their words gone (dropped-annotations/, dropped-annotations.mjs), for the Agent's
// next check or export to say; and what an Agent (anyone but this service) wrote since the reader last
// kept or reverted it, under review (changes/<slug>/, changes.mjs: docs/editor.md "Agent's changes").
//
// A report's file half written (an Agent between two edits of one change: source/whole.mjs) is
// held (settle.mjs): no commit or reader's hand-in is applied to it and no page is told of it
// until it is whole again, or until it has been held a while; a page's load meanwhile is served what
// the preview last took of it (readTaken).

const versionPattern = /^[a-f0-9]{16}$/;
const LIST_BUDGET = 250; // ms: what one answer of 历史版本's list spends working out what versions changed (listHistory)
const maxBody = 2 * 1024 * 1024;
const maxUpload = UPLOAD_REQUEST_LIMIT; // the biggest upload, as base64
const maxSnapshots = 50;
const maxMerges = 3; // a commit is applied again to a file changed meanwhile at most this often
const maxReceipts = 200; // answers kept of each report's commits
const BUSY = "文件一再被修改（例如 Agent 正在写入），稍后再同步"; // a commit not applied: the file kept changing, or stayed half written
const TOO_LARGE = "这次的修改太大，一次存不下"; // a body past what a request may carry
const POLL = 250; // how often a request waiting for a held file looks at it again
const AGAIN = Symbol("again"); // a request that found its file held in the queue: it waits outside it again
const EDITOR_ENTRY = "/__gallery/edit/src/editor/page/editor.mjs"; // the editor, as the preview serves its modules (src/server/routes.mjs)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A body past `limit` is read to its end and let go, which is what gets a page its answer: a request
// cut off while it sends is one that never reached the server, to the page.
function readBody(request, limit = maxBody) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) chunks.length = 0;
      else chunks.push(chunk);
    });
    request.on("end", () => (size > limit ? reject(new Error("too-large")) : resolve(Buffer.concat(chunks).toString("utf8"))));
    request.on("error", reject);
  });
}

// The token pages send with each request: the one in the state directory, made on first use.
export function loadToken(directory) {
  if (!directory) return randomBytes(16).toString("hex");
  const file = path.join(directory, "token");
  try {
    const saved = readFileSync(file, "utf8").trim();
    if (/^[a-f0-9]{32}$/.test(saved)) return saved;
  } catch {}
  const token = randomBytes(16).toString("hex");
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(file, token, { mode: 0o600 }); // the owner's alone on POSIX: it authorizes writes
  } catch {} // not writable: the token lasts as long as the server
  return token;
}

// `reportsDirectory`: the workspace whose documents it edits (shared/workspace.mjs: a document's folder
// by documentDirectory, its files by documentFiles). `stateDirectory` (optional) keeps the token,
// snapshots and recent versions. `write` writes a document's files (writeAtomic; tests pass their own). `ids`: how a save
// names the blocks it touches for the first time and the blocks made on the page (applyEdits: true
// for random ids, or a function returning the next one). `finish`: what the server adds to what a
// commit, a naturalized page or an export writes (the kit tags its blocks need: withNeededKitTags).
// `log`: where what the Agent should know of a write is said (the dev server's log): the natural HTML
// a reader's first edit wrote as the kit's markup (changeLines), as gallery export says what it wrote,
// and the 批注 a check deleted because their words are gone (dropped-annotations.mjs).
// `settling`: createSettle's options (`now`, `hold`, `quiet`) and `wait` (WAIT), for tests.
// `onChanges(slug)`: a review of the Agent's changes to a report started, grew, ended, was kept or
// reverted (its pages read it again: the preview's event stream says "changes"). `listBudget`: how long one answer of
// 历史版本's list works out what versions changed (LIST_BUDGET ms; tests give their own).
export function createEditService({ base = "", token: serviceToken = null, reportsDirectory = defaultReportsDirectory, stateDirectory = null, write: writeFile = writeAtomic, ids = true, finish = (text) => text, log = null, settling = {}, onChanges = () => {}, listBudget = LIST_BUDGET } = {}) {
  const token = serviceToken ?? loadToken(serviceLocation().data);
  const settle = createSettle(settling);
  const waitFor = settling.wait ?? WAIT;
  // Every write of the service: a report's file it wrote is its own (settle: whole, and told its pages at
  // once), and whose it was (`by`: "reader", the reader's edit, or "agent", a commit of a page of the
  // Agent's own or the Agent's hand-in), which the workspace's record of edits counts it as (writerOf).
  const writers = new Map(); // slug -> { hash, by }: the service's last write of its file
  const write = async (file, text, options, by = "reader") => {
    const done = await writeFile(file, text, options);
    if (done !== false && isDocumentSource(path.basename(file))) {
      const slug = path.basename(path.dirname(file));
      settle.wrote(slug, text);
      writers.set(slug, { hash: hashOf(text), by });
    }
    return done;
  };
  // A document's folder and its files (doc.html and doc.json, or an old one's report.html and report.json).
  const folderOf = (slug) => documentDirectory(slug, reportsDirectory);
  const sourceOf = (slug) => documentFiles(folderOf(slug)).html;
  // Source versions served to preview pages: the merge base when the file changes before a save.
  // The last 50 are kept in memory and, with a state directory, as <version>.html files there
  // (the ones used last are kept).
  const snapshots = new Map();
  const snapshotDirectory = stateDirectory && path.join(stateDirectory, "snapshots");
  let disk = Promise.resolve(); // snapshot writes, one at a time
  let queue = Promise.resolve();

  // Keeps the newest `max` files of a state directory whose names match `belong`, and deletes the rest:
  // the oldest by modification time (the ones used last stay) or, `by: "name"`, by name. Run on the
  // disk chain: one that fails is a state not kept, nothing more.
  const keepRecent = async (directory, belong, max, { by = "time" } = {}) => {
    const names = (await fs.readdir(directory)).filter((name) => belong.test(name));
    if (names.length <= max) return;
    const oldest = by === "name" ? names.sort()
      : (await Promise.all(names.map(async (name) => ({ name, time: (await fs.stat(path.join(directory, name))).mtimeMs })))).sort((a, b) => a.time - b.time).map(({ name }) => name);
    await Promise.all(oldest.slice(0, oldest.length - max).map((name) => fs.rm(path.join(directory, name), { force: true })));
  };

  const store = (version, source) => {
    if (!snapshotDirectory) return;
    disk = disk.then(async () => {
      const file = path.join(snapshotDirectory, `${version}.html`);
      const now = new Date();
      try {
        await fs.utimes(file, now, now); // already there: now the one used last
        return;
      } catch {}
      await fs.mkdir(snapshotDirectory, { recursive: true });
      await writeAtomic(file, source);
      await keepRecent(snapshotDirectory, /^[a-f0-9]{16}\.html$/, maxSnapshots);
    }).catch(() => {}); // not writable: the snapshot lasts as long as the server
  };

  // The report as `source` says, kept among its recent versions (history.mjs: history/<slug>/, none
  // twice in a row) with who made it (`meta`: { by, kind, from? }; with no `by`, a version of a write
  // outside the service: the Agent's, or not known for the first one kept): before and after each write
  // of the service's own, and as the service takes a write of anyone else's (keepTaken). On the disk
  // chain, in the order asked. Resolves to the id of the version that holds it (null: not kept, with no
  // state directory or one not writable: no safety net, nothing else changes).
  const keepVersion = (slug, source, meta = {}) => {
    if (!stateDirectory || typeof source !== "string" || !slugPattern.test(slug)) return Promise.resolve(null);
    const run = disk.then(() => keepVersionIn(historyDirectory(stateDirectory, slug), source, meta)).catch(() => null);
    disk = run;
    return run;
  };
  // A take of the report's file (a page served, a write announced, a commit's or a request's read of
  // it, the look as the server starts): the file kept as a version when it is not the service's own last
  // write, a write of anyone else's (an Agent's Write or Edit, a hand edit, a write while no server ran).
  const keepTaken = (slug, source) => {
    if (typeof source !== "string" || writers.get(slug)?.hash === hashOf(source)) return Promise.resolve(null);
    return keepVersion(slug, source, { kind: "write" });
  };

  // The answers to commits, by the id the page gave each (`request`): in memory, and with a state
  // directory as receipts/<slug>/<id>.json (the last maxReceipts of each report), so that one sent
  // again after a restart gets its answer too. Each with a digest of what the commit carried.
  const receipts = new Map(); // "<slug> <id>" -> { digest, answer }
  const receiptDirectory = (slug) => stateDirectory && path.join(stateDirectory, "receipts", slug);
  const keepReceipt = (slug, id, digest, answer) => {
    receipts.set(`${slug} ${id}`, { digest, answer });
    while (receipts.size > maxReceipts * 4) receipts.delete(receipts.keys().next().value);
    const directory = receiptDirectory(slug);
    if (!directory) return;
    disk = disk.then(async () => {
      await fs.mkdir(directory, { recursive: true });
      await writeAtomic(path.join(directory, `${id}.json`), JSON.stringify({ digest, answer }));
      await keepRecent(directory, { test: (name) => name.endsWith(".json") && REQUEST_ID.test(name.slice(0, -".json".length)) }, maxReceipts);
    }).catch(() => {}); // not writable: the answer is kept as long as the server runs
  };
  const findReceipt = async (slug, id) => {
    const known = receipts.get(`${slug} ${id}`);
    if (known) return known;
    const directory = receiptDirectory(slug);
    if (!directory) return null;
    await disk;
    try {
      const kept = JSON.parse(await fs.readFile(path.join(directory, `${id}.json`), "utf8"));
      return typeof kept?.digest === "string" && kept.answer?.ok ? kept : null;
    } catch {
      return null;
    }
  };

  // What a commit or the reader's hand-in wrote of the Agent's natural HTML as the kit's markup (rewrites.mjs): in memory, and
  // with a state directory there, where gallery check and gallery export take it.
  const rewritten = new Map(); // slug -> [{ time, changes }]
  const keptRewrite = (slug, changes) => {
    const time = new Date().toISOString();
    if (!stateDirectory) return void rewritten.set(slug, [...(rewritten.get(slug) ?? []), { time, changes }].slice(-20));
    disk = disk.then(() => keepRewrite({ stateDirectory, reportsDirectory, slug, time, changes })).catch(() => {}); // not writable: the log says it still
  };
  const takeRewritten = async (slug) => {
    if (!stateDirectory) {
      const entries = rewritten.get(slug) ?? [];
      rewritten.delete(slug);
      return entries;
    }
    await disk;
    return takeRewrites({ stateDirectory, reportsDirectory, slug });
  };

  const remember = (version, source) => {
    snapshots.delete(version);
    snapshots.set(version, source);
    while (snapshots.size > maxSnapshots) snapshots.delete(snapshots.keys().next().value);
    store(version, source);
  };

  // A snapshot from memory, or from disk after a restart (checked against its version).
  const recall = async (version) => {
    if (snapshots.has(version)) return snapshots.get(version);
    if (!snapshotDirectory || !versionPattern.test(version)) return null;
    await disk;
    const source = await fs.readFile(path.join(snapshotDirectory, `${version}.html`), "utf8").catch(() => null);
    if (source === null || hashOf(source) !== version) return null;
    remember(version, source);
    return source;
  };

  // A report's file as its pages see it (docs/editor.md, "Natural HTML"): for a report, its natural
  // HTML made the kit's in memory (shownSource: naturalize, and the kit tags its blocks then need),
  // the file as it is when nothing in it is natural. The preview serves
  // this text, a page opens on its version and every version the server tells a page is of it (the
  // live reload's, a commit's, the revert check's), so an Agent's natural file is no one else's write
  // to a page that shows it. Nothing is written: the file changes with the reader's first edit (a
  // commit is applied to this text) or the Agent's export (handIn).
  // What it made of the texts read lately is kept (the last few, by the whole text): shownSource reads
  // nothing but the text, so the same text is shown the same, and a report read again (a page loaded
  // again, the workbench's twin of it, the announce of a write, a commit) is not parsed again for it
  // (2.5 ms on a big report). Its `changes` are only ever read.
  const shownTexts = new Map(); // source -> { text, changes }
  const shown = (source) => {
    const known = shownTexts.get(source);
    if (known) return known;
    const made = shownSource(source, { finish });
    shownTexts.set(source, made);
    while (shownTexts.size > 8) shownTexts.delete(shownTexts.keys().next().value);
    return made;
  };
  // The Agent's changes under review (changes.mjs): every take of a report's file is looked at
  // (`look`), every write of the service's own is told it (`wrote`), a commit's with the same commit
  // applied to the baseline (rebaseOnto), so that the reader's own edits never count as the Agent's;
  // all in their own queue, after the answer. Not the 写作偏好 page's (in .gallery/pages/).
  const pagesDirectory = path.join(path.resolve(reportsDirectory), ".gallery", "pages");
  const reviews = createChanges({
    stateDirectory, shown: (source) => shown(source).text, folderOf, log,
    isPage: (slug) => path.resolve(folderOf(slug)).startsWith(pagesDirectory + path.sep),
  });
  const noted = (slug, job) => job.then((moved) => { if (moved) onChanges(slug); }, (error) => log?.(`${slug}: the Agent's changes not kept (${error.message})`));
  /**
   * A report as its pages see it: { file, source (the file's text), text, version (the hash of
   * text), changes (what naturalize made the kit's in it) }, or null when it has no file.
   */
  async function read(slug, given = undefined) {
    if (typeof slug !== "string" || !slugPattern.test(slug)) return null;
    const file = sourceOf(slug);
    const source = given !== undefined ? given : await fs.readFile(file, "utf8").catch(() => null);
    if (source === null) return null;
    const { text, changes } = shown(source);
    return { file, source, text, version: hashOf(text), changes };
  }

  /**
   * Where a report's file stands for the preview (settle.mjs), read now: { source (null: none),
   * held (half written: no page is told of it, served it or commits to it yet), signs (what holds
   * it), wait (ms until it may be taken, or its pages told of it), own (this service wrote it) }.
   */
  async function settled(slug) {
    if (typeof slug !== "string" || !slugPattern.test(slug)) return { source: null, held: false, signs: [], wait: 0, own: false };
    const file = sourceOf(slug);
    // Read before its time: a write between the two makes the file look newer than what was read, never older.
    const source = await fs.readFile(file, "utf8").catch(() => null);
    const mtime = (await fs.stat(file).catch(() => null))?.mtimeMs ?? 0;
    return { source, ...settle.judge(slug, { source, mtime }) };
  }

  /** settled(slug) once the file is not held, or as it stands at `until` (a time) when it still is. */
  async function whenTaken(slug, until = Date.now() + waitFor) {
    for (;;) {
      const state = await settled(slug);
      if (!state.held || Date.now() >= until) return state;
      await sleep(Math.max(0, Math.min(POLL, until - Date.now())));
    }
  }

  /**
   * A report as a page is served it (read): its file once taken, `wait` ms at most for one held
   * (whenTaken), and, while it is held still, the text the preview last took of it, which its pages
   * show (the file as it is when the preview has taken none: a server started since); `held` says the
   * file was held still (the workspace's facts read such a one again when next asked).
   */
  async function readTaken(slug, { wait = waitFor } = {}) {
    const state = await whenTaken(slug, Date.now() + wait);
    const report = await read(slug, state.held && state.taken !== undefined ? state.taken : state.source);
    return report && { ...report, held: state.held === true };
  }

  /**
   * Mark a report for editing. Returns the instrumented HTML, the snippet to add before </body> and
   * the one to add before </head> (the reader's display settings, kit ui.js, keep working, as the
   * workbench's theme and view copy go through them, but their button stays hidden from the first
   * paint: the page edited has the workbench's controls). What is empty shows as the editor shows it
   * from the first paint too (components/placeholder.mjs): its look in the head, its bars and chips
   * in the page, their words in Chinese and said in English before the page shows when its UI is
   * (emptyWordsScript). Its tables open in the file's order, whatever
   * order the kit would show them in (the head declares it: data-ge-order, which the kit's tables read),
   * as the page's blocks and table tools count rows. The room at the page's right (page/margin.mjs: the
   * outline, when the reader has it on for this report, and the cards of its 批注, when their file is
   * there, which no page is kept past: a file's coming or going changes the folder's stamp, ../server/stamps.mjs)
   * is taken before the page shows, so the column never moves as it opens. The reader moving the page from its
   * start is marked (reading-place.mjs earlyMoveScript): a page shown again puts them back where they were
   * only until they move it themselves, and the editor is imported only once the page has loaded.
   * The page's map carries what its menus show of the workspace's component packages (`components`:
   * menuOf), each with the tags of the kit's files it asks for (`kit`, by `kitTags(ids)`, the render's),
   * and what the reader hid of the built-in blocks (`hidden`: page/offered.mjs).
   * `editor`: where the page imports the editor from (the preview server names its modules by their
   * stamp, which a browser keeps them under: src/server/stamps.mjs).
   */
  function preview(slug, source, { editor = EDITOR_ENTRY, kitTags = () => [] } = {}) {
    const { html, map } = instrument(source);
    remember(map.version, source);
    const catalog = currentCatalog();
    const components = menuOf(catalog).map(({ assets, ...entry }) => ({ ...entry, kit: kitTags(assets) }));
    const payload = JSON.stringify({ slug, token, ...map, components, hidden: catalog.settings.hidden }).replace(/</g, "\\u003c");
    const snippet = `<script type="application/json" id="doc-edit-map" data-doc-dev>${payload}</script>
  <script data-doc-dev>document.currentScript.remove(); import(${JSON.stringify(editor)});</script>`;
    const head = `<style data-doc-dev>.doc-display { display: none; }</style>
  <style data-doc-dev data-ge-palette>${TOKENS}</style>
  <style data-doc-dev>${EMPTY_STYLE}</style>
  <script data-doc-dev>${emptyWordsScript()}</script>
  <script data-doc-dev>document.currentScript.remove(); document.documentElement.setAttribute("data-ge-order", "file");</script>
  <script data-doc-dev>document.currentScript.remove(); ${earlyMoveScript}</script>
  <style data-doc-dev data-ge-margin-style>${MARGIN_STYLE}</style>
  <script data-doc-dev>document.currentScript.remove(); ${earlyMarginScript(documentKey(slug, base), { notes: existsSync(path.join(folderOf(slug), NOTES_FILE)) })}</script>`;
    return { html: showEmpty(html), snippet, head };
  }

  /**
   * A page opened on this text without preview() making it again (the preview server served the
   * page it kept: src/server/page-cache.mjs): its version is kept as preview() keeps it, the merge
   * base of the page's commits.
   */
  const opened = (source) => remember(hashOf(source), source);

  // A request from a page of this server: a POST with the exact Host and Origin, the token and a
  // JSON body. Returns { error } or { body }. (The workspace service checks its requests with it too.)
  // Its checks before the body: a POST with the exact Host and Origin and the token. null, or the refusal [status, body].
  function checkHeaders(request) {
    if (request.method !== "POST") return [405, { ok: false, reason: "method" }];
    const host = request.headers.host ?? "";
    const port = request.socket.localPort;
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return [403, { ok: false, reason: "host" }];
    if (request.headers.origin !== `http://${host}`) return [403, { ok: false, reason: "origin" }];
    if (request.headers["x-gallery-token"] !== token) return [403, { ok: false, reason: "token" }];
    return null;
  }
  async function check(request, limit = maxBody) {
    const refused = checkHeaders(request);
    if (refused) return { error: refused };
    if (!/^application\/json\b/i.test(request.headers["content-type"] ?? "")) return { error: [415, { ok: false, reason: "type" }] };
    try {
      return { body: JSON.parse(await readBody(request, limit)) };
    } catch (error) {
      return { error: error.message === "too-large" ? [413, { ok: false, reason: "body", message: TOO_LARGE }] : [400, { ok: false, reason: "body" }] };
    }
  }

  // An autosave commit (commitEdits): what changed on the page since its last commit, named by
  // identity, applied to the file as it is now, as pages see it (read: an Agent's natural HTML the
  // kit's, so the first commit that changes something writes the kit's markup; one that changes
  // nothing leaves the file as written). `opening` is the version the page opened on, for
  // what it names by where it was then (its snapshot, when this server still has it). Agents keep
  // writing report.html directly, so right before replacing it the file is checked again: if it
  // changed in the meantime, the commit is applied to that version instead (a few times at most).
  // This makes the window in which a direct write could be overwritten very small; it is not a
  // lock, and a writer that ignores this service can still land between the check and the rename.
  // A commit carries the id the page gave it (`request`): sent again (its answer lost, or from the
  // crash buffer), it gets the answer it had (`again`), whatever the file says now, so the page
  // takes in exactly what that commit did; with other contents, it is refused. The answer is kept
  // once the file is written: a server stopped in between applies it again when it comes again,
  // which commits are made to bear. A file half written is never committed to (respondSettled: the
  // commit waits for it, `until` at most, then is answered busy, nothing written). The first commit
  // that writes an Agent's natural HTML as the kit's markup keeps what it wrote (rewrites.mjs) for the
  // Agent's next gallery check or gallery export to say, and says it in the dev server's log.
  async function handleCommit(body, until) {
    // `pageIds`: the ids the page knows its blocks by (commitEdits), no part of what the commit does.
    // `agent`: the commit of a page of the Agent's own (its address's ?agent: gallery block try's, the
    // Agent 自用 one), no reader's edit: its write and its version are the Agent's (writerOf, the recent versions).
    const { slug, opening, known = null, texts = [], units = [], touch = [], pageIds = null, request: id = null, agent = false } = body;
    if (typeof slug !== "string" || !slugPattern.test(slug) || ![texts, units, touch].every(Array.isArray)) return [400, { ok: false, reason: "body" }];
    if (id !== null && (typeof id !== "string" || !REQUEST_ID.test(id))) return [400, { ok: false, reason: "body" }];
    const digest = id === null ? null : hashOf(JSON.stringify([opening ?? null, texts, units, touch]));
    const again = await keptAnswer(body);
    if (again) return again;
    const answer = (body) => {
      if (id !== null) keepReceipt(slug, id, digest, body);
      return [200, body];
    };
    const file = sourceOf(slug);
    const openingSource = typeof opening === "string" && versionPattern.test(opening) ? await recall(opening) : null;
    // A deleted unit comes back (undo) only as this server took it out of this report.
    const seal = (source) => createHmac("sha256", token).update(`${slug}\n${source}`).digest("hex").slice(0, 32);
    for (let attempt = 1; ; attempt++) {
      const { source: current, held } = await settled(slug);
      if (current === null) return [404, { ok: false, reason: "missing" }];
      // Half written (written again while the commit waited its turn): it waits outside the queue again.
      if (held) return Date.now() < until ? AGAIN : [409, { ok: false, reason: "busy", message: BUSY }];
      // An Agent's write the announcement has not told yet is the Agent's still: kept as its version, under review.
      keepTaken(slug, current);
      noted(slug, reviews.look(slug, current));
      const { text: base, changes } = shown(current); // the file as the page sees it
      // The ids it gives, in order: given again where the same commit is applied to a review's baseline.
      const given = [];
      const giving = () => {
        const id = typeof ids === "function" ? ids() : randomBlockId();
        given.push(id);
        return id;
      };
      const result = commitEdits({ current: base, opening: openingSource, texts, units, touch, ids: ids ? giving : false, seal, pageIds });
      // `finish`: what the server adds to what a commit wrote (the kit tags its blocks now need).
      const { title, icon, ...rest } = result;
      const text = result.text === base ? base : finish(result.text);
      if (text !== result.text) Object.assign(rest, { version: hashOf(text), frame: frameOf(text) }); // the page takes the file as written, the tags too (and what it is besides its units: the pull's)
      // Someone else wrote the file since the page last knew it (`known`: the version its last
      // commit left, or the one it opened on): the page shows their changes once it has nothing
      // left to commit.
      const receipt = { ...rest, foreign: typeof known === "string" && hashOf(base) !== known };
      // `wrote`: whether this commit changed the file (one that changed nothing, all of it already
      // there or refused, wrote no version of its own: the page does not take the file's for one).
      // A natural file it changes nothing in stays as the Agent wrote it.
      if (text === base) return answer({ ok: true, ...receipt, wrote: false, notes: [] });
      keepVersion(slug, current, { kind: "write" }); // as it was: the last one kept, or a write of someone else's no take kept yet
      if (!(await write(file, text, { expect: current }, agent === true ? "agent" : "reader"))) {
        if (attempt === maxMerges) return [409, { ok: false, reason: "busy", message: BUSY }];
        continue;
      }
      // As the commit left it: an Agent writing over it right away loses nothing for good.
      keepVersion(slug, text, { by: agent === true ? "agent" : "reader", kind: "commit" });
      // A review of the Agent's changes: the same commit applied to its baseline, after the answer (their queue),
      // what the file refused left out (`result`: a conflict held on a card stays the reader's to decide).
      noted(slug, reviews.wrote(slug, text, (baseline) => {
        let next = 0;
        return rebaseOnto(baseline, { opening: openingSource, texts, units, touch, pageIds, seal, ids: ids ? () => given[next++] ?? (typeof ids === "function" ? ids() : randomBlockId()) : false }, result);
      }));
      if (changes.length) {
        // The Agent's natural HTML, now the kit's markup.
        if (log) log(changeLines(file, changes).join("\n"));
        keptRewrite(slug, changes);
      }
      const notes = [...(title ? await retitle(path.dirname(file), title) : []), ...(icon !== undefined ? await reicon(path.dirname(file), icon) : [])];
      return answer({ ok: true, ...receipt, wrote: true, notes });
    }
  }

  // To-dos of report `slug` checked from another page (workspace.setTodo: POST
  // /__gallery/workspace/todo, src/workbench/service.mjs; docs/editor.md "To-dos checked from another
  // page"): `items` ([{ ref, done }], what the page merged of the checks waiting for this document) found in
  // the file as its pages see it (./todos.mjs locateTodos), and those that change it written as one commit
  // through handleCommit, the reader's, as a page's own check is (an attribute op each, the item given an id
  // in passing): kept among the recent versions, merged into an open page as any write it did not make,
  // counted in the record of edits as the reader's. In the queue, once the file is not held (settledRun);
  // an item found where the file holds it is found the same by the commit, which reads it in the same turn.
  // Answers { ok: true, results: [{ ok: true, changed, block } | { ok: false, reason }] } (each item's,
  // in order: `changed` whether it changed what stood before it, `block` the item's id now), or a refusal
  // of them all: 404 missing, 409 busy.
  async function setTodos(slug, items) {
    if (typeof slug !== "string" || !slugPattern.test(slug)) return [404, { ok: false, reason: "missing", message: "找不到这份文档" }];
    if (!Array.isArray(items) || items.length === 0 || items.length > TODO_MOST) return [400, { ok: false, reason: "body" }];
    return settledRun({ slug }, async (body, until) => {
      const { source, held } = await settled(slug);
      if (source === null) return [404, { ok: false, reason: "missing", message: "找不到这份文档" }];
      if (held) return Date.now() < until ? AGAIN : [409, { ok: false, reason: "busy", message: BUSY }];
      const { text } = shown(source);
      const spots = locateTodos(slug, source, text, items);
      const { commit, changed } = todoCommit(text, spots);
      const results = spots.map((spot, index) => (spot.reason ? { ok: false, reason: spot.reason } : { ok: true, changed: changed[index], block: spot.unit.blockId ?? null }));
      if (!commit) return [200, { ok: true, results, wrote: false }];
      const version = hashOf(text);
      remember(version, text); // the opening version an item without an id is named in
      const answered = await handleCommit({ slug, opening: version, units: commit.units, touch: commit.touch }, until);
      if (answered === AGAIN) return AGAIN;
      const [status, answer] = answered;
      if (!answer.ok) return [status, answer];
      const statuses = new Map((answer.units ?? []).map((unit) => [unit.key, unit]));
      return [200, {
        ok: true,
        wrote: answer.wrote === true,
        results: results.map((result, index) => {
          if (!result.ok) return result;
          const key = commit.keys.get(spots[index].unit.id);
          if (key === undefined) return result; // it changed nothing in the file (asked back within this write)
          const done = statuses.get(key);
          if (done?.status !== "applied") return { ok: false, reason: done?.reason === "ambiguous" ? "ambiguous" : "changed" };
          return { ...result, block: answer.ids?.[key] ?? result.block };
        }),
      }];
    });
  }

  // A commit sent again (its `request`, the id the page gave it) whose answer is kept: that answer
  // (`again`), or a refusal when it carries other contents; null when none is kept. Asked before the
  // commit waits for a held file too: the answer is the file's no more.
  async function keptAnswer({ slug, opening, texts = [], units = [], touch = [], request: id = null }) {
    if (typeof slug !== "string" || !slugPattern.test(slug) || typeof id !== "string" || !REQUEST_ID.test(id) || ![texts, units, touch].every(Array.isArray)) return null;
    const kept = await findReceipt(slug, id);
    if (!kept) return null;
    return kept.digest === hashOf(JSON.stringify([opening ?? null, texts, units, touch])) ? [200, { ...kept.answer, again: true }] : [409, { ok: false, reason: "request", message: "同一次保存的内容不一致" }];
  }

  // Before the page shows someone else's write: which of the texts it committed that write put
  // back as they were (revertedTexts), which blocks it made or moved (revertedUnits: one it replaced is
  // its own change, where it put back nothing else) and which parts its components wrote (revertedParts),
  // answered together (revertCheck), for the reader to decide. Never asked of a file half written
  // (a block of the change not written yet is no block taken out): the question waits for it as a
  // commit does, and is answered busy after that.
  async function handleReverted(body, until) {
    const { slug, opening, texts = [], units = [], instances = [], pageIds = null, taken = [] } = body;
    if (typeof slug !== "string" || !slugPattern.test(slug) || !Array.isArray(texts) || !Array.isArray(units) || !Array.isArray(instances)) return [400, { ok: false, reason: "body" }];
    const { source, held } = await settled(slug);
    if (held) return Date.now() < until ? AGAIN : [409, { ok: false, reason: "busy", message: BUSY }];
    const report = await read(slug, source); // as the page sees it
    if (report === null) return [404, { ok: false, reason: "missing" }];
    const { text: current, version } = report;
    const openingSource = typeof opening === "string" && versionPattern.test(opening) ? await recall(opening) : null;
    return [200, { ok: true, version, ...revertCheck({ current, opening: openingSource, texts, units, instances, pageIds, taken: Array.isArray(taken) ? taken : [] }) }];
  }

  // The Agent's changes under review (POST /__gallery/edit/changes, docs/editor.md "Agent's changes"),
  // what the page asks besides `read` (changesRequest), in the queue commits run in, never of a file
  // half written: `accept` (确认) ends the review its `stamp` names, refused when a write of the
  // Agent's grew it since; `revert` (撤回) writes its baseline as the file (the Agent's changes gone,
  // the reader's own commits kept, as they were applied to it), report.json's title and icon following
  // the page's, and keeps what it wrote over for UNDO_FOR (`undo`: an id); `undo` (撤销) writes that
  // back and the review with it, while the file is still what the revert wrote. Each tells the report's
  // pages (onChanges). `agent`: gallery revert's (src/cli/revert.mjs), the version it leaves the Agent's,
  // and the revert answers the blocks it took back too (`blocks`: changedBlocks of the baseline and the
  // file, the Agent's changes) and the version it kept of what it wrote over (`kept`).
  const UNDO_FOR = 10 * 60 * 1000;
  const undos = new Map(); // id -> { slug, before, after, saved, at, kind ("revert" | "restore") }
  const pruneUndos = () => { for (const [id, entry] of undos) if (Date.now() - entry.at > UNDO_FOR) undos.delete(id); };
  // 撤销 of a revert or a restore (`id`, what it answered), while the file is `current`, still what that
  // wrote: what it wrote over written back, and the review of the Agent's changes as it was then.
  async function undoWrite(slug, id, current, by) {
    pruneUndos();
    const entry = typeof id === "string" ? undos.get(id) : null;
    if (!entry || entry.slug !== slug) return [404, { ok: false, reason: "gone", message: "撤销已经过期" }];
    if (current !== entry.after) return [409, { ok: false, reason: "moved-on", message: entry.kind === "restore" ? "恢复之后文档又改过了，没法撤销" : "撤回之后文档又改过了，没法撤销" }];
    keepVersion(slug, current, { kind: "write" });
    if (!(await write(sourceOf(slug), entry.before, { expect: current }, by))) return [409, { ok: false, reason: "busy", message: BUSY }];
    keepVersion(slug, entry.before, { by, kind: "undo" });
    undos.delete(id);
    await inStepWith(slug, entry.before);
    await reviews.restore(slug, entry.saved);
    await reviews.wrote(slug, entry.before);
    onChanges(slug);
    return [200, { ok: true, version: hashOf(shown(entry.before).text) }];
  }
  // report.json's title and icon as the page's `text` has them (the hand-in's way: inStep).
  async function inStepWith(slug, text) {
    const directory = folderOf(slug);
    let metadata = null;
    try { metadata = JSON.parse(await fs.readFile(documentFiles(directory).json, "utf8")); } catch {}
    const { title, icon } = inStep(text, metadata);
    if (title && typeof metadata?.title === "string" && metadata.title !== title.to) await retitle(directory, { from: metadata.title, to: title.to, synced: true });
    if (icon && !icon.missing) await reicon(directory, icon.to);
  }
  async function handleChanges(body, until) {
    const { slug, action, stamp = null, undo = null, agent = false } = body;
    if (typeof slug !== "string" || !slugPattern.test(slug) || !["accept", "revert", "undo"].includes(action)) return [400, { ok: false, reason: "body" }];
    const by = agent === true ? "agent" : "reader";
    const file = sourceOf(slug);
    const { source: current, held } = await settled(slug);
    if (current === null) return [404, { ok: false, reason: "missing" }];
    if (held) return Date.now() < until ? AGAIN : [409, { ok: false, reason: "busy", message: BUSY }];
    if (action === "undo") return undoWrite(slug, undo, current, by);
    keepTaken(slug, current);
    await reviews.look(slug, current); // a write the announcement has not told yet grows the review first
    const kept = await reviews.snapshot(slug);
    const now = kept?.state?.base ? `${kept.state.since}|${kept.state.writes}` : null;
    if (now === null) return [200, { ok: true, none: true }]; // nothing under review (kept or reverted elsewhere)
    if (now !== stamp) return [409, { ok: false, reason: "changed", message: "Agent 刚刚又改了文档，再看一眼" }];
    if (action === "accept") {
      await reviews.clear(slug);
      onChanges(slug);
      return [200, { ok: true }];
    }
    const base = kept.base;
    const before = keepVersion(slug, current, { kind: "write" });
    if (!(await write(file, base, { expect: current }, by))) return [409, { ok: false, reason: "busy", message: BUSY }];
    keepVersion(slug, base, { by, kind: "revert" });
    await inStepWith(slug, base);
    const id = randomBytes(8).toString("hex");
    undos.set(id, { slug, before: current, after: base, saved: kept, at: Date.now(), kind: "revert" });
    await reviews.clear(slug);
    await reviews.wrote(slug, base);
    onChanges(slug);
    const taken = agent === true ? blocksOf(base, current, TAKEN_MOST) : null;
    return [200, { ok: true, version: hashOf(shown(base).text), undo: id, ...(agent === true ? { kept: await before, ...taken } : {}) }];
  }
  // What `now` changed of `then` (two texts of a report's file), as pages see them, a block each
  // (changedBlocks): { counts, blocks } (blocks MOST at most, `more` saying how many more), or no
  // change of a block ({ counts: 0 each, blocks: [] }: ids, white space, the kit's writing).
  const SUMMARY_MOST = 8; // the blocks a version of the list names (the workbench and gallery history say how many more)
  const TAKEN_MOST = 40; // and a revert or a restore of the Agent's says
  const summaries = new Map(); // "<hash> <hash>" -> what blocksOf said, the last few
  function blocksOf(then, now, most = Infinity) {
    const key = `${hashOf(then)} ${hashOf(now)} ${most}`;
    if (summaries.has(key)) return summaries.get(key);
    let found = null;
    try {
      found = changedBlocks(shownSource(then, { finish }).text, shownSource(now, { finish }).text);
    } catch (error) {
      log?.(`history: a version not compared (${error.message})`);
    }
    // Each block with what the editor calls its kind (文本, 标题, 列表项…: the workbench says it in the UI's language).
    const named = (block) => ({ ...block, name: block.title ? "标题" : KIND_NAMES[block.kind] ?? HOST_NAMES[block.kind] ?? "块" });
    const said = found
      ? { counts: found.counts, blocks: found.blocks.slice(0, most).map(named), ...(found.blocks.length > most ? { more: found.blocks.length - most } : {}) }
      : { counts: { added: 0, changed: 0, removed: 0 }, blocks: [] };
    summaries.set(key, said);
    while (summaries.size > 200) summaries.delete(summaries.keys().next().value);
    return said;
  }

  // ---------- recent versions (历史版本, gallery history: docs/editor.md "Recent versions") ----------
  // The versions kept of report `slug` (history.mjs), oldest first, each with its text; the file as it
  // is now taken first (a write of someone else's no take kept yet is a version of its own).
  async function versionsOf(slug) {
    const { source } = await settled(slug);
    if (source !== null) keepTaken(slug, source);
    await disk;
    return { source, versions: stateDirectory ? await listVersionsIn(historyDirectory(stateDirectory, slug), { text: true }) : [] };
  }
  // `versions`: { ok, current (the file's version now), versions: [{ id, time, version, by, kind, from?,
  // current (the newest, when the file holds it now: an older one of the same text is not), counts,
  // blocks, more? (what it changed of the one before it, its blocks each with `name`, what the
  // editor calls its kind; null for the first), view (the address of its page: viewAddress) }], later }, the
  // newest first. What each changed is worked out once (blocksOf) and kept beside the versions
  // (history.mjs summaries.json), the newest first, for LIST_BUDGET at most unless `all` (gallery history):
  // the rest have no counts (`later`: how many), which the list asked again works out next (历史版本 asks
  // until none is left), so a document of many versions, or a long one, opens its list at once. `show`: one of
  // them as its words read ({ ok, id, time, by, kind, rows, more }: textRows). Outside the queue: nothing is
  // written but the take of the file and the summaries.
  async function listHistory(slug, { all = false } = {}) {
    const { source } = await settled(slug);
    if (source === null) return [404, { ok: false, reason: "missing", message: "找不到这份文档" }];
    keepTaken(slug, source);
    await disk;
    const directory = stateDirectory ? historyDirectory(stateDirectory, slug) : null;
    const versions = directory ? await listVersionsIn(directory) : [];
    const current = hashOf(source);
    const kept = directory ? await readSummariesIn(directory) : new Map();
    const texts = new Map(); // id -> its text (null: none reads), read as needed
    const textOf = async ({ id }) => {
      if (!texts.has(id)) texts.set(id, await readVersionIn(directory, id));
      return texts.get(id);
    };
    const said = [];
    const pairs = new Set();
    const started = Date.now();
    let worked = false;
    let later = 0;
    for (let at = versions.length - 1; at >= 1; at--) {
      const pair = `${versions[at - 1].version} ${versions[at].version}`;
      pairs.add(pair);
      if (kept.has(pair)) said[at] = kept.get(pair);
      else if (!all && worked && Date.now() - started >= listBudget) later += 1; // one at least each time: the list asked again gets on
      else {
        const [then, now] = [await textOf(versions[at - 1]), await textOf(versions[at])];
        if (then === null || now === null) continue; // a file that does not read: no counts, nothing kept
        said[at] = blocksOf(then, now, SUMMARY_MOST);
        kept.set(pair, said[at]);
        worked = true;
      }
    }
    if (worked || [...kept.keys()].some((pair) => !pairs.has(pair))) disk = disk.then(() => keepSummariesIn(directory, kept, pairs)).catch(() => {});
    const listed = versions.map((version, at) => ({
      ...version,
      current: at === versions.length - 1 && version.version === current,
      ...(at === 0 ? { counts: null, blocks: [] } : said[at] ?? { blocks: [] }),
      view: viewAddress(slug, version.id),
    }));
    return [200, { ok: true, current, versions: listed.reverse(), later }];
  }
  // A version's page (历史版本's view of it: the preview server's /generated/<slug>.html?present&version=<id>&key=<key>,
  // ../server/routes.mjs): its address carries a key of the token's (an HMAC of the document and the
  // version), for a frame's request carries no token. The list's answer, asked with the token, the Host and
  // the Origin, is where an address comes from; a page of another site guesses none. A key opens that one
  // version alone, and its page writes nothing.
  const viewKey = (slug, id) => createHmac("sha256", token).update(`view\n${slug}\n${id}`).digest("hex").slice(0, 32);
  const viewAddress = (slug, id) => `${base}/generated/${slug}.html?present&version=${encodeURIComponent(id)}&key=${viewKey(slug, id)}`;
  /**
   * The version `id` of report `slug` whose page `key` opens (viewKey): { source (the version's text), text
   * (as its pages see it: read's text, made the same way), marked (that text with what it changed of the version
   * kept before it marked in it, source/changes.mjs markedVersion, for the page to draw: { text, counts }; null for
   * the first, or no block changed) }, or null: a key that is not its, an id that names no version, none kept.
   * Nothing is read but that version's file and the one before it.
   */
  async function versionShown(slug, id, key) {
    if (!stateDirectory || typeof slug !== "string" || !slugPattern.test(slug) || typeof id !== "string" || typeof key !== "string") return null;
    const wanted = Buffer.from(viewKey(slug, id));
    const given = Buffer.from(key);
    if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null;
    const directory = historyDirectory(stateDirectory, slug);
    const source = await readVersionIn(directory, id);
    if (source === null) return null;
    const view = (text) => {
      try { return shownSource(text, { finish }).text; } catch { return text; } // shown as written, as a version's words are
    };
    const text = view(source);
    let marked = null;
    const listed = await listVersionsIn(directory);
    const at = listed.findIndex((version) => version.id === id);
    const before = at > 0 ? await readVersionIn(directory, listed[at - 1].id) : null;
    if (before !== null) {
      try {
        marked = markedVersion(view(before), text);
      } catch (error) {
        log?.(`history: a version not marked (${error.message})`);
      }
    }
    return { source, text, marked };
  }
  async function showVersion(slug, ref) {
    const { source, versions } = await versionsOf(slug);
    if (source === null) return [404, { ok: false, reason: "missing", message: "找不到这份文档" }];
    const named = versionNamed(versions, ref);
    if (named.refused) return [404, { ok: false, reason: named.refused === "ambiguous" ? "ambiguous" : "version", message: "找不到这个版本", ...(named.candidates ? { candidates: named.candidates } : {}) }];
    const { text, ...version } = named.version;
    let rows = { rows: [], more: 0 };
    try { rows = textRows(shownSource(text, { finish }).text); } catch {}
    return [200, { ok: true, ...version, current: version.version === hashOf(source), ...rows }];
  }
  // `changes` (gallery history --changes: what 历史版本 marks on a version's page): what the version `version`
  // names changed of the one kept before it, every block with its words (source/changes.mjs blockChanges):
  // { ok, id, time, version, by, kind, from?, current, previous (the id of the one before it, null for the
  // first), counts (null for the first), blocks }. Outside the queue: nothing is written but the take of the file.
  async function versionChanges(slug, ref) {
    const { source } = await settled(slug);
    if (source === null) return [404, { ok: false, reason: "missing", message: "找不到这份文档" }];
    keepTaken(slug, source);
    await disk;
    const directory = stateDirectory ? historyDirectory(stateDirectory, slug) : null;
    const versions = directory ? await listVersionsIn(directory) : [];
    const named = versionNamed(versions, ref);
    if (named.refused) return [404, { ok: false, reason: named.refused === "ambiguous" ? "ambiguous" : "version", message: "找不到这个版本", ...(named.candidates ? { candidates: named.candidates } : {}) }];
    const at = versions.indexOf(named.version);
    const said = { ok: true, ...named.version, current: at === versions.length - 1 && named.version.version === hashOf(source), previous: at > 0 ? versions[at - 1].id : null };
    if (at === 0) return [200, { ...said, counts: null, blocks: [] }];
    const [then, now] = await Promise.all([readVersionIn(directory, versions[at - 1].id), readVersionIn(directory, named.version.id)]);
    if (then === null || now === null) return [404, { ok: false, reason: "version", message: "找不到这个版本" }];
    const view = (text) => {
      try { return shownSource(text, { finish }).text; } catch { return text; }
    };
    let found = null;
    try {
      found = blockChanges(view(then), view(now));
    } catch (error) {
      log?.(`history: a version not compared (${error.message})`);
    }
    return [200, { ...said, ...(found ?? { counts: { added: 0, changed: 0, removed: 0 }, blocks: [] }) }];
  }
  // `restore` (in the queue, never of a file half written): the version `version` names written as the
  // file (the file as it was kept among the versions first, `expect`ing it), doc.json's title and icon
  // following the page's, as a revert's; answered { ok, version (as pages see it), undo (an id, for
  // UNDO_FOR), kept (the version that holds what it wrote over), restored (the version restored),
  // made (the version it made) }, or { ok, same: true } when the file says it already. The reader's (the
  // workbench's 历史版本) ends the review of the Agent's changes, the reader having said what the
  // document is; the Agent's (`agent`: gallery history --restore) is a write of the Agent's, under review
  // as one is. `undo`: 撤销 of a restore (undoWrite). Each tells the report's pages (onChanges); the
  // write is the service's own, which its pages show at once (a page that asked for it: autosave showOwn).
  async function handleHistory(body, until) {
    const { slug, action, version: ref, undo = null, agent = false } = body;
    const by = agent === true ? "agent" : "reader";
    const file = sourceOf(slug);
    const { source: current, held } = await settled(slug);
    if (current === null) return [404, { ok: false, reason: "missing", message: "找不到这份文档" }];
    if (held) return Date.now() < until ? AGAIN : [409, { ok: false, reason: "busy", message: BUSY }];
    if (action === "undo") return undoWrite(slug, undo, current, by);
    keepTaken(slug, current);
    await disk;
    const versions = stateDirectory ? await listVersionsIn(historyDirectory(stateDirectory, slug), { text: true }) : [];
    const named = versionNamed(versions, ref);
    if (named.refused) return [404, { ok: false, reason: named.refused === "ambiguous" ? "ambiguous" : "version", message: "找不到这个版本", ...(named.candidates ? { candidates: named.candidates } : {}) }];
    const { text, id: restored, time: restoredAt } = named.version;
    if (text === current) return [200, { ok: true, same: true, restored, restoredAt }];
    await reviews.look(slug, current); // a write the announcement has not told yet is the Agent's still
    const saved = await reviews.snapshot(slug);
    const kept = keepVersion(slug, current, { kind: "write" });
    if (!(await write(file, text, { expect: current }, by))) return [409, { ok: false, reason: "busy", message: BUSY }];
    const made = keepVersion(slug, text, { by, kind: "restore", from: restored });
    await inStepWith(slug, text);
    const id = randomBytes(8).toString("hex");
    undos.set(id, { slug, before: current, after: text, saved, at: Date.now(), kind: "restore" });
    if (by === "reader") {
      await reviews.clear(slug);
      await reviews.wrote(slug, text);
    } else await reviews.look(slug, text);
    onChanges(slug);
    // The Agent's: what of the file it took back, block by block, as gallery revert's (the blocks the file had that the version has not: added).
    return [200, { ok: true, version: hashOf(shown(text).text), undo: id, kept: await kept, restored, restoredAt, made: await made, ...(by === "agent" ? blocksOf(text, current, TAKEN_MOST) : {}) }];
  }
  /**
   * What the history asks (POST /__gallery/edit/history, and gallery history without a server): { slug,
   * action: "versions" | "show" | "changes" | "restore" | "undo", version?, undo?, agent?, all? (versions: what every one changed, no LIST_BUDGET) }. [status, answer].
   */
  async function historyAction(body) {
    const { slug, action } = body ?? {};
    if (typeof slug !== "string" || !slugPattern.test(slug) || !["versions", "show", "changes", "restore", "undo"].includes(action)) return [400, { ok: false, reason: "body" }];
    if (action === "versions") return listHistory(slug, { all: body.all === true });
    if (action === "show") return showVersion(slug, body.version);
    if (action === "changes") return versionChanges(slug, body.version);
    return settledRun(body, handleHistory);
  }
  // POST /__gallery/edit/history: the workbench's 历史版本 and gallery history while this server runs
  // (`workspace`, a command's: this server's own, else refused as elsewhere).
  async function historyRequest(request, response) {
    const checked = await check(request);
    if (checked.error) return sendJson(response, ...checked.error);
    const body = checked.body ?? {};
    if (body.workspace !== undefined && (typeof body.workspace !== "string" || !sameDirectory(body.workspace, reportsDirectory))) return sendJson(response, 409, { ok: false, reason: "elsewhere", message: "这个预览服务器管的是另一个目录的文档" });
    try {
      return sendJson(response, ...(await historyAction(body)));
    } catch (error) {
      return sendJson(response, 500, { ok: false, reason: "write", message: error.message });
    }
  }
  /** What the review of the Agent's changes is asked (POST /__gallery/edit/changes's body, and gallery revert without a server): [status, answer]. */
  async function changesAction(body) {
    if (body?.action !== "read") return settledRun(body ?? {}, handleChanges);
    if (typeof body.slug !== "string" || !slugPattern.test(body.slug)) return [400, { ok: false, reason: "body" }];
    const report = await readTaken(body.slug, { wait: 0 });
    if (report === null) return [404, { ok: false, reason: "missing" }];
    keepTaken(body.slug, report.source);
    return [200, { ok: true, ...(await reviews.read(body.slug, report.source)) }];
  }
  // POST /__gallery/edit/changes: `read` (what the page marks: changes.mjs read, of the file as the
  // preview takes it, with no wait for one half written) outside the queue, the rest in it (handleChanges).
  async function changesRequest(request, response) {
    const checked = await check(request);
    if (checked.error) return sendJson(response, ...checked.error);
    const body = checked.body ?? {};
    // A command's (gallery revert, `workspace`): this server's own workspace, else refused as elsewhere.
    if (body.workspace !== undefined && (typeof body.workspace !== "string" || !sameDirectory(body.workspace, reportsDirectory))) return sendJson(response, 409, { ok: false, reason: "elsewhere", message: "这个预览服务器管的是另一个目录的文档" });
    try {
      return sendJson(response, ...(await changesAction(body)));
    } catch (error) {
      return sendJson(response, 500, { ok: false, reason: "write", message: error.message });
    }
  }

  // The report title changed: report.json carries it too (the index page and exports read it, the
  // workbench's tree names the report by it). report.html is already saved at this point, so a
  // failure here is reported, not thrown. The notes are the reader's (the page shows them joined,
  // each in the UI's language, editor.mjs committed): the title updated, then what did not follow it,
  // in the reader's words, named where the reader sees them: <title> is the page's name when it is
  // opened on its own or exported (in the workbench the tab and the sidebar show the page's own title
  // while it is open), report.json's title the name search and the sidebar show while it is not
  // open; what failed and why goes to the dev server's log.
  async function retitle(directory, { from, to, synced }) {
    const notes = ["标题已更新", ...(synced ? [] : ["单独打开或导出时的页面名称原本就和标题不同，没有跟着改"])];
    const file = documentFiles(directory).json;
    const text = await fs.readFile(file, "utf8").catch(() => "");
    let metadata = null;
    try { metadata = JSON.parse(text); } catch {}
    if (metadata?.title !== from) return [...notes, "搜索和侧栏里（没打开这份文档时）的文档名原本就和标题不同，没有跟着改"];
    const field = new RegExp(`("title"\\s*:\\s*)${JSON.stringify(from).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
    const next = field.test(text)
      ? text.replace(field, (_, key) => key + JSON.stringify(to))
      : `${JSON.stringify({ ...metadata, title: to }, null, 2)}\n`;
    try {
      await write(file, next);
    } catch (error) {
      log?.(`${path.basename(file)}'s title was not written (${error.code ?? error.message}): ${file}`);
      return [...notes, "搜索和侧栏里（没打开这份文档时）的文档名没能跟着改"];
    }
    return notes;
  }

  // The page's icon changed (made, changed or taken away): report.json carries it too (`icon`), for
  // the workbench's tree and search. report.html is already saved, so a failure is reported, not thrown:
  // to the reader as the icon there not following, why to the dev server's log.
  async function reicon(directory, icon) {
    const file = documentFiles(directory).json;
    let metadata = null;
    try { metadata = JSON.parse(await fs.readFile(file, "utf8")); } catch {}
    if (!metadata || typeof metadata !== "object") {
      log?.(`${path.basename(file)} could not be read, so its icon was not written: ${file}`);
      return ["页面图标已更换，但搜索和侧栏里（没打开这份文档时）的图标没能跟着换"];
    }
    if ((metadata.icon ?? null) === icon) return [];
    const { icon: _, ...rest } = metadata;
    const next = icon === null ? rest : { ...rest, icon };
    try {
      await write(file, `${JSON.stringify(next, null, 2)}\n`);
    } catch (error) {
      log?.(`${path.basename(file)}'s icon was not written (${error.code ?? error.message}): ${file}`);
      return ["页面图标已更换，但搜索和侧栏里（没打开这份文档时）的图标没能跟着换"];
    }
    return [];
  }

  // Rename a report as the page's title edit does (a save of its title block): the h1, <title> where
  // it holds the old title, and report.json. For a caller already in the queue (the workspace).
  async function renameReport(slug, title) {
    const name = typeof title === "string" ? title.replace(/\s+/g, " ").trim() : "";
    if (!name) return { ok: false, reason: "title", message: "标题不能为空" };
    const file = sourceOf(slug);
    const written = await fs.readFile(file, "utf8").catch(() => null);
    if (written === null) return { ok: false, reason: "missing" };
    keepTaken(slug, written);
    noted(slug, reviews.look(slug, written));
    const source = newNames(written); // a file in the format's old names written in the new ones (shared/old-names.mjs)
    const block = findBlocks(source).find((candidate) => candidate.kind === "title");
    if (!block) return { ok: false, reason: "no-title", message: "这份文档没有标题" };
    const html = escapeTyped(name);
    const result = applyEdits({ current: source, edits: [{ id: block.id, parts: [{ keep: true, html }] }], ids });
    if (!result.ok) return { ok: false, reason: "conflict" };
    if (result.text !== written && !(await write(file, result.text, { expect: written }))) return { ok: false, reason: "changed-again" };
    if (result.text !== written) {
      keepVersion(slug, result.text, { by: "reader", kind: "rename" });
      noted(slug, reviews.wrote(slug, result.text, (baseline) => retitledBase(baseline, html))); // the reader's renaming is no change of the Agent's
    }
    return { ok: true, title: name, notes: result.title ? await retitle(path.dirname(file), result.title) : [] };
  }

  // Set a report's page icon from outside its page (the workbench's sidebar, for a document not open there:
  // POST icon), `icon` an icon value (the caller holds it to one) or null for none: the header's div.doc-icon
  // made, changed or taken away as gallery set --icon writes it (natural.mjs headerChanged: the rest of the
  // file as it is), kept among the versions as the reader's, and doc.json's icon (reicon). For a caller
  // already in the queue (the workspace).
  async function reiconReport(slug, icon) {
    const file = sourceOf(slug);
    const written = await fs.readFile(file, "utf8").catch(() => null);
    if (written === null) return { ok: false, reason: "missing" };
    keepTaken(slug, written);
    noted(slug, reviews.look(slug, written));
    const source = newNames(written); // a file in the format's old names written in the new ones (shared/old-names.mjs)
    const changed = headerChanged(source, { icon });
    if (changed.missing) return { ok: false, reason: "no-title", message: "这份文档没有标题" };
    if (changed.text !== written && !(await write(file, changed.text, { expect: written }))) return { ok: false, reason: "changed-again" };
    if (changed.text !== written) {
      keepVersion(slug, changed.text, { by: "reader", kind: "page-icon" });
      // the reader's icon is no change of the Agent's: the review's baseline takes it too
      noted(slug, reviews.wrote(slug, changed.text, (baseline) => {
        const based = headerChanged(baseline, { icon });
        return based.missing ? baseline : based.text;
      }));
    }
    return { ok: true, icon, notes: await reicon(path.dirname(file), icon) };
  }

  // Requests run one at a time so two tabs cannot interleave reading and writing the file.
  const respond = (handler) => (request, response) => {
    const run = queue.then(() => handler(request));
    queue = run.catch(() => {});
    return run.then(
      ([status, body]) => sendJson(response, status, body),
      (error) => sendJson(response, 500, { ok: false, reason: "write", message: error.message }),
    );
  };

  // A page's request on its report's file (a commit, the revert check): checked,
  // then held back while the file is half written (whenTaken), outside the queue, so that what else
  // runs in it (another page's commit, an upload, an export's hand-in) goes on meanwhile; then handled
  // in the queue (`handler(body, until)`), where a file written half again while the request waited
  // its turn sends it back out to wait (AGAIN), within WAIT in all. What `early(body)` answers (a
  // commit sent again whose answer is kept: no matter of the file) is answered at once.
  const respondSettled = (handler, { early = null } = {}) => async (request, response) => {
    const checked = await check(request);
    if (checked.error) return sendJson(response, ...checked.error);
    const body = checked.body ?? {};
    try {
      const now = early && (await early(body));
      if (now) return sendJson(response, ...now);
      return sendJson(response, ...(await settledRun(body, handler)));
    } catch (error) {
      return sendJson(response, 500, { ok: false, reason: "write", message: error.message });
    }
  };
  // `handler(body, until)` run in the queue once the report's file is not held, as long as it says AGAIN.
  async function settledRun(body, handler) {
    const until = Date.now() + waitFor;
    for (;;) {
      await whenTaken(body.slug, until);
      const run = queue.then(() => handler(body, until));
      queue = run.catch(() => {});
      const result = await run;
      if (result !== AGAIN) return result;
    }
  }

  // The hand-in: when the Agent exports a report (gallery export, the workbench's 导出), its file is
  // written as its pages see it with an id for every block that has none (handedInSource; a report
  // whose ids repeat stays as it is: the export's check names them), its
  // <title> in step with its title (the h1) as the reader's renaming keeps it; and report.json's
  // title and icon then are the page's (retitle, reicon: what the page's own edits write). An open
  // page goes on as before: the ids change no unit's hash and the text is the one it shows (the new
  // version is someone else's write to it, which it shows once nothing waits). The file is read again
  // right before it is replaced, as for a commit. For a caller already in the queue (the workspace's
  // export); handIn runs in it. Returns { ok: true, changes, added, given, repeated, written, title,
  // icon } (`given`: each block given an id, { id, tag, line }, at its line in the file written;
  // `title`: { from, to, page } when report.json's title or <title> became the h1's, `page` whether
  // <title> did; `icon`: { from, to } when report.json's icon became the page's, { from, to: from,
  // missing: true } when the page shows none and report.json's stays) or { ok: false, reason, message }.
  // `reader`: a hand-in the reader asked for (the workbench's 导出, the export dialog), not the Agent:
  // never of a file half written (busy, nothing written: the Agent is between two edits of a change),
  // and what it wrote of the Agent's natural HTML as the kit's markup is kept for the Agent and said in
  // the log, as a commit's is (gallery export says what the Agent's own wrote).
  async function handInReport(slug, { reader = false } = {}) {
    if (typeof slug !== "string" || !slugPattern.test(slug)) return { ok: false, reason: "missing", message: "找不到这份文档" };
    const directory = folderOf(slug);
    const { html: file, json } = documentFiles(directory);
    for (let attempt = 1; ; attempt++) {
      const { source, held } = reader ? await settled(slug) : { source: await fs.readFile(file, "utf8").catch(() => null), held: false };
      if (source === null) return { ok: false, reason: "missing", message: "找不到这份文档" };
      if (held) return { ok: false, reason: "busy", message: "文件一再被修改（例如 Agent 正在写入），没有写入" };
      keepTaken(slug, source);
      noted(slug, reviews.look(slug, source));
      let metadata = null;
      try { metadata = JSON.parse(await fs.readFile(json, "utf8")); } catch {}
      const { text, changes, added, given, repeated, title, icon } = handedInSource(source, { finish, next: typeof ids === "function" ? ids : undefined, metadata });
      if (text !== source) {
        keepVersion(slug, source, { kind: "write" }); // as it was: every start tag changes, and nothing is lost for good
        if (!(await write(file, text, { expect: source }, reader ? "reader" : "agent"))) {
          if (attempt === maxMerges) return { ok: false, reason: "busy", message: "文件一再被修改（例如 Agent 正在写入），没有写入" };
          continue;
        }
        keepVersion(slug, text, { by: reader ? "reader" : "agent", kind: "hand-in" });
        noted(slug, reviews.wrote(slug, text)); // ids and the kit's writing: nothing a review counts
        if (reader && changes.length) {
          if (log) log(changeLines(file, changes).join("\n"));
          keptRewrite(slug, changes);
        }
      }
      // report.json as the page has it: a title it holds that is not the h1's, an icon not the header's.
      if (title && typeof metadata?.title === "string" && metadata.title !== title.to) await retitle(directory, { from: metadata.title, to: title.to, synced: title.page });
      if (icon && !icon.missing) await reicon(directory, icon.to);
      return { ok: true, changes: text === source ? [] : changes, added: text === source ? 0 : added, given: text === source ? [] : given, repeated, written: text !== source, title, icon };
    }
  }
  // The reader's waits for a file half written outside the queue first, as a commit does.
  const handIn = async (slug, { reader = false } = {}) => {
    if (reader) await whenTaken(slug);
    const run = queue.then(() => handInReport(slug, { reader }));
    queue = run.catch(() => {});
    return run;
  };
  // A command's request of a report (`request`: { slug, workspace }, the workspace the command writes
  // in, which must be this server's): its slug, or the answer refusing it.
  async function commandSlug(request) {
    const checked = await check(request);
    if (checked.error) return { refused: checked.error };
    const { slug, workspace } = checked.body ?? {};
    if (typeof slug !== "string" || !slugPattern.test(slug) || typeof workspace !== "string") return { refused: [400, { ok: false, reason: "body" }] };
    if (!sameDirectory(workspace, reportsDirectory)) return { refused: [409, { ok: false, reason: "elsewhere", message: "这个预览服务器管的是另一个目录的文档" }] };
    return { slug };
  }
  // POST /__gallery/edit/hand-in: gallery export's hand-in while this server runs (src/cli/hand-in.mjs),
  // in the queue; answered once the 批注 are checked against what it wrote and what that deleted is
  // kept (settleNotes, outside the queue: a check never holds a commit back), so the export that asked
  // says them (found testing the skill with Agents, 2026-10-29: the check ran some 1.9 s after the
  // Agent's write, and an export run right after it heard of none).
  async function handInRequest(request, response) {
    try {
      const run = queue.then(async () => {
        const { slug, refused } = await commandSlug(request);
        if (refused) return { answer: refused };
        const result = await handInReport(slug);
        return { slug: result.ok ? slug : null, answer: [result.ok ? 200 : result.reason === "missing" ? 404 : 409, result] };
      });
      queue = run.catch(() => {});
      const { slug, answer } = await run;
      if (slug) await settleNotes(slug);
      return sendJson(response, ...answer);
    } catch (error) {
      return sendJson(response, 500, { ok: false, reason: "write", message: error.message });
    }
  }
  // POST /__gallery/edit/settle: gallery check and gallery qa, before they say the 批注 the preview
  // deleted and what it wrote (src/cli/hand-in.mjs previewSettled): the check of a report's 批注
  // against its file as it is now, run at once (settleNotes), and what is kept of it on disk.
  async function settleRequest(request) {
    const { slug, refused } = await commandSlug(request);
    if (refused) return refused;
    await settleNotes(slug);
    return [200, { ok: true }];
  }

  // What a report keeps in its folder: uploads, bookmarks' pictures, the workspace's emoji library (media-store.mjs).
  const media = createMediaStore({ reportsDirectory });
  // The reader's 批注 (annotations.mjs): checked against the report as its pages see it, never a file
  // half written (what the preview last took of it meanwhile, so it does not wait).
  // Those a check deletes, their words gone, are kept for the Agent's next gallery check or
  // gallery export to say (dropped-annotations.mjs), with a state directory, and said in the log.
  const droppedNotes = (slug, items) => {
    const kept = items.map(droppedOf);
    if (log) log(droppedLines(path.join(folderOf(slug), "annotations.json"), { items: kept }).join("\n"));
    if (stateDirectory) disk = disk.then(() => keepDropped({ stateDirectory, reportsDirectory, slug, time: new Date().toISOString(), items: kept })).catch(() => {}); // not writable: the log said it
  };
  const annotations = createAnnotations({ reportsDirectory, read: (slug) => readTaken(slug, { wait: 0 }), write, dropped: droppedNotes });
  // Their own queue, apart from the commits': annotations.json read, checked and written one at a
  // time, while a check of a long report (a parse of it) never holds a commit back.
  let notes = Promise.resolve();
  const inNotes = (job) => {
    const run = notes.then(job);
    notes = run.catch(() => {});
    return run;
  };
  const respondNotes = (handler) => (request, response) => inNotes(() => handler(request)).then(
    ([status, body]) => sendJson(response, status, body),
    (error) => sendJson(response, 500, { ok: false, reason: "write", message: error.message }),
  );
  // The check after the report was written runs once its writes pause (a burst of commits, one check).
  const CHECK_AFTER = 300;
  const checks = new Map(); // slug -> { timer, done, resolve, reject }
  /**
   * The check of report `slug`'s 批注 against its file as the preview takes it now, at once (the one
   * a write put off, CHECK_AFTER, taken instead: it settles with this one), in their queue; then what
   * it and the writes before kept for the commands (the deletions, what the preview wrote) on disk.
   * A check that fails is said in the log; nothing else changes.
   */
  async function settleNotes(slug) {
    const waiting = checks.get(slug);
    if (waiting) {
      clearTimeout(waiting.timer);
      checks.delete(slug);
    }
    const run = inNotes(() => annotations.afterWrite(slug));
    if (waiting) run.then(waiting.resolve, waiting.reject);
    await run.catch((error) => log?.(`${slug}: annotations not checked: ${error.message}`));
    await disk;
  }
  // A read of them checks the Host and the token, as a commit (a GET carries no Origin).
  const readCheck = (request) => {
    const host = request.headers.host ?? "";
    const port = request.socket.localPort;
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return [403, { ok: false, reason: "host" }];
    if (request.headers["x-gallery-token"] !== token) return [403, { ok: false, reason: "token" }];
    return null;
  };
  // GET /__gallery/edit/annotations?slug=[&as=copy] reads them (checked first), POST changes them.
  async function handleAnnotations(request) {
    if (request.method === "GET") {
      const refused = readCheck(request);
      if (refused) return refused;
      const query = new URL(request.url ?? "/", "http://localhost").searchParams;
      const as = query.get("as");
      return as === "copy" ? annotations.copy(query.get("slug")) : as === "notes" ? annotations.notes(query.get("slug")) : annotations.list(query.get("slug"));
    }
    const checked = await check(request);
    return checked.error ?? annotations.change(checked.body);
  }
  const checked = (handler, limit = maxBody) => async (request) => {
    const result = await check(request, limit);
    return result.error ?? handler(result.body);
  };

  return {
    token,
    preview,
    opened,
    check,
    /** The checks of check() before the body (a POST, the exact Host and Origin, the token): null, or the refusal [status, body]; for a request whose body is a file. */
    checkHeaders,
    /** POST /__gallery/edit/upload: a page icon's image, an image, a file or an embed's file, kept in the report's folder. */
    upload: respond(checked(media.upload, maxUpload)),
    /** POST /__gallery/edit/emoji-library: a custom emoji added to the workspace's library. */
    addEmoji: respond(checked(media.addEmoji)),
    /** POST /__gallery/edit/unfurl: a web page's bookmark, its icon and cover kept in the report's folder. */
    unfurl: respond(checked(media.unfurl)),
    /** GET and POST /__gallery/edit/annotations: the reader's 批注 of a report (annotations.mjs), in their queue. */
    annotations: respondNotes(handleAnnotations),
    /**
     * The 批注 of a report checked against it after its file was written (by anyone: the preview's
     * announcement), in their queue, CHECK_AFTER ms after the last write of a burst: settles when done.
     */
    checkAnnotations(slug) {
      let entry = checks.get(slug);
      if (!entry) {
        entry = { timer: 0 };
        entry.done = new Promise((resolve, reject) => Object.assign(entry, { resolve, reject }));
        checks.set(slug, entry);
      }
      clearTimeout(entry.timer);
      entry.timer = setTimeout(() => {
        checks.delete(slug);
        inNotes(() => annotations.afterWrite(slug)).then(entry.resolve, entry.reject);
      }, CHECK_AFTER);
      return entry.done;
    },
    /** POST /__gallery/edit/frameable: whether a web page lets an embed show it. */
    frameable: respond(checked(media.frameable)),
    /** GET /__gallery/edit/emoji-library: the library's emojis. */
    listEmojis: media.listEmojis,
    /** A custom emoji's image of the library, to serve ({ type, body } or null). */
    readEmoji: media.readEmoji,
    /** A request handler (request -> [status, body]) run in the queue commits run in. */
    respond,
    /** Report `slug` as `source` says, kept among its recent versions (history/<slug>/) before something other than a commit writes over it (`meta`: who made it, history.mjs); resolves to the version's id. */
    keepVersion,
    renameReport,
    reiconReport,
    /** A report as its pages see it ({ file, source, text, version, changes }), or null. */
    read,
    /** Where a report's file stands for the preview: { source, held, signs, wait, own } (settle.mjs). */
    settled,
    /**
     * Whose write report `slug`'s file holding `source` is, when it is the service's own last write of it:
     * "reader" (a commit, the reader's hand-in, 撤回, a rename) or "agent" (a commit of a page of the
     * Agent's own, ?agent; the Agent's hand-in, gallery export); null for any other text: no write of the
     * service's, an Agent's or anyone's.
     */
    writerOf: (slug, source) => (typeof source === "string" && writers.get(slug)?.hash === hashOf(source) ? writers.get(slug).by : null),
    /** settled(), once the file is not held (half written), or as it stands after WAIT when it still is. */
    whenTaken,
    /** A report as a page is served it: read() of its file once taken, or of what the preview last took while it is held still. */
    readTaken,
    /** What commits and the reader's hand-ins wrote of the report's natural HTML as the kit's markup since last asked ([{ time, changes }]), taken away. */
    takeRewrites: takeRewritten,
    /** An export's write of a report's file (the hand-in), in the queue: { ok, changes, added, given, repeated, written }; `{ reader: true }` the reader's. */
    handIn,
    /** The hand-in, for a caller already in the queue (the workspace's export, `{ reader: true }`). */
    handInReport,
    /** POST /__gallery/edit/hand-in: answered once its 批注 are checked (settleNotes). */
    handInRequest,
    /** POST /__gallery/edit/settle: a report's 批注 checked now, before a command says what was deleted. */
    settleRequest: (request, response) => settleRequest(request).then(
      ([status, body]) => sendJson(response, status, body),
      (error) => sendJson(response, 500, { ok: false, reason: "write", message: error.message }),
    ),
    /** A report's 批注 checked against its file now and what is kept for the commands on disk (the hand-in without a server: src/cli/hand-in.mjs). */
    settleNotes,
    /** POST /__gallery/edit/commit */
    commit: respondSettled(handleCommit, { early: keptAnswer }),
    /**
     * A commit the server makes of a report (its body as a page sends one: { slug, opening, texts, units, touch }),
     * for a caller already in the queue, the file not held: [status, answer], or AGAIN while it is (handleCommit).
     */
    handleCommit,
    /** To-dos of report `slug` checked from another page (workspace.setTodo): [status, { ok, results }] (setTodos). */
    setTodos,
    /** POST /__gallery/edit/reverted */
    reverted: respondSettled(handleReverted),
    /** POST /__gallery/edit/changes: the Agent's changes under review, read, kept, reverted, the revert undone (changesRequest). */
    changes: changesRequest,
    /** The same asked in this process (gallery revert with no server): [status, answer] (changesAction). */
    changesAction,
    /** POST /__gallery/edit/history: the recent versions listed, one shown, restored, a restore undone (historyAction). */
    history: historyRequest,
    /** The same asked in this process (gallery history with no server): [status, answer]. */
    historyAction,
    /** A recent version whose page a key from the list opens: { source, text, marked }, or null (versionShown: 历史版本's view). */
    versionShown,
    /**
     * The preview took report `slug`'s file as `source` (a page served, a write announced): kept as a
     * version when it is a write of someone else's (keepTaken); resolves, once that is kept too, with
     * whether its review of the Agent's changes started, grew or ended.
     */
    noteTaken: async (slug, source) => {
      const kept = keepTaken(slug, source);
      const moved = await reviews.look(slug, source);
      await kept;
      return moved;
    },
    /**
     * As the server starts: each of the reports `slugs` taken as its file is now, one at a time (none
     * half written: its announcement takes it), as a page served takes it. A write while no server ran
     * is then a version of its own and starts or grows the review of the Agent's changes against what the
     * last server took of the file (`seen`: docs/editor.md "Agent's changes"); a report no server took
     * before is taken as it is, its first version, nothing marked. Resolves once all are, with the slugs
     * whose review moved (their pages told: onChanges). `taken(slug, source)`: each file as it was taken
     * (the routes' record of what they last heard of it: server/updates.mjs).
     */
    async takeAll(slugs, taken = () => {}) {
      const moved = [];
      for (const slug of slugs) {
        if (typeof slug !== "string" || !slugPattern.test(slug)) continue;
        const { source, held } = await settled(slug).catch(() => ({ source: null }));
        if (typeof source !== "string" || held) continue;
        keepTaken(slug, source);
        taken(slug, source);
        if (await reviews.look(slug, source).catch(() => false)) {
          moved.push(slug);
          onChanges(slug);
        }
      }
      return moved;
    },
    /**
     * What is kept of a review of report `slug` forgotten, and its recent versions with it (its folder made, copied to,
     * or deleted for good): a document made under the name of one deleted before takes over none of its versions, which
     * the workbench's 历史版本 and gallery history would list as its own and restore.
     */
    forgetChanges: async (slug) => {
      await reviews.forget(slug);
      if (!stateDirectory || typeof slug !== "string" || !slugPattern.test(slug)) return;
      const run = disk.then(() => fs.rm(historyDirectory(stateDirectory, slug), { recursive: true, force: true, maxRetries: 3 })).catch(() => {});
      disk = run;
      await run;
    },
    /** Resolves once the snapshots, versions and reviews of the Agent's changes kept so far are on disk (or failed to be). */
    drain: async () => { await queue; await Promise.all([...checks.keys()].map(settleNotes)); await notes; await reviews.idle(); await disk; },
    stored: async () => {
      await reviews.idle();
      await disk;
    },
  };
}
