import { atomSource, newAtom, ownHTML, serializeInner, setOwnHTML } from "../../page/core.mjs";
import { addStyle } from "../../page/ui.mjs";
import { capsFor } from "../registry.mjs";
import { isTex, texParts, texText } from "./index.mjs";
import { formulaSays, openFormulaPanel } from "../../page/formula/panel.mjs";
import { renderTex, unread } from "../../page/tex.mjs";

// 公式 on the page: a display formula is a text
// block of kind "tex" holding one chip, the kit's KaTeX, whose source is the block's text (core.mjs
// newAtom), so that what the commits and undo know of it is its TeX. The page shows it as the kit
// does; under the pointer it is tinted (radius 10), and a click opens the formula editor below it
// (formula/panel.mjs: its symbol bar, its field), the formula following what is typed. However the
// editor is left, what is in it is kept as one undo step (the block's text: its TeX between the
// delimiters it had, \[ \] for a new one). A new one (the "/" menu's 公式块) is empty, "添加一个 TeX
// 公式", its editor open; an empty one is written \[\] and stays, and so does one emptied:
// its chip holds no drawing then. TeX that does not read stays as typed, and its block is the gray bar
// of an empty one saying 无效的公式 (its chip, empty too, marked data-ge-empty="invalid"), as it is typed
// as well as once the editor is left (one look: KaTeX's reason is the box's), and as the kit shows it to a
// reader (styles/math.css).
// Nothing can be typed into the block itself, nor pasted. The keys pass over it as over a block with no
// text (caret.mjs: the arrows by places, the caret of a block deleted beside it and the browser's Tab by
// textNear). With the caret on it, Enter opens its editor, and any other key that types or edits, and
// an input method's composition on an empty one, select it and do nothing more (editor.mjs onKeydown:
// the next key is the selected block's, Backspace and Delete deleting it); a paste goes after it
// (clipboard/).

// An empty one's look (every empty block's gray bar, the block itself: served empty, then its chip
// empty) is served with the page: ../placeholder.mjs.
const STYLE = `
  /* The editor's tints are inset shadows over the block (as editor.mjs's over text in a component), never its background: what a block paints of its own
     says whether its fill is a box's (overlay-layer.mjs boxRadius), so a selected formula is filled as text whatever the pointer does, an empty one as its bar. */
  [data-ge-editing] .doc-math-block[data-ge-kind="tex"] { border-radius: 10px; cursor: pointer; caret-color: transparent; outline: none; box-shadow: inset 0 0 0 100vmax transparent; transition: box-shadow 20ms ease-in; }
  /* Not an empty one, whose bar has a hover of its own (placeholder.mjs), nor one whose box is open. */
  [data-ge-editing] .doc-math-block[data-ge-kind="tex"]:not([data-ge-math-edit], :has(> .ge-math-chip:empty)):hover { box-shadow: inset 0 0 0 100vmax var(--ge-hover); }
  /* The box open on a formula tints its block, over the bar of an empty one or of one that does not read
     (无效的公式, the same bar whether the box is open or not: placeholder.mjs; why, in the box: formula/panel.mjs). */
  [data-ge-editing] .doc-math-block[data-ge-math-edit] { box-shadow: inset 0 0 0 100vmax var(--ge-fill); }
  [data-ge-editing] .doc-math-block .ge-math-chip:empty { display: none; }
  [data-ge-editing] .doc-math-block .ge-math-chip { display: block; }
  [data-ge-editing] .doc-math-block .ge-math-message { color: var(--ge-tx2); font-size: 14px; }
  /* A formula in the text is one piece of it: plain as the page shows it, a light fill under the
     pointer, around all of it (chip-fills.mjs), the page's box open or not (not a formula block's chip,
     whose block takes the fill, nor an empty chip, gray already, nor a formula the report drew itself:
     data-ge-own). As heavy as a selected chip's fill there, which comes after it and goes over it. */
  [data-ge-editing] [data-ge-atom] .katex { border-radius: 4px; box-decoration-break: clone; }
  [data-ge-editing] [data-ge-atom]:not(.ge-math-chip, [data-ge-empty], [data-ge-own], [data-ge-formula-edit]):hover .katex { background: color-mix(in srgb, var(--doc-text, #000) 6%, transparent); }
`;
const style = () => addStyle(STYLE);


// The chip of a display formula: `nodes` shown, `source` written back.
const chipOf = (doc, source, nodes = []) => {
  const chip = newAtom(doc, source, nodes);
  chip.className = "ge-math-chip";
  return chip;
};

// What a chip shows for `tex`: KaTeX's display of it; nothing for none, or for TeX it does not read,
// which the chip says; KaTeX's message when KaTeX is not on the page yet (redraw).
function draw(chip, tex) {
  const { html, error } = tex ? renderTex(tex, true) : { html: "", error: null };
  chip.innerHTML = html;
  chip.toggleAttribute("data-ge-empty", false);
  if (!error) return;
  if (globalThis.katex) return chip.setAttribute("data-ge-empty", "invalid");
  const message = chip.ownerDocument.createElement("span");
  message.className = "ge-math-message";
  message.textContent = error;
  chip.append(message);
}

/**
 * A display formula of the file made ready for editing (editor.mjs enter): what the kit drew (or its
 * text, KaTeX missing) in one chip whose source is the block's text. Returns its baseline.
 */
export function prepareTex(node, block) {
  style();
  node.setAttribute("data-ge-kind", "tex");
  node.setAttribute("data-ge-caps", (block.caps ?? ["plain"]).join(" "));
  if (node.getAttribute("contenteditable") !== "true") node.setAttribute("contenteditable", "true"); // set ahead as the page opens (core.mjs editableAhead)
  node.setAttribute("spellcheck", "false");
  // An empty one (\[\]) shows "添加一个 TeX 公式", not what the kit drew of nothing.
  const tex = texParts(block.inner)?.tex.trim();
  const chip = chipOf(node.ownerDocument, block.inner, tex ? [...node.childNodes] : []);
  node.replaceChildren(chip);
  if (tex && unread(chip, tex, true)) draw(chip, tex);
  return serializeInner(node);
}

/** A new display formula of `tex` (empty: "添加一个 TeX 公式", written \[\]). */
export function newMath(doc, tex = "") {
  style();
  const block = doc.createElement("div");
  block.className = "doc-math-block";
  for (const [name, value] of [["contenteditable", "true"], ["data-ge-new", ""], ["data-ge-type", "math"], ["data-ge-unit-kind", "math"], ["data-ge-kind", "tex"], ["data-ge-caps", capsFor("tex")], ["spellcheck", "false"]]) block.setAttribute(name, value);
  const chip = chipOf(doc, `\\[${texText(tex.trim())}\\]`);
  draw(chip, tex.trim());
  block.append(chip);
  return block;
}

/** A formula block made again from the clipboard's description (its type's `build`, builders.mjs). */
export function build({ doc, block }) {
  return newMath(doc, block.tex.trim());
}

/**
 * A formula block standing for a block (its type's `create`), that block's text the formula; made
 * of an empty block, empty: its formula is typed next.
 */
export const make = ({ doc, text, put }) => put(newMath(doc, text.trim()));

/**
 * Editing display formulas, with what the editor gives it: recordText(host) (one undo step),
 * active() (the page edits), loadKatex(), say (the status line), closeTools() (what a press closes
 * that opens over the page: the format bar, the "/" menu, the formula box).
 */
export function create({ recordText, active, loadKatex, say, closeTools }) {
  style();
  let open = null; // { host, panel, before, parts }

  const texHost = (target) => {
    const host = target?.closest?.('.doc-math-block[data-ge-kind="tex"]');
    return host && active() && host.closest("main") && !host.closest("[data-ge-lock]") ? host : null;
  };
  // A press on one edits it (`press`); a press puts no caret in it, and nothing is typed into it.
  document.addEventListener("mousedown", (event) => {
    if (event.button === 0 && texHost(event.target)) event.preventDefault();
  }, true);
  document.addEventListener("beforeinput", (event) => {
    if (isTex(event.target?.closest?.("[contenteditable]"))) event.preventDefault();
  }, true);

  // The formula in the block follows the field: drawn, or the bar it is once the box is left (an empty
  // one's, or 无效的公式's: the same bar, open or not, so nothing moves as the box closes).
  function preview(host, tex, error) {
    const chip = host.querySelector(":scope > .ge-math-chip");
    draw(chip ?? host.appendChild(chipOf(host.ownerDocument, "")), tex.trim());
    host.setAttribute("data-ge-math-edit", error ? "invalid" : "");
  }

  function finish(value) {
    if (!open) return;
    const { host, before, parts } = open;
    open = null;
    host.removeAttribute("data-ge-math-edit");
    if (!host.isConnected) return;
    const tex = value.trim();
    if (tex === parts.tex.trim()) {
      setOwnHTML(host, before);
      return;
    }
    // Emptied, it stays an empty one (its delimiters, nothing drawn).
    const chip = chipOf(host.ownerDocument, `${parts.open}${texText(tex, parts.close)}${parts.close}`);
    draw(chip, tex);
    host.replaceChildren(chip);
    recordText(host, true);
    say(formulaSays.kept(tex, Boolean(parts.tex)));
  }

  /** Open the formula editor below a display formula. */
  async function edit(host) {
    if (open?.host === host) return open.panel.focus();
    dismiss();
    if (!(await loadKatex())) return say(formulaSays.unloaded(false), "error");
    if (!host.isConnected) return;
    const chip = host.querySelector(":scope > .ge-math-chip");
    const parts = chip ? texParts(atomSource(chip)) : { open: "\\[", tex: "", close: "\\]" };
    if (!parts) return say(formulaSays.peculiar);
    open = { host, before: ownHTML(host), parts };
    host.setAttribute("data-ge-math-edit", "");
    open.panel = openFormulaPanel({
      value: parts.tex, display: true, center: true, anchor: () => host.getBoundingClientRect(),
      onInput: (tex, error) => open?.host === host && preview(host, tex, error),
      onSubmit: finish, say,
    });
  }

  /**
   * Display formulas made while KaTeX was not on the page (a group of text blocks turned into them,
   * each one's text its formula), drawn once it is: what they show, not what the file holds.
   */
  async function redraw(hosts) {
    const missing = hosts.filter((host) => isTex(host) && host.querySelector(":scope > .ge-math-chip .ge-math-message"));
    if (missing.length === 0 || !(await loadKatex())) return;
    for (const host of missing) {
      const chip = host.isConnected ? host.querySelector(":scope > .ge-math-chip") : null;
      const tex = chip ? texParts(atomSource(chip))?.tex.trim() : "";
      if (tex) draw(chip, tex);
    }
  }

  /** What follows a new formula block: its editor opens. */
  function onCreated(host) {
    edit(host);
    return true;
  }

  /** Enter on one selected: its editor opens. */
  function activate(host) {
    if (isTex(host)) edit(host);
    return isTex(host);
  }

  /** The editor left from outside it (a press elsewhere, the page saved or left): what is in it is kept. */
  function dismiss() {
    if (!open) return;
    const { panel } = open;
    panel.close();
    finish(panel.value);
  }

  /**
   * A press on a display formula (`press`): it goes into the formula editor (a Shift press does not).
   * True when the press was its.
   */
  function press(event) {
    const host = event.shiftKey ? null : texHost(event.target);
    if (!host) return false;
    event.preventDefault();
    closeTools();
    edit(host);
    return true;
  }

  return {
    create: make, onCreated, activate, redraw, dismiss, press,
    prepare: (block, node) => prepareTex(node, block),
    /** What a formula block needs on the page: KaTeX, the promise of its coming, or null when it is there. */
    preload: () => (globalThis.katex ? null : loadKatex()),
    get panel() { return open?.panel.node ?? null; },
    /** Whether a node is its editor's, or the formula being edited: a press there ends nothing. */
    holds: (node) => Boolean(open) && (open.panel.node.contains(node) || open.host.contains(node)),
  };
}
