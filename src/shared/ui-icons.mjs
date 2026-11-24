// Line icons shared by Gallery's menus and controls wherever they stand: the editor's menu card
// (src/editor/page/menu.mjs ICONS), the workbench's (src/workbench/app/components/icons.ts) and the kit's
// database (src/render/kit/database/ui/icons.js). Each is its drawing on a grid of `box` (20, or 16 for
// a menu's check and arrows), stroked in currentColor with round caps and joins (`fill`: drawn in
// dots, filled), so that one meaning has one drawing. Pure data: each side wraps it in its own <svg>.

export const UI_ICONS = {
  plus: { box: 20, body: '<path d="M10 4.25v11.5M4.25 10h11.5"/>' },
  copy: { box: 20, body: '<rect x="7.25" y="7.25" width="9.5" height="9.5" rx="2"/><path d="M12.75 7.25V5.5a2 2 0 0 0-2-2h-5.5a2 2 0 0 0-2 2V11a2 2 0 0 0 2 2h2"/>' },
  duplicate: { box: 20, body: '<rect x="6.75" y="6.75" width="10" height="10" rx="2.5"/><path d="M13.25 4.6a2.25 2.25 0 0 0-2-1.35H5.5A2.25 2.25 0 0 0 3.25 5.5v5.75c0 .9.55 1.7 1.35 2"/><path d="M11.75 9.5v4.5M9.5 11.75H14"/>' },
  trash: { box: 20, body: '<path d="M3.75 5.75h12.5M8 5.75V4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.25M5.25 5.75l.7 9.6a1.5 1.5 0 0 0 1.5 1.4h5.1a1.5 1.5 0 0 0 1.5-1.4l.7-9.6"/>' },
  rename: { box: 20, body: '<path d="M11.75 4.75l3.5 3.5"/><path d="M13.25 3.25a1.5 1.5 0 0 1 2.12 0l1.38 1.38a1.5 1.5 0 0 1 0 2.12L7.5 16H4v-3.5z"/>' },
  check: { box: 16, body: '<path d="m3.5 8.5 3 3 6-7"/>' },
  chevron: { box: 16, body: '<path d="m6.25 4.25 3.75 3.75-3.75 3.75"/>' },
  chevronLeft: { box: 16, body: '<path d="m9.75 4.25-3.75 3.75 3.75 3.75"/>' },
  chevronDown: { box: 16, body: '<path d="m4.25 6.25 3.75 3.75 3.75-3.75"/>' },
  chevronUp: { box: 16, body: '<path d="m4.25 9.75 3.75-3.75 3.75 3.75"/>' },
  more: { box: 20, fill: true, body: '<circle cx="4.5" cy="10" r="1.4"/><circle cx="10" cy="10" r="1.4"/><circle cx="15.5" cy="10" r="1.4"/>' },
  handle: { box: 20, fill: true, body: '<circle cx="7.5" cy="4" r="1.25"/><circle cx="12.5" cy="4" r="1.25"/><circle cx="7.5" cy="10" r="1.25"/><circle cx="12.5" cy="10" r="1.25"/><circle cx="7.5" cy="16" r="1.25"/><circle cx="12.5" cy="16" r="1.25"/>' },
  close: { box: 20, body: '<path d="m5.5 5.5 9 9M14.5 5.5l-9 9"/>' },
  external: { box: 20, body: '<path d="M11.5 3.75h4.75V8.5M16 4 9.5 10.5"/><path d="M14.25 11.5v3a1.75 1.75 0 0 1-1.75 1.75h-7A1.75 1.75 0 0 1 3.75 14.5v-7A1.75 1.75 0 0 1 5.5 5.75h3"/>' },
  link: { box: 20, body: '<g transform="rotate(45 10 10)"><path d="M7 8.5V6a3 3 0 0 1 6 0v2.5M7 11.5V14a3 3 0 0 0 6 0v-2.5M10 7.5v5"/></g>' },
  download: { box: 20, body: '<path d="M10 3.75v9M6.25 9.25 10 13l3.75-3.75"/><path d="M3.75 13.5v1.25c0 .83.67 1.5 1.5 1.5h9.5c.83 0 1.5-.67 1.5-1.5V13.5"/>' },
  // Lucide's (lucide-react 1.67.0, ISC: src/shared/emoji/data/LICENSE-lucide.txt), on its 24 grid.
  search: { box: 24, lucide: true, body: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>' },
  // A pointer, its four corners rounded and its notch wide (the presentation view's, a click on a cell's).
  pointer: { box: 20, body: '<path d="M5.2 5c-.15-.95.75-1.55 1.55-1.1l7.95 4.65c.85.5.65 1.75-.3 1.95l-2.65.55c-.75.15-1.35.65-1.65 1.35l-1.15 2.6c-.4.9-1.7.8-1.9-.15z"/>' },
  text: { box: 20, body: '<path d="M5 5h10M10 5v10.5"/>' },
};

/** An icon as <svg> markup, as the workbench writes its own: its grid as its viewBox, `class` given where it has one ("fill" for one drawn in dots). */
export const svgOf = (name, { className = UI_ICONS[name].fill ? "fill" : UI_ICONS[name].lucide ? "lu" : null } = {}) => {
  const { box, body } = UI_ICONS[name];
  return `<svg viewBox="0 0 ${box} ${box}"${className ? ` class="${className}"` : ""}>${body}</svg>`;
};
