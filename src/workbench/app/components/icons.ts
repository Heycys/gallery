/** 自绘图标：20×20 或 16×16 viewBox，描边 currentColor；`class="lu"` 的几枚是 Lucide 的（取自 lucide-react 1.67.0，24 格，线宽 1.75 由 base.css `svg.lu` 给；许可见 src/shared/emoji/data/LICENSE-lucide.txt） */
const globe = '<svg viewBox="0 0 24 24" class="lu"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>';

export const ICONS = {
  // 拓展（设置菜单的「拓展列表」、拓展列表里没有自己图标的拓展）：一个插头（2026-11-17 用户选的，20 格）
  puzzle: '<svg viewBox="0 0 20 20"><path d="M7.5 3.5V7M12.5 3.5V7M5.5 7h9v2.5a4.5 4.5 0 0 1-9 0zM10 14v2.5"/></svg>',
  power: '<svg viewBox="0 0 24 24" class="lu"><path d="M12 2v10"/><path d="M18.4 5.6a9 9 0 1 1-12.8 0"/></svg>',
  // —— 通用 ——
  // 侧栏：收起、展开它的按钮（侧栏第一行最左、侧栏收起后顶栏最左、网页上浮着的圆按钮），移动到里的栏也是它：自绘，20 格
  // （2026-11-17 用户定的；原来是 Lucide 的 panel-left）
  sidebar: '<svg viewBox="0 0 20 20"><rect x="2.75" y="4.25" width="14.5" height="11.5" rx="3"/><path d="M7.9 4.25v11.5"/></svg>',
  // 侧栏第一行右端的「新建」：自绘，20 格（同上）；菜单里的「新建页面」还是下面 Lucide 的 compose
  composeNew: '<svg viewBox="0 0 20 20"><path d="M9.75 4.5H6.5a2.75 2.75 0 0 0-2.75 2.75v6.25a2.75 2.75 0 0 0 2.75 2.75h6.25a2.75 2.75 0 0 0 2.75-2.75v-3.25"/><path d="M14.72 3.72a1.33 1.33 0 0 1 1.88 1.88l-5.9 5.9-2.45.57.57-2.45 5.9-5.9z"/></svg>',
  compose:'<svg viewBox="0 0 24 24" class="lu"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/></svg>',
  // 自定义页（侧栏「新建」「搜索」下面那几行）：首页是一座房子（Lucide 的 house），别的页是一块看板（Lucide 的 layout-dashboard）
  home: '<svg viewBox="0 0 24 24" class="lu"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  board: '<svg viewBox="0 0 24 24" class="lu"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>',
  // 网页链接（侧栏里没有图标的链接、「在浏览器中打开」）：Lucide 的 globe；新建栏：Lucide 的 list-plus
  web: globe,
  columnAdd: '<svg viewBox="0 0 24 24" class="lu"><path d="M11 12H3"/><path d="M16 6H3"/><path d="M16 18H3"/><path d="M18 9v6"/><path d="M21 12h-6"/></svg>',
  // 复制本地路径（一份文档的）：Lucide 的 file-code；在文件夹中显示：Lucide 的 folder-open；
  // 复制本地路径（一栏的）、添加其他 Gallery 项目…里的工作区：Lucide 的 folder（合着的，和同一个菜单里「在文件夹中显示」的开着的文件夹分得开）
  folderClosed: '<svg viewBox="0 0 24 24" class="lu"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.68-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
  fileCode: '<svg viewBox="0 0 24 24" class="lu"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 12.5 8 15l2 2.5"/><path d="m14 12.5 2 2.5-2 2.5"/></svg>',
  // 添加其他 Gallery 项目…：一个文件夹，右下角一个加号（自绘，20 格）；和「复制本地路径」的文件图标分得开
  folderAdd: '<svg viewBox="0 0 20 20"><path d="M10 15.75H4.75a1.5 1.5 0 0 1-1.5-1.5V5.75a1.5 1.5 0 0 1 1.5-1.5h3.19a1.5 1.5 0 0 1 1.1.48l.84.92a1.5 1.5 0 0 0 1.1.48h4.27a1.5 1.5 0 0 1 1.5 1.5V9"/><path d="M15 12v5M12.5 14.5h5"/></svg>',
  folder: '<svg viewBox="0 0 24 24" class="lu"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>',
  page: '<svg viewBox="0 0 24 24" class="lu page-outline"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/></svg>',
  chevron: '<svg viewBox="0 0 16 16"><path d="m6.25 4.25 3.75 3.75-3.75 3.75"/></svg>',
  chevronDown: '<svg viewBox="0 0 16 16"><path d="m4.25 6.25 3.75 3.75 3.75-3.75"/></svg>',
  // 下拉选择的值后面（导出对话框的「导出格式」这类）：上下两个小箭头（自绘，16 格）
  selectArrows: '<svg viewBox="0 0 16 16"><path d="M5.25 6.25 8 3.5l2.75 2.75M5.25 9.75 8 12.5l2.75-2.75"/></svg>',
  plus: '<svg viewBox="0 0 16 16"><path d="M8 3.25v9.5M3.25 8h9.5"/></svg>',
  plusLg: '<svg viewBox="0 0 20 20"><path d="M10 4.25v11.5M4.25 10h11.5"/></svg>',
  more: '<svg viewBox="0 0 16 16" class="fill"><circle cx="3.25" cy="8" r="1.25"/><circle cx="8" cy="8" r="1.25"/><circle cx="12.75" cy="8" r="1.25"/></svg>',
  moreLg: '<svg viewBox="0 0 20 20" class="fill"><circle cx="4.5" cy="10" r="1.4"/><circle cx="10" cy="10" r="1.4"/><circle cx="15.5" cy="10" r="1.4"/></svg>',
  handle: '<svg viewBox="0 0 20 20" class="fill"><circle cx="7.5" cy="4" r="1.25"/><circle cx="12.5" cy="4" r="1.25"/><circle cx="7.5" cy="10" r="1.25"/><circle cx="12.5" cy="10" r="1.25"/><circle cx="7.5" cy="16" r="1.25"/><circle cx="12.5" cy="16" r="1.25"/></svg>',
  star: '<svg viewBox="0 0 20 20"><path d="m10 3.1 2.1 4.3 4.7.68-3.4 3.3.8 4.7L10 13.87 5.8 16.08l.8-4.7-3.4-3.3 4.7-.68z"/></svg>',
  starFill: '<svg viewBox="0 0 20 20" class="solid"><path d="m10 3.1 2.1 4.3 4.7.68-3.4 3.3.8 4.7L10 13.87 5.8 16.08l.8-4.7-3.4-3.3 4.7-.68z"/></svg>',
  // 批注（工作台顶栏的按钮）：线条的对话气泡（圆的，左下角是个稍圆的直角），里面两行字（上长下短），和 ☆ 一样粗（报告页的标记是同一个气泡，实心的：editor/page/annotate/card.mjs）
  annotate: '<svg viewBox="0 0 20 20"><path d="M10 16.75A6.75 6.75 0 1 0 3.25 10v5.25a1.5 1.5 0 0 0 1.5 1.5z"/><path d="M7.5 9h5.5M7.5 12h3.5"/></svg>',
  starOff: '<svg viewBox="0 0 20 20"><path d="m10 3.1 2.1 4.3 4.7.68-3.4 3.3.8 4.7L10 13.87 5.8 16.08l.8-4.7-3.4-3.3 4.7-.68z"/><path d="M3.5 3.5l13 13"/></svg>',
  link: '<svg viewBox="0 0 20 20"><g transform="rotate(45 10 10)"><path d="M7 8.5V6a3 3 0 0 1 6 0v2.5M7 11.5V14a3 3 0 0 0 6 0v-2.5M10 7.5v5"/></g></svg>',
  trash: '<svg viewBox="0 0 24 24" class="lu"><path d="M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M5 6l1 13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-13"/></svg>',
  // 复制（复制页面内容、复制网址、复制批注）：两张叠着的纸；创建副本是另一枚（右下那张上一个加号，2026-11-17 用户选的）
  copy: '<svg viewBox="0 0 20 20"><rect x="6.75" y="6.75" width="9.5" height="9.5" rx="1.75"/><path d="M13.25 6.75v-1.5a1.5 1.5 0 0 0-1.5-1.5h-6.5a1.5 1.5 0 0 0-1.5 1.5v6.5a1.5 1.5 0 0 0 1.5 1.5h1.5"/></svg>',
  duplicate: '<svg viewBox="0 0 20 20"><rect x="6.75" y="6.75" width="10" height="10" rx="2.5"/><path d="M13.25 4.6a2.25 2.25 0 0 0-2-1.35H5.5A2.25 2.25 0 0 0 3.25 5.5v5.75c0 .9.55 1.7 1.35 2"/><path d="M11.75 9.5v4.5M9.5 11.75H14"/></svg>',
  rename: '<svg viewBox="0 0 20 20"><path d="M12.6 4.4a1.7 1.7 0 0 1 2.4 2.4l-7.6 7.6-3.15.75.75-3.15z"/><path d="m11.25 5.75 2.4 2.4"/></svg>',
  // 移动到：一个文件夹（自绘）；历史版本：一只钟（同上）
  moveTo: '<svg viewBox="0 0 20 20"><path d="M2.75 6.25a2 2 0 0 1 2-2h2.7c.5 0 1 .2 1.36.55L9.88 5.85h5.37a2 2 0 0 1 2 2V14a2 2 0 0 1-2 2H4.75a2 2 0 0 1-2-2V6.25z"/></svg>',
  restore: '<svg viewBox="0 0 20 20"><path d="M4.6 8.25A5.75 5.75 0 1 1 5.9 14"/><path d="M4.25 4.5v3.9h3.9"/></svg>',
  history: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="6.75"/><path d="M10 6.25V10l2.6 1.6"/></svg>',
  sun: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="3.25"/><path d="M10 2.75v1.5M10 15.75v1.5M2.75 10h1.5M15.75 10h1.5M4.87 4.87l1.06 1.06M14.07 14.07l1.06 1.06M4.87 15.13l1.06-1.06M14.07 5.93l1.06-1.06"/></svg>',
  moon: '<svg viewBox="0 0 20 20"><path d="M15.9 12.2A6.5 6.5 0 0 1 7.8 4.1a6.5 6.5 0 1 0 8.1 8.1z"/></svg>',
  external: '<svg viewBox="0 0 20 20"><path d="M11.5 3.75h4.75V8.5M16 4 9.5 10.5"/><path d="M14.25 11.5v3a1.75 1.75 0 0 1-1.75 1.75h-7A1.75 1.75 0 0 1 3.75 14.5v-7A1.75 1.75 0 0 1 5.5 5.75h3"/></svg>',
  // 导入、导出：箭头进出一只托盘（自绘，20 格）
  importIn: '<svg viewBox="0 0 20 20"><path d="M10 3.5V12M7.3 9.4 10 12.1l2.7-2.7"/><path d="M4.5 12.5V15A1.5 1.5 0 0 0 6 16.5h8a1.5 1.5 0 0 0 1.5-1.5v-2.5"/></svg>',
  exportOut: '<svg viewBox="0 0 20 20"><path d="M6.75 8.5H6A1.5 1.5 0 0 0 4.5 10v5A1.5 1.5 0 0 0 6 16.5h8a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 14 8.5h-.75"/><path d="M10 12V3.6M7.3 6.2 10 3.5l2.7 2.7"/></svg>',
  upload: '<svg viewBox="0 0 20 20"><path d="M10 12.75v-9M6.25 7.5 10 3.75l3.75 3.75"/><path d="M3.75 12.5v2.25c0 .83.67 1.5 1.5 1.5h9.5c.83 0 1.5-.67 1.5-1.5V12.5"/></svg>',
  // 设置：Lucide 的 settings（六齿齿轮外圈 + 内圆，线条），和上面 class="lu" 的几枚同一版
  settings: '<svg viewBox="0 0 24 24" class="lu"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></svg>',
  // 写作偏好：三行字和一支笔（自绘，20 格）
  guide: '<svg viewBox="0 0 20 20"><path d="M4 5.5h8.5M4 9.5h5M4 13.5h3"/><path d="M14.7 8.9a1.2 1.2 0 0 1 1.7 1.7l-4.9 4.9-2.1.4.4-2.1z"/></svg>',
  blocks: '<svg viewBox="0 0 24 24" class="lu"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  language: globe,
  frame: '<svg viewBox="0 0 24 24" class="lu"><rect x="3" y="4" width="18" height="16" rx="3" stroke-dasharray="3.6 3"/></svg>',
  bell: '<svg viewBox="0 0 24 24" class="lu"><path d="M6 16V9a6 6 0 0 1 12 0v7l2 2H4z"/><path d="M10 22h4"/></svg>',
  // 显示变更：上方加号、下方减号，与设置中的其他图标共用 24 格和细线规格。
  diff: '<svg viewBox="0 0 24 24" class="lu"><path d="M12 3v12M5 9h14M5 21h14"/></svg>',
  // 目录（更多操作里的开关）：三条线，下面两条缩进，同报告页目录收成窄条、没有标题时的图标（editor/page/outline/strip.mjs）
  outline: '<svg viewBox="0 0 20 20"><path d="M3.75 5.25h12.5M7.25 10h9M7.25 14.75h9"/></svg>',
  // 全宽（更多里目录下面的开关）：两个箭头向两边（和报告页显示菜单里的全宽显示一样的图）
  fullWidth: '<svg viewBox="0 0 20 20"><path d="M3 10h14M6 7l-3 3 3 3M14 7l3 3-3 3"/></svg>',
  // 宽表格（更多里全宽下面的开关）：一张表格横过上下两段短竖线（正文的左右边），和报告页显示菜单里的同一项一样的图（自绘，20 格）
  wideTables: '<svg viewBox="0 0 20 20"><rect x="2.75" y="6.25" width="14.5" height="7.5" rx="1.5"/><path d="M2.75 10h14.5M10 6.25v7.5M6.25 2.75v2M13.75 2.75v2M6.25 15.25v2M13.75 15.25v2"/></svg>',
  download: '<svg viewBox="0 0 20 20"><path d="M10 3.75v9M6.25 9.25 10 13l3.75-3.75"/><path d="M3.75 13.5v1.25c0 .83.67 1.5 1.5 1.5h9.5c.83 0 1.5-.67 1.5-1.5V13.5"/></svg>',
  save: '<svg viewBox="0 0 20 20"><path d="M4.75 3.75h8.5l3 3v8.5a1 1 0 0 1-1 1h-10.5a1 1 0 0 1-1-1v-10.5a1 1 0 0 1 1-1z"/><path d="M7 3.75v3.5h5.5v-3.5M6.75 16.25v-4.5h6.5v4.5"/></svg>',
  smile: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="6.75"/><path d="M7.5 11.75c.6.8 1.5 1.25 2.5 1.25s1.9-.45 2.5-1.25"/><path d="M7.75 8.25v.5M12.25 8.25v.5"/></svg>',
  search: '<svg viewBox="0 0 24 24" class="lu"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>',
  check: '<svg viewBox="0 0 16 16"><path d="m3.5 8.5 3 3 6-7"/></svg>',
  collapseAll: '<svg viewBox="0 0 20 20"><path d="M6.5 4.5 10 8l3.5-3.5M6.5 15.5 10 12l3.5 3.5"/></svg>',
  expandAll: '<svg viewBox="0 0 20 20"><path d="M6.5 7.5 10 4l3.5 3.5M6.5 12.5 10 16l3.5-3.5"/></svg>',
  tri: '<svg viewBox="0 0 12 12" class="fill"><path d="M4 2.2 9 6l-5 3.8z"/></svg>',
  // —— 块菜单 ——
  convert: '<svg viewBox="0 0 20 20"><path d="M4.25 8.5V6.5c0-.97.78-1.75 1.75-1.75h9.25"/><path d="m13 2.5 2.25 2.25L13 7"/><path d="M15.75 11.5v2c0 .97-.78 1.75-1.75 1.75H4.75"/><path d="M7 13l-2.25 2.25L7 17.5"/></svg>',
  color: '<svg viewBox="0 0 20 20"><rect x="3.5" y="3" width="11" height="4.75" rx="1.25"/><path d="M14.5 5.4h1.25c.41 0 .75.34.75.75v2.6c0 .41-.34.75-.75.75H10v2.25"/><rect x="8.75" y="11.75" width="2.5" height="5.5" rx=".9"/></svg>',
  suggest: '<svg viewBox="0 0 20 20"><path d="M16.25 10.5v3.25c0 .83-.67 1.5-1.5 1.5H8.5l-3.75 2.5v-2.5c-.83 0-1.5-.67-1.5-1.5v-8c0-.83.67-1.5 1.5-1.5h5"/><path d="m14.4 2.6 2.5 2.5-5.4 5.4-3.1.6.6-3.1z"/></svg>',
  ai: '<svg viewBox="0 0 20 20"><path d="M9 3c.55 3.4 2.35 5.2 5.75 5.75C11.35 9.3 9.55 11.1 9 14.5 8.45 11.1 6.65 9.3 3.25 8.75 6.65 8.2 8.45 6.4 9 3z"/><path d="M15.25 12.5v4.5M13 14.75h4.5"/></svg>',
  // —— 块类型 ——
  tText: '<svg viewBox="0 0 20 20"><path d="M5 5h10M10 5v10.5"/></svg>',
  tPage: '<svg viewBox="0 0 20 20"><path d="M5.75 2.75h5.5l3.5 3.5v9.5a1.5 1.5 0 0 1-1.5 1.5h-7.5a1.5 1.5 0 0 1-1.5-1.5V4.25a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M11 2.75v3c0 .41.34.75.75.75h3"/></svg>',
  tPageIn: '<svg viewBox="0 0 20 20"><path d="M9.75 17.25h-4a1.5 1.5 0 0 1-1.5-1.5V4.25a1.5 1.5 0 0 1 1.5-1.5h5l3.5 3.5v3.5"/><path d="M10.5 2.75v3c0 .41.34.75.75.75h3"/><path d="M12 14.75h5M14.75 12.5 17 14.75 14.75 17"/></svg>',
  tBullet: '<svg viewBox="0 0 20 20"><path d="M8.25 6.5h8.5M8.25 13.5h8.5"/><circle cx="4.5" cy="6.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="13.5" r="1.1" fill="currentColor" stroke="none"/></svg>',
  tNumber: '<svg viewBox="0 0 20 20"><path d="M8.75 6.5h8M8.75 14h8"/><path d="M3.6 4.4 4.7 3.8V8" stroke-width="1.2"/><path d="M3.4 12.2a1.1 1.1 0 0 1 2.1.4c0 .8-2.1 1.8-2.1 3h2.2" stroke-width="1.2"/></svg>',
  tTodo: '<svg viewBox="0 0 20 20"><path d="m3.25 6.25 1.5 1.5 2.5-3"/><rect x="3.25" y="11.75" width="4" height="4" rx=".9"/><path d="M9.75 6.25h7M9.75 13.75h7"/></svg>',
  tToggle: '<svg viewBox="0 0 20 20"><path d="M3.5 4.25 6.75 6.5 3.5 8.75z" fill="currentColor" stroke="none"/><path d="M3.5 11.25l3.25 2.25-3.25 2.25z" fill="currentColor" stroke="none"/><path d="M9.5 6.5h7.25M9.5 13.5h7.25"/></svg>',
  tCode: '<svg viewBox="0 0 20 20"><path d="M6.75 6 2.75 10l4 4M13.25 6l4 4-4 4M11.25 4.25l-2.5 11.5"/></svg>',
  tCallout: '<svg viewBox="0 0 20 20"><rect x="3.25" y="3.25" width="13.5" height="13.5" rx="2.5"/><path d="M7 7.25h6M10 7.25v5.75"/></svg>',
  tEquation: '<svg viewBox="0 0 20 20"><rect x="3.25" y="3.25" width="13.5" height="13.5" rx="2.5"/><path d="M13 6.75H7.5l2.75 3.25L7.5 13.25H13"/></svg>',
  tSynced: '<svg viewBox="0 0 20 20"><path d="M3.25 5.25h10M3.25 9.25h5"/><path d="M16.75 13.25a3.25 3.25 0 0 0-5.9-1.4"/><path d="M10.5 15.25a3.25 3.25 0 0 0 5.9 1.4"/><path d="M10.6 9.9v2.1h2.1M16.65 18.6v-2.1h-2.1"/></svg>',
  // 字体与布局（顶栏「更多」）：一大一小两个字母 “Aa”，和别的自绘图标一样的线
  textFormat: '<svg viewBox="0 0 20 20"><path d="M2.75 15.5 6.6 4.75h.8l3.85 10.75M4.1 11.75h5.8"/><circle cx="14.6" cy="12.75" r="2.6"/><path d="M17.2 9.9v5.6"/></svg>',
  present: '<svg viewBox="0 0 20 20"><rect x="2.75" y="3.25" width="14.5" height="9.5" rx="1.5"/><path d="M10 12.75v2.5M6.75 17l3.25-1.75L13.25 17"/><path d="m8.5 6.25 3 1.75-3 1.75z" fill="currentColor" stroke="none"/></svg>',
  pointer: '<svg viewBox="0 0 20 20"><path d="M5.4 4.3c-.1-.7.6-1.1 1.2-.8l8.5 5.2c.6.4.5 1.3-.2 1.4l-3.3.6c-.3.1-.6.3-.7.6l-1.5 3.1c-.3.7-1.3.6-1.4-.1z"/></svg>',
  minus: '<svg viewBox="0 0 16 16"><path d="M3.25 8h9.5"/></svg>',
  laser: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="2.5" fill="currentColor" stroke="none"/><path d="M10 3v2M10 15v2M3 10h2M15 10h2M5.05 5.05l1.4 1.4M13.55 13.55l1.4 1.4M5.05 14.95l1.4-1.4M13.55 6.45l1.4-1.4"/></svg>',
  pen: '<svg viewBox="0 0 20 20"><path d="M12.75 4.25 15.75 7.25 7.5 15.5l-3.75.75.75-3.75z"/><path d="m11 6 3 3"/></svg>',
  marker: '<svg viewBox="0 0 20 20"><path d="m11.25 4 4.75 4.75-6.5 6.5H7.25l-1.5-1.5v-2.25z"/><path d="M5.75 13.75 3.75 16.25h4"/><path d="m9.25 6 4.75 4.75"/></svg>',
  eraser: '<svg viewBox="0 0 20 20"><path d="M8.25 16.25 3.75 11.75a1.5 1.5 0 0 1 0-2.1l6-6a1.5 1.5 0 0 1 2.1 0l4.5 4.5a1.5 1.5 0 0 1 0 2.1l-6.15 6z"/><path d="M8.25 16.25h8M6.5 7l6.5 6.5"/></svg>',
  chevronUp: '<svg viewBox="0 0 16 16"><path d="m4.25 9.75 3.75-3.75 3.75 3.75"/></svg>',
  close: '<svg viewBox="0 0 20 20"><path d="m5.5 5.5 9 9M14.5 5.5l-9 9"/></svg>',
} as const;

export type IconName = keyof typeof ICONS;
