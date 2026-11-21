// The local server's answers: JSON for its endpoints (the editor's saves, the workbench's commands),
// and files for its routes.

// Who may show a page of Gallery's in a frame (its HTML: the workbench, a document, a custom page): a page of
// its own origin, and a Gallery server of this computer, http://127.0.0.1 at any port (a workbench showing a
// draft of another workspace from that workspace's server, docs/workbench.md "Drafts of other workspaces";
// what such a frame may say and hear is still held to the servers vouched for). Never a site elsewhere, which
// could lay an editable page under a decoy, the reader's clicks and keys then editing the files (a security
// review of 0.2.0), nor localhost, which may lead to another program on [::1] (no workbench is shown there:
// src/server/routes.mjs toLoopback).
export const FRAMED_BY = { "Content-Security-Policy": "frame-ancestors 'self'" };

// A JSON answer.
export function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

// What the routes answer with: a status (404 with nothing else), a content type, the headers the
// route sets (its caching, nosniff, a sandbox) and the body.
export function serve(response, { status = 200, type, headers = {}, body } = {}) {
  response.statusCode = status;
  if (type) response.setHeader("Content-Type", type);
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  response.end(body);
}

// A file the route reads: its answer, or 404 when there is none.
export const serveFound = (response, body, options) => (body ? serve(response, { ...options, body }) : serve(response, { status: 404 }));
