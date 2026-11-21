import { LISTED_BLOCKS } from "../editor/components/registry.mjs";
import { installOfficialPacks, workspacePacks } from "../shared/block-packs.mjs";
import { forgetCatalog, packageStates, readCatalog } from "../shared/component-catalog.mjs";
import { inLanguage, told } from "../shared/i18n/index.mjs";
import { netHostsOf } from "../shared/net-policy.mjs";
import { PACK_ID } from "../shared/pack-manifest.mjs";
import { findPreviewServer } from "../shared/preview-server.mjs";
import { shippedPackIds } from "../shared/shipped-blocks.mjs";
import { createComponentSettings } from "../server/component-settings.mjs";
import { UsageError } from "./arguments.mjs";
import { bothSaid, blockNamed, missingSaid } from "./component.mjs";
import { throughServer } from "./tree.mjs";

// The switches of 设置 › 组件列表 for an Agent the user asks (since 2026-11-11):
// gallery block pack on|off <pack> (a pack's card switch), gallery block menu on|off <block> (在文档菜单里显示)
// and gallery block net on|off <block> (允许联网). Each calls the workbench service's `components` (POST
// /__gallery/workspace/components, src/server/component-settings.mjs write), the one the dialog's switches
// call: through the workspace's running server when there is one (the open pages follow the change at once),
// else the same code here, which writes gallery.json under writeComponentSettings's rules (a file that does
// not read, is another program's or changed meanwhile is refused and stays as it is). Each says whether it
// changed anything; one that is as asked already is no error. Exits 0 done; 1 when a pack or a block is not
// there, cannot be switched, or gallery.json cannot be written; 2 for a mistake in the command line.

/** What a refusal or a failed answer says, in English. */
const answerSaid = (answer) => inLanguage("en", () => told(answer)) ?? answer?.message ?? answer?.reason ?? "no answer";

/**
 * A change of the switches ({ id, hidden?, shown?, disabled?, unlisted?, net? } or { pack, enabled }) written
 * through the workspace's running server when it takes it, else here: the service's answer ({ ok: true, …
 * the list as the dialog reads it } or { ok: false, reason, message }).
 */
async function writeSettings(root, change) {
  const server = await findPreviewServer();
  const answer = server ? await throughServer(server, change, "components") : null;
  if (answer) return answer;
  try {
    // taken(): this process' catalog read again, so that the answer says what is in use now.
    return { ok: true, ...(await createComponentSettings({ root, taken: () => forgetCatalog(root) }).write(change)) };
  } catch (error) {
    return { ok: false, reason: "components", message: error.message, ...(typeof error.text === "string" && Array.isArray(error.values) ? { text: error.text, values: error.values } : {}) };
  }
}

const failedWith = (what, answer) => {
  console.error(`${what}: ${answerSaid(answer)}`);
  process.exit(1);
};

const onOff = (on) => (on ? "on" : "off");

// ---------- pack on|off ----------

export async function packSwitch(root, on, id) {
  if (id === undefined) throw new UsageError(`gallery block pack ${onOff(on)} takes one pack's id: gallery block pack ${onOff(on)} <pack> (gallery block pack list says each).`);
  if (!PACK_ID.test(id)) throw new UsageError(`Not a pack's id: ${id} (lowercase letters, digits and hyphens: gallery block pack list says each pack's).`);
  let packs = workspacePacks(root);
  // One of Gallery's own that this workspace has not got yet (no server started in it, gallery init has not run
  // here): installed as they install it, then switched.
  if (!packs.some((pack) => pack.id === id) && shippedPackIds().includes(id)) {
    const done = await installOfficialPacks(root);
    if (done.did === "done") console.log(`Installed Gallery's own packs first, as gallery init and a server's start do (${done.packs.filter((pack) => !pack.failed).map((pack) => pack.id).join(", ")}).`);
    packs = workspacePacks(root);
  }
  const pack = packs.find((one) => one.id === id);
  if (!pack) {
    console.error(`No pack ${id} in this workspace (${packs.map((one) => one.id).join(", ")}): gallery block pack list says which there are.`);
    process.exit(1);
  }
  const name = `${id} (${bothSaid(pack.name)})`;
  if (pack.enabled === on) return void console.log(`The pack ${name} is ${onOff(on)} already: nothing changed.`);
  const answer = await writeSettings(root, { pack: id, enabled: on });
  if (!answer.ok) failedWith(`The pack ${id} was not switched ${onOff(on)}`, answer);
  console.log(`Switched the pack ${name} ${onOff(on)}: ${on ? 'its blocks are offered by "/" and 添加自定义块' : "no menu or library offers its blocks, and what is written of them shows as ever"} (设置 › 组件列表 shows the same switch).`);
}

// ---------- menu on|off ----------

// The block `written` names for menu: a custom block (its id, a <name> alone local's or Gallery's own) or a
// built-in block of the document's menus (its id or its name, in either language). A bare name that is a
// built-in block's and no block of the workspace's local scope is the built-in block.
function menuTarget(root, written) {
  const builtin = written.includes("/") ? null : LISTED_BLOCKS.find(({ id, name }) => id === written || [inLanguage("zh", name), inLanguage("en", name)].some((said) => said.toLowerCase() === written.toLowerCase())) ?? null;
  if (builtin) {
    const catalog = readCatalog(root);
    if (!catalog.packages.has(`local/${written}`) && !catalog.problems.has(`local/${written}`)) return { builtin };
  }
  try {
    return { id: blockNamed(root, written) };
  } catch (error) {
    // A name that is no block's id: the built-in blocks are named by their ids or their names.
    if (error instanceof UsageError) throw new UsageError(`${error.message} A built-in block of the menus is named by its id or its name: ${LISTED_BLOCKS.map(({ id }) => id).join(", ")}.`);
    throw error;
  }
}

export async function menuSwitch(root, on, written) {
  const target = menuTarget(root, written);
  const catalog = readCatalog(root);
  if (target.builtin) {
    const { id, name, hideable } = target.builtin;
    const said = `${id} (${inLanguage("zh", name)} / ${inLanguage("en", name)})`;
    const hidden = hideable && catalog.settings.hidden.includes(id);
    if (!hideable) {
      if (on) return void console.log(`The built-in block ${said} is always in the document's menus: nothing changed.`);
      console.error(`The built-in block ${said} stays in the document's menus: it cannot be taken out.`);
      process.exit(1);
    }
    if (hidden === !on) return void console.log(`The built-in block ${said} is ${on ? "in" : "out of"} the document's menus already: nothing changed.`);
    const answer = await writeSettings(root, { id, hidden: !on });
    if (!answer.ok) failedWith(`The built-in block ${id} was not ${on ? "put in" : "taken out of"} the document's menus`, answer);
    console.log(on ? `Put the built-in block ${said} in the document's menus again ("/", 在下方新建, the handle's grid).` : `Took the built-in block ${said} out of the document's menus ("/", 在下方新建, the handle's grid): a document can still write it, and what is written of it still runs and exports. gallery block menu on ${id} puts it back.`);
    return;
  }
  const { id } = target;
  const state = packageStates(catalog).find((one) => one.id === id);
  if (!state) {
    console.error(missingSaid(root, id));
    process.exit(1);
  }
  // On: the master switch too where it is off (a block whose manifest says listed: false is off until turned on), as the menus offer neither else.
  const masterOff = on && state.unlisted;
  if (state.menu === on && !masterOff) return void console.log(`${id} is ${on ? "in" : "out of"} the document's menus already: nothing changed.`);
  // The dialog's switch: a block that stands in documents is shown or hidden (hidden), one that stands on custom pages alone is shown (shown).
  const inDocuments = (state.places ?? ["document"]).includes("document");
  const answer = await writeSettings(root, { ...(inDocuments ? { id, hidden: !on } : { id, shown: on }), ...(masterOff ? { unlisted: false } : {}) });
  if (!answer.ok) failedWith(`${id} was not ${on ? "put in" : "taken out of"} the document's menus`, answer);
  console.log(on ? `Put ${id} in the document's menus ("/", 在下方新建, the handle's grid).` : `Took ${id} out of the document's menus ("/", 在下方新建, the handle's grid): a document can still write it, and what is written of it still runs and exports. gallery block menu on ${id} puts it back.`);
}

// ---------- net on|off ----------

export async function netSwitch(root, on, written) {
  const id = blockNamed(root, written);
  const state = packageStates(readCatalog(root)).find((one) => one.id === id);
  if (!state) {
    console.error(missingSaid(root, id));
    process.exit(1);
  }
  const hosts = netHostsOf(state.needs);
  const allowed = hosts.length > 0 && hosts.every((host) => state.allowed.includes(host));
  if (on) {
    if (hosts.length === 0) {
      console.error(`${id} reaches no website: its manifest's needs name no net:<host>, so there is nothing to allow (gallery block show ${id} says its needs).`);
      process.exit(1);
    }
    // What it will reach, before anything is written.
    console.log(`${id} will reach these websites: ${hosts.join(", ")}`);
    console.log(`Gallery fetches for it, only from those sites, with none of the user's logins; what it gets is shown in Gallery and the last of it is kept in an export.`);
    console.log(`提示：turn this on only when the user asked for it; gallery block net off ${id} takes it back.`);
    if (allowed) return void console.log(`${id} is allowed to reach them already: nothing changed.`);
    const answer = await writeSettings(root, { id, net: true });
    if (!answer.ok) failedWith(`${id} was not allowed online`, answer);
    console.log(`Allowed ${id} to reach ${hosts.join(", ")} (设置 › 组件列表 › 允许联网 is on for it).`);
    return;
  }
  if (state.allowed.length === 0) return void console.log(`${id} is not allowed to reach any website: nothing to take back.`);
  const answer = await writeSettings(root, { id, net: false });
  if (!answer.ok) failedWith(`${id} was not taken offline`, answer);
  console.log(`Took back ${id}'s reach to ${state.allowed.join(", ")} (设置 › 组件列表 › 允许联网 is off for it).`);
}

