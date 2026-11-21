# Formulas

A formula block is a basic block (基础块); in the preview the reader edits it, and the inline formulas in text, on the page.

Write formulas as LaTeX: `\(...\)` in a sentence and `\[...\]` (or `$$...$$`) as a paragraph of its own. The bundled KaTeX draws them in every flow (the page, Sheet panels, sections, the summary and highlight panels, disclosures and dialogs, columns); do not hand-write MathML or load a remote math library.

<!-- you write -->
```html
<p>The change is \(\Delta = S_n - S_b\).</p>
<p>\[x=\frac{a}{b}\]</p>
```

The export (or the reader's first edit) puts each in the kit's wrapper, which lets a display formula scroll on a narrow screen; the file then holds:

<!-- the file then holds -->
```html
<p>The change is <span class="doc-math-inline">\(\Delta = S_n - S_b\)</span>.</p>
<div class="doc-math-block">\[x=\frac{a}{b}\]</div>
```

- Keep a display formula out of a sentence: there the reader cannot edit the words around it.
- Single dollars are not formula delimiters, because documents often hold currency such as `$1.84`; `$…$` holding `\`, `^` or `_` fails the checks. To allow them in one container, add `data-doc-math-dollar` to it (or to a `[data-doc-math]` element).
