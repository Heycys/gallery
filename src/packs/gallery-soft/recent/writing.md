# 最近编辑 (gallery-soft/recent)

A card for a custom page (its places are `page`, its needs `workspace`): the documents of the workspace edited last, the last first, each with its page icon, its title and when it was edited (刚刚, 5 分钟前, 昨天, 11月2日). Use it on the home page, for the user to go back to what they were working on.

It is 柔光风格's (the pack `gallery-soft`, off until the user turns it on in 设置 › 组件列表): the same card as Gallery 风格's `gallery/recent`, its settings, its data and what the user does on it the same, in the soft look (a faint wash of blue from the card's top, rounded chips, big numbers). Write it only where the user asked for 柔光风格 or the page already holds its cards.

## How to write it

Put it on a custom page as a card of its board, `<section class="gallery-card" data-card-id="…" data-x data-y data-w data-h>`, holding one instance, after `gallery block add gallery-soft/recent`: the instance is empty, `<div data-doc-component="gallery-soft/recent"></div>`, everything on it drawn by its script. It has no settings and holds no data: there is nothing to fill in and nothing it writes. Sizes: 4 × 4 (the default), 4 × 2 and 4 × 6 (labels of today, yesterday, this week and earlier between the rows) are the ones its menu lists; it is 4 wide and any height from 2 to 8 cells; the list shows whole rows and scrolls inside the card, a muted line under it saying how many more.

## What the user does

Clicks a document: it opens. The list follows by itself: a document written, renamed or given another icon, made or taken away shows at once, and the times move on each minute.

## How it looks

最近编辑 beside a clock's chip on the top line, how many were edited today at its end (今天 4 篇); the documents as rows like the sidebar's, each its icon (an emoji as the sidebar draws it, a page on a soft gray square for one with none), its title and when it was edited at the end (刚刚 in the accent, 12 分钟前, 昨天, 11月2日); on a 4 × 6 card faint labels of 今天, 昨天, 本周 and 更早 between them; on a 4 × 2 card two rows at the bottom; under the list 还有 17 篇 where more are below; in 柔光风格's soft look (as every card of it: a faint wash of blue from the card's top, a head of a rounded tinted chip and a title, its end clear of the card's grip), light and dark. The times move on by themselves (it hears the kit's clock). The script runs with the rights of the page's own scripts, as any block's does.
