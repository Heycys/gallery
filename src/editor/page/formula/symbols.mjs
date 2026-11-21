import { t } from "../../../shared/i18n/index.mjs";
// The formula editor's symbol bar (panel.mjs): six groups — 常用, 希腊, 运算, 结构, 关系与箭头, 化学 —
// each opening a card of all its symbols drawn by KaTeX, in sections with small titles (no
// scrolling); a click puts one in at the caret; what was put in lately comes first under 常用
// (its `recent`). A group is { name, recent?, sections: [{ title?, columns, height?, entries }] }; an entry is [what goes in, what
// the card draws (else what goes in), its name, the columns it takes (1 when not given)]; a "#" in what
// goes in is a place to fill (a template's): the selected text goes in the first, the caret into
// the first empty one, Tab to the next (panel.mjs). Symbols are twelve to a line, templates ten (a
// matrix two of them), chemistry's nine. A section's rows are `height` px, ROW when not given: as high
// as what they hold asks, simple symbols close together, large operators and templates with more room.

export const SLOT = "#";

/** How high a row of a section is, in px, where it does not say. */
export const ROW = 26;

const each = (names) => names.map((name) => [name]);
const greek = (names) => names.map((name) => [`\\${name}`]);

export const GROUPS = [
  {
    name: t("常用"), recent: true, sections: [{
      columns: 12, entries: [
          ["\\frac{#}{#}", "\\frac{a}{b}", t("分数")], ["\\sqrt{#}", "\\sqrt{x}", t("根号")], ["#^{#}", "x^{n}", t("上标")], ["#_{#}", "x_{i}", t("下标")],
          ["\\sum_{#}^{#}", "\\sum", t("求和")], ["\\int_{#}^{#}", "\\int", t("积分")], ["\\lim_{# \\to #}", "\\lim", t("极限")], ["\\infty"], ["\\partial"], ["\\nabla"], ["\\pm"], ["\\times"],
          ["\\cdot"], ["\\div"], ["\\le"], ["\\ge"], ["\\neq"], ["\\approx"], ["\\to"], ["\\Rightarrow"], ["\\in"], ["\\forall"], ["\\exists"], ["\\degree", "x^{\\circ}", t("度")],
      ],
    }],
  },
  {
    name: t("希腊"), sections: [
      {
        title: t("小写"), columns: 12, entries: greek([
          "alpha", "beta", "gamma", "delta", "epsilon", "varepsilon", "zeta", "eta", "theta", "vartheta", "iota", "kappa",
          "lambda", "mu", "nu", "xi", "pi", "varpi", "rho", "varrho", "sigma", "varsigma", "tau", "upsilon",
          "phi", "varphi", "chi", "psi", "omega",
        ]),
      },
      { title: t("大写"), columns: 12, entries: greek(["Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi", "Sigma", "Upsilon", "Phi", "Psi", "Omega"]) },
    ],
  },
  {
    name: t("运算"), sections: [
      {
        title: t("二元运算"), columns: 12, entries: each([
          "+", "-", "\\pm", "\\mp", "\\times", "\\div", "\\cdot", "\\ast", "\\star", "\\circ", "\\bullet", "\\diamond",
          "\\oplus", "\\ominus", "\\otimes", "\\oslash", "\\odot", "\\cup", "\\cap", "\\sqcup", "\\sqcap", "\\setminus", "\\wedge", "\\vee",
        ]),
      },
      { title: t("大型运算"), columns: 12, height: 30, entries: each(["\\sum", "\\prod", "\\coprod", "\\bigcup", "\\bigcap", "\\bigsqcup", "\\bigvee", "\\bigwedge", "\\int", "\\iint", "\\oint", "\\bigoplus"]) },
      { title: t("其他"), columns: 12, height: 30, entries: each(["\\infty", "\\partial", "\\nabla", "\\emptyset", "\\prime", "\\hbar", "\\ell", "\\angle", "\\ldots", "\\cdots", "\\vdots", "\\ddots"]) },
    ],
  },
  {
    name: t("结构"), sections: [
      {
        columns: 10, height: 30, entries: [
          ["#^{#}", "x^{a}", t("上标")], ["#_{#}", "x_{a}", t("下标")], ["#_{#}^{#}", "x_{a}^{b}", t("上下标")], ["\\frac{#}{#}", "\\frac{a}{b}", t("分数")], ["\\dfrac{#}{#}", "\\dfrac{a}{b}", t("大分数")],
          ["\\sqrt{#}", "\\sqrt{x}", t("平方根")], ["\\sqrt[#]{#}", "\\sqrt[n]{x}", t("n 次根")], ["\\binom{#}{#}", "\\binom{n}{k}", t("组合数")], ["\\log_{#} #", "\\log_{a}x", t("对数")], ["\\lim_{# \\to #} #", "\\lim_{x\\to 0}", t("极限")],
        ],
      },
      {
        columns: 10, height: 28, entries: [
          ["\\sum_{#}^{#} #", "\\sum_{i=1}^{n}", t("求和")], ["\\prod_{#}^{#} #", "\\prod_{i=1}^{n}", t("连乘")], ["\\int_{#}^{#} # \\,\\mathrm{d}#", "\\int_{a}^{b}", t("定积分")], ["\\iint_{#} #", "\\iint", t("二重积分")], ["\\oint_{#} #", "\\oint", t("环路积分")],
          ["\\left( # \\right)", "(x)", t("圆括号")], ["\\left[ # \\right]", "[x]", t("方括号")], ["\\left\\{ # \\right\\}", "\\{x\\}", t("花括号")], ["\\left| # \\right|", "|x|", t("绝对值")], ["\\left\\| # \\right\\|", "\\|x\\|", t("范数")],
        ],
      },
      {
        columns: 10, entries: [
          ["\\left\\langle # \\right\\rangle", "\\langle x\\rangle", t("尖括号")], ["\\lfloor # \\rfloor", "\\lfloor x\\rfloor", t("向下取整")], ["\\lceil # \\rceil", "\\lceil x\\rceil", t("向上取整")], ["\\hat{#}", "\\hat{x}", t("帽子")], ["\\bar{#}", "\\bar{x}", t("横线")],
          ["\\tilde{#}", "\\tilde{x}", t("波浪")], ["\\vec{#}", "\\vec{x}", t("向量")], ["\\dot{#}", "\\dot{x}", t("一阶导")], ["\\ddot{#}", "\\ddot{x}", t("二阶导")], ["\\overline{#}", "\\overline{AB}", t("上划线")],
        ],
      },
      {
        columns: 10, height: 32, entries: [
          ["\\overrightarrow{#}", "\\overrightarrow{AB}", t("向量箭头")], ["\\underbrace{#}_{#}", "\\underbrace{ab}_{n}", t("下括号")], ["\\cancel{#}", "\\cancel{x}", t("删去")], ["\\boxed{#}", "\\boxed{x}", t("方框")], ["\\text{#}", t("\\text{文}"), t("文字")],
          ["\\mathbb{#}", "\\mathbb{R}", t("黑板粗体")], ["\\mathcal{#}", "\\mathcal{L}", t("花体")], ["\\mathbf{#}", "\\mathbf{x}", t("粗体")], ["\\boldsymbol{#}", "\\boldsymbol{\\theta}", t("粗斜体")], ["\\mathrm{#}", "\\mathrm{d}", t("正体")],
        ],
      },
      {
        // Two columns each, on a line of their own.
        columns: 10, height: 44, entries: [
          ["\\begin{cases} # & # \\\\ # & # \\end{cases}", "\\begin{cases}a\\\\b\\end{cases}", t("分段函数"), 2], ["\\begin{pmatrix} # & # \\\\ # & # \\end{pmatrix}", "\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}", t("矩阵（圆括号）"), 2],
          ["\\begin{bmatrix} # & # \\\\ # & # \\end{bmatrix}", "\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}", t("矩阵（方括号）"), 2], ["\\begin{vmatrix} # & # \\\\ # & # \\end{vmatrix}", "\\begin{vmatrix}a&b\\\\c&d\\end{vmatrix}", t("行列式"), 2],
          ["\\begin{aligned} # &= # \\\\ &= # \\end{aligned}", "\\begin{aligned}a&=b\\\\&=c\\end{aligned}", t("多行对齐"), 2],
        ],
      },
    ],
  },
  {
    name: t("关系与箭头"), sections: [
      {
        title: t("关系"), columns: 12, entries: each([
          "=", "\\neq", "\\approx", "\\equiv", "\\sim", "\\simeq", "\\cong", "\\propto", "<", ">", "\\le", "\\ge",
          "\\ll", "\\gg", "\\leqslant", "\\geqslant", "\\prec", "\\succ", "\\preceq", "\\succeq", "\\mid", "\\parallel", "\\perp", "\\doteq",
        ]),
      },
      { title: t("集合与逻辑"), columns: 12, entries: each(["\\in", "\\notin", "\\ni", "\\subset", "\\subseteq", "\\supseteq", "\\forall", "\\exists", "\\nexists", "\\neg", "\\therefore", "\\because"]) },
      {
        title: t("箭头"), columns: 12, height: 28, entries: [
          ...each([
            "\\to", "\\leftarrow", "\\leftrightarrow", "\\Rightarrow", "\\Leftarrow", "\\Leftrightarrow", "\\longrightarrow", "\\longleftarrow", "\\longleftrightarrow", "\\Longrightarrow", "\\Longleftarrow", "\\Longleftrightarrow",
            "\\uparrow", "\\downarrow", "\\updownarrow", "\\Uparrow", "\\Downarrow", "\\mapsto", "\\nearrow", "\\searrow", "\\hookrightarrow", "\\rightleftharpoons",
          ]),
          ["\\xrightarrow{#}", "\\xrightarrow{f}", t("带字箭头")], ["\\xleftarrow{#}", "\\xleftarrow{f}", t("带字左箭头")],
        ],
      },
    ],
  },
  {
    name: t("化学"), sections: [
      {
        columns: 9, entries: [
          ["\\ce{#}", "\\ce{H2O}", t("化学式")], ["\\ce{#^{#+}}", "\\ce{X^{n+}}", t("阳离子")], ["\\ce{#^{#-}}", "\\ce{Y^{n-}}", t("阴离子")], ["\\ce{^{#}_{#}#}", "\\ce{^{A}_{Z}X}", t("核素")], ["\\ce{#-#}", "\\ce{A-B}", t("单键")],
          ["\\ce{#=#}", "\\ce{A=B}", t("双键")], ["\\ce{#\\bond{3}#}", "\\ce{A\\bond{3}B}", t("三键")], ["\\ce{#.#}", "\\ce{A.B}", t("结合（·）")], ["\\pu{#}", "\\pu{1 mol}", t("物理量单位")],
        ],
      },
      {
        columns: 9, height: 30, entries: [
          ["\\ce{# -> #}", "\\ce{->}", t("反应")], ["\\ce{# <- #}", "\\ce{<-}", t("逆向反应")], ["\\ce{# <-> #}", "\\ce{<->}", t("共振")], ["\\ce{# <=> #}", "\\ce{<=>}", t("可逆反应")], ["\\ce{# <=>> #}", "\\ce{<=>>}", t("正向为主")],
          ["\\ce{# <<=> #}", "\\ce{<<=>}", t("逆向为主")], ["\\ce{# ^}", "\\ce{X ^}", t("气体")], ["\\ce{# v}", "\\ce{X v}", t("沉淀")], ["\\ce{# ->[#][#] #}", t("\\ce{->[\\text{上}][\\text{下}]}"), t("条件")],
        ],
      },
    ],
  },
];

/**
 * A snippet put in place of `text`'s range [start, end): its places to fill emptied (the selected
 * text in the first), the caret in the first empty one (or after it). Returns { text, caret }.
 */
export function fillSnippet(text, start, end, snippet) {
  const selected = text.slice(start, end);
  let out = "";
  const places = [];
  let first = true;
  for (const char of snippet) {
    if (char !== SLOT) {
      out += char;
      continue;
    }
    if (first && selected) out += selected;
    else places.push(start + out.length);
    first = false;
  }
  // A command followed by a letter would join it (\alpha x): a space after a bare command.
  const after = text.slice(end);
  if (/\\[a-zA-Z]+$/.test(out) && /^[a-zA-Z]/.test(after)) out += " ";
  return { text: text.slice(0, start) + out + after, caret: places[0] ?? start + out.length };
}

/** Where Tab goes from `at`: the next empty place to fill ({} or the inside of an empty pair), or null. */
export function nextPlace(text, at, back = false) {
  const found = [...text.matchAll(/\{\}/g)].map((match) => match.index + 1);
  return (back ? found.filter((place) => place < at).at(-1) : found.find((place) => place > at)) ?? null;
}
