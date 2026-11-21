import { reportsDirectory } from "../shared/paths.mjs";
import { documentDirectory, documentFiles } from "../shared/workspace.mjs";
import { checkSlug, commandArguments, openAsked, UsageError } from "./arguments.mjs";
import { slugRefused } from "./new.mjs";
import { shown } from "./report-start.mjs";
import { browserLine, nextLine, previewOfNew, previewSkipped } from "./server-process.mjs";
import { named, placeLine, readTree, serviceCommand, treeDocument } from "./tree.mjs";

// gallery duplicate <document> [<new slug>] [--title "<title>"] [--no-preview] [--open] (./usage.mjs): the
// document menu's 创建副本 for an Agent, by the service's own `duplicate` (workbench/service.mjs: through the workspace's
// running server when there is one, so that an open workbench shows the copy at once, else here by the same function):
// the whole folder copied under a new slug (doc-<a new page id>, or the one named) with a new id in the page and none of
// the original's review of the Agent's changes, its title the original's with （副本） after it (or the one given), placed right
// after the original in the sidebar's tree. Says where it is, then ends as gallery new does: the document's address to give the
// user, the server found or started (--no-preview leaves it alone), the browser opened there only with --open (arguments.mjs openAsked).

export async function run(argv) {
  const { positional, options, values } = commandArguments({ options: ["--no-preview", "--no-browser", "--open"], values: ["--title"], argv });
  const open = openAsked(options);
  if (positional.length < 1 || positional.length > 2) throw new UsageError("Name the document to copy, then the slug of the copy if you choose one.");
  const given = values.has("--title") ? values.get("--title").replace(/\s+/g, " ").trim() : undefined;
  if (given === "") throw new UsageError("--title takes the words of the title: a document's title is never empty.");
  if (positional[1] !== undefined) checkSlug(positional[1]);
  const tree = await readTree();
  const found = await treeDocument(positional[0], "the document to copy", tree);
  if (found.refused) {
    console.error(found.refused);
    process.exit(1);
  }
  const { slug } = found;
  if (tree.documents.get(slug)?.url !== undefined) {
    console.error(`${named(tree, slug)} is a web link, not a document: there is nothing to copy (gallery link add makes another).`);
    process.exit(1);
  }
  if (slug.startsWith("~")) {
    console.error(`${slug} is a document of another workspace: copy it there (gallery duplicate <slug> --workspace <its path>) or gallery copy it here from there.`);
    process.exit(1);
  }
  if (positional[1] !== undefined) {
    const refused = await slugRefused(positional[1]);
    if (refused) {
      console.error(`${refused} Nothing copied.`);
      process.exit(1);
    }
  }
  const answer = await serviceCommand("duplicate", { slug, ...(positional[1] !== undefined ? { as: positional[1] } : {}), ...(given !== undefined ? { title: given } : {}) });
  if (!answer?.ok) {
    console.error(`Not copied: ${answer?.message ?? answer?.reason ?? "no answer"}.`);
    process.exit(1);
  }
  const copy = answer.report.slug;
  const now = await readTree();
  console.log(`Duplicated ${named(tree, slug)} as ${copy} (${answer.report.title}), right after it in the sidebar.`);
  console.log(placeLine(now, copy));
  console.log(`The copy's file: ${shown(documentFiles(documentDirectory(copy, reportsDirectory)).html)} (the original's id, annotations and history stay with the original).`);
  for (const note of (answer.notes ?? []).filter((each) => each !== "标题已更新")) console.log(`提示：${typeof note === "string" ? note : note.message ?? JSON.stringify(note)}`);
  const preview = await previewOfNew(copy, { skipped: previewSkipped(options), command: `gallery duplicate ${slug}` });
  console.log(nextLine(preview, `edit the copy as any document (its file is the path above).`));
  const browser = open ? await browserLine(preview, options) : null;
  if (browser) console.log(browser);
  for (const line of preview) console.log(line);
}
