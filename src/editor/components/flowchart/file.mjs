import { FLOW, FLOW_DIRECTION, FLOW_RATIO } from "./index.mjs";
import { START, validDirection, validStart } from "../list/index.mjs";
import { sizeValue, TOGGLES } from "../registry.mjs";

// Flowcharts in report.html (the server's, source/): a flowchart made on the page is
// <ol class="doc-flow"> with its first number (start) and its direction (data-direction) when it
// has them, its steps one indentation step deeper; a step (a node) is <li> with its color (a class of
// the kit's), its weight in its row (style="--doc-flow-ratio: …") and its own direction when it
// has them, its blocks one step deeper again: its icon first when it has one, its title (a paragraph)
// and its content.

export default {
  flowchart: {
    check: (node) => (node.start === undefined || validStart(node.start)) && (node.direction === undefined || validDirection(node.direction))
      && node.children.length > 0,
    write: (node, w) => w.block(`<ol class="${FLOW}"${node.start ? ` ${START}="${node.start}"` : ""}${node.direction ? ` ${FLOW_DIRECTION}="${node.direction}"` : ""}${w.id}>`, w.children(w.inner), "</ol>"),
  },
  step: {
    // Its color one class of each family at most, those a step takes; its weight a share as a step's
    // style takes it; its direction row or column.
    check: (node) => (node.classes === undefined || (Array.isArray(node.classes) && new Set(node.classes).size === node.classes.length && node.classes.every((name) => (TOGGLES.step ?? []).includes(name))))
      && (node.ratio === undefined || sizeValue("step", FLOW_RATIO, node.ratio) === node.ratio)
      && (node.direction === undefined || validDirection(node.direction))
      && node.children.length > 0,
    write(node, w) {
      const classes = node.classes?.length ? ` class="${node.classes.join(" ")}"` : "";
      const direction = node.direction ? ` ${FLOW_DIRECTION}="${node.direction}"` : "";
      const style = node.ratio === undefined ? "" : ` style="${FLOW_RATIO}: ${node.ratio}"`;
      return w.block(`<li${classes}${direction}${style}${w.id}>`, w.children(w.inner), "</li>");
    },
  },
};
