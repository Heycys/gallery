import { isUtf8 } from "node:buffer";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { parseFragment, serializeOuter } from "parse5";
import { isInstance, parseCompound, parsePart, parseSelector, partOf } from "./components/index.mjs";
import { ATTRIBUTE, NO_TEXT, PACKAGE_ID, PACKAGE_MARK, SLOT, inDocumentMenus, instanceMatch, packOf, refusedInCopy, settingState, unlistedBy } from "./components/installed.mjs";
import { writeAtomic } from "./files.mjs";
import { attr, walk } from "./html-tree.mjs";
import { HOST, NET, netHostsOf } from "./net-policy.mjs";
import { inLanguage, refusal, said, saying, told } from "./i18n/index.mjs";
import { DEFAULT_PACK, OWN_SCOPE, PACK_FILE, PACK_ID, readPackManifest } from "./pack-manifest.mjs";
import { DEVICE_NAMES, PACKAGE_MANIFEST, WORKSPACE_MARK, defaultWorkspace, layoutOf, markerOf, packageFolders } from "./workspace.mjs";

// 组件包, custom blocks (自定义块) as the UI and the Agent's documents call them: what the workspace's
// component packages say of themselves to Gallery, read from
// <workspace>/components/<scope>/<name>/component.json, plain data, whose code no system runs here. A
// package is a description as a kit component's is (src/shared/components/): its id, where its
// instances are, its parts and what it leaves on a page, so that what reads a built-in's reads a
// package's: the scan and the checks here, the kit on the page by DocKit.describe, the same object.
// A manifest offers only FIELDS, no unit, box, host, rank or category: those are the engines', and a
// field it does not know keeps its package from loading.
//
// The catalog is { packages, problems, settings, packs, stamp }. `packages`, by id, are those that load. A
// package that does not load (a manifest that does not read as one, one for an apiVersion this Gallery
// does not run, which counts as disabled, or one the settings turned off) stands in `problems`, by its
// id in lowercase, as an instance names it, with why (`problem`, said()'s, in either language by
// problemIn), and touches nothing else: its instances show as those of a package that is not there,
// and whoever reads them says why. `settings` is what gallery.json says of the components (设置 › 组件列表,
// componentSettings): `hidden`, `disabled`, `shown`, `unlisted` and `listed` (turned on, of a package whose
// manifest's `listed` is false: unlistedBy), by the id of a package (`hidden` the name of a
// built-in component too), `packs` and `packsOff`, the packs' switches (a pack off: none of its blocks offered,
// as one unlisted), and `problem` where the file cannot be read as saying anything (settingsNow). `packs`, by
// the scope of a block (a pack: ./pack-manifest.mjs), what its pack.json names it, or null for a scope with
// none or one that does not read (who lists it says it by its scope).
// A package the document's menus do not offer (inDocumentMenus: hidden, unlisted, or a custom page's alone and not
// shown) runs as any other and is left out of those menus, which read its state (menuOf, packageStates); one disabled is one that does not load, so that nothing that loads a
// package has a case for it. A stamp is a hash of what files hold: `stamp`, of a package, over what
// reaches a page of it (STAMPED and the files `assets` names), of one that does not load over those
// and why, and of the catalog, over its packages', what is hidden, shown and unlisted and whether gallery.json reads;
// `definition`, over the manifest alone, is what a page's commit is to be held to.
//
// readCatalog reads the disk; what reads a catalog for use (the scan, the checks, a page) asks
// currentCatalog, which reads it once a process and keeps it: a command's or a job's life is short,
// and the server's watcher (src/server/catalog-watch.mjs) puts a new one in its place. This file runs
// on the server alone (no page imports it): the workspace it reads is the one GALLERY_WORKSPACE names
// at each read, as the gallery command and the tests set it.

/** The apiVersion this Gallery runs. */
export const API_VERSION = 1;

/** The kit's files a package may ask for by id in `assets`, as src/render/assets.mjs names them (the others are on every page, or, the board's, on every custom page). */
export const KIT_ASSETS = new Set(["code", "state", "sheets", "tokens", "dialogs", "katex-styles", "katex", "katex-auto-render", "math", "d3", "charts", "tables"]);

// What a manifest may hold, a part of one and its `runtime`.
const FIELDS = ["id", "apiVersion", "version", "name", "description", "words", "parts", "runtime", "assets", "markdown", "schema", "places", "listed", "card", "settings", "needs"];
const PART_FIELDS = ["at", "edit", "optional", "min", "max"];
const RUNTIME_FIELDS = ["generated", "attrs"];

// Where a block may stand (`places`): in a
// document's flow, on a custom page's board as a card. One that says nothing is a document's, as every
// package before the field was.
const PLACES = ["document", "page"];
const DOCUMENT_ONLY = ["document"];
// What `card` says of a card on a board, in cells of the grid: a row is 12 of them, and a card at most
// 24 high.
const CARD_FIELDS = ["sizes", "w", "h", "min", "max", "resize", "fit", "bare", "consent"];
const GRID = { w: 12, h: 24 };
const FITS = ["fixed", "content"];
const NO_CARD = { sizes: null, any: false, w: 4, h: null, min: { w: 1, h: 1 }, max: { ...GRID }, resize: false, fit: "fixed", bare: false };
// A card setting: its key, a JavaScript name as a block reads it from its settings part; its kinds,
// each a field of the form the board draws; `required`: the card shows nothing until the setting holds a
// value (a weather card's city), which gallery page check says of a card that has none.
const SETTING_FIELDS = ["key", "label", "type", "options", "default", "required"];
const SETTING_KEY = /^[a-z][a-zA-Z0-9]*$/;
const SETTING_TYPES = ["text", "number", "select", "date", "switch", "document"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** The data part a block with settings keeps their values in, JSON, as the board's form writes them. */
export const SETTINGS_PART = "settings";
// What a block asks to use: the workspace's data, the keyed tables of its document, the network of a
// host (lowercase, no port and no path, "*." first for its subdomains: ./net-policy.mjs HOST).
const NEEDS = ["workspace", "tables"];

// What a package's part may be edited as: its text, its data through the kit's edit, the document's
// blocks (a slot, marked data-doc-slot="<name>" in its markup), or not at all.
const EDITS = ["text", "data", "flow", "none"];
// What a slot's name may be: it is written in an attribute's value, and a selector finds it there.
const SLOT_NAME = /^[a-z][a-z0-9-]*$/;
/** Where a part edited as flow is in an instance: the slot of its name. */
export const slotAt = (name) => `div[${SLOT}="${name}"], section[${SLOT}="${name}"]`;
// A manifest's parts as the engines read them: a slot's `at` is its mark, which the manifest does not write.
const partsRead = (parts) => Object.fromEntries(Object.entries(parts).map(([name, part]) => [name, part.edit === "flow" ? { ...part, at: slotAt(name) } : part]));
const MARKDOWN = ["parts", "text"];

/**
 * The pictures of a block the add-block lists show beside its row (the owner, 2026-11-17): the block
 * as its example.html draws it, light and dark, which gallery block check makes as it passes
 * (src/cli/block-picture.mjs), WebP at twice their size in CSS pixels, in the language its example is
 * written in. A block has both or none.
 */
export const PICTURES = Object.freeze({ light: "preview-light.webp", dark: "preview-dark.webp" });

/**
 * The same two pictures in another language of the UI's, by its code (a block of two languages: Gallery's
 * own, whose examples are Chinese, ship an English pair beside their own, src/cli/pack-pictures.mjs): the
 * menus show the pair of the UI's language where a block has it, else its own pair (pictureOf).
 */
export const LANGUAGE_PICTURES = Object.freeze({ en: Object.freeze({ light: "preview-light.en.webp", dark: "preview-dark.en.webp" }) });

/** Whether a file of a block's folder (its last part) is one of the menus' pictures of it, of any language, or the drawing of before (preview.svg). */
export const isPicture = (name) => /^preview(?:-(?:light|dark)(?:\.[a-z]{2})?\.webp|\.svg)$/.test(name);

// The files of a package by their fixed names: those served from its folder (kit.js and style.css are
// the page's that uses it, the PICTURES the menus'), and with them what a stamp reads. A preview.svg (the
// hand-drawn picture a menu showed until 2026-11-17) reaches nothing now.
// example.html and writing.md are for who writes with it, and reach no page: a change of them is no
// change of the catalog, which every open page hears.
const SERVED = ["kit.js", "style.css", ...[PICTURES, ...Object.values(LANGUAGE_PICTURES)].flatMap(({ light, dark }) => [light, dark])];
const TEMPLATE = "template.html";
const STAMPED = [PACKAGE_MANIFEST, TEMPLATE, ...SERVED];
// What a package's stamp reads, its `files` being what `assets` named besides.
const stamped = (files) => [...new Set([...STAMPED, ...files])].sort();

// A file of the package's own that `assets` names: a relative path of plain names, with an extension.
const OWN_FILE = /^(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/)*[A-Za-z0-9_-][A-Za-z0-9._-]*\.[A-Za-z0-9]+$/;
// What Gallery and the kit mark a page with, which no package sets or takes off, in any case, as HTML
// reads an attribute's name.
const OWN_NAME = /^(?:doc-|data-doc-|data-ge-)|^data-block-id$/i;
// What every page of the workspace holds of a package, whichever it uses: its manifest's words and
// its template are in each page's map.
const ON_EVERY_PAGE = 256 * 1024;

const isTable = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const isWords = (value) => typeof value === "string" && value.trim() !== "";
const byId = (a, b) => (a.id < b.id ? -1 : 1);
const fail = (message) => {
  throw refusal(message);
};
const hashOf = (write) => {
  const hash = createHash("sha256");
  write(hash);
  return hash.digest("hex").slice(0, 16);
};

/** Where a file of the package's folder is, or null: none there, or a link that leads out of it. */
function ownPath(folder, name) {
  const found = path.join(folder, name);
  try {
    const stat = lstatSync(found, { throwIfNoEntry: false });
    if (!stat) return null;
    if (!stat.isSymbolicLink() && !name.includes("/")) return found; // right in it: no walk through the path
    const real = realpathSync.native(found);
    return real.startsWith(realpathSync.native(folder) + path.sep) ? real : null;
  } catch {
    return null;
  }
}

/** The bytes of a file of the package's folder, or null. */
function ownFile(folder, name) {
  try {
    const real = ownPath(folder, name);
    return real && readFileSync(real);
  } catch {
    return null;
  }
}

// What a file holds, as a hash kept by its size and its time, so that a look over a package read a
// moment ago reads none of it again, however large (a font, a file of data). A file written this very
// moment is read each time: the write that comes next can carry the same size and time.
const digests = new Map(); // a file's path -> { size, time, digest }
const SETTLED = 2000;
function digestOf(real) {
  const { size, mtimeMs } = statSync(real);
  const known = digests.get(real);
  if (known?.size === size && known.time === mtimeMs) return known.digest;
  const digest = hashOf((hash) => hash.update(readFileSync(real)));
  if (Date.now() - mtimeMs > SETTLED) digests.set(real, { size, time: mtimeMs, digest });
  return digest;
}

const stampOf = (folder, names) => hashOf((hash) => {
  for (const name of names) {
    const real = ownPath(folder, name);
    let digest = "none"; // no such file, or one gone between the two
    try {
      if (real) digest = digestOf(real);
    } catch {}
    hash.update(`${name}\u0000${digest}\n`);
  }
});

// A file's words, no byte-order mark, which an editor on Windows may write.
const wordsOf = (bytes) => bytes.toString("utf8").replace(/^\uFEFF/, "");
const notTooLong = (bytes, name) => {
  if (bytes.length > ON_EVERY_PAGE) fail(said("{0} 有 {1} KB，而每一页都带着它，最多 {2} KB", name, Math.ceil(bytes.length / 1024), ON_EVERY_PAGE / 1024));
};

const onlyFields = (table, fields, where = "") => {
  for (const key of Object.keys(table)) if (!fields.includes(key)) fail(said("{0} 不是自定义块的清单能写的字段", `${where}${key}`));
};
const required = (manifest, fields) => {
  for (const field of fields) if (manifest[field] === undefined) fail(said("缺少 {0}", field));
};
const bothLanguages = (value, field) => {
  if (!isTable(value) || !isWords(value.zh) || !isWords(value.en) || Object.keys(value).length !== 2) fail(said("{0} 要写成 { zh, en } 两种语言的文字", field));
};

// The tags a part's `at` ends on, where it names one.
const tailTags = (at) => at.split(",").map((piece) => piece.split(">").at(-1).trim()).filter((step) => step !== "*").map((step) => parseCompound(step).tag);

function checkPart(name, part) {
  const where = `parts.${name}`;
  if (!isTable(part)) fail(said("{0} 要写成一张表", where));
  onlyFields(part, PART_FIELDS, `${where}.`);
  if (part.edit === "flow") {
    // A slot: found by its mark, one to an instance.
    if (!SLOT_NAME.test(name)) fail(said("{0} 是插槽，名字只用小写字母、数字和连字符", where));
    if (part.at !== undefined) fail(said("{0} 是插槽，由 data-doc-slot=\"{1}\" 标出，不写 at", where, name));
    if (part.min !== undefined || part.max !== undefined) fail(said("{0} 是插槽，一个实例里只有一个，不写 min、max", where));
    if (part.optional !== undefined && typeof part.optional !== "boolean") fail(said("{0} 要写成 true 或 false", `${where}.optional`));
    return;
  }
  if (!isWords(part.at)) fail(said("缺少 {0}", `${where}.at`));
  try {
    parsePart(part.at);
  } catch (error) {
    fail(said("{0} 写错了：{1}", `${where}.at`, error.message));
  }
  if (!EDITS.includes(part.edit)) fail(said("{0} 的 edit 只能是 text、data、flow 或 none", where));
  if (part.optional !== undefined && typeof part.optional !== "boolean") fail(said("{0} 要写成 true 或 false", `${where}.optional`));
  for (const bound of ["min", "max"]) if (part[bound] !== undefined && !(Number.isInteger(part[bound]) && part[bound] >= 0)) fail(said("{0} 要写成不小于 0 的整数", `${where}.${bound}`));
  if (part.min > part.max) fail(said("{0} 的 min 比 max 大，没有实例能满足", where));
  if (part.edit === "text") for (const tag of tailTags(part.at)) if (NO_TEXT.has(tag)) fail(said("{0} 不能按文字编辑：<{1}> 不是能打字的文字", where, tag));
}

// Whether a selector takes the instance itself, or all it holds: what a copy of the view would lose with it.
const takesAll = (selector) => selector.split(",").some((one) => one.split(">").every((step) => [":scope", "*"].includes(step.trim())));

// `runtime` as the kit reads it: DocKit.dehydrate looks through the whole page, so each selector is
// given the package's instances as its root.
function runtimeOf(runtime, id) {
  if (runtime === undefined) return null;
  if (!isTable(runtime)) fail(said("{0} 要写成一张表", "runtime"));
  onlyFields(runtime, RUNTIME_FIELDS, "runtime.");
  const root = `[${ATTRIBUTE}="${id}"]`;
  const scoped = (selector, where) => {
    try {
      if (!isWords(selector)) throw new Error("no selector");
      parseSelector(selector);
    } catch (error) {
      fail(said("{0} 写错了：{1}", where, error.message));
    }
    return selector.split(",").map((one) => (one.trim().startsWith(":scope") ? one.trim().replace(":scope", root) : `${root} ${one.trim()}`)).join(", ");
  };
  const { generated = [], attrs = {} } = runtime;
  if (!Array.isArray(generated)) fail(said("{0} 要写成一串文字", "runtime.generated"));
  if (!isTable(attrs)) fail(said("{0} 要写成一张表", "runtime.attrs"));
  for (const names of Object.values(attrs)) {
    if (!Array.isArray(names) || !names.every(isWords)) fail(said("{0} 要写成一串文字", "runtime.attrs"));
    for (const name of names) if (OWN_NAME.test(name)) fail(said("{0} 是 Gallery 自己的名字，自定义块不能用", name));
  }
  const made = (selector) => {
    const written = scoped(selector, "runtime.generated");
    if (takesAll(selector)) fail(said("{0} 的 {1} 是整个实例，而这里只写它生成的节点", "runtime.generated", selector));
    return written;
  };
  return {
    generated: generated.map(made),
    attrs: Object.fromEntries(Object.entries(attrs).map(([selector, names]) => [scoped(selector, "runtime.attrs"), names])),
  };
}

const isCount = (value, most) => Number.isInteger(value) && value >= 1 && value <= most;
const twice = (list) => list.find((value, index) => list.indexOf(value) !== index);

// `places`: one place or both, each once.
function placesOf(places) {
  if (places === undefined) return DOCUMENT_ONLY;
  if (!Array.isArray(places) || places.length === 0 || !places.every((place) => PLACES.includes(place))) fail(said("places 要写成 document、page 中的一个或两个，如 [\"document\"]"));
  if (twice(places)) fail(said("places 里 {0} 写了两次", twice(places)));
  return [...places];
}

// `card`: as a board reads it, every field there (NO_CARD's where the manifest says nothing; `h` null:
// the fewest whole cells its content takes). With `sizes`, the first is the default, and no w or h is
// written beside them; a min or a max beside them frees the card (`any`): the sizes are the common ones
// its 大小 menu lists, any whole size between min and max is its too (resizing by the corner, a place),
// and each of the sizes stands inside them. `consent` ({ zh, en }, where it says one) is what the kit's
// banner on its card says while it waits for the reader to let it online (允许联网之后显示天气), in place of
// the kit's own line (允许联网之后显示内容).
function cardOf(card) {
  if (card === undefined) return NO_CARD;
  if (!isTable(card)) fail(said("{0} 要写成一张表", "card"));
  onlyFields(card, CARD_FIELDS, "card.");
  const sized = (pair) => Array.isArray(pair) && pair.length === 2 && isCount(pair[0], GRID.w) && isCount(pair[1], GRID.h);
  if (card.sizes !== undefined) {
    if (!Array.isArray(card.sizes) || card.sizes.length === 0 || !card.sizes.every(sized)) fail(said("card.sizes 要写成 [宽, 高] 的一串，宽 1 到 {0} 格，高 1 到 {1} 格", GRID.w, GRID.h));
    const repeated = twice(card.sizes.map((pair) => pair.join("x")));
    if (repeated) fail(said("card.sizes 里 {0} 写了两次", repeated));
    const beside = ["w", "h"].find((field) => card[field] !== undefined);
    if (beside) fail(said("写了 card.sizes，就不再写 card.{0}：第一种大小是默认的", beside));
  }
  for (const axis of ["w", "h"]) if (card[axis] !== undefined && !isCount(card[axis], GRID[axis])) fail(said("{0} 要写成 1 到 {1} 的整数", `card.${axis}`, GRID[axis]));
  const bounds = {};
  for (const bound of ["min", "max"]) {
    const value = card[bound];
    if (value === undefined) continue;
    if (!isTable(value)) fail(said("{0} 要写成 { w, h }，单位是格", `card.${bound}`));
    onlyFields(value, ["w", "h"], `card.${bound}.`);
    for (const axis of ["w", "h"]) if (value[axis] !== undefined && !isCount(value[axis], GRID[axis])) fail(said("{0} 要写成 1 到 {1} 的整数", `card.${bound}.${axis}`, GRID[axis]));
    bounds[bound] = value;
  }
  const min = { w: bounds.min?.w ?? 1, h: bounds.min?.h ?? 1 };
  const max = { w: bounds.max?.w ?? GRID.w, h: bounds.max?.h ?? GRID.h };
  const w = card.sizes ? card.sizes[0][0] : card.w ?? NO_CARD.w;
  const h = card.sizes ? card.sizes[0][1] : card.h ?? null;
  const any = Boolean(card.sizes) && (card.min !== undefined || card.max !== undefined);
  if (any) {
    const outside = card.sizes.find(([width, height]) => width < min.w || width > max.w || height < min.h || height > max.h);
    if (outside) fail(said("card.sizes 里 {0} 不在 card.min 到 card.max 之间", outside.join("x")));
  }
  for (const axis of ["w", "h"]) {
    if (min[axis] > max[axis]) fail(said("card.min.{0} 比 card.max.{0} 大", axis));
    const value = { w, h }[axis];
    if (value !== null && !card.sizes && (value < min[axis] || value > max[axis])) fail(said("默认的 card.{0} 是 {1}，不在 card.min 到 card.max 之间（{2} 到 {3}）", axis, value, min[axis], max[axis]));
  }
  for (const flag of ["resize", "bare"]) if (card[flag] !== undefined && typeof card[flag] !== "boolean") fail(said("{0} 要写成 true 或 false", `card.${flag}`));
  if (card.fit !== undefined && !FITS.includes(card.fit)) fail(said("card.fit 只能是 fixed 或 content"));
  if (card.consent !== undefined) bothLanguages(card.consent, "card.consent");
  return {
    sizes: card.sizes ? card.sizes.map(([width, height]) => [width, height]) : null,
    any, w, h, min, max,
    resize: card.resize ?? false,
    fit: card.fit ?? "fixed",
    bare: card.bare ?? false,
    ...(card.consent !== undefined ? { consent: { zh: card.consent.zh, en: card.consent.en } } : {}),
  };
}

// Whether `value` can be the default of a setting of `type` (with its `options`).
const fitsSetting = (value, { type, options }) => ({
  text: typeof value === "string",
  number: typeof value === "number" && Number.isFinite(value),
  select: options?.includes(value),
  date: typeof value === "string" && DATE.test(value),
  switch: typeof value === "boolean",
  document: typeof value === "string",
})[type];

// `settings`: the fields of a card's form, each key once; a block with any keeps their values in a JSON
// data part of its own (SETTINGS_PART), which its parts are to name.
function settingsOf(settings, parts) {
  if (settings === undefined) return [];
  if (!Array.isArray(settings)) fail(said("{0} 要写成一串字段", "settings"));
  const keys = [];
  settings.forEach((setting, index) => {
    const where = `settings[${index}]`;
    if (!isTable(setting)) fail(said("{0} 要写成一张表", where));
    onlyFields(setting, SETTING_FIELDS, `${where}.`);
    if (typeof setting.key !== "string" || !SETTING_KEY.test(setting.key)) fail(said("{0} 的 key 以小写字母开头，只用字母和数字（如 city、startDate）", where));
    if (keys.includes(setting.key)) fail(said("settings 里 key {0} 写了两次", setting.key));
    keys.push(setting.key);
    bothLanguages(setting.label, `${where}.label`);
    if (!SETTING_TYPES.includes(setting.type)) fail(said("{0} 的 type 只能是 {1}", where, SETTING_TYPES.join(", ")));
    if (setting.type === "select") {
      if (!Array.isArray(setting.options) || setting.options.length === 0 || !setting.options.every(isWords)) fail(said("{0} 是 select，要有 options：一串文字", where));
      if (twice(setting.options)) fail(said("{0} 的 options 里 {1} 写了两次", where, twice(setting.options)));
    } else if (setting.options !== undefined) fail(said("{0} 不是 select，不写 options", where));
    if (setting.default !== undefined && !fitsSetting(setting.default, setting)) fail(said("{0} 的 default 和它的 type {1} 不符", where, setting.type));
    if (setting.required !== undefined && typeof setting.required !== "boolean") fail(said("{0} 的 required 要写 true 或 false", where));
  });
  const part = parts[SETTINGS_PART];
  if (settings.length > 0 && !(part?.edit === "data" && tailTags(part.at).every((tag) => tag === "script") && tailTags(part.at).length > 0)) {
    fail(said("写了 settings，parts 里就要有一个名为 settings、edit 为 data 的部分，它是一个 <script type=\"application/json\">，存卡片设置的值"));
  }
  return settings.map((setting) => ({ ...setting }));
}

// `needs`: what a block asks to use, each once.
function needsOf(needs) {
  if (needs === undefined) return [];
  if (!Array.isArray(needs)) fail(said("{0} 要写成一串文字", "needs"));
  for (const need of needs) {
    if (typeof need === "string" && (NEEDS.includes(need) || (need.startsWith(NET) && HOST.test(need.slice(NET.length))))) continue;
    fail(said("needs 里的 {0} 不认识：只认 workspace、tables 和 net:<域名>（小写的主机名，不带端口和路径，可以以 *. 开头）", typeof need === "string" ? need : JSON.stringify(need)));
  }
  if (twice(needs)) fail(said("needs 里 {0} 写了两次", twice(needs)));
  return [...needs];
}

// What a block that may stand on a custom page cannot hold: a slot, whose blocks are a document's,
// which no page has the editor and the rendering of.
function pageParts(places, parts) {
  if (!places.includes("page")) return;
  const slot = Object.entries(parts).find(([, part]) => part.edit === "flow");
  if (slot) fail(said("places 里有 page，就不能有插槽：{0} 的 edit 是 flow，插槽放的是文档的块，自定义页上没有", `parts.${slot[0]}`));
}

// `assets`: the kit's files a package asks for, by id, and files of its own, by their path in its folder.
function assetsOf(assets, folder) {
  if (assets === undefined) return { kit: [], own: [] };
  if (!Array.isArray(assets) || !assets.every(isWords)) fail(said("{0} 要写成一串文字", "assets"));
  const own = assets.filter((asset) => !KIT_ASSETS.has(asset));
  for (const asset of own) {
    if (!OWN_FILE.test(asset)) fail(said("assets 里的 {0} 既不是套件的资源，也不是块的文件夹里的文件", asset));
    if (!ownPath(folder, asset)) fail(said("assets 写了 {0}，块的文件夹里没有这个文件", asset));
  }
  return { kit: assets.filter((asset) => KIT_ASSETS.has(asset)), own };
}

// A package as `manifest` says it, or the error that says why not. An apiVersion it does not run
// comes first of all that is about its contents, which a later Gallery may have changed.
function packageOf(id, folder, text) {
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch (error) {
    fail(said("component.json 不是 JSON：{0}", error.message));
  }
  if (!isTable(manifest)) fail(said("component.json 写的不是一个对象"));
  if (!PACKAGE_ID.test(id)) fail(said("{0} 不能做自定义块的 id：范围和名字都只用小写字母、数字和连字符", id));
  for (const name of id.split("/")) if (DEVICE_NAMES.has(name)) fail(said("{0} 不能做自定义块的 id：{1} 是 Windows 留给设备的名字", id, name));
  if (manifest.id !== id) fail(said("清单的 id 是 {0}，和它的文件夹 {1} 不一样", String(manifest.id), id));
  required(manifest, ["apiVersion"]);
  if (!Number.isInteger(manifest.apiVersion) || manifest.apiVersion < 1) fail(said("apiVersion 要写成一个正整数"));
  if (manifest.apiVersion !== API_VERSION) throw refusal(said("这个自定义块要 apiVersion {0}，这一版 Gallery 只支持 {1}", manifest.apiVersion, API_VERSION), { disabled: true, version: isWords(manifest.version) ? manifest.version : null });
  onlyFields(manifest, FIELDS);
  required(manifest, ["version", "name", "description", "parts"]);
  if (!isWords(manifest.version)) fail(said("{0} 要写成文字", "version"));
  bothLanguages(manifest.name, "name");
  bothLanguages(manifest.description, "description");
  if (manifest.words !== undefined && typeof manifest.words !== "string") fail(said("{0} 要写成文字", "words"));
  if (!isTable(manifest.parts)) fail(said("{0} 要写成一张表", "parts"));
  for (const [name, part] of Object.entries(manifest.parts)) checkPart(name, part);
  const runtime = runtimeOf(manifest.runtime, id);
  const { kit, own } = assetsOf(manifest.assets, folder);
  if (manifest.markdown !== undefined && !MARKDOWN.includes(manifest.markdown)) fail(said("markdown 只能是 parts 或 text"));
  if (manifest.schema !== undefined && !(Number.isInteger(manifest.schema) && manifest.schema >= 1)) fail(said("schema 要写成一个正整数"));
  const places = placesOf(manifest.places);
  pageParts(places, manifest.parts);
  // `listed`: false, the menus and the library leave it out until the user turns it on (设置 › 组件列表's master switch: unlistedBy).
  if (manifest.listed !== undefined && typeof manifest.listed !== "boolean") fail(said("{0} 要写成 true 或 false", "listed"));
  const card = cardOf(manifest.card);
  const settings = settingsOf(manifest.settings, manifest.parts);
  const needs = needsOf(manifest.needs);
  const template = ownFile(folder, TEMPLATE);
  if (template) notTooLong(template, TEMPLATE);
  return {
    id,
    match: instanceMatch(id),
    parts: partsRead(manifest.parts),
    ...(runtime ? { runtime } : {}),
    ...(manifest.schema !== undefined ? { schema: manifest.schema } : {}),
    apiVersion: manifest.apiVersion,
    version: manifest.version,
    name: manifest.name,
    description: manifest.description,
    words: manifest.words ?? "",
    assets: kit,
    markdown: manifest.markdown ?? "parts",
    places,
    listed: manifest.listed !== false,
    card,
    settings,
    needs,
    files: [...new Set([...SERVED.filter((file) => ownPath(folder, file)), ...own])],
    template: template && wordsOf(template),
    folder,
    definition: hashOf((hash) => hash.update(text)),
    stamp: stampOf(folder, stamped(own)),
  };
}

// What a folder holds: a package, or what keeps it from being one.
function readPackage(id, folder) {
  try {
    const bytes = ownFile(folder, PACKAGE_MANIFEST);
    if (!bytes) fail(said("读不出 component.json"));
    if (!isUtf8(bytes)) fail(said("{0} 不是 UTF-8 编码：请存成 UTF-8", PACKAGE_MANIFEST));
    notTooLong(bytes, PACKAGE_MANIFEST);
    return packageOf(id, folder, wordsOf(bytes));
  } catch (error) {
    const problem = saying(error);
    const stamp = hashOf((hash) => hash.update(`${stampOf(folder, stamped([]))} ${JSON.stringify(problem)}`));
    return { id: id.toLowerCase(), stamp, problem, disabled: error.disabled === true, version: error.version ?? null };
  }
}

const workspaceRoot = () => defaultWorkspace();

// A file edited by hand holds what it holds: of its lists, what can be an id is read, once each, and
// the rest is passed over, one that names nothing there doing nothing. An id may be of a package that
// comes back, so it stays. Only a package can be disabled or unlisted.
const NAMED = /^[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)?$/;
const idsIn = (list, shape) => [...new Set(Array.isArray(list) ? list.filter((id) => typeof id === "string" && shape.test(id)) : [])];
// `net`, the reader's consents (a block's card, 设置 › 组件列表): of each package by its id, the hosts of its
// needs it was allowed to reach, those that can be a needs' host (./net-policy.mjs HOST), once each; a
// package with none named none.
const consentsIn = (net) => Object.fromEntries(Object.entries(isTable(net) ? net : {}).filter(([id]) => PACKAGE_ID.test(id)).map(([id, hosts]) => [id, idsIn(hosts, HOST)]).filter(([, hosts]) => hosts.length > 0));
// `packs`, the packs' switches (设置 › 组件列表's pack cards): { "<pack id>": { "enabled": false } }, by id, a
// pack it names none of on; what is no pack's id or says no boolean is passed over.
const switchesIn = (packs) => Object.fromEntries(Object.entries(isTable(packs) ? packs : {}).filter(([id, entry]) => PACK_ID.test(id) && typeof entry?.enabled === "boolean").map(([id, entry]) => [id, entry.enabled]));
const settingsIn = (file) => {
  const packs = switchesIn(file?.components?.packs);
  return { hidden: idsIn(file?.components?.hidden, NAMED), disabled: idsIn(file?.components?.disabled, PACKAGE_ID), shown: idsIn(file?.components?.shown, PACKAGE_ID), unlisted: idsIn(file?.components?.unlisted, PACKAGE_ID), listed: idsIn(file?.components?.listed, PACKAGE_ID), net: consentsIn(file?.components?.net), packs, packsOff: Object.keys(packs).filter((id) => packs[id] === false).sort() };
};

// gallery.json's text (null: no file) as what it holds, `value`, or `problem`, why it cannot be taken
// for a workspace's: what the catalog goes on through (settingsNow) and no writer writes over.
const UNREAD = said("gallery.json 读不出来：改好这个文件后再试");
const NOT_OURS = said("gallery.json 不是 Gallery 的文件");
function fileOf(text) {
  if (text === null) return { value: null };
  const { value, ours, reads } = markerOf(text);
  return ours ? { value } : { problem: reads ? NOT_OURS : UNREAD };
}

function fileAt(root) {
  try {
    return fileOf(readFileSync(layoutOf(root).marker, "utf8"));
  } catch (error) {
    return error.code === "ENOENT" ? fileOf(null) : { problem: UNREAD };
  }
}

/**
 * What gallery.json says of the components: { hidden, disabled, shown, unlisted, net, packs, packsOff }, ids of packages and, in
 * `hidden`, names of built-in components (inDocumentMenus reads `hidden`, `shown` and `unlisted`; a block
 * unlisted, 设置 › 组件列表's master switch off, is offered by no menu and no library); `net` the hosts
 * each package was allowed to reach, by its id (consentsIn); `packs` each pack's switch named there, by its id (true on,
 * false off), `packsOff` the ids of those off. One that is not there says nothing, and neither does one that does not
 * read or is another program's: what goes on using a workspace goes by the catalog (readCatalog).
 */
export const componentSettings = (root = workspaceRoot()) => settingsIn(fileAt(root).value);

// What a system says of a file it will not let be written, after writeAtomic's own tries.
const NOT_WRITABLE = ["EPERM", "EACCES", "EBUSY", "EROFS"];

/**
 * gallery.json with the pack `pack` on or off, as `enabled` says (components.packs, its entry's other fields
 * kept), or with `id` hidden or not, shown or not, disabled or not and unlisted or not, as `hidden`,
 * `shown`, `disabled` and `unlisted` say (true, false, or left out for as it is), and in `listed` or not
 * (the master switch turned on of a block whose manifest's `listed` is false: unlistedBy), written at once and with
 * all else it holds kept; `shown`, `unlisted` and `listed` are written where they hold an id or were there already
 * (a block no entry names is as its manifest says: listed, but where its `listed` is false). `net`, the hosts `id` is allowed
 * to reach (a list: its consent, all it names in place of what was there; [] takes it back), written in
 * components.net under its id, which goes with its last host, and components.net with its last id. A file that does
 * not read, is another program's, changed under this write or cannot be written is refused, and stays
 * as it is: it is not this write's to mend.
 */
export async function writeComponentSettings(root, { id, hidden, shown, disabled, unlisted, listed, net, pack, enabled }) {
  const file = layoutOf(root).marker;
  const text = await fs.readFile(file, "utf8").catch((error) => {
    if (error.code === "ENOENT") return null;
    fail(UNREAD);
  });
  const { value, problem } = fileOf(text);
  if (problem) fail(problem);
  const named = (list, on) => (on === undefined ? list : on ? [...new Set([...list, id])] : list.filter((other) => other !== id));
  const { hidden: wasHidden, disabled: wasDisabled, shown: wasShown, unlisted: wasUnlisted, listed: wasListed } = settingsIn(value);
  const before = isTable(value?.components) ? value.components : {};
  const nowShown = named(wasShown, shown);
  const nowUnlisted = named(wasUnlisted, unlisted);
  const nowListed = named(wasListed, listed);
  const components = {
    ...before, hidden: named(wasHidden, hidden), disabled: named(wasDisabled, disabled),
    ...(nowShown.length > 0 || Object.hasOwn(before, "shown") ? { shown: nowShown } : {}),
    ...(nowUnlisted.length > 0 || Object.hasOwn(before, "unlisted") ? { unlisted: nowUnlisted } : {}),
    ...(nowListed.length > 0 || Object.hasOwn(before, "listed") ? { listed: nowListed } : {}),
  };
  if (pack !== undefined) {
    const switches = isTable(before.packs) ? before.packs : {};
    components.packs = { ...switches, [pack]: { ...(isTable(switches[pack]) ? switches[pack] : {}), enabled: enabled === true } };
  }
  if (net !== undefined) {
    const consents = { ...(isTable(before.net) ? before.net : {}) };
    if (net.length > 0) consents[id] = [...new Set(net)];
    else delete consents[id];
    if (Object.keys(consents).length > 0) components.net = consents;
    else delete components.net;
  }
  const written = await writeAtomic(file, `${JSON.stringify({ ...(value ?? WORKSPACE_MARK), components }, null, 2)}\n`, { expect: text }).catch((error) => {
    if (NOT_WRITABLE.includes(error.code)) fail(said("gallery.json 写不进去：可能是只读的，或被别的程序占着"));
    throw error;
  });
  if (!written) fail(said("gallery.json 刚刚被改过：再试一次"));
}

// A package the settings turned off: to all that loads one, one that does not load, what its manifest
// says kept for who lists it (`off`).
const turnedOff = (found) => ({ ...found, off: true, disabled: true, problem: said("在设置里停用了"), stamp: hashOf((hash) => hash.update(`${found.stamp} off`)) });

const NO_SETTINGS = settingsIn(null);

/** The stamp of a catalog: of what its packages are, those that do not load and why too, of what is hidden, shown and unlisted, the packs off and their names, and of why gallery.json does not read, none of which changes a package. */
export const catalogStamp = ({ packages, problems, settings = NO_SETTINGS, packs = new Map() }) => hashOf((hash) => {
  for (const { id, stamp } of [...packages.values(), ...problems.values()].sort(byId)) hash.update(`${id} ${stamp}\n`);
  hash.update(`hidden ${[...settings.hidden].sort().join(" ")}\n`);
  hash.update(`shown ${[...settings.shown].sort().join(" ")}\n`);
  hash.update(`unlisted ${[...(settings.unlisted ?? [])].sort().join(" ")}\n`);
  hash.update(`listed ${[...(settings.listed ?? [])].sort().join(" ")}\n`);
  hash.update(`net ${consentPairs(settings).join(" ")}\n`);
  hash.update(`packs off ${(settings.packsOff ?? []).join(" ")}\n`);
  for (const [scope, name] of [...packs].sort(([a], [b]) => (a < b ? -1 : 1))) hash.update(`pack ${scope} ${JSON.stringify(name)}\n`);
  hash.update(`settings ${settings.problem?.message ?? ""}\n`);
});

// The consents of `settings` as "<id>@<host>", sorted: what the stamp and the settings line say of them.
const consentPairs = ({ net = {} }) => Object.entries(net).flatMap(([id, hosts]) => hosts.map((host) => `${id}@${host}`)).sort();

// The settings a catalog goes by: what gallery.json says or, while it cannot be read as saying
// anything, what was in use (`held`, a broken manifest's hold, for a slip by hand), with why (`problem`).
function settingsNow(root, held) {
  const { value, problem } = fileAt(root);
  return problem ? { hidden: held.hidden, disabled: held.disabled, shown: held.shown ?? [], unlisted: held.unlisted ?? [], listed: held.listed ?? [], net: held.net ?? {}, packs: held.packs ?? {}, packsOff: held.packsOff ?? [], problem } : settingsIn(value);
}

// What runs before the catalog reads the blocks of a workspace that holds Gallery's own (the scopes of
// Gallery's packs, `ownScopes`): (root, ids) -> anything. A server sets it as it starts
// (shared/shipped-blocks.mjs followOnRead: a copy as it was added brought up to Gallery's first), so that
// this file imports nothing of the package's paths, reading whichever workspace it is given; a command sets none.
let beforeRead = null;
let ownScopes = [];

/** `run(root, ids)` runs before each read of a workspace's blocks that finds Gallery's own (`ids`, those of `scopes`, the scopes of Gallery's packs), from now on in this process. */
export const beforeCatalogRead = (run, scopes = ["gallery"]) => {
  beforeRead = run;
  ownScopes = [...scopes];
};

/**
 * The workspace's packages as they are on disk now: the catalog, whatever a package or gallery.json
 * holds. `held`: the settings of the catalog in use, for a file that does not read; a process with
 * none has nothing to go by. `on`: a package read as its files say whatever gallery.json says of it,
 * for what holds it to them (gallery block check). In a server, Gallery's own blocks as they were
 * added are brought up to Gallery's first (beforeCatalogRead).
 */
export function readCatalog(root = workspaceRoot(), held = NO_SETTINGS, { on = null } = {}) {
  const settings = settingsNow(root, held);
  const packages = new Map();
  const problems = new Map();
  const folders = packageFolders(root);
  const own = folders.map(({ id }) => id).filter((id) => ownScopes.includes(id.split("/")[0]));
  if (beforeRead && own.length > 0) {
    try {
      beforeRead(root, own);
    } catch {} // what it could not do leaves the blocks as they are
  }
  for (const { id, folder } of folders) {
    const found = readPackage(id, folder);
    (found.problem ? problems : packages).set(found.id, found);
  }
  for (const id of packages.keys()) problems.delete(id); // a folder of its name in another case, on a system that tells the two apart
  for (const id of settings.disabled) {
    if (!packages.has(id) || id === on) continue;
    problems.set(id, turnedOff(packages.get(id)));
    packages.delete(id);
  }
  const packs = packNames(root, [...folders.map(({ id }) => id.split("/")[0]), ...[...packages.values()].map((found) => packOf(found.id, found.places))]);
  return { packages, problems, settings, packs, stamp: catalogStamp({ packages, problems, settings, packs }) };
}

/**
 * What the pack.json of each scope of `scopes` (and of each folder of components/ that holds one) names
 * it: a Map, by scope, of { zh, en }, or null where it has none or one that does not read (a scope of
 * blocks with no pack.json is a pack of its own by its scope's name, the default pack, local/, by its own:
 * ./pack-manifest.mjs DEFAULT_PACK, ./block-packs.mjs).
 */
export function packNames(root, scopes = []) {
  const { components } = layoutOf(root);
  let withFile = [];
  try {
    withFile = readdirSync(components).filter((name) => PACK_ID.test(name) && existsSync(path.join(components, name, PACK_FILE)));
  } catch {}
  const names = new Map();
  for (const scope of [...new Set([...scopes, ...withFile])].sort()) {
    let name = null;
    try {
      name = scope === OWN_SCOPE ? DEFAULT_PACK.name : readPackManifest(readFileSync(path.join(components, scope, PACK_FILE), "utf8")).name;
    } catch {}
    names.set(scope, name);
  }
  return names;
}

const kept = new Map(); // a workspace's root -> the catalog in use

/** The catalog in use: the one kept, read the first time it is asked for. */
export function currentCatalog(root = workspaceRoot()) {
  const key = path.resolve(root);
  if (!kept.has(key)) kept.set(key, readCatalog(key));
  return kept.get(key);
}

/** `catalog` in use from now on (the server's watcher). */
export const keepCatalog = (root, catalog) => void kept.set(path.resolve(root), catalog);

/** The next ask reads the disk (a job of the worker, which hears no watcher; a test that wrote a package). */
export const forgetCatalog = (root = workspaceRoot()) => void kept.delete(path.resolve(root));

/** Why a package does not load, in `language` ("zh" or "en"), whatever the language in use. */
export const problemIn = (language, problem) => inLanguage(language, () => told(problem));

// Why a package does not load, in both languages, as a page and a list say it.
const bothProblems = (problem) => ({ zh: problemIn("zh", problem), en: problemIn("en", problem) });

/** Why gallery.json cannot be read, in both languages, as 设置 › 组件列表 says it, or null. */
export const settingsProblem = ({ settings }) => (settings.problem ? bothProblems(settings.problem) : null);

// What a package is now: "normal" (the document's menus offer it: inDocumentMenus), "hidden" (they do
// not), "disabled" (turned off, or for an apiVersion this Gallery does not run), or "broken", one that
// does not load of itself.
const stateOf = (found, settings) => (found.problem ? (found.disabled ? "disabled" : "broken") : settingState(found.id, settings, found.places, found.listed));

/**
 * What the kit is told of a package: where its instances are, its parts, what it leaves on a page, how far
 * its content's shape goes, and what it uses (`needs`, where it names any: the kit gives an instance
 * context.workspace for "workspace", context.fetch for a host of the net and context.table() for
 * "tables"), and the line its card's consent banner says (`consent`, its card's, where it says one).
 */
export const descriptionOf = ({ id, match, parts, runtime, schema, needs, card }) => ({ id, match, parts, ...(runtime ? { runtime } : {}), ...(schema !== undefined ? { schema } : {}), ...(needs?.length ? { needs } : {}), ...(card?.consent ? { consent: card.consent } : {}) });

/**
 * What the kit is told of a catalog, each by DocKit.describe, the one way a page learns a package's
 * parts: of a package its description, of one that does not load why, in both languages, its note
 * saying it in the page's.
 */
export const descriptionsOf = ({ packages, problems }) => [
  ...[...packages.values()].map(descriptionOf),
  ...[...problems.values()].map(({ id, problem }) => ({ id, problem: bothProblems(problem) })),
];

/** The line that tells the kit of `description`, safe in a script of a page. */
export const describeLine = (description) => `DocKit.describe(${JSON.stringify(description)});`.replace(/</g, "\\u003c");

/** Where a page has a file of a package from, by the stamp that keeps it for good (src/server/component-route.mjs). */
export const packageAddress = ({ id, stamp }, file) => `/__gallery/components/${id}/${file}?v=${stamp}`;

/**
 * The addresses of a package's PICTURES, { light, dark }, and of each pair of LANGUAGE_PICTURES it holds both
 * of under that language's code ({ light, dark, en: { light, dark } }), or null where it has not its own two.
 */
export function pictureOf(found) {
  const pair = (names) => (found.files.includes(names.light) && found.files.includes(names.dark) ? { light: packageAddress(found, names.light), dark: packageAddress(found, names.dark) } : null);
  const own = pair(PICTURES);
  if (!own) return null;
  for (const [language, names] of Object.entries(LANGUAGE_PICTURES)) {
    const other = pair(names);
    if (other) own[language] = other;
  }
  return own;
}

/**
 * The tags that load a package in a page, by kind, each a string of HTML: `styles`, a link to its
 * style.css; `scripts`, the line that tells the kit of it, written here from its manifest so that a
 * package's script says nothing of itself, and a script of its kit.js, which that line then says
 * comes with the page (`script`: the kit marks an instance its script did not start). A package with no
 * script gets the line all the same: that is what makes its instances a package's and no fallback. The
 * one place these are written; a page that has its tags has all of a package.
 */
export function packageTags(found) {
  const mark = `${PACKAGE_MARK}="${found.id}"`;
  const has = (file) => found.files.includes(file);
  return {
    styles: has("style.css") ? [`<link rel="stylesheet" href="${packageAddress(found, "style.css")}" ${mark}>`] : [],
    scripts: [
      `<script ${mark}>${describeLine({ ...descriptionOf(found), ...(has("kit.js") ? { script: true } : {}) })}</script>`,
      ...(has("kit.js") ? [`<script src="${packageAddress(found, "kit.js")}" ${mark}></script>`] : []),
    ],
  };
}

/** Where a file of a package is now, or null. */
export const packagePath = ({ folder }, file) => ownPath(folder, file);

/** A package's stamp as its files are now, for the moment before the catalog in use has taken them. */
export const packageStampNow = ({ folder, files }) => stampOf(folder, stamped(files));

// The element `text` is, when it is one instance of the package `id` and nothing else (a comment
// aside), closed by an end tag of its own, or null: what the parser closed at the end of the text
// (an end tag left out, a comment or a field left open) would take in what stands after it in a file.
function instanceIn(text, id) {
  const nodes = parseFragment(text, { sourceCodeLocationInfo: true }).childNodes.filter((node) => node.tagName || (node.nodeName === "#text" && node.value.trim()));
  const [root] = nodes;
  return nodes.length === 1 && root.tagName && isInstance(root) && attr(root, ATTRIBUTE) === id && root.sourceCodeLocation.endTag ? root : null;
}

/**
 * What a file is to hold of the instance `text` is, the one way a template or a copy's markup gets
 * there, or null: { markup, root }. Its markup is written anew from what was read, so that what the
 * parser put right is right in the file and what it dropped stays out (an end tag of nothing here
 * would close what stands around the block there), and `root` is that markup read again: what the
 * file will read, the thing to look at.
 */
export function instanceMarkup(text, id) {
  const read = instanceIn(text, id);
  const markup = read && serializeOuter(read);
  const root = markup && instanceIn(markup, id);
  return root ? { markup, root } : null;
}

// What the template of a package is: { markup } as a new instance is written, or { problem }, or
// neither where it has none. It is to be what a new instance is: one instance of the package in one
// piece, holding nothing a clipboard could not bring (refusedInCopy: a script, which would run from
// the next load on alone, a handler, the editor's marks, which a page takes for its own), and the parts
// its manifest asks for, or the block a reader makes keeps the document from passing gallery check.
function readTemplate({ id, template, parts }) {
  if (!template) return {};
  const read = instanceMarkup(template, id);
  if (!read) return { problem: said("template.html 要是这个自定义块的一个实例，有自己的结束标签，此外什么都没有") };
  const held = [];
  walk({ childNodes: [read.root] }, (node) => { if (refusedInCopy(node.tagName, node.attrs)) held.push(node.tagName); });
  if (held.length > 0) return { problem: said("template.html 里的 <{0}> 进不了新建的块：脚本、事件、样式和 Gallery 自己的标记都不写在模板里", held[0]) };
  const short = Object.entries(parts).find(([, part]) => {
    const count = partOf(read.root, part.at).length;
    return count < (part.optional ? 0 : part.min ?? 1) || count > (part.edit === "flow" ? 1 : part.max ?? Infinity);
  });
  return short ? { problem: said("template.html 的 {0} 和清单写的数目不符", short[0]) } : { markup: read.markup };
}

/** Why no menu offers the template of `found`, said()'s, for `gallery block check` to say, or null: it has none, or one no reason keeps out. */
export const templateProblem = (found) => readTemplate(found).problem ?? null;

/** The markup of an instance of `found` as a new one is written, or null: it has no template a menu offers. */
export const templateOf = (found) => readTemplate(found).markup ?? null;

/**
 * What the page the editor runs on holds of a catalog: its MAP's `components` (src/editor/service.mjs),
 * no route and no dynamic import. One entry for each package that loads, by id: { id, version, name:
 * { zh, en }, description: { zh, en }, words, definition, stamp, template (the markup "/" puts in: one
 * instance of it, or null), picture (pictureOf: { light, dark } the addresses of its PICTURES, with { light, dark } under a language of LANGUAGE_PICTURES it has too, or null where it has not its own two), state ("normal", or "hidden": a menu offers what is "normal" and reads no setting), places and listed (its manifest's, which the page's
 * settingState reads with gallery.json's lists as its event stream says them), needs, settings (the fields of its 设置 form, a
 * manifest's `settings`, [] where it has none), markdown, assets (the kit's files it asks for,
 * by id), tags (packageTags: what loads it in a page that was served without it, the line that tells the
 * kit of its parts among them), pack ({ id, name }: the pack it counts in, packOf, and what its pack.json names
 * it, null where none does: a menu writes the pack's name after a block's in grey where two packs offer
 * blocks of one name) }. A page knows what it holds of a package's parts from the kit
 * (descriptionsOf), and of one that came after it was served from these tags.
 */
export const menuOf = ({ packages, settings = NO_SETTINGS, packs = new Map() }) => [...packages.values()].sort(byId).map((found) => ({
  id: found.id,
  version: found.version,
  name: found.name,
  description: found.description,
  words: found.words,
  definition: found.definition,
  stamp: found.stamp,
  template: templateOf(found),
  picture: pictureOf(found),
  state: stateOf(found, settings),
  places: found.places,
  listed: found.listed,
  needs: found.needs,
  settings: found.settings,
  markdown: found.markdown,
  assets: found.assets,
  tags: packageTags(found),
  pack: { id: packOf(found.id, found.places), name: packs.get(packOf(found.id, found.places)) ?? null },
}));

/**
 * The workspace's packages as who lists them says them, by id: { id, version, name, description (what
 * a manifest says, null where it does not read), state ("normal", "hidden", "disabled" or "broken":
 * stateOf), reason ({ zh, en }, why it does not load of itself, or null), template (whether it has one
 * a menu can put in: with none, none can), places and needs (what its manifest says, null where it does
 * not read), hidden, shown and disabled (what gallery.json says of it), unlisted (its master switch off:
 * unlistedBy, by gallery.json's unlisted and listed and its manifest's `listed`), listedByDefault (its manifest's
 * `listed`: false, off until the user turns it on), allowed (the hosts of its needs
 * the reader allowed it to reach, gallery.json's components.net: its switch 允许联网 is on while it holds
 * every host its needs name) and menu (whether its switch
 * 在文档菜单里显示 is on: inDocumentMenus, whatever `disabled` and `unlisted` say, which are switches of their
 * own: the row's master switch is on while it is not unlisted, nor its pack's) and pack (the pack it counts in: packOf, its scope
 * but for Gallery's own blocks for documents, the default pack's) }.
 */
export const packageStates = ({ packages, problems, settings = NO_SETTINGS }) => [...packages.values(), ...problems.values()].sort(byId).map((found) => ({
  id: found.id,
  pack: packOf(found.id, found.places),
  version: found.version ?? null,
  name: found.name ?? null,
  description: found.description ?? null,
  state: stateOf(found, settings),
  reason: found.problem && !found.off ? bothProblems(found.problem) : null,
  template: Boolean(templateOf(found)),
  places: found.places ?? null,
  needs: found.needs ?? null,
  hidden: settings.hidden.includes(found.id),
  shown: settings.shown.includes(found.id),
  disabled: settings.disabled.includes(found.id),
  unlisted: unlistedBy(found.id, found.listed, settings),
  listedByDefault: found.listed !== false,
  allowed: (settings.net?.[found.id] ?? []).filter((host) => netHostsOf(found.needs).includes(host)),
  menu: inDocumentMenus(found.places, { ...settings, disabled: [], unlisted: [], packsOff: [] }, found.id),
}));

/**
 * The message that tells a page of `settings` on its event stream, its seven lists by commas (hidden,
 * disabled, shown, the consents, "<id>@<host>" each, unlisted, the packs off, and listed: those the user
 * turned on whose manifest's `listed` is false): what it offers follows
 * them, whatever it holds, and an instance whose consent changed starts again (the kit's net.js).
 */
export const settingsLine = (settings) => `settings ${settings.hidden.join(",")} ${settings.disabled.join(",")} ${settings.shown.join(",")} ${consentPairs(settings).join(",")} ${(settings.unlisted ?? []).join(",")} ${(settings.packsOff ?? []).join(",")} ${(settings.listed ?? []).join(",")}`;
