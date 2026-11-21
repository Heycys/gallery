// Pinyin as the "/" menu looks for a block by it (docs/editor.md, "In the menus"; the built-in blocks
// list their words in registry.mjs: 公式 is gongshi gs). A custom block's words are its manifest's, so
// that an author writes the pinyin of the whole name there (the check notes a name no word spells:
// cli/component-check.mjs wantsPinyin); the initials ("djs" for 倒计时, "daojishi") are not asked of
// anyone: they are made here, from a word that reads as pinyin and from the name itself.

// A syllable of pinyin, no tones: an initial or none, then a final. A word that can be read as pinyin
// is syllables one after another.
const SYLLABLE = "(?:(?:[zcs]h|[bpmfdtnlgkhjqxrzcsyw])?(?:[iuv]?(?:a(?:i|o|ng?)?|e(?:i|r|ng?)?|o(?:u|ng)?)|i(?:u|ng?)?|u(?:i|n)?|vn?))";
const ONE_SYLLABLE = new RegExp(`^${SYLLABLE}$`, "i");
const LONGEST_SYLLABLE = 6; // zhuang
const HAN = /\p{Script=Han}/u;

/**
 * The syllables `word` reads as, fewest first, its apostrophes left out as an input method leaves
 * them, or null for a word that is none. The fewest, since single finals read a word as more syllables
 * than an input method composes it of (fenbiao as fen-bi-a-o, composed fen-biao).
 */
export function syllablesOf(word) {
  const letters = word.replaceAll("'", "");
  const fewest = [0, ...Array(letters.length).fill(Infinity)];
  const from = Array(letters.length + 1).fill(0);
  for (let end = 1; end <= letters.length; end++) {
    for (let start = Math.max(0, end - LONGEST_SYLLABLE); start < end; start++) {
      if (fewest[start] + 1 < fewest[end] && ONE_SYLLABLE.test(letters.slice(start, end))) {
        fewest[end] = fewest[start] + 1;
        from[end] = start;
      }
    }
  }
  if (!letters || !Number.isFinite(fewest[letters.length])) return null;
  const syllables = [];
  for (let end = letters.length; end > 0; end = from[end]) syllables.unshift(letters.slice(from[end], end));
  return syllables;
}

/** The fewest syllables of pinyin `word` reads as, or null for a word that is none. */
export const fewestSyllables = (word) => syllablesOf(word)?.length ?? null;

/** The first letters of the syllables of a word of pinyin ("daojishi" is "djs"), or null for a word that is none or one syllable. */
export function initialsOfWord(word) {
  const syllables = syllablesOf(word.toLowerCase());
  return syllables && syllables.length > 1 ? syllables.map((syllable) => syllable[0]).join("") : null;
}

// The characters that open each letter's run in the pinyin order of the platform's collation (阿 a, 八 b …
// 帀 z: no run for i, u or v), the classic way to find the first letter of a character's reading without a
// table. Known only where the platform's collation sorts Chinese by pinyin, which it is asked once.
const OPENERS = [..."阿八嚓哒妸发旮哈讥咔垃妈拿噢妑七呥仨他屲夕丫帀"];
const LETTERS = [..."abcdefghjklmnopqrstwxyz"];
let collator;

function sorted() {
  if (collator !== undefined) return collator;
  try {
    const found = new Intl.Collator("zh-CN");
    collator = OPENERS.every((each, at) => at === 0 || found.compare(OPENERS[at - 1], each) < 0) && found.compare("计", "时") < 0 ? found : null;
  } catch {
    collator = null;
  }
  return collator;
}

/** The first letter of a Chinese character's pinyin (its commonest reading), or null. */
function initialOf(character) {
  const found = sorted();
  if (!found || !HAN.test(character)) return null;
  let letter = null;
  for (let at = 0; at < OPENERS.length && found.compare(character, OPENERS[at]) >= 0; at++) letter = LETTERS[at];
  return letter;
}

/** The initials of a name: a Chinese character's first letter of pinyin, a letter or digit as it is ("倒计时" is "djs"), none where the platform cannot tell. */
export function initialsOfName(name) {
  let initials = "";
  for (const character of name) {
    const letter = initialOf(character) ?? (/[a-z0-9]/i.test(character) ? character.toLowerCase() : null);
    if (letter) initials += letter;
  }
  return initials.length > 1 ? initials : "";
}

/**
 * What "/" matches a custom block by (slash-menu matchScore: each word whole, or by its start): its names,
 * its id and the manifest's words, then the initials of the name and of every word that reads as pinyin,
 * so that 倒计时 is found by djs as 公式 is by gs.
 */
export function searchWords({ name, id, words }) {
  const given = `${name.zh} ${name.en} ${id} ${words}`.toLowerCase();
  const initials = [initialsOfName(name.zh), ...words.split(/\s+/).filter(Boolean).map(initialsOfWord)].filter(Boolean);
  return [given, ...new Set(initials)].join(" ");
}
