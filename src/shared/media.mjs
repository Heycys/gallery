import { workspaceAddress } from "./workspace-address.mjs";
// The media of a report, one place for what every system asks about it: the files its media
// blocks, its page icon and any other reference of its markup keep in the report's folder
// (assets/<file>), where the preview serves them, and what the editor may upload. Shared by the
// render (the preview's and an export's pictures, files and frames: src/render/media-ref.mjs, and
// every other reference: asset-references.mjs), the server (its routes: src/server/media-route.mjs,
// the upload: src/editor/media-store.mjs), the editor's page and the shared component descriptions.
// A new media kind is a row in these tables. Which blocks are media blocks is the descriptions' `media`
// (components/index.mjs MEDIA_BLOCKS).

// ---------- the files of a report's folder ----------

// assets/<file>: the file's name of letters, digits, dots, dashes and underscores (the page editor's
// uploads name each <kind>-<hash>.<extension>: editor/media-store.mjs). Flat and ASCII on purpose
// (a name any shell, URL and zip writes as it is); what breaks it is said by assetProblem.
const ASSET = /^assets\/[a-z0-9][a-z0-9._-]{0,80}$/i;

/** Each extension's media type: what a build and an export embed a file with, what the server serves it as. */
export const MEDIA_TYPES = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", svg: "image/svg+xml", ico: "image/x-icon",
  pdf: "application/pdf", csv: "text/csv", tsv: "text/tab-separated-values", txt: "text/plain", md: "text/markdown", json: "application/json",
  xml: "application/xml", html: "text/html", htm: "text/html", zip: "application/zip", gz: "application/gzip", tar: "application/x-tar", "7z": "application/x-7z-compressed",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", doc: "application/msword",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", ppt: "application/vnd.ms-powerpoint",
  mp3: "audio/mpeg", wav: "audio/wav", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", vtt: "text/vtt",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
};

/** A name's extension, lowercase ("" when it has none). */
export const extensionOf = (value) => /\.([a-z0-9]{1,10})$/i.exec(value)?.[1]?.toLowerCase() ?? "";

/** The media type of a file by its extension (any file: application/octet-stream when the table lacks it). */
export const mediaTypeOf = (value) => MEDIA_TYPES[extensionOf(value)] ?? "application/octet-stream";

/** The extension an image's media type is kept under (png for image/png, jpg for image/jpeg). */
export const imageExtension = (type) => (type.startsWith("image/") ? Object.keys(MEDIA_TYPES).find((extension) => MEDIA_TYPES[extension] === type) ?? null : null);

/** Whether a value names a file of the report's folder (assets/<file>). */
export const assetFile = (value) => typeof value === "string" && ASSET.test(value) && !value.includes("..");

/** Whether a value names a picture of the report's folder (a file of an image type). */
export const imageFile = (value) => assetFile(value) && mediaTypeOf(value).startsWith("image/");

// The picture formats a page shows, as a failure names them.
const PICTURE_FORMATS = "png, jpg, gif, webp, avif, svg or ico";
// The rule of a file's name in assets/ (ASSET), as a failure says it.
const NAME_RULE = "a name is 1 to 81 characters, each a letter a-z or A-Z, a digit, a dot, a dash or an underscore, the first a letter or a digit";

/**
 * A name of a file in assets/ that ASSET takes, made of one that it does not (an example a failure
 * gives): its runs of ASCII letters and digits in lowercase, a dash between them, its extension kept
 * (B263_古文孝経__NDL1288405.png → b263-ndl1288405.png); `fallback` when no letter or digit is left
 * (古文孝経.png → picture.png).
 */
export function assetName(name, fallback = "file") {
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) : "";
  const stem = (dot > 0 ? name.slice(0, dot) : name).match(/[a-z0-9]+/gi)?.join("-").toLowerCase() || fallback;
  return extension ? `${stem.slice(0, 80 - extension.length)}.${extension}` : stem.slice(0, 81);
}

/**
 * Why a value names no file of the report's folder as the preview serves one (assetFile, and with
 * `picture` imageFile), as a failure says it after the value and a colon, or null when it names one:
 * each reason apart, with what to write instead: not in assets/ (a web address, another folder,
 * ./assets/, ASSETS/ in capitals, one leaving it by ".."), in a folder of assets/, a name of
 * characters ASSET does not take (each named, an example of a name it takes: assets/b263-kobun.png),
 * too long or starting with neither a letter nor a digit; with `picture`, a file of no picture format
 * too. The rule stays ASSET's: an Agent copies a file in under such a name (the uploads name theirs so).
 */
export function assetProblem(value, { picture = false } = {}) {
  if (typeof value !== "string" || !value.trim()) return `it names no file: write assets/<file>, a file of the document's assets/ folder`;
  const written = value.trim();
  const format = (name) => (picture && !mediaTypeOf(name).startsWith("image/") ? `${extensionOf(name) ? `.${extensionOf(name)}` : "a file with no extension"} is no picture format a page shows (${PICTURE_FORMATS}): convert it to one` : "");
  if (/^[a-z][a-z0-9+.-]*:/i.test(written)) return `it is no file of the document's folder (an export holds the document's own files alone): save it into the document's assets/ folder and write assets/<file>`;
  const relative = /^\.\/(?=assets\/)/i.test(written) ? written.slice(2) : written;
  if (!/^assets\//i.test(relative)) return `it is not in the document's assets/ folder: copy the file into it and write assets/<file>`;
  const name = relative.slice("assets/".length);
  if (!relative.startsWith("assets/")) return `the folder is assets/, in lowercase: write it so (assets/${name})`;
  if (relative !== written) return `write it without "./" (${relative})`;
  if (name.split(/[\\/]/).includes("..")) return `it leaves assets/ by "..": the files are right in assets/`;
  const base = name.split(/[\\/]/).at(-1);
  const proper = /^[a-z0-9][a-z0-9._-]{0,80}$/i.test(base) && !base.includes("..") ? base : assetName(base, picture ? "picture" : "file");
  const converted = format(base);
  if (/[\\/]/.test(name)) return `the preview serves the files right in assets/, none in a folder of it (${relative.slice(0, relative.length - base.length)}): move the file into assets/, as assets/${proper}${converted ? `; and ${converted}` : ""}`;
  if (!base) return `it names no file: write assets/<file>, a file of the document's assets/ folder`;
  const foreign = [...new Set(base.match(/[^a-z0-9._-]/gi) ?? [])];
  const why = foreign.length ? `its name holds ${foreign.slice(0, 6).map((char) => (/\s/.test(char) ? "a space" : char)).join(", ")}${foreign.length > 6 ? "…" : ""}`
    : base.length > 81 ? `its name is ${base.length} characters`
    : !/^[a-z0-9]/i.test(base) ? `its name starts with "${base[0]}"`
    : base.includes("..") ? `its name holds ".."`
    : "";
  if (why) return `${why}, which the preview serves no file by (${NAME_RULE}): copy the file in under such a name, as assets/${proper}${converted ? `; and ${converted}` : ""}`;
  return converted || null;
}

/** Whether a value names an embed block's file of the report's folder (an HTML or PDF file). */
export const embedFile = (value) => assetFile(value) && /\.(html?|pdf)$/i.test(value);

/** Whether a value names a picture a page's icon may be (an image of the report's folder, but no .ico). */
export const iconImageFile = (value) => imageFile(value) && extensionOf(value) !== "ico";

/**
 * The file of the report's folder a reference names, wherever it stands (render/asset-references.mjs):
 * the value written assets/… or ./assets/… (in any case), without its query and fragment, its
 * %-escapes read; or null when it names none (another address, or one leaving the folder by "..").
 * Whether the preview can serve that file is assetFile's to say, as for any file of the folder.
 */
export function referencedFile(value) {
  if (typeof value !== "string" || !/^\s*(?:\.\/)?assets\//i.test(value)) return null;
  let file = value.trim().replace(/^\.\//, "").replace(/[?#].*$/, "");
  try {
    file = decodeURIComponent(file);
  } catch {
    // written with a stray "%": the name as it is
  }
  return file.split(/[\\/]/).includes("..") ? null : file;
}

// ---------- where the preview serves them ----------

/**
 * What each route of the preview server serves of a report's folder (/__gallery/edit/<route>/<slug>/assets/<file>):
 * `asset` its pictures (the editor works with them as they are), `file` any file, handed out for saving
 * only, `embed` an embed block's HTML or PDF file, shown in its frame. Each says what it takes.
 */
export const MEDIA_ROUTES = { asset: imageFile, file: assetFile, embed: embedFile };

/** The address the preview serves a file of a report's folder at (`value`: assets/<file>). */
export const mediaUrl = (route, slug, value) => workspaceAddress(`/__gallery/edit/${route}/${slug}/${value}`);

// ---------- what may be uploaded ----------

const MB = 1024 * 1024;
/** The most bytes of each upload kind: an icon's picture, an image block's, a file block's, an embed block's file. */
export const UPLOAD_LIMITS = { icon: 2 * MB, image: 10 * MB, file: 20 * MB, embed: 20 * MB };
/** The limit of an upload kind as the page says it ("10 MB"). */
export const sizeLimit = (kind) => `${UPLOAD_LIMITS[kind] / 1024 / 1024} MB`;

/** A size as the page writes one: 1024 a step, one decimal at most (12.1 KiB). */
export function formatSize(bytes) {
  const units = ["B", "KiB", "MiB", "GiB"];
  let value = bytes;
  let at = 0;
  while (value >= 1024 && at < units.length - 1) {
    value /= 1024;
    at++;
  }
  return `${parseFloat(value.toFixed(at ? 1 : 0))} ${units[at]}`;
}
/** The most the upload request holds: the biggest file as base64, and a megabyte for the rest of it. */
export const UPLOAD_REQUEST_LIMIT = Math.ceil((Math.max(...Object.values(UPLOAD_LIMITS)) * 4) / 3 / MB + 1) * MB;

// ---------- the width a sized media block takes ----------

/** The property of a media block's width, as a share of the width it stands in (a picture's: of the reading width, at most where it stands), and the shares it may take. */
export const SPAN = "--doc-span";
export const SPAN_SIZE = { min: 0.1, max: 1 };
/** The reading width, px (the kit's --doc-content-max-width, styles/tokens.css): what a picture's width in pixels is a share of. */
export const READING_WIDTH = 712;
/** The gap between the columns of a row, px (the kit's --doc-column-gap, styles/tokens.css): what a column's width is less. */
export const COLUMN_GAP = 20;
