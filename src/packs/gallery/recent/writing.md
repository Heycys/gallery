# 最近编辑 (gallery/recent)

A card for a custom page (its places are `page`, its needs `workspace`): the documents of the workspace edited last, the last first, each with its page icon, its title and when it was edited (刚刚, 5 分钟前, 昨天, 11月2日). Use it on the home page, for the user to go back to what they were working on.

## How to write it

Put it on a custom page as a card of its board, `<section class="gallery-card" data-card-id="…" data-x data-y data-w data-h>`, holding one instance, after `gallery block add recent`: the instance is empty, `<div data-doc-component="gallery/recent"></div>`, everything on it drawn by its script. It has no settings and holds no data: there is nothing to fill in and nothing it writes. Sizes: 4 × 4 (the default), 4 × 2 (the last three, no groups) and 4 × 6 are the ones its menu lists; it is 4 wide and any height from 2 to 8 cells. As many whole rows as the card holds, and how many more there are under them.

## What the user does

Clicks a document: it opens. The list follows by itself: a document written, renamed or given another icon, made or taken away shows at once, and the times move on each minute.

## How it looks

In Gallery 风格's look (the kit's card tokens, light and dark): a head of a small gray chip and a title, its end clear of the card's grip; one hero; the rest small and gray; the accent on the data and on today alone. Its head is a clock's chip, 最近编辑 and how many were edited today; then rows like the sidebar's, grouped as 今天, 昨天, 本周 and 更早, each the document's icon, its title and its time at its end (12 分钟前, then the hour; yesterday's hour; this week's weekday, 周二; earlier ones the date). A row under the pointer takes the hover's gray. No document yet: it says so in the middle.
