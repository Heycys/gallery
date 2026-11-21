# 倒计时 (gallery-soft/countdown)

A card for a custom page (its places are `page`): how many days are left until a date, 就是今天 on the day, and how many days have gone since after it. Use it for a day the user waits for or counts from (a holiday, a deadline, an anniversary).

It is 柔光风格's (the pack `gallery-soft`, off until the user turns it on in 设置 › 组件列表): the same card as Gallery 风格's `gallery/countdown`, its settings, its data and what the user does on it the same, in the soft look (a faint wash of blue from the card's top, rounded chips, big numbers). Write it only where the user asked for 柔光风格 or the page already holds its cards.

## Settings

Its two settings are the card's form, which the user opens from the grip at the card's top right › 设置…:

| Key | Label | Type | What it is |
| --- | --- | --- | --- |
| `title` | 名称 | text | the name of the day, as 春节 or 项目上线; left empty, the card says 还有 / 已经过去 alone |
| `date` | 日期 | date | the day, `YYYY-MM-DD` |

They are kept in its data part `settings`, a `<script type="application/json">`, as example.html does: `{"title":"春节","date":"2027-02-06"}` (on one line and compact, as the card's 设置… writes it back). Write them there when the user tells you the day, or `gallery page add <slug> gallery-soft/countdown --set date=2027-02-06 --set title=春节` with the add; the date is the one setting it cannot show anything without (`required` in its manifest): ask the user for it when they did not say which day. `{}` (template.html, what a menu adds) is a card with no date yet, which asks for one (右上角手柄 › 设置…), and `gallery page check` notes it. The block reads them and writes nothing.

## How to write it

Put it on a custom page as a card of its board, `<section class="gallery-card" data-card-id="…" data-x data-y data-w data-h>`, holding one instance, after `gallery block add gallery-soft/countdown`, the instance as template.html has it, then its settings as above. Sizes: 2 × 2 (the default) and 4 × 2 (a small page of a calendar beside the count).

## How it looks

The day's name beside an hourglass's chip on the top line (春节; 倒计时 where it has none), the count of days large at the bottom, 还有 (or 已过) before it and 天 after it, muted, the date under it (2月6日 周六; on a 4 × 2 card 2027年2月6日 星期六, and a small page of a calendar at the right, the month on a band of the accent over the day); on the day itself 就是今天 in the accent; with no date a calendar in a soft disc over 还没有设日期 and where to set it (右上角手柄 › 设置…); in 柔光风格's soft look (as every card of it: a faint wash of blue from the card's top, a head of a rounded tinted chip and a title, its end clear of the card's grip), light and dark. The count moves by itself at midnight (it hears the kit's clock). The script runs with the rights of the page's own scripts, as any block's does.
