import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { createMediaStore } from "../../src/editor/media-store.mjs";
import { compareEmojiData, FETCH as EMOJI_SOURCE_FETCH } from "../../src/cli/import-emoji-data.mjs";
import { rank } from "../../src/editor/page/emoji-picker/emoji-search.mjs";
import { embedIcon, embedTabIcons, emojiDataUrl, iconImage, pageIconValue } from "../../src/render/emoji.mjs";
import { quickFailures } from "../../src/render/pipeline.mjs";
import { ICON_COLORS, ICON_COLOR_VALUES, TAB_ICON, glyphOf, glyphValue, iconKind, iconMarkup, iconUrl, iconValueOf, tabIconValue } from "../../src/shared/emoji/icon-value.mjs";
import { ICON_COLOR_BY_THEME, allPairs, glyphCategories, glyphSVG, glyphSVGOf, glyphSetOf, loadGlyphs, onlySetOf, pairOf, pairOfValue, pairValue, searchGlyphs } from "../../src/shared/emoji/glyphs.mjs";
import { codepointsOf, withoutSelectors } from "../../src/shared/emoji/codepoints.mjs";
import * as emojis from "../../src/shared/emoji/data.mjs";
import { EVERYDAY_EMOJIS } from "../../src/shared/emoji/everyday.mjs";
import EN from "../../src/shared/i18n/en.mjs";
import { language } from "../../src/shared/i18n/index.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";

// The preview names a file of the folder by its stamp (render/media-ref.mjs servedUrl: tests/unit/written-files.mjs);
// left out where what is checked is the address.
const unstamped = (html) => html.replace(new RegExp("[?]v=[0-9a-f]{12}", "g"), "");

// The page's icon (components/icon/, docs/quick-reference.md): its three kinds of value and
// their markup, the 图标 tab's icons (shared/emoji/glyphs.mjs: their data, categories, the numbers
// Tabler has alone, search), the pictures the preview, a build and an export show them as (render/emoji.mjs),
// the images the workbench gets by value, the check of a report's icon, and the images kept in a
// report's folder and the emoji library (editor/media-store.mjs).

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "report-icons-"));
await fs.mkdir(path.join(root, "alpha", "assets"), { recursive: true });
await fs.writeFile(path.join(root, "alpha", "report.html"), "<main></main>");
await fs.writeFile(path.join(root, "alpha", "report.json"), "{}");
await fs.writeFile(path.join(root, "alpha", "assets", "icon-0123456789ab.png"), PNG);

// Values: an emoji, an icon of a set in one of the colors (MingCute's, the default, or Tabler's), an
// image of the report's folder; nothing else.
assert.deepEqual(["🎯", "⏱️", "🇨🇳", "1️⃣", "/icons/airplane_blue.svg", "/icons/tabler/plane_red.svg", "assets/icon-0123456789ab.png"].map(iconKind), ["emoji", "emoji", "emoji", "emoji", "glyph", "glyph", "image"]);
assert.deepEqual([glyphOf("/icons/alarm-1_blue.svg"), glyphOf("/icons/tabler/alarm_gray.svg")], [{ set: "mingcute", name: "alarm-1", color: "blue" }, { set: "tabler", name: "alarm", color: "gray" }]);
assert.deepEqual([glyphValue("mingcute", "alarm-1", "blue"), glyphValue("tabler", "alarm", "gray")], ["/icons/alarm-1_blue.svg", "/icons/tabler/alarm_gray.svg"]);
for (const bad of ["", "abc", "<b>🎯</b>", "🎯 x", "/icons/airplane_teal.svg", "/icons/mingcute/airplane_blue.svg", "/icons/../x_blue.svg", "assets/../x.png", "assets/x.exe", "https://example.com/x.png", "data:image/png;base64,AA=="]) assert.equal(iconKind(bad), null, bad);
for (const value of ["🎯", "/icons/airplane_blue.svg", "/icons/tabler/plane_red.svg", "assets/icon-0123456789ab.png"]) assert.equal(iconValueOf(iconMarkup(value, ' data-block-id="a1b2c3d4"')), value);
assert.equal(iconMarkup("/icons/airplane_blue.svg"), '<div class="doc-icon" data-icon="/icons/airplane_blue.svg"></div>');

// The ten icon colors are one table (icon-value.mjs). The picker's (glyphs.mjs) is that table
// by theme, the browser tab's icon and the glyphs' drawing read it, and the two stylesheets that write it
// as CSS (the kit's page.css, the workbench's base.css) hold the same values for every color, light and dark.
{
  assert.deepEqual(ICON_COLORS, ["gray", "lightgray", "brown", "yellow", "orange", "green", "blue", "purple", "pink", "red"]);
  for (const color of ICON_COLORS) assert.deepEqual([ICON_COLOR_BY_THEME.light[color], ICON_COLOR_BY_THEME.dark[color]], ICON_COLOR_VALUES[color], color);
  const rules = async (file, selector) => Object.fromEntries((await fs.readFile(path.join(projectRoot, file), "utf8")).split("\n")
    .filter((line) => line.startsWith(`${selector}[data-icon$="_`))
    .map((line) => /_([a-z]+)\.svg"\] \{ color: light-dark\((#[0-9a-fA-F]{6}), (#[0-9a-fA-F]{6})\); \}/.exec(line))
    .map((match) => [match[1], [match[2], match[3]]]));
  for (const [file, selector] of [["src/render/kit/styles/page.css", ".doc-icon"], ["src/workbench/app/styles/base.css", ".glyph-icon"]]) {
    const written = await rules(file, selector);
    assert.deepEqual(Object.keys(written), ICON_COLORS, `${file} has a rule for each color, in order`);
    for (const color of ICON_COLORS) assert.deepEqual(written[color].map((value) => value.toUpperCase()), ICON_COLOR_VALUES[color].map((value) => value.toUpperCase()), `${file}: ${color}`);
  }
  // An icon drawn in a color takes it from the table (the picker's swatches and the icon's fill).
  const data = JSON.parse(await fs.readFile(path.join(projectRoot, "src/shared/emoji/data/icons.json"), "utf8"));
  const fetched = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => data });
  await loadGlyphs();
  globalThis.fetch = fetched;
  assert.ok(glyphSVG(pairOf("airplane"), "mingcute", "orange", "light").includes(`fill="${ICON_COLOR_VALUES.orange[0]}"`));
  assert.ok(glyphSVG(pairOf("airplane"), "tabler", "blue", "dark").includes(`fill="${ICON_COLOR_VALUES.blue[1]}"`));
  assert.deepEqual(Object.keys(data), ["sets", "categories", "icons"], "the data holds no table of colors of its own");
  // 443 pairs, each a thing both sets have one icon for, and Tabler's 40 numbers (no MingCute twin:
  // null): every name once in its set, each drawn on the 24-unit view in #COLOR alone (paths, no
  // ids); a value of either set finds its pair.
  assert.equal(allPairs().length, 483);
  const numbers = data.icons.filter((icon) => icon[1] === null);
  assert.equal(numbers.length, 40);
  assert.ok(numbers.every((icon) => icon[3] === null && /^(circle|square|square-rounded|hexagon)-number-\d$/.test(icon[2])), "the numbers are Tabler's alone");
  for (const at of [1, 2]) {
    const names = data.icons.map((icon) => icon[at]).filter(Boolean);
    assert.equal(new Set(names).size, names.length, `each name once in set ${at}`);
  }
  for (const [label, , , ...svgs] of data.icons) {
    assert.ok(label, "a Chinese name");
    for (const svg of svgs.slice(0, 2).filter(Boolean)) assert.ok(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 24 24" fill="#COLOR">/.test(svg) && !/currentColor|\bid=|url\(/.test(svg), label);
  }
  assert.equal(pairOfValue("/icons/tabler/plane_red.svg"), pairOf("airplane"));
  assert.match(glyphSVGOf("/icons/tabler/plane_red.svg"), /fill="currentColor"/);
  // 12 categories (the tab's groups), each with a title in English too (the tab's CATEGORY_TITLES
  // t() them); the icons in their order, a category's numbers after its pairs (数字与符号's).
  assert.equal(data.categories.length, 12);
  assert.equal(glyphCategories().join(), data.categories.join());
  for (const name of data.categories) assert.ok(EN[name], `${name} has its English`);
  const tabSource = await fs.readFile(path.join(projectRoot, "src/editor/page/emoji-picker/icon-tab.mjs"), "utf8");
  for (const name of data.categories) assert.ok(tabSource.includes(`${name}: t("${name}")`), `${name}: the tab titles it through t()`);
  assert.deepEqual(data.icons.map((icon) => icon[5]), data.icons.map((icon) => icon[5]).toSorted((a, b) => a - b), "by category");
  assert.ok(numbers.every((icon) => data.categories[icon[5]] === "数字与符号") && data.icons.findIndex((icon) => icon[1] === null) === data.icons.findLastIndex((icon) => icon[5] === 0) - 39, "the numbers last in 数字与符号");
  assert.ok(allPairs().every((pair) => data.categories.includes(pair.category) && Array.isArray(pair.words)));
  // A number is Tabler's whichever set the tab shows: drawn as Tabler's, its value Tabler's; MingCute has none.
  const three = pairOf("tabler/circle-number-3");
  assert.equal(three?.label, "数字 3 · 圆形");
  assert.equal(onlySetOf(three), "tabler");
  assert.equal(onlySetOf(pairOf("airplane")), null);
  assert.equal(glyphSetOf(three, "mingcute"), "tabler");
  assert.equal(glyphSVG(three, "mingcute", "blue", "light"), glyphSVG(three, "tabler", "blue", "light"));
  assert.equal(pairValue(three, "mingcute", "blue"), "/icons/tabler/circle-number-3_blue.svg");
  assert.equal(pairValue(pairOf("airplane"), "mingcute", "blue"), "/icons/airplane_blue.svg");
  assert.equal(pairValue(pairOf("airplane"), "tabler", "blue"), "/icons/tabler/plane_blue.svg");
  assert.equal(pairOfValue("/icons/tabler/circle-number-3_blue.svg"), three);
  assert.equal(pairOfValue("/icons/circle-number-3_blue.svg"), undefined);
  assert.match(glyphSVGOf("/icons/tabler/circle-number-3_blue.svg"), /fill="currentColor"/);
  // Search: a Chinese name, either set's name or a word of it, a search word (English; the numbers'
  // Chinese; a pair's earlier name); the numbers found by 数字, a digit, number, their names.
  assert.equal(searchGlyphs("飞机")[0], "airplane");
  assert.equal(searchGlyphs("plane")[0], "airplane");
  assert.ok(searchGlyphs("arrow").length > 10);
  assert.ok(searchGlyphs("aeroplane").includes("airplane"), "a search word");
  assert.equal(searchGlyphs("抖音")[0], "tiktok", "a name the pair had before");
  assert.deepEqual(searchGlyphs("数字").slice(0, 40).toSorted(), numbers.map((icon) => `tabler/${icon[2]}`).toSorted(), "数字: the numbers first");
  assert.ok(searchGlyphs("3").slice(0, 4).every((key) => /^tabler\/[a-z-]+-number-3$/.test(key)), "a digit: its numbers first");
  assert.equal(searchGlyphs("数字 3 · 圆形")[0], "tabler/circle-number-3");
  assert.equal(searchGlyphs("circle-number-3")[0], "tabler/circle-number-3");
  assert.ok(numbers.every((icon) => searchGlyphs("number").includes(`tabler/${icon[2]}`)), "number");
  assert.ok(searchGlyphs("六边形").includes("tabler/hexagon-number-0") && searchGlyphs("六边形").includes("hexagon"), "a shape's name");
  assert.deepEqual(searchGlyphs(""), []);
  assert.ok(allPairs().some((pair) => pair.words.some((word) => word.includes("ight"))) && searchGlyphs("ight").length === 0, "an English filter is no match inside a word (light, right)");
}

// A Sheet tab's emoji is drawn through one property, --doc-tab-icon, whose value the server (the preview's
// image, an export's data: URL) and the editor's pills write by one function; a tab that has it, or whose
// value is no emoji, is left as it is.
{
  const tab = (attributes) => `<div><button class="doc-sheet-tab" ${attributes}>A</button></div>`;
  assert.equal(TAB_ICON, "--doc-tab-icon");
  assert.equal(embedTabIcons(tab('data-tab-icon="🎯"'), { mode: "preview" }), tab(`data-tab-icon="🎯" style="${TAB_ICON}: ${tabIconValue(iconUrl("🎯"))}"`));
  assert.ok(embedTabIcons(tab('data-tab-icon="🎯" style="color: red"')).includes(`style="color: red; ${TAB_ICON}: url('data:image/svg+xml;base64,`));
  for (const same of [tab('data-tab-icon="abc"'), tab(`data-tab-icon="🎯" style="${TAB_ICON}: url('x')"`), tab("")]) assert.equal(embedTabIcons(same), same);
}

// Shown as a picture from the start: the emoji's Twemoji image, the icon's SVG in the color
// of its element (the kit's), the image where the server serves it (preview) or inside the file
// (export). The preview says the value (data-ge-icon); one whose image is missing stays as written.
const page = (icon) => `<header class="doc-header">${icon}<h1 class="doc-title">T</h1></header>`;
const shown = (icon, mode) => embedIcon(page(icon), { slug: "alpha", mode, reportsDirectory: root }).match(/<div class="doc-icon"[^>]*>[\s\S]*?<\/div>/)[0];
assert.match(shown('<div class="doc-icon">🎯</div>', "export"), /^<div class="doc-icon"><img alt="🎯" src="data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+"><\/div>$/);
assert.match(shown('<div class="doc-icon" data-block-id="a1b2c3d4">🎯</div>', "preview"), /^<div class="doc-icon" data-block-id="a1b2c3d4" data-ge-icon="🎯"><img alt="🎯" src="data:image\/svg\+xml;base64,/);
assert.match(shown('<div class="doc-icon" data-icon="/icons/airplane_blue.svg"></div>', "export"), /^<div class="doc-icon" data-icon="\/icons\/airplane_blue.svg"><svg aria-hidden="true" [^>]*fill="currentColor"/);
assert.match(shown('<div class="doc-icon" data-icon="/icons/tabler/plane_blue.svg"></div>', "export"), /^<div class="doc-icon" data-icon="\/icons\/tabler\/plane_blue.svg"><svg aria-hidden="true" [^>]*fill="currentColor"/);
assert.match(shown('<div class="doc-icon" data-icon="/icons/tabler/hexagon-number-7_red.svg"></div>', "export"), /^<div class="doc-icon" data-icon="\/icons\/tabler\/hexagon-number-7_red.svg"><svg aria-hidden="true" [^>]*fill="currentColor"/, "a number (Tabler's alone) too");
assert.equal(unstamped(shown('<div class="doc-icon"><img src="assets/icon-0123456789ab.png" alt=""></div>', "preview")), '<div class="doc-icon" data-ge-icon="assets/icon-0123456789ab.png"><img src="/__gallery/edit/asset/alpha/assets/icon-0123456789ab.png" alt=""></div>');
assert.equal(shown('<div class="doc-icon"><img src="assets/icon-0123456789ab.png" alt=""></div>', "export"), `<div class="doc-icon"><img src="data:image/png;base64,${PNG.toString("base64")}" alt=""></div>`);
assert.equal(shown('<div class="doc-icon"><img src="assets/icon-ffffffffffff.png" alt=""></div>', "export"), '<div class="doc-icon"><img src="assets/icon-ffffffffffff.png" alt=""></div>');
const once = embedIcon(page('<div class="doc-icon">🎯</div>'), { slug: "alpha", reportsDirectory: root });
assert.equal(embedIcon(once, { slug: "alpha", reportsDirectory: root }), once, "an embedded icon is left as it is");
assert.equal(embedIcon(page(""), { slug: "alpha", reportsDirectory: root }), page(""));

// The emoji data (src/shared/emoji/data/README.md), made by src/cli/import-emoji-data.mjs from emojibase-data
// 18.0.0 for exactly the emojis the Twemoji pack draws. Every emoji offered has its picture, one group, and a
// name in both languages; every skin tone its picture; the offered emojis and their skin tones are the pack's
// pictures, no more and no fewer. No flag anywhere (the owner's decision): a flag a document holds is still an
// icon, left as its character on the page (the system's font) and drawn so by the icon route, never a broken
// picture. The pack's pieces tile it.
{
  const folder = path.join(projectRoot, "src/shared/emoji/data");
  const data = (name) => JSON.parse(readFileSync(path.join(folder, name), "utf8"));
  const FLAG = /\p{Regional_Indicator}|[\u{E0020}-\u{E007F}]|^(?:🏁|🚩|🎌|🏴|🏳)/u;
  const categories = data("categories.json"), skins = data("skins.json"), zh = data("keywords-zh.json"), en = data("keywords-en.json"), names = data("names.json"), index = data("twemoji-index.json");
  // The picker's groups, in the Unicode order (emoji-tab.mjs GROUPS, whose bar the scenario emojiPicker reads).
  assert.deepEqual(Object.keys(categories), ["people", "nature", "food", "travel", "activities", "objects", "symbols"]);
  const offered = Object.values(categories).flat();
  const tones = Object.values(skins).flat();
  // The same 1574 emojis and 1500 skin tones as the pack was made for (its pictures, Emoji 14.0's but the flags'):
  // the counts are pinned so a new source or pack is a decision, not a drift.
  assert.deepEqual([offered.length, new Set(offered).size, tones.length], [1574, 1574, 1500]);
  for (const emoji of offered) {
    assert.ok(index[codepointsOf(emoji)], `${emoji}: its picture`);
    assert.ok(zh[emoji]?.[0] && en[emoji]?.[0], `${emoji}: a name in Chinese and in English`);
  }
  assert.deepEqual([Object.keys(zh), Object.keys(en)], [offered, offered], "the words of each emoji offered, no other, in its order");
  for (const [emoji, variations] of Object.entries(skins)) {
    assert.ok(offered.includes(emoji) && [5, 25].includes(variations.length), `${emoji}: five skin tones, or 25`);
    assert.deepEqual(variations.slice(0, 5).map((tone) => [...new Set(tone.match(/[\u{1F3FB}-\u{1F3FF}]/gu))]), [["🏻"], ["🏼"], ["🏽"], ["🏾"], ["🏿"]], `${emoji}: the five of one tone first, light to dark`);
    for (const tone of variations) assert.ok(index[codepointsOf(tone)], `${tone}: its picture`);
  }
  assert.deepEqual([...offered, ...tones].map(codepointsOf).sort(), Object.keys(index).sort(), "the pack's pictures are the emojis offered and their skin tones");
  const plain = [...offered, ...tones].map((emoji) => withoutSelectors(codepointsOf(emoji)));
  assert.equal(new Set(plain).size, plain.length, "an emoji is one, written with or without its variation selectors");
  assert.ok(Object.values(names).every((emoji) => offered.includes(emoji)) && names.fire === "🔥" && names["火焰"] === "🔥" && names["thumbsup"] === "👍", "names.json: short codes and both names of the emojis offered");
  assert.ok(Object.keys(names).every((name) => name === name.toLocaleLowerCase()) && names["ok手势"] && names["t恤"], "names.json: in lower case, as a custom emoji's name is written (OK手势 is taken as ok手势)");
  for (const [name, keys] of [["categories", offered], ["skins", tones], ["keywords-en", Object.keys(en)], ["keywords-zh", Object.keys(zh)], ["names", Object.values(names)]]) {
    assert.deepEqual(keys.filter((key) => FLAG.test(key)), [], `${name}: no flag`);
  }
  assert.deepEqual(Object.keys(index).filter((key) => /^(1f1e[6-9a-f]|1f1f[0-9a-f]|1f3c1|1f6a9|1f38c|1f3f3|1f3f4)(-|$)/.test(key)), [], "the pack: no flag");
  const unpacked = zlib.gunzipSync(readFileSync(path.join(folder, "twemoji-svg.bin")));
  const pieces = Object.values(index).sort((a, b) => a[0] - b[0]);
  assert.ok(pieces.every(([at], i) => at === (i ? pieces[i - 1][0] + pieces[i - 1][1] : 0)) && pieces.at(-1)[0] + pieces.at(-1)[1] === unpacked.length, "the pack's pieces tile it");
  assert.equal(emojiDataUrl("🇨🇳"), null);
  assert.equal(shown('<div class="doc-icon">🇨🇳</div>', "export"), '<div class="doc-icon">🇨🇳</div>', "left as its character: the kit's emoji font");
  assert.match(String(iconImage({ value: "🇨🇳" }).body), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 36 36"><text [^>]*font-family="'Apple Color Emoji'[^>]*>🇨🇳<\/text><\/svg>$/);
  assert.equal(iconImage({ value: "🇨🇳" }).type, "image/svg+xml");
  // A document holds an emoji's character, never a name or a place in a file: written with or without its
  // variation selector (☺ and ☺️, ❤ and ❤️), as an older document or another program wrote it, it is the same picture.
  for (const [written, qualified] of [["☺", "☺️"], ["❤", "❤️"], ["👁‍🗨", "👁️‍🗨️"], ["⛹‍♂", "⛹️‍♂️"], ["👍🏽", "👍🏽"]]) {
    assert.ok(emojiDataUrl(written) && emojiDataUrl(written) === emojiDataUrl(qualified), `${written}: the picture of ${qualified}`);
  }
  // 推荐, the group a highlight block or a flow step opens with (emoji-tab.mjs CALLOUT_EMOJIS): two rows of 12, each an
  // emoji offered, as the data writes it.
  const suggested = [...readFileSync(path.join(projectRoot, "src/editor/page/emoji-picker/emoji-tab.mjs"), "utf8").match(/const CALLOUT_EMOJIS = \[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.ok(suggested.length === 24 && new Set(suggested).size === 24, "推荐: 24 emojis, each once");
  for (const emoji of suggested) assert.ok(offered.includes(emoji), `推荐: ${emoji} offered, written as the data writes it`);
  // Gallery's own list of the emojis people use every day (shared/emoji/everyday.mjs, the search's last ties): a few
  // hundred, each offered as the data writes it, once.
  assert.ok(EVERYDAY_EMOJIS.length >= 200 && EVERYDAY_EMOJIS.length <= 400, "the everyday emojis: a few hundred");
  assert.equal(new Set(EVERYDAY_EMOJIS).size, EVERYDAY_EMOJIS.length, "the everyday emojis: each once");
  for (const emoji of EVERYDAY_EMOJIS) assert.ok(offered.includes(emoji), `everyday: ${emoji} offered, written as the data writes it`);
  assert.equal(readdirSync(folder).includes("positions.json"), false, "no sprite-sheet places (nothing read them)");
  for (const licence of ["LICENSE-emojibase.txt", "LICENSE-unicode.txt"]) assert.match(readFileSync(path.join(folder, licence), "utf8"), /Permission is hereby granted, free of charge/, licence);

  // The files are what the generator makes of its pinned source (with the source in the cache: npm pack, as
  // src/cli/import-emoji-data.mjs says; without it, said and not compared).
  const compared = compareEmojiData();
  if (compared) assert.deepEqual(compared.differing, [], "src/shared/emoji/data/ is what node src/cli/import-emoji-data.mjs makes (run it)");
  else console.log(`(the emoji data not compared with its source: none in the cache; ${EMOJI_SOURCE_FETCH})`);
}

// The data as the editor reads it (shared/emoji/data.mjs), and the picker's search (emoji-search.mjs) on it: the
// best match first for words in Chinese and English; between equal ones an English name holding the word, then the
// data's order (the picker's sort keeps it).
{
  const fetched = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const body = readFileSync(fileURLToPath(url));
    return { ok: true, json: async () => JSON.parse(body.toString("utf8")), body: null };
  };
  await emojis.loadEmojiData();
  globalThis.fetch = fetched;
  assert.ok(emojis.emojiDataLoaded() && !emojis.emojiDataFailed());
  assert.deepEqual([emojis.emojiInfo("☺")?.emoji, emojis.emojiInfo("☺️")?.codepoints, emojis.emojiInfo("🇨🇳")], ["☺️", "263a-fe0f", null], "found with or without its selector; a flag is none");
  assert.deepEqual(emojis.emojiVariations("👍"), ["👍🏻", "👍🏼", "👍🏽", "👍🏾", "👍🏿"]);
  assert.deepEqual(emojis.emojiVariations("👍🏽"), [], "a skin tone has none of its own");
  const named = (zhName, enName) => (language === "zh" ? zhName : enName);
  assert.deepEqual([emojis.emojiName("😀"), emojis.emojiName("👍🏽"), emojis.emojiName("☺")], [named("嘿嘿", "grinning face"), named("拇指向上", "thumbs up"), named("微笑", "smiling face")], "a name in the UI's language, a skin tone's its emoji's");
  // A skin tone chosen: an emoji with skin tones in it; two people or two hands both of it (the first five of 25).
  emojis.setSkinTone(3);
  assert.deepEqual(["👍", "🤝", "🧑‍🤝‍🧑", "😀", "🧑‍💻"].map(emojis.withSkinTone), ["👍🏽", "🤝🏽", "🧑🏽‍🤝‍🧑🏽", "😀", "🧑🏽‍💻"]);
  emojis.setSkinTone(0);
  assert.equal(emojis.withSkinTone("👍"), "👍");
  // 随机 and 添加图标: an activity, an object or a place.
  const pool = emojis.RANDOM_GROUPS.flatMap(emojis.emojisInCategory);
  assert.ok(pool.length > 500 && Array.from({ length: 50 }, emojis.randomEmoji).every((each) => pool.includes(each)));
  // The browser scenario pageIcon picks 🌵 after the page's random emoji (添加图标): a pick equal to the icon it
  // replaces changes nothing, which once made its undo step flaky, so the pick stays outside the random one's groups.
  assert.ok(!pool.includes("🌵"), "the emoji pageIcon picks is never the random one");

  const found = (typed) => {
    const filter = emojis.normalizeFilter(typed) ?? "";
    const parts = filter.split(" ").filter(Boolean);
    const all = ["people", "nature", "food", "travel", "activities", "objects", "symbols"].flatMap(emojis.emojisInCategory);
    return all.map((each) => ({ each, score: rank(each, filter, parts) })).filter(({ score }) => score !== undefined).sort((a, b) => b.score - a.score).map(({ each }) => each);
  };
  const first = (typed, count) => found(typed).slice(0, count).join(" ");
  assert.equal(first("笑", 3), "😄 ☺️ 😂", "笑: 大笑, 微笑, then 笑哭了 (a word equal to it, the shortest name holding it first; the everyday order between the two)");
  assert.equal(first("猫", 2), "🐈 🐱", "猫: the cat, then the cat's face");
  assert.equal(first("火", 1), "🔥");
  assert.equal(first("心", 1), "❤️", "心: 红心 before the faces whose keywords say 心");
  assert.equal(first("heart", 1), "❤️", "heart: its short code");
  assert.equal(first("cat", 2), "🐈 🐱", "cat: its name, then the short code :cat:");
  assert.equal(first("fire", 1), "🔥");
  assert.equal(first("smile", 1), "😄", "smile: the short code :smile:");
  assert.equal(first(":fire:", 1), "🔥", "a short code between colons");
  assert.equal(first("heart_eyes", 1), "😍");
  assert.equal(first("Thumbs Up", 1), "👍", "words of a name in any case");
  assert.equal(first(":)", 1), "🙂", "an emoticon");
  assert.equal(first("🚀 rocket", 1), "🚀", "the emoji itself in the filter");
  // An English name holding the word counts as a keyword equal to it, and goes first among the equal ones: of two, the
  // one it ends ("full moon" is a moon, "moon cake" a cake), then the one of fewer words; a small word finds no name.
  assert.equal(first("thumbs", 2), "👍 👎", "thumbs: 👍 (its name) as 👎 (its name and a keyword), in the data's order");
  assert.equal(first("party", 1), "🎉", "party: party popper before the faces whose keywords say party");
  assert.equal(first("moon", 4), "🌔 🌙 🌕 🌑", "moon: the short code :moon:, then the moons whose name ends with it, the everyday order between them");
  assert.ok(found("moon").indexOf("🥮") > 6, "moon cake after the moons");
  assert.equal(first("money", 2), "💸 💰", "money: money with wings, money bag, before money-mouth face");
  assert.equal(first("no", 1), "🙅", "no: person gesturing NO");
  assert.ok((rank("😘", "a", ["a"]) ?? 0) < 80 && (rank("❤️‍🔥", "on", ["on"]) ?? 0) < 80, "a and on find no name holding them (face blowing a kiss, heart on fire)");
  assert.equal(first("smile", 1), "😄", "a short code still before a name holding the word");
  assert.deepEqual(found("flag").filter((each) => /\p{Regional_Indicator}|🏁|🚩|🎌|🏴|🏳/u.test(each)), [], "no flag found");
  // The everyday emojis (shared/emoji/everyday.mjs) between those the rules above rank alike: one of them before one
  // that is not, below the closeness; among them a name holding the word first, then the everyday order.
  for (const [typed, emoji] of [["爱", "❤️"], ["idea", "💡"], ["想法", "💡"], ["yes", "👍"], ["好", "👍"], ["good", "👍"], ["time", "⏰"], ["时间", "⏰"], ["home", "🏠"], ["家", "🏠"], ["雪", "❄️"], ["music", "🎵"], ["红", "🔴"], ["happy", "😀"], ["wow", "🤩"], ["win", "🏆"]]) {
    assert.equal(first(typed, 1), emoji, `${typed}: ${emoji}, the everyday one of those its words rank alike`);
  }
  assert.equal(first("sad", 1), "😢", "sad: an everyday face before sad but relieved face, whose name holds the word");
  assert.equal(first("green", 1), "🟢", "green: the green circle, a status dot, before leafy green");
  assert.ok(found("love").indexOf("❤️") < found("love").indexOf("🏩"), "love: the red heart before love hotel");
  assert.equal(first("mail", 1), "📧", "mail: of two everyday ones, e-mail (its name) before love letter");
  assert.equal(first("cold", 1), "🥶", "cold: cold face (its name) before the everyday face whose keywords say cold");
  assert.equal(first("panda", 1), "🐼", "panda: a name equal to it before everyday ones whose keywords hold it");
  assert.equal(new Set(found("").map((each) => rank(each, "", []))).size, 1, "no filter: every emoji alike, the groups in the Unicode order");
}
// Twemoji on every system: the browser modules read no user agent (no system's own emoji font stands in for them).
for (const file of ["src/shared/emoji/data.mjs", "src/shared/emoji/emoji.mjs"]) assert.doesNotMatch(readFileSync(path.join(projectRoot, file), "utf8"), /userAgent|emojiStyle/, file);

// The browser tab shows the page's icon (the header's, never a highlight block's): the server's
// image of it in the preview, a data: URL in an export; a set's icon in its own color, light or
// dark as the system is. Added once, and not at all without one.
{
  const whole = (icon, panel = "") => `<html><head>\n<title>T</title>\n</head><body><main class="doc-page" data-doc-id="alpha">${page(icon)}${panel}</main></body></html>`;
  const tab = (html, mode) => embedIcon(html, { slug: "alpha", mode, reportsDirectory: root }).match(/<link rel="icon" href="([^"]*)" data-doc-tab-icon>/)?.[1].replace(/&amp;/g, "&") ?? null;
  assert.equal(tab(whole('<div class="doc-icon">🎯</div>'), "preview"), iconUrl("🎯", "alpha", { tab: true }));
  assert.equal(iconUrl("🎯", "alpha", { tab: true }), "/__gallery/edit/icon?value=%F0%9F%8E%AF&slug=alpha&tab=1");
  assert.match(tab(whole('<div class="doc-icon">🎯</div>'), "export"), /^data:image\/svg\+xml;base64,/);
  assert.equal(tab(whole('<div class="doc-icon"><img src="assets/icon-0123456789ab.png" alt=""></div>'), "export"), `data:image/png;base64,${PNG.toString("base64")}`);
  const glyph = Buffer.from(tab(whole('<div class="doc-icon" data-icon="/icons/airplane_blue.svg"></div>'), "export").split(",")[1], "base64").toString();
  assert.match(glyph, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]*><style>svg\{color:#337EA9\}@media \(prefers-color-scheme:dark\)\{svg\{color:#2E7CD1\}\}<\/style>/);
  assert.equal(String(iconImage({ value: "/icons/airplane_blue.svg", tab: true }).body), glyph, "the server's image is the same");
  assert.equal(tab(whole("", '<div class="doc-panel"><div class="doc-icon">💡</div><p>x</p></div>'), "export"), null, "a highlight block's icon is not the page's");
  const twice = embedIcon(embedIcon(whole('<div class="doc-icon">🎯</div>'), { slug: "alpha", mode: "preview", reportsDirectory: root }), { slug: "alpha", mode: "preview", reportsDirectory: root });
  assert.equal(twice.match(/data-doc-tab-icon/g).length, 1, "added once");
}

// The workbench's images by value: an emoji's SVG, a set's icon in black (it masks it), a
// report's image; none for anything else.
assert.equal(iconImage({ value: "🎯" }).type, "image/svg+xml");
assert.match(String(iconImage({ value: "/icons/airplane_blue.svg" }).body), /fill="#000"/);
assert.match(String(iconImage({ value: "/icons/tabler/plane_blue.svg" }).body), /fill="#000"/);
assert.match(String(iconImage({ value: "/icons/tabler/circle-number-0_gray.svg" }).body), /fill="#000"/);
assert.equal(iconImage({ value: "/icons/circle-number-0_gray.svg" }), null, "MingCute has no numbers");
assert.deepEqual(iconImage({ value: "assets/icon-0123456789ab.png", slug: "alpha", reportsDirectory: root }), { type: "image/png", body: PNG });
for (const query of [{ value: "assets/icon-0123456789ab.png", reportsDirectory: root }, { value: "assets/icon-0123456789ab.png", slug: "../alpha", reportsDirectory: root }, { value: "x" }, { value: "/icons/nothing-such_blue.svg" }]) assert.equal(iconImage(query), null);

// The check: one icon, holding one, its image in the folder.
const failuresOf = (icon, after = "") => quickFailures({ slug: "alpha", directory: path.join(root, "alpha"), metadata: {}, html: page(icon) + after }).filter((failure) => /icon/.test(failure));
// A highlight block's icon comes first in it, and so does a flowchart step's (in its number's place:
// an icon of the numbers, Tabler's, among them); anywhere else, an icon is out of place.
assert.deepEqual(failuresOf("", '<div class="doc-panel">\n  <div class="doc-icon">💡</div>\n  <p>提示</p>\n</div>'), []);
assert.match(failuresOf("", '<div class="doc-panel"><p>提示</p><div class="doc-icon">💡</div></div>').join(), /first in a highlight block/);
assert.match(failuresOf("", '<p>正文</p><div class="doc-icon">💡</div>').join(), /first in a highlight block/);
assert.deepEqual(failuresOf("", '<ol class="doc-flow">\n  <li><div class="doc-icon">📮</div><p><strong>分派</strong></p></li>\n  <li><div class="doc-icon" data-icon="/icons/tabler/circle-number-5_green.svg"></div><p><strong>回访</strong></p></li>\n</ol>'), []);
assert.match(failuresOf("", '<ol class="doc-flow"><li><p><strong>分派</strong></p><div class="doc-icon">📮</div></li></ol>').join(), /or first in a flowchart's step \(ol\.doc-flow > li/);
assert.match(failuresOf("", '<ol><li><div class="doc-icon">📮</div>分派</li></ol>').join(), /first in a flowchart's step/, "not in an item of another list");
assert.deepEqual(failuresOf('<div class="doc-icon">🎯</div>'), []);
// An icon is what the description's match finds (the component, not one exact class attribute).
assert.match(failuresOf('<div class="doc-icon wide">x</div>').join(), /holds no icon/);
assert.equal(pageIconValue(page('<div class="doc-icon wide">🎯</div>')), "🎯");
assert.equal(pageIconValue(`<header class="doc-header wide">\n<div class="doc-icon">🎯</div></header>`), "🎯");
assert.equal(pageIconValue('<div class="doc-panel"><div class="doc-icon">💡</div></div>'), null, "a highlight block's icon is not the page's");
assert.deepEqual(failuresOf('<div class="doc-icon"><img src="assets/icon-0123456789ab.png" alt=""></div>'), []);
assert.match(failuresOf('<div class="doc-icon">x</div>').join(), /holds no icon/);
assert.match(failuresOf('<div class="doc-icon"><img src="assets/icon-ffffffffffff.png" alt=""></div>').join(), /not in the document's folder/);
assert.deepEqual(failuresOf('<div class="doc-icon">🎯</div>\n<div class="doc-icon">🎯</div>'), ["line 2: 2 page icons (.doc-icon) in the header (the first at line 1): a document has one, right before its title"]);
assert.deepEqual(failuresOf('<div class="doc-icon" data-icon="/icons/airplane_blue.svg"></div>'), []);
assert.match(failuresOf('<div class="doc-icon" data-icon="/icons/rocket_blue.svg"></div>').join(), /none of the icon sets'/, "a name neither set has (a rocket)");
// What the check says teaches the icon at the moment it is wrong: each failure at its line; one that
// holds no icon says what it holds and the three kinds, an example of each as the file writes it and
// the ten colors; a name its set has not, the same name in the other set when that has it, else
// names of its set sharing a word with it.
assert.deepEqual(failuresOf('<div class="doc-icon" data-icon="rocket"></div>'), [
  'line 1: an icon (.doc-icon) holds no icon (it holds data-icon="rocket"): an icon is one of three kinds: an emoji, <div class="doc-icon">🎯</div>; an icon of Gallery\'s sets in one of 10 colors, <div class="doc-icon" data-icon="/icons/airplane_blue.svg"></div> (MingCute\'s names; Tabler\'s as /icons/tabler/plane_blue.svg; the colors gray, lightgray, brown, yellow, orange, green, blue, purple, pink, red); or a picture of the document\'s folder, <div class="doc-icon"><img src="assets/logo.png" alt=""></div>',
]);
assert.ok(iconKind("🎯") === "emoji" && glyphValue("tabler", "plane", "blue") === "/icons/tabler/plane_blue.svg" && iconImage({ value: "/icons/airplane_blue.svg" }) && iconImage({ value: "/icons/tabler/plane_blue.svg" }), "the message's examples are icons");
assert.match(failuresOf('<div class="doc-icon">AI</div>').join(), /holds no icon \(it holds "AI"\): an icon is one of three kinds/);
assert.match(failuresOf('<div class="doc-icon"><svg viewBox="0 0 1 1"></svg></div>').join(), /holds no icon \(it holds an <svg>\)/);
assert.match(failuresOf('<div class="doc-icon"></div>').join(), /holds no icon \(it holds nothing\)/);
assert.match(failuresOf('<div class="doc-icon" data-icon="/icons/airplane_teal.svg"></div>').join(), /holds no icon \(it holds data-icon="\/icons\/airplane_teal\.svg"\).*the colors gray, lightgray/, "a color none of the ten");
// An icon's value in quotes a page does not read it in (as a chart's JSON data may be written, in single
// ones): what it holds as written, and the icon in double quotes.
assert.deepEqual(failuresOf("<div class=\"doc-icon\" data-icon='/icons/airplane_blue.svg'></div>"), [
  "line 1: an icon (.doc-icon) holds data-icon='/icons/airplane_blue.svg', an icon a page reads only in double quotes: write <div class=\"doc-icon\" data-icon=\"/icons/airplane_blue.svg\"></div>",
]);
assert.ok(failuresOf("<div class=\"doc-icon\"><img src='assets/icon-ffffffff.png' alt=\"\"></div>").includes(
  "line 1: an icon (.doc-icon) holds <img src='assets/icon-ffffffff.png'>, an icon a page reads only in double quotes: write <div class=\"doc-icon\"><img src=\"assets/icon-ffffffff.png\" alt=\"\"></div>",
));
assert.deepEqual(failuresOf('<div class="doc-icon" data-icon="/icons/tabler/airplane_blue.svg"></div>'), [
  "line 1: the icon /icons/tabler/airplane_blue.svg is none of the icon sets' (MingCute: /icons/<name>_<color>.svg, Tabler: /icons/tabler/<name>_<color>.svg; src/shared/emoji/data/icons.json lists the names of each); \"airplane\" is MingCute's: /icons/airplane_blue.svg",
]);
assert.deepEqual(failuresOf('<div class="doc-icon" data-icon="/icons/tabler/square-number-2_green.svg"></div>'), [], "a number, Tabler's");
assert.deepEqual(failuresOf('<div class="doc-icon" data-icon="/icons/square-number-2_green.svg"></div>'), [
  "line 1: the icon /icons/square-number-2_green.svg is none of the icon sets' (MingCute: /icons/<name>_<color>.svg, Tabler: /icons/tabler/<name>_<color>.svg; src/shared/emoji/data/icons.json lists the names of each); \"square-number-2\" is Tabler's: /icons/tabler/square-number-2_green.svg",
], "a number written as MingCute's: Tabler's said");
assert.match(failuresOf('<div class="doc-icon" data-icon="/icons/chart-bar_blue.svg"></div>').join(),/; names of its set near it: (chart-[a-z0-9-]+)(, chart-[a-z0-9-]+|, [a-z0-9-]*bar[a-z0-9-]*)*$/);
assert.match(failuresOf("", '<p>正文</p>\n<div class="doc-icon">💡</div>').join(), /^line 2: an icon \(\.doc-icon\) stands only right before the document's title/);

// Images kept: in the report's folder under their hash (the same image once), images only (in a
// report whose report.json still says "template": true too); the library's custom emojis (a name once), copied into a report when used.
const files = createMediaStore({ reportsDirectory: root });
const [status, kept] = await files.upload({ slug: "alpha", data: PNG.toString("base64") });
assert.equal(status, 200);
assert.match(kept.path, /^assets\/icon-[0-9a-f]{12}\.png$/);
assert.equal((await files.upload({ slug: "alpha", data: PNG.toString("base64") }))[1].path, kept.path);
assert.equal((await files.upload({ slug: "alpha", data: Buffer.from("<html></html>").toString("base64") }))[1].reason, "type");
assert.equal((await files.upload({ slug: "nobody", data: PNG.toString("base64") }))[0], 404);
assert.equal((await files.upload({ slug: "../alpha", data: PNG.toString("base64") }))[0], 400);
await fs.mkdir(path.join(root, "gallery"));
await fs.writeFile(path.join(root, "gallery", "report.html"), "<main></main>");
await fs.writeFile(path.join(root, "gallery", "report.json"), JSON.stringify({ template: true }));
assert.equal((await files.upload({ slug: "gallery", data: PNG.toString("base64") }))[0], 200, "an old template flag refuses nothing");
const [, added] = await files.addEmoji({ slug: "alpha", name: "logo", url: kept.path });
assert.equal(added.entry.name, "logo");
assert.match(added.entry.url, /^\/__gallery\/edit\/emoji-library\/emoji-[0-9a-f]{12}\.png$/);
assert.equal((await files.addEmoji({ slug: "alpha", name: "logo", url: kept.path }))[1].reason, "name");
assert.deepEqual((await files.listEmojis())[1].list.map((entry) => entry.name), ["logo"]);
assert.equal((await files.upload({ slug: "alpha", library: added.entry.id }))[1].path, kept.path);
assert.deepEqual(await files.readEmoji(added.entry.url.split("/").pop()), { type: "image/png", body: PNG });
assert.equal(await files.readEmoji("library.json"), null, "the library's pictures only");

await fs.rm(root, { recursive: true, force: true });
console.log("Checked page icons: the three kinds of value and their markup, the pictures a preview and an export show them as (an image's served or embedded, a missing one left), the browser tab's image of it, the workbench's images by value, the emoji data (what its generator makes of emojibase-data: every emoji offered with its picture, group and names in both languages, the pack's pictures exactly, no flag, an emoji found however its selectors are written; one the pack lacks left as its character and drawn in the system's font by the icon route; Twemoji on every system), the picker's search (笑 猫 火 心 heart cat fire… best first; an English name holding the word first among equals: thumbs 👍, party 🎉, moon a moon before 🥮; Gallery's everyday emojis between those ranked alike: 爱 ❤️, idea 💡, sad 😢, each listed one offered) and skin tones, the icon check (each failure at its line; one holding no icon says what it holds and the three kinds with an example each, a name its set has not the other set's or names near it), the ten icon colors as one table (the picker's, the drawing's, and the kit's and the workbench's stylesheets holding its values), the 图标 tab's icons (443 pairs and Tabler's 40 numbers, Tabler's in either set, in 12 categories titled in both languages; found by name, set name, search word, digit), and the images kept in a document's folder and the emoji library (by hash, images only, a name once).");
