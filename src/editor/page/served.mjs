// Where the page shows a file of the report's folder (assets/<file>): the server's asset route,
// which editor.mjs gives (serveFiles) once it knows the report. A picture in a table cell's text is
// shown there (components/table/ cellPicture). No imports: a component's index.mjs reads it while
// the registry is still being made.

let fileUrl = (path) => path;

/** Where the page shows a file of the report's folder from now on: `urlOf(path)`. */
export const serveFiles = (urlOf) => {
  fileUrl = urlOf;
};

/** Where the page shows `path`, a file of the report's folder (assets/<file>). */
export const servedFile = (path) => fileUrl(path);
