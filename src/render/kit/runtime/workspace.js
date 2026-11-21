import { workspaceAddress } from "../../../shared/workspace-address.mjs";
// context.workspace (docs/render.md "A custom block on a page"): what a custom block whose manifest's
// needs hold "workspace" reads of the workspace, given it by
// the kernel (kernel.js packageContext), no consent asked (it is the user's own workspace, on this
// computer). query(kind, options) asks the server Gallery shows the page from, at the address the page
// says (WORKSPACE_GLOBAL: a script of the server's, src/server/routes.mjs, which no export holds, so that
// the kit's own files name no address of the server's; the workspace's service, src/workbench/index.mjs),
// and resolves to { data, at }; what it refuses rejects with an Error whose `code` says why, one of
// QUERY_CODES (src/shared/workspace-query.mjs) and never another: "kind" (no such kind), "options",
// "missing" (`table`: no such document, no table of that key in it, or one with merged cells),
// "unsupported" (which no server of this version says), "offline" (an exported file whose snapshot holds
// no answer of that kind; or a server that does not answer), "failed" (the server answered and could not:
// a read that failed, 500 "read"; a request it refused, 403 "host"; an answer that is no JSON; any reason
// it gives that is none of the query's own). A query of a table from a document says which document asked
// (&doc=<slug>: its export embeds that table). Each kind an instance asked for is one it hears `data` of
// from then on (the kernel's doc-workspace-change). In an exported file (place "export") nothing is asked of
// any server: the export embedded each kind's whole answer to its most (script[data-doc-snapshot],
// SNAPSHOT_LIMITS), which a query reads as the server would answer it, its options applied, `at`
// the export's time. open(target) asks whoever shows the page to open a document (`{ slug, block? }`) or a
// custom page (`{ page }`): the workbench, by a cancelable event its page's session answers
// (src/editor/page/custom-page.mjs, editor.mjs), else the page goes there itself; in an exported file it
// does nothing. setTodo(ref, done) asks whoever shows the page to check a to-do of a
// document (TODO_EVENT, cancelable, on the window: { ask: { slug, ref, done }, answer(promise) }: the
// custom page's board, or a document's editor, which hold the token: src/editor/page/todo-writes.mjs) and
// resolves to whether it changed the document (false: it said so already); it rejects with a `code` of
// TODO_CODES; a page nothing answers on (the 演示视图, a page on its own without a token) is "offline". An
// exported file has none: setTodo is not there, so that a block draws its items read-only.

import { OPEN_EVENT, QUERY_KINDS, TODO_CODES, TODO_EVENT, WORKSPACE_GLOBAL, queryOptions, todoRef } from "../../../shared/workspace-query.mjs";

// The server's refusals of a query itself, passed on as it says them; any other reason it gives is "failed".
const ASKED = new Set(["kind", "options", "unsupported", "missing"]);

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BLOCK = /^[A-Za-z0-9_-]{1,64}$/;

// What the export embedded (script[data-doc-snapshot]), read once; null for none.
let embedded;
const snapshotOf = () => {
  if (embedded !== undefined) return embedded;
  const tag = document.querySelector("script[data-doc-snapshot]");
  try {
    const value = JSON.parse(tag?.textContent ?? "null");
    embedded = value && typeof value === "object" ? { value, at: tag.getAttribute("data-at") ?? "" } : null;
  } catch {
    embedded = null;
  }
  return embedded;
};

// A query answered from the snapshot as the server answers it (its options as queryOptions has them), or
// undefined where it holds no answer of that kind.
function fromSnapshot(kind, used) {
  const value = snapshotOf()?.value;
  if (!value) return undefined;
  if (kind === "todos") {
    if (!Array.isArray(value.todos)) return undefined;
    return value.todos.filter((todo) => (used.done === undefined || todo.done === used.done) && (!used.slugs || used.slugs.includes(todo.slug))).slice(0, used.limit);
  }
  if (kind === "recent") return Array.isArray(value.recent) ? value.recent.slice(0, used.limit) : undefined;
  if (kind === "stats") return value.stats && typeof value.stats === "object" ? value.stats : undefined;
  if (kind === "activity") return Array.isArray(value.activity) ? value.activity.slice(-used.days) : undefined;
  if (kind === "document") return value.document?.slug === used.slug ? value.document : undefined;
  const table = value.tables?.[`${used.slug}#${used.key}`];
  if (!table || !Array.isArray(table.columns) || !Array.isArray(table.rows)) return undefined;
  const tidy = (text) => String(text).replace(/\s+/g, " ").trim();
  const words = (value) => (value === null || value === undefined ? "" : tidy(value));
  // By the words its cells hold, as the server filters (the snapshot keeps them, `words`), which no row it gives carries.
  const rows = table.rows.filter((row) => Object.entries(used.where).every(([name, wanted]) => (row.words ? tidy(row.words[name] ?? "") : words(row.values?.[name])) === tidy(wanted)));
  return { columns: table.columns, rows: rows.slice(0, used.limit).map(({ values, links }) => ({ values, links })), total: rows.length };
}

/**
 * The workspace member of an instance's context: `id` its package's (said in what it throws), `place`
 * where it is (kernel.js placeOf), `kinds` the set its queries are kept in (the instance's).
 */
export function workspaceOf({ id, place, kinds }) {
  const refused = (message, code) => Promise.reject(Object.assign(new Error(`${id}: ${message}`), { code }));
  const own = () => document.querySelector(".doc-page")?.dataset.docId || null;
  const member = {
    query(kind, options = {}) {
      if (!QUERY_KINDS.includes(kind)) return refused(`workspace.query knows no kind "${kind}": todos, recent, stats, activity, table or document`, "kind");
      kinds.add(kind);
      // A document's own facts, of the instance's own document where the block names none (none on a custom page).
      if (kind === "document" && place !== "page" && options && typeof options === "object" && !Array.isArray(options) && options.slug === undefined && own()) options = { ...options, slug: own() };
      if (place === "export") {
        const { problem, options: used } = queryOptions(kind, options);
        if (problem) return refused(`${kind}: ${problem}`, "options");
        const data = fromSnapshot(kind, used);
        if (data === undefined) return refused("an exported file has no workspace to read, and its export kept none of this: open it in Gallery", "offline");
        return Promise.resolve({ data, at: snapshotOf()?.at ?? "" });
      }
      const route = globalThis[WORKSPACE_GLOBAL];
      if (typeof route !== "string") return refused("an exported file has no workspace to read: open it in Gallery", "offline");
      let given;
      try {
        given = JSON.stringify(options ?? {});
      } catch {
        return refused("its options are no JSON", "options");
      }
      const doc = kind === "table" && place === "document" ? own() : null;
      const address = `${route}?kind=${encodeURIComponent(kind)}&options=${encodeURIComponent(given)}${doc ? `&doc=${encodeURIComponent(doc)}` : ""}`;
      return fetch(address, { cache: "no-store", credentials: "same-origin" }).then(
        (response) => response.json().then((answer) => {
          if (answer?.ok) return { data: answer.data, at: answer.at };
          const message = typeof answer?.message === "string" ? answer.message : `the server answered ${response.status}`;
          return ASKED.has(answer?.reason) ? refused(message, answer.reason) : refused(`the workspace could not be read: ${message}`, "failed");
        }, () => refused(`the workspace could not be read: the server answered ${response.status}`, "failed")),
        () => refused("the server that showed this page does not answer", "offline"),
      );
    },
    open(target) {
      if (place === "export") return;
      const page = typeof target?.page === "string" ? target.page : null;
      const slug = typeof target?.slug === "string" ? target.slug : null;
      const block = typeof target?.block === "string" && target.block ? target.block : null;
      if (!(page ? SLUG.test(page) : slug && SLUG.test(slug)) || (block !== null && !BLOCK.test(block))) throw new Error(`${id}: workspace.open is given { slug, block? } of a document or { page } of a custom page`);
      const detail = page ? { page } : { slug, block };
      const asked = new CustomEvent(OPEN_EVENT, { cancelable: true, detail });
      if (!globalThis.dispatchEvent(asked)) return;
      globalThis.location.assign(workspaceAddress(page ? `/pages/${page}` : `/generated/${slug}.html${block ? `#${encodeURIComponent(block)}` : ""}`));
    },
  };
  if (place !== "export") {
    member.setTodo = (ref, done) => {
      const given = todoRef(ref);
      if (!given || typeof done !== "boolean") return refused("workspace.setTodo is given a to-do's ref as query(\"todos\") gave it, and true or false", "ref");
      let answer = null;
      const asked = new CustomEvent(TODO_EVENT, { cancelable: true, detail: { ask: { slug: given.slug, ref: given, done }, answer: (promise) => { answer = promise; } } });
      globalThis.dispatchEvent(asked);
      if (!asked.defaultPrevented || !answer) return refused("nothing on this page writes the workspace: open it in Gallery's workbench", "offline");
      return Promise.resolve(answer).then((result) => {
        if (result?.ok) return result.changed === true;
        const code = TODO_CODES.includes(result?.reason) ? result.reason : "failed";
        return refused(typeof result?.message === "string" ? result.message : `the to-do could not be written (${result?.reason ?? "no answer"})`, code);
      }, () => refused("the server that showed this page does not answer", "offline"));
    };
  }
  return Object.freeze(member);
}
