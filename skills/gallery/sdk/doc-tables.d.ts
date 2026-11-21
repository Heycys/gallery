import type { AllocateColumnWidths, ColumnLayout } from "./column-widths.js";
export type { AllocateColumnWidths, ColumnInput, ColumnKind, ColumnLayout, ColumnWidthOptions } from "./column-widths.js";
export type DocSortDirection = "asc" | "desc";
export type DocSortType = "number" | "text" | "date";

export interface DocTableSortDetail {
  column: number;
  key: string | null;
  direction: DocSortDirection;
}

export interface DocTableState {
  /** null restores original row order. */
  sort: { column: number; direction: DocSortDirection; key?: string | null } | null;
}

export interface DocTablesApi {
  allocateColumnWidths: AllocateColumnWidths;
  /** Remeasure a table now. Hidden tables wait until visible; returns the last layout or []. */
  layout(target: string | HTMLTableElement): ColumnLayout[];
  getState(target: string | HTMLTableElement): DocTableState;
  setState(target: string | HTMLTableElement, state: DocTableState): void;
  subscribe(target: string | HTMLTableElement, listener: (state: DocTableState) => void): () => void;
}
