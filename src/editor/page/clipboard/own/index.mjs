// The clipboard's own format (application/x-gallery-blocks, written and read as the old
// application/x-report-studio-blocks too): selected blocks described
// (describe.mjs), selected text described (selection.mjs: in one block its inline HTML, across blocks
// blocks), checked and made again (blocks.mjs), the keys of charts drawn from tables among the copies
// made their own (chart-keys.mjs), as are the ids a copy's drawing names itself (ids.mjs), and written for other programs
// (export.mjs, by the table of writers the page export uses too: writers.mjs).
export { HTML_MARK, MIME, OLD_MIME, copied, copyOf, describe, ownData, projectName, projectOf, reportOf, sameDocument } from "./describe.mjs";
export { describeAcross, ownRange, selectedHtml } from "./selection.mjs";
export { PASTED_SOURCE, build, checkBlocks, filesOf, holdsFormulas, joinedHtml, parse, parseCells, parseText, unmadeCopy } from "./blocks.mjs";
export { relinkCopies } from "./chart-keys.mjs";
export { prefixCopies } from "./ids.mjs";
export { groupItems, kindOfBlock } from "./rules.mjs";
export { formats, plainText, textFormats } from "./export.mjs";
