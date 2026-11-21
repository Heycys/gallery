# 天气 (gallery-soft/weather)

A card for a custom page (its places are `page`): a city's weather now (the sky's picture and words, the temperature, today's highest and lowest, how it feels, the humidity and the wind) and, on a tall card, the next five days. The data comes from Open-Meteo (open-meteo.com), which needs no key. Use it when the user asks for the weather on a page, its home page among them.

It is 柔光风格's (the pack `gallery-soft`, off until the user turns it on in 设置 › 组件列表): the same card as Gallery 风格's `gallery/weather`, its settings, its data and what the user does on it the same, in the soft look (a faint wash of blue from the card's top, rounded chips, big numbers). Write it only where the user asked for 柔光风格 or the page already holds its cards.

## Settings

Its two settings are the card's form, which the user opens from the grip at the card's top right › 设置…:

| Key | Label | Type | What it is |
| --- | --- | --- | --- |
| `city` | 城市 | text | the city, as the user names it: 上海, 杭州, Berlin; looked up by that name, its first match taken |
| `unit` | 单位 | select | `℃` (the default) or `℉` |

They are kept in its data part `settings`, a `<script type="application/json">`, as example.html does: `{"city":"上海","unit":"℃"}` (on one line and compact, as the card's 设置… writes it back). The city is the one setting it cannot show anything without (`required` in its manifest): when the user did not say which, ask them, or take it from what the workspace says of where they live (写作偏好, the documents; a trip is not a home: ask when that is a guess), and tell them in the handoff which you did; never hand over a card with no city unsaid. `gallery page add <slug> gallery-soft/weather --set city=上海` writes it with the add (`--set unit=℉` the unit); for a card already there, write the city in its settings part. `{}` (template.html, what a menu adds) is a card with no city yet, which asks for one (右上角手柄 › 设置…), and `gallery page check` notes it. The block reads them and writes nothing.

## Going online

Its needs name the two hosts it reaches, `net:api.open-meteo.com` (the weather) and `net:geocoding-api.open-meteo.com` (a city's name to its coordinates). Gallery fetches nothing for it until the user allows those: the card then shows 允许访问 api.open-meteo.com 等 2 个网站, a press of which opens Gallery's consent dialog, and the card fetches once the user says yes. Tell the user so when you put the card on a page ("点卡片上的「允许访问」"). They can take it back in 设置 › 组件列表 (允许联网). Never write the consent into gallery.json yourself: it is the user's to give.

## How to write it

Put it on a custom page as a card of its board, `<section class="gallery-card" data-card-id="…" data-x data-y data-w data-h>`, holding one instance, after `gallery block add gallery-soft/weather`, the instance as template.html has it, then its settings as above (`gallery page add <slug> gallery-soft/weather` does the card for you). Sizes: 4 × 2 (the default: now, the range and how it feels, the humidity and the wind), 2 × 2 (the temperature and the sky alone) and 4 × 4 (and the next five days).

## How it looks

The city beside a cloud's chip and when the weather was fetched (更新于 14:05) at the top, the sky's picture in its own colors (the sun, a cloud and its shade, rain) and the temperature large beside it, the sky's words and the range beside them, the humidity and the wind under them after small pictures (on a 4 × 4 card how it feels too, and the next five days under a hairline, each its sky and its lowest and highest at the ends of a bar drawn against the whole five, warm toward the top, now ringed on today's); a 2 × 2 card the temperature beside the picture, the sky's words and the range under them; in 柔光风格's soft look (as every card of it: a faint wash of blue from the card's top, a head of a rounded tinted chip and a title, its end clear of the card's grip), light and dark. It is fetched again when its settings change and every 30 minutes. While there is nothing to show it says why on a soft disc: 写上一个城市 (no city), 找不到「…」 (a name Open-Meteo does not know), 允许联网之后显示天气 (waiting for the user's consent, the kit's button over it), 现在连不上网，取不到天气 (no network, and nothing fetched before), 网络设置把天气服务指向了本地地址 (this computer's network setup gives Open-Meteo's names an address of this computer or of a private network, which Gallery refuses). The script runs with the rights of the page's own scripts, as any block's does.
