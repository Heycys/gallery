# Files

A file (文件) is a card block (卡片块): one file the reader saves, as a row with its name and size, and its caption under it. In the preview the reader replaces it, edits its caption, and moves, deletes and copies it. Use it for material the reader takes away whole (the raw data, a full log, a slide deck); show what matters of it in the document itself.

<!-- the file holds -->
```html
<figure class="doc-file">
  <a class="doc-file-link" href="assets/file-results.csv" download="评测结果.csv"><span class="doc-file-name">评测结果.csv</span><span class="doc-file-size">12.1 KiB</span></a>
  <figcaption>三个数据集的题数与准确率</figcaption>
</figure>
```

- The file is a file of the document's own folder, `<workspace>/<slug>/assets/<file>`, written `assets/<file>`; `download` gives the name it is saved as. An export embeds it, so the one file holds it: keep files small. A link in the text to a file of the folder (`<a href="assets/<file>">`) is embedded too, with the file's name to save it by when it gives no `download`; only a file block shows the name, size and caption as a row. `gallery check` fails a file from elsewhere (a web address), one not in the folder, and a link with no `download`.
- The link holds the file's name (`.doc-file-name`) and, optionally, its size (`.doc-file-size`, as `12.1 KiB`). The caption is always written: `<figcaption></figcaption>` when there is none (it shows only with text). Nothing else goes in the figure.
