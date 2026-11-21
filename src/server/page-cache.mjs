// The pages the preview served lately, kept to be served again (docs/render.md, "Live preview"): a
// page is made from its report's text and from nothing else but what its key says (the report, read
// or presented, the stamps of the editor's modules, of the kit's files and of the report's folder:
// ./stamps.mjs; the stamp of the catalog of component packages: ./catalog-watch.mjs) and the other
// documents its page blocks show (./routes.mjs clears what is kept when one changes), so the same text
// under the same key is the same page, byte for byte. Making one
// costs 15 to 80 ms (the editor's marks, the render's chain, the fast checks; more on a busy
// machine), and it was asked again and again for an unchanged file: the workbench mounting a
// report's frame twice, opening a report again, a page reloading. A page kept is found by its key
// and its whole text (the text compared, not only its hash: what the page shows is what the file says).
//
// The report's folder is in the key by its stamp, the folder's and its assets/' times (a file put in
// or taken out changes them at once), and forget(slug) drops the report's pages when the watcher
// tells of any other change in its folder (a picture written again in place): its pictures, files
// and frames are served from where they are, and the checks say which are missing.

export const KEPT_PAGES = 20; // the most pages kept, the oldest used dropped first

export function createPageCache({ max = KEPT_PAGES } = {}) {
  const pages = new Map(); // `${slug} ${key}` -> { text, page }
  return {
    /** The page kept for this slug, key and text, or null. */
    get(slug, key, text) {
      const name = `${slug} ${key}`;
      const kept = pages.get(name);
      if (!kept || kept.text !== text) return null;
      pages.delete(name); // now the one used last
      pages.set(name, kept);
      return kept.page;
    },
    set(slug, key, text, page) {
      const name = `${slug} ${key}`;
      pages.delete(name);
      pages.set(name, { slug, text, page });
      while (pages.size > max) pages.delete(pages.keys().next().value);
    },
    /** Drop every page kept. */
    clear() {
      pages.clear();
    },
    /** Drop every page of this report. */
    forget(slug) {
      for (const [name, kept] of pages) if (kept.slug === slug) pages.delete(name);
    },
    get size() {
      return pages.size;
    },
  };
}
