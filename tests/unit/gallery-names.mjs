import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
import { projectRoot } from "../../src/shared/paths.mjs";

// Gallery's own names (decision E of the CLI, 2026-10-28): the editor's classes and marks rs-* /
// data-rs-* / --rs-* are ge-* / data-ge-* / --ge-*, the server's routes are under /__gallery/
// (/__gallery/edit/, /__gallery/events, /__gallery/workspace/, /__gallery/transfer/; no old alias),
// the token header X-Gallery-Token, the editor's storage keys gallery-edit:* (carried from their old
// prefix: tests/unit/renamed.mjs), the window globals __gallery*, the environment GALLERY_* (no
// fallback), the server's log prefix [gallery]. None of the old names is left but where stored data
// or an older folder is read: the storage carry, the old edit state's folder, the marks a file may
// keep, and the tests and paragraphs of those.

const OLD = [
  ["data-rs-", /(?<![\w-])data-rs-/],
  ["--rs-", /(?<![\w-])--rs-/],
  ["rs-", /(?<![\w$-])rs-[a-z0-9]/],
  ["report-edit", /report-edit/i],
  ["report-preview", /report-preview/],
  ["__reportEdit", /__reportEdit/],
  ["__reportStudio", /__reportStudio/],
  ["/__workspace", /\/__workspace|\\\/__workspace/],
  ["/__transfer", /\/__transfer|\\\/__transfer/],
  ["REPORT_STUDIO_", /REPORT_STUDIO_/],
  ["rsKey", /\brsKey\b/],
];

// Where an old name may stand: a whole file (the migration's own), or the lines of a file that match.
const ALLOWED = new Map([
  ["src/shared/renamed-storage.mjs", true], // the storage carry (PREFIXES)
  ["src/shared/workspace.mjs", true], // the old edit state's folder (oldStateOf), read by the migrations
  ["src/editor/page/core.mjs", /MARKER|data-rs-\*, their name/], // a file's old mark is no text of it
  ["src/editor/page/clipboard/own/describe.mjs", /EDITOR_MARK|data-rs-\*, their name/], // nor goes with a copy
  ["src/render/kit/ui.js", /data-\(\?:ge\|rs\)|data-rs-\* before/], // nor with an export of the view
  ["src/render/asset-references.mjs", /data-rs-/], // nor stands twice in the preview
  ["src/shared/components/installed.mjs", /data-rs-…\s*$|data-rs-… before/], // nor comes in with a page someone else wrote (servedMarks)
  ["tests/unit/gallery-names.mjs", true],
  ["tests/unit/renamed.mjs", true], // the storage carry
  ["tests/unit/workspace-layout.mjs", /\.cache", "report-edit"/],
  ["tests/unit/skill-install.mjs", /\.cache", "report-edit"/],
  ["tests/unit/cli.mjs", /\.cache", "report-edit"/],
  ["tests/unit/references.mjs", /data-rs-/],
  ["tests/browser/scenarios.mjs", /report-edit:|data-rs-/], // renamedStorage: an old page's buffer
  ["docs/workbench.md", /^Until 2026-10-28 the editor's keys/],
  ["docs/editor.md", /their name before 2026-10-28/],
  ["docs/internals.md", /\.cache\/report-edit/],
]);

const roots = ["src", "tests", "docs", "skills", "README.md", "package.json"];
const files = roots.flatMap(function files(entry) {
  const full = path.join(projectRoot, entry);
  if (!fs.existsSync(full)) return [];
  if (!fs.statSync(full).isDirectory()) return /\.(mjs|js|ts|tsx|mts|css|md|html|json|yaml)$/.test(entry) ? [entry] : [];
  return fs.readdirSync(full).filter((name) => !(entry === "src/shared/emoji" && name === "data") && name !== "node_modules").flatMap((name) => files(`${entry}/${name}`));
});
assert.ok(files.length > 300, "the scan reads the sources");
const found = [];
for (const file of files) {
  const allowed = ALLOWED.get(file);
  if (allowed === true) continue;
  fs.readFileSync(path.join(projectRoot, file), "utf8").split("\n").forEach((line, index) => {
    for (const [name, pattern] of OLD) {
      if (pattern.test(line) && !(allowed && allowed.test(line))) found.push(`${file}:${index + 1}: ${name}`);
    }
  });
}
assert.deepEqual(found, [], `old names left:\n${found.join("\n")}`);
for (const [file] of ALLOWED) assert.ok(fs.existsSync(path.join(projectRoot, file)), `${file} is still there (the allowed list names only files that are)`);

// ---------- the routes: one prefix, no old alias ----------
const { createRoutes } = await import("../../src/server/routes.mjs");
assert.equal(typeof createRoutes, "function");
const routes = fs.readFileSync(path.join(projectRoot, "src", "server", "routes.mjs"), "utf8");
for (const route of ["/__gallery/edit/commit", "/__gallery/edit/hand-in", "/__gallery/events", "\\/__gallery\\/workspace\\/", "\\/__gallery\\/transfer\\/"]) assert.ok(routes.includes(route), `routes.mjs answers ${route}`);
const { mediaUrl } = await import("../../src/shared/media.mjs");
assert.equal(mediaUrl("asset", "alpha", "assets/a.png"), "/__gallery/edit/asset/alpha/assets/a.png");
const { iconUrl } = await import("../../src/shared/emoji/icon-value.mjs");
assert.ok(iconUrl("🚀").startsWith("/__gallery/edit/icon?"));

// ---------- the marks a file may keep under the old name: never taken for the file's own ----------
{
  const { window } = new JSDOM("<!doctype html><main></main>");
  const saved = ["document", "window", "Node", "HTMLElement", "getComputedStyle"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  for (const name of ["document", "Node", "HTMLElement"]) Object.defineProperty(globalThis, name, { value: window[name] ?? window.document, configurable: true, writable: true });
  try {
    const { copyOf } = await import("../../src/editor/page/clipboard/own/describe.mjs");
    const host = window.document.createElement("div");
    host.innerHTML = '<figure class="doc-image" data-ge-unit="3" data-rs-src="assets/a.png" data-block-id="b1"><img src="a.png" data-rs-keep="x"></figure>';
    const copy = copyOf(host.firstElementChild);
    assert.ok(![copy, ...copy.querySelectorAll("*")].some((node) => [...node.attributes].some(({ name }) => /^data-(?:ge|rs)-/.test(name))), "a copy takes the editor's marks off, under either name");
  } finally {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}
// The preview's own say of a picture's file, under either name in the file: tests/unit/references.mjs.

console.log(`Checked Gallery's own names (2026-10-28): none of rs-*, data-rs-*, --rs-*, report-edit, report-preview, __reportEdit*, __reportStudio*, /__workspace, /__transfer, REPORT_STUDIO_*, rsKey in ${files.length} files of src/, tests/, docs/ and the skill, but in the migration's own lines; the routes under /__gallery/ with no old alias; an old editor mark a file may keep never copied.`);
