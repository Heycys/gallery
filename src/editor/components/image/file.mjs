import { escapeMarkup } from "../../../shared/escape.mjs";
import { SPAN, SPAN_SIZE, imageFile } from "../../../shared/media.mjs";
import { emptyFigure } from "../media/write.mjs";

// A crop as written: four numbers, x y width height, in % of the original.
const CROP = /^\d{1,3}(\.\d{1,3})?( \d{1,3}(\.\d{1,3})?){3}$/;

// 图片 in report.html (the server's, source/): a new image is written as the kit writes one,
// <figure class="doc-image"> holding its picture <img src="assets/<file>" alt=""> and its caption
// <figcaption> (empty while there is none), each on a line of its own; its side a class, its width
// --doc-span in its style attribute. A cropped one's picture says the picture it was cropped from
// and what of it is kept (data-original, data-crop: 裁剪图片 starts from them again). Its alt the
// words the picture stands for, where it has any (one an Agent wrote, cut or copied and made anew).

const empty = (node) => node.src === "" && node.caption === "" && node.span === undefined && node.original === undefined && node.classes === undefined;
const share = (value) => typeof value === "number" && Number.isFinite(value) && value >= SPAN_SIZE.min && value <= SPAN_SIZE.max;
const words = (value) => typeof value === "string" && value.trim() !== "" && value.length <= 1000 && !/[\u0000-\u001f]/.test(value);

export default {
  image: {
    // One left empty (the page editor's placeholder, 添加图片): an empty figure, shown to no reader.
    check: (node, { validLeaf }) => empty(node) || imageFile(node.src) && typeof node.caption === "string"
      && (node.caption === "" || validLeaf({ tag: "figcaption" }, node.caption)) && (node.span === undefined || share(node.span))
      && (node.original === undefined || (imageFile(node.original) && typeof node.crop === "string" && CROP.test(node.crop)))
      && (node.alt === undefined || words(node.alt)),
    write(node, w) {
      if (empty(node)) return emptyFigure("image", w);
      const classes = ["doc-image", ...(node.classes ?? [])].join(" ");
      const style = node.span === undefined ? "" : ` style="${SPAN}: ${Math.round(node.span * 1000) / 1000}"`;
      const cropped = node.original === undefined ? "" : ` data-original="${node.original}" data-crop="${node.crop}"`;
      return w.block(`<figure class="${classes}"${style}${w.id}>`, [`<img src="${node.src}" alt="${escapeMarkup(node.alt ?? "")}"${cropped}>`, `<figcaption>${node.caption}</figcaption>`], "</figure>");
    },
  },
};
