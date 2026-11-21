import { MARKDOWN } from "../../components/registry.mjs";

// What typed Markdown turns into (docs/editor.md, "New blocks and conversions"): pure functions of
// the text, tested without a browser (tests/unit/editor.mjs). index.mjs applies them as the reader
// types. A shortcut at a block's start is its type's (`markdown`), the inline marks are no block's.

/**
 * The shortcut `text`, all that stands before the caret in a block, is, the first in the order of the
 * definitions (the first rule that matches wins): its rule with what it sets (`props`), or null. alone:
 * nothing else is written in the block, as a rule that says `alone` asks. takes(type): whether the
 * block may become the type.
 */
export function markdownShortcut(text, { alone = false, takes = () => true } = {}) {
  for (const rule of MARKDOWN) {
    const match = rule.match.exec(text);
    if (!match || (rule.alone && !alone) || !takes(rule.type)) continue;
    const props = rule.props ? rule.props(match) : {};
    if (props !== null) return { ...rule, props };
  }
  return null;
}

/**
 * Inline Markdown closed at the end of `text`: **bold** or `code`. Returns { name, start, end,
 * inner } (offsets into text; inner excludes the markers), or null.
 */
export function inlineMark(text) {
  const bold = /\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/.exec(text);
  if (bold) return { name: "bold", start: bold.index, end: text.length, inner: [bold.index + 2, text.length - 2] };
  const code = /`([^`\s](?:[^`]*[^`\s])?)`$/.exec(text);
  if (code) return { name: "code", start: code.index, end: text.length, inner: [code.index + 1, text.length - 1] };
  return null;
}
