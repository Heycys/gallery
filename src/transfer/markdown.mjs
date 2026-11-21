import { PAGE } from "../editor/components/kit.mjs";
import { APART, clipboardOf, tagKind, unitClipboard, writtenApart } from "../editor/components/registry.mjs";
import { WRITERS, heldToWords, unitOpening, wordsIn } from "../editor/page/clipboard/own/writers.mjs";
import { BLOCK_LEVEL } from "../editor/source/html.mjs";
import { escapeAttribute } from "../shared/escape.mjs";
import { currentCatalog } from "../shared/component-catalog.mjs";
import { referencedFile } from "../shared/media.mjs";
import { editorCore } from "./dom.mjs";

// A report as Markdown (with the clipboard's writers, own/writers.mjs, and the ways of a page
// export): "# <title>", then each block, an empty line between blocks (none between the items of one
// list); no empty paragraphs.
//   text        **bold** *italic* ~~strike~~ `code` $formula$ [text](link) (a link whose text is its
//               address: the address); colors and underlines dropped; a line break a new line; a
//               line that would read as a tag or a fence escaped (writers.mjs heldToWords)
//   headings    # … #### by level
//   lists       "- ", "1. " (from the list's start), "- [ ]  " / "- [x]  "; what an item holds 4
//               spaces in, an empty line around blocks that are no list; an item of no words over
//               what it holds "&nbsp;" on its line, so that a viewer gives it its line above them as
//               the page does (writers.mjs lineOf); a flowchart (流程图) an ordered list, each
//               node's emoji and title (bold as written) its item's line, its content (what it
//               holds after its title) what its item holds
//   quote       "> " before each line, an empty "> " line between its paragraphs
//   highlight   <aside>, its emoji and first line, an empty line, its other blocks, </aside>
//   disclosure  "- " and its title ("&nbsp;" for none over its blocks), its blocks 4 spaces in
//               (written as an item: Markdown has no disclosure)
//   code        its title (a file's name) in bold where it has one, ```language … ```; a
//               declared diff (.doc-diff) ```diff with its lines "+", "-", " "; formula block $$ … $$;
//               divider ---
//   table       | a | b |, the "| --- |" line after the first row; a merged cell's other slots empty
//   chart card  its title in bold, the chart as an image (`chart`: its picture in the export, else
//               none), its caption
//   image       ![caption or name](file) and the caption again below; file [name](file);
//               bookmark [title](address); embed [caption or address](address or file); each caption
//               a paragraph below
//   elsewhere   a picture in the text, a list item or a table's cell ![alt](file) where it stands (a
//               cell's in the Markdown table), a figure's on a line of its own before its caption, a
//               report's own widget's after its words (a link's icon none: the link is its text); a
//               link to a file of the report's folder [text](file)
//   columns, sections and a Sheet area's panels: their blocks in turn (a Sheet tab's name a line
//   before its panel's blocks); a report's own widget its text; an instance of a component package
//   what its manifest's `markdown` says
//   detail card no block of the page's flow, opened from a link that is written as its text: after
//               all the blocks, every card something opens in the file's order, a disclosure of its
//               title (one nothing opens shows nowhere, and is left out); one that a list item or a
//               report's own widget holds is none of their words, and what it holds, where no blocks
//               are looked for, such a widget's words
//   what a box holds that no unit stands for  an element by the kind its tag gives it, else as a
//               whole block's words; words straight in it a paragraph (blocksIn)
// The files of the report's folder go into the export beside the page (`media`), linked relative,
// wherever the page names one. Each block is written by the writer of its `clipboard.kind`, the table
// the clipboard's copy uses too (clipboard/own/writers.mjs); what follows here is what is the page's:
// inline text with its pictures and files, blocks in turn and held under an item.

const FORMULA = /^\s*\\\(([\s\S]*)\\\)\s*$/;
const INDENT = "    ";
// What stands in a box and is not written there: what shows no words, what is written apart, the
// header (written first) and the page's title (the first line).
const NOT_WRITTEN = ["script", "style", "template", "noscript", APART, PAGE.header, `${PAGE.header} > h1`].join(", ");

// Inline HTML (serializeInner's, its pictures kept) as Markdown; `media` as reportMarkdown's.
function inlineOf(html, media) {
  const template = globalThis.document.createElement("template");
  template.innerHTML = html ?? "";
  const walk = (node) => [...node.childNodes].map((child) => {
    if (child.nodeType === 3) return child.data.replace(/ /g, " ");
    if (child.nodeType !== 1) return "";
    if (child.matches(".doc-math-inline")) {
      const tex = FORMULA.exec(child.textContent)?.[1];
      return tex !== undefined ? (tex.trim() ? `$${tex.trim()}$` : "") : child.textContent;
    }
    if (child.localName === "img") {
      const src = child.getAttribute("src");
      return src ? `![${bracketed(child.getAttribute("alt") ?? "")}](${media(src, "image", fileName(src))})` : "";
    }
    if (child.matches("a.doc-link-mention")) {
      const title = (child.querySelector(".doc-link-mention-title") ?? child).textContent.replace(/\s+/g, " ").trim();
      return child.getAttribute("href") ? `[${title || child.getAttribute("href")}](${child.getAttribute("href")})` : title;
    }
    const inner = walk(child);
    if (child.localName === "br") return "\n";
    if (!inner.trim()) return inner;
    const [lead, body, tail] = [inner.match(/^\s*/)[0], inner.trim(), inner.match(/\s*$/)[0]];
    switch (child.localName) {
      case "strong": case "b": return `${lead}**${body}**${tail}`;
      case "em": case "i": return `${lead}*${body}*${tail}`;
      case "s": case "del": case "strike": return `${lead}~~${body}~~${tail}`;
      case "code": return `${lead}\`${body}\`${tail}`;
      case "a": {
        const href = child.getAttribute("href") ?? "";
        if (!href || href.startsWith("#")) return inner; // a detail card's entry, a link within the page
        if (referencedFile(href)) return `${lead}[${body}](${media(href, "file", child.getAttribute("download") || fileName(href))})${tail}`;
        return body === href ? `${lead}${href}${tail}` : `${lead}[${body}](${href})${tail}`;
      }
      default: return child.classList.contains("doc-tab") ? ` ${inner}` : inner; // small text's end part
    }
  }).join("");
  return heldToWords(walk(template.content).replace(/[ \t]+\n/g, "\n").trim());
}

// `node` without what is written apart from the page's flow: the node itself when it holds none.
function withoutApart(node) {
  if (!node.querySelector(APART)) return node;
  const copy = node.cloneNode(true);
  for (const each of copy.querySelectorAll(APART)) each.remove();
  return copy;
}

const text = (node) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();
// The name a file is linked by: the last part of its address.
const fileName = (src) => src.replace(/[?#].*$/, "").split("/").pop();
// Text inside a picture's [ ], its brackets (and backslashes) escaped, so that an alt closes nothing.
const bracketed = (said) => said.replace(/[\\[\]]/g, "\\$&");
// Where each picture of a block stands while the editor writes its text (<n>: a
// character no report writes).
const PICTURE = /(\d+)/g;

/**
 * Report `document` (opened: dom.mjs openReport) as Markdown, its title `title`. media(src, kind,
 * name): the link from the page's file to a file of the report's folder put in the export (kind
 * "image" or "file", `name` what it is called), or the address itself for a web page; chart(card):
 * the link to the picture of a chart card, or null.
 */
export async function reportMarkdown(document, { title, media = (src) => src, chart = () => null }) {
  const { lines, blocksIn, how } = await markdownWriter(document, { media, chart });
  const header = document.querySelector(".doc-header");
  const headerLines = header ? lines(blocksIn(header)) : [];
  const main = document.querySelector("main");
  const body = lines(main ? blocksIn(main) : []);
  const apart = writtenApart(document).flatMap(({ element, clipboard }) => ["", ...WRITERS[clipboard.kind].exported(element, how, clipboard)]);
  return [`# ${title || "Untitled"}`, ...(headerLines.length ? ["", ...headerLines] : []), ...(body.length ? ["", ...body] : []), ...apart].join("\n");
}

/**
 * What writes report `document` (opened: dom.mjs openReport) as Markdown, a part of it at a time (`media`
 * and `chart` as reportMarkdown's): { lines(units), block(unit), blocksIn(box), how }, a unit's or a
 * box's blocks as reportMarkdown writes them in the page (gallery read writes a part of a page so).
 */
export async function markdownWriter(document, { media = (src) => src, chart = () => null } = {}) {
  const { UNIT, unitsOf, serializeInner, nestedBlocks, isHost } = await editorCore();
  const inline = (html) => inlineOf(html, media);
  // A text block's or a cell's HTML as the editor writes it (serializeInner), its pictures kept: the
  // editor writes none (a block holding one is read-only), and in the Markdown they are content.
  const withPictures = (host) => {
    const node = withoutApart(host);
    const pictures = [...node.querySelectorAll("img")];
    if (pictures.length === 0) return serializeInner(node);
    const copy = node.cloneNode(true);
    copy.querySelectorAll("img").forEach((img, index) => img.replaceWith(`${index}`));
    return serializeInner(copy).replace(PICTURE, (_, index) => `<img src="${escapeAttribute(pictures[index].getAttribute("src") ?? "")}" alt="${escapeAttribute(pictures[index].getAttribute("alt") ?? "")}">`);
  };
  const own = (host) => inline(withPictures(host));
  // The pictures a block holds (a figure's, a report's own widget's), each a line; `tables` false:
  // but those in its tables, which their cells hold. A link's icon (a link shown with its icon) is
  // the link's, which its text writes.
  const picturesIn = (block, { tables = true } = {}) => {
    const node = withoutApart(block);
    return [...node.querySelectorAll("img[src]")]
      .filter((img) => !img.closest("a.doc-link-mention") && (tables || !node.contains(img.closest("table"))))
      .map((img) => inline(img.outerHTML));
  };

  // An element no unit stands for as one of the kind its tag gives it (the job's own document).
  const marked = (element) => {
    if (tagKind(element) && !element.matches(UNIT)) element.setAttribute("data-ge-unit-kind", tagKind(element));
    return element;
  };
  /**
   * What a box holds in turn, so that all a page shows is written: its units, and among them what no
   * unit stands for, an element the editor makes no block of (a <p> whose end tag is left out, a
   * <dialog> of the file's own), words straight in it and inline elements, those in a row a paragraph.
   */
  function blocksIn(box) {
    const blocks = [];
    let words = null;
    for (const node of box.childNodes) {
      const element = node.nodeType === 1;
      if (element ? node.matches(NOT_WRITTEN) : node.nodeType !== 3) continue;
      if (element && (node.matches(UNIT) || BLOCK_LEVEL.has(node.localName))) {
        blocks.push(marked(node));
        words = null;
      } else if (element || words || node.data.trim()) {
        if (!words) blocks.push(words = marked(document.createElement("p")));
        words.append(node.cloneNode(true));
      }
    }
    return blocks;
  }

  const isList = (unit) => WRITERS[unitClipboard(unit).kind].list;
  const indented = (out) => out.map((line) => (line ? `${INDENT}${line}` : line));

  // Blocks in turn, an empty line between (none between two lists' items: lists side by side read as one).
  function lines(units) {
    const out = [];
    let previous = null;
    for (const unit of units) {
      const written = block(unit);
      if (written.length === 0) continue;
      if (previous !== null && !(isList(previous) && isList(unit))) out.push("");
      out.push(...written);
      previous = unit;
    }
    return out;
  }
  // Blocks under an item or a toggle: 4 spaces in, an empty line before (and after) those that are no
  // list (a flowchart is one: a node's flowchart, cards in a card, is its item's nested list).
  function held(units) {
    const out = [];
    for (const unit of units) {
      const written = block(unit);
      if (written.length === 0) continue;
      const list = isList(unit);
      if (!list && out.length > 0 && out.at(-1) !== "") out.push("");
      if (!list && out.length === 0) out.push("");
      out.push(...indented(written));
      if (!list) out.push("");
    }
    while (out.at(-1) === "") out.pop();
    return out;
  }
  // The units of a box, so, but `without` (a block of it written elsewhere: a detail card's heading,
  // its disclosure's title); a box where none are marked (a card a list item holds), the words it holds.
  function heldIn(box, without = null) {
    const units = unitsOf(box);
    const words = units.length > 0 ? [] : WRITERS.words.exported(box, how, { without });
    return words.length > 0 ? ["", ...indented(words)] : held(blocksIn(box).filter((block) => block !== without));
  }

  // Each block by the writer of its kind (writers.mjs).
  function block(unit) {
    const clip = unitClipboard(unit);
    return WRITERS[clip.kind].exported(unit, how, clip);
  }

  // What a card of no title is called (`charted`: a chart's, else a drawing's): in the page's language
  // (its lang), not the reader's: Chart or Figure in an English page, 图表 or 图 in any other.
  function untitled(card, charted) {
    const english = /^en(?:-|$)/i.test(card.ownerDocument.documentElement.getAttribute("lang") ?? "");
    return charted ? (english ? "Chart" : "图表") : english ? "Figure" : "图";
  }

  // What the writers and the components' `read` call back.
  const how = {
    isHost, nestedBlocks, serializeInner, media, chart, inline, own, withPictures, picturesIn, lines, held, heldIn, untitled,
    wordsIn: (block, more, without) => wordsIn(withoutApart(block), more, without),
    plain: text,
    unitsOf: blocksIn,
    words: (node) => WRITERS.words.exported(node, how),
    packageOf: (id) => currentCatalog().packages.get(id),
    opening: (units, title) => unitOpening(units, title, how),
    writtenAs(type, node) {
      const clip = clipboardOf(type);
      return WRITERS[clip.kind].exported(node, how, clip);
    },
  };

  return { lines, block, blocksIn, how };
}
