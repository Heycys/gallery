// Code blocks are <div class="doc-code"> holding their title and a <pre><code> (highlighted on
// their own); a diff is declared as <div class="doc-diff"> holding its title and these options as
// JSON, its header showing the lines added and removed.
export interface CodeViewOptions {
  code: string;
  /** Overrides path inference; unknown languages render as plain text. */
  language?: string;
  path?: string;
  /** Default true. Copying excludes the gutter. */
  showLineNumbers?: boolean;
}
export interface DiffLineData {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  /** Optional positive integer; omitted numbers leave a blank gutter. */
  lineNumber?: number;
}
export interface DiffViewOptions extends Omit<CodeViewOptions, 'code'> {
  lines: DiffLineData[];
  /** Default true. */
  coloredLineNumbers?: boolean;
  /** Default true. */
  showAccentStrip?: boolean;
}
declare global {
  /** gallery check's alone (no such function on the page): a declared diff's JSON (`<div class="doc-diff">`) as its options. */
  function __declaredDiff(options: DiffViewOptions): void;
}
