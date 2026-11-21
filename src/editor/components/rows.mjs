import { t } from "../../shared/i18n/index.mjs";
// What a component's own rows of the block menu share (`menuItems` of each component's page module:
// block-menu/index.mjs asks the block's own, one source of a block's component rows). A row that changes a
// block's look, its classes and sizes, as one undo step.

/**
 * The row for `target`: `change` ({ classes, sizes }) applied by look(element, change, select)
 * (the editor's undoable change, history.mjs: the block is selected again on undo), `done` said on
 * the status line once it was. `state` ({ current } or { checked }) is how the menu shows it.
 */
export const lookRow = ({ look, say }, target, { label, icon, change, done, ...state }) => ({
  label,
  icon,
  ...state,
  run: () => { if (look(target, change, target)) say(t("{0} · Ctrl+Z 撤销", done)); },
});
