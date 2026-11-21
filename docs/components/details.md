# Disclosures

A disclosure is a container block (容器块): in the preview the reader edits its title and the blocks in it, and moves, deletes and copies it.

Write the native disclosure element: its blocks fold under a title the reader clicks to open. The summary names what it holds, for example “查看完整评测 Case”, not “更多”.

<!-- you write -->
```html
<details>
  <summary>查看字段 <code>Location</code> 的完整评测 Case</summary>
  <p>The complete question, answer, trace, and analysis.</p>
</details>
```

The export (or the reader's first edit) puts the summary's words, inline code included, in one `.doc-details-summary-label`, which keeps them in one title column beside the marker, and the rest in `.doc-details-content`; the file then holds:

<!-- the file then holds -->
```html
<details class="doc-details">
  <summary><span class="doc-details-summary-label">查看字段 <code>Location</code> 的完整评测 Case</span></summary>
  <div class="doc-details-content">
    <p>The complete question, answer, trace, and analysis.</p>
  </div>
</details>
```

Content inside follows the same prose, code, and table rules as outside. Do not wrap disclosures in extra bordered cards or add a second decorative icon. A long code sample on its own can be a folded code block instead ([code.md](code.md)). To remember whether one is open, bind it to a key ([state.md](state.md)): `<details data-doc-bind="caseOpen">`.
