import fs from "node:fs/promises";
import path from "node:path";
import { findDraft, workspaceOf } from "../shared/drafts.mjs";
import { namedPlace } from "../shared/page-address.mjs";
import { pageLinks } from "../shared/page-links.mjs";
import { reportsDirectory } from "../shared/paths.mjs";
import { findPreviewServer } from "../shared/preview-server.mjs";
import { listReportSlugs } from "../shared/reports.mjs";
import { localPath, projectOfPath } from "../shared/workspace-address.mjs";
import { workspaceKey } from "../shared/workspace-registry.mjs";
import { documentDirectory, documentFiles, isSlugName } from "../shared/workspace.mjs";
import { commandArguments, documentNamed, UsageError } from "./arguments.mjs";

// gallery read <document> [--format full|markdown|text|html|json] [--outline|--map] [--block <id>|--section <id|words>]
// (./usage.mjs): a document as one reads it, written nowhere (the view: src/transfer/read-view.mjs; made
// 2026-11-14). It reads doc.html as the file is now, needs no
// server and changes no file, block id or export: the workspace is not made or registered for it either
// (gallery.mjs MAKES_NOTHING). A document is named as for every command, and also by another
// workspace's address (~ws-<id>/… in it, gallery status's form) or by the path of its doc.html or
// folder. When the workspace's server runs and the reader's page has edits not saved yet or a
// conflict (what gallery status says), a 提示 line says so: the file is behind the page.

const LEGEND = "左栏是 doc.html 的行号和块的 data-block-id。┌─ … └─ 是装着别的块、或 Markdown 写不出的块，── 是一个块的开头，{…} 是文件里的类和属性。只用来读：要改就按原文改 doc.html，不要拿这里的文字写回文件。";

const when = (ms) => {
  const at = new Date(ms);
  const two = (number) => String(number).padStart(2, "0");
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}`;
};

/** A workspace's slugs and their links: what an address names a document of it by. */
async function linksIn(root) {
  const slugs = (await listReportSlugs(root)).filter(isSlugName);
  return pageLinks(slugs.map((slug) => ({ slug })));
}

/**
 * What `name` names: { root, slug, block } (the workspace it is in, the document, a block of it or
 * null), or { refused } (a UsageError's words) for what names none; null when it names no document of
 * another workspace (this workspace's to read: documentNamed).
 */
export async function elsewhereNamed(name) {
  let ws = null;
  let rest = null;
  const bare = /^(?:.*\/)?#?~(ws-[0-9a-f]{6})\/(.+)$/.exec(name.startsWith("http") ? "" : name);
  if (bare) [, ws, rest] = bare;
  else {
    try {
      const url = new URL(name);
      if (["127.0.0.1", "localhost"].includes(url.hostname)) {
        const project = projectOfPath(url.pathname);
        const hash = /^#~(ws-[0-9a-f]{6})\/(.+)$/.exec(decodeURIComponent(url.hash));
        if (project) [ws, rest] = [project, `${url.origin}${localPath(url.pathname)}${url.hash}`];
        else if (hash) [, ws, rest] = hash;
      }
    } catch {}
  }
  if (!ws) {
    // A path: a document's doc.html or folder (复制本地路径).
    if (!path.isAbsolute(name.replace(/^["']|["']$/g, "")) && !/^file:\/\//i.test(name)) return null;
    const found = await findDraft(name);
    if (found.kind === "draft") return { root: found.root ?? found.parent, slug: found.slug, block: null };
    return { refused: `Not a document's doc.html or folder: ${name} (gallery list shows each document's file).` };
  }
  const found = workspaceOf(ws);
  if (!found.root) return { refused: found.refused === "ambiguous" ? `Two registered workspaces have the id ${ws}: ${found.roots.join(", ")}. Read it with --workspace <its folder>.` : `No workspace of this machine has the id ${ws} (gallery workspaces lists them).` };
  const place = namedPlace(rest, await linksIn(found.root));
  if (!place) return { refused: `No document of the workspace ${found.root} is ${rest} (gallery list --workspace "${found.root}" shows them).` };
  return { root: found.root, ...place };
}

// What the server says of the page of `file` when its edits are not in the file yet: a 提示 line, or null (none open, all saved, no server).
async function unsavedOf(file) {
  const server = await findPreviewServer({ answering: true, timeout: 3000 }).catch(() => null);
  if (!server) return null;
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/__gallery/workspace/status`, { headers: { "X-Gallery-Token": server.token }, signal: AbortSignal.timeout(5000) });
    const answer = await response.json().catch(() => null);
    const entry = (answer?.open ?? []).find((each) => each.kind === "document" && each.file && workspaceKey(each.file) === workspaceKey(file) && each.save && each.save !== "saved");
    if (!entry) return null;
    const said = entry.save === "conflict" ? `有 ${entry.conflicts} 处冲突用户还没处理` : entry.save === "offline" ? "有修改暂存在浏览器里（没连上 Gallery 的服务）" : "有修改还没保存";
    return { save: entry.save, conflicts: entry.conflicts ?? 0, line: `提示：浏览器里这篇${said}：下面是文件里的样子，没有那些修改。改文件前先让用户在页面上处理完（gallery status 看）。` };
  } catch {
    return null;
  }
}

/** The command line read: { name, format, mode ("read", "outline", "map"), blockAsked, sectionAsked (--block's and --section's, or null) }. A mistake throws a UsageError. */
export function readArguments(argv) {
  const { positional, options, values } = commandArguments({ options: ["--json", "--outline", "--map"], values: ["--format", "--block", "--section"], argv });
  if (positional.length !== 1) throw new UsageError(positional.length ? `Name one document: gallery read <document> (${positional.length} named).` : "Name a document: gallery read <document>.");
  const asked = values.get("--format");
  if (asked !== undefined && !["full", "markdown", "text", "html", "json"].includes(asked)) throw new UsageError(`No format ${asked}: full (the default: every block), markdown, text, html or json.`);
  if (options.has("--json") && asked !== undefined && asked !== "json") throw new UsageError(`--json is --format json: not with --format ${asked}.`);
  const format = options.has("--json") ? "json" : asked ?? "full";
  if (options.has("--outline") && options.has("--map")) throw new UsageError("--outline lists the headings, --map every block: give one.");
  const mode = options.has("--outline") ? "outline" : options.has("--map") ? "map" : "read";
  if (mode !== "read" && !["full", "json"].includes(format)) throw new UsageError(`--${mode} is written as the default view or as --format json, not as ${format}.`);
  if (values.has("--block") && values.has("--section")) throw new UsageError("--block reads a block, --section a heading's section: give one.");
  return { name: positional[0], format, mode, blockAsked: values.get("--block") ?? null, sectionAsked: values.get("--section") ?? null };
}

export async function run(argv, context = {}) {
  const asked = readArguments(argv);
  if (/^@/.test(asked.name)) throw new UsageError(`${asked.name} is a custom page, not a document: gallery read reads documents (a custom page's cards: gallery page list, gallery page check ${asked.name.slice(1)}).`);
  // Which document, and in which workspace.
  const elsewhere = await elsewhereNamed(asked.name);
  if (elsewhere?.refused) throw new UsageError(elsewhere.refused);
  const { slug, block: addressed } = elsewhere ?? (await documentNamed(asked.name));
  const root = elsewhere?.root ?? reportsDirectory;
  const folder = documentDirectory(slug, root);
  const files = documentFiles(folder);
  const source = await fs.readFile(files.html, "utf8").catch(() => null);
  if (source === null) {
    console.error(`没有文档 ${slug}：gallery list 列出所有文档。`);
    process.exitCode = 1;
    return;
  }
  const [metadata, stat] = await Promise.all([
    fs.readFile(files.json, "utf8").then((text) => JSON.parse(text.replace(/^\uFEFF/, ""))).catch(() => ({})),
    fs.stat(files.html),
  ]);
  const unsaved = await unsavedOf(files.html);
  const view = await import("../transfer/read-view.mjs");
  // The Markdown is the export's: its page blocks by the titles they show (render/page-chips.mjs, as 复制页面内容).
  const { drawPageChips } = asked.format === "markdown" ? await import("../render/page-chips.mjs") : {};
  const opened = await view.openForReading(source, drawPageChips ? { drawn: (text) => drawPageChips(text, { slug, mode: "words", reportsDirectory: root }) } : {});
  const model = view.nodesOf(opened);
  const reading = view.viewOf(opened, model, { folder, workspace: root });
  const title = (typeof metadata?.title === "string" && metadata.title.trim()) || (model.title ? reading.tools.words(model.title) : "") || slug;
  const facts = { slug, title, emoji: metadata?.icon ?? null, description: typeof metadata?.description === "string" ? metadata.description : "", path: path.resolve(files.html), workspace: path.resolve(root), lines: opened.lines, edited: stat.mtimeMs };

  // The part asked for: a block (--block, or an address naming one), a section (--section), else the page.
  const part = choosePart({ ...asked, slug }, addressed, model, reading, view);
  if (part.refused) {
    console.error(`问题：${part.refused}`);
    process.exitCode = 1;
    return;
  }
  const { nodes, said } = part;
  if (asked.format === "html") return printHtml(opened, nodes, model, unsaved);
  if (asked.format === "markdown") {
    if (unsaved) console.error(unsaved.line);
    // A whole document's as its offline file carries it for 复制为 Markdown (view.wholeReadings), a part's of its nodes.
    const markdown = part.whole ? (await view.wholeReadings(source, { slug, root, title: metadata?.title })).markdown : await view.markdownText(opened, { title, nodes });
    const losses = view.markdownLosses(view.allOf(nodes));
    console.log(markdown);
    console.log("");
    console.log(`<!-- gallery read --format markdown：导出用的 Markdown，${losses.length ? `写不出：${losses.join("；")}；也没有块的 id 和行号` : "没有块的 id 和行号"}。完整的：gallery read ${slug}${said ? ` ${said.option}` : ""} -->`);
    return;
  }
  if (asked.format === "text") {
    if (unsaved) console.error(unsaved.line);
    console.log(part.whole ? (await view.wholeReadings(source, { slug, root, title: metadata?.title })).text : view.textLines(nodes, reading).join("\n"));
    return;
  }
  if (asked.format === "json") return printJson({ opened, model, reading, view, nodes, part, facts, unsaved, asked });
  // The default view, an outline or a map.
  const head = headLines(facts, opened, model, part, unsaved);
  if (asked.mode === "outline") return void console.log([...head, "", ...outlineLines(nodes, model, reading, view, slug)].join("\n"));
  if (asked.mode === "map") return void console.log([...head, "", ...mapLines(nodes, reading, view, slug)].join("\n"));
  const rows = view.fullRows(nodes, reading);
  const missed = view.unwritten(rows, nodes);
  const unseen = part.whole ? model.unseen : [];
  const units = view.allOf(nodes).filter((node) => node.type === "unit").length;
  const end = [];
  const gaps = [
    ...reading.missing.map(({ node, why }) => `第 ${node.line ?? "?"} 行的${view.nameOf(node)}${node.id ? ` ${node.id}` : ""}：${why}`),
    ...missed.map((node) => `第 ${node.line ?? "?"} 行的${view.nameOf(node)}${node.id ? ` ${node.id}` : ""}：没有写出来`),
    ...unseen.map(({ tag, line }) => `第 ${line ?? "?"} 行的 <${tag}>：页面上看不到，没有写出来`),
  ];
  if (gaps.length) end.push(`提示：上面不全，有 ${gaps.length} 处没有照块写出，读 doc.html 的这几行：`, ...gaps.map((gap) => `  - ${gap}`));
  else end.push(`全部 ${units} 块都在上面${part.whole ? "" : `（${said.words}）`}，没有省略。`);
  console.log([...head, "", ...view.gutterLines(rows), "", ...end].join("\n"));
  void context;
}

// The nodes to read: { nodes, whole, said: { words, option } }, or { refused }.
function choosePart(asked, addressed, model, reading, view) {
  const byId = (id) => model.all.find((node) => node.id === id) ?? model.all.find((node) => node.el?.nodeType === 1 && node.el.getAttribute("id") === id) ?? null;
  const blockId = asked.blockAsked ?? (asked.sectionAsked ? null : addressed);
  if (blockId) {
    const node = byId(blockId);
    if (!node) return { refused: `这篇文档没有块 ${blockId}（gallery read ${asked.slug} --map 列出每块的 id）。` };
    return { nodes: [node], whole: false, said: { words: `块 ${blockId}`, option: `--block ${blockId}` } };
  }
  if (asked.sectionAsked) {
    let node = byId(asked.sectionAsked);
    if (!node) {
      const headings = model.all.filter(view.listedHeading);
      const exact = headings.filter((heading) => reading.tools.words(heading.el) === asked.sectionAsked.trim());
      const near = exact.length ? exact : headings.filter((heading) => reading.tools.words(heading.el).includes(asked.sectionAsked.trim()));
      if (near.length > 1) return { refused: `有 ${near.length} 个标题是「${asked.sectionAsked}」：${near.map((heading) => `${heading.id ?? "（没有 id）"} 第 ${heading.line} 行「${reading.tools.words(heading.el)}」`).join("；")}。用 --section <id> 选一个。` };
      if (near.length === 0) return { refused: `这篇文档没有块 ${asked.sectionAsked}，也没有这样的标题（gallery read ${asked.slug} --outline 列出标题）。` };
      node = near[0];
    }
    if (view.listedHeading(node)) return { nodes: view.sectionOf(node, model.roots), whole: false, said: { words: `标题「${reading.tools.words(node.el)}」的一节`, option: `--section ${node.id ?? asked.sectionAsked}` } };
    // A block that holds blocks (a section, a tab, a disclosure): itself, its blocks with it.
    if (node.children.length) return { nodes: [node], whole: false, said: { words: `块 ${node.id ?? asked.sectionAsked}`, option: `--block ${node.id ?? asked.sectionAsked}` } };
    const around = view.sectionAround(node, model.roots);
    if (!around) return { refused: `块 ${asked.sectionAsked} 不在哪个标题下面：用 --block ${asked.sectionAsked} 读它。` };
    return { nodes: around.nodes, whole: false, said: { words: `标题「${reading.tools.words(around.heading.el)}」的一节`, option: `--section ${around.heading.id ?? asked.sectionAsked}` } };
  }
  return { nodes: model.roots, whole: true, said: null };
}

function headLines(facts, opened, model, part, unsaved) {
  const lines = [`${facts.emoji && /\p{Extended_Pictographic}/u.test(facts.emoji) ? `${facts.emoji} ` : ""}${facts.title}（${facts.slug}）`];
  lines.push(`文件：${facts.path} · ${facts.lines} 行 · 上次编辑 ${when(facts.edited)}`);
  if (facts.description) lines.push(`说明：${facts.description}`);
  if (!part.whole) {
    const first = part.nodes[0];
    const last = part.nodes.at(-1);
    const [from, to] = [first.line ?? "?", last.endLine ?? "?"];
    lines.push(`这里只有${part.said.words}：第 ${from === to ? from : `${from}–${to}`} 行（整篇：gallery read ${facts.slug}）`);
  }
  if (part.whole && model.code.length) {
    const said = model.code.map(({ tag, line, endLine, charts }) => `${tag === "style" ? "样式" : "脚本"} 第 ${line}–${endLine} 行${charts.length ? `（定义图表 ${charts.join("、")}）` : ""}`);
    lines.push(`页面自己的：${said.join("；")}`);
  }
  if (opened.natural) lines.push("提示：文件里有 Agent 写的普通 HTML，Gallery 显示时按自己的块读它（下次导出或用户第一次编辑时写进文件，gallery check 列出改什么）：下面是读出来的块，行号是文件的。");
  if (unsaved) lines.push(unsaved.line);
  lines.push(LEGEND);
  return lines;
}

// The headings (as the page's 目录 lists them), indented by level, with how many blocks each one's section holds.
function outlineLines(nodes, model, reading, view, slug) {
  const all = view.allOf(nodes);
  const headings = all.filter(view.listedHeading);
  if (headings.length === 0) return [`没有标题。gallery read ${slug} --map 列出每一块。`];
  const top = Math.min(...headings.map((node) => Number(node.el.localName[1])));
  const rows = [];
  // The block that owns the box a heading stands in, or one around it (a Sheet panel's tab), on a line of its own before it.
  const ownerAround = (node) => {
    for (let at = node; at; at = at.parent) {
      const owner = view.ownerOf(at, model.all);
      if (owner) return owner;
    }
    return null;
  };
  for (const node of headings) {
    const level = Number(node.el.localName[1]);
    const owner = ownerAround(node);
    if (owner && !rows.some((row) => row.node === owner)) {
      const title = view.VIEWS[owner.kind]?.title?.(owner, reading);
      rows.push({ text: `${"  ".repeat(Math.max(0, level - top - 1))}▸ ${view.nameOf(owner)}${title ? `「${title}」` : ""}`, line: owner.line, id: owner.id, node: owner });
    }
    const under = view.allOf(view.sectionOf(node, model.roots)).filter((one) => one.type === "unit").length - 1;
    rows.push({ text: `${"  ".repeat(level - top)}${reading.tools.words(node.el) || "（空标题）"}（h${level}${under ? `，下面 ${under} 块` : ""}）`, line: node.line, id: node.id, node });
  }
  return [`标题 ${headings.length} 个（读一节：gallery read ${slug} --section <id>）：`, ...view.gutterLines(rows), ...outlinedLines(all, reading, view, slug)];
}

// The blocks of a kind its definition lists in the outline (`read.outline`: a database, 多维表格), each on a line
// under the heading it follows: what it holds (its kind's `title`) and its id, so that one is read alone (--block)
// without the rest of the document.
function outlinedLines(all, reading, view, slug) {
  const rows = [];
  let heading = null;
  for (const node of all) {
    if (view.listedHeading(node)) heading = reading.tools.words(node.el);
    if (node.type !== "unit" || !view.VIEWS[node.kind]?.outline) continue;
    const title = view.VIEWS[node.kind]?.title?.(node, reading);
    rows.push({ text: `${heading ? `「${heading}」下：` : ""}${title ?? view.nameOf(node)}`, line: node.line, id: node.id, node });
  }
  if (rows.length === 0) return [];
  const unnamed = rows.some((row) => !row.id);
  const names = [...new Set(rows.map((row) => view.nameOf(row.node)))].join("、");
  return ["", `${names} ${rows.length} 个（只读一个：gallery read ${slug} --block <id>${unnamed ? "；左栏没有 id 的，读它所在的一节" : ""}）：`, ...view.gutterLines(rows)];
}

// Every block on a line, indented by depth: what it is called, then what names it (a tab's name) or, for a
// block that holds none, its first words.
function mapLines(nodes, reading, view, slug) {
  const rows = [];
  const base = nodes[0] ? depth(nodes[0]) : 0;
  for (const node of view.allOf(nodes)) {
    const name = view.nameOf(node);
    const title = node.type !== "loose" ? view.VIEWS[node.kind]?.title?.(node, reading) : null;
    let words = title || (node.children.length ? "" : reading.words(node).find((line) => line.trim()) ?? "");
    words = words.replace(/\s+/g, " ").trim();
    if ([...words].length > 48) words = `${[...words].slice(0, 48).join("")}…`;
    rows.push({ text: `${"  ".repeat(depth(node) - base)}${name}${words ? `  ${words}` : ""}`, line: node.line, id: node.id, node });
  }
  return [`${rows.length} 块（读一块：gallery read ${slug} --block <id>）：`, ...view.gutterLines(rows)];
}
const depth = (node) => (node.parent ? depth(node.parent) + 1 : 0);

// The file's own text of the part: the page's <main> for the whole, else from the first block of the part
// to the end of its last, exactly (with the indentation of its first line), or the whole lines when the
// file still holds natural HTML (its lines are the page's, its offsets are not).
function printHtml(opened, nodes, model, unsaved) {
  if (unsaved) console.error(unsaved.line);
  const main = opened.document.querySelector("main");
  const places = (nodes === model.roots && main ? [opened.placeOf(main)] : nodes.map((node) => (node.start === null ? null : { start: node.start, end: node.end }))).filter(Boolean);
  if (places.length === 0) return void console.log("");
  const start = Math.min(...places.map((place) => place.start));
  const end = Math.max(...places.map((place) => place.end));
  if (opened.text === opened.source) {
    const lineStart = opened.source.lastIndexOf("\n", start - 1) + 1;
    const lead = /^[ \t]*$/.test(opened.source.slice(lineStart, start)) ? lineStart : start;
    return void console.log(opened.source.slice(lead, end));
  }
  const lines = opened.source.split("\n");
  const [from, to] = [opened.lineOf(start), opened.lineOf(Math.max(start, end - 1))];
  console.log(lines.slice(from - 1, to).join("\n"));
}

async function printJson({ opened, model, reading, view, nodes, part, facts, unsaved, asked }) {
  const { markdownWriter } = await import("../transfer/markdown.mjs");
  const writer = await markdownWriter(opened.document);
  const listed = asked.mode === "outline" ? view.allOf(nodes).filter(view.listedHeading) : view.allOf(nodes);
  const blocks = [];
  for (const node of listed) blocks.push(view.nodeData(node, reading, writer));
  const rows = asked.mode === "read" ? view.fullRows(nodes, reading) : [];
  const missed = asked.mode === "read" ? view.unwritten(rows, nodes) : [];
  console.log(JSON.stringify({
    document: { slug: facts.slug, title: facts.title, icon: facts.emoji, description: facts.description, file: facts.path, workspace: facts.workspace, lines: facts.lines, edited: new Date(facts.edited).toISOString() },
    format: "json",
    mode: asked.mode,
    part: part.whole ? null : { option: part.said.option, words: part.said.words, line: part.nodes[0]?.line ?? null, endLine: part.nodes.at(-1)?.endLine ?? null },
    natural: opened.natural,
    unsaved: unsaved ? { save: unsaved.save, conflicts: unsaved.conflicts } : null,
    code: part.whole ? model.code : [],
    blocks,
    missing: [
      ...reading.missing.map(({ node, why }) => ({ n: node.n, line: node.line, why })),
      ...missed.map((node) => ({ n: node.n, line: node.line, why: "not written" })),
      ...(part.whole ? model.unseen.map(({ tag, line }) => ({ n: null, line, why: `<${tag}> shows nothing` })) : []),
    ],
  }, null, 2));
}
