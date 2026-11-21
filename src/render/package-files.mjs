import { readFileSync } from "node:fs";
import { afterKitTags } from "./assets.mjs";
import { lineAt, parseReport } from "./report-tree.mjs";
import { NETWORK, usesIn } from "./typecheck.mjs";
import { currentCatalog, packagePath, packageTags } from "../shared/component-catalog.mjs";
import { BODY, isInstance } from "../shared/components/index.mjs";
import { ATTRIBUTE, PACKAGE_MARK } from "../shared/components/installed.mjs";
import { cssReferences, cssWithAddresses } from "../shared/css-references.mjs";
import { packageScript, scriptText, styleText } from "../shared/export-wrap.mjs";
import { attr, walk } from "../shared/html-tree.mjs";
import { mediaTypeOf } from "../shared/media.mjs";

// What a page and an export hold of the component packages a document has instances of: their tags
// (packageTags, src/shared/component-catalog.mjs), after the kit's, and in an export their inline
// copies, each marked with its package's id (PACKAGE_MARK). A package that does not load, or whose
// apiVersion this Gallery does not run, is in no catalog's `packages`, and gets nothing.
//
// An export holds a package's script and style inline, each page's own, the pictures and fonts its
// style names as data: addresses: the files of its `assets` are what a style can name, and no other
// file of its folder reaches a page. What an export's policy would refuse is said by
// packageExportFailures, which exportFailures calls, so that gallery check says it first.

// A page whose text says nothing of an instance need not be parsed to know it has none.
const SPELLED = new RegExp(ATTRIBUTE, "i");

/**
 * The packages a page has instances of, in the order it names them: what stands on its elements, as
 * the checks read it (`tree`: the page parsed, where the caller has it), so that a code sample or
 * prose about a package loads nothing, and what an instance holds is that instance's, but for what
 * its slots hold, the document's blocks, another instance among them. `catalog`: the workspace's
 * packages, else the one in use, read only when the page spells an instance (a command's first read of
 * it hashes every package's files: some 300 ms of a gallery check of a page with none).
 */
export function packagesOf(html, catalog = null, tree = null) {
  if (!SPELLED.test(html)) return [];
  const { packages } = catalog ?? currentCatalog();
  const ids = new Set();
  walk(tree ?? parseReport(html), (node) => { if (isInstance(node)) ids.add(attr(node, ATTRIBUTE)); }, BODY); // one in a slot too: what a slot holds is the document's
  return [...ids].map((id) => packages.get(id)).filter(Boolean);
}

/** The page with the tags of `packages`, after the kit's. */
export function withPackageTags(html, packages) {
  if (packages.length === 0) return html;
  const tags = packages.map(packageTags);
  return afterKitTags(html, { styles: tags.flatMap(({ styles }) => styles), scripts: tags.flatMap(({ scripts }) => scripts) });
}

/** A file of a package as words, no byte-order mark, or null. */
export function packageText(found, file) {
  try {
    return readFileSync(packagePath(found, file)).toString("utf8").replace(/^\uFEFF/, "");
  } catch {
    return null;
  }
}

// An address of a style that loads nothing of the package's: itself a picture, a place in the page, or none.
const NO_FILE = /^(?:data:|#|$)/i;
const ELSEWHERE = /^(?:[a-z][a-z0-9+.-]*:|\/)/i;
// The file of the package a style's address names.
const ownFile = (address) => address.replace(/^\.\//, "").replace(/[?#].*$/, "");

// A package's style with each file of it the style names in it, as a data: address.
const styleWithFiles = (found, css) => cssWithAddresses(css, cssReferences(css), ({ value, kind }) => {
  const file = ownFile(value);
  if (kind === "import" || NO_FILE.test(value) || !found.files.includes(file)) return null;
  const real = packagePath(found, file);
  return real && `data:${mediaTypeOf(file)};base64,${readFileSync(real).toString("base64")}`;
});

// What an export's policy refuses a script: the network, and code made from words.
const MAKES_CODE = new Set(["eval", "Function"]);
const REFUSED = new Set([...NETWORK, ...MAKES_CODE]);
const SAID = { call: (name) => `calls ${name}(…)`, new: (name) => `creates new ${name}(…)`, use: (name) => `uses ${name}` };

/** What an export cannot hold of a package's style: what is not made a data: address (an @import, an address elsewhere, a file its `assets` do not name), [{ line, what }]. */
export function styleExportProblems(found) {
  if (!found.files.includes("style.css")) return [];
  const css = packageText(found, "style.css") ?? "";
  return cssReferences(css).flatMap(({ value, kind, index }) => {
    const what = kind === "import" ? "has an @import, which an export cannot hold: write what it imports into style.css"
      : NO_FILE.test(value) ? null
        : ELSEWHERE.test(value) ? `loads ${value}: external resources are not portable`
          : found.files.includes(ownFile(value)) ? null
            : `names ${value}, which an export cannot hold: put the file in the package and name it in its assets`;
    return what ? [{ line: lineAt(css, index), what }] : [];
  });
}

/** What the export's policy refuses of a package's script, [{ line, what }]. */
export function scriptExportProblems(found) {
  if (!found.files.includes("kit.js")) return [];
  const code = packageText(found, "kit.js") ?? "";
  return usesIn(code, REFUSED).filter(({ name, how }) => how !== "use" || !MAKES_CODE.has(name)).map(({ name, how, at }) => ({
    line: lineAt(code, at),
    what: `${SAID[how](name)}: ${MAKES_CODE.has(name) ? "an export runs no code made from words" : "the export blocks the network; put its data in the instance"}`,
  }));
}

/** What an export of a document cannot hold of `packages`, those it uses, each saying the package. */
export const packageExportFailures = (packages) => packages.flatMap((found) => [
  ...styleExportProblems(found).map(({ what }) => `${found.id}: its style.css ${what}`),
  ...scriptExportProblems(found).map(({ line, what }) => `${found.id}: line ${line} of its kit.js ${what}`),
]);

// The inline copy of the file a package's tag loads: <style> or <script>, its mark kept.
function copyOf(found, file) {
  const mark = `${PACKAGE_MARK}="${found.id}"`;
  const text = packageText(found, file);
  if (text === null) return null;
  return file === "kit.js" ? `<script ${mark}>${scriptText(packageScript(text))}</script>` : `<style ${mark}>${styleText(styleWithFiles(found, text))}</style>`;
}

/**
 * The page with each tag of a package's replaced with its inline copy, the tags found on the page's
 * tree (one a code sample spells stays as it is). One whose package or file is gone stays linked, which
 * the export then refuses. Called before the kit's text is in, so that a page of no package, which
 * spells no mark, is not parsed. `catalog`: as packagesOf's, read only when the page spells a mark.
 */
export function withPackageCopies(html, catalog = null) {
  if (!html.includes(PACKAGE_MARK)) return html;
  const { packages } = catalog ?? currentCatalog();
  const copies = [];
  walk(parseReport(html), (node) => {
    const found = packages.get(attr(node, PACKAGE_MARK));
    const file = node.tagName === "link" ? "style.css" : node.tagName === "script" && attr(node, "src") !== undefined ? "kit.js" : null;
    const at = node.sourceCodeLocation;
    const copy = found && file && at ? copyOf(found, file) : null;
    if (copy) copies.push({ start: at.startOffset, end: at.endOffset, copy });
  }, { inTemplates: false });
  let result = "";
  let cursor = 0;
  for (const { start, end, copy } of copies) {
    result += html.slice(cursor, start) + copy;
    cursor = end;
  }
  return result + html.slice(cursor);
}
