# 便签 (gallery/note)

A card for a custom page (its places are `page`): a few lines the user types on the card itself, kept in the page. Use it where the user wants to jot something down beside the rest of a page (a reminder, a list for today).

## How to write it

Put it on a custom page as a card of its board, `<section class="gallery-card" data-card-id="…" data-x data-y data-w data-h>`, holding one instance, after `gallery block add note`, the instance as template.html has it: its data part, a `<script type="application/json">` holding `{"text":"…"}` (on one line and compact, as the block writes it back), the note's words, lines apart with `\n`; `{"text":""}` for an empty one, which shows 写点什么.

- Leave the words of a note that is there alone: they are the user's. To start one with words of yours (a list the user asked for), write them in `text`, as example.html does.
- Sizes: 4 × 2 (the default), 2 × 2 (no count of characters) and 4 × 4 are the ones its menu lists; any height from 2 to 8 cells, 2 to 4 wide, is one too (the card's corner reaches each). Words that do not fit scroll inside the card.

## What the user does

They click the card and type. What they typed is written to the page once they leave the card, or press Ctrl+Enter (⌘Enter on a Mac); Enter alone starts a new line, and Esc puts back what was there. Each write is one step of the page's undo. Nothing is written while a Chinese input method is composing.

## How it looks

In Gallery 风格's look (the kit's card tokens, light and dark): a head of a small gray chip and a title, its end clear of the card's grip; one hero; the rest small and gray; the accent on the data and on today alone. Its head is a note's chip, 便签 and how many characters it holds; under it the words, half a size larger than the other cards' on wide 26px lines, each ruled faintly (a hint that it takes writing, not a yellow paper). While the reader types the card is ringed in the accent's wash and a line under the field says the two keys (Ctrl+Enter 保存, Esc 还原; ⌘Enter on a Mac). Empty, it says 写点什么… faintly.
