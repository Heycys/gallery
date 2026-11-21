import fs from 'node:fs/promises';
import path from 'node:path';
import { defaultWorkspace, ensureWorkspace, markerOf, pageSlug, documentDirectory, documentFiles, DEVICE_NAMES } from './workspace.mjs';
import { defaultPreferencesFile, preferenceExamplesDirectory } from './writing-preferences.mjs';
import { sha256, writeAtomic } from './files.mjs';
import { withOutlineLock } from './outline.mjs';
import { hintOf, writeHints } from './pages.mjs';

// A new workspace starts with Gallery's short generic default (src/shared/writing-preferences.md).
// The user's own <home>/preferences.md from before preference files migrates under the legacy name,
// and a writing-preferences page made then without a `preference` field still means that file.
export const DEFAULT_PREFERENCE = 'preferences/通用写作.md';
export const LEGACY_PREFERENCE = 'preferences/项目报告写作.md';
const configFile = () => path.join(defaultWorkspace(), 'gallery.json');
async function configuration() {
  const text = await fs.readFile(configFile(), 'utf8').catch(error => { if (error.code === 'ENOENT') return '{}'; throw error; });
  const { reads, value } = markerOf(text);
  if (!reads || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('gallery.json 读不出来：改好这个文件后再试');
  return value;
}
export function preferenceName(name) {
  if (typeof name !== 'string' || !name.trim() || name !== name.trim() || name.length > 80 || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || name.startsWith('.') || DEVICE_NAMES.has(name.split('.')[0].toLowerCase())) throw new Error('偏好名称不能包含路径或特殊字符');
  return name;
}
export async function preferenceFile(id) {
  if (typeof id !== 'string' || !id.startsWith('preferences/') || !id.endsWith('.md') || 'preferences/' + preferenceName(id.slice(12, -3)) + '.md' !== id) throw new Error('写作偏好路径无效');
  const root = defaultWorkspace(), file = path.join(root, id);
  for (const candidate of [path.join(root, 'preferences'), file]) {
    const stat = await fs.lstat(candidate);
    if (stat.isSymbolicLink() || (candidate === file && (!stat.isFile() || stat.nlink > 1))) throw new Error('写作偏好不能是链接或特殊文件');
  }
  return file;
}
export const titledPreference = (text, name) => /^\uFEFF?\s*#\s+[^\r\n]*(?:\r?\n|$)/.test(text) ? text.replace(/^\uFEFF?\s*#\s+[^\r\n]*(?:\r?\n|$)/, () => '# ' + name + '\n') : '# ' + name + '\n\n' + text;
export const listPreferenceDocuments = () => withOutlineLock(defaultWorkspace(), readPreferenceDocuments);

// The dialog's first-open note (what 写作偏好 is for, and the examples it offers): shown until it is closed,
// by its × or by adding an example, once for the default workspace, whichever browser shows the dialog next:
// .gallery/hints.json's `writingPreferences` (when it was closed, an ISO time), its other keys kept.
const HINT = 'writingPreferences';
/** Whether 写作偏好's first-open note shows: not closed in the default workspace. */
export const preferencesHintShown = () => typeof hintOf(defaultWorkspace(), HINT) !== 'string';
const closePreferencesHint = () => writeHints(defaultWorkspace(), { [HINT]: new Date().toISOString() });
// The examples the note offers, in the package (src/shared/preference-examples/, the release's
// assets/preference-examples/): a project report's writing conventions in Chinese and in English, each
// named by its own heading.
const EXAMPLES = { zh: 'project-report.zh.md', en: 'project-report.en.md' };
async function preferenceExample(language) {
  if (!Object.hasOwn(EXAMPLES, language)) throw new Error('没有这个写作偏好示例');
  const text = await fs.readFile(path.join(preferenceExamplesDirectory, EXAMPLES[language]), 'utf8');
  const heading = /^\s*#\s+([^\r\n]*)/.exec(text)?.[1].trim();
  return { name: preferenceName(heading), text };
}
async function initialize(config) {
  if (config.preferences?.initialized) return false;
  const root = defaultWorkspace(), legacy = path.join(root, 'preferences.md');
  const stat = await fs.lstat(legacy).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
  if (stat && (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1)) throw new Error('写作偏好不能是链接或特殊文件');
  const directory = path.join(root, 'preferences');
  await fs.mkdir(directory, { recursive: true });
  if ((await fs.lstat(directory)).isSymbolicLink()) throw new Error('偏好文件夹不能是链接');
  // Whatever pointed at the old preferences.md (its page, order, off) now points at the file made here.
  const made = stat ? LEGACY_PREFERENCE : DEFAULT_PREFERENCE;
  const text = titledPreference(await fs.readFile(stat ? legacy : defaultPreferencesFile, 'utf8'), path.basename(made, '.md'));
  const file = path.join(root, made);
  try { await fs.writeFile(file, text, { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    // A previous migration may have stopped after writing the destination. Never overwrite a different document.
    if (stat && await fs.readFile(await preferenceFile(made), 'utf8') !== text) throw new Error('偏好文件已被修改，请重新打开后再试');
  }
  const slug = await pageSlug(root, 'preferences.md');
  if (slug) {
    const json = documentFiles(documentDirectory(slug, root)).json;
    const metadata = JSON.parse(await fs.readFile(json, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return '{}'; }));
    await writeAtomic(json, JSON.stringify({ ...metadata, instructions: true, preference: made, title: path.basename(made, '.md') }, null, 2) + '\n');
  }
  const mapped = values => Array.isArray(values) ? values.map(id => id === 'preferences.md' ? made : id) : [];
  const order = mapped(config.preferences?.order);
  config.preferences = { ...config.preferences, initialized: true, order: order.length ? order : [made], off: mapped(config.preferences?.off) };
  await writeAtomic(configFile(), JSON.stringify(config, null, 2) + '\n');
  if (stat) await fs.unlink(legacy);
  return !stat;
}
// Readers share the writer's lock so a rename cannot temporarily hide a tab and discard its draft.
async function readPreferenceDocuments() {
  const config = await configuration();
  const made = await initialize(config);
  const directory = path.join(defaultWorkspace(), 'preferences');
  const stat = await fs.lstat(directory).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new Error('偏好文件夹必须是普通文件夹');
  const entries = stat ? await fs.readdir(directory, { withFileTypes: true }) : [];
  const ids = entries.filter(entry => entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith('.md') && !entry.name.startsWith('.')).map(entry => 'preferences/' + entry.name).sort();
  const order = Array.isArray(config.preferences?.order) ? config.preferences.order : [];
  const off = new Set(Array.isArray(config.preferences?.off) ? config.preferences.off : []);
  return Promise.all([...new Set([...order.filter(id => ids.includes(id)), ...ids])].map(async id => {
    let file, text;
    try { file = await preferenceFile(id); text = await fs.readFile(file, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    return { id, file, name: path.basename(id, '.md'), enabled: !off.has(id), revision: sha256(text), slug: await pageSlug(defaultWorkspace(), id), made: id === DEFAULT_PREFERENCE && made };
  })).then(items => items.filter(Boolean));
}

/** All writers use the existing workspace lock; the rest of gallery.json survives unchanged. */
export async function changePreferenceDocuments(change) {
  await ensureWorkspace(defaultWorkspace());
  return withOutlineLock(defaultWorkspace(), async () => {
    const list = await readPreferenceDocuments();
    const item = list.find(item => item.id === change.id);
    const config = await configuration();
    let order = list.map(item => item.id), off = list.filter(item => !item.enabled).map(item => item.id), selected = change.id;
    if (change.action === 'closeHint') {
      await closePreferencesHint();
      return { items: list, selected: change.id, hint: false };
    }
    if (change.action === 'order') {
      if (!Array.isArray(change.order) || new Set(change.order).size !== list.length || change.order.length !== list.length || change.order.some(id => !order.includes(id))) throw new Error('偏好列表已变更，请重试');
      order = change.order;
    } else if (change.action === 'create' || change.action === 'duplicate') {
      if (change.action === 'duplicate' && !item) throw new Error('找不到写作偏好');
      const name = preferenceName(change.name), id = 'preferences/' + name + '.md';
      const directory = path.join(defaultWorkspace(), 'preferences');
      await fs.mkdir(directory, { recursive: true });
      if ((await fs.lstat(directory)).isSymbolicLink()) throw new Error('偏好文件夹不能是链接');
      const text = change.action === 'duplicate' ? await fs.readFile(await preferenceFile(item.id), 'utf8') : '';
      await fs.writeFile(path.join(defaultWorkspace(), id), titledPreference(text, name), { flag: 'wx' });
      const at = item ? order.indexOf(item.id) + 1 : order.length;
      order.splice(at, 0, id); selected = id;
    } else if (change.action === 'example') {
      // A new preference made of an example, last, enabled, its text the example's as it is (under a name
      // of its own where the example's is taken, the dialog's rule for 新偏好: "<name> 2", "<name> 3"…,
      // the heading made the same); the note closed with it.
      const example = await preferenceExample(change.language);
      const taken = name => list.some(item => item.name.toLowerCase() === name.toLowerCase());
      let name = example.name;
      for (let n = 2; taken(name); n++) name = example.name + ' ' + n;
      const id = 'preferences/' + preferenceName(name) + '.md';
      const directory = path.join(defaultWorkspace(), 'preferences');
      await fs.mkdir(directory, { recursive: true });
      if ((await fs.lstat(directory)).isSymbolicLink()) throw new Error('偏好文件夹不能是链接');
      await fs.writeFile(path.join(defaultWorkspace(), id), name === example.name ? example.text : titledPreference(example.text, name), { flag: 'wx' });
      order.push(id); selected = id;
      await closePreferencesHint();
    } else {
      if (!item) throw new Error('找不到写作偏好');
      const file = await preferenceFile(item.id);
      if (change.action === 'enabled') {
        if (typeof change.enabled !== 'boolean') throw new Error('启用状态无效');
        off = off.filter(id => id !== item.id); if (!change.enabled) off.push(item.id);
      } else if (change.action === 'rename' || change.action === 'delete') {
        if (change.revision !== item.revision) throw new Error('偏好文件已被修改，请重新打开后再试');
        if (change.action === 'rename') {
          const name = preferenceName(change.name), id = 'preferences/' + name + '.md';
          if (id === item.id) return { items: list, selected: id };
          const text = titledPreference(await fs.readFile(file, 'utf8'), name);
          await fs.writeFile(path.join(defaultWorkspace(), id), text, { flag: 'wx' });
          if (item.slug) {
            const json = documentFiles(documentDirectory(item.slug, defaultWorkspace())).json;
            const metadata = JSON.parse(await fs.readFile(json, 'utf8'));
            // Keep the editor's slug (and mounted iframe/draft) stable across a rename.
            await writeAtomic(json, JSON.stringify({ ...metadata, preference: id, title: name, ...(metadata.madeSame ? { madeSame: { ...metadata.madeSame, file: sha256(text).slice(0, 16) } } : {}) }, null, 2) + '\n');
          }
          await fs.unlink(file);
          order = order.map(value => value === item.id ? id : value); off = off.map(value => value === item.id ? id : value); selected = id;
        } else {
          await fs.unlink(file);
          order = order.filter(id => id !== item.id); off = off.filter(id => id !== item.id); selected = order[0];
          // Invalidate its association; the editor draft is internal and may still be mounted elsewhere.
          if (item.slug) {
            const json = documentFiles(documentDirectory(item.slug, defaultWorkspace())).json;
            const metadata = JSON.parse(await fs.readFile(json, 'utf8'));
            await writeAtomic(json, JSON.stringify({ ...metadata, preference: null }, null, 2) + '\n');
          }
        }
      } else throw new Error('未知的偏好操作');
    }
    config.preferences = { ...config.preferences, order, off };
    await writeAtomic(configFile(), JSON.stringify(config, null, 2) + '\n');
    return { items: await readPreferenceDocuments(), selected, hint: preferencesHintShown() };
  });
}
