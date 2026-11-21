# Interactive UI previews

Use a preview when the user asks to compare UI designs, see a prototype, or inspect a new extension's interface before implementation. For an already approved change, proceed with implementation; this tool adds no mandatory approval gate.

`gallery preview new settings` creates settings.page.html. Edit its body using existing Gallery classes and CSS variables. Then run `gallery preview settings.page.html --open --shots /absolute/path/shots`. The generated settings.preview.html is a standalone file that opens by double-click. `--out` chooses its path; `--only light,dark` selects named screenshots. Local linked scripts/styles are embedded. Remote resources and image/CSS URLs must be embedded by the author if offline delivery requires them.

The page's JSON script with id preview-config accepts title, hint, options (key/label/values), widths (name → pixels, 0 fills the window), viewport [1280,800] and shots [{name,state,run?,wait?}]. Theme and width are toolbar controls; current state is in the URL hash. Set gallery:false for generic pages. `shots[].run` is trusted JavaScript executed in the preview frame to reach a state. Screenshots use Gallery's Chrome/Edge tools with a separate temporary profile and fail on script errors.

Example JSON inside the page’s preview-config script:

```json
{"title":"Settings","widths":{"normal":0,"narrow":560},"shots":[{"name":"light","state":{"theme":"light"}},{"name":"dark","state":{"theme":"dark"}},{"name":"narrow","state":{"width":"narrow"}}]}
```

Use body data-backdrop="gallery" for a muted workbench backdrop. window.preview provides on(fn), state, set(next), toast, confirm, menu, closeMenu, hideTip, icon and esc. on(fn) runs once and on toolbar changes; ignore theme/width changes when they don't require rerendering. data-tip shows a tooltip. Menu and confirm dialogs handle Escape before the page.

Inspect the actual screenshots, then give the user the standalone HTML and describe what is interactive. Rebuild after Gallery upgrades to pick up its current stylesheet.
