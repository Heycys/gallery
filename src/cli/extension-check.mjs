import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { launcherFile } from '../shared/paths.mjs';
import { startBrowser, findBrowser, lookingArguments } from '../transfer/browser.mjs';

// What a failure says of the sandbox's copy, said of the extension's own files: the copy's folder (a
// backend's log, a stack) and the address a workbench file is served at (a stack's line of workbench.js),
// each given as `folder`, so that the place to fix is the file the Agent edits.
export const ownPlaces = (text, folder, id) => text
  .replace(new RegExp(String.raw`(?:file:///)?(?:[A-Za-z]:)?[^\s'"()]*?gallery-sandboxes[\\/][^\\/\s]+[\\/]home[\\/]extensions[\\/]` + id + String.raw`(?![\w-])`, 'g'), () => folder)
  .replace(new RegExp(String.raw`https?://127\.0\.0\.1:\d+/__gallery/extensions/` + id + String.raw`/files/(?:@revision/[0-9a-f]+/)?`, 'g'), () => folder + path.sep);

// --press: the slot button labelled `label` (its aria-label, else its words; else the one whose words hold
// it) clicked, then what it did until its requests to the backend have answered (at least a second, at
// most 15): { pressed, labels, requests: [{ method, path, status, body }], toasts: [{ text, error }] }.
async function pressButton(page, id, label) {
  const requests = [];
  const pending = new Set();
  const api = `/__gallery/extensions/${id}/api/`;
  page.on('request', (request) => { if (request.url().includes(api)) pending.add(request); });
  page.on('requestfailed', (request) => {
    if (!pending.delete(request)) return;
    requests.push({ method: request.method(), path: '/' + request.url().split(api)[1], status: 'failed', body: request.failure()?.errorText ?? '' });
  });
  page.on('response', async (response) => {
    const request = response.request();
    if (!pending.has(request)) return;
    const body = await response.text().catch(() => '');
    requests.push({ method: request.method(), path: '/' + response.url().split(api)[1], status: response.status(), body: body.replace(/\s+/g, ' ').slice(0, 200) });
    pending.delete(request);
  });
  const found = await page.evaluate((id, label) => {
    const buttons = [...document.querySelectorAll('.gallery-extension-slot [data-extension="' + CSS.escape(id) + '"] button')];
    const said = (node) => node.getAttribute('aria-label') || node.textContent.trim();
    const button = buttons.find((node) => said(node) === label) ?? buttons.find((node) => node.textContent.includes(label));
    if (!button) return { pressed: false, labels: buttons.map(said) };
    const toasts = globalThis.__galleryCheckToasts = [];
    const look = () => {
      for (const node of document.querySelectorAll('.toast')) {
        const text = node.textContent.trim();
        if (text && !toasts.some((toast) => toast.text === text)) toasts.push({ text, error: node.classList.contains('error') });
      }
    };
    new MutationObserver(look).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    button.click();
    return { pressed: true, labels: [] };
  }, id, label);
  if (!found.pressed) return { ...found, requests, toasts: [] };
  const start = Date.now();
  let quiet = Date.now();
  while (Date.now() - start < 15000) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (pending.size) quiet = Date.now();
    else if (Date.now() - start >= 1000 && Date.now() - quiet >= 500) break;
  }
  const toasts = await page.evaluate(() => globalThis.__galleryCheckToasts ?? []);
  return { ...found, requests, toasts };
}

// Use the same isolated service, installation and cleanup as `gallery sandbox`.
// Checking a disabled extension must never grant it access to the user's workspace.
export async function checkProgram(folder, manifest, { shot, press } = {}) {
  try {
    return await checkCopy(folder, manifest, { shot, press });
  } catch (error) {
    error.message = ownPlaces(error.message, folder, manifest.id ?? path.basename(folder));
    throw error;
  }
}

async function checkCopy(folder, manifest, { shot, press }) {
  const name = 'check-' + randomBytes(6).toString('hex');
  const cli = launcherFile;
  const child = spawn(process.execPath, [cli, 'sandbox', '--name', name, '--extension', folder], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GALLERY_NO_BROWSER: '1', GALLERY_NO_AUTOSTART: '1' } });
  let output = '', origin, token, session;
  const exited = new Promise(resolve => child.once('exit', resolve));
  try {
    origin = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Extension sandbox did not start within 90 seconds.\n' + output.slice(-3000))), 90000);
      const finish = (error, url) => { clearTimeout(timer); error ? reject(error) : resolve(url); };
      child.once('error', error => finish(error));
      child.once('exit', code => finish(new Error(`Sandbox exited (${code}): ${output.slice(-3000)}`)));
      const read = data => { output = (output + data).slice(-20000); const url = /地址：(http:\/\/127\.0\.0\.1:\d+)\//.exec(output)?.[1]; if (url) finish(null, url); };
      child.stdout.on('data', read); child.stderr.on('data', read);
    });
    const info = await fetch(origin + '/__gallery/workspace/info').then(r => r.json());
    token = info.token;
    const list = () => fetch(origin + '/__gallery/extensions').then(r => r.json());
    const items = (await list()).extensions;
    const item = items.find(item => item.manifest?.id === manifest.id) ?? items[0];
    if (!item?.enabled) throw new Error('Sandbox could not enable extension.');
    if (manifest.server) {
      const response = await fetch(`${origin}/__gallery/extensions/${item.id}/api/health`, { headers: { Origin: origin, 'X-Gallery-Token': token }, signal: AbortSignal.timeout(15000) });
      const current = (await list()).extensions.find(value => value.id === item.id);
      if (current?.backend?.state !== 'running') {
        const log = await fs.readFile(current.backend.log, 'utf8').catch(() => '');
        throw new Error(`Backend failed (exit code ${current.backend.exitCode ?? '?'}):\n${log.trim().split(/\r?\n/).slice(-20).join('\n')}`);
      }
      // A plugin need not implement /health; listening is the startup contract.
      await response.body?.cancel(); console.log('Backend: listening');
    }
    if (press && !manifest.workbench) throw new Error('--press presses a button of the workbench script, and extension.json declares none (workbench.script).');
    if (manifest.workbench || shot) {
      const executablePath = findBrowser();
      if (!executablePath) throw new Error('Chrome or Edge is required to check extension UI.');
      session = await startBrowser({ executablePath, args: lookingArguments() });
      const page = await session.browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      const errors = [];
      page.on('pageerror', error => { if (String(error.stack).includes(`/__gallery/extensions/${item.id}/files/`)) errors.push(error.message); });
      // The workbench tells the service what came of the script once (POST workbench-error): its error, or
      // nothing once activate(api) has returned. Heard from before the page loads, so a quick one is not missed.
      const reportOf = request => { try { return JSON.parse(request.postData() ?? '{}').id; } catch { return null; } };
      const settled = manifest.workbench?.script ? page.waitForResponse(response => response.url().endsWith('/__gallery/extensions/workbench-error') && reportOf(response.request()) === item.id, { timeout: 20000 }).then(() => true, () => false) : null;
      // Gallery keeps an event stream open; zero active connections is never a ready signal.
      await page.goto(origin + '/#@home', { waitUntil: 'networkidle2' });
      await page.waitForSelector('.gallery-extension-anchor', { timeout: 15000 });
      if (settled && !await settled) errors.push(`The workbench script did not finish: activate(api) had not returned after 20 seconds (${manifest.workbench.script}).`);
      const current = (await list()).extensions.find(value => value.id === item.id);
      if (current?.workbenchError) errors.push(current.workbenchError);
      if (errors.length) throw new Error([...new Set(errors)].join('\n'));
      const buttons = await page.evaluate(id => ['sidebar-footer', 'topbar-end'].map(slot => ({ slot, buttons: [...document.querySelectorAll('.gallery-extension-slot.' + slot + ' [data-extension="' + CSS.escape(id) + '"] button')].map(node => node.getAttribute('aria-label') || node.textContent.trim()) })), item.id);
      for (const slot of buttons) console.log(`${slot.slot}: ${slot.buttons.join(', ') || '(no buttons)'}`);
      if (press) {
        const pressed = await pressButton(page, item.id, press);
        if (!pressed.pressed) throw new Error(`No slot button "${press}": ${pressed.labels.length ? `the buttons are ${pressed.labels.map((label) => JSON.stringify(label)).join(', ')}` : 'the extension shows none'} (--press takes a button's aria-label or its words).`);
        console.log(`Pressed: ${press}`);
        for (const { method, path: asked, status, body } of pressed.requests) console.log(`  ${method} api${asked} → ${status}${body ? ` ${body}` : ''}`);
        if (!pressed.requests.length) console.log('  no request to the backend (api/)');
        for (const { text, error } of pressed.toasts) console.log(`  toast${error ? ' (error)' : ''}: ${text}`);
        const failed = [
          ...pressed.requests.filter(({ status }) => status === 'failed' || status >= 400).map(({ method, path: asked, status }) => `${method} api${asked} answered ${status}`),
          ...pressed.toasts.filter(({ error }) => error).map(({ text }) => `an error toast: ${text}`),
          ...errors,
        ];
        const now = (await list()).extensions.find(value => value.id === item.id);
        if (now?.workbenchError && !failed.includes(now.workbenchError)) failed.push(now.workbenchError);
        if (failed.length) {
          const log = manifest.server ? await fs.readFile(now?.backend?.log ?? '', 'utf8').catch(() => '') : '';
          const tail = log.trim() ? '\nBackend log (last 20 lines):\n' + log.trim().split(/\r?\n/).slice(-20).join('\n') : '';
          throw new Error(`the press: ${[...new Set(failed)].join('; ')}${tail}`);
        }
      }
      if (shot) { await fs.mkdir(path.dirname(path.resolve(shot)), { recursive: true }); await page.screenshot({ path: path.resolve(shot) }); console.log(`Screenshot: ${path.resolve(shot)}`); }
    }
  } finally {
    await session?.close();
    if (origin && token) await fetch(origin + '/__gallery/workspace/stop', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Gallery-Token': token }, body: '{}' }).catch(() => {});
    else if (child.exitCode === null) child.kill();
    let timer;
    await Promise.race([exited, new Promise(resolve => { timer = setTimeout(() => { child.kill(); resolve(); }, 10000); })]); clearTimeout(timer);
  }
}
