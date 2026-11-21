// The kit's nine colors (each a text and a background color, light and dark), written once: their
// names, what the reader calls them and their values (a text color, a block's fill and the deeper
// fill of words in a line). The kit's stylesheets (render/kit/styles/
// base.css: .doc-text-* and .doc-highlight-*, tokens.css) are written by hand, as CSS is;
// tests/unit/clipboard.mjs holds them to these values. Everything else that needs a value reads it
// here: the editor's color pickers (names), pasted colors matched onto the nine (clipboard/import/
// colors.mjs) and the colors a copy carries to other programs (clipboard/own/export.mjs).

/**
 * Each color in the order the pickers show them: `name` (the classes are doc-text-<name> and doc-highlight-
 * <name>), `label` (what the reader calls it), and its text color, its background as a block's
 * (`fill`, base.css's --doc-fill) and its background on words in a line (`mark`, base.css's
 * --doc-mark, deeper than the fill) as [light, dark].
 */
export const COLORS = [
  { name: "gray", label: "灰色", text: ["#716e69", "#a5a29c"], fill: ["#f0efed", "#2c2c2b"], mark: ["#e0dfdd", "#3a3a38"] },
  { name: "brown", label: "棕色", text: ["#9f765a", "#ba856f"], fill: ["#f5ede9", "#45362d"], mark: ["#efdbce", "#534034"] },
  { name: "orange", label: "橙色", text: ["#d27b2d", "#c77d48"], fill: ["#fbebde", "#53361f"], mark: ["#fbddc5", "#654025"] },
  { name: "yellow", label: "黄色", text: ["#cb9434", "#ca9849"], fill: ["#f9f3dc", "#504425"], mark: ["#f8eab6", "#614f26"] },
  { name: "green", label: "绿色", text: ["#50946e", "#529e72"], fill: ["#e8f1ec", "#263d30"], mark: ["#cfead9", "#2c4b3a"] },
  { name: "blue", label: "蓝色", text: ["#387dc9", "#5e87c9"], fill: ["#e5f2fc", "#233850"], mark: ["#cde5fb", "#294564"] },
  { name: "purple", label: "紫色", text: ["#9a6bb4", "#9d68d3"], fill: ["#f3ebf9", "#3c2d47"], mark: ["#ebdaf6", "#4b3859"] },
  { name: "pink", label: "粉色", text: ["#c14c8a", "#d15796"], fill: ["#fae9f1", "#4e2b3c"], mark: ["#f8d7e6", "#5d3548"] },
  { name: "red", label: "红色", text: ["#cf5148", "#df5452"], fill: ["#fce9e7", "#502c29"], mark: ["#fed7d1", "#663632"] },
];

export const COLOR_NAMES = COLORS.map(({ name }) => name);

/** The page's own text color and background (tokens.css --doc-text, --doc-surface) as [light, dark]: what no color is. The text's light is
 *  the kit's default; on an Apple platform it is #262626 (tokens.css, data-doc-platform), a shade a pasted color never needs to tell apart. */
export const BODY = { text: ["#2d2d2d", "#f3f3f3"], background: ["#ffffff", "#202020"] };
