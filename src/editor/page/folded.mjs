// What the other tools ask of the headings' folds (fold/ folds a heading's section, docs/editor.md
// "Folding a heading's section"): the mark on what a fold hides, whether a node is hidden by one, and
// reveal(), what every path that brings a block into sight goes through (a link to a block, the
// outline, a 批注, a conflict's card): the folds over it opened, then what the kit opens.

/** What marks a unit (and its leads) a fold hides: the identity (data-ge-id) of the outermost heading folded over it. */
export const FOLDED = "data-ge-folded";

/** Whether a node (or the block it is in) is hidden by a fold. */
export const hiddenByFold = (node) => Boolean((node?.nodeType === 1 ? node : node?.parentElement)?.closest?.(`[${FOLDED}]`));

let opener = null; // the page's fold tool's showAround, once editing begins
let foldedHeading = () => false; // the page's fold tool's isFolded, while editing

/** The page's fold tool: what opens the folds over a node (fold/ showAround), and whether a heading is folded (fold/ isFolded). */
export function setFoldOpener(open, isFolded = () => false) {
  opener = open;
  foldedHeading = isFolded;
}

/**
 * The folded heading whose section a place right after `node` (a block in its box, or what else
 * stands there) is in, or null: the outermost one hiding `node`, or `node` itself, folded. What stands
 * at a place of the page without being a block of it (the ghosts of the blocks an Agent deleted,
 * changes/ghost.mjs) is hidden with the section as its blocks would be.
 */
export function foldOver(node) {
  const marked = node?.closest?.(`[${FOLDED}]`);
  if (marked) return node.ownerDocument.querySelector(`[data-ge-id="${CSS.escape(marked.getAttribute(FOLDED))}"]`);
  return node && foldedHeading(node) ? node : null;
}

/** What hides `target` opened: the folds over it first, then what the kit opens (DocKit.reveal: a disclosure, a tab, a detail card). */
export function reveal(target) {
  opener?.(target);
  globalThis.DocKit?.reveal(target);
}
