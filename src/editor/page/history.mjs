import { isHost, ownHTML, setOwnHTML } from "./core.mjs";
import { mergeText } from "./merge.mjs";
import { caretAt, editable, select } from "./caret.mjs";
import { rangeAt, rangeOffsets } from "./marks.mjs";
import { note, settle } from "./overlays.mjs";
import { ATTRIBUTES } from "../components/registry.mjs";

// Undo and redo (docs/editor.md, "Browser side"): every change on the page is a step of one of
// three kinds, and every tool records its changes through this module.
//
//   text     a block's own content before and after (typing, joined while it goes on within a
//            second in the same block; formatting, links and taking the file's version are steps
//            of their own, recordStep, and bring their selection back)
//   struct   a structural change (split, merge, remove, multi-line paste, deleting, moving or
//            converting a block): the child lists of the containers involved plus the content of
//            the blocks involved, so undo puts the very same nodes back
//   look     classes switched on a block and its sizes (a centered card, a table's width)
//   source   what a component wrote to parts of its block, each part's inside before and after: one
//            for each write, every part it names, none joined, as a table's are. The caret is left
//            where it stands. One written over someone else's change of them (仍然调整) is as low as
//            undo takes them: the steps before it hold them no more (fold)
//
// Each recorded change tells the editor (changed), which counts it for the autosave. Undo reaches
// across commits: commit.mjs makes the inverse a change like any other. Once a commit showed
// someone else's words merged into a block (merged), a step recorded before undoes, and redoes, the
// reader's change only: three ways against what the block holds now (mergeText), so their words stay;
// when the two touch the same place it is not undone, and the editor says so (refuse).
//
// A struct step records the report's nodes only: the editor's own UI (data-doc-dev: a selected
// block's fill, the handle, the toast, menus, a code block's line numbers) and the tags in the page's
// body that load its files, which an instance brought to the page may have put in after a step began,
// are never part of one, and undo and redo leave them where they are. The page's body is among the containers a
// step may record (it holds a flat report's main, and the editor's layer); recording its UI too
// once made undo put back a fill long taken off, over where a converted block had been, with
// nothing left to update or remove it. After every structural change, what the editor draws for
// blocks taken off the page goes at once (overlays.mjs settle).

const REFUSED = Symbol("refused");

/**
 * changed(now): a change was recorded (`now`: a discrete one, committed without waiting for a
 * pause). refuse(why): an undo or redo was not done, `why` "merged" (it would take out someone else's words merged
 * in) or "pulled" (it is about a container someone else's write took off the page). beforeUndo(): undo or redo is about to run (the "/" menu closes, a page object writes what it holds back: a database's drag). blocks(): the block
 * tools (blocks.mjs), whose selection undo and redo bring back. afterText(element): a text step was
 * applied to a block (a code block's line numbers follow). refuse(): an
 * undo or redo that would take out someone else's merged words with the reader's was not done.
 * show(node): undo or redo landed there, which may have to be opened to be seen (a detail card, a Sheet panel).
 * tidy(): the tidiers of the components (`tidy`) and of the page, each `(parents) => { parents, attributes?, settle(result)? }`:
 * what a structural step may leave untidy around the containers it changes, which the step records
 * too (`parents`, and `attributes` as struct's own), and what puts it right after the step (`grown`
 * in what it returns: the containers no one named before it that it put nodes into).
 * mergedOff(hosts): an undo or redo took off the page blocks someone else's words were merged into after
 * it was recorded (the page shows those words: a pull, page/pull/), which the page claims to have seen none
 * of from then on, so that their deletion is the file's to refuse (commit.mjs unseen).
 * realize(node): a change of words or of look is about to be recorded in `node` (a text block, a block): what has
 * to come before it records its own step (a record's body the file has not got yet becoming one of the file's: a
 * struct step whose `typedInto` is the block, so that the words typed on go with it), the tidiers seeing to the same
 * in a structural step.
 */
export function createHistory({ changed, beforeUndo, blocks, afterText, refuse = () => {}, show = () => {}, tidy = () => [], mergedOff = () => {}, realize = () => {} }) {
  const lastKnown = new WeakMap(); // block -> innerHTML after the last recorded change, or as the caret found it (editor.mjs onSelectionChange)
  const undoStack = [];
  const redoStack = [];
  let typing = null; // open text step: { type, element, before, after, time }
  let serial = 0; // the order of steps and merges
  // The source step a component's writes of one gesture go on folding into ({ step, key, at }: sourceStep's
  // `merge`), while it is the last step and the writes follow one another; none once anything else is done.
  let merging = null;
  const lastMerge = new WeakMap(); // block -> when someone else's words were last merged into it (merged)

  const typingChanged = () => typing !== null && typing.before !== typing.after;

  function recordText(host, now = false) {
    const before = lastKnown.get(host) ?? ownHTML(host);
    const after = ownHTML(host);
    lastKnown.set(host, after);
    const at = Date.now();
    // What has to come first records its step first (which closes the run open, if any, so that one begins here).
    if (before !== after) realize(host);
    if (typing && typing.element === host && at - typing.time < 1000) {
      typing.after = after;
      typing.time = at;
    } else {
      closeTyping();
      typing = { type: "text", element: host, before, after, time: at, began: at };
    }
    changed(now);
  }

  // A change that should be its own undo step (formatting, links, taking the file's version).
  // `selection` (character offsets) is selected again on undo and redo, so formatting can go on.
  function recordStep(host, before, selection = null) {
    if (before !== ownHTML(host)) realize(host);
    closeTyping();
    push({ type: "text", element: host, before, after: ownHTML(host), selection });
    lastKnown.set(host, ownHTML(host));
    changed(true);
  }

  // A run of typing closed: a step of its own, unless it went into the block the last step made for
  // what was typed (struct's `typedInto`: a paragraph after a block, after/), begun within a second of it:
  // then it is part of that step, which undo takes away whole, redo putting the words back with it.
  function closeTyping() {
    const last = undoStack.at(-1);
    if (typingChanged() && last?.typedInto === typing.element && typing.began - last.madeAt < 1000) last.htmlAfter.set(typing.element, typing.after);
    else if (typingChanged()) push(typing);
    if (typing && last?.typedInto) last.typedInto = null;
    typing = null;
  }

  function push(step) {
    merging = null;
    step.serial = ++serial;
    undoStack.push(step);
    if (undoStack.length > 200) undoStack.shift();
    redoStack.length = 0;
  }

  // A container's child nodes, the editor's UI and what loads the page left out.
  const ownUI = (node) => node.nodeType === 1 && (node.hasAttribute("data-doc-dev") || node.matches("body > script, body > link, body > style"));
  const contentOf = (parent) => [...parent.childNodes].filter((node) => !ownUI(node));

  // Put a container's recorded child nodes back, moving only what differs: a node already where it
  // belongs is never taken out, so the focus and the caret in it stay, and so does the page's
  // scroll (taking all of the page's blocks out and back, with the caret in one of them, once
  // scrolled the page to its top). The editor's UI in it stays where it is.
  function restoreChildren(parent, nodes) {
    const wanted = new Set(nodes);
    for (const node of [...parent.childNodes]) if (!wanted.has(node) && !ownUI(node)) node.remove();
    let at = parent.firstChild;
    for (const node of nodes) {
      while (at && ownUI(at)) at = at.nextSibling;
      if (at === node) at = at.nextSibling;
      else parent.insertBefore(node, at);
    }
  }

  function setHTML(node, html) {
    setOwnHTML(node, html);
    lastKnown.set(node, html);
  }

  // A component wrote parts (`written`: [[part, what it held]]), one step of its own, which it returns.
  // `merge`: the gesture it is one write of (a database's words typed, a character a write): a write of the
  // same gesture less than a second after the last, while that step is the last one done, goes into it, as
  // a paragraph's typing goes into one step (what it held before the first write stays its `before`).
  // The writes of one gesture fold into one step only on the parts of the block it began on (a key is the
  // writer's own, but two blocks never share a step whatever they say).
  const sameBlock = (step, written) => written.every(([part]) => step.elements.some((element) => element.parentNode === part.parentNode));
  function sourceStep(written, { merge = null } = {}) {
    closeTyping();
    const last = undoStack.at(-1);
    let step;
    if (merge && merging?.key === merge && merging.step === last && Date.now() - merging.at < 1000 && sameBlock(last, written)) {
      for (const [part, was] of written) {
        const at = last.elements.indexOf(part);
        if (at >= 0) last.after[at] = part.innerHTML;
        else {
          last.elements.push(part);
          last.before.push(was);
          last.after.push(part.innerHTML);
        }
      }
      merging.at = Date.now();
      redoStack.length = 0;
      step = last;
    } else {
      step = { type: "source", elements: written.map(([part]) => part), before: written.map(([, html]) => html), after: written.map(([part]) => part.innerHTML), ...(merge ? { merge } : {}) };
      push(step);
      if (merge) merging = { step, key: merge, at: Date.now() };
    }
    changed(true);
    unmade(merge);
    return step;
  }

  // A gesture's writes that leave its parts as they were before it (words typed and taken back, Esc) are no
  // step: the steps of that gesture at the top of the undo stack (`merge`, the key they were written by:
  // one, or several where the writer paused) go, so that the next undo undoes what came before them. Where
  // the gesture as a whole changed something, a step of it at the top that changes nothing (typed after a
  // pause and taken back to it: what it recorded before is what it recorded after, every part) goes all the
  // same, the steps under it, which changed something, staying.
  function unmade(merge) {
    if (!merge) return;
    let from = undoStack.length;
    while (from > 0 && undoStack[from - 1].type === "source" && undoStack[from - 1].merge === merge) from--;
    if (from === undoStack.length) return;
    const run = undoStack.slice(from);
    const last = run.at(-1);
    const first = new Map(); // each part, as the gesture found it
    for (const step of run) step.elements.forEach((part, at) => { if (!first.has(part)) first.set(part, step.before[at]); });
    // What each holds now: the last step's record of it, just written (a long table is not written out again).
    const now = (part) => (last.elements.includes(part) ? last.after[last.elements.indexOf(part)] : part.innerHTML);
    let to = from;
    if (![...first].every(([part, html]) => part.isConnected && now(part) === html)) {
      to = undoStack.length;
      const idle = (step) => step.before.every((html, at) => html === step.after[at]);
      while (to > from && idle(undoStack[to - 1])) to--;
      if (to === undoStack.length) return;
    }
    const gone = undoStack.splice(to);
    if (gone.includes(merging?.step)) merging = null;
  }

  // What a source step wrote went over someone else's change of its parts (仍然调整): undo goes no lower
  // than that, so the steps before it hold those parts no more (one left with none goes), and undoing them
  // never writes what the page had before over what the file held. Below it are the steps made before it
  // (`serial`), wherever it stands now: on the undo stack, undone, or on neither stack (undone, and a newer
  // change made since, which is above it).
  // A structural step may hold such parts too (a view's change of its table that carried a write of its own
  // parts: page/table/views.mjs), whose words it records with the cells': they leave its record, the cells'
  // staying, and a step left with nothing goes.
  function fold(step) {
    const parts = new Set(step.elements);
    for (const other of undoStack.filter((each) => each.serial < step.serial)) {
      if (other.type === "struct") {
        if (![...(other.htmlBefore?.keys() ?? []), ...(other.htmlAfter?.keys() ?? [])].some((node) => parts.has(node))) continue;
        for (const part of parts) {
          other.htmlBefore?.delete(part);
          other.htmlAfter?.delete(part);
        }
        other.classes = (other.classes ?? []).filter(({ node }) => !parts.has(node));
        if (other.parents.length === 0 && (other.htmlBefore?.size ?? 0) === 0 && (other.htmlAfter?.size ?? 0) === 0) undoStack.splice(undoStack.indexOf(other), 1);
        continue;
      }
      if (other.type !== "source") continue;
      const kept = other.elements.map((_, index) => index).filter((index) => !parts.has(other.elements[index]));
      for (const name of ["elements", "before", "after"]) other[name] = kept.map((index) => other[name][index]);
      if (kept.length === 0) undoStack.splice(undoStack.indexOf(other), 1);
    }
  }

  // A step no longer stands for what it did (the write it was recorded for did not go in): out of both stacks.
  function drop(step) {
    for (const stack of [undoStack, redoStack]) if (stack.includes(step)) stack.splice(stack.indexOf(step), 1);
  }

  // An attribute the file gave another value than the page had (`changes`: [element, name, from, to],
  // `to` null for none; a key of a table a commit gave a pair anew: page/commit.mjs apply), the page's
  // element set so: the steps that recorded `from` of it record `to` instead, so that an undo or a redo
  // puts back what the file has, never the value it changed (a view made from "/" redone with the key its view
  // no longer carries).
  function rekeyed(changes) {
    if (changes.length === 0) return;
    for (const step of [...undoStack, ...redoStack]) {
      for (const recorded of [step.attributesBefore, step.attributesAfter]) {
        for (const [element, name, from, to] of changes) {
          const values = recorded?.get(element);
          if (values?.some(([each, value]) => each === name && value === from)) recorded.set(element, values.map(([each, value]) => [each, each === name && value === from ? to : value]));
        }
      }
      // A view's table chosen in its 设置 is a step of look (installed/page.mjs readTable): its attributes by element.
      if (step.type === "look") {
        for (const recorded of [step.before, step.after]) {
          step.elements.forEach((each, index) => {
            for (const [element, name, from, to] of changes) if (each === element && recorded[index]?.attributes?.[name] === from) recorded[index].attributes[name] = to;
          });
        }
      }
    }
  }

  // What a step puts into a block (`from`: what the step left there, `to`: what it puts back): as
  // recorded, unless someone else's words were merged into the block since the step; then the step's
  // change three ways against what the block holds now (null: the two touch the same place).
  function textFor(step, node, from, to) {
    if (from === undefined || (lastMerge.get(node) ?? 0) < step.serial) return to;
    const now = ownHTML(node);
    return now === from ? to : mergeText(from, to, now);
  }

  // The text block the caret is in, in the document of `node`, with where in it, or null.
  function caretPlace(node) {
    const selection = node?.ownerDocument.getSelection();
    const host = selection?.rangeCount ? editable(selection.anchorNode) : null;
    return host ? { host, offsets: rangeOffsets(host, selection.getRangeAt(0)) } : null;
  }

  // Structural changes (split, merge, remove, multi-line paste, deleting, moving or converting a
  // block) are recorded as the child lists of the containers involved plus the content of the
  // blocks involved and the classes the change gave or took from them (a table cell's color goes
  // with its text: table/cells.mjs), so undo puts the very same nodes back; containers the change made
  // (result.created) are recorded as empty before it. A deleted block (result.select) is selected
  // again on undo (on redo too with result.reselect; blocks turned into another type select what
  // they were on undo and what they are on redo, result.selectAfter); result.settle(backwards) runs
  // after undo and redo (a deleted Sheet tab switches the Sheet shown). A step that names no text block
  // it came from keeps where the caret stood, which undo puts back.
  // `attributes`: [element, [names]] whose attributes the step records too (a table's cells: their
  // spans and widths, which its operations change: components/table/page.mjs). `caret`: where the caret
  // stood in the first text block it touched is kept too, which undo puts back (Enter in the page's
  // title: after undo the caret is where it was before Enter; typing/ enterBody).
  function struct(parents, touched, mutate, { attributes = [], caret = false, typedInto = null } = {}) {
    closeTyping();
    // What the change may leave untidy is tidied after it by the components that know (rows of
    // columns with a column emptied, lists set side by side: tidy), so what they name is recorded
    // too. Each sees the parents the ones before it added.
    const tidying = [];
    for (const one of tidy()) {
      const part = one(parents);
      parents = [...new Set([...parents, ...part.parents])];
      attributes = [...attributes, ...(part.attributes ?? [])];
      tidying.push(part);
    }
    // A text block among the parents (a list item whose lists change) keeps its text through undo too.
    touched = [...new Set([...touched, ...parents.filter(isHost)])];
    const place = touched[0] && !caret ? null : caretPlace(parents[0]);
    const before = parents.map(contentOf);
    const htmlBefore = new Map(touched.map((node) => [node, ownHTML(node)]));
    const classesBefore = new Map(touched.map((node) => [node, new Set(node.classList)]));
    // The attributes the file keeps of the containers (ATTRIBUTES: a numbered list's start, which a
    // split may set) are recorded too.
    const kept = parents.filter((parent) => ATTRIBUTES[parent.getAttribute("data-ge-unit-kind")]);
    const attributesOf = () => new Map([...kept.map((parent) => [parent, Object.keys(ATTRIBUTES[parent.getAttribute("data-ge-unit-kind")]).map((name) => [name, parent.getAttribute(name)])]),
      ...attributes.map(([element, names]) => [element, names.map((name) => [name, element.getAttribute(name)])])]);
    const attributesBefore = attributesOf();
    const result = mutate();
    if (!result) return null;
    // What a tidier took into a container the step does not record (`grown`: [container, its nodes
    // before that]) is recorded with the container, or undo and redo would leave it nowhere.
    const grown = tidying.flatMap((part) => part.settle?.(result)?.grown ?? []).filter(([node]) => !parents.includes(node));
    const made = (result.created ?? []).filter((node) => !parents.includes(node));
    parents = [...parents, ...made, ...grown.map(([node]) => node)];
    before.push(...made.map(() => []), ...grown.map(([, nodes]) => nodes.filter((node) => !ownUI(node))));
    push({
      type: "struct",
      parents,
      before,
      after: parents.map(contentOf),
      htmlBefore,
      htmlAfter: new Map([...new Set([...result.touched, ...parents.filter(isHost)])].map((node) => [node, ownHTML(node)])),
      // The classes it gave (taken off on undo) and took (given back), of the blocks it touched.
      classes: [...classesBefore].map(([node, before]) => ({ node, added: [...node.classList].filter((name) => !before.has(name)), removed: [...before].filter((name) => !node.classList.contains(name)) }))
        .filter(({ added, removed }) => added.length > 0 || removed.length > 0),
      attributesBefore,
      attributesAfter: attributesOf(),
      focusBefore: (caret ? place?.host : null) ?? touched[0] ?? place?.host,
      caretBefore: place?.offsets ?? null,
      focusAfter: result.focus,
      select: result.select ?? null,
      reselect: Boolean(result.reselect), // a moved block stays selected on redo too
      selectAfter: result.selectAfter ?? null, // what redo selects instead
      caret: result.caret ?? null, // where redo puts the caret when it selects nothing (tidyEmptied)
      settle: result.settle ?? null,
      typedInto, madeAt: Date.now(), // the block made for what is typed, whose first run of typing is part of this step (closeTyping)
    });
    result.touched.forEach((node) => lastKnown.set(node, ownHTML(node)));
    note("history", "change");
    settle();
    changed(true);
    return result;
  }

  // `next` in the place of `node`, as part of the last step, when that step put `node` on the page (a
  // picture filled in a block just pasted): the step holds `next` from now on, so that undo takes it
  // off with the rest and redo brings it back. Returns whether it was, nothing done otherwise: the
  // reader went on, and it is a step of its own.
  function finish(node, next) {
    const step = undoStack.at(-1);
    if (typingChanged() || step?.type !== "struct" || !step.after.some((nodes) => nodes.some((each) => each.contains(node)))) return false;
    const swapped = (list) => list.map((each) => (each === node ? next : each));
    node.replaceWith(next);
    step.after = step.after.map(swapped);
    if (Array.isArray(step.select)) step.select = swapped(step.select);
    note("history", "change");
    settle();
    changed(true);
    return true;
  }

  // Apply a step (undo: `backwards`); returns the block to put the caret in, or REFUSED when a block
  // it changes holds merged words that its change touches (nothing is applied then).
  function apply(step, backwards) {
    if (step.stale) return REFUSED; // about a container someone else's write took off the page (pulled)
    if (step.type === "text") {
      const html = textFor(step, step.element, backwards ? step.after : step.before, backwards ? step.before : step.after);
      if (html === null) return REFUSED;
      setHTML(step.element, html);
      afterText(step.element);
      return step.element;
    }
    if (step.type === "look") {
      step.elements.forEach((element, index) => setLook(element, (backwards ? step.before : step.after)[index]));
      return null;
    }
    if (step.type === "source") {
      step.elements.forEach((element, index) => { element.innerHTML = (backwards ? step.before : step.after)[index]; });
      return null;
    }
    const left = backwards ? step.htmlAfter : step.htmlBefore;
    const texts = [...(backwards ? step.htmlBefore : step.htmlAfter)].map(([node, html]) => [node, textFor(step, node, left.get(node), html)]);
    if (texts.some(([, html]) => html === null)) return REFUSED;
    // The blocks it takes off the page that someone else's words were merged into since it was recorded (a
    // paragraph the reader made, the Agent's words pulled into it, then the split undone): they go, and the
    // page claims to have seen none of the file's of them (mergedOff), so their deletion asks first, as any
    // of a block someone else changed does.
    const lists = backwards ? step.before : step.after;
    const staying = new Set(lists.flat());
    const leaving = step.parents.flatMap((parent) => contentOf(parent).filter((node) => !staying.has(node) && node.nodeType === 1));
    const merged = leaving.flatMap((node) => [node, ...node.querySelectorAll("[contenteditable]")]).filter((node) => (lastMerge.get(node) ?? 0) > step.serial);
    step.parents.forEach((parent, index) => restoreChildren(parent, lists[index]));
    if (merged.length > 0) mergedOff(merged);
    for (const [node, html] of texts) setHTML(node, html);
    for (const { node, added, removed } of step.classes ?? []) {
      node.classList.remove(...(backwards ? added : removed));
      node.classList.add(...(backwards ? removed : added));
    }
    for (const [parent, values] of (backwards ? step.attributesBefore : step.attributesAfter) ?? []) {
      for (const [name, value] of values) value === null ? parent.removeAttribute(name) : parent.setAttribute(name, value);
    }
    step.settle?.(backwards);
    return backwards ? step.focusBefore : step.focusAfter;
  }

  // A block's look: classes switched on it (a section's divider line, a centered card), its sizes
  // (a card's or table's width and height) and attributes set on it (a code block's language), as
  // { classes: { name: on }, sizes: { name: value | null }, attributes: { name: value | null } }.
  function lookOf(element, { classes = {}, sizes = {}, attributes = {} }) {
    return {
      classes: Object.fromEntries(Object.keys(classes).map((name) => [name, element.classList.contains(name)])),
      sizes: Object.fromEntries(Object.keys(sizes).map((name) => [name, element.style.getPropertyValue(name).trim() || null])),
      attributes: Object.fromEntries(Object.keys(attributes).map((name) => [name, element.getAttribute(name)])),
    };
  }

  function setLook(element, { classes = {}, sizes = {}, attributes = {} }) {
    for (const [name, on] of Object.entries(classes)) element.classList.toggle(name, on);
    for (const [name, value] of Object.entries(sizes)) value ? element.style.setProperty(name, value) : element.style.removeProperty(name);
    for (const [name, value] of Object.entries(attributes)) value === null ? element.removeAttribute(name) : element.setAttribute(name, value);
    // Charts redraw on a width change by themselves; a height they are told about.
    if (Object.keys(sizes).length > 0) dispatchEvent(new Event("doc-layout-change"));
  }

  // A change of look as one undo step (nothing when it changes nothing), of one element or of several
  // (a color given to the selected blocks); `select` is selected again on undo. Returns whether
  // anything changed.
  function lookStep(element, change, select = null) {
    const elements = Array.isArray(element) ? element : [element];
    closeTyping();
    // One change for them all, or one each (`change` a list: a table's columns given their widths).
    const changes = Array.isArray(change) ? change : elements.map(() => change);
    const before = elements.map((each, index) => lookOf(each, changes[index]));
    elements.forEach((each, index) => setLook(each, changes[index]));
    const after = elements.map((each, index) => lookOf(each, changes[index]));
    if (JSON.stringify(before) === JSON.stringify(after)) return false;
    elements.forEach((each) => realize(each));
    push({ type: "look", elements, before, after, select });
    changed(true);
    return true;
  }

  function undo() {
    beforeUndo();
    closeTyping();
    merging = null;
    const step = undoStack.pop();
    if (!step) return;
    const host = apply(step, true);
    if (host === REFUSED) {
      undoStack.push(step);
      return refuse(step.stale ? "pulled" : "merged");
    }
    redoStack.push(step);
    note("history", `undo ${step.type}`);
    if (step.type === "struct") settle();
    restore(step, host, true);
  }

  function redo() {
    beforeUndo();
    closeTyping();
    merging = null;
    const step = redoStack.pop();
    if (!step) return;
    const host = apply(step, false);
    if (host === REFUSED) {
      redoStack.push(step);
      return refuse(step.stale ? "pulled" : "merged");
    }
    undoStack.push(step);
    note("history", `redo ${step.type}`);
    if (step.type === "struct") settle();
    restore(step, host, false);
  }

  // After undo or redo: where it landed shown, the blocks it selects selected again, or the caret in
  // the text block it changed.
  function restore(step, host, backwards) {
    const selects = Boolean(step.select || step.selectAfter);
    const chosen = selects ? (backwards ? step.select : step.selectAfter ?? (step.reselect ? step.select : null)) : null;
    show([chosen].flat()[0] ?? (selects && !backwards ? step.caret : host) ?? step.elements?.[0] ?? step.parents?.[0]);
    if (selects) {
      if (chosen) blocks().select(chosen, { quiet: true });
      else {
        blocks().clear();
        if (!backwards && step.caret) caretAt(step.caret, "start");
      }
    } else if (isHost(host) && (step.selection || (backwards && step.caretBefore)) && host.isConnected) {
      host.focus({ preventScroll: true });
      select(rangeAt(host, step.selection ?? step.caretBefore));
    } else if (isHost(host)) caretAt(host, "end");
    changed(true);
  }

  return {
    /** Each block's content after the last recorded change (block -> HTML). */
    lastKnown,
    recordText,
    recordStep,
    sourceStep,
    fold,
    drop,
    rekeyed,
    closeTyping,
    struct,
    finish,
    lookStep,
    undo,
    redo,
    /**
     * A commit merged someone else's words into a block (the page shows them now): what was typed
     * there is a step of its own, ending before their words came in, and steps recorded before undo
     * three ways from now on (textFor).
     */
    merged(host) {
      if (typing?.element === host) closeTyping();
      lastKnown.set(host, ownHTML(host));
      lastMerge.set(host, ++serial);
    },
    /**
     * Someone else's write was taken in where the page stands (a pull, page/pull/: `removed`, the elements it took off
     * the page; `placed`, those it put in or moved; `unsure`, text blocks whose words it showed in a unit it paired
     * by where it stands alone, plan.mjs `guessed`). Every structural step recorded before goes by the page as it is
     * now: in each list of a container's nodes it holds, what was taken off, or moved out of that container, is no
     * more, and what was put in, or moved into it or within it, is, after the nearest node before it on the page that
     * the list holds (but in a list of the step's that did not hold one the step itself made or took out); so an undo
     * or a redo puts back the reader's change and none of the Agent's undone: it takes out nothing the Agent put in,
     * puts back nothing the Agent took out, moves back nothing the Agent moved. Refused from then on (`stale`:
     * refuse("pulled"), "Agent 拿走或改动了这一步改过的块"), where it cannot go so without leaving the reader's or the Agent's
     * words twice or none: a step about a container the write took off the page (its nodes would go nowhere), one
     * whose own block (made or taken out by it: the paragraph Enter split off) the write took out or moved into
     * another container (the undo of the split would join its words into the first and leave it where the Agent put
     * it: twice), one whose words it sets in a block the write took out, a step of words, a look or a source in a
     * block the write took out, and a step of words in a block it showed the words of a unit paired by place alone
     * (no telling that it is the block the reader wrote in).
     */
    pulled({ removed = [], placed = [], unsure = [] }) {
      if (removed.length === 0 && placed.length === 0 && unsure.length === 0) return;
      closeTyping(); // what was typed so far a step of its own, gone by the page as it is now
      const gone = (node) => removed.some((top) => top === node || top.contains(node));
      const inOrder = [...placed].sort((a, b) => (a.compareDocumentPosition(b) & 4 ? -1 : 1));
      for (const step of [...undoStack, ...redoStack]) {
        if (step.type === "text") {
          if (gone(step.element) || unsure.includes(step.element)) step.stale = true;
          continue;
        }
        if (step.type === "look" || step.type === "source") {
          if (step.elements.some(gone)) step.stale = true;
          continue;
        }
        if (step.type !== "struct") continue;
        const own = step.parents.flatMap((parent, index) => {
          const [before, after] = [new Set(step.before[index]), new Set(step.after[index])];
          return [...before, ...after].filter((node) => !(before.has(node) && after.has(node)));
        });
        const worded = [...(step.htmlBefore?.keys() ?? []), ...(step.htmlAfter?.keys() ?? [])];
        if (step.parents.some(gone) || own.some((node) => gone(node) || (placed.includes(node) && !step.parents.includes(node.parentNode))) || worded.some(gone)) {
          step.stale = true;
          continue;
        }
        step.parents.forEach((parent, index) => {
          const had = new Set([...step.before[index], ...step.after[index]]);
          for (const which of ["before", "after"]) {
            const original = step[which][index];
            const list = original.filter((node) => !gone(node) && !placed.includes(node));
            for (const node of inOrder) {
              if (node.parentNode !== parent) continue;
              if (had.has(node) && !original.includes(node)) continue; // the step's own (one it made, or took out): as it was
              let at = -1;
              for (let previous = node.previousSibling; previous && at < 0; previous = previous.previousSibling) at = list.indexOf(previous);
              list.splice(at + 1, 0, node);
            }
            step[which][index] = list;
          }
        });
      }
    },
  };
}
