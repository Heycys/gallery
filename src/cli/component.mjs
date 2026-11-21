import fs from "node:fs";
import path from "node:path";
import { packageText } from "../render/package-files.mjs";
import { LISTED_BLOCKS, blocksHidden } from "../editor/components/registry.mjs";
import { installPack, removePack, workspacePacks } from "../shared/block-packs.mjs";
import { packageStates, problemIn, readCatalog, templateOf, templateProblem } from "../shared/component-catalog.mjs";
import { inLanguage, told } from "../shared/i18n/index.mjs";
import { PACK_ID } from "../shared/pack-manifest.mjs";
import { packFilesAt } from "../transfer/pack-source.mjs";
import { readKeys, writeKey } from "../shared/net-keys.mjs";
import { HOST, netHostsOf } from "../shared/net-policy.mjs";
import { PACKAGE_ID, SLOT } from "../shared/components/installed.mjs";
import { SHIPPED_SCOPE, addShipped, isShippedId, recipeFiles, recordOf, shippedBlock, shippedBlocks, shippedState, versionAfter, writingOrder } from "../shared/shipped-blocks.mjs";
import { DEVICE_NAMES, layoutOf, PACKAGE_MANIFEST, shallowPackages } from "../shared/workspace.mjs";
import { commandArguments, isOption, UsageError } from "./arguments.mjs";
import { shown } from "./report-start.mjs";
import { packageFiles } from "./component-scaffold.mjs";
import { PACK_SYNOPSIS, TRY_SYNOPSIS, synopsisOf } from "./usage.mjs";

// gallery block new <id> ([--script] [--flow] [--data] [--page] | --recipe <name>) | add <name> | list [--json] | show <id> |
// check <id> [--documents] | try <doc> … | key [<host> [<key>]] [--remove] | pack install <folder|zip> | pack list [--json] |
// pack remove <pack> | pack on|off <pack> | menu on|off <block> | net on|off <block> (the last three: the switches of
// 设置 › 组件列表, ./component-switches.mjs) (./usage.mjs; gallery component … is another name for it,
// which says the same): the workspace's custom blocks (自定义块, component packages in the code and the
// files: src/shared/component-catalog.mjs), for an Agent: new starts one (--data one that keeps what a
// reader enters, --page one for a custom page's card, --recipe from one of Gallery's own), add puts one of Gallery's own in (src/shared/shipped-blocks.mjs), list says what
// there is now and show how to write it, the live answers, nothing of them written into the skill;
// check says what is wrong with one (./component-check.mjs), with --documents each instance of it the
// workspace's documents hold too; try makes a reader's gestures on an instance of a document, on a
// scratch copy of it, and says what they wrote (./component-try.mjs); key keeps the workspace's key for a
// site its blocks reach (src/shared/net-keys.mjs), which the server writes into an address that names
// {key} as it fetches, and says which hosts have one, never a key; pack installs a block pack (a folder or a
// zip of one: src/shared/block-packs.mjs), lists the workspace's packs, and removes one it installed. What makes a block is its folder
// and manifest, components/<scope>/<name>/component.json: a manifest right under components/, which no
// catalog reads, is said wherever it would have been found. An id with no scope is local's; the scope
// gallery and gallery-soft are Gallery's own packs', which new refuses, as it does a scope a pack install put
// there. Exits 0 done; 1 when a block is taken, is not
// there or does not load, add would replace a copy changed since it was added, a pack is refused, check fails, or a trial
// found a problem (gestures that wrote nothing, an undo that did not take it back, a fresh page that
// does not read it back); 2 for a mistake in the command line, said with the usage's lines of the
// subcommand try for one of try's; 3 when check could not run it in a browser, or try could not see
// its trial through.

const SCOPE = "local";

/** The package `written` names: <scope>/<name>, or a <name> of the local scope. One no package can be is a mistake in the command line. */
export function packageNamed(written) {
  const id = written.includes("/") ? written : `${SCOPE}/${written}`;
  if (!PACKAGE_ID.test(id)) throw new UsageError(`Not a block's id: ${written} (<scope>/<name>, each in lowercase letters, digits and hyphens; a <name> alone is ${SCOPE}/<name>).`);
  const device = id.split("/").find((name) => DEVICE_NAMES.has(name));
  if (device) throw new UsageError(`Not a block's id: ${written} (Windows keeps ${device} for a device).`);
  return id;
}

/**
 * The block `written` names for show and check: its id (packageNamed), except that a <name> alone which
 * no block of local's is and one of Gallery's own is, is Gallery's gallery/<name>, as add and page add
 * take a bare name for Gallery's (a block of the workspace's own by that name is still local/<name>).
 */
export function blockNamed(root, written) {
  const id = packageNamed(written);
  const own = written.includes("/") ? null : shippedBlock(written);
  if (!own) return id;
  const catalog = readCatalog(root);
  return catalog.packages.has(id) || catalog.problems.has(id) || fs.existsSync(packageFolder(root, id)) ? id : own.id;
}

/** Where the package `id` is. */
export const packageFolder = (root, id) => path.join(layoutOf(root).components, ...id.split("/"));

/** What gallery block add takes of one of Gallery's own: its name alone for the pack gallery's, else its id. */
export const addName = (block) => (block.pack === SHIPPED_SCOPE ? block.name : block.id);
const addNames = () => shippedBlocks().map(addName).join(", ");

/** What is said of a manifest one level too shallow (shallowPackages): where it is, and where it goes. */
export const shallowSaid = ({ name, file }) => `${shown(file)} is one level too shallow, and no catalog reads it: a custom block is components/<scope>/<name>/, so move it to components/${SCOPE}/${name}/`;

/** What is said of a package that is not there: that, or the manifest of its name one level too shallow. */
export function missingSaid(root, id) {
  const shallow = shallowPackages(root).find(({ name }) => name === id.split("/")[1]);
  const own = isShippedId(id) && shippedBlock(id);
  if (own) return `No block ${id} in ${shown(layoutOf(root).components)}: it is one of Gallery's own, which gallery block add ${addName(own)} puts in.`;
  const gallerys = id.startsWith(`${SCOPE}/`) ? shippedBlock(id.slice(SCOPE.length + 1)) : null; // a name Gallery has one of, written with the scope local
  return shallow ? shallowSaid(shallow) : `No block ${id} in ${shown(layoutOf(root).components)}: gallery block list says which there are${gallerys ? `; Gallery has a block of that name, ${gallerys.id}` : ""}.`;
}

// `new`: the block's files, its manifest last whatever order they come in (writingOrder), what makes
// a folder a block to whoever watches (a running server's watcher): a block that appears is whole.
// With a recipe, the files of one of Gallery's own, naming the new id (recipeFiles).
function makePackage(root, id, { script, flow, data, page, recipe }) {
  const scope = id.split("/")[0];
  const kept = shippedBlock(id);
  if (isShippedId(id)) throw new UsageError(`The scope ${scope}/ is kept for Gallery's own blocks: give yours another (${SCOPE}/<name>, or a <name> alone)${kept ? `; gallery block add ${addName(kept)} puts Gallery's in, and gallery block new <id> --recipe ${addName(kept)} starts one of yours from it` : ""}.`);
  if (recordOf(root).packs?.[scope]) throw new UsageError(`The scope ${scope}/ is the pack ${scope}'s, which gallery block pack install put in (installing it again would not keep a block of yours there): give yours another (${SCOPE}/<name>, or a <name> alone).`);
  const from = recipe === undefined ? null : shippedBlock(recipe);
  if (recipe !== undefined && !from) throw new UsageError(`No block of Gallery's own is called ${recipe}: ${addNames() || "none"}.`);
  const folder = packageFolder(root, id);
  if (fs.existsSync(folder) || readCatalog(root).problems.has(id)) {
    const begun = !fs.existsSync(path.join(folder, PACKAGE_MANIFEST));
    console.error(begun ? `A folder is there with no component.json: ${shown(folder)}: move it, or give this block another name.` : `Block already exists: ${shown(folder)}: gallery block show ${id} says what it is; give a new one another name.`);
    process.exit(1);
  }
  const files = from ? recipeFiles(from, id) : packageFiles(id, { script, flow, data, page });
  try {
    fs.mkdirSync(folder, { recursive: true });
    for (const name of writingOrder(Object.keys(files))) {
      fs.mkdirSync(path.dirname(path.join(folder, name)), { recursive: true });
      fs.writeFileSync(path.join(folder, name), files[name]);
    }
  } catch (error) {
    if (!error.code) throw error;
    console.error(`Cannot write ${shown(folder)} (${error.code}).`);
    process.exit(1);
  }
  console.log(`Created ${shown(folder)}: ${Object.keys(files).join(", ")}`);
  if (from) {
    console.log(`Made from Gallery's ${from.id} ${from.version}, every word that named it naming ${id}: change its name, words and description in component.json first (two blocks of one name read alike in "/"), and in the same files what is still ${from.name}'s: writing.md (how to write it, still about ${from.name}) and example.html (the instance check runs and show prints, still ${from.name}'s words), then what you came for (references/building-blocks.md has every field and the rules), and run gallery block check ${id}, which passes as it stands now.`);
    return;
  }
  const scripted = script || data;
  console.log(`下一步：say in component.json what it is (its name, description and parts), write template.html, what ${page ? "a custom page's 添加自定义块 puts on it" : "\"/\" puts in a document"}, and example.html, an instance as a writer would fill it, then writing.md and style.css${scripted ? " and kit.js" : ""} (references/building-blocks.md has every field and the rules${flow ? ", and Slots what its slot body holds" : ""}${page ? "; references/pages-and-data.md a card's size and settings and what it reads" : ""}${scripted ? "; references/block-script.md its script and how it writes back" : ""}), and run gallery block check ${id}, which passes as it stands now.`);
  if (data) console.log(`It keeps a list of lines (the part items, a script of JSON on one line, as context.editJSON writes it): kit.js reads it with context.readJSON and writes it with context.editJSON, from a field (DocKit.input) and a button, hidden where nothing is written; example() adds a line by the function the field calls, and works on template.html's empty instance. Rename the part, the fields of its JSON and the controls for what the block keeps.`);
  if (page) console.log(`It is a custom page's card (places ["page"], a card of two sizes): gallery page add <slug> ${id} puts one on a page, then gallery page try <slug> <card id> <gesture> tries a reader's gesture on it${data ? " (--type .component-field \"words\" --then Enter)" : ""}; for a document too, put \"document\" in places.`);
  else if (data) console.log(`In a document: write the element as example.html does, then gallery block try <slug> --type .component-field "words" --then Enter tries the field (the part and the class are the scaffold's: rename them with the block).`);
}

// `add`: one of Gallery's own blocks, copied in unchanged (src/shared/shipped-blocks.mjs).
function addBlock(root, written) {
  const block = shippedBlock(written);
  if (!block) throw new UsageError(`No block of Gallery's own is called ${written}: ${addNames() || "none"} (gallery block list says each).`);
  let added;
  try {
    added = addShipped(root, block);
  } catch (error) {
    if (error.code !== "changed") throw error;
    console.error(`${shown(error.folder)} was changed after gallery block add put it there (or another hand put it there), so it is not replaced: to keep those changes, make a block of your own from Gallery's with gallery block new <id> --recipe ${addName(block)} and move them into it; to take Gallery's ${block.version}, delete the folder and run gallery block add ${addName(block)} again.`);
    process.exit(1);
  }
  const placesSaid = block.places.includes("document") ? `a document can write it now (gallery block show ${block.id} says how)` : "custom pages can place it now";
  if (added.did === "same") console.log(`${block.id} ${block.version} is in already, as Gallery ships it: ${shown(added.folder)}`);
  else if (added.did === "updated") console.log(`Updated ${block.id} from ${added.from ?? "an older version"} to ${block.version}: ${shown(added.folder)}`);
  else console.log(`Added ${block.id} ${block.version}: ${shown(added.folder)}`);
  if (added.did !== "same") console.log(`It is Gallery's, as it ships: no check or try is needed, and ${placesSaid}. Change nothing in its folder, or gallery block add will not update it again: for a block like it of your own, gallery block new <id> --recipe ${addName(block)}.`);
}

// A package's words in both its languages, one line.
export const bothSaid = ({ zh, en }) => (zh === en ? zh : `${zh} / ${en}`);

// Why no menu can put a package in a document, or null: a document can still write it.
function notInMenus(found) {
  if (templateOf(found)) return null;
  const problem = templateProblem(found);
  return problem ? problemIn("en", problem) : "it has no template.html";
}

// What is said of a block that does not run now, by its `state` (packageStates): one the user disabled.
const OFF = {
  disabled: "disabled by the user: its instances show as they stand, no script and no style",
};

// What a block's manifest says it uses (`needs`), one line, or "".
const needsSaid = (needs) => (needs?.length ? `  要用：${needs.join(", ")}` : "");

// A block that runs, as list says it: its name, version, description, why a menu cannot put it in, and
// whether the user's switch 在文档菜单里显示 keeps it out of the document's menus (it is still to write).
function blockLines(catalog, { id, name, version, description, state, needs, pack }, place) {
  console.log(`${id}  ${bothSaid(name)}`);
  // The pack it counts in (packageStates' `pack`: packOf, Gallery's own blocks for documents the default pack, local).
  const packOff = (catalog.settings.packsOff ?? []).includes(pack);
  const menus = packOff ? `available; its pack ${pack} is switched off in 设置 › 组件列表, so no menu or library offers it, and a document can still write it`
    : place === "document" && state === "hidden" ? "available; not in the document's menus, by the user's switch, and a document can still write it" : "available";
  console.log(`  版本：${version}（${menus}）`);
  console.log(`  说明：${bothSaid(description)}`);
  if (needsSaid(needs)) console.log(needsSaid(needs));
  const why = place === "document" && notInMenus(catalog.packages.get(id));
  if (why) console.log(`  模板：the menus cannot insert it, and a document can still write it: ${why}`);
}

// Gallery's own blocks a workspace has not added, or has as an older version, or as a copy changed since that Gallery has a
// newer version of: [{ block, state }] (shippedState).
// Not those whose manifest says listed: false: Gallery keeps them out of its menus, and an Agent writes none into a document.
const shippedToAdd = (root) => shippedBlocks().filter((block) => block.listed).map((block) => ({ block, state: shippedState(root, block) })).filter(({ block, state }) => !state.added || state.behind || (state.changed && versionAfter(block.version, state.version)));

// `list --json`: what list says, as one JSON object (the fields of ./usage-sections.mjs, only ever added to).
function listJson(root) {
  const catalog = readCatalog(root);
  const blocks = packageStates(catalog).map((state) => {
    const hosts = netHostsOf(state.needs);
    return {
      id: state.id, pack: state.pack, name: state.name, description: state.description, version: state.version, state: state.state, reason: state.reason,
      places: state.places, needs: state.needs, template: state.template, menu: state.menu, unlisted: state.unlisted, listedByDefault: state.listedByDefault, disabled: state.disabled,
      net: { hosts, allowed: state.allowed, on: hosts.length > 0 && hosts.every((host) => state.allowed.includes(host)) },
    };
  });
  const available = shippedToAdd(root).map(({ block, state }) => ({ id: block.id, add: addName(block), title: block.title, version: block.version, places: block.places, added: state.added, workspaceVersion: state.version ?? null, changed: state.changed }));
  const builtin = LISTED_BLOCKS.map(({ id, name, hideable }) => ({ id, name: { zh: inLanguage("zh", name), en: inLanguage("en", name) }, hidden: hideable && catalog.settings.hidden.includes(id), hideable }));
  console.log(JSON.stringify({ workspace: path.resolve(root), blocks, available, builtin }, null, 2));
}

// `list`: the blocks to use, in two groups by their places (文档里可用, 自定义页可用: one of both is in
// each, said whole once); then those that do not run now, each with why; then Gallery's own blocks the
// workspace has not added yet (or has as an older version, or as a copy changed since it was added that
// Gallery has a newer version of, which nothing puts over it: how to take Gallery's), each with the line
// that adds it; and last
// the built-in blocks the user took out of the document's menus, what an id with no scope names in
// gallery.json, which this is the Agent's list of too. What the user's switch keeps out of a menu is
// still to write with: a document writes what it needs, and the switch is about the menus alone.
function listPackages(root, { json = false } = {}) {
  if (json) return listJson(root);
  const catalog = readCatalog(root);
  const states = packageStates(catalog);
  // Why a block does not load of itself is its `reason`: one the settings turned off has none.
  const failed = states.filter(({ reason }) => reason);
  const all = states.filter(({ reason }) => !reason);
  // Of those, one whose manifest says listed: false and the user has not turned on goes in a line of its own, after them.
  const offByDefault = all.filter(({ state, unlisted, listedByDefault }) => state !== "disabled" && unlisted && !listedByDefault);
  const running = all.filter((entry) => entry.state !== "disabled" && !offByDefault.includes(entry));
  const inDocuments = running.filter(({ places }) => places.includes("document"));
  const onPages = running.filter(({ places }) => places.includes("page"));
  const shallow = shallowPackages(root);
  const shipped = shippedToAdd(root);
  const blocks = blocksHidden(catalog.settings.hidden);
  console.log(`工作区：${shown(root)}`);
  if (all.length + failed.length + shallow.length === 0) console.log(`No custom blocks yet. A document is written with Gallery's blocks and whole blocks; gallery block add <name> puts one of Gallery's own in (below), and gallery block new <id> starts one when the user wants a block to use again.`);
  else {
    console.log(inDocuments.length ? `文档里可用 (in documents: ${inDocuments.length}; gallery block show <id> says how to write each):` : "文档里可用 (in documents): none now.");
    for (const entry of inDocuments) blockLines(catalog, entry, "document");
    console.log(onPages.length ? `自定义页可用 (on custom pages: ${onPages.length}):` : "自定义页可用 (on custom pages): none now.");
    for (const entry of onPages) {
      if (entry.places.includes("document")) console.log(`${entry.id}  ${bothSaid(entry.name)}  (above: in documents too)`);
      else blockLines(catalog, entry, "page");
    }
    if (offByDefault.length) console.log(`Off by default (Gallery keeps them out of the menus until the user turns one on in 设置 › 组件列表; a document that has one shows and edits it as ever; write none into a document): ${offByDefault.map(({ id, name }) => `${id} (${bothSaid(name)})`).join(", ")}`);
    const rest = all.filter(({ state }) => state === "disabled");
    if (rest.length + failed.length + shallow.length > 0) console.log("Not to use now:");
    for (const { id, name, version, state } of rest) console.log(`${id}  ${bothSaid(name)}  ${version}  ${OFF[state]}`);
    for (const { id, reason, version } of failed) console.log(`${id}${version ? `  ${version}` : ""}  does not load: ${reason.en}`);
    for (const found of shallow) console.log(shallowSaid(found));
  }
  if (shipped.length) console.log("Gallery's own blocks, to add as they are (no check or try needed):");
  for (const { block, state } of shipped) {
    const where = block.places.map((place) => (place === "document" ? "documents" : "custom pages")).join(" and ");
    console.log(`${block.id}  ${bothSaid(block.title)}  ${block.version}  (${where})`);
    console.log(`  说明：${bothSaid(block.description)}`);
    if (state.changed) console.log(`  the workspace's copy (${state.version ?? "no version"}) was changed after it was added, so it is not updated: to take Gallery's ${block.version}, delete ${shown(packageFolder(root, block.id))} and run gallery block add ${addName(block)} (to keep the changes, gallery block new <id> --recipe ${addName(block)} and move them into it)`);
    else console.log(state.added ? `  gallery block add ${addName(block)}   (the workspace has ${state.version ?? "an older one"}: this updates it)` : `  gallery block add ${addName(block)}`);
  }
  if (blocks.length) console.log(`Built-in blocks the user took out of the document's menus (a document can still write them): ${blocks.join(", ")}`);
}

// A part as `show` says it: its name, where it is and how it is edited; a slot (a part edited as flow) by its mark.
const partSaid = (name, { at, edit, optional, min, max }) => {
  const bounds = [optional ? "optional" : "", min !== undefined ? `at least ${min}` : "", max !== undefined ? `at most ${max}` : ""].filter(Boolean);
  const where = edit === "flow" ? `${SLOT}="${name}"` : at;
  const how = edit === "flow" ? "flow (blocks of the document: write any block in it)" : edit;
  return `  ${name}  ${where}  ${how}${bounds.length ? `  (${bounds.join(", ")})` : ""}`;
};

// What `show` prints of a block: its name, version (with `status`), description, places, needs, folder,
// parts, how to write it (writing.md) and its example (example.html), from the files of `found`'s folder.
function printBlock(found, id, status) {
  console.log(`${id}  ${bothSaid(found.name)}`);
  console.log(`  版本：${found.version}（${status}）`);
  console.log(`  说明：${bothSaid(found.description)}`);
  console.log(`  用在：${found.places.map((place) => (place === "document" ? "documents" : "custom pages")).join(", ")}`);
  if (needsSaid(found.needs)) console.log(needsSaid(found.needs));
  console.log(`  ${shown(found.folder)}`);
  const parts = Object.entries(found.parts);
  console.log(parts.length ? "Parts (edit text: the user types there; flow: blocks of the document; none, or data: the component's):" : "No parts.");
  for (const [name, part] of parts) console.log(partSaid(name, part));
  const writing = packageText(found, "writing.md")?.trimEnd();
  console.log(writing ? `How to write it (writing.md):\n${writing}` : "How to write it: the block has no writing.md.");
  const example = packageText(found, "example.html")?.trimEnd();
  console.log(example ? `The example (example.html):\n${example}` : "The example: the block has no example.html.");
}

// `show`: what an Agent needs to write an instance, from the package's own files; of one of Gallery's own
// that the workspace has not added yet, from the files Gallery ships, ending with the line that adds it.
function showPackage(root, id) {
  const catalog = readCatalog(root);
  const unloaded = catalog.problems.get(id);
  const found = catalog.packages.get(id) ?? (unloaded?.off ? unloaded : undefined);
  if (!found) {
    const problem = unloaded?.problem;
    const own = !problem && isShippedId(id) ? shippedBlock(id) : null;
    if (own) return showShipped(own);
    console.error(problem ? `${id} does not load: ${problemIn("en", problem)}` : missingSaid(root, id));
    process.exit(1);
  }
  const { state, unlisted, listedByDefault } = packageStates(catalog).find((entry) => entry.id === id);
  const status = state === "hidden" && unlisted && !listedByDefault ? "available; off by default: Gallery keeps it out of the menus until the user turns it on in 设置 › 组件列表"
    : { normal: "available", hidden: "available; not in the document's menus, by the user's switch", disabled: "disabled by the user" }[state] ?? state;
  printBlock(found, id, status);
  console.log(`In a document: write the element as the example does, straight in the page or a section, with no data-block-id, which the export gives it.`);
}

// gallery block key: a host's key kept (or taken away with --remove), or what there is: with a host, whether
// it has one; with none, the hosts that have one and the hosts the workspace's blocks name with no key. A
// key is never printed. A host is one a block's needs can name (src/shared/net-policy.mjs HOST).
async function keepKey(root, host, key, { remove }) {
  const keys = readKeys(root);
  if (host === undefined) {
    const named = [...new Set(packageStates(readCatalog(root)).flatMap(({ needs }) => netHostsOf(needs ?? [])))];
    const kept = Object.keys(keys).sort();
    console.log(kept.length ? `Keys kept (.gallery/keys.json), by host: ${kept.join(", ")}.` : "No key kept (.gallery/keys.json holds none).");
    const others = named.filter((name) => !kept.includes(name)).sort();
    if (others.length) console.log(`Hosts the workspace's blocks reach with no key: ${others.join(", ")} (a key is needed only where a block's address names {key}).`);
    return;
  }
  if (!HOST.test(host)) throw new UsageError(`Not a host a block's needs can name: ${host} (a lowercase name, no scheme, port or path; *. before it for the names under it).`);
  if (remove) {
    if (key !== undefined) throw new UsageError("gallery block key <host> --remove takes no key.");
    if (!(host in keys)) return console.log(`No key kept for ${host}: nothing to take away.`);
    await writeKey(root, host, null);
    return console.log(`Took away the key for ${host}. A block's address that names {key} on it is refused (code "key") until one is kept again.`);
  }
  if (key === undefined) return console.log(host in keys ? `A key is kept for ${host} (never printed): an address on it that names {key} is fetched with it.` : `No key kept for ${host}: gallery block key ${host} <key> keeps one.`);
  if (!key.trim() || /[\r\n]/.test(key)) throw new UsageError("A key is one line of characters, not empty.");
  await writeKey(root, host, key);
  console.log(`Kept the key for ${host} in ${shown(layoutOf(root).keys)}, which no page, export or cache holds: Gallery writes it where a block's address on ${host} names {key}, as it fetches for the block. Never write the key into a block's files or a page: they are shown and exported.`);
}

// `show` of one of Gallery's own the workspace does not have: what it ships (its manifest, writing.md and
// example.html), then the line that puts it in, and where it stands once it is there.
function showShipped(block) {
  const manifest = JSON.parse(fs.readFileSync(path.join(block.folder, PACKAGE_MANIFEST), "utf8"));
  printBlock({ name: block.title, description: block.description, version: block.version, places: block.places, needs: manifest.needs, folder: block.folder, parts: manifest.parts ?? {} }, block.id, "Gallery's own, not in this workspace yet");
  const where = block.places.includes("document")
    ? ", and a document writes it as the example above does, straight in the page or a section, with no data-block-id, which the export gives it"
    : `, and gallery page add <slug> ${addName(block)} puts a card of it on a custom page`;
  console.log(`Not in this workspace yet: gallery block add ${addName(block)} puts it in as it ships (no check, no try)${where}.`);
}

// A refusal of the packs' (shared/block-packs.mjs), in English, as the command says everything.
const refusedSaid = (error) => inLanguage("en", () => told(error)) ?? error.message;

// The lines of what an install did of the blocks it names (`ids`), or none.
const listedLine = (label, ids) => (ids.length ? [`  ${label}: ${ids.join(", ")}`] : []);

// gallery block pack install <folder|zip>: the pack read (src/transfer/pack-source.mjs) and installed
// (installPack), what it did said, a refusal said with why (exit 1).
function installPackAt(root, written) {
  let made;
  try {
    made = installPack(root, packFilesAt(written));
  } catch (error) {
    if (!error.code) throw error;
    console.error(`Not installed: ${refusedSaid(error)}`);
    process.exit(1);
  }
  const blocks = made.added.length + made.updated.length + made.same.length + made.kept.length;
  if (made.from === null) console.log(`Installed the pack ${made.id} ${made.version} (${bothSaid(made.name)}), ${blocks} block${blocks === 1 ? "" : "s"}: ${shown(made.folder)}`);
  else if (made.did === "updated") console.log(`Updated the pack ${made.id} from ${made.from ?? "an older version"} to ${made.version}: ${shown(made.folder)}`);
  else console.log(`The pack ${made.id} ${made.version} is in already, as installed: ${shown(made.folder)}`);
  for (const line of [...listedLine("added", made.added), ...(made.did === "updated" ? listedLine("updated", made.updated) : []), ...listedLine("taken out (not in this version)", made.removed)]) console.log(line);
  if (made.kept.length) console.log(`  kept as they are, changed since they were installed: ${made.kept.join(", ")} (to take this version's, delete the block's folder and install the pack again)`);
  if (made.ownKept) console.log(`  its pack.json was changed since it was installed, and is kept as it is`);
  console.log(`Its blocks are offered in "/" and 添加自定义块 while its switch in 设置 › 组件列表 is on (gallery block pack list says each pack's); gallery block list says each block.`);
}

// gallery block pack list: the workspace's packs (workspacePacks), a line each and its description: the default pack
// (local/) first, always there; where it is the only one, that no other pack is installed.
function listPacks(root, { json = false } = {}) {
  const packs = workspacePacks(root);
  if (json) {
    // One JSON object (the fields of ./usage-sections.mjs, only ever added to).
    return void console.log(JSON.stringify({ workspace: path.resolve(root), packs }, null, 2));
  }
  console.log(`工作区：${shown(root)}`);
  const KINDS = { default: "the default pack: Gallery's own blocks for documents, and where a block made with no pack named goes", official: "Gallery's own", installed: "a pack installed", own: "the workspace's own blocks, no pack.json" };
  for (const pack of packs) {
    const facts = [pack.version ? `${pack.id} ${pack.version}` : pack.id, KINDS[pack.kind], pack.enabled ? "on" : "off", `${pack.blocks} block${pack.blocks === 1 ? "" : "s"}`, ...(pack.author ? [`by ${pack.author}`] : [])];
    console.log(`${bothSaid(pack.name)}  (${facts.join(", ")})`);
    if (pack.description) console.log(`  说明：${bothSaid(pack.description)}`);
    if (pack.problem) console.log(`  its pack.json does not read: ${pack.problem.en}`);
    if (pack.changed.length) console.log(`  changed since it was installed: ${pack.changed.join(", ")}${pack.newer ? ` (Gallery's is ${pack.newer}, not put over them)` : ""}`);
  }
  if (packs.every(({ kind }) => kind === "default")) console.log("No other block packs: gallery block pack install <folder|zip> installs one.");
}

// gallery block pack remove <pack>: one installed taken out (removePack).
function removePackNamed(root, id) {
  if (!PACK_ID.test(id)) throw new UsageError(`Not a pack's id: ${id} (lowercase letters, digits and hyphens: gallery block pack list says each).`);
  let gone;
  try {
    gone = removePack(root, id);
  } catch (error) {
    if (!error.code) throw error;
    console.error(`Not removed: ${refusedSaid(error)}`);
    process.exit(1);
  }
  console.log(`Removed the pack ${gone.id}${gone.version ? ` ${gone.version}` : ""} (${gone.blocks.length} block${gone.blocks.length === 1 ? "" : "s"}): what documents and pages hold of its blocks stays, shown as blocks that are not there.`);
}

// pack on and pack off turn a pack's switch (./component-switches.mjs).
const packSwitch = (on) => async (root, id) => (await import("./component-switches.mjs")).packSwitch(root, on, id);
const PACK_COMMANDS = { install: installPackAt, list: listPacks, remove: removePackNamed, on: packSwitch(true), off: packSwitch(false) };

// gallery block pack <install|list|remove|on|off> …
function packCommand(root, sub, more, { json = false } = {}) {
  if (!sub) throw new UsageError("Say what to do with packs: install <folder|zip>, list, remove <pack>, on <pack>, off <pack>.");
  if (!Object.hasOwn(PACK_COMMANDS, sub)) throw new UsageError(`No such pack command: ${sub} (install, list, remove, on, off).`);
  if (json && PACK_COMMANDS[sub] !== listPacks) throw new UsageError(`--json goes with pack list, not pack ${sub}.`);
  if (PACK_COMMANDS[sub] === listPacks) {
    if (more.length) throw new UsageError("gallery block pack list takes nothing else.");
    return listPacks(root, { json });
  }
  if (sub === "on" || sub === "off") {
    if (more.length > 1) throw new UsageError(`gallery block pack ${sub} takes one pack's id: gallery block pack ${sub} <pack>.`);
    return PACK_COMMANDS[sub](root, more[0]);
  }
  if (more.length !== 1) throw new UsageError(sub === "install" ? "gallery block pack install takes one folder or zip: gallery block pack install <folder|zip>." : "gallery block pack remove takes one pack's id: gallery block pack remove <pack>.");
  return PACK_COMMANDS[sub](root, more[0]);
}

// What each subcommand does, of the workspace at `root`.
const SUBCOMMANDS = {
  new: (root, id, options) => makePackage(root, id, options),
  add: addBlock,
  list: listPackages,
  show: showPackage,
  check: async (root, id, { documents, elsewhere }) => (await import("./component-check.mjs")).checkCommand(root, id, { documents, elsewhere }),
  try: async (root, request) => (await import("./component-try.mjs")).tryCommand(root, request),
  key: keepKey,
  pack: packCommand,
  menu: async (root, on, written) => (await import("./component-switches.mjs")).menuSwitch(root, on, written),
  net: async (root, on, written) => (await import("./component-switches.mjs")).netSwitch(root, on, written),
};

// What try alone takes: its gestures, each with a selector in the instance (--key, --type and --select
// something after it), --then, --steps, and --keep.
export const GESTURES = ["--press", "--drag", "--to", "--key", "--type", "--select", "--then", "--steps"];

// The options of try that take two arguments, a selector and what goes with it, as each says it.
const PAIRS = {
  "--key": "--key takes a selector and a key: --key <selector> <key> (Enter, Space, ArrowRight, a letter, Shift+Tab).",
  "--type": "--type takes a selector and the words to type: --type <selector> <words> (quoted when they hold a blank).",
  "--select": "--select takes a selector and an option: --select <selector> <value> (the option's value or its words).",
};

/**
 * The second argument of each option of PAIRS (--key's key, --type's words, --select's option), taken
 * out of `argv`, so that the selector is the option's value as any option's: { argv, seconds }, `seconds`
 * by the option's name, those given alone.
 */
export function pairsOf(argv) {
  const end = argv.indexOf("--");
  const taken = new Set();
  const seconds = {};
  for (const [name, said] of Object.entries(PAIRS)) {
    const at = (end === -1 ? argv : argv.slice(0, end)).findIndex((argument) => argument === name || argument.startsWith(`${name}=`));
    if (at === -1) continue;
    const secondAt = at + (argv[at].includes("=") ? 1 : 2);
    const second = argv[secondAt];
    if (second === undefined || secondAt === end || isOption(second) || taken.has(secondAt)) throw new UsageError(said);
    taken.add(secondAt);
    seconds[name] = second;
  }
  return { argv: argv.filter((_, index) => !taken.has(index)), seconds };
}

/** --key's key taken out of `argv` (pairsOf's, for --key alone): { argv, key }, `key` null with no --key. */
export function keyOf(argv) {
  const { argv: rest, seconds } = pairsOf(argv);
  return { argv: rest, key: seconds["--key"] ?? null };
}

export async function run(argv, { workspace, command, documents = workspace }) {
  try {
    return await subcommand(argv, workspace, documents);
  } catch (error) {
    // A mistake in a command line of try (of pack) is said with try's (pack's) lines of the usage, not with new's.
    const what = argv.find((argument) => !isOption(argument));
    if (error instanceof UsageError && what === "try") error.synopsis = TRY_SYNOPSIS;
    if (error instanceof UsageError && what === "pack") error.synopsis = PACK_SYNOPSIS;
    if (error instanceof UsageError && (what === "menu" || what === "net")) error.synopsis = synopsisOf(command, what);
    throw error;
  }
}

// The subcommand `argv` names, run on the workspace at `workspace` (`documents`: where gallery open finds the documents, for check --documents).
async function subcommand(argv, workspace, documents = workspace) {
  const { argv: rest, seconds } = pairsOf(argv);
  const { positional, options, values: given } = commandArguments({ options: ["--script", "--flow", "--data", "--page", "--keep", "--documents", "--replace", "--remove", "--json"], values: [...GESTURES, "--recipe"], argv: rest });
  const recipe = given.get("--recipe");
  const values = new Map([...given].filter(([name]) => name !== "--recipe"));
  const [what, written, ...more] = positional;
  const said = Object.keys(SUBCOMMANDS).join(", ");
  if (!what) throw new UsageError(`Say what to do: ${said}.`);
  if (!Object.hasOwn(SUBCOMMANDS, what)) throw new UsageError(`No such block command: ${what} (${said}).`);
  const action = SUBCOMMANDS[what];
  for (const option of ["--script", "--flow", "--data", "--page"]) if (options.has(option) && action !== SUBCOMMANDS.new) throw new UsageError(`${option} goes with new, not ${what}.`);
  if (options.has("--documents") && action !== SUBCOMMANDS.check) throw new UsageError(`--documents goes with check, not ${what}.`);
  if (options.has("--remove") && action !== SUBCOMMANDS.key) throw new UsageError(`--remove goes with key, not ${what}.`);
  if (options.has("--json") && action !== SUBCOMMANDS.list && action !== SUBCOMMANDS.pack) throw new UsageError(`--json goes with list and pack list, not ${what}.`);
  if (recipe !== undefined && action !== SUBCOMMANDS.new) throw new UsageError(`--recipe goes with new, not ${what}.`);
  const scaffolds = ["--script", "--flow", "--data", "--page"].filter((option) => options.has(option));
  // A recipe is a block already made, so no scaffold option goes with it; --page on a recipe that is a page's card says so (testing the skill with Agents, 2026-11-09: --recipe todos --page).
  if (recipe !== undefined && scaffolds.length) throw new UsageError(`--recipe makes a block of what Gallery's ${recipe} holds: ${scaffolds[0]} goes with a new block of none.${scaffolds[0] === "--page" && shippedBlock(recipe)?.places.includes("page") ? ` ${recipe} already is a card for a custom page (its places hold page): leave --page out.` : ""}`);
  if (options.has("--flow") && options.has("--data")) throw new UsageError("--flow and --data do not go together: --flow is a slot for blocks of the document's own, --data a list of lines a reader keeps in the block's JSON. Make the one you need with new, and add the other by hand.");
  if (options.has("--flow") && options.has("--page")) throw new UsageError("--flow and --page do not go together: a custom page renders no document's blocks, so a block for a page has no slot.");
  const trying = [...values.keys(), ...Object.keys(seconds).filter((name) => !values.has(name)), ...(options.has("--keep") ? ["--keep"] : []), ...(options.has("--replace") ? ["--replace"] : [])];
  if (action === SUBCOMMANDS.try) return action(workspace, { named: positional.slice(1), values, seconds, keep: options.has("--keep"), replace: options.has("--replace") });
  if (trying.length) throw new UsageError(`${trying[0]} goes with try, not ${what}.`);
  if (action === SUBCOMMANDS.list) {
    if (written !== undefined) throw new UsageError(`gallery block ${what} takes nothing else.`);
    return action(workspace, { json: options.has("--json") });
  }
  if (action === SUBCOMMANDS.pack) return action(workspace, written, more, { json: options.has("--json") });
  if (action === SUBCOMMANDS.menu || action === SUBCOMMANDS.net) {
    if (!["on", "off"].includes(written) || more.length !== 1) throw new UsageError(`gallery block ${what} takes on or off and one block: gallery block ${what} on|off <block>.`);
    return action(workspace, written === "on", more[0]);
  }
  if (action === SUBCOMMANDS.key) {
    if (more.length > 1) throw new UsageError("gallery block key takes a host and its key: gallery block key <host> <key>.");
    return action(workspace, written, more[0], { remove: options.has("--remove") });
  }
  if (action === SUBCOMMANDS.add) {
    if (written === undefined || more.length > 0) throw new UsageError(`gallery block add takes one name of Gallery's own blocks: ${addNames()}.`);
    return action(workspace, written);
  }
  if (written === undefined || more.length > 0) throw new UsageError(`gallery block ${what} takes one id.`);
  const id = action === SUBCOMMANDS.show || action === SUBCOMMANDS.check ? blockNamed(workspace, written) : packageNamed(written);
  return action(workspace, id, { script: options.has("--script"), flow: options.has("--flow"), data: options.has("--data"), page: options.has("--page"), documents: options.has("--documents"), elsewhere: documents, recipe });
}
