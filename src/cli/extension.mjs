import { checkProgram } from './extension-check.mjs';
import { createProgram } from './extension-template.mjs';
import { listCapabilities, readManifest, setExtensionEnabled, setExtensionSettings, settingsFile } from "../shared/extension-manifest.mjs";
import { SETTING_TYPES, settingsOf } from "../shared/extension-settings.mjs";
import { installExtension, removeExtension, throughService } from "../server/extension-install.mjs";
import { answerOf, readAnnouncement } from "../shared/preview-server.mjs";
import path from "node:path";
import fs from "node:fs/promises";
import { SIDEBAR_FILE, readSidebarText } from "../shared/extension-sidebar.mjs";
import { extensionSource, listExtensions, readExtension } from "../shared/extensions.mjs";
import { isExtensionId } from "../shared/outline-shape.mjs";
import { withOutlineLock } from "../shared/outline.mjs";
import { reportsDirectory } from "../shared/paths.mjs";
import { defaultWorkspace, ensureWorkspace, layoutOf } from "../shared/workspace.mjs";
import { commandArguments, UsageError } from "./arguments.mjs";

// Columns and program extensions share the default workspace and installation path.
// Program checks run an isolated copy; sidebar-only checks read and print their tree.

const count = (entries) => `${entries} ${entries === 1 ? "entry" : "entries"}`;

async function list(positional, json = false) {
  if (positional.length > 0) throw new UsageError("list takes nothing: gallery extension check <id> reads one.");
  let capabilities = await listCapabilities();
  const server = await readAnnouncement();
  if (server && await answerOf(server, 2000) === "yes") {
    const result = await fetch(`http://127.0.0.1:${server.port}/__gallery/extensions`, { signal: AbortSignal.timeout(2000) }).then(response => response.json()).catch(() => null);
    if (result?.ok) capabilities = result.extensions;
  }
  const folder = layoutOf(defaultWorkspace()).extensions;
  return listExtensions(reportsDirectory, { all: true }).then((sources) => {
    // The columns an extension's program writes (columns/) are said under it, never as extensions of their own.
    const found = sources.filter((source) => !source.owner);
    const columnsOf = (id) => sources.filter((source) => source.owner === id);
    // An object, with the extensions' folder even when there are none: an installer needs where to put one.
    if (json) {
      console.log(JSON.stringify({ folder, extensions: found.map(extension => {
        const item = capabilities.find(item => item.id === extension.id), manifest = item?.manifest;
        const columns = columnsOf(extension.id).map((column) => ({ id: column.column, title: column.title, count: column.count, file: column.file, ...(column.error ? { error: column.error.message } : {}), ...(column.hidden ? { hidden: true } : {}) }));
        return { id: extension.id, name: manifest?.name ?? extension.id, version: manifest?.version ?? null, description: manifest?.description ?? null, folder: item?.folder ?? path.dirname(extension.file), enabled: Boolean(item?.enabled), error: item?.error ?? null, column: extension.missing ? null : { title: extension.title, count: extension.count, file: extension.file }, columns, backend: item?.backend ?? null, workbenchError: item?.workbenchError ?? null, agent: item?.agent ?? null, ...(item?.settings ? { settings: item.settings } : {}) };
      }) }, null, 2)); return;
    }
    console.log(`Extensions: ${folder} (gallery extension new <id> "<name>" [--ui] [--server]).`);
    if (found.length === 0) {
      console.log(`No extensions visible from ${reportsDirectory}. See gallery help extension and references/extensions.md to create one.`);
      return;
    }
    console.log(`${found.length} extension${found.length === 1 ? "" : "s"} visible from ${reportsDirectory}:`);
    for (const extension of found) {
      const capability = capabilities.find(item => item.id === extension.id);
      const said = extension.missing ? (capability?.manifest ? "" : `no ${SIDEBAR_FILE}: it gives the sidebar no column`) : extension.error ? `条目读不出来：${extension.error.message}` : `${extension.title}, ${count(extension.count)}${extension.notes.length ? `, ${extension.notes.length} note${extension.notes.length === 1 ? "" : "s"}` : ""}`;
      console.log(`  ${extension.id}  ${said}`);
      console.log(`    ${extension.missing && capability?.manifest ? path.join(capability.folder, 'extension.json') : extension.file}`);
      if (capability?.manifest) console.log(`    ${capability.manifest.name ?? extension.id}${capability.manifest.version ? ` ${capability.manifest.version}` : ""}; Script: ${Boolean(capability.manifest.workbench?.script)}; backend: ${Boolean(capability.manifest.server)}; enabled: ${capability.enabled}`);
      if (capability?.agent) console.log(`    Agent instructions: ${capability.agent}`);
      if (capability?.settings) console.log(`    Settings: ${Object.entries(capability.settings).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(", ")} (gallery extension settings ${extension.id})`);
      for (const column of columnsOf(extension.id)) console.log(`    column ${column.column}: ${column.error ? `条目读不出来：${column.error.message}` : `${column.title}, ${count(column.count)}`}${column.hidden ? " (not in the sidebar while the extension is disabled)" : ""}  ${column.file}`);
    }
    console.log("gallery extension check <id> validates a column or tests a program in an isolated sandbox.");
  });
}

// An extension's entries as the sidebar shows them, one under another indented.
function tree(entries, depth, lines = []) {
  for (const entry of entries) {
    const address = entry.url ? entry.url : "(no address: a click opens and closes what is under it)";
    lines.push(`${"  ".repeat(depth)}${entry.id}  ${entry.icon ? `${entry.icon} ` : ""}${entry.title}  ${address}`);
    tree(entry.children ?? [], depth + 1, lines);
  }
  return lines;
}

async function check(positional, shot, press) {
  if (positional.length !== 1) throw new UsageError("Name one extension: gallery extension check <id>.");
  const [id] = positional;
  if (!isExtensionId(id)) throw new UsageError(`Not an extension's id: ${id} (its folder's name under extensions/: lowercase letters, digits and dashes, 48 at most).`);
  const source = await extensionSource(reportsDirectory, id);
  if (!source) {
    console.error(`No extension "${id}" visible from ${reportsDirectory}: gallery extension list shows them.`);
    process.exit(1);
  }
  const extension = await readExtension(source.root, id);
  const file = source.file;
  let manifest;
  const program = await fs.lstat(path.join(source.folder, 'extension.json')).catch(() => null);
  if (press && !program) throw new UsageError("--press presses a workbench button of an extension.json's workbench script; a sidebar column has none.");
  if (program) {
    try { manifest = await readManifest(source.folder); await checkProgram(source.folder, manifest, { shot, press }); }
    catch (error) { console.error('FAIL ' + path.join(source.folder, 'extension.json') + ': ' + error.message); process.exitCode = 1; return; }
    console.log('OK ' + id + ': extension.json (' + source.folder + ')');
    // Its settings as 设置 › 拓展列表 draws them: each key, type and default (their values: gallery extension settings).
    const declared = settingsOf(manifest);
    if (declared.length) console.log(`Settings (${declared.length}): ${declared.map((setting) => `${setting.key} (${setting.type}, default ${JSON.stringify(setting.default)}: ${setting.label})`).join("; ")}`);
    // The columns its program wrote (columns/), each read as the sidebar reads it, whether it is enabled or not.
    for (const column of (await listExtensions(reportsDirectory, { all: true })).filter((value) => value.owner === id)) {
      if (!showColumn(column, column.id, column.file)) process.exitCode = 1;
    }
    if (extension.missing) return;
  } else if (extension.missing) { console.error('FAIL ' + file + ': there is no sidebar.json or extension.json'); process.exitCode = 1; return; }
  if (!showColumn(extension, id, file)) process.exit(1);
}

// What the sidebar shows of a column (a sidebar.json, a file of columns/), printed; false when it does not read.
function showColumn(extension, id, file) {
  if (extension.error) {
    console.error(`FAIL ${file}: ${extension.error.message}`);
    console.error(`The sidebar shows the column "${extension.title}" with one row: 条目读不出来：${extension.error.message}`);
    return false;
  }
  console.log(`The sidebar shows the column ${extension.title}${extension.icon ? ` (${extension.icon})` : ""}, ${count(extension.count)}, in the order the file gives (an entry with an address opens it beside the sidebar, one without opens and closes what is under it)${extension.hidden ? ", while the extension is enabled" : ""}:`);
  console.log(extension.title);
  for (const line of tree(extension.entries, 1)) console.log(line);
  for (const note of extension.notes) console.log(`note: ${note.message}`);
  console.log(`OK ${id}: ${count(extension.count)} (${file})`);
  return true;
}

// gallery extension settings <id> [key=value…] [--json]: the extension's own settings (extension.json's
// `settings`), as 设置 › 拓展列表 shows them on its detail; with key=value pairs, those set as its controls set
// them: through the running service (POST /__gallery/extensions/settings, which tells the open workbenches),
// else the same function here. Refused, as the controls are greyed, while the extension is switched off.
async function settings(positional, json) {
  const [id, ...pairs] = positional;
  if (!isExtensionId(id ?? "")) throw new UsageError("Name one extension: gallery extension settings <id> [<key>=<value>...] [--json].");
  const item = (await listCapabilities({ ids: [id] }))[0];
  if (!item) {
    console.error(`No extension "${id}" in ${layoutOf(defaultWorkspace()).extensions}: gallery extension list shows them.`);
    process.exit(1);
  }
  if (!item.manifest) {
    console.error(`FAIL ${path.join(item.folder, "extension.json")}: ${item.error ?? "no extension.json"}`);
    process.exit(1);
  }
  const declared = settingsOf(item.manifest);
  let values = item.settings ?? {};
  if (pairs.length) {
    if (!declared.length) throw new UsageError(`${id} declares no settings (extension.json "settings").`);
    const changes = {};
    for (const pair of pairs) {
      const at = pair.indexOf("=");
      const key = at > 0 ? pair.slice(0, at) : "";
      const setting = declared.find((each) => each.key === key);
      if (!setting) throw new UsageError(`${at > 0 ? `No setting "${key}" in ${id}` : `Not <key>=<value>: ${pair}`}. Its settings: ${declared.map((each) => each.key).join(", ")}.`);
      const value = SETTING_TYPES[setting.type].parse(pair.slice(at + 1));
      if (value === undefined) throw new UsageError(`${key} is a ${setting.type}: true or false (on, off), not "${pair.slice(at + 1)}".`);
      changes[key] = value;
    }
    const body = { id, values: changes };
    const answer = await throughService("settings", body);
    values = answer ? answer.settings : (await setExtensionSettings(body)).values;
  }
  const file = settingsFile(id);
  if (json) {
    console.log(JSON.stringify({ id, enabled: Boolean(item.enabled), file, settings: declared.map((setting) => ({ ...setting, value: values[setting.key] })) }, null, 2));
    return;
  }
  if (!declared.length) {
    console.log(`${id} declares no settings (extension.json "settings"); its backend's file ${file} holds {}.`);
    return;
  }
  console.log(`${item.manifest.name ?? id}: ${declared.length} setting${declared.length === 1 ? "" : "s"}${item.enabled ? "" : " (the extension is disabled: gallery extension enable " + id + " before setting them)"}; its backend reads ${file} (GALLERY_EXTENSION_SETTINGS).`);
  for (const setting of declared) {
    console.log(`  ${setting.key}=${JSON.stringify(values[setting.key])}  ${setting.label} (${setting.type}, default ${JSON.stringify(setting.default)})${setting.help ? `: ${setting.help}` : ""}`);
  }
}

async function create(positional) {
  if (positional.length !== 2 || !isExtensionId(positional[0])) throw new UsageError('Use gallery extension new <id> "<title>".');
  const [id, title] = positional;
  const read = readSidebarText(JSON.stringify({ title, entries: [] }));
  if (read.error) throw new UsageError(read.error.message);
  const root = defaultWorkspace();
  if (!(await ensureWorkspace(root)).ours) throw new UsageError(`Not a Gallery workspace: ${root}`);
  const folder = path.join(layoutOf(root).extensions, id);
  const file = path.join(folder, SIDEBAR_FILE);
  await withOutlineLock(root, async () => {
    for (const directory of [layoutOf(root).extensions, folder]) {
      await fs.mkdir(directory, { recursive: true });
      const stat = await fs.lstat(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new UsageError(`Not an ordinary directory: ${directory}`);
    }
    try {
      await fs.writeFile(file, JSON.stringify({ title: read.sidebar.title, entries: [] }, null, 2) + "\n", { flag: "wx" });
    } catch (error) {
      if (error.code === "EEXIST") throw new UsageError(`Already exists: ${file}. Read and edit this file instead.`);
      throw error;
    }
  });
  console.log(`Created public extension ${id}\n${file}`);
}

export async function run(argv) {
  const [action, ...rest] = argv;
  if (action === "new") {
    const { positional, options } = commandArguments({ argv: rest, options: ["--ui", "--server"] });
    if (options.size) {
      if (positional.length !== 2 || !isExtensionId(positional[0]) || !positional[1].trim() || positional[1].length > 200) throw new UsageError('Use gallery extension new <id> "<name>" [--ui] [--server].');
      return createProgram(positional[0], positional[1], { ui: options.has("--ui"), server: options.has("--server") });
    }
    return create(positional);
  }
  if (action === "install" || action === "remove") {
    const { positional, options } = commandArguments({ argv: rest, options: action === "install" ? ["--enable"] : [] });
    if (positional.length !== 1) throw new UsageError(`gallery extension ${action} <${action === "install" ? "folder | zip" : "id"}>`);
    if (action === "remove") { await removeExtension(positional[0]); console.log(`Removed extension ${positional[0]}`); }
    else { const result = await installExtension(positional[0], { enable: options.has("--enable") }); console.log(`${({ installed: "已安装", updated: "已更新", unchanged: "未变更" })[result.did]} ${result.id}${result.version ? ` ${result.version}` : ""}（${result.enabled ? "已启用" : "未启用"}）\n${result.folder}`); if (result.agent) console.log(`Agent instructions: ${result.agent}`); }
    return;
  }
  if (action === "enable" || action === "disable") {
    const { positional } = commandArguments({ argv: rest });
    if (positional.length !== 1) throw new UsageError(`gallery extension ${action} <id>`);
    const body = { id: positional[0], enabled: action === "enable" };
    if (!await throughService("", body)) await setExtensionEnabled(body);
    console.log(`${body.enabled ? "已启用" : "已关闭"} ${body.id}`); return;
  }
  if (action === "list") {
    const { positional, options } = commandArguments({ argv: rest, options: ["--json"] });
    return list(positional, options.has("--json"));
  }
  if (action === "check") {
    const { positional, values } = commandArguments({ argv: rest, values: ["--shot", "--press"] });
    return check(positional, values.get("--shot"), values.get("--press"));
  }
  if (action === "settings") {
    const { positional, options } = commandArguments({ argv: rest, options: ["--json"] });
    return settings(positional, options.has("--json"));
  }
  throw new UsageError(action ? `No such action: extension ${action} (new, list, check, settings, install, remove, enable, disable).` : "Say what to do: gallery extension new <id> <title>, list or check <id>.");
}
