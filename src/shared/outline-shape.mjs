// The shape of the sidebar's tree (the workspace's outline, ./outline.mjs reads and writes its file),
// pure, the same on the server and in the workbench (workspace/meta.ts): the columns of the sidebar,
// each a list of entries under one another, and what names them.
//
// A column (栏) is { id, title?, role?, workspace?, picked?, hidden?, left? }: "docs" is the workspace's own
// column (its own documents; 默认文档 when it is the default workspace, else called by the workspace's
// name), always there and never removed; workspace "<ws-id>" is another registered workspace's column
// (./workspace-columns.mjs: one for each registered workspace, made as the outline is read; "whole",
// holding all its documents, those no column holds coming last in it but the ones in its `left` (the slugs
// there of the documents the user took out: 从文档树移除), or `picked`, holding only the documents put in
// it: 添加其他 Gallery 项目… with a document; `hidden` once the user removed it from the sidebar, kept so
// that it comes back as it was); another is one the user made (a column's ⋯ › 新建栏),
// or of an older kind still read: role "links" (链接, where the web links went before 2026-11-09);
// extension "<id>" for the column an extension provides
// (extensions/<id>/sidebar.json: ./extension-sidebar.mjs), "<id>:<column>" for one its program writes in
// its columns/ folder (columns/<column>.json, shown while the extension is enabled): its place is kept here, so that it can be
// dragged, but its title and its entries are the extension's, never the outline's. `title` is the
// user's name for it; none, the name it goes by in the UI's language (文档, 链接, …). Its order is the sidebar's.
// An entry is a document's or a web link's slug of this workspace; "~<ws-id>/<slug>" names a draft of
// another workspace (./drafts.mjs: kept in the outline whether it is there or not).
// In the outline as read, every list is one of `children`: under a top key, a column's top level (""
// the 文档 column's, as before columns came, ":<id>" another's), under a slug, the entries under that
// entry. So an entry moved to another column is an entry moved under another parent, and the 文档
// column's tree is what an outline of version 1 was.

/** The 文档 column's id: the workspace's own documents, never removed. */
export const DOCS = "docs";
/** A column's id: a slug's letters ("docs", "g-7k2m", "ws-3f2a9c"), 64 at most. */
export const groupIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** An entry: a slug of this workspace, or a draft of another, "~ws-<6 hex>/<slug>". */
export const entryPattern = /^(?:~ws-[0-9a-f]{6}\/)?[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** The roles a column can have: the one web links went to before 2026-11-09 (none is made any more; one there stays). */
export const GROUP_ROLES = ["links"];
export const GROUP_LIMITS = { groups: 50, title: 100, left: 1000 };
/** A slug of a workspace (a document's, a web link's folder name). */
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * An extension's id, the name of its folder under extensions/: a slug of 48 letters, digits and dashes
 * at most (its column's id is ext-<id>, 64 at most), and never the notation of a workspace's id
 * (ws-<6 hex>: the address `#~ws-…/<slug>` names a draft of another workspace, `#~<id>/<entry>` an
 * entry of an extension).
 */
export const EXTENSION_ID_MAX = 48;
export const extensionIdPattern = /^(?!ws-[0-9a-f]{6}$)[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const isExtensionId = (id) => typeof id === "string" && id.length <= EXTENSION_ID_MAX && extensionIdPattern.test(id);
/**
 * What an extension's column is named by (its "source"): the extension's id for its sidebar.json, or
 * "<id>:<column>" for columns/<column>.json, the column's id a name of the same letters. It is the column's
 * `extension` in the outline, its group id after ext- and its entries' keys after ~ (`~yuque:docs/team`).
 */
export const isColumnSource = (value) => {
  if (typeof value !== "string") return false;
  const parts = value.split(":");
  return parts.length <= 2 && parts.every(isExtensionId);
};
/** The extension a column source is of, and its columns/ column (null for its sidebar.json). */
export const sourceParts = (source) => { const [extension, column = null] = source.split(":"); return { extension, column }; };
/** The id of the column extension source `id` makes (ext-<id>, or ext-<id>:<column>, 101 at most). */
export const extensionGroupId = (id) => `ext-${id}`;

/** A column's top key in the outline's children: "" for 文档 (as before columns came), ":<id>" for another. */
export const topOf = (id) => (id === DOCS ? "" : `:${id}`);
/** Whether a key of the children is a column's top level (else it is an entry's). */
export const isTop = (key) => key === "" || key.startsWith(":");
/** The column whose top key `key` is. */
export const groupOfTop = (key) => (key === "" ? DOCS : key.slice(1));
/** Whether `entry` names a draft of another workspace. */
export const isForeign = (entry) => entry.startsWith("~");

/** File ownership is independent of which workspace's window is open. */
export const entryWorkspace = (entry, self) => /^~(ws-[0-9a-f]{6})\//.exec(entry)?.[1] ?? self;
export const columnWorkspaceId = (column, self) => column?.extension ? null : column?.workspace ?? column?.owner ?? self;

const tidy = (value) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

/** A whole column's `left` as it is kept: the slugs once each, 1000 at most; none when there are none. */
const leftOf = (value) => {
  const left = [...new Set(value.filter((slug) => typeof slug === "string" && slugPattern.test(slug)))].slice(0, GROUP_LIMITS.left);
  return left.length ? { left } : {};
};

/**
 * Column `value` as it is kept ({ id, title?, role?, workspace?, picked?, hidden?, left? } or an extension's { id, extension }),
 * or null for one that is none. An extension's column is its id's, whatever else a file says of it: no
 * title (the extension's own), role or workspace.
 */
export function groupOf(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { id, role, workspace, extension } = value;
  // An extension's column is named by its source (isColumnSource), a columns/ one's with a colon in it.
  if (isColumnSource(extension) && id === extensionGroupId(extension)) return { id, extension };
  if (typeof id !== "string" || id.length > 64 || !groupIdPattern.test(id)) return null;
  const title = tidy(value.title).slice(0, GROUP_LIMITS.title);
  const isWorkspaceColumn = typeof workspace === "string" && /^ws-[0-9a-f]{6}$/.test(workspace) && id !== DOCS;
  return {
    id,
    ...(title ? { title } : {}),
    ...(GROUP_ROLES.includes(role) && id !== DOCS ? { role } : {}),
    ...(isWorkspaceColumn ? { workspace } : {}),
    ...(typeof value.owner === "string" && /^ws-[0-9a-f]{6}$/.test(value.owner) && !isWorkspaceColumn && id !== DOCS ? { owner: value.owner } : {}),
    // A workspace's column alone is picked or hidden (the user's columns and 链接 are removed, never hidden).
    ...(isWorkspaceColumn && value.picked === true ? { picked: true } : {}),
    ...(isWorkspaceColumn && value.hidden === true ? { hidden: true } : {}),
    // What the user took out of a whole one (a picked one holds what was put in it: nothing to leave out).
    ...(isWorkspaceColumn && value.picked !== true && Array.isArray(value.left) ? leftOf(value.left) : {}),
  };
}

/** Whether `groups` is a list of columns to keep: each a column, ids once each, 文档 among them, 50 at most. */
export function validGroups(groups) {
  if (!Array.isArray(groups) || groups.length === 0 || groups.length > GROUP_LIMITS.groups) return false;
  const ids = new Set();
  for (const value of groups) {
    const group = groupOf(value);
    if (!group || ids.has(group.id)) return false;
    if (value.title !== undefined && (typeof value.title !== "string" || tidy(value.title).length > GROUP_LIMITS.title)) return false;
    if (value.role !== undefined && !GROUP_ROLES.includes(value.role)) return false;
    if (value.extension !== undefined && group.extension !== value.extension) return false;
    if (value.owner !== undefined && group.owner !== value.owner) return false;
    if (value.left !== undefined && (!Array.isArray(value.left) || value.left.length > GROUP_LIMITS.left || !value.left.every((slug) => typeof slug === "string" && slugPattern.test(slug)))) return false;
    ids.add(group.id);
  }
  return ids.has(DOCS);
}

/** A new column's id, none of `groups`' (g- and four letters or digits). */
export function newGroupId(groups, random = Math.random) {
  for (;;) {
    const id = `g-${Math.floor(random() * 36 ** 4).toString(36).padStart(4, "0")}`;
    if (!groups.some((group) => group.id === id)) return id;
  }
}

/** The top key of the column `slug` is in (walking up `children`), or null when the outline holds it not. */
export function topIn(children, slug) {
  const parentOf = (entry) => {
    for (const [key, list] of Object.entries(children)) if (list.includes(entry)) return key;
    return null;
  };
  const seen = new Set();
  for (let key = parentOf(slug); key !== null; key = parentOf(key)) {
    if (isTop(key)) return key;
    if (seen.has(key)) return null;
    seen.add(key);
  }
  return null;
}
