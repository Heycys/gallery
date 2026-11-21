import { containsRichFormatting, htmlToBlocks, htmlToRichText, parseClipboardHTML } from "./html.mjs";
import { filterWordContent, isWordContent } from "./office.mjs";
import { mathifyRichText, mathifySpecs } from "./math.mjs";
import { fromMarkdown } from "./markdown.mjs";
import { parseInlineMarkdown } from "./inline.mjs";
import { vscodeLanguage } from "./languages.mjs";
import { readYuque } from "./yuque.mjs";
import { addressOf } from "../../links/address.mjs";

// What a paste from another program is: the clipboard read in this order, as block specs, one rich
// text to go in at the caret, or plain text.
//   - Text: U+2028 as line breaks (text/uri-list when there is no text). HTML only with "rich
//     formatting" (html.mjs containsRichFormatting; WordPress's always): spans, divs and paragraphs
//     alone paste as their text.
//   - Office's HTML (its namespaces) of a document or slides, not a spreadsheet's, goes through the Word
//     filter (office.mjs).
//   - A whole $$ formula $$ → a formula block; IDE Markdown → document blocks, other IDE code →
//     code in its language. An unspecified IDE language can be Markdown by its parsed structure.
//   - HTML: several lines of text, or a table → blocks (html.mjs htmlToBlocks); else one rich text.
//   - No HTML: several lines → Markdown (markdown.mjs); one line → inline Markdown (bold, links,
//     addresses, formulas) when it has any, else plain text. A whole line that is a display formula
//     (\[ … \]) → a formula block.
// Also: an AI answer's cards (cards.mjs: ChatGPT's copy puts them as bare nested divs) highlight
// blocks and columns; formulas AI answers copy (math.mjs, markdown.mjs, inline.mjs) and colors
// (html.mjs `colors`: the nearest of the page's for Word, Google Docs and Notion, whose styles are
// meant; else only the page's own); and first of all Yuque's (yuque.mjs): its document's nodes
// (text/ne-inode, its HTML's <ne-clipboard>, text/lake) or its toolbar's Markdown.

const OFFICE = /schemas-microsoft-com:office|xmlns:m="http:\/\/schemas\.microsoft\.com\/office\/2004\/12\/omml"/;
const WORDPRESS = /<!-- wp:/;
// A whole $$ formula $$.
const EQUATION = /^\s*\$\$[ \t]*\r?\n?([\s\S]+?)\r?\n?[ \t]*\$\$\s*$/;
const multiline = (text) => text.trimEnd().includes("\n"); // more than one line, trailing ones aside
// Clipboard types of sources whose styles are meant (Google Docs, Notion).
const STYLED = ["application/x-vnd.google-docs-document-slice-clip+wrapped", "text/_notion-page-source-production", "text/_notion-text-production", "text/_notion-blocks-v3-production"];

/**
 * The clipboard's other programs' content: { text, html (with rich formatting, else ""),
 * fromOffice, isTable (its first element a table, before normalizing), language (VS Code's), colors }.
 */
export function externalContent(data, { base } = {}) {
  const text = (data.getData("text/plain") || "").replace(/\u2028/g, "\n").replace(/\r\n?/g, "\n") || data.getData("text/uri-list") || "";
  const original = data.getData("text/html") || "";
  const fromOffice = OFFICE.test(original);
  const types = [...(data.types ?? [])];
  const colors = fromOffice || types.some((type) => STYLED.includes(type)) ? "nearest" : "exact";
  const raw = fromOffice && isWordContent(original) ? filterWordContent(original, { colors: true }) : original;
  let html = "";
  let isTable = false;
  if (raw) {
    const probe = parseClipboardHTML(raw, { base });
    isTable = probe.firstElementChild?.tagName === "TABLE";
    // An AI answer's cards (cards.mjs) never in Office's HTML, which its filter leaves bare.
    if (containsRichFormatting(probe, { colors, cards: !fromOffice }) || (WORDPRESS.test(raw) && WORDPRESS.test(text))) html = raw;
  }
  let mode = null;
  try {
    mode = JSON.parse(data.getData("vscode-editor-data") || "null")?.mode ?? null;
  } catch {
    // not JSON
  }
  return { text, html, fromOffice, isTable, language: mode ? vscodeLanguage(mode) : null, colors };
}

/**
 * The href of what is on the clipboard when that is an address alone, else null. The plain text says
 * so (addressOf); HTML beside it, as a web page's link has when it is copied, may hold nothing but a
 * link to that address, or the same words (a code editor's colored text). An address written with
 * www. says no scheme: the link beside it is that same link under either, and gives its own.
 */
export function bareAddress(data, options = {}) {
  const plain = data.getData("text/plain");
  const href = addressOf(plain);
  const html = data.getData("text/html");
  if (!href || !html) return href;
  const root = parseClipboardHTML(html, options);
  const [link, ...others] = root.querySelectorAll("a[href]");
  if (others.length > 0 || root.querySelector("img, picture, svg, video, audio, table")) return null;
  const words = (text) => text.replace(/\s+/g, "");
  if (!link) return words(root.textContent) === words(plain) ? href : null;
  if (words(root.textContent) !== words(link.textContent)) return null;
  const unsaid = /^www\./i.test(plain.trim());
  if (!sameAddress(unsaid ? link.href.replace(/^https:/i, "http:") : link.href, href)) return null;
  return unsaid ? link.href : href;
}

function sameAddress(one, other) {
  try {
    return new URL(one).href === new URL(other).href;
  } catch {
    return one === other;
  }
}

// VS Code and Cursor copy syntax-colored HTML beside the source text, even for Markdown. Use
// the same Markdown reader as an ordinary text paste, not the colored HTML. A Markdown language
// hint is enough; for an unspecified language, require some structure or inline formatting the
// reader actually recognizes. Unrecognized lines remain text; the whole selection need not be
// valid Markdown. A declared programming language wins over lookalike comments and operators.
function editorMarkdown({ text, language }) {
  if (language !== "Markdown" && language !== "Plain Text") return null;
  const specs = fromMarkdown(text);
  if (language === "Markdown") return specs;
  const marked = (blocks) => blocks.some((block) => block.type !== "text"
    || block.title.some((piece) => piece[1]?.length) || marked(block.children));
  return !addressOf(text) && marked(specs) ? specs : null;
}

/**
 * Another program's content as { kind: "blocks", specs } | { kind: "rich", title } | { kind: "plain",
 * text } (read after the editor's own formats).
 */
export function readExternal(data, options = {}) {
  // Yuque's (yuque.mjs): its document's structure, which its HTML says only in part, or its Markdown.
  const yuque = readYuque(data, options);
  if (yuque) return yuque;
  const external = externalContent(data, options);
  const { text } = external;
  const convert = { colors: external.colors };
  const equation = EQUATION.exec(text)?.[1];
  if (equation?.trim()) return { kind: "blocks", specs: [{ type: "equation", title: [[equation]], props: {}, children: [] }] };
  const markdown = editorMarkdown(external);
  if (markdown?.length && (multiline(text) || markdown.some((block) => block.type !== "text"))) return { kind: "blocks", specs: markdown };
  if (multiline(text) && external.language) return { kind: "blocks", specs: [{ type: "code", title: [[text]], props: { language: external.language }, children: [] }] };
  const html = markdown ? "" : external.html;
  if (html) {
    if (multiline(text) || external.isTable) {
      const specs = mathifySpecs(htmlToBlocks(parseClipboardHTML(html, options), { ...convert, cards: !external.fromOffice }));
      if (specs.length) return { kind: "blocks", specs };
    }
    const title = mathifyRichText(htmlToRichText(parseClipboardHTML(html, options), convert));
    return title.length ? { kind: "rich", title } : { kind: "plain", text };
  }
  if (multiline(text)) {
    const specs = fromMarkdown(text);
    if (specs.length) return { kind: "blocks", specs };
  }
  // One line: a whole display formula → a formula block; else inline Markdown (parseInlineMarkdown)
  // when it makes anything, else plain text (an address alone stays text: the page may link it).
  const single = fromMarkdown(text);
  if (single.length === 1 && single[0].type === "equation") return { kind: "blocks", specs: single };
  const title = parseInlineMarkdown(text);
  if (title.some((piece) => piece[1]?.length) && !addressOf(text)) return { kind: "rich", title };
  return { kind: "plain", text };
}
