import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createUpdates } from "../../src/server/updates.mjs";

// Pages someone else wrote (src/server/updates.mjs; docs/workbench.md "Updated elsewhere"): what the record
// tells, by the text it last heard of each page and whose the write was; then the routes' stream told it
// (tests/unit/fixtures/updated-pages.mjs, in a workspace of its own).

{
  const told = [];
  const updates = createUpdates((key) => told.push(key));
  updates.know(["a", "b", "c", "@home"]);
  updates.seed("a", "v1");
  updates.seed("@home", "p1");
  assert.equal(updates.heard("a", "v1", false), false, "the text it took at the start: no update");
  assert.equal(updates.heard("a", "v2", false), true, "another text by someone else: told");
  assert.equal(updates.heard("a", "v2", false), false, "the same again: no update");
  assert.equal(updates.heard("a", "v3", true), false, "the reader's own write: never told");
  assert.equal(updates.heard("a", "v4", false), true, "and the next one by someone else is compared with the reader's");
  assert.equal(updates.heard("b", "x", false), true, "there at the start, not seeded yet (its take under way): heard as an update");
  assert.equal(updates.heard("c", "y", true), false, "the same, written by the reader: not told");
  assert.equal(updates.heard("new", "n1", false), false, "a page made since the start: none, whoever made it");
  assert.equal(updates.heard("new", "n2", false), true, "its next write by someone else: told");
  assert.equal(updates.heard("@home", "p2", false), true, "a custom page, by its key");
  assert.equal(updates.heard("a", null, false), false, "gone: forgotten");
  assert.equal(updates.heard("a", "v9", false), false, "back (restored, made again): new, no update");
  updates.seed("new", "zz");
  assert.equal(updates.heard("new", "n2", false), false, "a seed never overrides what was heard");
  assert.deepEqual(told, ["a", "a", "b", "new", "@home"]);
}

// The routes: the workbench's stream told "updated <key>" (in a process of its own: a workspace of its own).
{
  const studio = mkdtempSync(path.join(tmpdir(), "updated-pages-"));
  const reports = path.join(studio, "reports");
  const run = spawnSync(process.execPath, [path.join(import.meta.dirname, "fixtures", "updated-pages.mjs")], { encoding: "utf8", env: { ...process.env, GALLERY_WORKSPACE: reports, GALLERY_DEFAULT_WORKSPACE: reports }, timeout: 120000 });
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  rmSync(studio, { recursive: true, force: true, maxRetries: 5 });
}

console.log("Checked the pages someone else wrote: a write that changed a page's text and was not the reader's told once by its key (a document's slug, @<slug> for a custom page), the reader's own write never, a page made since the start not on its first write, one gone forgotten; and the routes' workbench stream told it (an Agent's write of doc.html and of page.html), not for the same text again, doc.json or page.json alone, the reader's rename through the edit service, or a document's first write, and no document's page hearing it.");
