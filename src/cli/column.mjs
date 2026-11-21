import { DOCS, topOf } from "../shared/outline-shape.mjs";
import { addColumn, newColumnId, removeColumn, renameColumn } from "../shared/outline-ops.mjs";
import { commandArguments, UsageError } from "./arguments.mjs";
import { columnName, columnNamed, editOutline, readTree } from "./tree.mjs";
import { hideWorkspaceColumn } from "./workspaces.mjs";

// gallery column new|rename|remove "<column>" (./usage.mjs): the sidebar's columns (栏), made, renamed and removed as the
// sidebar's column menu (新建栏, 重命名, 从侧边栏移除) does, by the same plain functions (shared/outline-ops.mjs, the ones
// workspace/meta.ts has) on the workspace's outline, written through the running server when there is one (./tree.mjs
// editOutline) or under the outline's lock here. A column is named by its name as the sidebar shows it (upper and lower
// case alike) or its id. new puts the column last; remove deletes one the user made and puts the entries in it, with those
// under them, last in the workspace's own column (no file deleted), and hides one that is a workspace's (what
// gallery workspaces --hide does); the own column (默认文档 in the default workspace) and an extension's are never removed.

const tidy = (value) => value.replace(/\s+/g, " ").trim();
const drawn = (tree) => tree.groups.filter((group) => !group.hidden && !group.away);
const columnsLine = (tree) => `Columns now (the sidebar's order): ${drawn(tree).map(columnName).join(", ")}.`;

async function made(positional) {
  if (positional.length !== 1) throw new UsageError('Name the column: gallery column new "<name>".');
  const title = tidy(positional[0]).slice(0, 100);
  if (!title) throw new UsageError("The name of a column is never empty.");
  const tree = await readTree();
  const there = columnNamed(tree, title);
  if (there) return void console.log(`The column "${columnName(there)}" is in the sidebar already (${there.id}): nothing made.`);
  let id = null;
  const result = await editOutline((outline) => {
    id = newColumnId(outline);
    return addColumn(outline, { id, title });
  });
  if (!result.ok) {
    console.error(`Not made: ${result.refused ?? result.message ?? result.reason}.`);
    process.exit(1);
  }
  console.log(`Made the column "${title}" (${id}), last in the sidebar.`);
  console.log(columnsLine(await readTree()));
  console.log(`下一步：gallery new <slug> "<title>" --column "${title}" makes a document in it; gallery move <slug> --column "${title}" moves one.`);
}

async function renamed(positional) {
  if (positional.length !== 2) throw new UsageError('Name the column and its new name: gallery column rename "<column>" "<new name>".');
  const title = tidy(positional[1]).slice(0, 100);
  if (!title) throw new UsageError("The name of a column is never empty.");
  const tree = await readTree();
  const group = columnNamed(tree, positional[0]);
  if (!group) {
    console.error(`No column "${positional[0]}" in the sidebar (${drawn(tree).map(columnName).join(", ")}): nothing renamed.`);
    process.exit(1);
  }
  if (group.extension) {
    console.error(`The column ${columnName(group)} is an extension's: its name is the extension's own (gallery extension list), no command renames it.`);
    process.exit(1);
  }
  const was = columnName(group);
  const result = await editOutline((outline) => renameColumn(outline, group.id, title));
  if (!result.ok) {
    console.error(`Not renamed: ${result.refused ?? result.message ?? result.reason}.`);
    process.exit(1);
  }
  if (!result.changed) return void console.log(`The column "${was}" is called "${title}" already: nothing to change.`);
  console.log(`Renamed the column "${was}" to "${title}" (${group.id}).`);
  console.log(columnsLine(await readTree()));
}

async function removed(positional) {
  if (positional.length !== 1) throw new UsageError('Name the column: gallery column remove "<column>".');
  const tree = await readTree();
  const group = columnNamed(tree, positional[0]);
  if (!group) {
    console.error(`No column "${positional[0]}" in the sidebar (${drawn(tree).map(columnName).join(", ")}): nothing removed.`);
    process.exit(1);
  }
  if (group.id === DOCS) {
    console.error(`The column ${columnName(group)} is the workspace's own: it is never removed.`);
    process.exit(1);
  }
  if (group.extension) {
    console.error(`The column ${columnName(group)} is an extension's: it goes with the extension's sidebar.json (gallery extension list), no command removes it.`);
    process.exit(1);
  }
  if (group.workspace) return hideWorkspaceColumn(group, tree);
  const held = (tree.children[topOf(group.id)] ?? []).length;
  const result = await editOutline((outline) => removeColumn(outline, group.id));
  if (!result.ok) {
    console.error(`Not removed: ${result.refused ?? result.message ?? result.reason}.`);
    process.exit(1);
  }
  const now = await readTree();
  console.log(`Removed the column "${columnName(group)}" (${group.id}); ${held ? `the ${held} entr${held === 1 ? "y" : "ies"} in it, with those under them, went last to the own column` : "it held nothing"}. No file was deleted.`);
  console.log(columnsLine(now));
}

export async function run(argv) {
  const [action, ...rest] = argv;
  const { positional } = commandArguments({ argv: rest });
  if (action === "new") return made(positional);
  if (action === "rename") return renamed(positional);
  if (action === "remove") return removed(positional);
  throw new UsageError(action ? `No such action: column ${action} (new, rename, remove).` : "Say what to do: gallery column new, rename or remove.");
}
