import { Z } from "../../../shared/layers.mjs";
import { hideTooltip, tooltip } from "../../page/tooltip.mjs";
import { addStyleTo, element, mountOver, overlayHost } from "../../page/ui.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { zoomable } from "../../../shared/zoom.mjs";

// The picture over the page: the image's toolbar 展开, its block menu's 全屏查看, and a double-click on a
// picture of the page that opens large (while editing; which pictures is
// src/shared/zoom.mjs's: an image block's, or one in a table, a card, a column; a reader's single
// click opens the kit's viewer instead, runtime/zoom.js, which leaves the page edited alone). The picture fits the
// window (32px around it from 1020px wide), never larger than itself. The wheel zooms around the
// pointer (25% to 400%), as do −, + and the keys − and +; the percentage puts it back to 100%; a
// zoomed picture is dragged about. A bar at the bottom: ‹ › (when the page has more pictures, ← →
// too), −, the percentage, +, 下载, 关闭; it and the pointer hide after two seconds still. Esc, the
// space bar or a click beside the picture closes it. In a workbench it covers the workbench's window
// (ui.mjs overlayHost), its keys heard in either document.

const STYLE = `
  .ge-image-viewer { position: fixed; inset: 0; z-index: ${Z.viewer}; display: flex; align-items: center; justify-content: center; overflow: hidden;
    background: rgb(15 15 15 / 80%); opacity: 0; transition: opacity 150ms; user-select: none; }
  .ge-image-viewer[data-shown] { opacity: 1; }
  /* The picture's own cursor (grab, grabbing) is set inline while it is moved, which only !important beats. */
  .ge-image-viewer[data-idle], .ge-image-viewer[data-idle] img { cursor: none !important; }
  .ge-image-viewer > img { display: block; max-width: none; object-fit: contain; transform-origin: center; transition: transform 80ms ease-out; }
  .ge-viewer-bar { position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%); display: flex; gap: 10px; font: 14px/1 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; transition: opacity 200ms; }
  .ge-image-viewer[data-idle] .ge-viewer-bar { opacity: 0; pointer-events: none; }
  .ge-viewer-group { display: flex; align-items: center; border-radius: 4px; background: rgb(0 0 0 / 62%); }
  .ge-viewer-button { display: flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; padding: 6px; border-radius: 4px; color: #fff; cursor: pointer; transition: background 20ms ease-in; }
  .ge-viewer-button:hover { background: rgb(255 255 255 / 5.5%); }
  .ge-viewer-button[data-off] { opacity: .4; pointer-events: none; }
  .ge-viewer-button svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
  .ge-viewer-zoom { width: 50px; color: rgb(255 255 255 / 50%); font-size: 13px; }
  .ge-viewer-sep { width: 1px; height: 16px; background: rgb(255 255 255 / 28%); }
`;

const icon = (path) => `<svg viewBox="0 0 16 16" aria-hidden="true">${path}</svg>`;
const ICONS = {
  prev: icon('<path d="M13 8H3M7.5 3.5 3 8l4.5 4.5"/>'),
  next: icon('<path d="M3 8h10M8.5 3.5 13 8l-4.5 4.5"/>'),
  out: icon('<path d="M3 8h10"/>'),
  in: icon('<path d="M3 8h10M8 3v10"/>'),
  download: icon('<path d="M8 2.75v7.5M4.75 7.25 8 10.5l3.25-3.25M3 13.25h10"/>'),
  close: icon('<path d="m4 4 8 8M12 4l-8 8"/>'),
};
const ZOOM = { min: 0.25, max: 4 };

let viewer = null; // { node, img, pictures, index, zoom, x, y, moved, timer, keys, wake, host }

/**
 * Open the viewer on `picture` (an <img> of the page); `download(picture)` saves one (page.mjs).
 * The page's pictures that open large are gone through in document order, `picture` among them
 * whatever its size: 展开 and 全屏查看 ask for it by name, so an image block showing its picture under
 * ZOOM_LEAST (a 32px picture at its own size) or one not loaded yet opens too; the double-click goes
 * by the reader's rule (zoomable) before it calls this.
 */
export function openViewer(picture, download) {
  closeViewer();
  const pictures = [...document.querySelectorAll("main img")].filter((img) => img === picture || zoomable(img));
  if (!pictures.includes(picture)) return;
  const host = overlayHost();
  addStyleTo(host.doc, STYLE);
  const img = element("img", { alt: "", draggable: "false" });
  const button = (name, label, text) => {
    const node = element("div", { class: "ge-viewer-button", role: "button", "aria-label": label, "data-act": name });
    if (text) node.textContent = text;
    else node.innerHTML = ICONS[name];
    if (!text) tooltip(node, label, null, { host }); // over the workbench's window where the viewer covers it
    return node;
  };
  const zoomed = button("reset", "100%", "100%");
  zoomed.classList.add("ge-viewer-zoom");
  const groups = [];
  if (pictures.length > 1) groups.push(element("div", { class: "ge-viewer-group" }, button("prev", t("上一张")), button("next", t("下一张"))));
  groups.push(element("div", { class: "ge-viewer-group" }, button("out", t("缩小")), zoomed, button("in", t("放大")), element("div", { class: "ge-viewer-sep" }), button("download", t("下载")), element("div", { class: "ge-viewer-sep" }), button("close", t("关闭"))));
  const node = mountOver(host, element("div", { class: "ge-image-viewer", role: "dialog", "aria-label": t("查看图片") }, img, element("div", { class: "ge-viewer-bar" }, ...groups)));
  const v = { node, img, pictures, index: pictures.indexOf(picture), zoom: 1, x: 0, y: 0, moved: false, timer: 0, download, host };
  viewer = v;

  node.addEventListener("click", (event) => {
    const act = event.target.closest?.("[data-act]")?.getAttribute("data-act");
    if (act) return run(act);
    if (event.target === img) return;
    if (!event.target.closest(".ge-viewer-bar") && !v.moved) closeViewer(); // a click beside the picture
  });
  node.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomTo(v.zoom * Math.exp(-event.deltaY * 0.0015), around(event));
  }, { passive: false });
  node.addEventListener("pointerdown", (event) => {
    v.moved = false;
    if (event.button !== 0 || event.target !== img || v.zoom <= 1) return;
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY, panX: v.x, panY: v.y };
    img.style.cursor = "grabbing";
    const move = (moving) => {
      if (Math.abs(moving.clientX - start.x) + Math.abs(moving.clientY - start.y) > 3) v.moved = true;
      v.x = start.panX + moving.clientX - start.x;
      v.y = start.panY + moving.clientY - start.y;
      paint();
    };
    const up = () => {
      host.win.removeEventListener("pointermove", move, true);
      host.win.removeEventListener("pointerup", up, true);
      paint();
    };
    host.win.addEventListener("pointermove", move, true);
    host.win.addEventListener("pointerup", up, true);
  });
  v.keys = (event) => {
    const done = () => { event.preventDefault(); event.stopPropagation(); };
    if (event.key === "Escape" || event.key === " ") { done(); closeViewer(); }
    else if (event.key === "ArrowLeft") { done(); show(v.index - 1); }
    else if (event.key === "ArrowRight") { done(); show(v.index + 1); }
    else if (event.key === "+" || event.key === "=") { done(); zoomTo(v.zoom * 1.25); }
    else if (event.key === "-" || event.key === "_") { done(); zoomTo(v.zoom / 1.25); }
    else if (!(event.ctrlKey || event.metaKey)) done(); // the page takes no keys meanwhile
  };
  v.wake = () => {
    node.removeAttribute("data-idle");
    clearTimeout(v.timer);
    v.timer = setTimeout(() => viewer === v && node.setAttribute("data-idle", ""), 2000);
  };
  for (const doc of new Set([document, host.doc])) doc.addEventListener("keydown", v.keys, true);
  host.win.addEventListener("pointermove", v.wake, true);
  host.win.addEventListener("resize", fit);
  img.addEventListener("load", fit);
  document.activeElement?.blur?.();
  show(v.index);
  v.wake();
  node.getBoundingClientRect(); // its first style taken, so that showing it fades in
  node.setAttribute("data-shown", "");
}

/** The viewer gone, if it is open. */
export function closeViewer() {
  const v = viewer;
  if (!v) return;
  viewer = null;
  for (const doc of new Set([document, v.host.doc])) doc.removeEventListener("keydown", v.keys, true);
  v.host.win.removeEventListener("pointermove", v.wake, true);
  v.host.win.removeEventListener("resize", fit);
  clearTimeout(v.timer);
  hideTooltip(); // one of its bar's, standing over the workbench, goes with it
  v.node.remove();
}

function run(act) {
  const v = viewer;
  if (act === "close") closeViewer();
  else if (act === "prev") show(v.index - 1);
  else if (act === "next") show(v.index + 1);
  else if (act === "in") zoomTo(v.zoom * 1.25);
  else if (act === "out") zoomTo(v.zoom / 1.25);
  else if (act === "reset") zoomTo(1);
  else if (act === "download") v.download(v.pictures[v.index]);
}

function show(index) {
  const v = viewer;
  v.index = Math.max(0, Math.min(v.pictures.length - 1, index));
  v.zoom = 1;
  v.x = 0;
  v.y = 0;
  v.img.src = v.pictures[v.index].currentSrc || v.pictures[v.index].src;
  v.node.querySelector('[data-act="prev"]')?.toggleAttribute("data-off", v.index === 0);
  v.node.querySelector('[data-act="next"]')?.toggleAttribute("data-off", v.index === v.pictures.length - 1);
  fit();
}

// The picture fitted into the window it covers (32px around it from 1020px wide), never past its own size.
function fit() {
  const v = viewer;
  if (!v?.img.naturalWidth) return;
  const { naturalWidth: width, naturalHeight: height } = v.img;
  const { innerWidth: across, innerHeight: down } = v.host.win;
  const gap = across >= 1020 ? 32 : 0;
  const scale = Math.min(1, (across - 2 * gap) / width, (down - 2 * gap) / height);
  v.img.style.width = `${width * scale}px`;
  v.img.style.height = `${height * scale}px`;
  paint();
}

// Where the pointer is, from the window's middle (the zoom's center).
function around(event) {
  const rect = viewer.node.getBoundingClientRect();
  return { x: event.clientX - (rect.left + rect.width / 2), y: event.clientY - (rect.top + rect.height / 2) };
}

function zoomTo(value, at = null) {
  const v = viewer;
  const zoom = Math.max(ZOOM.min, Math.min(ZOOM.max, Math.round(value * 1000) / 1000));
  if (at) {
    const k = zoom / v.zoom;
    v.x = at.x - (at.x - v.x) * k;
    v.y = at.y - (at.y - v.y) * k;
  }
  v.zoom = zoom;
  if (zoom <= 1) {
    v.x = 0;
    v.y = 0;
  }
  paint();
}

function paint() {
  const v = viewer;
  v.img.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`;
  v.img.style.cursor = v.zoom > 1 ? "grab" : "default";
  v.node.querySelector(".ge-viewer-zoom").textContent = `${Math.round(v.zoom * 100)}%`;
  v.node.querySelector('[data-act="out"]').toggleAttribute("data-off", v.zoom <= ZOOM.min);
  v.node.querySelector('[data-act="in"]').toggleAttribute("data-off", v.zoom >= ZOOM.max);
}
