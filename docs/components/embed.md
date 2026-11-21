# Embeds

An embed (嵌入) is a card block (卡片块): a web page, or an HTML or PDF file of the document's folder, shown in a frame on the page, and its caption under it. In the preview the reader replaces and resizes it, edits its caption, and moves, deletes and copies it. Use it for something the reader works with in place (a small calculator, a dashboard, a document to page through); keep what the document concludes in its own text.

<!-- the file holds -->
```html
<figure class="doc-embed doc-embed--file" style="--doc-embed-height: 480px">
  <iframe class="doc-embed-frame" src="assets/embed-calculator.html" sandbox="allow-scripts allow-popups allow-forms allow-modals" loading="lazy"></iframe>
  <figcaption>拖动滑块，样本量跟着变</figcaption>
</figure>
```

- A web page is `src="https://…"` (never http) with a `sandbox` attribute; it stays on the web, so an export shows it only where the reader is online. A file is `src="assets/<file>.html"` or `.pdf`, a file of the document's own folder, which an export embeds: an HTML file with a `sandbox` that has no `allow-same-origin` (it never reaches the document), a PDF with none (the browser's own viewer). `gallery check` fails anything else, and a file not in the folder.
- `doc-embed--file` marks a file (a thin round border, 500px tall unless set). `--doc-embed-height` in the style attribute sets the frame's height (320px for a web page unless set).
- The caption is always written: `<figcaption></figcaption>` when there is none (it shows only with text). Nothing else goes in the figure.
