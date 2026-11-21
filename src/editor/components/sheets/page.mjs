import { frameOf } from "../../page/core.mjs";
import { pointRange, select } from "../../page/caret.mjs";
import { closeLink } from "../../page/links/index.mjs";
import { ICONS } from "../../page/menu.mjs";
import { iconKind } from "../../../shared/emoji/icon-value.mjs";
import { TOGGLES } from "../registry.mjs";
import { SHEETS } from "../kit.mjs";
import { capsFor } from "../registry.mjs";
import { lookRow } from "../rows.mjs";
import { tabOf } from "./index.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// 选项卡 on the page: renaming a tab, and a new one. A tab is a button that switches Sheets, so a
// click still switches. 重命名 in its menu (a click on the tab shown: pills.mjs), or F2 while the tab
// has focus, makes the name span editable in place with the whole name selected; Enter or
// leaving the name keeps it, Esc goes back to the name before. While renamed, clicks and keys stay
// away from sheets.js. Pressing, dragging, the menu and + are pills.mjs's; deleting and moving a tab,
// the block tools' (blocks.mjs).

// A Sheet area with no frame (显示边框 off), a class switch the description names.
const PLAIN = TOGGLES.sheets[0];

/**
 * Renaming tabs, with what the editor gives it: the last recorded content of each block,
 * recordText (one step of typing), closeTyping and say; the Sheet area's row of the
 * block menu (look(element, { classes }, select): the editor's undoable change of classes); and the
 * tab's menu (openMediaPicker: the icon picker).
 */
export function create({ lastKnown, recordText, closeTyping, say, look, openMediaPicker }) {
  let renaming = null; // { host, before }: the name being edited and its HTML when renaming began

  // The caret where the reader pointed (x, y), or the whole name selected.
  function start(host, x, y) {
    if (renaming) finish();
    closeLink(false);
    closeTyping();
    renaming = { host, before: host.innerHTML };
    host.setAttribute("contenteditable", "true");
    host.parentElement?.setAttribute("data-ge-renaming", ""); // the tab's look while renamed (pills.mjs)
    const range = x === undefined ? null : pointRange(x, y);
    host.focus({ preventScroll: true });
    if (range && host.contains(range.startContainer)) return select(range);
    const all = document.createRange();
    all.selectNodeContents(host);
    select(all);
  }

  // The name is kept with its spaces tidied. keep: false (Esc), or an emptied name, puts the name
  // from before back; either is recorded like typing, so it undoes with the typing just before it.
  function finish(keep = true) {
    if (!renaming) return;
    const { host, before } = renaming;
    renaming = null;
    const name = host.textContent.replace(/\s+/g, " ").trim();
    if (!keep || !name) host.innerHTML = before;
    else if (host.textContent !== name || host.childElementCount > 0) host.textContent = name; // no stray <br>
    if (host.innerHTML !== lastKnown.get(host)) recordText(host);
    closeTyping();
    if (document.activeElement === host) host.blur();
    host.removeAttribute("contenteditable");
    host.parentElement?.removeAttribute("data-ge-renaming");
    const selection = getSelection();
    if (selection.rangeCount && host.contains(selection.anchorNode)) selection.removeAllRanges();
    if (keep && !name) say(t("选项卡名称不能为空，已恢复原来的名称。"), "error");
  }

  // Whether a press or click lands on the tab being renamed (its name or its padding): a text field
  // then, whose clicks (the space bar's too) do not reach sheets.js.
  const holds = (target) => Boolean(renaming) && frameOf(renaming.host).contains(target);

  // The page's listeners: a press on the padding of the tab being renamed keeps the caret in its
  // name; leaving the name ends renaming (switching to another window does not).
  function install() {
    document.addEventListener("mousedown", (event) => {
      if (holds(event.target) && !renaming.host.contains(event.target)) event.preventDefault();
    }, true);
    document.addEventListener("focusout", (event) => {
      if (renaming?.host === event.target && document.hasFocus()) finish();
    }, true);
  }

  /**
   * The tabs' keys, which come before any text block's as a tab holds none of the page's (`key`): the
   * keys of a tab being renamed stay away from sheets.js (it would switch Sheets on arrows, Home and
   * End); Enter or Esc ends renaming (the one + just made too: not a text block of the page's until
   * its commit comes back); F2 on a tab starts it. True when the key was the tabs'.
   */
  function key(event) {
    const renamed = renaming?.host === event.target;
    if (renamed) event.stopPropagation();
    if (renamed && !event.isComposing && event.keyCode !== 229 && (event.key === "Enter" || event.key === "Escape")) {
      event.preventDefault();
      finish(event.key === "Enter");
      return true;
    }
    const tab = !renamed && tabOf(event.target);
    if (!tab || event.key !== "F2") return false;
    event.preventDefault();
    start(tab);
    return true;
  }

  return {
    create: make, start, install, key,
    /** A click on the tab being renamed stays away from sheets.js, the space bar's too. True when it was. */
    click(event) {
      if (!holds(event.target)) return false;
      event.stopPropagation();
      return true;
    },
    /** Undo and redo work with the focus on a tab, where no text block hears them. */
    undoHere: (node) => Boolean(tabOf(node)),
    /**
     * A Sheet area's row of the block menu: 显示边框, a switch (checked while the frame shows, clicked
     * again to take it away: a choice already made, `current`, could not be clicked). None for another block.
     */
    menuItems(target) {
      if (target?.getAttribute?.("data-ge-unit-kind") !== "sheets") return [];
      const framed = !target.classList.contains(PLAIN);
      return [lookRow({ look, say }, target, { label: t("显示边框"), icon: ICONS.frame, checked: framed, change: { classes: { [PLAIN]: framed } }, done: t("{0}选项卡区块的边框", framed ? t("已去掉") : t("已显示")) })];
    },
    /**
     * A tab's menu, in place of the block menu (no types, nothing below it, nothing around
     * it): 重命名, 编辑图标 (the emoji picker below the tab, 表情符号 only; its pick, or 移除, one undo
     * step) and 删除. `tools`: the block menu's { rect: the handle's, reason: why it may not go,
     * remove(): delete it }. None for another block.
     */
    menu(target, { rect, reason, remove }) {
      if (target?.getAttribute?.("data-ge-unit-kind") !== "tab") return null;
      const pick = () => {
        openMediaPicker({ origin: rect ?? target.getBoundingClientRect(), value: target.getAttribute("data-tab-icon"), only: ["emoji"], onPick: (value) => {
          if (value !== null && iconKind(value) !== "emoji") return;
          if (look(target, { attributes: { "data-tab-icon": value } })) say(t("{0}选项卡图标 · Ctrl+Z 撤销", value ? t("已更换") : t("已移除")));
        } });
      };
      return {
        label: t("选项卡的操作"),
        width: 180,
        items: [
          { label: t("重命名"), icon: ICONS.rename, hint: "F2", run: () => { const name = tabOf(target); if (name) start(name); } },
          { label: t("编辑图标"), icon: ICONS.face, run: () => setTimeout(pick) },
          { label: t("删除"), icon: ICONS.trash, danger: true, disabled: Boolean(reason), note: reason ?? undefined, run: remove },
        ],
      };
    },
    /** The name being renamed, or null. */
    get field() { return renaming?.host ?? null; },
  };
}

/**
 * A new Sheet area (选项卡, a tabs block): a frame holding a row of three tabs, 选项卡 1–3,
 * each with an empty panel, under a name of its own on the page (the reader's chosen tab is kept
 * under it). The kit's sheets.js comes too when the page has none (ensureSheetsKit).
 */
export function newSheets(doc, given = null) {
  const shell = doc.createElement("section");
  shell.className = "doc-sheet-shell";
  const taken = new Set([...doc.querySelectorAll("[data-doc-sheets]")].map((node) => node.getAttribute("data-doc-sheets")));
  let name;
  do name = `tabs-${Math.random().toString(36).slice(2, 6)}`; while (taken.has(name));
  for (const [attribute, value] of [["data-doc-sheets", name], ["aria-label", t("选项卡")], ["data-ge-new", ""], ["data-ge-type", "sheets"], ["data-ge-unit-kind", "sheets"]]) shell.setAttribute(attribute, value);
  const row = doc.createElement("div");
  row.className = "doc-sheet-tabs";
  for (const [attribute, value] of [["aria-label", t("选项卡")], ["data-ge-box", ""], ["data-ge-box-kind", "tabs"]]) row.setAttribute(attribute, value);
  shell.append(row);
  // given: [{ title, icon, blocks }] (a copy pasted), else three empty tabs.
  for (const [index, wanted] of (given ?? [1, 2, 3].map((number) => ({ title: t("选项卡 {0}", number) }))).entries()) {
    const { tab, panel } = newTab(shell, wanted.title || t("选项卡 {0}", index + 1));
    if (wanted.icon) tab.setAttribute("data-tab-icon", wanted.icon);
    panel.append(...(wanted.blocks ?? []));
    row.append(tab);
    shell.append(panel);
  }
  ensureSheetsKit(doc);
  return shell;
}

/** A Sheet area made again from the clipboard's description (its type's `build`, builders.mjs). */
export function build({ doc, block, inner }) {
  return newSheets(doc, block.tabs.map((tab) => ({ title: tab.title, icon: tab.icon, blocks: inner(tab.blocks) })));
}

/** A Sheet area standing for an empty block (its type's `create`), its three tabs empty; no caret. */
export function make({ doc, put }) {
  put(newSheets(doc));
  return null;
}

/** The kit's sheets.js on the page (a page with no Sheet area is served without it), as a kit tag. */
export function ensureSheetsKit(doc) {
  if (globalThis.DocSheets || doc.querySelector('script[data-doc-kit="sheets"]')) return;
  const script = doc.createElement("script");
  script.src = "/kit/sheets.js";
  script.setAttribute("data-doc-kit", "sheets");
  const kit = [...doc.querySelectorAll("script[data-doc-kit]")].at(-1);
  if (kit) kit.after(script);
  else doc.body.append(script);
}

/**
 * A tab made on the page and its empty panel, for `shell` (a Sheet area), named `name`, under a key
 * the area has not used: { tab, panel, key }, not yet on the page. The tab is a block made on the
 * page (its type's, index.mjs), its name a span as prepareBlock makes a tab's; the panel a box made
 * on the page, which the commit writing the tab makes one of the file's (commit.mjs adopt).
 */
export function newTab(shell, name) {
  const doc = shell.ownerDocument;
  const taken = new Set([...shell.querySelectorAll(`[${SHEETS.tabKey}], [${SHEETS.panelKey}]`)].map((node) => node.getAttribute(SHEETS.tabKey) ?? node.getAttribute(SHEETS.panelKey)));
  let key;
  do key = `tab-${Math.random().toString(36).slice(2, 6)}`; while (taken.has(key));
  const tab = doc.createElement("button");
  tab.className = "doc-sheet-tab";
  tab.type = "button";
  tab.setAttribute(SHEETS.tabKey, key);
  for (const [attribute, value] of [["data-ge-new", ""], ["data-ge-type", "tab"], ["data-ge-unit-kind", "tab"]]) tab.setAttribute(attribute, value);
  const label = doc.createElement("span");
  label.setAttribute("data-ge-kind", "tab");
  label.setAttribute("data-ge-caps", capsFor("tab"));
  label.textContent = name;
  tab.append(label);
  const panel = doc.createElement("div");
  panel.setAttribute(SHEETS.panelKey, key);
  panel.setAttribute("data-ge-box", "");
  panel.setAttribute("data-ge-box-kind", "panel");
  return { tab, panel, key };
}
