// Run against a checkout or a built package, with no real workspace or browser profile.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gallery-preview-cli-'));
// The gallery command's launcher, as package.json's bin names it: bin/gallery.mjs in a package, src/cli/bin.mjs in a checkout.
const packageRoot = path.resolve(process.argv[2] || '.');
const cli = path.join(packageRoot, JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8')).bin.gallery);
const env = { ...process.env, GALLERY_LANGUAGE: 'zh', GALLERY_WORKSPACE: path.join(root, 'home'), GALLERY_DEFAULT_WORKSPACE: path.join(root, 'home'), GALLERY_DATA_DIR: path.join(root, 'data'), GALLERY_NO_AUTOSTART: '1', GALLERY_NO_UPDATE_CHECK: '1', GALLERY_NO_BROWSER: '1' };
const run = (...args) => promisify(execFile)(process.execPath, [cli, 'preview', ...args], { env, cwd: root, windowsHide: true, timeout: 60000 });
try {
  await run('new', 'settings');
  const input = path.join(root, 'settings.page.html');
  const source = (await fs.readFile(input, 'utf8')).replace('<div class="comp-body"></div>', '<div class="comp-body"><button class="dialog-btn" onclick="preview.toast(\'Hello\')">Preview action</button></div>');
  await fs.writeFile(input, source);
  const answer = await run(input, '--shots', path.join(root, 'shots'));
  assert.match(answer.stdout, /Screenshots: 3/);
  for (const [name, width] of [['light', 1280], ['dark', 1280], ['narrow', 560]]) {
    const png = await fs.readFile(path.join(root, 'shots', name + '.png'));
    assert.equal(png.readUInt32BE(16), width);
    assert.ok(png.readUInt32BE(20) > 500);
  }
  assert.equal(await fs.readFile(input, 'utf8'), source, 'building never rewrites the source');
  assert.equal(await fs.stat(env.GALLERY_DEFAULT_WORKSPACE).catch(() => null), null, 'previews do not create a workspace');
  if (process.env.GALLERY_PREVIEW_SCREENSHOT) await fs.cp(path.join(root, 'shots'), process.env.GALLERY_PREVIEW_SCREENSHOT, { recursive: true });
  console.log('PASS preview CLI creates standalone HTML and light/dark/narrow screenshots without workspace changes');
} finally { await fs.rm(root, { recursive: true, force: true }); }
