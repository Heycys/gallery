import { workspaceAddress } from "../../../shared/workspace-address.mjs";
import { Z } from "../../../shared/layers.mjs";
import { language, t } from "../../../shared/i18n/index.mjs";
import { createMenu } from "../menu.mjs";
import { placeBox } from "../placement.mjs";
import { RING } from "../look.mjs";
import { addStyle, appear, button, element, fadeAway, mount, textButton } from "../ui.mjs";

// A card's 设置… (docs/render.md "A custom page"): a small form of the fields its block's manifest
// lists (`settings`: text, number, select, date, switch, document), in the look of the editor's
// popups (its palette, look.mjs), standing under the card's grip (its right edge at the grip's). What it shows is what the card's settings part holds,
// each field its manifest's default where it holds none; 保存 (or Enter in a field) hands the values
// that changed to `save`, 取消, Escape or a press outside it nothing. Its buttons are the editor's flat
// ones (the project's flat look): no line round either, 取消 with no fill until the pointer is on it (grey), 保存 on
// a pale blue fill of its own. A document is chosen from the
// workspace's documents by title (the workbench's outline: GET /__gallery/workspace/outline, its web
// links no documents), the slug what is kept. A choice from a list (select, document) is a field that
// opens the editor's own menu card under it (menu.mjs: rows, the chosen one checked, ↑/↓ Enter Escape from
// the field), a choice of the caller's (type "choice", `choices`: [[value, words]], what a document block adds
// to its fields: the table a view reads) too, not a native <select>: the page cannot style that one's popup, which a browser draws in
// the system's colours (a white list with pale words in a dark page, the user's picture of 2026-11-09).
// While the form stands, the page is not shown again under it (the board's idle).

const STYLE = `
  .ge-board-form { position: fixed; left: 0; top: 0; z-index: ${Z.menu}; box-sizing: border-box; width: 300px; max-height: calc(100vh - 24px); overflow-y: auto; padding: 12px 12px 10px;
    border-radius: var(--ge-r-card); background: var(--ge-bg); color: var(--ge-tx); box-shadow: var(--ge-shadow-card);
    font: 14px/1.4 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI Variable Display", "Segoe UI", Helvetica, "PingFang SC", "Microsoft YaHei", Arial, sans-serif; }
  .ge-board-form-title { display: flex; align-items: baseline; gap: 8px; margin: 0 0 10px; font-size: 14px; font-weight: 600; }
  .ge-board-form-title small { min-width: 0; overflow: hidden; color: var(--ge-tx3); font-size: 12px; font-weight: 400; text-overflow: ellipsis; white-space: nowrap; }
  .ge-board-field { display: block; margin: 0 0 10px; }
  .ge-board-field > span { display: block; margin: 0 0 4px; color: var(--ge-tx2); font-size: 12px; }
  .ge-board-field :is(input, .ge-board-pick) { box-sizing: border-box; width: 100%; height: 28px; margin: 0; padding: 0 8px; border: 0; border-radius: var(--ge-r-ctl); outline: none;
    background: var(--ge-field); color: var(--ge-tx); font: inherit; box-shadow: inset 0 0 0 1px var(--ge-edge); }
  .ge-board-field input:focus { box-shadow: inset 0 0 0 1px var(--ge-focus), 0 0 0 2px var(--ge-halo); }
  /* The pick is a button that opens a menu: no line, a gray at rest (it reads as a control among the lined fields), deeper under the pointer, the keys on it and while its menu is open. */
  .ge-board-pick { display: flex; align-items: center; gap: 6px; text-align: left; cursor: pointer; }
  .ge-board-field .ge-board-pick { background: var(--ge-hover); box-shadow: none; }
  .ge-board-field .ge-board-pick:is(:hover, :focus-visible, [aria-expanded="true"]) { background: var(--ge-press); }
  .ge-board-pick-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ge-board-pick svg { flex: none; display: block; width: 16px; height: 16px; fill: none; stroke: var(--ge-tx3); stroke-width: 1.25; stroke-linecap: round; stroke-linejoin: round; }
  .ge-board-switch { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 0 10px; }
  .ge-board-switch > span { color: var(--ge-tx); font-size: 14px; }
  /* Every switch's one look (a design review, 2026-11-17): 30 x 18, the knob 14, --ge-control-blue on, 160ms, the knob 3px wider pressed. */
  .ge-board-switch button { position: relative; flex: none; width: 30px; height: 18px; padding: 0; border: 0; border-radius: 9px; background: var(--ge-switch-track); cursor: pointer; transition: background 160ms cubic-bezier(.32, .72, 0, 1); }
  .ge-board-switch button::after { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 7px; background: #fff; transition: left 160ms cubic-bezier(.32, .72, 0, 1), width 160ms cubic-bezier(.32, .72, 0, 1); }
  .ge-board-switch button[aria-checked="true"] { background: var(--ge-control-blue); }
  .ge-board-switch button[aria-checked="true"]::after { left: 14px; }
  .ge-board-switch button:active::after { width: 17px; }
  .ge-board-switch button[aria-checked="true"]:active::after { left: 11px; }
  .ge-board-switch button:focus-visible { outline: none; box-shadow: ${RING}; }
  .ge-board-form-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
  @media (prefers-reduced-motion: reduce) { .ge-board-switch :is(button, button::after) { transition: none; } }
`;

const CHEVRON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>';
const said = (words) => (typeof words === "string" ? words : words?.[language] ?? words?.zh ?? words?.en ?? "");
let shown = null; // the form standing now: { node, close }

/** Whether the form stands now. */
export const formOpen = () => shown !== null;

/** The workspace's documents, by title: [{ slug, title }] (none where the outline cannot be read). */
async function documents() {
  try {
    const answer = await (await fetch(workspaceAddress("/__gallery/workspace/outline"))).json();
    return Object.values(answer.reports ?? {}).filter((report) => !report.instructions && report.kind !== "link").map(({ slug, title }) => ({ slug, title: title || slug }))
      .sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
  } catch {
    return [];
  }
}

/**
 * The form for a card: `fields`, its manifest's settings; `values`, what its settings part holds;
 * `name`, its block's name; `anchor`, the rect it stands by; `save(changed)`, the values that changed
 * by key. Closes another that stands.
 */
export async function openSettings({ fields, values, name, anchor, save }) {
  addStyle(STYLE);
  shown?.close();
  const kinds = new Map();
  const pick = createMenu(); // the list of the field being chosen from (one at a time)
  let picking = null; // the field it stands under
  const node = element("form", { class: "ge-board-form", role: "dialog", "aria-label": t("卡片设置"), novalidate: "" });
  node.append(element("div", { class: "ge-board-form-title" }, element("span", { text: t("设置") }), element("small", { text: said(name) })));
  const listed = fields.some((field) => field.type === "document") ? await documents() : [];
  const now = (field) => (Object.hasOwn(values ?? {}, field.key) ? values[field.key] : field.default);
  for (const field of fields) {
    const label = said(field.label) || field.key;
    const value = now(field);
    if (field.type === "switch") {
      const toggle = element("button", { type: "button", role: "switch", "aria-checked": String(value === true), "aria-label": label, "data-key": field.key });
      toggle.addEventListener("click", () => toggle.setAttribute("aria-checked", String(toggle.getAttribute("aria-checked") !== "true")));
      node.append(element("div", { class: "ge-board-switch" }, element("span", { text: label }), toggle));
      kinds.set(field.key, { field, read: () => toggle.getAttribute("aria-checked") === "true" });
      continue;
    }
    let control;
    const choice = field.type === "select" || field.type === "document" || field.type === "choice"; // chosen from a list
    if (choice) {
      const options = field.type === "select" ? field.options.map((option) => [String(option), String(option)]) : field.type === "choice" ? field.choices : [["", t("（未选择）")], ...listed.map(({ slug, title }) => [slug, title])];
      if (field.type === "document" && value && !listed.some(({ slug }) => slug === value)) options.push([String(value), String(value)]);
      const text = element("span", { class: "ge-board-pick-text" });
      control = element("button", { type: "button", class: "ge-board-pick", "data-key": field.key, "aria-haspopup": "menu", "aria-expanded": "false" }, text, element("span", { html: CHEVRON }));
      // What the field holds is its `value` (the key of an option), shown as the option's words.
      const show = (key) => {
        control.value = key;
        text.textContent = options.find(([option]) => option === key)?.[1] ?? key;
      };
      show(value === undefined || value === null ? (field.type === "select" ? String(field.options[0]) : "") : String(value));
      const open = () => {
        const wide = control.getBoundingClientRect();
        picking = control;
        control.setAttribute("aria-expanded", "true");
        pick.open(options.map(([key, words]) => ({ label: words, selected: key === control.value, run: () => show(key) })), wide, {
          label, width: Math.round(wide.width), icons: false, height: 280,
          onClose: () => { if (picking === control) picking = null; control.setAttribute("aria-expanded", "false"); },
        });
        // The chosen row highlighted where there is one (the first otherwise: the menu's own).
        const chosen = options.findIndex(([key]) => key === control.value);
        for (let step = 0; step < Math.max(0, chosen); step++) pick.move(1);
      };
      control.addEventListener("click", () => { if (picking === control) pick.close(); else open(); });
      control.addEventListener("keydown", (event) => {
        if (event.isComposing || event.keyCode === 229) return;
        if (picking !== control) {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            open();
          }
          return;
        }
        if (pick.arrow(event)) event.preventDefault();
        else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          pick.choose();
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation(); // the list closes; the form stays
          pick.close();
        } else if (event.key === "Tab") pick.close();
      });
    } else {
      control = element("input", { type: field.type === "number" ? "number" : field.type === "date" ? "date" : "text", "data-key": field.key, autocomplete: "off" });
      control.value = value === undefined || value === null ? "" : String(value);
    }
    // A field to choose from is no <label> (a click on its words would open its list): its words name it by aria-labelledby.
    const words = element("span", { text: label });
    if (choice) {
      words.id = `ge-board-label-${field.key}`;
      control.setAttribute("aria-labelledby", words.id);
    }
    node.append(element(choice ? "div" : "label", { class: "ge-board-field" }, words, control));
    kinds.set(field.key, {
      field,
      read: () => {
        if (field.type === "number") return control.value.trim() === "" ? null : Number(control.value);
        if (field.type === "select") return field.options.find((option) => String(option) === control.value) ?? field.options[0];
        return control.value;
      },
    });
  }
  const close = () => {
    if (shown?.node !== node) return;
    shown = null;
    pick.close();
    fadeAway(node); // a picture of it fades out (ui.mjs)
    removeEventListener("pointerdown", outside, true);
  };
  // What a field showed as it opened, as it reads it back (a field the part holds nothing of shows its default, or nothing).
  const shownAt = (field) => now(field) ?? (field.type === "switch" ? false : field.type === "select" ? field.options[0] : field.type === "number" ? null : "");
  // Only what the reader changed goes: a field left as it showed stays as the part holds it (its default unwritten).
  const done = () => {
    const changed = {};
    for (const [key, { field, read }] of kinds) {
      const value = read();
      if (field.type === "number" && value !== null && !Number.isFinite(value)) continue;
      if (JSON.stringify(value) !== JSON.stringify(shownAt(field))) changed[key] = value;
    }
    close();
    if (Object.keys(changed).length) save(changed);
  };
  const outside = (event) => {
    if (!node.contains(event.target) && !pick.contains(event.target)) close();
  };
  node.addEventListener("submit", (event) => {
    event.preventDefault();
    done();
  });
  node.addEventListener("keydown", (event) => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Enter" && event.target.localName === "input") {
      event.preventDefault();
      done();
    }
  });
  // The editor's one button look (look.mjs .ge-btn): 取消 plain, 保存 the pale blue primary, which submits the form.
  node.append(element("div", { class: "ge-board-form-foot" }, textButton(t("取消"), close), textButton(t("保存"), () => {}, { primary: true, type: "submit" })));
  mount(node);
  const { left, top } = placeBox(anchor, { width: node.offsetWidth, height: node.offsetHeight }, { placement: "bottom", align: "end", gap: 6 });
  node.style.left = `${Math.round(left)}px`;
  node.style.top = `${Math.round(top)}px`;
  appear(node, null, { typed: true }); // a form: its opacity alone comes (ui.mjs)
  shown = { node, close };
  addEventListener("pointerdown", outside, true);
  node.querySelector("input, .ge-board-pick, button[role=switch]")?.focus({ preventScroll: true });
  return node;
}

/** The form taken away, whatever it holds. */
export const closeSettings = () => shown?.close();
