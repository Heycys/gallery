import { workspaceAddress } from "../../shared/workspace-address.mjs";
import { t } from "../../shared/i18n/index.mjs";
import { addressOn, elsewhere, fromFile, isPageAddress, mayBePage, pageAddress, workbenchHash } from "../../shared/page-address.mjs";
import { inTrash, linkedPages, pageLinks } from "../../shared/page-links.mjs";
import { entryOfKey } from "../../shared/extension-sidebar.mjs";
import { tell } from "./present-shell.mjs";
import { followFiles } from "./assets-live.mjs";

// The links of a page shown in 演示视图 (?present: src/server/routes.mjs), which has no editor and whose
// frame the presentation holds (src/workbench/app/features/present/). A link to a document or a block
// of one goes there in the frame and stays a reader's: its page with ?present, the block found by the
// kit (kit/runtime/reveal.js); followed as it stands it would come to the document's page with the
// editor on it, and a web address would take the frame away from the presentation, so that goes to
// a new tab. An address of this computer is asked of the list as the click is taken, for only the
// list knows the titles and what is gone: a document that is not there leaves the presentation where
// it is, with a word through it (the workbench's notice), and on another port what the list does not
// hold (addressOn) is another program's, a web address like any. What the kit or the browser does with
// a click stays theirs: an anchor, a link to save, a link of a target of its own, any click with a key
// held. A workbench's address that names a web link of the sidebar, or an entry of an extension's column
// (#~<id>/<entry id>, one with an address), is a web address to the presentation: its page goes to a new
// tab; an entry the list does not hold, or one with no address, is said gone as a document is. (In a draft's presentation, a frame
// of its workspace's own server, the word goes to the workbench of another origin and a link keeps it around the page: present-shell.mjs.)

const own = pageAddress(location.href)?.slug ?? null;
// A file of the folder written again while it is presented: shown where it stands, as an editing page does (assets-live.mjs).
followFiles({ slug: own });
const openTab = (address) => window.open(address, "_blank", "noopener");
const read = (route) => fetch(workspaceAddress(`/__gallery/workspace/${route}`)).then((answer) => answer.json()).catch(() => null);

function go({ slug, block }) {
  const fragment = block ? `#${encodeURIComponent(block)}` : "";
  if (slug !== own) location.assign(workspaceAddress(`/generated/${slug}.html?present${fragment}`)); // a draft's presentation keeps the workbench around it (present-shell.mjs)
  else if (block) dispatchEvent(new CustomEvent("doc-jump-request", { detail: { hash: fragment } })); // the kit's jump, a step of the history as a link #<block id> is
}

function sayGone(name, { trash = [] } = {}) {
  const text = inTrash(trash, name) ? t("这个页面已删除。") : t("没有找到这个页面。");
  tell("notice", { text });
}

async function follow(address) {
  if (!mayBePage(address)) return void openTab(address);
  const listed = await read("outline");
  const place = addressOn(address, listed?.reports ? pageLinks(linkedPages(listed.reports)) : null, location.origin);
  const web = place && listed?.reports?.[place.slug]?.kind === "link" ? listed.reports[place.slug] : null;
  const entry = !place && !elsewhere(address, location.origin) ? entryOfKey(listed?.extensions, workbenchHash(address) ?? "") : null;
  if (web) {
    if (/^https?:/.test(web.url ?? "")) openTab(web.url);
    else sayGone(web.slug, listed);
  } else if (place) go(place);
  else if (entry?.url) openTab(entry.url);
  else if (isPageAddress(address) && !elsewhere(address, location.origin)) sayGone(pageAddress(address)?.slug ?? workbenchHash(address), listed ?? undefined);
  else openTab(address);
}

document.addEventListener("click", (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest?.("a[*|href]");
  if (!link || link.matches("[download], [target], [*|href^='#']")) return;
  const address = fromFile(link.href.baseVal ?? link.getAttribute("href"), own, location.origin);
  if (!address || !/^https?:/.test(address)) return;
  event.preventDefault();
  follow(address);
});
