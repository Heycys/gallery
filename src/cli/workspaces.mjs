import fs from "node:fs/promises";
import path from "node:path";
import { readAnnouncement } from "../shared/preview-server.mjs";
import { nameProblem, nameStops, ownName, workspaceLabels, workspaceName, writeWorkspaceName } from "../shared/workspace-name.mjs";
import {
  forgetWorkspace, isWorkspace, isWorkspaceId, readRegistry, registerQuietly, registerWorkspace, SCAN_DEPTH, SCAN_LIMIT, scanForWorkspaces, workspaceId, workspaceKey,
} from "../shared/workspace-registry.mjs";
import { defaultWorkspace, documentsFolder, ensureWorkspace, layoutOf } from "../shared/workspace.mjs";
import { clashingIds, draftEntry, workspaceOf } from "../shared/drafts.mjs";
import { removeColumn, removeDraft } from "../shared/outline-ops.mjs";
import { commandArguments, UsageError } from "./arguments.mjs";
import { notOurs, unwritable } from "./gallery.mjs";
import { documentsOf, when } from "./list.mjs";
import { reportsDirectory } from "../shared/paths.mjs";
import { columnName, editOutline, readTree, serviceCommand } from "./tree.mjs";

// gallery workspaces (./usage.mjs): the workspaces of this machine's registry
// (shared/workspace-registry.mjs), the current one first (marked *, registered as it is listed),
// then the one edited last first, those no longer there last: each
// with its name (shared/workspace-name.mjs: gallery.json's, else its folder's, the folder above it
// when two are called alike), its ws- id, its path, how many documents it has and when one was last
// edited; the shared service address is printed once; --json says the same as one JSON object. --scan [<folder>] registers the
// workspaces in a folder and below it (the user's Documents folder when none is named), --name "<name>" names the
// current workspace (made first when it is not there), --forget <path> takes one off the registry;
// --show <path or id> [--doc <slug>] is the sidebar's 添加其他 Gallery 项目… (a workspace's column whole, or one document of it:
// the service's draft-add, through the running server when there is one) and --hide <path or id> [--doc <slug>] its 从侧边栏移除
// (the column hidden, or 从文档树移除 of one draft: the outline written as the sidebar's menu writes it; the workspace, its files
// and the registry stay, which --forget is not). Nothing else is ever written, and no file of a workspace is removed. Two
// registered folders sharing an id are said (shared/drafts.mjs clashingIds: a sidebar refuses their drafts).

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
const same = (a, b) => workspaceKey(a) === workspaceKey(b);


/**
 * The line gallery new and gallery init print in a workspace with no name of its own (but the default
 * one, the user's own, which the sidebar calls 文档): how to name it after its project; else null.
 */
export function nameHint(root) {
  if (ownName(root)) return null;
  if (same(root, defaultWorkspace())) return null;
  const { name } = workspaceName(root, { stops: nameStops() });
  return `提示：这个工作区还没有名字（别处按文件夹叫它"${name}"）；它是为一个项目建的，就用 gallery workspaces --name "<项目名>" 写上项目名`;
}

// --name: the current workspace named (made first when it is not there), then registered.
async function nameIt(root, name) {
  const problem = nameProblem(name);
  if (problem) throw new UsageError(problem);
  try {
    const { ours, reads } = await ensureWorkspace(root);
    if (!ours) {
      console.error(notOurs(root, reads));
      process.exit(1);
    }
  } catch (error) {
    if (!error.code) throw error;
    console.error(unwritable(root, error.code));
    process.exit(1);
  }
  let written;
  try {
    written = await writeWorkspaceName(root, name);
  } catch (error) {
    console.error(error.code ? unwritable(root, error.code) : error.message);
    process.exit(1);
  }
  await registerQuietly(root);
  console.log(`工作区：${root}`);
  console.log(`名字：${written.name} (in ${layoutOf(root).marker}${written.before && written.before !== written.name ? `; it was "${written.before}"` : ""}): the sidebar and gallery workspaces call it so.`);
}

// --forget <path or ws- id>.
async function forget(target, current) {
  const forgotten = await forgetWorkspace(target);
  if (!forgotten.length) {
    console.error(`No registered workspace is ${isWorkspaceId(target) ? target : path.resolve(target)}: gallery workspaces lists them, with their paths and ws- ids.`);
    process.exit(1);
  }
  for (const root of forgotten) {
    console.log(`Forgot ${root} (only the registry changed: nothing on disk).${same(root, current) ? " It is the current workspace: the next command run in it registers it again." : ""}`);
  }
}

// --scan [<folder>].
async function scan(folder) {
  const target = path.resolve(folder ?? documentsFolder());
  if (!(await fs.stat(target).then((stat) => stat.isDirectory(), () => false))) {
    console.error(`No such folder: ${target} (--scan names a folder to look in).`);
    process.exit(1);
  }
  const known = new Set(readRegistry().workspaces.map(({ root }) => workspaceKey(root)));
  const { found, read, cut } = await scanForWorkspaces(target);
  console.log(`Scanned ${target}, ${SCAN_DEPTH} levels down (${plural(read, "folder")}): ${found.length ? `${plural(found.length, "workspace")}.` : "no workspace."}`);
  const stops = nameStops();
  for (const root of found) {
    const { name } = workspaceName(root, { stops });
    if (known.has(workspaceKey(root))) {
      await registerQuietly(root);
      console.log(`  已登记：${root}（${name}）`);
      continue;
    }
    try {
      await registerWorkspace(root);
    } catch (error) {
      console.log(`  没能登记（${error.code ?? error.message}）：${root}`);
      continue;
    }
    console.log(`  新登记：${root}（${name}）`);
  }
  if (cut) console.log(`Stopped after ${plural(SCAN_LIMIT, "folder")}: gallery workspaces --scan <a folder further down> looks at the rest.`);
  if (found.length) console.log("gallery workspaces lists them; gallery list <words> --all searches their documents.");
}

// The list.
async function list(current, json = false) {
  const here = isWorkspace(current);
  if (here) await registerQuietly(current);
  const registered = readRegistry().workspaces;
  const roots = [current, ...registered.map(({ root }) => root).filter((root) => !same(root, current))];
  const seenOf = new Map(registered.map(({ root, seen }) => [workspaceKey(root), Date.parse(seen)]));
  const documents = documentsFolder();
  const stops = nameStops({ documents });
  const entries = await Promise.all(roots.map(async (root) => {
    const there = isWorkspace(root);
    const found = there ? await documentsOf(root) : [];
    return { root, there, count: found.length, edited: found.reduce((latest, { edited }) => Math.max(latest, edited), 0), named: { root, ...workspaceName(root, { stops }) } };
  }));
  const [first, ...others] = entries;
  others.sort((a, b) => (b.there - a.there) || (b.edited - a.edited) || ((seenOf.get(workspaceKey(b.root)) ?? 0) - (seenOf.get(workspaceKey(a.root)) ?? 0)));
  const ordered = [first, ...others];
  const labels = new Map(workspaceLabels(ordered.map(({ named }) => named)).map((label) => [workspaceKey(label.root), label]));
  const server = await readAnnouncement();
  if (json) {
    const items = ordered.map((entry) => {
      const { name, own } = labels.get(workspaceKey(entry.root));
      return {
        id: workspaceId(entry.root), name, path: entry.root, current: entry === first, default: same(entry.root, defaultWorkspace()), named: Boolean(own),
        exists: entry.there, documents: entry.count, lastEdited: entry.edited ? new Date(entry.edited).toISOString() : null,
      };
    });
    return void console.log(JSON.stringify({ current: path.resolve(current), service: server ? { port: server.port, pid: server.pid, address: `http://127.0.0.1:${server.port}/` } : null, workspaces: items }, null, 2));
  }
  console.log(server ? `Gallery 服务：http://127.0.0.1:${server.port}/ (pid ${server.pid})` : "Gallery 服务：未启动");
  const registeredCount = registered.length;
  console.log(`${plural(registeredCount, "workspace")} on this machine's registry; the current one first (*):`);
  for (const entry of ordered) {
    const { name, own, above } = labels.get(workspaceKey(entry.root));
    const current = entry === first;
    const notes = [
      ...(own || !entry.there ? [] : ["没有起名：用的是文件夹的名字"]),
      ...(!entry.there ? [current ? "还没有建" : "不在了：文件夹或它的 gallery.json 找不到了"] : []),
    ];
    const told = !above ? "" : path.isAbsolute(above) ? `（${above}）` : `（上一级：${above}）`; // the folder above, or the path where that tells none apart
    console.log(`${current ? "*" : " "} ${name}${told}  ${workspaceId(entry.root)}${notes.length ? `  （${notes.join("；")}）` : ""}`);
    console.log(`    路径：${entry.root}`);
    if (entry.there) console.log(`    文档：${entry.count ? `${entry.count} 篇；上次编辑：${when(entry.edited)}` : "没有"}`);
  }
  // Two registered folders whose ids are one (six hex digits of a hash): their drafts in any sidebar are shown
  // as not found, neither guessed (shared/drafts.mjs), until one is forgotten.
  for (const { id, roots: clashed } of clashingIds()) {
    console.log(`${id} 是 ${clashed.length} 个登记的工作区共用的编号（${clashed.join("、")}）：侧边栏里它们的底稿都找不到；gallery workspaces --forget <路径> 去掉其中一个`);
  }
  const hint = here ? nameHint(current) : null;
  if (hint) console.log(hint);
  if (others.some(({ there }) => !there)) console.log("One no longer there stays registered (a drive may come back): gallery workspaces --forget <路径> takes it off, nothing on disk changed.");
  if (registeredCount <= 1) console.log(`gallery workspaces --scan registers the workspaces already on this machine (in the Documents folder, ${SCAN_DEPTH} levels down; or --scan <folder>).`);
  console.log("gallery list <words> --all searches the documents of them all; every command takes --workspace <路径> to work in one.");
}

// The workspace --show and --hide name: its ws- id or its folder. { root, id } (root null: an id nobody registered, or a clash) or { refused }.
function workspaceTarget(target) {
  if (isWorkspaceId(target)) {
    const found = workspaceOf(target);
    return found.root ? { root: found.root, id: target } : { id: target, root: null, refused: found.refused };
  }
  const root = path.resolve(target);
  return { root, id: workspaceId(root) };
}

// What the sidebar still draws after a hide: a column or an entry that stays, said with the way to be rid of it.
const STAYS = (what, forget) => `提示：the sidebar still lists ${what}: this Gallery's sidebar lists every registered workspace and its documents, and the outline's hidden and left marks (written, as the sidebar's own 从侧边栏移除 and 从文档树移除 write them) are not read for it. To take the workspace off every sidebar, gallery workspaces --forget "${forget}" (only the registry changes: nothing on disk; the next command run in it registers it again).`;

/**
 * A workspace's column `group` (readTree's) hidden as 从侧边栏移除 hides it: the workspace, its files and the registry stay; what was dragged
 * into it goes last to the own column. Said what it did, and whether the sidebar still draws it (it does where the outline's
 * hidden mark is not read: the line says how to be rid of it, and the exit code is 1).
 */
export async function hideWorkspaceColumn(group, tree) {
  const root = workspaceOf(group.workspace).root ?? group.workspace;
  const result = await editOutline((outline) => removeColumn(outline, group.id));
  if (!result.ok) {
    console.error(`Not hidden: ${result.refused ?? result.message ?? result.reason}.`);
    process.exit(1);
  }
  const now = await readTree();
  const stays = now.columns.some((each) => each.id === group.id && !each.hidden && !each.away);
  console.log(`${result.changed ? "Hid" : "Already hidden:"} the column "${columnName(group)}" (${group.workspace}) of the sidebar: the workspace ${root}, its files and the registry are as they were.`);
  if (stays) {
    console.log(STAYS(`the column "${columnName(group)}"`, root));
    process.exitCode = 1;
  }
}

// --show <path or id> [--doc <slug>]: 添加其他 Gallery 项目….
async function show(target, slug, register) {
  const named = workspaceTarget(target);
  if (!named.root) {
    console.error(`${target} is ${named.refused === "ambiguous" ? "the id of more than one registered workspace" : "no registered workspace"}: gallery workspaces lists them, with their ids and paths; --show <folder> registers one.`);
    process.exit(1);
  }
  const written = slug === undefined ? named.root : path.join(named.root, slug);
  const answer = await serviceCommand("draft-add", { path: written, ...(register ? { confirm: true } : {}) });
  if (!answer?.ok) {
    if (answer?.reason === "unregistered") console.error(`${answer.message ?? "The folder is no workspace yet"}: nothing added. 提示：run it again with --register to make it one and show it.`);
    else console.error(`Not added: ${answer?.message ?? answer?.reason ?? "no answer"}.`);
    process.exit(1);
  }
  const tree = await readTree();
  const id = workspaceId(named.root);
  if (answer.own) return void console.log(`${named.root} is this workspace's own: ${answer.kind === "draft" ? `the document ${answer.entry} is in its column already` : "its column is the first one"}.`);
  if (answer.kind === "workspace") {
    const column = tree.columns.find((each) => each.id === answer.column);
    console.log(`${answer.shown || answer.moved ? "Showed" : "The sidebar shows"} the workspace ${named.root} as the column "${column ? columnName(column) : answer.column}" (all its documents).`);
    return;
  }
  const entry = answer.entry ?? draftEntry(id, slug);
  console.log(`${answer.existing ? "The sidebar lists the document already" : "Added the document to the sidebar"}: ${entry} (${tree.documents.get(entry)?.title ?? slug}), from ${named.root}${answer.added?.length > 1 ? `, with ${answer.added.length - 1} under it` : ""}.`);
}

// --hide <path or id> [--doc <slug>]: 从侧边栏移除 (the column) or 从文档树移除 (one draft).
async function hide(target, slug) {
  const named = workspaceTarget(target);
  const tree = await readTree();
  if (named.id === workspaceId(reportsDirectory)) {
    console.error(`${reportsDirectory} is the current workspace: its own column is never removed from its sidebar.`);
    process.exit(1);
  }
  if (slug === undefined) {
    const group = tree.columns.find((each) => each.workspace === named.id);
    if (!group) {
      console.error(`The sidebar has no column of ${target}: gallery workspaces lists the workspaces, gallery list --tree the columns.`);
      process.exit(1);
    }
    return hideWorkspaceColumn(group, tree);
  }
  const entry = draftEntry(named.id, slug);
  if (!tree.documents.has(entry)) {
    console.error(`The sidebar's tree has no document ${slug} of ${target} (${entry}): gallery list --tree shows what it holds.`);
    process.exit(1);
  }
  const title = tree.documents.get(entry).title;
  const result = await editOutline((outline) => removeDraft(outline, entry));
  if (!result.ok) {
    console.error(`Not removed: ${result.refused ?? result.message ?? result.reason}.`);
    process.exit(1);
  }
  console.log(`Took the document ${entry} (${title}) out of the sidebar's tree; its file and its workspace are untouched, and the documents under it went up to where it was.`);
  const now = await readTree();
  if (now.documents.has(entry)) {
    console.log(STAYS(`the document ${entry}`, named.root ?? target));
    process.exitCode = 1;
  }
}

export async function run(argv, context) {
  const { positional, options, values } = commandArguments({ options: ["--scan", "--json", "--register"], values: ["--name", "--forget", "--show", "--hide", "--doc"], argv });
  const asked = [options.has("--scan"), values.has("--name"), values.has("--forget"), values.has("--show"), values.has("--hide")].filter(Boolean).length;
  if (asked > 1) throw new UsageError("One of --scan, --name, --forget, --show and --hide at a time.");
  if (values.has("--doc") && !values.has("--show") && !values.has("--hide")) throw new UsageError("--doc <slug> goes with --show or --hide: one document of that workspace.");
  if (options.has("--register") && !values.has("--show")) throw new UsageError("--register goes with --show: it makes a folder that is no workspace yet one.");
  if (options.has("--json") && asked > 0) throw new UsageError("--json is for the list: gallery workspaces --json.");
  if (positional.length > (options.has("--scan") ? 1 : 0)) {
    throw new UsageError(options.has("--scan") ? "--scan takes one folder at most." : "gallery workspaces names no folder: --scan <folder> looks in one, --workspace <dir> names the current workspace.");
  }
  const current = path.resolve(context.workspace);
  if (values.has("--name")) return nameIt(current, values.get("--name"));
  if (values.has("--forget")) return forget(values.get("--forget"), current);
  if (values.has("--show")) return show(values.get("--show"), values.get("--doc"), options.has("--register"));
  if (values.has("--hide")) return hide(values.get("--hide"), values.get("--doc"));
  if (options.has("--scan")) return scan(positional[0]);
  return list(current, options.has("--json"));
}
