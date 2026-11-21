import { elementsOf } from "../shared/html-tree.mjs";
import { netSnapshot } from "../shared/net-cache.mjs";
import { hostIn, netHostsOf } from "../shared/net-policy.mjs";
import { parseReport } from "./report-tree.mjs";

// What an export embeds of what a document's blocks read live (docs/render.md,
// "A block online" and "A custom block on a page"): an exported file reaches no network
// (its policy blocks it) and has no workspace to read, so a block whose needs name a host of the net reads
// there the answers its instances in this document were given last (the server's net route kept them:
// shared/net-cache.mjs netSnapshot), and a block whose needs hold "workspace" each kind of the workspace's
// facts as they were at the export (`workspace`: what the export's caller read of them, src/workbench/index.mjs
// snapshot, the kinds' whole answers to SNAPSHOT_LIMITS and the tables the document's instances asked for),
// as <script type="application/json" data-doc-snapshot data-at="<the export's time>">{ "todos": …, "net": { <url>: { data, at } } }</script>
// at the end of the page's head, which the kit's context.fetch (cached: true; an address it holds no answer
// for is code "offline", and the block shows its placeholder) and context.workspace.query (`at` the
// export's time: the block says 截至 … with it; a kind it holds none of is "offline") answer from. Only an
// export of the file writes it (gallery export, the workbench's 导出), never the source; a copy of the view
// the browser makes holds none.

/** The tag of a snapshot, its JSON unable to end its element or open a comment. */
export const snapshotTag = (snapshot, at) => `<script type="application/json" data-doc-snapshot data-at="${at}">${JSON.stringify(snapshot).replace(/</g, "\\u003c")}</script>`;

/** Whether any of `packages` (a document's: its catalog's) reads the workspace (its needs hold "workspace"). */
export const readsWorkspace = (packages) => packages.some(({ needs }) => Array.isArray(needs) && needs.includes("workspace"));

/**
 * The page of document `slug` with the snapshot of what its blocks fetched (`packages`: those it holds
 * instances of, its catalog's), from workspace `root`, and of the workspace (`workspace`: its kinds, given
 * where one of the packages reads it, else null), before its </head> (or right after its <head …> start
 * where it writes no end tag), or as it is when none of them reaches the net or reads the workspace, or
 * nothing is kept.
 */
export function withNetSnapshot(html, { slug, packages, root, at = new Date(), workspace = null }) {
  const hosts = packages.flatMap(({ needs }) => netHostsOf(needs));
  const net = hosts.length === 0 ? null : netSnapshot(root, slug, (url) => {
    try {
      return hostIn(new URL(url).hostname, hosts) !== null;
    } catch {
      return false;
    }
  });
  const snapshot = { ...(workspace && readsWorkspace(packages) ? workspace : {}), ...(net ? { net } : {}) };
  if (Object.keys(snapshot).length === 0) return html;
  const head = elementsOf(elementsOf(parseReport(html)).find((node) => node.tagName === "html") ?? {}).find((node) => node.tagName === "head");
  const where = head?.sourceCodeLocation?.endTag?.startOffset ?? head?.sourceCodeLocation?.startTag?.endOffset;
  if (where === undefined) return html;
  return `${html.slice(0, where)}  ${snapshotTag(snapshot, at.toISOString())}\n${html.slice(where)}`;
}
