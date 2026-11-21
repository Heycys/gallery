#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { LANGUAGE_PICTURES, PICTURES, isPicture, readCatalog, writeComponentSettings } from "../shared/component-catalog.mjs";
import { packsDirectory, projectRoot } from "../shared/paths.mjs";
import { filesIn, shippedBlocks } from "../shared/shipped-blocks.mjs";
import { findBrowser, lookingArguments, startBrowser } from "../transfer/browser.mjs";
import { blockPictures } from "./block-picture.mjs";
import { DOCUMENTS as ENGLISH_DOCUMENTS, englishExample } from "./pack-pictures-english.mjs";

// node src/cli/pack-pictures.mjs [<id>…] (a maintainer's, not a command of gallery's): the pictures the
// add-block lists show of Gallery's own blocks (src/packs/<pack>/<name>/preview-light.webp and
// preview-dark.webp: component-catalog.mjs PICTURES, and their English pair, LANGUAGE_PICTURES), each made
// as gallery block check makes a block's (./block-picture.mjs), of every block of both packs or of those
// named. They are kept in git, not made by the release's build: a build stays the same on any machine and
// offline, and a picture is looked at before it ships. Run it when a block's look or its example.html
// changes, or the kit's (every picture is drawn by it), look at the pictures, and commit them with RECORD:
// tests/unit/block-pictures.mjs holds the pictures to the code they were made of (madeFrom), and names the
// blocks whose pictures are older than it.
//
// The blocks are pictured in a workspace made for them, once in Chinese (their examples are) and once in
// English (./pack-pictures-english.mjs: each example as an English writer would fill it), so that each
// card shows what it shows in use: their copies, a few documents with their words and to-dos (the
// workspace's cards read them), a record of edits over the past months (the 编辑热力图's), the weather
// cards allowed online. And so that a picture reads the same whenever it is made: the page's clock stands
// at CLOCK of the day of the run (a greeting of the morning, the sky of the day, not the hour of the night
// a maintainer ran it), the dates a habit was kept are moved up to that day, and the weather is a
// forecast of this script's (forecastOf) rather than the net's, which knows no such hour. Nothing of any
// other workspace is read or written, nor the net; a block's preview.svg (the drawing the menus showed
// until 2026-11-17) is taken away as its pictures are written.

/** Where the record of what the pictures were made from is kept (madeFrom: written by a run, read by the test). */
export const RECORD = path.join(projectRoot, "src", "cli", "pack-pictures.json");
/** The hour and minute the page's clock reads as a picture is made. */
export const CLOCK = [10, 30];

const DAY = 86_400_000;
const two = (value) => String(value).padStart(2, "0");
const dayOf = (time) => {
  const date = new Date(time);
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
};

// What draws every picture besides its block: the kit (its styles and scripts, the board's among them), and
// how a picture is made. Paths in the checkout.
const SHARED = ["src/render/kit", "src/cli/block-picture.mjs", "src/cli/pack-pictures.mjs", "src/cli/pack-pictures-english.mjs"];

const hashOf = (entries) => {
  const hash = createHash("sha256");
  for (const [name, bytes] of entries) hash.update(`${name}\u0000`).update(bytes).update("\n");
  return hash.digest("hex").slice(0, 16);
};

/**
 * What the pictures of Gallery's own `blocks` (shippedBlocks') are made of as the checkout holds it now:
 * { shared: the kit's files and the scripts that make them, blocks: { <id>: its files but its pictures and
 * writing.md } }, each a hash.
 */
export function madeFrom(blocks = shippedBlocks(packsDirectory)) {
  const shared = SHARED.flatMap((name) => {
    const at = path.join(projectRoot, ...name.split("/"));
    return fs.statSync(at).isDirectory() ? filesIn(at).map((file) => [`${name}/${file}`, fs.readFileSync(path.join(at, ...file.split("/")))]) : [[name, fs.readFileSync(at)]];
  });
  const own = (block) => filesIn(block.folder).filter((file) => !isPicture(file.split("/").at(-1)) && file !== "writing.md").map((file) => [file, fs.readFileSync(path.join(block.folder, ...file.split("/")))]);
  return { shared: hashOf(shared), blocks: Object.fromEntries(blocks.map((block) => [block.id, hashOf(own(block))])) };
}

/** RECORD as it stands ({ shared, blocks }), or an empty one. */
export function readRecord() {
  try {
    const record = JSON.parse(fs.readFileSync(RECORD, "utf8"));
    return { shared: typeof record.shared === "string" ? record.shared : null, blocks: record.blocks && typeof record.blocks === "object" ? record.blocks : {} };
  } catch {
    return { shared: null, blocks: {} };
  }
}

/** The ids of `blocks` whose pictures were made of other code than `now` (madeFrom's) by `record` (readRecord's): all where what draws every one changed. */
export function staleBlocks(record = readRecord(), now = madeFrom()) {
  return Object.keys(now.blocks).filter((id) => record.shared !== now.shared || record.blocks[id] !== now.blocks[id]);
}

// The documents the workspace's cards read: [slug, title, icon, days since it was edited, its body].
const DOCUMENTS = [
  ["weekly", "产品周报", "📊", 0, "<h2>本周进展</h2><p>新版首页已经上线，留存比上周高了两个点。</p><h2>下周</h2><ul class=\"doc-todo\"><li data-checked>整理用户访谈记录</li><li>和设计一起过一遍首页</li><li>周三前定下发布日期</li></ul>"],
  ["q4-plan", "第四季度计划", "🎯", 1, "<h2>目标</h2><p>把新用户的首周留存提到 45%。</p><ul class=\"doc-todo\"><li>写完定价页的文案</li><li data-checked>确定三个重点渠道</li></ul>"],
  ["reading", "读书笔记：深度工作", "📚", 2, "<p>专注是一种可以练习的能力。每天留出一段不被打断的时间。</p><ul class=\"doc-todo\"><li>读完第三章</li></ul>"],
  ["trip", "京都旅行清单", "🧳", 4, "<ul class=\"doc-todo\"><li data-checked>订酒店</li><li data-checked>买 JR 周游券</li><li>换一点日元</li></ul>"],
  ["meeting", "设计评审纪要", "🗒️", 6, "<p>首页卡片的圆角统一成 14，按钮去掉边框。</p><ul class=\"doc-todo\"><li>更新组件库里的按钮</li></ul>"],
  ["recipes", "家常菜谱", "🍳", 9, "<h2>番茄炒蛋</h2><p>鸡蛋先炒到半熟盛出，番茄出汁后再倒回去。</p>"],
];

const page = (title, body, lang) => `<!doctype html>
<html lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body>
<main class="doc-page" data-doc-id="doc">
<h1 class="doc-title">${title}</h1>
${body}
</main>
</body>
</html>
`;

// A record of edits (workbench/activity.mjs) over the 150 days to `now`: most weekdays some, fewer at the weekend, more lately.
function activity(now, documents) {
  const days = {};
  let seed = 7;
  const random = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let back = 150; back >= 0; back--) {
    const time = now - back * DAY;
    const weekend = [0, 6].includes(new Date(time).getDay());
    const edits = Math.floor(random() * (weekend ? 3 : 9) * (back < 40 ? 1.4 : 1));
    if (edits > 0) days[dayOf(time)] = { [documents[back % documents.length][0]]: { reader: [edits, edits * 40], ...(back % 3 === 0 ? { agent: [1, 120] } : {}) } };
  }
  return { version: 1, since: dayOf(now - 150 * DAY), days, seen: {} };
}

// A workspace of `blocks`' copies and `documents`, its edits to `now`, in `language`.
async function workspace(blocks, documents, now, language) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "gallery-pack-pictures-"));
  for (const block of blocks) await fsp.cp(block.folder, path.join(root, "components", block.pack, block.name), { recursive: true });
  for (const [slug, title, icon, back, body] of documents) {
    const folder = path.join(root, slug);
    await fsp.mkdir(folder, { recursive: true });
    await fsp.writeFile(path.join(folder, "doc.html"), page(title, body, language === "zh" ? "zh-CN" : "en"));
    await fsp.writeFile(path.join(folder, "doc.json"), JSON.stringify({ title, icon, description: title }));
    const time = new Date(now - back * DAY - 3_600_000 * (back + 1));
    await fsp.utimes(path.join(folder, "doc.html"), time, time);
  }
  await fsp.mkdir(path.join(root, ".gallery", "state"), { recursive: true });
  await fsp.writeFile(path.join(root, ".gallery", "state", "activity.json"), JSON.stringify(activity(now, documents)));
  for (const block of blocks) {
    const manifest = JSON.parse(await fsp.readFile(path.join(block.folder, "component.json"), "utf8"));
    const hosts = (manifest.needs ?? []).filter((need) => need.startsWith("net:")).map((need) => need.slice(4));
    if (hosts.length) await writeComponentSettings(root, { id: block.id, net: hosts });
  }
  return root;
}

/** `example` with the dates a habit was kept ("days": [...]) moved up together, its last to the day of `now`. */
export function keptUpTo(example, now) {
  return example.replace(/("days":\[)([^\]]*)(\])/g, (whole, open, list, close) => {
    const days = [...list.matchAll(/"(\d{4})-(\d{2})-(\d{2})"/g)].map(([, year, month, day]) => Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (days.length === 0) return whole;
    const today = new Date(now);
    const shift = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - Math.max(...days);
    const moved = days.map((time) => {
      const date = new Date(time + shift);
      return `"${date.getUTCFullYear()}-${two(date.getUTCMonth() + 1)}-${two(date.getUTCDate())}"`;
    });
    return `${open}${moved.join(",")}${close}`;
  });
}

/**
 * Open-Meteo's answers as the weather cards ask them (gallery/weather's kit.js: a place by its name, its
 * weather now and for six days), made here, at `now`: a mild day of late autumn, partly cloudy, rain on the
 * fourth day. An ask of another host is refused as the net not reached.
 */
export const forecastOf = (now) => (ask) => {
  let url;
  try {
    url = new URL(ask?.url ?? "");
  } catch {
    return { ok: false, code: "offline" };
  }
  const at = new Date(now).toISOString();
  if (url.hostname === "geocoding-api.open-meteo.com") {
    return { ok: true, data: { results: [{ name: url.searchParams.get("name") ?? "", latitude: 31.23, longitude: 121.47, admin1: "Shanghai", country: "China" }] }, at, cached: false };
  }
  if (url.hostname === "api.open-meteo.com") {
    const time = Array.from({ length: 6 }, (_, index) => dayOf(now + index * DAY));
    return {
      ok: true, at, cached: false,
      data: {
        current: { temperature_2m: 18.4, apparent_temperature: 17.6, relative_humidity_2m: 64, wind_speed_10m: 9.2, wind_direction_10m: 48, weather_code: 2, is_day: 1 },
        daily: { time, weather_code: [2, 1, 3, 61, 0, 2], temperature_2m_max: [21.2, 22.4, 19.6, 16.3, 20.1, 21.5], temperature_2m_min: [13.1, 14.2, 13.4, 11.2, 11.8, 12.9] },
      },
    };
  }
  return { ok: false, code: "offline" };
};

// The pictures of `blocks` made, written and recorded; the run's exit code.
async function run(blocks) {
  const today = new Date();
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate(), ...CLOCK).getTime();
  const executablePath = findBrowser();
  if (!executablePath) {
    console.error("No Chrome, Edge or Chromium found (GALLERY_BROWSER=<its executable> picks one).");
    return 3;
  }
  const running = await startBrowser({ executablePath, args: lookingArguments() });
  const made = { zh: new Set(), en: new Set() }; // the blocks pictured, by language
  let failed = 0;
  try {
    for (const [language, names, documents] of [["zh", PICTURES, DOCUMENTS], ["en", LANGUAGE_PICTURES.en, ENGLISH_DOCUMENTS]]) {
      const root = await workspace(blocks, documents, now, language);
      try {
        for (const block of blocks) {
          const catalog = readCatalog(root, undefined, { on: block.id });
          const found = catalog.packages.get(block.id);
          const written = language === "zh" ? await fsp.readFile(path.join(block.folder, "example.html"), "utf8").catch(() => null) : englishExample(block.id);
          const example = written === null ? null : keptUpTo(written, now);
          const pictures = found && example ? await blockPictures(running.browser, { root, found, example, catalog, language, clock: now, net: forecastOf(now) }).catch((error) => (console.error(`${block.id} (${language}): ${error.message}`), null)) : null;
          if (!pictures) {
            failed += 1;
            console.error(`${block.id} (${language}): no picture`);
            continue;
          }
          for (const theme of ["light", "dark"]) await fsp.writeFile(path.join(block.folder, names[theme]), pictures[theme]);
          await fsp.rm(path.join(block.folder, "preview.svg"), { force: true });
          made[language].add(block.id);
          console.log(`${block.id} (${language}): ${names.light} ${Math.round(pictures.light.length / 1024)} KB, ${names.dark} ${Math.round(pictures.dark.length / 1024)} KB`);
        }
      } finally {
        await fsp.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
      }
    }
  } finally {
    await running.close();
  }
  // The record: each block pictured in both languages made of the code as it is now; what draws every one, where every one was.
  const all = shippedBlocks(packsDirectory);
  const current = madeFrom(all);
  const record = readRecord();
  const both = (id) => made.zh.has(id) && made.en.has(id);
  for (const block of blocks) if (both(block.id)) record.blocks[block.id] = current.blocks[block.id];
  if (all.every((block) => both(block.id))) record.shared = current.shared;
  const kept = { shared: record.shared, blocks: Object.fromEntries(Object.keys(record.blocks).filter((id) => id in current.blocks).sort().map((id) => [id, record.blocks[id]])) };
  await fsp.writeFile(RECORD, `${JSON.stringify(kept, null, 2)}\n`);
  const stale = staleBlocks(kept, current);
  if (stale.length) console.log(`Still made of older code: ${stale.join(", ")}${kept.shared !== current.shared ? " (the kit changed since: run it for every block)" : ""}`);
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const named = process.argv.slice(2);
  const blocks = shippedBlocks(packsDirectory).filter((block) => named.length === 0 || named.includes(block.id));
  if (named.length && blocks.length !== named.length) {
    console.error(`No such block of Gallery's own: ${named.filter((id) => !blocks.some((block) => block.id === id)).join(", ")}`);
    process.exit(2);
  }
  process.exitCode = await run(blocks);
}
