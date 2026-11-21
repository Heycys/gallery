import { escapeText } from "../../shared/escape.mjs";

/**
 * How a box of blocks set apart (a highlight block, a callout: `match` its elements) is copied, one
 * rule for both, their clipboard's hooks (registry.mjs `clipboard`) for the block of `type`: its
 * blocks; one with words straight in it (an Agent's, a callout written the old way), a paragraph of
 * what it says. A list with its class is a list, and a text block of a type of its own that type.
 */
export const setApart = (type, match) => ({
  describe(node, { isHost, holding, colorOf, copiedType, serializeInner, plain }) {
    if (!node.matches(match) || node.matches("ul, ol") || (isHost(node) && copiedType(node))) return undefined;
    const straight = [...node.childNodes].some((child) => child.nodeType === 3 && child.data.trim());
    const words = isHost(node) ? serializeInner(node) : straight ? escapeText(plain(node)) : null;
    const blocks = words === null ? holding(node) : [{ type: "paragraph", html: words }];
    const color = colorOf(node);
    return blocks ? { type, blocks, ...(color ? { color } : {}) } : null;
  },
  endsIn(unit, { blocksIn, boxesOf, colorOf }) {
    if (!unit.matches(match)) return undefined;
    const color = colorOf(unit);
    return [{ type, blocks: blocksIn(boxesOf(unit)), ...(color ? { color } : {}) }];
  },
  check: (block, { container }) => container(block),
});
