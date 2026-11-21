import { parse } from "parse5";
import { randomBlockId } from "../../shared/ids.mjs";
import { IDENTITY } from "../components/registry.mjs";
import { scan } from "./blocks.mjs";
import { tagEnd } from "./text.mjs";

// Block ids (docs/editor.md, "Block ids"): data-block-id, a block's identity. A new random id, the
// one-off migration that gives every unit one (src/cli/add-block-ids.mjs), and the ids a report repeats
// (which that migration refuses).

// data-block-id values in a source (a new random id: shared/ids.mjs randomBlockId, re-exported here).
export const ID_PATTERN = /\sdata-block-id\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

export { randomBlockId };

/**
 * The one-time migration of a report to block ids (`src/cli/add-block-ids.mjs`, which refuses a report
 * that repeats one first: repeatedBlockIds): every unit without an id gets one, and every unit but
 * the first carrying an id that repeats (a copied block, as the browser tests' fixtures may have one)
 * gets a new one. Only those start tags change. An empty id (data-block-id="") is none: the new one
 * is written in its place (a browser reads the first of two). Returns { text, added, renamed, given }
 * (renamed: the repeated ids; given: [{ id, tag }] for each unit given an id, in the file's order,
 * `tag` its start tag as a command shows it: startTagLabel).
 */
export function addBlockIds(source, next = randomBlockId) {
  const { units } = scan(source);
  const used = new Set([...source.matchAll(ID_PATTERN)].map((match) => match[1] ?? match[2]));
  const fresh = () => {
    for (;;) {
      const id = next();
      if (!used.has(id)) return used.add(id) && id;
    }
  };
  const seen = new Set();
  const splices = [];
  const renamed = [];
  const given = [];
  for (const unit of units) {
    if (!unit.blockId) {
      const id = fresh();
      if (unit.blockIdAttr) splices.push({ start: unit.blockIdAttr.start, end: unit.blockIdAttr.end, text: `${IDENTITY}="${id}"` });
      else {
        const at = tagEnd(source, unit.at);
        splices.push({ start: at, end: at, text: ` ${IDENTITY}="${id}"` });
      }
      given.push({ id, tag: startTagLabel(unit.tag, unit.attrs), at: unit.elStart });
    } else if (seen.has(unit.blockId) && unit.blockIdAttr) {
      renamed.push(unit.blockId);
      splices.push({ start: unit.blockIdAttr.start, end: unit.blockIdAttr.end, text: `${IDENTITY}="${fresh()}"` });
    } else seen.add(unit.blockId);
  }
  let text = source;
  for (const splice of splices.sort((a, b) => b.start - a.start)) text = text.slice(0, splice.start) + splice.text + text.slice(splice.end);
  given.sort((a, b) => a.at - b.at);
  return { text, added: given.length, renamed, given: given.map(({ id, tag }) => ({ id, tag })) };
}

/**
 * The blocks of a source without an id, which an export gives one (gallery check says so before
 * it does): [{ line, tag }] in the file's order, `line` the line its start tag opens on (as
 * changeLines says a block's line), `tag` its start tag as a command shows it (startTagLabel).
 */
export function blocksWithoutIds(source) {
  const lineAt = linesOf(source);
  return scan(source).units.filter((unit) => !unit.blockId).sort((a, b) => a.elStart - b.elStart).map((unit) => ({ line: lineAt(unit.elStart), tag: startTagLabel(unit.tag, unit.attrs) }));
}

/**
 * Where the ids `given` (addBlockIds' given) stand in `text`, the file as it is written (its <title>
 * may have changed after the ids went in): each with the line the start tag carrying it opens on, in
 * the file's order; one no block of `text` carries is left out (text that merely spells it, in code
 * or a script, is none).
 */
export function placeGivenIds(text, given) {
  const wanted = new Map(given.map((each) => [each.id, each]));
  const lineAt = linesOf(text);
  return scan(text).units.filter((unit) => wanted.has(unit.blockId)).sort((a, b) => a.elStart - b.elStart).map((unit) => ({ ...wanted.get(unit.blockId), line: lineAt(unit.elStart) }));
}

// The line of an offset in `text` (1 the first), found by halving the line starts.
function linesOf(text) {
  const starts = [0];
  for (let at = text.indexOf("\n"); at !== -1; at = text.indexOf("\n", at + 1)) starts.push(at + 1);
  return (offset) => {
    let [low, high] = [0, starts.length - 1];
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (starts[middle] <= offset) low = middle;
      else high = middle - 1;
    }
    return low + 1;
  };
}

/**
 * A block's start tag as a line of a command shows it (gallery export's list of the ids it gave,
 * gallery check's of the blocks it will give one): its name and attributes as written but its id
 * and style, three at most ("…" for the rest), a value's runs of white space (line breaks, tabs) one
 * space each, so that the label keeps to its line, a value longer than 32 characters then cut, and
 * quoted only when it holds a space or a quote: <button data-sheet-tab=opus>, <div class="a b">.
 */
export function startTagLabel(tag, attrs = []) {
  const shown = attrs.filter(({ name }) => name !== IDENTITY && name !== "style");
  const valued = (written) => {
    const value = written.replace(/\s+/g, " ");
    const cut = value.length > 32 ? `${value.slice(0, 31)}…` : value;
    if (cut === "") return "";
    return /[\s"'=<>`]/.test(cut) ? `="${cut.replaceAll('"', "&quot;")}"` : `=${cut}`;
  };
  const parts = shown.slice(0, 3).map(({ name, value }) => `${name}${valued(value)}`);
  return `<${[tag, ...parts, ...(shown.length > 3 ? ["…"] : [])].join(" ")}>`;
}

/**
 * The block ids a source repeats, as its elements carry them (text that merely spells one, in code or
 * a script, is none; one written without quotes or with character references is one): [{ id, lines,
 * columns }], where each element carrying it has it, in the file's order. Which one is the copy is for
 * its author to say, so `src/cli/add-block-ids.mjs` changes nothing in such a report and lists them.
 */
export function repeatedBlockIds(source) {
  const places = new Map();
  const walk = (node) => {
    const id = node.attrs?.find((entry) => entry.name === IDENTITY)?.value;
    const place = node.sourceCodeLocation?.attrs?.[IDENTITY] ?? node.sourceCodeLocation;
    if (id !== undefined) places.set(id, [...(places.get(id) ?? []), place]);
    for (const child of node.content?.childNodes ?? node.childNodes ?? []) walk(child);
  };
  walk(parse(source, { sourceCodeLocationInfo: true }));
  return [...places].filter(([, at]) => at.length > 1).map(([id, at]) => ({ id, lines: at.map((place) => place?.startLine), columns: at.map((place) => place?.startCol) }));
}
