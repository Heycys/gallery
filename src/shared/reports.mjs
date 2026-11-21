import fs from "node:fs/promises";
import { namedLinks, pageLinks } from "./page-links.mjs";
import { reportsDirectory } from "./paths.mjs";
import { documentDirectory, documentFiles, listDocumentSlugs, listTrash, slugPattern } from "./workspace.mjs";

// The documents' layout, as every system reads it (./workspace.mjs): one folder a document,
// <workspace>/<slug>/ with doc.html and doc.json (report.html and report.json in one made before
// Gallery 0.1), its slug lowercase kebab-case. Dot names (.gallery/) and exports/ are never documents.

export { slugPattern };

// A workspace with no documents yet has none: gallery new makes the folder with its first one.
export async function listReportSlugs(directory = reportsDirectory) {
  return listDocumentSlugs(directory);
}

/**
 * The links of the documents of the workspace at `directory`, by their titles as they are now
 * (./page-links.mjs): { links: a Map of slug to link of those of the sidebar, named: those and the
 * trash's, what an address written for anyone goes by }. A doc.json that cannot be read now (an Agent
 * writing it) names no title, and its document goes by its page id alone.
 */
export async function documentLinks(directory = reportsDirectory) {
  const page = async (slug) => ({ slug, title: await fs.readFile(documentFiles(documentDirectory(slug, directory)).json, "utf8").then((text) => JSON.parse(text).title).catch(() => null) });
  const links = pageLinks(await Promise.all((await listDocumentSlugs(directory)).map(page)));
  return { links, named: namedLinks(links, await listTrash(directory)) };
}

// The page of the user's writing preferences (写作偏好: `"instructions": true` in its doc.json, one at
// most, in <workspace>/.gallery/pages/<slug>/): a page like any other to edit, which the workbench
// opens from 设置 and lists apart from the documents, and writes as <workspace>/preferences.md for
// Agents to read before they write (src/shared/writing-preferences.mjs). Any other doc.json field names
// no role: an old one's "template" is read as nothing, the document an ordinary one.
export async function isInstructions(directory) {
  return (await roleOf(directory)) === "instructions";
}

/** What a document is besides a document: "instructions", or null (an ordinary one). */
export async function roleOf(directory) {
  try {
    const metadata = JSON.parse(await fs.readFile(documentFiles(directory).json, "utf8"));
    return metadata?.instructions === true ? "instructions" : null;
  } catch {
    return null;
  }
}
