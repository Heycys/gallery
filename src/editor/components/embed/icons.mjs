import { svg } from "../icons.mjs";

// The embed block's icons: the editor's own line drawings (components/icons.mjs svg), no size or color
// of their own: the bar, the toolbar and the menus set them.

export const EMBED_ICONS = {
  // An eye in the four corners of a frame: a page taken in.
  linkCaptureEye: svg('<path d="M3.5 7V5.5a2 2 0 0 1 2-2H7M13 3.5h1.5a2 2 0 0 1 2 2V7M3.5 13v1.5a2 2 0 0 0 2 2H7M13 16.5h1.5a2 2 0 0 0 2-2V13"/><path d="M6.25 10S7.7 7.5 10 7.5s3.75 2.5 3.75 2.5-1.45 2.5-3.75 2.5S6.25 10 6.25 10z"/><circle cx="10" cy="10" r=".9" fill="currentColor" stroke="none"/>'),
  // An arrow leaving a corner: the toolbar's 在新标签页中打开 and the menu's 查看原始内容.
  open: svg('<path d="M5.5 14.5 14.5 5.5"/><path d="M7 5.5h7.5V13"/>'),
};
