import { editable } from "../caret.mjs";
import { UNIT } from "../core.mjs";
import { pageObjects, pageOfUnit } from "../page-objects.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// What is dragged in from outside the page (docs/editor.md, "Dropping in from outside"):
//
//   Files of this computer (a drag that carries "Files": from the system's file manager or the desktop,
//     from another program, or a picture another page lets the browser carry as a file): each made the
//     block that file pasted makes (the first page object that `acceptsFile`: a picture an image, any
//     other file a file block, a video or a sound among them, Gallery having no block of its own for
//     them), in the order they come, where the line shows. The line is the one dragging blocks of those
//     kinds shows (drag/ `outside`: between blocks, into a container by its edges, under a list item,
//     beside a block in a new row of columns); the new blocks go in as one undo step and are selected,
//     each filled as its upload comes back (one step with the drop). A file too big makes no block and
//     says why (`refusesFile`, the paste's words); a folder makes none either (said: Gallery has no
//     block for a folder).
//   A picture of another page (the browser's drag of an <img>: its address and its markup, no file, the
//     address being a link's when a link is around it, so the picture's is read off the markup): an
//     image there, its picture downloaded into the document's folder by the server, as an image pasted
//     with its address is (`forPicture`).
//   Over an empty placeholder that takes it (an image's for a picture, a file block's for any file, an
//     embed's for an HTML or PDF file: `takesDrop`) the placeholder is tinted and no line shows: the
//     first goes in it as one dropped on its 上传 menu does, the others right after it, one undo step.
//
// Anything else dragged in (words, a link, words and pictures of a page together) and anything dragged
// from this page itself (selected words) is not taken: let go in a block's text nothing goes in, the
// editor never letting the browser drop things into its blocks (insertFromDrop is prevented), and let
// go where nothing takes it, the browser opening what it carries in a tab of its own is stopped too
// (shared/drop-guard.mjs). A drag over the page QUIET ms without a dragover is over (it left the
// window, or was cancelled: the browser sends one every few dozen ms while it stays).

const QUIET = 200;
// An address that names a picture by its extension (a drag of one that carries no markup).
const PICTURE = /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)(?:[?#]|$)/i;

const typesOf = (data) => [...(data?.types ?? [])];

// What a drag carries, by what can be read of it while it is over the page (its types, its items'
// kinds and types: the browser keeps the data itself until the drop): "files", "picture" (Chrome's
// drag of a page's <img> carries its address and its markup and no plain text, where a link's and
// words' drags carry plain text; Firefox's says so: application/x-moz-nativeimage), or null.
function carried(data) {
  const types = typesOf(data);
  if (types.includes("Files")) return "files";
  if (types.includes("application/x-moz-nativeimage") || (types.includes("text/uri-list") && types.includes("text/html") && !types.includes("text/plain"))) return "picture";
  return null;
}

// The files a drag over the page carries as they can be read then: { type } each (no name, no data);
// one of no type where the browser lists none.
function likes(data) {
  const files = [...(data?.items ?? [])].filter((item) => item.kind !== "string").map((item) => ({ type: item.type }));
  return files.length > 0 ? files : [{ type: "" }];
}

// The files dropped, in their order, each with whether it is a folder (read during the drop).
function droppedFiles(data) {
  const items = [...(data.items ?? [])].filter((item) => item.kind !== "string");
  if (items.length === 0) return [...(data.files ?? [])].map((file) => ({ file, folder: false }));
  return items.map((item) => ({ file: item.getAsFile(), folder: Boolean(item.webkitGetAsEntry?.()?.isDirectory) })).filter((each) => each.file);
}

// An address the server can bring a picture from: http(s), or a picture's data: address.
const usable = (src) => {
  const address = src?.trim();
  return address && /^(https?:|data:image\/)/i.test(address) ? address : null;
};

// The address of a picture of another page dropped: of the one <img> its markup holds, with no words
// beside it; without markup, its address when that names a picture; else null.
function pictureOf(data) {
  const html = data.getData("text/html");
  if (html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return doc.images.length === 1 && !doc.body.textContent.trim() ? usable(doc.images[0].getAttribute("src")) : null;
  }
  const address = (data.getData("text/uri-list") || "").split(/\r?\n/).find((line) => line.trim() && !line.startsWith("#"));
  return address && PICTURE.test(address) ? usable(address) : null;
}

/**
 * editing(): whether the page edits; active(): whether the block tools may act (editor.mjs `active`);
 * blocks(): the block tools (blocks.mjs: `outside`, select); say: the status line.
 */
export function createDropIn({ editing, active, blocks, say }) {
  let ours = false; // a drag this page started (its words): its own, not taken here
  let quiet = 0;
  const kinds = new Map(); // the unit kind of the block each type of file makes (forFile's block), by type

  document.addEventListener("dragstart", () => { ours = true; }, true);
  for (const type of ["dragend", "pointerdown"]) document.addEventListener(type, () => { ours = false; }, true);

  const tools = () => (active() ? blocks()?.outside ?? null : null);
  const leave = () => {
    clearTimeout(quiet);
    blocks()?.outside?.leave();
  };

  // The page object that makes a block of a file (a pasted file's, `acceptsFile`), the first in their order.
  const pageFor = (file) => pageObjects().find((page) => page.forFile && page.acceptsFile?.(file)) ?? null;
  const picturePage = () => pageObjects().find((page) => page.forPicture) ?? null;
  // The unit kind of the block `item` makes ({ type } of a file, { address } of a picture), or null.
  function kindOf(item) {
    const key = item.address !== undefined ? " picture" : item.type;
    if (!kinds.has(key)) {
      const made = item.address !== undefined ? picturePage()?.forPicture("") : pageFor(item)?.forFile(item);
      kinds.set(key, made?.block.getAttribute("data-ge-unit-kind") ?? null);
    }
    return kinds.get(key);
  }

  // The empty placeholder at (x, y) that takes `item`, or null.
  function ontoAt(x, y, item) {
    const unit = document.elementFromPoint(x, y)?.closest(UNIT);
    return unit && pageOfUnit(unit)?.takesDrop?.(unit, item) ? unit : null;
  }

  // Where what `items` make goes with the pointer at (x, y), shown (drag/ outside.over). Returns whether it is.
  function show(outside, items, x, y) {
    const made = [...new Set(items.map(kindOf).filter(Boolean))];
    if (made.length === 0) {
      outside.leave();
      return false;
    }
    return outside.over(made, x, y, (at, by) => ontoAt(at, by, items[0]));
  }

  // While it is over the page: never the browser's (it would open the file in a tab of its own), the line
  // shown where the page takes it.
  document.addEventListener("dragover", (event) => {
    const kind = event.defaultPrevented || ours ? null : carried(event.dataTransfer);
    if (!kind) return;
    event.preventDefault();
    const outside = tools();
    const shown = Boolean(outside) && show(outside, kind === "files" ? likes(event.dataTransfer) : [{ address: "" }], event.clientX, event.clientY);
    event.dataTransfer.dropEffect = shown ? "copy" : "none";
    clearTimeout(quiet);
    if (shown) quiet = setTimeout(leave, QUIET);
  });
  document.addEventListener("dragenter", (event) => {
    if (!event.defaultPrevented && !ours && carried(event.dataTransfer)) event.preventDefault();
  });

  document.addEventListener("drop", (event) => {
    if (event.defaultPrevented) return;
    const data = event.dataTransfer;
    const kind = ours ? null : carried(data);
    ours = false;
    if (!kind) {
      if (editing() && editable(event.target)) event.preventDefault(); // nothing dropped into a block's text
      return;
    }
    event.preventDefault();
    clearTimeout(quiet);
    const outside = tools();
    if (!outside) return void leave();
    if (kind === "files") dropFiles(outside, droppedFiles(data), event.clientX, event.clientY);
    else dropPicture(outside, pictureOf(data), event.clientX, event.clientY);
  });

  // Where it goes now, the line and tint gone: the place (outside.place), or null.
  function landing(outside, items, x, y) {
    const shown = items.length > 0 && show(outside, items, x, y);
    const place = shown ? outside.place : null;
    outside.leave(place?.onto ?? place?.nest ?? place?.container ?? place?.aside?.row ?? place?.aside?.target ?? null);
    return place;
  }

  // New blocks (`made`: { block, fill }) where `place` says (after `place.after`), one undo step, selected
  // and then filled. Returns whether they went.
  function putIn(outside, made, place) {
    if (made.length === 0) return true;
    const nodes = made.map((each) => each.block);
    if (!outside.put(nodes, place)) return false;
    blocks().select(nodes, { quiet: true });
    for (const each of made) each.fill();
    return true;
  }

  function dropFiles(outside, all, x, y) {
    const files = all.filter((each) => !each.folder).map((each) => each.file);
    const folders = all.length - files.length;
    const place = landing(outside, files.map((file) => ({ type: file.type, name: file.name })), x, y);
    if (files.length === 0) {
      if (folders > 0) say(t("文件夹不能放进文档：打开文件夹，选中里面的文件再拖进来。"), "error");
      return;
    }
    if (!place) return;
    // On an empty placeholder: the first file it takes goes in it, the others after it.
    const onto = place.onto ?? null;
    const holder = onto ? pageOfUnit(onto) : null;
    const into = onto ? files.find((file) => holder?.takesDrop?.(onto, { type: file.type, name: file.name })) ?? null : null;
    const refused = [];
    const made = [];
    for (const file of files) {
      if (file === into) continue;
      const page = pageFor(file);
      const why = page ? page.refusesFile?.(file) : t("很抱歉，不支持该文件类型。");
      if (why) refused.push(why);
      else made.push(page.forFile(file));
    }
    if (!putIn(outside, made, onto ? { after: onto } : place)) return;
    if (into) holder.takeDrop(onto, { file: into }, { pasted: made.length > 0 });
    if (refused.length > 0) say(refused.length + folders > 1 ? t("有 {0} 个没有放进来：{1}", refused.length + folders, refused[0]) : refused[0], "error");
    else if (folders > 0) say(t("文件夹不能放进文档，只放进了和它一起拖进来的文件。"), "error");
  }

  function dropPicture(outside, address, x, y) {
    const place = landing(outside, [{ address: address ?? "" }], x, y);
    if (!place) return;
    if (!address) return say(t("拖进来的内容里没有能放进文档的图片。"), "error");
    if (place.onto) return void pageOfUnit(place.onto)?.takeDrop?.(place.onto, { address });
    const made = picturePage()?.forPicture(address);
    if (made) putIn(outside, [made], place);
  }
}
