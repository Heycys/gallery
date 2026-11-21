// The page's icon (the kit's "icon" component, a whole block): 页面图标, right above the
// report's title, left-aligned with it (div.doc-icon). It is made, changed and taken away with its
// own controls (page.mjs: 添加图标 above the title, the icon picker on a click), never moved, selected
// or turned into another type; the server writes it right before the title wherever the page placed
// it (source/apply.mjs) and mirrors it in report.json (icon), which the workbench's tree shows. Its
// inside is no text block: a component of its own (`components`).
//
// Where the engines reach it: source/apply.mjs (written and checked as an `icon` node, report.json's
// note), editor/service.mjs (report.json), editor/media-store.mjs (images), registry.mjs (the header
// takes it), handle/ (no handle), clipboard/own/ (`clipboard`: a highlight block's or a node's).
import { ICON, iconKind, iconValueOf, validIcon } from "../../../shared/emoji/icon-value.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { rowOf } from "../read-rows.mjs";

export { ICON, iconKind, iconMarkup, iconValueOf, validIcon } from "../../../shared/emoji/icon-value.mjs";

/**
 * An icon made on the page (a new highlight block's 💡, one the clipboard brings, one the picker
 * gives), its value its text until the icon editing draws it (page.mjs). An icon of the 图标 tab
 * (a glyph) carries data-icon as the file's does: the kit colors it by that.
 */
export function iconElement(doc, value) {
  const node = doc.createElement("div");
  node.className = ICON;
  for (const [name, own] of [["data-ge-new", ""], ["data-ge-type", "icon"], ["data-ge-unit-kind", "icon"], ["data-ge-icon", value]]) node.setAttribute(name, own);
  if (iconKind(value) === "glyph") node.setAttribute("data-icon", value);
  node.textContent = value;
  return node;
}

export default {
  name: "icon",
  readOnly: [{ rank: 100, at: `.${ICON}`, says: null }], // an icon (the page's, a highlight block's), one of a set drawn as a picture too: its picker is its tool (page.mjs), never a chart
  units: {
    icon: {
      name: t("页面图标"), fixed: true, handle: "none", selectable: false, match: [{ rank: 5, class: ICON }],
      // gallery read (../read-rows.mjs): its value (an emoji, an icon of a set, a picture of the folder); no words.
      read: {
        name: "图标",
        rows: (node, { tools }) => [rowOf(node, `图标：${(iconValueOf(node.el.outerHTML) ?? tools.plain(node.el)) || "（空）"}${tools.looks(node.el)}`)],
        words: () => [],
        data: (node, { tools }) => ({ icon: iconValueOf(node.el.outerHTML) ?? tools.plain(node.el) }),
      },
    }, // in the header only; its own controls (page.mjs)
  },
  components: [ICON],
  types: {
    icon: {
      tag: "div", className: ICON, kind: "icon", bare: true,
      // Its value as the element keeps it; it leads its highlight block or node. Only there it comes
      // from the clipboard.
      clipboard: {
        kind: "icon", lead: true,
        describe(node) {
          if (!node.matches(`.${ICON}`)) return undefined;
          const icon = node.getAttribute("data-ge-icon") ?? iconValueOf(node.outerHTML);
          return icon ? { type: "icon", icon } : null;
        },
        check: (block, { box, isLead }) => isLead(box, "icon") && validIcon(block.icon),
        build: ({ doc, block }) => iconElement(doc, block.icon),
        text: () => [],
      },
      // Its value, as the page shows it (data-ge-icon: the element shows an image of it).
      extras: (element) => ({ icon: element.getAttribute("data-ge-icon") ?? iconValueOf(element.outerHTML) ?? "" }),
    },
  },
};
