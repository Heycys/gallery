import { workspaceAddress } from "../workspace-address.mjs";
import { iconImageFile } from "../media.mjs";

// A page's icon (the kit's "icon" component): what its value may be, its markup in a report and
// the value of that markup again. Shared by the editor (components/icon/, source/apply.mjs), the
// render (an export's and the preview's images: src/render/emoji.mjs) and the workbench.
//
// Its value, as report.json has it, and its markup in the file:
//   an emoji                          <div class="doc-icon">🎯</div>
//   an icon of the 图标 tab, in a color <div class="doc-icon" data-icon="/icons/airplane_blue.svg"></div>
//   an image of the report's folder   <div class="doc-icon"><img src="assets/icon-1a2b3c4d.png" alt=""></div>
// The 图标 tab's icons (a glyph: glyphs.mjs) are two open-source sets of the same 443 things,
// MingCute (the default: /icons/<name>_<color>.svg) and Tabler (/icons/tabler/<name>_<color>.svg),
// and Tabler's numbers (/icons/tabler/circle-number-3_<color>.svg: MingCute has none).

export const ICON = "doc-icon";

const KEYCAP = String.fromCodePoint(0x20e3);
/**
 * The ten icon colors, each's value light and dark: the one table (glyphs.mjs, the icon picker's
 * swatches, the browser tab's icon and the glyphs' drawing read it; styles/page.css of the kit and the
 * workbench's base.css write the same values as CSS, which tests/unit/icons.mjs holds to it).
 */
export const ICON_COLOR_VALUES = {
  gray: ["#55534E", "#D3D3D3"], lightgray: ["#A6A299", "#7F7F7F"], brown: ["#9F6B53", "#AA755F"], yellow: ["#CB912F", "#CA8E1B"], orange: ["#D9730D", "#D87620"],
  green: ["#448361", "#2D9964"], blue: ["#337EA9", "#2E7CD1"], purple: ["#9065B0", "#8D5BC1"], pink: ["#C14C8A", "#C94079"], red: ["#D44C47", "#CD4945"],
};
/** The icon colors, in the picker's order. */
export const ICON_COLORS = Object.keys(ICON_COLOR_VALUES);
/** The 图标 tab's two sets, the default first. */
export const GLYPH_SETS = ["mingcute", "tabler"];
const GLYPH = new RegExp(`^/icons/(?:(tabler)/)?([a-z0-9-]+)_(${ICON_COLORS.join("|")})\\.svg$`);

/** A glyph's value: { set, name, color }, or null (no glyph's). */
export function glyphOf(value) {
  const found = typeof value === "string" ? value.match(GLYPH) : null;
  return found ? { set: found[1] ?? GLYPH_SETS[0], name: found[2], color: found[3] } : null;
}
/** The value of icon `name` of set `set` in `color`. */
export const glyphValue = (set, name, color) => `/icons/${set === GLYPH_SETS[0] ? "" : `${set}/`}${name}_${color}.svg`;

/** What kind of icon a value is: "emoji", "glyph" (an icon of the 图标 tab), "image", or null (none a page may have). */
export function iconKind(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 120) return null;
  if (GLYPH.test(value)) return "glyph";
  if (iconImageFile(value)) return "image";
  // An emoji: pictographs, a flag or a keycap, no letters, nothing that is markup.
  return value.length <= 32 && !/[\s<>&"'A-Za-z]/.test(value) && (/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value) || value.includes(KEYCAP)) ? "emoji" : null;
}
export const validIcon = (value) => iconKind(value) !== null;

/** The custom property a Sheet tab's emoji is drawn through (the kit's sheets.css), and its value for the image at `url`: the server's (render/emoji.mjs) and the editor's (components/sheets/pills.mjs). */
export const TAB_ICON = "--doc-tab-icon";
export const tabIconValue = (url) => `url('${url}')`;

/** The icon's element as the file has it (`id`: its block id attribute, or ""). */
export function iconMarkup(value, id = "") {
  const kind = iconKind(value);
  if (kind === "glyph") return `<div class="${ICON}" data-icon="${value}"${id}></div>`;
  if (kind === "image") return `<div class="${ICON}"${id}><img src="${value}" alt=""></div>`;
  return `<div class="${ICON}"${id}>${value}</div>`; // checked: an emoji holds no markup
}

/**
 * An icon as one image the preview server serves (GET /__gallery/edit/icon): the workbench's tree and
 * menus; with `tab`, the browser tab's (a glyph in its own color, light or dark as the system).
 * `slug`: the report whose folder holds an image.
 * @param {string} value
 * @param {string | null} [slug]
 * @param {{ tab?: boolean }} [options]
 */
export const iconUrl = (value, slug = null, { tab = false } = {}) => workspaceAddress(`/__gallery/edit/icon?${new URLSearchParams({ value, ...(slug ? { slug } : {}), ...(tab ? { tab: "1" } : {}) })}`);

const [TAB_LIGHT, TAB_DARK] = ICON_COLOR_VALUES.gray;
/**
 * The browser tab's image of a page with no icon (the workbench's and the preview page's): the page
 * the workbench's tree shows for one (its "page" icon, components/icons.ts: Lucide's `file`, a plain
 * file outline), its box cropped to `1 1 22 22` so it fills the tab as an emoji does, in the tab
 * glyphs' gray, light or dark as the system is. An image, never none: a tab given no image, or one that does not
 * load, keeps the one it showed (Chrome), so a page with no icon opened after one with one showed that one's.
 */
export const DEFAULT_TAB_ICON = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="1 1 22 22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><style>svg{color:${TAB_LIGHT}}@media (prefers-color-scheme:dark){svg{color:${TAB_DARK}}}</style><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/></svg>`)}`;

/** The value of an icon's element as the file (or a page) has it, or null. */
export function iconValueOf(html) {
  const glyph = html.match(/\bdata-icon="([^"]*)"/)?.[1];
  if (glyph && iconKind(glyph) === "glyph") return glyph;
  const image = html.match(/<img\b[^>]*\bsrc="([^"]*)"/)?.[1];
  if (image && iconKind(image) === "image") return image;
  const text = html.replace(/<[^>]*>/g, "").trim();
  return iconKind(text) === "emoji" ? text : null;
}
