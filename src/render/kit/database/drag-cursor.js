// While a database's drawing is dragged or resized (its .doc-database-app is-dragging or is-resizing), the
// whole page shows the drag's cursor, not the drawing alone: the pointer leaving the card or the table on its
// way keeps the same one (database.css, by the body's data-doc-database-drag, there only while it lasts). The
// body says so rather than a body:has() of the drawing's classes: such a rule has the browser restyle the
// whole page at every row put into or taken out of any table on it (a database's own table, written at each
// character typed in it).
const MARK = "data-doc-database-drag";

function follow() {
  const kind = document.querySelector(".doc-database-app.is-dragging") ? "dragging" : document.querySelector(".doc-database-app.is-resizing") ? "resizing" : null;
  const body = document.body;
  if (!body) return;
  if (kind === null) body.removeAttribute(MARK);
  else if (body.getAttribute(MARK) !== kind) body.setAttribute(MARK, kind);
}

/** The body following the drag state of `app` (a drawing's element) until the returned function is called. */
export function followDrag(app) {
  const observer = new MutationObserver(follow);
  observer.observe(app, { attributes: true, attributeFilter: ["class"] });
  return () => {
    observer.disconnect();
    follow();
  };
}
