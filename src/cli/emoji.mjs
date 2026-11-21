import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createMediaStore } from "../editor/media-store.mjs";
import { emojiDataDirectory, reportsDirectory } from "../shared/paths.mjs";
import { layoutOf } from "../shared/workspace.mjs";
import { commandArguments, UsageError } from "./arguments.mjs";

// gallery emoji add <name> <image> | list [--json] (./usage.mjs): the workspace's custom emoji (自定义表情,
// the page icon picker's "+": <workspace>/.gallery/emoji-library/, library.json and the images), added and
// listed by the media store's own functions the workbench's POST/GET /__gallery/edit/emoji-library run
// (src/editor/media-store.mjs addEmoji, listEmojis): a name as the picker takes one (lower-case letters,
// digits, - and _, under 50 characters; spaces become -; not one the library or a standard emoji has), an
// image of PNG, JPEG, GIF, WebP, AVIF, SVG or ICO under 2 MB, a local file or an http(s) address the
// server side downloads. Done here, in this process, whether a server runs or not: the library is a
// folder of content-named files and a list read each time, which a running server reads fresh.
// Once added, gallery set <document> --icon <name> (src/cli/set.mjs) copies the image into the document's
// assets/ as the picker does and makes it the page's icon.

const NAME = /^[\p{Ll}\p{Lo}\d_-]{1,49}$/u;

// The standard emojis' names (a custom emoji's name must not take one: the picker refuses it too).
const standardNames = () => {
  try {
    return JSON.parse(readFileSync(path.join(emojiDataDirectory, "names.json"), "utf8"));
  } catch {
    return {};
  }
};

/** A name as the picker makes it of what is typed: lower case, white space (and colons around it) into -. */
const nameOf = (value) => value.trim().replace(/^:(.+):$/, "$1").toLocaleLowerCase().replace(/\s+/g, "-");

const WHY = {
  type: "that is not an image (PNG, JPEG, GIF, WebP, AVIF, SVG or ICO)",
  size: "the image is over 2 MB",
  download: "the address did not give the image",
  name: "the library has an emoji of that name already",
};

// The library as the command lists it: { name, id, file, path, created }.
async function library(store) {
  const [, { list }] = await store.listEmojis();
  const folder = layoutOf(reportsDirectory).emojiLibrary;
  return list.map((entry) => {
    const file = entry.url.slice(entry.url.lastIndexOf("/") + 1);
    return { name: entry.name, id: entry.id, file, path: path.join(folder, file), created: new Date(entry.created_time).toISOString() };
  });
}

async function add(positional) {
  if (positional.length !== 2) throw new UsageError("Name the emoji and its image: gallery emoji add <name> <image>.");
  const name = nameOf(positional[0]);
  if (!NAME.test(name)) throw new UsageError(`Not a name a custom emoji takes: ${positional[0]} (lower-case letters, Chinese characters and other letters without case, digits, - and _, under 50 characters).`);
  const source = positional[1];
  const web = /^https?:\/\//i.test(source);
  const store = createMediaStore({ reportsDirectory });
  if (Object.hasOwn(standardNames(), name)) {
    console.error(`${name} is the name of a standard emoji: a custom emoji takes another name.`);
    process.exit(1);
  }
  let body;
  if (web) body = { name, url: source };
  else {
    const file = path.resolve(source);
    const data = await fs.readFile(file).catch(() => null);
    if (!data) {
      console.error(`No image ${file}: give the path of a PNG, JPEG, GIF, WebP, AVIF, SVG or ICO file, or its http(s) address.`);
      process.exit(1);
    }
    body = { name, data: data.toString("base64") };
  }
  const [, answer] = await store.addEmoji(body);
  if (!answer?.ok) {
    console.error(`Not added: ${WHY[answer?.reason] ?? answer?.message ?? answer?.reason ?? "no answer"}${WHY[answer?.reason] && answer?.message ? ` (${answer.message})` : ""}.`);
    process.exit(1);
  }
  const added = (await library(store)).find((entry) => entry.id === answer.entry.id);
  console.log(`Added the custom emoji ${name} (${web ? source : path.basename(source)}) to the workspace's library: ${added?.path ?? ""}`);
  console.log(`下一步：gallery set <document> --icon ${name} makes it a document's page icon (a picture copied into its assets/); the workbench's icon picker lists it too.`);
}

async function list(options) {
  const emojis = await library(createMediaStore({ reportsDirectory }));
  if (options.has("--json")) {
    console.log(JSON.stringify({ workspace: reportsDirectory, emojis }, null, 2));
    return;
  }
  if (emojis.length === 0) {
    console.log("No custom emoji yet: gallery emoji add <name> <image> adds one.");
    return;
  }
  console.log(`${emojis.length} custom emoji in ${layoutOf(reportsDirectory).emojiLibrary}:`);
  for (const { name, file } of emojis.sort((a, b) => a.name.localeCompare(b.name))) console.log(`  ${name}  ${file}`);
  console.log("提示：use one as a document's icon: gallery set <document> --icon <name>.");
}

export async function run(argv) {
  const [action, ...rest] = argv;
  if (action === "add") {
    const { positional } = commandArguments({ argv: rest });
    return add(positional);
  }
  if (action === "list") {
    const { positional, options } = commandArguments({ options: ["--json"], argv: rest });
    if (positional.length) throw new UsageError("gallery emoji list takes no arguments.");
    return list(options);
  }
  throw new UsageError(action ? `No such action: emoji ${action} (add, list).` : "Say what to do: gallery emoji add <name> <image>, or gallery emoji list.");
}
