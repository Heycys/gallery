// 详情卡片 (detail card): the kit's dialog.doc-dialog, opened by a link to it (#id) in the text.
// Its content region (.doc-dialog-content) is a box that takes what a section takes, an ordinary
// editing area: a heading first in it is a block like any other, and nothing binds one to the card.
// It is a chapter: it stands at the end of the page. page.mjs: a new one from the selected text;
// file.mjs: its markup in report.html.
//
// Where the engines reach it (src/editor/page/ unless named): typing/ (`keys.around`, page.mjs:
// Esc in an open one closes it), the workbench, undo, 搜索文档 and a page shown again (`modalOps`,
// page.mjs: the cards open, `show`, `kept`, `reopen`), format-bar/ (the card button), links/ (its entry's card, a click on the entry opening it), core.mjs (saved only while a link opens it: nodeOf; the trigger
// class on links: serializeNode), commit.mjs (a card has no block id; once written it is taken in as a card of the file: adoptKeyed, keyedAway),
// drag/, caret.mjs, resize/ (an open card's content stands for the page), ../source/
// (finding cards: dialog(); ids the file uses; what the file holds of a card a commit made:
// keyedFacts), src/transfer/ (a page's Markdown: `clipboard`; its charts' pictures: browser.mjs).
// Its look: the kit's styles/dialog.css, opened by dialogs.js (src/render/kit/). Its content region
// is its description's part (src/shared/components/dialog.mjs, through ../kit.mjs).
import { DIALOG, classOf, stepOf } from "../kit.mjs";
import { DIALOG_ICON } from "../icons.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { boxed, flowRows } from "../read-rows.mjs";

// The <dialog> of a card, from it or from what it holds.
const dialogOf = (element) => (element.localName === "dialog" ? element : element.closest("dialog") ?? element);

/** The class of a link that opens a detail card (dialogs.js). */
export const DIALOG_TRIGGER = "doc-dialog-trigger";

export default {
  name: "dialog",
  // A link in the text that opens a card, a chip as padded as code: Backspace right of it (Delete
  // left of it) takes it whole, as a chip of the text goes; its words are edited from inside it.
  entry: { at: `a.${DIALOG_TRIGGER}`, removed: t("入口已移除：页面上没有地方能打开这张详情卡片了 · Ctrl+Z 撤销") },
  units: {
    // The server finds detail cards by their element (findUnits). No block of the page's flow, a card
    // is written after it, as a disclosure: a selection cannot take one, so no copy says a kind.
    dialog: {
      chapter: true, fixed: true, boxed: true,
      clipboard: { kind: "toggle", read: cardInMarkdown, apart: DIALOG.match, reached: (unit) => entryOf(unit) !== null },
      // gallery read (../read-rows.mjs): boxed where it stands, its id and the links that open it (by their lines), its blocks.
      // A card of the file is no unit of the page (its <dialog> holds its box): the reader writes it so too, by its box's kind.
      read: {
        name: "详情卡片",
        rows(node, view) {
          const { tools } = view;
          const dialog = dialogOf(node.el);
          const id = dialog.getAttribute("id");
          const openers = id ? [...dialog.ownerDocument.querySelectorAll("a[href]")].filter((link) => link.getAttribute("href") === `#${id}`) : [];
          const said = openers.map((link) => `第 ${tools.lineAt(link.closest("[data-ge-unit]") ?? link) ?? "?"} 行的「${tools.plain(link)}」`);
          return boxed(node, `详情卡片${id ? ` #${id}` : ""} · ${said.length ? `由${said.join("、")}打开` : "没有链接打开它（读者看不到）"}${tools.looks(dialog, { skip: ["id"] })}`, flowRows(node.children, view));
        },
        title: (node) => (dialogOf(node.el).getAttribute("id") ? `#${dialogOf(node.el).getAttribute("id")}` : ""),
        data: (node) => ({ dialog: dialogOf(node.el).getAttribute("id") }),
        lost: () => "详情卡片 {n} 个（挪到最后，打开它的链接只剩文字）",
      },
    },
  },
  boxes: {
    // Its content always holds a block (holdsOne): emptied, it keeps an empty paragraph to write in.
    dialog: { role: "flow", name: t("详情卡片"), groups: true, outer: false, holdsOne: true, selectAll: { content: true, top: true }, classes: [{ rank: 40, class: classOf(stepOf(DIALOG.content)) }] },
  },
  types: {
    dialog: { // its box is the content region
      tag: "dialog", className: "doc-dialog", kind: "dialog", box: "dialog",
      fromSelection: { label: t("详情卡片"), icon: DIALOG_ICON },
      glance: { row: 16, name: "详情卡片", write: "`<a href=\"#x\">` in the text, `<dialog id=\"x\"><h3>…</h3>…</dialog>`", rule: "Kit blocks" },
      // What the save engines need of it (core.mjs nodeOf, commit.mjs adoptKeyed): no unit but known
      // by its id (`keyed`), its content region; written only while something opens it.
      keyed: true, content: (element) => dialogContent(element),
      written: (element) => entryOf(element) !== null,
    },
  },
};

/** A detail card's content region. */
export const dialogContent = (dialog) => dialog.querySelector(DIALOG.content);

/** The first heading with words among a detail card's blocks, or null: what the card goes by where it needs a name. */
export const dialogHeading = (dialog) => [...(dialogContent(dialog)?.children ?? [])].find((block) => block.matches(DIALOG.heading) && block.textContent.trim()) ?? null;

/** What opens a detail card from outside it: the first link to it, or element naming it by data-doc-dialog-open, or null. */
export function entryOf(dialog) {
  const named = `#${dialog.id}`;
  return [...dialog.ownerDocument.querySelectorAll("a[href], [data-doc-dialog-open]")]
    .find((node) => (node.getAttribute("href") === named || node.getAttribute("data-doc-dialog-open") === named) && !dialog.contains(node)) ?? null;
}

// A detail card as a disclosure of a page's Markdown, when something opens it (`reached`): its first
// heading the title, which its body then leaves out, else the words of what opens it.
function cardInMarkdown(unit) {
  const heading = dialogHeading(unit);
  return { title: heading ?? entryOf(unit), content: dialogContent(unit), without: heading };
}

/** The detail card of `doc` an address in the page (#id) names, or null. */
export function cardNamed(doc, href) {
  if (!/^#./.test(href ?? "")) return null;
  let id = href.slice(1);
  try {
    id = decodeURIComponent(id);
  } catch {
    // kept as written
  }
  const card = doc.getElementById(id);
  return card?.matches(DIALOG.match) ? card : null;
}
