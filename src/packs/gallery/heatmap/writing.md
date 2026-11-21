# 编辑热力图 (gallery/heatmap)

A card for a custom page (its places are `page`, its needs `workspace`): how much the workspace was edited each day of the past year, as GitHub draws a year of contributions, a column a week, a square a day, darker for a day of more. What it counts is Gallery's own record of edits (the reader's saves and the Agent's writes, by day, since the workspace's first start of a Gallery that keeps it): the edits of a day, or with its setting the words it added. Use it on the home page.

## Settings

Its one setting is the card's form, which the user opens from the grip at the card's top right › 设置…:

| Key | Label | Type | What it is |
| --- | --- | --- | --- |
| `words` | 按字数显示 | switch | each day by the words it added, not by how many edits it had |

It is kept in its data part `settings`, a `<script type="application/json">`: `{}` (template.html, what a menu adds) counts edits. Write `{"words":true}` when the user asks for the words written. The block reads it and writes nothing.

## How to write it

Put it on a custom page as a card of its board, `<section class="gallery-card" data-card-id="…" data-x data-y data-w data-h>`, holding one instance, after `gallery block add heatmap`, the instance as template.html has it. Sizes: 8 × 4 (the default: 14 weeks and the figures beside them), 12 × 4 (26 weeks and the figures), 4 × 4 (10 weeks under a line of the total), 12 × 3 (a year, the total in the head), 8 × 3 (about 33 weeks, the total in the head) and 8 × 2 (the squares alone, about 44 weeks: no head, figures or legend): as many weeks as the card holds are drawn, the last ending today.

## How it looks

In Gallery 风格's look (the kit's card tokens, light and dark): a head of a small gray chip and a title, its end clear of the card's grip; one hero; the rest small and gray; the accent on the data and on today alone. Its head is a chip of nine squares and 编辑热力图. The squares are the hero, five shades of the accent by how a day stands among the days recorded, today's ringed, the months' names over them and 一 三 五 beside them, less to more under them; a day before the record began is a small gray dot, never an empty square. On an 8 × 4 or 12 × 4 card the figures stand at their left: the edits of the weeks shown, large, the average a day, the days with any, the longest run of them and today's, and a bar of how the reader's and the Agent's edits split. A pointer on a square shows its day, its edits and whose they were. 按字数显示 counts the words each day added instead.
