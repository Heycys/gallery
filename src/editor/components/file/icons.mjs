import { svg } from "../icons.mjs";

// The file block's icons: the editor's own line drawings (components/icons.mjs svg), no size or color of
// their own: the bar, the menus and the kit's file row (styles/file.css, which draws 上传 and 下载 as a
// mask of these two) set them.

export const FILE_ICONS = {
  // A sheet with its corner folded and an arrow rising from its middle.
  upload: svg('<path d="M6.25 2.75h4.5l4.5 4.5v8.5a1.5 1.5 0 0 1-1.5 1.5h-7.5a1.5 1.5 0 0 1-1.5-1.5v-11.5a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M10.75 2.75v3a1.5 1.5 0 0 0 1.5 1.5h3"/><path d="M10 14v-4.75M7.9 11.1 10 9l2.1 2.1"/>'),
  // An arrow down in a ring.
  download: svg('<circle cx="10" cy="10" r="7.25"/><path d="M10 6.5v6.25M7.4 10.2 10 12.8l2.6-2.6"/>'),
  // A clip.
  paperclip: svg('<path d="M15.2 9.2 9.6 14.8a3.6 3.6 0 0 1-5.1-5.1l6.1-6.1a2.4 2.4 0 0 1 3.4 3.4l-6.1 6.1a1.2 1.2 0 0 1-1.7-1.7l5.4-5.4"/>'),
};
