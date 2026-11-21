import path from "node:path";
import { draftOf, workspaceOf } from "../shared/drafts.mjs";
import { pageLinks, pageOfLink } from "../shared/page-links.mjs";
import { reportsDirectory } from "../shared/paths.mjs";
import { isWorkspace, isWorkspaceId, registerQuietly, workspaceId, workspaceKey } from "../shared/workspace-registry.mjs";
import { documentDirectory, documentFiles } from "../shared/workspace.mjs";
import { commandArguments, UsageError } from "./arguments.mjs";
import { named, readTree, serviceCommand, treeDocument } from "./tree.mjs";
import { shown } from "./report-start.mjs";

// gallery copy <document> --to <workspace> [--under <document>] (./usage.mjs): the sidebar's drag of a document into
// another workspace's column ("复制到另一个工作区？"), confirmed by the command line: the document and the documents under it
// copied into the workspace --to names (a registered workspace's ws- id, or its folder, registered now if it is a
// workspace), as new documents (new slugs and page ids, their files, assets and metadata; the original and its history
// stay where they are), by the service's own `copy-from` (workbench/service.mjs) of the receiving workspace: through the
// machine's running server when there is one, else here by the same function, each copy keeping its slug where that workspace has it free
// (else doc-<a new page id>, as the sidebar's copies all have). The copy goes last at the top level of that
// workspace, or last under --under's document there (a slug of that workspace). Says where the copy is, and how to work on it.

const docsOf = (tree) => [...tree.documents.values()].filter(({ url }) => url === undefined);

// The workspace `target` names: { root, id } or { refused }.
async function workspaceNamed(target) {
  if (isWorkspaceId(target)) {
    const found = workspaceOf(target);
    return found.root ? { root: found.root, id: target } : { refused: `${target} is ${found.refused === "ambiguous" ? "the id of more than one registered workspace" : "no registered workspace"}: gallery workspaces lists them, with their ids and paths.` };
  }
  const root = path.resolve(target);
  if (!isWorkspace(root)) return { refused: `${root} is not a Gallery workspace (it has no gallery.json of Gallery's): gallery init "${root}" makes one, gallery workspaces lists the registered ones.` };
  await registerQuietly(root);
  const found = workspaceOf(workspaceId(root));
  return found.root && workspaceKey(found.root) === workspaceKey(root) ? { root, id: workspaceId(root) } : { refused: `${root} could not be registered (gallery workspaces lists the registered ones).` };
}

export async function run(argv) {
  const { positional, values } = commandArguments({ values: ["--to", "--under"], argv });
  if (positional.length !== 1) throw new UsageError("Name the document to copy, one.");
  if (!values.has("--to")) throw new UsageError("Say where it is copied to: --to <workspace> (its path, or its ws- id from gallery workspaces).");
  const tree = await readTree();
  const found = await treeDocument(positional[0], "the document to copy", tree);
  if (found.refused) {
    console.error(found.refused);
    process.exit(1);
  }
  const entry = tree.documents.get(found.slug);
  const draft = draftOf(found.slug);
  const own = workspaceId(reportsDirectory);
  const sourceWs = draft?.ws ?? own;
  const slug = draft?.slug ?? found.slug;
  const destination = await workspaceNamed(values.get("--to"));
  if (destination.refused) {
    console.error(`${destination.refused} Nothing copied.`);
    process.exit(1);
  }
  if (destination.id === sourceWs) {
    console.error(`${named(tree, found.slug)} is in ${destination.root} already: gallery duplicate <slug> copies it there, after itself.`);
    process.exit(1);
  }
  if (entry.url !== undefined) {
    console.error(`${named(tree, found.slug)} is a web link, not a document: gallery link add makes the same link in the other workspace (gallery link add <url> "<name>" --workspace "${destination.root}").`);
    process.exit(1);
  }
  // Where it goes there: last under --under's document (a slug of that workspace), else last at its top level.
  const there = await readTree(destination.root);
  let parent = "";
  if (values.has("--under")) {
    const wanted = values.get("--under");
    const under = docsOf(there).some(({ slug: each }) => each === wanted) ? wanted : pageOfLink(pageLinks(docsOf(there)), wanted.replace(/^.*#/, ""));
    if (!under) {
      console.error(`No document "${wanted}" in ${destination.root} to put the copy under: gallery list --tree --workspace "${destination.root}" shows its documents. Nothing copied.`);
      process.exit(1);
    }
    parent = under;
  }
  const answer = await serviceCommand("copy-from", { sourceWs, slug, parent, index: (there.children[parent] ?? []).length, keep: true }, { root: destination.root });
  if (!answer?.ok) {
    console.error(`Not copied: ${answer?.message ?? answer?.reason ?? "no answer"}.`);
    process.exit(1);
  }
  const now = await readTree(destination.root);
  const made = now.documents.get(answer.slug);
  const below = answer.count - 1;
  console.log(`Copied ${named(tree, found.slug)}${below ? ` with the ${below} document${below === 1 ? "" : "s"} under it` : ""} to ${destination.root}: ${answer.slug}${made?.title ? ` (${made.title})` : ""}, last ${parent ? `under ${named(now, parent)}` : "at its top level"}. The original stays where it was.`);
  console.log(`The copy's file: ${shown(documentFiles(documentDirectory(answer.slug, destination.root)).html)}`);
  console.log(`下一步：work on the copy in that workspace: gallery open ${answer.slug} --no-browser --workspace "${destination.root}" gives its address (every command takes --workspace).`);
}
