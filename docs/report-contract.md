# Document contract

What the tools hold a document to, for maintainers: the skill does not hold this file. What an Agent needs of it is in its own documents (`skills/gallery/SKILL.md`, `skills/gallery/references/`), the user's rules on evidence and data in 写作偏好 (`<workspace>/preferences/`; a new workspace's first one, 通用写作, made from Gallery's short generic default, [src/shared/writing-preferences.md](../src/shared/writing-preferences.md)).

## doc.json

Each document lives in one lowercase kebab-case directory of the workspace (a document made before Gallery 0.1 has `report.html` and `report.json`, read and written under those names):

```text
<workspace>/<slug>/
├── doc.html
├── doc.json
├── assets/          pictures and files the document shows (the export embeds them)
└── materials/       optional raw material and provenance files
```

`doc.json` (`report.json` in a document made before Gallery 0.1) holds the document's `title` and `description` (`gallery new` writes them) and its `type`, free text naming the kind of document (`gallery new` writes `report`, which is fine). Two fields are optional: `source`, the most precise available dataset, experiment report, document, or query locator (say so when the source is only a supplied draft or example), and `icon`, the same value as the header's `.doc-icon` (an emoji, `/icons/<name>_<color>.svg`, `/icons/tabler/<name>_<color>.svg`, or `assets/<file>`; the preview keeps the two in step). `created` is Gallery's: the ISO time it made the document (`gallery new`, an import, the workbench's 新建, a copy's own), which a block reads (`workspace.query("document")`); a document without one goes by the times of its folder and files. The document's language is not read from it: it is the page's `<html lang>`. `<title>`, the `h1` and `title` name the document alike; the preview keeps them in step when the user renames it.

Never set `"instructions": true` (the page of the user's writing preferences, which the workbench writes as `<workspace>/preferences/<name>.md`). An old `"template": true` means nothing: the document is an ordinary one.

## Checks

`gallery check <slug>` checks a document and changes nothing. `gallery export <slug>` writes the document's natural HTML as the kit's markup and its block ids first, then runs the same checks and exports only a document that passes; a failing document's earlier export stays, named as not updated. Each document is checked on its own, and each failure names its line in `report.html`. Fix the source and run the command again.

A document fails on:

- its page: a viewport `<meta>`, a `<title>`, one `main.doc-page` whose `data-doc-id` is the slug, accessible labels; the starter's section or a `__REPORT_…__` placeholder left;
- its size: `doc.html` over 1,000,000 bytes. Aggregate or sample the embedded data (the full data can travel as a file block, [components/file.md](components/file.md)), or split the document;
- its components: each one's parts (a dialog's content, a panel for each Sheet tab…), a `doc-…` class or `data-doc-…` attribute the kit does not know, a `data-doc-show` whose key nothing binds, a declared chart's type (one the document's script defines) and data (its JSON, or the table it is drawn from), a declared diff's options (checked as the kit draws them and against `skills/gallery/sdk/`), a repeated `data-block-id`, and `$…$` holding `\`, `^` or `_` (single dollars stay text: write `\(…\)`);
- what an export needs: no remote scripts, styles, fonts, or images, no `fetch`, XHR, or WebSocket, no `localStorage` or `sessionStorage` (reading state goes through `data-doc-bind` or `DocState`), and every `assets/<file>` it names in the document's folder;
- its inline scripts, type-checked against `skills/gallery/sdk/index.d.ts` and D3's types in strict mode (implicit `any` allowed): check a value that may be `null` before using it (`document.querySelector(…)`, a `Map`'s `get`), and give a type the compiler cannot infer in JSDoc (`/** @type {Array<{ group: string, score: number }>} */`). A call the kit no longer has (`DocSheets.mount`, `DocCode.DiffView`…) fails with what to write instead.

The checks also note, never failing:

- what the export writes as the kit's markup, rule by rule with its lines, and what that drops (an `<abbr>`'s `title`);
- text the preview leaves read-only, with why (a picture or a display formula amid words), and each whole block of a class of the document's own;
- `<colgroup>` widths (the kit sizes columns itself), body text between two sections without a heading of its own, and body text given a width of its own.
