import { reportsDirectory } from "../shared/paths.mjs";
import { commandArguments, documentNamed, UsageError } from "./arguments.mjs";
import { browserLine, previewLines, serverFor, USER_LINE } from "./server-process.mjs";
import { joinDefaultTree, joinedLine } from "../shared/drafts.mjs";

// gallery open [<slug>] (./usage.mjs): the workspace's server, found or started (server-process.mjs:
// detached, so that it runs on after this command, its output in .gallery/logs/server.log), and the
// default browser opened at the workbench, or at document <slug> in it, or the document or block a
// link or a whole address names (arguments.mjs documentNamed; --no-browser, or
// GALLERY_NO_BROWSER=1, opens none: browser-open.mjs). Waits until the server answers (the
// document's page with its title, when one is named), then prints the workspace, a line on the
// server only when it is news (started now, an older one replaced, another port than the last
// command found: this command is done and the server runs on, nothing to wait for), the document's page
// alone, marked as the Agent's own, the address to give the user, and last whether the browser was opened. Exits 1 when there is no such document, when no
// server answers, or when the workspace's announced server takes the request and gives no answer
// (it is never started twice). Before that, with a slug and no gallery qa baseline, it writes one of
// the document before the round of changes an Agent opens the page for (serverFor's `baseline`:
// src/cli/qa-baseline.mjs previewBaseline). It asks nothing of the review of the Agent's changes,
// which needs no step of the Agent's (docs/editor.md "Agent's changes"). A document opened in a
// workspace other than the default one joins the default workspace's sidebar (shared/drafts.mjs
// joinDefaultTree), said in a line before the server's.

export async function run(argv) {
  const { positional, options, values } = commandArguments({ options: ["--no-browser", "--present"], values: ["--settings"], argv });
  const settings = values.get("--settings");
  if (settings && settings !== "extensions") throw new UsageError("--settings accepts extensions.");
  if (settings && positional.length) throw new UsageError("Use --settings without a document name.");
  if (options.has("--present") && settings) throw new UsageError("--present and --settings are two places: give one.");
  if (options.has("--present") && positional.length === 0) throw new UsageError("--present shows a document: name it, gallery open <document> --present.");
  if (positional.length > 1) throw new UsageError("Name one document at most.");
  const { slug = null, block = null } = positional.length ? await documentNamed(positional[0]) : {};
  console.log(`工作区：${reportsDirectory}`);
  // The command as run, --no-browser kept, for what serverFor says to run again when it finds no server.
  const command = `gallery open${slug ? ` ${slug}` : ""}${options.has("--no-browser") ? " --no-browser" : ""}`;
  const result = await serverFor({ slug, command, baseline: slug !== null });
  if (!result.ok) console.error(`问题：${result.message}`);
  if (result.reason === "missing") {
    // A name that is a custom page's (the home page's 首页 among them), not a document's: where it opens (testing the skill with Agents, 2026-11-09: gallery open home).
    const { HOME, pageExists } = await import("../shared/pages.mjs");
    const { missingPageSaid, HOME_NOT_MADE } = await import("./page.mjs");
    if (pageExists(slug, reportsDirectory)) console.error(`"${slug}" is a custom page, not a document: ${options.has("--no-browser") ? `gallery page open ${slug} --no-browser gives its address` : `gallery page open ${slug} opens it and gives its address`}.`);
    else if (slug === HOME && await missingPageSaid(slug, reportsDirectory) === HOME_NOT_MADE) console.error(HOME_NOT_MADE);
  }
  if (slug !== null && result.reason !== "missing") {
    const joined = joinedLine(await joinDefaultTree(reportsDirectory, slug));
    if (joined) console.log(joined);
  }
  if (!result.ok) process.exit(1);
  const lines = await previewLines(slug, result, block);
  if (settings) {
    const address = new URL(lines.at(-1).slice(USER_LINE.length));
    address.hash = "settings/extensions";
    lines[lines.length - 1] = USER_LINE + address.href;
  }
  if (options.has("--present")) {
    // The workbench's address with ?present before the # (the document's link): the workbench shows the document in 演示视图 once it has opened it.
    // (the address as the other lines write it: its words as they are, not percent-encoded by a URL's serialization)
    lines[lines.length - 1] = lines.at(-1).replace("/#", "/?present#");
  }
  for (const line of lines) console.log(line);
  console.log(await browserLine(lines, options));
}
