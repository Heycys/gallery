/**
 * The types of the table column allocator (`DocTables.allocateColumnWidths`), kept here so that the
 * SDK stands alone: the kit's own code takes them from this file.
 */
export type ColumnKind = 'compact' | 'narrative' | 'token-heavy';
export interface ColumnInput {
  key: string;
  header: string;
  cells: Array<string | number | null | undefined>;
  kind?: ColumnKind;
  minWidth?: number;
  maxWidth?: number;
  /** A column of numbers (the kit's numeric columns): its readable floor is never lowered by maxReadableFloor. */
  numeric?: boolean;
  /** Optional measured header width including padding/controls; supplied by the DOM adapter. */
  headerWidth?: number;
  /** Optional unwrapped widths including padding, aligned with cells; supplied by the DOM adapter. */
  cellWidths?: number[];
  /** Optional widths of the header's and each cell's longest word (WORD_BREAKS) including padding; supplied by the DOM adapter. */
  headerWordWidth?: number;
  cellWordWidths?: number[];
  /** Optional widths of each cell's widest piece no line breaks in (PIECE_BREAKS, a number range) including padding; supplied by the DOM adapter. */
  cellPieceWidths?: number[];
}
export interface ColumnLayout {
  key: string;
  kind: ColumnKind;
  preferredWidth: number;
  /** Readable floor: when their sum exceeds the viewport, scroll instead of compressing further. */
  softMinWidth: number;
  hardMinWidth: number;
  width: number;
  /** Relative to the allocated columns, which may exceed totalWidth at their readable floors. */
  ratio: number;
}
export interface ColumnWidthOptions {
  /** Available table width, including cell padding. */
  totalWidth: number;
  percentile?: number;
  hardMinWidth?: number;
  narrativeMinWidth?: number;
  /**
   * The most a column's readable floor may be, whatever its kind (a prose column's baseline and its
   * three lines of P90 text, a path's, a short field's protected width alike), but a numeric
   * column's; unset, no limit. On a narrow screen the kit passes a third of the table's room, so that
   * a table of two or three columns wraps their text before it scrolls sideways.
   */
  maxReadableFloor?: number;
  tokenHeavyMinWidth?: number;
  compactMaxProtectedWidth?: number;
  /**
   * The widest a long identifier (a token-heavy column's longest words, P90 of its cells': a dataset's
   * or a hash's name) is kept whole on its line, its column at least that wide; a wider one breaks where
   * its column ends. Default 640 (about eighty characters).
   */
  longWordMaxWidth?: number;
  /**
   * Keep long identifiers whole even where breaking them would bring the table inside totalWidth (the
   * kit's question whether a table is wider than the text). Default false: they break only then.
   */
  keepLongWords?: boolean;
  cellPadding?: number;
  columnOverhead?: number;
  font?: string;
}
/** Column widths from the cells' text: deterministic P90 + water filling, with scrolling at readable floors. */
export type AllocateColumnWidths = (columns: ColumnInput[], options: ColumnWidthOptions) => ColumnLayout[];
