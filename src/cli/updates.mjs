import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { userDirectory } from "../shared/user-directory.mjs";
import { compareVersions, RELEASED } from "../shared/versions.mjs";
import { AGENTS, recordedVersion, skillNameOf } from "./skill-record.mjs";

// What gallery --version says after the version (its first line, which scripts may read), one line
// each, when there is something to say; no other command says it (the skill runs gallery --version at
// the start of every task). gallery.mjs loads this module for --version alone, and it imports nothing
// but Node's modules and three small ones, so that --version stays as fast as Node's start. Every
// failure here is quiet: --version prints its version whatever happens.
// - 技能：a Gallery skill where gallery skill install would write it (each agent's home, CLAUDE_CONFIG_DIR
//   or ~/.claude and CODEX_HOME or ~/.codex, and the current folder's .claude/ and .codex/) that says
//   it was made by an older Gallery than this one, or says nothing (a skill from before the packager
//   wrote the version: ./skill-record.mjs RECORD), with the command that brings it to this version.
//   Files read, nothing else: always on.
// - 新版本：npm has a newer @heycys/gallery than this one, as a cached check of the registry knows it
//   (in the user's cache folder: cacheDirectory), with what to run. The check never makes --version
//   wait: the cache is read, and when it is a day old (an hour after a failed check), missing or of
//   another registry, --version claims the check by writing the cache as a check that has not answered
//   yet (claimCheck: counted as failed, so that no other --version starts one within the hour, and one
//   that never answers is tried again an hour later; a cache that cannot be written starts none, since
//   its answer could never be read), then a detached process (./update-fetch.mjs) asks the registry
//   npm would install from (registryOf: GALLERY_REGISTRY, else npm's own setting, its environment and
//   .npmrc files, else registry.npmjs.org) for the package's latest, a few seconds at most, through
//   npm's proxy or the environment's where Node can (refreshEnv), and writes the cache for the next
//   --version. GALLERY_NO_UPDATE_CHECK, CI or NO_UPDATE_NOTIFIER set: no cache read, no process
//   started, no line.
// Run by npx (from npm's _npx folder: viaNpx), where no gallery command is installed, both lines give
// the npx form of their command. Neither changes anything: the Agent asks the user, and acts after a
// yes (SKILL.md's first section).

export const PACKAGE = "@heycys/gallery";
export const SKILL_LINE = "技能：";
export const NEWER_LINE = "新版本：";
/**
 * The cache's file in the cache folder: { checked (ms), registry, latest (a version, or null), failed
 * (true after a failed check, and while one runs), checking (true while one runs: claimCheck) }.
 */
export const CACHE_FILE = "update-check.json";
/** How long the registry's answer is believed, and how soon a failed check is tried again; how long the registry is waited for. */
export const FRESH = 24 * 60 * 60 * 1000;
export const RETRY = 60 * 60 * 1000;
export const TIMEOUT = 5000;
const DEFAULT_REGISTRY = "https://registry.npmjs.org/";
const SCOPE = PACKAGE.split("/")[0];
const NEW_SESSION = "（之后新开的 Agent 会话才读到新技能）";

const set = (value) => !["", "0", "false", undefined].includes(value);

/** Whether the registry is never asked: GALLERY_NO_UPDATE_CHECK, CI or NO_UPDATE_NOTIFIER set (not to "", "0" or "false"). */
export const checkOff = (env = process.env) => set(env.GALLERY_NO_UPDATE_CHECK) || set(env.CI) || set(env.NO_UPDATE_NOTIFIER);

/** Whether this gallery runs from npm's npx folder (<npm cache>/_npx/<hash>/node_modules/…), where no gallery command is installed. */
export const viaNpx = (file = fileURLToPath(import.meta.url)) => /[\\/]_npx[\\/]/.test(file);

/**
 * The user's cache folder for Gallery (../shared/user-directory.mjs, "cache"): GALLERY_CACHE_DIR when
 * set; else %LOCALAPPDATA%\gallery on Windows, ~/Library/Caches/gallery on macOS,
 * $XDG_CACHE_HOME/gallery or ~/.cache/gallery elsewhere.
 */
export const cacheDirectory = (options = {}) => userDirectory("cache", options);

/** An .npmrc's top-level settings (ini as npm reads it: ; and # comments, quoted values, ${VAR} and ${VAR?} from the environment; a [section]'s own left out). */
export function parseNpmrc(text, env = process.env) {
  const fill = (value) => value.replace(/(?<!\\)\$\{([^${}?]+)(\?)?\}/g, (whole, name, optional) => env[name] ?? (optional ? "" : whole));
  const settings = {};
  let inSection = false;
  for (const raw of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^[;#]/.test(line)) continue;
    if (/^\[.*\]$/.test(line)) {
      inSection = true;
      continue;
    }
    const at = line.indexOf("=");
    if (inSection || at < 1) continue;
    let value = line.slice(at + 1).trim();
    if (/^(".*"|'.*')$/.test(value)) value = value.slice(1, -1);
    else value = value.split(/(?<!\\)[;#]/)[0].replace(/\\([;#])/g, "$1").trim();
    settings[fill(line.slice(0, at).trim())] = fill(value);
  }
  return settings;
}

/**
 * npm's settings as npm itself finds them for a global install (npm i -g reads no project's .npmrc),
 * each source after the one before it: the environment (npm_config_<key>, in any case, _ for -), the
 * user's .npmrc (npm_config_userconfig, else $HOME/.npmrc), the global npmrc (npm_config_globalconfig,
 * else <prefix>/etc/npmrc, its prefix the environment's, the user's .npmrc's, the builtin npmrc's (on
 * Windows npm's own says ${APPDATA}\npm), PREFIX, else node's folder), npm's builtin npmrc (beside the
 * npm that comes with node). A function of a key, read lazily: nothing is read until a key is asked
 * that the sources before do not hold.
 */
export function npmSettings({ env = process.env, home = env.HOME || os.homedir(), platform = process.platform, execPath = process.execPath } = {}) {
  const fromEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (!/^npm_config_/i.test(key) || !value) continue;
    const name = key.slice("npm_config_".length);
    fromEnv[name.startsWith("//") ? name : name.replace(/(?!^)_/g, "-").toLowerCase()] = value;
  }
  const file = (name) => {
    try {
      return parseNpmrc(readFileSync(name, "utf8"), env);
    } catch {
      return {};
    }
  };
  const asPath = (value) => path.resolve(/^~[\\/]/.test(value) ? path.join(home, value.slice(2)) : value);
  const nodeFolder = platform === "win32" ? path.dirname(execPath) : path.dirname(path.dirname(execPath));
  const sources = [];
  const loaders = [
    () => fromEnv,
    () => file(asPath(fromEnv.userconfig || path.join(home, ".npmrc"))),
    () => {
      const builtin = (sources[3] ??= loaders[3]());
      const prefix = fromEnv.prefix || sources[1].prefix || builtin.prefix || env.PREFIX || nodeFolder;
      return file(asPath(fromEnv.globalconfig || path.join(asPath(prefix), "etc", "npmrc")));
    },
    () => file(platform === "win32" ? path.join(nodeFolder, "node_modules", "npm", "npmrc") : path.join(nodeFolder, "lib", "node_modules", "npm", "npmrc")),
  ];
  return (key) => {
    for (let index = 0; index < loaders.length; index++) {
      sources[index] ??= loaders[index]();
      if (sources[index][key]) return sources[index][key];
    }
    return undefined;
  };
}

/**
 * The registry asked, the one npm would install the package from: GALLERY_REGISTRY, else npm's setting
 * for the package's scope (@heycys:registry), else npm's registry (a mirror set by npm config set
 * registry is in the user's .npmrc: npmSettings), else npm's own; ending in "/".
 */
export function registryOf(env = process.env, npm = npmSettings({ env })) {
  const named = env.GALLERY_REGISTRY || npm(`${SCOPE}:registry`) || npm("registry") || DEFAULT_REGISTRY;
  return named.endsWith("/") ? named : `${named}/`;
}

/**
 * The environment ./update-fetch.mjs runs in: NODE_USE_ENV_PROXY=1, so that Node's fetch goes through
 * HTTPS_PROXY/HTTP_PROXY and leaves out NO_PROXY's hosts (Node 24, 22.21 and later; an older Node
 * ignores it, and behind a proxy the check fails, quietly), npm's proxy (https-proxy, else proxy) and
 * noproxy taking the environment's place as they do for npm.
 */
export function refreshEnv(env = process.env, npm = npmSettings({ env })) {
  const next = { ...env, NODE_USE_ENV_PROXY: "1" };
  const replace = (pattern, value) => {
    for (const key of Object.keys(next)) if (pattern.test(key)) delete next[key];
    Object.assign(next, value);
  };
  const proxy = npm("https-proxy") || npm("proxy");
  if (proxy) replace(/^https?_proxy$/i, { HTTPS_PROXY: proxy, HTTP_PROXY: proxy });
  const noProxy = npm("noproxy");
  if (noProxy) replace(/^no_proxy$/i, { NO_PROXY: noProxy });
  return next;
}

/** Where a registry says the package's latest version: <registry>@heycys%2fgallery/latest. */
export const latestUrl = (registry) => `${registry}${PACKAGE.replace("/", "%2f")}/latest`;

/** The cache as written, or null (none, or not JSON). */
export function readCache(file) {
  try {
    const cache = JSON.parse(readFileSync(file, "utf8"));
    return cache && typeof cache === "object" ? cache : null;
  } catch {
    return null;
  }
}

/** Whether the cache is to be written again: none, of another registry, a day old (an hour after a failed check, or one that has not answered), or from the future. */
export function stale(cache, registry, now = Date.now()) {
  if (!cache || !Number.isFinite(cache.checked) || cache.registry !== registry) return true;
  const age = now - cache.checked;
  return age < 0 || age >= (cache.failed ? RETRY : FRESH);
}

/** The latest version a cache knows of `registry` (another registry's is not believed), or null. */
const knownLatest = (cache, registry) => (cache?.registry === registry && typeof cache.latest === "string" && RELEASED.test(cache.latest) ? cache.latest : null);

/**
 * The check claimed before it starts (what --version writes, at once): the cache written as a check
 * that has not answered, which counts as failed (stale's hour), with the version known before, so that
 * no other --version starts one while it runs, nor within the hour when it never answers. False when
 * the cache cannot be written: then no check starts, as its answer could never be read.
 */
export function claimCheck(file, registry, cache, now = Date.now()) {
  const written = `${file}.${process.pid}.tmp`;
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(written, `${JSON.stringify({ checked: now, registry, latest: knownLatest(cache, registry), failed: true, checking: true })}\n`);
    renameSync(written, file);
    return true;
  } catch {
    return false;
  } finally {
    try {
      rmSync(written, { force: true });
    } catch {}
  }
}

/** The cache written afresh from the registry (what ./update-fetch.mjs runs): its latest, or after a failure the one known before of that registry, marked failed. */
export async function refreshCache(file, registry, { timeout = TIMEOUT, now = Date.now } = {}) {
  let latest = null;
  try {
    const response = await fetch(latestUrl(registry), { signal: AbortSignal.timeout(timeout), headers: { Accept: "application/json" } });
    if (response.ok) {
      const { version } = await response.json();
      if (typeof version === "string" && RELEASED.test(version)) latest = version;
    }
  } catch {}
  const record = latest ? { checked: now(), registry, latest } : { checked: now(), registry, latest: knownLatest(readCache(file), registry), failed: true };
  await fs.mkdir(path.dirname(file), { recursive: true });
  const written = `${file}.${process.pid}.tmp`;
  try {
    await fs.writeFile(written, `${JSON.stringify(record)}\n`);
    await fs.rename(written, file);
  } finally {
    await fs.rm(written, { force: true }).catch(() => {});
  }
  return record;
}

/** ./update-fetch.mjs started, detached and unwaited for, to write the cache; a failure to start it is quiet. */
export function startRefresh(file, registry, { env = process.env } = {}) {
  try {
    const child = spawn(process.execPath, [fileURLToPath(new URL("./update-fetch.mjs", import.meta.url)), file, registry], {
      cwd: os.homedir(), // never the caller's folder, which Windows would keep from being deleted meanwhile
      env,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/** Where gallery skill install would write the skill, and whether that is a project's (--project): [{ folder, project }], each folder once. */
export function skillFolders({ env = process.env, cwd = process.cwd() } = {}) {
  const found = [
    ...Object.values(AGENTS).map((agent) => ({ folder: path.join(path.resolve(agent.home(env)), "skills", "gallery"), project: false })),
    ...Object.values(AGENTS).map((agent) => ({ folder: path.join(path.resolve(cwd), agent.project, "skills", "gallery"), project: true })),
  ];
  const key = (folder) => (process.platform === "win32" ? folder.toLowerCase() : folder);
  return found.filter(({ folder }, index) => found.findIndex((other) => key(other.folder) === key(folder)) === index);
}

/** The command that runs Gallery `version` (a range: ^<it>) with `rest`: gallery, or by npx its npx form. */
export const galleryRun = (rest, version, npx) => (npx ? `npx -y ${PACKAGE}@^${version} ${rest}` : `gallery ${rest}`);

/** The 技能 line of a skill in `folder` made by Gallery `made` (null: it does not say), older than this gallery `version`; `npx`: run by npx. */
export const skillLine = (folder, made, version, project, npx = false) =>
  `${SKILL_LINE}${folder} 是${made ? ` Gallery ${made} ` : "旧版 Gallery（没写版本）"}的，比这个 gallery ${version} 旧；问过用户后运行 ${galleryRun(`skill install${project ? " --project" : ""}`, version, npx)}${NEW_SESSION}`;

/** The 新版本 line: npm has Gallery `latest`, newer than this `version`; `npx`: run by npx, where the newer range's skill install is all there is to run. */
export const newerLine = (latest, version, npx = false) =>
  `${NEWER_LINE}npm 上有 Gallery ${latest}，这个 gallery 是 ${version}；问过用户后运行 ${npx ? galleryRun("skill install", latest, true) : `npm i -g ${PACKAGE}@^${latest}，再运行 gallery skill install`}${NEW_SESSION}`;

/**
 * The Gallery skills found where gallery skill install would write one (skillFolders; a git checkout,
 * which gallery skill install refuses, left alone): [{ folder, project, made (the version its SKILL.md
 * says, or null), older (made by an older Gallery than `version`, or says none) }]. Files read, nothing else.
 */
export function skillStates(version, { env = process.env, cwd = process.cwd() } = {}) {
  const found = [];
  for (const { folder, project } of skillFolders({ env, cwd })) {
    let text;
    try {
      text = readFileSync(path.join(folder, "SKILL.md"), "utf8");
    } catch {
      continue;
    }
    if (!["gallery", "html-report-studio"].includes(skillNameOf(text)) || existsSync(path.join(folder, ".git"))) continue;
    const made = recordedVersion(text);
    found.push({ folder, project, made, older: !made || compareVersions(made, version) < 0 });
  }
  return found;
}

/** The 技能 lines: each Gallery skill of skillStates older than `version`. */
export function skillLines(version, { env = process.env, cwd = process.cwd(), npx = false } = {}) {
  return skillStates(version, { env, cwd }).filter(({ older }) => older).map(({ folder, made, project }) => skillLine(folder, made, version, project, npx));
}

/**
 * What the update cache says of npm, never asking it: { off (GALLERY_NO_UPDATE_CHECK, CI or
 * NO_UPDATE_NOTIFIER: nothing read), latest (the version the registry asked last answered, or null: no
 * answer yet), newer (that version is newer than `version`), checking (no answer is known: a check
 * runs, or was claimed within the hour) }. With `refresh`, a stale cache is claimed and its check
 * started as gallery --version does (detached, never waited for). Never throws.
 */
export function npmStatus(version, { env = process.env, now = Date.now(), refresh = false } = {}) {
  if (checkOff(env)) return { off: true, latest: null, newer: false, checking: false };
  try {
    const npm = npmSettings({ env });
    const registry = registryOf(env, npm);
    const file = path.join(cacheDirectory({ env }), CACHE_FILE);
    const cache = readCache(file);
    if (refresh && stale(cache, registry, now) && claimCheck(file, registry, cache, now)) startRefresh(file, registry, { env: refreshEnv(env, npm) });
    const latest = knownLatest(cache, registry);
    return { off: false, latest, newer: Boolean(latest) && compareVersions(latest, version) > 0, checking: latest === null };
  } catch {
    return { off: false, latest: null, newer: false, checking: true };
  }
}

/**
 * What needs handling that every command may say in one line at its end (gallery.mjs, `需要处理：…`):
 * a skill older than this gallery, a mismatch that makes the skill and the commands disagree. A newer
 * Gallery on npm is no such thing: gallery --version says it (新版本：, which the Agent tells the user
 * once, in the task that ran it) and gallery doctor does, and the other commands no longer repeat it at
 * the end of every command of every task (the user, 2026-11-13). Cheap (four small files), never asks
 * the registry; nothing under GALLERY_NO_UPDATE_CHECK, CI or NO_UPDATE_NOTIFIER. [] when there is
 * nothing; never throws.
 */
export function attentionNotes(version, { env = process.env, cwd = process.cwd() } = {}) {
  if (checkOff(env)) return [];
  const notes = [];
  try {
    if (skillStates(version, { env, cwd }).some(({ older }) => older)) notes.push("装了的技能比这个 gallery 旧");
  } catch {}
  return notes;
}

/**
 * What gallery --version prints after `version`: the 技能 lines, then the 新版本 line when the cache
 * knows a newer version of the registry asked (its check claimed and started first when it is stale).
 * Never throws.
 */
export function versionNotes(version, { env = process.env, cwd = process.cwd(), now = Date.now(), npx = viaNpx() } = {}) {
  const lines = [];
  try {
    lines.push(...skillLines(version, { env, cwd, npx }));
  } catch {}
  const npm = npmStatus(version, { env, now, refresh: true });
  if (npm.newer) lines.push(newerLine(npm.latest, version, npx));
  return lines;
}
