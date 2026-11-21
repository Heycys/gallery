import { keptAnyway, partsOf, removalTarget, withLeads } from "../core.mjs";
import { alive, ordered, otherTabs } from "../block-info.mjs";
import { caretAt } from "../caret.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// Deleting whole blocks (docs/editor.md, "Deleting blocks"): the selected ones with Delete or
// Backspace, the block menu's 删除, or Ctrl+X. Selected blocks go together, or none does (one of
// them is referred to, data-ge-keep, or they are a row's last tabs), with the reason. A container
// they leave empty goes too (core.mjs removalTarget); when a Sheet tab's Sheet was shown, the next
// tab is clicked (undo clicks it back). One undo step, which selects the blocks again. A box that
// always holds a block gets an empty paragraph once they are gone (core.mjs tidyEmptied), the caret
// in it. That one empty paragraph stays (keptAnyway: it would be put back as it is), so deleting
// only it does nothing and says nothing. A folded heading goes with what it hides, or as the section
// it covers whole (fold/ takenWith).

/**
 * info: block-info.mjs. selection: selection/index.mjs. struct(parents, touched, mutate): the
 * editor's undoable structural change (history.mjs). say: the status line. closeMenu(): the block
 * menu closes. forget(): the handle forgets the block it stood beside. folds: the headings' folds (fold/).
 */
export function createDelete({ info, selection, struct, say, closeMenu, forget, folds = null }) {
  const { kindOf, nameOf, keepText, named } = info;

  return function remove(targets = selection.picked) {
    closeMenu();
    const picked = ordered([targets].flat().filter(alive));
    const list = (folds ? folds.takenWith(picked) : picked).filter((target) => !keptAnyway(target));
    if (list.length === 0) return;
    const refused = list.map((target) => [target, keepText(target, list)]).find(([, reason]) => reason);
    if (refused) {
      selection.select(list, { quiet: true });
      say(list.length > 1 ? t("其中的{0}不能删除：{1}", nameOf(refused[0]), refused[1]) : refused[1], "note", 6000);
      return;
    }
    selection.clear();
    forget();
    // What goes: each block, or its container once nothing else is left in it.
    const gone = new Set(list.flatMap(withLeads));
    const nodes = [...new Set(list.map((target) => removalTarget(target, gone)))];
    const parts = nodes.flatMap(partsOf);
    // The Sheet shown moves to a tab still there.
    const tabs = nodes.filter((node) => kindOf(node) === "tab");
    const shownTab = tabs.find((tab) => tab.getAttribute("aria-selected") === "true");
    // The one right of it shows instead, or left of it when it was the last.
    const row = shownTab ? [...shownTab.parentElement.children] : [];
    const at = row.indexOf(shownTab);
    const neighbour = shownTab && [...row.slice(at + 1), ...row.slice(0, at).reverse()].find((tab) => otherTabs(shownTab).includes(tab) && !tabs.includes(tab));
    // After the area started again with its tabs as they are now (components/sheets/pills.mjs, on the
    // same change: its observer's turn comes first).
    const settle = shownTab ? (backwards) => queueMicrotask(() => (backwards ? shownTab : neighbour)?.click()) : null;
    const done = struct([...new Set(parts.map((part) => part.parentNode))], [], () => {
      parts.forEach((part) => part.remove());
      settle?.(false);
      return { touched: [], focus: null, select: list, settle };
    });
    if (done?.caret) caretAt(done.caret, "start");
    const emptied = nodes.some((node) => !list.includes(node));
    const name = list.length === 1 ? nameOf(nodes[0]) : folds ? folds.namedWith(picked, list, named) : t("{0} 块", list.length);
    say(t("已删除{0}{1}{2} · Ctrl+Z 撤销", name, emptied ? t("（外层已空，一并删除）") : "", tabs.length > 0 ? t("，连同其中的内容") : ""));
  };
}
