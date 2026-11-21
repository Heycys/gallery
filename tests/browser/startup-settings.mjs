import assert from 'node:assert/strict';

// Network-order regression: no OS startup request reaches the server in this test.
export async function startupSettings(t) {
  const { page } = t;
  let enabled = true, first = true, holdNext = false, heldGet, heldPost;
  let failPost = false, holdWrite = false, posts = 0;
  const body = value => JSON.stringify({ ok: true, available: true, supported: true, enabled: value });
  const respond = (request, value) => request.respond({ status: 200, contentType: 'application/json', body: body(value) });
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (!request.url().endsWith('/__gallery/startup')) return void request.continue();
    if (request.method() === 'GET') {
      if (first || holdNext) { first = holdNext = false; heldGet = { request, value: enabled }; return; }
      return void respond(request, enabled);
    }
    posts++;
    if (failPost) { failPost = false; return void request.respond({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false, message: 'fixture startup failure' }) }); }
    enabled = JSON.parse(request.postData()).enabled;
    if (holdWrite) { holdWrite = false; heldPost = request; return; }
    void respond(request, enabled);
  });
  const open = async () => {
    await page.evaluate(() => [...document.querySelectorAll('.ws-btn')].find(node => node.textContent === '设置').click());
    await page.waitForSelector('[role="menuitemcheckbox"]');
  };
  const state = () => page.evaluate(() => {
    const row = [...document.querySelectorAll('[role="menuitemcheckbox"]')].find(node => node.textContent === '开机自启动');
    return { enabled: row?.getAttribute('aria-checked'), busy: row?.getAttribute('aria-disabled') };
  });
  const click = () => page.evaluate(() => [...document.querySelectorAll('[role="menuitemcheckbox"]')].find(node => node.textContent === '开机自启动').click());
  const shown = (value) => page.waitForFunction(value => {
    const row = [...document.querySelectorAll('[role="menuitemcheckbox"]')].find(node => node.textContent === '开机自启动');
    return row?.getAttribute('aria-checked') === String(value) && row.getAttribute('aria-disabled') === 'false';
  }, {}, value);
  const waitHeld = async get => {
    for (let i = 0; i < 100 && !get(); i++) await t.sleep(20);
    assert.ok(get(), 'expected an intercepted request');
  };
  const refresh = () => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

  await page.goto(t.home(), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ws-btn');
  await open();
  assert.equal((await state()).busy, 'true', 'unknown initial state cannot be toggled');
  await waitHeld(() => heldGet);
  await respond(heldGet.request, true); heldGet = null;
  await shown(true);
  t.check(true, 'an open menu follows the delayed initial GET');

  holdNext = true;
  await refresh(); await waitHeld(() => heldGet);
  await click(); await shown(false);
  assert.equal(posts, 1);
  await respond(heldGet.request, heldGet.value); heldGet = null;
  await t.sleep(100);
  await page.keyboard.press('Escape'); await open();
  assert.equal((await state()).enabled, 'false');
  t.check(true, 'a stale GET cannot overwrite a completed POST, including after reopening');

  failPost = true;
  await click(); await shown(false);
  const errors = t.takeErrors();
  assert.ok(errors.every(error => error.includes('400')), JSON.stringify(errors));
  t.check(true, 'a failed write restores the verified server value');

  const before = posts;
  holdWrite = true;
  await click(); await waitHeld(() => heldPost);
  await click(); await click();
  assert.equal(posts, before + 1, 'duplicate clicks do not race the shared write');
  await respond(heldPost, enabled); heldPost = null;
  await shown(true);
  t.check(true, 'pending writes prevent duplicate toggles');

  enabled = false;
  await t.sleep(2100); // App visibility refresh deliberately debounces 2 seconds.
  await refresh(); await shown(false);
  t.check(true, 'a later visibility refresh updates the menu without reopening');
}
