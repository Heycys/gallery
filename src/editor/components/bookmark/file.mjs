import { escapeMarkup } from "../../../shared/escape.mjs";
import { imageFile } from "../../../shared/media.mjs";
import { emptyFigure } from "../media/write.mjs";

// 网页书签 in report.html (the server's, source/): a new bookmark is written as the kit writes one,
// <figure class="doc-bookmark"> holding its card <a class="doc-bookmark-card" href="<page>"
// target="_blank" rel="noopener noreferrer"> (its text: title, description, address with the
// page's icon; its cover) on one line, and its caption <figcaption> (empty while there is none).

const webAddress = (value) => typeof value === "string" && value.length <= 2000 && /^https?:\/\/[^\s"<>]+$/.test(value);
const plain = (value, max) => typeof value === "string" && value.length <= max && !/[\u0000-\u001f]/.test(value);
const empty = (node) => node.href === "" && !node.title && !node.description && !node.icon && !node.cover && node.caption === "";
const picture = (value) => value === null || value === undefined || imageFile(value);

export default {
  bookmark: {
    // One left empty (the page editor's placeholder, 添加 Web 书签): an empty figure, shown to no reader.
    check: (node, { validLeaf }) => empty(node) || webAddress(node.href) && plain(node.title, 300) && plain(node.description ?? "", 600) && picture(node.icon) && picture(node.cover)
      && typeof node.caption === "string" && (node.caption === "" || validLeaf({ tag: "figcaption" }, node.caption)),
    write(node, w) {
      if (empty(node)) return emptyFigure("bookmark", w);
      const title = node.title.trim() || new URL(node.href).hostname;
      const text = [
        `<span class="doc-bookmark-title">${escapeMarkup(title)}</span>`,
        node.description ? `<span class="doc-bookmark-description">${escapeMarkup(node.description)}</span>` : "",
        `<span class="doc-bookmark-url">${node.icon ? `<img class="doc-bookmark-icon" src="${node.icon}" alt="">` : ""}<span class="doc-bookmark-href">${escapeMarkup(node.href)}</span></span>`,
      ].join("");
      const cover = node.cover ? `<span class="doc-bookmark-cover"><img src="${node.cover}" alt=""></span>` : "";
      const card = `<a class="doc-bookmark-card" href="${escapeMarkup(node.href)}" target="_blank" rel="noopener noreferrer"><span class="doc-bookmark-text">${text}</span>${cover}</a>`;
      return w.block(`<figure class="doc-bookmark"${w.id}>`, [card, `<figcaption>${node.caption}</figcaption>`], "</figure>");
    },
  },
};
