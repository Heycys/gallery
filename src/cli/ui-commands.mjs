// 界面操作 → 命令 (since 2026-11-11): each item of the workbench's menus with
// the gallery command that does the same, through the same server function, or why no command is needed.
// tests/unit/ui-commands.mjs reads the menus of MENU_FILES (every `label: t('…')` there) and fails on an
// item this table does not name, on an item it names that no menu holds any more, and on a command whose
// usage (./usage.mjs) does not hold what `holds` says. A menu item added later comes with its command,
// or its line here saying why none, in the same change. Only the CLI's tests read this: no command does.

/** The workbench's files whose menus the table covers (dialogs' buttons, which confirm these, are not menus). */
export const MENU_FILES = [
  "src/workbench/app/features/sidebar/reportMenus.tsx",
  "src/workbench/app/features/sidebar/SidebarTree.tsx",
  "src/workbench/app/features/sidebar/SidebarExtension.tsx",
  "src/workbench/app/features/topbar/Topbar.tsx",
  "src/workbench/app/features/topbar/LookMenu.tsx",
  "src/workbench/app/features/annotate/AnnotateButton.tsx",
  "src/workbench/app/features/present/Presentation.tsx",
  "src/workbench/app/features/preferences/WritingPreferences.tsx",
  "src/workbench/app/state/theme.ts",
];

// Why an item needs no command, in a few words each.
const LOCAL = "浏览器本地的偏好：用户自己点一下就行";
const HANDOVER = "这是用户把东西交给 Agent 的方式：Agent 直接读文件";
const GROUP = "菜单里的分组标题，不是操作";
const VIEW = "只是界面上怎么显示，不改任何文件";
const LIVE = "演示时用户手上的工具";

/**
 * The table: `labels`, the menu items' words (as `t()` takes them); then `command` (its usage holds each
 * of `holds`, words of its synopsis or options), with `also` the other commands that do it for another kind
 * of entry (a page's, a link's, a column's), or `none` (why no command).
 */
export const UI_COMMANDS = [
  // A document, a draft, a page or a web link of the sidebar (reportMenus.tsx), and the topbar's 更多操作.
  { labels: ["移至回收区"], command: "trash", holds: ["gallery trash", "restore", "empty"], also: [{ command: "link", holds: ["gallery link remove"] }] },
  { labels: ["回收区"], command: "trash", holds: ["gallery trash list"] },
  { labels: ["创建副本"], command: "duplicate", holds: ["gallery duplicate"] },
  { labels: ["历史版本"], command: "history", holds: ["gallery history", "--restore", "--changes"] },
  { labels: ["移动到"], command: "move", holds: ["--under", "--column"] },
  { labels: ["重命名"], command: "set", holds: ["--title"], also: [{ command: "page", holds: ["gallery page set"] }, { command: "link", holds: ["gallery link set"] }, { command: "column", holds: ["rename"] }] },
  { labels: ["更换图标"], command: "set", holds: ["--icon"], also: [{ command: "page", holds: ["gallery page set", "--icon"] }, { command: "link", holds: ["gallery link set", "--icon"] }] },
  { labels: ["收藏", "取消收藏"], command: "favorite", holds: ["gallery favorite", "--off"] },
  // gallery export's --allow-images and --embeds-as-links are the command's alone, for a program that publishes the
  // offline file on another platform (skills/gallery/references/extensions.md): the dialog has neither, and its route widens nothing.
  // So is --original-images (the offline file's pictures as they are): the dialog's are always the copies the export
  // makes as light as the page needs (src/shared/export-pictures.mjs).
  { labels: ["导出"], command: "export", holds: ["--format", "pdf", "markdown"] },
  { labels: ["导入"], command: "import", holds: ["gallery import"] },
  { labels: ["演示视图"], command: "open", holds: ["--present"] },
  { labels: ["在新标签页打开"], command: "open", holds: ["gallery open"] },
  // 复制页面内容 is the page's Markdown as the export writes it: gallery read --format markdown prints the same (the page
  // blocks by the titles they show, the links as the file has them, not the server's addresses); an Agent reads the
  // default view instead, every block of the page with its line and id.
  { labels: ["复制页面内容"], command: "read", holds: ["gallery read", "--format", "markdown"] },
  { labels: ["复制本地路径", "复制网址"], none: HANDOVER },
  { labels: ["在文件夹中显示", "在浏览器中打开"], none: "打开用户电脑上的文件管理器或浏览器，给用户自己看的" },
  { labels: ["从文档树移除"], command: "workspaces", holds: ["--hide", "--doc"] },
  { labels: ["修改网址…"], command: "link", holds: ["gallery link set", "--url"] },
  { labels: ["新建页面"], command: "page", holds: ["gallery page new"] },
  { labels: ["添加自定义块"], command: "page", holds: ["gallery page add"] },
  { labels: ["恢复默认卡片"], command: "page", holds: ["gallery page reset-cards"] },
  { labels: ["删除页面", "删除分栏"], none: "拓展的栏和条目由它的 sidebar.json 定义：Agent 照 references/extensions.md 改那个文件" },
  { labels: ["写作偏好"], command: "preferences", holds: ["gallery preferences list"] },
  { labels: ["组件列表"], command: "block", holds: ["gallery block pack on", "gallery block menu on", "gallery block net on"] },
  // 拓展列表 holds each extension's switch and, on its detail, the switches of its own settings (extension.json's settings).
  { labels: ["拓展列表"], command: "extension", holds: ["gallery extension list", "gallery extension enable", "gallery extension settings <id> [<key>=<value>...]"] },
  { labels: ["开机自启动"], command: "startup", holds: ["enable", "disable"] },
  { labels: ["显示编辑框", "减少通知", "显示变更", "语言", "浅色", "深色"], none: LOCAL },
  { labels: ["文档", "自定义页", "网页链接", "扩展", "偏好", "功能"], none: GROUP },
  // The sidebar's columns (SidebarTree.tsx, SidebarExtension.tsx).
  { labels: ["添加在线网页…"], command: "link", holds: ["gallery link add"] },
  { labels: ["添加其他 Gallery 项目…"], command: "workspaces", holds: ["--show"] },
  { labels: ["新建栏"], command: "column", holds: ["gallery column new"] },
  { labels: ["从侧边栏移除"], command: "column", holds: ["gallery column remove"], also: [{ command: "workspaces", holds: ["--hide"] }] },
  { labels: ["全部折叠", "全部展开"], none: VIEW },
  // The topbar (Topbar.tsx) and 字体与布局 (LookMenu.tsx).
  { labels: ["字体与布局"], command: "set", holds: ["--font", "--size", "--spacing", "--width", "--all"] },
  { labels: ["等线体", "衬线体", "混合体"], command: "set", holds: ["--font", "sans", "serif", "mixed"] },
  { labels: ["小号", "大号"], command: "set", holds: ["--size", "small", "large"] },
  { labels: ["偏窄", "偏宽"], command: "set", holds: ["--width", "narrow", "wide"] },
  { labels: ["紧凑", "宽松"], command: "set", holds: ["--spacing", "compact", "loose"] },
  { labels: ["默认"], command: "set", holds: ["default"] },
  { labels: ["全宽"], command: "set", holds: ["--full"] },
  { labels: ["宽表格"], command: "set", holds: ["--wide-tables"] },
  { labels: ["目录"], none: "每篇的目录开关是读者在浏览器里的阅读偏好" },
  // 批注 (AnnotateButton.tsx).
  { labels: ["复制批注"], command: "notes", holds: ["gallery notes"] },
  { labels: ["全部删除"], command: "notes", holds: ["remove", "--all"] },
  { labels: ["删除已处理"], command: "notes", holds: ["remove", "--done"] },
  { labels: ["还没有批注。选中文字或点块右边的按钮来写"], none: "没有批注时的提示，不是操作" },
  // 演示 (Presentation.tsx).
  { labels: ["指针", "激光笔", "画笔", "荧光笔", "橡皮擦"], none: LIVE },
  // 写作偏好's own list (WritingPreferences.tsx): the files under <home>/preferences/.
  { labels: ["删除", "取消"], none: "写作偏好文件的删除确认：偏好是文件，用户要求时 Agent 照 gallery preferences 的说明改文件" },
  { labels: ["中文示例", "English example"], none: "写作偏好第一次打开时说明卡片里的两个示例（卡片的 × 只是关掉说明）：示例是包里的 Markdown（assets/preference-examples/），用户要时 Agent 照 references/preference-files.md 直接写一份偏好文件" },
  { labels: ["继续编辑", "不保存", "保存并关闭"], none: "写作偏好弹窗关闭前的确认（有没保存的修改时）：只管用户在浏览器里改到一半的内容，Agent 直接改偏好文件，不经过这个弹窗" },
];

/**
 * The menu items of `text` (a file of MENU_FILES): each t('…') a `label:` gives (both of a `label: a ? t('x')
 * : t('y')`), read from the label up to the item's next key (tip, icon, onSelect…) or the line's end. A label is the
 * words a reader reads: the @context an English key may carry (文档@doc) is left off, as t() leaves it off.
 */
export function menuLabels(text) {
  const labels = new Set();
  for (const [, value] of text.matchAll(/\blabel:\s*([^\n]*?)(?=,\s*(?:tip|icon|onSelect|danger|disabled|hint|shortcut|checked|keep|sub|children|items|id|value|primary)\s*:|\s*}|$)/gm)) {
    for (const [, words] of value.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)+)'/g)) labels.add(words.replace(/@[a-z]+$/, ""));
  }
  return labels;
}
