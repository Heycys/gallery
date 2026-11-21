// Usage: node src/cli/add-block-ids.mjs <slug>... [--dry-run]
//        node src/cli/add-block-ids.mjs --all [--dry-run]
// A maintainers' tool, run with GALLERY_WORKSPACE naming the workspace: gallery export does this now, as it hands a document in. Gives every block
// without a data-block-id one ("Block ids" in docs/editor.md), its natural HTML made the kit's first
// ("Natural HTML": what the preview shows); nothing else in the file changes. A report where an id
// repeats (a copied block that kept it) is left as it is, its repeated ids listed with their lines:
// which one is the copy is for its author to say. The report as it was, and the changed lines, go to
// .gallery/backups/<slug>/. A page open on the report goes on saving as before (ids change no block's hash).
// --all: every document of the workspace; --dry-run only counts, and writes nothing.
import fs from "node:fs/promises";
import path from "node:path";
import { newNames } from "../shared/new-names.mjs";
import { writeAtomic } from "../shared/files.mjs";
import { addBlockIds, changeLines, naturalize, repeatedBlockIds } from "../editor/source.mjs";
import { withNeededKitTags } from "../render/assets.mjs";
import { backupsDirectory, reportsDirectory } from "../shared/paths.mjs";
import { documentDirectory, documentFiles } from "../shared/workspace.mjs";
import { scriptArguments } from "./arguments.mjs";

const { slugs, options } = await scriptArguments(import.meta.url, { documents: true, options: ["--dry-run"] });
const dryRun = options.has("--dry-run");

const shown = (file) => path.resolve(file); // as the system writes it
// Ids only go into start tags, so both versions have the same lines.
const changedLines = (before, after) => {
  const [a, b] = [before.split("\n"), after.split("\n")];
  return a.flatMap((line, index) => line === b[index] ? [] : [`@@ line ${index + 1}`, `- ${line}`, `+ ${b[index]}`]).join("\n") + "\n";
};

let failed = false;
for (const slug of slugs) {
  const file = documentFiles(documentDirectory(slug, reportsDirectory)).html;
  const source = await fs.readFile(file, "utf8").catch(() => null);
  if (source === null) {
    console.error(`${shown(file)} not found`);
    failed = true;
    continue;
  }
  const repeated = repeatedBlockIds(source);
  if (repeated.length > 0) {
    // Each element carrying the id by its line, and by its column too when two share a line ("12:40").
    const placed = ({ lines, columns }) => (new Set(lines).size < lines.length ? lines.map((line, index) => `${line}:${columns[index]}`) : lines);
    const listed = repeated.map((each) => {
      const at = placed(each);
      return `"${each.id}" on lines ${at.slice(0, -1).join(", ")} and ${at.at(-1)}${at === each.lines ? "" : " (line:column)"}`;
    });
    console.error(`${shown(file)}: nothing changed, as block ids repeat: ${listed.join("; ")}. Each id names one block: remove it from the copy (a copied block needs none), then run this again.`);
    failed = true;
    continue;
  }
  const natural = naturalize(source);
  const { text: ided, added, renamed } = addBlockIds(natural.text);
  const text = natural.changes.length ? withNeededKitTags(ided) : ided;
  // What naturalize wrote (or would), said once the file holds it.
  const naturalLines = () => {
    if (natural.changes.length) console.log(changeLines(file, natural.changes, { dryRun }).join("\n"));
  };
  // The format's old names (report-*, data-report-* …: shared/old-names.mjs), which naturalize writes as the new ones.
  const oldNames = newNames(source) !== source;
  if (added + renamed.length === 0 && !natural.changes.length && !oldNames) {
    console.log(`${shown(file)}: every block already has an id`);
    continue;
  }
  const what = `${added} block(s) given an id${renamed.length ? `, ${renamed.length} repeated id(s) replaced (${[...new Set(renamed)].join(", ")})` : ""}${oldNames ? ", the kit's old names (report-*, data-report-*, --report-*, Report*) written as its new ones (doc-*)" : ""}`;
  if (dryRun) {
    console.log(`${shown(file)}: would have ${what}`);
    naturalLines();
    continue;
  }
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-");
  const directory = path.join(backupsDirectory, slug);
  await fs.mkdir(directory, { recursive: true });
  const backup = path.join(directory, `report-${stamp}.html`);
  await fs.writeFile(backup, source);
  await fs.writeFile(path.join(directory, `report-${stamp}.ids.diff`), changedLines(source, text));
  if (!(await writeAtomic(file, text, { expect: source }))) {
    console.error(`${shown(file)} changed while it was being migrated; nothing written. Run it again.`);
    failed = true;
    continue;
  }
  console.log(`${shown(file)}: ${what}. The report as it was: ${shown(backup)}`);
  naturalLines();
}
process.exit(failed ? 1 : 0);
