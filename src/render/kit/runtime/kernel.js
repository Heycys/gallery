// The kit's runtime (DocKit; docs/render.md, "Runtime"): every component instance on the page,
// from when it is found until it leaves the page. A component registers what it does
// (DocKit.component); where its instances are and what it leaves on the page are its
// description's (src/shared/components/). The kernel
//
//   - finds instances when the component registers (`when: "now"`) or once the page has loaded
//     ("ready", after the report's own script), and those added later (pasted, put back by an
//     undo) unless the component starts only with the page (`added: false`: what the editor adds
//     later is the editor's);
//   - keeps one instance per host;
//   - starts nothing in the own region of an instance of a component package, or on one, but that
//     package's own: what stands there is its component's (src/shared/components/installed.mjs
//     heldBy); in its slots (data-doc-slot), which hold the document's blocks, all goes on as anywhere
//     on the page, another instance among them; one of no package it marks, the controls of its own
//     region made inert, what its scripts of data hold drawn (shown-data.js), and says so to who writes
//     the page, its look being the kit's;
//   - gives a package's component a context of its own (its parts, its JSON and its tables' rows, its
//     state, its timers and listeners that end with it, where it is and its card's size on a custom
//     page, what it may write: context.edit asks whoever said the page takes edits, doc-editable, by
//     an event it answers at once, and writes nothing itself; what it reaches of the web, a block whose
//     needs name a host of the net: context.fetch, asked of the server, net.js, which starts its
//     instances again as the reader's consent to it changes; and, for a block whose needs hold
//     "tables", the table of the document it is a view of, whose changes it asks of the page editor
//     the same way, doc-table-intent), keeps what it runs as the kit calls it
//     out of its slots (a change there put back, and the instance failed), and
//     starts each instance from what the file says, what an earlier mount drew taken off first, so
//     that a mount on a node an undo put back, or after dehydrate, is the same mount; a package's
//     component that throws is that instance's failure alone: it shows as one of no package does,
//     and the rest of the page goes on; one whose script came with the page and started nothing shows
//     so too, once the page has loaded;
//   - tells an instance what it asked to hear (`on`): its width changed (resize), the theme
//     (theme), a card's size (layout, from the editor), the window (viewport), the fonts (fonts, with
//     the faces a later load brought in), its content (content, with the records; { quiet: true } for
//     a change that leaves the page looking as it was: quietly), what the file says of it (source,
//     with the records, a frame's in one notice: a change in a part its description edits as text or
//     data, whoever made it, or in one of its slots, the document's blocks, an attribute that says
//     something of the file among them, but none an instance there draws; none of quietly's, which
//     change no word), an element around it shown or hidden (reveal), that its context can write from
//     now on (editable), the clock's minute or day (clock), and the workspace's data or the rows of the
//     table it is a view of (data, "table" its detail for these);
//   - draws in one frame what instances ask to draw (context.frame), each failure kept to its
//     instance: told on the console, and in the preview next to the instance;
//   - destroys an instance once its host has left the page (a move within it is no leaving): its
//     listeners on context.signal go with it;
//   - takes what instances left off an export of the current view (dehydrate);
//   - says when the page is drawn: html[data-doc-drawn] once the page has loaded, the fonts are in
//     and nothing waits for a frame of drawing any more (what a chart's drawing moved is settled),
//     what draws in every frame being no drawing to wait for.
//
// One MutationObserver watches the page for all components, one ResizeObserver their hosts. What
// a component draws into a host it owns (`owns`: a chart's SVG, a package's instance but for its
// slots) is not watched. The tables a key names have a watcher of their own (table-reading.js
// createKeyedTables, DocKit.tables), for every chart drawn from one and every view of one.

import { ARRIVING, ATTRIBUTE, CONTROLS, CONTROL_MARK, DATA_SHOWN, FALLBACK, HOLDER, INSTANCE, NOTE, PACKAGE_ID, SCHEMA, SLOT, SLOT_PART, componentAt, heldBy, heldWithin, isDataScript, schemaAhead, slotsIn } from "../../../shared/components/installed.mjs";
import { CARD, CARD_ID, PAGE, drawnCells } from "../../../shared/card-size.mjs";
import { SOURCE_ATTRIBUTES, lookChanged } from "../../../shared/component-source.mjs";
import { jsonIn } from "../../../shared/json-layout.mjs";
import { VIEW_FROM } from "../../../shared/table-chart.mjs";
import { netHostsOf } from "../../../shared/net-policy.mjs";
import { createNet } from "./net.js";
import { namedIn, rowSet, tableOf } from "./rows.js";
import { createKeyedTables } from "./table-reading.js";
import { drawData } from "./shown-data.js";
import { workspaceOf } from "./workspace.js";
import { sayRuntime as say } from "../words.js";
import { kitLanguage } from "../words.js";

export function createKit({ descriptions }) {
  const global = globalThis;
  const defs = new Map(); // id -> registration
  const instances = new Map(); // host -> { def, handle, context, controller, width, note, failed }
  const counters = { mounted: 0, destroyed: 0, failed: 0 };
  // The tables of the page a key names, read for the charts drawn from them and the views of them (DocKit.tables).
  const tables = createKeyedTables();
  // The preview shows a failure next to its instance; an exported file (its generator or its
  // export id says so) only tells the console. The generator is Gallery's, or, in an export made
  // before the rename, HTML Report Studio's (GENERATORS, src/shared/export-wrap.mjs).
  const preview = () => !document.querySelector('meta[name="generator"][content="Gallery"], meta[name="generator"][content="HTML Report Studio"], meta[name="doc-export-id"]');
  // A note is for who writes the page: a preview that is no presentation.
  const writing = () => preview() && !new URLSearchParams(location.search).has("present");

  const selectorOf = (def) => def.selector ?? descriptions.get(def.id)?.match;
  const ofPackage = (def) => PACKAGE_ID.test(def.id);
  // A component of the kit's own whose drawing writes parts of its host (a database: its JSON and its
  // table), which its context reads and asks to write as a package's does (packageContext).
  const writesData = (def) => !ofPackage(def) && Object.values(descriptions.get(def.id)?.parts ?? {}).some((part) => part.edit === "data");
  const listening = (signal) => [...instances.entries()].filter(([, instance]) => instance.def.on?.includes(signal));
  let owned = ""; // the hosts whose content is the kit's drawing

  function logged(id, error) {
    counters.failed += 1;
    console.error(`[DocKit] ${id}:`, error);
  }
  function report(def, host, error) {
    logged(def.id, error);
    const instance = instances.get(host);
    if (instance && ofPackage(def)) giveUp(instance, host);
    if (!writing() || !host?.isConnected) return;
    const note = instance?.note ?? document.createElement("div");
    note.className = "doc-kit-error";
    note.setAttribute("data-doc-dev", "");
    note.setAttribute("role", "alert");
    note.textContent = `${def.id}: ${error?.message ?? error}`;
    if (!note.isConnected) host.after(note);
    if (instance) instance.note = note;
  }
  function clearNote(instance) {
    instance.note?.remove();
    instance.note = null;
  }

  // ---------- one frame for every instance's drawing ----------
  // What the file says of an instance (`source`) is told in the frame too, first, all its changes since
  // the last frame in one notice, so that what it asks to draw as it hears them draws in that frame.
  const queued = new Map(); // host -> work
  const toHear = new Map(); // host -> the records of `source` it has yet to hear
  let frame = 0;
  let asked = 0; // frames in a row whose drawing asked for the next
  function runFrame() {
    frame = 0;
    const told = [...toHear];
    toHear.clear();
    for (const [host, records] of told) tell(host, "source", records);
    const work = [...queued];
    queued.clear();
    for (const [host, run] of work) {
      const instance = instances.get(host);
      if (!instance) continue;
      try {
        guarded(instance, host, run, "drew in a frame");
        clearNote(instance);
      } catch (error) {
        report(instance.def, host, error);
      }
    }
    asked = queued.size > 0 ? asked + 1 : 0;
    settle();
  }
  const ask = () => {
    if (!frame) frame = requestAnimationFrame(runFrame);
  };
  function schedule(host, run) {
    if (instances.get(host)?.failed) return;
    queued.set(host, run);
    ask();
  }
  function hearLater(host, records) {
    const pending = toHear.get(host);
    if (pending) pending.push(...records);
    else toHear.set(host, records);
    ask();
  }

  // ---------- a slot is the document's ----------
  // What a package's component runs as the kit calls it (its mount, not the dehydrate the kit runs before
  // it, an update, a frame's drawing, its timers) is watched in its instance, when it has slots: a change it made in one, or a slot it took
  // off or moved, is put back, every change of that call with it, in the order back, and the instance
  // fails, as for a write it may not make. What it does later, from a listener or a promise, no call
  // of the kit's holds: that the page editor puts back a slot taken off (installed/page.mjs keepSlots),
  // and gallery block check looks for the rest.
  const GUARD = { childList: true, subtree: true, characterData: true, characterDataOldValue: true, attributes: true, attributeOldValue: true };
  function guarded(instance, host, run, when) {
    const slots = ofPackage(instance.def) ? slotsIn(host) : [];
    if (slots.length === 0) return run();
    const guard = new MutationObserver(() => {});
    guard.observe(host, GUARD);
    let result;
    let failure = null;
    try {
      result = run();
    } catch (error) {
      failure = error;
    }
    const records = guard.takeRecords();
    guard.disconnect();
    const touches = (slot) => records.some((record) => slot.contains(record.target) || (record.type === "childList" && [...record.addedNodes, ...record.removedNodes].some((node) => node === slot || node.contains?.(slot))));
    const slot = slots.find(touches);
    if (!slot) {
      if (failure) throw failure;
      return result;
    }
    putBack(records);
    throw Object.assign(new Error(`it wrote in its slot "${slot.getAttribute(SLOT)}" as it ${when}, which is put back: a slot holds the document's blocks, the reader's; read it with context.part, and draw outside it`), { made: result });
  }
  // The changes `records` say, undone, the last first.
  function putBack(records) {
    for (const record of [...records].reverse()) {
      const { target } = record;
      if (record.type === "characterData") target.data = record.oldValue ?? "";
      else if (record.type === "attributes") {
        if (record.oldValue === null) target.removeAttributeNS(record.attributeNamespace, record.attributeName);
        else target.setAttributeNS(record.attributeNamespace, record.attributeName, record.oldValue);
      } else {
        for (const node of record.addedNodes) if (node.parentNode === target) target.removeChild(node);
        const next = record.nextSibling?.parentNode === target ? record.nextSibling : null;
        for (const node of record.removedNodes) target.insertBefore(node, next);
      }
    }
  }

  // ---------- the page is drawn ----------
  // Set once: the page has loaded (what starts with it has mounted), the fonts are in, and two frames
  // in a row found nothing queued. The resize observer answers a frame's drawing in that same frame
  // (after its callbacks), so what the drawing moved has asked for its own frame by the next frame's
  // callbacks: the second look is the one that sees it. What asks for the next frame from inside each
  // of its frames (ENDLESS of them in a row, half a second) is an animation, which never stops asking:
  // the page does not wait for it. The page editor waits for this to put the reader back where they
  // were (editor.mjs restoreView).
  const ENDLESS = 30;
  let drawn = false;
  let fontsIn = !document.fonts;
  const still = () => !drawn && (asked >= ENDLESS || (!frame && queued.size === 0));
  function settle() {
    if (drawn || !fontsIn || document.readyState === "loading") return;
    requestAnimationFrame(() => {
      if (!still()) return; // the frame that draws settles again
      requestAnimationFrame(() => {
        if (!still()) return;
        drawn = true;
        document.documentElement.setAttribute("data-doc-drawn", "");
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", settle, { once: true });
  else settle();
  document.fonts?.ready.then(() => {
    fontsIn = true;
    settle();
  });

  // ---------- signals ----------
  function tell(host, reason, detail, options) {
    const instance = instances.get(host);
    if (!instance?.handle?.update) return;
    try {
      guarded(instance, host, () => instance.handle.update(reason, detail, options), `heard ${reason}`);
    } catch (error) {
      report(instance.def, host, error);
    }
  }
  const tellAll = (signal, detail) => listening(signal).forEach(([host]) => tell(host, signal, detail));

  const resize = new ResizeObserver((entries) => {
    for (const { target, contentRect } of entries) {
      const instance = instances.get(target);
      if (!instance) continue;
      const width = Math.round(contentRect.width);
      if (width === instance.width) continue;
      instance.width = width;
      tell(target, "resize");
    }
  });
  global.addEventListener("doc-theme-change", () => tellAll("theme"));
  global.addEventListener("doc-layout-change", () => tellAll("layout"));
  // Whoever edits the page says so, once it is ready to take what a component writes: until then, and
  // for good where nothing does (an export, 演示视图, a page no editor runs on), no context can write.
  let editable = false;
  global.addEventListener("doc-editable", () => {
    editable = true;
    tellAll("editable");
  });
  global.addEventListener("resize", () => tellAll("viewport"));
  // The fonts: all of them once they are in (no detail), then the faces each later load brought in
  // (detail: FontFace each), so that what measured its text in other fonts need not measure it again.
  document.fonts?.ready.then(() => tellAll("fonts"));
  document.fonts?.addEventListener?.("loadingdone", (event) => tellAll("fonts", [...(event.fontfaces ?? [])]));
  // What a block read of the workspace changed (`data`, its kind the detail): sent by the page's live script
  // as the server says it ("data <kind>": src/workbench/index.mjs), heard by every instance that asked and
  // has read that kind (context.workspace.query: `kinds`, workspace.js).
  global.addEventListener("doc-workspace-change", (event) => listening("data").forEach(([host, instance]) => {
    if (instance.kinds?.has(event.detail)) tell(host, "data", event.detail);
  }));

  // The clock: one timer for every instance that asked (`clock`), at each whole minute of the reader's
  // clock, the detail "minute", or "day" at the first minute of another day (midnight, or the first a
  // page that slept wakes to). It runs while one listens: armed as one starts, and not again once a
  // minute comes that none hears.
  let clockTimer = 0;
  let today = null;
  function armClock() {
    if (clockTimer || listening("clock").length === 0) return;
    const now = new Date();
    today ??= now.toDateString();
    clockTimer = global.setTimeout(tick, 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 5);
  }
  function tick() {
    clockTimer = 0;
    const day = new Date().toDateString();
    const detail = day === today ? "minute" : "day";
    today = day;
    tellAll("clock", detail);
    armClock();
  }

  // ---------- what a package's instance is given ----------
  // Whether an element is of an instance's own region: none of what an instance in it holds, nor of what its slots hold.
  const ownedBy = (node, host) => node.parentElement.closest(INSTANCE) === host && heldBy(node) === host;
  // A part's elements in an instance: of its own region, no instance itself. A part edited as flow is
  // its slot, the element and no more (what it holds is the document's); no other part is a slot. In
  // the host of a component of the kit's (writesData), its own, in the region it stands in; in a database
  // (a holder: installed.mjs HOLDER), of its own region, none of its records' bodies.
  const partsIn = (host, at, edit = null) => [...host.querySelectorAll(at)].filter((node) => !node.matches(INSTANCE)
    && (host.matches(INSTANCE) ? ownedBy(node, host) : host.matches(HOLDER) ? heldBy(node) === host : heldBy(node) === heldBy(host)) && (edit === "flow") === node.matches(SLOT_PART));
  // Where an instance is (context.place): on a custom page (its host's markup, card-size.mjs PAGE, which
  // the page's host serves), in an exported file (its generator or its export id says so), else in a
  // document as Gallery shows it.
  const placeOf = (host) => (host.closest(PAGE) ? "page" : preview() ? "document" : "export");

  // What names an instance's reading state among its package's (context.state): on a custom page its
  // card's id; in a document its block id; in a file none was given yet, a hash of its markup, what
  // its parts hold left out (so that an edit of its words keeps it), and its place among the package's
  // instances of that hash, so that moving one past another of other markup changes neither. An
  // instance given a block id takes the state its hash's name held (DocState's formerId), once.
  const HASHED_OUT = /^(?:data-block-id|data-ge-.*|contenteditable|spellcheck|data-doc-fallback.*|inert)$/;
  const hashes = new WeakMap(); // a host -> the hash of its markup, made once
  function markupHash(def, host) {
    if (hashes.has(host)) return hashes.get(host);
    const copy = host.cloneNode(true);
    try {
      def.dehydrate?.(copy);
    } catch {}
    takeRuntime(descriptions.get(def.id), copy);
    for (const { at, edit } of Object.values(descriptions.get(def.id)?.parts ?? {})) {
      if (edit === "text" || edit === "data" || edit === "flow") partsIn(copy, at, edit).forEach((node) => node.replaceChildren());
    }
    const attributes = (node) => [...node.attributes].filter(({ name }) => !HASHED_OUT.test(name)).map(({ name, value }) => ` ${name}="${value}"`).sort().join("");
    const shape = (node) => `<${node.localName}${attributes(node)}>${[...node.children].filter((child) => !child.matches(`[data-doc-dev], .${NOTE}, .${DATA_SHOWN}`)).map(shape).join("")}`;
    let hash = 0x811c9dc5;
    for (const char of shape(copy)) hash = Math.imul(hash ^ char.codePointAt(0), 0x01000193);
    const made = (hash >>> 0).toString(36);
    hashes.set(host, made);
    return made;
  }
  function stateName(def, host) {
    const card = placeOf(host) === "page" ? host.closest(CARD)?.getAttribute(CARD_ID) : null;
    if (card) return { id: `${def.id}:${card}` };
    const hashed = () => {
      const hash = markupHash(def, host);
      const alike = hostsIn(document, selectorOf(def)).filter((other) => !outsidePage(other) && !inOther(def, other) && markupHash(def, other) === hash);
      return `${def.id}:${hash}:${Math.max(0, alike.indexOf(host))}`;
    };
    const block = host.getAttribute("data-block-id");
    return block ? { id: `${def.id}:${block}`, formerId: hashed() } : { id: hashed() };
  }
  // The document's slug (its page's data-doc-id), which a link within it names.
  const ownSlug = () => document.querySelector(".doc-page")?.dataset.docId || null;

  // Whether an instance can write: the page takes edits, it has not failed, and it holds its content in
  // a shape its manifest reaches.
  const canEdit = (def, host) => editable && instances.get(host)?.failed === false && !schemaAhead(host.getAttribute(SCHEMA), descriptions.get(def.id)?.schema);
  // A part as its manifest says it, what `part` and `edit` take.
  const partNamed = (def, name) => {
    const part = descriptions.get(def.id)?.parts?.[name];
    if (!part) throw new Error(`no part "${name}" in ${def.id}'s manifest`);
    return part;
  };
  // What the kit adds to a package's context. `edit` is a function from the start and `canEdit` says
  // whether it can write: a component's script may run before an editor has come, or where none will.
  // An edit is a question put at once, by a cancelable event on the instance: whoever edits the page
  // cancels it to say it took the edit, handing `run` a draft of each part it names, by name. One edit
  // names one part, or several (a list of names), which the change is handed as one object and which are
  // one write. What the change throws, or a change that means to go on later, is told on the console,
  // and nothing has happened.
  function packageContext(def, host, instance) {
    const part = (name) => partsIn(host, partNamed(def, name).at, partNamed(def, name).edit)[0] ?? null;
    const place = placeOf(host);
    // What its manifest says it uses (`needs`, as the catalog tells the kit of it): the workspace's data.
    const needs = descriptions.get(def.id)?.needs ?? [];
    const ended = () => instances.get(host) !== instance || instance.failed;
    // A timer of the instance's: what it runs is the instance's as a frame's drawing is (its failure the
    // instance's, a write in a slot put back), nothing once the instance ended or failed, and cleared then.
    const timers = new Map(); // a timer's id -> how it is cleared, while it may still run
    const timer = (set, clear, run, ms, once) => {
      if (typeof run !== "function") throw new Error(`${def.id}: a timer runs a function`);
      const { signal } = instance.controller;
      if (signal.aborted) return 0;
      if (!timers.armed) {
        timers.armed = true;
        signal.addEventListener("abort", () => {
          for (const [id, clearIt] of timers) clearIt.call(global, id);
          timers.clear();
        }, { once: true });
      }
      const id = set.call(global, () => {
        if (once) timers.delete(id);
        if (ended()) return;
        try {
          guarded(instance, host, run, "ran a timer");
        } catch (error) {
          report(def, host, error);
        }
      }, ms);
      timers.set(id, clear);
      return id;
    };
    // What an edit asks of the page: the parts it names, by name, and `run`, its change handed a draft of
    // each; null where a part it names is not on the instance. A change of the table may carry one too
    // (tableView's `set`), the two one write.
    const asked = (names, change) => {
      const several = Array.isArray(names);
      const parts = (several ? names : [names]).map((name) => {
        const { at, edit } = partNamed(def, name);
        if (edit !== "data") throw new Error(`the part "${name}" of ${def.id} is not edited as data`);
        return { name, part: partsIn(host, at, edit)[0] };
      });
      const apart = parts.find(({ part }, index) => parts.some((other, at) => at !== index && part && other.part && (part === other.part || other.part.contains(part))));
      if (apart) throw new Error(`the part "${apart.name}" of ${def.id} is in another this edit names, or is it: name the one around it`);
      if (parts.length === 0 || parts.some(({ part }) => !part)) return null;
      const run = (drafts) => {
        try {
          if (typeof change(several ? drafts : drafts[names])?.then === "function") throw new Error(`a change of ${several ? names.map((name) => `"${name}"`).join(", ") : `"${names}"`} runs at once: context.edit does not wait for it`);
          return true;
        } catch (error) {
          logged(def.id, error);
          return false;
        }
      };
      return { parts, run };
    };
    // `options.merge` (the kit's own drawings: a database's words typed, each character a write) names the
    // gesture an edit is one write of, which the page editor folds into one step of undo (history.mjs sourceStep).
    const edit = (names, change, options) => {
      if (!canEdit(def, host)) return false;
      const detail = asked(names, change);
      if (detail && typeof options?.merge === "string") detail.merge = options.merge;
      return detail !== null && !host.dispatchEvent(new CustomEvent("doc-component-edit", { bubbles: true, cancelable: true, detail }));
    };
    // An edit of a part of JSON (a script of data): `change` is handed what it holds, parsed, and changes
    // it or returns what is to stand there instead; written back as it was laid out (json-layout.mjs
    // jsonIn), and not at all where it holds what it held.
    const jsonChange = (name, change) => (script) => {
      const text = script.textContent ?? "";
      let data;
      try {
        data = JSON.parse(text);
      } catch (error) {
        throw new Error(`its part "${name}" holds no JSON: ${error.message}`);
      }
      const result = change(data);
      if (typeof result?.then === "function") throw new Error(`a change of "${name}" runs at once: context.editJSON does not wait for it`);
      const next = result === undefined ? data : result;
      if (JSON.stringify(next) !== JSON.stringify(JSON.parse(text))) script.textContent = jsonIn(text, next);
    };
    // The write of its own parts a change of its table carries (`{ edit: [names, change] }` or `{ editJSON: [name,
    // change] }`, as context.edit and context.editJSON take them): what it asks of the page, or null.
    const carried = (also) => {
      if (Array.isArray(also?.edit)) return asked(also.edit[0], also.edit[1]);
      if (Array.isArray(also?.editJSON)) {
        if (typeof also.editJSON[0] !== "string") throw new Error(`${def.id}: editJSON names one part`);
        return asked(also.editJSON[0], jsonChange(also.editJSON[0], also.editJSON[1]));
      }
      throw new Error(`${def.id}: what a change of the table carries is { edit: [names, change] } or { editJSON: [name, change] }`);
    };
    return {
      part,
      state: ({ version, defaults, transientKeys }) => global.DocState.getOrCreate({ ...stateName(def, host), version, defaults, transientKeys }),
      canEdit: () => canEdit(def, host),
      edit,
      // A part's JSON, parsed (JSON's null too, as any value it holds); undefined where there is nothing
      // to read, which no JSON is: an optional part the instance does not hold, and one that holds no
      // JSON, which fails the instance (context.fail), as its data cannot be read.
      readJSON(name) {
        const node = part(name);
        if (!node) return undefined;
        try {
          return JSON.parse(node.textContent ?? "");
        } catch (error) {
          report(def, host, new Error(`its part "${name}" holds no JSON: ${error.message}`));
          return undefined;
        }
      },
      // An edit of a part of JSON (jsonChange).
      editJSON(name, change) {
        if (typeof name !== "string") throw new Error(`${def.id}: context.editJSON names one part`);
        return edit(name, jsonChange(name, change));
      },
      // The rows of the table a part is or holds (rows.js), each write of them one edit of that part.
      rows(name) {
        const table = tableOf(part(name));
        if (!table) return null;
        return rowSet(table, (change) => edit(name, (draft) => {
          const drafted = tableOf(draft);
          if (!drafted) throw new Error(`its part "${name}" holds no table`);
          change(drafted);
        }), ownSlug());
      },
      // The table of the document this instance is a view of (a block whose needs hold "tables": VIEW_FROM
      // names its key), read now: its rows as context.rows gives them, and what changes it, each asked of
      // the page editor (tableView).
      table: () => tableView(def, host, instance, place, carried),
      interval: (run, ms) => timer(global.setInterval, global.clearInterval, run, ms, false),
      timeout: (run, ms) => timer(global.setTimeout, global.clearTimeout, run, ms, true),
      // A listener that goes as the instance ends, or as the signal of its own options aborts.
      listen(target, type, run, options = {}) {
        const given = typeof options === "boolean" ? { capture: options } : { ...(options ?? {}) };
        const own = given.signal;
        if (own?.aborted || instance.controller.signal.aborted) return;
        target.addEventListener(type, run, { ...given, signal: instance.controller.signal });
        own?.addEventListener("abort", () => target.removeEventListener(type, run, { capture: Boolean(given.capture) }), { once: true });
      },
      place,
      // A block whose needs name a host of the net reaches it through the server (net.js), nothing else.
      ...(netHostsOf(descriptions.get(def.id)?.needs).length > 0 ? { fetch: net.fetchFor(def, host, place) } : {}),
      // Its card's size on a custom page, in the grid's cells (what the board draws it at, never the raw
      // attributes: card-size.mjs drawnCells) and in pixels, what its card holds inside its padding; null
      // anywhere else. The page says when it changes: `layout`.
      get size() {
        const card = place === "page" ? host.closest(CARD) : null;
        if (!card) return null;
        const style = global.getComputedStyle(card);
        const inner = (size, ...sides) => Math.max(0, Math.round(size - sides.reduce((sum, side) => sum + (parseFloat(style[side]) || 0), 0)));
        return { ...drawnCells(card), width: inner(card.clientWidth, "paddingLeft", "paddingRight"), height: inner(card.clientHeight, "paddingTop", "paddingBottom") };
      },
      // What it reads of the workspace, where its manifest's needs say "workspace" (workspace.js), and none elsewhere.
      ...(needs.includes("workspace") ? { workspace: workspaceOf({ id: def.id, place, kinds: (instance.kinds = new Set()) }) } : {}),
    };
  }

  // ---------- a view of a table ----------
  // A block whose needs hold "tables" may be a view of a table of the document (a task
  // board, a count): the instance names the table by the key its frame carries (VIEW_FROM, as a chart's
  // host does: shared/table-chart.mjs), and context.table() reads it as a chart does (table-reading.js,
  // in the file's order), null where it is none: on a custom page, which holds no table, with no key, no
  // table of it, or one with a cell spanning others. Its rows are what context.rows gives, and so are
  // add, move and remove, with set besides (one cell's words, or that cell of several rows: `rows`, a write
  // of the block's own parts with them: `edit`, what context.edit asks, the two one step: a board's group
  // renamed, its place in the order of its settings with it); none writes anything here: each is a
  // question put at once, a cancelable doc-table-intent on the instance, { table, op, row, rows, before, after,
  // cells: [[column, text]], edit } (the row elements, a column by its place in the header), which the page
  // editor cancels to say it made the change (page/table/views.mjs: one undo step, the table tools'
  // operations), false with no taker, where the context cannot write (an export, a presentation, one
  // that failed) and for a row no longer in the table. canEdit() asks the same with no change, `op`
  // "check", which the editor cancels where it would take an intent of this table now: false too for a
  // table its tools do not manage (a <tfoot>, rows of other lengths), so that a view shows it read-only
  // rather than finding out by a drop that does nothing. What the table says from then on it hears: the
  // listeners given subscribe, and `data` (detail "table") where its `on` asks, once a batch of
  // changes leaves its rows other than they were (the table typed in, a row added, moved or taken out,
  // its key or the table's changed), in the page editor and in an export alike.
  const tablesTold = new Set(); // the packages told that they read no table: their needs hold no "tables"
  const readsTables = (def) => descriptions.get(def.id)?.needs?.includes("tables") ?? false;
  // The instance followed as a view of its table, once anything listens: its listeners and the rows last told.
  function following(def, host, instance) {
    if (instance.view) return instance.view;
    const signature = () => {
      const key = host.getAttribute(VIEW_FROM);
      return key ? tables.signature(key, ownSlug()) : "none";
    };
    const view = { listeners: new Set(), told: signature() };
    instance.view = view;
    const unfollow = tables.follow(() => host.getAttribute(VIEW_FROM), () => {
      if (instances.get(host) !== instance || instance.failed) return;
      const now = signature();
      if (now === view.told) return;
      view.told = now;
      for (const listener of [...view.listeners]) {
        try {
          guarded(instance, host, listener, "heard its table");
        } catch (error) {
          report(def, host, error);
          return;
        }
      }
      if (def.on?.includes("data")) tell(host, "data", "table");
    });
    instance.controller.signal.addEventListener("abort", unfollow, { once: true });
    return view;
  }
  function tableView(def, host, instance, place, carried) {
    if (!readsTables(def)) {
      if (!tablesTold.has(def.id)) console.error(`[DocKit] ${def.id}: context.table() reads a table for a block whose manifest's needs hold "tables"`);
      tablesTold.add(def.id);
      return null;
    }
    const key = host.getAttribute(VIEW_FROM);
    const reading = place === "page" || !key ? null : tables.reading(key);
    if (!reading || reading.merged) return null;
    const { table } = reading;
    const columns = Object.freeze([...reading.names]);
    const rows = Object.freeze([...tables.rows(key, ownSlug())]);
    // A row of this set still in its table; a cell named by the header's place of its name (of two alike
    // the later, whose value the row holds).
    const live = (row) => rows.includes(row) && table.isConnected && table.contains(row.el);
    const cellsOf = (values) => Object.entries(namedIn(columns, values)).map(([name, text]) => [columns.lastIndexOf(name), String(text ?? "")]);
    // Asked in a document Gallery shows alone: an export's table is the reader's to read, whatever says it takes edits.
    const ask = (detail) => place === "document" && canEdit(def, host) && !host.dispatchEvent(new CustomEvent("doc-table-intent", { bubbles: true, cancelable: true, detail: { table, ...detail } }));
    return Object.freeze({
      columns,
      rows,
      canEdit: () => ask({ op: "check" }),
      set(row, column, text, also) {
        const cells = cellsOf({ [column]: text });
        const several = Array.isArray(row);
        const rows = several ? row : [row];
        if (rows.length === 0 || !rows.every(live)) return false;
        const edit = also === undefined ? null : carried(also);
        if (also !== undefined && edit === null) return false;
        return ask({ op: "set", ...(several ? { rows: rows.map((each) => each.el) } : { row: row.el }), cells, ...(edit ? { edit } : {}) });
      },
      add(values, at = {}) {
        const cells = cellsOf(values);
        if (at?.after && !live(at.after)) return false;
        return ask({ op: "add", after: at?.after?.el ?? null, cells });
      },
      move(row, to = {}) {
        const cells = to?.values ? cellsOf(to.values) : [];
        const target = to?.before ?? to?.after ?? null;
        if (!live(row) || (target && !live(target))) return false;
        return ask({ op: "move", row: row.el, before: to?.before?.el ?? null, after: to?.before ? null : to?.after?.el ?? null, cells });
      },
      remove: (row) => live(row) && ask({ op: "remove", row: row.el }),
      subscribe(listener) {
        if (typeof listener !== "function") throw new Error(`${def.id}: context.table().subscribe takes a function`);
        if (instances.get(host) !== instance || instance.controller.signal.aborted) return () => {};
        const { listeners } = following(def, host, instance);
        listeners.add(listener);
        return () => void listeners.delete(listener);
      },
    });
  }

  // What a package's component left in `root`: its description's generated nodes and its marks,
  // the selectors given the package's instances as their root by the catalog, in its own region (no
  // slot's blocks are its).
  function takeRuntime(description, root) {
    const { generated = [], attrs = {} } = description?.runtime ?? {};
    const own = (selector) => hostsIn(root, selector).filter((node) => node === root || heldBy(node) === root);
    for (const selector of generated) own(selector).forEach((node) => node.remove());
    for (const [selector, names] of Object.entries(attrs)) own(selector).forEach((node) => names.forEach((name) => node.removeAttribute(name)));
  }
  // What an instance holds from before this mount goes: its own drawing, and the kit's marks of one
  // shown as it stands, from before its package came or from a failure. A dehydrate that throws, as one
  // that takes for granted what a fresh host does not hold, is told: the runtime still comes off, and
  // the mount goes on.
  function clear(def, host) {
    try {
      def.dehydrate?.(host);
    } catch (error) {
      logged(def.id, error);
    }
    takeRuntime(descriptions.get(def.id), host);
    takeFallback(host);
  }
  // The kit's marks of one shown as it stands, its note and what it drew of its data.
  function takeFallback(host) {
    host.removeAttribute(FALLBACK);
    for (const control of host.querySelectorAll(`[${CONTROL_MARK}]`)) {
      control.removeAttribute("inert");
      control.removeAttribute(CONTROL_MARK);
    }
    host.querySelector(`:scope > .${NOTE}`)?.remove();
    dataShownIn(host).forEach((node) => node.remove());
  }
  // A package's component that threw is done with this instance, until the page is loaded again or
  // an undo puts another node in its place: it stays in `instances` as one failed, so that no scan
  // starts it again, and it shows what the file says, read-only, its drawing taken off.
  function giveUp(instance, host) {
    if (instance.failed) return;
    instance.failed = true;
    queued.delete(host);
    toHear.delete(host);
    resize.unobserve(host);
    instance.controller.abort();
    const { handle } = instance;
    instance.handle = null;
    takeBack(instance, host, handle);
  }
  function takeBack({ def }, host, handle) {
    // What it can take back it does; the failure said is the first one, whatever these do.
    for (const undo of [() => handle?.destroy?.(), () => def.dehydrate?.(host)]) {
      try {
        undo();
      } catch {}
    }
    takeRuntime(descriptions.get(def.id), host);
    showAsItStands(host);
  }

  // ---------- instances ----------
  function keep(def, host, make) {
    const controller = new AbortController();
    const instance = { def, handle: null, context: null, controller, width: -1, note: null, failed: false };
    instances.set(host, instance);
    const packaged = ofPackage(def);
    const context = {
      host,
      signal: controller.signal,
      frame: (run) => schedule(host, run),
      fail: (error) => report(def, host, error),
    };
    // A package's members as they are, a getter (size) a getter still; a component of the kit's that
    // writes parts of its host has them too (its parts, its state, what it may write).
    if (packaged || writesData(def)) Object.defineProperties(context, Object.getOwnPropertyDescriptors(packageContext(def, host, instance)));
    instance.context = context;
    let failure = null;
    let made = null;
    try {
      made = make(context, (run) => guarded(instance, host, run, "mounted"));
    } catch (error) {
      failure = error;
      // What a mount that wrote in its slot returned is ended with it.
      if (error?.made && typeof error.made.then !== "function") instance.handle = error.made;
    }
    if (packaged && (failure || instance.failed)) {
      const failedAsItRan = instance.failed; // by `context.fail`: it ended there, and what came after goes too
      if (failure) report(def, host, failure);
      if (failedAsItRan) takeBack(instance, host, made);
      return null;
    }
    if (packaged && typeof made?.then === "function") made = whenMade(made, instance, host, context);
    // A package's instance is kept whatever its mount returns: what it listens to goes by `signal`.
    instance.handle = made ?? (packaged ? {} : null);
    if (!instance.handle) {
      // Nothing to keep (a host the component leaves alone, or one that failed to start): it may
      // start when it is added again.
      controller.abort();
      if (instances.get(host) === instance) instances.delete(host);
      if (failure) report(def, host, failure);
      return null;
    }
    counters.mounted += 1;
    if (def.on?.includes("resize")) resize.observe(host);
    if (def.on?.includes("source")) watchSource();
    if (def.on?.includes("clock")) armClock();
    if (packaged && def.on?.includes("data") && readsTables(def)) following(def, host, instance);
    return instance.handle;
  }

  // A mount that is a promise: what it resolves to is the instance's from then on, what it rejects
  // with its failure, unless the instance has gone by then. Until then it has an empty handle, which
  // hears nothing: that the page took edits meanwhile it is told as it comes.
  function whenMade(promise, instance, host, context) {
    const current = () => instances.get(host) === instance && !instance.failed;
    const couldEdit = editable;
    promise.then((handle) => {
      if (!current()) return void handle?.destroy?.();
      instance.handle = handle ?? {};
      if (editable && !couldEdit && instance.def.on?.includes("editable")) tell(host, "editable");
    }, (error) => {
      if (current()) context.fail(error);
    }).catch((error) => logged(instance.def.id, error));
    return {};
  }

  function mount(def, host) {
    if (instances.has(host)) return instances.get(host).handle;
    // What `clear` takes off before the mount (its dehydrate, its runtime) is no write of the mount's:
    // only the mount itself is held to its slots, so that a dehydrate taking off what a write of before
    // left in one puts the slot as the file has it.
    return keep(def, host, (context, guard) => {
      if (ofPackage(def)) clear(def, host);
      return guard(() => def.mount(host, context));
    });
  }

  function destroy(host) {
    const instance = instances.get(host);
    if (!instance) return;
    net.forget(host);
    instances.delete(host);
    queued.delete(host);
    toHear.delete(host);
    counters.destroyed += 1;
    resize.unobserve(host);
    instance.controller.abort();
    clearNote(instance);
    try {
      instance.handle?.destroy?.();
    } catch (error) {
      report(instance.def, host, error);
    }
  }

  // An instance started again from what the file says, as a page loaded again would start it (net.js: the
  // reader's consent to what it fetches changed), whether it ran or had failed.
  function restart(host) {
    const instance = instances.get(host);
    if (!instance) return;
    destroy(host);
    if (host.isConnected) mount(instance.def, host);
  }
  const net = createNet({ restart, instances: () => [...instances].map(([host, { def }]) => [host, def]), describe: (id) => descriptions.get(id) });

  const hostsIn = (root, selector) => [...(root.matches?.(selector) ? [root] : []), ...(root.querySelectorAll?.(selector) ?? [])];
  const outsidePage = (node) => Boolean(node.closest?.("[data-doc-dev]"));
  // Whether `host` is an instance of another component than `def`, or stands in the own region of one
  // (heldBy: what a slot holds is the document's).
  const inOther = (def, host) => (host.matches(INSTANCE) && host.getAttribute(ATTRIBUTE) !== def.id) || (heldBy(host)?.getAttribute(ATTRIBUTE) ?? def.id) !== def.id;

  function scan(root, only, { later = false } = {}) {
    for (const def of only ? [only] : defs.values()) {
      if (!def.started || (later && def.added === false)) continue;
      for (const host of hostsIn(root, selectorOf(def))) if (!outsidePage(host) && !inOther(def, host)) mount(def, host);
    }
  }

  function component(def) {
    if (!def?.id || typeof def.mount !== "function") throw new Error("DocKit.component requires an id and a mount function.");
    if (def.on !== undefined && !Array.isArray(def.on)) throw new Error(`DocKit: "${def.id}": \`on\` is a list of signals.`);
    if (defs.has(def.id)) throw new Error(`DocKit: "${def.id}" is registered already.`);
    if (!selectorOf(def)) throw new Error(`DocKit: "${def.id}" has no description with a match (src/shared/components/).`);
    const registered = { ...def, owns: def.owns ?? ofPackage(def), started: false };
    defs.set(def.id, registered);
    if (registered.owns) owned = [...defs.values()].filter((entry) => entry.owns).map(selectorOf).join(", ");
    const start = () => {
      registered.started = true;
      scan(document, registered);
    };
    if (def.when === "now" || document.readyState !== "loading") start();
    else document.addEventListener("DOMContentLoaded", start, { once: true });
    return registered;
  }

  // An instance of no package, or of one that does not load, or of one whose script came with the page
  // and, the page loaded, had started nothing (no DocKit.component, an error before it, another id: its
  // description says it has one, `script`), shows what it holds as it stands: marked for the kit's look
  // (styles/installed.css), read-only, its controls inert (those not off already: what its writer
  // turned off stays so in a copy of the view), with a note for who writes the page, saying why, in a
  // preview that is no presentation. Of a package with no script, what it holds is all there is to it.
  // A script the page editor is bringing to the page (ARRIVING) has not had its turn yet: the editor
  // asks again once it has (DocKit.mount).
  function showAsItStands(host) {
    host.setAttribute(FALLBACK, "");
    for (const control of host.querySelectorAll(CONTROLS)) {
      if (control.hasAttribute("inert") || heldBy(control) !== host) continue; // a slot's are the document's
      control.setAttribute("inert", "");
      control.setAttribute(CONTROL_MARK, "");
    }
    showData(host);
  }
  // What each script of data of such an instance holds, drawn right after it (shown-data.js): no word
  // of it would be on the page, and what is no JSON is said to be none where the note would be. A
  // drawing of what the script still holds stays; any other goes, as one a node an undo put back
  // carries from before.
  const drawnFrom = new WeakMap(); // a drawing -> the text it was drawn from
  const dataShownIn = (host) => [...host.querySelectorAll(`.${DATA_SHOWN}`)].filter((node) => ownedBy(node, host));
  function showData(host) {
    const kept = new Set();
    for (const script of host.querySelectorAll("script")) {
      if (!ownedBy(script, host) || !isDataScript(script.localName, [...script.attributes])) continue;
      const next = script.nextElementSibling;
      if (next && drawnFrom.get(next) === script.textContent) {
        kept.add(next);
        continue;
      }
      const drawing = drawData(script, { writing: writing() });
      drawnFrom.set(drawing, script.textContent);
      script.after(drawing);
      kept.add(drawing);
    }
    for (const node of dataShownIn(host)) if (!kept.has(node)) node.remove();
  }
  const silent = new Set(); // the packages whose script started nothing, told on the console
  function fallback(root) {
    const loaded = document.readyState === "complete";
    for (const host of hostsIn(root, INSTANCE)) {
      const id = host.getAttribute(ATTRIBUTE);
      const told = descriptions.get(id);
      if (outsidePage(host) || heldBy(host) || defs.has(id) || [...document.querySelectorAll(`script[${ARRIVING}]`)].some((script) => script.getAttribute(ARRIVING) === id)) continue;
      if (told?.match && !(told.script && loaded)) {
        if (host.hasAttribute(FALLBACK)) takeFallback(host); // its package came after it
        continue;
      }
      showAsItStands(host);
      if (told?.match && !silent.has(id)) {
        silent.add(id);
        logged(id, new Error("its script ran and started no component: no DocKit.component call of this id"));
      }
      if (!writing() || host.querySelector(`:scope > .${NOTE}`)) continue;
      const note = document.createElement("div");
      note.className = NOTE;
      note.setAttribute("data-doc-dev", "");
      note.textContent = told?.problem ? say("component-broken", id, told.problem[kitLanguage()]) : say(told?.match ? "component-silent" : "component-missing", id);
      host.prepend(note);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => fallback(document), { once: true });
  else fallback(document);
  if (document.readyState !== "complete") global.addEventListener("load", () => fallback(document), { once: true });

  // The elements of an instance that hold what the file says of it: the parts its description edits as
  // text or data, and its slots, whose blocks are the document's.
  const sourceParts = (host, id) => Object.values(descriptions.get(id)?.parts ?? {})
    .filter(({ edit }) => edit === "text" || edit === "data" || edit === "flow").flatMap(({ at, edit }) => partsIn(host, at, edit));
  // Whether a change at `target` is in what a component owns (`owned`, a selector): in a chart's
  // drawing, say, or in the own region of a package's instance or a database, where its slots are none of it.
  const ownedHere = (target) => {
    const host = target.closest(owned);
    if (!host) return false;
    if (!host.matches(HOLDER)) return true;
    return target === host || (componentAt(target) && heldBy(target) === host);
  };
  // Whether a change in a part of `host` is one of what the file says: in its own region (a part's
  // words, a script of data), or among the blocks of a slot of its, or in a part of an instance those
  // blocks hold that the file says (its words, its data); never what such an instance draws, which it
  // makes and makes again (a clock), and which is nothing of the file's. An attribute stands where its
  // element stands; a change of what an element holds, where its children do.
  function ofTheFile(host, target, record) {
    const region = record.type === "attributes" ? heldBy(target) : heldWithin(target);
    if (region === null || region === host) return true;
    return sourceParts(region, region.getAttribute(ATTRIBUTE)).some((part) => part.contains(target));
  }
  // Whether an attribute's change says something of the file a part holds (SOURCE_ATTRIBUTES; a class
  // only where its look classes change).
  const ofSource = (record) => (record.attributeName === "class" ? lookChanged(record.oldValue, record.target.getAttribute("class")) : SOURCE_ATTRIBUTES.includes(record.attributeName));

  // ---------- the page ----------
  // Added hosts start; hosts that left the page are destroyed (checked once the batch is in, so a
  // node moved within the page in one go is never destroyed); content and visibility changes go to
  // the instances that asked for them, with `options` (quiet: changes made by quietly), and what the
  // file says to those that hear `source`, in the next frame.
  function changes(records, options) {
    if (!global.document?.defaultView) return; // the page is gone
    const changed = [];
    const revealed = new Set();
    const sourced = options?.quiet ? [] : listening("source");
    const written = []; // what those instances may hear of, in what they own too
    let removed = false;
    // An added node is looked in for hosts only when it holds one of a component that starts later,
    // or an instance.
    let later = null;
    for (const record of records) {
      const attribute = record.type === "attributes" ? record.attributeName : null;
      const reveals = attribute !== null && REVEALS.includes(attribute);
      if (attribute !== null && !reveals && (sourced.length === 0 || !ofSource(record))) continue;
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (!target || outsidePage(target)) continue;
      if (sourced.length > 0 && !reveals) written.push([target, record]);
      if (owned && ownedHere(target)) continue;
      if (attribute !== null) {
        if (reveals) revealed.add(target);
        continue;
      }
      if (record.removedNodes.length > 0) removed = true;
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1 || !node.isConnected || outsidePage(node)) continue;
        later ??= [...defs.values()].filter((def) => def.started && def.added !== false).map(selectorOf).concat(INSTANCE).join(", ");
        if (!(node.matches(later) || node.querySelector(later))) continue;
        scan(node, null, { later: true });
        fallback(node);
      }
      changed.push([target, record]);
    }
    if (removed) for (const host of [...instances.keys()]) if (!host.isConnected) destroy(host);
    // Each change goes to the hosts it is in: found from where it happened up, not by asking each
    // host whether it holds each change (a page the editor rebuilds makes thousands).
    const hosts = listening("content").map(([host]) => host);
    if (hosts.length > 0 && changed.length > 0) {
      const heard = new Map(hosts.map((host) => [host, []]));
      for (const [target, record] of changed) for (let node = target; node; node = node.parentElement) heard.get(node)?.push(record);
      for (const host of hosts) if (heard.get(host).length > 0) tell(host, "content", heard.get(host), options);
    }
    for (const [host, { def }] of sourced) {
      if (!instances.has(host) || written.length === 0) continue;
      const parts = sourceParts(host, def.id);
      const heard = written.filter(([target, record]) => parts.some((part) => part.contains(target)) && ofTheFile(host, target, record)).map(([, record]) => record);
      if (heard.length > 0) hearLater(host, heard);
    }
    for (const [host] of listening("reveal")) {
      for (const target of revealed) if (target.contains(host)) {
        tell(host, "reveal");
        break;
      }
    }
  }
  // The page watched: what it holds, and the attributes that show or hide (`reveal`); once an instance
  // hears `source`, the attributes that say something of the file too, with what they were, as a class
  // says it only by what it was and is.
  const REVEALS = ["hidden", "open"];
  const WATCHED = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: REVEALS };
  const observer = new MutationObserver((records) => changes(records));
  observer.observe(document.documentElement, WATCHED);
  let watchingSource = false;
  function watchSource() {
    if (watchingSource) return;
    watchingSource = true;
    observer.observe(document.documentElement, { ...WATCHED, attributeOldValue: true, attributeFilter: [...REVEALS, ...SOURCE_ATTRIBUTES, "class"] });
  }

  /**
   * Run `change`, a change of the page that leaves it looking as it was (the page editor rebuilding
   * its blocks from the file as it starts): what it changed goes to the instances at once, with
   * { quiet: true }, and so does what they change as they hear it (a table's sort controls put back).
   * A table lays itself out again once the page is idle, not in the next frame. Returns what `change` returns.
   */
  function quietly(change) {
    changes(observer.takeRecords()); // what came before, as it would have
    try {
      return change();
    } finally {
      for (let pass = 0, records; pass < 3 && (records = observer.takeRecords()).length > 0; pass++) changes(records, { quiet: true });
    }
  }

  // ---------- an export of the current view ----------
  // What the kit left on the page comes off the copy: what a component says in code (`dehydrate`),
  // then the nodes it generated and the marks it set (its description's runtime). The reading
  // state the kit shows (a Sheet chosen, the theme: runtime.state) stays; the copy's kit sets the
  // rest again. `root` may be a copy of the page or of one block, itself a host. A dehydrate that
  // throws fails its own host alone: its description's runtime still comes off.
  function dehydrate(root) {
    const all = (selector) => hostsIn(root, selector);
    for (const def of defs.values()) {
      if (!def.dehydrate) continue;
      for (const host of all(selectorOf(def))) {
        try {
          def.dehydrate(host);
        } catch (error) {
          report(def, host, error);
        }
      }
    }
    for (const [id, description] of descriptions) {
      const marks = description.runtime ?? {};
      // A package's marks are of its instances' own regions, none of what their slots hold.
      const of = (selector) => (PACKAGE_ID.test(id) ? all(selector).filter((node) => (node.matches(INSTANCE) ? node : heldBy(node))?.getAttribute(ATTRIBUTE) === id) : all(selector));
      for (const selector of marks.generated ?? []) of(selector).forEach((node) => node.remove());
      for (const [selector, names] of Object.entries(marks.attrs ?? {})) of(selector).forEach((node) => names.forEach((name) => node.removeAttribute(name)));
      for (const [selector, names] of Object.entries(marks.classes ?? {})) {
        all(selector).forEach((node) => {
          node.classList.remove(...names);
          if (node.classList.length === 0) node.removeAttribute("class");
        });
      }
      (marks.root?.attrs ?? []).forEach((name) => root.removeAttribute(name));
      (marks.root?.classes ?? []).forEach((name) => root.classList.remove(name));
      if (root.classList.length === 0) root.removeAttribute("class");
    }
    return root;
  }

  return Object.freeze({
    component,
    /** What the server says of a package (src/shared/component-catalog.mjs): where its instances are and its parts, before its component registers, or why it does not load (`problem`, { zh, en }). */
    describe: (told) => void descriptions.set(told.id, told),
    /** What was told of a package, or a component's own description: where its instances are and its parts; null when nothing was. */
    description: (id) => descriptions.get(id) ?? null,
    destroy,
    /** Start what a root holds now (a report's script added it), as if it had been added. */
    mount(root = document) {
      scan(root, null, { later: root !== document });
      fallback(root);
    },
    quietly,
    dehydrate,
    /** The tables of the page a key names, for the kit's charts drawn from a table and its views (table-reading.js createKeyedTables): the kit's own, no document's. */
    tables,
    /** The component on `host` makes its `example` of an edit, as gallery block check asks it. Whether it has one. */
    example(host) {
      const instance = instances.get(host);
      if (!instance?.def.example) return false;
      instance.def.example(host, instance.context);
      return true;
    },
    /** Counts for tests and the console: instances live (by component), mounted, destroyed, failed. */
    stats() {
      const live = {};
      for (const { def, failed } of instances.values()) if (!failed) live[def.id] = (live[def.id] ?? 0) + 1;
      return { ...counters, live, components: [...defs.keys()] };
    },
  });
}
