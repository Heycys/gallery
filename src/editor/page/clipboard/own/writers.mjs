import { escapeMarkup, escapeText } from "../../../../shared/escape.mjs";
import { iconMarkup } from "../../../../shared/emoji/icon-value.mjs";
import { BLOCK_LEVEL } from "../../../../shared/html-tree.mjs";
import { TEXT_TYPES, clipboardOf, unitClipboard } from "../../../components/registry.mjs";

// The writers by `clipboard.kind`: how each kind of block is written out, one table for the two that
// write. A block that says no kind is a paragraph.
//
//   copied(block, how, clip)    Markdown of a block described for the clipboard (export.mjs), as lines
//   exported(unit, how, clip)   Markdown of an element of a report, for a page export and 复制页面内容
//                               (src/transfer/markdown.mjs), as lines
//   html(block, how, clip)      the clipboard's text/html of a described block; `clip.html`, where it
//                               says one, names the writer of this instead of its kind
//   list                        its blocks stand one line apart beside another list
//   opens                       an element of it is an aside's first line
//   silent(block)               a described block of it says nothing, and takes no empty line
//
// The two Markdowns are not one: a description has its text as the clipboard keeps it, an element
// holds pictures, files of the report's folder and charts, and each has its own ways (a page export
// starts a list from its number and leaves empty paragraphs out; a copy numbers a list from 1 and
// writes an empty paragraph as an empty line). What they share is a helper here; where the bytes
// differ a kind has its two sides. `clip` is what the block's definition says: a writer reads no
// element's markup, and what it needs of one it asks of `clip.read`; its kinds are this table's own
// words.
//
// `how` is what each caller gives its writers: { inline(html), block(block), lines(blocks),
// portable(html), html(block) } in export.mjs, and { inline(html), own(host), lines(units),
// held(units), heldIn(box), plain(node), words(node), media(src, kind, name), opening(units, title),
// packageOf(id), … } in src/transfer/markdown.mjs. No module here wants a document as it loads: a worker imports this
// before it has one.

const INDENT = "    ";
const indented = (lines) => lines.map((line) => (line ? `${INDENT}${line}` : line));

// What in a whole block sets its words apart (wordsIn): a block, always; and what lays out a word or
// two, wherever nothing stands straight in the element around it. Next to words of that element's own
// it is one of them: a unit, a number in a color. What shows none of its text is left out.
const BLOCKS = [...BLOCK_LEVEL].join(", ");
const PIECES = "button, label, span";
const SHOWS_NONE = "script, style, template, noscript, svg, title, desc, canvas, select, textarea, object";

/**
 * The words of `block` (a whole block, a card's drawing), all that it shows, as runs that BLOCKS and
 * PIECES end, in the file's order; `more` other elements of text (an SVG's text), but `without`.
 */
export function wordsIn(block, more = "", without = null) {
  const blocks = [BLOCKS, more].filter(Boolean).join(", ");
  const said = [];
  const read = (node) => {
    const ownWords = [...node.childNodes].some((child) => child.nodeType === 3 && child.data.trim());
    const breaks = ownWords ? blocks : `${blocks}, ${PIECES}`;
    let run = "";
    const end = () => {
      const words = run.replace(/\s+/g, " ").trim();
      if (words) said.push(words);
      run = "";
    };
    for (const child of node.childNodes) {
      if (child.nodeType === 3) run += child.data;
      else if (child.nodeType !== 1 || child === without) continue;
      else if (child.matches(breaks) || child.querySelector(breaks)) {
        end();
        read(child);
      } else if (!child.matches(SHOWS_NONE)) run += child.textContent;
    }
    end();
  };
  read(block);
  return said;
}

/**
 * Text as Markdown with a line that starts as a tag of HTML or a code fence held to being words, its
 * first character escaped, which every reader takes for that character: read as it stands such a
 * line opens a block that takes in what follows. Other words are left as they are.
 */
export const heldToWords = (text) => text.replace(/^([ \t]*)(<(?=[!/a-z])|(?=```))/gim, "$1\\$2");

// Blocks of lines, an empty line between them.
function apart(parts) {
  const out = [];
  for (const part of parts) out.push(...(out.length ? [""] : []), ...part);
  return out;
}

// What opens with its block and is no block of its text: a described one's, an element's.
const leads = (block) => clipboardOf(block.type).lead;
const unitLeads = (unit) => unitClipboard(unit).lead;
// A described highlight block's or `headed` entry's first line and the blocks under it: its emoji (an
// icon of a set or a picture none) and its first text block's words, then the rest of its blocks.
function opening(blocks, how) {
  const icon = blocks.find(leads)?.icon;
  const [first, ...rest] = blocks.filter((block) => !leads(block));
  const title = first && TEXT_TYPES.has(first.type);
  const head = [/^\p{Extended_Pictographic}/u.test(icon ?? "") ? icon : "", title ? how.inline(first.html) : ""].filter(Boolean).join(" ");
  return { head, after: title ? rest : [first, ...rest].filter(Boolean) };
}

// The emoji an icon element shows.
const emojiOf = (icon, how) => (icon && /\p{Extended_Pictographic}/u.test(how.plain(icon)) ? how.plain(icon) : "");

/**
 * An element's first line and the units under it: the emoji that leads `units` and the words of
 * `title(first)`, the element it says of the first after the icon (null: no words), then the rest.
 */
export function unitOpening(units, title, how) {
  const icon = units.find(unitLeads);
  const rest = units.filter((child) => child !== icon);
  const words = title(rest[0]);
  return { head: [emojiOf(icon, how), words ? how.own(words) : ""].filter(Boolean).join(" "), rest: rest.filter((child) => child !== words) };
}

// A described list's entry: an item, what it holds 4 spaces in; a `headed` one, its emoji and title
// on the item's line, the rest of its blocks under it.
function entry(item, marker, how) {
  if (clipboardOf(item.type).headed) {
    const { head, after } = opening(item.blocks, how);
    return [...`${marker}${head}`.split("\n"), ...indented(how.lines(after))];
  }
  return [...`${marker}${how.inline(item.html)}`.split("\n"), ...(item.lists ?? []).flatMap((each) => how.block(each)).map((line) => `${INDENT}${line}`)];
}

// The words on the line of an entry (a list item, a disclosure) over the lines it holds (`held`): its
// own, or, where it has none over them, a non-breaking space, so that a viewer gives it a line of its
// own above them, its marker on it, as the page shows it (with nothing there a list item's first block
// would stand on its line, and after an empty line it would be none of the item's). The import reads
// that space as no words (import/markdown.mjs).
const lineOf = (words, held) => words || (held.length > 0 ? "&nbsp;" : "");

// A list by its tag and the marker of an entry (`number` its number, `gap` what follows a to-do's box).
const list = (tag, marker) => ({
  list: true,
  copied: (block, how) => block.blocks.flatMap((item, index) => entry(item, marker(index + 1, item.checked, " "), how)),
  exported(unit, how, clip) {
    const { start, items } = clip.read(unit, how);
    return items.flatMap(({ checked, written }, index) => {
      const { text, held } = written();
      const [first, ...rest] = text.split("\n");
      const under = how.held(held);
      return [`${marker(start + index, checked, "  ")}${text ? first : lineOf(text, under)}`, ...rest.map((line) => `${INDENT}${line}`), ...under];
    });
  },
  html: (block, how) => `<${tag}>${block.blocks.map(how.html).join("")}</${tag}>`,
});

// Code fenced: its title (a file's name) in bold before it where it has one. The fence is
// longer than any at the start of one of its lines, which would close it.
function fence({ title, language, lines }) {
  const mark = "`".repeat(Math.max(2, ...lines.map((line) => /^\s*(`*)/.exec(line)[1].length)) + 1);
  return [...(title ? [`**${title}**`, ""] : []), `${mark}${language}`, ...lines, mark];
}

const math = (tex) => ["$$", ...tex.split("\n"), "$$"];

// A table's grid (`clip.grid`) as a Markdown table, its cells on one line; `cell`, a cell's Markdown.
const piped = (data, columns, cell, clip) => clip.grid(data, columns, (html) => cell(html).trim().replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|")).flatMap((row, index) => {
  const line = `| ${row.join(" | ")} |`;
  return index === 0 ? [line, `| ${row.map(() => "---").join(" | ")} |`] : [line];
});

// A line and the caption (`node`, an element) below it as a paragraph.
function captioned(line, node, how) {
  const said = node ? how.inline(how.serializeInner(node)) : "";
  return said ? [line, "", said] : [line];
}

// A card that is a link: its label and address, a file of the report's folder through `how.media`.
function linked(unit, how, clip) {
  const link = clip.read(unit, how);
  return link ? captioned(`[${link.label}](${link.file ? how.media(link.src, "file", link.name) : link.src})`, link.caption, how) : [];
}

// A media block's description (its data) for other programs: `line(said, how)` what its definition says
// of it (`clip.said`), then its caption a paragraph of its own; nothing where it says nothing (one left empty).
function saidLines(line) {
  return (block, how, clip) => {
    const said = clip.said?.(block, how);
    if (!said) return [];
    const caption = block.caption ? how.inline(block.caption) : "";
    return [line(said, how), ...(caption.trim() ? ["", ...caption.split("\n")] : [])];
  };
}
function saidHtml(markup) {
  return (block, how, clip) => {
    const said = clip.said?.(block, how);
    return said ? `<p>${markup(said, how)}</p>${block.caption ? `<p>${how.portable(block.caption)}</p>` : ""}` : "";
  };
}
const saidLink = saidLines((said, how) => `[${how.inline(escapeText(said.label))}](${said.src})`);
const saidAnchor = saidHtml((said) => `<a href="${escapeMarkup(said.src)}">${escapeText(said.label)}</a>`);

const paragraph = {
  opens: true,
  copied: (block, how) => how.inline(block.html ?? "").split("\n"),
  exported(unit, how) {
    const said = how.own(unit);
    return said ? said.split("\n") : [];
  },
  html: (block, how) => `<p>${how.portable(block.html ?? "")}</p>`,
};

const todo = list("ul", (_, checked, gap) => `- [${checked ? "x" : " "}]${gap}`);

export const WRITERS = {
  paragraph,
  heading: {
    opens: true,
    copied: (block, how, { level }) => `${"#".repeat(level)} ${how.inline(block.html ?? "")}`.split("\n"),
    exported(unit, how, { level }) {
      const said = how.own(unit);
      return said ? `${"#".repeat(level)} ${said}`.split("\n") : [];
    },
    html: (block, how, { level }) => `<h${level}>${how.portable(block.html ?? "")}</h${level}>`,
  },
  bullet: list("ul", () => "- "),
  number: list("ol", (at) => `${at}. `),
  todo: { ...todo, html: (block, how) => `<ul>${block.blocks.map((item) => how.html({ ...item, html: `${item.checked ? "[x]" : "[ ]"} ${item.html}` })).join("")}</ul>` },
  quote: {
    copied: (block, how) => block.blocks.flatMap((inner, index) => [...(index > 0 ? [""] : []), ...how.inline(inner.html).split("\n")]).map((line) => `> ${line}`),
    exported(unit, how) {
      const parts = how.unitsOf(unit).map((child) => (how.isHost(child) ? how.own(child) : how.lines([child]).join("\n"))).filter(Boolean);
      return parts.flatMap((part, index) => [...(index > 0 ? [""] : []), ...part.split("\n")]).map((line) => (line ? `> ${line}` : ">"));
    },
    html: (block, how) => `<blockquote>${block.blocks.map(how.html).join("")}</blockquote>`,
  },
  aside: {
    copied(block, how) {
      const { head, after } = opening(block.blocks, how);
      return ["<aside>", ...head.split("\n"), "", ...(after.length ? [...how.lines(after), ""] : []), "</aside>"];
    },
    exported(unit, how) {
      const { head, rest } = unitOpening(how.unitsOf(unit), (first) => (first && WRITERS[unitClipboard(first).kind].opens ? first : null), how);
      const after = how.lines(rest);
      return ["<aside>", ...(head ? head.split("\n") : []), "", ...(after.length ? [...after, ""] : []), "</aside>"];
    },
    html: (block, how) => `<div>${block.blocks.map(how.html).join("")}</div>`,
  },
  // A disclosure: "- " and its title, its blocks 4 spaces in (written as an item: Markdown has no
  // disclosure), but no list: an empty line stands between it and a list beside it.
  toggle: {
    copied: (block, how) => [`- ${how.inline(block.html)}`, ...indented(how.lines(block.blocks))],
    exported(unit, how, clip) {
      const { title, content, without } = clip.read(unit);
      const words = title ? how.inline(how.serializeInner(title)) : "";
      const under = content ? how.heldIn(content, without) : [];
      return [`- ${lineOf(words, under)}`, ...under];
    },
    html: (block, how) => `<details open><summary>${how.portable(block.html)}</summary>${block.blocks.map(how.html).join("")}</details>`,
  },
  code: {
    copied: (block) => fence({ language: block.language ?? "", lines: block.text.split("\n") }),
    exported: (unit, how, clip) => fence(clip.read(unit, how)),
    html: (block) => `<pre><code${block.language ? ` class="language-${escapeMarkup(block.language)}"` : ""}>${escapeText(block.text)}</code></pre>`,
  },
  // An empty one says nothing: no $$ $$ to read back as nothing.
  equation: {
    silent: (block) => !block.tex.trim(),
    copied: (block) => math(block.tex),
    exported(unit, how, clip) {
      const { tex } = clip.read(unit, how);
      return tex ? math(tex) : [];
    },
    html: (block) => (block.tex.trim() ? `<p>$$${escapeText(block.tex)}$$</p>` : ""),
  },
  hr: {
    copied: () => ["---"],
    exported: () => ["---"],
    html: () => "<hr>",
  },
  table: {
    copied: (block, how, clip) => piped(block, block.rows[0].length, how.inline, clip),
    // What a block writes after its table (`after`: a database's records' bodies), a part of its own.
    exported(unit, how, clip) {
      const data = clip.read(unit, how);
      return apart([data.rows.length === 0 ? [] : piped(data, Math.max(...data.rows.map((row) => row.length)), how.inline, clip), ...(clip.after?.(unit, how) ?? [])].filter((part) => part.length > 0));
    },
    // A merged cell keeps its spans (colspan, rowspan): its row has fewer cells.
    html(block, how) {
      const spans = (r, i) => {
        const [down, across] = block.spans?.[r]?.[i] ?? [1, 1];
        return `${across > 1 ? ` colspan="${across}"` : ""}${down > 1 ? ` rowspan="${down}"` : ""}`;
      };
      const row = (cells, tag, r) => `<tr>${cells.map((cell, i) => `<${tag}${spans(r, i)}>${how.portable(cell)}</${tag}>`).join("")}</tr>`;
      const [first, ...rest] = block.rows;
      return `<table>${block.header ? `<thead>${row(first, "th", 0)}</thead>` : ""}<tbody>${(block.header ? rest : block.rows).map((cells, index) => row(cells, "td", index + (block.header ? 1 : 0))).join("")}</tbody></table>`;
    },
  },
  // Only the blocks it holds.
  // (A row of columns described, its data: the blocks of its columns, `clip.holds`, one after another.)
  flatten: {
    copied: (block, how, clip) => how.lines(block.blocks ?? clip.holds?.(block) ?? []),
    exported: (unit, how, clip) => how.lines(clip.blocks?.(unit, how) ?? how.unitsOf(unit)),
    html: (block, how, clip) => (block.blocks ?? clip.holds?.(block) ?? []).map(how.html).join(""),
  },
  // Each tab's name, a line before its panel's blocks.
  tabs: {
    copied: (block, how) => block.tabs.flatMap((tab, index) => [...(index > 0 ? [""] : []), tab.title, ...(tab.blocks.length ? ["", ...how.lines(tab.blocks)] : [])]),
    exported(unit, how, clip) {
      return clip.read(unit, how).flatMap(({ name, units }, index) => {
        const inner = how.lines(units);
        return [...(index > 0 ? [""] : []), ...(name ? [name] : []), ...(inner.length ? [...(name ? [""] : []), ...inner] : [])];
      });
    },
    html: (block, how) => block.tabs.map((tab) => `<h3>${escapeText(tab.title)}</h3>${tab.blocks.map(how.html).join("")}`).join(""),
  },
  // A media block copied is a copy of itself carrying its data (what a new one is written with), which these
  // write for other programs: an image as a picture, a file, an embed and a bookmark as a link, each by what its definition says of it (`clip.said`: its address, a
  // file of the folder where this page serves it, and its words), its caption a paragraph after it.
  image: {
    exported(unit, how, clip) {
      const image = clip.read(unit, how);
      return image ? captioned(`![${image.label}](${how.media(image.src, "image", image.name)})`, image.caption, how) : [];
    },
    copied: saidLines((said, how) => `![${how.inline(escapeText(said.label))}](${said.src})`),
    html: saidHtml((said) => `<img src="${escapeMarkup(said.src)}" alt="${escapeMarkup(said.label)}">`),
  },
  media: { exported: linked, copied: saidLink, html: saidAnchor },
  bookmark: { exported: linked, copied: saidLink, html: saidAnchor },
  // The parts `clip.read` gives of an element, an empty line between them; a description's blocks in turn.
  // An instance of a package, by its parts: in its HTML a part of words is of the type it says it is
  // written as there (`as`: its heading), in Markdown a paragraph.
  parts: {
    copied: (block, how) => how.lines(block.blocks),
    exported: (unit, how, clip) => apart(clip.read(unit, how)),
    html: (block, how) => block.blocks.map((inner) => how.html(typeof inner.as === "string" && TEXT_TYPES.has(inner.as) ? { ...inner, type: inner.as } : inner)).join(""),
  },
  // A report's own widget, and a part of a block a file left standing alone: its blocks of text on
  // one line, then its pictures.
  words: {
    exported(unit, how, clip) {
      const said = how.wordsIn(unit, "", clip?.without);
      return apart([...(said.length ? [said.join(" · ")] : []), ...how.picturesIn(unit)].map((line) => [line]));
    },
  },
  // What leads a block is written with that block's first line, or not at all.
  icon: { ...paragraph, opens: false, silent: () => true, exported: () => [], html: (block) => iconMarkup(block.icon) },
  // The text/html of blocks that are written in a list's run.
  item: { html: (block, how) => `<li>${how.portable(block.html)}${(block.lists ?? []).map(how.html).join("")}</li>` },
  node: { html: (block, how) => `<li>${block.blocks.filter((each) => !leads(each)).map(how.html).join("")}</li>` }, // a 流程图's node, its blocks in an ordered list's item
  section: { html: (block, how) => `<section>${block.blocks.map(how.html).join("")}</section>` },
};
