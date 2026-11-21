// The icon picker of the workbench's sidebar (docs/workbench.md "The sidebar", **Row icons**): the page's
// own picker (src/editor/page/emoji-picker/, the 图标 picker a document's header opens: 表情符号 / 图标 /
// 上传) shown in a frame of its own over the whole workbench (GET /__gallery/edit/icon-picker,
// src/editor/page/icon-frame.mjs), so that the workbench draws none of its own. The two windows talk by
// postMessage, same origin alone, every message { protocol: ICON_PICKER, type, ... }:
//
//   frame -> workbench   ready    the frame's module is loaded: it takes `open` now
//                        shown    { id }: the picker of that `open` stands, the frame's color-scheme the workbench's,
//                                 so the frame may be shown (until then it is transparent and takes no pointer: a
//                                 frame whose color-scheme is not its element's is painted opaque)
//                        pick     { id, value }: the reader chose `value` (an icon value, shared/emoji/icon-value.mjs;
//                                 null: 移除); 随机 sends one for each press, the picker staying open
//                        notice   { text }: what the picker tells the reader (an upload too large), the workbench's toast
//                        closed   { id }: the picker closed (a pick, Esc, a press outside it): the frame goes
//   workbench -> frame   open     { id, origin: { left, top, right, bottom, width, height } (the row's icon, in the
//                                 window's coordinates, which are the frame's), value (the icon now, or null),
//                                 theme ("light" | "dark"), pictures (whether an image may be the icon: a document
//                                 of this workspace's; its upload and custom emojis go into `slug`'s folder with `token`) }
//                        close    { id }: close it (another row's icon was clicked meanwhile)

/** The protocol name every message of the sidebar's icon picker carries. */
export const ICON_PICKER = "gallery-icon-picker";

/** Where the frame is served (src/server/routes.mjs). */
export const ICON_PICKER_ROUTE = "/__gallery/edit/icon-picker";
