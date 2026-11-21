import path from "node:path";
import { exportBaselines } from "../cli/qa-baseline.mjs";
import { exportReports, repeatedIdFailures } from "../render/pipeline.mjs";
import { reportsDirectory } from "../shared/paths.mjs";
import { encodePictures } from "../transfer/browser.mjs";
import { carriedExport } from "../transfer/carry.mjs";
import { runJob } from "../transfer/jobs.mjs";

import { layoutOf } from "../shared/workspace.mjs";

/**
 * The workspace's export of `slug` (POST /__gallery/workspace/export, the page's 导出报告: the offline file,
 * exports/<slug>.html), in the queue the workspace's commands run in: { problems, file, refused? }.
 * As gallery export does it (src/cli/export.mjs): the report handed in first (`edits`, the
 * edit service: its file written as pages see it, every block given an id); one whose ids repeat
 * fails, as the check says it, at the file's lines. The hand-in is the reader's: never of a file an
 * Agent has half written (busy: refused, its own { reason, message }, no check failed), and what it
 * wrote of the Agent's natural HTML kept for the Agent's next check or export to say, as a commit's is.
 * gallery qa's baseline is kept by the same rule as the CLI's export (exportBaselines,
 * src/cli/qa-baseline.mjs): the export there read before it is replaced; once exported, a report with
 * no baseline gets one of the text the export before was made from, and the text this one was made
 * from is kept for the next look (qa/<slug>/exported.html). Silent, and never fails the export.
 * `workspace(slug)`: what a document whose blocks read the workspace embeds of it (the facts' snapshot). Its pictures
 * are made as light as the page needs, by the user's Chrome or Edge, as gallery export makes them (render/export-pictures.mjs).
 */
export async function exportOffline(edits, slug, { root = reportsDirectory, workspace = null } = {}) {
  const { exports: exportsDirectory } = layoutOf(root);
  const file = path.join(exportsDirectory, `${slug}.html`);
  const baselines = await exportBaselines([slug], root);
  const handed = await edits.handInReport(slug, { reader: true });
  if (!handed.ok) return { problems: [], refused: { reason: handed.reason, message: handed.message }, file };
  if (handed.repeated.length) return { problems: repeatedIdFailures(handed.repeated), file };
  // What it carries (src/transfer/carry.mjs), its words read in the conversion worker, off the server's thread.
  const carry = (input) => carriedExport({ ...input, readings: (source, options) => runJob("readings", { source, ...options }) });
  const { exported, failures } = await exportReports([slug], { workspace, directory: root, pictures: encodePictures, carry });
  await baselines.keep(exported.map((each) => each.slug));
  return { problems: failures.get(slug) ?? [], file };
}
