import fs from "node:fs/promises";
import path from "node:path";
import { storedOf } from "../shared/outline.mjs";
import { entryPattern, isTop, topOf } from "../shared/outline-shape.mjs";
import { workspaceId } from "../shared/workspace-registry.mjs";
import { isDocumentSource, isSlugName, layoutOf, markerOf } from "../shared/workspace.mjs";

const workspaceSettings = new Set(["outline.json", "blocks.json", "hints.json", "emoji-library", "pages"]);
const skipped = new Set([".git", "node_modules"]);

export async function copySandboxWorkspace(source, home) {
  const original = layoutOf(source);
  const target = layoutOf(home);
  const marker = await fs.lstat(original.marker).catch(() => null);
  if (!marker?.isFile() || marker.isSymbolicLink()) throw new Error("源工作区需要普通文件 gallery.json");
  const config = markerOf(await fs.readFile(original.marker, "utf8"));
  if (!config.ours) throw new Error("源目录不是 Gallery 工作区");
  delete config.value.extensions; // Copied extensions need a new decision before their code can run.
  await fs.writeFile(target.marker, JSON.stringify(config.value, null, 2) + "\n", { flag: "wx" });

  let ignored = 0;
  async function copy(from, to) {
    const stat = await fs.lstat(from);
    if (stat.isSymbolicLink()) { ignored++; return; }
    if (stat.isFile()) return fs.copyFile(from, to);
    if (!stat.isDirectory()) { ignored++; return; }
    await fs.mkdir(to);
    for (const name of await fs.readdir(from)) {
      if (!skipped.has(name.toLowerCase())) await copy(path.join(from, name), path.join(to, name));
    }
  }
  for (const item of await fs.readdir(source, { withFileTypes: true })) {
    const { name } = item;
    const from = path.join(source, name);
    if (["preferences.md", "preferences", "components", "pages", "extensions"].includes(name)) {
      await copy(from, path.join(home, name));
    } else if (isSlugName(name)) {
      if (item.isSymbolicLink()) { ignored++; continue; }
      if (!item.isDirectory()) continue;
      const files = await fs.readdir(from);
      if (files.some(file => isDocumentSource(file) || file === "link.json")) await copy(from, path.join(home, name));
    }
  }
  const gallery = await fs.lstat(original.gallery).catch(error => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
  if (gallery?.isDirectory() && !gallery.isSymbolicLink()) {
    await fs.mkdir(target.gallery);
    for (const name of await fs.readdir(original.gallery)) {
      if (workspaceSettings.has(name)) await copy(path.join(original.gallery, name), path.join(target.gallery, name));
    }
    await detachOutline(target.outline, source);
  }
  return ignored + Number(gallery?.isSymbolicLink() ?? false);
}

async function detachOutline(file, source) {
  const original = await fs.readFile(file, "utf8").then(JSON.parse).catch(() => null);
  const tree = storedOf(original);
  if (!tree) return;
  const owner = workspaceId(source);
  const groups = tree.groups.filter(group => !group.workspace && (!group.owner || group.owner === owner))
    .map(({ owner: _owner, ...group }) => group);
  const tops = new Set(groups.map(group => topOf(group.id)));
  const local = name => typeof name === "string" && !name.startsWith("~") && entryPattern.test(name);
  const children = Object.fromEntries(Object.entries(tree.children).filter(([name]) => isTop(name) ? tops.has(name) : local(name))
    .map(([name, list]) => [name, list.filter(local)]));
  await fs.writeFile(file, JSON.stringify({ version: 2, groups, children, ...(original.head ? { head: original.head } : {}) }, null, 2) + "\n");
}
