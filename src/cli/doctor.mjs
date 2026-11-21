import { existsSync, readFileSync, statSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { compareVersions } from "../shared/versions.mjs";
import { markerOf } from "../shared/workspace.mjs";
import { commandArguments } from "./arguments.mjs";
import { versionOf } from "./gallery.mjs";
import { PACKAGE, galleryRun, npmStatus, skillStates, viaNpx } from "./updates.mjs";

// gallery doctor [--json] (./usage.mjs): is this machine ready for Gallery, in one command and one next
// step. Looked at, one line each: the Node it runs on (package.json's engines), this Gallery and what
// npm has newer (the update cache only: a stale one starts the background check gallery --version
// starts, and nothing here waits for it), the Gallery skills installed where gallery skill install
// would write them (older or newer than this gallery), whether the workspace can be written (or, when
// it is not made yet, the folder it would be made in), and a Chrome or Edge for the pages that are
// looked at (GALLERY_BROWSER or the usual places). Each check is "好", "问题" (something to do) or
// "提示" (worth saying, nothing to do); the last line is the one thing to do first (下一步：) by the
// order of the list below, or 一切正常. Exit 0 when nothing is a 问题, 1 else. It reads and makes
// nothing but a file it writes into the workspace's folder and takes away at once, to know that it can
// write there (no workspace is made: gallery.mjs MAKES_NOTHING).
// The first thing to do, by priority: Node, the workspace, the skill (older than this gallery: install
// it; newer: this gallery is the one to update), a newer Gallery on npm, the browser.
// --json: one object { ok, version, workspace, checks: [{ id, status ("ok", "problem" or "note"), text,
// ...the check's own fields }], next } (usage.mjs says the fields).

const REQUIRED = "22.13.0";
const NEW_SESSION = "然后开一个新的会话";

const unique = (list) => [...new Set(list)];

/** The checks of this machine as { id, status, text, … }, in the order they are said, and the one thing to do first (null when nothing is a problem). */
export async function examine({ version = versionOf(), workspace, how = null, env = process.env, cwd = process.cwd(), node = process.versions.node, npx = viaNpx(), browser = null } = {}) {
  const checks = [];
  const todo = []; // [priority, what to do] of each problem
  const make = (status, { id, text, ...own }) => ({ id, status, text, ...own });
  const problem = (check, priority, next) => {
    checks.push(make("problem", check));
    todo.push([priority, next]);
  };
  const fine = (check) => checks.push(make("ok", check));
  const note = (check) => checks.push(make("note", check));

  // Node.
  if (compareVersions(node, REQUIRED) < 0) {
    problem({ id: "node", version: node, required: `>=${REQUIRED}`, text: `Node ${node} is older than the ${REQUIRED} Gallery needs` }, 0, "装 Node 22.13 或更新的版本（https://nodejs.org 的 LTS），然后再运行这条命令");
  } else {
    fine({ id: "node", version: node, required: `>=${REQUIRED}`, text: `Node ${node}（要 ${REQUIRED} 以上）` });
  }

  // Gallery and npm's newer one.
  const npm = npmStatus(version, { env, refresh: true });
  const upgrade = npm.latest ? (npx ? galleryRun("skill install", npm.latest, true) : `npm i -g ${PACKAGE}@^${npm.latest}，再运行 gallery skill install`) : "";
  if (npm.newer) {
    problem({ id: "gallery", version, latest: npm.latest, text: `Gallery ${version}，npm 上有新版 ${npm.latest}` }, 3, `问过用户后运行 ${upgrade}，${NEW_SESSION}`);
  } else if (npm.off) {
    note({ id: "gallery", version, latest: null, text: `Gallery ${version}（没有查 npm：GALLERY_NO_UPDATE_CHECK、CI 或 NO_UPDATE_NOTIFIER 设了）` });
  } else if (npm.latest) {
    fine({ id: "gallery", version, latest: npm.latest, text: `Gallery ${version}（npm 上最新的是 ${npm.latest}，没有更新的）` });
  } else {
    note({ id: "gallery", version, latest: null, text: `Gallery ${version}（还不知道 npm 上有没有新版：后台正在查，下次 gallery doctor 就有答案）` });
  }

  // The skills.
  const skills = skillStates(version, { env, cwd });
  if (skills.length === 0) {
    note({ id: "skill", installed: [], text: "没有找到装好的 Gallery 技能（gallery skill install 装一份；技能在别处加载的，不用管这一条）" });
  } else {
    const rows = skills.map(({ folder, project, made, older }) => ({ folder, project, version: made, older: older && (!made || compareVersions(made, version) < 0), newer: Boolean(made) && compareVersions(made, version) > 0 }));
    const old = rows.filter((row) => row.older);
    const ahead = rows.filter((row) => row.newer);
    const said = (row) => `${row.folder} 是${row.version ? ` Gallery ${row.version} ` : "旧版 Gallery（没写版本）"}的`;
    const text = rows.map((row) => `${said(row)}${row.older ? `，比这个 gallery ${version} 旧` : row.newer ? `，比这个 gallery ${version} 新` : "，和这个 gallery 一样新"}`).join("；");
    if (old.length) {
      const commands = unique(old.map((row) => galleryRun(`skill install${row.project ? " --project" : ""}`, version, npx)));
      problem({ id: "skill", installed: rows.map(({ newer, ...row }) => row), text: `技能 ${text}` }, 2, `运行 ${commands.join("，再运行 ")}，${NEW_SESSION}`);
    } else if (ahead.length) {
      const newest = ahead.map((row) => row.version).sort((a, b) => compareVersions(b, a))[0];
      problem({ id: "skill", installed: rows.map(({ newer, ...row }) => row), text: `技能 ${text}` }, 2, `问过用户后运行 ${npx ? galleryRun("skill install", newest, true) : `npm i -g ${PACKAGE}@^${newest}`}，把 gallery 升到技能的版本，${NEW_SESSION}`);
    } else {
      fine({ id: "skill", installed: rows.map(({ newer, ...row }) => row), text: `技能 ${text}` });
    }
  }

  // The workspace: can it be written (or, not made yet, the folder it would be made in)?
  const spot = await writable(workspace);
  const where = how ? `（${{ flag: "--workspace", env: "GALLERY_WORKSPACE", found: "上层的 gallery.json", default: "默认位置" }[how] ?? how}）` : "";
  if (!spot.writable) {
    problem({ id: "workspace", path: workspace, exists: spot.exists, writable: false, text: `工作区 ${workspace} 写不进去${spot.code ? `（${spot.code}）` : ""}${where}` }, 1, "给 Gallery 一个能写的文件夹：每条命令加 --workspace <文件夹>，或设环境变量 GALLERY_WORKSPACE");
  } else if (spot.foreign) {
    problem({ id: "workspace", path: workspace, exists: true, writable: true, text: `工作区 ${workspace} 里的 gallery.json ${spot.foreign === "json" ? "读不成 JSON" : "不是 Gallery 的"}${where}` }, 1, `${spot.foreign === "json" ? `修好 ${path.join(workspace, "gallery.json")}` : "换一个文件夹放 Gallery 的文档"}：每条命令加 --workspace <文件夹>，或设环境变量 GALLERY_WORKSPACE`);
  } else if (!spot.exists) {
    fine({ id: "workspace", path: workspace, exists: false, writable: true, text: `工作区 ${workspace} 还没建，写得进去（第一条写文档的命令会建它）${where}` });
  } else {
    fine({ id: "workspace", path: workspace, exists: true, writable: true, text: `工作区 ${workspace} 可以写${where}` });
  }

  // A Chrome or Edge: gallery qa looks at pages with it, and the user edits in it.
  const found = browser === null ? await findBrowserHere(env) : browser;
  if (found.path) {
    fine({ id: "browser", path: found.path, text: `浏览器 ${found.path}` });
  } else {
    problem({ id: "browser", path: null, text: `浏览器：${found.why}` }, 4, "装 Chrome 或 Edge，或用 GALLERY_BROWSER=<浏览器的可执行文件> 指一个；装不了的话，gallery qa 会说 UNVERIFIED，导出的文件要自己在 1024、736 和 360px 看，并告诉用户");
  }

  const first = todo.sort((a, b) => a[0] - b[0])[0]?.[1] ?? null;
  return { checks, next: first, ok: todo.length === 0 };
}

/** A Chrome or Edge: { path } or { path: null, why }. */
async function findBrowserHere(env) {
  const { findBrowser } = await import("../transfer/browser.mjs");
  const found = findBrowser();
  if (!found) return { path: null, why: "找不到 Chrome 或 Edge（gallery qa 和在浏览器里编辑要用）" };
  if (env.GALLERY_BROWSER && !existsSync(found)) return { path: null, why: `GALLERY_BROWSER 指的 ${found} 不存在` };
  return { path: found };
}

/**
 * Whether the workspace `root` can be written: { exists, writable, code, foreign }. A folder is tried by
 * a file made in it and taken away; one not made yet by the same in the nearest folder above that is
 * there (where the first command makes it). `foreign`: its gallery.json is another program's ("ours") or
 * no JSON ("json"), which every command refuses.
 */
export async function writable(root) {
  const exists = existsSync(root);
  let folder = path.resolve(root);
  while (!existsSync(folder) && path.dirname(folder) !== folder) folder = path.dirname(folder);
  try {
    if (!statSync(folder).isDirectory()) return { exists, writable: false, code: "ENOTDIR" };
    const probe = path.join(folder, `.gallery-doctor-${process.pid}.tmp`);
    await fs.writeFile(probe, "", { flag: "wx" });
    await fs.rm(probe, { force: true });
  } catch (error) {
    return { exists, writable: false, code: error.code ?? error.message };
  }
  if (!exists) return { exists, writable: true };
  let text = null;
  try {
    text = readFileSync(path.join(root, "gallery.json"), "utf8");
  } catch {}
  if (text !== null) {
    const marker = markerOf(text);
    if (!marker.reads) return { exists, writable: true, foreign: "json" };
    if (!marker.ours) return { exists, writable: true, foreign: "ours" };
  }
  return { exists, writable: true };
}

export async function run(argv, context = {}) {
  const { options } = commandArguments({ options: ["--json"], argv });
  const version = context.version ?? versionOf();
  const workspace = context.workspace ?? process.env.GALLERY_WORKSPACE;
  const { checks, next, ok } = await examine({ version, workspace, how: context.how ?? null });
  if (options.has("--json")) {
    console.log(JSON.stringify({ ok, version, workspace, checks, next }, null, 2));
  } else {
    for (const check of checks) console.log(`${{ ok: "好    ", problem: "问题  ", note: "提示  " }[check.status]}${check.text}`);
    console.log(next ? `下一步：${next}` : "一切正常。");
  }
  if (!ok) process.exitCode = 1;
}
