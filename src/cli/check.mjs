import { identityFailures, markedAsInstructions } from "../render/identity-checks.mjs";
import { checkSelectedReports, reportFailures, reportNotes } from "../render/pipeline.mjs";
import { reportsDirectory } from "../shared/paths.mjs";
import { documentDirectory, documentFiles } from "../shared/workspace.mjs";
import { pictureCopies } from "../transfer/browser.mjs";
import { documentArguments, isOption } from "./arguments.mjs";
import { previewSettled } from "./hand-in.mjs";
import { editingNotes, naturalInMemory, previewDeletions, previewRewrites } from "./natural.mjs";

// gallery check [<slug>...] (./usage.mjs): each named document checked on its own (none named:
// every document of the workspace); the shared kit's regressions live in npm run kit:check. Reads the
// document as its preview shows it (natural HTML made the kit's in memory) and writes none: what the
// export will write as the kit's markup is printed, by line, and the blocks it will give an id (each
// at its line when they are ten at most); first, once, what the preview wrote as the kit's markup
// when the reader edited the document, and the 批注 it deleted because their words are gone (the
// workspace server's check of them run first, against the file as it is now). The
// notes to act on first ("fix") come before the others ("note"). A folder holding both doc.html and
// report.html (only by hand) is said: doc.html is the one read. What an Agent used to be told never to do
// to the identity of a document is checked here (src/render/identity-checks.mjs), each failure saying how
// to mend it: a data-block-id that is not an id Gallery made, an id moved from a list item onto the
// paragraph in it, and a document folder whose doc.json says "instructions": true (the 写作偏好 page's
// mark, which hides it from the workspace: found among the root's folders, so a document named so is
// checked too, and none named checks them all). Exits 1 when a document fails, unless --allow-failures.

/** What gallery check and gallery export say when the workspace has no document yet. */
export const noDocuments = () => `No documents in ${reportsDirectory} yet: gallery new <slug> "<title>" makes one.`;

export async function run(argv) {
  // A folder marked "instructions": true is no document to the workspace, so a name of one is not a document's
  // either: it is said here, failing, instead of "not a document".
  const marked = await markedAsInstructions(reportsDirectory);
  const end = argv.indexOf("--");
  const named = argv.filter((argument, at) => (end === -1 || at < end) && !isOption(argument));
  const nameMarked = named.filter((name) => marked.has(name));
  const rest = argv.filter((argument) => !nameMarked.includes(argument));
  const onlyMarked = named.length > 0 && nameMarked.length === named.length;
  const { slugs, options } = onlyMarked ? { slugs: [], options: new Set(argv.includes("--allow-failures") ? ["--allow-failures"] : []) } : await documentArguments({ options: ["--allow-failures"], argv: rest, noneIsAll: true });
  const everyMarked = named.length === 0 || argv.includes("--all") ? [...marked.keys()] : nameMarked;
  if (slugs.length === 0 && everyMarked.length === 0) {
    console.error(noDocuments());
    process.exit(1);
  }
  // The workspace server's check of the 批注 against each file as it is now, first: it runs some
  // 1.9 s after a write, and a check right after the Agent's write said nothing of it.
  await previewSettled(slugs);
  await previewRewrites(slugs);
  await previewDeletions(slugs);
  const { reports, failures } = slugs.length ? await checkSelectedReports(slugs, { prepare: naturalInMemory() }) : { reports: [], failures: new Map() };
  for (const report of reports) {
    const identity = identityFailures(report.written ?? report.html);
    if (identity.length) failures.set(report.slug, [...(failures.get(report.slug) ?? []), ...identity]);
  }
  for (const slug of everyMarked) failures.set(slug, [...(failures.get(slug) ?? []), marked.get(slug)]);
  const passed = reports.filter((report) => !failures.has(report.slug));
  for (const report of passed) console.log(`OK   ${report.slug}`);
  for (const slug of slugs) if (documentFiles(documentDirectory(slug, reportsDirectory)).both) console.log(`note ${slug}: both doc.html and report.html: report.html is not read`);
  reportNotes(reports, { copies: pictureCopies() }); // a heavy picture weighed as this machine's export embeds it
  editingNotes(reports);
  const checked = passed.length + failures.size;
  console.log(`Checked ${checked} document${checked === 1 ? "" : "s"}: ${passed.length} passed, ${failures.size} failed.`);
  await reportFailures(failures, { allow: options.has("--allow-failures") });
}
