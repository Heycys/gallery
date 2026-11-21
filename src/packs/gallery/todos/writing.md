# 我的待办 (gallery/todos)

A card for a custom page (its places are `page`, its needs `workspace`): the to-dos of every document of the workspace that are not done yet, an item of a to-do list each (`<ul class="doc-todo">`), grouped by document, the one edited last first, each with the headings it stands under. Use it on the home page, or on a page about the user's work.

## Settings

Its two settings are the card's form, which the user opens from the grip at the card's top right › 设置…:

| Key | Label | Type | What it is |
| --- | --- | --- | --- |
| `document` | 只看这篇文档 | document | a document's slug: its to-dos alone; left out, every document's |
| `done` | 也显示已完成的 | switch | the done ones too, checked and struck through |

They are kept in its data part `settings`, a `<script type="application/json">`: `{}` (template.html, what a menu adds) shows the open to-dos of every document. Write `document` when the user asks for one document's to-dos. The block reads them and writes nothing.

## How to write it

Put it on a custom page as a card of its board, `<section class="gallery-card" data-card-id="…" data-x data-y data-w data-h>`, holding one instance, after `gallery block add todos`, the instance as template.html has it. Sizes: 4 × 4 (the default), 4 × 6 and 8 × 4; the list scrolls inside the card.

## What the user does

- clicks an item's box: the item is checked (or cleared) in its document, which Gallery writes as the user's own edit; the home page's undo (Ctrl+Z) checks it back. An item checked on the card stays there, struck through, until the page is shown again. Where the item changed meanwhile (its words), the card says so and reads again;
- clicks an item's words: its document opens, at the item where it has a block id;
- clicks a document's title: the document opens.

The card follows by itself: a to-do added, checked or taken out in any document shows at once.

## How it looks

In Gallery 风格's look (the kit's card tokens, light and dark): a head of a small gray chip and a title, its end clear of the card's grip; one hero; the rest small and gray; the accent on the data and on today alone. Its head is a checked list's chip, 我的待办 and how many are open. A 4 × 4 card shows how many are done as a line (已完成 19 / 27 and the percent) over a row of ticks, one an item, done in the accent (a bar past 48); a 4 × 6 card a ring of the share beside the open count large (8 项没完成), its head saying how many documents they come from; an 8 × 4 card a ring at the left over a key (已完成, 未完成, 来自文档), each item's headings at its right. The list is grouped by document, small and gray (its icon, its title, its open count), each item a box, its words and the headings it stands under; it fades at its foot while there is more under it. An item checked on the card stays, struck through, until the page is opened again. With none, or all done (a full green ring with a tick), it says so in the middle.
