import './workspace-env.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startProductionServer } from '../../src/server/production.mjs';
import { ensureWorkspace } from '../../src/shared/workspace.mjs';

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'gallery-settings-cli-'));
const home = path.join(temporary, 'home');
const before = { data: process.env.GALLERY_DATA_DIR, home: process.env.GALLERY_DEFAULT_WORKSPACE };
process.env.GALLERY_DATA_DIR = path.join(temporary, 'data');
process.env.GALLERY_DEFAULT_WORKSPACE = home;
let service;
try {
  await ensureWorkspace(home);
  service = await startProductionServer({ reportsDirectory: home, port: 0, web: null, signals: false, log: { log() {}, warn() {}, error: console.error } });
  const cli = path.resolve('src/cli/bin.mjs');
  const invoke = args => promisify(execFile)(process.execPath, [cli, '--workspace', home, 'open', ...args], { windowsHide: true, env: { ...process.env, GALLERY_NO_AUTOSTART: '1', GALLERY_NO_UPDATE_CHECK: '1' } });
  const result = await invoke(['--settings', 'extensions', '--no-browser']);
  assert.ok(result.stdout.includes(`http://127.0.0.1:${service.port}/#settings/extensions`), result.stdout);
  assert.match(result.stdout, /Not opened in a browser/);
  await assert.rejects(invoke(['--settings', 'unknown', '--no-browser']), error => error.code === 2 && error.stderr.includes('--settings accepts extensions'));
  await assert.rejects(invoke(['--settings', 'extensions', 'missing', '--no-browser']), error => error.code === 2 && error.stderr.includes('without a document name'));
  assert.equal((await fs.readdir(home)).includes('missing'), false);
  console.log('Checked open --settings extensions: shared service, deep link, no browser, invalid settings/document combinations rejected.');
} finally {
  await service?.close();
  for (const [key, value] of [['GALLERY_DATA_DIR', before.data], ['GALLERY_DEFAULT_WORKSPACE', before.home]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  await fs.rm(temporary, { recursive: true, force: true });
}
