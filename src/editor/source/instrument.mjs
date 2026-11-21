import { scan } from "./blocks.mjs";
import { hashOf } from "./html.mjs";
import { tagEnd } from "./text.mjs";
import { frameShell, unitHash, unitShell } from "./units.mjs";

// The preview page's marks (docs/editor.md, "Preview instrumentation"): data-ge-block on each text
// block, data-ge-lock with the reason on text that stays read-only, the units and boxes; only in
// the page served, never in the file.

export function instrument(source) {
  const scanned = scan(source);
  const { blocks, locks, units, boxes } = scanned;
  const html = insertMarks(source, [
    ...blocks.map((block) => ({ at: block.innerStart - 1, text: ` data-ge-block="${block.id}"` })),
    ...locks.map((lock) => ({ at: lock.at, text: ` data-ge-lock="${lock.reason}"` })),
    ...units.map((unit) => ({ at: unit.at, text: ` data-ge-unit="${unit.id}"${unit.grid ? " data-ge-grid" : ""}${unit.keep ? ` data-ge-keep="${unit.keep.reason}"${unit.keep.own ? " data-ge-keep-own" : ""}` : ""}` })),
    ...units.filter((unit) => unit.lead !== null).map((unit) => ({ at: unit.lead, text: ` data-ge-lead="${unit.id}"` })),
    ...boxes.map((box) => ({ at: box.at, text: ` data-ge-box="${box.id}"${box.pure ? " data-ge-pure" : ""}` })),
  ]);
  const map = {
    version: hashOf(source),
    // What the document is besides its units and its title's words, and each unit besides its words (units.mjs
    // frameShell, unitShell): what the page's pull compares (page/pull/).
    frame: frameShell(source, scanned),
    blocks: blocks.map((block) => ({
      id: block.id,
      tag: block.tag,
      kind: block.kind,
      caps: Object.keys(block.caps),
      inner: source.slice(block.innerStart, block.innerEnd),
      atoms: block.atoms,
      unit: block.unit,
      ...(block.path ? { path: block.path } : {}),
      ...(block.self !== null ? { self: true } : {}),
    })),
    units: units.map((unit) => ({
      id: unit.id,
      kind: unit.kind,
      parent: unit.parent,
      hash: unitHash(source, unit),
      shell: unitShell(source, unit, scanned),
      // The box elsewhere that goes with it (a Sheet tab's panel: its parent's box of its key): what changes in
      // that box changes its hash (units.mjs unitHash), which the page's pull must know to explain it.
      ...(unit.companion ? { companion: boxes.find((box) => box.unit === unit.parent && box.key !== null && box.key === unit.key)?.id ?? null } : {}),
      ...(unit.blockId ? { blockId: unit.blockId } : {}),
      ...(unit.keep ? { keep: unit.keep } : {}),
      ...(unit.grid ? { grid: true } : {}),
      ...(unit.parts ? { parts: unit.parts } : {}),
    })),
    boxes: boxes.map((box) => ({ id: box.id, kind: box.kind, unit: box.unit, ...(box.key !== null ? { key: box.key } : {}) })),
  };
  return { html, map };
}

/** What the document `source` is besides its units and its title's words (units.mjs frameShell), as a page's map has it. */
export const frameOf = (source) => frameShell(source, scan(source));

// Add attributes to start tags: marks are [{ at: offset of the tag's ">", text }]. A mark that
// does not point at a ">" is an error, or skipped when `strict` is false.
function insertMarks(source, marks, strict = true) {
  const pieces = [];
  let from = 0;
  for (const mark of [...marks].sort((x, y) => x.at - y.at)) {
    if (source[mark.at] !== ">") {
      if (strict) throw new Error(`Unexpected start tag before offset ${mark.at}.`);
      continue;
    }
    const at = tagEnd(source, mark.at);
    pieces.push(source.slice(from, at), mark.text);
    from = at;
  }
  pieces.push(source.slice(from));
  return pieces.join("");
}
