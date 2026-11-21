import { assetFile } from "../../../shared/media.mjs";
import { workspaceAddress } from "../../../shared/workspace-address.mjs";
import { blobBase64 } from "../post.mjs";
import { projectName } from "./own/index.mjs";
import { t } from "../../../shared/i18n/index.mjs";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/; // a document's folder (shared/workspace.mjs slugPattern, which needs Node)

// Blocks of another document pasted (the clipboard's own data, a media block made anew of what it carries:
// own/blocks.mjs filesOf) name files of that document's folder (assets/<file>), which this document's file
// cannot name: each is copied into this document's folder before the blocks are made (one undo step with
// the paste: the blocks name the copies). A file is read where the server hands out that document's files
// (the `file` route, its bytes as they are: shared/media.mjs MEDIA_ROUTES, in its own workspace: `project`)
// and sent to this document's folder as the page sends an upload of its kind (image, file, embed:
// editor/media-store.mjs), which keeps it by its content's hash: the same bytes, never another document's
// file of the same name overwritten, the same file kept once however often it is pasted; a file Gallery
// put there keeps its name (it is named so already), one an Agent named takes the folder's (image-<hash>.png).
// What the upload refuses (too large, no picture) stops the paste, saying why: nothing half made. The table's
// pictures (单元格里的图片) are copied the same way (table/pictures.mjs resolve).

/**
 * `files` ({ path, kind } of the folder of `from`, the document they were copied in, of the workspace
 * `project`) copied into this document's folder by `upload(kind, body)` (POST /__gallery/edit/upload): a Map
 * of each path to the one it has here, or null when one could not be, said by `say`.
 */
export async function carryFiles(files, { from, project, upload, say }) {
  if (typeof from !== "string" || !slugPattern.test(from) || !projectName(project) || !files.every(({ path }) => assetFile(path))) {
    say(t("没能把文件复制到这篇文档：不知道它们来自哪篇文档。"), "error");
    return null;
  }
  say(t("正在复制文件…"));
  const found = new Map();
  try {
    await Promise.all(files.map(async ({ path, kind }) => {
      const name = path.slice("assets/".length);
      const response = await fetch(workspaceAddress(`/__gallery/edit/file/${from}/${path}`, project ?? ""));
      if (!response.ok) throw new Error(t("找不到 {0}", name));
      const blob = await response.blob();
      found.set(path, (await upload(kind, { name, type: blob.type, data: await blobBase64(blob) })).path);
    }));
  } catch (error) {
    say(t("{0}：{1}", t("没能把文件复制到这篇文档"), error.message), "error");
    return null;
  }
  return found;
}
