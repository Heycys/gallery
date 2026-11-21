// The format's old names, made new (2026-10-26). Until then the HTML a report is written in named
// its kit with "report": classes report-*, attributes data-report-*, custom properties --report-*,
// globals and SDK types Report*, events report-*-change. They are doc-*, data-doc-*, --doc-* and
// Doc* now (docs/render.md, "Names"). A file written before, an Agent that still writes the old
// names (the user's own 写作偏好 may teach them for good) and an export made before all keep
// working: the tools read a report's text through newNames (new-names.mjs) where they already make
// its natural HTML the kit's (source/natural.mjs naturalize: the preview before showing it, the
// first edit, gallery check, build, export and ids, gallery import) and where they read a page of
// Gallery's own made elsewhere (an import of an export, a paste: newDomNames below), so every reader past those reads the new names
// only, and a file takes them the next time a tool writes it. The kit's runtime answers to the old
// globals too (window.ReportCharts is DocCharts), for a script of the report's folder that no
// tool rewrites.
//
// The old names are a closed set: those the kit had on 2026-10-26 (the rename's table), never one
// added since. A class written report-<name> of none of them (a typo) is left as written, for the
// checks to say as the file writes it (component-checks.mjs). An id the report spelled as an old
// name (id="report-summary") is renamed with everything of the file that names it (its selectors and
// script strings, href="#…", for, aria-*), so they still meet; inside the report's own <style> and
// <script> a whole old name is renamed wherever it stands, their comments too. Nothing else of the
// file changes: its text and comments, other ids, slugs (report-2) and paths (assets/report-chart.png)
// stay as written; what the product is named after (gallery, html-report-studio, /__gallery/edit/) is no name
// of the format.

/** The kit's old class, keyframe, event and meta names: report-<name> for each, now doc-<name>. */
export const OLD_NAMES = new Set([
  "accent", "align-", "align-center", "align-left", "align-right", "annotations-changed", "assets-changed", "bar", "bar-series", "bar-shares",
  "bold", "bookmark", "bookmark-card", "bookmark-cover", "bookmark-description", "bookmark-href", "bookmark-icon", "bookmark-text",
  "bookmark-title", "bookmark-url", "button", "callout", "card", "chart", "chart-message", "charts", "checks", "checks-layout", "checks-live",
  "code", "code--folded", "code--nowrap", "code--wrap", "code-block", "code-card", "code-content", "code-copy", "code-fold", "code-header",
  "code-language", "code-line", "code-line--", "code-line--added", "code-line--folded", "code-line--hidden", "code-line--removed",
  "code-line-fold", "code-line-more", "code-lines", "code-range", "code-run", "code-separator", "code-title", "code-toolbar", "code-tools",
  "code-wrap", "column", "columns", "details", "details-content", "details-summary-label", "dialog", "dialog-close", "dialog-content",
  "dialog-fade", "dialog-header", "dialog-in", "dialog-open", "dialog-panel", "dialog-title", "dialog-trigger", "dialogs", "diff", "diff-",
  "diff-added", "diff-body", "diff-removed", "diff-stats", "display", "display-button", "display-check", "display-header", "display-icon",
  "display-item", "display-label", "display-menu", "display-section", "display-switch", "edit-map", "embed", "embed--file", "embed-frame",
  "export-copy-done", "export-id", "export-source", "figure", "figure--compact", "figure-caption", "file", "file-link", "file-name",
  "file-size", "filter", "filter-button", "filter-row", "flow", "flow-right", "grid", "grid-3", "header", "hero", "highlight", "highlight-",
  "highlight-blue", "highlight-brown", "highlight-gray", "highlight-green", "highlight-orange", "highlight-pink", "highlight-purple",
  "highlight-red", "highlight-yellow", "icon", "image", "image--center", "image--left", "image--right", "image--wide", "image-like", "kicker",
  "kit-error", "layout-change", "lead", "lede", "legend", "link-mention", "link-mention-icon", "link-mention-title", "math", "math-",
  "math-block", "math-break", "math-inline", "math-joiner", "math-tie", "note", "page", "panel", "pie-", "pie-center", "pie-labels",
  "pie-slice", "pie-slices", "plot-clip", "plot-clip-", "prose", "prose-h1", "prose-h2", "prose-h3", "prose-h4", "range", "reference-legend",
  "reveal", "scrollbar", "scrollbar--x", "scrollbar--y", "scrollbar-thumb", "scrollbars", "scrollbars-frame", "section",
  "section--no-divider", "section-header", "sheet-dock", "sheet-shell", "sheet-shell--plain", "sheet-tab", "sheet-tabs", "sheets", "sheets-",
  "source", "source-changed", "state", "state-actions", "state-field", "state-fields", "state-grid", "state-group", "state-list",
  "state-status", "summary", "swatch", "tab", "table", "table--auto", "table--full", "table--sticky-first", "table-meta", "table-sort",
  "table-sort-button", "table-wrap", "tables", "text-", "text-blue", "text-brown", "text-cyan", "text-gray", "text-green", "text-orange",
  "text-pink", "text-purple", "text-red", "text-teal", "text-yellow", "theme-change", "theme-request", "title", "todo", "tokens", "tooltip",
  "tooltip-row", "underline-", "underline-blue", "underline-orange", "underline-plain", "underline-purple", "underline-thick",
  "underline-thin", "valign-", "valign-bottom", "valign-middle", "valign-top", "zoom", "zoom-", "zoom-caption", "zoom-close", "zoom-fade",
  "zoom-grow", "zoom-gutter", "zoom-hover", "zoom-open", "zoom-picture",
]);

/** The kit's old globals and SDK types: Report<name> for each, now Doc<name>. */
export const OLD_GLOBALS = [
  "ChartBaseOptions", "ChartDrawContext", "ChartHandle", "ChartPart", "ChartPartContext", "Charts", "ChartsApi", "ChartState", "Code",
  "Dialogs", "DialogsApi", "DotDatum", "DrawnChartHandle", "Kit", "Math", "MathApi", "PieDatum", "SharedChartOptions", "SharedChartType",
  "Sheets", "SheetsApi", "SheetsHandle", "SortDirection", "SortType", "State", "StateChange", "StateFactory", "StateOptions",
  "TableChartChoices", "TableChartOptions", "TableChoices", "Tables", "TablesApi", "TableSeriesChoices", "TableSortDetail", "TableState",
  "Tokens", "TokensApi", "TokenSnapshot", "ValueFormat",
];

// A name of the old set where it stands as a whole (a class, a selector's, a keyframe's, an event's,
// an id's, a string's), never inside another word (html-report-studio, x-report-studio-*, x-gallery-*) and never
// a file's name (assets/report-chart.png, report-chart.png: a path stays as the folder has it).
const FILE_TYPE = "png|jpe?g|gif|svg|webp|avif|bmp|ico|css|js|mjs|cjs|ts|json|html?|xml|pdf|csv|tsv|txt|md|woff2?|ttf|otf|mp4|webm|mov|mp3|wav|ogg|zip";
const NAME = new RegExp(String.raw`(?<![\w$/-])report-([a-z0-9]+(?:-{1,2}[a-z0-9]+)*-{0,2})(?![\w-])(?!\.(?:${FILE_TYPE})(?![\w-]))`, "g");
// The SDK's files were report-*.d.ts (sdk/report-charts.d.ts): a script's type import names them by path.
const SDK_FILE = /(\bsdk\/)report-(?=[a-z])/g;
// An id named where an attribute points to one (href="#report-summary", data-doc-dialog-open="#…",
// fill="url(#report-grad)"): its old name new, as the id's own is (ID_LISTS).
const ID_REFERENCE = /(?<=^|[\s(,'"=])#report-([a-z0-9]+(?:-{1,2}[a-z0-9]+)*)(?![\w-])/g;
// The attributes whose value is ids (an element's own, or those it points to).
const ID_LISTS = /^(?:id|for|headers|list|form|aria-(?:labelledby|describedby|controls|owns|activedescendant|details|errormessage|flowto))$/i;
const ATTRIBUTE = /(?<![\w-])data-report-(?=[\w$])/gi;
const PROPERTY = /(?<![\w-])--report-(?=[\w$])/gi;
const DATASET = /\b(dataset\??\.)report(?=[A-Z])/g;
const GLOBAL = new RegExp(`\\bReport(?=(?:${[...OLD_GLOBALS].sort((a, b) => b.length - a.length).join("|")})\\b)`, "g");
const FONT = /\bReport Segoe\b/g; // the kit's alias of Segoe UI (styles/tokens.css)
// What a text needs to hold for any of these to be in it: most files hold none, and are not parsed.
const ANY = /report-|Report(?:[A-Z]| Segoe)|\.report[A-Z]/;

/**
 * Whether a class is in the kit's namespace: doc-*, or report-* left as written (none of the old set:
 * a typo of an old name), which the checks say as the kit's (no class of its, did you mean …), never
 * taking it for a class of the report's own.
 */
export const kitNamespace = (name) => /^(?:doc|report)-/.test(name);

/** A name in the kit's namespace as the kit's new names spell it (report-calout: doc-calout), to compare. */
export const asDocName = (name) => name.replace(/^report-/, "doc-");

/** Whether a text may hold an old name: most hold none, and need not be read again. */
export const mayHoldOldNames = (text) => ANY.test(text);

/** A class attribute's value (or a list of classes, a meta's name) with its old names new: those of the old set alone. */
export const newClassNames = (text) => text.replace(NAME, (whole, name) => (OLD_NAMES.has(name) ? `doc-${name}` : whole));

/** An attribute's name with its old prefix new (data-report-id: data-doc-id). */
export const newAttributeName = (name) => name.replace(ATTRIBUTE, "data-doc-");

/** A text's custom properties new (--report-ink: --doc-ink), as any attribute's value may name them (an SVG's fill). */
export const newProperties = (text) => text.replace(PROPERTY, "--doc-");

/**
 * An attribute's value with the old names new, by what the attribute holds: a class list (a meta's
 * name too), ids (id, for, aria-labelledby …: an id spelled as an old name is renamed with the
 * selectors and script strings that name it, so they still meet), a style, or anything else (custom
 * properties, and an id it points to: href="#report-summary"). Code (on*, javascript:) is the caller's.
 */
export const newAttributeValue = (name, value, tag) => (name === "class" || (name === "name" && tag === "meta") || ID_LISTS.test(name)
  ? newClassNames(value)
  : name === "style" ? newStyleNames(value)
    : newProperties(value).replace(ID_REFERENCE, (whole, old) => (OLD_NAMES.has(old) ? `#doc-${old}` : whole)));

const names = newClassNames;
const properties = newProperties;

/** A stylesheet's text (a <style>'s, a style attribute's) with the old names new. */
export const newStyleNames = (text) => properties(names(text.replace(ATTRIBUTE, "data-doc-").replace(FONT, "Doc Segoe")));

/** A script's text (a <script>'s, an on* attribute's, a javascript: address) with the old names new. */
export const newScriptNames = (text) => newStyleNames(text).replace(DATASET, "$1doc").replace(GLOBAL, "Doc").replace(SDK_FILE, "$1doc-");


/**
 * The old names in a DOM made new where they stand (what another program pasted: a page or an export
 * of Gallery (HTML Report Studio then) made before 2026-10-26, its classes and attributes as its page had them): every
 * element under `root`, its data-report-* attributes and their values (classes, ids and what points
 * to one, style, custom properties: newAttributeValue). Text is left as it is.
 */
export function newDomNames(root) {
  for (const element of root.querySelectorAll("*")) {
    for (const { name, value } of [...element.attributes]) {
      const renamed = newAttributeName(name);
      const next = newAttributeValue(name, value, element.localName);
      if (renamed === name && next === value) continue;
      if (renamed !== name) element.removeAttribute(name);
      element.setAttribute(renamed, next);
    }
  }
  return root;
}
