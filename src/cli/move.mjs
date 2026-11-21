import { descendantsIn } from "../shared/outline.mjs";
import { commandArguments, UsageError } from "./arguments.mjs";
import { columnTarget, moveInTree, named, placeLine, placementOf, readTree, refusedLine, treeDocument, wentLine } from "./tree.mjs";

// gallery move <document> (--under <document> | --top | --column <column>) [--after <document> | --first] (./usage.mjs):
// a document moved in the sidebar's tree with the documents under it (./tree.mjs: through the
// workspace's running server, so that an open workbench shows it at once, else written here), for an
// Agent tidying the workspace as the user asks. Where it goes: under --under's document, or at the
// top level (--top), or the top of a column of the sidebar (--column), or where it is now; right after --after's document (one at that level, whose
// level it is when neither --under nor --top says one), first (--first), else last. Nothing in a
// document's files changes: links between documents go by their folders, which stay where they are.
// Says where it went (and where it was), then its place as gallery list says it. Exits 1 for a document
// that is not there, the 写作偏好 page, a place under itself or a document under it, an --after at
// another level; 0 when it is there already.

export async function run(argv) {
  const { positional, options, values } = commandArguments({ options: ["--top", "--first"], values: ["--under", "--after", "--column"], argv });
  if (positional.length !== 1) throw new UsageError("Name the document to move, one.");
  const place = placementOf(values, options);
  if (place.under === undefined && !place.top && place.column === undefined && place.after === undefined && !place.first) {
    throw new UsageError("Say where it goes: --under <document>, --top or --column <column>, and --after <document> or --first.");
  }
  const tree = await readTree();
  const resolve = async (name, what) => {
    const found = await treeDocument(name, what, tree);
    if (found.refused) {
      console.error(found.refused);
      process.exit(1);
    }
    return found.slug;
  };
  const slug = await resolve(positional[0], "the document to move");
  let parent = place.under !== undefined ? await resolve(place.under, "--under") : place.top ? "" : undefined;
  if (place.column !== undefined) {
    const target = columnTarget(tree, place.column);
    if (target.refused) {
      console.error(target.refused);
      process.exit(1);
    }
    parent = target.top;
  }
  const after = place.after !== undefined ? await resolve(place.after, "--after") : null;
  const result = await moveInTree(slug, { parent, after, first: place.first });
  if (!result.ok) {
    console.error(refusedLine(tree, slug, result.reason, { parent, after, message: result.message }));
    process.exit(1);
  }
  const now = await readTree();
  const below = descendantsIn(now.children, slug).length;
  const what = `${named(now, slug)}${below ? ` with the ${below} document${below === 1 ? "" : "s"} under it` : ""}`;
  if (!result.moved) console.log(`${what} is there already: ${wentLine(now, result)}.`);
  else console.log(`Moved ${what}: now ${wentLine(now, result)}; it was ${wentLine(tree, result.from)}.`);
  console.log(placeLine(now, slug));
}
