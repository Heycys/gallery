# Detail cards

A detail card is a container block (容器块): in the preview it is an ordinary editing area, the reader edits the blocks in it as on the page.

The modal detail card is a general overlay container. The Agent decides whether it fits the material and what content belongs inside; the component does not prescribe a content category. When a dataset, model, metric, or other term in the text opens it, write that term as a link to the dialog, `<a class="doc-dialog-trigger" href="#dialog-id">`: the shared script opens the dialog instead of jumping to it, and the paragraph stays ordinary text that the reader can edit in the preview. When the trigger is a separate action, use a `.doc-button` with `data-doc-dialog-open="#dialog-id"`.

<!-- the file holds -->
```html
<p>Dataset <a class="doc-dialog-trigger" href="#detail-dialog">Atlas-Bench</a></p>
<button class="doc-button" type="button" data-doc-dialog-open="#detail-dialog">查看详情</button>

<dialog class="doc-dialog" id="detail-dialog">
  <div class="doc-dialog-panel">
    <div class="doc-dialog-content">
      <h3>详情标题</h3>
      <p>Place ordinary report prose, tables, code, or formulas here.</p>
    </div>
  </div>
</dialog>
```

Written the short way, `<dialog id="detail-dialog"><h3>详情标题</h3><p>…</p></dialog>` with a plain `<a href="#detail-dialog">`, it is made this markup by naturalize (`src/editor/source/natural.mjs`), as the example document writes it (a first `<h2>` is made an `<h3>`; a card with no heading starts with its blocks, or is words alone). A file written before the card lost its header is read as this markup in the same way, silently, and takes it at its first edit or export.

The entry reads as a small button in the text: a rounded light fill around the words, which keep the text's color, and a small open icon after them (the kit draws it; write only the link), which a line never breaks from the last word. The card comes up over a dimmed page and holds nothing but its blocks: no title bar, no line and no close button. It is a little smaller than Gallery's settings dialog 写作偏好: 760px wide and 80% of the window high (at most 760px), centred whatever it holds (in Gallery's workbench in the middle of the whole window, the sidebar and the top bar dimmed with the page), its text the reading width in the middle of it; what is taller scrolls inside `.doc-dialog-content`. Escape and a press outside it close it (a tap above or below it on a phone), and focus returns to the trigger; no script is needed. The heading first in it is an ordinary block, which may be deleted, moved or turned into another: nothing binds it, so give it no id and the dialog no `aria-labelledby`. A screen reader and a page's Markdown call the card by its first heading, else by the words that open it. `gallery check` fails a card without its content. `data-doc-dialog-open` also works on any other accessible interactive element; a button inside a paragraph keeps that paragraph read-only in the preview, so do not use one for a term in the text. Do not add a second overlay or a report-specific outside-click handler.
