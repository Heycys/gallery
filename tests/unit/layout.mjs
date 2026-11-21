import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { layoutNotes } from "../../src/render/layout-notes.mjs";
import { holdRanges, holdRuns, startSpacing, tieClosing, untie } from "../../src/render/kit/runtime/spacing.js";
import { holdsLongRun, longRuns } from "../../src/shared/long-runs.mjs";

// Layout notes (src/render/layout-notes.mjs): body text straight in the page is legal, and gets no
// note, whether it is the whole report, a preface or an epilogue, or a run between sections that
// starts with a heading of its own. Only a run between two sections without a heading of its own
// reads like text the section above was meant to hold.

const page = (body) => `<!doctype html><html><body><main class="doc-page"><header class="doc-header"><h1 class="doc-title">t</h1></header>${body}</main></body></html>`;
const section = (title, text = "正文") => `<section class="doc-section"><h2>${title}</h2><p>${text}</p></section>`;

assert.deepEqual(layoutNotes(page("<p>只有正文。</p><h2>一</h2><p>正文。</p>")), [], "a flat report");
assert.deepEqual(layoutNotes(page(`<p>前言。</p>${section("一")}${section("二")}<p>后记。</p>`)), [], "a preface and an epilogue");
assert.deepEqual(layoutNotes(page(`${section("一")}<h2>插曲</h2><p>正文。</p>${section("二")}`)), [], "a run with a heading of its own");
const notes = layoutNotes(page(`${section("第一章")}<p>漏在外面的一段。</p><figure class="doc-figure"></figure>${section("第二章")}`));
assert.equal(notes.length, 1);
assert.match(notes[0], /^2 blocks of body text right after the section "第一章" stand outside it/);
// Which blocks: the first one's line, its tag and its first words (found testing the skill with Agents, 2026-11-06).
assert.ok(notes[0].includes(`stand outside it (line 1), the first a <p> "漏在外面的一段。", between two sections`), notes[0]);
const one = layoutNotes(page(`${section("一")}\n<p>${"很长的一段正文".repeat(6)}</p>\n${section("二")}`))[0] ?? "";
assert.ok(one.startsWith(`1 block of body text right after the section "一" stand outside it (line 2), the <p> "${"很长的一段正文".repeat(6).slice(0, 30)}…", between`), one);
const sheets = `<section class="doc-sheet-shell" data-doc-sheets><div data-doc-sheet="a">${section("甲")}<p>漏了。</p>${section("乙")}</div></section>`;
assert.equal(layoutNotes(page(sheets)).length, 1, "in a Sheet panel too");

// Body text given a width of its own breaks its lines early: a note. Widgets styling text of their
// own, and widths that narrow nothing, get none.
const styled = (css, body = "<p>正文。</p>") => layoutNotes(page(body).replace("<body>", `<body><style>${css}</style>`));
assert.match(layoutNotes(page(`<p style="max-width: 36em">窄的一段。</p>`))[0] ?? "", /^body text given a width of its own \(<p> with style="max-width: 36em"\)/, "a paragraph's own max-width");
assert.equal(styled(".doc-page p { max-width: 72ch; }").length, 1, "a rule for the page's paragraphs");
assert.equal(styled(".doc-panel, .doc-note { width: 640px }").length, 1, "a rule for a kit text group");
assert.deepEqual(styled(".my-widget p { max-width: 240px; } #card h3 { width: 50% }"), [], "a widget's own text");
assert.deepEqual(styled("p { max-width: none; } li { width: 100% !important; }"), [], "widths that narrow nothing");
assert.deepEqual(layoutNotes(page(`<p style="color: red">红字。</p>`)), [], "other styles");

// A closing punctuation mark right after an inline formula is held on the formula's line
// (runtime/spacing.js tieClosing, .doc-math-tie in styles/math.css): the formula, or the wrapper
// it ends, and the marks right after it in one span; the words after them, and every other text,
// stay where they were.
{
  const { document } = new JSDOM(String.raw`<p id="a">设 <span class="doc-math-inline">\(x\)</span>）。其中</p><p id="b"><strong>记作 <span class="doc-math-inline">\(y\)</span></strong>，下同</p><p id="c"><span class="doc-math-inline">\(z\)</span> 为整数</p>`).window;
  const [a, b, c] = ["a", "b", "c"].map((id) => document.getElementById(id));
  const before = [a, b, c].map((p) => p.textContent);
  const written = [a, b, c].map((p) => p.innerHTML);
  const tie = tieClosing(a.querySelector(".doc-math-inline"));
  assert.equal(tie?.className, "doc-math-tie");
  // A word joiner before the marks (an empty span drawing one: styles/math.css): no line breaks
  // before it, whatever the white-space of the wrapper the formula ends (Chrome breaks after a bold
  // formula by the bold's, before ；：–).
  assert.deepEqual([...tie.childNodes].map((node) => node.nodeType === 3 ? node.data : node.className), ["doc-math-inline", "doc-math-joiner", "）。"], "the formula, a word joiner and both marks");
  assert.equal(tie.nextSibling.data, "其中");
  assert.equal(tieClosing(a.querySelector(".doc-math-inline")), null, "held once");
  const bold = tieClosing(b.querySelector(".doc-math-inline"));
  assert.deepEqual([bold?.firstChild.tagName, bold?.firstChild.nextSibling.className], ["STRONG", "doc-math-joiner"], "the bold the formula ends, the joiner after it");
  assert.equal(tieClosing(c.querySelector(".doc-math-inline")), null, "no mark after it");
  assert.deepEqual([a, b, c].map((p) => p.textContent), before, "no text changed");
  // An export of the current view lets the spans go (untie, math.js's dehydrate): each paragraph as written.
  for (const tie of document.querySelectorAll(".doc-math-tie")) untie(tie);
  assert.deepEqual([a, b, c].map((p) => p.innerHTML), written, "untied, as written");
  assert.equal(a.childNodes.length, 3, "the marks' text one with the words after them again");
}
// The marks are Latin ones too, and the rest of a range a formula begins (ρ≈3–5); a formula drawn
// (KaTeX's boxes) may wrap only between its boxes, where a span that wraps holds a zero-width space,
// never after the last (Chrome breaks after an inline-block by its parent's white-space); untied, the
// breaks go with the span.
{
  const box = (text) => `<span class="katex-base">${text}</span>`;
  const { document } = new JSDOM(`<p id="a">取 <span class="doc-math-inline"><span class="katex"><span class="katex-html">${box("ρ")}${box("≈")}${box("3")}</span></span></span>–5）或 KL</p><p id="b">let <span class="doc-math-inline">\\(x\\)</span>, then</p>`).window;
  const [a, b] = ["a", "b"].map((id) => document.getElementById(id));
  const written = [a, b].map((p) => p.innerHTML);
  const tie = tieClosing(a.querySelector(".doc-math-inline"));
  assert.equal(tie.lastChild.data, "–5）", "the range's end and the mark after it");
  assert.equal(tie.nextSibling.data, "或 KL");
  const html = a.querySelector(".katex-html");
  assert.deepEqual([...html.children].map((node) => node.className), ["katex-base", "doc-math-break", "katex-base", "doc-math-break", "katex-base"], "a break between each two boxes, none after the last");
  assert.equal(tieClosing(b.querySelector(".doc-math-inline"))?.lastChild.data, ",", "a Latin comma");
  for (const held of document.querySelectorAll(".doc-math-tie")) untie(held);
  assert.deepEqual([a, b].map((p) => p.innerHTML), written, "untied, as written: no breaks left");
}
// A number range is one word (holdRanges): 3–13, 1–3B, 22.8%–23.7%, 100M–400M, 3 ～ 5 held in a
// span each; a date, a version and a word with a hyphen are none, and code and a formula not drawn
// yet (its text with its delimiters, which a span would part) are left alone; let go, the text is
// as written.
{
  const { document } = new JSDOM(`<p id="a">区间 3–13、6–16，验证在 1–3B 规模，占 22.8%–23.7%，约 100M–400M 参数，3 ～ 5 次</p><p id="b">2026-10-22 v1.2-beta LoRA-DPO</p>`).window;
  const [a, b] = ["a", "b"].map((id) => document.getElementById(id));
  const written = [a, b].map((p) => p.innerHTML);
  const held = holdRanges(a.firstChild);
  assert.deepEqual(held.map((span) => span.textContent), ["3–13", "6–16", "1–3B", "22.8%–23.7%", "100M–400M", "3 ～ 5"]);
  assert.ok(held.every((span) => span.className === "doc-range"));
  assert.equal(a.textContent, "区间 3–13、6–16，验证在 1–3B 规模，占 22.8%–23.7%，约 100M–400M 参数，3 ～ 5 次", "no text changed");
  assert.deepEqual(holdRanges(b.firstChild), [], "a date, a version, a hyphen");
  for (const span of document.querySelectorAll(".doc-range")) untie(span);
  assert.deepEqual([a, b].map((p) => p.innerHTML), written, "let go, as written");
  // As the page renders: in the report's text (its main), not in code or a formula's text, nor in
  // the page's title, a menu's options or text outside the report. Text a script writes later is
  // the script's (it may write to the same node again): a text node it puts in stays whole, the
  // title it sets too; an element it adds to the report is held.
  const reading = new JSDOM(`<!doctype html><html><head><title>测试 3–5</title></head><body><main><p>公式 \\(1–3\\) 与 <code>1–3</code>，区间 3–13</p><p id="b">原有</p><select><option>2–4 项</option></select></main><p>页外 6–8 项</p></body></html>`).window;
  const page = reading.document;
  globalThis.MutationObserver = reading.MutationObserver; // what the kit's runtime finds in a page
  startSpacing(page);
  if (page.readyState === "loading") await new Promise((resolve) => page.addEventListener("DOMContentLoaded", resolve, { once: true }));
  assert.deepEqual([...page.querySelectorAll(".doc-range")].map((span) => span.textContent), ["3–13"], "as the page renders: the document's text alone, not code, a formula's text, the title, an option or text outside the report");
  const owned = page.getElementById("b");
  owned.textContent = "更新为 7–9 项";
  page.title = "边界测试 3–5";
  const added = page.createElement("p");
  added.innerHTML = "新加 10–12 项";
  page.querySelector("main").append(added);
  await new Promise((resolve) => setTimeout(resolve, 0)); // the observer's records
  owned.firstChild.data = "再更新";
  assert.deepEqual([owned.innerHTML, page.title, page.querySelector("title").children.length], ["再更新", "边界测试 3–5", 0], "a script's text node and the title it sets left whole");
  assert.deepEqual([...added.querySelectorAll(".doc-range")].map((span) => span.textContent), ["10–12"], "an element added to the report held");
}
// A long run (src/shared/long-runs.mjs): more than 20 characters with no place to break inside it,
// counted by its pieces where Chrome breaks inside one (after a hyphen or a question mark); a run
// stands between spaces, Chinese characters and the general punctuation (curly quotes, dashes).
{
  const path = String.raw`D:\work\SampleRepo\SampleRepo-Demo.html`;
  const runs = (text) => longRuns(text).map(({ index, length }) => text.slice(index, index + length));
  assert.deepEqual(runs(`例如“${path}”这个`), [path], "a path between Chinese quotes, long by its first piece");
  assert.deepEqual(runs("internationalization 和 state-of-the-art-of-the-very-long-words"), [], "an ordinary word (20 letters), and a run whose pieces are short");
  assert.deepEqual(runs("见 internationalizations 与 https://github.com/heycys/gallery 页面"), ["internationalizations", "https://github.com/heycys/gallery"], "21 letters, and a URL (no break at a slash)");
  assert.deepEqual(runs("data_2020–2024_final_report_v2.csv"), ["2024_final_report_v2.csv"], "a dash parts two runs");
  assert.equal(holdsLongRun("短 short words only, 3–13"), false);
  assert.equal(holdsLongRun(`见${path}`), true);
}
// Held as the page renders (holdRuns): each long run in a span that breaks anywhere, an ordinary word
// not; inline code holding one held whole (the span around it), not in a table's cell, nor code in a
// code block, a text the page editor edits or an instance's own region; added later, held; let go
// (untie), the text as written.
{
  const path = String.raw`D:\work\SampleRepo\SampleRepoDemoWorkspace\Report.html`;
  const { document } = new JSDOM(`<p id="a">见 ${path} 和 https://example.com/a/very/long/address 两处</p>`).window;
  const a = document.getElementById("a");
  const written = a.innerHTML;
  assert.deepEqual(holdRuns(a.firstChild).map((span) => span.textContent), [path, "https://example.com/a/very/long/address"]);
  assert.ok([...a.querySelectorAll("span")].every((span) => span.className === "doc-long-run"));
  assert.equal(a.textContent, `见 ${path} 和 https://example.com/a/very/long/address 两处`, "no text changed");
  for (const span of a.querySelectorAll(".doc-long-run")) untie(span);
  assert.equal(a.innerHTML, written, "let go, as written");
  const reading = new JSDOM(`<!doctype html><html><body><main>
    <p id="text">普通单词 internationalization 留在一行，路径 ${path} 可以断开</p>
    <p id="code">见 <code>${path}</code> 与 <code>npm run dev</code></p>
    <table><tbody><tr><td id="cell">见 <code>${path}</code> 和 ${path}</td></tr></tbody></table>
    <div class="doc-code"><pre><code>${path}</code></pre></div>
    <p id="edited" contenteditable="true">${path}</p>
    <div class="board" data-doc-component="local/board"><p id="own">${path}</p></div>
  </main><p id="outside">${path}</p></body></html>`).window;
  const doc = reading.document;
  globalThis.MutationObserver = reading.MutationObserver;
  startSpacing(doc);
  if (doc.readyState === "loading") await new Promise((resolve) => doc.addEventListener("DOMContentLoaded", resolve, { once: true }));
  const held = (id) => [...doc.getElementById(id).querySelectorAll(".doc-long-run")].map((span) => span.innerHTML);
  assert.deepEqual(held("text"), [path], "the path held, the ordinary word not");
  assert.deepEqual(held("code"), [`<code>${path}</code>`], "a piece of code holding one held whole, short code not");
  assert.deepEqual(held("cell"), [path], "in a cell its text, not its code");
  assert.equal(doc.querySelector(".doc-code .doc-long-run"), null, "nothing in a code block");
  assert.deepEqual([held("edited"), held("own"), held("outside")], [[], [], []], "nor in text the page editor edits, an instance's own region or text outside the report");
  const added = doc.createElement("p");
  added.innerHTML = `新加 <a href="#">${path}</a>`;
  doc.querySelector("main").append(added);
  await new Promise((resolve) => setTimeout(resolve, 0)); // the observer's records
  assert.deepEqual([...added.querySelectorAll("a > .doc-long-run")].map((span) => span.textContent), [path], "an element added to the report held");
  for (const span of doc.querySelectorAll(".doc-long-run")) untie(span);
  assert.equal(doc.getElementById("code").innerHTML, `见 <code>${path}</code> 与 <code>npm run dev</code>`, "let go, the code where it stood");
}

console.log("Checked layout notes: none for body text standing in the page (a flat report, a preface, an epilogue, a run with its own heading), one for body text between two sections without a heading of its own, in the page and in Sheet panels, and one for body text given a width of its own (inline or by a rule for body text; not a widget's own text, not widths that narrow nothing); a formula held on one line with the closing marks after it (Latin ones, the end of a range it begins), a word joiner before them, its drawing wrapping only between its boxes, and let go again as written; number ranges held as one word in the document's text (not dates, versions, code, a formula's text, the title, an option or a text node a script puts in), and let go as written; long runs (more than 20 characters, by their pieces) held in spans that break anywhere, an ordinary word not, a piece of code holding one held whole but in a cell, none in a code block, edited text, an instance or outside the report, and let go as written.");
