import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createMediaStore } from "../editor/media-store.mjs";
import { headerChanged } from "../editor/source.mjs";
import { siteIcon } from "../editor/unfurl.mjs";
import { glyphSvg } from "../render/emoji.mjs";
import { LOOK, effectiveLook, fullLook, ownLookOf } from "../shared/document-look.mjs";
import { iconKind } from "../shared/emoji/icon-value.mjs";
import { writeAtomic } from "../shared/files.mjs";
import { newNames } from "../shared/new-names.mjs";
import { reportsDirectory } from "../shared/paths.mjs";
import { findPreviewServer } from "../shared/preview-server.mjs";
import { roleOf } from "../shared/reports.mjs";
import { documentDirectory, documentFiles, pageSlug } from "../shared/workspace.mjs";
import { workspaceLook } from "../shared/workspace-look.mjs";
import { createWorkspaceService } from "../workbench/service.mjs";
import { commandArguments, documentNamed, UsageError } from "./arguments.mjs";
import { shown } from "./report-start.mjs";
import { throughServer } from "./tree.mjs";

// gallery set <document> [--title "<title>"] [--icon <icon>|none] [--description "<text>"]
// (./usage.mjs): a document's title, page icon or description changed as the workbench's 重命名 and
// the page's icon picker change them, its header and doc.json in step: the title in its h1 and
// <title> (where that holds the h1's words of before; else the whole of it) and doc.json's title; the
// icon in the header's div.doc-icon (made right before the h1, or taken away with --icon none) and
// doc.json's icon; the description in doc.json alone (no page shows it). An icon is any value the page
// icon takes: an emoji, an icon of the 图标 tab (/icons/<name>_<color>.svg, Tabler's
// /icons/tabler/<name>_<color>.svg), a picture of the document's assets/.
// Written as an Agent writes (natural.mjs headerChanged: the rest of doc.html as it is), not through the
// edit service: the workspace's server hears the write as any of an Agent's, so the open page shows it,
// the review of the Agent's changes counts it, and the workbench's sidebar shows the doc.json's title
// and icon at once (its event stream). doc.html is read again right before it is replaced (writeAtomic's
// expect: a save of the page's meanwhile is read again, three times at most). A document still in the
// format's old names is written in the new ones, as the editor's renaming writes it. The 写作偏好 page is
// the user's: never set. Says what changed; exits 1 for a document that is
// not there or has no title in its page, a picture that is not in its folder, a doc.json that does not read.
//
// 字体与布局 (--font, --size, --spacing, --width, --full, --wide-tables, and --all): the page's 字体与布局 menu and its
// 全宽 and 宽表格 switches, by the workspace service's own commands (POST look, one field a time, and looks for
// 应用到全部文档), so the open page changes at once: through the shared server while one runs (its queue;
// the watcher tells the page), else here by the same functions (src/workbench/service.mjs). Only the
// fields named are written, in doc.json's `look`; every other choice of the document's own stays, and a
// choice that is the system's default (--font sans) is a choice all the same, kept in doc.json. --all makes
// the look this document shows (after these choices) the user-level default every document without its own
// choice shows (shared/workspace-look.mjs writeGlobalLook): the documents' own choices stay.
//
// An icon may also be the name of a custom emoji (自定义表情, gallery emoji list): its image is copied into
// the document's assets/ as the page's icon picker copies it, and that picture is the icon.

const tidy = (value) => value.replace(/\s+/g, " ").trim();
// An icon of the 图标 tab as Git Bash hands it over: a Windows path of its own in place of the word's
// first / (/icons/x_blue.svg → C:/Program Files/Git/icons/x_blue.svg), read as what was typed.
const unbashed = (value) => value.replace(/^[a-z]:\/(?:[^/]+\/)*?(?=icons\/(?:tabler\/)?[^/]+$)/i, "/");
const quoted = (value) => (value === null ? "none" : JSON.stringify(value));

// 字体与布局: the option of each choice and the values it takes (LOOK's, the default first; 全宽 and 宽表格
// are switches, on or off: SWITCHES, the value each takes on).
const LOOK_OPTIONS = { "--font": "font", "--size": "size", "--spacing": "spacing", "--width": "width", "--full": "full", "--wide-tables": "tables" };
const SWITCHES = { full: { on: "full", label: "full width" }, tables: { on: "wide", label: "wide tables" } };
const switchOf = (option) => SWITCHES[LOOK_OPTIONS[option]] ?? null;
const valuesOf = (option) => (switchOf(option) ? ["on", "off"] : LOOK[LOOK_OPTIONS[option]]);
// The value an option's word gives its field (a switch's on or off, else the word itself).
const valueOf = (option, word) => (switchOf(option) ? (word === "on" ? switchOf(option).on : "default") : word);
// A choice as a line says it, and its field's name there.
const lookWord = (field, value) => (SWITCHES[field] ? (value === SWITCHES[field].on ? "on" : "off") : value);
const fieldLabel = (field) => SWITCHES[field]?.label ?? field;

// A workspace command (the service's run), through the shared server when one runs, else here.
async function command(name, body) {
  const server = await findPreviewServer();
  const answer = server ? await throughServer(server, body, name) : null;
  if (answer) return answer;
  const [, result] = await createWorkspaceService({ edits: {}, reports: {}, reportsDirectory, web: { icon: (url) => siteIcon(url) } }).run(name, body);
  return result;
}

// The custom emoji of the workspace's library named `value` (":name:" too), or null.
async function customEmojiNamed(value) {
  const name = value.replace(/^:(.+):$/, "$1");
  if (!/^[\p{Ll}\p{Lo}\d_-]{1,49}$/u.test(name)) return null;
  const [, { list }] = await createMediaStore({ reportsDirectory }).listEmojis();
  return list.find((entry) => entry.name === name) ?? null;
}

export async function run(argv) {
  const { positional, options, values } = commandArguments({ options: ["--all"], values: ["--title", "--icon", "--description", ...Object.keys(LOOK_OPTIONS)], argv });
  if (positional.length !== 1) throw new UsageError("Name one document, then what to set: --title, --icon, --description, --font, --size, --spacing, --width, --full, --wide-tables.");
  const looks = Object.keys(LOOK_OPTIONS).filter((option) => values.has(option));
  if (!["--title", "--icon", "--description"].some((option) => values.has(option)) && looks.length === 0 && !options.has("--all")) throw new UsageError('Say what to set: --title "<title>", --icon <emoji|none|…>, --description "<text>", --font/--size/--spacing/--width <value>, --full on|off, --wide-tables on|off, or --all.');
  for (const option of looks) {
    if (!valuesOf(option).includes(values.get(option))) throw new UsageError(`${option} takes ${valuesOf(option).join(", ")}, not ${values.get(option)}.`);
  }
  const choices = looks.map((option) => [LOOK_OPTIONS[option], valueOf(option, values.get(option))]);
  const title = values.has("--title") ? tidy(values.get("--title")) : undefined;
  const description = values.has("--description") ? tidy(values.get("--description")) : undefined;
  if (title === "") throw new UsageError("--title takes the words of the title: a document's title is never empty.");
  if (description === "") throw new UsageError("--description takes words: a document's description is never empty.");
  let icon;
  let custom = null; // the custom emoji --icon names
  if (values.has("--icon")) {
    const value = unbashed(values.get("--icon").trim());
    const kind = value === "none" ? "none" : iconKind(value);
    if (!kind && !/["<>&]/.test(value)) custom = await customEmojiNamed(value);
    if ((!kind && !custom) || /["<>&]/.test(value)) throw new UsageError(`Not a page icon: ${value} (an emoji, none, an icon of the 图标 tab as /icons/<name>_<color>.svg, a picture of the document's assets/, or the name of a custom emoji: gallery emoji list lists them).`);
    if (kind === "glyph" && !glyphSvg(value)) throw new UsageError(`No such icon of the 图标 tab: ${value}.`);
    icon = kind === "none" ? null : custom ? undefined : value; // a custom emoji's picture is made once the document is found
  }

  const { slug } = await documentNamed(positional[0]);
  const directory = documentDirectory(slug, reportsDirectory);
  if (slug === (await pageSlug(reportsDirectory)) || (await roleOf(directory)) === "instructions") {
    console.error(`${positional[0]} is the 写作偏好 page: only the user changes it.`);
    process.exit(1);
  }
  const { html, json } = documentFiles(directory);
  if (!existsSync(html)) {
    console.error(`No document "${positional[0]}": ${shown(html)} does not exist (gallery list lists those there are).`);
    process.exit(1);
  }
  if (custom) {
    // The picture the page's icon picker makes of a library emoji: copied into the document's assets/.
    const [, copied] = await createMediaStore({ reportsDirectory }).upload({ slug, library: custom.id });
    if (!copied?.ok) {
      console.error(`Could not copy the custom emoji ${custom.name} into ${shown(directory)}: ${copied?.message ?? copied?.reason ?? "no answer"}.`);
      process.exit(1);
    }
    icon = copied.path;
  }
  if (icon && iconKind(icon) === "image" && !existsSync(path.join(directory, ...icon.split("/")))) {
    console.error(`No picture ${icon} in ${shown(directory)}: put it in its assets/ first.`);
    process.exit(1);
  }
  let metadata;
  try {
    metadata = JSON.parse(await fs.readFile(json, "utf8"));
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new Error("not an object");
  } catch (error) {
    console.error(`${shown(json)} does not read (${error.code ?? error.message}): mend it first.`);
    process.exit(1);
  }

  // The page: its header as asked, written over the text it was made of (a save meanwhile: made again).
  let before = null;
  let wrotePage = false;
  for (let attempt = 1; title !== undefined || icon !== undefined; attempt++) {
    const written = await fs.readFile(html, "utf8");
    const source = newNames(written);
    const changed = headerChanged(source, { title, icon });
    if (changed.missing) {
      console.error(`${shown(html)} has no title to ${title !== undefined ? "set" : "put the icon before"}: write it as an h1.doc-title in the page's header (writing-html.md, "The page").`);
      process.exit(1);
    }
    before = changed.before;
    if (changed.text === source) break;
    if (await writeAtomic(html, changed.text, { expect: written })) {
      wrotePage = true;
      break;
    }
    if (attempt === 3) {
      console.error(`${shown(html)} kept changing while it was being written (the page saving, or an Agent writing it?): nothing written. Run gallery set again.`);
      process.exit(1);
    }
  }

  // doc.json: the same title and icon, and the description.
  const next = { ...metadata };
  if (title !== undefined) next.title = title;
  if (description !== undefined) next.description = description;
  if (icon === null) delete next.icon;
  else if (icon !== undefined) next.icon = icon;
  const wroteMetadata = JSON.stringify(next) !== JSON.stringify(metadata);
  if (wroteMetadata) await writeAtomic(json, `${JSON.stringify(next, null, 2)}\n`);

  // 字体与布局: each choice named, one a time, by the service's look (the open page follows at once); then,
  // with --all, looks (应用到全部文档). doc.json is read again to say what it kept.
  const lookBefore = fullLook(effectiveLook(next.look, workspaceLook(reportsDirectory)));
  let lookAfter = lookBefore;
  for (const [field, value] of choices) {
    const answer = await command("look", { slug, field, value });
    if (!answer?.ok) {
      console.error(`Not set: ${answer?.message ?? answer?.reason ?? "no answer"}.`);
      process.exit(1);
    }
    lookAfter = fullLook(answer.report?.look);
  }
  let ownAfter = ownLookOf(next.look);
  if (choices.length > 0) ownAfter = ownLookOf(JSON.parse(await fs.readFile(json, "utf8").catch(() => "{}")).look);
  let everywhere = null; // the look every document without its own choice shows now (--all)
  if (options.has("--all")) {
    const answer = await command("looks", { slug });
    if (!answer?.ok) {
      console.error(`Not applied to all documents: ${answer?.message ?? answer?.reason ?? "no answer"}.`);
      process.exit(1);
    }
    everywhere = fullLook(answer.look);
  }

  const name = path.basename(html);
  const said = [];
  if (title !== undefined) said.push(`  title: ${quoted(before.title)} → ${quoted(title)} (${name}'s h1 and <title>, ${path.basename(json)})`);
  if (icon !== undefined) said.push(`  icon: ${quoted(before.icon)} → ${quoted(icon)} (${name}'s header, ${path.basename(json)}${custom ? `; the custom emoji ${custom.name}` : ""})`);
  if (description !== undefined) said.push(`  description: ${quoted(typeof metadata.description === "string" ? metadata.description : null)} → ${quoted(description)} (${path.basename(json)})`);
  const ownBefore = ownLookOf(next.look);
  const lookWrote = choices.filter(([field]) => ownBefore[field] !== ownAfter[field]);
  for (const [field, value] of choices) {
    const label = fieldLabel(field);
    if (!lookWrote.some(([each]) => each === field)) continue;
    if (lookBefore[field] !== lookAfter[field]) said.push(`  ${label}: ${lookWord(field, lookBefore[field])} → ${lookWord(field, lookAfter[field])} (${path.basename(json)}'s look.${field})`);
    else said.push(`  ${label}: ${lookWord(field, value)} kept as the document's own choice (${path.basename(json)}'s look.${field}; the page already showed it)`);
  }
  if (everywhere) {
    const chosen = Object.entries(everywhere).filter(([field, value]) => value !== LOOK[field][0]).map(([field, value]) => `${fieldLabel(field)} ${lookWord(field, value)}`);
    said.push(`  all documents: ${chosen.length ? chosen.join(", ") : "the system's defaults"} (the look every document shows that has no choice of its own for it; kept with the user's settings, no document's file; documents with their own choices keep them)`);
  }
  const wroteLook = lookWrote.length > 0;
  const files = [...(wrotePage ? [shown(html)] : []), ...(wroteMetadata || wroteLook ? [shown(json)] : [])];
  if (files.length === 0 && !everywhere) {
    const asked = [title, icon, description].filter((each) => each !== undefined).length + choices.length;
    console.log(`Nothing to change: ${slug} has ${asked === 1 ? "that already" : "those already"}.`);
    return;
  }
  console.log(`Set ${slug}:`);
  for (const line of said) console.log(line);
}
