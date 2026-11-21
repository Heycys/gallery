import "./workspace-env.mjs";
import { JSDOM } from "jsdom";
import { captureLayout, newContainer, newHost, prepareBlock, removalTarget, takeOut } from "../../src/editor/page/core.mjs";
import { createCommits } from "../../src/editor/page/commit.mjs";
import { createAutosave, pendingKey } from "../../src/editor/page/autosave.mjs";
import { commitEdits, hashOf, instrument, revertCheck } from "../../src/editor/source.mjs";

// The editor's page as the unit tests run it: in jsdom, its commits (commit.mjs) and autosave
// (autosave.mjs) against the server's side (commitEdits), with the browser around it played: the
// network (a commit's answer delivered, held, lost after the file was written, refused as busy, or
// the server unreachable), localStorage, the clock (moved by hand: advance) and reloads (counted).
// play() puts the browser in place of Node's globals; stop() gives them back.

/** A report's source around `body`. */
export const page = (body) => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>报告</title></head><body>
<main class="doc-page" data-doc-id="demo">
  <header class="doc-header"><h1 class="doc-title">报告</h1></header>
${body}</main>
</body></html>
`;

/** What the endpoint seals a deleted unit with (a keyed hash there). */
export const seal = (source) => hashOf(`test:${source}`);

const GLOBALS = ["setTimeout", "clearTimeout", "fetch", "addEventListener", "getSelection", "location", "sessionStorage", "scrollX", "scrollY", "DOMParser"];
const { DOMParser } = new JSDOM("").window; // recover() takes up what a page that is gone knew in a document of its own
const realNow = Date.now;
const realImmediate = setImmediate;
let saved = null;

export const clock = { now: 1_000_000, timers: [], serial: 0 };
export const browser = { reloads: 0, onReload: null, route: null };

/** The browser in place of Node's globals (timers, fetch, location…), until stop(). */
export function play() {
  saved = Object.fromEntries(GLOBALS.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Object.assign(globalThis, {
    setTimeout: (fn, ms = 0) => {
      clock.timers.push({ id: ++clock.serial, at: clock.now + Math.max(0, ms), fn });
      return clock.serial;
    },
    clearTimeout: (id) => { clock.timers = clock.timers.filter((timer) => timer.id !== id); },
    fetch: (url, init) => browser.route.fetch(url, init),
    addEventListener: () => {},
    getSelection: () => ({ rangeCount: 0 }),
    location: { reload: () => { browser.reloads += 1; browser.onReload?.(); } },
    sessionStorage: { setItem() {}, getItem: () => null, removeItem() {} },
    scrollX: 0,
    scrollY: 0,
    DOMParser,
  });
  Date.now = () => clock.now;
}

/** Node's globals back. */
export function stop() {
  for (const [name, descriptor] of Object.entries(saved ?? {})) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
  Date.now = realNow;
  clock.timers = [];
  saved = null;
}

// Let promises run (the network's answers, the page's awaits).
const settleTasks = async () => {
  for (let index = 0; index < 20; index++) await new Promise((resolve) => realImmediate(resolve));
};

/** Let promises run, then the timers due by `ms` from now, in order. */
export async function advance(ms = 0) {
  const end = clock.now + ms;
  for (;;) {
    await settleTasks();
    const due = clock.timers.filter((timer) => timer.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
    if (!due) break;
    clock.timers = clock.timers.filter((timer) => timer !== due);
    clock.now = Math.max(clock.now, due.at);
    due.fn();
  }
  clock.now = end;
  await settleTasks();
}

const response = (status, json) => ({ status, json: async () => json });

/**
 * The preview server: the file, and how the next commit's answer goes (`mode`: "deliver", "lose":
 * written but the answer never arrives, "busy", "offline"; a commit taken in goes back to
 * "deliver"; `once`: whatever the mode, only the next commit has it), `gate`: a promise the answer
 * waits for. As the real one, it keeps the answer to each
 * commit by its id and gives it again to the same commit, and knows the versions pages opened on.
 */
export function server(source) {
  const state = { file: source, mode: "deliver", gate: null, revertGate: null, posts: [], receipts: new Map(), served: new Map([[hashOf(source), source]]) };
  state.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    state.posts.push({ url: String(url), body });
    if (String(url).includes("/reverted")) {
      if (state.revertGate) await state.revertGate;
      const opening = state.served.get(body.opening) ?? null;
      return response(200, { ok: true, version: hashOf(state.file), ...revertCheck({ current: state.file, opening, texts: body.texts ?? [], units: body.units ?? [], instances: body.instances ?? [], pageIds: body.pageIds ?? null, taken: body.taken ?? [] }) });
    }
    const mode = state.mode;
    if (state.once && mode !== "deliver") { // a mishap of the next commit only
      state.mode = "deliver";
      state.once = false;
    }
    if (mode === "offline") throw new TypeError("Failed to fetch");
    if (mode === "busy") return response(409, { ok: false, reason: "busy" });
    if (state.gate) await state.gate;
    const digest = JSON.stringify([body.opening, body.texts, body.units, body.touch]);
    const kept = body.request ? state.receipts.get(body.request) : null;
    if (kept) return kept.digest === digest ? response(200, { ...kept.answer, again: true }) : response(409, { ok: false, reason: "request" });
    const current = state.file;
    const { text, ...rest } = commitEdits({ current, ...body, opening: state.served.get(body.opening) ?? null, seal });
    state.file = text;
    const answer = { ok: true, ...rest, foreign: typeof body.known === "string" && hashOf(current) !== body.known, wrote: text !== current };
    if (body.request) state.receipts.set(body.request, { digest, answer });
    if (mode === "lose") {
      state.mode = "deliver";
      throw new TypeError("Failed to fetch"); // written; the answer is lost
    }
    return response(200, answer);
  };
  return state;
}

/** localStorage: `failing` makes every write fail. */
export function storage() {
  const items = new Map();
  return {
    items,
    failing: false,
    get(key) { return items.has(key) ? items.get(key) : null; },
    set(key, value) {
      if (this.failing) return false;
      items.set(key, value);
      return true;
    },
    remove(key) { items.delete(key); },
    keys() { return [...items.keys()]; },
  };
}

/**
 * A page opened on the file `net` serves now, editing, with its commits and its autosave, its
 * crash buffer in `local` (tab "tab"); `holding`, what holds off its being shown again, as the editor's
 * (autosave.mjs); `session`, its sessionStorage (storage()), where an earlier Gallery kept what it committed
 * across loads (the journal is in `local` now); `tab`, its tab's id. t.change(now): a change on the page, as
 * the editor reports it (`now`: a discrete one). `pull(t)`: the pull the page takes someone else's writes in
 * with (autosave.mjs `pull`; none: each shown by a reload), made once `t` is.
 */
export function open(net, local = storage(), { holding = () => false, session = null, tab = "tab", pull = null } = {}) {
  browser.route = net;
  const source = net.file;
  net.served.set(hashOf(source), source);
  const { html, map } = instrument(source);
  Object.assign(map, { slug: "demo", version: hashOf(source), token: "token" });
  const { document } = new JSDOM(html).window;
  const baselines = new Map();
  for (const block of map.blocks) baselines.set(block.id, prepareBlock(document.querySelector(`[data-ge-block="${block.id}"]`), block));
  let layout = captureLayout(document, map);
  const commits = createCommits({ root: document, map, baselines, units: new Map(), boxes: new Map(), getLayout: () => layout, setLayout: (next) => (layout = next) });
  const t = { document, map, commits, net, local, conflicts: [], warnings: [], failures: [], reverts: [], lapsed: [], changedAt: 0, baselines };
  t.autosave = createAutosave({
    map, commits, blocked: () => false, changedAt: () => t.changedAt, holding, refresh() {}, storage: local, tab: () => tab, session,
    applied: (result) => t.conflicts.push(...result.conflicts),
    failed: (reason) => t.failures.push(reason),
    warn: (kind) => t.warnings.push(kind),
    reverted: (entries) => t.reverts.push(...entries), // what someone else's write put back, as the editor is told
    lapsed: (keys) => t.lapsed.push(...keys), // and of that, what a later write no longer puts back
    listed: () => { t.listed += 1; }, // words added to what the page could not put back
    pull: pull ? (options) => (t.pull ??= pull(t))(options) : null,
  });
  t.listed = 0;
  t.change = (now = false) => {
    if (now) commits.marks(); // as the editor does after a structural change (undo among them)
    t.changedAt = clock.now;
    t.autosave.changed(now);
  };
  t.text = (words) => [...document.querySelectorAll("[data-ge-block], [data-ge-new]")].find((node) => node.textContent.includes(words));
  t.section = (title) => [...document.querySelectorAll("main section")].find((node) => node.querySelector("h2")?.textContent === title);
  t.buffer = () => JSON.parse(local.get(pendingKey("demo", tab)) ?? "null");
  return t;
}

/** A new list in `parent` after its last block: items of text, or [text, [sub-items]]. */
export function list(document, parent, items) {
  const box = newContainer(document, "bullets");
  for (const item of items) {
    const [text, subs] = Array.isArray(item) ? item : [item, null];
    const host = newHost(document, "item");
    host.textContent = text;
    if (subs) list(document, host, subs);
    box.append(host);
  }
  parent.append(box);
  return box;
}

/**
 * A block deleted as Backspace in its emptied host does it (typing/ removeHost): the unit that
 * goes with it (`removalTarget`: its list or quote when it was the last block there), taken out
 * as every deletion does (`takeOut`). Returns the unit removed.
 */
export const removeUnit = (element) => takeOut(removalTarget(element));
