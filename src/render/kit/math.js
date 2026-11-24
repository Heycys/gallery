// The elements KaTeX leaves as they are (code samples, scripts, styles, form fields) are the
// components' list, which also tells which reports load no KaTeX (render/assets.mjs); the commands
// of LaTeX packages KaTeX lacks are the components' too (MATH_MACROS).
import { DATA_ONLY } from "../../shared/components/database.mjs";
import { HOLDER, INSTANCE, componentAt } from "../../shared/components/installed.mjs";
import { MATH_IGNORED_TAGS, MATH_MACROS } from "../../shared/components/math.mjs";
import { untie } from "./runtime/spacing.js";

(function initDocMath(global) {
  "use strict";

  // Formulas render in every flow of the report (the components' descriptions say which, and the
  // runtime tells: DocKit.flows) and in [data-doc-math]. A container that opts into
  // single-dollar math renders first, on its own; the outermost of the others then render the rest
  // (formulas already rendered are skipped). What stands in the own region of an instance of a
  // component package is its component's: KaTeX passes an element by by its class alone, so each
  // carries one for the walk. Its slots are flows of the document's (installed.mjs heldBy), each the
  // outermost of its own layer, drawn on its own; so are a database's records' bodies, the rest of it data.
  const flows = () => [...global.DocKit.flows, "[data-doc-math]"].join(", ");
  const SKIPPED = "doc-math-skip";

  // Commands of LaTeX packages KaTeX lacks that AI answers use (MATH_MACROS). Chemistry (\ce, \pu)
  // is KaTeX's mhchem, bundled with this file (math-bundle.js). The editor draws formulas with the
  // same set (DocMath.macros), and so does the import (src/transfer/dom.mjs).
  const MACROS = MATH_MACROS;

  function targetsWithin(root) {
    const targets = new Set();
    const selector = flows();
    if (root instanceof Element && root.matches(selector)) targets.add(root);
    root.querySelectorAll?.(selector).forEach((element) => targets.add(element));
    const all = [...targets].filter((element) => !element.matches(INSTANCE) && !componentAt(element));
    const dollar = all.filter((candidate) => candidate.hasAttribute("data-doc-math-dollar"));
    // Outermost, an instance between two being a layer's edge: the walk around it skips the instance.
    const outermost = all.filter((candidate) => {
      const between = candidate.parentElement?.closest(HOLDER);
      return !candidate.hasAttribute("data-doc-math-dollar")
        && !all.some((other) => other !== candidate && other.contains(candidate) && !other.hasAttribute("data-doc-math-dollar") && !(between && other.contains(between)));
    });
    return [...dollar, ...outermost];
  }

  // A formula KaTeX could not read is shown as the page editor shows one (styles/math.css: 无效的公式, a
  // chip in the text, a bar for a formula block), not as KaTeX's red TeX: its error (.katex-error, its
  // reason the title), and a formula it drew with a command it does not know in red that a strict reading
  // refuses too (the editor's test, page/tex.mjs unread; a formula colored that red itself reads). Each is
  // KaTeX's error span, its TeX kept in it unseen (gallery qa's formula-error quotes it), marked so.
  const INVALID = "doc-math-invalid";
  const RED = '.katex-html [style*="204, 0, 0"]';
  function refusal(tex, displayMode, macros) {
    try {
      global.katex.renderToString(tex, { displayMode, throwOnError: true, strict: "ignore", trust: false, macros: { ...macros } });
      return null;
    } catch (error) {
      return String(error); // "ParseError: KaTeX parse error: …", as KaTeX titles its own
    }
  }
  function markInvalid(error, tex, reason) {
    error.classList.add(INVALID);
    error.removeAttribute("style"); // KaTeX's red
    if (reason) error.setAttribute("title", reason);
    const source = document.createElement("span");
    source.className = "doc-math-tex";
    source.textContent = tex;
    error.replaceChildren(source);
  }
  function markInvalidIn(target, macros) {
    // The target's own formulas: none an instance in it drew (its slots are targets of their own).
    const own = (node) => {
      const instance = node.closest(HOLDER);
      return !instance || instance.contains(target);
    };
    for (const error of target.querySelectorAll(`.katex-error:not(.${INVALID})`)) if (own(error)) markInvalid(error, error.textContent, null);
    for (const drawn of target.querySelectorAll(".katex")) {
      const tex = own(drawn) && drawn.querySelector(RED) ? drawn.querySelector('.katex-mathml annotation[encoding="application/x-tex"]')?.textContent : null;
      const display = Boolean(drawn.parentElement?.classList.contains("katex-display"));
      const reason = tex == null ? null : refusal(tex, display, macros);
      if (!reason) continue;
      const error = document.createElement("span");
      error.className = "katex-error";
      (display ? drawn.parentElement : drawn).replaceWith(error);
      markInvalid(error, tex, reason);
    }
    // A formula of an element of its own (the editor's way: a formula in the text, a formula block) that KaTeX
    // left as written, finding no end to it (a brace it does not close: \(\frac{\)): the same, its TeX as typed.
    for (const host of target.querySelectorAll(".doc-math-inline, .doc-math-block")) {
      if (!own(host) || host.querySelector(".katex, .katex-error")) continue;
      const display = host.classList.contains("doc-math-block");
      const tex = (display ? /^\s*(?:\\\[([\s\S]*)\\\]|\$\$([\s\S]*)\$\$)\s*$/ : /^\s*\\\(([\s\S]*)\\\)\s*$/).exec(host.textContent)?.slice(1).find((part) => part !== undefined);
      const reason = tex?.trim() ? refusal(tex, display, macros) : null;
      if (!reason) continue;
      const error = document.createElement("span");
      error.className = "katex-error";
      host.replaceChildren(error);
      markInvalid(error, tex, reason);
    }
  }

  function render(root = document) {
    if (typeof global.renderMathInElement !== "function") {
      throw new Error("DocMath requires KaTeX and its auto-render extension.");
    }
    const instances = [...(root.querySelectorAll?.(INSTANCE) ?? [])];
    instances.forEach((instance) => instance.classList.add(SKIPPED));
    for (const target of targetsWithin(root)) {
      const delimiters = [
        { left: "$$", right: "$$", display: true },
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false },
      ];
      if (target.hasAttribute("data-doc-math-dollar")) {
        delimiters.push({ left: "$", right: "$", display: false });
      }
      const macros = { ...MACROS }; // a copy: \gdef and \DeclareMathOperator write into it
      global.renderMathInElement(target, {
        delimiters,
        throwOnError: false,
        strict: "warn",
        trust: false,
        macros,
        ignoredTags: [...MATH_IGNORED_TAGS],
        // A block of data (a database) holds no formula to draw: its cells are values, its drawing React's.
        ignoredClasses: ["katex", "katex-display", INVALID, SKIPPED, DATA_ONLY],
        errorCallback(message, error) {
          console.warn("[DocMath]", message, error);
        },
      });
      markInvalidIn(target, macros);
    }
    for (const instance of instances) {
      instance.classList.remove(SKIPPED);
      if (instance.classList.length === 0) instance.removeAttribute("class");
    }
  }

  global.DocMath = Object.freeze({ render, macros: MACROS });
  global.ReportMath = global.DocMath; // its old name (before 2026-10-26), for a script no tool rewrote (shared/old-names.mjs)
  // The kit's runtime (DocKit) renders the page's formulas once it has loaded; the formulas the
  // editor makes later are its own.
  if (!global.DocKit) throw new Error("DocMath requires /kit/runtime.js to be loaded first.");
  global.DocKit.component({ id: "math", selector: "body", added: false, mount() { render(); return null; } });
  // A formula held on one line with the closing marks after it (runtime/spacing.js) keeps nothing
  // to start; an export of the current view, or a copy of a card, lets the span go (untie).
  global.DocKit.component({ id: "math-tie", selector: ".doc-math-tie", added: false, mount: () => null, dehydrate: untie });
})(globalThis);
