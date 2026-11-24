// The database a host holds, as its drawing reads and changes it, and what the reader is doing with it.
//
// What the file says is the truth: the drawing reads its parts as it starts and each time they change (an
// undo, the Agent's write), and a change the reader makes is one edit of both parts (context.edit), one
// step of the document's undo, which the page editor saves, so that the parts read back what was written.
// A change made by typing (`merge`: a cell's words, a filter's, a record's title or notes in its details,
// a column's or an option's name) is written at once, a character a write (never while an input method
// composes: as it ends), the writes of one input one step of undo (the page editor folds them:
// context.edit's merge), so that nothing typed ever waits unwritten. A drag (`merge` "drag:…": a column's
// width) is drawn as it goes and written once as it ends (`flush`); while it is held unwritten the page is
// told (doc-holding on the host, true then false), which counts it unsaved and asks for it (doc-flush)
// before an undo or redo, as the page closes or is hidden, and before it takes someone else's write in.
// Where nothing takes edits (an export, a presentation, the page before its editor came), where the file
// holds what the format cannot (problems: JSON that does not read, a table it cannot write back; a note
// says why) or where no commit can write it (in a custom block's own region), the reader still switches
// views and filters and sorts, for this reading alone: nothing is written.
//
// Besides the database, the store holds the reader's own state: which view shows, each view's filter bar
// open or shut and the details' width (context.state, never the file), and for this reading the search,
// the record open in its details, the records kept where they were though a change took them out of the
// filters (shown faded), and the records put beside another in a sorted view. Whoever draws listens
// (`listen`): each change says what it touched, so that a cell's change redraws its row alone.
import { heldBy } from "../../../shared/components/installed.mjs";
import { RECORD_ATTRIBUTE, bodyOf, problemSaid } from "../../../shared/database.mjs";
import { keepIds, partsOf, readHost, signature, writeRows, written } from "./data/file.js";
import { applyView, compareRows, defaultsFromFilters, matchFilter, matchSearch } from "./data/query.js";
import { parseInput, uid } from "./data/values.js";
import { language, w } from "./words.js";

const SNACK = 2600; // ms a word of the drawing's stays
// Each store's own name among the page's, which its typing's steps of undo are told apart by: two databases
// of the same column and record ids (one copied) never fold into one step, nor one drawn anew (a pull) into
// the steps of the store it replaced.
let stores = 0;

// Why a host's database reads only, or null: what its file holds that the format cannot, or its place.
function lockOf(host, problems) {
  if (problems.length > 0) return w("这个多维表格只能看，改不了：{0}", problems.map((problem) => problemSaid(problem, language())).join(language() === "en" ? "; " : "；"));
  if (heldBy(host) !== null) return w("这个多维表格在自定义块里，改动存不进文件，只能看");
  return null;
}

/**
 * What changed between two databases, for those who draw: `views`, `props` (whether either list is
 * another), `rows`: true where the records are others (added, taken out, moved), else the ids of those
 * whose values changed (empty: none).
 */
export function changeOf(before, after) {
  const change = { views: before.views !== after.views, props: before.props !== after.props, rows: new Set() };
  if (before.rows === after.rows) return change;
  if (before.rows.length !== after.rows.length) {
    change.rows = true;
    return change;
  }
  for (let at = 0; at < after.rows.length; at++) {
    const was = before.rows[at];
    const now = after.rows[at];
    if (was.id !== now.id) {
      change.rows = true;
      return change;
    }
    if (was !== now) change.rows.add(now.id);
  }
  return change;
}

/**
 * The store of a host's database: `host`, the kit's `context`, `layer` (the element its cards stand in).
 */
export function createStore(host, context, layer) {
  const first = readHost(host);
  let doc = first.doc;
  let byId = indexOf(doc);
  let locked = lockOf(host, first.problems);
  let canEdit = Boolean(context.canEdit?.());
  let lastWritten = ""; // what the drawing wrote last: its parts telling it back is no change of anyone else's
  let lastParts = null; // the parts' words as it wrote them: told back unchanged, nothing is read
  let dragging = null; // a drag drawn and not written yet: its gesture's key
  let gesture = 0; // the typing a write goes on, by its gesture: a new one after flush
  const self = `db${++stores}`; // this store's name in its gestures' keys
  const held = new Map(); // what fields hold unwritten: their writes, by key
  let told = false; // whether the page was told the drawing holds something unwritten
  let snackTimer = 0;
  const listeners = new Set();

  let state = null;
  try {
    state = context.state?.({ version: 1, defaults: { view: "", bars: {}, peekWidth: 0, layouts: {} } }) ?? null;
  } catch {
    state = null;
  }
  const reading = { view: state?.get("view", "") ?? "", bars: state?.get("bars", {}) ?? {}, peekWidth: state?.get("peekWidth", 0) ?? 0, layouts: state?.get("layouts", {}) ?? {} };

  // What this reading holds (never written).
  const ui = {
    search: "",
    searchOpen: false,
    peek: null, // the record open in its details
    sticky: new Set(), // records kept where they are though they no longer pass the filters
    placed: [], // records put beside another in a sorted view: { id, anchor, side }
    snack: null,
    focusRow: null, // a record just made: its title edited
  };

  const store = {
    host,
    context,
    layer,
    ui,
    reading,
    get doc() { return doc; },
    get byId() { return byId; },
    /** Whether the reader's changes are written (the page takes edits and the file holds what the format can). */
    get editable() { return canEdit && !locked; },
    /** Why it reads only though the page takes edits (said under its head), or null. */
    get locked() { return canEdit ? locked : null; },
    /** The view shown. */
    get view() { return doc.views.find((view) => view.id === reading.view) ?? doc.views[0]; },

    /** `run(change)` hears each change: { views, props, rows: true | Set of ids, ui: words of what of the reading changed, reread }. */
    listen(run) {
      listeners.add(run);
      return () => listeners.delete(run);
    },

    /** The reader's own state changed (patch of `reading`): kept in context.state. */
    setReading(patch) {
      Object.assign(reading, patch);
      try {
        for (const [key, value] of Object.entries(patch)) state?.set(key, value);
      } catch {}
      tell({ ui: Object.keys(patch).join(" ") });
    },

    /** This reading's state changed (patch of `ui`). */
    setUi(patch) {
      Object.assign(ui, patch);
      tell({ ui: Object.keys(patch).join(" ") });
    },

    /** A word of the drawing's at the bottom of the window for a moment. */
    snack(words) {
      ui.snack = { words, at: Date.now() };
      clearTimeout(snackTimer);
      snackTimer = setTimeout(() => {
        ui.snack = null;
        tell({ ui: "snack" });
      }, SNACK);
      tell({ ui: "snack" });
    },

    /**
     * One change: `fn(doc)` the database as it is to be (the same one: nothing); one step of undo.
     * `merge`: a change of a gesture that goes on, typing (written at once, the gesture one step), or
     * "drag:…" (drawn, written as it ends).
     */
    commit(fn, merge) {
      const before = doc;
      const next = fn(before);
      if (!next || next === before) return;
      if (!store.editable) {
        // Reading only: a view changes for this reading; the records and columns stay as the file says.
        if (before.props === next.props && before.rows === next.rows) set(next);
        return;
      }
      if (dragging && dragging !== merge) {
        dragging = null;
        write(before);
        holding(holdingNow());
      }
      const change = set(next);
      if (merge?.startsWith("drag:")) {
        // Held back until the drag ends: the page told, so that it counts it as unsaved and asks for it (doc-flush).
        dragging = merge;
        holding(true);
        return;
      }
      // A change of some records' values alone: their rows alone written anew (the parts held `before` as written).
      write(next, merge, change.rows instanceof Set && !change.props && !change.views && before.shape === next.shape ? change.rows : null);
    },

    /** The gesture ends: a drag held written now (one step), what a field holds unwritten too, and what is typed next a step of its own. */
    flush() {
      gesture++;
      const fields = [...held.values()];
      held.clear();
      for (const run of fields) {
        try {
          run();
        } catch (error) {
          console.error("[database]", error);
        }
      }
      if (dragging) {
        dragging = null;
        if (store.editable) write(doc);
      }
      holding(false);
    },

    /**
     * A field holds words not written yet (a date being typed, written once it reads as one and the
     * reader is done): `run()` writes them, and the page is told so that it asks for them (doc-flush)
     * before an undo, as it closes or hides, and before it takes someone else's write in. `release`
     * once they are written or dropped.
     */
    hold(key, run) {
      held.set(key, run);
      holding(true);
    },
    release(key) {
      if (held.delete(key)) holding(holdingNow());
    },

    /** A view's settings changed (`patch`, or what `patch(view)` gives). */
    updateView(viewId, patch, merge) {
      store.commit((d) => ({ ...d, views: d.views.map((view) => (view.id === viewId ? { ...view, ...(typeof patch === "function" ? patch(view) : patch) } : view)) }), merge);
    },

    /** The parts as the file says them now (an undo, someone else's write); what the drawing wrote itself coming back is nothing new. */
    reread() {
      // Its own write coming back (the parts as it wrote them): nothing to read.
      if (lastParts) {
        const { script, table } = partsOf(host);
        if (script?.textContent === lastParts.json && table?.innerHTML === lastParts.table) return;
      }
      const read = readHost(host);
      const lockedBefore = locked;
      locked = lockOf(host, read.problems);
      const fresh = keepIds(read.doc, doc);
      const said = signature(fresh);
      if (said === lastWritten || said === signature(doc)) {
        if (locked !== lockedBefore) tell({ ui: "locked" });
        return;
      }
      lastWritten = said;
      lastParts = null; // someone else's parts now (an undo, a write): the next time they read as ours, they are read
      set(fresh, { reread: true });
    },

    /** The page takes edits now, or no longer. */
    editableChanged() {
      const now = Boolean(context.canEdit?.());
      if (now === canEdit) return;
      canEdit = now;
      tell({ ui: "editable" });
    },

    destroy() {
      if (dragging || held.size) store.flush();
      clearTimeout(snackTimer);
      host.removeEventListener("doc-flush", onFlush);
      listeners.clear();
    },
  };

  function set(next, extra = {}) {
    const change = changeOf(doc, next);
    doc = next;
    if (change.props) byId = indexOf(doc);
    tell({ ...change, ...extra });
    return change;
  }

  function tell(change) {
    const full = { views: false, props: false, rows: new Set(), ui: "", ...change };
    for (const run of [...listeners]) {
      try {
        run(full);
      } catch (error) {
        console.error("[database]", error);
      }
    }
  }

  // The page told whether the drawing holds something unwritten (once each time that changes).
  function holding(on) {
    if (on === told) return;
    told = on;
    host.dispatchEvent(new CustomEvent("doc-holding", { bubbles: true, detail: on }));
  }
  const holdingNow = () => Boolean(dragging) || held.size > 0;

  // `next` written to the parts: one edit, one step of undo. A part the host does not hold yet (an
  // Agent's table with no JSON) is put in empty first, which is what the file reads where it holds none
  // (an empty part is none: database/file.mjs), and taken out again where the edit is not taken. `rows`: the
  // ids of the records whose values alone changed since what the parts hold, whose rows alone are written
  // anew in the table's draft (writeRows), what that makes looked at against the whole table written anew,
  // which goes in instead where it differs: a long table is not read anew for a character typed in it.
  function write(next, merge, rows = null) {
    const made = [];
    if (!host.querySelector(':scope > script[type="application/json"]')) {
      const script = document.createElement("script");
      script.type = "application/json";
      host.prepend(script);
      made.push(script);
    }
    if (!host.querySelector(":scope > table")) {
      const table = document.createElement("table");
      host.insertBefore(table, host.querySelector(":scope > .doc-database-pages, :scope > .doc-database-app"));
      made.push(table);
    }
    const { json, table, out, signature: said } = written(next, host);
    lastWritten = said;
    let changed = false;
    const taken = context.edit?.(["columns", "records"], (drafts) => {
      drafts.columns.textContent = json;
      if (!(rows && writeRows(drafts.records, out, next, rows) && drafts.records.innerHTML === table)) drafts.records.innerHTML = table;
      changed = true;
      lastParts = { json, table };
    }, merge ? { merge: `${self}:${merge}#${gesture}` } : undefined);
    if (!taken || !changed) {
      lastParts = null;
      for (const part of made) if (part.isConnected && !part.innerHTML) part.remove();
      store.snack(w("没能保存这次修改"));
      lastWritten = "";
      set(keepIds(readHost(host).doc, doc), { reread: true });
    }
  }

  // The page's undo and redo, its closing and hiding, write a drag held first (database/page.mjs), so that they take it.
  const onFlush = () => store.flush();
  host.addEventListener("doc-flush", onFlush);

  // ---------- the records a view shows ----------
  let shown = { key: null, rows: [], stale: new Set() };
  /**
   * The records the view shows (`view`: the one shown), in order: those its filters and the search let
   * through, and those kept where they were (faded: `stale`), sorted, those put beside another where they were put.
   */
  store.rowsOf = (view = store.view) => {
    const key = [doc.rows, doc.props, view.id, JSON.stringify(view.filters), JSON.stringify(view.sorts), ui.search, ui.sticky, ui.sticky.size, ui.placed];
    if (shown.key && shown.key.every((part, at) => part === key[at])) return shown;
    const passes = (row) => view.filters.every((filter) => matchFilter(row, filter, byId)) && matchSearch(row, ui.search, doc.props, byId);
    let rows = doc.rows.filter((row) => passes(row) || ui.sticky.has(row.id));
    if (view.sorts.length) {
      rows = [...rows].sort((a, b) => compareRows(a, b, view.sorts, byId));
      for (const place of ui.placed) {
        const at = rows.findIndex((row) => row.id === place.id);
        if (at < 0 || !rows.some((row) => row.id === place.anchor)) continue;
        const [row] = rows.splice(at, 1);
        const to = rows.findIndex((each) => each.id === place.anchor);
        rows.splice(place.side === "after" ? to + 1 : to, 0, row);
      }
    }
    const stale = new Set();
    if (ui.sticky.size) for (const row of doc.rows) if (ui.sticky.has(row.id) && !passes(row)) stale.add(row.id);
    shown = { key, rows, stale };
    return shown;
  };

  const sticky = (ids) => {
    const next = new Set(ui.sticky);
    for (const id of ids) next.add(id);
    ui.sticky = next;
  };

  // ---------- what changes the records (the view shown's: its filters fill a new record) ----------
  /** A record's value changed (`newOptions`: options it made). `merge`: typed, written as it goes. */
  store.setCell = (rowId, propId, value, newOptions, merge) => {
    const view = store.view;
    const row = doc.rows.find((each) => each.id === rowId);
    const wasShown = row && store.rowsOf(view).rows.includes(row) && !store.rowsOf(view).stale.has(rowId);
    store.commit((d) => {
      // The columns change only where the value makes options (or writes those the file's cells added): else the same
      // list, so that what draws the columns knows nothing of them changed (a cell's typing redraws its row alone).
      const target = d.props.find((prop) => prop.id === propId);
      const options = target && (newOptions?.length || target.options?.some((option) => option.added));
      return {
        ...d,
        props: options ? d.props.map((prop) => (prop.id === propId ? { ...prop, options: [...(prop.options || []).map((option) => ({ ...option, added: undefined })), ...(newOptions || [])] } : prop)) : d.props,
        rows: d.rows.map((each) => (each.id === rowId ? { ...each, values: { ...each.values, [propId]: value } } : each)),
      };
    }, merge);
    // Taken out of the filters by the change, it stays where it was until the view changes.
    if (wasShown && !ui.sticky.has(rowId)) {
      const after = doc.rows.find((each) => each.id === rowId);
      if (after && applyView([after], doc.props, view, ui.search).length === 0) {
        sticky([rowId]);
        store.snack(w("这条记录已不符合当前筛选，先留在原处，切换视图后隐藏"));
        tell({ rows: new Set([rowId]) });
      }
    }
  };

  /** Several cells written from words (a paste, a fill, a clear), `newRows` added at the end first. One step. */
  store.writeCells = (writes, newRows = []) => {
    store.commit((d) => {
      let props = d.props;
      const rows = new Map(d.rows.map((row) => [row.id, row]));
      for (const row of newRows) rows.set(row.id, row);
      for (const cell of writes) {
        const prop = props.find((each) => each.id === cell.propId);
        if (!prop || prop.type === "formula") continue;
        const { value, newOptions } = parseInput(prop, cell.text);
        if (newOptions?.length || prop.options?.some((option) => option.added)) props = props.map((each) => (each.id === prop.id ? { ...each, options: [...(each.options || []).map((option) => ({ ...option, added: undefined })), ...(newOptions || [])] } : each));
        const row = rows.get(cell.rowId);
        rows.set(cell.rowId, { ...row, values: { ...row.values, [cell.propId]: value } });
      }
      const order = [...d.rows.map((row) => row.id), ...newRows.map((row) => row.id)];
      return { ...d, props, rows: order.map((id) => rows.get(id)) };
    });
    if (newRows.length) {
      sticky(newRows.map((row) => row.id));
      tell({ rows: true });
    }
  };

  /** A new record (not added): the view's filters' values, and `prefill`. */
  store.newRow = (prefill = {}) => ({ id: uid("r"), values: { ...defaultsFromFilters(store.view.filters, byId), ...prefill } });

  /** A record added (after or before another, or at the end); opened, or its title edited (`focus`). Its id. */
  store.addRow = (prefill = {}, { open = false, after, before, focus = false } = {}) => {
    const row = store.newRow(prefill);
    store.commit((d) => {
      const rows = [...d.rows];
      const at = after ? rows.findIndex((each) => each.id === after) + 1 : before ? rows.findIndex((each) => each.id === before) : rows.length;
      rows.splice(at < 0 ? rows.length : at, 0, row);
      return { ...d, rows };
    });
    sticky([row.id]);
    if (store.view.sorts.length && (after || before)) ui.placed = [...ui.placed, { id: row.id, anchor: after || before, side: after ? "after" : "before" }];
    if (open) ui.peek = row.id;
    if (focus) ui.focusRow = row.id;
    tell({ rows: true, ui: "peek focusRow" });
    return row.id;
  };

  // Records taken out with their bodies (a slot of the database's pages each, the document's blocks): asked of the
  // page as one step with the write that takes the records out (doc-database-body), so that one undo gives both
  // back; where the page takes none (nothing edits), the records alone.
  store.deleteRows = (ids) => {
    const remove = () => store.commit((d) => ({ ...d, rows: d.rows.filter((row) => !ids.includes(row.id)) }));
    const bodies = ids.filter((id) => bodyOf(host, id));
    const asked = bodies.length > 0 && store.editable && !host.dispatchEvent(new CustomEvent("doc-database-body", { bubbles: true, cancelable: true, detail: { remove: bodies, write: remove } }));
    if (!asked) remove();
    if (ui.peek && ids.includes(ui.peek)) store.setUi({ peek: null });
    store.snack(w("已删除 {0} 条记录", ids.length));
  };

  /** A record's id changed (its row given one of its own as its body is made: peek.js): what this reading holds of it follows. */
  store.renameRecord = (from, to) => {
    if (from === to) return;
    const rename = (id) => (id === from ? to : id);
    doc = { ...doc, rows: doc.rows.map((row) => (row.id === from ? { ...row, id: to } : row)) };
    ui.peek = rename(ui.peek);
    ui.focusRow = rename(ui.focusRow);
    ui.sticky = new Set([...ui.sticky].map(rename));
    ui.placed = ui.placed.map((each) => ({ ...each, id: rename(each.id), anchor: rename(each.anchor) }));
    shown = { key: null, rows: [], stale: new Set() };
  };

  store.duplicateRow = (id) => {
    const source = doc.rows.find((row) => row.id === id);
    if (!source) return;
    // A copy of its values, not of its body: its row names no record (data-record) of its own.
    const { named, ...values } = structuredClone(source);
    const row = { ...values, id: uid("r"), ...(source.attrs ? { attrs: { ...values.attrs, row: (values.attrs.row ?? []).filter(({ name }) => name !== RECORD_ATTRIBUTE) } } : {}) };
    store.commit((d) => {
      const rows = [...d.rows];
      rows.splice(rows.findIndex((each) => each.id === id) + 1, 0, row);
      return { ...d, rows };
    });
    sticky([row.id]);
    store.snack(w("已创建副本"));
  };

  store.moveRow = (id, targetId, side) => {
    store.commit((d) => {
      const moving = d.rows.find((row) => row.id === id);
      const rows = d.rows.filter((row) => row.id !== id);
      let at = targetId ? rows.findIndex((row) => row.id === targetId) : rows.length;
      if (side === "after") at += 1;
      rows.splice(at, 0, moving);
      return { ...d, rows };
    });
  };

  // ---------- this reading's view ----------
  /** Another view shown: its search, details and the records kept for the last one gone. */
  store.switchView = (id) => {
    ui.search = "";
    ui.searchOpen = false;
    ui.peek = null;
    ui.sticky = new Set();
    ui.placed = [];
    store.setReading({ view: id });
  };

  /**
   * A layout's own reading state of a view (a calendar's month, a board's folded columns), the reader's
   * (context.state), never the file's: `key` of the view `view`, `fallback` where it has none.
   */
  store.layoutState = (key, fallback, view = store.view) => reading.layouts?.[view.id]?.[key] ?? fallback;
  store.setLayoutState = (key, value, view = store.view) => {
    const mine = { ...(reading.layouts?.[view.id] ?? {}), [key]: value };
    store.setReading({ layouts: { ...reading.layouts, [view.id]: mine } });
  };

  /** Whether a view's filter bar shows (with filters or sorts; the toolbar's buttons shut it or open it). */
  store.barOpen = (view = store.view) => reading.bars[view.id] ?? true;
  store.setBarOpen = (open, view = store.view) => {
    if (reading.bars[view.id] === open) return;
    store.setReading({ bars: { ...reading.bars, [view.id]: open } });
  };
  /** Every rule of a view gone, its bar is as it was: the next rule added shows it. */
  store.forgetBar = (view = store.view) => {
    if (reading.bars[view.id] === undefined) return;
    const bars = { ...reading.bars };
    delete bars[view.id];
    store.setReading({ bars });
  };

  // The records kept and placed are of the filters and sorts they were kept under: another filter, sort or search lets them go.
  let rules = "";
  store.listen((change) => {
    const view = store.view;
    const now = `${view.id}|${JSON.stringify(view.filters)}|${ui.search}`;
    const sorts = `${view.id}|${JSON.stringify(view.sorts)}`;
    if (rules && rules.split("\n")[0] !== now && ui.sticky.size) ui.sticky = new Set();
    if (rules && rules.split("\n")[1] !== sorts && ui.placed.length) ui.placed = [];
    rules = `${now}\n${sorts}`;
    // A record gone from the file is open in no details.
    if (ui.peek && change.rows !== false && !doc.rows.some((row) => row.id === ui.peek)) ui.peek = null;
  });

  return store;
}

const indexOf = (doc) => Object.fromEntries(doc.props.map((prop) => [prop.id, prop]));
