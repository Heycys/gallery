import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { routine } from "../../src/editor/page/quiet.mjs";
import { t } from "../../src/shared/i18n/index.mjs";

// 减少通知 (editor/page/quiet.mjs): which of the page's notices it leaves out. Each is written as its
// call site says it (through t(), so the check holds in either language of the UI).

const UNREAD = t("暂不支持获取该网站的预览信息");

const hidden = [
  // what was just done: it offers Ctrl+Z
  t("已移动{0} · Ctrl+Z 撤销", "段落"),
  t("已移动{0}{1}{2} · Ctrl+Z 撤销", t("{0} 块", 2), t("到上一项下面"), ""),
  t("已删除{0}{1}{2} · Ctrl+Z 撤销", "段落", "", ""),
  t("已粘贴 {0} · Ctrl+Z 撤销", t("{0} 块", 3)),
  t("已转换为{0} · Ctrl+Z 撤销", "标题 2"),
  t("{0} · Ctrl+Z 撤销", t("已插入{0}", "代码块")),
  t("{0} {1} 项 · Ctrl+Z 撤销", t("已缩进"), 2),
  t("{0} · 拖动栏间的竖线调宽度 · Ctrl+Z 撤销", t("已分成{0}栏", "两")),
  t("已调整{0}{1}：{2} · Ctrl+Z 撤销", t("表格"), t("宽度"), "640px"),
  t("{0} · Ctrl+Z 撤销", t("已转为网页书签")),
  t("已新建分区 · 标题、分割线都可以按需加"),
  // how to go on
  t("已选中 {0} 块 · Delete 删除 · 拖动手柄一起移动 · Esc 取消", 4),
  t("已选中{0} · Delete 删除{1} · Esc 取消", "列表项", t(" · Enter 编辑")),
  t("已选中{0} · Delete 删除 · Esc 取消{1}", t("{0}里的全部内容", "高亮块"), t(" · 再按 {0} 选中{1}", "Ctrl+A", t("整个页面"))),
  t("已选中{0} · Delete 删除 · Esc 取消{1}", t("整个页面"), ""),
  t("已选中这一块的文字 · 再按 {0} 选中{1}", "⌘A", t("这一栏里的全部内容")),
  t("正在移动{0} · 拖到要放的位置后松开 · 停在选项卡上切换，停在折叠块标题上展开 · Esc 取消", "段落"),
  t("接着打的字：{0} · 再按一次取消", "粗体"),
  t("链接：{0}", "https://example.com"),
  // a keyboard copy, a save asked for, nothing to do
  t("已复制 {0} · 在要放的块里按 Ctrl+V 粘贴到它后面", t("这一块")),
  t("已复制 {0} 格", 4),
  t("已保存"),
  t("标题已更新"),
  t("已取消移动"),
  t("位置没有变化"),
  t("这一项上面没有同级的项，不能再缩进。"),
  t("选中的项已经在最外层。"),
  t("{0}已经在{1}。", "段落", t("最前面")),
];

const shown = [
  // refused, with the reason
  t("这里不能粘贴块。"),
  t("这里放不下这些块。"),
  t("这一项下面还有子项，不能并入上一项。"),
  t("这一项下面还有内容，不能并入上一项。"),
  t("这一项下面还有内容；要连同这些内容一起删除，点左侧的手柄后按 Delete。"),
  t("表格至少要留一列。"),
  t("{0}不能分段或换行。", "标题"),
  // what the page does not show
  t("这里不能分段，多行文字已合并为一行。"),
  t("这个网页不允许嵌入，已改为网页书签。"),
  t("入口已移除：页面上没有地方能打开这张详情卡片了 · Ctrl+Z 撤销"),
  t("{0} · Ctrl+Z 撤销", `${UNREAD}，${t("标题用了网址的域名")}`),
  t("{0}。", [t("标题已更新"), t("搜索和侧栏里（没打开这份文档时）的文档名没能跟着改")].join(t("；"))),
  t("已自动合并 {0} 段 Agent 同时做的修改。", 2),
  t("已重新连上，修改已保存。"),
  t("页面的样式或编辑器已更新，刷新页面即可看到。"),
  // a copy made from a menu (a short notice says it), a long action's result
  t("已复制链接"),
  t("已将链接拷贝到剪贴板"),
  t("已复制"),
  t("正在导出…"),
  t("已导出 {0}", "exports/sample.html"),
  t("模板已保存"),
  // held, conflicts, what could not be put back
  t("其余修改已保存；红框处的冲突还没有保存。"),
  t("{0} 处修改和文件的最新版本冲突，没有保存：在左下方选择怎么处理。", 2),
  t("其余修改已保存；红框处的内容文档存不下，没有保存。"),
  t("{0} 处内容文档存不下，没有保存：在左下方选择怎么处理。", 2),
  t("有 {0} 处修改没能放回文件，列在右下方：复制保存好再标记处理完。", 1),
];

for (const text of hidden) assert.equal(routine(text), true, `left out with 减少通知: ${text}`);
for (const text of shown) assert.equal(routine(text), false, `shown with 减少通知: ${text}`);

console.log(`Checked 减少通知's notices: ${hidden.length} everyday ones left out (what was just done, how to go on, a keyboard copy, a save asked for, nothing to do), ${shown.length} still shown (refusals with their reason, what the page does not show, a copy from a menu, an export, held saves, conflicts, text not put back).`);
