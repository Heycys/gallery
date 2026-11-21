import { escapeText, unescapeText } from "../../../shared/escape.mjs";
import { svg } from "../icons.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { plainRow, rowOf } from "../read-rows.mjs";

// 公式: a display formula (.doc-math-block, a 公式块), its TeX between \[ \] (or $$ $$)
// as its only content. One block, and a text block of kind "tex" of its own: the page shows the
// kit's KaTeX as one chip whose source is that text (core.mjs newAtom), a click opens the formula
// editor below it (page.mjs), what is kept is one undo step and goes to the file as the block's new
// text. One with anything but its TeX in it (markup, a script's) stays as it is. Inline formulas in
// text are not blocks: they are chips the text model keeps (core.mjs prepareBlock, serializeNode,
// pastedLines; caret.mjs and marks.mjs step over them).
// page.mjs: the block on the page (a new one, its chip, editing it); the server writes a new one as it
// writes any text block, checking its TeX (source/checks.mjs, texSource).
//
// Where the engines reach it (src/editor/page/ unless named): convert.mjs (a block turned into one, its
// text the formula, a new block in its place as the server takes no text block turned into one:
// page.mjs `create`), editor.mjs (what follows a new one: `onCreated`; Enter on one selected:
// `activate`; a press on it: `press`; `preload`: a conversion comes after KaTeX; `redraw`: a group
// turned before it came; a key or a composition with the caret on it selects it, and the browser's Tab
// passes over it, by its host's `tex`), caret.mjs and typing/ (the arrows pass over it, `places`, and
// so does the caret of a block deleted beside it, `textNear`, by its host's `tex`), type-grid.mjs
// (`preload`), clipboard/ (copying it: `clipboard`, and `build` in page.mjs; a paste with the caret on
// it goes after it, by its host's `tex`), core.mjs (its chip).
// Its look: the kit's styles/math.css, rendered by math.js (src/render/kit/).
export const ICON = svg('<path d="M14.5 5.75v-1.5h-9l5 5.75-5 5.75h9v-1.5"/>');

/**
 * Whether a display formula's text is its TeX alone, between \[ \] or $$ $$ (entities allowed, no
 * tags); \[\] is an empty one (made on the page and left so: it stays).
 */
export function texSource(text) {
  if (typeof text !== "string" || /[<>]/.test(text)) return false;
  const match = /^\s*(?:\\\[([\s\S]*)\\\]|\$\$([\s\S]*)\$\$)\s*$/.exec(text);
  const body = match?.[1] ?? match?.[2];
  return body !== undefined && !(match[1] !== undefined ? body.includes("\\]") : body.includes("$$"));
}

/** Whether a text block is a display formula. */
export const isTex = (host) => host?.getAttribute?.("data-ge-kind") === "tex";

/** A display formula's source in parts: what comes before its TeX ("\[" and spaces), its TeX, what comes after. */
export function texParts(source) {
  const match = /^(\s*\\\[\s*)([\s\S]*?)(\s*\\\]\s*)$/.exec(source ?? "") ?? /^(\s*\$\$\s*)([\s\S]*?)(\s*\$\$\s*)$/.exec(source ?? "");
  return match ? { open: match[1], tex: unescapeText(match[2]), close: match[3] } : null;
}

/**
 * TeX as it stands between a display formula's delimiters (`close`, as texParts gives it): one that
 * holds the closing delimiter, which KaTeX reads in no formula, has its last character as an entity,
 * so that the text is still one formula (texSource), for what is typed is kept even so.
 */
export const texText = (tex, close = "\\]") => escapeText(tex).replaceAll(close.trim(), (end) => `${end.slice(0, -1)}&#${end.charCodeAt(1)};`);

// A formula block's TeX, its delimiters taken off.
const blockTex = (element) => /^\s*\\\[([\s\S]*)\\\]\s*$/.exec(element.textContent)?.[1]?.trim() ?? element.textContent.trim();

export default {
  name: "math",
  listed: () => t("公式块"),
  glance: { row: 8, name: "a formula in a line", write: "`\\(…\\)`", rule: "Text and lists" },
  readOnly: [{ rank: 50, at: ".doc-math-block, .katex-display", says: t("行间公式暂不能在页面上修改。") }],
  units: {
    math: {
      name: t("公式"), icon: ICON, match: [{ rank: 120, class: "doc-math-block" }], boxed: true,
      // gallery read (../read-rows.mjs): its TeX between $ and $.
      read: {
        name: "公式块",
        rows(node, { tools }) {
          const tex = blockTex(node.el);
          return [rowOf(node, "$$"), ...tex.split("\n").map(plainRow), plainRow(`$$${tools.looks(node.el)}`)];
        },
        words: (node, { tools }) => [tools.texWords(blockTex(node.el))],
        data: (node) => ({ tex: blockTex(node.el) }),
      },
    },
  },
  components: ["doc-math-block"],
  hosts: {
    tex: { name: t("公式"), caps: () => ["plain"], tex: true }, // its TeX, changed only through the formula editor
  },
  types: {
    math: {
      turn: 15, menu: ["advanced", 22], fresh: 7,
      tag: "div", className: "doc-math-block", kind: "math", tex: true,
      preload: true, // KaTeX (page.mjs): a block turned into one draws its text as the formula at once, what undo and redo put back
      // Its TeX as the block keeps it (none: an empty one); its page.mjs makes it again.
      clipboard: {
        kind: "equation",
        read: (unit, { serializeInner }) => ({ tex: texParts(serializeInner(unit))?.tex.trim() ?? "" }),
        describe(node, { serializeInner }) {
          if (!isTex(node)) return undefined;
          const parts = texParts(serializeInner(node));
          return parts ? { type: "math", tex: parts.tex.trim() } : null;
        },
        check: (block, { string }) => string(block.tex, 20000), // empty: an empty formula block
        text: (block) => [`<span class="doc-math-inline">\\(${escapeText(block.tex)}\\)</span>`],
      },
      label: t("公式块"), icon: ICON,
      words: "公式块 公式 数学 方程 行间公式 gongshikuai gongshi gsk hjgs shuxue fangcheng latex tex equation math formula block",
      glance: { row: 8, name: "公式块", write: "`<p>\\[…\\]</p>`", rule: "Text and lists" },
    },
  },
};
