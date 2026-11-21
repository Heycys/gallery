import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { ITEM, createSpacing, editOf, lineText, needsSpace, separates, stranded, writesTogether } from "../../src/editor/page/typing/spaces.mjs";

// The space between Chinese and a Latin word (or inline code, a formula) that an edit strands goes in
// the same step (src/editor/page/typing/spaces.mjs, docs/editor.md "Browser side"; the user's of
// 2026-11-19). First the rule on the text alone: [the line before the edit, with "|" its caret or
// "[...]" its selection; the line as the browser (and autoSpace) left it, "|" the caret; the line once
// the rule has run, "|" the caret; what the case is]. `own`: indices of the second line the reader typed.
const C = ITEM; // inline code or a formula
const CASES = [
  // 1. Letters typed between Chinese characters, deleted again: the two spaces go with the last one.
  ["中文 a| 中文", "中文 | 中文", "中文|中文", "Backspace on the last letter"],
  ["中文 abc| 中文", "中文 ab| 中文", "中文 ab| 中文", "letters still there: both spaces stay"],
  ["中文 ab| 中文", "中文 a| 中文", "中文 a| 中文", "one letter left: both stay"],
  ["中文 |a 中文", "中文 | 中文", "中文|中文", "Delete on the last letter"],
  ["中文 [abc] 中文", "中文 | 中文", "中文|中文", "the letters selected and deleted (a cut too)"],
  ["中文 a|", "中文 |", "中文|", "at the line's end: the space before them"],
  ["a| 中文", "| 中文", "|中文", "at the line's start: the space after them"],
  ["版本 2| 发布", "版本 | 发布", "版本|发布", "a digit"],
  [`用 ${C}| 安装`, "用 | 安装", "用|安装", "inline code deleted whole: the spaces beside it"],
  ["中| abc", "| abc", "| abc", "the Chinese before a word deleted: a Latin word on the space's other side keeps it"],
  ["abc 中|", "abc |", "abc |", "the Chinese after a word deleted: the same"],
  ["共 3|个", "共 |个", "共|个", "a number and its unit: the space before the number"],
  ["中 A 中文 B| 中", "中 A 中文 | 中", "中 A 中文|中", "only the spaces beside the edit, none further off"],
  // 2. Chinese typed after a word, in front of the space after it: that space goes, the new one stays.
  ["我们用 API| 接口", "我们用 API 的| 接口", "我们用 API 的|接口", "Chinese typed after a word, before its space"],
  ["接口 |API", "接口 的| API", "接口的| API", "Chinese typed before a word, after the space before it"],
  ["中文 [abc] 中文", "中文 好| 中文", "中文好|中文", "the letters replaced by Chinese (typed over, an input method, a paste)"],
  ["中文 [abc] 中文", "中文 xyz| 中文", "中文 xyz| 中文", "the letters replaced by letters: both stay"],
  ["API| 接口", "API\n| 接口", "API\n|接口", "a line break before the space: none at the new line's start"],
  ["API |接口", "API \n|接口", "API\n|接口", "a line break after it: none at the line's end, a Latin word on its other side or not"],
  ["接口| API", "接口\n| API", "接口\n|API", "a line break before a word's space: none at the new line's start"],
  ["API |接口", "API \n|接口", "API\n|接口", "a line break beside a space the reader typed there: it goes too", [3]],
  ["API |", "API \n|", "API \n|", "a space the reader typed at a line's end, no pair beside it: it stays", [3]],
  ["API| 接口", "API，| 接口", "API，|接口", "a Chinese mark typed after a word: the space goes"],
  [`甲 ${C} |乙`, `甲 ${C} ，|乙`, `甲 ${C} ，|乙`, "a Chinese mark after code's space: code on its other side keeps it"],
  ["API| 接口", "API、| 接口", "API、|接口", "、 left in the text: as any Chinese mark (a menu it opens is waited for: createSpacing)"],
  ["API| 接口", "API，| 接口", "API，| 接口", "a Chinese mark beside a space the reader typed: theirs stays", [4]],
  // 3. Words stay apart.
  ["abc [中文] def", "abc | def", "abc |def", "the Chinese between two words deleted: one space between them"],
  ["中文 [abc] def", "中文 | def", "中文| def", "a word's space after it stays, the one it shared with Chinese goes"],
  [`${C} [中文] ${C}`, `${C} | ${C}`, `${C} |${C}`, "code beside code: one space"],
  // 4. What is not the rule's stays.
  ["中文 |abc", "中文|abc", "中文|abc", "the space itself deleted: none put back"],
  ["张三 李|", "张三 |", "张三 |", "a space between Chinese characters is the writer's"],
  ["hello a| world", "hello | world", "hello | world", "spaces between Latin words are the browser's"],
  ["中文， [abc]", "中文， |", "中文， |", "a space after punctuation is the writer's"],
  ["中文 a|", "中文 |", "中文 |", "a deletion keeps the space the reader typed", [2]],
  ["我们用 API| 接口", "我们用 API 的| 接口", "我们用 API 的|接口", "typing takes even one the reader typed", [9]],
  // 5. Latin punctuation and symbols typed take no space (a review of 2026-11-20), nor what is deleted of them.
  [`Use the manager |${C} to`, `Use the manager (|${C} to`, `Use the manager (|${C} to`, "( typed before code in English"],
  [`${C}| to install`, `${C})| to install`, `${C})| to install`, ") typed after code"],
  [`Run ${C}| install`, `Run ${C},| install`, `Run ${C},| install`, ", typed after code"],
  ["Use 微信| then", "Use 微信,| then", "Use 微信,| then", ", typed after Chinese before an English word"],
  ["中文 API| 接口", "中文 API,| 接口", "中文 API,| 接口", "a Latin comma typed after a word"],
  ["我们用 Node| 写", "我们用 Node.| 写", "我们用 Node.| 写", "a Latin period typed after a word"],
  ["方案 abc| 很好用", "方案 abc.| 很好用", "方案 abc.| 很好用", "a period typed after a word by mistake"],
  ["方案 abc.| 很好用", "方案 abc| 很好用", "方案 abc| 很好用", "and deleted again: the space still there"],
  ["学习 C| 语言", "学习 C+| 语言", "学习 C+| 语言", "C+"],
  ["学习 C+| 语言", "学习 C++| 语言", "学习 C++| 语言", "C++ 语言"],
  ["学习 C++| 语言", "学习 C++的| 语言", "学习 C++的|语言", "Chinese typed after C++ (autoSpace puts no space there): the space after C++ goes"],
  ["共 100+| 种", "共 100+的| 种", "共 100+的|种", "the same after 100+"],
  ["学习 C#| 语言", "学习 C| 语言", "学习 C| 语言", "C# deleted from its end: the word C still beside the space"],
  [`the ${C} [x]`, `the ${C} |`, `the ${C} |`, "a word deleted after code: code on the space's other side keeps it"],
  [`Run [${C}] install`, "Run | install", "Run |install", "code deleted between two words: one space"],
  [`I use ${C}| daily`, `I use ${C}s| daily`, `I use ${C}s| daily`, "a letter typed after code"],
  // 6. A space typed in front of the one autoSpace put after a word: one space, the caret after it.
  ["API| 接口", "API | 接口", "API |接口", "a space typed before the space after a word"],
  ["用 |API", "用  |API", "用 |API", "a space typed after the space before a word"],
];

const parse = (marked) => {
  const selection = marked.match(/\[([^\]]*)\]/);
  if (selection) {
    const start = selection.index;
    return { text: marked.replace(/[[\]]/g, ""), start, end: start + selection[1].length };
  }
  const caret = marked.indexOf("|");
  return { text: marked.replace("|", ""), start: caret, end: caret };
};
for (const [beforeMarked, afterMarked, expected, what, own = []] of CASES) {
  const before = parse(beforeMarked);
  const after = parse(afterMarked);
  const edit = editOf(before.text, after.text, { start: before.start, end: before.end, caret: after.start });
  const out = stranded(before.text, after.text, edit, new Set(own));
  assert.deepEqual(out, [...out].sort((a, b) => b - a), `${what}: the last first`);
  let text = after.text;
  let caret = after.start;
  for (const index of out) {
    text = text.slice(0, index) + text.slice(index + 1);
    if (index < caret) caret--;
  }
  assert.equal(`${text.slice(0, caret)}|${text.slice(caret)}`, expected, what);
}

// The edit is found between the selection before it and the caret after it, within a run of the same characters.
assert.deepEqual(editOf("API 接口", "API  接口", { start: 3, end: 3, caret: 4 }), { at: 3, removed: 0, put: 1 }, "a space typed before a space");
assert.deepEqual(editOf("我们用 API 接口", "我们用 API 的 接口", { start: 7, end: 7, caret: 9 }), { at: 7, removed: 0, put: 2 }, "autoSpace's space before what was typed, not the old one");
assert.deepEqual(editOf("中文 a 中文", "中文  中文", { start: 4, end: 4, caret: 3 }), { at: 3, removed: 1, put: 0 }, "Backspace");
assert.equal(separates("中文 abc", 2), true);
assert.equal(separates("中文  abc", 2), false, "two spaces are no separator");
assert.equal(separates("3 个", 1), false, "a number and its unit");
assert.equal(separates("学习 C++ 语言", 6), true, "C++ ends a word");
assert.equal(separates("增长 50% 的", 6), true, "so does 50%");
assert.equal(separates("abc. 中文", 4), false, "a period does not");

// autoSpace's own rule is 0.3.0's: no space after "+", "#" or "%" (100+种, 3#楼, 30%的), and they are no
// sign of a block written together either.
assert.equal(needsSpace("+", "种", "0"), false, "100+种");
assert.equal(needsSpace("#", "楼", "3"), false, "3#楼");
assert.equal(needsSpace("%", "的", "0"), false, "30%的");
assert.equal(needsSpace("0", "种", "0"), false, "100种: a measure word");
assert.equal(needsSpace("0", "用", "0"), true, "100 用户");
assert.equal(needsSpace("3", "个", ""), false, "3个");
assert.equal(writesTogether("使用 GPT 写代码时，30%的用户和45%的团队受益\n"), false, "30%的 is no sign of writing together: abc typed there is spaced");
assert.equal(writesTogether("使用 GPT 写代码时，30个用户和45个团队受益\n"), false, "nor is 30个");
assert.equal(writesTogether("我们用GPT评测了3个模型\n"), true, "GPT written together");
assert.equal(separates("中文 a", 2), true);
assert.equal(separates("中文 ", 2), false, "a line's edge is no neighbour");

// ---------- on the page ----------
const { window } = new JSDOM("<!doctype html><body></body>");
const { document } = window;
const NBSP = String.fromCharCode(0xa0);
const ZWSP = String.fromCharCode(0x200b);
const host = (html) => {
  const node = document.createElement("p");
  node.setAttribute("contenteditable", "true");
  node.innerHTML = html;
  document.body.replaceChildren(node);
  return node;
};
const caretAt = (node, offset) => {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  document.getSelection().removeAllRanges();
  document.getSelection().addRange(range);
};
const textOf = (node) => node.textContent.replaceAll(NBSP, " ").replaceAll(ZWSP, "");

// The line's text: a non-breaking space a space, pads left out, code one item, a break a line's end, a chip no word, an empty chip nothing.
{
  const line = lineText(host(`甲${NBSP}<strong>乙</strong>${ZWSP}<code>x</code><br><span data-ge-atom contenteditable="false">链</span><span data-ge-empty="formula" contenteditable="false"></span>丙`));
  assert.equal(line.text, `甲 乙${ITEM}\n${String.fromCharCode(0)}丙`);
  assert.equal(line.at.length, line.text.length);
}

// Backspace on the last letter typed between Chinese characters, across a mark too: the line and the caret.
{
  const spacing = createSpacing();
  const p = host("中文 a 中文");
  caretAt(p.firstChild, 4);
  spacing.before(p);
  p.firstChild.deleteData(3, 1);
  caretAt(p.firstChild, 3);
  assert.equal(spacing.after(p), true);
  assert.equal(textOf(p), "中文中文");
  assert.equal(document.getSelection().anchorOffset, 2, "the caret where the letters were");

  const bold = host("中文 <strong>a</strong> 中文");
  caretAt(bold.querySelector("strong").firstChild, 1);
  spacing.before(bold);
  bold.querySelector("strong").remove(); // as the browser takes out a mark left empty
  caretAt(bold.firstChild, 3);
  spacing.after(bold);
  assert.equal(textOf(bold), "中文中文", "the spaces either side of a mark");
  assert.equal(spacing.after(bold), false, "an edit is settled once");
}

// Spaces the reader typed are theirs to delete: a deletion keeps them, as long as the text runs on from their typing.
{
  const spacing = createSpacing();
  const p = host("中文");
  const typeAt = (text) => {
    const node = p.firstChild;
    const at = document.getSelection().anchorOffset;
    spacing.before(p);
    node.insertData(at, text);
    caretAt(node, at + text.length);
    spacing.after(p, "input", text);
  };
  caretAt(p.firstChild, 2);
  typeAt(" ");
  typeAt("a");
  spacing.before(p);
  p.firstChild.deleteData(3, 1);
  caretAt(p.firstChild, 3);
  spacing.after(p);
  assert.equal(textOf(p), "中文 ", "the reader's space kept");
  // The same text written anew (an undo, someone else's write): no space of the reader's is known.
  p.firstChild.data = "中文 a";
  caretAt(p.firstChild, 4);
  spacing.before(p);
  p.firstChild.deleteData(3, 1);
  caretAt(p.firstChild, 3);
  spacing.after(p);
  assert.equal(textOf(p), "中文", "a space not known to be the reader's goes");
}

// A space typed in front of the space after a word is that space: one stays, and it is no space of the
// reader's (the word deleted later, it goes as the space before the word does).
{
  const spacing = createSpacing();
  const p = host("我们用 API 接口");
  caretAt(p.firstChild, 7);
  spacing.before(p);
  p.firstChild.insertData(7, " ");
  caretAt(p.firstChild, 8);
  assert.equal(spacing.after(p, "input", " "), true);
  assert.equal(textOf(p), "我们用 API 接口", "one space");
  assert.equal(document.getSelection().anchorOffset, 8, "the caret after it");
  const word = document.createRange();
  word.setStart(p.firstChild, 4);
  word.setEnd(p.firstChild, 7);
  document.getSelection().removeAllRanges();
  document.getSelection().addRange(word);
  spacing.before(p);
  p.firstChild.deleteData(4, 3);
  caretAt(p.firstChild, 4);
  spacing.after(p);
  assert.equal(textOf(p), "我们用接口", "the word deleted: both spaces go");
}

// A paste's snapshot is the paste's alone (and used once, whoever asks), and an input's goes with its task.
{
  const spacing = createSpacing();
  const p = host("中文 a 中文");
  caretAt(p.firstChild, 4);
  spacing.before(p, "paste");
  p.firstChild.deleteData(3, 1);
  caretAt(p.firstChild, 3);
  assert.equal(spacing.after(p, "input"), false, "an input takes no paste's");
  assert.equal(spacing.after(p, "paste"), false, "and lets it go");
  p.firstChild.insertData(3, "a");
  caretAt(p.firstChild, 4);
  spacing.before(p, "paste");
  p.firstChild.deleteData(3, 1);
  caretAt(p.firstChild, 3);
  assert.equal(spacing.after(p, "paste"), true);
  assert.equal(textOf(p), "中文中文");
  spacing.before(p);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(spacing.after(p), false, "an input's snapshot is gone once its task is over (execCommand's input finds none)");
}

// Enter where a space stands between a word and Chinese: the space at the break goes where Chinese is on
// its other side (no line's edge is a neighbour), stays where a word or code is; none when the caret is in code.
{
  const spacing = createSpacing();
  const split = (html, place) => {
    const p = host(html);
    const [node, offset] = place(p);
    caretAt(node, offset);
    const range = document.getSelection().getRangeAt(0);
    spacing.split(p, range);
    return { text: textOf(p), left: range.startContainer.nodeType === 3 ? range.startContainer.data.slice(0, range.startOffset) : null };
  };
  assert.deepEqual(split("我们用 API 接口", (p) => [p.firstChild, 7]), { text: "我们用 API接口", left: "我们用 API" }, "before the space after a word");
  assert.deepEqual(split("我们用 API 接口", (p) => [p.firstChild, 8]), { text: "我们用 API接口", left: "我们用 API" }, "after it: it goes too, a Latin word on its other side or not");
  assert.deepEqual(split("看接口 API", (p) => [p.firstChild, 3]), { text: "看接口API", left: "看接口" }, "before a word's space: none at the new line's start");
  assert.equal(split("我们用 API ", (p) => [p.firstChild, 8]).text, "我们用 API ", "a space at the line's end with no pair beside it: not the rule's");
  assert.equal(split("用 <code>npm</code> 安装", (p) => [p.querySelector("code").firstChild, 2]).text, "用 npm 安装", "the caret in code: no space goes");
  assert.equal(split("用 <code>npm</code> 安装", (p) => [p.lastChild, 0]).text, "用 npm安装", "right after code: the space after it");
  assert.equal(split("用 <code>npm</code> 安装", (p) => [p.firstChild, 2]).text, "用npm 安装", "right before code: the space before it");
  assert.equal(split("Run <code>npm</code> install", (p) => [p.lastChild, 0]).text, "Run npminstall", "between code and a word: at the new line's start, it goes");
}

// A "、" typed beside the rule's space is parked: looked at once its menu is over, as any Chinese mark
// when it is still there, nothing when the menu took it; the next edit lets a parked one go.
{
  const spacing = createSpacing();
  const typeMark = (p) => {
    caretAt(p.firstChild, 3);
    spacing.before(p);
    p.firstChild.insertData(3, "、");
    caretAt(p.firstChild, 4);
    return spacing.after(p, "input", "、");
  };
  const kept = host("API 接口");
  assert.equal(typeMark(kept), false, "parked: nothing yet");
  assert.equal(spacing.parkedHost(), kept);
  assert.equal(textOf(kept), "API、 接口");
  assert.equal(spacing.settle(kept), true, "the menu closed, the 、 still there");
  assert.equal(textOf(kept), "API、接口", "as with ，");
  assert.equal(spacing.parkedHost(), null);
  const taken = host("API 接口");
  typeMark(taken);
  taken.firstChild.deleteData(3, 1); // a block chosen: the menu takes the 、 and its query
  assert.equal(spacing.settle(taken), false, "the menu took it: nothing");
  assert.equal(textOf(taken), "API 接口");
  const left = host("API 接口");
  typeMark(left);
  spacing.before(left);
  assert.equal(spacing.parkedHost(), null, "the next edit lets it go");
  assert.equal(spacing.settle(left), false);
}

// What was taken goes with the first after(), whatever it was for, and with forget().
{
  const spacing = createSpacing();
  const p = host("中文 a 中文");
  caretAt(p.firstChild, 4);
  spacing.before(p, "composition");
  assert.equal(spacing.after(p, "paste"), false, "a paste's after() takes no composition's");
  p.firstChild.deleteData(3, 1);
  caretAt(p.firstChild, 3);
  assert.equal(spacing.after(p, "composition"), false, "and it is gone with that after()");
  assert.equal(textOf(p), "中文  中文");
  spacing.before(p, "paste");
  spacing.forget();
  assert.equal(spacing.after(p, "paste"), false, "forgotten");
}

console.log("typed spaces ok");
