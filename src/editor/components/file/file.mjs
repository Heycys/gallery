import { escapeMarkup } from "../../../shared/escape.mjs";
import { assetFile } from "../../../shared/media.mjs";
import { emptyFigure } from "../media/write.mjs";

// 文件 in report.html (the server's, source/): a new file block is written as the kit writes one,
// <figure class="doc-file"> holding its link <a class="doc-file-link" href="assets/<file>"
// download="<name>"> (its name, then its size) and its caption <figcaption> (empty while there is
// none), each on a line of its own.

const empty = (node) => node.href === "" && node.name === "" && node.size === undefined && node.caption === "";
const plainName = (value) => typeof value === "string" && value.trim() !== "" && value.length <= 120 && !/[\u0000-\u001f<>:"/\\|?*]/.test(value);

export default {
  file: {
    // One left empty (the page editor's placeholder, 上传文件): an empty figure, shown to no reader.
    check: (node, { validLeaf }) => empty(node) || assetFile(node.href) && plainName(node.name) && (node.size === undefined || /^\d+(\.\d)? (B|KiB|MiB|GiB)$/.test(node.size))
      && typeof node.caption === "string" && (node.caption === "" || validLeaf({ tag: "figcaption" }, node.caption)),
    write(node, w) {
      if (empty(node)) return emptyFigure("file", w);
      const size = node.size ? `<span class="doc-file-size">${node.size}</span>` : "";
      const link = `<a class="doc-file-link" href="${node.href}" download="${escapeMarkup(node.name)}"><span class="doc-file-name">${escapeMarkup(node.name)}</span>${size}</a>`;
      return w.block(`<figure class="doc-file"${w.id}>`, [link, `<figcaption>${node.caption}</figcaption>`], "</figure>");
    },
  },
};
