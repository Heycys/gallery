import { Z } from "../../../shared/layers.mjs";
import { CODE_ICON, FORMULA_ICON, NOTE_ICON } from "../../components/icons.mjs";
import { FROM_SELECTION, TYPE_INFO } from "../../components/registry.mjs";
import { HIGHLIGHTS, TEXT_COLORS, UNDERLINE_COLORS } from "../marks.mjs";
import { besideText } from "../placement.mjs";
import { hideTooltip, shortcut, tooltip } from "../tooltip.mjs";
import { describeEffects } from "./brush.mjs";
import { RINGS, colorName, recentColors } from "./colors.mjs";
import { typeGrid } from "../type-grid.mjs";
import { addStyle, appear, button, element, fadeIn, fadeOut, mount } from "../ui.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// The bar over selected text: a small
// card below and right of the selection with two rows of four buttons on top (the format brush,
// 应用格式, the clear-format T with a check; the color "A", bold, underline; clearing the format, inline code, a formula, and "更多" with a
// link, strikethrough, italic, a detail card the selected text opens and, where the selection can be
// annotated, 批注: annotate/) and, below a line, the block's type with what it can be turned into (the
// blocks' type across blocks, "多个类型" for a mix). Each button names itself in a tooltip, with its
// shortcut, nothing more; the brush's says what it remembers (brush.mjs), and a click puts that on
// the selected text. The "A" shows the selection's text color and background; a click opens the
// colors below it (最近使用, 文本颜色, 背景颜色, five swatches to a line, the
// selection's own colors ringed). The underline button's line shows the selection's underline, its
// color and weight (the icon's own line when there is none); a click opens the line below it: no
// line or its colors on one line, its weights on the next. A second click closes either; so do
// Esc and a press elsewhere. "更多" opens its list below it, resting on it or with a click. Resting
// on the type row opens what the block can be turned into beside the bar. The bar shows the
// selection's state and reports commands; the editor applies them (index.mjs). Swatches use the
// kit's own classes, so they match the text in either theme (a background's, a span, shows the
// words' fill; the cell bar draws its own as a block's: table/cell-bar.mjs). The icons are drawn here
// (20px, thin lines). The bar fades in (no fade out); its panels fade in and out quickly and keep
// inside the window.

const TURN_DELAY = 100; // resting on the type row this long opens what the block can be turned into
const MORE_DELAY = 150; // resting on "更多" this long opens its list
const LINE_COLORS = { none: t("无"), default: t("红色（默认）"), orange: t("橙色"), blue: t("蓝色"), purple: t("紫色"), plain: t("文字色") };
const LINE_WEIGHTS = { thin: [t("细"), 1], default: [t("中（默认）"), 2], thick: [t("粗"), 3] }; // name, px, in the panel's order
// The underline button's line, by the selection's underline weight (in the icon's units).
const LINE_STROKE = { thin: 1.25, default: 2, thick: 2.75 };
const LEAVE = 300; // a panel opened by resting closes this long after the pointer leaves it and what opened it
const APPEAR = 120; // the bar fades in this quickly; it goes at once
// Its panels come as every card does, out of their corner nearest what opened them, and fade out (ui.mjs appear, fadeOut: 90ms).
const PANEL_OUT = 90;
const svg = (body) => `<svg viewBox="0 0 20 20" aria-hidden="true">${body}</svg>`;
const ICONS = {
  // Drawn here, 20 units with thin lines. 应用格式 is the clear-format T with a check where that
  // one has its cross.
  brush: svg('<path d="M3.5 4.5h9M8 4.5v11M6.75 15.5h2.5"/><path d="m12.1 12.6 2.05 2.05 3.6-4.6"/>'),
  bold: svg('<path class="ge-heavy" d="M6.25 4.25h4.85a2.9 2.9 0 0 1 0 5.8H6.25zM6.25 10.05h5.6a3 3 0 0 1 0 6H6.25z"/>'),
  italic: svg('<path d="M8.5 4.75h5M6.5 15.25h5M11.25 4.75l-2.5 10.5"/>'), // the owner's pick of 2026-11-17 (a slanted stem between two short bars)
  underline: svg('<path d="M6 3.75v6.25a4 4 0 0 0 8 0V3.75M4.75 3.75h2.5M12.75 3.75h2.5"/><path class="ge-line-mark" d="M3.75 16.75h12.5"/>'),
  clear: svg('<path d="M3.5 4.5h9M8 4.5v11M6.75 15.5h2.5"/><path d="m12.5 10.25 4.75 4.75M17.25 10.25 12.5 15"/>'),
  link: svg('<g transform="rotate(45 10 10)"><path d="M7 8.5V6a3 3 0 0 1 6 0v2.5M7 11.5V14a3 3 0 0 0 6 0v-2.5M10 7.5v5"/></g>'),
  code: CODE_ICON,
  formula: FORMULA_ICON,
  strike: svg('<path d="M13.4 6.6c-.5-1.2-1.7-1.9-3.3-1.9-1.9 0-3.3 1-3.3 2.5 0 1.3.9 2 2.4 2.5M6.5 13.2c.5 1.3 1.8 2.1 3.6 2.1 2 0 3.4-1 3.4-2.6 0-.7-.3-1.3-.8-1.7M3.75 10h12.5"/>'), // the owner's pick of 2026-11-17 (an S with a line across its middle)
  more: svg('<circle cx="4.75" cy="10" r="1.3" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.25" cy="10" r="1.3" fill="currentColor" stroke="none"/>'),
  chevron: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6.25 4 4 4-4 4"/></svg>',
  none: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 12.5 12.5 3.5"/></svg>',
};

const STYLE = `
  .ge-format {
    position: fixed; left: 0; top: 0; z-index: ${Z.panel}; color: var(--ge-tx); font: 14px/1.2 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; user-select: none;
  }
  /* With one of its menus open (the colors, the line, 更多, the types beside it) the bar stands on the menus' layer: over a notice, as every other menu does. */
  .ge-format:has(> :is(.ge-colors, .ge-more, .ge-format-sub):not([hidden])) { z-index: ${Z.menu}; }
  .ge-format[hidden], .ge-format-sub[hidden], .ge-format-turn[hidden], .ge-format-sep[hidden], .ge-tool[hidden], .ge-more-item[hidden] { display: none; }
  /* The bar sits on the text (look.mjs: a bar, its lighter shadow, 6px round its tools); its panels are cards (a menu's look). */
  .ge-format-box, .ge-format-sub { border-radius: var(--ge-r-card); background: var(--ge-bg); }
  .ge-format-box { display: flex; flex-direction: column; padding: 6px; overflow: hidden; box-shadow: var(--ge-shadow-bar); }
  .ge-format-sub { box-shadow: var(--ge-shadow-card); }
  .ge-format-row { display: flex; gap: 4px; height: 28px; } /* its buttons 4px apart, as its rows are */
  .ge-format-row + .ge-format-row { margin-top: 4px; }
  .ge-tool { display: flex; align-items: center; justify-content: center; flex: none; width: 32px; height: 28px; padding: 6px; border: 0; border-radius: var(--ge-r-ctl); background: transparent; color: var(--ge-ico); cursor: pointer; }
  .ge-tool:hover:not(:disabled), .ge-tool[aria-expanded="true"] { background: var(--ge-hover); }
  .ge-tool:active:not(:disabled) { background: var(--ge-press); }
  /* A format the selection has: its glyph in the accent, no tint behind it. */
  .ge-tool[aria-pressed="true"] { color: var(--ge-accent); }
  .ge-tool:disabled { opacity: .4; cursor: default; }
  /* Every glyph of the bar and of its panels one weight (the owner's 2026-11-17: one card, one size and weight): its icons 20px, its › 16px, every line 1.25px; bold's B alone drawn heavier, as what it stands for. */
  .ge-tool svg, .ge-format-turn svg { display: block; width: 20px; height: 20px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.25; stroke-linecap: round; stroke-linejoin: round; }
  .ge-tool svg .ge-heavy { stroke-width: 1.7; }
  .ge-ink-sample { display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 6px; box-shadow: inset 0 0 0 1px var(--ge-ring, var(--ge-edge)); font-size: 12px; font-weight: 500; line-height: 1; }
  .ge-format-sep { height: 1px; margin: 4px 6px; background: var(--ge-line); }
  .ge-format-turn { display: flex; align-items: center; gap: 8px; height: 28px; padding: 0 8px 0 6px; border: 0; border-radius: var(--ge-r-ctl); background: transparent; color: var(--ge-tx); font: inherit; text-align: left; cursor: pointer; }
  .ge-format-turn:hover, .ge-format-turn[aria-expanded="true"] { background: var(--ge-hover); }
  .ge-format-turn:active { background: var(--ge-press); }
  .ge-format-turn > .ge-format-icon { display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; color: var(--ge-ico); }
  .ge-format-turn > span:nth-child(2) { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ge-format-turn > svg:last-child { width: 16px; height: 16px; color: var(--ge-ico2); }
  /* A panel beside the bar: the types a block can be turned into. */
  .ge-format-sub { position: absolute; top: 0; left: calc(100% + 4px); padding: var(--ge-card-pad); }
  .ge-format-sub[data-side="left"] { left: auto; right: calc(100% + 4px); }
  .ge-format-sub .ge-types { --ge-types-columns: 5; padding: 0; }
  /* The colors, below the "A". */
  .ge-colors { position: absolute; z-index: 1; width: 190px; overflow: hidden; border-radius: var(--ge-r-card); background: var(--ge-bg); box-shadow: var(--ge-shadow-card); }
  .ge-colors[hidden] { display: none; }
  .ge-colors-section { padding: 4px; }
  .ge-colors-title { margin: 6px 0 8px; padding: 0 8px; overflow: hidden; color: var(--ge-tx2); font-size: 12px; font-weight: 500; line-height: 1.2; white-space: nowrap; text-overflow: ellipsis; }
  .ge-colors-grid { display: grid; grid-template-columns: repeat(5, 30px); gap: 4px; padding: 0 8px; }
  .ge-colors-section:last-child .ge-colors-grid { padding-bottom: 8px; }
  .ge-swatch { display: block; width: 30px; height: 30px; padding: 2px; border: 0; border-radius: var(--ge-r-ctl); background: transparent; color: inherit; font: inherit; cursor: pointer; }
  .ge-swatch > span { display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 6px; font-size: 16px; font-weight: 500; line-height: 1; box-shadow: inset 0 0 0 1px var(--ge-ring); }
  .ge-swatch:hover > span { box-shadow: inset 0 0 0 2px var(--ge-ring); }
  .ge-swatch[aria-pressed="true"] > span { box-shadow: inset 0 0 0 2px var(--ge-ring-strong); }
  /* The underline's line: its colors, then its weights, below its button. */
  .ge-line { width: auto; }
  .ge-line .ge-colors-grid { grid-template-columns: repeat(6, 30px); }
  .ge-line .ge-colors-section:last-child .ge-colors-grid { grid-template-columns: repeat(3, 30px); }
  /* The list of "更多", below it. */
  .ge-more { position: absolute; z-index: 1; box-sizing: border-box; min-width: 180px; padding: var(--ge-card-pad); border-radius: var(--ge-r-card); background: var(--ge-bg); box-shadow: var(--ge-shadow-card); }
  .ge-more[hidden] { display: none; }
  /* Its rows a menu's (menu.mjs .ge-pop-row): flush, 9px round, the row gray under the pointer. */
  .ge-more-item { display: flex; align-items: center; gap: 8px; width: 100%; height: 28px; padding: 0 9px 0 7px; border: 0; border-radius: var(--ge-r-row); background: transparent; color: var(--ge-tx); font: inherit; text-align: left; white-space: nowrap; cursor: pointer; }
  .ge-more-item:hover:not(:disabled) { background: var(--ge-hover-row); }
  .ge-more-item:active:not(:disabled) { background: var(--ge-press); }
  /* A row that takes something away (a table's 删除所在行): a menu's danger row, pale red behind red words under the pointer. */
  .ge-more-item[data-danger]:hover:not(:disabled) { background: var(--ge-danger-tint); }
  .ge-more-item[data-danger]:hover:not(:disabled), .ge-more-item[data-danger]:hover:not(:disabled) :is(svg, small) { color: var(--ge-btn-danger-text); }
  .ge-more-item[data-danger]:active:not(:disabled) { background: var(--ge-btn-danger); }
  .ge-more-item:disabled { opacity: .4; cursor: default; }
  .ge-more-item svg { display: block; width: 20px; height: 20px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.25; stroke-linecap: round; stroke-linejoin: round; color: var(--ge-ico); }
  .ge-more-item[aria-pressed="true"] svg { color: var(--ge-accent); }
  .ge-more-item > span { flex: 1; }
  .ge-more-item > small { margin-left: 16px; color: var(--ge-tx3); font-size: 12px; } /* a shortcut, the menu card's hint gray */
  /* No weight of their own: the kit's color classes on the same sample win. */
  :where(.ge-swatch > .ge-line-color) { color: inherit; text-decoration: underline 1.5px var(--doc-code-inline, #cf5148); text-underline-offset: 3px; }
  .ge-swatch > .ge-line-weight > i { display: block; width: 16px; border-radius: 1px; background: var(--ge-ico); }
  /* The underline button's line: the selection's underline color (--ge-line-ink, set from the kit's
     own), the icon's own color when it has none. */
  .ge-tool .ge-line-mark { stroke: var(--ge-line-ink, currentColor); }
  .ge-swatch > .ge-line-none { text-decoration: none; }
  /* Its line shows the selection's underline; it never turns blue for it. */
  .ge-tool[data-tool="underline"][aria-pressed="true"] { color: var(--ge-ico); }
  ${Object.entries(RINGS).map(([name, [light, dark, strong, strongDark]]) => `.ge-format [data-ring="${name}"] { --ge-ring: light-dark(${light}, ${dark}); --ge-ring-strong: light-dark(${strong}, ${strongDark}); }`).join("\n  ")}
`;

/** The bar's look (its card, buttons, "A", colors and list), which a table's cell bar shares (table/cells.mjs). */
export function formatLook() {
  addStyle(STYLE);
}

/** The bar's icons another bar of its look uses. */
export const FORMAT_ICONS = { bold: ICONS.bold, clear: ICONS.clear, more: ICONS.more, chevron: ICONS.chevron };

/**
 * A swatch of the colors: `family` "text" or "highlight", `value` a color
 * name or null (the default); a click runs pick(family, value).
 */
export function colorSwatch(family, value, pick) {
  const name = colorName(family, value);
  const node = button(null, () => pick(family, value), { class: "ge-swatch", "aria-label": name, "data-family": family, "data-value": value ?? "", "data-ring": value ?? "default" });
  node.append(element("span", { class: value ? `doc-${family}-${value}` : "", text: family === "text" ? "A" : "" }));
  tooltip(node, name);
  return node;
}

/** A section of the colors: its title over its swatches, five to a line. */
export const colorSection = (title, swatches) => element("div", { class: "ge-colors-section" },
  element("div", { class: "ge-colors-title", text: title }), element("div", { class: "ge-colors-grid" }, ...swatches));

/** A button of a bar's row: its name in a tooltip (`label` may be a function), its shortcut below it (the cells' bar uses it too). */
export function tool(name, label, content, action, keys = null) {
  const node = button(null, action, { class: "ge-tool", "data-tool": name, "aria-label": typeof label === "function" ? "" : label });
  if (typeof content === "string") node.innerHTML = content;
  else node.append(content);
  tooltip(node, label, keys);
  return node;
}

/** A row of a list ("更多"): an icon, its name and its shortcut (the cells' bar uses it too); `name` is the tool it stands for, if any. */
export function listItem(name, label, icon, action, keys = null) {
  const node = button(null, action, { class: "ge-more-item", role: "menuitem", ...(name ? { "data-tool": name } : {}), "aria-label": label });
  node.innerHTML = icon;
  node.append(element("span", { text: label }), ...(keys ? [element("small", { text: keys })] : []));
  return node;
}

/**
 * `run(command, value)`: "bold", "italic", "strike", "code", "clear", "link", "formula" or a type
 * that says `fromSelection`; "brush" (the format brush); "text" / "highlight" with a color name (null removes it);
 * "underline" with false (no underline); "underlineColor" / "underlineWeight" with a value of that
 * facet; "turn" with the type the block is turned into; "annotate" (批注).
 */
/**
 * A panel of a bar standing below one of the bar's controls (`left`: its left edge in the bar, the
 * control's by default), kept inside the window: moved left when it would leave it on the right, put
 * above the control when there is no room below. The format bar's panels and the cell bar's.
 */
export function belowControl(panel, control, left = control.offsetLeft) {
  panel.style.left = `${left}px`;
  panel.style.top = `${control.offsetTop + control.offsetHeight + 4}px`;
  const rect = panel.getBoundingClientRect();
  if (rect.right > innerWidth - 8) panel.style.left = `${left - (rect.right - innerWidth + 8)}px`;
  if (rect.bottom > innerHeight - 8) panel.style.top = `${control.offsetTop - 4 - panel.offsetHeight}px`;
}

export function createFormatBar(run) {
  formatLook();

  const sample = element("span", { class: "ge-ink-sample", text: "A" });

  const tools = {
    brush: tool("brush", t("应用格式"), ICONS.brush, () => run("brush"), () => `${describeEffects() || t("先给文字设置格式，这里会记住")}\n${shortcut("mod+shift+h")}`),
    color: tool("color", t("文字颜色"), sample, () => (current === "color" ? closeSub() : openColors())),
    bold: tool("bold", t("加粗"), ICONS.bold, () => run("bold"), shortcut("mod+b")),
    underline: tool("underline", t("下划线"), ICONS.underline, () => (current === "line" ? closeSub() : openLine()), shortcut("mod+u")),
    clear: tool("clear", t("清除格式"), ICONS.clear, () => run("clear"), shortcut("mod+alt+\\")),
    code: tool("code", t("代码"), ICONS.code, () => run("code"), shortcut("mod+e")),
    formula: tool("formula", t("公式"), ICONS.formula, () => run("formula"), shortcut("mod+shift+e")),
    more: tool("more", t("更多"), ICONS.more, () => {
      clearTimeout(timer);
      if (current !== "more") openMore(); // resting on it may have opened it already: a click never closes it
    }),
  };
  for (const name of ["more", "color", "underline"]) tools[name].setAttribute("aria-expanded", "false");
  const turnIcon = element("span", { class: "ge-format-icon" });
  const turnLabel = element("span");
  const turn = element("button", { type: "button", class: "ge-format-turn", "aria-label": t("转换为"), "aria-expanded": "false" }, turnIcon, turnLabel);
  turn.insertAdjacentHTML("beforeend", ICONS.chevron);
  turn.addEventListener("mousedown", (event) => event.preventDefault()); // keep the selection
  turn.addEventListener("click", () => {
    clearTimeout(timer);
    if (current !== "turn") openTurn(); // resting on it may have opened it already: a click never closes it
  });
  const separator = element("div", { class: "ge-format-sep", role: "separator" });

  // ---------- the colors ----------

  const colors = element("div", { class: "ge-colors", role: "dialog", "aria-label": t("文本颜色"), hidden: "" });
  const line = element("div", { class: "ge-colors ge-line", role: "dialog", "aria-label": t("下划线"), hidden: "" });
  let selected = { text: null, highlight: null }; // the selection's colors, ringed in the panel

  const swatch = (family, value) => colorSwatch(family, value, run);
  const section = colorSection;

  function markColors() {
    for (const node of colors.querySelectorAll(".ge-swatch[data-mark]")) {
      node.setAttribute("aria-pressed", String((selected[node.dataset.family] ?? "") === node.dataset.value));
    }
  }

  // ---------- "更多" ----------

  const items = {
    link: listItem("link", t("链接"), ICONS.link, () => run("link"), shortcut("mod+k")),
    strike: listItem("strike", t("删除线"), ICONS.strike, () => run("strike"), shortcut("mod+shift+x")),
    italic: listItem("italic", t("斜体"), ICONS.italic, () => run("italic"), shortcut("mod+i")),
    annotate: listItem("annotate", t("批注"), NOTE_ICON, () => run("annotate"), shortcut("mod+alt+m")),
  };
  const blocksFrom = FROM_SELECTION.map(({ type, label, icon }) => listItem(type, label, icon, () => run(type))); // the blocks selected text makes
  const more = element("div", { class: "ge-more", role: "menu", "aria-label": t("更多"), hidden: "" }, items.link, items.strike, items.italic, ...blocksFrom, items.annotate);

  const sub = element("div", { class: "ge-format-sub", hidden: "" });
  const box = element("div", { class: "ge-format-box" },
    element("div", { class: "ge-format-row" }, tools.brush, tools.color, tools.bold, tools.underline),
    element("div", { class: "ge-format-row" }, tools.clear, tools.code, tools.formula, tools.more),
    separator, turn);
  const node = element("div", { class: "ge-format", role: "toolbar", "aria-label": t("文字格式"), hidden: "" }, box, sub, colors, line, more);
  mount(node);

  let block = null; // { current, types } of the block the selection is in, or null
  // The panel open, one at a time: the colors below the "A", the underline's line below its button, the
  // list of "更多" below it, what the block can be turned into beside the bar (PANELS).
  let current = null;
  let lineState = { color: null, weight: null }; // the selection's underline facets
  const inks = new Map(); // a line color's own (the kit's), read once
  let timer = 0; // a panel about to open or close

  // The "A" and the underline button show the selection's colors and underline; the panels ring them.
  function paint(state) {
    const { text, highlight } = state;
    sample.className = ["ge-ink-sample", text && `doc-text-${text}`, highlight && `doc-highlight-${highlight}`].filter(Boolean).join(" ");
    sample.setAttribute("data-ring", highlight ?? "default");
    selected = { text, highlight };
    markColors();
    lineState = state.underline ? { color: state.underlineColor ?? null, weight: state.underlineWeight ?? null } : { color: "none", weight: null };
    markLine();
    // The underline button's line: the selection's underline (a mix of them as the default), else the icon's own.
    const mark = tools.underline.querySelector(".ge-line-mark");
    if (state.underline) {
      mark.style.strokeWidth = String(LINE_STROKE[state.underlineWeight ?? "default"]);
      tools.underline.style.setProperty("--ge-line-ink", ink(state.underlineColor ?? "default"));
    } else {
      mark.style.strokeWidth = "";
      tools.underline.style.removeProperty("--ge-line-ink");
    }
  }

  // A line color as the kit draws it: read from an underline of that color, once.
  function ink(color) {
    if (!inks.has(color)) {
      const probe = mount(element("u", { class: color === "default" ? "" : `doc-underline-${color}`, style: "position: fixed; visibility: hidden" }, "x"));
      inks.set(color, getComputedStyle(probe).textDecorationColor);
      probe.remove();
    }
    return inks.get(color);
  }

  // ---------- the panels: the colors, the line, the list of "更多", the types beside the type row ----------

  // Opens panel `name` (PANELS): the one open goes, `fill` makes what it holds, `place` puts it by its trigger.
  function openPanel(name, fill, place) {
    closeSub();
    hideTooltip();
    current = name;
    const { node: panel, trigger } = PANELS[name];
    fill?.();
    for (const animation of panel.getAnimations?.() ?? []) animation.cancel(); // a fade out under way
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    place();
    appear(panel, trigger.getBoundingClientRect());
  }

  // Resting on what opens a panel opens it; leaving both closes it a little later ("更多", the type row).
  function hover(name, delay) {
    const { node: panel, trigger: control, open } = PANELS[name];
    control.addEventListener("pointerenter", () => {
      clearTimeout(timer);
      if (current !== name) timer = setTimeout(open, delay);
    });
    const leave = () => {
      clearTimeout(timer);
      if (current === name) timer = setTimeout(closeSub, LEAVE);
    };
    control.addEventListener("pointerleave", leave);
    panel.addEventListener("pointerenter", () => clearTimeout(timer));
    panel.addEventListener("pointerleave", leave);
  }

  // Below the "A", its left edge with the "A"'s (above it when there is no room below).
  function openColors() {
    openPanel("color", () => {
      const marked = (list) => list.map((node) => (node.setAttribute("data-mark", ""), node));
      colors.replaceChildren(
        section(t("最近使用"), recentColors().map(({ family, value }) => swatch(family, value))),
        section(t("文本颜色"), marked([null, ...TEXT_COLORS].map((value) => swatch("text", value)))),
        section(t("背景颜色"), marked([null, ...HIGHLIGHTS].map((value) => swatch("highlight", value)))),
      );
      markColors();
    }, () => belowControl(colors, tools.color));
  }

  // Below the underline button: no line or the line's colors, then its weights (the selection's
  // ringed; the weights drawn plain, in no color). A color or weight picked underlines the text so,
  // keeping the other facet as the text has it (red and 2px where it had no underline).
  function openLine() {
    const cell = (family, value, name, sample) => {
      const node = button(null, () => (value === "none" ? run("underline", false) : run(family, value)), { class: "ge-swatch", "aria-label": value === "none" ? name : t("下划线{0}", name), "data-family": family, "data-value": value, "data-ring": family !== "underlineColor" || value === "plain" || value === "none" ? "default" : value === "default" ? "red" : value });
      node.append(sample);
      tooltip(node, name);
      return node;
    };
    const colorRow = ["none", "default", ...UNDERLINE_COLORS].map((value) => cell("underlineColor", value, value === "none" ? t("无下划线") : LINE_COLORS[value],
      element("span", { class: ["ge-line-color", value === "none" && "ge-line-none", !["none", "default"].includes(value) && `doc-underline-${value}`].filter(Boolean).join(" "), text: "U" })));
    const weights = Object.keys(LINE_WEIGHTS).map((value) => {
      const [name, px] = LINE_WEIGHTS[value];
      return cell("underlineWeight", value, name, element("span", { class: "ge-line-weight" }, element("i", { style: `height: ${px}px` })));
    });
    openPanel("line", () => {
      line.replaceChildren(section(t("线的颜色"), colorRow), section(t("线的粗细"), weights));
      markLine();
    }, () => belowControl(line, tools.underline, Math.max(0, tools.underline.offsetLeft - 8)));
  }
  function markLine() {
    const facet = { underlineColor: "color", underlineWeight: "weight" };
    for (const node of line.querySelectorAll(".ge-swatch")) {
      node.setAttribute("aria-pressed", String(lineState[facet[node.dataset.family]] === node.dataset.value));
    }
  }

  // Beside the bar, level with the type row; left of the bar when there is no room right of it,
  // lifted when it would leave the window.
  function openTurn() {
    if (!block) return;
    openPanel("turn", () => sub.replaceChildren(typeGrid(block.types, block.current, (type) => {
      closeSub();
      if (type !== block.current) run("turn", type);
    }, { columns: 5 })), () => {
      sub.removeAttribute("data-side");
      sub.style.top = `${turn.offsetTop - 4}px`;
      const rect = sub.getBoundingClientRect();
      if (rect.right > innerWidth - 12) sub.setAttribute("data-side", "left");
      if (rect.bottom > innerHeight - 12) sub.style.top = `${turn.offsetTop - 4 - (rect.bottom - innerHeight + 12)}px`;
    });
  }

  // Below "更多": a link, strikethrough, italic, a detail card and 批注.
  function openMore() {
    openPanel("more", null, () => belowControl(more, tools.more));
  }

  // Each panel with what opens it and what it opens; the lists made again as they open are emptied as they go.
  const PANELS = {
    color: { node: colors, trigger: tools.color, open: openColors, emptied: true },
    line: { node: line, trigger: tools.underline, open: openLine, emptied: true },
    more: { node: more, trigger: tools.more, open: openMore },
    turn: { node: sub, trigger: turn, open: openTurn, emptied: true },
  };
  hover("turn", TURN_DELAY);
  hover("more", MORE_DELAY);

  // The panel open fades out; returns whether one was open (`at once`: the bar goes too).
  function closeSub(atOnce = false) {
    clearTimeout(timer);
    if (!current) return false;
    const { node: panel, trigger, emptied } = PANELS[current];
    current = null;
    trigger.setAttribute("aria-expanded", "false");
    if (atOnce) panel.hidden = true;
    fadeOut(panel, PANEL_OUT, emptied ? () => panel.replaceChildren() : null);
    return true;
  }

  return {
    node,
    get visible() { return !node.hidden; },
    holds: (target) => node.contains(target),
    /** Close the panel beside the bar or the colors, if one is open (Esc). */
    closeSub,

    /**
     * Show by `at`: { right, bottom } of the selection's last character (below and right of it)
     * and the selection's `top` (above it when there is no room below). state: { bold,
     * italic, strike, underline, code, link, text, highlight, underline facets } of the selection, what it allows
     * ({ links, fromSelection, formula, annotates }), and `block`: { current, types, first? } (what the block, or the
     * blocks of text across blocks, can be turned into; current null and `first` the first block's
     * type for several of different types) or null.
     */
    show(at, state) {
      for (const name of ["bold", "underline", "code"]) tools[name].setAttribute("aria-pressed", String(state[name]));
      for (const name of ["link", "strike", "italic"]) items[name].setAttribute("aria-pressed", String(state[name]));
      tools.more.setAttribute("aria-pressed", String(state.link || state.strike || state.italic)); // what "更多" holds is on
      items.link.disabled = !state.links;
      for (const item of blocksFrom) item.hidden = !state.fromSelection || state.link; // no row to press for what it cannot do
      items.annotate.hidden = !state.annotates;
      tools.formula.disabled = !state.formula;
      paint(state);
      const same = block && state.block && block.current === state.block.current && block.types.join() === state.block.types.join();
      block = state.block && state.block.types.length > 1 ? state.block : null;
      if (!same && current === "turn") closeSub();
      turn.hidden = separator.hidden = !block;
      if (block) {
        // Several blocks of different types: "多个类型" by the first one's icon.
        const { label, icon: markup } = TYPE_INFO[block.current ?? block.first] ?? { label: t("文本"), icon: "" };
        turnIcon.innerHTML = markup;
        turnLabel.textContent = block.current === null && block.first ? t("多个类型") : label;
      }
      if (node.hidden) fadeIn(node, APPEAR);
      const { offsetWidth: width, offsetHeight: height } = box;
      const { left, top } = besideText(at, { width, height });
      node.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    },

    hide() {
      closeSub(true);
      node.hidden = true;
    },
  };
}
