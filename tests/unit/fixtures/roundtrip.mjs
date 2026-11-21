import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { documentFiles } from "../../../src/shared/workspace.mjs";

// The report the import's round trip starts from (tests/unit/roundtrip.mjs, and the browser scenario
// importRoundTrip): one of each thing an export changes and an import must give back, written as an
// Agent writes, natural HTML where it may (a bare table, <details>, <pre>, bare formulas), with files
// of its folder named as the editor's uploads name them (<kind>-<hash>.<extension>, which an import
// gives back as they are) and as an Agent names them (cell.png, data.csv, bg.png, which come back
// under an upload's name):
//   prose, a link and an inline formula; a display formula; a bare table with a picture in a cell; a
//   disclosure; a code block; a table a chart is drawn from (data-doc-chart on it: a card after it);
//   a chart card of its JSON (both types defined with DocCharts.define in its script); a whole block of its own class, styled by its own <style> (a background url()
//   of the folder) and a style attribute (url() too); a picture block; a file block; a link to a CSV
//   of the folder with download; the page's icon a picture; highlight blocks with an emoji and an
//   icon of the 图标 tab; an embed of a PDF of the folder; a Sheet area, one tab with an emoji; a
//   <title> of its own (not the header's title) and a blank line before </main>.

/** A PNG of width × height, its pixels of `seed` (each seed another picture). */
export function pngOf(width, height, seed = 0) {
  const chunk = (type, data) => {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type), data])));
    return Buffer.concat([head, Buffer.from(type), data, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * (width * 3 + 1) + 1 + x * 3;
      raw[at] = (x * 255) / width;
      raw[at + 1] = (y * 255) / height;
      raw[at + 2] = (seed * 47) % 256;
    }
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex").slice(0, 12);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");
const XLSX = Buffer.from("PK\u0003\u0004 a workbook's bytes, as far as this test cares");

/**
 * The files of the report's folder: { name: { bytes, kind, kept } }, `kept` the name an import keeps
 * the file under (an upload's: <kind>-<hash>.<extension>), the same as its own for those named so.
 */
export function roundTripAssets() {
  const files = {
    photo: { bytes: pngOf(48, 24, 1), kind: "image", extension: "png" },
    icon: { bytes: pngOf(16, 16, 2), kind: "icon", extension: "png" },
    workbook: { bytes: XLSX, kind: "file", extension: "xlsx" },
    pdf: { bytes: PDF, kind: "embed", extension: "pdf" },
    "cell.png": { bytes: pngOf(12, 12, 3), kind: "image", extension: "png" },
    "bg.png": { bytes: pngOf(8, 8, 4), kind: "image", extension: "png" },
    "mark.png": { bytes: pngOf(6, 6, 5), kind: "image", extension: "png" },
    "data.csv": { bytes: Buffer.from("名,数\n甲,1\n乙,2\n"), kind: "file", extension: "csv" },
  };
  return Object.fromEntries(Object.entries(files).map(([key, file]) => {
    const kept = `${file.kind}-${hash(file.bytes)}.${file.extension}`;
    return [key.includes(".") ? key : kept, { ...file, kept }];
  }));
}

/**
 * Write the report into `directory` (a report's folder made from the starter: its doc.html and
^ * doc.json), its files into assets/. Returns roundTripAssets().
 */
export async function writeRoundTripReport(directory) {
  const assets = roundTripAssets();
  const name = (key) => Object.keys(assets).find((each) => each.startsWith(`${key}-`));
  await fs.mkdir(path.join(directory, "assets"), { recursive: true });
  for (const [file, { bytes }] of Object.entries(assets)) await fs.writeFile(path.join(directory, "assets", file), bytes);
  const files = documentFiles(directory); // doc.html and doc.json (as the starter makes them)
  const starter = await fs.readFile(files.html, "utf8");
  const title = /<h1 class="doc-title">([^<]*)<\/h1>/.exec(starter)[1];
  const source = starter
    .replace(`<title>${title}</title>`, `<title>${title} · 源报告</title>`)
    .replace("</head>", "  <style>\n    .tally { display: flex; gap: 8px; padding: 8px; background: url(\"assets/bg.png\") repeat; }\n    .tally b { color: var(--doc-accent); }\n  </style>\n</head>")
    .replace(`<h1 class="doc-title">${title}</h1>`, `<div class="doc-icon"><img src="assets/${name("icon")}" alt=""></div>\n      <h1 class="doc-title">${title}</h1>`)
    .replace(/\n[ \t]*<!-- Starter content:[^\n]*-->\n[ \t]*<section\b[^>]*\sdata-doc-placeholder\b[\s\S]*?<\/section>/, `
    <section class="doc-section">
      <h2>正文</h2>
      <p>第一段 <strong>加粗</strong> 的文字，一个 <a href="https://example.com/">链接</a>，公式 \\(x^2\\)。</p>
      <p>\\[ a^2 + b^2 = c^2 \\]</p>
      <table>
        <tr><th>名</th><th>值</th></tr>
        <tr><td>甲</td><td><img src="assets/cell.png" alt="格中的图"></td></tr>
        <tr><td>乙</td><td>二</td></tr>
      </table>
      <details>
        <summary>展开看</summary>
        <p>折起来的话。</p>
      </details>
      <pre><code class="language-js">const a = 1;
console.log(a &lt; 2);</code></pre>
      <table data-doc-chart="bars">
        <caption>得分</caption>
        <tr><th>组</th><th>分</th></tr>
        <tr><td>甲</td><td>1</td></tr>
        <tr><td>乙</td><td>2</td></tr>
      </table>
      <figure class="doc-figure">
        <h3>自己的图</h3>
        <div data-doc-chart="dots">
          <script type="application/json">[1, 2, 3]</script>
        </div>
      </figure>
      <div class="tally" style="--mark: url('assets/mark.png')"><b>3</b><span>自己的整体块</span></div>
      <figure class="doc-image"><img src="assets/${name("image")}" alt="照片"><figcaption>一张照片</figcaption></figure>
      <figure class="doc-file">
        <a class="doc-file-link" href="assets/${name("file")}" download="结果.xlsx"><span class="doc-file-name">结果.xlsx</span><span class="doc-file-size">54 B</span></a>
        <figcaption>原始结果</figcaption>
      </figure>
      <p>数据：<a href="assets/data.csv" download>下载 CSV</a>。</p>
      <div class="doc-panel"><div class="doc-icon">💡</div><p>高亮里的话。</p></div>
      <div class="doc-panel"><div class="doc-icon" data-icon="/icons/airplane_blue.svg"></div><p>图标高亮。</p></div>
      <figure class="doc-embed doc-embed--file">
        <iframe class="doc-embed-frame" src="assets/${name("embed")}" loading="lazy"></iframe>
        <figcaption>一份 PDF</figcaption>
      </figure>
      <section class="doc-sheet-shell" data-doc-sheets="parts" aria-label="分区">
        <div class="doc-sheet-tabs" aria-label="分区">
          <button class="doc-sheet-tab" type="button" data-sheet-tab="a">甲页</button>
          <button class="doc-sheet-tab" type="button" data-sheet-tab="b" data-tab-icon="🚀">乙页</button>
        </div>
        <div data-doc-sheet="a"><p>第一页的话。</p></div>
        <div data-doc-sheet="b"><p>第二页的话。</p></div>
      </section>
    </section>
`)
    .replace(/\n<\/body>/, `
  <script>
    DocCharts.define("bars", ({ host, data, width }) => {
      /** @type {DocTableRows} */
      const rows = data;
      const svg = d3.select(host).append("svg").attr("width", width).attr("height", 40).attr("role", "img").attr("aria-label", "两组的得分").attr("aria-description", "两组的得分。");
      svg.selectAll("rect").data(rows).join("rect").attr("x", (_, index) => index * 30).attr("y", 0).attr("width", 20).attr("height", (row) => Number(row[rows.columns[1]]) * 10);
    });
    DocCharts.define("dots", ({ host, data, width }) => {
      const svg = d3.select(host).append("svg").attr("width", width).attr("height", 40).attr("role", "img").attr("aria-label", "三个点").attr("aria-description", "三个点。");
      svg.append("desc").text("三个点。");
      svg.selectAll("circle").data(data).join("circle").attr("cx", (value) => value * 20).attr("cy", 20).attr("r", 4);
    });
  </script>
</body>`);
  if (!source.includes("DocCharts.define") || !source.includes("doc-sheet-shell") || !source.includes("tally {")) throw new Error("the round trip's report was not written from the starter");
  await fs.writeFile(files.html, source);
  const metadata = JSON.parse(await fs.readFile(files.json, "utf8"));
  await fs.writeFile(files.json, `${JSON.stringify({ ...metadata, icon: `assets/${name("icon")}` }, null, 2)}\n`);
  return assets;
}
