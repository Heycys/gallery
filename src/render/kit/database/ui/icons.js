import { UI_ICONS } from "../../../../shared/ui-icons.mjs";

// The drawing's line icons, all in currentColor with round caps and joins. Where Gallery has an icon for
// the same meaning (src/shared/ui-icons.mjs: copy, delete, rename, more, the arrows…) it is that one; the
// others are the database's own. The board's, the chart's and the gallery's layouts are drawn on Gallery's
// grid of 20 as its own are (a line of 1.25 as shown, every corner and end rounded, nothing pointed); the
// rest on a grid of 24. Every one is drawn at Gallery's stroke (1.25px as it shows, whatever its size and
// grid), as its menus' icons are.

const dot = (cx, cy, r = 1.3) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" stroke="none"/>`;

// Three layouts on a grid of 20 (box 20): rounded rectangles and round ends only.
const LAYOUTS = {
  board: '<rect x="3.25" y="3.75" width="3.75" height="12.5" rx="1.5"/><rect x="8.5" y="3.75" width="3.75" height="8.75" rx="1.5"/><rect x="13.75" y="3.75" width="3" height="6" rx="1.5"/>',
  gallery: '<rect x="3.25" y="3.25" width="5.75" height="5.75" rx="1.75"/><rect x="11" y="3.25" width="5.75" height="5.75" rx="1.75"/><rect x="3.25" y="11" width="5.75" height="5.75" rx="1.75"/><rect x="11" y="11" width="5.75" height="5.75" rx="1.75"/>',
  chart: '<path d="M3.5 16.25h13"/><rect x="4.75" y="9.5" width="2.75" height="4.75" rx="1.25"/><rect x="8.75" y="4.25" width="2.75" height="10" rx="1.25"/><rect x="12.75" y="7" width="2.75" height="7.25" rx="1.25"/>',
};

// 颜色 (a chart's colors), as the editor's block menu draws its 颜色 row: a letter over a stroke, on the same grid of 20.
const GRID_20 = {
  ...LAYOUTS,
  color: '<path d="m6.25 12.75 3.75-9.5 3.75 9.5M7.6 9.25h4.8"/><path d="M4 16.25h12" stroke-width="2"/>',
};

// The others, on a grid of 24.
const P = {
  table: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10"/>',
  list: `<path d="M9 6.5h11M9 12h11M9 17.5h11"/>${dot(4.75, 6.5)}${dot(4.75, 12)}${dot(4.75, 17.5)}`,
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  chartBar: '<path d="M4 4v16"/><rect x="6" y="5.5" width="10" height="3" rx="1"/><rect x="6" y="10.5" width="14" height="3" rx="1"/><rect x="6" y="15.5" width="7" height="3" rx="1"/>',
  chartLine: '<path d="M4 4v16h16"/><path d="m7 15 4-5 3 3 5-6"/>',
  chartDonut: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 4v4.5M19.2 15.5l-4-2"/>',
  filter: '<path d="M4.5 6h15M7.5 12h9M10.5 18h3"/>',
  sort: '<path d="M7.5 4v16M4 7.5 7.5 4 11 7.5M16.5 20V4M13 16.5l3.5 3.5 3.5-3.5"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  open: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M14 4.5v15"/>',
  center: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><rect x="7.5" y="8" width="9" height="8" rx="1"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  sortNone: '<path d="M8.5 18.5V5.5M5 9l3.5-3.5L12 9M15.5 5.5v13M12 15l3.5 3.5L19 15"/>',
  sortAsc: '<path d="M12 19.5v-15M6.5 10 12 4.5l5.5 5.5"/>',
  sortDesc: '<path d="M12 4.5v15M6.5 14l5.5 5.5 5.5-5.5"/>',
  alignLeft: '<path d="M4.5 6h15M4.5 10h9M4.5 14h15M4.5 18h9"/>',
  alignCenter: '<path d="M4.5 6h15M7.5 10h9M4.5 14h15M7.5 18h9"/>',
  alignRight: '<path d="M4.5 6h15M10.5 10h9M4.5 14h15M10.5 18h9"/>',
  eye: '<path d="M2.5 12C4 8.5 7.5 5.5 12 5.5s8 3 9.5 6.5c-1.5 3.5-5 6.5-9.5 6.5s-8-3-9.5-6.5z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 5.6A9.7 9.7 0 0 1 12 5.5c4.5 0 8 3 9.5 6.5a12 12 0 0 1-2.6 3.6M6.4 6.9C4.6 8.1 3.3 9.9 2.5 12c1.5 3.5 5 6.5 9.5 6.5 1.7 0 3.2-.4 4.5-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  insertLeft: '<rect x="11.5" y="4.5" width="9" height="15" rx="1.5"/><path d="M6 9v6M3 12h6"/>',
  insertRight: '<rect x="3.5" y="4.5" width="9" height="15" rx="1.5"/><path d="M18 9v6M15 12h6"/>',
  swap: '<path d="M7 4 4 7l3 3M4 7h13M17 20l3-3-3-3M20 17H7"/>',
  group: '<rect x="3.5" y="4" width="17" height="5" rx="1.5"/><path d="M7 12.5h13.5M7 16h13.5M7 19.5h9"/>',
  sigma: '<path d="M17 5.5H7.6c-.85 0-1.3 1-.75 1.65L11 12l-4.15 4.85c-.55.65-.1 1.65.75 1.65H17"/>',
  segments: '<rect x="2.5" y="7" width="19" height="10" rx="5"/><path d="M9 7v10M15 7v10"/>',
  pill: '<rect x="4" y="8" width="16" height="8" rx="4"/>',
  wrap: '<path d="M4 6h16M4 12h13a3 3 0 0 1 0 6h-4"/><path d="m15 16-2 2 2 2M4 18h5"/>',
  info: `<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/>${dot(12, 8, 1)}`,
  // the columns' kinds
  title: '<path d="M5 6.5h10M10 6.5v11M14 12.5h6M17 12.5v5"/>',
  number: '<path d="M9.5 4 7.5 20M16.5 4l-2 16M4.5 9h15M4 15h15"/>',
  select: '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 10.5 3.5 3.5 3.5-3.5"/>',
  multi: `<path d="M9 6.5h11M9 12h11M9 17.5h11"/>${dot(4.75, 6.5)}${dot(4.75, 12)}${dot(4.75, 17.5)}`,
  date: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  checkbox: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 5-5"/>',
  formula: '<path d="M14.5 4.5h-1.5a2.5 2.5 0 0 0-2.5 2.3L9.5 18a2.5 2.5 0 0 1-2.5 2H5.5M7 10h7M14 13l5 5M19 13l-5 5"/>',
  textLines: '<path d="M4.5 6.5h15M4.5 12h15M4.5 17.5h9"/>',
  // a calendar's records with no date (未排期): a tray
  inbox: '<path d="M3.5 13.5 5.6 6.4A2 2 0 0 1 7.5 5h9a2 2 0 0 1 1.9 1.4l2.1 7.1V18.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M3.5 13.5h5l1 2h5l1-2h5"/>',
};

// The names that are Gallery's own icons (src/shared/ui-icons.mjs).
const SHARED = {
  plus: "plus", x: "close", check: "check", chevronRight: "chevron", chevronLeft: "chevronLeft", chevronDown: "chevronDown", chevronUp: "chevronUp",
  more: "more", grip: "handle", copy: "copy", duplicate: "duplicate", trash: "trash", edit: "rename", search: "search", arrowUpRight: "external",
  url: "link", download: "download", cursor: "pointer",
};
// What a column's kind shows (its name differs where the kind's word is another's icon).
const ALIAS = { text: "textLines" };

/** The stroke as it shows on screen, in px. */
const STROKE = 1.25;
const made = new Map(); // markup by name, size and weight

/**
 * An icon `size` px square, an <svg> element. `bold`: a heavier stroke, as a 24 grid's units at 16px say
 * it (2 is bold), for a check that must read at a glance.
 */
export function icon(name, size = 16, { bold = 0, cls = "" } = {}) {
  const key = `${name}:${size}:${bold}:${cls}`;
  let markup = made.get(key);
  if (!markup) {
    const shown = bold ? Math.max(STROKE, (bold * 16) / 24) : STROKE;
    const own = SHARED[name] ? UI_ICONS[SHARED[name]] : null;
    const layout = GRID_20[name];
    const [box, body, fill] = own ? [own.box, own.body, own.fill] : layout ? [20, layout, false] : [24, P[ALIAS[name] ?? name] ?? "", false];
    markup = `<svg class="ic${cls ? ` ${cls}` : ""}" width="${size}" height="${size}" viewBox="0 0 ${box} ${box}" fill="${fill ? "currentColor" : "none"}" stroke="${fill ? "none" : "currentColor"}" stroke-width="${(shown * box) / size}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
    made.set(key, markup);
  }
  const template = document.createElement("template");
  template.innerHTML = markup;
  return template.content.firstElementChild;
}

/** What each kind of column shows by its name. */
export const typeIcon = (type, size = 16) => icon(type, size, { cls: "prop-ic" });
