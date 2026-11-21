import { freshPrefix, rewrite } from "../../../../shared/copy-ids.mjs";

// The ids of what a paste made (docs/editor.md, "Copying blocks"): a copy of a card, an instance of a
// component package or a row of columns holding one keeps the ids it names itself (copyOf: an SVG's
// marker named by url(#id), a symbol by href="#id", a field by a label's `for`,
// src/shared/copy-ids.mjs), which the original holds too; each copy gives its own a prefix no id of
// the page starts with (c1-, c2- …), every reference in it written to match, so that its arrows and
// gradients draw from its own markers, its label is its own field's and an id still names one element. The
// server does the same in the file (source/text.mjs copiedSource), from the ids the file holds: the
// two prefixes may differ, each unique where it stands, and nothing the page sends later carries the
// copy's ids (a commit takes a copy's text blocks, never its drawing).

/** The copies among `made` (a paste's blocks, not on the page yet, and the copies inside them) given ids of their own. */
export function prefixCopies(doc, made) {
  const copy = '[data-ge-type="copy"], [data-ge-copy]';
  ownIds(doc, made.flatMap((node) => [node, ...node.querySelectorAll(copy)]).filter((node) => node.matches(copy)));
}

/** `copies`, not on the page yet, given ids of their own. */
export function ownIds(doc, copies) {
  if (!copies.some((copy) => copy.querySelector("[id]") || copy.id)) return;
  const taken = new Set([...doc.querySelectorAll("[id]")].map((node) => node.id));
  for (const copy of copies) {
    const owned = [copy, ...copy.querySelectorAll("*")];
    const ids = owned.filter((node) => node.id).map((node) => node.id);
    if (ids.length === 0) continue;
    const prefix = freshPrefix(taken);
    const renamed = new Map(ids.map((id) => [id, `${prefix}${id}`]));
    for (const node of owned) {
      if (node.id) node.id = renamed.get(node.id);
      for (const attribute of [...node.attributes]) {
        if (attribute.name === "data-ge-copy") continue; // what the file is written from: its ids are the file's to give
        const next = rewrite(attribute.name, attribute.value, renamed);
        if (next !== null) attribute.value = next; // xlink:href in its namespace still
      }
    }
    for (const id of renamed.values()) taken.add(id);
  }
}
