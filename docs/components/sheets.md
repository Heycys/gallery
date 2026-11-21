# Sheet tabs

A Sheet area, a container block (容器块), splits a long document into pages the reader switches between: a row of tabs, one panel per tab. Each panel is a flow like the page, holding sections and body text. In the preview the reader edits each panel as any part of the document, and adds, renames, moves and deletes tabs (a tab with its panel).

Write the area the short way: a `<section>` per tab, of no attribute, starting with its heading (`<h2>`–`<h4>`), the tab's name, the rest its blocks, and nothing else in the area. The tools write the kit's area of it (`src/editor/source/natural.mjs`): a row of tabs on the shell's line, a key for each tab made of its name (ASCII, else `tab-<n>`), each section a panel of that key, the heading's lines left blank; a name made for an area written without one. An area in neither form fails `gallery check`, which says what to write.

<!-- you write -->
```html
<section data-doc-sheets="report">
  <section>
    <h2>结果</h2>
    <p>……</p>
  </section>
  <section>
    <h2>Case</h2>
    <p>……</p>
  </section>
</section>
```

<!-- the file then holds -->
```html
<section class="doc-sheet-shell" data-doc-sheets="report" aria-label="选项卡">
  <div class="doc-sheet-tabs" aria-label="选项卡">
    <button class="doc-sheet-tab" type="button" data-sheet-tab="tab-1">结果</button>
    <button class="doc-sheet-tab" type="button" data-sheet-tab="case">Case</button>
  </div>
  <div data-doc-sheet="tab-1">
    <p>……</p>
  </div>
  <div data-doc-sheet="case">
    <p>……</p>
  </div>
</section>
```

- In the kit's form, panels are direct children of the shell, one per tab, each with its tab's key (`data-doc-sheet` equal to the tab's `data-sheet-tab`). `gallery check` fails a tab without its panel or a panel without its tab. A panel may be empty (a tab added in the preview starts so).
- The area starts on its own: no script. It gives tabs and panels their ids, roles and ARIA links; do not write them. The first tab is shown at first; the tab the reader chose is kept in their browser under the area's name (`data-doc-sheets="report"`): give each area of a document a name of its own.
- The area is a frame, 16px round, holding its tabs (pills) and the panel shown, 16px in. Add `doc-sheet-shell--plain` to the shell for no frame: the tabs and panels then stand at the flow's edge, as in a page that is all tabs.
- A tab may show an emoji before its name: `data-tab-icon="🚀"` on its button (one emoji, nothing else), drawn as a picture (Twemoji, as the page's icon).
- A script may ask an area which tab it shows or show another: `DocSheets.get(target)` returns `{ get(), set(tab) }` (`skills/gallery/sdk/doc-sheets.d.ts`).
