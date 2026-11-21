import { said } from "./i18n/index.mjs";
import { isColumnSource } from "./outline-shape.mjs";
import { linkAddress, linkIcon } from "./web-links.mjs";

// The sidebar column an extension provides (docs/workbench.md "Extension columns", references/extensions.md
// for the Agent that writes one): <workspace>/extensions/<id>/sidebar.json,
//   { "title": "语雀", "icon": "📗", "entries": [
//     { "id": "team", "title": "团队知识库", "url": "https://www.yuque.com/team",
//       "children": [ { "id": "weekly", "title": "周报", "url": "https://www.yuque.com/team/weekly" } ] },
//     { "id": "panel", "title": "发布面板", "url": "http://127.0.0.1:4318/" } ] }
// `title` is the column's name (100 characters at most), `icon` an emoji or an icon of the 图标 tab (no
// picture is ever loaded from the web). An entry has an `id` (1 to 128 of A-Z a-z 0-9 . _ : -, once in
// the file: the extension keeps it, for it is what an address and an open entry go by), a `title` (200
// at most), an `url` (http or https, 2048 at most: none, and the entry only holds its `children`, which
// a click opens and closes), an `icon` and `children` (8 levels, 2000 entries in all, 1 MB the file).
// Pure and the same wherever it is read (the server answers the workbench with it, gallery extension
// check prints it); reading the file is ./extensions.mjs's (Node's). What makes the file unusable is a
// refusal (`error`, said() of a reason: the column then shows one row, 条目读不出来：<reason>); what is
// only left out of it (an icon that is none) is a note, said by gallery extension check and shown nowhere.

/** The extension's file in its folder. */
export const SIDEBAR_FILE = "sidebar.json";
/** A program extension's folder of columns its backend writes: columns/<column>.json, each read as a sidebar.json (./extensions.mjs). */
export const COLUMNS_FOLDER = "columns";
export const SIDEBAR_LIMITS = { bytes: 1_048_576, levels: 8, entries: 2000, id: 128, title: 200, column: 100 };
export const entryIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;

/** An entry's key in the workbench's address (`#~<column source>/<entry id>`: `~yuque/team`, `~yuque:docs/team`), and as its row says it. */
export const extensionKey = (extension, entry) => `~${extension}/${entry}`;
/** The extension and the entry a key names: { extension, entry }, or null for what is none. */
export function parseExtensionKey(value) {
  if (typeof value !== "string" || !value.startsWith("~")) return null;
  const at = value.indexOf("/");
  if (at < 0) return null;
  const extension = value.slice(1, at);
  const entry = value.slice(at + 1);
  return isColumnSource(extension) && entryIdPattern.test(entry) ? { extension, entry } : null;
}

const tidy = (value) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
const refused = (message) => ({ error: message });

/**
 * What the text of a sidebar.json says: { sidebar: { title, icon?, entries, count }, notes } with each
 * entry { id, title, icon?, url?, children? } (the address as the URL spells it, a title's white space
 * run together), or { error } (said(): why the file is no sidebar), the first reason found. `notes`: said()
 * of what was left out (an icon that is no emoji nor icon of the 图标 tab).
 */
export function readSidebarText(text) {
  const source = String(text);
  if (source.length > SIDEBAR_LIMITS.bytes) return refused(said("文件超过 1MB"));
  let value;
  try {
    value = JSON.parse(source.replace(/^﻿/, ""));
  } catch (error) {
    return refused(said("不是 JSON：{0}", error.message));
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return refused(said("最外层要是一个对象，有 title 和 entries"));
  const title = tidy(value.title);
  if (!title || title.length > SIDEBAR_LIMITS.column) return refused(said("title 要有，是栏的名字（100 个字以内）"));
  if (!Array.isArray(value.entries)) return refused(said("entries 要是一个列表"));
  const notes = [];
  let icon;
  if (value.icon !== undefined && value.icon !== null && value.icon !== "") {
    if (linkIcon(value.icon)) icon = value.icon;
    else notes.push(said("icon 不是表情，也不是图标页签里的图标，没有显示"));
  }
  const ids = new Set();
  let count = 0;
  const walk = (list, path, level) => {
    if (level > SIDEBAR_LIMITS.levels && list.length) return { error: said("条目超过 {0} 层（{1}）", SIDEBAR_LIMITS.levels, path) };
    const made = [];
    for (const [index, raw] of list.entries()) {
      const where = `${path}[${index}]`;
      if (++count > SIDEBAR_LIMITS.entries) return { error: said("条目超过 {0} 个", SIDEBAR_LIMITS.entries) };
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: said("{0} 要是一个对象", where) };
      if (typeof raw.id !== "string" || !entryIdPattern.test(raw.id)) return { error: said("{0} 的 id 不对（1 到 128 个字符，只能用字母、数字和 . _ : -）", where) };
      if (ids.has(raw.id)) return { error: said("{0} 的 id「{1}」重复了（同一个文件里 id 不能重）", where, raw.id) };
      ids.add(raw.id);
      const name = tidy(raw.title);
      if (!name || name.length > SIDEBAR_LIMITS.title) return { error: said("{0} 要有 title（名称，200 个字以内）", where) };
      const entry = { id: raw.id, title: name };
      if (raw.url !== undefined && raw.url !== null && raw.url !== "") {
        const address = linkAddress(raw.url);
        if (address.refused === "scheme") return { error: said("{0} 的 url 只能是 http 或 https 的网址", where) };
        if (address.refused === "long") return { error: said("{0} 的 url 太长了（最多 2048 个字符）", where) };
        if (address.refused) return { error: said("{0} 的 url 不是一个网址", where) };
        entry.url = address.url;
      }
      if (raw.icon !== undefined && raw.icon !== null && raw.icon !== "") {
        if (linkIcon(raw.icon)) entry.icon = raw.icon;
        else notes.push(said("{0} 的 icon 不是表情，也不是图标页签里的图标，没有显示", where));
      }
      if (raw.children !== undefined && raw.children !== null) {
        if (!Array.isArray(raw.children)) return { error: said("{0} 的 children 要是一个列表", where) };
        const inner = walk(raw.children, `${where}.children`, level + 1);
        if (inner.error) return inner;
        if (inner.entries.length) entry.children = inner.entries;
      }
      made.push(entry);
    }
    return { entries: made };
  };
  const walked = walk(value.entries, "entries", 1);
  if (walked.error) return refused(walked.error);
  return { sidebar: { title, ...(icon ? { icon } : {}), entries: walked.entries, count }, notes };
}

/** The entry `id` of `entries` (a tree: children under each), or null. */
export function entryIn(entries, id) {
  for (const entry of entries ?? []) {
    if (entry.id === id) return entry;
    const inside = entryIn(entry.children, id);
    if (inside) return inside;
  }
  return null;
}

/**
 * The entry key `key` (`~<extension id>/<entry id>`, a workbench's hash, decoded) names among `extensions`
 * (the columns as GET outline lists them: [{ id, entries }]), or null: what a link to an entry's address
 * opens (one with an `url`) wherever a page reads it (the workbench, a page alone in a tab, 演示视图).
 */
export function entryOfKey(extensions, key) {
  const named = parseExtensionKey(key);
  const extension = named && (extensions ?? []).find(({ id }) => id === named.extension);
  return extension ? entryIn(extension.entries, named.entry) : null;
}
