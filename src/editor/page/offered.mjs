import { TYPE_COMPONENT, blocksHidden } from "../components/registry.mjs";

// What the menus that make a block offer of the reader's 设置 › 组件列表 (docs/workbench.md): the one place
// that hears what is hidden, gallery.json's as the page's map holds it (`hidden`), then as its event
// stream says it (`doc-settings-changed`), which costs the page nothing. A block type goes with its
// component. "/", 在下方新建 (both slash-menu/ typeItems) and the handle's grid (block-menu/) read it; no
// other path to a type does: its Markdown shortcut, a paste, the format bar's turn into, what stands on
// the page, what 组成分区 or a conversion reaches. A package says its own `state`, which its rows go by
// (`menuVariants`, components/installed/page.mjs): its rows are in no block type's list.

let hidden = new Set(); // the names of the components hidden

const isHidden = (type) => hidden.has(TYPE_COMPONENT[type]);

/** Hide what `names`, gallery.json's `hidden` as it is, says of the blocks. */
export const hideBlocks = (names) => {
  hidden = new Set(blocksHidden(names));
};

/**
 * `types` less those hidden. `own`, the type a block is, stays: it is marked there, and a block of a
 * hidden type is one like any other. A list left with nothing keeps what it had: it is all a place
 * takes, and hiding a block never stops an existing one from growing.
 */
export function offered(types, own = null) {
  const kept = types.filter((type) => type === own || !isHidden(type));
  return kept.length > 0 ? kept : types;
}

/** What a block can be turned into (`turn`, as convert.mjs gives it, or null), as its menu offers it. */
export const offeredTurn = (turn) => turn && { ...turn, types: offered(turn.types, turn.current) };

