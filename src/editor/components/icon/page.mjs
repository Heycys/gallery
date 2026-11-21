import { Z } from "../../../shared/layers.mjs";
import { emojiSvgDataUrl, loadEmojiData, randomEmoji } from "../../../shared/emoji/data.mjs";
import { FACE_ICON } from "../icons.mjs";
import { glyphSVGOf, loadGlyphs } from "../../../shared/emoji/glyphs.mjs";
import { keptByComponent } from "../../page/page-objects.mjs";
import { addStyle, element, mount } from "../../page/ui.mjs";
import { HIGHLIGHT } from "../kit.mjs";
import { ICON, iconElement, iconKind, iconValueOf } from "./index.mjs";
import { isStep } from "../flowchart/index.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// Icons on the page (index.mjs): the page's, and a highlight block's. The page's:
//   - with the pointer in the header and no icon, 添加图标 shows above the title, left-aligned with
//     its text (28 high, 8 each side, 6 round, 14px, the third text color, a filled face 6 before
//     it; fading in): a click puts a random emoji there (an activity, an object or a place);
//   - a click on the icon opens the icon picker below it (page/emoji-picker/): an
//     emoji, an icon of the 图标 tab (MingCute's or Tabler's) in a color, or an image (上传, kept in the report's folder by the server;
//     a custom emoji of the library copied there first) takes its place, 移除 takes it away, 随机
//     shows another and leaves the picker open; a second click closes it. Each is one undo step
//     (struct), and the server writes it into the file and report.json (its commit).
// A highlight block's: first in it, left of its blocks (the kit's highlight.css); a click on it opens
// the same picker (移除 takes it away), and the block menu adds or changes it (rowBeside). A new
// highlight block comes with 💡 (convert.mjs, iconElement). A flowchart node's, exactly so: first in
// it, drawn in its number's place (the kit's flowchart.css); a click on it, or on the number of a
// node that has none, opens the picker below it (移除 brings the number back), and the node's block
// menu adds or changes it. An icon of Tabler's numbers is an icon like any other: its number fixed,
// counted by nothing.
// Shown as a picture of its kind, as the server serves it (render/emoji.mjs): an emoji's Twemoji
// image, an icon's SVG (the kit colors it), the image where the server serves it. Its value
// stays the element's own (data-ge-icon), which a commit writes.

// A flowchart's node (its icon first in it, in its number's place).
const STEP = "ol.doc-flow > li";

const STYLE = `
  [data-ge-editing] main :is(.doc-header, ${HIGHLIGHT.match}, ${STEP}) > .${ICON} { border-radius: 6px; cursor: pointer; transition: background .1s ease-in; }
  [data-ge-editing] main :is(.doc-header, ${HIGHLIGHT.match}, ${STEP}) > .${ICON}:hover { background: light-dark(rgb(55 53 47 / 8%), rgb(255 255 255 / 8%)); }
  [data-ge-editing] main ${STEP}:not(:has(> .${ICON}))::before { cursor: pointer; }
  /* The node itself while the pointer is on its number (numberAt: the tint below), as the icon's: what
     finds the element under the pointer finds the node, not its ::before, and reads its cursor. */
  [data-ge-editing] main ${STEP}[data-ge-number-hover]:not(:has(> .${ICON})) { cursor: pointer; }
  [data-ge-editing] main ${STEP}[data-ge-number-hover]:not(:has(> .${ICON}))::before { box-shadow: inset 0 0 0 20px light-dark(rgb(55 53 47 / 8%), rgb(255 255 255 / 8%)); }
  .ge-add-icon { position: fixed; left: 0; top: 0; z-index: ${Z.affordance}; display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 8px; border-radius: 6px;
    color: var(--ge-tx3); font: 14px/1 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    white-space: nowrap; cursor: pointer; user-select: none; opacity: 0; visibility: hidden; pointer-events: none; transition: opacity .1s ease-in, background .1s ease-in; }
  .ge-add-icon svg { display: block; flex: none; width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
  .ge-add-icon[data-shown] { opacity: 1; visibility: visible; pointer-events: auto; }
  .ge-add-icon:hover { background: var(--ge-hover); }
`;

// What holds an icon: the page's header, a highlight block (the opening summary is one), a flowchart's node.
const HOLDERS = `main :is(.doc-header, ${HIGHLIGHT.match}, ${STEP})`;
const SELECTOR = `${HOLDERS} > .${ICON}`;
// A block an icon leads (first in it): a highlight block, a flowchart's node; not the header (the page's icon).
const isPanel = (holder) => holder.matches(HIGHLIGHT.match) || isStep(holder);

// A node's number (no icon of its own), where the kit draws it (the step's ::before, in its card's
// padding on its first line: flowchart.css), as a rect of the window, or null.
function numberRect(step) {
  if (!isStep(step) || iconIn(step) || !step.parentElement?.hasAttribute("data-ge-box")) return null;
  const before = getComputedStyle(step, "::before");
  if (before.content === "none" || before.position !== "absolute") return null;
  const box = step.getBoundingClientRect();
  const style = getComputedStyle(step);
  const inner = box.left + parseFloat(style.borderLeftWidth);
  const width = parseFloat(before.width) || 20;
  const right = box.right - parseFloat(style.borderRightWidth) - parseFloat(before.right);
  const top = box.top + parseFloat(style.borderTopWidth) + parseFloat(before.top);
  const height = parseFloat(before.height) || 20;
  return right > inner ? { left: right - width, right, top, bottom: top + height, width, height } : null;
}

// The node whose number is under a point (2px to spare), or null.
function numberAt(target, x, y) {
  const step = keptByComponent(target) ? null : target?.closest?.(`main ${STEP}`);
  const rect = step && numberRect(step);
  return rect && x >= rect.left - 2 && x <= rect.right + 2 && y >= rect.top - 2 && y <= rect.bottom + 2 ? { step, rect } : null;
}
const iconIn = (holder) => holder?.querySelector(`:scope > .${ICON}`) ?? null;
const iconOf = () => document.querySelector(`main .doc-header > .${ICON}`); // the page's
const titleOf = () => document.querySelector("main .doc-header > h1");

/** The value an icon element stands for. */
const valueOf = (node) => node.getAttribute("data-ge-icon") ?? iconValueOf(node.outerHTML);

/**
 * The picture of an icon's value, ready to show: an image decoded already (assetUrl: where the
 * server serves a report's image), so it never shows empty for a moment. Null when there is none
 * (an emoji the pack lacks stays its text).
 */
async function picture(value, assetUrl) {
  const kind = iconKind(value);
  let shown = null;
  if (kind === "emoji") {
    await loadEmojiData();
    const url = await emojiSvgDataUrl(value).catch(() => null);
    if (url) shown = element("img", { alt: value, src: url, draggable: "false" });
  } else if (kind === "glyph") {
    await loadGlyphs().catch(() => null);
    const svg = glyphSVGOf(value);
    if (svg) {
      const holder = document.createElement("template");
      holder.innerHTML = svg.replace("<svg ", '<svg aria-hidden="true" ');
      shown = holder.content.firstElementChild;
    }
  } else if (kind === "image") shown = element("img", { src: assetUrl(value), alt: "", draggable: "false" });
  if (shown instanceof HTMLImageElement) await shown.decode().catch(() => {});
  return shown;
}

/** Show an icon element as the picture of its value. Its value is kept first (data-ge-icon): the picture says it no more. */
async function show(node, assetUrl) {
  const value = valueOf(node);
  if (!iconKind(value)) return;
  node.setAttribute("data-ge-icon", value);
  const shown = await picture(value, assetUrl);
  if (shown && node.isConnected && valueOf(node) === value) node.replaceChildren(shown);
}

/**
 * struct(parents, touched, mutate): the editor's undoable structural change. say: the status line.
 * isEditing(): whether the page edits. openMediaPicker({ origin, value, onPick }) (emoji-picker/).
 * assetUrl(path): where the server serves an image of the report's folder (assets/<file>).
 * importEmoji(id): a custom emoji of the library copied into the report's folder: its path there.
 */
export function create({ struct, say, isEditing, openMediaPicker, assetUrl, importEmoji }) {
  addStyle(STYLE);
  // The page's icons as they come in without their picture (an Agent's write taken in, undo).
  const showAll = () => document.querySelectorAll(SELECTOR).forEach((node) => {
    if (!node.querySelector("img, svg")) show(node, assetUrl);
  });
  showAll();
  new MutationObserver(showAll).observe(document.querySelector("main") ?? document.body, { childList: true, subtree: true });

  // The icon made on the page, its picture in it already (the server writes it before the title
  // wherever the page puts it).
  const made = async (value) => {
    const node = iconElement(document, value);
    node.replaceChildren((await picture(value, assetUrl)) ?? value);
    return node;
  };

  // One undo step: the header or a highlight block (`holder`, the header by default) with the icon
  // `value` (null: none), the page's right before the title, a highlight block's first in it. The
  // old icon stays until the new one's picture is ready, and they change places at once: nothing
  // below moves meanwhile. The last of several picks in a row wins (随机 clicked again).
  let latest = 0;
  async function setIcon(value, verb, holder = document.querySelector("main .doc-header")) {
    const ticket = ++latest;
    const now = iconIn(holder);
    if (now && value && valueOf(now) === value) return false;
    const node = value ? await made(value) : null;
    const title = isPanel(holder) ? null : titleOf();
    if (ticket !== latest || !holder?.isConnected || (!isPanel(holder) && !title)) return false;
    const old = iconIn(holder);
    if (old && value && valueOf(old) === value) return false;
    const result = struct([holder], [], () => {
      old?.remove();
      if (node) title ? title.before(node) : holder.prepend(node);
      return { touched: [], focus: null };
    });
    if (result) say(t("{0} · Ctrl+Z 撤销", verb));
    hideAdd();
    return Boolean(result);
  }

  // What the picker gives, as a page's icon: a custom emoji copied into the report's folder first;
  // an image anywhere else (a link the server could not download) is none.
  async function pick(value, holder) {
    const what = isPanel(holder) ? t("图标") : t("页面图标");
    if (value === null) return setIcon(null, t("已移除{0}", what), holder);
    const custom = /^notion:\/\/custom_emoji\/[^/]+\/([^/]+)$/.exec(value)?.[1];
    if (custom) {
      try {
        value = await importEmoji(custom);
      } catch (error) {
        return say(error.message || t("无法使用这个自定义表情"));
      }
    }
    if (!iconKind(value)) return say(t("这张图片没能存进文档"));
    return setIcon(value, t("已更换{0}", what), holder);
  }

  // ---------- 添加图标 ----------

  const add = element("div", { class: "ge-add-icon", role: "button", tabindex: "0", html: t("{0}添加图标", FACE_ICON) });
  add.addEventListener("mousedown", (event) => event.preventDefault());
  add.addEventListener("click", async () => {
    if (!shown || !isEditing() || iconOf()) return;
    await loadEmojiData();
    if (!shown || !isEditing() || iconOf()) return;
    setIcon(randomEmoji(), t("已添加页面图标"));
  });
  let shown = false;
  function showAdd() {
    const title = titleOf();
    const header = title?.parentElement;
    if (!isEditing() || !title || !header || iconOf()) return hideAdd();
    if (!add.isConnected) mount(add);
    const first = header.firstElementChild.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(title);
    const text = range.getClientRects()[0] ?? title.getBoundingClientRect();
    add.style.transform = `translate(${Math.round(text.left - 8)}px, ${Math.round(first.top - 28 - 6)}px)`;
    if (!shown) requestAnimationFrame(() => { if (shown) add.setAttribute("data-shown", ""); });
    shown = true;
  }
  function hideAdd() {
    shown = false;
    add.removeAttribute("data-shown");
  }
  // With the pointer in the header (or on the control itself), editing, and no icon yet.
  document.addEventListener("mousemove", (event) => {
    const header = titleOf()?.parentElement;
    if (!isEditing() || !header || iconOf() || event.buttons) return hideAdd();
    if (add.contains(event.target)) return;
    const box = header.getBoundingClientRect();
    const near = event.clientY >= box.top - 40 && event.clientY <= box.bottom && event.clientX >= box.left - 40 && event.clientX <= box.right;
    if (near) showAdd();
    else hideAdd();
  }, { passive: true, capture: true });
  addEventListener("scroll", () => { if (shown) showAdd(); }, { passive: true, capture: true });

  // ---------- the picker ----------

  let picker = null; // its popup
  let wasOpen = false; // when the press began: a click on the icon then closes it (the press did)
  addEventListener("mousedown", (event) => {
    wasOpen = Boolean(picker && !picker.closed && (event.target.closest?.(SELECTOR) || numberAt(event.target, event.clientX, event.clientY)));
  }, true);
  // A press on a node's number moves no caret and starts no box selection: its click opens the picker.
  document.addEventListener("pointerdown", (event) => {
    if (!isEditing() || event.button !== 0 || !numberAt(event.target, event.clientX, event.clientY)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  let hovered = null; // the node whose number the pointer is on (its tint)
  document.addEventListener("mousemove", (event) => {
    const step = isEditing() && !event.buttons ? numberAt(event.target, event.clientX, event.clientY)?.step ?? null : null;
    if (step === hovered) return;
    hovered?.removeAttribute("data-ge-number-hover");
    hovered = step;
    step?.setAttribute("data-ge-number-hover", "");
  }, { passive: true, capture: true });
  document.addEventListener("click", (event) => {
    if (!isEditing() || keptByComponent(event.target)) return;
    const node = event.target.closest?.(SELECTOR);
    const number = node ? null : numberAt(event.target, event.clientX, event.clientY);
    if (!node && !number) return;
    event.preventDefault();
    if (wasOpen || (picker && !picker.closed)) {
      picker?.close();
      picker = null;
      return;
    }
    if (node) open(node.parentElement, node.getBoundingClientRect());
    else open(number.step, number.rect);
  }, true);

  // The picker for a holder's icon, below `origin`.
  function open(holder, origin) {
    const own = iconIn(holder);
    picker = openMediaPicker({ origin, value: own ? valueOf(own) : null, isCallout: isPanel(holder), onPick: (value) => { pick(value, holder); } });
  }

  return {
    /** The editor's UI nodes to keep in the top layer. */
    get nodes() { return [add]; },
    /**
     * The page's icon set from outside the page (the workbench's sidebar: the session's set-icon), `value` an
     * icon value or null (none): as a pick of the header's own picker, one undo step and said on the status
     * line. Resolves to false where the page has no title to stand before.
     */
    async setPageIcon(value) {
      const header = document.querySelector("main .doc-header");
      if (!header || !titleOf()) return false;
      await pick(value, header);
      return true;
    },
    /** The page's icon as the page shows it, its value (the tab's, the workbench's), or null. */
    pageIcon() {
      const icon = document.querySelector(`main .doc-header > .${ICON}`);
      return icon ? icon.getAttribute("data-ge-icon") ?? iconValueOf(icon.outerHTML) : null;
    },
    /** The block menu's row for a highlight block's or a flowchart node's icon (添加图标 or 更换图标), or null for another block. */
    rowBeside(target) {
      if (!target?.matches?.(HIGHLIGHT.match) && !(isStep(target) && target.parentElement?.hasAttribute("data-ge-box"))) return null;
      const own = iconIn(target);
      return {
        label: own ? t("更换图标") : t("添加图标"), icon: FACE_ICON,
        run: () => {
          const box = (own ?? target).getBoundingClientRect();
          open(target, own ? box : numberRect(target) ?? { left: box.left + 12, right: box.left + 36, top: box.top + 12, bottom: box.top + 36, width: 24, height: 24 });
        },
      };
    },
  };
}
