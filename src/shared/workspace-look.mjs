import { existsSync, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { userDirectory } from "./user-directory.mjs";
import { effectiveLook, lookOf, withLookField } from "./document-look.mjs";
import { writeAtomic } from "./files.mjs";
import { refusal, said } from "./i18n/index.mjs";
import { WORKSPACE_MARK, documentDirectory, documentFiles, layoutOf, markerOf } from "./workspace.mjs";

// One user-level appearance default; legacy workspace defaults are a fallback until
// a global choice is made. Document overrides win field by field. Instructions pages
// are exempt. Rendering, report metadata and export all share this resolver.

// gallery.json as it reads now: what it holds when it is ours (a workspace without one holds nothing),
// else why it cannot be taken (its components' messages: src/shared/component-catalog.mjs).
const UNREAD = said("gallery.json 读不出来：改好这个文件后再试");
const NOT_OURS = said("gallery.json 不是 Gallery 的文件");
const NOT_WRITABLE = ["EPERM", "EACCES", "EBUSY", "EROFS"];
function settingsOf(text) {
  if (text === null) return { value: null };
  const { value, ours, reads } = markerOf(text);
  return ours ? { value } : { problem: reads ? NOT_OURS : UNREAD };
}
const readText = (file) => {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    return error.code === "ENOENT" ? null : undefined;
  }
};

/** The workspace's default look at `root` (lookOf's form), {} for none, for no gallery.json and for one that does not read or is not ours. */
export function workspaceLook(root) {
  const global = readText(globalLookFile());
  if (global != null) {
    try { const value = JSON.parse(global); if (value && typeof value.look === "object" && !Array.isArray(value.look)) return lookOf(value.look); } catch {}
  }
  const text = readText(layoutOf(root).marker);
  return text === undefined ? {} : lookOf(settingsOf(text).value?.look);
}

// One default for all storage directories. An explicit empty look overrides legacy
// gallery.json defaults too; until the user chooses a global default, keep those intact.
export const globalLookFile = () => path.join(userDirectory("data"), "appearance.json");
export async function writeGlobalLook(look) {
  const file = globalLookFile();
  const text = await fs.readFile(file, "utf8").catch(error => { if (error.code === "ENOENT") return null; throw error; });
  const next = JSON.stringify({ look: lookOf(look) }, null, 2) + "\n";
  if (text === next) return;
  await fs.mkdir(path.dirname(file), { recursive: true });
  if (!await writeAtomic(file, next, { expect: text })) throw new Error("Global appearance changed; try again");
}

/**
 * What document `slug`'s doc.json says of its look at `root`: { own: its `look` as written (null for
 * none, for a doc.json that does not read and for none at all), instructions: whether it is the 写作偏好
 * page's, reads: whether what it says can be taken, which a doc.json an Agent is writing may not, a
 * moment; a document with no doc.json at all (one made by hand: its doc.html alone) says it has no look
 * of its own, and reads, while one whose folder is gone says nothing }.
 */
export function ownLookAt(slug, root) {
  const files = documentFiles(documentDirectory(slug, root));
  try {
    const metadata = JSON.parse(readFileSync(files.json, "utf8"));
    const reads = Boolean(metadata) && typeof metadata === "object" && !Array.isArray(metadata);
    return { own: reads ? (metadata.look ?? null) : null, instructions: reads && metadata.instructions === true, reads };
  } catch (error) {
    return { own: null, instructions: false, reads: error.code === "ENOENT" && existsSync(files.html) };
  }
}

/**
 * The look document `slug` of the workspace at `root` shows (lookOf's form, {} for the default): its
 * own over the workspace's (effectiveLook); the workspace's for a doc.json that does not read, none
 * for the 写作偏好 page.
 */
export function documentLook(slug, root) {
  const { own, instructions } = ownLookAt(slug, root);
  return instructions ? {} : effectiveLook(own, workspaceLook(root));
}

/**
 * gallery.json with `look` as the workspace's default look (lookOf: each default left out, the field
 * gone when all are), written at once and with all else it holds kept, made when there is none. A
 * file that does not read, is another program's, changed under this write or cannot be written is
 * refused (an error that says why: refusal), and stays as it is.
 */
export async function writeWorkspaceLook(root, look) {
  const file = layoutOf(root).marker;
  const text = await fs.readFile(file, "utf8").catch((error) => {
    if (error.code === "ENOENT") return null;
    throw refusal(UNREAD);
  });
  const { value, problem } = settingsOf(text);
  if (problem) throw refusal(problem);
  if (value === null && Object.keys(lookOf(look)).length === 0) return; // no file, and none needed for the default
  const written = withLookField(value ?? WORKSPACE_MARK, lookOf(look)); // in its place, else last; gone for the default
  if (JSON.stringify(written) === JSON.stringify(value)) return;
  const done = await writeAtomic(file, `${JSON.stringify(written, null, 2)}\n`, { expect: text }).catch((error) => {
    if (NOT_WRITABLE.includes(error.code)) throw refusal(said("gallery.json 写不进去：可能是只读的，或被别的程序占着"));
    throw error;
  });
  if (!done) throw refusal(said("gallery.json 刚刚被改过：再试一次"));
}
