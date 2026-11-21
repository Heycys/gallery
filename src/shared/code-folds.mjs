// What a code block's folds look like, written once: the arrow of a line that folds (the kit's
// code.js draws it in the reading view, the page editor in its line numbers' column) and the "…"
// after a line that is folded (the kit's styles/code.css asks for it as `@fold-dots`, which
// kit-build.mjs fills in; the editor's styles interpolate it). Its colors are the kit's tokens.

/**
 * A folding line's arrow (markup; it takes the color of its button), pointing down as drawn (open); a code
 * block's, its lines' and a heading's (page/fold/) are turned -90° (right) while folded.
 */
export const FOLD_ARROW = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.25 4.5h5.5L6 8z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';

/** The three dots of a folded line's "…" (a CSS image). */
export const FOLD_DOTS = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='2'%3E%3Ccircle cx='1' cy='1' r='1' fill='%238e8b86'/%3E%3Ccircle cx='6' cy='1' r='1' fill='%238e8b86'/%3E%3Ccircle cx='11' cy='1' r='1' fill='%238e8b86'/%3E%3C/svg%3E")`;
