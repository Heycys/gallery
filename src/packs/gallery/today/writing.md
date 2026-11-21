# 问候与日期 (gallery/today)

A card for a custom page (its places are `page`): a greeting by the time of day (早上好, 下午好, 晚上好), today's date and its weekday, in the language Gallery's UI speaks. Use it at the top of a home page or of any page the user opens every day.

## How to write it

Put it on a custom page as a card of its board, `<section class="gallery-card" data-card-id="…" data-x data-y data-w data-h>`, holding one instance, after `gallery block add today`: the instance is empty, `<div data-doc-component="gallery/today"></div>`, everything on it drawn by its script. It has no settings and holds no data: there is nothing to fill in and nothing it writes.

- Sizes: 4 × 2 (the default: the date and the week's number at the top, the greeting large, this week at the bottom), 2 × 2 (a page of a desk calendar: the greeting, today's day of the month large, its weekday and month) and 4 × 1 (one line: the greeting and the date). The user may switch between them.
- Its places hold no document: no document's menu offers it. In a document it would show the same words, framed by nothing.

## How it looks

In Gallery 风格's look (the kit's card tokens, light and dark): a head of a small gray chip and a title, its end clear of the card's grip; one hero; the rest small and gray; the accent on the data and on today alone. The chip is the sun in its warm color by day and the moon in the accent's in the evening, and so is a soft glow at the card's top left, the one mood of a home page. On a 4 × 2 card the greeting is 28px and this week sits at the bottom, seven days, the days gone fainter, today the one solid square of the accent; a 2 × 2 card is a page of a desk calendar, today's day of the month 56px; a 4 × 1 card one line. It changes by itself: the greeting as the hour turns (it hears the kit's clock each minute), the date at midnight. The script runs with the rights of the page's own scripts, as any block's does.
