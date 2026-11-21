import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { HOST_NAMES, KIND_NAMES } from "../editor/components/registry.mjs";
import { reportsDirectory } from "../shared/paths.mjs";
import { documentDirectory, documentFiles } from "../shared/workspace.mjs";
import { commandArguments, documentNamed, UsageError } from "./arguments.mjs";
import { askEdits } from "./edit-ask.mjs";
import { shown } from "./report-start.mjs";

// gallery history <document> [--json] | --changes <version> | --restore <version> [--json] (./usage.mjs): a document's
// recent versions (docs/editor.md "Recent versions": the edit service's history/<slug>/, src/editor/history.mjs),
// as the workbench's 历史版本 lists them: when each was kept, who made it (the user's edit on the page, the
// Agent's: a write of the file or a command of its own, or not known), what it changed of the one before it,
// block by block; what one of them changed, every block with its words (what 历史版本 marks on its page:
// --changes); and one of them restored, as the workbench's 恢复 does, through the workspace's running
// server when there is one (its queue: an open page shows it at once; a page with edits of the user's not
// saved yet keeps them, as for any write of the Agent's), else here by the same service
// (src/cli/edit-ask.mjs). The restore is the Agent's write: what the file was is kept as a version first
// (the restore taken back by restoring that one), and the page shows the restore as the Agent's changes
// to keep or revert. gallery revert (./revert.mjs) says its blocks the same way.

const SHORT = 8; // a version as the list names it: its version's first characters
const WHO = { reader: "用户", agent: "Agent" };
const pad = (value) => String(value).padStart(2, "0");
// `text` padded to `columns` as a terminal shows it (a Chinese character two columns wide), so the list's columns line up.
const padColumns = (text, columns) => text + " ".repeat(Math.max(0, columns - [...text].reduce((width, character) => width + (/[⺀-￯]/.test(character) ? 2 : 1), 0)));

/** A version's time as the commands say it: the local date and time, to the second. */
export function localTime(iso) {
  const at = new Date(iso);
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
}

/** The short name of a version (`version`: its 16 hex), as gallery history lists it and --restore takes it. */
export const shortOf = (version) => version.slice(0, SHORT);

/** A block's kind as a person calls it (the editor's names: 文本, 标题, 列表项…; the service's `name` when it gave one). */
export const kindName = ({ kind, title, name }) => name ?? (title ? "标题" : KIND_NAMES[kind] ?? HOST_NAMES[kind] ?? "块");

/**
 * How many blocks a change added, changed and deleted, in words: 加了 2 块、改了 1 块 (`taken`: of a
 * restore, what it took back of the file: 去掉了 2 块、改回了 1 块、放回了 1 块).
 */
export function countsSaid(counts, { taken = false } = {}) {
  if (!counts) return "";
  const verbs = taken ? ["去掉了", "改回了", "放回了"] : ["加了", "改了", "删了"];
  const parts = [counts.added, counts.changed, counts.removed].map((count, at) => [count, verbs[at]]).filter(([count]) => count > 0).map(([count, verb]) => `${verb} ${count} 块`);
  return parts.length ? parts.join("、") : "块没有变（只是编号、空白或写法）";
}

/**
 * A block of a change, as a line says it: what was done to it, its kind, its id, its first words
 * (`taken`: of a revert or a restore, which took it back: 去掉了加的, 改回了, 放回了删的).
 */
export function blockSaid({ change, kind, id, text, title, name }, { taken = false } = {}) {
  const verb = taken ? { added: "去掉了加的", changed: "改回了", removed: "放回了删的" }[change] : { added: "加了", changed: "改了", removed: "删了" }[change];
  return `${verb} ${kindName({ kind, title, name })}${id ? ` ${id}` : ""}${text ? `「${text}」` : ""}`;
}

// What made a version, in words (its kind, by whom).
function madeSaid({ kind, by, from }, first) {
  if (kind === null) return first ? "最早的样子" : "改动";
  return {
    commit: by === "agent" ? "Agent 自用页面上的修改" : "页面上的修改",
    write: by === null ? "最早的样子" : "改写了文件",
    revert: "撤回了 Agent 的修改",
    undo: "撤销了撤回或恢复",
    restore: `恢复到 ${from ? shortOf(from.slice(-16)) : "更早的版本"}`,
    "hand-in": "导出时补上编号和写法",
    rename: "改了标题",
  }[kind] ?? "改动";
}

/** The document `name` names: { slug, title, file, json }, or exit 1 when it has no file. */
export async function documentOf(name) {
  const { slug } = await documentNamed(name);
  const { html: file, json } = documentFiles(documentDirectory(slug, reportsDirectory));
  if (!existsSync(file)) {
    console.error(`问题：没有文档 "${name}"：${shown(file)} 不存在（gallery list 列出有哪些）。`);
    process.exit(1);
  }
  let title = slug;
  try {
    const value = JSON.parse(await fs.readFile(json, "utf8"));
    if (typeof value?.title === "string" && value.title.trim()) title = value.title.trim();
  } catch {}
  return { slug, title, file, json };
}

// An answer that is no success, as the commands say it, and exit 1.
export function failed(answer, what) {
  const why = {
    missing: "这份文档不在了",
    version: "没有这个版本（gallery history 列出有哪些）",
    ambiguous: `这几个开头相同，多给几位：${(answer?.candidates ?? []).map((id) => shortOf(id.slice(-16))).join("、")}`,
    busy: "文件一直在变（Agent 正在写？），什么也没写；稍后再运行一次",
    changed: "Agent 刚刚又改了文档；再运行一次",
    timeout: "Gallery 服务没有及时回答，它可能还会写：先 gallery history 看一眼再说",
  }[answer?.reason] ?? answer?.message ?? answer?.reason ?? "没有回答";
  console.error(`问题：${what}：${why}。`);
  process.exit(1);
}

// A block of a change for --json: { change, kind, name, tag, id, text, title? }.
const jsonBlock = ({ change, kind, name, tag, id, text, title }) => ({ change, kind, name: kindName({ kind, title, name }), tag, id, text, ...(title ? { title } : {}) });
// A version for --json: as the service lists it, `by` in the Agent's words (user, agent, null).
const jsonVersion = ({ id, time, version, by, kind, from, current, counts, blocks, more }) => ({
  id, version, short: shortOf(version), time, by: by === "reader" ? "user" : by, kind, ...(from ? { from } : {}), current,
  counts: counts ?? null, blocks: (blocks ?? []).map(jsonBlock), ...(more ? { more } : {}),
});

async function list(doc, { json }) {
  const answer = await askEdits("history", { slug: doc.slug, action: "versions", all: true }); // what each changed, every one (the workbench's asks a while at a time)
  if (!answer?.ok) failed(answer, `没能列出 ${doc.slug} 的版本`);
  const document = { slug: doc.slug, title: doc.title, file: shown(doc.file) };
  if (json) {
    console.log(JSON.stringify({ document, current: answer.current, versions: answer.versions.map(jsonVersion) }, null, 2));
    return;
  }
  const versions = answer.versions;
  if (!versions.length) {
    console.log(`${doc.slug}（${doc.title}）还没有存下的版本：Gallery 第一次看到它或它被改写时开始存。`);
    return;
  }
  console.log(`${doc.slug}（${doc.title}）的历史版本，最新的在前，共 ${versions.length} 个：`);
  versions.forEach((version, at) => {
    const first = at === versions.length - 1;
    const who = WHO[version.by] ?? "未知";
    const said = first || !version.counts ? madeSaid(version, true) : `${madeSaid(version, false)}：${countsSaid(version.counts)}`;
    console.log(`  ${shortOf(version.version)}  ${localTime(version.time)}  ${padColumns(who, 6)}  ${said}${version.current ? "（现在的样子）" : ""}`);
    for (const block of version.blocks ?? []) console.log(`            ${blockSaid(block)}`);
    if (version.more) console.log(`            还有 ${version.more} 块`);
  });
  console.log(`提示：gallery history ${doc.slug} --restore <版本> 恢复到那一版（上面开头的 ${SHORT} 位）；恢复前的样子先存成一个版本，所以恢复也能再恢复回去。`);
}

async function restore(doc, ref, { json }) {
  const answer = await askEdits("history", { slug: doc.slug, action: "restore", version: ref, agent: true });
  if (!answer?.ok) failed(answer, `没有恢复 ${doc.slug}`);
  const short = (id) => shortOf(id.slice(-16));
  if (json) {
    console.log(JSON.stringify({
      document: { slug: doc.slug, title: doc.title, file: shown(doc.file) },
      restored: answer.restored, same: answer.same === true,
      ...(answer.same ? {} : { kept: answer.kept ?? null, id: answer.made ?? null, counts: answer.counts ?? null, blocks: (answer.blocks ?? []).map(jsonBlock), ...(answer.more ? { more: answer.more } : {}) }),
    }, null, 2));
    return;
  }
  const name = `${short(answer.restored)}${answer.restoredAt ? `（${localTime(answer.restoredAt)}）` : ""}`;
  if (answer.same) {
    console.log(`${doc.slug}（${doc.title}）现在就是版本 ${name} 的样子：什么也没写。`);
    return;
  }
  console.log(`恢复了 ${doc.slug}（${doc.title}）到版本 ${name}（${countsSaid(answer.counts, { taken: true })}）：`);
  for (const block of answer.blocks ?? []) console.log(`  ${blockSaid(block, { taken: true })}`);
  if (answer.more) console.log(`  还有 ${answer.more} 块`);
  console.log("打开着的页面马上显示恢复后的样子（这是 Agent 的修改：用户可以在页面底部确认或撤回）。");
  if (answer.kept) console.log(`提示：恢复前的样子存成了版本 ${short(answer.kept)}；要撤回这次恢复：gallery history ${doc.slug} --restore ${short(answer.kept)}`);
}

// What a version changed of the one before it, every block with its words (历史版本 marks the same on its page):
// a line each block, a block whose words changed with its words before and now.
async function changes(doc, ref, { json }) {
  const answer = await askEdits("history", { slug: doc.slug, action: "changes", version: ref });
  if (!answer?.ok) failed(answer?.reason === "body" ? { message: "运行着的 Gallery 服务是旧版本，还不会这个（gallery stop 之后再 gallery open 换成新的）" } : answer, `没能比较 ${doc.slug} 的这个版本`);
  const short = (id) => shortOf(id.slice(-16));
  if (json) {
    console.log(JSON.stringify({
      document: { slug: doc.slug, title: doc.title, file: shown(doc.file) },
      version: jsonVersion({ ...answer, blocks: [] }), previous: answer.previous,
      counts: answer.counts, blocks: answer.blocks.map(({ change, kind, tag, id, text, title, texts, whole }) => ({ change, kind, name: kindName({ kind, title }), tag, id, text, ...(title ? { title } : {}), ...(texts ? { texts } : {}), ...(whole ? { whole } : {}) })),
    }, null, 2));
    return;
  }
  const name = `${short(answer.id)}（${localTime(answer.time)}，${WHO[answer.by] ?? "未知"}，${madeSaid(answer, answer.previous === null)}）`;
  if (answer.previous === null) {
    console.log(`${doc.slug}（${doc.title}）的版本 ${name}是最早存下的，没有上一版可比。`);
    return;
  }
  console.log(`${doc.slug}（${doc.title}）的版本 ${name}和上一版 ${short(answer.previous)} 比：${countsSaid(answer.counts)}${answer.current ? "（它就是现在的样子）" : ""}`);
  const line = (text) => text.replace(/\n/g, " / ");
  for (const block of answer.blocks) {
    const head = blockSaid({ ...block, text: "" });
    if (block.change !== "changed") console.log(`  ${head}：${line(block.text) || "（没有字）"}`);
    else if (block.whole) console.log(`  ${head}：没有字可比（属性、图片、图表或组件的数据变了），现在：${line(block.text) || "（没有字）"}`);
    else {
      console.log(`  ${head}：`);
      for (const { before, now } of block.texts ?? []) {
        console.log(`    原来：${line(before) || "（空）"}`);
        console.log(`    现在：${line(now) || "（空）"}`);
      }
    }
  }
}

export async function run(argv) {
  const { positional, options, values } = commandArguments({ options: ["--json"], values: ["--restore", "--changes"], argv });
  if (positional.length !== 1) throw new UsageError("Name one document: gallery history <document> [--json] | --changes <version> | --restore <version>.");
  if (values.has("--restore") && values.has("--changes")) throw new UsageError("--changes and --restore go one at a time.");
  const doc = await documentOf(positional[0]);
  if (values.has("--restore")) return restore(doc, values.get("--restore"), { json: options.has("--json") });
  if (values.has("--changes")) return changes(doc, values.get("--changes"), { json: options.has("--json") });
  return list(doc, { json: options.has("--json") });
}
