import { CELL_ALIGNS, CELL_VALIGNS } from "../../components/table/index.mjs";
import { TABLE_ICONS } from "./icons.mjs";

// The alignments a cell may have (components/table/index.mjs CELL_ALIGNS, CELL_VALIGNS), as the
// cells' bar and a column's menu offer them: the three, then the three vertical ones.

/** What all of `cells` have of one group of alignments: the class's name, null when they have none (the kit's own), undefined when they differ. */
export function sharedAlign(cells, group) {
  const of = (cell) => group.find(([name]) => cell.classList.contains(name))?.[0] ?? null;
  return cells.every((cell) => of(cell) === of(cells[0])) ? of(cells[0]) : undefined;
}

/** The look that gives cells the alignment `name`: its class on, the others of its group off. */
export function alignLook(name) {
  const group = CELL_VALIGNS.some(([each]) => each === name) ? CELL_VALIGNS : CELL_ALIGNS;
  return { classes: Object.fromEntries(group.map(([each]) => [each, each === name])) };
}

/**
 * The alignments to offer for `cells`: [{ name, label, icon, vertical, current, run }], each
 * `current` when all the cells have it (cells with none have the first of its group, the kit's
 * own, but differing cells have none), `run` (when `apply` is given) calling `apply(name)`.
 */
export function alignItems(cells, apply = null) {
  return [CELL_ALIGNS, CELL_VALIGNS].flatMap((group, index) => {
    const shared = cells.length > 0 ? sharedAlign(cells, group) : undefined;
    return group.map(([name, label]) => ({ name, label, icon: TABLE_ICONS[name], vertical: index === 1, current: shared !== undefined && (shared ?? group[0][0]) === name, run: () => apply?.(name) }));
  });
}
