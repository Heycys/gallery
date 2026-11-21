import { LOOK, LOOK_ATTRIBUTES, SERIF_FONT, SIZE_FACTOR, SPACING, WIDTH } from "../shared/document-look.mjs";

// The kit's rules of a document's look (src/shared/document-look.mjs), written where styles/tokens.css
// says @kit-look; (src/render/kit-build.mjs): each a rule of <html>'s look attributes giving the
// tokens other values, in pixels, every one worked out here from the value tokens.css gives it, so a
// token keeps one home and a script reading one (DocTokens, the page editor's margin.mjs) reads a
// length, as ever. With no look attribute, none applies: the default is tokens.css as it is.
//
//   字体     衬线体: --doc-font the serif (SERIF_FONT) and --doc-sans-font what --doc-font was, which
//            the kit's own controls keep; 混合体: --doc-heading-font the serif, which the title and
//            every heading take (tokens.css's rules after @kit-look;, which name the elements)
//   字体大小  the type alone: every font size of the text (body, small text, notes, the title, the four
//            headings, a card's title, a table's) and its line height times the size's factor (a
//            line's height is its text's, kept in proportion); not the gaps between blocks, the
//            margins a stylesheet writes in pixels, nor the reading width
//   正文间距  each line height's leading (its height less its font size) and the gaps between blocks
//            taken at the spacing's factors
//   正文宽度  the reading width (WIDTH), whatever the size
//
// Every value is rounded to a whole pixel. --doc-space is the factor the gaps are taken at (正文间距's
// alone), for the margins a stylesheet writes in pixels of its own (a heading's, the title's):
// calc(26px * var(--doc-space, 1)).

/** The tokens a font size and its line height are, in pairs. */
export const TEXT_TOKENS = [
  ["--doc-body-font-size", "--doc-body-line-height"],
  ["--doc-small-font-size", "--doc-small-line-height"],
  ["--doc-note-font-size", "--doc-note-line-height"],
  ["--doc-title-font-size", "--doc-title-line-height"],
  ["--doc-h1-font-size", "--doc-h1-line-height"],
  ["--doc-h2-font-size", "--doc-h2-line-height"],
  ["--doc-h3-font-size", "--doc-h3-line-height"],
  ["--doc-h4-font-size", "--doc-h4-line-height"],
  ["--doc-card-title-font-size", "--doc-card-title-line-height"],
  ["--doc-table-font-size", "--doc-table-line-height"],
];
/** The gaps between blocks (docs/render.md "Block spacing"). */
export const GAP_TOKENS = ["--doc-component-gap", "--doc-block-gap", "--doc-media-gap", "--doc-paragraph-gap", "--doc-group-gap", "--doc-list-gap"];
const WIDTH_TOKEN = "--doc-content-max-width";

/** The value `tokens.css`'s text gives each token: name -> its first definition (`:root`'s). */
export function tokenValues(css) {
  const values = new Map();
  for (const [, name, value] of String(css).matchAll(/^\s*(--doc-[a-z0-9-]+):\s*([^;]+);/gm)) if (!values.has(name)) values.set(name, value.trim());
  return values;
}

const px = (value) => `${Math.round(value)}px`;

/** The tokens of one look's size, spacing and width (their names as LOOK says them), from the values tokens.css gives. */
export function lookTokens(values, { size = "default", spacing = "default", width = "default" } = {}) {
  const number = (name) => {
    const found = /^(-?[0-9.]+)px$/.exec(values.get(name) ?? "");
    if (!found) throw new Error(`src/render/kit/styles/tokens.css: ${name} is no length in px (src/render/look-css.mjs reads it)`);
    return Number(found[1]);
  };
  const factor = SIZE_FACTOR[size];
  const { leading, gaps } = SPACING[spacing];
  const tokens = {};
  // 字体大小 and 正文间距 both: the line heights (a line's leading the size's and the spacing's).
  if (size !== "default" || spacing !== "default") {
    for (const [font, line] of TEXT_TOKENS) {
      const fontSize = number(font) * factor;
      if (size !== "default") tokens[font] = px(fontSize);
      tokens[line] = px(Math.round(fontSize) + (number(line) - number(font)) * factor * leading);
    }
  }
  // 正文间距 alone: the gaps between blocks and the margins taken at --doc-space.
  if (spacing !== "default") {
    for (const gap of GAP_TOKENS) tokens[gap] = px(number(gap) * gaps);
    tokens["--doc-space"] = String(gaps);
  }
  // 正文宽度 alone: the column, whatever the size (默认 is tokens.css's own, which WIDTH says too).
  if (width !== "default") {
    if (number(WIDTH_TOKEN) !== WIDTH.default) throw new Error(`src/render/kit/styles/tokens.css: ${WIDTH_TOKEN} is not 默认 正文宽度's ${WIDTH.default}px (src/shared/document-look.mjs WIDTH)`);
    tokens[WIDTH_TOKEN] = px(WIDTH[width]);
  }
  return tokens;
}

const rule = (selector, tokens) => `${selector} { ${Object.entries(tokens).map(([name, value]) => `${name}: ${value};`).join(" ")} }`;
const on = (key, value) => `[${LOOK_ATTRIBUTES[key]}="${value}"]`;

/** The rules @kit-look; stands for, from the text of the kit's stylesheet (tokens.css first in it). */
export function lookCss(css) {
  const values = tokenValues(css);
  const sans = values.get("--doc-font");
  if (!sans) throw new Error("src/render/kit/styles/tokens.css: no --doc-font (src/render/look-css.mjs keeps it as --doc-sans-font)");
  const lines = [
    rule(`:root${on("font", "serif")}`, { "--doc-sans-font": sans, "--doc-font": SERIF_FONT }),
    rule(`:root${on("font", "mixed")}`, { "--doc-heading-font": SERIF_FONT }),
  ];
  const [, ...sizes] = LOOK.size;
  const [, ...spacings] = LOOK.spacing;
  const [, ...widths] = LOOK.width;
  // One attribute alone, then a size with a spacing (two attributes: weightier, it wins) giving the one
  // thing both change, the line heights; the width is its own alone, no size touching it.
  for (const size of sizes) lines.push(rule(`:root${on("size", size)}`, lookTokens(values, { size })));
  for (const spacing of spacings) lines.push(rule(`:root${on("spacing", spacing)}`, lookTokens(values, { spacing })));
  for (const width of widths) lines.push(rule(`:root${on("width", width)}`, lookTokens(values, { width })));
  for (const size of sizes) {
    for (const spacing of spacings) {
      const both = lookTokens(values, { size, spacing });
      lines.push(rule(`:root${on("size", size)}${on("spacing", spacing)}`, Object.fromEntries(TEXT_TOKENS.map(([, line]) => [line, both[line]]))));
    }
  }
  return lines.join("\n");
}
