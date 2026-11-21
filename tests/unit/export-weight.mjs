import "./workspace-env.mjs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import { projectRoot } from "../../src/shared/paths.mjs";
import os from "node:os";
import path from "node:path";
import { JSDOM } from "jsdom";
import { loadKitFile } from "../../src/render/kit-build.mjs";
import { parseReport } from "../../src/render/report-tree.mjs";
import { offlineReports } from "../../src/render/pipeline.mjs";
import { GRAMMARS, carriedGrammars, grammarOf, grammarsFor, keptGrammars, pageGrammars } from "../../src/shared/code-grammars.mjs";
import { lighter, pictureCeiling, pictureFacts, pictureTask } from "../../src/shared/export-pictures.mjs";
import { pictureJobs, smallerPictures } from "../../src/render/export-pictures.mjs";
import { closeSharedBrowser, encodePictures, findBrowser, sandboxArguments, startBrowser } from "../../src/transfer/browser.mjs";

// What an export weighs (feedback of 2026-11-17).
//   code grammars   code.js carries Shiki's grammars a line each (src/shared/code-grammars.mjs); an export keeps
//       those its code blocks and diffs use and those they embed (HTML: JavaScript and CSS), all of them where
//       a script of the page names DocCode or puts a code block or a diff on the page as it runs; the source's
//       reading (pageGrammars, the command's and the workbench's export) and the kit's (code.js grammarsUsed, the
//       reader's 导出当前视图副本) agree on every page here, and a block whose language is its code's class alone
//       keeps it once drawn; a file that carries a few colors those and draws any other language plain, failing
//       nowhere.
//   pictures   an export's copy of each <img>'s picture as light as the page needs (src/shared/export-pictures.mjs):
//       the ceiling by the look, what a header says, which are tried, smallerPictures with an encoder of the test's
//       (one picture it cannot read left as it is, the others made) and with none; then real pictures in Chrome or
//       Edge, exported (where one is installed), pictures longer than a WebP holds made whole, and one the browser
//       cannot read an error of its own.

const root = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-export-weight-"));
const code = (language, title, text) => `<div class="doc-code"${language ? ` data-language="${language}"` : ""}><div class="doc-code-title">${title}</div><pre><code>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</code></pre></div>`;

// ---------- the grammars an export carries ----------
{
  assert.equal(grammarOf("bash"), "shellscript");
  assert.equal(grammarOf("SH"), "shellscript");
  assert.equal(grammarOf("ts"), "typescript");
  assert.equal(grammarOf("text"), null);
  assert.equal(grammarOf("rust"), null);
  assert.deepEqual([...grammarsFor(["html", "json", "rust", "text", undefined])].sort(), ["css", "html", "javascript", "json"], "HTML brings what it embeds");

  const json = code("json", "config.json", '{\n  "a": 1\n}');
  const pages = {
    none: [`<p>没有代码。</p>`, []],
    json: [json, ["json"]],
    five: [[code("python", "a.py", "print(1)"), code("typescript", "a.ts", "let a = 1"), code("bash", "a.sh", "ls"), code("sql", "a.sql", "select 1"), code("yaml", "a.yaml", "a: 1")].join(""), ["python", "shellscript", "sql", "typescript", "yaml"]],
    html: [code("html", "", "<p>x</p>"), ["css", "html", "javascript"]],
    // Without a language of its own: its title's extension, else what its code looks like.
    titled: [code(null, "build.sh", "make all"), ["shellscript"]],
    guessed: [code(null, "", "def score(values):\n    return sum(values)\n"), ["python"]],
    classed: [`<div class="doc-code"><pre><code class="language-yaml">a: 1</code></pre></div>`, ["yaml"]],
    diff: [`<div class="doc-diff"><div class="doc-code-title">src/a.ts</div><script type="application/json">{"path":"src/a.ts","lines":[{"type":"added","content":"let a: number = 1;"}]}</script></div>`, ["typescript"]],
    diffLanguage: [`<div class="doc-diff"><div class="doc-code-title">x</div><script type="application/json">{"language":"python","lines":[{"type":"added","content":"x = 1"}]}</script></div>`, ["python"]],
    unknown: [code("rust", "main.rs", "fn main() {}"), []],
    template: [`<template>${code("sql", "", "select 1")}</template>`, ["sql"]],
    // A script of JSON is data; the kit's own scripts are not the page's.
    data: [`${json}<script type="application/json">{"DocCode": 1}</script><script data-doc-kit="code-inline">DocCode</script>`, ["json"]],
    // A script, an event handler or a javascript: address that names the kit's code (by its old name too): all of them.
    script: [`${json}<script>DocCode.drawLines(document.body, "x = 1", "python");</script>`, null],
    module: [`${json}<script type="module">globalThis.DocCode.draw(block)</script>`, null],
    handler: [`${json}<button onclick="ReportCode.draw(this.parentNode)">再画</button>`, null],
    address: [`${json}<a href="javascript:DocCode.colorAll()">上色</a>`, null],
    package: [`${json}<script data-doc-package="local/x">DocCode.drawLines(host, text, lang)</script>`, null],
    // A script that puts a code block or a diff on the page as it runs (a document's, a custom block's): the kit
    // draws it though no source holds it, so all of them; a script that names neither leaves the page's own.
    madeBlock: [`${json}<script>const block = document.createElement("div"); block.className = "doc-code"; block.dataset.language = "python"; host.after(block);</script>`, null],
    madeDiff: [`${json}<script data-doc-package="local/y">host.innerHTML = '<div class="doc-diff"><script type="application/json">{}<\\/script></div>';</script>`, null],
    madeOld: [`${json}<button onclick="this.after(Object.assign(document.createElement('div'), { className: 'report-code' }))">加</button>`, null],
    other: [`${json}<script>document.title = "代码 " + document.querySelectorAll("pre").length;</script>`, ["json"]],
  };
  const sources = { runtime: await loadKitFile("runtime.js"), state: await loadKitFile("state.js"), tokens: await loadKitFile("tokens.js"), code: await loadKitFile("code.js") };
  assert.deepEqual(carriedGrammars(sources.code), Object.keys(GRAMMARS), "code.js carries every grammar, in the list's order, a line each");
  const kit = (codeSource, body = "") => {
    const dom = new JSDOM(`<!doctype html><html><head></head><body>${body}</body></html>`, { url: "https://report.test/doc.html", runScripts: "outside-only" });
    const w = dom.window;
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    w.requestAnimationFrame = () => 0;
    for (const name of ["runtime", "state", "tokens"]) w.eval(sources[name]);
    w.eval(codeSource);
    return w;
  };
  const w = kit(sources.code);
  for (const [name, [body, expected]] of Object.entries(pages)) {
    const page = `<!doctype html><html><head></head><body><main class="doc-page">${body}</main></body></html>`;
    const read = pageGrammars(parseReport(page));
    assert.deepEqual(read && [...read].sort(), expected, `${name}: the source's reading`);
    const own = w.DocCode.grammarsUsed(new w.DOMParser().parseFromString(page, "text/html"));
    assert.deepEqual(own && [...own].sort(), expected, `${name}: the kit's reading of the page agrees`);
    const kept = carriedGrammars(keptGrammars(sources.code, read));
    assert.deepEqual(kept, Object.keys(GRAMMARS).filter((grammar) => read === null || read.has(grammar)), `${name}: the lines kept`);
  }

  // A file that carries JSON's alone: JSON colored, Python and Rust plain, HTML (whose embeds it lacks) plain, nothing thrown.
  const few = kit(keptGrammars(sources.code, new Set(["json", "html"])));
  assert.deepEqual(Object.keys(few.DocCodeGrammars), ["json", "html"]);
  const target = few.document.createElement("div");
  const drawn = (text, language) => {
    few.DocCode.drawLines(target, text, language);
    return { text: target.textContent, colored: target.querySelectorAll("span[style*=color]").length };
  };
  assert.ok(drawn('{"a": 1}', "json").colored > 0, "JSON colored");
  for (const [text, language] of [["def f():\n    return 1", "python"], ["fn main() {}", "rust"], ["<p>x</p>", "html"]]) {
    assert.deepEqual(drawn(text, language), { text, colored: 0 }, `${language}: plain text, as written`);
  }
  // The whole file colors HTML (its embeds with it).
  const whole = w.document.createElement("div");
  w.DocCode.drawLines(whole, "<p onclick=\"go()\">x</p>", "html");
  assert.ok(whole.querySelectorAll("span[style*=color]").length > 0, "the whole file colors HTML");
  // A block whose language is only its code's language-<id> class keeps it once drawn (its colors later, its folds,
  // its label, and what an export of the view reads), never what its code looks like: SQL in a Python block is
  // Python's, as the source's reading says.
  const classed = `<div class="doc-code"><div class="doc-code-title">示例</div><pre><code class="language-python">SELECT a FROM t WHERE b = 1;</code></pre></div>`;
  assert.deepEqual([...pageGrammars(parseReport(`<main class="doc-page">${classed}</main>`))], ["python"]);
  const host = w.document.createElement("main");
  host.innerHTML = classed;
  w.document.body.append(host);
  const block = host.querySelector(".doc-code");
  w.DocCode.draw(block);
  assert.equal(w.DocCode.languageOf(block), "python", "drawn, still Python");
  assert.deepEqual([...w.DocCode.grammarsUsed(host)], ["python"], "the kit's reading of the drawn page: Python");
  w.DocCode.draw(block);
  assert.equal(w.DocCode.languageOf(block), "python", "drawn again, still Python");
  host.remove();
}

// ---------- an export of a document: what it carries of code.js ----------
{
  const directory = path.join(root, "workspace");
  const page = (slug, body) => `<!doctype html>\n<html lang="zh-CN">\n<head>\n  <meta charset="utf-8">\n  <title>${slug}</title>\n</head>\n<body>\n  <main class="doc-page" data-doc-id="${slug}">\n    <header class="doc-header"><h1 class="doc-title">${slug}</h1></header>\n    ${body}\n  </main>\n</body>\n</html>\n`;
  const documents = {
    "code-none": [`<p>没有代码。</p>`, ""],
    "code-json": [code("json", "config.json", '{\n  "a": 1\n}'), "json"],
    "code-five": [[code("python", "a.py", "print(1)"), code("typescript", "a.ts", "let a = 1"), code("bash", "a.sh", "ls"), code("sql", "a.sql", "select 1"), code("yaml", "a.yaml", "a: 1")].join("\n    "), "typescript python shellscript sql yaml"],
  };
  for (const [slug, [body]] of Object.entries(documents)) {
    await fs.mkdir(path.join(directory, slug), { recursive: true });
    await fs.writeFile(path.join(directory, slug, "doc.html"), page(slug, body));
    await fs.writeFile(path.join(directory, slug, "doc.json"), JSON.stringify({ title: slug }));
  }
  const render = await offlineReports({ directory });
  for (const [slug, [, expected]] of Object.entries(documents)) {
    const html = await render(slug);
    const script = /<script data-doc-kit="code-inline">([\s\S]*?)<\/script>/.exec(html)?.[1];
    if (!expected) assert.equal(script, undefined, `${slug}: no code.js`);
    else assert.equal(carriedGrammars(script).join(" "), expected, `${slug}: the grammars its code uses`);
  }
}

// ---------- the pictures an export embeds: which are tried, and how light ----------
// Headers alone (the rest zeros): what pictureFacts reads and pictureTask decides of them.
const chunk = (type, data = Buffer.alloc(0)) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  return Buffer.concat([head, data, Buffer.alloc(4)]);
};
const pad = (bytes, size) => Buffer.concat([bytes, Buffer.alloc(Math.max(0, size - bytes.length))]);
const pngOf = (width, height, size, { animated = false } = {}) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  return pad(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), ...(animated ? [chunk("acTL", Buffer.alloc(8))] : []), chunk("IDAT")]), size);
};
const jpegOf = (width, height, size) => {
  const frame = Buffer.from([0xff, 0xc0, 0, 17, 8, 0, 0, 0, 0, 3]);
  frame.writeUInt16BE(height, 5);
  frame.writeUInt16BE(width, 7);
  return pad(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0]), frame]), size);
};
// A WebP's chunk: its four letters, then its length (little-endian), as RIFF writes it.
const riffChunk = (type, data) => {
  const head = Buffer.alloc(8);
  head.write(type, 0, "latin1");
  head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, data]);
};
const webpOf = (kind, width, height, size, { animated = false } = {}) => {
  let body;
  if (kind === "VP8X") {
    body = Buffer.alloc(10);
    body[0] = animated ? 0x02 : 0;
    body.writeUIntLE(width - 1, 4, 3);
    body.writeUIntLE(height - 1, 7, 3);
    body = Buffer.concat([riffChunk("VP8X", body), animated ? riffChunk("ANIM", Buffer.alloc(6)) : riffChunk("VP8L", Buffer.alloc(5))]);
  } else if (kind === "VP8 ") {
    const frame = Buffer.alloc(10);
    frame.writeUInt16LE(width, 6);
    frame.writeUInt16LE(height, 8);
    body = riffChunk("VP8 ", frame);
  } else body = riffChunk("VP8L", Buffer.alloc(5));
  return pad(Buffer.concat([Buffer.from("RIFF\0\0\0\0WEBP", "latin1"), body]), size);
};
{
  const KB = 1024;
  const look = (attributes) => (name) => attributes[name] ?? null;
  assert.equal(pictureCeiling(look({})), 1424, "twice the 712px column");
  assert.equal(pictureCeiling(look({ "data-doc-measure": "narrow" })), 1296);
  assert.equal(pictureCeiling(look({ "data-doc-measure": "wide" })), 1552);
  assert.equal(pictureCeiling(look({ "data-doc-measure": "wide", "data-doc-width": "full" })), Infinity, "全宽: no column");
  const facts = (bytes) => { const { format, lossless, animated, side } = pictureFacts(bytes); return `${format} ${lossless ? "lossless" : "lossy"}${animated ? " animated" : ""} ${side}`; };
  assert.equal(facts(pngOf(2000, 1400, 300 * KB)), "png lossless 2000");
  assert.equal(facts(pngOf(800, 2400, 300 * KB, { animated: true })), "png lossless animated 2400");
  assert.equal(facts(jpegOf(3840, 2160, 900 * KB)), "jpeg lossy 3840");
  assert.equal(facts(webpOf("VP8 ", 1000, 3000, 100 * KB)), "webp lossy 3000");
  assert.equal(facts(webpOf("VP8L", 0, 0, 100 * KB)), "webp lossless null");
  assert.equal(facts(webpOf("VP8X", 2000, 1000, 100 * KB)), "webp lossless 2000", "VP8X, then VP8L");
  assert.equal(facts(webpOf("VP8X", 2000, 1000, 100 * KB, { animated: true })), "webp lossless animated 2000".replace("lossless", "lossy"));
  assert.equal(facts(Buffer.from("GIF89a\x10\x00\x10\x00", "latin1")), "other lossy null");
  const task = (bytes, ceiling = 1424) => JSON.stringify(pictureTask(bytes, ceiling));
  assert.equal(task(pngOf(2000, 1400, 300 * KB)), '{"lossy":false}', "a screenshot: drawn smaller, as a WebP");
  assert.equal(task(pngOf(1000, 700, 300 * KB)), '{"lossy":false}', "within the ceiling, a PNG still written as a WebP");
  assert.equal(task(pngOf(2000, 1400, 300 * KB), Infinity), '{"lossy":false}', "全宽: a PNG as a WebP at its own width");
  assert.equal(task(pngOf(2000, 1400, 16 * KB)), "null", "16 KB or less: as it is");
  assert.equal(task(pngOf(2000, 1400, 300 * KB, { animated: true })), "null", "an animation: as it is");
  assert.equal(task(jpegOf(3840, 2160, 900 * KB)), '{"lossy":true}', "a photograph wider than the ceiling");
  assert.equal(task(jpegOf(1400, 1000, 900 * KB)), "null", "a lossy one within it: as it is");
  assert.equal(task(jpegOf(3840, 2160, 900 * KB), Infinity), "null", "全宽: a lossy one as it is");
  assert.equal(task(webpOf("VP8 ", 1000, 3000, 100 * KB)), '{"lossy":true}', "a tall lossy one: its long side over (the browser measures its width)");
  assert.equal(task(webpOf("VP8X", 2000, 1000, 100 * KB, { animated: true })), "null");
  assert.equal(task(Buffer.concat([Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'>", "latin1"), Buffer.alloc(100 * KB)])), "null", "an SVG: as it is");
  assert.ok(lighter(90, 100) && !lighter(91, 100), "a tenth lighter at least");

  // What smallerPictures takes of a file, with an encoder of the test's: each <img>'s data: URL of a PNG, JPEG or
  // WebP pictureTask takes, a picture met again asked once; a template's, a CSS background's and a srcset's left.
  const url = (bytes, type = "image/png") => `data:${type};base64,${bytes.toString("base64")}`;
  const shot = pngOf(2000, 1400, 200 * KB);
  const photo = jpegOf(3000, 2000, 200 * KB);
  const near = pngOf(2000, 1400, 100 * KB); // its copy not a tenth lighter
  const small = pngOf(100, 100, 2 * KB);
  const file = `<!doctype html><html lang="zh-CN" data-doc-measure="wide"><head></head><body><main class="doc-page">
<img src="${url(shot)}" alt="a"><img alt="b" src="${url(shot)}">
<img src="${url(photo, "image/jpeg")}" alt="c"><img src="${url(near)}" alt="d"><img src="${url(small)}" alt="e">
<div style="background: url(${url(shot)})"></div><img srcset="${url(shot)} 2x" src="${url(small)}" alt="f">
<template><img src="${url(shot)}" alt="g"></template></main></body></html>`;
  const asked = [];
  const encode = async (pictures) => pictures.map((picture) => {
    asked.push(`${picture.type} ${picture.bytes.length} ${picture.lossy} ${picture.ceiling} ${picture.quality}`);
    return Buffer.alloc(picture.bytes.length === near.length ? 95 * KB : 10 * KB, 7);
  });
  const { html, pictures } = await smallerPictures(file, encode);
  assert.deepEqual(asked, [`image/png ${shot.length} false 1552 0.9`, `image/jpeg ${photo.length} true 1552 0.9`, `image/png ${near.length} false 1552 0.9`], "each picture once, with the page's ceiling (偏宽: 1552)");
  // Each copy that went in, by the sha256 of its picture's bytes and of its own (what an export carries for its import: src/transfer/carry.mjs).
  const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const made = sha(Buffer.alloc(10 * KB, 7));
  const { copies, ...counted } = pictures;
  assert.deepEqual(counted, { tried: 4, made: 3, before: 3 * shot.length + near.length, after: 3 * 10 * KB + near.length, ceiling: 1552 });
  assert.deepEqual(copies, [{ from: sha(shot), to: made }, { from: sha(photo), to: made }], "each picture copied once, by its bytes and its copy's");
  const copy = url(Buffer.alloc(10 * KB, 7), "image/webp");
  assert.equal(html, file.replace(`<img src="${url(shot)}" alt="a"><img alt="b" src="${url(shot)}">`, `<img src="${copy}" alt="a"><img alt="b" src="${copy}">`).replace(`<img src="${url(photo, "image/jpeg")}"`, `<img src="${copy}"`), "the <img>s' src alone, all else as it was");
  // No browser: the file as it was, and why.
  const none = await smallerPictures(file, async () => { throw Object.assign(new Error("no Chrome or Edge on this machine"), { reason: "browser" }); });
  assert.equal(none.html, file);
  assert.deepEqual(none.pictures, { tried: 4, made: 0, before: 3 * shot.length + near.length, after: 0, ceiling: 1552, copies: [], failed: "no Chrome or Edge on this machine", reason: "browser" });
  assert.deepEqual(pictureJobs(file.replace(/data:image\/(png|jpeg)/g, "data:image/gif")).jobs, [], "none of another kind");
  // One picture the browser cannot read (its Error) is embedded as it is, the others' copies go in all the same.
  const unread = await smallerPictures(file, async (pictures) => pictures.map((picture) => (picture.type === "image/jpeg" ? new Error("InvalidStateError: The source image could not be decoded.") : Buffer.alloc(picture.bytes.length === near.length ? 95 * KB : 10 * KB, 7))));
  assert.equal(unread.html, html.replace(`<img src="${copy}" alt="c">`, `<img src="${url(photo, "image/jpeg")}" alt="c">`), "the JPEG as it was, the screenshots' copies in");
  assert.deepEqual(unread.pictures, { tried: 4, made: 2, before: 3 * shot.length + near.length, after: 2 * 10 * KB + photo.length + near.length, ceiling: 1552, copies: [{ from: sha(shot), to: made }], unread: 1, why: "InvalidStateError: The source image could not be decoded." });
}

// ---------- the pixels: a real browser's copies, in an export of a document ----------
// Real pictures made in the browser (a screenshot-like PNG with text, one with transparency, a photograph-like
// JPEG, small ones): the copies decode, at most the ceiling wide, the transparent pixels kept; what is left, left.
if (!findBrowser()) console.log("export-weight: no Chrome or Edge here: the pictures' copies were not made.");
else {
  const running = await startBrowser({ executablePath: findBrowser(), args: ["--no-first-run", "--no-default-browser-check", "--disable-extensions", ...sandboxArguments()] });
  try {
    const page = await running.browser.newPage();
    await page.goto("about:blank");
    const made = await page.evaluate(async () => {
      const picture = async (width, height, type, draw, quality) => {
        const canvas = new OffscreenCanvas(width, height);
        draw(canvas.getContext("2d"), width, height);
        const blob = await canvas.convertToBlob({ type, quality });
        return new Promise((done) => { const reader = new FileReader(); reader.onload = () => done(String(reader.result).split(",")[1]); reader.readAsDataURL(blob); });
      };
      const text = (g, width, height) => {
        g.fillStyle = "#fff"; g.fillRect(0, 0, width, height);
        for (let y = 40; y < height; y += 36) { g.fillStyle = y % 72 ? "#37352f" : "#c4554d"; g.font = "26px sans-serif"; g.fillText(`第 ${y} 行：一行截图里的文字 export function score(values) { return 0; }`, 30, y); }
      };
      const clear = (g, width, height) => { text(g, width, height); g.clearRect(0, 0, width / 2, height / 2); };
      const photo = (g, width, height) => { for (let y = 0; y < height; y += 4) for (let x = 0; x < width; x += 4) { g.fillStyle = `rgb(${(x * 7 + y * 3) % 255},${(x ^ y) % 255},${(x * y) % 255})`; g.fillRect(x, y, 4, 4); } };
      return {
        shot: await picture(2000, 1400, "image/png", text),
        clear: await picture(2000, 1000, "image/png", clear),
        photo: await picture(3000, 2000, "image/jpeg", photo, 0.92),
        within: await picture(1000, 700, "image/jpeg", photo, 0.92),
        small: await picture(120, 90, "image/png", text),
        back: await picture(600, 400, "image/png", text),
        // Longer than a WebP holds (16383px a side): a full-page screenshot, and a strip wider than that; each
        // ends in a red band, which a copy that crops it loses.
        tall: await picture(1000, 20000, "image/png", (g, width, height) => { text(g, width, height); g.fillStyle = "#c4554d"; g.fillRect(0, height - 200, width, 200); }),
        strip: await picture(20000, 400, "image/png", (g, width, height) => { text(g, width, height); g.fillStyle = "#c4554d"; g.fillRect(width - 200, 0, 200, height); }),
      };
    });
    const bytes = Object.fromEntries(Object.entries(made).map(([name, base64]) => [name, Buffer.from(base64, "base64")]));
    const directory = path.join(root, "pictures");
    const documentOf = async (slug, look) => {
      await fs.mkdir(path.join(directory, slug, "assets"), { recursive: true });
      for (const [name, data] of Object.entries(bytes)) await fs.writeFile(path.join(directory, slug, "assets", `${name}.${name === "photo" || name === "within" ? "jpg" : "png"}`), data);
      const figure = (name) => `<figure class="doc-image"><img src="assets/${name}" alt="${name}"><figcaption></figcaption></figure>`;
      await fs.writeFile(path.join(directory, slug, "doc.html"), `<!doctype html>\n<html lang="zh-CN">\n<head>\n  <meta charset="utf-8">\n  <title>${slug}</title>\n</head>\n<body>\n  <main class="doc-page" data-doc-id="${slug}">\n    <header class="doc-header"><h1 class="doc-title">${slug}</h1></header>\n    ${["shot.png", "clear.png", "photo.jpg", "within.jpg", "small.png"].map(figure).join("\n    ")}\n    <div class="doc-callout" style="background-image: url(assets/back.png)"><p>背景</p></div>\n  </main>\n</body>\n</html>\n`);
      await fs.writeFile(path.join(directory, slug, "doc.json"), JSON.stringify({ title: slug, ...(look ? { look } : {}) }));
    };
    await documentOf("pictures");
    await documentOf("wide-page", { full: "full" });
    const sources = Object.fromEntries(Object.entries(bytes).map(([name, data]) => [name, data.toString("base64")]));
    // What each <img> of a file shows: its type, its size as decoded, and whether its top left corner is see-through.
    const shown = async (html) => {
      const shownPage = await running.browser.newPage();
      try {
        await shownPage.goto("about:blank");
        return await shownPage.evaluate(async (urls) => Promise.all(urls.map(async (src) => {
          const image = new Image();
          image.src = src;
          await image.decode();
          const canvas = new OffscreenCanvas(image.naturalWidth, image.naturalHeight);
          const g = canvas.getContext("2d");
          g.drawImage(image, 0, 0);
          return `${/^data:(image\/\w+)/.exec(src)[1]} ${image.naturalWidth}x${image.naturalHeight}${g.getImageData(5, 5, 1, 1).data[3] < 10 ? " see-through" : ""}`;
        })), [...html.matchAll(/<img src="(data:[^"]+)" alt="(?:shot|clear|photo|within|small)\.\w+"/g)].map((match) => match[1]));
      } finally {
        await shownPage.close();
      }
    };
    const started = Date.now();
    const render = await offlineReports({ directory, pictures: encodePictures });
    const html = await render("pictures");
    const took = Date.now() - started;
    assert.deepEqual(await shown(html), ["image/webp 1424x997", "image/webp 1424x712 see-through", "image/webp 1424x949", "image/jpeg 1000x700", "image/png 120x90"], "drawn at most 1424px wide, its transparency kept; a lossy one within it and a small one as they were");
    assert.ok(sources.back.length > 16 * 1024 * 4 / 3 && html.includes(`data:image/png;base64,${sources.back}`), "a CSS background as it is");
    const stats = render.pictures.get("pictures");
    assert.equal(stats.made, 3, JSON.stringify(stats));
    assert.ok(stats.after < stats.before / 2, `a half lighter at least: ${JSON.stringify(stats)}`);
    // 全宽: a PNG as a WebP at its own width, a photograph as it is.
    assert.deepEqual(await shown(await render("wide-page")), ["image/webp 2000x1400", "image/webp 2000x1000 see-through", "image/jpeg 3000x2000", "image/jpeg 1000x700", "image/png 120x90"]);
    // { pictures: false } (a PDF's, a Markdown export's charts), or no encoder: every picture as it is.
    assert.deepEqual(await shown(await render("pictures", { pictures: false })), ["image/png 2000x1400", "image/png 2000x1000 see-through", "image/jpeg 3000x2000", "image/jpeg 1000x700", "image/png 120x90"]);
    assert.equal(await (await offlineReports({ directory }))("pictures"), await render("pictures", { pictures: false }));

    // Past a WebP's 16383px a side, Chrome's encoder crops the canvas and says nothing: the copy is drawn smaller
    // still, both sides within it, its shape kept and its far end there (the red band); at 全宽 (no ceiling) too.
    // A picture the browser cannot read (a PNG's header, then no image) is an Error of its own, the others made.
    const broken = Buffer.concat([bytes.shot.subarray(0, 64), Buffer.alloc(64 * 1024, 0x5a)]);
    const copies = await encodePictures([
      { bytes: bytes.tall, type: "image/png", ceiling: 1424, lossy: false, quality: 0.9 },
      { bytes: broken, type: "image/png", ceiling: 1424, lossy: false, quality: 0.9 },
      { bytes: bytes.strip, type: "image/png", ceiling: Infinity, lossy: false, quality: 0.9 },
      { bytes: bytes.shot, type: "image/png", ceiling: 1424, lossy: false, quality: 0.9 },
    ]);
    assert.ok(copies[1] instanceof Error && /decode|InvalidState/i.test(copies[1].message), String(copies[1]));
    const measured = await (async () => {
      const measuring = await running.browser.newPage();
      try {
        await measuring.goto("about:blank");
        // Each copy's size as decoded, and its pixel at (x, y) given as shares of its size: red or not.
        return await measuring.evaluate(async (pictures) => Promise.all(pictures.map(async ([base64, x, y]) => {
          const bitmap = await createImageBitmap(await (await fetch(`data:image/webp;base64,${base64}`)).blob());
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          canvas.getContext("2d").drawImage(bitmap, 0, 0);
          const [r, g, b] = canvas.getContext("2d").getImageData(Math.floor(bitmap.width * x), Math.floor(bitmap.height * y), 1, 1).data;
          return `${bitmap.width}x${bitmap.height} ${r > 150 && g < 130 && b < 130 ? "red" : "not red"}`;
        })), [[copies[0].toString("base64"), 0.5, 0.999], [copies[2].toString("base64"), 0.999, 0.5], [copies[3].toString("base64"), 0.5, 0.5]]);
      } finally {
        await measuring.close();
      }
    })();
    assert.deepEqual(measured, ["819x16383 red", "16383x328 red", "1424x997 not red"], "within 16383px a side, the whole picture");
    console.log(`export-weight: five pictures exported in ${took} ms (${(stats.before / 1024).toFixed(0)} KB of pictures tried, ${(stats.after / 1024).toFixed(0)} KB after)`);
  } finally {
    await running.close();
    await closeSharedBrowser();
  }
}

// ---------- gallery check and gallery export: a heavy picture where the export makes no copy of it ----------
// Weighed as the export embeds it: no note where Chrome or Edge makes its copy; where none is there to (here a
// GALLERY_BROWSER that is not there), or with --original-images, a note saying why.
{
  const run = promisify(execFile);
  const workspace = path.join(root, "notes-workspace");
  const gallery = (args, env = {}) => run(process.execPath, [path.join(projectRoot, "src", "cli", "bin.mjs"), "--workspace", workspace, ...args], {
    timeout: 120000,
    env: { ...process.env, GALLERY_DEFAULT_WORKSPACE: workspace, GALLERY_DATA_DIR: path.join(root, "data"), GALLERY_NO_PREVIEW: "1", GALLERY_NO_BROWSER: "1", GALLERY_NO_AUTOSTART: "1", GALLERY_NO_UPDATE_CHECK: "1", GALLERY_NO_DEFAULT_TREE: "1", GALLERY_NO_PACKS: "1", GALLERY_NO_DEFAULT_HOME: "1", ...env },
  }).then(({ stdout, stderr }) => stdout + stderr, (error) => `${error.stdout}${error.stderr}`);
  await gallery(["init", workspace]);
  await gallery(["new", "heavy", "重"]);
  await fs.mkdir(path.join(workspace, "heavy", "assets"), { recursive: true });
  await fs.writeFile(path.join(workspace, "heavy", "assets", "shot.png"), pngOf(2000, 1400, 1200 * 1024));
  await fs.writeFile(path.join(workspace, "heavy", "doc.html"), `<!doctype html>\n<html lang="zh-CN">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>重</title>\n</head>\n<body>\n  <main class="doc-page" data-doc-id="heavy">\n    <header class="doc-header"><h1 class="doc-title">重</h1></header>\n    <figure class="doc-image"><img src="assets/shot.png" alt="截图"><figcaption></figcaption></figure>\n  </main>\n</body>\n</html>\n`);
  const noted = (output) => output.split(/\r?\n/).filter((line) => line.startsWith("fix heavy: assets/shot.png"));
  if (findBrowser()) assert.deepEqual(noted(await gallery(["check", "heavy"])), [], "Chrome or Edge here: the export's copy is light, no note");
  const nowhere = noted(await gallery(["check", "heavy"], { GALLERY_BROWSER: path.join(root, "no-browser", "chrome.exe") }));
  assert.equal(nowhere.length, 1, "no browser: a note");
  assert.match(nowhere[0], /: 1\.2 MB, 2000×1400px; the export embeds it as it is, 1\.6 MB as a data: URL.*; no Chrome or Edge on this machine makes the export's copy lighter: copy it in at the size the page needs$/);
  const exported = await gallery(["export", "heavy", "--original-images"]);
  const original = noted(exported);
  assert.equal(original.length, 1, `--original-images: a note: ${exported}`);
  assert.match(original[0], /; --original-images embeds it as it is$/);
}

await fs.rm(root, { recursive: true, force: true });
console.log("export-weight: ok");
