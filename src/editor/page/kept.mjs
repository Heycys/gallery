// What the tools that follow the pointer look through on every move (the tables near it: table/; the
// cards, tables and code blocks whose edges resize them: resize/; the sections whose right side
// shows their bar: handle/), found once and kept until the page's elements change, never on each
// move: a selector over the whole document on every move, with the measuring each did around it,
// cost 0.7–1.8ms a move on a long report. Only the list is kept: where its elements are is measured
// on the move (a rectangle read from a laid-out page is cheap, and a kept one would go stale with
// every reflow). One observer for every list: a node added or taken off, or an attribute that may
// change what a list finds or holds (what makes a block one, its kind, its class, hidden, inert, a
// dialog open, a table locked), anywhere but in the editor's own nodes (data-doc-dev: its
// drawings and controls, which hold no block), and each list is found again when next asked for.
// What is still waiting to be said to the observer is taken first, so a list asked for in the same
// task as the change is found again too.

const ATTRIBUTES = ["data-ge-unit", "data-ge-new", "data-ge-unit-kind", "data-ge-grid", "data-ge-lock", "class", "hidden", "inert", "open"];

let version = 0;
let observer = null; // made when a list is first asked for
const changes = (records) => records.some((record) => !record.target.closest?.("[data-doc-dev]"));

/** A list of the page's elements, `find()` run again only once the page's elements may have changed. */
export function kept(find) {
  let at = -1;
  let list = [];
  return () => {
    if (!observer) {
      observer = new MutationObserver((records) => {
        if (changes(records)) version++;
      });
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ATTRIBUTES });
    }
    if (changes(observer.takeRecords())) version++;
    if (at !== version) {
      list = find();
      at = version;
    }
    return list;
  };
}
