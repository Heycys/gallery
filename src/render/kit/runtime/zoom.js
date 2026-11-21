import { ZOOM_MARK, zoomCaption, zoomable } from "../../../shared/zoom.mjs";
import { sayRuntime as say } from "../words.js";

// 图片放大: a picture of the report clicked opens large over the page, for a reader (an exported
// file, a build, the preview's 演示视图: wherever the page editor is not editing the page). Which
// pictures open is src/shared/zoom.mjs's rule (an image block's, one in a table, a card, a column or
// a flowchart's node; not a link's, a control's or an icon, nor one shown at an icon's size), the page
// editor's too; nothing is written for it: the viewer is an element of the kit's own at the end of
// <body> while it is open (the image description's runtime: an export of the current view leaves it
// out), and <html> carries a class or two meanwhile.
//
// The keyboard reaches it too: each picture that opens is a tab stop while the page is read, a
// button that opens a dialog, named by what it does (放大查看：<its alt>, or 放大查看图片: the kit's
// words), marked data-doc-zoom (ZOOM_MARK); Enter or Space opens it, and the focus comes back to it as
// the viewer closes; the kit's focus ring shows on it from the keyboard (styles/zoom.css). Whether a
// picture opens is the rule's, its size and its load among it, so DocKit watches the page's pictures
// (watchZoom: their size, their load, an element around them shown) and the marks come and go with
// it; a picture the author made a control of their own (a tab stop, a role, a name) is left as it is.
// While the page editor edits the page the marks are off, as the click is the editor's there; an
// export of the view takes them off (the image description's runtime).
//
// The viewer (the page editor's viewer, editor/components/image/viewer.mjs, the reader's
// part of it) is a modal <dialog>: the page dimmed behind it, inert and kept from scrolling
// (html.doc-zoom-open, its scrollbar's room kept where it had one: no shift); the picture in the
// middle, fitted to the window (48px around it from 1020px wide, 16px below that) and never past its
// own size; under it the caption of the image block or card it is the one picture of (its words as
// the page shows them); a close button at the top right. The viewer itself takes the focus as it opens
// (no ring), the close button the next stop of Tab. Esc, the close button or a click anywhere but on
// the picture closes it, and the focus goes back where it was. It fades in
// (the picture growing a little), not with reduced motion; it never prints (closed before printing,
// and hidden by a print rule). While the page editor edits the page (html[data-ge-editing]) a click
// selects a block: there the editor opens its own viewer (a double-click, 展开, 全屏查看).

const OPEN = "doc-zoom-open"; // on <html> while a picture is open
const GUTTER = "doc-zoom-gutter"; // with it, where the page had a scrollbar: its room kept
const HOVER = "doc-zoom-hover"; // on <html> while the pointer is on a picture that opens: its cursor

let viewer = null; // { dialog, picture, caption, from, focus, keys, fit }

const editing = (doc) => doc.documentElement.hasAttribute("data-ge-editing");
// The marks taken off <html>, and its class attribute with them when nothing else is in it.
const unmark = (root, ...names) => {
  root.classList.remove(...names);
  if (root.classList.length === 0) root.removeAttribute("class");
};
const printing = (win) => Boolean(win.matchMedia?.("print")?.matches);

// What the runtime gives a picture that opens besides its mark, and the pictures it watches.
const KEYED = ["tabindex", "role", "aria-haspopup", "aria-label"];
const watched = new Set();

/** `img` offered to the keyboard (ZOOM_MARK and KEYED) while it opens and the page is read, else not. */
export function judgeZoom(img) {
  const offered = img.hasAttribute(ZOOM_MARK);
  if (!offered && KEYED.some((name) => img.hasAttribute(name))) return; // a control of the author's own
  if (img.isConnected && !editing(img.ownerDocument) && zoomable(img)) {
    const alt = img.getAttribute("alt")?.trim();
    const label = alt ? say("open-image-named", alt) : say("open-image");
    if (!offered) {
      img.setAttribute(ZOOM_MARK, "");
      img.setAttribute("tabindex", "0");
      img.setAttribute("role", "button");
      img.setAttribute("aria-haspopup", "dialog");
    }
    if (img.getAttribute("aria-label") !== label) img.setAttribute("aria-label", label);
  } else if (offered) {
    for (const name of [ZOOM_MARK, ...KEYED]) img.removeAttribute(name);
  }
}

/** A picture of the page judged again as it changes (DocKit's instance): its size, its load, an element around it shown. */
export function watchZoom(img, context) {
  watched.add(img);
  const again = () => judgeZoom(img);
  img.addEventListener("load", again, { signal: context.signal });
  again();
  return { update: again, destroy: () => watched.delete(img) };
}

/** The size the viewer shows a picture at: its own (`natural`, or the shape it is `shown` in), the window, its caption's height. */
export function zoomFit({ natural, shown, window: room, caption = 0 }) {
  const gap = room.width >= 1020 ? 48 : 16;
  const width = Math.max(1, room.width - 2 * gap);
  const height = Math.max(1, room.height - 2 * gap - (caption > 0 ? caption + 12 : 0));
  // A picture of no size of its own (an SVG without one) is as large as the window lets its shape be.
  if (!(natural.width > 0 && natural.height > 0)) {
    const ratio = shown.width > 0 && shown.height > 0 ? shown.width / shown.height : 1;
    const across = Math.min(width, height * ratio);
    return { width: Math.round(across), height: Math.round(across / ratio) };
  }
  const scale = Math.min(1, width / natural.width, height / natural.height);
  return { width: Math.round(natural.width * scale), height: Math.round(natural.height * scale) };
}

/** The picture `img` open large over the page; returns the viewer's dialog. */
export function openZoom(img) {
  closeZoom();
  const doc = img.ownerDocument;
  const win = doc.defaultView;
  const root = doc.documentElement;
  const dialog = doc.createElement("dialog");
  dialog.className = "doc-zoom";
  const words = zoomCaption(img);
  dialog.setAttribute("aria-label", img.getAttribute("alt")?.trim() || words?.textContent.trim() || say("view-image"));
  const picture = doc.createElement("img");
  picture.className = "doc-zoom-picture";
  picture.alt = img.getAttribute("alt") ?? "";
  picture.draggable = false;
  for (const name of ["crossorigin", "referrerpolicy"]) if (img.hasAttribute(name)) picture.setAttribute(name, img.getAttribute(name));
  picture.src = img.currentSrc || img.src;
  let caption = null;
  if (words) {
    caption = doc.createElement("div");
    caption.className = "doc-zoom-caption";
    for (const node of words.childNodes) caption.append(node.cloneNode(true));
    caption.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  }
  const close = doc.createElement("button");
  close.type = "button";
  close.className = "doc-zoom-close";
  close.setAttribute("aria-label", say("close"));
  // The focus on the viewer itself (no ring: a picture opened by the pointer shows none),
  // the close button the next stop of Tab; the page under it inert.
  dialog.tabIndex = -1;
  dialog.append(picture, ...(caption ? [caption] : []), close);

  const v = { dialog, picture, caption, from: img, focus: doc.activeElement, keys: null, fit: null };
  viewer = v;
  v.fit = () => {
    const box = img.getBoundingClientRect();
    const size = zoomFit({
      natural: { width: picture.naturalWidth, height: picture.naturalHeight },
      shown: { width: box.width, height: box.height },
      window: { width: win.innerWidth, height: win.innerHeight },
      caption: caption ? caption.offsetHeight : 0,
    });
    picture.style.width = `${size.width}px`;
    picture.style.height = `${size.height}px`;
  };
  // Esc closes the viewer and goes no further: not to a detail card under it, nor to the page the
  // report is shown in (演示视图 ends on Esc), which listen on the window.
  v.keys = (event) => {
    if (event.key !== "Escape" || event.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    closeZoom();
  };
  dialog.addEventListener("click", (event) => {
    if (event.target === picture || event.target.closest?.(".doc-zoom-caption a[href]")) return;
    closeZoom();
  });
  dialog.addEventListener("close", () => finish(v));
  picture.addEventListener("load", v.fit);
  win.addEventListener("keydown", v.keys, true);
  win.addEventListener("resize", v.fit);

  const scrollbar = win.innerWidth - root.clientWidth > 0;
  unmark(root, HOVER);
  root.classList.add(OPEN);
  if (scrollbar) root.classList.add(GUTTER);
  doc.body.append(dialog);
  if (typeof dialog.showModal === "function") dialog.showModal(); // which focuses the close button, the first that takes it
  else dialog.setAttribute("open", "");
  dialog.focus({ preventScroll: true });
  v.fit();
  return dialog;
}

/** The viewer closed, if one is open. */
export function closeZoom() {
  const v = viewer;
  if (!v) return;
  if (v.dialog.open && typeof v.dialog.close === "function") v.dialog.close(); // its close event finishes it
  else finish(v);
}

// The viewer gone: its element, the window's listeners, the page's classes; the focus back where it was.
function finish(v) {
  if (viewer !== v) return;
  viewer = null;
  const doc = v.dialog.ownerDocument;
  const win = doc.defaultView;
  win?.removeEventListener("keydown", v.keys, true);
  win?.removeEventListener("resize", v.fit);
  v.dialog.remove();
  unmark(doc.documentElement, OPEN, GUTTER);
  const back = v.focus;
  if (back && back !== doc.body && back.isConnected && typeof back.focus === "function") back.focus({ preventScroll: true });
}

/** Pictures that open large, from now on, in `doc`: a click opens one, the pointer over one shows that it does, Enter or Space on one the keyboard reached opens it. */
export function startZoom(doc) {
  const win = doc.defaultView;
  const root = doc.documentElement;
  doc.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const img = event.target;
    if (img?.localName !== "img" || editing(doc) || printing(win) || !zoomable(img)) return;
    event.preventDefault();
    openZoom(img);
  });
  doc.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.isComposing || event.repeat || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    const img = event.target;
    if (img?.localName !== "img" || !img.hasAttribute(ZOOM_MARK) || viewer || editing(doc) || printing(win) || !zoomable(img)) return;
    event.preventDefault(); // Space scrolls nothing
    openZoom(img);
  });
  // The page edited, or read again: the marks off, or on again.
  new win.MutationObserver(() => watched.forEach(judgeZoom)).observe(root, { attributes: true, attributeFilter: ["data-ge-editing"] });
  // The zoom-in cursor on a picture that opens, and on no other: whether one does is the rule's
  // (its size among it), which no selector says.
  doc.addEventListener("pointerover", (event) => {
    const img = event.target;
    if (img?.localName === "img" && !viewer && !editing(doc) && zoomable(img)) root.classList.add(HOVER);
  });
  doc.addEventListener("pointerout", (event) => {
    if (event.target?.localName === "img" && root.classList.contains(HOVER)) unmark(root, HOVER);
  });
  win.addEventListener("beforeprint", () => closeZoom());
}
