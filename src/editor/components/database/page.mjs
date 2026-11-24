import { FIELDS, SLOT, componentAt, heldBy } from "../../../shared/components/installed.mjs";
import { PROVISIONAL } from "../../../shared/provisional.mjs";
import { DATABASE_CLASS, DATABASE_FORMAT, PAGES_CLASS, RECORD_ID, bodyOf, cleanDatabase, databasePages, layoutOf, newDatabase, provisionalOf, readElement, recordSlot, tableMarkup, writeDatabase } from "../../../shared/database.mjs";
import { DATA_MOST } from "../../../shared/components/installed.mjs";
import { jsonIn } from "../../../shared/json-layout.mjs";
import { caretAt, editable } from "../../page/caret.mjs";
import { isEmpty, newHost } from "../../page/core.mjs";
import { addStyle, loadScript } from "../../page/ui.mjs";
import { draftedParts } from "../data-parts.mjs";
import { lookRow } from "../rows.mjs";
import { ICONS } from "../../page/menu.mjs";
import { WIDE, acrossDatabasesLook, databaseWider, wideDatabase } from "../../../shared/table-across.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { bodiesTooLong, databaseMarkup } from "./index.mjs";

// 多维表格 on the page: what happens in a database is its drawing's (render/kit/database/), and the editor
// lets go (`keepsKeys`: its keys, its clipboard, a press or a drag there), but for undo and redo on what is
// no field (a cell selected, a button, a card), which are the page's: the drawing's every change is a step
// of the document's undo. What it writes it asks of the page (doc-component-edit, as an instance's
// component does: installed/page.mjs), its two parts at once, which go in as drafted (data-parts.mjs: their
// bytes counted together, as the server counts them; a cell typed checked and put in by its row alone), one
// `source` step; the commits find them by `dataOf` and the server writes them (file.mjs), a part it does
// not hold being an empty one, which the server takes out (the undo of the change that wrote it in). A new
// one comes from the "/" menu (`create`), its kit files brought onto a page served without them, or from
// a clipboard, made anew of what its format reads alone (cleanDatabase: nothing of what someone else
// wrote is put on the page as it was). Words typed in it are written a character at a time, the writes of
// one gesture one step of undo (the edit's `merge`: history.mjs sourceStep), so that nothing typed waits
// unwritten. What a drawing does hold back unwritten (a column's width while it is dragged) it says (doc-holding
// on its host, detail true, then false once written): the page counts it as unsaved, does not show the page
// again meanwhile, and asks it to write it (doc-flush, which it does at once, before returning) before its
// undo or redo, before it closes and as it is hidden (`holding`, `flush`: editor.mjs). One in a custom block's own
// region is no unit of the document's, which no commit writes: its writes are refused (the drawing reads
// it as read-only and says so). Its block menu has 宽多维表格 (menuItems): its own word over the page's, an attribute
// of its element (WIDE), where its views are wider than the text and it stands in the body (databaseWider, by the
// width its drawing says its views take: the kit's database/across.js).

const HOST = `div.${DATABASE_CLASS}`;
const PARTS = { columns: ':scope > script[type="application/json"]', records: ":scope > table" };
const isDatabase = (node) => node?.nodeType === 1 && node.matches(HOST);
const databaseOf = (node) => (node?.nodeType === 1 ? node : node?.parentElement)?.closest?.(HOST) ?? null;
// The database a node stands in its own region of (itself, its parts, its drawing: installed.mjs heldBy, a database
// a holder), or null: a node of its records' bodies (its slots) is the document's.
const ownedBy = (node) => {
  const element = node?.nodeType === 1 ? node : node?.parentElement;
  if (!element) return null;
  if (isDatabase(element)) return element;
  const holder = componentAt(element) ? heldBy(element) : null;
  return isDatabase(holder) ? holder : null;
};

// A record's body the file holds empty (an Agent's, or one whose last block went with an undo the file took):
// what a disclosure's content says, a click making a paragraph there (insert/ clickBlank), as an instance's slot.
const BODY_EMPTY = `
  [data-ge-editing] .${PAGES_CLASS} > [data-doc-slot][data-ge-box]:not(:has(> *))::before { content: ${JSON.stringify(t("输入正文，或按“/”插入块"))}; }
`;

// Its parts on the page, by name, those it holds.
const partsOf = (host) => Object.fromEntries(Object.entries(PARTS).map(([name, at]) => [name, host.querySelector(at)]).filter(([, part]) => part));
// What it holds of each, by name, empty for a part it does not hold (as the server reads the file: file.mjs dataOf).
const dataOf = (host) => {
  const parts = partsOf(host);
  return Object.fromEntries(Object.keys(PARTS).map((name) => [name, parts[name]?.innerHTML ?? ""]));
};

// The kit's database files on a page served without them (a document with no database yet): its
// styles, then its script, which starts every database on the page as it loads.
function bringKit(doc) {
  if (!doc.querySelector('[data-doc-kit="database-styles"]')) {
    const link = doc.createElement("link");
    link.rel = "stylesheet";
    link.href = "/kit/database.css";
    link.setAttribute("data-doc-kit", "database-styles");
    doc.head.append(link);
  }
  if (!doc.querySelector('[data-doc-kit="database"]')) loadScript("/kit/database.js", () => globalThis.DocKit?.stats?.().components.includes("database"));
}

/**
 * A new database element from its markup, made anew of its format alone (cleanDatabase: what is parsed in
 * the inert template never comes onto the page), marked as made on the page, not on it yet; an empty one
 * where the markup is no database of its format. `own`: markup of its own making (freshMarkup), taken as it is.
 */
function newElement(doc, html, own = false) {
  const template = doc.createElement("template");
  template.innerHTML = html;
  const root = template.content.firstElementChild;
  const host = own ? doc.importNode(root, true) : cleanDatabase(root, doc) ?? cleanDatabase(Object.assign(doc.createElement("div"), { className: DATABASE_CLASS }), doc);
  for (const [name, value] of [["data-ge-new", ""], ["data-ge-type", "database"], ["data-ge-unit-kind", "database"], ["data-ge-frame", ""], ["contenteditable", "false"]]) host.setAttribute(name, value);
  return host;
}

/** A new database's markup in `language` (the file's): three columns, three empty records, a table's view. */
function freshMarkup(language) {
  const out = writeDatabase((({ columns, rows, views }) => ({ columns, rows, views }))(newDatabase(language)));
  const json = jsonIn("\n{\n}\n", out.json);
  return `<div class="${DATABASE_CLASS}">\n<script type="application/json">${json}</script>\n<table>${tableMarkup(out, layoutOf("\n<thead>"))}</table>\n</div>`;
}

/**
 * A database from what a clipboard carried (`block.html`, its markup as the file holds it): made anew, its records'
 * bodies boxes made on the page, each holding the blocks carried for it (`flows`, by slot: made again here as any
 * pasted block, `inner`), so that the commit writes them apart from its markup (index.mjs `extras`), as an
 * instance's slots'.
 */
export function build({ doc, block, inner }) {
  bringKit(doc);
  const host = newElement(doc, block.html);
  for (const { name, node } of databasePages(host).slots) {
    const blocks = inner?.(block.flows?.[name] ?? []) ?? [];
    node.setAttribute("data-ge-box", "");
    node.setAttribute("data-ge-box-kind", "record");
    node.replaceChildren(...(blocks.length > 0 ? blocks : [newHost(doc, "paragraph")]));
  }
  return host;
}

/**
 * A new database standing for an empty block (its type's `create`: the "/" menu, 在下方新建), in the file's
 * language: three columns, three empty records, a table's view; the caret in a paragraph after it.
 */
export function make({ doc, put, paragraph }) {
  bringKit(doc);
  const language = /^en\b/i.test(doc.documentElement.getAttribute("lang") ?? "") ? "en" : "zh";
  put(newElement(doc, freshMarkup(language), true));
  return put(paragraph());
}

export function create({ active, sourceStep, struct, madeBox = () => null, look, say, refreshState = () => {} }) {
  addStyle(BODY_EMPTY);
  // The databases whose drawing holds back what it has not written yet (doc-holding).
  const held = new Set();
  // The database whose records' bodies a step changes (bodyChange): what its drawing writes meanwhile is part of
  // that step, recorded by it, no `source` step of its own.
  let within = null;
  // Whether a key on a node of a database is undo or redo on what has no undo of its own (no field).
  const pageUndo = (node, event) => {
    const key = event?.key?.toLowerCase();
    return Boolean(event?.ctrlKey || event?.metaKey) && !event.altKey && (key === "z" || key === "y") && !node.matches(FIELDS);
  };
  // What its drawing asks to write (`detail` of doc-component-edit), one `source` step: whether it was taken.
  function write(detail, host) {
    if (!active() || heldBy(host) !== null) return false;
    const taken = draftedParts(detail, host, "database", undefined, { together: true });
    if (!taken) return false;
    if (taken.changed.length === 0) return true;
    taken.put();
    if (within === host) return true;
    sourceStep(taken.changed.map(([part, was]) => [part, was]), { merge: typeof detail.merge === "string" ? detail.merge : null });
    return true;
  }
  /**
   * Records' bodies its drawing takes away (doc-database-body on the host, `detail`: `remove`, the ids of records `write`
   * takes out, and `write`, the drawing's write of its parts): one structural step of undo, the parts it writes and the
   * bodies together, the pages going where none is left, so that one undo gives both back. Whether it was taken.
   */
  function bodyChange(host, { remove, write: drawn }) {
    if (!active() || !isDatabase(host) || heldBy(host) !== null || typeof drawn !== "function" || typeof struct !== "function") return false;
    const gone = Array.isArray(remove) ? remove.map((id) => bodyOf(host, id)).filter(Boolean) : [];
    if (gone.length === 0) return false;
    const { script, table } = readElement(host);
    const { pages } = databasePages(host);
    const parents = [host, script, table, ...(table ? [...table.children] : []), pages].filter(Boolean);
    return Boolean(struct(parents, [], () => {
      within = host;
      try {
        drawn();
      } finally {
        within = null;
      }
      for (const each of gone) each.remove();
      // Where a body before its first word is all they hold now, they are the page's, as made for it.
      if (pages && databasePages(host).slots.length === 0) provisionalOf(host) ? pages.setAttribute(PROVISIONAL, "") : pages.remove();
      return { touched: [], focus: null };
    }, { attributes: pages ? [[pages, [PROVISIONAL]]] : [] }));
  }

  // ---------- a record's body before its first word ----------
  // A record with no body shows the body it would have in its details (the drawing asks: doc-database-body, `detail`
  // { provisional: { record, text, write } }) as the page's own blocks: a slot of its database's pages (and the pages
  // after its table where it has none) holding an empty paragraph, or one of its notes (`text`), marked PROVISIONAL, no
  // box of the file's, written by nothing (core.mjs placedUnits), no step of undo; the drawing draws its details
  // around it, the editor's own tools there as in any body. The first change made in it (a word typed or composed, a
  // paste, a block made there by "/", a look given; not empty lines alone, Enter or Backspace there) makes it the
  // file's, in the step of that change (`realize`, the history's, for a change of words or look; the tidier
  // `takeSpare` for a structural one): the drawing's `write` gives its row the
  // id (data-record) and takes its notes away, its mark goes, and it is a box of the page's map (madeBox), the file
  // making its slot as the first block goes in (database/file.mjs makeSlot). Its undo marks it again and puts a fresh
  // paragraph in it (backTo), so that what the file was given of it goes; its redo puts its blocks back. One a
  // database at most; the drawing takes it away as the details go (`drop`: a record's id), nothing written.
  const spares = new Map(); // database -> { host, slot, record, text, write }
  const paragraphOf = (doc, text) => {
    const paragraph = newHost(doc, "paragraph");
    if (text) text.split(/\r?\n/).forEach((line, at) => paragraph.append(...(at > 0 ? [doc.createElement("br")] : []), line));
    return paragraph;
  };
  const spareIn = (node) => {
    const slot = (node?.nodeType === 1 ? node : node?.parentElement)?.closest?.(`[${SLOT}][${PROVISIONAL}]`);
    return slot ? [...spares.values()].find((spare) => spare.slot === slot) ?? null : null;
  };

  /** Record `record`'s body before its first word in database `host`, made for its details (or the one there): its slot, or null. */
  function provide(host, { record, text = "", write: drawn }) {
    if (!active() || !isDatabase(host) || heldBy(host) !== null || typeof drawn !== "function" || typeof struct !== "function") return null;
    // A database the file does not hold yet (made on the page, its commit on its way) takes no body yet.
    if (!host.hasAttribute("data-ge-unit") || host.hasAttribute("data-ge-new")) return null;
    if (typeof record !== "string" || !RECORD_ID.test(record) || bodyOf(host, record)) return null;
    const was = spares.get(host);
    if (was && was.record === record && was.slot.isConnected && was.slot.hasAttribute(PROVISIONAL) && was.slot.parentElement?.parentElement === host) {
      was.write = drawn;
      return was.slot;
    }
    drop(host, null, true); // another record's: its pages kept for this one
    const doc = host.ownerDocument;
    let { pages } = databasePages(host);
    if (!pages) {
      pages = doc.createElement("div");
      pages.className = PAGES_CLASS;
      pages.setAttribute(PROVISIONAL, "");
      const { table } = readElement(host);
      const before = table ?? host.querySelector(":scope > script");
      before ? before.after(pages) : host.prepend(pages);
    }
    const slot = doc.createElement("div");
    slot.setAttribute(SLOT, recordSlot(record));
    for (const [name, value] of [["data-ge-box", ""], ["data-ge-box-kind", "record"], [PROVISIONAL, ""]]) slot.setAttribute(name, value);
    const words = typeof text === "string" ? text : "";
    slot.append(paragraphOf(doc, words));
    pages.append(slot);
    spares.set(host, { host, slot, record, text: words, write: drawn });
    return slot;
  }

  /**
   * The body before its first word of database `host` taken off the page (of record `record` alone, where it names one),
   * the pages made for it with it but where `keepPages`: nothing written.
   */
  function drop(host, record = null, keepPages = false) {
    const spare = spares.get(host);
    if (!spare || (record !== null && spare.record !== record)) return;
    spares.delete(host);
    if (!spare.slot.hasAttribute(PROVISIONAL)) return; // the file's now
    const pages = spare.slot.parentElement;
    spare.slot.remove();
    if (!keepPages && pages?.hasAttribute(PROVISIONAL) && !pages.querySelector(`:scope > [${SLOT}]`)) pages.remove();
  }

  // The marks a spare's step records, given back by its undo.
  const marksOf = (spare) => [[spare.slot, [PROVISIONAL]], ...(spare.slot.parentElement ? [[spare.slot.parentElement, [PROVISIONAL]]] : [])];
  // What a step that makes a spare the file's records besides its own: its database's parts and pages, the slot.
  const spareParents = (spare) => {
    const { script, table } = readElement(spare.host);
    return [spare.host, script, table, ...(table ? [...table.children] : []), spare.slot.parentElement, spare.slot].filter(Boolean);
  };

  // The spare made the file's, within the step that records it (its mutate, or the tidier's settle after it).
  function take(spare) {
    within = spare.host;
    try {
      spare.write();
    } finally {
      within = null;
    }
    spare.slot.removeAttribute(PROVISIONAL);
    spare.slot.parentElement?.removeAttribute(PROVISIONAL);
    if (spares.get(spare.host) === spare) spares.delete(spare.host);
    madeBox(spare.slot, "record", recordSlot(spare.record));
  }

  // After that step's undo (its marks back) and its redo (its blocks back).
  const backTo = (spare) => (backwards) => {
    if (!backwards) {
      if (spares.get(spare.host) === spare) spares.delete(spare.host);
      madeBox(spare.slot, "record", recordSlot(spare.record));
      return;
    }
    if (!spare.slot.isConnected) return;
    // Its blocks off the page (what a commit wrote of them goes with the next one), a fresh paragraph to type in.
    const fresh = paragraphOf(spare.slot.ownerDocument, spare.text);
    spare.slot.replaceChildren(fresh);
    const other = spares.get(spare.host);
    if (other && other !== spare) drop(spare.host);
    spares.set(spare.host, spare);
    if (spare.slot.checkVisibility?.() !== false && spare.slot.getClientRects().length > 0) queueMicrotask(() => caretAt(fresh, "end"));
  };

  // Whether a spare holds nothing a reader wrote: empty paragraphs alone (a Backspace there, an Enter).
  const blank = (slot) => [...slot.children].filter((child) => !child.hasAttribute("data-doc-dev")).every((child) => child.localName === "p" && isEmpty(child));
  let realizing = null; // the spare a change of words or look is making the file's (realize)

  /** A change of words or of look about to be recorded in `node`, in a spare: the spare the file's first, a step whose typedInto is the block (history.mjs). */
  function realize(node) {
    const spare = spareIn(node);
    if (!spare || !active()) return;
    const block = editable(node) === node ? node : null;
    // The tidier (`takeSpare`) does the work: the step names the slot.
    realizing = spare;
    try {
      struct([spare.slot], [], () => ({ touched: block ? [block] : [], focus: block }), { typedInto: block });
    } finally {
      realizing = null;
    }
  }

  /**
   * The tidier of a structural step in a spare (or of realize's): the spare taken, in that step; but by a structural
   * step that leaves it as blank as it was (empty paragraphs alone: Backspace there, Enter), which stays the page's.
   */
  function takeSpare(parents) {
    const spare = [...spares.values()].find((each) => each.slot.isConnected && each.slot.hasAttribute(PROVISIONAL) && parents.some((parent) => each.slot === parent || each.slot.contains(parent)));
    if (!spare || !active()) return { parents: [] };
    return {
      parents: spareParents(spare),
      attributes: marksOf(spare),
      settle(result) {
        if (realizing !== spare && blank(spare.slot)) return {};
        take(spare);
        const own = result.settle;
        const back = backTo(spare);
        result.settle = (backwards) => {
          own?.(backwards);
          back(backwards);
        };
        return {};
      },
    };
  }
  return {
    keepsKeys: (node, event) => Boolean(ownedBy(node)) && !editable(node) && !pageUndo(node, event),
    realize,
    tidy: [takeSpare],
    /**
     * Its rows of the block menu: 宽多维表格 for this database alone (the user's, 2026-11-23: the top bar's switch is the
     * page's, this the database's), where its views are wider than the text in the body (databaseWider):
     * checked as it shows; a click writes its own word (WIDE: "on", "off"), or takes it away where that is what the
     * page's says, one undo step that selects it again; the kit places it again as it hears it (database/index.js).
     */
    menuItems(target) {
      if (!isDatabase(target) || !databaseWider(target)) return [];
      const on = wideDatabase(target);
      const word = on === acrossDatabasesLook() ? (on ? "off" : "on") : null;
      return [lookRow({ look, say }, target, { label: t("宽多维表格"), icon: ICONS.wideDatabase, checked: on, change: { attributes: { [WIDE]: word } }, done: on ? t("已取消宽多维表格") : t("已设为宽多维表格") })];
    },
    /** Whether a database's drawing holds back what it has not written (it said so: doc-holding). */
    holding: () => [...held].some((host) => host.isConnected),
    /** Each database writes what its drawing holds back now (doc-flush), its own step first: before undo, redo, a close or a hide. */
    flush: () => { for (const host of document.querySelectorAll(HOST)) host.dispatchEvent(new CustomEvent("doc-flush")); },
    undoHere: (node) => Boolean(ownedBy(node)) && !node.matches(FIELDS),
    create: make,
    /** What of a database its drawing writes, part by part, as the file is to hold it. */
    dataOf: (host) => (isDatabase(host) ? dataOf(host) : null),
    /** The same of the file's markup of one (a block a commit wrote whole). */
    dataIn(html) {
      const template = document.createElement("template");
      template.innerHTML = html;
      const host = template.content.firstElementChild;
      return isDatabase(host) ? dataOf(host) : null;
    },
    dataMost: DATA_MOST,
    /** Its two parts go as one write, as its drawing writes them. */
    together: (host, names) => (names.length > 1 ? [names.filter((name) => name in PARTS)] : []),
    /** The reader writes what a database holds over someone else's write of its parts (仍然调整): one `source` step from theirs. */
    overwrite(host, theirs) {
      const parts = Object.entries(partsOf(host)).filter(([name, part]) => typeof theirs[name] === "string" && part.innerHTML !== theirs[name]);
      return parts.length > 0 ? sourceStep(parts.map(([name, part]) => [part, theirs[name]])) : null;
    },
    /** A database as it stood with what its drawing wrote (`parts`), off the page: a block to copy where the file did not take that write. */
    withData(host, parts) {
      const copy = host.cloneNode(true);
      const written = Object.entries(partsOf(copy)).filter(([name]) => typeof parts?.[name] === "string");
      for (const [name, part] of written) part.innerHTML = parts[name];
      return written.length > 0 ? copy : null;
    },
    drafted: (detail, host) => (active() && heldBy(host) === null ? draftedParts(detail, host, "database", undefined, { together: true }) : null),
    definitionOf: () => DATABASE_FORMAT,
    nameOf: () => null,
    /** Its markup as the file holds it, for what copies it. */
    markupOf: (host) => databaseMarkup(host),
    /**
     * Whether a copy of its unit stands for it: not where a record has a body, whose blocks that copy would write
     * whole, with no ids the page knows; such a database is copied by what it carries (index.mjs `data`: its bodies'
     * blocks apart), in its document too.
     */
    copiesAsItself: (unit) => databasePages(unit).slots.every((slot) => slot.node.children.length === 0),
    /** Why a database is no copy where it carries too much: its bodies together more than one commit writes (index.mjs bodiesTooLong). */
    copyRefusal(unit) {
      if (!isDatabase(unit)) return null;
      const names = databasePages(unit).slots.filter((slot) => slot.first && slot.record && slot.node.children.length > 0).map((slot) => slot.name);
      return names.length > 0 && bodiesTooLong(databaseMarkup(unit, names), Object.fromEntries(databasePages(unit).slots.map((slot) => [slot.name, slot.node.innerHTML]))) ? t("这次的修改太大，一次存不下") : null;
    },
    install() {
      // The page's 宽多维表格 flipped in the workbench's 更多 (doc-wide-follow) sets every database of the page: each one's
      // own word (WIDE, the block menu's 宽多维表格) taken away, one undo step.
      addEventListener("doc-wide-follow", (event) => {
        if (!active() || !event.detail?.kinds?.includes("databases")) return;
        const hosts = [...document.querySelectorAll(`main ${HOST}[${WIDE}]`)];
        if (hosts.length > 0) look(hosts, { attributes: { [WIDE]: null } });
      });
      document.addEventListener("doc-component-edit", (event) => { if (isDatabase(event.target) && write(event.detail, event.target)) event.preventDefault(); });
      // What its drawing asks of its records' bodies: a body before its first word made for its details (`provisional`,
      // its slot given back as `slot`) or taken away again (`drop`: the record's id), bodies taken away with records.
      document.addEventListener("doc-database-body", (event) => {
        if (!isDatabase(event.target)) return;
        const detail = event.detail ?? {};
        if (detail.provisional) {
          const slot = provide(event.target, detail.provisional);
          if (slot) {
            detail.slot = slot;
            event.preventDefault();
          }
        } else if (typeof detail.drop === "string") {
          drop(event.target, detail.drop);
          event.preventDefault();
        } else if (bodyChange(event.target, detail)) event.preventDefault();
      });
      document.addEventListener("doc-holding", (event) => {
        if (!isDatabase(event.target)) return;
        if (event.detail === true) held.add(event.target);
        else held.delete(event.target);
        refreshState();
      });
    },
  };
}

// The page's reading of its parts, for tests and gallery read alike.
export const databaseParts = (host) => readElement(host);
