import { clipboardOf } from "../../../components/registry.mjs";
import { isMention, shownWords } from "../../core.mjs";
import { COLORS } from "../../../../shared/colors.mjs";
import { ZWSP } from "../../../../shared/inline-spacing.mjs";
import { addressOn, decoded, elsewhere, fromFile, fullAddress, pageAddress } from "../../../../shared/page-address.mjs";
import { heldList } from "../../links/pages.mjs";
import { mediaUrl } from "../../../../shared/media.mjs";
import { reportOf } from "./describe.mjs";
import { groupItems } from "./rules.mjs";
import { WRITERS, heldToWords } from "./writers.mjs";

// Copied blocks for other programs (Markdown, and HTML that reads as the same), each block by the writer of its kind
// (writers.mjs). Pasted back here without the clipboard's own data, both read as the same blocks
// (import/), but for a callout: its Markdown a highlight block, its HTML a group of its blocks.
//   text/plain  Markdown: # … #### headings, "- " / "1. " / "- [ ] " items (an item's lists 4 spaces
//               in), "> " quotes, <aside> callouts (a highlight block and a callout: its emoji, a highlight
//               block's, and the text of its first block, its other blocks),
//               ``` code (its language), $$ formula blocks (an empty one: none), | tables |, ---, a disclosure as an item
//               holding its blocks, a tabs area as each tab's name and blocks (a row of columns, copied
//               as itself, as its text); **bold** *italic* ~~strike~~ `code` $formula$, links as their text
//               alone; a list's items one line apart, other blocks an empty line; a
//               line that would read as a tag or a fence escaped (writers.mjs heldToWords).
//   text/html   plain markup: p, a div of a highlight block's or a callout's blocks, h1–h4, ul / ol / li ("[x] " / "[ ] " before a to-do's text), blockquote,
//               details, pre > code.language-x, hr, table, a formula block as $$ … $$ (an empty one:
//               nothing, as in Markdown) and an inline one
//               as $ … $, colors as the kit's classes with their color in a style.
// List items copied on their own (each carrying its list's kind) are items of a list of that kind in
// both. Text selected in one block (textFormats) is its inline HTML for other programs, and as plain
// text its words alone (plainText: no list's marker, no Markdown).

// The kit's light colors (a background on words its words' fill), for programs without its styles (src/shared/colors.mjs).
const INK = Object.fromEntries(COLORS.flatMap(({ name, text, mark }) => [[`doc-text-${name}`, `color:${text[0]}`], [`doc-highlight-${name}`, `background-color:${mark[0]}`]]));
const FORMULA = /^\s*\\\(([\s\S]*)\\\)\s*$/;

// Inline HTML (the format bar's marks: serializeInner's) as nodes to walk, a link shown with its icon
// by the words the page shows for it (the file's chip holds what they were when it was made).
function nodesOf(html) {
  const template = globalThis.document.createElement("template");
  template.innerHTML = html ?? "";
  for (const chip of template.content.querySelectorAll("a[href]")) {
    const words = isMention(chip) && chip.lastChild?.nodeType === 3 ? shownWords(globalThis.document, chip.getAttribute("href")) : null;
    if (words) chip.lastChild.data = words;
  }
  return template.content;
}

// Inline HTML as Markdown (links as their text alone).
function markdown(html) {
  const walk = (node) => [...node.childNodes].map((child) => {
    if (child.nodeType === 3) return child.data.replace(/\u00a0/g, " ");
    if (child.nodeType !== 1) return "";
    if (child.matches(".doc-math-inline")) {
      const tex = FORMULA.exec(child.textContent)?.[1];
      return tex !== undefined ? `$${tex.trim()}$` : child.textContent;
    }
    const inner = walk(child);
    if (!inner.trim() && child.localName !== "br") return inner;
    switch (child.localName) {
      case "br": return "\n";
      case "ul": case "ol": // a table cell's list: its items one to a line
        return `\n${[...child.children].map((item, index) => `${child.localName === "ol" ? `${index + 1}. ` : "- "}${walk(item).trim()}`).join("\n")}\n`;
      case "strong": return `**${inner}**`;
      case "em": return `*${inner}*`;
      case "s": return `~~${inner}~~`;
      case "code": return `\`${inner}\``;
      default: return inner;
    }
  }).join("");
  return heldToWords(walk(nodesOf(html)));
}

// The address that opens a link's document, or a block of this page, from another program, on this
// server, by the page's link as the list held has it (links/pages.mjs), or null: an address on another
// server the list does not hold may be another program's, which stays as it is written.
export function wholeAddress(href) {
  const here = pageAddress(globalThis.location?.href);
  if (!here) return null;
  const { origin } = globalThis.location;
  const { named } = heldList();
  const address = fromFile(href, here.slug, origin);
  if (href.startsWith("#")) {
    const block = decoded(href.slice(1));
    return block && globalThis.document.querySelector(`[data-block-id="${CSS.escape(block)}"]`) ? fullAddress(origin, { slug: here.slug, block }, named) : null;
  }
  const place = addressOn(address, named, origin) ?? (elsewhere(address, origin) ? null : pageAddress(address));
  return place ? fullAddress(origin, place, named) : null;
}

// Inline HTML for other programs: formulas as $ … $, colors with their style, a link shown with its
// icon as a link of its title (its icon a file of the report's folder, nowhere else), a link to a
// document or a block by its whole address.
function portable(html) {
  const root = nodesOf(html);
  for (const link of root.querySelectorAll("a[href]")) {
    const address = wholeAddress(link.getAttribute("href"));
    if (address) link.setAttribute("href", address);
  }
  for (const chip of root.querySelectorAll("a.doc-link-mention")) {
    chip.querySelector(".doc-link-mention-icon")?.remove();
    chip.removeAttribute("class");
  }
  for (const chip of root.querySelectorAll(".doc-math-inline")) {
    const tex = FORMULA.exec(chip.textContent)?.[1];
    if (tex !== undefined) chip.replaceWith(`$${tex.trim()}$`);
  }
  for (const span of root.querySelectorAll("span[class]")) {
    const style = [...span.classList].map((name) => INK[name]).filter(Boolean).join(";");
    if (style) span.setAttribute("style", style);
  }
  const holder = globalThis.document.createElement("div");
  holder.append(root);
  return holder.innerHTML;
}

const isList = (block) => WRITERS[clipboardOf(block.type).kind].list;

function mdLines(blocks) {
  const lines = [];
  blocks.forEach((block, index) => {
    if (WRITERS[clipboardOf(block.type).kind].silent?.(block)) return;
    if (index > 0 && !(isList(block) && isList(blocks[index - 1]))) lines.push("");
    lines.push(...mdBlock(block));
  });
  return lines;
}

function mdBlock(block) {
  if (block.type === "copy") return block.data ? mdBlock(block.data) : [block.text.replace(/\s+/g, " ").trim()]; // a table as its data
  const clip = clipboardOf(block.type);
  return WRITERS[clip.kind].copied(block, how, clip);
}

function htmlBlock(block) {
  if (block.type === "copy") return block.data ? htmlBlock(block.data) : block.html; // a card: its kit markup
  const clip = clipboardOf(block.type);
  return WRITERS[clip.html ?? clip.kind].html(block, how, clip);
}

// A file of this page's folder (`path`, assets/<file>) by the whole address the page's server serves it at
// (`route`: shared/media.mjs MEDIA_ROUTES), which another program reaches while it runs (a picture in Word).
function served(route, path) {
  const address = mediaUrl(route, encodeURIComponent(reportOf(globalThis.document) ?? ""), path);
  try {
    return new URL(address, globalThis.location?.href).href;
  } catch {
    return address;
  }
}

// What the writers call back (writers.mjs).
const how = { inline: markdown, portable, block: mdBlock, lines: mdLines, html: htmlBlock, served, plain: (html) => plainText(html).replace(/\s+/g, " ").trim() };

/** The clipboard's text/html and text/plain for described blocks. */
export function formats(blocks) {
  const listed = groupItems(blocks);
  return { html: listed.map(htmlBlock).join(""), text: mdLines(listed).join("\n") };
}

/**
 * Inline HTML (the format bar's marks, chips as their source) as plain text: a formula as its TeX,
 * a link and a link shown with its icon as their words, a line break and a table cell's list item a
 * line of their own.
 */
export function plainText(html) {
  const walk = (node) => [...node.childNodes].map((child) => {
    if (child.nodeType === 3) return child.data.replace(/ /g, " ").replaceAll(ZWSP, "");
    if (child.nodeType !== 1) return "";
    if (child.matches(".doc-math-inline")) return FORMULA.exec(child.textContent)?.[1].trim() ?? child.textContent;
    if (child.localName === "br") return "\n";
    if (child.localName === "ul" || child.localName === "ol") return `\n${[...child.children].map((item) => walk(item).trim()).join("\n")}\n`;
    return walk(child);
  }).join("");
  return walk(nodesOf(html)).replace(/^\n+|\n+$/g, "");
}

/** The clipboard's text/html and text/plain for text selected in one block (its inline HTML). */
export function textFormats(html) {
  return { html: portable(html), text: plainText(html) };
}
