import { svg } from "../icons.mjs";
import { componentOf } from "../../../shared/components/index.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { boxed, flowRows } from "../read-rows.mjs";

// 分栏: blocks side by side (src/shared/components/columns.mjs). The row
// (.doc-columns) holds 2 to 5 columns (.doc-column), each a flow of any blocks but chapters
// and other rows. Neither gets a handle: the blocks in the columns do, and "选中外层"
// from one of them selects the row (to move or delete it whole). A column's width is its share of
// the row (--doc-column-ratio). page.mjs: making a row (a block dropped beside another, 分栏 in
// the block menu), a column added, rows kept tidy (a column left empty goes, a row left with one
// column gives its blocks back), the ratios; file.mjs: a row and its columns in report.html.
//
// Where the engines reach it (src/editor/page/ unless named): drag/drop.mjs (a drop beside a block:
// `aside`), drag/ (making the row), block-menu/ (分栏), columns/ (the gaps: dragging one resizes the
// two columns beside it, its pin adds a column; the row's tint), history.mjs (a structural step
// leaves rows tidy: its page object's tidy, which editor.mjs gives it), geometry.mjs (box selection takes
// the blocks in the columns; a click below a short column writes in it), handle/ (no handle of
// their own), block-info.mjs (选中外层 passes over a column), commit.mjs (a column's ratio in its
// node), clipboard/own/ (`clipboard`: copied as itself, made of another program's), ../source/ (a row made on the page).
// Its look: the kit's styles/columns.css (src/render/kit/).
export const RATIO = "--doc-column-ratio";
// How many columns a row holds, and the least share of it a column takes: the shared description's.
const shared = componentOf("columns");
export const MIN_COLUMNS = shared.parts.columns.min;
export const MAX_COLUMNS = shared.parts.columns.max;
export const MIN_RATIO = shared.shares.min;

/** How many columns, as the menus say it (分两栏, 已分成三栏). */
export const COUNTS = ["", t("一"), t("两"), t("三"), t("四"), t("五")];

/** A row of `count` columns (the block menu's 分两栏, 分三栏…): a box split by count - 1 lines. */
export const columnsIcon = (count) => svg(`<rect x="2.75" y="4.75" width="14.5" height="10.5" rx="2"/><path d="${Array.from({ length: count - 1 }, (_, index) => `M${(2.75 + (14.5 * (index + 1)) / count).toFixed(2)} 4.75v10.5`).join("")}"/>`);

export default {
  name: "columns",
  glance: { row: 15, name: "分栏", write: "`div.doc-columns`", rule: "Kit blocks" },
  units: {
    columns: {
      name: t("分栏"),
      icon: columnsIcon(2),
      match: [{ rank: 60, class: "doc-columns" }],
      handle: "none", // the blocks in its columns have handles
      beside: true,
      copy: "itself",
      // gallery read (../read-rows.mjs): boxed, its columns boxed in it; the export's Markdown writes them one after another.
      read: { name: "分栏", rows: (node, view) => boxed(node, `分栏 · ${node.children.length} 栏${view.tools.looks(node.el)}`, flowRows(node.children, view)), lost: () => "分栏 {n} 个（并排写成先后）" },
    },
    column: {
      name: t("栏"),
      match: [{ rank: 70, class: "doc-column" }],
      fixed: true, // only in its row
      sharesHeight: true,
      block: false, // no block of its own: the blocks in it, or its row, are selected
      handle: "none",
      sizes: { [RATIO]: { min: MIN_RATIO, max: 1 } },
      read: {
        name: "栏",
        rows(node, view) {
          const columns = node.parent?.children ?? [node];
          return boxed(node, `第 ${columns.indexOf(node) + 1} 栏${view.tools.looks(node.el)}`, flowRows(node.children, view));
        },
      },
    },
  },
  boxes: {
    columns: { role: "columns", name: t("分栏"), selectAll: { whole: true }, classes: [{ rank: 10, class: "doc-columns" }] },
    column: { role: "column", name: t("分栏"), groups: true, selectAll: { content: t("这一栏里的全部内容") }, classes: [{ rank: 20, class: "doc-column" }] },
  },
  types: {
    // A row is written once each of its columns has something to write (a new one, its first block:
    // the empty paragraph it starts with counts, as an empty paragraph is written); a column with
    // its share of the row.
    columns: {
      tag: "div", className: "doc-columns", kind: "columns", box: "columns",
      // Copied as itself (`copy` above). Elsewhere it comes as this, from another program: its
      // columns' blocks, each with its share of the row.
      clipboard: {
        kind: "flatten",
        blocks: (unit, { unitsOf }) => unitsOf(unit).flatMap((column) => unitsOf(column)),
        holds: (block) => (block.columns ?? []).flatMap((column) => column.blocks),
        // What a copy of a row carries where its unit is not (cut, another document): its columns, each
        // with its share of the row and its blocks described (a picture in one carries its own data, its
        // file copied with it into another document); none where a block in a column cannot be described.
        data(node, { holding }) {
          const columns = [...node.children].filter((child) => child.getAttribute("data-ge-unit-kind") === "column");
          if (columns.length < MIN_COLUMNS || columns.length > MAX_COLUMNS) return null;
          const described = columns.map((column) => {
            const blocks = holding(column);
            const ratio = Number(column.style.getPropertyValue(RATIO).trim() || NaN);
            return blocks && { ...(ratio > 0 && ratio <= 1 ? { ratio: Math.round(ratio * 1000) / 1000 } : {}), blocks };
          });
          return described.every(Boolean) ? { type: "columns", columns: described } : null;
        },
        check: (block, { valid }) => Array.isArray(block.columns) && block.columns.length >= MIN_COLUMNS && block.columns.length <= MAX_COLUMNS
          && block.columns.every((column) => column && (column.ratio === undefined || (typeof column.ratio === "number" && column.ratio > 0 && column.ratio <= 1)) && Array.isArray(column.blocks) && column.blocks.every((inner) => valid(inner, "column"))),
        build({ block, box, inner }) {
          const row = box();
          for (const each of block.columns) {
            const column = box("column");
            if (each.ratio !== undefined) column.style.setProperty(RATIO, String(each.ratio));
            column.append(...inner(each.blocks));
            row.append(column);
          }
          return row;
        },
        text: (block, lines) => block.columns.flatMap((column) => lines(column.blocks)),
      },
      written: (element, children, { unitsOf }) => children.length >= MIN_COLUMNS && children.length === unitsOf(element).length,
      // Until then, once one of its columns holds something, those that hold nothing are the
      // reader's to fill: a block not finished (kept, and said so: the column's blankSays).
      blanks: (element, { nodeOf, unitsOf }) => {
        const columns = unitsOf(element);
        const empty = columns.filter((column) => !nodeOf(column));
        return empty.length > 0 && empty.length < columns.length ? empty : [];
      },
    },
    column: {
      tag: "div", className: "doc-column", kind: "column", box: "column", clipboard: { kind: "flatten" },
      blankSays: t("新分栏里还有空着的一栏：每一栏都写上内容后才会保存。"),
      extras: (element, { sizeValue }) => {
        const ratio = sizeValue("column", RATIO, element.style.getPropertyValue(RATIO));
        return ratio ? { ratio } : {};
      },
    },
  },
};
