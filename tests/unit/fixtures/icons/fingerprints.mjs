// Fingerprints of the icon paths of a third-party icon set this project may not ship (the JSON beside
// this file): the editor's icons are its own drawings (docs/editor.md, "Icons"), and tests/unit/own-icons.mjs
// holds every path under src/ against these. Not the paths: a SHA-1 prefix of each whole path and of each
// of its long segments (a command with its numbers), whitespace left out, so a copy with a few numbers
// changed still shares segments.
//
// Run as a script on a source tree, it reads the drawings in its ui, view, blocks and editor folders (its
// app/ folder is left out: the sun and moon there are this project's own) and writes the JSON:
// node tests/unit/fixtures/icons/fingerprints.mjs <source folder> > tests/unit/fixtures/icons/third-party-icons.json
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SEGMENT = 14; // a segment shorter than this is no evidence (an arc or a line shared by any two drawings)
const hash = (text) => createHash("sha1").update(text).digest("hex").slice(0, 10);
const squeeze = (d) => d.replace(/\s+/g, "");

/** The segments of a path's data that count as evidence, hashed. */
export const segmentsOf = (d) => [...new Set(d.split(/(?=[MmLlHhVvCcSsQqTtAaZz])/).map(squeeze).filter((segment) => segment.length >= SEGMENT).map(hash))];
/** A whole path's hash. */
export const pathHash = (d) => hash(squeeze(d));
/** The path data written in some source text (d="…" or d='…', 16 characters or more). */
export const pathsIn = (text) => [...text.matchAll(/\bd=(?:"([^"]{16,})"|'([^']{16,})')/g)].map((match) => match[1] ?? match[2]);

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.name === "node_modules" ? [] : entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));
  const whole = new Set();
  const segments = new Set();
  for (const file of ["ui", "view", "blocks", "editor"].flatMap((part) => walk(path.join(process.argv[2], part))).filter((name) => /\.(js|mjs|css|html)$/.test(name))) {
    for (const d of pathsIn(fs.readFileSync(file, "utf8"))) {
      whole.add(pathHash(d));
      for (const segment of segmentsOf(d)) segments.add(segment);
    }
  }
  process.stdout.write(`${JSON.stringify({ whole: [...whole].sort(), segments: [...segments].sort() })}\n`);
}
