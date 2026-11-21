# 倒计时 (gallery/countdown)

A card for a custom page (its places are `page`): how many days are left until a date, 就是今天 on the day, and how many days have gone since after it. Use it for a day the user waits for or counts from (a holiday, a deadline, an anniversary).

## Settings

Its two settings are the card's form, which the user opens from the grip at the card's top right › 设置…:

| Key | Label | Type | What it is |
| --- | --- | --- | --- |
| `title` | 名称 | text | the name of the day, as 春节 or 项目上线; left empty, the card says 还有 / 已经过去 alone |
| `date` | 日期 | date | the day, `YYYY-MM-DD` |

They are kept in its data part `settings`, a `<script type="application/json">`, as example.html does: `{"title":"春节","date":"2027-02-06"}` (on one line and compact, as the card's 设置… writes it back). Write them there when the user tells you the day, or `gallery page add <slug> gallery/countdown --set date=2027-02-06 --set title=春节` with the add; the date is the one setting it cannot show anything without (`required` in its manifest): ask the user for it when they did not say which day. `{}` (template.html, what a menu adds) is a card with no date yet, which asks for one (右上角手柄 › 设置…), and `gallery page check` notes it. The block reads them and writes nothing.

## How to write it

Put it on a custom page as a card of its board, `<section class="gallery-card" data-card-id="…" data-x data-y data-w data-h>`, holding one instance, after `gallery block add countdown`, the instance as template.html has it, then its settings as above. Sizes: 2 × 2 (the default) and 4 × 2 (the month of the date beside the count, the day marked).

## How it looks

In Gallery 风格's look (the kit's card tokens, light and dark): a head of a small gray chip and a title, its end clear of the card's grip; one hero; the rest small and gray; the accent on the data and on today alone. Its head is an hourglass's chip and the day's name; at the bottom 还有 (or 已经过去) over the count of days, 44px, and the date faint under them (2027年2月6日 周六). On the day itself 就是今天 in the accent stands where the count was. A 4 × 2 card sets the month of the date at its right, Monday first, the day the one solid square of the accent. With no date it says 选一个日子 and where to set one.
