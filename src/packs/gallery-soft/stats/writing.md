# 工作区统计 (gallery-soft/stats)

A card for a custom page (its places are `page`, its needs `workspace`): four numbers of the workspace, its documents (文档), its to-dos done of all (待办完成, 3/12), the words of all its documents (总字数) and how many documents were edited this week, since Monday (本周编辑). Use it on the home page.

It is 柔光风格's (the pack `gallery-soft`, off until the user turns it on in 设置 › 组件列表): the same card as Gallery 风格's `gallery/stats`, its settings, its data and what the user does on it the same, in the soft look (a faint wash of blue from the card's top, rounded chips, big numbers). Write it only where the user asked for 柔光风格 or the page already holds its cards.

## How to write it

Put it on a custom page as a card of its board, `<section class="gallery-card" data-card-id="…" data-x data-y data-w data-h>`, holding one instance, after `gallery block add gallery-soft/stats`: the instance is empty, `<div data-doc-component="gallery-soft/stats"></div>`, everything on it drawn by its script. It has no settings and holds no data: there is nothing to fill in and nothing it writes. Sizes: 8 × 2 (the default: the four in a row), 12 × 2 (the same, larger, the words added this week beside their line), 4 × 2 (two by two, the numbers alone) and 4 × 4 (two by two, each with the small thing under it).

## How it looks

No head: four cells, each its small chip and name (文档, 总字数, 待办完成, 本周编辑) over its number, large, its unit muted (38 篇, 12.6 万字, 18 / 27, 11 篇), and under each a small thing of its own: the words a document holds on average; how the words grew over the last 30 days, a line washed under it (on a 12 × 2 card the words this week added in a green pill and the last 14 days); the share of the to-dos done as a bar; this week's edits day by day as small bars, today's in the accent, the days to come a stub. It reads the workspace's record of edits for the line and the bars (`workspace.query("activity")`); in 柔光风格's soft look (as every card of it: a faint wash of blue from the card's top, a head of a rounded tinted chip and a title, its end clear of the card's grip), light and dark. Where the workspace cannot be read (an export) each number is a dash and a line says it shows when opened in Gallery. The script runs with the rights of the page's own scripts, as any block's does.
