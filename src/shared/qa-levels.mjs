// The levels of what gallery qa finds (src/cli/qa.mjs, docs/render.md "Quality check"), and
// of the kit's layout notes (data-doc-layout), which the preview's note reads with the same
// function (render/preview-checks.mjs puts layoutNotesScript() in the page): a note that fails qa is
// among the preview's failures, the others its 排版提示. levelOf and layoutNotesOf read nothing but
// WIDE, KINDS and NARROW_INFO, so they can be written into a page as their text. And the windows
// gallery qa looks in, whose widths the preview's note names.

// Three widths in a window 900px tall, and the widest again in a laptop's window (768px tall), where
// a frame of the kit's height (72vh) shows fewer rows: that look says only what the first did not.
export const LOOKS = [
  { width: 1024, height: 900, label: "1024" },
  { width: 1024, height: 768, label: "1024×768", laptop: true },
  { width: 736, height: 900, label: "736" },
  { width: 360, height: 900, label: "360" },
];
// The widths blocks are pictured at (the laptop's window adds no pictures of blocks).
export const WIDTHS = LOOKS.filter((look) => !look.laptop).map((look) => look.width);

// A table's columns or rows out of sight, and a code block or a formula whose content scrolls inside
// its frame, are a warning only where a reader has room for them (WIDE and wider), and info below,
// where a frame that scrolls is what it does (NARROW_INFO).
export const WIDE = 736;
export const LEVELS = ["fail", "warn", "unverified", "info"];
export const KINDS = {
  error: "fail", // the page's error, uncaught or on the console
  request: "fail", // a request that failed
  blocked: "fail", // what the export's policy blocked: a file not embedded
  image: "fail", // a picture that did not load
  "chart-empty": "fail", // a chart that drew nothing (the kit's data-missing too)
  "chart-text-clipped": "fail", // a chart's text cut by a clip
  "chart-text-outside": "fail", // a chart's text outside its card
  "raw-formula": "fail", // TeX shown as written
  "formula-error": "fail", // a formula KaTeX refused
  overflow: "fail", // the page wider than the window
  "overflow-in-block": "warn", // words past the side of their box in a whole block or a figure's drawing, over what is beside it
  "cut-in-block": "warn", // words or marks of a whole block or a figure's drawing cut at the bottom of a box that clips them
  "table-columns": "warn", // a table's columns out of sight or cut (below WIDE: info)
  "table-rows": "warn", // a table's rows below a frame of the kit's height (below WIDE: info)
  "code-scrolls": "warn", // a code block's code scrolling inside its frame (below WIDE: info)
  "formula-scrolls": "warn", // a formula block scrolling inside its frame (below WIDE: info)
  "chart-text-overlap": "warn", // two texts of a drawing over each other
  "svg-text-small": "warn", // a drawing's text its viewBox scales below a readable size
  ticks: "warn", // a value axis's tick labels closer than a digit's width and a hair (0.6em)
  "layout-note": "info", // the kit's other notes on its layout
  "table-scrolls": "info", // a table that scrolls in its frame
  "code-title-cut": "info", // a code block's title cut to fit its header
  unverified: "unverified", // a wait that ran out, a state not reached, a picture not taken
};

// The kinds that warn at WIDE and wider and are info below.
export const NARROW_INFO = ["table-columns", "table-rows", "code-scrolls", "formula-scrolls"];

/** The level of a finding of `kind` at a window `width` px wide. */
export function levelOf(kind, width) {
  if (NARROW_INFO.includes(kind)) return width >= WIDE ? "warn" : "info";
  return KINDS[kind] ?? "warn";
}

/**
 * The notes the kit wrote on an element (data-doc-layout: one a line, each "<name>: <message>",
 * such as "data-missing: its table has merged cells: …"), each with the kind of finding it makes and
 * its level at a window `width` px wide: data-missing fails (a chart drawn from a table with nothing
 * to draw, its card saying why: chart-empty); columns-hidden is a table's columns out of sight and
 * rows-hidden its rows below its frame (warnings where a reader has room for them, info below); any
 * other note is info. [{ note, name, kind, level }]
 */
export function layoutNotesOf(value, width = Infinity) {
  const kinds = { "columns-hidden": "table-columns", "rows-hidden": "table-rows", "data-missing": "chart-empty" };
  return String(value ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((note) => {
    const name = note.split(":")[0].trim().toLowerCase();
    const kind = kinds[name] ?? "layout-note";
    return { note, name, kind, level: levelOf(kind, width) };
  });
}

/**
 * A layout note of the kit's that fails (layoutNotesOf's `note`, "<name>: <message>"), in the words of
 * the person reading the preview's note, in Chinese unless { english } (the UI's language): a chart
 * that drew nothing (the preview says its card's own line of why when it has one), in a sentence. The
 * note itself, in English, is gallery qa's and an Agent's, and stays as it is on the page; a note it
 * does not know is said as it is. Written with no outside name, so the preview's page can carry it
 * (layoutNotesScript).
 */
export function noteInWords(note, { english = false } = {}) {
  const text = String(note ?? "").trim();
  const colon = text.indexOf(":");
  const name = colon < 0 ? "" : text.slice(0, colon).trim().toLowerCase();
  if (name === "data-missing") return english ? "The chart was not drawn: its table gave it nothing to draw" : "图表没有画出来：从表格里没读到能画的数据";
  return text;
}

// The dev server's Vite config bundles the server's modules into one scope, renaming a constant another module also
// has at its top (KINDS$1: src/editor/history.mjs and src/render/images.mjs have a KINDS too), and the functions' text
// below then names the renamed one: the script declares each constant under every name that text has for it.
/** levelOf, layoutNotesOf and noteInWords as a script's text, for a page (the preview's note) to read notes as qa does and say them. */
// Each constant is declared under every name the functions' text has for it (KINDS, or KINDS$1 where a bundle renamed it).
export const layoutNotesScript = () => {
  const body = `${levelOf}; ${layoutNotesOf}; ${noteInWords};`;
  const declare = (name, value) => [...new Set(body.match(new RegExp(`\\b${name}(?:\\$\\d+)?\\b`, "g")) ?? [name])].map((each) => `const ${each} = ${value};`).join(" ");
  return `${declare("WIDE", WIDE)} ${declare("KINDS", JSON.stringify(KINDS))} ${declare("NARROW_INFO", JSON.stringify(NARROW_INFO))} ${body}`;
};
