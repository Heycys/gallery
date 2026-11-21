import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { partsWritten, shownSource } from "../editor/source.mjs";
import { offlineReports } from "../render/pipeline.mjs";
import { parseReport } from "../render/report-tree.mjs";
import { SETTINGS_PART, packagePath, readCatalog } from "../shared/component-catalog.mjs";
import { instancesOf, isInstance } from "../shared/components/index.mjs";
import { ATTRIBUTE, FALLBACK, INSTANCE, SLOT, SLOT_PART } from "../shared/components/installed.mjs";
import { jsonIn } from "../shared/json-layout.mjs";
import { QUERY_ROUTE } from "../shared/workspace-query.mjs";
import { workspaceKey } from "../shared/workspace-registry.mjs";
import { documentDirectory, documentFiles, layoutOf, listDocumentSlugs, PACKAGE_MANIFEST } from "../shared/workspace.mjs";
import { closed, findBrowser, keepViolations, lookingArguments, ownMessage, settle, startBrowser } from "../transfer/browser.mjs";
import { shown } from "./report-start.mjs";

// The fifth thing gallery block check does (./component-check.mjs): a package run as a reader's
// file runs it. Its example and its template stand in a temporary document, in a workspace of their
// own holding a copy of all that reaches a page of the package, so that nothing of the user's is
// touched, and that document's export, made as the workbench's export makes it, opens in the browser
// gallery qa uses, under the export's Content-Security-Policy. What it says:
//   - what the console and the policy said, a line of kit.js where the error names one: the copy says
//     it is kit.js (sourceURL), and an export keeps a package's lines;
//   - a dialog or a window the page opened, each closed as it comes, as it would stop the look too, and
//     a page that loads itself again;
//   - a component that did not start;
//   - that dehydrate leaves the instance as the file has it, that a mount on that gives the same DOM,
//     and that putting back a copy of what the page shows does too, as an undo does, the kit taking off
//     what `runtime` and `dehydrate` name first: what piles up on each put-back, in the instance or
//     anywhere else on the page, named with how many there were;
//   - a text part the component redrew: as the page shows it, as a mount touches it, or as a change of
//     its words, what the editor makes, is not left to stand;
//   - a data part a mount changed, which a page would take for something to write;
//   - the way back to the file, by the component's `example` (DocKit.example), a small edit as a reader's
//     gesture would make it, the page standing in for the editor: it edits a data part and nothing else,
//     the server's own `rewrite` takes what it wrote (`partsWritten`), and with the part put back, as an
//     undo does, the instance shows what it showed. What it wrote is told, each part with the lines it
//     changed of it, and a write that lays a part out anew is a note (laidAnew). A package with a script
//     and a data part that offers no example has a note: nothing has tried that way; none where its one
//     data part is its settings (SETTINGS_PART), which the board's form writes and the block only reads;
//   - a list of an instance a card is dropped on that listens for dragover and not for dragenter, once the
//     instance has heard it can write (dropsRefused), a note at the line of kit.js that listens: a
//     dragenter listener of the document's or the window's counts where it cancels one fired at the list;
//   - a write with no gesture once the page takes edits: as the instance hears it can, as it mounts
//     then, or as it hears what its example wrote, what a page would write each time it opened;
//   - a page wider than the window, at any of the three widths, which gallery qa fails;
//   - pictures at 360, 736 and 1024px wide, light and dark, of the page, in a folder of its own under
//     <workspace>/.gallery/qa/components/, which each run empties. Taken before the put-backs change
//     anything, of the example then the template, each under its file's name (lookedAtMarkup); and the
//     three of each theme side by side in one (sideBySide), the overviews said first; and the page as
//     the editing page draws it, context.canEdit() true, at 1024 and 360px, light (EDITED), said when
//     they are the export's pictures at their width, the block drawing nothing more where it can edit.
// With --documents (lookAtDocuments), each instance of the package the workspace's documents hold goes
// through the same look as the example, a document at a time: its instances, those in another's slot
// too, each under a line naming where it stands, in a temporary document holding a copy of the
// document's assets/ and of the packages they use, exported and run as above, each finding at its line
// of the document's file, the pictures in documents/<slug>/ beside the example's. No document is written.
// What holds no still DOM (an animation) cannot be compared, and is a note. A browser that is not
// there, does not start or goes while it looks, and a folder that cannot be written, are `unverified`:
// nothing is said of the package, and the rest of the check stands. Whatever else stops the look is a
// problem of its own: the check ends with its verdict.

/** What gallery block check calls this section. */
export const BROWSER_SECTION = "in a browser, under the export's policy";
/** What gallery block check --documents calls its sections, of the document at `place` (<slug>/doc.html), or of none. */
export const documentsSection = (place = null) => (place ? `the instances in ${place}, in a browser under the export's policy` : "the workspace's documents");

const SLUG = "component-check";
const WIDTHS = [360, 736, 1024];
const THEMES = ["light", "dark"];
// The widths the page is pictured at as the editing page draws it, light: what a reader edits with.
const EDITED = [1024, 360];
// How long the page may take to be drawn, each wait for it, and to open: a script that never ends keeps
// the load from coming, and nothing shorter than this says so.
const TIMEOUT = 10_000;
export const LOADING = 60_000;
// How long the browser may take to answer anything else, and to say what it heard last.
export const ANSWER = 30_000;
// The longest one look of a page may take, all its steps together (gallery page check: a width and a
// theme): each step is bounded as it is asked (answered), and this bounds what no step does, a call that
// is never answered however it is asked (testing the skill with Agents, 2026-11-09: a page check that waited 15 minutes).
export const LOOKING = 120_000;
const HEARING = 2000;
// How long what an instance shows may take to hold still after a mount, and how often it is looked at.
export const STILL = 3000;
export const STEP = 60;
// How long a page the server shows is waited for to have its reads of the workspace answered (a card whose
// block needs "workspace", workspace.query): the first answer of a server that has not read the workspace's
// documents yet takes seconds, a page that holds still meanwhile has not drawn what it reads (watchQueries).
export const QUERIES = 15_000;
// How many times a copy of what the page shows is put back: three counts tell a pile from a difference.
const PUT_BACKS = 2;
// How many text parts of an instance have their words changed, one of each name first: of a long list a
// few say what all would. Each costs two waits for what it shows, and half of ANSWER is all they get.
const TYPED = 8;
const TYPING = ANSWER / 2;
// What the policy says it blocked when that was code made from words.
const MADE_FROM_WORDS = /^(?:wasm-)?eval$/;
// What puppeteer rejects a question with when no one is left to answer it.
const GONE = new Set(["TargetCloseError", "ConnectionClosedError"]);

/**
 * What a tab that shows a page of the workspace's server is given before the page's own scripts run: its
 * reads of the workspace (a fetch of QUERY_ROUTE, which is how context.workspace.query asks) counted while
 * they wait for an answer, in globalThis.__galleryQueries.pending (id -> { kind, block, at }: `block` the
 * custom block whose kit.js asked, read from the stack, or null), for drawn to wait for and for a look to
 * say of a card its picture shows before it had its answer. Nothing else of fetch changes.
 */
export const watchQueries = (tab) => tab.evaluateOnNewDocument(watching, QUERY_ROUTE);
export function watching(route) {
  const original = globalThis.fetch;
  if (typeof original !== "function" || globalThis.__galleryQueries) return;
  const watch = { pending: new Map(), count: 0 };
  globalThis.__galleryQueries = watch;
  globalThis.fetch = function (input, init) {
    const answer = original.apply(this, arguments);
    try {
      const url = new URL(typeof input === "string" ? input : input?.url ?? String(input), location.href);
      if (url.pathname === route) {
        const id = ++watch.count;
        const asker = /\/__gallery\/components\/([a-z0-9-]+\/[a-z0-9-]+)\/kit\.js/.exec(new Error().stack ?? "");
        watch.pending.set(id, { kind: url.searchParams.get("kind"), block: asker ? asker[1] : null, at: Date.now() });
        const done = () => { watch.pending.delete(id); };
        Promise.resolve(answer).then(done, done);
      }
    } catch {}
    return answer;
  };
}

/** The first line of what an error says. */
export const firstLine = (error) => String(error?.message ?? error).split("\n")[0];

/**
 * The page a package's `markup` is checked in, with no line of its own before it: a problem's line in
 * the page is that line of the file.
 */
export const pageOfMarkup = (slug, markup) => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${slug}</title></head><body><main class="doc-page" data-doc-id="${slug}">${markup}\n</main></body></html>\n`;

/**
 * What the page a package is looked at in holds: `example` then `template`, each under its file's
 * name and a line between them, so that its pictures say which is which. Each name stands on the first
 * line of its file's markup: a line of the page is still that line of the file.
 */
export const lookedAtMarkup = ({ example, template }) => `<p>example.html</p>${example}\n<hr><p>template.html</p>${template}`;

// Whether a parsed node stands in an instance.
const inInstance = (node) => {
  for (let around = node.parentNode; around; around = around.parentNode) if (isInstance(around)) return true;
  return false;
};

/**
 * The instances of package `found` the parsed page `tree` holds that stand in no instance, in its
 * order: those a look puts back one by one (putBack's `hosts`), numbered as the page numbers them, so
 * that what is said of the one numbered `at` (instancesIn, wayBackSaid) is said of the same one.
 */
export const outerInstances = (tree, found) => instancesOf(tree, found).filter((node) => !inInstance(node));

// The instances of package `found` a page holds that stand in no instance (outerInstances): { line, markup }.
const instancesIn = (html, found) => outerInstances(parseReport(html), found).map(({ sourceCodeLocation: { startLine, startOffset, endOffset } }) => ({ line: startLine, markup: html.slice(startOffset, endOffset) }));

// What of a package reaches a page, each file written anew under `temp`'s components/: a file's flags
// and a link stay behind, so that a package no one can write to is checked as any, and its copy of
// kit.js, which says it is kit.js, is the copy's alone.
export async function copyPackage(found, temp) {
  const copy = path.join(temp, "components", ...found.id.split("/"));
  for (const name of [PACKAGE_MANIFEST, "template.html", ...found.files]) {
    const file = packagePath(found, name);
    if (!file) continue;
    const bytes = await fsp.readFile(file);
    await fsp.mkdir(path.dirname(path.join(copy, name)), { recursive: true });
    await fsp.writeFile(path.join(copy, name), name === "kit.js" ? `${bytes}\n//# sourceURL=kit.js\n` : bytes);
  }
}

/**
 * The export of a temporary document holding `example` then `template` of package `found` (lookedAtMarkup): { html,
 * file, places } in the folder `temp`, `places` saying where each of its instances stands in the two
 * files ({ file, line }). Throws the export's own failure when it refuses the document.
 */
async function exported(found, { example, template }, temp) {
  await copyPackage(found, temp);
  const document = path.join(temp, SLUG);
  await fsp.mkdir(document);
  const before = `${example}\n`;
  const source = shownSource(pageOfMarkup(SLUG, lookedAtMarkup({ example, template }))).text;
  await fsp.writeFile(path.join(document, "doc.html"), source);
  await fsp.writeFile(path.join(document, "doc.json"), JSON.stringify({ title: SLUG, description: SLUG, type: "component" }));
  const render = await offlineReports({ directory: temp, catalog: readCatalog(temp) });
  const html = await render(SLUG);
  const file = path.join(temp, "export.html");
  await fsp.writeFile(file, html);
  const lines = before.split("\n").length - 1;
  const places = instancesIn(source, found).map(({ line }) => (line > lines ? { file: "template.html", line: line - lines } : { file: "example.html", line }));
  return { html, file, places, source };
}

// In the page, as the export draws it (nothing writes: context.canEdit() is false, the page not yet told
// that it takes edits, which the way back of the first instance does for all): of each instance with a data
// part of its own (not the settings the board writes), the controls of its own markup still shown and
// enabled, [{ at, what, counts: [how many] }]. One a reader presses to no effect says the block can be
// edited where it cannot, and a style's display over the hidden attribute is the usual cause; a field a
// reader only looks through (a filter) is one too, and the note says so.
function controlsShown({ match, instance, slot, parts, boards }) {
  if (!Object.entries(parts).some(([name, { edit }]) => edit === "data" && !boards.includes(name))) return [];
  const hosts = [...document.querySelectorAll(match)].filter((node) => !node.parentElement.closest(instance));
  const edge = (node) => node.parentElement?.closest(`${instance}, ${slot}`) ?? null;
  const named = (node) => `<${node.localName}${node.classList.length ? ` class="${node.getAttribute("class")}"` : ""}>`;
  const saying = (node) => {
    const words = (node.textContent || node.getAttribute("aria-label") || node.getAttribute("placeholder") || node.getAttribute("title") || "").replace(/\s+/g, " ").trim().slice(0, 24);
    return `${named(node)}${words ? ` "${words}"` : ""}`;
  };
  return hosts.flatMap((host, at) => {
    const live = [...host.querySelectorAll("button, input, select, textarea")].filter((node) => edge(node) === host).filter((node) => {
      if (node.disabled || node.readOnly || node.type === "hidden") return false;
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    });
    return live.length ? [{ at, what: live.slice(0, 3).map(saying).join(", "), counts: [live.length] }] : [];
  });
}

// In the page: what the instance numbered `at` of those `match` finds does as it is taken off and put
// back, `source` its markup as the export has it, [{ kind, … }]. An instance stands where it stood after.
async function putBack({ match, instance, slotPart: slot, slotName, fallback, parts, boards, at, source, still, step, times, typed: most, typing: budget }) {
  const hosts = () => [...document.querySelectorAll(match)].filter((node) => !node.parentElement.closest(instance));
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const frame = () => new Promise((resolve) => {
    requestAnimationFrame(resolve);
    setTimeout(resolve, 100); // a page that draws no frames is not waited for
  });
  // What an instance shows once it holds still, or null.
  const drawn = async (host) => {
    await frame();
    await frame();
    let last = host.outerHTML;
    for (let same = 0, end = Date.now() + still; same < 3;) {
      if (Date.now() > end) return null;
      await wait(step);
      const now = host.outerHTML;
      same = now === last ? same + 1 : 0;
      last = now;
    }
    return last;
  };
  const parse = (html) => {
    const box = document.createElement("template");
    box.innerHTML = html;
    return box.content.firstElementChild;
  };
  const named = (node) => `<${node.localName}${node.classList.length ? ` class="${node.getAttribute("class")}"` : ""}>`;
  const shown = (node) => (node.nodeType === 1 ? named(node) : `the words "${node.data.trim().slice(0, 40)}"`);
  const held = (node) => [...node.childNodes].filter((child) => child.nodeType === 1 || (child.nodeType === 3 && child.data.trim()));
  // An attribute as it counts: a style or a class with nothing left in it, as taking off its last leaves one, is none.
  const written = (node, name) => (["style", "class"].includes(name) && !node.getAttribute(name)?.trim() ? null : node.getAttribute(name));
  // The first thing that tells two elements apart, or null: blank text counts for nothing.
  const difference = (a, b) => {
    for (const name of new Set([...a.getAttributeNames(), ...b.getAttributeNames()])) {
      if (written(a, name) !== written(b, name)) return `${name} on ${named(b)}, ${JSON.stringify(written(a, name))} then ${JSON.stringify(written(b, name))}`;
    }
    const [ours, theirs] = [held(a), held(b)];
    for (let index = 0; index < Math.max(ours.length, theirs.length); index++) {
      const [x, y] = [ours[index], theirs[index]];
      if (!x || !y) return `${named(b)} ${x ? `without ${shown(x)}` : `with ${shown(y)} more`}`;
      if (x.nodeType !== y.nodeType || x.localName !== y.localName || (x.nodeType === 3 && x.data.trim() !== y.data.trim())) return `in ${named(b)}, ${shown(x)} then ${shown(y)}`;
      const inner = x.nodeType === 1 ? difference(x, y) : null;
      if (inner) return inner;
    }
    return null;
  };
  // How many of each kind of element there are of `nodes`: <tag class> -> count.
  const census = (nodes) => {
    const counts = new Map();
    for (const node of nodes) counts.set(named(node), (counts.get(named(node)) ?? 0) + 1);
    return counts;
  };
  // What stands outside the instances, on the page and in its head.
  const around = () => [...document.querySelectorAll("*")].filter((node) => !node.closest(instance));
  // The kinds of element there are more of at each count, of counts enough to tell.
  const piling = (counts) => [...counts.at(-1).keys()].filter((name) => counts.length > 2 && counts.every((count, index) => index === 0 || (count.get(name) ?? 0) > (counts[index - 1].get(name) ?? 0)));
  // The nearest edge of a region around a node, an instance or a slot (installed.mjs), and the slots of
  // an instance's own markup: what they hold is the document's, the kit's to draw, no component's.
  const edge = (node) => node.parentElement?.closest(`${instance}, ${slot}`) ?? null;
  const slotsOf = (host) => [...host.querySelectorAll(slot)].filter((each) => edge(each) === host);
  // A copy of an instance with its slots emptied: what each comparison of what a component draws goes by.
  const bare = (node) => {
    const copy = node.cloneNode(true);
    slotsOf(copy).forEach((each) => each.replaceChildren());
    return copy;
  };
  // Each slot of an instance as the page shows it: its name, where it stands (the tags between it and the
  // instance), the blocks it holds as an export of the view keeps them (their tags, what the kit draws
  // taken off) and its markup, as dehydrate leaves it too: a chart the kit draws in a slot (a chart card
  // of the document's) is drawn anew as the page lays it out, and is no component's writing.
  const slotsSeen = (host) => slotsOf(host).map((each) => {
    const around = [];
    for (let at = each.parentElement; at && at !== host; at = at.parentElement) around.unshift(named(at));
    return { name: each.getAttribute(slotName), place: around.join(" > "), blocks: [...DocKit.dehydrate(each.cloneNode(true)).children].map((child) => child.localName).join(" "), html: DocKit.dehydrate(each.cloneNode(true)).outerHTML };
  });
  // What became of the slots `before` (slotsSeen) in `now`, by a component `when`: [{ kind: "written-in", part, how }].
  const slotsKept = (before, now, when, { markup = true } = {}) => before.flatMap(({ name, place, blocks, html }) => {
    const after = now.find((each) => each.name === name);
    const how = !after ? `took the slot ${name} off the instance`
      : after.place !== place ? `moved the slot ${name} (${after.place ? `in ${after.place}` : "straight in the instance"}, where the file has it ${place ? `in ${place}` : "straight in the instance"})`
        : after.blocks !== blocks ? `changed the blocks the slot ${name} holds (${blocks || "none"}, then ${after.blocks || "none"})`
          : markup && after.html !== html ? `changed what the slot ${name} holds` : null;
    return how ? [{ kind: "written-in", part: name, how: `${how}, ${when}` }] : [];
  });
  // A part of the instance's own markup, none a slot or an instance in it holds.
  const own = (host) => (node) => edge(node) === host;
  const partsOf = (host, edited = () => true) => Object.entries(parts).filter(([, { edit }]) => edited(edit)).flatMap(([name, part]) => [...host.querySelectorAll(part.at)].filter(own(host)).map((node) => ({ name, node })));
  const textParts = (host) => partsOf(host, (edit) => edit === "text");
  // The elements a component writes: of each part edited as data the first, as `context.part` finds it.
  const dataParts = (host) => Object.entries(parts).filter(([, { edit }]) => edit === "data").map(([name, part]) => ({ name, node: [...host.querySelectorAll(part.at)].find(own(host)) })).filter(({ node }) => node);

  const findings = [];
  const host = hosts()[at];
  if (!host) return [{ kind: "gone" }];
  if (host.hasAttribute(fallback)) return [{ kind: "fallback" }];
  const first = await drawn(host);
  if (first === null) return [{ kind: "moving" }];
  // The slots stand where the file has them and hold its blocks; from here on, as the page first showed them.
  const file = parse(source);
  const slotsFirst = slotsSeen(host);
  findings.push(...slotsKept(slotsSeen(file), slotsFirst, "as it mounts", { markup: false }));


  // As the page shows them, the text parts are what the file says.
  const inFile = textParts(file);
  textParts(host).forEach(({ name, node }, index) => {
    if (inFile[index] && inFile[index].node.innerHTML !== node.innerHTML) findings.push({ kind: "redrawn", part: name, how: `the file says ${JSON.stringify(inFile[index].node.textContent.trim())}, the page ${JSON.stringify(node.textContent.trim())}` });
  });

  // What dehydrate leaves of the component's own region is the file's (a slot's blocks are the kit's to draw).
  const copy = DocKit.dehydrate(host.cloneNode(true));
  const [fileBare, copyBare] = [bare(file), bare(copy)];
  const left = difference(fileBare, copyBare);
  if (left) {
    const held = partsOf(copyBare);
    const part = partsOf(fileBare).find(({ node }, index) => held[index] && difference(node, held[index].node))?.name;
    findings.push({ kind: "left", what: left, ...(part ? { part } : {}) });
  }
  // Mounted and left alone, what a page compares a data part with is what the file holds, to the byte.
  const unwritten = dataParts(copy);
  for (const [index, { name, node }] of dataParts(file).entries()) if (!left && unwritten[index]?.node.innerHTML !== node.innerHTML) findings.push({ kind: "data", part: name });

  // A mount on what dehydrate left, then copies of what the page shows put back; a mount that touches
  // a text part is seen as it does it, by what the page holds of it at that moment.
  const records = [];
  const watcher = new MutationObserver((list) => records.push(...list));
  watcher.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  const touched = new Set();
  const look = (before) => {
    records.push(...watcher.takeRecords());
    for (const { name, node } of before) {
      if (!node.isConnected || records.some(({ target }) => node.contains(target))) touched.add(name);
    }
    records.length = 0;
  };
  const shows = [first];
  const beside = [census(around())];
  const counted = (html) => {
    shows.push(html);
    beside.push(census(around()));
    findings.push(...slotsKept(slotsFirst, slotsSeen(current), "as it mounts again"));
  };
  let current = copy;
  let parted = textParts(current);
  records.length = 0;
  host.replaceWith(current);
  let moved = await drawn(current);
  look(parted);
  if (moved !== null) {
    counted(moved);
    for (let time = 0; time < times && moved !== null; time++) {
      const again = current.cloneNode(true);
      parted = textParts(again);
      records.length = 0;
      current.replaceWith(again);
      current = again;
      moved = await drawn(current);
      look(parted);
      if (moved !== null) counted(moved);
    }
  }
  watcher.disconnect();
  if (moved === null) findings.push({ kind: "moving" });
  for (const part of touched) findings.push({ kind: "redrawn", part, how: "a mount changes it" });

  // What piles up from one mount to the next: the kinds of element there are more of each time.
  const counts = shows.map((html) => census(bare(parse(html)).querySelectorAll("*")));
  const piles = piling(counts);
  // What piles up inside another of what piles up comes with it: said once, of the outermost (`held`
  // the kinds that come with it), so that one node the runtime does not name is one problem.
  const last = bare(parse(shows.at(-1)));
  const inPile = (node) => {
    for (let up = node.parentElement; up && up !== last; up = up.parentElement) if (piles.includes(named(up))) return true;
    return false;
  };
  const outermost = piles.filter((name) => ![...last.querySelectorAll("*")].filter((node) => named(node) === name).every(inPile));
  for (const name of outermost) findings.push({ kind: "piles", what: name, counts: counts.map((count) => count.get(name) ?? 0), held: piles.length - outermost.length });
  for (const name of piling(beside)) findings.push({ kind: "piles", what: name, outside: true, counts: beside.map((count) => count.get(name) ?? 0) });
  if (!piles.length) {
    const changed = shows.slice(1).map((html) => difference(bare(parse(first)), bare(parse(html)))).find(Boolean);
    if (changed) findings.push({ kind: "changed", what: changed });
  }

  // A change of each text part's words, what the editor makes: it stands, in the same element, and
  // every text part stays as it is.
  const typing = moved === null ? [] : textParts(current).filter(({ node }) => node.textContent.trim());
  const sample = [...new Set([...new Map(typing.map((each) => [each.name, each])).values(), ...typing])].slice(0, most);
  const end = Date.now() + budget;
  for (const { node: typed } of sample) {
    if (Date.now() > end) break;
    const words = document.createTreeWalker(typed, NodeFilter.SHOW_TEXT).nextNode();
    const before = words.data;
    words.data = `${before}…`;
    const meant = typing.map(({ node }) => node.textContent);
    await drawn(current);
    const undone = typing.find(({ node }, index) => !node.isConnected || node.textContent !== meant[index]);
    if (undone) {
      findings.push({ kind: "redrawn", part: undone.name, how: "a change of its words does not stand" });
      break;
    }
    words.data = before;
    await drawn(current);
  }
  if (moved !== null && dataParts(current).length > 0) findings.push(...await wayBack());
  return findings;

  // The way back to the file, the page taking the edit as the page's editor does (installed/page.mjs
  // write: what the server cannot see, the part's own tag and a change made to the part on the page,
  // it refuses too), and writing no file. Once the page has said it takes edits the instance is told
  // so, then mounted again, as a page opening on it or an undo putting it back mounts it, and only then
  // makes its example: a write that comes at any moment but in its example is one with no gesture,
  // which a page would make each time it opened, and it is refused, a change of nothing taken as the
  // editor takes one. `when` says what the component was doing.
  async function wayBack() {
    const taken = [];
    let refused = null;
    let asked = false; // its example runs
    let when = "as it hears that it can write (the editable signal)";
    const unasked = [];
    const stand = (event) => {
      if (event.target !== current) return; // another instance's, told it can write as this one is: its own look sees it
      const { parts, run } = event.detail;
      const before = parts.map(({ part }) => part.innerHTML);
      const drafts = parts.map(({ part }) => part.cloneNode(true));
      const ran = run(Object.fromEntries(parts.map(({ name }, index) => [name, drafts[index]])));
      const live = parts.find(({ part }, index) => part.innerHTML !== before[index]);
      const own = parts.find(({ part }, index) => drafts[index].cloneNode(false).outerHTML !== part.cloneNode(false).outerHTML);
      if (live) parts.forEach(({ part }, index) => { part.innerHTML = before[index]; });
      if (!asked) {
        const writes = live ?? own ?? parts.find((_, index) => drafts[index].innerHTML !== before[index]);
        if (writes && !unasked.some((write) => write.when === when)) unasked.push({ kind: "unasked", part: writes.name, when });
        else if (ran && !writes) event.preventDefault();
        return;
      }
      if (live) refused ??= `it writes the part ${live.name} on the page, not the draft context.edit hands it, so the editor refuses the edit`;
      else if (ran && own) refused ??= `it changes the part ${own.name}'s own tag or attributes, which are the file's: a change writes what a part holds, so the editor refuses the edit`;
      if (live || !ran || own) return;
      parts.forEach(({ part }, index) => {
        taken.push({ part, before: before[index] });
        part.replaceChildren(...drafts[index].childNodes);
      });
      event.preventDefault();
    };
    document.addEventListener("doc-component-edit", stand);
    try {
      return [...await written(), ...unasked];
    } finally {
      document.removeEventListener("doc-component-edit", stand);
    }

    async function written() {
      dispatchEvent(new Event("doc-editable"));
      await drawn(current);
      when = "as it mounts";
      const opened = current.cloneNode(true);
      current.replaceWith(opened);
      current = opened;
      const shows = await drawn(current);
      when = "as it hears its part changed (the source signal)";
      const slotsBefore = slotsSeen(current);
      const before = DocKit.dehydrate(current.cloneNode(true));
      const said = [];
      asked = true;
      try {
        // A part the board writes and the block only reads (its settings, the card's form) is no way back of the block's own: no example asked for it.
        if (!DocKit.example(current)) return dataParts(current).every(({ name }) => boards.includes(name)) ? [] : [{ kind: "no-example" }];
      } catch (error) {
        return [{ kind: "example", what: `it throws: ${error?.message ?? error}` }];
      } finally {
        asked = false;
      }
      const now = await drawn(current);
      const after = DocKit.dehydrate(current.cloneNode(true));
      const parted = Object.fromEntries(dataParts(after).map(({ name, node }, index) => [name, node.innerHTML, dataParts(before)[index]?.node.innerHTML]).filter(([, html, was]) => html !== was));
      if (refused) said.push({ kind: "example", what: refused });
      else if (taken.length === 0) said.push({ kind: "example", what: "context.edit was not taken: it was not called, or it answered false, and the console says why" });
      else if (Object.keys(parted).length === 0) said.push({ kind: "example", what: "it changes nothing a part holds" }); // CHANGES_NOTHING: this runs in the page, which holds no constant of the module
      else said.push({ kind: "wrote", parts: parted });
      for (const root of [before, after]) for (const { node } of dataParts(root)) node.textContent = "";
      const elsewhere = difference(bare(before), bare(after));
      if (elsewhere) said.push({ kind: "example", what: `it changes what is no data part: ${elsewhere}` });
      said.push(...slotsKept(slotsBefore, slotsSeen(current), "as its example makes its edit"));
      for (const { part, before: held } of taken.reverse()) part.innerHTML = held;
      const back = await drawn(current);
      const stale = shows !== null && back !== null ? difference(bare(parse(shows)), bare(parse(back))) : null;
      if (now === null || back === null) said.push({ kind: "moving" });
      else if (stale && !elsewhere) said.push({ kind: "undo", what: stale });
      return said;
    }
  }
}

/** The parts a write changed, each with the lines it took out and put in of those it had (linesChanged): "tasks (-1 +1 of its 7 lines)". */
export const partsSaid = (parts) => parts.map(({ name, removed, added, lines }) => `${name} (-${removed} +${added} of its ${lines} line${lines === 1 ? "" : "s"})`).join(" and ");

/** What is said of a write that lays a part out anew (laidAnew), after its part and how. */
export const LAID_ANEW = "a write changes the lines it means and no others: a row moved by context.rows, which takes the blank before it along, JSON written back by context.editJSON and laid out in template.html and example.html as it writes it (block-script.md, Two examples)";

/**
 * Whether a write of a part of JSON that lays it out anew is context.editJSON's (the kit's one copy of
 * the layout, json-layout.mjs jsonIn: what it would write of the value written, over what the part held),
 * so that what the file held is what is laid out otherwise; false for a write of a layout of its own, or
 * no JSON.
 */
export function editJSONWrote(before, after) {
  try {
    JSON.parse(before);
    return jsonIn(before, JSON.parse(after)) === after;
  } catch {
    return false;
  }
}

// What the page says of an example that changes no data part (putBack writes it out: it runs in the page).
const CHANGES_NOTHING = "it changes nothing a part holds";

// What is said of what the page answered of an instance standing at `place`: a problem, a note, or what
// is told of it (`told`: its way back, neither).
function findingSaid({ kind, what, part, how, when, counts, outside, parts, back, line, json, held = 0 }, place, { script }) {
  const problem = (words) => ({ ...place, what: words });
  const note = (words) => ({ ...place, what: words, note: true });
  switch (kind) {
    case "wrote": return { ...place, told: true, what: `its example wrote ${partsSaid(parts)}; the server took it${back ? "; put back as an undo does, it shows what it showed" : ""}` };
    case "laid": return note(`its example's write lays the part ${part} out anew (${how}): ${LAID_ANEW}${json ? `; this write is context.editJSON's, and what the file held is laid out otherwise: lay ${part} out as it writes it` : ""}`);
    case "drops": return { ...note(`${what} listens for dragover and not for dragenter: a drop goes where both are cancelled, and the move that enters it asks dragenter alone, so that a release then (on a card's words, its padding) drops nothing: cancel dragenter as dragover is cancelled (preventDefault)`), file: "kit.js", line };
    case "controls": return { ...note(`where nothing is written (this look is an export: context.canEdit() is false) the instance of ${place.file}${place.line ? `:${place.line}` : ""} still shows ${what}${counts[0] > 3 ? ` and ${counts[0] - 3} more` : ""}, enabled, and the block has a data part: a reader presses a control that writes to no effect, and the export says the block can be edited. Draw a control that writes only while context.canEdit(), and hide it by the hidden attribute (the kit holds [hidden] over any display the style gives it) or disable it; ignore this for a control that only changes what a reader looks at, a filter or a tab, which an export keeps. Compare 1024-light.png with edit-1024-light.png: the second is what a reader who can edit sees`), file: "kit.js", line: undefined };
    case "gone": return problem("the page does not hold this instance");
    case "fallback": return problem(script ? "its component failed or never started: the instance shows what it holds, read-only" : "the instance shows as one of no custom block");
    case "moving": return note("what it shows never holds still (an animation?), so its mounts could not be compared");
    case "redrawn": return problem(`the component redraws its text part ${part}: ${how}. A text part is the file's, what the user types in: read it, and draw in what is the component's`);
    case "left": return problem(`dehydrate does not leave it as the file has it, so a copy of the view would hold what the kit made of it: ${what}. ${part ? `That stands in its part ${part}, which is the file's: read a part, and draw in what is the component's` : "Name what it draws in the manifest's runtime, or take it off in dehydrate"}`);
    case "data": return problem(`a mount changes its data part ${part}, so that a page would write what the component left there, with nothing edited: read a data part, and change it by context.edit alone`);
    case "no-example": return note("it has a data part and its component offers no example of an edit, so nothing has tried the way back to the file: give DocKit.component an example(host, context) that makes a small context.edit");
    case "example": return what === CHANGES_NOTHING ? { ...place, file: "kit.js", line: undefined, what: `its example(host, context) changes nothing a part holds on the instance of ${place.file}${place.line ? `:${place.line}` : ""}: the check runs it on every instance of example.html and of template.html, and template.html's is empty, with nothing to change a value of (the first entry of a list it does not hold yet). Make example() make a change that works on an empty instance too (add an entry, set a field), and have it call the function a reader's control calls, so that it tries the code a reader runs` } : problem(`its example: ${what}`);
    case "refused": return problem("what its example wrote cannot go in the file: a script, a handler, an address of code, data-block-id or data-ge-*, what does not read back as itself, or what is no JSON in a script of data");
    case "undo": return problem(`with what its example wrote put back, as an undo does, it does not show what it showed: ${what}: draw from the part, and on the source signal`);
    case "unasked": return problem(`it writes its data part ${part} with no reader's gesture, ${when}, once the page takes edits: a page would write it each time it opened. Call context.edit on a gesture alone, a press, a drop or a key, and draw what the part holds as it is`);
    case "written-in": return problem(`kit.js ${how}: a slot is the document's, its blocks the reader's: read it with context.part, never write in it or move it, and draw outside it`);
    case "piles": return problem(outside ?`${what} piles up outside the instance on each put-back (${counts.join(", then ")} of them), so an undo adds another: a component draws in its instance, and what it has to put elsewhere it takes away again in destroy` : `${what} piles up on each put-back (${counts.join(", then ")} of them${held ? ", with what it holds" : ""}): it is declared in neither the manifest's runtime nor dehydrate, so an undo adds another. ${generatedSaid(what)}`);
    default: return problem(`a mount does not give the same DOM again: ${what}`);
  }
}

// How to name what a script draws in the manifest (`what`: an element as named() says it, <div class="a b">).
const generatedSaid = (what) => {
  const kind = /class="([^"\s]+)/.exec(what)?.[1];
  return kind ? `Name it in component.json: "runtime": { "generated": [".${kind}"] } (beside what generated already names), or take it off in dehydrate` : "Give it a class and name that in component.json's \"runtime\": { \"generated\": [\".<class>\"] }, or take it off in dehydrate";
};

// One line for one fault: the same kind of finding, of the same part, at the same moment or line of
// kit.js, in another instance says nothing more.
const once = (answers) => [...new Map(answers.toReversed().map((answer) => [`${answer.finding.kind}|${answer.finding.part ?? ""}|${["piles", "example"].includes(answer.finding.kind) ? answer.finding.what : ""}|${answer.finding.when ?? ""}|${answer.finding.line ?? ""}`, answer])).values()].toReversed();

// How many cells a diff of a part's lines may take, past which what lies between the first and the
// last line that differ is taken as one run.
const DIFF_CELLS = 4_000_000;

/**
 * The runs of lines that tell `before` from `after`, as a diff shows them: [{ removed, added }], each
 * the lines of a run between lines the two share (`same` says which do), by a longest common
 * subsequence of what lies between the first and the last line that differ.
 */
function changedRuns(before, after, same = (a, b) => a === b) {
  const [a, b] = [before.split("\n"), after.split("\n")];
  let head = 0;
  while (head < a.length && head < b.length && same(a[head], b[head])) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && same(a[a.length - 1 - tail], b[b.length - 1 - tail])) tail++;
  const [x, y] = [a.slice(head, a.length - tail), b.slice(head, b.length - tail)];
  if (x.length === 0 && y.length === 0) return [];
  if (x.length * y.length > DIFF_CELLS) return [{ removed: x, added: y }];
  const longest = Array.from({ length: x.length + 1 }, () => new Uint32Array(y.length + 1));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) longest[i][j] = same(x[i], y[j]) ? longest[i + 1][j + 1] + 1 : Math.max(longest[i + 1][j], longest[i][j + 1]);
  const runs = [];
  let run = null;
  for (let i = 0, j = 0; i < x.length || j < y.length;) {
    if (i < x.length && j < y.length && same(x[i], y[j])) {
      run = null;
      i++;
      j++;
    } else {
      if (!run) runs.push(run = { removed: [], added: [] });
      if (j < y.length && (i === x.length || longest[i][j + 1] >= longest[i + 1][j])) run.added.push(y[j++]);
      else run.removed.push(x[i++]);
    }
  }
  return runs;
}

/**
 * What a write of a part changed of its lines: { removed, added, lines }, `lines` those of `before`,
 * each counting only lines that hold more than white space, as a part's text starts and ends on lines
 * of white space alone (a script's JSON, a body's rows), which say nothing of what changed.
 */
export function linesChanged(before, after) {
  const counted = (lines) => lines.filter((line) => line.trim()).length;
  const runs = changedRuns(before, after);
  return { removed: runs.reduce((sum, run) => sum + counted(run.removed), 0), added: runs.reduce((sum, run) => sum + counted(run.added), 0), lines: counted(before.split("\n")) };
}

/**
 * The lines a write of a part took out and put in, as a diff shows them and linesChanged counts them:
 * [{ removed, added }], a run each, its lines trimmed and those of white space alone left out.
 */
export function changedLines(before, after) {
  const kept = (lines) => lines.map((line) => line.trim()).filter(Boolean);
  return changedRuns(before, after).map(({ removed, added }) => ({ removed: kept(removed), added: kept(added) })).filter(({ removed, added }) => removed.length + added.length > 0);
}

// The line breaks among the first `count` characters of `lines` that are no white space: those with
// some of them before and some after.
function breaksAmong(lines, count) {
  let seen = 0;
  let breaks = 0;
  for (const [index, line] of lines.entries()) {
    if (index > 0 && seen > 0 && seen < count) breaks++;
    seen += line.replace(/\s+/g, "").length;
    if (seen >= count) break;
  }
  return breaks;
}

/**
 * How a write of a part lays out anew what it did not change, or null: "1 line became 5" where what a
 * run of changed lines keeps at its start or its end, white space aside, stands on another number of
 * lines (JSON written back in a layout of its own), or "a line left blank" where it leaves a line of
 * white space alone (a row moved without the blank before it).
 */
export function laidAnew(before, after) {
  const blank = (lines) => lines.filter((line) => !line.trim()).length;
  for (const { removed, added } of changedRuns(before, after, (a, b) => a.trim() === b.trim())) {
    if (blank(added) > blank(removed)) return "a line left blank";
    const [was, now] = [removed.join("").replace(/\s+/g, ""), added.join("").replace(/\s+/g, "")];
    let start = 0;
    while (start < was.length && start < now.length && was[start] === now[start]) start++;
    let end = 0;
    while (end < was.length - start && end < now.length - start && was[was.length - 1 - end] === now[now.length - 1 - end]) end++;
    for (const [count, from, to] of [[start, removed, added], [end, removed.toReversed(), added.toReversed()]]) {
      const [lines, laid] = [breaksAmong(from, count) + 1, breaksAmong(to, count) + 1];
      if (lines !== laid) return `${lines} line${lines === 1 ? "" : "s"} became ${laid}`;
    }
  }
  return null;
}

/**
 * How a write of a part lays it out anew (laidAnew), or null: none either where the layout is
 * context.editJSON's own rule and the block can change nothing of it, that is, where what the part
 * held is what editJSON lays out for the value it held and what the write left is what editJSON lays
 * out for the value written (a part spread over lines closing to one line when its list is emptied, an
 * entry in it opening to lines of its own as it comes to hold an object, which the rule does of the
 * same block however it writes; it opens no part that stands on one line, which stays on one line,
 * compact, one that closed to one line too).
 */
export function laidAnewOf(before, after) {
  const how = laidAnew(before, after);
  return how && !(editJSONWrote(before, after) && editJSONWrote(before, before)) ? how : null;
}

/**
 * What is said of the way back of the instance numbered `at` of the page `source`, whose example wrote
 * `written` (putBack's finding: each part's HTML by its name), `findings` all the page answered of it:
 * what the server takes of it (partsWritten), the lines it changed of each part, whether putting it
 * back gave the drawing it had, and a note on each part it lays out anew. The instance is numbered among
 * those that stand in no instance (outerInstances), as putBack numbers the one it put back.
 */
export function wayBackSaid(written, { source, found, at, findings }) {
  const splices = partsWritten(source, outerInstances(parseReport(source), found)[at], written.parts, new Map([[found.id, found]]));
  if (!splices) return [{ kind: "refused" }];
  const names = Object.keys(written.parts);
  const parts = splices.map(({ start, end, text }, index) => ({ name: names[index], before: source.slice(start, end), after: text }));
  const back = !findings.some(({ kind }) => kind === "undo" || kind === "moving");
  return [
    { kind: "wrote", back, parts: parts.map(({ name, before, after }) => ({ name, ...linesChanged(before, after) })) },
    ...parts.flatMap(({ name, before, after }) => {
      const how = laidAnewOf(before, after);
      return how ? [{ kind: "laid", part: name, how, json: editJSONWrote(before, after) }] : [];
    }),
  ];
}

// How many elements of an instance are asked what they listen to.
const LISTENED = 2000;

// In the page: the window, the document, then the instance numbered `at` of those `match` finds and
// what it holds, at most `most` of them.
function listenedTo({ match, instance, at, most }) {
  const host = [...document.querySelectorAll(match)].filter((node) => !node.parentElement.closest(instance))[at];
  return host ? [window, document, host, ...host.querySelectorAll("*")].slice(0, most) : [];
}

// In the page, of what listenedTo gave: the number of each one's parent among them (the instance's the
// document, the document's the window), and how each is named.
function shapeOf(list) {
  return list.map((node, index) => (index < 2 ? { parent: index - 1, named: "" } : {
    parent: index === 2 ? 1 : list.indexOf(node.parentElement),
    named: `<${node.localName}${node.classList.length ? ` class="${node.getAttribute("class")}"` : ""}>`,
  }));
}

// In the page, called on an element: whether a dragenter fired at it, as a drag entering it fires one,
// comes back cancelled.
function enterCancelled() {
  const event = new DragEvent("dragenter", { bubbles: true, cancelable: true, composed: true, dataTransfer: new DataTransfer() });
  this.dispatchEvent(event);
  return event.defaultPrevented;
}

/**
 * The lists of the instance numbered `at` that a card can be dropped on and that listen for dragover
 * and not for dragenter: [{ kind: "drops", what, line }], `line` the line of kit.js that listens. A
 * drop goes where both were cancelled, and the move that enters a new target asks dragenter alone, so
 * that a release just then drops nothing. A dragenter listener on the list or on what holds it up to
 * the instance is the component's answer; one of the document's or the window's hears every drag of
 * the page, the component's or anyone's, and counts where it cancels a dragenter fired at the list
 * (enterCancelled). Asked of the browser's DevTools (DOMDebugger.getEventListeners), the scripts known
 * by their address (Debugger, its pauses skipped), once the instance has heard it can write.
 */
async function dropsRefused(session, { match, at }) {
  const scripts = new Map(); // scriptId -> its address
  const parsed = ({ scriptId, url }) => scripts.set(scriptId, url);
  session.on("Debugger.scriptParsed", parsed);
  try {
    await session.send("Debugger.enable");
    await session.send("Debugger.setSkipAllPauses", { skip: true });
    const { result } = await session.send("Runtime.evaluate", { expression: `(${listenedTo})(${JSON.stringify({ match, instance: INSTANCE, at, most: LISTENED })})`, objectGroup: "drops" });
    const { result: shape } = await session.send("Runtime.callFunctionOn", { objectId: result.objectId, functionDeclaration: String(shapeOf), arguments: [{ objectId: result.objectId }], returnByValue: true });
    const { result: properties } = await session.send("Runtime.getProperties", { objectId: result.objectId, ownProperties: true });
    const nodes = properties.filter(({ name, value }) => /^\d+$/.test(name) && value?.objectId).sort((a, b) => Number(a.name) - Number(b.name));
    const heard = [];
    for (const { value } of nodes) heard.push((await session.send("DOMDebugger.getEventListeners", { objectId: value.objectId })).listeners);
    const hears = (index, type) => heard[index]?.some((listener) => listener.type === type);
    const refused = [];
    for (let index = 2; index < heard.length; index++) {
      const over = heard[index].find((listener) => listener.type === "dragover" && scripts.get(listener.scriptId) === "kit.js");
      if (!over) continue;
      let entered = false;
      for (let up = index; up >= 2 && !entered; up = shape.value[up].parent) entered = hears(up, "dragenter");
      if (!entered && (hears(0, "dragenter") || hears(1, "dragenter"))) {
        const { result: cancelled } = await session.send("Runtime.callFunctionOn", { objectId: nodes[index].value.objectId, functionDeclaration: String(enterCancelled), returnByValue: true });
        entered = cancelled.value === true;
      }
      if (!entered) refused.push({ kind: "drops", what: shape.value[index].named, line: over.lineNumber + 1 });
    }
    return refused;
  } finally {
    session.off("Debugger.scriptParsed", parsed);
    await session.send("Runtime.releaseObjectGroup", { objectGroup: "drops" }).catch(() => {});
    await session.send("Debugger.disable").catch(() => {});
  }
}

// What the page at `address` says of itself as it runs, heard from before it opens: errors by their
// first line, with the line of kit.js they name, the rest of what the console warns of, what failed to
// load, and each address the page was opened at, the first `asked` of them this look's (`dialogs` and
// `windows`, what runPage hears of those it opens).
function listen(page, address) {
  const heard = { errors: new Map(), notes: new Set(), failed: new Set(), dialogs: new Set(), windows: 0, opened: [], asked: 1, pending: [] };
  const error = (text) => {
    const [first] = text.split("\n");
    if (!heard.errors.has(first)) heard.errors.set(first, Number(/\bkit\.js:(\d+)/.exec(text)?.[1]) || null);
  };
  page.on("pageerror", (thrown) => error(thrown.stack ?? thrown.message));
  page.on("console", (message) => {
    const type = message.type();
    if (!["error", "warn", "warning"].includes(type) || !ownMessage(message, address, ["kit.js"])) return;
    // An error given to the console, as the kit gives it, is read for its stack: the text says only that it is one.
    heard.pending.push(Promise.all(message.args().map((argument) => argument.evaluate((value) => (value instanceof Error ? value.stack : String(value))).catch(() => ""))).then((words) => {
      const text = words.join(" ") || message.text();
      if (type === "error") error(text);
      else heard.notes.add(text.split("\n")[0]);
    }));
  });
  page.on("requestfailed", (request) => { if (request.frame() === page.mainFrame() && !request.isNavigationRequest()) heard.failed.add(request.url()); });
  page.on("request", (request) => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) heard.opened.push(request.url()); });
  return heard;
}

/**
 * Each dialog the page in `tab` opens refused as it comes, its type added to `dialogs`: one holds the
 * page up until it is answered, whatever was asked of it. Returns the DevTools session it is heard on.
 */
export async function refuseDialogs(tab, dialogs) {
  const session = await tab.createCDPSession();
  await session.send("Page.enable");
  session.on("Page.javascriptDialogOpening", ({ type }) => {
    dialogs.add(type);
    session.send("Page.handleJavaScriptDialog", { accept: false }).catch(() => {});
  });
  return session;
}

/**
 * What the browser answers, or an error saying what it was doing (`doing`): a page whose script never
 * ends answers nothing, however it is asked, and this has to end all the same. A tab that goes while it
 * is asked is a page that stopped answering too, whichever comes first.
 */
export function answered(promise, doing, ms = ANSWER) {
  let timer = 0;
  const stopped = () => Object.assign(new Error(doing), { stuck: true, doing, limit: ms });
  const late = new Promise((_, reject) => { timer = setTimeout(() => reject(stopped()), ms); });
  const heard = promise.catch((error) => { throw GONE.has(error.name) ? stopped() : Object.assign(error, { doing }); });
  return Promise.race([heard, late]).finally(() => clearTimeout(timer));
}

/** A time in ms as the checks say it: "30 s", "0.3 s". */
export const seconds = (ms) => `${Number((ms / 1000).toFixed(1))} s`;

/**
 * What a browser that did not answer is told as, `error` the stopped one (answered's, or a look's own bound:
 * { doing, limit }): what it was waited for, and how long. The browser is closed by the command that
 * asked, which says so.
 */
export const stuckSaid = (error) => `the browser did not answer within ${seconds(error.limit)}, waiting until ${error.doing}`;

/**
 * Whether `browser` went, what a look that ended asks before it says anything of the page: a machine
 * short of memory may take it from under a page with nothing wrong, whatever that page was doing and
 * whatever the question then failed with. One on its way out closes its tabs first, so that what was
 * asked of them fails a moment before it has gone.
 */
export const wentAway = (browser) => new Promise((resolve) => {
  if (!browser.connected) return resolve(true);
  browser.once("disconnected", () => resolve(true));
  setTimeout(() => resolve(false), HEARING);
});

// In the page: how wide it is when that is wider than the window, as gallery qa measures it, with the
// number of the first of the instances `match` finds to reach past the window (-1: none does), or null.
function pastWindow({ match, instance }) {
  const { clientWidth: view, scrollWidth: wide } = document.documentElement;
  if (wide <= view + 1) return null;
  const hosts = [...document.querySelectorAll(match)].filter((node) => !node.parentElement.closest(instance));
  return { wide, at: hosts.findIndex((host) => [host, ...host.querySelectorAll("*")].some((node) => node.getBoundingClientRect().right > view + 1)) };
}

// The space between two pictures put side by side, and its color, which tells the two themes' pages apart.
const GUTTER = 16;
const GUTTER_COLOR = "#8f8f8f";

/**
 * The pictures `files`, one of each width (WIDTHS) of a theme, side by side at their own sizes,
 * GUTTER apart and top to top, pictured to `target` as tall as the tallest: what one look at one file
 * takes in, a picture an Agent opens where it opened one of six at most (found testing the skill with
 * Agents, 2026-11-05). Made in `tab`, in place of the page it held, which nothing asks of after.
 */
async function sideBySide(tab, files, target) {
  const pictures = await Promise.all(files.map(async (file) => `data:image/png;base64,${(await fsp.readFile(file)).toString("base64")}`));
  await tab.setViewport({ width: WIDTHS.reduce((sum, width) => sum + width, 0) + GUTTER * (WIDTHS.length - 1), height: 900 });
  await tab.setContent(`<!doctype html><body style="margin: 0; display: flex; align-items: flex-start; gap: ${GUTTER}px; background: ${GUTTER_COLOR}">${pictures.map((src, at) => `<img src="${src}" width="${WIDTHS[at]}" alt="" style="display: block">`).join("")}</body>`, { waitUntil: "load" });
  await tab.screenshot({ path: target, fullPage: true });
}

// The export at `file` of the document `source` in a tab of `browser`: { heard (listen's), blocked: what its policy refused, late,
// taken: the pictures, overviews: those side by side, edited: those as the editing page draws it, asExport: those of them byte for byte the export's at their width,
// answers: [{ finding, place }], wide: [{ width, wide, at }], stuck: what it was
// doing when it stopped answering, stopped: what else ended the look, gone: what it was doing when the
// browser went }. `loading`: how long it may take to open.
async function runPage(browser, { file, html, source, places, found, out, loading, answer = ANSWER }) {
  // What opens the page is asked with a bound too, and a browser that does not answer ends the look (the caller says so).
  const ask = (promise, doing) => answered(promise, doing, answer);
  const context = await ask(browser.createBrowserContext(), "a browser context opened");
  const tab = await ask(context.newPage(), "a tab opened");
  const address = pathToFileURL(file).href;
  const heard = listen(tab, address);
  // A dialog holds everything up until it is answered (refuseDialogs), and a window the page opens takes
  // the page out of sight, where it draws nothing: each is done with as it comes.
  const session = await ask(refuseDialogs(tab, heard.dialogs), "the tab was set to refuse dialogs");
  context.on("targetcreated", (target) => {
    if (target.type() !== "page") return;
    heard.windows += 1;
    target.page().then((opened) => opened?.close()).then(() => tab.bringToFront()).catch(() => {});
  });
  const seen = { heard, blocked: [], late: [], taken: [], overviews: [], edited: [], asExport: [], answers: [], wide: [], stuck: null, stopped: null, gone: null };
  const settled = async (doing) => seen.late.push(...await answered(settle(tab, { timeout: TIMEOUT }), doing, 3 * TIMEOUT + ANSWER));
  await ask(keepViolations(tab), "the tab was set to keep what the policy blocks");
  await ask(tab.setViewport({ width: 736, height: 900 }), "the window went to 736px");
  await ask(tab.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]), "the light theme came");
  try {
    await answered(tab.goto(address, { waitUntil: "load", timeout: 0 }), "the page opened", loading);
    await settled("the page opened");
    for (const theme of THEMES) {
      await answered(tab.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme }]), `the ${theme} theme came`);
      for (const width of WIDTHS) {
        await answered(tab.setViewport({ width, height: 900 }), `the window went to ${width}px`);
        await settled(`it was drawn at ${width}px`);
        if (theme === THEMES[0]) {
          const past = await answered(tab.evaluate(pastWindow, { match: found.match, instance: INSTANCE }), `it was measured at ${width}px`);
          if (past) seen.wide.push({ width, ...past });
        }
        const target = path.join(out, `${width}-${theme}.png`);
        await answered(tab.screenshot({ path: target, fullPage: true }), `it was pictured at ${width}px`);
        seen.taken.push(target);
      }
    }
    await answered(tab.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]), "the light theme came");
    await answered(tab.setViewport({ width: 736, height: 900 }), "the window went to 736px");
    const sources = instancesIn(html, found);
    // Before any way back below: the first of them tells the page it takes edits, for every instance on it.
    for (const { at, ...finding } of await answered(tab.evaluate(controlsShown, { match: found.match, instance: INSTANCE, slot: SLOT_PART, parts: found.parts, boards: found.settings?.length ? [SETTINGS_PART] : [] }), "the page was asked what each instance still shows")) {
      seen.answers.push({ finding: { kind: "controls", ...finding }, place: places[at] });
    }
    const writes = found.files.includes("kit.js") && Object.values(found.parts).some(({ edit }) => edit === "data");
    for (let at = 0; at < sources.length; at++) {
      const findings = await answered(tab.evaluate(putBack, { match: found.match, instance: INSTANCE, slotPart: SLOT_PART, slotName: SLOT, fallback: FALLBACK, parts: found.parts, boards: found.settings?.length ? [SETTINGS_PART] : [], at, source: sources[at].markup, still: STILL, step: STEP, times: PUT_BACKS, typed: TYPED, typing: TYPING }), "an instance was put back");
      const written = findings.find(({ kind }) => kind === "wrote");
      const said = [...findings.filter((finding) => finding !== written), ...(written ? wayBackSaid(written, { source, found, at, findings }) : [])];
      if (writes && !findings.some(({ kind }) => kind === "gone" || kind === "fallback")) said.push(...await answered(dropsRefused(session, { match: found.match, at }), "the page was asked what an instance listens to"));
      seen.answers.push(...said.map((finding) => ({ finding, place: places[at] })));
    }
    seen.blocked = await answered(tab.evaluate(() => globalThis.__qaViolations), "the page was asked what it blocked");
    // The page as the editing page draws it: opened again and told it takes edits, with no one to take
    // one (no doc-component-edit listener: each edit is refused, and nothing is written), pictured light:
    // what the component draws only where a reader can edit (a handle, a button), which an export leaves
    // out. A picture byte for byte the export's at its width says that it draws nothing more there.
    heard.asked += 1;
    await answered(tab.goto(address, { waitUntil: "load", timeout: 0 }), "the page opened again", loading);
    await settled("the page opened again");
    await answered(tab.evaluate(() => dispatchEvent(new Event("doc-editable"))), "the page was told it takes edits");
    await settled("it was drawn as the editing page draws it");
    for (const width of EDITED) {
      await answered(tab.setViewport({ width, height: 900 }), `the window went to ${width}px`);
      await settled(`it was drawn at ${width}px as the editing page draws it`);
      const target = path.join(out, `edit-${width}-light.png`);
      await answered(tab.screenshot({ path: target, fullPage: true }), `it was pictured at ${width}px as the editing page draws it`);
      seen.edited.push(target);
      if ((await fsp.readFile(target)).equals(await fsp.readFile(path.join(out, `${width}-light.png`)))) seen.asExport.push(target);
    }
    seen.blocked.push(...await answered(tab.evaluate(() => globalThis.__qaViolations), "the page was asked what it blocked"));
    for (const theme of THEMES) {
      const target = path.join(out, `overview-${theme}.png`);
      await answered(sideBySide(tab, WIDTHS.map((width) => path.join(out, `${width}-${theme}.png`)), target), `the ${theme} pictures were put side by side`);
      seen.overviews.push(target);
    }
  } catch (error) {
    if (error.syscall) throw error; // a folder that refused a picture, which says nothing of the page
    if (await wentAway(browser)) seen.gone = error.doing ?? "the page answered";
    else if (error.stuck) seen.stuck = error.doing;
    else seen.stopped = firstLine(error);
  }
  await Promise.race([Promise.all(heard.pending), new Promise((resolve) => setTimeout(resolve, HEARING).unref())]);
  return seen;
}

// An address as a writer knows it: as the page wrote it, for what stands beside the export.
const addressShown = (url, folder) => (url.startsWith(folder) ? url.slice(folder.length) : url);

// What the page's policy blocked, each once, by what asked for it. Code made from words comes with its
// line, and with no address when it stands in a script another put on the page, as a package's copy is;
// an address of no host the browser says by its scheme alone, and what failed to load says which it was.
function blockedSaid(blocked, failed, folder) {
  const said = new Map();
  for (const { url, directive, source, line } of blocked) {
    if (MADE_FROM_WORDS.test(url)) {
      const script = !source && line > 0;
      said.set(`${url}|${source}|${line}`, { file: script ? "kit.js" : "the page", ...(script ? { line } : {}), what: "the export's policy blocks code made from words (eval, new Function, a string given to setTimeout): an export runs none" });
      continue;
    }
    const addresses = /^[a-z][a-z0-9+.-]*$/.test(url) ? failed.filter((address) => address.startsWith(`${url}:`)) : [];
    for (const address of addresses.length ? addresses : [url]) {
      said.set(`${address}|${directive}`, { file: "the page", what: `the export's policy blocks ${addressShown(address, folder) || "something"} (${directive}): ${directive === "img-src" ? "a picture of an instance is a data: address, or a file its style names" : "an export holds all it needs"}` });
    }
  }
  return [...said.values()];
}

// The section's words on what runPage saw: { problems, notes, told }, `told` its way back, neither a
// problem nor a note. `script`: the package has one; `folder`: the address of the export's folder.
function seenSaid({ heard, blocked, late, answers, wide, stuck, stopped }, { places, script, folder }) {
  // Drawn nodes the runtime does not name pile up, and also stay in what dehydrate leaves and in what an
  // example changes outside its parts: said once for an instance, as the pile (whose fix ends the others).
  const at = ({ place }) => `${place?.file}:${place?.line}`;
  const piled = new Set(answers.filter(({ finding }) => finding.kind === "piles" && !finding.outside).map(at));
  const follows = (answer) => piled.has(at(answer)) && ((answer.finding.kind === "left" && !answer.finding.part) || (answer.finding.kind === "example" && String(answer.finding.what).startsWith("it changes what is no data part")));
  const said = once(answers.filter((answer) => !follows(answer))).map(({ finding, place }) => findingSaid(finding, place, { script }));
  const failed = [...heard.failed];
  const missed = failed.filter((url) => !blocked.some((block) => block.url && url.startsWith(block.url)));
  const stopping = heard.opened.length > heard.asked ? "it loads itself again (location.reload(), a new location.href), so a reader's page would not stay"
    : stuck ? `it stopped answering while waiting until ${stuck}${script ? ": a script that never ends, or a component that changes what it hears (a text part, on its source signal)" : ""}`
      : stopped && `the look at it stopped: ${stopped}`;
  const wider = wide.map(({ width, wide: page }) => `${page}px wide in a ${width}px window`).join(", ");
  const widest = places[wide.find(({ at }) => at >= 0)?.at] ?? { file: "the page" };
  return {
    problems: [
      ...[...heard.errors].map(([what, line]) => ({ file: line ? "kit.js" : "the page", line, what: `the console says ${what}` })),
      ...blockedSaid(blocked, failed, folder),
      ...missed.map((url) => ({ file: "the page", what: `it could not load ${url.slice(0, 120)}` })),
      ...[...heard.dialogs].map((type) => ({ file: "the page", what: `it opens a dialog (${type}), which stops a reader's page until it is answered: show what it says in the instance` })),
      ...(heard.windows ? [{ file: "the page", what: "it opens a window, which takes a reader away from the page: show it in the instance, or link to it" }] : []),
      ...(stopping ? [{ file: "the page", what: stopping }] : []),
      ...(wide.length ? [{ ...widest, what: `the page is ${wider}: a reader scrolls the whole page sideways, and gallery qa fails it: let it fit the window (max-width: 100%), or put what is wider in a frame of its own that scrolls` }] : []),
      ...said.filter(({ note, told }) => !note && !told),
    ],
    notes: [
      ...[...heard.notes].map((what) => ({ file: "the page", what: `the console says ${what}` })),
      ...said.filter(({ note }) => note),
      ...late.map((what) => ({ file: "the page", what: `waited for ${what}` })),
    ],
    told: said.filter(({ told }) => told),
  };
}

/**
 * The section of a package run in a browser: { title, problems, notes, told: its way back, pictures:
 * { folder, overviews, each, edited, asExport: the names of the files there, asExport those of edited the
 * export's pictures at their width }, unverified: why it could not be, picture: what `picture` made }. `example` and `template`: the files' text; `find` and `start`: what
 * finds the browser and starts it; `loading`: how long the page may take to open; `answer`: how long it may take to answer
 * what opens the page (a browser context, a tab, its set-up); `picture(browser)`: made in the same browser once the
 * look ran through (gallery block check's pictures of the block for the menus, ./block-picture.mjs), what
 * stops it said nowhere, as nothing of the check is.
 */
export async function lookAtPackage(root, found, { example, template }, { find = findBrowser, start = startBrowser, loading = LOADING, answer = ANSWER, picture = null } = {}) {
  const title = BROWSER_SECTION;
  let temp = null;
  let running = null;
  try {
    temp = await fsp.mkdtemp(path.join(os.tmpdir(), "gallery-component-check-"));
    const made = await exported(found, { example, template }, temp);
    const executablePath = find();
    if (!executablePath) return { title, unverified: "no Chrome, Edge or Chromium found (GALLERY_BROWSER=<its executable> picks one)" };
    try {
      running = await start({ executablePath, args: lookingArguments() });
    } catch (error) {
      return { title, unverified: `the browser ${executablePath} did not start, twice, each time with a fresh profile (${firstLine(error)}; GALLERY_BROWSER=<its executable> picks another)` };
    }
    const out = path.join(layoutOf(root).qa, "components", ...found.id.split("/"));
    await fsp.rm(out, { recursive: true, force: true });
    await fsp.mkdir(out, { recursive: true });
    const seen = await runPage(running.browser, { ...made, found, out, loading, answer });
    const said = seenSaid(seen, { places: made.places, script: found.files.includes("kit.js"), folder: pathToFileURL(`${temp}${path.sep}`).href });
    if (seen.gone) return { title, ...said, unverified: `the browser went while waiting until ${seen.gone}, so it says nothing of the block` };
    const drawn = picture && !seen.stuck && !seen.stopped && said.problems.length === 0 ? await picture(running.browser).catch(() => null) : null;
    return { title, ...said, ...(drawn ? { picture: drawn } : {}), ...(seen.taken.length ? { pictures: { folder: out, overviews: seen.overviews.map((file) => path.basename(file)), each: seen.taken.map((file) => path.basename(file)), edited: seen.edited.map((file) => path.basename(file)), asExport: seen.asExport.map((file) => path.basename(file)) } } : {}) };
  } catch (error) {
    if (error.reason === "check") return { title, problems: error.failures.map((what) => ({ file: "the export", what })) };
    if (error.syscall) return { title, unverified: `cannot write ${shown(error.syscall === "mkdtemp" ? os.tmpdir() : error.path)} (${error.code})` };
    if (running && await wentAway(running.browser)) return { title, unverified: "the browser went before the page opened" };
    if (error.stuck) return { title, problems: [{ file: "the page", what: `${stuckSaid(error)}, so the look stopped and the browser was closed` }] };
    return { title, problems: [{ file: "the page", what: `the look at it stopped: ${firstLine(error)}` }] };
  } finally {
    await running?.close();
    if (temp) await fsp.rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
  }
}

/**
 * The documents of the workspace at `root` that hold instances of package `found`, by slug: [{ slug,
 * place: "<slug>/doc.html", directory, instances: [{ line, markup }] }], each instance one in no other of
 * the package (one in another's slot of the package is in that one's markup), wherever else it stands:
 * straight in the page, or in another package's slot. Read alone: nothing is written.
 */
export async function documentsHolding(root, found, { full = false } = {}) {
  const held = [];
  for (const slug of await listDocumentSlugs(root)) {
    const directory = documentDirectory(slug, root);
    const file = documentFiles(directory).html;
    const text = await fsp.readFile(file, "utf8").catch(() => null);
    if (text === null) continue;
    const all = instancesOf(parseReport(text), found);
    const inOwn = (node) => {
      for (let around = node.parentNode; around; around = around.parentNode) if (all.includes(around)) return true;
      return false;
    };
    const instances = all.filter((node) => !inOwn(node)).map(({ sourceCodeLocation: { startLine, startOffset, endOffset } }) => ({ line: startLine, markup: text.slice(startOffset, endOffset) }));
    if (instances.length) held.push({ slug, place: full ? shown(file) : `${slug}/${path.basename(file)}`, directory, instances });
  }
  return held;
}

/**
 * The export of a temporary document holding the instances of a document (documentsHolding's `held`),
 * each under a line naming where it stands, in the folder `temp`, with a copy of the document's assets/,
 * of package `found` and of each other package of `packages` (the catalog's) they name: { html, file,
 * places, source }, `places` each instance's { file: <slug>/doc.html, line } in the document.
 */
async function exportedDocument(found, held, packages, temp) {
  const markup = held.instances.map(({ line, markup: instance }) => `<p>${held.place}:${line}</p>${instance}`).join("\n");
  for (const id of new Set([found.id, ...[...markup.matchAll(new RegExp(`${ATTRIBUTE}="([^"]+)"`, "g"))].map(([, named]) => named)])) {
    const other = id === found.id ? found : packages.get(id);
    if (other) await copyPackage(other, temp);
  }
  const document = path.join(temp, SLUG);
  await fsp.mkdir(document);
  await fsp.cp(path.join(held.directory, "assets"), path.join(document, "assets"), { recursive: true }).catch((error) => { if (error.code !== "ENOENT") throw error; });
  const source = shownSource(pageOfMarkup(SLUG, markup)).text;
  await fsp.writeFile(path.join(document, "doc.html"), source);
  await fsp.writeFile(path.join(document, "doc.json"), JSON.stringify({ title: SLUG, description: SLUG, type: "component" }));
  const render = await offlineReports({ directory: temp, catalog: readCatalog(temp) });
  const html = await render(SLUG);
  const file = path.join(temp, "export.html");
  await fsp.writeFile(file, html);
  const places = instancesIn(source, found).map((_, index) => ({ file: held.place, line: held.instances[index]?.line ?? null }));
  return { html, file, places, source };
}

/**
 * The sections of package `found`'s instances in the documents of the workspace at `root` (and of
 * `elsewhere`, the workspace gallery open finds when it is another: each named there by its file), one of each
 * document that holds some (documentsHolding), each run as lookAtPackage runs the example and the
 * template, in one browser: { title, problems, notes, told, pictures, unverified } as lookAtPackage's,
 * each finding at its line of the document's file, its pictures in documents/<slug>/ of the package's
 * folder of .gallery/qa/components/; or one section saying that no document holds one. Writes no document.
 */
export async function lookAtDocuments(root, found, { elsewhere = null, find = findBrowser, start = startBrowser, loading = LOADING } = {}) {
  const other = elsewhere && workspaceKey(elsewhere) !== workspaceKey(root) ? elsewhere : null;
  const documents = [...await documentsHolding(root, found), ...(other ? await documentsHolding(other, found, { full: true }) : [])];
  if (documents.length === 0) return [{ title: documentsSection(), none: `none holds an instance of ${found.id}` }];
  const executablePath = find();
  if (!executablePath) return [{ title: documentsSection(), unverified: "no Chrome, Edge or Chromium found (GALLERY_BROWSER=<its executable> picks one)" }];
  let running;
  try {
    running = await start({ executablePath, args: lookingArguments() });
  } catch (error) {
    return [{ title: documentsSection(), unverified: `the browser ${executablePath} did not start, twice, each time with a fresh profile (${firstLine(error)}; GALLERY_BROWSER=<its executable> picks another)` }];
  }
  const { packages } = readCatalog(root);
  const sections = [];
  try {
    for (const held of documents) {
      const title = documentsSection(held.place);
      let temp = null;
      try {
        temp = await fsp.mkdtemp(path.join(os.tmpdir(), "gallery-component-check-"));
        const made = await exportedDocument(found, held, packages, temp);
        const out = path.join(layoutOf(root).qa, "components", ...found.id.split("/"), "documents", held.slug);
        await fsp.rm(out, { recursive: true, force: true });
        await fsp.mkdir(out, { recursive: true });
        const seen = await runPage(running.browser, { ...made, found, out, loading });
        const said = seenSaid(seen, { places: made.places, script: found.files.includes("kit.js"), folder: pathToFileURL(`${temp}${path.sep}`).href });
        if (seen.gone) {
          sections.push({ title, ...said, unverified: `the browser went while waiting until ${seen.gone}, so it says nothing of these instances` });
          break;
        }
        sections.push({ title, ...said, ...(seen.taken.length ? { pictures: { folder: out, overviews: seen.overviews.map((each) => path.basename(each)), each: seen.taken.map((each) => path.basename(each)), edited: seen.edited.map((each) => path.basename(each)), asExport: seen.asExport.map((each) => path.basename(each)), documents: true } } : {}) });
      } catch (error) {
        if (error.reason === "check") sections.push({ title, problems: error.failures.map((what) => ({ file: held.place, what: `its instances, exported alone: ${what}` })) });
        else if (error.syscall) sections.push({ title, unverified: `cannot write ${shown(error.syscall === "mkdtemp" ? os.tmpdir() : error.path)} (${error.code})` });
        else if (await wentAway(running.browser)) {
          sections.push({ title, unverified: "the browser went before the page opened" });
          break;
        } else if (error.stuck) {
          sections.push({ title, problems: [{ file: "the page", what: `${stuckSaid(error)}, so the look at them stopped, the browser was closed, and no document after them was looked at` }] });
          break;
        } else sections.push({ title, problems: [{ file: "the page", what: `the look at them stopped: ${firstLine(error)}` }] });
      } finally {
        if (temp) await fsp.rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
      }
    }
  } finally {
    await running.close();
  }
  return sections;
}
