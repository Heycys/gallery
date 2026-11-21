import { CELL_ALIGN_CLASSES } from "../../../../shared/components/table.mjs";
import { t } from "../../../../shared/i18n/index.mjs";
import { backgroundColor, textColor } from "./colors.mjs";
import { htmlToBlocks, parseClipboardHTML } from "./html.mjs";
import { decodeEntities } from "./inline.mjs";
import { languageFromFence } from "./languages.mjs";
import { readMarkdownDocument } from "./markdown.mjs";
import { spec } from "./rich.mjs";

// Yuque's (语雀) clipboard (Notion's and Feishu's come by their HTML, which html.mjs reads): read for its
// structure, which the HTML it puts beside it says only in part (a formula is its TeX as text, a
// 提示 a styled div, a board nothing). The user's samples, tests/unit/fixtures/paste/yuque/:
//   ⌘A ⌘C in a document  text/plain; text/html, an <ne-clipboard data="…"> first (the document's
//                       nodes, ne-inode's JSON, URL-encoded), then its HTML; text/lake (Yuque's own
//                       HTML: data-lake-id, <card name value="data:…">, flat lists by data-lake-indent);
//                       text/ne-inode (the same JSON)
//   复制为 Markdown      (the toolbar's) text/plain, Markdown with some HTML (pictures, 折叠块, colors),
//                       and text/html, its words in one span in Yuque's font
// Read richest first (readYuque): text/ne-inode's JSON, the <ne-clipboard>'s, text/lake (lakeTree: as
// that JSON), text/html in the lake form (data-lake-id: an older copy); else Markdown that is Yuque's
// (yuqueMarkdownCopy: its marks, or its toolbar's span) by markdown.mjs's whole-document reader with
// `yuque` (what Yuque writes besides: its header), its HTML blocks as the paste reads HTML. Neither:
// null, and the paste reads the clipboard as any other program's.
// What each node is (yuqueSpecs: one rule a kind, whichever format it came in):
//   p → text (an image in it a block of its own, the words around it paragraphs; one formula alone
//   in it a formula block: Yuque has no other display formula); h1–h4 → heading 1–4, h5 and h6
//   heading 4 (as Markdown's are read); uli / oli / tli (a level each, flat) → items nested by
//   level (a numbered one's place its number; a to-do's check); quote → quote; alert (提示: info,
//   tips, success, warning, danger) → report_callout, the page's callout of that color (to-blocks.mjs);
//   collapse (折叠块) → toggle (its summary its title); table → table, merged cells kept (a row's
//   spans), each cell's paragraphs lines, its alignment its look; cards: hr → divider, codeblock →
//   code (its mode the language, as a fence names one; its name its title), math → an inline formula
//   (alone in a paragraph a formula block), image → image (its address, downloaded once on the page as
//   any pasted picture; its title its caption when Yuque shows it, never its alt: a file's name),
//   board (画板) and any card the page has no block for → a gray line saying so, with the board's
//   name (its mind map's first node), a card of a web address a link to it.
// Inline: bold, italic, underline, strikethrough, sup, sub, code, links, color and bgColor (the
// page's nearest: Yuque's colors are meant, as Word's are; colors.mjs). A soft line break (a "\n"
// node, a <br>) a line break. One line copied (a paragraph's words, a heading's, an item's) goes in
// at the caret with its marks, as one line of any page's HTML does.

const INODE = "text/ne-inode";
const LAKE = "text/lake";
// What is read at most: the clipboard's JSON is anybody's.
const MAX_NODES = 100000;
const MAX_DEPTH = 64;
const MAX_SPAN = 1000;

// Characters pasted text loses (html.mjs's: controls, line and paragraph separators, zero-width spaces, tags, lone surrogates).
const BAD_CHAR = /[\x00-\x08\x0b-\x1f\u2028\u2029\u200b\u{e0000}-\u{e007f}\ud800-\udfff]/gu;
const clean = (text) => String(text ?? "").replace(BAD_CHAR, "");
const WEB = /^https?:\/\//i;
const multiline = (text) => text.trimEnd().includes("\n");

// Yuque's 提示 by its kind (lake-alert-<kind>, :::kind) as one of the page's nine; another kind
// (color1–5) none, the callout's own blue.
const ALERT_COLORS = { info: "blue", tips: "yellow", success: "green", warning: "orange", danger: "red" };
const LISTS = { uli: "bulleted_list", oli: "numbered_list", tli: "to_do" };
const HEADINGS = { h1: "header", h2: "sub_header", h3: "sub_sub_header", h4: "header_4", h5: "header_4", h6: "header_4" };
const ALIGNS = Object.fromEntries(["left", "center", "right"].map((name, index) => [name, CELL_ALIGN_CLASSES[index]]));

// ---------- the clipboard's structure ----------

const kids = (node) => (Array.isArray(node?.children) ? node.children : []);
const nameOf = (node) => (typeof node?.name === "string" ? node.name : "");
const attrsOf = (node) => (node?.attrs && typeof node.attrs === "object" ? node.attrs : {});
const isText = (node) => node?.type === "text";
const isCard = (node) => node?.type === "card";
const valueOf = (node) => {
  const value = attrsOf(node).value;
  return value && typeof value === "object" ? value : {};
};
const count = (value, fallback = 0) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

// ne-inode's JSON (a fragment of nodes), or null when it is none or too big to be read.
function treeOf(text) {
  if (!text) return null;
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || !Array.isArray(value.children)) return null;
  let nodes = 0;
  const fits = (node, depth) => node && typeof node === "object" && ++nodes <= MAX_NODES && depth <= MAX_DEPTH
    && (node.children === undefined || (Array.isArray(node.children) && node.children.every((child) => fits(child, depth + 1))));
  return fits(value, 0) ? value : null;
}

/** The structure of what Yuque copied, as ne-inode's nodes (lake's read so too), or null when the clipboard holds none. */
export function yuqueTree(data) {
  const inode = treeOf(data.getData(INODE));
  if (inode) return inode;
  const html = data.getData("text/html") || "";
  if (/<ne-clipboard\b/i.test(html)) {
    // Its own document: nothing runs, nothing loads; the attribute's entities read.
    const element = new globalThis.DOMParser().parseFromString(html, "text/html").querySelector("ne-clipboard");
    let json = "";
    try {
      json = decodeURIComponent(element?.getAttribute("data") ?? "");
    } catch {
      // not URL-encoded: none
    }
    const tree = treeOf(json);
    if (tree) return tree;
  }
  const lake = data.getData(LAKE) || (/\sdata-lake-id=/.test(html) ? html : "");
  return lake ? lakeTree(lake) : null;
}

// ---------- lake: Yuque's HTML as ne-inode's nodes ----------

const element = (name, attrs, children) => ({ type: "element", name, attrs, children });
const textNode = (data, attrs = {}) => ({ type: "text", name: "#text", attrs, data });
const card = (name, value, cardType) => ({ type: "card", name, attrs: { value, cardType }, cardType });
// A card's value: "data:" and URL-encoded JSON.
function cardData(raw) {
  const text = String(raw ?? "");
  if (!text.startsWith("data:")) return {};
  try {
    return JSON.parse(decodeURIComponent(text.slice(5)));
  } catch {
    return {};
  }
}
const styleValue = (node, name) => new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, "i").exec(node.getAttribute("style") ?? "")?.[1].trim() ?? "";
const alignment = (node) => {
  const align = styleValue(node, "text-align").toLowerCase();
  return ALIGNS[align] ? { alignment: align } : {};
};
const LAKE_INLINE = new Set(["span", "strong", "b", "em", "i", "del", "s", "strike", "u", "sub", "sup", "code", "a", "font", "br", "mark", "img"]);
const TAG_MARKS = { strong: { bold: true }, b: { bold: true }, em: { italic: true }, i: { italic: true }, del: { strikethrough: true }, s: { strikethrough: true }, strike: { strikethrough: true }, u: { underline: true }, sub: { sub: true }, sup: { sup: true } };

/** Yuque's own HTML (text/lake, or a copy's HTML in that form) as ne-inode's nodes, or null when it holds none. */
export function lakeTree(html) {
  const doc = new globalThis.DOMParser().parseFromString(html, "text/html");
  const children = lakeBlocks([...doc.body.childNodes], 0);
  return children.length ? { type: "fragment", name: "#fragment", attrs: {}, children } : null;
}

function lakeBlocks(nodes, depth) {
  const out = [];
  if (depth > MAX_DEPTH) return out;
  let loose = [];
  const flush = () => {
    if (loose.length) out.push(element("p", {}, loose));
    loose = [];
  };
  for (const node of nodes) {
    if (node.nodeType === 3) {
      if (node.data.trim()) loose.push(textNode(node.data));
      continue;
    }
    if (node.nodeType !== 1) continue;
    const tag = node.localName;
    if ((LAKE_INLINE.has(tag) && tag !== "img") || (tag === "card" && node.getAttribute("type") === "inline" && node.getAttribute("name") !== "image")) {
      loose.push(...lakeInline([node], {}, depth));
      continue;
    }
    flush();
    out.push(...lakeBlock(node, depth));
  }
  flush();
  return out;
}

function lakeBlock(node, depth) {
  const tag = node.localName;
  const inner = () => lakeBlocks([...node.childNodes], depth + 1);
  if (tag === "p") return [element("p", alignment(node), lakeInline([...node.childNodes], {}, depth))];
  if (HEADINGS[tag]) return [element(tag, alignment(node), lakeInline([...node.childNodes], {}, depth))];
  if (tag === "ul" || tag === "ol") return lakeList(node, depth, count(node.getAttribute("data-lake-indent")));
  if (tag === "blockquote") {
    const kind = /(?:^|\s)lake-alert-([\w-]+)/.exec(node.getAttribute("class") ?? "")?.[1] ?? node.getAttribute("data-type");
    return kind || node.classList.contains("lake-alert") ? [element("alert", { type: kind ?? "" }, inner())] : [element("quote", {}, inner())];
  }
  if (tag === "details") {
    const summary = [...node.children].find((child) => child.localName === "summary");
    return [element("collapse", {}, [element("summary", {}, summary ? lakeInline([...summary.childNodes], {}, depth) : []), ...lakeBlocks([...node.childNodes].filter((child) => child !== summary), depth + 1)])];
  }
  if (tag === "table") {
    const rows = [...node.querySelectorAll("tr")].filter((row) => row.closest("table") === node);
    return [element("table", {}, rows.map((row) => element("tr", {}, [...row.cells].map((cell) => element("td", { rowSpan: cell.rowSpan, colSpan: cell.colSpan, ...alignment(cell) }, lakeBlocks([...cell.childNodes], depth + 1))))))];
  }
  if (tag === "card") return [lakeCard(node)];
  if (tag === "pre") return [card("codeblock", { mode: node.getAttribute("data-language") || /(?:^|\s)language-([\w+#-]+)/.exec(node.getAttribute("class") ?? "")?.[1] || "", code: node.textContent }, "block")];
  if (tag === "hr") return [card("hr", {}, "block")];
  if (tag === "img") return [lakeImage(node)];
  if (["colgroup", "col", "style", "script", "meta", "title", "template"].includes(tag)) return [];
  return inner();
}

const lakeCard = (node) => card(node.getAttribute("name") ?? "", cardData(node.getAttribute("value")), node.getAttribute("type") || "inline");
const lakeImage = (node) => card("image", { src: node.getAttribute("src") ?? "", alt: node.getAttribute("alt") ?? "", title: node.getAttribute("title") ?? "" }, "inline");

// A list of lake's: flat, each list its level (data-lake-indent) and its first number (start); a to-do's
// check its checkbox card. A list held in an item (another program's lake-like HTML) its items a level deeper.
function lakeList(node, depth, level) {
  const out = [];
  const start = count(node.getAttribute("start"), 1) || 1;
  [...node.children].filter((child) => child.localName === "li").forEach((li, index) => {
    const box = [...li.children].find((child) => child.localName === "card" && child.getAttribute("name") === "checkbox");
    const name = box || li.classList.contains("lake-list-task") ? "tli" : node.localName === "ol" ? "oli" : "uli";
    const nested = [...li.children].filter((child) => child.localName === "ul" || child.localName === "ol");
    const words = [...li.childNodes].filter((child) => child !== box && !nested.includes(child));
    out.push(element(name, { level, index: start - 1 + index, ...(name === "tli" && cardData(box?.getAttribute("value")) === true ? { checked: true } : {}) }, lakeInline(words, {}, depth)));
    for (const list of nested) if (depth < MAX_DEPTH) out.push(...lakeList(list, depth + 1, level + 1));
  });
  return out;
}

function lakeInline(nodes, marks, depth) {
  const out = [];
  if (depth > MAX_DEPTH) return out;
  for (const node of nodes) {
    if (node.nodeType === 3) {
      if (node.data) out.push(textNode(node.data, { ...marks }));
      continue;
    }
    if (node.nodeType !== 1) continue;
    const tag = node.localName;
    const children = () => lakeInline([...node.childNodes], marks, depth + 1);
    if (tag === "br") out.push(textNode("\n", { ...marks }));
    else if (tag === "card") out.push(lakeCard(node));
    else if (tag === "img") out.push(lakeImage(node));
    else if (tag === "code") out.push(element("code", {}, children()));
    else if (tag === "a") out.push(element("link", { src: node.getAttribute("href") ?? "" }, children()));
    else {
      const own = { ...marks, ...TAG_MARKS[tag] };
      const color = styleValue(node, "color");
      const background = styleValue(node, "background(?:-color)?");
      const decoration = styleValue(node, "text-decoration(?:-line)?");
      const weight = styleValue(node, "font-weight");
      if (color) own.color = color;
      if (background) own.bgColor = background;
      if (/line-through/.test(decoration)) own.strikethrough = true;
      if (/underline/.test(decoration)) own.underline = true;
      if (weight === "bold" || Number.parseInt(weight, 10) >= 600) own.bold = true;
      if (/italic/.test(styleValue(node, "font-style"))) own.italic = true;
      out.push(...lakeInline([...node.childNodes], own, depth + 1));
    }
  }
  return out;
}

// ---------- the nodes as block specs ----------

const formulaOf = (piece) => piece[1]?.find((annotation) => annotation[0] === "e") ?? null;
const keyOf = (annotations) => JSON.stringify([...new Set((annotations ?? []).map((a) => JSON.stringify(a)))].sort());

// Rich text with neighbours of the same marks joined (never two formulas), each mark once, empty pieces gone.
function joined(pieces) {
  const out = [];
  for (const [text, annotations = []] of pieces) {
    if (!text) continue;
    const marks = [...new Map(annotations.map((a) => [JSON.stringify(a), a])).values()];
    const last = out.at(-1);
    if (last && !formulaOf(last) && !formulaOf([text, marks]) && keyOf(last[1]) === keyOf(marks)) last[0] += text;
    else out.push(marks.length ? [text, marks] : [text]);
  }
  return out;
}

// Rich text with the white space at its ends taken off.
function trimmed(pieces) {
  const out = joined(pieces).map((piece) => [...piece]);
  while (out.length && !formulaOf(out[0]) && !out[0][0].trim()) out.shift();
  while (out.length && !formulaOf(out.at(-1)) && !out.at(-1)[0].trim()) out.pop();
  if (out.length && !formulaOf(out[0])) out[0][0] = out[0][0].replace(/^\s+/, "");
  if (out.length && !formulaOf(out.at(-1))) out.at(-1)[0] = out.at(-1)[0].replace(/\s+$/, "");
  return out;
}

// A text node's marks.
function textMarks(attrs) {
  const marks = [];
  if (attrs.bold) marks.push(["b"]);
  if (attrs.italic) marks.push(["i"]);
  if (attrs.underline) marks.push(["_"]);
  if (attrs.strikethrough) marks.push(["s"]);
  if (attrs.sup) marks.push(["sup"]);
  if (attrs.sub) marks.push(["sub"]);
  if (attrs.code) marks.push(["c"]);
  const text = typeof attrs.color === "string" ? textColor(attrs.color, { nearest: true }) : undefined;
  const background = typeof attrs.bgColor === "string" ? backgroundColor(attrs.bgColor, { nearest: true }) : undefined;
  if (text) marks.push(["h", text]);
  if (background) marks.push(["h", background]);
  return marks;
}

// What a card of no block of the page's says: its words and a web address of its, if any.
function cardWords(value) {
  const words = ["name", "title", "text", "label"].map((key) => value[key]).find((each) => typeof each === "string" && each.trim());
  const href = ["src", "url", "href", "link"].map((key) => value[key]).find((each) => typeof each === "string" && WEB.test(each.trim()));
  return { words: words ? clean(words).replace(/\s+/g, " ").trim().slice(0, 200) : "", href: href?.trim() ?? "" };
}

// A gray line where Yuque had what the page has no block for.
const missing = (what) => spec("text", [[t("（{0}没有粘贴过来：Gallery 没有这种块）", what), [["h", "gray"]]]]);

// A card's pieces in a line of text, or null when it is a block (an image, a divider, code, a board…).
function cardPieces(node, marks) {
  const value = valueOf(node);
  const name = nameOf(node);
  if (name === "math") {
    const tex = clean(value.code).trim();
    return tex ? [["⁍", [["e", tex], ...marks]]] : [];
  }
  if (name === "checkbox") return [];
  if (["image", "hr", "codeblock", "board"].includes(name)) return null;
  const { words, href } = cardWords(value);
  if (href) return [[words || href, [...marks, ["a", href]]]];
  if (words) return [[words, marks]];
  return (node.cardType ?? attrsOf(node).cardType) === "block" ? null : [];
}

// A card as blocks.
function cardSpecs(node) {
  const value = valueOf(node);
  const name = nameOf(node);
  if (name === "hr") return [spec("divider")];
  if (name === "checkbox") return [];
  if (name === "codeblock") {
    // Its mode named as a fence names a language (markdown.mjs documentCode): a language the kit does not know kept by that name.
    const mode = typeof value.mode === "string" ? value.mode.trim() : "";
    const language = mode ? languageFromFence(mode) ?? mode[0].toUpperCase() + mode.slice(1) : undefined;
    const code = clean(value.code);
    const title = clean(value.name).replace(/\s+/g, " ").trim();
    return [spec("code", code ? [[code]] : [], { ...(language ? { language } : {}), ...(/^[a-z][\w+#.-]{0,23}$/i.test(mode) ? { fence: mode.toLowerCase() } : {}), ...(title ? { title } : {}) })];
  }
  if (name === "math") {
    const tex = clean(value.code).trim();
    return tex ? [spec("equation", [[tex]])] : [];
  }
  if (name === "image") {
    const src = typeof value.src === "string" ? value.src.trim() : "";
    const caption = value.showTitle && typeof value.title === "string" ? clean(value.title).trim() : "";
    return src ? [spec("image", [], { source: src, ...(caption ? { caption: [[caption]] } : {}) })] : [];
  }
  if (name === "board") {
    // Its name: its mind map's first node, where it has one.
    const shapes = value.diagramData?.body;
    const map = Array.isArray(shapes) ? shapes.find((shape) => shape?.type === "mindmap") : null;
    const title = typeof map?.html === "string" ? decodeEntities(clean(map.html).replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim().slice(0, 100) : "";
    return [missing(title ? t("语雀画板「{0}」", title) : t("语雀画板"))];
  }
  const { words, href } = cardWords(value);
  if (href) return [spec("text", [[words || href, [["a", href]]]])];
  if (words) return [spec("text", [[words]])];
  return [missing(t("语雀的「{0}」卡片", clean(name).slice(0, 40) || "?"))];
}

// A run of inline nodes as pieces of rich text and blocks found in it (an image), in order: [piece | { block }].
function runOf(nodes, marks, out, depth) {
  if (depth > MAX_DEPTH) return out;
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    if (isText(node)) {
      const text = clean(node.data);
      if (text) out.push([text, [...marks, ...textMarks(attrsOf(node))]]);
      continue;
    }
    if (isCard(node)) {
      const pieces = cardPieces(node, marks);
      if (pieces) out.push(...pieces);
      else out.push(...cardSpecs(node).map((block) => ({ block })));
      continue;
    }
    const name = nameOf(node);
    const href = attrsOf(node).src ?? attrsOf(node).href;
    if (name === "code") runOf(kids(node), [...marks, ["c"]], out, depth + 1);
    else if (name === "link" && typeof href === "string" && href.trim()) runOf(kids(node), [...marks, ["a", href.trim()]], out, depth + 1);
    else runOf(kids(node), marks, out, depth + 1);
  }
  return out;
}

// Inline nodes as one rich text and the blocks found in them (after it: an item's, a heading's).
function inlineOf(nodes, depth) {
  const run = runOf(nodes, [], [], depth);
  return { title: trimmed(run.filter(Array.isArray)), blocks: run.filter((each) => !Array.isArray(each)).map((each) => each.block) };
}

// A paragraph's nodes as blocks: its words (empty: none), an image in it a block of its own between them.
function paragraphOf(nodes, depth) {
  const out = [];
  let words = [];
  const flush = () => {
    const title = trimmed(words);
    if (title.length) out.push(spec("text", title));
    words = [];
  };
  for (const each of runOf(nodes, [], [], depth)) {
    if (Array.isArray(each)) words.push(each);
    else {
      flush();
      out.push(each.block);
    }
  }
  flush();
  return out;
}

// A table's cell as one rich text: its paragraphs and items lines of it (an item with its marker),
// a picture a link to it, code as code.
function cellOf(cell, depth) {
  const lines = [];
  const line = (pieces) => lines.push(pieces.flatMap((each) => {
    if (Array.isArray(each)) return [each];
    const { block } = each;
    if (block.type === "image") return WEB.test(block.props.source) ? [[t("图片"), [["a", block.props.source]]]] : [];
    if (block.type === "equation") return [["⁍", [["e", block.title[0]?.[0] ?? ""]]]];
    if (block.type === "code") return block.title.length ? [[block.title[0][0], [["c"]]]] : [];
    return block.title ?? [];
  }));
  const walk = (nodes, level) => {
    let loose = [];
    const flush = () => {
      if (loose.length) line(runOf(loose, [], [], depth));
      loose = [];
    };
    for (const node of nodes) {
      const name = nameOf(node);
      if (isText(node) || name === "code" || name === "link" || (isCard(node) && cardPieces(node, []) !== null)) {
        loose.push(node);
        continue;
      }
      flush();
      if (isCard(node)) line(cardSpecs(node).map((block) => ({ block })));
      else if (LISTS[name]) line([[name === "oli" ? `${count(attrsOf(node).index) + 1}. ` : name === "tli" ? (attrsOf(node).checked ? "☑ " : "☐ ") : "• "], ...runOf(kids(node), [], [], depth)]);
      else if (name === "p" || HEADINGS[name] || name === "summary") line(runOf(kids(node), [], [], depth));
      else if (level < MAX_DEPTH) walk(kids(node), level + 1);
    }
    flush();
  };
  walk(kids(cell), 0);
  const pieces = lines.map(trimmed).filter((each) => each.length).flatMap((each, index) => (index > 0 ? [["\n"], ...each] : each));
  return joined(pieces);
}

// A cell's alignment as its look: its own, else its first paragraph's.
function cellLook(cell) {
  const first = kids(cell).find((node) => nameOf(node) === "p");
  return ALIGNS[attrsOf(cell).alignment] ?? ALIGNS[attrsOf(first).alignment] ?? "";
}

// A table: its rows' cells placed (a merged cell in each slot it covers), as a table spec (rich.mjs), a
// row's `spans` naming its cells where any is merged (to-blocks.mjs), its cells' alignments their looks.
function tableOf(node, depth) {
  const rows = [];
  (function find(parent, level) {
    for (const child of kids(parent)) {
      if (nameOf(child) === "tr") rows.push(child);
      else if (!isText(child) && !isCard(child) && level < MAX_DEPTH) find(child, level + 1);
    }
  })(node, 0);
  const cells = [];
  const taken = rows.map(() => []);
  rows.forEach((row, r) => {
    let c = 0;
    for (const cell of kids(row).filter((each) => nameOf(each) === "td" || nameOf(each) === "th")) {
      while (taken[r][c]) c++;
      const attrs = attrsOf(cell);
      const rowSpan = Math.min(Math.max(1, count(attrs.rowSpan ?? attrs.rowspan, 1)), rows.length - r, MAX_SPAN);
      const colSpan = Math.min(Math.max(1, count(attrs.colSpan ?? attrs.colspan, 1)), MAX_SPAN);
      cells.push({ r, c, rowSpan, colSpan, title: cellOf(cell, depth), look: cellLook(cell) });
      for (let dr = 0; dr < rowSpan; dr++) for (let dc = 0; dc < colSpan; dc++) taken[r + dr][c + dc] = true;
      c += colSpan;
    }
  });
  const width = Math.max(0, ...taken.map((row) => row.length));
  if (!rows.length || !width) return [];
  const columns = Array.from({ length: width }, (_, i) => `c${i}`);
  const merged = cells.some((cell) => cell.rowSpan > 1 || cell.colSpan > 1);
  const looked = cells.some((cell) => cell.look);
  const rowSpecs = rows.map((_, r) => {
    const own = cells.filter((cell) => cell.r === r);
    const by = (value) => Object.fromEntries(own.map((cell) => [columns[cell.c], value(cell)]));
    return spec("table_row", [], { cells: by((cell) => cell.title), ...(merged ? { spans: by((cell) => [cell.rowSpan, cell.colSpan]) } : {}), ...(looked ? { looks: by((cell) => cell.look) } : {}) });
  });
  return [spec("table", [], { table_block_column_order: columns, table_block_column_format: {}, table_block_column_header: false, table_block_row_header: false }, rowSpecs)];
}

// A node at a block's level (not a list item: blocksOf nests those).
function blockOf(node, depth) {
  const name = nameOf(node);
  const inner = () => blocksOf(kids(node), depth + 1);
  if (isCard(node)) return cardSpecs(node);
  if (name === "p" || name === "summary") return paragraphOf(kids(node), depth);
  if (HEADINGS[name]) {
    const { title, blocks } = inlineOf(kids(node), depth);
    return [spec(HEADINGS[name], title), ...blocks];
  }
  if (name === "quote") {
    // Its first paragraph its text, the rest its blocks (html.mjs quoteBlock).
    const blocks = inner();
    const [first, ...rest] = blocks;
    return first?.type === "text" && !first.children.length ? [spec("quote", first.title, {}, rest)] : [spec("quote", [], {}, blocks)];
  }
  if (name === "alert") return [spec("report_callout", [], { alert: String(attrsOf(node).type ?? "").toLowerCase() }, inner())];
  if (name === "collapse") {
    const summary = kids(node).find((child) => nameOf(child) === "summary");
    return [spec("toggle", summary ? inlineOf(kids(summary), depth).title : [], {}, blocksOf(kids(node).filter((child) => child !== summary), depth + 1))];
  }
  if (name === "table") return tableOf(node, depth);
  return inner(); // a hole (hole, tableHole, alertHole, containerHole) or a node of no block: what it holds
}

const isInline = (node) => isText(node) || ["code", "link"].includes(nameOf(node)) || (isCard(node) && (node.cardType ?? attrsOf(node).cardType) === "inline" && cardPieces(node, []) !== null);

// Nodes at a block's level as specs: list items nested by their levels, inline nodes standing at that
// level one paragraph.
function blocksOf(nodes, depth) {
  const out = [];
  if (depth > MAX_DEPTH) return out;
  let loose = [];
  let items = null; // the open list's levels: [{ level, children }]
  const flush = () => {
    if (loose.length) out.push(...paragraphOf(loose, depth));
    loose = [];
  };
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    if (isInline(node)) {
      items = null;
      loose.push(node);
      continue;
    }
    flush();
    const type = LISTS[nameOf(node)];
    if (!type) {
      items = null;
      out.push(...blockOf(node, depth));
      continue;
    }
    const attrs = attrsOf(node);
    const level = count(attrs.level);
    const { title, blocks } = inlineOf(kids(node).filter((child) => !(isCard(child) && nameOf(child) === "checkbox")), depth);
    const props = type === "to_do" ? { checked: attrs.checked === true || attrs.checked === "true" } : type === "numbered_list" ? { number: count(attrs.index) + 1 } : {};
    const item = spec(type, title, props, blocks);
    items ??= [{ level: -1, children: out }];
    while (items.length > 1 && items.at(-1).level >= level) items.pop();
    items.at(-1).children.push(item);
    items.push({ level, children: item.children });
  }
  flush();
  return out;
}

// What both readings end with: a 提示's kind its color, a paragraph of one formula alone a formula block.
function finish(specs) {
  return specs.map((s) => {
    const children = finish(s.children ?? []);
    if (s.type === "report_callout") {
      const color = ALERT_COLORS[s.props?.alert];
      return spec(s.type, [], color ? { color } : {}, children);
    }
    if (s.type === "text" && !children.length) {
      const words = (s.title ?? []).filter((piece) => formulaOf(piece) || piece[0].trim());
      if (words.length === 1 && formulaOf(words[0])) return spec("equation", [[formulaOf(words[0])[1]]]);
    }
    return { ...s, children };
  });
}

/** Yuque's nodes (yuqueTree) as block specs. */
export const yuqueSpecs = (tree) => finish(blocksOf(kids(tree), 0));

// ---------- its Markdown ----------

// What only Yuque's Markdown has: a ::: 提示, its pictures' and 折叠块's classes, a <font style>.
const YUQUE_MARKS = [/^:::(?:info|tips|success|warning|danger|color\d)[ \t]*$/m, /<[a-z]+\s[^<>]{0,1000}\bclass="(?:ne|lake)-[a-z-]+"/, /<font\s+style="/];

/**
 * Whether the clipboard's text is Yuque's Markdown (its toolbar's 复制为 Markdown): several lines with
 * a mark of Yuque's own, or beside HTML that is its words alone in one span in Yuque's font (Ant
 * Design's "Chinese Quote", white space kept), as its toolbar's copy is.
 */
export function yuqueMarkdownCopy(data, text) {
  if (!multiline(text)) return false;
  if (YUQUE_MARKS.some((mark) => mark.test(text))) return true;
  const html = data.getData("text/html") || "";
  return /font-family:\s*(?:&quot;|")Chinese Quote/.test(html) && /white-space:\s*pre/.test(html) && !/<(?:p|div|h[1-6]|ul|ol|li|table|pre|blockquote|img)\b/i.test(html);
}

// The HTML blocks of Yuque's Markdown read as the paste reads HTML, at any depth.
const withHtml = (specs, options) => specs.flatMap((s) => (s.type === "html"
  ? htmlToBlocks(parseClipboardHTML(String(s.props?.html ?? ""), options), { colors: "nearest" })
  : [{ ...s, children: withHtml(s.children ?? [], options) }]));

/** Yuque's Markdown as block specs: read as a whole document with what Yuque writes besides (markdown.mjs `yuque`). */
export const yuqueMarkdown = (text, options = {}) => finish(withHtml(readMarkdownDocument(text, { yuque: true }).specs, options));

// ---------- the paste ----------

// Kinds of block whose text is one line, which one line copied goes in as.
const LINE_TYPES = new Set(["text", "header", "sub_header", "sub_sub_header", "header_4", "bulleted_list", "numbered_list", "to_do", "quote"]);

/**
 * What Yuque put on the clipboard, as read.mjs readExternal says a paste is ({ kind: "blocks", specs }
 * | { kind: "rich", title }), or null when it is not Yuque's (or holds nothing to read).
 */
export function readYuque(data, options = {}) {
  const text = (data.getData("text/plain") || "").replace(/\u2028/g, "\n").replace(/\r\n?/g, "\n");
  const tree = yuqueTree(data);
  const specs = tree ? yuqueSpecs(tree) : [];
  if (specs.length) {
    // One line copied (a paragraph's words, a heading's, an item's): its words with their marks at the caret.
    const [only] = specs;
    if (specs.length === 1 && !only.children.length && LINE_TYPES.has(only.type) && only.title.length && !multiline(text)) return { kind: "rich", title: only.title };
    return { kind: "blocks", specs };
  }
  if (!tree && yuqueMarkdownCopy(data, text)) {
    const read = yuqueMarkdown(text, options);
    if (read.length) return { kind: "blocks", specs: read };
  }
  return null;
}
