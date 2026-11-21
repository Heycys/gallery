import fs from "node:fs/promises";
import path from "node:path";
import { MENTION } from "../shared/components/mention.mjs";
import { writeAtomic } from "../shared/files.mjs";
import { keyedTable } from "../shared/file-table.mjs";
import { reportLines } from "../shared/search.mjs";
import { fileVersion, todosOf } from "../shared/todos.mjs";
import { countWords } from "../shared/words.mjs";
import { FACT_KINDS, QUERY_KINDS, SNAPSHOT_LIMITS, queryOptions } from "../shared/workspace-query.mjs";
import { documentDirectory, documentFiles, layoutOf, listDocumentSlugs, listTrash } from "../shared/workspace.mjs";

export { todosOf };

// The workspace's facts (文档事实索引, since 2026-11-07; docs/workbench.md
// "The workspace's facts"): what each document
// holds that a block reads of the workspace (workspace.query: its to-dos, the documents edited last, the
// workspace's counts, the record of edits), kept by the server side of the workbench, beside the
// workspace's service (./service.mjs), which answers GET /__gallery/workspace/query from it and reads its
// search's lines and its menu's counts through it. Per document: its title and icon (doc.json), when it was
// made (created: createdOf) and when its file was last written (edited, the file's time), its words (shared/words.mjs, as the menu's foot counts
// them), the hash of its file's text, its to-dos (each item of a ul.doc-todo: its own words, whether it is
// done, data-checked, its block id or null, the path of headings it stands under and which of the items of
// the same words under the same path it is), and the lines its search finds words in (shared/search.mjs,
// its page blocks by the titles they show, read when a search asks). All of it read of the document as its
// pages are served it (readOf: the edit service's readTaken, an Agent's natural HTML the kit's, nothing
// written, and never a file held half written: while one is, what the preview last took of it, which its
// pages show, read again each time until it is taken), again when the file's time or its doc.json's is
// another than the one read: nothing else holds an entry, and any of it can go and be read again (forget,
// or a server's start). It keeps the one version of each it read, and nothing of the edit service's
// snapshots (the merge bases of open pages, the last 50 kept: reading 50 documents through them would push
// out the one an open page commits on). changed(slug) reads a document again as the server took its file
// (the preview's announcement) and says which kinds of the facts changed since the facts the pages were
// last told of (`told`: those of the announcement before, or of its first read), never since those a query
// read meanwhile (a page's query, the menu's count, the search: one between a write and its announcement
// reads the new facts already, and the pages that read before it must still hear of them); the server
// tells each kind every page as "data <kind>" (src/server/routes.mjs), the record of edits (./activity.mjs)
// counting it. The 写作偏好 page and the custom pages are no documents of it.
// A to-do's ref carries the version of the file its facts were read from (`version`, the hash of its text:
// shared/todos.mjs fileVersion), by which a check of it from another page (workspace.setTodo,
// src/editor/todos.mjs) trusts its place among the items of its words (`nth`) while the file is still that
// one; so a document with such an item, one without an id that has a twin, tells its to-dos changed
// whenever its text does, for the refs the pages hold to say the version it has. A table of a document
// (`table`) is read of its text as the kit reads it on a page
// (shared/file-table.mjs keyedTable), kept with its entry until the file changes; which tables a document's
// instances asked for is kept too (`asked`: .gallery/cache/workspace/<slug>.json, the last
// SNAPSHOT_LIMITS.tables of each), what an export of it embeds (snapshotOf), as the net's
// cache keeps what they fetched.

/**
 * How the facts read a document of edit service `edits` (createEditService): as its pages are served it
 * (readTaken, at once), { source, text, held } or null, `held` a file held half written, its text then what
 * the preview last took of it (src/editor/settle.mjs), as a page of it is served.
 */
export const readOf = (edits) => (slug) => edits.readTaken(slug, { wait: 0 });

// Whether a document has an item without an id that has a twin (the same words under the same headings): a
// check of it from another page finds it by its place among them, which its ref's `version` vouches for
// only while the file is that version, so that the refs the pages hold of it are told again whenever the
// file changes (see `changed`).
const twinned = ({ todos }) => {
  const seen = new Map();
  const keyOf = (todo) => JSON.stringify([todo.text, todo.path]);
  for (const todo of todos) seen.set(keyOf(todo), (seen.get(keyOf(todo)) ?? 0) + 1);
  return todos.some((todo) => !todo.block && seen.get(keyOf(todo)) > 1);
};

/** What `factsOf` gives of a document's text: its words, its to-dos and the hash of its file's `source`. */
export const textFacts = (source, text) => ({ hash: fileVersion(source), words: countWords(text), todos: todosOf(text) });

// The start of the week `now` falls in: its Monday, 0:00 of the server's clock.
function weekStart(now) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date.getTime();
}

/**
 * When a document was made (ms): its doc.json's `created` (an ISO time, which Gallery writes as it makes one:
 * gallery new and import, the workbench's 新建, a copy's own), else the earliest its folder and files tell
 * (`files`, documentFiles; `times`, its files' last writes): the folder's birth time, or a file older than
 * it (a folder copied from elsewhere is as new as the copy, its files' times often kept).
 */
export async function createdOf(files, metadata, times) {
  const written = typeof metadata?.created === "string" ? Date.parse(metadata.created) : NaN;
  if (Number.isFinite(written)) return Math.round(written);
  const born = await fs.stat(path.dirname(files.html)).then(({ birthtimeMs }) => birthtimeMs, () => 0);
  return Math.round(Math.min(...[born, ...times].filter((time) => Number.isFinite(time) && time > 0)));
}

/**
 * The facts of workspace `root`'s documents. `read(slug)`: a document as its pages are served it ({ source,
 * text, held? } or null: readOf, the edit service's readTaken; `held` a file held half written, its facts
 * then read again each time they are asked until it is not); `draw(text, slug)`: its page blocks by the
 * titles they show (for its search's lines); `activity`: the record of edits (./activity.mjs
 * createActivity); `now`: the clock.
 *   facts(slug)            a document's facts, read again when its file's or its doc.json's time changed:
 *                          { slug, title, icon, created (ms: createdOf), edited (ms), words, hash, todos }, or null
 *   all()                  every document's, in no order
 *   lines(slug, titles)    the lines its search reads (titles: what the workspace's titles are now)
 *   query(kind, options, { doc })  [status, { ok, kind, data, at }], or a refusal; a table
 *                          asked by an instance of document `doc` kept among the tables it asked for
 *   snapshot(slug)         what an export of document `slug` embeds of the workspace, or null
 *   changed(slug, { source, text, by })  the server took its file (source null: gone): its facts read again
 *                          from that, the record told (by "reader" or "agent"); resolves to the kinds that
 *                          changed (FACT_KINDS) since the facts last told (the announcement before, or the
 *                          first read), whatever a query read of it meanwhile
 *   start()                at a server's start: the record caught up with what was written while none ran;
 *                          resolves to how many edits that counted
 *   forget(slug)           its entry gone (read again when asked)
 */
export function createIndex({ root, read, draw = (text) => text, activity = null, now = () => new Date() }) {
  const entries = new Map(); // slug -> { html, json: the times they were read at, facts, held, lines?: { titles, value }, tables?: Map(key -> keyedTable's) }
  // slug -> the facts the pages were last told of: what the announcement before read, or the first read of
  // it (no page read any other before), which a read since (a query, the menu, the search) leaves as it was.
  const told = new Map();
  const timeOf = (file) => fs.stat(file).then(({ mtimeMs }) => mtimeMs, () => null);

  // A document's facts of its files read now (its text `given`, as the server took it, when it is that).
  async function readFacts(slug, given = null) {
    const files = documentFiles(documentDirectory(slug, root));
    const [html, json] = await Promise.all([timeOf(files.html), timeOf(files.json)]);
    if (html === null) return null;
    const report = given ?? (await read(slug));
    if (!report) return null;
    let metadata = {};
    try {
      metadata = JSON.parse(await fs.readFile(files.json, "utf8")) ?? {};
    } catch {}
    const { title, icon } = metadata;
    const facts = {
      slug, title: typeof title === "string" && title.trim() ? title : slug, icon: typeof icon === "string" && icon ? icon : null,
      created: await createdOf(files, metadata, [html, json]), edited: Math.round(html), ...textFacts(report.source, report.text),
    };
    entries.set(slug, { html, json, facts, held: report.held === true });
    if (!told.has(slug)) told.set(slug, facts);
    return facts;
  }

  async function facts(slug) {
    const known = entries.get(slug);
    // One read while its file was held is read again: once it is taken, its time may be the same.
    if (known && !known.held) {
      const files = documentFiles(documentDirectory(slug, root));
      const [html, json] = await Promise.all([timeOf(files.html), timeOf(files.json)]);
      if (html === known.html && json === known.json) return known.facts;
    }
    return readFacts(slug);
  }

  async function collect() {
    const slugs = await listDocumentSlugs(root);
    for (const slug of entries.keys()) if (!slugs.includes(slug)) entries.delete(slug);
    for (const slug of told.keys()) if (!slugs.includes(slug)) told.delete(slug);
    return (await Promise.all(slugs.map((slug) => facts(slug).catch(() => null)))).filter(Boolean);
  }

  // Home cards often ask for recent documents, to-dos and statistics together. Share
  // only their in-flight scan; the next request still checks the files on disk.
  let readingAll = null;
  async function all() {
    const pending = readingAll ??= collect();
    try {
      return [...await pending]; // callers may sort their own result
    } finally {
      if (readingAll === pending) readingAll = null;
    }
  }

  const ANSWER = {
    // The to-dos, of the documents edited last first, each in its document's order.
    async todos({ done, slugs, limit }) {
      const documents = (await all()).filter((entry) => !slugs || slugs.includes(entry.slug)).sort((a, b) => b.edited - a.edited || a.slug.localeCompare(b.slug));
      const list = [];
      for (const { slug, title, icon, todos, hash } of documents) {
        for (const todo of todos) {
          if (done !== undefined && todo.done !== done) continue;
          if (list.length >= limit) return list;
          list.push({ ref: { slug, block: todo.block, text: todo.text, path: todo.path, nth: todo.nth, version: hash }, text: todo.text, done: todo.done, slug, title, icon, path: todo.path });
        }
      }
      return list;
    },
    async recent({ limit }) {
      return (await all()).sort((a, b) => b.edited - a.edited || a.slug.localeCompare(b.slug)).slice(0, limit)
        .map(({ slug, title, icon, edited }) => ({ slug, title, icon, edited: new Date(edited).toISOString() }));
    },
    async stats() {
      const documents = await all();
      const week = weekStart(now());
      const todos = documents.flatMap((entry) => entry.todos);
      return {
        documents: documents.length,
        todos: { done: todos.filter((todo) => todo.done).length, total: todos.length },
        words: documents.reduce((sum, entry) => sum + entry.words, 0),
        editedThisWeek: documents.filter((entry) => entry.edited >= week).length,
      };
    },
    async activity({ days }) {
      if (!activity) return [];
      await activity.load();
      await starting;
      return activity.days(days);
    },
    // A keyed table of a document, its rows whose cells hold the words `where` names
    // (a column it does not have refused, as context.rows() throws for one), the first `limit` of them,
    // and how many there are (`total`); its reading kept with the entry until the file changes.
    async table({ slug, key, where, limit }, { words: keep = false } = {}) {
      const known = await facts(slug).catch(() => null);
      const entry = entries.get(slug);
      if (!known || !entry) return refusal(404, "missing", `no document "${slug}"`);
      entry.tables ??= new Map();
      if (!entry.tables.has(key)) {
        const report = await read(slug);
        if (!report) return refusal(404, "missing", `no document "${slug}"`);
        entry.tables.set(key, keyedTable(report.text, key, slug));
      }
      const table = entry.tables.get(key);
      if (table.error === "missing") return refusal(404, "missing", `"${slug}" holds no table whose frame carries data-doc-chart-source="${key}"`);
      if (table.error) return refusal(422, "missing", `the table "${key}" of "${slug}" has merged cells, which no view reads: write each value in its own cell`);
      const unknown = Object.keys(where).filter((name) => !table.columns.includes(name));
      if (unknown.length > 0) return refusal(400, "options", `table: the table "${key}" of "${slug}" has no column ${unknown.map((name) => JSON.stringify(name)).join(", ")} (its columns: ${table.columns.map((name) => JSON.stringify(name)).join(", ")})`);
      const rows = table.rows.filter((row) => Object.entries(where).every(([name, words]) => row.words[name] === words.replace(/\s+/g, " ").trim()));
      return { columns: [...table.columns], rows: rows.slice(0, limit).map(({ values, links, words }) => ({ values: { ...values }, links: links.map((link) => ({ ...link })), ...(keep ? { words: { ...words } } : {}) })), total: rows.length };
    },
    // One document's own facts (the kit names the instance's own document where the block names none);
    // editedBy, who made its last change of text as the record of edits counted it (null: none it knows).
    async document({ slug }) {
      const known = await facts(slug).catch(() => null);
      if (!known) return refusal(404, "missing", `no document "${slug}"`);
      await activity?.load();
      const { title, icon, created, edited, words } = known;
      return { slug, title, icon, created: new Date(created).toISOString(), edited: new Date(edited).toISOString(), editedBy: activity?.writer(slug) ?? null, words };
    },
  };
  // A query refused for what it asked (thrown out of ANSWER, answered as it says).
  const refusal = (status, reason, message) => {
    throw Object.assign(new Error(message), { refusal: [status, { ok: false, reason, message }] });
  };

  // The tables each document's instances asked for (`doc` -> ["<slug>#<key>"], the last asked last), on
  // disk as the net cache keeps what they fetched (.gallery/cache/workspace/<doc>.json), read once each.
  const asked = new Map();
  const askedFile = (doc) => path.join(layoutOf(root).gallery, "cache", "workspace", `${doc}.json`);
  const askedOf = async (doc) => {
    if (!asked.has(doc)) {
      let kept = [];
      try {
        const value = JSON.parse(await fs.readFile(askedFile(doc), "utf8"));
        if (Array.isArray(value?.tables)) kept = value.tables.filter((name) => typeof name === "string").slice(-SNAPSHOT_LIMITS.tables);
      } catch {}
      if (!asked.has(doc)) asked.set(doc, kept);
    }
    return asked.get(doc);
  };
  let writing = Promise.resolve();
  const noteAsked = async (doc, name) => {
    const list = await askedOf(doc);
    if (list.at(-1) === name) return;
    const next = [...list.filter((one) => one !== name), name].slice(-SNAPSHOT_LIMITS.tables);
    asked.set(doc, next);
    writing = writing.then(async () => {
      await fs.mkdir(path.dirname(askedFile(doc)), { recursive: true });
      await writeAtomic(askedFile(doc), `${JSON.stringify({ tables: asked.get(doc) })}\n`);
    }).catch(() => {}); // not kept on disk: an export after a restart embeds none of them until asked again
  };
  const DOC = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  let starting = Promise.resolve();
  const index = {
    facts,
    all,
    async lines(slug, titles) {
      const known = entries.get(slug);
      const current = await facts(slug);
      if (!current) return null;
      const entry = entries.get(slug);
      if (entry !== known || !entry.lines || (entry.lines.titles !== null && entry.lines.titles !== titles)) {
        const report = await read(slug);
        if (!report) return null;
        entry.lines = { titles: report.text.includes(MENTION) ? titles : null, value: reportLines(draw(report.text, slug)) };
      }
      return entry.lines.value;
    },
    async query(kind, options, { doc = null } = {}) {
      if (!QUERY_KINDS.includes(kind)) return [400, { ok: false, reason: "kind", message: `no kind "${kind}": todos, recent, stats, activity, table or document` }];
      const { problem, options: used } = queryOptions(kind, options);
      if (problem) return [400, { ok: false, reason: "options", message: `${kind}: ${problem}` }];
      let data;
      try {
        data = await ANSWER[kind](used);
      } catch (error) {
        if (error.refusal) return error.refusal;
        throw error;
      }
      if (kind === "table" && typeof doc === "string" && DOC.test(doc)) await noteAsked(doc, `${used.slug}#${used.key}`);
      return [200, { ok: true, kind, data, at: new Date(now()).toISOString() }];
    },
    // What an export of document `slug` embeds of the workspace (SNAPSHOT_LIMITS): each kind of
    // the facts whole, to its most, and each table its instances asked for (the last of them) as a query
    // without `where` reads it, by "<slug>#<key>"; one that cannot be read now left out.
    async snapshot(slug) {
      const whole = async (kind, options) => {
        const [status, answer] = await index.query(kind, options);
        return status === 200 ? answer.data : null;
      };
      const snapshot = {
        todos: await whole("todos", { limit: SNAPSHOT_LIMITS.todos }),
        recent: await whole("recent", { limit: SNAPSHOT_LIMITS.recent }),
        stats: await whole("stats"),
        activity: await whole("activity", { days: SNAPSHOT_LIMITS.activity }),
        document: DOC.test(slug) ? await whole("document", { slug }) : null,
      };
      const tables = {};
      for (const name of DOC.test(slug) ? await askedOf(slug) : []) {
        const [table, key] = name.split("#");
        // Each row with its cells' words too, which a query of the export filters by as the server does.
        const data = await ANSWER.table({ slug: table, key, where: {}, limit: SNAPSHOT_LIMITS.rows }, { words: true }).catch(() => null);
        if (data) tables[name] = data;
      }
      if (Object.keys(tables).length > 0) snapshot.tables = tables;
      return Object.fromEntries(Object.entries(snapshot).filter(([, value]) => value !== null));
    },
    /** Resolves once what was kept of the tables asked for is on disk (or failed to be). */
    stored: () => writing,
    async changed(slug, { source = null, text = null, by = "agent" } = {}) {
      readingAll = null;
      // Against what the pages were told last, not the entry: a query between the write and now read it already.
      const before = told.get(slug) ?? entries.get(slug)?.facts ?? null;
      entries.delete(slug);
      const after = source === null ? null : await readFacts(slug, { source, text: text ?? source }).catch(() => null);
      if (after) told.set(slug, after);
      else told.delete(slug);
      const kinds = new Set();
      if (Boolean(before) !== Boolean(after)) for (const kind of ["todos", "recent", "stats", "table", "document"]) kinds.add(kind);
      if (before && after && before.hash !== after.hash) kinds.add("table"); // any keyed table of it may have changed
      if (before && after && before.hash !== after.hash && (twinned(before) || twinned(after))) kinds.add("todos"); // the refs' version
      if (before && after) {
        if (before.title !== after.title || JSON.stringify(before.todos) !== JSON.stringify(after.todos)) kinds.add("todos");
        if (before.title !== after.title || before.icon !== after.icon || before.edited !== after.edited) kinds.add("recent");
        if (before.words !== after.words || before.todos.length !== after.todos.length || before.todos.filter((todo) => todo.done).length !== after.todos.filter((todo) => todo.done).length || before.edited !== after.edited) kinds.add("stats");
        if (["title", "icon", "created", "edited", "words"].some((name) => before[name] !== after[name])) kinds.add("document");
      }
      if (!before && after) kinds.add("recent");
      if (activity && after) {
        await activity.load();
        await starting;
        if (activity.record(slug, { hash: after.hash, words: after.words, mtime: after.edited, by })) kinds.add("activity");
      }
      return FACT_KINDS.filter((kind) => kinds.has(kind));
    },
    start() {
      if (!activity) return Promise.resolve(0);
      starting = (async () => {
        await activity.load();
        const slugs = await listDocumentSlugs(root);
        const documents = (await Promise.all(slugs.map(async (slug) => ({ slug, mtime: await timeOf(documentFiles(documentDirectory(slug, root)).html) })))).filter(({ mtime }) => mtime !== null);
        const kept = (await listTrash(root).catch(() => [])).map((entry) => entry.slug);
        return activity.catchUp(documents.map(({ slug, mtime }) => ({ slug, mtime: Math.round(mtime) })), facts, { kept });
      })().catch(() => 0);
      return starting;
    },
    forget(slug) {
      readingAll = null;
      entries.delete(slug);
      told.delete(slug);
    },
  };
  return index;
}
