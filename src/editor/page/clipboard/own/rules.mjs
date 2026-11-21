// What a pasted block must be to go into the page (pure): the rules checkBlocks (blocks.mjs, the
// clipboard's own data, which is not trusted) and import/to-blocks.mjs (another program's content,
// made into blocks that pass) both go by, so that one rule is one function.

import { BLOCK_TYPES, clipboardOf } from "../../../components/registry.mjs";

/** The kind of unit a described block becomes (for accepts()); undefined for a type the page has none of. */
export const kindOfBlock = (block) => (block.type === "copy" ? block.kind : BLOCK_TYPES[block.type]?.kind);

/**
 * Described blocks with each run of list items copied on their own (an item carrying its list's
 * kind, `list`: an item is a block of its list's type) made a list of that kind, the items no
 * longer carrying it, and each run of a flowchart's nodes copied on their own a flowchart: where a
 * box takes no items or nodes (asLists), and for other programs (export.mjs).
 */
export function groupItems(blocks) {
  const out = [];
  const runs = new Set();
  for (const block of blocks) {
    const { run } = clipboardOf(block.type);
    if (!run) {
      out.push(block);
      continue;
    }
    const { list: kind = run, ...item } = block;
    const last = out.at(-1);
    if (runs.has(last) && last.type === kind) last.blocks.push(item);
    else {
      const run = { type: kind, blocks: [item] };
      runs.add(run);
      out.push(run);
    }
  }
  return out;
}

const IMAGE_SOURCE = /^(https?:\/\/[^\s"<>]+|data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[a-z0-9+/=]+)$/i;
const WEB_PAGE = /^https?:\/\/[^\s"<>]+$/i;

/** Whether `src` is an address a pasted image may have: a web address, or a data: picture. */
export const imageSource = (src) => typeof src === "string" && src.length <= 15e6 && IMAGE_SOURCE.test(src);

/** Whether `src` is an address a pasted embed may have: a web page's. */
export const webPage = (src) => typeof src === "string" && src.length <= 2000 && WEB_PAGE.test(src);
