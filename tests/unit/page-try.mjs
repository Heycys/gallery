import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { USERS_MARK } from "../../src/cli/page-check.mjs";
import { baseOf, readPage, withCardIds } from "../../src/shared/page-cards.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { findPreviewServer, portIsFree, processRuns } from "../../src/shared/preview-server.mjs";
import { findBrowser } from "../../src/transfer/browser.mjs";

// gallery page try and gallery page check run as a user runs them (src/cli/page-try.mjs, page-check.mjs),
// in a workspace of their own, its server started by the first command on a port of GALLERY_TEST_PORTS
// (else 4200-4260) and stopped in the end, in the machine's Chrome or Edge (none: the test says so and
// stops). A page desk with Gallery's note and habit and a block of the test's own: words typed in the
// note through an input method and committed (one write of its data part, said line by line, one Ctrl+Z
// of the page's own undo giving the copy back, a fresh page reading it back), the habit's press and its
// name in steps (two writes, two Ctrl+Z), a press kept with --keep (page.html holds it, every other card
// byte for byte as it was), page.html never written by a trial on a scratch copy and no copy left; a
// block whose press also moves another card (a write outside its card's data parts: exit 1, named); a
// card the page has not and a selector that finds nothing (exit 2). Then page check: the page as it is
// (exit 0, six pictures, no change since the version the page service kept before its last write, the
// page kept as the next check's baseline), a data part written by hand since (said with its lines, none
// of it marked the user's), a card a reader moved since through the running server's page service (said
// as the user's own, on the page), and
// a page with a script, two cards sharing cells, a picture not in its assets/ and a card whose content
// does not fit it (exit 1, each at its line, at the widths it was found at, no baseline kept). And the
// look itself on a page of its own that asks a server for the workspace's facts (lookWaits): it waits for
// the answers, a card drawn after one pictured drawn, and says of a card whose read is never answered that
// its picture shows it before it drew what it reads (a note, no failure).

const run = promisify(execFile);
const bin = path.join(projectRoot, "src", "cli", "bin.mjs");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-page-try-"));
const previousData = process.env.GALLERY_DATA_DIR;
process.env.GALLERY_DATA_DIR = path.join(root, 'data');
const workspace = path.join(root, "workspace");
const [low, high] = (/^(\d+)-(\d+)$/.exec(process.env.GALLERY_TEST_PORTS ?? "") ?? [0, 4200, 4260]).slice(1).map(Number);
const env = { GALLERY_NO_BROWSER: "1", GALLERY_NO_UPDATE_CHECK: "1", GALLERY_NO_DEFAULT_HOME: "1", GALLERY_NO_PACKS: "1" };
const gallery = async (...args) => {
  try {
    const { stdout, stderr } = await run(process.execPath, [bin, "--workspace", workspace, ...args], { cwd: root, env: { ...process.env, GALLERY_DEFAULT_WORKSPACE: workspace, ...env }, maxBuffer: 1 << 24, timeout: 300_000 });
    return { code: 0, stdout, stderr };
  } catch (error) {
    if (typeof error.code !== "number") throw error;
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
};
const lines = (text) => text.split(/\r?\n/).filter(Boolean);
const page = path.join(workspace, "pages", "desk", "page.html");
const read = () => fs.readFileSync(page, "utf8");
const scratch = () => fs.readdirSync(path.join(workspace, ".gallery", "try")).filter((name) => name.startsWith("try-"));
let server = null;

// A block of the test's own whose press writes its count and, a moment after, moves card c1 through the
// page service, as no block may: a write outside its card's data parts.
const MEDDLER = {
  "component.json": JSON.stringify({ id: "local/meddler", apiVersion: 1, version: "1.0.0", name: { zh: "捣乱", en: "Meddler" }, description: { zh: "按一下，还挪别的卡片", en: "A press that moves another card too" }, parts: { count: { at: ":scope > script", edit: "data" } }, runtime: { generated: [":scope > .meddler-press"] }, places: ["page"], card: { w: 2, h: 2 } }, null, 2),
  "template.html": '<div data-doc-component="local/meddler">\n  <script type="application/json">{ "n": 0 }</script>\n</div>\n',
  "kit.js": `DocKit.component({
  id: "local/meddler",
  on: ["source"],
  mount(host, context) {
    const press = document.createElement("button");
    press.type = "button";
    press.className = "meddler-press";
    press.textContent = "+1";
    host.append(press);
    context.listen(press, "click", () => {
      context.editJSON("count", (data) => { data.n += 1; });
      const other = document.querySelector('.gallery-card[data-card-id="c1"]');
      const map = JSON.parse(document.querySelector("script[data-ge-page]").textContent);
      context.timeout(() => fetch("/__gallery/pages/" + map.slug + "/cards", { method: "POST", headers: { "Content-Type": "application/json", "X-Gallery-Token": map.token }, body: JSON.stringify({ op: "place", card: "c1", x: 0, y: 6, w: 4, h: 2, base: other.dataset.geBase }) }), 150);
    });
    return { update() {} };
  },
});
`,
};
// A block whose content is taller than its card: a page check finds it does not fit.
const TALL = {
  "component.json": JSON.stringify({ id: "local/tall", apiVersion: 1, version: "1.0.0", name: { zh: "长", en: "Tall" }, description: { zh: "放不下", en: "Too tall" }, parts: {}, places: ["page"], card: { w: 2, h: 1 } }, null, 2),
  "template.html": `<div data-doc-component="local/tall">\n${Array.from({ length: 12 }, (_, index) => `  <p>第 ${index + 1} 行</p>`).join("\n")}\n</div>\n`,
};
const writeBlock = (id, files) => {
  const folder = path.join(workspace, "components", ...id.split("/"));
  fs.mkdirSync(folder, { recursive: true });
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(folder, name), text);
};

// What runs where the machine has a browser (run.mjs runs every file in one process: no exit here).
async function inBrowser() {
  let port = null;
  for (let candidate = low; candidate <= high && port === null; candidate++) if (await portIsFree(candidate)) port = candidate;
  assert.ok(port, `a free port in ${low}-${high}`);
  env.GALLERY_PORT = String(port);
  assert.equal((await gallery("init", workspace)).code, 0);
  for (const name of ["note", "habit"]) assert.equal((await gallery("block", "add", name)).code, 0);
  writeBlock("local/meddler", MEDDLER);
  writeBlock("local/tall", TALL);
  assert.equal((await gallery("page", "new", "desk", "桌面")).code, 0);
  for (const block of ["note", "habit", "local/meddler"]) assert.equal((await gallery("page", "add", "desk", block)).code, 0, block);
  const made = read();
  assert.ok(/data-card-id="c1"[^>]*>\s*<div data-doc-component="gallery\/note"/.test(made) && /data-card-id="c3"[^>]*>\s*<div data-doc-component="local\/meddler"/.test(made), made);

  // Words typed in the note through an input method, then Ctrl+Enter: its data part, one Ctrl+Z, a fresh page.
  const typed = await gallery("page", "try", "desk", "c1", "--type", ".gallery-note-field", "买牛奶", "--then", "Control+Enter");
  server = JSON.parse(fs.readFileSync(path.join(process.env.GALLERY_DATA_DIR, "server.json"), "utf8")).pid;
  assert.equal(typed.code, 0, typed.stdout + typed.stderr);
  const said = lines(typed.stdout);
  assert.ok(said[0].startsWith("gallery/note in card c1 of desk, at page.html:") && said[1].startsWith(`Page: http://127.0.0.1:${port}/pages/try-`) && said[1].includes("(a scratch copy of desk"), said.join("\n"));
  assert.ok(said.includes("Wrote: note (-1 +1 of its 1 line); nothing else in page.html changed (card ids aside)") && said.includes('  + {"text":"买牛奶"}'), said.join("\n"));
  assert.ok(said.includes("Undone: one Ctrl+Z, and the copy of page.html is as it was (card ids aside)") && said.some((line) => line.startsWith("Read back: a fresh page of what the typing wrote")), said.join("\n"));
  assert.equal(said.at(-1), "OK   desk: the typing wrote note, one Ctrl+Z took it back, and a fresh page read it back; page.html not written (a scratch copy)");
  const picture = said.find((line) => line.startsWith("Picture of the instance after the typing: ")).match(/: (.*after\.png)/)[1];
  assert.ok(fs.existsSync(picture) && picture.includes(path.join(".gallery", "qa", "desk", "try")), picture);
  assert.equal(read(), made, "page.html as it was, to the byte");
  assert.deepEqual(scratch(), [], "no copy left");

  // The habit's press and its name, in steps: two writes, two Ctrl+Z.
  const stepsFile = path.join(root, "steps.json");
  fs.writeFileSync(stepsFile, JSON.stringify([{ press: ".gallery-habit-check" }, { type: [".gallery-habit-name", "喝水"], then: "Enter" }]));
  const stepped = await gallery("page", "try", "desk", "c2", "--steps", stepsFile);
  assert.equal(stepped.code, 0, stepped.stdout + stepped.stderr);
  const steps = lines(stepped.stdout);
  assert.equal(steps.filter((line) => line === "Wrote: habit (-1 +1 of its 1 line); nothing else in page.html changed (card ids aside)").length, 2, steps.join("\n"));
  assert.ok(steps.includes("Undone: 2 Ctrl+Z, one for each step that wrote, the last first, each giving the copy of page.html back as it was before its step (card ids aside)"), steps.join("\n"));
  assert.equal(steps.at(-1), "OK   desk: the steps wrote habit, 2 Ctrl+Z took them back, and a fresh page read them back; page.html not written (a scratch copy)");
  assert.equal(read(), made);

  // --replace in a step: the field's words selected first, so that the second typing takes the place of the first
  // (and not go after it); the Gesture line says what the field held. With --type alone: refused otherwise.
  fs.writeFileSync(stepsFile, JSON.stringify([{ type: [".gallery-note-field", "旧的"], then: "Control+Enter" }, { type: [".gallery-note-field", "新的"], replace: true, then: "Control+Enter" }]));
  const replaced = await gallery("page", "try", "desk", "c1", "--steps", stepsFile);
  assert.equal(replaced.code, 0, replaced.stdout + replaced.stderr);
  const replacedSaid = lines(replaced.stdout);
  assert.ok(replacedSaid.some((line) => line.startsWith('Step 2: "新的" typed in .gallery-note-field') && line.includes('all it held ("旧的") selected first (--replace), so that the words took its place')), replaced.stdout);
  assert.ok(replacedSaid.includes('  + {"text":"新的"}') && !replaced.stdout.includes("旧的新的"), replaced.stdout);
  assert.equal(replacedSaid.at(-1), "OK   desk: the steps wrote note, 2 Ctrl+Z took them back, and a fresh page read them back; page.html not written (a scratch copy)");
  const replaceAlone = await gallery("page", "try", "desk", "c1", "--press", ".gallery-note-field", "--replace");
  assert.equal(replaceAlone.code, 2, replaceAlone.stdout);
  assert.match(replaceAlone.stderr, /^--replace goes with --type: it selects what the field holds before the words go in\./);
  assert.equal(read(), made, "page.html as it was");

  // --keep: page.html holds the press, every other card byte for byte as it was.
  const kept = await gallery("page", "try", "desk", "c2", "--press", ".gallery-habit-check", "--keep");
  assert.equal(kept.code, 0, kept.stdout + kept.stderr);
  assert.ok(lines(kept.stdout).includes("Kept (--keep): page.html holds what the press wrote") && lines(kept.stdout).at(-1) === "OK   desk: the press wrote habit, kept (--keep), and a fresh page read it back", kept.stdout);
  const after = read();
  const cardOf = (text, id) => text.match(new RegExp(`<section class="gallery-card" data-card-id="${id}"[\\s\\S]*?</section>`))[0];
  assert.ok(/"days":\["\d{4}-\d\d-\d\d"\]/.test(cardOf(after, "c2")), cardOf(after, "c2"));
  for (const id of ["c1", "c3"]) assert.equal(cardOf(after, id), cardOf(made, id), `card ${id} as it was`);
  assert.equal(after.replace(cardOf(after, "c2"), ""), made.replace(cardOf(made, "c2"), ""), "and the rest of page.html");
  fs.writeFileSync(page, made);

  // A press that also moves another card: a write outside the card's data parts, named; page.html as it was.
  const meddled = await gallery("page", "try", "desk", "c3", "--press", ".meddler-press");
  assert.equal(meddled.code, 1, meddled.stdout + meddled.stderr);
  const meddledSaid = lines(meddled.stdout);
  assert.ok(meddledSaid.includes("Wrote: count (-1 +1 of its 1 line); and outside card c3's data parts: card c1 (gallery/note)'s place, x 0, y 0, w 4, h 2 then x 0, y 6, w 4, h 2, where a reader's gesture on the card is to change its data parts alone"), meddledSaid.join("\n"));
  assert.ok(meddledSaid.some((line) => /^ {2}FAIL page\.html:\d+: the press changed page\.html outside card c3's data parts: card c1 \(gallery\/note\)'s place/.test(line)) && meddledSaid.at(-1) === "FAIL desk: 1 problem", meddledSaid.join("\n"));
  assert.equal(read(), made);
  assert.deepEqual(scratch(), []);

  // Mistakes in the command line: a card the page has not, a selector that finds nothing.
  const noCard = await gallery("page", "try", "desk", "c9", "--press", ".x");
  assert.equal(noCard.code, 2);
  assert.ok(noCard.stderr.startsWith("desk has no card c9: its cards are\n  c1  gallery/note  x 0, y 0, w 4, h 2  on board main\n  c2  gallery/habit"), noCard.stderr);
  const nothing = await gallery("page", "try", "desk", "c1", "--press", ".none");
  assert.equal(nothing.code, 2, nothing.stdout + nothing.stderr);
  assert.ok(nothing.stderr.startsWith("Nothing in the instance is .none: what it shows has .gallery-note-head, .gallery-note-chip, .gallery-note-title, .gallery-note-meta, .gallery-note-field"), nothing.stderr);
  assert.equal(read(), made);

  // gallery page check of the page as it is: nothing wrong, its pictures, its changes, kept as the baseline.
  const checked = await gallery("page", "check", "desk");
  assert.equal(checked.code, 0, checked.stdout + checked.stderr);
  const checkSaid = lines(checked.stdout);
  assert.ok(checkSaid.includes("  c3  local/meddler  x 8, y 0, 2 × 2  page.html:" + (made.split("\n").findIndex((line) => line.includes('data-card-id="c3"')) + 1)), checkSaid.join("\n"));
  // The page service kept page.html as made before the --keep press wrote it (the test then wrote it back).
  assert.ok(checkSaid.some((line) => /^No change since the page as it was before its last write \(\d{4}-\d\d-\d\d \d\d:\d\d, local time; used because no check has passed yet\): every card where it was, with the data it had\.$/.test(line)), checkSaid.join("\n"));
  const pictures = path.join(workspace, ".gallery", "qa", "desk", "check");
  assert.deepEqual(fs.readdirSync(pictures).sort(), ["1280-dark.png", "1280-light.png", "1920-dark.png", "1920-light.png", "600-dark.png", "600-light.png"]);
  assert.ok(checkSaid.some((line) => line.startsWith("提示：6 pictures in ") && line.includes("(the whole of it: ") && line.includes("check/1280-light.png") && line.endsWith("none needs opening; open one when you want to see it")), checkSaid.join("\n"));
  assert.equal(checkSaid.at(-1), "OK   desk: its structure, and its 3 cards at 1280, 1920, 600px in light and dark");
  assert.equal(fs.readFileSync(path.join(workspace, ".gallery", "qa", "desk", "checked.html"), "utf8"), made, "the page kept, for the next check");
  assert.equal(read(), made, "nothing written");
  assert.deepEqual(scratch(), []);

  // A data part written since: said with its lines, against the last check.
  fs.writeFileSync(page, made.replace('{"text":""}', '{"text":"记得浇花"}'));
  const again = await gallery("page", "check", "desk");
  assert.equal(again.code, 0, again.stdout + again.stderr);
  assert.ok(lines(again.stdout).some((line) => line.startsWith("Changes since the last check that found nothing (")) && again.stdout.includes('  data     c1 (gallery/note): note (-1 +1 of its 1 line)\n           - {"text":""}\n           + {"text":"记得浇花"}\n  The other 2 cards as they were.'), again.stdout);
  assert.ok(!again.stdout.includes(USERS_MARK), "a change by hand is none of the user's on the page");

  // A reader's gesture since, through the running server's page service (a move, as the board sends it):
  // the next check names it as the user's own, to be left as it is.
  const running = await findPreviewServer();
  const host = `127.0.0.1:${running.port}`;
  const withIds = withCardIds(read()).text;
  const meddler = readPage(withIds).cards.find((one) => one.id === "c3");
  const moved = await (await fetch(`http://${host}/__gallery/pages/desk/cards`, { method: "POST", headers: { "Content-Type": "application/json", Origin: `http://${host}`, "X-Gallery-Token": running.token }, body: JSON.stringify({ op: "place", card: "c3", x: 8, y: 2, w: 2, h: 2, base: baseOf(withIds, meddler) }) })).json();
  assert.equal(moved.ok, true, JSON.stringify(moved));
  const afterMove = read();
  const marked = await gallery("page", "check", "desk");
  assert.equal(marked.code, 0, marked.stdout + marked.stderr);
  const markedSaid = lines(marked.stdout);
  assert.ok(markedSaid.includes(`  moved    c3 (local/meddler): x 8, y 0, 2 × 2 then x 8, y 2, 2 × 2 ${USERS_MARK}`) && markedSaid.some((line) => line.startsWith(`  Each change marked ${USERS_MARK} is the user's own gesture on the page since then`)), marked.stdout);

  // A page with what is wrong: two cards sharing cells, a picture not there, content that does not fit; and a script of its own, which is none of it (a page is free HTML).
  const wrong = made
    .replace("</head>", "  <script>console.log(1)</script>\n</head>")
    .replace('<div class="gallery-board"', '<img src="assets/gone.png" alt="">\n    <div class="gallery-board"')
    .replace(/(\n\s*)<\/div>\n\s*<\/main>/, '$1  <section class="gallery-card" data-card-id="c4" data-x="2" data-y="1" data-w="2" data-h="1">\n        <div data-doc-component="local/tall"><p>1</p><p>2</p><p>3</p><p>4</p><p>5</p><p>6</p><p>7</p><p>8</p></div>\n      </section>$&');
  fs.writeFileSync(page, wrong);
  const failing = await gallery("page", "check", "desk");
  assert.equal(failing.code, 1, failing.stdout + failing.stderr);
  const failed = lines(failing.stdout);
  const lineOf = (needle) => wrong.split("\n").findIndex((line) => line.includes(needle)) + 1;
  for (const want of [
    `  FAIL page.html:${lineOf('data-card-id="c4"')}: card c4 (x 2, y 1, 2 × 1) shares cells with card c1 (x 0, y 0, 4 × 2): no two cards of a board overlap`,
    `  FAIL page.html:${lineOf("assets/gone.png")}: <img>'s src "assets/gone.png": assets/gone.png is not in the page's folder`,
    `  FAIL page.html:${lineOf('data-card-id="c4"')}: card c4: what it holds does not fit it: `,
  ]) assert.ok(failed.some((line) => line.startsWith(want)), `${want}\n${failed.join("\n")}`);
  assert.ok(failed.some((line) => /^ {2}FAIL page\.html:\d+: card c4: what it holds does not fit it: .*\(at 1280, 1920 and 600px\)$/.test(line)), failed.join("\n"));
  assert.ok(!failed.some((line) => line.includes("<script>")), "its own script: no problem");
  assert.ok(failed.at(-1).startsWith("FAIL desk: "), failed.at(-1));
  assert.equal(fs.readFileSync(path.join(workspace, ".gallery", "qa", "desk", "checked.html"), "utf8"), afterMove, "a check that found something keeps no baseline");
  assert.equal(read(), wrong, "nothing written");
  assert.deepEqual(scratch(), []);
}

// The look itself (page-check.mjs `look`), on a page of the test's own served by a tiny server that
// answers a read of the workspace as the test says: a card whose block's kit.js asks for "recent", which the
// server answers after SLOW ms and the card then draws something wider than itself (so that a look that
// pictured it before the answer finds nothing wrong, and one after finds the problem); a card whose kit.js
// asks for "todos", which the server never answers; and a card of the page's own script that asks for
// "stats" (no block to name), never answered either, the card of a block that reads the workspace being
// the one it is told of. Each look waits for the answers WAIT ms: the first card is drawn when it is
// pictured and is no note, the second and the third are notes (no failure), each said at its card.
async function lookWaits() {
  const { look } = await import("../../src/cli/page-check.mjs");
  const { lookingArguments, startBrowser } = await import("../../src/transfer/browser.mjs");
  const SLOW = 900;
  const WAIT = 1800;
  const held = new Set();
  const kit = (kind, after) => `fetch("/__gallery/workspace/query?kind=${kind}").then((response) => response.json()).then(() => { ${after} });`;
  const scripts = {
    "/__gallery/components/local/reader/kit.js": kit("recent", `document.querySelector('[data-doc-component="local/reader"]').innerHTML = '<div style="width:900px">drawn after the answer</div>';`),
    "/__gallery/components/local/hung/kit.js": kit("todos", ""),
  };
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>reads</title></head><body><main class="gallery-page"><div class="gallery-board" data-columns="12">
<div class="gallery-card" data-card-id="c1" style="width:300px;height:80px;overflow:auto"><div data-doc-component="local/reader"></div></div>
<div class="gallery-card" data-card-id="c2" style="width:300px;height:80px"><div data-doc-component="local/hung"></div></div>
<div class="gallery-card" data-card-id="c3" style="width:300px;height:80px"><div data-doc-component="local/mute"></div></div>
</div></main>
<script src="/__gallery/components/local/reader/kit.js"></script><script src="/__gallery/components/local/hung/kit.js"></script>
<script>${kit("stats", "")}
document.documentElement.setAttribute("data-doc-ready", ""); document.documentElement.setAttribute("data-doc-drawn", "");</script></body></html>`;
  const http = await import("node:http");
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://x");
    if (url.pathname === "/") response.writeHead(200, { "Content-Type": "text/html" }).end(page);
    else if (scripts[url.pathname]) response.writeHead(200, { "Content-Type": "text/javascript" }).end(scripts[url.pathname]);
    else if (url.pathname === "/__gallery/workspace/query" && url.searchParams.get("kind") === "recent") setTimeout(() => response.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true,"data":[]}'), SLOW);
    else if (url.pathname === "/__gallery/workspace/query") { held.add(response); response.on("close", () => held.delete(response)); } // never answered
    else response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const running = await startBrowser({ executablePath: findBrowser(), args: lookingArguments() });
  const out = path.join(root, "look");
  fs.mkdirSync(out, { recursive: true });
  try {
    const seen = await look(running.browser, { address: `http://127.0.0.1:${server.address().port}/`, out, readers: new Set(["local/mute"]), wait: WAIT });
    assert.equal(seen.unverified, null);
    assert.ok(seen.problems.some(({ card, what }) => card === "c1" && /^what it holds is wider than the card: 900px in a card \d+px wide$/.test(what)), `the card drawn after the answer, pictured after it: ${JSON.stringify(seen.problems)}`);
    assert.deepEqual(seen.notes.map(({ card, what, looks }) => [card, /^the workspace had not answered its read of "(todos|stats)" \d+ s after it asked, so its picture shows it before it drew what it reads, which the picture then does not tell \(open the page in Gallery to see it\)$/.test(what), looks.length]).sort(), [["c2", true, 6], ["c3", true, 6]], JSON.stringify(seen.notes));
    assert.equal(seen.notes.find(({ card }) => card === "c2").what.includes('"todos"') && seen.notes.find(({ card }) => card === "c3").what.includes('"stats"'), true, "each card told its own read: c2's by the kit.js that asked, c3's by being a card of a block that reads the workspace");
    assert.equal(seen.pictures.length, 6);
  } finally {
    await running.close();
    for (const response of held) response.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
}

const browser = findBrowser();
try {
  if (browser) {
    await inBrowser();
    await lookWaits();
  }
} finally {
  if (server && processRuns(server)) {
    try {
      process.kill(server);
    } catch {} // gone meanwhile
  }
  if (previousData === undefined) delete process.env.GALLERY_DATA_DIR;
  else process.env.GALLERY_DATA_DIR = previousData;
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 });
}
console.log(!browser ? "Checked nothing of gallery page try and check: no Chrome, Edge or Chromium on this machine." : "Checked gallery page try and gallery page check in a browser: a note's words typed through an input method, one write of its data part undone by the page's own Ctrl+Z and read back; a habit's steps, two writes and two Ctrl+Z; a press kept with --keep, every other card as it was; page.html never written by a trial on a scratch copy and no copy left; a block whose press moves another card, named, exit 1; a card the page has not and a selector that finds nothing, exit 2; a page checked as it is (six pictures, its changes since the page service's kept version, kept as the baseline), a data part written since (its lines, against the last check, none of it the user's), a card a reader moved since through the page service (marked the user's own), and a page with a script, cards sharing cells, a picture not there and content that does not fit, each at its line; and the look on a page of its own, waiting for the workspace's answers (a card drawn after one pictured drawn) and saying of a card whose read is never answered that its picture shows it before it drew what it reads (a note, no failure).");
