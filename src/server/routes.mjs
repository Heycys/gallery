import fs from "node:fs/promises";
import path from "node:path";
import { createEditService } from "../editor/service.mjs";
import { blockOn, createPageService, pageWriterOf } from "../editor/page-service.mjs";
import { hashOf } from "../editor/source.mjs";
import { frameable, pageTitle, siteIcon } from "../editor/unfurl.mjs";
import { ASSETS, assetTags, mhchemSourcePath, publicFileOf, publicPathOf, withNeededKitTags } from "../render/assets.mjs";
import { iconImage } from "../render/emoji.mjs";
import { drawPageChips } from "../render/page-chips.mjs";
import { renderReportHtml } from "../render/report-html.mjs";
import { renderPageHtml, withPageAssets } from "../render/page-html.mjs";
import { checkPanel } from "../render/preview-checks.mjs";
import { offlineReports, writeSharedAssets } from "../render/pipeline.mjs";
import { createReportFromStarter } from "../render/reports.mjs";
import { browserDirectory, editStateDirectory, kitSourceDirectory, release, reportsDirectory as defaultReportsDirectory } from "../shared/paths.mjs";
import { FRAMED_BY, sendJson, serve, serveFound } from "../shared/http.mjs";
import { currentCatalog, problemIn, settingsLine } from "../shared/component-catalog.mjs";
import { languageScript } from "../shared/i18n/index.mjs";
import { guardDrops } from "../shared/drop-guard.mjs";
import { ICON_PICKER_ROUTE } from "../shared/icon-picker.mjs";
import { announcePreviewServer, galleryVersion, sameDirectory } from "../shared/preview-server.mjs";
import { registerQuietly } from "../shared/workspace-registry.mjs";
import { lookWord } from "../shared/document-look.mjs";
import { documentLook, ownLookAt } from "../shared/workspace-look.mjs";
import { slugPattern } from "../shared/reports.mjs";
import { ATTRIBUTE, PACKAGE_ID } from "../shared/components/installed.mjs";
import { COMPONENTS_FOLDER, DOCUMENT_FOLDERS, EXTENSIONS_FOLDER, PAGES_FOLDER, WORKSPACE_FILE, defaultWorkspace, documentDirectory, documentFiles, isDocumentFile, isDocumentSource, isSlugName, layoutOf, listDocumentSlugs } from "../shared/workspace.mjs";
import { PAGE_FILES, homeCardsNew, isBlankPage, isPageFile, listPages, pageFiles, pageHintShown, pageMetaNow, pageVersion } from "../shared/pages.mjs";
import { shippedBlocks } from "../shared/shipped-blocks.mjs";
import { LINK_FILE } from "../shared/web-links.mjs";
import { COLUMNS_FOLDER, SIDEBAR_FILE } from "../shared/extension-sidebar.mjs";
import { extensionColumnIds } from "../shared/extensions.mjs";
import { dropGoneExtensions } from "../shared/outline.mjs";
import { isExtensionId } from "../shared/outline-shape.mjs";
import { readPage, servedPage } from "../shared/page-cards.mjs";
import { encodePictures } from "../transfer/browser.mjs";
import { carriedExport } from "../transfer/carry.mjs";
import { runJob } from "../transfer/jobs.mjs";
import { createTransferService } from "../transfer/service.mjs";
import { createWorkspaceService } from "../workbench/service.mjs";
import { createActivity } from "../workbench/activity.mjs";
import { extensionEvents } from "./extensions.mjs";
import { invalidateExtension } from "../shared/extension-manifest.mjs";
import { createIndex, readOf } from "../workbench/index.mjs";
import { FACT_KINDS, OPEN_EVENT, QUERY_ROUTE, WORKSPACE_GLOBAL } from "../shared/workspace-query.mjs";
import { createAnnouncer } from "./announce.mjs";
import { createAssetNews } from "./asset-news.mjs";
import { servedStamps } from "../render/media-ref.mjs";
import { assetFile, imageFile, mediaTypeOf } from "../shared/media.mjs";
import { createUpdates } from "./updates.mjs";
import { watchWorkspace } from "./watch.mjs";
import { createCatalogWatch } from "./catalog-watch.mjs";
import { serveComponentFile } from "./component-route.mjs";
import { createComponentSettings } from "./component-settings.mjs";
import { exportOffline } from "./export.mjs";
import { serveMedia, servePageAsset, serveStamped } from "./media-route.mjs";
import { createNetRoute, localHop } from "./net-route.mjs";
import { projectHtml } from "./project-html.mjs";
import { createPageCache } from "./page-cache.mjs";
import { createFileList, packageStamps, stampOf } from "./stamps.mjs";

// The preview server's routes, one module for both of its hosts (docs/render.md, "Live preview"): the
// Vite plugin of npm run dev:local and of the servers a gallery command starts in a source checkout
// (./index.mjs, Vite there only for the workbench's modules and their hot reload), and the release's
// own server (./production.mjs: node:http, no Vite), which answers what this leaves (next()) with the
// built workbench and the kit's and vendors' files by their path (./static.mjs). The one place the
// systems are wired together.
// - /generated/<slug>.html is rendered from the document's doc.html (<workspace>/<slug>/, or an old
//   document's report.html: shared/workspace.mjs) on every request, so the
//   preview never waits for a rebuild (the page made of the same text is kept: ./page-cache.mjs);
//   it runs the fast checks only (gallery check and gallery export run them all). Showing a
//   report never writes it: its natural HTML (what an Agent writes as any page would: bare formulas,
//   <details>, <pre>, <mark>…) is made the kit's in memory (src/editor/source/natural.mjs), and the
//   page is served, edits and opens on that text (edits.read); the file takes the kit's markup with
//   the reader's first edit, or the Agent's export.
// - /<slug>/doc.html (an old document's /<slug>/report.html) is what a link between two documents
//   comes to as a browser reads it (../<slug>/doc.html, from /generated/<a>.html): a redirect to the
//   document's page, its query going with it and its fragment by the browser, for a link opened in a
//   tab of its own. Asked only of what the document route did not take, so that the page of a document
//   called doc is /generated/doc.html, and generated is a name no document has (shared/workspace.mjs).
// - The page listens on a small server-sent-events channel instead of Vite's HMR client, so it
//   reloads only when its report (or the shared kit) is saved: a report's save once the preview
//   takes the file, never while an Agent has it half written (editor/settle.mjs). A lost connection reconnects
//   quietly and never reloads the page by itself; a page the text editor runs on is told about
//   the change instead of reloading. The workbench listens on the same channel (?workspace) for
//   "workspace <stamp>" alone, which no page hears: the outline written (by its own moves, another
//   tab's or a gallery command's), a document made or gone, a doc.json changed; it reads the list again.
// - The page carries the in-place text editor (src/editor/page/), which saves by itself through
//   POST /__gallery/edit/commit (merged with whatever else wrote the file). None of this reaches
//   exports. With ?present (the workbench's 演示)
//   the page is shown as a reader sees it: no editor, no check notes, no display button, and its
//   links keep it so (editor/page/present-links.mjs, the one module of the editor's on such a page, with present-shell.mjs it
//   imports to notify the same-origin workbench). With ?present&version=<id>&key=<key> (the workbench's 历史版本)
//   it is that recent version of the document instead, shown the same way but frozen (versionScript):
//   the key the edit service's list gave (an HMAC of the token's: editor/service.mjs viewAddress), a
//   request another site started refused (Sec-Fetch-Site), no live script, nothing kept or written.
//   The token lives in the data directory; document versions stay in their owner’s .gallery/state/, so
//   an open page keeps saving across a restart of this server. So does where this server listens
//   (<data>/server.json: shared/preview-server.mjs), for gallery export to write a document's file through its queue
//   (POST /__gallery/edit/hand-in) instead of racing a commit, and for gallery open to give a
//   document's address on this server (or on one it starts, which announces itself the same way).
// - /pages/<slug> is a custom page (shared/pages.mjs: <workspace>/pages/<slug>/page.html), rendered on
//   every request (render/page-html.mjs: the kit's tags, the board's, its blocks'), with its live
//   reload (the events channel, ?page=<slug>: "page <version>" when page.html or page.json changed)
//   and the workbench's session (src/editor/page/custom-page.mjs). No editor: a page is the Agent's
//   file, shown as it is. Its own files, assets/<file> of its folder (a picture of the page or a card),
//   are /pages/<slug>/assets/<file> (./media-route.mjs servePageAsset), where the page's references to
//   them are addressed as it is served; nothing else of its folder is served by its path.
//   Its cards are moved, resized, added, taken out and written through the page service
//   (/__gallery/pages/<slug>/cards: src/editor/page-service.mjs, in the queue the edit service's writes
//   run in), whose library of blocks a card can be is /__gallery/pages/<slug>/library (the pictures of
//   Gallery's own blocks not added yet in it /__gallery/pages/<slug>/picture, and a
//   page's first-open note is closed by POST /__gallery/pages/<slug>/hint); the page is
//   served each card with its id and base (shared/page-cards.mjs servedPage) and what the page's board
//   editing needs (its token, its version, its blocks' cards and settings: the page map), which the
//   editor's board module reads (src/editor/page/board/).
// - /__gallery/components/<scope>/<name>/<file> is a file a component package gives a page (./component-route.mjs).
// - /__gallery/net is a custom block's context.fetch (./net-route.mjs): the web reached for it, a host of
//   its needs the reader allowed, an address of the public internet, the answer kept (.gallery/cache/net/).
//   With GALLERY_TEST_NET=<port> (the browser scenarios) it reaches the server of this computer at that
//   port alone (localHop), nothing resolved.
// - /__gallery/workspace/<command> manages whole reports for a workbench (src/workbench/service.mjs,
//   docs/workbench.md): new, duplicate, rename, trash, restore, export, the outline, 字体与布局 and its
//   应用到全部文档, and 设置 › 组件列表.
// - /__gallery/transfer/<command> is the workbench's 导入 and 导出 (src/transfer/service.mjs): a page's export
//   as PDF, HTML or Markdown, and other programs' files made pages.
// - / is the workbench (src/workbench/app/): the reports in a sidebar, one open in an iframe, talking
//   to it by the session protocol and to /__gallery/workspace/*; its page is the host's (`workbenchPage`).
// - Every request is first held to its Host (handle): the server answers only to 127.0.0.1:<port> and
//   localhost:<port>, never to another name a page elsewhere could make resolve to this machine (DNS
//   rebinding: the documents, their token and their files are this server's to hand out). The workbench
//   asked for by localhost is sent to 127.0.0.1 (toLoopback).

const slugText = slugPattern.source.slice(1, -1); // a slug, as the routes spell it (the pattern without its anchors)
const reportRoute = new RegExp(`^/generated/(${slugText})\\.html$`);
const fileRoute = new RegExp(`^/(${slugText})/(?:doc|report)\\.html$`);
const customPageRoute = new RegExp(`^/pages/(${slugText})$`);
const pageServiceRoute = new RegExp(`^/__gallery/pages/(${slugText})/(cards|library|hint|picture)$`);
const eventsRoute = "/__gallery/events";
// Browser modules the preview page imports, served by their path under src/ (/__gallery/edit/src/<path>),
// so their relative imports (the editor's of src/shared/ and of its components) resolve as on disk:
// the editor's page modules (with its tools' folders, two deep: clipboard/import/), the components' descriptions and page modules
// (never a component's file.mjs nor components/files.mjs, which are the server's) and src/shared/
// with the kit's component descriptions (src/shared/components/), the emoji module
// (src/shared/emoji/, whose data its modules fetch: emojiData) and the UI's language
// (src/shared/i18n/). Nothing else is served. They are read from src/ (the release's copy of these
// files alone: browser/, paths.mjs browserDirectory).
// A page imports them under the stamp of them all (/__gallery/edit/v/<stamp>/src/<path>: ./stamps.mjs,
// read from the files as the page is served; the release's from its release.json), and the browser
// keeps them for good under it: a page opened again, or another report's, asks for none of them (231
// modules, which no-store had it fetch and compile again on every page). Saving one makes a new stamp,
// so the next page asks for them all again under it, never for one kept from before. A module asked
// for under a stamp that is no longer theirs (a page served a moment before the save) is answered as
// it is now: no page is served under that stamp again. By their path alone (a page served before the
// stamps) they are never kept.
const sourceDirectory = browserDirectory;
const browserModule = /^\/__gallery\/edit\/(v\/[a-f0-9]{16}\/)?src\/((?:shared(?:\/components|\/emoji|\/i18n)?\/|editor\/(?:page|components)(?:\/[a-z]+(?:-[a-z]+)*){0,2}\/(?!files?\.mjs))[a-z]+(?:-[a-z]+)*\.mjs)$/;
const emojiData = /^\/__gallery\/edit\/(?:v\/[a-f0-9]{16}\/)?src\/(shared\/emoji\/data\/[a-z]+(?:-[a-z]+)*\.(json|bin))$/;
/** The folders of the editor's browser modules (the dev server watches them: a module saved is a new stamp, and its pages are told). */
export const browserDirectories = [path.join(sourceDirectory, "editor", "page"), path.join(sourceDirectory, "editor", "components"), path.join(sourceDirectory, "shared")];
/** Whether a file is a browser module the route serves (what a stamp of the editor's modules reads, and what the release build copies). */
export const servedModule = (file) => browserModule.test(`/__gallery/edit/src/${path.relative(sourceDirectory, file).split(path.sep).join("/")}`);
/** Whether a file is of the emoji data the route serves. */
export const servedEmojiData = (file) => emojiData.test(`/__gallery/edit/src/${path.relative(sourceDirectory, file).split(path.sep).join("/")}`);
// The kit is made from its sources and the components' descriptions (the runtime bundles them): the
// source checkout's, which the dev server watches (the release's kit is built once, into the package).
const kitSources = [kitSourceDirectory, path.join(sourceDirectory, "shared", "components")];
/** What the dev server watches besides the workspace (Vite's watcher: ./index.mjs). */
export const sourceWatched = [kitSourceDirectory, ...browserDirectories];

const noStore = { "Cache-Control": "no-store" };
const forGood = { "Cache-Control": "max-age=31536000, immutable" }; // a file named by its stamp: never asked for again
// A page (the workbench, a custom page, a document): never kept, framed by Gallery's own pages alone (FRAMED_BY).
const send = (response, type, body) => serve(response, { type, headers: { ...noStore, ...FRAMED_BY }, body });

/** Whether `request` names this server as the page asks it (Host 127.0.0.1:<port> or localhost:<port>, the port it came in on). */
export function hostAllowed(request) {
  const host = request.headers?.host ?? "";
  const port = request.socket?.localPort;
  return Boolean(port) && (host === `127.0.0.1:${port}` || host === `localhost:${port}`);
}

/**
 * Where a request for the workbench (a GET or HEAD of / or /index.html) by the name localhost is sent:
 * http://127.0.0.1:<port> with its path and query (the browser keeps the fragment), else null. The
 * workbench uses one canonical origin. localhost can resolve to [::1], which another program
 * may own, so requests opened by that name redirect to the service’s IPv4 address.
 */
export function toLoopback(request) {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const port = request.socket?.localPort;
  if (!port || request.headers?.host !== `localhost:${port}`) return null;
  const url = new URL(request.url || "/", "http://localhost");
  return url.pathname === "/" || url.pathname === "/index.html" ? `http://127.0.0.1:${port}${url.pathname}${url.search}` : null;
}

// A block's context.fetch on any page this server serves (the kit's runtime/net.js asks by doc-net-fetch,
// which no other page answers: an export's kit reads what the export embedded instead): the net route
// answers (./net-route.mjs), asked here, so that the kit, which an export carries, names no route of the
// server's. In both live scripts, a document's (edited or presented) and a custom page's.
const netAnswer = `window.addEventListener("doc-net-fetch", (event) => {
        event.preventDefault();
        event.detail.answer(fetch("/__gallery/net", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event.detail.ask) }).then((response) => response.json()));
      });`;
// A page's stream connected again after it was lost (the server restarted, or slept): what the workspace
// holds may have changed meanwhile, unsaid, so each kind of its facts is told as changed (the blocks that
// read one read it again); the first connection tells nothing, the blocks having just read what they show.
const dataAgain = `let lost = false;
      events.onerror = () => { lost = true; };
      events.onopen = () => {
        if (!lost) return;
        lost = false;
        for (const kind of ${JSON.stringify(FACT_KINDS)}) window.dispatchEvent(new CustomEvent("doc-workspace-change", { detail: kind }));
      };`;

// The script removes its own element after starting, so the page's
// "导出当前视图副本" control (view copy) never copies it into an exported file. Messages are
// "report <version>" (this report's source changed; a page already showing that version ignores
// it), "notes <version>" (its 批注 changed: the page reads them again, never reloads for it),
// "changes <stamp>" (the review of the Agent's changes to it started, grew, ended, was kept or
// reverted: the page reads it again, editor/page/changes/),
// "look <word>" (its doc.json or the workspace's gallery.json was written: the look the document shows
// now, its own over the workspace's default, shared/workspace-look.mjs; shared/document-look.mjs
// lookWord, "" for the default, which the page puts on its <html> at once, never reloading: the
// kit's ui.js, doc-look-request),
// "asset <new|now> <file>=<stamp>,…" (a file of its folder written again, as it is now: ./asset-news.mjs, said as
// the page connects too for every file written again while this server ran: the stamps kept in window.__galleryAssets,
// served with the ones the page names its files by, and the files whose stamp moved since told the page as
// doc-files-written, which swaps the addresses it shows them by: editor/page/assets-live.mjs; never a reload),
// "assets" (the shared kit or the editor changed), "components <stamp> <ids>" (the catalog of
// component packages and the packages that changed with it, with commas) or "settings <hidden>
// <disabled> <shown> <consents> <unlisted> <packs off> <listed>" (what gallery.json says of the components, by commas, which goes to the editor and costs
// no page anything: settingsLine; its fourth list, the consents to the net, "<id>@<host>" each, goes to
// the kit, which starts an instance whose consent changed again: runtime/net.js), "data <kind>" (what the
// workspace holds changed, a kind of what a block reads of it, src/workbench/index.mjs: told to the kit as
// doc-workspace-change, which tells the instances that read that kind; never a reload). Any other message
// changes nothing: a page never reloads for a message it does not know (it once did, for any). A page shown
// again costs its reader the undo steps, the selection and
// whatever is open, so a page goes by what changed for it: it hears a package it holds an instance of,
// and no other, a page of that stamp nothing, and the 写作偏好 dialog's page (?solo) none of it, as no
// swap serves it. Said as a page connects too, for one served a moment before a change or by a server
// since stopped, with no ids: any package may have changed then, and a page holding an instance hears
// it. It waits for the page to be read, which holds the instances. A page holding none stays, and the
// editor there reads the new list by itself and keeps which packages it is now behind on
// (doc-catalog-changed, its ids null for any: components/installed/page.mjs and served.mjs). A page the editor runs on is told instead (an event with the
// version): it saves by itself and reloads once nothing waits. A page that does not edit reloads as
// the editor says (__galleryEditReload: in a workbench, a new page is swapped in once drawn), or itself.
const liveReloadScript = (slug, version, stamp, files = {}) => `<script data-doc-dev>
    (() => {
      document.currentScript.remove();
      ${netAnswer}
      const assets = window.__galleryAssets = { stamps: ${JSON.stringify(files)}, moved: {} };
      const solo = new URLSearchParams(location.search).has("solo");
      let catalog = "${stamp}";
      const holds = (ids) => document.querySelector(ids === undefined ? "[${ATTRIBUTE}]" : ids.split(",").map((id) => '[${ATTRIBUTE}="' + id + '"]').join());
      let events = null, connected = false;
      const receive = (event) => {
        const [kind, next, ids, more, consents, unlisted, packs, listed] = event.data.split(" ");
        if (kind === "notes") return void window.dispatchEvent(new CustomEvent("doc-annotations-changed", { detail: { version: next ?? "" } }));
        if (kind === "changes") return void window.dispatchEvent(new CustomEvent("doc-changes-changed", { detail: { stamp: next ?? "" } }));
        if (kind === "look") return void window.dispatchEvent(new CustomEvent("doc-look-request", { detail: { look: Object.fromEntries(new URLSearchParams(next ?? "")), from: "file" } }));
        if (kind === "settings") return void window.dispatchEvent(new CustomEvent("doc-settings-changed", { detail: { hidden: next ? next.split(",") : [], disabled: ids ? ids.split(",") : [], shown: more ? more.split(",") : [], net: consents ? consents.split(",") : [], unlisted: unlisted ? unlisted.split(",") : [], packsOff: packs ? packs.split(",") : [], listed: listed ? listed.split(",") : [] } }));
        if (kind === "data") return void window.dispatchEvent(new CustomEvent("doc-workspace-change", { detail: next ?? "" }));
        if (kind === "asset") {
          const moved = {};
          for (const pair of (ids ?? "").split(",")) {
            const at = pair.lastIndexOf("=");
            const file = pair.slice(0, at), now = pair.slice(at + 1);
            if (at > 0 && now && assets.stamps[file] !== now) moved[file] = assets.stamps[file] = assets.moved[file] = now;
          }
          if (Object.keys(moved).length) window.dispatchEvent(new CustomEvent("doc-files-written", { detail: { files: moved } }));
          return;
        }
        if (kind !== "report" && kind !== "assets" && kind !== "components") return;
        if (kind === "components") {
          if (document.readyState === "loading") return void document.addEventListener("DOMContentLoaded", () => receive(event), { once: true });
          if (solo || next === catalog) return;
          catalog = next;
          if (!holds(ids)) return void window.dispatchEvent(new CustomEvent("doc-catalog-changed", { detail: { ids: ids === undefined ? null : ids.split(",").filter(Boolean) } }));
        }
        if (window.__galleryEditBusy) {
          window.dispatchEvent(new CustomEvent({ report: "doc-source-changed", assets: "doc-assets-changed", components: "doc-components-changed" }[kind], { detail: { version: next ?? null } }));
          return;
        }
        if (kind === "report" && next === "${version}") return;
        if (window.__galleryEditReload) return window.__galleryEditReload(); // in a workbench: swapped in, no reload seen
        location.reload();
      };
      const follow = (active) => {
        if (!active) { events?.close(); events = null; return; }
        if (events) return;
        events = new EventSource("${eventsRoute}?slug=${slug}" + (connected ? "&resume=1" : ""));
        connected = true;
        ${dataAgain}
        events.onmessage = receive;
      };
      // Mounted hidden editors keep drafts, but must not consume an HTTP connection each.
      window.addEventListener("doc-live-active", event => follow(event.detail !== false));
      follow(window.frameElement?.dataset.liveActive !== "false");
      window.addEventListener("pagehide", () => follow(false), { once: true });
    })();
  </script>`;

// A custom page's live script: it listens on ?page=<slug> and shows the page again,
// through the workbench when it is in one (__galleryEditReload: custom-page.mjs, a new page swapped in
// once drawn), else itself, on "page <version>" when that is not the version it was served (page.html
// or page.json changed), on "assets" (the kit changed), on "asset <file>=<stamp>" (a file of its own assets/
// written again, whole and quiet: ./asset-news.mjs; a page loaded anew asks for its pictures again, and is sent
// the new bytes: media-route.mjs) and on "components <stamp> <ids>" when it holds
// an instance of a package that changed (one said with no ids: of any), as a document's page does, the
// instances held in a template counted (a card of a block turned off, or of documents alone, which then
// runs once it is turned on again or its places take page: shared/page-cards.mjs servedPage);
// "settings" is told to its scripts (doc-settings-changed: its six lists, the consents to the net among
// them, which the kit's net.js starts an instance again by), and "data <kind>" (what the workspace holds
// changed: src/workbench/index.mjs) to the kit as doc-workspace-change, which tells the blocks that read
// that kind. Any other message changes nothing: a page never reloads for what it does not know. A page whose board edits
// (src/editor/page/board/: __galleryPageChanged) is handed a "page" message instead: what its own writes
// made is no change of someone else's, and it shows the page again once nothing of it waits.
const pageReloadScript = (slug, version, stamp) => `<script>
    (() => {
      document.currentScript.remove();
      ${netAnswer}
      let catalog = "${stamp}";
      const holds = (ids) => {
        const named = ids === undefined ? "[${ATTRIBUTE}]" : ids.split(",").filter(Boolean).map((id) => '[${ATTRIBUTE}="' + id + '"]').join() || ":not(*)";
        return Boolean(document.querySelector(named)) || [...document.querySelectorAll("template[data-ge-held]")].some((held) => held.content.querySelector(named));
      };
      const again = () => (window.__galleryEditReload ? window.__galleryEditReload() : location.reload());
      const events = new EventSource("${eventsRoute}?page=${slug}");
      ${dataAgain}
      events.onmessage = (event) => {
        const [kind, next, ids, more, consents, unlisted, packs, listed] = event.data.split(" ");
        if (kind === "page") return void (window.__galleryPageChanged ? window.__galleryPageChanged(next) : next !== "${version}" && again());
        if (kind === "assets" || kind === "asset") return void again();
        if (kind === "settings") return void window.dispatchEvent(new CustomEvent("doc-settings-changed", { detail: { hidden: next ? next.split(",") : [], disabled: ids ? ids.split(",") : [], shown: more ? more.split(",") : [], net: consents ? consents.split(",") : [], unlisted: unlisted ? unlisted.split(",") : [], packsOff: packs ? packs.split(",") : [], listed: listed ? listed.split(",") : [] } }));
        if (kind === "data") return void window.dispatchEvent(new CustomEvent("doc-workspace-change", { detail: next ?? "" }));
        if (kind !== "components") return;
        if (document.readyState === "loading") return void document.addEventListener("DOMContentLoaded", () => events.onmessage(event), { once: true });
        if (next === catalog) return;
        catalog = next;
        if (holds(ids)) again();
      };
    })();
  </script>`;

// 历史版本's view of a recent version (/generated/<slug>.html?present&version=<id>&key=<key>: versionPage),
// first in its head, before the kit's tags: the page as a reader sees it (?present's: no editor, no check
// notes, no display button), frozen. No live script: it hears nothing of the file (a version never
// changes) nor of the workspace; a block's context.fetch is answered as on any page this server serves
// (netAnswer). Nothing the page does stays: the browser's storage is read as it is, but what the page
// writes there stays in its memory (the kit's state.js: a tab chosen or a section folded on an old
// version is no reading state of the document's); a link goes nowhere but a web page of another site,
// which opens in a tab of its own (a document's would bring its page, the editor on it, into the
// dialog), and a block's workspace.open is taken, nothing done; an anchor, a download stay the kit's
// and the browser's. Its blocks' context.edit, a table view's changes and workspace.setTodo write
// nothing either: no editor says the page takes edits, or answers them (the kit's kernel.js, workspace.js).
const versionScript = `<script data-doc-dev>
    (() => {
      document.currentScript.remove();
      ${netAnswer}
      let stored = null;
      try { stored = window.localStorage; } catch {}
      const own = new Map();
      const read = (key) => {
        if (own.has(key)) return own.get(key);
        try { return stored ? stored.getItem(key) : null; } catch { return null; }
      };
      const keys = () => {
        let all = [];
        try { all = stored ? Object.keys(stored) : []; } catch {}
        return [...new Set([...all, ...own.keys()])].filter((key) => read(key) !== null);
      };
      const memory = {
        getItem: (key) => read(String(key)),
        setItem: (key, value) => void own.set(String(key), String(value)),
        removeItem: (key) => void own.set(String(key), null),
        clear: () => keys().forEach((key) => own.set(key, null)),
        key: (index) => keys()[index] ?? null,
        get length() { return keys().length; },
      };
      try { Object.defineProperty(window, "localStorage", { value: memory, configurable: true }); } catch {}
      addEventListener("${OPEN_EVENT}", (event) => event.preventDefault());
      document.addEventListener("click", (event) => {
        if (event.defaultPrevented || event.button !== 0) return;
        const link = event.target.closest?.("a[href], a[*|href]");
        const href = link?.getAttribute("href") ?? link?.getAttribute("xlink:href") ?? "";
        if (!link || href.startsWith("#") || link.hasAttribute("download")) return;
        event.preventDefault();
        let address = null;
        try { address = new URL(href, location.href); } catch {}
        if (address && /^https?:$/.test(address.protocol) && address.origin !== location.origin) window.open(address.href, "_blank", "noopener,noreferrer");
      });
    })();
  </script>`;

/**
 * What a change at `file` is to the preview (`root`: the workspace): { slug, name } for a file of a
 * document's folder (`name` the file's name when it is right in it, else null: a picture, a folder),
 * the 写作偏好 page's in .gallery/pages/<slug>/ too, with `packages` when it is under components/,
 * which can be either a document's or a package's (the catalog is then looked at, and what changed
 * nothing there changes nothing); { page, name } for a file of a custom page's folder, pages/<slug>/ (`name`
 * as a document's: page.html, page.json…; null for the folder itself, or what is deeper), pages/ being a
 * document's folder too when one of that name was made before them (its files, assets/ and materials/,
 * which no page's slug is: shared/pages.mjs); { extension, name } for a file of an extension's folder,
 * extensions/<id>/ (as a page's: sidebar.json is the one the sidebar reads; `columns` too for what is in its columns/,
 * the columns its program writes), extensions/ being a document's
 * folder too when one of that name was made before them; { slug: null, name, packages } for gallery.json, the catalog's
 * too, and no document's; null for anything else: what Gallery keeps of its own (.gallery/: the edit
 * state, history, qa, logs… written on every commit), exports/, a dot name (a write's temp file:
 * shared/files.mjs writeAtomic), a path outside the workspace.
 */
export function changeOf(root, file) {
  const parts = path.relative(root, file).split(path.sep);
  if (parts[0] === ".." || path.isAbsolute(parts[0]) || parts[0] === "") return null;
  if (parts.length === 1 && parts[0] === WORKSPACE_FILE) return { slug: null, name: WORKSPACE_FILE, packages: true };
  const fold = (name) => (process.platform === "win32" ? name.toLowerCase() : name);
  if (fold(parts[0]) === EXTENSIONS_FOLDER && parts.length >= 2 && isExtensionId(parts[1]) && !DOCUMENT_FOLDERS.includes(parts[1])) {
    const rest = parts.slice(2);
    if (rest.some((part) => part.startsWith("."))) return null;
    // Its columns/ (the folder, a column's file): what its program writes for the sidebar, no change of the extension's.
    return { extension: parts[1], name: rest.length === 1 ? rest[0] : null, ...(rest.length >= 1 && fold(rest[0]) === COLUMNS_FOLDER ? { columns: true } : {}) };
  }
  if (fold(parts[0]) === PAGES_FOLDER && parts.length >= 2 && isSlugName(parts[1]) && !DOCUMENT_FOLDERS.includes(parts[1])) {
    const rest = parts.slice(2);
    return rest.some((part) => part.startsWith(".")) ? null : { page: parts[1], name: rest.length === 1 ? rest[0] : null };
  }
  const inPage = parts[0] === ".gallery" && parts[1] === "pages" && parts.length >= 3;
  const [slug, ...rest] = inPage ? parts.slice(2) : parts;
  const packages = !inPage && fold(slug) === COMPONENTS_FOLDER;
  if (!(packages || slugPattern.test(slug)) || slug === "exports" || rest.some((part) => part.startsWith("."))) return null;
  return { slug: packages ? COMPONENTS_FOLDER : slug, name: rest.length === 1 ? rest[0] : null, ...(packages ? { packages } : {}) };
}

/**
 * The watcher's paths to leave alone in workspace `root` (Vite's server.watch.ignored: src/vite.config.ts;
 * ./watch.mjs): .gallery/ but its pages/, exports/, and what an extension's folder holds that is a
 * program's own (node_modules, .git: the extension's server may keep its code there); every other change
 * is the handler's to judge (changeOf).
 */
export function ignoredIn(root) {
  const fold = (file) => (process.platform === "win32" ? path.resolve(file).toLowerCase() : path.resolve(file));
  const { gallery, preferencesPage: pages, exports, extensions } = layoutOf(root);
  const [own, page, delivered, provided] = [fold(gallery), fold(pages), fold(exports), fold(extensions)];
  const under = (file, folder) => file === folder || file.startsWith(folder + path.sep);
  return (file) => {
    const at = fold(file);
    if (under(at, provided) && at !== provided && at.slice(provided.length + 1).split(path.sep).some((part, index) => index > 0 && (part === "node_modules" || part === ".git"))) return true;
    return (under(at, own) && at !== own && !under(at, page)) || under(at, delivered);
  };
}

// Where a block's context.workspace reads the workspace, said to the kit by a page this server serves (a
// document's and a custom page's alike, presented too), in a script of the server's (data-doc-dev): no
// export or copy of the view holds it, so that the kit there says the workspace is offline, and the kit's
// own files name no address of the server's (render/kit/runtime/workspace.js).
const workspaceScript = `<script data-doc-dev>document.currentScript.remove(); globalThis.${WORKSPACE_GLOBAL} = ${JSON.stringify(QUERY_ROUTE)};</script>`;
// A file or a link dragged in and let go where the page does not take it: never opened in a tab of its own
// (shared/drop-guard.mjs), on a document's page however it is shown (edited, presented, a version) and on a
// custom page; the editor's own drops come first (editor/page/drop-in/).
const dropGuardScript = `<script data-doc-dev>document.currentScript.remove(); (${guardDrops})(window);</script>`;

const insertBefore = (html, tag, snippet) => new RegExp(`</${tag}>`, "i").test(html)
  ? html.replace(new RegExp(`</${tag}>`, "i"), () => `  ${snippet}\n</${tag}>`)
  : `${html}\n${snippet}`;
// First in the head, before the page's own tags (the kit's among them).
const insertFirst = (html, snippet) => /<head\b[^>]*>/i.test(html)
  ? html.replace(/<head\b[^>]*>/i, (tag) => `${tag}\n  ${snippet}`)
  : `${snippet}\n${html}`;
// A presented page's display button hidden (the kit's ui.js: a reader's view has the workbench's controls).
const presentStyle = "<style data-doc-present>.doc-display { display: none !important; }</style>";

/**
 * Document routes for one storage directory, hosted by createProjects in the shared service:
 *   handle(request, response, next)  answers a request, or passes it to `next` (the host's: Vite, or
 *                                    the release's static files; next(error) for a failure)
 *   changed(event, file)             a file of the workspace (or, in the source checkout, of the kit or
 *                                    the editor) changed: chokidar's events (add, change, unlink, addDir,
 *                                    unlinkDir), or "reset" when the watcher could not say which (./watch.mjs)
 *   listening(port)                  the server listens: the home announces it in <data>/server.json
 *   close()                          the announcement taken away, the uploads' folder removed (the server closed)
 * `stateDirectory`: the edit service's (.gallery/state/); `logger`: { info, warn, error } (Vite's);
 * `kind`: "cli" (one a gallery command started, which gallery stop stops) or "dev" (npm run dev's,
 * stopped where it runs); `workbenchPage(url, request)`: the workbench's HTML (Vite's, its modules
 * transformed), or none: / is then the host's; `closeServer()`: the host's HTTP server closed, every
 * connection with it, for POST /__gallery/workspace/stop, after which the process ends (`exit`).
 * `onUpdated(key)`: a page of this storage directory someone else wrote (./updates.mjs), for a runtime the
 * workbench does not listen to (createProjects: the home's stream tells it); none: told this one's own stream.
 */
export function createRoutes({
  token = null, unified = false, base = "", reportsDirectory = defaultReportsDirectory, stateDirectory = layoutOf(reportsDirectory).state, projects = undefined, onWorkspaceChange = () => {}, announceServer = true, logger = console, kind = "dev", workbenchPage = null, presence = undefined,
  closeServer = async () => {}, exit = () => process.exit(0), onUpdated = null,
} = {}) {
  const listeners = new Set();
  const tellExtension = id => { for (const listener of listeners) if (listener.workspace) listener.response.write(`data: extensions ${id}\n\n`); };
  if (!base) extensionEvents.on("change", tellExtension);
  // A report's own change goes to its pages with the source's version; a shared change (no
  // slug) to every page.
  const notify = (slug, version = "", what = "report") => {
    for (const listener of listeners) {
      if (!slug || listener.slug === slug) listener.response.write(`data: ${slug ? `${what} ${version}` : "assets"}\n\n`);
    }
  };
  // A custom page's pages told its version (?page=<slug>: "page <version>").
  const notifyPage = (page, version) => {
    for (const listener of listeners) if (listener.page === page) listener.response.write(`data: page ${version}\n\n`);
  };
  // The workspace's list changed (the outline written, a document or a custom page made or gone, a
  // doc.json's or a page.json's title, icon or description): the workbench's stream (?workspace) is
  // told, once for a burst of them (gallery new --under makes the folder, its files, then places it),
  // and reads the list again. No page hears it: a page's script takes a message it does not know for a
  // change of its own. Other storage runtimes invalidate this list directly in the same process.
  const tellWorkspace = () => {
    debounce("workspace", () => {
      for (const listener of listeners) if (listener.workspace) listener.response.write(`data: workspace ${Date.now()}\n\n`);
    });
  };
  const workspaceChanged = () => { tellWorkspace(); onWorkspaceChange(reportsDirectory); };
  // A page someone else wrote (./updates.mjs: an Agent's write of a document's doc.html or of a custom page's
  // page.html, never the reader's own): the workbench's stream (?workspace) is told "updated <key>", the key
  // as the sidebar names it (a document's slug; ~ws-<id>/<slug> for a document of another workspace, whose
  // runtime hands it to the home's: onUpdated; @<slug> for a custom page), once a write as the preview takes
  // it (the announcement's look: never half written, after its quiet moment); the workbench marks its row
  // (docs/workbench.md "Updated elsewhere"). No page hears it.
  const tellUpdated = (key) => {
    for (const listener of listeners) if (listener.workspace) listener.response.write(`data: updated ${key}\n\n`);
  };
  const updates = createUpdates((name) => (onUpdated ?? tellUpdated)(name.startsWith("@") || !base ? name : `${base.slice(1)}/${name}`));
  // The custom pages the sidebar shows are the default workspace's (the page service's root): this one's own pages
  // are told when it is that workspace.
  const pagesHere = sameDirectory(reportsDirectory, defaultWorkspace());
  // A commit's file keeps the kit tags its blocks need (a Sheet area made on the page: sheets.js), as
  // does a report's natural HTML made the kit's (the page shows it so, an export writes it so). What a
  // reader's first edit wrote of an Agent's natural HTML as the kit's markup goes to the server's log.
  // A review of the Agent's changes to a report that started, grew, ended, was kept or reverted: its pages read it again.
  const changesTold = (slug) => notify(slug, String(Date.now()), "changes");
  const edits = createEditService({ base, token, reportsDirectory, stateDirectory, finish: withNeededKitTags, log: (text) => logger.info?.(`[gallery] ${text}`), onChanges: changesTold });
  const create = (slug, title, description, { lang = null, page = false } = {}) => createReportFromStarter(slug, title, description, { directory: reportsDirectory, blank: true, lang, page }); // `page`: the 写作偏好 page, in .gallery/pages/
  // The workspace's facts (src/workbench/index.mjs): what a block reads of the workspace (workspace.query),
  // the search's lines and the menus' counts, each document read as its pages are served it (readOf: never
  // a file held half written) and again as the server takes its file (announce, below), and the record of edits (src/workbench/activity.mjs: .gallery/state/activity.json,
  // beside the edit state), caught up as the server starts with what was written while none ran. What
  // changed is told every page ("data <kind>", once for a burst: tellData).
  const activity = stateDirectory ? createActivity({ file: path.join(stateDirectory, "activity.json") }) : null;
  const facts = createIndex({
    root: reportsDirectory, read: readOf(edits), activity,
    draw: (html, slug) => drawPageChips(html, { slug, mode: "words", reportsDirectory }),
  });
  const toTell = new Set();
  const tellData = (kinds) => {
    for (const kind of kinds) toTell.add(kind);
    if (toTell.size === 0) return;
    debounce("data", () => {
      const told = [...toTell];
      toTell.clear();
      for (const listener of listeners) if (listener.slug || listener.page) for (const kind of told) listener.response.write(`data: data ${kind}\n\n`);
    });
  };
  // A document of the workspace (at its root): neither the 写作偏好 page nor a scratch copy of gallery block try.
  const ofTheWorkspace = (slug) => path.resolve(path.dirname(documentDirectory(slug, reportsDirectory))) === path.resolve(reportsDirectory);
  let forget = null; // the announcement taken away (preview-server.mjs), once it was written
  let stopping = null;
  const sandbox = process.env.GALLERY_SANDBOX;
  // POST /__gallery/workspace/stop's end, once its answer is sent: the pages' event streams ended (an open
  // one would hold the server open for good), the server closed, the uploads' folder removed, the process gone (within 3 s,
  // whatever still holds it).
  const stop = () => (stopping ??= (async () => {
    for (const listener of listeners) listener.response.end();
    listeners.clear();
    const closing = closeServer().catch(() => {});
    if (sandbox) await closing;
    else await Promise.race([closing, new Promise((resolve) => setTimeout(resolve, 3000))]);
    await activity?.close();
    await forget?.().catch(() => {});
    await transfer.close();
    exit();
  })());
  const workspace = createWorkspaceService({
    reportsDirectory, projects, unified, presence,
    server: { kind, version: galleryVersion, stop, sandbox },
    edits,
    reports: {
      create,
      // An export (in the queue: the workspace's commands run in it), as gallery export does it, the
      // hand-in first and gallery qa's baseline kept (./export.mjs).
      export: (slug) => exportOffline(edits, slug, { root: reportsDirectory, workspace: (doc) => facts.snapshot(doc) }),
      words: (html, slug) => drawPageChips(html, { slug, mode: "words", reportsDirectory }),
    },
    components: createComponentSettings({ root: defaultWorkspace(), taken: () => catalog.taken() }),
    changed: workspaceChanged,
    index: facts,
    // A web link's frame check, its add dialog's title (the page alone: no picture downloaded) and the site's icon it keeps.
    web: { frameable, title: pageTitle, icon: (url) => siteIcon(url) },
  });
  // Its offline files embed what their blocks read of the workspace too (the facts' snapshot).
  const transfer = createTransferService({ edits, workspace, reports: { create }, reportsDirectory, offline: (options) => offlineReports({ ...options, directory: reportsDirectory, workspace: (doc) => facts.snapshot(doc), pictures: encodePictures, carry: (input) => carriedExport({ ...input, readings: (source, said) => runJob("readings", { source, ...said }) }) }) });
  // A custom block's fetches (./net-route.mjs), the scenarios' to this computer alone (GALLERY_TEST_NET).
  const netRoute = createNetRoute({
    root: defaultWorkspace(),
    hop: process.env.GALLERY_TEST_NET ? localHop(Number(process.env.GALLERY_TEST_NET)) : null,
    log: (text) => logger.info?.(`[gallery] ${text}`),
  });
  // A custom page's own writes (src/editor/page-service.mjs), in the queue of the edit service's; a block
  // of Gallery's own it put into components/ taken by the catalog at once, its pages told; the parts its
  // edits answer with as the page shows them, its own files where this server serves them (withPageAssets),
  // so that the page's undo puts back a picture that loads.
  const pagesService = createPageService({
    root: defaultWorkspace(), edits, stateDirectory: layoutOf(defaultWorkspace()).state, catalogTaken: () => catalog.taken(),
    log: (text) => logger.info?.(`[gallery] ${text}`), shown: (html, slug) => projectHtml(withPageAssets(html, slug), base),
  });

  // The page of a report's text: { html, whole } (whole: made as it should be; one whose editor
  // or checks failed is not kept, so that the log says it again on the next request). `editorModule`:
  // where it imports the editor from, `kit(asset)`: where it loads the kit's files from (./stamps.mjs).
  // `version`: the text is a recent version's, shown as presented but frozen (versionScript).
  const render = (slug, source, { present = false, version = false, editorModule, kit } = {}) => {
    if (version) present = true;
    let html = source;
    let editor = "";
    let editorHead = "";
    let whole = true;
    try {
      if (!present) ({ html, snippet: editor, head: editorHead } = edits.preview(slug, source, { editor: editorModule, kitTags: (ids) => assetTags(ids, kit) }));
    } catch (error) {
      whole = false;
      logger.warn(`[gallery] text editing unavailable for ${slug}: ${error.message}`);
    }
    // The page as a build writes it (render/report-html.mjs), its pictures served from the report's folder:
    // the reader's display settings (kit ui.js), which no source writes, are in, so the theme the workbench
    // asks for and its view copy go through them (the editor hides their button), and the page's icon is an
    // image from the start, never the system's emoji first.
    ({ html } = renderReportHtml(html, { slug, mode: "preview", reportsDirectory, kit }));
    // Its live script told the stamps the page names its folder's files by (render/media-ref.mjs servedStamps:
    // read off the page as rendered, no file looked at again).
    if (!version) html = insertBefore(html, "head", liveReloadScript(slug, hashOf(source), currentCatalog().stamp, servedStamps(html, slug)));
    // The UI's language on the root (data-ge-language), edited or presented, before the kit draws
    // its chrome: its own words follow it (src/render/kit/words.js); no export carries it.
    html = insertBefore(html, "head", `<script data-doc-dev>${languageScript()}</script>`);
    html = insertBefore(html, "head", workspaceScript);
    html = insertBefore(html, "head", dropGuardScript);
    if (editorHead) html = insertBefore(html, "head", editorHead);
    if (version) return { html: insertFirst(insertBefore(html, "head", presentStyle), versionScript), whole };
    if (present) return { html: insertBefore(html, "head", `${presentStyle}\n  <script type="module" src="/__gallery/edit/src/editor/page/present-links.mjs" data-doc-dev></script>`), whole };
    // The fast checks' failures, as a note in the page (render/preview-checks.mjs).
    let checks = "";
    try {
      checks = checkPanel(slug, source, {}, { directory: documentDirectory(slug, reportsDirectory) });
    } catch (error) {
      whole = false;
      logger.warn(`[gallery] checks unavailable for ${slug}: ${error.message}`);
    }
    if (checks) html = insertBefore(html, "body", checks);
    return { html: editor ? insertBefore(html, "body", editor) : html, whole };
  };

  // A report's page as it is served: the one kept for its text and key (./page-cache.mjs), else
  // made and kept. Its key is what else makes it (./stamps.mjs, each read now from the files, or the
  // release's): the editor's modules (its import names their stamp), each kit file (its tag does), the
  // report's folder (its pictures, files and frames, and the checks of them), and the catalog of
  // component packages, as the server holds it (./catalog-watch.mjs). A page served from the cache still
  // keeps its version as the merge base of its commits (edits.opened), as preview() does.
  const pages = createPageCache();
  const modules = createFileList(browserDirectories, servedModule);
  const folderOf = (slug) => {
    const folder = documentDirectory(slug, reportsDirectory);
    return [folder, path.join(folder, "assets")];
  };
  const editorStamp = () => packageStamps?.editor ?? modules.files().then(stampOf);
  const kitStamp = (asset) => packageStamps?.kit?.[asset.id] ?? stampOf([publicFileOf(asset)]);
  const page = async (slug, text, { present }) => {
    const [editor, kit, folder] = await Promise.all([
      present ? "" : editorStamp(),
      Promise.all(ASSETS.map(kitStamp)),
      stampOf(folderOf(slug)),
    ]);
    // The look it shows too (its doc.json's and gallery.json's, each of which clears what is kept as it changes, but a page asked for before the watcher hears of it is not made of the old).
    const key = [present ? "present" : editor, ...kit, folder, currentCatalog().stamp, `look:${lookWord(documentLook(slug, reportsDirectory))}`].join(" ");
    const known = pages.get(slug, key, text);
    if (known !== null) {
      if (!present) edits.opened(text);
      return known;
    }
    const stamps = new Map(ASSETS.map((asset, index) => [asset, kit[index]]));
    const editorModule = present ? undefined : `/__gallery/edit/v/${editor}/src/editor/page/editor.mjs`;
    const { html, whole } = render(slug, text, { present, editorModule, kit: (asset) => `${publicPathOf(asset)}?v=${stamps.get(asset)}` });
    // This cache belongs to one storage runtime: keep its final owner-qualified HTML,
    // rather than parsing and rewriting the same page on every return visit.
    const shown = projectHtml(html, base);
    if (whole) pages.set(slug, key, text, shown);
    return shown;
  };

  // 历史版本's view of a version of report `slug` (`text`: as its pages see it, editor/service.mjs
  // versionShown): rendered as a presented page is, frozen (render's `version`), its kit's tags named by
  // their stamps as a document's are. Made each time it is asked for, and kept by nothing: the dialog asks
  // for a version once as it is selected, and a page cached for it would push a document's out. `marked`: the
  // text has what the version changed of the one before it marked in it (source/changes.mjs markedVersion),
  // drawn by a module of the editor's under its stamp (editor/page/changes/version.mjs: the Agent's changes'
  // look, from modules a document's page has loaded already), unless the address says marks=off.
  const versionPage = async (slug, text, { marked = false } = {}) => {
    const [kit, editor] = await Promise.all([Promise.all(ASSETS.map(kitStamp)), marked ? editorStamp() : ""]);
    const stamps = new Map(ASSETS.map((asset, index) => [asset, kit[index]]));
    let { html } = render(slug, text, { version: true, kit: (asset) => `${publicPathOf(asset)}?v=${stamps.get(asset)}` });
    if (marked) html = insertBefore(html, "head", `<script type="module" src="/__gallery/edit/v/${editor}/src/editor/page/changes/version.mjs" data-doc-dev></script>`);
    return projectHtml(html, base);
  };

  // A custom page as it is served (render/page-html.mjs), or null when it is not there: its tags named
  // by their stamps as a document's are, the live script told the version it was served at (page.html
  // and page.json as read now), the UI's language on its root, and the workbench's session, a module of
  // the editor's served under their stamp (src/editor/page/custom-page.mjs). Rendered on every request:
  // a page is one file, and read whole.
  // Its cards are served with their ids and bases, and what each card's block is (servedPage: its fit,
  // whether it is bare, whether it runs on a page); the page map then says the page's board editing its
  // token, its version and its blocks (blockOn), as a document's map does its editor; on a page whose
  // page.json says `hint` (the default home page's), until the reader closed it once for the workspace,
  // `hint`: its first-open note is shown; on one whose page.json says `defaultCards`, `defaults` (恢复默认卡片
  // runs there) and `news`, the default cards it was made before and does not hold, until the reader was
  // told of them; and on a blank page (shared/pages.mjs isBlankPage: the workbench's 新建页面, no one has
  // written it yet), `blank`: its middle says an Agent writes it.
  const customPage = async (slug) => {
    const files = pageFiles(slug, reportsDirectory);
    const [text, meta] = await Promise.all([fs.readFile(files.html, "utf8").catch(() => null), fs.readFile(files.json, "utf8").catch(() => "")]);
    if (text === null) return null;
    const [editor, kit] = await Promise.all([editorStamp(), Promise.all(ASSETS.map(kitStamp))]);
    const stamps = new Map(ASSETS.map((asset, index) => [asset, kit[index]]));
    const held = currentCatalog();
    const version = pageVersion(text, meta);
    const shown = servedPage(text, { blockOf: (id) => blockOn(held, id) });
    const blocks = Object.fromEntries([...new Set(readPage(text).cards.map(({ block }) => block).filter(Boolean))].map((id) => [id, blockOn(held, id)]));
    let { html } = renderPageHtml(shown, { reportsDirectory, slug, kit: (asset) => `${publicPathOf(asset)}?v=${stamps.get(asset)}` });
    const own = pageMetaNow(slug, reportsDirectory);
    const hint = pageHintShown(slug, reportsDirectory);
    const defaults = own?.defaultCards === true;
    const blank = isBlankPage(text);
    // The default cards came after this home page was made and it does not hold (shared/pages.mjs
    // homeCardsNew), each with its name, for its note of them (src/editor/page/board/hint.mjs showNews).
    const named = (id) => held.packages.get(id)?.name ?? shippedBlocks().find((block) => block.id === id)?.title ?? null;
    const news = defaults ? homeCardsNew(reportsDirectory, readPage(text).cards.map(({ block }) => block)).map((block) => ({ block, name: named(block) })) : [];
    const map = JSON.stringify({ slug, title: own?.title ?? slug, token: edits.token, version, blocks, ...(hint ? { hint } : {}), ...(defaults ? { defaults } : {}), ...(news.length ? { news } : {}), ...(blank ? { blank } : {}) }).replace(/</g, "\\u003c");
    html = insertBefore(html, "head", `<script type="application/json" data-ge-page data-doc-dev>${map}</script>`);
    html = insertBefore(html, "head", pageReloadScript(slug, version, held.stamp));
    html = insertBefore(html, "head", `<script data-doc-dev>${languageScript()}</script>`);
    html = insertBefore(html, "head", workspaceScript);
    html = insertBefore(html, "head", dropGuardScript);
    return insertBefore(html, "head", `<script type="module" src="/__gallery/edit/v/${editor}/src/editor/page/custom-page.mjs" data-doc-dev></script>`);
  };

  // The frame of the sidebar's icon picker (src/shared/icon-picker.mjs): an empty page, transparent, that loads
  // the editor's picker under the modules' stamp (src/editor/page/icon-frame.mjs) and is told what to open by
  // the workbench, which lays it over its window; it holds nothing of a document's, and no token (the
  // workbench hands its own with each `open`).
  const iconPickerPage = async () => `<!doctype html><html><head><meta charset="utf-8"><title>Gallery</title>
<style>html, body { margin: 0; height: 100%; background: transparent; overflow: hidden; }</style>
<script data-doc-dev>${languageScript()}</script>
<script type="module" src="/__gallery/edit/v/${await editorStamp()}/src/editor/page/icon-frame.mjs"></script>
</head><body></body></html>`;

  async function handle(request, response, next) {
    try {
      if (!hostAllowed(request)) return sendJson(response, 403, { ok: false, reason: "host" });
      const loopback = toLoopback(request);
      if (loopback) return serve(response, { status: 302, headers: { Location: loopback, ...noStore } });
      const url = new URL(request.url || "/", "http://localhost");
      const pathname = decodeURI(url.pathname);
      if (pathname === eventsRoute) {
        response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
        response.write("retry: 3000\n\n");
        const listener = { slug: url.searchParams.get("slug"), page: url.searchParams.get("page"), workspace: url.searchParams.has("workspace"), response };
        listeners.add(listener);
        const { stamp, settings } = currentCatalog();
        response.write(`data: components ${stamp}\n\n`);
        response.write(`data: ${settingsLine(settings)}\n\n`);
        request.on("close", () => listeners.delete(listener));
        // A document's page is told the stamps of its folder's files that were written again while this server ran,
        // as told last ("asset now <file>=<stamp>,…": ./asset-news.mjs told): one served a moment before such a write
        // (from what was kept of it), or hidden while it came, swaps what it shows of it; one that shows them all as
        // they are does nothing (editor/page/assets-live.mjs). No file is looked at for it.
        if (slugPattern.test(listener.slug ?? "")) {
          const stamps = Object.entries(assetNews.told(listener.slug));
          if (stamps.length) response.write(`data: asset now ${stamps.map(([name, stamp]) => `${name}=${stamp}`).join(",")}\n\n`);
        }
        // A hidden editor reconnects with its current version, so missed writes are reconciled.
        if (url.searchParams.has("resume") && slugPattern.test(listener.slug ?? "")) {
          const current = await edits.readTaken(listener.slug, { wait: 0 }).catch(() => null);
          if (current && !response.destroyed) response.write(`data: report ${current.version}\n\n`);
        }
        return;
      }
      if (pathname === "/__gallery/net") return netRoute.handle(request, response);
      if (pathname === "/__gallery/edit/commit") return edits.commit(request, response);
      if (pathname === "/__gallery/edit/reverted") return edits.reverted(request, response);
      if (pathname === "/__gallery/edit/hand-in") return edits.handInRequest(request, response);
      if (pathname === "/__gallery/edit/settle") return edits.settleRequest(request, response);
      if (pathname === "/__gallery/edit/upload") return edits.upload(request, response);
      if (pathname === "/__gallery/edit/unfurl") return edits.unfurl(request, response);
      if (pathname === "/__gallery/edit/emoji-library") {
        if (request.method === "POST") return edits.addEmoji(request, response);
        const [status, body] = await edits.listEmojis();
        return sendJson(response, status, body);
      }
      // A page icon as one image, by its value (the workbench's tree and menus): an emoji's, a glyph's and an
      // icon's never changing, so a refresh draws it from the cache at once; a picture of the document's
      // folder (assets/<file>) may be written again under its name: asked for again each time, its stamp its
      // tag, and answered 304 while it did not change (media-route.mjs serveStamped), so a refresh sends it
      // again only once it changed.
      if (pathname === "/__gallery/edit/icon") {
        const value = url.searchParams.get("value") ?? "";
        const slug = url.searchParams.get("slug");
        if (imageFile(value)) return serveStamped(request, response, slugPattern.test(slug ?? "") ? path.join(documentDirectory(slug, reportsDirectory), value) : null, { "Content-Type": mediaTypeOf(value), "Cache-Control": "no-cache" });
        const image = iconImage({ value, slug, tab: url.searchParams.has("tab"), reportsDirectory });
        return serveFound(response, image?.body, { type: image?.type, headers: { "Cache-Control": "max-age=31536000, immutable" } });
      }
      if (pathname === ICON_PICKER_ROUTE && request.method === "GET") return send(response, "text/html; charset=utf-8", await iconPickerPage());
      // A file of a report's folder: a picture, a file block's file, an embed block's file (media-route.mjs).
      if (await serveMedia(pathname, response, { reportsDirectory, request })) return;
      // A file of a custom page's own assets/ (media-route.mjs): a picture its page or a card shows.
      if (await servePageAsset(pathname, response, { reportsDirectory, request })) return;
      // A file of a component package.
      if (await serveComponentFile(pathname, url.searchParams.get("v"), response, { root: defaultWorkspace() })) return;
      // A custom emoji's image of the workspace's library.
      const libraryFile = pathname.match(/^\/__gallery\/edit\/emoji-library\/([^/]+)$/)?.[1];
      if (libraryFile) {
        const image = await edits.readEmoji(libraryFile);
        return serveFound(response, image?.body, { type: image?.type, headers: { "Cache-Control": "no-cache" } });
      }
      if (pathname === "/__gallery/edit/frameable") return edits.frameable(request, response);
      if (pathname === "/__gallery/edit/annotations") return edits.annotations(request, response);
      if (pathname === "/__gallery/edit/changes") return edits.changes(request, response);
      if (pathname === "/__gallery/edit/history") return edits.history(request, response);
      const transferCommand = pathname.match(/^\/__gallery\/transfer\/([a-z]+)$/)?.[1];
      if (transferCommand) return transfer.handle(request, response, transferCommand);
      const [, pageSlug, pageWhat] = pathname.match(pageServiceRoute) ?? [];
      if (pageSlug) return pagesService.handle(request, response, pageSlug, pageWhat);
      const command = pathname.match(/^\/__gallery\/workspace\/([a-z]+(?:-[a-z]+)*)$/)?.[1]; // link-set: words joined by a hyphen
      if (command) return workspace.handle(request, response, command);
      const [, stamped, editorFile] = pathname.match(browserModule) ?? [];
      if (editorFile) {
        const body = await fs.readFile(path.join(sourceDirectory, editorFile), "utf8").catch(() => null);
        return serveFound(response, body, { type: "text/javascript; charset=utf-8", headers: stamped ? forGood : noStore });
      }
      // A kit's or a vendor's file named by its stamp (?v=<stamp>: the tags the preview puts in a
      // page, ./stamps.mjs), kept by the browser for good, as the editor's modules are; a page's
      // blocking tags then wait for no answer. By its path alone it is the host's (Vite's public/, the
      // release's kit/ and vendor/: ./static.mjs), asked again each time.
      const kitAsset = url.searchParams.has("v") && ASSETS.find((asset) => publicPathOf(asset) === pathname);
      if (kitAsset) {
        const body = await fs.readFile(publicFileOf(kitAsset)).catch(() => null);
        return serveFound(response, body, { type: pathname.endsWith(".css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8", headers: forGood });
      }
      // KaTeX's mhchem (\ce, \pu) for the editor's formulas where the page has no math.js, which
      // bundles it (editor/page/formula/index.mjs loadKatex).
      if (pathname === "/__gallery/edit/mhchem.js") {
        const body = await fs.readFile(mhchemSourcePath).catch(() => null);
        return serveFound(response, body, { type: "text/javascript; charset=utf-8", headers: noStore });
      }
      // The emoji data (categories, keywords, the Twemoji pack): files that do not change.
      const [, emojiFile, emojiKind] = pathname.match(emojiData) ?? [];
      if (emojiFile) {
        const body = await fs.readFile(path.join(sourceDirectory, emojiFile)).catch(() => null);
        return serveFound(response, body, { type: emojiKind === "json" ? "application/json; charset=utf-8" : "application/octet-stream", headers: { "Cache-Control": "max-age=86400" } });
      }
      if (workbenchPage && (pathname === "/" || pathname === "/index.html")) {
        return send(response, "text/html; charset=utf-8", await workbenchPage(url.pathname, request));
      }
      const custom = pathname.match(customPageRoute)?.[1];
      if (custom) {
        const shown = await customPage(custom);
        return shown === null ? next() : send(response, "text/html; charset=utf-8", projectHtml(shown, base));
      }
      const slug = pathname.match(reportRoute)?.[1];
      if (!slug) {
        const linked = pathname.match(fileRoute)?.[1];
        const there = isSlugName(linked) && await fs.access(documentFiles(documentDirectory(linked, reportsDirectory)).html).then(() => true, () => false);
        return there ? serve(response, { status: 302, headers: { Location: `${base}/generated/${linked}.html${url.search}`, ...noStore } }) : next();
      }
      // 历史版本's view of a recent version (?version=<id>&key=<key>): the version the key opens, never
      // the file; a request another site started (Sec-Fetch-Site: cross-site, same-site) refused, as the
      // key is the edit service's to hand out to the workbench alone.
      if (url.searchParams.has("version")) {
        const site = request.headers["sec-fetch-site"];
        if (site !== undefined && site !== "same-origin" && site !== "none") return sendJson(response, 403, { ok: false, reason: "origin" });
        const kept = await edits.versionShown(slug, url.searchParams.get("version"), url.searchParams.get("key") ?? "");
        if (!kept) return sendJson(response, 404, { ok: false, reason: "version", message: "找不到这个版本" });
        return send(response, "text/html; charset=utf-8", await versionPage(slug, kept.marked?.text ?? kept.text, { marked: Boolean(kept.marked) }));
      }
      // The report as its pages see it: what the Agent wrote as any page would made the kit's in
      // memory, the file left as it is.
      // Never a file half written (an Agent between two edits of one change: a page reloading just
      // then would show it, and keep its snapshot): served once whole, or after a while what the
      // preview last took of it, which its other pages show (edits.readTaken).
      const report = await edits.readTaken(slug);
      if (report === null) return next();
      // What a page is served is taken: a write of the Agent's no announcement told yet is under review before the page reads it.
      if (!url.searchParams.has("present")) edits.noteTaken(slug, report.source).then((moved) => moved && changesTold(slug), () => {});
      send(response, "text/html; charset=utf-8", await page(slug, report.text, { present: url.searchParams.has("present") }));
    } catch (error) {
      next(error);
    }
  }

  const timers = new Map();
  const debounce = (key, task) => {
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(task, 120));
  };
  // A document's pages told the look it shows (its doc.json's over gallery.json's: shared/workspace-look.mjs),
  // as "look <word>"; nothing while its doc.json does not read (an Agent writing it: its next write tells),
  // though one with no doc.json at all (made by hand) is told the workspace's, which it shows (ownLookAt).
  const tellLook = (slug) => {
    if (ownLookAt(slug, reportsDirectory).reads) notify(slug, lookWord(documentLook(slug, reportsDirectory)), "look");
  };
  // A report's change is told its pages once the preview takes the file (edits.settled,
  // editor/settle.mjs; ./announce.mjs): never while it is half written, and once it has not
  // changed for a moment, or at once when the edit service wrote it.
  const announce = createAnnouncer({
    settled: edits.settled,
    async tell(slug, state) {
      // Its version as its pages see it (edits.read): an Agent's natural file is told by the
      // version of the text a page shows, which it then takes for no one else's write.
      const report = await edits.read(slug, state.source).catch((error) => {
        // Not read as pages see it (a rule failing on it): told by the file's own version, and said here.
        logger.error(`[gallery] ${slug}: ${error.message}`);
        return { version: hashOf(state.source ?? "") };
      });
      notify(slug, report?.version ?? hashOf(""));
      // Its facts read again of what was taken, its edit counted (the reader's when the edit service wrote
      // it as theirs, else the Agent's: writerOf), and what changed of them told every page.
      if (ofTheWorkspace(slug)) {
        const by = edits.writerOf(slug, state.source) ?? "agent";
        facts.changed(slug, { source: state.source ?? null, text: report?.text ?? null, by }).then(tellData, (error) => logger.error(`[gallery] ${slug}: its facts not read: ${error.message}`));
        // Its text changed by someone else (not the reader's commit, rename or icon): the workbench marks it.
        updates.heard(slug, typeof state.source === "string" ? hashOf(state.source) : null, by === "reader");
      }
      // A write not the edit service's own (an Agent's) starts or grows the review of the Agent's changes (editor/changes.mjs).
      edits.noteTaken(slug, state.source).then((moved) => moved && changesTold(slug), (error) => logger.error(`[gallery] ${slug}: the Agent's changes not kept: ${error.message}`));
      // Its 批注 go with what was written (a commit, an Agent, another tab): those whose words are gone go too.
      edits.checkAnnotations(slug).catch((error) => logger.error(`[gallery] ${slug}: annotations not checked: ${error.message}`));
    },
  });
  // A file of a document's assets/ written again, told its pages once whole and quiet (./asset-news.mjs): "asset new
  // <file>=<stamp>", which a page swaps the addresses it shows it by for. One of a custom page's assets/ (its key
  // "@<slug>"), told its pages "asset <file>=<stamp>", which show the page again (pageReloadScript: the workbench's
  // swap, a page loaded anew asking for its pictures again).
  const assetNews = createAssetNews({
    tell: (key, file, stamp) => {
      if (!key.startsWith("@")) return notify(key, `new ${file}=${stamp}`, "asset");
      for (const listener of listeners) if (listener.page === key.slice(1)) listener.response.write(`data: asset ${file}=${stamp}\n\n`);
    },
  });
  // A package that does not load says why here too, as it may be no instance's yet, as the server
  // starts and as it comes; one turned off is as the reader asked.
  const noLoad = ({ id, problem, off }) => off || logger.warn(`[gallery] custom block ${id} does not load: ${problemIn("en", problem)}`);
  // The catalog taken, every page is told of it, and of which packages changed, by the ids an
  // instance can name, and of what is hidden or disabled now, which no stamp of a package says
  // (./catalog-watch.mjs).
  const catalog = createCatalogWatch({
    root: defaultWorkspace(),
    tell({ stamp, problems, settings }, ids) {
      for (const id of ids) if (problems.has(id)) noLoad(problems.get(id));
      for (const { response } of listeners) {
        response.write(`data: components ${stamp} ${ids.filter((id) => PACKAGE_ID.test(id)).join(",")}\n\n`);
        response.write(`data: ${settingsLine(settings)}\n\n`);
      }
    },
  });
  for (const problem of currentCatalog().problems.values()) noLoad(problem);
  // What was written while no server ran, counted in the record of edits as this one starts (catchUp).
  facts.start().then((counted) => counted > 0 && tellData(["activity"]));
  // And each document's file taken as this one starts, as a page served takes it (edits.takeAll): a write while
  // no server ran is a version of its own, and under review as the Agent's against what the last server took.
  // What was taken of each is what the record of pages someone else wrote compares the next write with (./updates.mjs).
  listDocumentSlugs(reportsDirectory).then((slugs) => {
    updates.know(slugs.filter(ofTheWorkspace));
    return edits.takeAll(slugs, (slug, source) => ofTheWorkspace(slug) && updates.seed(slug, hashOf(source)));
  }).catch((error) => logger.error(`[gallery] the documents not taken as the server starts: ${error.message}`));
  // And each custom page's page.html, where the sidebar's pages are this workspace's.
  if (pagesHere) listPages(reportsDirectory).then(async (pages) => {
    updates.know(pages.map(({ slug }) => `@${slug}`));
    for (const { slug } of pages) updates.seed(`@${slug}`, await fs.readFile(pageFiles(slug, reportsDirectory).html, "utf8").then(hashOf, () => null));
  }).catch(() => {});
  const ignored = ignoredIn(reportsDirectory);
  // The extensions that have a column (a sidebar.json: shared/extensions.mjs), as last seen. A sidebar.json
  // written tells the workbench (its entries changed); news of an extension's folder itself or of what else it
  // holds (the folder made or moved away, which a watch may report as no more than the folder's add or
  // unlink, or a file the extension's own program writes there, which the recursive watch of Windows and
  // macOS reports as the folder's change: ./watch.mjs) tells it only when the columns changed, the folders
  // read again once for a burst of news.
  let columns = extensionColumnIds(reportsDirectory).then((ids) => ids.join("/"), () => "");
  let sidebarWritten = false;
  // `name` SIDEBAR_FILE for a column's file written (a sidebar.json, a file of columns/): the workbench is told.
  // The home's routes (no base) also take the columns of extensions that are gone out of the shared outline
  // file (shared/outline.mjs dropGoneExtensions: one whose folder was deleted by hand, a 0.2.4 ext-<id> too),
  // once as the server starts and again as news of the extensions comes; a disabled one's place stays.
  const dropGone = () => dropGoneExtensions(defaultWorkspace()).catch((error) => logger.warn?.(`[gallery] the columns of removed extensions not taken out of the outline: ${error.message}`));
  if (!base) dropGone();
  const extensionNews = (name) => {
    sidebarWritten ||= name === SIDEBAR_FILE;
    debounce("extensions", async () => {
      const told = sidebarWritten;
      sidebarWritten = false;
      const before = await columns;
      columns = extensionColumnIds(reportsDirectory).then((ids) => ids.join("/"), () => before);
      if (told || (await columns) !== before) workspaceChanged();
      if (!base) await dropGone();
    });
  };
  // Public extension files are shared even when no server runs for the default workspace.
  // Follow public extensions and the shared outline, even without a default-workspace server.
  // Reuse the workspace watcher and the same refresh event.
  const publicRoot = defaultWorkspace();
  const publicExtensions = layoutOf(publicRoot).extensions;
  const publicWatch = base ? null : watchWorkspace(publicRoot, (event, file) => {
    if (sameDirectory(file, layoutOf(publicRoot).outline)) { workspaceChanged(); return; }
    const relative = path.relative(file, publicExtensions);
    if (event === "reset" || relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
      extensionNews(SIDEBAR_FILE); // The root/extensions directory made, replaced or removed.
      return;
    }
    const change = changeOf(publicRoot, file);
    if (change?.columns) { extensionNews(SIDEBAR_FILE); return; }
    if (change?.extension) {
      invalidateExtension(path.join(publicExtensions, change.extension));
      debounce(`extension:${change.extension}`, () => tellExtension(change.extension));
    }
    if (change?.extension && (change.name === SIDEBAR_FILE || change.name === null)) extensionNews(change.name);
  }, { extensionsOnly: true, outline: true });
  // An extension switched on or off, installed or removed (server/extensions.mjs): its columns/ columns come or go.
  const switched = () => extensionNews(null);
  if (!base) extensionEvents.on("change", switched);
  const inSource = (file, directories) => !release && directories.some((directory) => file.startsWith(directory + path.sep));
  function changed(event, file) {
    // The watcher could not say what changed (./watch.mjs: an event without a name): every page kept
    // goes, the editor's modules are listed again and the catalog is looked at; the pages hear of
    // their files' next change.
    if (event === "reset") {
      pages.clear();
      modules.changed();
      catalog.changed();
      workspaceChanged();
      return;
    }
    // The workspace's own (.gallery/ but the 写作偏好 page, exports/) first: a commit writes the edit state each time.
    if (ignored(file)) return;
    const relativePreference = path.relative(reportsDirectory, file).split(path.sep).join("/");
    if (relativePreference === "preferences.md" || relativePreference === "preferences" || relativePreference.startsWith("preferences/")) workspaceChanged();
    const change = changeOf(reportsDirectory, file); // the workspace may be anywhere (GALLERY_WORKSPACE)
    // A custom page's file: its pages told its version now ("page <version>", once for a burst of
    // writes), and the workbench's list read again when what it lists changed (page.json: its title
    // and icon; the page made or gone).
    if (change?.page) {
      const { page, name } = change;
      if (name && isPageFile(name)) debounce(`page:${page}`, async () => {
        const files = pageFiles(page, reportsDirectory);
        const [text, meta] = await Promise.all([fs.readFile(files.html, "utf8").catch(() => null), fs.readFile(files.json, "utf8").catch(() => "")]);
        if (text !== null) notifyPage(page, pageVersion(text, meta));
        // Its page.html changed by someone else (not the page service's write of a gesture, nor Gallery's own): the workbench marks it.
        if (pagesHere) updates.heard(`@${page}`, text === null ? null : hashOf(text), ["page", "gallery"].includes(pageWriterOf(files.html, text)));
      });
      if (name === PAGE_FILES.json || (name === PAGE_FILES.html && /^(add|unlink)$/.test(event)) || (name === null && /^(add|unlink)Dir$/.test(event))) workspaceChanged();
      // A file of its assets/ written (a picture an Agent copied over one of the same name): its pages told once it
      // is whole and quiet, and shown again (./asset-news.mjs, key "@<slug>"); one taken away only forgotten there.
      if (name === null && /^(add|change|unlink)$/.test(event)) {
        const relative = path.relative(pageFiles(page, reportsDirectory).folder, file).split(path.sep).join("/");
        if (assetFile(relative)) assetNews(`@${page}`, file, relative);
      }
      return;
    }
    // An extension's sidebar.json made, changed or taken away, or its folder made or gone (an extension
    // installed, removed, rewriting its entries): the workbench reads the list again, which holds its column.
    // Any other news of the folder (extensionNews) only when the columns changed.
    // A file of an extension's columns/ (its program writing a column): the sidebar reads the columns again; the
    // extension is not changed by it (no new revision, so no reload of its script and no restart of its backend).
    if (change?.columns) { extensionNews(SIDEBAR_FILE); return; }
    if (change?.extension) {
      if (!base) { invalidateExtension(path.join(layoutOf(reportsDirectory).extensions, change.extension)); debounce(`extension:${change.extension}`, () => tellExtension(change.extension)); }
      if (change.name === SIDEBAR_FILE || change.name === null) extensionNews(change.name);
      return;
    }
    if (change?.packages) catalog.changed();
    // gallery.json written (应用到全部文档, an Agent, a switch of 设置 › 组件列表): every open page is told
    // the look its document shows now, the workspace's default look being among what says it.
    if (change?.name === WORKSPACE_FILE && change.slug === null) debounce("look:*", () => new Set([...listeners].map(({ slug }) => slug).filter(Boolean)).forEach(tellLook));
    // Its pages.order too, the sidebar's order of the custom pages (shared/pages.mjs): the workbench reads the list again.
    if (change?.name === WORKSPACE_FILE && change.slug === null) workspaceChanged();
    // A file of a document's folder (a picture, a file, the folder itself) changed: the pages kept of
    // it go (its text, doc.html, is in their key; doc.json and its 批注 are in no page of its own).
    if (change?.slug && !(change.name && isDocumentFile(change.name))) pages.forget(change.slug);
    // A file of its assets/ written (a picture copied over one of the same name): its pages told the file's new
    // stamp once it is whole and quiet ("asset new <file>=<stamp>": ./asset-news.mjs), as they name it by its
    // stamp and take in no write of its own (the page swaps its address in place: editor/page/assets-live.mjs).
    // One taken away is told nothing, only forgotten among what a page that connects is told.
    if (change?.slug && !change.packages && change.name === null && /^(add|change|unlink)$/.test(event)) {
      const relative = path.relative(documentDirectory(change.slug, reportsDirectory), file).split(path.sep).join("/");
      if (assetFile(relative)) assetNews(change.slug, file, relative);
    }
    // A document's title or icon changed, or a document came or went: any page may show it in a page
    // block (render/page-chips.mjs), so none is kept.
    if (change && (/^(doc|report)\.json$/.test(change.name ?? "") || (/^(add|unlink)Dir$/.test(event) && change.name === null))) pages.clear();
    // A document's folder came or went (made, trashed, restored): the workspace's facts of it are read again
    // when asked, and every page is told its lists may have changed.
    if (change?.slug && !change.packages && change.name === null && /^(add|unlink)Dir$/.test(event) && ofTheWorkspace(change.slug)) {
      facts.forget(change.slug);
      tellData(["todos", "recent", "stats", "document"]);
    }
    // The same, or a document's file made or taken away (a folder is a document once its doc.html is
    // there): the workbench reads the list again (not for a folder of components/, a package's).
    if (change?.slug && !(change.packages && change.name === null) && (/^(doc|report)\.json$/.test(change.name ?? "") || (/^(add|unlink)Dir$/.test(event) && change.name === null) || (/^(add|unlink)$/.test(event) && isDocumentSource(change.name ?? "")))) workspaceChanged();
    // A web link's link.json made, changed or taken away (shared/web-links.mjs: its title, address or
    // icon; an Agent's gallery link set, another tab's): the workbench reads the list again.
    if (change?.slug && !change.packages && change.name === LINK_FILE) workspaceChanged();
    // A module added or removed: the editor's are listed again for their stamp.
    if (/^(add|unlink)(Dir)?$/.test(event) && inSource(file, browserDirectories)) modules.changed();
    if (change?.name && (isDocumentSource(change.name) || /^(doc|report)\.json$/.test(change.name))) {
      announce(change.slug);
      // Its doc.json written (字体与布局, 应用到全部文档, an Agent, a rename): its pages are told the look it
      // shows now, which a page showing that look already does nothing about (the kit's ui.js).
      if (/^(doc|report)\.json$/.test(change.name)) {
        const { slug } = change;
        debounce(`look:${slug}`, () => tellLook(slug));
      }
    } else if (change?.name === "annotations.json") {
      // Its 批注 written (by its page, a check, another tab, an Agent): its pages read them again, told the file's version.
      const { slug } = change;
      debounce(`notes:${slug}`, async () => {
        const text = await fs.readFile(file, "utf8").catch(() => null);
        notify(slug, text === null ? "" : hashOf(text), "notes");
      });
    } else if (inSource(file, kitSources)) {
      debounce("kit", async () => {
        try {
          await writeSharedAssets({ fresh: true });
          notify();
        } catch (error) {
          logger.error(`[gallery] shared kit rebuild failed: ${error.message}`);
        }
      });
    } else if (inSource(file, browserDirectories)) {
      debounce("editor", () => notify());
    }
  }

  // Where this server listens, for gallery export and gallery open (shared/preview-server.mjs: the
  // data directory’s server.json), while it does; and its storage folder on the machine’s registry
  // (shared/workspace-registry.mjs: none in the system's temporary folder, a failure passed over).
  async function listening(port) {
    if (announceServer) forget = await announcePreviewServer({ home: reportsDirectory, port, token: edits.token, kind });
    await registerQuietly(reportsDirectory);
  }
  async function close() {
    if (!base) { extensionEvents.off("change", tellExtension); extensionEvents.off("change", switched); }
    for (const listener of listeners) listener.response.end();
    listeners.clear();
    publicWatch?.close();
    for (const timer of timers.values()) clearTimeout(timer);
    assetNews.close();
    catalog.close();
    await activity?.close();
    await forget?.().catch(() => {});
    forget = null;
    await transfer.close();
    await edits.drain();
  }

  return { handle, changed, listening, close, stop, edits, workspace, transfer, refresh: tellWorkspace, updated: tellUpdated,
    appearanceChanged() {
      pages.clear();
      new Set([...listeners].map(({ slug }) => slug).filter(Boolean)).forEach(tellLook);
      workspaceChanged();
    },
    get listeners() { return listeners.size; },
    get workbenchListeners() { return [...listeners].filter(listener => listener.workspace).length; },
  };
}
