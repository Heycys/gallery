// How an emoji is named by its codepoints, as the Twemoji pack names its picture (data/twemoji-index.json):
// the emoji fully qualified, each codepoint in lower-case hex of four digits at least, joined by "-". The
// editor (data.mjs), the server (src/render/emoji.mjs) and the data's generator (src/cli/import-emoji-data.mjs)
// share it.

export const VARIATION_SELECTOR = String.fromCodePoint(0xfe0f);

/** An emoji's codepoints: "1f600", "263a-fe0f", "1f9d1-200d-1f4bb". */
export const codepointsOf = (emoji) => [...emoji].map((character) => character.codePointAt(0).toString(16).padStart(4, "0")).join("-");

/** Codepoints without the variation selector (fe0f): an emoji is found however it is written, with or without it. */
export const withoutSelectors = (codepoints) => codepoints.split("-").filter((codepoint) => codepoint !== "fe0f").join("-");
