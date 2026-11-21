// Pasted colors onto the page's nine. Pure, no DOM. A color is given as the CSS text of a style
// (named, #hex, rgb[a](), hsl[a]()).
//   exact     a color equal to one of the page's (the kit's light values: doc-text-*, and
//             doc-highlight-* as a block's fill or a run of words') is that one: what a page whose styles are not meant (any web page)
//             keeps
//   nearest   for sources whose styles are meant (Word, Google Docs, Notion): text — too dark (HSV
//             v ≤ 0.3) none, unsaturated (s < 0.08) gray, a pure CSS color by a fixed table, else the
//             CIEDE2000-nearest (the body's own text color: none); background — transparent none,
//             dark or unsaturated gray (nearly white none), else the nearest (white: none)
// The result is the color mark's name for it (red, red_background), the value html.mjs marks colors
// with, as Notion's HTML names them.

import { BODY, COLORS } from "../../../../shared/colors.mjs";

// The page's light values (src/shared/colors.mjs).
const TEXT = COLORS.map(({ name, text }) => [name, text[0]]);
const BACKGROUND = COLORS.flatMap(({ name, fill, mark }) => [[name, fill[0]], [name, mark[0]]]);
const BODY_TEXT = BODY.text[0];
const BODY_BACKGROUND = BODY.background[0];

/** The color names a color mark carries (a spec's block_color, the "h" annotation): the page's nine, and teal, which Notion's HTML may name (shown as the page's green). */
export const NOTION_COLOR_NAMES = [...COLORS.map(({ name }) => name), "teal"];

// The CSS named colors (tinycolor's table).
const NAMES = Object.fromEntries(("aliceblue:f0f8ff antiquewhite:faebd7 aqua:0ff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc bisque:ffe4c4 black:000 "
  + "blanchedalmond:ffebcd blue:00f blueviolet:8a2be2 brown:a52a2a burlywood:deb887 cadetblue:5f9ea0 chartreuse:7fff00 chocolate:d2691e coral:ff7f50 "
  + "cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:0ff darkblue:00008b darkcyan:008b8b darkgoldenrod:b8860b darkgray:a9a9a9 darkgreen:006400 "
  + "darkgrey:a9a9a9 darkkhaki:bdb76b darkmagenta:8b008b darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000 darksalmon:e9967a "
  + "darkseagreen:8fbc8f darkslateblue:483d8b darkslategray:2f4f4f darkslategrey:2f4f4f darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 "
  + "deepskyblue:00bfff dimgray:696969 dimgrey:696969 dodgerblue:1e90ff firebrick:b22222 floralwhite:fffaf0 forestgreen:228b22 fuchsia:f0f "
  + "gainsboro:dcdcdc ghostwhite:f8f8ff gold:ffd700 goldenrod:daa520 gray:808080 green:008000 greenyellow:adff2f grey:808080 honeydew:f0fff0 "
  + "hotpink:ff69b4 indianred:cd5c5c indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa lavenderblush:fff0f5 lawngreen:7cfc00 lemonchiffon:fffacd "
  + "lightblue:add8e6 lightcoral:f08080 lightcyan:e0ffff lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90 lightgrey:d3d3d3 lightpink:ffb6c1 "
  + "lightsalmon:ffa07a lightseagreen:20b2aa lightskyblue:87cefa lightslategray:789 lightslategrey:789 lightsteelblue:b0c4de lightyellow:ffffe0 lime:0f0 "
  + "limegreen:32cd32 linen:faf0e6 magenta:f0f maroon:800000 mediumaquamarine:66cdaa mediumblue:0000cd mediumorchid:ba55d3 mediumpurple:9370db "
  + "mediumseagreen:3cb371 mediumslateblue:7b68ee mediumspringgreen:00fa9a mediumturquoise:48d1cc mediumvioletred:c71585 midnightblue:191970 "
  + "mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 navajowhite:ffdead navy:000080 oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 orange:ffa500 "
  + "orangered:ff4500 orchid:da70d6 palegoldenrod:eee8aa palegreen:98fb98 paleturquoise:afeeee palevioletred:db7093 papayawhip:ffefd5 peachpuff:ffdab9 "
  + "peru:cd853f pink:ffc0cb plum:dda0dd powderblue:b0e0e6 purple:800080 rebeccapurple:663399 red:f00 rosybrown:bc8f8f royalblue:4169e1 "
  + "saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57 seashell:fff5ee sienna:a0522d silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd "
  + "slategray:708090 slategrey:708090 snow:fffafa springgreen:00ff7f steelblue:4682b4 tan:d2b48c teal:008080 thistle:d8bfd8 tomato:ff6347 "
  + "turquoise:40e0d0 violet:ee82ee wheat:f5deb3 white:fff whitesmoke:f5f5f5 yellow:ff0 yellowgreen:9acd32").split(" ").map((pair) => pair.split(":")));

const clamp = (value, max) => Math.min(max, Math.max(0, value));
const channel = (text, max) => (text.endsWith("%") ? (clamp(parseFloat(text), 100) / 100) * max : clamp(parseFloat(text), max));

function hslToRgb(h, s, l) {
  const hue = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)];
}

/** A CSS color as { r, g, b, a } (0–255, alpha 0–1), or null when it is none of the forms read. */
export function parseColor(input) {
  let text = String(input ?? "").trim().toLowerCase();
  if (!text) return null;
  if (text === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (NAMES[text]) text = `#${NAMES[text]}`;
  const hex = /^#?([0-9a-f]{3,8})$/.exec(text);
  if (hex && [3, 4, 6, 8].includes(hex[1].length)) {
    const digits = hex[1].length <= 4 ? [...hex[1]].map((d) => d + d) : hex[1].match(/../g);
    const [r, g, b, a = "ff"] = digits.map((d) => parseInt(d, 16));
    return { r, g, b, a: (typeof a === "number" ? a : 255) / 255 };
  }
  const fn = /^(rgba?|hsla?)\(\s*([^)]*)\)$/.exec(text);
  if (!fn) return null;
  const parts = fn[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const alpha = parts[3] === undefined ? 1 : parts[3].endsWith("%") ? clamp(parseFloat(parts[3]), 100) / 100 : clamp(parseFloat(parts[3]), 1);
  if (fn[1].startsWith("rgb")) {
    const [r, g, b] = parts.slice(0, 3).map((part) => Math.round(channel(part, 255)));
    return [r, g, b, alpha].some(Number.isNaN) ? null : { r, g, b, a: alpha };
  }
  const h = (((parseFloat(parts[0]) % 360) + 360) % 360) / 360;
  const [r, g, b] = hslToRgb(h, channel(parts[1], 100) / 100, channel(parts[2], 100) / 100).map((v) => Math.round(v * 255));
  return [r, g, b, alpha].some(Number.isNaN) ? null : { r, g, b, a: alpha };
}

function toHsv({ r, g, b }) {
  const [x, y, z] = [r / 255, g / 255, b / 255];
  const max = Math.max(x, y, z);
  const min = Math.min(x, y, z);
  return { s: max === 0 ? 0 : (max - min) / max, v: max };
}

// CIEDE2000, a color with an alpha taken over white.
function toLab({ r, g, b, a = 1 }) {
  const over = (v) => 255 + (v - 255) * a;
  const linear = (v) => {
    const x = v / 255;
    return (x > 0.04045 ? ((x + 0.055) / 1.055) ** 2.4 : x / 12.92) * 100;
  };
  const [R, G, B] = [over(r), over(g), over(b)].map(linear);
  const X = 0.4124 * R + 0.3576 * G + 0.1805 * B;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = 0.0193 * R + 0.1192 * G + 0.9505 * B;
  const f = (t) => (t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(X / 95.047), f(Y / 100), f(Z / 108.883)];
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}
const rad = (d) => d * (Math.PI / 180);
const hue = (b, a) => {
  if (b === 0 && a === 0) return 0;
  const h = Math.atan2(b, a) * (180 / Math.PI);
  return h >= 0 ? h : h + 360;
};
function ciede2000(x, y) {
  const C1 = Math.sqrt(x.a ** 2 + x.b ** 2);
  const C2 = Math.sqrt(y.a ** 2 + y.b ** 2);
  const Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1 = (1 + G) * x.a;
  const a2 = (1 + G) * y.a;
  const c1 = Math.sqrt(a1 ** 2 + x.b ** 2);
  const c2 = Math.sqrt(a2 ** 2 + y.b ** 2);
  const h1 = hue(x.b, a1);
  const h2 = hue(y.b, a2);
  const dL = y.L - x.L;
  const dC = c2 - c1;
  const dh = C1 * C2 === 0 ? 0 : Math.abs(h2 - h1) <= 180 ? h2 - h1 : h2 - h1 > 180 ? h2 - h1 - 360 : h2 - h1 + 360;
  const dH = 2 * Math.sqrt(c1 * c2) * Math.sin(rad(dh) / 2);
  const Lm = (x.L + y.L) / 2;
  const cm = (c1 + c2) / 2;
  const hm = C1 * C2 === 0 ? h1 + h2 : Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2 : h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
  const T = 1 - 0.17 * Math.cos(rad(hm - 30)) + 0.24 * Math.cos(rad(2 * hm)) + 0.32 * Math.cos(rad(3 * hm + 6)) - 0.2 * Math.cos(rad(4 * hm - 63));
  const dTheta = 30 * Math.exp(-(((hm - 275) / 25) ** 2));
  const Rc = Math.sqrt(cm ** 7 / (cm ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2);
  const SC = 1 + 0.045 * cm;
  const SH = 1 + 0.015 * cm * T;
  const RT = -2 * Rc * Math.sin(rad(2 * dTheta));
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

const entries = (table, own) => [...table, [null, own]].map(([name, value]) => ({ name, ...parseColor(value) }));
const TEXT_ENTRIES = entries(TEXT, BODY_TEXT);
const BACKGROUND_ENTRIES = entries(BACKGROUND, BODY_BACKGROUND);

// Pure CSS colors straight to a text color.
const PURE = { "255,0,0": "red", "0,0,255": "blue", "255,165,0": "orange", "255,255,0": "yellow", "0,255,0": "green", "128,0,128": "purple", "255,0,255": "purple", "0,255,255": "blue" };

function nearest(color, list) {
  const lab = toLab(color);
  let best = list[0];
  let distance = Infinity;
  for (const entry of list) {
    const d = ciede2000(lab, toLab(entry));
    if (d < distance) {
      best = entry;
      distance = d;
    }
  }
  return best.name;
}

const same = (a, b) => a && b && a.r === b.r && a.g === b.g && a.b === b.b && Math.abs(a.a - b.a) < 0.01;

/** The page's text color a pasted one is: `nearest` for sources whose styles are meant, else only an exact one. */
export function textColor(css, { nearest: near = false } = {}) {
  const color = parseColor(css);
  if (!color || color.a === 0) return undefined;
  if (!near) return TEXT_ENTRIES.find((entry) => entry.name && same(entry, color))?.name;
  const { s, v } = toHsv(color);
  if (v <= 0.3) return undefined;
  if (s < 0.08) return "gray";
  if (color.a === 1 && PURE[`${color.r},${color.g},${color.b}`]) return PURE[`${color.r},${color.g},${color.b}`];
  return nearest(color, TEXT_ENTRIES) ?? undefined;
}

/** The page's background (as a color mark names it: red_background) a pasted one is, as textColor. */
export function backgroundColor(css, { nearest: near = false } = {}) {
  const color = parseColor(css);
  if (!color || color.a === 0) return undefined;
  let name;
  if (!near) name = BACKGROUND_ENTRIES.find((entry) => entry.name && same(entry, color))?.name;
  else {
    const { s, v } = toHsv(color);
    if (v <= 0.3) name = "gray";
    else if (s < 0.04) name = v > 0.96 ? undefined : "gray";
    else name = nearest(color, BACKGROUND_ENTRIES) ?? undefined;
  }
  return name ? `${name}_background` : undefined;
}
