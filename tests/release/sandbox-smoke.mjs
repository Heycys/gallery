import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';

/** Exercise the installed package beside the smoke test's already-running Gallery. */
export async function sandboxSmoke({ bin, temp, env, origin, executablePath }) {
  const name = `release-${randomBytes(6).toString('hex')}`;
  const source = path.join(temp, 'sandbox-extension');
  await fs.mkdir(source);
  await fs.writeFile(path.join(source, 'extension.json'), JSON.stringify({ id: 'sandbox-check', workbench: { script: 'workbench.js' } }));
  await fs.writeFile(path.join(source, 'workbench.js'), "export function activate(api) { const button = document.createElement('button'); button.id = 'sandbox-check-button'; button.textContent = 'Check'; api.slot('topbar-end').append(button); }");
  const child = spawn(process.execPath, [bin, 'sandbox', '--name', name, '--demo', '--extension', source], { cwd: temp, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', errors = '', browser;
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { errors += data; });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  const run = args => new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [bin, 'sandbox', ...args], { cwd: temp, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = ''; proc.stdout.on('data', data => { text += data; }); proc.stderr.on('data', data => { text += data; });
    proc.once('error', reject); proc.once('exit', code => resolve({ code, text }));
  });
  try {
    let url;
    const until = Date.now() + 60000;
    while (Date.now() < until && child.exitCode === null && child.signalCode === null) {
      url = /地址：(http:\/\/127\.0\.0\.1:\d+\/)/.exec(output)?.[1];
      if (url) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(url, `sandbox did not become ready:\n${output}\n${errors}`);
    assert.notEqual(new URL(url).origin, origin, 'sandbox chooses a port independent of the running service');
    const info = await (await fetch(new URL('/__gallery/workspace/info', url))).json();
    assert.equal(info.server.sandbox, name);
    const capabilities = await (await fetch(new URL('/__gallery/extensions', url))).json();
    assert.equal(capabilities.extensions.find(item => item.id === 'sandbox-check').enabled, true);
    assert.ok((await run(['list'])).text.includes(name));
    const sandboxEnv = await run(['env', name]);
    assert.equal(sandboxEnv.code, 0); assert.match(sandboxEnv.text, /GALLERY_NO_AUTOSTART/);
    if (executablePath) {
      const { default: puppeteer } = await import('puppeteer-core');
      browser = await puppeteer.launch({ executablePath, headless: true, args: process.getuid?.() === 0 ? ['--no-sandbox'] : [] });
      const page = await browser.newPage(); const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForSelector('.sandbox-banner');
      await page.waitForSelector('#sandbox-check-button');
      assert.match(await page.$eval('.sandbox-banner', node => node.textContent), /沙盒|Sandbox/);
      assert.deepEqual(pageErrors, []);
    }
    const stopped = await run(['stop', name]);
    assert.equal(stopped.code, 0, stopped.text);
    const result = await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error('sandbox did not exit')), 10000).unref())]);
    assert.equal(result.code, 0);
    assert.equal(await fs.stat(path.join(os.tmpdir(), 'gallery-sandboxes', name)).then(() => true, () => false), false);
    assert.equal((await fetch(origin + '/__gallery/workspace/info')).status, 200, 'ordinary service survives sandbox stop');
    console.log('Sandbox package smoke passed: isolated port, enabled extension, visible marker, CLI environment and clean stop; original service unaffected.');
  } finally {
    await browser?.close();
    if (child.exitCode === null && child.signalCode === null) {
      await run(['stop', name]).catch(() => {});
      if (child.exitCode === null && child.signalCode === null) child.kill();
    }
  }
}
