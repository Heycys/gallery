import { attributesText } from "../../source/text.mjs";
import { CONTINUE, START, validStart } from "./index.mjs";

// Lists in report.html (the server's, source/): a list made on the page is <ul> or <ol> with its
// items, a numbered one with its first number (start) and whether it counts on from the one before
// it (data-continue); an item that holds blocks (lists, a paragraph, an image…) is written <li>text
// (with its color, as any item) followed by them, one indentation step deeper (an item in the file that sits on one line gets them on
// lines of their own below its text, itemIndent in source/). Turning a list into the other kind of list rewrites only its two
// tag names (retagUnit in source/) and switches its class (a to-do's). A flowchart is
// components/flowchart/file.mjs's.

export default {
  item: {
    // The blocks an item holds after its text: at least one, each one its box takes (registry.mjs accepts "nest").
    children: (node, checkNode) => node.children.length > 0 && node.children.every((child) => checkNode(child, "nest")),
    // An item and the blocks it holds: its color (its classes) and its attributes (a to-do item
    // checked or not), both checked by the caller, as an item holding none has them (leafHtml): an
    // item made of a colored node keeps its color whatever it holds.
    write: (node, w) => w.block(`<li${node.classes?.length ? ` class="${node.classes.join(" ")}"` : ""}${attributesText(node.attributes)}${w.id}>${node.html}`, w.children(w.inner), "</li>"),
  },
  numbers: {
    check: (node) => (node.start === undefined || validStart(node.start)) && (node.continue === undefined || node.continue === true),
    write: (node, w) => w.block(`<ol${node.start ? ` ${START}="${node.start}"` : ""}${node.continue ? ` ${CONTINUE}` : ""}${w.id}>`, w.children(w.inner), "</ol>"),
  },
};
