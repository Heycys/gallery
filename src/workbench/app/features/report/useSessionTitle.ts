import { t } from '../../../../shared/i18n/index.mjs';
import { useStore } from '../../lib/store';
import { sessionStore } from '../../session/sessionStore';

/** 当前打开的报告在报告页里改了标题（还没保存）时，侧栏和面包屑先显示报告页上报的标题；标题删空了就是「未命名文档」（页面没有标题时报告页报 null，用列表里的） */
export const useSessionTitle = (slug: string | null) =>
  useStore(sessionStore, s => (slug && s.slug === slug && s.connected && typeof s.title === 'string' ? s.title || t('未命名文档') : undefined));

/** 同样，报告页上的页面图标（换了、去掉了，还没写进 report.json 时）：null 是没有图标，undefined 是不知道（用列表里的） */
export const useSessionIcon = (slug: string | null) =>
  useStore(sessionStore, s => (slug && s.slug === slug && s.connected && s.icon !== undefined ? s.icon : undefined));
