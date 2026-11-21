import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { addBlockIds } from "../../src/editor/source.mjs";
import { projectRoot, viteConfigFile } from "../../src/shared/paths.mjs";
import { documentFiles } from "../../src/shared/workspace.mjs";
import { HOME_CARDS } from "../../src/shared/pages.mjs";
import { findBrowser } from "../../src/transfer/browser.mjs";

// The browser tests' studio: a temporary directory whose reports/ is the workspace (GALLERY_WORKSPACE:
// the documents at its root, exports/ and .gallery/ in it, as in any workspace) with
// copies of the fixture reports, a Vite preview server of its own on a free port (one of
// GALLERY_TEST_PORTS, "4200-4260", when set), and an installed Chrome or Edge driven by
// puppeteer-core; the downloads and the scenarios' own files beside it. The project's documents and
// editor state are never touched, and a preview server already running (npm run dev:local) is left alone.
// A scenario gets the fixtures with block ids (as add-block-ids.mjs gives them, and as a report is from
// its first version on), or with ids: false as they are on disk, without.
//
// The fixture: `sample`, the report the scenarios work on (tests/browser/fixtures/sample/, a copy of
// an earlier Component Catalog, kept as it is so that the Component Catalog can change without them).
const FIXTURES = {
  sample: path.join(projectRoot, "tests", "browser", "fixtures", "sample"),
};
const SAMPLE = "sample";
// Commands and servers use test-owned registry data, never the user's registry.
process.env.GALLERY_DATA_DIR ||= path.join(os.tmpdir(), "gallery-browser-data");
// Test servers open no browser or file manager; site icons come only from local fixtures.
process.env.GALLERY_NO_BROWSER ||= "1";
process.env.GALLERY_SITE_ICON ||= "local";
// The words Gallery writes into files (a new document's starter, the home page's title…) follow the system's
// language (src/shared/file-language.mjs); the scenarios read them in Chinese on any machine.
process.env.GALLERY_LANGUAGE = "zh";
// A studio and all its registered document folders share one service, data directory and
// default home. Other folders keep their documents; their columns follow 默认文档.
export const studioEnv = (root) => {
  const tmp = path.join(root, "tmp");
  return { TEMP: tmp, TMP: tmp, TMPDIR: tmp, GALLERY_DATA_DIR: path.join(root, "data"), GALLERY_DEFAULT_WORKSPACE: path.join(root, "reports") };
};
const viteBin = path.join(projectRoot, "node_modules", "vite", "bin", "vite.js");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// These runs share the machine with whoever is working at it: all that a run starts inherits this
// priority, so that a person's typing and windows come first.
const LOW = os.constants.priority.PRIORITY_BELOW_NORMAL;
os.setPriority(LOW);

// Chrome sets its GPU process above normal and a visible page's process to normal itself, past the
// priority they inherited: each of its processes is lowered as it comes. Returns the timer.
async function keepLow(browser) {
  const system = await browser.target().createCDPSession();
  const lower = async () => {
    const { processInfo } = await system.send("SystemInfo.getProcessInfo").catch(() => ({ processInfo: [] }));
    for (const { id } of processInfo) {
      try {
        os.setPriority(id, LOW);
      } catch {} // gone meanwhile
    }
  };
  await lower();
  const keeping = setInterval(lower, 3000);
  keeping.unref();
  return keeping;
}

// A studio (a Chrome and a server) holds one of the machine's GALLERY_TEST_STUDIOS slots (6) while it
// is open, whichever worktree or session it belongs to, and waits its turn when none is free. A slot
// is a file in the OS temp folder that its run keeps fresh, so that one a killed run left counts for
// nothing. Waiting ends in an error after SLOT_WAIT: two runs that each hold slots and want more
// would otherwise wait for each other for good.
const SLOTS = path.join(os.tmpdir(), "gallery-browser-slots");
const SLOT_COUNT = Number(process.env.GALLERY_TEST_STUDIOS) || 6;
const SLOT_KEPT = 20_000;
const SLOT_STALE = 180_000;
const SLOT_WAIT = 3_600_000;
async function takeSlot() {
  await fs.mkdir(SLOTS, { recursive: true });
  const asked = Date.now();
  for (let waited = false; ; waited = true) {
    for (let index = 0; index < SLOT_COUNT; index++) {
      const file = path.join(SLOTS, String(index));
      const age = await fs.stat(file).then(({ mtimeMs }) => Date.now() - mtimeMs, () => null);
      if (age !== null && age > SLOT_STALE) await fs.rm(file, { force: true });
      const taken = await fs.open(file, "wx").catch(() => null);
      if (!taken) continue;
      await taken.close();
      const keeping = setInterval(() => fs.utimes(file, new Date(), new Date()).catch(() => {}), SLOT_KEPT);
      keeping.unref();
      return async () => {
        clearInterval(keeping);
        await fs.rm(file, { force: true });
      };
    }
    if (Date.now() - asked > SLOT_WAIT) throw new Error(`No free test studio of ${SLOT_COUNT} for an hour (GALLERY_TEST_STUDIOS).`);
    if (!waited) console.log(`All ${SLOT_COUNT} test studios of this machine are in use: waiting for one.`);
    await sleep(1000);
  }
}

// The browser is found as the workbench's PDF export finds it (BROWSER, or the usual places of
// Chrome, Edge and Chromium); kit-diff.mjs finds it through here.
export { findBrowser };

// A port the OS gives, or with GALLERY_TEST_PORTS ("4200-4260") the first free one of that range.
const listenOn = (port) => new Promise((resolve) => {
  const server = net.createServer();
  server.once("error", () => resolve(null));
  server.listen(port, "127.0.0.1", () => {
    const { port: given } = server.address();
    server.close(() => resolve(given));
  });
});
async function freePort() {
  const range = /^(\d+)-(\d+)$/.exec(process.env.GALLERY_TEST_PORTS ?? "");
  if (!range) return listenOn(0);
  for (let port = Number(range[1]); port <= Number(range[2]); port++) if ((await listenOn(port)) !== null) return port;
  throw new Error(`No free port in GALLERY_TEST_PORTS (${process.env.GALLERY_TEST_PORTS})`);
}

// A gallery command (["export", slug]) or a maintainers' script ("add-block-ids.mjs") run against the
// studio's workspace (`env`: variables besides); throws with its output on failure.
function runScript(root, command, args = [], env = {}) {
  const runs = command.endsWith(".mjs") ? [path.join(projectRoot, "src", "cli", command)] : [path.join(projectRoot, "src", "cli", "bin.mjs"), command];
  const result = spawnSync(process.execPath, [...runs, ...args], {
    cwd: projectRoot,
    // gallery new leaves the server alone: the harness runs its own (a second would run on after the tests).
    // No registry asked (gallery --version's check, which no command here makes but that one).
    env: { ...process.env, GALLERY_WORKSPACE: path.join(root, "reports"), GALLERY_NO_PREVIEW: "1", GALLERY_NO_BROWSER: "1", GALLERY_NO_UPDATE_CHECK: "1", GALLERY_NO_DEFAULT_HOME: "1", GALLERY_NO_PACKS: "1", ...studioEnv(root), ...env },
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`${command} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

// The studio's preview server: `vite` as `npm run dev:local` runs it, on another port; with
// GALLERY_TEST_SERVER=release, the release's own (release/npm/dist/server.mjs, npm run release:build
// makes it: node:http, no Vite), from its home folder as a gallery command starts it. It makes no
// default home page (GALLERY_NO_DEFAULT_HOME: the workbench opens the sample, as the scenarios were
// written for) and installs none of Gallery's own block packs (GALLERY_NO_PACKS: no block in a menu
// but those a scenario adds), but where a scenario of the home page or the packs starts it again with
// `env` saying otherwise.
const releaseServer = path.join(projectRoot, "release", "npm", "dist", "server.mjs");
// A studio's Vite cache (GALLERY_VITE_CACHE_DIR, read by src/vite.config.ts): one folder of its own beside the others the
// runs at once have, under node_modules/.cache (inside the project, where the optimized files are served from), taken
// away with the studio; one a killed run left is taken away by the next run that finds it a day old. A value the caller
// sets (GALLERY_VITE_CACHE_DIR in the environment) is kept: a cache kept warm between runs, by someone who runs one at a time.
const viteCaches = path.join(projectRoot, "node_modules", ".cache", "vite-test");
const viteCacheOf = (root) => process.env.GALLERY_VITE_CACHE_DIR || path.join(viteCaches, path.basename(root));
async function pruneViteCaches() {
  for (const name of await fs.readdir(viteCaches).catch(() => [])) {
    const age = await fs.stat(path.join(viteCaches, name)).then(({ mtimeMs }) => Date.now() - mtimeMs, () => 0);
    if (age > 86_400_000) await fs.rm(path.join(viteCaches, name), { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  }
}
async function startServer(root, port, more = {}) {
  const output = [];
  const release = process.env.GALLERY_TEST_SERVER === "release";
  if (release && !(await fs.stat(releaseServer).catch(() => null))) throw new Error(`GALLERY_TEST_SERVER=release: no ${releaseServer} (npm run release:build makes it)`);
  const child = spawn(process.execPath, release ? [releaseServer, "--port", String(port)] : [viteBin, "--config", viteConfigFile, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: release ? os.homedir() : projectRoot,
    // Vite's cache of optimized dependencies is the studio's own (viteCacheOf): servers of runs at once sharing
    // node_modules/.vite answered "504 Outdated Optimize Dep" to each other (2026-11-08, src/vite.config.ts cacheDir).
    env: { ...process.env, GALLERY_WORKSPACE: path.join(root, "reports"), GALLERY_NO_DEFAULT_HOME: "1", GALLERY_NO_PACKS: "1", GALLERY_VITE_CACHE_DIR: viteCacheOf(root), ...studioEnv(root), ...more },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => output.push(String(chunk)));
  child.stderr.on("data", (chunk) => output.push(String(chunk)));
  child.once('exit', code => { if (code) console.error(`Preview server exited (${code}):\n${output.join('')}`); });
  const exited = new Promise((resolve) => child.once("exit", resolve));
  for (let tries = 0; ; tries++) {
    const up = await fetch(`http://127.0.0.1:${port}/`).then((response) => response.ok, () => false);
    if (up) return { child, exited, output };
    if (child.exitCode !== null || tries > 150) {
      child.kill();
      throw new Error(`The preview server did not start:\n${output.join("")}`);
    }
    await sleep(200);
  }
}

async function stopServer(server) {
  if (server.child.exitCode === null) server.child.kill();
  await server.exited;
}

// Closing a browser context makes Chrome run the unload handlers of each page that has them (the
// editor's pagehide, beforeunload and visibilitychange) and wait for the page's answer. A page that
// reloads by itself just then (after someone else's write, or after sending what the crash buffer
// held) loses that answer with the document it was asked of, and the close never ends
// (`Target.disposeBrowserContext timed out`). So each page leaves for about:blank first: no
// handlers, and nothing there navigates again. The same race can lose that navigation too (the
// reload commits and the way to about:blank never ends), so it is tried again once the page has
// settled. A beforeunload prompt on the way is accepted (a page a scenario opened itself has no
// handler for it).
async function toBlank(page) {
  for (let tries = 0; tries < 3 && page.url() !== "about:blank"; tries++) await page.goto("about:blank", { timeout: 5000 }).catch(() => {});
}

async function closeContext(context) {
  for (const page of await context.pages()) {
    if (page.listenerCount("dialog") === 0) page.on("dialog", (dialog) => dialog.accept().catch(() => {}));
    await toBlank(page);
  }
  await context.close();
}

export async function createStudio() {
  const executablePath = findBrowser();
  if (!executablePath) throw new Error("No Chrome, Edge or Chromium found. Install one, or set GALLERY_BROWSER to its executable.");
  const leaveSlot = await takeSlot();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-browser-"));
  await fs.mkdir(studioEnv(root).TEMP, { recursive: true });
  const originals = new Map();
  const withIds = new Map();
  for (const [slug, directory] of Object.entries(FIXTURES)) {
    const files = {};
    for (const name of ["doc.html", "doc.json"]) files[name] = await fs.readFile(path.join(directory, name), "utf8");
    for (const name of await fs.readdir(path.join(directory, "assets")).catch(() => [])) files[`assets/${name}`] = await fs.readFile(path.join(directory, "assets", name)); // its pictures
    originals.set(slug, files);
    withIds.set(slug, { ...files, "doc.html": addBlockIds(files["doc.html"]).text });
  }
  // The studio's reports as the fixtures are, and nothing else (no report, trash, outline, page or
  // preferences a scenario made), and no exports, nor what gallery qa keeps of them (.gallery/qa/: a
  // baseline, a text kept); the workspace's gallery.json (but a default look a scenario wrote in it, and
  // what it says of the custom pages: their order, the home page made), its component packages (the fixtures': a
  // scenario that writes one takes it away) and the server's own (.gallery/state/, server.json, what was adopted) kept,
  // as .edit-state/ was beside the reports.
  const KEPT = new Set(["gallery.json", ".gallery", "components"]);
  const OWN = new Set(["state", "server.json", "migrated.json", "last-port", "logs"]);
  const reset = async (fixtures = originals) => {
    for (const name of await fs.readdir(path.join(root, "reports")).catch(() => [])) {
      if (!fixtures.has(name) && !KEPT.has(name)) await fs.rm(path.join(root, "reports", name), { recursive: true, force: true, maxRetries: 5 });
    }
    for (const name of await fs.readdir(path.join(root, "reports", ".gallery")).catch(() => [])) {
      if (!OWN.has(name)) await fs.rm(path.join(root, "reports", ".gallery", name), { recursive: true, force: true, maxRetries: 5 });
    }
    for (const [slug, files] of fixtures) {
      await fs.mkdir(path.join(root, "reports", slug), { recursive: true });
      await fs.rm(path.join(root, "reports", slug, "annotations.json"), { force: true }); // a scenario's 批注
      for (const [name, text] of Object.entries(files)) {
        await fs.mkdir(path.dirname(path.join(root, "reports", slug, name)), { recursive: true });
        await fs.writeFile(path.join(root, "reports", slug, name), text);
      }
    }
    // The workspace's default look a scenario left (字体与布局's 应用到全部文档: gallery.json's `look`) taken
    // away, the rest of the file kept: every document of the next one shows its own look alone.
    const marker = path.join(root, "reports", "gallery.json");
    let settings = null;
    try { settings = JSON.parse(await fs.readFile(marker, "utf8")); } catch {}
    if (settings && typeof settings === "object" && ['look', 'pages', 'preferences'].some(key => Object.hasOwn(settings, key))) {
      delete settings.look;
      delete settings.pages;
      delete settings.preferences; // Its files were removed too; the next scenario starts uninitialized.
      await fs.writeFile(marker, `${JSON.stringify(settings, null, 2)}\n`);
    }
    // The home page's first-open note closed, as a reader closes it (src/shared/pages.mjs homeHintClosed),
    // and every default card told of (homeCardsTold: no note of new cards): the scenarios that make a page
    // called home were written before they came, and the ones of the notes (homePageHint, homePageNews)
    // take this away first. And 写作偏好's first-open note closed too (src/shared/preference-documents.mjs
    // preferencesHintShown): the scenarios of the dialog were written before it came, and the ones of the
    // note (writingPreferencesExamples, writingPreferencesHintClose) take it away first.
    await fs.mkdir(path.join(root, "reports", ".gallery"), { recursive: true });
    await fs.writeFile(path.join(root, "reports", ".gallery", "hints.json"), `${JSON.stringify({ home: "closed by the test harness", homeCards: HOME_CARDS, writingPreferences: "closed by the test harness" })}\n`);
    // No review of the Agent's changes goes on into the next scenario (editor/changes.mjs), taken away
    // after the fixtures are written back: the server's look at that write (once it has been quiet a
    // while, the watcher putting it off with every write of the same report) then finds none and only
    // takes the file, where before it the last scenario's file would have been the baseline of one.
    await fs.rm(path.join(root, "reports", ".gallery", "state", "changes"), { recursive: true, force: true, maxRetries: 5 });
    // The registry of workspaces (<studio>/data/workspaces.json) back to the studio's own registration (its server's):
    // every registered workspace that is there is a column of the sidebar (src/shared/workspace-columns.mjs), so that
    // one a scenario made beside the studio (otherWorkspace) and left would show in the next scenario's.
    await fs.rm(path.join(root, "data", "appearance.json"), { force: true });
    const registry = path.join(root, "data", "workspaces.json");
    try {
      const value = JSON.parse(await fs.readFile(registry, "utf8"));
      const own = path.join(root, "reports").toLowerCase();
      const kept = (value.workspaces ?? []).filter((entry) => String(entry?.root ?? "").toLowerCase() === own);
      if (kept.length !== (value.workspaces ?? []).length) await fs.writeFile(registry, `${JSON.stringify({ ...value, workspaces: kept }, null, 2)}\n`);
    } catch {} // none yet
  };
  await reset();
  await fs.cp(path.join(projectRoot, "tests", "fixtures", "components"), path.join(root, "reports", "components"), { recursive: true });
  runScript(root, "check", []); // the fixtures must pass (every document of the workspace)
  // The shared kit files the server serves: built here, unless the run is one of several at once (run.mjs --shards), whose
  // launcher built them before it started them (they write the same files, and a server reads them as they are written).
  if (!process.env.GALLERY_TEST_KIT_BUILT) runScript(root, "build-kit.mjs");
  await pruneViteCaches();
  const port = await freePort();
  let server = await startServer(root, port);
  // HEADFUL=1: a visible window with the GPU, as a reader's browser draws (what headless may not show).
  // In Chinese (--lang): the UI's language follows the browser's until one is chosen (src/shared/i18n), and the
  // scenarios read its words; workbenchLanguage switches it.
  const launch = (options = {}) => puppeteer.launch({ executablePath, headless: !process.env.HEADFUL, args: ["--no-first-run", "--no-default-browser-check", "--lang=zh-CN"], ...options });
  const browser = await launch();
  const keepingLow = await keepLow(browser);
  let context = null;

  return {
    browser: executablePath,
    // A fresh start for one scenario: the fixture files as they were, a browser context of its
    // own (empty storage, downloads into the studio's downloads/) with one page.
    async begin({ ids = true } = {}) {
      const fixtures = ids ? withIds : originals;
      if (context) await closeContext(context);
      await reset(fixtures);
      await fs.rm(path.join(root, "downloads"), { recursive: true, force: true });
      await sleep(250); // the server's file watcher settles
      context = await browser.createBrowserContext({ downloadBehavior: { policy: "allow", downloadPath: path.join(root, "downloads") } });
      const page = await context.newPage();
      // The scenarios were written with the dashed frame around the text edited showing and before the
      // Agent's changes were marked: 显示编辑框 on and 显示变更 off (their defaults the other way:
      // src/shared/preferences.mjs) unless a scenario keeps preferences of its own.
      await page.evaluateOnNewDocument(() => {
        try {
          // (A browser holding them under the name before 2026-10-26 keeps its own: scenario renamedStorage.)
          if (!localStorage.getItem("gallery:preferences") && !localStorage.getItem("html-report-studio:preferences")) localStorage.setItem("gallery:preferences", JSON.stringify({ editFrame: true, showChanges: false }));
        } catch {}
      });
      // GALLERY_TEST_PULL=off: someone else's write always shown by loading the page anew, its pull off (the editor's
      // switch, page/pull/apply.mjs pullOn), for a run to compare with the pull on.
      if (process.env.GALLERY_TEST_PULL === "off") await page.evaluateOnNewDocument(() => { try { localStorage.setItem("gallery-edit:pull", "off"); } catch {} });
      await page.setViewport({ width: 1280, height: 900 });
      // GALLERY_TEST_CPU_THROTTLE=<rate> (4, 6): this page's renderer slowed that many times (CDP
      // Emulation.setCPUThrottlingRate), as a busy machine slows a reader's page, without loading the
      // machine for the runs beside it; the server and the test's own steps run at full speed.
      const throttle = Number(process.env.GALLERY_TEST_CPU_THROTTLE);
      if (throttle > 1) await (await page.createCDPSession()).send("Emulation.setCPUThrottlingRate", { rate: throttle });
      // restart({ env }): the server started again with these variables besides (a scenario of the home
      // page, GALLERY_NO_DEFAULT_HOME: "", starts it again without them at its end); `between()`: what is
      // done while no server runs (a document written then: activityWhileStopped).
      return createTest({ page, root, port, launch, restart: async ({ clearState = false, env = {}, between = null } = {}) => {
        page.restarted = true;
        await stopServer(server);
        if (clearState) await fs.rm(path.join(root, "reports", ".gallery", "state"), { recursive: true, force: true });
        if (between) await between();
        server = await startServer(root, port, env);
      }, originals: fixtures });
    },
    async close() {
      if (context) await closeContext(context).catch(() => {});
      clearInterval(keepingLow);
      await browser.close().catch(() => {});
      await stopServer(server).catch(() => {});
      await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      if (!process.env.GALLERY_VITE_CACHE_DIR) await fs.rm(viteCacheOf(root), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
      await leaveSlot();
    },
  };
}

// What a scenario works with: the page, the studio's files and server, and small helpers.
function createTest({ page, root, port, launch, restart, originals }) {
  let failures = 0;
  const errors = [];
  const posts = [];
  page.on("dialog", (dialog) => dialog.accept());
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    const text = message.text();
    // A missing favicon, the commit endpoint's answers (409 busy, 403 after a lost token) and the
    // workspace's (422: a report that fails its checks is not exported) are expected; so are
    // requests breaking off while a scenario restarts the server or takes the page offline.
    if (message.type() !== "error" || /status of (404|409|403|422)/.test(text)) return;
    if ((page.restarted || page.offline) && /net::ERR_(CONNECTION_(RESET|REFUSED)|FAILED|INTERNET_DISCONNECTED)|Failed to fetch/.test(text)) return;
    errors.push(text);
  });
  page.on("request", (request) => {
    const route = request.url().split("/__gallery/edit/")[1];
    if (route && request.method() === "POST") posts.push(route);
  });
  // A document's file: doc.html, or report.html in one a scenario wrote in the old names.
  const reportFile = (slug) => documentFiles(path.join(root, "reports", slug)).html;

  const t = {
    page,
    root,
    posts,
    sleep,
    get failures() { return failures; },
    check(ok, label, detail = "") {
      if (!ok) failures++;
      console.log(`  ${ok ? "PASS" : "FAIL"} ${label}${detail && !ok ? ` — ${detail}` : ""}`);
      return ok;
    },
    fail(message) {
      failures++;
      console.log(`  FAIL ${message}`);
    },
    // Page errors and console errors seen so far (the runner checks them after each scenario).
    takeErrors: () => errors.splice(0),
    url: (slug = SAMPLE) => `http://127.0.0.1:${port}/generated/${slug}.html`,
    // A page of a browser that draws the system's scrollbars, as a reader's does on Windows: a headless
    // one leaves them out (puppeteer's --hide-scrollbars), and what they take from a page with them.
    async withScrollbars(use) {
      const shown = await launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
      try {
        return await use(await shown.newPage());
      } finally {
        await shown.close().catch(() => {});
      }
    },
    // The workbench.
    home: () => `http://127.0.0.1:${port}/`,
    // A file of the studio (a path under it, "reports/<slug>/doc.json"), or null.
    file: (relative) => fs.readFile(path.join(root, relative), "utf8").catch(() => null),
    list: (relative) => fs.readdir(path.join(root, relative)).catch(() => []),
    // A report of the studio made from the starter, as gallery new makes one.
    newReport(slug, title) {
      runScript(root, "new", [slug, title, "测试用的报告"]);
    },
    original: (slug = SAMPLE) => originals.get(slug)["doc.html"],
    read: (slug = SAMPLE) => fs.readFile(reportFile(slug), "utf8"),
    write: (text, slug = SAMPLE) => fs.writeFile(reportFile(slug), text),
    // The Agent edits the file directly: `change` maps its text to the new text.
    async agentEdit(change, slug = SAMPLE) {
      const before = await t.read(slug);
      const after = change(before);
      if (after === before) throw new Error("agentEdit changed nothing");
      await t.write(after, slug);
    },
    restart,
    // The page left for about:blank, so that the next goto is a fresh load: a page may be reloading by
    // itself just then, a server started again being what it hears (closeContext says the race).
    blank: () => toBlank(page),
    // The one-time migration to block ids (src/cli/add-block-ids.mjs) of a studio report.
    migrate(slug = SAMPLE) {
      runScript(root, "add-block-ids.mjs", [slug]);
    },
    // A gallery command run against the studio's workspace, as an Agent runs it while the workbench is
    // open (its server found by its announcement: gallery open, move, set, new --under); returns what it printed.
    gallery: (command, ...args) => runScript(root, command, args),
    // A gallery command with variables besides (`env`); --workspace selects a registered storage folder.
    galleryWith: (env, command, ...args) => runScript(root, command, args, env),
    // The variables a studio's commands and server have besides (studioEnv): for a server a scenario starts itself.
    env: studioEnv(root),
    port,
    // Check a report of the studio as gallery check does; returns what it printed.
    checkReport(slug = SAMPLE) {
      return runScript(root, "check", [slug]);
    },
    // Export a report from the studio (`more`: others, in one export); returns the file URL of the offline file.
    exportReport(slug = SAMPLE, ...more) {
      runScript(root, "export", [slug, ...more]);
      return new URL(`file:///${path.join(root, "reports", "exports", `${slug}.html`).replace(/\\/g, "/")}`).href;
    },
    // Files the page downloaded in this scenario (the view copy), waiting briefly for them.
    async downloads(timeout = 5000) {
      const directory = path.join(root, "downloads");
      const until = Date.now() + timeout;
      for (;;) {
        const names = (await fs.readdir(directory).catch(() => [])).filter((name) => !name.endsWith(".crdownload"));
        if (names.length > 0 || Date.now() > until) return names;
        await sleep(100);
      }
    },
    readDownload: (name) => fs.readFile(path.join(root, "downloads", name), "utf8"),
    // The studio's exported file (from any export), or null; forgetExport removes it.
    exported: (slug = SAMPLE) => fs.readFile(path.join(root, "reports", "exports", `${slug}.html`), "utf8").catch(() => null),
    forgetExport: (slug = SAMPLE) => fs.rm(path.join(root, "reports", "exports", `${slug}.html`), { force: true }),
    readJson: (slug = SAMPLE) => fs.readFile(documentFiles(path.join(root, "reports", slug)).json, "utf8").then(JSON.parse),

    // The preview page, editing (as it does from the start), opened as by a reader new to it: what earlier
    // pages kept for the next page of their document (the journal, autosave.mjs journalKey, which a page
    // opening on a file changed since asks of at once) is forgotten as it loads, so that a scenario writing
    // its fixture anew between parts (agentEdit or t.write, then t.open) starts each part afresh rather than
    // as a reader whose saved edits an Agent wrote over. Scenarios of the journal reload the page, open the
    // document in the workbench or in a new tab instead (agentRevertAfterReload, agentRevertReopened…).
    async open(slug = SAMPLE) {
      const { identifier } = await page.evaluateOnNewDocument(() => {
        try {
          for (const key of Object.keys(localStorage)) if (key.endsWith(":journal")) localStorage.removeItem(key);
        } catch {}
      });
      try {
        await page.goto(t.url(slug), { waitUntil: "load" });
      } finally {
        await page.removeScriptToEvaluateOnNewDocument(identifier).catch(() => {});
      }
      await t.ready();
    },
    // The page (after a reload) with the kit rendered and the editor started.
    async ready(timeout = 15000) {
      // A page reloads by itself on a file written a moment before it opened: a wait that reload cuts off
      // (any error but its time running out) starts again in the page it brought.
      const waitFor = (selector) => page.waitForSelector(selector, { timeout }).catch((error) => {
        if (error.name === "TimeoutError") throw error;
        return page.waitForSelector(selector, { timeout });
      });
      await waitFor("[data-doc-ready]");
      await waitFor("html[data-ge-editing][data-ge-save]");
      await sleep(150);
    },
    // Put the caret into the first editable block containing `text`: right after `after` (a part
    // of its text), at its start or end, or select all of it.
    async caret(text, { after, where = "end" } = {}) {
      const ok = await page.evaluate((text, after, where) => {
        const host = [...document.querySelectorAll("[data-ge-block], [data-ge-new]")].find((node) => node.textContent.includes(text) && node.getClientRects().length > 0);
        if (!host) return false;
        host.scrollIntoView({ block: "center" });
        host.focus();
        const range = document.createRange();
        if (after !== undefined) {
          const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
          let found = false;
          for (let node; !found && (node = walker.nextNode());) {
            const at = node.data.indexOf(after);
            if (at >= 0) { range.setStart(node, at + after.length); range.collapse(true); found = true; }
          }
          if (!found) return false;
        } else {
          range.selectNodeContents(host);
          if (where !== "all") range.collapse(where === "start");
        }
        getSelection().removeAllRanges();
        getSelection().addRange(range);
        return true;
      }, text, after, where);
      if (!ok) throw new Error(`No editable block with ${JSON.stringify(text)}${after ? ` and ${JSON.stringify(after)}` : ""}`);
      await sleep(60);
    },
    async type(text) {
      await page.keyboard.type(text);
      await sleep(80);
    },
    async press(key, times = 1) {
      for (let index = 0; index < times; index++) await page.keyboard.press(key);
      await sleep(100);
    },
    async combo(modifiers, key) {
      const keys = Array.isArray(modifiers) ? modifiers : [modifiers];
      for (const modifier of keys) await page.keyboard.down(modifier);
      await page.keyboard.press(key);
      for (const modifier of [...keys].reverse()) await page.keyboard.up(modifier);
      await sleep(150);
    },
    // The last notice the page showed (its toast; in a workbench, the workbench shows them).
    status: () => page.$eval(".ge-toast", (node) => node.textContent).catch(() => ""),
    // Where saving stands (autosave): "saved", "waiting", "syncing", "offline", "held", "stopped" or "reloading".
    state: () => page.evaluate(() => document.documentElement.getAttribute("data-ge-save")),
    // Whether something waits to be saved (or is on its way).
    dirty: async () => ["waiting", "syncing", "offline"].includes(await t.state()),
    // Wait until everything the page holds is saved (its checks run 60ms after a change, and a
    // commit waits for a pause in typing), or `state` is reached.
    async settle(state = "saved", timeout = 15000) {
      await sleep(150);
      await page.waitForFunction((state) => document.documentElement.getAttribute("data-ge-save") === state, { timeout }, state);
      await sleep(100);
    },
    // Ctrl+S: whatever waits goes now.
    async save() {
      await t.combo("Control", "s");
      await t.settle();
    },
    // Wait for the page to show the file as it is now by itself (the file changed elsewhere and nothing
    // waited), and to be editing again: by reloading, or by taking the write in where it stands (its pull,
    // page/pull/: the count on its root, data-ge-pulls, grows) with nothing of the file left to show (no
    // data-ge-behind: a pull that held a block the reader changed pulls again after its commit) and nothing
    // waiting or on its way (as a page loaded anew has none: a change of the page's made just before the pull
    // goes after it). Called before what makes it.
    async reloaded(timeout = 15000) {
      const loaded = page.waitForNavigation({ waitUntil: "load", timeout });
      const before = await t.pulls().catch(() => 0);
      const pulled = page.waitForFunction((count) => Number(document.documentElement.getAttribute("data-ge-pulls") ?? 0) > count && !document.documentElement.hasAttribute("data-ge-behind") && ["saved", "held"].includes(document.documentElement.getAttribute("data-ge-save")), { timeout, polling: 50 }, before);
      const how = await Promise.any([loaded.then(() => "reload"), pulled.then(() => "pull")]).catch(() => { throw new Error(`the page neither reloaded nor took the write in within ${timeout} ms`); });
      if (process.env.GALLERY_TEST_SHOW_RELOADS) console.log(`  (shown again by a ${how})`); // which scenarios a pull now serves
      t.lastShown = how;
      await t.ready();
    },
    // The pull off from the next page load on (the editor's switch: page/pull/apply.mjs pullOn), for a scenario of
    // what a page shown anew by a load does with someone else's write.
    async pullOff() {
      await page.evaluateOnNewDocument(() => { try { localStorage.setItem("gallery-edit:pull", "off"); } catch {} });
    },
    // Someone else's writes the page took in where it stands (its pull) since it loaded.
    pulls: () => page.evaluate(() => Number(document.documentElement.getAttribute("data-ge-pulls") ?? 0)),
    // Wait until the page took one more write in where it stands than `count` (no reload).
    async pulled(count, timeout = 15000) {
      await page.waitForFunction((count) => Number(document.documentElement.getAttribute("data-ge-pulls") ?? 0) > count, { timeout, polling: 50 }, count);
      await sleep(100);
    },
    // Commits fail as if the preview server could not be reached (true), or go through again.
    async offline(on = true) {
      page.offline = page.offline || on;
      await page.evaluate((on) => {
        window.__realFetch ??= window.fetch;
        window.fetch = on ? (url, init) => String(url).includes("/__gallery/edit/commit") ? Promise.reject(new TypeError("Failed to fetch")) : window.__realFetch(url, init) : window.__realFetch;
      }, on);
    },
    // The answers to commits held back (true) until released (false), the file written at once: the
    // reader goes on while a commit is on its way. held() waits until an answer is held.
    async hold(on = true) {
      await page.evaluate((on) => {
        window.__realFetch ??= window.fetch;
        window.__heldAnswers ??= [];
        window.fetch = !on ? window.__realFetch : async (url, init) => {
          const response = await window.__realFetch(url, init);
          if (String(url).includes("/__gallery/edit/commit")) await new Promise((resolve) => window.__heldAnswers.push(resolve));
          return response;
        };
        if (!on) window.__heldAnswers.splice(0).forEach((resolve) => resolve());
      }, on);
    },
    held: (timeout = 5000) => page.waitForFunction(() => window.__heldAnswers?.length > 0, { timeout }),
    // The answer to the next commit lost on its way back: the server took the commit, the page
    // hears nothing (the connection broke).
    async loseAnswer() {
      await page.evaluate(() => {
        window.__realFetch ??= window.fetch;
        const real = window.__realFetch;
        window.fetch = async (url, init) => {
          const response = await real(url, init);
          if (!String(url).includes("/__gallery/edit/commit")) return response;
          window.fetch = real;
          throw new TypeError("Failed to fetch");
        };
      });
    },
    // The text blocks of the page in order: what undo and redo must bring back exactly.
    blocks: () => page.evaluate(() => [...document.querySelectorAll("main [data-ge-block], main [data-ge-new]")].map((node) => `${node.tagName}:${node.textContent}`)),
  };
  return t;
}
