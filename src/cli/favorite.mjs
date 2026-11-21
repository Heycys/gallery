import { readFavorites } from "../shared/favorites.mjs";
import { reportsDirectory } from "../shared/paths.mjs";
import { commandArguments, UsageError } from "./arguments.mjs";
import { entryNamed } from "./trash.mjs";
import { named, readTree, serviceCommand } from "./tree.mjs";

// gallery favorite <entry> [--off] (./usage.mjs): the sidebar's 收藏 for an Agent: an entry (a document or a web link, named by
// its slug, link or address, or its whole title when only one has it) put in the favorites list, or taken out of it with
// --off, by the service's own `favorite` (workbench/service.mjs: through the workspace's running server when there is one,
// else here by the same function). The list is kept in the outline file (shared/favorites.mjs) beside the tree, which the
// workbench's browsers read and write as well as the one they keep themselves; gallery list --json says each entry's
// `favorite`. Says what changed (or that nothing needed to), and exits 1 for an entry that is not there or a custom page,
// which has no 收藏.

export async function run(argv) {
  const { positional, options } = commandArguments({ options: ["--off"], argv });
  if (positional.length !== 1) throw new UsageError("Name one entry to put in 收藏 (or take out of it with --off).");
  const off = options.has("--off");
  const tree = await readTree();
  const entry = await entryNamed(positional[0], tree).catch((error) => {
    if (!(error instanceof UsageError) || !off) throw error;
    return { kind: "gone", slug: positional[0], title: positional[0] };
  });
  if (entry.refused) {
    console.error(entry.refused);
    process.exit(1);
  }
  if (entry.kind === "page") {
    console.error(`${entry.slug} (${entry.title}) is a custom page: the sidebar's 收藏 holds documents and web links.`);
    process.exit(1);
  }
  // A name that names no entry any more can still be taken out, when the list holds it.
  if (entry.kind === "gone" && !(await readFavorites(reportsDirectory)).includes(entry.slug)) {
    console.error(`No entry "${positional[0]}" in the sidebar, and 收藏 does not hold it: gallery list --tree shows the entries.`);
    process.exit(1);
  }
  const answer = await serviceCommand("favorite", off ? { remove: [entry.slug] } : { add: [entry.slug] });
  if (!answer?.ok) {
    console.error(`Not changed: ${answer?.message ?? answer?.reason ?? "no answer"}.`);
    process.exit(1);
  }
  const what = entry.kind === "gone" ? entry.slug : named(tree, entry.slug);
  if (!answer.changed) console.log(`${what} is ${off ? "not in 收藏" : "in 收藏"} already: nothing to change.`);
  else console.log(`${off ? "Took" : "Put"} ${what} ${off ? "out of" : "in"} the sidebar's 收藏 (${answer.favorites.length} now).`);
}
