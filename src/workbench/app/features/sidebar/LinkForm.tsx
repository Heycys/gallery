import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { openPopover } from '../../components/Popover';
import { cls } from '../../lib/util';
import { addLink, setLinkUrl } from '../../workspace/commands';
import * as api from '../../workspace/api';
import { workspaceStore } from '../../workspace/store';
import { linkAddress } from '../../../../shared/web-links.mjs';
import { t } from '../../../../shared/i18n/index.mjs';
import { pastedLink } from './link-paste';

/**
 * 添加在线网页…（栏标题的 ··· 菜单：放在那一栏的第一个）和修改网址…（链接的菜单）：开在点的那个按钮或那一行旁边的小卡片。
 * 添加时两栏：网址、名称。优先用浏览器粘贴的标题，否则网址停 400ms 后请服务器读标题；用户填写的名称不被覆盖。
 * 名称空着就添加时，用读到的标题，没读到用网站的域名。服务器拒绝的（不是 http、https，Gallery 自己的地址……）在卡片里说，卡片不关。
 * Enter 确定，Esc 或点到外面放弃。
 */
export function openLinkForm(anchor: HTMLElement, options: { parent?: string; slug?: string; ownerKey?: string } = {}) {
  openPopover({
    anchor,
    ownerKey: options.ownerKey, // 打开它的那一行（一栏的标题、链接那一行）开着时一直标着
    placement: anchor.closest('.row, .sec-head') ? 'right-start' : 'bottom-start',
    className: 'menu-wide link-form-pop',
    content: close => <LinkForm close={close} parent={options.parent} slug={options.slug} />,
  });
}

/** 网址的域名（没有名称时用它） */
const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

function LinkForm({ close, parent, slug }: { close: () => void; parent?: string; slug?: string }) {
  const editing = slug !== undefined;
  const [url, setUrl] = useState(editing ? workspaceStore.get().reports[slug]?.url ?? '' : '');
  const [name, setName] = useState('');
  const [found, setFound] = useState<{ url: string; title: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const typed = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);

  const address = linkAddress(url);
  const suggestion = found?.url === address.url ? found : null;
  const shownName = typed.current ? name : suggestion?.title ?? '';
  // 网址停下来后读一次标题（添加时）
  useEffect(() => {
    setReading(false);
    if (editing || address.refused || found?.url === address.url) return;
    let live = true;
    const timer = window.setTimeout(() => {
      setReading(true);
      api.pageTitleOf(address.url!).then(
        title => { if (live) setFound({ url: address.url!, title }); },
        () => { if (live) setFound({ url: address.url!, title: '' }); },
      ).finally(() => { if (live) setReading(false); });
    }, 400);
    return () => { live = false; clearTimeout(timer); };
  }, [editing, address.url, address.refused, found?.url]);

  const submit = async () => {
    if (busy) return;
    if (address.refused) { setError(t(address.message!)); return; }
    setBusy(true);
    setError('');
    try {
      if (editing) {
        if (await setLinkUrl(slug, address.url!)) close();
        return;
      }
      const title = shownName.trim() || hostOf(address.url!);
      const problem = await addLink({ url: address.url!, title }, parent);
      if (problem) setError(problem); else close();
    } finally {
      setBusy(false);
    }
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); }
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = pastedLink(e.clipboardData.getData('text/plain'), e.clipboardData.getData('text/html'));
    if (!pasted) return;
    e.preventDefault();
    setUrl(pasted.url);
    setError('');
    if (!editing && !typed.current && pasted.title) setFound(pasted);
  };

  return (
    <div className="link-form" onKeyDown={onKeyDown}>
      <div className="menu-head">{editing ? t('修改网址') : t('添加在线网页')}</div>
      <label className="link-field">
        <span className="link-label">{t('网址')}</span>
        <input ref={input} className="pop-input" name="url" placeholder={t('粘贴网址，例如 https://…')} value={url} spellCheck={false} onPaste={onPaste} onChange={e => { setUrl(e.target.value); setError(''); }} />
      </label>
      {!editing && (
        <label className="link-field">
          <span className="link-label">{t('名称')}</span>
          <input className="pop-input" name="title" placeholder={reading ? t('正在读取网页标题…') : t('网页的标题')} value={shownName} onChange={e => { typed.current = true; setName(e.target.value); }} />
        </label>
      )}
      {error && <div className="link-error" role="alert">{error}</div>}
      <div className="link-actions">
        <button className="dialog-btn" onClick={close}>{t('取消')}</button>
        <button className={cls('dialog-btn primary', busy && 'busy')} disabled={busy || !url.trim()} onClick={() => void submit()}>{editing ? t('保存') : t('添加')}</button>
      </div>
    </div>
  );
}
