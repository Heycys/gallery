# 便签 (gallery-soft/note)

A card for a custom page (its places are `page`): a few lines the user types on the card itself, kept in the page. Use it where the user wants to jot something down beside the rest of a page (a reminder, a list for today).

It is 柔光风格's (the pack `gallery-soft`, off until the user turns it on in 设置 › 组件列表): the same card as Gallery 风格's `gallery/note`, its settings, its data and what the user does on it the same, in the soft look (a faint wash of blue from the card's top, rounded chips, big numbers). Write it only where the user asked for 柔光风格 or the page already holds its cards.

## How to write it

Put it on a custom page as a card of its board, `<section class="gallery-card" data-card-id="…" data-x data-y data-w data-h>`, holding one instance, after `gallery block add gallery-soft/note`, the instance as template.html has it: its data part, a `<script type="application/json">` holding `{"text":"…"}` (on one line and compact, as the block writes it back), the note's words, lines apart with `\n`; `{"text":""}` for an empty one, which shows 写点什么.

- Leave the words of a note that is there alone: they are the user's. To start one with words of yours (a list the user asked for), write them in `text`, as example.html does.
- Sizes: 4 × 2 (the default), 2 × 2 and 4 × 4 are the ones its menu lists; any height from 2 to 8 cells, 2 to 4 wide, is one too (the card's corner reaches each). Words that do not fit scroll inside the card.

## What the user does

They click the card and type. What they typed is written to the page once they leave the card, or press Ctrl+Enter (⌘Enter on a Mac); Enter alone starts a new line, and Esc puts back what was there. Each write is one step of the page's undo. Nothing is written while a Chinese input method is composing.

## How it looks

A sheet of paper: the paper's warm fill and faint ruled lines the words sit on, a head of a warm chip, 便签 and how many characters it holds (65 字) at its end, the words under it in the page's font, as many lines as the card holds whole; an empty one says 写点什么 (on a wide card 写点什么，比如今天要记住的事), faint; while the user types, a line at the bottom says how to keep and how to drop it (Ctrl+Enter 保存, Esc 放弃); in 柔光风格's soft look (as every card of it: a faint wash of blue from the card's top, a head of a rounded tinted chip and a title, its end clear of the card's grip), light and dark. Where nothing can be written (an export) the words show read-only. The script runs with the rights of the page's own scripts, as any block's does.
