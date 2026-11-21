import './workspace-env.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createEditService } from '../../src/editor/service.mjs';
import { createWorkspaceService } from '../../src/workbench/service.mjs';
import { ensureWorkspace, layoutOf } from '../../src/shared/workspace.mjs';
import { registerWorkspace, forgetWorkspace, workspaceId } from '../../src/shared/workspace-registry.mjs';
import { readOutline, writeOutline } from '../../src/shared/outline.mjs';
import { forgetSnapshot } from '../../src/shared/workspace-columns.mjs';
import { projectRoot } from '../../src/shared/paths.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gallery-copy-tree-'));
const home = path.join(root, 'home'), target = path.join(root, 'target');
const previous = process.env.GALLERY_DEFAULT_WORKSPACE;
process.env.GALLERY_DEFAULT_WORKSPACE = home;
let server, service;
try {
  for (const folder of [home, target]) {
    await ensureWorkspace(folder);
    await registerWorkspace(folder, { force: true, tmp: path.join(root, 'not-temporary') });
  }
  await fs.mkdir(path.join(home, 'one', 'assets'), { recursive: true });
  const original = '<!doctype html><main class="doc-page" data-doc-id="one"><h1>One</h1><a href="../child/doc.html">Child</a><pre>../child/doc.html</pre><div data-doc-component="local/strip"></div></main>';
  await fs.writeFile(path.join(home, 'one', 'doc.html'), original);
  await fs.writeFile(path.join(home, 'one', 'doc.json'), JSON.stringify({ title: 'One', icon: '🍃' }));
  await fs.writeFile(path.join(home, 'one', 'link.json'), JSON.stringify({ title: 'Unused sidecar', url: 'https://example.com/' }));
  await fs.writeFile(path.join(home, 'one', 'assets', 'kept.txt'), 'asset');
  await fs.mkdir(path.join(home, 'child'));
  await fs.writeFile(path.join(home, 'child', 'link.json'), JSON.stringify({ title: 'Child', url: 'https://example.com/', icon: '🔗' }));
  await fs.cp(path.join(projectRoot, 'tests', 'fixtures', 'components', 'local', 'strip'), path.join(home, 'components', 'local', 'strip'), { recursive: true });
  await writeOutline(home, { children: { '': ['one'], one: ['child'] } });
  const edits = createEditService({ reportsDirectory: target });
  service = createWorkspaceService({ edits, reportsDirectory: target, reports: { words: html => html } });
  server = http.createServer((request, response) => service.handle(request, response, 'copy-from'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const copy = async extra => {
    const response = await fetch(origin + '/__gallery/workspace/copy-from', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'X-Gallery-Token': edits.token },
      body: JSON.stringify({ sourceWs: workspaceId(home), slug: 'one', ...extra }),
    });
    return { status: response.status, ...await response.json() };
  };
  const made = await copy({});
  assert.equal(made.status, 200, JSON.stringify(made));
  assert.equal(made.count, 2);
  let tree = await readOutline(target);
  const child = tree.children[made.slug][0];
  const html = await fs.readFile(path.join(target, made.slug, 'doc.html'), 'utf8');
  assert.ok(html.includes(`data-doc-id="${made.slug}"`));
  assert.ok(html.includes(`href="../${child}/doc.html"`));
  assert.ok(html.includes('<pre>../child/doc.html</pre>'), 'code examples are untouched');
  assert.equal(await fs.readFile(path.join(target, made.slug, 'assets', 'kept.txt'), 'utf8'), 'asset');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(target, child, 'link.json'), 'utf8')), { title: 'Child', url: 'https://example.com/', icon: '🔗' });
  assert.equal(await fs.readFile(path.join(home, 'one', 'doc.html'), 'utf8'), original);
  assert.equal(await fs.access(path.join(target, 'components')).then(() => true, () => false), false, 'copies use global blocks without a local catalog');
  const before = (await fs.readdir(target)).sort();
  const unchanged = await fs.readFile(layoutOf(home).outline, 'utf8');
  assert.equal((await copy({ parent: 'missing' })).status, 409);
  assert.deepEqual((await fs.readdir(target)).sort(), before);
  assert.equal(await fs.readFile(layoutOf(home).outline, 'utf8'), unchanged);
  assert.ok(!(await fs.readdir(layoutOf(target).gallery)).some(name => name.startsWith('copy-')), 'staging folders are always cleaned');
  console.log('Checked cross-workspace copies: new identities, document/link subtree, assets, exact HTML edits, custom blocks, original retained, rollback.');
} finally {
  service?.close?.();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  for (const folder of [home, target]) await forgetWorkspace(folder);
  process.env.GALLERY_DEFAULT_WORKSPACE = previous;
  forgetSnapshot();
  await fs.rm(root, { recursive: true, force: true });
}
