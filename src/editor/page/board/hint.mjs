import { language, t } from "../../../shared/i18n/index.mjs";
import { postAnswer } from "../post.mjs";
import { say } from "../notices.mjs";
import { tooltip } from "../tooltip.mjs";
import { addStyle, element } from "../ui.mjs";

// A note's close: named for a screen reader, its word in the editor's tooltip (no browser title).
function closeButton() {
  const close = element("button", { type: "button", class: "ge-home-hint-close", "aria-label": t("关闭这条说明"), html: CLOSE });
  tooltip(close, t("关闭"));
  return close;
}

// A custom page's first-open note (docs/render.md
// "A custom page", **Notes of a page**): at the top of a page whose page.json says `hint` (the default home
// page's), while the page map says `hint` (src/server/routes.mjs: its note not yet closed in this
// workspace), a short note on its cards: how to move one (the grip at its top-right: drag it), open its
// menu (a click on the same grip: 大小, 设置, 删除), add one (添加自定义块: the first item of the ··· menu at the
// top right of the workbench's bar; a page open alone in a tab has it at the top right of its board) and
// take one out (the menu's 删除), and that a new card or a new page is the Agent's to make, with a sentence
// the reader can copy and say to one (its 复制 button). Its × closes it for good, for the workspace (POST
// /__gallery/pages/<slug>/hint: .gallery/hints.json), whichever browser shows the page next. In the
// editor's look: grays alone, a quiet fill, no colour; the kit's own light and dark through the
// editor's tokens (look.mjs).
//
// Its note of new default cards (showNews), on a page with the default cards (its page.json's
// defaultCards) made before some of them, while the page map says `news`: which default cards it does not
// hold that came since, and that 加到这一页 puts them in the empty spots as 恢复默认卡片 in the page's menu
// does (the board's restoreDefaults: what is missing alone, the cards there untouched, one step of the
// page's undo). A page already made is never changed by itself: the reader is told once, at the top of
// the page, where the first-open note stands, and nothing moves on the board until they ask. Its × (or
// 加到这一页) says it for the workspace (POST /__gallery/pages/<slug>/hint with { cards: true }), which
// 恢复默认卡片 does too.
//
// And the middle of a blank page (showBlank: the workbench's 新建页面, which no one has written yet, while
// the page map says `blank`): that an Agent writes a custom page, any page it likes, a board of cards or
// not, with a request the reader can copy and say to one, as the first-open note's. Nothing of it is the
// file's: once an Agent writes page.html the page is shown again without it.
const STYLE = `
  .ge-home-hint { box-sizing: border-box; max-width: var(--gallery-board-width, 944px); margin: 0 auto 12px; }
  .ge-home-hint-box { position: relative; box-sizing: border-box; max-width: 720px; padding: 14px 44px 14px 16px; border-radius: 10px;
    background: light-dark(rgb(55 53 47 / 4%), rgb(255 255 255 / 4.5%)); color: var(--ge-tx);
    font: 14px/1.6 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", Helvetica, "PingFang SC", "Microsoft YaHei", Arial, sans-serif; }
  .ge-home-hint-box p { margin: 0; }
  .ge-home-hint-box p + p { margin-top: 4px; }
  .ge-home-hint-title { font-weight: 600; }
  .ge-home-hint-box .ge-home-hint-ask { margin-top: 10px; color: var(--ge-tx2); }
  .ge-home-hint-icon { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; margin: 0 2px; vertical-align: -3px; border-radius: 4px; background: var(--ge-hover); color: var(--ge-ico2); }
  .ge-home-hint-icon svg { display: block; width: 10px; height: 12px; fill: currentColor; }
  .ge-home-hint-say { display: flex; align-items: center; gap: 8px; margin-top: 6px; padding: 6px 6px 6px 12px; border-radius: 6px; background: var(--ge-bg); }
  .ge-home-hint-say span { flex: 1; min-width: 0; color: var(--ge-tx); user-select: text; }
  /* 复制 and 加到这一页 are the editor's one button (look.mjs .ge-btn: quiet, primary); the close is the note's own. */
  .ge-home-hint-copy { flex: none; }
  .ge-home-hint-close { flex: none; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; border: 0; border-radius: var(--ge-r-ctl); background: transparent; color: var(--ge-tx2); font: inherit; cursor: pointer; user-select: none; }
  .ge-home-hint-close:hover { background: var(--ge-hover); color: var(--ge-tx); }
  .ge-home-hint-close:active { background: var(--ge-press); }
  .ge-home-hint-close { position: absolute; top: 10px; right: 10px; width: 24px; height: 24px; color: var(--ge-ico3); }
  .ge-home-hint-close svg { display: block; width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; }
  .ge-home-hint-act { margin-top: 8px; }
  .ge-home-hint-box .ge-home-hint-add { margin-left: -2px; }
  .ge-page-blank { box-sizing: border-box; display: flex; justify-content: center; padding: max(48px, 18vh) 16px 48px; }
  .ge-page-blank .ge-home-hint-box { width: 100%; max-width: 520px; padding: 20px 20px 18px; }
  .ge-page-blank .ge-home-hint-title { font-size: 16px; }
`;

const DOTS = '<svg viewBox="0 0 10 16" aria-hidden="true"><circle cx="2.5" cy="2" r="1.25"/><circle cx="7.5" cy="2" r="1.25"/><circle cx="2.5" cy="8" r="1.25"/><circle cx="7.5" cy="8" r="1.25"/><circle cx="2.5" cy="14" r="1.25"/><circle cx="7.5" cy="14" r="1.25"/></svg>';
const CLOSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';

// `template` (t's words, {0}, {1}… where `nodes` go) as the nodes of a line.
function filled(template, nodes) {
  return template.split(/\{(\d+)\}/).map((piece, index) => (index % 2 ? nodes[Number(piece)] ?? "" : piece)).filter((piece) => piece !== "");
}
const icon = (html) => element("span", { class: "ge-home-hint-icon", html });
// A note at the top of the home page, of the editor's UI (never the file's): `kind` its class beside ge-home-hint, `label` what it is called.
const noteOf = (kind, label, box) => element("div", { class: `ge-home-hint${kind ? ` ${kind}` : ""}`, role: "note", "aria-label": label, "data-doc-dev": "" }, box);

/**
 * The note of new default cards, on the home page whose map says `news` ([{ block, name }]), at the top of
 * the page, after the first-open note where that is shown; `restore`, the board's restoreDefaults. Returns
 * the note, or null where none is shown.
 */
export function showNews(map, { restore }) {
  const main = document.querySelector("main.gallery-page");
  if (!map?.news?.length || !main) return null;
  addStyle(STYLE);
  const named = ({ block, name }) => name?.[language === "en" ? "en" : "zh"] ?? name?.zh ?? block;
  const add = element("button", { type: "button", class: "ge-btn ge-home-hint-copy ge-home-hint-add", "data-primary": "", text: t("加到这一页") });
  const close = closeButton();
  const box = element("div", { class: "ge-home-hint-box" },
    element("p", { class: "ge-home-hint-title", text: t("有了新的默认卡片") }),
    element("p", { text: map.news.map(named).join(t("、")) }),
    element("p", { class: "ge-home-hint-ask", text: t("点「加到这一页」放进空位，已有的卡片不动。以后也可以在这一页的菜单中点「恢复默认卡片」。") }),
    element("div", { class: "ge-home-hint-act" }, add),
    close);
  const note = noteOf("ge-home-news", t("新的默认卡片"), box);
  for (const button of [add, close]) button.addEventListener("mousedown", (event) => event.preventDefault());
  const told = () => postAnswer(`/__gallery/pages/${map.slug}/hint`, map.token, { cards: true });
  add.addEventListener("click", async () => {
    add.disabled = true;
    const answer = await restore();
    if (!answer?.ok) {
      add.disabled = false;
      return say(t("没能把卡片放到这一页"), "error");
    }
    note.remove();
    const added = answer.added ?? [];
    say(added.length ? t("已放回默认卡片：{0}", added.map(named).join(t("、"))) : t("默认卡片都在，没有要放回的"));
  });
  close.addEventListener("click", async () => {
    note.remove();
    const answer = await told();
    if (!answer?.ok) say(t("没能记下这条说明已关闭"), "error");
  });
  const first = main.querySelector(":scope > .ge-home-hint");
  if (first) first.after(note);
  else main.prepend(note);
  return note;
}

/**
 * The note shown, on the page whose map (`map`: slug, token) says `hint`, at the top of the page
 * (`main.gallery-page`, before what the page holds). `hosted`: the page stands in a workbench, whose top
 * bar's ··· menu has 添加自定义块 (the words say so), else the page's own at the top right of its board. Returns the
 * note, or null where none is shown.
 */
export function showHint(map, { hosted = false } = {}) {
  const main = document.querySelector("main.gallery-page");
  if (!map?.hint || !main) return null;
  addStyle(STYLE);
  // The sentence offered: one that names Gallery, so that the Agent takes up its skill.
  const ask = t("用 Gallery 在「{0}」这一页加一张卡片，记我每天喝了几杯水。别动我摆好的卡片。", map.title ?? document.title);
  const copy = element("button", { type: "button", class: "ge-btn ge-home-hint-copy", "data-quiet": "", text: t("复制") });
  const close = closeButton();
  const box = element("div", { class: "ge-home-hint-box" },
    element("p", { class: "ge-home-hint-title", text: t("这一页的卡片可以自己摆") }),
    element("p", {}, ...filled(hosted ? t("拖卡片右上角的 {0} 移动它，点一下它打开菜单（大小、设置、删除），点页面右上角的 ··· 里的「添加自定义块」加一张。") : t("拖卡片右上角的 {0} 移动它，点一下它打开菜单（大小、设置、删除），点页面右上方的「添加自定义块」加一张。"), [icon(DOTS)])),
    element("p", { class: "ge-home-hint-ask", text: t("想要新卡片或新页面，跟 Agent 说，比如：") }),
    element("div", { class: "ge-home-hint-say" }, element("span", { text: ask }), copy),
    close);
  const note = noteOf("", t("这一页的说明"), box);
  for (const button of [copy, close]) button.addEventListener("mousedown", (event) => event.preventDefault());
  copy.addEventListener("click", () => {
    // The frame given the focus first: in a workbench a press its mousedown keeps from moving the focus
    // leaves it in the workbench, and Chrome refuses a clipboard write to a document without it
    // ("Document is not focused"), as the board's grip takes it for the page's keys.
    window.focus();
    navigator.clipboard?.writeText(ask).then(() => {
      copy.textContent = t("已复制");
      say(t("已复制这句话，发给 Agent 就行"));
    }, () => say(t("没能复制：浏览器不允许写剪贴板。"), "error"));
  });
  close.addEventListener("click", async () => {
    note.remove();
    const answer = await postAnswer(`/__gallery/pages/${map.slug}/hint`, map.token, {});
    if (!answer?.ok) say(t("没能记下这条说明已关闭"), "error");
  });
  main.prepend(note);
  return note;
}

/**
 * The middle of a blank page (the page map's `blank`: the workbench's 新建页面, which no one has written yet):
 * that an Agent writes it, any page it likes, with a request to copy and say to one. Returns the note, or
 * null where none is shown (no blank page, or no main.gallery-page to show it in).
 */
export function showBlank(map) {
  const main = document.querySelector("main.gallery-page");
  if (!map?.blank || !main) return null;
  addStyle(STYLE);
  const title = map.title ?? document.title;
  const ask = t("用 Gallery 把「{0}」这个自定义页写出来：放上我这周的待办，和离月底还有几天。", title);
  const copy = element("button", { type: "button", class: "ge-btn ge-home-hint-copy", "data-quiet": "", text: t("复制") });
  const box = element("div", { class: "ge-home-hint-box" },
    element("p", { class: "ge-home-hint-title", text: t("这一页还是空的") }),
    element("p", { text: t("自定义页由 Agent 来写：可以是一页卡片，也可以是它为你做的任何网页。") }),
    element("p", { class: "ge-home-hint-ask", text: t("跟 Agent 说你想在这里放什么，比如：") }),
    element("div", { class: "ge-home-hint-say" }, element("span", { text: ask }), copy));
  const note = noteOf("ge-page-blank", t("空白的自定义页"), box);
  copy.addEventListener("mousedown", (event) => event.preventDefault());
  copy.addEventListener("click", () => {
    window.focus(); // as the first-open note's 复制: Chrome writes no clipboard of a document without the focus
    navigator.clipboard?.writeText(ask).then(() => {
      copy.textContent = t("已复制");
      say(t("已复制这句话，发给 Agent 就行"));
    }, () => say(t("没能复制：浏览器不允许写剪贴板。"), "error"));
  });
  main.append(note);
  return note;
}
