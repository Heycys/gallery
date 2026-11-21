import { TODO_EVENT, TODO_MOST, TODO_ROUTE } from "../../shared/workspace-query.mjs";
import { postAnswer } from "./post.mjs";

// To-dos of documents checked from this page (workspace.setTodo; docs/editor.md "To-dos
// checked from another page"): the kit's ask (TODO_EVENT, cancelable on the window: { ask: { slug, ref,
// done }, answer(promise) }) taken by whoever holds the page's token (a custom page's board, a document's
// editor) and written by the workspace's service (POST TODO_ROUTE, one document a request: the edit
// service's setTodos, one commit of the reader's). The checks of one document wait in a line of their own:
// those asked while one write of it is out go together in the next (its items in the order asked, the
// last of an item winning), so that a reader ticking five boxes quickly makes two commits, not five.
// Each ask is answered { ok: true, changed, block } (`block` the item's id now, which the commit gives
// one that had none) or { ok: false, reason, message? }, never rejected.

/**
 * `token`: the page map's. `done(ask, answer)`: an ask answered (the board keeps an undo step of one that
 * changed its document). Returns { write(ask) (a promise of its answer), idle() (once every write asked so
 * far is answered), listen() (takes the kit's asks; returns the function that stops it) }.
 */
export function createTodoWrites({ token, done = () => {} }) {
  const lines = new Map(); // slug -> { waiting: [{ ask, resolve }], out: Promise | null }

  async function send(slug, line) {
    const batch = line.waiting.splice(0, TODO_MOST);
    const answer = await postAnswer(TODO_ROUTE, token, { slug, items: batch.map(({ ask }) => ({ ref: ask.ref, done: ask.done })) });
    batch.forEach(({ ask, resolve }, index) => {
      const result = answer?.ok ? answer.results?.[index] ?? { ok: false, reason: "failed" } : { ok: false, reason: answer?.reason === "offline" ? "offline" : answer?.reason ?? "failed", ...(typeof answer?.message === "string" ? { message: answer.message } : {}) };
      try {
        done(ask, result);
      } finally {
        resolve(result);
      }
    });
  }

  // The line of a document: written once nothing of it is out, what waits then going together.
  function run(slug) {
    const line = lines.get(slug);
    if (line.out || line.waiting.length === 0) return;
    // A microtask's wait, so that the asks of one gesture (a block checking several at once) go together.
    line.out = Promise.resolve().then(() => send(slug, line)).catch(() => {}).finally(() => {
      line.out = null;
      if (line.waiting.length > 0) run(slug);
      else lines.delete(slug);
    });
  }

  function write(ask) {
    return new Promise((resolve) => {
      if (!lines.has(ask.slug)) lines.set(ask.slug, { waiting: [], out: null });
      lines.get(ask.slug).waiting.push({ ask, resolve });
      run(ask.slug);
    });
  }

  return {
    write,
    async idle() {
      for (;;) {
        const out = [...lines.values()].map((line) => line.out).filter(Boolean);
        if (out.length === 0) return;
        await Promise.all(out);
      }
    },
    listen() {
      const take = (event) => {
        const { ask, answer } = event.detail ?? {};
        if (event.defaultPrevented || !ask || typeof answer !== "function") return;
        event.preventDefault();
        answer(write(ask));
      };
      addEventListener(TODO_EVENT, take);
      return () => removeEventListener(TODO_EVENT, take);
    },
  };
}
