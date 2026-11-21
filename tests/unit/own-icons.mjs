import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { BOOKMARK_ICON } from "../../src/editor/components/bookmark/icons.mjs";
import columns from "../../src/editor/components/columns/index.mjs";
import { EMBED_ICONS } from "../../src/editor/components/embed/icons.mjs";
import { FILE_ICONS } from "../../src/editor/components/file/icons.mjs";
import { FACE_ICON, PHOTO_ICON } from "../../src/editor/components/icons.mjs";
import { TOOL_ICONS } from "../../src/editor/components/media/icons.mjs";
import { EMPTY_STYLE } from "../../src/editor/components/placeholder.mjs";
import { TABS_ICON } from "../../src/editor/components/sheets/index.mjs";
import { icon as pickerIcon } from "../../src/editor/page/emoji-picker/icons.mjs";
import { TABLE_ICONS } from "../../src/editor/page/table/icons.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { pathHash, pathsIn, segmentsOf } from "./fixtures/icons/fingerprints.mjs";

// The editor's icons are its own plain line drawings (docs/editor.md, "Icons"): the project is
// released under the MIT license, so no icon is third-party artwork, and a drawing
// carries no size or color of its own: whoever shows it (a bar, a menu, a toolbar, the handle) sets
// them, so no rule has to be made !important to win over an icon.

const read = (file) => fs.readFileSync(path.join(projectRoot, file), "utf8");
const walk = (dir) => fs.readdirSync(path.join(projectRoot, dir), { withFileTypes: true })
  .flatMap((entry) => (entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]));

// The editor's drawings (分栏, bookmark, tabs, photo, face, file, embed, the media toolbar, table dots, the icon picker's):
// each a plain svg, its box the editor's 20 units, no style.
{
  const icons = {
    columns: columns.units.columns.icon, bookmark: BOOKMARK_ICON, tabs: TABS_ICON, photo: PHOTO_ICON, face: FACE_ICON,
    ...Object.fromEntries(Object.entries(FILE_ICONS).map(([name, svg]) => [`file ${name}`, svg])),
    ...Object.fromEntries(Object.entries(EMBED_ICONS).map(([name, svg]) => [`embed ${name}`, svg])),
    ...Object.fromEntries(Object.entries(TOOL_ICONS).map(([name, svg]) => [`media ${name}`, svg])),
    "table dots": TABLE_ICONS.dots,
  };
  for (const name of ["clock", "emojiFace", "leaf", "carrot", "soccerBall", "airplane", "lightBulbBright", "checkmarkCircle", "squareGrid2X2", "plusCircle", "xMarkCircle", "photo", "plusSmall", "magnifyingGlassSmall", "arrowIntersectRightSmall", "arrowCircleLoopBackwardSmall"]) icons[`picker ${name}`] = pickerIcon(name, 20);
  assert.ok(Object.keys(icons).length >= 34);
  for (const [name, svg] of Object.entries(icons)) {
    assert.match(svg, /^<svg [^>]*viewBox="0 0 20 20"[^>]*>.*<\/svg>$/s, `${name}: an svg of the editor's 20 units`);
    assert.doesNotMatch(svg, /\sstyle=/, `${name}: no inline style (its size and color are whoever shows it's)`);
    assert.doesNotMatch(svg, /<svg[^>]*\sfill=/, `${name}: a line drawing, not a filled artwork`);
  }
  assert.match(pickerIcon("plusSmall", 16), /^<svg width="16" height="16" viewBox/, "the picker sets the size an icon shows at as attributes");
}

// The gray bar's rules win without !important, and nothing writes a bar's class out by hand.
{
  assert.doesNotMatch(EMPTY_STYLE, /!important/, "the placeholder's rules need no !important over an icon");
  assert.doesNotMatch(EMPTY_STYLE, /:not\(\[style\]\)/, "every bar's icon is a line drawing, so no rule tells them apart by their style");
  const written = walk("src/editor").filter((file) => /\.(mjs|js)$/.test(file)).filter((file) => /\.ge-(image|file|bookmark|embed)-empty\b/.test(read(file).replace(/^\s*(\/\/|\*|\/\*).*$/gm, "")));
  assert.deepEqual(written, [], "a bar's class comes from barClass (placeholder-bar.mjs)");
}

// The kit's file row draws the same two drawings as the editor's bar and menu, as masks.
{
  const uriOf = (selector) => decodeURIComponent(new RegExp(`${selector.replace(/[.:]/g, "\\$&")} \\{ --doc-file-icon: url\\("data:image/svg\\+xml,([^"]*)"\\)`).exec(read("src/render/kit/styles/file.css"))[1]);
  const body = (svg) => svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  assert.equal(body(uriOf(".doc-file-link::before")), body(FILE_ICONS.upload));
  assert.equal(body(uriOf(".doc-file-link::after")), body(FILE_ICONS.download));
}

// The editor's line numbers and rows read the kit's custom properties (each with a fallback, as every read of --doc-* in the editor), not a copy of its numbers.
{
  const kit = read("src/render/kit/styles/code.css");
  const editor = read("src/editor/components/code/page.mjs");
  for (const property of ["--doc-code-number-size", "--doc-code-number-inset", "--doc-code-number-gap", "--doc-code-line-height"]) {
    assert.match(kit, new RegExp(`${property}: \\d+px;`), `${property} is declared by the kit's code block`);
    assert.match(editor, new RegExp(`var\\(${property}, \\d+px\\)`), `the editor's gutter reads ${property}, with a fallback`);
  }
  assert.doesNotMatch(editor, /(?:line-height|min-height): 20px/, "no row height of the open code is a copy of the kit's 20px");
  assert.doesNotMatch(kit, /\.doc-code-line \{[^}]*min-height: 20px|calc\(40 \* 20px/, "the kit's code rows take their height from --doc-code-line-height");
  assert.doesNotMatch(editor, /\.ge-code-number \{[^}]*padding: 0 12px 0 6px/, "the gutter's padding is not a copy of the kit's");
}

// No third-party artwork under src/: no path written there is one of the fingerprinted icon set's (whole), and none shares two of
// their long segments (a copy with a few numbers changed). The fixture holds fingerprints, not the paths (fixtures/icons/fingerprints.mjs).
{
  const known = JSON.parse(read("tests/unit/fixtures/icons/third-party-icons.json"));
  const wholes = new Set(known.whole);
  const segments = new Set(known.segments);
  assert.ok(wholes.size > 100 && segments.size > 500);
  const found = [];
  for (const file of walk("src").filter((name) => /\.(mjs|js|ts|tsx|css)$/.test(name))) {
    let text = read(file);
    text = text.replace(/url\((["'])data:image\/svg\+xml,(.*?)\1\)/g, (_, quote, uri) => { try { return decodeURIComponent(uri); } catch { return uri; } });
    for (const d of pathsIn(text)) {
      const shared = segmentsOf(d).filter((segment) => segments.has(segment)).length;
      if (wholes.has(pathHash(d)) || shared >= 2) found.push(`${file}: ${d.slice(0, 40)}…`);
    }
  }
  assert.deepEqual(found, [], "icon paths that are the fingerprinted third-party artwork");
}

console.log("Checked the editor's own icons: its drawings (columns, bookmark, file, embed, media toolbar, tabs, table dots, the icon picker's, the kit's copy, check and wrap) as plain 20-unit line drawings with no inline style, the gray bar needing no !important and its class made by barClass, the kit's file row masks equal to the editor's, the code gutter and its open code reading the kit's number and line-height properties (each with a fallback), and no path under src/ among the fingerprinted third-party artwork (whole or by two shared segments).");
