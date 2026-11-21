import { language, t } from '../../../../shared/i18n/index.mjs';
import { netHostsOf } from '../../../../shared/net-policy.mjs';
import { choose } from '../../components/Dialog';
import { toast } from '../../components/Toast';
import * as api from '../../workspace/api';
import type { ComponentSettings } from '../../workspace/types';

/**
 * 允许联网的同意框（docs/workbench.md「Components」）：一个自定义块的清单 needs 里写了 net:<域名>，要读者同意，
 * 服务端才替它去取（src/server/net-route.mjs）。两个地方打开它，是同一个框：
 * - 卡片上的「允许访问 <域名>」（套件的 net.js 画的；页面经会话发 consent 来）；
 * - 设置 › 组件列表里这个块的「允许联网」开关（打开时；关掉不问，直接撤回）。
 * 框里说它要访问哪些网站、Gallery 怎么替它去取、取到的东西放在哪、在哪里撤回；按「允许」写进 gallery.json 的
 * components.net（这个块 needs 里的全部网站），开着的页面从事件流听到，块重新开始、去取。答应了返回 true。
 */
export async function askNetConsent(id: string, known?: ComponentSettings): Promise<boolean> {
  let settings = known;
  try {
    settings ??= await api.componentSettings();
  } catch (error) {
    toast((error as Error).message, { tone: 'error' });
    return false;
  }
  const item = settings.packages.find((each) => each.id === id);
  const hosts = netHostsOf(item?.needs ?? []);
  if (!item || hosts.length === 0) {
    toast(t('这个块现在没有要联网的地方'), { tone: 'error' });
    return false;
  }
  const name = item.name ? (language === 'en' ? item.name.en : item.name.zh) : id;
  const choice = await choose({
    title: t('允许「{0}」联网？', name),
    message: t('它要从这些网站取数据：{0}。Gallery 替它去取，只访问这些网站，不带你的登录信息；取到的数据只在 Gallery 里显示，不写进文档，导出的文件里只带最近一次取到的。随时可以在 设置 › 组件列表 里撤回。', hosts.join(t('、'))),
    actions: [{ id: 'cancel', label: t('取消') }, { id: 'allow', label: t('允许'), primary: true }],
    cancelId: 'cancel',
  });
  if (choice !== 'allow') return false;
  try {
    await api.switchComponent({ id, net: true });
  } catch (error) {
    toast(t('设置没有保存：{0}', (error as Error).message), { tone: 'error' });
    return false;
  }
  toast(t('已允许「{0}」访问 {1}', name, hosts.join(t('、'))));
  return true;
}
