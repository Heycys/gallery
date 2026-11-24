import bookmark from "./bookmark/file.mjs";
import code from "./code/file.mjs";
import columns from "./columns/file.mjs";
import database from "./database/file.mjs";
import details from "./details/file.mjs";
import dialog from "./dialog/file.mjs";
import embed from "./embed/file.mjs";
import file from "./file/file.mjs";
import flowchart from "./flowchart/file.mjs";
import image from "./image/file.mjs";
import installed from "./installed/file.mjs";
import list from "./list/file.mjs";
import sheets from "./sheets/file.mjs";
import table from "./table/file.mjs";

// How the server (src/editor/source/) writes and checks the blocks the page makes, by type, where
// a component writes them its own way (its folder's file.mjs); any other type is written in the
// kit's plain markup from its description (registry.mjs BLOCK_TYPES): <tag class>text</tag> for a
// leaf, its blocks inside for a container, its color (the classes its kind switches) after the kit's
// class in either. A type's entry may have:
//
//   write(node, w)          its markup. w: { id (the block's id attribute; read it only where it
//                           goes, as it gives one), indent, inner (indent + step; null: all on one
//                           line), step (the file's indentation step), deep(level) (indent + level
//                           steps), block(open, lines, close, at = indent, step = inner) (lines
//                           between two tags, each on a line of its own at `step`, the close at
//                           `at`), children(at) (its blocks' markup), language (the file's, "zh"
//                           or "en" by its <html lang>: the kit's markup it writes, an aria-label,
//                           is said in it) }
//   check(node, context)    its own fields are valid: context { validLeaf(spec, html), usedIds }
//                           (a bare type with a writer of its own, an image, is checked by it alone)
//   empty                   a container that may hold no blocks
//   children(node, check)   a leaf holding blocks of its own (a list item's lists) holds valid ones
//   leaf(spec, node, id)    a text block's markup, where it is not <tag class>text</tag> (a code block's);
//                           check(node) then says its own fields are valid, and `fields` names them: a
//                           text block of another type that carries one is refused (foreignFields)
//   written(unit)           a unit of the file is as write/leaf writes one: only such a unit turns back
//                           into text (a code block), leaving the attributes attribute(name, value) says
//                           the writer sets
//   rewrite(source, node, op, { validCell, packages })   a unit's inside written anew from an operation
//                           the page sends (a table's rows and columns, the data parts of an instance):
//                           the splice, a list of them, or null when it cannot be
//   definition(node, packages)  the stamp of what the page's operation on such a unit goes by (an
//                           instance's manifest): one sent by another is refused, and the page shown again
//   plain(node)             the unit's element in the file is one `rewrite` writes (a table written as the
//                           kit writes one): the scan marks the unit `grid`, the page's tools for it exist by that
//   textParts(node, packages)  the elements of a unit that are text blocks by what its package says
//                           (`packages`: src/shared/component-catalog.mjs), each { kind, part }, not by its
//                           markup: the scan takes those and goes no further in
//   source(node, { packages, written })  the markup of a block made on the page that the file writes
//                           whole, from what the server holds or what it checked here: as `written(text)`
//                           makes it, ids taken out as a copy's are, or null when it cannot be written
//   boxes(node, packages)   the boxes a unit holds besides what its markup tells (an instance's slots, a
//                           database's record bodies): [{ element, kind, key }]
//   slotKinds, makeSlot(source, node, key)  the kinds of those boxes the file holds only once a block goes in
//                           (a record's body), and the splice that makes an empty one of `key` in the unit
//                           (source/commit.mjs, before the commit's blocks go in), or null
//
// Only the server loads these (the preview never serves a file.mjs or this module).
export const FILES = { ...bookmark, ...code, ...columns, ...database, ...details, ...dialog, ...embed, ...file, ...flowchart, ...image, ...installed, ...list, ...sheets, ...table };

const FIELD_OWNERS = Object.entries(FILES).flatMap(([type, own]) => (own.fields ?? []).map((field) => [field, type]));

/** Whether a text block carries a field of another type's (a paragraph given a code block's language). */
export const foreignFields = (node) => FIELD_OWNERS.some(([field, type]) => node[field] !== undefined && node.type !== type);
