import type { DocState } from "./doc-state.js";

/**
 * What an instance can hear (`on`). `editable`: `context.canEdit()` has just become true, for one mounted before the page came to edit.
 * `content`: a change inside the instance, heard only with `owns: false`, as what a component owns the
 * kit does not watch; a change of what the file says of it is `source`, whatever it owns: of a part edited
 * as text or data, or of the blocks a slot holds (a part edited as flow), typed, moved in or out, undone,
 * an attribute that says something of the file among them (a to-do item checked, a cell's spans, a look
 * class), none an instance among those blocks draws; told in the next frame, a frame's changes in one.
 * `clock`: each whole minute of the reader's clock, its detail "minute", or "day" for the first of a day.
 * `data`: what the workspace holds changed, its detail the kind (`"todos"`, `"recent"`, `"stats"`, `"activity"`, `"document"`):
 * heard for the kinds this instance read with `context.workspace.query`; read it again then. For a view of a
 * table (the manifest's needs hold `"tables"`) the detail is `"table"`: the rows of the table it reads changed.
 */
export type DocComponentSignal = "source" | "resize" | "theme" | "layout" | "viewport" | "fonts" | "content" | "reveal" | "editable" | "clock" | "data";

/** What a component's `mount` returns, all of it optional. */
export interface DocComponentHandle {
  /**
   * A signal it asked for (`on`). `detail`: the mutation records of `source` and `content`; the faces of a
   * later `fonts`; of `data`, the kind that changed ("table": the rows of the table a view reads). `options.quiet`: on `content`, a change that leaves the page looking as it was.
   */
  update?(reason: DocComponentSignal, detail?: unknown, options?: { quiet?: boolean }): void;
  /** The host left the page. What listens on `context.signal` goes by itself. */
  destroy?(): void;
}

export interface DocComponentStateOptions<T extends Record<string, unknown>> {
  /** Positive integer. A state of another version, or defaults of another shape, under this instance's name throws: see `DocStateFactory.getOrCreate`. */
  version: number;
  /** JSON-serializable default state. */
  defaults: T;
  /** Default: []; excluded from browser restoration and exported snapshots. */
  transientKeys?: Array<keyof T & string>;
}

/** A link a row's cells hold to a document of the workspace, or to a block of one. */
export interface DocRowLink {
  /** The document's folder name: of this document for a link within it. */
  slug: string;
  /** The link's words. */
  title: string;
  /** The block's id, or null for the document. */
  block: string | null;
}

/** A row of a table a part holds (`context.rows`), or of the table a view reads (`context.table()`), as it reads it when it is asked. */
export interface DocRow {
  /** The row on the page: read it, never write it (a write is `add`, `move`, `remove`, and a view's `set`). */
  readonly el: HTMLTableRowElement;
  /** Its values by the header's words: a number where a cell writes one, its words, or null for none (as a chart drawn from a table reads them). */
  readonly values: Readonly<Record<string, string | number | null>>;
  /** The links its cells hold to documents. */
  readonly links: readonly DocRowLink[];
}

/**
 * The rows of the table a part is or holds, read when `context.rows` is called: its header's words and
 * the rows of its body. Each write is one `context.edit` of the part, one undo step, false where it
 * was not taken, as `edit`'s; a row added, moved or removed takes the blank before it along, so a table
 * written a row a line stays so. Read the rows again after a write: on `source`.
 */
export interface DocRowSet {
  /** The header's words, in order. */
  readonly columns: readonly string[];
  readonly rows: readonly DocRow[];
  /** A row of these values (by the header's words; a name the header does not have throws), after `at.after`, or last. */
  add(values: Record<string, string>, at?: { after?: DocRow }): boolean;
  /** `row` put before `to.before`, or after `to.after`, its cells of `to.values` set in the same write (a card dropped in another column: its status and its place); neither leaves it where it is. */
  move(row: DocRow, to: { before?: DocRow; after?: DocRow; values?: Record<string, string> }): boolean;
  /** `row` taken out. */
  remove(row: DocRow): boolean;
}

/**
 * The table of the document a view reads (`context.table()`, for a block whose manifest's needs hold
 * "tables", bound to the table by the key on its instance, data-doc-from, which the table's frame carries
 * as data-doc-chart-source), read when it is called, in the file's order (a reader's sort of the table
 * leaves it): its header's words and its rows of data, as a chart drawn from the table reads them. A row
 * is the same object until it, or the header, changes, so that a view keeps what it drew of a row while
 * that row is the same. No write is a write of the view's: `set`, `add`, `move` and `remove` each ask
 * the page editor, which changes the table as its own tools do (one undo step; a cell's words merged word
 * by word with someone else's, a row moved, put in or taken out held back as a conflict where the table
 * changed meanwhile), and answer whether it did: false in an export, in 演示视图, before the page edits,
 * for a table the editor's tools do not manage (one with merged cells, or not written as the kit writes
 * one), and for a row no longer in the table; a name the header does not have throws. Its own sort and
 * filter a view keeps in `context.state`, never in the table.
 */
export interface DocTableView extends DocRowSet {
  /** Whether the page editor would take a change of this table now, asked with no change: false where every change answers false whatever it is (an export, 演示视图, before the page edits, a table the editor's tools do not manage: a `<tfoot>`, rows of other lengths), so that a view shows it read-only. */
  canEdit(): boolean;
  /**
   * One cell's words: the cell of `column` (a name of the header) in `row`; given a list of rows, that cell of
   * each, one undo step (a board's group renamed: each of its rows). `also`, a write of the block's own parts
   * that goes with it, in the same step (the group's place in the order of the board's settings), as
   * `context.edit` or `context.editJSON` takes it: `{ editJSON: ["settings", (settings) => …] }`.
   */
  set(row: DocRow | readonly DocRow[], column: string, text: string, also?: DocTableAlso): boolean;
  /** `listener` called once a change of the page leaves the table's rows other than they were (a cell typed in, a row added, moved or taken out, the table or the view's key changed); the function returned takes it off, as the instance's end does. A view that hears `data` (detail "table") needs none. */
  subscribe(listener: () => void): () => void;
}

/** A write of a block's own parts that a change of its table carries, in the same undo step: as `context.edit(names, change)` takes it, or as `context.editJSON(name, change)` does. */
export type DocTableAlso =
  | { edit: [names: string | string[], change: (draft: any) => void] }
  | { editJSON: [name: string, change: (data: any) => any] };

/** A card's size on a custom page: in the grid's cells as the board draws it (1 to 12 wide, no more than the board's columns, 4 on a narrow window; 1 to 24 high), and in pixels, what the card holds inside its padding. */
export interface DocComponentSize {
  w: number;
  h: number;
  width: number;
  height: number;
}

/** Where a to-do stands, what names it to its document whether or not its item has a block id. */
export interface DocTodoRef {
  /** Its document's folder name. */
  slug: string;
  /** Its item's block id (data-block-id), or null for one written with none yet. */
  block: string | null;
  /** Its words. */
  text: string;
  /** The headings it stands under, the outermost first. */
  path: string[];
  /** Which of the to-dos of the same words under the same path it is, 0 the first. */
  nth: number;
  /** The version of its document's file it was read from (a hash), by which a check finds it by its place while the file is still that one; null where none is known. */
  version?: string | null;
}

/** A to-do of a document of the workspace (`workspace.query("todos")`): an item of a to-do list. */
export interface DocTodo {
  ref: DocTodoRef;
  /** Its words. */
  text: string;
  /** Checked. */
  done: boolean;
  /** Its document's folder name and title. */
  slug: string;
  title: string;
  /** The headings it stands under, the outermost first. */
  path: string[];
}

/** A document of the workspace as `workspace.query("recent")` lists it, the one edited last first. */
export interface DocRecentDocument {
  slug: string;
  title: string;
  /** Its page icon as its doc.json writes it (an emoji, or an icon's or a picture's value), or null. */
  icon: string | null;
  /** When its file was last written, an ISO time. */
  edited: string;
}

/** One document's own facts (`workspace.query("document")`): of the document the instance stands in where the query names none. */
export interface DocDocumentFacts {
  slug: string;
  title: string;
  /** Its page icon as its doc.json writes it, or null. */
  icon: string | null;
  /** When it was made, an ISO time: its doc.json's `created`, which Gallery writes as it makes a document; for one made otherwise, the earliest its folder and files tell. */
  created: string;
  /** When its file was last written, an ISO time: by the reader's edits and an Agent's alike. */
  edited: string;
  /** Who made its last change of text: "reader" (the user, editing in Gallery), "agent" (anyone else's write: an Agent's, a command's), null where Gallery has no record of it. */
  editedBy: "reader" | "agent" | null;
  /** Its words, as the document's menu counts them. */
  words: number;
}

/** The workspace's counts (`workspace.query("stats")`). */
export interface DocWorkspaceStats {
  /** Its documents (not the 写作偏好 page, nor a custom page). */
  documents: number;
  /** Its to-dos, checked and all. */
  todos: { done: number; total: number };
  /** The words of all its documents. */
  words: number;
  /** How many documents were written since this week's Monday, 0:00. */
  editedThisWeek: number;
}

/** A day of the workspace's record of edits (`workspace.query("activity")`), of every document. */
export interface DocActivityDay {
  /** YYYY-MM-DD, the server's local day. */
  date: string;
  /** The writes that changed a document that day. */
  edits: number;
  /** The net change of words that day (below 0 where more went than came). */
  words: number;
  /** Of those, the reader's own (their commits on the page) and the Agent's (any other write). */
  reader: { edits: number; words: number };
  agent: { edits: number; words: number };
}

/** A row of a table of a document as `workspace.query("table")` gives it: its values by the header's words, the links its cells hold to documents. */
export interface DocWorkspaceRow {
  values: Record<string, string | number | null>;
  links: { slug: string; title: string; block: string | null }[];
}

/** What `workspace.query("table")` gives: the header's words, the rows asked for (the first `limit`), and how many rows matched in all. */
export interface DocWorkspaceTable {
  columns: string[];
  rows: DocWorkspaceRow[];
  total: number;
}

/** What `workspace.query` resolves to: its data, and when it was read (an ISO time; in an exported file, when the export was made). */
export interface DocWorkspaceAnswer<T> {
  data: T;
  at: string;
}

/**
 * What a block reads of the workspace, where its manifest's `needs` hold `"workspace"` (no consent asked:
 * it is the user's own). A query that cannot be answered rejects with an Error whose `code` says why, one
 * of these and never another: "offline" (an exported file whose export kept none of it, or a server that does
 * not answer: show that the data is Gallery's), "failed" (the server answered and could not read it: show
 * that it could not be read), "missing" (`table`: no such document, no table of that key in it, or one with
 * merged cells), "kind", "options", "unsupported" (which no server of this version says). In an exported
 * file each kind is answered from what the export embedded (to-dos 200 at most, documents 50, the tables
 * the document's blocks asked for), `at` the export's time: say "截至 …" with it.
 */
export interface DocWorkspace {
  /** The to-dos of the documents, of those edited last first, each in its document's order (`limit` default 200, at most 1000). */
  query(kind: "todos", options?: { done?: boolean; slugs?: string[]; limit?: number }): Promise<DocWorkspaceAnswer<DocTodo[]>>;
  /** The documents edited last (`limit` default 10, at most 50). */
  query(kind: "recent", options?: { limit?: number }): Promise<DocWorkspaceAnswer<DocRecentDocument[]>>;
  query(kind: "stats", options?: Record<string, never>): Promise<DocWorkspaceAnswer<DocWorkspaceStats>>;
  /** The last `days` days to today (default 365, at most 371: 53 weeks, as long as the record is kept), a day of none 0, from the day the record started at the earliest. */
  query(kind: "activity", options?: { days?: number }): Promise<DocWorkspaceAnswer<DocActivityDay[]>>;
  /** A keyed table of a document (its frame's data-doc-chart-source), read-only: its rows whose cells hold the words `where` names (`limit` default 200, at most 1000). A column the table does not have rejects with "options". */
  query(kind: "table", options: { slug: string; key: string; where?: Record<string, string>; limit?: number }): Promise<DocWorkspaceAnswer<DocWorkspaceTable>>;
  /** One document's facts: of the document the instance stands in where `slug` is left out (on a custom page, name one); rejects "missing" for no such document. An exported file answers its own document's, as of the export. */
  query(kind: "document", options?: { slug?: string }): Promise<DocWorkspaceAnswer<DocDocumentFacts>>;
  /** Open a document (at a block of it) or a custom page where the page is shown: the workbench, else the page itself goes there; nothing in an exported file. */
  open(target: { slug: string; block?: string | null } | { page: string }): void;
  /**
   * Check (`done` true) or clear a to-do of a document, by the ref `query("todos")` gave: the server writes that
   * document as the reader's edit (an open page of it merges it; on a custom page, its undo checks it back).
   * Resolves to whether it changed the document (false: it said so already). Rejects with `code`: "changed"
   * (the item is not as read: its words changed, or it is gone; read again), "ambiguous" (several items alike
   * and the file changed since), "locked" (the item is there, where the document's own page cannot check it: in a table cell, in a block of the document's own), "missing", "busy", "offline" (nothing on the page writes the workspace),
   * "ref", "failed". Not there in an exported file: test `if (workspace.setTodo)` and draw the boxes read-only.
   */
  setTodo?(ref: DocTodoRef, done: boolean): Promise<boolean>;
}

/** Where a drag would drop: the element the marker goes in, and the child of it the marker goes before (null: its end). */
export interface DocDropSpot {
  into: Element;
  before: Node | null;
}

/** What `DocKit.input` takes. */
export interface DocInputOptions {
  /** Hears each value the reader is done with, once: Enter, the field left, a select changed; never while an input method composes. */
  commit(value: string): void;
  /** Ends what it listens to (`context.signal`). */
  signal?: AbortSignal;
}

/** What `DocKit.input` returns. */
export interface DocInputHandle {
  /** The value the file holds now, drawn from a part: shown unless the reader is typing another there. */
  set(value: string): void;
  /** The value committed last, or set. */
  readonly value: string;
}

/** What `DocKit.text` takes. */
export interface DocTextOptions {
  /** Hears the words the reader is done with (Enter, Escape, the words left; never while an input method composes), their white space one space and trimmed, once, unless they are what it holds already; answers whether the change was taken (`table.set`'s or `context.edit`'s answer): `false` puts back the words it holds. */
  commit(text: string): boolean | void;
  /** Whether the words take the caret now (default: always): `() => context.canEdit()`, and false where what they stand for takes no change. Asked as they are set, as the pointer comes onto them and as they are pressed. */
  enabled?: () => boolean;
  /** Gray words shown while they are empty, never written. */
  placeholder?: string;
  /** Ends it before its element goes (it ends with its element anyway). */
  signal?: AbortSignal;
}

/** What `DocKit.text` returns. */
export interface DocTextHandle {
  /** The words the file holds now (drawn from it): shown unless the reader is typing others there. Whether they take the caret is asked again. */
  set(text: string): void;
  /** The caret put in them, at their end (`select`: all of them selected), where they take it now; whether it was. */
  edit(options?: { select?: boolean }): boolean;
  /** Whether they take the caret now, asked again (after the page came to edit: `editable`). */
  refresh(): boolean;
  /** Whether the reader is typing in them. */
  readonly editing: boolean;
  /** The words committed last, or set. */
  readonly value: string;
}

/** What `DocKit.drag` takes. */
export interface DocDragOptions<S extends DocDropSpot> {
  /** What a press starts a drag on, a selector inside the area. */
  items: string;
  /** Where in an item a press starts one, a selector (default: anywhere in it). */
  handle?: string;
  /** How far, in pixels, a press moves before it is a drag (default 4). */
  threshold?: number;
  /** Whether a drag may start now (default: always): `() => context.canEdit()`. */
  enabled?: () => boolean;
  /** An element of the component's that stands where a drop would go, while one would. */
  marker?: Element | null;
  /** Where a drop at (x, y), the pointer's place in the window, goes, or null for nowhere. */
  over(x: number, y: number, item: HTMLElement): S | null;
  /** The item released over a spot: the write, one `context.edit`. */
  drop(item: HTMLElement, spot: S): void;
  /** Ends what it listens to (`context.signal`). */
  signal?: AbortSignal;
}

/** What `DocKit.drag` returns. */
export interface DocDragHandle {
  /** Give up a drag going on, as Escape does: nothing dropped. */
  cancel(): void;
  /** Whether an item is being dragged. */
  readonly dragging: boolean;
}

/** A row of `DocKit.choose`'s menu: `[value, words]`, `{ value, label?, disabled? }`, a bare string (its own value and words), or `{ group }`, a heading that is no row. */
export type DocChoice = [value: string, label: string] | { value: string; label?: string; disabled?: boolean } | { group: string } | string;

/** What `DocKit.choose` takes. */
export interface DocChooseOptions {
  /** The rows of the menu, in order. */
  options: DocChoice[];
  /** The value checked (and lit first), if any. */
  value?: string | null;
  /** The menu's name for a screen reader. */
  label?: string;
  /** Closes the menu without a choice when it aborts (`context.signal`). */
  signal?: AbortSignal;
}

/** What `DocKit.popover` takes. */
export interface DocPopoverOptions {
  /** Fills the card (and again as the block likes, with `handle.place()` once its size changed). */
  build(card: HTMLElement, handle: DocPopoverHandle): void;
  /** Where the card stands in the page (an element of the block's own drawing: its keys and presses are the block's). */
  within?: Element | null;
  /** Under the anchor (above where there is more room), above it, beside it (a submenu) or over it. */
  placement?: "bottom" | "top" | "right" | "over";
  /** Its edge with the anchor's start or end. */
  align?: "start" | "end";
  /** px between it and the anchor. */
  gap?: number;
  width?: number;
  minWidth?: number;
  className?: string;
  /** Its name for a screen reader. */
  label?: string;
  /** Hears it close, whatever closed it: "outside", "escape", "replaced", "closed". */
  onClose?(reason: string): void;
}

/** An open card of `DocKit.popover`. */
export interface DocPopoverHandle {
  readonly card: HTMLElement;
  /** Places it again by its anchor (what it holds changed its size). */
  place(): void;
  close(): void;
  readonly open: boolean;
}

/** What `mount` is given for a package's instance. */
export interface DocComponentContext {
  /** The instance's element. */
  readonly host: HTMLElement;
  /** Aborts when the instance ends: give it to what the component listens to. */
  readonly signal: AbortSignal;
  /**
   * Run `draw` in the frame the kit draws in, once: of what is asked before that frame, the last `draw`
   * runs. Asked from inside a `draw` it runs in the next frame; a chain of those is an animation, which
   * the page does not wait for to count as drawn. Nothing runs once the instance has failed.
   */
  frame(draw: () => void): void;
  /** Say this instance failed: it ends there, even as `mount` runs, and shows what it holds, read-only. */
  fail(error: unknown): void;
  /**
   * The first element of a part of the manifest in this instance's own markup, or null. A part edited as
   * flow gives its slot (data-doc-slot), whose blocks are the document's, the reader's: read it (its
   * height, its words, its headings), and never write in it, move it or take it off. A name the manifest
   * does not have throws.
   */
  part(name: string): HTMLElement | null;
  /** This instance's reading state, of no other instance of the package: the same object at every mount. */
  state<T extends Record<string, unknown>>(options: DocComponentStateOptions<T>): DocState<T>;
  /**
   * Whether `edit` writes to the file now. False until the page comes to edit (the `editable` signal
   * says when, for one that asked), and for good in an exported file and its PDF, in 演示视图, for an
   * instance that failed and for one whose `data-doc-schema` is past its manifest's `schema`.
   */
  canEdit(): boolean;
  /**
   * Change a part edited as data, whose name its manifest gives: `change` is handed a draft of the part
   * (its first element, off the page) and changes what it holds, at once. Returns whether that was taken:
   * then it stands on the page, one undo step, and the file follows by itself, as for any edit. False
   * while `canEdit()` is false, and where `change` throws, writes the part on the page instead of the
   * draft, or leaves what a file cannot hold (a script, a handler, an element that does not read back as
   * itself, its own tag changed): nothing has happened then, and the console says why. Undo puts the
   * part back and `source` tells you, like any change of it. A name the manifest does not have, or a
   * part not edited as data (a text part, a slot), throws. A list of names changes those parts in one write, one undo step (a
   * gesture that moves a card and counts the move): `change` is handed a draft of each, by its name, and
   * two that are one element, or one in the other, throw.
   */
  edit<P extends string | string[]>(part: P, change: (draft: P extends string[] ? Record<string, HTMLElement> : HTMLElement) => void): boolean;
  /**
   * What a part holds, parsed as JSON (a script of data's), JSON's null too; undefined where there is
   * nothing to read: an optional part the instance does not hold, and one that holds no JSON, which
   * fails the instance, as `fail` does.
   */
  readJSON(part: string): any;
  /**
   * `edit` of a part of JSON: `change` is handed what it holds, parsed, and changes it, or returns what is
   * to stand there instead. Written back as it was laid out (on one line where it was on one, else a line
   * an entry, but for an object or a list of values alone), so that a change of one value changes its
   * line; a change that leaves the value as it was writes nothing. Returns what `edit` returns.
   */
  editJSON(part: string, change: (draft: any) => any): boolean;
  /** The rows of the table a part is or holds, or null for none, or one with a cell spanning others. */
  rows(part: string): DocRowSet | null;
  /**
   * The table of the document this instance is a view of (its data-doc-from), for a block whose
   * manifest's needs hold "tables": null with none (no key, no table carries it, a cell spanning others),
   * on a custom page, and for a block whose needs do not hold "tables" (the console says so once).
   */
  table(): DocTableView | null;
  /** `setInterval`, cleared as the instance ends; what it runs is the instance's (its failure the instance's). */
  interval(run: () => void, ms: number): number;
  /** `setTimeout`, cleared as the instance ends; what it runs is the instance's. */
  timeout(run: () => void, ms: number): number;
  /** `addEventListener`, removed as the instance ends (or as `options.signal` aborts). */
  listen<K extends keyof WindowEventMap>(target: Window, type: K, listener: (event: WindowEventMap[K]) => void, options?: AddEventListenerOptions | boolean): void;
  listen<K extends keyof DocumentEventMap>(target: Document, type: K, listener: (event: DocumentEventMap[K]) => void, options?: AddEventListenerOptions | boolean): void;
  listen<K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, listener: (event: HTMLElementEventMap[K]) => void, options?: AddEventListenerOptions | boolean): void;
  listen(target: EventTarget, type: string, listener: (event: Event) => void, options?: AddEventListenerOptions | boolean): void;
  /** Where the instance is: a document as Gallery shows it, a custom page, or an exported file (where nothing writes). */
  readonly place: "document" | "page" | "export";
  /** Its card's size on a custom page, read when asked (`layout` says it changed); null anywhere else. */
  readonly size: DocComponentSize | null;
  /** What it reads of the workspace: there where its manifest's `needs` hold `"workspace"`, else undefined. `data` says what it read changed. */
  readonly workspace?: DocWorkspace;
  /**
   * The web, for a block whose manifest's needs name the host ("net:<host>", "net:*.<host>" for the names
   * under it): an absolute http or https address on it, asked of Gallery's server, which fetches it (a GET,
   * no cookie, the answer JSON or text, 512 KB at most), keeps it a minute and keeps what it got for when
   * the network is not there. `as`: "json" (the default: `data` is its JSON) or "text". `{key}` in the
   * address is where the server writes the workspace's key for that host (gallery block key), which no
   * page ever holds. Resolves with the answer and when it was fetched (`cached`: given from what was kept,
   * which may be old where the network is not there). Rejects with a DocFetchError: "consent" until the
   * reader allows it, on the card the kit then shows 允许访问 <host> on (draw your own state too, and the
   * instance starts again once the reader says yes or takes it back). In an exported file nothing is
   * fetched: what the export embedded of the address, or "offline", for the block to show a placeholder.
   * Not there for a block whose needs name no host of the net (declared here as always there, so that a
   * block that names one need not ask).
   */
  fetch(url: string, options?: { as?: "json" | "text" }): Promise<DocFetchAnswer>;
}

/** What `context.fetch` resolves with. */
export interface DocFetchAnswer {
  /** The answer's JSON (as "json") or its text (as "text"). */
  data: any;
  /** When it was fetched, an ISO time. */
  at: string;
  /** Whether it was given from what was kept, not fetched now. */
  cached: boolean;
}

/** Why `context.fetch` was refused: its `code`. */
export type DocFetchCode = "consent" | "host" | "url" | "private" | "key" | "rate" | "status" | "type" | "too-large" | "offline" | "missing";

/** What `context.fetch` rejects with. */
export interface DocFetchError extends Error {
  /**
   * consent: the reader has not allowed it yet; host: its needs do not name the address's host (or a
   * redirect's); url: no address it may ask for (not http(s), another port, a user in it), its own or a
   * redirect's (or a redirect to an address that does not parse); private: the host is this computer or
   * a private network as this computer's resolver answered it, with no proxy of this computer to take
   * its name (usually the reader's network setup, not the block: the message names the address); key:
   * the address names `{key}` and the workspace has none for that host; rate: too many fetches a
   * minute; status: the site answered an error (`status`);
   * type: no JSON or text (or no JSON asked as JSON); too-large: more than 512 KB; offline: the network
   * or the site not reached, and nothing kept (in an exported file: nothing embedded); missing: the block does not load.
   */
  code: DocFetchCode;
  /** The hosts of its needs the reader has not allowed yet (consent). */
  hosts?: string[];
  /** The host refused (host, private, key). */
  host?: string;
  /** The site's status (status). */
  status?: number;
}

/** What a package's kit.js registers. */
export interface DocComponent {
  /** The package's id, as its manifest writes it: <scope>/<name>. */
  id: string;
  /** The signals `update` is to hear. */
  on?: DocComponentSignal[];
  /** Default: true. The kit watches nothing the component draws in its instance, but what its parts edit as text or data. */
  owns?: boolean;
  /**
   * Starts an instance, a thrown error or a promise rejected being that instance's failure alone: it
   * shows what it holds, read-only, and the page goes on. Called again on a node an undo puts back and
   * in an exported file: the kit takes off `dehydrate`'s and the manifest's `runtime`'s first.
   */
  mount(host: HTMLElement, context: DocComponentContext): DocComponentHandle | void | Promise<DocComponentHandle | void>;
  /**
   * Takes off of `host` what `mount` left and the manifest's `runtime` does not name. It may be given a
   * host with none of it: an error it throws is told on the console, and `mount` goes on.
   */
  dehydrate?(host: HTMLElement): void;
  /**
   * A small edit, as a reader's gesture would make it, by `context.edit`: what `gallery block check`
   * calls to try the way back to the file. Nothing else calls it.
   */
  example?(host: HTMLElement, context: DocComponentContext): void;
}

declare global {
  /** What `mount` is given, for a package's kit.js to name it with (JSDoc's `@param {DocComponentContext} context`), with no import. */
  type DocComponentContext = import("./doc-kit.js").DocComponentContext;
  /** What `mount` returns. */
  type DocComponentHandle = import("./doc-kit.js").DocComponentHandle;
  /** A signal `update` hears. */
  type DocComponentSignal = import("./doc-kit.js").DocComponentSignal;
  /** What kit.js registers. */
  type DocComponent = import("./doc-kit.js").DocComponent;
  /** A row of a table a part holds (`context.rows`). */
  type DocRow = import("./doc-kit.js").DocRow;
  /** The rows of a table a part holds (`context.rows`). */
  type DocRowSet = import("./doc-kit.js").DocRowSet;
  /** The table of the document a view reads (`context.table()`). */
  type DocTableView = import("./doc-kit.js").DocTableView;
  /** A card's size on a custom page (`context.size`). */
  type DocComponentSize = import("./doc-kit.js").DocComponentSize;
  /** Where a drag would drop (`DocKit.drag`'s `over`). */
  type DocDropSpot = import("./doc-kit.js").DocDropSpot;
  /** Words a block draws typed in where they stand (`DocKit.text`'s handle). */
  type DocTextHandle = import("./doc-kit.js").DocTextHandle;
  /** What `context.fetch` resolves with. */
  type DocFetchAnswer = import("./doc-kit.js").DocFetchAnswer;
  /** What `context.fetch` rejects with: its `code` says why. */
  type DocFetchError = import("./doc-kit.js").DocFetchError;
  /** What a block reads of the workspace (`context.workspace`), and what it gives. */
  type DocWorkspace = import("./doc-kit.js").DocWorkspace;
  type DocTodo = import("./doc-kit.js").DocTodo;
  type DocTodoRef = import("./doc-kit.js").DocTodoRef;
  type DocWorkspaceRow = import("./doc-kit.js").DocWorkspaceRow;
  type DocWorkspaceTable = import("./doc-kit.js").DocWorkspaceTable;
  type DocRecentDocument = import("./doc-kit.js").DocRecentDocument;
  type DocWorkspaceStats = import("./doc-kit.js").DocWorkspaceStats;
  type DocActivityDay = import("./doc-kit.js").DocActivityDay;
  type DocWorkspaceAnswer<T> = import("./doc-kit.js").DocWorkspaceAnswer<T>;
}

/** How much the kit runs now. */
export interface DocKitStats {
  /** Instances alive, by component. */
  live: Record<string, number>;
  mounted: number;
  destroyed: number;
  failed: number;
  components: string[];
}

/** The kit's runtime: every component instance on the page. */
export interface DocKitApi {
  /** Register a component. An id registered already throws. */
  component(definition: DocComponent): unknown;
  /** What Gallery says of a package; generated, never written by hand. */
  describe(description: { id: string; [field: string]: unknown }): void;
  /** What is known of a component: where its instances are and its parts, or null. */
  description(id: string): { id: string; [field: string]: unknown } | null;
  /** Start what `root` holds now, as if it had been added. */
  mount(root?: ParentNode): void;
  /** End the instance on `host`. */
  destroy(host: Element): void;
  /** Run a change that leaves the page looking as it was. */
  quietly<T>(change: () => T): T;
  /** Take what the kit and its components left off `root`, a copy of the page. */
  dehydrate<T extends Element>(root: T): T;
  /** The component on `host` makes its `example` of an edit, as `gallery block check` asks it. Whether it has one. */
  example(host: Element): boolean;
  /** Open what hides an element, and bring it into view. */
  reveal(element: Element): void;
  /**
   * A field whose value goes to the file when the reader is done with it: `commit` hears it on Enter (in
   * a textarea Ctrl+Enter), as the field is left or a select changes, never while an input method
   * composes and never twice; Escape puts back the value committed last.
   */
  input(field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, options: DocInputOptions): DocInputHandle;
  /**
   * Words the block draws that stand for something of the file (a cell of its table, a setting), typed in
   * where they stand as a figure's words are in the page editor: while `enabled()` says so they take the
   * caret, lit with the accent's light fill under the pointer and while typed in; one line, Enter, Escape
   * or leaving them ends it, keeping what was typed, and `commit` hears it once; elsewhere (an export) words.
   */
  text(node: HTMLElement, options: DocTextOptions): DocTextHandle;
  /**
   * A drag of what `items` finds in `area`, by pointer events: past a threshold, a `marker` where a drop
   * would go (`over`), `drop` on a release over a spot, nothing on Escape or a release elsewhere; the
   * item carries the class `doc-dragging` while it moves.
   */
  drag<S extends DocDropSpot>(area: HTMLElement, options: DocDragOptions<S>): DocDragHandle;
  /**
   * The kit's menu of choices under `anchor`, a button of the block's own: the card every `<select>` of the
   * page opens (flat, rounded, the chosen row checked, light and dark as the page is; ↑ ↓ Enter, a letter, Esc).
   * Resolves with the value chosen, or null when it is dismissed (Esc, a press outside, `signal`, the anchor
   * leaving the page); called again on the anchor of a menu that is open, it closes it. Never the browser's
   * popup: a `<select>` needs no call (the kit opens this menu for it), and a menu a block draws itself is not
   * to look like the browser's.
   */
  choose(anchor: Element, options: DocChooseOptions): Promise<string | null>;
  /**
   * The same floating card holding what a block puts in it (a menu of rows with icons, a field and its suggestions,
   * a small form), under `anchor` (an element, or a box of the window's). Cards opened from one inside an open card
   * stay with it; a press outside, Esc, or another card opened elsewhere closes it. Flat, rounded, light and dark as
   * the page is; in the top layer, so nothing of the page covers it.
   */
  popover(anchor: Element | { left: number; top: number; right?: number; bottom?: number }, options: DocPopoverOptions): DocPopoverHandle;

  stats(): DocKitStats;
  /** The keys of the page's bound controls. */
  readonly bindings: unknown;
  /** The selectors of the elements blocks stand in. */
  readonly flows: readonly string[];
  /** The tables of the page a key names, as the kit's charts drawn from a table and the views of one read them: the kit's own (a view reads its table by `context.table()`). */
  readonly tables: unknown;
}
