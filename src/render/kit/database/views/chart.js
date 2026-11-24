// A chart of the records the view shows: a category per value of the view's column (`chart.x`: an option, a box
// checked or not, a date, words), each the count of its records or the sum or average of a number column
// (`chart.y`), drawn as columns, bars, a line or a donut in plain SVG, each category in its option's color (in turn
// where it has none), or, where the view says one of the nine (`chart.color`), each a shade of it (the line in its
// ink). A category under the pointer is lit (the others dimmed) and its numbers float by the pointer; a donut says the
// one under the pointer in its middle and lists them all beside it.
import { arc, chartData, niceTicks, shadeOf, shadeSteps, tickWords as fmtTick, valueWords } from "../data/chart.js";
import { optionOf } from "../data/values.js";
import { CHOCOLATE, colorStyle, SEQUENCE } from "../ui/colors.js";
import { h, kids } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { w } from "../words.js";

const NS = "http://www.w3.org/2000/svg";
const s = (tag, attrs = {}, ...children) => {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) if (value !== null && value !== undefined) node.setAttribute(name, String(value));
  for (const child of children) if (child !== null && child !== undefined) node.append(child);
  return node;
};
// An element worn in a category's ink (its fill, a swatch's), a CSS color.
const inked = (node, ink) => {
  node.style.setProperty("--db-ink", ink);
  return node;
};

/** The chart view of the store's database for `db`. */
export function createChart(store, db) {
  const element = h("div", { style: { display: "contents" } });
  let width = 0;
  let hover = null;
  let pointer = null; // where the pointer is over the chart (its numbers float there), relative to the chart
  let area = null;
  const shown = h("div", { class: "chart-view" }); // kept as the chart is drawn again: the pointer over it stays over it
  const sizes = new ResizeObserver(() => {
    if (!area) return;
    const next = Math.max(320, area.clientWidth);
    if (next !== width) {
      width = next;
      draw();
    }
  });

  function draw() {
    const view = db.view();
    const { rows } = store.rowsOf(view);
    const chart = view.chart || { kind: "column", x: null, agg: "count", y: null };
    const xp = chart.x ? store.byId[chart.x] : null;
    const yp = chart.y ? store.byId[chart.y] : null;
    if (!xp || (chart.agg !== "count" && !yp)) {
      area = null;
      element.replaceChildren(h("div", { class: "empty-state" }, icon("chart", 28), h("div", null, !xp ? w("选一个属性作为分类，就能画出图表") : w("选一个数字属性来统计")),
        h("button", { type: "button", class: "btn", on: { click: () => db.openSettings("chart") } }, w("设置图表"))));
      return;
    }
    const data = chartData(rows, chart, xp, yp, store.byId);
    // Each category's ink: a shade of the view's color, else its option's color (gray for none), else the colors in turn.
    // An option of brown or orange is drawn in the first of the colors in turn no other category's option has (purple
    // when all are taken): a chart's own colors never take them.
    const steps = chart.color ? shadeSteps(data.length) : null;
    const named = (each) => (xp.type === "select" || xp.type === "multi" ? optionOf(xp, each.raw)?.color : undefined);
    const taken = new Set(data.map(named));
    const stands = SEQUENCE.filter((name) => name !== "gray" && !taken.has(name));
    const standFor = new Map([...taken].filter((name) => CHOCOLATE.has(name)).map((name, at) => [name, stands[at] ?? "purple"]));
    const color = (each, at) => {
      const shade = steps ? shadeOf(chart.color, steps[at]) : null;
      if (shade) return shade;
      if (xp.type === "select" || xp.type === "multi") {
        const own = named(each);
        return colorStyle(!own || own === "default" ? "gray" : standFor.get(own) ?? own)["--db-ink"];
      }
      return colorStyle(SEQUENCE[at % SEQUENCE.length])["--db-ink"];
    };
    const fmt = valueWords(chart, yp);
    const max = Math.max(1e-9, ...data.map((each) => each.value));
    const total = data.reduce((sum, each) => sum + each.value, 0);
    const aggLabel = chart.agg === "count" ? w("记录数") : chart.agg === "sum" ? w("{0}之和", yp?.name || "?") : w("{0}平均值", yp?.name || "?");
    const caption = h("div", { class: "chart-caption" },
      h("span", null, h("b", null, aggLabel), ` · ${w("按{0}", xp.name)}`),
      h("span", { class: "muted" }, `${chart.agg === "avg" ? "" : w("合计 {0} · ", fmt(total))}${w("{0} 条记录，跟随当前筛选", rows.length)}`),
      h("span", { class: "grow" }),
      h("button", { type: "button", class: "btn ghost sm", on: { click: () => db.openSettings("chart") } }, icon("sliders", 14), w("编辑图表")));
    if (!data.length) {
      area = null;
      shown.replaceChildren(caption, h("div", { class: "empty-state sm" }, w("没有数据")));
      if (element.firstElementChild !== shown) element.replaceChildren(shown);
      return;
    }
    const box = area ?? h("div", { class: "chart-area" });
    if (box !== area) {
      area = box;
      box.addEventListener("mouseleave", () => {
        hover = null;
        pointer = null;
        draw();
      });
      sizes.disconnect();
      sizes.observe(box);
    }
    let tipNode = null;
    const marks = []; // each category's mark (dimmed while another is lit)
    const light = (at) => {
      hover = at;
      for (const [index, mark] of marks.entries()) mark?.classList.toggle("dim", at !== null && at !== index);
      if (chart.kind === "line") for (const [index, dot] of dots.entries()) dot.setAttribute("r", at === index ? 5 : 3.5);
      if (chart.kind === "donut") drawMiddle();
      for (const [index, row] of legendRows.entries()) row.classList.toggle("hi", at === index);
    };
    const tip = (at, event) => {
      tipNode?.remove();
      tipNode = null;
      if (event) {
        const r = box.getBoundingClientRect();
        pointer = { x: event.clientX - r.left, y: event.clientY - r.top };
      }
      if (at === null || chart.kind === "donut" || !data[at] || !pointer) return;
      const { x, y } = pointer;
      tipNode = h("div", { class: "chart-tip", style: { left: `${Math.min(x + 14, width - 160)}px`, top: `${y + 14}px` } },
        h("div", { class: "tip-k" }, inked(h("span", { class: "sw" }), color(data[at], at)), data[at].key),
        h("div", { class: "tip-v" }, w("{0}：", aggLabel), h("b", null, fmt(data[at].value))),
        total > 0 && chart.agg !== "avg" ? h("div", { class: "tip-v muted" }, w("占 {0}%", Math.round((data[at].value / total) * 100))) : null);
      box.append(tipNode);
    };
    const onTip = (at) => (event) => { tip(at, event); light(at); };
    const dots = [];
    const legendRows = [];
    let drawMiddle = () => {};
    const parts = [];
    if (width > 0 && (chart.kind === "column" || chart.kind === "line")) {
      const H = 320, pl = 44, pb = 34, pt = 24, pr = 12;
      const step = (width - pl - pr) / data.length;
      const bw = Math.max(8, Math.min(56, step * 0.56));
      const ticks = niceTicks(max);
      const top = ticks[ticks.length - 1];
      const yOf = (value) => pt + (H - pt - pb) * (1 - value / top);
      const showValues = data.length <= 14;
      const svg = s("svg", { width, height: H, class: "chart-svg", role: "img", "aria-label": aggLabel });
      // A line is one series: in the view's color's ink where it says one, else the accent.
      if (chart.kind === "line" && chart.color) svg.style.setProperty("--db-line", colorStyle(chart.color)["--db-ink"]);
      for (const t of ticks) svg.append(s("g", {}, s("line", { x1: pl, x2: width - pr, y1: yOf(t), y2: yOf(t), class: t === 0 ? "base-line" : "grid-line" }), s("text", { x: pl - 8, y: yOf(t) + 4, class: "axis", "text-anchor": "end" }, fmtTick(t))));
      if (chart.kind === "line") svg.append(s("polyline", { class: "line-path", points: data.map((each, at) => `${pl + step * at + step / 2},${yOf(each.value)}`).join(" ") }));
      data.forEach((each, at) => {
        const cx = pl + step * at + step / 2;
        const tall = Math.max(0, (H - pt - pb) * (each.value / top));
        const x = cx - bw / 2;
        const y0 = H - pb;
        const r = Math.min(4, tall, bw / 2);
        const path = tall <= 0 ? "" : `M${x},${y0} V${y0 - tall + r} Q${x},${y0 - tall} ${x + r},${y0 - tall} H${x + bw - r} Q${x + bw},${y0 - tall} ${x + bw},${y0 - tall + r} V${y0} Z`;
        const hit = s("rect", { x: pl + step * at, y: pt, width: step, height: H - pt - pb, fill: "transparent" });
        hit.addEventListener("mousemove", onTip(at));
        let mark = null;
        if (chart.kind === "column") {
          mark = inked(s("path", { d: path, class: `fill${hover !== null && hover !== at ? " dim" : ""}`, "pointer-events": "none" }), color(each, at));
        } else {
          mark = s("circle", { cx, cy: yOf(each.value), r: hover === at ? 5 : 3.5, class: "line-dot", "pointer-events": "none" });
          dots[at] = mark;
          mark = null;
        }
        marks[at] = mark;
        svg.append(s("g", {}, hit, mark ?? dots[at], showValues ? s("text", { x: cx, y: yOf(each.value) - 8, "text-anchor": "middle", class: "val" }, fmt(each.value)) : null, s("text", { x: cx, y: H - pb + 21, "text-anchor": "middle", class: "axis" }, each.key.length > 7 ? `${each.key.slice(0, 7)}…` : each.key)));
      });
      parts.push(svg);
    }
    if (width > 0 && chart.kind === "bar") {
      // Bars: the columns' grid lines, axes and values, lying down.
      const longest = Math.max(...data.map((each) => [...each.key].reduce((n, ch) => n + (ch.charCodeAt(0) > 255 ? 13 : 7.5), 0)));
      const pl = Math.round(Math.min(150, Math.max(48, longest + 16))), pr = 48, pt = 16, pb = 34;
      // As tall as the columns (320), taller for many categories; a bar as thick as a column, by the same share.
      const H = Math.max(320, pt + data.length * 28 + pb);
      const rowH = (H - pt - pb) / data.length;
      const bh = Math.max(8, Math.min(56, rowH * 0.56));
      const ticks = niceTicks(max);
      const top = ticks[ticks.length - 1];
      const xOf = (value) => pl + (width - pl - pr) * (value / top);
      const svg = s("svg", { width, height: H, class: "chart-svg", role: "img", "aria-label": aggLabel });
      for (const t of ticks) svg.append(s("g", {}, s("line", { y1: pt, y2: H - pb, x1: xOf(t), x2: xOf(t), class: t === 0 ? "base-line" : "grid-line" }), s("text", { x: xOf(t), y: H - pb + 21, class: "axis", "text-anchor": "middle" }, fmtTick(t))));
      data.forEach((each, at) => {
        const cy = pt + rowH * at + rowH / 2;
        const long = Math.max(0, xOf(each.value) - pl);
        const y = cy - bh / 2;
        const r = Math.min(4, long, bh / 2);
        const path = long <= 0 ? "" : `M${pl},${y} H${pl + long - r} Q${pl + long},${y} ${pl + long},${y + r} V${y + bh - r} Q${pl + long},${y + bh} ${pl + long - r},${y + bh} H${pl} Z`;
        const label = each.key.length > 9 ? `${each.key.slice(0, 9)}…` : each.key;
        const hit = s("rect", { x: 0, y: pt + rowH * at, width, height: rowH, fill: "transparent" });
        hit.addEventListener("mousemove", onTip(at));
        const mark = inked(s("path", { d: path, class: `fill${hover !== null && hover !== at ? " dim" : ""}`, "pointer-events": "none" }), color(each, at));
        marks[at] = mark;
        svg.append(s("g", {}, hit, s("text", { x: pl - 10, y: cy + 4, "text-anchor": "end", class: "axis cat" }, label), mark, s("text", { x: pl + long + 6, y: cy + 4, class: "val" }, fmt(each.value))));
      });
      parts.push(svg);
    }
    if (chart.kind === "donut") {
      const svg = s("svg", { viewBox: "-110 -110 220 220", class: "donut-svg" });
      let a0 = -Math.PI / 2;
      data.forEach((each, at) => {
        const frac = total ? each.value / total : 0;
        const a1 = a0 + frac * Math.PI * 2;
        const path = frac > 0 ? arc(a0, Math.max(a0, a1 - 0.01), 100, 64) : "";
        a0 = a1;
        const mark = inked(s("path", { d: path, class: `fill${hover !== null && hover !== at ? " dim" : ""}` }), color(each, at));
        mark.addEventListener("mouseenter", () => light(at));
        mark.addEventListener("mouseleave", () => light(null));
        marks[at] = mark;
        svg.append(mark);
      });
      const sum = s("text", { y: -2, "text-anchor": "middle", class: "donut-total" });
      const said = s("text", { y: 18, "text-anchor": "middle", class: "axis" });
      drawMiddle = () => {
        sum.textContent = hover !== null ? fmt(data[hover].value) : fmt(chart.agg === "avg" ? total / data.length : total);
        said.textContent = hover !== null ? data[hover].key : chart.agg === "avg" ? w("平均") : w("合计");
      };
      drawMiddle();
      svg.append(sum, said);
      const legend = h("div", { class: "legend" }, data.map((each, at) => {
        const row = h("div", { class: `legend-row${hover === at ? " hi" : ""}` },
          inked(h("span", { class: "sw" }), color(each, at)), h("span", { class: "legend-k" }, each.key),
          h("span", { class: "legend-v num" }, fmt(each.value)), chart.agg !== "avg" ? h("span", { class: "muted sm num" }, `${total ? Math.round((each.value / total) * 100) : 0}%`) : null);
        row.addEventListener("mouseenter", () => light(at));
        row.addEventListener("mouseleave", () => light(null));
        legendRows[at] = row;
        return row;
      }));
      parts.push(h("div", { class: "donut-wrap" }, svg, legend));
    }
    box.replaceChildren(...kids(parts));
    // The caption put in place of the last; the chart's area left where it is (the pointer over it stays over it).
    if (shown.firstElementChild?.classList.contains("chart-caption") && shown.lastElementChild === box) shown.firstElementChild.replaceWith(caption);
    else shown.replaceChildren(caption, box);
    if (element.firstElementChild !== shown) element.replaceChildren(shown);
    if (hover !== null && hover < data.length) tip(hover);
    // Its width measured before it draws (as it lays out), so that no frame is drawn at another width first.
    if (!width && box.isConnected) {
      width = Math.max(320, box.clientWidth);
      if (width) draw();
    }
  }

  return {
    element,
    update: () => draw(),
    destroy() { sizes.disconnect(); },
  };
}
