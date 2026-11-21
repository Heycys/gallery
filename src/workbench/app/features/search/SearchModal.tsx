import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, PageIcon } from '../../components/Icon';
import { closePopover } from '../../components/Popover';
import { useDimFadesOut } from '../../lib/afterimage';
import { pushLayer } from '../../lib/layers';
import { useModalFocus } from '../../lib/modalFocus';
import { createStore, useStore } from '../../lib/store';
import { clamp, cls } from '../../lib/util';
import { can, command, waitForSession } from '../../session/sessionStore';
import { openCustomPage, openReport } from '../../state/navigation';
import * as api from '../../workspace/api';
import { ancestorsOf, flatten } from '../../workspace/meta';
import { pageOf, pageTitle, reportTitle, workspaceStore, workspaceTitle } from '../../workspace/store';
import './search.css';
import { t } from '../../../../shared/i18n/index.mjs';

const searchStore = createStore(false);
export const openSearch = () => { closePopover(); searchStore.set(true); };
export const closeSearch = () => searchStore.set(false);
export const toggleSearch = () => (searchStore.get() ? closeSearch() : openSearch());

export function SearchModal() {
  const open = useStore(searchStore);
  if (!open) return null;
  return createPortal(<SearchPanel />, document.body);
}

/** 一行结果：一份文档（带它第一处正文片段），或它下面的又一处片段；或一个自定义页（page：只按标题找到，它的内容不进搜索） */
interface Entry { slug: string; hit?: api.SearchHit; more?: boolean; page?: boolean }

const tidy = (text: string) => text.replace(/\s+/g, ' ').trim();

/** text 里的 words（不分大小写）标出来（search.css：黄底） */
function marked(text: string, words: string): ReactNode {
  if (!words) return text;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  for (let at = lower.indexOf(words); at >= 0 && words; at = lower.indexOf(words, at + words.length)) {
    parts.push(text.slice(from, at), <mark key={at}>{text.slice(at, at + words.length)}</mark>);
    from = at + words.length;
  }
  parts.push(text.slice(from));
  return <>{parts}</>;
}

const snippet = (hit: api.SearchHit) => <>{hit.text.slice(0, hit.start)}<mark>{hit.text.slice(hit.start, hit.end)}</mark>{hit.text.slice(hit.end)}</>;

/** 打开文档并请报告页把这处正文滚到眼前、标黄（reveal）：它去这处，不回到读者上次离开它的地方（fresh） */
async function openAt(slug: string, hit: api.SearchHit, words: string) {
  if (!(await openReport(slug, { fresh: true }))) return;
  if (!(await waitForSession(s => s.slug === slug && s.connected, 8000)) || !can('reveal')) return;
  await command('reveal', { text: words, before: hit.before, index: hit.index });
}

/**
 * 搜索文档：标题、说明和正文。标题和说明在本地即时筛；正文由 dev:local 搜（GET search，输入停 120ms 后），
 * 每份文档带出它前几处正文的片段，选中片段打开文档并定位到那里。标题里有这些字的自定义页列在最前（只按标题：
 * 自定义页是工作区的看板，它的内容不进搜索），没输入时不列（它们在侧栏头部）。
 * 列表一停才变一次：新的字的回答还没来时照旧列着上一次的回答（字照现在的字加粗；本地的标题匹配马上加进来，同样的排法），
 * 回答来了才换上；没有「正在搜索正文…」那一行。等过 0.3 秒还没回答，搜索框右端才出一句灰字「正在搜索…」（不占列表的地方），
 * 「没有找到结果」只在回答来了以后说。列表在等回答时 aria-busy。
 * 是一个对话框（role dialog、aria-modal）：焦点在搜索框里，Tab 不走到后面去，关上时焦点回到打开前的地方（lib/modalFocus.ts）；
 * 列表是 listbox，选中的一行是搜索框的 aria-activedescendant。
 */
function SearchPanel() {
  const ws = useStore(workspaceStore);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [found, setFound] = useState<{ words: string; results: api.SearchResult[] } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => pushLayer(closeSearch), []);
  useModalFocus(panel, () => input.current);
  useDimFadesOut(overlay);

  const words = tidy(q).toLowerCase();
  useEffect(() => {
    if (!words) { setFound(null); return; }
    let live = true;
    const timer = setTimeout(() => {
      api.search(words).then(results => { if (live) setFound({ words, results }); }, () => { if (live) setFound({ words, results: [] }); });
    }, 120);
    return () => { live = false; clearTimeout(timer); };
  }, [words]);

  // 这些字的回答来了；还没来时列着的是上一次的回答（stale）
  const searched = !!words && found?.words === words;
  const stale = !!words && !!found && !searched;
  const entries = useMemo(() => {
    const all = flatten(ws.meta);
    const local = all.filter(slug => {
      const r = ws.reports[slug];
      return r && (reportTitle(r).toLowerCase().includes(words) || r.description.toLowerCase().includes(words) || slug.includes(words));
    });
    const remote = words && found ? found.results.filter(result => ws.reports[result.slug]) : [];
    const hits = new Map(remote.map(result => [result.slug, result.hits]));
    const order = [...new Set([...remote.filter(r => r.title).map(r => r.slug), ...local, ...remote.map(r => r.slug)])].slice(0, 50);
    const pages = words ? ws.pages.filter(page => pageTitle(page).toLowerCase().includes(words) || page.slug.includes(words)).map<Entry>(page => ({ slug: page.slug, page: true })) : [];
    return [...pages, ...order.flatMap<Entry>(slug => {
      const [first, ...rest] = hits.get(slug) ?? [];
      return [{ slug, hit: first }, ...rest.map(hit => ({ slug, hit, more: true }))];
    })];
  }, [ws, words, searched, found]);
  const idx = clamp(active, 0, Math.max(0, entries.length - 1));
  const path = (slug: string) => ancestorsOf(ws.meta, slug).map(a => reportTitle(ws.reports[a])).join(' / ');

  useEffect(() => {
    listRef.current?.querySelector('.search-item.active')?.scrollIntoView({ block: 'nearest' });
  }, [idx]);

  const go = (i: number) => {
    const entry = entries[i];
    if (!entry) return;
    closeSearch();
    if (entry.page) void openCustomPage(entry.slug);
    else if (entry.hit && !stale) void openAt(entry.slug, entry.hit, words);
    else void openReport(entry.slug); // 上一次的回答里的片段：位置是那些字的，只打开文档
  };
  // 片段：回答是这些字的，加粗服务器给的那一处；上一次的回答里的，照现在的字加粗
  const shownSnippet = (hit: api.SearchHit) => (stale ? marked(hit.text, words) : snippet(hit));
  const optionId = (i: number) => `${listId}-${i}`;

  return (
    <div ref={overlay} className="modal search-overlay" onPointerDown={e => { if (e.target === e.currentTarget) closeSearch(); }}>
      <div ref={panel} className="search-panel" role="dialog" aria-modal="true" aria-label={t('搜索文档')}>
        <div className="search-bar">
          <Icon name="search" />
          <input
            ref={input}
            role="combobox"
            aria-label={t('搜索文档…')}
            aria-controls={listId}
            aria-expanded="true"
            aria-autocomplete="list"
            aria-activedescendant={entries.length ? optionId(idx) : undefined}
            autoComplete="off"
            placeholder={t('搜索文档…')}
            value={q}
            onChange={e => { setQ(e.target.value); setActive(0); }}
            onKeyDown={e => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                setActive(clamp(idx + (e.key === 'ArrowDown' ? 1 : -1), 0, entries.length - 1));
              } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                go(idx);
              }
            }}
          />
          {/* 等过 0.3 秒还没回答才淡出来（key：每换一次字重新等） */}
          {words && !searched && <span key={words} className="search-wait" aria-hidden="true">{t('正在搜索…')}</span>}
        </div>
        <div className="search-list" ref={listRef} id={listId} role="listbox" aria-label={t('搜索文档')} aria-busy={Boolean(words) && !searched}>
          {entries.length ? (
            <>
              {/* 没输入时列的是全部文档，说一句；输入以后列的就是找到的，不再写「匹配结果」（用户 2026-11-17） */}
              {!words && <div className="menu-head">{t('全部文档')}</div>}
              {entries.map((entry, i) => {
                const { slug, hit, more } = entry;
                // 第二行：正文片段；没有片段时是它在哪里（上级文档、别处的底稿所在的工作区），再没有就是它的说明
                const report = entry.page ? undefined : ws.reports[slug];
                const sub = entry.page ? t('自定义页') : hit ? shownSnippet(hit) : report ? (path(slug) || (report.kind === 'draft' ? workspaceTitle(report.workspace ?? '', ws) : report.description)) : '';
                const props = { id: optionId(i), role: 'option', 'aria-selected': i === idx, className: cls('search-item', !more && Boolean(sub) && 'two', hit && 'with-hit', more && 'more', i === idx && 'active'), onMouseMove: () => i !== idx && setActive(i), onClick: () => go(i) };
                if (more) return <div key={`${slug}:${hit!.index}`} {...props}><span className="search-sub search-snippet">{shownSnippet(hit!)}</span></div>;
                const page = entry.page ? pageOf(slug, ws) : undefined;
                return (
                  <div key={entry.page ? `@${slug}` : slug} {...props}>
                    <span className="pg-icon">{entry.page ? <PageIcon icon={page?.icon} fallback="board" /> : <PageIcon icon={report?.icon} slug={slug} fallback={report?.kind === 'link' ? 'web' : 'page'} />}</span>
                    <span className="search-main">
                      <span className="t">{marked(entry.page ? pageTitle(page) : reportTitle(report), words)}</span>
                      {sub ? <span className={cls('search-sub', hit ? 'search-snippet' : 'path')} data-tip-cut="">{sub}</span> : null}
                    </span>
                  </div>
                );
              })}
            </>
          ) : (!words || searched) && <div className="menu-empty">{t('没有找到结果')}</div>}
        </div>
      </div>
    </div>
  );
}
