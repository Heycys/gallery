import { escapeText } from "../../../shared/escape.mjs";
import { ATTRIBUTE, FALLBACK, INSTANCE, PACKAGE_ID, SLOT, SLOT_PART, componentAt, heldBy, instanceMatch, refusedInCopy, slotsIn } from "../../../shared/components/installed.mjs";
import { wordsIn } from "../../page/clipboard/own/writers.mjs";
import { boxed, dataRows, fenced, flowRows, plainRow, scriptData } from "../read-rows.mjs";
import { BLOCK_ICON } from "../icons.mjs";
import { CHART_KEY, VIEW_FROM } from "../../../shared/table-chart.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// 组件: the one kind of block every component package is to the engines, the host of a package's
// instances (src/shared/components/installed.mjs). It uses only what a definition offers any block:
// the engines know no package and no part of one. An instance is one block, moved, copied and
// deleted whole; its parts edited as text are text blocks of this kind (file.mjs finds them, as its
// manifest says), and everything else in its own region is the component's (page.mjs). A press on
// its outer frame or on the handle is Gallery's, as for any block. Its slots (data-doc-slot, the parts
// its manifest edits as "flow") are the one way in and out: boxes of kind "slot", keyed by the part's
// name, whose blocks are the document's, as a column's are (a block's own area of child blocks, the
// frame around it none of theirs).
//
// Where the engines reach it (src/editor/page/ unless named): ../source/ (the scan stops at one and
// goes on in its slots, natural.mjs and old names pass its own region by: `isInstance`,
// `instanceSlots`, src/shared/components/), hints/ (`readOnly`), clipboard/own/
// (`clipboard`, copied as itself), caret.mjs (`sealed`: `editable`, where most of the page's events
// start from), text-select/, editor.mjs's entries and the tools that go by a kit's class (`keepsKeys`,
// page.mjs), formula/, the "/" menu, the format bar and clipboard/ (`formula`). The "/" menu and 在下方新建
// offer each package (`menuVariants`, on the page object: the catalog reaches the page
// alone), and a new one is written from its manifest (file.mjs `source`). Its parts edited as data
// are written as a table's rows are (page/core.mjs dataChanges, on `dataOf` of the page object,
// source/apply.mjs and file.mjs `rewrite`), an undo step of `source` (page/history.mjs).

// An instance as Markdown, the words of the file and none of what a component draws: as its package's
// manifest says (`markdown`), each part in the file's order with `parts`, a table a table, one edited
// as text a paragraph, a slot its blocks as each is written anywhere (as a column's, `flatten`)
// and any other its words and pictures, or with `text`, and where no package says, its words as any
// whole block's.
function instanceParts(unit, how) {
  const found = how.packageOf(unit.getAttribute(ATTRIBUTE));
  if (found?.markdown !== "parts") return [how.words(unit)];
  return saidParts(unit, found.parts).flatMap(({ part, edit }) => {
    if (edit === "flow") {
      const lines = how.lines(how.unitsOf(part)); // as a column's, not in from the margin as a disclosure's
      return lines.length > 0 ? [lines] : [];
    }
    if (part.matches("table")) return [how.writtenAs("table", part)];
    return (edit === "text" ? [how.own(part)] : [how.wordsIn(part).join(" · "), ...how.picturesIn(part)]).map((line) => [line]);
  }).filter(([first, ...more]) => first || more.length > 0);
}

// The parts of an instance that say something, each once and none inside another, in the file's order:
// of its own region, a slot only as a part edited as flow and no other part.
function saidParts(unit, parts) {
  const said = Object.values(parts).flatMap(({ at, edit }) => [...unit.querySelectorAll(at)].map((part) => ({ part, edit })))
    .filter(({ part, edit }) => !part.matches(`${INSTANCE}, script, style, template`) && part.parentElement.closest(INSTANCE) === unit && heldBy(part) === unit && (edit === "flow") === part.matches(SLOT_PART));
  const found = [...new Map(said.map((each) => [each.part, each])).values()];
  return found.filter(({ part }) => !found.some((other) => other.part !== part && other.part.contains(part)))
    .sort((a, b) => (a.part.compareDocumentPosition(b.part) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}

// ---------- gallery read (../read-rows.mjs) ----------

// The scripts of data of an instance's own region (none of its slots').
const ownData = (instance) => [...instance.querySelectorAll('script[type="application/json"]')].filter((script) => !slotsIn(instance).some((slot) => slot.contains(script)));
// Its own words, none of what its slots hold.
function ownWords(instance) {
  const copy = instance.cloneNode(true);
  for (const slot of copy.querySelectorAll(SLOT_PART)) slot.replaceChildren();
  return wordsIn(copy);
}

// Boxed by its block's id (and name, when this workspace has it): its own words, its data as the file has them,
// its own HTML as the file has it (what its slots hold cut out), then each slot boxed with its blocks.
function readInstance(node, view) {
  const { tools } = view;
  const id = node.el.getAttribute(ATTRIBUTE);
  const found = tools.packageOf(id);
  const name = typeof found?.name === "object" && found.name ? found.name.zh ?? found.name.en : found?.name ?? found?.title ?? null;
  const rows = [];
  if (!found) rows.push(plainRow("提示：这个工作区没有这个自定义块（页面上只能看，不能用）"));
  const said = ownWords(node.el);
  if (said.length) rows.push(plainRow(`文字：${said.join(" · ")}`));
  for (const data of ownData(node.el)) rows.push(plainRow(`数据${data.id ? ` #${data.id}` : ""}：`), ...dataRows(data));
  const slots = slotsIn(node.el);
  const lines = tools.source(node.el, { emptied: slots, note: "…（内容区，块在下面）" }) ?? [node.el.outerHTML];
  rows.push(plainRow(`HTML（${lines.length} 行，文件里的原样${slots.length ? "，内容区里的块写在下面" : ""}）：`), ...fenced("html", lines));
  for (const place of [...new Set(node.children.map((child) => child.place))]) {
    rows.push(plainRow(""), ...boxed(null, `内容区「${place ?? "?"}」`, flowRows(node.children.filter((child) => child.place === place), view)));
  }
  return boxed(node, `自定义块 ${id}${name ? `（${name}）` : ""}${tools.looks(node.el, { skip: [ATTRIBUTE] })}`, rows);
}

// A copy of an instance as blocks, what other programs and a field of plain text read of it: as its
// package says, as a page export writes it (instanceParts), but for pictures, which are no words. Its
// words are paragraphs, as `markdown: "parts"` has them; a text part that is a heading says so for the
// clipboard's HTML (`as`: the type it is written as there, the parts writer's). A slot is its blocks
// (`flows`, by name, as the clipboard describes them), the copy's slots being empty; its words are
// among the instance's (`words`, of it with what its slots hold).
function copiedParts(copy, found, { serializeInner, clipboardOf, copiedType }, { flows = {}, words = wordsIn(copy) } = {}) {
  if (found?.markdown !== "parts" || !found.parts) return [{ type: "paragraph", html: escapeText(words.join(" · ")) }].filter(({ html }) => html);
  return saidParts(copy, found.parts).flatMap(({ part, edit }) => {
    if (edit === "flow") return flows[part.getAttribute(SLOT)] ?? [];
    if (part.matches("table")) return [clipboardOf("table").data(part, { serializeInner })].filter(Boolean);
    const html = edit === "text" ? serializeInner(part) : escapeText(wordsIn(part).join(" · "));
    const own = edit === "text" ? copiedType(part) : null;
    return html ? [{ type: "paragraph", html, ...(own && clipboardOf(own)?.kind === "heading" ? { as: own } : {}) }] : [];
  });
}

// All an element holds, what a <template> keeps apart among it, itself first.
const allIn = (root) => [root, ...root.querySelectorAll("*")].flatMap((node) => (node.localName === "template" ? [node, ...[...node.content.children].flatMap(allIn)] : [node]));
// Whether any of that may not come onto a page by a clipboard.
const refused = (root) => allIn(root).some((node) => refusedInCopy(node.localName, [...node.attributes]));
// The one element a copy's markup is, or null. An element's outerHTML reads back as itself, which
// markup that leans on the parser does not (an end tag left out, a comment left open, an end tag of
// nothing): what is put right here a file reads otherwise.
function elementOf(html, doc = globalThis.document) {
  const template = doc.createElement("template");
  template.innerHTML = html;
  const [root, ...more] = template.content.childNodes;
  return template.innerHTML === html && root?.nodeType === 1 && more.length === 0 ? root : null;
}
// The most a description carries of one piece of markup (blocks.mjs `string`).
const CARRIED = 1e6;

// The mark of any custom block with no picture of its own: a card of text (icons.mjs).
export const ICON = BLOCK_ICON;

export default {
  name: "installed",
  // Ahead of every rule of the page's: all that stands in an instance's own region is the component's,
  // its controls too, and one of no package, or whose component failed, says why nothing there answers.
  // What its slots hold is the page's, each block saying what it says anywhere (componentAt).
  readOnly: [
    { rank: 1, at: (element) => componentAt(element) && Boolean(heldBy(element)?.hasAttribute(FALLBACK)), says: t("这个组件没有运行：内容只能看，可以整块移动、复制和删除。") },
    { rank: 2, at: componentAt, says: null },
  ],
  attributes: [ATTRIBUTE],
  sealed: INSTANCE,
  units: {
    installed: {
      name: t("自定义块@block"),
      icon: ICON,
      match: [{ rank: 0, tag: ["div", "section"], attr: ATTRIBUTE }],
      boxed: true,
      chapter: true,
      copy: "itself",
      // The key of the table a view reads (VIEW_FROM), which a view's 设置 changes on an instance the file
      // has (the commit writes it in its start tag, as a table's CHART_SOURCE); one made on the page says it
      // by `extras` below.
      attributes: { [VIEW_FROM]: (value) => CHART_KEY.test(value) },
      read: {
        name: "自定义块",
        rows: readInstance,
        words: (node, view) => [ownWords(node.el).join(" · "), ...view.flowWords(node.children)],
        data: (node) => ({ block: node.el.getAttribute(ATTRIBUTE), data: ownData(node.el).map(scriptData), slots: [...new Set(node.children.map((child) => child.place))] }),
        lost: () => "自定义块 {n} 个（只有文字和它的说明写出的部分，没有数据）",
      },
    },
  },
  boxes: {
    // A slot of an instance (data-doc-slot, its manifest's part edited as flow): the document's blocks, as a
    // column's are, a disclosure's content's rules for an empty one (holdsOne, a plain div a group).
    slot: { role: "flow", name: t("内容区"), groups: true, holdsOne: true, selectAll: { content: true }, find: (unit, key) => slotsIn(unit).find((slot) => slot.getAttribute(SLOT) === key) ?? null },
  },
  hosts: {
    // A part a manifest edits as text: words as in a paragraph, emptied but never split, joined or
    // taken out on its own, as a media block's caption is. No formula: the kit draws none in an
    // instance, so one would read as its TeX from the next load on.
    installed: { name: t("组件里的文字"), caps: () => ["empty", "links"], formula: false, placeholder: t("输入文字…") },
  },
  types: {
    // An instance made on the page, in no menu of types: its package's rows are `menuVariants`, and its
    // markup the file's, written from its manifest, or from what a clipboard carried where a copy has
    // no unit to be made from (`data-ge-copy`).
    installed: {
      tag: "div", kind: "installed", bare: true,
      // Its markup is the file's, from its template or what was carried (`data-ge-copy`, its slots
      // empty); what its slots hold goes apart, blocks made on the page as any (`children`, each in the
      // slot `boxKeys` names), so that the commit's answer names each, as for a block made in a column.
      // A view of a table (a menu made it of its template, bound to the table above it, or a paste carried one) says the key
      // of the table it reads as the page has it (`from`, its VIEW_FROM, which a paste may have given it
      // anew: clipboard/own/chart-keys.mjs), which the file writes on it (file.mjs source); one carried
      // with none on it says null (a view pasted into another document, its key taken off there), so
      // that the file has none either, whatever its markup carried.
      extras(element, { nodes }) {
        const held = slotsIn(element).filter((slot) => slot.hasAttribute("data-ge-box")).flatMap((slot) => (nodes?.(slot) ?? []).map((node) => [slot.getAttribute(SLOT), node]));
        return {
          package: element.getAttribute(ATTRIBUTE),
          ...(element.hasAttribute("data-ge-copy") ? { html: element.getAttribute("data-ge-copy") } : {}),
          ...(element.hasAttribute(VIEW_FROM) ? { from: element.getAttribute(VIEW_FROM) } : element.hasAttribute("data-ge-copy") ? { from: null } : {}),
          ...(slotsIn(element).length > 0 ? { children: held.map(([, node]) => node), boxKeys: held.map(([key]) => key) } : {}),
        };
      },
      clipboard: {
        kind: "parts", read: instanceParts,
        // What carries it where its unit is not (cut, another document), and within its document too
        // when it has slots: its markup as the kit would start it, with the ids it names itself, its
        // slots empty, the blocks each holds described as any (`flows`, by name: blocks made on the page
        // where it is pasted, as a disclosure's are), and what it says to whoever reads no blocks. One
        // whose markup no clipboard may bring anywhere (a handler, a script) has none, and stays a copy
        // within its document; so does one with a slot that is no box (words straight in it), or with a
        // block in one the page cannot make, which then is no copy at all (clipboard/own/describe.mjs).
        data(node, { serializeInner, copyOf, clipboardOf, copiedType, page, holding }) {
          const slots = slotsIn(node);
          const flows = Object.fromEntries(slots.map((slot) => [slot.getAttribute(SLOT), slot.hasAttribute("data-ge-box") ? holding?.(slot) ?? null : null]));
          if (Object.values(flows).some((blocks) => !blocks)) return null;
          const copy = copyOf(node, { named: true });
          const words = wordsIn(copy);
          slotsIn(copy).forEach((slot) => slot.replaceChildren());
          const html = copy.outerHTML;
          if (html.length > CARRIED || refused(copy) || !elementOf(html, node.ownerDocument)) return null;
          const id = node.getAttribute(ATTRIBUTE);
          return { type: "installed", package: id, html, ...(slots.length > 0 ? { flows } : {}), blocks: copiedParts(copy, page("installed")?.packageOf(id), { serializeInner, clipboardOf, copiedType }, { flows, words }) };
        },
        // What its slots hold, among a paste's blocks (blocks.mjs `holds`).
        holds: (block) => (block.flows && typeof block.flows === "object" ? Object.values(block.flows).filter(Array.isArray).flat() : []),
        // Its slots empty in its markup, each named once in `flows`, which holds blocks a slot takes.
        check(block, { string, valid, doc }) {
          if (!string(block.package, 200) || !PACKAGE_ID.test(block.package) || !string(block.html, CARRIED) || !Array.isArray(block.blocks) || !block.blocks.every((inner) => valid(inner))) return false;
          const root = elementOf(block.html, doc);
          if (!root?.matches(instanceMatch(block.package)) || refused(root)) return false;
          const slots = slotsIn(root);
          if (slots.length === 0) return block.flows === undefined;
          const names = slots.map((slot) => slot.getAttribute(SLOT));
          const { flows } = block;
          return Boolean(flows) && typeof flows === "object" && !Array.isArray(flows) && new Set(names).size === names.length && names.length === Object.keys(flows).length
            && slots.every((slot) => !slot.firstElementChild && !slot.textContent.trim() && Array.isArray(flows[slot.getAttribute(SLOT)]) && flows[slot.getAttribute(SLOT)].every((inner) => valid(inner, "slot")));
        },
      },
    },
  },
};
