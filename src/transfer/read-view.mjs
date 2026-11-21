import fs from "node:fs";
import path from "node:path";
import { shownSource } from "../editor/source.mjs";
import { APART, BLOCK_TYPES, BOX_CLASSES, ENTRIES, READS, UNIT_COMPONENT, UNIT_KINDS, boxOwner } from "../editor/components/registry.mjs";
import { isInkClass } from "../editor/page/marks.mjs";
import { MATH, PAGE } from "../editor/components/kit.mjs";
import { boxed, dedented, fenced, flowRows, labeled, plainRow, prefixed, rowOf } from "../editor/components/read-rows.mjs";
import { wordsIn } from "../editor/page/clipboard/own/writers.mjs";
import { HEADING, LEFT_OUT, texReading } from "../editor/page/outline/read.mjs";
import { pictureSize } from "../render/picture-sizes.mjs";
import { currentCatalog } from "../shared/component-catalog.mjs";
import { COMPONENTS as DESCRIPTIONS, parseCompound } from "../shared/components/index.mjs";
import { SLOT } from "../shared/components/installed.mjs";
import { MENTION } from "../shared/components/mention.mjs";
import { formatSize, referencedFile } from "../shared/media.mjs";
import { documentDirectory } from "../shared/workspace.mjs";
import { editorCore, openReportPlaced } from "./dom.mjs";
import { markdownWriter, reportMarkdown } from "./markdown.mjs";

// gallery read (src/cli/read.mjs): a document as one reads it, written nowhere (docs/internals.md,
// "Reading a document"). The page is opened as the page editor opens it (dom.mjs openReportPlaced: the
// file as the preview shows it, natural HTML made the kit's in memory, every unit and box marked), each
// node with its place in that text, so that every block has its kind, its data-block-id and its line
// in doc.html (naturalize adds no line). A document is a tree of nodes (nodesOf): a unit (a block of
// the editor's, by its kind), a wrapper (what is no unit and holds units: the header, a detail card of
// the file, a plain group) and a loose piece (what a flow holds that is no block: words straight in it,
// an element the editor makes no block of). Each kind of unit says how it is read (its definition's
// `read`, components/registry.mjs READS; tests/unit/read.mjs fails on a kind with none), with the rows
// of components/read-rows.mjs; this file knows no kind. The formats:
//   full      every block in reading order, the default (fullRows): what Markdown says well as
//             Markdown, what it cannot as what it is, fenced and named; nothing dropped, and what a
//             view could not write said at its end (unwritten, view.missing)
//   markdown  the export's Markdown (markdown.mjs, as 复制页面内容), lossy: what it leaves out said (markdownLosses)
//   text      the words alone (textLines)
//   html      the file's own text of the part (the CLI's: it is the file's, not this tree's)
//   json      the nodes as data (nodeData)

/** The formats, the default first. */
export const FORMATS = ["full", "markdown", "text", "html", "json"];

/** How each kind of unit is read, by kind: every kind's definition's `read`. */
export const VIEWS = READS;

// What a box's flow holds that shows nothing and is no block: written nowhere but counted at the view's end.
const UNSEEN = "script, style, template, noscript";
const FORMULA = /^\s*\\\(([\s\S]*)\\\)\s*$/;
// The inline elements Markdown has a mark for, by tag, and those it writes as HTML ("<>"); `: code's.
const MARKS = { strong: "**", b: "**", em: "*", i: "*", s: "~~", del: "~~", strike: "~~", code: "`", u: "<>", sub: "<>", sup: "<>" };
// Where each picture of a text block stands while its text is written (characters no file holds).
const PICTURE = /\uE000(\d+)\uE001/g;
// The classes that make an element the kind of block it is, or a part of one, the definitions' own (the editor's,
// the kit's descriptions'): a block's {…} need not repeat them.
const describedClasses = [...DESCRIPTIONS.flatMap((component) => [component.match, ...Object.values(component.parts ?? {}).map((part) => part.at)]), ...ENTRIES.map((entry) => entry.at)]
  .filter((selector) => typeof selector === "string")
  .flatMap((selector) => selector.split(/[,>+~\s]+/).filter((step) => step && step !== ":scope").flatMap((step) => {
    try {
      return parseCompound(step).classes;
    } catch {
      return [];
    }
  }));
const OWN_CLASSES = new Set([...UNIT_KINDS.map((rule) => rule.class), ...Object.values(BLOCK_TYPES).map((spec) => spec.className), ...BOX_CLASSES.map(([name]) => name), ...describedClasses].filter(Boolean));

/**
 * Document `source` (doc.html's text) opened for reading: { source, text (as the page reads it),
 * natural (the file holds HTML the export or the reader's first edit will rewrite as the kit's),
 * document, placeOf, lineOf(offset), lines (the file's) }. `drawn`: what the text is read as after
 * (the Markdown's page blocks titled as they show: render/page-chips.mjs, which writes no line).
 */
export async function openForReading(source, { drawn = (text) => text } = {}) {
  const shown = shownSource(source);
  const text = drawn(shown.text);
  const { document, placeOf } = await openReportPlaced(text);
  const starts = [0];
  for (let at = text.indexOf("\n"); at !== -1; at = text.indexOf("\n", at + 1)) starts.push(at + 1);
  const lineOf = (offset) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (starts[middle] <= offset) low = middle;
      else high = middle - 1;
    }
    return low + 1;
  };
  const core = await editorCore();
  return { source, text, natural: shown.changes.length > 0 || shown.text !== source, document, placeOf, lineOf, lines: source.split("\n").length, core };
}

/**
 * The tree of `opened`'s page: { roots, all (in reading order), unseen, code, title, titleLine }. A
 * node: { n (its number, in reading order, from 1), type ("unit", "wrapper", "loose"), kind (a unit's;
 * a wrapper's: "header", the kind of the box it holds when a unit of that kind is read so (a detail
 * card), "group", "element"; a loose piece's: "words", "element"), el, id (data-block-id, or null),
 * line, endLine, start, end (offsets in the text), parent (a node, or null), children, place (the part
 * of its container it stands in: a tab's name, a slot's) }. A box's blocks stand under the block that
 * owns the box (a Sheet panel's under its tab: registry.mjs boxOwner). `code`: the page's own style and
 * script ({ tag, line, endLine, charts }); `unseen`: a script, style or template a flow holds.
 */
export function nodesOf(opened) {
  const { document, placeOf, lineOf } = opened;
  const unseen = [];
  const make = (fields) => {
    const node = { n: 0, children: [], parent: null, place: null, id: null, ...fields };
    const at = placeOf(node.el);
    node.start = at?.start ?? null;
    node.end = at?.end ?? null;
    node.line = at ? lineOf(at.start) : null;
    node.endLine = at ? lineOf(Math.max(at.start, at.end - 1)) : null;
    return node;
  };
  const holdsUnits = (element) => element.querySelector("[data-ge-unit]") !== null;
  // What `container` holds as nodes, in order; `flow`: it is a box (or the page), where what is no unit is a node too.
  function collect(container, parent, flow) {
    const out = [];
    const text = container.nodeType === 1 && container.hasAttribute("data-ge-block"); // a text block's own words are no nodes
    for (const child of container.childNodes) {
      if (child.nodeType === 1) {
        if (child.hasAttribute("data-ge-unit")) out.push(unit(child, parent));
        else if (!flow || text) {
          if (holdsUnits(child) || child.hasAttribute("data-ge-box")) out.push(...collect(child, parent, child.hasAttribute("data-ge-box")));
        } else if (child.matches(UNSEEN)) unseen.push({ tag: child.localName, line: placeOf(child) ? lineOf(placeOf(child).start) : null });
        else if (child.matches(PAGE.title)) continue; // the header writes it
        else if (holdsUnits(child) || child.matches(PAGE.header)) out.push(wrapper(child, parent));
        else out.push(make({ type: "loose", kind: "element", el: child, parent }));
      } else if (child.nodeType === 3 && flow && !text && child.data.trim()) {
        out.push(make({ type: "loose", kind: "words", el: child, parent }));
      }
    }
    return out;
  }
  function unit(element, parent) {
    const node = make({ type: "unit", kind: element.getAttribute("data-ge-unit-kind"), el: element, id: element.getAttribute("data-block-id"), parent });
    node.children = collect(element, node, element.hasAttribute("data-ge-box"));
    // A box another block of it owns (a Sheet panel, its tab): its blocks under that one.
    for (const child of [...node.children]) {
      const box = child.el.parentElement?.closest("[data-ge-box]");
      const owner = box && node.el.contains(box) ? boxOwner(box) : null;
      const holder = owner && node.children.find((other) => other.el === owner);
      if (!holder || holder === child) continue;
      holder.children.push(child);
      child.parent = holder;
      child.place = owner.textContent.replace(/\s+/g, " ").trim();
    }
    node.children = node.children.filter((child) => child.parent === node);
    for (const child of node.children) child.place ??= child.el.parentElement?.closest(`[${SLOT}]`)?.getAttribute(SLOT) ?? null;
    return node;
  }
  function wrapper(element, parent) {
    const box = element.matches("[data-ge-box]") ? element : element.querySelector("[data-ge-box]");
    const boxKind = box?.getAttribute("data-ge-box-kind");
    const kind = element.matches(PAGE.header) ? "header" : boxKind && READS[boxKind] ? boxKind : boxKind === "plain" ? "group" : "element";
    const node = make({ type: "wrapper", kind, el: element, parent });
    node.children = collect(element, node, element.hasAttribute("data-ge-box"));
    return node;
  }
  const main = document.querySelector("main");
  const roots = main ? collect(main, null, true) : [];
  // Numbered in reading order.
  const all = allOf(roots);
  all.forEach((node, index) => (node.n = index + 1));
  const title = main?.querySelector(PAGE.title) ?? null;
  const titleLine = title && placeOf(title) ? lineOf(placeOf(title).start) : null;
  // The page's own style and script: those of its head and body, but the kit's (data-doc-kit, data-doc-vendor), a file's and data.
  const code = [...document.querySelectorAll("style, script")].filter((element) => !element.closest("main") && !element.hasAttribute("data-doc-kit") && !element.hasAttribute("data-doc-vendor")
    && !/json/i.test(element.getAttribute("type") ?? "") && !element.hasAttribute("src") && element.textContent.trim())
    .map((element) => {
      const at = placeOf(element);
      const charts = element.localName === "script" ? [...element.textContent.matchAll(/DocCharts\.define\(\s*["'`]([^"'`]+)["'`]/g)].map((match) => match[1]) : [];
      return { tag: element.localName, line: at ? lineOf(at.start) : null, endLine: at ? lineOf(Math.max(at.start, at.end - 1)) : null, charts };
    });
  return { roots, all, unseen, code, title, titleLine };
}

/** Every node of the tree, `nodes` and what they hold, in reading order. */
export const allOf = (nodes) => nodes.flatMap((node) => [node, ...allOf(node.children)]);

/** The attributes an element's start tag has in the text (the file's, none of the page editor's), in order: [{ name, value }] (value null for one with none). */
export function fileAttributes(opened, element) {
  const at = opened.placeOf(element);
  if (!at || at.tagEnd === null) return [];
  const tag = opened.text.slice(at.start, at.tagEnd).replace(/^<[^\s/>]+/, "").replace(/\/?>$/, "");
  return [...tag.matchAll(/([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)].map((match) => ({ name: match[1].toLowerCase(), value: match[2] ?? match[3] ?? match[4] ?? null }));
}

// What the views write with (read-rows.mjs says what each is for).
function toolsOf(opened, { folder, workspace }) {
  const { document, core } = opened;
  const { serializeInner } = core;
  const braces = (parts) => (parts.length ? `{${parts.join(" ")}}` : "");
  const attributesOf = (element) => [...element.attributes].filter(({ name }) => !name.startsWith("data-ge-") && name !== "contenteditable" && name !== "spellcheck");
  const picture = (img) => {
    const rest = attributesOf(img).filter(({ name }) => !["src", "alt"].includes(name)).map(({ name, value }) => `${name}="${value}"`);
    return `![${img.getAttribute("alt") ?? ""}](${img.getAttribute("data-ge-src") ?? img.getAttribute("src") ?? ""})${braces(rest)}`;
  };
  // A text block's inner HTML as the editor writes it, with its pictures (which it writes none of) as the file has them.
  const innerOf = (host) => {
    // What a text block holds that is written apart (a detail card in a list item) is none of its words.
    const node = host.querySelector(APART) ? host.cloneNode(true) : host;
    if (node !== host) for (const each of node.querySelectorAll(APART)) each.remove();
    const pictures = [...node.getElementsByTagName("img")];
    if (pictures.length === 0) return serializeInner(node);
    const copy = node.cloneNode(true);
    [...copy.getElementsByTagName("img")].forEach((img, index) => img.replaceWith(`\uE000${index}\uE001`));
    return serializeInner(copy).replace(PICTURE, (_, index) => {
      const img = pictures[Number(index)];
      const attributes = attributesOf(img).filter(({ name }) => !(name === "src" && img.hasAttribute("data-ge-src")));
      return `<img${img.hasAttribute("data-ge-src") ? ` src="${img.getAttribute("data-ge-src")}"` : ""}${attributes.map(({ name, value }) => ` ${name}="${value.replace(/"/g, "&quot;")}"`).join("")}>`;
    });
  };
  // Inline HTML as the default view writes it: Markdown's marks, and what Markdown has none for as HTML or {…}.
  const inline = (html) => {
    const template = document.createElement("template");
    template.innerHTML = html ?? "";
    const wrap = (mark, inner) => {
      if (!inner.trim()) return inner;
      const [lead, body, tail] = [inner.match(/^\s*/)[0], inner.trim(), inner.match(/\s*$/)[0]];
      return `${lead}${mark}${body}${mark}${tail}`;
    };
    const walk = (node) => [...node.childNodes].map((child) => {
      if (child.nodeType === 3) return child.data.replace(/\u00A0/g, " ");
      if (child.nodeType !== 1) return "";
      const tag = child.localName;
      if (child.matches(MATH.inline)) {
        const tex = FORMULA.exec(child.textContent)?.[1];
        return tex !== undefined ? `$${tex.trim()}$` : child.textContent;
      }
      if (tag === "br") return "\n";
      if (tag === "img") return picture(child);
      if (tag === "a" && child.classList.contains(MENTION)) return `[${child.textContent.replace(/\s+/g, " ").trim()}](${child.getAttribute("href") ?? ""}){.${MENTION}}`;
      const inner = walk(child);
      const mark = MARKS[tag];
      if (mark === "`") {
        const ticks = "`".repeat(Math.max(0, ...[...inner.matchAll(/`+/g)].map((run) => run[0].length)) + 1);
        return `${ticks}${inner}${ticks}`;
      }
      if (mark === "<>") return `<${tag}>${inner}</${tag}>`;
      if (mark) return wrap(mark, inner);
      switch (tag) {
        case "a": {
          // Its attributes but its address, and its classes but the kit's mark of a link that opens a detail card.
          const rest = attributesOf(child).filter(({ name }) => name !== "href").flatMap(({ name, value }) => (name === "class" ? value.split(/\s+/).filter((one) => one && !OWN_CLASSES.has(one)).map((one) => `.${one}`) : [`${name}="${value}"`]));
          return `[${inner}](${child.getAttribute("href") ?? ""})${braces(rest)}`;
        }
        case "span": {
          const own = attributesOf(child);
          if (own.length === 1 && own[0].name === "class" && own[0].value.split(/\s+/).every((one) => one.startsWith("doc-"))) return `[${inner}]${braces(own[0].value.split(/\s+/).filter(Boolean).map((one) => `.${one}`))}`;
          break;
        }
      }
      return child.outerHTML; // an inline element of the page's own: as it is written
    }).join("");
    return walk(template.content).replace(/[ \t]+\n/g, "\n").trim();
  };
  const tools = {
    braces, attributesOf, picture, innerOf, inline,
    own: (host) => inline(innerOf(host)),
    fileAttributes: (element) => fileAttributes(opened, element),
    /**
     * An element's {…}: its file's attributes, but data-block-id, those `skip` names and the classes that make it its
     * kind (and those of `drop`; all of them with `all`, those of `keep`).
     */
    looks(element, { skip = [], keep = [], drop = [], all = false } = {}) {
      const parts = [];
      for (const { name, value } of fileAttributes(opened, element)) {
        if (name === "data-block-id" || skip.includes(name)) continue;
        if (name === "class") {
          for (const one of (value ?? "").split(/\s+/).filter(Boolean)) if (all || ((!OWN_CLASSES.has(one) || keep.includes(one)) && !drop.includes(one))) parts.push(`.${one}`);
        } else parts.push(value === null ? name : `${name}="${value}"`);
      }
      return parts.length ? ` ${braces(parts)}` : "";
    },
    plain: (element) => (element?.textContent ?? "").replace(/\s+/g, " ").trim(),
    /** A text block's words, its formulas read as words. */
    words(host) {
      const template = document.createElement("template");
      template.innerHTML = innerOf(host);
      for (const math of template.content.querySelectorAll(MATH.inline)) {
        const tex = FORMULA.exec(math.textContent)?.[1];
        math.replaceWith(tex === undefined ? math.textContent : texReading(tex));
      }
      for (const br of template.content.querySelectorAll("br")) br.replaceWith("\n");
      return template.content.textContent.replace(/\u00A0/g, " ").replace(/[ \t]+/g, " ").trim();
    },
    texWords: (tex) => texReading(tex),
    wordsIn: (element, more = "", without = null) => wordsIn(element, more, without),
    /** An element's text as the file has it, out of its indentation: lines (null for one the page made); `emptied`: elements whose inside is `note` there. */
    source(element, { emptied = [], note = "…" } = {}) {
      const at = opened.placeOf(element);
      if (!at) return null;
      let text = opened.text.slice(at.start, at.end);
      for (const place of emptied.map((each) => opened.placeOf(each)).filter((one) => one && one.tagEnd !== null).sort((a, b) => b.start - a.start)) {
        const [from, to] = [place.tagEnd - at.start, opened.text.lastIndexOf("</", place.end - 1) - at.start];
        if (to > from) text = `${text.slice(0, from)}${note}${text.slice(to)}`;
      }
      const lineStart = opened.text.lastIndexOf("\n", at.start - 1) + 1;
      const before = opened.text.slice(lineStart, at.start);
      return dedented(text, /^[ \t]*$/.test(before) ? before.length : 0);
    },
    lineAt: (element) => (opened.placeOf(element) ? opened.lineOf(opened.placeOf(element).start) : null),
    /** What a file of the document's folder is: its path, whether it is there, its size (a picture's pixels too). */
    fileFacts(src, isPicture = false) {
      if (!src) return "（没有）";
      const file = referencedFile(src);
      if (!file || !folder) return src;
      let bytes;
      try {
        bytes = fs.readFileSync(path.join(folder, file));
      } catch {
        return `${src}（文件夹里没有这个文件）`;
      }
      const size = isPicture ? pictureSize(bytes) : null;
      return `${src} · ${formatSize(bytes.length)}${size ? ` · ${size.width}×${size.height} 像素` : ""}`;
    },
    /** A custom block of the workspace (its manifest), or null. */
    packageOf(id) {
      try {
        return currentCatalog(workspace ?? undefined).packages.get(id) ?? null;
      } catch {
        return null;
      }
    },
  };
  return tools;
}

// ---------- the default view ----------

/** What a node is called: its kind's name (or that of what it shows as: 开头概括, 编号列表, 小字). */
export function nameOf(node) {
  const el = node.el;
  if (node.type === "loose") return node.kind === "words" ? "不在块里的字" : `<${el.localName}>`;
  if (node.type === "wrapper") return READS[node.kind]?.name ?? { header: "页眉", group: "分组" }[node.kind] ?? `<${el.localName}>`;
  const read = READS[node.kind];
  return read?.label?.(node) ?? read?.name ?? node.kind;
}

// A unit's rows with the blocks it holds that its kind's way left out (none, but where the editor finds blocks
// in a block that holds none for its kind), written after its own, inside its box.
function withHeld(node, rows, view) {
  const written = new Set(rows.map((row) => row.node).filter(Boolean));
  const left = node.children.filter((child) => !allOf([child]).some((each) => written.has(each)));
  if (left.length === 0) return rows;
  const more = [plainRow(""), plainRow(`它里面还有 ${left.length} 个块：`), ...flowRows(left, view)];
  if (rows.at(-1)?.text === "└─") return [...rows.slice(0, -1), ...prefixed(more, "│ "), rows.at(-1)];
  return [...rows, ...more];
}

// The header: the page's title (no block of the editor's: the page's name) in its place among its blocks.
function headerRows(node, view) {
  const { title, titleLine } = view.model;
  const before = title ? node.children.filter((child) => child.line !== null && titleLine !== null && child.line < titleLine) : [];
  const after = node.children.filter((child) => !before.includes(child));
  const titleRows = title ? [{ text: `# ${view.tools.own(title) || "（未命名文档）"}`, line: titleLine, id: title.getAttribute("data-block-id"), node: null }] : [];
  const parts = [flowRows(before, view), titleRows, flowRows(after, view)].filter((rows) => rows.length);
  return boxed(node, "页眉", parts.flatMap((rows, index) => (index ? [plainRow(""), ...rows] : rows)));
}

/**
 * The view that writes `opened`'s nodes (`model`, nodesOf's): { node(node) → rows, readAs(kind, node), words(node),
 * flowWords(nodes), tools, model, opened, missing (what it could only write as its HTML, and why) }.
 * `folder`: the document's (its files' sizes); `workspace`: whose custom blocks name an instance.
 */
export function viewOf(opened, model, { folder = null, workspace = null } = {}) {
  const tools = toolsOf(opened, { folder, workspace });
  const missing = [];
  const html = (node) => fenced("html", tools.source(node.el) ?? [node.el.outerHTML ?? ""]);
  const view = {
    opened, model, tools, folder, workspace, missing,
    node(node) {
      try {
        if (node.type === "loose") {
          if (node.kind === "words") return [rowOf(node, `── 不在块里的字：${node.el.data.replace(/\s+/g, " ").trim()}`)];
          return labeled(node, `不是块的内容 <${node.el.localName}>（编辑器不把它当块，原样给出）`, html(node));
        }
        if (node.type === "wrapper") {
          if (node.kind === "header") return headerRows(node, view);
          if (READS[node.kind]) return withHeld(node, READS[node.kind].rows(node, view), view);
          if (node.kind === "group") return boxed(node, `分组 <${node.el.localName}>${tools.looks(node.el)}`, flowRows(node.children, view));
          return boxed(node, `<${node.el.localName}>${tools.looks(node.el, { all: true })}（不是 Gallery 的块，里面的块照样写）`, flowRows(node.children, view));
        }
        const read = READS[node.kind];
        if (read) return withHeld(node, read.rows(node, view), view);
        missing.push({ node, why: `没有 ${node.kind} 这种块的写法，给的是它的 HTML` });
      } catch (error) {
        missing.push({ node, why: `写它时出错（${error.message}），给的是它的 HTML` });
      }
      return labeled(node, `${node.kind} <${node.el.localName}>`, html(node));
    },
    /** Element nodes written as `kind` writes them (a card's table). */
    readAs: (kind, node) => READS[kind].rows(node, view),
    /** A node's words: lines (its kind's, else its blocks'). */
    words(node) {
      if (node.type === "loose") return node.kind === "words" ? [node.el.data.replace(/\s+/g, " ").trim()] : [wordsIn(node.el).join(" · ")];
      if (node.kind === "header") return [...(model.title ? [tools.words(model.title)] : []), ...view.flowWords(node.children)];
      const read = READS[node.kind];
      return read?.words ? read.words(node, view).filter((line) => typeof line === "string" && line !== "") : view.flowWords(node.children);
    },
    /** Nodes' words in turn, an empty line between two. */
    flowWords(nodes) {
      const out = [];
      for (const node of nodes) {
        const said = view.words(node);
        if (!said.some((line) => line.trim())) continue;
        if (out.length) out.push("");
        out.push(...said);
      }
      return out;
    },
  };
  return view;
}

/** The rows of `nodes` (a flow's, or a part) in the default view. */
export const fullRows = (nodes, view) => flowRows(nodes, view);

/** The units of `nodes` (and what they hold) that `rows` do not write: none, but for a view that missed one. */
export function unwritten(rows, nodes) {
  const written = new Set(rows.map((row) => row.node).filter(Boolean));
  return allOf(nodes).filter((node) => node.type === "unit" && !written.has(node));
}

/** Rows as lines: each with its gutter (the line in doc.html and the block's id, when the document has ids). */
export function gutterLines(rows) {
  const lineWidth = Math.max(1, ...rows.map((row) => String(row.line ?? "").length));
  const idWidth = Math.max(0, ...rows.map((row) => (row.id ?? "").length));
  return rows.map((row) => `${String(row.line ?? "").padStart(lineWidth)}${idWidth ? ` ${(row.id ?? "").padEnd(idWidth)}` : ""} │ ${row.text}`.trimEnd());
}

/** The words of `nodes`, a block a paragraph (an empty line between), as the reader reads them. */
export const textLines = (nodes, view) => view.flowWords(nodes);

// ---------- the Markdown ----------

/** What the export's Markdown of the nodes `all` leaves out: phrases, to say at its end (each kind's `lost`, and looks). */
export function markdownLosses(all) {
  const counts = new Map();
  const count = (phrase) => phrase && counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  for (const node of all) if (node.type !== "loose") count(READS[node.kind]?.lost?.(node));
  for (const node of all) if (node.type === "unit" && /(?:^|\s)doc-(?:text|highlight|align|indent)-/.test(node.el.getAttribute("class") ?? "")) count("颜色、对齐或缩进 {n} 处");
  // A text block whose words have a color or a fill of the kit's (marks.mjs isInkClass), or a red underline.
  const inked = (element) => [...element.getElementsByTagName("*")].some((each) => each.localName === "u" || [...each.classList].some(isInkClass));
  for (const node of all) if (node.type === "unit" && node.el.hasAttribute("data-ge-block") && inked(node.el)) count("{n} 个块里文字的颜色、底色或下划线");
  return [...counts].map(([phrase, number]) => phrase.replace("{n}", number));
}

/** The page's Markdown as the export writes it (markdown.mjs reportMarkdown), or that of the nodes of a part. */
export async function markdownText(opened, { title, nodes = null }) {
  if (!nodes) return reportMarkdown(opened.document, { title });
  const writer = await markdownWriter(opened.document);
  const out = [];
  for (const node of nodes) {
    const written = markdownOf(node, writer);
    if (written.length === 0) continue;
    if (out.length) out.push("");
    out.push(...written);
  }
  return out.join("\n");
}

/**
 * A whole document's words as gallery read writes them (src/cli/read.mjs, with no part asked): `text`, its
 * --format text (the words alone, textLines), and `markdown`, its --format markdown (the export's Markdown,
 * its page blocks by the titles they show: render/page-chips.mjs) without the comment the command says after it.
 * What an offline file carries for its display menu's 复制为完整文本 and 复制为 Markdown (src/transfer/carry.mjs),
 * so that the copy is what the command reads. `slug` and `root`: the document and its workspace (its folder,
 * what its page blocks name); `title`: its doc.json's, else its header's, else the slug.
 */
export async function wholeReadings(source, { slug, root, title = null }) {
  const folder = documentDirectory(slug, root);
  const opened = await openForReading(source);
  const model = nodesOf(opened);
  const text = textLines(model.roots, viewOf(opened, model, { folder, workspace: root })).join("\n");
  const { drawPageChips } = await import("../render/page-chips.mjs");
  const drawn = await openForReading(source, { drawn: (shown) => drawPageChips(shown, { slug, mode: "words", reportsDirectory: root }) });
  const drawnModel = nodesOf(drawn);
  const reading = viewOf(drawn, drawnModel, { folder, workspace: root });
  const named = (typeof title === "string" && title.trim()) || (drawnModel.title ? reading.tools.words(drawnModel.title) : "") || slug;
  return { text, markdown: await markdownText(drawn, { title: named, nodes: null }) };
}

// A node's Markdown as the export writes it (a wrapper's: its blocks').
function markdownOf(node, writer) {
  if (node.type === "unit") return READS[node.kind]?.alone?.(node, writer) ?? writer.block(node.el);
  if (node.type === "loose") return node.kind === "words" ? [node.el.data.trim()] : writer.lines([node.el]);
  return node.children.flatMap((child, index) => [...(index ? [""] : []), ...markdownOf(child, writer)]);
}

// ---------- the JSON ----------

/** A node as data (what it holds by their numbers). */
export function nodeData(node, view, writer) {
  const { opened } = view;
  const el = node.el;
  let markdown = null;
  try {
    markdown = markdownOf(node, writer).join("\n");
  } catch {}
  const data = node.type === "loose" ? null : READS[node.kind]?.data?.(node, view) ?? null;
  const siblings = node.parent ? node.parent.children : view.model.roots;
  return {
    n: node.n,
    id: node.id,
    kind: node.kind,
    type: node.type,
    name: nameOf(node),
    ...(data?.level ? { level: data.level } : {}),
    parent: node.parent?.n ?? null,
    index: siblings.indexOf(node),
    depth: depthOf(node),
    place: node.place,
    line: node.line,
    endLine: node.endLine,
    tag: el.nodeType === 1 ? el.localName : null,
    text: view.words(node).join("\n"),
    markdown,
    html: node.start !== null ? opened.text.slice(node.start, node.end) : null,
    attributes: el.nodeType === 1 ? Object.fromEntries(fileAttributes(opened, el).map(({ name, value }) => [name, value])) : {},
    data,
    children: node.children.map((child) => child.n),
  };
}
const depthOf = (node) => (node.parent ? depthOf(node.parent) + 1 : 0);

// ---------- parts ----------

/** Whether `node` is a heading the outline lists (as the page's 目录: none in a card, a table, a list, a detail card, the header). */
export const listedHeading = (node) => node.type === "unit" && node.el.matches(HEADING) && !node.el.parentElement?.closest(LEFT_OUT);
const levelOf = (node) => Number(node.el.localName[1]);

/** The nodes of a heading's section: it and what follows it in its flow up to a heading of its level or higher (or a block holding one), as the page folds it. */
export function sectionOf(heading, roots) {
  const siblings = heading.parent ? heading.parent.children : roots;
  const level = levelOf(heading);
  const out = [heading];
  for (const next of siblings.slice(siblings.indexOf(heading) + 1)) {
    if (allOf([next]).some((node) => listedHeading(node) && levelOf(node) <= level)) break;
    out.push(next);
  }
  return out;
}

/** The section `node` is in: that of the nearest heading before it in its flow (or in a flow around it) whose section holds it; null for none. */
export function sectionAround(node, roots) {
  for (let at = node; at; at = at.parent) {
    const siblings = at.parent ? at.parent.children : roots;
    for (let index = siblings.indexOf(at); index >= 0; index--) {
      const candidate = siblings[index];
      if (!listedHeading(candidate)) continue;
      const section = sectionOf(candidate, roots);
      if (section.includes(at)) return { heading: candidate, nodes: section };
    }
  }
  return null;
}

/** The owner of the box a node stands in, when one owns it (a tab its panel): the node of it among `all`, or null. */
export function ownerOf(node, all) {
  const box = node.el.parentElement?.closest?.("[data-ge-box]");
  const owner = box ? boxOwner(box) : null;
  return owner ? all.find((each) => each.el === owner) ?? null : null;
}

export { UNIT_COMPONENT };
