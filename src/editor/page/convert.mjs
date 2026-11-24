import { ELEMENT_ID, blocksIn, boldThroughout, boxKind, dropIfEmpty, firstLineOf, heldIn, identityOf, isEmpty, isFirstLine, isHost, nestedBlocks, newContainer, newHost, newTail, ownHTML, placeBefore, removalTarget, unitElement, withLeads } from "./core.mjs";
import { begin, done, made } from "./made.mjs";
import { formatRange } from "./marks.mjs";
import { HEADING, LEFT_OUT } from "./outline/read.mjs";
import { menuEntry, pageOfType, variantKeys } from "./page-objects.mjs";
import { ATTRIBUTES, BLOCK_TYPES, FRESH, HEADING_TYPES, HOLDERS, IDENTITY, TEXT_TYPES, TOGGLES, TURN_INTO, accepts, blockTypeOf, refusedWithin, textTypeOf, turnsEmpty } from "../components/registry.mjs";
import { pageBuild } from "../components/builders.mjs";
import { iconElement } from "../components/icon/index.mjs";
import { retagList } from "../components/list/page.mjs";
import { joins } from "../components/list/join.mjs";
import { LIST_TYPES } from "../components/list/index.mjs";
import { isStep } from "../components/flowchart/index.mjs";
import { asTitle, flowchartFromList, flowchartFromPanel, itemFromStep, listFromFlowchart, newStep, panelColors } from "../components/flowchart/page.mjs";

// Turning blocks into other types on the page (DOM only; tested with jsdom): text, small text
// (小字, the kit's .doc-note), four heading levels, bulleted, numbered and to-do lists and flow charts (流程图), disclosures
// (折叠列表), highlight panels (高亮块: a container with the opening summary's look, whose blocks keep
// their own types, lists and headings among them) and callouts (提示块: the same kind of container, its
// look its own; a block turned into either, or into a disclosure, goes into it as it is), code blocks, quotes and
// dividers; the types are the components' (src/editor/components/, registry.mjs), and so is how a
// type that is no text block is made (its `create`). The "/" menu,
// Markdown shortcuts, the block menu and its "在下方新建一块" all come here (editor.mjs:
// slash-menu/, markdown/, block-menu/, insert/). A converted block is a new element with the identity of the one it stands
// for (core.mjs ELEMENT_ID; data-ge-convert and data-ge-unit carry the unit's id), so the save turns it into a conversion
// in place, and undo putting the old element back turns it back (commit.mjs compares types); a block that
// keeps its tag (a quote's paragraph taken out of the quote) is moved as it is. New containers
// (lists, quotes, panels, sections) are boxes of their own (newContainer); a list, quote or panel
// goes when its last block leaves it, and one split by taking a block out of its middle leaves a
// new container with the blocks after it. A flowchart (components/flowchart/) is no list of items
// here: a block turned into one is a node of it (its text the node's title, bold), a whole list turned
// into one has its items made nodes and back (what each holds the node's content), a step turned
// into a list's item or a highlight block leaves its flowchart (split around it), and a node's first
// line, its title, is turned into nothing.

// The containers a type puts a block in: its tag (and class). A list item or a quote's paragraph
// is of its container's type; the blocks of a panel keep their own.
// (Each type's `container`, `wraps` and `leaf` in its component's description.)
const typesWith = (field) => Object.fromEntries(Object.entries(BLOCK_TYPES).filter(([, spec]) => spec[field]).map(([type, spec]) => [type, spec[field]]));
const CONTAINERS = typesWith("container");
const WRAPS = typesWith("wraps");
// The text block of each type.
const LEAF = typesWith("leaf");
const MARKER = /^(contenteditable|data-ge-|spellcheck$)/;
// What a converted block carries over: every attribute but the editor's markers, its class (which
// tells its type) and its identity (which the save keeps on its own).
const carried = (attribute) => !MARKER.test(attribute.name) && attribute.name !== "class" && attribute.name !== IDENTITY;

// An attribute a block's kind sets (a to-do item's checked state): its own, never carried to another type.
const ownAttribute = (host, name) => Boolean(ATTRIBUTES[host.getAttribute("data-ge-unit-kind") ?? (host.localName === "li" ? "item" : "")]?.[name]);

// The types a block, or a group of blocks, goes into as it is (each keeping its type: `takesAsIs`): a
// highlight block (whose body is its children: the blocks move into a new one), a callout (the
// same kind of block) and, as the reader asked, a disclosure (into its content; its title left
// empty to type).
const TAKES_AS_IS = new Set(Object.keys(typesWith("takesAsIs")));

// Whether a box takes the block of a type: what its role accepts, and none of a type that does not
// nest (`nests`) in a box of its own kind. Kept here (not in `accepts`, which the server and the drop
// check share): a drop or a file may still nest one.
const takesType = (box, type) => accepts(box, BLOCK_TYPES[type].kind) && (BLOCK_TYPES[type].nests !== false || BLOCK_TYPES[type].box !== box);

const wraps = (node, type) => Boolean(CONTAINERS[type]) && node?.nodeType === 1 && node.matches(CONTAINERS[type]);

/** The type a text block shows as (TURN_INTO, or heading4 and a classed leaf of the author's); null for others. */
export function typeOf(host) {
  const wrapper = host.parentElement;
  if (host.tagName === "LI") return LIST_TYPES.find((type) => wraps(wrapper, type)) ?? null;
  if (host.tagName === "P") return wraps(wrapper, "quote") ? "quote" : textTypeOf(host);
  if (HEADING_TYPES[host.tagName]) return HEADING_TYPES[host.tagName];
  if (host.getAttribute("data-ge-kind") === "code") return "code";
  const own = blockTypeOf(host);
  return TEXT_TYPES.has(own) ? own : null;
}

// The list or quote a text block sits in, or null.
const wrapperOf = (host) => WRAPS[typeOf(host)] ? host.parentElement : null;

/**
 * Whether a text block can be turned into another type: a block of its own in a box (a panel's
 * block among them, or the item or paragraph of a list or quote that is a box), made on the page or
 * in the file. Its attributes go with it (an id stays where links find it); only a block the
 * report's script refers to keeps its type, since the script may count on its element. A code
 * block keeps its type.
 */
export function convertible(host) {
  // An item holding blocks (or that held them in the file) stays an item: what it holds goes with it.
  // A flowchart node's first line is its title, always a paragraph (core.mjs firstLineOf).
  return standing(host) && nestedBlocks(host).length === 0 && !host.hasAttribute("data-ge-nested") && !isFirstLine(host);
}

// A text block of a type, a block of its own in a box (or the item or paragraph of a list or quote
// that is a box) that the report's script does not refer to: what convertible asks but whether it
// holds blocks.
function standing(host) {
  const type = isHost(host) ? typeOf(host) : null;
  if (!type || type === "code" || host.closest("summary")) return false;
  if (host.hasAttribute("data-ge-block") && (!host.hasAttribute("data-ge-unit") || host.getAttribute("data-ge-keep") === "script")) return false;
  const wrapper = wrapperOf(host);
  if (wrapper && !wrapper.hasAttribute("data-ge-box")) return false;
  return Boolean((wrapper ?? host).parentElement?.hasAttribute("data-ge-box"));
}

/**
 * The types a text block can be turned into (its own type among them), in menu order; a panel not
 * inside a panel.
 */
export function targetsOf(host) {
  if (!convertible(host)) return [];
  const box = boxKind((wrapperOf(host) ?? host).parentElement);
  return TURN_INTO.filter((type) => takesType(box, type));
}

/**
 * The types a text block can be turned into from its block menu or the format bar (its own among
 * them): targetsOf, or for a list item holding blocks (or that held them in the file), which stays an
 * item, what it holds going with it, another kind of list, a highlight block or a disclosure
 * (a block's children stay with it where the new type has them; an item from the
 * middle of its list goes as convertBlock takes it: the list split around it). Wherever the item
 * stands in its list, the first or not.
 */
export function turnTargets(host) {
  if (convertible(host)) return targetsOf(host);
  if (host?.localName !== "li" || !standing(host)) return [];
  const box = boxKind(host.parentElement.parentElement);
  return TURN_INTO.filter((type) => (LIST_TYPES.includes(type) || TAKES_AS_IS.has(type)) && takesType(box, type));
}

// What a box around `node` refuses however far in (`except`: a database's record body, no database in a callout in
// it either) no menu offers there.
const noneRefused = (types, node) => types.filter((key) => !refusedWithin(node, BLOCK_TYPES[String(key).split(":")[0]]?.kind));

// The types made as an empty block standing for an empty one (FRESH) that a box takes, after `types`.
const withFresh = (types, box) => [...types, ...FRESH.filter((type) => !types.includes(type) && takesType(box, type))];

// The variants a box takes (keyed "type:variant"): what is a whole block goes where a block of
// its own stands.
const variantsIn = (box) => variantKeys().filter((key) => takesType(box, menuEntry(key).type));

/**
 * The types a block made below `target` may be ("/" in a block with text, the block menu's
 * 在下方新建): those its box takes, a divider, the media blocks, a table, a Sheet area and a formula
 * block among them, and the variants it takes. Below a list's item or a quote's line that box is the
 * list's or the quote's, and the new block takes it apart there (convertBlock).
 */
export function belowTargets(target) {
  const own = isHost(target) ? wrapperOf(target) ?? target : target;
  const box = boxKind(own.parentElement);
  return noneRefused([...withFresh(TURN_INTO.filter((type) => takesType(box, type)), box), ...variantsIn(box)], own);
}

// A unit that holds nothing to carry (`turnsEmpty`: a divider line): what it is turned into is an
// empty block in its place. Its own type is the one of its kind.
const turnedEmpty = (unit) => turnsEmpty(unit?.getAttribute("data-ge-unit-kind"));
const ownEmptyType = (unit) => Object.keys(BLOCK_TYPES).find((type) => BLOCK_TYPES[type].kind === unit.getAttribute("data-ge-unit-kind")) ?? null;

/** The types such a unit can be turned into (its own among them): the types its box takes, as an empty block of it. */
export function emptyTargets(unit) {
  if (!turnedEmpty(unit) || !unit.parentElement?.hasAttribute("data-ge-box") || unit.hasAttribute("data-ge-keep")) return [];
  const box = boxKind(unit.parentElement);
  return TURN_INTO.filter((type) => takesType(box, type));
}

/**
 * The type an element is of itself, as a conversion changes it (wherever it stands: a quote's
 * paragraph taken out of its quote is the same paragraph): a list item "item", a flowchart's step "step"
 * (a container: one undo puts back is made again around its blocks, sync-state.mjs), a code block "code",
 * a container its own, a text block its text's; any other unit its tag. Two elements of one
 * identity (a block and the one it was turned into) differ in it (commit.mjs).
 */
export function ownTypeOf(unit) {
  // (A step told by its list, or by its kind where it stands in none: a copy of its start tag, as a layout keeps one.)
  if (unit.localName === "li") return isStep(unit) || unit.getAttribute("data-ge-unit-kind") === "step" ? "step" : "item";
  if (unit.matches(".doc-code")) return "code";
  const container = containerType(unit);
  if (container) return container;
  if (unit.localName === "p") return textTypeOf(unit);
  if (HEADING_TYPES[unit.tagName]) return HEADING_TYPES[unit.tagName];
  const own = blockTypeOf(unit);
  return TEXT_TYPES.has(own) ? own : unit.localName;
}

/** The type a whole container shows as: a list, quote, panel or disclosure. */
export function containerType(unit) {
  return Object.keys(CONTAINERS).find((type) => wraps(unit, type)) ?? null;
}

// Where a container holds its blocks: the content region of a type that has one (`content`: a disclosure's), else itself.
const contentOf = (unit) => BLOCK_TYPES[containerType(unit)]?.content?.(unit) ?? unit;

// The containers that turn into one another, what they hold carried along: a
// disclosure, a quote, a highlight block, a callout. Each is the kind of box it is, as well as of block.

// The blocks a disclosure, quote or highlight block holds (a highlight block's icon not among them).
const heldBy = (unit) => heldIn(contentOf(unit));

// The disclosure, quote and highlight block `unit` (one of them) can become: those its box takes,
// which take every block it holds (a disclosure's title a paragraph).
const holderTargets = (unit, type) => HOLDERS.filter((other) => other !== type
  && takesType(boxKind(unit.parentElement), other)
  && heldBy(unit).every((child) => accepts(other, child.getAttribute("data-ge-unit-kind") ?? unitKindOf(child))));
const unitKindOf = (node) => (node.localName === "p" ? "paragraph" : /^h[1-4]$/.test(node.localName) ? "heading" : node.localName === "li" ? "item" : null);
const kindOf = (node) => node.getAttribute("data-ge-unit-kind") ?? unitKindOf(node);

// Whether a node can leave its flowchart as a list's item (itemFromStep): its title a block the page
// may take out (no script refers to it), what it holds after its title blocks an item holds (no row
// of columns).
function itemable(step) {
  const first = firstLineOf(step);
  if (first?.hasAttribute("data-ge-keep")) return false;
  return heldIn(step).filter((block) => block !== first).every((child) => accepts("nest", kindOf(child)));
}

// Whether a list's items can each be a node (stepFromItem): no script refers to one (it goes, a new
// paragraph its words), and what it holds a node takes.
const steppable = (list) => [...list.children].every((item) => item.localName !== "li" || (!item.hasAttribute("data-ge-keep") && nestedBlocks(item).every((child) => accepts("node", kindOf(child)))));

/**
 * The types a flowchart's step can be turned into from its menu (步骤流程图, its own, among them): the
 * other kinds of list (an item of a list of that kind, the flowchart split around it: its title's
 * words the item's, what it holds after its title the item's blocks) and a highlight block (its
 * blocks as they are, its icon too), where its flowchart's box takes them.
 */
export function stepTargets(step) {
  const flow = step?.parentElement;
  if (!isStep(step) || !step.hasAttribute("data-ge-box") || step.hasAttribute("data-ge-keep") || !flow?.hasAttribute("data-ge-box") || flow.hasAttribute("data-ge-keep")) return [];
  const box = flow.parentElement?.hasAttribute("data-ge-box") ? boxKind(flow.parentElement) : null;
  return TURN_INTO.filter((type) => type === "flowchart" || (box && LIST_TYPES.includes(type) && itemable(step) && takesType(box, type)) || (box && type === "highlight" && takesType(box, type)));
}

/**
 * The types a whole list, quote, panel or disclosure can be turned into: the other kind of list;
 * a disclosure, quote or highlight block another of them, what it holds carried along; or plain
 * blocks (its items or paragraphs become paragraphs, a disclosure's title a paragraph followed by
 * its content).
 */
export function containerTargets(unit) {
  const type = containerType(unit);
  if (!type || unit.hasAttribute("data-ge-keep") || !unit.parentElement?.hasAttribute("data-ge-box")) return [];
  if (!contentOf(unit).hasAttribute("data-ge-box")) return [];
  const flat = accepts(boxKind(unit.parentElement), "paragraph");
  // A highlight block turns into a flowchart of one node holding its blocks, as they are.
  const flows = type === "highlight" && takesType(boxKind(unit.parentElement), "flowchart") && heldIn(unit).every((child) => accepts("node", kindOf(child))) ? ["flowchart"] : [];
  if (TAKES_AS_IS.has(type)) return [type, ...holderTargets(unit, type), ...flows, ...(flat ? ["paragraph"] : [])];
  const all = blocksIn(unit).every((child) => convertible(child));
  if (type === "quote") return [type, ...holderTargets(unit, type), ...(all && flat ? ["paragraph"] : [])];
  // A flowchart: the kinds of list, its nodes their items, when each node can be one.
  if (type === "flowchart") return [...LIST_TYPES].filter((other) => other === type || [...unit.children].filter(isStep).every(itemable));
  const lists = unit.hasAttribute("data-ge-new") || unit.getAttribute("data-ge-box-kind") === "list" ? LIST_TYPES.filter((other) => other !== "flowchart" || steppable(unit)) : [];
  return all && flat ? [...lists, "paragraph"] : lists;
}

// ---------- the conversions ----------
// Each returns { focus, created } (made.mjs): the text block that now holds the text (null when
// nothing changed) and the containers it made, whose child lists undo records too (editor.mjs
// `struct`, over touchedBy(...) and created).

// The original unit a block stands for, if any: its own, or the one it was converted from.
const unitOf = (host) => host.getAttribute("data-ge-convert") ?? (host.hasAttribute("data-ge-block") ? host.getAttribute("data-ge-unit") : null);

// A block standing for `host`, so that the save converts the unit it stands for in place: it takes
// the host's identity (one made on the page too: what a commit makes of it, this is).
function standsFor(block, host) {
  block.setAttribute(ELEMENT_ID, identityOf(host));
  const unit = unitOf(host);
  if (unit !== null) {
    block.setAttribute("data-ge-unit", unit);
    block.setAttribute("data-ge-convert", unit);
  }
  return block;
}

// A text block of `type` standing for `host`, with its content, its attributes and the class
// switches the new type takes too (its color: a block turned keeps its color).
function standIn(host, type) {
  const next = newHost(host.ownerDocument, type, host);
  next.innerHTML = ownHTML(host);
  for (const attribute of host.attributes) if (carried(attribute) && !ownAttribute(host, attribute.name)) next.setAttribute(attribute.name, attribute.value);
  for (const name of TOGGLES[BLOCK_TYPES[type].kind] ?? []) if (host.classList.contains(name)) next.classList.add(name);
  return standsFor(next, host);
}

// Whether a block already is the text block of a type: its tag, and its class where its type has
// one; of the paragraph types, the one its class makes it.
function isOfType(host, type) {
  const spec = BLOCK_TYPES[type];
  if (host.localName !== spec.tag) return false;
  if (spec.kind === "paragraph") return textTypeOf(host) === type;
  return spec.className ? host.classList.contains(spec.className) : true;
}

// Take a text block out of its list, quote or panel. Returns the place it held in the box around
// it, { parent, before } (before: the node it goes before, null for the end): before the container
// when it was the first block, after it when it was the last; from the middle, the blocks after it
// move into a new container of the same kind, and the place is between the two.
function takeOut(host) {
  const wrapper = host.parentElement;
  const parent = wrapper.parentElement;
  const siblings = blocksIn(wrapper);
  const index = siblings.indexOf(host);
  const rest = siblings.slice(index + 1);
  host.remove();
  if (index === 0) {
    const next = wrapper.nextSibling;
    dropIfEmpty(wrapper);
    return { parent, before: wrapper.isConnected ? wrapper : next };
  }
  if (rest.length === 0) return { parent, before: wrapper.nextSibling };
  // A numbered list split there: the items after the block start at 1 again.
  const tail = made(newTail(wrapper, containerType(wrapper)));
  placeBefore(tail, rest, null);
  wrapper.after(tail);
  return { parent, before: tail };
}

// The element right before or after a place, skipping text.
function elementAt(place, forward) {
  let node = forward ? place.before : place.before ? place.before.previousSibling : place.parent.lastChild;
  while (node && node.nodeType !== 1) node = forward ? node.nextSibling : node.previousSibling;
  return node ?? null;
}

// A list, quote or panel next to a place that a text block can join: of that type, a box nothing refers to.
const joinable = (node, type) => wraps(node, type) && node.hasAttribute("data-ge-box") && !node.hasAttribute("data-ge-keep")
  && (node.hasAttribute("data-ge-new") || node.hasAttribute("data-ge-pure"));

// Put a block at a place; for a type that puts it in a list, quote or panel, it joins the one right
// before the place, else the one right after it, else a new one made there.
function putAt(place, block, type) {
  if (!CONTAINERS[type]) return place.parent.insertBefore(block, place.before);
  const previous = elementAt(place, false);
  const next = elementAt(place, true);
  const { joins = true, leadIcon } = BLOCK_TYPES[type];
  if (joins && joinable(previous, type)) return previous.append(block);
  if (joins && joinable(next, type)) return next.prepend(block);
  const wrapper = made(newContainer(block.ownerDocument, type));
  wrapper.append(block);
  if (leadIcon) wrapper.prepend(iconElement(block.ownerDocument, leadIcon));
  place.parent.insertBefore(wrapper, place.before);
}

/** The containers whose child lists a conversion of this text block or container may change. */
export function touchedBy(node) {
  const wrapper = isHost(node) ? wrapperOf(node) : null;
  const block = wrapper ?? node;
  const box = block.parentElement;
  const content = contentOf(node);
  // A list or flowchart turned into the other: the blocks its items or nodes hold go into what stands for them.
  const members = isList(node) ? [...node.children].filter((child) => child.localName === "li") : [];
  return [...new Set([node, content, node.parentElement, box, wrapper, block.previousElementSibling, block.nextElementSibling, box?.parentElement, ...members]
    .filter((entry) => entry?.nodeType === 1))];
}

// The plain text of a text block, formulas as their source.
function plainTextOf(host) {
  const copy = host.cloneNode(true);
  copy.querySelectorAll("br").forEach((line) => line.replaceWith("\n"));
  return copy.textContent.replace(/ /g, " ");
}

// How a type that is no text block of its own is made: its definition's `create`, or its page
// object's (registry.mjs, `create`), a variant's being its own. Every other type is a text block (a
// leaf, in a container of its type when it has one), made by standIn below.
const makerOf = (key) => menuEntry(key).variant?.create ?? BLOCK_TYPES[key]?.create ?? pageOfType(key)?.create;

// A new block of a type with a content region of its own (`content`: a disclosure), as its page
// module makes one, its title empty.
const newHolder = (doc, type) => made(pageBuild(type)({ doc, block: { html: "", blocks: [] }, inline: () => [], inner: () => [] }));

// Such a block at `place`, its content holding `blocks` (none of its own empty paragraph): it and its
// content are containers the change made (undo records their child lists).
function holderAt(place, type, blocks) {
  const holder = newHolder(place.parent.ownerDocument, type);
  made(BLOCK_TYPES[type].content(holder)).replaceChildren(...blocks);
  place.parent.insertBefore(holder, place.before);
  return holder;
}

// The empty paragraph a new disclosure or highlight block holds in place of empty block `host`
// (already taken off the page): the host itself when it is one, else one standing for it.
const paragraphFor = (host) => (isOfType(host, "paragraph") ? host : standIn(host, "paragraph"));

/**
 * Turn a text block into `type` (TURN_INTO). A block keeps its element when its tag stays (a
 * quote's paragraph becoming a paragraph, an item going to the other kind of list); otherwise a
 * new element stands for it; a type with a `create` is made by it, from `host` off the page, its
 * text and emptiness still readable. A highlight block and a disclosure take the block into them as it is (TAKES_AS_IS), unless it
 * is `fresh`: an empty block the "/" menu or 在下方新建 makes the new block of, which the new one
 * stands for (the empty block itself becomes it), an empty paragraph in it.
 */
export function convertBlock(host, type, { fresh = false } = {}) {
  begin();
  const from = typeOf(host);
  if (type === from) return done(null);
  const doc = host.ownerDocument;
  const wrapper = WRAPS[from] ? host.parentElement : null;
  const place = wrapper ? takeOut(host) : { parent: host.parentElement, before: host.nextSibling };
  host.remove();
  const make = makerOf(type);
  if (make) {
    return done(make({
      type, doc, text: plainTextOf(host),
      put: (node) => place.parent.insertBefore(node, place.before),
      stand: (block) => standsFor(block, host),
      paragraph: () => newHost(doc, "paragraph"),
    }));
  }
  // A node of a flowchart (the one before or after the place when there is one, else a new one): an
  // item's words its title and what it held its content, any other block's text its title (the block
  // itself when it is a paragraph), bold; its color the node's.
  if (type === "flowchart") {
    const item = host.localName === "li";
    const title = item ? newHost(doc, "paragraph") : isOfType(host, "paragraph") ? host : standIn(host, "paragraph");
    if (item) title.innerHTML = ownHTML(host);
    const colors = [...host.classList].filter((name) => (TOGGLES.step ?? []).includes(name));
    colors.forEach((name) => title.classList.remove(name));
    if (title.getAttribute("class") === "") title.removeAttribute("class");
    const step = newStep(doc, [asTitle(title), ...(item ? nestedBlocks(host) : [])], colors);
    putAt(place, step, type);
    return done(title);
  }
  const stands = fresh && TAKES_AS_IS.has(type) && isEmpty(host) && nestedBlocks(host).length === 0;
  // A disclosure takes the block into its content as it is (a list's item or a quote's paragraph in
  // a new list or quote of its kind there), as a highlight block does; its title is empty, the caret
  // there to type it (the reader's rule: what is turned into a disclosure is what it folds).
  const { content, title } = BLOCK_TYPES[type];
  if (content) {
    if (stands) return done(title(holderAt(place, type, [paragraphFor(host)])));
    const own = wrapper ? made(newTail(wrapper, from)) : host;
    if (wrapper) own.append(host);
    return done(title(holderAt(place, type, [own])));
  }
  if (stands) {
    const paragraph = paragraphFor(host);
    putAt(place, paragraph, type);
    return done(paragraph);
  }
  // A panel takes a block as it is (for one block as for several): a list's item or a quote's
  // paragraph in a new list or quote of its kind there.
  if (TAKES_AS_IS.has(type) && wrapper) {
    const own = made(newTail(wrapper, from));
    own.append(host);
    putAt(place, own, type);
    return done(host);
  }
  const leaf = TAKES_AS_IS.has(type) ? from : LEAF[type];
  const block = isOfType(host, leaf) ? host : standIn(host, leaf);
  putAt(place, block, type);
  return done(block);
}

/**
 * A flowchart's step turned into `type` (stepTargets): it leaves its flowchart, split around it (the
 * steps after it a flowchart of their own, its direction kept), as a list's item (itemFromStep) that
 * joins the list of that kind before or after it, else one of its own; or as a highlight block
 * holding its blocks as they are (its icon too, its background the block's). Returns { focus, created }.
 */
export function convertStep(step, type) {
  begin();
  if (type === "flowchart") return done(null);
  const place = takeOut(step);
  if (type === "highlight") {
    const panel = made(newContainer(step.ownerDocument, "highlight"));
    for (const name of panelColors(step)) panel.classList.add(name);
    panel.append(...blocksIn(step));
    place.parent.insertBefore(panel, place.before);
    return done([...panel.children].find(isHost) ?? null);
  }
  const item = itemFromStep(step);
  putAt(place, item, type);
  return done(item);
}

/** A unit that holds nothing to carry turned into an empty block of `type` in its place. Returns { focus, created }. */
export function convertEmpty(unit, type) {
  if (type === ownEmptyType(unit)) return done(null);
  const paragraph = newHost(unit.ownerDocument, "paragraph");
  unit.replaceWith(paragraph);
  return type === "paragraph" ? done(paragraph) : convertBlock(paragraph, type);
}

/**
 * What a block can be turned into from its menu: { current, types }, its type and the types, or null
 * for none. A text block (a list item holding blocks among them, wherever it stands in its list:
 * turnTargets), a unit that holds nothing to carry (as an empty block of the type), a flowchart's
 * step (stepTargets: 步骤流程图 its own), or a whole list, quote, panel or disclosure.
 */
export function turnInto(unit) {
  if (isStep(unit)) {
    const types = stepTargets(unit);
    return types.length > 0 ? { current: "flowchart", types } : null;
  }
  const empty = turnedEmpty(unit);
  const types = isHost(unit) ? turnTargets(unit) : empty ? emptyTargets(unit) : containerTargets(unit);
  return types.length > 0 ? { current: isHost(unit) ? typeOf(unit) : empty ? ownEmptyType(unit) : containerType(unit), types } : null;
}

/** The containers whose child lists turning a block from its menu may change. */
export const turnParents = (unit) => (turnedEmpty(unit) ? [unit.parentElement] : touchedBy(unit));

/** Whether a block turned from its menu has no text to carry into its new type: a divider line, an empty text block. */
export const noTextToCarry = (unit) => turnedEmpty(unit) || (isHost(unit) && !unit.textContent.trim());

/**
 * Turn a block from its menu into `type` (turnInto). Returns { focus, created }, and `emptied` when
 * the block is gone for an empty one to write in, with nothing of it to select again.
 */
export function turnUnit(unit, type) {
  if (turnedEmpty(unit)) return { ...convertEmpty(unit, type), emptied: true };
  return isHost(unit) ? convertBlock(unit, type) : isStep(unit) ? convertStep(unit, type) : convertContainer(unit, type);
}

/**
 * Turn a whole list into another kind of list; a list, quote, panel or disclosure into plain
 * blocks in its place (items and paragraphs become paragraphs, a disclosure's title a paragraph).
 */
export function convertContainer(unit, type) {
  begin();
  const from = containerType(unit);
  if (type === from) return done(null);
  // A flowchart and a list (or a highlight block) are made of each other, node by item (components/flowchart/page.mjs).
  if (from === "flowchart" && LIST_TYPES.includes(type)) return done(blocksIn(listFromFlowchart(unit, type))[0] ?? null);
  if (type === "flowchart") return done(firstLineOf(blocksIn(from === "highlight" ? flowchartFromPanel(unit) : flowchartFromList(unit))[0]) ?? null);
  if (LIST_TYPES.includes(type)) {
    const next = made(retagList(unit, type));
    return done(blocksIn(next)[0] ?? null);
  }
  const doc = unit.ownerDocument;
  let blocks;
  if (BLOCK_TYPES[from]?.content) {
    const title = newHost(doc, "paragraph");
    title.innerHTML = BLOCK_TYPES[from].title(unit)?.innerHTML ?? "";
    blocks = [title, ...blocksIn(contentOf(unit)).filter((child) => !(child.hasAttribute("data-ge-new") && isHost(child) && isEmpty(child)))];
  } else {
    // A highlight block's icon goes with it.
    blocks = heldIn(unit).map((child) => child.localName === "li" ? standIn(child, "paragraph") : child);
  }
  // Another disclosure, quote or highlight block, holding what this one held: a disclosure's title
  // the first paragraph of a quote or highlight block made of it; a disclosure made of a quote or a
  // highlight block holds all its blocks in its content, its title empty to type (the reader's rule,
  // as for the blocks of a group); a new highlight block has 💡. An empty paragraph made on the page
  // is left behind (the new one has its own when nothing else is left).
  if (HOLDERS.includes(type) && HOLDERS.includes(containerType(unit))) {
    const kept = blocks.filter((block) => !(block.hasAttribute("data-ge-new") && isHost(block) && isEmpty(block)));
    const { content, title } = BLOCK_TYPES[type];
    let next;
    if (content) {
      next = newHolder(doc, type);
      // Its content is a container the change made too: undo and redo move the blocks out of it and back.
      if (kept.length > 0) made(content(next)).replaceChildren(...kept);
    } else {
      next = made(newContainer(doc, type));
      next.append(...(kept.length > 0 ? kept : [newHost(doc, "paragraph")]));
      if (BLOCK_TYPES[type].leadIcon) next.prepend(iconElement(doc, BLOCK_TYPES[type].leadIcon));
    }
    unit.replaceWith(next);
    const focus = content ? title(next) : [...next.children].find((child) => isHost(child));
    return done(focus ?? null);
  }
  placeBefore(unit.parentElement, blocks, unit);
  unit.remove();
  return done(blocks.find((block) => isHost(block)) ?? blocks[0] ?? null);
}

/**
 * What a block can become from what was typed into it (the "/" menu, Markdown at its start): the
 * types it can be turned into, and those made as an empty block (a divider, an image...) only when the block held nothing else (`whole`).
 */
export function typedTargets(host, whole) {
  const types = noneRefused(targetsOf(host), host);
  if (!whole || !convertible(host)) return types;
  const box = host.parentElement?.getAttribute("data-ge-box-kind");
  return noneRefused([...withFresh(types, box), ...variantsIn(box)], host);
}

// ---------- several blocks at once ----------
// For the block menu of several selected blocks (block-menu/) and the format bar over text across
// blocks (format-bar/): the types every block of the group can be turned into, offered only
// when each of them can be turned (all or nothing); a pick turns them in document order, a block
// already of the type left as it is. A block of a group is a text block (an item among them), a
// whole list, whose items turn item by item into a type that is no list, each item being a
// block of its own, or a whole quote, whose paragraphs turn one by one (each a text block of its
// own, as text across them gives them). A block inside another of the group goes with it (a step's
// content with the step). An item holding blocks stays an item, what it holds going with it: to another
// kind of list (a flowchart's step with its content), never to another type (the file keeps such an
// item's type: turnTargets, as for one). Every item of a list in the group, turned into another kind of list, is that list
// turned (its nesting, first number and direction kept). Into a highlight block or a
// disclosure (TAKES_AS_IS): one new highlight block, or disclosure with an empty title, at
// the first block's place, every block moved into it (a disclosure's content) keeping its type (an
// item in a list of its kind, a quote's paragraph in a quote), the containers they all leave going
// as when they are moved away. Turned items join the lists beside them as one turned item
// does (putAt), and the lists the group turned into the type that then stand side by side are one
// (join.mjs joins: consecutive items are one run), but two it found side by side and
// left as they were (join.mjs keeps a pair written apart).

const itemsIn = (list) => [...list.children].filter((child) => child.localName === "li");
const isList = (node) => node?.localName === "ul" || node?.localName === "ol";
const inOrder = (nodes) => [...nodes].sort((a, b) => (a.compareDocumentPosition(b) & 4 ? -1 : 1)); // 4: DOCUMENT_POSITION_FOLLOWING
// Those not inside another of them.
const outermost = (nodes) => nodes.filter((node) => !nodes.some((other) => other !== node && other.contains(node)));

// What one block of a group can be turned into, as convertGroup turns it (in menu order): a text
// block its targets; an item holding blocks another kind of
// list, a highlight block or a disclosure; a whole list another kind of list or paragraphs
// (containerTargets), a highlight block or a disclosure, or a type each of its items can be turned
// into; a whole quote what each of its paragraphs can; anything else nothing.
function memberTargets(unit, group = []) {
  if (isHost(unit)) return turnTargets(unit);
  // A flowchart's step: the kinds of list (each its own item); with every step of its flowchart in the
  // group, also a highlight block or a disclosure (the flowchart going into it whole: membersOf).
  if (isStep(unit)) {
    const whole = [...unit.parentElement.children].filter(isStep).every((step) => group.includes(step));
    const box = boxKind(unit.parentElement.parentElement);
    return TURN_INTO.filter((type) => (LIST_TYPES.includes(type) && stepTargets(unit).includes(type)) || (whole && TAKES_AS_IS.has(type) && takesType(box, type)));
  }
  const own = containerType(unit);
  if (own === "quote") {
    const each = containerTargets(unit).length > 0 ? blocksIn(unit).map(memberTargets) : [];
    return each.length > 0 ? TURN_INTO.filter((type) => each.every((types) => types.includes(type))) : [];
  }
  if (!LIST_TYPES.includes(own ?? "")) return [];
  const whole = containerTargets(unit);
  if (whole.length === 0) return [];
  const each = itemsIn(unit).map(memberTargets);
  const box = boxKind(unit.parentElement);
  return TURN_INTO.filter((type) => whole.includes(type) || (TAKES_AS_IS.has(type) && takesType(box, type)) || (each.length > 0 && each.every((types) => types.includes(type))));
}

// The type a block of a group shows as.
const shownType = (unit) => (isHost(unit) ? typeOf(unit) : isStep(unit) ? "flowchart" : containerType(unit));

/**
 * What a group of blocks (text blocks, items, whole lists and quotes) can be turned into together:
 * { types, current, first }, types being those every one of them can (menu order), current the type
 * they all are (null for a mix: none is marked), first the first one's. Null when one of them can be
 * turned into nothing (a card, a table, a code block, a divider, a disclosure, a highlight block…).
 */
export function groupTargets(units) {
  if (units.length === 0) return null;
  const each = units.map((unit) => memberTargets(unit, units));
  if (each.some((types) => types.length === 0)) return null;
  const types = TURN_INTO.filter((type) => each.every((list) => list.includes(type)));
  if (types.length === 0) return null;
  const shown = units.map(shownType);
  return { types, current: shown.every((type) => type === shown[0]) ? shown[0] : null, first: shown[0] };
}

// The list right after a list, past the editor's own nodes, or null.
function listAfter(list) {
  let next = list.nextElementSibling;
  while (next?.hasAttribute("data-doc-dev")) next = next.nextElementSibling;
  return isList(next) ? next : null;
}

// The blocks of a group as convertGroup turns them, in document order, none inside another (a block
// inside one goes with it): every item of a list in it, for another kind of list or a highlight
// block, that list (turned or moved whole; `whole` names them). { members, whole }.
function membersOf(units, type) {
  const all = outermost(inOrder(units));
  const whole = new Set();
  const members = [];
  for (const unit of all) {
    const list = unit.localName === "li" && (LIST_TYPES.includes(type) || TAKES_AS_IS.has(type)) ? unit.parentElement : null;
    const fits = list && LIST_TYPES.includes(containerType(list) ?? "") && (TAKES_AS_IS.has(type) ? containerTargets(list).length > 0 : containerTargets(list).includes(type));
    if (fits && itemsIn(list).every((item) => all.includes(item))) {
      if (!whole.has(list)) members.push(list);
      whole.add(list);
    } else members.push(unit);
  }
  return { members, whole };
}

// Where a group's highlight block or disclosure goes: the box the first of its blocks is in (an
// item's or a quote paragraph's list or quote split there).
const homeOf = (first) => (isHost(first) && WRAPS[typeOf(first)] ? first.parentElement.parentElement : first.parentElement);

// The containers the blocks of a group leave empty as they go into a highlight block or a
// disclosure, which go with them (as when they are deleted or dragged away: removalTarget), but one
// holding `home`.
function leftoversOf(outer, home) {
  const gone = new Set(outer.flatMap(withLeads));
  return [...new Set(outer.map((member) => removalTarget(member, gone)))].filter((node) => !outer.includes(node) && !node.contains(home));
}

/**
 * The containers whose child lists turning a group into `type` may change (editor.mjs `struct`
 * records them): each block's (touchedBy), and into a highlight block or a disclosure, those
 * holding the containers its blocks leave empty.
 */
export function groupParents(units, type) {
  const parents = units.flatMap(touchedBy);
  if (TAKES_AS_IS.has(type)) {
    const outer = membersOf(units, type).members;
    parents.push(...leftoversOf(outer, homeOf(outer[0])).map((node) => node.parentElement));
  }
  return [...new Set(parents.filter(Boolean))];
}

/**
 * Turn a group of blocks (groupTargets) into `type`, in document order. Returns { changed, created,
 * units, hosts }: whether anything changed; the containers it made (editor.mjs `struct` records
 * them); the blocks standing for the group now, to select (a turned block's own, a list turned whole
 * the list, the items of a list given whole its items again, the items of a list joined to another,
 * a new highlight block or disclosure); and where each text block's text is now (Map: text block
 * before -> text block after).
 */
export function convertGroup(units, type) {
  const created = [];
  const hosts = new Map();
  const after = [];
  let changed = false;
  const take = ({ focus, created: made }) => {
    created.push(...made);
    changed = true;
    return focus;
  };
  const turn = (host) => {
    const focus = take(convertBlock(host, type));
    hosts.set(host, focus); // one by one (no TAKES_AS_IS type): its text is in the text block convertBlock gives
    after.push(isFirstLine(focus) ? focus.parentElement : unitElement(focus)); // made a node: the node, which joins its flowchart's neighbours
  };
  const { members, whole } = membersOf(units, type);

  if (TAKES_AS_IS.has(type)) {
    // One highlight block (or disclosure, its title empty) at the first block's place; each block in
    // it as it is, an item or a quote's paragraph in a list or quote of its kind (the one before it
    // there when that is of its kind). What is inside a block of the group goes with it; a container
    // they all leave goes.
    const outer = outermost(members);
    const doc = outer[0].ownerDocument;
    const kinds = outer.map((member) => (isHost(member) && WRAPS[typeOf(member)] ? typeOf(member) : null));
    const wrappers = outer.map((member) => member.parentElement);
    const leftovers = leftoversOf(outer, homeOf(outer[0]));
    begin();
    const place = kinds[0] ? takeOut(outer[0]) : { parent: outer[0].parentElement, before: outer[0] };
    let unit;
    let holder;
    if (BLOCK_TYPES[type].content) {
      unit = holderAt(place, type, []);
      holder = contentOf(unit);
    } else {
      unit = holder = made(newContainer(doc, type));
      if (BLOCK_TYPES[type].leadIcon) holder.append(iconElement(doc, BLOCK_TYPES[type].leadIcon));
      place.parent.insertBefore(unit, place.before);
    }
    outer.forEach((member, index) => {
      const kind = kinds[index];
      if (!kind) return void holder.append(member);
      if (index > 0) takeOut(member);
      const last = holder.lastElementChild;
      (joinable(last, kind) ? last : holder.appendChild(made(newTail(wrappers[index], kind)))).append(member);
    });
    leftovers.forEach((node) => node.remove());
    created.push(...done(null).created);
    for (const member of members) {
      for (const host of whole.has(member) ? itemsIn(member) : isHost(member) ? [member] : []) hosts.set(host, host);
    }
    return { changed: true, created, units: [unit], hosts };
  }

  // The lists side by side before (the first -> the one after it): a pair the group leaves as it was stays two.
  const apart = new Map();
  for (const flow of new Set(members.map((member) => (member.localName === "li" ? member.parentElement : member).parentElement))) {
    for (const child of flow?.children ?? []) if (isList(child)) apart.set(child, listAfter(child));
  }
  // A whole list or flowchart turned: its items (or nodes) now, and where each one's text went (a list
  // retagged keeps its items; a list made a flowchart has a node for each item, its title the item's
  // text, and back).
  const turnWhole = (member) => {
    const before = itemsIn(member);
    const focus = containerType(member) !== type ? take(convertContainer(member, type)) : null;
    const now = member.isConnected ? member : !focus ? null : isFirstLine(focus) ? focus.parentElement.parentElement : focus.parentElement;
    const items = now ? itemsIn(now) : [];
    before.forEach((item, index) => {
      const text = (node) => (isStep(node) ? firstLineOf(node) : node);
      if (text(item)) hosts.set(text(item), text(items[index]) ?? null);
    });
    return { items, focus };
  };
  for (const member of members) {
    if (whole.has(member)) after.push(...turnWhole(member).items);
    else if (isHost(member)) {
      if (typeOf(member) !== type) turn(member);
      else {
        hosts.set(member, member);
        after.push(member);
      }
    } else if (isStep(member)) {
      // A step: an item of a list of the type (convertStep), or a step still.
      if (type === "flowchart") after.push(member);
      else {
        const title = firstLineOf(member);
        const focus = take(convertStep(member, type));
        if (title) hosts.set(title, focus);
        after.push(focus);
      }
    } else if (containerType(member) === type) after.push(member);
    else if (containerType(member) === "quote") blocksIn(member).forEach(turn); // a whole quote: paragraph by paragraph
    else if (LIST_TYPES.includes(type) || type === "paragraph") {
      // A whole list chosen as a block: another kind of list, or paragraphs in its place.
      const items = itemsIn(member);
      const parent = member.parentElement;
      const focus = take(convertContainer(member, type));
      if (type === "paragraph") {
        for (const item of items) {
          const id = item.getAttribute(ELEMENT_ID);
          const paragraph = [...parent.children].find((child) => child !== item && child.getAttribute(ELEMENT_ID) === id) ?? null;
          hosts.set(item, paragraph);
          after.push(paragraph);
        }
      } else {
        for (const item of items) hosts.set(item, item);
        after.push(focus && isFirstLine(focus) ? focus.parentElement.parentElement : focus?.parentElement ?? null); // the list now, or the flowchart made of it
      }
    } else itemsIn(member).forEach(turn); // any other type: item by item
  }

  // The lists the group turned into the type, side by side now, are one (the items of the one taken
  // in selected with the rest); two it found side by side and left as they were stay two.
  if (LIST_TYPES.includes(type)) {
    const fresh = new Set(created);
    const kept = (list, next) => apart.get(list) === next && !fresh.has(list) && !fresh.has(next);
    const lists = new Set(after.filter((node) => node?.isConnected).map((node) => (node.localName === "li" ? node.parentElement : node)).filter((node) => wraps(node, type)));
    for (const list of inOrder(lists)) {
      for (let next = listAfter(list); list.isConnected && next && lists.has(next) && joins(list, next) && !kept(list, next); next = listAfter(list)) {
        const items = itemsIn(next);
        placeBefore(list, items, null);
        const at = after.indexOf(next);
        if (at >= 0) after.splice(at, 1, ...items);
        next.remove();
        changed = true;
      }
    }
  }
  return { changed, created, units: [...new Set(after.filter((node) => node?.isConnected))], hosts };
}

// ---------- every heading a level larger or smaller ----------
// The level badge right of a heading's fold triangle (fold/: its menu's 所有标题增大一级 and 所有标题减小一级,
// editor.mjs shiftAllHeadings, one undo step): every heading of the document's flows, those the outline
// lists (outline/read.mjs: in sections, highlight blocks, columns, disclosures and tab panels; not the
// report's title, nor a detail card's, which is the card's own title, nor one in a list item or a table;
// an empty one too) that its block menu could turn (convertible; an author's h5 or h6 is no type and
// stays), one level larger ("up": h3 to h2, 标题 1 staying) or smaller ("down": h2 to h3, 标题 4
// becoming a paragraph whose words are bold throughout, the <strong> Ctrl+B on all of them makes), as
// its type's `levels` say (components/heading/: up, down, boldDown). Each is turned as its block menu
// turns it (convertBlock: a new element standing for it, its block id, colors and words with their
// marks going with it).

const wholeOf = (host) => {
  const range = host.ownerDocument.createRange();
  range.selectNodeContents(host);
  return range;
};

/**
 * The headings in `root` that shifting them `way` ("up" or "down") turns, in document order, each with
 * the type it becomes and whether its words go bold: [{ host, type, bold }].
 */
export function headingShifts(root, way) {
  const shifts = [];
  for (const host of root.querySelectorAll(HEADING)) {
    if (host.closest(LEFT_OUT) || !isHost(host) || !convertible(host)) continue;
    const levels = BLOCK_TYPES[typeOf(host)]?.levels;
    const type = levels?.[way];
    if (type && targetsOf(host).includes(type)) shifts.push({ host, type, bold: way === "down" && Boolean(levels.boldDown) });
  }
  return shifts;
}

/**
 * Turn the headings of `shifts` (headingShifts), in order: one whose words go bold (a heading made a
 * paragraph) has them bold throughout (unless they are, or it has none). Returns { changed, created, hosts }: whether any
 * was turned, the containers made (none: a heading stands in no container of its type), and Map
 * (heading before -> text block after).
 */
export function shiftHeadings(shifts) {
  const created = [];
  const hosts = new Map();
  for (const { host, type, bold } of shifts) {
    const { focus, created: made } = convertBlock(host, type);
    if (!focus) continue;
    created.push(...made);
    if (bold && !isEmpty(focus) && !boldThroughout(focus)) formatRange(focus, wholeOf(focus), "bold", true);
    hosts.set(host, focus);
  }
  return { changed: hosts.size > 0, created, hosts };
}
