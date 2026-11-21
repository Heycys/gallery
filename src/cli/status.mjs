import { findPreviewServer } from "../shared/preview-server.mjs";
import { commandArguments, UsageError } from "./arguments.mjs";

// gallery status [--json] (./usage.mjs): what the reader has open in the browser, from the running server (the workbench's
// tabs report to it: shared/presence.mjs, src/workbench/presence.mjs, src/workbench/app/session/presence.ts). Reads only:
// it never starts a server and never makes a workspace. With no server it says so (exit 0): nothing is open.

const seconds = (value) => (value < 5 ? "刚刚" : value < 60 ? `${value} 秒前` : value < 3600 ? `${Math.round(value / 60)} 分钟前` : `${Math.round(value / 3600)} 小时前`);
const SAVED = {
  saved: "已保存",
  pending: "有修改还没保存",
  conflict: (entry) => `有冲突（${entry.conflicts} 处）没处理`,
  offline: "没连上 Gallery 的服务，修改暂存在浏览器里",
};
const saved = (entry) => (typeof SAVED[entry.save] === "function" ? SAVED[entry.save](entry) : SAVED[entry.save] ?? entry.save);
const quoted = (text) => `「${text}」`;
const viewing = (entry) => (entry.visible && entry.focused ? "正在看" : entry.visible ? "标签页显示着，窗口没有焦点" : "标签页在后台");

/** What the problem with an entry is, in the words the command prints after `问题：`, or null when it is saved. */
export function problemOf(entry) {
  const name = entry.kind === "page" ? `自定义页 ${entry.slug}` : entry.slug;
  if (entry.save === "conflict") return `${name} 有 ${entry.conflicts} 处冲突，用户还没处理：先让用户在页面上处理，再改文件，否则他那边会再弹冲突。`;
  if (entry.save === "pending") return `${name} 有修改还没保存：先让用户处理（等页面显示已保存），再改文件，否则他那边会弹冲突。`;
  if (entry.save === "offline") return `${name} 的修改暂存在浏览器里，没连上 Gallery 的服务：先让用户处理，再改文件。`;
  return null;
}

/** The lines that say one open entry. */
function entryLines(entry, at, last) {
  const head = `${at + 1}. ${entry.kind === "page" ? "@" : ""}${entry.slug}（${entry.title || "未命名"}）${entry.kind === "page" ? "  自定义页" : ""}${last ? "  最近用的" : ""}`;
  const lines = [head, `   ${viewing(entry)}，${seconds(entry.idle)}有操作`];
  if (entry.file) lines.push(`   文件：${entry.file}`);
  if (entry.selection) {
    const blocks = entry.selection.blocks.length ? `（块 ${entry.selection.blocks.join("、")}${entry.selection.kind === "blocks" ? "，整块选中" : ""}）` : "";
    lines.push(`   选中：${quoted(entry.selection.text)}${entry.selection.truncated ? "…" : ""}${blocks}`);
  } else if (entry.caret) {
    lines.push(`   光标在${entry.caret.block ? `块 ${entry.caret.block}` : "一个文件里还没有 id 的块"}${entry.caret.text ? `：${quoted(entry.caret.text)}` : "（空的）"}`);
  }
  lines.push(`   保存：${saved(entry)}`);
  if (entry.notes) lines.push(`   批注：${entry.notes} 条`);
  return lines;
}

/** What the server says is open, said as the command prints it (an array of lines). */
export function statusLines(answer, port) {
  const open = answer.open ?? [];
  if (open.length === 0) return [`Gallery 在运行（端口 ${port}），浏览器里没有打开的文档。`];
  const lines = [`Gallery 在运行（端口 ${port}），浏览器里开着 ${open.length} 个文档或页面（最近用的在最前）：`];
  open.forEach((entry, at) => lines.push(...entryLines(entry, at, at === 0)));
  for (const entry of open) {
    const problem = problemOf(entry);
    if (problem) lines.push(`问题：${problem}`);
  }
  const first = open[0];
  if (first && (first.selection || first.caret?.block) && first.file) {
    lines.push(`提示：用户说「这一段」「这里」「这篇」，指的多半是第一个：选中的字所在的块，没有选中就是光标所在的块；在 ${first.file} 里按 data-block-id 找到它。`);
  }
  return lines;
}

export async function run(argv) {
  const { positional, options } = commandArguments({ options: ["--json"], argv });
  if (positional.length > 0) throw new UsageError("gallery status takes no document: it says what the reader has open (gallery list shows the documents).");
  const json = options.has("--json");
  const server = await findPreviewServer({ answering: true, timeout: 3000 });
  if (!server) {
    if (json) console.log(JSON.stringify({ running: false, open: [] }, null, 2));
    else console.log("Gallery 没在运行，浏览器里没有打开的文档。");
    return;
  }
  let answer = null;
  let problem = null;
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/__gallery/workspace/status`, { headers: { "X-Gallery-Token": server.token }, signal: AbortSignal.timeout(10000) });
    answer = await response.json().catch(() => null);
    if (!answer?.ok) problem = answer?.reason === "unknown" ? "运行着的 Gallery 还不会报告这个（它是旧版本）：运行 gallery stop，再运行 gallery open --no-browser 换成新的。" : `Gallery 的服务没有给出结果（${answer?.reason ?? `HTTP ${response.status}`}）。`;
  } catch (error) {
    problem = `连不上 Gallery 的服务（端口 ${server.port}）：${error.message}`;
  }
  if (problem) {
    console.error(`问题：${problem}`);
    process.exitCode = 1;
    return;
  }
  if (json) console.log(JSON.stringify({ running: true, port: server.port, open: answer.open ?? [], last: answer.last ?? null }, null, 2));
  else for (const line of statusLines(answer, server.port)) console.log(line);
}
