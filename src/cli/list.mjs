import fs from "node:fs/promises";
import path from "node:path";
import { iconKind } from "../shared/emoji/icon-value.mjs";
import { ownLookOf } from "../shared/document-look.mjs";
import { readFavorites } from "../shared/favorites.mjs";
import { descendantsIn, parentIn } from "../shared/outline.mjs";
import { isTop, topOf } from "../shared/outline-shape.mjs";
import { fullAddress, namedPlace } from "../shared/page-address.mjs";
import { reportsDirectory } from "../shared/paths.mjs";
import { documentLinks, listReportSlugs, roleOf } from "../shared/reports.mjs";
import { documentDirectory, documentFiles, isSlugName } from "../shared/workspace.mjs";
import { isWorkspace, readRegistry, workspaceId, workspaceKey } from "../shared/workspace-registry.mjs";
import { findPreviewServer } from "../shared/preview-server.mjs";
import { workspaceBase } from "../shared/service-location.mjs";
import { findIn, rankReports, reportLines } from "../shared/search.mjs";
import { commandArguments, inTrashSaid, UsageError } from "./arguments.mjs";
import { columnName, columnOf, named, ownColumnLabel, placeLine, readTree, topOfEntry, treeDocument } from "./tree.mjs";
import { shown, startLines } from "./report-start.mjs";
import { placeAddress } from "./server-process.mjs";

// gallery list [<words>...] (./usage.mjs): the workspace's documents, for an Agent to find the one the
// user means by its title, its topic or an address: each one's slug and title, its description, where
// it is in the sidebar's tree when it is under another (位置：the documents above it, from the top:
// ./tree.mjs placeLine), its address as a path (the port is the server's, and none need run), when its
// file (doc.html, report.html in an older document) was last written and where that file is, the one
// edited last first. With words, first the documents whose title, description or slug holds them (any
// of them; upper and lower case alike, a word found anywhere in them, as Chinese is written without
// spaces), the best first: those holding more of the words, then more of them in the title
// (src/shared/search.mjs rankReports); then those whose text holds them (its blocks' lines, as the
// workbench's 搜索文档 reads them: reportLines), more of the words first, then more places, each with
// its first place (正文：a snippet around the words); one argument that is a document's link or whole
// address lists that document, and one that finds nothing and names a document of the trash says so,
// with its title.
// gallery list --tree [<document>]: the documents as the sidebar shows them, in the outline's order,
// indented by depth, a line each (slug, emoji and title, description, last edit); with a document, it
// and the documents under it, after the line saying where it is. First, the workspace and where the
// user's writing preferences are (写作偏好, to read before writing: made from Gallery's default when
// there are none yet, report-start.mjs).
// The sidebar's web links (shared/web-links.mjs) are listed too, each said as one (网页链接：its
// address): after the documents in the plain list (those whose title, address or slug holds a word,
// with words), in their place in the tree; and with columns besides 文档 (栏: shared/outline-shape.mjs),
// the tree column by column, each under its name.

// gallery list --all [<words>...]: the documents of every workspace of the machine's registry
// (shared/workspace-registry.mjs, the current one first and always), those whose title, description or
// slug holds the words, the best first (none: all, the one edited last first), each after the line
// saying its workspace (工作区：<path>, what --workspace takes to work on it). Only read: nothing is
// written in another workspace, nor 写作偏好 made in the current one (as the list of the current one
// makes it), and the documents' text is not searched.

// gallery list [--tree [<document>]] [--all] --json: the same lists as one JSON object (./usage.mjs says its fields; only ever added to):
// { workspace, documents: [{ slug, title, icon, description, link, address, path, parent, column, columnId, favorite, look, edited,
// hit?, depth? }], links: […] } (--tree: the documents and links in the sidebar's order, `depth` how deep under others, and `drafts`; --all: each
// document with its `workspace`), none of what is in the trash.

/**
 * Every document a command opens of the workspace at `root` (another's for --all: read only), but the
 * page of the writing preferences, with what its metadata says of it and when its file was last written.
 */
export async function documentsOf(root = reportsDirectory) {
  const slugs = (await listReportSlugs(root)).filter(isSlugName); // a folder named by no slug is no command's
  const found = await Promise.all(slugs.map(async (slug) => {
    const directory = documentDirectory(slug, root);
    const { html: file, json } = documentFiles(directory);
    const stat = await fs.stat(file).catch(() => null);
    if (!stat?.isFile() || (await roleOf(directory)) === "instructions") return null;
    const metadata = await fs.readFile(json, "utf8").then(JSON.parse).catch(() => ({}));
    const line = (value) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
    return { slug, title: line(metadata.title) || slug, description: line(metadata.description), edited: stat.mtimeMs, file };
  }));
  return found.filter(Boolean);
}

// A time as the machine's clock reads it: 2026-10-23 14:05.
export const when = (ms) => {
  const at = new Date(ms);
  const two = (number) => String(number).padStart(2, "0");
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}`;
};

const plural = (count) => `${count} document${count === 1 ? "" : "s"}`;

/**
 * The documents of `all` (none of `listed`) whose text holds any of `words`: [{ ...document, hit:
 * the first place's snippet, count }], more of the words first, then more places, then the one
 * edited last. Each document's doc.html read as its blocks' lines (shared/search.mjs reportLines).
 */
async function textMatches(all, listed, words) {
  const wanted = [...new Set(words.toLowerCase().split(/\s+/).filter(Boolean))];
  const taken = new Set(listed.map(({ slug }) => slug));
  const found = await Promise.all(all.filter(({ slug }) => !taken.has(slug)).map(async (document) => {
    const lines = reportLines(await fs.readFile(document.file, "utf8").catch(() => ""));
    const each = wanted.map((word) => findIn(lines, word, { most: 1 })).filter(({ count }) => count > 0);
    if (!each.length) return null;
    return { ...document, words: each.length, count: each.reduce((sum, { count }) => sum + count, 0), hit: each[0].hits[0].text };
  }));
  return found.filter(Boolean).sort((a, b) => b.words - a.words || b.count - a.count || b.edited - a.edited);
}

// The label of the address gallery list gives: the list is a revision's first command, and the address
// goes to the user with the handoff (SKILL.md "Revising a document"), not now as gallery new's and open's.
const LATER_LINE = "交给用户（交稿时给；用 Chrome 或 Edge 打开）：";

/**
 * The last line of a list of one document found by name (a revision's first command): the address to
 * give the user with the handoff while a server runs, the workbench's whole one as gallery open gives
 * it; else a 提示 saying that none runs and how to get it then. Nothing else starts or writes: the list
 * only reads.
 */
async function handOverLine(slug) {
  const server = await findPreviewServer({ answering: true, timeout: 2000 });
  if (!server) return `提示：Gallery 没在运行，所以还没有完整的地址可以交给用户；交稿时运行 gallery open ${slug} --no-browser，打出 交给用户 那一行。`;
  return `${LATER_LINE}${await placeAddress(server.port, { slug })}`;
}

// The sidebar's web links: [{ slug, title, url, icon }], in the tree's order.
const linksOf = (tree) => [...tree.documents.values()].filter((entry) => typeof entry.url === "string");
const linkCount = (count) => `${count} web link${count === 1 ? "" : "s"}`;

// gallery list --tree [<document>].
async function listTree(positional, all) {
  if (positional.length > 1) throw new UsageError("--tree takes one document at most (its slug, link or address).");
  const tree = await readTree();
  const byDocument = new Map(all.map((document) => [document.slug, document]));
  // The columns as the sidebar shows them, an extension's among them where the user put it (or last).
  const extensions = new Map((tree.extensions ?? []).map((extension) => [extension.id, extension]));
  // A column the user removed from the sidebar (hidden), or of a workspace not shown (away), is not said: the sidebar does not draw it.
  const shown = tree.columns.filter((group) => (!group.extension || extensions.has(group.extension)) && !group.hidden && !group.away);
  const columns = shown.length > 1 ? shown : null; // 文档 alone: no column said, as before columns came
  let roots = tree.children[""] ?? [];
  let root = null;
  if (positional.length === 1) {
    const found = await treeDocument(positional[0], "--tree", tree);
    if (found.refused) {
      for (const line of await startLines({ reading: true })) console.log(line);
      console.error(found.refused);
      process.exit(1);
    }
    root = found.slug;
    roots = [root];
  }
  for (const line of await startLines({ reading: true })) console.log(line);
  // A column an extension provides: said, never listed (its entries are the extension's: gallery extension check <id>).
  // A column its program writes (columns/<column>.json) said as the extension's: check takes the extension's id.
  const provide = (extension) => console.log(`${extension.title}栏（扩展 ${extension.owner ?? extension.id}${extension.owner ? ` 的 columns/${extension.column}.json` : ""}：${extension.error ? `条目读不出来：${extension.error.message}` : `${extension.count} 个条目`}；gallery extension check ${extension.owner ?? extension.id} 打出它们）`);
  const provided = () => {
    for (const extension of extensions.values()) provide(extension);
  };
  // Counted as listed: the entries of the columns said (none of one the sidebar does not draw).
  const listed = shown.filter((group) => !group.extension).flatMap((group) => descendantsIn(tree.children, topOf(group.id)));
  const links = listed.filter((slug) => tree.documents.get(slug)?.url !== undefined).length;
  const count = listed.length - links;
  if (count + links === 0) {
    console.log('No documents yet: gallery new <slug> "<title>" makes one.');
    if (root === null) provided();
    return;
  }
  const counted = links ? `${plural(count)} and ${linkCount(links)}` : plural(count);
  if (root === null) console.log(`${counted}, as the sidebar shows them (one under another indented)${columns ? ", column by column" : ""}:`);
  else {
    const below = descendantsIn(tree.children, root);
    // Entries when a web link is among them, documents else (as before links came).
    const held = below.some((slug) => tree.documents.get(slug)?.url !== undefined) ? `${below.length} ${below.length === 1 ? "entry" : "entries"}` : plural(below.length);
    console.log(placeLine(tree, root));
    console.log(below.length ? `${named(tree, root)} and the ${held} under it, as the sidebar shows them:` : `${named(tree, root)}, with no document under it:`);
  }
  const walk = (slug, depth) => {
    const { title, description, icon, url, draft } = tree.documents.get(slug);
    const edited = byDocument.get(slug)?.edited;
    // A draft of another workspace (shared/drafts.mjs): where its file is (gallery --workspace <its workspace> works on it), or that it is gone.
    // Outside its own column, the name of that column, as the sidebar's grey tag says it (ownColumnLabel).
    const away = ownColumnLabel(tree, slug);
    const said = url !== undefined ? [`网页链接：${url}`]
      : draft ? [draft.missing ? "别处的底稿，找不到了" : away ? `「${away}」的底稿：${draft.path}` : `别处的底稿：${draft.path}`]
        : [...(away ? [`「${away}」的文档`] : []), ...(description ? [`说明：${description}`] : []), ...(edited ? [`上次编辑：${when(edited)}`] : [])];
    console.log(`${"  ".repeat(depth)}${slug}  ${iconKind(icon) === "emoji" ? `${icon} ` : ""}${title}${said.length ? `  （${said.join("；")}）` : ""}`);
    for (const child of tree.children[slug] ?? []) walk(child, depth + 1);
  };
  if (root !== null || !columns) {
    for (const slug of roots) walk(slug, 0);
    if (root === null) provided();
    return;
  }
  for (const group of columns) {
    if (group.extension) {
      provide(extensions.get(group.extension));
      extensions.delete(group.extension);
      continue;
    }
    const top = tree.children[topOf(group.id)] ?? [];
    console.log(`${columnName(group)}栏${top.length ? "" : "（空）"}`);
    for (const slug of top) walk(slug, 1);
  }
  provided(); // one the outline did not hold as it was read (its sidebar.json written in between)
}

// A document's address as the workbench takes it (`origin` before it, or none): of a workspace other
// than home with ~<its id>/ before its link, as gallery open gives it, so that it opens that one.
const addressIn = (root, slug, links, origin = "") => {
  const address = fullAddress(origin, { slug }, links);
  return workspaceBase(root) ? address.replace("/#", `/#~${workspaceId(root)}/`) : address;
};

// The running server's origin, when one answers as its announcement says (the address then whole, to give the
// user, as page list gives it; never a dead one a stopped server left behind), else "".
const runningOrigin = async () => {
  const server = await findPreviewServer({ answering: true, timeout: 2000 }).catch(() => null);
  return server ? `http://127.0.0.1:${server.port}` : "";
};

// gallery list --all [<words>...] (above).
async function listAll(positional) {
  const current = path.resolve(reportsDirectory);
  const same = (a, b) => workspaceKey(a) === workspaceKey(b);
  const roots = [current, ...readRegistry().workspaces.map(({ root }) => root).filter((root) => !same(root, current))];
  const searched = roots.filter(isWorkspace);
  const gone = roots.filter((root) => !isWorkspace(root));
  const all = (await Promise.all(searched.map(async (root) => (await documentsOf(root)).map((document) => ({ ...document, root }))))).flat();
  const words = positional.join(" ").trim();
  const listed = rankReports(all, words);
  const count = `${searched.length} workspace${searched.length === 1 ? "" : "s"}`;
  console.log(`Searched ${count} of this machine (gallery workspaces lists them; the current one: ${current}).`);
  if (all.length === 0) console.log(`No documents in ${searched.length === 1 ? "it" : "any of them"} yet.`);
  else if (listed.length === 0) console.log(`No document's title, description or slug in the ${count} holds ${words.split(/\s+/).map((word) => `"${word}"`).join(" or ")}: gallery list --all lists all ${all.length}.`);
  else {
    console.log(words ? `${listed.length} of ${plural(all.length)}, the best match first:` : `${plural(all.length)}, the one edited last first:`);
    // Each workspace's links and tree read once, for those that have a document listed.
    const read = new Map();
    const origin = await runningOrigin();
    const of = (root) => {
      if (!read.has(root)) read.set(root, Promise.all([documentLinks(root), readTree(root)]).then(([{ links }, tree]) => ({ links, tree })));
      return read.get(root);
    };
    for (const { root, slug, title, description, edited, file } of listed) {
      const { links, tree } = await of(root);
      console.log(`工作区：${root}`);
      console.log(`${slug}  ${title}`);
      if (description) console.log(`  说明：${description}`);
      if (parentIn(tree.children, slug)) console.log(`  ${placeLine(tree, slug)}`);
      console.log(`  地址：${addressIn(root, slug, links, origin)}`);
      console.log(`  上次编辑：${when(edited)}`);
      console.log(`  ${shown(file)}`);
    }
    console.log('提示：one in another workspace is worked on there: pass its 工作区 as --workspace to every command (gallery open <slug> --no-browser --workspace "<工作区>" gives its address).');
  }
  if (gone.length) console.log(`提示：not searched, no longer there (gallery workspaces --forget <path> forgets one, nothing on disk changed): ${gone.join(", ")}`);
}

// One document of workspace `root` as the JSON lists it (`tree`: readTree's of that workspace, `links`: its documents' links, `favorites`: its favorites).
async function documentJson({ slug, title, description, edited, file }, { tree, links, favorites, root = reportsDirectory }) {
  const metadata = await fs.readFile(documentFiles(documentDirectory(slug, root)).json, "utf8").then(JSON.parse).catch(() => ({}));
  const parent = parentIn(tree.children, slug);
  const group = parent === null ? null : columnOf(tree, topOfEntry(tree, slug));
  return {
    slug, title, icon: tree.documents.get(slug)?.icon ?? null, description, link: links.get(slug) ?? null, address: addressIn(root, slug, links), path: shown(file),
    parent: parent === null || isTop(parent) ? null : parent, column: group ? columnName(group) : null, columnId: group?.id ?? null,
    favorite: favorites.includes(slug), look: ownLookOf(metadata?.look), edited: new Date(edited).toISOString(),
  };
}

// The web link `slug` of the tree as the JSON lists it.
function linkJson(slug, { tree, favorites }) {
  const { title, url, icon } = tree.documents.get(slug);
  const parent = parentIn(tree.children, slug);
  const group = parent === null ? null : columnOf(tree, topOfEntry(tree, slug));
  return { slug, title, url, icon: icon ?? null, parent: parent === null || isTop(parent) ? null : parent, column: group ? columnName(group) : null, columnId: group?.id ?? null, favorite: favorites.includes(slug) };
}

// gallery list --json and --tree --json.
async function listJson(positional, all, { tree: asTree }) {
  const tree = await readTree();
  const { links } = await documentLinks();
  const favorites = await readFavorites(reportsDirectory);
  const context = { tree, links, favorites };
  const byDocument = new Map(all.map((document) => [document.slug, document]));
  const out = { workspace: path.resolve(reportsDirectory) };
  if (asTree) {
    if (positional.length > 1) throw new UsageError("--tree takes one document at most (its slug, link or address).");
    let roots = null;
    if (positional.length === 1) {
      const found = await treeDocument(positional[0], "--tree", tree);
      if (found.refused) {
        console.error(found.refused);
        process.exit(1);
      }
      roots = new Set([found.slug, ...descendantsIn(tree.children, found.slug)]);
    }
    const documents = [];
    const linked = [];
    const drafts = [];
    const walk = (slug, depth) => {
      const entry = tree.documents.get(slug);
      if (roots === null || roots.has(slug)) {
        if (entry.url !== undefined) linked.push({ ...linkJson(slug, context), depth });
        else if (entry.draft) {
          const parent = parentIn(tree.children, slug);
          const group = parent === null ? null : columnOf(tree, topOfEntry(tree, slug));
          drafts.push({ entry: slug, title: entry.title, description: entry.description, icon: entry.icon ?? null, workspace: entry.draft.ws, path: entry.draft.path ?? null, missing: entry.draft.missing ?? null, parent: parent === null || isTop(parent) ? null : parent, column: group ? columnName(group) : null, columnId: group?.id ?? null, favorite: favorites.includes(slug), depth });
        } else documents.push({ document: byDocument.get(slug), depth });
      }
      for (const child of tree.children[slug] ?? []) walk(child, depth + 1);
    };
    const shown = tree.columns.filter((group) => !group.extension && !group.hidden && !group.away);
    for (const group of shown) for (const slug of tree.children[topOf(group.id)] ?? []) walk(slug, 0);
    out.documents = await Promise.all(documents.filter(({ document }) => document).map(async ({ document, depth }) => ({ ...(await documentJson(document, context)), depth })));
    out.links = linked;
    out.drafts = drafts;
    return void console.log(JSON.stringify(out, null, 2));
  }
  const words = positional.join(" ").trim();
  const named = positional.length === 1 ? namedPlace(positional[0], links) : null;
  const byName = named && named.slug !== positional[0];
  const ranked = byName ? all.filter(({ slug }) => slug === named.slug) : rankReports(all, words);
  const listed = [...ranked, ...(words && !byName ? await textMatches(all, ranked, words) : [])];
  const sought = words.toLowerCase().split(/\s+/).filter(Boolean);
  const linkSlugs = byName ? [] : linksOf(tree).filter(({ slug, title, url }) => !sought.length || sought.some((word) => `${title} ${url} ${slug}`.toLowerCase().includes(word))).map(({ slug }) => slug);
  out.documents = await Promise.all(listed.map(async (document) => ({ ...(await documentJson(document, context)), ...(document.hit ? { hit: document.hit } : {}) })));
  out.links = linkSlugs.map((slug) => linkJson(slug, context));
  console.log(JSON.stringify(out, null, 2));
}

// gallery list --all --json.
async function listAllJson(positional) {
  const current = path.resolve(reportsDirectory);
  const same = (a, b) => workspaceKey(a) === workspaceKey(b);
  const roots = [current, ...readRegistry().workspaces.map(({ root }) => root).filter((root) => !same(root, current))].filter(isWorkspace);
  const all = (await Promise.all(roots.map(async (root) => (await documentsOf(root)).map((document) => ({ ...document, root }))))).flat();
  const listed = rankReports(all, positional.join(" ").trim());
  const read = new Map();
  const of = (root) => {
    if (!read.has(root)) read.set(root, Promise.all([documentLinks(root), readTree(root), readFavorites(root)]).then(([{ links }, tree, favorites]) => ({ links, tree, favorites })));
    return read.get(root);
  };
  const documents = await Promise.all(listed.map(async (document) => ({ workspace: document.root, ...(await documentJson(document, { ...(await of(document.root)), root: document.root })) })));
  console.log(JSON.stringify({ workspace: current, workspaces: roots, documents }, null, 2));
}

export async function run(argv) {
  const { positional, options } = commandArguments({ options: ["--tree", "--all", "--json"], argv });
  if (options.has("--all")) {
    if (options.has("--tree")) throw new UsageError("--all and --tree go apart: --tree is the current workspace's tree.");
    return options.has("--json") ? listAllJson(positional) : listAll(positional);
  }
  const all = await documentsOf();
  if (options.has("--json")) return listJson(positional, all, { tree: options.has("--tree") });
  if (options.has("--tree")) return listTree(positional, all);
  const words = positional.join(" ").trim();
  const { links } = await documentLinks();
  const named = positional.length === 1 ? namedPlace(positional[0], links) : null;
  const byName = named && named.slug !== positional[0];
  const ranked = byName ? all.filter(({ slug }) => slug === named.slug) : rankReports(all, words);
  const listed = [...ranked, ...(words && !byName ? await textMatches(all, ranked, words) : [])];
  const tree = await readTree();
  // The web links: every one, or those whose title, address or slug holds any of the words; none for a document named by its link or address.
  const sought = words.toLowerCase().split(/\s+/).filter(Boolean);
  const linked = byName ? [] : linksOf(tree).filter(({ slug, title, url }) => !sought.length || sought.some((word) => `${title} ${url} ${slug}`.toLowerCase().includes(word)));
  const binned = positional.length === 1 && listed.length === 0 && linked.length === 0 ? await inTrashSaid(positional[0]) : null;
  for (const line of await startLines({ reading: true })) console.log(line);
  const sayLinks = () => {
    if (!linked.length) return;
    const total = linksOf(tree).length;
    console.log(words ? `${linked.length} of ${linkCount(total)} in the sidebar:` : `${linkCount(total)} in the sidebar:`);
    for (const { slug, title, url } of linked) {
      console.log(`${slug}  ${title}`);
      console.log(`  网页链接：${url}`);
      if (parentIn(tree.children, slug)) console.log(`  ${placeLine(tree, slug)}`);
    }
  };
  if (binned) console.log(binned);
  else if (all.length === 0) {
    console.log('No documents yet: gallery new <slug> "<title>" makes one.');
    sayLinks();
  } else if (listed.length === 0 && linked.length === 0) console.log(`No document's title, description, slug or text holds ${words.split(/\s+/).map((word) => `"${word}"`).join(" or ")}: gallery list lists all ${all.length}.`);
  else if (listed.length === 0) sayLinks();
  else {
    console.log(words ? `${listed.length} of ${plural(all.length)}, the best match first:` : `${plural(all.length)}, the one edited last first:`);
    const origin = await runningOrigin();
    for (const { slug, title, description, edited, file, hit } of listed) {
      console.log(`${slug}  ${title}`);
      if (description) console.log(`  说明：${description}`);
      if (hit) console.log(`  正文：${hit}`);
      if (parentIn(tree.children, slug)) console.log(`  ${placeLine(tree, slug)}`);
      console.log(`  地址：${addressIn(reportsDirectory, slug, links, origin)}`);
      console.log(`  上次编辑：${when(edited)}`);
      console.log(`  ${shown(file)}`);
    }
    sayLinks();
    if (positional.length && listed.length === 1 && !linked.length) console.log(await handOverLine(listed[0].slug));
  }
}
