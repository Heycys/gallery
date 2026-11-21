import { HOST_COMPONENT, TYPE_COMPONENT, TYPE_INFO, UNIT_COMPONENT, canHaveChildren, ownerOf, textFilters } from "../components/registry.mjs";

// The components' page objects (components/pages.mjs) for the engines that are handed no `ctx` of
// their own: the editor gives them here once it has made them, and what a type needs of the page is
// asked of its component.
let pages = {};

/** Hand the engines the page objects. */
export function connectPages(given) {
  pages = given;
}

/** Whether what happens on `node` is a component's own, the editor letting go of it (`keepsKeys`: its keys, the clipboard, a press that would draw a selection). `event`: the key, where one is asked about. */
export const keptByComponent = (node, event = null) => pageObjects().some((page) => page.keepsKeys?.(node, event));

/** The page object of the component a block type is of, if it has one. */
export const pageOfType = (type) => pages[TYPE_COMPONENT[type]];

/**
 * A key of a menu of blocks: a type, or "type:variant", another entry of the
 * type a page object says (`menuVariants`: { label, icon, words, preview?, sample?, create(what) },
 * `sample` where the words a new one holds are there to be typed over): { type, variant (null when it
 * names none, or none there is), named }.
 */
export function menuEntry(key) {
  const [type, ...rest] = String(key).split(":");
  const name = rest.join(":");
  return { type, variant: name ? pageOfType(type)?.menuVariants?.()[name] ?? null : null, named: Boolean(name) };
}

/** The row of a key of a menu of blocks: its type's, or its variant's; null for neither. */
export const menuRow = (key) => TYPE_INFO[key] ?? menuEntry(key).variant;

// Every variant there is now: [key, row].
const variants = () => Object.keys(TYPE_COMPONENT).flatMap((type) => Object.entries(pageOfType(type)?.menuVariants?.() ?? {}).map(([name, row]) => [`${type}:${name}`, row]));

/**
 * The keys of the variants the menus of blocks offer now ("/", 在下方新建, the handle's +, 转换成): every
 * one, a view of a table (`readsTables`: a custom block whose needs hold "tables") too, which binds
 * itself to the table above it as it is made (components/installed/page.mjs; page/table/binding.mjs).
 */
export const variantKeys = () => variants().map(([key]) => key);

/** The page objects, in the order they are made. */
export const pageObjects = () => Object.values(pages);

/** The page object with an editor open over the page (`panel`), if any. */
export const panelOpen = () => pageObjects().find((page) => page.panel) ?? null;

/** The text field outside the page's text blocks being edited (`field`: a tab's name), or null. */
export const fieldOpen = () => pageObjects().map((page) => page.field).find(Boolean) ?? null;

/** What the block tools do with rows of columns (`columnOps`), of whichever page object says, or null. */
export const columnOps = () => pageObjects().find((page) => page.columnOps)?.columnOps ?? null;

/** What the block tools do with sections (`sectionOps`), of whichever page object says, or null. */
export const sectionOps = () => pageObjects().find((page) => page.sectionOps)?.sectionOps ?? null;

/** What the gaps between blocks in a row resize (`rowOps`), of whichever page object says, or null. */
export const rowOps = () => pageObjects().find((page) => page.rowOps)?.rowOps ?? null;

// With no component that says `modalOps`, nothing stands over the page.
const NO_MODALS = { open: () => [], listen() {}, closeTop: () => false, show: () => null, kept: () => [], reopen() {} };

/** What stands open over the page as a modal (`modalOps`), of whichever page object says. */
export const modalOps = () => pageObjects().find((page) => page.modalOps)?.modalOps ?? NO_MODALS;

/** The page's own icon, as the page shows it (`pageIcon`), or null. */
export const pageIcon = () => pageObjects().map((page) => page.pageIcon?.()).find(Boolean) ?? null;

/** Set the page's own icon (`setPageIcon`: the session's set-icon); resolves to whether the page has a header to hold it. */
export const setPageIcon = (value) => pageObjects().find((page) => page.setPageIcon)?.setPageIcon(value) ?? Promise.resolve(false);

/** The page object of the component that defines a kind of text block. */
export const pageOfHost = (kind) => pages[HOST_COMPONENT[kind]];

/** The page object of the component a kind of unit is of, if it has one. */
export const pageOfKind = (kind) => pages[UNIT_COMPONENT[kind]];

/** The page object of the component a block is of, by the kind of unit it is (`menuItems`, `menu`), if it has one. */
export const pageOfUnit = (unit) => pageOfKind(unit.getAttribute("data-ge-unit-kind"));

/** The row of the block menu a page object has for a block of another component (`rowBeside`), the first that has one, or null. */
export const rowBeside = (target) => pageObjects().map((page) => page.rowBeside?.(target)).find(Boolean) ?? null;

/** The page object of the component a text block is of, or none (`keys`). */
export const pageOf = (host) => pages[ownerOf(host)];

/**
 * What stands around a text block, nearest first, each once and its own component none of them: the
 * block before it where that says `canHaveChildren`, then what it stands in, from where it stands out.
 */
export function pagesAround(host) {
  const before = host.previousElementSibling;
  const around = before && canHaveChildren(before) ? [before] : [];
  for (let node = host.parentElement; node; node = node.parentElement) around.push(node);
  const own = pageOf(host);
  return [...new Set(around.map(pageOf))].filter((page) => page && page !== own);
}

/** The page object of what a press or a click came down on: of the component of the nearest element around it that is of one. */
export function pageAt(target) {
  for (let node = target; node?.nodeType === 1; node = node.parentElement) {
    const owner = ownerOf(node);
    if (owner) return pages[owner];
  }
  return undefined;
}

/** Text put in a text block that takes it as it is (`textFilters`), by its component's `type`. Whether it took it. */
export function typedAsIs(host, text) {
  const page = textFilters(host) ? null : pageOf(host);
  page?.type?.(host, text);
  return Boolean(page?.type);
}
