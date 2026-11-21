import { listPreferenceDocuments, changePreferenceDocuments, preferenceFile, LEGACY_PREFERENCE } from '../shared/preference-documents.mjs';
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { exportBaselines } from "../cli/qa-baseline.mjs";
import { withNeededKitTags } from "../render/assets.mjs";
import { drawPageChips } from "../render/page-chips.mjs";
import { rewritePageLinks } from "../render/page-link-rewrite.mjs";
import { repeatedIdFailures } from "../render/pipeline.mjs";
import { starterPage } from "../render/reports.mjs";
import { writeAtomic } from "../shared/files.mjs";
import { IMPORTED_FROM, fileWords, pageLangOf } from "../shared/file-language.mjs";
import { sendJson } from "../shared/http.mjs";
import { said, saying } from "../shared/i18n/index.mjs";
import { IMPORT_LIMIT } from "../shared/import-types.mjs";
import { mediaUrl } from "../shared/media.mjs";
import { fullAddress } from "../shared/page-address.mjs";
import { documentLinks, slugPattern } from "../shared/reports.mjs";
import { documentDirectory, documentFiles, newDocSlug, pageSlug } from "../shared/workspace.mjs";
import { saysAnything, unshownLines } from "../shared/writing-preferences.mjs";
import { exportPage, exportSite, titleReader, validOptions } from "./export.mjs";
import { runJob } from "./jobs.mjs";
import { writeImportedPages } from "./pages.mjs";

// The workbench's 导入 and 导出 (docs/workbench.md, "Import and export"), at /__gallery/transfer/<name> of
// Gallery's server. Every request is checked as a save is (src/editor/service.mjs check: the exact
// Host and Origin, the token); answers are { ok, … } or { ok: false, reason, message } (a message
// with parts filled in carries its text and values too: shared/i18n said()), but for an export's file.
//   POST export { slug, options }  the page's export (export.mjs; options as validOptions says): the
//                                  file itself, its name in X-File-Name (percent-encoded); each page's
//                                  natural HTML made the kit's in its file first, as the preview does;
//                                  422 when a page fails what makes its components valid or what an
//                                  export needs (render/pipeline.mjs componentFailures, exportFailures)
//   POST markdown { slug }         the page as Markdown (复制页面内容): { text }, its pictures and files
//                                  linked where this server serves them
//   POST preferences { opening? }  写作偏好: a file of <workspace>/preferences/ and the page with
//                                  "instructions": true (.gallery/pages/<slug>/). With `opening` (the dialog opening: shown
//                                  at once, it loads the page once answered): the page made again
//                                  of the file (made from Gallery's default when there is none),
//                                  the file left as it is, unless neither changed since the two
//                                  were last made the same (then answered at once, from what was
//                                  kept), or they say the same and the page was not edited since.
//                                  Without (the dialog's 保存): the page written as the file.
//                                  { path, remade, unshown: the file's lines the page does not show }
//   POST upload?name=<name>        a file to import, its bytes as the body (application/octet-stream,
//                                  5 GB at most): kept in a folder of this server's own in the system's
//                                  temporary one until imported (or an hour); answers { id }. The
//                                  folder goes with what is left in it when the server stops (close())
//   POST import { uploads, parent }  the files uploaded (their ids) made pages (import.mjs, in the
//                                  worker), each a new report, under report `parent` ("" the top) in
//                                  the outline with the tree they came in: { pages (how many),
//                                  reports (the top ones' slugs), skipped (names not taken), missing
//                                  (the addresses of pictures the pages link to that were not found),
//                                  inert (how much that would run it took out of pages of another's) }
// The reports are written in the queue saves are (edits.respond), once converted; converting does
// not hold saves up.

const HOUR = 60 * 60 * 1000;
// The uploads' folders of this process's servers: each removed by its service's close(), and those
// left when the process ends however it ends (an exit with no stop) removed then.
const uploadFolders = new Set();
let exitHook = false;
const keepUploadFolder = (folder) => {
  uploadFolders.add(folder);
  if (exitHook) return;
  exitHook = true;
  process.once("exit", () => {
    for (const each of uploadFolders) {
      try {
        fs.rmSync(each, { recursive: true, force: true });
      } catch {}
    }
  });
};
const idPattern = /^u-[a-f0-9]{16}$/;

/**
 * edits: the edit service (its token, checks, queue and naturalize). workspace: the workspace service
 * (outline, place). reports.create(slug, title, description): a new report from the starter (blank).
 * offline(): what makes saved reports offline files, and its check(slug) (render/pipeline.mjs
 * offlineReports; a report that fails what makes its components valid or what an export needs throws,
 * `reason` "check", with its `slug` and `failures`).
 */
export function createTransferService({ edits, workspace, reports, reportsDirectory, offline }) {
  // The uploads' folder: one of this server's own (a fixed name in a /tmp shared by the users of a
  // machine would be the first user's), made with the first upload.
  let uploadsFolder = null;
  const uploadsDirectory = () => (uploadsFolder ??= fs.promises.mkdtemp(path.join(os.tmpdir(), "gallery-uploads-")).then((folder) => {
    keepUploadFolder(folder);
    return folder;
  }));
  const uploads = new Map(); // id -> { file, name, at }
  const failure = (status, reason, message) => [status, { ok: false, reason, ...saying(message) }];
  const exists = (target) => fs.promises.access(target).then(() => true, () => false);
  // A document's folder and its files (doc.html and doc.json, or an old one's report.html and report.json).
  const folderOf = (slug) => documentDirectory(slug, reportsDirectory);
  const filesOf = (slug) => documentFiles(folderOf(slug));
  const titleOf = titleReader(reportsDirectory);

  // A request from a page of this server whose body is a file: the checks of edits.check but its JSON.
  function checkUpload(request) {
    if (request.method !== "POST") return [405, { ok: false, reason: "method" }];
    const host = request.headers.host ?? "";
    const port = request.socket.localPort;
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return [403, { ok: false, reason: "host" }];
    if (request.headers.origin !== `http://${host}`) return [403, { ok: false, reason: "origin" }];
    if (request.headers["x-gallery-token"] !== edits.token) return [403, { ok: false, reason: "token" }];
    if (!/^application\/octet-stream\b/i.test(request.headers["content-type"] ?? "")) return [415, { ok: false, reason: "type" }];
    if (Number(request.headers["content-length"] ?? 0) > IMPORT_LIMIT) return failure(413, "size", "文件太大（最多 5GB）");
    return null;
  }

  // Uploads not imported within the hour, gone.
  async function sweep() {
    for (const [id, upload] of uploads) {
      if (Date.now() - upload.at < HOUR) continue;
      uploads.delete(id);
      await fs.promises.rm(upload.file, { force: true }).catch(() => {});
    }
  }

  async function upload(request, response) {
    const refused = checkUpload(request);
    if (refused) {
      request.resume();
      return sendJson(response, ...refused);
    }
    const name = new URL(request.url, "http://localhost").searchParams.get("name")?.replace(/[\u0000-\u001f]/g, "").trim() ?? "";
    if (!name || name.length > 255) {
      request.resume();
      return sendJson(response, ...failure(400, "name", "文件名不对"));
    }
    await sweep();
    const id = `u-${randomBytes(8).toString("hex")}`;
    const file = path.join(await uploadsDirectory(), id);
    let size = 0;
    const limit = new Transform({
      transform(chunk, _encoding, done) {
        size += chunk.length;
        done(size > IMPORT_LIMIT ? Object.assign(new Error("too-large"), { reason: "size" }) : null, chunk);
      },
    });
    try {
      await pipeline(request, limit, fs.createWriteStream(file));
    } catch (error) {
      await fs.promises.rm(file, { force: true }).catch(() => {});
      if (error.reason === "size") return sendJson(response, ...failure(413, "size", "文件太大（最多 5GB）"));
      return sendJson(response, ...failure(400, "body", "文件没有传完"));
    }
    uploads.set(id, { file, name, at: Date.now() });
    return sendJson(response, 200, { ok: true, id });
  }

  async function exportFile(request, response) {
    const checked = await edits.check(request);
    if (checked.error) return sendJson(response, ...checked.error);
    const { slug, options } = checked.body ?? {};
    if (typeof slug !== "string" || !slugPattern.test(slug) || !(await exists(filesOf(slug).html))) return sendJson(response, ...failure(404, "missing", "找不到这份文档"));
    if (!validOptions(options)) return sendJson(response, ...failure(400, "options", "导出选项不对"));
    try {
      const render = await offline();
      // Each page handed in first, as gallery export does: its file written as its preview has it, what
      // the Agent wrote as any page would made the kit's and every block given an id (edits.handIn, in
      // the queue saves go through), so a page nobody has opened is
      // checked and made as the kit's too. Once a page, before it is checked or made. A page it leaves
      // as it is fails the export as gallery export fails it: its ids repeat (as the check says it, at
      // the file's lines), or its file kept changing while it was written, or an Agent has it half
      // written (the reader's hand-in: what it writes of the Agent's natural HTML is kept for the Agent).
      const handed = new Map(); // slug -> its hand-in, under way or done
      const handedIn = (page) => {
        if (!handed.has(page)) {
          handed.set(page, edits.handIn(page, { reader: true }).then((result) => {
            if (!result.ok) throw Object.assign(new Error(result.message ?? result.reason), { reason: result.reason });
            if (result.repeated.length) throw Object.assign(new Error("check"), { reason: "check", slug: page, failures: repeatedIdFailures(result.repeated) });
          }));
        }
        return handed.get(page);
      };
      // An HTML or PDF file is an export of the report as gallery export makes one: each page's
      // offline file says the sha256 of the report.html it was made from, kept here for gallery qa's
      // baseline (below). Not a Markdown file's chart pictures, which are no export of the page.
      // (export.mjs exportSite: gallery export's formats make the same site.)
      const made = new Map(); // slug -> that sha256
      const site = exportSite({ reportsDirectory, titleOf, outline: () => workspace.outline(), render, format: options.format, ready: handedIn, made });
      const { name, type, data } = await exportPage(slug, options, site);
      // gallery qa's baseline, by gallery export's rule (src/cli/qa-baseline.mjs exportBaselines): a
      // page with none gets one of the text its export before was made from, and the text this one
      // was made from is kept for the next look (qa/<slug>/exported.html). This export writes no
      // exports/<slug>.html (its file is downloaded), so the rule reads it after the file is made
      // (nothing of it changed) and is given the sha256 each page was made from instead of reading
      // it there. Silent, and never fails the export; done before the file is sent, so the next
      // gallery qa finds it.
      if (made.size) await (await exportBaselines([...made.keys()], reportsDirectory)).keep([...made.keys()], made);
      response.writeHead(200, {
        "Content-Type": type,
        "Content-Length": data.length,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
        "X-File-Name": encodeURIComponent(name),
        "Cache-Control": "no-store",
      });
      response.end(data);
    } catch (error) {
      // A page that fails what an export needs: no file, and the first of its failures said (all of them: gallery check).
      if (error.reason === "check") {
        // Said by the UI in its language (said()): the page's title, its first failure (the check's line, as it is), how many;
        // or, when that is a component package's, which one, in a reader's words: its line is for who writes the package.
        const title = await titleOf(error.slug);
        const message = error.component
          ? said("「{0}」里的组件 {1} 有错误，没有生成文件：可以让 Agent 检查这份文档并修好", title, error.component)
          : error.failures.length > 1
            ? said("「{0}」没有通过导出前的检查，没有生成文件：{1}（共 {2} 处：可以让 Agent 检查这份文档，列出全部并修好）", title, error.failures[0], error.failures.length)
            : said("「{0}」没有通过导出前的检查，没有生成文件：{1}", title, error.failures[0]);
        return sendJson(response, ...failure(422, "check", message));
      }
      sendJson(response, ...failure(error.reason === "browser" ? 422 : error.reason === "busy" ? 409 : error.reason === "missing" ? 404 : 500, error.reason ?? "export", error));
    }
  }

  // A page as Markdown (复制页面内容): its saved source as its preview shows it (edits.readTaken: what
  // the Agent wrote as any page would the kit's, in memory; while an Agent has it half written, what
  // the page shows, at once) and as the export writes it (no chart pictures: a chart card is its
  // tables), its pictures and files linked where this server serves them, its page blocks by the
  // title they show, and its links to documents and to its own blocks by the address that opens them
  // from another program.
  async function pageMarkdown(request, response) {
    const checked = await edits.check(request);
    if (checked.error) return sendJson(response, ...checked.error);
    const { slug } = checked.body ?? {};
    const source = (await edits.readTaken(slug, { wait: 0 }))?.text ?? null;
    if (source === null) return sendJson(response, ...failure(404, "missing", "找不到这份文档"));
    const origin = `http://${request.headers.host}`;
    const { named } = await documentLinks(reportsDirectory);
    const whole = rewritePageLinks(drawPageChips(source, { slug, mode: "words", reportsDirectory }), slug, (place) => place.slug && fullAddress(origin, place, named), named);
    const { text, files } = await runJob("markdown", { source: whole, title: await titleOf(slug), pictures: false });
    const linked = text.replace(/\u0000F(\d+)\u0000/g, (_, index) => {
      const { src, kind } = files[Number(index)];
      return encodeURI(`${origin}${mediaUrl(kind === "image" ? "asset" : "file", slug, src)}`);
    });
    return sendJson(response, 200, { ok: true, text: linked });
  }

  // 写作偏好 (the workbench's 设置): the page that holds them ("instructions": true, in .gallery/pages/)
  // and its preferences/<name>.md file, discovered by gallery preferences list, kept the same.
  // The file uses the page's title; pictures and files use paths relative to the Markdown file. A page
  // with nothing written under its title is the heading alone (the file stays, so that the default
  // never comes back over the user's choice): no letter or number, no picture or file, only blocks
  // left empty, whose marks the Markdown still writes (a list item's "- " or "1. ", a done to-do's
  // "[x]", a divider, a highlight's <aside> and emoji, a code block's fences and language, a table's
  // lines). With the page's `version` (edits.read's, of its text), which every save of it changes.
  // The page's text and version are read at once (takenOf); its Markdown is the conversion worker's
  // (jobs.mjs), which takes seconds when it has to start (it stops after a minute idle): `taken`, the
  // page as just read, is not read again.
  const takenOf = async (slug) => {
    const taken = await edits.readTaken(slug, { wait: 0 }); // as its preview shows it (edits.readTaken), as 复制页面内容 reads a page
    return { source: taken?.text ?? "", version: taken?.version ?? null };
  };
  const preferencesOf = async (slug, taken = null) => {
    const { source, version } = taken ?? (await takenOf(slug));
    const meta = await metadataOf(slug);
    const title = meta?.preference ? meta.title || "写作偏好" : "写作偏好";
    const { text, files } = await runJob("markdown", { source, title, pictures: false });
    const written = text.split("\n").slice(1).join("\n").replace(/^[\s>]*(?:```.*|\d+\.|- \[x\])/gm, "").replace(/<\/?aside>/g, "");
    if (!/[\p{L}\p{N}]|\u0000F\d+\u0000/u.test(written)) return { markdown: `# ${title}\n`, empty: true, version };
    const folder = path.relative(path.join(reportsDirectory, 'preferences'), folderOf(slug)).split(path.sep).join("/");
    return { markdown: `${text.replace(/\u0000F(\d+)\u0000/g, (_, index) => encodeURI(`${folder}/${files[Number(index)].src}`))}\n`, empty: false, version };
  };
  const metadataFileOf = (slug) => filesOf(slug).json;
  const metadataOf = async (slug) => {
    try {
      const metadata = JSON.parse(await fs.promises.readFile(metadataFileOf(slug), "utf8"));
      return metadata && typeof metadata === "object" ? metadata : null;
    } catch {
      return null;
    }
  };
  // The last time page and file were made the same (the page saved as the file, made again of it, or
  // found saying the same): the file's digest and the page's version then, and the file's lines the
  // page did not show then (unshownLines of the two), in the page's doc.json ("madeSame": { file,
  // page, unshown }). A page of another version was edited since and not saved (words, a color: what
  // its Markdown carries or not); a file of another digest was written since by someone else; neither
  // changed, those lines are still the ones, and opening the dialog reads nothing more (the page is
  // not made Markdown: no conversion worker to wait for). The "synced" kept before 保存 (the
  // Markdown's digests, for the save on close) goes as this is written; a "madeSame" of before
  // `unshown` is read as one, and has them the next time it is written.
  const digest = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);
  async function keepMadeSame(slug, file, page, unshown) {
    const metadata = await metadataOf(slug);
    if (!metadata || page === null) return;
    const { synced, ...rest } = metadata;
    const madeSame = { file: digest(file), page, unshown };
    const last = metadata.madeSame;
    if (synced === undefined && last?.file === madeSame.file && last?.page === madeSame.page && JSON.stringify(last?.unshown) === JSON.stringify(unshown)) return;
    await writeAtomic(metadataFileOf(slug), `${JSON.stringify({ ...rest, madeSame }, null, 2)}\n`);
  }
  // The page made again of the file: the starter's blank page under the page's own title and icon,
  // the file's blocks in it as the import makes them, its pictures and files copied into the page's
  // folder; the page as it was kept among its recent versions first (edits.keepVersion).
  async function remakePage(slug, file) {
    const scratch = await fs.promises.mkdtemp(path.join(os.tmpdir(), "gallery-preferences-"));
    try {
      const converted = await runJob("import", { uploads: [{ file, name: "preferences.md" }], scratch });
      const page = converted.pages[0] ?? { nodes: [], raws: [], files: [], icon: null, lang: null };
      const directory = folderOf(slug);
      const metadata = (await metadataOf(slug)) ?? {};
      const target = documentFiles(directory).html;
      // The page keeps its own lang (an English one made in an English UI: workbench/service.mjs).
      const before = await fs.promises.readFile(target, "utf8").catch(() => "");
      const lang = /<html\b[^>]*\slang="([^"]*)"/i.exec(before)?.[1] ?? null;
      const { html } = await starterPage(slug, metadata.title || "写作偏好", metadata.description || "", { blank: true, lang });
      const icon = typeof metadata.icon === "string" && metadata.icon ? metadata.icon : null;
      const filled = await runJob("fill", { source: html, nodes: page.nodes, icon, raws: page.raws, lang: page.lang });
      if (page.files.length) await fs.promises.mkdir(path.join(directory, "assets"), { recursive: true });
      for (const { from, name } of page.files) {
        const to = path.join(directory, "assets", name);
        if (!(await exists(to))) await fs.promises.copyFile(from, to);
      }
      const current = await fs.promises.readFile(target, "utf8").catch(() => null);
      if (current !== null) edits.keepVersion?.(slug, current);
      await writeAtomic(target, withNeededKitTags(filled));
    } finally {
      await fs.promises.rm(scratch, { recursive: true, force: true }).catch(() => {});
    }
  }
  // The file is what counts, and only the user's 保存 writes it (the dialog's; the request without
  // `opening`): the page written as the file (two that say the same: the file left as it is).
  // Nothing is written as the dialog closes, the workbench reloads or its tab closes: what was typed
  // and not saved is gone, for as the dialog opens (`opening`) the page is made again of the file, in
  // the queue saves go through (`remade`), and the file is left as written; unless the page is as it
  // was the last time the two were made the same (madeSame) and so is the file, or the page is and
  // the two say the same (the page as Markdown the file; the page with nothing under its title, a
  // file saying nothing; with none kept yet, saying the same is enough). So a page saved shows again
  // as it was saved, with what its Markdown does not carry; one made of the file (Gallery's
  // default, a file with lines the page cannot show, which never say the same as their page) is made
  // once, not at every opening; and a page edited since and not saved is made again of the file even
  // when the two say the same (a color, which the Markdown does not carry). All of it read and done in
  // the queue: no save of the page comes between. The answer names the file's lines the page does not
  // show (`unshown`: a comment, a link to a file of this computer), which saving takes out.
  // The dialog shows as it is clicked and waits for this answer only to load the page, so opening does
  // no more than it must (measured 2026-10-26 on the user's 18 KB page: the page as Markdown is the
  // conversion worker's, 150-200 ms warm and 0.8-3.9 s with the machine's load when the worker has to
  // start, which it has after a minute idle, so nearly every opening; making the page again of the
  // file 400-500 ms more): two still
  // as they were last made the same are answered from what was kept then (madeSame: the page's version
  // and the file's digest read at once, its unshown lines), the worker not asked; a page edited since
  // is made again without being made Markdown first (it is made again whatever the two say); only a
  // file written since with the page as it was, or none kept yet, needs the page's Markdown, to know
  // whether the two say the same.
  async function writingPreferences(request, response) {
    const checked = await edits.check(request);
    if (checked.error) return sendJson(response, ...checked.error);
    const opening = checked.body?.opening === true;
    const items = await listPreferenceDocuments();
    const id = checked.body?.preference ?? items[0]?.id;
    const slug = checked.body?.slug ?? await pageSlug(reportsDirectory, id);
    if (!slug) return sendJson(response, ...failure(404, "missing", "还没有写作偏好"));
    let file = null;
    // `path`: the file, as the system writes its path.
    let currentId = id;
    const answer = (remade, unshown) => [200, { ok: true, path: path.resolve(file), remade, unshown, ...(checked.body?.slug ? { preference: currentId } : {}) }];
    return edits.respond(async () => {
      let kept;
      const metadata = typeof slug === 'string' && slugPattern.test(slug) ? await metadataOf(slug) : null;
      if (!metadata?.instructions || metadata.preference === null) return failure(404, 'missing', '找不到写作偏好');
      currentId = metadata.preference ?? LEGACY_PREFERENCE; // a page made before preference files: the migrated preferences.md
      file = await preferenceFile(currentId);
      kept = await fs.promises.readFile(file, "utf8"); // made from Gallery's default when there is none
      const taken = await takenOf(slug);
      const last = (await metadataOf(slug))?.madeSame ?? null;
      const untouched = last === null || last.page === taken.version; // the page not edited since
      const agreed = last !== null && untouched && last.file === digest(kept); // and the file not written since
      if (opening && agreed && Array.isArray(last.unshown)) return answer(false, last.unshown);
      let [fileText, pageText, version, remade] = [kept, "", taken.version, false];
      if (opening && !untouched) {
        await remakePage(slug, file);
        ({ markdown: pageText, version } = await preferencesOf(slug));
        remade = true;
      } else {
        const page = await preferencesOf(slug, taken);
        const same = kept.trim() === page.markdown.trim() || (page.empty && !saysAnything(kept));
        pageText = page.markdown;
        if (!opening) {
          if (last && last.file !== digest(kept) && !same) return failure(409, "stale", "偏好文件已被修改，请重新打开后再试");
          const name = (await metadataOf(slug))?.title;
          if (name && name !== path.basename(currentId, '.md')) {
            const item = (await listPreferenceDocuments()).find(item => item.id === currentId);
            const result = await changePreferenceDocuments({ action: 'rename', id: currentId, name, revision: item?.revision });
            currentId = result.selected;
            file = await preferenceFile(result.selected);
          }
          if (!same) {
            await writeAtomic(file, page.markdown);
            fileText = page.markdown;
          }
        } else if (!same && !agreed) {
          await remakePage(slug, file);
          ({ markdown: pageText, version } = await preferencesOf(slug));
          remade = true;
        }
      }
      const unshown = unshownLines(fileText, pageText);
      await keepMadeSame(slug, fileText, version, unshown);
      return answer(remade, unshown);
    })(request, response);
  }

  async function importFiles(request, response) {
    const checked = await edits.check(request);
    if (checked.error) return sendJson(response, ...checked.error);
    const { uploads: ids, parent = "", from, language } = checked.body ?? {};
    // The pages' description and lang in the UI's language (`from`: "导入自 {0}" as the workbench says it; else the file language's).
    const words = { said: typeof from === "string" && from.includes("{0}") && from.length <= 60 ? from : fileWords(IMPORTED_FROM, language === "zh" || language === "en" ? language : undefined), lang: pageLangOf(language) };
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 1000 || !ids.every((id) => typeof id === "string" && idPattern.test(id))) return sendJson(response, ...failure(400, "body"));
    const chosen = ids.map((id) => uploads.get(id)).filter(Boolean);
    if (chosen.length !== ids.length) return sendJson(response, ...failure(410, "gone", "上传的文件已过期，请重新导入"));
    for (const id of ids) uploads.delete(id);
    const under = typeof parent === "string" && slugPattern.test(parent) && (await exists(path.join(reportsDirectory, parent))) ? parent : "";
    const scratch = await fs.promises.mkdtemp(path.join(os.tmpdir(), "gallery-import-"));
    const clean = () => Promise.all([fs.promises.rm(scratch, { recursive: true, force: true }), ...chosen.map(({ file }) => fs.promises.rm(file, { force: true }))]).catch(() => {});
    let converted;
    try {
      converted = await runJob("import", { uploads: chosen.map(({ file, name }) => ({ file, name })), scratch });
    } catch (error) {
      await clean();
      return sendJson(response, ...failure(500, "convert", error));
    }
    // Written in the queue saves go through (the outline with them).
    return edits.respond(async () => {
      try {
        // Each page a new document (./pages.mjs), its folder doc-<its page id> as a new document's is, filled in the worker.
        const { made, top } = await writeImportedPages(converted.pages, {
          create: reports.create, slugOf: () => newDocSlug(reportsDirectory), folderOf, fill: (payload) => runJob("fill", payload), place: workspace.place, under, ...words,
        });
        return [200, { ok: true, pages: made.length, reports: top, skipped: converted.skipped, missing: missingPictures(converted.pages), inert: inertPlaces(converted.pages) }];
      } finally {
        await clean();
      }
    })(request, response);
  }

  // The pictures the pages link to that the import did not find (a Markdown file chosen without its
  // pictures): their addresses as written, each once.
  const missingPictures = (pages) => [...new Set(pages.flatMap(function missed(page) {
    return [...(page.notes ?? []).filter((note) => note.kind === "picture-missing").map((note) => note.name), ...page.children.flatMap(missed)];
  }))];

  // How much of what would run an import took out of the pages no one this computer trusts wrote (import.mjs: any page of
  // Gallery's but an export this computer made, a Markdown file's HTML blocks), all told, for the toast to say.
  const inertPlaces = (pages) => pages.reduce(function sum(total, page) {
    return page.children.reduce(sum, total + (page.trusted ? 0 : Math.max(page.inert ?? 0, 0)));
  }, 0);

  const ROUTES = { export: exportFile, markdown: pageMarkdown, upload, import: importFiles, preferences: writingPreferences };

  /** Answer /__gallery/transfer/<name>. */
  function handle(request, response, name) {
    if (!Object.hasOwn(ROUTES, name)) return sendJson(response, 404, { ok: false, reason: "unknown" });
    return ROUTES[name](request, response).catch((error) => {
      if (!response.headersSent) sendJson(response, ...failure(500, "transfer", error));
    });
  }

  /** The uploads' folder removed with what is left in it (the server stopping): made again by the next upload. */
  async function close() {
    const made = uploadsFolder;
    uploadsFolder = null;
    uploads.clear();
    const folder = await made?.catch(() => null);
    if (!folder) return;
    uploadFolders.delete(folder);
    await fs.promises.rm(folder, { recursive: true, force: true }).catch(() => {});
  }

  return { handle, close };
}
