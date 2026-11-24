// A database as a team writes one, for the browser scenarios: the sample data of the block's design
// (产品迭代任务), 18 records of 14 columns (a url among them, two formulas, notes) and 7 views, its dates as
// written. Every url is a run of more than 20 characters with no break, and one record's notes hold a long
// word: the kit holds such runs whole in the page's text (runtime/spacing.js) and must leave a database alone.

const opt = (id, name, color, done) => ({ id, name, color, ...(done ? { done: true } : {}) });
const columns = [
  { id: "title", name: "任务", type: "title", width: 240 },
  { id: "status", name: "状态", type: "select", width: 120, options: [opt("s1", "待开始", "gray"), opt("s2", "进行中", "blue"), opt("s3", "评审中", "orange"), opt("s4", "已完成", "green", true)] },
  { id: "priority", name: "优先级", type: "select", width: 104, options: [opt("p0", "P0", "red"), opt("p1", "P1", "orange"), opt("p2", "P2", "gray")] },
  { id: "owner", name: "负责人", type: "select", width: 110, options: [opt("o1", "林夏", "blue"), opt("o2", "周舟", "brown"), opt("o3", "陈默", "green"), opt("o4", "苏禾", "yellow")] },
  { id: "tags", name: "标签", type: "multi", width: 170, options: [opt("t1", "前端", "blue"), opt("t2", "后端", "purple"), opt("t3", "设计", "pink"), opt("t4", "测试", "orange"), opt("t5", "文档", "gray")] },
  { id: "due", name: "截止日期", type: "date", width: 120 },
  { id: "est", name: "估时", type: "number", width: 90 },
  { id: "progress", name: "进度", type: "number", width: 150, numberFormat: { format: "percent", decimals: 0, display: "bar" } },
  { id: "value", name: "用户价值", type: "number", width: 120, numberFormat: { format: "number", decimals: 0, display: "stars" } },
  { id: "accepted", name: "已验收", type: "checkbox", width: 90 },
  { id: "link", name: "链接", type: "url", width: 180 },
  { id: "remain", name: "剩余工时", type: "formula", width: 110, formula: "ROUND({估时} * (1 - {进度}), 1)" },
  { id: "hint", name: "时间提示", type: "formula", width: 120, formula: 'IF({进度} >= 1, "已完成", IF({截止日期} = "", "未排期", IF(DAYS({截止日期}, TODAY()) < 0, "逾期 " & ABS(DAYS({截止日期}, TODAY())) & " 天", IF(DAYS({截止日期}, TODAY()) = 0, "今天到期", "剩 " & DAYS({截止日期}, TODAY()) & " 天"))))' },
  { id: "notes", name: "备注", type: "text", notes: true },
];

const raw = [
  ["登录页改版", "已完成", "P1", "林夏", ["前端", "设计"], "2026-11-12", 12, 1, 4, true, "https://example.com/spec/login"],
  ["数据表列类型识别", "进行中", "P0", "周舟", ["前端"], "2026-11-25", 24, 0.6, 5, false, "https://example.com/spec/infer", "粘贴后自动判断日期、数字列，保留 000123 这类编号。"],
  ["看板拖拽排序", "进行中", "P1", "林夏", ["前端"], "2026-11-28", 16, 0.4, 4, false, ""],
  ["导出 CSV", "评审中", "P2", "陈默", ["后端"], "2026-11-24", 6, 0.9, 3, false, "https://example.com/pr/218"],
  ["日历视图", "待开始", "P1", "苏禾", ["前端", "设计"], "2026-12-05", 20, 0, 4, false, ""],
  ["公式引擎", "进行中", "P0", "周舟", ["后端"], "2026-11-30", 30, 0.35, 5, false, "https://example.com/spec/formula", "只做四则运算与少量函数，不追求 Excel 兼容。"],
  ["权限说明文档", "待开始", "P2", "陈默", ["文档"], null, 4, 0, 2, false, ""],
  ["键盘导航", "已完成", "P0", "林夏", ["前端"], "2026-11-15", 10, 1, 5, true, ""],
  ["中文输入法回车问题", "评审中", "P0", "周舟", ["前端", "测试"], "2026-11-21", 5, 0.95, 5, false, "https://example.com/issue/342", "选字时按 Enter 不能提交单元格。"],
  ["分组折叠与小计", "待开始", "P1", "苏禾", ["前端"], "2026-12-02", 14, 0, 4, false, ""],
  ["筛选条件面板", "进行中", "P1", "陈默", ["前端", "设计"], "2026-11-27", 12, 0.5, 4, false, ""],
  ["大表虚拟滚动", "待开始", "P2", "周舟", ["前端"], null, 18, 0, 3, false, "", "先试 VirtualizedTableRowRendererWithoutAnyBreaks 的做法。"],
  ["卡片视图封面", "已完成", "P2", "苏禾", ["设计"], "2026-11-10", 8, 1, 3, true, ""],
  ["粘贴自动扩行", "评审中", "P1", "林夏", ["前端", "测试"], "2026-11-23", 6, 0.8, 4, false, ""],
  ["撤销重做", "已完成", "P0", "陈默", ["前端"], "2026-11-08", 9, 1, 5, true, ""],
  ["图表视图", "待开始", "P1", "苏禾", ["前端", "设计"], "2026-12-08", 16, 0, 3, false, ""],
  ["回归测试用例", "进行中", "P1", "陈默", ["测试"], "2026-11-29", 10, 0.3, 3, false, ""],
  ["使用说明 GettingStartedWithTheDatabaseBlockGuide", "待开始", "P2", "林夏", ["文档"], "2026-12-12", 5, 0, 2, false, ""],
];

const views = [
  { id: "v1", name: "全部任务", layout: "table", hidden: ["value", "accepted", "link", "remain"], filters: [{ id: "f1", prop: "status", op: "is", value: [], segments: true }], calc: { title: "count", est: "sum", progress: "avg" }, showCalc: true },
  { id: "v2", name: "推进看板", layout: "board", boardBy: "status", hidden: ["status", "tags", "est", "value", "accepted", "link", "remain", "hint"], sorts: [{ prop: "priority", dir: "asc" }] },
  { id: "v3", name: "按负责人", layout: "table", groupBy: "owner", hidden: ["owner", "tags", "value", "accepted", "link", "hint"], filters: [{ id: "f2", prop: "status", op: "isnot", value: ["已完成"] }], sorts: [{ prop: "priority", dir: "asc" }], calc: { est: "sum", remain: "sum" }, showCalc: true },
  { id: "v4", name: "日历", layout: "calendar", dateBy: "due", hidden: ["status", "priority", "owner", "tags", "due", "est", "progress", "value", "accepted", "link", "remain", "hint"] },
  { id: "v5", name: "工时统计", layout: "chart", chart: { kind: "column", x: "owner", agg: "sum", y: "est" } },
  { id: "v6", name: "清单", layout: "list", hidden: ["est", "progress", "value", "accepted", "link", "remain"] },
  { id: "v7", name: "卡片", layout: "gallery", cardSize: "m", hidden: ["accepted", "link", "remain", "hint"] },
];

const stored = columns.filter((column) => column.type !== "formula");
const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cell = (value) => `<td>${esc(value)}</td>`;
const rows = raw.map(([title, status, priority, owner, tags, due, est, progress, value, accepted, link, notes = ""]) => {
  const values = { title, status, priority, owner, tags: tags.join(", "), due: due ?? "", est, progress, value, accepted: accepted ? "✓" : "", link, notes };
  return `        <tr>${stored.map((column) => cell(values[column.id])).join("")}</tr>`;
});
const json = JSON.stringify({ columns, views }, null, 2).replace(/</g, "\\u003c").split("\n").map((line) => `      ${line}`).join("\n");

/** The database's markup, as an Agent writes it into a document's <main>. */
export const SAMPLE = `<div class="doc-database">
      <script type="application/json">
${json}
      </script>
      <table>
        <thead><tr>${stored.map((column) => `<th data-column="${column.id}">${esc(column.name)}</th>`).join("")}</tr></thead>
        <tbody>
${rows.join("\n")}
        </tbody>
      </table>
    </div>`;
