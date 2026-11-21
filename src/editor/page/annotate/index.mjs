import { documentKey, workspaceAddress } from "../../../shared/workspace-address.mjs";
import { CARD, RAIL, cardTops, markerLeft, markerTop, newAnnotationId, sameWords, squash, stackItems, tidy } from "../../../shared/annotations.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { SHARES_HEIGHT, standsAsPicture } from "../../components/registry.mjs";
import { caretAt, editable, select } from "../caret.mjs";
import { ordered } from "../block-info.mjs";
import { firstHost, isHost, unitElement } from "../core.mjs";
import { createFills } from "../fills.mjs";
import { reveal } from "../folded.mjs";
import { FOLLOW, task } from "../frames.mjs";
import { BAR } from "../handle-sizes.mjs";
import { MARGIN, margin, onMargin, rightRoom, setMargin } from "../margin.mjs";
import { note, own, provide } from "../overlays.mjs";
import { sectionOps } from "../page-objects.mjs";
import { placeBox } from "../placement.mjs";
import { ACROSS } from "../../../shared/table-across.mjs";
import { failure, postAnswer, postJson } from "../post.mjs";
import { keep, stored } from "../storage.mjs";
import { addStyle, fadeIn, still } from "../ui.mjs";
import { annotatable, blockSelection, locate, textSelection, tighten } from "./anchors.mjs";
import { HOT, MARK, STYLE, barNode, cardNode, fitField, layerNode, markerNode } from "./card.mjs";

// 批注 on the page (docs/editor.md "Annotations"; the workbench's button, docs/workbench.md): the
// reader's suggestions for a local Agent, each about words of the report or blocks of it, kept by the
// server in <workspace>/<slug>/annotations.json (editor/annotations.mjs), never in the document's HTML. They run
// from the editor's start on every page of a session: read from the server once the page is ready, its
// start never waiting for them, and a page with none has no layer, no observer and no pointer listener.
// With some, their cards or markers and the marks on their words are drawn from then on.
//
// They show in one of two forms, by the room at the column's right (margin.mjs: its `cards`). With
// room every annotation the page shows stands as a card in the margin, beside what it is about
// (shared/annotations.mjs cardTops), and its words are edited right there. One stands in front while
// its field has the focus, or from a press on its marked words or the workbench's list until a press
// elsewhere (a caret in the words stays in them), pulled back beside its anchor; a new one opens so,
// and one opened for writing with its anchor's first line out of the window stands in the window. No
// button stands beside a block meanwhile. In a detail card, where the margin
// is not the page's, there are none. With no room what follows holds: a marker for each, and one card
// shown by its words or blocks. The form follows each width at once, a card being written keeping its
// field, its caret and its words as it goes from one to the other.
//
// One is started on purpose: from the format bar (words selected, in a block or across blocks), the
// button beside a block (handle/, right of its middle line: that block, or all those selected when it
// is one of them) or Ctrl+Alt+M (the words selected, else the blocks selected, else the caret's block,
// else the card of the marked words the caret is in). A block that has an annotation takes none of its
// own (annotated(): no button), its card or marker being the way to what is there, though words in it can be selected and annotated. No selection
// offers anything by itself. Its card opens with the caret in its field and its words keeping a warm
// mark (blocks, the fill selected blocks have, in a warm colour: fills.mjs): words have it where the
// format bar stood (below their last line, by their last character), blocks at the last one's bottom
// right (at the window's bottom where that is below it), always inside the column. It exists once
// something is typed in it (white space is nothing): a card left with none leaves nothing, and a saved
// one emptied goes as its card closes, offered back as its delete button's is (an annotation has words:
// the user's, 2026-11-06); typing saves it (500ms after the last key, at once when it closes; a text
// with no words never: the file keeps its last words while the card is open); a press elsewhere, Esc, Enter, Tab or Ctrl+Alt+M close it into a marker
// in the column's right gutter, at its first line or the middle of its several blocks (right of a
// section's strip for what is in that section; the place the button beside a block stands on:
// markerSpot(), which says no where a marker stands already). Closed
// by a key the caret goes back to its words, or to its blocks where the keys opened it; a card of
// blocks the pointer opened places none. Resting on a marker (or clicking it) shows its card again
// where it was written, by its words, which light up, and it stays while the pointer goes over to it.
// The button at a card's right deletes it, and so does emptying it, or its words or blocks going. One card shows at a time, and starting on the words of an annotation already there shows its
// card rather than a second one. The workbench's list asks for the page's annotations (rows()) and
// goes to one (goTo()): what hides it opened, the page scrolled to it, its card shown as resting on its
// marker shows it, until a press elsewhere or the words leave the window. Markers stack without
// overlapping (shared/annotations.mjs stackItems), never past the page's end. While the page has one,
// the page's right side (margin.mjs) is told so: it gives their cards room where it can. Nothing in a
// detail card's dialog (v1).
//
// An annotation goes with its words. The page follows them through the reader's edits: found as they
// are (as the anchor says them now, or as it said them earlier in this visit: an undo), else where the
// reader's edit took them (the live range of the words, which grows with what is typed into them and
// shrinks with what is deleted of them: gone only when nothing of them is left), else as the server
// finds them (edited in part where they stood). What the page follows is told to the server right
// before the commit that writes the edit (autosave's `before`: `sync`), so the server's check after it
// finds the words as they are; the server's own rule, for writes the page did not make (an Agent's),
// stays strict (shared/annotations.mjs findQuote). When its words or blocks are deleted it is deleted
// with them: on the page at once (it no longer shows), in the file by the server's check; an undo that
// brings the words back while the page is open brings it back. Its blocks get their ids through the
// page's commits (commits.idFor: named with the next one), and until the file holds them the server
// keeps a new annotation as it was sent (editor/annotations.mjs).
//
// Given: slug, token (the map's); isEditing(); picked() (the blocks selected); unpick() (the blocks
// selected and text selected across blocks let go); wholePage() (the blocks Ctrl+A's top step selects,
// select-all/: the whole page takes none); crossTexts() (text selected across blocks, text-select/:
// [{ host, range }] or null); idFor(element) (the id a block has or is to have in the file); changed()
// (how many there are changed: the workbench hears it); removed(items) (one deleted from its card: the
// workbench offers it back); say(text, kind).

const ROUTE = "/__gallery/edit/annotations";
const SAVE_AFTER = 500; // typing saves this long after the last key
const HOVER_IN = 150; // resting on a marker this long shows its card
const HOVER_OUT = 300; // the card shown by hover goes this long after the pointer left it and its marker (unless it is on its way to the card)
const REVEAL = 64; // a card pressed in the margin brings what it is about this far into the window, out of it
const TOP_ROOM = 52; // no marker above this (the page's top)
const END_ROOM = 16; // nor nearer the page's end than this
const SAME_LINE = 4; // annotations whose lines are this near stand in one row: the column further right first
const SYNC_WAIT = 1500; // the most a commit waits for the anchors it changes to be told
const HISTORY = 12; // the anchors each annotation had in this visit, the latest kept (an undo finds them as they were)
// Where a card stands by words: the format bar's place (format-bar/bar.mjs GAP_X, GAP_Y: its corner
// 4px right of the last character, 8px below its line or above the words), and 12px inside the window.
const GAP_X = 4;
const GAP_Y = 8;
const EDGE = 12;
// Blocks' card at the window's bottom stands above the notices there (notices.mjs, the workbench's
// toast: 24px up, about 37px tall, the selection's line while blocks are selected), 8px clear.
const NOTICE_ROOM = 70;
// The blocks of what takes its height from the tallest beside it: one growing there moves what is below
// it with no change of the page's height, and says so by its own size.
const IN_ROW = [...SHARES_HEIGHT].map((kind) => `[data-ge-unit-kind="${kind}"] > *`).join();

export function createAnnotate({ slug, token, isEditing, picked, unpick = () => {}, wholePage = () => [], crossTexts, idFor, changed = () => {}, removed = () => {}, say }) {
  const stashKey = `gallery-edit:${documentKey(slug)}:notes`; // what could not be saved (offline), sent by the next page that reads them
  let reading = null; // the first read from the server, under way or done (taken back when it failed)
  let counted = false; // that read is in and what it brought found: the page can say how many it has
  let items = new Map(); // id -> { id, created, updated, text, anchor } in page order, as the server last said, with the page's own changes
  let filed = new Map(); // id -> its text as the file last held it (the server's last answer): what 撤销 brings back of one emptied in its card
  let version = null; // the file's, as last read or written
  let toldAt = null; // when the removal by a gallery command the workbench was last told of happened (gallery notes remove)
  const lost = new Map(); // id -> an annotation a check deleted this visit (its words gone): back when an undo brings them back
  const timers = new Map(); // id -> the timer of its save (typed, not saved yet)
  const sending = new Set(); // ids whose save is on its way
  const made = new Map(); // id -> { kind, units, range, excerpt }: made on the page this visit, until its first save names its blocks
  const named = new Map(); // id -> its blocks' elements: saved with the ids the next commit gives them, until they carry them
  const history = new Map(); // id -> the anchors it had this visit ({ kind, blocks, quote, prefix, suffix }), oldest first
  let mutations = 0; // changes of the page's text seen
  const goneAt = new Map(); // id -> the change at which its words were no longer on the page (this visit)
  // id -> { range (its words, live: it follows the reader's edits), units (their blocks' elements),
  // excerpt ({ quote, prefix, suffix } as the page has them now), marker, bar, hidden, folded }
  const views = new Map();
  let layer = null;
  // id -> its card (cardNode), and what the margin last gave it ({ width, left, top, height }; `height`
  // 0: to be fitted and measured): all those standing in the margin, or the one shown.
  const cards = new Map();
  let standing = false; // the cards stand in the margin, else markers and the one card by its words
  let quiet = false; // the form just changed: what comes stands at once, no fade
  let laid = null; // what the margin was last laid out by: { front, left }
  let moves = false; // the margin's cards were laid out once: from now on they move
  let remeasure = true; // all of them to measure again (what may move them: the page's size, its structure), else those in `stale`
  const stale = new Set(); // ids found again since they were measured
  // The annotation whose card shows, or stands in front: { id, focus, hover, keys, located, side, begun,
  // opening, within }: `keys`, opened by the keys, which give the caret back; `located`, shown by
  // the workbench's list; `side`, by its words, "below" or "above" them, kept while it is written;
  // `begun`, new; `opening`, opened for writing and not laid out yet in
  // the margin; `within`, what it is laid out by there instead of its anchor, which is out of the window.
  let shown = null;
  let hot = null; // the id whose words are under the pointer
  let started = false; // the page has drawn once: a marker that comes from then on fades in, those it starts with just stand
  let resolved = false; // the views are found again for what the page shows now
  let everything = true; // all of them to find again (else only those whose blocks `touched` holds)
  const touched = new Set(); // nodes whose text changed since they were last found
  let placed = null; // { side }: where the card was last drawn by words
  let pointer = null; // { x, y, moved }: where the pointer last was over the page, and whether it moved to get there
  let hovering = null; // the id a marker's hover is waiting to show
  let hoverTimer = 0;
  let leaveTimer = 0;
  let saidError = false;
  let marksChanged = true; // what the marks are drawn from changed since they were last drawn
  let painted = null; // the annotation lit when they were
  let heard = false; // the server said what there is
  let roomAsked = null; // what the page's right side was last told (margin.mjs): whether there are any
  let observer = null;
  let resizer = null;
  let watched = null; // the blocks in a row `resizer` looks at
  let unmargin = null;
  const fills = createFills({ kind: "note fill", className: "ge-note-halo", stands: () => Boolean(shown) || (standing && Boolean(hot)) });
  const frames = task("annotate", { run: draw, fail: () => takeDown() });
  const wake = () => frames.wake();

  // The page's text changed: the anchors in what changed are found again (a block's id given or
  // taken, a structure changed: all of them), and measured; words typed in a line move nothing else
  // (their block's height changing says so: the page's, or that block's in a row, `resizer`).
  function observed(records) {
    let structure = false;
    for (const record of records) {
      if (record.type !== "characterData") remeasure = true;
      if (record.type === "attributes") {
        if (record.attributeName === "data-block-id") everything = true;
        continue; // a disclosure opened, a tab shown: only where things are
      }
      if (record.type === "childList") structure = true;
      touched.add(record.target);
    }
    if (structure) watchRows();
    mutations++;
    resolved = false;
    wake();
  }

  // ---------- the server ----------
  let chain = Promise.resolve();
  const send = (body) => {
    const run = chain.then(() => postAnswer(ROUTE, token, { slug, ...body }));
    chain = run.catch(() => {});
    return run;
  };
  const fetchAll = () => fetch(workspaceAddress(`${ROUTE}?slug=${encodeURIComponent(slug)}`), { headers: { "X-Gallery-Token": token }, cache: "no-store" })
    .then((response) => response.json()).catch(() => ({ ok: false, reason: "offline" }));
  const wire = (item) => ({ id: item.id, created: item.created, updated: item.updated, text: item.text, anchor: item.anchor });

  // What the server says the file holds now: taken in, what the reader is typing kept as typed, what
  // it made and has not saved yet kept, what a check deleted kept aside for an undo.
  function take(answer) {
    if (!answer?.ok) return false;
    heard = true;
    version = answer.version;
    const dropped = new Set(answer.dropped ?? []);
    filed = new Map((answer.items ?? []).map((item) => [item.id, item.text]));
    const next = new Map();
    for (const item of answer.items ?? []) {
      const mine = items.get(item.id);
      if (mine?.anchor && !sameWords(mine.anchor, item.anchor)) remember(item.id, mine.anchor);
      next.set(item.id, mine && (timers.has(item.id) || shown?.id === item.id) ? { ...item, text: mine.text } : item);
      lost.delete(item.id);
    }
    for (const [id, item] of items) {
      if (next.has(id)) continue;
      if (made.has(id) || sending.has(id) || timers.has(id) || (shown?.id === id && writing())) next.set(id, item);
      else if (dropped.has(id)) lost.set(id, { item, at: mutations });
    }
    items = next;
    resolved = false;
    everything = true;
    remeasure = true;
    marksChanged = true; // done ones are drawn quietly
    if (items.size > 0) followText();
    wake();
    changed();
    // An Agent removed some at the reader's word (gallery notes remove): offered back as a card's delete button's is.
    const gone = answer.commandRemoved;
    if (gone?.items?.length > 0 && gone.at !== toldAt) {
      toldAt = gone.at;
      removed(gone.items);
    }
    return true;
  }

  // What the server holds read, what waits in the browser sent: once, unless it could not be read.
  async function read() {
    if (!take(await fetchAll())) {
      reading = null;
      return;
    }
    await sendStash();
    if (items.size > 0 && !resolved) resolveAll();
    counted = true;
    changed();
    note("annotate", "read");
  }

  // An anchor it had: found as it was again when an undo brings those words back.
  function remember(id, anchor) {
    if (!anchor || anchor.kind !== "text") return;
    const list = history.get(id) ?? [];
    if (list.some((other) => sameWords(other, anchor))) return;
    list.push(anchor);
    if (list.length > HISTORY) list.shift();
    history.set(id, list);
  }

  function failed(answer, item) {
    if (answer.reason === "offline") {
      stash(item);
      if (!saidError) say(t("批注没能保存：{0}", t("连不上本地服务")), "error");
    } else if (!saidError) say(t("批注没能保存：{0}", failure(answer, answer.reason ?? "")), "error");
    saidError = true;
  }

  // What could not be saved waits in the browser, sent the next time they are read (each once, as last
  // typed, with when: the server keeps a newer text). A later save or delete of it that reaches the
  // server takes it out, so an old text never comes back over a newer one.
  const stash = (item) => {
    const waiting = stored(stashKey, [], Array.isArray).filter((other) => other?.id !== item.id);
    keep(stashKey, [...waiting, wire(item)]);
  };
  const unstash = (id) => {
    const waiting = stored(stashKey, [], Array.isArray);
    if (waiting.some((other) => other?.id === id)) keep(stashKey, waiting.filter((other) => other?.id !== id));
  };
  async function sendStash() {
    const waiting = stored(stashKey, [], Array.isArray);
    if (waiting.length === 0) return;
    const answer = await send({ restore: waiting });
    if (answer.ok) {
      keep(stashKey, []);
      take(answer);
    }
  }

  // The anchor of an annotation's words or blocks as the page has them now, its blocks named (their
  // ids, or those the next commit gives them).
  function anchorOf(id, record = made.get(id)) {
    const view = views.get(id);
    const kind = record?.kind ?? items.get(id)?.anchor?.kind;
    const units = (view?.units ?? record?.units ?? []).filter((unit) => unit.isConnected);
    const blocks = units.map((unit) => idFor(unit)).filter(Boolean);
    if (kind === "text") return { kind: "text", blocks, ...(view?.excerpt ?? record.excerpt) };
    return { kind: "blocks", blocks, quote: record?.excerpt.quote ?? items.get(id)?.anchor?.quote ?? "" };
  }

  function schedule(id) {
    clearTimeout(timers.get(id));
    timers.set(id, setTimeout(() => save(id), SAVE_AFTER));
  }

  // Taken away in the file (its delete button, a new one taken back).
  async function remove(id) {
    const answer = await send({ remove: id });
    if (answer.ok) {
      unstash(id);
      take(answer);
    }
    return answer;
  }

  // Save it now: made (its first save) or changed; never with no words (left so, it goes: close).
  async function save(id) {
    clearTimeout(timers.get(id));
    timers.delete(id);
    const item = items.get(id);
    if (!item) return;
    if (!item.text.trim()) return; // no words: nothing to save, the file keeps its last words
    if (!item.anchor) {
      if (!made.has(id)) return;
      item.anchor = anchorOf(id);
    }
    sending.add(id);
    const answer = await send({ put: wire(item) });
    sending.delete(id);
    if (!answer.ok) return failed(answer, item);
    saidError = false;
    unstash(id);
    const record = made.get(id);
    if (record) named.set(id, views.get(id)?.units ?? record.units);
    made.delete(id);
    take(answer);
  }

  // ---------- telling the server where the words went ----------

  // The anchors that followed the reader's edit since the server last heard of them: { id: anchor }, or null.
  function followed() {
    if (items.size === 0) return null;
    if (!resolved) resolveAll();
    const out = {};
    for (const [id, item] of items) {
      if (made.has(id) || sending.has(id) || lost.has(id) || item.anchor?.kind !== "text") continue;
      const view = views.get(id);
      if (!view?.excerpt || view.unknown) continue;
      const blocks = view.units.map((unit) => unit.getAttribute("data-block-id") ?? "");
      if (sameWords({ kind: "text", blocks, ...view.excerpt }, item.anchor)) continue;
      out[id] = anchorOf(id);
    }
    return Object.keys(out).length > 0 ? out : null;
  }

  /**
   * Tell the server where annotations' words went with the reader's edits (autosave calls it right
   * before a commit goes, so the check after that commit finds them as they are). Resolves once it
   * has heard (SYNC_WAIT at most), or at once when nothing changed.
   */
  function sync({ keepalive = false } = {}) {
    const anchors = followed();
    if (!anchors) return null;
    if (keepalive) {
      postJson(ROUTE, token, { slug, anchors }, { keepalive: true }).catch(() => {});
      return null;
    }
    const told = send({ anchors }).then((answer) => {
      if (!answer.ok) return;
      version = answer.version;
      for (const [id, anchor] of Object.entries(anchors)) {
        const item = items.get(id);
        if (!item) continue;
        remember(id, item.anchor);
        item.anchor = answer.items?.find((each) => each.id === id)?.anchor ?? anchor;
      }
      note("annotate", "anchors told");
    });
    return Promise.race([told, new Promise((resolve) => setTimeout(resolve, SYNC_WAIT))]);
  }

  /** Save what is typed and not saved yet, now (Ctrl+S, the workbench's save, the page closing: `keepalive`). */
  function flush({ keepalive = false } = {}) {
    // What was typed, and one begun and not saved yet; one with no words saves nothing (save), and one
    // the file has keeps its last words (the page going, no 撤销 could be offered for its going).
    const ids = [...new Set([...timers.keys(), ...[...made.keys()].filter((id) => !sending.has(id))])];
    if (keepalive) {
      sync({ keepalive: true });
      for (const id of ids) {
        clearTimeout(timers.get(id));
        timers.delete(id);
        const item = items.get(id);
        if (!item?.text.trim()) continue;
        if (!item.anchor && made.has(id)) item.anchor = anchorOf(id);
        postJson(ROUTE, token, { slug, put: wire(item) }, { keepalive: true }).catch(() => {});
      }
      return Promise.resolve();
    }
    return Promise.all([...ids.map(save), sync()]).then(() => chain);
  }

  // ---------- what can be annotated ----------

  // In a detail card's dialog, where nothing is annotated (v1) and the margin is not the page's.
  const inDialog = (node) => Boolean(node?.closest?.("dialog"));

  // Text that can be: the body's, a header's lines but its title (v1: none on the title or the page as
  // a whole), not a tab's name, nothing in a detail card's dialog (v1).
  const annotatableText = (host) => host && host.closest("main") && host.getAttribute("data-ge-kind") !== "title" && !host.closest(".doc-title, .doc-sheet-tabs, dialog");

  // Whether blocks are of what can be, looked at without reading their text: none in a detail card's
  // dialog (v1), nor the whole page (Ctrl+A to the top, v1).
  function annotatableBlocks(list) {
    if (list.length === 0 || list.some(inDialog)) return false;
    if (list.length > 1) {
      const page = wholePage();
      const set = new Set(list);
      if (page.length > 1 && page.every((unit) => set.has(unit))) return false;
    }
    return list.some(annotatable);
  }

  // Whether a block has an annotation, of its words or of it whole (or one being written): it takes
  // none of its own. Its marker is how to reach what is there; words in it can
  // still be selected and annotated.
  function annotated(unit) {
    if (items.size === 0) return false;
    if (!resolved) resolveAll();
    for (const view of views.values()) if (view.units?.includes(unit)) return true;
    return false;
  }

  // Whether these blocks can take an annotation, one for them all: blocks that can be, one of them
  // at least with none yet.
  const canBlocks = (list) => annotatableBlocks(list) && list.some((unit) => annotatable(unit) && !annotated(unit));

  // What is selected now, as an anchor: { kind, units, range, excerpt }, or null where it can take
  // none (white space alone, the title…).
  function selected() {
    const list = picked();
    if (list.length > 0) return canBlocks(list) ? blockSelection(list) : null;
    const texts = crossTexts();
    if (texts?.length) {
      if (texts.some(({ host }) => inDialog(host))) return null;
      const range = document.createRange();
      range.setStart(texts[0].range.startContainer, texts[0].range.startOffset);
      range.setEnd(texts.at(-1).range.endContainer, texts.at(-1).range.endOffset);
      return textSelection(range);
    }
    const selection = getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return null;
    const range = selection.getRangeAt(0);
    const host = editable(range.commonAncestorContainer) ?? editable(range.startContainer);
    return annotatableText(host) && host.contains(range.endContainer) ? textSelection(range.cloneRange()) : null;
  }

  // The block the caret is in, as an anchor, or null.
  function caretBlock() {
    const selection = getSelection();
    const host = selection?.rangeCount ? editable(selection.anchorNode) : null;
    const unit = annotatableText(host) ? unitElement(host) : null;
    return unit && canBlocks([unit]) ? blockSelection([unit]) : null;
  }

  // The annotation whose marked words hold the caret, its id, or null.
  function markedAtCaret() {
    const selection = getSelection();
    if (!selection?.rangeCount) return null;
    for (const [id, view] of views) {
      if (!view.folded && view.range?.isPointInRange(selection.anchorNode, selection.anchorOffset)) return id;
    }
    return null;
  }

  // ---------- writing ----------

  // A card's field has the focus (a card being written); `shown.focus` follows it.
  const focused = () => Boolean(document.activeElement?.closest?.(".ge-note-card"));
  const writing = () => Boolean(shown) && focused();
  // A new one with no words (made on the page, not saved yet, nothing typed but white space): no
  // annotation yet: no marker, no count, no row; left so, it leaves nothing (close).
  const drafted = (id) => made.has(id) && !(items.get(id)?.text ?? "").trim();

  // The annotation already on `selection` (the same words or blocks), or undefined.
  function sameAs(selection) {
    if (!resolved) resolveAll();
    return [...items.values()].find((item) => {
      const view = views.get(item.id);
      const quote = view?.excerpt?.quote ?? item.anchor?.quote;
      return !lost.has(item.id) && view && item.anchor?.kind === selection.kind && squash(quote) === squash(selection.excerpt.quote)
        && selection.units.every((unit) => view.units.includes(unit));
    });
  }

  // An annotation started on `selection`: its words keep the hot mark, its card the field with the
  // caret; on the words of one already there, its card. A card being written closes first. Blocks
  // selected and text selected across blocks give way to it (the status line that names them goes
  // with them). False when the field could not take the focus (show).
  function begin(selection, { keys = false } = {}) {
    const same = sameAs(selection);
    unpick();
    if (same) return show(same.id, { focus: true, keys });
    if (shown?.focus || focused()) close();
    const id = newAnnotationId();
    made.set(id, { kind: selection.kind, units: selection.units, range: selection.range, excerpt: selection.excerpt });
    const at = new Date().toISOString();
    items.set(id, { id, created: at, updated: at, text: "", anchor: null });
    shown = { id, focus: false, hover: false, begun: true };
    resolved = false;
    followText();
    note("annotate", "begun");
    return show(id, { focus: true, keys });
  }

  // An annotation's card, saying what the annotation says (what is being typed in it stays as it is).
  function cardOf(id) {
    const card = cards.get(id) ?? makeCard(id);
    const text = items.get(id)?.text ?? "";
    card.node.toggleAttribute("data-done", items.get(id)?.done === true);
    if (card.field.value !== text && document.activeElement !== card.field) {
      card.field.value = text;
      card.height = 0;
    }
    return card;
  }

  function makeCard(id) {
    const card = { ...cardNode(), width: null, left: null, top: null, height: 0, tall: 0 };
    const { node, field, erase: button } = card;
    node.dataset.note = id;
    cards.set(id, card);
    field.addEventListener("input", (event) => {
      const tall = fitField(node, field);
      if (tall !== card.tall) {
        card.tall = tall;
        card.height = 0;
        wake();
      }
      if (!event.isComposing) typed(id);
    });
    field.addEventListener("compositionend", () => typed(id));
    field.addEventListener("scroll", () => fitField(node, field), { passive: true });
    field.addEventListener("focus", () => focusIn(id));
    // A press elsewhere closes it, in the page or in the workbench (Chrome takes the focus from the field).
    field.addEventListener("blur", () => setTimeout(() => { if (!focused()) close(); }, 0));
    field.addEventListener("keydown", (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      const mod = event.ctrlKey || event.metaKey;
      const closing = (event.key === "Enter" && !event.shiftKey && !mod && !event.altKey) || event.key === "Escape" || (event.key === "Tab" && !mod && !event.altKey)
        || (mod && event.altKey && !event.shiftKey && event.code === "KeyM"); // the keys that opened it close it
      if (closing) {
        event.preventDefault();
        event.stopPropagation();
        backToText();
      }
    });
    // A press in a card edits it, the caret where pressed (at the end of its text for a press beside the
    // field), what it is about brought into the window. A press on its delete button moves nothing: the
    // card stays as it is until the click.
    node.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || button.contains(event.target)) return;
      if (standing && shown?.id !== id) bringAnchor(id);
      if (event.target !== field) {
        event.preventDefault();
        field.focus({ preventScroll: true });
        field.setSelectionRange(field.value.length, field.value.length);
      }
    });
    button.addEventListener("pointerdown", (event) => event.preventDefault());
    button.addEventListener("click", () => erase(id));
    // Under the pointer a card in the margin lights its words or blocks; one shown by hover stays.
    node.addEventListener("pointerenter", () => {
      clearTimeout(leaveTimer);
      if (standing) lightUp(id);
    });
    node.addEventListener("pointerleave", () => {
      if (standing) lightUp(null);
      else leaveSoon();
    });
    return card;
  }

  // The annotation under the pointer in the margin.
  function lightUp(id) {
    hot = id;
    paintMarks();
    wake();
  }

  // What a card pressed is about in the window, where it is out of it (REVEAL in from the window's edge).
  function bringAnchor(id) {
    const line = views.has(id) ? lineOf(views.get(id)) : null;
    const height = document.documentElement.clientHeight;
    if (line && (line.top < REVEAL || line.top > height - REVEAL)) scrollBy({ top: line.top - REVEAL, behavior: still() ? "instant" : "smooth" });
  }

  // A field took the focus: its card is the one written, whichever it was.
  function focusIn(id) {
    if (shown && shown.id !== id) close();
    shown ??= { id, focus: false, hover: false };
    shown.focus = true;
    shown.hover = false;
    shown.side ??= placed?.side ?? null; // by its words, on the side it stood when pressed (growing as it is written, it never jumps over them)
    wake();
  }

  // Its card shown; with `focus`, for writing (the caret at its end). False when the field could not
  // take the focus (a modal dialog over the page): an annotation just begun then goes as it came. The
  // card being written closes first (saved), the field keeping the focus.
  function show(id, { focus = false, hover = false, keys = false } = {}) {
    const item = items.get(id);
    if (!item) return false;
    clearTimeout(leaveTimer);
    clearTimeout(hoverTimer);
    hovering = null;
    if (shown && shown.id !== id && (shown.focus || focused())) close();
    const kept = shown?.id === id ? shown : null;
    shown = { ...kept, id, focus: kept ? kept.focus || focused() : false, hover: kept ? kept.hover && hover : hover, keys: keys || Boolean(kept?.keys) };
    if (focus) shown.opening = true;
    const card = cardOf(id);
    draw();
    if (!focus) return true;
    card.field.focus({ preventScroll: true });
    if (document.activeElement !== card.field) {
      if (drafted(id)) {
        items.delete(id);
        made.delete(id);
        dropView(id);
        shown = null;
        wake();
      }
      return false;
    }
    shown.focus = true; // as the focus event says, also when the field had it already (another card was written)
    shown.hover = false;
    const end = card.field.value.length;
    card.field.setSelectionRange(end, end);
    wake();
    return true;
  }

  function hide() {
    if (!shown || shown.focus || focused()) return;
    shown = null;
    wake();
  }

  // What 撤销 puts back of one going at the reader's word (its delete button, emptied and closed): as
  // it is, or, emptied in its card, with the words the file last held; null when the file never had it.
  function backOf(id) {
    const item = items.get(id);
    if (!item?.anchor) return null;
    const text = item.text.trim() ? item.text : filed.get(id);
    return text ? { ...wire(item), text } : null;
  }

  // An annotation gone at the reader's word, from the page and the file (one never saved leaves nothing).
  function forget(id) {
    const item = items.get(id);
    if (!item) return;
    items.delete(id);
    clearTimeout(timers.get(id));
    timers.delete(id);
    if (!made.has(id) || item.anchor) remove(id);
    made.delete(id);
    unstash(id);
    dropView(id);
  }

  // The card closes into its marker: what was typed saved at once. One left with no words is none: it
  // goes, from the page and the file, and one the file had is offered back as its delete button's is
  // (`removed`, with its last words). `drop`: it goes whatever it says (its delete button, which offers
  // it back itself). With room it goes back among the others.
  function close({ drop = false } = {}) {
    if (!shown) return;
    const { id } = shown;
    shown = null;
    const item = items.get(id);
    if (item && (drop || !item.text.trim())) {
      const back = drop ? null : backOf(id);
      forget(id);
      if (back) removed([back]);
    } else if (item && (timers.has(id) || !item.anchor)) save(id);
    changed();
    wake();
  }

  // A card's delete button: its annotation goes at once, and the workbench offers it back (emptied in
  // its card, with the words the file last held). One never saved leaves nothing to bring back.
  function erase(id) {
    const item = items.get(id);
    if (!item) return;
    const was = backOf(id);
    if (shown?.id !== id) {
      forget(id);
      changed();
      wake();
    } else if (focused()) backToText({ drop: true });
    else close({ drop: true });
    if (was) removed([was]);
  }

  // Esc, Enter, Tab, Ctrl+Alt+M: the caret back in the page, at the end of the words, collapsed, or at
  // the end of the last block where the keys opened the card; of blocks the pointer opened it on there
  // was no caret to give back, and the page stays where it is.
  function backToText({ drop = false } = {}) {
    const view = views.get(shown?.id);
    const range = view?.range;
    const host = range ? editable(range.endContainer) : null;
    if (range && host) {
      host.focus({ preventScroll: true });
      const caret = range.cloneRange();
      caret.collapse(false);
      select(caret);
    } else if (shown?.keys && view?.units?.length) {
      const last = view.units.at(-1);
      const text = isHost(last) ? last : firstHost(last);
      if (text) caretAt(text, "end");
    }
    if (focused()) document.activeElement.blur();
    close({ drop }); // whether or not the field heard its blur (a window without the system's focus)
  }

  // What was typed: kept and saved soon; not while an input method composes (its letters are no
  // words yet), but when it ends.
  function typed(id) {
    const field = cards.get(id)?.field;
    const item = items.get(id);
    if (!field || !item || item.text === field.value) return;
    const was = drafted(id);
    item.text = field.value;
    item.updated = new Date().toISOString();
    schedule(id);
    changed();
    if (!standing || was !== drafted(id)) wake();
  }

  // Whether the pointer is over `box` (window coordinates), as last seen.
  const under = (box) => Boolean(pointer && box) && pointer.x >= box.left && pointer.x <= box.right && pointer.y >= box.top && pointer.y <= box.bottom;
  // How far the pointer is from the card (Infinity when it is not over the page, or no card shows).
  function fromCard() {
    const node = cards.get(shown?.id)?.node;
    if (!pointer || !node?.isConnected) return Infinity;
    const box = node.getBoundingClientRect();
    return Math.hypot(Math.max(box.left - pointer.x, 0, pointer.x - box.right), Math.max(box.top - pointer.y, 0, pointer.y - box.bottom));
  }

  // The card shown by hover goes once the pointer has left it and its marker for HOVER_OUT: not while
  // it is over either again (what a still pointer's events say after the card was drawn), nor while it
  // is on its way from the marker to the card (nearer to it than when last looked: the marker stands
  // in the gutter, the card by its words).
  function leaveSoon() {
    clearTimeout(hoverTimer);
    clearTimeout(leaveTimer);
    hovering = null;
    if (!shown?.hover || shown.focus || focused()) return;
    let was = fromCard();
    leaveTimer = setTimeout(function away() {
      if (!shown?.hover || shown.focus || focused()) return;
      const marker = views.get(shown.id)?.marker;
      const node = cards.get(shown.id)?.node;
      const now = fromCard();
      if ((node?.isConnected && under(node.getBoundingClientRect())) || (marker?.isConnected && under(marker.getBoundingClientRect())) || now < was - 2) {
        was = now;
        leaveTimer = setTimeout(away, HOVER_OUT);
        return;
      }
      hide();
    }, HOVER_OUT);
  }

  // ---------- markers ----------
  function markerOf(id) {
    const view = views.get(id);
    if (view.marker) return view.marker;
    const node = own(markerNode(id), "note marker", { owner: null, alive: () => views.has(id) });
    node.addEventListener("pointerenter", () => {
      clearTimeout(leaveTimer);
      hot = id;
      paintMarks();
    });
    // Its card shows once the pointer rests on it, and only for a pointer that moved there: a marker
    // that came under a still pointer (the margin drawn again) opens nothing. Resting on another while
    // a card shows by hover switches at once. Never while a card is being written.
    node.addEventListener("pointermove", () => {
      if (!pointer?.moved) return;
      clearTimeout(leaveTimer);
      if (shown?.focus || focused() || shown?.id === id || hovering === id) return;
      clearTimeout(hoverTimer);
      if (shown?.hover) {
        show(id, { hover: true });
        return;
      }
      hovering = id;
      hoverTimer = setTimeout(() => {
        hovering = null;
        if (!shown?.focus && !focused()) show(id, { hover: true });
      }, HOVER_IN);
    });
    node.addEventListener("pointerleave", () => {
      if (hot === id) hot = null;
      paintMarks();
      leaveSoon();
    });
    node.addEventListener("pointerdown", (event) => event.preventDefault()); // the selection stays where it is
    node.addEventListener("click", () => show(id, { focus: true }));
    view.marker = node;
    return node;
  }

  // An annotation no longer on the page: its marker, bar and card go at once.
  function dropView(id) {
    const view = views.get(id);
    view?.marker?.remove();
    view?.bar?.remove();
    views.delete(id);
    cards.get(id)?.node.remove();
    cards.delete(id);
    laid = null;
    marksChanged = true;
  }

  // ---------- the workbench's list ----------

  // Where a view's words or blocks start, as a collapsed range: what page order compares.
  function startOf(view) {
    const at = document.createRange();
    if (view.range?.startContainer.isConnected) at.setStart(view.range.startContainer, view.range.startOffset);
    else at.setStartBefore(view.units.find((unit) => unit.isConnected));
    at.collapse(true);
    return at;
  }

  // One row per annotation the page shows, in page order: what it says, and its words (a block
  // annotation's, its blocks' as they read now).
  function rows() {
    if (!resolved) resolveAll();
    const listed = [...items.values()].filter((item) => views.has(item.id) && !drafted(item.id))
      .map((item) => ({ item, view: views.get(item.id), at: startOf(views.get(item.id)) }))
      .sort((a, b) => a.at.compareBoundaryPoints(Range.START_TO_START, b.at));
    return listed.map(({ item, view }) => {
      const words = view.range || view.unknown ? view.excerpt?.quote ?? item.anchor?.quote : blockSelection(view.units)?.excerpt.quote;
      return { id: item.id, text: item.text, quote: tidy(words), done: item.done === true };
    });
  }

  // An annotation brought to the reader: what hides it opened, the page scrolled to it (where it is out
  // of the window: to its upper middle, as search's hit), its card in front in the margin until a press
  // elsewhere; with no room, by its words, without the focus, and gone with them when they leave the
  // window (draw): the pointer never came to it to leave it. False where no card stands for it (in a
  // detail card's dialog, which is opened).
  function goTo(id) {
    if (!resolved) resolveAll();
    const view = views.get(id);
    if (!view || drafted(id)) return false;
    const start = view.range?.startContainer ?? view.units[0];
    reveal(start.nodeType === 1 ? start : start.parentElement); // a folded heading's section too (fold/)
    remeasure = true; // what was hidden stands now, before the observer says so
    const line = lineOf(view);
    if (!line) return false;
    if (line.top < TOP_ROOM || line.bottom > innerHeight - EDGE) scrollTo({ top: Math.max(0, scrollY + line.top - innerHeight * 0.35), behavior: "instant" });
    if (!show(id, { hover: !standing }) || !shown) return false;
    shown.located = true;
    return true;
  }

  // ---------- finding and drawing ----------

  // Where an annotation's words or blocks are on the page now: { range, units, excerpt } (range null
  // for blocks), `unknown` when it cannot be told, null when they are gone. Words: as they are, by
  // what the page last found them as, by what the file says, by what they were earlier this visit (an
  // undo); else where the reader's edit took them (their live range: typed into, partly deleted); else
  // as the server finds them (edited in part where they stood, or once elsewhere). `live`: the live
  // range may be used (not for what a check deleted: its words came back or they did not).
  function find(id, item, view, { live = true } = {}) {
    const record = made.get(id);
    const kind = item.anchor?.kind ?? record?.kind;
    if (kind === "blocks") {
      if (item.anchor) return locate(item.anchor, named.get(id) ?? null);
      const units = record.units.filter((unit) => unit.isConnected);
      return units.length > 0 ? { range: null, units } : null;
    }
    const candidates = [];
    if (view?.excerpt && view.units?.some((unit) => unit.isConnected)) candidates.push([{ kind: "text", blocks: [], ...view.excerpt }, view.units]);
    if (item.anchor) candidates.push([item.anchor, named.get(id) ?? null]);
    for (const anchor of [...(history.get(id) ?? [])].reverse()) candidates.push([anchor, null]);
    for (const [anchor, elements] of candidates) {
      const found = locate(anchor, elements, { exact: true });
      const words = found?.range && derive(found.range);
      if (words) return words;
    }
    const range = live ? view?.range ?? record?.range : null;
    const words = range && derive(range);
    if (words) return words;
    if (!item.anchor) return null;
    const found = locate(item.anchor, named.get(id) ?? null);
    if (!found || found.unknown) return found;
    return derive(found.range);
  }

  // A range of words as the page reads an anchor: its blocks, the words trimmed, what they say now.
  function derive(range) {
    const tight = tighten(range);
    const words = tight && textSelection(tight);
    return words && { range: words.range, units: words.units, excerpt: words.excerpt };
  }

  // Where each annotation is on the page now (those whose blocks the page's changes touched, or all);
  // what no longer is goes from it (a check deletes it in the file); what a check deleted that is
  // here again (an undo) is saved again, as it was.
  function resolveAll() {
    resolved = true;
    const all = everything;
    const changedNodes = [...touched];
    everything = false;
    touched.clear();
    const affected = (view) => !view.units?.length || view.unknown || view.units.some((unit) => !unit.isConnected
      || changedNodes.some((node) => node === unit || unit.contains(node) || node.contains(unit)))
      || (view.range && changedNodes.some((node) => view.range.intersectsNode(node)));
    for (const [id, item] of items) {
      const known = views.get(id);
      if (!all && known && !made.has(id) && !named.has(id) && !affected(known)) continue; // its blocks untouched: where it was
      const found = find(id, item, known);
      // Its blocks carry the ids it was saved with: found by them from now on.
      if (named.has(id) && item.anchor?.blocks.every((block, index) => named.get(id)[index]?.getAttribute("data-block-id") === block)) named.delete(id);
      const view = known ?? {};
      if (!found || (found.units?.length ?? 0) === 0) {
        // A new one with no words, not saved yet, is about nothing now: it goes with them, for no save to keep.
        if (drafted(id) && !item.anchor) {
          forget(id);
          if (shown?.id === id) shown = null;
          continue;
        }
        view.marker?.remove();
        view.bar?.remove();
        views.delete(id);
        marksChanged = true;
        if (!goneAt.has(id)) goneAt.set(id, mutations);
        continue;
      }
      if (found.unknown) views.set(id, { ...view, units: found.units, unknown: true });
      else views.set(id, { ...view, range: found.range, units: found.units, excerpt: found.excerpt ?? null, unknown: false });
      stale.add(id);
      marksChanged = true;
    }
    for (const [id, view] of views) {
      if (items.has(id)) continue;
      view.marker?.remove();
      view.bar?.remove();
      views.delete(id);
      marksChanged = true;
    }
    // Deleted by a check once its words left the page, and they are here again (an undo, before or after
    // the check's word came): it comes back as it was. One whose words the page never lost (an Agent's
    // write, shown once the page is shown again) does not.
    for (const [id, { item }] of lost) {
      if (!goneAt.has(id) || !find(id, item, null, { live: false })) continue;
      lost.delete(id);
      items.set(id, item);
      send({ put: wire(item) }).then((answer) => answer.ok && take(answer));
      resolved = false;
      everything = true;
      note("annotate", "back with its words");
    }
    changed();
  }

  function ensureLayer() {
    if (!layer?.isConnected) {
      addStyle(STYLE);
      layer = layerNode();
      document.body.append(layer);
    }
    followPage(true);
    return layer;
  }

  // The outermost closed disclosure `node` is hidden in (in its content, not its title, nor `node`
  // itself: it shows, as its title), or the folded heading whose section hides it (fold/: the
  // outermost, the heading its own title), whichever holds the other; null where neither hides it.
  function closedAround(node) {
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    let found = null;
    for (let details = element?.closest("details:not([open])"); details; details = details.parentElement?.closest("details:not([open])")) {
      if (details !== node && !details.querySelector(":scope > summary")?.contains(element)) found = details;
    }
    let marked = null;
    for (let at = element?.closest("[data-ge-folded]"); at; at = at.parentElement?.closest("[data-ge-folded]")) marked = at;
    const heading = marked && document.querySelector(`[data-ge-id="${CSS.escape(marked.getAttribute("data-ge-folded"))}"]`);
    if (!heading) return found;
    return found && found.contains(heading) ? found : heading;
  }

  // What stands for a closed disclosure or a folded section (closedAround): the disclosure's title, or
  // the heading itself, which has none.
  const titleOf = (closed) => closed.querySelector(":scope > summary") ?? closed;

  // The first line of `node` (window coordinates): { top, height, left }: of its first words; where a
  // picture standing as a block comes before them, the picture's top (as the handle's first line,
  // handle/: not its caption, far from there); its box's top where it holds neither.
  function firstLine(node) {
    const first = (each) => (each.nodeType === 3
      ? /\S/.test(each.data) && !each.parentElement?.closest("[data-doc-dev], [aria-hidden='true']")
      : standsAsPicture(each));
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: (each) => (first(each) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
    let top = node;
    for (let text; (text = walker.nextNode());) {
      if (text.nodeType === 1) {
        top = text;
        break;
      }
      const at = text.data.search(/\S/);
      const range = document.createRange();
      range.setStart(text, at);
      range.setEnd(text, at + 1);
      const rect = [...range.getClientRects()].find((each) => each.width > 0 && each.height > 0);
      if (rect) return { top: rect.top, height: rect.height, left: rect.left };
    }
    const rect = top.getBoundingClientRect();
    const lineHeight = parseFloat(getComputedStyle(node).lineHeight) || 26;
    const height = Math.min(lineHeight, rect.height || lineHeight);
    return { top: rect.top, height, left: rect.left };
  }

  // The line a view's marker stands by (window coordinates): { top, height, left, bottom (of all it
  // holds), box (what it stands for as shown) }, or null when it does not show: its first line, or all
  // of them for several blocks, from the first's top to the last's bottom, the marker at their middle.
  // In a closed disclosure (laid out though hidden), its title's line: checked first, as the hidden
  // text still has boxes; in a folded heading's section (fold/), the heading's.
  function lineOf(view) {
    const start = view.range?.startContainer ?? view.units?.find((unit) => unit.isConnected);
    if (!start?.isConnected) return null;
    const closed = closedAround(start);
    if (closed) {
      const summary = titleOf(closed);
      if (!summary?.getClientRects().length) return null;
      const box = summary.getBoundingClientRect();
      return { ...firstLine(summary), folded: true, box, bottom: box.bottom };
    }
    if (view.range) {
      const rects = [...view.range.getClientRects()].filter((each) => each.width > 0 && each.height > 0);
      const rect = rects[0];
      return rect ? { top: rect.top, height: rect.height, left: rect.left, bottom: Math.max(...rects.map((each) => each.bottom)) } : null;
    }
    const units = view.units.filter((unit) => unit.isConnected && unit.getClientRects().length);
    if (units.length === 0) return null;
    const first = units[0].getBoundingClientRect();
    const last = units.at(-1).getBoundingClientRect();
    const left = Math.min(...units.map((unit) => unit.getBoundingClientRect().left));
    const right = Math.max(...units.map((unit) => unit.getBoundingClientRect().right));
    const line = units.length > 1 ? { top: first.top, height: last.bottom - first.top, left } : firstLine(units[0]);
    return { ...line, box: { top: first.top, bottom: last.bottom, left, right }, bottom: last.bottom };
  }

  // The right edge of the column (of 分栏) a view's words stand in, or the page's: annotations in one
  // row stand the column further right first, the one beside the margin.
  function columnRight(view) {
    const start = view.range?.startContainer ?? view.units?.[0];
    const element = start?.nodeType === 1 ? start : start?.parentElement;
    const column = element?.closest(".doc-column");
    return column ? column.getBoundingClientRect().right : Infinity;
  }

  const highlights = () => globalThis.CSS?.highlights && globalThis.Highlight;

  // Whether a view's line (lineOf) shows it: what its mark goes by.
  function seen(view, line) {
    if (view.hidden !== !line || view.folded !== Boolean(line?.folded)) marksChanged = true;
    view.hidden = !line;
    view.folded = Boolean(line?.folded);
  }

  // The marks, drawn again only when something of them changed: a Highlight made anew repaints every
  // mark on the page.
  function paintMarks() {
    if (!highlights()) return;
    const hotId = shown?.id ?? hot;
    if (!marksChanged && painted === hotId) return;
    marksChanged = false;
    painted = hotId;
    const plain = [];
    const strong = [];
    for (const [id, view] of views) {
      if (!view.range || view.hidden || view.folded) continue;
      if (id !== hotId && items.get(id)?.done) continue; // acted on: the words are left unmarked
      (id === hotId ? strong : plain).push(view.range);
    }
    if (shown?.id && !views.has(shown.id) && made.get(shown.id)?.range) strong.push(made.get(shown.id).range);
    CSS.highlights.set(MARK, new Highlight(...plain));
    CSS.highlights.set(HOT, new Highlight(...strong));
    for (const [id, view] of views) {
      view.marker?.toggleAttribute("data-hot", id === hotId);
      view.marker?.toggleAttribute("data-done", items.get(id)?.done === true);
      view.bar?.toggleAttribute("data-hot", id === shown?.id || id === hot);
      view.bar?.toggleAttribute("data-done", items.get(id)?.done === true);
    }
  }

  function takeDown() {
    layer?.remove();
    layer = null;
    standing = false;
    laid = null;
    moves = false;
    cards.clear();
    fills.clear();
    followPage(false);
    marksChanged = true;
    for (const view of views.values()) { view.marker = null; view.bar = null; }
    if (highlights()) {
      CSS.highlights.delete(MARK);
      CSS.highlights.delete(HOT);
    }
  }

  // What a card stands by (window coordinates), or null when it does not show: words, their box and
  // where their last line ends ({ words, top, left, right: the last character's, bottom: the last
  // line's }); blocks, theirs ({ top, bottom and right: the last one's }); in a closed disclosure (laid
  // out though hidden), its title as a block; in a folded heading's section, the heading.
  function anchorBox(target) {
    const start = target.range?.startContainer ?? target.units?.find((unit) => unit.isConnected);
    if (!start?.isConnected) return null;
    const closed = closedAround(start);
    if (closed) {
      const summary = titleOf(closed);
      if (!summary?.getClientRects().length) return null;
      const box = summary.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, right: box.right };
    }
    if (target.range) {
      const rects = [...target.range.getClientRects()].filter((each) => each.width > 0 && each.height > 0);
      if (rects.length === 0) return null;
      const box = target.range.getBoundingClientRect();
      return { words: true, top: box.top, left: box.left, right: rects.at(-1).right, bottom: rects.at(-1).bottom };
    }
    const units = target.units.filter((unit) => unit.isConnected && unit.getClientRects().length);
    if (units.length === 0) return null;
    const last = units.at(-1).getBoundingClientRect();
    return { top: units[0].getBoundingClientRect().top, bottom: last.bottom, right: last.right };
  }

  // Where the card of `size` stands by `box` (anchorBox), inside the column and the window (window
  // coordinates): words have it where the format bar would stand (placeBox: below their last line, its
  // left by their last character, above them where the window has no room below); blocks at the last
  // one's bottom right, or at the window's bottom where that is below it (the visible part of a long
  // block; above the notices there, the selection's line), or above them where even their top is too
  // low for it. `side` ("below": by the words' last line, the blocks' bottom or the window's; "above"),
  // the side it stood on when pressed, is kept while it is written: a card growing with its text grows
  // from where it stands and never jumps over its words or blocks, held in the window (the caret in
  // it: typing never scrolls the page).
  function placeCard(box, size, column, side) {
    const height = document.documentElement.clientHeight || innerHeight;
    const inColumn = (left) => Math.max(column.left, Math.min(left, column.right - size.width));
    const inWindow = (top, room) => Math.max(EDGE, Math.min(top, height - room - size.height));
    if (box.words) {
      const origin = { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.right - box.left, height: box.bottom - box.top };
      const at = placeBox(origin, size, { x: box.right + GAP_X, gap: GAP_Y, margin: EDGE });
      const top = side === "below" ? inWindow(box.bottom + GAP_Y, EDGE) : side === "above" ? inWindow(box.top - GAP_Y - size.height, EDGE) : at.top;
      return { left: inColumn(at.left), top, side: side ?? (top >= box.bottom ? "below" : "above") };
    }
    const floor = height - NOTICE_ROOM - size.height; // the lowest its top goes in the window
    const chosen = side ?? (box.top <= floor ? "below" : "above");
    const top = chosen === "below" ? box.bottom + GAP_Y : box.top - GAP_Y - size.height;
    return { left: inColumn(Math.min(box.right, column.right) - size.width), top: inWindow(top, NOTICE_ROOM), side: chosen };
  }

  const pageColumn = () => document.querySelector("main.doc-page") ?? document.querySelector("main");
  const windowWidth = () => document.documentElement.clientWidth || innerWidth;
  // The lowest a marker reaches, the page's end being `bottom` (its content's, or the window's when that
  // is shorter).
  const pageEnd = (bottom) => Math.max(bottom, document.documentElement.clientHeight) - END_ROOM;

  // Whether a marker, or a card in the margin (10px from the column, where the button beside a block
  // would stand), stands on the 24px square at `spot` (window coordinates).
  const over = (box, spot) => Boolean(box) && box.left < spot.left + RAIL.marker && box.right > spot.left && box.top < spot.top + RAIL.marker && box.bottom > spot.top;
  const markerOn = (spot) => [...views.values()].some((view) => over(view.marker?.isConnected ? view.marker.getBoundingClientRect() : null, spot))
    || [...cards.values()].some((card) => over(card.node.parentNode === layer ? card.node.getBoundingClientRect() : null, spot));

  // The right edge what stands right of `units` goes by, the column's being `right`: a table among them placed
  // past the text (宽表格, the kit's tables/across.js) reaches past the column, and a marker or a bar of its
  // stands right of it, not over it (as far as the page's area at full width, whose gutter holds them as a page
  // read full width does).
  const pastText = (right, units = []) => Math.max(right, ...units.map((unit) => unit?.closest?.(`[${ACROSS}]`)?.getBoundingClientRect().right ?? -Infinity));

  // Where across the window a marker of `units` stands, the column's right edge being `right`: with any
  // of them in a section, past its strip, as far out as the pointer finds that (handle-sizes.mjs
  // BAR.reach), so that each keeps the pointer it is for, and within the column's right room (margin.mjs);
  // beside a table placed past the text, right of it (pastText).
  function markerAcross(right, units) {
    const section = units.map((unit) => sectionOps()?.sectionOf(unit)).find(Boolean);
    const reach = pastText(right, units);
    return markerLeft(reach, windowWidth(), section ? Math.min(section.getBoundingClientRect().right + BAR.gap + BAR.width + 2, right + rightRoom() - RAIL.marker) : 0);
  }

  // Where a marker of `unit` alone stands (window coordinates): the place of the button beside it
  // (handle/), which writing leaves a marker on, to the pixel. Null where the block does not show, or
  // a marker stands there already (stacked down from the block above, a closed disclosure's on its
  // title, a section's on its heading): the pointer there would be that marker's, so the block has no
  // button and keeps its handle and the shortcut; or a card does (in the margin, 10px from the column:
  // the block keeps 批注 in its menu and the shortcut); or while a card stands in front in the margin
  // (none while an annotation is selected).
  function markerSpot(unit) {
    if (standing && shown) return null;
    const page = pageColumn();
    const line = page && lineOf({ range: null, units: [unit] });
    if (!line) return null;
    const { top: origin, bottom } = document.documentElement.getBoundingClientRect();
    const [top] = stackItems([{ ideal: markerTop(line) - origin, height: RAIL.marker, marker: true, active: false }], { top: TOP_ROOM, bottom: pageEnd(bottom - origin) });
    const spot = { left: markerAcross(page.getBoundingClientRect().right, [unit]), top: top + origin };
    return markerOn(spot) ? null : spot;
  }

  // The right side of the page told whether it has any: until the server has said, what the page's
  // head was told stands.
  function askRoom() {
    const wanted = items.size > 0;
    if ((!heard && !wanted) || wanted === roomAsked) return;
    roomAsked = wanted;
    setMargin({ notes: wanted });
  }

  // A block anchor's bar beside its blocks (beside a closed disclosure's title when they are in it),
  // `left` across the layer, `origin` the layer's top in the window.
  function placeBar(id, view, line, left, origin) {
    if (!line || view.range) {
      view.bar?.remove();
      return;
    }
    view.bar ??= own(barNode(), "note bar", { alive: () => views.has(id) });
    if (view.bar.parentNode !== layer) layer.append(view.bar);
    Object.assign(view.bar.style, { transform: `translate(${Math.round(left)}px, ${Math.round(line.box.top - origin)}px)`, height: `${Math.max(2, Math.round(line.box.bottom - line.box.top))}px` });
    view.bar.toggleAttribute("data-hot", shown?.id === id || hot === id);
  }

  // The form changed: what the other left goes, and all of it is placed anew. A card being written keeps
  // its node, so its field, caret and words; one only looked at goes.
  function changeForm(stands) {
    standing = stands;
    quiet = true;
    layer.toggleAttribute("data-margin", stands);
    layer.removeAttribute("data-moves");
    laid = null;
    moves = false;
    remeasure = true;
    hot = null;
    placed = null;
    marksChanged = true;
    if (shown && !shown.focus && !shown.begun && !focused()) shown = null;
    if (shown) shown.opening = true;
    if (stands) for (const view of views.values()) view.marker?.remove();
    for (const card of cards.values()) Object.assign(card, { width: null, left: null, top: null, height: 0 });
  }

  // What a card is laid out by, down the layer: its anchor's first line, a new one's further down, or
  // the place in the window it was given as it opened.
  const laidBy = (id, view) => (shown?.id === id ? shown.within ?? view.top + (shown.begun ? CARD.draft : 0) : view.top);

  // A card opened for writing stands where the reader is looking: with its place out of the window (a
  // caret at the end of a long block, blocks selected across screens) it stands as far in as a card
  // pressed brings its anchor, and the page does not move for it, so that its first key does not either.
  // `origin`: the layer's top in the window. Returns whether that changed where it is laid out.
  function standWithin(origin) {
    const view = views.get(shown.id);
    if ((view?.top ?? null) === null) return false;
    const was = shown.within;
    shown.opening = false;
    shown.within = null;
    const top = laidBy(shown.id, view) - CARD.above + origin;
    if (top < 0 || top > document.documentElement.clientHeight - REVEAL) shown.within = REVEAL + CARD.above - origin;
    return shown.within !== was;
  }

  // With room: each annotation the page shows as a card right of the column, beside what it is about
  // (cardTops). What a key did not move is left alone: only those found again are measured until the
  // page's size or structure changed, and the cards are laid out only when a place, a height or the one
  // in front did. Their left is where the column is going, not where a slide has it now.
  function standCards({ left, column, cards: width }) {
    const origin = layer.getBoundingClientRect().top;
    let moved = false;
    for (const id of remeasure ? [...views.keys()] : [...stale]) {
      const view = views.get(id);
      if (!view) continue;
      const line = lineOf(view);
      seen(view, line);
      placeBar(id, view, line, left + column + RAIL.bar, origin);
      const top = line && !view.units?.some(inDialog) ? line.top - origin : null;
      if (top !== view.top) moved = true;
      view.top = top;
    }
    remeasure = false;
    stale.clear();
    for (const [id, card] of cards) {
      if ((views.get(id)?.top ?? null) !== null) continue;
      card.node.remove();
      cards.delete(id);
      moved = true;
    }
    if (shown && !cards.has(shown.id) && !focused()) shown = null;
    if (shown?.opening && standWithin(origin)) moved = true;
    for (const [id, view] of views) {
      if ((view.top ?? null) === null) continue;
      const card = cardOf(id);
      if (card.node.parentNode !== layer) {
        card.node.style.top = `${Math.round(laidBy(id, view) - CARD.above)}px`;
        layer.append(card.node);
        if (moves && !quiet) fadeIn(card.node);
      }
      if (card.width !== width) {
        card.width = width;
        card.node.style.width = `${width}px`;
        card.height = 0;
      }
      if (!card.height) {
        card.tall = fitField(card.node, card.field);
        card.height = card.node.offsetHeight;
        moved = true;
      }
    }
    const front = shown?.id ?? null;
    const across = Math.round(left + column + MARGIN.lane);
    if (!moved && laid?.front === front && laid?.left === across) return;
    laid = { front, left: across };
    const order = cardTops([...cards].map(([id, card]) => ({ id, height: card.height, created: items.get(id)?.created ?? "", top: laidBy(id, views.get(id)) })), front);
    order.forEach(({ id, top }, index) => {
      const card = cards.get(id);
      const at = Math.round(top);
      if (card.top !== at) card.node.style.top = `${(card.top = at)}px`;
      if (card.left !== across) card.node.style.left = `${(card.left = across)}px`;
      card.node.toggleAttribute("data-front", id === front);
      card.node.toggleAttribute("data-last", index === order.length - 1);
    });
    if (moves) return;
    moves = true;
    requestAnimationFrame(() => layer?.setAttribute("data-moves", ""));
  }

  // With no room: where each annotation is, its marker in the column's right gutter (stacked without
  // overlapping); the card shown by its words or blocks.
  function foldCards(page, starting) {
    const column = page.getBoundingClientRect();
    const origin = layer.getBoundingClientRect();
    const x = (value) => value - origin.left;
    const y = (value) => value - origin.top;
    const end = pageEnd(y(document.documentElement.getBoundingClientRect().bottom));

    const stack = [];
    for (const [id, view] of views) {
      const line = lineOf(view);
      seen(view, line);
      // None for a new one while it is written with no words yet: an annotation once left, or once it has them.
      if (!line || drafted(id)) {
        view.marker?.remove();
        view.bar?.remove();
        continue;
      }
      const marker = markerOf(id);
      if (marker.parentNode !== layer) {
        layer.append(marker);
        marksChanged = true;
        if (!starting && !quiet) fadeIn(marker);
      }
      placeBar(id, view, line, x(pastText(column.right, (view.units ?? []).filter((unit) => unit.isConnected)) + RAIL.bar), origin.top);
      stack.push({ id, node: marker, left: markerAcross(column.right, (view.units ?? []).filter((unit) => unit.isConnected)), ideal: y(markerTop(line)), marker: true, height: RAIL.marker, active: false, row: { right: columnRight(view), order: stack.length } });
    }
    // One row (two columns of 分栏 side by side): the column beside the gutter first.
    const rows = [...stack].sort((a, b) => a.ideal - b.ideal || a.row.order - b.row.order);
    for (let start = 0; start < rows.length;) {
      let stop = start + 1;
      while (stop < rows.length && rows[stop].ideal - rows[start].ideal <= SAME_LINE) stop++;
      const group = rows.slice(start, stop);
      if (group.length > 1 && new Set(group.map((item) => item.row.right)).size > 1) {
        const top = Math.min(...group.map((item) => item.ideal));
        group.sort((a, b) => b.row.right - a.row.right || a.row.order - b.row.order).forEach((item, index) => { item.ideal = top + index * 0.001; });
      }
      start = stop;
    }
    const tops = stackItems(stack, { top: TOP_ROOM, bottom: end });
    stack.forEach((item, index) => { item.node.style.transform = `translate(${Math.round(x(item.left))}px, ${Math.round(tops[index])}px)`; });

    // The card: the annotation shown (by hover, a click, being written).
    const target = shown ? views.get(shown.id) ?? made.get(shown.id) : null;
    let box = target ? anchorBox(target) : null;
    if (shown && !(shown.focus || focused()) && (!box || (shown.located && (box.bottom < 0 || box.top > document.documentElement.clientHeight)))) {
      hide();
      box = null;
    }
    for (const [id, each] of cards) {
      if (id === shown?.id) continue;
      each.node.remove();
      cards.delete(id);
    }
    if (box) {
      const card = cardOf(shown.id);
      const appended = card.node.parentNode !== layer;
      if (appended) layer.append(card.node);
      card.node.hidden = false;
      card.node.style.width = `${Math.round(Math.min(RAIL.card, column.width))}px`;
      fitField(card.node, card.field);
      // Fading in as it appears, or shows another annotation.
      if (appended && !quiet) fadeIn(card.node);
      const at = placeCard(box, { width: card.node.offsetWidth, height: card.node.offsetHeight }, column, shown?.focus ? shown.side : null);
      placed = { side: at.side };
      if (shown?.focus && at.side) shown.side ??= at.side;
      Object.assign(card.node.style, { left: `${Math.round(x(at.left))}px`, top: `${Math.round(y(at.top))}px` });
    } else cards.get(shown?.id)?.node.remove();
  }

  // One frame: the room asked for, then the annotations in the form it gives, the fill and the marks.
  // With nothing to draw nothing stands: no layer, nothing listening for the pointer.
  function draw() {
    if (!isEditing()) {
      takeDown();
      return false;
    }
    if (!resolved) resolveAll();
    const starting = !started;
    started = true;
    askRoom();
    if (!shown && views.size === 0) {
      takeDown();
      return false;
    }
    ensureLayer();
    const page = pageColumn();
    if (!page) return false;
    const room = margin();
    if (room.cards > 0 !== standing) changeForm(room.cards > 0);
    if (standing) standCards(room);
    else foldCards(page, starting);
    quiet = false;

    // A block anchor's blocks filled while it is shown, or its card in the margin is under the pointer;
    // those in a closed disclosure, the disclosure; in a folded section, its heading.
    const filled = views.get(shown?.id ?? (standing ? hot : null));
    fills.paint(filled && !filled.range && !filled.hidden ? ordered(filled.units.filter((unit) => unit.isConnected).map((unit) => closedAround(unit) ?? unit)) : []);
    paintMarks();
    return fills.count > 0 ? FOLLOW : false;
  }

  // Where the pointer is, and whether it moved to get there (a marker drawn under a still pointer
  // hears an enter without a move); over marked words, they and their marker are hot (no card: the
  // words are for editing).
  let moved = null;
  function pointerAt(event) {
    const was = pointer;
    pointer = { x: event.clientX, y: event.clientY, moved: !was || was.x !== event.clientX || was.y !== event.clientY };
    if (!event.buttons) layer?.removeAttribute("data-pressed");
  }
  // Into the workbench: over nothing of the page (no words hot either).
  const pointerOut = (event) => {
    if (event.relatedTarget) return;
    pointer = null;
    if (hot) {
      hot = null;
      paintMarks();
      for (const [id, view] of views) view.bar?.toggleAttribute("data-hot", shown?.id === id);
    }
  };
  function pointerMoved(event) {
    if (event.buttons || event.target?.closest?.(".ge-note-layer")) return;
    const first = !moved;
    moved = { x: event.clientX, y: event.clientY };
    if (first) requestAnimationFrame(hotAt);
  }
  // The annotation whose marked words are under this point (window coordinates), or null.
  function markedAt(x, y) {
    for (const [id, view] of views) {
      if (!view.range || view.hidden || view.folded) continue;
      for (const rect of view.range.getClientRects()) if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return id;
    }
    return null;
  }
  function hotAt() {
    const over = markedAt(moved?.x ?? -1, moved?.y ?? -1);
    moved = null;
    if (over !== hot) {
      hot = over;
      paintMarks();
      for (const [id, view] of views) view.bar?.toggleAttribute("data-hot", id === hot || shown?.id === id);
    }
  }

  // The annotation whose marked words `event` came down on: what stands over them keeps a press to itself.
  const markedBy = (event) => (event.target?.closest?.("main") && !inDialog(event.target) ? markedAt(event.clientX, event.clientY) : null);
  // A press elsewhere takes away a card only looked at: one the pointer never rested on has no leaving.
  // In the margin it takes the one in front back among the others, but for a press on its marked words
  // (one being written goes by its field's blur). Begun out of the margin, it leaves the cards out of
  // the pointer's way until it moves with no button down (`pointerAt`; a release on the scrollbar says
  // nothing): a selection dragged over them is the page's.
  const pressed = (event) => {
    if (event.target?.closest?.(".ge-note-layer")) return;
    layer?.setAttribute("data-pressed", "");
    if (!shown || shown.focus) return;
    if (shown.hover || (standing && markedBy(event) !== shown.id)) hide();
  };
  // A press out of the frame, heard as the frame's blur where the page had the focus, or told by the
  // workbench (`away`): one only in front goes back too (one being written goes by its field's blur).
  const leftFrame = () => { if (standing) hide(); };
  // A click on marked words, no words selected by it, brings their card in front in the margin; the
  // caret stays in them. With no room the words are for editing: no card.
  const clicked = (event) => {
    if (!standing || event.target?.closest?.(".ge-note-layer") || !getSelection()?.isCollapsed) return;
    const id = markedBy(event);
    if (id && id !== shown?.id) show(id);
  };

  // The server's word that the file changed (another tab, an Agent's own write).
  addEventListener("doc-annotations-changed", (event) => {
    if (reading && (event.detail?.version ?? "") !== version) fetchAll().then(take);
  });
  // The card follows the scroll where the window holds it (by words, as the format bar does; at the
  // window's bottom by a long block). Those in the margin scroll with the page.
  const scrolled = () => { if (shown && !standing) wake(); };
  // What may have moved what they stand beside.
  const pageMoved = () => {
    remeasure = true;
    wake();
  };

  // The page's text followed, from the first annotation on: a page with none has no observer.
  function followText() {
    const main = document.querySelector("main");
    if (observer || !main) return;
    observer = new MutationObserver(observed);
    observer.observe(main, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["data-block-id", "open", "hidden", "class"] });
  }

  // What moves what is drawn, and the pointer over it, listened to while the layer stands.
  function followPage(wanted) {
    if (wanted === Boolean(resizer)) return;
    const listen = wanted ? addEventListener : removeEventListener;
    listen("resize", pageMoved);
    listen("scroll", scrolled, { passive: true });
    listen("mousemove", pointerMoved, { passive: true, capture: true });
    listen("pointermove", pointerAt, { passive: true, capture: true });
    listen("pointerout", pointerOut, { passive: true, capture: true });
    listen("pointerdown", pressed, { passive: true, capture: true });
    listen("click", clicked, { passive: true, capture: true });
    listen("blur", leftFrame);
    if (!wanted) {
      resizer.disconnect();
      resizer = null;
      unmargin();
      unmargin = null;
      clearTimeout(hoverTimer);
      clearTimeout(leaveTimer);
      hovering = null;
      return;
    }
    const main = document.querySelector("main");
    resizer = new ResizeObserver(pageMoved);
    watched = new WeakSet();
    resizer.observe(document.documentElement);
    if (main) resizer.observe(main);
    watchRows();
    unmargin = onMargin(pageMoved);
  }

  // The blocks standing in a row, each looked at once (a block in a row added says so as it comes).
  function watchRows() {
    if (!resizer) return;
    for (const block of document.querySelector("main")?.querySelectorAll(IN_ROW) ?? []) {
      if (watched.has(block)) continue;
      watched.add(block);
      resizer.observe(block);
    }
  }

  // Once the marks are drawn (a frame after the annotations came), 500ms at most.
  const drawn = () => new Promise((resolve) => {
    const timer = setTimeout(resolve, 500);
    requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timer); resolve(); }));
  });

  // What the workbench's list and its two actions ask of the page: the rows of the list; going to the
  // one `id` says; a press in the workbench after that, where the page has no focus to lose; what
  // 复制批注 hands the workbench; 全部删除, what was typed saved first, so that 撤销 brings all of it back.
  // 撤销 is the workbench's, by the report's slug (the page shown then may be another's), and then the
  // page reads them again (`annotate`).
  const ACTIONS = {
    async list() {
      await (reading ??= read());
      return { ok: true, items: rows() };
    },
    async locate(id) {
      await (reading ??= read());
      return goTo(id) ? { ok: true } : { ok: false, reason: "missing" };
    },
    away() {
      leftFrame();
      return { ok: true };
    },
    async copy() {
      await flush();
      const answer = await fetch(`${ROUTE}?slug=${encodeURIComponent(slug)}&as=copy`, { headers: { "X-Gallery-Token": token }, cache: "no-store" }).then((response) => response.json()).catch(() => ({ ok: false, reason: "offline" }));
      return answer.ok ? { ok: true, data: { title: answer.title, path: answer.path, items: answer.items } } : { ok: false, reason: answer.reason ?? "error" };
    },
    // 删除已处理: those marked done (gallery notes done), what was typed saved first; 撤销 brings them back (the workbench's).
    async clearDone() {
      await flush();
      const answer = await send({ removeDone: true });
      if (!answer.ok) return { ok: false, reason: answer.reason ?? "error" };
      take(answer);
      return { ok: true, slug, removed: answer.removed ?? [] };
    },
    async clear() {
      if (focused()) document.activeElement.blur();
      close();
      await flush();
      shown = null;
      made.clear();
      named.clear();
      lost.clear();
      history.clear();
      const answer = await send({ clear: true });
      if (!answer.ok) return { ok: false, reason: answer.reason ?? "error" };
      keep(stashKey, []);
      items = new Map();
      take(answer);
      return { ok: true, slug, removed: answer.removed ?? [] };
    },
  };

  /** How many annotations the page has (their words or blocks still there; a new one once it has words). */
  const count = () => [...items.keys()].filter((id) => views.has(id) && !drafted(id)).length;

  provide("annotations", () => ({
    items: items.size, found: [...views.keys()].filter((id) => !drafted(id)), lost: [...lost.keys()], card: shown && { id: shown.id, focus: shown.focus, hover: shown.hover }, standing,
    quotes: Object.fromEntries([...views].map(([id, view]) => [id, view.excerpt?.quote ?? null])),
  }));

  return {
    /** Whether `node` is the margin's (a card, a marker): the editor's own keys, presses and clipboard leave it alone. */
    holds: (node) => Boolean(node?.closest?.(".ge-note-layer")),
    /** The page is ready: what the server holds is read, in the background. */
    start() {
      reading ??= read();
    },
    /** Whether these blocks can take an annotation, one for them all (the button beside a block). */
    canBlocks,
    /** Where a marker of this block alone stands: where the button beside it stands; null where it has none. */
    markerSpot,
    /** An annotation on these blocks (the button beside a block). */
    annotateBlocks(units) {
      if (canBlocks(units)) begin(blockSelection(units));
    },
    /** Whether what is selected now can be annotated (the format bar's row). */
    canSelection: () => Boolean(selected()),
    /** An annotation on what is selected now (the format bar's row). */
    annotateSelection() {
      const selection = selected();
      if (selection) begin(selection);
    },
    /** Whether a card is being written (it has the focus, or what was typed waits to be saved): the page is not swapped meanwhile. */
    writing: () => writing() || timers.size > 0 || sending.size > 0,
    /** How many annotations the page has, for the workbench's button; undefined until it can say. */
    count: () => (counted ? count() : undefined),
    flush,
    /** Before a commit goes (autosave's `before`): where annotations' words went with the edit it writes, told first (a promise, or null). */
    sync: () => sync(),
    /** The session's `annotate`: { refresh } -> { ok, count }: what there is read (`refresh`: read again) and drawn, so that a page is swapped in with its marks. */
    async command({ refresh = false }) {
      await (reading ??= read());
      if (refresh) take(await fetchAll());
      if (views.size > 0) await drawn();
      return { ok: true, count: count() };
    },
    /** The session's `annotations`: what the workbench asks of them by name (`ACTIONS`). */
    action: ({ action, id }) => (Object.hasOwn(ACTIONS, action) ? ACTIONS[action](id) : { ok: false, reason: "action" }),
    /**
     * Ctrl/⌘+Alt+M in the page: an annotation on the words selected, else on the blocks selected, else
     * on the caret's block; a caret in marked words, whose block takes none, their card. True when it
     * did one of these (else the key is the workbench's: a press of its button).
     */
    key(event) {
      if (!(event.ctrlKey || event.metaKey) || !event.altKey || event.shiftKey || event.code !== "KeyM") return false;
      const selection = selected() ?? caretBlock();
      const marked = selection ? null : markedAtCaret();
      if (!selection && !marked) return false;
      event.preventDefault();
      if (selection) begin(selection, { keys: true });
      else show(marked, { focus: true, keys: true });
      return true;
    },
    /** The page goes away: what is typed goes now. */
    leave: () => flush({ keepalive: true }),
  };
}
