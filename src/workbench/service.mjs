import { listPreferenceDocuments, changePreferenceDocuments, preferenceFile, preferencesHintShown } from '../shared/preference-documents.mjs';
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import { serviceLocation } from "../shared/service-location.mjs";
import path from "node:path";
import { newNames } from "../shared/new-names.mjs";
import { writeAtomic } from "../shared/files.mjs";
import { sendJson } from "../shared/http.mjs";
import { COPY_SUFFIX, NEW_DESCRIPTION, UNTITLED, fileWords, pageLangOf } from "../shared/file-language.mjs";
import { said, saying } from "../shared/i18n/index.mjs";
import { reportsDirectory as defaultReportsDirectory } from "../shared/paths.mjs";
import { moveDocument, outlineAndFile, ownsOutline, placeIn, readOutline, validOutline, withOutlineLock, writeHead, writeOutline, writtenAs } from "../shared/outline.mjs";
import { copyEntryFiles, documentNames } from "../shared/document-copy.mjs";
import { storedHead } from "../shared/sidebar-head.mjs";
import { changeFavorites, readFavorites } from "../shared/favorites.mjs";
import { DOCS, columnWorkspaceId, entryWorkspace, entryPattern, isForeign, isTop, topOf } from "../shared/outline-shape.mjs";
import { addDraft, addWorkspace, draftEntry, draftFacts, draftOf, findDraft, foreignMarker, projectChoices, registeredIds, workspaceNames, workspaceOf } from "../shared/drafts.mjs";
import { forgetSnapshot, shownWorkspaces } from "../shared/workspace-columns.mjs";
import { nameStops } from "../shared/workspace-name.mjs";
import { registerWorkspace, workspaceId, workspaceKey } from "../shared/workspace-registry.mjs";
import { reveal } from "./reveal.mjs";
import { LINK_FILE, linkStem, linkValue, ownAddress, readLinkText } from "../shared/web-links.mjs";
import { sameDirectory } from "../shared/preview-server.mjs";
import { listReportSlugs, slugPattern } from "../shared/reports.mjs";
import { PAGE_SLUG, SHARED_FOLDERS, defaultWorkspace, documentDirectory, documentFiles, ensureWorkspace, idHolder, isDocSlug, keptName, layoutOf, listTrash, newDocSlug, pageSlug, readLink, slugTaken, trashIdPattern } from "../shared/workspace.mjs";
import { createPage, headOf, listPages, newPageSlug, pageFiles, readPageMeta, renamePage, setPageMeta } from "../shared/pages.mjs";
import { iconKind } from "../shared/emoji/icon-value.mjs";
import { editExtension, extensionSource, listExtensions } from "../shared/extensions.mjs";
import { LOOK, effectiveLook, ownLookOf, updatedOwnLook, withLookField } from "../shared/document-look.mjs";
import { workspaceLook, writeGlobalLook } from "../shared/workspace-look.mjs";
import { findIn, tidyQuery } from "../shared/search.mjs";
import { createIndex, readOf } from "./index.mjs";
import { createPresence, describeTab } from "./presence.mjs";
import { readCatalog } from "../shared/component-catalog.mjs";

// Report-level commands of Gallery's server (src/server/), for a workbench that lists and organizes reports
// (docs/workbench.md): make a new report, duplicate, rename, move to the trash, restore, delete for
// good, export, and the workspace's outline (which report sits under which, in what order: read and
// changed by shared/outline.mjs, a gallery command's way too). The
// outline (<workspace>/.gallery/outline.json) and the trash (.gallery/trash/) are all the workspace
// service keeps of its own, never document content (shared/workspace.mjs). The page of the user's
// writing preferences (写作偏好, src/shared/reports.mjs, in .gallery/pages/) is listed apart: never in
// the outline, never trashed. The custom pages (shared/pages.mjs, pages/<slug>/) are listed apart too,
// in the sidebar's order of them, and renamed and trashed by the same commands with kind "page", the
// home page as any other (no page is special by its slug); the sidebar's head rows (新建, 搜索 and the
// pages) are ordered by POST head, kept in the outline file (shared/sidebar-head.mjs), and 新建页面 makes
// a blank page (POST new-page). The web links (shared/web-links.mjs, <slug>/link.json) are
// entries of the outline beside the documents, listed with kind "link", made and changed by POST link
// and link-set, trashed and restored with kind "link"; nothing that reads a document's file reads them.
// The outline's columns (shared/outline-shape.mjs) are the workbench's to make, rename, order, hide and
// remove (POST outline); every other registered workspace has one, made as the outline is read
// (shared/workspace-columns.mjs), whose documents the server reads as it lists the outline (a snapshot of
// that storage directory, kept 2 s and invalidated by its file watcher); no column of the links is made
// any more (an older Gallery's stays). The columns of the extensions (extensions/<id>/sidebar.json:
// shared/extensions.mjs) are listed with the outline (`extensions`, each read as the sidebar shows it),
// their place among the columns the outline's; they hold no entry of the outline's. POST extension-edit
// renames/reorders/deletes in sidebar.json, or deletes that file to remove its column. The drafts of other workspaces (shared/drafts.mjs,
// "~<ws id>/<slug>") are entries listed with kind "draft", put in by POST draft-add (添加其他 Gallery 项目…)
// and gallery commands. Project paths select their editing runtime inside the one HTTP service.
// What a block reads of the workspace (GET query: workspace.query of the kit's runtime) is answered from the
// workspace's facts (./index.mjs), which its search and its menus' counts read too.
// Its GETs need this server's exact Host; every change is checked and queued like a save
// (src/editor/service.mjs: Host, Origin, the token, JSON) and answered { ok, … } or { ok: false, reason, message }
// (a message with parts filled in carries its text and values too: shared/i18n said()).

// What an export that failed its checks says: the first three of the check's lines (as they are, the
// Agent's words) and, past three, how many; one template a count, so that the UI says each in its
// language (said()), the separators with it.
const checkFailed = ([first, second, third, ...rest]) => {
  if (rest.length) return said("检查没有通过：{0}；{1}；{2} 等 {3} 条", first, second, third, rest.length + 3);
  if (third !== undefined) return said("检查没有通过：{0}；{1}；{2}", first, second, third);
  return second !== undefined ? said("检查没有通过：{0}；{1}", first, second) : said("检查没有通过：{0}", first);
};

// A new page's lang for the UI's language the workbench gives (shared/i18n LANGUAGES): en or zh-CN, else
// none (the file language's: shared/file-language.mjs). The words a request leaves out are the UI's language's too.
const pageLang = pageLangOf;
const uiLanguage = (language) => (language === "zh" || language === "en" ? language : undefined);
// The most a POST pack-install carries: a pack's zip of 24 MB in base64 (a larger one is installed by its path).
const PACK_BODY = 32 * 1024 * 1024;

// Move a report's directory. On Windows a rename can meet a file the watcher, an editor or an
// indexer holds open: try again briefly, then copy and remove instead.
async function move(from, to) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fs.rename(from, to);
    } catch (error) {
      if (!["EPERM", "EBUSY", "EACCES"].includes(error.code)) throw error;
      if (attempt >= 5) break;
      await new Promise((resolve) => setTimeout(resolve, 60 * (attempt + 1)));
    }
  }
  await fs.cp(from, to, { recursive: true, errorOnExist: true, force: false });
  await fs.rm(from, { recursive: true, force: true, maxRetries: 5 });
}

const shown = (file) => path.resolve(file); // as the system writes it

/**
 * edits: the edit service (its token, request checks, queue and renameReport). reports: what the
 * render system does for the workspace (src/server/ wires it): create(slug, title, description,
 * { lang }), a new report from the starter in reportsDirectory (its page's lang `lang`, else the
 * starter's), export(slug) -> { problems, file, refused? }, the
 * offline file built from the saved source with its checks (refused: the hand-in's { reason, message }
 * when it wrote nothing: missing, busy), and words(html, slug), a report's page with its page blocks
 * by the titles they show. server: what this server is, for info
 * and POST stop: { kind: "cli" (one a gallery command started) or "dev" (npm run dev's), version
 * (Gallery's), stop() (close it and end its process, once the stop's answer is sent) }. components:
 * 设置 › 组件列表 (src/server/component-settings.mjs), { read(), write(change) }. changed(): the
 * outline was written (the server tells the workbench's event stream: src/server/routes.mjs);
 * index: the
 * workspace's facts (./index.mjs createIndex), which the server tells of each change; one of its own
 * (with no record of edits) when none is given. web: what the server asks of the web for a web link
 * (src/editor/unfurl.mjs, wired by src/server/): { frameable(url) -> { frameable, reason? }, title(url)
 * -> the page's title or "" }; none, every page is taken as frameable and no title is found.
 * presence: what the workbench tabs reported of what they have open (./presence.mjs), shared by every workspace of
 * one server (src/server/projects.mjs); one of its own when none is given. POST presence takes a tab's report,
 * GET status gives them (gallery status).
 */
export function createWorkspaceService({ unified = false, edits, reports, reportsDirectory = defaultReportsDirectory, server = { kind: "dev", version: null, stop: null }, components = null, changed = () => {}, index = null, web = null, projects = { touch() {}, indexOf: async () => null }, presence = createPresence() }) {
  const { trash: trashDirectory } = layoutOf(reportsDirectory);
  // The folders no workspace's name climbs to (shared/workspace-name.mjs): read once, Windows' registry asked for them.
  let stops = null;
  const stopsOf = () => (stops ??= nameStops());
  const facts = index ?? createIndex({ root: reportsDirectory, read: readOf(edits), draw: (html, slug) => reports.words(html, slug) });
  const failure = (status, reason, message) => [status, { ok: false, reason, ...saying(message) }];

  const readJson = (file) => fs.readFile(file, "utf8").then(JSON.parse).catch(() => null);
  const folderOf = (slug) => documentDirectory(slug, reportsDirectory);
  const filesOf = (slug) => documentFiles(folderOf(slug));
  // The file a tab of the workbench shows and the workspace it is in (a report's entry: a slug, "@<slug>" a custom page,
  // "~ws-xxxxxx/<slug>" a draft of another workspace, or "@~ws-xxxxxx/<slug>"): for gallery status, which tells an Agent
  // where to write.
  const openFacts = (record) => {
    const page = record.kind === "page";
    const name = record.entry.replace(/^@/, "");
    const draft = draftOf(name);
    const root = draft ? workspaceOf(draft.ws).root ?? null : reportsDirectory;
    if (!root) return { file: null, workspace: null };
    const slug = draft ? draft.slug : name;
    return { file: path.resolve(page ? pageFiles(slug, root).html : documentFiles(documentDirectory(slug, root)).html), workspace: path.resolve(root) };
  };
  // A document at the root: duplicate, trash and restore take those alone (never the 写作偏好 page).
  const atRoot = (slug) => path.join(reportsDirectory, slug);
  // Whether a document stands at the root under `slug`: components/ can be a folder of packages alone.
  const documentAt = (slug) => exists(documentFiles(atRoot(slug)).html);
  // A review of the Agent's changes kept under `slug` (editor/changes.mjs) forgotten before a document is made,
  // copied or deleted for good under it: no new document takes over an old one's baseline. One that fails changes nothing else.
  const forgetChanges = (slug) => Promise.resolve(edits.forgetChanges?.(slug)).catch(() => {});
  // What is a document's own of its folder: all of it, but in a document called components or pages,
  // whose folder the component packages or the custom pages share and no part of it, its files and the
  // folders a document keeps; what else stands there is theirs, a package or a page being written among
  // them, and stays where it is. (No custom page is called assets or materials: shared/pages.mjs.)
  const ownNames = slug => documentNames(reportsDirectory, slug);
  // Each of `names` moved from a folder into another, the one made if need be; none, when one cannot be.
  const moveEach = async (names, from, to) => {
    await fs.mkdir(to, { recursive: true });
    const moved = [];
    try {
      for (const name of names) {
        await move(path.join(from, name), path.join(to, name));
        moved.push(name);
      }
    } catch (error) {
      for (const name of moved) await move(path.join(to, name), path.join(from, name));
      throw error;
    }
  };
  const moveAway = async (slug, to) => {
    if (!SHARED_FOLDERS.includes(slug)) return move(atRoot(slug), to);
    await moveEach(await ownNames(slug), atRoot(slug), to);
    await fs.rmdir(atRoot(slug)).catch(() => {}); // a folder of packages or pages stays
  };
  // Whether a document called components or pages goes back to its own folder: its address goes by its
  // folder name (shared/page-links.mjs), and no other document, package or page stands where its files go.
  const fitsAtHome = async (slug, from) => SHARED_FOLDERS.includes(slug) && !(await documentAt(slug))
    && (await Promise.all((await fs.readdir(from)).map((name) => exists(path.join(atRoot(slug), name))))).every((there) => !there);
  const metadataOf = async (directory) => (await readJson(documentFiles(directory).json)) ?? {};
  // A document as a list shows it; `look`, the look it shows (its own over the workspace's: shared/workspace-look.mjs), none for the 写作偏好 page's.
  // `shared`: the workspace's look as a list of many read it once (its two files, read at each document of the outline before).
  const reportOf = async (slug, shared = null) => {
    const { title = slug, description = "", type, instructions, icon, look } = await metadataOf(folderOf(slug));
    const kept = instructions === true ? {} : effectiveLook(look, shared ?? workspaceLook(reportsDirectory));
    return {
      slug, title, description, ...(type ? { type } : {}), ...(typeof icon === "string" && icon ? { icon } : {}),
      ...(instructions === true ? { instructions: true } : {}), ...(Object.keys(kept).length ? { look: kept } : {}),
    };
  };
  // A web link as a list shows it (shared/web-links.mjs): kind "link", its address, no description, the user's icon and the
  // site's (siteIcon); null when its link.json does not read.
  const linkOf = async (slug) => {
    const link = await readLink(atRoot(slug));
    return link && { slug, title: link.title, description: "", kind: "link", url: link.url, ...(link.icon ? { icon: link.icon } : {}), ...(link.siteIcon ? { siteIcon: link.siteIcon } : {}) };
  };
  // A draft of another workspace as a list shows it (shared/drafts.mjs draftFacts; what was read of a workspace whose column
  // the sidebar shows, `others`: shared/workspace-columns.mjs snapshotOf): kind "draft", its workspace's id, where its file
  // is, and `missing` when it is shown grey (its workspace not on the registry, two of that id, or the draft gone).
  const draftItem = async (entry, ids, others = []) => {
    const named = draftOf(entry);
    const shown = named && others.find(({ id }) => id === named.ws);
    const read = shown?.facts.get(named.slug);
    if (read) {
      const folder = path.join(shown.root, named.slug);
      return { slug: entry, title: read.title, description: read.description, kind: read.kind === "link" ? "link" : "draft", workspace: named.ws, ...(read.icon ? { icon: read.icon } : {}), ...(read.kind === "link" ? { url: read.url, siteIcon: read.siteIcon } : {}), path: read.path, folder, root: shown.root };
    }
    const { ws, title, description, icon, path: file, folder, root, missing, kind, url, siteIcon } = await draftFacts(entry, ids);
    return { slug: entry, title, description, kind: kind === 'link' ? 'link' : 'draft', workspace: ws, ...(kind === 'link' ? { url, siteIcon } : {}), ...(icon ? { icon } : {}), ...(file ? { path: file, folder, root } : {}), ...(missing ? { missing } : {}) };
  };
  // An entry of the outline (`links`: the outline's web links; `ids`: the registry's, for a draft's) as a list shows it.
  const itemOf = async (slug, links, ids, others, shared = null) => (isForeign(slug) ? draftItem(slug, ids, others) : links.includes(slug) ? (await linkOf(slug)) ?? { slug, title: slug, description: "", kind: "link", url: "" } : reportOf(slug, shared));
  // This workspace's id and whether it is the default workspace (shared/workspace.mjs defaultWorkspace: its column is then 默认文档).
  const selfId = workspaceId(reportsDirectory);
  const isDefault = () => workspaceKey(defaultWorkspace()) === workspaceKey(reportsDirectory);
  // The workspaces of the drafts and the columns of the outline `value` (ids), this one's too: what the sidebar calls each ({ name,
  // above, upper, root, there, default? (the default workspace's, called 默认文档), self? }, or { missing: "unknown" | "ambiguous" };
  // `above` set where two of its columns named by their workspace share a name, the own column among them, the default's never
  // (it is called 默认文档), never for one of the machine's that it does not show). The single service watches the shown storage directories.
  const workspacesOf = (value, ids) => {
    const home = value.shown.find(({ isDefault: is }) => is)?.id ?? (isDefault() ? selfId : null);
    const wanted = new Set([...value.drafts.map((entry) => draftOf(entry)?.ws), ...value.groups.map(({ workspace }) => workspace), ...value.shown.map(({ id }) => id)].filter(Boolean));
    const among = new Set(value.groups.filter(({ workspace, title }) => workspace && !title).map(({ workspace }) => workspace));
    if (!value.groups.find(({ id }) => id === DOCS)?.title) among.add(selfId);
    among.delete(home);
    const names = workspaceNames(new Set([...wanted, selfId]), { ids: new Map([...ids, [selfId, [reportsDirectory]]]), stops: stopsOf(), among });
    projects.touch(new Map([...names].filter(([id]) => id !== selfId).map(([id, { root }]) => [id, root])));
    const said = Object.fromEntries([...wanted].map((id) => [id, { ...(names.get(id) ?? { missing: workspaceOf(id, ids).refused ?? "unknown" }), ...(id === home ? { default: true } : {}) }]));
    said[selfId] = { ...names.get(selfId), there: true, self: true, ...(selfId === home ? { default: true } : {}) };
    return said;
  };
  // The page listed apart (the user's writing preferences: 写作偏好, in .gallery/pages/), or null; the outline holds the others.
  const instructionsPage = () => pageSlug(reportsDirectory);
  // A field of a document's doc.json set (instructions).
  const mark = async (slug, field) => {
    const metadata = await metadataOf(folderOf(slug));
    await writeAtomic(filesOf(slug).json, `${JSON.stringify({ ...metadata, [field]: true }, null, 2)}\n`);
  };
  const exists = (target) => fs.access(target).then(() => true, () => false);
  // A slug no folder at the root, no page and no reserved name holds (shared/workspace.mjs slugTaken),
  // and none of the trash, for a page's address goes by its folder name: a new page under it would
  // open at the address of the one thrown away. `own`: the slug of what comes back from the trash,
  // which may have it.
  const freeSlug = async (stem, { own = null } = {}) => {
    const binned = new Set((await trashEntries()).map(({ slug }) => slug));
    binned.delete(own);
    for (let number = 1; ; number++) {
      const slug = number === 1 ? stem : `${stem}-${number}`;
      if (!slugTaken(slug, reportsDirectory) && !binned.has(slug)) return slug;
    }
  };
  // The slug something comes back from the trash under: its own when nothing holds it, else the next free
  // name; a doc-<id> one (the workbench's own names keep their look) whose name is taken meanwhile, or whose
  // page id another name has, a new doc-<id> (shared/workspace.mjs newDocSlug).
  const restoredSlug = async (entry) => {
    const free = await freeSlug(entry.slug, { own: entry.slug });
    if (!isDocSlug(entry.slug)) return free;
    return free === entry.slug && !(await idHolder(entry.slug, reportsDirectory)) ? free : newDocSlug(reportsDirectory);
  };
  // A report under another slug: its main's data-doc-id, which the checks tie to the slug. A file
  // still in the format's old names (data-report-id …) is written with them new (shared/old-names.mjs).
  const reslug = async (slug, from) => {
    const file = filesOf(slug).html;
    const html = await fs.readFile(file, "utf8");
    const next = newNames(html).replace(`data-doc-id="${from}"`, `data-doc-id="${slug}"`);
    if (next !== html) await writeAtomic(file, next);
  };

  // ---------- the outline ----------
  // shared/outline.mjs: read, every report but the one listed apart (the writing preferences) once;
  // each change made under the outline's lock, which a gallery command writing it with no server
  // running takes too; every write told (`changed`: the workbench's event stream hears it, so that
  // an open workbench shows what a command or another tab did).
  const outline = () => readOutline(reportsDirectory);
  const saveOutline = async (value) => {
    await writeOutline(reportsDirectory, value);
    changed();
  };
  const locked = (task) => withOutlineLock(reportsDirectory, task);

  // Put an entry (on disk already, so that the outline lists it somewhere) under `parent` (an entry, or a
  // column's top key: "" 文档's) at `index`; the end when missing, 文档's top when the parent is not there.
  async function place(slug, parent = "", index = Infinity) {
    await locked(async () => {
      const current = await outline();
      placeIn(current, slug, parent, index);
      await saveOutline(current);
    });
  }
  // An entry (on disk already) put right after `after` at its level when the outline holds that, else under `parent`
  // (an entry, or a column's top key; one not there: the own column's top), first (`first`) or last: 新建's place.
  async function placeNew(slug, { parent = "", after = null, first = false } = {}) {
    await locked(async () => {
      const current = await outline();
      for (const list of Object.values(current.children)) if (list.includes(slug)) list.splice(list.indexOf(slug), 1);
      const its = typeof after === "string" ? Object.keys(current.children).find((key) => current.children[key].includes(after)) : undefined;
      if (its !== undefined) placeIn(current, slug, its, current.children[its].indexOf(after) + 1);
      else placeIn(current, slug, typeof parent === "string" ? parent : "", first === true ? 0 : Infinity);
      await saveOutline(current);
    });
  }
  // A version 1 outline (no `groups`: the 文档 column's tree alone) as the whole outline: the other
  // columns of `current` (the outline read) as they are, but for the entries 文档 now holds.
  function withColumns(value, current) {
    const taken = new Set(Object.values(value.children).flat());
    const children = { ...value.children };
    for (const { id } of current.groups) {
      if (id === DOCS) continue;
      const walk = (key) => {
        const list = (current.children[key] ?? []).filter((slug) => !taken.has(slug));
        if (isTop(key) || list.length) children[key] = list;
        list.forEach(walk);
      };
      walk(topOf(id));
    }
    return { groups: current.groups, children };
  }
  // Take an entry (still on disk) out of the outline; the entries under it move up to where it was.
  function unplace(slug) {
    return locked(async () => {
      const current = await outline();
      for (const [parent, list] of Object.entries(current.children)) {
        const index = list.indexOf(slug);
        if (index < 0) continue;
        list.splice(index, 1, ...(current.children[slug] ?? []));
        delete current.children[slug];
        await saveOutline(current);
        return { parent, index };
      }
      return { parent: "", index: Infinity };
    });
  }

  // ---------- search ----------
  // A report's text as lines (shared/search.mjs), as its preview shows it (an Agent's natural HTML the
  // kit's, so a hit's place is the page's; its page blocks by the titles they show), kept by the
  // workspace's facts (./index.mjs lines): read again only when its file changed, or for a report with
  // page blocks when `titles`, what the workspace's titles are now, did.
  const linesOf = (slug, titles) => facts.lines(slug, titles);

  // ---------- the trash ----------
  // .gallery/trash/<id>/report is the document as it was, .gallery/trash/<id>/page a custom page's folder;
  // entry.json { id, kind, slug, title, at, parent, index } (kind "document" or "page": shared/workspace.mjs listTrash).
  const entryOf = (id) => readJson(path.join(trashDirectory, id, "entry.json"));
  const trashEntries = () => listTrash(reportsDirectory);

  // The one workbench lists every registered storage location. Mutations below still act
  // on the owning runtime, so files and their trash/history never move between projects.
  const otherRoots = () => unified ? [...registeredIds()].filter(([id, roots]) => id !== selfId && roots.length === 1).map(([id, roots]) => ({ id, root: roots[0] })) : [];

  const listedTrash = async () => [...await trashEntries(), ...(await Promise.all(otherRoots().map(async ({ id, root }) => (await listTrash(root)).map(entry => ({ ...entry, id: draftEntry(id, entry.id), slug: draftEntry(id, entry.slug) }))))).flat()];
  // ---------- custom pages in the trash ----------
  // A custom page's folder moved whole into .gallery/trash/<id>/page, its entry of kind "page" (parent ""
  // and index -1: a page has no place in the tree; its row's place in the sidebar's head stays in the
  // outline file, where it goes back to when it is restored). The home page as any other.
  async function trashPage(slug) {
    const meta = await readPageMeta(slug, reportsDirectory);
    if (!meta) return failure(404, "missing", "找不到这个页面");
    const id = `${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
    try {
      await fs.mkdir(path.join(trashDirectory, id), { recursive: true });
      await move(pageFiles(slug, reportsDirectory).folder, path.join(trashDirectory, id, "page"));
    } catch (error) {
      await fs.rm(path.join(trashDirectory, id), { recursive: true, force: true }).catch(() => {});
      throw error;
    }
    const entry = { id, kind: "page", slug, title: meta.title, at: Date.now(), parent: "", index: -1 };
    await writeAtomic(path.join(trashDirectory, id, "entry.json"), `${JSON.stringify(entry, null, 2)}\n`);
    return [200, { ok: true, entry }];
  }
  // A custom page back from the trash, under its slug, or the next free one when a document or a page
  // took it meanwhile (its main's data-page-id then says the new one).
  async function restorePage(entry) {
    const from = path.join(trashDirectory, entry.id, "page");
    const slug = await restoredSlug(entry);
    await fs.mkdir(layoutOf(reportsDirectory).customPages, { recursive: true });
    await move(from, pageFiles(slug, reportsDirectory).folder);
    if (slug !== entry.slug) {
      const { html } = pageFiles(slug, reportsDirectory);
      const text = await fs.readFile(html, "utf8").catch(() => null);
      const next = text?.replace(`data-page-id="${entry.slug}"`, `data-page-id="${slug}"`);
      if (text !== null && next !== text) await writeAtomic(html, next);
    }
    await fs.rm(path.join(trashDirectory, entry.id), { recursive: true, force: true });
    return [200, { ok: true, page: await readPageMeta(slug, reportsDirectory), entry: { ...entry, slug } }];
  }

  // ---------- web links ----------
  // A web link's folder (<slug>/link.json: shared/web-links.mjs) moved whole into .gallery/trash/<id>/link,
  // its entry of kind "link" keeping its place in the outline (a column's top key or the entry it was
  // under, and its index), as a document's does; back under its slug, or the next free one.
  async function trashLink(slug) {
    const link = await readLink(atRoot(slug));
    if (!link) return failure(404, "missing", "找不到这个链接");
    const id = `${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
    const before = await outline();
    const { parent, index } = await unplace(slug);
    try {
      await fs.mkdir(path.join(trashDirectory, id), { recursive: true });
      await move(atRoot(slug), path.join(trashDirectory, id, "link"));
    } catch (error) {
      await locked(() => saveOutline(before));
      await fs.rm(path.join(trashDirectory, id), { recursive: true, force: true }).catch(() => {});
      throw error;
    }
    const entry = { id, kind: "link", slug, title: link.title, at: Date.now(), parent, index: Number.isFinite(index) ? index : -1 };
    await writeAtomic(path.join(trashDirectory, id, "entry.json"), `${JSON.stringify(entry, null, 2)}\n`);
    return [200, { ok: true, entry }];
  }
  async function restoreLink(entry) {
    const from = path.join(trashDirectory, entry.id, "link");
    const slug = await restoredSlug(entry);
    await move(from, atRoot(slug));
    await fs.rm(path.join(trashDirectory, entry.id), { recursive: true, force: true });
    await place(slug, entry.parent, entry.index < 0 ? Infinity : entry.index);
    return [200, { ok: true, report: await linkOf(slug), entry: { ...entry, slug } }];
  }
  // Where a link goes as POST link asks it: `parent` (an entry, or a column's top key; none: the own column's
  // top), right after `after` (one of that parent's), first, else last. { parent, index } in `current`, or
  // { refused: [status, reason, message] }. (Until 2026-11-09 a link with no place went to a column 链接 made
  // for the first one; none is made now: 添加在线网页… puts it first in its column, gallery link add first in
  // the own column.)
  function linkPlace(current, { parent, after, first }) {
    const holds = (key) => (isTop(key) ? Object.hasOwn(current.children, key) : Object.values(current.children).some((list) => list.includes(key)));
    if (after !== null && after !== undefined) {
      const its = Object.keys(current.children).find((key) => current.children[key].includes(after));
      if (its === undefined) return { refused: [404, "after", "找不到要放在它后面的条目"] };
      if (parent !== undefined && parent !== null && parent !== its) return { refused: [409, "level", "要放在它后面的条目不在这一层"] };
      return { parent: its, index: current.children[its].indexOf(after) + 1 };
    }
    const to = parent === undefined || parent === null ? topOf(DOCS) : parent;
    if (isTop(to) && current.groups.some((group) => group.extension && topOf(group.id) === to)) return { refused: [409, "extension", "扩展的栏里放不了别的条目"] };
    if (!holds(to)) return { refused: [404, "parent", isTop(to) ? "找不到这一栏" : "找不到要放到它下面的条目"] };
    return { parent: to, index: first ? 0 : (current.children[to] ?? []).length };
  }
  // What a page says of itself and whether it lets frames show it, asked of the web (`web`), each
  // address's answer kept an hour (the workbench asks before it shows a link: features/link/LinkView.tsx).
  // A question under way is kept as it goes: the add and the view ask at once, and the site is asked once.
  const framed = new Map();
  function frameableOf(url) {
    const kept = framed.get(url);
    if (kept && Date.now() - kept.at < 3600_000) return kept.answer;
    const answer = web ? web.frameable(url).catch(() => ({ frameable: true, reason: "unknown" })) : Promise.resolve({ frameable: true, reason: "unknown" });
    if (framed.size >= 500) framed.delete(framed.keys().next().value);
    framed.set(url, { at: Date.now(), answer });
    void answer.then(result => {
      if (["auth", "unknown"].includes(result.reason) && framed.get(url)?.answer === answer) framed.delete(url);
    });
    return answer;
  }

  // The site's own icon of web link `slug` at address `url` (`web.icon`: src/editor/unfurl.mjs siteIcon, a few seconds at
  // most), written into its link.json once had, while the file still names that address (a change meanwhile wins: the
  // write is held to the text read), the workbench told. Never a failure: a site that gives none leaves the link as it
  // is, and the sidebar shows the grid globe. Resolves to the icon written, or null.
  function siteIconOf(slug, url) {
    if (!web?.icon) return Promise.resolve(null);
    return (async () => {
      const icon = await web.icon(url).catch(() => null);
      if (!icon) return null;
      const file = path.join(atRoot(slug), LINK_FILE);
      const text = await fs.readFile(file, "utf8").catch(() => null);
      const link = text === null ? null : readLinkText(text);
      if (!link || link.url !== url || link.siteIcon === icon) return null;
      const made = linkValue({ ...link, siteIcon: icon });
      if (made.refused || !made.value.siteIcon) return null;
      if (!(await writeAtomic(file, `${JSON.stringify(made.value, null, 2)}\n`, { expect: text }))) return null;
      changed();
      return icon;
    })().catch(() => null);
  }

  // ---------- commands ----------
  const GET = {
    // The preference files, and whether the dialog's first-open note shows (`hint`: not closed yet).
    preferences: async () => [200, { ok: true, items: await listPreferenceDocuments(), hint: preferencesHintShown() }],
    // What the reader has open in the browser (gallery status): each workbench tab that reported lately, the one used last
    // first, each with the file it shows, whether it is saved, and where the caret or the selection is (./presence.mjs).
    // Only with the token (a GET carries no Origin): the words of a selection are the reader's.
    status: async () => {
      const at = presence.now();
      const open = await Promise.all(presence.list().map(async (record) => describeTab(record, await openFacts(record), at)));
      return [200, { ok: true, open, last: open[0] ?? null }];
    },
    // What the workbench needs to begin: the commands, and the token its requests carry (a page of
    // this origin can read it anyway, from any preview page; other sites cannot, and the Host check
    // keeps DNS rebinding out). And which server this is, as its announcement says it
    // (shared/preview-server.mjs): its process, home and data directory, which `gallery open` verifies
    // against the announcement it found before it gives this server's address for a document; its
    // kind, and the Gallery it is (`gallery`: its version).
    info: async () => [200, {
      ok: true, version: 1, gallery: server.version, token: edits.token, commands: [...Object.keys(POST)],
      server: { pid: process.pid, home: path.resolve(defaultWorkspace()), data: serviceLocation().data, version: server.version, kind: server.kind, sandbox: server.sandbox },
    }],
    // The outline ({ version: 2, groups: the sidebar's columns, children, links: the web links' slugs, drafts:
    // the entries of other workspaces' drafts }: shared/outline.mjs), each entry's title, description and type
    // (from doc.json; a web link's with kind "link" and its url; a draft's with kind "draft", its workspace's id
    // and its file: draftItem) for a sidebar, the page of the writing preferences (写作偏好, or null), by
    // slug, the custom pages in the sidebar's order ([{ slug, title, icon, defaultCards, hint }]: shared/pages.mjs
    // listPages), the sidebar's head rows in their order (`head`: "new", "search" and "@<slug>" of each page,
    // shared/sidebar-head.mjs), what the trash holds, the drafts' and columns' workspaces by id (workspacesOf), this
    // workspace's own id (`self`), and the columns the extensions provide ([{ id, title, icon?,
    // entries (a tree of { id, title, icon?, url?, children? }), count, error? (said(): why the file does
    // not read, with no entries) }]: shared/extensions.mjs).
    async outline() {
      const { outline: value, others } = await outlineAndFile(reportsDirectory);
      const instructions = await instructionsPage();
      const slugs = [...Object.values(value.children).flat(), ...(instructions ? [instructions] : [])];
      const ids = registeredIds();
      const shared = workspaceLook(reportsDirectory);
      const report = async (slug) => [slug, await itemOf(slug, value.links, ids, others, shared)];
      const [reports, pages, trash, provided] = await Promise.all([Promise.all(slugs.map(report)), listPages(defaultWorkspace()), listedTrash(), listExtensions(reportsDirectory)]);
      const extensions = provided.map(({ id, file, revision, title, icon, entries, count, error, owner, column }) => ({ id, file, revision, title, ...(icon ? { icon } : {}), entries, count, ...(error ? { error: saying(error) } : {}), ...(owner ? { owner, column } : {}) }));
      const head = await headOf(reportsDirectory, pages);
      return [200, { ok: true, outline: value, instructions, reports: Object.fromEntries(reports), pages, head, trash, workspaces: workspacesOf(value, ids), self: selfId, shared: true, extensions, sandbox: server.sandbox, favorites: await readFavorites(reportsDirectory) }];
    },
    trash: async () => [200, { ok: true, entries: await listedTrash() }],
    // What a report's menu says at its foot (?slug=): when its file was last written (ms) and
    // how many words it holds (shared/words.mjs), as its preview shows it: its facts (./index.mjs).
    async stats(query) {
      const slug = query.get("slug") ?? "";
      const known = slugPattern.test(slug) ? await facts.facts(slug).catch(() => null) : null;
      if (!known) return failure(404, "missing", "找不到这份文档");
      return [200, { ok: true, edited: known.edited, words: known.words }];
    },
    // What a block reads of the workspace (?kind=todos|recent|stats|activity|table, &options=<JSON>: the
    // kit's workspace.query): { ok, kind, data, at } (./index.mjs query). Read alone, by any
    // page of this server, as the search is; &doc=<slug>: asked by an instance of that document, whose
    // export then embeds the table it asked for.
    async query(query) {
      let options;
      try {
        options = JSON.parse(query.get("options") ?? "{}");
      } catch {
        return [400, { ok: false, reason: "options", message: "options is JSON" }];
      }
      return facts.query(query.get("kind") ?? "", options, { doc: query.get("doc") });
    },
    // 设置 › 组件列表: the workspace's packages and the built-in blocks, each with its switches.
    components: async () => [200, { ok: true, ...components.read() }],
    // 复制本地路径 (?slug=): where the document's doc.html (an old one's report.html) is on this
    // computer, as the system writes a path (backslashes on Windows), for the reader to hand an Agent.
    // With &kind=page, a custom page's page.html (the page's ⋯ menu: its file is the one an Agent edits).
    async source(query) {
      const slug = query.get("slug") ?? "";
      const page = query.get("kind") === "page";
      if (!slugPattern.test(slug)) return failure(404, "missing", page ? "找不到这个页面" : "找不到这份文档");
      const file = path.resolve(page ? pageFiles(slug, reportsDirectory).html : filesOf(slug).html);
      if (!(await exists(file))) return failure(404, "missing", page ? "找不到这个页面" : "找不到这份文档");
      return [200, { ok: true, path: file }];
    },
    // 添加其他 Gallery 项目…'s list: the other registered workspaces, each with its documents in its own sidebar's order
    // (shared/drafts.mjs projectChoices). Read alone: nothing of theirs is written.
    projects: async () => [200, { ok: true, workspaces: await projectChoices(reportsDirectory, { stops: stopsOf() }) }],
    // 搜索文档 (?q=): the reports whose title or text holds the words (one phrase, case
    // alike), those whose title does first, then the most hits, then the sidebar's order; each with
    // how many times its text holds them and its first hits as snippets (shared/search.mjs). The
    // 写作偏好 are not among them (they open from 设置).
    async search(query) {
      const words = tidyQuery(query.get("q") ?? "");
      if (!words) return [200, { ok: true, results: [] }];
      const { children, groups, links } = await outline();
      const ids = registeredIds();
      const indexes = new Map();
      const order = [];
      const walk = (parent) => (children[parent] ?? []).forEach((slug) => { if (!links.includes(slug) && (!isForeign(slug) || Boolean(draftOf(slug)))) order.push(slug); walk(slug); });
      for (const { id } of groups) walk(topOf(id));
      const lower = words.toLowerCase();
      const shared = workspaceLook(reportsDirectory);
      const listed = new Map(await Promise.all(order.map(async (slug) => [slug, await itemOf(slug, links, ids, undefined, shared)])));
      const titles = JSON.stringify([...listed].map(([slug, { title }]) => [slug, title]));
      const found = (await Promise.all(order.map(async (slug) => {
        const draft = draftOf(slug);
        const owner = draft ? workspaceOf(draft.ws, ids) : null;
        if (owner && !owner.refused && !indexes.has(owner.root)) indexes.set(owner.root, projects.indexOf(owner.root, ids));
        const index = owner && !owner.refused ? await indexes.get(owner.root) : null;
        const lines = draft ? await index?.lines(draft.slug, titles) : await linesOf(slug, titles);
        if (!lines) return null;
        const title = String(listed.get(slug).title).toLowerCase().includes(lower);
        const { count, hits } = findIn(lines, words);
        return title || count ? { slug, title, count, hits } : null;
      }))).filter(Boolean);
      found.sort((a, b) => Number(b.title) - Number(a.title) || b.count - a.count);
      return [200, { ok: true, results: found.slice(0, 50) }];
    },
  };

  const POST = {
    async 'preference-edit'(body) {
      try {
        const result = await changePreferenceDocuments(body);
        if (body.action === 'rename') {
          const item = result.items.find(item => item.id === result.selected);
          if (item?.slug) await edits.renameReport(item.slug, item.name);
        }
        changed();
        return [200, { ok: true, ...result }];
      } catch (error) { return failure(409, 'preferences', error); }
    },
    // Extension-owned entries stay in sidebar.json; rename, reorder and deletion share this path.
    async "extension-edit"({ id, ...change }) {
      const source = await extensionSource(reportsDirectory, id);
      // A shared file uses its owner's existing lock even when edited from another project's server.
      const result = await withOutlineLock(source?.root ?? reportsDirectory, () => editExtension(source?.root ?? reportsDirectory, id, change), { local: true });
      if (!result.ok) return failure(result.status, result.reason, result.error);
      if (result.written) changed();
      return [200, { ok: true }];
    },
    // The workbench's tree, whole, with `base`: the outline it changed (as it read or last wrote it).
    // Written only while the outline still reads as `base` (looked at under the lock), else nothing is
    // written and 409 stale says so: a gallery command, a page or another tab wrote it since, and a
    // whole tree made from the one before would undo that; the workbench reads it again and makes its
    // change on what it reads (workspace/store.ts updateMeta). With no `base`, written as it is. With
    // `groups`, the sidebar's columns are as it says (made, renamed, ordered, removed: an entry of a
    // column taken away is no longer in the tree it sends, and comes back last in 文档 as it is read);
    // without (an outline of version 1), its children are the 文档 column's and every other column keeps
    // what it holds but the entries 文档 now does.
    async outline({ outline: value, base }) {
      if (!validOutline(value) || (base !== undefined && !validOutline(base))) return failure(400, "outline", "文档目录的结构不对：每份文档只能出现一次");
      if (!ownsOutline(reportsDirectory, value)) return failure(409, "cross-workspace", "跨工作区请复制，不能只移动目录位置");
      const written = await locked(async () => {
        const current = await outline();
        if (base !== undefined && !writtenAs(base, current)) return false;
        await saveOutline(value.groups ? value : withColumns(value, current));
        return true;
      });
      if (!written) return failure(409, "stale", "文档目录刚在别处改过");
      return [200, { ok: true, outline: await outline() }];
    },

    // A document moved in the outline with the documents under it (gallery move, and gallery new
    // --under or --after placing the one it made, while this server runs: src/cli/tree.mjs): under
    // `parent` ("" the top; left out, where it is or `after`'s parent), right after `after`, first
    // (`first`) or last. Refused: a document or a parent the outline holds not (404), the 写作偏好
    // page (409), `after` not under `parent` or itself, a place under itself or a document under it (409);
    // `workspace` is the command’s registered storage directory; the shared service selects its runtime.
    async move({ slug, parent, after = null, first = false, workspace }) {
      if (typeof workspace === "string" && !sameDirectory(workspace, reportsDirectory)) return failure(409, "elsewhere", "这个预览服务器管的是另一个目录的文档");
      const named = (value) => typeof value === "string" && slugPattern.test(value);
      // `parent`: an entry, "" the own column's top, or another column's top key (":<column id>": gallery move --column).
      const place = (value) => named(value) || (typeof value === "string" && /^:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value));
      if (!named(slug) || (parent !== undefined && parent !== "" && !place(parent)) || (after !== null && !named(after)) || typeof first !== "boolean") return failure(400, "body", "请求格式不对");
      const pages = await Promise.all([slug, parent, after].filter(named).map(value => metadataOf(folderOf(value))));
      if (pages.some(page => page?.instructions === true)) return failure(409, "instructions", "写作偏好不在文档目录里，不能移动，下面也不能放文档");
      // The same function a command runs with no server (shared/outline.mjs), under the same lock.
      const result = await moveDocument(reportsDirectory, slug, { parent, after, first });
      if (result.written) changed();
      if (!result.ok) {
        const [status, message] = {
          missing: [404, "找不到这份文档"], parent: [404, "找不到要放到它下面的文档"], after: [404, "找不到要放在它后面的文档"],
          level: [409, "要放在它后面的文档不在这一层"], itself: [409, "文档不能放在它自己后面"], inside: [409, "文档不能移到它自己或它下面的文档下面"],
          "cross-workspace": [409, "跨工作区请复制，不能只移动目录位置"],
        }[result.reason];
        return failure(status, result.reason, message);
      }
      return [200, { ok: true, ...result, outline: await outline() }];
    },

    // A new report, right after `after` at its level (新建 with a document, a draft or a link open), else under
    // `parent` in the outline (an entry: a row's 在下面新建; a column's top key: "" the own column's, ":<id>"
    // another's, its heading's ＋), first (`first`) or last: its title as given (none: an untitled document, its
    // h1, <title> and doc.json's title empty, the page saying 未命名文档 in gray: the workbench's 新建 makes one so;
    // a page block's new sub-page is named by what was typed) and its description in the UI's language, as
    // the workbench gives them, and its page's lang "en" when the UI is English (`language`: the kit's
    // own words in an export of it follow it, src/render/kit/words.js); else the starter's. Another
    // Project-prefixed requests use this same handler for their selected folder.
    async create({ title, description, parent = "", after = null, first = false, language }) {
      const name = typeof title === "string" ? title.replace(/\s+/g, " ").trim().slice(0, 200) : "";
      const slug = await newDocSlug(reportsDirectory); // doc-<its page id>: the folder and the address read alike (shared/page-links.mjs)
      await forgetChanges(slug);
      await reports.create(slug, name, typeof description === "string" && description.trim() ? description.trim() : fileWords(NEW_DESCRIPTION, uiLanguage(language)), { lang: pageLang(language) });
      await placeNew(slug, { parent, after, first });
      return [200, { ok: true, report: await reportOf(slug) }];
    },

    // The user's standing instructions to Agents (写作偏好, the workbench's 设置): the report that holds
    // them, made the first time (its title and description in the UI's language, as the workbench gives
    // them), in .gallery/pages/<slug>/; src/transfer/service.mjs writes its Markdown for Agents
    // (<workspace>/preferences/<name>.md).
    async instructions({ title, description, language, preference }) {
      const items = await listPreferenceDocuments();
      const item = preference ? items.find(item => item.id === preference) : items[0];
      if (!item) return failure(404, 'missing', '找不到写作偏好');
      preference = item.id;
      const found = await pageSlug(reportsDirectory, preference);
      if (found) {
        if ((await reportOf(found)).title !== item.name) await edits.renameReport(found, item.name);
        return [200, { ok: true, report: await reportOf(found) }];
      }
      const slug = await freeSlug(PAGE_SLUG);
      const given = (value, fallback) => (typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : fallback);
      await reports.create(slug, item.name, given(description, "Agent 每次写报告前都会先读的写作偏好"), { lang: pageLang(language), page: true });
      await mark(slug, "instructions");
      const metadata = await metadataOf(folderOf(slug));
      await writeAtomic(filesOf(slug).json, JSON.stringify({ ...metadata, preference }, null, 2) + "\n");
      return [200, { ok: true, report: await reportOf(slug) }];
    },

    // A switch of 设置 › 组件列表: { id, hidden?, shown?, disabled?, unlisted?, net? } (net: the consent dialog's, a block let
    // online or taken back), or a pack's, { pack, enabled }, written to gallery.json and in use as this answers.
    async components({ id, hidden, shown, disabled, unlisted, net, pack, enabled }) {
      try {
        return [200, { ok: true, ...(await components.write(pack !== undefined ? { pack, enabled } : { id, hidden, shown, disabled, unlisted, net })) }];
      } catch (error) {
        return failure(409, "components", error);
      }
    },

    // A copy, its title the original's and `suffix` ("（副本）" in Chinese: the workbench gives it in the UI's language;
    // a command gives none and has the file language's, shared/file-language.mjs),
    // an untitled one's `untitled` (未命名文档, the name the workbench shows it by) and the suffix.
    // `as` names the copy's folder and `title` its whole title (gallery duplicate's <new slug> and --title); none: doc-<a new id> and the
    // original's title with the suffix, as the workbench's 创建副本.
    async duplicate({ slug, suffix, untitled, as, title: given }) {
      if (typeof slug !== "string" || !slugPattern.test(slug) || !(await documentAt(slug))) return failure(404, "missing", "找不到这份文档");
      if ((as !== undefined && (typeof as !== "string" || !slugPattern.test(as) || keptName(as))) || (given !== undefined && typeof given !== "string")) return failure(400, "body", "请求格式不对");
      if (as !== undefined && (slugTaken(as, reportsDirectory) || (await trashEntries()).some((entry) => entry.slug === as) || (isDocSlug(as) && (await idHolder(as, reportsDirectory))))) return failure(409, "slug", "这个文档名已经有了");
      const copy = as ?? await newDocSlug(reportsDirectory); // a new document: a new id
      await forgetChanges(copy);
      await copyEntryFiles(reportsDirectory, slug, atRoot(copy), copy);
      const { title } = await reportOf(slug);
      const named = title || (typeof untitled === "string" && untitled.trim() ? untitled.trim().slice(0, 50) : fileWords(UNTITLED));
      const wanted = typeof given === "string" ? given.replace(/\s+/g, " ").trim().slice(0, 200) : "";
      const renamed = await edits.renameReport(copy, wanted || `${named}${typeof suffix === "string" && suffix.length > 0 && suffix.length <= 20 ? suffix : fileWords(COPY_SUFFIX)}`);
      const current = await outline();
      const [parent, list] = Object.entries(current.children).find(([, children]) => children.includes(slug)) ?? ["", null];
      await place(copy, parent, list ? list.indexOf(slug) + 1 : Infinity);
      return [200, { ok: true, report: await reportOf(copy), notes: renamed.notes ?? [] }];
    },

    // A confirmed cross-workspace copy. The receiving workspace owns every new file and id.
    // Files are prepared outside the tree lock; commit and rollback concern only newly made folders.
    // `keep` (gallery copy): each document keeps its slug where this workspace has that free, else gets a new doc-<id> one, as the sidebar's copies all do.
    async "copy-from"({ sourceWs, slug, parent = "", index = 0, keep = false }) {
      const source = typeof sourceWs === "string" ? workspaceOf(sourceWs) : {};
      if (!source.root || sourceWs === selfId || typeof slug !== "string" || !slugPattern.test(slug) || typeof parent !== "string" || (!isTop(parent) && !entryPattern.test(parent)) || !Number.isInteger(index) || index < 0) return failure(400, "body", "请求格式不对");
      const sourceTree = await readOutline(source.root);
      if (!Object.values(sourceTree.children).some(list => list.includes(slug))) return failure(404, "missing", "找不到这份文档");
      const slugs = [];
      const walk = key => {
        if (!slugPattern.test(key) || slugs.includes(key)) throw new Error("文档目录的结构不对：每份文档只能出现一次");
        slugs.push(key);
        for (const child of sourceTree.children[key] ?? []) walk(child);
      };
      walk(slug);
      const names = new Map();
      for (const item of slugs) {
        let copy = null;
        if (keep === true && !slugTaken(item, reportsDirectory) && !(await trashEntries()).some((entry) => entry.slug === item) && !(isDocSlug(item) && (await idHolder(item, reportsDirectory)))) copy = item;
        if (copy === null) do { copy = await newDocSlug(reportsDirectory); } while ([...names.values()].includes(copy));
        names.set(item, copy);
      }
      const stage = path.join(layoutOf(reportsDirectory).gallery, `copy-${randomBytes(8).toString("hex")}`);
      const committed = [];
      try {
        await fs.mkdir(stage, { recursive: true });
        for (const item of slugs) await copyEntryFiles(source.root, item, path.join(stage, names.get(item)), names.get(item), { names });
        // Each copy a new document here: what was kept of one deleted before under its name (a slug kept: `keep`) is none of its.
        for (const item of slugs) await forgetChanges(names.get(item));
        await locked(async () => {
          const current = await outline();
          const owner = isTop(parent) ? columnWorkspaceId(current.groups.find(group => topOf(group.id) === parent), selfId) : entryWorkspace(parent, selfId);
          if (owner !== selfId || (isTop(parent) ? !current.groups.some(group => topOf(group.id) === parent && !group.extension) : !Object.values(current.children).some(list => list.includes(parent)))) throw new Error("找不到要放到它下面的文档");
          for (const item of slugs) {
            const copy = names.get(item);
            await fs.rename(path.join(stage, copy), atRoot(copy));
            committed.push(atRoot(copy));
          }
          forgetSnapshot(reportsDirectory);
          placeIn(current, names.get(slug), parent, index);
          for (const item of slugs) if (sourceTree.children[item]?.length) current.children[names.get(item)] = sourceTree.children[item].map(child => names.get(child));
          await saveOutline(current);
        });
        return [200, { ok: true, slug: names.get(slug), count: slugs.length }];
      } catch (error) {
        for (const folder of committed) await fs.rm(folder, { recursive: true, force: true });
        forgetSnapshot(reportsDirectory);
        return failure(409, "copy", error.text ? error : error.message);
      } finally {
        await fs.rm(stage, { recursive: true, force: true });
      }
    },

    // 字体与布局: a field selection is explicit, including the system default and a value equal to the
    // global default. Other fields keep their own choices. Legacy full-look requests preserve existing
    // choices for unchanged displayed fields. The watcher tells the document's other pages ("look").
    async look({ slug, look, field, value }) {
      if (typeof slug !== "string" || !slugPattern.test(slug) || !(await documentAt(slug))) return failure(404, "missing", "找不到这份文档");
      if ((await metadataOf(folderOf(slug)))?.instructions === true) return failure(409, "instructions", "写作偏好没有字体与布局");
      const byField = field !== undefined || value !== undefined;
      if (byField ? typeof field !== "string" || !Object.hasOwn(LOOK, field) || !LOOK[field].includes(value) : look !== null && (typeof look !== "object" || Array.isArray(look))) return failure(400, "look", "字体与布局不对");
      const file = filesOf(slug).json;
      let metadata = null;
      try { metadata = JSON.parse(await fs.readFile(file, "utf8")); } catch {}
      if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return failure(409, "metadata", "这份文档的标题和说明读不出来");
      const own = byField ? { ...ownLookOf(metadata.look), [field]: value } : updatedOwnLook(metadata.look, workspaceLook(reportsDirectory), look);
      const next = withLookField(metadata, own);
      if (JSON.stringify(next) !== JSON.stringify(metadata)) await writeAtomic(file, `${JSON.stringify(next, null, 2)}\n`);
      return [200, { ok: true, report: await reportOf(slug) }];
    },

    // One user-level default; individual document overrides remain explicit choices.
    async looks({ slug }) {
      if (typeof slug !== "string" || !slugPattern.test(slug) || !(await documentAt(slug))) return failure(404, "missing", "找不到这份文档");
      if ((await metadataOf(folderOf(slug)))?.instructions === true) return failure(409, "instructions", "写作偏好没有字体与布局");
      const metadata = await readJson(filesOf(slug).json);
      if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return failure(409, "metadata", "这份文档的标题和说明读不出来");
      const look = effectiveLook(metadata.look, workspaceLook(reportsDirectory));
      try { await writeGlobalLook(look); }
      catch (error) { return failure(409, "look", error); }
      changed();
      return [200, { ok: true, look }];
    },

    // A document's title (its h1, <title> and doc.json, as its page saves it: edits.renameReport), or with
    // kind "page" a custom page's (its page.json's title alone: page.html is the Agent's).
    // The sidebar's head rows in the order a drag left them (`order`: "new", "search", "@<slug>", each once:
    // shared/sidebar-head.mjs storedHead), written into the outline file under its lock, every other thing
    // of it as it was; the workbench's stream hears it (every tab, every browser shows that order).
    async head({ order }) {
      const head = storedHead(order);
      if (!head) return failure(400, "head", "侧栏头部的顺序不对");
      await locked(() => writeHead(reportsDirectory, head));
      changed();
      return [200, { ok: true, head: await headOf(reportsDirectory, await listPages(defaultWorkspace())) }];
    },

    // A blank custom page (the sidebar's 新建页面: shared/pages.mjs createPage with `blank`), titled `title`
    // (the workbench gives 未命名页面 in the UI's language, which its row's field is typed over at once), its
    // slug page-<an id: newPageSlug>, its row in the sidebar's head right after page `after`'s (a page's
    // menu's 新建页面), else last, its page's lang "en" when the UI is English (`language`). An Agent writes it.
    async "new-page"({ title, after = null, language }) {
      const name = typeof title === "string" ? title.replace(/\s+/g, " ").trim() : "";
      if (!name || name.length > 200) return failure(400, "title", "标题不能是空的，也不能超过 200 个字");
      if (after !== null && (typeof after !== "string" || !slugPattern.test(after))) return failure(400, "body", "请求格式不对");
      const slug = await newPageSlug(reportsDirectory);
      await createPage(slug, name, { root: reportsDirectory, blank: true, after, ...(pageLang(language) ? { lang: pageLang(language) } : {}) });
      changed();
      return [200, { ok: true, page: await readPageMeta(slug, reportsDirectory) }];
    },

    async rename({ slug, title, kind = "document" }) {
      if (typeof slug !== "string" || !slugPattern.test(slug)) return failure(400, "slug", "文档名不对");
      if (kind === "page") {
        let page;
        try {
          page = await renamePage(slug, title, reportsDirectory);
        } catch {
          return failure(400, "title", "标题不能是空的，也不能超过 200 个字");
        }
        return page ? [200, { ok: true, page }] : failure(404, "missing", "找不到这个页面");
      }
      const result = await edits.renameReport(slug, title);
      if (!result.ok) return failure({ title: 400, missing: 404 }[result.reason] ?? 409, result.reason, result.message ?? "改名没有成功");
      return [200, { ok: true, report: await reportOf(slug), notes: result.notes }];
    },

    // A page icon chosen in the sidebar (a row's icon, the page's own picker in its frame: docs/workbench.md "The
    // sidebar", **Row icons**), for a document not open there (the open one's page sets it itself: set-icon):
    // `icon` an icon value or null for none. A document's is its header's div.doc-icon and doc.json's icon, as
    // gallery set --icon writes them (edits.reiconReport: kept among its versions as the reader's), and takes
    // an emoji, an icon of the 图标 tab or a picture of its own assets/ (one the picker uploaded); with kind
    // "page" a custom page's, its page.json's icon alone (setPageMeta, as gallery page set --icon), an emoji or
    // an icon. A web link's is link-set's. Answers { report } or { page } as the list shows it.
    async icon({ slug, icon = null, kind = "document" }) {
      if (typeof slug !== "string" || !slugPattern.test(slug)) return failure(400, "slug", "文档名不对");
      const type = icon === null ? "none" : iconKind(icon);
      if (!type || (type !== "none" && /["<>&]/.test(icon)) || (kind === "page" && type === "image")) return failure(400, "icon", "这不是一个图标");
      if (kind === "page") {
        const page = await setPageMeta(slug, { icon }, reportsDirectory);
        return page ? [200, { ok: true, page }] : failure(404, "missing", "找不到这个页面");
      }
      if (type === "image" && !(await exists(path.join(folderOf(slug), ...icon.split("/"))))) return failure(404, "picture", "这张图片不在文档的文件夹里");
      const result = await edits.reiconReport(slug, icon);
      if (!result.ok) return failure({ missing: 404, "no-title": 409 }[result.reason] ?? 409, result.reason, result.message ?? (result.reason === "missing" ? "找不到这份文档" : "图标没有换成"));
      return [200, { ok: true, report: await reportOf(slug), notes: result.notes }];
    },

    // The sidebar's 收藏 as a gallery command (gallery favorite) and the workbench's browsers share them (shared/favorites.mjs): { add?, remove? }
    // entries as this workspace's sidebar names them (a slug, or "~<ws id>/<slug>"), each one the outline holds (add) or not (remove: any), written
    // into the outline file under its lock. Answers { favorites } (entries as this sidebar names them) and tells the workbench's stream.
    async favorite({ add = [], remove = [] }) {
      const entries = (list) => Array.isArray(list) && list.length <= 1000 && list.every((entry) => typeof entry === "string" && entryPattern.test(entry));
      if (!entries(add) || !entries(remove)) return failure(400, "body", "请求格式不对");
      if (add.length) {
        const held = new Set(Object.values((await outline()).children).flat());
        if (add.some((entry) => !held.has(entry))) return failure(404, "missing", "找不到这份文档");
      }
      const result = await changeFavorites(reportsDirectory, { add, remove });
      if (result.changed) changed();
      return [200, { ok: true, ...result }];
    },

    // A document to the trash (with kind "page", a custom page: its folder moved whole, the home page as
    // any other; with kind "link", a web link's folder).
    async trash({ slug, kind = "document" }) {
      if (typeof slug !== "string" || !slugPattern.test(slug)) return failure(404, "missing", "找不到这份文档");
      if (kind === "page") return trashPage(slug);
      if (kind === "link") return trashLink(slug);
      if ((await metadataOf(folderOf(slug)))?.instructions === true) return failure(409, "instructions", "写作偏好不能移到回收区");
      if (!(await documentAt(slug))) return failure(404, "missing", "找不到这份文档");
      const { title } = await reportOf(slug);
      const id = `${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
      const before = await outline();
      const { parent, index } = await unplace(slug);
      try {
        await fs.mkdir(path.join(trashDirectory, id), { recursive: true });
        await moveAway(slug, path.join(trashDirectory, id, "report"));
      } catch (error) {
        await locked(() => saveOutline(before));
        await fs.rm(path.join(trashDirectory, id), { recursive: true, force: true }).catch(() => {});
        throw error;
      }
      const entry = { id, kind: "document", slug, title, at: Date.now(), parent, index: Number.isFinite(index) ? index : -1 };
      await writeAtomic(path.join(trashDirectory, id, "entry.json"), `${JSON.stringify(entry, null, 2)}\n`);
      return [200, { ok: true, entry }];
    },

    async restore({ id }) {
      const entry = typeof id === "string" && trashIdPattern.test(id) ? await entryOf(id) : null;
      if (!entry) return failure(404, "missing", "回收区里没有这一项");
      if (entry.kind === "page") return restorePage(entry);
      if (entry.kind === "link") return restoreLink(entry);
      const from = path.join(trashDirectory, id, "report");
      const home = await fitsAtHome(entry.slug, from);
      const slug = home ? entry.slug : await restoredSlug(entry); // taken meanwhile: the next free one (a doc-<id> name, a new one)
      if (home) await moveEach(await fs.readdir(from), from, atRoot(slug));
      else await move(from, atRoot(slug));
      if (slug !== entry.slug) await reslug(slug, entry.slug);
      await fs.rm(path.join(trashDirectory, id), { recursive: true, force: true });
      await place(slug, entry.parent, entry.index < 0 ? Infinity : entry.index);
      return [200, { ok: true, report: await reportOf(slug), entry: { ...entry, kind: "document", slug } }]; // an entry from before the custom pages has no kind
    },

    async destroy({ id }) {
      const entry = typeof id === "string" && trashIdPattern.test(id) ? await entryOf(id) : null;
      if (!entry) return failure(404, "missing", "回收区里没有这一项");
      // A document's (one from before kinds, 0.1's, has none: a document's) whose name no document holds now: its review forgotten.
      if ((entry.kind ?? "document") === "document" && !(await documentAt(entry.slug))) await forgetChanges(entry.slug);
      await fs.rm(path.join(trashDirectory, id), { recursive: true, force: true });
      return [200, { ok: true }];
    },

    // A new web link (a column's ⋯ › 添加在线网页…, gallery link add): { url, title, icon?, parent?, after?,
    // first? } (shared/web-links.mjs linkValue: http or https, a title of 1 to 200 characters), its folder
    // <slug>/link.json under a slug of its title's Latin words, else its site's name, else "link" (linkStem;
    // the next free one), placed where it says (linkPlace: no parent, the own column's top; first, or last; with no place at all, first in the own column).
    // Refused before anything is made: an address of this Gallery's own (its host and port: framed with the
    // sandbox's own origin it could reach the workbench), a place that is not there. Answers the link as the
    // outline lists it, where it went and the outline; the site's icon is fetched after (siteIconOf: waited
    // for by a command with no server, `wait`, never by the workbench's add).
    async link({ url, title, icon = null, parent, after = null, first = false }, { port, wait = false } = {}) {
      const made = linkValue({ url, title, icon });
      if (made.refused) return failure(400, made.refused, made.message);
      if (ownAddress(made.value.url, port)) return failure(409, "own", "这是 Gallery 自己的地址，请直接链接文档");
      if ((parent !== undefined && parent !== null && typeof parent !== "string") || (after !== null && typeof after !== "string") || typeof first !== "boolean") return failure(400, "body", "请求格式不对");
      const placed = await locked(async () => {
        const current = await outline();
        // No place given: first in the own column (gallery link add's, the sidebar's 添加在线网页… in it).
        const where = linkPlace(current, { parent, after, first: first || ((parent === undefined || parent === null) && after === null) });
        if (where.refused) return where;
        const slug = await freeSlug(linkStem(made.value.title, made.value.url));
        await fs.mkdir(atRoot(slug), { recursive: true });
        await writeAtomic(path.join(atRoot(slug), LINK_FILE), `${JSON.stringify(made.value, null, 2)}\n`);
        placeIn(current, slug, where.parent, where.index);
        await saveOutline(current);
        return { slug, parent: where.parent, index: where.index };
      });
      if (placed.refused) return failure(...placed.refused);
      const fetched = siteIconOf(placed.slug, made.value.url);
      if (wait) await fetched;
      return [200, { ok: true, link: await linkOf(placed.slug), parent: placed.parent, index: placed.index, outline: await outline() }];
    },

    // A web link changed (its row's 重命名 and 修改网址…, gallery link set): { slug, url?, title?, icon? }
    // (icon null: none), link.json written whole; nothing written when it says the same. A new address
    // drops the site's icon of the old one and fetches the new site's (siteIconOf).
    async "link-set"({ slug, url, title, icon }, { port, wait = false } = {}) {
      const link = typeof slug === "string" && slugPattern.test(slug) ? await readLink(atRoot(slug)) : null;
      if (!link) return failure(404, "missing", "找不到这个链接");
      const address = url ?? link.url;
      const made = linkValue({ url: address, title: title ?? link.title, icon: icon === undefined ? link.icon ?? null : icon, siteIcon: link.siteIcon ?? null });
      if (made.refused) return failure(400, made.refused, made.message);
      const moved = made.value.url !== link.url;
      if (moved && ownAddress(made.value.url, port)) return failure(409, "own", "这是 Gallery 自己的地址，请直接链接文档");
      if (moved) delete made.value.siteIcon;
      if (JSON.stringify(made.value) !== JSON.stringify(link)) await writeAtomic(path.join(atRoot(slug), LINK_FILE), `${JSON.stringify(made.value, null, 2)}\n`);
      if (moved) {
        const fetched = siteIconOf(slug, made.value.url);
        if (wait) await fetched;
      }
      return [200, { ok: true, link: await linkOf(slug) }];
    },

    // 添加其他 Gallery 项目… (a column's ⋯): what a path names (shared/drafts.mjs findDraft), put
    // in the sidebar right after the column `after` (an id), its workspace registered:
    // - a workspace's folder (or one that holds Gallery documents and is no workspace yet: made one once
    //   `confirm` says so): its column, whole (all its documents), shown, right after `after` (addWorkspace);
    //   this workspace's own: nothing to do (`own`);
    // - a document's doc.html or folder: as addDraft picks one (in the sidebar already: revealed, `existing`;
    //   its workspace's column hidden or none, or its workspace shown by the sidebar not before this (`fresh`:
    //   registered now, its folder made a workspace now, or its folder away till now): a picked column right
    //   after `after`, the document and those under it alone; one shown takes it). One in no workspace is
    //   refused with reason "unregistered" and the folder that would become one (`folder`) until `confirm` says so, and that
    //   folder is then made a workspace (its gallery.json and .gallery/). One of this workspace answers its
    //   slug (`own`).
    // Refused: nothing there, a file or folder that is no Gallery draft or workspace (`plain`: 导入 copies
    // one in), a draft not right in its workspace, a workspace in the system's temporary folder, two
    // registered workspaces of its id. Answers { kind: "workspace", column, … } or { kind: "draft", entry, … }.
    async "draft-add"({ path: written, confirm = false, after = null }) {
      if (server.sandbox) return failure(403, "sandbox", "沙盒只能使用自己的工作区。");
      const found = await findDraft(written);
      const column = typeof after === "string" ? after : null;
      if (found.kind === "missing") return failure(404, "missing", "找不到这个文件或文件夹");
      if (found.kind === "plain") return failure(409, "plain", "这不是 Gallery 的底稿或工作区，可以用「导入」把文件复制进来");
      if (found.kind === "nested") return failure(409, "nested", "这份底稿不在它工作区的第一层（在回收区里，或是写作偏好），不能添加");
      if (found.kind === "name") return failure(409, "name", "这个文件夹的名字不是 Gallery 文档的写法（小写字母、数字和连字符），不能添加");
      // A folder that would become a workspace: the draft's parent, or a folder of documents.
      let root = found.kind === "workspace" ? found.root : found.kind === "folder" ? null : found.root;
      // Whether the sidebar showed its workspace's column before (registered, its folder there), as the user saw it.
      const fresh = !root || !shownWorkspaces(reportsDirectory).some((each) => sameDirectory(each.root, root));
      if (!root) {
        const folder = found.kind === "folder" ? found.folder : found.parent;
        if (foreignMarker(folder)) return failure(409, "marker", said("{0} 里的 gallery.json 是别的程序的，不能把它登记成工作区", folder));
        if (confirm !== true) return [409, { ok: false, reason: "unregistered", folder, ...saying(said("会把 {0} 登记成一个工作区（在里面放 gallery.json 和 .gallery/）", folder)) }];
        const made = await ensureWorkspace(folder);
        if (!made.ours) return failure(409, "marker", said("{0} 里的 gallery.json 是别的程序的，不能把它登记成工作区", folder));
        root = folder;
      }
      const whole = found.kind === "workspace" || found.kind === "folder";
      if (sameDirectory(root, reportsDirectory)) return [200, { ok: true, kind: whole ? "workspace" : "draft", own: true, existing: true, ...(whole ? { column: DOCS } : { entry: found.slug }) }];
      // On the registry (registered now, or before), under an id no other registered folder has.
      const registered = await registerWorkspace(root, { force: true }).catch(() => "failed");
      const there = workspaceOf(workspaceId(root));
      if (there.refused === "ambiguous") return failure(409, "ambiguous", said("本机登记的 {0} 个工作区编号相同（{1}），先用 gallery workspaces --forget 去掉其中一个", there.roots.length, workspaceId(root)));
      if (!there.root || !sameDirectory(there.root, root)) {
        return registered === "temporary" ? failure(409, "temporary", "这个工作区在系统的临时文件夹里，不能添加") : failure(409, "registry", "没能把它的工作区记进本机的登记表");
      }
      forgetSnapshot(root);
      if (whole) return [200, { ok: true, kind: "workspace", ...(await addWorkspace(reportsDirectory, root, { changed, after: column })) }];
      return [200, { ok: true, kind: "draft", ...(await addDraft(reportsDirectory, root, found.slug, { changed, pick: true, after: column, fresh })) }];
    },

    // The offline file, built from the saved source (checks included).
    async export({ slug }) {
      if (typeof slug !== "string" || !slugPattern.test(slug) || !(await exists(folderOf(slug)))) return failure(404, "missing", "找不到这份文档");
      const { problems = [], file, refused } = await reports.export(slug);
      if (refused) return failure(refused.reason === "missing" ? 404 : 409, refused.reason, refused.message);
      if (problems.length) return failure(422, "check", checkFailed(problems));
      return [200, { ok: true, path: shown(file) }];
    },
  };

  // What a web link's add and view ask of the web, checked as a change (Host, Origin, the token) but run
  // outside the queue: a page that answers slowly (10 s at most) holds back no save.
  const OUTSIDE = {
    // Whether the page at `url` lets other pages show it in a frame (X-Frame-Options, CSP's
    // frame-ancestors: src/editor/unfurl.mjs frameable), kept an hour: { frameable, reason? }. An address
    // of this Gallery's own is said as one that refuses ("own").
    async frameable({ url }, { port }) {
      const address = typeof url === "string" ? linkValue({ url, title: "-" }) : { refused: "url" };
      if (address.refused) return failure(400, "url", "这不是一个网址");
      if (ownAddress(address.value.url, port)) return [200, { ok: true, frameable: false, reason: "own" }];
      return [200, { ok: true, ...(await frameableOf(address.value.url)) }];
    },
    // Reveal a registered storage folder or one of its documents in the system file manager.
    async reveal({ entry, ws, page, preference }) {
      const ids = registeredIds();
      let target = null;
      if (typeof preference === 'string') {
        try { target = await preferenceFile(preference); } catch { return failure(404, 'missing', '找不到这个文件夹'); }
      }
      else if (typeof page === "string") target = slugPattern.test(page) ? pageFiles(page, reportsDirectory).folder : null;
      else if (typeof entry === "string" && draftOf(entry)) target = (await draftFacts(entry, ids)).folder;
      else if (ws === selfId) target = path.resolve(reportsDirectory); // this workspace's own column
      else if (typeof ws === "string") target = workspaceOf(ws, ids).root ?? null;
      if (!target || !(await exists(target))) return failure(404, "missing", "找不到这个文件夹");
      return [200, { ok: true, path: target, ...(await reveal(target)) }];
    },
    // A workbench tab's report of what it has open (./presence.mjs): outside the queue, a heartbeat waits behind no save.
    async presence(body) {
      const taken = presence.report(body);
      return taken.ok ? [200, { ok: true }] : failure(400, "body", "请求格式不对");
    },
    // The page's title, for the add dialog's 名称: "" when it has none or cannot be read.
    async title({ url }) {
      const address = typeof url === "string" ? linkValue({ url, title: "-" }) : { refused: "url" };
      if (address.refused) return failure(400, "url", "这不是一个网址");
      const result = web ? await web.title(address.value.url).catch(() => "") : "";
      const title = typeof result === "string" ? result : result?.title;
      const reason = ["auth", "unknown"].includes(result?.reason) ? result.reason : undefined;
      return [200, { ok: true, title: typeof title === "string" ? title.slice(0, 200) : "", ...(reason ? { reason } : {}) }];
    },
  };

  // The reads that need the token as well as the Host (a GET carries no Origin to check): what the reader has open.
  const TOKENED = new Set(["status"]);

  // Answer /__gallery/workspace/<name>.
  function handle(request, response, name) {
    if (request.method === "GET" && Object.hasOwn(GET, name)) {
      const host = request.headers.host ?? "";
      const port = request.socket.localPort;
      if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return sendJson(response, 403, { ok: false, reason: "host" });
      if (TOKENED.has(name) && request.headers["x-gallery-token"] !== edits.token) return sendJson(response, 403, { ok: false, reason: "token" });
      return GET[name](new URL(request.url ?? "/", "http://localhost").searchParams).then(([status, body]) => sendJson(response, status, body), (error) => sendJson(response, ...failure(500, "read", error)));
    }
    // POST stop (gallery stop, and a command replacing an older Gallery's server): checked as any
    // change, answered in the queue (the saves before it done), then the server closes and its
    // process ends. npm run dev's server is stopped where it runs (409).
    if (request.method === "POST" && name === "stop") {
      return edits.respond(async (checkedRequest) => {
        const checked = await edits.check(checkedRequest);
        if (checked.error) return checked.error;
        if (server.kind !== "cli" || typeof server.stop !== "function") return failure(409, "dev", "这是 npm run dev 的服务器：在运行它的地方停止它");
        response.once("finish", () => server.stop());
        return [200, { ok: true, pid: process.pid }];
      })(request, response);
    }
    // POST pack-install (设置 › 组件列表's 导入: src/server/component-settings.mjs install): { path } of a pack's folder
    // or zip on this computer, or { zip } its bytes in base64 (选择文件…), a larger body than a change's; checked
    // and queued as any change, a refusal said with why (409).
    if (request.method === "POST" && name === "pack-install") {
      return edits.respond(async (checkedRequest) => {
        const checked = await edits.check(checkedRequest, PACK_BODY);
        if (checked.error) return checked.error;
        if (!components?.install) return failure(404, "unknown");
        try {
          return [200, { ok: true, ...components.install(checked.body ?? {}) }];
        } catch (error) {
          if (!error.code) throw error;
          return failure(409, error.code, error);
        }
      })(request, response);
    }
    // POST todo (workspace.setTodo: the page's ./editor/page/todo-writes.mjs): checked as any
    // change, { slug, items: [{ ref, done }] } of a document at the root, written by the edit service as one
    // commit of the reader's (setTodos), which waits for a file half written outside the queue as a commit
    // does: never inside respond's turn, which it would wait behind.
    if (request.method === "POST" && name === "todo") {
      return (async () => {
        const checked = await edits.check(request);
        if (checked.error) return checked.error;
        const { slug, items } = checked.body ?? {};
        if (typeof slug !== "string" || !slugPattern.test(slug) || !Array.isArray(items)) return [400, { ok: false, reason: "body" }];
        if (!(await documentAt(slug)) || (await metadataOf(folderOf(slug)))?.instructions === true) return failure(404, "missing", "找不到这份文档");
        return edits.setTodos(slug, items);
      })().then(([status, body]) => sendJson(response, status, body), (error) => sendJson(response, ...failure(500, "write", error.message)));
    }
    const context = { port: request.socket.localPort };
    if (request.method === "POST" && Object.hasOwn(POST, name)) {
      return edits.respond(async (checkedRequest) => {
        const checked = await edits.check(checkedRequest);
        if (checked.error) return checked.error;
        const body = checked.body && typeof checked.body === "object" ? checked.body : {};
        // A gallery command's (src/cli/tree.mjs throughServer) for another workspace: that one writes it itself.
        if (typeof body.workspace === "string" && !sameDirectory(body.workspace, reportsDirectory)) return failure(409, "elsewhere", "这个预览服务器管的是另一个目录的文档");
        return POST[name](body, context);
      })(request, response);
    }
    if (request.method === "POST" && Object.hasOwn(OUTSIDE, name)) {
      return (async () => {
        const checked = await edits.check(request);
        if (checked.error) return checked.error;
        return OUTSIDE[name](checked.body && typeof checked.body === "object" ? checked.body : {}, context);
      })().then(([status, body]) => sendJson(response, status, body), (error) => sendJson(response, ...failure(500, "read", error)));
    }
    return sendJson(response, 404, { ok: false, reason: "unknown" });
  }

  // The import (src/transfer/service.mjs) makes reports and places them as create does. `run`: a command
  // as a POST runs it, [status, body], for a gallery command when no server runs (src/cli/link.mjs: the
  // same code, under the same lock); it answers no command that needs a server's edit service.
  const run = (name, body, context = {}) => (Object.hasOwn(POST, name) ? POST[name](body ?? {}, { wait: true, ...context }) : Promise.resolve(failure(404, "unknown", "没有这个命令")));
  return { handle, outline, trashEntries, place, freeSlug, index: facts, run };
}
