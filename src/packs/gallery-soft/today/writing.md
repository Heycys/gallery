# 问候与日期 (gallery-soft/today)

A card for a custom page (its places are `page`): a greeting by the time of day (早上好, 下午好, 晚上好), today's date and its weekday, in the language Gallery's UI speaks. Use it at the top of a home page or of any page the user opens every day.

It is 柔光风格's (the pack `gallery-soft`, off until the user turns it on in 设置 › 组件列表): the same card as Gallery 风格's `gallery/today`, its settings, its data and what the user does on it the same, in the soft look (a faint wash of blue from the card's top, rounded chips, big numbers). Write it only where the user asked for 柔光风格 or the page already holds its cards.

## How to write it

Put it on a custom page as a card of its board, `<section class="gallery-card" data-card-id="…" data-x data-y data-w data-h>`, holding one instance, after `gallery block add gallery-soft/today`: the instance is empty, `<div data-doc-component="gallery-soft/today"></div>`, everything on it drawn by its script. It has no settings and holds no data: there is nothing to fill in and nothing it writes.

- Sizes: 4 × 2 (the default: the greeting large, the date and the week's number under it, the week at the bottom) and 2 × 2 (the month and the weekday at the top, the day of the month large, the greeting at the bottom). The user may switch between them.
- Its places hold no document: no document's menu offers it. In a document it would show the same words, framed by nothing.

## How it looks

The greeting large after the sun (by day) or the moon (in the evening), the date under it with the number of the week (第 46 周) at its end, and the week it is in at the bottom, Monday to Sunday, each day's initial over its date, the days gone faint, today's 今 over its date on a disc of the accent; a 2 × 2 card says 11月 · 星期一 at the top beside the sun, the day of the month large, the greeting under it; a glow at the card's top left, warm by day, the accent's blue in the evening; in 柔光风格's soft look (as every card of it: a faint wash of blue from the card's top, a head of a rounded tinted chip and a title, its end clear of the card's grip), light and dark. It changes by itself: the greeting as the hour turns (it hears the kit's clock each minute), the date at midnight. The script runs with the rights of the page's own scripts, as any block's does.
