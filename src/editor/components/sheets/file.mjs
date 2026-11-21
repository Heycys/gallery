// A Sheet area (选项卡区块) in report.html (the server's, source/): a tab made on the page (+ in its
// row) is written by apply.mjs (insertTab) as the kit writes one, <button class="doc-sheet-tab" type="button"
// data-sheet-tab="key">name</button> next to a tab of its row, and its panel <div
// data-doc-sheet="key"> next to that tab's panel, holding its blocks or none.

import { iconKind } from "../../../shared/emoji/icon-value.mjs";
import { SHEETS_LABEL } from "../../../shared/components/sheets.mjs";

const KEY = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
/** A new tab's button, its emoji with it (data-tab-icon), as the kit writes one. */
export const tabButton = (tab, id = "") => `<button class="doc-sheet-tab" type="button" data-sheet-tab="${tab.sheet}"${tab.icon ? ` data-tab-icon="${tab.icon}"` : ""}${id}>${tab.title}</button>`;

export default {
  // A Sheet area made on the page (选项卡) is written as the kit writes one: <section
  // class="doc-sheet-shell" data-doc-sheets="name" aria-label="选项卡"> holding its row <div
  // class="doc-sheet-tabs"> of tab buttons, then one <div data-doc-sheet="key"> per tab with
  // its blocks, one indentation step deeper (an empty one on one line). Its aria-label is said in the
  // file's language (SHEETS_LABEL, by its <html lang>: 选项卡 or Tabs).
  sheets: {
    check: (node) => typeof node.name === "string" && KEY.test(node.name) && node.children.length >= 1
      && node.children.every((tab) => tab.type === "tab") && new Set(node.children.map((tab) => tab.sheet)).size === node.children.length,
    write(node, w) {
      const deeper = w.inner === null ? null : w.inner + w.step;
      const label = SHEETS_LABEL[w.language];
      const row = w.block(`<div class="doc-sheet-tabs" aria-label="${label}">`, node.children.map((tab) => tabButton(tab, w.idOf(tab))), "</div>", w.inner, deeper);
      const panels = node.children.map((tab) => (tab.children.length === 0 ? `<div data-doc-sheet="${tab.sheet}"></div>`
        : w.block(`<div data-doc-sheet="${tab.sheet}">`, tab.children.map((child) => w.render(child, deeper)), "</div>", w.inner, deeper)));
      return w.block(`<section class="doc-sheet-shell" data-doc-sheets="${node.name}" aria-label="${label}"${w.id}>`, [row, ...panels], "</section>");
    },
  },
  tab: {
    empty: true,
    // Its name: plain text on one line; its key: a name of its own, as a report's tabs have.
    check: (node) => typeof node.title === "string" && node.title.trim() !== "" && node.title.length <= 200 && !/[<>\r\n]/.test(node.title)
      && typeof node.sheet === "string" && KEY.test(node.sheet) && (node.icon === undefined || iconKind(node.icon) === "emoji"),
  },
};
