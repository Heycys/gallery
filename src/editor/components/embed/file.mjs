import { escapeAttribute } from "../../../shared/escape.mjs";
import { SPAN, SPAN_SIZE, embedFile } from "../../../shared/media.mjs";
import { emptyFigure } from "../media/write.mjs";
import { FILE_SANDBOX, WEB_SANDBOX } from "./index.mjs";

// 嵌入 in report.html (the server's, source/): a new embed is written as the kit writes one,
// <figure class="doc-embed"> (doc-embed--file for a file; its height in its style attribute)
// holding its frame <iframe class="doc-embed-frame"> (a web page's sandboxed: WEB_SANDBOX, an HTML
// file's with no origin of its own, a PDF's as the browser shows one) and its caption <figcaption>
// (empty while there is none), each on a line of its own.

const webPage = (value) => typeof value === "string" && value.length <= 2000 && /^https:\/\/[^\s"<>]+$/.test(value);
const empty = (node) => node.src === "" && node.height === undefined && node.span === undefined && node.caption === "";
// Its width, a share of the reading width as an image's (--doc-span: written by its corner handles, and with
// one cut or copied and made anew).
const share = (value) => typeof value === "string" && /^(0?\.\d{1,3}|1(\.0{1,3})?)$/.test(value) && Number(value) >= SPAN_SIZE.min && Number(value) <= SPAN_SIZE.max;

export default {
  embed: {
    // One left empty (the page editor's placeholder, 嵌入网页，或上传 HTML、PDF 文件): an empty figure, shown to no reader.
    check: (node, { validLeaf }) => empty(node) || (webPage(node.src) || embedFile(node.src)) && (node.height === undefined || /^\d{2,4}px$/.test(node.height))
      && (node.span === undefined || share(node.span))
      && typeof node.caption === "string" && (node.caption === "" || validLeaf({ tag: "figcaption" }, node.caption)),
    write(node, w) {
      if (empty(node)) return emptyFigure("embed", w);
      const local = embedFile(node.src);
      const sandbox = !local ? ` sandbox="${WEB_SANDBOX}" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen` : /\.pdf$/i.test(node.src) ? "" : ` sandbox="${FILE_SANDBOX}"`;
      const frame = `<iframe class="doc-embed-frame" src="${escapeAttribute(node.src)}"${sandbox} loading="lazy"></iframe>`;
      const sizes = [...(node.height ? [`--doc-embed-height: ${node.height}`] : []), ...(node.span !== undefined ? [`${SPAN}: ${node.span}`] : [])];
      const style = sizes.length ? ` style="${sizes.join("; ")}"` : "";
      return w.block(`<figure class="doc-embed${local ? " doc-embed--file" : ""}"${style}${w.id}>`, [frame, `<figcaption>${node.caption}</figcaption>`], "</figure>");
    },
  },
};
