import { HOSTS, SEALED, UNIT_CATEGORY } from "../../components/registry.mjs";
import { elementOf, placeIn } from "../../../shared/reading-place.mjs";
import { editable } from "../caret.mjs";
import { isHost, withLeads } from "../core.mjs";
import { provide, settle } from "../overlays.mjs";
import { ordersIn, planPull } from "./plan.mjs";

// The page's pull (docs/editor.md "Someone else's writes"; since 2026-11-12):
// someone else's write shown where the page stands, without loading it anew, when all it did is change
// the words of text blocks the page has. The page reads itself as it is served now (its own address, never
// from a cache, parsed as a document of its own: no script of it runs, nothing of it is laid out), plans it
// against what it knows the file has (plan.mjs), and, where the plan says so, puts the file's words in
// those blocks as a load of the page shows them, in one task: a block the reader has changed and not saved
// keeps the reader's words (their commit merges with the file's, as any does), as does one a selection runs
// across from another block; the caret's block keeps the caret among its words (commit.mjs caretKept), its
// earlier undo steps undoing three ways from then on (history.mjs merged); the element at the window's top
// stays where it stood. Anything else (a unit added, taken out or moved, a block's look, a formula, the
// page's head) is the page shown anew, as it was before (autosave.mjs). What the pull leaves the page must
// hold nothing to commit: the crash buffer is written right before it, and should the commits find
// anything new after it, the page is shown anew from that buffer (`bail`), with nothing stored over it.
// A switch turns it off, for a fuzz run to compare (OFF: localStorage "gallery-edit:pull" set to "off").

const OFF = "gallery-edit:pull";

/** Whether the pull is on (it is unless localStorage's "gallery-edit:pull" says "off"). */
export function pullOn() {
  try {
    return globalThis.localStorage?.getItem(OFF) !== "off";
  } catch {
    return true;
  }
}

// The page as it is served now: its own address, read past every cache, and given up after READ_FOR (a
// server busy or gone: asked again later, the commits waiting for it meanwhile).
const READ_FOR = 10000;
const served = async (win) => {
  const signal = typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(READ_FOR) : undefined;
  const response = await win.fetch(win.location.pathname + win.location.search, { cache: "no-store", credentials: "same-origin", ...(signal ? { signal } : {}) });
  if (!response.ok) throw new Error(`status ${response.status}`);
  return response.text();
};

/**
 * commits(): the page's (commit.mjs); merged(host): someone else's words went into that block (history.mjs
 * merged); after({ hosts }): the page took a write in (the Agent's changes read again, the state told); win:
 * the page's window; read(win): the text of the page as it is served now (a test's own).
 * Returns pull({ accept(version), ready(), store() }): resolves with { outcome, version?, reason?, journal? },
 * outcome one of "applied" (all of it shown), "partial" (shown but for blocks the reader holds: `held`),
 * "same" (nothing to show), "stale" (the file not the version accept() takes, or the page moved on while it
 * read: `version` undefined), "unread" (the page could not be read: asked again later), "busy" (a change of the
 * page's waits that is no text: after its commit), "idless" (a block the reader changed is in a unit with
 * no id yet: after its commit, which gives it one), "structure" (no plan: shown anew), "bail" (the page
 * left holding something to commit: shown anew from the crash buffer).
 */
export function createPull({ commits, merged, after, rebased = () => {}, win = globalThis.window, read = served }) {
  let pulls = 0; // writes taken in
  let bailed = 0; // safety nets caught (none, ever: the fuzz looks)
  let last = null; // the last outcome, and why
  provide("pull", () => ({ pulls, bailed, last }));
  const said = (result) => {
    last = { outcome: result.outcome, ...(result.reason ? { reason: result.reason } : {}), ...(result.shown !== undefined ? { shown: result.shown, held: result.held } : {}) }; // what the pull showed, for the tests and a look
    if (["applied", "partial", "same"].includes(result.outcome)) pulls++; // a write taken in, words shown or none
    if (result.outcome === "bail") {
      bailed++;
      console.error("[gallery] a pull left the page holding something to commit; shown anew from the crash buffer:", result.reason); // never: the fuzz and the scenarios take it for a page error
    }
    win.document.documentElement.setAttribute("data-ge-pulls", String(pulls)); // the scenarios wait on it
    return result;
  };

  async function pull({ accept, ready, store }) {
    let text;
    try {
      text = await read(win);
    } catch (error) {
      return said({ outcome: "unread", reason: String(error?.message ?? error) });
    }
    const doc = new win.DOMParser().parseFromString(text, "text/html");
    const node = doc.getElementById("doc-edit-map");
    const map = node ? JSON.parse(node.textContent) : null;
    const list = commits();
    if (!map || !list) return said({ outcome: "structure", reason: "map" });
    // What no pull shows, whichever version it read: the document otherwise than the page knows it besides its units
    // (its head, its scripts: the frame), or a file of the kit the page never loaded (kitMissing). The page is shown anew,
    // which asks the revert check itself right before it goes (autosave.mjs maybeReload), so an Agent writing on, a write
    // landing between each question and the read, never keeps it from going (`stale`, asked again and again).
    const known = list.knownFrame?.() ?? list.pullView().frame;
    if (typeof known !== "string" || map.frame !== known) return said({ outcome: "structure", reason: "frame" });
    if (kitMissing(doc, win.document).length > 0) return said({ outcome: "structure", reason: "kit" });
    if (!ready()) return said({ outcome: "stale", reason: "moved on" });
    if (!accept(map.version)) return said({ outcome: "stale", version: map.version, reason: "version" });
    return said(take(list, map, doc, store));
  }

  // The file `map` (its page parsed as `doc`) taken in, in one task.
  function take(list, map, doc, store) {
    const collected = list.collect();
    const before = list.pendingOf(collected);
    // Words the reader gave up for the file's (用文件里的): no change of theirs any more (no commit sends them), shown as
    // the file has them.
    const givenUp = new Set(list.givenUpTexts?.() ?? []);
    for (const id of givenUp) before.dirty.delete(id);
    // But one with a block split off it (Enter in it before the card): that block is given up with it, which a pull
    // showing the file's words leaves on the page (written with them later, or never): shown anew, as before.
    if (collected.edits.some((edit) => givenUp.has(edit.id) && edit.parts.some((part) => !part.keep))) return { outcome: "structure", reason: "given-up" };
    if (before.units > 0 || before.strays > 0) return { outcome: "busy" };
    // A change of a block's (a conversion, a deletion, a move) the reader gave up for the file's, or one the page shows
    // standing for a unit still (a conversion's stand-in): the page differs from what it knows the file has otherwise
    // than in words, which no plan reads; shown anew, as the reader's choice asks (reloadSoon).
    if ((list.givenUpUnits?.() ?? 0) > 0 || win.document.querySelector("main [data-ge-convert]")) return { outcome: "structure", reason: "given-up" };
    if (before.idless) return { outcome: "idless" };
    const view = list.pullView();
    const file = { version: map.version, frame: map.frame, units: map.units, boxes: map.boxes, blocks: map.blocks, orders: ordersIn(doc) };
    // A unit whose words, shell or blocks the page cannot show in place is replaced, whole (taken out and the
    // file's put in, as a load makes it), but one holding a block the page found a script had changed as it loaded
    // (locked "script": what a load of the file would make of it again, no pull can tell).
    // Nor one a script of the document's draws into or wires (kept "script": the server's mark), or holding one: put in
    // anew, no script draws it or hears it (a load runs the scripts again).
    const scripted = (element) => element.matches('[data-ge-lock="script"], [data-ge-keep="script"]') || Boolean(element.querySelector('[data-ge-lock="script"], [data-ge-keep="script"]'));
    const replace = (unit) => {
      const element = list.unitElementOf(unit);
      return Boolean(element) && !scripted(element);
    };
    const plan = planPull(view, file, { patchable: (block, fileBlock) => patchable(list.hostOfBlock(block.id), fileBlock, doc), replace });
    if (!plan.ok) return { outcome: "structure", reason: plan.reason };
    // A block the file locks now (an element elsewhere refers to it, a script reads it) that the page leaves the
    // reader to write in: the page shown anew, which locks it.
    const locks = new Map([...doc.querySelectorAll("[data-ge-block][data-ge-lock]")].map((node) => [Number(node.getAttribute("data-ge-block")), node.getAttribute("data-ge-lock")]));
    for (const [block, fileBlock] of plan.blocks) {
      const lock = locks.get(fileBlock.id);
      if (lock && list.hostOfBlock(block)?.getAttribute("data-ge-lock") !== lock) return { outcome: "structure", reason: "lock" };
    }
    // What the selection keeps the page from showing now: a block it runs across into another, or one holding
    // the block it is in (a list item's paragraph).
    const selection = win.getSelection();
    const ends = selection.rangeCount ? [selection.anchorNode, selection.focusNode] : [];
    const across = selection.rangeCount && editable(ends[0]) !== editable(ends[1]) ? selection.getRangeAt(0) : null;
    // Units put in, taken out or moved: what the page can do in place, or why not (pull/plan.mjs's plan read against
    // the page's elements and the page served).
    if (plan.structural) {
      const why = arrangeable(list, plan, map, doc, before, ends, across, file.orders);
      if (why) return why;
    }
    const shown = [];
    const held = [];
    for (const change of plan.changes) {
      const host = list.hostOfBlock(change.id);
      const inside = ends.some((end) => end && host.contains(end) && editable(end) !== host);
      if (!givenUp.has(change.id) && (before.dirty.has(change.id) || inside || across?.intersectsNode(host))) held.push(change.id);
      else shown.push(change);
    }
    // Words the reader gave up for the file's (用文件里的): shown as the file has them, changed or not.
    for (const id of list.givenUpTexts?.() ?? []) if (plan.blocks.has(id) && !held.includes(id) && !shown.some((change) => change.id === id)) shown.push({ id, theirs: plan.blocks.get(id) });
    store(); // the crash buffer as the page is: what a bail starts the next page from
    const place = placeIn(win);
    const anchor = elementOf(win.document, place.top);
    let result;
    try {
      result = list.pulled({ version: map.version, frame: map.frame, plan, fileUnits: map.units, fileBoxes: map.boxes, fileBlocks: map.blocks, fileOrders: file.orders, doc, shown, held });
      for (const host of result.hosts) merged(host);
      // Undo steps recorded before it go by the page as it stands now (history.mjs pulled): what was put in is in
      // their lists, what was taken out is not, what moved stands where it moved; a step of words in a block taken out,
      // or in one whose words it showed of a unit paired by place alone (`unsure`: plan.mjs guessed), is refused.
      const unitOfBlock = new Map(view.blocks.map((block) => [block.id, block.unit]));
      const unsure = shown.filter(({ id }) => plan.guessed.has(unitOfBlock.get(id))).map(({ id }) => list.hostOfBlock(id)).filter(Boolean);
      if (plan.structural || unsure.length > 0) rebased({ removed: result.removed, placed: result.placed, unsure });
    } catch (error) {
      return { outcome: "bail", reason: String(error?.message ?? error) };
    }
    try {
      // The element that stood at the window's top stands there still (Chrome's scroll anchoring mostly did it).
      if (anchor?.isConnected && Number.isFinite(place.top?.at)) {
        const moved = Math.round(anchor.getBoundingClientRect().top) - place.top.at;
        if (moved !== 0) win.scrollBy(0, moved);
      }
      // Nothing to commit but what was: the same blocks changed, no change of anything else (a block given up that the
      // write took off the page is none: shown, it would be the file's).
      const now = list.pendingOf(list.collect());
      if (now.units !== before.units || now.strays !== before.strays || [...now.dirty].some((id) => !before.dirty.has(id) && !(givenUp.has(id) && !list.hostOfBlock(id)?.isConnected))) return { outcome: "bail", reason: "left" };
    } catch (error) {
      return { outcome: "bail", reason: String(error?.message ?? error) };
    }
    // What follows it (the Agent's changes read again, the state told) may fail without taking back what it did:
    // the autosave knows the file as that version all the same.
    let failed = null;
    try {
      if (plan.structural) {
        settle(); // what the editor draws for blocks taken off the page goes (overlays.mjs)
        win.dispatchEvent(new win.Event("doc-layout-change")); // charts and tables lay themselves out again
      }
      after({ hosts: result.hosts });
    } catch (error) {
      failed = `after: ${error?.message ?? error}`;
    }
    return { outcome: held.length > 0 ? "partial" : plan.same ? "same" : "applied", version: map.version, journal: result.journal, shown: shown.length, held: held.length, structural: plan.structural, ...(failed ? { reason: failed } : {}) };
  }

  // Whether the page can put in, take out and move the units `plan` says: null, or the outcome that says
  // why not. What it puts in is only what a load makes of plain words (units of blocks and containers, each element
  // of them a unit, a box or a text block of words alone, or in one: no table's rows, no figure, no instance, no
  // formula or chip, no lead, nothing locked); what it takes out or moves holds no instance and has no lead; nothing
  // made on the page that the file has not yet stands anywhere (`draft`). A unit taken out that holds words the
  // reader changed and has not saved: committed first (`busy`: the file says what it makes of them, a card); one the
  // selection is in, or a unit moved that a selection runs across into: later (`held`, the page behind meanwhile).
  function arrangeable(list, plan, map, doc, before, ends, across, orders) {
    const no = (reason) => ({ outcome: "structure", reason });
    // A block made on the page and not committed yet: committed first (nothing waiting to go, shown anew as before).
    if (win.document.querySelector("main [data-ge-new], [data-ge-box] [data-ge-new]")) return { outcome: "busy", reason: "draft" };
    // What of a unit taken out is its own: not what stands in a unit in it that the plan keeps (moved into the one put
    // in its place, the reader's words and caret with it).
    const kept = new Set([...plan.units.keys()].map((unit) => list.unitElementOf(unit)).filter(Boolean));
    const ownOf = (element, node) => {
      for (let at = node?.nodeType === 1 ? node : node?.parentElement; at && at !== element; at = at.parentElement) if (kept.has(at)) return false;
      return Boolean(node) && element.contains(node);
    };
    for (const unit of plan.removed) {
      const element = list.unitElementOf(unit);
      if (!element) return no("remove");
      if ([...before.dirty].some((block) => ownOf(element, list.hostOfBlock(block)))) return { outcome: "busy" };
      if (ends.some((end) => end && ownOf(element, end))) return { outcome: "held", reason: "caret" };
      if (across && plan.replaced.has(unit) && across.intersectsNode(element)) return { outcome: "held", reason: "selection" };
    }
    for (const unit of plan.moved) {
      const element = list.unitElementOf(unit);
      if (!element) return no("move");
      if (across?.intersectsNode(element)) return { outcome: "held", reason: "selection" };
    }
    // One put in where a selection runs across blocks (between its ends): it would join the selection, and the reader's
    // next Delete take it out unseen: later, as for a move.
    if (across) {
      const boxOf = new Map();
      for (const [box, order] of orders) for (const unit of order) boxOf.set(unit, box);
      for (const unit of plan.inserted) {
        if (plan.inserted.has(map.units[unit]?.parent)) continue; // put in with the one it is in
        const order = orders.get(boxOf.get(unit)) ?? [];
        const at = order.indexOf(unit);
        const element = (other) => (plan.back.has(other) && !plan.inserted.has(other) ? list.unitElementOf(plan.back.get(other)) : null);
        let point = null;
        for (let index = at - 1; index >= 0 && !point; index--) {
          const previous = element(order[index]);
          if (previous?.parentNode) point = [previous.parentNode, [...previous.parentNode.childNodes].indexOf(previous) + 1];
        }
        for (let index = at + 1; index < order.length && !point; index++) {
          const next = element(order[index]);
          if (next?.parentNode) point = [next.parentNode, [...next.parentNode.childNodes].indexOf(withLeads(next)[0])];
        }
        const parent = map.units[unit]?.parent;
        const owner = parent === null || parent === undefined ? win.document.querySelector("main") : element(parent);
        if (point ? across.comparePoint(...point) === 0 : Boolean(owner) && across.intersectsNode(owner)) return { outcome: "held", reason: "selection" };
      }
    }
    const servedOf = new Map([...doc.querySelectorAll("[data-ge-unit]")].map((node) => [Number(node.getAttribute("data-ge-unit")), node]));
    for (const unit of plan.inserted) if (!servedOf.has(unit) || !UNIT_CATEGORY[map.units[unit]?.kind] || servedOf.get(unit).matches('[data-ge-keep="script"]') || servedOf.get(unit).querySelector('[data-ge-keep="script"]')) return no("insert");
    return null;
  }

  return pull;
}

/**
 * The files of the kit (and of the vendors it loads) the page `served` (a document) asks for that the page `shown`
 * (the one the reader has) has not loaded, by their ids (`data-doc-kit`, `data-doc-vendor`): [] when none. The server
 * puts on a page the kit's tags its blocks need (render/assets.mjs usedAssets), none the file writes, so a write that
 * puts in the first block of a kind (a Sheet area, a chart, a formula, a code block) has the page served with one more
 * than it opened with, which no frame tells (source/units.mjs frameShell is the file's). The kit draws only what a
 * component it loaded knows, and no script runs for what a pull puts in: a Sheet area put in so showed every panel at
 * once and no tab chosen (the user's 2026-11-14). A file the editor loaded since (a code block made on the page: its
 * script by its address, `ui.mjs` loadScript; a Sheet area made: `ensureSheetsKit`) is loaded; one a load would
 * bring besides is not.
 */
export function kitMissing(served, shown) {
  const marks = ["data-doc-kit", "data-doc-vendor"];
  const markOf = (node) => marks.filter((name) => node.hasAttribute(name)).map((name) => `${name}=${node.getAttribute(name)}`)[0];
  const pathOf = (node) => (node.getAttribute("src") ?? node.getAttribute("href") ?? "").split(/[?#]/)[0];
  const loaded = new Set();
  for (const node of shown.querySelectorAll("[data-doc-kit], [data-doc-vendor], script[src], link[href]")) {
    const mark = markOf(node);
    if (mark) loaded.add(mark);
    if (pathOf(node)) loaded.add(pathOf(node));
  }
  return [...served.querySelectorAll("[data-doc-kit], [data-doc-vendor]")]
    .filter((node) => !loaded.has(markOf(node)) && !(pathOf(node) && loaded.has(pathOf(node))))
    .map((node) => markOf(node).split("=")[1]);
}

// Whether a text block the page shows (`host`) can show the file's words for it (`fileBlock`) in place: a
// host of plain words on both sides (no formula or chip, read-only for no reason, in no instance of a
// component, of a kind the page rebuilds from its words alone: none whose text a component opens, draws
// or wraps).
function patchable(host, fileBlock, doc) {
  const kind = HOSTS[fileBlock.kind];
  if (!kind || kind.closed || kind.tex) return false;
  const served = doc.querySelector(`[data-ge-block="${fileBlock.id}"]`);
  if (!served || served.hasAttribute("data-ge-lock") || (SEALED && served.closest(SEALED))) return false;
  // A text block of the page's: editable, but a Sheet tab's name (in its span, editable while renamed) and words the
  // reader gave up for the file's (locked "given-up" until the page shows the file's).
  const lock = host?.getAttribute("data-ge-lock");
  return Boolean(host?.isConnected) && host.hasAttribute("data-ge-block") && (kind.wrapped || host.getAttribute("contenteditable") === "true" || lock === "given-up") && (!lock || lock === "given-up") && !(SEALED && host.closest(SEALED));
}
