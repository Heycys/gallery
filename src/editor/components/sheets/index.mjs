import { escapeText } from "../../../shared/escape.mjs";
import { iconKind } from "../../../shared/emoji/icon-value.mjs";
import { svg } from "../icons.mjs";
import { SHEETS } from "../kit.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { boxed, flowRows } from "../read-rows.mjs";

// 选项卡区块 and 选项卡 (a tabs block): the kit's Sheets (sheets.js). A Sheet area holds a tab
// row (.doc-sheet-tabs, a box of tabs) and one panel per tab ([data-doc-sheet], a box like the
// page: chapters and body text). A tab is a unit that takes its panel along; its name is a text
// block renamed in place. page.mjs: renaming a tab, a new one; pills.mjs: the tabs as
// pills (a press, a drag, the menu, +, an empty tab); file.mjs: a new tab in report.html.
//
// Where the engines reach it (src/editor/page/ unless named): convert.mjs (a new one: page.mjs
// `create`), editor.mjs (F2, Enter and Esc while a tab is renamed, undo with a tab focused: page.mjs `key`, `undoHere`, `field`, `click`), core.mjs (a tab's name in a span of its own:
// prepareBlock; a tab takes its panel: partsOf), selection/delete.mjs and drag/ (deleting and
// moving tabs, resting on a tab while dragging switches the Sheet),
// handle/ (room for each tab's handle), blocks.mjs (its tabs as pills, `sheetPills`), drag/drop.mjs (nothing drops over a tab row), clipboard/own/ (copying it: `clipboard`, and `build` in page.mjs), ../source/ (finding tabs and
// their panels: walkTabs).
// Its look: the kit's styles/sheets.css, switched by sheets.js (src/render/kit/).
/** The tabs area's icon: a page with its row of tabs along the top. */
export const TABS_ICON = svg('<rect x="3.25" y="3.75" width="13.5" height="12.5" rx="2"/><path d="M3.25 8h13.5M8.25 3.75V8M13.25 3.75V8"/>');

// What the kit's markup of a Sheet area writes for its own working, which gallery read's {…} leaves out.
const KIT_ROLES = ["role", "aria-label", "aria-selected", "aria-controls", "tabindex"];
// A tab's name, as its row shows it.
const tabName = (tab, { tools }) => tools.plain(tab.querySelector(':scope > [data-ge-kind="tab"]') ?? tab);

/** The name span of a tab in the tab row. */
export function tabOf(target) {
  return target?.closest?.(SHEETS.tabIn)?.querySelector(':scope > [data-ge-kind="tab"]') ?? null;
}

// A tab of a Sheet area described with `blocks` (its panel's): its name and emoji, or null.
function describeTab(tab, blocks) {
  const icon = tab.getAttribute("data-tab-icon");
  const title = (tab.querySelector(':scope > [data-ge-kind="tab"]') ?? tab).textContent.replace(/\s+/g, " ").trim();
  return blocks && title ? { title, ...(iconKind(icon) === "emoji" ? { icon } : {}), blocks } : null;
}

export default {
  name: "sheets",
  listed: () => t("选项卡"),
  readOnly: [{ rank: 60, at: `${SHEETS.tabIn}:has(> [data-ge-kind="tab"])`, says: null }], // a tab works as a pill (pills.mjs)
  units: {
    sheets: {
      name: t("选项卡区块"),
      // A container, so not the plain block's icon: a page with a row of tabs along its top.
      icon: TABS_ICON,
      match: [
        { rank: 20, tag: "section", class: "doc-sheet-shell" },
        { rank: 30, tag: "section", attr: "data-doc-sheets" },
      ],
      chapter: true, fixed: true,
      handle: "none", // its handle stands on its tab row, a tab's (`outer`)
      below: false,
      entersAfter: true,
      toggles: ["doc-sheet-shell--plain"], // no frame (显示边框 off in its block menu)
      // gallery read (../read-rows.mjs): boxed, its name and how many tabs, each tab boxed in it with its panel's blocks
      // (the reader's tree puts a panel's blocks under its tab: the panel box's owner); the kit's own roles left out of its {…}.
      read: {
        name: "选项卡区块",
        rows(node, view) {
          const name = node.el.getAttribute("data-doc-sheets");
          return boxed(node, `选项卡区块${name ? `「${name}」` : ""} · ${node.children.length} 个选项卡${view.tools.looks(node.el, { skip: ["data-doc-sheets", ...KIT_ROLES] })}`, flowRows(node.children, view));
        },
        data: (node, view) => ({ name: node.el.getAttribute("data-doc-sheets"), tabs: node.children.map((tab) => tabName(tab.el, view)) }),
        lost: () => "选项卡区块 {n} 个（选项卡写成先后的几段）",
      },
    },
    // The server marks each tab of a row (findUnits); its emoji (编辑图标 in its menu) is
    // an attribute of its button, shown before its name by the kit (sheets.css).
    tab: {
      clipboard: { kind: "words" }, name: t("选项卡"), icon: svg('<path d="M2.75 15.75h14.5"/><path d="M4.75 15.75v-9.5a2 2 0 0 1 2-2h4.5a2 2 0 0 1 2 2v9.5"/>'), fixed: true, handle: "outer", below: false, attributes: { "data-tab-icon": (value) => iconKind(value) === "emoji" },
      read: {
        name: "选项卡",
        rows: (node, view) => boxed(node, `选项卡「${tabName(node.el, view)}」${view.tools.looks(node.el, { skip: ["type", SHEETS.tabKey, ...KIT_ROLES] })}`, flowRows(node.children, view)),
        title: (node, view) => tabName(node.el, view),
        words: (node, view) => [tabName(node.el, view), ...view.flowWords(node.children)],
        data: (node, view) => ({ name: tabName(node.el, view), icon: node.el.getAttribute("data-tab-icon") }),
      },
    },
  },
  boxes: {
    // `owner`: the tab that takes the panel along (its hash covers the panel); `takenBy`: that tab known by
    // its key, off the page as both are once it is deleted.
    panel: {
      role: "root", name: t("选项卡"), selectAll: { content: t("这个选项卡里的全部内容"), whole: true },
      find: (unit, key) => [...unit.querySelectorAll(SHEETS.panels)].find((child) => child.getAttribute(SHEETS.panelKey) === key) ?? null,
      owner: (panel) => [...(panel.parentElement?.querySelectorAll(SHEETS.tabs) ?? [])].find((tab) => tab.getAttribute(SHEETS.tabKey) === panel.getAttribute(SHEETS.panelKey)) ?? null,
      takenBy: (tab, key) => tab.getAttribute(SHEETS.tabKey) === key,
    },
    // Its tabs are the area's own controls (pills.mjs): a box selection passes over them.
    tabs: { role: "tabs", name: t("选项卡栏"), controls: true, selectAll: { whole: true }, find: (unit) => unit.querySelector(SHEETS.row) },
  },
  types: {
    // A new Sheet area (the "/" menu's 选项卡, 在下方新建: page.mjs newSheets): three tabs, 选项 1–3,
    // their panels empty, written with them under a name of its own (file.mjs).
    sheets: {
      menu: ["advanced", 21], fresh: 6,
      tag: "section", className: "doc-sheet-shell", kind: "sheets", box: "tabs",
      clipboard: {
        kind: "tabs", claims: SHEETS.match,
        holds: (block) => (block.tabs ?? []).flatMap((tab) => tab.blocks),
        read: (unit, { plain, unitsOf }) => [...unit.querySelectorAll(SHEETS.tabs)].map((tab) => {
          const panel = panelFor(tab);
          return { name: plain(tab.querySelector('[data-ge-kind="tab"]') ?? tab), units: panel ? unitsOf(panel) : [] };
        }),
        // Each tab's name, emoji and blocks; its page.mjs makes it again.
        describe(node, { isHost, holding }) {
          if (node.getAttribute("data-ge-unit-kind") !== "sheets" || isHost(node)) return undefined;
          const tabs = [...node.querySelectorAll(SHEETS.tabs)].map((tab) => describeTab(tab, holding(panelFor(tab))));
          return tabs.length > 0 && tabs.every(Boolean) ? { type: "sheets", tabs } : null;
        },
        // The tab shown, with what of its panel comes before the end (a tabs block holds the content
        // it shows); its tab row is no text of it, and an end before the panel leaves
        // none of it. With no tabs it is no Sheet area, whatever it says: any block's rule holds.
        endsIn(unit, { holdsAny, walk, groupItems }) {
          const tabs = [...unit.querySelectorAll(SHEETS.tabs)];
          if (!unit.matches(SHEETS.match) || tabs.length === 0) return undefined;
          const shown = tabs.flatMap((tab) => {
            const panel = panelFor(tab);
            const described = panel && !panel.hidden && holdsAny(panel) ? describeTab(tab, groupItems(walk(panel))) : null;
            return described ? [described] : [];
          });
          return shown.length > 0 ? [{ type: "sheets", tabs: shown }] : [];
        },
        check: (block, { string, valid }) => Array.isArray(block.tabs) && block.tabs.length >= 1 && block.tabs.length <= 20
          && block.tabs.every((tab) => tab && string(tab.title, 200) && tab.title.length >= 1 && !/[<>\r\n]/.test(tab.title)
            && (tab.icon === undefined || iconKind(tab.icon) === "emoji") && Array.isArray(tab.blocks) && tab.blocks.every((inner) => valid(inner, "panel"))),
        text: (block, lines) => block.tabs.flatMap((tab) => [escapeText(tab.title), ...lines(tab.blocks)]),
      },
      content: (element) => element.querySelector(SHEETS.row),
      extras: (element) => ({ name: element.getAttribute("data-doc-sheets") }),
      label: t("选项卡"), icon: TABS_ICON,
      words: "选项卡 标签页 分页 页签 切换 xuanxiangka biaoqianye fenye yeqian xxk bqy tab tabs tabbed switch",
      glance: { row: 14, name: "选项卡", write: "`<section data-doc-sheets=\"name\">` holding a `<section>` per tab, starting with its heading, the tab's name", after: "`section.doc-sheet-shell`: its row of tabs, a `div[data-doc-sheet]` per tab", rule: "Kit blocks" },
    },
    // A tab made on the page (+ at the end of its row): its name and its panel's blocks, written
    // with its panel (source/apply.mjs insertTab). No label: nothing is turned into a tab.
    tab: {
      tag: "button", className: "doc-sheet-tab", kind: "tab", box: "panel",
      title: (element) => element.querySelector(':scope > [data-ge-kind="tab"]'), content: (element) => panelFor(element),
      written: () => true, // with no blocks too: an empty tab
      extras: (element) => ({ sheet: element.getAttribute(SHEETS.tabKey), ...(iconKind(element.getAttribute("data-tab-icon")) === "emoji" ? { icon: element.getAttribute("data-tab-icon") } : {}) }),
    },
  },
  components: ["doc-sheet-tabs"],
  hosts: {
    tab: { name: t("选项卡名称"), caps: () => ["plain"], textFilters: false, wrapped: true, parts: [["sheets", "tabs"]] }, // the name is a span made inside the button, which keeps switching Sheets
  },
};

/** A Sheet tab's panel (its description's pair, src/shared/components/sheets.mjs), or null. */
export function panelOf(node) {
  return node.hasAttribute("data-ge-unit") ? panelFor(node) : null;
}

/** The panel of a tab in a Sheet area's row (one of the file's or one made on the page), or null. */
export function panelFor(tab) {
  const key = tab.getAttribute(SHEETS.tabKey);
  const shell = key !== null ? tab.parentElement?.parentElement : null;
  return shell?.matches(SHEETS.match) ? [...shell.querySelectorAll(SHEETS.panels)].find((child) => child.getAttribute(SHEETS.panelKey) === key) ?? null : null;
}
