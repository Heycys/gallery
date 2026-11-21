import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "parse5";
import { attr, walk } from "./html-tree.mjs";
import { escapeAttribute } from "./escape.mjs";
import { newNames } from "./new-names.mjs";
import { COMPONENTS_FOLDER, DOCUMENT_FOLDERS, SHARED_FOLDERS, documentFiles, packageFolders, readLink } from "./workspace.mjs";

/** Files belonging to a document, excluding packages/pages sharing a legacy reserved folder. */
export async function documentNames(root, slug) {
  const entries = await fs.readdir(path.join(root, slug), { withFileTypes: true });
  if (!SHARED_FOLDERS.includes(slug)) return entries.map(({ name }) => name);
  const scopes = slug === COMPONENTS_FOLDER ? new Set(packageFolders(root).map(({ id }) => id.split("/")[0])) : new Set();
  return entries.filter(entry => entry.isFile() || (DOCUMENT_FOLDERS.includes(entry.name) && !scopes.has(entry.name))).map(({ name }) => name);
}

/** Same copy primitive for duplicate and cross-workspace copy: local assets and metadata stay intact. */
export async function copyEntryFiles(root, slug, destination, copy, { names = new Map() } = {}) {
  const source = path.join(root, slug);
  const document = await fs.access(documentFiles(source).html).then(() => true, () => false);
  const link = document ? null : await readLink(source);
  const own = new Set(["", ...(await documentNames(root, slug))]);
  await fs.cp(source, destination, { recursive: true, errorOnExist: true, force: false, filter: from => own.has(path.relative(source, from).split(path.sep)[0]) });
  if (link) return [];
  const file = documentFiles(destination).html;
  const html = await fs.readFile(file, "utf8");
  const text = newNames(html);
  const edits = new Map(), packages = new Set();
  walk(parse(text.replace(/^\uFEFF/, " "), { sourceCodeLocationInfo: true }), node => {
    const component = attr(node, "data-doc-component");
    if (component) packages.add(component);
    for (const { name, value } of node.attrs ?? []) {
      const at = node.sourceCodeLocation?.attrs?.[name];
      if (!at) continue;
      const relative = /^(\.\.\/)([a-z0-9]+(?:-[a-z0-9]+)*)(\/.*)$/.exec(value);
      const next = name === "data-doc-id" && value === slug ? copy : ["href", "src", "poster"].includes(name) && relative && names.has(relative[2]) ? `../${names.get(relative[2])}${relative[3]}` : value;
      if (next !== value) edits.set(at.startOffset, { to: at.endOffset, text: `${name}="${escapeAttribute(next)}"` });
    }
  });
  const next = [...edits].sort(([a], [b]) => b - a).reduce((text, [from, edit]) => text.slice(0, from) + edit.text + text.slice(edit.to), text);
  await fs.writeFile(file, next);
  // A copy is a document made now: its doc.json's `created` its own (src/workbench/index.mjs createdOf).
  const json = documentFiles(destination).json;
  const metadata = await fs.readFile(json, "utf8").then(JSON.parse).catch(() => null);
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) await fs.writeFile(json, `${JSON.stringify({ ...metadata, created: new Date().toISOString() }, null, 2)}\n`);
  return [...packages];
}
