import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

// The 21 acceptance checks of an Agent doing what the user can (written as a shell script, 2026-11-11;
// 0.2.3 failed all 21), run by the release smoke test on its own installed package, data and
// workspace: the same commands and the same JSON fields as that script, written in Node so that
// they hold on Windows too (the script compares a POSIX temp path with what the JSON says). Each check
// prints PASS or FAIL; any FAIL fails the smoke test, after all 21 are said.
const ANY = [0, 1, 2, 3, 4];

export async function parityAcceptance({ gallery, workspace, temp, executablePath }) {
  const other = path.join(temp, "other-workspace");
  const run = (args) => gallery(args, { expect: ANY });
  const json = (args) => {
    const result = run(args);
    try {
      return { value: JSON.parse(result.stdout), result };
    } catch {
      return { value: null, result };
    }
  };
  // What the shell script reads as the list: documents, items, pages or packs, else the value itself.
  const listOf = (value) => [].concat(value?.documents ?? value?.items ?? value?.pages ?? value?.packs ?? value ?? []);
  const first = (result) => `${result.stdout}\n${result.stderr}`.trim().split(/\r?\n/)[0]?.slice(0, 160) ?? "";
  const failures = [];
  let passed = 0;
  const ok = (description, holds, why = "") => {
    if (holds) {
      passed++;
      console.log(`PASS  parity: ${description}`);
    } else {
      failures.push(description);
      console.log(`FAIL  parity: ${description}${why ? `（${why}）` : ""}`);
    }
  };
  const documents = () => listOf(json(["list", "--json"]).value);
  const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

  run(["init", other]);
  run(["new", "proj", "项目", "--no-browser"]);
  run(["new", "weekly", "周报", "--under", "proj", "--no-browser"]);
  run(["open", "--no-browser"]);

  console.log("— 给 Agent 读的 JSON");
  {
    const { value, result } = json(["list", "--json"]);
    ok("list --json 能解析，有 weekly", listOf(value).some((entry) => entry?.slug === "weekly"), first(result));
  }
  {
    const { value, result } = json(["workspaces", "--json"]);
    const paths = JSON.stringify(value ?? null).match(/"(?:[^"\\]|\\.)*"/g)?.map((text) => JSON.parse(text)) ?? [];
    ok("workspaces --json 能解析，有默认工作区", value !== null && paths.some((each) => /[\\/]/.test(each) && same(each, workspace)), first(result));
  }

  console.log("— 回收区");
  const trashed = run(["trash", "weekly"]);
  const gone = !documents().some((entry) => entry?.slug === "weekly");
  ok("trash 之后 list 里没有它", gone, first(trashed));
  {
    const { value, result } = json(["trash", "list", "--json"]);
    ok("trash list 里有它", value !== null && JSON.stringify(value).includes("weekly"), first(result));
  }
  const restored = run(["trash", "restore", "weekly"]);
  ok("trash restore 放回原处（还在「项目」下面）", gone && /位置：.*项目/.test(run(["list", "weekly"]).stdout), gone ? first(restored) : "trash 没成功，测不了");

  console.log("— 文档");
  const duplicated = run(["duplicate", "weekly"]);
  ok("duplicate 生成「周报（副本）」", documents().some((entry) => entry?.title === "周报（副本）"), first(duplicated));
  const starred = run(["favorite", "weekly"]);
  ok("favorite 之后 list --json 里 favorite 为 true", documents().find((entry) => entry?.slug === "weekly")?.favorite === true, first(starred));
  const looked = run(["set", "weekly", "--font", "serif"]);
  ok("set --font serif 写进这篇的字体与布局", documents().find((entry) => entry?.slug === "weekly")?.look?.font === "serif", first(looked));
  const markdown = run(["export", "weekly", "--format", "markdown"]);
  ok("export --format markdown 写出 exports/weekly.md", fs.existsSync(path.join(workspace, "exports", "weekly.md")), first(markdown));
  if (executablePath) {
    const pdf = run(["export", "weekly", "--format", "pdf"]);
    ok("export --format pdf 写出 exports/weekly.pdf", fs.existsSync(path.join(workspace, "exports", "weekly.pdf")), first(pdf));
  } else ok("export --format pdf 写出 exports/weekly.pdf", false, "no Chrome or Edge on this machine");
  const copied = run(["copy", "weekly", "--to", other]);
  const copies = fs.existsSync(other) ? fs.readdirSync(other, { recursive: true }).map(String).filter((name) => /weekly/.test(name) && path.basename(name) === "doc.html") : [];
  ok("copy --to 复制到另一个工作区", copies.length > 0, first(copied));

  console.log("— 侧栏的栏");
  const column = run(["column", "new", "项目栏"]);
  ok("column new 新建一栏", run(["list", "--tree"]).stdout.includes("项目栏"), first(column));
  const placed = run(["new", "w3", "三", "--column", "项目栏", "--no-browser"]);
  ok("new --column 放进那一栏", placed.status === 0, first(placed));
  const moved = run(["move", "proj", "--column", "项目栏"]);
  ok("move --column 移进那一栏", moved.status === 0, first(moved));

  console.log("— 自定义页");
  run(["page", "new", "board", "看板"]);
  const renamed = run(["page", "set", "board", "--title", "工作台"]);
  ok("page set --title 改名", listOf(json(["page", "list", "--json"]).value).some((entry) => entry?.slug === "board" && entry?.title === "工作台"), first(renamed));
  const pageTrashed = run(["trash", "board"]);
  const pages = json(["page", "list", "--json"]).value;
  ok("页面也能移到回收区", pages !== null && !listOf(pages).some((entry) => entry?.slug === "board"), first(pageTrashed));

  console.log("— 组件列表");
  const soft = run(["block", "pack", "on", "gallery-soft"]);
  ok("block pack on 打开柔光风格", listOf(json(["block", "pack", "list", "--json"]).value).find((entry) => (entry?.id ?? entry?.pack) === "gallery-soft")?.enabled === true, first(soft));
  run(["block", "pack", "off", "gallery-soft"]); // as the smoke test found it: 柔光风格 off

  console.log("— 批注、上下文、历史");
  {
    const { value, result } = json(["notes", "weekly", "--json"]);
    ok("notes --json 列出批注（可以是空的）", value !== null, first(result));
  }
  {
    const { value, result } = json(["status", "--json"]);
    ok("status --json 说明浏览器里开着什么（可以是空的）", value !== null, first(result));
  }
  run(["open", "weekly", "--no-browser"]);
  const file = path.join(workspace, "weekly", "doc.html");
  // The Agent's first version over the starter (a new document's first write is no change to review:
  // docs/editor.md "Agent's changes", 2026-11-13), then its change, which revert takes back.
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/<section[^>]*data-doc-placeholder[^>]*>[\s\S]*?<\/section>/, "<p>本周进展。</p>"));
  await new Promise((resolve) => setTimeout(resolve, 2000));
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("</main>", "<p>PARITY-MARK</p></main>"));
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const reverted = run(["revert", "weekly"]);
  ok("revert 撤回 Agent 刚才的修改", !fs.readFileSync(file, "utf8").includes("PARITY-MARK"), first(reverted));
  {
    const { value, result } = json(["history", "weekly", "--json"]);
    const versions = value?.versions ?? listOf(value);
    ok("history --json 列出版本", value !== null && versions.length > 0, first(result));
  }

  console.log(`Agent parity acceptance: ${passed} passed, ${failures.length} failed.`);
  assert.deepEqual(failures, [], "the agent-parity acceptance checks");
}
