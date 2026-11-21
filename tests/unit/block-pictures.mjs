import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { DENSITY, MARGIN, READING, TALLEST, WIDEST, clipOf, picturesWritten, webpSize } from "../../src/cli/block-picture.mjs";
import { forecastOf, keptUpTo, madeFrom, readRecord, staleBlocks } from "../../src/cli/pack-pictures.mjs";
import { DENSITY as SHOWN_DENSITY, WIDEST as SHOWN_WIDEST, pictureAddress, pixelStep, previewPlace, shownSize, snap } from "../../src/editor/page/block-preview.mjs";
import { LANGUAGE_PICTURES, PICTURES, isPicture } from "../../src/shared/component-catalog.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { recipeFiles, shippedBlock } from "../../src/shared/shipped-blocks.mjs";
import { findBrowser } from "../../src/transfer/browser.mjs";

// The add-block lists' pictures of a block (the user, 2026-11-17): what gallery block check makes of a
// block's example and writes into its folder (src/cli/block-picture.mjs), and how the menus' card sizes and
// places one (src/editor/page/block-preview.mjs). The card itself in a page is the scenario blockPictureCard's;
// the catalog's addresses catalog.mjs's; the library's and its route page-service.mjs's; Gallery's own
// pictures shipped-blocks.mjs's.

// ---------- the picture's numbers, the card's ----------
assert.deepEqual([PICTURES.light, PICTURES.dark], ["preview-light.webp", "preview-dark.webp"]);
assert.deepEqual(LANGUAGE_PICTURES, { en: { light: "preview-light.en.webp", dark: "preview-dark.en.webp" } }, "an English pair, which Gallery's own ship");
assert.deepEqual(["preview-light.webp", "preview-dark.en.webp", "preview.svg", "preview.png", "kit.js", "preview-light.webp.bak"].map(isPicture), [true, true, true, false, false, false], "a picture by its name, of any language, the drawing of before too");
assert.equal(DENSITY, SHOWN_DENSITY, "the card reads a picture at the density it is made at");
assert.equal(WIDEST, SHOWN_WIDEST, "and shows it at most as wide as it is made");
// A card of 4 × 2 cells (304 × 144) at 100, 60 on a page of 1040 × 900: the page's ground around it, at its size.
const card = clipOf({ x: 100, y: 60, width: 304, height: 144, page: { width: 1040, height: 900 } });
assert.deepEqual(card, { x: 100 - MARGIN, y: 60 - MARGIN, width: 304 + 2 * MARGIN, height: 144 + 2 * MARGIN, scale: 1 }, "a card at its size, MARGIN of the ground around it");
// A block of documents in its column of READING: the picture WIDEST wide, shown at its size.
assert.equal(READING, WIDEST - 2 * MARGIN);
assert.deepEqual(clipOf({ x: 216, y: 52, width: READING, height: 120, page: { width: 800, height: 900 } }), { x: 200, y: 36, width: WIDEST, height: 152, scale: 1 }, "a block of documents at its column's width, at its size");
// One whose content takes more (a 看板's columns), near the page's edge and taller than TALLEST: scaled to WIDEST, cut at TALLEST, within the page.
const wide = clipOf({ x: 8, y: 4, width: 712, height: 2000, page: { width: 800, height: 2100 } });
assert.deepEqual([wide.x, wide.y, wide.width, wide.height], [0, 0, 8 + 712 + MARGIN, TALLEST], "within the page, cut at TALLEST");
assert.equal(Math.round(wide.width * wide.scale), WIDEST, "scaled down to WIDEST");
// Which picture a row shows: of the page's theme, of the UI's language where its block has a pair in it, else its own.
const preview = { picture: { light: "zh-light", dark: "zh-dark", en: { light: "en-light", dark: "en-dark" } }, says: "" };
assert.deepEqual([pictureAddress(preview, "dark", "zh"), pictureAddress(preview, "dark", "en"), pictureAddress({ picture: { light: "a", dark: "b" } }, "light", "en"), pictureAddress({ picture: null }, "light", "zh")], ["zh-dark", "en-dark", "a", null]);
// Its edges on whole device pixels the layout has (a length in 64ths of a CSS pixel): at 125% every 4 (5 device pixels), at 150% every 2, at 200% every half, at 100% every one.
assert.deepEqual([1, 1.25, 1.5, 2, 3].map(pixelStep), [1, 4, 2, 0.5, 1]);
assert.equal(pixelStep(1.1), 1 / 1.1, "a screen of no small fraction: whole device pixels, the nearest the layout has");
assert.deepEqual([snap(5, 1.25, "down"), snap(465, 1.25), snap(337, 1.25, "down"), snap(221, 1.25, "up"), snap(5, 1), snap(465.4, 1), snap(337.3, 2, "down")], [4, 464, 336, 224, 5, 465, 337]);
// The card's size: the picture's own, never larger; smaller by one scale where the room is less.
assert.deepEqual(shownSize({ width: 336, height: 176 }, { width: 400, height: 480 }), { width: 336, height: 176 });
assert.deepEqual(shownSize({ width: 400, height: 300 }, { width: 200, height: 480 }), { width: 200, height: 150 });
assert.deepEqual(shownSize({ width: 400, height: 600 }, { width: 400, height: 300 }), { width: 200, height: 300 });
// Its place: right of the menu, its top by the row's; else left of it; else under the row, else above it; never over the row.
const row = { left: 900, right: 1132, top: 300, bottom: 328 };
const menu = { left: 896, right: 1136, top: 260, bottom: 700 };
const size = { width: 346, height: 230 };
assert.deepEqual(previewPlace(row, { ...menu, left: 100, right: 340 }, size, { width: 1280, height: 800 }), { left: 346, top: 295, side: "right" });
assert.deepEqual(previewPlace(row, menu, size, { width: 1280, height: 800 }), { left: 896 - 6 - 346, top: 295, side: "left" });
assert.equal(previewPlace({ ...row, top: 700, bottom: 728 }, menu, size, { width: 1280, height: 800 }).top, 800 - 8 - 230, "within the window at its foot");
const narrow = previewPlace({ left: 20, right: 380, top: 200, bottom: 228 }, { left: 16, right: 384, top: 150, bottom: 600 }, size, { width: 400, height: 800 });
assert.deepEqual(narrow, { left: 16, top: 234, side: "below" }, "a narrow window: under the row");
assert.equal(previewPlace({ left: 20, right: 380, top: 600, bottom: 628 }, { left: 16, right: 384, top: 150, bottom: 700 }, size, { width: 400, height: 800 }).side, "above", "or above it");
assert.equal(previewPlace({ left: 20, right: 380, top: 150, bottom: 178 }, { left: 16, right: 384, top: 100, bottom: 700 }, { width: 346, height: 700 }, { width: 400, height: 800 }), null, "none where nothing leaves the row clear");

// ---------- Gallery's own pictures: made of the code there is now ----------
// src/cli/pack-pictures.mjs records what it made them of (src/cli/pack-pictures.json): the kit and the scripts that make
// them, and each block's own files. Changed since, a block's pictures are no longer the block as it is drawn.
const record = readRecord();
const stale = staleBlocks(record, madeFrom());
assert.deepEqual(stale, [], `the pictures of Gallery's own blocks were made of other code than there is now (${record.shared === madeFrom().shared ? "these blocks' own files changed" : "the kit, or how a picture is made, changed: every one"}): run node src/cli/pack-pictures.mjs${record.shared === madeFrom().shared ? ` ${stale.join(" ")}` : ""}, look at the pictures and commit them with src/cli/pack-pictures.json`);
// How it pictures them: the dates a habit was kept moved up to the day it runs; a forecast of its own at that time.
const morning = new Date(2026, 10, 18, 10, 30).getTime();
assert.equal(keptUpTo('{"name":"读书","days":["2026-10-30","2026-11-02","2026-11-06"]}', morning), '{"name":"读书","days":["2026-11-11","2026-11-14","2026-11-18"]}');
const forecast = forecastOf(morning);
const sky = forecast({ url: "https://api.open-meteo.com/v1/forecast?latitude=31.23&longitude=121.47" });
assert.ok(sky.ok && sky.data.current.is_day === 1 && sky.data.daily.time[0] === "2026-11-18" && Date.parse(sky.at) === morning, JSON.stringify(sky));
assert.equal(forecast({ url: "https://geocoding-api.open-meteo.com/v1/search?name=%E4%B8%8A%E6%B5%B7" }).data.results[0].name, "上海");
assert.equal(forecast({ url: "https://example.com/" }).code, "offline", "nothing else of the net");

// ---------- WebP's size, read from its header ----------
const shipped = fs.readFileSync(path.join(projectRoot, "src", "packs", "gallery", "weather", PICTURES.light));
assert.ok(webpSize(shipped)?.width > 0, "a lossy one");
assert.equal(webpSize(Buffer.from("not a picture at all, of thirty bytes or more")), null);

// ---------- whose pictures the check writes ----------
const root = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-pictures-"));
const workspace = path.join(root, "workspace");
fs.mkdirSync(path.join(workspace, ".gallery"), { recursive: true });
fs.writeFileSync(path.join(workspace, ".gallery", "blocks.json"), JSON.stringify({ "my-cards/note": { version: "1.0.0", fingerprint: "x" } }));
assert.equal(picturesWritten(workspace, "acme/hello"), true, "a block of the workspace's own");
assert.equal(picturesWritten(workspace, "gallery/note"), false, "not one of Gallery's own: its pack ships its pictures");
assert.equal(picturesWritten(workspace, "gallery-soft/todos"), false, "of either pack");
assert.equal(picturesWritten(workspace, "my-cards/note"), false, "nor one a pack installed: its folder stays as installed");
fs.rmSync(path.join(workspace, ".gallery"), { recursive: true });
// A recipe copies no picture: the new block's are its own first check's.
assert.ok(Object.keys(recipeFiles(shippedBlock("habit"), "team/water")).every((file) => !file.startsWith("preview")), "a recipe's files, its pictures aside");

// ---------- gallery block check makes them ----------
const run = promisify(execFile);
const bin = path.join(projectRoot, "src", "cli", "bin.mjs");
const gallery = async (...args) => {
  try {
    const { stdout } = await run(process.execPath, [bin, "--workspace", workspace, "block", ...args], { cwd: root, env: { ...process.env, GALLERY_DEFAULT_WORKSPACE: workspace, GALLERY_NO_PREVIEW: "1", GALLERY_NO_BROWSER: "1", GALLERY_LANGUAGE: "zh" }, maxBuffer: 1 << 24 });
    return { code: 0, stdout };
  } catch (error) {
    if (typeof error.code !== "number") throw error;
    return { code: error.code, stdout: error.stdout };
  }
};
const folderOf = (id) => path.join(workspace, "components", ...id.split("/"));
const pictures = (id) => Object.values(PICTURES).map((file) => (fs.existsSync(path.join(folderOf(id), file)) ? fs.readFileSync(path.join(folderOf(id), file)) : null));
const times = (id) => Object.values(PICTURES).map((file) => fs.statSync(path.join(folderOf(id), file)).mtimeMs);
if (findBrowser()) {
  try {
    // A card made from nothing, and a block of documents: check alone gives each its two pictures, and says nothing of them.
    for (const [id, flags, kind] of [["acme/hello", ["--page"], "a card"], ["acme/note", [], "a block of documents"]]) {
      assert.equal((await gallery("new", id, ...flags)).code, 0);
      assert.deepEqual(pictures(id), [null, null], `${kind} made: no pictures yet`);
      const checked = await gallery("check", id);
      assert.ok(checked.code === 0 && checked.stdout.trimEnd().endsWith(`OK   ${id}`), checked.stdout);
      assert.ok(!/preview-(?:light|dark)/.test(checked.stdout), "nothing said of them: nothing for the Agent to look at");
      const [light, dark] = pictures(id);
      for (const [theme, bytes] of [["light", light], ["dark", dark]]) {
        const made = bytes && webpSize(bytes);
        assert.ok(made && made.width <= DENSITY * WIDEST && made.width >= 300 && made.height >= 100, `${kind}: its ${theme} picture, a WebP of the menus' size: ${JSON.stringify(made)}`);
      }
      assert.ok(!light.equals(dark), `${kind}: two themes`);
    }
    // A block of documents that reads the workspace (its own document's facts) is pictured as it reads them, as an export
    // that kept them draws it, not as one that kept none (2026-11-18: its offline words in the picture): it stands 240px
    // high once answered, one line high where not.
    const stamp = folderOf("acme/stamp");
    fs.mkdirSync(stamp, { recursive: true });
    const files = {
      "component.json": JSON.stringify({ id: "acme/stamp", apiVersion: 1, version: "0.1.0", name: { zh: "文档时间", en: "Document times" }, description: { zh: "这篇文档什么时候建的、最后什么时候改的", en: "When this document was made and last edited" }, words: "文档时间 wendangshijian document times", places: ["document"], needs: ["workspace"], parts: {}, runtime: { generated: [".stamp-drawn"] } }, null, 2),
      "kit.js": `DocKit.component({\n  id: "acme/stamp",\n  on: ["data"],\n  mount(host, context) {\n    const line = document.createElement("p");\n    line.className = "stamp-drawn";\n    host.append(line);\n    const draw = () => context.workspace?.query("document").then(\n      ({ data }) => { line.textContent = \`\${data.title} · \${data.created} · \${data.words}\`; line.dataset.answered = ""; },\n      () => { line.textContent = "offline"; delete line.dataset.answered; },\n    );\n    draw();\n    return { update: draw };\n  },\n});\n`,
      "style.css": `[data-doc-component="acme/stamp"] .stamp-drawn { margin: 0; color: var(--doc-muted); }\n[data-doc-component="acme/stamp"] .stamp-drawn[data-answered] { height: 240px; }\n`,
      "template.html": `<div data-doc-component="acme/stamp"></div>\n`,
      "example.html": `<div data-doc-component="acme/stamp"></div>\n`,
    };
    for (const [file, text] of Object.entries(files)) fs.writeFileSync(path.join(stamp, file), text);
    const stamped = await gallery("check", "acme/stamp");
    assert.ok(stamped.code === 0, stamped.stdout);
    for (const bytes of pictures("acme/stamp")) {
      const made = bytes && webpSize(bytes);
      assert.ok(made && made.height >= DENSITY * 240, `a block of documents that reads its own document: pictured answered, 240px high, not offline: ${JSON.stringify(made)}`);
    }
    // Checked again with nothing changed: nothing written (a server's catalog hears no change of it).
    const before = times("acme/hello");
    assert.equal((await gallery("check", "acme/hello")).code, 0);
    assert.deepEqual(times("acme/hello"), before, "the same pictures: none written again");
    // A check that fails writes none.
    for (const file of Object.values(PICTURES)) fs.rmSync(path.join(folderOf("acme/hello"), file));
    const manifest = path.join(folderOf("acme/hello"), "component.json");
    const kept = fs.readFileSync(manifest, "utf8");
    fs.writeFileSync(manifest, kept.replace('"places"', '"places_"'));
    assert.notEqual((await gallery("check", "acme/hello")).code, 0, "it fails");
    assert.deepEqual(pictures("acme/hello"), [null, null], "a check that fails: no pictures");
    fs.writeFileSync(manifest, kept);
    // One of Gallery's own, as added: its shipped pictures stay as they are, its folder as Gallery ships it.
    assert.equal((await gallery("add", "note")).code, 0);
    const own = times("gallery/note");
    assert.equal((await gallery("check", "gallery/note")).code, 0);
    assert.deepEqual(times("gallery/note"), own, "Gallery's own: its pictures not written");
    assert.ok(pictures("gallery/note")[0].equals(fs.readFileSync(path.join(projectRoot, "src", "packs", "gallery", "note", PICTURES.light))), "as shipped");
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
} else {
  fs.rmSync(root, { recursive: true, force: true });
  console.log("block-pictures: no Chrome or Edge here, gallery block check's pictures not made");
}

console.log("Checked the add-block lists' pictures: their names (an English pair too), the clip and the size of a picture (a block of documents in its column of READING, at its size), a WebP's size read from its header, which picture a row shows (its theme, the UI's language where it has a pair in it), the card's edges on the screen's step of device pixels, its size and place beside the menu (right, left, under or above the row, never over it, none without room), Gallery's own pictures made of the code there is now (src/cli/pack-pictures.json) and how they are made (a habit's dates moved up, a forecast of their own), whose pictures gallery block check writes (not Gallery's own, nor a pack's), a recipe copying none, and gallery block check giving a card and a block of documents made from nothing their two pictures, saying nothing of them, a block of documents that reads its own document pictured as it reads it, writing none again when nothing changed, none when it fails.");
