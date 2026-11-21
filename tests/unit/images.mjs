import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createMediaStore } from "../../src/editor/media-store.mjs";
import { applyEdits, findBlocks, findUnits } from "../../src/editor/source.mjs";
import { componentFailures } from "../../src/render/component-checks.mjs";
import { embedImages, imageFailures } from "../../src/render/images.mjs";

// The preview names a file of the folder by its stamp (render/media-ref.mjs servedUrl: tests/unit/written-files.mjs);
// left out where what is checked is the address.
const unstamped = (html) => html.replace(new RegExp("[?]v=[0-9a-f]{12}", "g"), "");

// Image blocks (图片, components/image/, docs/components/image.md): their markup and its
// checks, the picture where the preview serves it and inside an export (render/images.mjs), the
// block as the editor finds it (a card with a caption that may be empty) and writes a new one, and
// the pictures kept in the report's folder (editor/media-store.mjs, kind "image").

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "report-images-"));
await fs.mkdir(path.join(root, "alpha", "assets"), { recursive: true });
await fs.writeFile(path.join(root, "alpha", "report.html"), "<main></main>");
await fs.writeFile(path.join(root, "alpha", "report.json"), "{}");
await fs.writeFile(path.join(root, "alpha", "assets", "image-0123456789ab.png"), PNG);

const figure = (inner, open = '<figure class="doc-image">') => `<main class="doc-page">\n  ${open}\n    ${inner}\n  </figure>\n</main>`;
const good = figure('<img src="assets/image-0123456789ab.png" alt="">\n    <figcaption>说明</figcaption>');

// Its markup: a picture and a caption (an empty one too), nothing else; the picture a file of the report's folder that is there.
assert.deepEqual(componentFailures(good), []);
assert.deepEqual(componentFailures(figure('<img src="assets/image-0123456789ab.png" alt="">\n    <figcaption></figcaption>')), []);
assert.equal(componentFailures(figure('<img src="assets/image-0123456789ab.png" alt="">')).length, 1, "no caption");
assert.equal(componentFailures(figure('<img src="assets/a.png" alt="">\n    <figcaption></figcaption>\n    <p>多余</p>')).length, 1, "something else in it");
assert.deepEqual(imageFailures({ html: good, directory: path.join(root, "alpha") }), []);
assert.match(imageFailures({ html: figure('<img src="https://example.com/x.png" alt="">\n    <figcaption></figcaption>'), directory: path.join(root, "alpha") })[0], /^line 3: an image's picture \(https:\/\/example\.com\/x\.png\): it is no file of the document's folder .*: save it into the document's assets\/ folder and write assets\/<file>$/, "why, and no alt=\"…\" (the img has one)");
assert.match(imageFailures({ html: figure('<img src="assets/sub/x.png" alt="">\n    <figcaption></figcaption>'), directory: path.join(root, "alpha") })[0], /^line 3: an image's picture \(assets\/sub\/x\.png\): the preview serves the files right in assets\/, none in a folder of it/);
assert.match(imageFailures({ html: figure('<img src="assets/image-missing.png" alt="">\n    <figcaption></figcaption>'), directory: path.join(root, "alpha") })[0], /^line 3: an image's picture assets\/image-missing\.png is not in the document's folder$/);
assert.match(imageFailures({ html: figure('<img alt="">\n    <figcaption></figcaption>'), directory: path.join(root, "alpha") })[0], /^line 3: an image's picture has no src/, "no src: a failure, never passed over");
// Its tags as a browser reads them (the parse tree's elements, render/media-ref.mjs): any case,
// single quotes or none, spaces around "=", the figure's classes as tokens; the check and the embed
// read the same.
const written = figure("<IMG SRC = 'assets/image-0123456789ab.png' alt=\"\">\n    <figcaption></figcaption>", "<FIGURE class=doc-image>");
assert.deepEqual(imageFailures({ html: written, directory: path.join(root, "alpha") }), []);
assert.ok(embedImages(written, { slug: "alpha", reportsDirectory: root }).includes(`<IMG src="data:image/png;base64,${PNG.toString("base64")}" alt="">`));
assert.ok(unstamped(embedImages(written, { slug: "alpha", mode: "preview", reportsDirectory: root })).includes('<IMG src="/__gallery/edit/asset/alpha/assets/image-0123456789ab.png" data-ge-src="assets/image-0123456789ab.png" alt="">'));
const lookalike = figure('<img src="assets/image-0123456789ab.png" alt="">', '<figure class="doc-image-like">');
assert.equal(embedImages(lookalike, { slug: "alpha", reportsDirectory: root }), lookalike, "a class that only starts like it is none of it");

// The preview serves it from the report's folder and says the file; an export holds it.
const preview = unstamped(embedImages(good, { slug: "alpha", mode: "preview", reportsDirectory: root }));
assert.ok(preview.includes('<img src="/__gallery/edit/asset/alpha/assets/image-0123456789ab.png" data-ge-src="assets/image-0123456789ab.png" alt="">'));
const exported = embedImages(good, { slug: "alpha", reportsDirectory: root });
assert.ok(exported.includes(`<img src="data:image/png;base64,${PNG.toString("base64")}" alt="">`));
assert.equal(embedImages(good.replace("0123456789ab", "missing"), { slug: "alpha", reportsDirectory: root }), good.replace("0123456789ab", "missing"), "a missing picture stays as written");
assert.equal(embedImages('<p><img src="assets/image-0123456789ab.png"></p>', { slug: "alpha", reportsDirectory: root }), '<p><img src="assets/image-0123456789ab.png"></p>', "only image blocks (a picture elsewhere is asset-references.mjs's: tests/unit/references.mjs)");

// The editor: one block (a card), its caption a text block that may be empty, plain inline text.
const page = `<main>\n  <p>前文</p>\n${good.replace(/^<main[^>]*>\n|\n<\/main>$/g, "")}\n  <p>后文</p>\n</main>\n`;
const { units } = findUnits(page);
assert.deepEqual(units.map((unit) => unit.kind), ["paragraph", "image", "paragraph"]);
const caption = findBlocks(page).find((block) => block.kind === "mediaCaption");
assert.ok(caption && caption.caps.empty && !caption.caps.remove && !caption.caps.split, JSON.stringify(caption?.caps));
const emptied = applyEdits({ current: page, edits: [{ id: caption.id, parts: [{ keep: true, html: "" }] }] });
assert.ok(emptied.ok && emptied.text.includes("<figcaption></figcaption>"), "a caption emptied stays, empty");
// A new one: its picture, caption, side and width; never a picture from elsewhere.
const add = (node) => applyEdits({ current: page, edits: [], units: [{ id: "n0", insert: { type: "image", key: "n0", ...node }, place: { after: 0 } }] });
assert.equal(add({ src: "assets/image-0123456789ab.png", caption: "" }).text,
  page.replace("<p>前文</p>\n", '<p>前文</p>\n  <figure class="doc-image">\n    <img src="assets/image-0123456789ab.png" alt="">\n    <figcaption></figcaption>\n  </figure>\n'));
assert.ok(add({ src: "assets/image-0123456789ab.png", caption: "图 1", classes: ["doc-image--right"], span: 0.5 }).text.includes('<figure class="doc-image doc-image--right" style="--doc-span: 0.5">\n    <img src="assets/image-0123456789ab.png" alt="">\n    <figcaption>图 1</figcaption>'));
for (const bad of [{ src: "https://example.com/x.png", caption: "" }, { src: "assets/x.png", caption: "<div>x</div>" }, { src: "assets/x.png", caption: "", span: 2 }, { src: "assets/x.png", caption: "", classes: ["doc-image--wide"] }]) {
  assert.deepEqual(add(bad).conflicts.map((entry) => entry.reason), ["invalid"], JSON.stringify(bad));
}

// Its pictures go into the report's folder: images only, 10 MB at most, named image-<hash>.
const files = createMediaStore({ reportsDirectory: root });
const [status, kept] = await files.upload({ slug: "alpha", kind: "image", data: PNG.toString("base64") });
assert.equal(status, 200);
assert.match(kept.path, /^assets\/image-[a-f0-9]{12}\.png$/);
assert.equal((await files.upload({ slug: "alpha", kind: "image", data: Buffer.from("<html></html>").toString("base64") }))[1].reason, "type");
const big = Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]);
assert.equal((await files.upload({ slug: "alpha", data: big.toString("base64") }))[1].reason, "size", "an icon: 2 MB at most");
assert.equal((await files.upload({ slug: "alpha", kind: "image", data: big.toString("base64") }))[0], 200, "an image's picture: more");

await fs.rm(root, { recursive: true, force: true });
console.log("Checked image blocks: their markup and checks, the picture where the preview serves it and inside an export, the block and its caption as the editor finds them, a new one written (and refused from elsewhere), and their pictures kept in the document's folder.");
