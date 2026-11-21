# Figure cards

A figure is a card block (卡片块): `figure.doc-figure`, framed by the kit, its title an `h3`, a scope or unit line `p.doc-figure-caption`. The reader moves, resizes, retitles and copies it; what it shows is the document's own: a chart of a type the document defines ([custom-chart.md](custom-chart.md)), or a drawing in HTML, CSS or SVG (a diagram, an architecture, a timeline). A layout that is no figure (a strip of metrics, a comparison panel, controls) is a whole block, not a card.

The reader's word for it is 图形 (Figure), since 2026-11-20 (卡片 before: the user's word, 卡片块要不就叫图形块；卡片 is a custom page's cards): the unit's `name` (`KIND_NAMES`), so the handle's hover, 整个图形 of Ctrl+A, the clipboard's and the resize notice's lines (图形宽度：半宽), the history's and the Agent changes' rows, its block menu's toasts (图形已居中显示), its title and caption's host (图形标题和说明), the preview's chart note (图形「<title>」：…) and `gallery read` (`图形 · 图表 <type>`). The code, its class, the category (卡片块, which the media blocks share) and the Skill's word (a card) are as they were, and no document or export holds the name.

## A figure

The card draws the frame and the surface once: draw no second outer box (a border, a background, a shadow) inside it. Classes of the document's own inside it are styled in the document's `<style>` with the kit's variables (`--doc-text`, `--doc-muted`, `--doc-border`, `--doc-surface`, `--doc-accent-soft`).

<!-- the file holds -->
```html
<figure class="doc-figure">
  <h3>分层结构</h3>
  <p class="doc-figure-caption">页面自己的 HTML 和 CSS</p>
  <div class="layers">
    <div class="layers-row"><p class="layers-name">报告</p><p class="layers-note">读者打开的页面</p></div>
    <div class="layers-row"><p class="layers-name">组件</p><p class="layers-note">表格、图表、卡片</p></div>
  </div>
</figure>
```

The words of a drawing are the reader's to fix in place: a `<p>`, a heading or an `<li>` inside it stays one, never split or merged with another.

## Drawings in SVG

- Give each figure's `<defs>` ids a prefix of its own (`<marker id="flow-arrow">` in one figure, `<marker id="steps-arrow">` in the next): two figures with the same id fail the check of repeated ids. A copy the reader makes gets ids of its own, its references (`url(#…)`, `href="#…"`) rewritten with them; write markers, gradients and clip paths as attributes, which a copy rewrites, not in a `<style>` inside the SVG.
- A `viewBox` scales the drawing, its text with it: a drawing 800 units wide shown 340px wide on a phone draws 14-unit text at 6px. Size the text in the viewBox's units so that it reads at 11px or more at 360px, or draw it from its width as a chart of the document's own; `gallery qa` warns `svg-text-small` below that, `overflow-in-block` for words of the drawing's HTML that run past their box, and `cut-in-block` for its words or marks (an svg's shapes among them) cut at the bottom of a box that clips them.

## Card width

A card is as wide as the place it stands in: the reading width, or its column's in a row of columns. Put cards side by side when the reader compares them, one per column ([columns.md](columns.md)); the columns' `--doc-column-ratio` gives them unequal widths. Never invent a figure to fill a row. A lone figure that does not need the full 712px: `.doc-figure--compact` centers it at a smaller width.

<!-- the file holds -->
```html
<figure class="doc-figure doc-figure--compact">
  <h3>三步</h3>
  <p class="doc-figure-caption">写作、检查、导出</p>
  <ol class="steps"><li>写作</li><li>检查</li><li>导出</li></ol>
</figure>
```

A card may carry sizes in its `style` attribute: `--doc-span`, its width as a share of the width it stands in (`.5` is half), and `--doc-chart-height: 420px`, a chart's plot height (`height` in its draw). The reader sets both by dragging the card's edges in the preview; keep them when editing a document, and write them yourself only for a deliberate layout.

## Frame

A card is framed (a 1px line, 12px corners, the ground it stands on, 18px of room at its sides). `doc-figure--plain` takes the frame away: no line, no corners, no ground, and the room it made inside goes with it (no padding at any width), so that the title, what the card holds and the caption stand at the edges of the card's width, as a paragraph and a picture do. The width is as it was (the reading width, `--doc-span`, centered by `doc-figure--compact`); the surface inside it (`--doc-surface`, which a chart's tokens and a drawing's fills read) is still the ground the card stands on. The reader's switch is 显示边框 in the card's block menu (checked while the frame shows, as a Sheet area's; one undo step); an Agent writes the class itself for a figure that should sit in the text without a box. `kit/styles/figure.css` has it for the preview, the export and a read-only page alike.

<!-- the file holds -->
```html
<figure class="doc-figure doc-figure--plain">
  <h3>三步</h3>
  <ol class="steps"><li>写作</li><li>检查</li><li>导出</li></ol>
</figure>
```

## Copying

A card copied in the preview is a card of its own: a chart drawn from a table and its table copied together take a key of their own, and SVG ids referenced inside the copy take a prefix of their own.
