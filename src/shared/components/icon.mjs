// The page's icon (页面图标): right above the report's title, in the header,
// left-aligned with the title's text (a highlight panel may begin with one too, smaller: highlight.mjs); an emoji (<div class="doc-icon">🎯</div>), an icon of
// a set in a color (<div class="doc-icon" data-icon="/icons/airplane_blue.svg"></div>: MingCute's, or
// /icons/tabler/<name>_<color>.svg, Tabler's; src/shared/emoji/data/icons.json) or an image of the
// report's folder (<div class="doc-icon"><img src="assets/icon-….png" alt=""></div>). A whole
// block: the page editor changes it with its own picker and nothing else; never moved. report.json
// mirrors it (icon) for the workbench's tree. The preview, a build and an export show each kind as
// a picture (render/emoji.mjs); the kit colors a set's icon (styles/page.css). They also give
// the browser tab its image: a <link rel="icon" data-doc-tab-icon> in the head, which the page
// editor keeps as the icon changes; no report writes it.
export default {
  id: "icon",
  category: "whole",
  match: ".doc-icon",
  classes: ["doc-icon"],
  attrs: { "data-icon": "an icon of a set in a color: /icons/<name>_<color>.svg (MingCute) or /icons/tabler/<name>_<color>.svg (Tabler)" },
  runtime: { internal: ["data-doc-tab-icon"] }, // the render puts it in the head, the editor keeps it
};
