// Folders that test runs leave in the system's temporary folder. A headless browser's profile is 10 to 40 MB, and a
// browser or a run that is killed before it tidies up leaves its profile behind; over a few days of gates and of
// agents' probes, thousands of them once filled a disk (2026-11-21). The runners call sweepStaleTemp() as they start
// (tests/browser/run.mjs, tests/unit/run.mjs, tests/release/smoke.mjs), and `node tests/sweep-temp.mjs [hours]`
// runs it by hand.
//
// It removes the folders of an earlier run and nothing else: those named as puppeteer names a profile it makes
// (puppeteer_dev_chrome_profile-*) or as these tests and gallery's own checks name theirs (gallery-browser-*,
// gallery-smoke-*), last written over `hours` ago (6), and in no program's use: on Windows a folder a running
// program holds a file of cannot be renamed, so each is renamed first and one that cannot be is left. It never
// throws, and returns how many it removed.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const STALE = /^(?:puppeteer_dev_chrome_profile-|gallery-browser-|gallery-smoke-)/;

export function sweepStaleTemp({ hours = 6, directory = os.tmpdir(), now = Date.now() } = {}) {
  let entries = [];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return 0;
  }
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || !STALE.test(entry.name)) continue;
    const folder = path.join(directory, entry.name);
    try {
      if (now - fs.statSync(folder).mtimeMs < hours * 3_600_000) continue;
      const aside = `${folder}.stale`;
      fs.renameSync(folder, aside);
      fs.rmSync(aside, { recursive: true, force: true });
      removed += 1;
    } catch {} // in use, or gone meanwhile
  }
  return removed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const hours = Number(process.argv[2] ?? 6);
  console.log(`Removed ${sweepStaleTemp({ hours: Number.isFinite(hours) ? hours : 6 })} stale folder(s) of earlier test runs from ${os.tmpdir()}.`);
}
