import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { descendantsIn, outlineAndFile, parentIn, placeIn, readOutline, withOutlineLock, writeOutline, writtenAs } from "./outline.mjs";
import { DOCS, GROUP_LIMITS, isForeign, isTop, newGroupId, topIn, topOf } from "./outline-shape.mjs";
import { findPreviewServer } from "./preview-server.mjs";
import { idsOf, shownIcon } from "./workspace-columns.mjs";
import { nameStops, workspaceLabels, workspaceName } from "./workspace-name.mjs";
import { isWorkspace, readRegistry, workspaceId, workspaceKey } from "./workspace-registry.mjs";
import { defaultWorkspace, documentFiles, isSlugName, listDocumentSlugs, readLink } from "./workspace.mjs";

// Registered document folders share the default home's sidebar and outline. A foreign entry is
// ~<workspace-id>/<slug>; its files, history, trash and exports remain in that folder.
// Every registered folder contributes its documents. Ordering and hierarchy have one global owner.
// addDraft/addWorkspace register or reveal a folder through the existing outline operations;
// joinDefaultTree places documents created by CLI commands in that same tree.
// A draft whose workspace is not on the registry, two registered folders sharing its id (six hex digits
// of a hash: a clash is refused, never guessed), or whose folder is gone stays in the tree, shown grey
// (找不到底稿) until the user removes it. Reads other workspaces' files only; writes this one's outline.

/** A draft's entry in the outline. */
export const DRAFT_ENTRY = /^~(ws-[0-9a-f]{6})\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;
export const draftEntry = (id, slug) => `~${id}/${slug}`;
/** The workspace's id and the slug a draft's entry names, or null for an entry that names none. */
export function draftOf(entry) {
  const match = DRAFT_ENTRY.exec(String(entry ?? ""));
  return match ? { ws: match[1], slug: match[2] } : null;
}

const oneLine = (value) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
const exists = (target) => fs.access(target).then(() => true, () => false);

/**
 * The registered workspaces by their ids: a Map of id to the roots registered under it (two for one id:
 * a clash of the hash's six digits, which names neither: workspaceOf). `registry`: readRegistry()'s.
 */
export const registeredIds = (registry = readRegistry()) => idsOf(registry);

/**
 * The workspace `id` names on the registry: { root }, or { refused: "unknown" (no registered workspace
 * of that id: forgotten, or never registered) | "ambiguous" (two registered folders share it), roots }.
 */
export function workspaceOf(id, ids = registeredIds()) {
  const roots = ids.get(id) ?? [];
  if (roots.length === 1) return { root: roots[0] };
  return { refused: roots.length ? "ambiguous" : "unknown", roots };
}

/** The ids two or more registered folders share: [{ id, roots }] (gallery workspaces and the sidebar say so). */
export const clashingIds = (ids = registeredIds()) => [...ids].filter(([, roots]) => roots.length > 1).map(([id, roots]) => ({ id, roots }));

/** Whether a draft's doc.json says it is a document (not the 写作偏好 page of an old layout), and what it says. */
async function metadataAt(folder) {
  const files = documentFiles(folder);
  const [html, metadata] = await Promise.all([exists(files.html), fs.readFile(files.json, "utf8").then((text) => JSON.parse(text.replace(/^﻿/, ""))).catch(() => null)]);
  return { files, html, metadata: metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : null };
}

/**
 * What the sidebar shows of draft `entry`: { entry, ws, slug, root (null: no workspace of that id),
 * folder, path (its doc.html, or an old one's report.html), title, description, icon, missing: null, or
 * why it is shown grey: "workspace" (none of that id on the registry, or its folder gone), "ambiguous"
 * (two of that id), "draft" (its document is gone) }.
 */
export async function draftFacts(entry, ids = registeredIds()) {
  const { ws, slug } = draftOf(entry) ?? { ws: "", slug: entry };
  const found = workspaceOf(ws, ids);
  const none = { entry, ws, slug, root: null, folder: null, path: null, title: slug, description: "", icon: null };
  if (!found.root) return { ...none, missing: found.refused === "ambiguous" ? "ambiguous" : "workspace" };
  const folder = path.join(found.root, slug);
  const link = existsSync(documentFiles(folder).html) ? null : await readLink(folder);
  if (link) return { entry, ws, slug, root: found.root, folder, path: path.join(folder, 'link.json'), title: link.title, description: '', kind: 'link', url: link.url, icon: link.icon, siteIcon: link.siteIcon, missing: null };
  const { files, html, metadata } = await metadataAt(folder);
  const missing = !isWorkspace(found.root) ? "workspace" : !html || metadata?.instructions === true ? "draft" : null;
  // An untitled document says so (its title empty: the workbench names it 未命名文档); one with no doc.json to read, its slug.
  return { entry, ws, slug, root: found.root, folder, path: files.html, title: typeof metadata?.title === "string" ? oneLine(metadata.title) : slug, description: oneLine(metadata?.description), icon: shownIcon(metadata?.icon), missing };
}

/**
 * The names the sidebar calls the registered workspaces by: a Map of id to { name, above, upper, root,
 * there }, for the ids `wanted`. `above` is what tells it apart from another of `among` (ids: those shown
 * side by side, the sidebar's columns or the list of 添加其他 Gallery 项目…; `wanted` when none is given) that has
 * its name (./workspace-name.mjs workspaceLabels), else null: never a workspace of the machine that is not
 * shown. `upper`: the name of the folder above the one named (null at a drive's root), which the sidebar
 * shows when a column of another kind has the name. `stops`: nameStops()'s (asked once by a server: it
 * reads Windows' registry).
 */
export function workspaceNames(wanted, { ids = registeredIds(), stops = nameStops(), among = wanted } = {}) {
  const named = [...ids].filter(([id, roots]) => roots.length === 1 && (wanted.has(id) || among.has(id))).map(([id, [root]]) => ({ id, root, ...workspaceName(root, { stops }) }));
  const compared = named.filter((entry) => among.has(entry.id));
  const labels = new Map(workspaceLabels(compared).map((label, index) => [compared[index].id, label]));
  const names = new Map();
  for (const entry of named) {
    if (wanted.has(entry.id)) names.set(entry.id, { name: entry.name, above: labels.get(entry.id)?.above ?? null, upper: entry.above, root: entry.root, there: isWorkspace(entry.root) });
  }
  return names;
}

/**
 * What a path the user pasted or picked (添加其他 Gallery 项目…) names: a workspace's folder, a document's
 * doc.html (an old one's report.html) or its folder; a file:// address of one too, and quotes around it are
 * taken away. One of: { kind: "workspace", root } (a folder holding Gallery's gallery.json);
 * { kind: "draft", folder, slug, root (the workspace it is in: the nearest folder up holding Gallery's
 * gallery.json; null for none, `parent` then the folder that would become one) }; { kind: "folder", folder }
 * (a folder that is no workspace yet but holds Gallery documents: the one that would become a workspace);
 * { kind: "missing" } (nothing there, or not an absolute path); { kind: "plain" } (an HTML file, or a folder
 * that is no Gallery draft, workspace or folder of documents); { kind: "nested", root } (a draft that is not
 * right in its workspace: the trash's, the 写作偏好 page's); { kind: "name" } (a folder whose name is no slug).
 */
export async function findDraft(written) {
  let target = String(written ?? "").trim().replace(/^["']+|["']+$/g, "");
  if (/^file:\/\//i.test(target)) {
    try {
      target = fileURLToPath(target);
    } catch {
      return { kind: "missing", path: target };
    }
  }
  if (!target || !path.isAbsolute(target)) return { kind: "missing", path: target };
  target = path.resolve(target);
  const stat = await fs.stat(target).catch(() => null);
  if (!stat) return { kind: "missing", path: target };
  let folder;
  if (stat.isDirectory()) folder = target;
  else if (/^(doc|report)\.html$/i.test(path.basename(target))) folder = path.dirname(target);
  else return { kind: "plain", path: target };
  if (stat.isDirectory() && isWorkspace(folder)) return { kind: "workspace", path: target, root: folder };
  const { files, html, metadata } = await metadataAt(folder);
  if (stat.isDirectory() && !html && (await listDocumentSlugs(folder).catch(() => [])).some(isSlugName)) return { kind: "folder", path: target, folder };
  if (!html || (!files.old && !metadata) || metadata?.instructions === true) return { kind: "plain", path: target };
  let root = null;
  for (let directory = path.dirname(folder); ; directory = path.dirname(directory)) {
    if (isWorkspace(directory)) {
      root = directory;
      break;
    }
    if (path.dirname(directory) === directory) break;
  }
  const slug = path.basename(folder);
  if (root && workspaceKey(path.dirname(folder)) !== workspaceKey(root)) return { kind: "nested", path: target, root };
  if (!isSlugName(slug)) return { kind: "name", path: target };
  return { kind: "draft", path: files.html, folder, slug, root, parent: path.dirname(folder) };
}

/**
 * The column of workspace `id` in `outline` (changed in place): the one that has `workspace: id`; with none
 * (a workspace the sidebar does not show as it was read: the outline of a workspace's own tree, or past 50
 * columns), one made right after the column `after` (an id; none: last), picked (`picked`) or whole, or null
 * where no column can be made (50 already: the entry goes to the own column's top).
 */
function columnFor(outline, id, { after = null, picked = false } = {}) {
  let group = outline.groups.find((each) => each.workspace === id);
  if (group) return group;
  if (outline.groups.length >= GROUP_LIMITS.groups) return null;
  group = { id: outline.groups.some((each) => each.id === id) ? newGroupId(outline.groups) : id, workspace: id, ...(picked ? { picked: true } : {}) };
  const at = outline.groups.findIndex((each) => each.id === after);
  outline.groups = at < 0 ? [...outline.groups, group] : [...outline.groups.slice(0, at + 1), group, ...outline.groups.slice(at + 1)];
  outline.children[topOf(group.id)] ??= [];
  return group;
}

/** `outline`'s column `id` (changed in place: its object replaced) as `change(column)` gives it, at index `to` when given. */
function changeColumn(outline, id, change, to = null) {
  const groups = outline.groups.filter((each) => each.id !== id);
  const at = outline.groups.findIndex((each) => each.id === id);
  const next = change(outline.groups[at]);
  groups.splice(to === null ? at : Math.min(to, groups.length), 0, next);
  outline.groups = groups;
  return next;
}

/** `outline`'s column `id` moved right after column `after` (one of it; none, or itself: where it is). */
function moveAfter(outline, id, after) {
  if (!after || after === id || !outline.groups.some((each) => each.id === after)) return;
  const groups = outline.groups.filter((each) => each.id !== id);
  groups.splice(groups.findIndex((each) => each.id === after) + 1, 0, outline.groups.find((each) => each.id === id));
  outline.groups = groups;
}

const shownColumn = ({ hidden, ...column }) => column;

/**
 * Draft `slug` of workspace `draftRoot` put in the sidebar of workspace `treeRoot` (its outline, under the
 * outline's lock; `changed()` once it is written), with the drafts under it in its own workspace's tree
 * (documents: a web link of that workspace is none, nor a draft of a third its tree shows, the drafts under
 * one going under the draft above it), those the tree does not hold yet. Its workspace's column is shown
 * again when the user had removed it (hidden). How, `pick` says:
 * - false (an Agent's gallery new or open there: joinDefaultTree, POST draft-add): one the outline holds
 *   (the file, or a whole column as it is read) stays where it is; else (a picked column) under its own
 *   parent's entry when the tree holds that, else last in its workspace's column;
 * - true (the user's pick in 添加其他 Gallery 项目…, `after`: the column whose menu it came from): one shown
 *   in the sidebar already stays where it is (revealed, `existing`); its workspace's column hidden, or one the
 *   sidebar showed not before (`fresh`: its workspace registered just now, its column made only as the outline
 *   is read, filled whole), it is made a picked one holding it and those under it alone, right after `after`;
 *   one shown picked or whole takes it (under its own parent's entry, else last: one the user had taken out of
 *   a whole one); with none, a picked column is made right after `after`.
 * Either way, what is put in a whole column is in its `left` no more.
 * Resolves to { entry, existing: whether the file held it, so that nothing was put in, parent, added: the
 * entries put in, column: the id of the column it is in, under: the entry it is under, or null, shown: whether
 * the column was shown again }.
 */
export async function addDraft(treeRoot, draftRoot, slug, { changed = () => {}, pick = false, after = null, fresh = false } = {}) {
  const id = workspaceId(draftRoot);
  const entry = draftEntry(id, slug);
  const own = await readOutline(draftRoot, { others: false }).catch(() => ({ children: {}, links: [] })); // its own tree, read alone
  // No document of that workspace: its web links, and the drafts of others its tree shows (~<ws id>/<slug>).
  const none = (key) => own.links.includes(key) || isForeign(key);
  const ownParent = (child) => {
    let up = parentIn(own.children, child);
    while (up !== null && !isTop(up) && none(up)) up = parentIn(own.children, up);
    return up === null || isTop(up) ? null : up;
  };
  return withOutlineLock(treeRoot, async () => {
    const { outline, stored } = await outlineAndFile(treeRoot);
    const holds = (key) => Object.values(outline.children).some((list) => list.includes(key));
    const storedHolds = Object.values(stored?.children ?? {}).some((list) => list.includes(entry));
    const where = () => {
      const parent = parentIn(outline.children, entry);
      const top = topIn(outline.children, entry);
      return { parent, column: top === null || top === "" ? DOCS : top.slice(1), under: parent !== null && !isTop(parent) ? parent : null };
    };
    const columnOf = (key) => outline.groups.find((each) => topOf(each.id) === topIn(outline.children, key)) ?? null;
    if (holds(entry)) {
      if (pick && fresh) {
        const column = columnOf(entry);
        if (column) moveAfter(outline, column.id, after);
      }
      if (!writtenAs(outline, stored)) { await writeOutline(treeRoot, outline); changed(); }
      const existing = !fresh && (pick || storedHolds);
      return { entry, existing, added: existing ? [] : [entry], shown: false, ...where() };
    }
    let shown = false;
    let column = outline.groups.find((each) => each.workspace === id) ?? null;
    const put = () => {
      const added = [];
      const top = column ? topOf(column.id) : topOf(DOCS);
      const above = ownParent(slug);
      placeIn(outline, entry, above !== null && holds(draftEntry(id, above)) ? draftEntry(id, above) : top);
      added.push(entry);
      for (const child of descendantsIn(own.children, slug)) {
        const childEntry = draftEntry(id, child);
        if (none(child) || holds(childEntry)) continue;
        placeIn(outline, childEntry, draftEntry(id, ownParent(child) ?? slug));
        added.push(childEntry);
      }
      // Put in again: taken out of a whole column no more.
      if (column?.left) {
        const back = new Set(added.map((each) => draftOf(each).slug));
        column = changeColumn(outline, column.id, ({ left, ...rest }) => {
          const still = left.filter((taken) => !back.has(taken));
          return still.length ? { ...rest, left: still } : rest;
        });
      }
      return added;
    };
    let added = [];
    let existing = false;
    if (!pick) {
      if (column?.hidden) {
        column = changeColumn(outline, column.id, shownColumn);
        shown = true;
      }
      existing = storedHolds;
      if (!holds(entry)) {
        column ??= columnFor(outline, id);
        added = put();
      } else if (!storedHolds) added = [entry];
    } else {
      // A column the file holds not, of a workspace the sidebar showed not before: made as it was read, whole.
      const madeNow = Boolean(column) && fresh && !(stored?.groups ?? []).some((each) => each.workspace === id);
      const at = columnOf(entry);
      const there = holds(entry) && !at?.hidden && !(madeNow && at?.id === column.id);
      if (there) existing = true;
      else if (column?.hidden || madeNow) {
        // Made a picked column holding it and those under it alone, shown, right after `after`.
        const top = topOf(column.id);
        for (const key of descendantsIn(outline.children, top)) delete outline.children[key];
        outline.children[top] = [];
        shown = Boolean(column.hidden);
        column = changeColumn(outline, column.id, ({ left: _left, ...each }) => ({ ...shownColumn(each), picked: true }));
        moveAfter(outline, column.id, after);
        added = put();
      } else {
        column ??= columnFor(outline, id, { after, picked: true });
        added = put();
      }
    }
    if (!writtenAs(outline, stored)) {
      await writeOutline(treeRoot, outline);
      changed();
    }
    return { entry, existing, added, shown, ...where() };
  });
}

/**
 * Workspace `otherRoot` shown whole in the sidebar of workspace `treeRoot` (添加其他 Gallery 项目… with a
 * workspace: its outline, under the outline's lock; `changed()` once it is written): its column (made when
 * there is none) shown, whole (all its documents, those the user had taken out of it too: those no column
 * holds come as the outline is read), right after the column `after` (an id). Resolves to { column: its id,
 * moved, shown, whole: whether each changed }.
 */
export async function addWorkspace(treeRoot, otherRoot, { changed = () => {}, after = null } = {}) {
  const id = workspaceId(otherRoot);
  return withOutlineLock(treeRoot, async () => {
    const { outline, stored } = await outlineAndFile(treeRoot);
    let column = columnFor(outline, id, { after });
    if (!column) return { column: null, moved: false, shown: false, whole: false };
    const shown = Boolean(column.hidden);
    const whole = Boolean(column.picked || column.left);
    // Whole: all its documents, those the user took out of it before too (its `left` gone).
    column = changeColumn(outline, column.id, ({ picked: _picked, left: _left, ...each }) => shownColumn(each));
    const before = outline.groups.findIndex((each) => each.id === column.id);
    moveAfter(outline, column.id, after);
    const moved = outline.groups.findIndex((each) => each.id === column.id) !== before;
    if (!writtenAs(outline, stored)) {
      await writeOutline(treeRoot, outline);
      changed();
    }
    return { column: column.id, moved, shown, whole };
  });
}

/**
 * The other registered workspaces (but `treeRoot`'s own), for 添加其他 Gallery 项目…'s list: [{ ws, root, name,
 * above, documents: [{ entry, slug, title, icon, path, depth }] }], each workspace's documents in the order
 * its own sidebar has them (depth: how deep under others there), those whose folder is no workspace now left
 * out, a clash of ids too (refused, never guessed), the one used last first. Reads files only: nothing of
 * another workspace is written (its 写作偏好 page is no draft).
 */
export async function projectChoices(treeRoot, { ids = registeredIds(), stops = nameStops(), registry = readRegistry() } = {}) {
  const seen = new Map(registry.workspaces.map(({ root, seen: at }) => [workspaceKey(root), Date.parse(at)]));
  const wanted = new Set([...ids].filter(([, roots]) => roots.length === 1 && workspaceKey(roots[0]) !== workspaceKey(treeRoot)).map(([id]) => id));
  const names = workspaceNames(wanted, { ids, stops });
  const found = await Promise.all([...names].filter(([, { there }]) => there).map(async ([id, { name, above, root }]) => {
    const tree = await readOutline(root, { others: false }).catch(() => null);
    const documents = [];
    const isDocument = (slug) => !(tree?.links ?? []).includes(slug) && !isForeign(slug) && isSlugName(slug);
    const walk = (key, depth) => (tree?.children[key] ?? []).forEach((slug) => {
      const document = isDocument(slug);
      if (document) documents.push({ slug, depth });
      walk(slug, document ? depth + 1 : depth);
    });
    for (const { id: column } of tree?.groups ?? []) walk(topOf(column), 0);
    const listed = await Promise.all(documents.map(async ({ slug, depth }) => {
      const { files, metadata } = await metadataAt(path.join(root, slug));
      return { entry: draftEntry(id, slug), slug, title: oneLine(metadata?.title) || slug, icon: shownIcon(metadata?.icon), path: files.html, depth };
    }));
    return { ws: id, root, name, above, seen: seen.get(workspaceKey(root)) ?? 0, documents: listed };
  }));
  return found.sort((a, b) => b.seen - a.seen).map(({ seen: _seen, ...rest }) => rest);
}


/** Put a project document in home's shared outline through the single service's draft-add
 * command when running, otherwise through the same outline lock offline. */
export async function joinDefaultTree(root, slug, { env = process.env } = {}) {
  const home = defaultWorkspace({ env });
  if (workspaceKey(home) === workspaceKey(root) || !isWorkspace(home)) return null;
  const ids = registeredIds();
  const found = workspaceOf(workspaceId(root), ids);
  if (!found.root || workspaceKey(found.root) !== workspaceKey(root)) return null;
  let done = null;
  try {
    const server = await findPreviewServer();
    if (server) {
      const origin = `http://127.0.0.1:${server.port}`;
      const response = await fetch(`${origin}/__gallery/workspace/draft-add`, {
        method: "POST", headers: { "Content-Type": "application/json", Origin: origin, "X-Gallery-Token": server.token },
        body: JSON.stringify({ path: path.join(root, slug) }), signal: AbortSignal.timeout(30000),
      });
      const answer = await response.json();
      if (!answer.ok) throw new Error(answer.message ?? "Could not register the document");
      done = answer;
    }
    done ??= await addDraft(home, root, slug);
  } catch (error) {
    return { failed: error.message, home };
  }
  return { ...done, home, names: await placeNames(home, done, ids) };
}

// The names a line says of where a draft went: its column's (the user's title, else its workspace's
// name, else 默认文档, the default workspace's own column, or 链接) and the title of the draft or document it is under.
async function placeNames(home, { column, under }, ids) {
  const { groups } = await readOutline(home);
  const group = groups.find((each) => each.id === column);
  let name = group?.title ?? null;
  if (!name && group?.workspace) name = workspaceNames(new Set([group.workspace]), { ids }).get(group.workspace)?.name ?? null;
  name ??= group?.role === "links" ? "链接" : group?.id === DOCS || !group ? "默认文档" : "未命名栏"; // its own column is the default workspace's
  let above = null;
  if (under) {
    if (draftOf(under)) above = (await draftFacts(under, ids)).title;
    else {
      const metadata = await fs.readFile(documentFiles(path.join(home, under)).json, "utf8").then(JSON.parse, () => null);
      above = oneLine(metadata?.title) || under;
    }
  }
  return { column: name, under: above };
}

/** The line gallery new and gallery open print of joinDefaultTree's answer (null for none). */
export function joinedLine(joined) {
  if (!joined) return null;
  const where = `默认工作区（${joined.home}）的侧边栏`;
  if (joined.failed) return `${where}：没有加进去（${joined.failed}）`;
  if (joined.existing) return `${where}里已经有它（${joined.names.under ? `在「${joined.names.under}」下面` : `「${joined.names.column}」栏`}）`;
  const more = joined.added.length > 1 ? `，连同它下面的 ${joined.added.length - 1} 篇` : "";
  return `${where}：已加进${joined.names.under ? `「${joined.names.under}」下面` : `「${joined.names.column}」栏`}${more}（工作区内排序全局同步，文件位置不变）`;
}

/** Whether a gallery.json at `folder` would be another program's or not readable (what draft-add refuses to make a workspace of). */
export const foreignMarker = (folder) => existsSync(path.join(folder, "gallery.json")) && !isWorkspace(folder);
