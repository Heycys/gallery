// /kit/database.js: a database (多维表格, src/shared/database.mjs) drawn as its views, by the kit's own code
// (no framework: plain modules, as the kit's tables, charts and code blocks are). Each div.doc-database is one
// instance: what it draws goes in an element of its own at its end (.doc-database-app: its view, and a layer
// its cards, its record's details and its words of a moment stand in), its table and script hidden while it
// draws (data-doc-database). It reads its parts as it starts and each time they change (`source`: an undo, the
// Agent's write, its own edit coming back), and asks to write them through its context (context.edit, which the
// page editor takes as one step of undo); where no editor takes edits (an export, a presentation) it reads
// only. An export of the view takes its drawing off again (`dehydrate` and its description's runtime): the
// copy's kit draws it anew from the parts.
import { createDatabase } from "./app.js";
import { followDrag } from "./drag-cursor.js";
import { createStore } from "./store.js";
import { WIDE } from "../../../shared/table-across.mjs";
import { databasePages } from "../../../shared/database.mjs";
import { PROVISIONAL } from "../../../shared/provisional.mjs";
import { PEEK, SHOWN, SURFACE } from "./peek.js";

const APP = "doc-database-app";
const DRAWN = "data-doc-database";

function dehydrate(host) {
  for (const app of host.querySelectorAll(`:scope > .${APP}`)) app.remove();
  host.removeAttribute(DRAWN);
  // Its pages made a record's details (peek.js): what was drawn in them, and their marks, taken off.
  const { pages, slots } = databasePages(host);
  if (pages) {
    for (const drawn of pages.querySelectorAll(`:scope > .${APP}`)) drawn.remove();
    for (const name of ["popover", PEEK, SURFACE, "role", "aria-label", "style"]) pages.removeAttribute(name);
    for (const { node } of slots) node.removeAttribute(SHOWN);
    // A body the page shows before its first word is none of the file's (PROVISIONAL), nor are pages made for it alone.
    for (const node of pages.querySelectorAll(`:scope > [${PROVISIONAL}]`)) node.remove();
    if (pages.hasAttribute(PROVISIONAL)) pages.remove();
  }
}

// Its records' bodies watched: its pages made or taken away (the host's children), a slot made or taken away in
// them (their children), whoever did it (the page editor's step, its undo, someone else's write); `heard()` then.
function watchBodies(host, heard) {
  let pages = null;
  const inner = new MutationObserver(() => heard());
  const outer = new MutationObserver(() => {
    const now = databasePages(host).pages;
    if (now === pages) return;
    pages = now;
    inner.disconnect();
    if (pages) inner.observe(pages, { childList: true });
    heard();
  });
  outer.observe(host, { childList: true });
  pages = databasePages(host).pages;
  if (pages) inner.observe(pages, { childList: true });
  return () => {
    outer.disconnect();
    inner.disconnect();
  };
}

function mount(host, context) {
  dehydrate(host); // what a node put back by an undo carries from an earlier drawing
  const view = document.createElement("div");
  view.className = "db-view";
  const layer = document.createElement("div");
  layer.className = "db-layer";
  const app = document.createElement("div");
  app.className = APP;
  app.append(view, layer);
  host.append(app);
  host.setAttribute(DRAWN, "");
  const unfollow = followDrag(app);
  const store = createStore(host, context, layer);
  const drawing = createDatabase(store);
  view.append(drawing.element);
  drawing.update();
  // Its own 宽多维表格 switched on it (the page editor's block menu, undone too; an Agent's write the page took in):
  // placed again, past the text or back in it (across.js).
  const widened = new MutationObserver(() => drawing.place());
  widened.observe(host, { attributes: true, attributeFilter: [WIDE] });
  const unwatch = watchBodies(host, () => drawing.bodies());
  return {
    update(reason) {
      if (reason === "editable") store.editableChanged();
      else if (reason === "source") store.reread();
      else if (reason === "layout" || reason === "resize") drawing.place();
    },
    destroy() {
      widened.disconnect();
      unwatch();
      drawing.destroy();
      store.destroy();
      app.remove();
      unfollow();
      host.removeAttribute(DRAWN);
    },
  };
}

globalThis.DocKit.component({ id: "database", owns: true, on: ["source", "editable", "layout", "resize"], mount, dehydrate });
