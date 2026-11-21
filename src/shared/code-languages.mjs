// The languages of the kit's code blocks: those code.js bundles grammars for, as a code block's
// data-language names them and its header shows them, and what the code of a block written
// without one looks like (自动识别). In src/shared, so that what reads it is one: the kit's code.js, a code block
// pasted from Notion (the page editor's clipboard/import/to-blocks.mjs) and the editor's tests.

/** In the order the language menu lists them; id: what data-language holds; words: what finds it. */
export const LANGUAGES = [
  { id: 'text', name: '纯文本', words: 'text plain txt 纯文本 chunwenben cwb' },
  { id: 'bash', name: 'Bash', words: 'bash shell sh zsh shellscript' },
  { id: 'css', name: 'CSS', words: 'css' },
  { id: 'html', name: 'HTML', words: 'html htm' },
  { id: 'javascript', name: 'JavaScript', words: 'javascript js mjs cjs' },
  { id: 'json', name: 'JSON', words: 'json' },
  { id: 'jsx', name: 'JSX', words: 'jsx react' },
  { id: 'markdown', name: 'Markdown', words: 'markdown md' },
  { id: 'python', name: 'Python', words: 'python py' },
  { id: 'sql', name: 'SQL', words: 'sql' },
  { id: 'tsx', name: 'TSX', words: 'tsx react' },
  { id: 'typescript', name: 'TypeScript', words: 'typescript ts' },
  { id: 'yaml', name: 'YAML', words: 'yaml yml' },
];

// Other names of those languages, file extensions among them.
const ALIASES = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'typescript', mts: 'typescript', cts: 'typescript', py: 'python',
  htm: 'html', sh: 'bash', shell: 'bash', zsh: 'bash', shellscript: 'bash', yml: 'yaml', md: 'markdown',
  txt: 'text', plain: 'text', plaintext: 'text',
};

/** A language's id from any of its names (an unknown name as it is, lowercased; "" for none). */
export const languageId = (name) => {
  const id = String(name ?? '').trim().toLowerCase();
  return ALIASES[id] ?? id;
};

/** Whether the kit knows a language by this name. */
export const knownLanguage = (name) => LANGUAGES.some((language) => language.id === languageId(name));

/**
 * The language code looks like: one of LANGUAGES but text, or null when it looks like none of them
 * (or is too short to tell). What a code block without a language of its own is highlighted as.
 */
export function guessLanguage(text) {
  const code = String(text ?? '').trim();
  if (code.replace(/\s/g, '').length < 6) return null;
  if (/^[[{]/.test(code)) {
    try {
      JSON.parse(code);
      return 'json';
    } catch {}
  }
  if (/^<(!doctype|[a-z][\w-]*)([\s>]|\/>)/i.test(code) && /<\/[a-z][\w-]*>|\/>/i.test(code)) return 'html';
  const script = /\b(const|let|var|function|return|import|export|class|new|await|async|typeof)\b|=>|console\.\w|document\.|\bwindow\./.test(code);
  if (/^\s*(def \w+\s*\(|class \w+(\(.*\))?:\s*$|from [\w.]+ import |import [\w.]+(\s+as \w+)?\s*$|print\(|if __name__ ==|elif\b|@\w+\s*$)/m.test(code) && !/[{};]\s*$/m.test(code)) return 'python';
  if (/^\s*(select\b[\s\S]*\bfrom\b|insert\s+into\b|update\s+\w+\s+set\b|delete\s+from\b|create\s+(table|view|index)\b|with\s+\w+\s+as\s*\()/im.test(code)) return 'sql';
  if (/^\s*(\$ |#!\/|(npm|npx|pnpm|yarn|git|cd|ls|echo|curl|wget|sudo|pip3?|brew|apt(-get)?|docker|kubectl|mkdir|rm|cp|mv|cat|grep|chmod|export)\s)/m.test(code) && !script) return 'bash';
  if (/^\s*[^{};\n]+\{\s*[\w-]+\s*:[^;{}]+;?/m.test(code) && !script) return 'css';
  if (script) {
    // JSX: an element closed, or closing itself (a type's <T> closes nothing).
    const jsx = /<\/[A-Za-z][\w.]*>|<[A-Za-z][\w.]*(\s[^<>]*)?\/>/.test(code);
    // TypeScript: a type declared, a parameter's or a return type, a basic type named, `as const`, an enum.
    const typed = /\b(interface|type)\s+\w+\s*[={<]|\(\s*\w+\??\s*:\s*[\w<[\]|]+|\)\s*:\s*[\w<[\]|]+\s*(=>|\{)|\w\s*:\s*(string|number|boolean|void|unknown|any|never)\b|\bas\s+const\b|\benum\s+\w+/.test(code);
    return typed ? (jsx ? 'tsx' : 'typescript') : jsx ? 'jsx' : 'javascript';
  }
  const lines = code.split('\n').filter((line) => line.trim() && !line.trim().startsWith('#'));
  const keyed = /^\s*(- )?[\w"'.-]+:(\s|$)/;
  if (lines.length > 1 && lines.every((line) => keyed.test(line) || /^\s*- \S/.test(line)) && lines.some((line) => keyed.test(line))) return 'yaml';
  if (/^#{1,6}\s+\S/m.test(code) || /^```/m.test(code) || /\[[^\]\n]+\]\([^)\s]+\)/.test(code) || /\*\*[^*\n]+\*\*/.test(code)) return 'markdown';
  return null;
}
