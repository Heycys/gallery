# 工作区统计 (gallery/stats)

A card for a custom page (its places are `page`, its needs `workspace`): four numbers of the workspace, its documents (文档), its to-dos done of all (待办完成, 3/12), the words of all its documents (总字数) and how many documents were edited this week, since Monday (本周编辑). Use it on the home page.

## How to write it

Put it on a custom page as a card of its board, `<section class="gallery-card" data-card-id="…" data-x data-y data-w data-h>`, holding one instance, after `gallery block add stats`: the instance is empty, `<div data-doc-component="gallery/stats"></div>`, everything on it drawn by its script. It has no settings and holds no data: there is nothing to fill in and nothing it writes. Sizes: 8 × 2 (the default: the four in a row), 12 × 2 (the same, larger) and 4 × 4 (two by two).

## How it looks

In Gallery 风格's look (the kit's card tokens, light and dark): a head of a small gray chip and a title, its end clear of the card's grip; one hero; the rest small and gray; the accent on the data and on today alone. It has no head: the four labels are its titles, each after a small picture of what it counts, four cells a hairline apart (two by two on a 4 × 4 card; on a 4 × 2 one, what the phone's flow makes of an 8 × 2, two by two too, the labels and the numbers alone), each a number (28px) and a small chart of its own: the documents a square each, those edited this week in the accent; the words a line of their total over the last 30 days and what those days added (近 30 天 +6万); the to-dos done a bar (70% · 还剩 8 项); the edits this week a bar a day, today's in the accent, against the same days of the week before (比上周同期 +14%). An empty workspace says 0 and what each waits for; where the workspace cannot be read, a dash each.
