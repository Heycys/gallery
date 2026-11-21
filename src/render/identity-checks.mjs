import fs from "node:fs/promises";
import path from "node:path";
import { BLOCK_ID } from "../shared/ids.mjs";
import { attr, elementsOf, walk } from "../shared/html-tree.mjs";
import { RESERVED, documentFiles } from "../shared/workspace.mjs";
import { parseReport } from "./report-tree.mjs";

// What gallery check holds a document to so that what Gallery keeps of it by identity stays whole: the
// rules SKILL.md used to ask an Agent to keep by heart, said by the tool instead, each with how to mend
// it. Only what is certain from the file alone, so that none fails a document that is right:
// - a block id is Gallery's own form (ids.mjs BLOCK_ID: eight lowercase letters and digits, a letter
//   first): one an author made up (data-block-id="intro") is no block's identity the page and the
//   commits know, and a copied or renamed one is lost at the next edit;
// - an id stays on the list item, not on the paragraph in it: a li with no id over a p with one is an
//   id moved onto the paragraph (an item that is new has no id on anything in it; an id kept through a
//   change of type is on the element that holds the words);
// - a folder of the workspace's root whose doc.json says "instructions": true is the 写作偏好 page's
//   mark, which hides it from every list, check and export and has the next migration move it into
//   .gallery/pages/: no document carries it. Only a document in the format's names (doc.html, doc.json):
//   an older layout's page, report.json marked so at the root, is what a migration left behind there.
// Not decided here, because the file alone cannot tell: an id reused after its block was deleted, an id
// moved onto a container's child (a container that is new has none, by design), and two writers of one
// document at once. gallery export and the page's autosave keep doc.json's title and icon in step with
// the page (natural.mjs inStep), and say so when gallery check runs.

const joined = (items) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : `${items[0]}`);

/**
 * The failures of a document's `html` (the file's text) about its block ids: [message]. A made-up id
 * (not BLOCK_ID's form, an empty one included) is one failure naming each at its line; a list item
 * without an id over a paragraph with one is another, naming each item. Elements of a <template> are
 * no part of the page.
 */
export function identityFailures(html) {
  const tree = parseReport(html);
  const made = []; // { id, line } of the ids not in Gallery's form
  const moved = []; // { line, id, at } a li without an id and the paragraph in it with one
  walk(tree, (node) => {
    const id = attr(node, "data-block-id");
    if (id !== undefined && !BLOCK_ID.test(id)) made.push({ id, line: (node.sourceCodeLocation?.attrs?.["data-block-id"] ?? node.sourceCodeLocation)?.startLine });
    if (node.tagName === "li" && attr(node, "data-block-id") === undefined) {
      const held = elementsOf(node).find((child) => child.tagName === "p" && attr(child, "data-block-id") !== undefined && BLOCK_ID.test(attr(child, "data-block-id")));
      if (held) moved.push({ line: node.sourceCodeLocation?.startLine, id: attr(held, "data-block-id"), at: held.sourceCodeLocation?.startLine });
    }
  }, { inTemplates: false });
  const failures = [];
  if (made.length) {
    const named = made.slice(0, 6).map(({ id, line }) => `${id ? `"${id}"` : "an empty one"} (line ${line})`);
    failures.push(`data-block-id is not an id Gallery made: ${joined(named)}${made.length > 6 ? ` and ${made.length - 6} more` : ""}; an id is eight lowercase letters and digits, a letter first, and only Gallery makes one: take the attribute off the element (gallery export gives every block an id), and write none for a new block`);
  }
  for (const { line, id, at } of moved.slice(0, 6)) {
    failures.push(`line ${line}: the list item has no data-block-id but the paragraph in it has one ("${id}", line ${at}): an id stays on the item the words belong to, not on a paragraph in it; put "${id}" on the <li> and take it off the <p> (a paragraph held by an item has an id of its own, or none, besides the item's)`);
  }
  if (moved.length > 6) failures.push(`${moved.length - 6} more list items have no data-block-id over a paragraph that has one (lines ${moved.slice(6).map(({ line }) => line).join(", ")})`);
  return failures;
}

/**
 * The folders at the root of workspace `root` that hold a document's page and whose doc.json says
 * "instructions": true: Map slug -> the failure to say. They are no document to Gallery (the workspace
 * lists, checks and exports none of them), so gallery check finds them here, not among the documents.
 */
export async function markedAsInstructions(root) {
  const marked = new Map();
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || RESERVED.has(entry.name)) continue;
    const files = documentFiles(path.join(root, entry.name));
    if (files.old) continue; // report.html and report.json: an older Gallery's layout, whose 写作偏好 page was marked so at the root (left there once migrated)
    const json = await fs.readFile(files.json, "utf8").then((text) => JSON.parse(text), () => null);
    if (json?.instructions !== true || !(await fs.stat(files.html).then(() => true, () => false))) continue;
    marked.set(entry.name, `doc.json says "instructions": true, which marks the 写作偏好 page (the user's writing preferences): Gallery lists, checks and exports no folder that carries it and moves it into .gallery/pages/ when it next migrates the workspace. A document never has it: take "instructions" out of doc.json`);
  }
  return marked;
}
