import { createHash } from "node:crypto";
import { PICTURE_QUALITY, lighter, pictureCeiling, pictureTask } from "../shared/export-pictures.mjs";
import { attr, walk } from "../shared/html-tree.mjs";
import { parseReport } from "./report-tree.mjs";

// The pictures of an export made as light as the page needs (src/shared/export-pictures.mjs says which and how): read
// off the file the export made, the data: URL of each <img> of the page (none a template holds) given to `encode`, the
// pixels' maker (src/transfer/browser.mjs encodePictures, the user's Chrome or Edge, passed in by what exports: the
// command, the workbench), and each copy it makes that is a tenth lighter put in that <img>'s src. The render never
// starts a browser itself.

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

/**
 * The pictures of an export's `html` a copy is tried of: [{ start, end (the src attribute's place), type, bytes,
 * lossy }], one for each <img> whose src is a data: URL of a PNG, JPEG or WebP pictureTask takes; and the page's
 * ceiling (pictureCeiling, from its <html>).
 */
export function pictureJobs(html) {
  if (!/<img\b[^>]*\ssrc\s*=\s*["']?data:image\/(?:png|jpeg|webp);/i.test(html)) return { jobs: [], ceiling: null };
  const tree = parseReport(html);
  let root = null;
  walk(tree, (node) => {
    if (!root && node.tagName === "html") root = node;
  }, { inTemplates: false });
  const ceiling = pictureCeiling((name) => (root ? attr(root, name) ?? null : null));
  const jobs = [];
  walk(tree, (node) => {
    if (node.tagName !== "img") return;
    const place = node.sourceCodeLocation?.attrs?.src;
    const found = DATA_URL.exec(attr(node, "src") ?? "");
    if (!place || !found) return;
    const bytes = Buffer.from(found[2], "base64");
    const task = pictureTask(bytes, ceiling);
    if (task) jobs.push({ start: place.startOffset, end: place.endOffset, type: found[1], bytes, key: `${found[1]};${found[2]}`, ...task });
  }, { inTemplates: false });
  return { jobs, ceiling };
}

/**
 * The export `html` with its pictures made as light as the page needs, by `encode(pictures)` ([{ bytes, type,
 * ceiling, lossy, quality }] -> a Buffer of a WebP, null, or an Error where that picture could not be drawn, for
 * each; a picture met again is asked once): { html, pictures: { tried, made, before, after, ceiling } (the pictures
 * tried, those whose copy went in, their bytes before and after, the page's ceiling, and `copies`, each copy that went in
 * as [{ from, to }], the sha256 of the picture's bytes and of its copy's, for what the export carries: src/transfer/carry.mjs), and, where some could not
 * be drawn, `unread` (how many <img>s show them, each as it is) and `why` (the first one's message) }. An `encode`
 * that fails as a whole (no browser on the machine: its error's `reason` "browser") leaves the file as it is, and
 * says why: `pictures.failed`, its message.
 */
export async function smallerPictures(html, encode) {
  const { jobs, ceiling } = pictureJobs(html);
  const pictures = { tried: jobs.length, made: 0, before: 0, after: 0, ceiling, copies: [] };
  if (jobs.length === 0) return { html, pictures };
  const distinct = [...new Map(jobs.map((job) => [job.key, job])).values()];
  let made;
  try {
    made = await encode(distinct.map(({ bytes, type, lossy }) => ({ bytes, type, lossy, ceiling, quality: PICTURE_QUALITY })));
  } catch (error) {
    return { html, pictures: { ...pictures, before: jobs.reduce((sum, job) => sum + job.bytes.length, 0), failed: error.message, reason: error.reason ?? null } };
  }
  const copies = new Map(distinct.map((job, index) => [job.key, made[index]]));
  const pieces = [];
  let cursor = 0;
  for (const job of jobs.sort((a, b) => a.start - b.start)) {
    let copy = copies.get(job.key);
    pictures.before += job.bytes.length;
    if (copy instanceof Error) {
      pictures.unread = (pictures.unread ?? 0) + 1;
      pictures.why ??= copy.message;
      copy = null;
    }
    if (!copy || !lighter(copy.length, job.bytes.length)) {
      pictures.after += job.bytes.length;
      continue;
    }
    pictures.made += 1;
    if (!pictures.copies.some(({ key }) => key === job.key)) pictures.copies.push({ key: job.key, from: sha256(job.bytes), to: sha256(copy) });
    pictures.after += copy.length;
    pieces.push(html.slice(cursor, job.start), `src="data:image/webp;base64,${copy.toString("base64")}"`);
    cursor = job.end;
  }
  pieces.push(html.slice(cursor));
  pictures.copies = pictures.copies.map(({ from, to }) => ({ from, to }));
  return { html: pieces.join(""), pictures };
}
