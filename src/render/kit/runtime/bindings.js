// Reading state a report declares instead of scripting (docs/render.md, "State bindings"). A key is
// a name the report gives what its reader chose; elements bound to it write it and show it:
//
//   data-doc-bind="key"       on an input, textarea or select: its value; on a button with a
//                                value: a click chooses that value (aria-pressed shows the one
//                                chosen); on a details: whether it is open; on a table: its sort
//   data-doc-show="key:value" shown while the key holds this value or nothing, hidden otherwise
//   data-doc-transient        on a bound element: its key is forgotten when the page is left
//
// Equality only, no expressions (an export's CSP runs no code from attributes). The keys live in one
// DocState of the page ("bound"), kept across visits and in an export of the view unless
// transient; their defaults are what the markup holds when the page loads (a control's value, the
// button marked aria-pressed="true", a details' open). A key first met later (an element added
// after the page loaded) is kept for the visit only. Nothing refers to an element by id, so a bound
// block is deleted, copied and moved like any other, and the others work on without it.

const global = globalThis;
const CONTROLS = "input[data-doc-bind], select[data-doc-bind], textarea[data-doc-bind], button[data-doc-bind][value], details[data-doc-bind]";

function initial(element) {
  if (element.localName === "details") return element.hasAttribute("open");
  if (element.localName === "button") return element.getAttribute("aria-pressed") === "true" ? element.value : undefined;
  if (element.localName === "input" && (element.type === "checkbox" || element.type === "radio")) return element.type === "checkbox" ? element.checked : (element.checked ? element.value : undefined);
  if (element.localName === "table") return { sort: null };
  if (element.matches("input, select, textarea")) return element.value;
  return "";
}

/** The key and value of data-doc-show="key:value" (a value may hold colons). */
export function showOf(element) {
  const text = element.getAttribute("data-doc-show") ?? "";
  const at = text.indexOf(":");
  return at < 0 ? { key: text.trim(), value: "" } : { key: text.slice(0, at).trim(), value: text.slice(at + 1).trim() };
}

export function createBindings() {
  let state = null; // DocState "bound", made when a key is first read
  const later = new Map(); // keys met after that: this visit's only
  const listeners = new Set();

  function open() {
    if (state) return state;
    if (!global.DocState) throw new Error("State bindings require /kit/state.js to be loaded.");
    const defaults = {};
    const transient = new Set();
    for (const element of document.querySelectorAll("[data-doc-bind]")) {
      const key = element.getAttribute("data-doc-bind").trim();
      if (!key) continue;
      const value = initial(element);
      if (!(key in defaults) || (defaults[key] === "" && value !== undefined && value !== "")) defaults[key] = value ?? "";
      if (element.hasAttribute("data-doc-transient")) transient.add(key);
    }
    for (const element of document.querySelectorAll("[data-doc-show]")) {
      const { key } = showOf(element);
      if (key && !(key in defaults)) defaults[key] = "";
    }
    state = global.DocState.create({ id: "bound", version: 1, defaults, transientKeys: [...transient] });
    state.subscribe((snapshot, change) => {
      const keys = change.type === "set" ? [change.key] : Object.keys(snapshot);
      for (const listener of listeners) for (const key of keys) listener(key);
    });
    return state;
  }

  const known = (key) => later.has(key) || Object.prototype.hasOwnProperty.call(open().snapshot(), key);
  const store = {
    get(key) {
      if (later.has(key)) return later.get(key);
      return open().get(key, "");
    },
    set(key, value) {
      if (!known(key)) later.set(key, value);
      if (later.has(key)) {
        later.set(key, value);
        for (const listener of listeners) listener(key);
        return;
      }
      if (JSON.stringify(open().get(key)) !== JSON.stringify(value)) open().set(key, value);
    },
    /** Calls listener(key) when a key changes; returns what stops it. */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    listeners: () => listeners.size,
  };

  // A control: what it holds is its key's, and its key's is what it shows.
  function bindControl(element, { signal }) {
    const key = element.getAttribute("data-doc-bind").trim();
    if (!key) return null;
    if (!known(key)) later.set(key, initial(element) ?? "");
    const show = () => {
      const value = store.get(key);
      if (element.localName === "details") {
        if (element.open !== Boolean(value)) element.open = Boolean(value);
      } else if (element.localName === "button") {
        element.setAttribute("aria-pressed", String(value === element.value));
      } else if (element.type === "checkbox") {
        element.checked = Boolean(value);
      } else if (element.type === "radio") {
        element.checked = value === element.value;
      } else if (element.value !== String(value ?? "")) {
        element.value = String(value ?? "");
      }
    };
    const write = () => {
      if (element.localName === "details") store.set(key, element.open);
      else if (element.localName === "button") store.set(key, element.value);
      else if (element.type === "checkbox") store.set(key, element.checked);
      else if (element.type === "radio") { if (element.checked) store.set(key, element.value); }
      else store.set(key, element.value);
    };
    const event = element.localName === "details" ? "toggle" : element.localName === "button" ? "click" : element.localName === "select" || element.type === "checkbox" || element.type === "radio" ? "change" : "input";
    element.addEventListener(event, write, { signal });
    const stop = store.subscribe((changed) => changed === key && show());
    show();
    return { destroy: stop };
  }

  // An element shown for one value of a key (or while the key holds nothing).
  function bindShow(element) {
    const { key, value } = showOf(element);
    if (!key) return null;
    const show = () => {
      const chosen = store.get(key);
      const hidden = chosen !== "" && chosen !== null && chosen !== undefined && String(chosen) !== value;
      if (element.hidden !== hidden) element.hidden = hidden;
    };
    const stop = store.subscribe((changed) => changed === key && show());
    show();
    return { destroy: stop };
  }

  return { store, bindControl, bindShow, CONTROLS };
}
