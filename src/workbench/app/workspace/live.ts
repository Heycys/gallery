import { expandAncestors } from '../state/tree';
import * as api from './api';
import { flatten, parentOf } from './meta';
import { outlineSaved, refreshWorkspaceAfresh, workspaceStore } from './store';
import { ROOT } from './types';

/**
 * 工作区在工作台之外变了（Agent 用 gallery new --under、gallery move、gallery set，别的标签页拖动、新建、改名），
 * 工作台不用重新载入就跟上：服务器的事件流说 workspace（api.onWorkspaceChange），就重新读文档列表。
 * 一阵通知只读一次（100ms 内的合在一起），工作台自己改的目录写完了再读（outlineSaved），正在读的那次读完再读一次
 * （它可能是变之前开始的）。读完后，新出现的文档、换了上级的文档所在的上级都展开，让它在侧栏里看得见。
 */
export function followWorkspace(): () => void {
  let timer = 0;
  let running = false;
  let again = false;
  const run = async () => {
    if (running) { again = true; return; }
    running = true;
    try {
      do {
        again = false;
        await outlineSaved();
        const before = workspaceStore.get();
        await refreshWorkspaceAfresh();
        const after = workspaceStore.get();
        if (before.status !== 'ready' || after.status !== 'ready') continue;
        for (const slug of flatten(after.meta)) {
          const parent = parentOf(after.meta, slug);
          if (parent !== ROOT && parent !== parentOf(before.meta, slug)) expandAncestors(slug);
        }
      } while (again);
    } finally {
      running = false;
    }
  };
  const unheard = api.onWorkspaceChange(() => {
    clearTimeout(timer);
    timer = window.setTimeout(() => void run(), 100);
  });
  return () => { clearTimeout(timer); unheard(); };
}
