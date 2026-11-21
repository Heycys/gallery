import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { sectionAfter } from "../../src/editor/components/section/page.mjs";
import { lostKey, pendingKey, readLost, recover, stateKey } from "../../src/editor/page/autosave.mjs";
import { ELEMENT_ID, atomSource, newAtom, newContainer, newHost, serializeInner } from "../../src/editor/page/core.mjs";
import { pack, unpack } from "../../src/editor/page/sync-state.mjs";
import { commitEdits, hashOf } from "../../src/editor/source.mjs";
import { advance, browser, list, open as openOn, page, play, removeUnit, seal, server, stop, storage } from "./page-harness.mjs";

// Autosave (docs/editor.md, "Autosave", "Crash buffer"): when commits go, what happens when an
// answer is lost or never comes, what the page keeps in the crash buffer, when it may reload by
// itself, and what a page opening on the report does with what another left. The page's side runs
// in jsdom (autosave.mjs over commit.mjs) against the server's (commitEdits), with the network, the
// browser's storage and time played (page-harness.mjs): a commit's answer delivered, held, lost
// after the file was written, or refused as busy; the clock moved by hand.

const SOURCE = page(`  <section class="doc-section" aria-labelledby="a">
    <h2 id="a">第一章</h2>
    <p>甲段落，写的是开头。</p>
    <p>乙段落，写的是中间。</p>
  </section>

  <section class="doc-section" aria-labelledby="b">
    <h2 id="b">第二章</h2>
    <p>丙段落，在第二章。</p>
  </section>
`);

const SECTION_B = /\n\n  <section class="doc-section" aria-labelledby="b"[^>]*>[\s\S]*?<\/section>/;

// A page opened on SOURCE (its own server and storage, unless given), no reload counted yet.
function open(source = SOURCE, { local = storage(), net = server(source), holding } = {}) {
  browser.reloads = 0;
  return openOn(net, local, { holding });
}

play();
try {
  // An answer lost after the file took the commit (the preview server restarted in the middle, say),
  // and the reader writes on in the block it made: the commit goes again as it went, then what was
  // written since. Before, the page built it anew: the server took the block it made already as
  // done, and the words written since never reached the file while the page said all was saved.
  {
    const t = open();
    const focus = sectionAfter(t.section("第一章")).focus;
    focus.textContent = "新段落A";
    t.net.mode = "lose";
    t.change(true);
    await advance();
    assert.ok(t.net.file.includes("新段落A") && t.autosave.state.offline, "written, the answer lost: offline for the page");
    focus.textContent = "新段落A，又写了B";
    t.change();
    await advance(10000);
    assert.deepEqual(t.net.posts[1].body, t.net.posts[0].body, "sent again as it went, its id too");
    assert.ok(t.net.file.includes("新段落A，又写了B"), "and the words written since after it");
    assert.deepEqual(t.conflicts, []);
    assert.ok(t.autosave.state.waiting === 0 && !t.autosave.state.syncing && t.buffer() === null, "nothing left");
    assert.ok(!t.autosave.state.foreign && browser.reloads === 0 && !t.net.posts.some((post) => post.url.includes("/reverted")), "given the answer it had: no one else wrote, nothing to show");
  }

  // The same in an existing paragraph: no conflict of the reader with their own words, and nothing
  // said to have been merged (the file had those words already).
  {
    const t = open();
    const host = t.text("甲段落");
    host.textContent = "甲段落，写的是开头X。";
    t.net.mode = "lose";
    t.change(true);
    await advance();
    host.textContent = "甲段落，写的是开头XY。";
    t.change();
    await advance(10000);
    assert.ok(t.net.file.includes("甲段落，写的是开头XY。"));
    assert.deepEqual(t.conflicts, []);
    const commits = t.net.posts.filter((post) => post.url.includes("/commit"));
    assert.equal(commits.length, 3, "the lost one, sent again, then the rest");
    assert.equal(commits[1].body.texts[0].parts[0].html, "甲段落，写的是开头X。");
  }

  // Busy: tried again as it went, later.
  {
    const t = open();
    t.text("乙段落").textContent = "乙段落（改）。";
    t.net.mode = "busy";
    t.change(true);
    await advance();
    t.net.mode = "deliver";
    await advance(1500);
    assert.ok(t.net.file.includes("乙段落（改）。") && t.autosave.state.waiting === 0);
  }

  // A commit on its way, and the reader puts the page back as it was: the buffer still holds the
  // commit (its answer may never come; the file may have it), and the page then takes it out again.
  // Leaving meanwhile sends nothing more: what is on its way is in the buffer.
  {
    const t = open();
    let release;
    t.net.gate = new Promise((resolve) => (release = resolve));
    const host = t.text("丙段落");
    host.textContent = "丙段落（在途）。";
    t.change(true);
    await advance();
    host.textContent = "丙段落，在第二章。";
    t.change();
    assert.ok(t.buffer()?.sent?.texts?.[0]?.parts[0].html === "丙段落（在途）。", "the commit on its way stays in the buffer");
    t.autosave.leave();
    await advance();
    assert.equal(t.net.posts.length, 1, "leaving sends no second commit while one is on its way");
    t.net.gate = null;
    release();
    await advance(5000);
    assert.ok(t.net.file.includes("<p data-block-id") && t.net.file.includes("丙段落，在第二章。") && !t.net.file.includes("在途"), "then taken out again");
    assert.equal(t.buffer(), null);
  }

  // A block the file refuses (written into a section the Agent deleted meanwhile): held for the
  // reader. The page does not reload over it when the Agent's write comes in, the crash buffer holds
  // it, and its card has the reader's words. Given up (撤销这一块), the page reloads.
  {
    const t = open();
    t.text("丙段落").textContent = "丙段落，在第二章（改）。"; // the section and its blocks get their ids
    t.change(true);
    await advance(3000);
    const box = list(t.document, t.section("第二章"), ["新的一段"]);
    t.net.file = t.net.file.replace(SECTION_B, "");
    t.change(true);
    await advance(3000);
    assert.equal(t.conflicts.length, 1);
    const [conflict] = t.conflicts;
    assert.ok(conflict.kind === "insert" && conflict.key.startsWith("i") && conflict.mine.includes("新的一段"), JSON.stringify({ ...conflict, element: undefined }));
    assert.equal(t.autosave.state.held, 1, "held, as conflicts of text are");
    assert.ok(JSON.stringify(t.buffer()).includes("新的一段"), "in the crash buffer");
    t.autosave.heard("someone-else");
    await advance(10000);
    assert.equal(browser.reloads, 0, "no reload over it");
    box.remove();
    t.commits.resolve(conflict.key, "discard");
    t.change(true);
    await advance(3000);
    assert.equal(browser.reloads, 1, "given up: the page shows the file");
  }

  // A block no commit can carry yet (a new row of columns, one of which holds nothing): the crash
  // buffer keeps its text, and the page does not reload by itself over it. Finished, it goes in.
  {
    const t = open();
    const row = newContainer(t.document, "columns");
    const [left, right] = [newContainer(t.document, "column"), newContainer(t.document, "column")];
    const words = newHost(t.document, "paragraph");
    words.textContent = "子项的文字";
    left.append(words);
    row.append(left, right);
    t.section("第一章").append(row);
    t.change(true);
    await advance(3000);
    assert.equal(t.autosave.state.drafts, 1);
    assert.deepEqual(t.buffer()?.keep, [{ why: "draft", text: "子项的文字" }]);
    t.autosave.heard("someone-else");
    await advance(10000);
    assert.equal(browser.reloads, 0, "no reload over it");
    const other = newHost(t.document, "paragraph");
    other.textContent = "父项";
    right.append(other);
    t.change();
    await advance(10000);
    assert.ok(t.net.file.includes("父项") && t.net.file.includes("子项的文字"));
    assert.equal(browser.reloads, 1, "written: the page shows the file");
  }

  // The check for texts put back (POST /__gallery/edit/reverted) takes a while; the reader changes
  // something meanwhile: no reload then, only once that is saved and the reader pauses.
  {
    const t = open();
    t.text("甲段落").textContent = "甲段落（改）。";
    t.change(true);
    await advance(3000);
    let release;
    t.net.revertGate = new Promise((resolve) => (release = resolve));
    t.autosave.heard("someone-else");
    await advance(2000);
    assert.ok(t.net.posts.some((post) => post.url.includes("/reverted")), "the check is on its way");
    t.text("乙段落").textContent = "乙段落（检查时改）。";
    t.change();
    release();
    t.net.revertGate = null;
    await advance(100);
    assert.equal(browser.reloads, 0, "not while something waits");
    await advance(10000);
    assert.ok(t.net.file.includes("乙段落（检查时改）。"));
    assert.equal(browser.reloads, 1);
  }

  // The crash buffer cannot be written (storage full or blocked): the page says so, once.
  {
    const t = open();
    t.local.failing = true;
    t.net.mode = "offline";
    t.text("甲段落").textContent = "甲段落（存不下）。";
    t.change(true);
    await advance();
    t.text("甲段落").textContent = "甲段落（还是存不下）。";
    t.change();
    await advance(1500);
    assert.deepEqual(t.warnings, ["storage"]);
    assert.ok(t.autosave.state.unstored);
  }

  // A block one load committed and the next committed again is one text to the revert check, in the
  // load after: where it started, what it was between and the reader's last words; written back as the
  // second load read it, it is held for the reader with those words.
  {
    const local = storage();
    const net = server(SOURCE);
    browser.reloads = 0;
    const shownAgain = async (t, change) => {
      net.file = change(net.file);
      t.autosave.heard(hashOf(net.file));
      await advance(5000);
      t.autosave.close();
    };
    let t = openOn(net, local);
    t.text("甲段落").textContent = "甲段落（一）。";
    t.change(true);
    await advance(3000);
    await shownAgain(t, (text) => text.replace("丙段落，在第二章。", "丙段落，在第二章（AI）。"));
    t = openOn(net, local);
    const read = net.file;
    t.text("甲段落").textContent = "甲段落（二）。";
    t.change(true);
    await advance(3000);
    await shownAgain(t, (text) => text.replace("丙段落，在第二章（AI）。", "丙段落，在第二章（AI 又改）。"));
    assert.equal(browser.reloads, 2, "shown again twice");
    t = openOn(net, local);
    net.file = read.replace("乙段落，写的是中间。", "乙段落，写的是中间（AI）。");
    t.autosave.heard(hashOf(net.file));
    await advance(5000);
    const asked = net.posts.filter((post) => post.url.includes("/reverted")).at(-1).body.texts;
    assert.deepEqual(asked.map(({ original, earlier, block }) => [original, earlier, block.before]), [["甲段落，写的是开头。", ["甲段落（一）。"], "甲段落（二）。"]], JSON.stringify(asked));
    assert.deepEqual(t.reverts.map(({ theirs, mine }) => [theirs, mine]), [["甲段落（一）。", "甲段落（二）。"]], JSON.stringify(t.reverts));
    t.autosave.close();
  }

  // A block a later load committed back as the first found it is asked of what it was between: an Agent
  // writing back the file it read before puts back what the reader took back, held for them.
  {
    const local = storage();
    const net = server(SOURCE);
    browser.reloads = 0;
    const shownAgain = async (t, change) => {
      net.file = change(net.file);
      t.autosave.heard(hashOf(net.file));
      await advance(5000);
      t.autosave.close();
    };
    let t = openOn(net, local);
    t.text("甲段落").textContent = "甲段落（一）。";
    t.change(true);
    await advance(3000);
    const read = net.file;
    await shownAgain(t, (text) => text.replace("丙段落，在第二章。", "丙段落，在第二章（AI）。"));
    t = openOn(net, local);
    t.text("甲段落").textContent = "甲段落，写的是开头。";
    t.change(true);
    await advance(3000);
    await shownAgain(t, (text) => text.replace("丙段落，在第二章（AI）。", "丙段落，在第二章（AI 又改）。"));
    assert.equal(browser.reloads, 2, "shown again twice, nothing asked");
    t = openOn(net, local);
    net.file = read.replace("乙段落，写的是中间。", "乙段落，写的是中间（AI）。");
    t.autosave.heard(hashOf(net.file));
    await advance(5000);
    assert.deepEqual([t.reverts.map(({ theirs, mine }) => [theirs, mine]), browser.reloads], [[["甲段落（一）。", "甲段落，写的是开头。"]], 2], JSON.stringify(t.reverts));
    t.autosave.close();
  }

  // What the page committed is kept for its next load in the tab when the page goes away too (pagehide: a
  // reload of the reader's, another document opened in a workbench), not only when it is shown again.
  {
    const local = storage();
    const net = server(SOURCE);
    browser.reloads = 0;
    let t = openOn(net, local);
    t.text("甲段落").textContent = "甲段落，人改的。";
    t.change(true);
    await advance(3000);
    t.autosave.leave();
    t.autosave.close();
    t = openOn(net, local);
    net.file = SOURCE.replace("丙段落，在第二章。", "丙段落，在第二章（AI）。"); // the Agent writes back what it read before
    t.autosave.heard(hashOf(net.file));
    await advance(5000);
    assert.deepEqual([t.reverts.map(({ theirs, mine }) => [theirs, mine]), browser.reloads], [[["甲段落，写的是开头。", "甲段落，人改的。"]], 0], JSON.stringify(t.reverts));
    t.autosave.close();
  }

  // A paragraph the reader made and saved, which the Agent then replaced with a picture, as asked (feedback
  // of 2026-11-17: a card came, "Agent 的写入删掉了你这次新建的这一块", the page held behind it): nothing held,
  // the page shows the file. The page of a later load, which took that block from the journal, lists nothing
  // of it either. Taken out with nothing in its place, it is held, as before.
  {
    const local = storage();
    const t = open(SOURCE, { local });
    const net = t.net;
    const added = newHost(t.document, "paragraph");
    added.textContent = "读者写的占位：这里放截图。";
    t.text("甲段落").after(added);
    t.change(true);
    await advance(3000);
    assert.ok(net.file.includes("读者写的占位：这里放截图。"), net.file);
    const placeholder = /\n\s*<p[^>]*>读者写的占位：这里放截图。<\/p>/;
    net.file = net.file.replace(placeholder, '\n    <p><img src="assets/shot.png" alt="截图"></p>');
    t.autosave.heard(hashOf(net.file));
    await advance(5000);
    assert.deepEqual([t.reverts.map((entry) => entry.mine), browser.reloads], [[], 1], "replaced by a picture: nothing held, the page shows the file");
    t.autosave.close();
    // A later load takes the block from the journal of a load that made it (gone away: the reader's reload,
    // another document opened); the Agent replaces it meanwhile, the last of its section.
    const kept = storage();
    const net2 = server(SOURCE);
    browser.reloads = 0;
    let later = openOn(net2, kept);
    const again = newHost(later.document, "paragraph");
    again.textContent = "第二个占位。";
    later.text("乙段落").after(again);
    later.change(true);
    await advance(3000);
    later.autosave.leave();
    later.autosave.close();
    net2.file = net2.file.replace(/\n\s*<p[^>]*>第二个占位。<\/p>/, '\n    <figure><img src="assets/shot.png"><figcaption>第二张图</figcaption></figure>');
    later = openOn(net2, kept);
    later.autosave.opened(new Set());
    await advance(5000);
    assert.ok(net2.posts.some((post) => post.url.includes("/reverted") && post.body.units?.length === 1), "asked of the block the load before made");
    assert.deepEqual([later.reverts.length, readLost(kept, "demo").map((item) => item.text)], [0, []], "the next load, on the Agent's picture: nothing held, nothing listed");
    later.autosave.close();
    // Taken out with nothing in its place: held for the reader, as before.
    const third = open(SOURCE, { local: storage() });
    const made = newHost(third.document, "paragraph");
    made.textContent = "读者写的第三段。";
    third.text("甲段落").after(made);
    third.change(true);
    await advance(3000);
    third.net.file = third.net.file.replace(/\n\s*<p[^>]*>读者写的第三段。<\/p>/, "");
    third.autosave.heard(hashOf(third.net.file));
    await advance(5000);
    assert.deepEqual([third.reverts.map((entry) => [entry.gone, entry.mine]), browser.reloads], [[[true, "读者写的第三段。"]], 0], "taken out, nothing in its place: held");
    third.autosave.close();
  }

  // The same replacement in two writes far apart (a review, 2026-11-17): the Agent takes the reader's
  // paragraph out (a card, the page held), then puts the picture where it stood. Asked of again, the file no
  // longer puts the paragraph back: the card goes undecided, the page shows the file. Before, a card held was
  // never judged again, the page stayed behind it, and 恢复我的 undid what was asked. A later write that puts
  // nothing in its place leaves the card standing.
  for (const [label, second, lapses] of [["the picture where it stood", (file) => file.replace(/(<p[^>]*>甲段落[^<]*<\/p>)/, '$1\n    <p><img src="assets/shot.png" alt="截图"></p>'), true], ["a change elsewhere", (file) => file.replace("丙段落，在第二章。", "丙段落，Agent 改了。"), false]]) {
    const t = open(SOURCE, { local: storage() });
    const added = newHost(t.document, "paragraph");
    added.textContent = "读者写的占位：这里放截图。";
    t.text("甲段落").after(added);
    t.change(true);
    await advance(3000);
    assert.ok(t.net.file.includes("读者写的占位：这里放截图。"), t.net.file);
    t.net.file = t.net.file.replace(/\n\s*<p[^>]*>读者写的占位：这里放截图。<\/p>/, "");
    t.autosave.heard(hashOf(t.net.file));
    await advance(5000);
    assert.deepEqual([t.reverts.map((entry) => [entry.gone, entry.mine]), browser.reloads], [[[true, "读者写的占位：这里放截图。"]], 0], `${label}: taken out first: a card, the page held`);
    t.net.file = second(t.net.file);
    t.autosave.heard(hashOf(t.net.file));
    await advance(15000); // the second write one of a burst with the first: shown once the file is still
    assert.deepEqual([t.lapsed, browser.reloads], lapses ? [[t.reverts[0].key], 1] : [[], 0], `${label}: ${lapses ? "the card gone, the page shows the file" : "the card stands"}`);
    t.autosave.close();
  }

  // How many revert checks a page asked, what it holds for the reader of them, and what it listed.
  const questions = (net) => net.posts.filter((post) => post.url.includes("/reverted")).length;
  const putBack = (t) => t.reverts.map(({ theirs, mine }) => [theirs, mine]);
  const listedWords = (t) => readLost(t.local, "demo").filter((item) => item.why === "reverted").map((item) => item.text);

  // The page asks of what it committed right before it shows someone else's write, about the file as it
  // is then; an Agent's write of the whole file from what it read before, landing after that answer and
  // before the page shown again is served, is the file that page opens on, which it never hears of as a
  // write (the version it was served). It asks at once (opened) of what the load before it committed, kept
  // with the version that load last knew: the text put back held for the reader, the block that load
  // made and the write took out listed with its words (fuzz seed 4102's timing; the scenario
  // agentRevertAtReload). The same where the page went away (the reader's reload, another document opened,
  // the document opened again in another tab: the journal in localStorage, by tab): opened on another
  // version than the page before last knew, what it kept is asked of at once; on the very version, nothing
  // is asked. A block an earlier load made is asked of as long as the page shows it, in every load after.
  {
    // A load that commits a text and a block it made, then hears of an Agent's write that puts nothing back
    // and is shown again: its server, its storage.
    const shownAgain = async () => {
      const local = storage();
      const net = server(SOURCE);
      browser.reloads = 0;
      const t = openOn(net, local);
      t.text("甲段落").textContent = "甲段落，人改的。";
      const added = newHost(t.document, "paragraph");
      added.textContent = "读者新写的一段";
      t.text("乙段落").after(added);
      t.change(true);
      await advance(3000);
      assert.ok(net.file.includes("甲段落，人改的。") && net.file.includes("读者新写的一段"), net.file);
      net.file = net.file.replace("丙段落，在第二章。", "丙段落，在第二章（AI）。");
      t.autosave.heard(hashOf(net.file));
      await advance(5000);
      assert.deepEqual([t.reverts.length, browser.reloads], [0, 1], "nothing put back: shown again");
      t.autosave.close();
      return { local, net };
    };
    const STALE = SOURCE.replace("丙段落，在第二章。", "丙段落，在第二章（AI 重写）。"); // what the Agent read before the reader's edits, with a change of its own
    {
      // The Agent's write from what it read before the reader's edits lands as the page is shown again.
      const { local, net } = await shownAgain();
      net.file = STALE;
      const t = openOn(net, local);
      t.autosave.opened();
      await advance(5000);
      assert.deepEqual(putBack(t), [["甲段落，写的是开头。", "甲段落，人改的。"]], `the text put back held: ${JSON.stringify(t.reverts)}`);
      assert.ok(listedWords(t).some((text) => text.includes("读者新写的一段")) && t.listed === 1, `the block taken out listed: ${JSON.stringify(readLost(t.local, "demo"))}`);
      assert.deepEqual([browser.reloads, t.autosave.state.held], [1, 1], "the page waits for the reader");
      t.autosave.close();
    }
    {
      // Shown again on the very file it asked of: nothing to ask. Gone away (the reader's reload), the file the
      // same: nothing asked again. Gone away, the Agent's write from what it read before landing meanwhile: the
      // next page asks at once, the text a card, the block the first load made (shown by the second, asked of
      // as long as it is) listed.
      const { local, net } = await shownAgain();
      const asked = questions(net);
      let t = openOn(net, local);
      t.autosave.opened();
      await advance(3000);
      assert.equal(questions(net), asked, "opened on the file asked of: no question");
      t.autosave.leave();
      t.autosave.close();
      t = openOn(net, local);
      t.autosave.opened(new Set());
      await advance(3000);
      assert.deepEqual([questions(net), t.reverts.length, t.listed], [asked, 0, 0], "the reader's reload, the file as that page knew it: no question");
      t.autosave.leave();
      t.autosave.close();
      net.file = STALE; // written back from what the Agent read before, the page gone
      t = openOn(net, local);
      t.autosave.opened(new Set());
      await advance(5000);
      assert.equal(questions(net), asked + 1, "the file another: asked at once");
      assert.deepEqual(putBack(t), [["甲段落，写的是开头。", "甲段落，人改的。"]], `the text put back held: ${JSON.stringify(t.reverts)}`);
      assert.ok(listedWords(t).some((text) => text.includes("读者新写的一段")) && t.listed === 1, `the block two loads back made listed: ${JSON.stringify(readLost(t.local, "demo"))}`);
      assert.deepEqual([browser.reloads, t.autosave.state.held], [1, 1], "the page waits for the reader");
      t.autosave.close();
    }
    {
      // The document opened again in another tab: what a tab still open kept is its own; a tab gone, its
      // departure is taken and asked of.
      const { local, net } = await shownAgain();
      let t = openOn(net, local);
      t.autosave.opened();
      await advance(3000);
      t.autosave.leave();
      t.autosave.close();
      net.file = STALE;
      const asked = questions(net);
      t = openOn(net, local, { tab: "other" });
      t.autosave.opened(new Set(["tab"]));
      await advance(5000);
      assert.deepEqual([questions(net), t.reverts.length], [asked, 0], "the tab that kept it still open: not this page's to ask");
      t.autosave.close();
      t = openOn(net, local, { tab: "third" });
      t.autosave.opened(new Set());
      await advance(5000);
      assert.deepEqual(putBack(t), [["甲段落，写的是开头。", "甲段落，人改的。"]], `that tab gone: asked of in the new one, the text held: ${JSON.stringify(t.reverts)}`);
      assert.ok(listedWords(t).some((text) => text.includes("读者新写的一段")), "and the block listed");
      t.autosave.close();
    }
  }

  // A list the reader made, its item made with it, gone from the file written back while the page was away:
  // listed once, the item's words among the list's (it went with it, as one card decides both on the page).
  {
    const local = storage();
    const net = server(SOURCE);
    browser.reloads = 0;
    let t = openOn(net, local);
    list(t.document, t.section("第一章"), ["读者的条目"]);
    t.change(true);
    await advance(3000);
    assert.ok(net.file.includes("读者的条目"), net.file);
    t.autosave.leave();
    t.autosave.close();
    net.file = SOURCE;
    t = openOn(net, local);
    t.autosave.opened(new Set());
    await advance(5000);
    assert.deepEqual(listedWords(t), ["读者的条目"], `listed once: ${JSON.stringify(readLost(t.local, "demo"))}`);
    t.autosave.close();
  }

  // Two tabs' pages edit one text in turn: the page taking both their journals puts the texts in the order
  // they were committed, not the order it took them (its own tab's first, others' once it knows which are
  // gone) nor the order the pages went away. The reader's latest words, in the file, are no one's revert:
  // nothing held, at its opening nor at an Agent's later write elsewhere.
  {
    const local = storage();
    const net = server(SOURCE);
    browser.reloads = 0;
    const x = openOn(net, local, { tab: "x" });
    x.text("甲段落").textContent = "甲段落B。";
    x.change(true);
    await advance(3000);
    const y = openOn(net, local, { tab: "y" });
    y.text("甲段落").textContent = "甲段落C。";
    y.change(true);
    await advance(3000);
    assert.ok(net.file.includes("甲段落C。"), net.file);
    y.autosave.leave(); // the reader's F5 in tab y, tab x still open
    y.autosave.close();
    await advance(1000);
    const y2 = openOn(net, local, { tab: "y" });
    y2.autosave.opened(new Set(["x"]));
    await advance(3000);
    x.autosave.leave(); // tab x closed, after tab y went away the first time
    x.autosave.close();
    await advance(1000);
    y2.autosave.leave(); // F5 again
    y2.autosave.close();
    const y3 = openOn(net, local, { tab: "y" });
    y3.autosave.opened(new Set());
    await advance(5000);
    assert.deepEqual([putBack(y3), y3.listed], [[], 0], `the reader's latest words: nothing held ${JSON.stringify(y3.reverts)}`);
    net.file = net.file.replace("丙段落，在第二章。", "丙段落（AI 改）。");
    y3.autosave.heard(hashOf(net.file));
    await advance(5000);
    assert.deepEqual(putBack(y3), [], `nor at an Agent's write elsewhere: ${JSON.stringify(y3.reverts)}`);
    y3.autosave.close();
  }

  // A page done with before it heard which tabs are open (a workbench showing it again at once: the
  // page heard a write right after it connected), or going to be shown again, takes no other tab's journal:
  // the page shown next does, and asks of it. One whose write the reader asked for failed takes it then.
  {
    const gone = async () => {
      const local = storage();
      const net = server(SOURCE);
      browser.reloads = 0;
      const x = openOn(net, local, { tab: "x" });
      x.text("甲段落").textContent = "甲段落，人改的。";
      x.change(true);
      await advance(3000);
      x.autosave.leave();
      x.autosave.close(); // tab x closed
      net.file = SOURCE.replace("丙段落，在第二章。", "丙段落，在第二章（AI 重写）。"); // the Agent's write from what it read before
      return { local, net };
    };
    {
      const { local, net } = await gone();
      const y = openOn(net, local, { tab: "y" });
      y.autosave.close(); // the workbench's reloader
      y.autosave.opened(new Set());
      const y2 = openOn(net, local, { tab: "y" });
      y2.autosave.opened(new Set());
      await advance(5000);
      assert.deepEqual(putBack(y2), [["甲段落，写的是开头。", "甲段落，人改的。"]], `closed first: the next page asks ${JSON.stringify(y2.reverts)}`);
      y2.autosave.close();
    }
    {
      const { local, net } = await gone();
      const y = openOn(net, local, { tab: "y" });
      y.autosave.heard(hashOf(net.file + " ")); // a write: shown again by itself, at once
      await advance(100);
      assert.ok(browser.reloads > 0 && y.autosave.state.reloading, "shown again");
      y.autosave.opened(new Set());
      y.autosave.leave(); // pagehide
      y.autosave.close();
      const y2 = openOn(net, local, { tab: "y" });
      y2.autosave.opened(new Set());
      await advance(5000);
      assert.deepEqual(putBack(y2), [["甲段落，写的是开头。", "甲段落，人改的。"]], `going to be shown again: the next page asks ${JSON.stringify(y2.reverts)}`);
      y2.autosave.close();
    }
    {
      const { local, net } = await gone();
      const y = openOn(net, local, { tab: "y" });
      const shown = await y.autosave.showOwn(async () => {
        y.autosave.opened(new Set()); // heard which tabs are open meanwhile
        return false;
      });
      await advance(5000);
      assert.deepEqual([shown, putBack(y)], [false, [["甲段落，写的是开头。", "甲段落，人改的。"]]], `the reader's write failed: asked then ${JSON.stringify(y.reverts)}`);
      y.autosave.close();
    }
  }

  // A block one tab's page made, deleted by the reader in another tab's page that did not take its journal
  // (open before that tab went away): the reader's own deletion. Nothing is listed when a later page takes
  // that journal.
  {
    const local = storage();
    const net = server(SOURCE);
    browser.reloads = 0;
    const x = openOn(net, local, { tab: "x" });
    const added = newHost(x.document, "paragraph");
    added.textContent = "读者新写的一段";
    x.text("乙段落").after(added);
    x.change(true);
    await advance(3000);
    const y = openOn(net, local, { tab: "y" });
    y.autosave.opened(new Set(["x"]));
    await advance(1000);
    x.autosave.leave();
    x.autosave.close(); // tab x closed
    removeUnit(y.text("读者新写的一段"));
    y.change(true);
    await advance(3000);
    assert.ok(!net.file.includes("读者新写的一段"), "deleted");
    y.autosave.leave(); // F5
    y.autosave.close();
    const y2 = openOn(net, local, { tab: "y" });
    y2.autosave.opened(new Set());
    await advance(5000);
    assert.deepEqual([listedWords(y2), y2.listed, y2.reverts.length], [[], 0, 0], `the reader's own deletion: nothing listed ${JSON.stringify(readLost(local, "demo"))}`);
    y2.autosave.close();
  }

  // The reader's own words on their way as the page goes (the crash buffer, the last try), an undo back to
  // what the text was before the reader's saved edit: the next page, opening on the file that try wrote,
  // does not take it for someone else's (the journal takes the unsent text as committed); nothing held.
  {
    const local = storage();
    const net = server(SOURCE);
    browser.reloads = 0;
    let t = openOn(net, local);
    t.text("甲段落").textContent = "甲段落，人改的。";
    t.change(true);
    await advance(3000);
    t.text("甲段落").textContent = "甲段落，写的是开头。"; // undone, not saved yet
    t.change();
    t.autosave.leave(); // the last try goes
    t.autosave.close();
    await advance(100);
    assert.ok(net.file.includes("甲段落，写的是开头。"), "the last try wrote it");
    t = openOn(net, local);
    t.autosave.opened(new Set());
    await advance(5000);
    assert.deepEqual([t.reverts.length, t.listed], [0, 0], `the reader's own undo: nothing held ${JSON.stringify(t.reverts)}`);
    t.autosave.close();
  }

  // A write the reader asked for (撤回 of the Agent's changes: showOwn), the version it wrote told: the page
  // shown again on it asks nothing; an Agent's write landing before that page is served is asked of there.
  {
    const ownWrite = async () => {
      const local = storage();
      const net = server(SOURCE);
      browser.reloads = 0;
      const t = openOn(net, local);
      t.text("甲段落").textContent = "甲段落，人改的。";
      t.change(true);
      await advance(3000);
      const shown = await t.autosave.showOwn(async () => {
        net.file = net.file.replace("丙段落，在第二章。", "丙段落（撤回后）。");
        return hashOf(net.file);
      });
      assert.ok(shown && browser.reloads === 1, "shown again after the reader's write");
      t.autosave.close();
      return { local, net };
    };
    {
      const { local, net } = await ownWrite();
      const asked = questions(net);
      const t = openOn(net, local);
      t.autosave.opened(new Set());
      await advance(3000);
      assert.equal(questions(net), asked, "on the version it wrote: no question");
      t.autosave.close();
    }
    {
      const { local, net } = await ownWrite();
      net.file = SOURCE.replace("丙段落，在第二章。", "丙段落，在第二章（AI 重写）。");
      const t = openOn(net, local);
      t.autosave.opened(new Set());
      await advance(5000);
      assert.deepEqual(putBack(t), [["甲段落，写的是开头。", "甲段落，人改的。"]], `a write landing before the page shown again: asked of, held ${JSON.stringify(t.reverts)}`);
      t.autosave.close();
    }
  }

  // The live-reload channel announces the versions the page's commits wrote, a little later: those
  // are its own. Someone writing the file back to one of them later is someone else's write.
  {
    const t = open();
    t.text("甲段落").textContent = "甲段落（一）。";
    t.change(true);
    await advance(3000);
    const first = hashOf(t.net.file);
    t.text("甲段落").textContent = "甲段落（二）。";
    t.change(true);
    await advance(1000);
    t.autosave.heard(first); // late, for the first commit
    await advance(3000);
    assert.ok(!t.autosave.state.foreign && browser.reloads === 0, "a late word of its own write");
    await advance(10000);
    t.net.file = t.net.file.replace("甲段落（二）。", "甲段落（一）。"); // someone puts the first one back
    t.autosave.heard(hashOf(t.net.file));
    await advance(3000);
    // What the page committed as it was between, held for the reader before the page shows it.
    assert.ok(t.autosave.state.foreign && browser.reloads === 0 && t.reverts.length === 1 && t.reverts[0].theirs === "甲段落（一）。", "written back to an old version of its own: someone else's write, which put the second back");
    await t.autosave.decide(t.reverts[0].key, false);
    await advance(3000);
    assert.equal(browser.reloads, 1, "the file kept, the page shows it");
  }

  // What holds off the page's being shown again for someone else's write (仍然调整 just written over theirs,
  // its undo the reader's to take: editor.mjs keepsOverwrite) does not hold off a showing the page asks for
  // itself (保留 Agent 的, a package changed: reloadSoon), which the reader's writes would wait behind unsaved.
  {
    const t = open(SOURCE, { holding: (asked) => !asked });
    t.autosave.heard("someone-else");
    await advance(10000);
    assert.equal(browser.reloads, 0, "someone else's write: held off");
    t.autosave.reloadSoon();
    await advance(3000);
    assert.equal(browser.reloads, 1, "asked for by the page: shown");
  }

  // Asked again with nothing changed, the page's changes are not looked for again (collect gives the
  // answer it gave), the crash buffer is not written again and a flush builds nothing: a page that is
  // left asked three to five times in a row, each a pass over every block. Whatever changes since is
  // looked for anew: a word typed (stored as the page goes, counted or not), an answer taken in, a
  // decision on a conflict.
  {
    const t = open();
    const host = t.text("甲段落");
    host.textContent = "甲段落（一）。";
    t.change(true);
    await advance(3000);
    assert.ok(t.net.file.includes("甲段落（一）。") && t.autosave.state.waiting === 0);
    const collected = t.commits.collect();
    assert.equal(t.commits.collect(), collected, "nothing changed: the answer it gave");
    let writes = 0; // of the crash buffer (what the page committed goes to its journal as it goes, besides)
    const set = t.local.set.bind(t.local);
    t.local.set = (key, value) => (writes += key.endsWith(":journal") ? 0 : 1, set(key, value));
    let builds = 0;
    const build = t.commits.build;
    t.commits.build = (options) => (builds += 1, build(options));
    // As a page that is left does: the last keystrokes counted, a flush, the buffer; then pagehide.
    t.change();
    assert.equal(await t.autosave.flush(), "nothing");
    t.autosave.store();
    t.autosave.leave();
    assert.deepEqual({ writes, builds, posts: t.net.posts.length }, { writes: 0, builds: 0, posts: 1 }, "nothing stored, built or sent again");
    host.textContent = "甲段落（离开前）。"; // typed as the page goes, not counted yet
    assert.notEqual(t.commits.collect(), collected, "a word typed: looked for anew");
    t.autosave.leave();
    assert.ok(writes > 0 && t.buffer()?.request?.texts?.[0]?.parts[0].html === "甲段落（离开前）。", "stored as the page goes");
    t.change();
    await advance(3000);
    assert.ok(t.net.file.includes("甲段落（离开前）。") && t.buffer() === null && builds > 0, "and committed: the buffer goes");
    const after = t.commits.collect();
    t.commits.resolve("b0", "forget"); // a decision on a conflict: what is held back, the baselines
    assert.notEqual(t.commits.collect(), after, "a decision: looked for anew");
  }

  // ---------- what a page left ----------
  const left = (build) => {
    const t = open();
    build(t);
    return t.commits.build().request;
  };
  const leave = (local, entry) => local.set(pendingKey("demo", "gone"), JSON.stringify({ v: 2, time: 1, sent: null, request: null, keep: [], ...entry }));
  const map = { slug: "demo", version: hashOf(SOURCE), token: "token" };

  // The server busy (or failing): the buffer stays for the next page.
  {
    const local = storage();
    leave(local, { request: left((t) => { t.text("甲段落").textContent = "甲段落（留下的）。"; }) });
    browser.route = server(SOURCE);
    browser.route.mode = "busy";
    const result = await recover({ map, storage: local, keys: [pendingKey("demo", "gone")] });
    assert.ok(!result.sent && local.get(pendingKey("demo", "gone")) !== null && readLost(local, "demo").length === 0, JSON.stringify(result));
  }

  // A block the file no longer has a place for, and a text both changed: listed (lostKey), with the
  // reader's words, before the buffer goes; what the file took is in.
  {
    const t = open();
    for (const words of ["甲段落", "乙段落", "丙段落"]) t.text(words).textContent = `${words}（一）。`; // the blocks get their ids
    t.change(true);
    await advance(3000);
    list(t.document, t.section("第二章"), ["留下的新列表"]);
    t.text("甲段落").textContent = "甲段落（留下的）。";
    t.text("乙段落").textContent = "乙段落（读者）。";
    const local = storage();
    leave(local, { request: { ...t.commits.build().request, known: null }, keep: [{ why: "draft", text: "没写完的折叠块" }] });
    const file = t.net.file;
    browser.route = server(SOURCE);
    browser.route.file = file.replace("乙段落（一）。", "乙段落（AI）。").replace(SECTION_B, "");
    const result = await recover({ map, storage: local, keys: [pendingKey("demo", "gone")] });
    assert.ok(result.sent && browser.route.file.includes("甲段落（留下的）。"), JSON.stringify(readLost(local, "demo")));
    const lost = readLost(local, "demo");
    assert.deepEqual(lost.map((item) => item.why).sort(), ["changed", "draft", "insert"]);
    assert.ok(lost.some((item) => item.html?.includes("留下的新列表")) && lost.some((item) => item.html?.includes("（读者）")));
    assert.equal(local.get(pendingKey("demo", "gone")), null, "then the buffer goes");
    assert.equal(local.get(lostKey("demo")) !== null, true);
  }

  // A commit whose answer never came, and the reader went on: the first goes again as it went, the
  // rest goes on from what it wrote. A text changed since goes in; so does what was written since in
  // a block it made (an edit of that block), and that block moved since moves. Blocks added into
  // one it made have no start the file knows: listed.
  {
    const t = open();
    const focus = sectionAfter(t.section("第一章")).focus;
    focus.textContent = "新段落A";
    const host = t.text("甲段落");
    host.textContent = "甲段落X。";
    const box = list(t.document, t.section("第二章"), ["新项"]);
    const sent = { ...t.commits.build().request, known: null };
    focus.textContent = "新段落A，又写了B";
    host.textContent = "甲段落XY。";
    t.section("第二章").querySelector(":scope > p").before(box);
    const request = { ...t.commits.build().request, known: null };
    for (const written of [true, false]) {
      const local = storage();
      leave(local, { sent, request });
      browser.route = server(SOURCE);
      if (written) browser.route.file = commitEdits({ current: SOURCE, ...sent, opening: SOURCE, seal }).text;
      const result = await recover({ map, storage: local, keys: [pendingKey("demo", "gone")] });
      assert.ok(result.sent, JSON.stringify(result));
      const file = browser.route.file;
      assert.ok(file.includes("甲段落XY。"), `${written}: the text written since goes in`);
      assert.ok(file.includes(">新段落A，又写了B</p>"), `${written}: and what was written since in the block it made: ${file}`);
      assert.ok(file.indexOf(">新项</li>") < file.indexOf("丙段落"), `${written}: the list it made, moved since, moved`);
      assert.deepEqual(readLost(local, "demo"), [], `${written}: nothing listed`);
    }
    focus.after(focus.cloneNode(false));
    focus.nextSibling.textContent = "后加的一段";
    const more = { ...t.commits.build().request, known: null };
    const local = storage();
    leave(local, { sent, request: more });
    browser.route = server(SOURCE);
    await recover({ map, storage: local, keys: [pendingKey("demo", "gone")] });
    const lost = readLost(local, "demo");
    assert.ok(lost.length === 1 && lost[0].why === "rebase" && lost[0].html.includes("后加的一段"), `a block added into one it made: listed: ${JSON.stringify(lost)}`);
  }

  // A page going away with a commit whose answer it never learned keeps what it knew, and itself:
  // the next page takes that up, takes in the answer and finds the rest as the page would have
  // (recover: rehydrate). Blocks added into a section that commit made, and blocks put in another
  // order, which rebase could only list, go in as they stand; nothing is listed.
  {
    const t = open();
    const focus = sectionAfter(t.section("第一章")).focus;
    focus.textContent = "新段落A";
    t.net.mode = "lose";
    t.change(true);
    await advance();
    assert.ok(t.net.file.includes("新段落A") && t.autosave.state.offline, "written, the answer lost");
    const added = newHost(t.document, "paragraph");
    added.textContent = "后加的一段";
    focus.after(added);
    const second = t.section("第二章");
    second.append(list(t.document, second, ["新项"]));
    second.querySelector(":scope > p").before(second.querySelector(":scope > ul"));
    t.change(true);
    t.autosave.leave();
    t.autosave.close();
    assert.ok(t.local.get(stateKey("demo", "tab")), "what the page knew is kept with the buffer");
    t.net.mode = "deliver";
    const result = await recover({ map, storage: t.local, keys: [pendingKey("demo", "tab")] });
    const file = t.net.file;
    assert.ok(result.sent && result.lost === 0, JSON.stringify(result));
    assert.ok(/>新段落A<\/p>\s*<p[^>]*>后加的一段<\/p>\s*<\/section>/.test(file), `the block added into the section the lost commit made goes in it: ${file}`);
    assert.ok(file.indexOf(">新项</li>") < file.indexOf("丙段落"), "the list put before the paragraph");
    assert.deepEqual(readLost(t.local, "demo"), [], "nothing listed");
    assert.ok(t.local.get(pendingKey("demo", "tab")) === null && t.local.get(stateKey("demo", "tab")) === null, "and nothing left");
  }

  // The same page left as a browser leaves it: pagehide (the last keystrokes counted, leave()), then
  // visibilitychange (counted again, and a flush that sends that commit again, its answer not come
  // when the page is gone). What pagehide kept is still kept with the buffer, and the next page takes
  // it up: it once fell back to rebuilding on the answer, which could only list the block added.
  {
    const t = open();
    const focus = sectionAfter(t.section("第一章")).focus;
    focus.textContent = "新段落A";
    t.net.mode = "lose";
    t.change(true);
    await advance();
    const added = newHost(t.document, "paragraph");
    added.textContent = "后加的一段";
    focus.after(added);
    t.net.gate = new Promise(() => {}); // what is sent from now on is never answered
    t.change();
    t.autosave.leave();
    t.change();
    t.autosave.flush();
    await advance();
    t.autosave.close();
    assert.ok(t.local.get(stateKey("demo", "tab")), "what the page knew is still kept after the flush as it goes");
    t.net.gate = null;
    const result = await recover({ map, storage: t.local, keys: [pendingKey("demo", "tab")] });
    assert.ok(result.sent && result.lost === 0 && /<p[^>]*>新段落A<\/p>\s*<p[^>]*>后加的一段<\/p>/.test(t.net.file), `the block added goes in: ${JSON.stringify(readLost(t.local, "demo"))}`);
  }

  // What the commits know goes as JSON and comes back: Maps, Sets, the elements it names (on the page
  // and off it, in the tree they were in), each with its identity.
  {
    const t = open();
    const gone = t.text("乙段落");
    gone.remove();
    const packed = JSON.parse(JSON.stringify(pack(t.document, { on: t.text("甲段落"), off: gone, map: new Map([[1, new Set(["a"])]]), doc: t.document })));
    const { document, value } = unpack(packed, (html) => new DOMParser().parseFromString(html, "text/html"));
    assert.ok(value.on.isConnected && value.on.textContent.includes("甲段落") && value.on.getAttribute(ELEMENT_ID) === t.text("甲段落").getAttribute(ELEMENT_ID));
    assert.ok(!value.off.isConnected && value.off.textContent.includes("乙段落") && value.off.getAttribute(ELEMENT_ID) === gone.getAttribute(ELEMENT_ID));
    assert.ok(value.map.get(1).has("a") && value.doc === document && !document.querySelector("[data-ge-ref]"));
  }

  // What a page of an earlier Gallery kept, its commits holding the reader's words to make a change anyway
  // and what they gave up as sets: taken up all the same (no such word, all of what was given up), and
  // what followed the commit on its way goes.
  {
    const t = open();
    t.text("甲段落").textContent = "甲段落（在途）。";
    t.net.mode = "lose";
    t.change(true);
    await advance();
    t.section("第二章").append(t.text("乙段落"));
    t.change(true);
    t.autosave.leave();
    t.autosave.close();
    const kept = JSON.parse(t.local.get(stateKey("demo", "tab")));
    const asSets = (node) => {
      for (const [name, value] of Object.entries(node ?? {})) {
        if (["forced", "discarded"].includes(name) && value?.$map) node[name] = { $set: [] };
        else if (value && typeof value === "object") asSets(value);
      }
    };
    asSets(kept);
    t.local.set(stateKey("demo", "tab"), JSON.stringify(kept));
    t.net.mode = "deliver";
    const result = await recover({ map, storage: t.local, keys: [pendingKey("demo", "tab")] });
    assert.ok(result.sent && result.lost === 0 && t.net.file.includes("甲段落（在途）。") && /第二章[\s\S]*丙段落[\s\S]*乙段落/.test(t.net.file), `${JSON.stringify(result)} ${t.net.file}`);
  }

  // A chip's source (an inline formula's TeX) is known only to the page that made it: it goes with
  // what is kept, so that the next page writes the chip back as it was, never as what it shows (a
  // reload with the formula editor open on TeX that does not read once wrote 无效的公式 into the text).
  {
    const t = open();
    const source = `<span class="doc-math-inline">\\(\\frac{\\)</span>`;
    const chip = newAtom(t.document, source, [t.document.createTextNode("无效的公式")]);
    t.text("甲段落").append(chip);
    const key = chip.getAttribute("data-ge-atom");
    const packed = JSON.stringify(pack(t.document, { on: t.text("甲段落") })).replaceAll(key, "gone-page-0"); // as another page's
    const { value } = unpack(JSON.parse(packed), (html) => new DOMParser().parseFromString(html, "text/html"));
    const back = value.on.querySelector("[data-ge-atom]");
    assert.equal(atomSource(back), source, "the chip's source comes with it");
    assert.ok(serializeInner(value.on).includes(source) && !serializeInner(value.on).includes("无效的公式"), serializeInner(value.on));
  }

  // Leaving: the very commit the buffer holds goes (keepalive, its answer never read); the next page
  // sends it again and gets that answer: written once, nothing listed.
  {
    const t = open();
    t.text("丙段落").textContent = "丙段落（离开时）。";
    t.change();
    t.autosave.leave();
    await advance();
    const left = t.buffer();
    assert.ok(left?.request?.request && t.net.posts.length === 1 && t.net.posts[0].body.request === left.request.request, "the buffer's commit, by its id");
    assert.ok(t.net.file.includes("丙段落（离开时）。"));
    const written = t.net.file;
    const result = await recover({ map, storage: t.local, keys: [pendingKey("demo", "tab")] });
    assert.ok(result.sent && result.lost === 0 && t.net.file === written && t.local.get(pendingKey("demo", "tab")) === null, JSON.stringify(result));
  }

  // A buffer of a format this page does not know (an old one, or a damaged one) is not sent: its text is
  // listed for the reader to copy, and it goes.
  {
    const local = storage();
    const unknown = JSON.stringify({ v: 1, time: 1, request: left((t) => { t.text("丙段落").textContent = "丙段落（旧缓冲）。"; }) });
    local.set(pendingKey("demo", "old"), unknown);
    browser.route = server(SOURCE);
    const result = await recover({ map, storage: local, keys: [pendingKey("demo", "old")] });
    assert.ok(!result.sent && result.lost === 1 && !browser.route.file.includes("丙段落（旧缓冲）。") && local.get(pendingKey("demo", "old")) === null, JSON.stringify(result));
    assert.ok(readLost(local, "demo").some((item) => item.why === "unreadable" && item.text.includes("丙段落（旧缓冲）。")), "listed with its words");
  }
} finally {
  stop();
}

console.log("Checked autosave: a commit whose answer is lost or busy sent again as it went, its id too (no words lost, no conflict with oneself, its answer given again so no write taken for someone else's), the buffer keeping what is on its way and leaving sending nothing more while it is, and otherwise the very commit the buffer holds, a block the file refuses and a block not finished yet holding off the reload and kept in the buffer, the reload check asking again after its wait, versions of its own only for a while, a buffer that cannot be written said, the page asked again with nothing changed looking for nothing again (the same answer, no buffer written, nothing built or sent) and for what changed since anew (a word typed as it goes stored, an answer, a decision), and what a page left: kept while the server is busy, what the file does not take listed before the buffer goes, a commit never answered sent first and the rest going on from it (texts, blocks it made written on or moved; found again exactly from what the page knew when it went, kept through the flush that follows pagehide, blocks added into one it made and put in another order too), what the commits know as JSON and back (what a page of an earlier Gallery kept as sets taken up too), a chip's source with it, the buffer of a page that left answered from its own commit, a buffer of a format it does not know listed instead of sent.");
