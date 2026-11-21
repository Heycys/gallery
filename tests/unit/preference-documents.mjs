import './workspace-env.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ensureWorkspace, documentFiles, pageSlug } from '../../src/shared/workspace.mjs';
import { DEFAULT_PREFERENCE, LEGACY_PREFERENCE, listPreferenceDocuments, changePreferenceDocuments, preferenceFile, preferencesHintShown } from '../../src/shared/preference-documents.mjs';
import { withOutlineLock } from '../../src/shared/outline.mjs';
import { defaultPreferencesFile, preferenceExamplesDirectory } from '../../src/shared/writing-preferences.mjs';
const home = await fs.mkdtemp(path.join(os.tmpdir(), 'gallery-preferences-test-'));
const previous = process.env.GALLERY_DEFAULT_WORKSPACE;
process.env.GALLERY_DEFAULT_WORKSPACE = home;
try {
  await ensureWorkspace(home);
  if (process.platform === 'win32') {
    const writeFile = fs.writeFile;
    let retried = false;
    fs.writeFile = async (file, ...args) => {
      if (!retried && path.basename(file) === 'outline.lock') { retried = true; throw Object.assign(new Error('delete pending'), { code: 'EPERM' }); }
      return writeFile(file, ...args);
    };
    try { assert.equal(await withOutlineLock(home, async () => 'acquired'), 'acquired'); }
    finally { fs.writeFile = writeFile; }
    assert.ok(retried, 'a transient Windows lock handle is retried before entering the critical section');
  }
  const configFile = path.join(home, 'gallery.json');
  await fs.writeFile(configFile, '\uFEFF' + await fs.readFile(configFile, 'utf8'));
  const original = '# 我的规则\n\n只写可靠的内容。\n';
  await fs.writeFile(path.join(home, 'preferences.md'), original);
  const legacyConfig = JSON.parse((await fs.readFile(configFile, 'utf8')).replace(/^\uFEFF/, ''));
  legacyConfig.preferences = { order: ['preferences.md'], off: ['preferences.md'] };
  await fs.writeFile(configFile, '\uFEFF' + JSON.stringify(legacyConfig));
  const legacyPage = path.join(home, '.gallery/pages/legacy-preference'); await fs.mkdir(legacyPage, { recursive: true });
  await fs.writeFile(documentFiles(legacyPage).html, '<p>untouched draft</p>');
  await fs.writeFile(documentFiles(legacyPage).json, JSON.stringify({ title: '我的规则', instructions: true }));
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { entered = resolve; });
  const writer = withOutlineLock(home, async () => { entered(); await gate; });
  await ready;
  let readDone = false;
  const reading = listPreferenceDocuments().then(() => { readDone = true; });
  try { await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(readDone, false, 'list waits for an in-flight preference rename'); }
  finally { release(); await writer; await reading; }
  let items = await listPreferenceDocuments();
  assert.deepEqual(items.map(item => [item.id, item.name, item.enabled]), [[LEGACY_PREFERENCE, '项目报告写作', false]]);
  assert.equal(items[0].slug, 'legacy-preference', 'migration preserves editor identity');
  assert.equal(await fs.readFile(documentFiles(legacyPage).html, 'utf8'), '<p>untouched draft</p>');
  await changePreferenceDocuments({ action: 'enabled', id: LEGACY_PREFERENCE, enabled: true });
  assert.equal(await fs.readFile(await preferenceFile(LEGACY_PREFERENCE), 'utf8'), original.replace('我的规则', '项目报告写作'));
  assert.equal(await fs.stat(path.join(home, 'preferences.md')).catch(() => null), null, 'legacy file migrated without a duplicate');
  const created = await changePreferenceDocuments({ action: 'create', name: '会议纪要' });
  const id = created.selected;
  await fs.appendFile(await preferenceFile(id), '\n保留决议。\n');
  await changePreferenceDocuments({ action: 'enabled', id, enabled: false });
  await changePreferenceDocuments({ action: 'order', order: [id, LEGACY_PREFERENCE] });
  assert.equal(await fs.readFile(await preferenceFile(id), 'utf8'), '# 会议纪要\n\n\n保留决议。\n', 'disabled file stays in place');
  const cli = async (...args) => JSON.parse((await promisify(execFile)(process.execPath, ['src/cli/bin.mjs', 'preferences', 'list', '--json', ...args], { env: { ...process.env, GALLERY_WORKSPACE: home, GALLERY_NO_UPDATE_CHECK: '1' }, windowsHide: true })).stdout);
  assert.deepEqual((await cli()).map(item => item.id), [LEGACY_PREFERENCE]);
  assert.deepEqual((await cli('--all')).map(item => item.id), [id, LEGACY_PREFERENCE]);
  const directory = path.join(home, '.gallery/pages/pref-test'); await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(documentFiles(directory).html, '<p>draft</p>');
  await fs.writeFile(documentFiles(directory).json, JSON.stringify({ title: '会议纪要', instructions: true, preference: id }));
  items = await listPreferenceDocuments(); const source = items[0];
  const renamed = await changePreferenceDocuments({ action: 'rename', id, name: '会议记录', revision: source.revision });
  assert.equal(renamed.items[0].enabled, false);
  assert.equal(await pageSlug(home, renamed.selected), 'pref-test', 'rename preserves editor identity');
  assert.match(await fs.readFile(await preferenceFile(renamed.selected), 'utf8'), /^# 会议记录\n/);
  assert.equal(await fs.readFile(documentFiles(directory).html, 'utf8'), '<p>draft</p>', 'rename leaves unsaved body intact');
  await assert.rejects(changePreferenceDocuments({ action: 'delete', id: renamed.selected, revision: source.revision }), /修改/);
  const renamedDefault = await changePreferenceDocuments({ action: 'rename', id: LEGACY_PREFERENCE, name: '项目报告', revision: items[1].revision });
  assert.equal(renamedDefault.items.length, 2, 'renaming the initial document does not recreate a default');
  assert.equal(renamedDefault.items.find(item => item.id === renamedDefault.selected).name, '项目报告');
  await assert.rejects(changePreferenceDocuments({ action: 'create', name: '../escape' }));
  await assert.rejects(preferenceFile('preferences/../../secret.md'));
  const copied = await changePreferenceDocuments({ action: 'duplicate', id: renamed.selected, name: '会议副本' });
  assert.equal(copied.items.find(item => item.id === copied.selected).enabled, true);
  const current = copied.items.find(item => item.id === renamed.selected);
  await changePreferenceDocuments({ action: 'delete', id: current.id, revision: current.revision });
  assert.equal(await pageSlug(home, current.id), null);
  assert.equal(await pageSlug(home, 'preferences.md'), null, 'deleted pages never become the legacy preference');
  for (const item of await listPreferenceDocuments()) await changePreferenceDocuments({ action: 'delete', id: item.id, revision: item.revision });
  assert.deepEqual(await listPreferenceDocuments(), [], 'deleting every preference does not seed defaults again');
  assert.equal(await pageSlug(home), null, 'deleted preferences have no active editor association');
  // A new workspace (no legacy preferences.md) starts with Gallery's generic default, 通用写作, made now.
  const fresh = await fs.mkdtemp(path.join(os.tmpdir(), 'gallery-preferences-fresh-'));
  process.env.GALLERY_DEFAULT_WORKSPACE = fresh;
  try {
    await ensureWorkspace(fresh);
    const made = await listPreferenceDocuments();
    assert.deepEqual(made.map(item => [item.id, item.name, item.enabled, item.made]), [[DEFAULT_PREFERENCE, '通用写作', true, true]], 'a new workspace has 通用写作 alone, made now');
    assert.equal(await fs.readFile(await preferenceFile(DEFAULT_PREFERENCE), 'utf8'), await fs.readFile(defaultPreferencesFile, 'utf8'), 'made of the default byte for byte');
    assert.equal(await fs.stat(path.join(fresh, LEGACY_PREFERENCE)).catch(() => null), null, 'no legacy name for a new workspace');
    assert.deepEqual(JSON.parse((await fs.readFile(path.join(fresh, 'gallery.json'), 'utf8')).replace(/^﻿/, '')).preferences.order, [DEFAULT_PREFERENCE], 'first in the order');
    assert.deepEqual((await listPreferenceDocuments()).map(item => item.made), [false], 'made once');

    // 写作偏好's first-open note: shown in a new workspace; an example (the package's, Chinese or English)
    // becomes a preference of its own, its text the example's byte for byte, enabled, last, and closes the
    // note for good (.gallery/hints.json's writingPreferences, its other keys kept).
    const hints = path.join(fresh, '.gallery', 'hints.json');
    await fs.mkdir(path.dirname(hints), { recursive: true });
    await fs.writeFile(hints, JSON.stringify({ home: 'closed before', homeCards: ['today'] }) + '\n');
    assert.equal(preferencesHintShown(), true, 'the note shows until it is closed');
    const zh = await fs.readFile(path.join(preferenceExamplesDirectory, 'project-report.zh.md'), 'utf8');
    const en = await fs.readFile(path.join(preferenceExamplesDirectory, 'project-report.en.md'), 'utf8');
    assert.ok(zh.startsWith('# 项目报告写作规范\n'), 'the Chinese example is headed by its name');
    assert.ok(en.startsWith('# Project report writing guidelines\n'), 'the English example is headed by its name');
    const configBefore = await fs.readFile(path.join(fresh, 'gallery.json'), 'utf8');
    const chinese = await changePreferenceDocuments({ action: 'example', language: 'zh' });
    assert.equal(chinese.selected, 'preferences/项目报告写作规范.md', 'named by its heading, the new tab selected');
    assert.equal(await fs.readFile(await preferenceFile(chinese.selected), 'utf8'), zh, 'the Chinese example byte for byte');
    assert.deepEqual(chinese.items.map(item => [item.id, item.enabled]), [[DEFAULT_PREFERENCE, true], [chinese.selected, true]], 'enabled, last');
    assert.equal(chinese.hint, false, 'the answer says the note is closed');
    assert.equal(preferencesHintShown(), false, 'an example closes the note');
    const kept = JSON.parse(await fs.readFile(hints, 'utf8'));
    assert.ok(kept.home === 'closed before' && kept.homeCards[0] === 'today' && typeof kept.writingPreferences === 'string', 'kept in hints.json, its other keys as they were');
    assert.notEqual(await fs.readFile(path.join(fresh, 'gallery.json'), 'utf8'), configBefore, 'its place in the order written');
    const again = await changePreferenceDocuments({ action: 'example', language: 'zh' });
    assert.equal(again.selected, 'preferences/项目报告写作规范 2.md', 'a second one: the dialog\'s rule for a name taken');
    assert.equal(await fs.readFile(await preferenceFile(again.selected), 'utf8'), '# 项目报告写作规范 2\n' + zh.slice(zh.indexOf('\n') + 1), 'its heading its name, the rest the example\'s');
    const english = await changePreferenceDocuments({ action: 'example', language: 'en' });
    assert.equal(english.selected, 'preferences/Project report writing guidelines.md');
    assert.equal(await fs.readFile(await preferenceFile(english.selected), 'utf8'), en, 'the English example byte for byte');
    assert.deepEqual(english.items.map(item => [item.id, item.enabled]), [[DEFAULT_PREFERENCE, true], [chinese.selected, true], [again.selected, true], [english.selected, true]], 'each enabled, last in turn');
    await assert.rejects(changePreferenceDocuments({ action: 'example', language: 'fr' }), /示例/, 'only the two examples');
    assert.equal((await listPreferenceDocuments()).length, 4, 'nothing made of an unknown example');
  } finally { await fs.rm(fresh, { recursive: true, force: true }); }
  // Its ×: the note closed alone, nothing else written (gallery.json as it was, no preference made).
  const closing = await fs.mkdtemp(path.join(os.tmpdir(), 'gallery-preferences-hint-'));
  process.env.GALLERY_DEFAULT_WORKSPACE = closing;
  try {
    await ensureWorkspace(closing);
    const before = await listPreferenceDocuments();
    const config = await fs.readFile(path.join(closing, 'gallery.json'), 'utf8');
    assert.equal(preferencesHintShown(), true, 'shown in a new workspace');
    const closed = await changePreferenceDocuments({ action: 'closeHint' });
    assert.equal(closed.hint, false);
    assert.deepEqual(closed.items.map(item => item.id), before.map(item => item.id), 'the list as it was');
    assert.equal(preferencesHintShown(), false, 'closed for good');
    assert.equal(await fs.readFile(path.join(closing, 'gallery.json'), 'utf8'), config, 'gallery.json not written');
    assert.equal(typeof JSON.parse(await fs.readFile(path.join(closing, '.gallery', 'hints.json'), 'utf8')).writingPreferences, 'string');
  } finally { await fs.rm(closing, { recursive: true, force: true }); }
  console.log('preference documents: legacy migration to 项目报告写作, a new workspace starting with 通用写作, its first-open note and the two examples, ordered enabled CLI, CRUD, draft identity and path guards passed');
} finally { process.env.GALLERY_DEFAULT_WORKSPACE = previous; await fs.rm(home, { recursive: true, force: true }); }
