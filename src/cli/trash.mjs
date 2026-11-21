import path from "node:path";
import { isTop } from "../shared/outline-shape.mjs";
import { pageLinks, pageOfLink } from "../shared/page-links.mjs";
import { listPages, readPageMeta } from "../shared/pages.mjs";
import { reportsDirectory } from "../shared/paths.mjs";
import { defaultWorkspace, listTrash } from "../shared/workspace.mjs";
import { workspaceKey } from "../shared/workspace-registry.mjs";
import { commandArguments, UsageError } from "./arguments.mjs";
import { when } from "./list.mjs";
import { columnName, columnOf, named, placeLine, readTree, serviceCommand, topOfEntry, treeDocument } from "./tree.mjs";

// gallery trash <entry>… | list [--json] | restore <item>… | empty [<item>…] (./usage.mjs): the workbench's
// 移至回收区 and 设置 › 回收区 for an Agent. An entry is a document, a custom page or a web link of the sidebar; it is
// moved to the workspace's trash (.gallery/trash/<id>/), by the service's own `trash` command (workbench/service.mjs:
// through the workspace's running server when there is one, so that an open workbench shows it at once, else here by
// the same function), which is what the sidebar's menu runs. A document goes with its files and keeps its place in
// the entry the trash holds (its parent, its index): the documents under it move up to where it was, as the sidebar
// does, and none is trashed with it. restore puts an item back where it was (the service's `restore`: its slug, or the
// next free one when it was taken meanwhile); empty deletes for good (`destroy`), the one command of Gallery that does:
// only when the user asks. A custom page lives in the default workspace (pages/), so its trash is that workspace's:
// listed, restored and emptied there whichever workspace the command works in.

const same = (a, b) => workspaceKey(a) === workspaceKey(b);
const tidy = (value) => String(value).replace(/\s+/g, " ").trim();
const kindWord = { document: "document", page: "custom page", link: "web link" };

/**
 * The entry (document, custom page or web link) `name` names, of `tree` (readTree's): { kind, slug, title }; a page by its slug, a
 * web link by its slug or its link, a document by its slug, link or address, any by its whole title when only one has it.
 * Else { refused: what to say, exit 1 }. A name that is none of them, or of a document of the trash, throws a UsageError (documentNamed).
 */
export async function entryNamed(name, tree) {
  if (name.startsWith("~")) return { refused: `${name} is a document of another workspace: trash it in that workspace (gallery trash <slug> --workspace <its path>; gallery workspaces lists them).` };
  const page = await readPageMeta(name, defaultWorkspace()).catch(() => null);
  if (page) return { kind: "page", slug: page.slug, title: page.title };
  const links = [...tree.documents.values()].filter(({ url }) => url !== undefined);
  const linkSlug = pageOfLink(pageLinks(links), name.replace(/^.*#/, ""));
  if (linkSlug && tree.documents.get(linkSlug)?.url !== undefined) return { kind: "link", slug: linkSlug, title: tree.documents.get(linkSlug).title };
  let failure = null;
  try {
    const found = await treeDocument(name, "the document to trash", tree);
    if (found.refused) return { refused: found.refused };
    return { kind: "document", slug: found.slug, title: tree.documents.get(found.slug).title };
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    failure = / in the trash/.test(error.message) ? new UsageError(`${name} is in the trash already: gallery trash restore ${name} puts it back where it was; gallery trash empty ${name} deletes it for good (only when the user asks).`) : error;
  }
  // By the title as it stands, when exactly one entry has it.
  const wanted = tidy(name).toLowerCase();
  const titled = [
    ...[...tree.documents.values()].filter(({ slug }) => !slug.startsWith("~")).map(({ slug, title, url }) => ({ kind: url !== undefined ? "link" : "document", slug, title })),
    ...(await listPages(defaultWorkspace()).catch(() => [])).map(({ slug, title }) => ({ kind: "page", slug, title })),
  ].filter(({ title }) => tidy(title).toLowerCase() === wanted);
  if (titled.length === 1) return titled[0];
  if (titled.length > 1) return { refused: `More than one entry is called "${name}" (${titled.map(({ slug }) => slug).join(", ")}): name one by its slug.` };
  throw failure;
}

/** The root whose service holds an entry of kind `kind`: a custom page's is the default workspace's, any other this one's. */
const rootOf = (kind) => (kind === "page" ? defaultWorkspace() : reportsDirectory);

/**
 * Entry `entry` ({ kind, slug } from entryNamed) moved to the trash by the service's `trash`: resolves to the trash's entry
 * ({ id, kind, slug, title, at, parent, index }) or a refusal { refused }.
 */
export async function trashEntry({ kind, slug }) {
  const answer = await serviceCommand("trash", { slug, kind }, { root: rootOf(kind) });
  if (!answer?.ok) return { refused: answer?.message ?? answer?.reason ?? "no answer" };
  return answer.entry;
}

// The trash of this workspace, and the custom pages of the default workspace's when it is another: [{ ...entry, root }], newest first.
async function itemsOf() {
  const own = (await listTrash(reportsDirectory)).map((entry) => ({ ...entry, root: reportsDirectory }));
  const pages = same(reportsDirectory, defaultWorkspace()) ? [] : (await listTrash(defaultWorkspace())).filter(({ kind }) => kind === "page").map((entry) => ({ ...entry, root: defaultWorkspace() }));
  return [...own, ...pages].sort((a, b) => b.at - a.at);
}

// Where an item was, as gallery list says a place (位置：), or why it is not there to go back to: { text, parent, column }.
function wasAt(tree, item) {
  if (item.kind === "page") return { text: "custom page", parent: null, column: null };
  const parent = item.parent ?? "";
  if (isTop(parent)) {
    const group = columnOf(tree, parent);
    return { text: group ? (parent === "" ? "top level" : `top of the ${columnName(group)} column`) : "top level (its column is gone)", parent: null, column: group ? columnName(group) : null };
  }
  if (tree.documents.has(parent)) {
    const group = columnOf(tree, topOfEntry(tree, parent));
    return { text: `under ${named(tree, parent)}`, parent, column: group ? columnName(group) : null };
  }
  return { text: "top level (the entry it was under is gone)", parent: null, column: null };
}

// The trash item `name` names: its id, its slug or its whole title when only one has it.
function itemNamed(items, name) {
  const found = items.filter((item) => item.id === name || item.slug === name);
  const byTitle = found.length ? found : items.filter((item) => tidy(item.title).toLowerCase() === tidy(name).toLowerCase());
  if (byTitle.length === 1) return byTitle[0];
  if (byTitle.length > 1) return { refused: `More than one item of the trash is called "${name}": name one by its id (${byTitle.map((item) => item.id).join(", ")}).` };
  return { refused: `No item "${name}" in the trash: gallery trash list shows what it holds, with their ids.` };
}

async function trashSome(names) {
  if (names.length === 0) throw new UsageError("Name what to move to the trash: a document, a custom page or a web link.");
  const tree = await readTree();
  // All of them named before one is moved: a mistake in the last leaves the others where they are.
  const entries = [];
  for (const name of names) {
    const entry = await entryNamed(name, tree);
    if (entry.refused) {
      console.error(`${entry.refused} Nothing moved to the trash.`);
      process.exit(1);
    }
    if (entries.some(({ slug }) => slug === entry.slug)) continue;
    entries.push(entry);
  }
  let failed = false;
  for (const entry of entries) {
    const kids = entry.kind === "document" ? (tree.children[entry.slug] ?? []) : [];
    const was = placeLine(tree, entry.slug);
    const moved = await trashEntry(entry);
    if (moved.refused) {
      console.error(`Not moved to the trash: ${entry.slug} (${entry.title}): ${moved.refused}.`);
      failed = true;
      continue;
    }
    console.log(`Moved the ${kindWord[entry.kind]} ${entry.slug} (${entry.title}) to the trash (id ${moved.id}).`);
    if (entry.kind !== "page") console.log(`  It ${was === "位置：顶层" ? "was at the top level" : `was ${was.replace("位置：", "in ")}`}${kids.length ? `; the ${kids.length} document${kids.length === 1 ? "" : "s"} under it moved up there: ${kids.join(", ")}` : ""}.`);
  }
  console.log("提示：gallery trash restore <slug or id> puts an item back where it was; gallery trash list shows the trash. Nothing is deleted for good until gallery trash empty, which only the user's own request allows.");
  if (failed) process.exitCode = 1;
}

async function list(json) {
  const tree = await readTree();
  const items = await itemsOf();
  const described = items.map((item) => {
    const was = wasAt(tree, item);
    return {
      id: item.id, kind: item.kind, slug: item.slug, title: item.title, trashed: new Date(item.at).toISOString(), at: item.at,
      parent: was.parent, column: was.column, place: was.text, workspace: path.resolve(item.root),
    };
  });
  if (json) return void console.log(JSON.stringify({ workspace: path.resolve(reportsDirectory), items: described }, null, 2));
  console.log(`工作区：${path.resolve(reportsDirectory)}`);
  if (!described.length) return void console.log("The trash is empty.");
  console.log(`The trash holds ${described.length} item${described.length === 1 ? "" : "s"}, the one moved last first:`);
  for (const item of described) {
    console.log(`- ${item.id}  ${kindWord[item.kind]}  ${item.slug}  ${item.title}`);
    console.log(`    It was ${item.place}; moved ${when(item.at)}.`);
  }
  console.log("gallery trash restore <slug or id>… puts items back; gallery trash empty [<slug or id>…] deletes for good (only when the user asks).");
}

async function restore(names) {
  if (names.length === 0) throw new UsageError("Name what to restore: its slug, its title or its id (gallery trash list shows them).");
  const items = await itemsOf();
  const chosen = [];
  for (const name of names) {
    const item = itemNamed(items, name);
    if (item.refused) {
      console.error(`${item.refused} Nothing restored.`);
      process.exit(1);
    }
    if (!chosen.includes(item)) chosen.push(item);
  }
  let failed = false;
  for (const item of chosen) {
    const answer = await serviceCommand("restore", { id: item.id }, { root: item.root });
    if (!answer?.ok) {
      console.error(`Not restored: ${item.slug} (${item.title}): ${answer?.message ?? answer?.reason ?? "no answer"}.`);
      failed = true;
      continue;
    }
    const slug = answer.entry?.slug ?? item.slug;
    console.log(`Restored the ${kindWord[item.kind]} ${slug} (${item.title})${slug !== item.slug ? `; ${item.slug} was taken meanwhile` : ""}.`);
    if (item.kind !== "page") {
      const tree = await readTree();
      console.log(placeLine(tree, slug));
    }
  }
  if (failed) process.exitCode = 1;
}

async function empty(names) {
  const items = await itemsOf();
  const chosen = [];
  for (const name of names) {
    const item = itemNamed(items, name);
    if (item.refused) {
      console.error(`${item.refused} Nothing deleted.`);
      process.exit(1);
    }
    if (!chosen.includes(item)) chosen.push(item);
  }
  const doomed = names.length ? chosen : items;
  if (!doomed.length) return void console.log("The trash is empty: nothing to delete.");
  let failed = false;
  const gone = [];
  for (const item of doomed) {
    const answer = await serviceCommand("destroy", { id: item.id }, { root: item.root });
    if (!answer?.ok) {
      console.error(`Not deleted: ${item.slug} (${item.title}): ${answer?.message ?? answer?.reason ?? "no answer"}.`);
      failed = true;
      continue;
    }
    gone.push(`${item.slug} (${item.title})`);
  }
  if (gone.length) console.log(`Deleted for good from the trash (${gone.length}): ${gone.join(", ")}. This cannot be undone.`);
  if (failed) process.exitCode = 1;
}

export async function run(argv) {
  const [action, ...rest] = argv;
  if (action === "list") {
    const { positional, options } = commandArguments({ options: ["--json"], argv: rest });
    if (positional.length) throw new UsageError("gallery trash list takes nothing else.");
    return list(options.has("--json"));
  }
  if (action === "restore") return restore(commandArguments({ argv: rest }).positional);
  if (action === "empty") return empty(commandArguments({ argv: rest }).positional);
  return trashSome(commandArguments({ argv }).positional);
}

