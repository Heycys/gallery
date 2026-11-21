import "./workspace-env.mjs";
import { JSDOM } from "jsdom";
import { pathToFileURL } from "node:url";
import { canNest, indentItem, outdentItem } from "../../src/editor/components/list/page.mjs";
import { sectionAfter, unwrapCheck, unwrapSection, wrapCheck, wrapSection } from "../../src/editor/components/section/page.mjs";
import { BLOCK_TYPES, accepts } from "../../src/editor/components/registry.mjs";
import { checkLeft, pendingKey, readLost, recover, stateKey } from "../../src/editor/page/autosave.mjs";
import { containerTargets, containerType, convertBlock, convertContainer, convertible, targetsOf } from "../../src/editor/page/convert.mjs";
import { ELEMENT_ID, can, isHost, mergeWithPrevious, partOwner, splitBlock } from "../../src/editor/page/core.mjs";
import { hashOf } from "../../src/editor/source.mjs";
import { advance, browser, list, open, page, play, removeUnit, server, stop, storage } from "./page-harness.mjs";

// Editing at random against one page's commits and autosave (page-harness.mjs: jsdom, the server's
// commitEdits), with everything around the reader decided by the seed too: the network (an answer
// lost after the file was written, held while the reader goes on, busy, the server unreachable), an
// Agent (rewording, deleting and adding paragraphs in the file), the page going away (closed, or
// crashed) and opened again, and time. So a seed is one interleaving, the same every run; the
// browser's fuzz (tests/browser/fuzz.mjs) has the machine's timing, and a race found there shows in
// one run of four. After every step:
//   - nothing throws, and autosave never stops on an error;
//   - with no Agent, no conflict;
//   - a block made on the page goes as what it is (a commit gives it the type of its element);
//   - every element keeps the identity it was given (data-ge-id), and no two on the page share one;
//   - the page reloads by itself only when every word of the reader's it shows is in the file;
//   - closed and opened again, it shows what it showed (no Agent), or every word of the reader's
//     it showed is in the file or listed for the reader;
// and at the end, once every answer came: with no Agent, the file reads as the page does and
// nothing is listed; with one, every word of the reader's on the page is in the file, held for the
// reader, or in a block not finished yet. The reader's words are markers (〔m1〕, 〔m2〕…), each typed once.
// A failing seed is cut down to the steps that matter, and printed.
//
//   node tests/unit/model.mjs [first seed] [how many] [steps]

const START = page(`  <p>开头一段。</p>

  <section class="doc-section" aria-labelledby="a">
    <h2 id="a">第一章</h2>
    <p>甲段落，写的是开头。</p>
    <p>乙段落，写的是中间。</p>
  </section>

  <section class="doc-section" aria-labelledby="b">
    <h2 id="b">第二章</h2>
    <p>丙段落，在第二章。</p>
    <ul>
      <li>第一项</li>
      <li>第二项</li>
    </ul>
  </section>
`);

// A small, fast generator: the same steps for the same seed (as tests/browser/fuzz.mjs).
const generator = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
};

// What a step is, by weight: the reader's, the network's, the page's, time's, the Agent's.
const READER = [["nearby", 1], ["type", 24], ["split", 7], ["merge", 5], ["remove", 6], ["convert", 4], ["list", 4], ["section", 2], ["dissolve", 2], ["move", 5], ["undo", 7],
  ["indent", 3], ["outdent", 2], ["retag", 2], ["bullet", 2], ["flatten", 1], ["wrap", 1]];
const WORLD = [["wait", 12], ["lose", 3], ["busy", 2], ["offline", 2], ["hold", 3], ["release", 2], ["close", 2], ["crash", 1]];
const AGENT = [["reword", 3], ["delete", 2], ["add", 2], ["rollback", 1]];

/** The steps of seed `seed`: [{ kind, a, b }], a and b in [0, 1) choosing among what the page has then. */
export function steps(seed, count, { agent = seed % 3 === 0 } = {}) {
  const random = generator(seed);
  const kinds = [...READER, ...WORLD, ...(agent ? AGENT : [])];
  const total = kinds.reduce((sum, [, weight]) => sum + weight, 0);
  return Array.from({ length: count }, () => {
    let roll = random() * total;
    const [kind] = kinds.find(([, weight]) => (roll -= weight) < 0) ?? kinds.at(-1);
    return { kind, a: random(), b: random() };
  });
}

const markers = (text) => new Set(text.match(/〔m\d+〕/g) ?? []);
const word = (serial) => `〔m${serial}〕`;

// The report as the reader sees it: tags, own text and nesting (empty blocks are not written).
function shape(document) {
  const walk = (node) => {
    const out = [];
    for (const child of node.children) {
      if (child.matches("header, script, style")) continue;
      const tag = child.localName;
      if (["p", "h1", "h2", "h3", "h4", "li"].includes(tag)) {
        const own = [...child.childNodes].filter((kid) => !(kid.nodeType === 1 && ["ul", "ol"].includes(kid.localName))).map((kid) => kid.textContent).join("").replace(/\s+/g, " ").trim();
        const kids = walk(child);
        if (own || kids.length > 0) out.push(`${tag}:${own}${kids.length ? `[${kids.join(",")}]` : ""}`);
      } else if (["ul", "ol", "section", "blockquote", "div"].includes(tag)) {
        const kids = walk(child);
        if (kids.length > 0) out.push(`${tag}[${kids.join(",")}]`);
      }
    }
    return out;
  };
  return walk(document.querySelector("main")).join(" ");
}

// Every node of the page's content with what it holds, to put back as it was (undo: the very same
// nodes, as history.mjs does).
function snapshot(document) {
  const main = document.querySelector("main");
  const nodes = [main, ...main.querySelectorAll("*")];
  const texts = [];
  const walker = document.createTreeWalker(main, 4);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push([node, node.data]);
  return { lists: nodes.map((node) => [node, [...node.childNodes]]), texts };
}
function restore({ lists, texts }) {
  for (const [node, data] of texts) node.data = data;
  for (const [node, children] of lists) node.replaceChildren(...children);
}

/**
 * One session of `ops` (steps()): { problem, at } (null when every rule held), `at` the step it broke
 * after. `trace`: a list the steps and the commits are written to.
 */
export async function session(ops, { trace = null, start = START, expect = null } = {}) {
  const net = server(start);
  const local = storage();
  let t = null;
  let undo = [];
  let serial = 0;
  let release = null;
  let agentWrote = false;
  const agentRemoved = new Set(); // the reader's words the Agent took out of the file
  // The reader's words an Agent's write back took out of the file: held for the reader once the page
  // hears of that write; gone with a page closed before it did.
  const rolledBack = new Set();
  let reloadAsked = false;
  let openedWith = null; // the file the page open now opened on
  let rebuilt = false; // a page reopened after a commit whose answer it never learned, without what it knew (recover: rebase)
  let problem = null;
  const fail = (text) => { problem ??= text; };
  browser.onReload = () => { reloadAsked = true; };

  // Commits as they go: a block made on the page goes as what it is.
  const sentBefore = new Set();
  const forward = net.fetch;
  net.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    if (String(url).includes("/commit")) {
      trace?.push(`  >> ${JSON.stringify({ request: body.request, texts: body.texts?.map((text) => text.parts?.map((part) => part.html)), units: body.units?.map((op) => op.insert ? `insert ${op.insert.type ?? (op.insert.restore ? "restore" : "?")}` : Object.keys(op).find((name) => !["key", "unit", "hash", "force"].includes(name))) })}`);
      const check = (node) => {
        const tag = BLOCK_TYPES[node?.type]?.tag;
        const element = node?.blockId ? t?.document.querySelector(`[data-block-id="${node.blockId}"]`) : null;
        if (tag && element && element.localName !== tag) fail(`a ${element.localName} went as a ${node.type} (${node.blockId})`);
        node?.children?.forEach(check);
      };
      // As built: one sent again (its answer unknown) went as the page was then.
      if (!sentBefore.has(body.request)) for (const op of body.units ?? []) if (op.insert) check(op.insert);
      sentBefore.add(body.request);
    }
    const before = net.file;
    try {
      const response = await forward(url, init);
      if (trace && String(url).includes("/commit")) {
        const answer = await response.json();
        const refused = [...(answer.texts ?? []), ...(answer.units ?? [])].filter((entry) => entry.status !== "applied").map((entry) => `${entry.key}:${entry.status}:${entry.reason ?? ""}`);
        trace.push(`  << ${answer.ok ? "ok" : answer.reason}${answer.again ? " again" : ""}${refused.length ? ` ${refused.join(" ")}` : ""}${answer.gone?.length ? ` gone ${answer.gone.join(",")}` : ""}`);
        return { status: response.status, json: async () => answer };
      }
      return response;
    } finally {
      // The live-reload channel announces every write of the file, a little later, to the page open
      // then (a page opened since connects after it loads: it hears only what comes after).
      if (net.file !== before) {
        const version = hashOf(net.file);
        const target = t;
        setTimeout(() => target?.autosave.heard(version), 40);
      }
    }
  };

  const main = () => t.document.querySelector("main");
  const hosts = () => [...main().querySelectorAll("[contenteditable='true']")].filter((node) => isHost(node) && !node.closest("header"));
  const units = () => [...main().querySelectorAll("[data-ge-unit], [data-ge-new]")].filter((node) => node.parentElement?.hasAttribute("data-ge-box") && !node.closest("header"));
  const pick = (items, roll) => items[Math.floor(roll * items.length)];
  const pageWords = () => markers(main().textContent);
  const fileWords = () => markers(net.file);
  const listed = () => markers(readLost(local, "demo").map((item) => item.text ?? item.html ?? "").join(" "));
  const undrafted = () => readLost(local, "demo").filter((item) => item.why !== "draft"); // listed, but for blocks not finished
  // Held for the reader: what each conflict says, and what its block holds now (flagged on the
  // page), with the blocks split off it now (written with it); what someone else's write put back.
  const held = () => markers([...t.reverts.map((entry) => entry.mine ?? ""), ...[...t.commits.issues.entries()].map(([key, issue]) => {
    const node = key.startsWith("b") ? t.document.querySelector(`[data-ge-block="${key.slice(1)}"]`)
      : key.startsWith("u") ? t.document.querySelector(`[data-ge-unit="${key.slice(1)}"]`) : issue.element;
    const parts = node?.parentElement ? [...node.parentElement.children].filter((other) => partOwner(other)?.owner === node) : [];
    return `${issue.mine ?? ""} ${node?.textContent ?? ""} ${parts.map((part) => part.textContent).join(" ")}`;
  })].join(" "));
  const drafts = () => markers(t.commits.buffer().drafts.join(" "));
  // Every element's identity as first seen: never another, never none.
  const identities = new WeakMap();
  const checkIdentities = () => {
    const doubled = t.commits.doubled();
    if (doubled.length > 0) fail(`identities on more than one element: ${doubled.join(" ")}`);
    for (const node of t.document.querySelectorAll("main *")) {
      const id = node.getAttribute(ELEMENT_ID);
      const before = identities.get(node);
      if (before !== undefined && before !== id) fail(`an element's identity changed: ${before} -> ${id} (${node.outerHTML.slice(0, 120)})`);
      if (id && before === undefined) identities.set(node, id);
    }
  };
  const structural = (change) => {
    const before = snapshot(t.document);
    if (change() === false) return;
    undo.push(before);
    t.change(true);
  };

  // The page opened again on the file (`leaving`: it was closed, and said so; otherwise it crashed
  // or reloaded by itself): what the old one left is sent first, as the editor does.
  async function reopen(leaving, checkWords) {
    const shown = t && shape(t.document);
    const words = t ? pageWords() : new Set();
    const listedBefore = undrafted().length;
    // Blocks no commit can carry yet (a new block with no place) are not written: listed, and the
    // page opened again shows the file without them.
    const unfinished = Boolean(t?.autosave.state.drafts);
    let unanswered = false;
    let exact = true; // what follows a commit whose answer is not known is found again exactly (the page kept what it knew)
    if (t) {
      if (leaving) t.autosave.leave();
      t.autosave.close();
      const left = JSON.parse(local.get(pendingKey("demo", "tab")) ?? "null");
      unanswered = Boolean(left?.sent);
      exact = !unanswered || JSON.parse(local.get(stateKey("demo", "tab")) ?? "null")?.sent === left.sent.request;
      const brief = (request) => request && JSON.stringify({ texts: request.texts?.map((text) => text.parts?.map((part) => part.html)), units: request.units?.map(({ key, hash, ...op }) => op) }).replace(/"(hash|openHash|seal|source)":"[^"]*",?/g, "");
      trace?.push(`  buffer: sent ${brief(left?.sent)}\n          request ${brief(left?.request)}`);
    }
    release?.();
    release = null;
    net.gate = null;
    net.mode = "deliver";
    net.once = false;
    await advance(0);
    t = null; // what the next page sends from the buffer is the old page's, as it was buffered
    for (let tries = 0; ; tries++) {
      const result = await recover({ map: { slug: "demo", version: hashOf(net.file), token: "token" }, storage: local, keys: [pendingKey("demo", "tab")] });
      if (!result.left || tries > 5) break;
      await advance(1000);
    }
    t = open(net, local);
    t.autosave.opened(new Set()); // what the page before kept, asked of where the file is not as it last knew it (the editor once the workbench is told)
    openedWith = net.file;
    checkLeft(local, "demo", t.commits.texts());
    undo = [];
    if (!exact) rebuilt = true;
    if (!checkWords) return;
    // Closed, the page keeps what it knew: what follows a commit whose answer never came is found
    // again exactly, as that page would have (recover: rehydrate). Without it (a crash before the
    // page kept it), it is rebuilt on that answer as well as recover() can (rebase): the words, not
    // always the order of blocks in or next to what that commit did.
    if (!exact) fail("closed with a commit whose answer is not known, the page did not keep what it knew");
    if (!agentWrote && !unfinished && shape(t.document) !== shown) fail(`closed and opened again, the page shows something else\n    before: ${shown}\n    after:  ${shape(t.document)}`);
    if (!agentWrote && undrafted().length > listedBefore) fail(`closed and opened again with no Agent, something is listed: ${JSON.stringify(readLost(local, "demo"))}`);
    const kept = new Set([...fileWords(), ...listed()]);
    const missing = [...words].filter((word) => !kept.has(word) && !agentRemoved.has(word) && !rolledBack.has(word));
    if (missing.length > 0) fail(`closed and opened again, words gone: ${missing.join(" ")}`);
  }

  // The live-reload channel announces a write of the file a little later, to the page open then, in
  // the order of the writes.
  const announce = () => {
    const version = hashOf(net.file);
    const target = t;
    setTimeout(() => target?.autosave.heard(version), 40);
  };

  // The Agent writes the file: one of its paragraphs (outside the header) changed by `change`.
  const agentEdit = (roll, change) => {
    const found = [...net.file.matchAll(/\n[ \t]*<p\b[^>]*>([^<]*)<\/p>/g)];
    if (found.length === 0) return;
    const hit = pick(found, roll);
    const next = change(hit);
    for (const word of markers(hit[0])) if (!next.includes(word)) agentRemoved.add(word);
    // A paragraph deleted: the reader's words the page shows in it go with it too (ones a write
    // back took out of the file first; the page has nothing left in the file to put them back to).
    if (next === "") {
      const bare = (text) => text.replace(/〔m\d+〕/g, "").replace(/\s+/g, "");
      for (const host of hosts()) if (bare(host.textContent) === bare(hit[1])) for (const word of markers(host.textContent)) agentRemoved.add(word);
    }
    net.file = net.file.slice(0, hit.index) + next + net.file.slice(hit.index + hit[0].length);
    agentWrote = true;
    announce();
  };

  async function perform({ kind, a, b, text, from, to }) {
    switch (kind) {
      case "type": {
        const host = pick(hosts(), a);
        if (!host) return;
        const before = [...host.childNodes];
        const nested = [...host.children].find((child) => ["UL", "OL"].includes(child.tagName)) ?? null;
        host.insertBefore(t.document.createTextNode(` ${word(++serial)}`), nested);
        undo.push({ lists: [[host, before]], texts: [] });
        return t.change(false);
      }
      case "split": {
        const host = pick(hosts().filter((node) => can(node, "split") && node.firstChild?.nodeType === 3 && node.firstChild.data.length > 1), a);
        if (!host) return;
        return structural(() => {
          const range = t.document.createRange();
          // Anywhere but inside one of the reader's words.
          const { data } = host.firstChild;
          const inside = [...data.matchAll(/〔m\d+〕/g)].map((hit) => [hit.index, hit.index + hit[0].length]);
          const places = Array.from({ length: data.length - 1 }, (_, index) => index + 1).filter((at) => !inside.some(([from, to]) => at > from && at < to));
          range.setStart(host.firstChild, pick(places, b));
          splitBlock(host, range);
        });
      }
      case "merge": {
        const host = pick(hosts().filter((node) => can(node, "merge")), a);
        if (!host) return;
        return structural(() => Boolean(mergeWithPrevious(host)));
      }
      case "remove": {
        const unit = pick(units(), a);
        if (!unit) return;
        return structural(() => void removeUnit(unit));
      }
      case "convert": {
        const host = pick(hosts().filter((node) => convertible(node) && ["P", "H3"].includes(node.tagName)), a);
        if (!host) return;
        return structural(() => void convertBlock(host, host.tagName === "P" ? "heading3" : "paragraph"));
      }
      case "list": {
        const anchor = pick(units().filter((node) => accepts(node.parentElement.getAttribute("data-ge-box-kind"), "list")), a);
        if (!anchor) return;
        return structural(() => {
          const box = list(t.document, anchor.parentElement, [word(++serial), ...(b < 0.5 ? [word(++serial)] : [])]);
          anchor.after(box);
        });
      }
      case "section": {
        const section = pick([...main().querySelectorAll(":scope > section.doc-section")], a);
        if (!section) return;
        return structural(() => {
          sectionAfter(section).focus.textContent = word(++serial);
        });
      }
      case "dissolve": {
        const section = pick([...main().querySelectorAll("section.doc-section")].filter((node) => unwrapCheck(node) === ""), a);
        if (!section) return;
        return structural(() => void unwrapSection(section));
      }
      case "indent":
      case "outdent": {
        const delta = kind === "indent" ? 1 : -1;
        const item = pick([...main().querySelectorAll("li")].filter((node) => canNest(node, delta)), a);
        if (!item) return;
        return structural(() => Boolean((kind === "indent" ? indentItem : outdentItem)(item).focus));
      }
      case "retag": {
        const box = pick([...main().querySelectorAll("ul, ol")].filter((node) => containerTargets(node).some((type) => type === "bullets" || type === "numbers")), a);
        if (!box) return;
        return structural(() => Boolean(convertContainer(box, containerType(box) === "bullets" ? "numbers" : "bullets").focus));
      }
      case "bullet": {
        const host = pick(hosts().filter((node) => node.tagName === "P" && targetsOf(node).includes("bullets")), a);
        if (!host) return;
        return structural(() => void convertBlock(host, b < 0.5 ? "bullets" : "numbers"));
      }
      case "flatten": {
        const box = pick([...main().querySelectorAll("ul, ol, blockquote")].filter((node) => containerTargets(node).includes("paragraph")), a);
        if (!box) return;
        return structural(() => void convertContainer(box, "paragraph"));
      }
      case "wrap": {
        const first = pick(units().filter((node) => node.parentElement === main()), a);
        if (!first) return;
        const run = [first];
        for (let next = first.nextElementSibling; next && run.length < 1 + Math.floor(b * 3); next = next.nextElementSibling) if (units().includes(next)) run.push(next);
        if (wrapCheck(run) !== "") return;
        return structural(() => void wrapSection(run));
      }
      case "move": {
        const unit = pick(units().filter((node) => node.previousElementSibling && units().includes(node.previousElementSibling)), a);
        if (!unit) return;
        return structural(() => void unit.parentElement.insertBefore(unit, unit.previousElementSibling));
      }
      case "undo": {
        const last = undo.pop();
        if (!last) return;
        restore(last);
        return t.change(true);
      }
      case "wait":
        return advance(Math.floor(a * 2500));
      case "lose":
      case "busy":
      case "offline":
        net.mode = kind;
        net.once = true;
        return;
      case "hold":
        if (!release) net.gate = new Promise((resolve) => (release = resolve));
        return;
      case "release":
        release?.();
        release = null;
        net.gate = null;
        return;
      case "close":
        return reopen(true, true);
      case "crash":
        return reopen(false, false);
      case "rollback": {
        // The Agent writes the file it read when the page opened (all it did since gone): what the
        // page committed since is put back, which the page asks about before it shows that write.
        if (!openedWith || net.file === openedWith) return;
        for (const word of fileWords()) if (!markers(openedWith).has(word)) rolledBack.add(word);
        net.file = openedWith;
        agentWrote = true;
        return announce();
      }
      case "nearby": {
        // A block made on the page that the file refused, put where the file surely takes it (as the
        // card's 放到附近 does, editor.mjs): after the block it stands in, in the page's own flow.
        const entry = [...t.commits.issues.values()].find((issue) => issue.kind === "insert" && issue.element?.isConnected);
        if (!entry) return;
        return structural(() => {
          const block = entry.element;
          let top = block;
          while (top.parentElement && top.parentElement !== main()) top = top.parentElement;
          if (top === block) main().append(block);
          else top.after(block);
          t.commits.resolve(entry.key, "retry");
        });
      }
      case "removeAt": {
        // The reader deletes the block (the innermost unit) with these words.
        const unit = units().filter((node) => node.textContent.includes(text)).sort((x, y) => x.textContent.length - y.textContent.length)[0];
        if (!unit) return fail(`no block with "${text}" to delete`);
        return structural(() => void removeUnit(unit));
      }
      case "typeAt": {
        const host = hosts().find((node) => node.textContent.includes(text));
        if (!host) return fail(`no block with "${text}" to type in`);
        host.insertBefore(t.document.createTextNode(` ${word(++serial)}`), null);
        undo.push({ lists: [[host, [...host.childNodes].slice(0, -1)]], texts: [] });
        return t.change(false);
      }
      case "agentWrite": {
        // The Agent replaces some text of the file (a scripted session: what a seed would have to be lucky to do).
        if (!net.file.includes(from)) return fail(`the file has no "${from}" for the Agent to change`);
        net.file = net.file.replace(from, to);
        agentWrote = true;
        return announce();
      }
      case "reword":
        return agentEdit(a, (hit) => hit[0].replace(/<\/p>$/, "（AI 改）</p>"));
      case "delete":
        return agentEdit(a, () => "");
      case "add":
        return agentEdit(a, (hit) => `${hit[0]}\n    <p>AI 加的段落。</p>`);
    }
  }

  play();
  try {
    await reopen(false, false);
    for (const [index, op] of ops.entries()) {
      trace?.push(`${index}. ${op.kind}`);
      try {
        await perform(op);
        await advance(0);
      } catch (error) {
        fail(`step ${op.kind} threw: ${error.stack ?? error.message}`);
      }
      if (t.failures.length > 0) fail(`autosave stopped: ${t.failures.join(", ")}`);
      checkIdentities();
      if (!agentWrote && t.conflicts.length > 0) fail(`a conflict with no Agent: ${JSON.stringify(t.conflicts.map(({ element, ...conflict }) => conflict))}`);
      if (!agentWrote && t.autosave.state.foreign) fail("someone else's write seen with no Agent (its own write taken for another's)");
      if (reloadAsked) {
        reloadAsked = false;
        const gone = [...pageWords()].filter((word) => !fileWords().has(word) && !agentRemoved.has(word));
        if (gone.length > 0) fail(`the page reloaded by itself over words not in the file: ${gone.join(" ")}`);
        await reopen(false, false);
      }
      trace?.push(`     page: ${shape(t.document)}`);
      if (problem) return { problem, at: index };
    }
    // Every answer comes, and time passes.
    release?.();
    release = null;
    net.gate = null;
    net.mode = "deliver";
    net.once = false;
    for (let round = 0; round < 8; round++) {
      await advance(5000);
      if (reloadAsked) {
        reloadAsked = false;
        await reopen(false, false);
      }
    }
    if (!agentWrote) {
      if (t.conflicts.length > 0) fail(`a conflict with no Agent: ${JSON.stringify(t.conflicts.map(({ element, ...conflict }) => conflict))}`);
      if (!rebuilt && undrafted().length > 0) fail(`with no Agent, something is listed: ${JSON.stringify(readLost(local, "demo"))}`);
      const onPage = shape(t.document);
      const inFile = shape(new JSDOM(net.file).window.document);
      if (t.autosave.state.drafts === 0 && onPage !== inFile) fail(`the file differs from the page\n    page: ${onPage}\n    file: ${inFile}`);
    } else {
      const kept = new Set([...fileWords(), ...held(), ...drafts(), ...listed()]);
      const missing = [...pageWords()].filter((word) => !kept.has(word) && !agentRemoved.has(word));
      if (missing.length > 0) fail(`words on the page in neither the file, a conflict, a block not finished, nor the list: ${missing.join(" ")}
    page: ${shape(t.document)}
    file: ${shape(new JSDOM(net.file).window.document)}`);
    }
    const unmet = !problem && expect ? expect({ file: net.file, page: shape(t.document), conflicts: t.conflicts.map(({ element, ...conflict }) => conflict) }) : null;
    if (unmet) fail(unmet);
    return problem ? { problem, at: ops.length } : null;
  } finally {
    t?.autosave.close();
    browser.onReload = null;
    stop();
  }
}

/** Cut a failing session down to the steps it needs (one by one, while it still fails). */
export async function shrink(ops) {
  let current = ops;
  for (let changed = true; changed;) {
    changed = false;
    for (let index = current.length - 1; index >= 0; index--) {
      const fewer = [...current.slice(0, index), ...current.slice(index + 1)];
      if (await session(fewer)) {
        current = fewer;
        changed = true;
      }
    }
  }
  return current;
}

/** Seeds first..first+count-1: the failures, each cut down. */
export async function check(first, count, length = 40) {
  const failed = [];
  for (let seed = first; seed < first + count; seed++) {
    const ops = steps(seed, length);
    const result = await session(ops);
    if (!result) continue;
    const small = await shrink(ops.slice(0, result.at + 1));
    const trace = [];
    const again = await session(small, { trace });
    failed.push({ seed, problem: (again ?? result).problem, steps: small.map((op) => `${op.kind}(${op.a.toFixed(3)},${op.b.toFixed(3)})`), trace });
  }
  return failed;
}

// Scripted sessions: what a seed would have to be lucky to do. Each is one session of steps on a
// report of its own, and what the file and the page hold at the end (`expect`: a problem or null).
const LIST = page(`  <section class="doc-section" aria-labelledby="a">
    <h2 id="a">第一章</h2>
    <p>甲段落，写的是开头。</p>
    <ul>
      <li>唯一一项</li>
    </ul>
  </section>
`);
const SHEETS = page(`  <section class="doc-sheet-shell" data-doc-sheets="demo" aria-label="选项卡">
    <div class="doc-sheet-tabs" aria-label="选项卡"><button class="doc-sheet-tab" type="button" data-sheet-tab="a">甲页</button><button class="doc-sheet-tab" type="button" data-sheet-tab="b">乙页</button></div>
    <div data-doc-sheet="a">
      <p>甲页的第一段。</p>
    </div>
    <div data-doc-sheet="b">
      <p>乙页的段落。</p>
    </div>
  </section>
`);
export const SCENARIOS = [
  {
    // The reader deletes a list's only item while the Agent adds one: the reader's goes, the Agent's stays, and the
    // page and the file say the same (the list went as "applied" while the reader's item stayed in the file).
    name: "a list deleted while the Agent adds an item",
    start: LIST,
    ops: [{ kind: "agentWrite", from: "<li>唯一一项</li>", to: "<li>唯一一项</li>\n      <li>AI 加的</li>" }, { kind: "removeAt", text: "唯一一项" }, { kind: "wait", a: 1 }, { kind: "wait", a: 1 }],
    expect: ({ file, conflicts }) => (!file.includes("<li>AI 加的</li>") ? "the Agent's item is gone from the file"
      : file.includes("唯一一项") ? "the reader's item is still in the file, though the page deleted it"
        : conflicts.length > 0 ? `a conflict for the reader: ${JSON.stringify(conflicts)}` : null),
  },
  {
    // The reader deletes a Sheet tab while the Agent changes its panel: tab and panel stay, the reader is asked.
    name: "a Sheet tab deleted while the Agent changes its panel",
    start: SHEETS,
    ops: [{ kind: "agentWrite", from: "甲页的第一段。", to: "甲页的第一段（AI 改）。" }, { kind: "removeAt", text: "甲页" }, { kind: "wait", a: 1 }, { kind: "wait", a: 1 }],
    expect: ({ file, conflicts }) => (!file.includes("甲页的第一段（AI 改）。") || !file.includes('data-sheet-tab="a"') ? "the tab or its panel the Agent changed was deleted without asking"
      : !conflicts.some((conflict) => conflict.kind === "unit" && conflict.reason === "changed") ? `the reader is not asked: ${JSON.stringify(conflicts)}` : null),
  },
  {
    // The same tab deleted with no Agent in between: what the reader changed in its panel is in the page's hash of it.
    name: "a Sheet tab deleted after its panel was edited",
    start: SHEETS,
    ops: [{ kind: "typeAt", text: "甲页的第一段" }, { kind: "wait", a: 1 }, { kind: "removeAt", text: "甲页" }, { kind: "wait", a: 1 }, { kind: "wait", a: 1 }],
    expect: ({ file }) => (file.includes("甲页") ? "the tab is still in the file" : !file.includes("乙页的段落。") ? "the other tab went too" : null),
  },
];

/** The scripted sessions: the failures, each with its trace. */
export async function checkScenarios() {
  const failed = [];
  for (const { name, start, ops, expect } of SCENARIOS) {
    const trace = [];
    const result = await session(ops, { trace, start, expect });
    if (result) failed.push({ seed: name, problem: result.problem, steps: ops.map((op) => op.kind), trace });
  }
  return failed;
}

const report = (failed) => failed.map(({ seed, problem, steps: small, trace }) => `seed ${seed}: ${problem}\n  steps: ${small.join(" · ")}\n${trace.join("\n")}`).join("\n");

// Run on its own: seeds first..first+count-1. Run by kit:check (tests/unit/run.mjs): the first 30.
/** Steps as a report prints them ("remove(0.201,0.859) · busy(0.123,0.696) · …"). */
export const parseSteps = (text) => text.split("·").map((step) => step.trim().match(/^(\w+)\(([\d.]+),([\d.]+)\)$/)).filter(Boolean).map(([, kind, a, b]) => ({ kind, a: Number(a), b: Number(b) }));

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv[2] === "--steps") {
  // One session of the steps given, traced.
  const trace = [];
  const result = await session(parseSteps(process.argv[3] ?? ""), { trace });
  console.log(trace.join("\n"));
  console.log(result ? `failed after step ${result.at}: ${result.problem}` : "every rule held");
  process.exitCode = result ? 1 : 0;
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [first = 1, count = 50, length = 40] = process.argv.slice(2).map(Number);
  const failed = [...(await checkScenarios()), ...(await check(first, count, length))];
  if (failed.length > 0) console.log(report(failed));
  console.log(failed.length === 0 ? `Checked ${SCENARIOS.length} scripted and ${count} model session(s) of ${length} steps: every rule held.` : `${failed.length} of ${SCENARIOS.length + count} failed: ${failed.map((entry) => entry.seed).join(", ")}`);
  process.exitCode = failed.length === 0 ? 0 : 1;
} else {
  const failed = [...(await checkScenarios()), ...(await check(1, 30, 40))];
  if (failed.length > 0) throw new Error(`model sessions failed:\n${report(failed)}`);
  console.log("Checked the model: the scripted sessions (a list or a Sheet tab deleted while the Agent changed what it holds, a tab deleted after its panel was edited) and 30 sessions of 40 steps, the reader's edits (typing, splits, merges, deletes, conversions, new lists and sections, moves, undo), the network's mishaps (answers lost, held, busy, the server unreachable), the Agent's writes, the page closed, crashed and reloaded, interleaved by the seed: nothing thrown, no conflict without an Agent, blocks made going as what they are, no reload over words not in the file, words kept across closing, and the file as the page in the end.");
}
