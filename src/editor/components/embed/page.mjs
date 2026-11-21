import { Z } from "../../../shared/layers.mjs";
import { gestureLock } from "../../page/gesture.mjs";
import { SPAN, SPAN_SIZE, UPLOAD_LIMITS, sizeLimit } from "../../../shared/media.mjs";
import { ICONS } from "../../page/menu.mjs";
import { onSettle, own } from "../../page/overlays.mjs";
import { drawAt, shapeOf } from "../../page/overlay-layer.mjs";
import { keptByComponent } from "../../page/page-objects.mjs";
import { addStyle, addStyleTo, copyAddress, element, mountOver, overlayHost } from "../../page/ui.mjs";
import { TOOL_ICONS } from "../media/icons.mjs";
import { captionOf } from "../media/parts.mjs";
import { SNAP, columnRoom } from "../media/size.mjs";
import { TOOLBAR_STYLE, mediaBar, toolButton } from "../media/toolbar.mjs";
import { EMBED_ICONS } from "./icons.mjs";
import { HEIGHT, HEIGHT_SIZE, frameAddress, frameOf, frameParts, newEmbed } from "./index.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// 嵌入 on the page (one of the media blocks, ../media/). A
// new embed (the "/" menu's 嵌入, made from an empty block: convert.mjs) is a placeholder, a gray bar,
// until something is given in the menu that opens below it at once and on a click (../media/page.mjs;
// 300px): 链接, a
// web page (https; a YouTube video shown as its player, a Google document as its preview), which the
// server asks first whether it lets other pages frame it, one that does not becoming a bookmark
// (a bookmark's fromLink); 上传, an HTML or PDF file (20 MB at most) kept in the report's folder. One
// undo step. With the pointer on its frame, the media toolbar stands at its top right (全屏,
// 查看原始内容, 更多: the block menu) and a handle at each bottom corner: dragging one sets the frame's
// width (a share of the width it stands in, the frame centered, so both sides move) and height (96 to
// 2000px) together, one undo step on letting go (Esc puts them back). While a block or a handle is
// dragged the frames let the pointer through. 全屏 shows the page or file over the page in a frame of
// its own (Esc, 关闭 or a click beside it closes it). No caption is asked for (one the file has still
// shows). The block menu has 替换, 全屏, 查看原始内容, 复制链接, 恢复默认大小.

const MAX_BYTES = UPLOAD_LIMITS.embed;

// Its placeholder's look (every empty block's) is served with the page: ../placeholder.mjs.
const STYLE = `
  html[data-ge-drag] .doc-embed-frame, html[data-ge-embed-resize] .doc-embed-frame { pointer-events: none; }
  ${gestureLock("data-ge-embed-resize=\"right\"", { cursor: "nwse-resize" })}
  ${gestureLock("data-ge-embed-resize=\"left\"", { cursor: "nesw-resize" })}
  .ge-layer > .ge-embed-corner { pointer-events: auto; }
  /* A corner handle: a plain gray bar bent round the frame's corner, no border. */
  .ge-embed-corner { width: 20px; height: 20px; cursor: nwse-resize; }
  .ge-embed-corner[data-side="left"] { cursor: nesw-resize; }
  .ge-embed-corner::after { content: ""; position: absolute; bottom: 5px; width: 9px; height: 9px; border: 0 solid light-dark(rgb(55 53 47 / 35%), rgb(255 255 255 / 38%)); border-bottom-width: 3px; transition: border-color 120ms ease; }
  .ge-embed-corner[data-side="right"]::after { right: 5px; border-right-width: 3px; border-bottom-right-radius: 5px; }
  .ge-embed-corner[data-side="left"]::after { left: 5px; border-left-width: 3px; border-bottom-left-radius: 5px; }
  .ge-embed-corner:hover::after, html[data-ge-embed-resize] .ge-embed-corner::after { border-color: light-dark(rgb(55 53 47 / 60%), rgb(255 255 255 / 62%)); }
  /* 全屏: a panel over the page (72px from its edges, 1360px wide at most). */
  .ge-embed-viewer { position: fixed; inset: 0; z-index: ${Z.viewer}; background: light-dark(rgb(15 15 15 / 60%), rgb(15 15 15 / 80%)); }
  .ge-embed-viewer-panel { position: absolute; inset: 72px; max-width: 1360px; margin: 0 auto; display: flex; flex-direction: column; border-radius: var(--ge-r-shell); overflow: hidden;
    background: light-dark(#fff, #202020); box-shadow: 0 0 0 1px var(--ge-outline), 0 20px 40px rgb(0 0 0 / 30%); }
  .ge-embed-viewer-bar { display: flex; align-items: center; gap: 8px; height: 45px; flex: none; padding: 0 12px 0 16px; border-bottom: 1px solid var(--ge-line);
    color: var(--ge-tx); font: 500 14px/1.2 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
  .ge-embed-viewer-name { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .ge-embed-viewer-panel > iframe { flex: 1; width: 100%; min-height: 0; border: 0; background: light-dark(#fff, #191919); }
`;

/**
 * Embeds on the page, with what the editor gives them: the media blocks' shared parts (`pages.media`:
 * ../media/page.mjs block("embed"): the undo steps, say, active(), the block menu, the upload of
 * kind "embed": { path }, the menu), embedUrl(path) (where the server shows a file of the report's
 * folder in a frame), frameable(url) (whether a page lets frames show it) and the bookmarks' page
 * object (`pages.bookmark`: fromLink, a bookmark of the page in the figure's place).
 */
export function create({ pages, embedUrl, frameable }) {
  const media = pages.media.block("embed");
  const { look, say, active, openMenu } = media;
  addStyle(STYLE);

  /** The 链接 / 上传 menu of an embed, below it. */
  const pick = (figure) => media.pick(figure, {
    tabs: [{ key: "link", label: t("链接") }, { key: "upload", label: t("上传") }],
    width: 300,
    link: { placeholder: t("粘贴网页链接，例如 https://…"), button: t("嵌入链接"), caption: t("适用于允许嵌入的网页。") },
    upload: { label: t("选择文件"), primary: true, accept: ".html,.htm,.pdf", caption: t("支持 HTML 和 PDF 文件。") },
    onEmbed: (url) => embedLink(figure, url),
    onUpload: (file) => uploadInto(figure, file),
  });

  async function embedLink(figure, url, options = {}) {
    if (!/^https:/i.test(url)) return say(t("只能嵌入 https 开头的网页。"), "error");
    media.busy(figure, t("正在检查网页…"));
    const answer = await frameable(url).catch(() => ({ frameable: true }));
    if (!figure.isConnected) return;
    if (!answer.frameable) {
      media.idle(figure);
      if (!pages.bookmark) return say(t("这个网页不允许嵌入。"), "error");
      say(t("这个网页不允许嵌入，已改为网页书签。"));
      return pages.bookmark.fromLink(figure, url, options);
    }
    place(figure, frameAddress(url), options);
  }

  async function uploadInto(figure, file) { // (also one dropped on an empty embed: takeDrop)
    if (!/\.(html?|pdf)$/i.test(file.name)) return say(t("只能嵌入 HTML 或 PDF 文件。"), "error");
    if (file.size > MAX_BYTES) return say(t("文件太大（最多 {0}）。", sizeLimit("embed")), "error");
    return media.attempt(figure, t("正在上传 {0}…", file.name), t("无法上传这个文件"), async () => place(figure, (await media.uploadFile(file)).path));
  }

  // The frame in: a new embed in the place of the placeholder (or of the embed replaced, with its
  // caption and height), never the same element, so that undo brings back what stood there. One undo
  // step; the embed selected.
  function place(figure, src, { pasted = false } = {}) {
    if (!figure.isConnected) return;
    const doc = figure.ownerDocument;
    const replacing = Boolean(frameOf(figure));
    const next = newEmbed(doc);
    next.classList.toggle("doc-embed--file", !/^https:/.test(src));
    const height = figure.style.getPropertyValue(HEIGHT);
    if (replacing && height) next.style.setProperty(HEIGHT, height);
    next.replaceChildren(...frameParts(doc, src, /^https:/.test(src) ? src : embedUrl(src), captionOf(figure)?.innerHTML ?? ""));
    media.place(figure, next, { replacing, pasted });
    if (replacing) say(t("已替换嵌入内容 · Ctrl+Z 撤销"));
  }

  // ---------- the toolbar and the corner handles ----------

  let hovered = null;
  let resizing = null; // { figure, side, x, y, width, height, room, before: { height, span } }
  const bar = mediaBar(t("嵌入操作"));
  const tool = (label, tip, icon, run) => toolButton({ label, tip, icon, run: (button) => run(hovered, button), alive: () => hovered?.isConnected });
  bar.append(
    tool(t("全屏"), t("全屏查看"), TOOL_ICONS.expand, (figure) => fullScreen(figure)),
    tool(t("查看原始内容"), t("在新标签页中打开"), EMBED_ICONS.open, (figure) => original(figure)),
    tool(t("更多"), t("打开区块操作菜单"), TOOL_ICONS.more, (figure, button) => {
      const rect = button.getBoundingClientRect();
      openMenu(figure, { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
    }),
  );
  const corners = { left: element("div", { class: "ge-embed-corner", "data-side": "left" }), right: element("div", { class: "ge-embed-corner", "data-side": "right" }) };
  const tools = () => [bar, corners.left, corners.right];

  function show(figure) {
    hovered = figure;
    const frame = figure && frameOf(figure);
    const shape = frame && shapeOf(frame);
    if (!shape) {
      hovered = null;
      tools().forEach((node) => node.remove());
      return;
    }
    const alive = () => hovered === figure && figure.isConnected;
    for (const node of tools()) own(node, "embed tools", { owner: figure, alive });
    const { rect } = shape;
    if (bar.parentNode !== shape.layer) shape.layer.append(bar); // in the page before its width is measured
    drawAt(bar, shape.layer, rect.right - 4 - bar.offsetWidth, rect.top + 4);
    drawAt(corners.left, shape.layer, rect.left, rect.bottom - 20);
    drawAt(corners.right, shape.layer, rect.right - 20, rect.bottom - 20);
  }

  // The pointer reaching a frame (its own document gets the moves inside it), or leaving it for the page.
  document.addEventListener("mouseover", (event) => {
    if (resizing || tools().some((node) => node.contains(event.target))) return;
    const figure = active() && !keptByComponent(event.target) ? event.target.closest?.("main figure.doc-embed") ?? null : null;
    if (figure !== hovered) show(figure && frameOf(figure) ? figure : null);
  }, true);
  addEventListener("scroll", () => { if (hovered && !resizing) show(hovered); }, { passive: true, capture: true });
  // The hovered frame taken off the page by an undo, a redo or a commit: the tools go at once, not at the next pointer move.
  onSettle(() => { if (hovered && !hovered.isConnected && !resizing) show(null); });

  // A corner dragged: the frame's width (centered, so the corner follows the pointer and the other side
  // moves as far) and height, live; one undo step on letting go.
  const sizeOf = (figure) => ({ height: figure.style.getPropertyValue(HEIGHT), span: figure.style.getPropertyValue(SPAN).trim() });
  const setSize = (figure, { height, span }) => {
    for (const [name, value] of [[HEIGHT, height], [SPAN, span]]) value ? figure.style.setProperty(name, value) : figure.style.removeProperty(name);
  };
  const end = (keep) => {
    if (!resizing) return;
    const { figure, before } = resizing;
    resizing = null;
    document.documentElement.removeAttribute("data-ge-embed-resize");
    const now = sizeOf(figure);
    setSize(figure, before);
    const changed = now.height !== before.height || now.span !== before.span;
    if (keep && changed && look(figure, { sizes: { [HEIGHT]: now.height || null, [SPAN]: now.span || null } })) {
      say(t("嵌入大小：{0}，{1} · Ctrl+Z 撤销", now.span ? t("{0}% 宽", Math.round(Number(now.span) * 100)) : t("整行宽"), now.height || t("默认高度")));
    }
    show(figure);
  };
  for (const [side, corner] of Object.entries(corners)) {
    corner.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || !hovered) return;
      event.preventDefault();
      const figure = hovered;
      const room = columnRoom(figure);
      const rect = frameOf(figure).getBoundingClientRect();
      resizing = { figure, side, x: event.clientX, y: event.clientY, width: rect.width, height: rect.height, room, before: sizeOf(figure) };
      corner.setPointerCapture?.(event.pointerId);
      document.documentElement.setAttribute("data-ge-embed-resize", side);
    });
    corner.addEventListener("pointermove", (event) => {
      if (!resizing) return;
      const { figure, x, y, width, height, room } = resizing;
      let next = Math.max(room * SPAN_SIZE.min, Math.min(room, width + (event.clientX - x) * (side === "right" ? 2 : -2)));
      if (room - next <= SNAP) next = room; // the whole width snaps
      setSize(figure, {
        height: `${Math.round(Math.max(HEIGHT_SIZE.min, Math.min(HEIGHT_SIZE.max, height + event.clientY - y)))}px`,
        span: next >= room ? "" : String(Math.round((next / room) * 1000) / 1000),
      });
      show(figure);
    });
    corner.addEventListener("pointerup", () => end(true));
    corner.addEventListener("pointercancel", () => end(false));
    corner.addEventListener("lostpointercapture", () => end(true));
  }
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !resizing) return;
    event.preventDefault();
    event.stopPropagation();
    end(false);
  }, true);

  // ---------- the page or file itself, the block menu ----------

  // The page, or the file where the preview shows it, in a new tab.
  function original(figure) {
    const frame = frameOf(figure);
    if (frame) window.open(frame.src, "_blank", "noopener,noreferrer");
  }

  // Where the block shows from, absolute: a web page's address, a file's where the preview serves it.
  const addressOf = (figure) => {
    const frame = frameOf(figure);
    return frame ? new URL(frame.getAttribute("src"), location.href).href : "";
  };

  // 全屏: the page or file in a frame of its own over the page (sandboxed as its frame is), in a
  // panel; Esc, 关闭 or a click beside the panel closes it.
  let viewer = null;
  function fullScreen(figure) {
    const frame = frameOf(figure);
    if (!frame) return;
    closeViewer();
    const name = element("div", { class: "ge-embed-viewer-name", text: addressOf(figure) });
    const close = element("div", { class: "ge-media-tool", role: "button", "aria-label": t("关闭"), text: "×" });
    const copy = frame.cloneNode(false);
    copy.removeAttribute("class");
    copy.removeAttribute("style");
    const panel = element("div", { class: "ge-embed-viewer-panel", role: "dialog", "aria-label": t("全屏查看") }, element("div", { class: "ge-embed-viewer-bar" }, name, close), copy);
    // Over the whole window: the workbench's, when the page is shown in one (ui.mjs overlayHost).
    const host = overlayHost();
    addStyleTo(host.doc, TOOLBAR_STYLE);
    addStyleTo(host.doc, STYLE);
    const node = mountOver(host, element("div", { class: "ge-embed-viewer" }, panel));
    node.addEventListener("click", (event) => { if (event.target === node || close.contains(event.target)) closeViewer(); });
    const keys = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeViewer();
    };
    const docs = [...new Set([document, host.doc])];
    docs.forEach((doc) => doc.addEventListener("keydown", keys, true));
    viewer = { node, keys, docs };
  }
  function closeViewer() {
    if (!viewer) return;
    viewer.docs.forEach((doc) => doc.removeEventListener("keydown", viewer.keys, true));
    viewer.node.remove();
    viewer = null;
  }

  // 复制链接: where the block shows from.
  function copyLink(figure) {
    const href = addressOf(figure);
    if (href) copyAddress(href, say);
  }

  /** An embed's rows in its block menu. */
  function menuItems(target) {
    if (!target?.matches?.("figure.doc-embed") || !frameOf(target)) return [];
    const rows = [
      { label: t("替换"), icon: ICONS.swap, run: () => setTimeout(() => pick(target)) },
      { label: t("全屏"), icon: TOOL_ICONS.expand, run: () => setTimeout(() => fullScreen(target)) },
      { label: t("查看原始内容"), icon: EMBED_ICONS.open, run: () => original(target) },
      { label: t("复制链接"), icon: ICONS.copy, run: () => copyLink(target) },
    ];
    if (target.style.getPropertyValue(HEIGHT) || target.style.getPropertyValue(SPAN)) {
      rows.push({ label: t("恢复默认大小"), icon: ICONS.reset, run: () => { if (look(target, { sizes: { [HEIGHT]: null, [SPAN]: null } })) say(t("已恢复默认大小 · Ctrl+Z 撤销")); } });
    }
    return rows;
  }

  return {
    pick, menuItems,
    /** A new one: its page or file chosen next. */
    onCreated(figure) {
      pick(figure);
      return true;
    },
    /** An embed pasted with its page's address (clipboard/): checked and framed, one undo step with the paste (`options`). */
    fromLink: embedLink,
    /** Whether `figure`, an embed with nothing in it yet, takes a file dropped on it (`item`: { type, name? }): an HTML or a PDF file, as its 上传 menu does. */
    takesDrop: (figure, item) => media.empty(figure) && item.address === undefined && (item.name ? /\.(html?|pdf)$/i.test(item.name) : /^(text\/html|application\/pdf)$/.test(item.type ?? "")),
    /** A file dropped on an empty embed put in it (its upload), one undo step. */
    takeDrop: (figure, item) => (item.file ? uploadInto(figure, item.file) : undefined),
    get nodes() { return [...tools(), ...(viewer ? [viewer.node] : [])].filter((node) => node.isConnected); },
  };
}
