/* Custom emojis: the workspace's emoji library, kept by Gallery's server in <workspace>/.gallery/emoji-library/
 * (src/editor/media-store.mjs). `storage` is set by the page that uses it (setEmojiLibraryStorage: the icon picker's
 * support.mjs connectPicker); a custom emoji picked as an icon is copied into the document's own folder.
 * An entry is { id, name, url, created_time, alive }. The picker hands a custom emoji on as the string
 * `notion://custom_emoji/local/<id>` (the icon block, components/icon/page.mjs, and the sidebar's frame, icon-frame.mjs,
 * read its id and copy the image into the document's folder), and the recent emojis kept in the browser hold it too.
 *   loadCustomEmojis()               reads the library once (a Promise)
 *   customEmojiStrings()             every custom emoji's string, by name
 *   customEmojiOf(value)             a string → { id, name, url }; null for no custom emoji, one deleted or not read yet
 *   customEmojiKeywords(name)        the words the filter finds it by: its name normalized, and each word of that
 *   prepareNameCheck()               loads what the name check needs, the library and the standard emojis' names (a Promise)
 *   validateCustomEmojiName(name)    the name check (synchronous): null for an empty name or a good one, else the reason
 *   nameFromFileName(name)           a file's name made a name: no extension, lower case, any character a name cannot hold "-"
 *   addCustomEmoji({ name, url })    adds one to the library; its string
 */
import { normalizeFilter, loadEmojiNames } from './data.mjs';

// Where the library is kept: { loadEmojiLibrary() -> Promise<list>, addEmoji({ name, url }) -> Promise<entry> }.
let uiStorage = { loadEmojiLibrary: async () => [], addEmoji: async () => { throw new Error('no library'); } };
export function setEmojiLibraryStorage(storage) {
  uiStorage = storage;
  loading = null;
}

// A custom emoji's string, `notion://custom_emoji/local/<id>`, is the stored form of a custom emoji, kept as it is
// because what was stored already holds it: the frequently used emojis this browser keeps (data.mjs recordEmojiUse)
// list a custom one in this form, and the icon block and the sidebar's frame read its id in it. A document never
// holds it: a custom emoji picked as an icon is copied into the document's folder first.
const PREFIX = 'notion://custom_emoji/';
const SPACE = 'local';
// What a name may hold: lowercase letters, letters with no case (Chinese, say), digits, _ and -.
const VALID_NAME_TOKENS = '\\p{Ll}\\p{Lo}\\d_-';
const VALID_NAME_REGEX = new RegExp(`^[${VALID_NAME_TOKENS}]+$`, 'u');

let list = [], loading = null;

export function loadCustomEmojis() {
  loading ??= uiStorage.loadEmojiLibrary().then(items => {
    list = (Array.isArray(items) ? items : []).filter(e => e && e.id && e.name && e.url);
  });
  return loading;
}

/* A custom emoji's string, and its id */
export const isCustomEmojiString = value => typeof value === 'string' && value.startsWith(PREFIX);
const toString = e => `${PREFIX}${SPACE}/${e.id}`;
const idOf = value => value.slice(PREFIX.length).split('/')[1];

const alive = () => list.filter(e => e.alive !== false);
export const customEmojiStrings = () => alive().sort((a, b) => a.name.localeCompare(b.name)).map(toString);
export function customEmojiOf(value) {
  if (!isCustomEmojiString(value)) return null;
  const id = idOf(value);
  return alive().find(e => e.id === id) || null;
}

/* The words the filter finds a custom emoji by: its whole name normalized, and each word of it */
export function customEmojiKeywords(name) {
  const n = normalizeFilter(name);
  return [n ?? name, ...(n?.split(/\s+/g).filter(Boolean) ?? [])];
}

/* A name checked, its spaces already made "-" by the caller: null for an empty name or a good one, else why it is
   refused, which the picker says in the UI's language (editor/page/emoji-picker/upload.mjs NAME_ERRORS):
   "chars" (a character a name cannot hold), "long" (50 characters or more), "taken" (an emoji has the name already:
   a custom emoji of the library, or a standard emoji by its short code or its Chinese or English name, data/names.json).
   prepareNameCheck() first. */
let emojiNames = null;
export const prepareNameCheck = () => Promise.all([loadCustomEmojis(), loadEmojiNames().then(n => { emojiNames = n; })]);
export function validateCustomEmojiName(name) {
  if (!name) return null;
  if (!VALID_NAME_REGEX.test(name)) return 'chars';
  if (name.length >= 50) return 'long';
  if (alive().some(e => e.name === name) || (emojiNames && Object.hasOwn(emojiNames, name))) return 'taken';
  return null;
}

/* A file's name made an emoji's name: its extension dropped, lower case, any character a name cannot hold made "-" */
export function nameFromFileName(fileName) {
  const dot = fileName.lastIndexOf('.');
  const base = dot === -1 ? fileName : fileName.slice(0, dot);
  return base.toLocaleLowerCase().replace(new RegExp(`[^${VALID_NAME_TOKENS}]`, 'gu'), '-');
}

/* An emoji added to the library (the server copies its image in): its string */
export async function addCustomEmoji({ name, url }) {
  await loadCustomEmojis();
  const e = await uiStorage.addEmoji({ name, url });
  if (!e?.id) throw new Error('The emoji library added no entry');
  list = [...list, e];
  return toString(e);
}
