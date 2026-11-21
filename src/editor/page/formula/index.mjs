import { can, formulaParts, limitText, newFormula, ownHTML, setOwnHTML } from "../core.mjs";
import { editable, select } from "../caret.mjs";
import { chipBox, fillEdited } from "../chip-fills.mjs";
import { rangeOffsets } from "../marks.mjs";
import { spaceAround } from "../../../shared/inline-spacing.mjs";
import { addStyle, element, loadScript } from "../ui.mjs";
import { markEmpty } from "../../components/placeholder.mjs";
import { takesFormula } from "../../components/registry.mjs";
import { renderTex } from "../tex.mjs";
import { formulaSays, openFormulaPanel } from "./panel.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// Inline formulas (docs/editor.md, "Inline formatting"): the format bar's √x button
// or Ctrl+Shift+E turns the selected text into a formula at once (its TeX: the text, without the
// $…$ or \( \) around it), and a click on a formula edits it; either way the formula box opens
// below the formula, a field holding its TeX, the formula in the text following what is typed
// (tinted while it is edited; "√x 新公式" when empty, "√x 无效的公式" with KaTeX's reason below the
// field when it cannot be read; the editor and its symbol bar: panel.mjs). However the box is left
// (Ctrl+Enter, Enter with all of the field selected, Enter itself being a new line, Esc, a press
// elsewhere, Ctrl+S, the page left) what is in it is kept as one undo step, the caret after it. TeX
// that does not read stays a formula of the file, as typed, for it may be a stage on the way: a gray "√x 无效的公式" on the page,
// which a click opens with its words, the same chip while its box is open and to a reader (the kit's styles/math.css). A formula left empty stays, as an
// empty block does: the "/" menu's 公式 given nothing, or a formula emptied, is \(\) in the file, a gray
// "√x 新公式" on the page (core.mjs data-ge-empty, components/placeholder.mjs), a whole as a character
// is, shown to no reader; a click on it edits it. The formula is a chip like the report's own (core.mjs
// newFormula), written as the kit's .doc-math-inline, a formula of the file keeping its own tags. Nothing
// is committed while the box is open (the editor's autosave waits: formulaBoxNode). The page's KaTeX
// (the kit's) renders it; a report without formulas is served without KaTeX, so the box loads it the
// first time. connectFormula() gives the box what it needs from the editor.

const STYLE = `
  /* The formula being edited, in the text: all of it (chip-fills.mjs). */
  [data-ge-editing] [data-ge-formula-edit=""] { cursor: pointer; }
  [data-ge-editing] [data-ge-formula-edit=""] .katex { background: var(--ge-fill); }
  /* Empty, or not read: a chip, served with the page (components/placeholder.mjs). */
  [data-ge-editing] .doc-math-inline[data-ge-atom] { cursor: pointer; }
`;

// A formula of the text (a chip of the page: core.mjs; not a link shown with its icon, links/).
const FORMULA = ".doc-math-inline[data-ge-atom]";

let use = null; // { say, recordStep, active }
let box = null; // { panel, host, chip, parts, before, original }

export function connectFormula(editor) {
  use = editor;
  addStyle(STYLE);
  // A click on a formula in the text edits it (a press there puts no caret anywhere).
  const formulaAt = (target) => {
    const chip = use.active() ? target?.closest?.(FORMULA) : null;
    const host = chip && editable(chip.parentElement);
    return host && !can(host, "plain") && takesFormula(host) && main(chip) ? chip : null;
  };
  document.addEventListener("mousedown", (event) => {
    if (event.button === 0 && !event.shiftKey && formulaAt(event.target)) event.preventDefault();
  }, true);
  document.addEventListener("click", (event) => {
    const chip = event.shiftKey ? null : formulaAt(event.target);
    if (!chip || chip.hasAttribute("data-ge-formula-edit")) return;
    event.preventDefault();
    editFormula(chip);
  }, true);
}

const main = (node) => Boolean(node.closest("main"));
const katex = () => globalThis.katex ?? null;
// The dev server's KaTeX (src/render/assets.mjs), for a page served without it, and KaTeX's mhchem
// (\ce, \pu: the symbol bar's 化学), which the kit's math.js bundles, for a page served without that.
const KATEX = { script: "/vendor/katex/katex.min.js", style: "/vendor/katex/katex.min.css", chemistry: "/__gallery/edit/mhchem.js" };

// Whether the page's KaTeX reads \ce (mhchem's).
const readsChemistry = () => {
  try {
    katex().renderToString("\\ce{H}", { throwOnError: true });
    return true;
  } catch {
    return false;
  }
};

// mhchem on the page's KaTeX (once it is there): true once it reads \ce, false when it cannot be had.
const loadChemistry = () => loadScript(KATEX.chemistry, readsChemistry);

/**
 * Inline formulas pasted as the page's own: (tex) => a formula chip drawn by KaTeX (null when its TeX
 * does not render), or null while KaTeX is not on the page (loadKatex). The clipboard's (blocks,
 * text) and a table's cells' (table/cells.mjs) pastes.
 */
export function formulaMaker() {
  if (!globalThis.katex) return null;
  return (tex) => {
    const { html, error } = renderTex(tex);
    return error ? null : newFormula(document, tex, html);
  };
}

// KaTeX on the page, with mhchem: true once it is there, false when it cannot be loaded (formulas pasted too: clipboard/).
export async function loadKatex() {
  if (!(await loadMath())) return false;
  await loadChemistry();
  return true;
}

const loadMath = () => loadScript(KATEX.script, katex, {
  before: () => {
    if (!document.querySelector('link[data-doc-vendor="katex-styles"]')) document.head.append(element("link", { rel: "stylesheet", href: KATEX.style, "data-doc-dev": "" }));
  },
});

// The selected text as TeX: \( \) or up to two layers of $…$ around it are the formula's delimiters.
function texOf(text) {
  let tex = text.trim();
  const wrapped = tex.match(/^\\\(([\s\S]*)\\\)$/);
  if (wrapped) return wrapped[1].trim();
  for (let layer = 0; layer < 2 && tex.length > 1 && tex.startsWith("$") && tex.endsWith("$"); layer++) tex = tex.slice(1, -1).trim();
  return tex;
}

// Inline elements a replaced selection left empty go (a formula chip and its insides stay).
function dropEmpty(host) {
  for (const node of [...host.querySelectorAll("strong, em, u, s, code, a, sup, sub, span")].reverse()) {
    if (node.closest("[data-ge-atom]") || node.hasAttribute("data-ge-atom")) continue;
    if (!node.textContent && !node.querySelector("br, [data-ge-atom]")) node.remove();
  }
}

// The formula in the text follows the field: rendered, or a chip: √x 新公式 (an empty one's) or
// √x 无效的公式 (components/placeholder.mjs), the same chip as it is once the box is left, tinted
// as an empty one is while its box is open (KaTeX's reason is the box's).
function refresh(value) {
  const tex = value.trim();
  const { html, error } = tex ? renderTex(tex) : {};
  if (!tex || error) markEmpty(box.chip, tex ? "invalid" : "formula");
  else {
    box.chip.removeAttribute("data-ge-empty");
    box.chip.innerHTML = html;
  }
  box.chip.setAttribute("data-ge-formula-edit", !tex ? "empty" : error ? "invalid" : "");
  fillEdited(box.chip);
}

// The caret right after `node`.
function caretAfter(host, node) {
  const after = document.createRange();
  after.setStartAfter(node);
  after.collapse(true);
  host.focus({ preventScroll: true });
  select(after);
  return after;
}

/** The box left from outside it (a press elsewhere, the page saved or left): what is in it is kept. */
export function dismissFormula() {
  if (box) submit(box.panel.value);
}

// Keep the formula as one undo step, the caret after it.
function submit(value) {
  const tex = value.trim();
  const { html, error } = tex ? renderTex(tex) : {};
  const { panel, host, chip, parts, before, original } = box;
  panel.close();
  box = null;
  fillEdited(null);
  if (!host.isConnected) return;
  if (tex === original) { // a formula of the text, unchanged
    setOwnHTML(host, before);
    const same = [...host.querySelectorAll("[data-ge-atom]")].find((each) => each.getAttribute("data-ge-atom") === chip.getAttribute("data-ge-atom"));
    if (same) caretAfter(host, same);
    return;
  }
  // A formula stands a space apart from the words beside it (shared/inline-spacing.mjs spaceAround), the caret going
  // on after it, past the space put there; one left empty (\(\), its gray chip) stands as it is.
  const formula = newFormula(document, tex, html, parts);
  if (error) markEmpty(formula, "invalid");
  chip.replaceWith(formula);
  const { after } = tex ? spaceAround(formula) : {};
  const caret = caretAfter(host, after ?? formula);
  dropEmpty(host);
  use.recordStep(host, before, rangeOffsets(host, caret));
  if (tex || original) use.say(formulaSays.kept(tex, original !== null));
}

// The editor below `chip` (in `host`, whose HTML was `before`), holding `tex`.
function openBox(host, chip, { before, tex, parts, original }) {
  box = { host, chip, parts, before, original };
  box.panel = openFormulaPanel({
    value: tex, anchor: () => chipBox(chip),
    onInput: (value) => box?.chip === chip && refresh(value),
    onSubmit: (value) => { if (box?.chip === chip) submit(value); },
    say: (...said) => use.say(...said),
  });
}

/**
 * Turn the text selected in `host` into a formula (one there already: edit it); `fresh` (the "/"
 * menu's 公式): a new, empty one at the caret, its field open for what is pasted or typed.
 */
export async function openFormula(host, { fresh = false } = {}) {
  if (can(host, "plain")) return use.say(limitText(host, "format"));
  if (!takesFormula(host)) return use.say(limitText(host, "formula"));
  const selection = getSelection();
  const range = selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  if (!range || (range.collapsed && !fresh) || !host.contains(range.commonAncestorContainer)) return use.say(t("先选中要变成公式的文字。"));
  const inside = range.cloneContents().querySelector(FORMULA);
  if (inside) {
    const chip = [...host.querySelectorAll(FORMULA)].find((each) => range.intersectsNode(each));
    return chip ? editFormula(chip) : undefined;
  }
  const around = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
  const code = around.closest("code");
  if (code && host.contains(code)) return use.say(t("行内代码里不能放公式。"));
  if (!(await loadKatex())) return use.say(formulaSays.unloaded(true), "error");
  if (!host.isConnected) return;
  dismissFormula();
  const before = ownHTML(host);
  const tex = texOf(range.toString());
  range.deleteContents();
  const chip = newFormula(document, tex || "x", "", null); // its source is set when it is kept
  range.insertNode(chip);
  dropEmpty(host);
  openBox(host, chip, { before, tex, parts: null, original: null });
}

/** Edit a formula of the text (a click on it). */
export async function editFormula(chip) {
  const host = editable(chip.parentElement);
  if (!host) return;
  const parts = formulaParts(chip);
  if (!parts) return use.say(formulaSays.peculiar);
  if (!(await loadKatex())) return use.say(formulaSays.unloaded(false), "error");
  dismissFormula();
  if (!chip.isConnected) return;
  openBox(host, chip, { before: ownHTML(host), tex: parts.tex, parts, original: parts.tex });
}

/** The open formula box, if any (the editor's UI moves it into an open dialog; commits wait while it is). */
export const formulaBoxNode = () => box?.panel.node ?? null;
