import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { language, t } from '../../../../shared/i18n/index.mjs';
import { Icon } from '../../components/Icon';
import { closePopover } from '../../components/Popover';
import { toast } from '../../components/Toast';
import { useDimFadesOut } from '../../lib/afterimage';
import { pushLayer } from '../../lib/layers';
import { useModalFocus } from '../../lib/modalFocus';
import { createStore, useStore } from '../../lib/store';
import { netHostsOf } from '../../../../shared/net-policy.mjs';
import { askNetConsent } from './netConsent';
import { cls } from '../../lib/util';
import * as api from '../../workspace/api';
import type { BlockSetting, BothLanguages, ComponentSettings as Settings, PackageSetting, PackSetting } from '../../workspace/types';
import './preferences.css';

/**
 * 组件列表（设置里，docs/workbench.md「Components」）：工作区的自定义块和内置块，各自的开关，写在 gallery.json 的 components 里。
 * 自定义块：和内置块一样一块一行（图标、名字），右边一个总开关，默认开着：关掉，"/"、在下方新建、手柄的网格、添加自定义块里
 * 都不再提供它，已经写在文档和页面里的块照常显示（components.unlisted，一个块没有写进去就是开着）。清单写了 listed: false 的块
 * （Gallery 的卡片和表格图表卡片）默认关着，打开写进 components.listed（服务器照清单换，shared/components/installed.mjs unlistedBy），
 * 展开后多一句说它默认不在菜单里。点一行（不是点
 * 开关）展开：id 和版本、是什么、用在哪里（清单的 places：文档、自定义页）、要用什么（needs：工作区的数据、文档里的表格、联网的域名）、
 * 现在的状态，没有加载时说为什么（Gallery 自带的块，副本添加后改过、Gallery 又有了新版本的，再说一句为什么没有自动更新、怎么换成新版本：
 * 删掉文件夹再 gallery block add；没改过的副本服务器自己会更新，shared/shipped-blocks.mjs），再是它的开关，每个一行、带一句说明：「在文档菜单里显示」（"/"、在下方新建、手柄的网格，已有的块
 * 照常，自定义页里照样能添加）和停用（不加载脚本和样式，已有的块只显示内容）；needs 里写了 net:<域名> 的块再多一个「允许联网」：
 * 打开时问一次（netConsent.ts 的同意框，卡片上的「允许访问」打开的也是它），答应了写进 gallery.json 的 components.net，关掉直接撤回；
 * 它要访问的网站都允许了才算开着（块后来多写了一个网站，就要重新允许）。「在文档菜单里显示」是 inDocumentMenus：用在文档里
 * 的块默认开着，关掉写进 hidden；只用在自定义页上的默认关着，打开写进 shown。内置块的开关是同一个，只能关掉（hidden）；文本、
 * 标题、列表、分区不能关（定义里的 hideable: false），开关开着、按不动。内置块那一组的开关不带字（二十几行都写一遍太吵），分组开头那句说它是什么，读屏读 aria-label。
 * 内置块每行名字左边是它在 "/" 菜单里那一行的图标（服务器给的同一张图；分区是「组成新分区」那张），锁着、隐藏了都不变灰；
 * 自定义块每行左边是同一个自定义块的图标（服务器给的 packageIcon：一张卡片，上面三条线）。没有加载、停用了的块，行尾在
 * 开关前有一个灰字（没有加载、已停用），收起时也看得出。展开的状态是这一行自己的，别处的改动让列表重读时保持不变。
 * 打开时问一次服务器（GET components），每拨一下写一次，答的就是拨完之后的样子；拨了之后开着的页面自己跟上（docs/render.md「Settings」）。
 * 开着的时候别处的改动也跟着（手改 gallery.json、别的工作台、Agent 写了组件包：api.onCatalogChange）。gallery.json 读不出来时
 * 上面说一行，所有开关按不动：写不进去，开关说的是读得出来时的样子。
 * 外壳和写作偏好的对话框是同一个（.pref-*），扁平：一行一行。打开时焦点进对话框（关闭按钮），Tab 在里面转，关上时回到原处（lib/modalFocus.ts）；
 * 关上时后面的遮罩淡出（lib/afterimage.ts）。
 *
 * 自定义块多了一级：块包（2026-11-09 起；shared/block-packs.mjs）。先是一排圆角矩形的卡片，一张是一个
 * 块包（工作区 components 里的一个 scope：默认块包、Gallery 自带的两个、装进来的、工作区自己写的块），卡片上是图标（pack.json 的 icon，
 * 没有就是自定义块的图标）、名字、「N 个块」、作者（灰字），右边是这个包的开关（gallery.json 的 components.packs：关掉后它的块都不在
 * "/"、添加自定义块里，已经写好的照常显示）。最后一张是同样大小的「+ 导入」：点开下面出一个路径框（粘贴块包的文件夹
 * 或 zip 的路径）和一个「确认」，没有「取消」（再点「导入」或 Esc 关掉），旁边的「选择 zip 文件…」用系统的选文件框选一个 zip
 * （浏览器拿不到文件夹的路径，文件夹只能粘贴）；服务器照 gallery block pack install 的规矩检查（POST pack-install），拒绝的原因写在
 * 下面，装好了提示一句。点一张卡片进到这个包里：顶上「‹ 返回」、包的名字和开关，下面和原来一样一个块一行；在包里的时候内置块那一组
 * 不显示。第一张总是「默认块包」（local/，没有 pack.json：Agent 写自定义块时没有指定块包，块就放在这里，只写一个块不用另建块包；
 * Gallery 自带的文档块，图表、看板、指标和默认关着的卡片、表格图表卡片，也算在这里，「Gallery 风格」只剩首页卡片：一个块算在哪个包里由服务器
 * 说（packages 的 pack，shared/components/installed.mjs 的 packOf），这里照着分；还没有块时也在，「0 个块」），和别的包一样有开关。钩子：.comp-packs、.comp-pack[data-pack]（.comp-pack-open 是点进去的那部分）、.comp-pack-add、.comp-import、
 * .comp-pack-view[data-pack]、.comp-back。
 */

const dialogStore = createStore(false);

/** 打开组件设置：对话框马上显示，内容等服务器回答 */
export function openComponentSettings() {
  closePopover();
  dialogStore.set(true);
}

export function ComponentSettingsHost() {
  const open = useStore(dialogStore);
  if (!open) return null;
  return createPortal(<ComponentDialog />, document.body);
}

const close = () => dialogStore.set(false);

// 清单写的两种语言：用界面的语言
const inUiLanguage = (words: BothLanguages) => (language === 'en' ? words.en : words.zh);

const STATES: Record<PackageSetting['state'], string> = { normal: t('正常'), hidden: t('不在文档菜单里'), disabled: t('已停用'), broken: t('没有加载') };
const PLACES: Record<'document' | 'page', string> = { document: t('文档@place'), page: t('自定义页@place') };
const MENU = t('在文档菜单里显示');
const MASTER = t('在所有菜单里提供');
const MASTER_SAYS = t('总开关关掉后，“/”和添加自定义块里都不再提供它；已经写在文档和页面里的块照常显示。');
const MENU_SAYS = t('出现在 “/”、在下方新建和手柄的网格里；关掉后已有的块照常运行和导出，自定义页里照样能添加');

const PACK_SAYS = t('块包的开关关掉后，它的块都不在 “/”和添加自定义块里；已经写在文档和页面里的块照常显示。');

// 清单的 needs，用户的话：工作区的数据、文档里的表格、联网（域名）
const needSaid = (need: string) => (need === 'workspace' ? t('工作区的数据') : need === 'tables' ? t('文档里的表格') : need.startsWith('net:') ? t('联网：{0}', need.slice(4)) : need);

// 用在哪里、要用什么：一行，清单读不出来时没有
function usesOf(item: PackageSetting) {
  if (!item.places) return null;
  const places = t('用在：{0}', (['document', 'page'] as const).filter((place) => item.places?.includes(place)).map((place) => PLACES[place]).join(t('、')));
  return item.needs?.length ? t('{0} · 要用：{1}', places, item.needs.map(needSaid).join(t('、'))) : places;
}

// 一个开关：按不动的（locked）也接得到鼠标，说得出为什么（真的 disabled 的按钮不发事件，提示就出不来）
function Toggle({ label, on, locked = false, tip, onChange }: { label: string; on: boolean; locked?: boolean; tip?: string; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button" role="switch" className="comp-toggle" aria-label={label} aria-checked={on} aria-disabled={locked} data-tip={tip}
      onClick={() => { if (!locked) onChange(!on); }}
    >
      <span className={cls('mi-switch', on && 'on')}><span /></span>
    </button>
  );
}

// 展开后的一个开关：一行，左边是名字和一句说明，右边是开关；按不动的同样说得出为什么
function Option({ label, name, hint, on, locked = false, tip, onChange }: { label: string; name: string; hint?: string; on: boolean; locked?: boolean; tip?: string; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button" role="switch" className="comp-opt" aria-label={t('{0}：{1}', label, name)} aria-checked={on} aria-disabled={locked} data-tip={tip}
      onClick={() => { if (!locked) onChange(!on); }}
    >
      <span className="comp-opt-text">
        <span className="comp-toggle-name">{label}</span>
        {hint && <span className="comp-opt-hint">{hint}</span>}
      </span>
      <span className={cls('mi-switch', on && 'on')}><span /></span>
    </button>
  );
}

// 这一行的状态：没有加载的说为什么；没有能用的模板的说它为什么不在菜单里（隐藏对它还管给 Agent 的清单）
function stateOf(item: PackageSetting) {
  if (item.reason) return t('{0}：{1}', STATES[item.state], inUiLanguage(item.reason));
  return item.template || item.state === 'disabled' ? STATES[item.state] : t('{0}：没有能用的模板，菜单里不会出现', STATES[item.state]);
}

function PackageRow({ item, icon, frozen, flip, allowNet }: { item: PackageSetting; icon: string; frozen: boolean; flip: (change: { id: string; hidden?: boolean; shown?: boolean; disabled?: boolean; unlisted?: boolean; net?: boolean }) => void; allowNet: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const name = item.name ? inUiLanguage(item.name) : item.id;
  // 自己没有加载（清单读不出来、apiVersion 不支持）：说为什么，开关改不了什么
  const locked = item.reason !== null || frozen;
  const tip = frozen ? t('改好 gallery.json 之后才能改这里') : locked ? t('这个自定义块没有加载，开关不起作用') : undefined;
  const uses = usesOf(item);
  // 用在文档里的块，开关关掉是 hidden；只用在自定义页上的，打开是 shown（inDocumentMenus）
  const inDocuments = (item.places ?? ['document']).includes('document');
  const menu = (on: boolean) => flip(inDocuments ? { id: item.id, hidden: !on } : { id: item.id, shown: on });
  // 联网：它要访问的网站都允许了才算开着；打开先问（同意框），关掉直接撤回
  const hosts = netHostsOf(item.needs ?? []);
  const online = hosts.length > 0 && hosts.every((host) => item.allowed.includes(host));
  const off = item.state === 'disabled' || item.state === 'broken';
  return (
    <div className="comp-row comp-pkg" data-id={item.id} data-open={open ? '' : undefined}>
      <div className="comp-line">
        <button type="button" className="comp-head" aria-expanded={open} onClick={() => setOpen(!open)}>
          {/* 服务器自己的常量（自定义块的图标），不是用户内容 */}
          <span className="comp-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: icon }} />
          <span className="comp-name">{name}</span>
          <span className="comp-chev" aria-hidden="true"><Icon name="chevron" /></span>
          {off && <span className="comp-tag">{STATES[item.state]}</span>}
        </button>
        <Toggle label={t('{0}：{1}', MASTER, name)} on={!item.unlisted} locked={locked} tip={tip ?? MASTER_SAYS} onChange={(on) => flip({ id: item.id, unlisted: !on })} />
      </div>
      {open && (
        <div className="comp-detail">
          <div className="comp-meta">{[item.name && item.id, item.version].filter(Boolean).join(' · ')}</div>
          {item.description && <div className="comp-note">{inUiLanguage(item.description)}</div>}
          {uses && <div className="comp-note comp-uses">{uses}</div>}
          <div className="comp-note comp-state">{stateOf(item)}</div>
          {item.newer && <div className="comp-note comp-newer">{t('Gallery 有新版本 {0}。这份副本添加后改过，所以不会自动更新；要换成新版本，删掉工作区里的 components/{1} 文件夹（改动会丢掉），再运行 gallery block add {2}。', item.newer, item.id, item.addAs ?? item.id.slice(item.id.indexOf('/') + 1))}</div>}
          {!item.listedByDefault && <div className="comp-note comp-default-off">{t('这个块默认不在菜单里，打开右边的开关后才提供；已经写在文档里的照常显示。')}</div>}
          <div className="comp-note comp-master">{MASTER_SAYS}</div>
          <div className="comp-opts">
            <Option label={MENU} name={name} hint={MENU_SAYS} on={item.menu} locked={locked} tip={tip} onChange={menu} />
            <Option label={t('停用')} name={name} hint={t('不加载它的脚本和样式，已有的块只显示内容')} on={item.disabled || item.state === 'disabled'} locked={locked} tip={tip} onChange={(on) => flip({ id: item.id, disabled: on })} />
            {hosts.length > 0 && <Option label={t('允许联网')} name={name} hint={t('允许它从这些网站取数据：{0}', hosts.join(t('、')))} on={online} locked={locked} tip={tip} onChange={(on) => (on ? allowNet(item.id) : flip({ id: item.id, net: false }))} />}
          </div>
        </div>
      )}
    </div>
  );
}

// 块包的图标：pack.json 写的表情或字，没有就是自定义块的图标（服务器自己的常量）
function PackIcon({ pack, fallback }: { pack: PackSetting; fallback: string }) {
  return pack.icon
    ? <span className="comp-pack-icon" aria-hidden="true">{pack.icon}</span>
    : <span className="comp-pack-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: fallback }} />;
}

// 一张块包的卡片：点它进到包里；右边是包的开关
function PackCard({ pack, icon, frozen, open, flipPack }: { pack: PackSetting; icon: string; frozen: boolean; open: (id: string) => void; flipPack: (id: string, on: boolean) => void }) {
  const name = inUiLanguage(pack.name);
  return (
    <div className="comp-pack" data-pack={pack.id} data-off={pack.enabled ? undefined : ''}>
      <button type="button" className="comp-pack-open" aria-label={t('打开块包「{0}」', name)} onClick={() => open(pack.id)}>
        <PackIcon pack={pack} fallback={icon} />
        <span className="comp-pack-words">
          <span className="comp-pack-name" data-tip-cut="">{name}</span>
          <span className="comp-pack-meta">
            <span className="comp-pack-count">{t('{0} 个块', pack.blocks)}</span>
            {pack.author && <span className="comp-pack-author">{pack.author}</span>}
          </span>
        </span>
      </button>
      <Toggle label={t('{0}：{1}', t('启用块包'), name)} on={pack.enabled} locked={frozen} tip={frozen ? t('改好 gallery.json 之后才能改这里') : PACK_SAYS} onChange={(on) => flipPack(pack.id, on)} />
    </div>
  );
}

// 文件的内容，base64（大文件分段转，免得一次塞给 btoa 的字符串太长）
function base64Of(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let text = '';
  for (let at = 0; at < bytes.length; at += 0x8000) text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(text);
}

// 导入块包：路径框和一个「确认」（主按钮），旁边「选择 zip 文件…」；服务器拒绝的原因写在下面
function ImportForm({ done }: { done: (answer: Settings & { installed: { name: BothLanguages; version: string; did: string; kept: string[] } }) => void }) {
  const [path, setPath] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const install = async (from: { path: string } | { zip: string }) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      done(await api.installPack(from));
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const chosen = async (picked: File | undefined) => {
    if (!picked) return;
    if (file.current) file.current.value = '';
    await install({ zip: base64Of(await picked.arrayBuffer()) });
  };
  return (
    <div className="comp-import">
      <div className="comp-import-row">
        <input
          ref={input} className="pop-input" name="pack-path" spellCheck={false} autoComplete="off" aria-label={t('粘贴块包的文件夹或 zip 的路径')} placeholder={t('粘贴块包的文件夹或 zip 的路径')} value={path}
          onChange={(e) => { setPath(e.target.value); setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && path.trim()) { e.preventDefault(); void install({ path: path.trim() }); } }}
        />
        <button type="button" className={cls('dialog-btn primary comp-import-confirm', busy && 'busy')} disabled={busy || !path.trim()} onClick={() => void install({ path: path.trim() })}>{t('导入')}</button>
      </div>
      <button type="button" className="comp-import-pick" disabled={busy} onClick={() => file.current?.click()}>{t('选择 zip 文件…')}</button>
      <input ref={file} type="file" accept=".zip,application/zip" hidden onChange={(e) => void chosen(e.target.files?.[0])} />
      {error && <div className="comp-import-error" role="alert">{error}</div>}
    </div>
  );
}

// 进到一个块包里：「‹ 返回」，包的名字、版本、作者和开关，说明，然后一个块一行
function PackView({ pack, packages, icon, frozen, flip, allowNet, flipPack, back }: { pack: PackSetting; packages: PackageSetting[]; icon: string; frozen: boolean; flip: (change: { id: string; hidden?: boolean; shown?: boolean; disabled?: boolean; unlisted?: boolean; net?: boolean }) => void; allowNet: (id: string) => void; flipPack: (id: string, on: boolean) => void; back: () => void }) {
  const name = inUiLanguage(pack.name);
  const backButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { backButton.current?.focus(); }, []);
  const facts = [pack.kind === 'official' ? t('Gallery 自带') : pack.kind === 'own' ? t('工作区自己写的块') : null, pack.version, pack.kind === 'official' ? null : pack.author].filter(Boolean).join(' · ');
  const empty = pack.kind === 'default' ? t('还没有块。让 Agent 写一个自定义块，没有指定块包时就放在这里。') : t('这个块包里还没有块。');
  return (
    <div className="comp-pack-view" data-pack={pack.id}>
      <button type="button" ref={backButton} className="comp-back" onClick={back}><span className="comp-back-icon" aria-hidden="true"><Icon name="chevron" /></span>{t('返回')}</button>
      <div className="comp-pack-head">
        <PackIcon pack={pack} fallback={icon} />
        <span className="comp-pack-words">
          <span className="comp-pack-name">{name}</span>
          {facts && <span className="comp-pack-meta">{facts}</span>}
        </span>
        <Toggle label={t('{0}：{1}', t('启用块包'), name)} on={pack.enabled} locked={frozen} tip={frozen ? t('改好 gallery.json 之后才能改这里') : PACK_SAYS} onChange={(on) => flipPack(pack.id, on)} />
      </div>
      {pack.description && <div className="comp-note comp-pack-says">{inUiLanguage(pack.description)}</div>}
      {pack.problem && <div className="comp-note comp-pack-problem">{t('pack.json 读不出来：{0}', inUiLanguage(pack.problem))}</div>}
      {!pack.enabled && <div className="comp-note comp-pack-off">{t('这个块包关着：它的块都不在 “/”和添加自定义块里；已经写在文档和页面里的块照常显示。')}</div>}
      {pack.changed.length > 0 && <div className="comp-note comp-newer">{pack.newer
        ? t('这个块包装上后改过（{0}），Gallery 的新版本 {1} 不会换上改过的部分；没改过的块照常更新。', pack.changed.join(t('、')), pack.newer)
        : t('这个块包装上后改过（{0}）：再装一次新版本时，改过的部分保持不变。', pack.changed.join(t('、')))}</div>}
      {packages.length > 0
        ? <>
          <div className="comp-lead">{t('每个块右边的开关管 “/”和添加自定义块里提不提供它；点一行看它的说明和别的开关。')}</div>
          {packages.map((item) => <PackageRow key={item.id} item={item} icon={icon} frozen={frozen} flip={flip} allowNet={allowNet} />)}
        </>
        : <div className="comp-empty">{empty}</div>}
    </div>
  );
}

function BlockRow({ item, frozen, flip }: { item: BlockSetting; frozen: boolean; flip: (change: { id: string; hidden: boolean }) => void }) {
  const name = inUiLanguage(item.name);
  const tip = frozen ? t('改好 gallery.json 之后才能改这里') : item.hideable ? undefined : t('这个块总在文档菜单里');
  return (
    <div className="comp-row comp-block" data-id={item.id}>
      {/* 服务器自己的常量（编辑器的图标），不是用户内容 */}
      {item.icon && <span className="comp-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: item.icon }} />}
      <div className="comp-name">{name}</div>
      <Toggle label={t('{0}：{1}', MENU, name)} on={!item.hidden} locked={!item.hideable || frozen} tip={tip} onChange={(on) => flip({ id: item.id, hidden: !on })} />
    </div>
  );
}

function ComponentDialog() {
  const [settings, setSettings] = useState<Settings | null>(null);
  // 进到哪个块包里（null：块包的卡片那一层），导入的表开着没有
  const [inside, setInside] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const backTo = useRef<string | null>(null);
  useModalFocus(dialog, () => dialog.current?.querySelector<HTMLElement>('.pref-close'));
  useDimFadesOut(overlay);
  // 从包里回来：焦点回到那张卡片上
  useEffect(() => {
    if (inside !== null || !backTo.current) return;
    dialog.current?.querySelector<HTMLElement>(`.comp-pack[data-pack="${CSS.escape(backTo.current)}"] .comp-pack-open`)?.focus();
    backTo.current = null;
  }, [inside]);
  useEffect(() => {
    let live = true;
    const ask = () => api.componentSettings().then((answer) => { if (live) setSettings(answer); }, (error: Error) => { close(); toast(error.message, { tone: 'error' }); });
    ask();
    const unheard = api.onCatalogChange(ask);
    const off = pushLayer(close);
    return () => {
      live = false;
      unheard();
      off();
    };
  }, []);
  const flip = (change: { id: string; hidden?: boolean; shown?: boolean; disabled?: boolean; unlisted?: boolean; net?: boolean }) => {
    api.switchComponent(change).then(setSettings, (error: Error) => toast(t('设置没有保存：{0}', error.message), { tone: 'error' }));
  };
  const flipPack = (id: string, on: boolean) => {
    api.switchPack(id, on).then(setSettings, (error: Error) => toast(t('设置没有保存：{0}', error.message), { tone: 'error' }));
  };
  const installed = (answer: Settings & { installed: { name: BothLanguages; version: string; did: string; kept: string[] } }) => {
    setSettings(answer);
    setImporting(false);
    const name = inUiLanguage(answer.installed.name);
    toast(answer.installed.did === 'installed' ? t('已导入块包「{0}」{1}', name, answer.installed.version)
      : answer.installed.did === 'updated' ? t('块包「{0}」已更新到 {1}', name, answer.installed.version)
      : t('块包「{0}」{1} 已经装好了', name, answer.installed.version));
  };
  const back = () => {
    backTo.current = inside;
    setInside(null);
  };
  // 允许联网：先问（同意框），答应了再读一次列表
  const allowNet = (id: string) => {
    void askNetConsent(id, settings ?? undefined).then((allowed) => { if (allowed) void api.componentSettings().then(setSettings, () => {}); });
  };
  return (
    <div ref={overlay} className="pref-overlay" onPointerDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="pref-dialog comp-dialog" role="dialog" aria-modal="true" aria-label={t('组件列表')} ref={dialog}>
        <header className="pref-head">
          <span className="pref-title">{t('组件列表')}</span>
          <span className="pref-sub">{t('文档菜单里出现哪些块，这个工作区加载哪些自定义块。')}</span>
          <div className="pref-actions">
            <button className="icon-btn pref-close" aria-label={t('关闭')} data-tip={t('关闭')} onClick={close}><Icon name="close" /></button>
          </div>
        </header>
        <div className="comp-body" aria-busy={!settings}>
          {settings && (
            <>
              {settings.problem && <div className="comp-problem" role="alert">{inUiLanguage(settings.problem)}</div>}
              <h3 className="comp-group">{t('自定义块')}</h3>
              {(() => {
                const pack = inside === null ? null : settings.packs.find((one) => one.id === inside);
                if (pack) return <PackView pack={pack} packages={settings.packages.filter((item) => item.pack === pack.id)} icon={settings.packageIcon} frozen={Boolean(settings.problem)} flip={flip} allowNet={allowNet} flipPack={flipPack} back={back} />;
                return (
                  <>
                    {settings.packs.length > 0
                      ? <div className="comp-lead">{t('自定义块按块包放：每个块包右边的开关管它的块在 “/”和添加自定义块里提不提供；点一个块包看它的块。')}</div>
                      : <div className="comp-empty">{t('这个工作区还没有自定义块：让 Agent 做一个，或导入一个块包，它们放在工作区的 components 文件夹里。')}</div>}
                    <div className="comp-packs">
                      {settings.packs.map((one) => <PackCard key={one.id} pack={one} icon={settings.packageIcon} frozen={Boolean(settings.problem)} open={setInside} flipPack={flipPack} />)}
                      <button type="button" className="comp-pack comp-pack-add" aria-expanded={importing} onClick={() => setImporting(!importing)}>
                        <span className="comp-pack-icon" aria-hidden="true"><Icon name="plus" /></span>
                        <span className="comp-pack-name">{t('导入')}</span>
                      </button>
                    </div>
                    {importing && <ImportForm done={installed} />}
                  </>
                );
              })()}
              {inside === null && <>
                <h3 className="comp-group">{t('内置块')}</h3>
                <div className="comp-lead">{t('每个块右边的开关是「在文档菜单里显示」：关掉的块不再出现在 “/”、在下方新建和手柄的网格里，已有的块照常。')}</div>
                {settings.blocks.map((item) => <BlockRow key={item.id} item={item} frozen={Boolean(settings.problem)} flip={flip} />)}
              </>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
