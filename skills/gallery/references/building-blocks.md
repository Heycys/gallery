# Building a custom block

A custom block (自定义块) is a block to use again: it lives in the workspace, a document holds its instances as ordinary elements, and a custom page (自定义页: a page of the workspace's own, its 首页 among them) holds them as cards on its board. The user finds it in the "/" menu of every document there and in a custom page's 添加自定义块, as its manifest's places say ([Places, cards, settings and needs](pages-and-data.md#places-cards-settings-and-needs)).

Make one for a feature the user asks for, however small ("每篇开头显示创建和修改时间"), a block they want to use again, a card of a custom page that does something or keeps data, or a control a document needs that keeps what a reader enters (a ledger, a checklist, a form, a score). A document's own `<script>` cannot write the file: what it keeps lives in the browser, is gone with the page and is no one else's, and only a block's data part, written by `context.editJSON`, reaches `doc.html`. That is reason enough though the user says nothing of using it again: make the block (`gallery block new <id> --data`) and write its instance into the document. A document is otherwise written with the kit's blocks and, for a layout of its own, a whole block ([writing-html.md](writing-html.md#kit-blocks)): never make a custom block to get a look or a chart a document's own `<style>` and `<script>` can give it, or one per document for what the kit's blocks show. A card that only shows what it holds (a few lines, links, a picture) is Gallery's own static card, `gallery/static`, with any HTML in it: no block of yours. A task board, a number or a chart over a table of the document is a view of it that Gallery ships (`gallery/kanban`, `gallery/metric`, `gallery/chart-view`: Gallery's own blocks, below): no block of yours either.

The interface is experimental in Gallery 0.x: what these pages say may change between versions, and a block may need changing with it. Three references hold it: this page is the block (its kinds of part, the flow of making and trying one, its files, manifest, parts, slots, instance and style, what `gallery block check` says, and Gallery's own blocks); [block-script.md](block-script.md) is its script, `kit.js`, and how it writes back to the file; [pages-and-data.md](pages-and-data.md) is a card of a custom page (its size, its settings) and what a block may read beyond its own parts: the workspace's data, a table of its document, the web. A custom block's files keep the word component, as Gallery 0.1 called them: its folder is under `components/`, its manifest is `component.json`, an instance is marked `data-doc-component`, and its script calls `DocKit.component`.

## Which kind of part

A part is an element of an instance that the file means something by, and its manifest gives each one a kind, `edit` (Parts, below). Choose the kind by what the part holds:

| What the part holds | Its kind | In a document | On a custom page |
| --- | --- | --- | --- |
| words a reader types in place: a title, a label, a caption | `text`, words and marks alone | the editor's: the reader types, splits and undoes there as in any paragraph; the block reads the words and never writes them | shown, read-only: what a reader types on a card goes in a `data` part, through a field the block draws (`DocKit.input`) or the card's settings |
| what the block works from and a reader's gesture changes: a table of tasks, a script of JSON (scores, a count, settings) | `data` | the block's: it writes the part with `context.edit` on a gesture (a drag, a press, a field's Enter), one undo step, which the editor saves and merges with an Agent's writes | the block's: the same `context.edit`, which the page's service writes into that card of `page.html`, one step of the page's undo |
| what the block shows as written and only the file changes: fixed words, a picture, any HTML | `none` | shown: neither the reader nor the block changes it on the page, an Agent's write of the file does | shown, the same |
| blocks of the document's own under the block's markup: paragraphs, a table and a chart in a card | `flow`, a slot | the editor's: the reader edits them as any of the page's blocks, "/" and the handles too; the block reads them and never writes in them | not allowed: a custom page renders no document's blocks, so a block whose places hold `page` has no slot, and `gallery block check` refuses one |

What the block's script draws by itself (a clock, a total, a handle) is no part: the manifest names it in `runtime` ([Script](block-script.md#script)). A block may have no part at all, when all it shows is drawn. In a document's export every part is read-only: `text` and `flow` as the file holds them, `none` as it stands, `data` drawn by the block with every edit refused.

## A document and a custom page

One block, one manifest and one `context` stand in either place; the two differ in who answers an edit and in how the block is laid out:

| | In a document | On a custom page |
| --- | --- | --- |
| Where it stands | a block of the page's flow, among the others, moved, copied and deleted whole by its handle | a card of a board: the instance in a `<section class="gallery-card" data-card-id="…">`, at a place and a size in square cells of 64px, twelve to a row (fewer on a narrower window, as many as fit: the cards one after another in their order, as large as they are), moved, added and removed by the user: by the grip at the card's top-right corner (a drag moves the card, a click opens its menu: 大小, 设置…, 删除). That corner is the grip's: a 28 × 28 px box, 6px in from the card's top and right edges, over the card while the pointer is on it, so a block puts no control and no text of its own there (keep that corner's 34 × 34 px clear, or start the content below it) |
| Who answers `context.edit` | the document's editor: the part written to `doc.html`, one step of the document's undo, merged with an Agent's writes, a card for the reader where both changed the part | no editor: the page's service writes that card's part in `page.html`, found by its `data-card-id`, one step of the page's own undo; when someone changed that card since the page showed it (an Agent's write of it), the write is refused and the page shown again as the file holds it, for the reader to do again |
| `text` parts | edited in place | read-only |
| Slots | the document's blocks | none |
| `context.place` | `"document"`, and `"export"` in an exported file, where `context.canEdit()` is false | `"page"` |
| `context.size` | `null`: lay out by the width, on `resize` | the card's `{ w, h, width, height }`, its cells and its content's pixels: read it again on `layout`, which comes as the card's size changes, a card held to a narrow board's row too |
| Reading state, `context.state` | kept by the instance's `data-block-id`, or by its markup where it has none | kept by its card's `data-card-id` |
| What the user sets | what the block's own controls write | that, and the card's menu 设置…, a form of the manifest's `settings` |
| What offers it | "/", 在下方新建 and the handle's grid, when its places hold `document` or the user switched it on | 添加自定义块, the workbench's top bar's button at its right (a page open alone in a tab has it above its board), which adds to the page's first board, when its places hold `page` |
| An export | read-only, as above | none: a custom page is not exported |

## The flow

When the user wants a document that uses the block too, the document comes first: `gallery new` and its address sent (SKILL.md, Workflow steps 1–2), so that the user is not left with no page while the block is made. Then make the block as below, write the instance in the document at step 5, and try it there at step 6.

1. `gallery block list` first: what the workspace has now, in two groups by where a block may stand (文档里可用, in documents; 自定义页可用, on custom pages), each with its version, whether the menus can insert it, and what is there and cannot be used, with why; then Gallery's own blocks it has not added yet. When one does what the user asks, use it: `gallery block show <id>` prints its parts, how to write it and its example (`gallery block show gallery/<name>` does so for one of Gallery's own the workspace has not added yet, and ends with the line that adds it; `show` and `check` take its bare name too, `gallery block show heatmap`, as `add` does, a block of the workspace's own by that name staying `local/`'s). When one of Gallery's own does, `gallery block add <name>` puts it in as it ships, and it needs no check and no try (Gallery's own blocks, below).
2. `gallery block new <id>`: a new block in `<home>/components/<scope>/<name>/`, its `id` being `<scope>/<name>`, the scope `local` when you name none: the default pack (默认块包, first in 设置 › 组件列表), where a single block goes, with no pack of its own to make. It writes a block that passes the check, for you to replace. Add `--script` only when the block must do something when a reader uses it: a static block runs no code, is the one to start with, and is all most blocks need. Add `--flow` when it holds blocks of the document's own under its markup (a card around any content): a slot, `body` (Slots, below). Add `--data` for a block that keeps what a reader enters in the file, the usual reason to make one (a list of lines, a field that adds one, a button that takes one away): a data part `items` (JSON on one line, as `context.editJSON` writes it), a `kit.js` that reads it with `context.readJSON` and writes it with `context.editJSON`, a field (`DocKit.input`) and buttons hidden where nothing is written, and an `example()` that adds a line, which works on `template.html`'s empty instance as on `example.html`'s: rename the part and its fields for what the block keeps, and keep that shape. Add `--page` for a custom page's card (its places `["page"]`, a `card` of two sizes). `--data` and `--page` go together or alone, and either goes with `--script`; neither goes with `--flow` (a page has no slot, and `--data` is a part of its own), nor with `--recipe <name>`, which starts from one of Gallery's own (below). Each scaffold passes `gallery block check`, and `gallery block try` on its field (`--type .component-field "words" --then Enter`), as it is.
3. Write its files (below): the manifest, `template.html`, `example.html`, its style and, with `--script`, `kit.js`, then what a writer needs to know.
4. `gallery block check <id>`, until it prints `OK`. It says each problem at its file and line; one with no line is of that file, or of the page, as a whole. Then open `overview-light.png` and `overview-dark.png` in the folder it prints, each the pictures of 360, 736 and 1024px wide of a theme side by side, `example.html` above the line and `template.html` below it, then at full size each width where they show something to fix, and `edit-1024-light.png` and `edit-360-light.png`, as the editing page draws it, `context.canEdit()` true: what the block draws only where a reader can edit (a handle, a button), which an export leaves out. A block that draws nothing more there gives the export's pictures again, and the check says so. Its pictures are in the folder it prints, `overview-light.png` and `overview-dark.png` the whole of the block: open them when you want to see it, nothing asks you to (the `提示：` line right before the verdict says where they are). A block with a data part whose export (`1024-light.png`, where `context.canEdit()` is false) still shows an enabled button, field, select or textarea gets a note: a control that writes is drawn hidden there, which you see by comparing that picture with `edit-1024-light.png`.
5. Use it where the user asked: in a document, write the element as `example.html` does (when the user wants no document, in one of its own made with `gallery new`, named in the handoff: step 6 tries the block there). The user finds it in "/" under its name. `gallery export <slug>` exports it as any block, and `gallery qa <slug>` pictures it among the cards. How to use the block on the editing page (drag a card, press a dot) goes in the handoff and in writing.md, not in the document: its export and PDF show the block read-only. Then `gallery block check <id> --documents`: it runs each instance the workspace's documents hold as step 4 runs the example, a section for each document, each problem at its line of the document's file (`board/doc.html:15`), the pictures in `documents/<slug>/` of the folder it prints, so that an instance filled otherwise than the example (a long title, an empty table) is tried as the reader's page runs it. It writes no document.
6. Try each gesture a reader makes, in the page, with `gallery block try`, one command for each, on the instance step 5 wrote (named after the slug by its `data-block-id` when the document holds more than one; one in another block's slot is one of them): `--drag <selector> --to <selector>` (a card dragged to another column or place), `--press <selector>` (a dot, a button), `--key <selector> <key>` (Enter, Space or an arrow on a control the block draws), `--type <selector> <words>` (words typed in a field it draws or in a text part, the Chinese through an input method, as the user types) or `--select <selector> <value>` (an option of a `<select>`, by its value or its words), as `gallery block try <slug> --drag .kanban-card --to ".kanban-column:nth-child(3)"`; `--then <key>` presses a key after it where the focus is, as `--type .habit-name 多喝水 --then Enter` for a field that writes on Enter. What a reader does in several gestures (a rename: `Control+a` in the field, the new name, Enter; a form) goes in a steps file, `--steps <file>`: a JSON list of steps, each naming one gesture as the options do, without their `--`, as `[{ "key": [".habit-name", "Control+a"] }, { "type": [".habit-name", "多喝水"], "then": "Enter" }, { "select": [".habit-unit", "杯"] }, { "drag": ".kanban-card", "to": ".kanban-column:nth-child(3)" }]`, made one after another in one page. Each selector is the first element of the instance that it finds, as `kit.js` draws it: `Nothing in the instance is …` lists the classes the instance shows. Words go in pressed at the element's middle, the caret at the end of what it holds, so that into a field that holds words already they go after them, and the Gesture line says so (`it held "餐饮", and the words went after it`); where a step before left the focus in it there is no press, and they go in at the caret where that step left it (a press puts it where the pointer lands, an arrow key moves it), which the Gesture line says too (`the caret inside what it held`); `--replace` (`"replace": true` in a step, `{ "type": [".category", "交通"], "replace": true }`) selects all the field holds first, so that they take its place, as a reader's Ctrl+A does. The command makes the trial on a scratch copy of the document, its page alone, editable, in a Chrome or Edge of its own, headless: `doc.html` is not written and the user's page shows nothing of it, and the copy goes at the end, whatever came of it. It makes each gesture there with the pointer or the keys (a drag in steps, released as it comes onto its target), waits until the copy has what it wrote, and prints it: `Wrote: tasks (-1 +1 of its 8 lines); nothing outside the instance changed (data-block-id aside)`, each part with the lines the gesture took out and put in, and under it those lines, `-` and `+`: read them, they are what a reader's gesture writes to the file (with `--steps`, `Wrote: nothing` of a step that wrote nothing, a press that opens a field, which is fine). Then it undoes as a reader does, a Ctrl+Z for each write the page took, the last first (each `context.edit` is one undo step: a gesture that wrote twice takes two), and says `Undone: one Ctrl+Z, and the copy of doc.html is as it was (data-block-id aside)`, and opens what the gestures wrote in a fresh page, where the block is to mount, write nothing as it opens and show what it showed after them of what they wrote: `Read back: …`. What the page showed and never wrote (a filter or a tab chosen, an editor left open) a fresh page does not keep, and need not: a `note` line says what differed. Write what a reader keeps, never what they only look through. `--keep` makes the trial on `doc.html` itself and leaves the write, which every page open on the document shows, the user's too: say so in the handoff. Its `Picture of the instance after …` line names a picture to open when you want to see it: the `Wrote:`, `Undone:` and `Read back:` lines say what the gesture did. A `note` line asks what the check's notes ask (a write that lays a part out anew: change the write as [Writing back](block-script.md#writing-back) says; none for a write that is `context.editJSON`'s own layout, nothing to change: a part on several lines that closes to one line as its list empties, or an entry in it that opens to lines of its own as it comes to hold an object; editJSON opens no part that stands on one line, which stays on one line, compact, one that closed to one line too). Exit 1 is a problem to fix in the block: gestures that wrote nothing say what came of the last (no `context.edit` came of it, the page refused one and the console says why, an HTML5 drag was dropped nowhere: a list a card is dropped on cancels `dragenter` as well as `dragover`; words typed in a field that writes on Enter: add `--then Enter`), an undo that did not take a write back says what still differs, and a fresh page that shows the block otherwise than the page did after the gestures, in what they wrote, says what (a value kept in memory and not in the part, or written in a form the mount does not read), as does one that writes as it opens (draw what the parts hold, and write on a gesture alone); fix it, run `gallery block check <id>`, and try the gestures again. Exit 2 is a mistake in the command; one found at a step after others were made is said after what those wrote, which `--keep` leaves in `doc.html`. Exit 3 (`UNVERIFIED`) is a trial not seen through, its line saying why (no browser, a page that loaded itself again as the block changed): run it once more.
   A gesture the command cannot make (the block inserted from "/" by its name, or a word of `words`, the pinyin of its name), make yourself when you can drive Chrome or Edge by its DevTools protocol, from Node 22's own `fetch` and `WebSocket`, with nothing to install. Start one of its own at the `Agent 自用` address that `gallery new`, `gallery import` or `gallery open <slug> --no-browser` prints: the document's page alone, editable, with no frame around it (`--headless=new --remote-debugging-port=<port> --user-data-dir=<a new folder> <address>`; `http://127.0.0.1:<port>/json/list` gives the tab's `webSocketDebuggerUrl`, and `Input.dispatchMouseEvent`, `Input.dispatchKeyEvent` and `Runtime.evaluate` do the rest). Copy `doc.html` first. A gesture's write goes to the file by itself: `<html>`'s `data-ge-save` leaves `saved` (`waiting`, then `syncing`) and says `saved` again once the file has it (`held`: a card waits for the reader; `offline` or `stopped`: the server). Then read the part in `doc.html`: it holds what the gesture meant, and nothing outside it changed but `data-block-id`: the page gives a block it saves a change of one where it has none (the instance, the section it stands in), and an undo leaves it, so compare `doc.html` with your copy with every `data-block-id` taken out. Press Ctrl+Z once with the focus in no field the block draws (in an `input`, a `select`, a `textarea` or an editable element of its own, Ctrl+Z is that field's: a click on a paragraph beside the block takes the focus off it), wait for `saved`, and see the part as it was. At the end `doc.html` is your copy again, but for those ids and what the user changed meanwhile at the address you sent: undo each step, the insert too, then close your Chrome. Anything of the trial an undo left (the page was loaded again, a card held a step), take out yourself once your Chrome is closed, as any change of yours: the instance, and an empty paragraph you made for it, keeping the rest and the ids. Write the whole copy back only where `doc.html` differs from it in what the trial left alone, ids aside, and never while a page of yours is open on the document: over more, it takes away what the user wrote meanwhile and shows them a card saying so, and a page of yours open on it holds on a card of its own.
   In the handoff name the gestures you tried, and only those, each by its command or its steps and what it wrote, and what the user changed meanwhile, which stays. When you could not try one, by the command or yourself, say plainly in the handoff that you did not try it in the page.

Tell the user the block's name and where it is. A change to a block reaches every page open on it, by itself.

## The files

| File | What it is |
| --- | --- |
| `component.json` | the manifest, plain data: all that Gallery itself reads of the block |
| `template.html` | what "/" puts in a document: one instance, with what a new one holds. `gallery block check` requires it: with none, or one a new block cannot be, no menu offers the block, and `gallery block list` and 设置 › 组件列表 say so |
| `example.html` | an instance as a writer would fill it: what `gallery block show` prints and what `gallery block check` runs |
| writing.md | how to write it, for an Agent: what it is for, when to use it, what goes in each part. `gallery block show` prints it |
| `style.css` | its look, optional |
| `kit.js` | its script, optional, one classic script |
| `preview-light.webp`, `preview-dark.webp` | the menus' pictures of it, which `gallery block check` writes as it passes (its example as a reader sees it, light and dark): nothing to draw or look at, leave them be |

## The manifest

```json
{
  "id": "local/metrics",
  "apiVersion": 1,
  "version": "1.0.0",
  "name": { "zh": "指标条", "en": "Metric strip" },
  "description": { "zh": "一排数字和它们的说明", "en": "A row of numbers and what they say" },
  "words": "zhibiaotiao kpi metrics 指标 数字",
  "parts": {
    "title": { "at": ":scope > h3", "edit": "text" },
    "numbers": { "at": ":scope > dl", "edit": "none" }
  },
  "markdown": "parts"
}
```

| Field | What it holds |
| --- | --- |
| `id` | `<scope>/<name>`, as its folder is, each in lowercase letters, digits and hyphens |
| `apiVersion` | 1 |
| `version` | which version of it this is: shown, never compared |
| `name`, `description` | `{ "zh": …, "en": … }`, both: what the menu shows |
| `words` | optional: what the menu finds it by, besides its name. Write the pinyin of a Chinese name here, the whole name in one word (`任务看板 renwukanban kanban`): "/" goes by the letters an input method is composing, and finds the block while all of them are being composed only by a word that holds them. The check gives a note on a Chinese name no word here spells whole, a syllable a character: it counts how many syllables of pinyin a word reads as, and does not know which characters they spell |
| `parts` | its parts by name, below |
| `runtime` | optional: what its script leaves on a page, `{ "generated": [selectors], "attrs": { selector: [names] } }` |
| `assets` | optional: what it needs besides its script and style: the kit's files by id (`d3`, `charts`, `tables`, `dialogs`, `sheets`, `state`, `tokens`, `code`, `math`, `katex`, `katex-styles`, `katex-auto-render`), and files of its own folder a style names, by their path. `katex` gives a script the name `katex`, and what it draws needs `katex-styles` beside it, or a formula shows twice |
| `markdown` | optional: `parts` (the default: a table part as a table, a text part as a paragraph) or `text` (its words alone), how it exports to Markdown |
| `schema` | optional: the whole number of the newest shape of content its script reads, 1 when it says none: [When the content's shape changes](block-script.md#when-the-contents-shape-changes) |
| `places`, `card`, `settings`, `needs` | optional: where it may stand, its size as a card on a custom page, a card's settings, and what it uses: [Places, cards, settings and needs](pages-and-data.md#places-cards-settings-and-needs) |

A block's manifest holds nothing else: a field it does not know keeps the block from loading, and `gallery block list` says why.

## Parts

A part is an element of an instance that the file means something by. `at` finds it: `:scope > h3`, `:scope > div.note > p`, step by step from the instance, or one selector for any depth, or a list of those with commas; each step a tag, `.class`, `[attr]` or `[attr=value]`. A part counts the elements `at` finds in one instance, each once: an instance holds at least `min` of them (1 when the manifest says none) and at most `max` (any number when it says none); `optional: true` lets it hold none, whatever `min` says. An instance with too few or too many fails `gallery check` for every document that holds one, and a `template.html` with too few or too many is in no menu.

A group of parts repeated, an item of three parts three or four times, is its three parts, each reaching into the item and each with the same `min` and `max`:

```json
"parts": {
  "name": { "at": ":scope > div.item > p.name", "edit": "text", "min": 3, "max": 4 },
  "value": { "at": ":scope > div.item > p.value", "edit": "text", "min": 3, "max": 4 },
  "change": { "at": ":scope > div.item > p.change", "edit": "text", "min": 3, "max": 4 }
}
```

Each part is counted across the instance on its own: the check does not hold the parts of one item to each other, so four items, one of them without its `change`, pass, three changes being enough. Say in writing.md that every item holds all three.

`edit` says whose a part is:

| `edit` | What it means now |
| --- | --- |
| `text` | words the user types in, in the browser. It holds words and marks alone (`strong`, `em`, `b`, `i`, `u`, `s`, `code`, `a`, `sub`, `sup`, `br`): a heading, a paragraph, a label. With anything else in it, a block, a field, a picture, a comment, an element it does not close, the editor leaves it read-only, and the check fails it |
| `none` | the block's: read it, draw from it. The user changes it through the source alone |
| `data` | what a script reads its data from and writes back to (a table, a `<script type="application/json">`): the block's alone, written by `context.edit` and by nothing else, told to it when it changes |
| `flow` | a slot: blocks of the document's own in the instance, a `<div data-doc-slot="<name>">` of its markup and no `at` (Slots, below) |

What stands in an instance belongs by region:

| Where | Whose events and contents |
| --- | --- |
| a `text` part | the editor's: Enter, Backspace, undo and the selection work as in any text |
| a `data` part | the block's, and only `context.edit` changes its content. A `text` part in one, or around one, is no text part: the file holds one or the other there |
| what the manifest's `runtime` names, and all else in the instance | the block's: the editor leaves its clicks and keys alone |
| a slot, a `flow` part, and what it holds | the editor's: any block, as in the page; the block reads it and never writes in it |
| the instance as a whole, its handle | Gallery's: moving, copying and deleting it |

In the page the user types words in the text parts, edits the blocks of a slot as any, and moves, copies or deletes the instance whole; the block changes its data parts by `context.edit` on a gesture of the reader's, a drag or a press, and nothing else of it changes there. No item of a repeated group of text parts is added or taken out on the page, its text parts being the file's words: an item more or fewer is a change of the source, so say so in writing.md. A block whose items come and go keeps them in a data part, where a control of its own adds, renames or removes one by `context.edit`, as a move is written.

A block reads a text part and never writes one: what a user types there is the file's, and a script that writes it on the `source` signal hears itself without end. It draws in what is its own, and writes a data part by `context.edit` alone: a change made straight to the part stands on that page and may end up anywhere, or nowhere.

## Slots

A slot is where an instance holds blocks of the document's own under its own markup: a card with a title over any content, a frame around a few paragraphs and a table. Its part is edited as `flow`, with no `at`, `min` or `max`, a name of lowercase letters, digits and hyphens, and `"optional": true` when an instance may have none:

```json
"parts": {
  "title": { "at": ":scope > h3", "edit": "text" },
  "body": { "edit": "flow" }
}
```

In the markup it is a `<div>` or `<section>` of the instance's own, marked with that name, once in an instance, never the instance itself and with no `data-block-id`:

<!-- the file holds -->
```html
<div class="brief" data-doc-component="local/brief">
  <h3>本周要点</h3>
  <div class="brief-body" data-doc-slot="body">
    <p>上线了新的导出流程。</p>
    <ul>
      <li>导出更快</li>
      <li>离线文件更小</li>
    </ul>
  </div>
</div>
```

`gallery block new <id> --flow` writes one, `body`, in place of the text paragraph. What a slot holds is written as anywhere in the document ([writing-html.md](writing-html.md)): paragraphs, headings, lists, tables, formulas, code, a chart card, pictures, a disclosure, columns, another instance; no section and no tab area. Gallery converts, spaces and draws it as it does the page's. `template.html` gives it what a new instance starts with, an empty paragraph (`<p></p>`) where the reader starts typing; `example.html` some blocks a writer would put there. "/" makes what a template's slot holds as a paste of it makes blocks: paragraphs, headings, lists, quotes, code, a plain table and a disclosure come through, and a chart (`data-doc-chart`), a card (`<figure>`), a table's `<caption>` or an instance of a block does not, so `gallery block check` fails a template's slot that holds one, at its line. Write those in `example.html`, as an Agent writes them in a document.

On the page the reader edits a slot's blocks as any of the page's: types in them, splits and turns them, moves them in and out by their handles, adds blocks there with "/", undoes. Where the block is missing, turned off or fails, the slot is still the document's and still editable; the rest of the instance shows as it stands.

The slot is the reader's, not the block's:

- `context.part("body")` gives the slot element, to read: its height, its words, its headings. A change of what it holds comes as `source`, whoever made it.
- A block never writes in it, moves it or takes it off: what it holds is the reader's words, and a page would take a change there for the reader's, and save it. It draws outside the slot, in what its manifest's `runtime` names, as `local/brief` draws its count of words under it. What a script changes there as the kit runs it (`mount`, `update`, a `context.frame` drawing, a `context.interval` or `context.timeout`) is put back at once, everything that call changed with it, and the instance fails, showing what it holds read-only; what it changes later, from a listener of its own, nothing stops, and `gallery block check` fails a script that changes what a slot holds or where it stands, as it mounts, as it is put back and as its example makes its edit. `context.edit` on a slot throws.
- Its style reaches no block in the slot: a selector that goes down from the instance by a blank (`[data-doc-component="local/brief"] p`) styles the slot's paragraphs too, which read as the page's. Write each step with `>` (`[data-doc-component="local/brief"] > h3`), or wrap the rules in `@scope ([data-doc-component="local/brief"]) to ([data-doc-slot]) { … }`; the check gives a note on each that goes down.
- With `"markdown": "parts"` a slot is written as its blocks, in its place among the parts; with `"text"`, its words.

## Writing an instance

<!-- the file holds -->
```html
<div class="metrics" data-doc-component="local/metrics">
  <h3>本周指标</h3>
  <dl>
    <dt>收入</dt><dd>12 万</dd>
    <dt>新客</dt><dd>3–5 位</dd>
  </dl>
</div>
```

An instance is a `<div>` or `<section>` naming its block, straight in the page or in anything that holds blocks. Classes and attributes of your own are free in it; `doc-*` and `data-doc-*` are the kit's. Nothing of Gallery's goes into an instance: no conversion, no spacing, no formula, no other block's script, but in its slots, which are the document's. Write no `data-block-id` in `template.html`: every block gets its own.

`template.html` is one instance and nothing around it, closed by its own end tag, with as many of each part as the manifest says. It is what the user first sees of the block. Nothing in it runs or leaves its block: no script but data (`<script type="application/json">`), no `on…` attribute or address of code, no `<style>`, `<link>` or `<iframe>`, no `style` that positions it `fixed`, `absolute` or `sticky`, nothing of the editor's (`data-ge-*`). No menu offers a template that breaks this, and the check fails it at its line. `example.html` may hold several, and blocks around them.

Put what the block says in the instance itself: an element a reader can read without its script, so that a reader of a file the block is not in, or a Markdown export, still has it. Where the block is missing or turned off, or its script fails or starts nothing, Gallery shows the instance as it stands and draws a script of data in it as it draws any, read-only: an array of objects as a table, an object as its keys and values, any other array as a list, cut short and saying so past twenty entries, three levels down or a few hundred values. A block with no script draws nothing of its scripts of data: what such a block says is in elements. A block that cannot fully read what it finds leaves it as it stands. A table part it leaves showing, drawing and hiding nothing. A script of data it hands to Gallery with `context.fail(error)` (or by throwing): Gallery then shows the instance as it stands, its script of data drawn read-only as above, its text parts read-only too until the page is loaded again. It never rebuilds what it found and writes that over it, and what it leaves alone nothing writes. Write no snapshot of what the block draws beside its data unless writing.md says how the snapshot is made again from that one source: otherwise it goes stale, unseen.

A picture in an instance is the document's, a file of the document's `assets/` folder; on a custom page the page's, a file of `pages/<slug>/assets/`, written `assets/<file>` all the same (the server serves it at `/pages/<slug>/assets/<file>`, and `gallery page check` says one that is not there). `example.html` and `template.html` stand in no document, so a picture there is a `data:` address, or stands in the style, a file its `assets` name.

## Style

Every selector stands in the instance, whatever it is:

```css
[data-doc-component="local/metrics"] dl { display: grid; grid-auto-flow: column; }
[data-doc-component="local/metrics"] dt { color: var(--doc-muted); }
@media (max-width: 480px) {
  [data-doc-component="local/metrics"] dl { grid-auto-flow: row; }
}
```

An instance stands `--doc-block-gap` from what is around it, in whatever state it is: the kit gives it that margin, and a `margin` on the instance itself changes it.

Start each one at `[data-doc-component="<id>"]`, the instance's own attribute, not a class of yours: a class is anybody's. A selector may have something before that, which only says when it applies, and nothing reaches outside it or beside it (`+`, `~`; in nesting, `& + p` is beside the instance when `&` is the instance, and fine when `&` is something in it): the check names each that does, with its line. Colors come from the kit's variables, which follow the dark theme: `--doc-text`, `--doc-muted`, `--doc-border`, `--doc-grid`, `--doc-surface`, `--doc-bg`, `--doc-accent`, `--doc-accent-soft`, `--doc-series-1` … `-6` ([writing-html.md](writing-html.md#the-page)). Text on a `--doc-accent` fill is `--doc-bg`, never `#fff`: the dark theme's accent is light. Text on `--doc-accent-soft` is `--doc-text`. A picture or a font a style names is a file of the block, listed in `assets`; an export embeds it. No `@import` and no address elsewhere.

## Gallery's own blocks

Gallery ships blocks of its own, the scope `gallery`; its page cards come in two looks, packs (below): Gallery 风格, `gallery/<name>`, on, and 柔光风格, `gallery-soft/<name>`, off until the user turns it on in 设置 › 组件列表 (`gallery block add gallery-soft/<name>`); its blocks for documents count in the default pack (默认块包), whatever look is on. For documents three views of a table of the document ([A view of a table](pages-and-data.md#a-view-of-a-table)), `gallery/kanban` (看板: its rows as cards grouped by a column, a card dragged changing that cell), `gallery/metric` (指标: a count, sum or average of a column) and `gallery/chart-view` (图表: bars of a count, sum or average by a column), which the reader inserts from "/" (each reads the nearest table above it) and which you write after an ordinary table as `gallery block show gallery/<name>` prints (for a task board or a data dashboard in a document use them, never a block of your own); `gallery/card` and `gallery/chart-card` stay out of the menus until the user turns them on: write neither (a titled frame is a highlight panel, `<aside>` with a heading in it; a chart of a table is one you draw from it, or `gallery/chart-view`), and a document that holds one keeps it as it is; for custom pages `gallery/today` (问候与日期, a greeting and the date, drawn by the clock), `gallery/note` (便签, lines the user types on the card), `gallery/static` (静态卡片, any HTML of yours, only shown: a page's alone, as a document writes such HTML as it is), `gallery/countdown` (倒计时, the days to a date of its settings), `gallery/habit` (习惯打卡, a check-in a day and the streak, written as a recipe to start a block of your own from); `gallery/weather` (天气, a city of its settings, from Open-Meteo: it goes online, so tell the user to press 允许访问 on its card); and four that read the workspace (`needs` `workspace`), `gallery/todos` (我的待办, the to-dos not done of every document), `gallery/recent` (最近编辑, the documents edited last), `gallery/stats` (工作区统计, its counts) and `gallery/heatmap` (编辑热力图, the edits of each day of the past year), which a new workspace's 首页 holds with today and the note. Each one's writing.md, which `gallery block show` prints, says what it is for and how to fill it, and `gallery block list` names each one the workspace has not added, with its line. `gallery block add <name>` puts one in as it ships, `components/gallery/<name>/`, recording its version and what its files hold: write its instances as `gallery block show gallery/<name>` prints, with no check and no try. Change nothing in its folder: run again with a newer Gallery, `add` updates a copy that is as it was added, and never one changed since (what a system writes there as it shows the folder, a `.DS_Store`, a `Thumbs.db`, is no change). For a block like it of your own, `gallery block new <id> --recipe <name>` copies its files into a new block, every word that named it naming the new id (its classes too: `gallery-chart-view-bars` becomes `<scope>-<name>-bars`), its version 0.1.0: change its name, words and description first, and what is still the recipe's in the same folder (writing.md, still about it; `example.html`, still its words: the command's last line names them; its pictures are not copied, `gallery block check` makes its own), then what you came for, and check and try it as any. `gallery block new` refuses the scopes `gallery` and `gallery-soft`.

## Block packs

A block pack (自定义块包) is a scope of blocks shared as one: the folder `components/<pack>/` with a `pack.json` at its top beside a folder for each block, whose ids are `<pack>/<name>` as any block's. Gallery's two packs are packs of this kind, installed into each workspace as it first starts; `local/` is the default pack (默认块包: no `pack.json`, listed first, holding Gallery's own blocks for documents too), where a block made with no scope goes, so that one block needs no pack of its own; any other scope with no `pack.json` is a pack of its own, named by its scope. To share blocks the user made, when they ask: move them into a scope of their own (`team-cards/`), write its `pack.json` and hand over the folder, or a zip of it:

```json
{ "id": "team-cards", "name": { "zh": "团队卡片", "en": "Team cards" }, "description": "…", "version": "1.0.0", "author": "…" }
```

`id` is the scope (lowercase letters, digits and hyphens; not `local`, `gallery` or `gallery-soft`), `name` and `description` words or `{ zh, en }`, `version` `x.y.z`; `homepage` (an http(s) address) and `icon` (an emoji) may follow, nothing else. `gallery block pack install <folder|zip>` installs one into the workspace (copied, each block's version and fingerprint recorded; installed again, a newer version replaces a block as it was installed and keeps one changed since), `gallery block pack list` says the packs there and whether each is on, `gallery block pack remove <pack>` takes one installed out. Each refusal says why: no `pack.json` at its top, a block whose `component.json` does not name it `<pack>/<name>`, a path out of the zip, an id the workspace has a folder of that no install put there. The user installs one too (设置 › 组件列表 › 导入) and turns a pack on or off there: a pack off is in no menu and no library; what is written of its blocks shows as ever. An installed pack's files are not yours to change (installed again, a changed block stays as it is and takes no newer one): for a block like one of it, copy its folder into a scope of your own and rename its id in its files.

## What it says

`gallery block check <id>` prints five sections, each `FAIL <file>:<line>: …` for what to fix and `note …` for what is advice:

1. the manifest: as Gallery reads it, `template.html` there, no text part that holds more than words and marks, a note on a Chinese name no word of `words` spells whole in pinyin, by the count of its syllables;
2. `kit.js`: what a browser refuses, what an export refuses, what it registers, a type check against `sdk/`, what the types alone say of code a browser runs being a note;
3. `style.css`: each selector, what an export cannot hold;
4. `template.html` and `example.html`: as the page of a document, by what `gallery check` runs, and `template.html` as what a menu can put in;
5. both in a temporary document, exported, in Chrome or Edge under the export's policy: the console, a dialog or a window it opens, a page that loads itself again or stops answering, mount and dehydrate, what piles up in the instance or outside it, a text part the block redraws, a data part a mount changes, a write with no gesture once the page takes edits, the way back to the file, a page wider than the window, and the pictures. The way back runs the block's `example` ([Writing back](block-script.md#writing-back)), a small edit made by the change a reader's gesture calls: it must change a data part and nothing else, the server must take what it wrote, and with the part put back, as an undo does, the block must show what it showed. Its `way back` line says what the example wrote, each part and how many of its lines changed, and that the server took it; a note says a write that lays a part out anew (lines a change did not mean, a line left blank), and a list a card is dropped on that listens for `dragover` and not for `dragenter`, at the line of `kit.js` that listens. A block with a data part and no `example` gets a note: nothing has tried its way back (none where that part is its `settings` alone, which the card's form writes and the block only reads). An `example` that changes nothing on an instance (the template's empty one, usually) is a `FAIL` said at `kit.js`; no note for a write that lays JSON out as `context.editJSON` itself does (a part on several lines closing to one line as its list empties, an entry in it opening to lines of its own as it comes to hold an object; a part on one line stays on one line). A note says too that an instance of a block with a data part, in the export's look, still shows an enabled button, field, select or textarea. After the pictures a `下一步：open the N pictures of this run …` line lists them all. Exit 3 and `UNVERIFIED` when no browser ran it, or the browser went while it ran: run it again, or export a document that holds it and look yourself.

With `--documents` it prints a section more for each document of the workspace that holds instances of it, those in another block's slot too: each instance run as the fifth section runs the example, each problem at its line of the document's file (`board/doc.html:15`), no document written.

Exit 0 is all five (and those), exit 1 a failure. A failure with no line is of that file as a whole, or, as `the page`, of what ran. A block the user turned off in 设置 is checked as any, with a note saying so: passing the check does not turn it on, and that stays theirs to do.

## States

| State | In the menus | Instances there already |
| --- | --- | --- |
| available | shown | run and export |
| out of the document's menus: 在文档菜单里显示 off in 设置 › 组件列表, or a block of a page's alone not switched on | not shown in a document's ("/", 在下方新建, the handle's grid); a custom page lists one whose places hold `page` | run and export |
| out of every menu: the block's master switch (at the right of its line in 设置 › 组件列表) off | not shown in a document's menus or a custom page's 添加自定义块; `gallery block` and `gallery page add` still name it | run and export |
| disabled, in 设置, or an `apiVersion` this Gallery does not run | not shown | show what they hold, read-only, with no script and no style, a script of data drawn by Gallery |
| missing, or a block that does not load | not shown | show what they hold, read-only, a script of data drawn by Gallery; `gallery check` says why in a note |

In an export the block's script runs with `context.canEdit()` false: the block is drawn as on the page, read-only, every edit answering false, so draw nothing to drag or press there. What the instance holds shows by itself only where its script does not draw:

- a table part, with JavaScript off, in a Markdown export, and where the block is missing, turned off or failed;
- a script of data, drawn read-only by Gallery where the block is missing, turned off or failed (`context.fail`); nothing of it shows with JavaScript off.

A block whose template a menu cannot take is in no menu in any state; its instances are written by hand as `gallery block show` prints. The user chooses whether a block is in the document's menus and whether it is disabled, a built-in block's place in the menus too (`gallery block list` names those last): the switch is about the menus alone, so a block out of them is still one to write where a document needs it. Write an instance only of what `gallery block list` gives under 文档里可用, never of one disabled or that does not load. A document never loses what an instance holds: moved, copied or sent to someone with no such block, it stays in the file.
