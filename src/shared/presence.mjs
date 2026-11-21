// What the browser tells the server about what the reader has open (gallery status, since 2026-11-11):
// each workbench tab (a window of the workbench, one document or custom page open in it) reports itself to
// its server now and then (POST /__gallery/workspace/presence: src/workbench/app/session/presence.ts), the server keeps
// the reports in memory only (src/workbench/presence.mjs), and gallery status asks for them. Pure: the shape of a report, what
// it is cut to and how a report is read as the command prints it, shared by the browser, the server and the command.
//
// A report: { tab, entry, kind, title, visible, focused, touched, flags, notes, caret, selection } or { tab, gone: true }.
//   tab        the workbench tab's own name (made when it loads, kept until it closes)
//   entry      what is open, as the workbench names it: a document's slug ("weekly"), a draft of another workspace
//              ("~ws-abc123/weekly"), a custom page ("@home", or "@~ws-abc123/home" of another workspace)
//   kind       "document" or "page"
//   title      the title the reader sees (the page's, so one just typed counts)
//   visible    the tab is the one shown in its window; focused   the window has the focus
//   touched    the reader did something in it (a heartbeat is not): what "the last one used" goes by
//   flags      the page's save state (shared/session.mjs STATE_FLAGS: editing, pending, saving, offline, conflicts, unfit, changed)
//   notes      how many 批注 the page has
//   caret      { block (a data-block-id or null: a block the file has no id for yet), text (its words) } or null
//   selection  { blocks: [data-block-id…], text (the selected words, or the blocks' words), kind: "text" | "blocks" } or null
// What a word of it is cut to is below: the words the reader selected are the most private thing a report holds, so
// they are cut short and never leave the computer (the server answers only to this computer, and only with the token).

/** How long a tab's report counts after its last one (ms): the tab sends one every 20 s while it is open, one more as it closes. */
export const ALIVE_FOR = 90_000;
/** The most of a selection (and of a block's words) a report carries, in characters. */
export const WORDS_MOST = 200;
/** The most blocks a selection names. */
export const BLOCKS_MOST = 20;

const TAB = /^[a-z0-9]{4,40}$/;
const ENTRY = /^@?(?:~ws-[0-9a-f]{6}\/)?[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BLOCK = /^[a-z0-9]{8}$/;
// Not KINDS: the dev server's Vite config bundles the server's modules into one scope, and a second top-level KINDS
// renames qa-levels.mjs's, whose functions' text a page runs (layoutNotesScript): the page then names one it never had.
const PRESENCE_KINDS = new Set(["document", "page"]);

const bool = (value) => value === true;
const count = (value) => (Number.isInteger(value) && value > 0 ? Math.min(value, 9999) : 0);

/** `text` as a line of words: runs of white space as one space, the ends trimmed, cut to `most` ({ text, more: whether it was cut }). */
export function cutWords(text, most = WORDS_MOST) {
  const words = typeof text === "string" ? text.replace(/[​﻿]/g, "").replace(/\s+/g, " ").trim() : "";
  const chars = [...words];
  return chars.length > most ? { text: chars.slice(0, most).join(""), more: true } : { text: words, more: false };
}

const blockOf = (value) => (typeof value === "string" && BLOCK.test(value) ? value : null);

/**
 * A report as the server keeps it, or null when it is none: `{ tab, gone: true }` for a tab that closed; else the fields
 * above, each cut to what it may be (a block's id an id, a selection's words 200 characters, 20 blocks at most).
 */
export function cleanReport(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.tab !== "string" || !TAB.test(body.tab)) return null;
  if (body.gone === true) return { tab: body.tab, gone: true };
  if (typeof body.entry !== "string" || body.entry.length > 160 || !ENTRY.test(body.entry) || !PRESENCE_KINDS.has(body.kind)) return null;
  if ((body.kind === "page") !== body.entry.startsWith("@")) return null;
  const flags = body.flags && typeof body.flags === "object" ? body.flags : {};
  let caret = null;
  if (body.caret && typeof body.caret === "object") {
    const words = cutWords(body.caret.text);
    caret = { block: blockOf(body.caret.block), text: words.text };
  }
  let selection = null;
  if (body.selection && typeof body.selection === "object") {
    const words = cutWords(body.selection.text);
    const blocks = Array.isArray(body.selection.blocks) ? body.selection.blocks.map(blockOf).filter(Boolean).slice(0, BLOCKS_MOST) : [];
    selection = { kind: body.selection.kind === "blocks" ? "blocks" : "text", blocks, text: words.text, truncated: words.more, ...(Number.isInteger(body.selection.length) ? { length: Math.min(body.selection.length, 1e7) } : {}) };
  }
  return {
    tab: body.tab,
    entry: body.entry,
    kind: body.kind,
    title: cutWords(body.title, 200).text,
    visible: bool(body.visible),
    focused: bool(body.focused),
    touched: bool(body.touched),
    flags: { editing: bool(flags.editing), pending: bool(flags.pending), saving: bool(flags.saving), offline: bool(flags.offline), conflicts: count(flags.conflicts), unfit: count(flags.unfit), changed: bool(flags.changed) },
    notes: count(body.notes),
    caret,
    selection,
  };
}

/**
 * Where saving stands for a report's flags, the one word gallery status says: "conflict" (the reader has something to decide
 * on the page: a conflict, or content the document cannot hold), "offline" (commits do not get through), "pending" (changes wait
 * to be saved, or are on their way), else "saved".
 */
export function saveOf(flags) {
  if ((flags?.conflicts ?? 0) > 0) return "conflict";
  if (flags?.offline) return "offline";
  if (flags?.pending || flags?.saving) return "pending";
  return "saved";
}
