import { svg } from "../icons.mjs";
import { TABLE_ICONS } from "../../page/table/icons.mjs";

// The media blocks' toolbar icons (an image's, an embed's, the block menus' rows): the editor's own line
// drawings (components/icons.mjs svg) on the same 20 units as the menus' others, the picture in the
// middle 16 of them. They carry no size or color: the toolbar's buttons and the menus set them.
// Plain, a few strokes each (the user, 2026-11-09: bars against a guide line, which were tried, were
// too busy): a side is the editor's own 对齐 lines, the ones a text
// block's and a table's 对齐 › show (table/icons.mjs), so one look says it everywhere; a caption a picture
// (one hill in it) over a line of words; viewing large one line corner to corner with a head at each end; three dots.

export const TOOL_ICONS = {
  // The three sides: the editor's alignment lines (a text block's 对齐 ›, a table's).
  alignLeft: TABLE_ICONS["doc-align-left"],
  alignCenter: TABLE_ICONS["doc-align-center"],
  alignRight: TABLE_ICONS["doc-align-right"],
  // A picture (its frame, one hill in it) over a line of words.
  caption: svg('<rect x="3.75" y="3.25" width="12.5" height="9.5" rx="1.5"/><path d="m4 11.75 4-3.5 4.5 4M3.75 16.25h12.5"/>'),
  // One line from corner to corner, a head at each end.
  expand: svg('<path d="M11.5 4.25h4.25V8.5M8.5 15.75H4.25V11.5M15.25 4.75l-10.5 10.5"/>'),
  // An arrow down onto a line.
  download: svg('<path d="M10 4v9M6.5 9.75l3.5 3.5 3.5-3.5M4.5 16h11"/>'),
  more: svg('<circle cx="5" cy="10" r="1.3" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1.3" fill="currentColor" stroke="none"/>'),
};
