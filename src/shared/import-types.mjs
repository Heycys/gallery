// What the workbench's 导入 takes: by extension, each kind a converter of src/transfer/import.mjs. The import dialog's
// file picker offers them (accept), the server converts by them.

/** { kind: [extensions] } */
export const IMPORT_EXT = {
  markdown: [".md", ".markdown", ".mdx", ".txt", ".text"],
  html: [".html", ".htm", ".xhtml"],
  csv: [".csv", ".tsv"],
  docx: [".docx"],
  pdf: [".pdf"],
  epub: [".epub"],
  zip: [".zip"],
};

/** The lower-cased extension of a file's name, with its dot ("" for none). */
export const extOf = (name) => /\.[^./\\]+$/.exec(String(name).toLowerCase())?.[0] ?? "";

/** The kind of file `name` is ("markdown", "html", "csv", "docx", "pdf", "epub", "zip"), or null for one the import does not take. */
export const kindOf = (name) => Object.keys(IMPORT_EXT).find((kind) => IMPORT_EXT[kind].includes(extOf(name))) ?? null;

/** The biggest file the import takes, 5 GB (the import dialog says it under the drop area). */
export const IMPORT_LIMIT = 5 * 1024 ** 3;
