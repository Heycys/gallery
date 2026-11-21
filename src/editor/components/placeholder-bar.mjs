// The gray bar of a media block left empty (图片, 文件, 网页书签, 嵌入): its markup and its class, spelled
// once, from the class of the block it stands in ("doc-image" has "ge-image-empty"). Its look is
// placeholder.mjs's, one for all of them; each component's index.mjs says its icon and its words. Code that
// finds a bar names its class with barClass too, never by writing .ge-image-empty and the like out.

/** The class of the bar in a block of class `block`. */
export const barClass = (block) => `${block.replace("doc-", "ge-")}-empty`;

/** The bar as markup: `icon` (an svg) and `words`. */
export const barMarkup = (block, icon, words) => `<div class="${barClass(block)}" data-doc-dev role="button">${icon}<span>${words}</span></div>`;

/** A bar of this markup made in `doc`. */
export function barElement(doc, markup) {
  const holder = doc.createElement("template");
  holder.innerHTML = markup;
  return holder.content.firstElementChild;
}
