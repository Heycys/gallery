// Inline Markdown as rich text: the marks, links and formulas of a line of pasted text. Rich text is
// [[text, [[annotation, value?], …]], …], the annotations b (bold), i (italic),
// _ (underline), s (strike), c (code), a (link, its address), h (color), e (inline formula: its
// text is "⁍", the formula the annotation's value).
//
//   **bold** / __bold__, *italic* / _italic_, ***both***, ~~strike~~, `code`, [text](link), <link>,
//   a bare address (http(s):// or www.) as a link (its backslash escapes read), and backslash
//   escapes (\* \_ \\ … are the characters themselves). * and _ follow CommonMark's flanking: no
//   space after the opening one or before the closing one ("a * b * c" is no emphasis), and _ not
//   inside a word (snake_case_name).
//   Inline formulas, as AI answers copy them: $…$, $$…$$, \(…\) and the
//   escaped \\(…\\) (its inside unescaped too).
// Neighbouring pieces with the same annotations join. A bare address's href is addressOf's (links/address.mjs: www. gets
// http://).
//
// A whole document's Markdown (markdown.mjs readMarkdownDocument, the import's; never a paste, whose
// rules stay those above) reads more of what a Markdown viewer shows (`parseInlineMarkdown(text, doc)`):
//   HTML entities (&amp; &lt; &#8212; &nbsp; a plain space); inline HTML: <br> a line break, <b>
//   <strong> <i> <em> <u> <ins> <s> <del> <strike> <code> <kbd> <samp> <tt> <sup> <sub> <mark> as
//   their marks, <a href> a link, <img> a picture, the tags of other HTML elements left out (their
//   words kept; a <word> that is no HTML element stays text), comments gone;
//   footnote references [^label] (a defined one: its number, superscript, linked to #fn-<number>),
//   pictures ![alt](src "title"), ![alt][ref] and a linked one [![alt](src)](href) (a piece of its own:
//   U+FFFC annotated img with its address, alt and title, which markdown.mjs makes a picture block or
//   a link), reference links [text][ref], [ref][] and [ref] (one the document defines), <a@b.c>
//   and a bare a@b.c (GFM's); $$…$$ amid words a display formula (annotated display too, which
//   markdown.mjs makes a block of its own in a paragraph).
// It adds three annotations: sup (superscript), sub (subscript) and display.
//
// Yuque's Markdown (its toolbar's 复制为 Markdown, read as a whole document with `yuque`: yuque.mjs)
// reads two more: a formula as Yuque writes one, $ … $ with a space inside each $ (Pandoc's rule
// refuses those), and the colors of a <font style="color: …; background-color: …"> (or a <span> so
// styled) as the page's nearest (colors.mjs: Yuque's colors are meant, as Word's are).

import { addressOf } from "../../links/address.mjs";
import { backgroundColor, textColor } from "./colors.mjs";

const WORD = /[\p{L}\p{N}]/u;
const TRAILING = /[.,:;!?'")\]}>，。：；！？、）】」』]+$/u;

/** CommonMark's backslash escapes: \ and ASCII punctuation is that punctuation (ChatGPT escapes \_ \* \\). */
export const unescapeMarkdown = (text) => text.replace(/\\([!-/:-@[-`{-~])/g, "$1");

// [pattern, result, what the character before must be]; a result is [its text, its annotation (null:
// plain text; or several), whether its text is parsed again, the length it takes when not the match's].
const notWordBefore = (previous) => !previous || !WORD.test(previous);
const RULES = [
  // Inline formulas: \\( … \\) escaped Markdown (ChatGPT's copies; unescaped inside), \( … \) LaTeX's
  // as it is, $$ … $$, and $ … $ (Pandoc's rule: no space after the opening $ or before the closing
  // one, no digit after it, so that "$5 and $6" stays prices; nor a $ before it: "US$6 or $$").
  [/^\\\\\(([\s\S]+?)\\\\\)/, (m) => ["⁍", ["e", unescapeMarkdown(m[1]).trim()], false]],
  [/^\\\(([\s\S]+?)\\\)/, (m) => ["⁍", ["e", m[1].trim()], false]],
  [/^\$\$(.+?)\$\$/, (m) => ["⁍", ["e", m[1].trim()], false]],
  [/^\$(?=\S)([^$\n]*?[^\s$])\$(?!\d)/, (m) => ["⁍", ["e", m[1]], false]],
  [/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/, (m) => [m[2].length > 2 && m[2][0] === " " && m[2].at(-1) === " " ? m[2].slice(1, -1) : m[2], ["c"], false]],
  [/^\\([!-/:-@[-`{-~])/, (m) => [m[1], null, false]],
  [/^\*\*\*(?!\s)(.+?)(?<!\s)\*\*\*/, (m) => [m[1], [["b"], ["i"]], true]],
  [/^___(?!\s)(.+?)(?<!\s)___(?![\p{L}\p{N}])/u, (m) => [m[1], [["b"], ["i"]], true], notWordBefore],
  [/^\*\*(?!\s)(.+?)(?<!\s)\*\*/, (m) => [m[1], ["b"], true]],
  [/^__(?!\s)(.+?)(?<!\s)__(?![\p{L}\p{N}])/u, (m) => [m[1], ["b"], true], notWordBefore],
  [/^~~(?!\s)(.+?)(?<!\s)~~/, (m) => [m[1], ["s"], true]],
  [/^\*(?![\s*])(.+?)(?<![\s*])\*(?!\*)/, (m) => [m[1], ["i"], true]],
  [/^_(?![\s_])(.+?)(?<![\s_])_(?![\p{L}\p{N}_])/u, (m) => [m[1], ["i"], true], notWordBefore],
  [/^\[([^\]]+)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/, (m) => [m[1], ["a", m[2]], true]],
  [/^<((?:https?|mailto):[^\s<>]+)>/i, (m) => [m[1], ["a", m[1]], false]],
  // A bare address: its backslash escapes the characters themselves (a viewer links the text it shows).
  [/^(?:https?:\/\/|www\.)[^\s<>]+/i, (m) => {
    const written = m[0].replace(TRAILING, "");
    const url = unescapeMarkdown(written);
    return [url, ["a", addressOf(url) ?? url], false, written.length];
  }, notWordBefore],
];

// Formulas alone, everything else as it is: text taken from HTML, whose * and _ are the characters.
const MATH_RULES = RULES.slice(0, 4);

// ---------- a whole document's (readMarkdownDocument) ----------

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ensp: " ", emsp: " ", thinsp: " ", shy: "",
  mdash: "—", ndash: "–", hellip: "…", middot: "·", bull: "•", laquo: "«", raquo: "»", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
  copy: "©", reg: "®", trade: "™", deg: "°", micro: "µ", para: "¶", sect: "§", cent: "¢", pound: "£", yen: "¥", euro: "€",
  times: "×", divide: "÷", plusmn: "±", minus: "−", le: "≤", ge: "≥", ne: "≠", asymp: "≈", equiv: "≡", infin: "∞", radic: "√", sum: "∑", prod: "∏",
  larr: "←", rarr: "→", uarr: "↑", darr: "↓", harr: "↔", lArr: "⇐", rArr: "⇒", hArr: "⇔", check: "✓", cross: "✗",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", theta: "θ", lambda: "λ", mu: "μ", pi: "π", sigma: "σ", tau: "τ", phi: "φ", omega: "ω",
  Delta: "Δ", Sigma: "Σ", Omega: "Ω", prime: "′", Prime: "″",
};
// An entity's character, or null for a name it does not know (the text stays as written). A numeric
// one outside Unicode, or a surrogate, is U+FFFD, as HTML reads it.
function entity(name) {
  if (name[0] !== "#") return Object.hasOwn(ENTITIES, name) ? ENTITIES[name] : null;
  const code = /^#x/i.test(name) ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
  return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : "\u{FFFD}";
}

// Inline HTML tags as marks; other elements' tags left out, their words kept.
const FORMATS = {
  b: ["b"], strong: ["b"], i: ["i"], em: ["i"], u: ["_"], ins: ["_"], s: ["s"], del: ["s"], strike: ["s"],
  code: ["c"], kbd: ["c"], samp: ["c"], tt: ["c"], sup: ["sup"], sub: ["sub"], mark: ["h", "yellow_background"],
};
const PLAIN_TAGS = "span|font|small|big|abbr|acronym|cite|dfn|time|q|var|bdi|bdo|data|nobr|wbr|center|label|ruby|rt|rp|a|p|div|section|article|header|footer|nav|aside|main|figure|figcaption|summary|details|li|ul|ol|dl|dt|dd|blockquote|table|thead|tbody|tfoot|tr|td|th|caption|hr|h[1-6]|picture|source|video|audio|iframe|svg|input|button";
const attribute = (tag, name) => {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(tag);
  return match ? (match[1] ?? match[2] ?? match[3]) : null;
};
const decodeEntities = (text) => text.replace(/&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/g, (all, name) => entity(name) ?? all);

// Yuque's Markdown: $ … $ with a space inside each $ a formula (its words trimmed), and a <font> or
// <span> whose style colors its words those colors, the nearest of the page's (none: its words alone).
const styleValue = (style, name) => new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, "i").exec(style ?? "")?.[1].trim() ?? "";
const YUQUE_RULES = [
  [/^\$ +([^$\n]*?[^\s$]) +\$(?!\d)/, (m) => ["⁍", ["e", m[1]], false]],
  [/^<(font|span)\s([^<>]*)>([\s\S]*?)<\/\1\s*>/i, (m) => {
    const style = attribute(`<${m[1]} ${m[2]}>`, "style");
    const text = textColor(styleValue(style, "color"), { nearest: true });
    const background = backgroundColor(styleValue(style, "background(?:-color)?"), { nearest: true });
    const colors = [text, background].filter(Boolean).map((name) => ["h", name]);
    return [m[3], colors.length ? colors : null, true];
  }],
];

/** A picture's piece: U+FFFC annotated ["img", its address, its alt, its title]. */
const picture = (src, alt, title) => ["\u{FFFC}", ["img", src.replace(/^<|>$/g, ""), alt ?? "", title ?? ""], false];
const unquoted = (text) => (text ? text.slice(1, -1) : "");
const LINK_TARGET = String.raw`\(\s*(<[^>]*>|[^)\s]+)(?:\s+("[^"]*"|'[^']*'))?\s*\)`;

// A document's rules: a paste's (RULES), and what a Markdown viewer reads besides. `doc`: { refs (Map of the
// document's link definitions, by label in lower case: { href, title }), footnote(label) (a defined
// footnote's number, numbered as first referred to; else null), at (the line read), formulas and
// links (lists each formula and each link to an address that is no web one is added to, at that
// line, as a rule makes it) }.
function documentRules(doc) {
  const ref = (label) => doc.refs?.get(label.trim().replace(/\s+/g, " ").toLowerCase()) ?? null;
  const heard = (annotation) => {
    const each = Array.isArray(annotation?.[0]) ? annotation : annotation ? [annotation] : [];
    const display = each.some((a) => a[0] === "display");
    for (const entry of each) {
      const [name, value] = entry;
      if (name === "e") doc.formulas?.push({ tex: value, line: doc.at, display });
      // A link a report does not follow (the import says which it brings): its annotation with it, the rich text's own.
      if (name === "a" && !/^(https?:|mailto:|tel:)/i.test(value) && !/^#fn-\d+$/.test(value)) doc.links?.push({ href: value, line: doc.at, entry });
    }
  };
  const rules = [
    ...(doc.yuque ? YUQUE_RULES : []),
    RULES[0], RULES[1],
    // $$ … $$ amid words: a display formula (markdown.mjs makes it a block of its own in a paragraph).
    [/^\$\$(.+?)\$\$/, (m) => ["⁍", [["e", m[1].trim()], ["display"]], false]],
    ...RULES.slice(3, 6), // $ … $, code, backslash escapes
    [/^<!--[\s\S]*?-->/, () => ["", null, false]],
    [/^&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/, (m) => {
      const character = entity(m[1]);
      return character === null ? null : [character, null, false];
    }],
    [/^<br\s*\/?>/i, () => ["\n", null, false]],
    [/^<(b|strong|i|em|u|ins|s|del|strike|code|kbd|samp|tt|sup|sub|mark)(?:\s[^<>]*)?>([\s\S]*?)<\/\1\s*>/i, (m) => {
      const mark = FORMATS[m[1].toLowerCase()];
      return mark[0] === "c" ? [decodeEntities(m[2]), mark, false] : [m[2], mark, true]; // code's words as written, its entities read
    }],
    [/^<a\s[^<>]*>([\s\S]*?)<\/a\s*>/i, (m) => {
      const href = attribute(m[0].slice(0, m[0].indexOf(">") + 1), "href");
      return href ? [m[1], ["a", decodeEntities(href)], true] : [m[1], null, true];
    }],
    [/^<img\s[^<>]*>/i, (m) => {
      const src = attribute(m[0], "src");
      return src ? picture(decodeEntities(src), decodeEntities(attribute(m[0], "alt") ?? ""), decodeEntities(attribute(m[0], "title") ?? "")) : ["", null, false];
    }],
    [new RegExp(`^</?(?:${PLAIN_TAGS})(?:\\s[^<>]*)?/?>`, "i"), () => ["", null, false]],
    [/^\[\^([^\]\s]+)\]/, (m) => {
      const number = doc.footnote?.(m[1]);
      return number ? [String(number), [["a", `#fn-${number}`], ["sup"]], false] : null;
    }],
    [new RegExp(String.raw`^\[!\[([^\]]*)\]${LINK_TARGET}\]${LINK_TARGET}`), (m) => picture(m[2], m[1], unquoted(m[3]))],
    [new RegExp(String.raw`^!\[([^\]]*)\]${LINK_TARGET}`), (m) => picture(m[2], m[1], unquoted(m[3]))],
    [/^!\[([^\]]*)\]\[([^\]]*)\]/, (m) => {
      const found = ref(m[2] || m[1]);
      return found ? picture(found.href, m[1], found.title) : null;
    }],
    ...RULES.slice(6),
    [/^\[([^\]]+)\]\[([^\]]*)\]/, (m) => {
      const found = ref(m[2] || m[1]);
      return found ? [m[1], ["a", found.href], true] : null;
    }],
    [/^\[([^\]^][^\]]*)\](?![(:[])/, (m) => {
      const found = ref(m[1]);
      return found ? [m[1], ["a", found.href], true] : null;
    }],
    [/^<([^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+)>/, (m) => [m[1], ["a", `mailto:${m[1]}`], false]],
    // GFM's e-mail address autolink: a domain with a dot, not ending in - or _ (a . after it is the sentence's).
    [/^[A-Za-z0-9._+-]+@[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+/, (m) => (/[-_]$/.test(m[0]) ? null : [m[0], ["a", `mailto:${m[0]}`], false]), notWordBefore],
  ];
  return rules.map(([pattern, result, before]) => [pattern, (m) => {
    const made = result(m);
    if (made) heard(made[1]);
    return made;
  }, before]);
}

/** The inline formulas in text ($…$, $$…$$, \(…\), \\(…\\)), the rest plain. */
export const parseInlineMath = (text) => parseInline(text, MATH_RULES);

/**
 * A line of Markdown as rich text; with `doc` (a whole document's: documentRules), what a Markdown
 * viewer reads besides a paste's rules.
 */
export const parseInlineMarkdown = (text, doc = null) => parseInline(text, doc ? (doc.rules ??= documentRules(doc)) : RULES); // a document's made once

// A table cell's pictures, a linked one's too (its link left: the cell's picture is what it shows),
// ahead of a paste's rules (a paste's Markdown table: 单元格里的图片, which a cell holds).
const CELL_RULES = [
  [new RegExp(String.raw`^\[!\[([^\]]*)\]${LINK_TARGET}\]${LINK_TARGET}`), (m) => picture(m[2], m[1], unquoted(m[3]))],
  [new RegExp(String.raw`^!\[([^\]]*)\]${LINK_TARGET}`), (m) => picture(m[2], m[1], unquoted(m[3]))],
  ...RULES,
];

/** A pasted Markdown table's cell as rich text: a paste's rules, and its pictures ![alt](src) (inline.mjs's picture pieces). */
export const parseCellMarkdown = (text) => parseInline(text, CELL_RULES);

/** HTML entities in text as their characters (&amp; &#8212;), one it does not know as written. */
export { decodeEntities };

// A rule's result may be null: its pattern matched what it does not take (a reference to a link the
// document does not define), and the next rule is tried.
function parseInline(source, rules) {
  const out = [];
  const push = (text, annotations) => {
    if (!text) return;
    const last = out.at(-1);
    // A picture is a piece of its own, never joined to the one before it.
    if (last && !annotations.some((a) => a[0] === "img") && JSON.stringify(last[1] ?? []) === JSON.stringify(annotations)) last[0] += text;
    else out.push(annotations.length ? [text, annotations] : [text]);
  };
  const walk = (text, annotations) => {
    let plain = "";
    for (let i = 0; i < text.length;) {
      const rest = text.slice(i);
      let hit = null;
      for (const [pattern, result, before] of rules) {
        const match = rest.match(pattern);
        if (!match || (before && !before(text[i - 1]))) continue;
        const made = result(match);
        if (made) {
          hit = [match, made];
          break;
        }
      }
      if (!hit) {
        plain += text[i++];
        continue;
      }
      const [match, [inner, annotation, nested, used]] = hit;
      push(plain, annotations);
      plain = "";
      const next = annotation === null ? annotations : Array.isArray(annotation[0]) ? [...annotations, ...annotation] : [...annotations, annotation];
      if (nested) walk(inner, next);
      else push(inner, next);
      i += used ?? match[0].length;
    }
    push(plain, annotations);
  };
  walk(source, []);
  return out;
}
