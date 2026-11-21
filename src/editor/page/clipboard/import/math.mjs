import { parseInlineMath, unescapeMarkdown } from "./inline.mjs";

// Formulas in pasted content: copied from ChatGPT, Gemini, Claude, DeepSeek, Wikipedia… a formula
// would otherwise be lost or garbled.
//   convertRenderedMath(root)  formulas a page drew, as the formula marks Notion's HTML carries (data-notion-
//     equation / data-notion-inline-equation, which html.mjs reads), before the conversion:
//     KaTeX (.katex-display display, .katex inline): the TeX in annotation[encoding="application/x-tex"];
//     [data-math] (Gemini; display with block / display in its class, or a div);
//     MathJax 2: script[type^="math/tex"] (mode=display: display), the .MathJax* drawn beside it removed;
//     MathML (Wikipedia): its annotation or alttext, {\displaystyle …} taken off; .mwe-math-element
//     (with a fallback picture) replaced whole.
//   mathifySpecs(specs)  formulas still in the text of converted blocks (AI pages and their copy
//     buttons give the TeX as text): a text block that is only $$ … $$ / \[ … \] / \\[ … \\] a
//     formula block; $ … $, $$ … $$, \( … \), \\( … \\) in text inline formulas (code and formulas
//     left alone; table cells too).

const EQ = "data-notion-equation";
const INLINE_EQ = "data-notion-inline-equation";

function equationElement(doc, tex, display) {
  const element = doc.createElement(display ? "div" : "span");
  element.setAttribute(display ? EQ : INLINE_EQ, tex);
  element.textContent = tex;
  return element;
}

const stripDisplaystyle = (tex) => tex.replace(/^\{\\displaystyle\s*([\s\S]*)\}$/, "$1").trim();

export function convertRenderedMath(root) {
  const doc = root.ownerDocument;
  for (const element of [...root.querySelectorAll(".katex-display, .katex")]) {
    if (!element.isConnected) continue;
    const tex = element.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim();
    if (tex) element.replaceWith(equationElement(doc, tex, element.classList.contains("katex-display")));
  }
  for (const element of [...root.querySelectorAll("[data-math]")]) {
    if (!element.isConnected) continue;
    const tex = element.getAttribute("data-math")?.trim();
    if (tex) element.replaceWith(equationElement(doc, tex, /block|display/i.test(element.getAttribute("class") ?? "") || element.tagName === "DIV"));
  }
  for (const script of [...root.querySelectorAll('script[type^="math/tex"]')]) {
    const display = /mode=display/.test(script.getAttribute("type"));
    for (let p = script.previousElementSibling; p && /MathJax/.test(p.getAttribute("class") ?? ""); p = script.previousElementSibling) p.remove();
    const tex = script.textContent.trim();
    if (tex) script.replaceWith(equationElement(doc, tex, display));
    else script.remove();
  }
  for (const math of [...root.querySelectorAll("math")]) {
    if (!math.isConnected) continue;
    const tex = math.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim() || math.getAttribute("alttext")?.trim();
    if (!tex) continue;
    (math.closest(".mwe-math-element") ?? math).replaceWith(equationElement(doc, stripDisplaystyle(tex), math.getAttribute("display") === "block"));
  }
}

// Inline formulas in rich text's plain pieces, as formula pieces with the piece's annotations.
function mathifyTitle(title) {
  if (!Array.isArray(title)) return title;
  const out = [];
  for (const [text, annotations] of title) {
    if (annotations?.some((a) => a[0] === "c" || a[0] === "e") || !/[$\\]/.test(text)) {
      out.push(annotations ? [text, annotations] : [text]);
      continue;
    }
    for (const [piece, own] of parseInlineMath(text)) {
      const merged = [...(own ?? []), ...(annotations ?? [])];
      out.push(merged.length ? [piece, merged] : [piece]);
    }
  }
  return out;
}

// A whole text that is a display formula: its TeX, else null. [pattern, escaped inside, its end
// that may not come again inside].
const DISPLAY = [[/^\\\\\[([\s\S]+)\\\\\]$/, true, "\\\\]"], [/^\\\[([\s\S]+)\\\]$/, false, "\\]"], [/^\$\$([\s\S]+)\$\$$/, false, "$$"]];
function displayMathOf(title) {
  if (!title?.length || title.some(([, a]) => a?.some((x) => x[0] === "c" || x[0] === "e"))) return null;
  const text = title.map((t) => t[0]).join("").trim();
  for (const [pattern, escaped, close] of DISPLAY) {
    const match = pattern.exec(text);
    if (match && !match[1].includes(close)) return (escaped ? unescapeMarkdown(match[1]) : match[1]).trim();
  }
  return null;
}

export function mathifySpecs(specs) {
  return specs.map((s) => {
    if (s.type === "code" || s.type === "equation") return s;
    if (s.type === "text" && !s.children?.length) {
      const tex = displayMathOf(s.title);
      if (tex) return { type: "equation", title: [[tex]], props: {}, children: [] };
    }
    const props = { ...s.props };
    if (props.cells) props.cells = Object.fromEntries(Object.entries(props.cells).map(([key, value]) => [key, mathifyTitle(value)]));
    if (props.caption) props.caption = mathifyTitle(props.caption);
    return { ...s, title: mathifyTitle(s.title), props, children: mathifySpecs(s.children ?? []) };
  });
}

export const mathifyRichText = mathifyTitle;
