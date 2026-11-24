import { build as code } from "./code/page.mjs";
import { build as database } from "./database/page.mjs";
import { build as details } from "./details/page.mjs";
import { build as installed } from "./installed/page.mjs";
import { build as math } from "./math/page.mjs";
import { build as sheets } from "./sheets/page.mjs";
import { build as table } from "./table/page.mjs";
import { TYPE_COMPONENT } from "./registry.mjs";

// The blocks made again from the clipboard's description by a module of the page (a `build` of their
// page.mjs: docs/editor.md, "Copying blocks"). A description is built with no editor too, in the
// transfer worker and the unit tests, where there are no page objects and components/pages.mjs does
// not load (some page modules want a browser as they load), so that these are plain functions of
// page modules that do load there, listed here, each a function declaration, as this module and
// those import each other in a ring and it may be read before its module has run. A type whose
// `clipboard` says `build` is pure DOM, and has no line here.
const BUILDS = { code, database, details, installed, math, sheets, table };

/** The `build` of a block type's page.mjs, if it has one. */
export const pageBuild = (type) => BUILDS[TYPE_COMPONENT[type]];
