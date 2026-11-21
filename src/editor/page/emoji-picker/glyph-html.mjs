import { glyphSVG } from '../../../shared/emoji/glyphs.mjs';
import { esc } from './support.mjs';
import { language } from '../../../shared/i18n/index.mjs';

// What the picker's icon grid draws an icon of the 图标 tab with: its SVG inline (an <img> of a
// data: URL is a document of its own each: a grid of hundreds held the page up for seconds as a
// filter was typed), in the theme's colors. The sets' SVGs hold paths only (no ids to make unique).

/** Light or dark: the report's theme, the workbench's, else the system's. */
export function themeMode() {
  const root = globalThis.document?.documentElement;
  const set = root?.getAttribute('data-doc-theme') ?? root?.getAttribute('data-theme');
  if (set === 'dark' || set === 'light') return set;
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** What an icon is called in the UI's language: its Chinese name, or in English its name in `set` (the one set it has). */
export const glyphName = (pair, set) => (language === 'en' ? pair.names[set] ?? pair.names.tabler ?? pair.label : pair.label);

/** Pair `pair`'s icon of `set` in `color`, as its SVG inline, `size` px (or as large as where it stands). */
export function glyphHTML(pair, set, color, { size, mode = themeMode() } = {}) {
  const side = size ? (typeof size === 'number' ? `${size}px` : size) : '100%';
  if (!pair) return `<span style="display:inline-block;width:${side};height:${side}"></span>`;
  return glyphSVG(pair, set, color, mode)
    .replace('<svg ', `<svg class="ge-glyph" role="img" aria-label="${esc(`${glyphName(pair, set)} ${color}`)}" style="width:${side};height:${side};display:block;flex:none" `);
}
