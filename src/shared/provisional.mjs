/**
 * The mark of a box the page shows that the file has not got and is not to get until something is written in it (a
 * record's body before its first word: an empty paragraph to type in, as any body's), and of the element the page
 * made to hold it. Only the page ever sets it: no commit writes what such a box holds (core.mjs placedUnits), and the
 * first change made there makes it a box of the file (database/page.mjs). No copy or export carries one.
 */
export const PROVISIONAL = "data-ge-provisional";
