// Folding a code block's structure (line folds, found by scanners without a parser):
// the regions a line's structure spans, found by language family:
//   brackets   JSON, JavaScript / TypeScript (JSX / TSX with parentheses too), CSS: { … } and [ … ],
//              /* … */ comments, strings and line comments skipped
//   indent     Python: a body after `:`, brackets over several lines; YAML: deeper-indented children,
//              flow brackets
//   tags       HTML: an element's content, from its open tag's end to its close tag's start
//   statements SQL: a statement after its first word up to its `;`, /* … */ comments
//   keywords   Bash: if … fi, for / while / until … done, case … esac, { … }, ( … )
//   headings   Markdown: a heading's section (up to the next heading as high), a fenced block
// A line folds when a region starts on it and ends on a later line (its outermost such region);
// folding it hides the lines after it that lie entirely inside the region (a closing `}` line stays).
// Plain functions: the kit's code blocks (code.js) and the editor's open code use them alike.

const FAMILIES = {
  json: 'json', javascript: 'script', typescript: 'script', jsx: 'markup', tsx: 'markup', css: 'css',
  html: 'html', python: 'python', yaml: 'yaml', sql: 'sql', bash: 'bash', markdown: 'markdown',
};

/** Whether the structure of code in this language (its id, src/shared/code-languages.mjs) folds. */
export const foldsLanguage = (language) => Boolean(FAMILIES[language]);

const CLOSE = { '{': '}', '[': ']', '(': ')' };

// Matching brackets (outside strings and comments) and block comments.
function bracketRanges(text, { open, lineComments = [], blockComment = null, strings = [] }) {
  const out = [];
  const stack = [];
  const closers = new Set([...open].map((bracket) => CLOSE[bracket]));
  let i = 0;
  while (i < text.length) {
    if (lineComments.some((comment) => text.startsWith(comment, i))) {
      const end = text.indexOf('\n', i);
      i = end < 0 ? text.length : end;
      continue;
    }
    if (blockComment && text.startsWith(blockComment[0], i)) {
      const end = text.indexOf(blockComment[1], i + blockComment[0].length);
      const stop = end < 0 ? text.length : end;
      out.push({ from: i + blockComment[0].length, to: stop });
      i = stop + blockComment[1].length;
      continue;
    }
    const quote = strings.find((mark) => text.startsWith(mark, i));
    if (quote) {
      let j = i + quote.length;
      while (j < text.length && !text.startsWith(quote, j)) {
        if (text[j] === '\\') j++;
        else if (quote.length === 1 && quote !== '`' && text[j] === '\n') break;
        j++;
      }
      i = j + quote.length;
      continue;
    }
    const char = text[i];
    if (open.includes(char)) stack.push({ char, at: i });
    else if (closers.has(char) && stack.length > 0 && CLOSE[stack[stack.length - 1].char] === char) {
      const start = stack.pop();
      out.push({ from: start.at + 1, to: i });
    }
    i++;
  }
  return out;
}

const lineStarts = (text) => {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return starts;
};

// A line's indentation (a tab to the next multiple of 4), or -1 for a blank (or comment) line.
function indentOf(line, comment) {
  let width = 0;
  for (const char of line) {
    if (char === ' ') width++;
    else if (char === '\t') width += 4 - (width % 4);
    else return comment && line.trimStart().startsWith(comment) ? -1 : width;
  }
  return -1;
}

// Indented bodies: a line (ending with `:` when `colon`) followed by deeper lines folds from its end
// to the end of the last deeper line.
function indentRanges(text, comment, colon) {
  const lines = text.split('\n');
  const starts = lineStarts(text);
  const indents = lines.map((line) => indentOf(line, comment));
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (indents[i] < 0 || (colon && !/:\s*(#.*)?$/.test(lines[i]))) continue;
    let end = i;
    for (let j = i + 1; j < lines.length; j++) {
      if (indents[j] < 0) continue;
      if (indents[j] <= indents[i]) break;
      end = j;
    }
    if (end > i) out.push({ from: starts[i] + lines[i].length, to: starts[end] + lines[end].length });
  }
  return out;
}

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

// Elements, from the end of the open tag to the start of the close tag; comments.
function tagRanges(text) {
  const out = [];
  const stack = [];
  const tag = /<!--[\s\S]*?(?:-->|$)|<[!?][^>]*>|<\/\s*([\w:.-]+)\s*>|<([\w:.-]+)(?:"[^"]*"|'[^']*'|[^'">])*?(\/?)>/g;
  for (let match = tag.exec(text); match; match = tag.exec(text)) {
    if (match[0].startsWith('<!--')) {
      out.push({ from: match.index + 4, to: match.index + match[0].length - (match[0].endsWith('-->') ? 3 : 0) });
      continue;
    }
    if (match[1]) {
      const name = match[1].toLowerCase();
      const at = stack.map((entry) => entry.name).lastIndexOf(name);
      if (at >= 0) {
        out.push({ from: stack[at].end, to: match.index });
        stack.length = at;
      }
    } else if (match[2] && !match[3]) {
      const name = match[2].toLowerCase();
      if (VOID_TAGS.has(name)) continue;
      stack.push({ name, end: match.index + match[0].length });
      // Raw text: on to its close tag.
      if (name === 'script' || name === 'style') {
        const close = text.toLowerCase().indexOf(`</${name}`, tag.lastIndex);
        if (close >= 0) tag.lastIndex = close;
      }
    }
  }
  return out;
}

// SQL statements (after their first word, up to the `;`) and block comments.
function statementRanges(text) {
  const out = bracketRanges(text, { open: '', lineComments: ['--', '#'], blockComment: ['/*', '*/'], strings: ["'", '"', '`'] });
  let start = -1;
  let i = 0;
  const flush = (end) => {
    if (start < 0) return;
    const word = /^\s*\S+/.exec(text.slice(start, end));
    if (word) out.push({ from: start + word[0].length, to: end });
    start = -1;
  };
  while (i < text.length) {
    if (text.startsWith('--', i) || text[i] === '#') {
      const end = text.indexOf('\n', i);
      i = end < 0 ? text.length : end;
      continue;
    }
    if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 2;
      continue;
    }
    const char = text[i];
    if (char === "'" || char === '"' || char === '`') {
      const end = text.indexOf(char, i + 1);
      if (start < 0) start = i;
      i = end < 0 ? text.length : end + 1;
      continue;
    }
    if (char === ';') flush(i);
    else if (start < 0 && !/\s/.test(char)) start = i;
    i++;
  }
  flush(text.length);
  return out;
}

// Shell: keyword pairs and brackets.
function shellRanges(text) {
  const out = bracketRanges(text, { open: '{(', lineComments: ['#'], strings: ["'", '"'] });
  const opens = { if: 'fi', case: 'esac', for: 'done', while: 'done', until: 'done' };
  const stack = [];
  const word = /(?:^|[\s;&|(){}])(if|then|fi|case|esac|for|while|until|do|done)(?=$|[\s;&|(){}])/g;
  // Strings and comments blanked out, so the keywords in them do not count.
  const code = text.replace(/#[^\n]*|'[^']*'|"(?:\\.|[^"\\])*"/g, (part) => ' '.repeat(part.length));
  for (let match = word.exec(code); match; match = word.exec(code)) {
    const keyword = match[1];
    const end = match.index + match[0].length;
    if (opens[keyword]) stack.push({ close: opens[keyword], from: end });
    else if (keyword === 'fi' || keyword === 'esac' || keyword === 'done') {
      const at = stack.map((entry) => entry.close).lastIndexOf(keyword);
      if (at >= 0) {
        out.push({ from: stack[at].from, to: end - keyword.length });
        stack.length = at;
      }
    }
  }
  return out;
}

// Markdown: a heading's section, up to the next heading as high (blank lines before it left out),
// and a fenced block's content.
function markdownRanges(text) {
  const lines = text.split('\n');
  const starts = lineStarts(text);
  const out = [];
  const end = (line) => starts[line] + lines[line].length;
  let fence = -1;
  const headings = [];
  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      if (fence < 0) fence = index;
      else {
        out.push({ from: end(fence), to: starts[index] });
        fence = -1;
      }
      return;
    }
    const heading = fence < 0 && /^(#{1,6})\s+\S/.exec(line);
    if (heading) headings.push({ line: index, level: heading[1].length });
  });
  headings.forEach((heading, index) => {
    const next = headings.slice(index + 1).find((other) => other.level <= heading.level);
    let last = (next ? next.line : lines.length) - 1;
    while (last > heading.line && !lines[last].trim()) last--;
    if (last > heading.line) out.push({ from: end(heading.line), to: end(last) });
  });
  return out;
}

function rangesOf(text, language) {
  switch (FAMILIES[language]) {
    case 'json': return bracketRanges(text, { open: '{[', strings: ['"'] });
    case 'script': return bracketRanges(text, { open: '{[', lineComments: ['//'], blockComment: ['/*', '*/'], strings: ['`', '"', "'"] });
    case 'markup': return bracketRanges(text, { open: '{[(', lineComments: ['//'], blockComment: ['/*', '*/'], strings: ['`', '"', "'"] });
    case 'css': return bracketRanges(text, { open: '{', blockComment: ['/*', '*/'], strings: ['"', "'"] });
    case 'html': return tagRanges(text);
    case 'python': return [...indentRanges(text, '#', true), ...bracketRanges(text, { open: '([{', lineComments: ['#'], strings: ['"""', "'''", '"', "'"] })];
    case 'yaml': return [...indentRanges(text, '#', false), ...bracketRanges(text, { open: '[{', lineComments: ['#'], strings: ['"', "'"] })];
    case 'sql': return statementRanges(text);
    case 'bash': return shellRanges(text);
    case 'markdown': return markdownRanges(text);
    default: return [];
  }
}

/**
 * The lines of code that fold: line index -> { from, to, last }, its outermost region starting on
 * it and ending on a later line ([from, to) in the text) and the last line folding it hides.
 */
export function foldRegions(text, language) {
  const out = new Map();
  if (!foldsLanguage(language)) return out;
  const starts = lineStarts(text);
  const lineOf = (at) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (starts[middle] <= at) low = middle;
      else high = middle - 1;
    }
    return low;
  };
  const lineEnd = (line) => (line + 1 < starts.length ? starts[line + 1] - 1 : text.length);
  for (const range of rangesOf(text, language)) {
    const line = lineOf(range.from);
    if (range.to <= lineEnd(line)) continue;
    let last = line;
    while (last + 1 < starts.length && lineEnd(last + 1) <= range.to) last++;
    if (last === line) continue;
    const before = out.get(line);
    if (!before || range.from < before.from || (range.from === before.from && range.to > before.to)) out.set(line, { ...range, last });
  }
  return out;
}

/** The lines folding hides: those inside a folded line's region (a folded line itself shows). */
export function hiddenLines(regions, folded) {
  const hidden = new Set();
  for (const line of [...regions.keys()].sort((a, b) => a - b)) {
    if (!folded.has(line) || hidden.has(line)) continue;
    for (let next = line + 1; next <= regions.get(line).last; next++) hidden.add(next);
  }
  return hidden;
}

/** The lines a code block has folded (0-based), from its data-folded-lines (1-based numbers). */
export const foldedLines = (value) => new Set(String(value ?? '').split(/\s+/).filter((part) => /^[1-9]\d*$/.test(part)).map((part) => Number(part) - 1));

/** Folded lines (0-based) as data-folded-lines writes them, or null for none. */
export const foldedValue = (lines) => [...lines].sort((a, b) => a - b).map((line) => line + 1).join(' ') || null;
