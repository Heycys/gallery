# Reading state and linkage

Bindings go on blocks of any kind. Controls are whole blocks (整体块) the reader moves as a whole: labelled fields in a `.doc-state-fields`, filter buttons in a `.doc-filter-row`, what a filter shows in a `.doc-state-list`. Their title is an ordinary heading above them, and groups of them stand side by side in columns ([columns.md](columns.md)).

What the reader chooses on the page (a memo, a filter, a series, an open disclosure) is a key the document names. Elements bound to a key write it and show it; elements shown for one of its values hide while it holds another. No script is needed, and nothing refers to an element by id, so each bound block can be deleted, copied and moved in the live preview like any other, and the rest keep working without it.

| Markup | What it does |
| --- | --- |
| `data-doc-bind="key"` on an `input`, `textarea` or `select` | its value is the key's (a `select`, bound or not, opens the kit's flat menu, never the browser's popup: render.md "A choice is the kit's menu") |
| on a `button` with a `value` | a click chooses that value; `aria-pressed` shows the one chosen (write `aria-pressed="true"` on the default) |
| on a `details` | whether it is open |
| on a `table` | its sort |
| `data-doc-show="key:value"` | shown while the key holds this value or nothing, hidden otherwise |
| `data-doc-transient` on a bound element | its key is forgotten when the page is left, and an export of the view leaves it out |

The keys are kept in the reader's browser, per document, and travel in "导出当前视图副本"; their defaults are what the markup holds (a control's value, the button marked pressed, a details' `open`). Equality is all a binding compares: no expressions, so nothing in an attribute runs.

<!-- you write -->
```html
<div class="doc-state-fields">
  <label for="series-filter">系列</label>
  <select id="series-filter" class="doc-state-field" data-doc-bind="series" data-doc-transient>
    <option value="">全部</option><option value="api">API</option><option value="agent">Agent</option>
  </select>
</div>
<table data-doc-bind="series-sort" data-doc-transient>
  <thead><tr><th>系列</th><th>合计</th></tr></thead>
  <tbody>
    <tr data-doc-show="series:api"><td>API</td><td>262</td></tr>
    <tr data-doc-show="series:agent"><td>Agent</td><td>176</td></tr>
  </tbody>
</table>
```

Filter buttons and a memo, each group under its heading:

<!-- the file holds -->
```html
<h3>筛选</h3>
<div class="doc-filter-row" role="group" aria-label="状态筛选">
  <button class="doc-filter-button" type="button" data-doc-bind="status" data-doc-transient value="" aria-pressed="true">全部</button>
  <button class="doc-filter-button" type="button" data-doc-bind="status" data-doc-transient value="review">待复核</button>
  <button class="doc-filter-button" type="button" data-doc-bind="status" data-doc-transient value="done">已完成</button>
</div>
<ul class="doc-state-list">
  <li data-doc-show="status:review">柱状图：检查数值标签</li>
  <li data-doc-show="status:done">导出文件：确认离线打开</li>
</ul>
<h3>备忘录</h3>
<div class="doc-state-fields">
  <label for="memo">备忘录</label>
  <textarea class="doc-state-field" id="memo" data-doc-bind="memo" rows="4" placeholder="写一条备忘录…"></textarea>
</div>
<p class="doc-note">备忘录自动保存在当前浏览器里。</p>
```

- `gallery check` fails a `data-doc-show` whose key nothing binds, a binding on an element that cannot hold a key, and a button without a `value`.
- Sheet areas keep the tab shown on their own ([sheets.md](sheets.md)).
- Document code never touches `localStorage` or `sessionStorage`. A script that keeps state of its own (a value it computes, a list it builds) uses one `DocState.create({ id, version, defaults, transientKeys })` instance (`skills/gallery/sdk/doc-state.d.ts`): `get`, `set`, `update`, `snapshot`, `reset`, `subscribe(listener) → unsubscribe`. Its `id` names the state within the document. A DOM node whose `hidden`/`open` the script sets from a transient value gets `data-doc-transient-view`, so an export of the view clears it.
