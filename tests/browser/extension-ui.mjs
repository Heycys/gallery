import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createZip } from '../../src/transfer/zip.mjs';

export async function extensionWorkbench(t, { openHome, waitFor }) {
  t.page.on('response', async response => { if (response.status() >= 400 && response.url().includes('/__gallery/extensions')) console.log('  extension response:', response.status(), response.url(), await response.text().catch(() => '')); });
  const source = path.join(t.root, 'extension-source'), legacy = path.join(t.root, 'extension-legacy');
  await fs.mkdir(source, { recursive: true }); await fs.mkdir(legacy, { recursive: true });
  await fs.writeFile(path.join(source, 'extension.json'), JSON.stringify({ id: 'test-addon', name: '测试拓展', version: '1.2.3', description: '一个测试拓展', icon: '📗', workbench: { script: 'workbench.js', style: 'workbench.css' } }));
  await fs.writeFile(path.join(source, 'workbench.js'), `export function activate(api) {
    window.addonStarts=(window.addonStarts||0)+1;
    const b=document.createElement('button'); b.id='addon-button'; api.slot('topbar-end').append(b);
    const foot=document.createElement('span'); foot.id='addon-footer'; api.slot('sidebar-footer').append(foot);
    api.onRoute(value=>{window.addonRoute=value});
    window.addonBackend=api.backend;
    api.fetch('/probe?x=1').then(r=>r.json()).then(body=>{window.addonFetch=body.reason});
    api.fetch('https://example.com/').catch(error=>{window.addonRefused=error instanceof TypeError});
    return ()=>{window.addonStops=(window.addonStops||0)+1};
  }`);
  await fs.writeFile(path.join(source, 'workbench.css'), '#addon-button { color: rgb(120, 40, 20); }');
  await fs.writeFile(path.join(legacy, 'extension.json'), JSON.stringify({ id: 'legacy-addon', name: '旧拓展', workbench: { script: 'workbench.js' } }));
  // A top-level script without activate(api): it runs as a module, and is then an extension error.
  await fs.writeFile(path.join(legacy, 'workbench.js'), "window.legacyStarts=(window.legacyStarts||0)+1;");
  t.gallery('extension', 'install', source); t.gallery('extension', 'install', legacy);
  const asyncSource = path.join(t.root, 'async-source'); await fs.mkdir(asyncSource, { recursive: true });
  await fs.writeFile(path.join(asyncSource, 'extension.json'), JSON.stringify({ id: 'async-addon', name: '异步拓展', workbench: { script: 'workbench.js' } }));
  await fs.writeFile(path.join(asyncSource, 'workbench.js'), `export async function activate(api) { await new Promise(resolve => { window.finishAsyncAddon = resolve }); const node = document.createElement('span'); node.id = 'async-addon-button'; api.slot('topbar-end').append(node); return () => { window.asyncAddonDisposed = true }; }`);
  t.gallery('extension', 'install', asyncSource);
  const bad = path.join(t.root, 'extension-bad'); await fs.mkdir(bad, { recursive: true });
  await fs.writeFile(path.join(bad, 'extension.json'), JSON.stringify({ id: 'broken-addon', name: '损坏拓展' }));
  t.gallery('extension', 'install', bad, '--enable');
  await fs.writeFile(path.join(t.root, 'reports', 'extensions', 'broken-addon', 'extension.json'), '{invalid');
  const column = path.join(t.root, 'reports', 'extensions', 'static-column'); await fs.mkdir(column, { recursive: true });
  await fs.writeFile(path.join(column, 'sidebar.json'), JSON.stringify({ title: '示例栏目', icon: '📚', entries: [{ id: 'one', title: '文档', url: 'https://example.com' }] }));
  await openHome(t);
  t.check(await t.page.evaluate(() => !window.addonStarts && !window.legacyStarts), 'installed scripts stay disabled until enabled');
  await t.page.evaluate(() => document.querySelector('.sb-foot .ws-btn').click());
  await waitFor(t, () => t.page.evaluate(() => [...document.querySelectorAll('.menu-item')].some(item => item.textContent.trim() === '拓展列表')));
  await t.page.evaluate(() => [...document.querySelectorAll('.menu-item')].find(item => item.textContent.trim() === '拓展列表').click());
  const card = '.ext-card[data-id="test-addon"]'; await t.page.waitForSelector(card);
  const broken = '.ext-card[data-id="broken-addon"]'; await t.page.waitForSelector(`${broken} [role="alert"]`);
  t.check(await t.page.$eval(`${broken} [role="switch"]`, el => el.getAttribute('aria-checked') === 'true'), 'broken previously enabled extension can still be disabled');
  await t.page.click(`${broken} [role="switch"]`);
  await waitFor(t, () => t.page.$eval(`${broken} [role="switch"]`, el => el.getAttribute('aria-checked') === 'false' && el.getAttribute('aria-disabled') === 'true'));
  t.check(await t.page.$eval(`${broken} [role="switch"]`, el => el.getAttribute('aria-disabled') === 'true'), 'broken extension cannot be enabled until fixed');
  await t.page.waitForSelector('.ext-card[data-id="static-column"]');
  t.check(await t.page.$eval('.ext-card[data-id="static-column"]', el => el.textContent.includes('1 个条目') && !el.querySelector('[role="switch"]')), 'sidebar columns share the grid without a toggle');
  await t.page.click(card + ' .comp-pack-open');
  await t.page.waitForSelector('.ext-view');
  t.check(await t.page.evaluate(() => document.activeElement?.classList.contains('comp-back') && document.querySelector('.ext-view').textContent.includes('一个测试拓展')), 'detail shows description and focuses its back button');
  await t.page.click('.comp-back');
  t.check(await t.page.evaluate(() => document.activeElement?.closest('[data-id]')?.getAttribute('data-id') === 'test-addon'), 'back restores focus to the card');
  const initial = await t.page.$eval(card, el => ({ text: el.textContent, enabled: el.querySelector('[role="switch"]').getAttribute('aria-checked') }));
  t.check(initial.text.includes('测试拓展') && initial.text.includes('1.2.3') && !initial.text.includes('一个测试拓展') && initial.enabled === 'false', 'card shows compact name/version and disabled state', initial);
  await t.page.click(`${card} [role="switch"]`); await t.page.waitForSelector('#addon-button');
  const result = await t.page.evaluate(() => ({ starts: window.addonStarts, title: window.addonRoute?.title, color: getComputedStyle(document.querySelector('#addon-button')).color, foot: !!document.querySelector('.sb-inner #addon-footer'), frame: [...document.querySelectorAll('iframe')].some(frame => frame.contentWindow?.addonStarts), owners: document.querySelectorAll('[data-extension="test-addon"].gallery-extension-owner').length }));
  t.check(result.starts === 1 && result.color === 'rgb(120, 40, 20)' && result.owners === 2, 'activation loads one module, its stylesheet and two private slots', result);
  t.check(result.foot && !result.frame && Boolean(result.title), 'scoped slots and route are in the workbench only', result);
  // No backend declared: the proxy's 404 "backend" answer comes after its token check, so the token went with it.
  await t.page.waitForFunction(() => window.addonFetch !== undefined && window.addonRefused !== undefined);
  const backend = await t.page.evaluate(() => ({ backend: window.addonBackend, expected: location.origin + '/__gallery/extensions/test-addon/api/', fetched: window.addonFetch, refused: window.addonRefused }));
  t.check(backend.backend === backend.expected && backend.fetched === 'backend' && backend.refused === true, 'api.backend is the backend\'s address, api.fetch asks it with the token and refuses another address', backend);
  await waitFor(t, () => t.page.$eval(`${card} [role="switch"]`, el => el.getAttribute('aria-disabled') === 'false'));
  await t.page.click(`${card} [role="switch"]`);
  await waitFor(t, () => t.page.evaluate(() => !document.querySelector('#addon-button') && window.addonStops === 1));
  t.check(await t.page.evaluate(() => !document.querySelector('[data-extension="test-addon"].gallery-extension-owner') && !document.querySelector('link[href*="test-addon/files/"]')), 'disable runs dispose and removes private slots and CSS');
  await waitFor(t, () => t.page.$eval(`${card} [role="switch"]`, el => el.getAttribute('aria-disabled') === 'false'));
  await t.page.click(`${card} [role="switch"]`);
  await waitFor(t, () => t.page.evaluate(() => window.addonStarts === 2 && !!document.querySelector('#addon-button')));
  t.check(await t.page.evaluate(() => document.querySelectorAll('#addon-button').length === 1), 're-enabling activates once without duplicate UI');
  const second = await t.page.browser().newPage();
  try {
    await second.goto(t.home(), { waitUntil: 'load' }); await second.waitForSelector('#addon-button');
    await t.page.click(`${card} [role="switch"]`);
    await second.waitForFunction(() => !document.querySelector('#addon-button') && window.addonStops === 1);
    await t.page.waitForFunction(() => document.querySelector('.ext-card[data-id="test-addon"] [role="switch"]')?.getAttribute('aria-disabled') === 'false');
    await t.page.click(`${card} [role="switch"]`); await second.waitForSelector('#addon-button');
    t.check(await second.evaluate(() => window.addonStarts === 2), 'another open tab follows switch changes');
  } finally { await second.close(); }
  await t.page.waitForFunction(() => document.querySelector('.ext-card[data-id="test-addon"] [role="switch"]')?.getAttribute('aria-disabled') === 'false');
  await fs.appendFile(path.join(source, 'workbench.js'), '\nwindow.addonSourceVersion = 2;');
  await fs.writeFile(path.join(source, 'extension.json'), JSON.stringify({ id: 'test-addon', name: '测试拓展', version: '1.2.4', description: '一个测试拓展', icon: '📗', workbench: { script: 'workbench.js', style: 'workbench.css' } }));
  t.gallery('extension', 'install', source);
  await t.page.waitForFunction(() => window.addonSourceVersion === 2 && window.addonStarts === 4 && window.addonStops === 3);
  t.check(await t.page.evaluate(() => document.querySelectorAll('#addon-button').length === 1), 'updating an enabled extension disposes the old version and activates the new one');
  const installed = path.join(t.root, 'reports', 'extensions', 'test-addon');
  await fs.mkdir(path.join(installed, 'lib'));
  await fs.writeFile(path.join(installed, 'lib', 'label.js'), "export const label = 'dependency one';");
  const dependent = `import {label} from './lib/label.js'; export function activate(api) { const b=document.createElement('button'); b.id='addon-button'; b.textContent=label; api.slot('topbar-end').append(b); }`;
  await fs.writeFile(path.join(installed, 'workbench.js'), dependent);
  await t.page.waitForFunction(() => document.querySelector('#addon-button')?.textContent === 'dependency one');
  await fs.writeFile(path.join(installed, 'lib', 'label.js'), "export const label = 'dependency two';");
  await t.page.waitForFunction(() => document.querySelector('#addon-button')?.textContent === 'dependency two');
  t.check(await t.page.evaluate(() => document.querySelectorAll('#addon-button').length === 1), 'nested imported dependency reloads without duplicate slots or stale module cache');
  await fs.writeFile(path.join(installed, 'workbench.js'), "export function activate() { throw new Error('expected-activation-failure'); }");
  await t.page.waitForFunction(() => document.querySelector('.ext-card[data-id="test-addon"]')?.textContent.includes('界面错误'));
  await t.page.click(card + ' .comp-pack-open');
  t.check(await t.page.$eval('.ext-view', el => el.textContent.includes('expected-activation-failure')), 'detail shows the actual activation error');
  await t.page.click('.comp-back');
  t.check(await t.page.evaluate(() => !document.querySelector('#addon-button')), 'activation failure is visible in the extension list and removes its UI');
  const expectedErrors = t.takeErrors();
  t.check(expectedErrors.every(error => String(error).includes('expected-activation-failure')), 'only the deliberate activation error was reported', expectedErrors);
  await fs.writeFile(path.join(installed, 'workbench.js'), dependent);
  await t.page.waitForFunction(() => document.querySelector('#addon-button')?.textContent === 'dependency two' && !document.querySelector('.ext-card[data-id="test-addon"]')?.textContent.includes('界面错误'));
  t.check(true, 'fixing the script recovers and clears the previous error without a reload');
  const delayed = '.ext-card[data-id="async-addon"]';
  await t.page.click(`${delayed} [role="switch"]`);
  await t.page.waitForFunction(() => typeof window.finishAsyncAddon === 'function');
  await waitFor(t, () => t.page.$eval(`${delayed} [role="switch"]`, el => el.getAttribute('aria-disabled') === 'false'));
  await t.page.click(`${delayed} [role="switch"]`);
  await t.page.waitForFunction(() => document.querySelector('.ext-card[data-id="async-addon"] [role="switch"]')?.getAttribute('aria-checked') === 'false');
  await t.page.evaluate(() => window.finishAsyncAddon());
  await t.page.waitForFunction(() => window.asyncAddonDisposed === true);
  t.check(await t.page.evaluate(() => !document.querySelector('#async-addon-button') && !document.querySelector('[data-extension="async-addon"].gallery-extension-owner')), 'late async activation cannot restore disabled UI and its disposer runs');
  t.check(await t.page.evaluate(() => !('gallery' in window)), 'there is no global window.gallery');
  const old = '.ext-card[data-id="legacy-addon"]'; await t.page.click(`${old} [role="switch"]`);
  await t.page.waitForFunction(() => document.querySelector('.ext-card[data-id="legacy-addon"]')?.textContent.includes('界面错误'));
  await t.page.click(old + ' .comp-pack-open');
  t.check(await t.page.$eval('.ext-view', el => el.textContent.includes('工作台脚本需要导出 activate(api)')), 'a script without activate(api) is an extension error that says so');
  await t.page.click('.comp-back');
  t.check(await t.page.evaluate(() => window.legacyStarts === 1 && !('gallery' in window)), 'the module ran once and found no global');
  const legacyErrors = t.takeErrors();
  t.check(legacyErrors.every(error => String(error).includes('activate(api)')), 'only the missing activate was reported', legacyErrors);
  await waitFor(t, () => t.page.$eval(`${old} [role="switch"]`, el => el.getAttribute('aria-disabled') === 'false'));
  await t.page.click(`${old} [role="switch"]`);
  await t.page.waitForFunction(() => document.querySelector('.ext-card[data-id="legacy-addon"] [role="switch"]')?.getAttribute('aria-checked') === 'false');
  t.check(await t.page.evaluate(() => !document.querySelector('.ext-card[data-id="legacy-addon"]')?.textContent.includes('刷新')), 'disabling it asks for no refresh');
  await t.page.reload({ waitUntil: 'load' }); await t.page.waitForSelector('#addon-button');
  t.check(await t.page.evaluate(() => !window.legacyStarts), 'a disabled script does not run after a reload');
  await t.page.goto(new URL('/#settings/extensions', t.page.url()).href, { waitUntil: 'load' });
  await t.page.waitForSelector('[role="dialog"][aria-label="拓展列表"]').catch(async error => { console.log('  deep link debug:', await t.page.evaluate(() => ({ href: location.href, state: history.state, dialogs: [...document.querySelectorAll('[role=dialog]')].map(el => el.getAttribute('aria-label')) }))); throw error; });
  t.check(await t.page.evaluate(() => location.hash !== '#settings/extensions'), 'settings deep link is consumed');
  await t.page.click('[role="dialog"][aria-label="拓展列表"] button[aria-label="关闭"]');
  // A hash navigation reports popstate before hashchange; the route must act on the first event.
  await t.page.evaluate(() => { history.pushState(null, '', '#settings/extensions'); window.dispatchEvent(new PopStateEvent('popstate')); });
  const openedFromPop = await t.page.waitForSelector('[role="dialog"][aria-label="拓展列表"]', { timeout: 3000 }).then(() => true, () => false);
  const popState = await t.page.evaluate(() => ({ hash: location.hash, open: !!document.querySelector('[role="dialog"][aria-label="拓展列表"]') }));
  t.check(openedFromPop, 'settings deep link is handled at popstate before hashchange', popState);
  await t.page.evaluate(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
  if (!openedFromPop) throw new Error('settings link was missed before hashchange');
  if (process.env.GALLERY_EXTENSION_SCREENSHOT) {
    await fs.mkdir(process.env.GALLERY_EXTENSION_SCREENSHOT, { recursive: true });
    await t.page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await t.page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await new Promise(resolve => setTimeout(resolve, 350));
    await t.page.screenshot({ path: path.join(process.env.GALLERY_EXTENSION_SCREENSHOT, 'extensions-light.png') });
    await t.page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await new Promise(resolve => setTimeout(resolve, 350));
    await t.page.screenshot({ path: path.join(process.env.GALLERY_EXTENSION_SCREENSHOT, 'extensions-dark.png') });
    await t.page.setViewport({ width: 560, height: 900, deviceScaleFactor: 1 });
    await t.page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await new Promise(resolve => setTimeout(resolve, 350));
    await t.page.screenshot({ path: path.join(process.env.GALLERY_EXTENSION_SCREENSHOT, 'extensions-narrow-dark.png') });
    const overflow = await t.page.$eval('.ext-dialog', el => ({ client: el.clientWidth, scroll: el.scrollWidth, height: el.getBoundingClientRect().height }));
    t.check(overflow.scroll <= overflow.client, 'narrow dialog has no horizontal overflow', overflow);
  }
  const extra = path.join(t.root, 'path-source'); await fs.mkdir(extra, { recursive: true });
  await fs.writeFile(path.join(extra, 'extension.json'), JSON.stringify({ id: 'path-addon', name: '路径拓展' }));
  await t.page.click('.comp-pack-add'); await t.page.type('.ext-import .pop-input', extra); await t.page.click('.ext-import .dialog-btn');
  await t.page.waitForSelector('.ext-card[data-id="path-addon"]');
  const pathEarly = await t.page.$eval('.ext-card[data-id="path-addon"] [role="switch"]', el => el.getAttribute('aria-checked'));
  await t.page.waitForFunction(() => !document.querySelector('.ext-import'));
  const pathAfter = await t.page.$eval('.ext-card[data-id="path-addon"] [role="switch"]', el => el.getAttribute('aria-checked'));
  const pathSaved = JSON.parse(await fs.readFile(path.join(t.root, 'reports', 'gallery.json'), 'utf8')).extensions?.['path-addon']?.enabled;
  console.log('  path install early/final/persisted:', pathEarly, pathAfter, pathSaved);
  t.check(pathAfter === 'true' && pathSaved === true, 'install from a folder enables it', { pathEarly, pathAfter, pathSaved });
  const zip = path.join(t.root, 'zip-addon.zip'); await fs.writeFile(zip, createZip([{ name: 'extension.json', data: JSON.stringify({ name: '压缩拓展' }) }]));
  await t.page.click('.comp-pack-add'); const picker = await t.page.$('.ext-import input[type="file"]'); await picker.uploadFile(zip);
  await t.page.waitForSelector('.ext-card[data-id="zip-addon"]');
  const zipEarly = await t.page.$eval('.ext-card[data-id="zip-addon"] [role="switch"]', el => el.getAttribute('aria-checked'));
  await t.page.waitForFunction(() => !document.querySelector('.ext-import'));
  const zipAfter = await t.page.$eval('.ext-card[data-id="zip-addon"] [role="switch"]', el => el.getAttribute('aria-checked'));
  const zipSaved = JSON.parse(await fs.readFile(path.join(t.root, 'reports', 'gallery.json'), 'utf8')).extensions?.['zip-addon']?.enabled;
  console.log('  zip install early/final/persisted:', zipEarly, zipAfter, zipSaved);
  t.check(zipAfter === 'true' && zipSaved === true, 'selected zip uses its filename as id and is enabled', { zipEarly, zipAfter, zipSaved });
  await t.page.click('[role="dialog"][aria-label="拓展列表"] button[aria-label="关闭"]');
  t.check(await t.page.evaluate(() => !document.querySelector('[role="dialog"][aria-label="拓展列表"]')), 'closing deep link does not immediately reopen');
}


// An extension's own settings (skills/gallery/references/extensions.md "Settings"): its extension.json's `settings` drawn as
// switches on its detail in 拓展列表 and saved by Gallery; its backend reads the new value from the file
// GALLERY_EXTENSION_SETTINGS names at its next read, with no restart, and its script hears it (api.settings,
// api.onSettings) with no reload; gallery extension settings says the same; greyed while it is disabled.
// And an extension's column deleted by hand (0.2.4's ext-<id>, extensions/<id>/ taken away) leaves the outline
// file as the watcher hears the folder go (shared/outline.mjs dropGoneExtensions), no empty column in the sidebar.
export async function extensionSettings(t, { openHome, waitFor }) {
  const source = path.join(t.root, 'settings-source'); await fs.mkdir(source, { recursive: true });
  await fs.writeFile(path.join(source, 'extension.json'), JSON.stringify({ id: 'set-addon', name: '设置拓展', workbench: { script: 'workbench.js' }, server: { command: ['node', 'server.mjs'] },
    settings: [{ key: 'uniformLook', type: 'boolean', label: '统一排版', default: true, help: '发布时统一标题、正文和表格的样式' }] }));
  await fs.writeFile(path.join(source, 'workbench.js'), 'export function activate(api) { window.setStarts = (window.setStarts || 0) + 1; window.setFirst = api.settings; window.setHeard = []; window.setApi = api; api.onSettings(values => window.setHeard.push(values)); }');
  // Its backend reads the file each time it is asked; its pid says whether it was restarted.
  await fs.writeFile(path.join(source, 'server.mjs'), "import http from 'node:http'; import fs from 'node:fs'; http.createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ pid: process.pid, settings: JSON.parse(fs.readFileSync(process.env.GALLERY_EXTENSION_SETTINGS, 'utf8')) })); }).listen(Number(process.env.GALLERY_EXTENSION_PORT), '127.0.0.1');");
  t.gallery('extension', 'install', source, '--enable');
  // An old sidebar-only extension whose column's place the outline file keeps (as 0.2.4 wrote it).
  const reports = path.join(t.root, 'reports'), outlineFile = path.join(reports, '.gallery', 'outline.json');
  const old = path.join(reports, 'extensions', 'yuque');
  await fs.mkdir(old, { recursive: true });
  await fs.writeFile(path.join(old, 'sidebar.json'), JSON.stringify({ title: '旧语雀', entries: [{ id: 'a', title: '甲', url: 'https://example.com/' }] }));
  await openHome(t);
  const oldSection = '.section[data-extension="yuque"]';
  t.check(await waitFor(t, () => t.page.evaluate(section => document.querySelector(`${section} .sec-label`)?.textContent === '旧语雀', oldSection), 8000), 'the old extension\'s column shows');
  const stored = JSON.parse(await fs.readFile(outlineFile, 'utf8').catch(() => '{"version":2,"children":{"":[]},"groups":[{"id":"docs"}]}'));
  stored.groups = [...stored.groups.filter(group => group.id !== 'ext-yuque'), { id: 'ext-yuque', extension: 'yuque' }];
  await fs.writeFile(outlineFile + '.tmp', JSON.stringify(stored, null, 2)); await fs.rename(outlineFile + '.tmp', outlineFile);

  // ---------- the settings ----------
  await t.page.waitForFunction(() => window.setStarts === 1);
  const first = await t.page.evaluate(async () => ({ settings: window.setFirst, heard: window.setHeard, backend: await (await window.setApi.fetch('settings')).json() }));
  t.check(first.settings?.uniformLook === true && JSON.stringify(first.heard) === '[{"uniformLook":true}]' && first.backend.settings?.uniformLook === true, 'api.settings, api.onSettings and the backend\'s file start with the default', JSON.stringify(first));
  await t.page.evaluate(() => document.querySelector('.sb-foot .ws-btn').click());
  await waitFor(t, () => t.page.evaluate(() => [...document.querySelectorAll('.menu-item')].some(item => item.textContent.trim() === '拓展列表')));
  await t.page.evaluate(() => [...document.querySelectorAll('.menu-item')].find(item => item.textContent.trim() === '拓展列表').click());
  const card = '.ext-card[data-id="set-addon"]'; await t.page.waitForSelector(card);
  await t.page.click(card + ' .comp-pack-open'); await t.page.waitForSelector('.ext-view');
  const control = '.ext-view .ext-setting[data-key="uniformLook"]';
  await t.page.waitForSelector(control);
  const drawn = await t.page.$eval(control, el => ({ role: el.getAttribute('role'), checked: el.getAttribute('aria-checked'), disabled: el.getAttribute('aria-disabled'), text: el.textContent, border: getComputedStyle(el).borderTopWidth, select: !!document.querySelector('.ext-view select') }));
  t.check(drawn.role === 'switch' && drawn.checked === 'true' && drawn.disabled === 'false' && drawn.text.includes('统一排版') && drawn.text.includes('发布时统一标题') && drawn.border === '0px' && !drawn.select, 'its setting is a switch on the detail, its label and help, on (the default), no border, no native select', JSON.stringify(drawn));
  if (process.env.GALLERY_EXTENSION_SCREENSHOT) {
    await fs.mkdir(process.env.GALLERY_EXTENSION_SCREENSHOT, { recursive: true });
    await t.page.screenshot({ path: path.join(process.env.GALLERY_EXTENSION_SCREENSHOT, 'extension-settings.png') });
  }
  await t.page.click(control);
  t.check(await waitFor(t, () => t.page.$eval(control, el => el.getAttribute('aria-checked') === 'false'), 5000), 'switched off');
  const after = await t.page.evaluate(async () => ({ settings: window.setApi.settings, heard: window.setHeard, starts: window.setStarts, backend: await (await window.setApi.fetch('settings')).json() }));
  t.check(after.backend.settings?.uniformLook === false && after.backend.pid === first.backend.pid, 'the backend\'s next read of its file says false, with no restart', JSON.stringify({ after: after.backend, before: first.backend.pid }));
  t.check(after.settings?.uniformLook === false && JSON.stringify(after.heard.at(-1)) === '{"uniformLook":false}' && after.starts === 1, 'its script hears it (api.settings, api.onSettings) with no reload', JSON.stringify(after));
  const kept = JSON.parse(await fs.readFile(path.join(reports, 'gallery.json'), 'utf8')).extensions?.['set-addon'];
  t.check(JSON.stringify(kept) === '{"enabled":true,"settings":{"uniformLook":false}}', 'kept beside its switch in gallery.json', JSON.stringify(kept));
  const said = JSON.parse(t.gallery('extension', 'settings', 'set-addon', '--json'));
  t.check(said.settings[0]?.value === false && said.settings[0]?.default === true, 'gallery extension settings says it', JSON.stringify(said));

  // Disabled: the control greyed, a click changes nothing.
  await t.page.click('.ext-view .comp-pack-head [role="switch"]');
  t.check(await waitFor(t, () => t.page.$eval(control, el => el.getAttribute('aria-disabled') === 'true' && Boolean(el.dataset.tip)), 5000), 'greyed while the extension is disabled, saying why');
  await t.page.click(control); await t.sleep(400);
  t.check(await t.page.$eval(control, el => el.getAttribute('aria-checked') === 'false') && JSON.parse(await fs.readFile(path.join(reports, 'gallery.json'), 'utf8')).extensions['set-addon'].settings.uniformLook === false, 'a click on it does nothing');
  await t.page.click('[role="dialog"][aria-label="拓展列表"] button[aria-label="关闭"]');

  // ---------- the old column's place, its folder deleted by hand ----------
  await fs.rm(old, { recursive: true, force: true });
  const groups = async () => JSON.parse(await fs.readFile(outlineFile, 'utf8')).groups.map(group => group.id);
  t.check(await waitFor(t, async () => !(await groups()).includes('ext-yuque'), 8000), 'its folder gone, its place leaves outline.json', JSON.stringify(await groups()));
  t.check(await waitFor(t, () => t.page.evaluate(section => !document.querySelector(section) && ![...document.querySelectorAll('.sec-label')].some(label => label.textContent === '旧语雀'), oldSection), 5000), 'and the sidebar shows no column for it, empty or not');
}

// The columns a program extension writes in its columns/ (docs/workbench.md "Extension columns"): one in the
// sidebar for each <column>.json, keyed ~<id>:<column>/<entry>; a row of the extension's detail, no card of its
// own; a change of the file re-reads the sidebar and reloads nothing of the extension; hidden while it is
// disabled; renamed in its own file.
export async function extensionColumns(t, { openHome, waitFor }) {
  const site = http.createServer((request, response) => { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(`<!doctype html><title>${request.url}</title><p>${request.url}</p>`); });
  await new Promise(resolve => site.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${site.address().port}`;
  try {
    const source = path.join(t.root, 'columns-source'); await fs.mkdir(source, { recursive: true });
    await fs.writeFile(path.join(source, 'extension.json'), JSON.stringify({ id: 'col-addon', name: '栏目拓展', workbench: { script: 'workbench.js' } }));
    await fs.writeFile(path.join(source, 'workbench.js'), 'export function activate() { window.colStarts = (window.colStarts || 0) + 1; return () => { window.colStops = (window.colStops || 0) + 1; }; }');
    t.gallery('extension', 'install', source, '--enable');
    const columns = path.join(t.root, 'reports', 'extensions', 'col-addon', 'columns'), file = path.join(columns, 'docs.json');
    const writeColumn = async (value) => {
      await fs.mkdir(columns, { recursive: true });
      const temporary = path.join(columns, '.docs.json.tmp');
      await fs.writeFile(temporary, JSON.stringify(value)); await fs.rename(temporary, file);
    };
    const entries = [{ id: 'team', title: '团队', url: `${base}/team` }, { id: 'weekly', title: '周报', url: `${base}/weekly` }];
    await writeColumn({ title: '语雀文档', icon: '📗', entries });
    await openHome(t);
    const section = '.section[data-extension="col-addon:docs"]';
    const heading = () => t.page.evaluate(section => document.querySelector(`${section} .sec-label`)?.textContent ?? null, section);
    const rows = () => t.page.evaluate(section => [...document.querySelectorAll(`${section} .row[data-scope="ext"]`)].map(row => row.dataset.id), section);
    t.check(await waitFor(t, async () => (await heading()) === '语雀文档', 8000), 'a file of columns/ is a column of the sidebar', String(await heading()));
    t.check(JSON.stringify(await rows()) === '["~col-addon:docs/team","~col-addon:docs/weekly"]', 'its entries keyed ~<id>:<column>/<entry>', JSON.stringify(await rows()));
    await t.page.waitForFunction(() => window.colStarts === 1);
    const revision = () => t.page.evaluate(async () => (await (await fetch('/__gallery/extensions')).json()).extensions.find(item => item.id === 'col-addon').manifest.revision);
    const before = await revision();

    // A row of the extension's detail, no card of its own.
    await t.page.evaluate(() => document.querySelector('.sb-foot .ws-btn').click());
    await waitFor(t, () => t.page.evaluate(() => [...document.querySelectorAll('.menu-item')].some(item => item.textContent.trim() === '拓展列表')));
    await t.page.evaluate(() => [...document.querySelectorAll('.menu-item')].find(item => item.textContent.trim() === '拓展列表').click());
    const card = '.ext-card[data-id="col-addon"]'; await t.page.waitForSelector(card);
    t.check(await t.page.evaluate(() => [...document.querySelectorAll('.ext-card')].every(node => !node.textContent.includes('语雀文档'))), 'no card of its own in the extension list');
    await t.page.click(card + ' .comp-pack-open'); await t.page.waitForSelector('.ext-view');
    const detail = await t.page.$$eval('.ext-view .ext-detail-row', nodes => nodes.map(node => node.textContent));
    t.check(detail.some(text => text.includes('侧栏栏目') && text.includes('语雀文档 · 2 个条目')), 'the extension\'s detail has a row for it', JSON.stringify(detail));
    await t.page.click('.comp-back');

    // The file written again: the sidebar follows, the extension is not reloaded.
    await writeColumn({ title: '语雀文档', icon: '📗', entries: [...entries, { id: 'notes', title: '笔记', url: `${base}/notes` }] });
    t.check(await waitFor(t, async () => (await rows()).includes('~col-addon:docs/notes'), 8000), 'a change of the file shows at once', JSON.stringify(await rows()));
    await t.sleep(1500);
    const kept = await t.page.evaluate(() => ({ starts: window.colStarts, stops: window.colStops ?? 0 }));
    t.check(kept.starts === 1 && kept.stops === 0 && (await revision()) === before, 'and reloads nothing of the extension (same revision, activated once)', JSON.stringify({ ...kept, same: (await revision()) === before }));

    // Disabled: hidden; enabled again: back.
    await t.page.click(`${card} [role="switch"]`);
    t.check(await waitFor(t, async () => (await heading()) === null, 8000), 'disabling the extension hides its column');
    await waitFor(t, () => t.page.$eval(`${card} [role="switch"]`, el => el.getAttribute('aria-disabled') === 'false'));
    await t.page.click(`${card} [role="switch"]`);
    t.check(await waitFor(t, async () => (await heading()) === '语雀文档', 8000), 'enabling it again shows it again');
    await t.page.click('[role="dialog"][aria-label="拓展列表"] button[aria-label="关闭"]');

    // Renamed from its menu: written to its own file.
    await t.page.evaluate(() => document.querySelector('.sec-head[data-extension="col-addon:docs"] .row-act[aria-label="这一栏的操作"]').click());
    await t.page.waitForSelector('.menu-item', { timeout: 5000 });
    await t.page.evaluate(() => [...document.querySelectorAll('.menu-item')].find(item => item.querySelector('.mi-label')?.textContent === '重命名').click());
    await t.page.waitForSelector(`${section} .row-rename`);
    await t.page.keyboard.type('我的语雀'); await t.press('Enter');
    const title = async () => JSON.parse(await fs.readFile(file, 'utf8')).title;
    t.check(await waitFor(t, async () => (await heading()) === '我的语雀' && (await title()) === '我的语雀', 5000), 'renamed in columns/docs.json', String(await title()));

    // An entry opens at its address.
    await t.page.evaluate(() => document.querySelector('.row[data-id="~col-addon:docs/team"]').click());
    t.check(await waitFor(t, () => t.page.evaluate(() => location.hash === '#~col-addon:docs/team' && document.querySelector('.row.selected')?.dataset.id === '~col-addon:docs/team'), 5000), 'an entry opens at #~col-addon:docs/team', await t.page.evaluate(() => location.hash));
  } finally {
    await new Promise(resolve => site.close(resolve));
  }
}
