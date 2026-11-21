import { settingState } from "../../../shared/components/installed.mjs";

// What a page runs of a package is what it was served with. A page holding an instance of one that
// changes is shown again; one holding none stays, as being shown again would cost its undo steps
// (src/server/routes.mjs), and is behind on that package from then on, which nothing reads until an
// instance of it comes onto the page: a menu, an undo, a paste, whatever else puts one there. One the
// page's new list has, of a package the page runs nothing of or runs as it now is, brings it (./page.mjs
// `bring`). Any other would run as the page was served, a package off still going, a changed one
// as it was, against what the file now is, and words typed in it would be refused. So the page keeps
// which packages it is behind on, and the first such instance to arrive asks for what a page holding
// one has already had (`doc-components-changed`): shown again once nothing waits.

const behind = new Set(); // the ids of the packages that changed since the page was served
let any = false; // the server could not say which: the page connected a moment after a change

/** Whether the package `id` may have changed since the page was served. */
export const isBehind = (id) => any || behind.has(id);

/**
 * `components`, the list a page holds, as the reader's settings now say: the state each package says
 * by its `places` and `listed` and gallery.json's hidden, shown, disabled, unlisted, listed and packs off (settingState, inDocumentMenus: the
 * server's own rule), which a menu reads, at once and with nothing shown again (`doc-settings-changed`).
 * A package that comes on is in none of that yet: it comes with the list the page reads as the catalog
 * changes, as one added does (`doc-catalog-changed`, ./page.mjs).
 */
export function followSettings(components, settings) {
  for (const entry of components) entry.state = settingState(entry.id, { hidden: [], shown: [], disabled: [], unlisted: [], listed: [], packsOff: [], ...settings }, entry.places, entry.listed);
}

/** Hears what changed of the catalog while the page held no instance of it. */
export function followCatalog() {
  window.addEventListener("doc-catalog-changed", ({ detail: { ids } }) => {
    if (ids) ids.forEach((id) => behind.add(id));
    else any = true;
  });
}
