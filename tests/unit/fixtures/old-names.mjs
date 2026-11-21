import { OLD_GLOBALS, OLD_NAMES } from "../../../src/shared/old-names.mjs";

// A text in the kit's names before 2026-10-26, made of one in its names now: every doc-<name> of the
// old set report-<name>, data-doc-* data-report-*, --doc-* --report-*, dataset.doc* dataset.report*,
// Doc<global> Report<global> and the font alias, wherever they stand (text and code samples too: a
// page written then held its names everywhere). What the tests make an old report, export or page of.
export const oldNames = (text) => text
  .replace(/(?<![\w$-])doc-([a-z0-9]+(?:-{1,2}[a-z0-9]+)*-{0,2})(?![\w-])/g, (whole, name) => (OLD_NAMES.has(name) ? `report-${name}` : whole))
  .replace(/(?<![\w-])data-doc-/g, "data-report-")
  .replace(/(?<![\w-])--doc-/g, "--report-")
  .replace(/\b(dataset\??\.)doc(?=[A-Z])/g, "$1report")
  .replace(new RegExp(`\\bDoc(?=(?:${OLD_GLOBALS.join("|")})\\b)`, "g"), "Report")
  .replace(/\bDoc Segoe\b/g, "Report Segoe");
