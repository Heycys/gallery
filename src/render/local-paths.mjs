import { attr, hasClass } from "../shared/html-tree.mjs";
import { parseReport } from "./report-tree.mjs";

// Paths of the author's machine in what a reader reads: a drive's path (C:\Users\…, D:/data/…), a
// home or system folder's of a Unix system (/Users/…, /home/…, ~/…, $HOME/…, /tmp/…, /opt/…), a
// share's (\\server\share\…), and a path through a folder of the system's or the Agent's own
// (AppData, a scratchpad, %TEMP%, a temp folder in a path from a drive or the root). A reader on
// another machine cannot open one; whether the report goes to such a reader, and whether the path
// stays, is the author's to know, so gallery check and gallery export say each as a note
// (localPathNotes), never a failure, among the notes to act on first (`fix`, pipeline.mjs notesByKind),
// with what to write instead: where it came from in words, or a path relative to the report's
// materials/ (where raw inputs that travel with it are kept). What a reader reads is the page's text, its <title> among it,
// read from its elements: not its attributes, comments, scripts or styles, not what a <template>
// holds, nor what is [hidden], and not a code sample (pre, code, kbd, samp, var), where a path is the
// sample's own; a formula's TeX (f:\mathbb{R}) is no path either, nor are a web address's folders
// (the site's own, whatever their names) or a project's relative ones (build/tmp/).

/** What a local path's note says to write instead, last. */
export const INSTEAD = "Write instead where it came from, in words, or a path relative to materials/ (materials/data.csv)";

// What holds no words a reader reads, or a sample's.
const UNREAD = new Set(["script", "style", "template", "noscript", "textarea", "pre", "code", "kbd", "samp", "var"]);
// The kit's formulas: what they hold is TeX.
const FORMULAS = ["doc-math-inline", "doc-math-block"];
// A formula as the file writes it: its TeX between \( \), \[ \] or $$ $$; and, in what asks for
// single dollars (data-doc-math-dollar, which the kit's math.js draws so), between two of them (a
// dollar a backslash escapes is none, as KaTeX reads them).
const FORMULA = /\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$/g;
const DOLLAR_FORMULA = /(?<!\\)\$(?:\\[\s\S]|[^\\$])+\$/g;
// Where the words of a path end: at a blank, a quote, a bracket, a ";" (C:\a.csv;D:\b.csv: two) or
// the punctuation a Chinese sentence puts after it, or at a Chinese, Japanese or Korean character
// once a file's extension ended (数据在 C:\work\data.csv里: the path ends at "csv"; a folder's name
// may be Chinese).
const PATH_END = /[\s"'<>|()[\]{};，。；：、！？（）《》「」『』“”‘’【】]/u;
const WORDS = /[^\s"'<>|()[\]{};，。；：、！？（）《》「」『』“”‘’【】]+/gu;
const CJK = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const EXTENSION = /\.[A-Za-z0-9]{1,8}$/;
// Where a path of this machine starts, two characters of a name after it at least (a choice "A:/B"
// is none): a drive's (not after a Latin letter or a digit: "http:" is none; after a Chinese one,
// 在D:\…, it is), a Unix home or system folder's (not after a Latin letter, a digit, a dot or a
// slash: a web address's /home/ is none), a home's as a shell writes it (~/, $HOME/), a share's
// (\\server\share\), or an environment variable of a folder of the system.
const STARTS = [
  /(?<![A-Za-z0-9_\\])[A-Za-z]:[\\/]/g,
  /(?<![A-Za-z0-9_.~:/\\-])\/(?:Users|home|root|tmp|private|mnt|opt|Volumes|var\/folders)\/(?=\S)/g,
  /(?<![A-Za-z0-9_.~:/\\-])~\/(?=\S)/g,
  /(?<![A-Za-z0-9_$\\])\$(?:HOME|\{HOME\})\/(?=\S)/g,
  /(?<![A-Za-z0-9_:\\])\\\\[A-Za-z0-9][\w.$-]*\\(?=[^\s\\])/g,
  /%(?:TEMP|TMP|APPDATA|LOCALAPPDATA|USERPROFILE)%/gi,
];
// A folder that is the system's or the Agent's own wherever it stands in a path (AppData, a
// scratchpad), or a temporary one below another in a path from a drive, the root or a variable of
// the system (C:\…\Temp\…, /srv/app/tmp/…): a project's relative build/tmp/ is none. Neither is in a
// web address, a word holding "://" (but a file: one): its folders are the site's.
const FOLDERS = /(?:^|[\\/])(?:AppData|scratchpad)(?=[\\/]|$)/i;
const TEMP_FOLDER = /^(?:[A-Za-z]:|[\\/]|%[A-Za-z]+%)[\s\S]*[\\/](?:temp|tmp)(?=[\\/])/i;
const isAddress = (path) => path.includes("://") && !/^file:/i.test(path);
// The most notes said one by one; the rest are one note naming their lines.
const SAID = 12;

// The path that starts at `at` of a text, its last dot or comma left out.
function pathAt(text, at) {
  let end = at;
  while (end < text.length && !PATH_END.test(text[end]) && !(CJK.test(text[end]) && EXTENSION.test(text.slice(at, end)))) end++;
  return text.slice(at, end).replace(/[.,;:!?]+$/, "");
}

// The paths of this machine in a text (its formulas blanked first, their places kept; `dollar`: in
// what asks for single dollars): { at, path }, in its order. A word holding a separator and a folder
// of FOLDERS or TEMP_FOLDER is one from its first character that is no Chinese, Japanese or Korean
// one (见AppData\Local\…), unless it is a web address or a path that STARTS holds it.
function pathsIn(text, dollar = false) {
  const blank = (formula) => formula.replace(/[^\n]/g, " ");
  const formulas = text.replace(FORMULA, blank);
  const blanked = dollar ? formulas.replace(DOLLAR_FORMULA, blank) : formulas;
  const found = []; // { at, path }
  const holds = (at, path) => found.some((other) => other.at <= at + path.length && at <= other.at + other.path.length);
  for (const start of STARTS) {
    for (const match of blanked.matchAll(start)) {
      const path = pathAt(blanked, match.index);
      if (path.length >= match[0].length + 2 && !holds(match.index, path)) found.push({ at: match.index, path });
    }
  }
  for (const word of blanked.matchAll(WORDS)) {
    let at = word.index;
    while (at < word.index + word[0].length && CJK.test(blanked[at])) at++;
    const path = pathAt(blanked, at);
    if (/[\\/]/.test(path) && (FOLDERS.test(path) || TEMP_FOLDER.test(path)) && !isAddress(path) && !holds(at, path)) found.push({ at, path });
  }
  return found.sort((a, b) => a.at - b.at);
}

/**
 * The local paths in the text a reader reads of a report's HTML (as the comment above says): each a
 * note at its line, "line 12: … (the path)", at most SAID of them, then one note with the lines of
 * the rest. Never a failure.
 */
export function localPathNotes(html, tree = parseReport(html)) {
  const found = []; // { line, path }
  const visit = (node, dollar) => {
    for (const child of node.childNodes ?? []) {
      if (child.nodeName === "#text") {
        if (!child.sourceCodeLocation) continue;
        for (const { at, path } of pathsIn(child.value, dollar)) found.push({ line: child.sourceCodeLocation.startLine + (child.value.slice(0, at).match(/\n/g)?.length ?? 0), path });
      } else if (child.tagName && !UNREAD.has(child.tagName) && attr(child, "hidden") === undefined && !FORMULAS.some((name) => hasClass(child, name))) {
        visit(child, dollar || attr(child, "data-doc-math-dollar") !== undefined);
      }
    }
  };
  visit(tree, false);
  const said = found.slice(0, SAID).map(({ line, path }) => `line ${line}: "${path.length > 80 ? `${path.slice(0, 77)}…` : path}" is a path of this machine in the text a reader reads: a reader on another machine cannot open it. ${INSTEAD}`);
  const rest = found.slice(SAID);
  if (rest.length > 0) said.push(`${rest.length} more path${rest.length === 1 ? "" : "s"} of this machine in the text a reader reads, on line${new Set(rest.map(({ line }) => line)).size === 1 ? "" : "s"} ${[...new Set(rest.map(({ line }) => line))].join(", ")}. ${INSTEAD}`);
  return said;
}
