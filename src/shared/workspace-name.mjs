import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { writeAtomic } from "./files.mjs";
import { objectAt, ownLine } from "./pages.mjs";
import { documentsFolder, layoutOf, markerOf, WORKSPACE_MARK } from "./workspace.mjs";

// What a workspace is called where Gallery names it beside others (gallery workspaces, gallery list
// --all, and the sidebar's column of another workspace; since 2026-11-08): its own name,
// `name` in its gallery.json (gallery init --name, gallery workspaces --name, the
// user in the sidebar); else its folder's name, climbing past a name that says nothing of the project
// (GENERIC_NAMES: D:\proj\outputs\gallery is "proj") but never to the user's home, their Documents
// folder or a drive's root (~/Documents/Gallery stays "Gallery"; a workspace that is a drive's root
// is called by the drive, "E:"). Two of the same name are told apart by the folder above the one
// named, which the sidebar writes after the name in grey (workspaceLabels), and where that is called
// alike too, by the workspace's own path; the path is otherwise shown on hover and in the menus, never
// as the name, and no workspace is numbered. Reads files only, but writeWorkspaceName.

/** The folders' names that say nothing of a project, passed over upward (upper and lower case alike). */
export const GENERIC_NAMES = ["gallery", "docs", "outputs", "reports", "文档"];
/** The longest name a workspace is given, in characters. */
export const NAME_LIMIT = 80;

const isGeneric = (name) => GENERIC_NAMES.includes(name.toLowerCase());
const keyOf = (folder, platform) => (platform === "win32" ? path.resolve(folder).toLowerCase() : path.resolve(folder));
const oneLine = (value) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
// A folder's name; a drive's root, which has none, by the drive ("E:", "/").
const folderName = (folder) => path.basename(folder) || folder.replace(/[\\/]+$/, "") || folder;

/**
 * What a name given to a workspace is wrong in, or null: empty, longer than NAME_LIMIT characters, or
 * holding a control character (a line break among them).
 */
export function nameProblem(name) {
  if (typeof name !== "string" || !name.trim()) return "A workspace's name holds a word at least.";
  if (/[\u0000-\u001f\u007f]/.test(name)) return "A workspace's name is one line, with no control character.";
  if ([...name.trim()].length > NAME_LIMIT) return `A workspace's name is ${NAME_LIMIT} characters at most.`;
  return null;
}

/** The workspace's own name at `root` (gallery.json's `name`, on one line), or null: none, or a gallery.json that is not ours or does not read. */
export function ownName(root, { readText = (file) => readFileSync(file, "utf8") } = {}) {
  let text;
  try {
    text = readText(layoutOf(root).marker);
  } catch {
    return null;
  }
  const { value, ours } = markerOf(text);
  const name = ours ? oneLine(value?.name) : "";
  return name ? [...name].slice(0, NAME_LIMIT).join("") : null;
}

/** The folders no name climbs to: the user's home and their Documents folder (each workspace's name is found against these). */
export function nameStops({ home = os.homedir(), documents = documentsFolder({ home }) } = {}) {
  return [home, documents].filter(Boolean);
}

/**
 * The folder whose name a workspace at `root` goes by when it has none of its own: `root`, or the
 * nearest folder above it whose name is not generic, climbing no higher than below one of `stops` and
 * never to a drive's root (a folder there keeps its name, generic or not).
 */
export function namedFolder(root, { stops = [], platform = process.platform } = {}) {
  const stopped = new Set(stops.map((stop) => keyOf(stop, platform)));
  let folder = path.resolve(root);
  for (;;) {
    const parent = path.dirname(folder);
    const atRoot = parent === folder || path.dirname(parent) === parent;
    if (!isGeneric(path.basename(folder)) || atRoot || stopped.has(keyOf(parent, platform))) return folder;
    folder = parent;
  }
}

/**
 * What the workspace at `root` is called: { name, own: whether it is gallery.json's name (else its
 * folder's), folder: the folder named (the workspace's own for a name of its own), above: that
 * folder's parent's name (what tells two of the same name apart), parent: that parent's path }.
 */
export function workspaceName(root, { stops = [], platform = process.platform, readText } = {}) {
  const own = ownName(root, readText ? { readText } : undefined);
  const folder = own ? path.resolve(root) : namedFolder(root, { stops, platform });
  const parent = path.dirname(folder);
  return { name: own ?? folderName(folder), own: Boolean(own), folder, above: parent === folder ? null : path.basename(parent) || parent, parent };
}

/**
 * The names of several workspaces as the sidebar and the commands write them side by side: each of
 * `named` (workspaceName's, with its `root`, its path) as { root, name, own, above }, `above` null
 * but where another has the same name (upper and lower case alike): then the name of the folder above
 * the one named, and where another of them has that too (two workspaces side by side, or two in one
 * project climbing to its folder), or there is none (a drive's root), the workspace's own path, which
 * no other has.
 */
export function workspaceLabels(named) {
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();
  return named.map((entry) => {
    const label = { root: entry.root, name: entry.name, own: entry.own, above: null };
    const others = named.filter((other) => other !== entry && same(other.name, entry.name));
    if (!others.length) return label;
    const told = entry.above !== null && !others.some((other) => other.above !== null && same(other.above, entry.above));
    return { ...label, above: told ? entry.above : entry.root };
  });
}

/**
 * gallery.json at `root` with `name` as the workspace's name (namedIn: in place of the one it had,
 * else right after what marks it; all else it holds kept, and the file's own layout with it), written
 * at once; the workspace must be there and its gallery.json ours (ensureWorkspace first). Resolves to
 * { name: as written, before: the name it had, or null }; throws an Error saying why when the name is
 * wrong (nameProblem), the file is not ours or does not read, or it kept changing under the write.
 */
export async function writeWorkspaceName(root, name) {
  const problem = nameProblem(name);
  if (problem) throw new Error(problem);
  const wanted = name.trim();
  const file = layoutOf(root).marker;
  for (let tries = 0; tries < 3; tries++) {
    const text = await fs.readFile(file, "utf8");
    const { value, ours, reads } = markerOf(text);
    if (!ours || !value || typeof value !== "object" || Array.isArray(value)) throw new Error(reads ? `${file} is not Gallery's.` : `${file} does not read as JSON: mend it first.`);
    const before = oneLine(value.name) || null;
    if (value.name === wanted) return { name: wanted, before };
    let next = null;
    try {
      next = namedIn(text, wanted);
    } catch {}
    // What the text says once written is checked: any doubt, the whole file written as JSON.stringify lays it out.
    if (next === null || !isDeepStrictEqual(markerOf(next).value, { ...value, name: wanted })) {
      const { gallery, version, name: _old, ...rest } = value;
      next = `${JSON.stringify({ gallery: gallery ?? WORKSPACE_MARK.gallery, version: version ?? WORKSPACE_MARK.version, name: wanted, ...rest }, null, 2)}\n`;
    }
    if (await writeAtomic(file, next, { expect: text })) return { name: wanted, before };
  }
  throw new Error(`${file} kept changing while its name was written: try again.`);
}

// gallery.json's text (`text`, Gallery's, a JSON object that reads) with `name` as its name, written
// into it as it stands, as ./pages.mjs writes pages.homeMade (its line ends, indentation, BOM, the order
// of its keys and what stands on one line kept): the name it had replaced in its place, else one added
// right after the mark (`gallery`, or `version` where that comes after it), laid out as that member is
// (on a line of its own at its indentation, or on its line after it, as tightly).
function namedIn(text, name) {
  const top = objectAt(text, text.indexOf("{"));
  const had = top.members.findLast(({ key }) => key === "name");
  if (had) return `${text.slice(0, had.value)}${JSON.stringify(name)}${text.slice(had.end)}`;
  const mark = top.members.filter(({ key }) => key === "gallery" || key === "version").at(-1);
  if (!mark) return null;
  const indent = ownLine(text, top.open, mark);
  const gap = indent !== null ? (text.includes("\r\n") ? "\r\n" : "\n") + indent : /[ \t]*$/.exec(text.slice(0, mark.from))[0];
  return `${text.slice(0, mark.end)},${gap}"name":${mark.colon}${JSON.stringify(name)}${text.slice(mark.end)}`;
}
