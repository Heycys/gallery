import { INSTANCE, componentAt } from "./components/installed.mjs";

// 图片放大: which pictures of a report open large when clicked (docs/render.md, "Opening a picture
// large"). One rule for both ways in: the kit's viewer for a reader (src/render/kit/runtime/zoom.js:
// a click, in an export, a build, the preview's 演示视图), and the page editor's while editing
// (editor/components/image/viewer.mjs: a double-click, 展开 and 全屏查看 on an
// image block). Nothing is written for it: a picture is one by where it stands and how large it is
// shown, so an Agent's report gets it without a word in its markup.
//
// A picture is an <img> of the page (main.doc-page), whatever holds it: an image block, a table's
// cell, a card (one of the kit's or a drawing of the report's own), a column, a flowchart's node, a
// list item, a detail card. Not one that is a control's or a link's (a click there is theirs: it
// follows the link, opens the disclosure, chooses the tab), nor one in the own region of an instance
// of a component package (its component's; one in its slot is the document's: componentAt), nor an icon: the page's icon and a panel's or a node's (.doc-icon, emoji
// pictures among them), a link's icon, a bookmark's pictures, a file's; nor a picture shown smaller
// than ZOOM_LEAST each way (an icon's or an emoji's size in a line of text), nor one that did not load.

/** What a picture inside of opens nothing: a control or a link, an icon, the kit's and the preview's own. */
export const ZOOM_SKIP = [
  "a[href]", "button", "summary", "label", "select", "[role=button]", "[role=link]", "[role=tab]", "[data-doc-dialog-open]",
  ".doc-icon", ".doc-link-mention", ".doc-bookmark", ".doc-file",
  ".doc-zoom", "[data-doc-dev]",
].join(", ");

/** The pictures the reader's runtime watches to offer to the keyboard (runtime/zoom.js), those of the rule among them. */
export const ZOOM_PICTURES = ".doc-page img";

/**
 * The runtime's mark on a picture that opens, offered to the keyboard while the page is read (not
 * edited): with it a tab stop, a button's role and a name saying what it does, which the picture
 * itself is no control of its own for the rule (its role is the runtime's). An export of the view
 * takes them off (the image description's runtime).
 */
export const ZOOM_MARK = "data-doc-zoom";

/** The least a picture is shown, in CSS pixels, across or down, to open large. */
export const ZOOM_LEAST = 48;

// A picture loaded: one of pixels has a size of its own; an SVG may have none (no width, height or
// viewBox) and still draw.
const loaded = (img) => img.complete && (img.naturalWidth > 0 || /^data:image\/svg|\.svg(?:[?#]|$)/i.test(img.currentSrc || img.src));

/** Whether `img` opens large when clicked (or double-clicked in the page editor). */
export function zoomable(img) {
  const holder = img?.hasAttribute?.(ZOOM_MARK) ? img.parentElement : img; // the runtime's own role is no control's
  if (img?.localName !== "img" || !img.closest(".doc-page") || holder?.closest(ZOOM_SKIP) || holder.matches(INSTANCE) || componentAt(holder) || !loaded(img)) return false;
  const box = img.getBoundingClientRect();
  return box.width >= ZOOM_LEAST || box.height >= ZOOM_LEAST;
}

/** The words shown under a picture opened large: the caption of the image block or card it is the one picture of, else none. */
export function zoomCaption(img) {
  const figure = img.closest("figure");
  if (!figure || [...figure.querySelectorAll("img")].filter((each) => each.closest("figure") === figure).length !== 1) return null;
  const caption = figure.querySelector(":scope > figcaption, :scope > .doc-figure-caption");
  return caption && caption.textContent.trim() ? caption : null;
}
