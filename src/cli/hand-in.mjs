import { workspaceBase } from "../shared/service-location.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { createEditService } from "../editor/service.mjs";
import { changeLines } from "../editor/source.mjs";
import { withNeededKitTags } from "../render/assets.mjs";
import { repeatedIdFailures } from "../render/pipeline.mjs";
import { editStateDirectory, reportsDirectory } from "../shared/paths.mjs";
import { findPreviewServer } from "../shared/preview-server.mjs";
import { documentDirectory, documentFiles } from "../shared/workspace.mjs";

// gallery export's hand-in (docs/editor.md, "Natural HTML" and "Block ids"): before a report is
// checked and exported, its file is written as its preview shows it, its natural HTML the kit's and
// every block given an id (the edit service's handIn, source/natural.mjs handedInSource; a report
// whose ids repeat stays as written, and the export then fails it, as its check says it: at the
// file's lines).
// While a preview server of this Gallery runs, the server writes it (POST /__gallery/edit/hand-in), in
// the queue its pages' commits go through, so the write never races one; with none, it is written
// here, the file read again right before it is replaced, as the server does. Either way the hand-in
// is done once the document's 批注 are checked against what it wrote, those whose words are gone
// deleted and kept for the export to say right after it (previewDeletions).

const shown = (file) => path.resolve(file); // as the system writes it: an Agent uses it as it is
// A document's metadata file beside its source (doc.json, or an old one's report.json).
const metadataName = (file) => path.basename(documentFiles(path.dirname(file)).json);
// Why a report was not handed in, as the command says it (the edit service's messages are the UI's).
const WHY = {
  busy: "it kept changing while it was being written (an Agent writing it?); nothing written. Run the export again.",
  timeout: "the workspace's Gallery server did not answer in 30s; nothing written. Run the export again.",
};

// The hand-in through the running server (`route`: another command's request of it): its answer, or
// null when no server of these reports answers (none runs, or what listens there is not it), and the
// file is to be written here.
async function throughServer(server, slug, route = "hand-in") {
  const host = `127.0.0.1:${server.port}`;
  let response;
  try {
    response = await fetch(`http://${host}${workspaceBase(reportsDirectory)}/__gallery/edit/${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: `http://${host}`, "X-Gallery-Token": server.token },
      body: JSON.stringify({ slug, workspace: reportsDirectory }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    // It took the request and did not answer: it may still write, so nothing is written here.
    if (error.name === "TimeoutError") return { ok: false, reason: "timeout" };
    return null; // nothing listens there any more
  }
  const body = await response.json().catch(() => null);
  if (typeof body?.ok !== "boolean" || ["elsewhere", "token", "host", "origin"].includes(body.reason)) return null;
  return body;
}

/**
 * Hand in the reports `slugs` (their files written as an export writes them). Says what it wrote,
 * for the export to print after its failures and notes: what naturalize made the kit's at which
 * lines (changeLines), the blocks given an id (idLines) and the title or icon written (inStepLines).
 * Returns { failures: slug -> messages (ids that repeat, a file that kept changing, a server that did not
 * answer: those reports are not exported), lines: what it says }.
 */
export async function handInReports(slugs) {
  const server = await findPreviewServer();
  let local = null;
  const failures = new Map();
  const lines = [];
  for (const slug of slugs) {
    const { html: file } = documentFiles(documentDirectory(slug, reportsDirectory));
    let result = server ? await throughServer(server, slug) : null;
    if (result === null) {
      local ??= createEditService({ reportsDirectory, stateDirectory: editStateDirectory, finish: withNeededKitTags });
      result = await local.handIn(slug);
      // Its 批注 checked against what it wrote, as the server answers a hand-in only then: those
      // whose words are gone deleted and kept for the export to say (previewDeletions).
      if (result.ok) await local.settleNotes(slug);
    }
    if (!result.ok) {
      // A report with no file: the export says so as it loads it.
      if (result.reason !== "missing") failures.set(slug, [`${shown(file)} was not handed in: ${WHY[result.reason] ?? result.message ?? result.reason}`]);
      continue;
    }
    // Which block is the copy is the author's to say: nothing renamed, the export of it fails as its
    // check would say it, at the lines of the file as it is (not of the text the check would read).
    if (result.repeated?.length) {
      failures.set(slug, repeatedIdFailures(result.repeated));
      continue;
    }
    lines.push(...inStepLines(file, result));
    if (result.written) {
      if (result.changes.length) lines.push(...changeLines(file, result.changes));
      if (result.added) lines.push(...idLines(file, result.given, result.added));
    }
  }
  return { failures, lines };
}

/**
 * Before gallery check and gallery qa say the 批注 Gallery deleted and what the preview wrote
 * (previewDeletions, previewRewrites): the workspace's running server, when one does, checks the
 * 批注 of each of `slugs` against its file as it is now, at once, and keeps what that deleted (POST
 * /__gallery/edit/settle). Its own check of them runs some 1.9 s after a write (the file quiet for
 * 1.5 s, then 300 ms), so an Agent's command right after its write was told nothing, and the next
 * command was (found testing the skill with Agents, 2026-10-29). With no server, or one that does not answer (an
 * older Gallery's), nothing: there is no check to wait for.
 */
export async function previewSettled(slugs) {
  const server = await findPreviewServer();
  if (!server) return;
  for (const slug of slugs) if ((await throughServer(server, slug, "settle")) === null) return;
}

/**
 * gallery new: the new document taken by the review of the Agent's changes as it is (the starter), on
 * disk, before any server may look at it (the edit service's noteTaken: its first recent version too),
 * so that the Agent's first write of it is taken against the starter however a server comes to take
 * that write (a server started only now, or one whose first look at the document is that write: no page
 * served before it, gallery new opening no browser but with --open, or a page opened later): the
 * starter filled, no change to review
 * (docs/editor.md "Agent's changes"), a version of the Agent's after the starter's, and its next write
 * reviewed against it. A server running takes it as the same. What was kept of a
 * document deleted before under the same slug (its review, its recent versions) is forgotten first
 * (forgetChanges), as for one the workbench makes. Silent, and never fails the command.
 */
export async function noteNew(slug) {
  try {
    const local = createEditService({ reportsDirectory, stateDirectory: editStateDirectory, finish: withNeededKitTags });
    const { html } = documentFiles(documentDirectory(slug, reportsDirectory));
    // A new document: what was kept of one deleted before under its slug (its review, its recent versions) is none of its.
    await local.forgetChanges(slug);
    await local.noteTaken(slug, await fs.readFile(html, "utf8"));
  } catch {}
}

/**
 * gallery import: what was kept of a document deleted before under `slug` (its review, its recent versions:
 * forgetChanges) forgotten as a new document is made under it, which takes over none of it. Nothing taken
 * (an import is no starter: its first look is its first version). Silent, and never fails the command.
 */
export async function forgetKept(slug) {
  try {
    await createEditService({ reportsDirectory, stateDirectory: editStateDirectory, finish: withNeededKitTags }).forgetChanges(slug);
  } catch {}
}

// How few blocks given an id the export lists one a line (a revision's few new blocks), and how few
// without one gallery check lists: more are counted alone (a first export's or a first draft's every
// block: thirty `line N → id` lines read as noise before the export's own result).
const LISTED = 10;

/**
 * The lines that say which blocks of report file `file` a hand-in gave an id (`given`: [{ id, tag,
 * line }], handedInSource's; `count`: how many, which a preview server of an older version says
 * alone): the count, then, when they are ten at most, each at its line, its start tag and its id.
 * `pending`: the blocks an export will give one ([{ line, tag }], pendingBlockIds), as
 * gallery check says them, ten at most, more counted alone.
 */
export function idLines(file, given, count = given?.length ?? 0, { pending = false } = {}) {
  const blocks = `${count} block${count === 1 ? "" : "s"}`;
  if (pending) {
    const lines = [`ids ${shown(file)}: ${blocks} without an id yet: the export gives ${count === 1 ? "it" : "each"} one`];
    return count > LISTED ? lines : [...lines, ...given.map(({ line, tag }) => `  line ${line} ${tag}`)];
  }
  const lines = [`ids ${shown(file)}: ${blocks} given an id`];
  return !given || count > LISTED ? lines : [...lines, ...given.map(({ line, tag, id }) => `  line ${line} ${tag} → ${id}`)];
}

/**
 * What a hand-in wrote of the report's name and icon (natural.mjs inStep): <title> and report.json's
 * title as its h1 says it, report.json's icon as its header has it; and that report.json's icon was
 * left as it is when the page shows none. `pending`: what an export will write (gallery check, which
 * writes nothing).
 */
export function inStepLines(file, { title = null, icon = null } = {}, { pending = false } = {}) {
  const where = shown(path.dirname(file));
  const json = metadataName(file);
  const said = (what, as, value) => (pending ? `${what} not ${as} yet (${value}): the export writes ${what.includes(" and ") ? "them" : "it"}` : `${what} written ${as}: ${value}`);
  const lines = [];
  // What gallery check adds when it is doc.json that differs from the page: the page is the title (an
  // export writes the page's over doc.json's), and gallery set changes both.
  const slug = path.basename(path.dirname(file));
  const rename = (field) => (pending ? `; the page holds the ${field} and ${json} follows it: change it with gallery set ${slug} --${field} … (it writes both), for what is put in ${json} alone is written over by the export` : "");
  if (title) {
    const differs = typeof title.from === "string" && title.from !== title.to;
    const written = [...(title.page ? ["<title>"] : []), ...(differs ? [`${json}'s title`] : [])];
    if (written.length) lines.push(`title ${where}: ${said(written.join(" and "), "as its h1 says it", JSON.stringify(title.to))}${differs ? rename("title") : ""}`);
  }
  if (icon?.missing) lines.push(`icon ${where}: ${json} has the icon ${JSON.stringify(icon.from)} and the page's header none: write it there (<div class="doc-icon">…</div> before the h1) or take "icon" out of ${json} (the export leaves ${json}'s as it is)`);
  else if (icon) lines.push(`icon ${where}: ${said(`${json}'s icon`, "as its header has it", icon.to === null ? "none" : JSON.stringify(icon.to))}${typeof icon.to === "string" && icon.from !== icon.to ? rename("icon") : ""}`);
  return lines;
}
