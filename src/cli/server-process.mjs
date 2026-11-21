import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { escapeMarkup } from "../shared/escape.mjs";
import { browserSaid, openBrowser } from "./browser-open.mjs";
import { packageRoot, projectRoot, release, reportsDirectory, viteConfigFile } from "../shared/paths.mjs";
import { workspaceId, registerQuietly } from "../shared/workspace-registry.mjs";
import { serviceLocation, workspaceBase } from "../shared/service-location.mjs";
import { fullAddress } from "../shared/page-address.mjs";
import { findPreviewServer, galleryVersion, portIsFree, previewServerFor, readAnnouncement } from "../shared/preview-server.mjs";
import { documentLinks } from "../shared/reports.mjs";
import { defaultWorkspace, documentDirectory, documentFiles } from "../shared/workspace.mjs";

// Commands reuse the sole service announced in <data>/server.json. When none answers, start
// it detached at the data directory's last port, or the first free port from GALLERY_PORT/8080.
// The process serves the default home; document addresses retain their registered owner's prefix.
// Logs live at <data>/logs/server.log. Older CLI versions are replaced; a live dev service is reused.
// new/import/duplicate print the user's workbench address immediately after creating a document
// (and open no browser unless --open asks: arguments.mjs openAsked).
// --no-preview or GALLERY_NO_PREVIEW=1 leaves the service alone. Editing needs Chrome or Edge.

/** The line the address to give the user is on, said as what to do now; and the Agent's own, the page alone. */
export const USER_LINE = "交给用户（现在就把这个地址给用户；用 Chrome 或 Edge 打开）：";
export const AGENT_LINE = "Agent 自用（只有文档页，不交给用户）：";
/**
 * What gallery new's and gallery import's 下一步 line says first when their last line gives the address
 * (`preview`: previewOfNew's lines), `then` after it: to send the user that address, written out in
 * the line, now, in a message of its own, so that the user can open the document while the Agent works.
 * A sentence to forward "as it is"
 * in its place (a second full-width colon in the line, the Agent's own words in the first person) was
 * sent in the handoff, minutes late, 6 times of 6; the address alone, with the 下一步 line starting
 * with it, is what the Agents sent at once (testing the skill with Agents, 2026-10-28), 7 times of 7. The
 * address is in the line itself, as the step's object: a step that sent the reader to "the address on
 * the last line" had the Sonnet runs read a file first and send it a minute and more later, 2 times of
 * 2 (testing the skill with Agents, 2026-11-05). `then` starts with what to write, never with what to read,
 * and names no reference (SKILL.md's step names them): a `then` starting "read references/…" had the
 * Sonnet write runs read at once, sending the address only in their handoff, 2 times of 2 (testing the
 * skill with Agents, 2026-10-30). It asks for the address and for no order of the Agent's work: "before any other
 * step" came out of it when the user left how a document is written to the Agent, the reading before
 * it as much as the writing after it.
 */
export const sendFirst = (address) => `send the user ${address} now, in a message of its own, so that they can open the document while you work; then `;
export function nextLine(preview, then) {
  const last = preview.at(-1) ?? "";
  return `下一步：${last.startsWith(USER_LINE) ? sendFirst(last.slice(USER_LINE.length)) : ""}${then}`;
}
/**
 * The default browser opened at the address a command's last line gives (`preview`: previewLines' or
 * previewOfNew's lines): gallery open's and gallery page open's (a person runs them to open a page),
 * `--no-browser` (or GALLERY_NO_BROWSER=1) opening none; gallery new's, import's and duplicate's only
 * when --open asks (arguments.mjs openAsked). The line saying it, or null with no address.
 */
export async function browserLine(preview, options) {
  const last = preview.at(-1) ?? "";
  if (!last.startsWith(USER_LINE)) return null;
  if (options.has("--no-browser")) return "Not opened in a browser (--no-browser).";
  return browserSaid(await openBrowser(last.slice(USER_LINE.length)));
}
/** The environment variable that keeps gallery new and gallery import from starting the server. */
export const NO_PREVIEW = "GALLERY_NO_PREVIEW";
const set = (value) => !["", "0", undefined].includes(value);
/** Whether gallery new and gallery import leave the server alone: their --no-preview, or NO_PREVIEW set (not "" or "0"). */
export const previewSkipped = (options) => options.has("--no-preview") || set(process.env[NO_PREVIEW]);

/** The first port a command's server is tried on (GALLERY_PORT, else 8080), and how many from it. */
export const FIRST_PORT = 8080;
export const PORTS = 20;
export const firstPort = (env = process.env) => {
  const named = Number(env.GALLERY_PORT);
  return Number.isInteger(named) && named > 0 && named < 65536 ? named : FIRST_PORT;
};
const STARTING = 60_000; // how long a server may take to answer
const LOG_LIMIT = 5 * 1024 * 1024;
const viteBin = path.join(projectRoot, "node_modules", "vite", "bin", "vite.js");
/** The release's server (src/server/start.mjs bundled): node:http, no Vite. */
export const serverEntry = path.join(packageRoot, "dist", "server.mjs");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const serviceRoot = defaultWorkspace();
const layout = serviceLocation();
const previewLogFile = layout.serverLog;
export const ownerBase = () => workspaceBase(reportsDirectory);
/** A document's page (shown as a reader sees it with ?present: no editor, nothing kept). */
export const pageOf = (port, slug) => `http://127.0.0.1:${port}${ownerBase()}/generated/${slug}.html`;
/**
 * The same page as the Agent's own (?agent: the Agent 自用 line's, gallery block try's): what it
 * saves is no reader's edit but the Agent's, in the recent versions and the record of edits
 * (src/editor/page/autosave.mjs).
 */
export const agentPageOf = (port, slug) => `${pageOf(port, slug)}?agent`;
/** The address to give the user: the workbench. */
export const addressOf = (port) => `http://127.0.0.1:${port}/`;
// The same with document `slug`, and block `block` of it, open: by its link, or its page id, which opens it all the same, when the workspace cannot be read for it.
export const placeAddress = async (port, place) => {
  const links = await documentLinks(reportsDirectory).then(result => result.links, () => null);
  const address = fullAddress(`http://127.0.0.1:${port}`, place, links);
  return ownerBase() ? address.replace("/#", `/#~${workspaceId(reportsDirectory)}/`) : address;
};

/** The ports a server is tried on, in order: the data directory’s last one, then `count` from `first`. */
export async function portsToTry({ first = firstPort(), count = PORTS } = {}) {
  const last = Number((await fsp.readFile(layout.lastPortFile, "utf8").catch(() => "")).trim());
  const range = Array.from({ length: Math.max(0, count) }, (_, index) => first + index);
  return Number.isInteger(last) && last > 0 && last < 65536 ? [last, ...range.filter((port) => port !== last)] : range;
}

// The log a started server writes: the one before kept as server.log.1 once it passed LOG_LIMIT.
async function openLog() {
  await fsp.mkdir(path.dirname(previewLogFile), { recursive: true });
  const size = await fsp.stat(previewLogFile).then((stat) => stat.size, () => 0);
  if (size > LOG_LIMIT) await fsp.rename(previewLogFile, `${previewLogFile}.1`).catch(() => {});
  return fs.openSync(previewLogFile, "a");
}

// The server as a command starts it on 127.0.0.1, this port only, detached with its output in the
// log (it announces itself once it listens, kind "cli" as GALLERY_SERVER_KIND says): in the release its
// own (dist/server.mjs: src/server/production.mjs), in its home folder (never the caller's, which
// Windows would then keep from being deleted, nor the package's, which npm could not replace); in a
// source checkout Vite with the dev server's config, after the shared kit files it serves are written
// (their files are replaced in place, so a server running meanwhile never misses one). GALLERY_WORKSPACE
// names the default home to it.
async function start(port, command) {
  if (!release) {
    const { writeSharedAssets } = await import("../render/pipeline.mjs"); // the render's build: loaded only to start a server
    await writeSharedAssets();
  }
  const log = await openLog();
  fs.writeSync(log, `\n[${new Date().toISOString()}] ${command}: Gallery ${galleryVersion} on 127.0.0.1:${port} for ${reportsDirectory}\n`);
  const [args, cwd] = release
    ? [[serverEntry, "--port", String(port)], os.homedir()]
    : [[viteBin, "--config", viteConfigFile, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], projectRoot];
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, GALLERY_WORKSPACE: serviceRoot, GALLERY_SERVER_KIND: "cli" },
    detached: true,
    stdio: ["ignore", log, log],
    windowsHide: true,
  });
  fs.closeSync(log);
  child.unref();
  return child;
}

/**
 * The shared Gallery server, found or started, answering: for document `slug`, its page with the
 * document's title; with none, the workbench's info. `command`: what the log says started a server.
 * Resolves to { ok: true, port, pid, kind, started (a server started here), replaced ({ pid, version }
 * of an older one stopped, or null), passed (the ports passed over, as "4317 (in use)"), movedFrom (the
 * port the data directory's server was on when the last command found it, when that is another, else
 * null) } or { ok:
 * false, reason, message }: "missing" (no such document), "busy" (the shared Gallery server took the
 * request and gave no answer: never a second started beside it), "newer" (a newer Gallery's server,
 * busy), "stuck" (an older one would not stop), "ports" (none free), "timeout" (no answer in
 * `starting` ms), "stopped" (the server started here stopped; its last words in the message).
 * `baseline`: gallery open's, writing gallery qa's baseline first when there is none
 * (src/cli/qa-baseline.mjs previewBaseline: of the document before the round of changes the page is
 * opened for); never new's or import's, whose document is new (its first look pictures its cards).
 * `ports`: those to try (portsToTry: the tests name theirs).
 */
export async function serverFor({ slug = null, command = `gallery open${slug ? ` ${slug}` : ""}`, ports = null, starting = STARTING, baseline = false } = {}) {
  await registerQuietly(reportsDirectory);
  let titled = () => true;
  if (slug) {
    const files = documentFiles(documentDirectory(slug, reportsDirectory));
    const source = await fsp.readFile(files.html, "utf8").catch(() => null);
    if (source === null) return { ok: false, reason: "missing", message: `No document "${slug}": ${files.html} does not exist (gallery new ${slug} "<标题>" makes one; gallery list lists those there are).` };
    // Silent, and never fails; loaded only for it (it reads documents with the render's parser).
    if (baseline) await import("./qa-baseline.mjs").then(({ previewBaseline }) => previewBaseline(slug, source));
    // The titles the page may show: the file's own (the page's <title>, as written) and its metadata's.
    const metadata = await fsp.readFile(files.json, "utf8").then(JSON.parse).catch(() => ({}));
    const titles = [/<title>([^<]*)<\/title>/i.exec(source)?.[1]?.trim(), typeof metadata.title === "string" ? metadata.title.trim() : ""].filter(Boolean);
    titled = (body) => titles.length === 0 || titles.some((title) => body.includes(title) || body.includes(escapeMarkup(title)));
  }
  // The port the last command found the server on (lastPortFile): a server on another now is a changed address, which serverLine says.
  const wasOn = Number((await fsp.readFile(layout.lastPortFile, "utf8").catch(() => "")).trim());
  const candidates = ports ?? (await portsToTry());
  const range = candidates.length ? `${Math.min(...candidates)} to ${Math.max(...candidates)}` : "none";
  // What to run once the server is there: gallery open and gallery page open again, as they were run (a
  // person runs them, to open a page; their `command` keeps an Agent's --no-browser: open.mjs, page.mjs);
  // after any other command, an Agent's, gallery open with --no-browser (no tab of the user's opened by an
  // Agent's step: the user, 2026-11-13).
  const again = /^gallery (?:page )?open\b/.test(command) ? command : `gallery open${slug ? ` ${slug}` : ""} --no-browser`;

  // The shared Gallery server, looked for on the candidates from index `from` on (the ports passed
  // before it in `passed`): the one announced, or one started on the first free port.
  const serverFrom = async (from, passed = []) => {
    const sandbox = Boolean(process.env.GALLERY_SANDBOX);
    const found = await previewServerFor({ ports: sandbox ? [] : candidates.slice(from), start: (port) => start(port, command),
      ...(sandbox ? { version: "0.0.0" } : {}) });
    if (found.busy?.newer) return { failed: { ok: false, reason: "newer", message: `A newer Gallery (${found.busy.version}) serves this Gallery data directory (port ${found.busy.port}, pid ${found.busy.pid}) and gave no answer in 10s; this is Gallery ${galleryVersion}. Update this one (npm i -g @heycys/gallery@latest), or run ${again} again in a while.` } };
    if (found.busy) return { failed: { ok: false, reason: "busy", message: `The shared Gallery server (port ${found.busy.port}, pid ${found.busy.pid}) took the request and gave no answer in 10s: it is busy or stuck. Run ${again} again in a while, or stop that process first (gallery stop): a second server for this data directory is not started beside it.` } };
    if (found.stuck) return { failed: { ok: false, reason: "stuck", message: `An older Gallery's server serves this Gallery data directory and did not stop: ${found.stuck.message}` } };
    if (found.port === null) return { failed: { ok: false, reason: "ports", message: sandbox ? "The sandbox service is stopped. Run gallery sandbox to start a new instance." : `No server for this data directory runs, and no port from ${range} is free to start one on: stop a server on one of them (or name another first port: GALLERY_PORT=<n>), then run ${again}.` } };
    return { ...found, passed: [...passed, ...found.passed] };
  };

  let found = await serverFrom(0);
  if (found.failed) return found.failed;
  let { port, started, passed, replaced } = found;
  let running = found.running ?? null;
  let until = Date.now() + starting;
  let answer = "";
  let serving = null; // the pid the server started here announced (its keeper's child in the release)
  const ready = async () => {
    if (slug) {
      const response = await fetch(`${pageOf(port, slug)}?present`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
      const body = response?.ok ? await response.text() : "";
      answer = !response ? "no answer" : !body ? `HTTP ${response.status}` : `HTTP ${response.status} without the title`;
      return Boolean(body && titled(body));
    }
    const response = await fetch(`http://127.0.0.1:${port}/__gallery/workspace/info`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    answer = !response ? "no answer" : `HTTP ${response.status}`;
    return Boolean(response?.ok);
  };
  for (;; await sleep(300)) {
    if (Date.now() > until) {
      return { ok: false, reason: "timeout", message: `${slug ? pageOf(port, slug) : addressOf(port)} did not answer${slug ? " with the document's title" : ""} in ${starting / 1000}s (${answer})${started ? `; the server's output is in ${previewLogFile}` : ""}.` };
    }
    if (started) {
      // A server started here owns the data directory once its announcement names its process (it writes
      // it as it begins to listen): until then what answers on the port may be another that took it first.
      const announced = await findPreviewServer({ answering: true });
      // The release's process started here is the server's keeper, the server its child (src/server/supervisor.mjs).
      if (announced && (announced.pid === started.pid || announced.keeper === started.pid)) serving = announced.pid;
      else if (announced) {
        // Another server for this data directory announced itself (this command run twice at once): that one
        // is used, and the one started here stopped if it still runs, never a second server.
        if (started.exitCode === null) {
          try {
            process.kill(started.pid);
          } catch {} // it stopped meanwhile
        }
        ({ port } = announced);
        running = { pid: announced.pid, kind: (await readAnnouncement())?.kind ?? "cli", version: null };
        started = null;
        continue;
      }
      if (!announced && started.exitCode === null) {
        answer = "the server started has not announced itself yet";
        continue;
      }
      if (!announced) {
        // It stopped. With its port taken meanwhile (another program's server listened first): on the
        // next free port, unless the shared Gallery server answers by now.
        if (!(await portIsFree(port))) {
          found = await serverFrom(candidates.indexOf(port) + 1, [...passed, `${port} (taken by another program while the server started)`]);
          if (found.failed) return found.failed;
          ({ port, started, passed } = found);
          running = found.running ?? null;
          until = Date.now() + starting;
          continue;
        }
        const said = await fsp.readFile(previewLogFile, "utf8").catch(() => "");
        return { ok: false, reason: "stopped", message: `The Gallery server on port ${port} stopped (exit ${started.exitCode}). Its last words (${previewLogFile}):\n${said.split("\n").slice(-15).join("\n")}` };
      }
    }
    if (await ready()) break;
  }
  // The same address next time (the browser keeps a page's storage by its origin).
  await fsp.writeFile(layout.lastPortFile, `${port}\n`).catch(() => {});
  return { ok: true, port, pid: (started ? serving ?? started.pid : null) ?? running?.pid ?? null, kind: running?.kind ?? "cli", started: Boolean(started), replaced: replaced ?? null, passed, movedFrom: Number.isInteger(wasOn) && wasOn > 0 && wasOn !== port ? wasOn : null };
}

// Ports passed over, said in one run of words, no brackets in brackets ("4317 (in use) and 4318
// (taken by another program while the server started)": found testing the skill with Agents, 2026-10-29, where
// "started now (4317 is taken; 4318 was taken as the server started)" in the line's own brackets
// did not say another program took 4318).
const listed = (items) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/**
 * The line on the server (serverFor's `result`, ok), said only when there is news: the server started
 * here (with its log), an older one replaced, or the port changed from the one the last command found
 * (the addresses given before are dead); then that the command is done and the server runs on, nothing
 * to wait for. null when a server that ran already answered on the same port: it is not said every time.
 */
export function serverLine({ port, pid, kind, started, replaced, passed = [], movedFrom = null }) {
  if (!started && !replaced && movedFrom === null) return null;
  const facts = [
    `pid ${pid}`,
    ...(kind === "dev" ? ["npm run dev's"] : []),
    ...(started ? [`started now${passed.length ? `, after passing over ${listed(passed)}` : ""}`] : []),
    ...(replaced ? [`it replaced Gallery ${replaced.version ?? "an older version"}'s server, pid ${replaced.pid}`] : []),
  ];
  const log = started ? `; its log: ${previewLogFile}` : "";
  const moved = movedFrom === null ? "" : ` It was on port ${movedFrom} before: an address with that port no longer works; use the ones below.`;
  return `提示：Gallery's shared server is on port ${port} (${facts.join(", ")}${log}).${moved} This command is done; the server runs on in the background (nothing to wait for or keep running).`;
}

/**
 * The server's line (serverLine) when there is news in it: a server started (on another port than the
 * last, `passed`, among them) or one replacing an older Gallery's. A server found running is said by
 * nothing: every command returns by itself, and a line saying so each time was one more to read (since
 * 2026-11-11: the server's state only when it started, moved or failed).
 */
export const serverLines = (result) => {
  const line = serverLine(result);
  return line ? [line] : [];
};

/**
 * The lines that end a command that gives the server's address (serverFor's `result`, ok): the
 * server's, when it is news (serverLine); the document's page alone, the Agent's (with a slug); and last the address to give the
 * user now, the workbench (with the document open, by its link, at `block` when one is named: where
 * the user reads and edits it beside the others), after USER_LINE alone.
 */
export async function previewLines(slug, result, block = null) {
  const news = serverLine(result); // only when there is news: a server started, replaced, or on another port
  return [
    ...(news ? [news] : []),
    ...(slug ? [`${AGENT_LINE}${agentPageOf(result.port, slug)}`] : []),
    `${USER_LINE}${slug ? await placeAddress(result.port, { slug, block }) : addressOf(result.port)}`,
  ];
}

/**
 * What gallery new and gallery import say last of the document they made: previewLines once the
 * server answers, or, when it was left alone (`skipped`) or could not be started (`result` not ok),
 * how to start it (never a failure of the command: the document is made). `ports`: serverFor's (the tests').
 */
export async function previewOfNew(slug, { skipped, command, ports = null }) {
  const later = `gallery open ${slug} --no-browser starts it and prints the address to give the user`;
  if (skipped) return [`提示：The server was not started (--no-preview or ${NO_PREVIEW}): ${later}.`];
  const result = await serverFor({ slug, command, ports });
  if (result.ok) return previewLines(slug, result);
  return [`问题：The server was not started: ${result.message}`, `  When that is fixed, ${later}.`];
}
