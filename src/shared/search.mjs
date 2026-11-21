import { unescapeText } from "./escape.mjs";

// 搜索文档 in a report's text (the workbench's search: GET /__gallery/workspace/search). A report's text is
// read as its blocks' lines: the text of its main below the header (the title is matched apart), a
// line a block, no script, style or drawing, a formula its TeX. The words are found in a line as they
// are typed (one phrase, upper and lower case alike, runs of spaces as one), each hit shown as a
// snippet of its line around it; `before` (the text just before it in its line) and `index` (which
// time the words occur in the report) let the page find it again (editor/page/find/).

const SKIPPED = /<(script|style|template|noscript|svg)\b[\s\S]*?<\/\1>/gi;
const FORMULA = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g;
const BLOCK = /<\/?(p|li|ul|ol|h[1-6]|table|tr|td|th|caption|summary|details|figure|figcaption|pre|blockquote|div|section|article|aside|dl|dt|dd|hr|br)\b[^>]*>/gi;

/** Runs of spaces as one, the ends trimmed: a query as it is matched. */
export const tidyQuery = (text) => String(text).replace(/\s+/g, " ").trim().slice(0, 100);

/** The lines of report `html` (a whole report.html, or the inside of its main): its blocks' text. */
export function reportLines(html) {
  let body = String(html);
  const main = /<main\b[^>]*>([\s\S]*)<\/main>/i.exec(body);
  if (main) body = main[1];
  body = body.replace(/^\s*<header\b[^>]*>[\s\S]*?<\/header>/i, " "); // the page's header: its title and icon
  const text = body
    .replace(SKIPPED, " ")
    .replace(FORMULA, (_, inline, display) => ` ${inline ?? display} `)
    .replace(BLOCK, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
  return unescapeText(text).replace(/\u200b/g, "").split("\n").map(tidyQuery).filter(Boolean);
}

/**
 * Where `query` occurs in `lines`: { count, hits }, hits the first `most` lines it is in (once a
 * line), each { text (the snippet), start, end (the words in it), before, index }.
 */
export function findIn(lines, query, { most = 3, ahead = 16, length = 90 } = {}) {
  const words = tidyQuery(query).toLowerCase();
  const hits = [];
  let count = 0;
  if (!words) return { count, hits };
  for (const line of lines) {
    const lower = line.toLowerCase();
    let shown = false;
    for (let at = lower.indexOf(words); at >= 0; at = lower.indexOf(words, at + words.length)) {
      if (!shown && hits.length < most) {
        shown = true;
        const from = at <= ahead ? 0 : at - ahead;
        const to = Math.min(line.length, Math.max(from + length, at + words.length));
        const head = from > 0 ? "…" : "";
        hits.push({
          text: `${head}${line.slice(from, to)}${to < line.length ? "…" : ""}`,
          start: head.length + at - from,
          end: head.length + at - from + words.length,
          before: line.slice(Math.max(0, at - 16), at),
          index: count,
        });
      }
      count += 1;
    }
  }
  return { count, hits };
}

/**
 * gallery list's choice of the reports `words` name (src/cli/list.mjs): of `reports`
 * ([{ slug, title, description, edited }]), those whose title, description or slug holds at least
 * one of the words (upper and lower case alike; a word anywhere in them, as Chinese is written
 * without spaces between words), the best first: those holding more of the words, then more of them
 * in the title, then in the slug, then the one edited last. `words`: what was typed, split at spaces.
 */
export function rankReports(reports, words) {
  const wanted = [...new Set(tidyQuery(words).toLowerCase().split(" ").filter(Boolean))];
  if (!wanted.length) return [...reports].sort((a, b) => b.edited - a.edited);
  const scored = reports.map((report) => {
    const [title, slug, description] = [report.title, report.slug, report.description].map((value) => String(value ?? "").toLowerCase());
    const found = wanted.filter((word) => title.includes(word) || slug.includes(word) || description.includes(word));
    return { report, found: found.length, title: wanted.filter((word) => title.includes(word)).length, slug: wanted.filter((word) => slug.includes(word)).length };
  });
  return scored
    .filter(({ found }) => found > 0)
    .sort((a, b) => b.found - a.found || b.title - a.title || b.slug - a.slug || b.report.edited - a.report.edited)
    .map(({ report }) => report);
}
