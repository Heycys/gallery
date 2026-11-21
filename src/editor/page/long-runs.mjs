import { holdsLongRun } from "../../shared/long-runs.mjs";
import { textFilters } from "../components/registry.mjs";
import { addStyle } from "./ui.mjs";

// A long run in the text the page editor edits (src/shared/long-runs.mjs: a path, a URL, a long
// identifier, more than 20 characters with no place to break inside it) breaks where its line ends,
// as the kit breaks it in the page a reader sees (runtime/spacing.js, a span that breaks anywhere,
// .doc-long-run). No span goes into text the editor keeps equal to the file, so a text block whose
// own text holds such a run breaks anywhere as a whole (data-ge-long-run: word-break: break-all),
// and an ordinary word in that block may then be parted at a line's end too, which no other block's
// is (the compromise docs/editor.md names). The rule's weight is none: a block's own (a table's
// header keep-all, a short field normal, a code block's lines) wins; what the block holds that is a
// block or an atom of its own ([contenteditable="false"]: a nested list, a formula) breaks as it would
// without it, and an item of that list is judged by its own text. Never a block of plain text (a code
// block's lines, a tab's name: textFilters false), which keeps its own rule; a text part of an
// instance of a component package is judged as any text block (its component's own word-break, where
// it says one, wins), though the kit holds no run in an instance's own region.
//
// Judged as editing starts, for every text block, and again for the blocks whose text changed, as it
// changes, whatever changed it (typing, a paste, undo, a rebuild from the file, a block made or made
// editable): the page's mutations are watched (childList, characterData, contenteditable), and only
// the blocks they stand in are judged, each by its own text (a regular expression over a block's
// words: no scan of the page per keystroke). The marker is no text of the file's: a data-ge-* attribute
// on the block itself (core.mjs), set or taken off only where it changes.

const MARK = "data-ge-long-run";
const HOST = '[contenteditable="true"]';

const STYLE = `
  /* A text block holding a long run breaks anywhere (long-runs.mjs), of no weight: a block's own rule wins. */
  :where([data-ge-editing] [data-ge-long-run]) { word-break: break-all; }
  /* What it holds of its own (a nested list, a formula) breaks as the page's text does. */
  :where([data-ge-editing] [data-ge-long-run] [contenteditable="false"]) { word-break: normal; }
`;

// The text of `host` its own: not a block or an atom it holds (contenteditable="false"), a line break a space.
function ownText(host) {
  const walker = host.ownerDocument.createTreeWalker(host, 5, { // NodeFilter.SHOW_ELEMENT | SHOW_TEXT
    acceptNode: (node) => (node.nodeType === 1 && node !== host && node.hasAttribute("contenteditable") ? 2 : 1), // FILTER_REJECT, FILTER_ACCEPT
  });
  let text = "";
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === 3) text += node.data;
    else if (node.localName === "br") text += " ";
  }
  return text;
}

/** Marks `element` as a text block holding a long run, or takes the mark off: whether it holds one. */
export function judgeLongRuns(element) {
  const long = element.isConnected && element.matches(HOST) && textFilters(element) && holdsLongRun(ownText(element));
  if (long !== element.hasAttribute(MARK)) element.toggleAttribute(MARK, long);
  return long;
}

/** Judges every text block under `root` now, and each again as its text changes. */
export function followLongRuns(root) {
  addStyle(STYLE);
  for (const host of root.querySelectorAll(`${HOST}, [${MARK}]`)) judgeLongRuns(host);
  new MutationObserver((records) => {
    const judged = new Set();
    for (const record of records) {
      if (record.type === "attributes") judged.add(record.target); // made editable, or no longer
      const at = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      const host = at?.closest(HOST);
      if (host) judged.add(host);
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches(HOST)) judged.add(node);
        for (const inner of node.querySelectorAll(HOST)) judged.add(inner);
      }
    }
    judged.forEach(judgeLongRuns);
  }).observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["contenteditable"] });
}
