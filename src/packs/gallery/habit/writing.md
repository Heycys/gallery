# 习惯打卡 (gallery/habit)

A card for a custom page (its places are `page`): one habit, checked in once a day. It shows the habit's name, how many days in a row it was done (up to today, or up to yesterday while today is not checked yet), how many days in all, and the last seven days as dots. Use it for something the user means to do every day. For a habit counted otherwise (glasses of water in a day, minutes, a goal a week), start a block of your own from it: `gallery block new <scope>/<name> --recipe habit` copies its files, which are written to be read and changed.

## How to write it

Put it on a custom page as a card of its board, `<section class="gallery-card" data-card-id="…" data-x data-y data-w data-h>`, holding one instance, after `gallery block add habit`, the instance as template.html has it: its data part `habit`, a `<script type="application/json">`, holding `{"name":"…","days":[]}` (on one line and compact, as the block writes it back):

- `name`: the habit, a few words (每天读书半小时); `""` shows 给习惯起个名字, and the user names it on the card.
- `days`: the days it was done, each `YYYY-MM-DD` by the user's clock, in order, each once. Leave the days of a card that is there alone: they are the user's record.

Sizes: 4 × 2 (the default: the name, the streak and the button, this week's seven days), 2 × 2 (the name, the streak, the button as wide as the card) and 4 × 4 (the last five weeks as a month).

## What the user does

- presses 打卡: today goes in `days`; pressed again (✓ 已打卡), today comes out. Each press is one write, one step of the page's undo.
- clicks the name and types another: written as they press Enter or leave the field (never while a Chinese input method composes); Esc puts back the name there was.

## How it looks

In Gallery 风格's look (the kit's card tokens, light and dark): a head of a small gray chip and a title, its end clear of the card's grip; one hero; the rest small and gray; the accent on the data and on today alone. Its head is a ringed check's warm chip, the habit's name (a field: click to rename) and the days in all (共 41 天); the streak is the hero (44px, 天连续 after it), the button at its right a pale blue 打卡, a pale green ✓ 已打卡 once pressed (a press takes it back). A 4 × 2 card's foot is this week, seven circles Monday to Sunday: a day done the accent with a tick, one missed a soft gray, today ringed in the accent (今), the days to come an outline. A 4 × 4 card shows the last five weeks as a month instead, the days of the streak in the accent, those done before it its pale tint, with how many were done. Never checked in, it says 还没打过卡 where the streak stands. It changes by itself at midnight.
