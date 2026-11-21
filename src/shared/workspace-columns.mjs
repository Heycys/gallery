import fs from "node:fs/promises";
import path from "node:path";
import { iconKind } from "./emoji/icon-value.mjs";
import { isWorkspace, readRegistry, workspaceId, workspaceKey } from "./workspace-registry.mjs";
import { defaultWorkspace, documentFiles, isSlugName, readLink } from "./workspace.mjs";

// The other workspaces a workspace's sidebar shows a column of (since 2026-11-08;
// docs/workbench.md "Columns"): every workspace of the machine's registry (./workspace-registry.mjs) but
// this one, a clash of ids (two registered folders sharing one: never guessed) and one whose folder is no
// workspace now (an external drive away), in this order: the default workspace (./workspace.mjs
// defaultWorkspace, GALLERY_DEFAULT_WORKSPACE honoured) first, the rest as they were registered. The outline
// (./outline.mjs) gives each a column the first time it reads it (a "whole" one, all its documents, laid out
// as its own sidebar has them) and the place of its documents no column holds; the user's order of the
// columns is the outline's after that.
//
// What a workspace's sidebar is read with (snapshotOf): its documents and links in its former local order,
// their same-workspace parents, and what their doc.json or link.json
// says (title, description, an icon of the emoji or 图标 kind: no picture of another workspace's folder). It is
// read from its files, never written, and kept SNAPSHOT_KEPT ms at most, so that the reads of a burst (a
// command and the workbench's read after it, the list of 添加其他 Gallery 项目…) read each folder once while a
// change there shows at the next read after that; the cache is dropped when the storage runtime reports a change in the same process (src/server/projects.mjs). Reads files only.

/** How long a snapshot of another workspace is believed (ms). */
export const SNAPSHOT_KEPT = 2000;

/**
 * The registered workspaces by their ids: a Map of id to the roots registered under it (two for one id: a clash
 * of the hash's six digits, which names neither). `registry`: readRegistry()'s.
 */
export function idsOf(registry = readRegistry()) {
  const ids = new Map();
  for (const { root } of registry.workspaces) {
    const id = workspaceId(root);
    const roots = ids.get(id) ?? [];
    if (!roots.some((each) => workspaceKey(each) === workspaceKey(root))) roots.push(root);
    ids.set(id, roots);
  }
  return ids;
}

/**
 * The other workspaces whose columns the sidebar of workspace `root` shows: [{ id, root, isDefault }], the
 * default workspace first (when it is registered and not `root`), then the registry's order.
 */
export function shownWorkspaces(root, { registry = readRegistry(), env = process.env } = {}) {
  const own = workspaceKey(root);
  const home = workspaceKey(defaultWorkspace({ env }));
  const shown = [];
  for (const [id, roots] of idsOf(registry)) {
    if (roots.length !== 1) continue;
    const [each] = roots;
    if (workspaceKey(each) === own || !isWorkspace(each)) continue;
    shown.push({ id, root: each, isDefault: workspaceKey(each) === home });
  }
  return [...shown.filter(({ isDefault }) => isDefault), ...shown.filter(({ isDefault }) => !isDefault)];
}

const oneLine = (value) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
/** A draft's page icon as another workspace's sidebar may show it: an emoji or a glyph of the 图标 tab. */
export const shownIcon = (value) => (typeof value === "string" && ["emoji", "glyph"].includes(iconKind(value)) ? value : null);

const kept = new Map(); // a workspace's key -> { at, value: Promise }

/**
 * What the sidebar reads of workspace `root` (another's): { documents: Set of slugs, order: [slug] (its own
 * sidebar's order, column after column, each entry followed by those under it), parentOf: Map of slug to the
 * document it is under there (null at a column's top), facts: Map of slug to { title, description, icon, path
 * (its doc.html, an old one's report.html) } }. `readOwn(root)`: its outline as its own sidebar has it (no
 * column of any other workspace: ./outline.mjs readOutline with others false). Kept SNAPSHOT_KEPT ms.
 */
export function snapshotOf(root, readOwn, { now = Date.now() } = {}) {
  const key = workspaceKey(root);
  const known = kept.get(key);
  if (known && now - known.at < SNAPSHOT_KEPT) return known.value;
  const value = read(root, readOwn);
  kept.set(key, { at: now, value });
  value.catch(() => kept.delete(key));
  return value;
}

/** Forget what was read of workspace `root` (none: of every workspace), so that the next read reads it again. */
export function forgetSnapshot(root = null) {
  if (root === null) kept.clear();
  else kept.delete(workspaceKey(root));
}

async function read(root, readOwn) {
  const own = await readOwn(root);
  const documents = new Set();
  const order = [];
  const parentOf = new Map();
  // Own documents and links; another workspace's reference is not a second file here.
  const isEntry = (key) => !key.startsWith("~") && isSlugName(key);
  const parentIn = (child) => {
    for (const [key, list] of Object.entries(own.children)) if (list.includes(child)) return key;
    return null;
  };
  const above = (slug) => {
    let up = parentIn(slug);
    while (up !== null && !(up === "" || up.startsWith(":")) && !isEntry(up)) up = parentIn(up);
    return up === null || up === "" || up.startsWith(":") ? null : up;
  };
  const walk = (key) => (own.children[key] ?? []).forEach((slug) => {
    if (isEntry(slug) && !documents.has(slug)) {
      documents.add(slug);
      order.push(slug);
      parentOf.set(slug, above(slug));
    }
    walk(slug);
  });
  for (const { id } of own.groups) walk(id === "docs" ? "" : `:${id}`);
  const facts = new Map(await Promise.all(order.map(async (slug) => {
    if (own.links.includes(slug)) {
      const link = await readLink(path.join(root, slug));
      return [slug, { ...link, kind: "link", title: link?.title ?? slug, description: "", path: path.join(root, slug, "link.json") }];
    }
    const files = documentFiles(path.join(root, slug));
    const metadata = await fs.readFile(files.json, "utf8").then((text) => JSON.parse(text.replace(/^﻿/, ""))).catch(() => null);
    const value = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
    return [slug, { title: oneLine(value.title) || slug, description: oneLine(value.description), icon: shownIcon(value.icon), path: files.html }];
  })));
  return { documents, order, parentOf, facts };
}
