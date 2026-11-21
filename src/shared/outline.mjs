import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { writeAtomic } from "./files.mjs";
import { extensionColumnIds } from "./extensions.mjs";
import { DOCS, columnWorkspaceId, entryWorkspace, entryPattern, extensionGroupId, GROUP_LIMITS, groupOf, groupOfTop, isForeign, isTop, newGroupId, sourceParts, topIn, topOf, validGroups } from "./outline-shape.mjs";
import { storedHead } from "./sidebar-head.mjs";
import { forgetSnapshot, shownWorkspaces, snapshotOf } from "./workspace-columns.mjs";
import { defaultWorkspace, layoutOf, listDocumentSlugs, listLinkSlugs, pageSlug } from "./workspace.mjs";
import { readRegistry, workspaceId, workspaceKey } from "./workspace-registry.mjs";

/** All document folders share the default workspace’s outline. */
export const outlineRoot = () => defaultWorkspace();

/** Moving a reference across owners must use the confirmed copy command. */
export function ownsOutline(root, value) {
  const self = workspaceId(root);
  const available = new Set([self, ...shownWorkspaces(root).map(workspace => workspace.id)]);
  return Object.entries(value.children).every(([parent, list]) => {
    const owner = isTop(parent) ? columnWorkspaceId(value.groups?.find(group => topOf(group.id) === parent), self) : entryWorkspace(parent, self);
    // Missing legacy references remain removable and must not block edits to healthy documents.
    return list.every(entry => !available.has(entryWorkspace(entry, self)) || entryWorkspace(entry, self) === owner);
  });
}

// Earlier versions allowed mixed-workspace nesting. Return misplaced roots to their owner,
// retaining same-owner order and descendants. This changes directory positions, never files.
function ownedTree(tree, self) {
  const children = Object.fromEntries(tree.groups.map(group => [topOf(group.id), []]));
  const ownTop = owner => { const group = tree.groups.find(group => owner === self ? group.id === DOCS : group.workspace === owner); return group ? topOf(group.id) : null; };
  const walk = (parent, owner) => {
    for (const entry of tree.children[parent] ?? []) {
      const belongs = entryWorkspace(entry, self);
      const at = belongs === owner ? parent : ownTop(belongs) ?? parent;
      (children[at] ??= []).push(entry);
      walk(entry, belongs);
    }
  };
  for (const group of tree.groups) if (!group.extension) walk(topOf(group.id), columnWorkspaceId(group, self));
  return { ...tree, children };
}

// Registered workspaces project one shared tree, partitioned by file owner. Their former local files
// only seed new entries; the default workspace stores subsequent order/hierarchy edits. The format
// below is also the standalone/legacy reader. Its picked/hidden/left rules are not applied to shared
// trees, which list every registered document and link. Extensions are read from home alone.
// The workspace's outline: the sidebar's columns and which entry sits under which, in what order
// (<workspace>/.gallery/outline.json, docs/workbench.md "Workspace commands"; its shape: ./outline-shape.mjs).
// The file, version 2:
//   { version: 2, children: { "": [the 文档 column's top], "<slug>": [entries under it] },
//     groups: [{ id: "docs", title? }, { id, title?, role?, workspace?, children: { "": [its top], "<slug>": […] } }] }
// The 文档 column's tree is the top-level `children`, as in version 1 ({ version: 1, children }, the
// 文档 column alone, read as such), so that an older Gallery reads the documents' order as before.
// Hierarchy and order only: an entry's folder never moves with it, and no file of a document names
// where it is (links between documents are relative links between their files). Read, it lists every
// document and web link of the workspace once but the 写作偏好 page (listed apart, in .gallery/pages/):
// entries that are gone drop out, documents it does not know yet come last in the own column (文档's
// place, top key ""), links last in a column of the links an older Gallery made (else in the own column).
// Every other registered workspace has a column (./workspace-columns.mjs): one the file
// holds not yet is made as it is read (the default workspace's right after the own column, the others
// last), and a "whole" column (not `picked`) holds every document of its workspace the outline holds not
// but those the user took out (its `left`): under its own parent's entry when the outline holds that,
// else last in the column, the first time laid out as its own sidebar has them. A draft of another
// workspace ("~<ws id>/<slug>": ./drafts.mjs) stays where the file has it while its document is there;
// one gone from a workspace the sidebar shows leaves, one of a workspace it does not show (not
// registered, a clash of ids, its folder away) stays, shown grey (找不到底稿), until it is removed; one of a
// workspace whose folder did not read this time (an error of the disk: otherWorkspaces' `failed`) stays
// too, and its column is not filled. A column the sidebar does not draw (the user removed it, `hidden`;
// its workspace not shown) keeps its workspace's drafts alone: any other entry there (a document of this
// workspace, a web link, a draft of a third, dragged in) comes last in the own column with what is under it,
// so that nothing the user put there is out of sight. `others: false` reads the workspace's tree alone (what
// another workspace's sidebar reads of it, and what the commands of that workspace's own tree read).
// The columns extensions provide (extensions/<id>/sidebar.json: ./extensions.mjs) are among the groups as
// { id: "ext-<id>", extension: "<id>" }, each there while its extension has a sidebar.json: one it has not
// got yet comes last (not written until the outline is), one whose extension is gone drops out, and what an
// outline says of its entries is passed over (an extension's entries are its own, never the outline's).
// Their place is what the outline keeps of them.
// The file also keeps the order of the sidebar's head rows (`head`: 新建, 搜索 and the custom pages,
// ./sidebar-head.mjs), which only a drag of a head row and a new page write (writeHead), and every write
// of the tree keeps as it was (writeOutline).
// Written by the workspace's server (src/workbench/service.mjs: the workbench's moves and columns, a new,
// copied, restored or imported document, a new link, gallery new --under, gallery move and gallery link
// add while it runs, in the queue its saves go through), and by a gallery command when no server runs
// (src/cli/tree.mjs), with the same functions, each change read, made and written under the outline's
// lock (withOutlineLock: a file that two processes cannot both make), so that two writers never lose
// each other's change.

/** The outline file's lock (.gallery/outline.lock): who holds it, until when it counts. */
const LOCK_STALE = 10_000; // a lock older than this was left by a process that ended: taken over
const LOCK_WAIT = 15_000;

/**
 * Run `task` holding the outline's lock of workspace `root`: a file made with "wx", which one
 * process alone can make, removed after; one older than 10 s is a crashed writer's and is taken over.
 * A live writer refreshes its lock. Waits 15 s at most and then refuses rather than stealing it.
 */
export async function withOutlineLock(root, task, { local = false } = {}) {
  if (!local) root = outlineRoot(root);
  const { gallery } = layoutOf(root);
  const lock = path.join(gallery, "outline.lock");
  const mine = `${process.pid} ${randomBytes(4).toString("hex")}`;
  await fs.mkdir(gallery, { recursive: true });
  for (const until = Date.now() + LOCK_WAIT; ;) {
    try {
      await fs.writeFile(lock, mine, { flag: "wx" });
      break;
    } catch (error) {
      // Windows can briefly keep a just-unlinked lock delete-pending. Wait for the
      // handle to close; do not remove a live writer's lock or treat it as stale.
      if (process.platform === 'win32' && ['EPERM', 'EBUSY'].includes(error.code) && Date.now() <= until) {
        await new Promise(resolve => setTimeout(resolve, 20));
        continue;
      }
      if (error.code !== "EEXIST") throw error;
      const age = await fs.stat(lock).then(({ mtimeMs }) => Date.now() - mtimeMs, () => 0);
      if (age > LOCK_STALE) await fs.rm(lock, { force: true });
      else if (Date.now() > until) throw Object.assign(new Error("文档目录刚在别处改过"), { code: "stale" });
      else await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  const heartbeat = setInterval(() => fs.utimes(lock, new Date(), new Date()).catch(() => {}), LOCK_STALE / 3);
  heartbeat.unref();
  try {
    return await task();
  } finally {
    clearInterval(heartbeat);
    // Removed only while it is still this writer's (one taken over meanwhile is the next writer's).
    if ((await fs.readFile(lock, "utf8").catch(() => null)) === mine) await fs.rm(lock, { force: true });
  }
}

const readJson = (file) => fs.readFile(file, "utf8").then(JSON.parse).catch(() => null);

/** The outline of workspace `root` as it is read: every entry once (above). `others`: with the other workspaces' columns. */
export async function readOutline(root, { others = true } = {}) {
  return (await outlineAndFile(root, { others })).outline;
}

/**
 * The other workspaces the sidebar of workspace `root` shows a column of, each with what its own sidebar
 * holds (./workspace-columns.mjs shownWorkspaces, snapshotOf): [{ id, root, isDefault, documents, order,
 * parentOf, facts, failed }]. `failed`: its folder did not read this time (EPERM, EBUSY, EIO: a network or
 * removable drive), none of its documents known, so that the outline drops none of its drafts for it.
 */
export async function otherWorkspaces(root, { env = process.env } = {}) {
  const shown = shownWorkspaces(root, { env });
  // Project-local files seed entries not yet in the shared tree; never recurse into its projection.
  const readOwn = async (other) => (await localOutlineAndFile(other, { others: false })).outline;
  const unread = () => ({ documents: new Set(), order: [], parentOf: new Map(), facts: new Map(), failed: true });
  return Promise.all(shown.map(async (each) => ({ ...each, failed: false, ...(await snapshotOf(each.root, readOwn).catch(unread)) })));
}

/**
 * The outline as it is read and what its file holds: { outline: { version: 2, groups, children,
 * links: the slugs of its web links, drafts: the entries of other workspaces' drafts, shown: the other
 * workspaces whose columns it shows ([{ id, root, isDefault }]: otherWorkspaces) }, stored: the file's
 * columns and children as the outline has them (storedOf), or null; others: otherWorkspaces' answer }. A
 * change is written when what it makes is not what the file holds (writtenAs), a document or a link the
 * file does not hold yet too (one made since, placed only as it is read), so that the file keeps every
 * place a command or the workbench gave. `others: false`: the workspace's own tree alone (no column of
 * another workspace made, none filled).
 */
async function localOutlineAndFile(root, { others: withOthers = true, shared = false } = {}) {
  const instructions = await pageSlug(root);
  const documents = (await listDocumentSlugs(root)).filter((slug) => slug !== instructions);
  const links = await listLinkSlugs(root);
  const extensions = await extensionColumnIds(root);
  const stored = storedOf(await readJson(layoutOf(root).outline));
  const others = withOthers ? await otherWorkspaces(root) : [];
  const base = shared && stored ? { ...stored, groups: stored.groups.map(({ picked, hidden, left, ...group }) => group.workspace || group.extension || group.id === DOCS ? group : { ...group, owner: group.owner ?? workspaceId(root) }) } : stored;
  let shown = ordered(base, documents, links, extensions, others, { drawn: withOthers });
  if (shared) shown = ownedTree(shown, workspaceId(root));
  const outline = {
    version: 2, ...shown, links, drafts: Object.values(shown.children).flat().filter(isForeign),
    shown: others.map(({ id, root: other, isDefault }) => ({ id, root: other, isDefault })),
  };
  return { outline, stored, others };
}

/** Translate the same tree between the default workspace's ids and a project's local ids.
 * No second ordering is kept: only the current workspace's column is displayed first. */
function projectTree(value, from, to) {
  if (!value || workspaceKey(from) === workspaceKey(to)) return value;
  const fromId = workspaceId(from), toId = workspaceId(to);
  const own = value.groups.find(group => group.workspace === toId);
  const ownId = own?.id ?? toId;
  const groupId = id => id === DOCS ? fromId : id === ownId ? DOCS : id;
  const entry = key => key.startsWith(`~${toId}/`) ? key.slice(toId.length + 2) : isForeign(key) ? key : `~${fromId}/${key}`;
  const key = value => isTop(value) ? topOf(groupId(groupOfTop(value))) : entry(value);
  let groups = value.groups.map(group => {
    if (group.id === DOCS) return { ...group, id: fromId, workspace: fromId };
    if (group.id === ownId) {
      const { workspace, picked, hidden, left, ...rest } = group;
      return { ...rest, id: DOCS };
    }
    return group;
  });
  return { ...value, groups, children: Object.fromEntries(Object.entries(value.children).map(([parent, list]) => [key(parent), list.map(entry)])) };
}

export async function outlineAndFile(root, { others: withOthers = true } = {}) {
  const home = outlineRoot(root);
  if (workspaceKey(home) === workspaceKey(root)) return localOutlineAndFile(root, { others: withOthers, shared: true });
  // A command may just have created/trashed a local item before placing it in the shared tree.
  forgetSnapshot(root);
  const shared = await localOutlineAndFile(home, { shared: true });
  let outline = projectTree(shared.outline, home, root);
  const ownLinks = await listLinkSlugs(root);
  const others = await otherWorkspaces(root);
  outline = { ...outline, links: ownLinks, drafts: Object.values(outline.children).flat().filter(isForeign), shown: others.map(({ id, root: other, isDefault }) => ({ id, root: other, isDefault })) };
  return { outline, stored: projectTree(shared.stored, home, root), others };
}

// The own column's name before it was 默认文档 or the workspace's (文档, Documents in English), which a
// rename of it confirmed unchanged wrote as its title (the field opens with the name shown): read as no
// title, so that the name it goes by now shows. A title of another column, or any other, is the user's.
const OLD_DOCS_NAMES = ["文档", "Documents"];

/**
 * What outline.json's value `file` holds, as the outline has it: { groups, children } (the 文档 column's
 * tree from the file's own `children`, every other column's from its `children`, its top under its top
 * key), or null for a file that is not there or not an outline. A file of version 1 is the 文档 column alone.
 * The own column titled with its old name (OLD_DOCS_NAMES) has none.
 */
export function storedOf(file) {
  if (!file || typeof file !== "object" || Array.isArray(file)) return null;
  // A file that holds the head's order alone (writeHead's, before any tree was written) holds no tree.
  if (!Object.hasOwn(file, "children") && !Object.hasOwn(file, "groups")) return null;
  const groups = [];
  const children = {};
  const take = (id, own) => {
    if (!own || typeof own !== "object" || Array.isArray(own)) return;
    for (const [key, list] of Object.entries(own)) {
      if (!Array.isArray(list)) continue;
      const at = key === "" ? topOf(id) : key;
      if (!children[at]) children[at] = list.filter((entry) => typeof entry === "string");
    }
  };
  for (const value of Array.isArray(file.groups) ? file.groups : []) {
    const group = groupOf(value);
    if (!group || groups.some(({ id }) => id === group.id)) continue;
    if (group.id === DOCS && OLD_DOCS_NAMES.includes(group.title)) delete group.title;
    groups.push(group);
    take(group.id, group.id === DOCS ? file.children : value.children);
  }
  if (!groups.some(({ id }) => id === DOCS)) {
    groups.unshift({ id: DOCS });
    take(DOCS, file.children);
  }
  return { groups, children };
}

/** The keys of `children` whose lists are not empty: what two outlines are compared by. */
const lists = (children) => Object.keys(children ?? {}).filter((key) => Array.isArray(children[key]) && children[key].length > 0);

/** The part of `children` the 文档 column holds: its top and the lists under its entries. */
function docsPart(children) {
  const part = {};
  const walk = (key) => {
    const list = children?.[key];
    if (!Array.isArray(list) || list.length === 0 || Object.hasOwn(part, key)) return;
    part[key] = list;
    list.forEach(walk);
  };
  walk("");
  return part;
}

/**
 * Whether outline `value` ({ groups?, children }) is what `stored` holds (outlineAndFile's, or an outline
 * read): the same columns in the same order, and the same lists (an empty one as none), in whatever order
 * the keys come. One without `groups` (an outline of version 1: a test's, an older workbench's) is held
 * to the 文档 column alone. Also whether an outline a workbench changed (POST outline's `base`) is the one read now.
 */
export function writtenAs(value, stored) {
  if (!stored || typeof stored !== "object" || !value || typeof value !== "object") return false;
  const ours = value.children ?? {};
  const theirs = value.groups ? stored.children : docsPart(stored.children);
  const [a, b] = [lists(ours), lists(theirs)];
  if (a.length !== b.length || !a.every((key) => JSON.stringify(ours[key]) === JSON.stringify(theirs[key]))) return false;
  if (!value.groups) return true;
  const same = (groups) => JSON.stringify((groups ?? []).map(groupOf));
  return same(value.groups) === same(stored.groups);
}

/**
 * `groups` with the columns of the extensions `ids` (those with a sidebar.json): the extension columns the
 * outline kept stay where it put them, once each and only while their extension is there; an extension
 * with none comes last, while there is room (50 columns at most: validGroups, or no change of the outline
 * would be written).
 */
function withExtensions(groups, ids) {
  const wanted = new Set(ids);
  const seen = new Set();
  const kept = groups.filter((group) => {
    if (!group.extension) return true;
    if (!wanted.has(group.extension) || seen.has(group.extension)) return false;
    seen.add(group.extension);
    return true;
  });
  const coming = ids.filter((id) => !seen.has(id)).map((id) => ({ id: extensionGroupId(id), extension: id }));
  return [...kept, ...coming.slice(0, Math.max(0, GROUP_LIMITS.groups - kept.length))];
}

/**
 * `groups` with a column for each of the workspaces `others` (otherWorkspaces') that none has yet (hidden or
 * not): a whole one (no `picked`), its id the workspace's when no column has that, the default workspace's
 * right after the own column, the others last, in the registry's order; `limit` columns at most (the room
 * the extensions' columns to come leave of the 50).
 */
export function withWorkspaces(groups, others, limit = GROUP_LIMITS.groups) {
  const result = [...groups];
  const lacking = others.filter(({ id }) => !result.some((group) => group.workspace === id));
  for (const { id, isDefault } of lacking) {
    if (result.length >= limit) break; // 50 columns at most (validGroups)
    const column = { id: result.some((group) => group.id === id) ? newGroupId(result) : id, workspace: id };
    if (isDefault) result.splice(result.findIndex((group) => group.id === DOCS) + 1, 0, column);
    else result.push(column);
  }
  return result;
}

const DRAFT = /^~(ws-[0-9a-f]{6})\/(.+)$/;

/**
 * The outline of the entries `documents` and `links` (the web links), in the order `stored` (storedOf's)
 * gives, with the columns of the other workspaces `others` (otherWorkspaces'): { groups, children }, every
 * column's top key there (an empty list for an empty column). Each entry once, under the first place it
 * has; one of this workspace's that is gone is left out, a draft of another workspace ("~<ws id>/<slug>")
 * left out when its workspace is among `others` and holds it no more (its folder read), else kept wherever
 * the file has it. A document no column holds comes last in the own column; a link, last in a column of the
 * links (role "links", an older Gallery's), else last in the own column; a document of another workspace
 * whose column is whole, under its own parent's entry when that is held, else last in that column, in its
 * own sidebar's order, but one the user took out of it (the column's `left`, kept to those still there).
 * `drawn` (the sidebar's read, not a workspace's own tree alone): a workspace's column the sidebar does not
 * draw (`hidden`, or its workspace not among `others`) keeps that workspace's drafts alone, any other entry
 * there coming last in the own column with what is under it.
 */
function ordered(stored, documents, links, extensions = [], others = [], { drawn = false } = {}) {
  const listed = new Set([...documents, ...links]);
  const shownById = new Map(others.map((each) => [each.id, each]));
  const known = {
    has: (slug) => {
      if (listed.has(slug)) return true;
      if (!isForeign(slug) || !entryPattern.test(slug)) return false;
      const [, ws, own] = DRAFT.exec(slug);
      const other = shownById.get(ws);
      return other && !other.failed ? other.documents.has(own) : true;
    },
  };
  // A whole column's `left`: those its workspace still has (its folder read), none when none is.
  const kept = (group) => {
    const other = group.left ? shownById.get(group.workspace) : null;
    if (!other || other.failed) return group;
    const { left, ...rest } = group;
    const still = left.filter((slug) => other.documents.has(slug));
    return still.length ? { ...rest, left: still } : rest;
  };
  const base = stored?.groups ?? [{ id: DOCS }];
  // The room of the 50 columns an extension's column to come takes first (one the outline has not got yet).
  const coming = extensions.filter((id) => !base.some((group) => group.extension === id)).length;
  const groups = withExtensions(withWorkspaces(base, others, GROUP_LIMITS.groups - coming), extensions).map(kept);
  const children = Object.fromEntries(groups.map(({ id }) => [topOf(id), []]));
  const seen = new Set();
  // Drawn not: the user removed it, or its workspace is not shown (forgotten, its folder away, a clash of ids).
  const undrawn = (group) => drawn && Boolean(group.workspace) && (group.hidden === true || !shownById.has(group.workspace));
  const astray = []; // entries of a column not drawn that are not its workspace's drafts: last in the own column
  const place = (parent, only = null) => {
    for (const slug of stored?.children?.[parent] ?? []) {
      if (!known.has(slug) || seen.has(slug)) continue;
      if (only && !slug.startsWith(`~${only}/`)) {
        astray.push(slug);
        continue;
      }
      seen.add(slug);
      (children[parent] ??= []).push(slug);
      place(slug, only);
    }
  };
  for (const group of groups) if (!group.extension) place(topOf(group.id), undrawn(group) ? group.workspace : null);
  for (const slug of astray) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    children[""].push(slug);
    place(slug);
  }
  const linked = groups.find(({ role }) => role === "links");
  for (const slug of documents) if (!seen.has(slug)) children[""].push(slug);
  for (const slug of links) if (!seen.has(slug)) children[linked ? topOf(linked.id) : ""].push(slug);
  for (const other of others) {
    const column = groups.find((group) => group.workspace === other.id);
    if (!column || column.picked || other.failed) continue;
    const left = new Set(column.left ?? []);
    for (const slug of other.order) {
      const entry = `~${other.id}/${slug}`;
      if (seen.has(entry) || left.has(slug)) continue;
      const parent = other.parentOf.get(slug);
      const above = parent ? `~${other.id}/${parent}` : null;
      (children[above !== null && seen.has(above) ? above : topOf(column.id)] ??= []).push(entry);
      seen.add(entry);
    }
  }
  return { groups, children };
}

/**
 * Whether `value` ({ groups?, children }) is an outline to store: its columns valid (validGroups: 文档
 * among them), each list's key a column's top or an entry, each entry at most once, never under itself.
 * Without `groups` (an outline of version 1) the only top is 文档's ("").
 */
export function validOutline(value) {
  const children = value?.children;
  if (!children || typeof children !== "object" || Array.isArray(children)) return false;
  if (value.groups !== undefined && !validGroups(value.groups)) return false;
  const tops = new Set((value.groups ?? [{ id: DOCS }]).map(({ id }) => topOf(id)));
  // An extension's column holds none of the outline's entries: they are the extension's own.
  const extensionTops = new Set((value.groups ?? []).filter((group) => groupOf(group)?.extension).map(({ id }) => topOf(id)));
  const listed = new Set();
  for (const [parent, list] of Object.entries(children)) {
    if (!tops.has(parent) && !entryPattern.test(parent)) return false;
    if (!Array.isArray(list) || (extensionTops.has(parent) && list.length > 0)) return false;
    for (const slug of list) {
      if (typeof slug !== "string" || !entryPattern.test(slug) || listed.has(slug) || slug === parent) return false;
      listed.add(slug);
    }
  }
  return true;
}

/**
 * Outline `value` ({ groups?, children }) as outline.json holds it, version 2: the 文档 column's tree in
 * `children`, where version 1 had the whole tree (an older Gallery reads its documents' order as before:
 * it sees no column, and writes version 1 back, which this one reads as 文档 alone), and every column in
 * `groups`, in the sidebar's order, the others each with its own `children` ("" its top).
 */
export function fileOf(value) {
  const groups = value.groups ?? [{ id: DOCS }];
  const own = (top) => {
    const tree = { "": [] };
    const walk = (key, as) => {
      const list = value.children[key];
      if (!Array.isArray(list) || list.length === 0) return;
      tree[as] = [...list];
      for (const entry of list) if (!Object.hasOwn(tree, entry)) walk(entry, entry);
    };
    walk(top, "");
    return tree;
  };
  return {
    version: 2,
    children: own(""),
    groups: groups.map((group) => {
      const kept = groupOf(group);
      return kept.id === DOCS || kept.extension ? kept : { ...kept, children: own(topOf(kept.id)) };
    }),
  };
}

/**
 * Write outline `value` ({ groups?, children }) of workspace `root` (.gallery/ made when there is none yet),
 * the head's order the file holds kept as it is (writeHead's).
 */
export async function writeOutline(root, value) {
  const home = outlineRoot(root);
  if (!ownsOutline(root, value)) throw Object.assign(new Error("跨工作区请复制，不能只移动目录位置"), { code: "CROSS_WORKSPACE" });
  value = { ...value, groups: (value.groups ?? [{ id: DOCS }]).map(group => group.id === DOCS || group.workspace || group.extension ? group : { ...group, owner: group.owner ?? workspaceId(root) }) };
  if (workspaceKey(home) !== workspaceKey(root)) {
    value = projectTree(value, root, home);
    root = home;
  }
  const file = layoutOf(root).outline;
  await fs.mkdir(path.dirname(file), { recursive: true });
  const head = storedHead((await readJson(file))?.head);
  return writeAtomic(file, `${JSON.stringify({ ...fileOf(value), ...(head ? { head } : {}) }, null, 2)}\n`);
}

/**
 * The names in workspace `root`'s extensions/ (a folder, a link, anything of that name: never less than is
 * there), lower case on Windows; an empty set when there is no extensions/; null when it does not read (the
 * disk's refusal: nothing is known gone then).
 */
async function extensionNames(root) {
  try {
    const names = (await fs.readdir(layoutOf(root).extensions)).map((name) => (process.platform === "win32" ? name.toLowerCase() : name));
    return new Set(names);
  } catch (error) {
    return error.code === "ENOENT" ? new Set() : null;
  }
}

/**
 * Take out of the shared outline file (the default workspace's: outlineRoot) the columns of extensions that are
 * gone: a group that is an extension's (groupOf: `extension`, and the id ext-<it>; the old ext-<id> of a
 * sidebar.json's as much as ext-<id>:<column> of a columns/ file's; never a column of the user's, whatever its
 * id) whose extension's folder is no longer in extensions/, taken away by hand or by gallery extension remove.
 * A disabled extension's folder is there: its column's place is kept, as the read keeps it while the file
 * does (withExtensions hides it meanwhile). The read outline never shows such a column; this keeps the file
 * from holding it, as Gallery starts, as the watcher hears an extension's folder go (src/server/routes.mjs)
 * and as an extension is removed. The file's other fields stay as they are; written atomically and only when
 * it is still what was read (writeAtomic's expect), under the outline's lock (`locked`: the caller holds it,
 * as removeExtension does). Resolves to the ids of the columns taken out ([]: nothing written).
 */
export async function dropGoneExtensions(root, { locked = false } = {}) {
  const home = outlineRoot(root);
  const file = layoutOf(home).outline;
  const gone = async () => {
    const text = await fs.readFile(file, "utf8").catch(() => null);
    let value = null;
    try {
      value = text === null ? null : JSON.parse(text);
    } catch {}
    if (!value || typeof value !== "object" || !Array.isArray(value.groups)) return null;
    const groups = value.groups.filter((group) => groupOf(group)?.extension);
    if (!groups.length) return null;
    const names = await extensionNames(home);
    if (!names) return null;
    const fold = (name) => (process.platform === "win32" ? name.toLowerCase() : name);
    const dropped = groups.filter((group) => !names.has(fold(sourceParts(group.extension).extension)));
    return dropped.length ? { text, value, dropped } : null;
  };
  const drop = async () => {
    const found = await gone();
    if (!found) return [];
    const { text, value, dropped } = found;
    const next = { ...value, groups: value.groups.filter((group) => !dropped.includes(group)) };
    return (await writeAtomic(file, `${JSON.stringify(next, null, 2)}\n`, { expect: text })) ? dropped.map(({ id }) => id) : [];
  };
  if (locked) return drop();
  // A look without the lock first: the watcher asks at every write of an extension's columns.
  if (!(await gone())) return [];
  return withOutlineLock(home, drop);
}

/** The head's order as workspace `root`'s outline file keeps it (./sidebar-head.mjs storedHead), or null where it keeps none. */
export async function readStoredHead(root) {
  return storedHead((await readJson(layoutOf(root).outline))?.head);
}

/**
 * Write the head's order `head` (a stored head: ./sidebar-head.mjs) into workspace `root`'s outline file,
 * all else it holds as it was (a file there is none of yet holds it alone, which reads as no tree:
 * storedOf). Run under the outline's lock (withOutlineLock), as every write of the file is.
 */
export async function writeHead(root, head) {
  const file = layoutOf(root).outline;
  await fs.mkdir(path.dirname(file), { recursive: true });
  const value = await readJson(file);
  const kept = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return writeAtomic(file, `${JSON.stringify({ ...kept, head: storedHead(head) ?? [] }, null, 2)}\n`);
}

/** The key `slug` sits under in `children` (a column's top key at a top level), or null when the outline holds it not. */
export function parentIn(children, slug) {
  for (const [parent, list] of Object.entries(children)) if (list.includes(slug)) return parent;
  return null;
}

/** The entries above `slug` in `children`, from the top down (itself and its column not among them). */
export function ancestorsIn(children, slug) {
  const above = [];
  for (let parent = parentIn(children, slug); parent !== null && !isTop(parent) && !above.includes(parent); parent = parentIn(children, parent)) above.unshift(parent);
  return above;
}

/** Every entry under `slug` in `children` (a top key: the column's), depth first, in the sidebar's order. */
export function descendantsIn(children, slug) {
  const found = [];
  const walk = (parent) => (children[parent] ?? []).forEach((child) => { found.push(child); walk(child); });
  walk(slug);
  return found;
}

/**
 * Entry `slug` moved in `children` (an outline as read: changed in place) with the entries under it, to
 * where `where` says: `parent` ("" the top level of the column it is in; a column's top key, that
 * column's; undefined: where it is now, or `after`'s parent), right after `after` (one of that parent's),
 * first (`first`), else last. Resolves to { ok: true, moved: whether its place changed, parent, index,
 * from: { parent, index } } or { ok: false, reason }: "missing" (no such entry in the outline), "parent"
 * (no such parent), "after" (no such entry to go after), "level" (`after` is not under `parent`),
 * "itself" (after itself), "inside" (under itself or one of the entries under it).
 */
export function moveIn(children, slug, { parent = undefined, after = null, first = false } = {}) {
  const from = parentIn(children, slug);
  if (from === null) return { ok: false, reason: "missing" };
  let to = parent === "" ? topIn(children, slug) ?? "" : parent;
  if (after !== null) {
    if (after === slug) return { ok: false, reason: "itself" };
    const its = parentIn(children, after);
    if (its === null) return { ok: false, reason: "after" };
    if (to !== undefined && to !== its) return { ok: false, reason: "level" };
    to = its;
  }
  to ??= from;
  if (isTop(to) ? !Object.hasOwn(children, to) : parentIn(children, to) === null) return { ok: false, reason: "parent" };
  if (to === slug || ancestorsIn(children, to).includes(slug)) return { ok: false, reason: "inside" };
  const index = children[from].indexOf(slug);
  children[from].splice(index, 1);
  const list = (children[to] ??= []);
  const at = after !== null ? list.indexOf(after) + 1 : first ? 0 : list.length;
  list.splice(at, 0, slug);
  for (const key of Object.keys(children)) if (!isTop(key) && children[key].length === 0) delete children[key];
  return { ok: true, moved: to !== from || at !== index, parent: to, index: at, from: { parent: from, index } };
}

/**
 * Move entry `slug` of workspace `root` where `where` says (moveIn), under the outline's lock: the
 * outline read, changed and written when that is not what its file holds (writtenAs: a move, or an
 * entry the file does not hold yet placed where it is read). Resolves to moveIn's answer, with
 * `written`: whether the file was written.
 */
export function moveDocument(root, slug, where) {
  return withOutlineLock(root, async () => {
    const { outline, stored } = await outlineAndFile(root);
    const result = moveIn(outline.children, slug, where);
    if (result.ok && !ownsOutline(root, outline)) return { ok: false, reason: "cross-workspace" };
    const written = result.ok && !writtenAs(outline, stored);
    if (written) await writeOutline(root, outline);
    return { ...result, ...(result.ok ? { written } : {}) };
  });
}

/**
 * Entry `slug` put in `outline` (changed in place: on disk already, so that the outline as read lists
 * it somewhere) under `parent` (a column's top key or an entry; one the outline holds not: the 文档
 * column's top) at `index` (the end when past it).
 */
export function placeIn(outline, slug, parent = "", index = Infinity) {
  const { children } = outline;
  for (const list of Object.values(children)) if (list.includes(slug)) list.splice(list.indexOf(slug), 1);
  const known = parent !== slug && (isTop(parent) ? Object.hasOwn(children, parent) : Object.values(children).some((list) => list.includes(parent)));
  const list = (children[known ? parent : ""] ??= []);
  list.splice(Math.max(0, Math.min(index, list.length)), 0, slug);
  for (const key of Object.keys(children)) if (!isTop(key) && children[key].length === 0) delete children[key];
}
