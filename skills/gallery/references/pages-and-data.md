# Custom pages, and what a block reads beyond its own parts

A block stands in a document, on a custom page (自定义页: a page of the user's that you design, a board of cards being one way to write it; [Working on a custom page](#working-on-a-custom-page) is the flow on a page) or in both. [building-blocks.md](building-blocks.md) is the block itself (the kinds of part, the files, the manifest, an instance, its style, and the two places side by side in A document and a custom page) and [block-script.md](block-script.md) is its script. This page holds what only some blocks need: the manifest fields that place a block, size it as a card and give it settings; the flow of a block made for a page; and the three things a block may read beyond its own parts, each a `needs` entry: the workspace's data (`workspace`), a table of its document (`tables`) and the web (`net:<host>`).

## Working on a custom page

A custom page is the user's own page in the workbench's sidebar, yours to design when they ask for a page or a card ("首页加一张卡片…", "给我做一个读书页"): the folder `pages/<slug>/` of the workspace, `page.html` (any HTML, CSS and script of yours, [below](#a-page-is-yours-to-design); a board of cards is one way: `<div class="gallery-board" data-board-id="main">`, each card a `<section class="gallery-card" data-card-id="…" data-x data-y data-w data-h>` around one custom block's instance, in square cells, twelve to a row) and `page.json` (its title and icon), opened at `/#@<slug>`. A page is no document: no opening summary, no source line, no export, and no 写作偏好 to read for rules (a `gallery list` that made it in passing changes nothing of that). A card made for "me" (my tasks) needs who that is: a setting of the card, not written into a block's code, asked or taken as step 4 says (写作偏好 may name them: read it for that alone).

On a board the user moves, resizes, adds and deletes cards there (the grip at a card's top-right corner: a drag moves it, a click opens its menu, 大小, 设置… and 删除; 添加自定义块 is the first row of the ··· menu in the workbench's top bar, and puts a card on the page's first board), and types in them. Keep that corner clear (28 × 28 px, 6px in). The page draws no big title: its name is the sidebar's, the tab's and the top bar's, so write no `<h1>` of the page's name (one in `header.gallery-page-head` is not drawn). Its look is yours to choose (a header of your own that is no title, colors of its own in its `<style>`), written for both themes. Its own scripts are yours too, a board or none; what a card does is its block's, which the server puts in.

Reordering, renaming and trashing pages, and changing a card already on one, are the user's to ask you for, not yours to do unasked. When they ask: `gallery page set <page> --title … --icon …` renames, `gallery page move <page> --after <page>|--first` reorders, `gallery trash <page>` trashes (`gallery trash restore` puts it back), `gallery page card <page> <card id>` sets (`--set k=v`), moves (`--move x,y`), resizes (`--size w,h`) or removes (`--remove`) a card, and `gallery page reset-cards <page>` brings back the default cards (`gallery help page` has the options). They write through the server, so the open page updates at once.

1. Run `gallery page list` and `gallery block list` first: the pages there are, and the blocks a card can be (自定义页可用, and Gallery's own not yet added). "首页" is `pages/home` (a page as any: the user may rename or trash it). Gallery makes it once, when its server first starts in a workspace (`gallery init` does too), with its own cards, which the user may have moved, filled in or taken off; until then `gallery page list` and the commands of `home` say it is not made yet, and `gallery open --no-browser` makes it: run that once, then again. Extend it with `gallery page add home <block>`, not by writing its `page.html` over whole; one the user trashed stays away. A new page only when the user asks: `gallery page new <slug> "<title>"`. A blank page they made in the sidebar (新建页面, `page-…`, an empty main) is one to write whole.
2. Send the user the address now, in a message of its own: the `交给用户（…）：` line of `gallery page new <slug> "<title>"` (a server running prints it; without one, `gallery page open <slug> --no-browser` does), or of `gallery page open home --no-browser` for the home page. The user watches the cards arrive.
3. On a page that is there, change only the cards the request needs. Every other card keeps its `data-card-id`, its place and its data parts as they are: the user placed them, and a note's words are theirs. Put a card on with `gallery page add <slug> <block>` (the first free spot by the block's default size, or `--x --y --w --h`; it gives the card its id and pushes down what it meets); a change you make in `page.html` by hand replaces that card alone.
4. Use one of Gallery's own blocks when it fits the request exactly (two packs: Gallery 风格's by a bare name, and 柔光风格's as `gallery-soft/<name>`; `gallery block add <name>` puts one in, and comes before `gallery page add`): `today`, `note`, `countdown`, `habit`, `weather` (a city's weather, from Open-Meteo: it goes online), and `todos`, `recent`, `stats`, `heatmap`, which read the workspace (its to-dos, the documents edited last, its counts, its edits by day; the user ticks a to-do on `todos`, and the tick is written into the document it is in as the user's own edit, which the page's Ctrl+Z takes back); and `gallery/static` for a card that only shows what you write (a heading, links, a short list, a picture: its file in `pages/<slug>/assets/`, written `assets/<file>`; it is for a custom page alone, a document's HTML is written as it is; it takes any size of cells, 4 × 4 at first, and does not grow with its words, so write the `data-w` and `data-h` it needs).
   - When one is close but not exact (other fields, another look, another rule), rather than settling for it, copying it is usually the quickest start (writing one from nothing, below, is fine too): `gallery block new <id> --recipe <name>`, then change the copy (a count by day, glasses of water or times, starts from `habit`: `gallery block new <id> --recipe habit`; a recipe takes no `--script`, `--flow`, `--data` or `--page`): its name, words, description, writing.md and example.html, which the command lists; Gallery's own stays as it ships.
   - Make a block of your own from nothing ([building-blocks.md](building-blocks.md), and [A block for a custom page](#a-block-for-a-custom-page) below for a card's size and settings; `gallery block new <id> --page --data` for a card that keeps what the user enters, `places` holding `page`) for a card that does something or keeps data the user changes that none of Gallery's is near, and for a read-only card over the workspace's data or the web's that none of Gallery's shows (a count by day, a rate, a feed, the rows of another document's table: `kanban`, `metric` and `chart-view` are views inside a document and read no table from a page): it is a block too (`needs` `workspace` or `net:<host>`; start from `heatmap` or `weather` with `--recipe`), not the page's own script or HTML. What a card holds stays in its card (a data part, its settings), not in the page's own HTML.
   - A card that shows nothing without a setting the user did not give (`weather`'s city, `countdown`'s date, a block of your own with its owner) is asked about: ask the user, or take it from what the workspace says (写作偏好, the documents; ask when that is a guess), and tell them in the handoff what it holds and where you took it from, or that the card still asks for it. Give it with the add, `gallery page add home weather --set city=上海` (each `--set <key>=<value>`, no JSON to quote, held to the setting's type: a date is `YYYY-MM-DD`); for a card already there, `gallery page card <slug> <card id> --set <key>=<value>`. `gallery page check` notes a card whose required setting is empty.
   - The switches of 设置 › 组件列表, when the user asks for one: `gallery block pack on|off <pack>` (柔光风格 is off until they ask), `gallery block menu on|off <block>` (whether the documents' "/" menu offers it), `gallery block net on|off <block>` (allow it to go online: it lists the sites first; only when the user explicitly asks for that block).
5. Try each gesture of a new block on its card: `gallery page try <slug> <card id> --press <selector>` (the gestures and `--steps` of `gallery block try`, on a scratch copy of the page): its `Wrote:` lines name that card's data parts alone, then the page's own Ctrl+Z gives the copy back and a fresh page reads it back; a write anywhere else (another card, the card's place) is a `FAIL`, and its exit codes are `gallery block try`'s. Then `gallery page check <slug>` until it prints `OK`: each `FAIL page.html:<line>` (an id missing or twice, cards sharing cells or past the row, a block a page does not run, a file of `assets/` not there or a frame of one, a card whose content does not fit it, a script of the page that never ends; the page's own scripts and stylesheets pass). Its pictures (the page at 1280, 1920 and 600px wide, light and dark) are there to open when you want to see the page; read its `Changes since …` lines: they name the cards you meant to change and no other, but those that end `(the user's, on the page)`, the user's own gestures on the page since the last check (a card moved, words typed in it): leave those as they are, and do not put one back. A line that ends `(put there by Gallery)` is the home page's own today or note, there before you came (a new workspace's first check of `home` lists them): leave those too. A note that a card was pictured before the workspace answered its read means its picture says nothing of what it shows: open the page in Gallery or check again. `UNVERIFIED` (exit 3) is a page not looked at in a browser (its structure was checked): run it once more.
6. At the end tell the user what you changed (each card, by what it shows) and where: the page's title in the sidebar (with 新建 and 搜索), and the address again. A card that goes online (`weather`, or a block whose needs name `net:<host>`) shows nothing until the user allows it: tell them to press 允许访问 on the card ([Going online](#going-online)).

## A page is yours to design

A custom page's `page.html` is written as the request wants it: any HTML, CSS and script of your own, a board of cards, or both on one page. A board is what the user rearranges: its cards are moved, resized, added and deleted on the page, and what a card holds (a block's parts) is the user's to change; what the page's own HTML and script show, only you change. Write it inside `<main class="gallery-page">` (the page then follows the workbench's theme: its dark colors under `:root[data-doc-effective-theme="dark"]`), and its own files (a picture, a stylesheet, a script) in `pages/<slug>/assets/`, written `assets/<file>`. `gallery page check` takes a page's own scripts and stylesheets as they are, and fails what still matters: a board's cards where it has them, a file of `assets/` that is not there, a page that throws or does not load. A blank page the user made in the sidebar (新建页面: its slug `page-…`, an empty `<main class="gallery-page">`, which shows the user to ask an Agent) is one to write whole.

## Places, cards, settings and needs

A block stands in a document's flow, or as a card on a custom page's board (自定义页: a page of the workspace's own, its board laid out on a grid of square cells, twelve to a row), or both: one block, one manifest and one `context` for either. Four fields of the manifest say how; each may be left out.

```json
{
  "places": ["page", "document"],
  "card": { "sizes": [[2, 2], [4, 2], [4, 4]], "resize": true, "fit": "fixed", "bare": false },
  "settings": [
    { "key": "city", "label": { "zh": "城市", "en": "City" }, "type": "text", "default": "上海" },
    { "key": "unit", "label": { "zh": "单位", "en": "Unit" }, "type": "select", "options": ["℃", "℉"], "default": "℃" }
  ],
  "needs": ["workspace", "net:api.open-meteo.com"]
}
```

| Field | What it holds |
| --- | --- |
| `places` | `"document"`, `"page"` or both, each once: `["document"]` when left out. A block of a page's alone is in no document's menu until the user switches it on (设置 › 组件列表, 在文档菜单里显示); a custom page lists only blocks whose places hold `page` and that the user has not switched off (the master switch at the right of a block's line in 设置 › 组件列表 takes it out of every menu and of that list; what is written of it keeps showing, and `gallery page add` still names it), and a card of one whose places do not, written on a page all the same, says so there and does not run |
| `card` | its size on a board, in cells: `sizes`, the sizes the user picks from, `[w, h]` each, 1 to 12 wide and 1 to 24 high, the first the default (a phone's small, medium and large widget; the card's 大小 menu lists them, and dragging its corner snaps to the nearest, so a block that takes any size of the board's cells writes `min` and `max` beside them, `"min": { "w": 1, "h": 1 }, "max": { "w": 12, "h": 24 }`: the sizes then only the common ones the menu lists, each inside `min` and `max`); or, with no `sizes`, `w` (4 when left out) and `h` (the fewest whole cells its content takes when left out), with `min` and `max` as `{ w, h }`, which hold the default between them. `resize`: whether the user may drag its edge (false when left out); `fit`: `"fixed"` (the default: what does not fit scrolls in the card) or `"content"` (the card grows with what it holds and pushes the cards under it down, for a list that changes length); `bare`: true for no frame of the board's around it; `consent`: for a block online, the line Gallery's consent banner on its card says, `{ "zh": "允许联网之后显示汇率", "en": "Allow internet access to show the rates" }` (what the user gets once they allow it; left out, 允许联网之后显示内容). With `sizes` and `"content"` together the width is the size the user picked, and the height is the content's, in whole cells, drawn and never written: a size's `h` is only the `data-h` the file holds, where `gallery page add` and the page's service put the card and what stands beside it, so write the cells its content takes at a usual length; a longer content is drawn higher and pushes the cards under it down, a shorter one is drawn lower and leaves its room empty. Read only where its places hold `page` |
| `settings` | the fields of the card's form (its menu's 设置…), each `{ key, label: { zh, en }, type, options, default, required }`: `key` a lowercase letter then letters and digits, each once; `type` one of `text`, `number`, `select` (with `options`, a list of words), `date` (`YYYY-MM-DD`), `switch`, `document` (a document's slug); `default` of that type; `required: true` for a setting the card cannot show anything without (weather's city: a card with none asks the reader for it, and `gallery page check` notes it). A block with settings has a part named `settings`, edited as data, a `<script type="application/json">` holding their values by key, which its `template.html` holds as a new card's (`{}` takes each default), and reads them with `context.readJSON("settings")` |
| `needs` | what it uses, each once: `workspace` (the workspace's data: its to-dos, recent documents, counts, edits by day, a table of another document: The workspace's data, below), `tables` (it is a view of a table of its document: A view of a table, below), `net:<host>` (the network, of that host alone: a lowercase host name, no port and no path, `*.` first for the names under it, never the name itself; the user consents first: Going online, below). 设置 › 组件列表 shows them |

A cell is 64px square whatever the window, 16px from the next, so a card `w` cells wide is `w × 64 + (w − 1) × 16` px (4 cells: 304px; 12: 944px, the board's whole row, in the middle of the page) and as high by `h`; the frame's 16px padding comes off that for the block (a 4 × 2 card holds 272 × 112 px; the frame's line is a ring outside it). A wider window or the sidebar folded only leaves more room beside the board. A narrower one (the sidebar dragged wide, a small window) shows the board's narrow view: 8 columns of 64px, which the user arranges on its own (a drag there writes each card's `data-narrow-x`, `-y`, `-w`, `-h`); until then the cards one after another in the order of their places, each as large as it is but no wider than the row (`context.size.w` says it, on `layout`). A phone's width shows as many columns as fit, 4 at the least, the same way. Write a card's twelve-column place and leave `data-narrow-*` to the narrow view (`gallery page card <page> <card> --narrow --move x,y` moves a card there when the user asks). So size a card for the content at 64px cells, and take a big number or a long list's room from its cells, never from the window.

What a reader edits in each place is in [Which kind of part](building-blocks.md#which-kind-of-part) and [A document and a custom page](building-blocks.md#a-document-and-a-custom-page). So a block for a custom page keeps what a reader changes in a data part, with a field of its own or the card's settings, and no slot. On a page each `context.edit` is written at once, a step of the page's own undo (Ctrl+Z there takes it back, and the part with it); one made after someone else changed the same card is refused and the page shown again as the file is, so the block draws from what its parts hold (`source`), never from what it wrote last. `gallery block check` refuses a slot on such a block, notes each of its text parts (read-only on a custom page), notes a `card` on a block whose places hold no page, and fails a block with settings whose template holds no JSON object in its settings part. A field the manifest gets wrong (a place it does not know, a size off the grid, a setting's type or default, a need it does not know) keeps the block from loading, and `gallery block list` says why.

## A block for a custom page

Gallery's own blocks in a workspace (`components/gallery/<name>/`) follow Gallery: a copy as it was added is brought up to a newer Gallery's by itself, as the workspace's server starts or reads its blocks, so change no file of one (a copy someone changed stays at its version, Gallery's newer one not put over it); for a card like one of them, start your own from it with `gallery block new <id> --recipe <name>`.

Make one only where no block of Gallery's does the job and the card does something or keeps data the user changes: a card that only shows what you write is `gallery/static` (step 4 of [Working on a custom page](#working-on-a-custom-page); a heading it starts with, where more follows, is drawn as the cards' head row). The flow is [the one of building-blocks.md](building-blocks.md#the-flow), with the page in place of the document:

1. `gallery page list` and `gallery block list`, then `gallery block new <id> --page` (with `--data` for a card that keeps what a reader enters, as the goals card below: its field, its buttons and an `example()` that works on an empty card), its places `["page"]` already (and `"document"` too only when a document may hold it).
2. Its files: the manifest with `card` and, where the user sets something per card, `settings`; `template.html` holding a new card's data, the settings part `{}`; `kit.js` drawing from the parts on `source`, writing them by `context.edit` or `context.editJSON`, and reading its size on `layout` (`context.size`, the card's cells and pixels: lay a small card out otherwise than a big one). What a reader types goes through a field the block draws (`DocKit.input`: Enter or leaving it commits, never while an input method composes), never a text part, which a page shows read-only; no slot (a page holds no document's blocks: the check refuses one). Then `gallery block check <id>` until it prints `OK`.
3. `gallery page add <slug> <id>` puts a card of it on the page, at the first free spot by its default size, and prints its `data-card-id`. Where the card has settings the user or the request names (a city, an owner), give them with the add: `--set <key>=<value>` for each (`gallery page add home local/goals --set title=本周目标`; no JSON to quote, so no quoting for a shell to take out, and each value held to its setting's type before anything is written). One it cannot show anything without, marked `required: true` in the manifest, left out, the add says so after the card and `gallery page check` notes it: ask the user, or take it from what the workspace says (写作偏好 where it names them, the documents) and tell them in the handoff which you did. A card already on the page takes its setting by a hand edit of its settings part, in the card's own `<script type="application/json">`, `{"title":"…"}` as the block's writing.md shows, that part alone changed; the user has the card's grip (top right) › 设置….
4. `gallery page try <slug> <card id> <gesture>` for each gesture a reader makes on it (`--press`, `--drag … --to`, `--key`, `--type`, `--select`, `--then` and `--steps`, as `gallery block try` takes them, on a scratch copy of the page): its `Wrote:` lines name the card's data parts and say `nothing else in page.html changed (card ids aside)`; a write anywhere else, the card's place or another card, fails. Then the page's own undo (Ctrl+Z) gives the copy back, and a fresh page reads the card back as it was. A setting is the card's menu's 设置…, which the block only reads: its way back needs no trial.
5. `gallery page check <slug>`, until it prints `OK` (its pictures, 1280, 1920 and 600px wide, light and dark, there to open when you want to see the page): a card whose content does not fit it scrolls inside it, which the check fails; give it the cells it needs, or `"fit": "content"` for one whose length changes (the check pictures the card as the file's data fills it now, a new card's, so a list that grows is seen long by trying a gesture on it that adds entries, or by filling it as the user will). A card that reads the workspace (Gallery's `todos`, `recent`, `stats`, `heatmap`, or your own block that reads `context.workspace`) is pictured once the workspace has answered, for up to 15 seconds; one still unanswered is a `note page.html:<line>: card <id> (<block>): the workspace had not answered its read of …` line, and the `OK` line then ends `; but N cards were pictured before the workspace answered it (see "note" above), so their pictures do not show what they read`. Such a picture says nothing of what the card shows: open the page in Gallery to see it, or run the check again.

Its look: the kit's card tokens, as Gallery's own cards draw theirs, so that it sits among them in both themes. Its type is `--gallery-font`, 13px. A head 20px high of a chip (`--gallery-chip-size` square, `--gallery-chip-radius`, `--gallery-fill` behind an icon of lines in `--gallery-muted`, `--gallery-chip-icon` wide) and a title (`--gallery-title-size`, 600, `--gallery-text`), a quiet meta right after it where the card has a few words to say of itself (`--gallery-meta-size`, `--gallery-faint`: 共 24 天, 今天 3 篇), 8px apart, the row one line, its end kept clear of the card's grip, which the board puts in the card's top-right corner (`padding-inline-end: var(--gallery-grip-room, 0px)` on its first row); one hero, a big number at `--gallery-numeral-weight` and `--gallery-numeral-tracking` in `--gallery-text-strong` (`--gallery-hero-size` for the card's one main number, `--gallery-figure-size` for one among others), its unit after it at `--gallery-unit` (13px), 3px from it, in `--gallery-muted`; labels in `--gallery-muted`, captions in `--gallery-faint`, lines `--gallery-hair`; the accent for a ring or a bar toward a target (on `--gallery-track`), green and red (`--gallery-good`, `--gallery-bad`, their `-soft` for a pill) only for a good or a bad state; `--gallery-face-gap` between rows; what the card is about in the middle of the room under its head at every size (a foot, a date or a week, at the bottom); the pieces of a meta line a muted 3px dot apart. With nothing to show yet, the cards' empty face under its head: a line of what is so (13.5px, 600) over what to do (12px, `--gallery-faint`), and one pale button where the reader can do it. The frame is the board's: draw no border, fill or shadow of the card's own. A button has no line: a primary one pale (`--gallery-accent-soft`, its words in `--gallery-accent-ink`), the others no fill until the pointer is on them (`--gallery-hover`).

A goals card, its title a setting and its goals a script of data, a field adding one and a box ticking one off:

```json
{
  "id": "local/goals",
  "apiVersion": 1,
  "version": "1.0.0",
  "name": { "zh": "本周目标", "en": "This week's goals" },
  "description": { "zh": "几个目标，在卡片上加，做完打勾", "en": "A few goals, added on the card and ticked when done" },
  "words": "benzhoumubiao mubiao goals week 目标",
  "parts": {
    "goals": { "at": ":scope > script.goals-data", "edit": "data" },
    "settings": { "at": ":scope > script.goals-settings", "edit": "data" }
  },
  "runtime": { "generated": [":scope > .goals-title", ":scope > .goals-list", ":scope > .goals-new"] },
  "places": ["page"],
  "card": { "sizes": [[4, 3], [2, 3], [4, 4]], "resize": true },
  "settings": [{ "key": "title", "label": { "zh": "标题", "en": "Title" }, "type": "text", "default": "本周目标" }]
}
```

<!-- the file holds -->
```html
<div data-doc-component="local/goals">
  <script type="application/json" class="goals-data">{"items":[]}</script>
  <script type="application/json" class="goals-settings">{}</script>
</div>
```

```js
DocKit.component({
  id: "local/goals",
  on: ["source", "editable", "layout"],
  mount(host, context) {
    const title = document.createElement("h3");
    title.className = "goals-title";
    const list = document.createElement("ul");
    list.className = "goals-list";
    const field = document.createElement("input");
    field.className = "goals-new";
    field.placeholder = "加一个目标";
    host.append(title, list, field);
    const typed = DocKit.input(field, {
      signal: context.signal,
      commit(value) {
        if (!value.trim()) return;
        context.editJSON("goals", (data) => { data.items.push({ text: value.trim(), done: false }); });
        typed.set("");
      },
    });
    context.listen(list, "change", (event) => {
      const box = event.target;
      if (!(box instanceof HTMLInputElement)) return;
      context.editJSON("goals", (data) => { data.items[Number(box.value)].done = box.checked; });
    });
    const draw = () => {
      const data = context.readJSON("goals");
      if (data === undefined) return; // no JSON: the instance has failed, and Gallery shows what it holds
      title.textContent = context.readJSON("settings")?.title || "本周目标";
      list.replaceChildren(...data.items.map((/** @type {{ text: string, done: boolean }} */ item, /** @type {number} */ at) => {
        const row = document.createElement("li");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.value = String(at);
        box.checked = item.done;
        box.disabled = !context.canEdit();
        row.append(box, ` ${item.text}`);
        return row;
      }));
      field.hidden = !context.canEdit();
      host.classList.toggle("goals-narrow", (context.size?.w ?? 4) < 3);
    };
    draw();
    return { update: draw };
  },
});
```

Tried on its card, a goal typed and a box ticked: `gallery page try home c7 --type .goals-new 跑步三次 --then Enter`, then `gallery page try home c7 --steps steps.json` with `[{ "type": [".goals-new", "读完一本书"], "then": "Enter" }, { "press": ".goals-list li:first-child input" }]`.

## The workspace's data

A block whose manifest's `needs` hold `"workspace"` reads what the workspace holds, in a document as on a custom page, no consent asked (it is the user's own; `context.workspace` is there for such a block alone). `context.workspace.query(kind, options)` resolves to `{ data, at }` of one kind:

| Kind | Options | `data` |
| --- | --- | --- |
| `todos` | `{ done, slugs, limit }` | `[{ ref, text, done, slug, title, icon, path }]`: each to-do of every document, those of the document edited last first, `icon` its document's (as `recent` gives it), `path` the headings above it, `ref` what `setTodo` names it by |
| `recent` | `{ limit }` | `[{ slug, title, icon, edited }]` |
| `stats` | none | `{ documents, todos: { done, total }, words, editedThisWeek }` |
| `activity` | `{ days }` | `[{ date, edits, words, reader, agent }]`: the edits and the words added by day, from the day Gallery started keeping them |
| `table` | `{ slug, key, where, limit }` | `{ columns, rows: [{ values, links }], total }`: a table of another document by its key (`data-doc-chart-source`: A view of a table, below), read-only, the rows whose cells hold the words `where` names, as `context.table()` gives rows |
| `document` | `{ slug }`: in a document, that one where left out | `{ slug, title, icon, created, edited, editedBy, words }`: one document's own, `created` when it was made, `edited` when its file was last written (the reader's edits and yours alike), ISO times; `editedBy` who made its last change, `"reader"` (the user in Gallery) or `"agent"` (anyone else: you), null where Gallery has no record |

- List `data` in `on` and read again when `update` hears it with that kind as its `detail`: a to-do checked in any document, a document written, comes at once.
- A query that cannot be answered rejects with an `Error` whose `code` says why: `offline` (an exported file that holds none of that kind, or a server that does not answer: draw a line saying the card shows its data when opened in Gallery, never a failure), `failed` (the server answered and could not read it: say the data could not be read) and `missing` (`table`: no such document, no table of that key in it, or one with merged cells; `document`: no such document). `kind`, `options` and `unsupported` are mistakes of the block's own query.
- `context.workspace.open({ slug, block })` (or `{ page }`) opens a document, at a block of it, or a custom page, as a click on a link to it would.
- `context.workspace.setTodo(ref, done)` checks or clears a to-do by the `ref` a `todos` query gave. The server writes it into that document as the reader's own edit: a page open on the document merges it, and on a custom page the page's undo (Ctrl+Z) checks it back. It resolves to whether the document changed (`false`: it said so already) and rejects with a `code`: `changed` (the item is not as read, its words changed or it is gone: read again and draw what is there), `ambiguous` (several items alike and the file changed since), `locked` (the item is where no page can check it: in a table cell, in a block of the document's own), `missing`, `busy`, `offline`, `ref`, `failed`. Call it on the reader's gesture and draw the box from the data, never from what it last checked. An exported file has no `setTodo`: draw the boxes read-only where `if (context.workspace.setTodo)` is false.
- **In an exported file** each kind is answered from the snapshot the export embedded (the to-dos, 200 at most, the 50 documents edited last, the counts, the days, its own `document` and the tables the document's blocks asked for), `at` the time of the export: a figure the block draws says "截至 …" with it. A kind the snapshot holds none of rejects `offline`.
- Gallery's own `todos`, `recent`, `stats` and `heatmap` do all of this: for a card of the workspace's data start from one (`gallery block new <id> --recipe <name>`).
- A line under a document's title saying when it was made and last edited, and by whom, is a block of this kind: places `["document"]`, `needs` `["workspace"]`, `on` `["data"]`, drawing `query("document")` as it mounts and again on `data` (each save of the document sends it), its instance written where the user wants the line.
- What no kind answers, tell the user so rather than keep a stand-in up by hand (a stamp each later write must renew).

## A view of a table

A block whose `needs` hold `"tables"` can be a view of a table of the document: a board of its rows, a count, a chart of your own drawing. It stands in a document, beside a table of the same document; a card of a custom page, which holds no table, that shows the rows of a document's table (a project's tasks, the ones that are the user's) is a block of your own with `needs` `["workspace"]` that reads `context.workspace.query("table", { slug, key })` (The workspace's data, above): `kanban`, `metric` and `chart-view` are of no use there. The table stays an ordinary table the reader edits as any, which any number of views (and charts drawn from a table) read at once, and a document whose block is missing or broken still shows the table, editable. The instance names the table by a key, the same one a chart drawn from a table reads it by: the table carries `data-doc-chart-source` (which Gallery moves onto the table's frame as it takes the table in), the instance `data-doc-from`.

<!-- you write -->
```html
<table data-doc-chart-source="tasks">
  <thead><tr><th>任务</th><th>状态</th><th>负责人</th></tr></thead>
  <tbody>
    <tr><td>写方案</td><td>待办</td><td>小王</td></tr>
    <tr><td>做评审</td><td>进行中</td><td>小李</td></tr>
  </tbody>
</table>
<div class="board" data-doc-component="local/board" data-doc-from="tasks">
  <h3>本周任务</h3>
</div>
```

A key is a letter, then letters, digits, `_` or `-`, 32 at most, and names one table of the document. The reader binds one in the page too: a block that reads tables is a row of "/" like any, and one made there reads the nearest table above it, the table given a new key when it has none or an earlier table carries the same key; its handle's 设置… lists the document's tables to read another. Its template holds no `data-doc-from`: each instance has its own.

```js
DocKit.component({
  id: "local/board",
  on: ["data", "editable"],
  mount(host, context) {
    const draw = () => context.frame(() => {
      const table = context.table();
      if (!table) return; /* no table to read: say so in the block */
      if (!table.columns.includes("状态")) return; /* the column renamed: say which one it looks for */
      /* a card a row: table.rows, each { el, values, links }; keep a row's card while the row is the same object */
    });
    draw();
    return { update: draw };
  },
});
```

- `context.table()` reads the table when it is called: `columns`, the header's words, and `rows`, each `{ el, values, links }` as `context.rows` gives them, its values by the header's words (a number where a cell writes one, its words, or `null`), in the file's order (a reader sorting the table by its header leaves it). A row is the same object until it or the header changes, so keep what you drew of a row while it is the same and draw again only the rows that are new: a view of a long table that draws everything again at each keystroke in it slows typing in the table. `null` where it has no table to read: no `data-doc-from`, no table carrying that key, a table with a merged cell, on a custom page (which holds no table), and for a block whose needs hold no `"tables"`.
- It hears its table by `data`, its detail `"table"`, whenever a change leaves the rows other than they were (a cell typed in, a row added, moved or taken out, the key changed, the table deleted or put back by an undo), also once it has a table where it had none; or by `table.subscribe(listener)`, which returns the function that takes the listener off. Read the table again each time.
- It changes the table only by asking: `table.set(row, column, text)` (one cell's words, plain; a list of rows sets that cell of each in one step, a group renamed, and a last argument `{ editJSON: ["settings", (settings) => …] }` writes the block's own part in the same step, the group's name in its settings too), `table.add(values, { after })`, `table.move(row, { before | after, values })` (its cells of `values` set in the same step: a card dropped in another column) and `table.remove(row)`. Each is one undo step of the page's, made as the table's own tools make it, and answers whether it was made: the file follows by itself, someone else's change of the same cell is merged word by word with the reader's, and a move, add or removal over someone else's change of the table waits on a card for the reader. `false` in an exported file and in 演示视图, before the page edits, for a row no longer in the table, for the last row of the body (`remove`) and for a table Gallery's tools do not manage (a merged cell, a `<tfoot>`, rows of different lengths). A name the header does not have throws.
- `table.canEdit()` says whether the page would take a change of the table now, asked with no change: false in an exported file, in 演示视图, before the page edits and for a table Gallery's tools do not manage, so draw the view read-only there (no handle, no button that adds or takes out a row) rather than show controls whose every write answers `false`.
- The reader puts a view in from "/" (or 在下方新建), below the table it is to read or any block after it: it reads the nearest table above it. An Agent writes the table's key and the instance's `data-doc-from` itself, as above.
- Task boards, numbers and charts over a table are views Gallery ships: `gallery/kanban`, `gallery/metric` and `gallery/chart-view` (`gallery block add <name>`, before the instance is written: one written first stays read-only until the block is added; `gallery block show gallery/<name>` prints how to write each, a table and then the instance below it, its settings one line of JSON). Use them first; write a view of your own only for one they do not give.
- Never write the table yourself: not its cells, not its rows, not by `context.edit`, which writes the block's own parts alone. What the view draws is its own; the table is the document's.
- Keep what a reader only chooses in the view (its sort, a filter, what is folded) in `context.state`, never in the table.
- A column it reads by its name may be renamed by the reader: then say in the block which column it looks for, and keep the name in the block's own data part (the column it groups by), where the reader or you can change it, rather than fix it in the script.
- Its own parts are as any block's: a title, a data part of its own (what it counts, which column it groups by). A view has no slot of the table's rows: the table stands beside it.
- `gallery check` fails a `data-doc-from` that no table's frame carries, or that two carry, or that is not on an instance, and notes a table with merged cells, a table of more than 500 rows (every view of a table reads it again as it is typed in), a block whose needs hold no `"tables"`, and a view written above its table (it works there; each block's writing.md writes the table first, and so does the example).

## Going online

A block that shows something of the web (a rate, the weather, a feed) names each host it reaches in its needs, `"needs": ["net:api.frankfurter.dev"]`, and reads it with `context.fetch(url, { as })`, which only such a block has: Gallery's server fetches for it (a GET, no cookie, an answer of JSON or text of at most 512 KB, kept a minute and given again when the network is not there), from those hosts alone, an address of the public internet alone (nothing of this computer or a private network), and only once the user has allowed it. Never a bare `fetch`, which the check refuses and an export blocks. Before you write the block, `curl -i` the address you mean to ask: an API that has moved answers a 301 or 302 to another host, and then every fetch rejects `host` (a redirect to a host the needs do not name is refused), so name the host the address ends at, or take another API, one that needs no key (the sample's does not).

```js
DocKit.component({
  id: "local/rate",
  on: ["source"],
  async mount(host, context) {
    const line = document.createElement("p");
    host.append(line);
    try {
      const { data, at } = await context.fetch("https://api.frankfurter.dev/v2/rate/USD/CNY");
      line.textContent = `1 USD = ${data.rate} CNY · ${new Date(at).toLocaleTimeString()}`;
    } catch (error) {
      const { code } = /** @type {DocFetchError} */ (error);
      line.textContent = code === "consent" ? "允许联网之后显示汇率" : code === "offline" ? "现在连不上网" : "没能取到汇率";
      if (!code) throw error;
    }
  },
});
```

- **It resolves** with `{ data, at, cached }`: `data` the answer's JSON (`as: "json"`, the default) or its text (`as: "text"`), `at` when it was fetched (an ISO time: say it on the card, 更新于 …, as an answer may be old where the network is not there), `cached` whether it was given from what was kept. Fetch again on `source` (a setting changed) and on a timer (`context.interval`, every few minutes at least: an answer of the last minute is given again, and a block may make 20 fetches a minute).
- **It rejects** with an `Error` whose `code` says why, which the block draws a state for: `consent` (the user has not allowed it yet; `hosts`, those waiting), `offline` (no network or the site not reached, and nothing kept; in an exported file, nothing embedded), `status` (the site answered an error, `status`), `type` (no JSON or text), `too-large`, `rate`, `key`, `private` (below), and `host` or `url` for an address it may not ask for (a host its needs do not name, or a redirect to one; another port, a user in it, not http(s), its own or a redirect's): fix the block. `private` is usually the reader's network setup, not the block: the address the name resolved to is on this computer or a private network, and no proxy on this computer took the name (the address is http, there is no proxy, the proxy is on another machine, or it is not running; an https address whose name resolves so is reached through a proxy on this computer by its name, its certificate held to the name). The Error's message names the host and the address, and `host` is set. Draw a plain state for it in the reader's words, as `gallery/weather` does (网络设置把天气服务指向了本地地址), not the generic failure.
- **Consent.** Until the user allows the block, every fetch rejects `consent` and Gallery draws over its card, under its head row, a banner of its own: your manifest's `card.consent` (else 允许联网之后显示内容), 数据来自 the site its hosts share (else <host> 等 N 个网站) and a button, 允许访问 (on a card three cells wide or less, the line over the button); pressed, Gallery asks the user, and once they say yes the block starts again by itself (its mount runs anew, and fetches). The user can take it back in 设置 › 组件列表 (允许联网), and the block starts again and asks. Draw a short state of your own for `consent` too (the button stands over it). The banner starts 36px down (a 16px padding and a 20px head row), its sides and foot 16px in, on the card's fill; a face with other room says its own on the instance: `--gallery-consent-top` (just under its head), `--gallery-consent-pad` and `--gallery-consent-fill`. In the handoff, tell the user to press 允许访问 on the card. The consent is the user's to give: turn it on yourself (`gallery block net on <block>`, which lists the sites first) only when they explicitly ask you to, and do not write it into `gallery.json` (its `components.net`) by hand, nor ask `gallery block try` or `gallery page try` to; `gallery page check`'s pictures show the card asking.
- **A key.** An API that wants one in its address names where it goes by `{key}`, in its path or its query (`https://api.example.com/v6/{key}/latest`, `…/latest?apikey={key}`), and `gallery block key <host> <key>` keeps the user's key for that host in the workspace (`.gallery/keys.json`): the server writes it in as it fetches, and no page, cache or export ever holds it. Never write a key into the block's files or a page. Prefer an API that needs none. An API that takes its key in a header alone is not reached.
- **A document and its export.** In a document an instance fetches as on a page; its export holds what the document's instances were given last (`context.fetch` answers from it, `cached: true`) and, for an address it holds nothing of, rejects `offline`: draw a placeholder for that, as the example does. `context.place` is `"export"` there.
