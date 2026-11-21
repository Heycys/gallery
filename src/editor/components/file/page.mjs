import { UPLOAD_LIMITS, sizeLimit } from "../../../shared/media.mjs";
import { ICONS } from "../../page/menu.mjs";
import { TOOL_ICONS } from "../media/icons.mjs";
import { captionOf } from "../media/parts.mjs";
import { FILE_ICONS } from "./icons.mjs";
import { fileParts, linkOf, newFile } from "./index.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// 文件 on the page. A new file block (the
// "/" menu's 文件, made from an empty block: convert.mjs; or a file pasted or dropped in that is no image) is a
// placeholder, a gray bar saying 上传文件, until a file is chosen in the 上传 / 链接 menu
// (media-menu/, 300px: 选择文件, or a link whose file the server downloads; it opens below it at
// once, and on a click: ../media/page.mjs): the file goes to the report's folder (20 MB at most), and the block shows
// its row, its name and size. One undo step. The row hands the file out for saving, as the report
// does. Its caption is a media block's (../media/page.mjs: shown once 标题 asks for it).
// The block menu has 替换文件, 下载 and 标题 (menuItems).

const MAX_BYTES = UPLOAD_LIMITS.file;

/**
 * File blocks on the page, with what the editor gives them: the media blocks' shared parts
 * (`pages.media`: ../media/page.mjs block("file"): the undo steps, say, select, the upload of kind "file":
 * { path, name, size }, the menu, the caption) and fileUrl(path) (where the server hands out a file
 * of the report's folder).
 */
export function create({ pages, fileUrl }) {
  const media = pages.media.block("file");
  const { say } = media;

  /** The 上传 / 链接 menu of a file block, below it. */
  const pick = (figure) => media.pick(figure, {
    tabs: [{ key: "upload", label: t("上传") }, { key: "link", label: t("链接") }],
    width: 300,
    upload: { label: t("选择文件"), primary: true },
    link: { placeholder: t("粘贴文件链接…"), button: t("嵌入链接"), caption: t("适用于任何文件的网址。") },
    onUpload: (file) => uploadInto(figure, file),
    onEmbed: (url) => fetchInto(figure, url),
  });

  // Why a file cannot go in a file block (too big), or null.
  const refusal = (file) => (file.size > MAX_BYTES ? t("文件太大（最多 {0}）。", sizeLimit("file")) : null);

  async function uploadInto(figure, file, options = {}) {
    const refused = refusal(file);
    if (refused) return say(refused, "error");
    return media.attempt(figure, t("正在上传 {0}…", file.name), t("无法上传这个文件"), async () => place(figure, await media.uploadFile(file), options));
  }

  const fetchInto = (figure, url) => media.attempt(figure, t("正在下载…"), t("无法下载这个文件"), async () => place(figure, await media.uploadUrl(url)));

  // The file in: a new block in the place of the placeholder, or of the block that had one (替换文件,
  // with its caption), never the same element, so that undo brings back what stood there (a
  // placeholder never written, a block as it was) and the file loses the new one. One undo step; the
  // block selected.
  function place(figure, answer, { pasted = false } = {}) {
    if (!figure.isConnected) return;
    const doc = figure.ownerDocument;
    const replacing = Boolean(linkOf(figure));
    const next = newFile(doc);
    next.replaceChildren(...fileParts(doc, answer, fileUrl(answer.path), captionOf(figure)?.innerHTML ?? ""));
    media.place(figure, next, { replacing, pasted });
    if (replacing) say(t("已替换文件 · Ctrl+Z 撤销"));
  }

  // Saving the file, as a click on its row does.
  function download(figure) {
    const link = linkOf(figure);
    if (!link) return;
    const save = figure.ownerDocument.createElement("a");
    save.href = link.href;
    save.download = link.getAttribute("download") ?? "";
    save.click();
  }

  /** A file block's rows in its block menu. */
  function menuItems(target) {
    if (!target?.matches?.("figure.doc-file") || !linkOf(target)) return [];
    return [
      { label: t("替换文件"), icon: ICONS.swap, run: () => setTimeout(() => pick(target)) },
      { label: t("下载"), icon: FILE_ICONS.download, run: () => download(target) },
      { label: t("标题@caption"), icon: TOOL_ICONS.caption, run: () => setTimeout(() => media.caption(target)) },
    ];
  }

  return {
    pick, menuItems,
    /** Whether a file makes a file block: any that is no image. */
    acceptsFile: (file) => !/^image\//.test(file.type),
    /** A file block made of `file`, put where the paste puts it (`put`), its file uploaded; none made for a file too big (said). Returns whether it took it. */
    fromFiles: (put, [file]) => (refusal(file) ? (say(refusal(file), "error"), true) : media.paste(put, file, newFile, uploadInto)),
    /** Why `file` cannot go in (too big), or null. */
    refusesFile: refusal,
    /** A new file block for `file` dropped in from outside, not on the page yet, and the fill that uploads it once it is (page/drop-in/). */
    forFile: (file) => media.forFile(file, newFile, uploadInto),
    /** Whether `figure`, a file block with no file yet, takes a file dropped on it (`item`: { type }): any. */
    takesDrop: (figure, item) => media.empty(figure) && item.address === undefined,
    /** A file dropped on an empty file block put in it, one undo step (`options.pasted`: one with the step before). */
    takeDrop: (figure, item, options = {}) => (item.file ? uploadInto(figure, item.file, options) : undefined),
    /** A new one: its file chosen next. */
    onCreated(figure) {
      pick(figure);
      return true;
    },
  };
}
