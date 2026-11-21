import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parse } from "parse5";
import { cardsWithTables } from "../../src/cli/component-cards.mjs";
import { naturalize } from "../../src/editor/source.mjs";
import { chartDeclarationFailures } from "../../src/render/chart-declarations.mjs";
import { componentFailures } from "../../src/render/component-checks.mjs";
import { diagnoseReports } from "../../src/render/typecheck.mjs";
import { COMPONENTS, instancesOf } from "../../src/shared/components/index.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { newNames } from "../../src/shared/new-names.mjs";

// The component cards (docs/components/; docs/internals.md, "Components"), the maintainers'
// reference of each component (the Skill's package holds none): what they show works. Their option
// tables are the SDK's; every HTML example passes the checks a report gets (its components, its
// declared charts and diffs against the SDK) as its export checks it, its natural HTML made the
// kit's (an example of plain HTML, `<!-- you write -->`), and so does every script of the report's
// own chart types; the quick reference lists every card; the Component Catalog holds every component, as the
// kit's markup, which the tools leave as it is.

const cards = cardsWithTables();
for (const { file, text, made } of cards) {
  assert.equal(text, made, `${path.relative(projectRoot, file)}: an option table is out of date (node src/cli/component-cards.mjs)`);
}

// A page as a report writes it, no kit tag in it (the render puts them in): its script is checked
// against the kit's globals as the SDK declares them, whatever tags the source writes.
const page = (body, script = "") => `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>t</title>
</head>
<body>
<main class="doc-page" data-doc-id="card">
${body}
</main>
<script>
${script}
</script>
</body>
</html>
`;
const examples = [];
for (const { file, text } of cards) {
  const name = path.basename(file);
  const blocks = [...text.matchAll(/```(html|js)\n([\s\S]*?)```/g)];
  assert.ok(blocks.length > 0, `${name} has an example`);
  const html = blocks.filter(([, kind]) => kind === "html").map(([, , code]) => code);
  // A card's scripts define the types its markup declares (custom-chart.md): checked with it.
  const scripts = name === "custom-chart.md" ? blocks.filter(([, kind]) => kind === "js").map(([, , code]) => code) : [];
  examples.push({ name, html: naturalize(page(html.join("\n"), scripts.join("\n"))).text });
}
const reports = examples.map(({ name, html }) => ({ slug: name, html, htmlPath: path.join(projectRoot, "reports", "__cards__", `${name}.html`) }));
const failures = new Map(examples.map(({ name, html }) => [name, [...componentFailures(html), ...chartDeclarationFailures(html)]]));
for (const { htmlPath, text } of diagnoseReports(reports)) failures.get(path.basename(htmlPath ?? "", ".html"))?.push(text);
for (const [name, list] of failures) assert.deepEqual(list, [], `${name}:\n${list.join("\n")}`);

// The quick reference lists every card.
const quick = fs.readFileSync(path.join(projectRoot, "docs", "quick-reference.md"), "utf8");
for (const { file } of cards) assert.ok(quick.includes(`(components/${path.basename(file)})`), `docs/quick-reference.md lists ${path.basename(file)}`);

// The Component Catalog holds every component (but an instance of a package, which stands for no
// component of the kit's), and holds it as the kit's markup: naturalize changes nothing in it.
const galleryHtml = newNames(fs.readFileSync(path.join(projectRoot, "tests", "fixtures", "component-catalog", "doc.html"), "utf8")); // as the tools read it (its old names new)
const gallery = parse(galleryHtml);
for (const component of COMPONENTS.filter((entry) => entry.match && entry.id !== "installed")) {
  assert.ok(instancesOf(gallery, component).length > 0, `the Component Catalog shows ${component.id} (${component.match})`);
}
const rewritten = naturalize(galleryHtml).changes.map(({ line, rule }) => `line ${line}: ${rule}`);
assert.deepEqual(rewritten, [], `tests/fixtures/component-catalog/doc.html: naturalize would rewrite what the Component Catalog holds as the kit's markup:\n${rewritten.join("\n")}`);

console.log(`Checked the component cards: ${cards.length} cards, their option tables the SDK's, every example passing the checks (components, declarations, scripts), all listed in the quick reference, every component in the Component Catalog, as the kit's markup.`);
