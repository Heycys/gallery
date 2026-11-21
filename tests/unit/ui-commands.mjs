import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { projectRoot } from "../../src/shared/paths.mjs";
import { MENU_FILES, UI_COMMANDS, menuLabels } from "../../src/cli/ui-commands.mjs";
import { COMMANDS, OVERVIEW, USAGE } from "../../src/cli/usage.mjs";

// 界面操作 → 命令 (src/cli/ui-commands.mjs): every item of the workbench's menus has a command, or a line
// saying why none is needed; every command named is one gallery has, and its usage holds the words the
// table says (an option, a subcommand); no line names an item no menu holds any more.

const inMenus = new Map(); // label -> the files holding it
for (const file of MENU_FILES) {
  const text = fs.readFileSync(path.join(projectRoot, file), "utf8");
  for (const label of menuLabels(text)) inMenus.set(label, [...(inMenus.get(label) ?? []), file]);
}
assert.ok(inMenus.size > 40, `the menus read: ${inMenus.size} items`);

const named = new Map(); // label -> its line
for (const line of UI_COMMANDS) {
  assert.ok(Array.isArray(line.labels) && line.labels.length, "a line names its menu items");
  assert.ok(Boolean(line.command) !== Boolean(line.none), `${line.labels.join("、")}: a command, or why none`);
  for (const label of line.labels) {
    assert.ok(!named.has(label), `${label}: named once`);
    named.set(label, line);
  }
  if (!line.command) continue;
  for (const { command, holds = [] } of [line, ...(line.also ?? [])]) {
    assert.ok(COMMANDS.includes(command), `${line.labels.join("、")}: gallery ${command} is one of gallery's commands`);
    assert.ok(OVERVIEW.includes(`gallery ${command}`), `gallery help names gallery ${command}`);
    for (const words of holds) assert.ok(USAGE[command].includes(words), `${line.labels.join("、")}: gallery help ${command} holds “${words}”`);
  }
}

const missing = [...inMenus.keys()].filter((label) => !named.has(label));
assert.deepEqual(missing, [], `menu items with no command and no reason in src/cli/ui-commands.mjs: ${missing.map((label) => `${label} (${inMenus.get(label).join(", ")})`).join("; ")}`);
const gone = [...named.keys()].filter((label) => !inMenus.has(label));
assert.deepEqual(gone, [], `items src/cli/ui-commands.mjs names that no menu holds: ${gone.join("、")}`);

console.log(`Checked 界面操作 → 命令: the ${inMenus.size} items of the workbench's menus each with its gallery command (${UI_COMMANDS.filter((line) => line.command).reduce((sum, line) => sum + line.labels.length, 0)}, its usage holding the options named) or why none is needed (${UI_COMMANDS.filter((line) => line.none).reduce((sum, line) => sum + line.labels.length, 0)}).`);
