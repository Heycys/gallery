import { CHART_KEY } from "./table-chart.mjs";

// What a block reads of the workspace (docs/render.md "A custom block on a page", docs/workbench.md
// "The workspace's facts"): the kinds of
// context.workspace.query, how many items each gives, the options each takes, and where the kit asks for
// them, the one list the kit's runtime (render/kit/runtime/workspace.js), the server's facts
// (src/workbench/index.mjs) and the event stream's "data <kind>" (src/server/routes.mjs) go by; and how a
// block checks a to-do of another document (workspace.setTodo), what an export embeds of
// the workspace. Pure: no DOM, no Node.

/**
 * The kinds workspace.query answers: the workspace's facts, `table`, a keyed table of a document,
 * and `document`, one document's own facts (its title, icon, when it was made and last written, its
 * words: the instance's own document where the query names none).
 */
export const QUERY_KINDS = Object.freeze(["todos", "recent", "stats", "activity", "table", "document"]);

/**
 * The kinds of the workspace's facts a change may change, each said to the pages as "data <kind>":
 * `table` whenever a document's text changed (any keyed table of it may have), `document` whenever a
 * document's facts did (its file written, its title or icon changed, it made or gone).
 */
export const FACT_KINDS = Object.freeze(["todos", "recent", "stats", "activity", "table", "document"]);

/**
 * The codes workspace.query rejects with, never another: the server's own refusals of a query
 * (kind, options, missing: no such document, or no table of that key in it, or one with merged cells; and
 * unsupported, which no server of this version says) as it says them; offline where there is no server to ask
 * (an export without that kind in its snapshot) or it does not answer; failed where it answered and could
 * not (a read that failed, a request it refused, no JSON).
 */
export const QUERY_CODES = Object.freeze(["kind", "options", "unsupported", "missing", "offline", "failed"]);

/**
 * How many items a query gives where its options say none, and the most it gives: to-dos, documents edited
 * last, days of the record (as many as it keeps, src/workbench/activity.mjs KEEP_DAYS: the 编辑热力图's 53
 * weeks), rows of a table.
 */
export const QUERY_LIMITS = Object.freeze({ todos: { default: 200, most: 1000 }, recent: { default: 10, most: 50 }, activity: { default: 365, most: 371 }, table: { default: 200, most: 1000 } });

/**
 * What an export embeds of the workspace for a document whose blocks read it (its snapshot's
 * kinds beside `net`), each kind's whole answer to so many at most: to-dos (done or not), documents edited
 * last, days of the record, and of the tables its instances asked for (the last `tables` of them), rows each.
 */
export const SNAPSHOT_LIMITS = Object.freeze({ todos: 200, recent: 50, activity: 371, tables: 20, rows: 1000 });

/** Where a page asks for its to-dos to be checked (POST { slug, items: [{ ref, done }] }, the token's: the workspace's service). */
export const TODO_ROUTE = "/__gallery/workspace/todo";

/** What workspace.setTodo asks whoever shows the page (cancelable, on the window: { ask: { slug, ref, done }, answer(promise) }). */
export const TODO_EVENT = "doc-todo-set";

/**
 * The codes workspace.setTodo rejects with, never another: ref (not a to-do's ref as query gave it, or
 * `done` no true or false), changed (the item is not as the ref read it: its words changed, or it is gone:
 * the conflict, which the block reads again after), ambiguous (no block id, the file changed since, and
 * more than one item of its words under its headings), locked (the item is there as read, in a place the
 * document's own page cannot check: a list in a table cell, a block of the document's own), missing (no such document), busy (the file kept
 * changing, or stayed half written), offline (nothing on the page writes the workspace: an exported file,
 * the 演示视图, a page on its own without a token; or the server does not answer), failed (anything else).
 */
export const TODO_CODES = Object.freeze(["ref", "changed", "ambiguous", "locked", "missing", "busy", "offline", "failed"]);

/** How many to-dos one write of a document carries at most (the page merges what waits into one). */
export const TODO_MOST = 50;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BLOCK = /^[A-Za-z0-9_-]{1,64}$/;
const VERSION = /^[a-f0-9]{16}$/;

/**
 * `ref` as a write carries it, when it is a to-do's ref as workspace.query("todos") gives it ({ slug,
 * block, text, path, nth, version }: `version` the hash of the file the facts read it from, which may be
 * missing), or null.
 */
export function todoRef(ref) {
  if (!ref || typeof ref !== "object" || Array.isArray(ref)) return null;
  const { slug, block = null, text, path, nth, version = null } = ref;
  if (typeof slug !== "string" || !SLUG.test(slug) || (block !== null && (typeof block !== "string" || !BLOCK.test(block)))) return null;
  if (typeof text !== "string" || text.length > 4000 || !Array.isArray(path) || path.length > 6 || !path.every((step) => typeof step === "string" && step.length <= 4000)) return null;
  if (!Number.isInteger(nth) || nth < 0 || (version !== null && (typeof version !== "string" || !VERSION.test(version)))) return null;
  return { slug, block, text, path: [...path], nth, version };
}

/** Where a query is asked (GET, ?kind=<kind>&options=<JSON>): the workspace's service. */
export const QUERY_ROUTE = "/__gallery/workspace/query";

/**
 * The global a page the server serves holds QUERY_ROUTE in (src/server/routes.mjs, a script of the
 * server's that no export keeps), which the kit's runtime asks: none there, the workspace is offline.
 */
export const WORKSPACE_GLOBAL = "__galleryWorkspace";

/** What workspace.open asks whoever shows the page to open (a cancelable event on the window, detail { slug, block } or { page }). */
export const OPEN_EVENT = "doc-open-request";

/**
 * The options of a query of `kind` as they are used: { options } (todos: done, slugs, limit; recent:
 * limit; activity: days; table: slug, key, where, limit; document: slug, which the kit fills with the
 * instance's own document where none is given; every count held to its most), or { problem } (what is
 * wrong, in English).
 */
export function queryOptions(kind, options) {
  const given = options ?? {};
  if (typeof given !== "object" || Array.isArray(given)) return { problem: "its options are an object" };
  const count = (name, { default: fallback, most }) => {
    const value = given[name];
    if (value === undefined) return fallback;
    if (!Number.isInteger(value) || value < 1) throw new Error(`${name} is a whole number from 1`);
    return Math.min(value, most);
  };
  try {
    if (kind === "todos") {
      if (given.done !== undefined && typeof given.done !== "boolean") return { problem: "done is true or false" };
      if (given.slugs !== undefined && !(Array.isArray(given.slugs) && given.slugs.every((slug) => typeof slug === "string"))) return { problem: "slugs is a list of documents' slugs" };
      return { options: { done: given.done, slugs: given.slugs ?? null, limit: count("limit", QUERY_LIMITS.todos) } };
    }
    if (kind === "recent") return { options: { limit: count("limit", QUERY_LIMITS.recent) } };
    if (kind === "table") {
      if (typeof given.slug !== "string" || !SLUG.test(given.slug)) return { problem: "slug is a document's slug" };
      if (typeof given.key !== "string" || !CHART_KEY.test(given.key)) return { problem: "key is a table's key (data-doc-chart-source)" };
      const where = given.where ?? {};
      if (typeof where !== "object" || Array.isArray(where) || !Object.values(where).every((value) => typeof value === "string")) return { problem: "where maps each column to the words its cells are to hold" };
      return { options: { slug: given.slug, key: given.key, where: { ...where }, limit: count("limit", QUERY_LIMITS.table) } };
    }
    if (kind === "activity") return { options: { days: count("days", QUERY_LIMITS.activity) } };
    if (kind === "document") {
      if (typeof given.slug !== "string" || !SLUG.test(given.slug)) return { problem: "slug is a document's slug (in a document it is that document's when left out; on a custom page name one)" };
      return { options: { slug: given.slug } };
    }
    return { options: {} };
  } catch (error) {
    return { problem: error.message };
  }
}
