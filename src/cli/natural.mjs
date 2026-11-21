import path from "node:path";
import { droppedReportLines, takeDropped } from "../editor/dropped-annotations.mjs";
import { rewriteLines, takeRewrites } from "../editor/rewrites.mjs";
import { FILE } from "../shared/annotations.mjs";
import { newNames } from "../shared/new-names.mjs";
import { changeLines, inStep, pendingBlockIds, readOnlyTexts, scriptKept, shownSource, writingNotes } from "../editor/source.mjs";
import { withNeededKitTags } from "../render/assets.mjs";
import { editStateDirectory, reportsDirectory } from "../shared/paths.mjs";
import { documentDirectory, documentFiles } from "../shared/workspace.mjs";
import { idLines, inStepLines } from "./hand-in.mjs";

// What gallery check and gallery export read of a document: its natural HTML made the
// kit's in memory, as its preview shows it (src/editor/source/natural.mjs: shownSource, with the kit
// tags its blocks then need), so what an Agent writes as any page would is
// checked, built and exported as the kit's; the file is left as it is (only an export writes it, when
// it hands the report in: hand-in.mjs). Then, as notes (never a failure), the text the preview will
// still leave read-only, and what it takes otherwise than as blocks (a whole block of the report's
// own, column widths the kit sets itself).

/**
 * loadReports' `prepare`: a report's text as its preview shows it. With `say`, prints for each report
 * what an export will write: what it makes the kit's (changeLines, as not written yet), the blocks it
 * gives an id (idLines, pending: those few at their lines) and the name and icon its hand-in will
 * keep in step (inStepLines: <title>, report.json's title and icon).
 */
export function naturalInMemory({ say = true } = {}) {
  return (report) => {
    const { text, changes } = shownSource(report.html, { finish: withNeededKitTags });
    if (say && changes.length) console.log(changeLines(report.htmlPath, changes, { pending: true }).join("\n"));
    if (say) {
      const pending = pendingBlockIds(report.html);
      if (pending.length) console.log(idLines(report.htmlPath, pending, pending.length, { pending: true }).join("\n"));
      for (const line of inStepLines(report.htmlPath, inStep(newNames(report.html), report.metadata), { pending: true })) console.log(line);
    }
    return text;
  };
}

/**
 * Print, for these reports ({ slug, html }), the text their preview leaves read-only, what it
 * takes otherwise than as blocks (writingNotes) and the blocks their own script keeps (scriptKept):
 * notes, never failures.
 */
export function editingNotes(reports) {
  for (const report of reports) {
    for (const note of readOnlyTexts(report.html)) console.log(`note ${report.slug}: ${note} (read-only in the preview)`);
    for (const note of writingNotes(report.html)) console.log(`note ${report.slug}: ${note}`);
    for (const note of scriptKept(report.html)) console.log(`note ${report.slug}: ${note}`);
  }
}

/**
 * Print, for these reports, what the preview wrote of their natural HTML as the kit's markup when the
 * reader edited them since a command last said it (the edit service's record, editor/rewrites.mjs:
 * when, and each rule at its line of the file as the Agent had left it), so the Agent learns why its
 * file changed: once, as what is said is taken away. gallery check and gallery export say it first.
 */
export async function previewRewrites(slugs) {
  for (const slug of slugs) {
    const entries = await takeRewrites({ stateDirectory: editStateDirectory, reportsDirectory, slug });
    for (const line of rewriteLines(documentFiles(documentDirectory(slug, reportsDirectory)).html, entries)) console.log(line);
  }
}

/**
 * Print, for these reports, the 批注 Gallery deleted since a command last said it because the
 * words they were about are gone (the edit service's record, editor/dropped-annotations.mjs: when,
 * each one's id, text and quote; those back in annotations.json since left out), so the Agent that
 * rewrote those words says in its hand-off what became of them: once, as what is said is taken away.
 * gallery check and gallery export say it right after what the preview wrote.
 */
export async function previewDeletions(slugs) {
  for (const slug of slugs) {
    const entries = await takeDropped({ stateDirectory: editStateDirectory, reportsDirectory, slug });
    for (const line of droppedReportLines(path.join(documentDirectory(slug, reportsDirectory), FILE), entries)) console.log(line);
  }
}
