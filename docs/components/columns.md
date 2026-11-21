# Columns

A row of columns (分栏) is a container block (容器块): it puts blocks side by side. Each column is a flow like a section: paragraphs, headings, lists, chart cards, tables, code, formulas, panels and disclosures all go in it, written as anywhere else. Use columns when the reader compares the blocks across (two charts of one question, a before and an after); keep a single line of reading otherwise. In the preview the reader makes and dissolves rows of columns, moves blocks into and out of them, and drags the line between two columns to change their widths.

<!-- the file holds -->
```html
<div class="doc-columns">
  <div class="doc-column">
    <h3>改动前</h3>
    <p>检索结果按时间排序。</p>
  </div>
  <div class="doc-column">
    <h3>改动后</h3>
    <p>检索结果先按相关度排序。</p>
  </div>
</div>
```

- A row holds 2 to 5 columns and nothing else; a column holds no row of its own, no section and no Sheet area. `gallery check` fails a row of one column, an element between the columns, and a column's width out of range.
- The columns are equal unless every column of the row carries its share of the row in its style attribute, `--doc-column-ratio` (the shares add up to 1, each at least 1/24): `<div class="doc-column" style="--doc-column-ratio: .6">`. Keep the shares the reader set.
- Cards side by side go one per column; a card fills its column, and its width share (`--doc-span`) is of the column ([figure.md](figure.md#card-width)).
- Below 640px the columns stack, each the full width.
