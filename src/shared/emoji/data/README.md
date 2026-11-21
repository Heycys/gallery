# Emoji and icon data

What the icon picker offers, and the pictures Gallery draws emojis and icons with. `../data.mjs` and `../glyphs.mjs` load these files in the browser; `src/render/emoji.mjs` reads the pack and the icons for the preview, an offline export and the workbench's icons; `src/cli/emoji.mjs` reads `names.json`.

## The emojis

| File | What it holds |
|---|---|
| `categories.json` | The picker's groups and their emojis, both in the Unicode order: `people` (the Unicode groups Smileys & Emotion and People & Body, 笑脸与人物 in the picker), `nature` (Animals & Nature), `food` (Food & Drink), `travel` (Travel & Places), `activities`, `objects`, `symbols` |
| `skins.json` | The skin tones of an emoji that has them: five, light to dark; or 25 for two people or two hands each of a tone, the five of one tone first, then the mixed ones (by the first's tone, then the second's) |
| `keywords-zh.json` | Each emoji's Chinese words: its name (the CLDR label), then its CLDR keywords |
| `keywords-en.json` | Each emoji's English words: its name (the CLDR label), its short codes between colons (Slack's, then GitHub's others), its CLDR keywords, its emoticons |
| `names.json` | Each short code (without its colons) and each name, Chinese and English, in lower case as a custom emoji's name is written (`OK手势` as `ok手势`), to its emoji: a custom emoji may take none of them |
| `twemoji-index.json` | Where each emoji's picture lies in the pack: its codepoints (fully qualified, lower-case hex, joined by `-`) → `[offset, length]` in the unpacked data |
| `twemoji-svg.bin` | The Twemoji SVGs, end to end, gzip |

An emoji is written in these files as Unicode's `emoji-test.txt` writes it, fully qualified; the readers find it written with or without its variation selectors (`../codepoints.mjs`), so a document's emoji, as whatever program wrote it, is found.

The files but the pack are made by `src/cli/import-emoji-data.mjs` from **emojibase-data 18.0.0** (npm; MIT, © Miles Johnson, `LICENSE-emojibase.txt`; https://github.com/milesj/emojibase): its `en/data.json` and `zh/data.json` (each emoji's label, keywords, group, order and skin tones, and its emoticons) and its `en/shortcodes/iamcal.json` and `github.json` presets, which carry Slack's and GitHub's short codes from iamcal/emoji-data (MIT, © 2013 Cal Henderson, https://github.com/iamcal/emoji-data) and gemoji (MIT, © 2019 GitHub, Inc., https://github.com/github/gemoji). The labels and keywords are the **Unicode CLDR** annotations (https://cldr.unicode.org), © Unicode, Inc., under the Unicode License v3 (`LICENSE-unicode.txt`, as https://www.unicode.org/license.txt has it). To make them again, or with another version (change `SOURCE` in the script first):

```
npm pack emojibase-data@18.0.0 --pack-destination node_modules/.cache/emoji-sources
node src/cli/import-emoji-data.mjs            # writes the files
node src/cli/import-emoji-data.mjs --check    # writes nothing: says whether they are what the source makes
```

(Where the network needs a proxy, set `https_proxy` for the `npm pack`.) `tests/unit/icons.mjs` holds the files to what the script makes when the package is in the cache.

What is offered is exactly what the pack draws: 1574 emojis and 1500 skin tones, every picture in the pack and no other. The script leaves out an emoji or a skin tone the pack has no picture of (79 emojis newer than the pack, such as 🫨 and 🐦‍🔥, and the skin tones of 👯, 🤼, 👭, 👫, 👬, 💏 and 💑 and their gendered forms, which are offered without them) and says which; a picture the source names no emoji for it would say too (none). It leaves out the source's Component group (a skin tone or a hair style alone) and its regional indicators, and its Flags group whole: Gallery offers no flag (the owner's decision), and the pack holds no picture of one. A flag a document holds, like an emoji newer than the pack, shows in the system's emoji font; `/__gallery/edit/icon` draws it as an SVG holding its character.

The search's order between emojis it ranks alike is Gallery's own, not this data's: `../everyday.mjs` is a list of four hundred emojis in the order a document reaches for them: the marks a document is written with (done, not done, warning, an idea, a pin, the status dots), what it is about (notes, dates, charts, files, tools), then the common faces, hands and hearts, weather and plants, food, animals and places. The order is a choice made for documents. The data says what each emoji is called, never which one people mean; with the list, 爱 and idea find ❤️ and 💡 before 😍 and 💭. The picker's search (`src/editor/page/emoji-picker/emoji-search.mjs`) reads it; the generator neither makes nor checks it, and `tests/unit/icons.mjs` holds each of its emojis to being offered, once.

The emoji graphics are Twemoji, © Twitter, Inc and other contributors, licensed under CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/; https://github.com/twitter/twemoji). The pack holds the pictures of the emojis above, end to end; `tests/unit/icons.mjs` holds that its pieces tile it.

## The icons

| File | What it holds |
|---|---|
| `icons.json` | The 图标 tab's icons: `{ sets, categories: [Chinese name], icons: [[Chinese name, MingCute name, Tabler name, MingCute SVG, Tabler SVG, category, search words]] }`, 443 pairs and Tabler's 40 numbers (their MingCute name and SVG `null`), in the tab's order (by category: the index into `categories`), each SVG drawn in `#COLOR` (the color it is shown in: `ICON_COLOR_VALUES` of `../icon-value.mjs`, the one table of the ten colors) |
| `LICENSE-mingcute.txt`, `LICENSE-tabler.txt`, `LICENSE-lucide.txt` | The two icon sets' licenses, and Lucide's (the few line icons the workbench, the editor and the kit take from it: the sidebar's, the settings gear, the 写作偏好 book, a page with no icon) |

The icons are two open-source sets of filled icons, the 443 things both have one icon for (a reviewed one-to-one list of synonyms), and Tabler's 40 numbers (0–9 in a circle, a square, a rounded square and a hexagon), which MingCute has no series of, in 12 categories:
- MingCute Core Filled 3.0.2, © MingCute Design, Apache License 2.0 (https://github.com/Richard9394/MingCute; `LICENSE-mingcute.txt`), the default set: `/icons/<name>_<color>.svg`;
- Tabler Filled 3.49.0, © Paweł Kuna, MIT License (https://github.com/tabler/tabler-icons; `LICENSE-tabler.txt`): `/icons/tabler/<name>_<color>.svg` (a number is always this).

`icons.json` is made by `src/cli/import-icons.mjs` from the user's categorized list (`icon-subsets-categories.json`: the categories, each pair's and number's Chinese name, category and search words) and the two categorized subsets (`图标/<category>/…svg`, `LICENSE`); a pair whose Chinese name changed keeps its earlier one among its search words. The SVGs are the sets' own, their color written `#COLOR` and Tabler's empty frame path left out.

The release copies this folder's data, its licences and this file into the package (`browser/shared/emoji/data/`), and THIRD-PARTY-NOTICES.md names each source with its licence (`src/cli/release-build.mjs`).
