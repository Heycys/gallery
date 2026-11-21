// How the 表情符号 tab ranks an emoji for what is typed in its filter (emoji-tab.mjs buildRows sorts by it),
// apart from the tab so a unit test can ask it (tests/unit/icons.mjs) without a page.

import { emojiInfo, frecencyBoost, stripSkinTone } from '../../../shared/emoji/data.mjs';
import { customEmojiOf, customEmojiKeywords, isCustomEmojiString } from '../../../shared/emoji/custom.mjs';
import { VARIATION_SELECTOR } from '../../../shared/emoji/codepoints.mjs';
import { EVERYDAY_EMOJIS } from '../../../shared/emoji/everyday.mjs';

// An emoji without its variation selectors and skin tone, as EVERYDAY is keyed.
const bareEmoji = emoji => stripSkinTone(emoji).replaceAll(VARIATION_SELECTOR, '');
// Gallery's list of the emojis a document reaches for most (shared/emoji/everyday.mjs): each one's place counted
// from the end, the first of the list the highest; an emoji not on it has none (0).
const EVERYDAY = new Map(EVERYDAY_EMOJIS.map((emoji, at) => [bareEmoji(emoji), EVERYDAY_EMOJIS.length - at]));

const CJK = /[㐀-鿿豈-﫿]/;
// English words that say nothing of what an emoji is ("face blowing a kiss", "heart on fire"): a name is never
// found by one of them as one of its words.
const SMALL_WORDS = new Set(['a', 'an', 'and', 'at', 'behind', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'over', 'the', 'to', 'under', 'with', 'without']);
// Where the part of an English name saying what the emoji is ends: "cat with wry smile" is a cat, "money with wings" money.
const ATTACHED = / (?:with|without|of|in|on|and|behind|from|at|for|over|under) /;

/* An emoji's score for the filter, higher first, or undefined: it does not match. `filter` is normalized
   (data.mjs normalizeFilter), `parts` its words. An emoji's words are a list a language ({ words, codes }: its name
   first, its short codes up to `codes`, then its keywords; a custom emoji's, its name and the words of it); a word's
   place is 0 its name, 1 a short code, 2 a keyword. Best first:
     the filter holding the emoji itself                          100 less where it stands in the filter
     a word equal to the filter                                   100, 90, 80 by the word's place; an English name
                                                                  holding the filter as words of it counts as a
                                                                  keyword equal to it ("thumbs" finds "thumbs up")
     a word starting with it                                      10, 9, 8 by the word's place
     every word of the filter starting one of its words           the number of words
     a word holding it                                            1
   Between two of one score, in this order (ties, below 0.5, so a score never reaches the next):
     the one whose name of one word (a Chinese one, say) the filter makes up more of (心 finds 红心 before 喜笑颜开,
       whose keywords hold 心 too; 笑 微笑 before 笑哭了);
     an everyday emoji (EVERYDAY) before one that is not (sad: the loudly crying face before "sad but relieved face",
       whose name holds the word; green: the green heart before "leafy green");
     an English name holding the filter as words of it ("party popper" before the faces whose keywords say party);
       of two such, the one whose name ends with it, before a "with …" and the like (what the emoji is: "full moon"
       before "moon cake"), then the one of fewer words ("money bag" before "money-mouth face");
     the one people use more, by EVERYDAY's order (idea: the light bulb before the thought balloon; 爱 the red heart
       before 花痴; yes and 好 the thumbs up before the saluting face);
     then the data's order, Unicode's (the sort keeps it).
   So the everyday list never lifts an emoji past a better match: a name equal to the filter (panda: the panda) still
   goes before an everyday emoji whose keyword it is, and the closeness before it too (音乐: 音乐键盘 before 音符).
   The frequently used go first of all (100 a use, halving weekly). A filter between colons (:fire:) is tried without
   them too; one of three letters or more and no space is compared with the words' letters run together ("redheart"). */
export function rank(emoji, filter, parts) {
  if (filter === '') return 100;
  const info = emojiInfo(emoji);
  let lists = info?.words;
  let unique = info?.uniqueWords || [];
  if (!info && isCustomEmojiString(emoji)) {
    const custom = customEmojiOf(emoji);
    if (!custom) return;
    lists = [{ words: customEmojiKeywords(custom.name), codes: 1 }];
    unique = lists[0].words;
  }
  if (!lists) return;
  const boost = frecencyBoost(emoji);
  const inFilter = filter.indexOf(emoji);
  if (inFilter !== -1) return 100 - inFilter + boost;
  const bare = filter.replace(/^:+|:+$/g, '');
  const filters = bare && bare !== filter ? [filter, bare] : [filter];
  const joined = filter.length >= 3 && !filter.includes(' ');
  // The best place of a word that passes `test` with one of the filters, or undefined.
  const best = test => {
    let place;
    for (const each of filters) {
      for (const { words, codes } of lists) {
        const at = (joined ? words.map(w => w.replaceAll(' ', '')) : words).findIndex(w => test(w, each));
        if (at !== -1) place = Math.min(place ?? 2, at === 0 ? 0 : at < codes ? 1 : 2);
      }
    }
    return place;
  };
  const closeness = Math.max(0, ...filters.flatMap(each => lists.map(({ words: [name = ''] }) => (!name.includes(' ') && name.includes(each) ? each.length / name.length : 0))));
  const named = byName(lists, filters);
  const everyday = info ? EVERYDAY.get(bareEmoji(info.emoji)) ?? 0 : 0;
  const ties = digits([
    [Math.round(closeness * 1000), 1001],
    [everyday ? 1 : 0, 2],
    [named ? 1 : 0, 2],
    [named?.ends ? 1 : 0, 2],
    [named ? 8 - Math.min(named.words, 8) : 0, 8],
    [everyday, EVERYDAY.size + 1],
  ]);
  const exact = best((word, each) => word === each);
  if (exact !== undefined && exact < 2) return (10 - exact) * 10 + ties + boost;
  if (exact === 2 || named) return 80 + ties + boost;
  const prefix = best((word, each) => word.startsWith(each));
  if (prefix !== undefined) return 10 - prefix + ties + boost;
  if (parts.length > 1 && parts.every(part => unique.some(w => w.startsWith(part)))) return parts.length + ties + boost;
  if (best((word, each) => word.includes(each)) !== undefined) return 1 + ties + boost;
}

// The ties as one number from 0 to 0.49: each [digit, base] (0 ≤ digit < base) a digit of it, the first counting
// most, so one counts only between two equal in those before it.
function digits(pairs) {
  let value = 0, scale = 1;
  for (const [digit, base] of pairs) value += digit * (scale /= base);
  return value * 0.49;
}

// The English name (a custom emoji's, its name) holding a filter as words of it: { ends (the part saying what the
// emoji is ends with it), words (the name's) }, or null; never for a Chinese filter (the closeness says that), one
// letter, or a small word.
function byName(lists, filters) {
  const name = (lists[1] ?? lists[0]).words[0] ?? '';
  let found = null;
  for (const each of filters) {
    if (CJK.test(each) || each.length < 2 || SMALL_WORDS.has(each) || !` ${name} `.includes(` ${each} `)) continue;
    const ends = ` ${name.split(ATTACHED)[0]}`.endsWith(` ${each}`);
    if (!found || ends) found = { ends, words: name.split(' ').length };
  }
  return found;
}
