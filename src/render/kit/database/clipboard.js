/**
 * What the table last copied as cells. A paste in a cell being edited that is a grid of cells (with
 * tabs or line breaks, or just what the table copied) pastes as cells, from this one on, rather than
 * putting all its words in this one.
 */
export const tableClip = { last: '' };
export function isGridPaste(text, multiLineText) {
  const t = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  if (!t)
    return false;
  if (t === tableClip.last.replace(/\n$/, '') && /[\t\n]/.test(t))
    return true;
  if (t.includes('\t'))
    return true;
  // A cell of words (a title, a text) holds several lines; any other with a line break is several cells.
  return !multiLineText && t.includes('\n');
}
