import { Z } from "../../../shared/layers.mjs";
import { escapeTyped } from "../../../shared/escape.mjs";
import { addStyle, appear, element, fadeAway, mount } from "../ui.mjs";
import { recentList } from "../storage.mjs";
import { placeBox } from "../placement.mjs";
import { tooltip } from "../tooltip.mjs";
import { GROUPS, ROW, fillSnippet, nextPlace } from "./symbols.mjs";
import { renderTex } from "../tex.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// The formula editor (both for an inline formula, index.mjs, and a display formula,
// components/math/page.mjs): a field of TeX, colored as it is typed (commands,
// numbers, braces), as wide as the editor, and below it KaTeX's reason when the TeX does not read
// ("无效的公式：", two lines at the most; resting on it 600ms shows all of it, KaTeX's quote of the TeX
// whole, and a click copies that, "已复制" there and on the status line, the box staying open, the keys
// in the field).
// Above the field, the symbol bar (symbols.mjs): a row of its six groups — 常用, 希腊, 运算, 结构,
// 关系与箭头, 化学 — each opening a card of all its symbols drawn by KaTeX (its drawer: small
// section titles, nothing scrolled), a click putting one in at the caret (a template's places to
// fill emptied, the selection in the first, the caret in the first empty one; Tab and Shift+Tab go
// to the next and previous {}); the drawer is a card on the editor's far side from the formula
// (below the editor when it stands below the formula), so neither the field nor the formula is
// covered (Esc closes it first). What was put in lately comes first under 常用 (this browser's, in
// localStorage).
//   Its side is chosen as it opens, by what the tallest group needs, and stays until the page
//   scrolls or the window changes size: no group and no symbol clicked moves the field. What comes
//   and goes around the field (a group's card, the lines it grows by, KaTeX's reason) goes on the far
//   side, and where the window has no room for a card it is the card that gives way, scrolling inside
//   what is left, a card at the least staying in the window: the field's height is capped for it, and the
//   editor stands over the formula rather than leave it no room. The editor goes with the formula as the
//   page scrolls, and as what is typed draws it taller.
//   A symbol clicked moves nothing at all, for the next click to find what it found: with the pointer
//   on the editor the field keeps its height, the text going on inside it, its caret's line in view, and
//   KaTeX's reason waits, until a key is pressed or the pointer has left (land). A press on the editor
//   leaves the keys in the field, and the gap between its card and its bar is the editor's.
//   Enter is a new line (a formula of several lines: \\, aligned, cases), as are Shift+Enter and
//   Alt+Enter. What is in the field is kept however the editor is left, also when it does not read,
//   which may be a stage on the way: Ctrl+Enter, Enter with the whole field selected (as it opens on a
//   formula, or after Ctrl+A, a formula pasted there kept at once) or with nothing in it, Esc once no
//   group's symbols are open, a press elsewhere, Ctrl+S, the workbench taking the focus, the page left.
// The caller shows the formula itself as it is typed (onInput), so there is no preview here.

const GAP = 6; // between the formula, the editor and a group's card
const MARGIN = 8; // what stays clear of the window's edge
// A group's card, in px, as the rules below draw it: its padding and a section's title. With its
// sections' rows (symbols.mjs), its height is known before any of its symbols is drawn.
const PADDING = 12;
const TITLE = 20;
const LEAST = 96; // a card this high at the least, however little room the window leaves
const REVEAL = 600; // ms resting on KaTeX's reason before all of it shows
// What the window keeps beside the field: its margins, a card at the least and the gap to it, the bar, the
// field's padding and two lines of KaTeX's reason.
const AROUND = 2 * MARGIN + LEAST + GAP + 39 + 16 + 52;

const STYLE = `
  .ge-fx {
    position: fixed; left: 0; top: 0; z-index: ${Z.card}; width: 440px; max-width: calc(100vw - 16px); color: var(--ge-tx);
    font: 14px/1.2 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  /* The gap to a group's card, the editor's: a press there, or the pointer on its way across it, is on the editor. */
  .ge-fx[data-open]::before { content: ""; position: absolute; left: 0; right: 0; top: 100%; height: ${GAP}px; }
  .ge-fx[data-open][data-above]::before { top: auto; bottom: 100%; }
  /* A card (look.mjs: 14px round, --ge-shadow-card), as its groups' card is; its controls at --ge-r-ctl. */
  .ge-fx-body { display: flex; flex-direction: column; overflow: hidden; border-radius: var(--ge-r-card); background: var(--ge-bg); box-shadow: var(--ge-shadow-card); }
  /* The groups, the field below them as wide as the editor. */
  .ge-fx-bar { display: flex; align-items: center; gap: 1px; padding: 6px; border-bottom: 1px solid var(--ge-line); overflow-x: auto; scrollbar-width: none; }
  .ge-fx-group { flex: none; height: 26px; padding: 0 8px; border: 0; border-radius: var(--ge-r-ctl); background: transparent; color: var(--ge-tx2); font: inherit; font-size: 13px; cursor: pointer; }
  .ge-fx-group:hover, .ge-fx-group[aria-expanded="true"] { background: var(--ge-hover); color: var(--ge-tx); }
  .ge-fx-group:active { background: var(--ge-press); }
  /* A group's symbols: a card of its own on the editor's far side from the formula (stand), so the
     field stays where it is and the formula shows; all of them at once, scrolling only where the
     window has no room for them. */
  .ge-fx-drawer { position: absolute; top: calc(100% + ${GAP}px); left: 0; width: 440px; max-width: calc(100vw - 16px); box-sizing: border-box; padding: 5px 8px 7px; border-radius: var(--ge-r-card); background: var(--ge-bg); box-shadow: var(--ge-shadow-card); overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
  .ge-fx[data-above] .ge-fx-drawer { top: auto; bottom: calc(100% + ${GAP}px); }
  .ge-fx-drawer[hidden] { display: none; }
  .ge-fx-title { height: ${TITLE}px; box-sizing: border-box; padding: 3px 4px 1px; color: var(--ge-tx2); font-size: 12px; line-height: 16px; }
  .ge-fx-grid { display: grid; grid-template-columns: repeat(var(--ge-fx-columns, 12), minmax(0, 1fr)); }
  .ge-fx-cell { display: grid; place-items: center; min-width: 0; height: var(--ge-fx-row); padding: 0; border: 0; border-radius: var(--ge-r-ctl); background: transparent; color: var(--ge-tx); overflow: hidden; cursor: pointer; font-size: 17px; }
  .ge-fx-grid:is([data-columns="10"], [data-columns="9"]) .ge-fx-cell, .ge-fx-cell[data-small] { font-size: 13px; }
  .ge-fx-cell:hover { background: var(--ge-hover); }
  .ge-fx-cell:active { background: var(--ge-press); }
  .ge-fx-cell .katex { font-size: 1em; }
  .ge-fx-row { display: flex; align-items: flex-start; padding: 8px 10px; background: var(--ge-field); }
  .ge-fx-field { position: relative; flex: 1 1 0; min-width: 0; }
  .ge-fx-paint, .ge-fx-input { margin: 0; padding: 0; border: 0; font: 14px/1.5 ui-monospace, "SFMono-Regular", Menlo, Consolas, "Courier New", monospace; white-space: pre-wrap; overflow-wrap: anywhere; tab-size: 2; }
  .ge-fx-paint { position: absolute; inset: 0; pointer-events: none; color: var(--ge-tx); overflow: hidden; }
  .ge-fx-input { position: relative; display: block; width: 100%; max-height: min(50vh, calc(100vh - ${AROUND}px)); outline: none; background: transparent; color: transparent; caret-color: var(--ge-tx); resize: none; overflow: auto; scrollbar-width: none; }
  .ge-fx-input::placeholder { color: var(--ge-tx3); }
  .ge-fx-input::selection { background: var(--ge-select); color: transparent; }
  .ge-fx-paint .c { color: light-dark(#2f6fb6, #6aa7e8); }
  .ge-fx-paint .n { color: light-dark(#b05a2b, #e0915e); }
  .ge-fx-paint .b { color: var(--ge-tx3); }
  .ge-fx-paint .o { color: light-dark(#9a4fb4, #c38bdb); }
  /* KaTeX's reason: two lines at the most, its end "…" (what the window keeps room for: AROUND); resting on it
     shows all of it there (data-whole: KaTeX's quote of the TeX whole, scrolling inside what the window
     leaves on the box's far side), and a click puts it on the clipboard. */
  .ge-fx-error { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; padding: 8px 10px; color: var(--ge-btn-danger-text); font-size: 12px; line-height: 1.5; box-shadow: 0 -1px var(--ge-line); overflow-wrap: anywhere; cursor: pointer; transition: background-color 20ms ease-in; }
  .ge-fx-error:hover { background: var(--ge-hover); }
  .ge-fx-error:active { background: var(--ge-press); }
  .ge-fx-error[data-whole] { display: block; -webkit-line-clamp: none; white-space: pre-wrap; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; transition: background-color 20ms ease-in, max-height 160ms cubic-bezier(.2, 0, 0, 1); }
  .ge-fx[data-above] .ge-fx-error { order: -1; box-shadow: 0 1px var(--ge-line); }
  .ge-fx-error b { font-weight: 600; }
  .ge-fx-error-copy { display: block; margin-top: 2px; color: var(--ge-tx3); white-space: normal; animation: ge-fx-copy-in 120ms ease-out; }
  @keyframes ge-fx-copy-in { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .ge-fx-error[data-whole], .ge-fx-error-copy { transition: none; animation: none; } }
  .ge-fx-error[hidden] { display: none; }
`;
const RECENT = "gallery-edit:formula-recent";
const PLACEHOLDER = { block: "|x| = \\begin{cases} x, & x \\ge 0 \\\\ -x, & x < 0 \\end{cases}", inline: "E = mc^2" };

/**
 * What the status line says of a formula, in the text and as a block alike: `kept(tex, was)` once
 * the box is closed on it (`was`: it had TeX before), `peculiar` for one written so the page
 * cannot edit it, `unloaded(inserting)` when KaTeX cannot be loaded (to insert a formula, or to change one).
 */
export const formulaSays = {
  kept: (tex, was) => (!tex ? t("公式已清空 · Ctrl+Z 撤销") : was ? t("已修改公式 · Ctrl+Z 撤销") : t("已插入公式 · Ctrl+Z 撤销")),
  peculiar: t("这个公式的写法特殊，暂不能在页面上修改，请让 Agent 修改。"),
  unloaded: (inserting) => (inserting ? t("公式功能没能加载，不能插入公式。") : t("公式功能没能加载，不能修改公式。")),
};

// TeX colored: commands, numbers, braces and brackets, the operators ^ _ & and \\.
export const paintTex = (text) => text.replace(/(\\[a-zA-Z]+|\\\\|\\.)|(\d+(?:\.\d+)?)|([{}[\]])|([\^_&])|([^\\\d{}[\]^_&]+)/g,
  (match, command, number, brace, operator) => command ? `<span class="${command === "\\\\" ? "o" : "c"}">${escapeTyped(command)}</span>`
    : number ? `<span class="n">${number}</span>` : brace ? `<span class="b">${brace}</span>` : operator ? `<span class="o">${escapeTyped(operator)}</span>` : escapeTyped(match));

// What was put in lately (at most twelve: a line's worth of symbols), this browser's.
const recentFormulas = recentList(RECENT, { max: 12, valid: (entry) => Array.isArray(entry) && typeof entry[0] === "string", same: (a, b) => a[0] === b[0] });

// What was put in lately as a line of twelve columns, from the newest as far as it goes: each as wide
// and as high as it is drawn in its own section, a template taking the columns that asks, the line as
// high as the tallest. (An entry's last item says it is drawn small, as that section's are.)
function recentSection() {
  const entries = [];
  let height = ROW;
  let used = 0;
  for (const [snippet, shown, name] of recentFormulas.read()) {
    const own = (section) => section.entries.find((entry) => entry[0] === snippet);
    const section = GROUPS.flatMap(({ sections }) => sections).find(own) ?? { columns: 12, entries: [[snippet]] };
    const span = Math.ceil((own(section)[3] ?? 1) * 12 / section.columns);
    if (used + span > 12) break;
    used += span;
    height = Math.max(height, section.height ?? ROW);
    entries.push([snippet, shown, name, span, section.columns < 12]);
  }
  return { title: t("最近使用"), columns: 12, height, entries };
}

// What a group's card shows: 常用 has what was put in lately first, a line of its own.
function sectionsOf(group) {
  const recent = group.recent ? recentSection() : null;
  return recent?.entries.length > 0
    ? [recent, ...group.sections.map((section, index) => (index === 0 && !section.title ? { ...section, title: group.name } : section))]
    : group.sections;
}

// How high a group's card stands.
const cardHeight = (group) => PADDING + sectionsOf(group).reduce((sum, { title, columns, height = ROW, entries }) => {
  const slots = entries.reduce((count, [, , , span = 1]) => count + span, 0);
  return sum + (title ? TITLE : 0) + Math.ceil(slots / columns) * height;
}, 0);

/**
 * Open the editor. value: the TeX; display: a display formula (its placeholder, KaTeX's display
 * mode); anchor(): the rectangle it goes below (above where there is no room), `center` centered
 * under it, else its left edge with it; onInput(tex, error) as it changes, onSubmit(tex) when it is
 * left; say(text, tone), the status line (KaTeX's reason copied). Returns { node, close, get value, focus }.
 */
export function openFormulaPanel({ value = "", display = false, anchor, center = false, onInput = () => {}, onSubmit = () => {}, say = () => {} }) {
  addStyle(STYLE);
  const paint = element("pre", { class: "ge-fx-paint", "aria-hidden": "true" });
  const input = element("textarea", { class: "ge-fx-input", rows: "1", spellcheck: "false", autocomplete: "off", placeholder: display ? PLACEHOLDER.block : PLACEHOLDER.inline, "aria-label": t("公式（LaTeX）") });
  input.value = value;
  const error = element("div", { class: "ge-fx-error", role: "alert", hidden: "" });
  const drawer = element("div", { class: "ge-fx-drawer", hidden: "" });
  const bar = element("div", { class: "ge-fx-bar", role: "toolbar", "aria-label": t("插入符号") });
  const node = element("div", { class: "ge-fx", role: "dialog", "aria-label": display ? t("编辑公式块") : t("编辑公式") },
    drawer, element("div", { class: "ge-fx-body" }, bar, element("div", { class: "ge-fx-row" }, element("div", { class: "ge-fx-field" }, paint, input)), error));
  let closed = false;
  let open = null; // the group whose drawer shows
  let fails = null; // KaTeX's reason, as the line below the field shows it
  let entire = null; // and whole (renderTex's whole): what resting on that line shows and a click copies
  let held = false; // a symbol was clicked: what it makes of the editor's height waits (land)

  // ---------- the symbol bar ----------
  const buttons = GROUPS.map((group) => {
    const button = element("button", { type: "button", class: "ge-fx-group", text: group.name, "aria-expanded": "false" });
    button.addEventListener("click", () => showGroup(open === group ? null : group));
    bar.append(button);
    return button;
  });
  const cell = (entry) => {
    const [snippet, shown, name, span = 1, small = false] = entry;
    const { html } = renderTex(shown ?? snippet.replaceAll("#", "{\\square}"));
    const button = element("button", { type: "button", class: "ge-fx-cell", "aria-label": name ?? snippet.replaceAll("#", "□"), html: html || escapeTyped(snippet) });
    if (span > 1) button.style.gridColumn = `span ${span}`;
    button.toggleAttribute("data-small", small);
    tooltip(button, name ?? snippet.replaceAll("#", "□"), name ? snippet.replaceAll("#", "□") : null);
    button.addEventListener("click", () => put(entry));
    return button;
  };
  function showGroup(group) {
    open = group;
    GROUPS.forEach((each, index) => buttons[index].setAttribute("aria-expanded", String(each === group)));
    const opening = drawer.hidden && Boolean(group);
    drawer.hidden = !group;
    node.toggleAttribute("data-open", Boolean(group));
    if (!group) return;
    if (opening) queueMicrotask(() => appear(drawer, null, { typed: true })); // its opacity alone, as the editor's: nothing by the field moves (ui.mjs)
    drawer.setAttribute("aria-label", group.name);
    drawer.replaceChildren(...sectionsOf(group).flatMap(({ title, columns, height = ROW, entries }) => [
      ...(title ? [element("div", { class: "ge-fx-title", text: title })] : []),
      element("div", { class: "ge-fx-grid", "data-columns": String(columns), style: `--ge-fx-columns: ${columns}; --ge-fx-row: ${height}px` }, ...entries.map(cell)),
    ]));
    drawer.scrollTop = 0;
  }
  function put(entry) {
    const { text, caret } = fillSnippet(input.value, input.selectionStart, input.selectionEnd, entry[0]);
    input.value = text;
    input.focus();
    input.setSelectionRange(caret, caret);
    recentFormulas.use(entry.slice(0, 3));
    held = node.matches(":hover");
    draw();
    fit();
  }

  // ---------- the field ----------
  function draw() {
    const tex = input.value;
    paint.innerHTML = `${paintTex(tex)}\n`;
    const read = tex.trim() ? renderTex(tex, display) : null;
    fails = read?.error ?? null;
    entire = read?.whole ?? fails;
    if (held) caretShown();
    else size();
    paint.scrollTop = input.scrollTop;
    onInput(tex, fails);
  }
  // What the editor is as high as: the field's lines and KaTeX's reason.
  function size() {
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
    error.hidden = !fails;
    reason(false);
  }
  // KaTeX's reason below the field: two lines at the most; resting on it REVEAL ms shows all of it there
  // (`full`: KaTeX's quote of the TeX whole, and what a click does), as high as it is up to what the window
  // leaves on the box's far side (where place() keeps a group's card room), growing to it and scrolling in it;
  // a click copies it whole, saying so there and on the status line. Neither closes the box nor takes the keys.
  let reveal = 0;
  let copied = false;
  function reason(full) {
    clearTimeout(reveal);
    let from = 0;
    let room = 0;
    if (full) {
      from = error.offsetHeight;
      const box = node.getBoundingClientRect();
      room = Math.max(0, below ? document.documentElement.clientHeight - MARGIN - GAP - LEAST - box.bottom : box.top - MARGIN - GAP - LEAST);
    } else copied = false;
    error.toggleAttribute("data-whole", full);
    error.style.maxHeight = "";
    error.replaceChildren(...(fails ? [
      element("b", { text: t("无效的公式：") }), full ? entire : fails,
      ...(full ? [element("span", { class: "ge-fx-error-copy", text: copied ? t("已复制") : t("点击复制") })] : []),
    ] : []));
    if (!full) return;
    const to = Math.min(error.scrollHeight, from + room);
    error.style.maxHeight = `${from}px`;
    void error.offsetHeight; // from there
    error.style.maxHeight = `${Math.max(from, to)}px`;
    fit();
  }
  error.addEventListener("pointerenter", () => {
    clearTimeout(reveal);
    if (!error.hasAttribute("data-whole")) reveal = setTimeout(() => { if (!closed && !held && fails) reason(true); }, REVEAL);
  });
  error.addEventListener("pointerleave", () => {
    clearTimeout(reveal);
    if (!error.hasAttribute("data-whole")) return;
    reason(false);
    fit();
  });
  error.addEventListener("transitionend", (event) => { if (event.propertyName === "max-height") fit(); });
  error.addEventListener("click", () => {
    if (!fails) return;
    input.focus();
    navigator.clipboard?.writeText(`${t("无效的公式：")}${entire}`).then(() => {
      copied = true;
      const hint = error.querySelector(".ge-fx-error-copy");
      if (hint) hint.textContent = t("已复制");
      else if (!closed && error.matches(":hover")) reason(true);
      say(t("已复制报错"));
    }, () => say(t("没能复制：浏览器不允许写剪贴板。"), "error"));
  });
  // The caret's line in view in a field keeping its height: what stands before the caret ends as low as that line.
  function caretShown() {
    const { value, selectionEnd: caret } = input;
    input.value = value.slice(0, caret);
    const end = input.scrollHeight;
    input.value = value;
    input.setSelectionRange(caret, caret);
    input.scrollTop = end - input.clientHeight;
  }
  // What a symbol clicked left waiting, a key pressed or the pointer gone.
  function land() {
    if (!held) return;
    held = false;
    size();
    paint.scrollTop = input.scrollTop;
    place();
  }
  node.addEventListener("pointerleave", land);
  // A press anywhere else on the editor leaves the keys in the field.
  node.addEventListener("mousedown", (event) => { if (event.target !== input) event.preventDefault(); });
  input.addEventListener("input", () => {
    held = false;
    draw();
    place();
  });
  input.addEventListener("scroll", () => { paint.scrollTop = input.scrollTop; });
  input.addEventListener("keydown", (event) => {
    land();
    event.stopPropagation(); // the page's shortcuts are not the field's
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === "Enter" && !event.shiftKey && !event.altKey && (event.ctrlKey || event.metaKey || whole())) {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (open) showGroup(null); // a group's symbols first
      else submit();
    } else if (event.key === "Tab") {
      event.preventDefault();
      const at = nextPlace(input.value, event.shiftKey ? input.selectionStart : input.selectionEnd, event.shiftKey);
      if (at !== null) input.setSelectionRange(at, at);
    }
  });
  // The whole field selected (or nothing in it): Enter keeps the formula, else it is a new line.
  const whole = () => input.selectionStart === 0 && input.selectionEnd === input.value.length;

  function submit() {
    if (closed) return;
    close();
    onSubmit(input.value);
  }
  function close() {
    closed = true;
    clearTimeout(reveal);
    fadeAway(node); // a picture of it fades out (ui.mjs), the editor itself gone at once
    removeEventListener("scroll", follow, true);
    removeEventListener("resize", stand);
  }

  // The side the editor stands on, below the anchor or above it, centered on it or at its left edge:
  // the first with room for the editor and the tallest group's card, else the one with more room.
  // Chosen as it opens and as the page (or a box it is in) scrolls or the window changes size; once
  // the anchor has scrolled out of the window the side stays and the editor goes with it.
  let below = true;
  function stand() {
    if (closed || !node.isConnected) return;
    const rect = anchor();
    const view = document.documentElement.clientHeight;
    if (rect.bottom > 0 && rect.top < view) {
      const need = node.offsetHeight + GAP + Math.max(...GROUPS.map(cardHeight));
      const under = view - MARGIN - rect.bottom - GAP;
      const over = rect.top - GAP - MARGIN;
      below = need <= under || (need > over && under >= over);
    }
    node.toggleAttribute("data-above", !below);
    node.style.left = `${Math.round(placeBox(rect, { width: node.offsetWidth, height: 0 }, { align: center ? "center" : "start" }).left)}px`;
    place();
  }
  // By the edge nearest the anchor, so that what grows goes on the far side: its top below the anchor,
  // its bottom above it (inside the window while the anchor shows in it, with room for a card at the least).
  function place() {
    if (closed || !node.isConnected) return;
    const rect = anchor();
    const view = document.documentElement.clientHeight;
    const height = node.offsetHeight;
    const shows = rect.bottom > 0 && rect.top < view;
    const top = below ? rect.bottom + GAP : rect.top - GAP - height;
    const card = GAP + LEAST;
    const inside = shows ? Math.max(MARGIN + (below ? 0 : card), Math.min(top, view - MARGIN - height - (below ? card : 0))) : top;
    node.style.top = below ? `${Math.round(inside)}px` : "auto";
    node.style.bottom = below ? "auto" : `${Math.round(view - inside - height)}px`;
    fit();
  }
  // A group's card given what the window leaves it.
  function fit() {
    const body = node.getBoundingClientRect();
    const room = below ? document.documentElement.clientHeight - MARGIN - body.bottom - GAP : body.top - GAP - MARGIN;
    drawer.style.maxHeight = `${Math.max(LEAST, Math.floor(room))}px`;
  }
  const follow = (event) => { if (!node.contains(event.target)) stand(); };
  addEventListener("scroll", follow, { capture: true, passive: true });
  addEventListener("resize", stand);

  mount(node);
  draw();
  stand();
  appear(node, null, { typed: true }); // its opacity alone: the field typed into never moves (ui.mjs)
  input.focus();
  input.select();
  return { node, close, focus: () => input.focus(), get value() { return input.value; }, get closed() { return closed; } };
}
