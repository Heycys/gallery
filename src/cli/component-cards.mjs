import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sdkInterfaces, sdkOptions } from "../render/sdk-options.mjs";
import { projectRoot } from "../shared/paths.mjs";

// Usage: node src/cli/component-cards.mjs
//
// The option tables of the component cards (docs/components/), made from the SDK's types
// (skills/gallery/sdk/*.d.ts, read by src/render/sdk-options.mjs), so a card never says other than what the checks
// hold a report to. A card asks for one with a pair of markers: <!-- options: DiffViewOptions -->
// … <!-- /options -->. Run this after changing the SDK; kit:check fails while a table is out of date.

const CARDS = path.join(projectRoot, "docs", "components");
const MARKERS = /<!-- options: (\w+) -->\n[\s\S]*?<!-- \/options -->/g;

const cell = (text) => text.replaceAll("|", "\\|");

/** The markdown table of an interface's options. */
export function optionTable(name, all = sdkInterfaces()) {
  const rows = sdkOptions(name, all);
  if (rows.length === 0) throw new Error(`docs/components: no options of ${name} in skills/gallery/sdk/`);
  return [
    "| Option | Type | |",
    "| --- | --- | --- |",
    ...rows.map((row) => `| \`${row.name}\`${row.optional ? "" : " (required)"} | \`${cell(row.type)}\` | ${cell(row.note)} |`),
  ].join("\n");
}

/** Each card and its text with its tables made again. */
export function cardsWithTables() {
  const all = sdkInterfaces();
  return fs.readdirSync(CARDS).filter((name) => name.endsWith(".md")).map((name) => {
    const file = path.join(CARDS, name);
    const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    const made = text.replace(MARKERS, (_, type) => `<!-- options: ${type} -->\n${optionTable(type, all)}\n<!-- /options -->`);
    return { file, text, made };
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let written = 0;
  for (const { file, text, made } of cardsWithTables()) {
    if (made === text) continue;
    fs.writeFileSync(file, made);
    written += 1;
    console.log(`Wrote the option tables of ${path.relative(projectRoot, file)}`);
  }
  if (written === 0) console.log("The option tables are up to date.");
}
