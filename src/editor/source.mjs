// Source side of in-place editing in the live preview (pure functions, no Vite): what the edit
// service, the preview server, the CLI and the tests use, a module of source/ each.
//   findBlocks   locate editable text blocks and their offsets in report.html (source/blocks.mjs)
//   findUnits    locate the blocks the reader can select and delete (paragraphs, lists, cards,
//                tables, sections...) and the containers that hold them (source/units.mjs)
//   instrument   mark both (and text that stays read-only, with the reason) for the preview page
//                only; the source file is never touched (source/instrument.mjs)
//   applyEdits   write text edits, deletions, moves and new blocks into the file as it is now: only
//                those ranges change, every other byte stays (source/apply.mjs)
//   partsWritten  what a unit's component wrote, as a commit writes it, or null (components/files.mjs `rewrite`):
//                what gallery block check holds an example of an edit to
//   commitEdits  one commit of the page's autosave: finds what the page names (by identity) in the
//                file as it is now, merges a block both sides changed, applies the rest with
//                applyEdits, and says what the file then holds; revertedTexts: the texts someone
//                else's write put back; revertedUnits: the blocks made and moved it put back;
//                revertedParts: the parts of instances components wrote that it put back;
//                revertCheck: the three together, as the revert check answers (source/commit.mjs)
//   mergeText    a block both sides changed, merged word by word (source/merge.mjs)
//   addBlockIds, repeatedBlockIds, randomBlockId   block ids (source/ids.mjs)
//   naturalize   an Agent's natural HTML made the kit's; shownSource: a report's source as its pages
//                see it (naturalized in memory); handedInSource: what an export writes, every block
//                given an id; pendingBlockIds: the blocks it will give one (source/natural.mjs)
//   diffRows     what an Agent changed of a report since the baseline, by blocks; changedBlocks
//                (the same, a block each with its id and first words), textRows (a version's words),
//                markedVersion (a recent version with what it changed marked in it, for 历史版本), blockChanges
//                (the same, every block with its words, for gallery history --changes),
//                isNewDocument, rebaseOnto (a commit of the reader's applied to the baseline too),
//                retitledBase (source/changes.mjs)
//   halfWritten  the signs that a report's file is half written (an Agent between two edits of one
//                change), which the preview does not take it with (source/whole.mjs)
// They share: finding a block in the file as it is now (locate.mjs), what may be written
// (checks.mjs), editing the source text (text.mjs) and reading the parsed report (html.mjs); a
// commit makes sure of the keys of charts drawn from tables in what it made (chart-keys.mjs).

import { FILES } from "./components/files.mjs";

export { IDENTITY } from "./components/registry.mjs"; // a block's identity (components.mjs)
export { hashOf } from "./source/html.mjs";
export { findBlocks, findUnits } from "./source/blocks.mjs";
export { instrument } from "./source/instrument.mjs";
export { frameOf } from "./source/instrument.mjs"; // what a document is besides its units (the page's pull)
export { addBlockIds, randomBlockId, repeatedBlockIds } from "./source/ids.mjs";
export { applyEdits } from "./source/apply.mjs";
export { commitEdits, revertCheck, revertedParts, revertedTexts, revertedUnits } from "./source/commit.mjs";
export { mergeText } from "./source/merge.mjs";
export { changeLines, handedInSource, headerChanged, inStep, naturalize, pendingBlockIds, readOnlyTexts, scriptKept, shownSource, writingNotes } from "./source/natural.mjs";
export { halfWritten } from "./source/whole.mjs";
export { blockChanges, changedBlocks, diffRows, isNewDocument, markedVersion, rebaseOnto, retitledBase, rowsOf, textRows } from "./source/changes.mjs";

/** The splices `parts` makes of the instance `node` of the file `source`, as a commit would write them, or null when none may be. */
export const partsWritten = (source, node, parts, packages) => FILES.installed.rewrite(source, node, parts, { packages });
