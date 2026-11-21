import { UPLOAD_LIMITS, mediaUrl, sizeLimit } from "../../../shared/media.mjs";
import { currentProjectBase, workspaceAddress } from "../../../shared/workspace-address.mjs";
import { cellPicture, pictureFile } from "../../components/table/index.mjs";
import { ownHTML } from "../core.mjs";
import { gestureLock } from "../gesture.mjs";
import { drawAt, drawBox, layerOf } from "../overlay-layer.mjs";
import { onSettle, own } from "../overlays.mjs";
import { blobBase64 } from "../post.mjs";
import { addStyle, element } from "../ui.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// 单元格里的图片 (the user's, 2026-11-09: no image block, a light one; Markdown tables hold pictures):
// an <img> amid a table cell's words, a picture of the document's folder (components/table/ cellPicture; the
// file takes it as source/blocks.mjs cellPictureProblem says, the kit lays it out: table.css), the
// plainest that works, flat:
// - A press on one selects it (the selection around it, a 2px blue frame over it, no caret): Delete
//   or Backspace then takes it out, a typed character takes its place, Esc puts the caret after it;
//   the arrows go past it as past a character (the browser's: an <img> in an editable text is one).
// - A gray bar at its right edge (the image block's handle) under the pointer or while it is
//   selected: dragged, the picture's width in pixels (its height by its ratio), at least MIN_WIDTH,
//   at most its table's frame, written as its width attribute; one undo step on letting go, Esc
//   putting it back.
// - Where pictures come from (clipboard/, table/cells.mjs): a picture file pasted into a cell (a
//   screenshot, a copied picture) sent to the document's folder as an image block's (fromFiles); the
//   pictures of cells pasted (another program's table, a Markdown table, the page's own cells of
//   another document) each made a file of the folder first (resolve: one of the folder as it is,
//   another document's, a data: one and a web one copied in, the server downloading a web one as it
//   does an image block's link), then put in by what pastedLines makes of each (maker): a picture of
//   no file a link to it (a web one) or its alt words.

const MIN_WIDTH = 16;
const MAX_PICTURES = 50; // the pictures a paste copies in at most (each a download)
const WIDTH = /^[1-9]\d{0,3}$/;
const WEB = /^https?:\/\/[^\s"<>]+$/i;
const DATA = /^data:image\/[a-z0-9.+-]+;base64,/i;
// A file of a document's folder as the preview serves it (a copy of the page's HTML: named by its stamp, ?v=,
// render/media-ref.mjs servedUrl), or as a cell's text writes it.
const SERVED = /^(?:https?:\/\/[^/]+)?\/__gallery\/edit\/asset\/([^/?#]+)\/(assets\/[^/?#]+)(?:\?v=[0-9a-f]*)?$/;
const FOLDER_FILE = /^assets\/[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
const CELL = '[data-ge-kind="cell"]';
// The name of a picture's file in its address (its last part, its escapes read).
const nameOf = (src) => {
  const name = src.split(/[?#]/)[0].split("/").pop() || src;
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
};

const STYLE = `
  [data-ge-editing] ${CELL}[contenteditable="true"] img { cursor: default; }
  .ge-layer > .ge-cellpic-handle { pointer-events: auto; }
  .ge-cellpic-frame { box-sizing: border-box; border: 2px solid var(--ge-accent); border-radius: 2px; pointer-events: none; }
  /* The image block's handle (image/page.mjs): a plain gray bar, no border. */
  .ge-cellpic-handle { display: flex; align-items: center; justify-content: center; width: 12px; cursor: col-resize; }
  .ge-cellpic-handle::after { content: ""; width: 4px; height: 32px; max-height: 70%; border-radius: 4px; background: light-dark(rgb(55 53 47 / 35%), rgb(255 255 255 / 38%)); transition: background 120ms ease; }
  .ge-cellpic-handle:hover::after, html[data-ge-cellpic-resize] .ge-cellpic-handle::after { background: light-dark(rgb(55 53 47 / 60%), rgb(255 255 255 / 62%)); }
  ${gestureLock("data-ge-cellpic-resize", { cursor: "col-resize" })}
`;

// The report this page shows (its main's data-doc-id: its folder's name).
const thisReport = () => document.querySelector(".doc-page")?.dataset.docId ?? null;

/**
 * active(): whether the tools may act. recordStep(host, before): a text step of a text block
 * (history.mjs). say: the status line. upload(kind, body): POST /__gallery/edit/upload, the server's
 * answer (an Error when it fails).
 */
export function createCellPictures({ active, recordStep, say, upload }) {
  addStyle(STYLE);
  let hovered = null; // the picture under the pointer
  let picked = null; // the picture selected
  let drag = null; // its edge dragged: { img, host, x, start, before, had }
  const frame = element("div", { class: "ge-cellpic-frame", "data-doc-dev": "" });
  const handle = element("div", { class: "ge-cellpic-handle", "data-doc-dev": "" });
  // The picture they are drawn for: the frame the selected one's (or the dragged one's), the bar any of them.
  const framed = () => drag?.img ?? picked;
  const barred = () => drag?.img ?? picked ?? hovered;
  own(frame, "cell picture", { alive: () => Boolean(framed()?.isConnected) });
  own(handle, "cell picture", { alive: () => Boolean(barred()?.isConnected) });
  // The cell of the picture drawn for, watched: a picture taken out (Delete, undo, someone else's
  // words merged) takes them away at once, before the page draws again.
  const watch = new MutationObserver(() => {
    if (!barred()?.isConnected) draw();
  });

  // A picture of a cell the reader writes in, and that cell; or null.
  const pictureAt = (node) => {
    const img = node?.closest?.("img");
    const host = img?.closest(CELL);
    return img && host?.getAttribute("contenteditable") === "true" && host.closest("main") && !host.closest("[data-ge-lock], [inert]") && pictureFile(img) ? { img, host } : null;
  };

  function draw() {
    if (picked && !picked.isConnected) picked = null;
    if (hovered && !hovered.isConnected) hovered = null;
    const img = barred();
    watch.disconnect();
    if (!img?.isConnected || !active()) {
      frame.remove();
      handle.remove();
      return;
    }
    watch.observe(img.closest(CELL) ?? img.parentNode, { childList: true, subtree: true });
    const layer = layerOf(img);
    const rect = img.getBoundingClientRect();
    if (img === framed()) drawBox(frame, layer, rect);
    else frame.remove();
    const origin = layer.getBoundingClientRect();
    handle.style.height = `${Math.max(20, Math.round(rect.height))}px`;
    drawAt(handle, layer, rect.right - origin.left - 2, rect.top - origin.top + Math.min(0, (rect.height - 20) / 2));
  }

  // Whether the selection is the picture alone (a press on it, or the browser's own).
  const around = (img) => {
    const selection = getSelection();
    if (!selection.rangeCount || !img.parentNode) return false;
    const range = selection.getRangeAt(0);
    const at = [...img.parentNode.childNodes].indexOf(img);
    return range.startContainer === img.parentNode && range.endContainer === img.parentNode && range.startOffset === at && range.endOffset === at + 1;
  };
  function pick({ img, host }) {
    if (document.activeElement !== host) host.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNode(img);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    picked = img;
    draw();
  }

  // ---------- the pointer ----------

  document.addEventListener("pointermove", (event) => {
    if (drag) return;
    const at = pictureAt(event.target);
    const next = at ? at.img : event.target === handle ? hovered : null;
    if (next !== hovered) {
      hovered = next;
      draw();
    }
  }, { passive: true });
  // A press on a picture selects it, before the cells' tools (a drag between cells) and the caret hear it.
  window.addEventListener("pointerdown", (event) => {
    const at = event.button === 0 && active() ? pictureAt(event.target) : null;
    if (!at) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    pick(at);
  }, true);
  window.addEventListener("mousedown", (event) => {
    if (event.button === 0 && active() && (pictureAt(event.target) || event.target === handle)) event.preventDefault(); // no caret, no drag of the picture
  }, true);
  document.addEventListener("selectionchange", () => {
    if (picked && !(picked.isConnected && around(picked))) {
      picked = null;
      draw();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.isComposing) return;
    if (drag) return void (event.preventDefault(), event.stopImmediatePropagation(), end(false));
    if (!picked || !around(picked)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const range = document.createRange();
    range.setStartAfter(picked);
    range.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  }, true);
  for (const type of ["scroll", "resize"]) window.addEventListener(type, () => { if (drag || picked || hovered) draw(); }, { capture: true, passive: true });
  onSettle(draw);

  // ---------- its width ----------

  handle.addEventListener("pointerdown", (event) => {
    const img = picked ?? hovered;
    const host = img?.closest(CELL);
    if (event.button !== 0 || !host || !active()) return;
    event.preventDefault();
    event.stopPropagation();
    handle.setPointerCapture(event.pointerId);
    drag = { img, host, x: event.clientX, start: img.getBoundingClientRect().width, before: ownHTML(host), had: img.getAttribute("width") };
    document.documentElement.setAttribute("data-ge-cellpic-resize", "");
  });
  handle.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const room = drag.host.closest(".doc-table-wrap")?.clientWidth || 2000; // never wider than its table's frame
    drag.img.setAttribute("width", String(Math.round(Math.max(MIN_WIDTH, Math.min(room, drag.start + event.clientX - drag.x)))));
    draw();
  });
  function end(keep) {
    if (!drag) return;
    const { img, host, before, had } = drag;
    drag = null;
    document.documentElement.removeAttribute("data-ge-cellpic-resize");
    if (!keep) {
      if (had === null) img.removeAttribute("width");
      else img.setAttribute("width", had);
    } else if (img.getAttribute("width") !== had) recordStep(host, before);
    draw();
  }
  handle.addEventListener("pointerup", () => end(true));
  handle.addEventListener("pointercancel", () => end(false));

  // ---------- pictures pasted ----------

  const sent = async (blob, name) => (await upload("image", { name, type: blob.type, data: await blobBase64(blob) })).path;

  /**
   * Picture files pasted into a cell (a screenshot, a copied picture), each sent to the document's
   * folder as an image block's (10 MB at most): the cell's pictures, in order, those that could not
   * go said.
   */
  async function fromFiles(files) {
    const pictures = [...files].filter((file) => /^image\//.test(file.type));
    if (pictures.some((file) => file.size > UPLOAD_LIMITS.image)) say(t("图片太大（最多 {0}）。", sizeLimit("image")), "error");
    const made = await Promise.all(pictures.filter((file) => file.size <= UPLOAD_LIMITS.image).map(async (file) => {
      try {
        return cellPicture(document, await sent(file, file.name || `image.${file.type.split("/")[1] ?? "png"}`), { alt: "" });
      } catch (error) {
        say(t("{0}：{1}", t("无法上传这张图片"), error.message), "error");
        return null;
      }
    }));
    return made.filter(Boolean);
  }

  // A pasted picture's address as a file of this document's folder ({ path }), or null. `project`: the
  // workspace the clipboard's own data said it was copied in (its /~ws-… base) where that is another one
  // (`elsewhere`), whose document may have this one's name: its files are that one's.
  async function fileOf(src, from, here, project = null) {
    const served = SERVED.exec(src);
    const [report, file] = served ? [decodeURIComponent(served[1]), served[2]] : FOLDER_FILE.test(src) ? [from ?? here, src] : [null, null];
    const elsewhere = project !== null;
    if (file && report === here && !elsewhere) return { path: file };
    const copied = async (address, name) => {
      const response = await fetch(address);
      const blob = response.ok ? await response.blob() : null;
      return blob && /^image\//.test(blob.type) && blob.size <= UPLOAD_LIMITS.image ? { path: await sent(blob, name) } : null;
    };
    if (file && report) return copied(elsewhere ? workspaceAddress(`/__gallery/edit/asset/${encodeURIComponent(report)}/${file}`, project) : mediaUrl("asset", encodeURIComponent(report), file), file.slice("assets/".length));
    if (DATA.test(src)) return copied(src, "image");
    if (WEB.test(src)) return { path: (await upload("image", { url: src })).path };
    return null;
  }

  /**
   * The pictures of pasted cells (`htmls`: their inline HTML) as files of this document's folder: a
   * Map of each address to { path } (assets/<file>), or null where none could be had. `from`: the
   * report the page's own cells came from (their assets/ that report's); `origin`: what the clipboard's
   * own data said of it ({ same, project }: of this document, of which workspace).
   */
  async function resolve(htmls, from = null, origin = {}) {
    const addresses = new Set();
    const template = document.createElement("template");
    for (const html of htmls) {
      if (!html.includes("<img")) continue;
      template.innerHTML = html;
      for (const img of template.content.querySelectorAll("img[src]")) addresses.add(img.getAttribute("src"));
    }
    const found = new Map();
    if (addresses.size === 0) return found;
    const here = thisReport();
    const list = [...addresses];
    // Copied in another workspace (the clipboard's own data says so: a table's cells say it too, cellsPayload).
    const project = origin.same === false && typeof origin.project === "string" && origin.project !== currentProjectBase() ? origin.project : null;
    if (project !== null || list.some((src) => !(SERVED.exec(src)?.[1] === here || (FOLDER_FILE.test(src) && (from ?? here) === here)))) say(t("正在下载…"));
    await Promise.all(list.slice(0, MAX_PICTURES).map(async (src) => found.set(src, await fileOf(src, from, here, project).catch(() => null))));
    return found;
  }

  /**
   * What pastedLines makes of a pasted picture (`found`: resolve's answer): the cell's picture, its
   * alt and width kept; else a web one a link to it (`links`), any other its alt words (undefined:
   * an element that is no picture).
   */
  const maker = (found, links = true) => (img) => {
    if (img.localName !== "img") return undefined;
    const src = img.getAttribute("src") ?? "";
    const alt = img.getAttribute("alt") ?? "";
    const width = img.getAttribute("width") ?? "";
    const file = found.get(src);
    if (file) return cellPicture(document, file.path, { alt, width: WIDTH.test(width) ? Number(width) : null });
    if (links && WEB.test(src)) {
      const link = document.createElement("a");
      link.setAttribute("href", src);
      link.textContent = alt || nameOf(src);
      return link;
    }
    return alt ? document.createTextNode(alt) : null;
  };

  return {
    fromFiles, resolve, maker,
    /** The tools' nodes (kept in the top layer with a modal dialog). */
    get nodes() { return [frame, handle].filter((node) => node.isConnected); },
    /** Take them away (the page stops editing). */
    hide() {
      hovered = picked = null;
      if (drag) end(false);
      draw();
    },
  };
}
