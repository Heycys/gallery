import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { changedRows, draftedParts, draftProblem, tooLong, wholeProblem } from "../../src/editor/components/data-parts.mjs";
import { DATA_MOST } from "../../src/shared/components/installed.mjs";
import { rowMarkup, tableMarkup, writeDatabase, readDatabase, readElement, layoutOf } from "../../src/shared/database.mjs";

// What a component's drawing writes to a block's data parts, as the page takes it (src/editor/components/
// data-parts.mjs; docs/editor.md "A component writes back"): a part known to pass whose draft changed rows of
// its table alone is checked in those rows, read back where they stand, and refuses exactly what the check of
// the whole part refuses (a handler, an address of code, the editor's marks, a block's identity, a script, a
// frame, markup that does not read back as itself); a change anywhere else in it is checked whole; the bytes
// of a database's write are its two parts together, as the server counts them; and what goes onto the page is
// the rows that changed, the rest of the part as it was.

const { window } = new JSDOM("<!doctype html><body></body>");
const { document } = window;
globalThis.document ??= document;

// A database's table of `count` records, laid out as the kit writes one.
const rowOf = (at) => `<tr><td>任务 ${at}</td><td>${["待开始", "进行中", "已完成"][at % 3]}</td><td>${at % 40}</td><td>${at % 5 ? "" : "✓"}</td></tr>`;
const tableInner = (count) => `\n<thead><tr><th data-column="t">任务</th><th data-column="s">状态</th><th data-column="n">估时</th><th data-column="c">验收</th></tr></thead>\n<tbody>${Array.from({ length: count }, (_, at) => `\n${rowOf(at)}`).join("")}\n</tbody>\n`;
function database(count = 40) {
  const host = document.createElement("div");
  host.className = "doc-database";
  host.innerHTML = `\n<script type="application/json">{"columns":[{"id":"t","name":"任务","type":"title"}],"views":[]}</script>\n<table>${tableInner(count)}</table>\n`;
  document.body.append(host);
  return { host, script: host.querySelector(":scope > script"), table: host.querySelector(":scope > table") };
}
// A row's markup parsed where a row stands.
const rowFrom = (html) => {
  const holder = document.createElement("tbody");
  holder.innerHTML = html;
  return holder.firstElementChild;
};
const body = (table) => table.tBodies[0];

// What the console said while `run` ran.
function said(run) {
  const real = console.error;
  const lines = [];
  console.error = (...words) => lines.push(words.join(" "));
  try {
    return { value: run(), lines };
  } finally {
    console.error = real;
  }
}

// ---------- the rows' check refuses what the whole check refuses ----------
{
  const { table } = database();
  // Each a change of rows alone, made on a draft of the table: [what, change(draft)].
  const bad = [
    ["a handler", (draft) => body(draft).rows[3].replaceWith(rowFrom('<tr><td onclick="alert(1)">a</td></tr>'))],
    ["a handler in upper case", (draft) => body(draft).rows[3].replaceWith(rowFrom('<tr><td ONMOUSEOVER="x()">a</td></tr>'))],
    ["an address of code", (draft) => body(draft).rows[5].replaceWith(rowFrom('<tr><td><a href="javascript:alert(1)">x</a></td></tr>'))],
    ["an address of code, spaced and in another case", (draft) => body(draft).rows[5].replaceWith(rowFrom('<tr><td title=" JavaScript:alert(1)">x</td></tr>'))],
    ["vbscript", (draft) => body(draft).rows[5].replaceWith(rowFrom('<tr><td data-x="vbscript:msgbox">x</td></tr>'))],
    ["the editor's marks", (draft) => body(draft).rows[7].replaceWith(rowFrom('<tr><td data-ge-unit="3">a</td></tr>'))],
    ["the marks of before", (draft) => body(draft).rows[7].replaceWith(rowFrom('<tr><td data-rs-unit="3">a</td></tr>'))],
    ["a block's identity", (draft) => body(draft).rows[2].replaceWith(rowFrom('<tr data-block-id="b-1"><td>a</td></tr>'))],
    ["a script", (draft) => body(draft).rows[1].replaceWith(rowFrom("<tr><td><script>alert(1)</script></td></tr>"))],
    ["a script of data", (draft) => body(draft).rows[1].replaceWith(rowFrom('<tr><td><script type="application/json">{}</script></td></tr>'))],
    ["a frame", (draft) => body(draft).rows[1].replaceWith(rowFrom('<tr><td><iframe src="https://example.com"></iframe></td></tr>'))],
    ["a frame's own document", (draft) => body(draft).rows[1].replaceWith(rowFrom('<tr><td><iframe srcdoc="x"></iframe></td></tr>'))],
    ["a style that leaves its place", (draft) => body(draft).rows[4].replaceWith(rowFrom('<tr><td style="position: fixed">a</td></tr>'))],
    ["a handler in a template", (draft) => body(draft).rows[4].replaceWith(rowFrom('<tr><td><template><img src="x" onerror="alert(1)"></template></td></tr>'))],
    ["an animation of an address", (draft) => body(draft).rows[4].replaceWith(rowFrom('<tr><td><svg><animate attributeName="href" to="javascript:alert(1)"/></svg></td></tr>'))],
    ["a handler on a row added", (draft) => body(draft).append(rowFrom('<tr><td onfocus="x">new</td></tr>'), document.createTextNode("\n"))],
    ["a block in a paragraph (made by the DOM)", (draft) => {
      const p = document.createElement("p");
      p.append(document.createElement("div"));
      body(draft).rows[6].cells[0].append(p);
    }],
    ["a cell with no row (made by the DOM)", (draft) => body(draft).rows[6].replaceWith(Object.assign(document.createElement("td"), { textContent: "lost" }))],
    ["a row in a row (made by the DOM)", (draft) => body(draft).rows[6].append(document.createElement("tr"))],
    ["a comment that ends early (made by the DOM)", (draft) => body(draft).rows[6].cells[0].append(document.createComment("a-->b"))],
    ["a link in a link (made by the DOM)", (draft) => {
      const outer = document.createElement("a");
      outer.append(document.createElement("a"));
      body(draft).rows[6].cells[0].append(outer);
    }],
    ["words between rows", (draft) => body(draft).insertBefore(document.createTextNode("stray"), body(draft).rows[2])],
    ["a body in a cell (made by the DOM)", (draft) => body(draft).rows[6].cells[0].append(document.createElement("tbody"))],
    ["two rows changed, the second refused", (draft) => {
      body(draft).rows[2].replaceWith(rowFrom("<tr><td>fine</td></tr>"));
      body(draft).rows[30].replaceWith(rowFrom('<tr><td onclick="x">bad</td></tr>'));
    }],
    ["two kinds in two rows: the first in the table said", (draft) => {
      body(draft).rows[9].replaceWith(rowFrom('<tr><td><iframe></iframe></td></tr>'));
      body(draft).rows[20].replaceWith(rowFrom('<tr><td onclick="x">bad</td></tr>'));
    }],
    ["a row that does not read back and another refused: the reading said first", (draft) => {
      body(draft).rows[9].replaceWith(rowFrom('<tr><td onclick="x">bad</td></tr>'));
      body(draft).rows[20].cells[0].append(document.createComment("--><b>"));
    }],
    ["a row of the header", (draft) => draft.tHead.rows[0].replaceWith(rowFrom('<tr><th data-column="t" onclick="x">任务</th></tr>'))],
  ];
  const good = [
    ["a cell's words", (draft) => body(draft).rows[3].replaceWith(rowFrom("<tr><td>任务 3 改过</td><td>进行中</td><td>3</td><td></td></tr>"))],
    ["words with markup a cell may hold", (draft) => body(draft).rows[3].replaceWith(rowFrom('<tr><td class="x" title="a&lt;b&gt;c">一<br>二 &amp; 三</td><td><a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noreferrer">x</a></td></tr>'))],
    ["a record added", (draft) => body(draft).append(rowFrom("<tr><td>新的</td></tr>"), document.createTextNode("\n"))],
    ["a record taken out", (draft) => { body(draft).rows[10].previousSibling.remove(); body(draft).rows[10].remove(); }],
    ["several records, apart", (draft) => {
      body(draft).rows[0].replaceWith(rowFrom("<tr><td>first</td></tr>"));
      body(draft).rows[39].replaceWith(rowFrom("<tr><td>last</td></tr>"));
    }],
    ["the header's names", (draft) => draft.tHead.rows[0].replaceWith(rowFrom('<tr><th data-column="t">名</th><th data-column="s">状态</th></tr>'))],
    ["every record taken out", (draft) => body(draft).replaceChildren(document.createTextNode("\n"))],
    ["a comment that reads back", (draft) => body(draft).rows[6].cells[0].append(document.createComment(" note "))],
  ];
  for (const [what, change] of [...bad, ...good]) {
    const draft = table.cloneNode(true);
    change(draft);
    const spans = changedRows(table, draft);
    assert.ok(Array.isArray(spans) && spans.length > 0, `${what}: a change of rows alone (${JSON.stringify(spans)})`);
    const whole = wholeProblem(table, draft);
    const rows = draftProblem(table, draft, { known: true, spans });
    assert.equal(rows, whole, `${what}: the rows' check says what the whole check says`);
    assert.equal(whole === null, good.some(([name]) => name === what), `${what}: ${whole === null ? "taken" : `refused (${whole})`}`);
  }

  // A change anywhere else than rows: no rows said, the whole checked (what the rows alone would miss among it).
  const elsewhere = [
    ["a caption with a handler", (draft) => draft.prepend(Object.assign(document.createElement("caption"), { onclick: null }), document.createTextNode("")), (draft) => draft.querySelector("caption").setAttribute("onclick", "x")],
    ["a row standing in the table", (draft) => draft.append(rowFrom("<tr><td>a</td></tr>"))],
    ["a second body", (draft) => draft.append(document.createElement("tbody"))],
    ["a section's own attribute", (draft) => body(draft).setAttribute("onclick", "x")],
    ["a section's harmless attribute", (draft) => body(draft).setAttribute("class", "rows")],
    ["words in the table itself", (draft) => draft.insertBefore(document.createTextNode("stray"), body(draft))],
    ["blanks around the sections", (draft) => { draft.firstChild.data = "\n  "; }],
    ["the sections taken out", (draft) => draft.replaceChildren()],
  ];
  for (const [what, ...changes] of elsewhere) {
    const draft = table.cloneNode(true);
    for (const change of changes) change(draft);
    assert.equal(changedRows(table, draft), null, `${what}: no change of rows alone`);
    assert.equal(draftProblem(table, draft, { known: true }), wholeProblem(table, draft), `${what}: checked whole`);
  }
  assert.equal(draftProblem(table, table.cloneNode(true), { known: true }), null, "a draft holding what the part does: nothing to say");
  for (const [name, value] of [["data-x", "1"], ["onclick", "x"]]) {
    const draft = table.cloneNode(true);
    draft.setAttribute(name, value);
    assert.equal(draftProblem(table, draft, { known: true }), wholeProblem(table, draft), `the table's own ${name}: refused as the whole check refuses it`);
    assert.match(wholeProblem(table, draft), /own tag and attributes are the file's/);
  }
  // Random changes of rows from the cases above and some of their own, a few at once: the two checks agree every time.
  let seed = 7;
  const random = (most) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % most;
  };
  const pieces = ["<tr><td>a</td></tr>", '<tr><td onclick="x">a</td></tr>', '<tr><td><a href="javascript:x">a</a></td></tr>', '<tr data-block-id="x"><td>a</td></tr>', '<tr><td data-ge-x="1">a</td></tr>', "<tr><td><script>x</script></td></tr>", "<tr><td>a<br>b</td><td>✓</td></tr>", '<tr><td title="a&quot;b">a</td></tr>', '<tr><td><template><b onclick="x"></b></template></td></tr>'];
  for (let trial = 0; trial < 400; trial++) {
    const draft = table.cloneNode(true);
    for (let count = 1 + random(3); count > 0; count--) {
      const rows = body(draft).rows;
      const kind = random(6);
      if (kind < 3 && rows.length > 0) rows[random(rows.length)].replaceWith(rowFrom(pieces[random(pieces.length)]));
      else if (kind === 3) body(draft).insertBefore(rowFrom(pieces[random(pieces.length)]), rows[random(rows.length + 1)] ?? null);
      else if (kind === 4 && rows.length > 0) rows[random(rows.length)].remove();
      else if (kind === 5 && rows.length > 0) rows[random(rows.length)].cells[0]?.append(random(2) ? document.createComment("x-->y") : document.createElement("p").appendChild(document.createElement("div")).parentNode);
    }
    const spans = changedRows(table, draft);
    if (spans === null) continue;
    assert.equal(draftProblem(table, draft, { known: true, spans }), wholeProblem(table, draft), `random change ${trial}: the two checks agree (${draft.innerHTML.length} bytes)`);
  }
}

// ---------- draftedParts: whole first, rows from then on; what goes onto the page ----------
{
  const { host, script, table } = database();
  const parts = [{ name: "columns", part: script }, { name: "records", part: table }];
  const write = (change, options = { together: true }) => said(() => {
    const taken = draftedParts({ parts, run: (drafts) => { change(drafts); return true; } }, host, "database", undefined, options);
    taken?.put();
    return taken;
  });
  const kept = [...body(table).rows];
  // The first write: the part not known to pass, checked whole, put in whole.
  const first = write((drafts) => body(drafts.records).rows[3].replaceWith(rowFrom("<tr><td>one</td></tr>")));
  assert.ok(first.value && first.lines.length === 0, `the first write taken: ${first.lines}`);
  assert.equal(body(table).rows[3].cells[0].textContent, "one", "it is on the page");
  // From then on, a change of rows puts those rows alone in: the others are the same nodes.
  const now = [...body(table).rows];
  const second = write((drafts) => body(drafts.records).rows[5].replaceWith(rowFrom("<tr><td>two</td></tr>")));
  assert.equal(second.value.changed.length, 1, "the next write changes the table alone (its JSON as it was)");
  assert.equal(body(table).rows[5].cells[0].textContent, "two");
  assert.ok([...body(table).rows].every((row, at) => at === 5 || row === now[at]), "the rows it did not change stay on the page as they were (the same nodes)");
  assert.ok(kept.length === now.length, "as many rows as before");
  const draftHtml = second.value.changed[0][2].innerHTML;
  assert.equal(table.innerHTML, draftHtml, "the part holds what the draft holds");
  // A row refused in a part known to pass: refused, said as the whole check says it, nothing on the page.
  const before = table.innerHTML;
  const refused = write((drafts) => body(drafts.records).rows[8].replaceWith(rowFrom('<tr><td onclick="x">x</td></tr>')));
  assert.equal(refused.value, null, "a handler in a row: refused");
  assert.match(refused.lines.join("\n"), /records: a data part holds no <td> of that kind/, refused.lines.join("\n"));
  assert.equal(table.innerHTML, before, "and nothing of it on the page");
  // Someone else's change of the part (an undo, a pull) leaves it not known to pass: the next write is checked whole,
  // which sees what that change brought into a row this write does not touch.
  body(table).rows[12].cells[0].setAttribute("onclick", "x");
  const after = write((drafts) => body(drafts.records).rows[20].replaceWith(rowFrom("<tr><td>fine</td></tr>")));
  assert.equal(after.value, null, "a write after someone else's change is checked whole: the handler it brought refuses it");
  assert.match(after.lines.join("\n"), /a data part holds no <td>/);
  body(table).rows[12].cells[0].removeAttribute("onclick");
  // The JSON part is read at every write, though the table alone changes.
  const broken = write((drafts) => { drafts.columns.textContent = "{ nope"; body(drafts.records).rows[1].replaceWith(rowFrom("<tr><td>b</td></tr>")); });
  assert.equal(broken.value, null, "JSON that does not read: refused");
  assert.match(broken.lines.join("\n"), /columns: a script of data holds JSON/);
  // A change written on the page rather than the draft: put back, refused.
  const html = table.innerHTML;
  const live = write(() => body(table).rows[2].cells[0].append("live"));
  assert.equal(live.value, null, "a change on the page: refused");
  assert.equal(table.innerHTML, html, "and put back");
  assert.match(live.lines.join("\n"), /it wrote the part records on the page/);
  // A change outside rows on a part known to pass: checked whole and put in whole, as before.
  const caption = write((drafts) => drafts.records.prepend(Object.assign(document.createElement("caption"), { textContent: "标题" })));
  assert.ok(caption.value, `a caption: taken (${caption.lines})`);
  assert.equal(table.querySelector("caption")?.textContent, "标题");
  table.querySelector("caption").remove();

  // The bytes one commit writes: of a database's two parts together, as the server counts them (database/file.mjs);
  // of each part alone where the block says nothing of it (a custom block's, as before).
  const big = "x".repeat(Math.ceil(DATA_MOST / 2) + 10);
  const each = write((drafts) => { drafts.columns.textContent = JSON.stringify({ a: big }); body(drafts.records).rows[0].cells[0].textContent = big; });
  assert.equal(each.value, null, "two parts of more than one commit's bytes together: refused");
  assert.match(each.lines.join("\n"), /columns, records: together they hold more than the 1048576 bytes one commit writes/);
  assert.ok(script.textContent.length < 1000 && !table.innerHTML.includes(big), "nothing of it on the page");
  const apart = write((drafts) => { drafts.columns.textContent = JSON.stringify({ a: big }); body(drafts.records).rows[0].cells[0].textContent = big; }, {});
  assert.ok(apart.value, `the same, each part counted alone: taken (${apart.lines})`);
  assert.ok(tooLong("é".repeat(DATA_MOST / 2 + 1)) && !tooLong("é".repeat(DATA_MOST / 2)) && tooLong("x".repeat(DATA_MOST + 1)) && !tooLong("x".repeat(DATA_MOST)) && !tooLong("你".repeat(DATA_MOST / 3)) && tooLong("你".repeat(DATA_MOST / 3 + 1)), "the bytes counted as UTF-8, exactly near the limit");
}

// ---------- the kit writes the rows of the records that changed, the same markup as the whole ----------
{
  const { writeRows } = await import("../../src/render/kit/database/data/file.js");
  const host = document.createElement("div");
  host.className = "doc-database";
  const rows = Array.from({ length: 20 }, (_, at) => `
<tr><td>任务 ${at}</td><td>${at}</td></tr>`).join("");
  host.innerHTML = `<script type="application/json">{"columns":[{"id":"t","name":"任务","type":"title"},{"id":"n","name":"估时","type":"number"}],"views":[]}</script><table>
<thead><tr><th data-column="t">任务</th><th data-column="n">估时</th></tr></thead>
<tbody>${rows}
</tbody>
</table>`;
  const read = readDatabase(readElement(host));
  assert.equal(read.readOnly, false, JSON.stringify(read.problems));
  const doc = { props: read.columns, rows: read.rows.map((row, at) => ({ ...row, id: `r${at}` })), views: read.views, shape: read.shape };
  const changed = { ...doc, rows: doc.rows.map((row) => (row.id === "r4" ? { ...row, values: { ...row.values, t: "任务 <4> & 改过" } } : row)) };
  const out = writeDatabase({ columns: changed.props, rows: changed.rows, views: changed.views, shape: changed.shape });
  const table = host.querySelector("table");
  const whole = tableMarkup(out, layoutOf(table.innerHTML));
  const draft = table.cloneNode(true);
  assert.ok(writeRows(draft, out, changed, new Set(["r4"])), "the changed record's row written alone");
  assert.equal(draft.innerHTML, whole, "the draft holds the markup of the whole table written anew");
  assert.ok(rowMarkup(out, 4).includes("任务 &lt;4&gt; &amp; 改过"), rowMarkup(out, 4));
  assert.equal(writeRows(draft, out, { ...changed, rows: changed.rows.slice(1) }, new Set(["r4"])), false, "rows and records of other counts: not written so");
}

console.log("Checked data parts: a change of rows checked in those rows and refused exactly as the whole part is (handlers, addresses of code, the editor's marks, a block's identity, scripts, frames, markup that does not read back), any other change checked whole, the first write and one after someone else's change checked whole, the JSON read every time, a write on the page put back, a database's bytes counted together, the rows that changed alone put on the page, the kit's rows the same markup as its whole table.");
