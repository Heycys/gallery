import { firstHost, newHost } from "../../page/core.mjs";
import { caretAt, editable } from "../../page/caret.mjs";
import { addStyle } from "../../page/ui.mjs";
import { capsFor } from "../registry.mjs";
import { detailsContent, detailsTitle } from "./index.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// 折叠列表 on the page. A block turned into one goes into its content, the title left empty with the
// caret in it (convert.mjs); a new one is open while edited, with a content region holding an empty
// paragraph. Enter in its title puts the caret into its content, opened. Clicking its title to type
// does not open or close it (`click`).

/** A disclosure made again from the clipboard's description (its type's `build`, builders.mjs). */
export function build({ doc, block, inline, inner }) {
  const details = newDetails(doc);
  detailsTitle(details).append(...inline(block.html));
  if (block.blocks.length > 0) detailsContent(details).replaceChildren(...inner(block.blocks));
  return details;
}

/** A new disclosure, open while edited: its title (a text block) and a content region holding an empty paragraph. */
export function newDetails(doc, title = "") {
  const details = doc.createElement("details");
  details.className = "doc-details";
  details.open = true;
  for (const [name, value] of [["data-ge-new", ""], ["data-ge-type", "details"], ["data-ge-unit-kind", "details"]]) details.setAttribute(name, value);
  const summary = doc.createElement("summary");
  const label = doc.createElement("span");
  label.className = "doc-details-summary-label";
  for (const [name, value] of [["contenteditable", "true"], ["data-ge-new", ""], ["data-ge-kind", "label"], ["data-ge-caps", capsFor("label")]]) label.setAttribute(name, value);
  label.innerHTML = title;
  summary.append(label);
  const content = doc.createElement("div");
  content.className = "doc-details-content";
  for (const [name, value] of [["data-ge-box", ""], ["data-ge-box-kind", "details"], ["data-ge-pure", ""]]) content.setAttribute(name, value);
  content.append(newHost(doc, "paragraph"));
  details.append(summary, content);
  return details;
}

// A content the file has empty (an Agent's: emptied on the page, it keeps an empty paragraph):
// a placeholder that says so, and a click on it makes a paragraph there (insert/ clickBlank).
const EMPTY = `
  [data-ge-editing] .doc-details-content[data-ge-box]:not(:has(> *))::before { content: ${JSON.stringify(t("空白折叠区块。点击或拖动区块到这里。"))}; display: block; padding: 3px 2px; border-radius: 4px; color: var(--ge-tx3); cursor: pointer; transition: background 20ms ease-in; }
  [data-ge-editing] .doc-details-content[data-ge-box]:not(:has(> *)):hover::before { background: var(--ge-hover); }
`;

// A disclosure's title takes no fill under the pointer, hovered or edited: plain.
// It is text one edits, so the pointer over it is the text cursor, as over a code block's title
// (code/page.mjs); the summary's arrow keeps the kit's pointer (it opens and closes the block).
//
// Its arrow (the summary's ::before, in the summary's first column, outside the title) is a code
// block's (code.css `.doc-code-fold`): no fill under the pointer (the user's 2026-11-19), only a short
// one while pressed, a 20px square with 4px corners (the summary's ::after, under the arrow) of the
// code block's `--doc-code-pressed`; nothing under the pointer or pressed on the title.
const STYLE = `
  [data-ge-editing] .doc-details-summary-label[contenteditable="true"] { --ge-text-tint: none; cursor: text; }
  [data-ge-editing] .doc-details > summary { position: relative; }
  [data-ge-editing] .doc-details > summary::before { position: relative; z-index: 1; }
  [data-ge-editing] .doc-details > summary::after { content: ""; position: absolute; left: 4px; top: calc(var(--doc-block-title-padding, 5px) + var(--doc-body-line-height, 26px) / 2 - 10px); width: 20px; height: 20px; border-radius: 4px; pointer-events: none; }
  [data-ge-editing] .doc-details > summary:active:not(:has(.doc-details-summary-label:hover))::after { background-color: var(--doc-code-pressed); }
`;

/** A disclosure's title, with what the editor gives it: struct (a structural undo step), say and limitText. */
export function create({ struct, say, limitText }) {
  addStyle(STYLE);
  addStyle(EMPTY);
  // Enter in a disclosure's title: the caret goes into its content, opened. True when handled.
  function enter(host) {
    const details = host.getAttribute("data-ge-kind") === "label" ? host.closest("details") : null;
    if (!details) return false;
    details.open = true;
    const content = detailsContent(details);
    const first = content && firstHost(content);
    if (first) caretAt(first, "start");
    else if (content?.hasAttribute("data-ge-box")) {
      const paragraph = newHost(document, "paragraph");
      struct([content], [], () => {
        content.prepend(paragraph);
        return { touched: [paragraph], focus: paragraph };
      });
      caretAt(paragraph, "start");
    } else say(limitText(host, "split"));
    return true;
  }

  return {
    keys: { enter: ({ host }) => enter(host) },
    /** A click in its title, to type there, neither opens nor closes it. */
    click(event) {
      if (editable(event.target)?.closest("summary")) event.preventDefault();
      return false;
    },
  };
}
