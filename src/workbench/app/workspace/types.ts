/**
 * 工作台的领域模型。工作台里的“页面”= 一份报告（工作区里的 <slug>/）。
 * 报告正文完全归报告页自己的编辑器管理；工作台只管“有哪些报告、怎么组织、当前打开哪一份”。
 */

/** 一份报告（来自 doc.json，旧文档是 report.json） */
export interface Report {
  slug: string;
  title: string;
  description: string;
  type?: string;
  /** 页面图标：一个表情（report.json 的 icon，报告页标题上方的 .doc-icon） */
  icon?: string;
  /** 写作偏好：写给 Agent 的写作要求，只有一份；在「设置 › 写作偏好」里打开，不进目录，不能删除 */
  instructions?: boolean;
  /** 字体与布局（顶栏「更多」里选）：这份文档显示的样子，doc.json 的 look 一项项盖在工作区默认（gallery.json 的 look）上；默认的那几项不写，全是默认时没有 */
  look?: DocLook;
  /**
   * 网页链接（工作区的 <slug>/link.json，shared/web-links.mjs）：kind 是 link，url 是它的网址；文档没有这两项。
   * 别处的底稿（另一个工作区的文档，shared/drafts.mjs）：kind 是 draft，slug 是它在侧栏里的条目 ~ws-xxxxxx/<它的 slug>
   */
  kind?: 'link' | 'draft';
  url?: string;
  /** 网页链接：网站自己的图标（添加时取一次，存在 link.json 里的 data: 地址）；读者自己选了图标（icon）时用读者的 */
  siteIcon?: string;
  /** 别处的底稿所在工作区的 id（ws- 加 6 位十六进制） */
  workspace?: string;
  /** 别处的底稿：doc.html 的完整路径、它的文件夹、它所在工作区的路径（找不到它的工作区时没有） */
  path?: string;
  folder?: string;
  root?: string;
  /** 别处的底稿灰着显示的原因：workspace（登记表里没有它的工作区，或文件夹不在了）、ambiguous（两个工作区编号相同）、draft（底稿不在了） */
  missing?: 'workspace' | 'ambiguous' | 'draft';
}

/**
 * 别处的工作区（本机登记表里的，shared/drafts.mjs workspaceNames）：侧栏叫它的名字；above 是侧栏里两个按工作区起名的栏同名时补上的灰字
 * （上一级目录，或它的路径），upper 是它上一级目录的名字（和别种栏同名时补上）；路径；找不到时 missing
 */
export interface OtherWorkspace { name?: string; above?: string | null; upper?: string | null; root?: string; there?: boolean; missing?: 'unknown' | 'ambiguous'; default?: boolean; self?: boolean }

/** 添加其他 Gallery 项目… 的列表：本机登记过的别的工作区，和它里面的文档（按它自己侧栏的顺序，depth 是在那里的层级） */
export interface ProjectDocument { entry: string; slug: string; title: string; icon: string | null; path: string; depth: number }
export interface ProjectWorkspace { ws: string; root: string; name: string; above: string | null; documents: ProjectDocument[] }

/**
 * 侧栏的一栏（shared/outline-shape.mjs）：docs 是这个工作区自己的一栏（默认工作区的叫「默认文档」，别的叫工作区的名字），不能移除；
 * workspace 是本机登记过的别的工作区的一栏（读目录时自动有：picked 的只放挑进来的文档，否则放它的全部文档，left 里的除外：读者从文档树移除了的，
 * 是它们在那个工作区里的 slug；hidden 是读者从侧边栏移除了）；别的是读者新建的栏，或旧版自动建的「链接」栏（role links）。title 是读者起的名字，有就用它
 */
export interface Column { id: string; title?: string; role?: 'links'; workspace?: string; owner?: string; extension?: string; picked?: boolean; hidden?: boolean; left?: string[] }

/**
 * 扩展提供的栏里的一个条目（扩展的 sidebar.json，shared/extension-sidebar.mjs）：id 在扩展自己的文件里不重复；有 url 的点开在右边显示，
 * 没有 url 的只用来收下级（点它展开或收起）
 */
export interface ExtensionEntry { id: string; title: string; icon?: string; url?: string; children?: ExtensionEntry[] }
/**
 * 一个扩展提供的栏（工作区的 extensions/<id>/sidebar.json）：栏的名字、图标和条目都是扩展的；文件读不出来时 error 说原因（服务器的 said()：
 * message 是中文，text 和 values 是模板和它的值），条目是空的，栏里只显示一行
 */
/** 扩展的一栏：id 是它的来源，sidebar.json 的是扩展 id，扩展程序写的 columns/<栏目>.json 是「扩展 id:栏目」，带 owner（扩展 id）和 column（栏目 id） */
export interface ExtensionMeta { id: string; file?: string; revision?: string; title: string; icon?: string; entries: ExtensionEntry[]; count: number; error?: { message?: string; text?: string; values?: unknown[] }; owner?: string; column?: string }

/** 文档的字体与布局（src/shared/document-look.mjs）：字体、字体大小、正文间距、正文宽度，默认的那几项不写 */
export interface DocLook { font?: 'serif' | 'mixed'; size?: 'small' | 'large'; spacing?: 'compact' | 'loose'; width?: 'narrow' | 'wide'; full?: 'full'; tables?: 'wide' }

/** 自定义块的清单和内置块的名字：两种语言，界面用哪种显示哪种 */
export interface BothLanguages { zh: string; en: string }
/** 设置 › 组件列表里的一个自定义块（src/shared/component-catalog.mjs packageStates）；清单读不出来时 name、description、places、needs 为 null */
export interface PackageSetting {
  id: string;
  version: string | null;
  name: BothLanguages | null;
  description: BothLanguages | null;
  state: 'normal' | 'hidden' | 'disabled' | 'broken';
  /** 它自己没有加载的原因 */
  reason: BothLanguages | null;
  /** 有没有能用的模板：没有的，菜单放不进去 */
  template: boolean;
  /** 清单的 places：能放在文档里、自定义页上 */
  places: ('document' | 'page')[] | null;
  /** 清单的 needs：workspace、tables、net:<域名> */
  needs: string[] | null;
  hidden: boolean;
  shown: boolean;
  disabled: boolean;
  /** 总开关关着（gallery.json 的 components.unlisted；清单写了 listed: false 的块，没有写进 components.listed 就关着）：没有哪个菜单和卡片库提供它，已经写好的块照常显示 */
  unlisted: boolean;
  /** 清单的 listed：false 是 Gallery 默认不在菜单里提供、用户打开才有的块 */
  listedByDefault: boolean;
  /** 读者允许它访问的网站（needs 里 net: 的那些里允许了的，gallery.json 的 components.net）：全都允许了，「允许联网」才开着 */
  allowed: string[];
  /** 「在文档菜单里显示」开着没有（inDocumentMenus，不看停用） */
  menu: boolean;
  /** Gallery 自带的块：这份副本添加后改过，Gallery 有更新的版本（这里是它的版本号）也不会换上；其余是 null */
  newer: string | null;
  /** Gallery 自带的块：gallery block add 要写的名字（Gallery 风格的只写名字，别的包写 id） */
  addAs?: string;
  /** 它所在的块包（id 的 scope） */
  pack: string;
}
/** 设置 › 组件列表里的一个块包（shared/block-packs.mjs workspacePacks）：一个 scope，有 pack.json 的是装进来的或自带的，没有的就是工作区自己的块 */
export interface PackSetting {
  id: string;
  name: BothLanguages;
  description: BothLanguages | null;
  version: string | null;
  author: string | null;
  homepage: string | null;
  /** pack.json 写的表情或一两个字；没有就用自定义块的图标 */
  icon: string | null;
  /** default：默认块包（local/，Agent 没指定块包时块放在这里，总排第一）；official：Gallery 自带的；installed：装进来的；own：工作区里写的块（没有 pack.json） */
  kind: 'default' | 'official' | 'installed' | 'own';
  /** pack.json 读不出来的原因 */
  problem: BothLanguages | null;
  /** 有几个块 */
  blocks: number;
  /** 这个块包的开关（gallery.json 的 components.packs）：关着的包，它的块都不在菜单和卡片库里 */
  enabled: boolean;
  /** 装上后改过的块（和 pack.json） */
  changed: string[];
  /** Gallery 自带的包改过了，Gallery 又有了更新的版本：它的版本号；其余是 null */
  newer: string | null;
}
/** 设置 › 组件列表里的一个内置块（src/server/component-settings.mjs） */
export interface BlockSetting {
  id: string;
  name: BothLanguages;
  /** 它在 "/" 菜单里那一行的图标（SVG 字符串，服务器给的；分区是「组成新分区」那张） */
  icon: string;
  hidden: boolean;
  hideable: boolean;
}
export interface ComponentSettings {
  packages: PackageSetting[];
  packs: PackSetting[];
  /** 自定义块的图标（SVG 字符串，服务器给的：一张卡片，上面三条线；每个自定义块都用它） */
  packageIcon: string;
  blocks: BlockSetting[];
  /** gallery.json 读不出来的原因：有的话开关都按不动 */
  problem: BothLanguages | null;
}

/**
 * 目录：都只是报告的引用，不存正文。写作偏好那份不在目录里（WorkspaceState.instructions）。
 * - children：项目级结构（层级和顺序），存在工作区的 .gallery/outline.json。拖动报告不会移动磁盘上的目录。
 * - groups：侧栏的栏，顺序就是侧栏里的顺序，也存在 outline.json。
 * - favorites：这台浏览器自己的收藏，存在 localStorage；gallery favorite 和各个浏览器共用的那一份在 outline.json 的 favorites 里，读到时合并（shared/favorite-merge.mjs）。
 */
export interface WorkspaceMeta {
  /** key = 父条目 slug，一栏的顶层用它的顶层键（「文档」栏是 ROOT，也就是空字符串；别的栏是 ":<id>"）；value = 有序的子条目 slug */
  children: Record<string, string[]>;
  favorites: string[];
  groups: Column[];
}
export const ROOT = '';

/**
 * 自定义页（工作区的 pages/<slug>/，src/shared/pages.mjs）：Agent 写的页面（任意 HTML，卡片画布只是一种写法），在侧栏头部和「新建」「搜索」
 * 排在一起，地址 #@<slug>。标题、图标和下面两样来自它的 page.json；没有哪一页因为 slug 特殊（首页也是一样的页）
 */
export interface PageMeta {
  slug: string;
  title: string;
  icon: string | null;
  /** 有默认卡片（page.json 的 defaultCards，默认首页有）：菜单里有「恢复默认卡片」 */
  defaultCards?: boolean;
  /** 第一次打开时顶上有说明（page.json 的 hint） */
  hint?: boolean;
}

/** 回收区条目：服务器记下删除前在目录里的位置，恢复时放回原处；kind 是删掉的是文档、自定义页（不在目录里）还是网页链接 */
export interface TrashEntry {
  id: string;
  kind: 'document' | 'page' | 'link';
  slug: string;
  title: string;
  parent: string;
  index: number;
  at: number;
}
