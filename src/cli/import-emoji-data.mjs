// Makes the emoji picker's data (src/shared/emoji/data/): the emojis it offers, in which of its groups,
// their skin tones, their names and search words in Chinese and English, and the names a custom emoji may
// not take. Its source is emojibase-data, one pinned version of the npm package (MIT, © Miles Johnson:
// LICENSE-emojibase.txt), whose names and keywords are the Unicode CLDR annotations (under the Unicode
// License v3: LICENSE-unicode.txt) and whose short codes are those of Slack (iamcal) and GitHub. The
// package is read as npm pack makes it, from a folder of the cache, never from the tracked tree:
//
//   npm pack emojibase-data@18.0.0 --pack-destination node_modules/.cache/emoji-sources
//   node src/cli/import-emoji-data.mjs            writes the files below
//   node src/cli/import-emoji-data.mjs --check    writes nothing: says whether they are what the source makes
//
// What is offered is what Gallery draws: an emoji with a picture in twemoji-index.json (the Twemoji pack,
// which this leaves as it is). Left out: the source's Component group (a skin tone or a hair style alone),
// its Flags group (the owner's decision: Gallery offers no flag) and its regional indicators (the letters
// flags are made of), and an emoji or a skin tone the pack has no picture of (one newer than the pack). A
// picture the source names no emoji for is said, and nothing offers it.
//
//   categories.json     the picker's groups, in the Unicode order, each its emojis in the Unicode order:
//                       people (the Unicode groups Smileys & Emotion and People & Body), nature, food,
//                       travel, activities, objects, symbols
//   skins.json          the skin tones of an emoji that has them: five, light to dark; or 25, for two people
//                       or two hands each of a tone, the five of one tone first (light to dark), then the
//                       mixed ones (by the first's tone, then the second's)
//   keywords-zh.json    an emoji's Chinese words: its name (the CLDR label), then the CLDR keywords
//   keywords-en.json    its English words: its name, its short codes between colons (Slack's, then GitHub's
//                       others), the CLDR keywords, its emoticons
//   names.json          each short code (without its colons) and each name in either language, in lower case
//                       as a custom emoji's name is written (OK手势 as ok手势) → its emoji: a custom emoji takes
//                       none of them
//   LICENSE-emojibase.txt  the package's licence
//
// Each file holds an emoji the way the source writes it: fully qualified, as emoji-test.txt has it. The
// readers find an emoji written with or without its variation selectors (src/shared/emoji/data.mjs).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { codepointsOf } from "../shared/emoji/codepoints.mjs";
import { projectRoot } from "../shared/paths.mjs";

/** The source, pinned. */
export const SOURCE = { name: "emojibase-data", version: "18.0.0" };
/** Where npm pack puts it (outside the tracked tree). */
export const CACHE = path.join(projectRoot, "node_modules", ".cache", "emoji-sources");
const DATA = path.join(projectRoot, "src", "shared", "emoji", "data");
const TARBALL = `${SOURCE.name}-${SOURCE.version}.tgz`;
export const FETCH = `npm pack ${SOURCE.name}@${SOURCE.version} --pack-destination ${path.relative(projectRoot, CACHE).split(path.sep).join("/")}`;

// The source's groups (meta/groups.json) → the picker's: Smileys & Emotion and People & Body share one, 笑脸与人物.
const GROUPS = { 0: "people", 1: "people", 3: "nature", 4: "food", 5: "travel", 6: "activities", 7: "objects", 8: "symbols" };
const LEFT_OUT = { 2: "component", 9: "flags" };

// The files of a .tgz npm pack made (ustar, a pax header's path where a name is long), by their path.
function untar(file) {
  const tar = zlib.gunzipSync(fs.readFileSync(file));
  const files = new Map();
  let longName = null;
  for (let at = 0; at + 512 <= tar.length;) {
    const header = tar.subarray(at, at + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start, length) => header.toString("utf8", start, start + length).replace(/\0[\s\S]*$/, "");
    const size = parseInt(field(124, 12).trim() || "0", 8);
    const type = field(156, 1);
    const body = tar.subarray(at + 512, at + 512 + size);
    const prefix = field(257, 6).startsWith("ustar") ? field(345, 155) : "";
    const name = longName ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100));
    longName = null;
    if (type === "x") longName = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body.toString("utf8"))?.[1] ?? null;
    else if (type === "0" || type === "") files.set(name, body);
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

/** The pinned package's files this reads, or null when the cache has no copy of it. */
export function readSource(cache = CACHE) {
  const file = path.join(cache, TARBALL);
  if (!fs.existsSync(file)) return null;
  const files = untar(file);
  const read = (name) => {
    const body = files.get(`package/${name}`);
    if (!body) throw new Error(`${TARBALL} has no ${name}`);
    return body.toString("utf8");
  };
  const json = (name) => JSON.parse(read(name));
  const { version } = json("package.json");
  if (version !== SOURCE.version) throw new Error(`${TARBALL} is version ${version}, not ${SOURCE.version}`);
  return {
    en: json("en/data.json"),
    zh: json("zh/data.json"),
    slack: json("en/shortcodes/iamcal.json"),
    github: json("en/shortcodes/github.json"),
    licence: read("LICENSE"),
  };
}

const list = (value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]);
const once = (words) => [...new Set(words.filter(Boolean))];
// A JSON object, one entry a line (a regenerated file's change reads by emoji).
const lines = (object) => `{\n${Object.entries(object).map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`).join(",\n")}\n}\n`;

/**
 * The data files the source makes for the pictures `index` has (twemoji-index.json): { files: { name: text },
 * notes: [what was left out, said] }.
 */
export function makeEmojiData(source, index) {
  const drawn = new Set(Object.keys(index));
  const used = new Set();
  const zh = new Map(source.zh.map((entry) => [entry.hexcode, entry]));
  const categories = Object.fromEntries([...new Set(Object.values(GROUPS))].map((id) => [id, []]));
  const skins = {}, keywordsZh = {}, keywordsEn = {}, names = {};
  const unpictured = [], tonesUnpictured = [];
  const ordered = [...source.en].filter((entry) => entry.group !== undefined).sort((a, b) => a.order - b.order);
  for (const entry of ordered) {
    if (LEFT_OUT[entry.group]) continue;
    const category = GROUPS[entry.group];
    if (!category) throw new Error(`${entry.emoji}: group ${entry.group} is none the picker knows`);
    const codepoints = codepointsOf(entry.emoji);
    if (!drawn.has(codepoints)) {
      unpictured.push(entry.emoji);
      continue;
    }
    used.add(codepoints);
    const chinese = zh.get(entry.hexcode);
    if (!chinese?.label) throw new Error(`${entry.emoji}: no Chinese name in the source`);
    categories[category].push(entry.emoji);
    // Its skin tones the pack draws: all of them or none (the picker offers five, or 25).
    const tones = (entry.skins ?? []).filter((skin) => {
      if (drawn.has(codepointsOf(skin.emoji))) return true;
      if (!tonesUnpictured.includes(entry.emoji)) tonesUnpictured.push(entry.emoji);
      return false;
    });
    if (tones.length) {
      if (tones.length !== entry.skins.length || ![5, 25].includes(tones.length)) throw new Error(`${entry.emoji}: the pack draws ${tones.length} of its ${entry.skins.length} skin tones`);
      const pair = (skin) => list(skin.tone);
      const same = (skin) => new Set(pair(skin)).size === 1;
      const sorted = [...tones].sort((a, b) => Number(same(b)) - Number(same(a)) || pair(a)[0] - pair(b)[0] || (pair(a)[1] ?? 0) - (pair(b)[1] ?? 0));
      if (sorted.filter(same).length !== 5) throw new Error(`${entry.emoji}: no five skin tones of one tone`);
      skins[entry.emoji] = sorted.map((skin) => skin.emoji);
      for (const skin of sorted) used.add(codepointsOf(skin.emoji));
    }
    const shortcodes = once([...list(source.slack[entry.hexcode]), ...list(source.github[entry.hexcode])]);
    keywordsZh[entry.emoji] = once([chinese.label, ...(chinese.tags ?? [])]);
    keywordsEn[entry.emoji] = once([entry.label, ...shortcodes.map((code) => `:${code}:`), ...(entry.tags ?? []), ...list(entry.emoticon)]);
    for (const name of [...shortcodes, entry.label, chinese.label].map((each) => each.toLocaleLowerCase())) if (!Object.hasOwn(names, name)) names[name] = entry.emoji;
  }
  const orphans = [...drawn].filter((codepoints) => !used.has(codepoints));
  const notes = [];
  if (unpictured.length) notes.push(`${unpictured.length} emojis of the source with no picture in the pack, not offered: ${unpictured.join(" ")}`);
  if (tonesUnpictured.length) notes.push(`${tonesUnpictured.length} emojis whose skin tones the pack has no picture of, offered without them: ${tonesUnpictured.join(" ")}`);
  if (orphans.length) notes.push(`${orphans.length} pictures of the pack that no emoji of the source is, offered by nothing: ${orphans.join(" ")}`);
  return {
    files: {
      "categories.json": lines(categories),
      "skins.json": lines(skins),
      "keywords-zh.json": lines(keywordsZh),
      "keywords-en.json": lines(keywordsEn),
      "names.json": lines(names),
      "LICENSE-emojibase.txt": `${source.licence.replace(/\r\n/g, "\n").trim()}\n`,
    },
    notes,
    counts: { emojis: Object.values(categories).flat().length, skins: Object.values(skins).flat().length, names: Object.keys(names).length },
  };
}

/** The files as they are now, and as the source makes them: { made, differing: [name] }, or null without the source. */
export function compareEmojiData(cache = CACHE) {
  const source = readSource(cache);
  if (!source) return null;
  const made = makeEmojiData(source, JSON.parse(fs.readFileSync(path.join(DATA, "twemoji-index.json"), "utf8")));
  const differing = Object.entries(made.files).filter(([name, text]) => {
    const file = path.join(DATA, name);
    return !fs.existsSync(file) || fs.readFileSync(file, "utf8") !== text;
  }).map(([name]) => name);
  return { made, differing };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const compared = compareEmojiData();
  if (!compared) {
    console.error(`No ${TARBALL} in ${CACHE}. Fetch it first (with the network's proxy if it needs one):\n  ${FETCH}`);
    process.exit(1);
  }
  const { made, differing } = compared;
  for (const note of made.notes) console.log(note);
  if (check) {
    console.log(differing.length ? `Not what ${SOURCE.name} ${SOURCE.version} makes: ${differing.join(", ")} (node src/cli/import-emoji-data.mjs writes them)` : `src/shared/emoji/data/ is what ${SOURCE.name} ${SOURCE.version} makes.`);
    process.exit(differing.length ? 1 : 0);
  }
  for (const [name, text] of Object.entries(made.files)) fs.writeFileSync(path.join(DATA, name), text);
  console.log(`${made.counts.emojis} emojis (${made.counts.skins} skin tones, ${made.counts.names} names) from ${SOURCE.name} ${SOURCE.version}, written to src/shared/emoji/data/${differing.length ? ` (changed: ${differing.join(", ")})` : " (unchanged)"}`);
}
