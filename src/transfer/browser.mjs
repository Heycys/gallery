import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { APART } from "../editor/components/registry.mjs";
import { encodePicture } from "../shared/export-pictures.mjs";

// A headless Chrome (Edge, Chromium) for what only a browser can make of a report: a PDF of it
// (the system's browser makes it, headless, with the paper and scale asked for, no print dialog),
// pictures of its charts for a Markdown export and the copies of
// an export's pictures as light as the page needs (encodePictures). Started
// when first needed, closed when idle for a minute. puppeteer-core drives the browser installed on
// the system (findBrowser); without one, a PDF says so and charts go without pictures. gallery qa
// (src/cli/qa.mjs) and the browser tests find the browser, and wait for a page, as this does.

const IDLE = 60_000;
const CHANGING = 600; // how long the PDF waits for the page to stop changing (settle)
/** The paper sizes an export offers, as Chrome names them. */
export const PAPERS = ["A4", "A3", "Letter", "Legal", "Tabloid"];

/**
 * GALLERY_BROWSER (its executable) picks one; otherwise the usual places of Chrome, Edge and
 * Chromium. Null when none. BROWSER is not read: on Linux it often names Firefox or xdg-open, which
 * puppeteer cannot drive.
 */
export function findBrowser() {
  if (process.env.GALLERY_BROWSER) return process.env.GALLERY_BROWSER;
  const { PROGRAMFILES = "", "PROGRAMFILES(X86)": x86 = "", LOCALAPPDATA = "", HOME = "" } = process.env;
  const candidates = {
    win32: [
      `${PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`, `${x86}\\Google\\Chrome\\Application\\chrome.exe`,
      `${LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      `${x86}\\Microsoft\\Edge\\Application\\msedge.exe`, `${PROGRAMFILES}\\Microsoft\\Edge\\Application\\msedge.exe`,
    ],
    darwin: [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      ...(HOME ? [`${HOME}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, `${HOME}/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge`, `${HOME}/Applications/Chromium.app/Contents/MacOS/Chromium`] : []),
    ],
    linux: [
      "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/opt/google/chrome/chrome", "/usr/bin/microsoft-edge", "/usr/bin/microsoft-edge-stable",
      "/opt/microsoft/msedge/msedge", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium",
    ],
  }[process.platform] ?? [];
  return candidates.find((candidate) => candidate && existsSync(candidate)) ?? null;
}

/**
 * What a headless browser is started with beyond its own arguments: --no-sandbox when this process
 * runs as root (a container, a cloud sandbox), where Chrome will not start with its sandbox.
 */
export const sandboxArguments = () => (process.getuid?.() === 0 ? ["--no-sandbox"] : []);

/** The browser gallery qa and gallery block check look at a page in: its arguments beside startBrowser's. */
export const lookingArguments = () => ["--no-first-run", "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars", "--lang=zh-CN", ...sandboxArguments()];

/**
 * Whether a console message of the page at `address` is the page's own word, for what looks at a page:
 * not the browser's on a request or on the policy, which are heard apart, and not another page's in a
 * frame (an embed block's, online). `also`: what else a script of the page may say it is (sourceURL).
 */
export function ownMessage(message, address, also = []) {
  const from = message.location()?.url ?? "";
  return !/^Failed to load resource|^Refused to |Content Security Policy/.test(message.text()) && (!from || from.startsWith(address) || also.includes(from));
}

/** Keeps what the policy blocks on every page `page` opens, in the page's __qaViolations: { url, directive, source, line }, `source` and `line` of what asked, where the browser says. */
export const keepViolations = (page) => page.evaluateOnNewDocument(() => {
  globalThis.__qaViolations = [];
  document.addEventListener("securitypolicyviolation", (event) => {
    globalThis.__qaViolations.push({ url: event.blockedURI, directive: event.effectiveDirective || event.violatedDirective, source: event.sourceFile, line: event.lineNumber });
  });
});

const STARTING = 30_000; // how long a browser may take to open its DevTools port, and to answer once it has
/** How long a tab, a browser context or a browser has to close before a look goes on without it (closed). */
export const CLOSING = 5000;

/**
 * `closing` (the promise of a tab's or a context's close()) waited for `ms` at most, and never failing:
 * puppeteer's page.close() waits, with no bound of its own, for the browser to say the tab is gone (and,
 * before that, for a picture being taken), and a browser that does not say it left a look waiting
 * with the tab still open (found testing the skill with Agents, 2026-11-09: gallery page check 15 minutes). What does not
 * close in time is left for the browser's own close, which kills it (startBrowser's close()).
 */
export function closed(closing, ms = CLOSING) {
  let timer = 0;
  const late = new Promise((resolve) => { timer = setTimeout(resolve, ms); });
  return Promise.race([Promise.resolve(closing).catch(() => {}), late]).finally(() => clearTimeout(timer));
}
// A wait that keeps the process from exiting no longer than what it waits for does (unref: the
// waits below race a browser's exit, and one that exited at once must not hold qa 5s more).
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms).unref());
const oneLine = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
// The last line a browser wrote on its stderr, said after a colon (none: nothing).
const lastWords = (said) => {
  const line = said.split(/\r?\n/).map(oneLine).filter(Boolean).at(-1);
  return line ? `: ${line.slice(0, 200)}` : "";
};

/**
 * A headless browser at `executablePath`, with `args` beside puppeteer's own defaults, in a profile
 * of its own (a fresh temporary folder each attempt, removed after), for gallery qa: { browser (a
 * puppeteer Browser), close() (the browser closed, then its profile removed; never throws), failures
 * (the messages of the attempts that failed before it started) }. A launch that fails is tried once
 * more with a fresh profile (`attempts`, 2) before this throws, the error's `failures` each attempt's
 * message: a browser installed and not starting once, as in the dry run of the skill-only install
 * (puppeteer said the profile was in use: "Use a different userDataDir or stop the running browser
 * first", which an Agent cannot act on), most often starts the second time. `start`: what starts one
 * ({ executablePath, args, profile } -> { browser, stop }), startChromium, or a test's.
 */
export async function startBrowser({ executablePath, args = [], attempts = 2, start = startChromium }) {
  const failures = [];
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const profile = await fsp.mkdtemp(path.join(os.tmpdir(), "gallery-browser-"));
    const removed = () => fsp.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    try {
      const { browser, stop } = await start({ executablePath, args, profile });
      return { browser, failures, close: async () => {
        await stop().catch(() => {});
        await removed();
      } };
    } catch (error) {
      failures.push(oneLine(error?.message ?? error));
      await removed();
    }
  }
  throw Object.assign(new Error(failures.at(-1) ?? "the browser did not start"), { failures });
}

/**
 * The browser started by this process itself and driven through puppeteer.connect, never
 * puppeteer.launch: puppeteer kills a browser it launched with taskkill on Windows when it closes it
 * by force, or when this process exits while the browser still runs (a launch that failed, an exit
 * right after it), and taskkill's "ERROR: The process with PID … could not be terminated. Reason:
 * There is no running instance of the task." (the browser gone meanwhile) went to gallery qa's own
 * output (execSync hands its stderr down). Here the browser runs with puppeteer's default arguments
 * and `args`, its DevTools port its first words; it is closed through the protocol, waited for, and
 * only then killed if it still runs (TerminateProcess, or its process group's SIGKILL elsewhere:
 * silent), and killed as well if this process exits before (`exit`). Rejects when it exits, or says
 * nothing in STARTING ms, before its port opens: with its last words.
 */
export async function startChromium({ executablePath, args, profile, starting = STARTING }) {
  const { default: puppeteer } = await import("puppeteer-core");
  const argv = await puppeteer.defaultArgs({ headless: true, userDataDir: profile, args: [...args, "--remote-debugging-port=0"] });
  const posix = process.platform !== "win32";
  const child = spawn(executablePath, argv, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true, detached: posix });
  let unstarted = false; // no process at all (no such file, not executable): it never exits
  child.on("error", () => (unstarted ||= child.pid === undefined));
  const gone = () => unstarted || child.exitCode !== null || child.signalCode !== null;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  const kill = () => {
    if (gone()) return;
    try {
      if (posix) process.kill(-child.pid, "SIGKILL");
      else child.kill();
    } catch {
      try {
        child.kill("SIGKILL");
      } catch {} // gone meanwhile
    }
  };
  process.once("exit", kill);
  let said = "";
  const endpoint = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`it said nothing of its DevTools port in ${starting / 1000}s${lastWords(said)}`)), starting);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      said = `${said}${chunk}`.slice(-4000); // read to the end, so that the pipe never fills
      const found = /DevTools listening on (ws:\/\/\S+)/.exec(said);
      if (found) clearTimeout(timer), resolve(found[1]);
    });
    child.once("error", (error) => (clearTimeout(timer), reject(error)));
    child.once("exit", (code, signal) => (clearTimeout(timer), reject(new Error(`it stopped (${signal ?? `exit ${code}`}) before it opened its DevTools port${lastWords(said)}`))));
  });
  const stop = async () => {
    try {
      if (!gone()) await Promise.race([exited, sleep(5000)]);
      kill();
      if (!gone()) await Promise.race([exited, sleep(3000)]);
    } finally {
      process.off("exit", kill);
    }
  };
  let browser;
  try {
    // A browser that opened its port and then does not answer is no longer waited for after `starting` ms (puppeteer's own bound is three minutes a call).
    const browserWSEndpoint = await endpoint;
    let timer = 0;
    const silent = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`it opened its DevTools port and did not answer in ${starting / 1000}s`)), starting); });
    const connecting = puppeteer.connect({ browserWSEndpoint, defaultViewport: { width: 800, height: 600 } });
    connecting.catch(() => {});
    browser = await Promise.race([connecting, silent]).finally(() => clearTimeout(timer));
  } catch (error) {
    kill();
    await stop();
    throw error;
  }
  return {
    browser,
    stop: async () => {
      await Promise.race([browser.close().catch(() => {}), sleep(5000)]);
      await stop();
    },
  };
}

let browser = null; // a promise of it
let timer = 0;
let users = 0;

async function launch() {
  const executablePath = findBrowser();
  if (!executablePath) throw Object.assign(new Error("没有找到 Chrome 或 Edge：导出 PDF 需要电脑上装有其中一个浏览器"), { reason: "browser" });
  const { default: puppeteer } = await import("puppeteer-core");
  return puppeteer.launch({ executablePath, headless: true, args: ["--no-first-run", "--no-default-browser-check", "--disable-extensions", ...sandboxArguments()] });
}

/**
 * The shared browser closed now, when nothing uses it (a command that is done with it: left to the idle
 * wait, a gallery export of a PDF would run a minute longer, the timer and the browser keeping the process).
 */
export async function closeSharedBrowser() {
  if (users > 0) return;
  clearTimeout(timer);
  const closing = browser;
  browser = null;
  (await closing?.catch(() => null))?.close().catch(() => {});
}

// A page of the shared browser with `html` loaded and drawn, given to `use`; closed after.
function withPage(html, use) {
  return withSharedPage(async (page) => {
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: "light" }]);
    await page.setViewport({ width: 1200, height: 900 });
    await page.setContent(html, { waitUntil: "load", timeout: 60_000 });
    await settle(page, { changing: CHANGING });
  }, use);
}

/**
 * Whether an export on this machine makes its pictures' copies (encodePictures): true where a Chrome or Edge is
 * found, else why not, as gallery check's and gallery export's note on a heavy picture says it (render/picture-sizes.mjs
 * largePictureNotes: without one, a picture is weighed as the export will embed it, as it is).
 */
export function pictureCopies() {
  const found = findBrowser();
  return found && existsSync(found) ? true : "no Chrome or Edge on this machine makes the export's copy lighter: copy it in at the size the page needs";
}

/**
 * Copies of an export's pictures as src/shared/export-pictures.mjs makes them (encodePicture, its text run in a blank
 * page of the shared browser): for each of `pictures` ([{ bytes, type, ceiling, lossy, quality }]) a Buffer of a
 * WebP, null where none is made, or an Error where the browser could not make one of it (a picture it cannot
 * decode, one too large for its memory: each on its own, so that one such picture leaves the others' copies, as the
 * reader's 导出当前视图副本 tries each on its own) (render/export-pictures.mjs smallerPictures asks it, the command's
 * and the workbench's export). Three at once. No Chrome or Edge on the machine: an error, `reason` "browser".
 */
export async function encodePictures(pictures) {
  if (!findBrowser()) throw Object.assign(new Error("no Chrome or Edge on this machine"), { reason: "browser" });
  return withSharedPage(async (page) => {
    await page.goto("about:blank");
    await page.evaluate(`globalThis.encodePicture = ${encodePicture}`);
  }, async (page) => {
    const made = new Array(pictures.length).fill(null);
    let next = 0;
    const work = async () => {
      for (let at = next++; at < pictures.length; at = next++) {
        const { bytes, type, ceiling, lossy, quality } = pictures[at];
        try {
          const copy = await page.evaluate(async (url, options) => {
            const made = await globalThis.encodePicture(await (await fetch(url)).blob(), options);
            if (!made) return null;
            return new Promise((done) => {
              const reader = new FileReader();
              reader.onload = () => done(String(reader.result).split(",")[1] ?? null);
              reader.readAsDataURL(made);
            });
          }, `data:${type};base64,${bytes.toString("base64")}`, { ceiling: Number.isFinite(ceiling) ? ceiling : 1e9, lossy, quality });
          made[at] = copy ? Buffer.from(copy, "base64") : null;
        } catch (error) {
          made[at] = error instanceof Error ? error : new Error(String(error));
        }
      }
    };
    await Promise.all([work(), work(), work()]);
    return made;
  });
}

// A page of the shared browser, made ready by `open(page)`, given to `use`; closed after.
async function withSharedPage(open, use) {
  clearTimeout(timer);
  users += 1;
  browser ??= launch().catch((error) => {
    browser = null;
    throw error;
  });
  let page = null;
  try {
    page = await (await browser).newPage();
    await open(page);
    return await use(page);
  } finally {
    await page?.close().catch(() => {});
    users -= 1;
    if (users === 0) {
      timer = setTimeout(async () => {
        const closing = browser;
        browser = null;
        (await closing?.catch(() => null))?.close().catch(() => {});
      }, IDLE);
    }
  }
}

/**
 * Wait until the report `page` shows is drawn: its fonts in, the kit's first drawing done
 * (html[data-doc-drawn], on a page with the kit's runtime), then the page the same in three
 * looks 100ms apart (its height, the styles its scripts set, on elements or in stylesheets they
 * adopted, its drawings and pictures), so that what a Sheet or a disclosure just shown draws is in
 * too; never a wait of fixed length alone. Each wait ends after `timeout` ms at most, the last after
 * `changing` ms: what was not reached by then is returned (the PDF goes on with the page as it is;
 * gallery qa says so), [] when everything was. The PDF and the chart pictures give the last wait
 * 600ms (`CHANGING`): under reduced motion, which they ask for, the kit's tables can keep changing
 * their width, and the page is printed as it is then.
 */
export async function settle(page, { timeout = 15_000, changing = timeout } = {}) {
  const late = [];
  // A wait in the page, true when it got there; false (too late) or the error that ended it is said.
  const reached = (what, done, ms = timeout) => {
    if (done !== true) late.push(`${what} (${done === false ? `not in ${ms / 1000}s` : done})`);
  };
  const within = (wait, ms = timeout) => page.evaluate(wait, ms).catch((error) => error.message);
  reached("the fonts loaded", await within((ms) => Promise.race([
    Promise.resolve(document.fonts?.ready).then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), ms)),
  ])));
  reached("the kit's first drawing done (data-doc-drawn)", await within((ms) => new Promise((resolve) => {
    const started = Date.now();
    const check = () => {
      if (!globalThis.DocKit || document.documentElement.hasAttribute("data-doc-drawn")) {
        globalThis.DocCode?.colorAll?.(); // its code blocks colored too, which the kit does once the page is idle (code.js)
        resolve(true);
      }
      else if (Date.now() - started > ms) resolve(false);
      else setTimeout(check, 50);
    };
    check();
  })));
  reached("the page done changing", await within((ms) => new Promise((resolve) => {
    const look = () => [
      document.documentElement.scrollHeight,
      ...[...document.querySelectorAll("[style]")].map((element) => element.getAttribute("style")),
      // The stylesheets the page's scripts made and adopted, which no element shows: the kit lays its
      // flowcharts out in one (their rows, widths and arrows), worked out again as their width changes.
      ...[...(document.adoptedStyleSheets ?? [])].flatMap((sheet) => [...sheet.cssRules].map((rule) => rule.cssText)),
      ...[...document.querySelectorAll("svg, canvas")].map((drawing) => drawing.outerHTML.length),
      [...document.images].filter((image) => image.complete).length,
    ].join("|");
    const started = Date.now();
    let last = look();
    let same = 0;
    const check = () => {
      const now = look();
      same = now === last ? same + 1 : 0;
      last = now;
      if (same >= 3) resolve(true);
      else if (Date.now() - started > ms) resolve(false);
      else setTimeout(check, 100);
    };
    setTimeout(check, 100);
  }), changing), changing);
  return late;
}

// Everything of the page in sight, as a document read in full: in the light theme (paper is light,
// whatever the system says), each Sheet panel shown under its own tab (a copy of the tab row
// holding that tab alone, as the page shows the one selected: the same pill, not a heading), the
// tab row itself gone; each disclosure open; then drawn again.
async function showEverything(page) {
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-doc-theme", "light");
    for (const area of document.querySelectorAll("[data-doc-sheets]")) {
      const row = area.querySelector(":scope > .doc-sheet-tabs");
      if (!row) continue;
      for (const tab of row.querySelectorAll(":scope > .doc-sheet-tab")) {
        const key = tab.getAttribute("data-sheet-tab");
        const panel = [...area.querySelectorAll(":scope > [data-doc-sheet]")].find((each) => each.getAttribute("data-doc-sheet") === key);
        if (!panel) continue;
        panel.hidden = false;
        panel.removeAttribute("aria-hidden");
        panel.style.setProperty("display", "block", "important");
        const label = row.cloneNode(false);
        label.removeAttribute("id");
        label.removeAttribute("role");
        label.style.setProperty("break-after", "avoid");
        const pill = tab.cloneNode(true);
        pill.removeAttribute("id");
        pill.setAttribute("aria-selected", "true");
        pill.classList.add("is-active");
        label.append(pill);
        panel.before(label);
      }
      row.style.setProperty("display", "none", "important");
    }
    for (const details of document.querySelectorAll("details")) details.open = true;
    window.dispatchEvent(new Event("resize"));
  });
  await settle(page, { changing: CHANGING });
}

// Each paper's width in CSS pixels (96 to the inch: A4 210mm, A3 297mm, Letter and Legal 8.5in,
// Tabloid 11in), and the margin on either side of it (1 inch).
const PAPER_WIDTH = { A4: 793.7, A3: 1122.5, Letter: 816, Legal: 816, Tabloid: 1056 };
const MARGIN = 96;

// The page laid out as it will print before it is printed: the print media's rules on, and the window
// as wide as what the paper prints across at the scale asked for (`width`, CSS px), so that what the
// kit works out from the width it is drawn at (a flowchart's rows under 自动 and its turning arrows,
// a chart, a table's columns) is worked out at the width it prints at. Chrome lays the page out again
// for its sheets of paper without running the page's scripts, so without this they kept what they
// worked out for the 1200px window: a flowchart's rows of five, each card squeezed under the least
// width the kit gives one (116px) once printed 602px wide. (A flowchart now works its layout out again
// as the print media comes, which a browser's own print gives it too: runtime/flowchart.js; a chart
// and a table do not. Here the media is print already, so the flowchart's rows come from the width
// alone, and a flowchart that fits on a page is kept on one by the rule the kit writes for print.) A flowchart prints as a screen as wide as
// the paper shows it (the user's decision of 2026-10-25, printed as it is shown, with no print rule
// of its own; 自动 measured at the printed page's width); the window's scrollbar, when it has one, is
// added, so the page is that wide.
async function layOutForPrint(page, width) {
  await page.emulateMediaType("print");
  const bar = await page.evaluate(() => Math.max(0, innerWidth - document.documentElement.clientWidth));
  await page.setViewport({ width: Math.floor(width) + bar, height: 900 });
  await settle(page, { changing: CHANGING });
}

/** A PDF of report `html` (an offline file): `paper` one of PAPERS, `scale` 0.1–2; 1 inch margins. */
export function pdfOf(html, { paper = "A4", scale = 1 } = {}) {
  const format = PAPERS.includes(paper) ? paper : "A4";
  const factor = Math.min(2, Math.max(0.1, scale));
  return withPage(html, async (page) => {
    await showEverything(page);
    await layOutForPrint(page, (PAPER_WIDTH[format] - 2 * MARGIN) / factor);
    return Buffer.from(await page.pdf({
      format,
      scale: factor,
      printBackground: true,
      margin: { top: "1in", right: "1in", bottom: "1in", left: "1in" },
    }));
  });
}

/** Pictures (PNG) of the chart cards of report `html`, in their order (main figure.doc-figure); null for one that cannot be taken. */
export function chartPictures(html) {
  return withPage(html, async (page) => {
    await showEverything(page);
    const window = page.viewport();
    const cards = await page.$$("main figure.doc-figure");
    const pictures = [];
    for (const card of cards) {
      let taller = 0;
      try {
        // One that opens apart from the page's flow as that shows it: open, drawn at its width, and what
        // holds it open first, as a closed card leaves what it holds no box. Such a card has a height of
        // its own (the settings dialogs', at most the window's) and scrolls inside, so for the picture
        // it takes its content's height, no more than the window's, and the window grows by the
        // chart's height.
        taller = await card.evaluate(async (node, apart) => {
          const opened = [];
          for (let at = node.closest(apart); at; at = at.parentElement.closest(apart)) opened.unshift(at);
          for (const each of opened) {
            each.style.setProperty("height", "auto");
            each.style.setProperty("max-height", "calc(100dvh - (2 * var(--doc-dialog-margin)))");
            each.showModal();
          }
          await new Promise((drawn) => requestAnimationFrame(() => requestAnimationFrame(drawn)));
          return opened.length ? Math.ceil(node.getBoundingClientRect().height) : 0;
        }, APART);
        if (taller) {
          await page.setViewport({ ...window, height: window.height + taller });
          await settle(page, { changing: CHANGING });
        }
        await card.evaluate((node) => node.scrollIntoView({ block: "center" }));
        pictures.push(Buffer.from(await card.screenshot({ type: "png" })));
      } catch {
        pictures.push(null);
      }
      await card.evaluate((node, apart) => { // over the cards after it, were it left open
        for (let at = node.closest(apart); at; at = at.parentElement.closest(apart)) {
          at.close();
          at.style.removeProperty("height");
          at.style.removeProperty("max-height");
          if (!at.getAttribute("style")) at.removeAttribute("style");
        }
      }, APART).catch(() => {});
      if (taller) await page.setViewport(window).catch(() => {});
    }
    return pictures;
  });
}
