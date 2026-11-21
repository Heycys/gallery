// The ids an element names, and a copy's own (docs/editor.md, "Copying blocks"): an SVG's marker,
// gradient, clip path, mask, pattern or filter named by url(#id) in an attribute (its style too:
// style="fill: url(#g)"), anything named by #id in an attribute's words (href="#id", xlink:href as
// older SVG writes it) and by an attribute that holds ids (a label's `for`, ARIA's: ID_ATTRIBUTES).
// A copy of a card, an instance of a component package or a row of columns holding one keeps those
// of its ids that it names itself, each given a prefix no id of the page starts with, every reference
// in it written to match, so that its arrows and gradients still draw and its label is its own
// field's (an id names one element: the original's would be read); its other ids are taken out, as
// ever. The page (page/clipboard/own/ids.mjs) and the server (source/text.mjs copiedSource) each give
// the copy a prefix from what they hold; and a unit's own references keep no unit from being deleted,
// while another block's do (source/units.mjs keepReferenced reads the same names: `idsNamed`).

const URL_REF = /url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g;

// The attributes that hold ids, besides values like href="#id".
const ID_ATTRIBUTES = new Set([
  "aria-labelledby", "aria-describedby", "aria-controls", "aria-owns", "aria-details", "aria-flowto",
  "aria-activedescendant", "aria-errormessage", "for", "headers", "list", "form", "popovertarget", "commandfor", "anchor", "itemref",
]);

// The id a word of an attribute's value names, or null: #id anywhere, the word itself where the attribute holds ids.
const wordId = (name, word) => (word.startsWith("#") ? word.slice(1) || null : ID_ATTRIBUTES.has(name) ? word : null);

// Whether an attribute's words can name anything: an id and a class are names, a style holds url(#id) alone.
const hasWords = (name) => name !== "id" && name !== "class" && name !== "style";

/** The ids `value` (an attribute's) names by url(#id). */
export const urlIds = (value) => [...String(value).matchAll(URL_REF)].map((match) => match[2]);

/** The ids the attribute `name` names with `value`: by url(#id), by #id, and by the id itself in an attribute that holds ids. */
export function idsNamed(name, value) {
  if (name === "id" || name === "class") return [];
  const words = hasWords(name) ? String(value).split(/\s+/).map((word) => wordId(name, word)).filter(Boolean) : [];
  return [...urlIds(value), ...words];
}

/** The ids `attributes` ([{ name, value }]: an element's, every element's of a copy) name (`idsNamed`). */
export function referencedIds(attributes) {
  return new Set(attributes.flatMap(({ name, value }) => idsNamed(name, value)));
}

/** A prefix for a copy's ids: c1-, c2- …, the first no id of `ids` (the page's or the file's, and those given already) starts with. */
export function freshPrefix(ids) {
  const all = [...ids];
  for (let n = 1; ; n++) {
    const prefix = `c${n}-`;
    if (!all.some((id) => id.startsWith(prefix))) return prefix;
  }
}

/**
 * `value`, the attribute `name`'s, with the ids `renamed` (a Map: old → new) names written new
 * (`idsNamed`); null when it names none of them (the attribute as it is).
 */
export function rewrite(name, value, renamed) {
  if (name === "id" || name === "class") return null;
  let changed = false;
  let next = String(value).replace(URL_REF, (whole, quote, id) => {
    if (!renamed.has(id)) return whole;
    changed = true;
    return `url(${quote}#${renamed.get(id)}${quote})`;
  });
  if (hasWords(name)) {
    next = next.replace(/\S+/g, (word) => {
      const id = wordId(name, word);
      if (!renamed.has(id)) return word;
      changed = true;
      return word.startsWith("#") ? `#${renamed.get(id)}` : renamed.get(id);
    });
  }
  return changed ? next : null;
}
