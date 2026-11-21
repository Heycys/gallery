// The random ids the page and the server both make and check, in one place: a block's id (the one
// a block made on the page proposes, as the server makes them) and the id a commit is sent with
// (the server keeps its answer by it). Web Crypto is in the browser and in Node alike.

const CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

/** A random string of `length` lowercase letters and digits, a letter first when `letterFirst`. */
export const randomId = (length, { letterFirst = false } = {}) => [...crypto.getRandomValues(new Uint8Array(length))]
  .map((byte, index) => CHARS[byte % (letterFirst && index === 0 ? 26 : 36)]).join("");

/** A block's id (data-block-id): eight letters and digits, a letter first. */
export const BLOCK_ID = /^[a-z][a-z0-9]{7}$/;
export const randomBlockId = () => randomId(8, { letterFirst: true });

/** A commit's id: the page makes sixteen letters and digits of it; the server takes eight to forty. */
export const REQUEST_ID = /^[a-z0-9]{8,40}$/;
export const randomRequestId = () => randomId(16);

/**
 * The key of a text block outside any unit in a commit's answer (`outside`, by key: what the file
 * says of its text): "title" for the report's title, "id:<id>" for any other, by the id of its own
 * element, so that no element's id can be taken for the title; null for a block with neither.
 */
export const outsideKey = (title, id) => (title ? "title" : id ? `id:${id}` : null);
