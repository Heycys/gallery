import { BLOCK_ICON } from "../editor/components/icons.mjs";
import { LISTED_BLOCKS } from "../editor/components/registry.mjs";
import { installPack, workspacePacks } from "../shared/block-packs.mjs";
import { currentCatalog, packageStates, settingsProblem, writeComponentSettings } from "../shared/component-catalog.mjs";
import { PACKAGE_ID, packOf } from "../shared/components/installed.mjs";
import { netHostsOf } from "../shared/net-policy.mjs";
import { SHIPPED_SCOPE, shippedBlocks, shippedNewer } from "../shared/shipped-blocks.mjs";
import { inLanguage, refusal, said } from "../shared/i18n/index.mjs";
import { packFilesAt, packFilesOfZip } from "../transfer/pack-source.mjs";

// 设置 › 组件列表 (docs/workbench.md, "Components"), for the workbench's GET and POST components: what the
// page lists and the one change it makes, a switch of a custom block (a package), of a block pack, or of a
// built-in component; and POST pack-install, its 导入 (a block pack from a folder or a zip: shared/block-packs.mjs). Here
// because it reads both the catalog and the components' definitions, which no system but this one
// meets. A change is written to gallery.json and taken at once (`taken`), so that the answer says what
// is in use, and the pages are told as of any change of the catalog.

/**
 * `root`: the workspace. `taken()`: what gallery.json says is put in use (./catalog-watch.mjs).
 * read(): { packages (packageStates, each with `newer`: of one of Gallery's own whose copy was changed
 * after it was added, Gallery's newer version, which is not put over it: shared/shipped-blocks.mjs
 * shippedNewer; else null; and of one of Gallery's own `addAs`, what gallery block add takes of it), packs
 * (shared/block-packs.mjs workspacePacks: the pack cards, each a scope of the packages' `pack`), packageIcon (the svg markup of a custom block's mark, one for all of
 * them: BLOCK_ICON), blocks: [{ id, name: { zh, en }, icon, hidden, hideable }] (icon: the
 * svg markup of the component's mark, LISTED_BLOCKS), problem
 * (settingsProblem: why gallery.json cannot be read, the switches meaning nothing until it can, or null) }.
 * write({ pack, enabled }): a pack's switch (gallery.json's components.packs: off, none of its blocks offered by a
 * menu or a library, what is written of them shown as ever), answering as read; a pack that is not there is refused.
 * install({ path } | { zip }): the pack at a path of this computer (a folder or a zip) or a zip's bytes (base64,
 * the dialog's 选择文件…) installed as gallery block pack install installs it, answering as read with `installed`
 * (installPack's answer: id, name, version, did, added, updated, kept…); refused with why (said()'s, a `code`).
 * write({ id, hidden, shown, disabled, unlisted, net }): that switch changed (any may be left out), answering as read:
 * the row's master switch is `unlisted` off (no menu and no library offers the block; what is written of it
 * shows as ever; of a block whose manifest says `listed: false`, off until the user turns it on, it is written
 * as gallery.json's `listed`: unlistedBy); 在文档菜单里显示 is `hidden` off for a block whose places say document, `shown` on for one whose do
 * not (the page sends the one its places name); `net` true is the reader's consent to the hosts its needs
 * name, all of them as its manifest says them now (the workbench's consent dialog, from its card's 允许访问
 * or from its row's 允许联网), false takes it back (gallery.json's components.net); a change that cannot be
 * is refused with why.
 */
export function createComponentSettings({ root, taken }) {
  const read = () => {
    const catalog = currentCatalog(root);
    const shipped = new Map(shippedBlocks().map((block) => [block.id, block]));
    return {
      // Of one of Gallery's own whose copy was changed after it was added, Gallery's newer version, which is then not put over it;
      // of one whose manifest does not read (no places to tell by), the pack Gallery's counts in (packOf), as workspacePacks counts it.
      packages: packageStates(catalog).map((item) => {
        const block = shipped.get(item.id);
        return { ...item, ...(block && item.places === null ? { pack: packOf(item.id, block.places) } : {}), newer: block ? shippedNewer(root, block) : null, ...(block ? { addAs: block.pack === SHIPPED_SCOPE ? block.name : block.id } : {}) };
      }),
      packs: workspacePacks(root, { settings: catalog.settings }),
      packageIcon: BLOCK_ICON,
      blocks: LISTED_BLOCKS.map(({ id, name, icon, hideable }) => ({
        id,
        name: { zh: inLanguage("zh", name), en: inLanguage("en", name) },
        icon,
        hidden: hideable && catalog.settings.hidden.includes(id),
        hideable,
      })),
      problem: settingsProblem(catalog),
    };
  };
  const refused = ({ id, hidden, shown, disabled, unlisted, net }) => {
    if (![hidden, shown, disabled, unlisted, net].every((on) => on === undefined || typeof on === "boolean")) return said("开关的值不对");
    const block = LISTED_BLOCKS.find((listed) => listed.id === id);
    if (!block) {
      if (!(typeof id === "string" && PACKAGE_ID.test(id))) return said("没有这个组件");
      // A consent is to what a block's manifest names, which only one that loads says.
      return net && netHostsOf(currentCatalog(root).packages.get(id)?.needs).length === 0 ? said("这个块不联网") : null;
    }
    if (disabled !== undefined || shown !== undefined || unlisted !== undefined || net !== undefined) return said("内置块只能隐藏，不能停用"); // a built-in stands in documents: its switch is `hidden`
    return hidden && !block.hideable ? said("这个块不能隐藏") : null;
  };
  const write = async (change) => {
    if (change?.pack !== undefined) {
      const { pack, enabled } = change;
      if (typeof enabled !== "boolean") throw refusal(said("开关的值不对"));
      if (typeof pack !== "string" || !workspacePacks(root, { settings: currentCatalog(root).settings }).some(({ id }) => id === pack)) throw refusal(said("没有这个块包"));
      await writeComponentSettings(root, { pack, enabled });
      taken();
      return read();
    }
    const reason = refused(change);
    if (reason) throw refusal(reason);
    const { net, ...switches } = change;
    const catalog = currentCatalog(root);
    const hosts = net === undefined ? undefined : net ? netHostsOf(catalog.packages.get(change.id)?.needs) : [];
    // The master switch of a block whose manifest says `listed: false` is gallery.json's `listed` (unlistedBy): on puts
    // it there (and takes it out of `unlisted`, where a switch of before left it), off takes it out.
    const found = catalog.packages.get(change.id) ?? catalog.problems.get(change.id);
    if (switches.unlisted !== undefined && found?.listed === false) Object.assign(switches, switches.unlisted ? { listed: false, unlisted: undefined } : { listed: true });
    await writeComponentSettings(root, { ...switches, ...(hosts ? { net: hosts } : {}) });
    taken();
    return read();
  };
  const install = ({ path, zip } = {}) => {
    const files = typeof zip === "string" ? packFilesOfZip(Buffer.from(zip, "base64")) : typeof path === "string" && path.trim() ? packFilesAt(path) : null;
    if (!files) throw refusal(said("粘贴块包的文件夹或 zip 的路径"), { code: "path" });
    const installed = installPack(root, files);
    taken();
    return { ...read(), installed };
  };
  return { read, write, install };
}
