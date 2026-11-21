# 天气 (gallery/weather)

A card for a custom page (its places are `page`): a city's weather now (the sky's picture and words, the temperature, today's highest and lowest, how it feels, the humidity and the wind) and, on a tall card, the next five days. The data comes from Open-Meteo (open-meteo.com), which needs no key. Use it when the user asks for the weather on a page, its home page among them.

## Settings

Its two settings are the card's form, which the user opens from the grip at the card's top right › 设置…:

| Key | Label | Type | What it is |
| --- | --- | --- | --- |
| `city` | 城市 | text | the city, as the user names it: 上海, 杭州, Berlin; looked up by that name, its first match taken |
| `unit` | 单位 | select | `℃` (the default) or `℉` |

They are kept in its data part `settings`, a `<script type="application/json">`, as example.html does: `{"city":"上海","unit":"℃"}` (on one line and compact, as the card's 设置… writes it back). The city is the one setting it cannot show anything without (`required` in its manifest): when the user did not say which, ask them, or take it from what the workspace says of where they live (写作偏好, the documents; a trip is not a home: ask when that is a guess), and tell them in the handoff which you did; never hand over a card with no city unsaid. `gallery page add <slug> gallery/weather --set city=上海` writes it with the add (`--set unit=℉` the unit); for a card already there, write the city in its settings part. `{}` (template.html, what a menu adds) is a card with no city yet, which asks for one (右上角手柄 › 设置…), and `gallery page check` notes it. The block reads them and writes nothing.

## Going online

Its needs name the two hosts it reaches, `net:api.open-meteo.com` (the weather) and `net:geocoding-api.open-meteo.com` (a city's name to its coordinates). Gallery fetches nothing for it until the user allows those: the card then shows 允许访问 api.open-meteo.com 等 2 个网站, a press of which opens Gallery's consent dialog, and the card fetches once the user says yes. Tell the user so when you put the card on a page ("点卡片上的「允许访问」"). They can take it back in 设置 › 组件列表 (允许联网). Never write the consent into gallery.json yourself: it is the user's to give.

## How to write it

Put it on a custom page as a card of its board, `<section class="gallery-card" data-card-id="…" data-x data-y data-w data-h>`, holding one instance, after `gallery block add weather`, the instance as template.html has it, then its settings as above (`gallery page add <slug> gallery/weather` does the card for you). Sizes: 4 × 2 (the default: now, today's range and the more line), 2 × 2 (the temperature and the sky alone) and 4 × 4 (and the next five days).

## How it looks

In Gallery 风格's look (the kit's card tokens, light and dark): a head of a small gray chip and a title, its end clear of the card's grip; one hero; the rest small and gray; the accent on the data and on today alone. Its head is a cloud's chip, the city and when it was fetched (更新于 09:05; with no network, an answer kept from before says when, after a sign). The sky's picture, in its own colors (the sun's orange, a cloud's gray, the rain's blue), stands beside the temperature, the hero, and the sky's words over today's lowest and highest; at the bottom how it feels, the humidity and the wind, each after a small picture. A 2 × 2 card keeps the picture, the temperature and one line; a 4 × 4 card adds the next five days at the bottom, each its weekday, its sky, its lowest and highest at either end of a bar on the scale of all of them, cold blue to warm orange. Until the reader allows it online, or with no city, a city it cannot find or no network, the card says so under its head, and what to do faint under that.
