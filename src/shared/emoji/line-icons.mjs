import { ICON_COLOR_VALUES } from "./icon-value.mjs";

// Gallery's own line icons as a custom page's icon (page.json's `icon`): the look of the workbench's sidebar
// head, whose 新建 and 搜索 are Lucide's line icons (a 1.75 line in 24 units, workbench/app/components/icons.ts),
// so that a page Gallery makes stands among them in the same hand (the user's word of 2026-11-09: no filled
// icon there). A value is `/icons/lucide/<name>.svg`, with no color of its own: the workbench masks it in the
// color of where it stands (the sidebar's icon gray, as an icon of no icon's color), the browser tab draws it
// in the tab's gray (as a page with no icon, icon-value.mjs DEFAULT_TAB_ICON). It is none of the three kinds
// of a document's icon (icon-value.mjs iconKind: no document has one), nor an icon of the 图标 tab: Gallery's
// default home page's house (src/editor/home-page.mjs HOME_ICON), alone so far. The icon route draws it
// (src/render/emoji.mjs iconImage).

const LINE_ICONS = {
  // Lucide's house (1.67.0), the one the sidebar drew for the home page before its page.json said its icon.
  house: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
};
const LINE = /^\/icons\/lucide\/([a-z0-9-]+)\.svg$/;

/** The value of Gallery's line icon `name` (one LINE_ICONS has). */
export const lineIconValue = (name) => `/icons/lucide/${name}.svg`;

/** Whether `value` names one of Gallery's line icons. */
export const isLineIcon = (value) => lineIconSvg(value) !== null;

const [TAB_LIGHT, TAB_DARK] = ICON_COLOR_VALUES.gray;

/**
 * The SVG of the line icon `value` names, or null (none of them): its lines in `color` (black, the
 * workbench's mask); with `tab`, a browser tab's, its box cropped to `1 1 22 22` as the tab's icon of a
 * page with no icon is, in the tab glyphs' gray, light or dark as the system is.
 */
export function lineIconSvg(value, { color = "currentColor", tab = false } = {}) {
  const name = typeof value === "string" ? LINE.exec(value)?.[1] : null;
  if (!name || !Object.hasOwn(LINE_ICONS, name)) return null;
  const style = tab ? `<style>svg{color:${TAB_LIGHT}}@media (prefers-color-scheme:dark){svg{color:${TAB_DARK}}}</style>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${tab ? "1 1 22 22" : "0 0 24 24"}" fill="none" stroke="${tab ? "currentColor" : color}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${style}${LINE_ICONS[name]}</svg>`;
}
