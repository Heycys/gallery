// Usage: npm run release:build
// A maintainers' script: the npm package @heycys/gallery as it is published, built into release/npm/
// (docs/internals.md, "Packaging"), from this checkout; nothing is published. The package runs with no
// Vite, no esbuild, no TypeScript package, no canvas and nothing installed but what its package.json
// lists, and writes nothing into its own folder (a global install may be read-only):
//   dist/      the CLI (dist/cli.mjs), the server (dist/server.mjs: src/server/start.mjs), the
//              conversion worker (dist/worker.mjs) and gallery --version's check of the registry
//              (dist/update-fetch.mjs: src/cli/update-fetch.mjs), bundled by esbuild with their shared
//              chunks beside them (one folder: the worker and the check are found beside the chunk that
//              starts them)
//   web/       the workbench (src/workbench/app/, React) built by vite build: index.html and assets/
//   browser/   the editor's browser modules the preview serves, at their path under src/, and the emoji data
//   kit/, vendor/   the shared kit built, the vendors' files (d3, KaTeX and its fonts, mhchem) copied
//   vendor/typescript/, vendor/types/@types/   TypeScript minified with the libraries the type check
//              reads, and d3's types (src/render/typescript.mjs, typecheck.mjs)
//   vendor/pdfjs/   pdf.js's legacy build, minified, with its CMaps and standard fonts (a PDF's text)
//   starter/, assets/writing-preferences.md, sdk/   the new document, the default 写作偏好, the SDK's types
//   assets/preference-examples/   写作偏好's two examples (project report, Chinese and English) its first-open note offers
//   packs/     Gallery's own block packs, a folder each (src/packs/: a workspace's first start installs them)
//   skill/     the thin skill gallery skill install writes (SKILL.md, references/, sdk/, agents/)
//   release.json   the version and the stamps of its files (src/server/stamps.mjs)
//   package.json, LICENSE, README.md, THIRD-PARTY-NOTICES.md, bin/gallery.mjs
// It removes only release/npm/, and ends with the package's size as npm pack counts it.
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { scriptArguments, usageFailureText, usageOf } from "./arguments.mjs";

const { positional } = await scriptArguments(import.meta.url);
if (positional.length > 0) {
  console.error(usageFailureText(usageOf(import.meta.url), `Unknown argument: ${positional[0]} (it takes none).`));
  process.exit(2);
}

const root = path.resolve(import.meta.dirname, "..", "..");
const out = path.join(root, "release", "npm");
const modules = path.join(root, "node_modules");
const require = createRequire(import.meta.url);
const metadata = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const started = Date.now();

const sizeOf = (target) => {
  const stat = fs.statSync(target, { throwIfNoEntry: false });
  if (!stat) return { files: 0, bytes: 0 };
  if (stat.isFile()) return { files: 1, bytes: stat.size };
  return fs.readdirSync(target, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile())
    .reduce((total, entry) => ({ files: total.files + 1, bytes: total.bytes + fs.statSync(path.join(entry.parentPath, entry.name)).size }), { files: 0, bytes: 0 });
};
const megabytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
const said = (step, ...targets) => {
  const { files, bytes } = targets.map((target) => sizeOf(path.join(out, target))).reduce((a, b) => ({ files: a.files + b.files, bytes: a.bytes + b.bytes }), { files: 0, bytes: 0 });
  console.log(`${step}: ${files} files, ${megabytes(bytes)}`);
};
const copy = (from, to) => {
  fs.mkdirSync(path.dirname(path.join(out, to)), { recursive: true });
  fs.cpSync(from, path.join(out, to), { recursive: true });
};
const write = (to, text) => {
  fs.mkdirSync(path.dirname(path.join(out, to)), { recursive: true });
  fs.writeFileSync(path.join(out, to), text);
};

// (1) Only release/npm/ goes (release/skill/ and the skill's ZIP are npm run skill:package's).
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// The source checkout's modules, as the build reads them (this process is no release: its paths are the
// checkout's). A workspace of its own, which nothing here reads or writes, so that importing them finds no other.
process.env.GALLERY_WORKSPACE = fs.mkdtempSync(path.join((await import("node:os")).tmpdir(), "gallery-release-build-"));
const { writeSharedAssets } = await import("../render/pipeline.mjs");
const { ASSETS, mhchemSourcePath, publicFileOf } = await import("../render/assets.mjs");
const { browserDirectory, kitPublicDirectory, launcherFile, sdkDirectory, skillSourceDirectory, vendorDirectory } = await import("../shared/paths.mjs");
const { servedEmojiData, servedModule } = await import("../server/routes.mjs");

// (2) The kit built and the vendors' files copied, as the dev server's predev writes public/kit and
// public/vendor, and KaTeX's mhchem beside its files (the editor's formulas load it: /__gallery/edit/mhchem.js).
await writeSharedAssets({ fresh: true, kit: path.join(out, "kit"), vendor: path.join(out, "vendor") });
copy(mhchemSourcePath, path.join("vendor", "katex", "contrib", "mhchem.min.js"));
said("kit", "kit");
said("vendor (d3, KaTeX)", "vendor");

// (3) The CLI, the server, the worker and the registry's check bundled. What the release never runs is
// stood in for: the build tools (esbuild: the kit's build and the components' runtime, only in a source checkout), Vite,
// TypeScript (loaded by its file: src/render/typescript.mjs), pdf.js (by its file: transfer/import.mjs)
// and shiki (the kit's code.js, built here), each name a function that throws when called; the metafile
// then says none of them was bundled. jsdom is bundled, its two reads of its own files made in the
// bundle (its default stylesheet's text put in; the synchronous XMLHttpRequest's worker, which the
// import never uses, named only).
// The editor's browser modules are not bundled: the server imports them from browser/ (step 5), the
// files the preview serves the page, as the source checkout's server imports them from src/. Several
// of them make the page's own scripts of their functions' text (shared/i18n/index.mjs languageScript,
// editor/page/margin.mjs, shared/qa-levels.mjs…), which a bundle's renamed or minified names would break,
// and one copy serves both. Those that reach a package (shared/new-names.mjs: parse5), which no browser
// imports and browser/ cannot resolve, are bundled.
const browserFiles = fs.readdirSync(browserDirectory, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name))
  .filter((file) => servedModule(file) || servedEmojiData(file) || /[\\/]shared[\\/]emoji[\\/]data[\\/](LICENSE-[a-z]+\.txt|README\.md)$/.test(file)).sort();
const servedFiles = new Set(browserFiles.filter(servedModule).map((file) => path.resolve(file)));
const importsOf = (file) => [...fs.readFileSync(file, "utf8").matchAll(/(?:^|\n)\s*(?:import|export)[^"';]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|(?:^|\n)\s*import\s*["']([^"']+)["']/g)]
  .map((match) => match[1] ?? match[2] ?? match[3]).filter((specifier) => !specifier.startsWith("node:"));
// Those that reach a package, through any of the modules they import (until nothing more is found).
const imported = new Map([...servedFiles].map((file) => [file, importsOf(file)]));
const nodeOnlyFiles = new Set([...servedFiles].filter((file) => imported.get(file).some((specifier) => !specifier.startsWith("."))));
for (let grown = true; grown;) {
  grown = false;
  for (const [file, specifiers] of imported) {
    if (nodeOnlyFiles.has(file) || !specifiers.some((specifier) => nodeOnlyFiles.has(path.resolve(path.dirname(file), specifier)))) continue;
    nodeOnlyFiles.add(file);
    grown = true;
  }
}
const nodeOnly = (file) => nodeOnlyFiles.has(file);
const externalModules = new Set([...servedFiles].filter((file) => !nodeOnly(file)));
const bundledServed = [...servedFiles].filter((file) => !externalModules.has(file)).map((file) => path.relative(browserDirectory, file).split(path.sep).join("/"));
const browserModules = {
  name: "browser-modules",
  setup(build) {
    build.onResolve({ filter: /^\./ }, (args) => {
      const file = path.resolve(args.resolveDir, args.path);
      if (!externalModules.has(file)) return undefined;
      return { path: `../browser/${path.relative(browserDirectory, file).split(path.sep).join("/")}`, external: true };
    });
  },
};

const esbuild = await import("esbuild");
const STUBS = {
  esbuild: ["build", "buildSync", "context", "transform", "transformSync", "formatMessages", "analyzeMetafile"],
  vite: ["build", "createServer", "defineConfig", "preview"],
  "@vitejs/plugin-react": [],
  typescript: [],
  "pdfjs-dist": [],
  shiki: ["createHighlighter", "codeToHtml"],
};
const stubOf = (name) => `const missing = () => { throw new Error("${name} is not in the release: Gallery ${metadata.version} calls it only in a source checkout"); };\n`
  + STUBS[name].map((exported) => `export const ${exported} = missing;`).join("\n") + "\nexport default new Proxy({}, { get: missing });\n";
const stubs = {
  name: "release-stubs",
  setup(build) {
    build.onResolve({ filter: /^(esbuild|vite|@vitejs\/plugin-react|typescript|pdfjs-dist|shiki)(\/.*)?$/ }, (args) => ({ path: Object.keys(STUBS).find(name => args.path === name || args.path.startsWith(name + "/")), namespace: "release-stub" }));
    build.onLoad({ filter: /.*/, namespace: "release-stub" }, (args) => ({ contents: stubOf(args.path), loader: "js" }));
    // jsdom's own files, read where they lie in a package: not in a bundle.
    build.onLoad({ filter: /[\\/]jsdom[\\/]lib[\\/]jsdom[\\/]living[\\/](css[\\/]helpers[\\/]computed-style|xhr[\\/]XMLHttpRequest-impl)\.js$/ }, async (args) => {
      let text = await fs.promises.readFile(args.path, "utf8");
      const css = path.join(modules, "jsdom", "lib", "jsdom", "browser", "default-stylesheet.css");
      text = text.replace(/fs\.readFileSync\(\s*path\.resolve\(__dirname, "\.\.\/\.\.\/\.\.\/browser\/default-stylesheet\.css"\),\s*\{ encoding: "utf-8" \}\s*\)/, () => JSON.stringify(fs.readFileSync(css, "utf8")));
      text = text.replace(`require.resolve("./xhr-sync-worker.js")`, '"xhr-sync-worker.js (not in the release: synchronous XMLHttpRequest)"');
      if (/default-stylesheet\.css|require\.resolve\(/.test(text)) throw new Error(`jsdom changed: ${args.path} still reads its own files`);
      return { contents: text, loader: "js" };
    });
    // css-tree (jsdom's CSS) reads its JSON with a require of its own (createRequire): a plain require
    // here, which the bundle takes in.
    build.onLoad({ filter: /[\\/]css-tree[\\/]lib[\\/](data|data-patch|version)\.js$/ }, async (args) => {
      const text = (await fs.promises.readFile(args.path, "utf8")).replace(/^const require = createRequire\(import\.meta\.url\);$/m, "");
      if (/createRequire\(import\.meta\.url\)\s*;?\s*$/m.test(text.replace(/^import .*$/gm, ""))) throw new Error(`css-tree changed: ${args.path} still makes a require of its own`);
      return { contents: text, loader: "js" };
    });
  },
};
const bundled = await esbuild.build({
  absWorkingDir: root,
  entryPoints: { cli: "src/cli/gallery.mjs", server: "src/server/start.mjs", worker: "src/transfer/worker.mjs", "update-fetch": "src/cli/update-fetch.mjs" },
  bundle: true, platform: "node", format: "esm", target: "node22", minify: true, splitting: true,
  outdir: path.join(out, "dist"), chunkNames: "chunk-[hash]", outExtension: { ".js": ".mjs" },
  legalComments: "none", metafile: true, logLevel: "warning",
  // What CommonJS code in the bundle reads (jsdom, puppeteer's ws): as an ES module has none of them.
  banner: { js: 'import { createRequire as __galleryRequire } from "node:module"; import { fileURLToPath as __galleryPath } from "node:url"; const require = __galleryRequire(import.meta.url); const __filename = __galleryPath(import.meta.url); const __dirname = __galleryPath(new URL(".", import.meta.url));' },
  // Optional native helpers of ws and jsdom, required only inside a try (none installed: their JavaScript runs).
  external: ["bufferutil", "utf-8-validate", "canvas"],
  plugins: [browserModules, stubs],
});
const inputs = Object.keys(bundled.metafile.inputs);
const forbidden = inputs.filter((input) => /node_modules\/(typescript|vite|esbuild|@esbuild|rolldown|@rolldown|pdfjs-dist|shiki|@shikijs|@napi-rs)\//.test(input));
if (forbidden.length > 0) throw new Error(`The release bundles what it must not run: ${forbidden.slice(0, 5).join(", ")}`);
const bundledPackages = [...new Set(inputs.map((input) => /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(input)?.[1]).filter(Boolean))].sort();
console.log(`bundled: ${bundledPackages.join(", ")}`);
said(`dist (${bundledPackages.length} packages bundled; the browser modules from browser/ but ${bundledServed.join(", ")})`, "dist");

// (4) The workbench, built by Vite (its own options here, not src/vite.config.ts, which loads the dev
// server's plugin): web/index.html, its assets/ named by their hashes.
const { buildWorkbench } = await import("./build-workbench.mjs");
const staging = fs.mkdtempSync(path.join(path.dirname(out), "web-"));
await buildWorkbench(root, staging);
copy(path.join(staging, "assets"), "web/assets");
copy(path.join(staging, "index.html"), "web/index.html");
fs.rmSync(staging, { recursive: true, force: true });
said("web (the workbench)", "web");

// (5) The editor's browser modules and the emoji data, at their path under src/.
for (const file of browserFiles) copy(file, path.join("browser", path.relative(browserDirectory, file)));
said("browser (the editor's modules, the emoji data)", "browser");

// (6) TypeScript minified, with the libraries es2022, dom and dom.iterable reach (/// <reference lib>),
// a CommonJS package of its own; d3's types; pdf.js's text reader.
const typescriptLib = path.join(modules, "typescript", "lib");
const minified = await esbuild.build({ entryPoints: [path.join(typescriptLib, "typescript.js")], bundle: false, minify: true, format: "cjs", platform: "node", target: "node22", write: false, legalComments: "inline", logLevel: "warning" });
write("vendor/typescript/typescript.js", minified.outputFiles[0].text);
write("vendor/typescript/package.json", `${JSON.stringify({ type: "commonjs", version: require("typescript/package.json").version }, null, 2)}\n`);
copy(path.join(modules, "typescript", "LICENSE.txt"), "vendor/typescript/LICENSE.txt");
const libraries = new Set();
const reach = (name) => {
  if (libraries.has(name)) return;
  libraries.add(name);
  const text = fs.readFileSync(path.join(typescriptLib, `lib.${name}.d.ts`), "utf8");
  for (const [, next] of text.matchAll(/\/\/\/\s*<reference lib="([^"]+)"\s*\/>/g)) reach(next);
};
["es2022", "dom", "dom.iterable"].forEach(reach);
for (const name of libraries) copy(path.join(typescriptLib, `lib.${name}.d.ts`), `vendor/typescript/lib.${name}.d.ts`);
for (const name of fs.readdirSync(path.join(modules, "@types")).filter((name) => /^(d3(-.*)?|geojson)$/.test(name))) {
  for (const file of fs.readdirSync(path.join(modules, "@types", name)).filter((file) => file.endsWith(".d.ts") || file === "package.json" || file === "LICENSE")) {
    copy(path.join(modules, "@types", name, file), `vendor/types/@types/${name}/${file}`);
  }
}
said(`vendor/typescript (${libraries.size} libraries)`, "vendor/typescript");
said("vendor/types (d3's types)", "vendor/types");
const pdfjs = path.dirname(require.resolve("pdfjs-dist/package.json"));
for (const file of ["pdf.min.mjs", "pdf.worker.min.mjs"]) copy(path.join(pdfjs, "legacy", "build", file), `vendor/pdfjs/legacy/build/${file}`);
copy(path.join(pdfjs, "cmaps"), "vendor/pdfjs/cmaps");
copy(path.join(pdfjs, "standard_fonts"), "vendor/pdfjs/standard_fonts");
copy(path.join(pdfjs, "LICENSE"), "vendor/pdfjs/LICENSE");
said("vendor/pdfjs", "vendor/pdfjs");

// (7) The starter, the default 写作偏好 and its examples, Gallery's own block packs and the SDK's types
// (the skill's, skills/gallery/sdk/ in the checkout: sdk/ in the package).
copy(path.join(root, "src", "render", "starter"), "starter");
copy(path.join(root, "src", "packs"), "packs");
copy(path.join(root, "src", "shared", "writing-preferences.md"), "assets/writing-preferences.md");
copy(path.join(root, "src", "shared", "preference-examples"), "assets/preference-examples");
copy(path.join(root, "src", "preview"), "assets/preview");
for (const file of fs.readdirSync(sdkDirectory).filter((file) => file.endsWith(".d.ts"))) copy(path.join(sdkDirectory, file), `sdk/${file}`);
// (The SDK stands alone, importing nothing outside sdk/: buildSkill below refuses one that does.)

// (8) The thin skill (SKILL.md with this version's range written in, references/, sdk/, agents/), made of
// skills/gallery/ as npm run skill:package makes it (src/cli/package-skill.mjs buildSkill): gallery skill install writes it.
const { buildSkill } = await import("./package-skill.mjs");
buildSkill(path.join(out, "skill"), { source: skillSourceDirectory, version: metadata.version });
said("starter, assets, packs, sdk, skill", "starter", "assets", "packs", "sdk", "skill");

// (9) release.json: the stamps of the files the browser keeps for good (src/server/stamps.mjs), from
// their contents (npm gives every file of a package one time: a stamp read from times would outlive an upgrade).
const hashOfFiles = (files, base) => {
  const hash = createHash("sha256");
  for (const file of files) hash.update(`${path.relative(base, file).split(path.sep).join("/")}\u0000`).update(fs.readFileSync(file)).update("\n");
  return hash.digest("hex").slice(0, 16);
};
const releasedModules = browserFiles.filter(servedModule).map((file) => path.join(out, "browser", path.relative(browserDirectory, file)));
const releasedFileOf = (asset) => path.join(out, path.relative(path.dirname(asset.file ? kitPublicDirectory : vendorDirectory), publicFileOf(asset)));
const release = {
  name: metadata.name,
  version: metadata.version,
  built: new Date().toISOString(),
  stamps: {
    editor: hashOfFiles(releasedModules, path.join(out, "browser")),
    kit: Object.fromEntries(ASSETS.map((asset) => [asset.id, hashOfFiles([releasedFileOf(asset)], out)])),
  },
};
write("release.json", `${JSON.stringify(release, null, 2)}\n`);

// (10) The package's own files.
const jsdomBundled = bundledPackages.includes("jsdom");
const packageJson = {
  name: metadata.name,
  version: metadata.version,
  description: "Gallery: documents written as HTML by an AI agent, shown and edited in the browser, delivered as one offline file. The gallery command and its local server.",
  keywords: ["gallery", "documents", "html", "report", "editor", "agent", "skill", "claude", "codex", "offline"],
  license: "MIT",
  author: "Heycys",
  repository: { type: "git", url: "git+https://github.com/heycys/gallery.git" },
  homepage: "https://github.com/heycys/gallery#readme",
  bugs: { url: "https://github.com/heycys/gallery/issues" },
  type: "module",
  bin: { gallery: "bin/gallery.mjs" },
  files: ["bin/", "dist/", "web/", "browser/", "kit/", "vendor/", "starter/", "assets/", "packs/", "sdk/", "skill/", "release.json", "THIRD-PARTY-NOTICES.md"],
  engines: { node: ">=22.13.0" },
  ...(jsdomBundled ? {} : { dependencies: { jsdom: require("jsdom/package.json").version } }),
  publishConfig: { access: "public" },
};
write("package.json", `${JSON.stringify(packageJson, null, 2)}\n`);
copy(path.join(root, "LICENSE"), "LICENSE");
// The launcher, the checkout's src/cli/bin.mjs, as the package's bin/gallery.mjs: its import of the dispatcher beside it (./gallery.mjs) made the bundle's.
write("bin/gallery.mjs", fs.readFileSync(launcherFile, "utf8").replace('import("./gallery.mjs")', 'import("../dist/cli.mjs")'));
if (!fs.readFileSync(path.join(out, "bin", "gallery.mjs"), "utf8").includes('import("../dist/cli.mjs")')) throw new Error("src/cli/bin.mjs: its import of the dispatcher (./gallery.mjs) was not found");
write("README.md", `# Gallery

**Gallery — Where humans and AI agents create together.** An agent-first, HTML-native workspace where AI agents
write HTML, humans edit in a Notion-like interface, and both stay in sync.

An AI agent (Claude Code, Codex…) writes a document from your materials as HTML; you watch it appear and edit it
in your browser as it is written, your edits and the agent's merged; it is delivered as one offline HTML file.
This package is the \`gallery\` command, its local server and the browser workbench; the agent learns it from the
Gallery skill, which the command installs.

## Requirements

Node.js 22.13 or newer (https://nodejs.org, the LTS) on macOS, Linux or Windows. Editing in the browser and
\`gallery qa\` need Chrome or Microsoft Edge.

## Install

\`\`\`sh
npm i -g ${metadata.name}
gallery skill install      # the skill, for Claude Code and/or Codex (--agent, --project, --dir <folder>)
\`\`\`

An agent given only the skill runs \`gallery --version\` first and asks you before it installs the command. On
macOS or Linux, if \`npm i -g\` says EACCES, give npm a folder of your own (\`npm config set prefix ~/.npm-global\`,
then add \`~/.npm-global/bin\` to PATH) rather than using sudo.

## Quick start

\`\`\`sh
gallery new my-doc "My document"   # makes it, starts the server, prints the address
gallery open                       # the workbench in your browser
gallery export my-doc              # <workspace>/exports/my-doc.html, one offline file
gallery help                       # every command
\`\`\`

With an agent: install the skill, then ask it to use Gallery (\`$gallery\` in Codex). It creates the document,
gives you the address to watch and edit it, writes, checks it with \`gallery qa\` and hands you the exported file.

Documents live in a workspace: \`Gallery\` in your Documents folder (\`~/Documents/Gallery\`; on Windows the one
Explorer shows, OneDrive's when OneDrive backs it up) unless you name another (\`--workspace <dir>\`, the
\`GALLERY_WORKSPACE\` variable, or \`gallery init <dir>\`, which marks a folder as one). Each document is a folder
(\`<slug>/doc.html\`, \`doc.json\`), the deliverables are in \`exports/\`, and Gallery keeps its own state in \`.gallery/\`.

The server listens on 127.0.0.1 only, reusing its last port or trying 8080–8099, one per Gallery data directory; \`gallery stop\` stops it. After
upgrading, run \`gallery open\` once (the server of the version before stops by itself and the new one starts) and
\`gallery skill install\` again (the skill of the new version). From the older Gallery skill (the whole tools in the
agent's skills folder), \`gallery skill install\` copies its documents into the workspace and moves it out of the
skills folder, never deleting it.

MIT License. The third-party code and data the package carries are listed with their licenses in
THIRD-PARTY-NOTICES.md.
`);

// THIRD-PARTY-NOTICES.md: every package bundled into dist/, the workbench's (React), the kit's (shiki,
// KaTeX) and those carried as files (vendor/), each with its license text; the emoji and icon data.
const licenseText = (directory) => {
  const name = fs.readdirSync(directory).find((file) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(file));
  return name ? fs.readFileSync(path.join(directory, name), "utf8").trim() : null;
};
const packageDirectory = (name) => {
  try {
    return path.dirname(require.resolve(`${name}/package.json`));
  } catch {
    return fs.existsSync(path.join(modules, name, "package.json")) ? path.join(modules, name) : null;
  }
};
// The kit's code.js is built from shiki and what shiki is made of: every @shikijs package installed and the
// regular-expression packages its JavaScript engine uses are named (one that is not installed is skipped below).
const shikiParts = [...fs.readdirSync(path.join(modules, "@shikijs")).map((name) => `@shikijs/${name}`), "oniguruma-to-es", "oniguruma-parser", "regex", "regex-recursion", "regex-utilities", "hast-util-to-html"];
const noticed = new Set([...bundledPackages, "react", "react-dom", "scheduler", "shiki", ...shikiParts, "katex", "d3", "typescript", "pdfjs-dist", ...fs.readdirSync(path.join(out, "vendor", "types", "@types")).map((name) => `@types/${name}`)]);
const sections = [];
for (const name of [...noticed].sort()) {
  const directory = packageDirectory(name);
  if (!directory) continue;
  const { version, license } = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
  const text = licenseText(directory);
  sections.push(`## ${name} ${version}\n\nLicense: ${typeof license === "string" ? license : license?.type ?? "see below"}\n${text ? `\n\`\`\`\n${text}\n\`\`\`\n` : ""}`);
}
const emojiData = path.join(root, "src", "shared", "emoji", "data");
sections.push(`## Twemoji graphics\n\nThe emoji graphics (browser/shared/emoji/data/twemoji-svg.bin) are Twemoji, © Twitter, Inc and other contributors, licensed under CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/; https://github.com/twitter/twemoji).\n`);
sections.push(`## Emoji data: emojibase-data\n\nThe emoji picker's groups, skin tones, names, keywords and short codes (browser/shared/emoji/data/categories.json, skins.json, keywords-zh.json, keywords-en.json, names.json) are made from emojibase-data (https://github.com/milesj/emojibase) by src/cli/import-emoji-data.mjs. Its short codes are Slack's and GitHub's, as its iamcal and github presets carry them from iamcal/emoji-data (https://github.com/iamcal/emoji-data; MIT License, Copyright (c) 2013 Cal Henderson) and gemoji (https://github.com/github/gemoji; MIT License, Copyright (c) 2019 GitHub, Inc.).\n\n\`\`\`\n${fs.readFileSync(path.join(emojiData, "LICENSE-emojibase.txt"), "utf8").trim()}\n\`\`\`\n`);
sections.push(`## Emoji data: Unicode CLDR\n\nThe emojis' names and keywords in Chinese and English are the Unicode CLDR annotations (https://cldr.unicode.org), as emojibase-data carries them.\n\n\`\`\`\n${fs.readFileSync(path.join(emojiData, "LICENSE-unicode.txt"), "utf8").trim()}\n\`\`\`\n`);
sections.push(`## MingCute icons\n\n\`\`\`\n${fs.readFileSync(path.join(emojiData, "LICENSE-mingcute.txt"), "utf8").trim()}\n\`\`\`\n`);
sections.push(`## Tabler icons\n\n\`\`\`\n${fs.readFileSync(path.join(emojiData, "LICENSE-tabler.txt"), "utf8").trim()}\n\`\`\`\n`);
sections.push(`## Lucide icons\n\nA few line icons are Lucide's (https://lucide.dev), as lucide-react 1.67.0 has them: the workbench's sidebar toggle, search, 新建 and settings gear, the 写作偏好 book, the icon of a page with none (the workbench, the editor, the kit's page block, the browser tab), and the default home page's house.\n\n\`\`\`\n${fs.readFileSync(path.join(emojiData, "LICENSE-lucide.txt"), "utf8").trim()}\n\`\`\`\n`);
sections.push(`## mhchem for KaTeX

vendor/katex/contrib/mhchem.min.js is the mhchem extension KaTeX ships (chemical equations in formulas): Copyright (c) 2011-2015 The MathJax Consortium, Copyright (c) 2015-2018 Martin Hensel, licensed under the Apache License, Version 2.0, whose text stands under "MingCute icons" above.
`);
sections.push(`## pdf.js fonts and character maps

vendor/pdfjs/standard_fonts/ holds the fonts pdf.js draws a PDF's standard fonts with (Foxit's and Liberation) and vendor/pdfjs/cmaps/ Adobe's character maps, as pdfjs-dist ships them; their licences travel with them: LICENSE_FOXIT and LICENSE_LIBERATION in standard_fonts/, LICENSE in cmaps/.
`);
sections.push(`## Trademarks

The brand icons among the page icons are trademarks of their owners and are there to name those products. Notion, Feishu and Lark, Yuque, Microsoft Word, Excel and PowerPoint, WPS, Google Docs and the other products Gallery reads pasted or imported content from are trademarks of their owners; Gallery is not affiliated with any of them.
`);
write("THIRD-PARTY-NOTICES.md", `# Third-party notices\n\n${metadata.name} ${metadata.version} carries the following code and data of others, bundled into dist/ and web/, built into kit/, or as files in vendor/ and browser/.\n\n${sections.join("\n")}`);

// (11) What npm would pack.
const total = sizeOf(out);
console.log(`release/npm: ${total.files} files, ${megabytes(total.bytes)} (${jsdomBundled ? "jsdom bundled" : "jsdom a dependency"}; ${((Date.now() - started) / 1000).toFixed(1)}s)`);
const [packed] = JSON.parse(execSync("npm pack --dry-run --json --ignore-scripts", { cwd: out, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
console.log(`npm pack: ${packed.filename}, tarball ${megabytes(packed.size)}, unpacked ${megabytes(packed.unpackedSize)}, ${packed.entryCount} files`);
fs.rmSync(process.env.GALLERY_WORKSPACE, { recursive: true, force: true });
