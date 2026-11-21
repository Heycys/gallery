import { commandArguments, UsageError } from './arguments.mjs';
import { changePreferenceDocuments, listPreferenceDocuments } from '../shared/preference-documents.mjs';

export async function run(argv) {
  const { positional, options } = commandArguments({ argv, options: ['--json', '--all'] });
  const [action = 'list', name, ...extra] = positional;
  if (action === 'list') {
    if (name) throw new UsageError('gallery preferences list [--json] [--all]');
    const items = (await listPreferenceDocuments()).filter(item => options.has('--all') || item.enabled);
    if (options.has('--json')) return void console.log(JSON.stringify(items, null, 2));
    if (!items.length) return void console.log('写作偏好：全部已停用。按本次用户要求写作。');
    console.log('写作偏好：按标题和内容选择本次任务适用的启用文档；冲突时用户要求优先，其次按此顺序的适用偏好，最后是 skill。');
    for (const item of items) console.log(`${item.enabled ? '' : '[已停用] '}${item.name}\n  ${item.file}`);
    return;
  }
  if (!['on', 'off'].includes(action) || !name || extra.length || options.size) throw new UsageError('gallery preferences on|off <name>');
  const items = await listPreferenceDocuments(), matches = items.filter(item => item.id === name || item.name === name || item.file === name);
  if (matches.length !== 1) throw new UsageError('Name one preference shown by gallery preferences list --all.');
  await changePreferenceDocuments({ action: 'enabled', id: matches[0].id, enabled: action === 'on' });
  console.log(`${action === 'on' ? '已启用' : '已停用'} ${matches[0].name}`);
}
