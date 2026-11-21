import { escapeMarkup, escapeText } from "../../../../shared/escape.mjs";
import { knownLanguage, languageId } from "../../../../shared/code-languages.mjs";
import { iconKind, validIcon } from "../../../../shared/emoji/icon-value.mjs";
import { BLOCK_TYPES, COLOR_DEFAULTS, TOGGLES, accepts, clipboardOf } from "../../../components/registry.mjs";
import { validDirection, validStart } from "../../../components/list/index.mjs";
import { MAX_COLUMNS, MIN_COLUMNS } from "../../../components/columns/index.mjs";
import { MAX_TABLE_CELLS, validLook, validTable } from "../../../components/table/index.mjs";
import { imageSource, kindOfBlock, webPage } from "../own/rules.mjs";
import { NOTION_COLOR_NAMES } from "./colors.mjs";
import { plainOf } from "./rich.mjs";
import { t } from "../../../../shared/i18n/index.mjs";

// Block specs (rich.mjs) as the page's blocks, described as the clipboard's own (own/blocks.mjs
// build() makes them): what each spec is here. They are made to fit, not checked as the
// clipboard's own data is (checkBlocks refuses a whole paste for one block it dislikes and counts
// blocks; this never refuses one): a block a box does not take (a tabs area in
// a disclosure, a row of columns in a column) is made its content, an address a picture or page may
// not have is written as an address is, one that is none (or an icon the page has none of) is left
// out, what has a size (a table's cells, tabs, columns) is cut to what the page writes, and of a block of
// a type with no definition what it holds stays, as of one a box does not take, at any depth.
//   text → paragraph, header … header_4 → heading1 … heading4 (their color, the spec's block_color,
//   where the block takes one); bulleted_list / numbered_list / to_do → items of a list of their kind,
//   neighbours of a kind one list (a numbered one from its first item's `number`, a whole document's,
//   when it is not 1); an item's lists its own, its paragraphs lines of its text (<br>),
//   any other block after the list (which ends there: the next items are a list of their own);
//   quote → quote of paragraphs (its text, its paragraphs; a quote in it its paragraphs too), its
//   other blocks after it; callout → highlight with its emoji (💡 without); toggle → disclosure;
//   code → code (its language where the kit knows it, else 自动识别, or the name a whole document's
//   fence gives it, `fence`; its `title`); equation → formula block;
//   table → table (its header row and column; yuque.mjs's merged cells, a row's
//   `spans` naming the cells it has, else each cell in a column of its own, and the cells' looks: their
//   alignment); image → image (an address of the web or data:);
//   embed → embed (an address of the web); file → a link; column_list → columns (two or more, else
//   their blocks); tab → tabs area; divider → divider; the kit's own flowchart (report_flow,
//   html.mjs) → a flowchart of nodes (stepOf), where a box takes none its nodes' blocks;
//   report_callout (Yuque's 提示, yuque.mjs and markdown.mjs) → the page's callout (提示块) of its
//   blocks, its color a background; box (an AI answer's card, cards.mjs) → a highlight block of its
//   blocks with no icon.
// Two of a whole Markdown document's, which the import makes (src/transfer/import.mjs; never a
// paste): section → a section of its blocks; html (an HTML block kept as written) → a paragraph of
// its `marker` alone, which the import writes the HTML in place of (fillReport).
// Rich text is inline HTML of the format bar's marks: <strong> <em> <u> <s> <code> <sup> <sub> <a href>, colors
// as the kit's doc-text-* / doc-highlight-* spans (teal, which Notion's HTML may name, is its green), formulas as
// <span class="doc-math-inline">\(TeX\)</span> (own/blocks.mjs makes them formulas), line breaks
// <br>.

const COLOR = new RegExp(`^(${NOTION_COLOR_NAMES.join("|")})(_background)?$`);
const colorClass = (value) => {
  const match = COLOR.exec(value ?? "");
  if (!match) return null;
  const name = match[1] === "teal" ? "green" : match[1];
  return match[2] ? `doc-highlight-${name}` : `doc-text-${name}`;
};
const SAFE_LINK = /^(https?:|mailto:|tel:|#)/i;

/**
 * Rich text as inline HTML of the format bar's marks. `pictures` (a table's cell, which holds them:
 * 单元格里的图片): a picture piece (inline.mjs's, html.mjs's in a cell) an <img> of its address, alt and
 * width as written, which the paste makes a picture of the document's folder (page/table/pictures.mjs);
 * else, a picture a reader left in text, its alt.
 */
export function richHtml(title, { pictures = false } = {}) {
  return (title ?? []).map(([text, annotations = []]) => {
    const has = (name) => annotations.some((a) => a[0] === name);
    const formula = annotations.find((a) => a[0] === "e");
    const picture = annotations.find((a) => a[0] === "img");
    const img = picture && pictures ? `<img src="${escapeMarkup(picture[1])}" alt="${escapeMarkup(picture[2] ?? "")}"${/^\d+$/.test(picture[4] ?? "") ? ` width="${picture[4]}"` : ""}>` : "";
    let html = formula ? `<span class="doc-math-inline">\\(${escapeText(formula[1])}\\)</span>` : img ? img.repeat([...text].length || 1) : escapeText(picture ? picture[2] ?? "" : text).replace(/\n/g, "<br>");
    if (!formula && has("c")) html = `<code>${html}</code>`;
    if (has("sup")) html = `<sup>${html}</sup>`;
    if (has("sub")) html = `<sub>${html}</sub>`;
    for (const [, value] of annotations.filter((a) => a[0] === "h")) {
      const name = colorClass(value);
      if (name) html = `<span class="${name}">${html}</span>`;
    }
    if (has("s")) html = `<s>${html}</s>`;
    if (has("_")) html = `<u>${html}</u>`;
    if (has("i")) html = `<em>${html}</em>`;
    if (has("b")) html = `<strong>${html}</strong>`;
    const link = annotations.find((a) => a[0] === "a");
    if (link && SAFE_LINK.test(link[1])) html = `<a href="${escapeMarkup(link[1])}">${html}</a>`;
    return html;
  }).join("");
}

// A language's display name (languages.mjs) as the kit names it (src/shared/code-languages.mjs: "Shell" is bash,
// "TypeScript" typescript); one the kit does not know: none, 自动识别 (the kit's guess).
const kitLanguage = (name) => (knownLanguage(name) ? languageId(name) : undefined);

// What a block holds at most (own/blocks.mjs checks the same for the clipboard's own data).
const MAX_TEX = 20000;
const MAX_CAPTION = 2000;
const MAX_TABS = 20;
const PANEL = "panel"; // the box a tab's blocks are in (a chapter)
const shareOf = (ratio) => typeof ratio === "number" && ratio > 0 && ratio <= 1;

const HEADINGS = { header: "heading1", sub_header: "heading2", sub_sub_header: "heading3", header_4: "heading4" };
const LISTS = { bulleted_list: "bullets", numbered_list: "numbers", to_do: "todo" };
const WEB = /^https?:\/\//i;
const HTTPS = /^https:\/\//i; // an embed frames https pages only

// An address as the page takes it (own/rules.mjs): a web address with its spaces and other
// characters written as an address writes them, a data: picture as it is.
const writtenAddress = (src) => {
  if (!WEB.test(src)) return src;
  try {
    return new URL(src).href;
  } catch {
    return src;
  }
};

const leaf = (type, s) => {
  const color = colorClass(s.props?.block_color);
  return { type, html: richHtml(s.title), ...(color ? { color } : {}) };
};

// The blocks a block holds, but what leads them (a highlight block's icon, a node's), no block of their text.
const heldBy = (block) => (block.blocks ?? []).filter((held) => !clipboardOf(held.type).lead);

// What a box takes (accepts(): body text and components go in any flow, a column takes no row of
// columns, a flow no tabs area): a block it does not is made its content, a row of columns its
// columns' blocks, a tabs area each tab's name and blocks, any other its text and its blocks.
function fit(blocks, box) {
  return blocks.flatMap((block) => (accepts(box, kindOfBlock(block)) ? [block] : fit(lowered(block), box)));
}
function lowered(block) {
  if (block.type === "columns") return block.columns.flatMap((column) => column.blocks);
  if (block.type === "flowchart") return block.blocks.flatMap(heldBy);
  if (block.type === "sheets") return block.tabs.flatMap((tab) => [{ type: "paragraph", html: escapeText(tab.title) }, ...tab.blocks]);
  return [...(block.html ? [{ type: "paragraph", html: block.html }] : []), ...heldBy(block)];
}

// A block as the page can make it: itself, or what it holds when its type has no definition.
const madeOf = (block) => (!block?.type || BLOCK_TYPES[block.type] ? [block] : lowered(block).flatMap(madeOf));

// What a block holds, whichever field holds it, each block as the page can make it.
const defined = (value) => (Array.isArray(value) ? value.flatMap(madeOf).map(defined)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, each]) => [key, defined(each)])) : value);

/**
 * Block specs as the clipboard's described blocks, made to be blocks the page takes: whatever the
 * content, none is refused for another's sake and none dropped for how many there are (the
 * clipboard's own data is checked, not this: own/blocks.mjs checkBlocks). `box`: the kind of box they
 * go in (null: none, as the top of a paste). `options.held`: a list item holds its blocks after its text, all
 * of them, as a whole Markdown document has them (a paste's and the import's; else they go after its list: itemOf).
 */
export function toBlocks(specs, box = null, options = {}) {
  const blocks = defined(specsToBlocks(specs, options));
  return box ? fit(blocks, box) : blocks;
}

function specsToBlocks(specs, options) {
  const out = [];
  let list = null; // the list the next item of its kind joins
  const close = () => { list = null; };
  for (const s of specs) {
    const kind = LISTS[s.type];
    if (kind) {
      const { item, after } = itemOf(s, options);
      if (!list || list.type !== kind) {
        // A numbered list's first number when it is not 1 (a whole document's: `number`).
        const start = kind === "numbers" && Number.isInteger(s.props?.number) && s.props.number > 1 ? { start: String(s.props.number) } : {};
        list = { type: kind, blocks: [], ...start };
        out.push(list);
      }
      list.blocks.push(item);
      if (after.length) {
        out.push(...after);
        close();
      }
      continue;
    }
    close();
    out.push(...blockOf(s, options));
  }
  return out;
}

// A list item and the blocks of its that go after its list. Held (options.held), every block of its
// stays in it, after its text, and none goes after its list (which goes on).
function itemOf(s, options) {
  const checked = s.type === "to_do" && s.props?.checked ? { checked: true } : {};
  if (options.held) return { item: { type: "item", html: richHtml(s.title), ...checked, lists: toBlocks(s.children ?? [], "nest", options) }, after: [] };
  const lines = [richHtml(s.title)];
  const lists = [];
  const after = [];
  let i = 0;
  const children = s.children ?? [];
  // Its paragraphs before any other block are lines of its text; its items its lists.
  for (; i < children.length && children[i].type === "text" && !children[i].children?.length; i++) lines.push(richHtml(children[i].title));
  const rest = toBlocks(children.slice(i), null, options);
  for (const block of rest) {
    if (["bullets", "numbers", "todo"].includes(block.type) && after.length === 0) lists.push(block);
    else after.push(block);
  }
  const html = lines.filter((line, index) => index === 0 || line).join("<br>");
  return { item: { type: "item", html, ...checked, lists }, after };
}

// A step of the kit's flowchart (html.mjs flowchartBlock) as a node: its icon (an emoji), its own
// words its title, bold as a node's title is (<p><strong>…</strong></p>; as they are when bold
// already), its blocks its content (an empty title made first where the first is no paragraph:
// own/blocks.mjs), its color and direction.
function stepOf(s, options) {
  const icon = s.props?.icon && !/^(\/|[a-z]+:)/i.test(s.props.icon) && validIcon(s.props.icon) ? [{ type: "icon", icon: s.props.icon }] : [];
  const words = richHtml(s.title);
  const bold = s.title?.length > 0 && s.title.every(([, annotations = []]) => annotations.some((a) => a[0] === "b"));
  const title = words ? [{ type: "paragraph", html: bold ? words : `<strong>${words}</strong>` }] : [];
  const colors = (s.props?.colors ?? []).filter((name) => TOGGLES.step?.includes(name));
  const direction = validDirection(s.props?.direction) ? { direction: s.props.direction } : {};
  return { type: "step", blocks: [...icon, ...title, ...toBlocks(s.children ?? [], BLOCK_TYPES.step?.box, options)], ...(colors.length ? { color: colors.join(" ") } : {}), ...direction };
}

function blockOf(s, options) {
  const children = (box = null) => toBlocks(s.children ?? [], box, options);
  switch (s.type) {
    case "text": return [leaf("paragraph", s), ...children()];
    case "header": case "sub_header": case "sub_sub_header": case "header_4": return [leaf(HEADINGS[s.type], s), ...children()];
    case "divider": return [{ type: "divider" }];
    case "code": {
      // A whole document's fence keeps the name it gives a language the kit does not know (`fence`, ```mermaid).
      const language = kitLanguage(s.props?.language) ?? s.props?.fence;
      const title = typeof s.props?.title === "string" ? s.props.title.replace(/\s+/g, " ").trim().slice(0, 200) : "";
      return [{ type: "code", text: plainOf(s.title), ...(language ? { language } : {}), ...(title ? { title } : {}) }];
    }
    case "equation": {
      const tex = plainOf(s.title).trim();
      // A TeX the block cannot hold (it closes its own \] , or is too long) stays visible as text.
      if (tex && (tex.includes("\\]") || tex.length > MAX_TEX)) return [{ type: "paragraph", html: escapeText(tex) }];
      return tex ? [{ type: "math", tex }] : [];
    }
    case "quote": {
      const paragraphs = [];
      const after = [];
      const take = (blocks) => {
        for (const block of blocks) {
          if (block.type === "paragraph" && after.length === 0) paragraphs.push({ type: "paragraph", html: block.html });
          else if (block.type === "quote" && after.length === 0) take(block.blocks);
          else after.push(block);
        }
      };
      take([{ type: "paragraph", html: richHtml(s.title) }, ...children()]);
      return [{ type: "quote", blocks: paragraphs }, ...after];
    }
    case "callout": case "box": {
      // None inside another (its type's `nests`): what an inner one holds stands in it, but what leads it.
      // A box (an AI answer's card, cards.mjs) is one with no icon, as a card has none.
      const made = BLOCK_TYPES.highlight;
      const blocks = children(made?.box).flatMap((block) => (made?.nests === false && BLOCK_TYPES[block.type] === made ? heldBy(block) : [block]));
      const icon = s.props?.icon && !/^(\/|[a-z]+:)/i.test(s.props.icon) && validIcon(s.props.icon) ? s.props.icon : "💡";
      return [{ type: "highlight", blocks: [...(s.type === "box" ? [] : [{ type: "icon", icon }]), ...(blocks.length ? blocks : [{ type: "paragraph", html: "" }])] }];
    }
    case "report_callout": {
      // Yuque's 提示 (yuque.mjs): the page's callout of its blocks, none inside another (as a
      // highlight block's), its color a background (one of the nine, as a color mark names it; the
      // callout's own default, its blue, no class).
      const made = BLOCK_TYPES.callout;
      const blocks = children(made?.box).flatMap((block) => (made?.nests === false && BLOCK_TYPES[block.type] === made ? heldBy(block) : [block]));
      const name = typeof s.props?.color === "string" && s.props.color !== COLOR_DEFAULTS[made?.kind]?.background ? colorClass(`${s.props.color}_background`) : null;
      return [{ type: "callout", blocks: blocks.length ? blocks : [{ type: "paragraph", html: "" }], ...(name ? { color: name } : {}) }];
    }
    case "toggle": return [{ type: "details", html: richHtml(s.title), blocks: children(BLOCK_TYPES.details?.box) }];
    case "section": {
      const blocks = children(BLOCK_TYPES.section?.box);
      return blocks.length ? [{ type: "section", blocks }] : [];
    }
    case "html": return typeof s.props?.marker === "string" ? [{ type: "paragraph", html: escapeText(s.props.marker) }] : [];
    case "report_flow": {
      const steps = (s.children ?? []).filter((step) => step.type === "report_step").map((step) => stepOf(step, options));
      const direction = validDirection(s.props?.direction) ? { direction: s.props.direction } : {};
      const start = validStart(s.props?.start) ? { start: s.props.start } : {};
      return steps.length ? [{ type: "flowchart", blocks: steps, ...direction, ...start }] : [];
    }
    case "table": {
      const order = (s.props?.table_block_column_order ?? []).slice(0, MAX_TABLE_CELLS);
      // As many rows as the table may have cells for (the server writes no more).
      const specs = (s.children ?? []).slice(0, Math.floor(MAX_TABLE_CELLS / Math.max(1, order.length)));
      if (!specs.length || !order.length) return [];
      const flags = { outside: true, ...(s.props.table_block_column_header ? { header: true } : {}), ...(s.props.table_block_row_header ? { column: true } : {}) };
      // From yuque.mjs: merged cells, a row's `spans` naming the cells it has, and the cells' looks.
      const merged = specs.some((row) => row.props?.spans);
      const columnsOf = (row) => (merged ? order.filter((column) => Array.isArray(row.props?.spans?.[column])) : order);
      const rows = specs.map((row) => columnsOf(row).map((column) => richHtml(row.props?.cells?.[column] ?? [], { pictures: true })));
      const lookOf = (row, column) => {
        const look = row.props?.looks?.[column];
        return typeof look === "string" && validLook(look) ? look : "";
      };
      const looks = specs.map((row) => columnsOf(row).map((column) => lookOf(row, column)));
      const looked = looks.some((row) => row.some(Boolean)) ? { looks } : {};
      const table = { type: "table", rows, ...(merged ? { spans: specs.map((row) => columnsOf(row).map((column) => row.props.spans[column])) } : {}), ...looked, ...flags };
      if (!merged || validTable(table, () => true)) return [table];
      // Spans that tile no table (cut short, or said wrong): each cell in its own column, those a span covered empty.
      return [{ type: "table", rows: specs.map((row) => order.map((column) => richHtml(row.props?.cells?.[column] ?? [], { pictures: true }))), ...flags }];
    }
    case "image": {
      const src = writtenAddress(s.props?.source ?? "");
      if (!imageSource(src)) return [];
      return [{ type: "image", src, ...(s.props.caption?.length ? { caption: plainOf(s.props.caption).slice(0, MAX_CAPTION) } : {}) }];
    }
    case "embed": {
      const src = writtenAddress(s.props?.source ?? "");
      return HTTPS.test(src) && webPage(src) ? [{ type: "embed", src }] : [];
    }
    case "file": {
      const src = s.props?.source ?? "";
      return WEB.test(src) ? [{ type: "paragraph", html: `<a href="${escapeMarkup(src)}">${escapeText(plainOf(s.title) || src)}</a>` }] : [];
    }
    case "column_list": {
      const columns = (s.children ?? []).map((column) => ({ ...(shareOf(column.props?.ratio) ? { ratio: column.props.ratio } : {}), blocks: toBlocks(column.children ?? [], BLOCK_TYPES.column.box, options) })).filter((column) => column.blocks.length);
      if (columns.length >= MIN_COLUMNS) return [{ type: "columns", columns: columns.slice(0, MAX_COLUMNS) }];
      return columns.flatMap((column) => column.blocks);
    }
    case "tab": {
      const tabs = (s.children ?? []).slice(0, MAX_TABS).map((tab, index) => ({
        title: plainOf(tab.title).replace(/[<>\r\n]/g, " ").trim().slice(0, 200) || t("选项卡 {0}", index + 1),
        ...(iconKind(tab.props?.icon) === "emoji" ? { icon: tab.props.icon } : {}),
        blocks: toBlocks(tab.children ?? [], PANEL, options),
      }));
      return tabs.length ? [{ type: "sheets", tabs }] : [];
    }
    default: return s.title?.length ? [{ type: "paragraph", html: richHtml(s.title) }, ...children()] : children();
  }
}
