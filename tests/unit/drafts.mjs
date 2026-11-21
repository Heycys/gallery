import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { ensureWorkspace, layoutOf } from "../../src/shared/workspace.mjs";
import { registerWorkspace, workspaceId } from "../../src/shared/workspace-registry.mjs";
import { draftEntry, draftOf, workspaceOf, draftFacts, findDraft, addDraft, addWorkspace, projectChoices, joinDefaultTree } from "../../src/shared/drafts.mjs";
import { readOutline, moveDocument, withOutlineLock } from "../../src/shared/outline.mjs";
import { revealCommand } from "../../src/workbench/reveal.mjs";

// Storage ownership and registry resolution. HTTP routing, edits, trash and shared service identity
// are exercised in projects.mjs; shared-tree/copy-tree cover ordering and confirmed copies.
const root = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-drafts-"));
const home = path.join(root, "home"), project = path.join(root, "project");
const before = { home: process.env.GALLERY_DEFAULT_WORKSPACE, data: process.env.GALLERY_DATA_DIR };
process.env.GALLERY_DEFAULT_WORKSPACE = home;
process.env.GALLERY_DATA_DIR = path.join(root, "data");
try {
  for (const folder of [home, project]) { await ensureWorkspace(folder); await registerWorkspace(folder); }
  for (const slug of ["one", "child"]) {
    await fs.mkdir(path.join(project, slug));
    await fs.writeFile(path.join(project, slug, "doc.html"), `<!doctype html><h1>${slug}</h1>`);
    await fs.writeFile(path.join(project, slug, "doc.json"), JSON.stringify({ title: slug, icon: "🧭" }));
  }
  await fs.mkdir(path.join(project, "web"));
  await fs.writeFile(path.join(project, "web", "link.json"), JSON.stringify({ title: "Web", url: "https://example.com" }));
  const id = workspaceId(project), one = draftEntry(id, "one");
  assert.deepEqual(draftOf(one), { ws: id, slug: "one" });
  assert.equal(draftOf("~ws-zzzzzz/one"), null);
  assert.deepEqual(workspaceOf(id), { root: project });
  assert.equal(workspaceOf("ws-000000").refused, "unknown");
  assert.equal(workspaceOf(id, new Map([[id, [home, project]]])).refused, "ambiguous");
  const facts = await draftFacts(one);
  assert.equal(facts.path, path.join(project, "one", "doc.html"));
  assert.equal(facts.title, "one"); assert.equal(facts.missing, null);
  assert.equal((await draftFacts(draftEntry(id, "web"))).kind, "link");
  assert.equal((await draftFacts(draftEntry(id, "gone"))).missing, "draft");
  assert.equal((await draftFacts("~ws-000000/gone")).missing, "workspace");
  assert.equal((await findDraft("relative/doc.html")).kind, "missing");
  assert.equal((await findDraft(pathToFileURL(path.join(project, "one", "doc.html")).href)).root, project);
  await addDraft(home, project, "one");
  await addWorkspace(home, project);
  assert.ok((await readOutline(home)).children[`:${id}`].includes(one));
  await moveDocument(project, "child", { parent: "one" });
  assert.deepEqual((await readOutline(home)).children[one], [draftEntry(id, "child")]);
  await joinDefaultTree(project, "one");
  assert.deepEqual((await readOutline(project)).children.one, ["child"]);
  assert.equal(await fs.access(layoutOf(project).outline).then(() => true, () => false), false, "only home stores the shared order");
  const choices = await projectChoices(home);
  assert.ok(JSON.stringify(choices).includes(id));
  assert.deepEqual(revealCommand("/a/x", { platform: "darwin", env: {} }), { command: "open", args: ["-R", "/a/x"] });
  console.log("Checked registered storage roots, ambiguous IDs, document/link metadata, pasted paths, shared placement and owner-local commands.");
} finally {
  process.env.GALLERY_DEFAULT_WORKSPACE = before.home;
  process.env.GALLERY_DATA_DIR = before.data;
  await fs.rm(root, { recursive: true, force: true });
}
