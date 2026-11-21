// Usage: node tests/release/extension-dev.mjs [package-root]
// The extensions' development acceptance cases, using isolated homes and Gallery's existing sandbox.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gallery-extension-dev-'));
const packageRoot = path.resolve(process.argv[2] || '.');
// The gallery command's launcher, as package.json's bin names it: bin/gallery.mjs in a package, src/cli/bin.mjs in a checkout.
const launcher = path.join(packageRoot, JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8')).bin.gallery);
const home = path.join(root, 'home');
const env = { ...process.env, GALLERY_LANGUAGE: 'zh', GALLERY_WORKSPACE: home, GALLERY_DEFAULT_WORKSPACE: home, GALLERY_DATA_DIR: path.join(root, 'data'), GALLERY_NO_AUTOSTART: '1', GALLERY_NO_UPDATE_CHECK: '1', GALLERY_NO_BROWSER: '1', GALLERY_NO_PREVIEW: '1', GALLERY_NO_PACKS: '1', GALLERY_NO_DEFAULT_HOME: '1', TEMP: root, TMP: root, TMPDIR: root };
const run = (...args) => promisify(execFile)(process.execPath, [launcher, ...args], { env, windowsHide: true, timeout: 120000 }).then(answer => ({ code: 0, text: answer.stdout + answer.stderr }), error => ({ code: error.code, text: (error.stdout ?? '') + (error.stderr ?? '') }));
try {
  assert.equal((await run('init', home)).code, 0);
  const created = await run('extension', 'new', 'demo', '演示', '--ui', '--server'); assert.equal(created.code, 0, created.text);
  for (const file of ['extension.json', 'workbench.js', 'workbench.css', 'server.mjs', 'AGENT.md']) await fs.access(path.join(home, 'extensions/demo', file));
  // A column its backend would write (columns/<column>.json): check reads it as the sidebar does.
  await fs.mkdir(path.join(home, 'extensions/demo/columns'));
  await fs.writeFile(path.join(home, 'extensions/demo/columns/docs.json'), JSON.stringify({ title: '演示文档', entries: [{ id: 'a', title: '甲', url: 'https://example.com/a' }] }));
  const before = await fs.readFile(path.join(home, 'gallery.json'), 'utf8');
  const checked = await run('extension', 'check', 'demo', '--shot', path.join(root, 'demo.png'));
  assert.equal(checked.code, 0, checked.text); assert.match(checked.text, /Backend: listening/); assert.match(checked.text, /sidebar-footer: 演示/); await fs.access(path.join(root, 'demo.png'));
  assert.match(checked.text, /OK demo:docs: 1 entry/);
  const listed = JSON.parse((await run('extension', 'list', '--json')).text);
  assert.deepEqual(listed.extensions.find(item => item.id === 'demo').columns.map(({ id, title, count, hidden }) => ({ id, title, count, hidden })), [{ id: 'docs', title: '演示文档', count: 1, hidden: true }]);
  assert.equal(await fs.readFile(path.join(home, 'gallery.json'), 'utf8'), before, 'checking does not enable the original');
  console.log('PASS generated UI/backend template, actual activation, screenshot and original isolation');
  // The same workspace reached through a link on the way (macOS's /tmp is /private/tmp): its links are resolved.
  const via = path.join(root, 'via'); await fs.symlink(root, via, process.platform === 'win32' ? 'junction' : 'dir');
  const linkedHome = path.join(via, 'home');
  const linked = await promisify(execFile)(process.execPath, [launcher, 'extension', 'check', 'demo'], { env: { ...env, GALLERY_WORKSPACE: linkedHome, GALLERY_DEFAULT_WORKSPACE: linkedHome }, windowsHide: true, timeout: 120000 }).then(answer => ({ code: 0, text: answer.stdout + answer.stderr }), error => ({ code: error.code, text: (error.stdout ?? '') + (error.stderr ?? '') }));
  assert.equal(linked.code, 0, linked.text); assert.match(linked.text, /sidebar-footer: 演示/);
  console.log('PASS a workspace reached through a link');
  // The template's round trip, pressed: its button asks the backend through the proxy and toasts the answer.
  const pressed = await run('extension', 'check', 'demo', '--press', '演示');
  assert.equal(pressed.code, 0, pressed.text); assert.match(pressed.text, /GET api\/hello → 200 \{"ok":true,"message":"演示：后台已连上"\}/); assert.match(pressed.text, /toast: 演示：后台已连上/);
  const missing = await run('extension', 'check', 'demo', '--press', 'nope');
  assert.equal(missing.code, 1, missing.text); assert.match(missing.text, /No slot button "nope": the buttons are "演示"/);
  // A route that fails, pressed: the status, and the backend's log; the copy's paths given as the extension's own folder.
  await fs.writeFile(path.join(home, 'extensions/demo/server.mjs'), (await fs.readFile(path.join(home, 'extensions/demo/server.mjs'), 'utf8')).replace("if (pathname === '/hello'", "if (pathname === '/hello') { console.error('hello-broke at ' + process.cwd()); response.statusCode = 500; return response.end('{}'); }\n  if (pathname === '/never'"));
  const broken = await run('extension', 'check', 'demo', '--press', '演示');
  assert.equal(broken.code, 1, broken.text); assert.match(broken.text, /the press: GET api\/hello answered 500/); assert.match(broken.text, /hello-broke at /);
  assert.ok(broken.text.includes(path.join(home, 'extensions', 'demo')) && !broken.text.includes('gallery-sandboxes'), broken.text);
  console.log('PASS --press: the template round trip, a missing button, a failing route with its log in the own folder');
  for (const [id, manifest, files, expected] of [
    ['bad-manifest', { server: { command: 'node server.mjs' } }, {}, /server.command/],
    ['missing', { workbench: { script: 'missing.js' } }, {}, /missing.js/],
    ['throws', { workbench: { script: 'workbench.js' } }, { 'workbench.js': 'throw new Error("boom-from-throws");' }, /boom-from-throws/],
    // A top-level script that exports nothing, as written for the old window.gallery: only activate(api) runs.
    ['no-activate', { workbench: { script: 'workbench.js' } }, { 'workbench.js': 'globalThis.ranWithoutActivate = true;' }, /工作台脚本需要导出 activate\(api\)/],
    ['dies', { server: { command: ['node', 'server.mjs'] } }, { 'server.mjs': 'console.error("dies-on-start"); process.exit(3);' }, /exit code 3[\s\S]*dies-on-start/],
  ]) {
    const directory = path.join(home, 'extensions', id); await fs.mkdir(directory);
    await fs.writeFile(path.join(directory, 'extension.json'), JSON.stringify({ id, name: id, ...manifest }));
    for (const [name, text] of Object.entries(files)) await fs.writeFile(path.join(directory, name), text);
    const answer = await run('extension', 'check', id);
    assert.equal(answer.code, 1, answer.text); assert.match(answer.text, expected);
    console.log('PASS useful failure: ' + id);
  }
  const help = (await run('help', 'extension')).text;
  assert.match(help, /extension.json/); assert.match(help, /workbench/); assert.match(help, /backend/);
  console.log('PASS extension development help');
} finally { await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
