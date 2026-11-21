import { ATTRIBUTE, INSTANCE } from "../../shared/components/installed.mjs";

// A custom page's card read for the instance it holds, by the host's own mark of an instance
// (shared/components/installed.mjs INSTANCE, ATTRIBUTE: a div or section naming its package): the one
// the server reads (shared/page-cards.mjs readPage, which refuses an article or a span carrying the
// attribute, and page check fails it) and the kit's page runtime reads. The board
// (src/editor/page/board/index.mjs) is a page engine and knows no package's marks, so what it asks of
// the DOM it asks here: a card with an `<article data-doc-component="…">` is a card with no instance on
// the page too, offered no settings and sending no part, instead of one the service then refuses.

/** The instance card `card` holds (its child that is one), or null. */
export const instanceOf = (card) => [...card.children].find((child) => child.matches(INSTANCE)) ?? null;

/** The package id an instance names (<scope>/<name>), or null for no instance. */
export const packageOf = (instance) => instance?.getAttribute(ATTRIBUTE) ?? null;

/** The nearest instance around `node` (itself counted), or null. */
export const instanceAround = (node) => node.closest(INSTANCE);
