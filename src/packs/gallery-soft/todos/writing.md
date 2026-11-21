# 我的待办 (gallery-soft/todos)

A card for a custom page (its places are `page`, its needs `workspace`): the to-dos of every document of the workspace that are not done yet, an item of a to-do list each (`<ul class="doc-todo">`), grouped by document, the one edited last first, each with the headings it stands under. Use it on the home page, or on a page about the user's work.

It is 柔光风格's (the pack `gallery-soft`, off until the user turns it on in 设置 › 组件列表): the same card as Gallery 风格's `gallery/todos`, its settings, its data and what the user does on it the same, in the soft look (a faint wash of blue from the card's top, rounded chips, big numbers). Write it only where the user asked for 柔光风格 or the page already holds its cards.

## Settings

Its two settings are the card's form, which the user opens from the grip at the card's top right › 设置…:

| Key | Label | Type | What it is |
| --- | --- | --- | --- |
| `document` | 只看这篇文档 | document | a document's slug: its to-dos alone; left out, every document's |
| `done` | 也显示已完成的 | switch | the done ones too, checked and struck through |

They are kept in its data part `settings`, a `<script type="application/json">`: `{}` (template.html, what a menu adds) shows the open to-dos of every document. Write `document` when the user asks for one document's to-dos. The block reads them and writes nothing.

## How to write it

Put it on a custom page as a card of its board, `<section class="gallery-card" data-card-id="…" data-x data-y data-w data-h>`, holding one instance, after `gallery block add gallery-soft/todos`, the instance as template.html has it. Sizes: 4 × 4 (the default), 4 × 6 and 8 × 4; the list shows whole rows and scrolls inside the card, a muted line under it saying how many more.

## What the user does

- clicks an item's box: the item is checked (or cleared) in its document, which Gallery writes as the user's own edit; the home page's undo (Ctrl+Z) checks it back. An item checked on the card stays there, struck through, until the page is shown again. Where the item changed meanwhile (its words), the card says so and reads again;
- clicks an item's words: its document opens, at the item where it has a block id;
- clicks a document's title: the document opens.

The card follows by itself: a to-do added, checked or taken out in any document shows at once.

## How it looks

我的待办 beside a checked list's chip on the top line, how many are done of all at its end (a small ring and 18 / 27; 共 27 项 on a tall card; 9 项没做完 · 4 篇文档 on a wide one); the list under it, grouped by document, each group's title small and muted after its document's icon, its count at the end, each to-do a row: a box with a soft ring (the accent's, with a check, once done), its words, the headings it stands under faint at the end; a 4 × 6 card shows over the list a ring of the share done and a key of the two counts, an 8 × 4 card the ring and the key down its left side and the groups two to a row; under the list 还有 4 项 where more are below; all done, the ring full in green over 待办都完成了; in 柔光风格's soft look (as every card of it: a faint wash of blue from the card's top, a head of a rounded tinted chip and a title, its end clear of the card's grip), light and dark. The script runs with the rights of the page's own scripts, as any block's does.
