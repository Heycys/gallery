import { MATH_MACROS } from "../../shared/components/math.mjs";
import { t } from "../../shared/i18n/index.mjs";

// What the page asks of KaTeX: a formula of the text (core.mjs, formula/), a formula block
// (components/math/page.mjs), the import (src/transfer/import.mjs) and the formula editor all read TeX
// the same way, and none of them is another's, so it stands here. It runs with no page too.

/**
 * KaTeX's markup of `tex` ({ html }) or why it does not read ({ error }, and { whole }: the same
 * with all of the TeX where KaTeX quotes fifteen characters each side of the place, the formula
 * box's reason in full); the kit's macros too (the page's, else the components' own where the page
 * has no math.js, or in the import's worker).
 */
export function renderTex(tex, display = false) {
  const katex = globalThis.katex;
  if (!katex) return { html: "", error: t("公式功能没有加载。"), whole: t("公式功能没有加载。") };
  try {
    return { html: katex.renderToString(tex, { displayMode: display, throwOnError: true, strict: "ignore", trust: false, macros: { ...(globalThis.DocMath?.macros ?? MATH_MACROS) } }), error: null, whole: null };
  } catch (error) {
    const said = String(error?.message ?? error).replace(/^KaTeX parse error:\s*/, "");
    return { html: "", error: said, whole: wholeReason(said, error, tex) };
  }
}

// KaTeX's reason ends with where in the TeX it is (ParseError: the place's characters underlined, up to
// fifteen before and after it, "…" for the rest): there, all of the TeX. Only where that end is the
// TeX's own, its place counted in what was typed (a place in a macro's text is not).
function wholeReason(said, error, tex) {
  const { position: start, length } = error ?? {};
  if (!Number.isInteger(start) || !Number.isInteger(length) || start < 0 || start + length > tex.length) return said;
  const end = start + length;
  const marked = tex.slice(start, end).replace(/[^]/g, "$&̲");
  const quoted = `${start > 15 ? `…${tex.slice(start - 15, start)}` : tex.slice(0, start)}${marked}${end + 15 < tex.length ? `${tex.slice(end, end + 15)}…` : tex.slice(end)}`;
  return said.endsWith(quoted) ? `${said.slice(0, said.length - quoted.length)}${tex.slice(0, start)}${marked}${tex.slice(end)}` : said;
}

/**
 * Whether KaTeX does not read `tex`, which the kit left in `node` as it could: drawn with its errors
 * in red, as it wrote them or as words beside a drawing where it took a part of it for a formula
 * of its own. A drawing with nothing of this is read as it is, with no second reading of the page's
 * formulas as it opens; with KaTeX not on the page, nothing can be told.
 */
export function unread(node, tex, display = false) {
  if (!globalThis.katex) return false;
  const whole = node.querySelector(".katex") && !node.querySelector('.katex-error, .katex-html [style*="204, 0, 0"]') && ![...node.childNodes].some((child) => child.nodeType === 3 && child.data.trim());
  return !whole && Boolean(renderTex(tex, display).error);
}
