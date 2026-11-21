import fs from 'node:fs/promises';
import path from 'node:path';

export async function multipleWritingPreferences(t, { openHome, settingsMenu, waitFor }) {
  t.page.on('response', async response => { if (response.status() >= 400) console.log('  server error:', response.url(), await response.text()); });
  await openHome(t); await settingsMenu(t, '写作偏好');
  await t.page.waitForSelector('.wp-editor:not([hidden]) iframe:not([data-pending])');
  t.check(await t.page.$$eval('.wp-tab', tabs => tabs.length === 1 && tabs[0].textContent === '通用写作'), 'default is only the original preference');
  await t.page.click('.wp-tab[aria-selected="true"]');
  await t.page.waitForSelector('.menu[role="menu"]');
  t.check(await t.page.$eval('.menu[role="menu"]', menu => {
    const row = menu.querySelector('.menu-item'), rect = row.getBoundingClientRect();
    return menu.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  }), 'preference menu is above the dialog and receives pointer clicks');
  await t.page.keyboard.press('Escape');
  t.check(await t.page.$('.wp-dialog') && !await t.page.$('.menu[role="menu"]'), 'Escape closes the menu before the preference dialog');
  const frame = () => t.page.frames().find(frame => frame.url().includes(documentSlug));
  let documentSlug = await t.page.$eval('.wp-editor:not([hidden]) iframe', el => el.getAttribute('src').split('?')[0]);
  const generalFrame = frame();
  t.check(await generalFrame.$eval('.doc-title', node => node.textContent) === '通用写作' && (await t.page.$eval('.wp-tab', node => node.dataset.tip)).endsWith('通用写作.md'), 'initial tab, rendered heading and filename agree');
  await generalFrame.evaluate(() => {
    const node = [...document.querySelectorAll('main li')].find(node => node.textContent.trim());
    node.focus(); getSelection().setBaseAndExtent(node, node.childNodes.length, node, node.childNodes.length);
  });
  await t.page.keyboard.type('保留这一份草稿。');
  await t.page.waitForFunction(() => !document.querySelector('.pref-save').disabled);
  await t.page.click('.wp-new'); await t.page.waitForSelector('.wp-tab .pop-input');
  await t.page.type('.wp-tab .pop-input', '会议纪要'); await t.page.keyboard.press('Enter');
  await t.page.waitForFunction(() => document.querySelector('.wp-tab[aria-selected="true"]')?.textContent.includes('会议纪要'));
  await t.page.waitForSelector('.wp-editor:not([hidden]) iframe:not([data-pending])');
  documentSlug = await t.page.$eval('.wp-editor:not([hidden]) iframe', el => el.getAttribute('src').split('?')[0]);
  await t.page.click('.wp-tab[aria-selected="true"]', { button: 'right' });
  await t.page.waitForSelector('.menu[role="menu"]');
  const renameItem = await t.page.$('.menu[role="menu"] .menu-item');
  await renameItem.click();
  await t.page.waitForSelector('.wp-tab .pop-input');
  t.check(true, 'right-click menu rename is reachable with a real pointer click');
  await t.page.keyboard.press('Enter');
  const meetingFrame = frame();
  await meetingFrame.evaluate(() => { const node = document.querySelector('main p'); node.focus(); getSelection().setBaseAndExtent(node, 0, node, 0); });
  await t.page.keyboard.type('记录本次决议。');
  await t.page.click('.wp-enable');
  await t.page.waitForFunction(() => document.querySelector('.wp-enable').getAttribute('aria-checked') === 'false');
  await t.page.evaluate(() => document.querySelector('.wp-tab').click());
  t.check(await generalFrame.evaluate(() => document.body.textContent.includes('保留这一份草稿。')), 'switching tabs preserves unsaved content');
  t.check(await meetingFrame.evaluate(() => document.body.textContent.includes('记录本次决议。')), 'disabling a preference preserves its unsaved content');
  await t.page.click('.pref-save');
  await waitFor(t, async () => (await t.file('reports/preferences/通用写作.md'))?.includes('保留这一份草稿。') && (await t.file('reports/preferences/会议纪要.md'))?.includes('记录本次决议。'), 15000);
  t.check((await t.file('reports/preferences/通用写作.md')).includes('保留这一份草稿。') && (await t.file('reports/preferences/会议纪要.md')).startsWith('# 会议纪要\n'), 'save writes every dirty tab with matching title/filename');
  const list = JSON.parse(t.gallery('preferences', 'list', '--json'));
  t.check(list.length === 1 && list[0].id === 'preferences/通用写作.md', 'Agent list excludes the disabled preference');
  t.gallery('preferences', 'on', '会议纪要');
  await t.page.waitForFunction(() => [...document.querySelectorAll('.wp-tab')].find(tab => tab.textContent.includes('会议纪要'))?.classList.contains('wp-tab-off') === false);
  t.check(true, 'CLI enable updates the open dialog');
  await fs.writeFile(path.join(t.root, 'reports/preferences/外部新增.md'), '# 外部新增\n\n外部内容。\n');
  await t.page.waitForFunction(() => [...document.querySelectorAll('.wp-tab')].some(tab => tab.textContent === '外部新增'));
  t.check(true, 'externally added preference appears without reopening');
  await t.page.click('.wp-tab');
  await t.page.click('.wp-tab[aria-selected="true"]');
  await t.page.click('.wp-menu .menu-item');
  await t.page.waitForSelector('.wp-tab .pop-input');
  await t.page.type('.wp-tab .pop-input', '项目报告');
  await t.page.keyboard.press('Enter');
  await t.page.waitForFunction(() => document.querySelector('.wp-tab[aria-selected="true"] .wp-tab-name')?.textContent === '项目报告');
  await waitFor(t, () => generalFrame.$eval('.doc-title', node => node.textContent === '项目报告'));
  t.check((await t.file('reports/preferences/项目报告.md')).startsWith('# 项目报告\n') && await t.page.$$eval('.wp-tab', tabs => tabs.length === 3), 'renaming the initial preference updates its live heading and file without recreating a default');
  // Start from an empty preference, exactly the user's duplicate case. Do not focus an
  // invisible paragraph through evaluate(): typing must work after finishing the tab name.
  await t.page.click('.wp-new'); await t.page.waitForSelector('.wp-tab .pop-input');
  await t.page.type('.wp-tab .pop-input', '空白偏好'); await t.page.keyboard.press('Enter');
  await t.page.waitForSelector('.wp-editor:not([hidden]) iframe:not([data-pending])');
  const blankFrame = await (await t.page.$('.wp-editor:not([hidden]) iframe')).contentFrame();
  await blankFrame.waitForFunction(() => document.activeElement?.matches('main p[contenteditable="true"]'));
  await t.page.click('.wp-tab[aria-selected="true"]');
  await t.page.waitForSelector('.wp-menu');
  await t.page.evaluate(() => [...document.querySelectorAll('.wp-menu .menu-item')].find(node => node.textContent.trim() === '创建副本').click());
  await t.page.waitForSelector('.wp-tab .pop-input'); await t.page.keyboard.press('Enter');
  await t.page.waitForSelector('.wp-editor:not([hidden]) iframe:not([data-pending])');
  const copyFrame = await (await t.page.$('.wp-editor:not([hidden]) iframe')).contentFrame();
  await copyFrame.waitForFunction(() => document.activeElement?.matches('main p[contenteditable="true"]'));
  await t.page.keyboard.type('副本可以直接编辑');
  t.check(await copyFrame.$eval('main p', node => node.textContent) === '副本可以直接编辑', 'an empty duplicate receives real keyboard input');
  await copyFrame.click('.doc-title'); await t.page.keyboard.press('Home');
  await t.page.keyboard.down('Shift'); await t.page.keyboard.press('End'); await t.page.keyboard.up('Shift');
  await t.page.keyboard.type('编辑中的副本');
  await t.page.waitForFunction(() => document.querySelector('.wp-tab[aria-selected="true"] .wp-tab-name')?.textContent === '编辑中的副本');
  t.check(true, 'typing the document title updates the sheet before saving');
  await t.page.click('.wp-tab[aria-selected="true"]'); await t.page.waitForSelector('.wp-menu');
  await t.page.evaluate(() => [...document.querySelectorAll('.wp-menu .menu-item')].find(node => node.textContent.trim() === '创建副本').click());
  await t.page.waitForSelector('.wp-tab .pop-input'); await t.page.keyboard.press('Enter');
  await t.page.waitForSelector('.wp-editor:not([hidden]) iframe:not([data-pending])');
  const secondCopy = await (await t.page.$('.wp-editor:not([hidden]) iframe')).contentFrame();
  await secondCopy.waitForSelector('main p[contenteditable="true"]');
  t.check(await secondCopy.$eval('main p', node => node.textContent) === '副本可以直接编辑', 'duplicate includes the latest unsaved body');
  t.check(await secondCopy.$eval('.doc-title', node => node.textContent) === '编辑中的副本（副本）', 'duplicate uses the latest unsaved title');
  t.check((await t.file('reports/preferences/编辑中的副本.md')).includes('副本可以直接编辑'), 'saving the source keeps title and Markdown filename aligned');
  await secondCopy.click('main p'); await t.page.keyboard.press('End'); await t.page.keyboard.type('继续编辑');
  await t.page.click('.pref-save');
  await waitFor(t, async () => (await t.file('reports/preferences/编辑中的副本（副本）.md'))?.includes('继续编辑'));
  await t.page.click('.wp-tab[aria-selected="true"]'); await t.page.waitForSelector('.wp-menu');
  const revealResponse = t.page.waitForResponse(response => response.url().endsWith('/workspace/reveal'));
  await t.page.evaluate(() => [...document.querySelectorAll('.wp-menu .menu-item')].find(node => node.textContent.trim() === '在文件夹中显示').click());
  t.check((await (await revealResponse).json()).opened === false, 'test environment suppresses the OS window');
  await t.page.waitForFunction(() => document.body.textContent.includes('没有打开文件夹'));
  for (let n = 1; n <= 3; n++) {
    await t.page.click('.wp-new'); await t.page.waitForSelector('.wp-tab .pop-input');
    await t.page.type('.wp-tab .pop-input', `多页签${n}`); await t.page.keyboard.press('Enter');
    await t.page.waitForSelector('.wp-editor:not([hidden]) iframe:not([data-pending])');
    const extra = await (await t.page.$('.wp-editor:not([hidden]) iframe')).contentFrame();
    await extra.waitForFunction(() => document.activeElement?.matches('main p[contenteditable="true"]'));
    await t.page.keyboard.type(`第${n}份草稿`);
  }
  await t.page.click('.pref-save');
  await waitFor(t, async () => (await t.file('reports/preferences/多页签3.md'))?.includes('第3份草稿'));
  t.check(await t.page.$$eval('.wp-editor', nodes => nodes.length >= 7), 'seven mounted editors load and save without exhausting connections');
  const hiddenSlug = new URL(secondCopy.url()).pathname.split('/').at(-1).replace('.html', '');
  const hiddenSource = path.join(t.root, 'reports/.gallery/pages', hiddenSlug, 'doc.html');
  await fs.writeFile(hiddenSource, (await fs.readFile(hiddenSource, 'utf8')).replace('副本可以直接编辑继续编辑', '副本可以直接编辑继续编辑外部更新'));
  await t.page.evaluate(() => [...document.querySelectorAll('.wp-tab')].find(node => node.textContent === '编辑中的副本（副本）').click());
  await waitFor(t, () => secondCopy.$eval('main p', node => node.textContent.includes('外部更新')).catch(() => false));
  t.check(true, 'reactivating a hidden editor catches up on missed file changes');
  await t.page.click('.pref-close'); await settingsMenu(t, '写作偏好');
  await t.page.waitForSelector('.wp-tab');
  await t.page.evaluate(() => [...document.querySelectorAll('.wp-tab')].find(node => node.textContent === '编辑中的副本（副本）').click());
  await t.page.waitForSelector('.wp-editor:not([hidden]) iframe:not([data-pending])');
  const reopened = await (await t.page.$('.wp-editor:not([hidden]) iframe')).contentFrame();
  t.check(await reopened.$eval('main p', node => node.textContent) === '副本可以直接编辑继续编辑', 'edited duplicate survives saving and reopening');
  if (process.env.GALLERY_EXTENSION_SCREENSHOT) {
    await fs.mkdir(process.env.GALLERY_EXTENSION_SCREENSHOT, { recursive: true });
    for (const [theme, width] of [['light', 1280], ['dark', 1280], ['dark', 560]]) {
      await t.page.setViewport({ width, height: 900 });
      await t.page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      await t.sleep(300);
      await t.page.screenshot({ path: path.join(process.env.GALLERY_EXTENSION_SCREENSHOT, `preferences-${theme}-${width}.png`) });
      t.check(await t.page.$eval('.wp-dialog', el => el.scrollWidth <= el.clientWidth), 'preference dialog fits ' + width);
    }
  }
}
