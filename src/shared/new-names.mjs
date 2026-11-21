import { parse } from "parse5";
import { instanceSlots, isInstance } from "./components/index.mjs";
import { mayHoldOldNames, newAttributeName, newAttributeValue, newScriptNames, newStyleNames } from "./old-names.mjs";

// A file's text with the format's old names new (old-names.mjs says which, and where the tools read
// a text through this). Apart from old-names.mjs, which the page's code imports too: this one
// parses the text (parse5), as only the tools on the server do.

// The kit's tags (data-report-kit, data-report-vendor) and an export's inline copies of them: the
// kit's own text, of its own time, whose attributes alone are the page's.
const KIT_TAG = /^data-(?:report|doc)-(?:kit|vendor)$/;

/**
 * An HTML document's (or fragment's) text with the format's old names new: its attributes' names
 * (data-report-* → data-doc-*), its classes, a meta's name, an id spelled as an old name and what
 * points to it (for, aria-*, href="#…"), custom properties in any attribute (a style, an SVG's
 * fill), the code of on* attributes and javascript: addresses, and the text of its
 * own <style> and <script> elements (a JSON script is data: left as written, as is every text a
 * reader reads, a comment and a code sample). An instance of a component package is passed by whole:
 * no name in it is the format's. Lines stay where they are (a name changes in its line);
 * a text holding none is given back as it is, and the new names are none of the old ones, so a
 * second pass changes nothing.
 */
export function newNames(html) {
  if (typeof html !== "string" || !mayHoldOldNames(html)) return html;
  const document = parse(html, { sourceCodeLocationInfo: true });
  const edits = []; // { start, end, text }
  const put = (start, end, next) => {
    if (html.slice(start, end) !== next) edits.push({ start, end, text: next });
  };
  function element(node) {
    const places = node.sourceCodeLocation?.attrs ?? {};
    for (const { name, value } of node.attrs) {
      const place = places[name];
      if (!place) continue;
      const written = html.slice(place.startOffset, place.endOffset);
      const equals = written.indexOf("=");
      const head = equals < 0 ? written : written.slice(0, equals);
      const tail = equals < 0 ? "" : written.slice(equals);
      const newValue = /^on/i.test(name) || /^\s*javascript:/i.test(value) ? newScriptNames(tail) : newAttributeValue(name, tail, node.tagName);
      put(place.startOffset, place.endOffset, newAttributeName(head) + newValue);
    }
    if (node.attrs.some(({ name }) => KIT_TAG.test(name)) || !["style", "script"].includes(node.tagName)) return;
    const at = node.childNodes?.[0]?.sourceCodeLocation;
    if (!at) return;
    const type = (node.attrs.find(({ name }) => name === "type")?.value ?? "").trim().toLowerCase();
    if (node.tagName === "script" && /json/.test(type)) return; // data: a chart's, a diff's lines
    const source = html.slice(at.startOffset, at.endOffset);
    put(at.startOffset, at.endOffset, node.tagName === "style" ? newStyleNames(source) : newScriptNames(source));
  }
  const visit = (node) => {
    for (const child of node.childNodes ?? []) {
      if (isInstance(child)) {
        instanceSlots(child).forEach(visit); // what its slots hold is the document's, its own region the component's
        continue;
      }
      if (child.tagName) element(child);
      visit(child.tagName === "template" && child.content ? child.content : child);
    }
  };
  visit(document);
  if (!edits.length) return html;
  edits.sort((a, b) => b.start - a.start);
  let result = html;
  for (const { start, end, text } of edits) result = result.slice(0, start) + text + result.slice(end);
  return result;
}
