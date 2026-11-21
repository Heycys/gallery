# Code blocks and diffs

A code block is a basic block (基础块): in the preview the reader edits its title and its code as plain text, folds it, switches wrapping and picks its language. A diff is a whole block (整体块), moved and deleted as one.

Write code as on any page, its language in a `language-…` class; a `<figure>` with a `<figcaption>` names its file, and `data-line-start` on the `pre` numbers an excerpt's lines as in its file:

<!-- you write -->
```html
<figure>
  <figcaption>src/example.ts</figcaption>
  <pre data-line-start="38"><code class="language-typescript">const result = source - baseline;
return result / baseline;</code></pre>
</figure>
```

The export (or the reader's first edit) makes it the kit's code block, a `div.doc-code` holding its title and its code, the language and the first line's number on the block; the file then holds:

<!-- the file then holds -->
```html
<div class="doc-code" data-language="typescript" data-line-start="38">
  <div class="doc-code-title">src/example.ts</div>
  <pre><code>const result = source - baseline;
return result / baseline;</code></pre>
</div>
```

The title is one line of plain text, usually the file name: write it when the reader needs it (the caption's words, or `data-title` on a bare `pre`); left empty, the header reads 代码块. Without `data-line-start` the lines are numbered from 1; with it the kit shows the excerpt's range beside the title (第 38–57 行, from the first number and the line count), so the title and a disclosure's summary leave the range out. The block's own attributes (`data-line-start`, `data-line-numbers`, `data-folded-lines`) written on a bare `pre` go on the block; in the kit's markup write them on the `div` (on its `pre` they do nothing, and `gallery check` says so). The kit draws the rest of the header (a fold arrow, the language, a wrap toggle and a copy button), highlights the code offline, keeps its indentation and wraps long lines.

- The language comes from `data-language` on the `div` (`typescript`, `python`, `json`, `bash`, `text` for plain text…), else from the title's file extension, else from what the code looks like. Unknown languages render as plain text.
- `doc-code--folded` folds the block to its header: for a long code sample the reading task does not need open. It is the block's (`div.doc-code`): a bare `pre` has no form of it (one written there stays as written and does nothing), so a document written as plain HTML starts with its code open and the reader folds it. `doc-code--nowrap` scrolls long lines inside the frame instead of wrapping them (a directory tree, a log); on a bare `pre`, `data-wrap="false"` beside `data-line-numbers` says the same, and the export writes it as the block's class. `data-folded-lines="3 12"` shows the structures starting on those lines folded (a brace's content, a Python body, an HTML element…; the block's third and twelfth lines, whatever `data-line-start` numbers them). `data-line-numbers="false"` hides line numbers.
- Code past 40 lines scrolls inside its frame; `style="--doc-code-height: 320px"` caps the frame at another height, `none` shows every line, on the block or on its `pre` (a bare `pre` too, where the conversion keeps it). The reader's folds, wrapping, language and height are written as these classes and attributes: keep them when editing a document.
- Nothing but the title and the `pre` goes in the block.

## Diffs

Show a change as a diff: a `div.doc-diff` holding its title (the file name) and its options as JSON in a `<script type="application/json">`. The kit draws the lines below the header, which counts the lines added and removed. Each line has `type: "added" | "removed" | "unchanged"`, single-line `content`, and an optional positive `lineNumber`; `path` or `language` picks the highlighting, and `showLineNumbers`, `coloredLineNumbers` and `showAccentStrip` default to true. A diff shows the lines it is given; it does not compute differences between two files. `gallery check` checks the options against `skills/gallery/sdk/doc-code.d.ts` and the lines as the kit does.

<!-- the file holds -->
```html
<div class="doc-diff" aria-label="score.ts 代码变更">
  <div class="doc-code-title">src/score.ts</div>
  <script type="application/json">
    {
      "path": "src/score.ts",
      "lines": [
        { "type": "removed", "content": "return total;", "lineNumber": 2 },
        { "type": "added", "content": "return total / count;", "lineNumber": 2 }
      ]
    }
  </script>
</div>
```
