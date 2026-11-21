import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startProductionServer } from "../../src/server/production.mjs";
import { ensureWorkspace } from "../../src/shared/workspace.mjs";
import { registerWorkspace, registryFile, workspaceId } from "../../src/shared/workspace-registry.mjs";
import { projectBase, workspaceAddress } from "../../src/shared/workspace-address.mjs";
import { projectHtml } from "../../src/server/project-html.mjs";
import { findPreviewServer } from "../../src/shared/preview-server.mjs";
import { forgetSnapshot } from "../../src/shared/workspace-columns.mjs";
import { readOutline, writeOutline } from "../../src/shared/outline.mjs";
import { writeGlobalLook } from "../../src/shared/workspace-look.mjs";
import { createWorkspaceService } from "../../src/workbench/service.mjs";

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-projects-"));
const home = path.join(temporary, "home"), project = path.join(temporary, "project");
const before = { data: process.env.GALLERY_DATA_DIR, home: process.env.GALLERY_DEFAULT_WORKSPACE };
process.env.GALLERY_DEFAULT_WORKSPACE = home;
process.env.GALLERY_DATA_DIR = path.join(temporary, "registry");
let service;
try {
  for (const [root, title] of [[home, "Home"], [project, "Project"]]) {
    await ensureWorkspace(root);
    await registerWorkspace(root);
    await fs.mkdir(path.join(root, "same", "assets"), { recursive: true });
    await fs.writeFile(path.join(root, "same", "doc.html"), `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><main class="doc-page" data-doc-id="same"><h1 class="doc-title" data-block-id="title">${title}</h1><p data-block-id="text">${title} unique body</p><img src="assets/picture.svg"></main></body></html>`);
    await fs.writeFile(path.join(root, "same", "doc.json"), JSON.stringify({ title }));
    await fs.writeFile(path.join(root, "same", "assets", "picture.svg"), `<svg xmlns="http://www.w3.org/2000/svg"><text>${title}</text></svg>`);
    await fs.mkdir(path.join(root, "pages", "board"), { recursive: true });
    await fs.writeFile(path.join(root, "pages", "board", "page.html"), '<!doctype html><html><body><main class="doc-page"><p>Board</p></main></body></html>');
    await fs.writeFile(path.join(root, "pages", "board", "page.json"), JSON.stringify({ title: `${title} board` }));
  }
  await fs.cp(new URL('../fixtures/components/local/tally/', import.meta.url), path.join(home, 'components', 'local', 'tally'), { recursive: true });
  await fs.mkdir(path.join(project, 'blocks'));
  const example = await fs.readFile(new URL('../fixtures/components/local/tally/example.html', import.meta.url), 'utf8');
  await fs.writeFile(path.join(project, 'blocks', 'doc.html'), `<!doctype html><html><head><title>Blocks</title></head><body><main class="doc-page" data-doc-id="blocks"><h1 class="doc-title">Blocks</h1>${example}</main></body></html>`);
  await fs.writeFile(path.join(project, 'blocks', 'doc.json'), JSON.stringify({ title: 'Blocks' }));
  service = await startProductionServer({ reportsDirectory: home, port: 0, web: null, signals: false, log: { log() {}, warn() {}, error: console.error } });
  const origin = `http://127.0.0.1:${service.port}`, base = projectBase(workspaceId(project));
  const get = async route => { const response = await fetch(origin + route); assert.equal(response.status, 200, route); return response; };
  const info = await (await get('/__gallery/workspace/info')).json();
  const other = await (await get(base + '/__gallery/workspace/info')).json();
  assert.equal(info.server.pid, other.server.pid);
  assert.equal(other.server.home, home);
  assert.equal(await fs.access(path.join(project, '.gallery', 'server.json')).then(() => true, () => false), false, 'no per-project server announcement');
  const found = await findPreviewServer({ answering: true });
  assert.equal(found.port, service.port);
  assert.equal(found.pid, process.pid);
  assert.equal(info.token, other.token);
  const pageResponse = await get(base + '/generated/same.html');
  assert.ok(pageResponse.headers.get('content-security-policy').includes("frame-ancestors 'self'"));
  const html = await pageResponse.text();
  const editorUrl = page => /import\("([^"]+\/src\/editor\/page\/editor\.mjs)"\)/.exec(page)?.[1];
  const sharedEditor = editorUrl(await (await get('/generated/same.html')).text());
  assert.ok(sharedEditor?.startsWith('/__gallery/edit/v/'));
  assert.equal(editorUrl(html), sharedEditor, 'all storage directories reuse one stamped editor URL and browser cache');
  assert.equal(editorUrl(await (await get(base + '/generated/same.html')).text()), sharedEditor, 'cached project HTML keeps the shared module URL');
  assert.equal(workspaceAddress(sharedEditor, base), sharedEditor);
  assert.equal(workspaceAddress('/__gallery/edit/commit', base), base + '/__gallery/edit/commit', 'document writes still select their owner');
  const inline = `<script data-doc-dev>import('/__gallery/edit/src/editor/page/editor.mjs');fetch('/__gallery/edit/changes');</script>`;
  assert.equal(projectHtml(inline, base), inline.replace("'/__gallery/edit/changes'", `'${base}/__gallery/edit/changes'`), 'generated inline scripts share modules but scope document operations');
  const componentPage = await (await get(base + '/generated/blocks.html')).text();
  for (const file of ['kit.js', 'style.css']) {
    const address = /["'](\/__gallery\/components\/local\/tally\/[^"']+)["']/g;
    const url = [...componentPage.matchAll(address)].map(match => match[1]).find(url => url.startsWith(`/__gallery/components/local/tally/${file}?v=`));
    assert.ok(url, `project pages directly load the shared ${file}`);
    const asset = await fetch(origin + url, { redirect: 'manual' });
    assert.equal(asset.status, 200, 'no project redirect before a shared component asset');
    assert.match(asset.headers.get('cache-control'), /immutable/);
  }
  assert.ok(!componentPage.includes(base + '/__gallery/components/'), 'component tags and generated metadata use canonical shared URLs');
  const componentInline = `<script data-doc-package>fetch('/__gallery/components/local/tally/kit.js?v=123');</script>`;
  assert.equal(projectHtml(componentInline, base), componentInline, 'generated inline component addresses stay shared too');
  assert.match(html, /Project unique body/);
  assert.ok(html.includes(base + '/__gallery/edit/asset/same/assets/picture.svg'));
  assert.ok(html.includes(base + '/__gallery/events?slug=same'));
  assert.match(await (await get(base + '/__gallery/edit/asset/same/assets/picture.svg')).text(), /Project/);
  assert.match(await (await get('/__gallery/edit/asset/same/assets/picture.svg')).text(), /Home/);
  const map = JSON.parse(/id="doc-edit-map" data-doc-dev>([^<]*)<\/script>/.exec(html)[1]);
  assert.equal(map.token, other.token);
  const post = async (prefix, route, body, token) => {
    const response = await fetch(origin + prefix + route, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Gallery-Token': token }, body: JSON.stringify(body) });
    const answer = await response.json(); assert.equal(response.status, 200, JSON.stringify(answer)); assert.equal(answer.ok, true); return answer;
  };
  const startup = await (await get('/__gallery/startup')).json();
  assert.equal(startup.available, false, 'source checkout never registers login startup');
  assert.equal((await fetch(origin + '/__gallery/startup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"enabled":true}' })).status, 403);
  const startupForeign = await fetch(origin + '/__gallery/startup', { method: 'POST', headers: { Origin: 'https://example.com', 'Content-Type': 'application/json', 'X-Gallery-Token': info.token }, body: '{"enabled":true}' });
  assert.equal(startupForeign.status, 403);

  // The same looks command from a project sets a user-level default, including projects
  // opened later. Explicit per-document choices and old workspace files stay intact.
  await post(base, '/__gallery/workspace/look', { slug: 'same', look: { size: 'large' } }, info.token);
  const projectMeta = await fs.readFile(path.join(project, 'same', 'doc.json'), 'utf8');
  await post(base, '/__gallery/workspace/looks', { slug: 'same' }, info.token);
  assert.match(await (await get('/generated/same.html')).text(), /data-doc-size="large"/);
  assert.match(await (await get(base + '/generated/blocks.html')).text(), /data-doc-size="large"/);
  assert.equal(await fs.readFile(path.join(project, 'same', 'doc.json'), 'utf8'), projectMeta);
  await post('', '/__gallery/workspace/look', { slug: 'same', look: {} }, info.token);
  await post('', '/__gallery/workspace/looks', { slug: 'same' }, info.token);
  assert.doesNotMatch(await (await get(base + '/generated/blocks.html')).text(), /data-doc-size=/, 'explicit empty global default resets inherited values');
  assert.match(await (await get(base + '/generated/same.html')).text(), /data-doc-size="large"/, 'individual choice survives changing the global default');
  await post(base, '/__gallery/workspace/rename', { slug: 'same', title: 'Renamed Project' }, info.token);
  assert.match(await fs.readFile(path.join(project, 'same', 'doc.html'), 'utf8'), /Renamed Project/);
  assert.doesNotMatch(await fs.readFile(path.join(home, 'same', 'doc.html'), 'utf8'), /Renamed/);
  const outline = await (await get('/__gallery/workspace/outline')).json();
  assert.ok(outline.reports[`~${workspaceId(project)}/same`]);
  assert.ok(outline.pages.every(page => !page.slug.startsWith("~")));
  const search = await (await get('/__gallery/workspace/search?q=Project%20unique')).json();
  assert.ok(search.results.some(result => result.slug === `~${workspaceId(project)}/same`), 'full text search includes project documents');

  // A single half-written metadata file cannot hide its neighbours or fail either endpoint,
  // including references already stored in the shared tree (which use draftFacts fallback).
  const metaFile = path.join(project, 'same', 'doc.json');
  const validMeta = await fs.readFile(metaFile, 'utf8');
  for (const stored of [false, true]) {
    if (stored) { await fs.writeFile(metaFile, validMeta); forgetSnapshot(project); await writeOutline(home, await readOutline(home)); }
    await fs.writeFile(metaFile, '{'); forgetSnapshot(project);
    const list = await (await get('/__gallery/workspace/outline')).json();
    assert.ok(list.reports[`~${workspaceId(project)}/same`], 'half-written metadata keeps the document');
    assert.ok(list.reports[`~${workspaceId(project)}/blocks`], 'half-written metadata leaves other documents visible');
    assert.ok((await (await get('/__gallery/workspace/search?q=Project%20unique')).json()).results.some(result => result.slug === `~${workspaceId(project)}/same`));
  }
  await fs.writeFile(metaFile, validMeta); forgetSnapshot(project);
  assert.equal((await (await get('/__gallery/workspace/outline')).json()).reports[`~${workspaceId(project)}/same`].title, 'Renamed Project', 'metadata recovers');

  // Two documents in one project resolve its index once per search, with a fresh
  // registry for each request so removing that project takes effect immediately.
  const indexCalls = [];
  const searchService = createWorkspaceService({ reportsDirectory: home, edits: {}, reports: {}, index: { lines: async () => [] },
    projects: { touch() {}, indexOf: async (root, ids) => { indexCalls.push({ root, ids }); return { lines: async () => [] }; } } });
  const localSearch = () => new Promise(resolve => {
    const response = { statusCode: 200, setHeader() {}, end(body) { resolve({ status: this.statusCode, body: JSON.parse(body) }); } };
    searchService.handle({ method: 'GET', url: '/__gallery/workspace/search?q=word', headers: { host: '127.0.0.1:4999' }, socket: { localPort: 4999 } }, response, 'search');
  });
  assert.equal((await localSearch()).status, 200);
  assert.equal(indexCalls.length, 1, 'project index resolved once despite multiple documents');
  assert.ok(indexCalls[0].ids.get(workspaceId(project)).includes(project));
  const registeredForSearch = await fs.readFile(registryFile(), 'utf8');
  await fs.writeFile(registryFile(), JSON.stringify({ version: 1, workspaces: [{ root: home }] }));
  indexCalls.length = 0;
  assert.equal((await localSearch()).status, 200);
  assert.equal(indexCalls.length, 0, 'next search no longer resolves an unregistered project');
  await fs.writeFile(registryFile(), registeredForSearch);

  // A field selection is explicit even when it equals the global or system default.
  const blocksMeta = path.join(project, 'blocks', 'doc.json');
  const originalBlocks = await fs.readFile(blocksMeta, 'utf8');
  await writeGlobalLook({ font: 'serif', size: 'large' });
  await fs.writeFile(blocksMeta, JSON.stringify({ title: 'Blocks', look: { font: 'serif', size: 'large' } }));
  await post(base, '/__gallery/workspace/look', { slug: 'blocks', field: 'width', value: 'wide' }, info.token);
  await post(base, '/__gallery/workspace/look', { slug: 'blocks', field: 'spacing', value: 'default' }, info.token);
  assert.deepEqual(JSON.parse(await fs.readFile(blocksMeta, 'utf8')).look, { font: 'serif', size: 'large', spacing: 'default', width: 'wide' });
  await post(base, '/__gallery/workspace/look', { slug: 'blocks', look: { font: 'serif', size: 'large', width: 'narrow' } }, info.token);
  assert.deepEqual(JSON.parse(await fs.readFile(blocksMeta, 'utf8')).look, { font: 'serif', size: 'large', spacing: 'default', width: 'narrow' }, 'legacy full look preserves unchanged explicit overrides');
  await writeGlobalLook({ font: 'mixed', size: 'small', spacing: 'loose' });
  const keptLook = await (await get(base + '/generated/blocks.html')).text();
  assert.match(keptLook, /data-doc-font="serif"/);
  assert.match(keptLook, /data-doc-size="large"/);
  assert.doesNotMatch(keptLook, /data-doc-spacing="loose"/);
  const invalidLook = await fetch(origin + base + '/__gallery/workspace/look', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Gallery-Token': info.token }, body: JSON.stringify({ slug: 'blocks', field: 'font', value: 'unknown' }) });
  assert.equal(invalidLook.status, 400);
  await fs.writeFile(blocksMeta, originalBlocks); await writeGlobalLook({});
  assert.match(await (await get(base + '/pages/board')).text(), /Board/);
  const trashed = await post(base, '/__gallery/workspace/trash', { slug: 'same' }, other.token);
  const trash = await (await get('/__gallery/workspace/trash')).json();
  assert.ok(trash.entries.some(entry => entry.id === `~${workspaceId(project)}/${trashed.entry.id}`));
  await post(base, '/__gallery/workspace/restore', { id: trashed.entry.id }, other.token);
  assert.match(await fs.readFile(path.join(project, 'same', 'doc.html'), 'utf8'), /Renamed/);
  const missing = await fetch(origin + '/~ws-000000/generated/same.html');
  assert.equal(missing.status, 404, 'unknown projects cannot select a directory');
  const foreignOrigin = await fetch(origin + base + '/__gallery/workspace/rename', { method: 'POST', headers: { Origin: 'http://127.0.0.1:1', 'Content-Type': 'application/json', 'X-Gallery-Token': info.token }, body: JSON.stringify({ slug: 'same', title: 'Forbidden' }) });
  assert.equal(foreignOrigin.status, 403, 'the shared token does not permit writes from another origin');
  assert.doesNotMatch(await fs.readFile(path.join(project, 'same', 'doc.html'), 'utf8'), /Forbidden/);
  const homeAlias = await fetch(origin + projectBase(workspaceId(home)) + '/generated/same.html', { redirect: 'manual' });
  assert.equal(homeAlias.status, 307);
  assert.equal(homeAlias.headers.get('location'), '/generated/same.html', 'the home project keeps only its canonical root address');
  const registered = await fs.readFile(registryFile(), 'utf8');
  await fs.writeFile(registryFile(), JSON.stringify({ version: 1, workspaces: [{ root: home }] }));
  assert.equal((await fetch(origin + base + '/generated/same.html')).status, 404, 'removing a registration immediately blocks a previously opened project');
  await fs.writeFile(registryFile(), registered);
  assert.match(await (await get(base + '/generated/same.html')).text(), /Renamed Project/, 'registering again makes the project accessible without restarting');
  console.log('Checked one service/port: colliding slugs, assets, project commands, search, custom pages, trash and server discovery.');
} finally {
  await service?.close();
  process.env.GALLERY_DATA_DIR = before.data;
  process.env.GALLERY_DEFAULT_WORKSPACE = before.home;
  await fs.rm(temporary, { recursive: true, force: true });
}
