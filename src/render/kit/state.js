(function initDocState(global) {
  "use strict";

  const STATE_SCHEMA_VERSION = 1;
  const instances = new Map(); // <report>:<id>@<version> -> the state
  const shapes = new Map(); // the same -> the shape of its defaults

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function storageFor(key) {
    const owner = /^\/(~ws-[0-9a-f]{6})(?=\/|$)/.exec(global.location?.pathname ?? "")?.[1];
    if (owner) key = `gallery-project:${owner}:${key}`;
    return {
      key,
      read() {
        try { return global.localStorage.getItem(key); } catch { return null; }
      },
      write(value) {
        try { global.localStorage.setItem(key, value); } catch { /* file:// and blocked storage remain usable */ }
      },
    };
  }

  // A state belongs to its report: the page's data-doc-id (the report's slug), else the page's
  // path. Its id names it within that report, so "view" and "<slug>:view" are one state, and a copy
  // of a report under another slug keeps a reading state of its own.
  function reportScope() {
    return document.querySelector(".doc-page")?.dataset.docId || location.pathname || "report";
  }

  // A stored or embedded payload is this state's when its schema, id and version are; its state
  // is what it holds, when that is an object.
  const isPayloadOf = (payload, matches, version) => payload?.schema === STATE_SCHEMA_VERSION && matches(payload.id) && payload.version === version;
  const stateOf = (payload) => (payload.state && typeof payload.state === "object" && !Array.isArray(payload.state) ? payload.state : null);

  function embeddedState(matches, version) {
    try {
      const nodes = document.querySelectorAll('script[type="application/json"][data-doc-state]');
      for (const node of nodes) {
        const parsed = JSON.parse(node.textContent || "null");
        const payloads = Array.isArray(parsed) ? parsed : [parsed];
        const payload = payloads.find((candidate) => isPayloadOf(candidate, matches, version));
        if (payload) return stateOf(payload);
      }
    } catch { /* malformed embedded state falls back to defaults/storage */ }
    return null;
  }

  function parseStored(raw, matches, version) {
    if (!raw) return null;
    try {
      const payload = JSON.parse(raw);
      return isPayloadOf(payload, matches, version) ? stateOf(payload) : null;
    } catch {
      return null;
    }
  }

  // Before the product's rename (2026-10-26) a state was kept under html-report-studio:<report>:<id>,
  // now gallery:<report>:<id> (src/shared/renamed-storage.mjs carries the UI's keys the same way).
  // The old one is carried to the new the first time the state is made, when the new is empty and
  // the old is this state's; again when the old changed since (a page of the old version, still
  // open, wrote it: the reader's latest). What the old held when carried is kept beside it
  // (`<new key>:renamed`), so a carry is done once; the old is never removed.
  function carryOldState(storage, old, matches, version) {
    const raw = old.read();
    if (raw === null && storage.read() !== null) return; // the usual case: nothing kept under the old name
    const marker = storageFor(`${storage.key}:renamed`);
    const seen = marker.read();
    const mark = raw === null ? "" : `${raw.length}:${digest(raw)}`;
    if (seen === mark) return;
    if (seen === null && (raw === null || storage.read() !== null)) {
      if (raw !== null) marker.write(mark); // the new one written already: it stays
      return;
    }
    if (raw !== null && parseStored(raw, matches, version) !== null) storage.write(raw);
    marker.write(mark);
  }

  function digest(text) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
    return (hash >>> 0).toString(36);
  }

  // What the options say a state is: their fields checked, and how its report names a state.
  function named(options) {
    if (!options || typeof options.id !== "string" || options.id.trim() === "") {
      throw new Error("DocState.create requires a non-empty id.");
    }
    if (!Number.isInteger(options.version) || options.version < 1) throw new Error("DocState version must be a positive integer.");
    if (!options.defaults || typeof options.defaults !== "object" || Array.isArray(options.defaults)) throw new Error("DocState defaults must be an object.");
    const scope = reportScope();
    const scoped = (name) => (name.startsWith(`${scope}:`) ? name : `${scope}:${name}`);
    return { scoped, key: scoped(options.id) };
  }

  // What defaults are made of, whatever they hold: the keys of each object, sorted, and what kind of
  // value stands at each, an array being one kind however long.
  function shapeOf(value) {
    if (Array.isArray(value)) return "array";
    if (value === null || typeof value !== "object") return value === null ? "null" : typeof value;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${shapeOf(value[key])}`).join(",")}}`;
  }

  function create(options) {
    const { scoped, key } = named(options);
    const { id, version } = options;
    const matches = (other) => typeof other === "string" && scoped(other) === key;
    if (instances.has(`${key}@${version}`)) throw new Error(`DocState ${id}@${version} already exists; share the existing instance.`);
    const defaults = clone(options.defaults);
    shapes.set(`${key}@${version}`, shapeOf(defaults));
    const transientKeys = new Set(Array.isArray(options.transientKeys) ? options.transientKeys : []);
    const exportScope = document.querySelector('meta[name="doc-export-id"]')?.content?.trim();
    const scopeSuffix = exportScope ? `:${exportScope}` : "";
    const storageKey = options.storageKey || `gallery:${key}${scopeSuffix}`;
    const storage = storageFor(storageKey);
    if (!options.storageKey) carryOldState(storage, storageFor(`html-report-studio:${key}${scopeSuffix}`), matches, version);
    // What it was kept under before (`formerId`: a component's instance, by its markup until it had a
    // block id), read when nothing is kept under its own name, and carried to it at once, so that the
    // reader's choice outlives the name, and the carry is done once.
    const former = typeof options.formerId === "string" && options.formerId && !options.storageKey && scoped(options.formerId) !== key ? scoped(options.formerId) : null;
    const formerMatches = (other) => typeof other === "string" && scoped(other) === former;
    const own = parseStored(storage.read(), matches, version);
    const carried = own || !former ? null : parseStored(storageFor(`gallery:${former}${scopeSuffix}`).read(), formerMatches, version);
    const embedded = own || carried ? null : embeddedState(matches, version) || (former ? embeddedState(formerMatches, version) : null);
    const restored = own || carried || embedded || {};
    const state = Object.assign(Object.create(null), defaults);
    for (const [key, value] of Object.entries(restored)) {
      if (!transientKeys.has(key)) state[key] = clone(value);
    }
    const listeners = new Set();

    function serialize() {
      const persisted = Object.create(null);
      for (const [key, value] of Object.entries(state)) {
        if (!transientKeys.has(key)) persisted[key] = clone(value);
      }
      return JSON.stringify({ schema: STATE_SCHEMA_VERSION, id, version, state: persisted });
    }

    function persist() {
      storage.write(serialize());
    }

    function notify(change) {
      const snapshot = clone(state);
      for (const listener of listeners) listener(clone(snapshot), change);
    }
    if (carried) persist();

    const api = {
      id,
      version,
      get(key, fallback) {
        return Object.prototype.hasOwnProperty.call(state, key) ? clone(state[key]) : fallback;
      },
      snapshot() {
        return clone(state);
      },
      set(key, value) {
        if (typeof key !== "string" || key.trim() === "") throw new Error("DocState.set requires a non-empty key.");
        state[key] = clone(value);
        persist();
        notify({ type: "set", key });
      },
      update(values) {
        if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("DocState.update requires an object.");
        Object.assign(state, clone(values));
        persist();
        notify({ type: "update", keys: Object.keys(values) });
      },
      reset() {
        for (const key of Object.keys(state)) delete state[key];
        Object.assign(state, clone(defaults));
        persist();
        notify({ type: "reset" });
      },
      subscribe(listener) {
        if (typeof listener !== "function") throw new Error("DocState.subscribe requires a function.");
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      serialize,
      hydrate(serialized) {
        const incoming = parseStored(serialized, matches, version);
        if (!incoming) throw new Error(`DocState snapshot does not match ${id}@${version}.`);
        for (const key of Object.keys(state)) delete state[key];
        Object.assign(state, clone(defaults));
        for (const [key, value] of Object.entries(incoming)) {
          if (!transientKeys.has(key)) state[key] = clone(value);
        }
        persist();
        notify({ type: "hydrate" });
      },
    };

    instances.set(`${key}@${version}`, api);
    return Object.freeze(api);
  }

  // The state these options name: the one made already when it is the same, else a new one. A state of
  // another version under the id, or defaults of another shape, is an error and no old object handed
  // back, which would hide that what reads it changed. create, which an id used twice by mistake is
  // to find, refuses every second call.
  function getOrCreate(options) {
    const { key } = named(options);
    const { id, version } = options;
    const made = [...instances.keys()].filter((name) => name.slice(0, name.lastIndexOf("@")) === key);
    if (made.length === 0) return create(options);
    if (!made.includes(`${key}@${version}`)) throw new Error(`DocState ${id} exists at another version than ${version}.`);
    if (shapes.get(`${key}@${version}`) !== shapeOf(clone(options.defaults))) throw new Error(`DocState ${id}@${version} exists with defaults of another shape.`);
    return instances.get(`${key}@${version}`);
  }

  global.DocState = Object.freeze({
    create,
    getOrCreate,
    schemaVersion: STATE_SCHEMA_VERSION,
    serializeAll() {
      return JSON.stringify([...instances.values()].map((state) => JSON.parse(state.serialize())));
    },
  });
  global.ReportState = global.DocState; // its old name (before 2026-10-26), for a script no tool rewrote (shared/old-names.mjs)
})(globalThis);
