# 习惯打卡 (gallery-soft/habit)

A card for a custom page (its places are `page`): one habit, checked in once a day. It shows the habit's name, how many days in a row it was done (up to today, or up to yesterday while today is not checked yet), how many days in all, and the last seven days as dots. Use it for something the user means to do every day. For a habit counted otherwise (glasses of water in a day, minutes, a goal a week), start a block of your own from it: `gallery block new <scope>/<name> --recipe habit` copies its files, which are written to be read and changed.

It is 柔光风格's (the pack `gallery-soft`, off until the user turns it on in 设置 › 组件列表): the same card as Gallery 风格's `gallery/habit`, its settings, its data and what the user does on it the same, in the soft look (a faint wash of blue from the card's top, rounded chips, big numbers). Write it only where the user asked for 柔光风格 or the page already holds its cards.

## How to write it

Put it on a custom page as a card of its board, `<section class="gallery-card" data-card-id="…" data-x data-y data-w data-h>`, holding one instance, after `gallery block add gallery-soft/habit`, the instance as template.html has it: its data part `habit`, a `<script type="application/json">`, holding `{"name":"…","days":[]}` (on one line and compact, as the block writes it back):

- `name`: the habit, a few words (每天读书半小时); `""` shows 给习惯起个名字, and the user names it on the card.
- `days`: the days it was done, each `YYYY-MM-DD` by the user's clock, in order, each once. Leave the days of a card that is there alone: they are the user's record.

Sizes: 4 × 2 (the default: the name, the streak and the last seven days, today's dot the button), 2 × 2 (the name, the streak, a button as wide as the card under it) and 4 × 4 (the streak, the longest one and the button, over the last four weeks as a calendar).

## What the user does

- presses 打卡 (on a 4 × 2 card, today's dot): today goes in `days`; pressed again (✓ 已打卡), today comes out. Each press is one write, one step of the page's undo.
- clicks the name and types another: written as they press Enter or leave the field (never while a Chinese input method composes); Esc puts back the name there was.

## How it looks

The name beside a ringed check's warm chip on the top line, the days in all at its end (共 42 天); the streak large, 连续打卡 over it. On a 4 × 2 card the last seven days beside it, a disc each, the accent's with a check where done, today's a ring of the accent with a plus that is itself the button (pressed, it fills); on a 2 × 2 card the button under the streak, as wide as the card (打卡, pale blue; once done a pale green ✓ 已打卡 that a press takes back); on a 4 × 4 card the longest streak in a gray pill (最长 18 天) and the button beside the streak, the last four weeks under them, Monday first, a day done tinted, today ringed, the days to come faint; in 柔光风格's soft look (as every card of it: a faint wash of blue from the card's top, a head of a rounded tinted chip and a title, its end clear of the card's grip), light and dark. It moves to the next day by itself at midnight (it hears the kit's clock). A habit never checked in shows, where the streak stands, 还没打过卡 over 从今天开始, until its first check-in. Where nothing can be written (an export) nothing can be pressed, and the button is a line saying whether today is done. The script runs with the rights of the page's own scripts, as any block's does.
