import { createHighlighterCoreSync, createCssVariablesTheme } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { FOLD_ARROW } from '../../shared/code-folds.mjs';
import { LINE_START, lineStart } from '../../shared/code-lines.mjs';
import { ZWSP } from '../../shared/inline-spacing.mjs';
import { LANGUAGES, languageId } from '../../shared/code-languages.mjs';
import { NAMES_CODE, autoLanguage as languageLooked, grammarOf as grammarName, grammarsFor, optionsLanguage } from '../../shared/code-grammars.mjs';
import { foldRegions, foldedLines, foldedValue, hiddenLines } from './code-folds.js';
import { validateDiff } from './diff-options.js';
import { sayCode as say } from './words.js';

// Shiki with its CSS-variables theme, with grammars for offline use: Shiki's, each on a line of its own
// before this bundle (kit-build.mjs writes them: globalThis.DocCodeGrammars), all of them on a page the
// preview serves, those its code uses in an export (src/shared/code-grammars.mjs). The languages they
// stand for: src/shared/code-languages.mjs (Bash is Shiki's shellscript).
let highlighter;
// A grammar with those it embeds, those first; none when the file carries it, or one of those, not.
function grammarList(name) {
  const carried = globalThis.DocCodeGrammars ?? {};
  const list = [];
  const add = (each) => {
    const grammar = carried[each];
    if (!grammar) return false;
    if (list.includes(grammar)) return true;
    if (!(grammar.embeddedLangs ?? []).every(add)) return false;
    list.push(grammar);
    return true;
  };
  return name && add(name) ? list : undefined;
}
// The Shiki language code is colored as (options: its language, or a path whose extension says it),
// with its grammars; none for code the kit does not color.
function grammarOf(options) {
  const lang = grammarName(optionsLanguage(options));
  return {lang, grammar:grammarList(lang)};
}
// The theme, a call's arguments in the code's own color: Shiki's css-variables theme gives a call's whole
// argument list (meta.function-call.arguments) the punctuation's color, the grey of commas and brackets,
// so the names in sum(n for n, _ in results) read fainter than a comment. That scope is taken out of the
// punctuation's rule and given the foreground (else the call's own scope, meta.function-call, would paint
// them the function's color); the brackets and commas keep the grey by their own, deeper scopes, and a
// name of a kind of its own (a constant, a string) its color (grey is for punctuation only).
const ARGUMENTS = 'meta.function-call.arguments';
function codeTheme() {
  const theme = createCssVariablesTheme({variablePrefix:'--doc-code-'});
  for (const rule of theme.tokenColors ?? []) {
    if (Array.isArray(rule.scope)) rule.scope = rule.scope.filter((scope) => scope !== ARGUMENTS);
  }
  theme.tokenColors = [...(theme.tokenColors ?? []), {scope:[ARGUMENTS], settings:{foreground:'var(--doc-code-foreground)'}}];
  return theme;
}
function tokenize(text, options) {
  const {lang, grammar} = grammarOf(options);
  if (!grammar) return text.split(/\r\n|\r|\n/).map((content) => [{content}]);
  highlighter ||= createHighlighterCoreSync({themes:[codeTheme()], langs:[], engine:createJavaScriptRegexEngine()});
  if (!highlighter.getLoadedLanguages().includes(lang)) highlighter.loadLanguageSync(...grammar);
  return highlighter.codeToTokens(text, {lang, theme:'css-variables'}).tokens;
}
function targetElement(target) {
  const element = typeof target === 'string' ? document.querySelector(target) : target;
  if (!(element instanceof HTMLElement)) throw new Error('DocCode requires a target HTMLElement.');
  return element;
}
function validateOptions(options, diff) {
  const name = diff ? 'diff' : 'code';
  for (const key of ['language', 'path']) if (options[key] !== undefined && typeof options[key] !== 'string') throw new Error(`${name}: ${key} must be a string.`);
  for (const key of ['showLineNumbers', 'coloredLineNumbers', 'showAccentStrip']) if (options[key] !== undefined && typeof options[key] !== 'boolean') throw new Error(`${name}: ${key} must be a boolean.`);
}
// A line's tokens as spans (their colors and font styles Shiki's).
function tokenSpans(tokens) {
  return (tokens || []).map((token) => {
    const span = document.createElement('span');
    span.textContent = token.content;
    if (token.color) span.style.color = token.color;
    if (token.fontStyle & 1) span.style.fontStyle = 'italic';
    if (token.fontStyle & 2) span.style.fontWeight = 'bold';
    if (token.fontStyle & 4) span.style.textDecoration = 'underline';
    return span;
  });
}
// `plain`: its lines drawn in plain text (a span a line), to be colored later (colorLater).
function render(target, lines, options, diff, {plain = false} = {}) {
  const element = targetElement(target);
  validateOptions(options, diff);
  // Plain code is highlighted as a whole to preserve multiline syntax context.
  const tokens = plain ? lines.map((line) => [{content:line.content}])
    : diff ? lines.map((line) => tokenize(line.content, options)[0]) : tokenize(lines.map((line) => line.content).join('\n'), options);
  const code = document.createElement('code');
  code.className = 'doc-code-lines';
  lines.forEach((line, index) => {
    const row = document.createElement('span');
    row.className = `doc-code-line doc-code-line--${line.type}`;
    if (options.showAccentStrip !== false && diff) row.classList.add('has-accent');
    if (options.showLineNumbers !== false) {
      row.dataset.lineNumber = line.lineNumber == null ? '' : String(line.lineNumber);
      if (diff && options.coloredLineNumbers !== false) row.classList.add('has-colored-number');
    }
    const content = document.createElement('span');
    content.className = 'doc-code-content';
    content.append(...tokenSpans(tokens[index]));
    row.append(content);
    code.append(row);
    // Gutters use CSS generated content, so textContent and copy retain only source.
    if (index < lines.length - 1) code.append('\n');
  });
  element.replaceChildren(code);
  return element;
}
// A code's lines drawn in a target, a span a line (the page editor draws the code of a block it edits
// so: src/editor/components/code/page.mjs); a report's code blocks and diffs are drawn from markup.
function drawLines(target, code, language) {
  return render(target, code.split(/\r\n|\r|\n/).map((content, i) => ({content, type:'unchanged', lineNumber:i+1})), {language, showLineNumbers:false}, false);
}
function DiffView(target, options) {
  validateDiff(options);
  return render(target, options.lines, options, true);
}
function DiffStats(target, {additions = 0, deletions = 0} = {}) {
  if (![additions, deletions].every((n) => Number.isSafeInteger(n) && n >= 0)) throw new Error('DiffStats counts must be nonnegative integers.');
  const element = targetElement(target);
  element.classList.add('doc-diff-stats');
  element.replaceChildren();
  for (const [count, kind, sign] of [[additions, 'added', '+'], [deletions, 'removed', '−']]) {
    if (!count) continue;
    const span = document.createElement('span');
    span.className = `doc-diff-${kind}`;
    span.textContent = `${sign}${count}`;
    element.append(span);
  }
  element.hidden = additions === 0 && deletions === 0;
  element.setAttribute('aria-label', say('diff-counts', additions, deletions));
  return element;
}
// ---------- code blocks ----------
// A code block (div.doc-code): its title (.doc-code-title), then its code (a pre), on a soft
// panel. The kit draws the header around the title: a fold arrow before it, and after
// it a toolbar shown while the pointer is over the block (its language, copy, wrap). The arrow and the
// wrap button switch the block's classes (doc-code--folded; doc-code--nowrap, its long lines
// scrolled, which wrap unless it has it); the preview editor does that itself, as an edit, and its
// language label opens a menu of languages there (src/editor/components/code/page.mjs). A line that
// starts a structure (a brace's content, a Python body, an element…, code-folds.js) has an arrow
// left of its number, which folds it: the lines inside hidden, "…" after it (data-folded-lines, the
// numbers of the lines folded; the editor switches it as an edit too). An excerpt of a file
// (data-line-start) shows its range of lines beside its title, 第 120–139 行, worked out from its first
// line's number and how many lines it has, so that no title has to say it (and none says it wrong):
// the title is the block's own text, which the kit never writes in; the range follows the lines as
// they change (the editor draws the header again as the reader types). A block numbered from 1 by
// default shows none: its numbers are its own.

const FOLDED = 'doc-code--folded';
const NOWRAP = 'doc-code--nowrap';
const FOLDED_LINES = 'data-folded-lines';
const NAMES = Object.fromEntries(LANGUAGES.map(({id, name}) => [id, name]));
const ICONS = {
  // The fold triangle, drawn with round joins, so its corners are round.
  fold: FOLD_ARROW,
  // Whole 16-unit boxes: a box fitted to the drawing would cut its last stroke at a fraction of a pixel.
  copy: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5"/><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/></svg>',
  // The check in a box as large as the copy icon's, so it shows as large as that one's drawing.
  check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.25 8.25 3.25 3.25 6.25-7"/></svg>',
  wrap: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M12.5 4v4a1.5 1.5 0 0 1-1.5 1.5H3.75M6.25 7 3.5 9.75 6.25 12.5"/></svg>',
  // A copy that failed: a cross where the check would be.
  failed: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 4.5 7 7m0-7-7 7"/></svg>',
};

const titleOf = (block) => block.querySelector(':scope > .doc-code-title');
const preOf = (block) => block.querySelector(':scope > pre');
/**
 * The language a code block written without one is highlighted as (自动识别): its title's file
 * extension, when the kit knows it, else what its code looks like (src/shared/code-grammars.mjs, the rule an
 * export's reading of a page's blocks shares); undefined when neither tells. `text`: its code, when the caller has it.
 */
function autoLanguage(block, text) {
  return languageLooked(titleOf(block)?.textContent, () => text ?? codeText(block));
}
/** The language a code block is highlighted as: its own (data-language), else the one it looks like. */
function languageOf(block, text) {
  if (!block) return undefined;
  const own = block.dataset.language || preOf(block)?.querySelector('code')?.className.match(/(?:^|\s)language-([\w-]+)/)?.[1];
  return own || autoLanguage(block, text);
}
// The grammars the code blocks and diffs under `root` (a page, or the copy of one an export of the view makes,
// a template's content too) are colored with, by name; null for all of them, where a script of the page (any
// script but the kit's: one a component package runs too) may draw code of any language (NAMES_CODE).
// What the reader's export of the view carries of code.js (ui.js; src/shared/code-grammars.mjs).
function grammarsUsed(root) {
  const roots = [root, ...[...root.querySelectorAll('template')].map((template) => template.content)];
  const all = (selector) => roots.flatMap((each) => [...each.querySelectorAll(selector)]);
  const scripts = all('script:not([data-doc-kit]):not([data-doc-vendor])').filter((script) => !script.type || !/json/i.test(script.type));
  const handlers = all('*').some((node) => [...node.attributes].some(({name, value}) => (/^on/i.test(name) || /^\s*javascript:/i.test(value)) && NAMES_CODE.test(value)));
  if (handlers || scripts.some((script) => NAMES_CODE.test(script.textContent))) return null;
  const languages = all('.doc-code').map((block) => languageOf(block));
  for (const block of all('.doc-diff')) {
    const config = [...block.children].find(isConfig);
    try {
      languages.push(optionsLanguage(JSON.parse(config?.textContent ?? 'null')));
    } catch {}
  }
  return grammarsFor(languages);
}
/** What a language is called in the header (plain text in the page's language: words.js). */
function languageName(language) {
  const id = languageId(language);
  if (!id || id === 'text') return say('plain-text');
  return NAMES[id] ?? id.toUpperCase();
}
// A code block's code as text: what copying takes (no line numbers, nothing of the editor's).
function codeText(block) {
  const source = block.matches('.doc-diff') ? block.querySelector(':scope > .doc-diff-body') : preOf(block);
  if (!source) return '';
  const copy = source.cloneNode(true);
  copy.querySelectorAll('[data-doc-dev]').forEach((node) => node.remove());
  return copy.textContent.replaceAll(ZWSP, '').replace(/\n$/, '');
}

// Text copied the old way, where the page has no clipboard to write to (navigator.clipboard is there only
// on a secure page): a hidden field holding it, selected and copied, then gone; the focus back where it was.
function copyByCommand(text, from) {
  const focused = document.activeElement;
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.setAttribute('aria-hidden', 'true');
  field.setAttribute('data-doc-dev', '');
  field.style.cssText = 'position: fixed; top: 0; left: 0; width: 1px; height: 1px; opacity: 0; pointer-events: none;';
  (from.closest('dialog[open]') ?? document.body).append(field);
  let copied = false;
  try {
    field.select();
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  field.remove();
  if (focused instanceof HTMLElement) focused.focus({preventScroll:true});
  return copied;
}

function button(className, label, icon) {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = className;
  node.setAttribute('aria-label', label); // no title: a browser's square tooltip says nothing the icon does not
  node.innerHTML = icon;
  return node;
}

/**
 * The header around a code block's (or a diff's) title: the fold arrow before it, the toolbar after
 * it (the language, or a diff's counts; the wrap button for a code block; the copy button), made once
 * and brought up to date (the language follows data-language). The editor calls it for the blocks it
 * makes.
 */
function decorate(block) {
  const title = titleOf(block);
  const diff = block.matches('.doc-diff');
  let fold = block.querySelector(':scope > .doc-code-fold');
  if (!fold) {
    fold = button('doc-code-fold', say('fold-code'), ICONS.fold);
    fold.addEventListener('click', () => {
      block.classList.toggle(FOLDED);
      fold.setAttribute('aria-expanded', String(!block.classList.contains(FOLDED)));
    });
    block.prepend(fold);
    // A line's arrow folds or unfolds its structure; the "…" after a folded one unfolds it.
    if (!diff) block.addEventListener('click', (event) => {
      const target = event.target.closest?.('.doc-code-line-fold, .doc-code-line-more');
      const row = target?.closest('.doc-code-line');
      if (!row || !block.contains(row)) return;
      const line = [...row.parentElement.children].indexOf(row);
      const folded = foldedLines(block.getAttribute(FOLDED_LINES));
      if (folded.has(line)) folded.delete(line);
      else if (target.matches('.doc-code-line-fold')) folded.add(line);
      const value = foldedValue(folded);
      if (value) block.setAttribute(FOLDED_LINES, value);
      else block.removeAttribute(FOLDED_LINES);
      foldLines(block);
    });
  }
  let tools = block.querySelector(':scope > .doc-code-tools');
  if (!tools) {
    tools = document.createElement('span');
    tools.className = 'doc-code-tools';
    const bar = document.createElement('span');
    bar.className = 'doc-code-toolbar';
    const label = document.createElement('span');
    label.className = diff ? 'doc-diff-stats' : 'doc-code-language';
    const line = document.createElement('span');
    line.className = 'doc-code-separator';
    const copy = button('doc-code-copy', say('copy-code'), ICONS.copy);
    // The clipboard's, else the old way (a page with no clipboard: an export over plain http); a check
    // when it is copied, a cross and its words when neither could, for a moment.
    copy.addEventListener('click', async () => {
      const text = codeText(block);
      let copied;
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch {
        copied = copyByCommand(text, copy);
      }
      copy.innerHTML = copied ? ICONS.check : ICONS.failed;
      copy.setAttribute('aria-label', say(copied ? 'copied' : 'copy-failed'));
      setTimeout(() => {
        copy.innerHTML = ICONS.copy;
        copy.setAttribute('aria-label', say('copy-code'));
      }, 1500);
    });
    bar.append(label, line, copy);
    if (!diff) {
      const wrap = button('doc-code-wrap', '', ICONS.wrap);
      wrap.addEventListener('click', () => {
        block.classList.toggle(NOWRAP);
        decorate(block);
      });
      bar.append(wrap);
    }
    tools.append(bar);
    (title ?? fold).after(tools);
  }
  if (!diff) showRange(block);
  // The arrow says whether the code shows (to a screen reader), as a line's arrow does.
  const open = String(!block.classList.contains(FOLDED));
  if (fold.getAttribute('aria-expanded') !== open) fold.setAttribute('aria-expanded', open);
  if (!diff) {
    const label = tools.querySelector('.doc-code-language');
    const name = languageName(languageOf(block));
    if (label.textContent !== name) label.textContent = name;
    // The wrap button says what it does: the lines wrap unless the block scrolls them.
    const wrap = tools.querySelector('.doc-code-wrap');
    const wraps = !block.classList.contains(NOWRAP);
    const says = say(wraps ? 'no-wrap' : 'wrap');
    if (wrap.getAttribute('aria-label') !== says) {
      wrap.setAttribute('aria-label', says);
      wrap.setAttribute('aria-pressed', String(wraps));
    }
  }
  return block;
}

// How many lines a code block shows: the kit's drawn lines, else the lines of its code as it stands
// (the editor's open code, or code not drawn yet).
function lineCount(block) {
  const drawn = preOf(block)?.querySelector(':scope > code.doc-code-lines');
  return drawn ? drawn.querySelectorAll(':scope > .doc-code-line').length : codeText(block).split('\n').length;
}
/** An excerpt's range of lines beside its title (.doc-code-range), or none for a block without data-line-start. */
function showRange(block) {
  const first = lineStart(block.getAttribute(LINE_START));
  let range = block.querySelector(':scope > .doc-code-range');
  if (first === null) return range?.remove();
  const last = first + Math.max(1, lineCount(block)) - 1;
  const text = last > first ? say('lines', first, last) : say('line', first);
  if (!range) {
    range = document.createElement('span');
    range.className = 'doc-code-range';
    (titleOf(block) ?? block.querySelector(':scope > .doc-code-fold')).after(range);
  }
  if (range.textContent !== text) range.textContent = text;
}

// A code block's lines highlighted in its pre (as written, or as the export of a view left them);
// one whose code is being edited is its editor's. Its lines are numbered from 1, or from the number
// its data-line-start gives (an excerpt numbered as in its file: src/shared/code-lines.mjs). A line
// break ending its code (a Markdown renderer writes one before </code>) ends its last line, as in
// the page editor's lines (codeText), not one more, empty and numbered: it stays in the code's text
// after the last line, where it shows nothing (styles/code.css).
// `later`: its colors once the page is idle (colorLater), its lines drawn now in plain text.
function highlight(block, {later = false} = {}) {
  const pre = preOf(block);
  if (!pre || pre.querySelector('[contenteditable="true"]')) return;
  const code = pre.querySelector('code');
  const text = (code || pre).textContent;
  const ending = /(?:\r\n|\r|\n)$/.exec(text)?.[0] ?? '';
  const lines = text.slice(0, text.length - ending.length).split(/\r\n|\r|\n/);
  const first = lineStart(block.getAttribute(LINE_START)) ?? 1;
  const options = {language:languageOf(block), showLineNumbers:block.dataset.lineNumbers !== 'false'};
  const plain = later && Boolean(grammarOf(options).grammar); // code the kit does not color is drawn as it is
  // A language its code's language-<id> class gave (a block written without data-language) stays on the code drawn
  // in its place: its colors later, its folds and its label read the language it was drawn in, as an export does
  // (src/shared/code-grammars.mjs), never what its code looks like once the class is gone.
  const classed = block.dataset.language ? null : code?.className.match(/(?:^|\s)(language-[\w-]+)/)?.[1];
  render(pre, lines.map((content, i) => ({content, type:'unchanged', lineNumber:first + i})), options, false, {plain});
  if (classed) pre.querySelector(':scope > code')?.classList.add(classed);
  if (ending) pre.querySelector(':scope > code')?.append(ending);
  // Its numbers as wide as its last one (styles/code.css).
  pre.querySelector(':scope > code')?.style.setProperty('--doc-code-digits', String(String(first + lines.length - 1).length));
  foldLines(block);
  showRange(block);
  if (plain) colorLater(pre.querySelector(':scope > code'));
}

// ---------- colors once the page shows ----------
// The page's code blocks are drawn as it renders with their lines in plain text: their rows, numbers,
// folds and ranges, everything that lays them out (colors change no width: one monospace font). Their
// colors (Shiki's tokens, from the JavaScript regex engine: about 0.4 s for a guide of fifteen code
// blocks, which held the page's first paint) come after the frame the page shows in, while the page is
// idle, the blocks near the window first; each block's lines take its tokens, the same spans as a
// block drawn at once. A block is colored as it is drawn then: one drawn again meanwhile (draw: its
// language picked in the page editor) or opened for editing (its code the editor's, which colors it
// itself) is left alone; one taken off the page (a cut, a move) is colored once it is back in sight.
// colorAll colors every block still waiting at once: an export of the view (ui.js), printing, a
// picture or PDF of the page (src/transfer/browser.mjs settle).
const waiting = new Set(); // code elements drawn plain, in the page's order
const near = new Set(); // those near the window
const plainCode = new WeakSet(); // every code element drawn plain and not colored yet
let sight = null; // IntersectionObserver of the plain code elements
let scheduled = false;
function colorLater(code) {
  if (!code) return;
  plainCode.add(code);
  waiting.add(code);
  sight ??= globalThis.IntersectionObserver ? new IntersectionObserver((entries) => {
    for (const {target, isIntersecting} of entries) if (isIntersecting && plainCode.has(target)) {
      waiting.add(target);
      near.add(target);
    }
    schedule();
  }, {rootMargin:'400px 0px'}) : null;
  sight?.observe(code);
  schedule();
}
const idle = globalThis.requestIdleCallback ? (run) => requestIdleCallback(run, {timeout:2000}) : (run) => setTimeout(() => run({timeRemaining:() => 10}), 1);
function schedule() {
  if (scheduled || waiting.size === 0) return;
  scheduled = true;
  requestAnimationFrame(() => idle(colorSome)); // after the frame the page shows in (ui.js reveals it on the frame after DOMContentLoaded)
}
function colorSome(deadline) {
  scheduled = false;
  do {
    const code = near.values().next().value ?? waiting.values().next().value;
    if (!code) break;
    color(code);
  } while (deadline.timeRemaining() > 0);
  schedule();
}
function color(code) {
  waiting.delete(code);
  near.delete(code);
  const pre = code.parentElement;
  const block = pre?.parentElement;
  if (!code.isConnected) {
    // Off the page with its block (it may come back: an undo puts the same nodes back) it waits to be
    // in sight again; drawn again, or its code opened, it is done with.
    if (pre?.isConnected) {
      plainCode.delete(code);
      sight?.unobserve(code);
    }
    return;
  }
  plainCode.delete(code);
  sight?.unobserve(code);
  if (!block || preOf(block) !== pre || pre.querySelector('[contenteditable="true"]')) return;
  const contents = [...code.children].filter((row) => row.classList.contains('doc-code-line')).map((row) => row.querySelector(':scope > .doc-code-content'));
  const tokens = tokenize(contents.map((content) => content?.textContent ?? '').join('\n'), {language:languageOf(block)});
  contents.forEach((content, index) => content?.replaceChildren(...tokenSpans(tokens[index])));
}
function colorAll() {
  for (const code of [...waiting]) color(code);
}
globalThis.addEventListener?.('beforeprint', colorAll);

/**
 * A code block's lines folded as it says (data-folded-lines): an arrow left of the number of each
 * line that starts a structure (in the column under the block's own fold arrow); a folded one turned,
 * the lines inside it hidden and "…" after it. Kept up to date (the language, the folded lines changing).
 */
function foldLines(block) {
  const pre = preOf(block);
  const lines = pre?.querySelector(':scope > code.doc-code-lines');
  if (!lines) return;
  const rows = [...lines.children].filter((row) => row.classList.contains('doc-code-line'));
  const text = rows.map((row) => row.querySelector(':scope > .doc-code-content')?.textContent ?? '').join('\n');
  const language = languageId(languageOf(block, text));
  const regions = foldRegions(text, language);
  const folded = new Set([...foldedLines(block.getAttribute(FOLDED_LINES))].filter((line) => regions.has(line)));
  const hidden = hiddenLines(regions, folded);
  rows.forEach((row, line) => {
    let arrow = row.querySelector(':scope > .doc-code-line-fold');
    if (!regions.has(line)) arrow?.remove();
    else if (!arrow) {
      arrow = button('doc-code-line-fold', say('fold'), ICONS.fold);
      arrow.removeAttribute('title');
      row.prepend(arrow);
    }
    const shut = folded.has(line);
    row.classList.toggle('doc-code-line--folded', shut);
    row.classList.toggle('doc-code-line--hidden', hidden.has(line));
    if (arrow) {
      arrow.setAttribute('aria-label', say(shut ? 'unfold' : 'fold'));
      arrow.setAttribute('aria-expanded', String(!shut));
    }
    let more = row.querySelector(':scope > .doc-code-line-more');
    if (!shut) more?.remove();
    else if (!more) {
      more = button('doc-code-line-more', say('unfold'), '');
      more.removeAttribute('title');
      row.append(more);
    }
  });
}

// The editor's code blocks are drawn with drawLines and decorated, drawn again (draw) when their language
// changes, their lines folded again (fold) when their folded lines do; its language menu lists the
// languages, and its open code folds as the kit's (src/editor/components/code/page.mjs).
globalThis.DocCode = Object.freeze({
  drawLines, decorate, draw:(block) => highlight(block), fold:foldLines, languageOf, autoLanguage, languageName, languages:LANGUAGES,
  // Every code block the page drew in plain text colored now (colorLater).
  colorAll,
  // The grammars a page's code is colored with (grammarsUsed): what the reader's export of the view carries.
  grammarsUsed,
  // The regions of code in a language (any of its names), the lines folding hides, data-folded-lines read and written.
  folds:Object.freeze({
    regions:(text, language) => foldRegions(text, languageId(language)),
    hiddenLines, foldedLines, foldedValue,
  }),
});
globalThis.ReportCode = globalThis.DocCode; // its old name (before 2026-10-26), for a script no tool rewrote (shared/old-names.mjs)

// A diff (div.doc-diff): its title and its options as JSON ({ path, lines: [{ type: "added" |
// "removed" | "unchanged", content, lineNumber? }] }); the lines are drawn in a body it gets
// (.doc-diff-body), and its header shows how many it adds and removes. A whole block: an export
// of the view keeps its markup alone, and the copy draws it again.
const isConfig = (node) => node.localName === 'script' && node.type === 'application/json';
function startDiff(block) {
  const config = [...block.children].find(isConfig);
  if (!config) return null;
  let options;
  try {
    options = JSON.parse(config.textContent);
  } catch (error) {
    throw new Error(`DocCode: the options of a diff are not valid JSON (${error.message}).`);
  }
  decorate(block);
  const body = document.createElement('div');
  body.className = 'doc-diff-body';
  DiffView(body, options);
  config.after(body);
  const count = (type) => options.lines.filter((line) => line.type === type).length;
  DiffStats(block.querySelector('.doc-diff-stats'), {additions:count('added'), deletions:count('removed')});
  return null;
}

// The kit's runtime (DocKit) draws the page's code blocks once it has loaded, each on its own (one
// that fails leaves the others), their colors once the page shows (colorLater); the code blocks the
// editor makes later are its own. It draws declared diffs as code blocks are, and those put back
// later (an undo). An export of the view takes what it drew off again (the components' generated nodes).
if (!globalThis.DocKit) throw new Error('DocCode requires /kit/runtime.js to be loaded first.');
globalThis.DocKit.component({id:'code', added:false, mount(block) { decorate(block); highlight(block, {later:true}); return null; }});
globalThis.DocKit.component({id:'diff', owns:true, mount:startDiff});
