import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { escapeAttribute, escapeMarkup } from "../shared/escape.mjs";
import { componentOf, instancesOf, partOf } from "../shared/components/index.mjs";
import { ICON_COLOR_VALUES, TAB_ICON, glyphOf, iconKind, iconUrl, iconValueOf, tabIconValue } from "../shared/emoji/icon-value.mjs";
import { codepointsOf, withoutSelectors } from "../shared/emoji/codepoints.mjs";
import { lineIconSvg } from "../shared/emoji/line-icons.mjs";
import { mediaTypeOf } from "../shared/media.mjs";
import { emojiDataDirectory, reportsDirectory as defaultReportsDirectory } from "../shared/paths.mjs";
import { slugPattern } from "../shared/reports.mjs";
import { documentDirectory } from "../shared/workspace.mjs";
import { servedUrl } from "./media-ref.mjs";
import { parseReport, sourceOf } from "./report-tree.mjs";

// The page's icon (.doc-icon, src/shared/emoji/icon-value.mjs) as the preview and an offline
// file show it: whatever its kind, an image there from the start, never the emoji in the system's
// font first and the picture after it.
//   an emoji        its Twemoji image (the pack the editor and the workbench show emojis with on
//                   every system: src/shared/emoji/data/), a data: URL; one the pack lacks (newer
//                   than it, or a flag: Gallery ships none) stays the emoji, in the kit's emoji font
//   an icon of the  its SVG inline (src/shared/emoji/data/icons.json: MingCute's or Tabler's), in
//   图标 tab (glyph) the color the kit gives it (currentColor: styles/page.css, light and dark)
//   an image        the preview: where the server serves the report's folder; an export: a data: URL
// The preview's also says the icon's value (data-ge-icon): the page editor changes it.
// The browser tab shows the page's icon too: a link rel="icon" in the head, the image
// the server makes of it in the preview (the editor keeps it as the icon changes), a data: URL in
// an export. The icon route's image of an emoji the pack lacks is its character in an SVG (the
// system's emoji font), never none: the workbench's tree, a page block's chip and a tab show it.

const dataDirectory = emojiDataDirectory; // src/shared/emoji/data/, the release's browser/shared/emoji/data/
let pack = null; // { places: codepoints without fe0f -> [offset, length], svg: Buffer }
let glyphs = null; // "<set>/<name>" -> its SVG, drawn in #COLOR

// The pack names each picture by the emoji's codepoints, fully qualified (twemoji-index.json); an emoji is
// found written with or without its variation selectors (fe0f), as the editor finds it (data.mjs emojiInfo).
function load() {
  pack ??= {
    places: new Map(Object.entries(JSON.parse(fs.readFileSync(path.join(dataDirectory, "twemoji-index.json"), "utf8"))).map(([codepoints, at]) => [withoutSelectors(codepoints), at])),
    svg: zlib.gunzipSync(fs.readFileSync(path.join(dataDirectory, "twemoji-svg.bin"))),
  };
  return pack;
}

// The emoji's Twemoji SVG, or null (one the pack lacks).
function emojiSvg(emoji) {
  const { places, svg } = load();
  const at = places.get(withoutSelectors(codepointsOf(emoji)));
  return at ? svg.subarray(at[0], at[0] + at[1]) : null;
}

/** The emoji's vector image as a data: URL, or null (one the pack lacks: the system's font shows it). */
export function emojiDataUrl(emoji) {
  const svg = emojiSvg(emoji);
  return svg ? `data:image/svg+xml;base64,${svg.toString("base64")}` : null;
}

/** The names of a set's icons (GLYPH_SETS: "mingcute" or "tabler"), in icons.json's order. */
export function glyphNames(set) {
  glyphSvg("");
  return [...glyphs.keys()].filter((key) => key.startsWith(`${set}/`)).map((key) => key.slice(set.length + 1));
}

/**
 * A glyph's SVG (an icon of the 图标 tab: icons.json, src/shared/emoji/glyphs.mjs) drawn in `color`
 * (by default the color of the element it is in), or null: none of either set's. An icon one set has
 * alone (Tabler's numbers: no MingCute name, null) is that set's only.
 */
export function glyphSvg(value, color = "currentColor") {
  glyphs ??= new Map(JSON.parse(fs.readFileSync(path.join(dataDirectory, "icons.json"), "utf8")).icons
    .flatMap(([, mingcute, tabler, mingcuteSvg, tablerSvg]) => [[`mingcute/${mingcute}`, mingcuteSvg], [`tabler/${tabler}`, tablerSvg]].filter(([, svg]) => svg)));
  const glyph = glyphOf(value);
  const svg = glyph && glyphs.get(`${glyph.set}/${glyph.name}`);
  return svg ? svg.split("#COLOR").join(color).replace("<svg ", '<svg aria-hidden="true" ') : null;
}

// A glyph for a browser tab: in its color, light or dark as the system is (an SVG favicon
// follows prefers-color-scheme), or null.
function tabGlyphSvg(value) {
  const [light, dark] = ICON_COLOR_VALUES[glyphOf(value)?.color] ?? ICON_COLOR_VALUES.gray;
  const svg = glyphSvg(value);
  return svg && svg.replace(/<svg\b[^>]*>/, (open) => `${open.replace(/ aria-hidden="true"/, "").replace(/^<svg /, '<svg xmlns="http://www.w3.org/2000/svg" ').replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"(?=.* xmlns=)/, "")}<style>svg{color:${light}}@media (prefers-color-scheme:dark){svg{color:${dark}}}</style>`);
}

// An emoji the pack lacks (newer than it, or a flag: Gallery ships none) as the system's emoji font draws it:
// its character in an SVG as large as Twemoji's (36 units), so the icon route always gives a picture.
const fontPicture = (emoji) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><text x="18" y="18" text-anchor="middle" dominant-baseline="central" font-size="30" font-family="'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif">${escapeMarkup(emoji)}</text></svg>`;

/**
 * An icon as one image (GET /__gallery/edit/icon), { type, body } or null: an emoji's Twemoji SVG
 * (one the pack lacks: its character in the system's emoji font, fontPicture),
 * a glyph's SVG in black (the workbench's tree and menus mask it with their color; `tab`: in
 * its own, for a browser tab), one of Gallery's line icons a custom page may have (line-icons.mjs:
 * black for the mask, a tab's in its gray), a report's image (`slug`: whose folder).
 */
export function iconImage({ value, slug = null, tab = false, reportsDirectory = defaultReportsDirectory }) {
  const line = lineIconSvg(value, { color: "#000", tab });
  if (line) return { type: "image/svg+xml", body: Buffer.from(line) };
  const kind = iconKind(value);
  if (kind === "emoji") return { type: "image/svg+xml", body: emojiSvg(value) ?? Buffer.from(fontPicture(value)) };
  if (kind === "glyph") {
    const svg = tab ? tabGlyphSvg(value) : glyphSvg(value, "#000");
    return svg && { type: "image/svg+xml", body: Buffer.from(svg) };
  }
  if (kind !== "image" || !slug || !slugPattern.test(slug)) return null;
  const file = path.join(documentDirectory(slug, reportsDirectory), value);
  return fs.existsSync(file) ? { type: mediaTypeOf(value), body: fs.readFileSync(file) } : null;
}

const ICON_ELEMENT = /(<div\b[^>]*\bclass="doc-icon"[^>]*>)([\s\S]*?)(<\/div>)/g; // the page's, a highlight block's and a flowchart step's

/**
 * The report's HTML with its page icon shown as an image. mode "preview": a report's image where the
 * server serves it, the value said (data-ge-icon); "export": every image a data: URL.
 */
export function embedIcon(html, { slug, mode = "export", reportsDirectory = defaultReportsDirectory }) {
  return withTabIcon(embedTabIcons(html, { mode }).replace(ICON_ELEMENT, (whole, open, inner, close) => {
    const value = iconValueOf(whole);
    const kind = iconKind(value);
    if (!kind) return whole;
    let shown = null;
    if (kind === "emoji") {
      const url = emojiDataUrl(value);
      shown = url && `<img alt="${escapeAttribute(value)}" src="${url}">`;
    } else if (kind === "glyph") shown = glyphSvg(value);
    else if (mode === "preview") shown = `<img src="${servedUrl("asset", slug, value, typeof slug === "string" ? documentDirectory(slug, reportsDirectory) : null)}" alt="">`;
    else {
      const file = path.join(documentDirectory(slug, reportsDirectory), value);
      const bytes = fs.existsSync(file) ? fs.readFileSync(file) : null;
      shown = bytes && `<img src="data:${mediaTypeOf(value)};base64,${bytes.toString("base64")}" alt="">`;
    }
    const tag = mode === "preview" ? open.replace(/>$/, ` data-ge-icon="${escapeAttribute(value)}">`) : open;
    return shown ? `${tag}${shown}${close}` : `${tag}${inner}${close}`;
  }), tabIconHref(pageIconValue(html), { slug, mode, reportsDirectory }));
}

/** Where each icon's image embedIcon shows starts in the HTML: its <img> (render/asset-references.mjs asks which references an export embeds). */
export const iconImageStarts = (html) => [...html.matchAll(ICON_ELEMENT)].flatMap((icon) => {
  const image = iconKind(iconValueOf(icon[0])) === "image" ? /<img\b[^>]*\bsrc="/.exec(icon[2]) : null;
  return image ? [icon.index + icon[1].length + image.index] : [];
});

// A Sheet tab's emoji (data-tab-icon) as a picture too, never the system's emoji font: its Twemoji
// image as the tab's --doc-tab-icon (style attribute), which the kit draws before its name
// (sheets.css); the preview's from the server (the editor sets it again as the emoji changes), an
// export's a data: URL. An emoji the pack lacks keeps the font's.
const TAB_BUTTON = /<button\b[^>]*\bdata-tab-icon="([^"]*)"[^>]*>/g;
export function embedTabIcons(html, { mode = "export" } = {}) {
  return html.replace(TAB_BUTTON, (open, value) => {
    if (iconKind(value) !== "emoji" || open.includes(TAB_ICON)) return open;
    const url = mode === "preview" ? iconUrl(value) : emojiDataUrl(value);
    if (!url) return open;
    const icon = `${TAB_ICON}: ${tabIconValue(url)}`;
    return /\sstyle="/.test(open) ? open.replace(/\sstyle="([^"]*)"/, (whole, style) => ` style="${style.replace(/;?\s*$/, "; ")}${icon}"`) : open.replace(/>$/, ` style="${icon}">`);
  });
}

/** The icons of a parsed report: `all` of them (icon.mjs's match) and `own`, the page's, those in its header (page.mjs's). */
export function iconsOf(tree) {
  const header = partOf(tree, componentOf("page").header)[0];
  return { all: instancesOf(tree, componentOf("icon")), own: header ? partOf(header, componentOf("icon").match) : [] };
}

/** The page's icon: the one in the report's header, right before its title; or null. */
export function pageIconValue(html) {
  const [icon] = iconsOf(parseReport(html)).own;
  return icon ? iconValueOf(sourceOf(html, icon)) : null;
}

// The browser tab's image of the page's icon, or null: the preview's from the server, an export's a data: URL.
function tabIconHref(value, { slug, mode, reportsDirectory }) {
  if (!value) return null;
  if (mode === "preview") return iconUrl(value, slug, { tab: true });
  const image = iconImage({ value, slug, tab: true, reportsDirectory });
  return image && `data:${image.type};base64,${Buffer.from(image.body).toString("base64")}`;
}

// The page's icon as the tab's (data-doc-tab-icon: the page editor keeps it), before the head's end.
const withTabIcon = (html, href) => (href && /<\/head>/i.test(html) && !html.includes("data-doc-tab-icon")
  ? html.replace(/<\/head>/i, () => `  <link rel="icon" href="${escapeAttribute(href)}" data-doc-tab-icon>\n</head>`)
  : html);
