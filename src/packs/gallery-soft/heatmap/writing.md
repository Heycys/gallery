# 编辑热力图 (gallery-soft/heatmap)

A card for a custom page (its places are `page`, its needs `workspace`): how much the workspace was edited each day of the past year, as GitHub draws a year of contributions, a column a week, a square a day, darker for a day of more. What it counts is Gallery's own record of edits (the reader's saves and the Agent's writes, by day, since the workspace's first start of a Gallery that keeps it): the edits of a day, or with its setting the words it added. Use it on the home page.

It is 柔光风格's (the pack `gallery-soft`, off until the user turns it on in 设置 › 组件列表): the same card as Gallery 风格's `gallery/heatmap`, its settings, its data and what the user does on it the same, in the soft look (a faint wash of blue from the card's top, rounded chips, big numbers). Write it only where the user asked for 柔光风格 or the page already holds its cards.

## Settings

Its one setting is the card's form, which the user opens from the grip at the card's top right › 设置…:

| Key | Label | Type | What it is |
| --- | --- | --- | --- |
| `words` | 按字数显示 | switch | each day by the words it added, not by how many edits it had |

It is kept in its data part `settings`, a `<script type="application/json">`: `{}` (template.html, what a menu adds) counts edits. Write `{"words":true}` when the user asks for the words written. The block reads it and writes nothing.

## How to write it

Put it on a custom page as a card of its board, `<section class="gallery-card" data-card-id="…" data-x data-y data-w data-h>`, holding one instance, after `gallery block add gallery-soft/heatmap`, the instance as template.html has it. Sizes: 8 × 4 (the default: the squares and the figures beside them), 6 × 4 (the squares alone, less to more under them), 12 × 4 (more weeks), 8 × 3 (the squares and the total beside them, with the days that had edits and today's) and 8 × 2 (the squares alone, smaller, about 43 weeks: no head, figures or legend): as many weeks as the card holds are drawn, the last ending today.

## How it looks

编辑热力图 beside a chip of nine squares on the top line, less to more at its end (on a 6 × 4 card the count and the weeks instead); the squares large (22px, 20px on a 6 × 4 card), a column a week, Monday at the top, a month's name over the week it begins in, today ringed in the accent, a day before the record began a faint dot, the shade of each by where its day stands among the days of any edit; the pointer on a square says its day, its count and how much of it was the user's and how much the Agent's. Beside the squares on an 8 × 4 or 12 × 4 card: what they count (近 14 周编辑), its total large, the days with edits of the days recorded and today's, the average a day and the day of the most, and a bar of two shares, 你 and Agent; while nothing is counted yet, since when it records and what it will show; in 柔光风格's soft look (as every card of it: a faint wash of blue from the card's top, a head of a rounded tinted chip and a title, its end clear of the card's grip), light and dark. The script runs with the rights of the page's own scripts, as any block's does.
