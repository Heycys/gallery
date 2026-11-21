import { parseReport } from "../render/report-tree.mjs";
import { walk, attr } from "../shared/html-tree.mjs";
import { workspaceAddress } from "../shared/workspace-address.mjs";
import { addressEdits, referencesWhere, withEdits } from "../render/asset-references.mjs";

// Scope served URLs, not the source file. Keep source offsets and all unrelated markup intact.
// Gallery's own inline scripts also contain API addresses and component metadata. User scripts
// are left alone; they can use relative URLs or the runtime's context APIs.
export function projectHtml(html, base) {
  if (!base) return html;
  const tree = parseReport(html);
  const references = referencesWhere(html, value => workspaceAddress(value, base) !== value, tree);
  const edits = addressEdits(references, reference => workspaceAddress(reference.value, base));
  const scope = (text) => text.replace(/(["'`])(\/(?:__gallery\/(?:edit\/(?:v\/[a-f0-9]{16}\/)?src\/|components\/)|__gallery\/|generated\/|pages\/))/g,
    (_, quote, address) => quote + workspaceAddress(address, base));
  walk(tree, (node) => {
    if (node.tagName === "script" && (attr(node, "data-doc-dev") !== undefined || attr(node, "data-doc-package") !== undefined) && !attr(node, "src")) {
      const start = node.sourceCodeLocation?.startTag?.endOffset, end = node.sourceCodeLocation?.endTag?.startOffset;
      if (start !== undefined && end !== undefined) edits.push({ start, end, text: scope(html.slice(start, end)) });
    }
  });
  return withEdits(html, edits);
}
