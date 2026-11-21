import { existsSync } from "node:fs";
import path from "node:path";
import { createReportFromStarter } from "../render/reports.mjs";
import { reportsDirectory } from "../shared/paths.mjs";
import { idHolder, isDocSlug, keptName, layoutOf, listTrash } from "../shared/workspace.mjs";
import { parentIn } from "../shared/outline.mjs";
import { checkSlug, commandArguments, openAsked, UsageError } from "./arguments.mjs";
import { columnTarget, moveInTree, placementOf, readTree, refusedLine, treeDocument, wentLine } from "./tree.mjs";
import { browserLine, nextLine, previewOfNew, previewSkipped } from "./server-process.mjs";
import { shown, startLines } from "./report-start.mjs";
import { nameHint } from "./workspaces.mjs";
import { joinDefaultTree, joinedLine } from "../shared/drafts.mjs";
import { NEW_DESCRIPTION, fileWords } from "../shared/file-language.mjs";

// gallery new <slug> "<title>" ["<description>"] (./usage.mjs): a new document in <workspace>/<slug>/
// from the starter (src/render/starter/): its doc.html, holding the starter's section to replace,
// and doc.json, with the title and the description written in (新文档 when none is given, New document on a
// system whose language is not Chinese: shared/file-language.mjs; its type "report", free text the Agent
// may change). The starter's lang and the words of its section follow the same language. Placed in the sidebar's tree where --under, --after and
// --first say (./tree.mjs: checked before anything is made, written through the workspace's running
// server when there is one), else last at the top level. Then says where it wrote, where the user's writing
// preferences are (写作偏好, <workspace>/preferences/, to read first: 通用写作.md made from Gallery's default
// when there are none yet, report-start.mjs) and the next steps, the first of them to send the user
// the address (in a workspace with no name of its own, but the default one, a line before them says
// how to name it after its project: ./workspaces.mjs nameHint), and last gives the workspace's
// server's address (server-process.mjs: found or started, running on after this command), as gallery open does; no browser
// opened unless --open asks (arguments.mjs openAsked: the Agent sends the address). A server that cannot be started is said with how to
// start it, and the document is made all the same. The review of the Agent's changes takes the
// starter at once, on disk (hand-in.mjs noteNew), so that the Agent's first write of the document, the
// starter filled, is no change to review, and every write after it is (docs/editor.md "Agent's changes"). Made in a
// workspace other than the default one, it joins the default workspace's sidebar (shared/drafts.mjs
// joinDefaultTree: in its workspace's column, or under its parent's entry, with a line saying where).

/**
 * Why `slug` names no new document here, or null: it exists, it is a name the workspace keeps, the
 * 写作偏好 page's, a custom page's (documents and custom pages share one set of names:
 * shared/pages.mjs), or a document's or a page's in the trash, whose address would open the new one; or
 * a doc-<eight letters and digits> name (the shape of the workbench's own, whose id is those eight) whose
 * id another name of the workspace has (shared/page-links.mjs: two documents may not share an address).
 */
export async function slugRefused(slug, root = reportsDirectory) {
  if (keptName(slug)) return `"${slug}" is a name the workspace keeps for itself: choose another slug.`;
  if (existsSync(path.join(layoutOf(root).preferencesPage, slug))) return `"${slug}" is the 写作偏好 page's slug: choose another slug.`;
  if (existsSync(path.join(layoutOf(root).customPages, slug))) return `"${slug}" is a custom page's slug (documents and custom pages share one set of names: gallery page list lists them): choose another slug.`;
  if (existsSync(path.join(root, slug))) return `Document already exists: ${shown(path.join(root, slug))}`;
  if ((await listTrash(root)).some((entry) => entry.slug === slug)) return `"${slug}" is the slug of something in the trash: choose another slug.`;
  if (isDocSlug(slug)) {
    const holder = await idHolder(slug, root);
    if (holder) return `"${slug}" would have the page id (${slug.slice(4)}) of "${holder}" in this workspace, and two documents may not share an address: choose another slug.`;
  }
  return null;
}

export async function run(argv) {
  const { positional, options, values } = commandArguments({ options: ["--no-preview", "--no-browser", "--open", "--first"], values: ["--under", "--after", "--column"], argv });
  const [slug, title, description = fileWords(NEW_DESCRIPTION)] = positional;
  if (positional.length < 2 || positional.length > 3 || !slug || !title?.trim() || !description.trim()) {
    throw new UsageError("Name the slug and the title (then a description, if you choose one), each quoted when it has spaces.");
  }
  checkSlug(slug);
  const open = openAsked(options);
  const place = placementOf(values, options, { top: false });
  const refused = await slugRefused(slug);
  if (refused) {
    console.error(refused);
    process.exit(1);
  }
  // Where it goes in the sidebar's tree, read and checked before anything is made (./tree.mjs).
  const placing = place.under !== undefined || place.after !== undefined || place.first || place.column !== undefined;
  let where = null;
  if (placing) {
    const tree = await readTree();
    const resolve = async (name, what) => {
      const found = await treeDocument(name, what, tree);
      if (found.refused) {
        console.error(`${found.refused} Nothing made.`);
        process.exit(1);
      }
      return found.slug;
    };
    let parent = place.under !== undefined ? await resolve(place.under, "--under") : undefined;
    // --column: the top of that column of the sidebar (a column of this workspace's: columnTarget), last, or first with --first.
    if (place.column !== undefined) {
      const target = columnTarget(tree, place.column);
      if (target.refused) {
        console.error(`${target.refused} Nothing made.`);
        process.exit(1);
      }
      parent = target.top;
    }
    const after = place.after !== undefined ? await resolve(place.after, "--after") : null;
    if (after !== null && parent !== undefined && parentIn(tree.children, after) !== parent) {
      console.error(`${refusedLine(tree, slug, "level", { parent, after })} Nothing made.`);
      process.exit(1);
    }
    where = { parent, after, first: place.first };
  }
  try {
    await createReportFromStarter(slug, title, description);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    console.error((await slugRefused(slug)) ?? `Document already exists: ${shown(path.join(reportsDirectory, slug))}`);
    process.exit(1);
  }

  // The starter taken by the review of the Agent's changes before a server can look at the document, so
  // that the Agent's first write of it, however a server comes to take it, is the starter filled.
  await import("./hand-in.mjs").then(({ noteNew }) => noteNew(slug));
  console.log(`Created ${shown(path.join(reportsDirectory, slug, "doc.html"))} and doc.json`);
  // Placed in the tree (through the workspace's server when one runs, so that an open workbench shows it).
  if (where) {
    const placed = await moveInTree(slug, where);
    const tree = await readTree();
    if (placed.ok) console.log(`Placed it ${wentLine(tree, placed)}.`);
    else {
      console.log(`问题：Not placed (${refusedLine(tree, slug, placed.reason, { ...where, message: placed.message })}): it is at the top level, last; gallery move ${slug} puts it where it goes.`);
      process.exitCode = 1;
    }
  }
  // In the default workspace's sidebar too, when this is another workspace (shared/drafts.mjs).
  const joined = joinedLine(await joinDefaultTree(reportsDirectory, slug));
  if (joined) console.log(joined);
  // Where the documents are, and the user's writing preferences, which an Agent reads before it writes (SKILL.md).
  for (const line of await startLines()) console.log(line);
  // A workspace with no name (but the default one): how to name it after its project (./workspaces.mjs).
  const hint = nameHint(reportsDirectory);
  if (hint) console.log(hint);
  // The server's address, found or started first, said last.
  const preview = await previewOfNew(slug, { skipped: previewSkipped(options), command: `gallery new ${slug}` });
  // The next steps as SKILL.md's workflow has them: the address sent to the user (when the last line
  // gives it: server-process.mjs nextLine; what follows it starts with what to write, and names no
  // reference, SKILL.md's step 4 naming them), the writing (写作偏好 read first, as the line above says),
  // then gallery qa, which exports first (every block given its id) and looks. The line says what the
  // check fails on, and what the user sees of the writing: the write that replaces the starter is no
  // change, every write after it is shown as the Agent's changes (docs/editor.md "Agent's changes":
  // nothing lasts between writes since 2026-11-13). How many writes is the Agent's to choose.
  console.log(nextLine(preview, "replace the starter section with the document, as ordinary HTML (gallery check fails while the starter section remains). The write that replaces the starter is not marked; every write after it is shown to the user as your changes (「Agent 已修改」)."));
  console.log(`提示：when it is written, run gallery qa ${slug} (it exports first)`);
  // The browser opened at the address (--open alone) before it is said, so that the address stays the last line.
  const browser = open ? await browserLine(preview, options) : null;
  if (browser) console.log(browser);
  for (const line of preview) console.log(line);
}
