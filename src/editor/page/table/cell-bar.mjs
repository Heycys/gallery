import { belowControl, colorSection, colorSwatch, FORMAT_ICONS, formatLook, listItem, tool } from "../format-bar/bar.mjs";
import { HIGHLIGHTS, TEXT_COLORS } from "../marks.mjs";
import { placeBox } from "../placement.mjs";
import { hideTooltip, shortcut } from "../tooltip.mjs";
import { addStyle, appear, element, fadeIn, fadeOut, mount } from "../ui.mjs";
import { alignItems } from "./aligns.mjs";
import { TABLE_ICONS } from "./icons.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// The bar over selected cells of a table (cells.mjs), in the format bar's look (format-bar/bar.mjs:
// its card, buttons, "A" and color picker, its list): one row of the "A" (the cells' color, one of
// the kit's text colors or fills as a block's; a click opens the colors below it: 文本颜色, 背景颜色,
// the cells' own ringed), bold, the alignment (its three below it, then the three vertical ones), 合并单元格 (several cells) or
// 拆分单元格 (one merged cell), then 清除内容 and "更多" (a row or column put in beside the cells,
// the cells' rows or columns taken out). It stands above the
// cells, below them when there is no room. It shows the cells' state and reports commands;
// cells.mjs applies them.

const APPEAR = 120;
const PANEL_OUT = 90; // its panels come as every card does (ui.mjs appear) and fade out this quickly
const GAP = 8; // between the cells and the bar
// A cell's fill is a block's: its swatches and its "A" show --doc-fill, not the words' deeper fill the kit gives a span.
const STYLE = `.ge-cell-bar :is(.ge-ink-sample, .ge-swatch > span)[class*="doc-highlight-"] { background: var(--doc-fill); }`;

/**
 * run(command, value): "color" with { kind: "text" | "background", color } (null: none), "bold", "align" with an
 * alignment class (CELL_ALIGNS, CELL_VALIGNS), "clear", "insert" with "above" | "below" | "left" | "right",
 * "remove" with "rows" | "columns", "merge", "split".
 */
export function createCellBar(run) {
  formatLook();
  addStyle(STYLE);
  const sample = element("span", { class: "ge-ink-sample", text: "A" });
  const tools = {
    color: tool("color", t("颜色"), sample, () => toggle("colors")),
    bold: tool("bold", t("加粗"), FORMAT_ICONS.bold, () => run("bold"), shortcut("mod+b")),
    align: tool("align", t("对齐"), TABLE_ICONS["doc-align-left"], () => toggle("aligns")),
    merge: tool("merge", () => (state.merge === "split" ? t("拆分单元格") : t("合并单元格")), TABLE_ICONS.merge, () => run(state.merge ?? "merge")),
    clear: tool("clear", t("清除内容"), TABLE_ICONS.clear, () => run("clear"), "Del"),
    more: tool("more", t("更多"), FORMAT_ICONS.more, () => toggle("more")),
  };
  for (const name of ["color", "align", "more"]) tools[name].setAttribute("aria-expanded", "false");

  // A row of a list (the format bar's "更多" list) that closes the panels as it acts.
  const item = (label, icon, action) => listItem(null, label, icon, () => { closePanels(); action(); });
  // A row that takes something away: red under the pointer, as a menu's (format-bar/bar.mjs .ge-more-item[data-danger]).
  const danger = (node) => { node.setAttribute("data-danger", ""); return node; };
  const colors = element("div", { class: "ge-colors", role: "dialog", "aria-label": t("颜色"), hidden: "" });
  // The alignments (aligns.mjs): the three, a separator, the three vertical ones.
  const aligns = element("div", { class: "ge-more", role: "menu", "aria-label": t("对齐"), hidden: "" });
  aligns.append(...alignItems([], (name) => run("align", name)).flatMap((align, index, all) => {
    const node = item(align.label, align.icon, align.run);
    node.dataset.align = align.name;
    return index > 0 && align.vertical !== all[index - 1].vertical ? [element("div", { class: "ge-format-sep", role: "separator" }), node] : [node];
  }));
  const more = element("div", { class: "ge-more", role: "menu", "aria-label": t("更多"), hidden: "" },
    item(t("在上方插入行"), TABLE_ICONS.above, () => run("insert", "above")),
    item(t("在下方插入行"), TABLE_ICONS.below, () => run("insert", "below")),
    item(t("在左侧插入列"), TABLE_ICONS.left, () => run("insert", "left")),
    item(t("在右侧插入列"), TABLE_ICONS.right, () => run("insert", "right")),
    danger(item(t("删除所在行"), TABLE_ICONS.removeRow, () => run("remove", "rows"))),
    danger(item(t("删除所在列"), TABLE_ICONS.removeColumn, () => run("remove", "columns"))));
  const panels = { colors, aligns, more };
  const opener = { colors: tools.color, aligns: tools.align, more: tools.more };
  let openPanel = null;
  let state = { color: null, bold: false, aligns: alignItems([]), merge: null };

  const box = element("div", { class: "ge-format-box" },
    element("div", { class: "ge-format-row" }, tools.color, tools.bold, tools.align, tools.merge, tools.clear, tools.more));
  const node = element("div", { class: "ge-format ge-cell-bar", role: "toolbar", "aria-label": t("单元格"), hidden: "" }, box, colors, aligns, more);
  mount(node);

  function toggle(name) {
    const was = openPanel;
    closePanels();
    if (was !== name) openPanelNamed(name);
  }

  function openPanelNamed(name) {
    hideTooltip();
    const panel = panels[name];
    if (name === "colors") {
      // One color (默认 takes it away): the cells' own ringed, 默认文本 when they have none.
      const kind = { text: "text", highlight: "background" };
      const ringed = (family, value) => (value === null ? family === "text" && state.color === null : state.color?.kind === kind[family] && state.color.color === value);
      const marked = (family, list) => list.map((value) => {
        const swatch = colorSwatch(family, value, () => { closePanels(); run("color", value === null ? null : { kind: kind[family], color: value }); });
        swatch.setAttribute("aria-pressed", String(ringed(family, value)));
        return swatch;
      });
      colors.replaceChildren(colorSection(t("文本颜色"), marked("text", [null, ...TEXT_COLORS])), colorSection(t("背景颜色"), marked("highlight", [null, ...HIGHLIGHTS])));
    }
    if (name === "aligns") {
      for (const row of aligns.querySelectorAll("[data-align]")) row.setAttribute("aria-pressed", String(state.aligns.some((align) => align.current && align.name === row.dataset.align)));
    }
    openPanel = name;
    opener[name].setAttribute("aria-expanded", "true");
    for (const animation of panel.getAnimations?.() ?? []) animation.cancel(); // a fade out under way
    panel.hidden = false;
    belowControl(panel, opener[name]); // below its button, inside the window
    appear(panel, opener[name].getBoundingClientRect());
  }

  function closePanels(atOnce = false) {
    if (!openPanel) return false;
    const panel = panels[openPanel];
    opener[openPanel].setAttribute("aria-expanded", "false");
    openPanel = null;
    if (atOnce) panel.hidden = true;
    fadeOut(panel, PANEL_OUT);
    return true;
  }

  return {
    node,
    get visible() { return !node.hidden; },
    holds: (target) => node.contains(target),
    /** Close the colors or a list, if one is open (Esc); returns whether one was. */
    closePanels,
    /**
     * Show over `rect` (the selected cells, window coordinates), centered above them. now: the
     * cells' { color: { kind, color } | null (undefined: not the same in all), bold, aligns (aligns.mjs alignItems), merge }.
     */
    show(rect, now) {
      state = now;
      const { kind, color } = now.color ?? {};
      sample.className = ["ge-ink-sample", color && (kind === "text" ? `doc-text-${color}` : `doc-highlight-${color}`)].filter(Boolean).join(" ");
      sample.setAttribute("data-ring", kind === "background" ? color : "default");
      tools.bold.setAttribute("aria-pressed", String(now.bold));
      tools.align.innerHTML = (now.aligns.find((align) => align.current && !align.vertical) ?? now.aligns[0]).icon;
      // 合并单元格 or 拆分单元格, or none (one plain cell).
      tools.merge.hidden = !now.merge;
      tools.merge.innerHTML = TABLE_ICONS[now.merge ?? "merge"];
      tools.merge.setAttribute("aria-label", now.merge === "split" ? t("拆分单元格") : t("合并单元格"));
      if (node.hidden) fadeIn(node, APPEAR);
      const { offsetWidth: width, offsetHeight: height } = box;
      const { left, top } = placeBox(rect, { width, height }, { placement: "top", align: "center", gap: GAP, margin: 12 });
      node.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    },
    hide() {
      closePanels(true);
      node.hidden = true;
    },
  };
}
