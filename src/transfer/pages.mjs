import fs from "node:fs/promises";
import path from "node:path";
import { withNeededKitTags } from "../render/assets.mjs";
import { ownLookFor, withLookField } from "../shared/document-look.mjs";
import { IMPORTED_FROM, fileWords } from "../shared/file-language.mjs";
import { writeAtomic } from "../shared/files.mjs";
import { documentFiles } from "../shared/workspace.mjs";
import { workspaceLook } from "../shared/workspace-look.mjs";

// Pages an import converted (import.mjs importFiles, importMarkdown) written as new documents, each
// under the one it came under (a Notion export's tree, a zip's folders), the top ones under `under`
// in the workspace's outline: by the workbench's 导入 (./service.mjs, its pages filled in the
// conversion worker) and by gallery import (src/cli/import.mjs, in its own process). Each page: a
// new document from the starter (blank), its nodes filled in (fillReport), its files copied into its
// assets/, its icon into its doc.json, then placed in the outline. One of this Gallery's own documents
// (import.mjs: an export of one) has its doc.json's description and type as its export carried them (its
// description, else 导入自 <file>), and the look it showed, kept as the workspace it comes into keeps it
// (its own choices where they differ from the workspace's default look). A document is written whole or not
// at all: what fails once its folder is made (a file that cannot be copied, a name no file can have) takes the
// folder away again before it is placed in the outline, and the import fails with what went wrong.

const exists = (target) => fs.access(target).then(() => true, () => false);

/**
 * Write `pages` (a tree: { title, icon, nodes, own, raws, lang, files, children, from }) as new
 * documents. `create(slug, title, description, { lang })`: a new document from the starter;
 * `slugOf(page, index)`: the new document's slug (the top pages numbered in order; may be async);
 * `folderOf(slug)`: its folder; `fill(payload)`: fillReport's text; `place(slug, parent)`: the
 * outline's. `said`: the description, the file it came from in {0} (the file language's by default:
 * shared/file-language.mjs); `lang`: the page's lang unless the file says one. Resolves to { made: every slug
 * in order, top: the top ones' }.
 */
export async function writeImportedPages(pages, { create, slugOf, folderOf, fill, place, under = "", said = fileWords(IMPORTED_FROM), lang = null }) {
  const made = [];
  const top = [];
  async function write(page, parent, index) {
    const slug = await slugOf(page, index);
    const description = typeof page.doc?.description === "string" && page.doc.description.trim() ? page.doc.description : said.replace("{0}", () => page.from);
    for (const { name } of page.files) if (typeof name !== "string" || name !== path.basename(name) || name.startsWith(".")) throw new Error(`no file of a document is called ${name}`);
    await create(slug, page.title, description, { lang });
    const directory = folderOf(slug);
    try {
      await fillIn(page, directory);
    } catch (error) {
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {}); // a new folder of its own: nothing half-written stays
      throw error;
    }
    await place(slug, parent);
    made.push(slug);
    for (const child of page.children ?? []) await write(child, slug, null);
    return slug;
  }
  // A new document's folder filled with the page: its text, its files, its doc.json.
  async function fillIn(page, directory) {
    const { html: file, json: metadataFile } = documentFiles(directory);
    const source = await fs.readFile(file, "utf8");
    await writeAtomic(file, withNeededKitTags(await fill({ source, nodes: page.nodes, icon: page.icon, own: page.own, raws: page.raws, lang: page.lang })));
    if (page.files.length) await fs.mkdir(path.join(directory, "assets"), { recursive: true });
    for (const { from, name } of page.files) {
      const to = path.join(directory, "assets", name);
      if (!(await exists(to))) await fs.copyFile(from, to);
    }
    const type = typeof page.doc?.type === "string" && page.doc.type.trim() ? page.doc.type : null;
    const look = page.doc?.look ? ownLookFor(page.doc.look, workspaceLook(path.dirname(directory))) : {};
    if (page.icon || type || Object.keys(look).length) {
      let metadata = JSON.parse(await fs.readFile(metadataFile, "utf8"));
      if (type) metadata.type = type;
      if (page.icon) metadata.icon = page.icon;
      metadata = withLookField(metadata, look);
      await writeAtomic(metadataFile, `${JSON.stringify(metadata, null, 2)}\n`);
    }
  }
  for (const [index, page] of pages.entries()) top.push(await write(page, under, index));
  return { made, top };
}
