import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createMediaStore } from "../../src/editor/media-store.mjs";
import { formatSize } from "../../src/shared/media.mjs";
import { applyEdits, findBlocks, findUnits } from "../../src/editor/source.mjs";
import { componentFailures } from "../../src/render/component-checks.mjs";
import { embedFiles, fileFailures } from "../../src/render/files.mjs";

// File blocks (文件, components/file/, docs/components/file.md): their markup and its
// checks, the file handed out by the preview and inside an export (render/files.mjs), the block as
// the editor finds it (a card with a caption that may be empty) and writes a new one, and the files
// kept in the report's folder (editor/media-store.mjs, kind "file").

const CSV = Buffer.from("a,b\n1,2\n");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "report-files-"));
await fs.mkdir(path.join(root, "alpha", "assets"), { recursive: true });
await fs.writeFile(path.join(root, "alpha", "report.html"), "<main></main>");
await fs.writeFile(path.join(root, "alpha", "report.json"), "{}");
await fs.writeFile(path.join(root, "alpha", "assets", "file-0123456789ab.csv"), CSV);

const link = (href, more = ' download="结果.csv"') => `<a class="doc-file-link" href="${href}"${more}><span class="doc-file-name">结果.csv</span><span class="doc-file-size">8 B</span></a>`;
const figure = (inner) => `<main class="doc-page">\n  <figure class="doc-file">\n    ${inner}\n  </figure>\n</main>`;
const good = figure(`${link("assets/file-0123456789ab.csv")}\n    <figcaption>说明</figcaption>`);
const directory = path.join(root, "alpha");
// The preview names a file of the folder by its stamp (render/media-ref.mjs servedUrl: tests/unit/written-files.mjs);
// left out where what is checked is the address.
const unstamped = (html) => html.replace(new RegExp("[?]v=[0-9a-f]{12}", "g"), "");

// Its markup: a link holding a name (and a size), and a caption, nothing else; the file one of the
// report's folder that is there, with a name to save it as.
assert.deepEqual(componentFailures(good), []);
assert.equal(componentFailures(figure(link("assets/file-0123456789ab.csv"))).length, 1, "no caption");
assert.equal(componentFailures(figure('<a class="doc-file-link" href="assets/x.csv" download="x"></a>\n    <figcaption></figcaption>')).length, 1, "no name");
assert.deepEqual(fileFailures({ html: good, directory }), []);
assert.match(fileFailures({ html: figure(`${link("https://example.com/x.csv")}\n    <figcaption></figcaption>`), directory })[0], /no file of the document's folder .*: save it into the document's assets\/ folder/);
assert.match(fileFailures({ html: figure(`${link("assets/数据 表.csv")}\n    <figcaption></figcaption>`), directory })[0], /^line 3: a file block's file \(assets\/数据 表\.csv\): its name holds 数, 据, a space, 表, .*as assets\/file\.csv \(<a class="doc-file-link"/);
assert.match(fileFailures({ html: figure(`${link("assets/file-missing.csv")}\n    <figcaption></figcaption>`), directory })[0], /not in the document's folder/);
assert.match(fileFailures({ html: figure(`${link("assets/file-0123456789ab.csv", "")}\n    <figcaption></figcaption>`), directory })[0], /^line 3: .*download="<name>"/);
assert.match(fileFailures({ html: figure(`${link("assets/file-0123456789ab.csv", " download")}\n    <figcaption></figcaption>`), directory })[0], /download="<name>"/, "a download attribute with no name");
// Its tags as a browser reads them (the parse tree's elements, render/media-ref.mjs): any case,
// single quotes or none, spaces around "="; the check and the embed read the same.
const written = figure(`<A class='doc-file-link' HREF=assets/file-0123456789ab.csv download = '结果.csv'><span class="doc-file-name">结果.csv</span></A>\n    <figcaption></figcaption>`);
assert.deepEqual(fileFailures({ html: written, directory }), []);
assert.ok(embedFiles(written, { slug: "alpha", reportsDirectory: root }).includes(`<A class='doc-file-link' href="data:text/csv;base64,${CSV.toString("base64")}" download = '结果.csv'>`));

// The preview hands it out from the report's folder and says the file; an export holds it.
assert.ok(unstamped(embedFiles(good, { slug: "alpha", mode: "preview", reportsDirectory: root })).includes('href="/__gallery/edit/file/alpha/assets/file-0123456789ab.csv" data-ge-href="assets/file-0123456789ab.csv" download="结果.csv"'));
assert.ok(embedFiles(good, { slug: "alpha", reportsDirectory: root }).includes(`href="data:text/csv;base64,${CSV.toString("base64")}" download="结果.csv"`));
assert.equal(embedFiles(good.replace("0123456789ab", "missing"), { slug: "alpha", reportsDirectory: root }), good.replace("0123456789ab", "missing"), "a missing file stays as written");
const besides = embedFiles(good.replace("</main>", '  <p><a href="assets/file-0123456789ab.csv" download>结果</a></p>\n</main>'), { slug: "alpha", reportsDirectory: root });
assert.ok(besides.includes('<p><a href="assets/file-0123456789ab.csv" download>结果</a></p>') && besides.includes("href=\"data:text/csv"), "only a file block's link (any other is asset-references.mjs's: tests/unit/references.mjs)");

// The editor: one block (a card), its caption a media block's.
const page = `<main>\n  <p>前文</p>\n${good.replace(/^<main[^>]*>\n|\n<\/main>$/g, "")}\n</main>\n`;
assert.deepEqual(findUnits(page).units.map((unit) => unit.kind), ["paragraph", "file"]);
assert.ok(findBlocks(page).some((block) => block.kind === "mediaCaption" && block.caps.empty));
// A new one: its file, name (written escaped), size and caption; never a file from elsewhere.
const add = (node) => applyEdits({ current: page, edits: [], units: [{ id: "n0", insert: { type: "file", key: "n0", caption: "", ...node }, place: { after: 0 } }] });
assert.equal(add({ href: "assets/file-0123456789ab.csv", name: "A&B 结果.csv", size: "8 B" }).text,
  page.replace("<p>前文</p>\n", '<p>前文</p>\n  <figure class="doc-file">\n    <a class="doc-file-link" href="assets/file-0123456789ab.csv" download="A&amp;B 结果.csv"><span class="doc-file-name">A&amp;B 结果.csv</span><span class="doc-file-size">8 B</span></a>\n    <figcaption></figcaption>\n  </figure>\n'));
for (const bad of [{ href: "https://example.com/x.csv", name: "x.csv" }, { href: "assets/x.csv", name: "a/b.csv" }, { href: "assets/x.csv", name: "" }, { href: "assets/x.csv", name: "x.csv", size: "lots" }]) {
  assert.deepEqual(add(bad).conflicts.map((entry) => entry.reason), ["invalid"], JSON.stringify(bad));
}
assert.deepEqual([0, 104, 1024, 12390, 5 * 1024 * 1024].map(formatSize), ["0 B", "104 B", "1 KiB", "12.1 KiB", "5 MiB"]);

// Its files go into the report's folder: any file, 20 MB at most, named file-<hash>.<extension>,
// with the name it came with and its size.
const files = createMediaStore({ reportsDirectory: root });
const [status, kept] = await files.upload({ slug: "alpha", kind: "file", name: "评测 结果.CSV", data: CSV.toString("base64") });
assert.equal(status, 200);
assert.match(kept.path, /^assets\/file-[a-f0-9]{12}\.csv$/);
assert.deepEqual([kept.name, kept.size], ["评测 结果.CSV", CSV.length]);
assert.match((await files.upload({ slug: "alpha", kind: "file", name: "../../evil", data: CSV.toString("base64") }))[1].path, /^assets\/file-[a-f0-9]{12}$/, "no extension, no way out");
assert.equal((await files.upload({ slug: "alpha", kind: "file", name: "big.bin", data: Buffer.alloc(21 * 1024 * 1024).toString("base64") }))[1].reason, "size");

await fs.rm(root, { recursive: true, force: true });
console.log("Checked file blocks: their markup and checks, the file handed out by the preview and inside an export, the block and its caption as the editor finds them, a new one written (escaped, and refused from elsewhere), sizes in steps of 1024 with one decimal at most (12.1 KiB), and their files kept in the document's folder.");
