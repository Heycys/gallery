import { ICONS, type IconName } from './icons';

/** 图标：外层 span 用 display: contents，SVG 在布局上等同于父元素的直接子元素 */
export function Icon({ name }: { name: IconName }) {
  return <span className="ic" dangerouslySetInnerHTML={{ __html: ICONS[name] }} />;
}

/**
 * 页面图标（报告页标题上方的 .doc-icon，值同 report.json 的 icon）：服务器按值给一张图（/__gallery/edit/icon，
 * 表情是 Twemoji、上传的图是报告文件夹里的那张），地址只随值变；表情和图标永久缓存，刷新时直接从缓存画出来，不先空一下，
 * 文件夹里的图每次都再问服务器（同名的图换了以后，刷新就是新的）；
 * “图标”页签的图标（MingCute / Tabler）用它的形状做遮罩，颜色跟着工作台的浅色 / 深色（base.css）。没有图标就用默认图标。
 */
export function PageIcon({ icon, slug, fallback = 'page' }: { icon?: string | null; slug?: string; fallback?: IconName }) {
  if (!icon) return <Icon name={fallback} />;
  // 网页链接里存的网站图标：data: 地址，直接显示（img 里的 SVG 不跑脚本）
  if (icon.startsWith('data:image/')) return <img className="page-icon site-icon" src={icon} alt="" draggable={false} />;
  // 别处的底稿（~ws-xxxxxx/<slug>）的图标只有表情和图标页签的，不是这个工作区的文件夹里的图
  const own = slug && !slug.startsWith('~') ? slug : undefined;
  const src = `/__gallery/edit/icon?${new URLSearchParams(own ? { value: icon, slug: own } : { value: icon })}`;
  if (icon.startsWith('/icons/')) return <span className="glyph-icon" data-icon={icon} style={{ WebkitMaskImage: `url("${src}")`, maskImage: `url("${src}")` }} />;
  return <img className="page-icon" src={src} alt="" draggable={false} />;
}
