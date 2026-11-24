import { create as bookmark } from "./bookmark/page.mjs";
import { create as code } from "./code/page.mjs";
import { create as columns } from "./columns/page.mjs";
import { create as database } from "./database/page.mjs";
import { create as details } from "./details/page.mjs";
import { create as dialog } from "./dialog/page.mjs";
import { create as embed } from "./embed/page.mjs";
import { create as figure } from "./figure/page.mjs";
import { create as file } from "./file/page.mjs";
import { create as flowchart } from "./flowchart/page.mjs";
import { create as nodeAdder } from "./flowchart/add.mjs";
import { create as icon } from "./icon/page.mjs";
import { create as image } from "./image/page.mjs";
import { create as installed } from "./installed/page.mjs";
import { create as list } from "./list/page.mjs";
import { create as math } from "./math/page.mjs";
import { create as media } from "./media/page.mjs";
import { create as heading } from "./heading/page.mjs";
import { create as paragraph } from "./paragraph/page.mjs";
import { create as section } from "./section/page.mjs";
import { create as sheets } from "./sheets/page.mjs";
import { create as sheetPills } from "./sheets/pills.mjs";
import { create as table } from "./table/page.mjs";

// The components' page modules (src/editor/components/<name>/page.mjs), the browser's counterpart of
// registry.mjs: the one place that imports them to make them, so that src/editor/page/editor.mjs
// names none. Only the page loads this file, the server never (registry.mjs is what both load).
//
// The order is the order they are made in, and it counts: each one's styles go into the page and its
// listeners onto the document as it is made, and media comes before the four blocks made of its
// parts (block(id)). It is also the order they are asked in where every one is: the columns tidy
// before the lists (`tidy`), an image takes a pasted file before a file block does (`acceptsFile`).
const PAGES = { columns, code, list, flowchart, nodeAdder, details, dialog, paragraph, heading, section, icon, sheets, sheetPills, figure, media, image, file, bookmark, embed, math, table, database, installed };

/**
 * Every component's page object, by its component's name (and the flowchart's "+", nodeAdder, and a
 * Sheet's tabs as pills, sheetPills, modules of their own: flowchart/add.mjs, sheets/pills.mjs): each page module's create(ctx), all with the one `ctx` the
 * editor builds, plus `ctx.pages`: these page objects, as they are made. What one component needs of
 * another it reads from there when it uses it, never by an import; a page object made later is there
 * by then.
 */
export function createPages(ctx) {
  const pages = {};
  const given = { ...ctx, pages };
  for (const [name, create] of Object.entries(PAGES)) pages[name] = create(given);
  return pages;
}
