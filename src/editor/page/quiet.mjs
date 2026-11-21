import { t } from "../../shared/i18n/index.mjs";

// What 减少通知 leaves out (the workbench's 设置: shared/preferences.mjs quietNotices; notices.mjs
// say() asks routine() of every notice but an error): the notices of the everyday operations, which
// a reader used to block editors knows without being told:
//   - what was just done, which the page shows: moved, deleted, pasted, turned into, inserted,
//     formatted, resized, colored, indented, folded… (every notice that offers Ctrl+Z is one);
//   - how to go on: a selection's keys, a drag's, the format the next letters take;
//   - a copy made with Ctrl+C, a save asked for with Ctrl+S (the page saves by itself), a drag or
//     a resize cancelled or ending where it began, and a key that had nothing to do (Tab on a list's
//     first item, Shift+Tab on its outermost, a block moved past the end of its row).
// What still shows is what the reader must act on or would not know otherwise: errors, a save that
// failed or is held, conflicts, text that could not be put back, something refused with the reason
// ("这里不能粘贴块。"), what an action did that the page does not show (a link copied from a menu, a
// web page that refused a frame shown as a bookmark, lines pasted into one, a detail card no longer
// kept, a page whose preview could not be read) and the result of a long one (an export done).
// Each is matched in the UI's language, its {0}… standing for anything.

// Notices that offer Ctrl+Z but say what the page does not show: they still show.
const TOLD = () => [
  t("入口已移除：页面上没有地方能打开这张详情卡片了 · Ctrl+Z 撤销"),
  `${t("暂不支持获取该网站的预览信息")}{0}`, // links/views.mjs UNREAD: the title or icon of a link left as its address
];

const ROUTINE = () => [
  t("{0} · Ctrl+Z 撤销"), // whatever was just done
  t("已新建分区 · 标题、分割线都可以按需加"),
  t("已复制 {0} · 在要放的块里按 Ctrl+V 粘贴到它后面"), t("已复制 {0} 格"),
  t("已保存"), t("标题已更新"),
  t("已取消调整"), t("已取消移动"), t("位置没有变化"),
  t("已选中 {0} 块 · Delete 删除 · 拖动手柄一起移动 · Esc 取消"), t("已选中{0} · Delete 删除{1} · Esc 取消"),
  t("已选中{0} · Delete 删除 · Esc 取消{1}"), t("已选中这一块的文字 · 再按 {0} 选中{1}"), t("已选中这一块的文字"), // Ctrl+A (select-all/)
  t("正在移动{0} · 拖到要放的位置后松开 · 停在选项卡上切换，停在折叠块标题上展开 · Esc 取消"),
  t("接着打的字：{0} · 再按一次取消"), t("接着打的字照旧"),
  t("链接：{0}"), t("链接已移除"),
  t("这一项上面没有同级的项，不能再缩进。"), t("这一项已经在最外层。"), t("选中的项上面没有同级的项，不能再缩进。"), t("选中的项已经在最外层。"),
  t("{0}已经在{1}。"), t("这里只有{0}；可以拖动手柄移到别处。"),
];

const patternOf = (said) => new RegExp(`^${said.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\{\d+\\\}/g, "[\\s\\S]*?")}$`);
let patterns = null;

/** Whether `text` (in the UI's language) is a routine notice, one 减少通知 leaves out. */
export function routine(text) {
  patterns ??= { told: TOLD().map(patternOf), routine: ROUTINE().map(patternOf) };
  return !patterns.told.some((pattern) => pattern.test(text)) && patterns.routine.some((pattern) => pattern.test(text));
}
