import { FACE_ICON, PHOTO_ICON, svg } from "../../components/icons.mjs";

// The icons the icon picker shows: the editor's own line drawings (components/icons.mjs svg) on 20
// units, no color of their own. icon(name, size) sets the size they show at; the picker's styles
// (styles.mjs) set their line and color.

const ICONS = {
  clock: svg('<circle cx="10" cy="10" r="7.25"/><path d="M10 5.75V10l3 1.75"/>'),
  emojiFace: FACE_ICON,
  leaf: svg('<path d="M16.25 3.75C9 3.75 4.25 7.4 4.25 12.4c0 1.3.4 2.4 1.1 3.35 6 .2 10.9-3.4 10.9-12z"/><path d="M5.25 15.5 11 9.25"/>'),
  carrot: svg('<path d="M3.75 16.25 7.9 8.1c.5-1 1.8-1.2 2.6-.4l1.9 1.9c.8.8.6 2.1-.4 2.6z"/><path d="M10.2 7.3C9.9 5.2 10.6 3.6 12.3 2.6M11.3 8.4l3.4-3.4M12.6 9.8c2.1-.4 3.6-.1 4.7 1.2"/>'),
  soccerBall: svg('<circle cx="10" cy="10" r="7.5"/><path d="m10 7.4 2.5 1.8-.95 2.95h-3.1L7.5 9.2z"/><path d="M10 7.4V2.5M12.5 9.2l4.6-1.5M11.55 12.15l2.9 4M8.45 12.15l-2.9 4M7.5 9.2 2.9 7.7"/>'),
  airplane: svg('<path d="M17.25 10c0-.9-.8-1.5-1.7-1.5H11L7.5 3.5H5.75l1.75 5H4.25L3 7H2l.75 3L2 13h1l1.25-1.5H7.5l-1.75 5H7.5L11 11.5h4.55c.9 0 1.7-.6 1.7-1.5z"/>'),
  lightBulbBright: svg('<path d="M10 2.75a5 5 0 0 0-3 9c.6.5 1 1.2 1 2v.5h4v-.5c0-.8.4-1.5 1-2a5 5 0 0 0-3-9z"/><path d="M8.25 16.5h3.5"/>'),
  checkmarkCircle: svg('<circle cx="10" cy="10" r="7.25"/><path d="m6.75 10.25 2.4 2.4 4.1-4.9"/>'),
  squareGrid2X2: svg('<rect x="3.5" y="3.5" width="5" height="5" rx="1.25"/><rect x="11.5" y="3.5" width="5" height="5" rx="1.25"/><rect x="3.5" y="11.5" width="5" height="5" rx="1.25"/><rect x="11.5" y="11.5" width="5" height="5" rx="1.25"/>'),
  plusCircle: svg('<circle cx="10" cy="10" r="7.25"/><path d="M10 6.75v6.5M6.75 10h6.5"/>'),
  xMarkCircle: svg('<circle cx="10" cy="10" r="7.25"/><path d="m7.75 7.75 4.5 4.5m0-4.5-4.5 4.5"/>'),
  photo: PHOTO_ICON,
  plusSmall: svg('<path d="M10 4.5v11M4.5 10h11"/>'),
  magnifyingGlassSmall: svg('<circle cx="9" cy="9" r="5.5"/><path d="m13.25 13.25 3.75 3.75"/>'),
  // Two lines crossing, each ending in an arrow: 随机.
  arrowIntersectRightSmall: svg('<path d="M3 6h2.4c2 0 3.3 1.3 4.6 3.1M11.3 10.9c1.3 1.8 2.6 3.1 4.6 3.1H17M14.75 11.75 17 14l-2.25 2.25"/><path d="M3 14h2.4c2 0 3.3-1.3 4.6-3.1M11.3 9.1C12.6 7.3 13.9 6 15.9 6H17M14.75 3.75 17 6l-2.25 2.25"/>'),
  // A ring with an arrowhead at its open end: 替换.
  arrowCircleLoopBackwardSmall: svg('<path d="M15.5 10a5.5 5.5 0 1 1-1.9-4.15"/><path d="M15.5 4.25v3.25h-3.25"/>'),
};

/** The icon `name` as an svg of `size` px (its own size when none). */
export function icon(name, size = 20) {
  return ICONS[name].replace("<svg ", `<svg width="${size}" height="${size}" `);
}
