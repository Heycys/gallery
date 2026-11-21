import { ARRIVING, ATTRIBUTE, DATA_MOST, DATA_SHOWN, FALLBACK, FIELDS, INSTANCE, TEXT_TYPED, NO_TEXT, PACKAGE_MARK, SCHEMA, SLOT, SLOT_PART, componentAt, fitsDataScript, heldBy, instanceMatch, isDataScript, noDataPart, refusedInData, schemaAhead, slotsIn } from "../../../shared/components/installed.mjs";
import { referencedIds } from "../../../shared/copy-ids.mjs";
import { jsonIn } from "../../../shared/json-layout.mjs";
import { CHART_SOURCE, VIEW_FROM } from "../../../shared/table-chart.mjs";
import { language, t } from "../../../shared/i18n/index.mjs";
import { searchWords } from "../../../shared/pinyin.mjs";
import { caretAt, editable } from "../../page/caret.mjs";
import { htmlToBlocks, parseClipboardHTML } from "../../page/clipboard/import/html.mjs";
import { toBlocks } from "../../page/clipboard/import/to-blocks.mjs";
import { build as buildBlock } from "../../page/clipboard/own/blocks.mjs";
import { copyOf } from "../../page/clipboard/own/describe.mjs";
import { ownIds } from "../../page/clipboard/own/ids.mjs";
import { firstHost, newHost, unitElement } from "../../page/core.mjs";
import { openSettings } from "../../page/board/settings.mjs";
import { bindAbove, keyOf, tableChoices } from "../../page/table/binding.mjs";
import { addStyle } from "../../page/ui.mjs";
import { accepts, capsFor } from "../registry.mjs";
import { SETTINGS_ICON } from "../icons.mjs";
import { ICON } from "./index.mjs";
import { followCatalog, followSettings, isBehind } from "./served.mjs";

// 组件 on the page: events go by region, one rule. What comes down inside an instance and in no text
// block of it is the component's, and the editor lets go (`keepsKeys`: as a field of a block, an input
// or a textarea, keeps its keys and its clipboard, so does all that stands in an instance, its buttons
// and what it draws, but undo and redo on what is no
// field, which has none of its own). Its text parts are the editor's: Enter, Backspace, Ctrl+Z and a
// selection as in any words. Its outer frame and its handle are Gallery's: moving, copying and deleting
// it whole, as for any block. What a press does here, the block tools clearing, menus closing and the
// format bar going, stays: no event is stopped, and a press in a component is only no press the editor
// answers (`readOnly` in index.mjs says nothing of it, and the format bar comes back over no selection).
//
// The page holds the catalog as the server gave it (its map's `components`): a page with no instance
// of a package that changes is told so and stays as it is, as being shown again would cost its undo
// steps, so it reads the new list from its own address, which is what a load of the page would have
// read (`doc-catalog-changed`, src/server/routes.mjs). An instance is made from a template or from
// what a clipboard carried, here as what the kit would start: its text parts text blocks at once, the
// caret among them. The first instance of a package on a page served without it, by whatever way it
// came, brings it: the tags of the map, once, where the server would have put them.
//
// A part its manifest edits as data is the component's and nothing of the editor's goes in. What
// writes it is `context.edit`, which the kit asks of the page (`doc-component-edit`): the page gives the
// component a draft of each part it names, off the page, and copies of what it made of them go in, one
// `source` step of undo, or, should it throw, write the part on the page or make what the file could
// not hold, nothing has happened. The commits find what changed as they find a table's (`dataOf`,
// core.mjs dataChanges), each part as the kit's dehydrate leaves it, so that what the component leaves
// on it by its manifest's `runtime` is no change, and they write what differs and nothing else. An
// instance written whole, made or put back, holds what the file says (`dataIn`), read the same way. What
// the reader writes over someone else's change of a part (仍然调整) is a step of its own from theirs
// (`overwrite`), so that one undo gives the file's back.
// One past its manifest's `schema` is read-only, its words and all.
//
// Its slots (data-doc-slot, the parts its manifest edits as flow) are the page's: boxes of kind "slot"
// (index.mjs), whose blocks are edited, moved and undone as anywhere, a press or a key in one no
// component's (componentAt), whatever state the instance is in, one of no package too. Enter in a text
// part goes into the first slot after it, as in a disclosure's title. An empty one says so while the
// page is edited, and a click on it makes a paragraph (insert/, holdsOne), as a disclosure's content.
// The component reads a slot (context.part) and hears what changes in it (source), and writes nothing
// there: a slot it takes off its instance is put back where it stood (`keepSlots`), so that no commit
// takes the reader's blocks out. An instance made on the page, from "/", a clipboard or 恢复我的, has its
// slots as boxes made on the page, their blocks made on the page as any (`slotsMade`), which the commit
// carries apart from its markup (index.mjs `extras`) and the answer names, so that they edit at once; a
// copy carries them so too, in its document as well (`copiesAsItself`, index.mjs `data`).

let held = null; // the map, what makes a block with no editor (the transfer worker) finds none of

// A package as the page knows it. One hidden is one like any other but in a menu: its instances run, copy
// and go by its name. One turned off is none from the moment the page hears, whatever its list still
// says: what a clipboard brings would load it, and only a list that came would say otherwise.
const entryOf = (id) => held?.components?.find((entry) => entry.id === id && entry.state !== "disabled") ?? null;

// What the page runs of each package, by id: the stamp it came with and that of its manifest.
const brought = new Map();

// On an instance its component wrote: the stamp of the manifest that component ran by, which the write
// goes by wherever it is sent from, a page taking up what one that is gone left (autosave.mjs recover)
// running the manifest there is now.
const WRITTEN_BY = "data-ge-definition";

// Whether the page runs an older version of a package than `entry` says, which only a load mends.
const overtaken = ({ id, stamp }) => brought.has(id) && brought.get(id).stamp !== stamp;

// On an instance, the parts of it one edit wrote together, as lists of names (JSON): they go to the file
// together, or wait together for the reader where someone else changed one of them, as the edit's one
// undo step takes them together. On the instance, as its stamp is, so that a page taking up what one that
// is gone left (its body, autosave.mjs recover) sends them so too.
const WRITTEN_TOGETHER = "data-ge-together";
const writtenTogether = (instance) => {
  try {
    const groups = JSON.parse(instance.getAttribute(WRITTEN_TOGETHER) ?? "[]");
    return Array.isArray(groups) ? groups.filter(Array.isArray) : [];
  } catch {
    return [];
  }
};

// A tag of a package's as an element that will run: what a template's content holds never does.
function tagFrom(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  const written = template.content.firstElementChild;
  const tag = document.createElement(written.localName);
  for (const { name, value } of written.attributes) tag.setAttribute(name, value);
  tag.textContent = written.textContent;
  if (written.localName === "script") tag.async = false; // in the order they are put in
  return tag;
}

// Right after the last of the kit's and the packages' of its kind, as a page is served (render/assets.mjs afterKitTags).
function put(tag) {
  const kind = tag.localName;
  const last = [...document.querySelectorAll(`${kind}[data-doc-kit], ${kind}[data-doc-vendor], ${kind}[${PACKAGE_MARK}]`)].at(-1);
  if (last) last.after(tag);
  else (kind === "link" ? document.head : document.body).append(tag);
}

// The kit's file a tag loads is on the page already (by another package, or as the page was served).
const onPage = (tag) => ["data-doc-kit", "data-doc-vendor"].some((mark) => tag.hasAttribute(mark) && document.querySelector(`[${mark}="${tag.getAttribute(mark)}"]`));

// The instances of a package start, or show why they do not, now that its files are in.
const started = (id) => document.querySelectorAll(instanceMatch(id)).forEach((host) => globalThis.DocKit?.mount(host));

// A package on a page served without it: its tags in order, styles then scripts, the kit's files it
// asks for first. Its description is told at once, its script's own turn comes as it loads.
function bring({ id, stamp, definition, kit = [], tags }) {
  if (brought.has(id)) return;
  brought.set(id, { stamp, definition });
  const all = [...kit, ...tags.styles, ...tags.scripts].map(tagFrom).filter((tag) => !onPage(tag));
  const script = all.find((tag) => tag.localName === "script" && tag.src && tag.hasAttribute(PACKAGE_MARK));
  const done = () => {
    script?.removeAttribute(ARRIVING);
    started(id);
  };
  script?.setAttribute(ARRIVING, id);
  script?.addEventListener("load", done, { once: true });
  script?.addEventListener("error", done, { once: true });
  all.forEach(put);
  if (!script) done();
}

// An instance's parts as its manifest says them, as the kit was told. None before its description has come.
const partsOf = (instance) => Object.entries(globalThis.DocKit?.description(instance.getAttribute(ATTRIBUTE))?.parts ?? {});
// Whether an instance holds its content in a shape its manifest does not reach, as the kit was told it.
const ahead = (instance) => schemaAhead(instance.getAttribute(SCHEMA), globalThis.DocKit?.description(instance.getAttribute(ATTRIBUTE))?.schema);
// The elements of a part an instance holds, of its own region (none of an instance in it, none of what
// its slots hold, no slot itself) and none of what the kit draws of a script of data there, which is
// no element of the file's.
const elementsOf = (instance, at) => [...instance.querySelectorAll(at)].filter((part) => !part.matches(INSTANCE) && !part.matches(SLOT_PART) && part.parentElement.closest(INSTANCE) === instance && heldBy(part) === instance && !part.closest(`.${DATA_SHOWN}`));

// The elements of an instance its component writes, [[name, element]], as the server finds them
// (file.mjs dataParts): of each part edited as data the first it holds, as context.part does. One in
// another is written with that one, and an element two parts name is the first's.
function dataParts(instance) {
  const first = partsOf(instance).filter(([, { edit }]) => edit === "data").map(([name, { at }]) => [name, elementsOf(instance, at)[0]]).filter(([, part]) => part);
  return first.filter(([, part], index) => !first.some(([, other], at) => (other !== part && other.contains(part)) || (other === part && at < index)));
}
const dataOf = (instance) => Object.fromEntries(dataParts(instance).map(([name, part]) => [name, part.innerHTML]));

// The elements of an instance its package edits as text, as the server's scan finds them
// (file.mjs textParts), in the file's order: what stands in a data part or holds one is the component's,
// and one past its manifest has none.
function textParts(instance) {
  if (ahead(instance)) return [];
  const said = partsOf(instance).filter(([, { edit }]) => edit === "text");
  const data = dataParts(instance).map(([, part]) => part);
  const parts = [...new Set(said.flatMap(([, { at }]) => elementsOf(instance, at)))].filter((part) => !NO_TEXT.has(part.localName) && !data.some((other) => other.contains(part) || part.contains(other)));
  return parts.filter((part) => !parts.some((other) => other !== part && other.contains(part))).sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}

// All an element holds, what a <template> keeps apart among it.
const allIn = (root) => [...root.querySelectorAll("*")].flatMap((node) => (node.localName === "template" ? [node, ...allIn(node.content)] : [node]));

// Why what a component made of a draft of `part` cannot go in, as the server would say (file.mjs
// `rewrite`), for who writes the component, or null.
function draftProblem(part, draft) {
  if (draft.cloneNode(false).outerHTML !== part.cloneNode(false).outerHTML) return "a part's own tag and attributes are the file's: a change writes what it holds";
  const html = draft.innerHTML;
  if (new TextEncoder().encode(html).length > DATA_MOST) return `it holds more than the ${DATA_MOST} bytes one commit writes`;
  const attributes = [...part.attributes];
  if (part.localName === "script") return isDataScript(part.localName, attributes) && fitsDataScript(html) ? null : "a script of data holds JSON, with nothing in it that ends a script: write < as \\u003c";
  if (noDataPart(part.localName)) return `a <${part.localName}> is no part a component can write`;
  const read = part.cloneNode(false);
  read.innerHTML = html;
  if (read.innerHTML !== html) return "what it holds does not read back as itself (a row with no tbody, a block in a paragraph): a file would hold something else";
  const refused = allIn(draft).find((node) => refusedInData(node.localName, [...node.attributes]));
  return refused ? `a data part holds no <${refused.localName}> of that kind: no script, handler, frame, address of code, data-block-id or data-ge-*` : null;
}

/**
 * What a component asks to write (`{ parts, run }`, the kit's: the parts it names and its change, handed a
 * draft of each by name), on `instance`: { changed, put } where it can go in, `changed` the parts it
 * changes as [part, what it held, its draft, its name] and `put()` writing them (copies of the drafts go
 * in, so that a draft the component keeps reaches nothing on the page) and marking the instance written by
 * its manifest; null where it is refused, said on the console: the change threw, wrote the part on the page
 * rather than the draft it was handed (put back: its step would undo the change it left out), or made what
 * the file could not hold (draftProblem). Its undo step is the caller's: a `source` step of its own
 * (`write` of create), or the table's change it goes with (page/table/views.mjs, by the page object's
 * `drafted`: a view's change of its table and of its own parts, one step).
 */
function drafted({ parts, run }, instance) {
  const id = instance.getAttribute(ATTRIBUTE);
  const refuse = (problem) => {
    console.error(`[DocKit] ${id}: context.edit: ${problem}`);
    return null;
  };
  if (!Array.isArray(parts) || typeof run !== "function" || !parts.every(({ part }) => part?.nodeType === 1 && instance.contains(part))) return refuse("it names no part of its own");
  const before = parts.map(({ part }) => part.innerHTML);
  const drafts = parts.map(({ part }) => part.cloneNode(true));
  const ran = run(Object.fromEntries(parts.map(({ name }, index) => [name, drafts[index]])));
  const live = parts.findIndex(({ part }, index) => part.innerHTML !== before[index]);
  if (live >= 0) {
    parts.forEach(({ part }, index) => { if (part.innerHTML !== before[index]) part.innerHTML = before[index]; });
    return refuse(`it wrote the part ${parts[live].name} on the page: a change writes the draft it is handed, which goes onto the page when it returns`);
  }
  if (!ran) return null;
  for (const [index, { name, part }] of parts.entries()) {
    const problem = draftProblem(part, drafts[index]);
    if (problem) return refuse(parts.length > 1 ? `${name}: ${problem}` : problem);
  }
  const changed = parts.map(({ name, part }, index) => [part, before[index], drafts[index], name]).filter(([, was, draft]) => draft.innerHTML !== was);
  return {
    changed,
    put() {
      if (changed.length === 0) return;
      for (const [part, , draft] of changed) part.replaceChildren(...draft.cloneNode(true).childNodes);
      instance.setAttribute(WRITTEN_BY, brought.get(id)?.definition ?? "");
      if (changed.length > 1) {
        const names = new Set(changed.map(([, , , name]) => name));
        const groups = writtenTogether(instance);
        const joined = groups.filter((group) => group.some((name) => names.has(name)));
        instance.setAttribute(WRITTEN_TOGETHER, JSON.stringify([...groups.filter((group) => !joined.includes(group)), [...new Set([...names, ...joined.flat()])]]));
      }
    },
  };
}

// What the text blocks of an instance are to contenteditable: an instance the kit shows as it stands,
// its component failed or its script started nothing, takes no word, as one of no package does.
const openness = (instance) => (instance.hasAttribute(FALLBACK) ? "false" : "true");

// Its text blocks as it stands now, for as long as it stands so: a later mount opens them again.
function followFallback(instance) {
  const value = openness(instance);
  for (const part of instance.querySelectorAll('[data-ge-kind="installed"]')) {
    if (part.parentElement.closest(INSTANCE) === instance && heldBy(part) === instance && part.getAttribute("contenteditable") !== value) part.setAttribute("contenteditable", value);
  }
}

// Its text parts text blocks now: `data-ge-part`, holding what each said, until the commit that writes
// the instance names them. What the file then says is what they start from: words typed before that
// go with the next commit, an untouched one shows the file's, and one the file takes for no text
// block (more than words in it: `notText`) is read-only from then on.
function editableParts(instance) {
  const parts = textParts(instance);
  for (const part of parts) for (const [name, value] of [["contenteditable", openness(instance)], ["data-ge-part", part.innerHTML], ["data-ge-kind", "installed"], ["data-ge-caps", capsFor("installed")], ["data-ge-framed", ""]]) part.setAttribute(name, value);
  return parts;
}

/** A new instance from its markup, marked as made on the page, not on it yet. Ids it does not name itself go, as from a copy. */
function newInstance(doc, html) {
  const template = doc.createElement("template");
  template.innerHTML = html;
  const instance = doc.importNode(template.content.firstElementChild, true);
  const all = [instance, ...instance.querySelectorAll("*")];
  const named = referencedIds(all.flatMap((node) => [...node.attributes]));
  for (const node of all) if (node.id && !named.has(node.id)) node.removeAttribute("id");
  for (const [name, value] of [["data-ge-new", ""], ["data-ge-type", "installed"], ["data-ge-unit-kind", "installed"], ["data-ge-frame", ""], ["contenteditable", "false"]]) instance.setAttribute(name, value);
  return instance;
}

/**
 * The slots of a new instance as boxes made on the page, each holding what `fill(slot)` gives (blocks
 * made on the page), or an empty paragraph, where the reader writes: what the commit writes in them
 * goes apart from the instance's markup (index.mjs `extras`), and the page knows each block of it by
 * the commit's answer, as one made in a new column.
 */
function slotsMade(doc, instance, fill) {
  for (const slot of slotsIn(instance)) {
    const blocks = fill(slot);
    slot.setAttribute("data-ge-box", "");
    slot.setAttribute("data-ge-box-kind", "slot");
    slot.replaceChildren(...(blocks.length > 0 ? blocks : [newHost(doc, "paragraph")]));
  }
}

// What a template's slot holds, as blocks made on the page: read as HTML pasted from elsewhere is
// (clipboard/import/), each block what a paste makes of it there.
function blocksOfTemplate(doc, slot) {
  if (!slot.firstElementChild && !slot.textContent.trim()) return [];
  const specs = htmlToBlocks(parseClipboardHTML(slot.innerHTML), {});
  return specs.length > 0 ? toBlocks(specs, "slot").map((block) => buildBlock(doc, block)) : [];
}

/**
 * An instance from what a clipboard carried (`data`): the file is written from that markup, which the
 * commit sends, its slots empty; what they held comes as blocks of their own (`flows`, by name),
 * made again here as any pasted block (`inner`).
 */
export function build({ doc, block, inner }) {
  const entry = entryOf(block.package);
  if (entry) bring(entry);
  const instance = newInstance(doc, block.html);
  instance.setAttribute("data-ge-copy", block.html);
  slotsMade(doc, instance, (slot) => inner?.(block.flows?.[slot.getAttribute(SLOT)] ?? []) ?? []);
  editableParts(instance);
  return instance;
}

let listed = true; // whether the list says what the server last did: no read of it on its way, none that failed
let reads = 0; // the reads of the list begun

// The list as a load of the page would give it, read from the page's own address: nothing of the page
// changes. Reads may cross: the last one begun is what the server last did, whichever answers last.
async function readList() {
  const read = ++reads;
  listed = false;
  const answer = await fetch(location.href, { cache: "no-store" }).catch(() => null);
  const text = answer?.ok ? await answer.text().catch(() => null) : null;
  const map = text && new DOMParser().parseFromString(text, "text/html").getElementById("doc-edit-map");
  if (read !== reads || !map) return;
  held.components = JSON.parse(map.textContent).components ?? [];
  listed = true;
}

// Whether an instance of a package can come onto the page as it is (`entry`, as entryOf finds it): the
// list says what the package is now, and the page runs that or nothing of it, so that the instance brings it.
const inStep = (entry) => listed && entry !== null && !overtaken(entry);

/**
 * An instance on the page, a page's new one: of a package the page is behind on that cannot come as it
 * is, what a page holding one when it changed has had; else its package brought, what it holds as text
 * blocks where it came with none.
 */
function arrive(instance) {
  if (!instance.isConnected || heldBy(instance)) return;
  const id = instance.getAttribute(ATTRIBUTE);
  const entry = entryOf(id);
  if (isBehind(id) && !inStep(entry)) return void window.dispatchEvent(new CustomEvent("doc-components-changed"));
  if (!entry) return;
  bring(entry);
  started(id);
  if (!instance.querySelector("[data-ge-block], [data-ge-part]")) editableParts(instance);
}

// A slot of the page's (a box) taken off an instance still on the page, by its component's script
// (`node`, what was taken off from `from`, before `next`; the instance itself taken off is the editor's
// doing, and none of this): a slot is the document's, which no component writes, so it goes back where
// it stood, what it holds with it, and the reader's blocks stay, on the page and in the file. Who
// wrote the package hears of it.
function keepSlots(node, from, next) {
  if (node.nodeType !== 1 || node.matches(INSTANCE) || !from.isConnected) return;
  const instance = from.closest(INSTANCE);
  const slots = [node, ...node.querySelectorAll(SLOT_PART)].filter((slot) => slot.matches(`:is(${SLOT_PART})[data-ge-box]`) && !slot.parentElement?.closest(INSTANCE));
  if (!instance || slots.length === 0) return;
  for (const slot of slots) from.insertBefore(slot, next?.parentNode === from ? next : null);
  console.error(`[DocKit] ${instance.getAttribute(ATTRIBUTE)}: a slot left its instance: it is put back, its blocks the document's`);
}

// A slot the file has empty (an Agent's): what a disclosure's content says (details/page.mjs), a click
// on it making a paragraph there (insert/ clickBlank).
const SLOT_EMPTY = `
  [data-ge-editing] [data-doc-slot][data-ge-box]:not(:has(> *))::before { content: ${JSON.stringify(t("空白内容区。点击或拖动区块到这里。"))}; display: block; padding: 3px 2px; border-radius: 4px; color: var(--ge-tx3); cursor: pointer; transition: background 20ms ease-in; }
  [data-ge-editing] [data-doc-slot][data-ge-box]:not(:has(> *)):hover::before { background: var(--ge-hover); }
`;

/** An instance on the page: what its events are, what Enter does in its words, and what the menus make of its package. */
export function create({ map, newParagraph, active, sourceStep, struct, look }) {
  held = map;
  addStyle(SLOT_EMPTY);
  // Whether a key in an instance, on no field of it, is undo or redo: a button or what a component draws
  // has no undo of its own, and a press on one that wrote leaves the focus there, from where the page's
  // undo goes on through every step, as it does from anywhere on the page. A field keeps
  // its own; but words a component draws (DocKit.text, data-doc-text) only while what was typed in them since
  // they took the caret is still to take back (TEXT_TYPED): the browser's one stack for the page would
  // otherwise undo another field's words, so the page's undo goes on there as from the drawing around them.
  const pageUndo = (node, event) => {
    const key = event?.key?.toLowerCase();
    const field = node.matches(FIELDS) && !(node.matches("[data-doc-text]") && !node.hasAttribute(TEXT_TYPED));
    return Boolean(event?.ctrlKey || event?.metaKey) && !event.altKey && (key === "z" || key === "y") && !field;
  };
  // What a component asks to write (`detail` of doc-component-edit: drafted), one `source` step of its own:
  // whether it was taken.
  function write(detail, instance) {
    if (!active()) return false;
    const taken = drafted(detail, instance);
    if (!taken) return false;
    if (taken.changed.length === 0) return true;
    taken.put();
    sourceStep(taken.changed.map(([part, was]) => [part, was]));
    return true;
  }
  // ---------- 设置 ----------
  // An instance's 设置 (the handle's menu; the board's form of a custom page, page/board/settings.mjs, whose
  // menu cards a choice is made in): the fields its manifest's `settings` lists, kept in its part
  // `settings` (a script of JSON, what `context.editJSON` writes: one undo step, a change laid out as the
  // part was), and for a view of a table (needs "tables") which table it reads, kept in its VIEW_FROM and on
  // the table's frame (binding.mjs), one undo step too. Null where it has none: no field, or no part to keep
  // them in, and no table to choose; an instance that does not run or that is past its manifest has no form.
  const TABLE_FIELD = "__table"; // the form's field for the table: no setting of the manifest's
  const settingsIn = (part) => {
    try {
      const value = JSON.parse(part?.textContent?.trim() || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  };
  function formOf(instance) {
    if (!active() || instance.hasAttribute(FALLBACK) || ahead(instance)) return null;
    const entry = entryOf(instance.getAttribute(ATTRIBUTE));
    if (!entry) return null;
    const part = dataParts(instance).find(([name]) => name === "settings")?.[1] ?? null;
    const fields = part ? entry.settings ?? [] : [];
    const reads = entry.needs?.includes("tables") ?? false;
    return fields.length > 0 || reads ? { entry, part, fields, reads } : null;
  }
  // The values of the manifest's fields put in the part, one `source` step, as editJSON writes them.
  function writeSettings(instance, part, values) {
    write({
      parts: [{ name: "settings", part }],
      run({ settings: draft }) {
        const text = draft.textContent ?? "";
        const current = settingsIn(draft);
        draft.textContent = text.trim() ? jsonIn(text, { ...current, ...values }) : JSON.stringify({ ...current, ...values });
        return true;
      },
    }, instance);
  }
  // The table a view reads put on it, as one undo step: its key on both, a new one on a table with none.
  function readTable(instance, frame) {
    const key = frame ? keyOf(frame) : null;
    const keyed = frame && frame.getAttribute(CHART_SOURCE) !== key;
    look([instance, ...(keyed ? [frame] : [])], [{ attributes: { [VIEW_FROM]: key } }, ...(keyed ? [{ attributes: { [CHART_SOURCE]: key } }] : [])]);
  }
  function openFormOf(instance) {
    const form = formOf(instance);
    if (!form) return;
    const choices = form.reads ? tableChoices() : [];
    const bound = form.reads ? choices.findIndex(({ frame }) => frame.getAttribute(CHART_SOURCE) === instance.getAttribute(VIEW_FROM) && instance.hasAttribute(VIEW_FROM)) : -1;
    const fields = [
      ...(form.reads ? [{ key: TABLE_FIELD, label: t("表格"), type: "choice", choices: [["", t("（未选择）")], ...choices.map(({ label }, at) => [String(at), label])] }] : []),
      ...form.fields,
    ];
    const box = instance.getBoundingClientRect();
    const top = Math.min(Math.max(box.top, 8), innerHeight - 40);
    openSettings({
      fields, name: form.entry.name,
      values: { ...(form.part ? settingsIn(form.part) : {}), ...(form.reads ? { [TABLE_FIELD]: bound >= 0 ? String(bound) : "" } : {}) },
      anchor: { left: box.left, right: box.right, top, bottom: top + 8, width: box.width, height: 8 },
      save({ [TABLE_FIELD]: table, ...values }) {
        if (table !== undefined) readTable(instance, table === "" ? null : choices[Number(table)]?.frame ?? null);
        if (Object.keys(values).length > 0 && form.part?.isConnected) writeSettings(instance, form.part, values);
      },
    });
  }
  return {
    /** An instance's own rows in its block menu: 设置…, where it has a form (formOf). */
    menuItems: (unit) => (formOf(unit) ? [{ label: t("设置…"), icon: SETTINGS_ICON, run: () => openFormOf(unit) }] : []),
    keepsKeys: (node, event) => componentAt(node) && !editable(node) && !pageUndo(node, event),
    undoHere: (node) => componentAt(node) && !editable(node),
    keys: {
      // In a text part with a slot after it (in the file's order): the caret goes into the slot, as from
      // a disclosure's title into its content (details/page.mjs), at the start of its first block, or in
      // a paragraph made first in it, one step of undo. Else, as in a caption: words of a
      // block that are not the block's own line do not split, Enter there is a text block after the
      // block, the caret in it.
      enter({ host }) {
        const instance = host.parentElement?.closest(INSTANCE);
        const slot = instance && slotsIn(instance).find((each) => each.hasAttribute("data-ge-box") && host.compareDocumentPosition(each) & Node.DOCUMENT_POSITION_FOLLOWING && !host.contains(each));
        if (slot) {
          const first = firstHost(slot);
          if (first) caretAt(first, "start");
          else {
            const paragraph = newHost(document, "paragraph");
            struct([slot], [], () => {
              slot.prepend(paragraph);
              return { touched: [paragraph], focus: paragraph };
            });
            caretAt(paragraph, "start");
          }
          return true;
        }
        const unit = unitElement(host);
        const box = unit?.parentElement;
        if (!box || !accepts(box.getAttribute("data-ge-box-kind") ?? "flow", "paragraph")) return false;
        newParagraph(box, unit);
        return true;
      },
    },
    // Each package with a template that is offered (its `state`, as `isHidden` of page/offered.mjs goes
    // by block types), by its id: a row of the menus, found by its name in either language and its
    // words, and what makes one (the caret in its first text part; with none, in an empty paragraph
    // after it, as for a divider). Its slots are boxes made on the page at once, what the template has in each made
    // blocks of the page's (an empty paragraph where it has none), so that the reader writes in one
    // before the instance is saved, and Enter in a text part goes into the slot after it. One whose needs
    // hold "tables" is a view of a table (`readsTables`), which binds itself to the nearest table above it as
    // it is made (VIEW_FROM: page/table/binding.mjs). Where two offered have one name (the same block
    // of two packs: 我的待办 of Gallery 风格 and of 柔光风格), each row says its pack's name after it in grey
    // (`of`: the menu's ge-pop-of).
    menuVariants: () => {
      const offered = (map.components ?? []).filter(({ template, state }) => template && state === "normal");
      const counts = new Map();
      for (const entry of offered) counts.set(entry.name[language], (counts.get(entry.name[language]) ?? 0) + 1);
      // A grey name after a block's where two have its name: its pack's, or its id where both count in one pack (Gallery's card and the workspace's local/card, both the default pack's).
      const packName = (entry) => entry.pack?.name?.[language] ?? entry.pack?.id ?? entry.id.split("/")[0];
      const ofName = (entry) => (offered.some((other) => other !== entry && other.name[language] === entry.name[language] && packName(other) === packName(entry)) ? entry.id : packName(entry));
      return Object.fromEntries(offered.map((entry) => [entry.id, {
        label: entry.name[language],
        ...(counts.get(entry.name[language]) > 1 ? { of: ofName(entry) } : {}),
        icon: ICON,
        words: searchWords(entry),
        sample: true,
        readsTables: entry.needs?.includes("tables") ?? false,
        preview: { picture: entry.picture ?? null, says: entry.description[language] },
        create({ doc, put: place, paragraph }) {
          bring(entry);
          const instance = newInstance(doc, entry.template);
          slotsMade(doc, instance, (slot) => blocksOfTemplate(doc, slot));
          ownIds(doc, [instance]);
          place(instance);
          if (entry.needs?.includes("tables")) bindAbove(instance); // a view reads the nearest table above it; its 设置 changes that
          return editableParts(instance)[0] ?? firstHost(instance) ?? place(paragraph());
        },
      }]));
    },
    /**
     * Whether a copy of an instance's unit stands for it: not where it has slots, whose blocks that copy
     * would write whole, with no ids the page knows; such an instance is copied by what it carries alone
     * (index.mjs `data`: its slots' blocks apart), in its document too.
     */
    copiesAsItself: (unit) => slotsIn(unit).length === 0,
    /** What the reader calls a block of it: its package's name, where the page knows its package. */
    nameOf: (unit) => entryOf(unit.getAttribute(ATTRIBUTE))?.name[language] ?? null,
    /**
     * One the file dropped that the page still shows, a reader's to keep: it goes from now on as what a
     * clipboard carried does, its markup as the kit would start it, its slots empty: what they hold is
     * made on the page from now on too (sync-state.mjs asMade), and goes apart (index.mjs `extras`).
     * Its template would not hold what the reader has.
     */
    renew(instance) {
      if (!instance.hasAttribute("data-ge-copy")) {
        const copy = copyOf(instance, { named: true });
        const boxes = slotsIn(instance).map((slot) => slot.hasAttribute("data-ge-box"));
        slotsIn(copy).forEach((slot, index) => { if (boxes[index]) slot.replaceChildren(); });
        instance.setAttribute("data-ge-copy", copy.outerHTML);
      }
      instance.setAttribute("data-ge-type", "installed");
      return true;
    },
    /** A text part the file takes for no text block: as it stood, read-only, the caret on to the next one that is. */
    notText(part) {
      const selection = getSelection();
      const next = selection.rangeCount > 0 && part.contains(selection.anchorNode) ? textParts(part.parentElement.closest(INSTANCE)).find((other) => other !== part && other.isContentEditable) ?? null : undefined;
      part.innerHTML = part.getAttribute("data-ge-part");
      for (const name of ["contenteditable", "data-ge-part", "data-ge-kind", "data-ge-framed", "data-ge-caps"]) part.removeAttribute(name);
      if (next) caretAt(next, "start");
      else if (next === null) selection.removeAllRanges();
    },
    /** The mark of a custom block: the one every custom block has in a menu, its picture shown beside its row instead. */
    iconOf: () => ICON,
    /**
     * What of an instance its component writes, part by part, as the file is to hold it (null: nothing
     * here does): its parts as the kit's dehydrate leaves them, what it and its component leave on them
     * being no change.
     */
    dataOf: (instance) => (dataParts(instance).length > 0 ? dataOf(globalThis.DocKit.dehydrate(instance.cloneNode(true))) : null),
    /** What of an instance the file's markup of it (`html`) holds that its component writes, read as dataOf reads one on the page. */
    dataIn(html) {
      const template = document.createElement("template");
      template.innerHTML = html;
      const instance = template.content.firstElementChild;
      return instance?.matches(INSTANCE) && dataParts(instance).length > 0 ? dataOf(globalThis.DocKit.dehydrate(instance)) : null;
    },
    /** The most one commit carries of what components write, in bytes. */
    dataMost: DATA_MOST,
    /** Of the parts of an instance named (`names`), those one edit of this page wrote together, as lists of two or more. */
    together: (instance, names) => writtenTogether(instance).map((group) => names.filter((name) => group.includes(name))).filter((group) => group.length > 1),
    /**
     * The reader writes what an instance holds over what someone else wrote to its parts (`theirs`, by
     * name, as the file held them and the reader was shown them: 仍然调整): one `source` step from theirs to
     * what the page holds, the page as it is, so that one undo gives back what the file held and writes it
     * again. Returns the step, or null where the page holds theirs.
     */
    overwrite(instance, theirs) {
      const parts = dataParts(instance).filter(([name, part]) => typeof theirs[name] === "string" && part.innerHTML !== theirs[name]);
      return parts.length > 0 ? sourceStep(parts.map(([name, part]) => [part, theirs[name]])) : null;
    },
    /**
     * An instance as it stood with what its component wrote (`parts`, by name, as a commit carried them)
     * in place of what it holds: a copy off the page, a block to copy where the file did not take that
     * write (the list of what a page left, editor.mjs showLost). Null where it holds none of those parts.
     */
    withData(instance, parts) {
      const copy = instance.cloneNode(true);
      const written = dataParts(copy).filter(([name]) => typeof parts?.[name] === "string");
      for (const [name, part] of written) part.innerHTML = parts[name];
      return written.length > 0 ? copy : null;
    },
    /** What a component asks to write, checked, for the step of a change that carries it (module's drafted): { changed, put } or null. */
    drafted: (detail, instance) => (active() ? drafted(detail, instance) : null),
    /** The stamp of the manifest an instance's component wrote it by, or the page runs it by. */
    definitionOf: (instance) => (instance.hasAttribute(WRITTEN_BY) ? instance.getAttribute(WRITTEN_BY) || undefined : brought.get(instance.getAttribute(ATTRIBUTE))?.definition),
    /** What a package's manifest says of how its instances are read: `parts` as the kit knows them, `markdown`. */
    packageOf: (id) => ({ markdown: entryOf(id)?.markdown, parts: globalThis.DocKit?.description(id)?.parts }),
    install() {
      for (const tag of document.querySelectorAll(`script[${PACKAGE_MARK}]`)) {
        const id = tag.getAttribute(PACKAGE_MARK);
        brought.set(id, { stamp: entryOf(id)?.stamp ?? null, definition: entryOf(id)?.definition });
      }
      document.addEventListener("doc-component-edit", (event) => { if (write(event.detail, event.target)) event.preventDefault(); });
      new MutationObserver((records) => {
        for (const { type, target, addedNodes, removedNodes, nextSibling } of records) {
          if (type === "attributes") followFallback(target);
          for (const node of addedNodes) {
            if (node.nodeType !== 1 || node.hasAttribute("data-doc-dev")) continue;
            [...(node.matches(INSTANCE) ? [node] : []), ...node.querySelectorAll(INSTANCE)].forEach(arrive);
          }
          for (const node of removedNodes) keepSlots(node, target, nextSibling);
        }
      }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: [FALLBACK] });
      window.addEventListener("doc-catalog-changed", readList);
      window.addEventListener("doc-settings-changed", ({ detail }) => followSettings(held.components, detail));
      followCatalog();
    },
    /** The page edits now: what the kit showed as it stands before its text blocks were made is shut, and a component can write. */
    entered() {
      document.querySelectorAll(`[${FALLBACK}]`).forEach(followFallback);
      dispatchEvent(new Event("doc-editable"));
    },
  };
}
