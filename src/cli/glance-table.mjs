import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { GLANCE } from "../editor/components/registry.mjs";
import { projectRoot, skillSourceDirectory } from "../shared/paths.mjs";

// Usage: node src/cli/glance-table.mjs
//
// The table of "Blocks at a glance" in skills/gallery/references/writing-html.md, made from the components'
// definitions (`glance`: docs/editor.md, "Component definitions"), so that what every Agent reads
// says what the blocks are. It stands between <!-- glance --> and <!-- /glance -->. Run this after
// changing a `glance`, or the blocks themselves; kit:check fails while the table is out of date.

const FILE = path.join(skillSourceDirectory, "references", "writing-html.md");
const MARKS = /<!-- glance -->\n[\s\S]*?<!-- \/glance -->/;

// A column of a row: what its parts say of it, a comma between them unless the part says otherwise.
const column = (parts, key, between = () => ", ") => parts.filter((part) => part[key]).map((part, index) => `${index > 0 ? between(part) : ""}${part[key]}`).join("");

/** The table, a row for each place the definitions name. */
export function glanceTable() {
  return [
    "| Block | You write | After export | Rule |",
    "| --- | --- | --- | --- |",
    ...GLANCE.map((parts) => {
      const after = column(parts, "after");
      return `| ${column(parts, "name")} | ${column(parts, "write", (part) => part.before ?? ", ")} | ${after ? `${after} ` : ""}| ${parts[0].rule} |`;
    }),
  ].join("\n");
}

/** The file and its text with the table made again. */
export function withGlance() {
  const text = fs.readFileSync(FILE, "utf8").replace(/\r\n/g, "\n");
  if (!MARKS.test(text)) throw new Error("skills/gallery/references/writing-html.md: no <!-- glance --> … <!-- /glance -->");
  return { file: FILE, text, made: text.replace(MARKS, () => `<!-- glance -->\n${glanceTable()}\n<!-- /glance -->`) };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { file, text, made } = withGlance();
  if (made !== text) fs.writeFileSync(file, made);
  console.log(made === text ? "The table of Blocks at a glance is up to date." : `Wrote the table of Blocks at a glance in ${path.relative(projectRoot, file)}`);
}
