import { embedReferences } from "./asset-references.mjs";
import { pruneUnusedKitTags, withKitTags } from "./assets.mjs";
import { currentCatalog, describeLine, descriptionsOf } from "../shared/component-catalog.mjs";
import { COMPONENTS } from "../shared/components/index.mjs";
import { withLook } from "../shared/document-look.mjs";
import { reportsDirectory as defaultReportsDirectory } from "../shared/paths.mjs";
import { documentLook } from "../shared/workspace-look.mjs";
import { embedIcon } from "./emoji.mjs";
import { embedFrames } from "./embeds.mjs";
import { embedFiles } from "./files.mjs";
import { embedImages } from "./images.mjs";
import { drawPageChips } from "./page-chips.mjs";
import { packagesOf, withPackageTags } from "./package-files.mjs";

// The tag of the kit's runtime, as withKitTags leaves it.
const RUNTIME_TAG = /<script\b[^>]*\bdata-doc-kit="runtime"[^>]*><\/script>/;

// What the kit is told of the workspace's other packages, those `used` by the page being told with
// their files (withPackageTags), right after its runtime and before anything can ask
// (src/shared/component-catalog.mjs: where the scan read the same). All of them, for a page can come
// to hold an instance of any (a paste, the "/" menu), and those that do not load too, for its note to
// say why. The preview's alone (data-doc-dev): a copy or an export holds what it uses.
function withDescriptions(html, catalog, used) {
  const lines = descriptionsOf(catalog).filter(({ id }) => !used.some((found) => found.id === id)).map(describeLine).join(" ");
  return lines ? html.replace(RUNTIME_TAG, (tag) => `${tag}\n  <script data-doc-dev>${lines}</script>`) : html;
}

// An untitled document's <title>, empty as its title is (the page's title saying 未命名文档 in gray,
// docs/editor.md "Title"), names it so wherever it is shown: the page opened on its own, an export, in
// the page's language (English for lang="en" or "en-…", as the kit's words go: kit/words.js).
const EMPTY_TITLE = /(<title\b[^>]*>)\s*(<\/title>)/i;
export function untitledTitle(html) {
  if (!EMPTY_TITLE.test(html)) return html;
  const english = /^en\b/i.test(/<html\b[^>]*\slang=["']?([^"'\s>]*)/i.exec(html)?.[1] ?? "");
  return html.replace(EMPTY_TITLE, (_, open, close) => `${open}${english ? "Untitled" : "未命名文档"}${close}`);
}

/**
 * A report's source as it is shown: the preview server's page and a build's file alike, the same
 * steps in the same order. The shared tags an older source writes that it never uses are dropped
 * (`removed` names them), every shared tag it needs and does not write is put in (withKitTags: a
 * source writes none; the reader's display settings, ui.js, among them), those of the component
 * packages it has instances of after them (withPackageTags: a kit's file their manifests name is one
 * it needs), the look the document shows on its <html> (its doc.json's `look` over its workspace's
 * default, gallery.json's: shared/workspace-look.mjs documentLook; the attributes the kit's tokens read,
 * shared/document-look.mjs; what the file writes of them taken off, those files being their one home), and the page's icon, its image blocks' pictures, its file blocks' files, its embeds' frames and then every other reference
 * to a file of its folder (a picture in a table cell, a link, a CSS background…) are put in (`mode`
 * "preview" serves them from the report's folder, "export" embeds them as data: URLs;
 * render/emoji.mjs, images.mjs, files.mjs, embeds.mjs, asset-references.mjs), and last its page blocks
 * are drawn with the title and icon their documents have now (page-chips.mjs); an untitled document's
 * empty <title> says 未命名文档 (untitledTitle). A new kind of media
 * block joins here, once. `files` false (an export without its files and images: the workbench's
 * 导出) leaves every reference but the icon's as its link to the report's folder. In "preview" the kit
 * is told of the workspace's other component packages too. `reportsDirectory`:
 * where the report's folder is, in the workspace whose packages it reads (by default the
 * workspace's root, src/shared/paths.mjs). `kit(asset)`: where the kit's tags
 * load their file from (the preview server names each file by its stamp, which a browser
 * keeps it under: src/server/stamps.mjs); by default its public path.
 */
export function renderReportHtml(html, { slug, mode = "export", files = true, reportsDirectory, kit, catalog }) {
  const { html: tagged, removed } = withShownTags(html, { reportsDirectory, kit, catalog, describe: mode === "preview" });
  const options = { slug, mode, ...(reportsDirectory ? { reportsDirectory } : {}) };
  const shown = embedIcon(withLook(tagged, documentLook(slug, reportsDirectory ?? defaultReportsDirectory)), options);
  const embedded = files ? embedReferences(embedFrames(embedFiles(embedImages(shown, options), options), options), options) : shown;
  return { html: untitledTitle(drawPageChips(embedded, options)), removed };
}

/**
 * The steps of a page's showing that no document's slug takes part in, shared by a document's page
 * (renderReportHtml) and a custom page's (./page-html.mjs): the shared tags the source writes and
 * never uses dropped (`removed` names them), every shared tag it needs put in (withKitTags; with
 * `page`, those every custom page loads, the board's, and the reader's display settings, ui.js, which
 * there handle the theme alone), those of the component packages it has instances of after them
 * (withPackageTags), and with `describe` (the preview's document page) what the kit is told of the
 * workspace's other packages. Resolves to { html, removed, packages }.
 */
export function withShownTags(html, { reportsDirectory, kit, page = false, describe = false, catalog = null }) {
  const packages = packagesOf(html, catalog);
  const { html: kept, removed, used } = pruneUnusedKitTags(html, [...COMPONENTS, ...packages]);
  const tagged = withPackageTags(withKitTags(kept, { used, page, ...(kit ? { href: kit } : {}) }), packages);
  return { html: describe ? withDescriptions(tagged, catalog ?? currentCatalog(), packages) : tagged, removed, packages };
}
