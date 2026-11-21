# Third-party notices

Gallery's own code is under the MIT License ([LICENSE](LICENSE)). This file names what this repository holds that others made, and the terms each comes under.

The packages in `package.json` are installed by npm under their own licences and are not listed here. The npm package `@heycys/gallery` carries a fuller `THIRD-PARTY-NOTICES.md`, written by `src/cli/release-build.mjs`, which also covers everything the package bundles.

## Emoji pictures: Twemoji

`src/shared/emoji/data/twemoji-svg.bin` holds the pictures of the emojis the picker offers and documents show. They are Twemoji, © Twitter, Inc and other contributors, licensed under [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) (https://github.com/twitter/twemoji).

## Emoji data: emojibase-data and Unicode CLDR

The emoji picker's groups, skin tones, names, keywords and short codes (`categories.json`, `skins.json`, `keywords-zh.json`, `keywords-en.json` and `names.json` in `src/shared/emoji/data/`) are made by `src/cli/import-emoji-data.mjs` from:

- **emojibase-data 18.0.0**, MIT License, © Miles Johnson (https://github.com/milesj/emojibase): `src/shared/emoji/data/LICENSE-emojibase.txt`;
- the **Unicode CLDR** annotations it carries (the names and keywords in Chinese and English), under the Unicode License: `src/shared/emoji/data/LICENSE-unicode.txt`;
- the short codes of **iamcal/emoji-data** (MIT License, © 2013 Cal Henderson, https://github.com/iamcal/emoji-data) and **gemoji** (MIT License, © 2019 GitHub, Inc., https://github.com/github/gemoji), as emojibase-data's presets carry them.

`src/shared/emoji/data/README.md` says what each file holds and how to make it again.

## Icons: MingCute, Tabler, Lucide

- `src/shared/emoji/data/icons.json` holds the page icons: **MingCute** Core Filled 3.0.2, © MingCute Design, Apache License 2.0 (https://github.com/Richard9394/MingCute; `src/shared/emoji/data/LICENSE-mingcute.txt`), and **Tabler** Filled 3.49.0, © Paweł Kuna, MIT License (https://github.com/tabler/tabler-icons; `src/shared/emoji/data/LICENSE-tabler.txt`).
- A few line icons of the workbench, the editor and the kit are **Lucide**'s (https://lucide.dev), as lucide-react 1.67.0 has them: ISC License, with the parts that come from Feather under the MIT License (`src/shared/emoji/data/LICENSE-lucide.txt`).

## Small pieces in the source

- `src/shared/math-marks.mjs` draws the TeX logo from the outlines of KaTeX's `KaTeX_Main` font (Computer Modern, which KaTeX ships under the SIL Open Font License 1.1; https://github.com/KaTeX/KaTeX).
- `src/editor/page/clipboard/import/html.mjs` tests which link addresses are safe with the expression DOMPurify uses for it (`IS_ALLOWED_URI`; DOMPurify, © Cure53 and other contributors, Apache License 2.0 or Mozilla Public License 2.0; https://github.com/cure53/DOMPurify).
- `src/editor/page/clipboard/import/colors.mjs` lists the CSS named colours as TinyColor lists them (MIT License, © Brian Grinstead; https://github.com/bgrins/TinyColor).

## Data a block shows

The weather card (`src/packs/gallery/weather/`, `src/packs/gallery-soft/weather/`) asks Open-Meteo's free API for the weather once the reader allows it to go online. Weather data by [Open-Meteo.com](https://open-meteo.com/), licensed under CC BY 4.0; its free API is for non-commercial use.

## Trademarks

The brand icons among the page icons are trademarks of their owners and are there to name those products. Notion, Feishu and Lark, Yuque, Microsoft Word, Excel and PowerPoint, WPS, Google Docs and the other products Gallery reads pasted or imported content from are trademarks of their owners. Gallery is not affiliated with any of them.
