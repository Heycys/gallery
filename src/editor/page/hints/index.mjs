import { READ_ONLY_HINTS } from "../../components/registry.mjs";
import { editable } from "../caret.mjs";
import { bubbleLook, guardBubble } from "../tooltip.mjs";
import { element, mount } from "../ui.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// Hints on hover (docs/editor.md, "Browser side"): resting the pointer on text that stays
// read-only says why (the reason the server recorded, data-ge-lock, or what the element is, as the
// components say: their `readOnly`, read in rank order); a link shows its card instead (links/).
// A click on read-only text says the reason in the notice (editor.mjs). No hint on an edge that
// resizes (resize/) or while a box selection is drawn (selection/marquee.mjs). connectHints() gives
// them what they need from the editor.

let use = null; // { editing() }

export function connectHints(editor) {
  use = editor;
}

const LOCKS = {
  comment: t("这段里有页面上不显示的注释，为了不丢掉它，暂不能在页面上修改。"),
  markup: t("这段在文件里的写法比较特殊，暂不能在页面上修改，可以让 Agent 修改。"),
  mention: t("这段里的页面块在文件里的写法不对，暂不能在页面上修改，可以让 Agent 修改。"),
  link: t("这段含有不安全的链接地址，暂不能在页面上修改。"),
  script: t("这段文字是页面自己生成或更新的（和文件里写的不同），不能在页面上修改。"),
  "given-up": t("这一块已改用文件里的版本：处理完其余冲突、页面显示文件里的内容后才能修改。"), // commit.mjs marks
};

export function lockText(reason) {
  if (LOCKS[reason]) return LOCKS[reason];
  const tag = reason.startsWith("tag:") ? reason.slice(4) : "";
  if (tag === "ul" || tag === "ol") return t("这一项含有嵌套列表：外层文字暂不能修改，里层的列表项可以修改。");
  if (tag === "button") return t("这段含有按钮，为避免破坏组件，暂不能在页面上修改；可以让 Agent 把其中详情卡片的入口改成链接，之后就能像普通文字一样修改。");
  return tag ? t("这段含有页面上编辑不了的内容（{0}），可以让 Agent 修改。", tag) : t("这段暂不能在页面上修改。");
}

export function readOnlyReason(target) {
  if (target?.nodeType !== 1 || target.closest("[data-doc-dev]") || !target.closest("main")) return null;
  if (editable(target) || target.closest("a[href]")) return null; // a link there is one to click on
  const locked = target.closest("[data-ge-lock]");
  if (locked) return lockText(locked.getAttribute("data-ge-lock"));
  const hint = READ_ONLY_HINTS.find(({ at }) => (typeof at === "function" ? at(target) : target.closest(at)));
  if (hint) return hint.says;
  const ownText = [...target.childNodes].some((node) => node.nodeType === 3 && node.data.trim());
  return ownText ? t("这里暂不能在页面上修改。") : null;
}

let hint = null;
let hintTimer = 0;
let hintGuard = null; // tooltip.mjs guardBubble: what takes a tooltip away takes the hint, and the wait for it, away
let pointer = { x: 0, y: 0 };

/** Follow the pointer: re-arm the hint over what it is on (a hint cancelled by scrolling comes back). */
export function trackPointer(event) {
  pointer = { x: event.clientX, y: event.clientY };
  if (document.documentElement.matches("[data-ge-resize], [data-ge-marquee]")) hideHint(); // on an edge that resizes (resize/), drawing a box selection (selection/marquee.mjs)
  else if (!hint && !hintTimer) scheduleHint(event);
}

export function hideHint() {
  clearTimeout(hintTimer);
  hintTimer = 0;
  hintGuard?.();
  hintGuard = null;
  hint?.remove();
  hint = null;
}

// Also re-armed by pointer moves, so a hint cancelled by scrolling comes back when the pointer
// moves again over the same element.
export function scheduleHint(event) {
  if (!use.editing()) return;
  hideHint();
  pointer = { x: event.clientX, y: event.clientY }; // no move need come first: what comes under a pointer at rest, a page shown again
  // A drawing (a chart, an SVG of the report's own) may answer the pointer itself (a chart's own
  // tooltip): no hint over it; clicking one still explains itself in the status line.
  if (event.target?.closest?.("svg, canvas") || document.documentElement.matches("[data-ge-resize], [data-ge-marquee]")) return;
  const reason = readOnlyReason(event.target);
  if (!reason) return;
  const target = event.target;
  hintGuard = guardBubble(hideHint);
  hintTimer = setTimeout(() => {
    hintTimer = 0;
    hintGuard?.();
    hintGuard = null;
    if (!target.isConnected) return;
    bubbleLook();
    hint = mount(element("div", { class: "ge-hint", role: "tooltip", text: reason }));
    hint.style.left = `${Math.max(8, Math.min(pointer.x + 12, innerWidth - hint.offsetWidth - 8))}px`;
    hint.style.top = `${pointer.y + 18 + hint.offsetHeight > innerHeight ? pointer.y - hint.offsetHeight - 10 : pointer.y + 18}px`;
    hintGuard = guardBubble(hideHint, target); // it stands by the text under the pointer: gone when that is taken out, hidden or moved
  }, 450);
}
