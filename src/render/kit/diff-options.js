// The checks a diff's lines get (a declared diff, src/render/kit/code.js): its type, the single line
// of its content and its line number. Pure, with no document and no highlighter, so the kit draws
// a diff only when it passes and gallery check (src/render/chart-declarations.mjs) runs the same
// check without loading the code kit (a bundle with the highlighter).
export function validateDiff(options) {
  if (!options || !Array.isArray(options.lines)) throw new Error('diff: lines must be an array.');
  options.lines.forEach((line) => {
    if (!line || !['added', 'removed', 'unchanged'].includes(line.type) || typeof line.content !== 'string' || /[\r\n]/.test(line.content)) throw new Error('diff: each line needs a valid type and single-line content.');
    if (line.lineNumber != null && (!Number.isInteger(line.lineNumber) || line.lineNumber < 1)) throw new Error('diff: lineNumber must be a positive integer.');
  });
}
