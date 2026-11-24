import { colorLook } from "../../components/colors.mjs";
import { COLOR_DEFAULTS, COLOR_FAMILIES, KIND_ICONS, boxRole, takesBelow } from "../../components/registry.mjs";
import { COUNTS, columnsIcon } from "../../components/columns/index.mjs";
import { LINK_ICON } from "../../components/icons.mjs";
import { extentOf } from "../geometry.mjs";
import { outerOf } from "../block-info.mjs";
import { ICONS } from "../menu.mjs";
import { offeredTurn } from "../offered.mjs";
import { columnOps, menuRow, pageOfUnit, rowBeside, sectionOps } from "../page-objects.mjs";
import { MENU_COLUMNS, MENU_WIDTH, typeGrid } from "../type-grid.mjs";
import { rememberType, typeItems } from "../slash-menu/index.mjs";
import { COLOR_ICON, COLOR_WIDTH, colorItems } from "./colors.mjs";
import { alignRows } from "../align.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// The block menu (docs/editor.md, "Deleting blocks" and "New blocks and conversions"; the card is
// menu.mjs, with no search field), opened by a click on a block's handle (or
// the right button) or on a section's bar (handle/). For one block: the types it can be turned
// into as icons side by side, five to a line (小字 the corner of 文本's), at the top (type-grid.mjs; its own
// marked), or its name as the title when it turns into nothing; then its component's own rows (its page module's `menuItems`, a card's and a table's size among them),
// "在下方新建一块" (insert/, as Enter at its end would), "分区与分栏 ›" right above deleting (one row
// for both, the user's: 在下方新建分区 among chapters, 组成新分区, 解散分区 on a section and 解散所在分区
// on a block in one, components/section/page.mjs; then 分两栏, 分三栏, 分四栏, the block in the first column and empty ones beside it;
// in a column, 在右侧新增一栏; components/columns/page.mjs; last, 选中外层, the block around
// it), 复制块链接 (one block only, its address named by the click and not by the menu's
// opening), deleting it (disabled, with the reason, when something refers to it), right below which
// 选中外层 stands for a block with no such submenu. For several selected blocks, this one among
// them, what they can do together: below their number the types they can all be turned into, in the
// same grid (only when every one of them can be turned, their
// type marked only when they all share it; editor.mjs convertAll turns them, one undo step), then
// "分区与分栏 ›" (组成新分区 for neighbours in the page or a Sheet panel, 解散所在分区 for blocks all in
// one section, 分成 n 栏 for neighbours side by side, a column each) and deleting them all. A block that
// takes a color (a paragraph, a heading: components/colors.mjs) has "颜色 ›" right below its types,
// (colors.mjs); so do several selected ones that all take one. A paragraph and a heading
// have "对齐与缩进 ›" right above it (align.mjs), several selected that all take one too; a table has 对齐 › there, and
// its 宽表格 right above that (its page module's `menuLead`). It keeps clear of the block, or stands right of a section's bar.
// A component whose block has a menu of its own gives it (`menu`): a Sheet tab's is the tab's
// menu, below the tab (components/sheets/page.mjs): 重命名, 编辑图标 and 删除. A block that turns into
// nothing has its name at the head (`nameOf`), with its mark where its component has one (`iconOf`:
// an instance's package, for a block of no type of the reader's).

const COLUMNS = MENU_COLUMNS; // types on a line of the grid: 文本 and the headings, then the rest
const WIDTH = MENU_WIDTH; // the menu, as wide as its grid (no room left beside it), for every block

/**
 * info: block-info.mjs. menu: the menu card (menu.mjs createMenu). selection: selection/index.mjs.
 * remove(targets): delete blocks (selection/delete.mjs). turnInto(unit): the types the block can be
 * turned into, { current, types }, or null; convert(unit, type) turns it. turnIntoAll(units) and
 * convertAll(units, type): the same for several selected blocks (convert.mjs groupTargets: { current,
 * types }, current null for a mix). below(unit, type): a block of
 * the type below it (the editor's insertBelow). add(unit, "section"): a new section right after it.
 * The rows of 分区与分栏 are `sectionOps` and `columnOps`, of whichever page objects say them:
 * wrap(units) and unwrap(section, from), a section dissolved (from: the blocks in it it is asked from,
 * which stay selected), wrapCheck(units) and unwrapCheck(section), why they may not be, dissolvesFrom(unit),
 * the section dissolving from it takes; split(units), 分栏, columnsCheck(units), why not, columnOf(unit),
 * the column a block stands in. look(elements, change): the editor's undoable change of classes (the
 * color rows). copyLink(target): the block's address on the clipboard, in the click on its row; null
 * on a page no address leads to; linkAhead(): the menu opens with that row, what the click will want is read now.
 */
export function createBlockMenu({ info, menu, selection, remove, takenWith = (units) => units, turnInto, convert, turnIntoAll = () => null, convertAll = () => {}, below, belowTypes = () => [], add, look, copyLink = () => {}, linkAhead = () => {} }) {
  const chapters = sectionOps();
  const columns = columnOps();
  const { kindOf, nameOf, keepText, boxKindOf } = info;

  // A new section can go right after any block standing in the page or a Sheet panel.
  const chapter = (target) => Boolean(target.parentElement?.hasAttribute("data-ge-box")) && boxRole(boxKindOf(target.parentElement)) === "root";
  // Nothing goes below a Sheet tab, or a Sheet area, from its menu (`below: false` in their descriptions).
  const addable = (target) => takesBelow(kindOf(target));

  // "颜色 ›" for blocks that all take a color: the families they all take (a text block's text and
  // background, a highlight block's or a code block's background: registry.mjs COLOR_FAMILIES), one
  // undo step for them all; a family's color they all show with none of it (a callout's blue:
  // COLOR_DEFAULTS) stands for none.
  const familiesOf = (target) => COLOR_FAMILIES[kindOf(target)] ?? [];
  const colorable = (target) => familiesOf(target).length > 0;
  const defaultOf = (target, family) => COLOR_DEFAULTS[kindOf(target)]?.[family] ?? null;
  const colorRow = (units) => {
    const families = units.length > 0 ? familiesOf(units[0]).filter((family) => units.every((unit) => familiesOf(unit).includes(family))) : [];
    const defaults = Object.fromEntries(families.map((family) => [family, defaultOf(units[0], family)]).filter(([family, color]) => color && units.every((unit) => defaultOf(unit, family) === color)));
    return families.length > 0
      ? [{ label: t("颜色"), icon: COLOR_ICON, width: COLOR_WIDTH, submenu: () => colorItems(units, (targets, color) => look(targets, colorLook(color)), () => menu.close(), { families, defaults }) }]
      : [];
  };

  // The columns rows for blocks: none where they do not apply, disabled with the reason where they
  // cannot be done. One block: 分两栏, 分三栏, 分四栏 (in a column: 在右侧新增一栏); several: a column each.
  const splitRows = (units) => {
    const reason = columns?.columnsCheck(units) ?? null;
    if (reason === null) return [];
    const state = { disabled: Boolean(reason), note: reason || undefined };
    if (units.length > 1) return [{ label: COUNTS[units.length] ? t("分成{0}栏", COUNTS[units.length]) : t("并排分栏"), icon: columnsIcon(Math.min(units.length, 5)), ...state, run: () => columns.split(units) }];
    if (columns.columnOf(units[0])) return [{ label: t("在右侧新增一栏"), icon: ICONS.plus, ...state, run: () => columns.split(units) }];
    return [2, 3, 4].map((count) => ({ label: t("分{0}栏", COUNTS[count]), icon: columnsIcon(count), ...state, run: () => columns.split(units, count) }));
  };

  // 解散分区 on a section; on blocks all in one section, 解散所在分区, which is that section's own row
  // said from inside it: its check, its undo step, its words, the blocks staying selected and the page
  // where it is. What it holds comes out as it stands, so a block in a column keeps its column, the row
  // of columns coming out whole, and one in a section in a Sheet panel ends in the panel. None for a
  // block that has no 分区与分栏 › of its own (no columns row, in a section: a list item, a flowchart's
  // node, a quote's later paragraph, a block an item holds): asked of the block alone (a folded heading
  // whose section a column cannot take keeps it).
  const dissolveRow = (units) => {
    const section = chapters?.dissolvesFrom(units[0]);
    if (!section || units.some((unit) => chapters.dissolvesFrom(unit) !== section)) return [];
    const own = units[0] === section;
    if (!own && units.some((unit) => (columns?.columnsCheck([unit], (alone) => [alone]) ?? null) === null)) return [];
    const reason = chapters.unwrapCheck(section);
    return [{ label: own ? t("解散分区") : t("解散所在分区"), icon: ICONS.dissolve, disabled: Boolean(reason), note: reason || undefined, run: () => chapters.unwrap(section, own ? null : units) }];
  };

  // 分区与分栏 ›: its groups of rows (the sections', the columns', the block around it), a line
  // between them, in one submenu as wide as its rows (menu.mjs FIT: its English row's words whole); no row when none has any.
  const groupRow = (...groups) => {
    const rows = groups.filter((group) => group.length > 0).flatMap((group, at) => (at > 0 ? [{ separator: true }, ...group] : group));
    return rows.length > 0 ? [{ label: t("分区与分栏"), icon: KIND_ICONS.columns, submenu: () => rows }] : [];
  };

  // 选中外层, for a block with a block around it (outerOf: the row of columns, from a column).
  const outerRow = (target) => {
    const outer = outerOf(target);
    return outer?.closest("main") ? [{ label: t("选中外层"), icon: ICONS.outer, run: () => selection.select(outer) }] : [];
  };

  /**
   * The menu of `target`, by `rect` (the handle), or `side` of it ("right": a section's bar); a
   * tab's below it. onClose: when the menu closes.
   */
  function open(target, rect, side = null, { onClose } = {}) {
    const special = pageOfUnit(target)?.menu?.(target, { rect, reason: keepText(target), remove: () => remove(target) });
    if (special) {
      menu.open(special.items, rect, { label: special.label, width: special.width, onClose });
      return;
    }
    const picked = selection.picked;
    // Several blocks selected, this one among them: what they can do together.
    if (picked.length > 1 && picked.includes(target)) {
      const group = [...picked];
      const refused = group.map((node) => [node, keepText(node, group)]).find(([, reason]) => reason);
      const note = refused ? t("其中的{0}不能删除：{1}", nameOf(refused[0]), refused[1]) : undefined;
      const items = [{ title: t("已选中 {0} 块", group.length) }];
      // The types they can all be turned into (offered when
      // every one of them can be turned, their type marked only when they share it), as the grid of
      // one block's menu; a pick turns them all, one undo step, what they are now selected.
      const turn = offeredTurn(turnIntoAll(group));
      if (turn && turn.types.some((type) => type !== turn.current)) {
        const grid = typeGrid(turn.types, turn.current, (type) => {
          menu.close();
          if (type !== turn.current) convertAll(group, type);
        }, { columns: COLUMNS });
        items.push({ node: grid, cells: [...grid.querySelectorAll(".ge-type")], columns: COLUMNS }, { separator: true });
      }
      const colors = [...alignRows(group, { kindOf, look }), ...colorRow(group)];
      items.push(...colors, ...(colors.length > 0 ? [{ separator: true }] : []));
      // Blocks next to each other in the page or a Sheet panel become a section; a selection with gaps does not.
      // A folded heading among them goes in with what it hides (fold/).
      const wrap = chapters?.wrapCheck(takenWith(group)) ?? null;
      const sections = [...(wrap !== null ? [{ label: t("组成新分区"), icon: ICONS.group, disabled: Boolean(wrap), note: wrap || undefined, run: () => chapters.wrap(takenWith(group)) }] : []), ...dissolveRow(group)];
      // Neighbours in one container go side by side, a column each.
      items.push(...groupRow(sections, splitRows(group)));
      items.push({ label: t("删除"), icon: ICONS.trash, hint: "Del", danger: true, disabled: Boolean(refused), note, run: () => remove(group) });
      const label = t("{0} 块的操作", group.length);
      menu.open(items, rect, side ? { label, highlight: false, width: WIDTH, side } : { label, highlight: false, width: WIDTH, around: extentOf(target) });
      return;
    }
    const turn = offeredTurn(turnInto(target));
    const items = turn && turn.types.length > 1 ? [] : [{ title: nameOf(target), icon: pageOfUnit(target)?.iconOf?.(target) }];
    if (turn && turn.types.length > 1) {
      const grid = typeGrid(turn.types, turn.current, (type) => {
        menu.close();
        if (type !== turn.current) convert(target, type);
      }, { columns: COLUMNS });
      items.push({ node: grid, cells: [...grid.querySelectorAll(".ge-type")], columns: COLUMNS }, { separator: true });
    }
    // A highlight block's icon (添加图标 / 更换图标: components/icon/page.mjs rowBeside) beside its color; a
    // component's row heading these (its page module's `menuLead`: a table's 宽表格), right above 对齐.
    const icon = rowBeside(target);
    const lead = pageOfUnit(target)?.menuLead?.(target) ?? [];
    const aligned = alignRows([target], { kindOf, look });
    if (lead.length > 0 || aligned.length > 0 || colorable(target) || icon) items.push(...lead, ...aligned, ...(colorable(target) ? colorRow([target]) : []), ...(icon ? [icon] : []), { separator: true });
    // A component's own rows (an image's: components/image/page.mjs; a table's, with its size's
    // 铺满正文宽度…; a card's, a code block's, a Sheet area's), one group, from its page module.
    const own = pageOfUnit(target)?.menuItems?.(target) ?? [];
    if (own.length > 0) items.push(...own, { separator: true });
    // 在下方新建: resting on it opens the "/" menu's blocks (slash-menu/ typeItems, in a
    // card as wide as this menu, a search field at its top that finds them as "/" does), one of which
    // goes below the block (editor.mjs insertBelow); where the block's box takes none, the row makes
    // a paragraph there.
    if (addable(target)) {
      const types = belowTypes(target);
      const choose = (type) => {
        menu.close();
        if (!menuRow(type)) return; // a package's row, its package gone while the menu stood
        selection.clear();
        rememberType(type);
        below(target, type);
      };
      items.push(types.length > 0
        ? { label: t("在下方新建"), icon: ICONS.plus, width: WIDTH, submenu: () => typeItems(types, choose), search: { placeholder: t("搜索块…"), filter: (text) => typeItems(types, choose, text.trim()), empty: t("没有结果") } }
        : { label: t("在下方新建"), icon: ICONS.plus, run: () => { selection.clear(); below(target, "paragraph"); } });
    }
    const sections = [];
    if (chapter(target)) sections.push({ label: t("在下方新建分区"), icon: ICONS.section, run: () => add(target, "section") });
    if (chapters?.wrapCheck(takenWith([target])) === "") sections.push({ label: t("组成新分区"), icon: ICONS.group, run: () => chapters.wrap(takenWith([target])) });
    sections.push(...dissolveRow([target]));
    const splits = splitRows([target]);
    // 选中外层 joins 分区与分栏 › where the block has that submenu; a block with none gets none for it.
    const outer = outerRow(target);
    const grouped = sections.length > 0 || splits.length > 0;
    items.push(...groupRow(sections, splits, grouped ? outer : []));
    if (copyLink) {
      linkAhead();
      items.push({ label: t("复制块链接"), icon: LINK_ICON, run: () => copyLink(target) });
    }
    const reason = keepText(target);
    items.push({ label: t("删除"), icon: ICONS.trash, hint: "Del", danger: true, disabled: Boolean(reason), note: reason ?? undefined, run: () => remove(target) });
    if (!grouped) items.push(...outer);
    const label = t("{0}的操作", nameOf(target));
    menu.open(items, rect, side ? { label, highlight: false, width: WIDTH, side } : { label, highlight: false, width: WIDTH, around: extentOf(target) });
  }

  return { open };
}
