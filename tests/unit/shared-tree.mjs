import './workspace-env.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensureWorkspace, layoutOf } from '../../src/shared/workspace.mjs';
import { registerWorkspace, workspaceId, forgetWorkspace } from '../../src/shared/workspace-registry.mjs';
import { moveDocument, readOutline, writeOutline, withOutlineLock, validOutline } from '../../src/shared/outline.mjs';
import { forgetSnapshot } from '../../src/shared/workspace-columns.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gallery-shared-tree-'));
const home = path.join(root, 'home'), project = path.join(root, 'project');
const previous = process.env.GALLERY_DEFAULT_WORKSPACE;
process.env.GALLERY_DEFAULT_WORKSPACE = home;
const id = workspaceId(project), homeId = workspaceId(home);
const doc = async (where, slug) => {
  const folder = path.join(where, slug);
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, 'doc.html'), '<!doctype html><main></main>');
  await fs.writeFile(path.join(folder, 'doc.json'), JSON.stringify({ title: slug }));
};
try {
  for (const where of [home, project]) { await ensureWorkspace(where); await registerWorkspace(where, { force: true, tmp: path.join(root, 'not-temporary') }); }
  await doc(home, 'home-doc');
  for (const slug of ['one', 'two', 'child']) await doc(project, slug);
  await fs.mkdir(path.join(project, 'web'));
  await fs.writeFile(path.join(project, 'web', 'link.json'), JSON.stringify({ title: '网页', url: 'https://example.com/' }));
  await fs.writeFile(layoutOf(project).outline, JSON.stringify({ version: 2, groups: [{ id: 'docs' }], children: { '': ['one', 'two', 'web'], one: ['child'] } }));
  const localBefore = await fs.readFile(layoutOf(project).outline, 'utf8');
  let tree = await readOutline(home);
  assert.deepEqual(tree.children[`:${id}`], [`~${id}/one`, `~${id}/two`, `~${id}/web`]);
  assert.deepEqual(tree.children[`~${id}/one`], [`~${id}/child`]);
  await moveDocument(home, `~${id}/two`, { before: null, parent: `:${id}`, first: true });
  tree = await readOutline(project);
  assert.deepEqual(tree.children[''], ['two', 'one', 'web'], 'default-window reorder is the project order too');
  assert.deepEqual(tree.children.one, ['child']);
  assert.equal(tree.groups[0].id, homeId, 'project projection preserves shared column order');
  assert.ok(validOutline(tree));
  await moveDocument(project, 'one', { parent: 'web' });
  tree = await readOutline(home);
  assert.deepEqual(tree.children[`~${id}/web`], [`~${id}/one`], 'project edit writes the same hierarchy, including links as parents');
  assert.deepEqual(tree.children[`~${id}/one`], [`~${id}/child`]);
  assert.equal((await moveDocument(project, `~${homeId}/home-doc`, { parent: 'child' })).reason, 'cross-workspace', 'cross-workspace moves require a copy');
  assert.deepEqual((await readOutline(home)).children[''], ['home-doc']);
  assert.equal(await fs.readFile(layoutOf(project).outline, 'utf8'), localBefore, 'no second copy of the shared order is maintained');
  await doc(project, 'later');
  forgetSnapshot(project);
  assert.ok((await readOutline(home)).children[`:${id}`].includes(`~${id}/later`), 'new files join the shared tree');
  // Existing outline API round trip from the projected tree keeps every entry and hierarchy.
  await withOutlineLock(project, () => readOutline(project).then(value => writeOutline(project, value)));
  assert.deepEqual((await readOutline(home)).children[`~${id}/one`], [`~${id}/child`]);
  const before = await fs.readFile(layoutOf(home).outline, 'utf8');
  const mixed = await readOutline(home);
  mixed.children[''] = [];
  mixed.children[`~${id}/child`] = ['home-doc'];
  await assert.rejects(writeOutline(home, mixed), { code: 'CROSS_WORKSPACE' });
  assert.equal(await fs.readFile(layoutOf(home).outline, 'utf8'), before);
  // An older mixed tree is read back as complete owner trees, without moving source files.
  const old = JSON.parse(before);
  old.children[''] = [];
  old.groups.find(group => group.workspace === id).children[`~${id}/child`] = ['home-doc'];
  old.groups.find(group => group.workspace === id).hidden = true;
  await fs.writeFile(layoutOf(home).outline, JSON.stringify(old));
  const repaired = await readOutline(project);
  assert.ok(repaired.children[`:${homeId}`].includes(`~${homeId}/home-doc`));
  assert.ok(!repaired.groups.some(group => group.hidden));
  const custom = { id: 'g-project', title: 'Project column', owner: id };
  repaired.groups.push(custom);
  repaired.children[':g-project'] = ['one'];
  repaired.children.web = [];
  await writeOutline(project, repaired);
  const inHome = await readOutline(home);
  assert.deepEqual(inHome.children[':g-project'], [`~${id}/one`]);
  assert.equal(inHome.groups.find(group => group.id === custom.id).owner, id);
  inHome.groups.find(group => group.id === custom.id).title = 'Renamed anywhere';
  await writeOutline(home, inHome);
  assert.equal((await readOutline(project)).groups.find(group => group.id === custom.id).title, 'Renamed anywhere');
  const privateFolder = path.join(project, 'extensions', 'private-test');
  await fs.mkdir(privateFolder, { recursive: true });
  await fs.writeFile(path.join(privateFolder, 'sidebar.json'), JSON.stringify({ title: 'Private', entries: [] }));
  assert.ok(!(await readOutline(project)).groups.some(group => group.extension === 'private-test'), 'extensions only belong to the home workspace');
  assert.ok(!(await readOutline(home)).groups.some(group => group.extension === 'private-test'));
  await doc(home, 'second');
  await Promise.all([
    moveDocument(home, 'second', { parent: '', first: true }),
    moveDocument(project, 'two', { parent: 'web' }),
  ]);
  const concurrent = await readOutline(home);
  assert.equal(concurrent.children[''][0], 'second');
  assert.ok(concurrent.children[`~${id}/web`].includes(`~${id}/two`), 'different windows serialize edits on the shared lock');
  concurrent.children[''].push('~ws-000000/missing');
  await writeOutline(home, concurrent);
  assert.ok((await readOutline(home)).children[''].includes('~ws-000000/missing'), 'a legacy missing reference remains removable without blocking other edits');
  console.log('Checked shared document/link tree: both directions, hierarchy, ownership, old mixed trees, new entries, one stored order.');
} finally {
  for (const where of [home, project]) await forgetWorkspace(where);
  process.env.GALLERY_DEFAULT_WORKSPACE = previous;
  forgetSnapshot();
  await fs.rm(root, { recursive: true, force: true });
}
