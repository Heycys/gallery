// The emoji data (data/README.md says where each file comes from and how it is made again): the picker's
// groups (categories.json), the skin tones of the emojis that have them (skins.json), each emoji's names
// and search words in Chinese and English (keywords-zh.json, keywords-en.json: its name first, an English
// one's short codes next, between colons, then its keywords), and the Twemoji pack, cut per emoji into an
// image URL when one is shown. Loaded once, when first needed. Shared by the page editor (the page icon and
// its picker, page/emoji-picker/) and the workbench (page icons in its tree); the server reads the pack
// itself for an export (src/render/emoji.mjs). The data offers exactly the emojis the pack draws, no flag
// among them (the owner's decision). The pack's pictures show on every system; the system's emoji font only
// where the browser cannot unpack the pack or the pack lacks the emoji (a flag, or one newer than the pack).
// The custom emojis are the workspace's library (custom.mjs); the skin tone and the frequently used ones are
// kept in this browser (localStorage).

import { language } from "../i18n/index.mjs";
import { KEYS } from "../renamed-storage.mjs";
import { VARIATION_SELECTOR, codepointsOf } from "./codepoints.mjs";

const url = (name) => new URL(`./data/${name}`, import.meta.url).href;
const SKIN_KEY = KEYS.emojiSkinTone;
const FRECENCY_KEY = KEYS.emojiFrecency;

/** The six hands the skin tone is chosen with (the first, yellow, is the default). */
export const SKIN_TONE_HANDS = ["✋", "✋🏻", "✋🏼", "✋🏽", "✋🏾", "✋🏿"];
export const SKIN_TONE_VARIATIONS = SKIN_TONE_HANDS.length - 1;

// known: an emoji without its variation selectors → the emoji as the data writes it (fully qualified),
// those of the groups and their skin tones; baseOf: a skin tone → its emoji; words: an emoji's search
// words, a list for each language (searchWords); unique: every single word of them.
const state = { categories: null, skins: {}, known: new Map(), baseOf: new Map(), names: {}, words: {}, unique: {}, loaded: false, failed: false, svgIndex: null, svgPack: null };
let loading = null;

const json = (name) => fetch(url(name)).then((response) => {
  if (!response.ok) throw new Error(`${name}: ${response.status}`);
  return response.json();
});

// The vector pack: fetched once (gzip, about 1 MB) and kept as one Blob, cut per emoji. Null where
// the browser cannot unpack it (the system's font shows then).
async function loadSvgPack() {
  if (typeof DecompressionStream === "undefined") return null;
  try {
    const response = await fetch(url("twemoji-svg.bin"));
    if (!response.ok || !response.body) return null;
    return await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).blob();
  } catch {
    return null;
  }
}

// An emoji as the data knows it however it is written: without its variation selectors.
const plain = (emoji) => emoji.replaceAll(VARIATION_SELECTOR, "");
const SHORT_CODE = /^:[^:\s]+:$/;

// One language's words of an emoji as the filter is compared with them (normalizeFilter), each once:
// { words, codes }, its name first, then (English) its short codes without their colons, up to `codes`,
// then its keywords and emoticons.
function searchWords(list) {
  const words = [];
  let codes = 1;
  list.forEach((word, at) => {
    const code = at > 0 && SHORT_CODE.test(word);
    const normal = normalizeFilter(code ? word.slice(1, -1) : word);
    if (!normal || words.includes(normal)) return;
    words.push(normal);
    if (code) codes = words.length;
  });
  return { words, codes };
}

/** Loads the data once; resolves when it is in (or failed: the system's font shows then). */
export function loadEmojiData() {
  loading ??= Promise.all([
    json("categories.json"),
    json("skins.json"),
    json("keywords-zh.json"),
    json("keywords-en.json"),
    json("twemoji-index.json"),
    loadSvgPack(),
  ]).then(([categories, skins, zh, en, svgIndex, svgPack]) => {
    state.svgIndex = svgPack ? svgIndex : null;
    state.svgPack = svgPack;
    state.categories = categories;
    state.skins = skins;
    for (const emoji of Object.values(categories).flat()) {
      state.known.set(plain(emoji), emoji);
      state.names[emoji] = { zh: zh[emoji]?.[0], en: en[emoji]?.[0] };
      const lists = [searchWords(zh[emoji] || []), searchWords(en[emoji] || [])];
      state.words[emoji] = lists;
      state.unique[emoji] = [...new Set(lists.flatMap((each) => each.words).flatMap((word) => word.split(" ")))];
    }
    for (const [emoji, tones] of Object.entries(skins)) {
      for (const tone of tones) {
        state.known.set(plain(tone), tone);
        state.baseOf.set(tone, emoji);
      }
    }
    state.loaded = true;
  }, (error) => {
    console.warn("表情数据加载失败，改用系统字体", error);
    state.failed = true;
  });
  return loading;
}
export const emojiDataLoaded = () => state.loaded;
export const emojiDataFailed = () => state.failed;

/**
 * An emoji the data knows, written with or without its variation selectors: { emoji (as the data writes
 * it), codepoints, variations (its skin tones: five, or 25 whose first five are of one tone), words (its
 * search words: searchWords, Chinese and English; a skin tone's are its emoji's), uniqueWords }, or null.
 */
export function emojiInfo(emoji) {
  const known = state.known.get(plain(emoji));
  if (!known) return null;
  const base = state.baseOf.get(known) ?? known;
  return { emoji: known, codepoints: codepointsOf(known), variations: state.skins[known] || [], words: state.words[base], uniqueWords: state.unique[base] };
}
export const emojisInCategory = (category) => state.categories?.[category] || [];

const TONES = ["🏻", "🏼", "🏽", "🏾", "🏿"];
export function stripSkinTone(emoji) {
  let without = emoji;
  for (const tone of TONES) without = without.replace(tone, "");
  return without;
}
/** Its name in the UI's language (a skin tone's is its emoji's). */
export function emojiName(emoji) {
  const known = emojiInfo(emoji)?.emoji;
  return known ? state.names[state.baseOf.get(known) ?? known]?.[language === "zh" ? "zh" : "en"] : undefined;
}
export const emojiVariations = (emoji) => emojiInfo(emoji)?.variations || [];

/** A filter made lower case, underscores and hyphens as spaces, one space between words. */
export function normalizeFilter(text) {
  const normal = text.toLowerCase().replace(/_/g, " ").replace(/([a-z0-9])-$/g, "$1").replace(/-([a-z])/g, " $1").replace(/\s+/g, " ").trim();
  return normal || undefined;
}

// The vector image of an emoji: its piece of the pack as a blob: URL, made once per emoji.
const svgUrls = new Map();
export const hasEmojiSvg = (info) => Boolean(info && state.svgIndex?.[info.codepoints]);
export function svgUrlOf(codepoints) {
  const at = state.svgIndex?.[codepoints];
  if (!at) return null;
  let made = svgUrls.get(codepoints);
  if (!made) svgUrls.set(codepoints, made = URL.createObjectURL(state.svgPack.slice(at[0], at[0] + at[1], "image/svg+xml")));
  return made;
}
export const emojiSvgUrl = (info) => (info ? svgUrlOf(info.codepoints) : null);

/** Its vector image as a data: URL (kept in a page, an export of the view, without the pack), or null. */
export async function emojiSvgDataUrl(emoji) {
  const info = emojiInfo(emoji);
  const at = info && state.svgIndex?.[info.codepoints];
  if (!at) return null;
  const bytes = new Uint8Array(await state.svgPack.slice(at[0], at[0] + at[1]).arrayBuffer());
  let binary = "";
  for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

/** The standard emojis' names (their short codes, and their names in English and Chinese), loaded when first needed: a custom emoji's name must not take one. */
let names = null;
export const loadEmojiNames = () => (names ??= json("names.json"));

// A random one: a group of activities, objects or places, then one of it (a face or a symbol would rarely suit a page).
const pickOne = (list) => list[Math.floor(Math.random() * list.length)];
export const RANDOM_GROUPS = ["activities", "objects", "travel"];
export const randomEmoji = () => pickOne(emojisInCategory(pickOne(RANDOM_GROUPS)));

// ---------- the skin tone ----------

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {} // a private window: for this session only
}
let skinTone = (() => {
  const value = readStorage(SKIN_KEY);
  return value === null ? undefined : Number(value);
})();
export const getSkinTone = () => skinTone;
export function setSkinTone(tone) {
  skinTone = tone;
  writeStorage(SKIN_KEY, String(tone));
}
/** An emoji in the chosen skin tone: of one with skin tones, the one of that tone (two people or hands both of it). */
export function withSkinTone(emoji) {
  if (skinTone === undefined || skinTone === 0) return emoji;
  return emojiInfo(emoji)?.variations[skinTone - 1] ?? emoji;
}
const frecencyKey = (emoji) => (skinTone === undefined ? emoji : stripSkinTone(emoji));

// ---------- the frequently used ones (frecency: a use counts, halving every week; 100 kept at most) ----------

let frecency = (() => {
  try {
    return JSON.parse(readStorage(FRECENCY_KEY) || "{}");
  } catch {
    return {};
  }
})();
export function recordEmojiUse(emoji) {
  const now = Date.now();
  let map = { ...frecency };
  for (const key in map) {
    const { f, u } = map[key];
    map[key] = { f: f === undefined || u === undefined ? 0 : Math.round(f * Math.pow(0.5, (now - u) / 6048e5)), u };
  }
  const key = frecencyKey(emoji);
  map[key] = key in map ? { f: map[key].f + 1, u: now } : { f: 1, u: now };
  if (Object.keys(map).length > 100) {
    map = Object.fromEntries(Object.entries(map).sort((a, b) => (a[1].f !== b[1].f ? b[1].f - a[1].f : b[1].u - a[1].u)).slice(0, 100));
  }
  frecency = map;
  writeStorage(FRECENCY_KEY, JSON.stringify(map));
}
/** The recently used: by count, then by the last use, two rows of them; `keep`: those still known (a flag used before, taken out since, no longer shows). */
export function recentEmojis(perRow, keep = () => true) {
  return Object.keys(frecency).filter(keep).sort((a, b) => (frecency[b].f !== frecency[a].f ? frecency[b].f - frecency[a].f : frecency[b].u - frecency[a].u)).slice(0, 2 * perRow);
}
export const frecencyBoost = (emoji) => (frecency[emoji] ? 100 * frecency[emoji].f : 0);
