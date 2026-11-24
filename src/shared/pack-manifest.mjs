import { OWN_SCOPE } from "./components/installed.mjs";
import { refusal, said } from "./i18n/index.mjs";
import { DEVICE_NAMES } from "./workspace.mjs";

export { OWN_SCOPE };

// A block pack's manifest (自定义块包, since 2026-11-09; docs/render.md "Block
// packs"): pack.json at the top of a pack, a folder of components/ whose blocks are its scope's
// (components/<id>/<name>/, the block's id <id>/<name>), what a pack says of itself to whoever lists it
// (设置 › 组件列表's pack cards, gallery block pack list) and to whoever installs it (./block-packs.mjs).
// Plain data, as a block's manifest is: a field it does not know keeps it from reading, so that a pack
// made for a later Gallery says so rather than half reads.
//
//   id           the scope its blocks are of: lowercase letters, digits and hyphens (my-cards); not
//                local, the workspace's own blocks' scope, nor a name Windows keeps for a device
//   name         what a reader calls it: words, or { zh, en } in both languages
//   description  what it is, the same way (optional)
//   version      x.y.z
//   author       who made it, words (optional)
//   homepage     where it comes from, an http(s) address (optional)
//   icon         an emoji or a character or two its card shows (optional; a card has the custom block's mark)

/** The file that makes a folder of components/ a pack. */
export const PACK_FILE = "pack.json";

/** What a pack's id, a scope, may be: as a block id's scope (shared/components/installed.mjs PACKAGE_ID). */
export const PACK_ID = /^[a-z0-9][a-z0-9-]*$/;

// OWN_SCOPE (shared/components/installed.mjs, which the page reads too): the scope a block of the workspace's
// own is in (gallery block new local/<name>, or a <name> alone), which no pack installed takes: the default
// pack (默认块包, DEFAULT_PACK), where an Agent's block goes when it names no pack, so that a single block
// needs no pack of its own, and where Gallery's own blocks for documents count (packOf: gallery/card, the
// chart card and the metric, their ids as ever). It has no pack.json (none may name
// it): its name and words are these, and 设置 › 组件列表 lists it first, its blocks or none (shared/block-packs.mjs).

/** What the default pack (OWN_SCOPE's) is called and says of itself, in both languages. */
export const DEFAULT_PACK = Object.freeze({
  name: Object.freeze({ zh: "默认块包", en: "Default pack" }),
  description: Object.freeze({
    zh: "文档里常用的卡片和指标，以及 Agent 写自定义块时没有指定块包的块。只写一个块，不用另建块包。",
    en: "The card and metric documents use, and an Agent's custom block when it names no pack: a single block needs no pack of its own.",
  }),
});

const FIELDS = ["id", "name", "description", "version", "author", "homepage", "icon"];
const VERSION = /^\d+\.\d+\.\d+$/;
const isTable = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const isWords = (value) => typeof value === "string" && value.trim() !== "";
const fail = (message) => {
  throw refusal(message, { code: "manifest" });
};

// Words a reader reads, in both languages: one string for both, or { zh, en }.
function bothOf(value, field) {
  if (isWords(value) && value.length <= 300) return { zh: value.trim(), en: value.trim() };
  if (isTable(value) && Object.keys(value).length === 2 && isWords(value.zh) && isWords(value.en) && value.zh.length <= 300 && value.en.length <= 300) return { zh: value.zh.trim(), en: value.en.trim() };
  fail(said("pack.json 的 {0} 要写成一段文字，或 { zh, en } 两种语言的文字", field));
}

/**
 * pack.json's text read as a pack's manifest: { id, name: { zh, en }, description: { zh, en } | null,
 * version, author, homepage, icon (each null where it says none) }. One that does not read as one is
 * refused (code "manifest") with why, said()'s.
 */
export function readPackManifest(text) {
  let value;
  try {
    value = JSON.parse(String(text).replace(/^﻿/, ""));
  } catch {
    fail(said("pack.json 不是 JSON"));
  }
  if (!isTable(value)) fail(said("pack.json 要写成一张表"));
  for (const key of Object.keys(value)) if (!FIELDS.includes(key)) fail(said("{0} 不是 pack.json 能写的字段", key));
  const { id, name, description, version, author, homepage, icon } = value;
  if (id === undefined) fail(said("pack.json 缺少 {0}", "id"));
  if (typeof id !== "string" || !PACK_ID.test(id) || DEVICE_NAMES.has(id)) fail(said("pack.json 的 id 只用小写字母、数字和连字符，如 my-cards"));
  if (id === OWN_SCOPE) fail(said("{0} 留给工作区自己的块，块包换一个 id", OWN_SCOPE));
  if (name === undefined) fail(said("pack.json 缺少 {0}", "name"));
  if (version === undefined) fail(said("pack.json 缺少 {0}", "version"));
  if (typeof version !== "string" || !VERSION.test(version)) fail(said("pack.json 的 version 要写成 1.0.0 这样的三段数字"));
  if (author !== undefined && !(isWords(author) && author.length <= 100)) fail(said("pack.json 的 {0} 要写成一段文字", "author"));
  if (homepage !== undefined && !(typeof homepage === "string" && /^https?:\/\/\S+$/.test(homepage) && homepage.length <= 500)) fail(said("pack.json 的 homepage 要写成 http 或 https 开头的地址"));
  if (icon !== undefined && !(isWords(icon) && [...icon].length <= 8 && !/[<>&"]/.test(icon))) fail(said("pack.json 的 icon 要写成一个表情或一两个字"));
  return {
    id,
    name: bothOf(name, "name"),
    description: description === undefined ? null : bothOf(description, "description"),
    version,
    author: author?.trim() ?? null,
    homepage: homepage ?? null,
    icon: icon?.trim() ?? null,
  };
}
