import { closePopup, esc, openPopup, showSnackbar, style } from "../emoji-picker/support.mjs";
import { addStyle } from "../ui.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// The 上传 / 链接 menu of media blocks (images, files, bookmarks and embeds), right below the
// block's placeholder (or the block), centered:
// tabs (上传, 链接) when there are two, then the tab's content. 上传: a button
// choosing a file (a file dropped on the menu goes too); 链接: a field, a blue button under it and a
// line of gray text; Enter goes too. Esc or a press outside closes it. Drawn in the icon picker's
// popup layer (emoji-picker/support.mjs: its older palette, --c-* and --ca-*, light and dark); carries data-doc-dev.
//
// openMediaMenu(anchor, options): anchor, the element it opens below;
//   tabs      [{ key: "upload" | "link", label }], in that order, the first shown first
//   upload    { label, accept, primary, caption }: the button's text, the file types it takes; primary: the
//             blue button (a file block's 选择文件) instead of the outlined one, with a gray line under it (caption)
//   width     the menu's, in px (300 for a file, a bookmark and an embed, 360 for an image)
//   link      { placeholder, button, caption, invalid }: the field's placeholder, the button's text,
//             the gray line under it, what an address that is no link says
//   onUpload(file), onEmbed(url): what was chosen (the menu closed already)

const STYLE = `
  /* A card (look.mjs: 14px round, --ge-shadow-card); its tabs and field at the controls' --ge-r-ctl. */
  .nmedia-menu { max-width: calc(100vw - 24px); border-radius: var(--ge-r-card); background: var(--c-popBac); box-shadow: var(--ge-shadow-card); overflow: hidden; color: var(--c-texPri); user-select: none; }
  .nmedia-menu-tabs { display: flex; height: 40px; padding: 0 8px; box-shadow: inset 0 -1px 0 var(--ca-borSecTra); font-size: 14px; }
  .nmedia-menu-tab-wrap { position: relative; padding: 6px 0; }
  .nmedia-menu-tab { display: inline-flex; align-items: center; height: 28px; padding: 0 8px; border-radius: var(--ge-r-ctl); line-height: 1.2; color: var(--c-texTer); cursor: pointer; white-space: nowrap; }
  .nmedia-menu-tab:hover { background: var(--ca-bacIntTra); }
  .nmedia-menu-tab.active { color: var(--c-texPri); }
  .nmedia-menu-tab.active::after { content: ""; position: absolute; left: 8px; right: 8px; bottom: 0; border-bottom: 2px solid var(--c-texPri); }
  .nmedia-menu-body { padding: 12px 12px 10px; }
  .nmedia-menu-inner { display: flex; justify-content: center; padding: 4px; }
  /* Its buttons are the editor's one button look (look.mjs BUTTONS): the pale blue primary, here what the tab does. */
  .nmedia-menu-upload, .nmedia-menu-embed { width: 100%; font-size: 14px; }
  .nmedia-menu-link { flex-direction: column; align-items: stretch; gap: 8px; }
  .nmedia-menu-input { display: flex; align-items: center; gap: 4px; width: 100%; height: 28px; padding: 3px 6px; border-radius: var(--ge-r-ctl); background: var(--ca-bacSecTra); box-shadow: 0 0 0 1px var(--ca-borPriTra); box-sizing: border-box; }
  .nmedia-menu-input:focus-within { box-shadow: var(--c-inpBluFocRin); }
  .nmedia-menu-input input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; padding: 0; font: inherit; font-size: 14px; line-height: 20px; color: var(--c-texPri); }
  .nmedia-menu-input input::placeholder { color: var(--c-texTer); }
  .nmedia-menu-embed { max-width: 300px; margin: 0 auto; }
  .nmedia-menu-caption { margin: -6px 0 4px; padding: 4px 0; font-size: 12px; line-height: 1.4; color: var(--c-texSec); text-align: center; }
  .nmedia-menu.dragover .nmedia-menu-body { background: var(--ca-bluBacSecTra); }
  .nmedia-menu-choose { margin-top: 8px; }
`;

let menu = null; // the popup open

/** An address as a link: a scheme added where none was written; { url, error }. */
function normalizeLink(raw) {
  let url = String(raw ?? "").trim();
  if (!url) return { url: "" };
  if (!/^[a-z][\w+.-]*:/i.test(url) && /^[\w-]+(\.[\w-]+)+(:\d+)?(\/|\?|#|$)/.test(url)) url = `https://${url}`;
  if (!/^(https?:\/\/[^\s]+\.[^\s]+|https?:\/\/localhost[^\s]*)/i.test(url)) return { url, error: t("请输入有效的链接。") };
  return { url };
}

/** Choose a file (of `accept`'s types); `done(file)`. */
function pickFile(accept, done) {
  const input = document.createElement("input");
  input.type = "file";
  if (accept) input.accept = accept;
  input.addEventListener("change", () => { const file = input.files?.[0]; if (file) done(file); });
  input.click();
}

export function openMediaMenu(anchor, { tabs, width, upload = {}, link = {}, onUpload, onEmbed }) {
  closeMediaMenu();
  style();
  addStyle(STYLE);
  const el = document.createElement("div");
  el.className = "nmedia-menu";
  el.style.width = `${width}px`;
  el.setAttribute("role", "dialog");
  el.setAttribute("data-doc-dev", "");
  const render = (current) => {
    el.innerHTML = (tabs.length > 1 ? `<div class="nmedia-menu-tabs" role="tablist">${tabs.map(({ key, label }) =>
      `<div class="nmedia-menu-tab-wrap"><div role="tab" class="nmedia-menu-tab${key === current ? " active" : ""}" aria-selected="${key === current}" data-tab="${key}">${esc(label)}</div></div>`).join("")}</div>` : "")
      + `<div class="nmedia-menu-body">${current === "upload"
        ? (upload.primary
          ? `<div class="nmedia-menu-inner nmedia-menu-link"><div role="button" tabindex="0" class="ge-btn nmedia-menu-embed nmedia-menu-choose" data-primary data-do="upload">${esc(upload.label ?? t("选择文件"))}</div>${upload.caption ? `<div class="nmedia-menu-caption">${esc(upload.caption)}</div>` : ""}</div>`
          : `<div class="nmedia-menu-inner"><div role="button" tabindex="0" class="ge-btn nmedia-menu-upload" data-primary data-do="upload">${esc(upload.label ?? t("上传文件"))}</div></div>`)
        : `<div class="nmedia-menu-inner nmedia-menu-link"><div class="nmedia-menu-input"><input type="url" placeholder="${esc(link.placeholder ?? t("粘贴链接…"))}" autocomplete="off"></div>`
          + `<div role="button" tabindex="0" class="ge-btn nmedia-menu-embed" data-primary data-do="embed">${esc(link.button ?? t("嵌入链接"))}</div>`
          + (link.caption ? `<div class="nmedia-menu-caption">${esc(link.caption)}</div>` : "") + "</div>"}</div>`;
    const input = el.querySelector("input");
    if (input) {
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          embed();
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          closeMediaMenu();
        }
      });
      requestAnimationFrame(() => input.focus({ preventScroll: true }));
    }
  };
  const embed = () => {
    const { url, error } = normalizeLink(el.querySelector("input")?.value);
    if (!url) return;
    if (error) return showSnackbar(link.invalid ?? error);
    closeMediaMenu();
    onEmbed(url);
  };
  el.addEventListener("mousedown", (event) => { if (!event.target.closest("input")) event.preventDefault(); });
  // A file dropped on the menu's 上传 tab goes as one chosen.
  const hasFiles = (event) => [...(event.dataTransfer?.types ?? [])].includes("Files") && el.querySelector('[data-do="upload"]');
  el.addEventListener("dragover", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    el.classList.add("dragover");
  });
  el.addEventListener("dragleave", (event) => { if (!el.contains(event.relatedTarget)) el.classList.remove("dragover"); });
  el.addEventListener("drop", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    el.classList.remove("dragover");
    const file = event.dataTransfer.files?.[0];
    if (file) {
      closeMediaMenu();
      onUpload(file);
    }
  });
  el.addEventListener("click", (event) => {
    const tabNode = event.target.closest("[data-tab]");
    if (tabNode) return render(tabNode.dataset.tab);
    const act = event.target.closest("[data-do]")?.dataset.do;
    if (act === "upload") pickFile(upload.accept, (file) => {
      closeMediaMenu();
      onUpload(file);
    });
    else if (act === "embed") embed();
  });
  render(tabs[0].key);
  const rect = anchor.getBoundingClientRect();
  const popup = openPopup({ origin: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }, placement: "bottom", align: "center", gap: 0, content: el });
  menu = popup;
  const onKey = (event) => {
    if (event.key !== "Escape" || menu !== popup) return;
    event.preventDefault();
    event.stopPropagation();
    closeMediaMenu();
  };
  document.addEventListener("keydown", onKey, true);
  popup.onClose = () => {
    document.removeEventListener("keydown", onKey, true);
    if (menu === popup) menu = null;
  };
  return popup;
}

export function closeMediaMenu() {
  if (menu && !menu.closed) closePopup(menu);
  menu = null;
}
