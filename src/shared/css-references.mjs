// What a piece of CSS loads, read as CSS's tokenizer reads it: the one reader of a stylesheet's
// addresses, for a document's own CSS (src/render/asset-references.mjs), a component package's style
// in an export (src/render/package-files.mjs) and every stylesheet of a copy of the view
// (src/render/kit/ui.js, in the browser, which is why it stands here): a function's name in any case,
// each address of image-set(…), and nothing a comment or a string spells.

// What CSS loads a file at: url(…) in any quotes or none, @import "…", and each string candidate of
// image-set(…) (its url(…) candidates are the first kind); each match's indices (the d flag) give the
// place of the address itself, which an embed replaces. They read the CSS blanked (blankedCss), so
// that a string's inside is spaces there: the address is read from the CSS itself, at its place.
const CSS_URLS = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/dgi;
const CSS_IMPORTS = /@import\s*(?:"([^"]*)"|'([^']*)')/dgi;
const IMAGE_SETS = /image-set\(((?:[^()]|\([^()]*\))*)\)/dgi;
const SET_STRINGS = /url\([^)]*\)|"([^"]*)"|'([^']*)'/dgi;
// An unquoted url(…), read past whole as CSS's tokenizer does (a quote in it starts no string).
const UNQUOTED_URL = /url\(\s*[^"'\s)][^)]*\)?/iy;

// A piece of CSS with what holds no address blanked, as CSS's tokenizer tells it apart: each /* */
// comment and the inside of each string (between its quotes) made spaces, line ends kept, so that
// places stay; an escaped character and an unquoted url(…) are read past whole. `strings` leaves what
// a string holds, for what reads a selector.
export function blankedCss(css, { strings = false } = {}) {
  const pieces = [];
  let kept = 0; // where the text not yet copied starts
  const blank = (start, end) => {
    pieces.push(css.slice(kept, start), css.slice(start, end).replace(/[^\r\n]/g, " "));
    kept = end;
  };
  for (let at = 0; at < css.length;) {
    const char = css[at];
    UNQUOTED_URL.lastIndex = at;
    if (char === "\\") at += 2;
    else if (char === "/" && css[at + 1] === "*") {
      const close = css.indexOf("*/", at + 2);
      const end = close < 0 ? css.length : close + 2;
      blank(at, end);
      at = end;
    } else if (char === '"' || char === "'") {
      // A string ends at its quote, or unclosed at the line's end.
      let end = at + 1;
      while (end < css.length && css[end] !== char && css[end] !== "\n" && css[end] !== "\r") end += css[end] === "\\" ? 2 : 1;
      if (!strings) blank(at + 1, Math.min(end, css.length));
      at = end + 1;
    } else if ((char === "u" || char === "U") && UNQUOTED_URL.test(css)) at = UNQUOTED_URL.lastIndex;
    else at++;
  }
  pieces.push(css.slice(kept));
  return pieces.join("");
}

// A CSS address with its escapes read as CSS reads them (\/ and \2f a slash; a backslash before a
// line end, which continues a string, nothing).
const unescapedCss = (value) => value.replace(/\\(?:([0-9a-f]{1,6})[ \t\n\f]?|\r\n|([\s\S]))/gi, (escape, hex, char) => {
  if (hex === undefined) return char === undefined || /[\r\n\f]/.test(char) ? "" : char;
  const code = parseInt(hex, 16);
  return code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? String.fromCharCode(0xfffd) : String.fromCodePoint(code);
});

// Whether an @import stands right before `at` in blanked CSS (spaces, a comment's among them, between).
function afterImport(text, at) {
  let end = at;
  while (end > 0 && /\s/.test(text[end - 1])) end--;
  return text.slice(Math.max(0, end - 7), end).toLowerCase() === "@import";
}

/**
 * The references of a piece of CSS, in its order: { value (its escapes read, no space around it), kind
 * ("url", "import", "set"), index (where it is written, for its line), start and end (the address's own
 * place, as written), written (how a message shows it) }; none in a comment or a string.
 */
export function cssReferences(css) {
  const text = blankedCss(css);
  const found = [];
  const add = (match, kind, written, { index = match.index, offset = 0 } = {}) => {
    const group = [1, 2, 3].find((at) => match[at] !== undefined);
    const start = offset + match.indices[group][0];
    const end = offset + match.indices[group][1];
    const value = unescapedCss(css.slice(start, end)).trim();
    found.push({ value, kind, index, start, end, written: written(value) });
  };
  for (const match of text.matchAll(CSS_URLS)) {
    // A url(…) right after @import imports a stylesheet too.
    if (afterImport(text, match.index)) add(match, "import", (value) => `@import url(${value})`);
    else add(match, "url", (value) => `url(${value})`);
  }
  for (const match of text.matchAll(CSS_IMPORTS)) add(match, "import", (value) => `@import "${value}"`);
  for (const set of text.matchAll(IMAGE_SETS)) {
    const offset = set.indices[1][0];
    for (const match of set[1].matchAll(SET_STRINGS)) {
      if (match[1] !== undefined || match[2] !== undefined) add(match, "set", (value) => `image-set("${value}" …)`, { index: offset + match.index, offset });
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

/**
 * `css` with each of `references` (cssReferences' of this text) that `addressOf(reference)` gives an
 * address written in its place, the others as they are. One written bare is put in quotes, as an
 * address made of a file's bytes and type may hold what a bare url(…) does not.
 */
export function cssWithAddresses(css, references, addressOf) {
  let written = css;
  for (const reference of [...references].sort((a, b) => b.start - a.start)) {
    const address = addressOf(reference);
    if (!address) continue;
    const bare = css[reference.start - 1] !== '"' && css[reference.start - 1] !== "'";
    written = `${written.slice(0, reference.start)}${bare ? `"${address}"` : address}${written.slice(reference.end)}`;
  }
  return written;
}
