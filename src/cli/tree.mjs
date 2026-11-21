import { workspaceBase } from "../shared/service-location.mjs";
import fs from "node:fs/promises";
import { listExtensions } from "../shared/extensions.mjs";
import { ancestorsIn, moveDocument, outlineAndFile, ownsOutline, readOutline, validOutline, withOutlineLock, writeOutline, writtenAs } from "../shared/outline.mjs";
import { DOCS, columnWorkspaceId, groupOfTop, isForeign, isTop, topIn, topOf } from "../shared/outline-shape.mjs";
import { draftFacts, draftOf, registeredIds, workspaceNames } from "../shared/drafts.mjs";
import { reportsDirectory } from "../shared/paths.mjs";
import { findPreviewServer } from "../shared/preview-server.mjs";
import { roleOf } from "../shared/reports.mjs";
import { nameStops, workspaceName } from "../shared/workspace-name.mjs";
import { workspaceId, workspaceKey } from "../shared/workspace-registry.mjs";
import { defaultWorkspace, documentDirectory, documentFiles, layoutOf, pageSlug, readLink } from "../shared/workspace.mjs";
import { documentNamed, UsageError } from "./arguments.mjs";

// The sidebar's tree for the commands (gallery list --tree, gallery new --under/--after, gallery
// move, and gallery import placing what it made): the workspace's outline as the workbench reads it
// (shared/outline.mjs), each document with its title, and a document moved in it. A move is written
// through the workspace's running server when there is one (POST /__gallery/workspace/move, in the
// queue the workbench's own moves and the pages' saves go through: no change lost, and an open
// workbench shows it at once, told by the server's event stream), else here, by the same function
// under the outline's lock (moveDocument). Nothing in a document's files changes: links between
// documents are relative links between their files, which go by their folders, not their place.

// The tree has columns (栏: shared/outline-shape.mjs): the own one (the workspace's documents: 默认文档 for the
// default workspace, else called by the workspace's name), one for each other registered workspace's
// (shared/workspace-columns.mjs: their documents, "~<ws id>/<slug>"), those the user made, and a column of the
// links an older Gallery made (链接); an entry is a document, a web link (shared/web-links.mjs) or another
// workspace's draft, which can hold entries under it as a document does.

/**
 * The outline of the workspace (`root`: another's, for gallery list --all, which only reads it: its own tree,
 * `others` false, no other workspace's column) and each entry's title, description and icon: { children, groups,
 * columns, extensions, documents: Map(slug -> { slug, title, description, icon, url?, draft? }) }, a web link's
 * with its url, a draft of another workspace's ("~<ws id>/<slug>": shared/drafts.mjs) with `draft`: { path,
 * missing, ws } (its doc.html, why it is not there, its workspace's id). Each column has `name`: what the
 * sidebar calls it when the user named it not (columnNames); a workspace's column whose workspace the sidebar
 * does not show (forgotten, its folder away, a clash of ids: read with `others`) has `away`: true, and is not
 * drawn, as one the user removed (`hidden`) is not.
 * `groups` are the columns entries go in; the columns extensions provide (shared/extensions.mjs) are
 * `extensions`, each as listExtensions reads it: their entries are the extension's own, which no command here
 * places or moves. `columns` are all of them in the sidebar's order, an extension's as the outline holds it
 * ({ id, extension }).
 */
export async function readTree(root = reportsDirectory, { others = workspaceKey(root) === workspaceKey(reportsDirectory) } = {}) {
  const { outline: { children, groups: read, links, shown }, others: snapshots } = await outlineAndFile(root, { others });
  // Each column with the name the sidebar calls it by (`name`; the user's title wins: columnName).
  const names = columnNames(root, read, shown);
  const showing = new Set(shown.map(({ id }) => id));
  const columns = read.map((group) => ({ ...group, name: names.get(group.id) ?? null, ...(others && group.workspace && !showing.has(group.workspace) ? { away: true } : {}) }));
  const groups = columns.filter((group) => !group.extension);
  const extensions = await listExtensions(root);
  const slugs = Object.values(children).flat();
  const line = (value) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
  const ids = slugs.some(isForeign) ? registeredIds() : null;
  const documents = new Map(await Promise.all(slugs.map(async (slug) => {
    if (isForeign(slug)) {
      const named = draftOf(slug);
      const snapshot = snapshots.find(({ id }) => id === named?.ws);
      const known = snapshot?.facts.get(named.slug);
      const facts = known ? { ...known, missing: null } : await draftFacts(slug, ids);
      return [slug, { slug, title: facts.title, description: facts.description, icon: facts.icon, ...(facts.url ? { url: facts.url } : {}), draft: { path: facts.path, missing: facts.missing, ws: named?.ws ?? null } }];
    }
    if (links.includes(slug)) {
      const link = await readLink(documentDirectory(slug, root));
      return [slug, { slug, title: link?.title ?? slug, description: "", icon: link?.icon ?? null, url: link?.url ?? "" }];
    }
    const metadata = await fs.readFile(documentFiles(documentDirectory(slug, root)).json, "utf8").then(JSON.parse).catch(() => ({}));
    return [slug, { slug, title: line(metadata?.title) || slug, description: line(metadata?.description), icon: typeof metadata?.icon === "string" ? metadata.icon : null }];
  })));
  return { children, groups, columns, extensions, documents };
}

/**
 * The names the sidebar calls the columns of workspace `root` by when the user named them not (`groups`, the
 * outline's, `shown`: the other workspaces it shows): a Map of column id to name. The own column (文档's place)
 * and a workspace's: 默认文档 for the default workspace's, else the workspace's name (shared/workspace-name.mjs:
 * gallery.json's name, else its folder's); 链接 for an older Gallery's column of the links.
 */
export function columnNames(root, groups, shown = []) {
  const home = workspaceKey(defaultWorkspace());
  const wanted = new Set(groups.map(({ workspace }) => workspace).filter(Boolean));
  const stops = nameStops();
  const named = wanted.size ? workspaceNames(wanted, { stops }) : new Map();
  const names = new Map();
  for (const group of groups) {
    if (group.id === DOCS) names.set(group.id, workspaceKey(root) === home ? "默认文档" : workspaceName(root, { stops }).name);
    else if (group.workspace) {
      const other = shown.find(({ id }) => id === group.workspace);
      names.set(group.id, other?.isDefault ? "默认文档" : named.get(group.workspace)?.name ?? group.workspace);
    } else if (group.role === "links") names.set(group.id, "链接");
  }
  return names;
}

/** A column's name as the commands say it: the user's, else the sidebar's (readTree's `name`: columnNames), else 未命名栏. */
export const columnName = (group) => group?.title ?? group?.name ?? (group?.id === DOCS ? "文档" : group?.role === "links" ? "链接" : group ? "未命名栏" : "文档");
/** The column whose top key `key` is. */
export const columnOf = (tree, key) => tree.groups?.find(({ id }) => id === groupOfTop(key));

/**
 * When entry `slug` is a document outside its own column (this workspace's outside the own column, a draft
 * outside its workspace's), the name of that column as the sidebar's grey tag says it (its title; the
 * workspace's name when the user removed it); else null (in its own column, or a web link).
 */
export function ownColumnLabel(tree, slug) {
  const entry = tree.documents.get(slug);
  if (!entry || entry.url !== undefined) return null;
  const top = topOfEntry(tree, slug);
  const ws = entry.draft?.ws ?? null;
  const own = ws ? tree.groups.find((group) => group.workspace === ws) : tree.groups.find((group) => group.id === DOCS);
  if (own && topOf(own.id) === top) return null;
  if (!own) return ws;
  return own.hidden ? own.name ?? ws : columnName(own);
}

/** A document as the commands name it in a sentence: its slug, then its title in parentheses. */
export const named = ({ documents }, slug) => `${slug} (${documents.get(slug)?.title ?? slug})`;

/** The top key of the column `slug` is in ("", 文档's, when the tree holds it not). */
export const topOfEntry = (tree, slug) => topIn(tree.children, slug) ?? "";

/**
 * Where `slug` is, as gallery list says it: 位置：顶层, or the entries above it from the top down; in a
 * column other than the own one, the column's name first (位置：项目乙栏, 位置：团队栏 › …).
 */
export function placeLine(tree, slug) {
  const above = ancestorsIn(tree.children, slug).map((parent) => named(tree, parent));
  const top = topOfEntry(tree, slug);
  const parts = [...(top === "" ? [] : [`${columnName(columnOf(tree, top))}栏`]), ...above];
  return `位置：${parts.length ? parts.join(" › ") : "顶层"}`;
}

/**
 * The document a command's argument `name` names (its slug, link or whole address: documentNamed,
 * which says a document of the trash and what names none, exit 2), as a slug of the outline; `what`
 * says what it is to the command ("the document to move", "--under"). A slug no document holds, and
 * the 写作偏好 page (listed apart, in no tree), are a refusal: { refused: the line to print, exit 1 }.
 */
export async function treeDocument(name, what, tree) {
  const { slug } = await documentNamed(name);
  if (slug === (await pageSlug(reportsDirectory))) return { refused: `${name} is the 写作偏好 page, which the sidebar lists apart: it moves nowhere and holds no documents (${what}).` };
  if (!tree.documents.has(slug)) {
    const folder = documentDirectory(slug, reportsDirectory);
    const there = (await roleOf(folder)) === "instructions";
    return { refused: there ? `${name} is the 写作偏好 page, which the sidebar lists apart: it moves nowhere and holds no documents (${what}).` : `No document "${name}" (${what}): gallery list --tree shows the documents and where they are.` };
  }
  return { slug };
}

// Why a move was refused, as the commands say it (moveIn's reasons and the server's).
const REFUSED = {
  "cross-workspace": () => "Not moved: copying to another workspace requires confirmation in Gallery; the original stays in its workspace.",
  missing: (tree, slug) => `No document "${slug}" in the sidebar's tree: gallery list --tree shows them.`,
  parent: (tree, slug, { parent }) => `No document "${parent}" to put ${named(tree, slug)} under: gallery list --tree shows them.`,
  after: (tree, slug, { after }) => `No document "${after}" to put ${named(tree, slug)} after: gallery list --tree shows them.`,
  level: (tree, slug, { parent, after }) => `${named(tree, after)} is not under ${parent ? named(tree, parent) : "the top level"}: --after names a document at the level it goes to.`,
  itself: (tree, slug) => `${named(tree, slug)} cannot go after itself.`,
  // With no --under or --top the parent is --after's, which is then the document itself or one under it.
  inside: (tree, slug, { parent, after }) => (parent === undefined && after
    ? `${named(tree, slug)} cannot go after ${named(tree, after)}, which is under it.`
    : `${named(tree, slug)} cannot go under ${parent === slug ? "itself" : `${named(tree, parent)}, which is under it`}.`),
  instructions: (tree, slug) => `The 写作偏好 page is listed apart: it moves nowhere and holds no documents.`,
};
/** What a refused move says (`where`: { parent, after } as asked). */
export const refusedLine = (tree, slug, reason, where = {}) => (REFUSED[reason] ?? ((_, __, { message }) => `Not moved: ${message ?? reason}.`))(tree, slug, where);

/**
 * A workspace command (POST /__gallery/workspace/<name>: move, link, link-set, trash) through the
 * workspace's server (`server`: its announcement), in the queue its saves go through, so that an open
 * workbench shows what it did at once: its answer, or null when no server of this workspace takes it
 * (none runs any more, another's took the port, an older Gallery's that has no such command): the
 * command then does it here, by the same functions. `root`: the workspace the command is for (the current one's; the
 * default one's for a custom page, which lives there).
 */
export async function throughServer(server, body, name = "move", root = reportsDirectory) {
  const host = `127.0.0.1:${server.port}`;
  try {
    const response = await fetch(`http://${host}${workspaceBase(root)}/__gallery/workspace/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: `http://${host}`, "X-Gallery-Token": server.token },
      body: JSON.stringify({ ...body, workspace: root }),
      signal: AbortSignal.timeout(30000),
    });
    const answer = await response.json().catch(() => null);
    if (typeof answer?.ok !== "boolean" || ["elsewhere", "token", "host", "origin", "unknown"].includes(answer.reason)) return null;
    return answer;
  } catch {
    return null;
  }
}

/**
 * Move document `slug` (with the documents under it) in the workspace's outline where `where` says:
 * { parent ("" the top; undefined: where it is, or after's parent), after (a slug or null), first }
 * (shared/outline.mjs moveIn). Through the running server when there is one, else here. Resolves to
 * { ok: true, moved, parent, index, from } or { ok: false, reason, message? }.
 */
export async function moveInTree(slug, { parent = undefined, after = null, first = false } = {}) {
  const server = await findPreviewServer();
  const body = { slug, ...(parent !== undefined ? { parent } : {}), after, first };
  const answer = server ? await throughServer(server, body) : null;
  if (answer) return answer;
  return moveDocument(reportsDirectory, slug, { parent, after, first });
}

/** Where a document went, as a command says it: under whom (or at the top level, of a column other than 文档), and right after whom, first or last. */
export function wentLine(tree, { parent, index }) {
  const list = tree.children[parent] ?? [];
  const level = parent === "" ? "at the top level" : isTop(parent) ? `at the top of the ${columnName(columnOf(tree, parent))} column` : `under ${named(tree, parent)}`;
  // "entry" where a web link is among them, "document" else (as before links came)
  if (list.length === 1) return `${level}, the only ${list.some((slug) => tree.documents.get(slug)?.url !== undefined) ? "entry" : "document"} there`;
  if (index === 0) return `${level}, first`;
  return `${level}, right after ${named(tree, list[index - 1])}${index === list.length - 1 ? ", last" : ""}`;
}

/** The parsed placement options of new and move: --under <doc> | --top | --column <column>, --after <doc> | --first. */
export function placementOf(values, options, { top = true } = {}) {
  const under = values.get("--under");
  const after = values.get("--after");
  const column = values.get("--column");
  if (under !== undefined && options.has("--top")) throw new UsageError("--under and --top are two places: give one.");
  if (column !== undefined && (under !== undefined || options.has("--top"))) throw new UsageError("--column and --under or --top are two places: give one.");
  if (after !== undefined && options.has("--first")) throw new UsageError("--after and --first are two places: give one.");
  return { under, top: top && options.has("--top"), column, after, first: options.has("--first") };
}

/**
 * The edit service of workspace `root` as a command with no server has it (the commands that duplicate, trash and restore
 * need one: renaming a copy, forgetting a deleted document's review of the Agent's changes), made here.
 */
export async function localEdits(root = reportsDirectory) {
  const [{ createEditService }, { withNeededKitTags }] = await Promise.all([import("../editor/service.mjs"), import("../render/assets.mjs")]);
  return createEditService({ reportsDirectory: root, stateDirectory: layoutOf(root).state, finish: withNeededKitTags });
}

/**
 * A workspace command (the service's POST <name>: trash, restore, destroy, duplicate, copy-from, favorite, draft-add…) for
 * workspace `root` (the current one), through its running server when there is one (its queue; an open workbench shows
 * the change at once), else here by the same function (workbench/service.mjs run), with the edit service the command needs.
 * Resolves to the service's answer: { ok: true, … } or { ok: false, reason, message }.
 */
export async function serviceCommand(name, body, { root = reportsDirectory, web = null } = {}) {
  const server = await findPreviewServer();
  const answer = server ? await throughServer(server, body, name, root) : null;
  if (answer) return answer;
  const { createWorkspaceService } = await import("../workbench/service.mjs");
  const [, result] = await createWorkspaceService({ edits: await localEdits(root), reports: {}, reportsDirectory: root, ...(web ? { web } : {}) }).run(name, body);
  return result;
}

/** The column `name` names (its name as the sidebar shows it, upper and lower case alike, or its id) among the columns the sidebar draws, or null. */
export function columnNamed(tree, name) {
  const wanted = String(name).replace(/\s+/g, " ").trim().toLowerCase();
  return tree.groups.find((group) => !group.hidden && !group.away && [columnName(group), group.id].some((each) => each.toLowerCase() === wanted)) ?? null;
}

/**
 * Where a document made or moved here may go in column `name`: { group, top } (its top key), or { refused: what to say } for no such
 * column, an extension's column, or one that is another workspace's (the files stay where they are: gallery copy copies them there).
 */
export function columnTarget(tree, name) {
  const group = columnNamed(tree, name);
  const drawn = tree.groups.filter((each) => !each.hidden && !each.away);
  if (!group) return { refused: `No column "${name}" in the sidebar (${drawn.map(columnName).join(", ")}): gallery column new "<name>" makes one.` };
  if (group.extension) return { refused: `The column ${columnName(group)} is an extension's: its entries are the extension's own, which no command places.` };
  const self = workspaceId(reportsDirectory);
  if (columnWorkspaceId(group, self) !== self) return { refused: `The column ${columnName(group)} is another workspace's: a document made or moved here stays in this workspace (gallery copy <document> --to <workspace> copies it there).` };
  return { group, top: topOf(group.id) };
}

/**
 * The outline changed as `change` says and written, through the workspace's running server when there is one (POST outline with the
 * outline it changed as `base`, so that a write of someone else's since is never undone), else under the outline's lock here; a
 * stale answer reads it again and makes the change on what it reads, three times at most. `change(outline)` gets { groups, children }
 * and returns the new outline, { refused: the line to say } or null (nothing to change). Resolves to { ok: true, outline, changed },
 * { ok: false, refused } or { ok: false, reason, message }.
 */
export async function editOutline(change, { tries = 3 } = {}) {
  let last = null;
  for (let attempt = 1; attempt <= tries; attempt++) {
    const current = await readOutline(reportsDirectory);
    const base = { groups: current.groups, children: current.children };
    const next = change(base);
    if (next === null) return { ok: true, outline: base, changed: false };
    if (next.refused) return { ok: false, refused: next.refused };
    if (!validOutline(next) || !ownsOutline(reportsDirectory, next)) return { ok: false, reason: "outline", message: "the outline that change makes is not one the sidebar keeps" };
    const server = await findPreviewServer();
    const answer = server ? await throughServer(server, { outline: next, base }, "outline") : null;
    if (answer?.ok) return { ok: true, outline: next, changed: true };
    if (answer && answer.reason !== "stale") return { ok: false, reason: answer.reason, message: answer.message };
    if (answer) {
      last = answer;
      continue;
    }
    const written = await withOutlineLock(reportsDirectory, async () => {
      if (!writtenAs(base, await readOutline(reportsDirectory))) return false;
      await writeOutline(reportsDirectory, next);
      return true;
    });
    if (written) return { ok: true, outline: next, changed: true };
    last = { reason: "stale", message: "the sidebar's tree was changed elsewhere while this was made" };
  }
  return { ok: false, reason: last?.reason ?? "stale", message: last?.message ?? "the sidebar's tree kept changing" };
}
