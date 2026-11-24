// An instance of a component package (组件包: <workspace>/components/<scope>/<name>/, read by
// src/shared/component-catalog.mjs): a block-level div or section naming its package, which is all a
// system needs to tell where the instance stands. The boundary depends on no catalog, so it holds in
// a file sent to someone who has no such package, or that has lost it: nothing of Gallery's goes into
// an instance's own region, whatever it holds (the scan and naturalize, the kit's other components,
// formulas, spacing and a picture's viewer), but the parts its manifest gives the editor. The rest of
// it is the component's, its events too, but for its slots (SLOT: a div or section of its own markup
// marked data-doc-slot, its manifest's part edited as "flow"), whose insides are the document's again:
// its blocks, read, edited, checked and drawn as anywhere in a flow, by the same mark and no catalog
// either. One rule tells whose an element is (heldBy), the same on the server (components/index.mjs
// heldByNode), in the kit and on the page. One of no package is shown as it stands, read-only, and the
// kit marks it so (FALLBACK), a note beside what it holds in a preview, and what a script of data in
// it holds, which no reader would see, drawn as the kit draws any (DATA_SHOWN); its slots stay the
// document's, and editable.

/** The attribute that makes an element an instance, its value the package's id: <scope>/<name>. */
export const ATTRIBUTE = "data-doc-component";

/** What a package's id looks like: <scope>/<name>. */
export const PACKAGE_ID = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/;

/** Where a document's instances are: what stops every system at the edge of one. */
export const INSTANCE = `div[${ATTRIBUTE}], section[${ATTRIBUTE}]`;

/** The attribute that makes an element of an instance's own markup a slot, its value the name of the part its manifest edits as "flow". */
export const SLOT = "data-doc-slot";

/** Where slots are: a block-level div or section so marked. */
export const SLOT_PART = `div[${SLOT}], section[${SLOT}]`;

/**
 * Where a component's region begins whose slots are the document's again: an instance of a package, and a
 * database (多维表格, div.doc-database: its records' bodies are slots of its, src/shared/database.mjs, the
 * rest of it its drawing's). The one rule below holds for both.
 */
export const HOLDER = `${INSTANCE}, div.doc-database`;

// The edges of a region: a holder, where the component's begins, and a slot, where the document's may again.
const REGION = `${HOLDER}, ${SLOT_PART}`;

// The nearest edge of a region around a node (itself left out), or null.
const edgeAround = (node) => node?.parentElement?.closest(REGION) ?? null;

/**
 * The instance whose own region a node of a page stands in, or null where it is the document's: the
 * edges around it folded from the outermost in. An instance met in the document's region opens its
 * component's; its own slot (one whose nearest edge is that instance) opens the document's again; an
 * instance or a slot met in a component's region stays that component's. A slot itself is its
 * instance's (the component places it), and an instance itself stands in the region around it (its
 * frame and its handle are Gallery's). For a page's DOM; the server's is heldByNode.
 */
export function heldBy(node) {
  const edge = edgeAround(node);
  if (!edge) return null;
  const owner = heldBy(edge);
  if (edge.matches(HOLDER)) return owner ?? edge;
  return owner !== null && edgeAround(edge) === owner ? null : owner;
}

/**
 * The region what an element holds stands in (its children, its words): the instance itself for an
 * instance, the document's (null) inside a slot that opens it again, and otherwise the region the
 * element stands in, as heldBy says it. heldBy for a child the element does not have yet, or has lost:
 * where a change of what it holds happened.
 */
export function heldWithin(element) {
  if (!element.matches(REGION)) return heldBy(element);
  const owner = heldBy(element);
  if (element.matches(HOLDER)) return owner ?? element;
  return owner !== null && edgeAround(element) === owner ? null : owner;
}

/** Whether an element is a slot that opens the document's region again: one of an instance that stands in the document's. */
const opensDocument = (node) => node.matches(SLOT_PART) && heldBy(node) !== null && edgeAround(node) === heldBy(node);

/**
 * Whether what happens on an element (a press, a key, a change of what it holds) is a component's: it
 * stands in an instance's own region. Not a slot that opens the document's (its blank is the page's
 * box), nor an instance itself (its frame is Gallery's).
 */
export const componentAt = (node) => node?.nodeType === 1 && heldBy(node) !== null && !opensDocument(node);

/**
 * The slot whose inside is the document's region a node stands in (one of an instance that stands in
 * the document's, opening it again), the nearest, or null for the page around it: where what is one
 * block of the page's is looked for (the editor's registry.mjs ownerOf).
 */
export function slotAround(node) {
  for (let at = node; at;) {
    const owner = heldBy(at);
    if (owner) {
      at = owner;
      continue;
    }
    const edge = edgeAround(at); // a slot, or none: no instance holds it
    if (!edge || opensDocument(edge)) return edge;
    at = edge; // a slot of no instance's: the region around it
  }
  return null;
}

/** The slots of an instance: those of its own markup (no other instance's, nor one in another slot), in document order. */
export const slotsIn = (instance) => [...instance.querySelectorAll(SLOT_PART)].filter((slot) => edgeAround(slot) === instance);

/** The kit's mark on an instance of no package, for its look (styles/installed.css). */
export const FALLBACK = "data-doc-fallback";

/** The fields and buttons of such an instance, which the kit makes inert: what it holds is read-only. */
export const CONTROLS = "input, select, textarea, button";

/**
 * The fields of an instance, whose keys are their own: Ctrl+Z there is the field's undo, and on a
 * button or anything else the component draws the page's.
 */
export const FIELDS = "input, textarea, select, [contenteditable]";

/** The kit's mark on a control it made inert, which goes with that when an export of the view takes it off. */
export const CONTROL_MARK = "data-doc-fallback-control";

/**
 * The kit's mark on words a component draws (DocKit.text, render/kit/runtime/gestures.js) while the reader
 * has typed in them since they took the caret: their Ctrl+Z the browser's, within them, until it takes them
 * back to what they said then; with none, it is the page's (the editor's pageUndo), as on any of the
 * component's drawing, never the browser's, whose one stack for the page would undo another field's words.
 */
export const TEXT_TYPED = "data-doc-text-typed";

/**
 * The mark on what a page or an export holds of a package, its value the package's id: a tag that
 * loads its files, the line that tells the kit of it, the inline copies of those. No document's source
 * holds one, and an import of an export takes them out.
 */
export const PACKAGE_MARK = "data-doc-package";

/**
 * The page editor's mark on a package's script on its way to a page served without it, its value the
 * package's id: until it has loaded or failed, that its component has not started says nothing.
 */
export const ARRIVING = "data-ge-arriving";

/** The scope of the workspace's own blocks (gallery block new <name>): the default pack's, 默认块包 (shared/pack-manifest.mjs). */
export const OWN_SCOPE = "local";

/** The scope of Gallery's own blocks named bare (gallery block add card, gallery/todos): its page cards, the look 「Gallery 风格」, and its blocks for documents. */
export const GALLERY_SCOPE = "gallery";

/**
 * The block pack the block `id`, whose manifest's `places` are those (left out or unread: ["document"]),
 * counts in (设置 › 组件列表's cards, a pack's switch, a menu's grey name, gallery block pack list): its scope,
 * but for Gallery's own blocks for documents alone (GALLERY_SCOPE, places holding no "page": the card, the
 * chart card and the three views of a table), which are the default pack's (OWN_SCOPE). Gallery's packs are
 * looks of a custom page's cards (Gallery 风格, 柔光风格); a block a document is written with is none of a
 * look's (the user's word of 2026-11-19). Their ids and their folders, components/gallery/<name>/, stay as
 * they were, so that nothing written of them changes: only where they are listed and switched.
 */
export function packOf(id, places) {
  const scope = String(id).split("/")[0];
  return scope === GALLERY_SCOPE && !(places ?? ["document"]).includes("page") ? OWN_SCOPE : scope;
}

/**
 * Whether the master switch of 设置 › 组件列表 is off for the block `id` (no menu and no library offers it,
 * what is written of it shows as ever), its manifest's `listed` that (left out: true) and gallery.json's lists
 * `settings` (unlisted, listed, each left out for none): a block listed by its manifest is off where the
 * user put it in `unlisted`; one whose manifest says `listed: false` (Gallery leaves it out of the menus
 * until the user wants it: 2026-11-20, the card and the chart card) is off unless the user put it in
 * `listed`. The one rule of the switch, as `hidden` and `shown` are of 在文档菜单里显示 (inDocumentMenus).
 */
export function unlistedBy(id, listed, settings) {
  const { unlisted = [], listed: turnedOn = [] } = settings ?? {};
  return listed === false ? !turnedOn.includes(id) : unlisted.includes(id);
}

/**
 * Whether the document's insert entries ("/", 在下方新建, the handle's grid) offer the
 * block `id` whose manifest's `places` are those (left out: ["document"]) and its `listed` that (left out:
 * true), by gallery.json's lists (`settings`: hidden, shown, disabled, unlisted, listed, packsOff, each left
 * out for none): one that says it stands in a document is offered unless hidden; one that does not, only
 * where shown; one disabled never, as it does not load, nor one unlisted (设置 › 组件列表's master switch
 * off: unlistedBy), nor one of a pack switched off (packsOff, the ids of the packs off: the
 * pack it counts in, packOf; the same as unlisted, for a whole pack). The one rule, which the server and the page
 * both run.
 */
export function inDocumentMenus(places, settings, id, listed = true) {
  const { hidden = [], shown = [], disabled = [], packsOff = [] } = settings ?? {};
  if (disabled.includes(id) || unlistedBy(id, listed, settings) || packsOff.includes(packOf(id, places))) return false;
  return (places ?? ["document"]).includes("document") ? !hidden.includes(id) : shown.includes(id);
}

/** What gallery.json's lists make of a package that loads, its manifest's `places` and `listed` with them: "disabled", "hidden" (no document's menu offers it: inDocumentMenus, which a block unlisted is too) or "normal". */
export const settingState = (id, settings, places, listed = true) => (settings.disabled.includes(id) ? "disabled" : inDocumentMenus(places, settings, id, listed) ? "normal" : "hidden");

/** The class of the kit's note in such an instance, in a preview alone. */
export const NOTE = "doc-component-note";

/** The class of what the kit draws of a script of data in such an instance (runtime/shown-data.js), wherever it is shown. */
export const DATA_SHOWN = "doc-component-data";
/** Its marks, for its look: a value alone at its top, a list of values alone below it, a cell of a few words. */
export const DATA_ONE = "doc-component-one";
export const DATA_LINE = "doc-component-line";
export const DATA_SHORT = "doc-component-short";

/**
 * What is no text block, whatever a manifest says of it: an element whose words a reader neither sees
 * nor types (a script, a style, a field's value, a drawing) or that stands around blocks and holds no
 * inline text of its own (a list, a table, a disclosure).
 */
export const NO_TEXT = new Set([
  "script", "style", "template", "noscript", "textarea", "select", "svg", "math", "iframe", "object", "canvas", "video", "audio", "img", "input", "hr", "br",
  "ul", "ol", "dl", "table", "thead", "tbody", "tfoot", "tr", "details",
]);

// What takes a page over wherever it stands: a frame or a plugin, a style sheet, or what changes how
// the page reads (`noscript` and the like, which parsers read two ways).
const TAKES_OVER = new Set(["iframe", "frame", "frameset", "object", "embed", "applet", "base", "meta", "link", "style", "noscript", "noembed", "noframes", "plaintext", "xmp"]);
const NO_CODE = /^application\/(?:\S+\+)?json$/i;
const CODE_ADDRESS = /^(?:javascript|vbscript):/i;
const ANIMATES = new Set(["animate", "set"]);
// A style that takes an element out of its block to stand anywhere over the page, or that hides what
// it says in an escape or a comment. Any other keeps it in its place: a share of a row, a color.
const LEAVES_ITS_PLACE = /position\s*:\s*(?:fixed|absolute|sticky)|\\|\/\*/i;

/**
 * Whether an element a clipboard brings in the markup of an instance may not come onto a page. A copy
 * made from another document is the one instance no file vouches for, and any page can write a
 * clipboard: nothing in it runs (a script but one of data, a handler, an address of code, one an
 * animation writes, a frame's own document), nothing says it is the editor's, and nothing leaves its
 * block for the rest of the page. `attributes`: the element's, [{ name, value }]. The page asks before
 * it makes the block and the server before it writes it, and a template, which a menu puts in as
 * such, is held to the same (component-catalog.mjs templateProblem).
 */
export function refusedInCopy(tag, attributes) {
  const named = (wanted) => attributes.find(({ name }) => name.toLowerCase() === wanted)?.value ?? "";
  const name = tag.toLowerCase();
  if (TAKES_OVER.has(name) || (name === "script" && !NO_CODE.test(named("type").trim()))) return true;
  if (ANIMATES.has(name) && /href|^on/i.test(named("attributename"))) return true;
  return attributes.some((attribute) => {
    const key = attribute.name.toLowerCase();
    return key.startsWith("on") || key === "srcdoc" || /^data-(?:ge|rs)-/.test(key) || (key === "style" && LEAVES_ITS_PLACE.test(attribute.value)) || CODE_ADDRESS.test(String(attribute.value).replace(/[\u0000- ]/g, ""));
  });
}

// What of TAKES_OVER a whole page goes without, besides a script: a plugin, a frame set, a base (every address of
// the page, the kit's own scripts among them, loaded from where it says), a link (the page's styles are its own
// <style>: an export's and the kit's tags an import takes out), and what parsers read two ways (noscript and the
// like). A page keeps its frames (its embed blocks), its <style> and its metas but one that acts (http-equiv: a
// refresh, a cookie), which TAKES_OVER refuses a copy.
const RUNS_IN_PAGE = new Set(["object", "embed", "applet", "frame", "frameset", "portal", "base", "link", "noscript", "noembed", "noframes", "plaintext", "xmp"]);

/**
 * What of an element of a whole page no one this computer trusts wrote (an import of another's export or
 * document: src/transfer/own-report.mjs inertPage) would run there, by the rules of a copy (refusedInCopy) but
 * for what a document holds of its own (its frames, styles and metas): `element` true for the element and all it
 * holds (a script but one of data, what RUNS_IN_PAGE names, an animation of an address or a handler, a meta that
 * acts), else `attributes`, those that run (a handler, a frame's own document, an address of code), [] for none.
 * `attributes`: the element's, [{ name, value }].
 */
export function runsInPage(tag, attributes) {
  const named = (wanted) => attributes.find(({ name }) => name.toLowerCase() === wanted)?.value ?? "";
  const name = tag.toLowerCase();
  if (RUNS_IN_PAGE.has(name) || (name === "script" && !NO_CODE.test(named("type").trim()))) return { element: true, attributes: [] };
  if (ANIMATES.has(name) && /href|^on/i.test(named("attributename"))) return { element: true, attributes: [] };
  if (name === "meta" && named("http-equiv").trim() && !/^content-type$/i.test(named("http-equiv").trim())) return { element: true, attributes: [] };
  const running = attributes.filter((attribute) => {
    const key = attribute.name.toLowerCase();
    return key.startsWith("on") || key === "srcdoc" || CODE_ADDRESS.test(String(attribute.value).replace(/[\u0000- ]/g, ""));
  });
  return { element: false, attributes: running };
}

// The ids the preview's server and its editor give elements of their own: the editor's map of the page, which
// the server writes before the page (src/editor/service.mjs) and the editor takes the first of; the kit's
// display menu; the editor's own nodes (ge-…).
const SERVED_IDS = /^(?:doc-edit-map|doc-display-menu|ge-.*)$/i;

/**
 * The attributes of an element of a page no one this computer trusts wrote (inertPage, as runsInPage) that only the
 * preview's server, its editor or the kit write, never a document: an id of theirs (SERVED_IDS: a page that wrote
 * the editor's map's would have the editor take its own, and save nothing), the editor's marks (data-ge-…, data-rs-…
 * before 2026-10-28, as refusedInCopy refuses them) and the mark of what the preview alone shows (data-doc-dev).
 * `attributes`: the element's, [{ name, value }]; returns those of them.
 */
export const servedMarks = (attributes) => attributes.filter(({ name, value }) => {
  const key = name.toLowerCase();
  return /^data-(?:ge|rs)-/.test(key) || key === "data-doc-dev" || (key === "id" && SERVED_IDS.test(String(value).trim()));
});

/**
 * Whether an element may not stand in what a component writes to a data part: what no copy may hold
 * (refusedInCopy), any script, and a block's identity, which is the file's. The page asks of a draft
 * before anything changes and the server of what a commit carries, whoever sent it.
 */
export const refusedInData = (tag, attributes) => tag.toLowerCase() === "script" || attributes.some(({ name }) => name.toLowerCase() === "data-block-id") || refusedInCopy(tag, attributes);

// What holds no markup as an element's inside: words, or a fragment apart.
const READ_AS_WORDS = new Set(["template", "textarea", "title"]);

/** Whether an element cannot be a data part, a script of data aside: what it holds would not read as what was written. */
export const noDataPart = (tag) => READ_AS_WORDS.has(tag.toLowerCase()) || refusedInData(tag, []);

/** Whether an element is a script of data, the one script a data part may be and none may hold. */
export const isDataScript = (tag, attributes) => tag.toLowerCase() === "script" && NO_CODE.test((attributes.find(({ name }) => name.toLowerCase() === "type")?.value ?? "").trim());

/** Whether `text` may be what such a script holds: JSON, with nothing in it that ends the script or makes a parser read on past its end. */
export function fitsDataScript(text) {
  if (/<\/script|<!--/i.test(text)) return false;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * The most a component writes in one commit, in bytes, well inside what a commit carries (service.mjs
 * maxBody): a part holds no more, a page sends no more (commit.mjs `build`, what is left going with its
 * next commit) and the server takes no more of a unit.
 */
export const DATA_MOST = 1024 * 1024;

/** The attribute on an instance that says in which shape it holds its content: a whole number its component chooses. */
export const SCHEMA = "data-doc-schema";

/**
 * Whether an instance says it holds its content in a shape the manifest does not reach (`value`, its
 * SCHEMA; `schema`, the manifest's, 1 where it says none): written by a newer version of the package,
 * it is read-only, its words and all. A value that is no number, or none at all, is no shape anything
 * here can read.
 */
export const schemaAhead = (value, schema = 1) => value !== null && value !== undefined && !(String(value).trim() !== "" && Number(value) <= schema);

/** Where the instances of the package `id` are. */
export const instanceMatch = (id) => `div[${ATTRIBUTE}="${id}"], section[${ATTRIBUTE}="${id}"]`;

export default {
  id: "installed",
  category: "whole",
  match: INSTANCE,
  // An instance's slots are flows: what they hold is the document's blocks (FLOWS, styles/flow.css). A
  // plain string, [SLOT]: an expression here would keep this description in every bundle that imports a
  // constant of this file (the runtime takes none of its prose).
  flow: "[data-doc-slot]",
  attrs: {
    "data-doc-component": "the package an instance is of: <scope>/<name>, on a block-level div or section",
    "data-doc-schema": "the shape an instance holds its content in: a whole number its component chooses, read-only past its manifest's schema",
    "data-doc-slot": "a slot of an instance: the part of its manifest edited as flow, by name, on a block-level div or section in the instance's own region; what it holds is the document's blocks",
    "data-doc-from": "on an instance of a custom block whose needs hold tables: the key of the table it is a view of, which the table's frame carries as data-doc-chart-source",
  },
  runtime: {
    generated: [".doc-component-note", ".doc-component-data"],
    attrs: { "[data-doc-fallback]": ["data-doc-fallback"], "[data-doc-fallback-control]": ["data-doc-fallback-control", "inert"] },
    // Of what the kit drew of a script of data: a line saying what it left out, and its marks; the mark
    // DocKit.drag (runtime/gestures.js) puts on what a component draws while it is dragged, a class; and the
    // marks DocKit.text puts on words a component draws that are typed in where they stand, and their gray
    // words while they are empty (on its generated nodes, which go with them).
    internal: [PACKAGE_MARK, "doc-component-more", DATA_ONE, DATA_LINE, DATA_SHORT, "doc-dragging", "data-doc-text", "data-doc-text-empty", TEXT_TYPED],
  },
};
