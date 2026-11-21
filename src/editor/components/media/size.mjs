// What the media blocks that are sized share (an image's sides, an embed's corners): the width a
// block takes is a share (SPAN of shared/media.mjs, written as a size: the description's `sizes`)
// of the width it stands in, a picture's of the reading width (styles/sizes.css: in effect a width
// in pixels, which a move into a column keeps), never past the width it stands in; and a block close
// to the whole width snaps to it.

/** How near (px) the whole width a dragged block snaps to it. */
export const SNAP = 14;

/** The width the column a media block stands in offers it (px): its parent's, less its padding. */
export function columnRoom(figure) {
  const parent = figure.parentElement;
  const style = getComputedStyle(parent);
  return parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
}

/** The reading width a picture's share is of (px): the page's (styles/sizes.css, 100cqw of .doc-page), else the column's. */
export function readingRoom(figure) {
  return figure.closest(".doc-page")?.clientWidth || columnRoom(figure);
}
