import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { ASSETS } from "./assets.mjs";
import { COLOR_NAMES } from "../shared/colors.mjs";
import { FOLD_DOTS } from "../shared/code-folds.mjs";
import { GRAMMARS, grammarLine } from "../shared/code-grammars.mjs";
import { FORMULA_MARK, TEX_MARK } from "../shared/math-marks.mjs";
import { kitPublicDirectory, kitSourceDirectory, release } from "../shared/paths.mjs";
import { wordsCss } from "./kit/words.js";
import { lookCss } from "./look-css.mjs";

// The shared kit (docs/render.md, "The kit"): what each file a report loads from /kit/ holds, made
// from the sources in src/render/kit/. Writing the preview's public/kit, inlining an export and
// the tests all take a kit file from here, never from its sources.
// Which files there are and how each is made is the assets' list (assets.mjs, `build`):
//
//   read     a source file as it is
//   bundle   an esbuild bundle of a source and what it imports: one self-contained browser script
//            (an IIFE: no runtime imports, workers, fetch or WASM); with `grammars` (code.js), Shiki's
//            grammars before it, a line each (grammarLines: what an export keeps a few of)
//   styles   the stylesheets an index lists (`@import "./name.css";`), joined in its order as they
//            are; every stylesheet beside the index must be listed once. A stylesheet writes the
//            nine colors' classes as @text-colors and @highlight-colors (the list of
//            .doc-text-<color> or .doc-highlight-<color>, src/shared/colors.mjs), so that no
//            sheet spells the nine again, the marks of a formula not drawn as @tex-mark and
//            @formula-mark (CSS images, src/shared/math-marks.mjs), and the kit's words it shows as @kit-words; (the root's
//            --doc-word-<key> in Chinese and English, from the kit's table: kit/words.js wordsCss), and
//            the rules of a document's look as @kit-look; (look-css.mjs lookCss, from the tokens' values)
//
// The names and what they do for a report (its tags, their order, the globals they define) are the
// kit's contract (docs/report-contract.md); how a file is made from its sources is not.

const KIT = Object.fromEntries(ASSETS.filter((asset) => asset.file).map((asset) => [asset.file, asset.build]));

/** The files of /kit/, in the order they are written. */
export const kitFileNames = Object.keys(KIT);

const source = (file) => path.join(kitSourceDirectory, file);
// An entry's `options` are an object, or a function that makes it (read when the file is made, for
// what a build takes from the files as they are then: assets.mjs, the runtime's descriptions).
const bundleOptions = (entry, options, overrides) => ({
  entryPoints: [source(entry)], bundle: true, write: false, format: "iife", platform: "browser", target: "es2022",
  ...(typeof options === "function" ? options() : options), ...overrides,
});
const entryOf = (name) => {
  const entry = KIT[name];
  if (!entry) throw new Error(`src/render/kit-build.mjs: no kit file "${name}"`);
  return entry;
};

// Bundles are built once per process unless `fresh` (a kit source or a component's description changed under the live preview);
// files read as they are are read again every time.
const bundles = new Map();

// The stylesheets an index lists, in its order, checked against the files beside it.
function stylesheets(index, text) {
  const listed = [...text.matchAll(/^@import\s+"\.\/([a-z0-9-]+\.css)";\s*$/gm)].map((match) => match[1]);
  const present = fs.readdirSync(path.dirname(source(index))).filter((name) => name.endsWith(".css") && name !== path.basename(index));
  const problems = [
    ...present.filter((name) => !listed.includes(name)).map((name) => `${name} is not listed`),
    ...listed.filter((name, at) => !present.includes(name) || listed.indexOf(name) !== at).map((name) => `${name} is listed but missing, or listed twice`),
  ];
  if (problems.length > 0) throw new Error(`src/render/kit/${index}: ${problems.join("; ")}`);
  return listed.map((name) => path.join(path.dirname(index), name));
}
// The nine colors' class lists a stylesheet asks for (`:is(@highlight-colors)`).
const colorClasses = (text) => text.replace(/@(text|highlight)-colors\b/g, (_, kind) => COLOR_NAMES.map((name) => `.doc-${kind}-${name}`).join(", "));
// The three dots of a folded code line (@fold-dots; src/shared/code-folds.mjs: the page editor draws the same ones), and
// the TeX logo and √x of a formula KaTeX could not read (@tex-mark, @formula-mark; src/shared/math-marks.mjs: the editor's too).
// A document's look (@kit-look;) is worked out from the tokens' values the joined text gives.
const joined = (texts) => {
  const text = colorClasses(texts.join("\n")).replaceAll("@fold-dots", FOLD_DOTS).replaceAll("@tex-mark", TEX_MARK).replaceAll("@formula-mark", FORMULA_MARK).replace(/^@kit-words;$/m, () => wordsCss());
  return text.replace(/^@kit-look;$/m, () => lookCss(text));
};

// The lines of Shiki's grammars code.js carries (src/shared/code-grammars.mjs GRAMMARS, in its order), each
// checked to embed what the list says it does (what an export that carries it carries with it).
async function grammarLines() {
  const lines = ["// The grammars of the languages the kit colors, a line each (src/shared/code-grammars.mjs: an export keeps those its code uses).\n"];
  for (const [name, embedded] of Object.entries(GRAMMARS)) {
    const grammar = (await import(`shiki/langs/${name}.mjs`)).default.find((each) => each.name === name);
    if (!grammar) throw new Error(`src/shared/code-grammars.mjs: Shiki has no grammar ${name}`);
    const theirs = grammar.embeddedLangs ?? [];
    if (theirs.join() !== embedded.join()) throw new Error(`src/shared/code-grammars.mjs: Shiki's ${name} embeds ${theirs.join(", ") || "nothing"}, not ${embedded.join(", ") || "nothing"}`);
    lines.push(grammarLine(name, grammar));
  }
  return lines.join("");
}
// A bundle's text: what esbuild made of its entry, after its grammars (code.js's).
async function bundled(entry, overrides) {
  const text = (await build(bundleOptions(entry.bundle, entry.options, overrides))).outputFiles[0].text;
  return entry.grammars ? (await grammarLines()) + text : text;
}

/** A bundled kit file made with other esbuild options than its entry's (tests: a runtime with other descriptions), never kept. */
export async function buildKitFile(name, overrides) {
  const entry = entryOf(name);
  if (!entry.bundle) throw new Error(`src/render/kit-build.mjs: "${name}" is not a bundle`);
  return bundled(entry, overrides);
}

/** The text of /kit/<name>: in the release, the package's kit/<name> as the release build made it (no esbuild there). */
export function loadKitFile(name, { fresh = false } = {}) {
  const entry = entryOf(name);
  if (release) return fs.promises.readFile(path.join(kitPublicDirectory, name), "utf8");
  if (entry.read) return fs.promises.readFile(source(entry.read), "utf8");
  if (entry.styles) {
    return fs.promises.readFile(source(entry.styles), "utf8")
      .then((text) => Promise.all(stylesheets(entry.styles, text).map((file) => fs.promises.readFile(source(file), "utf8"))))
      .then(joined);
  }
  if (fresh || !bundles.has(name)) {
    const made = bundled(entry);
    made.catch(() => bundles.delete(name)); // a failed build is tried again next time
    bundles.set(name, made);
  }
  return bundles.get(name);
}
