import { DOCS, isTop, newGroupId, topOf } from "./outline-shape.mjs";

// The sidebar's column and entry changes as plain functions of an outline ({ groups, children }, as
// shared/outline.mjs reads it), the same ones the workbench makes (src/workbench/app/workspace/meta.ts:
// addColumn, renameColumn, removeColumn, straysOf, detach, leaveOut), for gallery column and gallery
// workspaces --hide, which write the outline they make under its lock or through the running server
// (src/cli/tree.mjs editOutline). Each returns a new outline, or null when it changes nothing or cannot;
// the argument is never changed.

const tidy = (value) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
const listOf = (outline, key) => outline.children[key] ?? [];
const parentOf = (outline, slug) => Object.entries(outline.children).find(([, list]) => list.includes(slug))?.[0] ?? null;

function withList(outline, key, list) {
  const children = { ...outline.children };
  if (list.length || isTop(key)) children[key] = list;
  else delete children[key];
  return { ...outline, children };
}

function insert(outline, slug, parent, index) {
  const list = listOf(outline, parent).filter((each) => each !== slug);
  list.splice(index === undefined ? list.length : Math.max(0, Math.min(index, list.length)), 0, slug);
  return withList(outline, parent, list);
}

/** A new column `column` ({ id, title?, owner? }) at `index` (the end when none); null for an id there is already. */
export function addColumn(outline, column, index) {
  if (outline.groups.some((group) => group.id === column.id)) return null;
  const groups = [...outline.groups];
  groups.splice(index === undefined ? groups.length : Math.max(0, Math.min(index, groups.length)), 0, column);
  return { ...outline, groups, children: { ...outline.children, [topOf(column.id)]: [] } };
}

/** A new column's id, none of the outline's. */
export const newColumnId = (outline) => newGroupId(outline.groups);

/** Column `id` named `title` (null: back to the name it goes by); null for no such column, an extension's, an empty name or the same. */
export function renameColumn(outline, id, title) {
  const name = title === null ? null : tidy(title).slice(0, 100);
  const group = outline.groups.find((each) => each.id === id);
  if (!group || group.extension || name === "" || (name ?? undefined) === group.title) return null;
  const groups = outline.groups.map((each) => {
    if (each.id !== id) return each;
    const { title: _old, ...rest } = each;
    void _old;
    return name ? { ...rest, title: name } : rest;
  });
  return { ...outline, groups };
}

/**
 * The entries in the column `id` of a workspace that are not that workspace's drafts (documents dragged in, web
 * links, another workspace's drafts), with each one's place: [{ slug, parent, index }], in the sidebar's order.
 */
export function straysOf(outline, id) {
  const group = outline.groups.find((each) => each.id === id);
  if (!group?.workspace) return [];
  const own = `~${group.workspace}/`;
  const found = [];
  const walk = (key) => listOf(outline, key).forEach((slug, index) => {
    if (slug.startsWith(own)) walk(slug);
    else found.push({ slug, parent: key, index });
  });
  walk(topOf(id));
  return found;
}

/**
 * Column `id` removed from the sidebar as 从侧边栏移除 removes it. A workspace's column is hidden (`hidden`: the workspace,
 * its files and the registry stay), what was dragged into it going last to the own column; one the user made (or an
 * older Gallery's 链接) is deleted, its entries with those under them going last to the column of its owner's workspace
 * (the own one), no file deleted. null for the own column, an extension's, none and one hidden already.
 */
export function removeColumn(outline, id) {
  if (id === DOCS || !outline.groups.some((group) => group.id === id && !group.extension && !group.hidden)) return null;
  if (outline.groups.some((group) => group.id === id && group.workspace)) {
    let next = { ...outline, groups: outline.groups.map((group) => (group.id === id ? { ...group, hidden: true } : group)) };
    for (const { slug, parent } of straysOf(outline, id)) next = insert(withList(next, parent, listOf(next, parent).filter((each) => each !== slug)), slug, "");
    return next;
  }
  const top = topOf(id);
  const owner = outline.groups.find((group) => group.id === id)?.owner;
  const destination = owner ? topOf(outline.groups.find((group) => group.workspace === owner)?.id ?? DOCS) : "";
  const children = { ...outline.children, [destination]: [...listOf(outline, destination), ...listOf(outline, top)] };
  delete children[top];
  return { ...outline, children, groups: outline.groups.filter((group) => group.id !== id) };
}

/**
 * Draft `entry` ("~<ws id>/<slug>") taken out of the tree as 从文档树移除 takes it (the document is not touched): the entries
 * under it go up to where it was; when its workspace's column is a whole one (not `picked`), its slug is put among that
 * column's `left`, so that the column does not bring it back. null for an entry the outline does not hold.
 */
export function removeDraft(outline, entry) {
  const parent = parentOf(outline, entry);
  if (parent === null) return null;
  const siblings = listOf(outline, parent);
  const index = siblings.indexOf(entry);
  const next = withList(withList(outline, parent, [...siblings.slice(0, index), ...listOf(outline, entry), ...siblings.slice(index + 1)]), entry, []);
  const parts = /^~(ws-[0-9a-f]{6})\/(.+)$/.exec(entry);
  const group = parts ? next.groups.find((each) => each.workspace === parts[1]) : undefined;
  if (!parts || !group || group.picked) return next;
  const left = (group.left ?? []).filter((slug) => slug !== parts[2]);
  left.push(parts[2]);
  const { left: _old, ...rest } = group;
  void _old;
  return { ...next, groups: next.groups.map((each) => (each === group ? { ...rest, left } : each)) };
}
