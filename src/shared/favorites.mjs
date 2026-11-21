import fs from "node:fs/promises";
import path from "node:path";
import { writeAtomic } from "./files.mjs";
import { entryPattern, isForeign } from "./outline-shape.mjs";
import { outlineRoot, withOutlineLock } from "./outline.mjs";
import { userDirectory } from "./user-directory.mjs";
import { workspaceId, workspaceKey } from "./workspace-registry.mjs";

// The sidebar's 收藏 (favorites): entries (a slug of the workspace, a web link's, or "~<ws id>/<slug>" for a draft of
// another workspace) the reader starred. The workbench keeps them in its browser (localStorage, which no command can
// reach) and, since gallery favorite, in favorites.json of the user's data folder too (beside the registry of
// workspaces: ./user-directory.mjs), as the one place a gallery command and the browsers of this machine share; never
// in a workspace's files: a star is the reader's, not the project's (a workspace synced or shared carries none). The
// list is written under the default workspace's outline lock; its keys are the ones the default
// workspace's sidebar names the entries by, so that a workspace's own entries are plain slugs there and another
// workspace's are "~<ws id>/<slug>" (the projection ./outline.mjs does for the tree): `favoriteKey` and `favoriteSlug`
// turn one into the other for a command working in a workspace other than the default.

const readJson = (file) => fs.readFile(file, "utf8").then(JSON.parse).catch(() => null);

/** The file the shared list is kept in: favorites.json of the user's data folder (GALLERY_DATA_DIR in the tests). */
export const favoritesFile = () => path.join(userDirectory("data"), "favorites.json");

/** The key entry `slug` of workspace `root` has in the stored list: plain in the default workspace, "~<id>/<slug>" elsewhere. */
export function favoriteKey(root, slug) {
  const home = outlineRoot(root);
  if (workspaceKey(root) === workspaceKey(home)) return slug;
  const homes = `~${workspaceId(home)}/`;
  if (slug.startsWith(homes)) return slug.slice(homes.length); // the default workspace's own, as the file names them
  return isForeign(slug) ? slug : `~${workspaceId(root)}/${slug}`;
}

/** A stored key as workspace `root`'s sidebar names the entry (its own entries lose the prefix, the default workspace's gain one: the projection ./outline.mjs does for the tree). */
export function favoriteSlug(root, key) {
  const home = outlineRoot(root);
  if (workspaceKey(root) === workspaceKey(home)) return key;
  const prefix = `~${workspaceId(root)}/`;
  if (key.startsWith(prefix)) return key.slice(prefix.length);
  return isForeign(key) ? key : `~${workspaceId(home)}/${key}`; // the default workspace's own entries are another workspace's drafts here
}

/** The favorites as a file holds them: entries once each, only valid ones. */
const kept = (value) => [...new Set((Array.isArray(value) ? value : []).filter((entry) => typeof entry === "string" && entryPattern.test(entry)))];

/**
 * The file's lists are kept by the default workspace whose sidebar they belong to (`workspaces`: its id -> its list), so that
 * another default workspace (GALLERY_DEFAULT_WORKSPACE, a test's) never sees a list that names other entries.
 */
const listIn = (document, root) => kept(document?.workspaces?.[workspaceId(outlineRoot(root))]);

/** The stored favorites seen from workspace `root` (its own entries as plain slugs). Read alone. */
export async function readFavorites(root) {
  return listIn(await readJson(favoritesFile()), root).map((key) => favoriteSlug(root, key));
}

/**
 * Favorites changed in the stored list under the outline's lock: `add` and `remove` are entries as workspace `root`'s
 * sidebar names them. Resolves to { favorites (seen from `root`), changed }. The other default workspaces' lists stay as they are.
 */
export function changeFavorites(root, { add = [], remove = [] }) {
  return withOutlineLock(root, async () => {
    const file = favoritesFile();
    const value = await readJson(file);
    const document = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const id = workspaceId(outlineRoot(root));
    const before = listIn(document, root);
    const dropped = new Set(kept(remove).map((slug) => favoriteKey(root, slug)));
    const after = [...before.filter((key) => !dropped.has(key)), ...kept(add).map((slug) => favoriteKey(root, slug)).filter((key) => !before.includes(key))];
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    if (changed) {
      await fs.mkdir(path.dirname(file), { recursive: true });
      const workspaces = document.workspaces && typeof document.workspaces === "object" && !Array.isArray(document.workspaces) ? document.workspaces : {};
      await writeAtomic(file, `${JSON.stringify({ version: 1, workspaces: { ...workspaces, [id]: after } }, null, 2)}\n`);
    }
    return { favorites: after.map((key) => favoriteSlug(root, key)), changed };
  });
}
