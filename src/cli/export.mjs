import { buildReports, exportReports, failureSummary, handInBlockers, offlineReports, printFailures, reportNotes } from "../render/pipeline.mjs";
import { writeAtomic } from "../shared/files.mjs";
import { UsageError, documentArguments } from "./arguments.mjs";
import { noDocuments } from "./check.mjs";
import { deliverableLine, deliverablePath } from "./deliverable.mjs";
import { handInReports, previewSettled } from "./hand-in.mjs";
import { editingNotes, naturalInMemory, previewDeletions, previewRewrites } from "./natural.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { shownSource } from "../editor/source.mjs";
import { readOutline } from "../shared/outline.mjs";
import { imageSources } from "../shared/export-wrap.mjs";
import { exportsDirectory, reportsDirectory } from "../shared/paths.mjs";
import { documentDirectory, documentFiles, layoutOf } from "../shared/workspace.mjs";
import { PAPERS, closeSharedBrowser, encodePictures, pictureCopies } from "../transfer/browser.mjs";
import { carriedExport } from "../transfer/carry.mjs";
import { FORMATS, exportPage, exportSite, subpagesOf, titleReader, validOptions } from "../transfer/export.mjs";
import { readZip } from "../transfer/zip.mjs";
import { createActivity } from "../workbench/activity.mjs";
import { createIndex } from "../workbench/index.mjs";
import { exportBaselines } from "./qa-baseline.mjs";

// What an export of a document whose blocks read the workspace embeds of it: the
// workspace's facts as a server reads them (src/workbench/index.mjs snapshot), each document as its pages see it
// (shownSource: an Agent's natural HTML the kit's), the record of edits read, nothing written.
function workspaceSnapshots(root = reportsDirectory) {
  const read = async (slug) => {
    const source = await fs.readFile(documentFiles(documentDirectory(slug, root)).html, "utf8").catch(() => null);
    return source === null ? null : { source, text: shownSource(source).text };
  };
  const index = createIndex({ root, read, activity: createActivity({ file: layoutOf(root).activity }) });
  return (slug) => index.snapshot(slug);
}

// gallery export <slug>... | --all (./usage.mjs): hands each named document in: its doc.html
// (report.html in an older document) written as its preview shows it, natural HTML as the kit's
// markup and every block given an id (through the shared service’s owner-specific queue while it runs); then
// checks, builds and writes, under <workspace>/exports/, one standalone offline file per passing
// document. A document the quick checks fail is not handed in: its file stays as it is. It says
// first, once, what the preview wrote as the kit's markup when the reader edited a document and the
// 批注 it deleted because their words are gone; then the failures ("FAIL <slug>: N problems"), the
// exports made ("Exported <absolute path> (…)"), the notes to act on first ("fix": a path of this
// machine, a heavy picture) and the others ("note"), what the hand-in wrote by line (the blocks given
// an id counted, each listed with its line, its start tag and its id when they are ten at most; the
// title or icon it wrote), and last, for each document exported, its deliverable on a line of its
// own: "离线文件（用户要文件时再给）：" and the absolute path of its export. Exits 1 when a document fails,
// unless --allow-failures. The offline file's pictures are copies as light as the page needs, drawn by the user's
// Chrome or Edge (src/shared/export-pictures.mjs; render/export-pictures.mjs smallerPictures, given encodePictures),
// what it did said under its "Exported" line (picturesLine); --original-images embeds them as they are, and is for
// the offline HTML file alone (a PDF and a Markdown export hold the pictures as they are).
//
// --format pdf|markdown|html (and --paper, --scale, --no-files, --subpages, --folders, --out): the
// workbench's 导出 dialog, by the same function (src/transfer/export.mjs exportPage, with the site the
// dialog's route makes: exportSite), the options as the dialog's (the paper and the scale a PDF's; 所有内容 or
// 文件和图片除外; 包含子页面 and 为子页面创建文件夹, which the dialog starts off on Windows and on elsewhere:
// here both start off, the pages flat). The documents go through the same hand-in, checks and notes as the
// offline file's (the documents under it too, with --subpages), but as the dialog does, a document the checks
// fail is exported all the same: its failures said as 问题： lines, not as a failed export (an acceptance check of
// 2026-11-11 exports a document just made, its starter text still there). One file (a page without subpages, as Markdown without
// pictures or files) is written as it is, named by the document's slug, <workspace>/exports/<slug>.md,
// .pdf or .html; more (subpages, the pictures and files a Markdown page links, a chart's picture) go in a
// zip, as the dialog downloads it, <slug>.zip, its pages named by their titles as the dialog names them.
// --out <folder> writes in that folder (made when it is not there) instead of exports/. Without --format
// the offline file as before, whatever else is given but --paper and --scale (--format html is the offline
// file too, unless the options change it: --no-files, --subpages, --out); an html file that leaves the
// files out is exports/<slug>-no-files.html, never the offline file of the same name (which gallery qa and
// the hand-in read). The deliverable line names what it is: 交给用户（PDF）：, （Markdown）：, （… 压缩包）：.
//
// For a file another platform publishes (a program such as an extension's backend runs the command, puts the
// file's pictures on the platform and their web addresses in it, and publishes it), two options of the offline
// HTML file, the command's alone (the workbench's 导出 and the reader's 导出当前视图副本 have neither):
// --allow-images <sources> lets its pictures load from those https sources as well (src/shared/export-wrap.mjs
// imageSources reads them strictly: https:, or an origin with a "*." host at most; commas between them, the
// option given again adds more), which its policy blocks otherwise, so that no program rewrites the policy's
// meta, whose words are no interface; --embeds-as-links writes each embed block as a link to its page
// (render/embeds.mjs embedsAsLinks), for a platform that strips frames. Either implies --format html, and goes
// with no other format. Unlike the dialog's, such a file is held to the checks as the offline file is (a program
// publishes it unread): a document the checks fail, or one under it with --subpages, is a failure, its file not
// written, exit 1 unless --allow-failures. In exports/ such a file is <slug>-web.html (<slug>-no-files-web.html
// with --no-files; its zip with --subpages <slug>-web.zip), never the name of one that reaches nothing:
// exports/<slug>.html reaches nothing whatever made it (but an embed's page). An "Exported" line of a file whose
// pictures may load from the network says so, and from which sources, under it.

// What an export did with its pictures, under its "Exported" line (src/render/export-pictures.mjs smallerPictures):
// those made lighter, their bytes before and after, and those the browser could not read (each as it is, the
// others made lighter all the same); or that no browser was there to, and they are as they are. Nothing for a file
// with no picture to try, or none a copy made lighter and none unread.
const MB = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
function picturesLine(pictures) {
  if (!pictures?.tried) return;
  const width = Number.isFinite(pictures.ceiling) ? `at most ${pictures.ceiling}px wide, ` : "";
  if (pictures.failed) {
    console.log(`  pictures: ${pictures.tried} embedded as they are (${MB(pictures.before || 0)}): ${pictures.reason === "browser" ? "no Chrome or Edge on this machine to make them lighter" : `they could not be made lighter (${pictures.failed})`}`);
    return;
  }
  const one = pictures.unread === 1;
  const unread = pictures.unread ? `${pictures.unread} embedded as ${one ? "it is" : "they are"}: the browser could not read ${one ? "it" : "them"} (${String(pictures.why).split("\n")[0]})` : "";
  if (pictures.made > 0) console.log(`  pictures: ${pictures.made} of ${pictures.tried} made lighter for the page (${width}as WebP), ${MB(pictures.before)} → ${MB(pictures.after)}${unread ? `; ${unread}` : ""}; --original-images keeps them as they are`);
  else if (unread) console.log(`  pictures: ${unread}`);
}

// One folder however it is written (a drive letter's case, a trailing separator): Windows and macOS ignore case.
const sameFolder = (a, b) => { const [x, y] = [path.resolve(a), path.resolve(b)]; return process.platform === "linux" ? x === y : x.toLowerCase() === y.toLowerCase(); };

const EXTENSION = FORMATS;
const LABEL = { pdf: "PDF", markdown: "Markdown", html: "离线文件" };
// The options of a file for another platform (above).
const PLATFORM = ["--allow-images", "--embeds-as-links"];
const IMPLY_HTML = ["--no-files", "--subpages", "--folders", "--out", ...PLATFORM];

// The request the options make, or null for the offline file as before.
function requestOf(options, values) {
  const format = values.get("--format") ?? ([...options, ...values.keys()].some((name) => IMPLY_HTML.includes(name)) ? "html" : null);
  if (format !== null && !Object.hasOwn(FORMATS, format)) throw new UsageError(`--format takes pdf, markdown or html, not ${format}.`);
  const platform = PLATFORM.filter((name) => options.has(name) || values.has(name));
  if (platform.length > 0 && format !== "html") throw new UsageError(`${platform.join(" and ")} ${platform.length > 1 ? "are" : "is"} for the offline HTML file (--format html), not --format ${format}.`);
  let images = [];
  try {
    images = imageSources(values.get("--allow-images") ?? []);
  } catch (error) {
    throw new UsageError(`--allow-images: ${error.message}.`);
  }
  if ((values.has("--paper") || values.has("--scale")) && format !== "pdf") throw new UsageError("--paper and --scale are for --format pdf.");
  if (options.has("--original-images") && format !== null && format !== "html") throw new UsageError(`--original-images is for the offline HTML file: a ${format === "pdf" ? "PDF" : "Markdown export"} holds the pictures as they are.`);
  if (options.has("--folders") && !options.has("--subpages")) throw new UsageError("--folders makes a folder for each page's subpages: it goes with --subpages.");
  if (format === null) return null;
  let paper = "A4";
  if (values.has("--paper")) {
    paper = PAPERS.find((each) => each.toLowerCase() === values.get("--paper").toLowerCase());
    if (!paper) throw new UsageError(`--paper takes ${PAPERS.join(", ")}, not ${values.get("--paper")}.`);
  }
  let scale = 1;
  if (values.has("--scale")) {
    const percent = Number(values.get("--scale"));
    if (!(percent > 10 && percent < 200)) throw new UsageError(`--scale takes a percentage above 10 and below 200 (100 is the page as it is), not ${values.get("--scale")}.`);
    scale = percent / 100;
  }
  const exporting = { format, content: options.has("--no-files") ? "no_files" : "everything", subpages: options.has("--subpages"), folders: options.has("--folders"), paper, scale };
  if (!validOptions(exporting)) throw new UsageError("Not an export the workbench makes."); // the dialog's own rule, held to
  const out = values.get("--out");
  // The offline file of the document alone, with its files, in exports/: the export as before.
  if (format === "html" && exporting.content === "everything" && !exporting.subpages && out === undefined && platform.length === 0) return null;
  // `strict`: a file another platform publishes, held to the checks as the offline file is (above).
  return { exporting, out, images, embedsAsLinks: options.has("--embeds-as-links"), strict: platform.length > 0 };
}

// Why a page's export failed, as lines (a check's, each with the page it is of when it is another's).
const whyFailed = (error, slug) => (error.reason === "check" && error.failures?.length ? error.failures.map((message) => (error.slug === slug ? message : `${error.slug}: ${message}`)) : [error.message]);

// What a zip holds, its names.
const zipNames = (data) => {
  try {
    return readZip(data).map((entry) => entry.name);
  } catch {
    return [];
  }
};

export async function run(argv) {
  const { slugs, options, values } = await documentArguments({ options: ["--allow-failures", "--no-files", "--subpages", "--folders", "--embeds-as-links", "--original-images"], values: ["--format", "--paper", "--scale", "--out"], repeated: ["--allow-images"], argv });
  const request = requestOf(options, values);
  // The pictures the offline HTML file embeds made as light as the page needs, by the user's Chrome or Edge (src/shared/export-pictures.mjs); --original-images: as they are.
  const pictures = options.has("--original-images") ? null : encodePictures;
  if (slugs.length === 0) {
    console.error(noDocuments());
    process.exit(1);
  }
  // The documents under those named, with --subpages: made and held to the checks with them.
  const site = request ? exportSite({ reportsDirectory, titleOf: titleReader(reportsDirectory), outline: () => readOutline(reportsDirectory), render: null, format: request.exporting.format }) : null;
  const under = new Map(); // slug -> the documents under it
  if (request?.exporting.subpages) for (const slug of slugs) under.set(slug, await subpagesOf(site, slug));
  const all = [...new Set([...slugs, ...[...under.values()].flat()])];
  // gallery qa's baseline (src/cli/qa-baseline.mjs): the exports there are now read before any is
  // replaced; after the export, a document with no baseline gets one of the text its export before was
  // made from (the document before this round of changes, never the text exported now), and the
  // text this export was made from is kept for the next. Silent, and never fails the export.
  const baselines = await exportBaselines(all);
  // A document whose export would fail anyway is not written: no id goes into a file that is not exported.
  const blocked = await handInBlockers(all, { prepare: naturalInMemory({ say: false }) });
  const handed = await handInReports(all.filter((slug) => !blocked.has(slug)));
  // Those not handed in, their 批注 checked against the file as it is now, as a hand-in has them.
  await previewSettled(all.filter((slug) => blocked.has(slug) || handed.failures.has(slug)));
  // Said first: what the preview wrote when the reader edited, and the 批注 it deleted, those of the
  // Agent's last write too: read after the hand-in, which is done once the 批注 are checked against
  // what it wrote (testing the skill with Agents, 2026-10-29: read before it, they were said a command late).
  await previewRewrites(all);
  await previewDeletions(all);
  const ready = all.filter((slug) => !blocked.has(slug) && !handed.failures.has(slug));
  const prepare = naturalInMemory({ say: false });

  let built;
  let exported = []; // the offline file as before: { slug, bytes, sha256 }
  let failures;
  const made = []; // the files --format wrote: { slug, file, bytes, label, names, images }
  const problems = new Map(); // --format: slug -> what the checks found of a document exported all the same
  const written = new Set(); // --format: the documents in a file written (those named, with --subpages those under them)
  const shas = new Map(); // slug -> the sha256 of the doc.html each HTML or PDF file was made from
  if (!request) {
    // Read as the preview shows it, quietly: what the hand-in did not write (ids that repeat) is checked as the kit's.
    ({ built, exported, failures } = ready.length > 0 ? await exportReports(ready, { prepare, workspace: workspaceSnapshots(), pictures, carry: carriedExport }) : { built: [], exported: [], failures: new Map() });
  } else {
    ({ built, failures } = ready.length > 0 ? await buildReports(ready, { prepare }) : { built: [], failures: new Map() });
    // The dialog's export writes the file whatever the checks say of the document (the user asked for it): what
    // they find is said as 问题： lines (problems, below), and only an export that cannot be made fails. Not a file
    // another platform publishes (request.strict): a program publishes it unread, so a document the checks fail
    // (its starter text still there) is a failure, as in the offline file's export: not written, exit 1.
    for (const [slug, messages] of [...blocked, ...handed.failures]) failures.set(slug, messages);
    if (!request.strict) {
      for (const [slug, messages] of failures) problems.set(slug, messages);
      failures = new Map();
    }
    const { images, embedsAsLinks } = request;
    const render = await offlineReports({ directory: reportsDirectory, workspace: workspaceSnapshots(), images, embedsAsLinks, pictures: request.exporting.format === "html" ? pictures : null, carry: carriedExport });
    const folder = request.out === undefined ? exportsDirectory : path.resolve(request.out);
    const { format } = request.exporting;
    for (const slug of slugs) {
      const pages = [slug, ...(under.get(slug) ?? [])]; // what its file holds
      if (request.strict) {
        const failed = pages.filter((page) => failures.has(page));
        if (failed.length > 0) {
          if (!failures.has(slug)) failures.set(slug, [`its subpage${failed.length === 1 ? "" : "s"} ${failed.join(", ")} failed the checks (above), and a file for another platform holds no page that fails them`]);
          continue;
        }
      }
      try {
        const file = await exportPage(slug, request.exporting, exportSite({ reportsDirectory, titleOf: titleReader(reportsDirectory), outline: () => readOutline(reportsDirectory), render, format, made: shas }));
        const zipped = file.type === "application/zip";
        const bare = format === "html" && request.exporting.content === "no_files";
        const web = format === "html" && (images.length > 0 || embedsAsLinks);
        // In exports/, an html file that is not the offline file as it always is has a name of its own (above);
        // a zip of pages for another platform too, never the name of the zip whose pages reach nothing.
        const inExports = sameFolder(folder, exportsDirectory);
        const kept = !zipped && inExports ? `${bare ? "-no-files" : ""}${web ? "-web" : ""}` : "";
        const name = zipped ? `${slug}${inExports && web ? "-web" : ""}.zip` : `${slug}${kept}.${EXTENSION[format]}`;
        await fs.mkdir(folder, { recursive: true });
        await writeAtomic(path.join(folder, name), file.data); // never half a file where one was
        const kinds = [bare && "不含文件和图片", images.length > 0 && "可显示网络图片", embedsAsLinks && "嵌入块换成链接"].filter(Boolean);
        const label = [zipped ? `${LABEL[format]} 压缩包` : LABEL[format], ...kinds].join("，");
        made.push({ slug, file: path.join(folder, name), bytes: file.data.length, label, names: zipped ? zipNames(file.data) : [], images: format === "html" ? images : [], pictures: render.pictures.get(slug) ?? null });
        for (const page of pages) written.add(page);
      } catch (error) {
        failures.set(slug, whyFailed(error, slug));
      }
    }
  }
  await closeSharedBrowser(); // the PDFs and the chart pictures are made: the browser goes now, not after its idle minute
  if (!request) for (const [slug, messages] of [...blocked, ...handed.failures]) failures.set(slug, messages);
  // The failures first, before the notes (they were last, and read past).
  await printFailures(failures, { exportNote: !request });
  // What the checks found of a document the dialog's export wrote all the same: for the Agent to mend (gallery check
  // says it again), the file written as the user's 导出 writes it; or, where its export then failed for what any
  // export needs (its FAIL above), that nothing was written: nothing more where its FAIL said all of it.
  for (const [slug, messages] of problems) {
    if (!written.has(slug) && messages.every((message) => failures.get(slug)?.includes(message))) continue;
    console.log(`问题：${slug} 没通过检查（${messages.length} 处），${written.has(slug) ? "文件照写了，和界面的「导出」一样" : "也没有导出（见上面的 FAIL）"}；改好后再导出一次：`);
    for (const message of messages) console.log(`  - ${message}`);
  }
  await baselines.keep(request ? [...shas.keys()] : exported.map(({ slug }) => slug), request ? shas : null); // gallery qa's baseline (above)
  const removedBySlug = new Map(built.map(({ report, removed }) => [report.slug, removed]));
  for (const { slug, bytes, sha256, pictures } of exported) {
    const removed = removedBySlug.get(slug);
    const pruned = removed.length > 0 ? `; shared scripts and styles left out (unused): ${removed.join(", ")}` : "";
    console.log(`Exported ${deliverablePath(slug)} (${bytes.toLocaleString("en-US")} bytes, sha256 ${sha256})${pruned}`);
    picturesLine(pictures);
  }
  for (const { file, bytes, names, images, pictures } of made) {
    console.log(`Exported ${file} (${bytes.toLocaleString("en-US")} bytes)`);
    picturesLine(pictures);
    if (names.length > 0) console.log(`  holds ${names.length} file${names.length === 1 ? "" : "s"}: ${names.slice(0, 12).join(", ")}${names.length > 12 ? ", …" : ""}`);
    // Said whenever a file may reach the network for its pictures (--allow-images), and from where.
    if (images.length > 0) console.log(`  network: its pictures may load from ${images.join(" ")} (its policy's img-src); nothing else in it reaches the network but an embed's page, as in any export`);
  }
  // A heavy picture weighed as this export embeds it: as it is without a browser or with --original-images.
  reportNotes(built.map(({ report }) => report), { copies: options.has("--original-images") ? "--original-images embeds it as it is" : pictureCopies() });
  editingNotes(built.map(({ report }) => report));
  for (const line of handed.lines) console.log(line);
  // Last, what goes to the user, as its absolute path (src/cli/deliverable.mjs; gallery qa's verdict repeats it).
  for (const { slug } of exported) console.log(deliverableLine(slug));
  for (const { file, label } of made) console.log(`交给用户（${label}）：${file}`);
  failureSummary(failures, { above: true, allow: options.has("--allow-failures") });
}
