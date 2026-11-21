// Reading a parsed report (parse5's tree: { tagName, attrs, childNodes, sourceCodeLocation }): what
// every system that reads the HTML as a tree asks of an element. The render's checks, the editor's
// source and the components' selectors (components/index.mjs) all read through it. Pure data: no
// parser is imported here, so code that runs in the browser may import it too.

/** Block-level elements: what a text block made of `text` may be, what holds units. */
export const BLOCK_LEVEL = new Set([
  "address", "article", "aside", "blockquote", "caption", "dd", "details", "dialog", "div", "dl", "dt",
  "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr",
  "li", "main", "menu", "nav", "ol", "p", "pre", "section", "summary", "table", "tbody", "td", "tfoot",
  "th", "thead", "tr", "ul",
]);

/** An element's attribute, or undefined. */
export const attr = (node, name) => node.attrs?.find((entry) => entry.name === name)?.value;

/** Whether an element has the class. */
export const hasClass = (node, name) => (attr(node, "class") ?? "").split(/\s+/).includes(name);

/**
 * The attributes of an element whose value its file opens with a curly quote (name=“… or name=”…,
 * U+201C or U+201D, where a straight quote belongs), each { name, written: the attribute as the file
 * writes it, line }: HTML takes no curly quote for a quote, so the value is read unquoted, the curly
 * quotes part of it (class=”doc-sheet-tab” is the class ”doc-sheet-tab”). Read from the
 * attribute's place in `html` (parse5's sourceCodeLocation), never from its value: title="“引语”"
 * is a value in straight quotes that holds curly ones, as a Chinese text does. An editor that keeps
 * a file's “…” style (as an Edit matched with its quotes made straight does) writes them.
 */
export function curlyQuoted(html, node) {
  const places = node.sourceCodeLocation?.attrs ?? {};
  return Object.entries(places).flatMap(([name, place]) => {
    const written = html.slice(place.startOffset, place.endOffset);
    return /^[^\s=]+\s*=\s*[“”]/.test(written) ? [{ name, written, line: place.startLine }] : [];
  });
}

/** The element children of a node. */
export const elementsOf = (node) => (node.childNodes ?? []).filter((child) => child.tagName);

/**
 * Every element under `root`, in document order, handed to `visit`. What a template holds is part of
 * the page's markup (`inTemplates`, the default) or left out, as a browser's querySelectorAll does
 * (what is inert there). A template in an <svg> or <math> holds no content: its children are the page's.
 * `stop(element)`: what it says yes to is handed to `visit`, and what that holds is not, but for
 * the elements `through(element)` gives of it, whose insides the walk goes on in (themselves not handed
 * to `visit`): an instance of a component package and its slots (components/index.mjs BODY).
 */
export function walk(root, visit, { inTemplates = true, stop = null, through = null } = {}) {
  const options = { inTemplates, stop, through };
  for (const child of elementsOf(root)) {
    visit(child);
    if (stop?.(child)) {
      for (const inner of through?.(child) ?? []) walk(inner, visit, options);
      continue;
    }
    if (!(child.tagName === "template" && child.content)) walk(child, visit, options);
    else if (inTemplates) walk(child.content, visit, options);
  }
}
