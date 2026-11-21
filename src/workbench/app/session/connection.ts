import { uid } from '../lib/util';
import { IDLE, OLD_PROTOCOL, PROTOCOL, VERSION, isReportMessage, type DocLook, type Notice, type PageFocus, type PagePlace, type PageSpot, type ProtocolId, type Reply, type SessionFlags } from './protocol';

/**
 * 与 iframe 里的报告页之间的会话。
 * - 报告页每次载入（包括保存后刷新）都发一次 ready；页面卸载时（pagehide）立即断开，不必等新页面的 load。
 *   ready 可能早于 iframe 的 load，所以 load 时如果还是发过 ready 的那个文档，就不当作新页面。
 * - 每个命令恰好得到一个 reply（按 id 对应）；页面在回复前卸载或超时，命令以 { ok: false, reason: 'gone' / 'timeout' } 结束。
 * - 只认这份报告的消息：iframe 里点链接跳到别的报告时，那边的消息一律不理，命令也会被那边拒绝。
 * - 协议名新旧都认（改名前的报告页还开着时）：命令用这个页面上一次说的那个发；新版页面在收到第一个命令前每条消息新旧各发一次（新的在前），
 *   说过新协议名的页面再发来的旧名消息就是那一份的重复，不理。
 * - 所有文档同源；pageSlug 是存储目录内的名字，slug 是带所有者前缀的工作台身份。
 */
export interface SessionSnapshot {
  connected: boolean;
  title?: string;
  /** 报告页上报的页面图标（一个表情；null：没有） */
  icon?: string | null;
  /** 报告页显示着的字体与布局（它 <html> 上的，服务器按 doc.json 放上的，或刚换过的）；旧的报告页不报 */
  look?: DocLook;
  /** 报告页能回答的命令 */
  commands: string[];
  /** 报告页有几条批注（批注列表用它：复制批注的条数，没有时两行都灰着） */
  annotations?: number;
  /** 报告页是否开着目录；开关按文档的全局身份保存（shared/preferences.mjs）。 */
  outline?: boolean;
  /** 报告页里开着详情卡片（工作台自己的侧栏、顶栏这时也算卡片的背景：ReportView 的 watchCards） */
  card?: boolean;
  /** 详情卡片上一次开、关的时刻（页面的 performance.timeOrigin + now，即从纪元起的毫秒）：遮罩从那时起淡，和页面里卡片的背景同步 */
  cardAt?: number;
  /** 读者在报告页里的位置（光标所在的块、选中的字和块）：报告给服务器，gallery status 用；没有说过时没有 */
  focus?: PageFocus;
  /** 报告页请过重新显示（reload）：它已经停下，换上新页面之前不该再请它走动（navigation.ts stepTo） */
  reloading?: boolean;
  flags: SessionFlags;
}

export interface SessionConnection {
  subscribe(listener: (snapshot: SessionSnapshot) => void): () => void;
  command(name: string, fields?: object, timeout?: number): Promise<Reply>;
  dispose(): void;
}

export interface ConnectOptions {
  slug: string;
  /** 页面自己的 slug（消息里的 slug）：别处的底稿是它在自己工作区里的 slug，slug 是它在侧栏里的条目（~ws-xxxxxx/slug）；默认同 slug */
  pageSlug?: string;
  /** 每次连上（ready）之后：发主题、登记快捷键这类每个页面都要重新告诉它的事 */
  onReady: (command: SessionConnection['command']) => void;
  /** 报告页转来登记过的快捷键 */
  onKey: (key: string) => void;
  /** 报告页要告诉读者的话（工作台用自己的提示条显示） */
  onNotice: (notice: Notice) => void;
  /** 报告页底部的面板占到离框底多高变了（提示条站在它上面） */
  onNoticeRoom?: (room: number) => void;
  /** 报告页请工作台重新显示这份报告（文件变了；它自己不再刷新） */
  onReload?: () => void;
  /** 报告页里的链接要去另一份文档 */
  onOpen?: (place: PagePlace) => void;
  /** 报告页里的链接要去本页的一个块：加一条历史，place 是点之前读者在的地方 */
  onJump?: (block: string, place: PageSpot) => void;
  /** 这个页面下新建了子页面，页面本身不动 */
  onWorkspace?: () => void;
  /** 读者在报告页里删掉了批注（items：撤销时放回去的那些） */
  onAnnotationsRemoved?: (items: unknown[]) => void;
  /** 页面上一个块请读者允许它联网（卡片上的「允许访问」） */
  onConsent?: (block: string) => void;
}

export function connectFrame(frame: HTMLIFrameElement, { slug: entry, pageSlug, onReady, onKey, onNotice, onNoticeRoom, onReload, onOpen, onJump, onWorkspace, onAnnotationsRemoved, onConsent }: ConnectOptions): SessionConnection {
  /** 消息里的 slug：页面自己的 */
  const slug = pageSlug ?? entry;
  const listeners = new Set<(s: SessionSnapshot) => void>();
  let snapshot: SessionSnapshot = { connected: false, commands: [], flags: IDLE };
  /** 发出 ready 的那个文档 */
  let readyDoc: Document | null = null;
  /** 这个页面说的协议名：命令用它发（没说过时用新的）；说过新的以后，旧名的消息不再理 */
  let speaks: ProtocolId | null = null;
  const pending = new Map<string, (reply: Reply) => void>();

  const emit = (next: Partial<SessionSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    listeners.forEach(fn => fn(snapshot));
  };

  const disconnect = () => {
    readyDoc = null;
    speaks = null;
    pending.forEach(finish => finish({ ok: false, reason: 'gone' }));
    emit({ connected: false, reloading: false, title: undefined, icon: undefined, look: undefined, focus: undefined, commands: [], flags: IDLE, annotations: undefined, outline: undefined, card: false, cardAt: undefined });
  };

  function watchDocument() {
    try {
      const doc = frame.contentDocument;
      if (!doc || doc === readyDoc) return;
      readyDoc = doc;
      doc.defaultView?.addEventListener('pagehide', () => { if (readyDoc === doc) disconnect(); }, { once: true });
    } catch { readyDoc = null; }
  }

  const command: SessionConnection['command'] = (name, fields = {}, timeout = 10000) => {
    if (!snapshot.connected) return Promise.resolve({ ok: false, reason: 'offline' });
    const id = uid();
    return new Promise<Reply>(resolve => {
      const finish = (reply: Reply) => { pending.delete(id); clearTimeout(timer); resolve(reply); };
      const timer = window.setTimeout(() => finish({ ok: false, reason: 'timeout' }), timeout);
      pending.set(id, finish);
      try {
        frame.contentWindow?.postMessage({ protocol: speaks ?? PROTOCOL, v: VERSION, type: 'command', id, slug, name, ...fields }, location.origin);
      } catch { finish({ ok: false, reason: 'gone' }); } // 页面正在卸载
    });
  };

  const onMessage = (e: MessageEvent) => {
    if (e.source !== frame.contentWindow || e.origin !== location.origin || !isReportMessage(e.data) || e.data.slug !== slug) return;
    const msg = e.data;
    if (msg.protocol === OLD_PROTOCOL && speaks === PROTOCOL) return; // 同一条消息的旧名那一份
    speaks = msg.protocol;
    switch (msg.type) {
      case 'ready':
        watchDocument();
        emit({ connected: true, reloading: false, focus: undefined, title: msg.title ?? undefined, icon: msg.icon ?? null, look: msg.look, commands: msg.commands, flags: msg.state, annotations: msg.annotations, outline: msg.outline, card: msg.card ?? false, cardAt: undefined });
        onReady(command);
        break;
      case 'state':
        emit({ flags: msg.state, title: msg.title ?? undefined, icon: msg.icon ?? null, look: msg.look, annotations: msg.annotations, outline: msg.outline, card: msg.card ?? false, cardAt: typeof msg.cardAt === 'number' ? msg.cardAt : undefined });
        break;
      case 'reply':
        pending.get(msg.id)?.(msg);
        break;
      case 'key':
        onKey(msg.key);
        break;
      case 'notice':
        onNotice(msg);
        break;
      case 'noticeRoom':
        onNoticeRoom?.(msg.room);
        break;
      case 'reload':
        emit({ reloading: true });
        onReload?.();
        break;
      case 'open':
        onOpen?.(msg);
        break;
      case 'jump':
        if (typeof msg.block === 'string' && msg.place && typeof msg.place === 'object') onJump?.(msg.block, msg.place);
        break;
      case 'workspace':
        onWorkspace?.();
        break;
      case 'annotations-removed':
        onAnnotationsRemoved?.(msg.items);
        break;
      case 'focus':
        emit({ focus: { caret: msg.caret ?? null, selection: msg.selection ?? null } });
        break;
      case 'consent':
        if (typeof msg.block === 'string') onConsent?.(msg.block);
        break;
    }
  };

  const onLoad = () => {
    try { if (readyDoc && frame.contentDocument === readyDoc) return; } catch { /* 跨源 */ }
    disconnect();
  };

  window.addEventListener('message', onMessage);
  frame.addEventListener('load', onLoad);

  return {
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot);
      return () => { listeners.delete(listener); };
    },
    command,
    dispose() {
      window.removeEventListener('message', onMessage);
      frame.removeEventListener('load', onLoad);
      pending.forEach(finish => finish({ ok: false, reason: 'gone' }));
      listeners.clear();
    },
  };
}
