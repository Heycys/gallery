import { OLD_PROTOCOL, PROTOCOL, PROTOCOLS, VERSION } from '../../../shared/session.mjs';
import type { DocLook } from '../workspace/types';

/**
 * 会话协议：工作台（父页面）与 iframe 里的报告页之间的 postMessage 消息。
 * 常量和说明在 src/shared/session.mjs，逐条规格见 docs/workbench.md；这里是工作台用的类型。
 * 它只传会话级的少量信息，不传正文。
 */
export { OLD_PROTOCOL, PROTOCOL, VERSION };
export type { DocLook };
/** 协议名：新的 PROTOCOL，或改名前（2026-10-26 之前）的 OLD_PROTOCOL；两边版本不同时也能对上（src/shared/session.mjs） */
export type ProtocolId = typeof PROTOCOL | typeof OLD_PROTOCOL;

export interface SessionFlags {
  /** 编辑器已启动（报告页一打开就在编辑，修改自动保存） */
  editing: boolean;
  /** 有修改还没保存：在等打字停顿，或正在保存 */
  pending: boolean;
  /** 正在保存 */
  saving: boolean;
  /** 连不上本地服务：修改暂存在浏览器里，连上后自动保存 */
  offline: boolean;
  /** 等读者在报告里处理的内容数：冲突，和文档存不下的内容 */
  conflicts: number;
  /** 其中文档存不下的内容数（不是和文件新版本的冲突） */
  unfit: number;
  /** 文件被别人（Agent、另一个标签页）改过；报告页没有待保存的修改时会自动刷新显示 */
  changed: boolean;
}

export const IDLE: SessionFlags = { editing: false, pending: false, saving: false, offline: false, conflicts: 0, unfit: 0, changed: false };

/** 命令的回复：ok 之外的字段见 docs/workbench.md 的命令表 */
export interface Reply {
  ok: boolean;
  reason?: string;
  message?: string;
  [field: string]: unknown;
}

interface Envelope { protocol: ProtocolId; v: typeof VERSION; slug: string }

export type ReportMessage = Envelope & (
  | { type: 'ready'; commands: string[]; title: string | null; icon?: string | null; look?: DocLook; state: SessionFlags; annotations?: number; outline?: boolean; card?: boolean }
  | { type: 'state'; title: string | null; icon?: string | null; look?: DocLook; state: SessionFlags; annotations?: number; outline?: boolean; card?: boolean; cardAt?: number }
  | ({ type: 'reply'; id: string } & Reply)
  | { type: 'key'; key: string }
  | ({ type: 'notice' } & Notice)
  /** 页面底部的面板（冲突卡片、没能放回的修改）占到离框底多高（px，没有为 0）：提示条站在它上面，工作台自己的也一样 */
  | { type: 'noticeRoom'; room: number }
  /** 文件变了，请工作台重新显示这份报告：在看不见的 iframe 里载入，画好后一下子换上；发出后这个页面不再保存任何东西 */
  | { type: 'reload' }
  /** 页面里的链接要去另一份文档（信封的 slug 还是发送者自己的） */
  | ({ type: 'open' } & PagePlace)
  /** 页面里的链接去了本页的一个块：工作台加一条历史（地址不变），后退时请页面回到 place（show-place） */
  | { type: 'jump'; block: string; place: PageSpot }
  /** 这个页面下新建了一个子页面（页面块的输入框），页面本身不动：工作台重读列表，把这个页面在侧栏里展开 */
  | { type: 'workspace' }
  /** 页面上一个块的卡片请读者允许它联网（卡片上的「允许访问」）：工作台打开同意框（组件列表里用的同一个） */
  | { type: 'consent'; block: string; hosts?: string[] }
  /** 读者在批注卡片上删掉了一条：工作台和全部删除一样提示，提示里带撤销 */
  | { type: 'annotations-removed'; items: unknown[] }
  /** 读者在页面里的位置变了：光标所在的块，或选中的字和块（editor/page/focus.mjs）。工作台连同这个标签页的其他情况报给服务器，给 gallery status 用 */
  | ({ type: 'focus' } & PageFocus)
);

/** 读者在页面里的位置，各截到 200 字：光标在哪个块（id 为 null：文件里还没有它的 id），选中了什么字或哪些块 */
export interface PageFocus {
  caret: { block: string | null; text: string } | null;
  selection: { kind: 'text' | 'blocks'; blocks: string[]; text: string; length?: number } | null;
}

/** 要去的文档：target 是它的 slug，block 是块的 id；或者工作台的地址（hash），标题只有工作台知道 */
export type PagePlace = { target: string; block?: string | null } | { hash: string };

/** 读者在页面里的位置（页面给的，工作台只是记在历史上）：滚动位置、窗口顶上的块和它离窗口顶多远、光标所在的块和位置、开着的详情卡片 */
export interface PageSpot { x: number; y: number; [field: string]: unknown }

/** 报告页要告诉读者的一句话，用工作台的提示条显示；text 为空表示收起；room：这时页面底部的面板占到离框底多高（noticeRoom） */
export interface Notice { text: string; tone?: 'info' | 'error'; hold?: number; room?: number }

export const isReportMessage = (data: unknown): data is ReportMessage =>
  !!data && typeof data === 'object' && (PROTOCOLS as string[]).includes((data as ReportMessage).protocol) && (data as ReportMessage).v === VERSION
  && typeof (data as ReportMessage).slug === 'string';
