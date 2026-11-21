export { defaultPreferencesFile, preferenceExamplesDirectory } from "./paths.mjs";

// Storage and migration live in preference-documents.mjs.

/** Whether preferences (their Markdown) say anything: a letter or a digit under the title (its first line, a # heading). */
export const saysAnything = (text) => /[\p{L}\p{N}]/u.test(text.replace(/^\s*# [^\n]*/, ""));

// Markdown's words as their letters alone, under its title: a comment's words are words; every other
// tag, a picture's address (the page keeps its pictures under names of its own), the marks, spaces
// and numbers are not.
const lettersOf = (text) => text
  .replace(/<!--|-->/g, " ")
  .replace(/!\[((?:\\.|[^\]\\])*)\]\([^)]*\)/g, "$1")
  .replace(/<\/?[A-Za-z][^>]*>/g, " ")
  .replace(/[^\p{L}]/gu, "");
const underTitle = (text) => text.replace(/^\s*# [^\n]*/, "");

/**
 * The lines of preferences `file` (Markdown) whose words the page made of it does not hold, as its
 * Markdown `page` writes them (what writing the page back over the file would take out: a comment, a
 * link's address on this computer), trimmed, in order: each a line whose letters are not, in a row,
 * among the page's. Words joined or split again, spaced, numbered or marked otherwise are the same.
 */
export function unshownLines(file, page) {
  const shown = lettersOf(underTitle(page));
  return underTitle(file).split("\n").map((line) => line.trim()).filter((line) => {
    const letters = lettersOf(line);
    return letters !== "" && !shown.includes(letters);
  });
}
