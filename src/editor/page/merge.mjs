// Merging a block's inline HTML word by word (mergeText), and the helpers around it: the server's
// commits merge with them (source/merge.mjs), and the page undoes a change three ways with them
// once someone else's words were merged into the block (history.mjs).

// Longest common subsequence of two lists of strings, as index pairs. Shared ends are matched
// first, so the table only covers the part that changed. (The page's one LCS: the merge, the three-way
// undo and the conflict card's word diff all use it.)
export function commonRun(xs, ys) {
  const head = [];
  let start = 0;
  while (start < xs.length && start < ys.length && xs[start] === ys[start]) head.push([start, start++]);
  let endX = xs.length;
  let endY = ys.length;
  const tail = [];
  while (endX > start && endY > start && xs[endX - 1] === ys[endY - 1]) tail.unshift([--endX, --endY]);
  const n = endX - start;
  const m = endY - start;
  const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = xs[start + i] === ys[start + j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const middle = [];
  for (let i = 0, j = 0; i < n && j < m;) {
    if (xs[start + i] === ys[start + j]) middle.push([start + i++, start + j++]);
    else if (table[i + 1][j] >= table[i][j + 1]) i++;
    else j++;
  }
  return [...head, ...middle, ...tail];
}

// A word diff of two texts, the reader's version against the file's (the conflict card's), or an
// Agent's baseline against the page (changes/): runs of { tag, text }, tag null
// for words both have, "del" for the reader's alone and "ins" for the file's alone (an ins before
// the del it stands beside). Words are runs of letters and digits, spaces, single other characters
// (each Chinese character on its own); at most 1500 words of each (commonRun above finds what is shared).
export function wordDiff(mine, theirs) {
  const tokens = (text) => (text.match(/[A-Za-z0-9]+|\s+|[^A-Za-z0-9\s]/gu) ?? []).slice(0, 1500);
  const a = tokens(mine);
  const b = tokens(theirs);
  const runs = [];
  const add = (tag, text) => {
    if (runs.at(-1)?.tag === tag) runs.at(-1).text += text;
    else runs.push({ tag, text });
  };
  let [i, j] = [0, 0];
  for (const [x, y] of [...commonRun(a, b), [a.length, b.length]]) {
    while (j < y) add("ins", b[j++]);
    while (i < x) add("del", a[i++]);
    if (x < a.length) add(null, a[i++]);
    j++;
  }
  return runs;
}

// ---------- merging a block both sides changed ----------

// Tokens of a block's inline HTML: a tag, an entity, a word, a run of spaces, or any other single
// character (each Chinese or Japanese character on its own). Tokens compare by what they mean
// (`key`): entities decoded, a tag by its name and attributes, spaces collapsed, so the editor's
// rewrite of text it did not change still matches the source.
const TOKEN = /<[^>]*>|&(?:#\d+|#x[\da-f]+|[a-z]+\d*);|(?:(?![\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])[\p{L}\p{N}_])+|[ \t\r\n\f]+|[\s\S]/giu;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

const decodeEntities = (text) => text.replace(/&(#\d+|#x[\da-f]+|[a-z]+\d*);/gi, (whole, name) => {
  if (name[0] !== "#") return ENTITIES[name.toLowerCase()] ?? whole;
  const code = /^#x/i.test(name) ? parseInt(name.slice(2), 16) : Number(name.slice(1));
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
});

function tokenKey(raw) {
  const tag = /^<(\/?)\s*([a-z][\w-]*)([^>]*?)\/?>$/i.exec(raw);
  if (!tag) return /^[ \t\r\n\f]+$/.test(raw) ? " " : decodeEntities(raw);
  const attributes = [...tag[3].matchAll(/([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)]
    .map(([, name, double, single, bare]) => ` ${name.toLowerCase()}=${decodeEntities(double ?? single ?? bare ?? "")}`);
  return `<${tag[1]}${tag[2].toLowerCase()}${attributes.join("")}>`;
}

const tokensOf = (html) => (html.match(TOKEN) ?? []).map((raw) => ({ raw, key: tokenKey(raw) }));

/**
 * Three-way merge of a block's inline HTML: the reader's and the file's changes to the same base
 * text. Changes to different places, with at least one unchanged word, character or tag (not
 * just a space) between them, both go in; two changes to the same or neighbouring places, unless
 * identical, make it a conflict (null). The caller still validates the result like any edit.
 */
export function mergeText(base, mine, theirs) {
  const [b, m, t] = [base, mine, theirs].map(tokensOf);
  if (b.length + m.length + t.length > 6000) return null; // long enough that a conflict is the better answer
  const keys = (tokens) => tokens.map((token) => token.key);
  const toMine = new Map(commonRun(keys(b), keys(m)));
  const toTheirs = new Map(commonRun(keys(b), keys(t)));
  const same = (x, y) => x.length === y.length && x.every((token, index) => token.key === y[index].key);
  const output = [];
  let [i, j, k] = [0, 0, 0]; // the next token of each version not written yet
  // Tokens both sides kept (spaces aside) anchor the merge; between two anchors, at most one side
  // changed anything.
  for (let at = 0; at <= b.length; at++) {
    const end = at === b.length;
    if (!end && !(b[at].key !== " " && toMine.has(at) && toTheirs.has(at))) continue;
    const [nextMine, nextTheirs] = end ? [m.length, t.length] : [toMine.get(at), toTheirs.get(at)];
    const [was, ours, their] = [b.slice(i, at), m.slice(j, nextMine), t.slice(k, nextTheirs)];
    if (same(ours, was)) output.push(...their);
    else if (same(their, was) || same(ours, their)) output.push(...ours);
    else return null;
    if (!end) output.push(m[nextMine]);
    [i, j, k] = [at + 1, nextMine + 1, nextTheirs + 1];
  }
  return output.map((token) => token.raw).join("");
}

export function commonPrefix(a, b) {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) length++;
  return length;
}

export function commonSuffix(a, b) {
  let length = 0;
  while (length < a.length && length < b.length && a[a.length - 1 - length] === b[b.length - 1 - length]) length++;
  return length;
}
