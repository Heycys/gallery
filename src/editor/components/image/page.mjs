import { MEDIA_CLASS } from "../../../shared/components/index.mjs";
import { IN_LAYER } from "../../../shared/layers.mjs";
import { SPAN, SPAN_SIZE, UPLOAD_LIMITS, sizeLimit } from "../../../shared/media.mjs";
import { cancelOnEscape, endsGesture, gestureLock } from "../../page/gesture.mjs";
import { openCrop } from "./crop.mjs";
import { openViewer } from "./viewer.mjs";
import { svg } from "../icons.mjs";
import { closePopup, openPopup } from "../../page/emoji-picker/support.mjs";
import { ICONS } from "../../page/menu.mjs";
import { onSettle, own } from "../../page/overlays.mjs";
import { drawAt, shapeOf } from "../../page/overlay-layer.mjs";
import { keptByComponent } from "../../page/page-objects.mjs";
import { addStyle, element } from "../../page/ui.mjs";
import { TOOL_ICONS } from "../media/icons.mjs";
import { barClass } from "../placeholder-bar.mjs";
import { captionOf, fileOf } from "../media/parts.mjs";
import { SNAP, columnRoom, readingRoom } from "../media/size.mjs";
import { mediaBar, toolButton } from "../media/toolbar.mjs";
import { ALIGN, cropOf, imageOf, newImage, pictureParts } from "./index.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { zoomable } from "../../../shared/zoom.mjs";

// 图片 on the page (one of the media blocks, ../media/). A new image (the "/"
// menu's 图片, made from an empty block: convert.mjs) is a placeholder, a gray bar saying 添加图片,
// until a picture is chosen in the 上传 / 链接 menu (media-menu/) that opens below it at once and on
// a click (../media/page.mjs): a file (an image, 10 MB at most) goes to the report's folder, a link's picture is
// downloaded there by the server (an export never reaches the web); either is one undo step. The
// picture shows where the server serves the folder; what the file is stays in data-ge-src.
// A click on a picture selects its image (`click`); while it is the one block selected (however it
// was: the click, its handle, the keys, a picture just put in) a short gray L stands at each of the
// picture's corners (the user's, 2026-11-09: four corner handles drawn as Ls) and the
// toolbar at its top right, moved in clear of them (对齐, 标题, 展开, 更多: the block menu), both
// placed in the block tools' frames (`blockTools` follow, ../../page/blocks.mjs). Dragging a corner
// resizes the picture, its shape kept (by how far the pointer moves across, the left
// corners the other way, twice while centered), a share of the reading width, at most the width it
// stands in, snapping to the whole of that width (a share of 1: styles/sizes.css), one undo step on
// letting go (Esc puts it back). An L is a gray line with a thin edge of the page's color around it, so it
// reads on a black picture in light mode and a white one in dark mode (the old side bars, a gray of
// the page's ink, did not). 标题 shows its caption (empty ones show only then) with the caret in it;
// Enter there makes a paragraph after the image. A double-click on the picture (or on any other picture
// that opens large: a table's, a card's), or 展开, shows it alone over the page (a click or Esc closes
// it). The block menu has what the toolbar has not: 同步宽度到全局 first (every other image of the
// page as wide as this one, one undo step), 替换图片, 复制图片, 恢复原始大小, 裁剪图片 and 下载 (menuItems). A
// picture pasted (an image file on the clipboard) becomes an image below the block the caret is in
// (`acceptsFile`, `fromFiles`); one dropped in from outside, or a picture of another page, an image where
// the drop goes (`forFile`, `forPicture`: page/drop-in/), or the picture of an empty one it is let go on
// (`takesDrop`, `takeDrop`), as a file dropped on its 上传 menu is.

const MAX_BYTES = UPLOAD_LIMITS.image;
// 裁剪图片's row: a crop mark, drawn as the menus' other icons are.
const CROP_ICON = svg('<path d="M6 2.75V13a1 1 0 0 0 1 1h10.25"/><path d="M2.75 6H13a1 1 0 0 1 1 1v10.25"/>');
// 同步宽度到全局's row: a width (an arrow both ways) over two pictures as wide as each other.
const SYNC_ICON = svg('<path d="M4 4.25h12M6 2.5 4 4.25 6 6M14 2.5l2 1.75L14 6"/><rect x="3.75" y="8.25" width="12.5" height="3.5" rx="1"/><rect x="3.75" y="14" width="12.5" height="3.5" rx="1"/>');

// A corner's grip: a box of GRIP px, the picture's corner AT px in from the box's outer corner, an L
// whose lines run ARM px along the picture's two edges from its corner, centered a little outside them.
const GRIP = 24;
const AT = 8;
const ARM = 12;
const L_PATH = `M${AT - 1} ${AT - 1 + ARM}V${AT - 1}h${ARM}`; // drawn for the top left; the others mirror it
// The corners: which way each mirrors the top left's L, and its cursor.
const CORNERS = {
  nw: { x: "left", y: "top", cursor: "nwse" },
  ne: { x: "right", y: "top", cursor: "nesw" },
  sw: { x: "left", y: "bottom", cursor: "nesw" },
  se: { x: "right", y: "bottom", cursor: "nwse" },
};
const INSET = 16; // how far the toolbar stands from the picture's top and from its right edge, the same each way (the user's, 2026-11-09: the top as far as the right): clear of the L's arms and of the top right grip's box, which reaches GRIP - AT = 16px in
const GAP = 6; // how far it stands above the picture when it does not fit in

const STYLE = `
  /* The placeholder of an image with no picture yet: every empty block's, served with the page (../placeholder.mjs). */
  [data-ge-editing] .doc-image > img { cursor: default; }
  /* The toolbar is the media blocks' (../media/toolbar.mjs). */
  .ge-image-align { display: flex; align-items: center; padding: 2px; border-radius: var(--ge-r-ctl); background: var(--c-popBac); box-shadow: var(--ge-shadow-bar); }
  .ge-image-align-sep { width: 1px; height: 16px; margin: 0 2px; background: var(--ca-borSecTra); }
  /* The corners' grips: a short gray L, round at its ends, no edge round it (the user, 2026-11-09): a
     neutral gray that reads on a black picture and a white one alike (4.5 to 1 on each), with a soft
     shadow for a picture of its own gray; darker (lighter) under the pointer and while it is dragged.
     No border, no fill. */
  .ge-layer > .ge-image-grip { pointer-events: auto; z-index: ${IN_LAYER.button}; } /* over the image's fill: it is selected */
  .ge-image-grip { width: ${GRIP}px; height: ${GRIP}px; --ge-grip-line: #767676; filter: drop-shadow(0 0 2px rgb(0 0 0 / 42%)); }
  .ge-image-grip[data-cursor="nwse"] { cursor: nwse-resize; }
  .ge-image-grip[data-cursor="nesw"] { cursor: nesw-resize; }
  .ge-image-grip svg { display: block; width: ${GRIP}px; height: ${GRIP}px; fill: none; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
  .ge-image-grip[data-corner="ne"] svg { transform: scaleX(-1); }
  .ge-image-grip[data-corner="sw"] svg { transform: scaleY(-1); }
  .ge-image-grip[data-corner="se"] svg { transform: scale(-1); }
  .ge-image-grip-line { stroke: var(--ge-grip-line); stroke-width: 3; transition: stroke 120ms ease; }
  .ge-image-grip:hover, .ge-image-grip[data-on] { --ge-grip-line: light-dark(#4f4d49, #d3d1cb); }
  ${gestureLock('data-ge-image-resize="nwse"', { cursor: "nwse-resize", select: true })}
  ${gestureLock('data-ge-image-resize="nesw"', { cursor: "nesw-resize", select: true })}
`;

const ALIGNS = [["left", t("左对齐"), "alignLeft"], ["center", t("居中对齐"), "alignCenter"], ["right", t("右对齐"), "alignRight"]];
const sideOf = (figure) => figure.classList.contains(ALIGN[0]) ? "left" : figure.classList.contains(ALIGN[1]) ? "right" : "center";
const sideLook = (side) => ({ classes: { [ALIGN[0]]: side === "left", [ALIGN[1]]: side === "right" } });

/**
 * Images on the page, with what the editor gives them: the media blocks' shared parts (`pages.media`:
 * ../media/page.mjs block("image"): the undo steps, say, active(), select, the block menu, the
 * upload of kind "image", the menu, the caption) and assetUrl(path) (where the server serves a file
 * of the report's folder), and copyPicture(unit) (复制图片: clipboard/picture.mjs).
 */
export function create({ pages, assetUrl, copyPicture = async () => false }) {
  const media = pages.media.block("image");
  const { say, active, look, openMenu } = media;
  addStyle(STYLE);

  // ---------- a picture chosen ----------

  /** The 上传 / 链接 menu of an image, below its placeholder (or its picture: 替换图片). */
  const pick = (figure) => media.pick(figure, {
    width: 360, // a menu 540 wide stood far out past the block
    tabs: [{ key: "upload", label: t("上传") }, { key: "link", label: t("链接") }],
    upload: { label: t("上传文件"), accept: "image/*" },
    link: { placeholder: t("粘贴图片链接…"), button: t("嵌入图片"), caption: t("适用于网络上的任何图片。") },
    onUpload: (file) => uploadInto(figure, file),
    onEmbed: (url) => fetchInto(figure, url),
  }, (each) => each.querySelector(`:scope > .${barClass(MEDIA_CLASS.image)}`) ?? imageOf(each) ?? each);

  // Why a file cannot be an image's picture (not a picture, too big), or null.
  const refusal = (file) => (!/^image\//.test(file.type) ? t("很抱歉，不支持该文件类型。") : file.size > MAX_BYTES ? t("图片太大（最多 {0}）。", sizeLimit("image")) : null);

  async function uploadInto(figure, file, options = {}) {
    const refused = refusal(file);
    if (refused) return say(refused, "error");
    return media.attempt(figure, t("正在上传…"), t("无法上传这张图片"), async () => {
      const pixels = await pixelSize(file);
      place(figure, (await media.uploadFile(file)).path, pixels, options);
    });
  }

  // A picture's size in pixels ({ width, height }), or null when the browser cannot read it.
  async function pixelSize(file) {
    try {
      const bitmap = await createImageBitmap(file);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    } catch {
      return null;
    }
  }
  // The share of the reading width that `pixels` take on this screen, or "" for the kit's own size:
  // a picture as wide as the width `figure` stands in or wider, or one that would stand taller than
  // 80% of this window (a phone's screenshot), which the kit shows at most that tall on every
  // reader's window (styles/image.css), where a span would hold it at its width however tall.
  function naturalShare(figure, pixels) {
    if (!pixels?.width) return "";
    const room = columnRoom(figure);
    const ratio = devicePixelRatio || 1;
    const width = pixels.width / ratio;
    if (!(room > 0) || width >= room || pixels.height / ratio > innerHeight * 0.8) return "";
    return String(Math.max(SPAN_SIZE.min, Math.round((width / readingRoom(figure)) * 1000) / 1000));
  }

  const fetchInto = (figure, url, options = {}) => media.attempt(figure, t("正在下载…"), t("无法下载这张图片"), async () => {
    place(figure, (await media.uploadUrl(url)).path, null, options);
  });

  // The picture in: a new image in the place of the placeholder, or of the image that had one
  // (替换图片, with its caption, side and width), never the same element, so that undo brings back
  // what stood there (a placeholder never written, an image as it was) and the file loses the new
  // one. One undo step; the image selected.
  //
  // A new picture from this computer (`pixels`: its size in pixels) shows as large as it was on the
  // screen it was taken on (decided 2026-10-16): its pixels over this screen's device pixel ratio,
  // as a share of the reading width, never past the width it stands in (a screenshot on a high-density
  // screen once showed twice its size); one that tall is left to the kit's 80% of the window
  // (naturalShare). A picture replaced keeps the width the old one had.
  // `cropped`: { original, crop } said on the picture (a crop's); `quiet`: its own word said by the caller.
  function place(figure, path, pixels = null, { cropped = null, quiet = false, pasted = false } = {}) {
    if (!figure.isConnected) return;
    const doc = figure.ownerDocument;
    const replacing = Boolean(imageOf(figure));
    const next = newImage(doc);
    next.className = figure.className;
    const span = figure.style.getPropertyValue(SPAN) || (replacing ? "" : naturalShare(figure, pixels));
    if (span) next.style.setProperty(SPAN, span);
    next.replaceChildren(...pictureParts(doc, path, assetUrl(path), captionOf(figure)?.innerHTML ?? "", cropped));
    media.place(figure, next, { replacing, pasted });
    if (replacing && !quiet) say(t("已替换图片 · Ctrl+Z 撤销"));
  }

  // ---------- the toolbar and the corners' grips ----------

  let shown = null; // the image whose tools show: the one block selected
  let resizing = null; // { figure, corner, x, start, room, page, before, centered }
  let aligning = null; // the 对齐 popover open, a press in which keeps the image selected
  const bar = mediaBar(t("图片操作"));
  const tool = (label, tip, icon, run) => toolButton({ label, tip, icon, run, alive: () => shown?.isConnected });
  const tools = {
    align: tool(t("对齐方式"), t("设置区块对齐"), () => TOOL_ICONS[{ left: "alignLeft", center: "alignCenter", right: "alignRight" }[sideOf(shown)]], (button) => alignPopup(shown, button)),
    caption: tool(t("标题@caption"), t("添加标题"), TOOL_ICONS.caption, () => media.caption(shown)),
    expand: tool(t("展开"), t("全屏查看"), TOOL_ICONS.expand, () => view(shown)),
    more: tool(t("更多"), t("打开区块操作菜单"), TOOL_ICONS.more, (button) => {
      const rect = button.getBoundingClientRect();
      openMenu(shown, { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
    }),
  };
  bar.append(...Object.values(tools));
  const lines = `<svg viewBox="0 0 ${GRIP} ${GRIP}" aria-hidden="true"><path class="ge-image-grip-line" d="${L_PATH}"/></svg>`;
  const grips = Object.fromEntries(Object.entries(CORNERS).map(([corner, { cursor }]) => {
    const grip = element("div", { class: "ge-image-grip", "data-corner": corner, "data-cursor": cursor, "aria-hidden": "true" });
    grip.innerHTML = lines;
    return [corner, grip];
  }));
  const nodes = () => [bar, ...Object.values(grips)];

  // The toolbar and the grips over the picture of `figure`, or away. The toolbar stands at the
  // picture's top right, INSET from its top and from its right edge; on a picture too narrow to hold
  // it with that room each side, above the picture, its right edge on the picture's.
  function show(figure) {
    shown = figure;
    const img = figure && imageOf(figure);
    const shape = img && shapeOf(img);
    if (!shape) {
      shown = null;
      for (const node of nodes()) node.remove();
      return;
    }
    const alive = () => shown === figure && figure.isConnected;
    for (const node of nodes()) own(node, "image tools", { owner: figure, alive });
    for (const button of Object.values(tools)) button.draw();
    const { rect, layer } = shape;
    tools.align.style.display = figure.style.getPropertyValue(SPAN).trim() === "1" ? "none" : ""; // a picture as wide as it can be has no side
    if (bar.parentNode !== layer) layer.append(bar); // in the page before its width is measured
    const fits = rect.right - rect.left >= bar.offsetWidth + 2 * INSET;
    drawAt(bar, layer, fits ? rect.right - INSET - bar.offsetWidth : rect.right - bar.offsetWidth, fits ? rect.top + INSET : rect.top - AT - GAP - bar.offsetHeight);
    for (const [corner, grip] of Object.entries(grips)) {
      const { x, y } = CORNERS[corner];
      drawAt(grip, layer, x === "left" ? rect.left - AT : rect.right - GRIP + AT, y === "top" ? rect.top - AT : rect.bottom - GRIP + AT);
    }
  }

  // The image the tools stand for, from the blocks selected (the block tools' frame): one image with
  // its picture, not one a component keeps; while a corner is dragged, the one dragged.
  function follow(picked) {
    if (resizing) return show(resizing.figure);
    const [one] = picked.length === 1 ? picked : [];
    const figure = one?.matches?.("figure.doc-image") && imageOf(one) && active() && !keptByComponent(one) ? one : null;
    if (figure || shown) show(figure);
  }
  // The picture taken off the page by an undo, a redo or a commit: the tools go at once, not at the next frame.
  onSettle(() => { if (shown && !shown.isConnected && !resizing) show(null); });

  // Dragging a corner: the picture's width as a share of the reading width, at most the width it
  // stands in (1 when it reaches that), live, its height following (its shape kept): by how far the
  // pointer moves across, the left corners the other way, twice while centered (it grows on both sides). One undo step on letting go; Esc, or the press cancelled, puts it back.
  for (const [corner, grip] of Object.entries(grips)) {
    grip.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || !shown || resizing) return;
      event.preventDefault();
      const figure = shown;
      resizing = { figure, corner, x: event.clientX, start: imageOf(figure).getBoundingClientRect().width, room: columnRoom(figure), page: readingRoom(figure), before: figure.style.getPropertyValue(SPAN), centered: sideOf(figure) === "center" };
      grip.setPointerCapture?.(event.pointerId);
      grip.setAttribute("data-on", "");
      document.documentElement.setAttribute("data-ge-image-resize", CORNERS[corner].cursor);
    });
    grip.addEventListener("pointermove", (event) => {
      if (resizing?.corner !== corner) return;
      const { figure, x, start, room, page, centered } = resizing;
      const delta = (event.clientX - x) * (CORNERS[corner].x === "right" ? 1 : -1) * (centered ? 2 : 1);
      const width = Math.max(Math.min(room, page * SPAN_SIZE.min), Math.min(room, start + delta));
      figure.style.setProperty(SPAN, room - width <= SNAP ? "1" : String(Math.round((width / page) * 1000) / 1000));
      show(figure);
    });
    grip.addEventListener("pointerup", () => endResize(true));
    grip.addEventListener("pointercancel", () => endResize(false));
    grip.addEventListener("lostpointercapture", () => endResize(true));
  }
  // The drag over: the width it had back on the page, then (`keep`) the one dragged to as one undo step.
  function endResize(keep) {
    if (!resizing) return;
    const { figure, before } = resizing;
    resizing = null;
    for (const grip of Object.values(grips)) grip.removeAttribute("data-on");
    document.documentElement.removeAttribute("data-ge-image-resize");
    const after = figure.style.getPropertyValue(SPAN);
    if (before) figure.style.setProperty(SPAN, before);
    else figure.style.removeProperty(SPAN);
    if (keep && after !== before && look(figure, { sizes: { [SPAN]: after || null } })) say(t("图片宽度 {0}% · Ctrl+Z 撤销", Math.round(Number(after) * 100)));
    show(figure);
  }
  // Esc gives the drag up and goes no further (the image stays selected); so do the window losing the focus and the page hidden.
  cancelOnEscape({ active: () => Boolean(resizing), cancel: () => endResize(false) });
  endsGesture({ active: () => Boolean(resizing), cancel: () => endResize(false), owns: () => false });

  // 对齐: a small popover of the three sides, under its button.
  function alignPopup(figure, button) {
    const el = document.createElement("div");
    el.className = "ge-image-align";
    el.setAttribute("data-doc-dev", "");
    const current = sideOf(figure);
    el.innerHTML = ALIGNS.map(([side, label, name], index) => `${index ? '<div class="ge-image-align-sep"></div>' : ""}<div role="button" class="ge-media-tool"${side === current ? " data-on" : ""} data-side="${side}" aria-label="${label}">${TOOL_ICONS[name]}</div>`).join("");
    el.addEventListener("mousedown", (event) => event.preventDefault());
    el.addEventListener("click", (event) => {
      const side = event.target.closest("[data-side]")?.dataset.side;
      if (!side) return;
      closePopup(popup);
      align(figure, side);
    });
    const rect = button.getBoundingClientRect();
    const popup = openPopup({ origin: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }, placement: "bottom", align: "center", gap: 8, content: el });
    aligning = el;
  }

  function align(figure, side) {
    if (look(figure, sideLook(side))) say(t("已{0} · Ctrl+Z 撤销", ALIGNS.find(([each]) => each === side)[1]));
    if (shown === figure) show(figure);
  }

  // 同步宽度到全局: every other image of the page (with its picture, not one a component keeps) as wide
  // as this one shows, one undo step (undo selects this one again), written as one change. The width is
  // what the picture shows at as a share of the reading width (styles/sizes.css), so a picture with no
  // width of its own, or held narrower by its column, passes on the width it is seen at; the whole
  // reading width is 1. This one is left as it is.
  const others = (figure) => [...document.querySelectorAll("main figure.doc-image")].filter((each) => each !== figure && imageOf(each) && each.matches("[data-ge-unit], [data-ge-new]") && !keptByComponent(each));
  function syncWidths(figure) {
    const img = imageOf(figure);
    if (!img?.isConnected) return;
    const page = readingRoom(figure);
    const width = img.getBoundingClientRect().width;
    const share = page - width <= SNAP ? "1" : String(Math.max(SPAN_SIZE.min, Math.round((width / page) * 1000) / 1000));
    const targets = others(figure).filter((each) => each.style.getPropertyValue(SPAN).trim() !== share);
    if (targets.length === 0 || !look(targets, { sizes: { [SPAN]: share } }, figure)) return say(t("页面上的图片已经都是这个宽度。"));
    say(t("已将 {0} 张图片设为同一宽度 · Ctrl+Z 撤销", targets.length));
  }

  // ---------- the viewer ----------

  // The viewer (viewer.mjs: the wheel zooms, 下载, the page's other pictures), on an image block's picture.
  const view = (figure) => openViewer(imageOf(figure), download);

  // 下载: the picture saved, by the name it has in the report's folder (`img`: an image block's, or
  // any picture the viewer shows).
  async function download(img) {
    if (!img) return;
    const kept = fileOf(img, "src") ?? img.getAttribute("src") ?? "";
    const type = /^data:image\/([a-z+]+)/.exec(kept)?.[1]?.replace("+xml", "") ?? null;
    const name = type ? `image.${type}` : kept.split(/[?#]/)[0].split("/").filter(Boolean).pop() || "image.png";
    try {
      const response = await fetch(img.src);
      if (!response.ok) throw new Error(String(response.status));
      const url = URL.createObjectURL(await response.blob());
      const link = element("a", { href: url, download: name });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      say(t("没能下载这张图片。"), "error");
    }
  }

  // 裁剪图片 (crop.mjs; nothing is lost): the dialog shows the picture it was cropped
  // from, when it was, with the box kept then, so what was cut away can come back. What is kept, a new
  // picture of the report's folder in its place (its caption, side and width kept), that original and
  // the box kept said on it; the whole picture kept, the original back. One undo step.
  function crop(figure) {
    const img = figure && imageOf(figure);
    if (!img) return;
    const original = img.getAttribute("data-original");
    const from = original ?? fileOf(img, "src");
    openCrop(img, async (blob, kept) => {
      if (!figure.isConnected) return;
      try {
        if (!kept) {
          if (!original) return; // nothing cut away, nothing to bring back
          place(figure, original, null, { quiet: true });
          return say(t("已恢复原图 · Ctrl+Z 撤销"));
        }
        place(figure, (await media.uploadFile(blob, "crop.png")).path, null, { cropped: from ? { original: from, crop: kept } : null, quiet: true });
        say(t("已裁剪图片 · Ctrl+Z 撤销"));
      } catch (error) {
        say(t("无法保存裁剪的图片：{0}", error.message), "error");
      }
    }, { src: original ? assetUrl(original) : img.src, crop: original ? cropOf(img.getAttribute("data-crop")) : null });
  }
  // A double-click on a picture that opens large (src/shared/zoom.mjs: an image block's, or one in a
  // table, a card, a column) views it while editing (a double-click on a page that can be edited, a
  // click on one that cannot: the kit's viewer, runtime/zoom.js, leaves a click on the page edited to
  // the editor, which selects the block).
  document.addEventListener("dblclick", (event) => {
    const img = event.target;
    if (img?.localName !== "img" || !active() || !zoomable(img)) return;
    event.preventDefault();
    openViewer(img, download);
  }, true);
  // ---------- the block menu, pasting ----------

  /**
   * An image's rows in its block menu: what its toolbar has not (标题, 对齐 and 展开 are there, and the
   * toolbar shows whenever the image is the one block selected, as it is while its menu is open):
   * 同步宽度到全局 first (where the page has another picture), 替换图片, 复制图片 (a PNG of it on the
   * system clipboard, clipboard/picture.mjs), 恢复原始大小, 裁剪图片, 下载.
   */
  function menuItems(target) {
    if (!target?.matches?.("figure.doc-image") || !imageOf(target)) return [];
    const rows = [];
    if (others(target).length > 0) rows.push({ label: t("同步宽度到全局"), icon: SYNC_ICON, run: () => syncWidths(target) });
    rows.push({ label: t("替换图片"), icon: ICONS.swap, run: () => setTimeout(() => pick(target)) });
    rows.push({ label: t("复制图片"), icon: ICONS.copy, run: () => copyPicture(target) });
    if (target.style.getPropertyValue(SPAN)) rows.push({ label: t("恢复原始大小"), icon: ICONS.reset, run: () => { if (look(target, { sizes: { [SPAN]: null } })) say(t("已恢复原始大小 · Ctrl+Z 撤销")); } });
    rows.push({ label: t("裁剪图片"), icon: CROP_ICON, run: () => setTimeout(() => crop(target)) });
    rows.push({ label: t("下载"), icon: TOOL_ICONS.download, run: () => download(imageOf(target)) });
    return rows;
  }

  /**
   * An image pasted with its picture's address (clipboard/): the picture downloaded into the
   * report's folder (a data: address uploaded), one undo step with the paste (`options`).
   */
  async function fromLink(figure, src, options) {
    if (!/^data:/i.test(src)) return fetchInto(figure, src, options);
    try {
      const blob = await (await fetch(src)).blob();
      return uploadInto(figure, new File([blob], `image.${(blob.type.split("/")[1] ?? "png").replace("svg+xml", "svg").replace("jpeg", "jpg")}`, { type: blob.type }), options);
    } catch {
      return undefined;
    }
  }

  return {
    pick, menuItems, fromLink,
    /** Whether a file makes an image. */
    acceptsFile: (file) => /^image\//.test(file.type),
    /** An image made of `file`, put where the paste puts it (`put`), its picture uploaded; none made for a file it refuses (said). Returns whether it took it. */
    fromFiles: (put, [file]) => (refusal(file) ? (say(refusal(file), "error"), true) : media.paste(put, file, newImage, uploadInto)),
    /** Why `file`, one it takes, cannot go in (too big), or null. */
    refusesFile: refusal,
    /** A new image for `file` dropped in from outside, not on the page yet, and the fill that uploads its picture once it is (page/drop-in/). */
    forFile: (file) => media.forFile(file, newImage, uploadInto),
    /** The same for a picture of another page dropped in (`address`: http(s) or data:), its picture downloaded into the folder. */
    forPicture(address) {
      const figure = newImage(document);
      return { block: figure, fill: () => fromLink(figure, address, { pasted: true }) };
    },
    /** Whether `figure`, an image with no picture yet, takes what is dropped on it: a picture file (`item`: { type }), or a picture of another page ({ address }). */
    takesDrop: (figure, item) => media.empty(figure) && (item.address !== undefined || /^image\//.test(item.type ?? "")),
    /** What is dropped on an empty image put in it, one undo step (`options.pasted`: one with the step before, which put `figure` there): `item`: { file } or { address }. */
    takeDrop: (figure, item, options = {}) => (item.file ? uploadInto(figure, item.file, options) : fromLink(figure, item.address, options)),
    /** A new one: its picture chosen next. */
    onCreated(figure) {
      pick(figure);
      return true;
    },
    /**
     * A click on an image's picture selects the image (its toolbar and grips then show: `blockTools`),
     * the second of a double-click too (its press let go of it; the double-click itself is the
     * viewer's). Returns whether it took the click.
     */
    click(event) {
      const img = event.target;
      const figure = img?.localName === "img" ? img.parentElement : null;
      if (event.button !== 0 || !figure?.matches("main figure.doc-image") || imageOf(figure) !== img || !active() || keptByComponent(figure)) return false;
      media.select(figure);
      return true;
    },
    /** The toolbar and the grips as a part of the block tools: placed in their frames by the blocks selected (`follow`), a press on them keeping the selection (`holds`). */
    blockTools: () => [{
      follow,
      holds: (node) => nodes().some((each) => each.contains(node)) || Boolean(aligning?.isConnected && aligning.contains(node)),
      hide() {
        endResize(false);
        show(null);
      },
    }],
    get nodes() { return nodes().filter((node) => node.isConnected); },
  };
}
