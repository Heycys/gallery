# Images

An image (图片) is a card block (卡片块): one picture and its caption under it. In the preview the reader replaces, crops, aligns and resizes it, edits its caption, and moves, deletes and copies it. Use it for what only a picture shows (a screenshot of the product, a photo of the setup, a diagram the materials came with); draw data as a chart instead ([custom-chart.md](custom-chart.md)).

The picture is a file of the document's own folder, `<workspace>/<slug>/assets/<file>` (png, jpg, gif, webp, avif or svg), written `assets/<file>`; an export embeds it, as it embeds a picture of the folder anywhere else (in a table cell, in a link, a CSS background), but only an image block is one the reader moves, sizes and captions in the preview. Write it on a line of its own, or in a figure with its caption:

<!-- you write -->
```html
<figure>
  <img src="assets/image-setup.png" alt="测试环境的接线照片">
  <figcaption>测试环境：两台服务器与交换机的接线</figcaption>
</figure>
```

The export (or the reader's first edit) makes it the kit's image block, its caption always written (`<figcaption></figcaption>` when there is none, shown only with text); the file then holds:

<!-- the file then holds -->
```html
<figure class="doc-image">
  <img src="assets/image-setup.png" alt="测试环境的接线照片">
  <figcaption>测试环境：两台服务器与交换机的接线</figcaption>
</figure>
```

- Write what the picture shows in `alt`. Nothing but the picture and its caption goes in the figure. `gallery check` fails a picture from elsewhere (a web address) and one not in the folder.
- Without a width the picture shows at its own size, at most the reading width (or its column's) and at most 80% of the window's height (a tall scan or screenshot shows whole, its width following), centered. `--doc-span` in the style attribute gives it a share of the reading width (`.5` is half), at most the width it stands in, however tall that makes it: moved into a column, a picture keeps its size, never wider than the column. `<img width="360">` is taken in as that share of the 712px reading width (360/712) wherever the picture stands, `width="50%"` as half the width it stands in (in a column, half the column). The share holds on a narrow page too (`width="300"`, 0.42, is 141px of a phone's 336px): a picture whose words the reader must read takes no width (writing-html.md says so to Agents; the skill test of 2026-10-29). `doc-image--left` or `doc-image--right` puts it at that side.
- A reader's click opens the picture large over the page, its caption under it (the kit's viewer: [render.md](../render.md), "Opening a picture large"), and so does a click on any other picture of the page shown at least 48px across or down: in a table cell, a card of the document's own, a column, a flowchart's node. Nothing is written for it. A picture inside a link follows the link, and an icon (`.doc-icon`) opens nothing.
- A picture the reader cropped says the picture it was cut from and what of it is kept (`data-original="assets/…"`, `data-crop="x y width height"`, in % of that picture); keep both as they are, and the original in the document's folder.
