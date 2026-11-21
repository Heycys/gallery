import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { FILE, readItems } from "../shared/annotations.mjs";
import { writeAtomic } from "../shared/files.mjs";
import { documentDirectory } from "../shared/workspace.mjs";

// The reader's 批注 Gallery deleted (its server, or an export with none) because the words or
// blocks they were about are gone from the report (docs/editor.md "Annotations": the check after
// every write of the file, annotations.mjs): an Agent that rewrote those words saw them vanish from
// annotations.json without a word, and said in its hand-off that it had left them be. The edit
// service keeps each such deletion (when, and each annotation's id, its text and the words it quoted)
// in its state directory, dropped-annotations/<slug>/ of the workspace's .gallery/state/ (as
// rewrites.mjs keeps what a reader's edit wrote), and gallery check and gallery export say them once,
// right after what the preview wrote, so the Agent knows which it handled and which it should ask
// about. The dev server's log says each one as it happens too. One that came back since (an undo
// brought its words back, and the page put it back) is not said.

const maxKept = 20; // deletions kept of each report until a command says them
const ENTRY = /^\d{8}T\d{6}Z-[a-f0-9]{8}\.json$/; // <time>-<random>.json: by name, oldest first
const QUOTED = 80; // how much of a text or a quote a line shows

const folderOf = ({ stateDirectory, slug }) => path.join(stateDirectory, "dropped-annotations", slug);

/** An annotation as a deletion keeps it: its id, its text and what it quoted ({ id, text, quote, kind }). */
export const droppedOf = (item) => ({ id: item.id, text: item.text, quote: item.anchor?.quote ?? "", kind: item.anchor?.kind ?? "text" });

/** Keep a deletion: `items` the annotations deleted (droppedOf's), `time` an ISO time. */
export async function keepDropped({ stateDirectory, reportsDirectory, slug, time, items }) {
  const folder = folderOf({ stateDirectory, reportsDirectory, slug });
  await fs.mkdir(folder, { recursive: true });
  const stamp = time.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  await writeAtomic(path.join(folder, `${stamp}-${randomBytes(4).toString("hex")}.json`), JSON.stringify({ time, items }));
  const names = (await fs.readdir(folder)).filter((name) => ENTRY.test(name)).sort();
  await Promise.all(names.slice(0, Math.max(0, names.length - maxKept)).map((name) => fs.rm(path.join(folder, name), { force: true })));
}

/**
 * The deletions kept of a report, oldest first ({ time, items }), taken away: each is said once.
 * The annotations the report's annotations.json holds again are left out of them, and a deletion
 * left with none, out.
 */
export async function takeDropped({ stateDirectory, reportsDirectory, slug }) {
  const folder = folderOf({ stateDirectory, reportsDirectory, slug });
  const names = (await fs.readdir(folder).catch(() => [])).filter((name) => ENTRY.test(name)).sort();
  if (names.length === 0) return [];
  const back = new Set(readItems(await fs.readFile(path.join(documentDirectory(slug, reportsDirectory), FILE), "utf8").catch(() => "")).map((item) => item.id));
  const entries = [];
  for (const name of names) {
    const file = path.join(folder, name);
    try {
      const entry = JSON.parse(await fs.readFile(file, "utf8"));
      const items = Array.isArray(entry?.items) ? entry.items.filter((item) => typeof item?.id === "string" && !back.has(item.id)) : [];
      if (typeof entry?.time === "string" && items.length) entries.push({ time: entry.time, items });
    } catch {}
    await fs.rm(file, { force: true }).catch(() => {}); // locked (EPERM, EBUSY): said again next time, nothing stops
  }
  return entries;
}

// A time as the Agent reads it next to its own: the hour and minute here, the day too when it is not today.
const when = (time, today = new Date()) => {
  const date = new Date(time);
  const two = (value) => String(value).padStart(2, "0");
  const clock = `${two(date.getHours())}:${two(date.getMinutes())}`;
  return date.toDateString() === today.toDateString() ? clock : `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${clock}`;
};
// A text on one line, cut short.
const short = (text) => {
  const line = String(text ?? "").replace(/\s+/g, " ").trim();
  return JSON.stringify(line.length > QUOTED ? `${line.slice(0, QUOTED - 1)}…` : line);
};

/**
 * What a deletion says (`items`: droppedOf's) in the dev server's log, and the commands' lines for
 * one (`time` given): of report `slug`'s annotations.json (`file`), each annotation its id, its text
 * and the words it was on.
 */
export function droppedLines(file, { time = null, items }, { today = new Date() } = {}) {
  const shown = path.resolve(file); // as the system writes it: an Agent uses it as it is
  const count = `${items.length} 批注 (annotation${items.length === 1 ? "" : "s"})`;
  return [
    `annotations ${shown}: ${time ? `at ${when(time, today)}, ` : ""}Gallery deleted ${count} whose words are gone from the document (rewritten or deleted):`,
    ...items.map(({ id, text, quote, kind }) => `  ${id} ${short(text)} on ${kind === "blocks" ? "the blocks " : ""}${short(quote)}`),
  ];
}

/**
 * What the commands print of the deletions kept of report `slug` (takeDropped's entries): each one's
 * lines, then what to do of them. None: nothing.
 */
export function droppedReportLines(file, entries, { today = new Date() } = {}) {
  if (!entries.length) return [];
  return [
    ...entries.flatMap((entry) => droppedLines(file, entry, { today })),
    "  they were the reader's: say in your hand-off which your edit carried out and which you left, and never write them back",
  ];
}
