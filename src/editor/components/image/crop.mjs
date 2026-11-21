import { Z } from "../../../shared/layers.mjs";
import { addStyle, element, mount, textButton } from "../../page/ui.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// 裁剪图片: a dialog over the page, the
// picture in it at most 70vw × 75vh, a box over it marking what is kept (the rest dimmed): dragged
// to move it, by a corner to size it, at least 32px and never past the picture; 自由 or a shape
// (1:1, 4:3, 3:2, 16:9: the box keeps it). It may start from the picture a cropped one was cropped
// from, with the box kept then (`from`: { src, crop }, the original and the crop), so what was
// cut away can be brought back. 保存 draws what is kept onto a canvas, at most 2000px wide, as a PNG
// for `save(blob, kept)` (kept: "x y width height" in % of the picture; null, the blob too, when the
// whole picture is kept: page.mjs puts the original back); 取消, Esc or a click beside the dialog
// closes it, nothing saved.

const STYLE = `
  .ge-crop { position: fixed; inset: 0; z-index: ${Z.viewer}; display: flex; align-items: center; justify-content: center; background: rgb(15 15 15 / 60%); user-select: none;
    font: 14px/1.2 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
  .ge-crop-dialog { display: flex; flex-direction: column; max-width: calc(100vw - 48px); border-radius: var(--ge-r-shell); overflow: hidden; background: var(--ge-bg); color: var(--ge-tx);
    box-shadow: 0 0 0 1px var(--ge-outline), 0 20px 40px rgb(0 0 0 / 30%); }
  .ge-crop-bar { display: flex; align-items: center; gap: 6px; padding: 10px 12px; border-bottom: 1px solid var(--ge-line); }
  .ge-crop-title { flex: 1; text-align: center; font-weight: 500; white-space: nowrap; }
  .ge-crop-shape { height: 28px; padding: 0 10px; border: 0; border-radius: var(--ge-r-ctl); background: transparent; color: var(--ge-tx2); font: inherit; cursor: pointer; }
  /* The shape chosen: the gray of a chosen tab (no blue for a choice), deeper under the pointer; any pressed deeper still. */
  .ge-crop-shape[aria-pressed="true"] { background: var(--ge-hover); color: var(--ge-tx); }
  .ge-crop-shape:hover { background: var(--ge-hover); }
  .ge-crop-shape[aria-pressed="true"]:hover, .ge-crop-shape:active { background: var(--ge-press); }
  .ge-crop-body { display: flex; justify-content: center; padding: 30px; background: light-dark(#f7f6f3, #1f1f1f); }
  .ge-crop-stage { position: relative; overflow: hidden; }
  .ge-crop-stage > img { display: block; max-width: 70vw; max-height: 75vh; pointer-events: none; }
  .ge-crop-box { position: absolute; cursor: move; box-shadow: 0 0 0 9999px rgb(255 255 255 / 50%), inset 0 0 0 1px rgb(0 0 0 / 10%), 0 0 0 1px rgb(255 255 255 / 50%); }
  .ge-crop-corner { position: absolute; width: 20px; height: 20px; }
  .ge-crop-corner::after { content: ""; position: absolute; inset: 0; border: 0 solid rgb(255 255 255 / 90%); filter: drop-shadow(0 0 1px rgb(0 0 0 / 60%)); }
  .ge-crop-corner[data-at="nw"] { left: -2px; top: -2px; cursor: nwse-resize; } .ge-crop-corner[data-at="nw"]::after { border-width: 3px 0 0 3px; }
  .ge-crop-corner[data-at="ne"] { right: -2px; top: -2px; cursor: nesw-resize; } .ge-crop-corner[data-at="ne"]::after { border-width: 3px 3px 0 0; }
  .ge-crop-corner[data-at="sw"] { left: -2px; bottom: -2px; cursor: nesw-resize; } .ge-crop-corner[data-at="sw"]::after { border-width: 0 0 3px 3px; }
  .ge-crop-corner[data-at="se"] { right: -2px; bottom: -2px; cursor: nwse-resize; } .ge-crop-corner[data-at="se"]::after { border-width: 0 3px 3px 0; }
`;

const SHAPES = [[t("自由"), null], ["1:1", 1], ["4:3", 4 / 3], ["3:2", 3 / 2], ["16:9", 16 / 9]];
const MIN = 32;
const MAX_EXPORT = 2000;

let open = null; // { node, keys }

/** Crop `img` (an image block's picture), from `from` when given; `save(blob, kept)` gets the PNG of what is kept. */
export function openCrop(img, save, from = {}) {
  addStyle(STYLE);
  closeCrop();
  const picture = element("img", { src: from.src ?? img.src, alt: "", draggable: "false" });
  const box = element("div", { class: "ge-crop-box" }, ...["nw", "ne", "sw", "se"].map((at) => element("div", { class: "ge-crop-corner", "data-at": at })));
  const stage = element("div", { class: "ge-crop-stage" }, picture, box);
  const shapes = SHAPES.map(([label, ratio]) => {
    const button = element("button", { type: "button", class: "ge-crop-shape", "aria-pressed": String(ratio === null), text: label });
    button.addEventListener("click", () => shape(ratio, button));
    return button;
  });
  const cancel = textButton(t("取消"), null, { class: "ge-crop-cancel" });
  const done = textButton(t("保存"), null, { class: "ge-crop-save", primary: true });
  const dialog = element("div", { class: "ge-crop-dialog", role: "dialog", "aria-label": t("裁剪图片") },
    element("div", { class: "ge-crop-bar" }, ...shapes, element("div", { class: "ge-crop-title", text: t("裁剪图片") }), cancel, done),
    element("div", { class: "ge-crop-body" }, stage));
  const node = mount(element("div", { class: "ge-crop" }, dialog));
  let rect = null; // the box, in the picture's shown pixels: { x, y, w, h }
  let ratio = null;
  const size = () => ({ w: picture.clientWidth, h: picture.clientHeight });
  const paint = () => Object.assign(box.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` });
  // The box kept last time, or the whole picture.
  const start = () => {
    const { w, h } = size();
    const kept = from.crop;
    rect = kept ? { x: (kept.x / 100) * w, y: (kept.y / 100) * h, w: (kept.width / 100) * w, h: (kept.height / 100) * h } : { x: 0, y: 0, w, h };
    paint();
  };
  if (picture.complete && picture.naturalWidth) start();
  else picture.addEventListener("load", start, { once: true });

  // A shape: the box keeps its left, top and width, its height following, made smaller to fit.
  function shape(value, button) {
    ratio = value;
    shapes.forEach((each) => each.setAttribute("aria-pressed", String(each === button)));
    if (!ratio || !rect) return;
    const { w, h } = size();
    let width = rect.w;
    let height = width / ratio;
    if (rect.y + height > h) {
      height = h - rect.y;
      width = height * ratio;
    }
    if (rect.x + width > w) {
      width = w - rect.x;
      height = width / ratio;
    }
    rect = { ...rect, w: width, h: height };
    paint();
  }

  // Dragging the box moves it; dragging a corner sizes it from the opposite one.
  box.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !rect) return;
    event.preventDefault();
    const at = event.target.closest(".ge-crop-corner")?.getAttribute("data-at") ?? null;
    const from = { x: event.clientX, y: event.clientY, rect: { ...rect } };
    const { w, h } = size();
    box.setPointerCapture?.(event.pointerId);
    const move = (moving) => {
      const dx = moving.clientX - from.x;
      const dy = moving.clientY - from.y;
      const was = from.rect;
      if (!at) {
        rect = { ...was, x: Math.max(0, Math.min(w - was.w, was.x + dx)), y: Math.max(0, Math.min(h - was.h, was.y + dy)) };
      } else {
        // The corner opposite stays; the one dragged follows, inside the picture.
        const left = at.includes("w");
        const top = at.includes("n");
        const fixedX = left ? was.x + was.w : was.x;
        const fixedY = top ? was.y + was.h : was.y;
        let x = Math.max(0, Math.min(w, (left ? was.x : was.x + was.w) + dx));
        let y = Math.max(0, Math.min(h, (top ? was.y : was.y + was.h) + dy));
        let width = Math.max(MIN, Math.abs(x - fixedX));
        let height = Math.max(MIN, Math.abs(y - fixedY));
        if (ratio) {
          height = width / ratio;
          const room = top ? fixedY : h - fixedY;
          if (height > room) {
            height = room;
            width = height * ratio;
          }
        }
        width = Math.min(width, left ? fixedX : w - fixedX);
        height = Math.min(height, top ? fixedY : h - fixedY);
        rect = { x: left ? fixedX - width : fixedX, y: top ? fixedY - height : fixedY, w: width, h: height };
      }
      paint();
    };
    const up = () => {
      box.removeEventListener("pointermove", move);
      box.removeEventListener("pointerup", up);
      box.removeEventListener("pointercancel", up);
    };
    box.addEventListener("pointermove", move);
    box.addEventListener("pointerup", up);
    box.addEventListener("pointercancel", up);
  });

  // 保存: what is kept, drawn from the picture's own pixels (2000px wide at most), as a PNG, and where
  // it is in the picture; the whole picture kept is none.
  done.addEventListener("click", () => {
    if (!rect) return;
    const { w, h } = size();
    if (rect.x < 1 && rect.y < 1 && rect.w > w - 1 && rect.h > h - 1) {
      closeCrop();
      return save(null, null);
    }
    const share = (value, of) => Math.round((value / of) * 100000) / 1000;
    const kept = [share(rect.x, w), share(rect.y, h), share(rect.w, w), share(rect.h, h)].map((value) => String(Math.min(100, value))).join(" ");
    const scale = picture.naturalWidth / picture.clientWidth;
    const source = { x: rect.x * scale, y: rect.y * scale, w: rect.w * scale, h: rect.h * scale };
    const out = Math.min(1, MAX_EXPORT / source.w);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(source.w * out));
    canvas.height = Math.max(1, Math.round(source.h * out));
    canvas.getContext("2d").drawImage(picture, source.x, source.y, source.w, source.h, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      closeCrop();
      if (blob) save(blob, kept);
    }, "image/png");
  });
  cancel.addEventListener("click", closeCrop);
  node.addEventListener("pointerdown", (event) => { if (event.target === node) closeCrop(); });
  const keys = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeCrop();
    } else if (!event.target.closest?.(".ge-crop")) event.stopPropagation();
  };
  document.addEventListener("keydown", keys, true);
  open = { node, keys };
}

/** The crop dialog gone, nothing saved. */
function closeCrop() {
  if (!open) return;
  document.removeEventListener("keydown", open.keys, true);
  open.node.remove();
  open = null;
}
