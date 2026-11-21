import { assetFile, referencedFile } from "../shared/media.mjs";
import { pageAssetAddress } from "../shared/pages.mjs";
import { addressEdits, referencesWhere, withEdits } from "./asset-references.mjs";
import { withShownTags } from "./report-html.mjs";

// A custom page's page.html as the preview server shows it at /pages/<slug> (src/server/routes.mjs):
// the shared steps of a document's page that take no
// slug (./report-html.mjs withShownTags, with `page`): the kit's tags every page loads (its tokens,
// runtime, state), the reader's display settings (ui.js, which on a custom page handles the theme
// alone and puts data-doc-effective-theme on the root), the board's (board.css, board.js: the grid of
// square cells), what its instances use, and the tags of the custom blocks it has instances of after
// them; and each reference to a file of the page's own assets/ addressed where the server serves it
// (withPageAssets). Nothing else of a document's: no look of doc.json, no page icon, no files
// embedded, no page blocks drawn, no editor. The server adds the live reload and the workbench's
// session (src/editor/page/custom-page.mjs). `kit(asset)`: where the kit's tags load their file from.

/**
 * Custom page `html` (of page `slug`) with each reference to a file of its own assets/ folder, written
 * as a document writes one (assets/<file> or ./assets/<file>, wherever a document's references stand:
 * an element's src, href, poster, srcset, a style's url(): ./asset-references.mjs referencesWhere),
 * addressed where the server serves it, /pages/<slug>/assets/<file> (its query and fragment kept): the
 * page is served at /pages/<slug>, where assets/ would name /pages/assets/. What names no file the
 * route serves (in a folder of assets/, of a name it takes none by: shared/media.mjs assetFile) stays as
 * written, which gallery page check says. The file is not changed; the page service writes a block's
 * part back with the folder's own addresses (src/editor/page-service.mjs).
 */
export function withPageAssets(html, slug) {
  if (!/assets\//i.test(html)) return html;
  const references = referencesWhere(html, (value) => referencedFile(value) !== null);
  return withEdits(html, addressEdits(references, (reference) => {
    const file = referencedFile(reference.value);
    if (!assetFile(file)) return null;
    return `${pageAssetAddress(slug, file)}${/[?#].*$/.exec(reference.value.trim())?.[0] ?? ""}`;
  }));
}

/** Custom page `html` (page `slug`'s) with the tags it is shown with: { html, packages }. */
export function renderPageHtml(html, { reportsDirectory, kit, slug = null } = {}) {
  const { html: tagged, packages } = withShownTags(slug ? withPageAssets(html, slug) : html, { reportsDirectory, kit, page: true });
  return { html: tagged, packages };
}
