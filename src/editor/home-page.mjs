import { readFileSync } from "node:fs";
import { writeAtomic } from "../shared/files.mjs";
import { readCatalog } from "../shared/component-catalog.mjs";
import { HOME, createPage, homeTitle, hintOf, markHomeMade, pageExists, pageFiles, pageSlugRefused, pagesSettings, writeHints } from "../shared/pages.mjs";
import { layoutOf, markerOf } from "../shared/workspace.mjs";
import { lineIconValue } from "../shared/emoji/line-icons.mjs";
import { createPageService } from "./page-service.mjs";

// The default home page (首页;
// docs/render.md "A custom page", **The default home page**): pages/home, titled 首页 (Home on a system whose language is not Chinese: homeTitle(), the words
// Gallery writes into files follow the system's language at the moment, shared/file-language.mjs; a home
// page already made keeps its title, never renamed when the system's language is not the one it was made
// in), as gallery page new writes a page (its title in `<title>`, one board `main`), and
// on it a card of each of Gallery's own blocks of shared/pages.mjs HOME_CARDS (问候与日期, 天气, 倒计时, 习惯打卡, 工作区统计, 我的待办, 编辑热力图, 最近编辑, 便签, 静态卡片), put in
// by the page service's restore-defaults (told in its writes.jsonl as Gallery's own, `by` "gallery", so
// that gallery page check names these cards as put there by Gallery, neither the user's nor the Agent's,
// while a reader's own 恢复默认卡片 from the sidebar stays the user's): each block added to the workspace as gallery block add adds it
// (components/gallery/<name>/, its version and fingerprint in .gallery/blocks.json), each card of its size there (HOME_SIZES) at the
// first free spot (shared/board-places.mjs, the rule every card goes by).
// Made once for a workspace, as a server starts (src/server/index.mjs adoptWorkspace, the dev server's;
// src/server/production.mjs, the release's) and by gallery init, never by another command
// (ensureWorkspace, which they all run, makes none): a new workspace has it from its first start, an
// existing one from the first start of a Gallery that makes it, and gallery.json's pages.homeMade says
// it was, after which nothing makes it again, so that a home taken away stays away. A pages/home that is
// there already (an Agent's) is kept as it is and only marked. A workspace whose gallery.json does not
// read as Gallery's gets none (nothing could say it was made), nor one whose slug `home` a document or
// the trash holds (documents and custom pages share their slugs), which a start then tries again.
// GALLERY_NO_DEFAULT_HOME (set, not "", "0" or "false") makes none: the tests' workspaces, whose
// scenarios and unit tests of the home page start it again without it. Nothing of it stops a start:
// what it cannot make or write (a gallery.json Windows keeps read-only or another program holds, a file
// where pages/ goes) is an answer, failed, which the start says in a line (homeFailure) and goes on
// without, never a throw; nothing marked then, so that a later start tries again.
// It is a page like any other (no code goes by its slug: it is renamed, trashed and restored as any page
// is), whose page.json says what any page's may (shared/pages.mjs pageMetaOf): defaultCards (恢复默认卡片 in its
// menu, the note of the default cards it has not got), hint (its first-open note) and its icon, a house in
// lines (HOME_ICON). A home page made before its page.json said these (a development build of 0.2.0's, when
// the home page was special by its slug) is given them once, as a start finds it (adoptOldHome): defaultCards
// and hint, and the house where it has no icon; one whose page.json says either is the user's or the Agent's
// as it is. One made while its house was MingCute's filled one (OLD_HOME_ICON, a development build of 0.2.0's
// too) is given the house in lines once, where its icon is still that one.

/** The environment variable that keeps a server and gallery init from making the default home page. */
export const NO_DEFAULT_HOME = "GALLERY_NO_DEFAULT_HOME";

/**
 * The default home page's icon (its page.json's): Lucide's house in lines (shared/emoji/line-icons.mjs), drawn as the
 * sidebar head's other rows are (新建, 搜索) in its icon gray, never a filled icon (the user's word of 2026-11-09).
 */
export const HOME_ICON = lineIconValue("house");
/** The house a home page was made with before (MingCute's filled one, light grey), which a start gives HOME_ICON in its place once. */
const OLD_HOME_ICON = "/icons/home-1_lightgray.svg";

/** Whether `env` says to make no default home page (NO_DEFAULT_HOME set, not to "", "0" or "false"). */
export const homeOff = (env = process.env) => !["", "0", "false", undefined].includes(env[NO_DEFAULT_HOME]);

/**
 * Make workspace `root`'s default home page when it is due (above). `shipped`: the folder of Gallery's
 * own blocks (the package's by default); `stateDirectory`: where the page service keeps the versions it
 * writes over (the workspace's .gallery/state/); `env`: whose NO_DEFAULT_HOME is read. Resolves to { did }:
 * "made" (with `cards`, the ids of the cards put on it, and `skipped`, the default blocks not put there:
 * the page service's restore-defaults), "kept" (a pages/home was there: marked alone), "done" (gallery.json
 * says it was made), "off" (NO_DEFAULT_HOME), "unread" (gallery.json does not read as Gallery's), "taken"
 * (with `why`: the slug home is a document's or the trash's) or "failed" (something could not be made or
 * written: `stage`, the step it stopped at, "page" (pages/home), "cards" (its cards) or "mark" (gallery.json's
 * pages.homeMade), `file`, the home page's page.html where there is one by then, else null, and `why`, the
 * error's words; homeFailure says it in a line). Never rejects.
 */
export async function makeDefaultHome(root, { shipped = undefined, stateDirectory = layoutOf(root).state, env = process.env } = {}) {
  if (homeOff(env)) return { did: "off" };
  let marker = { ours: false };
  try {
    marker = markerOf(readFileSync(layoutOf(root).marker, "utf8"));
  } catch {}
  if (!marker.ours) return { did: "unread" };
  if (pagesSettings(root).homeMade) {
    await adoptOldHome(root).catch(() => {});
    return { did: "done" };
  }
  let stage = "mark";
  try {
    if (pageExists(HOME, root)) {
      await markHomeMade(root);
      await writeHints(root, { homeAdopted: true, homeLineIcon: true }).catch(() => {}); // an Agent's own home: a page as it is
      return { did: "kept" };
    }
    stage = "page";
    const why = await pageSlugRefused(HOME, root);
    if (why) return { did: "taken", why };
    await createPage(HOME, homeTitle(), { root, icon: HOME_ICON, defaultCards: true, hint: true });
    stage = "cards";
    const service = createPageService({ root, edits: null, stateDirectory, catalog: () => readCatalog(root), shipped });
    const [, answer] = await service.apply(HOME, { op: "restore-defaults" }, { by: "gallery" });
    stage = "mark";
    await markHomeMade(root);
    await writeHints(root, { homeAdopted: true, homeLineIcon: true }).catch(() => {}); // made as every page is now: nothing to adopt
    return { did: "made", file: pageFiles(HOME, root).html, cards: (answer.added ?? []).map(({ card }) => card), skipped: answer.skipped ?? [] };
  } catch (error) {
    return { did: "failed", stage, file: pageExists(HOME, root) ? pageFiles(HOME, root).html : null, why: error?.message ?? String(error) };
  }
}

/**
 * The home page a Gallery made while it was special by its slug (pages/home, its page.json saying neither
 * defaultCards nor hint) given what it had then as page.json's: defaultCards and hint, and the house where
 * it has no icon (every other field, and page.html, as they are). Once for a workspace (.gallery/hints.json's
 * `homeAdopted`, written whether or not there was one to give them): a page called home made after it is
 * a page as any other. Then, once too (`homeLineIcon`), a pages/home whose icon is still the filled house
 * Gallery gave it (OLD_HOME_ICON) is given the house in lines (HOME_ICON), every other byte of its page.json
 * as it was; an icon someone chose is theirs. Resolves to whether it wrote.
 */
export async function adoptOldHome(root) {
  let wrote = false;
  // pages/home's page.json: { json, text, value }, or null (none there, or none that reads as a table).
  const meta = () => {
    if (!pageExists(HOME, root)) return null;
    const { json } = pageFiles(HOME, root);
    try {
      const text = readFileSync(json, "utf8");
      const value = JSON.parse(text.replace(/^﻿/, ""));
      return value && typeof value === "object" && !Array.isArray(value) ? { json, text, value } : null;
    } catch {
      return null;
    }
  };
  if (hintOf(root, "homeAdopted") !== true) {
    const found = meta();
    if (found && !("defaultCards" in found.value) && !("hint" in found.value)) {
      const next = { ...found.value, ...(found.value.icon ? {} : { icon: HOME_ICON }), defaultCards: true, hint: true };
      wrote = await writeAtomic(found.json, `${JSON.stringify(next, null, 2)}\n`, { expect: found.text });
    }
    await writeHints(root, { homeAdopted: true });
  }
  if (hintOf(root, "homeLineIcon") !== true) {
    const found = meta();
    if (found?.value.icon === OLD_HOME_ICON) wrote = (await writeAtomic(found.json, `${JSON.stringify({ ...found.value, icon: HOME_ICON }, null, 2)}\n`, { expect: found.text })) || wrote;
    await writeHints(root, { homeLineIcon: true });
  }
  return wrote;
}

/**
 * The line a start (the dev server's, the release's) and gallery init say of makeDefaultHome's answer
 * `home` when it is "failed": what was not done, why, and what comes of it.
 */
export function homeFailure({ stage, file, why }) {
  if (stage === "mark") return `The default home page ${file} is there, but gallery.json could not say it was made (${why}); a later start tries again.`;
  if (stage === "cards") return `The default home page ${file} was made without its cards (${why}): 恢复默认卡片 in its menu in the sidebar puts them on.`;
  return `The default home page was not made (${why}); a later start tries again.`;
}
