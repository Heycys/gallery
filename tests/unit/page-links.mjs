import assert from "node:assert/strict";
import { BLOCK_ID } from "../../src/shared/ids.mjs";
import { DOC_SLUG, earlierId, earlierLink, inTrash, linkedPages, namedLinks, newPageId, pageId, pageLink, pageLinks, pageOfLink } from "../../src/shared/page-links.mjs";

// A document's link in the workbench's address: docs/workbench.md.

// A page id has a block id's look and is the same wherever it is worked out: these never change, for
// every address written down goes by them.
assert.deepEqual(["report", "doc", "doc-2", "weekly", "a"].map(pageId), ["khroxhso", "u4yd2em7", "bef5a34c", "se4zhq0w", "zqnphlqc"]);
const ids = new Set();
for (let number = 0; number < 5000; number++) {
  const id = pageId(`doc-${number}`);
  assert.ok(BLOCK_ID.test(id), id);
  ids.add(id);
}
assert.equal(ids.size, 5000, "no two folder names of a large workspace meet on one id");

// A folder named doc- and the eight characters of an id (a lowercase letter, then lowercase letters or
// digits) has those eight as its id: the folders the workbench makes. Any other name keeps its hash, so
// that every address written down before goes on opening its document.
assert.deepEqual(["doc-tacti90g", "doc-a2345678", "doc-zzzzzzzz"].map(pageId), ["tacti90g", "a2345678", "zzzzzzzz"]);
assert.ok(DOC_SLUG.test("doc-tacti90g") && BLOCK_ID.test(pageId("doc-tacti90g")), "its id has a block id's look");
// Near misses: another case, a digit first, one character more or fewer, anything after or before. Each goes by a hash, as before
// (pinned: the ids these names had before the rule, which a hash of the name alone gives).
const nearMisses = { "doc-Abcdefgh": "mbblnlsj", "doc-abcdefgH": "p4dyo5tc", "doc-1bcdefgh": "s9uslb52", "doc-abc": "s2t3x67f", "doc-abcdefghi": "hoqxi1jw", "doc-abcdefgh-2": "ncpubnlq", "doc-0": "o8zxrmgf" };
for (const [name, id] of Object.entries(nearMisses)) {
  assert.ok(!DOC_SLUG.test(name), `${name} is no id's own name`);
  assert.equal(pageId(name), id, `${name} keeps the id its name always gave`);
}
for (const odd of ["xdoc-abcdefgh", "Doc-abcdefgh", "doc_abcdefgh", "doc-abcdefgh\n", " doc-abcdefgh", "doc-abcd_efg", "doc-abcdefg-"]) assert.ok(!DOC_SLUG.test(odd), `${JSON.stringify(odd)} is no id's own name`);
assert.deepEqual(["report-3", "alpha-copy"].map(pageId), ["n1q58pyj", "s6qti1nm"], "old folder names: the ids they had");
assert.equal(pageLink({ slug: "doc-tacti90g", title: "反馈文档" }), "反馈文档-tacti90g", "an address ends with the id the folder name holds");
assert.equal(pageOfLink(new Map([["doc-tacti90g", "x"], ["report", "y"]]), "反馈文档-tacti90g"), "doc-tacti90g", "and opens that folder");
assert.equal(pageOfLink(new Map([["doc-tacti90g", "x"]]), "tacti90g"), "doc-tacti90g", "the id alone too");
assert.equal(pageOfLink(new Map([["doc-tacti90g", "x"]]), "doc-tacti90g"), "doc-tacti90g", "and the folder name");

// An Agent's slug may have that very shape (doc-overview, doc-research): it had the hash for an id until
// the folders the workbench makes had their own, and the address written down then (#Overview-f3md3kg4,
// what 0.1.x printed, a bookmark, a block's copied link) opens it still. Pinned: the ids main's pageId gave.
{
  const was = { "doc-overview": "f3md3kg4", "doc-research": "vfrmg3b9", "doc-proposal": "r1ytgprx", "doc-q3report": "z7ktzi5j", "doc-tacti90g": "ht162ot3" };
  for (const [name, id] of Object.entries(was)) {
    assert.equal(earlierId(name), id, `${name}: the id it had`);
    assert.notEqual(pageId(name), id, `${name}: its own eight now`);
  }
  assert.deepEqual(["report", "doc", "doc-2", "doc-Abcdefgh", "doc-abcdefgh-2"].map(earlierId), [null, null, null, null, null], "every other name has the id it had: nothing earlier");
  const held = pageLinks([{ slug: "doc-overview", title: "Overview" }, { slug: "doc-research", title: "调研" }, { slug: "report", title: "旧" }]);
  assert.deepEqual([...held.values()], ["Overview-overview", "调研-research", "旧-" + pageId("report")], "an address written now ends with the folder's eight");
  assert.equal(pageOfLink(held, "Overview-f3md3kg4"), "doc-overview", "the address 0.1.x gave opens it");
  assert.equal(pageOfLink(held, "f3md3kg4"), "doc-overview", "the earlier id alone");
  assert.equal(pageOfLink(held, "以前的标题-vfrmg3b9"), "doc-research", "under any words");
  assert.equal(pageOfLink(held, "Overview-overview"), "doc-overview", "and the new one");
  assert.equal(pageOfLink(held, "Overview-ht162ot3"), null, "an earlier id of a folder this list does not hold");
  // An id some folder has for its own is that folder's, whatever another's earlier id is: the first reading is by own ids.
  const meeting = new Map([["doc-overview", "a"], ["doc-f3md3kg4", "b"]]);
  assert.equal(pageOfLink(meeting, "f3md3kg4"), "doc-f3md3kg4", "an own id before an earlier one");
  assert.equal(earlierLink("doc-overview", "Overview-overview"), "Overview-f3md3kg4", "the link it had: its words of now, the earlier id");
  assert.equal(earlierLink("doc-overview", "overview"), "f3md3kg4", "a title that left no words: the id alone");
  assert.equal(earlierLink("report", "旧-" + pageId("report")), null, "no other name has an earlier link");
  assert.equal(earlierLink("doc-overview", undefined), null, "none for a document the list does not hold");
}

// A new id: eight characters of that shape from the random source it is given (a number from 0 up to
// 1), another while the one picked is held.
{
  const sequence = (...values) => {
    let at = 0;
    return () => values[at++ % values.length];
  };
  assert.equal(newPageId(new Set(), sequence(0)), "aaaaaaaa", "the lowest picks");
  assert.equal(newPageId(new Set(), sequence(0.9999999)), "z9999999", "the highest: the last letter first, the last digit after");
  assert.equal(newPageId(new Set(), sequence(0, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99)), "a9999999", "a letter first, digits (or letters) after");
  assert.equal(newPageId(new Set(["aaaaaaaa"]), sequence(0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5)), "nsssssss", "the next pick when the first is held");
  const seen = new Set();
  for (let number = 0; number < 2000; number++) {
    const id = newPageId(new Set());
    assert.match(`doc-${id}`, DOC_SLUG);
    assert.equal(pageId(`doc-${id}`), id);
    seen.add(id);
  }
  assert.equal(seen.size, 2000, "random ones do not meet");
}

const links = (pages) => Object.fromEntries(pageLinks(pages.map(([slug, title]) => ({ slug, title }))));

assert.deepEqual(links([["report", "项目周报"]]), { report: "项目周报-khroxhso" }, "a title's words and the id");
assert.deepEqual(links([["report", "周报"], ["doc", "周报"]]), { report: "周报-khroxhso", doc: "周报-u4yd2em7" }, "two pages of one title need no number");
assert.deepEqual(links([["report", "Q3 复盘: 增长/留存？"], ["doc", "  a b  "], ["a", "C#_v1.2"]]), { report: "Q3-复盘-增长-留存-khroxhso", doc: "a-b-u4yd2em7", a: "C-_v1-2-zqnphlqc" }, "what a link cannot hold becomes dashes");
assert.deepEqual(links([["report", ""], ["doc", "???"], ["a", undefined]]), { report: "khroxhso", doc: "u4yd2em7", a: "zqnphlqc" }, "a title that leaves no words: the id alone");
assert.equal(pageLink({ slug: "report" }), "khroxhso", "as when the title is not known");
// A mark goes with what it sits on: an emoji's variation selector is no word of its own.
const emoji = (...points) => String.fromCodePoint(...points);
const heart = emoji(0x2764, 0xfe0f);
const keycap = (key) => emoji(key.codePointAt(0), 0xfe0f, 0x20e3);
assert.deepEqual(links([["report", heart], ["doc", keycap("#")], ["a", emoji(0x26a0, 0xfe0f)]]), { report: "khroxhso", doc: "u4yd2em7", a: "zqnphlqc" }, "an emoji with its selector leaves no words");
assert.deepEqual(links([["report", `${heart} 周报`], ["doc", `周报 ${heart}`]]), { report: "周报-khroxhso", doc: "周报-u4yd2em7" }, "nor a word of its selector");
assert.deepEqual(links([["report", keycap("1")], ["doc", "ก็ नमस्ते"]]), { report: `${keycap("1")}-khroxhso`, doc: "ก็-नमस्ते-u4yd2em7" }, "a mark on a letter or a number stays in its word");
assert.deepEqual(links([["report", `${emoji(0xfe0f)}周报`], ["doc", emoji(0xfe0f)]]), { report: "周报-khroxhso", doc: "u4yd2em7" }, "and one on nothing is no word");

const pages = pageLinks([{ slug: "report", title: "周报" }, { slug: "doc", title: "周报" }]);
assert.equal(pageOfLink(pages, "周报-khroxhso"), "report", "a link names its document");
assert.equal(pageOfLink(pages, "周报-u4yd2em7"), "doc", "and only its own, whatever the words");
assert.equal(pageOfLink(pages, "khroxhso"), "report", "the id alone");
assert.equal(pageOfLink(pages, "以前的-标题-3-khroxhso"), "report", "the words are a label: a title it left, or any other");
assert.equal(pageOfLink(pages, "doc"), "doc", "a folder name goes to its folder");
assert.equal(pageOfLink(pages, "周报-doc"), null, "after the last dash stands an id, not a folder name");
assert.equal(pageOfLink(pages, "周报"), null, "a title alone names none");
assert.equal(pageOfLink(pages, "周报-2"), null, "nor a title with a number");
assert.equal(pageOfLink(pages, ""), null);
assert.equal(pageOfLink(new Map([["doc", "x"], ["khroxhso", "y"]]), "khroxhso"), "khroxhso", "a folder of that name first");

// What the trash holds, by its folder name or its link, what a workbench's address may say.
const trash = [{ slug: "weekly", title: "项目周报" }, { slug: "old", title: "项目周报" }];
assert.equal(inTrash(trash, "weekly"), true);
assert.equal(inTrash(trash, pageLink(trash[0])), true, "by its link");
assert.equal(inTrash(trash, `${pageId("old")}/ab12cd34`), true, "by its id, with a block");
assert.equal(inTrash(trash, `以前的标题-${pageId("weekly")}/ab12cd34`), true, "by a link of a title it left");
assert.equal(inTrash(trash, "weekly/ab12cd34"), true);
assert.equal(inTrash(trash, "项目周报"), false, "a title alone names none");
assert.equal(inTrash(trash, `别的-${pageId("report")}`), false, "another page's id");
assert.equal(inTrash([], "weekly"), false);

// An address written for anyone: the trash's too, and a page's own where the trash holds its folder name.
assert.deepEqual(Object.fromEntries(namedLinks(pageLinks([{ slug: "report", title: "周报" }]), [{ slug: "weekly", title: "周报" }, { slug: "report", title: "旧的" }])), { report: "周报-khroxhso", weekly: "周报-se4zhq0w" });

// 写作偏好 goes by no link.
assert.deepEqual(linkedPages({ a: { slug: "a" }, page: { slug: "page", instructions: true } }), [{ slug: "a" }]);

console.log("Checked page links: the id (a doc-<eight> folder name's own and the earlier one that still opens it, the others' hash, near misses and old names pinned, a new one picked from the random source it is given), what a link cannot hold, a title that leaves no words, what a link reads as, the trash.");
