/** A Sheet area: the tab it shows. */
export interface DocSheetsHandle {
  get(): string;
  set(tab: string): void;
  destroy(): void;
}

/**
 * Sheet areas start on their own (`<section class="doc-sheet-shell" data-doc-sheets="name">`,
 * its tab kept under its name); a script may ask one which tab it shows, or show another.
 */
export interface DocSheetsApi {
  /** The area a selector or element finds; null before it has started. */
  get(target: string | Element): DocSheetsHandle | null;
}
