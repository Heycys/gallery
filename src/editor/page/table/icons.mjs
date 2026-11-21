// The table tools' icons, drawn as the editor's (20px, thin lines): the grips' menus (index.mjs)
// and the cell bar (cell-bar.mjs).

const svg = (body, box = 20) => `<svg viewBox="0 0 ${box} ${box}" aria-hidden="true">${body}</svg>`;

export const TABLE_ICONS = {
  // A grip's drag dots, two by three, filled in the grip's color (shown at 16px).
  dots: svg('<circle cx="7.25" cy="4.5" r="1.2"/><circle cx="12.75" cy="4.5" r="1.2"/><circle cx="7.25" cy="10" r="1.2"/><circle cx="12.75" cy="10" r="1.2"/><circle cx="7.25" cy="15.5" r="1.2"/><circle cx="12.75" cy="15.5" r="1.2"/>'),
  plus: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1.5v7M1.5 5h7"/></svg>',
  grow: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2v8M2 6h8"/></svg>',
  headerRow: svg('<rect x="3.25" y="4.25" width="13.5" height="11.5" rx="2"/><path d="M3.25 8.25h13.5"/><path d="M4 5h12v3H4z" fill="currentColor" stroke="none" opacity=".22"/>'),
  headerColumn: svg('<rect x="3.25" y="4.25" width="13.5" height="11.5" rx="2"/><path d="M7.75 4.25v11.5"/><path d="M4 5h3.5v10H4z" fill="currentColor" stroke="none" opacity=".22"/>'),
  above: svg('<path d="M10 15.75V5.5M5.75 9.25 10 5l4.25 4.25"/><path d="M4 3.25h12"/>'),
  below: svg('<path d="M10 4.25V14.5M5.75 10.75 10 15l4.25-4.25"/><path d="M4 16.75h12"/>'),
  left: svg('<path d="M15.75 10H5.5M9.25 5.75 5 10l4.25 4.25"/><path d="M3.25 4v12"/>'),
  right: svg('<path d="M4.25 10H14.5M10.75 5.75 15 10l-4.25 4.25"/><path d="M16.75 4v12"/>'),
  duplicate: svg('<rect x="7.25" y="7.25" width="9.5" height="9.5" rx="2"/><path d="M12.75 7.25V5.5a2 2 0 0 0-2-2h-5.5a2 2 0 0 0-2 2V11a2 2 0 0 0 2 2h2"/>'),
  clear: svg('<path d="M3.5 4.5h9M8 4.5v11M6.75 15.5h2.5"/><path d="m12.5 10.25 4.75 4.75M17.25 10.25 12.5 15"/>'),
  trash: svg('<path d="M3.75 5.75h12.5M8 5.75V4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.25M5.25 5.75l.7 9.6a1.5 1.5 0 0 0 1.5 1.4h5.1a1.5 1.5 0 0 0 1.5-1.4l.7-9.6"/>'),
  // A row and a column taken out: the table with the row (column) crossed.
  removeRow: svg('<rect x="3.25" y="4.25" width="13.5" height="11.5" rx="2"/><path d="M3.25 8.25h13.5M3.25 11.75h13.5"/><path d="m8.25 8.75 3.5 2.5M11.75 8.75l-3.5 2.5"/>'),
  removeColumn: svg('<rect x="3.25" y="4.25" width="13.5" height="11.5" rx="2"/><path d="M8.25 4.25v11.5M11.75 4.25v11.5"/><path d="m8.75 8.25 2.5 3.5M11.25 8.25l-2.5 3.5"/>'),
  // 均分列宽: a table of three equal columns; 自动调整列宽: two edges and the arrows of a width between them.
  even: svg('<rect x="3.25" y="4.25" width="13.5" height="11.5" rx="2"/><path d="M7.75 4.25v11.5M12.25 4.25v11.5"/>'),
  autoWidth: svg('<path d="M3.25 4v12M16.75 4v12"/><path d="M6.25 10h7.5M8.25 8l-2 2 2 2M11.75 8l2 2-2 2"/>'),
  // 合并单元格: a cell's two halves pushed together; 拆分单元格: a cell pulled apart at its middle line.
  merge: svg('<rect x="3.25" y="4.25" width="13.5" height="11.5" rx="2"/><path d="M5.75 10h3M7.25 8.5 8.75 10l-1.5 1.5M14.25 10h-3M12.75 8.5 11.25 10l1.5 1.5"/>'),
  split: svg('<rect x="3.25" y="4.25" width="13.5" height="11.5" rx="2"/><path d="M10 4.25v11.5"/><path d="M8.25 10h-2.5M7.25 8.5 5.75 10l1.5 1.5M11.75 10h2.5M12.75 8.5l1.5 1.5-1.5 1.5"/>'),
  // The alignments: the lines of a paragraph at the left, the middle, the right.
  "doc-align-left": svg('<path d="M3.75 5h12.5M3.75 8.75h8M3.75 12.5h12.5M3.75 16.25h8"/>'),
  "doc-align-center": svg('<path d="M3.75 5h12.5M6 8.75h8M3.75 12.5h12.5M6 16.25h8"/>'),
  "doc-align-right": svg('<path d="M3.75 5h12.5M8.25 8.75h8M3.75 12.5h12.5M8.25 16.25h8"/>'),
  // The vertical alignments: a cell with its two lines at its top, its middle, its bottom.
  "doc-valign-top": svg('<rect x="3.25" y="3.25" width="13.5" height="13.5" rx="2"/><path d="M6.5 7h7M6.5 9.75h7"/>'),
  "doc-valign-middle": svg('<rect x="3.25" y="3.25" width="13.5" height="13.5" rx="2"/><path d="M6.5 8.6h7M6.5 11.4h7"/>'),
  "doc-valign-bottom": svg('<rect x="3.25" y="3.25" width="13.5" height="13.5" rx="2"/><path d="M6.5 10.25h7M6.5 13h7"/>'),
  // 一键优化: a magic wand and its sparks; 识别数字列: a number sign.
  magic: svg('<path d="m3.75 16.25 9-9"/><path d="m11.25 5.75 3 3"/><path d="M15.25 2.5v3M13.75 4h3M5.5 3.25v2M4.5 4.25h2M16 10.75v2M15 11.75h2"/>'),
  numbers: svg('<path d="M8.25 4 6.75 16M13.75 4l-1.5 12M4.5 8h12M3.75 12.25h12"/>'),
};
