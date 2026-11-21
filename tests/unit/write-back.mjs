import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { JSDOM } from "jsdom";
import { commitEdits, findBlocks, findUnits, hashOf, instrument, rebaseOnto, revertedParts } from "../../src/editor/source.mjs";
import { pendingKey, readLost, recover } from "../../src/editor/page/autosave.mjs";
import { copyOf } from "../../src/editor/page/clipboard/own/describe.mjs";
import { createCommits } from "../../src/editor/page/commit.mjs";
import { captureLayout, prepareBlock } from "../../src/editor/page/core.mjs";
import { connectPages } from "../../src/editor/page/page-objects.mjs";
import { componentNotes } from "../../src/render/component-checks.mjs";
import { parseReport } from "../../src/render/report-tree.mjs";
import { forgetCatalog, readCatalog } from "../../src/shared/component-catalog.mjs";
import { DATA_MOST } from "../../src/shared/components/installed.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { jsonIn, laidOut } from "../../src/shared/json-layout.mjs";
import { editJSONWrote } from "../../src/cli/component-look.mjs";
import { createEditService } from "../../src/editor/service.mjs";
import { createTodoWrites } from "../../src/editor/page/todo-writes.mjs";
import { createIndex, readOf } from "../../src/workbench/index.mjs";
import { createWorkspaceService } from "../../src/workbench/service.mjs";
import { TODO_CODES, TODO_MOST, TODO_ROUTE } from "../../src/shared/workspace-query.mjs";

// A component writing back to the file (docs/editor.md, "A component writes back"): the operation
// { source, hash, definition } of a unit, as a table's { table, hash } is, in a workspace of the test's own
// holding the fixtures' packages. Its server's side, then the page's commits against it (in jsdom, the page
// object being what the test says of the part); what goes on in a browser is in the scenarios named in
// docs/testing.md.

const root = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-write-back-"));
const previous = process.env.GALLERY_DEFAULT_WORKSPACE;
process.env.GALLERY_DEFAULT_WORKSPACE = root;
fs.cpSync(path.join(projectRoot, "tests", "fixtures", "components"), path.join(root, "components"), { recursive: true });
fs.writeFileSync(path.join(root, "gallery.json"), JSON.stringify({ gallery: "workspace", version: 1 }));
forgetCatalog(root);

try {
  const rows = readCatalog(root).packages.get("local/rows");
  // A file that holds everything a rewrite could disturb: spaces and quotes of every kind in tags,
  // comments, entities, CRLF, in and around the instance.
  const SOURCE = [
    "<!doctype html>",
    '<html lang="zh-CN"><head><title>t</title></head><body>',
    '<main class="doc-page"   data-doc-id=\'t\'>',
    '  <header class="doc-header"><h1 class="doc-title">t</h1></header>',
    "  <!-- a comment &amp; another -->",
    "  <p  class = 'x'   >甲&nbsp;乙 &#20013; &amp;</p>",
    `  <div class=rows   data-doc-component='local/rows' data-block-id="rows-a"  >`,
    "    <!-- in the instance, before its title -->",
    "    <h3 >题&nbsp;目</h3>",
    '    <table   class="plain" >',
    "      <!-- in the part -->",
    "      <thead><tr><th>事项</th></tr></thead>",
    "      <tbody><tr><td>一&amp;</td></tr><tr><td>二</td></tr></tbody>",
    "    </table   >",
    '    <script   type="application/json">{"moves":0}</script >',
    "    <!-- after its parts -->",
    "  </div  >",
    "  <p>后面</p>",
    "</main></body></html>",
    "",
  ].join("\r\n");
  const REF = { key: 0, id: "rows-a" };
  const send = (source, op, more = {}) => commitEdits({ current: source, ...more, units: [{ key: "u", unit: { ...REF, hash: more.hash ?? commitHash(source) }, hash: more.hash ?? commitHash(source), definition: rows.definition, ...op }] });
  const commitHash = (source) => commitEdits({ current: source, touch: [REF] }).hashes[0];
  const status = (answer) => answer.units[0];
  const NEW = "<tbody><tr><td>二</td></tr><tr><td>一&amp;</td></tr></tbody>";

  // It lands inside the part alone: all else byte for byte.
  {
    const answer = send(SOURCE, { source: { rows: NEW } });
    assert.equal(status(answer).status, "applied", JSON.stringify(status(answer)));
    const [before, after] = [SOURCE.slice(0, SOURCE.indexOf('<table   class="plain" >') + 24), SOURCE.slice(SOURCE.indexOf("</table   >"))];
    assert.equal(answer.text, `${before}${NEW}${after}`, "every byte outside the part stays, tags, comments, entities and line endings");
  }

  // Line endings: the file's, in a part written over several lines, and a script of data the same way.
  {
    const answer = send(SOURCE, { source: { rows: "\n<tbody><tr><td>新</td></tr></tbody>\n", moves: '{"moves":1}' } });
    assert.equal(status(answer).status, "applied", JSON.stringify(status(answer)));
    assert.ok(answer.text.includes('class="plain" >\r\n<tbody><tr><td>新</td></tr></tbody>\r\n</table   >'), "the file's line endings");
    assert.ok(answer.text.includes('<script   type="application/json">{"moves":1}</script >'), "the script's text, its tags as they stood");
  }

  // A move takes an instance whole to its new place: what it holds stays byte for byte however deep that
  // place is, as a script's text does, so that its parts are what its page and its component last had of
  // them (fuzz --instances --more, seed 2008: a table re-indented on the way read otherwise in the file).
  {
    const nested = SOURCE.replace("  <p>后面</p>", ['  <section class="doc-section" data-block-id="sect-a">', '    <p data-block-id="para-a">节里</p>', "  </section>"].join("\r\n"));
    const { units } = findUnits(nested);
    const ref = (id) => ({ key: units.findIndex((unit) => unit.blockId === id), id });
    const answer = commitEdits({ current: nested, units: [{ key: "m", unit: ref("rows-a"), move: { after: ref("para-a") } }] });
    assert.equal(answer.units[0].status, "applied", JSON.stringify(answer.units[0]));
    const inside = (text) => text.slice(text.indexOf('data-block-id="rows-a"  >'), text.indexOf("</div  >"));
    assert.equal(inside(answer.text), inside(nested), "what it holds, byte for byte");
    assert.ok(answer.text.indexOf("rows-a") > answer.text.indexOf("节里") && answer.text.indexOf("rows-a") < answer.text.indexOf("</section>"), "after the paragraph it went after", answer.text);
  }

  // An edit of the page and of a text part at once are no overlap.
  {
    const block = findBlocks(SOURCE).find((one) => one.kind === "installed");
    assert.ok(block, "its title is a text block");
    const answer = send(SOURCE, { source: { rows: NEW } }, { texts: [{ key: "t", block: { unit: REF, path: ["unit", ["h3", 0, 1]], before: "题&nbsp;目" }, parts: [{ keep: true, html: "新题" }] }] });
    assert.deepEqual([status(answer).status, answer.texts[0].status], ["applied", "applied"], JSON.stringify(answer.texts));
    assert.ok(answer.text.includes("<h3 >新题</h3>") && answer.text.includes(NEW));
  }

  // What the file has changed: the unit's hash, as for any unit: the existing conflict.
  {
    const old = commitHash(SOURCE);
    const moved = SOURCE.replace("二", "二改");
    const answer = send(moved, { source: { rows: NEW } }, { hash: old });
    assert.deepEqual([status(answer).status, status(answer).reason], ["conflict", "changed"]);
    assert.equal(answer.text, moved, "nothing written");
    const inside = moved.slice(moved.indexOf('<table   class="plain" >') + 24, moved.indexOf("</table   >"));
    assert.deepEqual(status(answer).theirs, { rows: inside }, "what the file holds of the part it writes, for the reader who writes over it");
    assert.deepEqual(Object.keys(status(answer).parts ?? {}), ["rows"], "and its hash");
    const forced = send(moved, { source: { rows: NEW }, parts: status(answer).parts, force: true }, { hash: old });
    assert.equal(status(forced).status, "applied", "the reader may say to write it all the same, over what they were shown");
    // Written again by someone else after the reader was shown it: 仍然调整 asks again, with what it holds now.
    const again = moved.replace("一&amp;", "一（又改）");
    const refused = send(again, { source: { rows: NEW }, parts: status(answer).parts, force: true }, { hash: old });
    assert.deepEqual([status(refused).status, status(refused).reason, refused.text], ["conflict", "changed", again], "not over a write they were not shown");
    assert.ok(status(refused).theirs.rows.includes("一（又改）"), "and what the file holds now is what they are shown");
  }

  // Someone else changed only the rest of the instance (its words, another part): what the page writes of
  // a part they left as the page last had it (`parts`, the hashes the scan gives) goes in, theirs staying;
  // a part they changed is the conflict, and so is a write that says nothing of what its parts held.
  {
    const old = commitHash(SOURCE);
    const was = instrument(SOURCE).map.units.find((unit) => unit.blockId === "rows-a").parts;
    assert.deepEqual(Object.keys(was), ["rows", "moves"], "the scan gives a hash of each data part");
    const retitled = SOURCE.replace("题&nbsp;目", "题目（AI）");
    let answer = send(retitled, { source: { rows: NEW }, parts: { rows: was.rows } }, { hash: old });
    assert.equal(status(answer).status, "applied", JSON.stringify(status(answer)));
    assert.ok(answer.text.includes("题目（AI）") && answer.text.includes(NEW), "their words and the write both in the file");
    const counted = SOURCE.replace('{"moves":0}', '{"moves":5}');
    answer = send(counted, { source: { rows: NEW }, parts: { rows: was.rows } }, { hash: old });
    assert.ok(status(answer).status === "applied" && answer.text.includes('{"moves":5}') && answer.text.includes(NEW), "another part of theirs and the write");
    assert.equal(status(send(SOURCE.replace("二", "二改"), { source: { rows: NEW }, parts: { rows: was.rows } }, { hash: old })).reason, "changed", "the part they changed");
    // A write of two parts, one of which they changed: the other goes, as two edits would; written by one
    // edit together, neither.
    answer = send(counted, { source: { rows: NEW, moves: '{"moves":1}' }, parts: was }, { hash: old });
    assert.deepEqual([status(answer).status, status(answer).reason, status(answer).wrote, Object.keys(status(answer).theirs)], ["conflict", "changed", ["rows"], ["moves"]], JSON.stringify(status(answer)));
    assert.ok(answer.text.includes(NEW) && answer.text.includes('{"moves":5}'), "the part they left goes in, theirs stays");
    // The review of the Agent's changes takes what went in alone (rebaseOnto, with the file's answer): on the
    // baseline, the instance as it was before their write, the part that went in and not the one held for the
    // reader, which, given up (保留 Agent 的), 撤回 would otherwise write.
    const based = rebaseOnto(SOURCE, { units: [{ key: "u", unit: { ...REF, hash: old }, hash: old, definition: rows.definition, source: { rows: NEW, moves: '{"moves":1}' }, parts: was }] }, answer);
    assert.ok(based.includes(NEW) && based.includes('{"moves":0}') && !based.includes('{"moves":1}'), `the part held stays out of the baseline: ${based}`);
    // Then 仍然调整: the part held written over what the card showed (the refusal's hashes, `force`); on the baseline over
    // the part as it holds it, so that the reader's word is no change of the Agent's (replayed with the file's hashes it
    // was refused there, and 撤回 wrote moves 0 back).
    const forcedOp = { key: "u", unit: { ...REF, hash: old }, hash: old, definition: rows.definition, source: { moves: '{"moves":1}' }, parts: { ...was, ...status(answer).parts }, force: true };
    const forcedAnswer = commitEdits({ current: answer.text, units: [forcedOp] });
    assert.equal(status(forcedAnswer).status, "applied", JSON.stringify(status(forcedAnswer)));
    const overBase = rebaseOnto(based, { units: [forcedOp] }, forcedAnswer);
    assert.ok(overBase.includes(NEW) && overBase.includes('{"moves":1}'), `仍然调整 goes over the baseline's part too: ${overBase}`);
    answer = send(counted, { source: { rows: NEW, moves: '{"moves":1}' }, parts: was, together: [["rows", "moves"]] }, { hash: old });
    assert.deepEqual([status(answer).reason, status(answer).wrote, Object.keys(status(answer).theirs).sort(), answer.text], ["changed", undefined, ["moves", "rows"], counted], "written together, both wait");
    // Found only by what stood around it and what it says (no id yet): a write goes by the hash of the unit alone.
    {
      const anonymous = SOURCE.replace(' data-block-id="rows-a"', "");
      const opened = instrument(anonymous).map.units.find((unit) => unit.kind === "installed");
      const before = anonymous.replace("<p  class = 'x'   >甲&nbsp;乙 &#20013; &amp;</p>", "<p>换了的一段</p>");
      const deleted = before.replace("<h3 >题&nbsp;目</h3>", "<h3 >另一题</h3>");
      const write = (current) => commitEdits({ current, opening: anonymous, units: [{ key: "u", unit: { key: opened.id, open: opened.id, hash: opened.hash, blockId: "rows-new" }, hash: opened.hash, source: { rows: NEW }, parts: { rows: opened.parts.rows }, definition: rows.definition }] });
      assert.equal(status(write(deleted)).reason, "changed", "one most like the one named is no unit whose parts the page saw");
      assert.equal(status(write(before)).status, "applied", "where it stands as it was, found by where it stood");
    }
    assert.equal(status(send(retitled, { source: { rows: NEW } }, { hash: old })).reason, "changed", "a write that says nothing of its parts");
    assert.equal(status(send(retitled, { source: { rows: NEW }, parts: { rows: "other" } }, { hash: old })).reason, "changed", "nor one that says another");
  }

  // A manifest that is not the package's now.
  {
    const answer = send(SOURCE, { source: { rows: NEW }, definition: "another" });
    assert.deepEqual([status(answer).status, status(answer).reason], ["conflict", "definition"]);
    assert.equal(answer.text, SOURCE, "nothing written");
    assert.equal(status(send(SOURCE, { source: { rows: NEW }, definition: "another", force: true })).reason, "definition", "what no reader decides");
    assert.equal(status(send(SOURCE, { source: { rows: NEW }, definition: undefined })).reason, "definition", "and one that says none");
    const gone = SOURCE.replaceAll("local/rows", "local/none");
    assert.equal(status(send(gone, { source: { rows: NEW } })).reason, "definition", "of a package there is no more");
    assert.equal(status(send(gone, { source: { rows: NEW }, definition: undefined })).reason, "definition", "and a page that says none of one there is no more");
  }

  // What may not go in, whatever a page sends.
  {
    const refused = (source) => {
      const answer = send(SOURCE, { source });
      assert.deepEqual([status(answer).status, status(answer).reason], ["conflict", "invalid"], JSON.stringify(source));
      assert.equal(answer.text, SOURCE, "nothing written");
    };
    for (const inner of [
      '<tbody><tr><td><script>alert(1)</script></td></tr></tbody>',
      '<tbody><tr><td><script type="application/json">{}</script></td></tr></tbody>',
      '<tbody><tr onclick="alert(1)"><td>x</td></tr></tbody>',
      '<tbody><tr ONCLICK="alert(1)"><td>x</td></tr></tbody>',
      '<tbody><tr data-block-id="other"><td>x</td></tr></tbody>',
      '<tbody><tr data-ge-block="1"><td>x</td></tr></tbody>',
      '<tbody><tr><td><a href="javascript:alert(1)">x</a></td></tr></tbody>',
      '<tbody><tr><td><iframe src="x"></iframe></td></tr></tbody>',
      '<tbody><tr><td><template><script>1</script></template></td></tr></tbody>',
      // What would read past the part, or as something else there.
      "</table><p>outside</p><table>",
      '</table></div><script>alert(1)</script><div><table>',
      "<tbody><tr><td>x</td></tr></tbody><!-- open",
      "<tbody><tr><td>x</td></tr>",
      "<tbody><tr><td>x",
      "<tr><td>a row with no tbody</td></tr>",
      "<tbody><tr><td>x</td></tr></tbody><div>sent out of the table</div>",
      "words in a table",
      "</tbody>",
    ]) refused({ rows: inner });
    refused({ moves: '{"moves":1' }); // no JSON
    refused({ moves: '{"note":"</script><script>alert(1)</script>"}' });
    refused({ moves: '{"note":"<!-- <script>"}' });
    refused({ title: "新题" }); // a part edited as text is no data part
    refused({ none: "x" });
    refused({ rows: 7 });
    refused({});
    refused({ rows: `<tbody>${"<tr><td>填</td></tr>".repeat(80000)}</tbody>` }); // past what one commit writes
    const scripted = SOURCE.replace('type="application/json"', 'type="text/javascript"');
    const answer = send(scripted, { source: { moves: "1" } });
    assert.equal(status(answer).reason, "invalid", "a part that is a script of code is no data");
  }

  // An instance of a shape its manifest does not reach is read-only; up to it, it writes.
  {
    const marked = (schema) => SOURCE.replace("data-block-id=\"rows-a\"", `data-block-id="rows-a" data-doc-schema="${schema}"`);
    assert.equal(status(send(marked(2), { source: { rows: NEW } })).status, "applied");
    assert.equal(status(send(marked(3), { source: { rows: NEW } })).reason, "invalid");
    assert.equal(status(send(marked("new"), { source: { rows: NEW } })).reason, "invalid", "one no number says is none anything here reads");
    assert.equal(status(send(marked(""), { source: { rows: NEW } })).reason, "invalid", "nor is one that says nothing");
    assert.deepEqual(findBlocks(marked(2)).filter((block) => block.kind === "installed").map((block) => block.tag), ["h3"], "up to it its title is a text block");
    for (const schema of [3, "new", ""]) assert.deepEqual(findBlocks(marked(schema)).filter((block) => block.kind === "installed"), [], "past it its words are read-only too: the block is");
    assert.deepEqual(componentNotes(parseReport(marked(2))), [], "gallery check has nothing to say of the one");
    assert.match(componentNotes(parseReport(marked(3)))[0], /^line 7: <div data-doc-component="local\/rows">: data-doc-schema="3" is past the 2 its package's manifest reads/, "and says so of the other");
  }

  // A table's operation is no instance's, nor the other way round: no way round its manifest.
  {
    const asTable = (more) => commitEdits({ current: SOURCE, units: [{ key: "u", unit: { ...REF, hash: commitHash(SOURCE) }, table: { rows: NEW }, hash: commitHash(SOURCE), ...more }] });
    for (const more of [{}, { definition: rows.definition }, { definition: "stale" }, { force: true }]) {
      const answer = asTable(more);
      assert.deepEqual([status(answer).status, status(answer).reason], ["conflict", "invalid"], JSON.stringify(more));
      assert.equal(answer.text, SOURCE, "nothing written");
    }
    const table = '<main><div class="doc-table-wrap" data-block-id="t"><table class="doc-table"><tbody><tr><td>1</td></tr></tbody></table></div></main>';
    const other = commitEdits({ current: table, units: [{ key: "u", unit: { key: 0, id: "t" }, source: { rows: "x" }, definition: rows.definition }] });
    assert.equal(status(other).reason, "definition");
  }

  // The region rule, as the scan reads a manifest: what stands in a data part or holds one is no text block.
  {
    const folder = path.join(root, "components", "local", "nest");
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, "component.json"), JSON.stringify({ id: "local/nest", apiVersion: 1, version: "1", name: { zh: "套", en: "Nest" }, description: { zh: "套", en: "Nest" }, parts: {
      kept: { at: ":scope > h3", edit: "text" },
      heading: { at: ".inner", edit: "text", optional: true },
      around: { at: ":scope > div.around", edit: "text", optional: true },
      data: { at: ":scope > div.data", edit: "data" },
      deep: { at: ":scope > div.around > div", edit: "data", optional: true },
    } }));
    forgetCatalog(root);
    const source = `<!doctype html><html lang="zh"><head><title>t</title></head><body><main class="doc-page" data-doc-id="t"><header class="doc-header"><h1 class="doc-title">t</h1></header>
<div data-doc-component="local/nest" data-block-id="n"><h3>题</h3><div class="data"><p class="inner">里面</p></div><div class="around"><div>深</div></div></div>
</main></body></html>`;
    assert.deepEqual(findBlocks(source).filter((block) => block.kind === "installed").map((block) => block.tag), ["h3"], "its title alone");
    const definition = readCatalog(root).packages.get("local/nest").definition;
    const hash = commitEdits({ current: source, touch: [{ key: 0, id: "n" }] }).hashes[0];
    const write = (parts) => commitEdits({ current: source, units: [{ key: "u", unit: { key: 0, id: "n", hash }, source: parts, hash, definition }] });
    assert.equal(status(write({ data: '<p class="inner">新</p>' })).status, "applied");
    assert.equal(status(write({ deep: "新" })).status, "applied", "a data part of its own");
  }

  // Parts of odd kinds: what holds no markup, a drawing, a part in another, an element two parts name (the
  // first's), an instance in an instance.
  {
    const folder = path.join(root, "components", "local", "odd");
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, "component.json"), JSON.stringify({ id: "local/odd", apiVersion: 1, version: "1", name: { zh: "杂", en: "Odd" }, description: { zh: "杂", en: "Odd" }, parts: {
      words: { at: ":scope > textarea", edit: "data", optional: true },
      held: { at: ":scope > template", edit: "data", optional: true },
      named: { at: ":scope > title", edit: "data", optional: true },
      drawing: { at: ":scope > svg", edit: "data", optional: true },
      around: { at: ":scope > div.around", edit: "data", optional: true },
      within: { at: ":scope > div.around > p", edit: "data", optional: true },
      again: { at: "div.around", edit: "data", optional: true },
      far: { at: "p.far", edit: "data", optional: true },
    } }));
    forgetCatalog(root);
    const source = `<!doctype html><html lang="zh"><head><title>t</title></head><body><main class="doc-page" data-doc-id="t"><header class="doc-header"><h1 class="doc-title">t</h1></header>
<div data-doc-component="local/odd" data-block-id="o"><textarea>字</textarea><template><p>模</p></template><title>名</title><svg viewBox="0 0 1 1"><g></g></svg><div class="around"><p>里</p></div><div data-doc-component="local/odd" data-block-id="i"><p class="far">别的块</p></div></div>
</main></body></html>`;
    const definition = readCatalog(root).packages.get("local/odd").definition;
    const hash = commitEdits({ current: source, touch: [{ key: 0, id: "o" }] }).hashes[0];
    const write = (parts) => commitEdits({ current: source, units: [{ key: "u", unit: { key: 0, id: "o", hash }, source: parts, hash, definition }] });
    for (const parts of [{ words: "新" }, { held: "<p>新</p>" }, { named: "新" }, { within: "新" }, { again: "<p>新</p>" }, { far: "新" }, { drawing: "<g>" }]) {
      const answer = write(parts);
      assert.deepEqual([status(answer).status, status(answer).reason], ["conflict", "invalid"], JSON.stringify(parts));
      assert.equal(answer.text, source, "nothing written");
    }
    assert.equal(status(write({ around: '<p>新</p>' })).status, "applied", "a part in another is written with that one");
    const drawn = write({ drawing: '<path d="M0 0"/>' });
    assert.ok(status(drawn).status === "applied" && drawn.text.includes('<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>'), "a drawing's element closed by itself");
    assert.equal(status(write({ drawing: '<path d="M0 0"></path>' })).status, "applied", "as a browser writes it too");
  }

  // What someone else's write put back of the page's writes (revertedParts, the answer of POST
  // /__gallery/edit/reverted): a part the file holds as before one of them and not as the last left it,
  // with the hash it holds; one held as after, or otherwise (theirs merged, or written since), and an
  // instance the file no longer has, or has twice, are no one's to ask of.
  {
    const partsOf = (source) => instrument(source).map.units.find((unit) => unit.blockId === "rows-a").parts;
    const opened = partsOf(SOURCE);
    const written = send(SOURCE, { source: { rows: NEW } }).text;
    const after = partsOf(written);
    const answer = (current, parts = { rows: { before: [opened.rows], after: after.rows } }) => revertedParts({ current, instances: [{ key: 7, id: "rows-a", parts }] });
    const asked = (...args) => answer(...args).map(({ markup, ...entry }) => entry);
    assert.deepEqual(asked(SOURCE), [{ key: 7, parts: { rows: opened.rows } }], "the file as before the write: the part put back, with the hash the file holds");
    const instanceOf = (source) => source.slice(source.indexOf("<div class=rows"), source.indexOf("</div  >") + "</div  >".length);
    assert.equal(answer(SOURCE)[0].markup, instanceOf(SOURCE), "and all of the instance as the file holds it");
    assert.deepEqual(asked(SOURCE.replace("题&nbsp;目", "题目（AI）")), [{ key: 7, parts: { rows: opened.rows } }], "whatever else of the instance the writer changed");
    assert.deepEqual(asked(written), [], "as after: the reader's");
    assert.deepEqual(asked(SOURCE.replace("<td>二</td>", "<td>二（AI）</td>")), [], "changed otherwise: theirs");
    assert.deepEqual(asked(written.replace("<td>二</td>", "<td>二（AI）</td>")), [], "the reader's merged with theirs: theirs");
    const instance = SOURCE.slice(SOURCE.indexOf("  <div class=rows"), SOURCE.indexOf("  <p>后面</p>"));
    assert.deepEqual(asked(SOURCE.replace(instance, "")), [], "an instance the file no longer has");
    assert.deepEqual(asked(SOURCE.replace(instance, `${instance}${instance}`)), [], "nor one it has twice");
    // Each write that still counts: a part as before a later write is put back too.
    const twice = send(written, { source: { rows: "<tbody><tr><td>三</td></tr></tbody>" } }, { hash: commitHash(written) }).text;
    const chain = { rows: { before: [opened.rows, after.rows], after: partsOf(twice).rows } };
    assert.deepEqual(asked(written, chain), [{ key: 7, parts: { rows: after.rows } }], "as before the second write");
    assert.deepEqual(asked(SOURCE, chain), [{ key: 7, parts: { rows: opened.rows } }], "as before the first");
    assert.deepEqual(asked(twice, chain), [], "as the last left it");
    // The id dropped (a file written from what was read before the page gave the instance one): the one
    // instance carrying no id the page knows that holds a part as before a write of the page's, changed by
    // the writer besides or not; two such, or one carrying an id of the page's other blocks, are no answer.
    const bare = SOURCE.replace(' data-block-id="rows-a"', "");
    const unnamed = (current, pageIds = ["rows-a", "rows-b"]) => revertedParts({ current, instances: [{ key: 7, id: "rows-a", parts: { rows: { before: [opened.rows], after: after.rows } } }], pageIds }).map(({ markup, ...entry }) => entry);
    assert.deepEqual(unnamed(bare), [{ key: 7, parts: { rows: opened.rows } }], "found by the part it holds");
    assert.deepEqual(unnamed(bare.replace("题&nbsp;目", "题目（AI）")), [{ key: 7, parts: { rows: opened.rows } }], "whatever else of it the writer changed");
    const another = instanceOf(SOURCE).replace('data-block-id="rows-a"', 'data-block-id="rows-b"');
    assert.deepEqual(unnamed(SOURCE.replace(instanceOf(SOURCE), another)), [], "not one that is another block of the page's");
    assert.deepEqual(unnamed(SOURCE.replace(instanceOf(SOURCE), another), ["rows-a"]), [{ key: 7, parts: { rows: opened.rows } }], "one carrying an id the page does not know is");
    assert.deepEqual(unnamed(bare.replace(instanceOf(bare), `${instanceOf(bare)}\r\n  ${instanceOf(bare)}`)), [], "nor one of two");
    assert.deepEqual(unnamed(written.replace(' data-block-id="rows-a"', "")), [], "nor one holding the part as the page's last write left it");
    // A write named by the id such a file dropped (恢复我的) goes to the one instance with no id whose parts are
    // all as the page says, which gets an id again (that one, where it is one the page could have given); to
    // none where they are otherwise.
    const regiven = send(bare, { source: { rows: NEW }, parts: { rows: opened.rows } });
    assert.ok(status(regiven).status === "applied" && regiven.text.includes(NEW) && /data-doc-component='local\/rows'\s+data-block-id="[a-z0-9]{8}"/.test(regiven.text), `${JSON.stringify(status(regiven))} ${regiven.text}`);
    assert.equal(status(send(bare, { source: { rows: NEW }, parts: { rows: after.rows } })).reason, "missing", "where its part is otherwise");
    // What says nothing it can be asked of, as a page of an earlier Gallery or a broken one sends it.
    for (const entry of [{ key: 1, id: "rows-a" }, { key: 2, id: "rows-a", parts: { rows: { after: after.rows } } }, { key: 3, id: "rows-a", parts: { rows: null } }, { key: 4, parts: { rows: { before: [opened.rows] } } }, { id: "rows-a", parts: { rows: { before: [opened.rows] } } }, null, "x"]) {
      assert.deepEqual(revertedParts({ current: SOURCE, instances: [entry] }), [], JSON.stringify(entry));
    }
    assert.deepEqual(revertedParts({ current: SOURCE, instances: [{ key: 5, id: "rows-a", parts: { title: { before: ["x"] }, none: { before: [opened.rows] } } }] }), [], "a part it has not, or holds otherwise");
  }

  // The page's side: the baseline, what it notices and the operation it sends, against the server's.
  {
    const studio = (source) => {
      const { html, map } = instrument(source);
      const { document } = new JSDOM(html).window;
      const baselines = new Map();
      for (const block of map.blocks) baselines.set(block.id, prepareBlock(document.querySelector(`[data-ge-block="${block.id}"]`), block));
      const state = { document, part: document.querySelector("table"), file: source, definition: rows.definition, opening: source };
      // What the page object says of the parts of an instance, on the page and in what the file wrote whole.
      const held = (instance) => ({ rows: instance.querySelector("table").innerHTML, ...(instance.querySelector("script") ? { moves: instance.querySelector("script").textContent } : {}) });
      connectPages({ installed: { dataOf: held, dataIn(markup) {
        const template = document.createElement("template");
        template.innerHTML = markup;
        return held(template.content.firstElementChild);
      }, dataMost: DATA_MOST, definitionOf: () => state.definition, together: (instance, names) => (state.together ?? []).filter((group) => group.every((name) => names.includes(name))) } });
      let layout = captureLayout(document, map);
      state.commits = createCommits({ root: document, map, baselines, units: new Map(), boxes: new Map(), getLayout: () => layout, setLayout: (next) => (layout = next) });
      state.commit = ({ between = null, alone = true } = {}) => {
        const built = state.commits.build();
        if (!built) return null;
        between?.();
        const receipt = commitEdits({ current: state.file, ...built.request, opening: state.opening, seal: (text) => text.length });
        state.file = receipt.text;
        return { request: built.request, receipt, ...state.commits.apply(built.pending, receipt, { alone }) };
      };
      return state;
    };
    const FILE = `<!doctype html><html lang="zh"><head><title>t</title></head><body><main class="doc-page" data-doc-id="t"><header class="doc-header"><h1 class="doc-title">t</h1></header>
<p data-block-id="before">前面</p>
<div data-doc-component="local/rows" data-block-id="rows-a"><h3>题</h3><table  ><tbody><tr><td  >一&#20013;</td></tr><tr><td>二</td></tr></tbody></table></div>
</main></body></html>`;
    const firstCell = (state, words) => { state.part.querySelector("td").textContent = words; };

    // No change, no operation, however the file spells what the page holds.
    let s = studio(FILE);
    assert.equal(s.commits.build(), null, "opened, nothing to send");
    s.document.querySelector("h3").textContent = "新题";
    let sent = s.commit();
    assert.deepEqual(sent.request.units, [], "a word of a text part is no write of a data part");
    assert.ok(s.file.includes("<td  >一&#20013;</td>"), "and leaves it as the file spells it");
    assert.equal(s.commits.build(), null, "and nothing waits");

    // A part changed: the operation, its hash and its stamp; the file; then nothing waits.
    firstCell(s, "改");
    sent = s.commit();
    const [op] = sent.request.units;
    assert.deepEqual(Object.keys(op).sort(), ["definition", "hash", "key", "parts", "source", "unit"], JSON.stringify(op));
    assert.deepEqual([op.source, op.definition, op.parts], [{ rows: s.part.innerHTML }, rows.definition, { rows: instrument(FILE).map.units.find((unit) => unit.blockId === "rows-a").parts.rows }]);
    assert.equal(sent.receipt.units[0].status, "applied");
    assert.ok(s.file.includes("<table  ><tbody><tr><td>改</td></tr>"), s.file);
    assert.equal(s.commits.build(), null, "the part as it went is what it is compared with from then on");

    // What changes while a commit is on its way goes with the next.
    firstCell(s, "再改");
    s.commit({ between: () => firstCell(s, "又改") });
    assert.ok(s.file.includes("<td>再改</td>"));
    assert.equal(s.commits.counts().waiting, 1, "the change since the commit was built waits");
    s.commit();
    assert.ok(s.file.includes("<td>又改</td>"));

    // A part put back as it was, what an undo does: nothing to send, or the part as it stood.
    const stood = s.part.innerHTML;
    firstCell(s, "片刻");
    s.part.innerHTML = stood;
    assert.equal(s.commits.build(), null, "changed and put back before any commit: nothing");

    // The file changed under it: the conflict any unit has, held; what the reader says decides.
    s = studio(FILE);
    s.file = s.file.replace("二", "二改");
    firstCell(s, "我的");
    sent = s.commit();
    assert.deepEqual([sent.conflicts.length, sent.conflicts[0].reason, sent.conflicts[0].kind], [1, "changed", "unit"]);
    assert.match(sent.conflicts[0].mine, /我的/, "the reader's version, to read and copy");
    assert.equal(s.commits.build(), null, "held, nothing goes");
    s.commits.resolve(sent.conflicts[0].key, "force");
    sent = s.commit();
    assert.equal(sent.receipt.units[0].status, "applied", "仍然调整 writes what the page holds");
    assert.ok(s.file.includes("<td>我的</td>"), s.file);
    // The reader's word was for that write: the next one is held to what the page saw, as any is.
    s.file = s.file.replace("<td>二</td>", "<td>二再改</td>");
    firstCell(s, "我的又一次");
    sent = s.commit();
    assert.ok(!("force" in sent.request.units[0]), "it goes without the reader's word");
    assert.deepEqual([sent.conflicts.length, sent.conflicts[0]?.reason], [1, "changed"], JSON.stringify(sent.receipt.units));

    // Moved while its write waits on the card, words written elsewhere meanwhile: the words go, the move waits
    // with the rest of the instance, and 仍然调整 sends both.
    s = studio(FILE.replace("</main>", '<p data-block-id="after">后面</p>\n</main>'));
    s.file = s.file.replace("二", "二改");
    firstCell(s, "我的");
    const held = s.commit({ alone: false }).conflicts[0].key;
    s.document.querySelector('[data-block-id="after"]').after(s.document.querySelector("[data-doc-component]"));
    s.document.querySelector('[data-block-id="before"]').textContent = "前面，改了";
    sent = s.commit({ alone: false });
    assert.ok(sent.receipt.texts[0]?.status === "applied" && sent.request.units.length === 0, JSON.stringify(sent.request.units));
    s.commits.resolve(held, "force");
    sent = s.commit({ alone: false });
    assert.deepEqual(sent.request.units.map((op) => Object.keys(op).filter((name) => ["source", "move"].includes(name)).join()).sort(), ["move", "source"], JSON.stringify(sent.request.units));
    assert.ok(sent.receipt.units.every((entry) => entry.status === "applied") && s.file.indexOf("data-doc-component") > s.file.indexOf("后面") && s.file.includes("<td>我的</td>"), s.file);
    assert.equal(s.commits.build(), null, "and nothing waits");

    // The reader's word is for the write the card was about, and has done its work once that went in: the
    // move made while it waited carries none of it, and its place gone (the paragraph it went after deleted)
    // it goes again by itself, the write gone in all the same (`forced`: what the page then folds its undo by).
    s = studio(FILE.replace("</main>", '<p data-block-id="after">后面</p>\n</main>'));
    s.file = s.file.replace("二", "二改");
    firstCell(s, "我的");
    const word = s.commit({ alone: false }).conflicts[0].key;
    s.document.querySelector('[data-block-id="after"]').after(s.document.querySelector("[data-doc-component]"));
    s.commits.resolve(word, "force");
    sent = s.commit({ alone: false, between: () => { s.file = s.file.replace('<p data-block-id="after">后面</p>\n', ""); } });
    const instanceUnit = Number(s.document.querySelector("[data-doc-component]").getAttribute("data-ge-unit"));
    assert.deepEqual(sent.request.units.map((op) => [Object.keys(op).find((name) => ["source", "move"].includes(name)), Boolean(op.force)]).sort(), [["move", false], ["source", true]], JSON.stringify(sent.request.units));
    assert.deepEqual([sent.receipt.units.map((entry) => entry.reason ?? entry.status).sort(), sent.forced], [["applied", "position"], [instanceUnit]], JSON.stringify(sent.receipt.units));

    // Deleted while its write waits on the card, the write given up (保留 Agent 的), the deletion then refused for
    // someone else's change and made anyway (仍然删除): once it went in, nothing of the instance waits, and no
    // commit sends its deletion again (fuzz --instances --agent, seed 4036: sent without end, never saved).
    s = studio(FILE);
    s.file = s.file.replace("二", "二改");
    firstCell(s, "我的");
    const given = s.commit({ alone: false }).conflicts[0].key;
    s.document.querySelector("[data-doc-component]").remove();
    assert.deepEqual(s.commit({ alone: false })?.request.units ?? [], [], "its deletion waits with its write");
    s.commits.resolve(given, "discard");
    sent = s.commit({ alone: false });
    assert.deepEqual([sent.request.units.map((op) => Boolean(op.remove)), sent.conflicts[0]?.reason], [[true], "changed"], JSON.stringify(sent.request.units));
    s.commits.resolve(sent.conflicts[0].key, "force");
    sent = s.commit({ alone: false });
    assert.ok(sent.receipt.units[0]?.status === "applied" && !s.file.includes("rows-a"), JSON.stringify(sent.receipt.units));
    assert.equal(s.commits.build(), null, "and nothing waits");

    // In a section deleted whole while that card stands, the deletion refused for the Agent's change of it: 保留 Agent
    // 的 on the instance's card sends nothing of the section, whose blocks wait off the page with its deletion,
    // and 仍然删除 then takes it out at once.
    s = studio(FILE.replace('<p data-block-id="before">前面</p>', '<p data-block-id="before">前面</p>\n<section class="doc-section" data-block-id="sec-a"><h2 data-block-id="sec-h">节</h2>').replace("</div>\n</main>", '</div>\n<p data-block-id="in-a">里</p></section>\n</main>'));
    s.file = s.file.replace("二", "二改");
    firstCell(s, "我的");
    const instanceCard = s.commit({ alone: false }).conflicts[0].key;
    s.document.querySelector("section").remove();
    const sectionCard = s.commit({ alone: false }).conflicts[0];
    assert.equal(sectionCard?.reason, "changed");
    const standing = s.file;
    s.commits.resolve(instanceCard, "discard");
    assert.ok(s.commit({ alone: false }) === null && s.file === standing, `nothing of the section goes while its card stands: ${s.file}`);
    s.commits.resolve(sectionCard.key, "force");
    sent = s.commit({ alone: false });
    assert.ok(sent.receipt.units.every((entry) => entry.status === "applied") && !s.file.includes("sec-a") && !s.file.includes("rows-a"), JSON.stringify(sent.receipt.units));
    assert.equal(s.commits.build(), null, "and nothing waits");

    // Written again by someone else while the card stood: 仍然调整 writes over what the reader was shown and
    // nothing since, so it asks again, showing what the file holds now; then it goes.
    s = studio(FILE);
    s.file = s.file.replace("二", "二改");
    firstCell(s, "我的");
    sent = s.commit();
    s.file = s.file.replace("二改", "二又改");
    s.commits.resolve(sent.conflicts[0].key, "force");
    sent = s.commit();
    assert.deepEqual([sent.conflicts.length, sent.conflicts[0]?.reason], [1, "changed"], JSON.stringify(sent.receipt.units));
    assert.ok(s.file.includes("二又改") && !s.file.includes("我的"), "their second write stays");
    assert.match(sent.conflicts[0].theirs.rows, /二又改/, "and the card shows it");
    s.commits.resolve(sent.conflicts[0].key, "force");
    sent = s.commit();
    assert.ok(sent.receipt.units[0].status === "applied" && s.file.includes("<td>我的</td>"), JSON.stringify(sent.receipt.units));

    // Two parts written, someone else having changed one: the other goes in, and the one they changed waits
    // on the card alone; given up, the other stays written, and words typed in the instance meanwhile go
    // as words do. Written by one edit together, both wait.
    const TWO = FILE.replace("</table></div>", '</table><script type="application/json">{"moves":0}</script></div>');
    const both = (state) => {
      firstCell(state, "拖过");
      state.document.querySelector("script").textContent = '{"moves":1}';
    };
    s = studio(TWO);
    s.file = s.file.replace('{"moves":0}', '{"moves":5}');
    both(s);
    sent = s.commit({ alone: false });
    assert.deepEqual([sent.conflicts.length, sent.conflicts[0]?.reason, Object.keys(sent.conflicts[0]?.change.source ?? {})], [1, "changed", ["moves"]], JSON.stringify(sent.receipt.units));
    assert.ok(s.file.includes("<td>拖过</td>") && s.file.includes('{"moves":5}'), "the part they left goes in, theirs stays");
    assert.equal(s.commits.build(), null, "and nothing goes again while the card stands");
    const card = sent.conflicts[0].key;
    s.document.querySelector("h3").textContent = "题，改了";
    sent = s.commit({ alone: false });
    assert.ok(sent && sent.receipt.texts[0]?.status === "applied" && s.file.includes("<h3>题，改了</h3>"), "words typed in it while it waits go");
    s.commits.resolve(card, "discard");
    s.document.querySelector("h3").textContent = "题，又改了";
    sent = s.commit({ alone: false });
    assert.ok(s.file.includes("<h3>题，又改了</h3>") && s.file.includes("<td>拖过</td>") && s.file.includes('{"moves":5}'), `given up, the write alone: ${s.file}`);
    assert.equal(s.commits.build(), null, "and nothing waits");
    // Written again since: of another part it goes, the part given up staying as the file has it; of that
    // part again, it asks.
    firstCell(s, "又拖过");
    sent = s.commit({ alone: false });
    assert.ok(sent && sent.request.units.length === 1 && Object.keys(sent.request.units[0].source).join() === "rows" && sent.receipt.units[0].status === "applied", JSON.stringify(sent?.request.units));
    assert.ok(s.file.includes("<td>又拖过</td>") && s.file.includes('{"moves":5}'), s.file);
    s.document.querySelector("script").textContent = '{"moves":2}';
    sent = s.commit({ alone: false });
    assert.deepEqual(sent?.conflicts.map((entry) => [entry.reason, Object.keys(entry.change.source).join()]), [["changed", "moves"]], "and the part given up, written anew, asks");
    s = studio(TWO);
    s.together = [["rows", "moves"]];
    s.file = s.file.replace('{"moves":0}', '{"moves":5}');
    both(s);
    sent = s.commit({ alone: false });
    assert.deepEqual([sent.conflicts.length, Object.keys(sent.conflicts[0]?.change.source ?? {}).sort()], [1, ["moves", "rows"]], JSON.stringify(sent.receipt.units));
    assert.ok(!s.file.includes("拖过"), "written together, neither goes");
    // Past what one commit carries, parts written together wait whole for the next, never one without the other.
    s = studio(TWO.replace(/<div data-doc-component[\s\S]*<\/div>/, (instance) => `${instance}\n${instance.replace("rows-a", "rows-b")}`));
    s.together = [["rows", "moves"]];
    const [alone, paired] = s.document.querySelectorAll("[data-doc-component]");
    const words = (share) => "多".repeat(Math.ceil((DATA_MOST * share) / 3)); // three bytes each in UTF-8
    alone.querySelector("td").textContent = words(0.5);
    paired.querySelector("td").textContent = words(0.3);
    paired.querySelector("script").textContent = `{"moves":1,"note":"${words(0.3)}"}`;
    sent = s.commit();
    assert.deepEqual(sent.request.units.map((op) => Object.keys(op.source)), [["rows"]], "the first write, and the two written together wait");
    sent = s.commit();
    assert.deepEqual(sent.request.units.map((op) => [Object.keys(op.source).sort(), op.together]), [[["moves", "rows"], [["rows", "moves"]]]], "then go in one commit, said to be written together");
    assert.ok(sent.receipt.units[0].status === "applied" && s.commits.build() === null, "and nothing waits");
    // Another part written after one was held (commits that went one by one, the page offline): it goes,
    // the held one waiting; refused too, it joins the one card of the instance.
    s = studio(TWO);
    s.file = s.file.replace("<td>二</td>", "<td>二（AI）</td>");
    firstCell(s, "拖过");
    assert.deepEqual(s.commit({ alone: false }).conflicts.map((entry) => Object.keys(entry.change.source)), [["rows"]], "the drag held");
    s.document.querySelector("script").textContent = '{"moves":1}';
    sent = s.commit({ alone: false });
    assert.ok(sent && Object.keys(sent.request.units[0].source).join() === "moves" && sent.receipt.units[0].status === "applied" && s.file.includes('{"moves":1}') && !s.file.includes("拖过"), `the count goes, the drag waits: ${JSON.stringify(sent?.request.units)}`);
    s.file = s.file.replace('{"moves":1}', '{"moves":9}');
    s.document.querySelector("script").textContent = '{"moves":2}';
    sent = s.commit({ alone: false });
    assert.deepEqual([sent.conflicts.length, s.commits.issues.size, Object.keys(s.commits.issues.values().next().value.change.source).sort()], [1, 1, ["moves", "rows"]], "refused too, one card holding both");

    // The file changed under it, then a word of the page's own in the same instance went in: what the file
    // says of the instance after that commit is someone else's change too, not what the page saw, so its
    // next write asks the reader.
    s = studio(FILE);
    s.file = s.file.replace("<td>二</td>", "<td>二（AI）</td>");
    s.document.querySelector("h3").textContent = "新题";
    sent = s.commit({ alone: false });
    assert.equal(sent.receipt.texts[0].status, "applied", "the words go in");
    firstCell(s, "我的");
    sent = s.commit({ alone: false });
    assert.deepEqual([sent.conflicts.length, sent.conflicts[0]?.reason], [1, "changed"], JSON.stringify(sent.receipt.units));
    assert.ok(s.file.includes("<td>二（AI）</td>") && s.file.includes("<h3>新题</h3>"), "and both sides stay");

    // Someone else changed its words, and the page writes its part: both go in, and the page's next write too,
    // the hash of the part being the file's once the page wrote it.
    s = studio(FILE);
    s.file = s.file.replace("<h3>题</h3>", "<h3>题（AI）</h3>");
    firstCell(s, "我的");
    sent = s.commit({ alone: false });
    assert.equal(sent.receipt.units[0].status, "applied", JSON.stringify(sent.receipt.units));
    assert.ok(s.file.includes("<h3>题（AI）</h3>") && s.file.includes("<td>我的</td>"), s.file);
    firstCell(s, "又是我的");
    sent = s.commit({ alone: false });
    assert.ok(sent.receipt.units[0].status === "applied" && s.file.includes("<td>又是我的</td>") && s.file.includes("<h3>题（AI）</h3>"), JSON.stringify(sent.receipt.units));

    // What a component wrote that went in is kept for the revert check (written): each part by every hash it
    // had before one of the page's writes of it but the one it has again, and the one the last left, the
    // instance by the id it has and what it was when the page opened. An undo is a write like any other: an
    // Agent writing back the file it read before a write, or between it and its undo, is asked of
    // (revertedParts), one it read after the last is not. 恢复我的 writes the part again over the file's hash;
    // 接受 Agent 的 asks of it no more. A page loaded anew asks of what an earlier one kept.
    {
      const PLAIN = FILE.replace("<td  >一&#20013;</td>", "<td>一中</td>").replace("<table  >", "<table>");
      const hashes = (source) => instrument(source).map.units.find((unit) => unit.kind === "installed").parts;
      const unitOf = (state) => Number(state.document.querySelector("[data-doc-component]").getAttribute("data-ge-unit"));
      const asked = (state, current) => revertedParts({ current, instances: state.commits.written(), pageIds: state.commits.pageIds() }).map(({ markup, ...entry }) => entry);
      s = studio(PLAIN);
      const H0 = hashes(PLAIN).rows;
      assert.deepEqual(s.commits.written(), [], "nothing written, nothing kept");
      const opened = s.part.innerHTML;
      firstCell(s, "拖过");
      s.commit();
      const dragged = s.file;
      const H1 = hashes(dragged).rows;
      assert.deepEqual(s.commits.written().map(({ key, id, parts }) => ({ key, id, parts })), [{ key: unitOf(s), id: "rows-a", parts: { rows: { before: [H0], after: H1 } } }], JSON.stringify(s.commits.written()));
      assert.deepEqual(asked(s, PLAIN), [{ key: unitOf(s), parts: { rows: H0 } }], "the file as read before the write: put back");
      assert.deepEqual(asked(s, dragged), [], "as read after it: nothing");
      const draggedPart = s.part.innerHTML;
      s.part.innerHTML = opened; // undone
      s.commit();
      assert.ok(s.file === PLAIN, "the undo writes the part back to the byte");
      assert.deepEqual(s.commits.written()[0].parts.rows, { before: [H1], after: H0 }, "the write undone counts no more, the undo does");
      assert.deepEqual(asked(s, PLAIN), [], "so the file as read before the write asks nothing");
      assert.deepEqual(asked(s, dragged), [{ key: unitOf(s), parts: { rows: H1 } }], "and as read between the write and its undo, the undo was put back");
      s.part.innerHTML = draggedPart; // redone
      s.commit();
      assert.deepEqual(s.commits.written()[0].parts.rows, { before: [H0], after: H1 }, "redone: the undo counts no more");
      // 恢复我的: the next commit writes the part over the hash the file holds of it.
      s.file = PLAIN;
      const [back] = asked(s, s.file);
      s.commits.rewrite(back.key, back.parts, true);
      let sent = s.commit({ alone: false });
      assert.ok(sent && sent.request.units.length === 1 && sent.request.units[0].parts.rows === H0 && sent.receipt.units[0].status === "applied", JSON.stringify(sent?.request.units));
      assert.ok(s.file === dragged && s.commits.build() === null, "the reader's part in the file again, nothing waiting");
      assert.deepEqual([asked(s, s.file), asked(s, PLAIN).length], [[], 1], "and asked of as before");
      // Written again by the Agent since: asked again, as a write over a change of theirs.
      s.file = PLAIN;
      s.commits.rewrite(unitOf(s), asked(s, s.file)[0].parts, true);
      s.file = PLAIN.replace("<td>二</td>", "<td>二（AI）</td>");
      sent = s.commit({ alone: false });
      assert.deepEqual([sent.conflicts.length, sent.conflicts[0]?.reason], [1, "changed"], JSON.stringify(sent.receipt.units));
      // The card standing, the reader undoes the drag under it: that write is refused (the file holds the part
      // as the Agent put it back) and waits on a card of its own. 恢复我的 on the first and 仍然调整 on the
      // second write the part as the page holds it over the file's, which settles it there, and 保留 Agent 的
      // keeps the file's and asks of it no more: either way nothing is asked of the file as it holds it now,
      // so no card comes back.
      for (const choice of ["force", "discard"]) {
        s = studio(PLAIN);
        firstCell(s, "拖过");
        s.commit();
        s.file = PLAIN.replace("<p data-block-id=\"before\">前面</p>", "<p data-block-id=\"before\">前面（AI）</p>"); // what the Agent read before the drag, written back
        const [card] = asked(s, s.file);
        s.part.innerHTML = opened; // undone
        const refused = s.commit({ alone: false });
        assert.deepEqual([refused.conflicts.length, refused.conflicts[0]?.reason], [1, "changed"], JSON.stringify(refused.receipt.units));
        s.commits.rewrite(card.key, card.parts, true);
        s.commits.resolve(refused.conflicts[0].key, choice);
        s.commit({ alone: false });
        assert.ok(hashes(s.file).rows === H0 && s.commits.build() === null, `${choice}: the part as the page holds it, nothing waiting`);
        assert.deepEqual(asked(s, s.file), [], `${choice}: nothing asked of the file as it is, no card again`);
        assert.equal(asked(s, dragged).length, choice === "force" ? 1 : 0, `${choice}: the drag put back over the undo asks, unless the reader kept the file's`);
      }
      // 接受 Agent 的: asked of no more.
      s = studio(PLAIN);
      firstCell(s, "拖过");
      s.commit();
      s.file = PLAIN;
      s.commits.rewrite(unitOf(s), asked(s, s.file)[0].parts, false);
      assert.deepEqual([s.commits.written(), s.commits.build()], [[], null], "nothing kept, nothing sent");
      // Kept across a load: the next page's commits ask of it by the instance's id.
      s = studio(PLAIN);
      firstCell(s, "拖过");
      s.commit();
      const kept = s.commits.written().map(({ id, parts, time }) => ({ id, parts, time }));
      const next = studio(s.file);
      next.commits.carry([...kept, { id: "rows-a" }, { id: "gone", parts: kept[0].parts }, { parts: kept[0].parts }, { id: "rows-a", parts: { rows: { before: "x" } } }, null]);
      assert.deepEqual(next.commits.written().map(({ key, id, parts }) => ({ key, id, parts })), [{ key: unitOf(next), id: "rows-a", parts: kept[0].parts }], "what says nothing it can be asked of is none");
      assert.deepEqual(asked(next, PLAIN), [{ key: unitOf(next), parts: { rows: H0 } }], "asked of in the next load");
      // An instance the reader deleted, or one held for the reader, is not asked of while it is; once the
      // reader has decided, 仍然调整, it is again.
      next.document.querySelector("[data-doc-component]").remove();
      next.commit();
      assert.deepEqual(next.commits.written(), [], "deleted");
      s = studio(PLAIN);
      firstCell(s, "拖过");
      s.commit();
      s.file = s.file.replace("<td>二</td>", "<td>二（AI）</td>");
      firstCell(s, "又拖过");
      const [hold] = s.commit({ alone: false }).conflicts;
      assert.ok(hold);
      assert.deepEqual(s.commits.written(), [], "held");
      s.commits.resolve(hold.key, "force");
      s.commit({ alone: false });
      assert.equal(asked(s, PLAIN).length, 1, "decided: asked of again");

      // one, which a file read before lacks. Asked of all the same, found by the part it holds as before.
      // one, which a file read before lacks. Asked of all the same, found as it was when the page opened.
      const BARE = PLAIN.replace(' data-block-id="rows-a"', "");
      s = studio(BARE);
      firstCell(s, "拖过");
      s.commit();
      const named = instrument(s.file).map.units.find((unit) => unit.kind === "installed").blockId;
      assert.deepEqual(s.commits.written().map(({ id }) => id), [named], s.file);
      assert.deepEqual(asked(s, BARE.replace("<p data-block-id=\"before\">前面</p>", "<p data-block-id=\"before\">前面（AI）</p>")), [{ key: unitOf(s), parts: { rows: H0 } }], "the file read before the drag, written back: asked of");

      // A part the file spells otherwise than the page writes it (a table with no tbody, as an Agent may write
      // one) holding what the page shows puts back nothing the reader would lose: the drag undone, a file read
      // before it is no card (heldOtherwise); one read between the drag and its undo is.
      const SPELLED = PLAIN.replace("<tbody><tr><td>一中</td></tr><tr><td>二</td></tr></tbody>", "<tr><td>一中</td></tr><tr><td>二</td></tr>");
      s = studio(SPELLED);
      const spelled = s.part.innerHTML;
      firstCell(s, "拖过");
      s.commit();
      const between = s.file;
      s.part.innerHTML = spelled; // undone
      s.commit();
      assert.ok(s.file !== SPELLED && s.file.includes("<tbody><tr><td>一中</td>"), `the undo writes the part as the page writes it: ${s.file}`);
      const answered = (current) => revertedParts({ current, instances: s.commits.written(), pageIds: s.commits.pageIds() });
      const [before] = answered(SPELLED);
      assert.ok(before, "the file as read before the drag holds the part as before one of the page's writes");
      assert.deepEqual(s.commits.heldOtherwise(before.key, before.parts, before.markup), {}, "but as the page holds it: nothing put back");
      const [dragBack] = answered(between);
      assert.deepEqual(s.commits.heldOtherwise(dragBack.key, dragBack.parts, dragBack.markup), dragBack.parts, "read between the drag and its undo: the drag put back");
      assert.deepEqual(s.commits.heldOtherwise(dragBack.key, dragBack.parts, null), dragBack.parts, "and with nothing to tell by, asked of");
    }

    // A manifest that changed: refused, given up, and the page told it is to be shown again.
    s = studio(FILE);
    s.definition = "old";
    firstCell(s, "旧的");
    sent = s.commit();
    assert.deepEqual([sent.receipt.units[0].reason, sent.outdated, sent.conflicts.length], ["definition", true, 0], JSON.stringify(sent.receipt.units));
    assert.equal(s.file, FILE, "nothing written");
    assert.equal(s.commits.counts().waiting, 0, "and nothing waits for it: the page can be shown again");
    assert.equal(s.commits.issues.size, 0, "no card: nothing for the reader to decide");

    // What a commit writes from the file's own source (a block put back, a copy) is what the file holds,
    // whatever the page shows: what differs goes with the next, and nothing stands saved that is not.
    const INSTANCE = '<div data-doc-component="local/rows" data-block-id="rows-a"><h3>题</h3><table><tbody><tr><td>一</td></tr><tr><td>二</td></tr></tbody></table></div>';
    const around = (body) => `<!doctype html><html lang="zh"><head><title>t</title></head><body><main class="doc-page" data-doc-id="t"><header class="doc-header"><h1 class="doc-title">t</h1></header>
<p data-block-id="before">前面</p>
${body}
<p data-block-id="after">后面</p>
</main></body></html>`;
    const SECTION = (inside) => `<section data-block-id="sec"><h2 data-block-id="sec-h">标题</h2><p data-block-id="sec-p">段</p>${inside}</section>`;
    const instanceOf = (state) => state.document.querySelector("[data-doc-component]");
    const deleted = (element) => {
      const [box, next] = [element.parentNode, element.nextSibling];
      element.remove();
      return () => box.insertBefore(element, next);
    };
    const cellsIn = (source) => [...source.matchAll(/<tr><td[^>]*>([^<]*)<\/td>/g)].map((found) => found[1]);
    const operations = (sent) => sent.request.units.map((op) => Object.keys(op).filter((key) => ["remove", "insert", "source", "move"].includes(key)).join("+"));
    // All that waits written, however many commits it takes.
    const settled = (state) => {
      for (let times = 0; times < 5 && state.commit(); times += 1);
      assert.equal(state.commits.counts().waiting, 0, "nothing waits");
      return cellsIn(state.file)[0];
    };

    // Written and deleted in one pause: the deletion alone goes, and undone the write goes after what the file puts back.
    s = studio(around(INSTANCE));
    firstCell(s, "改");
    let back = deleted(instanceOf(s));
    sent = s.commit();
    assert.deepEqual(operations(sent), ["remove"], "nothing is written to what goes");
    back();
    sent = s.commit();
    assert.deepEqual(operations(sent), ["insert"], "put back from the file's own source");
    assert.deepEqual(cellsIn(s.file), ["一", "二"], "which holds what the file held");
    assert.equal(s.commits.counts().waiting, 1, "so that the write still waits");
    assert.equal(settled(s), "改", "and goes");

    // Undone twice in one pause: the block put back holds the write, and what is undone of it goes after.
    s = studio(around(INSTANCE));
    firstCell(s, "改");
    s.commit();
    back = deleted(instanceOf(s));
    s.commit();
    back();
    firstCell(s, "一");
    assert.equal(settled(s), "一", "undo of the delete and of the write in one pause");

    // Put back, and written before the commit that puts it back.
    s = studio(around(INSTANCE));
    back = deleted(instanceOf(s));
    s.commit();
    back();
    firstCell(s, "拖了");
    assert.equal(settled(s), "拖了", "a write right after the undo");

    // Undone and written while the deletion is on its way.
    s = studio(around(INSTANCE));
    back = deleted(instanceOf(s));
    s.commit({ between: () => { back(); firstCell(s, "途中"); } });
    assert.equal(settled(s), "途中", "while the deletion was on its way");

    // In a section put back, a write in the same pause.
    s = studio(around(SECTION(INSTANCE)));
    back = deleted(s.document.querySelector("section"));
    s.commit();
    back();
    firstCell(s, "节内");
    assert.equal(settled(s), "节内", "in a section put back");

    // Taken out of a section put back, and written.
    s = studio(around(SECTION(INSTANCE)));
    back = deleted(s.document.querySelector("section"));
    s.commit();
    back();
    firstCell(s, "带出");
    s.document.querySelector("section").before(instanceOf(s));
    assert.equal(settled(s), "带出", "taken out of a section put back");
    assert.ok(s.file.indexOf("data-doc-component") < s.file.indexOf("<section"), "out of it");

    // Put into a section as the commit puts that back: its write is left out as its move is, and goes with it.
    s = studio(around(`${SECTION("")}\n${INSTANCE}`));
    back = deleted(s.document.querySelector("section"));
    s.commit();
    back();
    firstCell(s, "带入");
    s.document.querySelector("section").append(instanceOf(s));
    sent = s.commit();
    assert.deepEqual(operations(sent), ["insert"], "the section first, nothing of what went in it");
    assert.equal(settled(s), "带入", "then what was written in what went in it");
    assert.ok(s.file.indexOf("<section") < s.file.indexOf("data-doc-component"), "in it");

    // A copy is written from what the file has of its original, and what it shows goes after.
    s = studio(around(INSTANCE));
    firstCell(s, "未存");
    const copy = copyOf(instanceOf(s), { editable: true });
    for (const [name, value] of [["data-ge-new", ""], ["data-ge-type", "copy"], ["data-ge-copy", instanceOf(s).getAttribute("data-ge-unit")], ["data-ge-unit-kind", "installed"]]) copy.setAttribute(name, value);
    instanceOf(s).after(copy);
    sent = s.commit();
    assert.deepEqual(operations(sent).sort(), ["insert", "source"], "the copy made and its original written, in one commit");
    assert.deepEqual(cellsIn(s.file).filter((cell) => cell !== "二"), ["未存", "一"], "the copy as the file had its original");
    assert.equal(s.commits.counts().waiting, 1, "so that what it shows waits");
    settled(s);
    assert.deepEqual(cellsIn(s.file).filter((cell) => cell !== "二"), ["未存", "未存"], "and goes");

    // What the file refuses of a manifest gives up that write and nothing else: the unit is where the
    // file has it, so that what is around it goes on being told.
    s = studio(around(`${SECTION("")}\n${INSTANCE}`));
    s.definition = "old";
    firstCell(s, "旧的");
    s.document.querySelector("section").append(instanceOf(s));
    sent = s.commit();
    assert.deepEqual(sent.receipt.units.map((unit) => unit.reason ?? unit.status).sort(), ["applied", "definition"], JSON.stringify(sent.receipt.units));
    assert.equal(s.commits.counts().waiting, 0, "and the write waits for nothing");
    s.document.querySelector("h3").textContent = "新题";
    s.commit();
    s.document.querySelector("section").remove();
    sent = s.commit();
    assert.deepEqual(sent.conflicts, [], "a word in it told the section around it: deleted, it is no one else's change");

    // What the commit wrote whole it knows, with others' changes in the file: put back, it can be deleted again.
    s = studio(around(INSTANCE));
    back = deleted(instanceOf(s));
    s.commit();
    s.file = s.file.replace("后面", "后面（AI）");
    back();
    s.commit({ alone: false });
    deleted(instanceOf(s));
    sent = s.commit({ alone: false });
    assert.deepEqual(sent.conflicts, [], "what it put back is what it deletes");

    // One commit carries what one commit takes (DATA_MOST): the rest goes with the next, by unit and by part.
    const BIG = (word) => `<tbody>${`<tr><td>${word}</td></tr>`.repeat(30000)}</tbody>`;
    s = studio(around(`${INSTANCE}\n${INSTANCE.replace("rows-a", "rows-b")}`));
    const [one, two] = s.document.querySelectorAll("table");
    one.innerHTML = BIG("甲");
    two.innerHTML = BIG("乙");
    sent = s.commit();
    assert.deepEqual(operations(sent), ["source"], "what fits");
    assert.equal(s.commits.counts().waiting, 1, "the other still waits");
    assert.equal(s.commits.buffer().request.units.length, 1, "a page going away keeps that");
    sent = s.commit();
    assert.deepEqual(operations(sent), ["source"], "and goes with the next");
    assert.equal(s.commits.build(), null, "with nothing left");
    assert.ok(s.file.includes(BIG("甲")) && s.file.includes(BIG("乙")), "both in the file");
    s = studio(around(INSTANCE.replace("</table>", '</table><script type="application/json">{"moves":0}</script>')));
    s.part.innerHTML = BIG("甲");
    s.document.querySelector("main script").textContent = `{"moves":"${"乙".repeat(220000)}"}`;
    assert.deepEqual(Object.keys(s.commits.buffer().request.units[0].source), ["rows", "moves"], "what a page going away keeps holds all of it");
    sent = s.commit();
    assert.deepEqual(Object.keys(sent.request.units[0].source), ["rows"], "of one instance too");
    sent = s.commit();
    assert.deepEqual(Object.keys(sent.request.units[0].source), ["moves"], "its other part the next");
    assert.equal(s.commits.build(), null);
    assert.ok(s.file.includes(BIG("甲")) && s.file.includes('{"moves":"乙'), "each in the file");

    // What a page left that the file does not take is listed, the reader's version of the part with it;
    // what it gives up for a manifest that changed is no one's to decide, and the next page says so.
    const storage = (local) => ({ get: (key) => local.get(key) ?? null, set: (key, value) => void local.set(key, value), remove: (key) => void local.delete(key) });
    s = studio(around(INSTANCE));
    firstCell(s, "留下的");
    const { request } = s.commits.buffer();
    const realFetch = globalThis.fetch;
    try {
      const refusal = (reason) => ({ ok: true, version: "v", texts: [], units: [{ key: request.units[0].key, status: "conflict", reason }] });
      for (const [answer, listed, outdated] of [[refusal("changed"), true, false], [{ ok: false, reason: "body" }, true, false], [refusal("definition"), false, true]]) {
        globalThis.fetch = async () => ({ status: 200, json: async () => answer });
        const local = new Map([[pendingKey("t", "gone"), JSON.stringify({ v: 2, time: 1, sent: null, request: { ...request, known: null }, keep: [] })]]);
        const taken = await recover({ map: { slug: "t", version: "v", token: "t" }, storage: storage(local), keys: [pendingKey("t", "gone")] });
        assert.equal(readLost(storage(local), "t").some((item) => item.html?.includes("留下的")), listed, JSON.stringify(answer));
        assert.equal(taken.outdated, outdated, JSON.stringify(answer));
      }
    } finally {
      globalThis.fetch = realFetch;
    }
    connectPages({});
  }

  // The page's autosave over its commits (page-harness.mjs): someone else's write heard, what it put back
  // of what a component wrote is held for the reader and the page waits; the crash buffer keeps the
  // reader's version, the block to copy; 恢复我的 writes it again beside the Agent's change and the page is
  // shown again, taking what it kept into its next load, which asks of it there; 接受 Agent 的 keeps the file
  // and asks of it no more. What an earlier Gallery kept there (texts alone) reads as it did.
  {
    const { advance, browser, open: openPage, play, server, stop, storage: kept } = await import("./page-harness.mjs");
    connectPages({ installed: { dataOf: (instance) => ({ rows: instance.querySelector("table").innerHTML }), dataIn: () => null, dataMost: DATA_MOST, definitionOf: () => rows.definition, together: () => [] } });
    play();
    try {
      const PAGE = `<!doctype html><html lang="zh"><head><title>t</title></head><body><main class="doc-page" data-doc-id="t"><header class="doc-header"><h1 class="doc-title">t</h1></header>
<p data-block-id="before">前面</p>
<div data-doc-component="local/rows" data-block-id="rows-a"><h3>题</h3><table><tbody><tr><td>一</td></tr><tr><td>二</td></tr></tbody></table></div>
</main></body></html>`;
      const JOURNAL = "gallery-edit:demo:journal";
      const journalOf = (raw) => Object.values(JSON.parse(raw ?? "{}")?.tabs ?? {}).flatMap((departure) => departure.entries); // { v, tabs: { <tab>: { known, entries } } } in localStorage
      const unitOf = (page) => Number(page.document.querySelector("[data-doc-component]").getAttribute("data-ge-unit"));
      const opened = instrument(PAGE).map.units.find((unit) => unit.blockId === "rows-a").parts.rows;
      const local = kept(); // the page's localStorage, over its loads (the journal is there)
      const net = server(PAGE);
      browser.reloads = 0;
      let t = openPage(net, local);
      t.document.querySelector("td").textContent = "拖过";
      t.change(true);
      await advance(100);
      assert.ok(net.file.includes("<td>拖过</td>"), net.file);
      // The Agent writes back the file it read before the write, with a change of its own.
      net.file = PAGE.replace("<h3>题</h3>", "<h3>题（AI）</h3>");
      t.autosave.heard(hashOf(net.file));
      await advance(5000);
      assert.deepEqual(t.reverts.map(({ key, unit, written }) => [key, unit, written]), [[`s${unitOf(t)}`, unitOf(t), { rows: opened }]], JSON.stringify(t.reverts));
      assert.deepEqual([browser.reloads, t.autosave.state.held], [0, 1], "held for the reader, the page waiting");
      const [lost] = t.buffer().keep;
      assert.ok(lost.why === "reverted" && lost.unit === "rows-a" && lost.parts.rows.includes("<td>拖过</td>"), `the crash buffer keeps the block holding the reader's: ${JSON.stringify(lost)}`);
      assert.ok(await t.autosave.decide(`s${unitOf(t)}`, true), "恢复我的");
      await advance(5000);
      assert.ok(net.file.includes("<td>拖过</td>") && net.file.includes("<h3>题（AI）</h3>"), `written again beside the Agent's change: ${net.file}`);
      assert.equal(browser.reloads, 1, "then the page is shown again");
      const journal = journalOf(local.get(JOURNAL));
      assert.deepEqual(journal.map((entry) => [entry.instance, entry.parts?.rows?.before]), [["rows-a", [opened]]], JSON.stringify(journal));
      // The next load asks of it, and 接受 Agent 的 there keeps the file.
      t.autosave.close();
      t = openPage(net, local);
      net.file = PAGE;
      t.autosave.heard(hashOf(net.file));
      await advance(5000);
      assert.deepEqual(t.reverts.map(({ written }) => written), [{ rows: opened }], "asked of in the next load");
      assert.ok(await t.autosave.decide(`s${unitOf(t)}`, false), "接受 Agent 的");
      await advance(5000);
      assert.ok(net.file === PAGE && browser.reloads === 2 && !journalOf(local.get(JOURNAL)).some((entry) => entry.instance), "the file kept, the page shown again, nothing asked of any more");
      t.autosave.close();
      // An earlier Gallery's entries, and what says nothing: none of it breaks the page, its texts asked of
      // under keys of their own, though an earlier load named its block as this one names another.
      const title = `b${instrument(PAGE).map.blocks.find((block) => block.inner === "题").id}`;
      const old = kept();
      old.set(JOURNAL, JSON.stringify([{ key: title, block: { unit: { key: 0, id: "before" }, self: true, before: "前面（人）" }, original: "前面", mine: "前面（人）", time: Date.now() }, null, "x", { instance: 3, time: Date.now() }, { instance: "rows-a", parts: "x", time: Date.now() }]));
      t = openPage(net, kept(), { session: old });
      assert.deepEqual(t.commits.written(), [], "nothing of a component's");
      t.document.querySelector("h3").textContent = "题（读者）";
      t.change(true);
      await advance(100);
      net.file = PAGE.replace('<p data-block-id="before">前面</p>', '<p data-block-id="before">前面</p>\n<p>AI 的一段</p>');
      t.autosave.heard(hashOf(net.file));
      await advance(5000);
      const asked = net.posts.filter((post) => post.url.includes("/reverted")).at(-1).body;
      assert.deepEqual([asked.texts.map((entry) => entry.key), asked.instances], [["c0", title], []], JSON.stringify(asked));
      assert.deepEqual(t.reverts.map((entry) => entry.theirs).sort(), ["前面", "题"], "both put back, each held");
      t.autosave.close();
      // An instance written with no id, as an Agent writes one, the reader's drag saved and the page reloaded
      // by the reader (pagehide, not the page's own showing again): the next load asks of the drag, the
      // instance found as that load opened on it in a file written back from what was read before.
      const BARE = PAGE.replace(' data-block-id="rows-a"', "");
      const later = kept();
      const shared = server(BARE);
      browser.reloads = 0;
      t = openPage(shared, later);
      t.document.querySelector("td").textContent = "拖过";
      t.change(true);
      await advance(100);
      assert.ok(shared.file.includes("<td>拖过</td>") && /data-doc-component="local\/rows" data-block-id="[a-z0-9]{8}"/.test(shared.file), shared.file);
      t.autosave.leave();
      t.autosave.close();
      t = openPage(shared, later);
      shared.file = BARE.replace("<h3>题</h3>", "<h3>题（AI）</h3>");
      t.autosave.heard(hashOf(shared.file));
      await advance(5000);
      assert.deepEqual([t.reverts.map(({ written }) => written), browser.reloads], [[{ rows: opened }], 0], JSON.stringify(t.reverts));
      assert.ok(await t.autosave.decide(t.reverts[0].key, true), "恢复我的");
      await advance(5000);
      assert.ok(shared.file.includes("<td>拖过</td>") && shared.file.includes("<h3>题（AI）</h3>") && browser.reloads === 1, `the drag written again beside the Agent's change, the page shown again: ${shared.file}`);
      t.autosave.close();
    } finally {
      stop();
      connectPages({});
    }
  }

  // The parts one edit wrote together are said on the instance (installed/page.mjs `together`), so that a
  // page taking up what one that is gone left, which has its body and nothing else of it, finds them too.
  {
    const dom = new JSDOM(`<!doctype html><body><main><div data-doc-component="local/rows" data-block-id="rows-a"><h3>题</h3><table><tbody><tr><td>一</td></tr></tbody></table><script type="application/json">{"moves":0}</script></div></main></body>`);
    const names = ["document", "window", "MutationObserver", "Node"];
    const before = Object.fromEntries(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    Object.assign(globalThis, { document: dom.window.document, window: dom.window, MutationObserver: dom.window.MutationObserver, Node: dom.window.Node });
    try {
      const { create } = await import("../../src/editor/components/installed/page.mjs");
      const object = create({ map: { components: [] }, newParagraph() {}, active: () => true, sourceStep: () => ({}), nextStep: () => null });
      object.install();
      const instance = dom.window.document.querySelector("[data-doc-component]");
      const parts = [{ name: "rows", part: instance.querySelector("table") }, { name: "moves", part: instance.querySelector("script") }];
      const run = (drafts) => {
        drafts.rows.querySelector("td").textContent = "拖过";
        drafts.moves.textContent = '{"moves":1}';
        return true;
      };
      const edit = new dom.window.CustomEvent("doc-component-edit", { bubbles: true, cancelable: true, detail: { parts, run } });
      instance.dispatchEvent(edit);
      assert.ok(edit.defaultPrevented && instance.querySelector("td").textContent === "拖过", "written");
      const left = new JSDOM(dom.serialize()).window.document.querySelector("[data-doc-component]");
      assert.deepEqual(object.together(left, ["moves", "rows"]), [["moves", "rows"]], "the next page's copy of the instance says they went together");
    } finally {
      for (const name of names) {
        if (before[name]) Object.defineProperty(globalThis, name, before[name]);
        else delete globalThis[name];
      }
    }
  }
} finally {
  forgetCatalog(root);
  if (previous === undefined) delete process.env.GALLERY_DEFAULT_WORKSPACE;
  else process.env.GALLERY_DEFAULT_WORKSPACE = previous;
  fs.rmSync(root, { recursive: true, force: true });
}
// JSON as a component's write keeps it laid out (src/shared/json-layout.mjs, the one copy the kit's
// context.editJSON writes by and gallery block check reads by): on one line where it was on one,
// else a line an entry, what holds values alone on one line; what JSON cannot hold left out as
// JSON.stringify leaves it; what could end a script escaped.
{
  const text = "\n    {\n      \"scale\": 5,\n      \"options\": [\n        { \"name\": \"甲\", \"scores\": [4, 3] }\n      ]\n    }\n  ";
  const value = JSON.parse(text);
  assert.equal(jsonIn(text, value), text, "laid out as it writes it, it writes it again as it is");
  value.options[0].scores[1] = 5;
  assert.equal(jsonIn(text, value), text.replace("[4, 3]", "[4, 5]"), "a value changed: its line alone");
  assert.equal(jsonIn(' {"a":1} ', { a: 2, b: [1] }), ' {"a":2,"b":[1]} ', "on one line where it was on one, the blanks around it kept");
  assert.equal(laidOut({ a: [[1, 2], [3]], b: { c: 1 } }, ""), '{\n  "a": [[1, 2], [3]],\n  "b": { "c": 1 }\n}', "lists of values and objects of values on one line each");
  assert.equal(laidOut({ when: new Date(Date.UTC(2026, 10, 7)), gone: undefined, run() {} }, ""), '{ "when": "2026-11-07T00:00:00.000Z" }', "a date as its JSON, what JSON cannot hold left out");
  assert.equal(jsonIn("{}", { note: "</script><!--" }), '{"note":"<\\/script>\\u003c!--"}', "what could end a script escaped");
  // The check's note on a write that lays a part out anew: whether it is context.editJSON's (what the
  // file held laid out otherwise) or a layout of the component's own.
  const written = '\n  {\n    "picks": ["甲", "乙"]\n  }\n';
  const asEditJSON = jsonIn(written, { picks: ["甲", "乙", "丙"] });
  assert.deepEqual([editJSONWrote(written, asEditJSON), editJSONWrote(written, '\n  {"picks":["甲","乙","丙"]}\n'), editJSONWrote("<tr></tr>", "<tr></tr>")], [true, false, false], "editJSON's write told from one of the component's own, and from no JSON");
}

// A to-do of a document checked from another page (workspace.setTodo: src/editor/todos.mjs,
// the edit service's setTodos, POST /__gallery/workspace/todo): found by its block id; without one, by its
// place among the items of its words while the file is the version its ref was read from, else as the one
// item of its words under its headings (several refused, ambiguous); its words changed or gone refused
// (changed); written as one commit of the reader's, an attribute op each, giving the item an id; the same
// item asked twice in one write the last winning; nothing written where nothing changes. Then the route
// (the token's, a document at the root) and the page's writer (todo-writes.mjs: a document's checks asked
// while one write of it is out going together in the next).
{
  const space = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-todos-"));
  const page = (body) => `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>计划</title></head>
<body>
<main class="doc-page" data-doc-id="plan">
  <header class="doc-header"><h1 class="doc-title">计划</h1></header>
${body}
</main>
</body>
</html>
`;
  const write = (slug, body) => {
    fs.mkdirSync(path.join(space, slug), { recursive: true });
    fs.writeFileSync(path.join(space, slug, "doc.html"), page(body));
    fs.writeFileSync(path.join(space, slug, "doc.json"), JSON.stringify({ title: "计划" }));
  };
  const file = path.join(space, "plan", "doc.html");
  const items = () => [...fs.readFileSync(file, "utf8").matchAll(/<li([^>]*)>([^<]*)</g)].map(([, attrs, words]) => `${words}${/data-checked/.test(attrs) ? " ✓" : ""}${/data-block-id/.test(attrs) ? " #" : ""}`);
  let next = 0;
  const edits = createEditService({ reportsDirectory: space, ids: () => `id${++next}` });
  const index = createIndex({ root: space, read: readOf(edits) });
  const set = async (asked) => {
    const [status, answer] = await edits.setTodos("plan", asked);
    assert.equal(status, 200, JSON.stringify(answer));
    return answer;
  };
  let server = null;
  try {
    write("plan", `  <h2>本周</h2>
  <ul class="doc-todo">
    <li>写周报</li>
    <li data-block-id="milk0001">买牛奶</li>
    <li>读书</li>
    <li>读书</li>
  </ul>`);
    const refs = (await index.query("todos", {}))[1].data.map((todo) => todo.ref);
    let answer = await set([{ ref: refs[0], done: true }, { ref: refs[1], done: true }, { ref: refs[3], done: true }]);
    assert.deepEqual(answer.results, [{ ok: true, changed: true, block: "id1" }, { ok: true, changed: true, block: "milk0001" }, { ok: true, changed: true, block: "id2" }], "each checked, an item without an id given one (the second 读书 by its place: the file is the version its ref was read from)");
    assert.equal(answer.wrote, true);
    assert.deepEqual(items(), ["写周报 ✓ #", "买牛奶 ✓ #", "读书", "读书 ✓ #"], "one write: the three checked, the first 读书 as it was");
    assert.equal(edits.writerOf("plan", fs.readFileSync(file, "utf8")), "reader", "the reader's edit");
    const written = fs.readFileSync(file, "utf8");
    answer = await set([{ ref: refs[2], done: true }]);
    assert.deepEqual(answer.results, [{ ok: false, reason: "ambiguous" }], "the first 读书 by a ref of the version before: two of its words under its headings now, refused");
    answer = await set([{ ref: refs[0], done: true }]);
    assert.deepEqual([answer.results, answer.wrote], [[{ ok: true, changed: false, block: "id1" }], false], "写周报 by the ref of before (no id in it): the one item of its words, checked already, nothing written");
    answer = await set([{ ref: refs[1], done: false }, { ref: refs[1], done: true }]);
    assert.deepEqual([answer.results.map((result) => result.changed), answer.wrote], [[true, true], false], "cleared and checked again in one write: each changed what stood before it, the last winning, nothing written");
    assert.equal(fs.readFileSync(file, "utf8"), written, "the file as it was");
    answer = await set([{ ref: { ...refs[1], text: "买豆浆" }, done: false }, { ref: { ...refs[2], text: "不在了" }, done: true }, { ref: { ...refs[0], slug: "other" }, done: true }, { ref: refs[0] }]);
    assert.deepEqual(answer.results.map((result) => result.reason), ["changed", "changed", "ref", "ref"], "its words not the ref's (found by its id), none of its words, a ref of another document, no done: refused");
    answer = await set([{ ref: refs[1], done: false }]);
    assert.deepEqual(items(), ["写周报 ✓ #", "买牛奶 #", "读书", "读书 ✓ #"], "cleared");
    // The Agent rewrites the item's words: a check by the ref read before is the conflict.
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(">买牛奶<", ">买豆浆<"));
    answer = await set([{ ref: refs[1], done: true }]);
    assert.deepEqual(answer.results, [{ ok: false, reason: "changed" }], "the Agent changed its words since: changed, nothing written");
    assert.deepEqual(items(), ["写周报 ✓ #", "买豆浆 #", "读书", "读书 ✓ #"]);
    // An item the facts list that no block of the editor holds (a list in a table cell, in a block of the
    // document's own): refused as locked, not as changed (which the block would read again after, for good).
    write("locks", `  <div class="doc-table-wrap"><table class="doc-table"><thead><tr><th>A</th></tr></thead><tbody><tr><td><ul class="doc-todo"><li>格子里</li></ul></td></tr></tbody></table></div>
  <div class="mine" data-x="1">
    <ul class="doc-todo"><li>自有块里</li></ul>
  </div>
  <ul class="doc-todo"><li>正常的</li></ul>`);
    const locks = (await index.query("todos", { slugs: ["locks"] }))[1].data;
    assert.deepEqual(locks.map((todo) => todo.text), ["格子里", "自有块里", "正常的"], "the facts list all three");
    const lockText = fs.readFileSync(path.join(space, "locks", "doc.html"), "utf8");
    const [, locked] = await edits.setTodos("locks", locks.map((todo) => ({ ref: todo.ref, done: true })));
    assert.deepEqual(locked.results.map((result) => result.reason ?? "ok"), ["locked", "locked", "ok"], "the cell's item and the own block's: locked; the ordinary one written");
    assert.equal(fs.readFileSync(path.join(space, "locks", "doc.html"), "utf8").replace(/ data-block-id="[^"]+" data-checked/, ""), lockText, "only the ordinary item written");
    assert.ok(TODO_CODES.includes("locked"), "a code a block may be told");
    assert.deepEqual((await edits.setTodos("nobody", [{ ref: refs[0], done: true }]))[0], 404, "no such document");
    assert.deepEqual((await edits.setTodos("plan", Array.from({ length: TODO_MOST + 1 }, () => ({ ref: refs[0], done: true }))))[0], 400, "more than one write carries");

    // The route: the token's, a document at the root, its answer the service's.
    const workspace = createWorkspaceService({ edits, reportsDirectory: space, reports: { create: async () => {}, words: (html) => html, export: async () => ({ problems: [] }) } });
    server = http.createServer((request, response) => workspace.handle(request, response, request.url.match(/^\/__gallery\/workspace\/([a-z]+)/)?.[1]));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const host = `127.0.0.1:${server.address().port}`;
    const post = async (body, token = edits.token) => {
      const response = await fetch(`http://${host}${TODO_ROUTE}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: `http://${host}`, "X-Gallery-Token": token }, body: JSON.stringify(body) });
      return [response.status, await response.json()];
    };
    const now = (await index.query("todos", { slugs: ["plan"] }))[1].data.map((todo) => todo.ref);
    assert.equal((await post({ slug: "plan", items: [{ ref: now[1], done: true }] }, "wrong"))[0], 403, "without the token: refused");
    assert.deepEqual((await post({ slug: "nobody", items: [{ ref: now[1], done: true }] }))[0], 404, "no document at the root");
    assert.deepEqual((await post({ slug: "plan", items: "x" }))[0], 400);
    const [status, routed] = await post({ slug: "plan", items: [{ ref: now[1], done: true }] });
    assert.deepEqual([status, routed.results], [200, [{ ok: true, changed: true, block: "milk0001" }]], "written through the route");

    // The page's writer: a document's checks asked while one write of it is out go together in the next.
    const sent = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (route, init) => {
      const body = JSON.parse(init.body);
      sent.push({ route, token: init.headers["X-Gallery-Token"], slug: body.slug, count: body.items.length });
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { json: async () => ({ ok: true, results: body.items.map((item) => ({ ok: true, changed: item.done, block: null })) }) };
    };
    try {
      const answered = [];
      const writes = createTodoWrites({ token: "t0k", done: (ask, result) => answered.push([ask.ref.text, result.changed]) });
      const ask = (slug, words, done) => writes.write({ slug, ref: { slug, block: null, text: words, path: [], nth: 0, version: null }, done });
      const first = [ask("plan", "一", true), ask("plan", "二", true), ask("other", "三", true)];
      await new Promise((resolve) => setTimeout(resolve, 5));
      const later = [ask("plan", "四", false), ask("plan", "五", true)];
      const results = await Promise.all([...first, ...later]);
      await writes.idle();
      assert.deepEqual(sent.map(({ slug, count }) => [slug, count]), [["plan", 2], ["other", 1], ["plan", 2]], "one write a document: those of one moment together, those asked while it was out in the next");
      assert.ok(sent.every((one) => one.route === TODO_ROUTE && one.token === "t0k"), "the route, with the page's token");
      assert.deepEqual(results.map((result) => result.changed), [true, true, true, false, true], "each its own answer");
      assert.equal(answered.length, 5, "each told as it is answered");
    } finally {
      globalThis.fetch = realFetch;
    }
  } finally {
    await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
    await edits.stored();
    fs.rmSync(space, { recursive: true, force: true });
  }
}

console.log("Checked a component's write-back on the server: the part alone, its hash, its definition, what is refused (and left out of the review's baseline, 仍然调整 going over the baseline's part); JSON written back as it was laid out (json-layout.mjs), and the check telling context.editJSON's write from a layout of a component's own; a to-do checked from another page (found by its id, its place while the file is as read, else its words and headings, refused when changed or ambiguous, one commit of the reader's giving ids, the last of an item winning, the route the token's, the page's writer merging a document's checks).");
