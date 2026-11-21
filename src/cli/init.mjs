import fs from "node:fs/promises";
import path from "node:path";
import { homeFailure, makeDefaultHome } from "../editor/home-page.mjs";
import { installOfficialPacks } from "../shared/block-packs.mjs";
import { packOf } from "../shared/components/installed.mjs";
import { shippedBlocks } from "../shared/shipped-blocks.mjs";
import { reportsDirectory } from "../shared/paths.mjs";
import { sameDirectory } from "../shared/preview-server.mjs";
import { copyOldDocuments, defaultWorkspace, ensureWorkspace, layoutOf } from "../shared/workspace.mjs";
import { nameProblem, writeWorkspaceName } from "../shared/workspace-name.mjs";
import { registerQuietly } from "../shared/workspace-registry.mjs";
import { commandArguments, UsageError } from "./arguments.mjs";
import { notOurs, unwritable } from "./gallery.mjs";

// gallery init [<dir>] [--from <old reports dir>] [--name "<name>"] (./usage.mjs): the workspace made
// (<dir>, which gallery.mjs reads as --workspace before anything computes a path, else the workspace
// found): its folder, gallery.json (never over one that is there) and .gallery/; said as
// 工作区：<abs>（新建）or （已有）. --name writes its name in gallery.json (shared/workspace-name.mjs:
// what the sidebar and gallery workspaces call it), said as 名字：…; then it is registered on the
// machine's registry (shared/workspace-registry.mjs). With --from, an older Gallery's documents copied
// in (shared/workspace.mjs copyOldDocuments): each document whose slug is free here, preferences.md when there is none here,
// the sidebar's order, the 写作偏好 page, the custom emoji and the recent versions, each said in a
// line; the old folder is only read. Then Gallery's own block packs, as a server's start installs them
// (shared/block-packs.mjs installOfficialPacks: Gallery 风格 on, 柔光风格 off; said in a line when one is
// installed now), and the default home page (首页, pages/home: src/editor/home-page.mjs)
// when the workspace has had none, as a server's start makes it, said in a line when it is made (after
// the copy, so that a document of the old folder keeps its slug). Exits 1 when the workspace cannot be
// written, or --from names no folder.

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** The lines saying what copyOldDocuments copied (`copied`: its result) from `from` into workspace `root`. */
export function copiedLines(copied, from, root) {
  const { preferences } = layoutOf(root);
  return [
    copied.copied.length ? `Copied ${plural(copied.copied.length, "document")} from ${from}: ${copied.copied.join(", ")}` : `Copied no documents from ${from}.`,
    ...(copied.skipped.length ? [`Skipped (the slug is taken here, or the folder's name is no slug): ${copied.skipped.join(", ")}`] : []),
    ...(copied.kept.length ? [`Left behind (a name a workspace keeps for itself, for its custom blocks here, which no new document takes): ${copied.kept.join(", ")}`] : []),
    ...(copied.preferences === "copied" ? [`写作偏好：copied (${preferences})`] : copied.preferences === "kept" ? [`写作偏好：kept the workspace's (${preferences}); the old one was not copied`] : []),
    ...(copied.outline ? [`Sidebar order: ${copied.outline}`] : []),
    ...(copied.page ? [`写作偏好's page: ${copied.page === "copied" ? "copied" : "kept the workspace's"}`] : []),
    ...(copied.emoji ? [`Emoji library: ${copied.emoji} added`] : []),
    ...(copied.history ? [`Recent versions: ${plural(copied.history, "document")}`] : []),
    ...(copied.packages.length ? [`Custom blocks: ${copied.packages.join(", ")}`] : []),
  ];
}

export async function run(argv) {
  const { values } = commandArguments({ values: ["--from", "--name"], argv }); // <dir> was read by gallery.mjs
  const root = reportsDirectory;
  const name = values.get("--name");
  const problem = name === undefined ? null : nameProblem(name);
  if (problem) throw new UsageError(problem);
  let made;
  try {
    const { made: madeNow, ours, reads } = await ensureWorkspace(root, { state: sameDirectory(root, defaultWorkspace()) });
    if (!ours) {
      console.error(notOurs(root, reads));
      process.exit(1);
    }
    made = madeNow;
  } catch (error) {
    if (!error.code) throw error;
    console.error(unwritable(root, error.code));
    process.exit(1);
  }
  console.log(`工作区：${root}（${made ? "新建" : "已有"}）`);
  // Its name (gallery.json's `name`: what the sidebar and gallery workspaces call it), and the machine's registry.
  if (name !== undefined) {
    try {
      const written = await writeWorkspaceName(root, name);
      console.log(`名字：${written.name}${written.before && written.before !== written.name ? ` (it was "${written.before}")` : ""}`);
    } catch (error) {
      console.error(error.code ? unwritable(root, error.code) : error.message);
      process.exit(1);
    }
  }
  await registerQuietly(root);
  if (values.has("--from")) {
    const from = path.resolve(values.get("--from"));
    if (!(await fs.stat(from).then((stat) => stat.isDirectory(), () => false))) {
      console.error(`No such folder: ${from} (--from names an older Gallery's reports/ folder).`);
      process.exit(1);
    }
    if (sameDirectory(from, root)) {
      console.error(`${from} is this workspace: --from names another folder (an older Gallery's reports/).`);
      process.exit(1);
    }
    for (const line of copiedLines(await copyOldDocuments({ from, to: root }), from, root)) console.log(line);
  }
  if (!sameDirectory(root, defaultWorkspace())) {
    console.log('下一步：gallery new <slug> "<title>" makes a document; gallery open opens Gallery.');
    return;
  }
  const packs = await installOfficialPacks(root);
  for (const made of packs.packs) {
    if (made.failed) console.warn(`块包：Gallery's pack ${made.id} was not installed (${made.failed}); a later start tries again.`);
    else if (made.first) {
      // Its blocks by the pack each counts in (packOf): Gallery 风格's folder holds Gallery's blocks for documents too, which are the default pack's.
      // Of those, the ones whose manifest says listed: false are named: off in the menus until the user turns them on.
      const shipped = new Map(shippedBlocks().map((block) => [block.id, block]));
      const all = [...made.added, ...made.same, ...made.updated];
      const elsewhere = all.filter((id) => packOf(id, shipped.get(id)?.places) !== made.id);
      const off = elsewhere.filter((id) => shipped.get(id)?.listed === false);
      const offSaid = off.length ? `; ${off.join(" and ")} of them off in the menus until 设置 › 组件列表 turns ${off.length > 1 ? "them" : "it"} on` : "";
      console.log(`块包：${made.name.zh} (${made.id} ${made.version}, ${all.length - elsewhere.length} blocks${elsewhere.length ? `; with it ${elsewhere.length} of Gallery's blocks for documents, in 默认块包 (the default pack${offSaid})` : ""})${made.id === "gallery-soft" ? ", switched off: 设置 › 组件列表 turns it on" : ""}`);
    }
  }
  const home = await makeDefaultHome(root);
  if (home.did === "made") console.log(`首页：${home.file} (the home page, its cards Gallery's today and note; the workbench opens it first)`);
  else if (home.did === "failed") console.warn(`首页：${homeFailure(home)}`); // the workspace made all the same
  console.log('下一步：gallery new <slug> "<title>" makes a document; gallery open opens the workbench.');
}
