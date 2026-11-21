import { escapeMarkup } from "../escape.mjs";
import { emojiDataFailed, emojiDataLoaded, emojiInfo, emojiSvgUrl, hasEmojiSvg, svgUrlOf } from "./data.mjs";

// Showing an emoji: on every system an <img> of its Twemoji vector image (data.mjs); the system's
// emoji font only where the data failed or the pack lacks it (a
// placeholder of its size while the data comes). `lazy`: the image's address is made once it
// scrolls near (the picker draws over a thousand of them), its codepoints kept in data-svg until
// then (lazySrc).

const BLANK_GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";
const px = (size) => (typeof size === "number" ? `${size}px` : size);
const esc = (text) => escapeMarkup(String(text));

/** The address a lazily shown image takes. */
export const lazySrc = (img) => svgUrlOf(img.dataset.svg) || BLANK_GIF;

/**
 * An emoji in the system's emoji font.
 * @param {string} emoji
 * @param {{ size?: number | string }} [options]
 */
function rawEmojiHTML(emoji, { size } = {}) {
  return `<span style="white-space:nowrap;${size ? `font-size:${px(size)};` : ""}font-family:&quot;Apple Color Emoji&quot;, &quot;Segoe UI Emoji&quot;, &quot;Segoe UI Symbol&quot;, &quot;Noto Color Emoji&quot;">${esc(emoji)}</span>`;
}

/**
 * An emoji as HTML, `size` wide and high (its box's when none).
 * @param {string} emoji
 * @param {{ size?: number | string, lazy?: boolean }} [options]
 */
export function emojiHTML(emoji, { size, lazy = false } = {}) {
  const side = size ? px(size) : "100%";
  if (!emojiDataLoaded() && !emojiDataFailed()) return `<span class="ge-emoji-pending" style="display:inline-block;width:${side};height:${side}"></span>`;
  const info = emojiInfo(emoji);
  if (!info || !hasEmojiSvg(info)) return rawEmojiHTML(emoji, { size });
  if (lazy) return `<img class="ge-emoji" alt="${esc(emoji)}" src="${BLANK_GIF}" data-svg="${info.codepoints}" draggable="false" style="width:${side};height:${side}">`;
  return `<img class="ge-emoji" alt="${esc(emoji)}" src="${emojiSvgUrl(info)}" draggable="false" style="width:${side};height:${side}">`;
}
