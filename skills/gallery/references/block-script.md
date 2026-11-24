# The script of a block

A block that does something when a reader uses it, or draws from what changes, has a `kit.js`. This page is its interface (what `mount` is given, the signals it hears, what the kit gives so that no block writes it again) and the one way a block changes its file, `context.edit`, with the two example blocks that show it. A block with no script needs none of it: [building-blocks.md](building-blocks.md) is the block itself. What a script reads beyond its own parts (the workspace, a table of its document, the web) is in [pages-and-data.md](pages-and-data.md).

## Script

`kit.js` is one classic script, no module and no `import`. It runs in a function of its own, on the page and in an offline file, and the types are in `sdk/doc-kit.d.ts`:

```js
DocKit.component({
  id: "local/metrics",
  on: ["source"],
  mount(host, context) {
    const drawn = document.createElement("div");
    drawn.className = "metrics-drawn";
    host.append(drawn);
    const draw = () => { drawn.textContent = context.part("title")?.textContent ?? ""; };
    draw();
    return { update: draw };
  },
});
```

Its manifest says what that draws: `"runtime": { "generated": [".metrics-drawn"] }`.

- `mount(host, context)` starts one instance from what the file says. It runs again on a node an undo puts back, and in an exported file: before each mount the kit takes off what `runtime` names and calls `dehydrate`, so that mount, dehydrate, mount gives the same DOM. `gallery block check` tests it, and names what piles up.
- Whatever it adds to an instance is named in the manifest's `runtime`, `generated` for the nodes it makes and `attrs` for the marks it sets, or taken off in `dehydrate(host)`. A selector there goes down from the instance, and `:scope` is the instance itself (`"attrs": { ":scope": ["aria-busy"] }`). `dehydrate` may be given a host with nothing on it.
- A block draws in its instance, with ordinary elements. Nothing goes on `document.body` or in the head, and no attribute on what stands around the instance: what must stand elsewhere for a while (a tooltip, a popover) `destroy` takes away, and a listener outside the instance ends with `context.signal`. `gallery block check` names what piles up outside. A shadow root is not forbidden, but `gallery qa` and `gallery block check` do not look into one and the kit's theme stops at it, so what stands there goes unchecked.
- No `alert`, `confirm`, `prompt` or `window.open`: a dialog stops a reader's page until it is answered, and the check fails it.
- `on` lists the signals `update(reason, detail)` hears: `source` (a text or data part changed, or what a slot holds, an attribute there that says something of the file among them, a to-do item checked, a cell's span, a color; whoever changed it, an undo too; heard in the next frame, all that changed since in one, `detail` the records; what another instance among a slot's blocks draws is none of it, what its words say is), `editable` (`context.canEdit()` has just become true), `resize`, `theme`, `viewport`, `fonts`, `reveal`, `layout` (a card's size changed where widths do not tell: a resize in the editor, a card of a custom page), `clock` (each whole minute of the reader's clock, `detail` `"minute"`, or `"day"` for the first minute of a day: one timer for every block on the page, so a clock or a date asks for it rather than setting its own), `data` (what the workspace holds changed, `detail` its kind, for what reads it), `content` (a change inside the instance, heard only with `owns: false`, for a block that leaves what it draws to the kit to watch). `owns` (default true): the kit watches nothing the block draws, only its parts.
- `context.part(name)` is a part of this instance (of a slot, its element, to read), `context.state({ version, defaults })` its reading state, of no other instance (kept by its `data-block-id`, else by its markup, what its parts hold left out, and its place among the instances of that markup, so that an edit of its words keeps it), `context.frame(draw)` draws in the kit's frame, `context.signal` ends with the instance (give it to `addEventListener`), `context.fail(error)` says it failed, `context.canEdit()` and `context.edit(name, change)` write back: below.
- What the kit gives so that no block writes it again: `context.readJSON(name)` (a script of data's JSON, parsed, `null` when that is what it says; `undefined` for an optional part it does not hold and for one that holds no JSON, which fails the instance: stop there, and let your own check of what it read fail the rest, `null` included) and `context.editJSON(name, change)` (Writing back); `context.rows(name)` (the rows of the table a part is or holds: `columns`, the header's words; `rows`, each `{ el, values, links }`, its element, its values by the header's words as a chart reads them, a number, its words or null, and the links its cells hold to documents, `{ slug, title, block }`; and `add`, `move`, `remove`, each one write: Writing back); `context.interval(run, ms)`, `context.timeout(run, ms)` and `context.listen(target, type, listener, options)` (cleared and removed as the instance ends; what a timer runs is the instance's, a throw failing it); `context.place` (`"document"`, `"export"`, an exported file, where nothing writes, or `"page"`, a card of a custom page) and `context.size` (on a custom page its card's `{ w, h, width, height }`, cells and pixels, read again on `layout`; null in a document).
- Data beyond its own parts is the kit's too, each for a block whose manifest's `needs` name it ([pages-and-data.md](pages-and-data.md)): `context.workspace` (the workspace's to-dos, documents, counts and edits by day, a table of another document, when its own document was made and last edited, and checking a to-do: [The workspace's data](pages-and-data.md#the-workspaces-data); `needs` `"workspace"`), `context.table()` (the table of its document a view reads: [A view of a table](pages-and-data.md#a-view-of-a-table); `needs` `"tables"`) and `context.fetch` (the web: [Going online](pages-and-data.md#going-online); `needs` `"net:<host>"`).
- Three gestures are the kit's: `DocKit.input(field, { commit, signal: context.signal })` hands `commit(value)` what the reader typed in an `input` or a `textarea`, or chose in a `select`, once they are done (Enter, in a textarea Ctrl+Enter; the field left), never while an input method composes (a Chinese IME's Enter only takes its letters), never twice; Escape puts the value back, and the handle's `set(value)` shows what the file holds now unless the reader is typing there. `DocKit.text(node, { commit, enabled: () => context.canEdit(), placeholder })` makes words your block draws from its data (a title from its settings, a name from a cell of its table) typed in where they stand, as a figure's words are in Gallery: lit with a light blue fill under the pointer, the caret in them at a press, one line, nothing written while they are typed; Enter, Escape or leaving them hands `commit(text)` their words, and `commit` answers whether it wrote (`context.editJSON`'s or `table.set`'s answer: `false` puts the words back); its `set(text)` shows what the file holds now (what the reader is typing there stays), `edit()` puts the caret in them. Keep their element while they are typed in: draw what changed into it rather than making it anew, which takes the reader's words away. Use it for words that say one value of the file, never for words you work out (a count, a sum); in an export they are words. `DocKit.drag(area, { items, over, drop, marker, enabled, signal })` drags what `items` finds in `area` by pointer events, from a few pixels' move on: `over(x, y, item)` says where a drop there goes, `{ into, before, … }` (the `marker` is put in `into` before `before`) or null, `drop(item, spot)` writes on a release over one, Escape or a release elsewhere drops nothing, the item carries the class `doc-dragging` while it moves, for its style, and `enabled: () => context.canEdit()` keeps an export still. Give what a finger drags `touch-action: none`.
- A choice is the kit's too, never a native select's popup (a square white box that follows no theme). A `<select>` in your block opens the kit's flat menu by itself and keeps its `value`, `input` and `change`, so draw one and read it as any select. For a choice from a button of your own, `DocKit.choose(button, { options: [["a", "Alpha"], ["b", "Beta"]], value, signal: context.signal })` opens the same menu under it and answers with the value chosen, or `null` when it was dismissed (Esc, a press outside); an option may be `{ value, label, disabled }`, and `{ group }` a heading. For more than a list (rows with icons, a field and its suggestions, a small form), `DocKit.popover(button, { build(card, handle) { … }, width })` opens the same card with what you put in it, and closes on Esc, a press outside or `handle.close()`. Don't draw a dropdown of your own, and don't call `select.showPicker()`.
- A tooltip is the kit's as well: `data-doc-tip="words"` on any element (`data-doc-tip-sub` a dimmer second line) shows Gallery's dark bubble under it once the pointer rests there, and `data-doc-tip-cut` shows the element's own text only while it is cut short. Write it instead of `title`, which the browser draws as a square box; set the attribute again when the words change.
- A block whose script throws fails that instance alone: it shows what it holds, read-only, its text parts too, until the page is loaded again.
- `kit.js` is type-checked against `sdk/` as strict TypeScript would: a syntax error, a name nothing defines and what the SDK does not say fail the check, and any other word of the types is a note. A part and a draft are typed `HTMLElement`, and `querySelector` gives an `Element`: name what it is, `/** @type {HTMLTableElement} */ (table)`, or test it (`node instanceof HTMLElement`), and guard what can be null (`event.dataTransfer`, `context.part(…)`).
- An export blocks the network: no `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon` or `import()`, and no `eval`. `gallery block check` refuses them, and `localStorage`: what a reader chooses goes in `context.state`. A block that reads the web uses `context.fetch` ([Going online](pages-and-data.md#going-online)), which the check lets through.

The SDK's types are named as they stand, with no `import`: `sdk/doc-kit.d.ts` declares them for every script. `DocComponentContext` is what `mount` is given, `DocComponentHandle` what it returns, `DocComponentSignal` what `update` hears and `DocComponent` what `DocKit.component` registers. A function the mount hands its context to names it so:

```js
/** @param {DocComponentContext} context */
function titleOf(context) {
  return context.part("title")?.textContent?.trim() ?? "";
}
```

A block's script runs with the rights of a document's own script: on the page, with its origin, able to do what any script of the document can. Say so in writing.md when the block has a script, and put in the workspace only what the user or you wrote.

## Writing back

What a reader does in the block goes to the file through a part edited as `data`:

```js
// The row numbered `from` put before the row numbered `before`, or last: one write of the table's rows,
// which takes the blank before the row along, so that a table written a row a line stays so. What a
// drop calls, and the example too.
/** @param {DocComponentContext} context @param {number} from @param {number | null} before */
function move(context, from, before) {
  const rows = context.rows("tasks");
  if (!rows || !rows.rows[from]) return false;
  return rows.move(rows.rows[from], before === null ? { after: rows.rows.at(-1) } : { before: rows.rows[before] });
}

DocKit.component({
  id: "local/board",
  on: ["source", "editable"],
  mount(host, context) {
    const draw = () => { /* draw the board from context.part("tasks"), handles only if context.canEdit(); a drop calls move(context, from, before) */ };
    draw();
    return { update: draw };
  },
  example(host, context) {
    move(context, 0, null);
  },
});
```

`example(host, context)` calls the change a gesture calls (`move` here), on a small edit of its own: `gallery block check` runs it on its way back to the file, so that what it tries is the code a reader's drag or press runs, and an example that writes the part some other way tries nothing a reader does. It runs on every instance of `example.html` and of `template.html`, and the template's is empty: `example()` must change a data part there too (add an entry, set a field; a change of `books[0]` that an empty instance does not hold changes nothing, and fails as `its example(host, context) changes nothing a part holds`, said at `kit.js`), by the function the reader's own control calls, not a copy of it written for the check.

- `context.edit(name, change)` hands `change` a draft of the part, off the page, and what it does to what the draft holds goes onto the page when it returns: draw from the part afterwards, as for any change, on `source`, which comes once `edit` has returned (in the next frame, before it is painted, with whatever else changed since; never inside it). There is nothing to wait for and no save to ask for. Saving, undo, a redo and a conflict with an Agent's write are Gallery's, as for words typed: each `edit` is one undo step, so call it once for a gesture, at its end, and not at every step of a drag. A gesture that writes two parts (a card moved and the move counted) names both in one edit, `context.edit(["tasks", "log"], ({ tasks, log }) => { … })`, and is one step; two edits are two steps.
- Write on a reader's gesture alone, a press, a drop or a key, never as the block mounts or hears a signal: a mount runs each time a page opens it, an undo puts it back or a reader inserts it, and what it writes there a page would write each time, with nothing done. Draw what the parts hold as they are. `gallery block check` fails a block that writes as it mounts, or as it hears `editable` or `source`, once `context.canEdit()` is true.
- Draw a control that writes only while `context.canEdit()`: hide it with `hidden = !context.canEdit()` or disable it (`box.disabled = !context.canEdit()`), so that an export, where nothing is written, shows no button or field that does nothing. The kit holds the `hidden` attribute over any `display` the block's style gives the control (`display: flex` on its class does not show it again), and `gallery block check` notes a control of an instance with a data part that its export still shows enabled.
- It answers at once whether it was taken. `false` means nothing happened. That is so while `context.canEdit()` is false (always in an exported file and its PDF and in 演示视图, and until the page has come to edit: ask for `editable` to hear when; the editing page printed is still the editing page), when `change` throws, when it changed the part on the page rather than the draft it is handed (the draft is what goes in: what the page shows of the part is set back), and when what it made cannot go in the file: a script, an `on…` attribute, an address of code, `data-block-id`, `data-ge-*`, an element that would not read back as itself (a `<tr>` straight in a `<table>` with a `<tbody>`), the part's own tag or attributes changed, or more than 1 MB in one part. The console says which. What goes in is a copy of the draft, so a draft kept after the change returns writes nothing. `change` runs at once: it cannot wait for anything.
- Only what changed is written, only inside that part, and every other byte of the file stays. A `data` part is written whole, so what a change leaves alone in it may come back spelled as a browser spells it: `&#20013;` as `中`.
- A part that nothing edits is never written. So a block that cannot fully read what a part holds (a version it does not know, markup it did not write) leaves it alone and shows it read-only: it never rebuilds it and writes that over it. An edit that changes nothing writes nothing.
- A `<script type="application/json">` part is read with `context.readJSON(name)` and written with `context.editJSON(name, change)`: `change` is handed what the part holds, parsed, and changes it, or returns what is to stand there instead, and the kit writes it back as it was laid out (below), `</` and `<!--`, which could end the script, escaped; a change that leaves the value as it was writes nothing. It is one `context.edit`, and answers as one.
- A table part is read and written with `context.rows(name)`: `add(values, { after })`, `move(row, { before | after, values })` and `remove(row)` are each one write, one undo step, the blank before a row going with it; `move` sets the cells `values` names as it moves the row, so that a card dropped in another column is one step. Each answers as `context.edit` does, and a set is read once: after a write, read the rows again on `source`.
- Keep what a reader only chooses (a filter, what is open) in `context.state`, and write to a part what the document says: what another reader should find there.
- An instance a block wrote can come back through undo: mount and draw from what the parts hold, whatever they hold.
- Someone else may write the file while the page is open (an Agent, another tab, the CLI). An edit of a part they left alone goes in beside what they changed; one of a part they changed waits on a card for the reader, who keeps theirs or writes the page's over it, and nothing of that is the block's to decide. The parts one `context.edit` writes go or wait together, so write in one edit what only makes sense together (a card moved and the count of moves), and in edits of their own what does not. Either way it next finds the part as the file then holds it: by a mount, as the page is shown again once nothing waits, or by `source`, when the reader undoes the choice. Draw from the part each time, never from what an edit last wrote.

### Two examples: a table and a script of data

Two blocks written as this page says show the two kinds of data part. Each writes its part once for a gesture and draws from it on every `source`. Both are blocks a reader changes, so both have a script: make each with `gallery block new <id> --script`, which starts `kit.js` with its registration (with no `--script` the block has none to start from).

| Made with | Its data part | What a reader does | Where its script does not run |
| --- | --- | --- | --- |
| 任务看板, a task board: `gallery block new local/board --script` | `"tasks": { "at": ":scope > table", "edit": "data" }`: a row a task, its first cell the card's title, its second its status; an attribute of the block's own on the instance lists the columns, empty ones too | drags a card to another column or place: its row moves and its status cell takes the column's (adding a task is an edit like a move, when the board offers it) | the table |
| 评分表, a scorecard: `gallery block new local/scorecard --script` | `"scores": { "at": ":scope > script", "edit": "data" }`: `{ "scale": 5, "criteria": [{ "name": "价格", "weight": 3 }], "options": [{ "name": "供应商甲", "scores": [4] }] }` | presses a dot: that score | what the JSON holds, drawn by Gallery where the kit runs and the block does not: an array of objects as a table, an object as keys and values |

Use a table when what the block says reads as a table by itself, rows of words that a reader with no script, a Markdown export or another program should find as written, and that the script arranges and moves. Use a script of data when the block holds values it works from rather than words to read: numbers and true or false, keyed or nested, that a table would hold as words to parse back (a weight, a score for each criterion). Either way, what the block works out (a total, a ranking, a count by column) is drawn, never written beside the data.

A write keeps the part as it is laid out, so that a reader's change is a change of a line or two in the file. Move a row with `context.rows(name)`, which takes the blank before it along, and write JSON back with `context.editJSON`, which writes a part that was on one line back on one line, compact (`JSON.stringify`, no blanks inside: `{"items":[{"text":"a"}]}`, whatever blanks the file had), so write a one-line part that way in `template.html` and `example.html`. Otherwise (a part that spreads over lines) it gives each entry of an object or a list a line of its own, but keeps on one line an object or list whose entries are all values or lists of values (`{ "name": "供应商甲", "scores": [4, 3] }`, `[[1, 2], [3, 4]]`): a list of objects, and an object that holds one, is spread over lines. So lay out the JSON in `template.html` and `example.html` the way editJSON writes it:

```json
{
  "scale": 5,
  "criteria": [
    { "name": "价格", "weight": 3 },
    { "name": "质量", "weight": 2 }
  ],
  "options": [
    { "name": "供应商甲", "scores": [4, 3] }
  ]
}
```

The board's drop and the scorecard's press:

```js
// The board: the row numbered `from` to the column `status`, before the row numbered `before`, or last.
const rows = context.rows("tasks");
if (rows && rows.rows[from]) {
  const values = { [rows.columns[1]]: status };
  rows.move(rows.rows[from], before === null ? { after: rows.rows.at(-1), values } : { before: rows.rows[before], values });
}

// The scorecard: the option numbered `option` given `score` on the criterion numbered `criterion`.
context.editJSON("scores", (data) => {
  data.options[option].scores[criterion] = score;
});
```

While it draws the board, the board hides the table, `table.hidden = true`, a mark its manifest's `runtime` names (`"attrs": { ":scope > table": ["hidden"] }`), so that no file or copy holds it and the table shows wherever the script does not draw. A drag is best made with `DocKit.drag` (Script, above), the board's: pointer events, which work with touch too, a threshold, Escape and a marker, written once. With HTML5 drag and drop, a list a card can be dropped on cancels `dragenter` as well as `dragover`, or a release just as the pointer enters it is refused.

### When the content's shape changes

An instance may say in which shape it holds its content, `data-doc-schema="2"`, a whole number you choose and write in the block's template and examples, and the manifest's `schema` says the newest its script reads. An instance past that, or one whose `data-doc-schema` is no number, was written by a newer version of the block: it is read-only whole, its text parts too, `context.canEdit()` is false for it, the block shows it read-only, and `gallery check` says so in a note. A block upgrade never touches a document: to move content to a new shape, change it as a task of its own.
