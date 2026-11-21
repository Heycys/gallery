Custom blocks for the custom page's board tests (docs/testing.md, "A custom page's board"): what a
scenario or a unit test of the page service copies into a workspace of its own, never the shared
`tests/fixtures/components/` every scenario's studio holds (whose lists of packages other tests read).

- `local/memo`: a few lines kept in a data part, typed in a field of `DocKit.input`; three listed sizes,
  resizable (`card.sizes`).
- `local/prefs`: a card's settings, one field of each type, shown as words.
- `local/grow`: `fit: "content"`, a list a button lengthens (`context.editJSON`).
- `local/span`: resizable between `card.min` and `card.max`; says the size it heard (`layout`).
- `local/hello`: `card.bare`, a line of words.
- `local/pics`: a picture of the page's own (`assets/x.png`) in a data part of HTML, and a button that adds a
  caption line to it (`context.edit`), for the part's undo and the picture it must still show.
- `shipped/tile`: one of Gallery's own as a test's folder of them holds it (`gallery/tile`, places page),
  for the page service's library and install (`tests/unit/page-service.mjs` names the folder as the
  service's `shipped`; the browser scenarios add the package's own, `gallery/countdown`).
