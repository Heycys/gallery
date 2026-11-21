import { createHash } from "node:crypto";

export { BLOCK_LEVEL } from "../../shared/html-tree.mjs";

// Reading the parsed report (parse5 nodes) and its source: a hash of a piece of source, blank text,
// an element found by its tag (an element's attributes and classes and the block-level tags are
// shared/html-tree.mjs's).

export const hashOf = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);

export const blank = (node) => node.nodeName === "#text" && !node.value.trim();

export function findElement(node, tag) {
  for (const child of node.childNodes ?? []) {
    if (child.tagName === tag) return child;
    const found = child.tagName && findElement(child, tag);
    if (found) return found;
  }
  return null;
}
