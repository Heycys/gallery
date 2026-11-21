import { SHEETS } from "../../components/kit.mjs";

// What the outline lists, read from the page (outline/tree.mjs's entries): the heading blocks (h1-h4
// the editor knows as headings, data-ge-unit-kind="heading", in the file or made on the page) in the
// page's flows: sections, plain boxes, highlight panels, rows of columns, disclosures, tab panels. Not
// the report's title (the header's: the page's name), a detail card's headings (a dialog, not on the
// page), a component's own title (a figure's or a chart's, which is no heading block), nor a heading in a
// table or a list (a flowchart's step). A row of columns, a disclosure and a tab's panel keep their
// headings to themselves (tree.mjs "scope"); a tabs area lists its tabs in their row's order, the hidden
// ones too, each with its panel's headings. A heading with no text (just made) has no row yet.

export const HEADING = ':is(h1, h2, h3, h4)[data-ge-unit-kind="heading"]';
export const LEFT_OUT = "dialog, figure, table, li, .doc-header, template, [data-doc-dev]";
const SCOPES = ".doc-columns, details";

// ---------- a formula as a row reads it ----------

const SYMBOLS = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ",
  lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  times: "×", cdot: "·", div: "÷", pm: "±", mp: "∓", le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠", approx: "≈", sim: "∼", simeq: "≃",
  equiv: "≡", propto: "∝", infty: "∞", to: "→", rightarrow: "→", leftarrow: "←", Rightarrow: "⇒", Leftarrow: "⇐", leftrightarrow: "↔",
  Leftrightarrow: "⇔", mapsto: "↦", sum: "∑", prod: "∏", int: "∫", oint: "∮", partial: "∂", nabla: "∇", in: "∈", notin: "∉", ni: "∋",
  subset: "⊂", subseteq: "⊆", supset: "⊃", supseteq: "⊇", cup: "∪", cap: "∩", emptyset: "∅", varnothing: "∅", forall: "∀", exists: "∃",
  neg: "¬", land: "∧", wedge: "∧", lor: "∨", vee: "∨", ldots: "…", cdots: "⋯", dots: "…", circ: "∘", degree: "°", prime: "′", angle: "∠",
  perp: "⊥", parallel: "∥", ll: "≪", gg: "≫", langle: "⟨", rangle: "⟩", lvert: "|", rvert: "|", vert: "|", mid: "|", percent: "%",
};
const SPACED = new Set(["×", "·", "÷", "±", "∓", "≤", "≥", "≠", "≈", "∼", "≃", "≡", "∝", "→", "←", "⇒", "⇐", "↔", "⇔", "↦", "∈", "∉", "∋", "⊂", "⊆", "⊃", "⊇", "∪", "∩", "∧", "∨", "∘", "≪", "≫", "∥", "⊥"]); // written with a space on each side
const NAMED = new Set(["log", "ln", "lg", "sin", "cos", "tan", "cot", "sec", "csc", "exp", "lim", "max", "min", "sup", "inf", "det", "arg", "deg", "gcd", "mod", "Pr"]);
const KEPT = new Set(["text", "textrm", "textbf", "textit", "mathrm", "mathbf", "mathit", "mathsf", "mathtt", "mathcal", "mathbb", "mathfrak", "boldsymbol", "bm", "operatorname", "mbox", "hbox", "overline", "underline", "widehat", "widetilde", "hat", "tilde", "bar", "vec", "dot", "ddot", "displaystyle", "textstyle"]);
const DROPPED = new Set(["left", "right", "big", "Big", "bigg", "Bigg", "bigl", "bigr", "Bigl", "Bigr", "limits", "nolimits"]);
const SPACES = { ",": " ", ";": " ", ":": " ", "!": "", " ": " ", quad: " ", qquad: " ", "\\": " " };
const UP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ", "′": "′" };
const DOWN = { 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉", "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎" };

/**
 * A formula's TeX as a row reads it (a line of plain text, not drawn): Greek letters and the usual
 * signs as their characters, \frac{a}{b} as a/b, \sqrt{x} as √x, a power or an index of digits raised
 * or lowered (x^2 as x², a_1 as a₁; others written x^n, x_ij as they are), \text{…} and its kind as
 * their words, \left and \right left out, a chemical formula's numbers lowered (\ce{H2O} as H₂O).
 */
export function texReading(tex) {
  let at = 0;
  const group = () => { // what a command or a script takes: {…}, a command, or one character
    while (tex[at] === " ") at++;
    if (tex[at] === "{") {
      let depth = 0;
      const from = at;
      for (; at < tex.length; at++) {
        if (tex[at] === "\\") at++;
        else if (tex[at] === "{") depth++;
        else if (tex[at] === "}" && --depth === 0) break;
      }
      at++;
      return texReading(tex.slice(from + 1, at - 1));
    }
    if (tex[at] === "\\") return read(true);
    return tex[at++] ?? "";
  };
  const wrapped = (text) => (text.length > 1 && /[\s+\-−×·/=]/.test(text) ? `(${text})` : text);
  const script = (text, map, mark) => {
    const bare = text.replace(/\s+/g, "");
    if (!bare) return "";
    return [...bare].every((char) => map[char]) ? [...bare].map((char) => map[char]).join("") : `${mark}${wrapped(bare)}`;
  };
  function read(one = false) {
    let out = "";
    while (at < tex.length) {
      const char = tex[at];
      if (char === "\\") {
        at++;
        const name = /[A-Za-z]/.test(tex[at] ?? "") ? tex.slice(at).match(/^[A-Za-z]+/)[0] : tex[at] ?? "";
        at += name.length;
        if (/^[A-Za-z]/.test(name)) while (tex[at] === " ") at++; // the space ending a command's name is no space
        let piece;
        if (name in SPACES) piece = SPACES[name];
        else if (name === "frac" || name === "dfrac" || name === "tfrac") piece = `${wrapped(group())}/${wrapped(group())}`;
        else if (name === "sqrt") {
          if (tex[at] === "[") at = tex.indexOf("]", at) + 1 || tex.length;
          piece = `√${wrapped(group())}`;
        } else if (name === "ce") piece = group().replace(/(?<=[A-Za-z)\]])(\d+)/g, (digits) => script(digits, DOWN, "_"));
        else if (KEPT.has(name)) piece = group();
        else if (DROPPED.has(name)) piece = "";
        else if (SYMBOLS[name]) piece = SPACED.has(SYMBOLS[name]) ? ` ${SYMBOLS[name]} ` : SYMBOLS[name];
        else if (NAMED.has(name)) piece = /[A-Za-z\\]/.test(tex[at] ?? "") ? `${name} ` : name; // sin θ, log₂ n
        else piece = name;
        out += piece;
      } else if (char === "^" || char === "_") {
        at++;
        out += script(group(), char === "^" ? UP : DOWN, char);
      } else if (char === "{") out += group();
      else if (char === "}") at++;
      else if (char === "~") { out += " "; at++; }
      else if (char === "=" || char === "+" || char === "<" || char === ">") { out += ` ${char} `; at++; }
      else { out += char; at++; }
      if (one) break;
    }
    return out;
  }
  return read().replace(/\s+/g, " ").trim();
}

/**
 * A heading's text as its row shows it: spaces as one, an inline formula as it reads (texReading),
 * a link shown with its icon as its title, inline code and marks as their text; what the editor adds
 * (pads, its own nodes) left out.
 */
export function headingText(heading) {
  const copy = heading.cloneNode(true);
  for (const math of copy.querySelectorAll(".katex")) {
    const tex = math.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
    math.replaceWith(tex === undefined ? math.textContent : texReading(tex));
  }
  for (const inline of copy.querySelectorAll(".doc-math-inline")) {
    const text = inline.textContent;
    const tex = text.match(/^\s*\\\(([\s\S]*)\\\)\s*$/);
    inline.textContent = tex ? texReading(tex[1]) : text;
  }
  for (const node of copy.querySelectorAll('[data-doc-dev], [aria-hidden="true"], script, style')) node.remove();
  return copy.textContent.replace(/[​⁠﻿]/g, "").replace(/\s+/g, " ").trim();
}

const tabText = (tab) => tab.textContent.replace(/[​⁠﻿]/g, "").replace(/\s+/g, " ").trim();

/** The entries of `main` (tree.mjs), each heading's and tab's element as its `ref`. */
export function entriesOf(main) {
  const heads = new Set([...main.querySelectorAll(HEADING)].filter((heading) => !heading.closest(LEFT_OUT)));
  const holding = new Set(); // the boxes on the way to a heading: the only ones walked into
  for (const heading of heads) {
    for (let node = heading.parentElement; node && node !== main && !holding.has(node); node = node.parentElement) holding.add(node);
  }
  const named = new Map(); // a heading with no block id is named by its level and text, the second of a name numbered
  const keyOf = (heading, text) => {
    const id = heading.getAttribute("data-block-id");
    if (id) return `b:${id}`;
    const base = `t:${heading.localName}:${text}`;
    const seen = named.get(base) ?? 0;
    named.set(base, seen + 1);
    return seen ? `${base}#${seen}` : base;
  };

  // A tabs area by its name (data-doc-sheets: what the report calls it, kept as the editor gives it
  // a block id, so a fold of its tab stays), else its block id; a second area of a name numbered.
  const areas = new Map();
  const areaKeyOf = (area) => {
    const base = area.getAttribute("data-doc-sheets") || area.getAttribute("data-block-id") || "tabs";
    const seen = areas.get(base) ?? 0;
    areas.set(base, seen + 1);
    return seen ? `${base}#${seen}` : base;
  };

  function tabsOf(area) {
    const row = area.querySelector(SHEETS.row);
    const areaKey = areaKeyOf(area);
    const panels = [...area.children].filter((child) => child.hasAttribute(SHEETS.panelKey));
    const tabs = row ? [...row.querySelectorAll(SHEETS.tabsOfRow)] : [];
    return {
      kind: "tabs",
      key: `a:${areaKey}`,
      tabs: tabs.map((tab) => {
        const id = tab.getAttribute(SHEETS.tabKey);
        const panel = panels.find((candidate) => candidate.getAttribute(SHEETS.panelKey) === id) ?? null;
        return { key: `tab:${areaKey}:${id}`, text: tabText(tab), shown: Boolean(panel && !panel.hidden), ref: tab, entries: panel && holding.has(panel) ? walk(panel) : [] };
      }),
    };
  }

  function walk(container) {
    const out = [];
    for (const child of container.children) {
      if (heads.has(child)) {
        const text = headingText(child);
        if (text) out.push({ kind: "heading", key: keyOf(child, text), level: Number(child.localName[1]), text, ref: child });
      } else if (!holding.has(child)) continue;
      else if (child.matches(SHEETS.match)) out.push(tabsOf(child));
      else if (child.matches(SCOPES)) out.push({ kind: "scope", entries: walk(child) });
      else out.push(...walk(child));
    }
    return out;
  }
  return walk(main);
}

const LISTED = `${HEADING}, ${SHEETS.tab}, ${SHEETS.match}`;
const lists = (node) => node.nodeType === 1 && (node.matches(LISTED) || node.querySelector(LISTED) !== null);

/**
 * Whether a change of the page (a MutationObserver's records) may change what the outline lists: an
 * attribute it reads, text in a heading or a tab, a heading, a tab or a tabs area put in or taken out
 * (or a box holding one); not the words typed in other text, nor what holds no heading.
 */
export function touchesOutline(records) {
  for (const record of records) {
    if (record.type === "attributes") return true;
    const at = record.target.nodeType === 1 ? record.target : record.target.parentElement;
    if (at?.closest?.(`${HEADING}, ${SHEETS.tab}`)) return true;
    if (record.type === "childList" && [...record.addedNodes, ...record.removedNodes].some(lists)) return true;
  }
  return false;
}
