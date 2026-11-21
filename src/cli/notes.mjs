import fs from "node:fs/promises";
import { createAnnotations } from "../editor/annotations.mjs";
import { reportsDirectory } from "../shared/paths.mjs";
import { findPreviewServer } from "../shared/preview-server.mjs";
import { workspaceBase } from "../shared/service-location.mjs";
import { documentDirectory, documentFiles } from "../shared/workspace.mjs";
import { commandArguments, documentNamed, UsageError } from "./arguments.mjs";

// gallery notes <document> | done <document> <id>… | remove <document> <id>…|--done|--all (./usage.mjs): the reader's 批注 of a
// document (<document>/annotations.json: shared/annotations.mjs, src/editor/annotations.mjs, docs/editor.md "Annotations"), listed,
// marked as acted on and removed. Each through the workspace's running server when there is one (the route the page writes
// them by: POST /__gallery/edit/annotations, in the queue its saves go through, so that an open page shows it at once: a card goes
// grey, a removal offers 撤销), else here by the same code (createAnnotations, which then never checks an annotation against
// the document: nothing is deleted or rewritten by looking at them).

const ROUTE = "/__gallery/edit/annotations";
const NOT_OURS = ["elsewhere", "token", "host", "origin", "unknown"];

// The annotations of the document through the server, or null when no server of this workspace answers.
async function serverAnswer(server, slug, body) {
  const host = `127.0.0.1:${server.port}`;
  try {
    const response = body
      ? await fetch(`http://${host}${workspaceBase(reportsDirectory)}${ROUTE}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: `http://${host}`, "X-Gallery-Token": server.token },
        body: JSON.stringify({ slug, ...body }),
        signal: AbortSignal.timeout(30000),
      })
      : await fetch(`http://${host}${workspaceBase(reportsDirectory)}${ROUTE}?slug=${encodeURIComponent(slug)}&as=notes`, { headers: { "X-Gallery-Token": server.token }, signal: AbortSignal.timeout(30000) });
    const answer = await response.json().catch(() => null);
    if (typeof answer?.ok !== "boolean" || NOT_OURS.includes(answer.reason)) return null;
    return answer;
  } catch {
    return null;
  }
}

// The same, here: the service's own code on the document's file, unchecked.
function here() {
  return createAnnotations({
    reportsDirectory,
    verify: false,
    read: async (slug) => {
      const text = await fs.readFile(documentFiles(documentDirectory(slug, reportsDirectory)).html, "utf8").catch(() => null);
      return text === null ? null : { text };
    },
  });
}

/** What the annotations say (`body` undefined: the list, else the change), and whether a server said it: { answer, served }. */
async function ask(slug, body) {
  const server = await findPreviewServer();
  const answer = server ? await serverAnswer(server, slug, body) : null;
  if (answer) return { answer, served: true };
  const notes = here();
  const [, result] = body ? await notes.change({ slug, ...body }) : await notes.notes(slug);
  return { answer: result, served: false };
}

function refused(answer, slug) {
  if (answer.reason === "missing") return `没有文档 ${slug}：gallery list 列出所有文档。`;
  if (answer.reason === "ids") return `没有这些批注：${answer.ids.join("、")}（gallery notes ${slug} 列出它们的 id）。什么也没改。`;
  return `没有成功：${answer.message ?? answer.reason ?? "没有回答"}。`;
}

const indent = (text, by) => String(text).split("\n").map((line, at) => (at === 0 ? line : `${by}${line}`)).join("\n");
const snippet = (text, most = 40) => {
  const line = String(text ?? "").replace(/\s+/g, " ").trim();
  return line.length > most ? `${line.slice(0, most)}…` : line;
};

/** The lines that say a document's annotations. */
export function noteLines(slug, list) {
  const title = list.title && list.title !== slug ? `（${list.title}）` : "";
  if (list.items.length === 0) return [`${slug}${title}没有批注。`];
  const done = list.items.filter((item) => item.done).length;
  const lines = [`${slug}${title}有 ${list.items.length} 条批注${done ? `，其中 ${done} 条已处理` : ""}：`];
  list.items.forEach((item, at) => {
    lines.push(`${at + 1}. ${item.id}${item.done ? "  已处理" : ""}`);
    const blocks = item.blocks.length ? `块 ${item.blocks.join("、")}${item.whole ? "（整块）" : ""}` : "块：文件里还没有它的 id，按原文找";
    lines.push(`   ${blocks}${item.where?.length ? `；位置：${item.where.join(" › ")}` : ""}`);
    lines.push(`   原文：${item.quote ? `「${indent(item.quote, "   ")}」` : "（整块，没有文字）"}`);
    lines.push(`   建议：${indent(item.text, "   ")}`);
  });
  if (list.items.some((item) => !item.done)) lines.push(`提示：改完一条就运行 gallery notes done ${slug} <id>…，页面上它会变灰；用户要你删掉时才用 gallery notes remove。`);
  return lines;
}

async function list(slug, json) {
  const { answer } = await ask(slug);
  if (!answer.ok) {
    console.error(refused(answer, slug));
    process.exit(1);
  }
  const notes = answer.items.map((item) => ({ id: item.id, text: item.text, quote: item.quote, blocks: item.blocks, whole: item.whole, where: item.where, done: item.done === true, created: item.created, updated: item.updated }));
  if (json) return void console.log(JSON.stringify({ document: slug, title: answer.title, file: answer.path, notes }, null, 2));
  for (const line of noteLines(slug, { title: answer.title, items: answer.items })) console.log(line);
}

async function done(slug, ids, undo, json) {
  const { answer, served } = await ask(slug, { [undo ? "undone" : "done"]: ids });
  if (!answer.ok) {
    console.error(refused(answer, slug));
    process.exit(1);
  }
  if (json) return void console.log(JSON.stringify({ document: slug, [undo ? "undone" : "done"]: ids }, null, 2));
  console.log(`${undo ? "已取消" : "已把"} ${ids.length} 条批注${undo ? "的已处理标记" : "标为已处理"}：${ids.join("、")}`);
  if (!undo) console.log("提示：页面上它们变灰；用户可以在批注菜单里一键删除已处理的，你不要删，除非用户要你删。");
  if (!served) console.log("提示：Gallery 没在运行，这次直接写了 annotations.json；页面下次打开时就是这样。");
}

async function remove(slug, mode, ids, json) {
  const body = mode === "ids" ? { removeIds: ids } : mode === "done" ? { removeDone: true } : { clear: true };
  const { answer, served } = await ask(slug, { ...body, by: "command" });
  if (!answer.ok) {
    console.error(refused(answer, slug));
    process.exit(1);
  }
  const removed = answer.removed ?? [];
  if (json) return void console.log(JSON.stringify({ document: slug, removed: removed.map((item) => ({ id: item.id, text: item.text, quote: item.anchor?.quote ?? "", done: item.done === true })) }, null, 2));
  if (removed.length === 0) return void console.log(mode === "done" ? `${slug} 没有已处理的批注，什么也没删。` : `${slug} 没有批注，什么也没删。`);
  console.log(`已删除 ${slug} 的 ${removed.length} 条批注：`);
  for (const item of removed) console.log(`  ${item.id}  ${snippet(item.text)}`);
  console.log(served
    ? "提示：页面开着时，用户会看到「已删除 N 条批注」和「撤销」，几秒内能放回来。"
    : "提示：Gallery 没在运行，这次直接写了 annotations.json；没有页面开着，也就没有地方撤销。");
}

export async function run(argv) {
  const { positional, options } = commandArguments({ options: ["--json", "--done", "--all", "--undo"], argv });
  const json = options.has("--json");
  const [first, ...rest] = positional;
  const sub = (first === "done" || first === "remove") && positional.length > 1 ? first : null;
  if (sub === null) {
    if (positional.length !== 1) throw new UsageError("Name a document: gallery notes <document>.");
    for (const option of ["--done", "--all", "--undo"]) if (options.has(option)) throw new UsageError(`${option} goes with gallery notes ${option === "--undo" ? "done" : "remove"}: gallery notes <document> only lists.`);
    return list((await documentNamed(first)).slug, json);
  }
  const [name, ...ids] = rest;
  const { slug } = await documentNamed(name);
  if (sub === "done") {
    for (const option of ["--done", "--all"]) if (options.has(option)) throw new UsageError(`${option} goes with gallery notes remove.`);
    if (ids.length === 0) throw new UsageError("Name the annotations to mark: gallery notes done <document> <id>… (gallery notes <document> lists their ids).");
    return done(slug, [...new Set(ids)], options.has("--undo"), json);
  }
  if (options.has("--undo")) throw new UsageError("--undo goes with gallery notes done.");
  const modes = [ids.length > 0 && "ids", options.has("--done") && "done", options.has("--all") && "all"].filter(Boolean);
  if (modes.length === 0) throw new UsageError("Say what to remove: gallery notes remove <document> <id>… | --done | --all.");
  if (modes.length > 1) throw new UsageError("Name ids, or --done, or --all: one of them.");
  return remove(slug, modes[0], [...new Set(ids)], json);
}
