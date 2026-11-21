import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

// The 17 acceptance checks the extensions came with, using the smoke test's isolated installed
// package and data. Portable to Windows; never registers login startup or uses a global CLI.
export async function extensionsAcceptance({ gallery, origin, token, workspace, temp }) {
  const id = 'accept-test', source = path.join(temp, 'accept-extension');
  fs.mkdirSync(source);
  const manifest = { id, name: '验收用扩展', version: '1.0.0', workbench: { script: 'workbench.js' }, server: { command: ['node', 'server.mjs'] } };
  fs.writeFileSync(path.join(source, 'extension.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(source, 'workbench.js'), 'export function activate() { return () => {}; }');
  fs.writeFileSync(path.join(source, 'server.mjs'), "import http from 'node:http';http.createServer((req,res)=>res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({pid:process.pid}))).listen(Number(process.env.GALLERY_EXTENSION_PORT),'127.0.0.1');");
  const api = async (route, body) => {
    const response = await fetch(origin + route, { method: body ? 'POST' : 'GET', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Gallery-Token': token }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return response.json();
  };
  const entry = async () => (await api('/__gallery/extensions')).extensions.find(item => item.id === id);
  const toggle = enabled => api('/__gallery/extensions', { id, enabled });
  const health = () => api(`/__gallery/extensions/${id}/api/health`);
  let passed = 0;
  const check = (description, actual, expected) => { assert.deepEqual(actual, expected, description); passed++; console.log(`PASS extension acceptance ${passed}: ${description}`); };

  gallery(['extension', 'install', source]);
  check('new installation starts disabled', (await entry()).enabled, false);
  check('enable without revision or confirmation', (await toggle(true)).ok, true);
  check('enabled state is visible', (await entry()).enabled, true);
  const firstPid = (await health()).pid;
  check('enabled backend is usable', Number.isInteger(firstPid) && firstPid > 0, true);

  fs.writeFileSync(path.join(source, 'extension.json'), JSON.stringify({ ...manifest, version: '1.0.1' }));
  gallery(['extension', 'install', source]);
  check('update preserves enabled state', (await entry()).enabled, true);
  check('list exposes the new version', (await entry()).manifest.version, '1.0.1');
  const secondPid = (await health()).pid;
  check('update replaces the backend', Number.isInteger(secondPid) && secondPid > 0 && secondPid !== firstPid, true);
  check('disable through the API', (await toggle(false)).ok, true);
  check('disabled backend is unavailable', (await health()).reason, 'disabled');

  gallery(['extension', 'enable', id]);
  check('CLI enable', (await entry()).enabled, true);
  gallery(['extension', 'disable', id]);
  check('CLI disable', (await entry()).enabled, false);
  const listed = JSON.parse(gallery(['extension', 'list', '--json']).stdout);
  check('CLI JSON contains enabled state', listed.extensions.find(item => item.id === id)?.enabled, false);
  assert.equal(listed.folder, path.join(workspace, 'extensions'), 'CLI JSON names the extensions folder');
  gallery(['extension', 'remove', id]);
  gallery(['extension', 'install', source, '--enable']);
  check('install --enable enables immediately', (await entry()).enabled, true);
  check('old revision/confirmed requests remain compatible', (await api('/__gallery/extensions', { id, enabled: false, revision: 'stale', confirmed: true })).ok, true);

  await toggle(true);
  fs.writeFileSync(path.join(workspace, 'extensions', id, 'extension.json'), '{"server":{"command":"node server.mjs"}}');
  check('malformed manifest is not executable', (await entry()).enabled, false);
  check('malformed extension can be disabled', (await toggle(false)).ok, true);
  check('malformed extension cannot be enabled', (await toggle(true)).ok, false);
  gallery(['extension', 'remove', id]);
  assert.equal(passed, 17);
  console.log('Extension acceptance: 17 passed, 0 failed.');
}
