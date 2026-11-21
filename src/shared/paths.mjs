import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serviceLocation } from "./service-location.mjs";
import { userDirectory } from "./user-directory.mjs";
import { findWorkspace, layoutOf } from "./workspace.mjs";

// Where everything is on disk, for every system, in two kinds: the workspace's (the user's documents
// and what Gallery keeps of them: ./workspace.mjs) and the package's (Gallery's own files). Only paths
// are computed here, at import, and nothing is made: the gallery command sets GALLERY_WORKSPACE (from
// --workspace, or the workspace it found) before it imports anything that imports this; npm run dev
// sets it to the default workspace (src/vite.config.ts: the folder GALLERY_DEFAULT_WORKSPACE names, else
// Gallery in the user's Documents folder), the tests to folders of their own.

// The package: the folder up from this file whose package.json is @heycys/gallery's (src/shared/ here,
// a dist/ chunk in the release).
function findPackageRoot() {
  for (let directory = path.dirname(fileURLToPath(import.meta.url)); ; directory = path.dirname(directory)) {
    try {
      if (JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8")).name === "@heycys/gallery") return directory;
    } catch {}
    if (path.dirname(directory) === directory) return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  }
}
export const packageRoot = findPackageRoot();
/** The package's folder (its old name, which the tests and the maintainers' scripts use). */
export const projectRoot = packageRoot;
/**
 * Whether this is the release build (npm run release:build, src/cli/release-build.mjs): release.json in
 * the package, which says its version and the stamps of its files (src/server/stamps.mjs). Gallery's
 * own files are then the package's folders (dist/, web/, browser/, kit/, vendor/…), else the source
 * checkout's (src/, public/, node_modules/).
 */
export const releaseFile = path.join(packageRoot, "release.json");
export const release = existsSync(releaseFile);

// The workspace: the user's documents (<workspace>/<slug>/) and what is made of them.
export const workspaceRoot = path.resolve(process.env.GALLERY_WORKSPACE || findWorkspace().root);
const workspace = layoutOf(workspaceRoot);
/** The documents' folder: the workspace's root (its old name, which 60 modules import). */
export const reportsDirectory = workspaceRoot;
export const generatedDirectory = workspace.built; // built previews (nothing serves them: the export builds through them)
export const exportsDirectory = workspace.exports; // the offline deliverables, the user's
export const qaDirectory = workspace.qa; // gallery qa's pictures of what it flagged in an export
export const backupsDirectory = workspace.backups; // documents as they were before a migration (add-block-ids.mjs)
export const editStateDirectory = workspace.state; // the editor's token, snapshots, recent versions…
// What a server a command started says while it runs (it runs on after that command).
export const previewLogFile = serviceLocation().serverLog;

// Gallery's own files, which a command never writes (a global install may be read-only): the shared
// kit and the starter, what the preview serves, what the checks and the import read. In the release
// each is a folder of the package (docs/internals.md, "Packaging"); in the source checkout, where it is
// kept or built (npm run dev's predev writes public/kit and public/vendor: src/cli/build-kit.mjs).
const inPackage = (built, ...source) => path.join(packageRoot, ...(release ? built : source));
export const kitSourceDirectory = path.join(packageRoot, "src", "render", "kit"); // the source checkout's only
export const starterDirectory = inPackage(["starter"], "src", "render", "starter");
/**
 * Gallery's own block packs (自定义块包), a folder each (src/packs/<pack>/: its pack.json and a folder of each
 * of its blocks, <pack>/<name>/, the scope <pack>): what a workspace's first start installs as any shared
 * pack is installed, and gallery block add copies a block of (shared/block-packs.mjs, shared/shipped-blocks.mjs).
 */
export const packsDirectory = inPackage(["packs"], "src", "packs");
const sandboxAssets = !release && process.env.GALLERY_SANDBOX ? path.join(userDirectory("cache"), "public") : null;
export const vendorDirectory = sandboxAssets ? path.join(sandboxAssets, "vendor") : inPackage(["vendor"], "public", "vendor");
export const kitPublicDirectory = sandboxAssets ? path.join(sandboxAssets, "kit") : inPackage(["kit"], "public", "kit");
/** The editor's browser modules, at their path under src/ (the preview serves them so: src/server/routes.mjs). */
export const browserDirectory = inPackage(["browser"], "src");
/** The emoji and icon data (the editor fetches it; the render reads it for a page's icon). */
export const emojiDataDirectory = path.join(browserDirectory, "shared", "emoji", "data");
/** The workbench as built (index.html and assets/): the release's; the source checkout's is Vite's (src/workbench/app/). */
export const workbenchDirectory = release ? path.join(packageRoot, "web") : null;
/**
 * The skill's source in the checkout (skills/gallery/: SKILL.md, references/, agents/ and sdk/), what
 * src/cli/package-skill.mjs makes the skill of (its SKILL_FILES are paths in it); null in the release,
 * which carries the skill made (skillDirectory) and the SDK's types (sdk/).
 */
export const skillSourceDirectory = release ? null : path.join(packageRoot, "skills", "gallery");
/** The SDK's types (the type check's roots, and what a script's JSDoc imports of ../../sdk reach): the release's sdk/, the checkout's skills/gallery/sdk/. */
export const sdkDirectory = release ? path.join(packageRoot, "sdk") : path.join(skillSourceDirectory, "sdk");
/** The gallery command's launcher (package.json's bin, its Node check first): the release's bin/gallery.mjs, the checkout's src/cli/bin.mjs. */
export const launcherFile = inPackage(["bin", "gallery.mjs"], "src", "cli", "bin.mjs");
/** The dev server's Vite configuration (src/vite.config.ts), which every Vite a checkout starts is given (--config): none in the release. */
export const viteConfigFile = release ? null : path.join(packageRoot, "src", "vite.config.ts");
/** Gallery's default 写作偏好 (shared/writing-preferences.mjs). */
export const defaultPreferencesFile = inPackage(["assets", "writing-preferences.md"], "src", "shared", "writing-preferences.md");
/** 写作偏好's examples (project-report.zh.md, project-report.en.md): what the dialog's first-open note offers to add (shared/preference-documents.mjs). */
export const preferenceExamplesDirectory = inPackage(["assets", "preference-examples"], "src", "shared", "preference-examples");
export const previewDirectory = inPackage(["assets", "preview"], "src", "preview");
/** TypeScript (src/render/typescript.mjs): the release's own minified copy, beside the libs it reads; null: the typescript package. */
export const typescriptFile = release ? path.join(packageRoot, "vendor", "typescript", "typescript.js") : null;
/** Where the type check finds d3's types (the type library d3, and the d3-* it names). */
export const typeRoots = [inPackage(["vendor", "types", "@types"], "node_modules", "@types")];
/** pdf.js (a PDF's import: src/transfer/import.mjs): the release's subset; null: the pdfjs-dist package. */
export const pdfjsDirectory = release ? path.join(packageRoot, "vendor", "pdfjs") : null;
/** The thin skill gallery skill install writes: the release's (the source checkout makes it: src/cli/package-skill.mjs). */
export const skillDirectory = release ? path.join(packageRoot, "skill") : null;
