import path from "node:path";
import { pageLinks, pageOfLink } from "../shared/page-links.mjs";
import { reportsDirectory } from "../shared/paths.mjs";
import { findPreviewServer } from "../shared/preview-server.mjs";
import { topOf } from "../shared/outline-shape.mjs";
import { siteIcon } from "../editor/unfurl.mjs";
import { LINK_FILE, linkAddress, linkIcon } from "../shared/web-links.mjs";
import { createWorkspaceService } from "../workbench/service.mjs";
import { commandArguments, documentNamed, UsageError } from "./arguments.mjs";
import { columnName, columnNamed, named, placeLine, readTree, throughServer, wentLine } from "./tree.mjs";
import { trashEntry } from "./trash.mjs";
import { shown } from "./report-start.mjs";

// gallery link add|set|remove (./usage.mjs; remove is gallery trash <link>, the same move): the sidebar's web links (shared/web-links.mjs: a folder
// <slug>/link.json beside the documents, shown in the workbench's content area, never a document).
// Each through the workspace's running server when there is one (its queue, so that an open workbench
// shows it at once: src/workbench/service.mjs POST link, link-set, trash), else here by the same code
// (the service's run, under the outline's lock; the site's icon fetched and kept as the server would,
// waited for). A link is named by its slug or its link (the words of its title and its page id, what the
// workbench's address holds after #). With no --under or --after a new link goes first: in the own column
// (the workspace's own documents'), or in the column --column names.

const tidy = (value) => value.replace(/\s+/g, " ").trim();
const quoted = (value) => (value === null || value === undefined ? "none" : JSON.stringify(value));

// The command, through the server or here: the service's answer ({ ok, … } or { ok: false, reason, message }).
async function command(name, body) {
  const server = await findPreviewServer();
  const answer = server ? await throughServer(server, body, name) : null;
  if (answer) return answer;
  const [, result] = await createWorkspaceService({ edits: {}, reports: {}, reportsDirectory, web: { icon: (url) => siteIcon(url) } }).run(name, body);
  return result;
}

// The link `name` names (its slug, or its link in the workbench's address), of `tree` (readTree's), or a refusal.
function linkNamed(tree, name) {
  const links = [...tree.documents.values()].filter(({ url }) => url !== undefined);
  const slug = pageOfLink(pageLinks(links), name.replace(/^.*#/, ""));
  if (slug) return { slug, link: tree.documents.get(slug) };
  const document = tree.documents.get(name);
  return { refused: document ? `${named(tree, name)} is a document, not a web link: gallery set changes a document.` : `No web link "${name}": gallery list --tree shows the sidebar's entries.` };
}

async function add(positional, options, values) {
  if (positional.length !== 2) throw new UsageError('Name the address and the name: gallery link add <url> "<name>".');
  const [url, title] = positional;
  const address = linkAddress(url);
  if (address.refused) throw new UsageError(`Not an address a web link takes: ${url} (${{ url: "no address", scheme: "http or https only", long: "2048 characters at most" }[address.refused]}).`);
  if (!tidy(title)) throw new UsageError("The name is never empty.");
  const column = values.get("--column");
  const under = values.get("--under");
  const after = values.get("--after");
  const icon = values.get("--icon");
  if (column !== undefined && under !== undefined) throw new UsageError("--column and --under are two places: give one.");
  if (after !== undefined && options.has("--first")) throw new UsageError("--after and --first are two places: give one.");
  if (icon !== undefined && !linkIcon(icon)) throw new UsageError(`Not an icon a web link takes: ${icon} (an emoji, or an icon of the 图标 tab as /icons/<name>_<color>.svg).`);
  const tree = await readTree();
  let parent;
  if (column !== undefined) {
    const group = columnNamed(tree, column);
    if (!group) {
      console.error(`No column "${column}" in the sidebar (${tree.groups.map(columnName).join(", ")}): nothing added.`);
      process.exit(1);
    }
    parent = topOf(group.id);
  }
  if (under !== undefined) parent = (await documentNamed(under)).slug;
  const afterSlug = after === undefined ? null : (await documentNamed(after)).slug;
  // First in its column (the own one when none is named) unless --under or --after says otherwise (the sidebar's 添加在线网页… puts one first too).
  const first = options.has("--first") || (under === undefined && afterSlug === null);
  const answer = await command("link", { url: address.url, title: tidy(title), ...(icon ? { icon } : {}), ...(parent !== undefined ? { parent } : {}), after: afterSlug, first });
  if (!answer?.ok) {
    console.error(`Not added: ${answer?.message ?? answer?.reason ?? "no answer"}.`);
    process.exit(1);
  }
  const now = await readTree();
  const { slug, url: kept } = answer.link;
  console.log(`Added the web link ${named(now, slug)}: ${kept}`);
  console.log(`Placed it ${wentLine(now, { parent: answer.parent, index: answer.index })}.`);
  console.log(placeLine(now, slug));
  console.log(`It is ${shown(path.join(reportsDirectory, slug, LINK_FILE))}; the workbench shows the page beside the sidebar (a site that refuses frames: 在浏览器中打开).`);
}

async function set(positional, values) {
  if (positional.length !== 1) throw new UsageError("Name one web link, then what to set: --url, --title, --icon.");
  if (!["--url", "--title", "--icon"].some((option) => values.has(option))) throw new UsageError('Say what to set: --url <address>, --title "<name>", --icon <emoji|none>.');
  const title = values.has("--title") ? tidy(values.get("--title")) : undefined;
  if (title === "") throw new UsageError("--title takes the words of the name: a web link's name is never empty.");
  let url;
  if (values.has("--url")) {
    const address = linkAddress(values.get("--url"));
    if (address.refused) throw new UsageError(`Not an address a web link takes: ${values.get("--url")}.`);
    url = address.url;
  }
  let icon;
  if (values.has("--icon")) {
    const value = values.get("--icon").trim();
    if (value !== "none" && !linkIcon(value)) throw new UsageError(`Not an icon a web link takes: ${value} (an emoji, none, or an icon of the 图标 tab).`);
    icon = value === "none" ? null : value;
  }
  const tree = await readTree();
  const found = linkNamed(tree, positional[0]);
  if (found.refused) {
    console.error(found.refused);
    process.exit(1);
  }
  const { slug, link } = found;
  const answer = await command("link-set", { slug, ...(url !== undefined ? { url } : {}), ...(title !== undefined ? { title } : {}), ...(icon !== undefined ? { icon } : {}) });
  if (!answer?.ok) {
    console.error(`Not set: ${answer?.message ?? answer?.reason ?? "no answer"}.`);
    process.exit(1);
  }
  const after = answer.link;
  const said = [
    ...(title !== undefined && title !== link.title ? [`  title: ${quoted(link.title)} → ${quoted(after.title)}`] : []),
    ...(url !== undefined && after.url !== link.url ? [`  url: ${link.url} → ${after.url}`] : []),
    ...(icon !== undefined && (after.icon ?? null) !== (link.icon ?? null) ? [`  icon: ${quoted(link.icon)} → ${quoted(after.icon ?? null)}`] : []),
  ];
  if (!said.length) return void console.log(`Nothing to change: ${slug} has ${values.size === 1 ? "that already" : "those already"}.`);
  console.log(`Set the web link ${slug}:`);
  for (const line of said) console.log(line);
}

async function remove(positional) {
  if (positional.length !== 1) throw new UsageError("Name one web link to move to the trash.");
  const tree = await readTree();
  const found = linkNamed(tree, positional[0]);
  if (found.refused) {
    console.error(found.refused);
    process.exit(1);
  }
  // The same move gallery trash makes (./trash.mjs: the service's trash, through the server when one runs).
  const moved = await trashEntry({ kind: "link", slug: found.slug });
  if (moved.refused) {
    console.error(`Not moved to the trash: ${moved.refused}.`);
    process.exit(1);
  }
  console.log(`Moved the web link ${named(tree, found.slug)} to the trash: the workbench's 设置 › 回收区 restores it where it was.`);
}

export async function run(argv) {
  const [action, ...rest] = argv;
  if (action === "add") {
    const { positional, options, values } = commandArguments({ options: ["--first"], values: ["--column", "--under", "--after", "--icon"], argv: rest });
    return add(positional, options, values);
  }
  if (action === "set") {
    const { positional, values } = commandArguments({ values: ["--url", "--title", "--icon"], argv: rest });
    return set(positional, values);
  }
  if (action === "remove") {
    const { positional } = commandArguments({ argv: rest });
    return remove(positional);
  }
  throw new UsageError(action ? `No such action: link ${action} (add, set, remove).` : "Say what to do: gallery link add, set or remove.");
}

