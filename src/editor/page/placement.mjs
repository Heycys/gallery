// Where a card or panel that stands by something stands: one rule (an origin, a side, an alignment
// and a gap; put on the other side where it does not fit; kept inside the window),
// the one placement every such card here takes: the link card, the formula editor, the cell bar, the
// format bar, the tooltips and the icon picker's popups (emoji-picker/support.mjs). The block menu
// (menu.mjs place) and what follows the pointer (hints, the size label of resize/) have rules of
// their own. What stands for text (the format bar, a pasted address's 选择视图) stands by its last
// character: textAnchor, besideText.

const TEXT_GAP_X = 4; // its corner this far right of the text's last character
const TEXT_GAP_Y = 8; // and this far below its line (or above the text)
const TEXT_MARGIN = 12; // this far inside the window at the most

/**
 * The left and top (window px, not rounded) of a box of `size` ({ width, height }) by `origin` (a
 * rect), `margin` px inside the window at the most. placement: "bottom" or "top" (below or above
 * the origin), "right" or "left" (beside it); a box that does not fit on the side asked for goes to
 * the opposite one if it fits there (if it fits on neither, it stays on the one asked for), inside the
 * window less its scrollbars. align:
 * along that side, the box's "start", "center" or "end" with the origin's. gap: px between them. x:
 * for "bottom" and "top", where the box's left edge is wanted in place of the alignment's (the format
 * bar stands at the selection's last character).
 */
export function placeBox(origin, { width, height }, { placement = "bottom", align = "start", gap = 0, margin = 8, x, view } = {}) {
  // The window less its scrollbars (a box kept inside innerWidth would run under the page's scrollbar);
  // `view`: another window's { width, height } (the workbench's, for what stands over it).
  const root = globalThis.document?.documentElement;
  const innerWidth = view?.width ?? (root?.clientWidth || globalThis.innerWidth);
  const innerHeight = view?.height ?? (root?.clientHeight || globalThis.innerHeight);
  const clamp = (value, space) => Math.max(margin, Math.min(value, space - margin));
  const alignX = () => x ?? (align === "center" ? origin.left + origin.width / 2 - width / 2 : align === "end" ? origin.right - width : origin.left);
  const alignY = () => (align === "center" ? origin.top + origin.height / 2 - height / 2 : align === "end" ? origin.bottom - height : origin.top);
  if (placement === "bottom" || placement === "top") {
    const below = origin.bottom + gap;
    const above = origin.top - gap - height;
    const fitsBelow = below + height <= innerHeight - margin;
    const fitsAbove = above >= margin;
    const top = placement === "bottom" ? (fitsBelow || !fitsAbove ? below : above) : (fitsAbove || !fitsBelow ? above : below);
    return { left: clamp(alignX(), innerWidth - width), top: clamp(top, innerHeight - height) };
  }
  const right = origin.right + gap;
  const beyond = origin.left - gap - width;
  const fitsRight = right + width <= innerWidth - margin;
  const fitsLeft = beyond >= margin;
  const left = placement === "right" ? (fitsRight || !fitsLeft ? right : beyond) : (fitsLeft || !fitsRight ? beyond : right);
  return { left: clamp(left, innerWidth - width), top: clamp(alignY(), innerHeight - height) };
}

/**
 * Where text (a range) is to what stands for it: its last character (its last piece of a line), not
 * the right edge of its widest line, and the top of its first line, for when there is no room below.
 */
export function textAnchor(range) {
  const box = range.getBoundingClientRect();
  const end = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0).at(-1) ?? box;
  return { right: end.right, bottom: end.bottom, top: box.top };
}

/** The left and top of a box of `size` standing for text (`anchor`: textAnchor): below and right of its last character, above its first line when it does not fit below. */
export const besideText = (anchor, size) => placeBox(anchor, size, { x: anchor.right + TEXT_GAP_X, gap: TEXT_GAP_Y, margin: TEXT_MARGIN });
