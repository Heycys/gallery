import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { atHeight, endOf, gapScore, hoverAt, innerBox, measuredNode, pick } from "../../src/editor/page/geometry.mjs";
import { ADD, HANDLE } from "../../src/editor/page/handle-sizes.mjs";
import { resolveDrop } from "../../src/editor/page/drag/drop.mjs";

// The pure half of src/editor/page/geometry.mjs and src/editor/page/drag/drop.mjs, on trees written
// by hand (what measure() reads from a page): which block's handle shows beside empty space, which
// blocks a box selection takes, what a click below the last block of a box does, which box a click
// beside blocks goes by, and where dragged blocks go.

const rect = (left, top, right, bottom) => ({ left, top, right, bottom });
const box = (el, role, area, children = []) => ({ type: "box", el, kind: el, role, rect: area, children });
const unit = (el, kind, area, children = [], empty = false) => ({ type: "unit", el, kind, rect: area, start: area.left, empty, children });
// A unit that is its own box (a section, a list, a row of columns and each of its columns).
const holder = (el, kind, role, area, children) => unit(el, kind, area, [box(el, role, area, children)]);

// The page: a header line, a paragraph, section A (two paragraphs and a list), section B (a
// paragraph and a row of two columns, a card in each), a Sheet area (a tab row and the panel shown).
const page = box("main", "root", rect(100, 0, 700, 1100), [
  box("header", "lines", rect(100, 0, 700, 100), [unit("line", "paragraph", rect(100, 60, 700, 80))]),
  unit("p0", "paragraph", rect(100, 120, 700, 150)),
  holder("A", "section", "flow", rect(100, 200, 700, 390), [
    unit("p1", "paragraph", rect(100, 210, 700, 240)),
    unit("p2", "paragraph", rect(100, 250, 700, 280)),
    holder("L", "list", "list", rect(100, 300, 700, 390), [
      unit("li1", "item", rect(100, 300, 700, 340)), // an item shows from its list's edge, its marker with it
      unit("li2", "item", rect(100, 350, 700, 390)),
    ]),
  ]),
  holder("B", "section", "flow", rect(100, 450, 700, 700), [
    unit("p3", "paragraph", rect(100, 450, 700, 480)),
    holder("G", "columns", "columns", rect(100, 500, 700, 700), [
      holder("C1", "column", "column", rect(100, 500, 390, 700), [unit("card1", "figure", rect(100, 500, 390, 600))]),
      holder("C2", "column", "column", rect(410, 500, 700, 700), [unit("card2", "figure", rect(410, 500, 700, 700))]),
    ]),
  ]),
  unit("S", "sheets", rect(100, 750, 700, 1000), [
    box("tabs", "tabs", rect(100, 750, 700, 780), [unit("tab1", "tab", rect(100, 750, 200, 780)), unit("tab2", "tab", rect(220, 750, 320, 780))]),
    box("panel", "root", rect(100, 800, 700, 1000), [unit("p4", "paragraph", rect(100, 800, 700, 830)), unit("p5", "paragraph", rect(100, 850, 700, 880))]),
  ]),
]);

// Box selection: the blocks touched, lifted to one level.
const over = (left, top, right, bottom) => pick(page, rect(left, top, right, bottom));
assert.deepEqual(over(50, 215, 300, 260), ["p1", "p2"], "two paragraphs of a section: those paragraphs, not the section");
assert.deepEqual(over(50, 260, 300, 460), ["A", "B"], "across the end of a section: both sections whole");
assert.deepEqual(over(50, 320, 300, 360), ["li1", "li2"], "items of a list: the items");
assert.deepEqual(over(104, 320, 118, 360), ["li1", "li2"], "over the items' markers only: the items");
assert.deepEqual(over(50, 260, 300, 320), ["p2", "L"], "a paragraph and an item after it: the paragraph and the whole list");
assert.deepEqual(over(300, 520, 500, 560), ["card1", "card2"], "across the columns of a row: the blocks touched in each, not the columns");
assert.deepEqual(over(300, 620, 320, 640), [], "the empty part of a column alone: nothing");
assert.deepEqual(over(50, 470, 300, 560), ["p3", "G"], "a paragraph and a block in a column after it: the paragraph and the whole row");
assert.deepEqual(over(50, 760, 300, 810), ["p4"], "a tab and the panel's first paragraph: the paragraph, never the tab (the area's own control)");
assert.deepEqual(over(50, 760, 300, 860), ["p4", "p5"], "the tabs and the panel's paragraphs: the paragraphs");
assert.deepEqual(over(150, 755, 250, 775), ["S"], "over the tab row alone: the Sheet area, never a tab");
assert.deepEqual(over(50, 120, 300, 760), ["p0", "A", "B", "S"], "from the page into the tabs: the Sheet area whole");
assert.deepEqual(over(50, 70, 300, 130), ["line", "p0"], "the header's line and the paragraph after the header: both (the header is no block, its line is)");
assert.deepEqual(over(50, 70, 300, 210), ["line", "p0", "A"], "on into a section: the header's line, the paragraph, the section whole");
assert.deepEqual(over(50, 65, 300, 70), ["line"], "the header's line alone");
assert.deepEqual(over(50, 10, 300, 40), [], "the header above its lines (its title, no block): nothing");

// A header of a title (no block, so not in the tree) and two lines of small text, then the opening
// summary: a box across the header's end takes the lines it touches with the summary, drawn either way,
// touching the second line by a pixel too; one inside the header, its lines as before.
const headed = box("main", "root", rect(100, 0, 700, 600), [
  box("header", "lines", rect(100, 0, 700, 130), [unit("note1", "paragraph", rect(100, 70, 700, 90)), unit("note2", "paragraph", rect(100, 100, 700, 120))]),
  holder("summary", "highlight", "flow", rect(100, 160, 700, 300), [unit("s1", "paragraph", rect(120, 180, 680, 210)), unit("s2", "paragraph", rect(120, 220, 680, 250))]),
  holder("B2", "section", "flow", rect(100, 340, 700, 500), [unit("b1", "paragraph", rect(100, 340, 700, 370))]),
]);
const headedOver = (left, top, right, bottom) => pick(headed, rect(left, top, right, bottom));
assert.deepEqual(headedOver(50, 75, 300, 190), ["note1", "note2", "summary"], "from the first line of small text into the summary: both lines, the summary whole");
assert.deepEqual(headedOver(50, 105, 300, 195), ["note2", "summary"], "from the summary up into the second line: that line and the summary");
assert.deepEqual(headedOver(50, 119, 300, 195), ["note2", "summary"], "touching the second line by a pixel: the same");
assert.deepEqual(headedOver(50, 0, 300, 195), ["note1", "note2", "summary"], "from above the title: the lines and the summary, no title");
assert.deepEqual(headedOver(50, 75, 300, 110), ["note1", "note2"], "inside the header: its lines");
assert.deepEqual(headedOver(50, 105, 300, 350), ["note2", "summary", "B2"], "on into the next section: the line, the summary and the section whole");

// The page's icon above the title, a unit of the header that is never selected (selectable: false):
// a box over it takes nothing of it, from above it into the page the lines and the page's blocks alone.
const iconed = box("main", "root", rect(100, 0, 700, 400), [
  box("header", "lines", rect(100, 0, 700, 130), [unit("pageIcon", "icon", rect(100, 0, 178, 78)), unit("line1", "paragraph", rect(100, 100, 700, 120))]),
  holder("open", "highlight", "flow", rect(100, 160, 700, 300), [unit("o1", "paragraph", rect(120, 180, 680, 210))]),
]);
assert.deepEqual(pick(iconed, rect(50, 10, 300, 60)), [], "over the page's icon alone: nothing");
assert.deepEqual(pick(iconed, rect(50, 10, 300, 110)), ["line1"], "over the icon and the header's line: the line");
assert.deepEqual(pick(iconed, rect(50, 10, 300, 190)), ["line1", "open"], "from above the icon into the summary: the line and the summary, no icon");
assert.deepEqual(over(50, 215, 300, 220), ["p1"], "one paragraph alone");
assert.deepEqual(over(720, 215, 790, 400), [], "beside the page: nothing");

// A click beside the blocks: the innermost box at its height, wherever the click is along it.
const inside = (x, y) => innerBox(page, x, y).el;
assert.equal(inside(50, 170), "main", "between the page's blocks: the page");
assert.equal(inside(50, 880), "panel", "beside a Sheet's panel: the panel, not the area, nor the page");
assert.equal(inside(50, 765), "tabs", "beside its tab row");
assert.equal(inside(50, 245), "A", "beside a section's blocks: the section");
assert.equal(inside(800, 320), "L", "beside a list in it: the list");
assert.equal(inside(50, 650), "C1", "of the columns of a row, the nearest: the left one");
assert.equal(inside(800, 650), "C2", "the right one");
assert.equal(inside(400, 650), "C1", "between them, the nearer");
assert.equal(innerBox(box("main", "root", rect(100, 0, 700, 100)), 50, 50).el, "main", "an empty box: itself");

// A list whose second item holds a list: the item's own line (measure()'s `own`), then its list,
// indented. The rectangle takes the item whole once it touches that line, wherever it started.
const nested = box("main", "root", rect(100, 0, 700, 300), [
  holder("N", "list", "list", rect(100, 0, 700, 200), [
    unit("甲", "item", rect(100, 0, 700, 40)),
    { ...unit("乙", "item", rect(100, 50, 700, 160), [box("乙", "nest", rect(100, 50, 700, 160), [
      holder("N2", "list", "list", rect(124, 90, 700, 160), [
        unit("乙一", "item", rect(124, 90, 700, 120)),
        unit("乙二", "item", rect(124, 130, 700, 160)),
      ]),
    ])]), own: rect(100, 50, 700, 80) },
    unit("丙", "item", rect(100, 170, 700, 200)),
  ]),
]);
const across = (left, top, right, bottom) => pick(nested, rect(left, top, right, bottom));
assert.deepEqual(across(50, 60, 300, 100), ["乙"], "an item's own line and its first nested item: the item, with its list");
assert.deepEqual(across(600, 60, 760, 100), ["乙"], "the same from the right");
assert.deepEqual(across(50, 95, 300, 135), ["乙一", "乙二"], "below the item's own line: the nested items it touches");
assert.deepEqual(across(600, 95, 760, 135), ["乙一", "乙二"], "the same from the right");
assert.deepEqual(across(50, 100, 300, 110), ["乙一"], "one nested item alone");
assert.deepEqual(across(50, 20, 300, 60), ["甲", "乙"], "an item and the next one's own line: both items");
assert.deepEqual(across(50, 140, 300, 180), ["乙", "丙"], "a nested item and an item after its list: lifted to the outer items");

// The handle follows the pointer's height inside a block holding blocks: the innermost block at
// that height, the nearest in a gap, the item itself on its own line.
const list = measuredNode(nested, "N");
const handleAt = (y, from = list) => atHeight(from, 300, y).el;
assert.equal(handleAt(20), "甲", "on an item: that item");
assert.equal(handleAt(60), "乙", "on an item's own line, above its lists: the item");
assert.equal(handleAt(100), "乙一", "on a nested item: the nested item, not the item holding it");
assert.equal(handleAt(88), "乙一", "in the gap above the nested list, nearer it: the first nested item");
assert.equal(handleAt(83), "乙", "in that gap, nearer the item's own line: the item");
assert.equal(handleAt(164), "乙二", "below the nested list, nearer it than the next item: the last nested item");
assert.equal(handleAt(168), "丙", "nearer the next item: the next item");
assert.equal(handleAt(140, measuredNode(nested, "乙")), "乙二", "from the item holding the lists too");

// The handle beside empty space: the deepest block at that height within reach, of those side by
// side the nearest. Sections, Sheet areas and rows of columns have no handle there; their blocks do.
const skip = (node) => ["section", "sheets", "columns", "column"].includes(node.kind);
const beside = (x, y) => hoverAt(page, x, y, { skip });
assert.equal(beside(40, 225), "p1", "left of a paragraph in a section: the paragraph");
assert.equal(beside(40, 320), "li1", "left of a list item: the item, not the list");
assert.equal(beside(760, 260), "p2", "on the right too");
assert.equal(beside(-100, 225), null, "too far out (more than 150px)");
assert.equal(beside(40, 190), null, "between two blocks: none");
assert.equal(beside(40, 550), "card1", "beside a row of columns: the nearest block in them");
assert.equal(beside(760, 650), "card2", "below the shorter card, on the right: the taller card");
assert.equal(beside(40, 765), "tab1", "beside a Sheet's tabs: the first tab");
assert.equal(beside(40, 815), "p4", "beside a Sheet's panel: its paragraph");
assert.equal(hoverAt(page, 40, 205), "A", "without skipping, a section's own top");

// A click below the last block: a new paragraph in the box clicked, or the caret into the empty
// paragraph already at the end (none in a box whose end is its padding).
assert.deepEqual(endOf(page, 1050), { box: "main", after: "S" }, "below the page's last block: a paragraph at the end of the page");
assert.equal(endOf(page, 900), null, "not below the last block: nothing");
const section = page.children[2].children[0];
assert.deepEqual(endOf(section, 395), { box: "A", after: "L" }, "below a section's last block, on the section: in the section");
assert.equal(endOf(page.children[2].children[0].children[2].children[0], 395), null, "a list takes no paragraph");
assert.equal(endOf(page.children[0], 90), null, "nor does the header");
const columns = page.children[3].children[0].children[1].children[0];
assert.deepEqual(endOf(columns.children[0].children[0], 650), { box: "C1", after: "card1" }, "below a short column's last block: in that column");
assert.equal(endOf(columns, 650), null, "a row of columns takes no paragraph itself");
const trailing = box("main", "root", rect(100, 0, 700, 400), [
  holder("C", "section", "flow", rect(100, 100, 700, 300), [
    unit("q1", "paragraph", rect(100, 100, 700, 130)),
    unit("q2", "paragraph", rect(100, 140, 700, 170), [], true),
  ]),
]);
assert.deepEqual(endOf(trailing, 350), { focus: "q2" }, "an empty paragraph at the end of the last section takes the caret: no second one");
const panel = box("main", "root", rect(100, 0, 700, 400), [
  holder("H", "highlight", "flow", rect(100, 100, 700, 300), [unit("r1", "paragraph", rect(116, 116, 684, 146), [], true)]),
  unit("r2", "figure", rect(100, 320, 700, 380)),
]);
assert.deepEqual(endOf(panel, 390), { box: "main", after: "r2" }, "an empty paragraph earlier on is not the end");
assert.deepEqual(endOf(box("main", "root", rect(100, 0, 700, 300), [box("header", "lines", rect(100, 0, 700, 100), [])]), 200), { box: "main", after: "header" }, "a page with only its header: after the header");
assert.deepEqual(endOf(box("empty", "flow", rect(100, 0, 700, 40), []), 20), { box: "empty", after: null }, "an empty flow: at its start");
// A box whose end is its own padding (endIsPadding: a highlight block, a disclosure's content): a
// click under its last block makes no block there; a node, stretched as a column is, still does; below
// the page the caret still goes down into an empty paragraph such a box ends with.
const padded = (kind) => ({ type: "box", el: kind, kind, role: "flow", rect: rect(100, 100, 700, 300), children: [unit(`${kind}1`, "paragraph", rect(112, 112, 688, 142))] });
assert.equal(endOf(padded("highlight"), 200), null, "under a highlight block's last block (its padding): no paragraph");
assert.equal(endOf(padded("details"), 200), null, "nor under a disclosure content's");
assert.deepEqual(endOf(padded("node"), 200), { box: "node", after: "node1" }, "a flowchart's node: a paragraph at its end still");
const endsInPanel = box("main", "root", rect(100, 0, 700, 400), [
  unit("HP", "highlight", rect(100, 100, 700, 300), [{ type: "box", el: "HP", kind: "highlight", role: "flow", rect: rect(100, 100, 700, 300), children: [unit("e1", "paragraph", rect(112, 112, 688, 142), [], true)] }]),
]);
assert.deepEqual(endOf(endsInPanel, 350), { focus: "e1" }, "below the page, which ends with a highlight block ending with an empty paragraph: the caret there");

// Where dragged blocks go. A Sheet area whose panel holds two sections: S1 ends with a highlight
// panel (their bottoms coincide), S2 ends with a paragraph, flush with the panel and the Sheet
// area; S2 holds a list whose second item holds a list of its own.
const U = (el, kind, area, children = [], extra = {}) => ({ type: "unit", el, kind, rect: area, start: area.left, empty: false, text: true, nestable: false, children, ...extra });
const B = (el, kind, role, area, children = [], row = false, content = area) => ({ type: "box", el, kind, role, rect: area, content, row, children });
const own = (el, kind, role, area, children, extra = {}) => U(el, kind, area, [B(el, kind, role, area, children)], extra);
const sheet = B("main", "main", "root", rect(100, 0, 700, 1400), [
  U("SA", "sheets", rect(100, 100, 700, 700), [
    B("tabs", "tabs", "tabs", rect(100, 100, 700, 130), [U("tab1", "tab", rect(100, 100, 200, 130)), U("tab2", "tab", rect(220, 100, 320, 130))], true),
    B("P", "panel", "root", rect(100, 150, 700, 700), [
      own("S1", "section", "flow", rect(100, 150, 700, 300), [
        U("p1", "paragraph", rect(100, 150, 700, 180)),
        U("p2", "paragraph", rect(100, 190, 700, 220)),
        own("H", "highlight", "flow", rect(100, 240, 700, 300), [U("hp", "paragraph", rect(116, 256, 684, 284))]),
      ]),
      own("S2", "section", "flow", rect(100, 332, 700, 700), [
        U("p3", "paragraph", rect(100, 332, 700, 360)),
        own("L", "list", "list", rect(100, 370, 700, 500), [
          U("li1", "item", rect(100, 370, 700, 395), [], { start: 124, nestable: true }),
          U("li2", "item", rect(100, 400, 700, 500), [B("li2", "nest", "nest", rect(124, 400, 700, 500), [
            own("L2", "list", "list", rect(127, 425, 700, 500), [U("li3", "item", rect(127, 425, 700, 460), [], { start: 151 }), U("li4", "item", rect(127, 465, 700, 500), [], { start: 151 })]),
          ])], { start: 124, nestable: true }),
        ]),
        U("p4", "paragraph", rect(100, 520, 700, 700)),
      ]),
    ]),
  ]),
]);
const flows = (node) => node.role === "root" || node.role === "flow";
const drop = (x, y, options = {}) => {
  const found = resolveDrop(sheet, x, y, { takes: flows, ...options });
  return found && { box: found.box, slot: found.slot, nest: found.nest, same: found.same, halo: Boolean(found.halo) };
};
assert.deepEqual(drop(300, 215), { box: "S1", slot: 2, nest: null, same: false, halo: true }, "inside a section: its places, the section tinted");
assert.deepEqual(drop(20, 215), drop(300, 215), "beside the page counts as the page");
assert.deepEqual(drop(300, 305), { box: "S1", slot: 3, nest: null, same: false, halo: true }, "just past the edges of S1 and its panel (they coincide): the first step out is S1's end, after the panel");
assert.deepEqual(drop(300, 318), { box: "P", slot: 1, nest: null, same: false, halo: true }, "a step further: between the sections, in the Sheet panel");
assert.deepEqual(drop(300, 705), { box: "P", slot: 2, nest: null, same: false, halo: true }, "just below the last section (ending with the panel and the Sheet area): after it, still in the Sheet");
assert.deepEqual(drop(300, 720), { box: "main", slot: 1, nest: null, same: false, halo: false }, "a step further: after the Sheet area, in the page (not tinted)");
assert.deepEqual(drop(300, 800), { box: "main", slot: 1, nest: null, same: false, halo: false }, "far below: the page");
assert.equal(drop(300, 115), null, "over a Sheet's tab row nothing drops");
const tabs = resolveDrop(sheet, 210, 115, { takes: (node) => node.el === "tabs", dragged: (node) => node.el === "tab2" });
assert.deepEqual([tabs.box, tabs.slot, tabs.same, tabs.line.left < 210 && tabs.line.right > 200], ["tabs", 1, true, true], "a tab in its row: across, by the tabs' middles (here where it is)");
assert.equal(drop(300, 195, { dragged: (node) => node.el === "p2" }).same, true, "where the block is already: the same place");
assert.deepEqual(drop(300, 200, { takes: (node) => node.role === "root", dragged: (node) => node.el === "S1" }), { box: "P", slot: 0, nest: null, same: true, halo: true }, "nothing goes into a dragged block: over itself, a section is where it is");

// Lists by indentation.
const items = (x, y) => drop(x, y, { takes: (node) => node.kind === "list", items: true });
assert.deepEqual(items(300, 490), { box: "L2", slot: 2, nest: null, same: false, halo: true }, "at the end of the inner list, over its items: there");
assert.deepEqual(items(140, 490), { box: "L2", slot: 2, nest: null, same: false, halo: true }, "over its markers, left of where its items start: still there");
assert.deepEqual(items(125, 490), { box: "L", slot: 2, nest: null, same: false, halo: true }, "left of its markers: out to the list around it, after the item holding it");
assert.deepEqual(items(300, 398), { box: "L", slot: 1, nest: "li1", same: false, halo: true }, "a step right of the item above: under that item (it is tinted)");
assert.deepEqual(items(130, 398), { box: "L", slot: 1, nest: null, same: false, halo: true }, "not that far right: after it");
const lineAt = (x, y) => resolveDrop(sheet, x, y, { takes: (node) => node.kind === "list", items: true }).line.left;
assert.deepEqual([lineAt(130, 398), lineAt(300, 398)], [100, 124], "the line: from the list's edge (its markers) between items, from the item's text under it (where its list's markers would stand)");
assert.deepEqual(items(200, 505), { box: "L2", slot: 2, nest: null, same: false, halo: true }, "just below the lists, over the inner list's items: its end");
assert.deepEqual(items(130, 505), { box: "L", slot: 2, nest: null, same: false, halo: true }, "left of them: the outer list's end");
assert.equal(items(300, 600), null, "items go nowhere but lists");

// A section opening with a divider line: the line's band (a line of text tall) reaches past the
// section's top; the place before it is still shown at the section's edge.
const opening = B("main", "main", "root", rect(100, 0, 700, 600), [
  own("S3", "section", "flow", rect(100, 200, 700, 400), [U("rule", "rule", rect(100, 192, 700, 216)), U("p5", "paragraph", rect(100, 240, 700, 270))]),
]);
const first = resolveDrop(opening, 300, 202, { takes: flows });
assert.deepEqual([first.box, first.slot, first.line.top + 1.5], ["S3", 0, 194], "before the divider: in the section, the line 6px above its top, not above the band");
assert.equal(hoverAt(opening, 40, 195, { skip }), "rule", "beside the divider's band above the section: the divider's handle");
assert.deepEqual(pick(opening, rect(50, 193, 300, 196)), ["rule"], "a box over that part of the band alone: the divider");


// Beside a block (分栏): two paragraphs, a row of two columns (two paragraphs, a card), a section.
// A drop at the right third of a block or right of it, or left of it past all of its handle, puts
// the blocks beside it in a new row; at a column's edge, in a new column there (all of one column of
// that row: that column moves).
const sides = B("main", "main", "root", rect(100, 0, 700, 1000), [
  U("q1", "paragraph", rect(100, 100, 700, 130)),
  U("q2", "paragraph", rect(100, 140, 700, 170)),
  own("R", "columns", "columns", rect(100, 200, 700, 400), [
    own("c1", "column", "column", rect(100, 200, 390, 400), [U("x1", "paragraph", rect(100, 200, 390, 230)), U("x2", "paragraph", rect(100, 240, 390, 270))]),
    own("c2", "column", "column", rect(410, 200, 700, 400), [U("y1", "figure", rect(410, 200, 700, 400))]),
  ]),
  own("S", "section", "flow", rect(100, 450, 700, 600), [U("z1", "paragraph", rect(100, 450, 700, 480))]),
]);
const fits = (node) => !["section", "sheets", "columns", "column", "item", "tab"].includes(node.kind);
const takesColumn = (node) => ["root", "flow", "column"].includes(node.role);
const asideIn = (tree, x, y, dragged, edge) => {
  const found = resolveDrop(tree, x, y, { takes: takesColumn, dragged: (node) => dragged.includes(node.el), count: dragged.length, aside: fits, edge });
  return found?.aside ? { ...found.aside, same: found.same } : null;
};
const beside2 = (x, y, dragged = ["q2"]) => asideIn(sides, x, y, dragged);
assert.deepEqual(beside2(650, 115), { target: "q1", side: "right", same: false }, "the right third of a block: beside it, on its right");
assert.deepEqual(beside2(800, 115), { target: "q1", side: "right", same: false }, "right of it too");
assert.equal(beside2(950, 115), null, "but not too far out");
assert.equal(beside2(300, 115), null, "over the rest of a block: between blocks, as ever");
assert.equal(beside2(110, 115), null, "over its text: between blocks, as ever");
const grip = 100 - HANDLE.gap - HANDLE.width; // where its grip starts: x of a drag pressed anywhere on it, and what a hand drifts by
for (const x of [100, grip + HANDLE.width + 16, grip + HANDLE.width, grip + HANDLE.width / 2, grip, grip - 16]) assert.equal(beside2(x, 115), null, `down the handles (${x}): between blocks, as ever`);
assert.ok(ADD.width >= 16, "at least 16px of slack past the grip");
assert.equal(beside2(grip - ADD.width, 115), null, "to the end of the + column left of the grip");
assert.deepEqual(beside2(grip - ADD.width - 1, 115), { target: "q1", side: "left", same: false }, "a pixel past it: beside it, on its left");
assert.deepEqual(beside2(-100, 115), { target: "q1", side: "left", same: false }, "as far out as on its right");
assert.equal(beside2(-101, 115), null, "and no further");
assert.deepEqual(beside2(650, 465), { target: "z1", side: "right", same: false }, "a block in a section");
assert.equal(beside2(650, 550), null, "a section itself: no");
const handle = 410 - HANDLE.gap - HANDLE.width - ADD.width; // where the handle of the second column's blocks starts, the "+" column's left edge
assert.deepEqual(beside2(handle - 1, 300), { row: "R", index: 1, whole: null, same: false }, "left of the next column's handle: a new column there");
assert.deepEqual(beside2(handle - 32, 300), { row: "R", index: 1, whole: null, same: false }, "32px wide");
assert.equal(beside2(handle - 33, 300), null, "and no wider");
assert.equal(beside2(handle, 300), null, "from that handle on: between blocks");
assert.equal(beside2(400, 300), null, "in the gap, which that handle stands in");
assert.deepEqual(beside2(690, 300), { row: "R", index: 2, whole: null, same: false }, "at the last column's right edge: a new last column");
assert.deepEqual(beside2(780, 300), { row: "R", index: 2, whole: null, same: false }, "right of the row");
assert.equal(beside2(92, 300), null, "at the left edge of the first column: between blocks, as ever");
assert.equal(beside2(grip - ADD.width, 300), null, "down the handles there too");
assert.deepEqual(beside2(grip - ADD.width - 1, 300), { row: "R", index: 0, whole: null, same: false }, "left of the first column past them: a new first column");
assert.deepEqual(beside2(-100, 300), { row: "R", index: 0, whole: null, same: false }, "as far out");
assert.equal(beside2(-101, 300), null, "and no further");
assert.deepEqual(beside2(grip - ADD.width - 1, 300, ["x1", "x2"]), { row: "R", index: 0, whole: "c1", same: true }, "all of its first column there: the same place");
assert.equal(beside2(300, 215, ["q2"]), null, "inside a column, away from its edges: between its blocks");
assert.deepEqual(beside2(690, 300, ["x1", "x2"]), { row: "R", index: 2, whole: "c1", same: false }, "all of one column of the row: that column moves");
assert.deepEqual(beside2(handle - 1, 300, ["x1", "x2"]), { row: "R", index: 1, whole: "c1", same: true }, "next to where it is: the same place");
assert.deepEqual(beside2(690, 300, ["x1"]), { row: "R", index: 2, whole: null, same: false }, "part of a column: a new column");
assert.equal(resolveDrop(sides, 650, 115, { takes: takesColumn, dragged: (node) => node.el === "q2" }).aside, undefined, "without aside (blocks a column does not take): never beside");
const line = resolveDrop(sides, 650, 115, { takes: takesColumn, dragged: (node) => node.el === "q2", aside: fits }).line;
assert.deepEqual([line.left + 1.5, line.top, line.bottom], [706, 92, 138], "the line down the block's right side, a little past it");
// A block of a column past the first, dragged by its handle, which stands in the gap and over the end
// of the column before: a drag that goes up or down stays among that column's blocks.
const pair = B("main", "main", "root", rect(100, 0, 700, 400), [
  own("P", "columns", "columns", rect(100, 0, 700, 300), [
    own("pa", "column", "column", rect(100, 0, 390, 300), [U("a1", "paragraph", rect(100, 0, 390, 30)), U("a2", "paragraph", rect(100, 40, 390, 70)), U("a3", "paragraph", rect(100, 80, 390, 110))]),
    own("pb", "column", "column", rect(410, 0, 700, 300), [U("b1", "paragraph", rect(410, 0, 700, 30)), U("b2", "paragraph", rect(410, 40, 700, 70)), U("b3", "paragraph", rect(410, 80, 700, 110))]),
  ]),
]);
const inPair = (x, y) => {
  const found = resolveDrop(pair, x, y, { takes: takesColumn, dragged: (node) => node.el === "b1", aside: fits });
  return { box: found.box, slot: found.slot, aside: Boolean(found.aside) };
};
const secondGrip = 410 - HANDLE.gap - HANDLE.width;
for (const x of [secondGrip - 16, secondGrip, secondGrip + HANDLE.width, secondGrip + HANDLE.width + 16]) assert.deepEqual(inPair(x, 85), { box: "pb", slot: 1, aside: false }, `down that handle (${x}): among its column's blocks`);
assert.deepEqual(inPair(410 - HANDLE.gap - HANDLE.width - ADD.width, 85), { box: "pb", slot: 1, aside: false }, "out to the handle's end");
assert.deepEqual(inPair(300, 85), { box: "pa", slot: 2, aside: false }, "over the column before, among its own");

// Left of a block that stands in from the window's edge by less than the band's start: the start in
// the window, SLACK from the grip kept in there too (26px: handle/); with the edge scrolled, by it.
const tight = B("main", "main", "root", rect(52, 0, 764, 400), [U("t1", "paragraph", rect(52, 100, 764, 130)), U("t2", "paragraph", rect(52, 140, 764, 170))]);
const near = (x, edge = 0) => asideIn(tight, x, 115, ["t2"], edge);
assert.deepEqual(near(9), { target: "t1", side: "left", same: false }, "the window's first 10px: beside it");
assert.equal(near(10), null, "16px clear of the grip");
assert.equal(near(9, -Infinity), null, "with no edge said, the band starts past the handle as ever");
assert.deepEqual(near(109, 100), { target: "t1", side: "left", same: false }, "by the edge as the page scrolled sideways");
const roomy = B("main", "main", "root", rect(64, 0, 776, 400), [U("t1", "paragraph", rect(64, 100, 776, 130)), U("t2", "paragraph", rect(64, 140, 776, 170))]);
assert.deepEqual(asideIn(roomy, 11, 115, ["t2"], 0), { target: "t1", side: "left", same: false }, "in the page's edge room: where it starts, the window's first 12px");
assert.equal(asideIn(roomy, 12, 115, ["t2"], 0), null, "and no further");

// A framed Sheet panel's blocks stand in from the page by its padding, which is no room to reach
// them by: past the handle of a page block going by there, left of the frame, the pointer is beside
// them, as beside the page's own. A Sheet area is no block to stand beside, and over the padding a
// drop goes between blocks.
const framed = B("main", "main", "root", rect(100, 0, 700, 600), [
  U("before", "paragraph", rect(100, 50, 700, 80)),
  U("S", "sheets", rect(100, 100, 700, 500), [
    B("P", "panel", "root", rect(101, 150, 699, 499), [
      U("in1", "paragraph", rect(117, 160, 683, 190)),
      own("R2", "columns", "columns", rect(117, 200, 683, 300), [
        own("r1", "column", "column", rect(117, 200, 390, 300), [U("r1a", "paragraph", rect(117, 200, 390, 230))]),
        own("r2", "column", "column", rect(410, 200, 683, 300), [U("r2a", "paragraph", rect(410, 200, 683, 230))]),
      ]),
    ], false, rect(117, 150, 683, 483)),
  ]),
]);
const framedAside = (x, y) => asideIn(framed, x, y, ["before"]);
const pageOut = 100 - HANDLE.gap - HANDLE.width - ADD.width; // past the handle of the page's own blocks
assert.deepEqual(framedAside(pageOut - 1, 175), { target: "in1", side: "left", same: false }, "left of a framed panel: beside its block");
assert.equal(framedAside(pageOut, 175), null, "down the page's handles and the panel's: between blocks");
assert.equal(framedAside(108, 175), null, "over the panel's padding: between blocks");
assert.deepEqual(framedAside(pageOut - 1, 250), { row: "R2", index: 0, whole: null, same: false }, "and a row of columns in it, a new first column");
assert.equal(framedAside(pageOut, 250), null, "from the same start");
const card = B("content", "dialog", "flow", rect(300, 100, 980, 500), [U("c1", "paragraph", rect(364, 132, 916, 160)), U("c2", "paragraph", rect(364, 170, 916, 200))], false, rect(364, 132, 916, 460));
assert.deepEqual(asideIn(card, 311, 145, ["c2"]), { target: "c1", side: "left", same: false }, "a detail card's padding too, out over its backdrop as well");
assert.equal(asideIn(card, 312, 145, ["c2"]), null, "down its handles: between blocks");
const full = B("main", "main", "root", rect(0, 0, 1000, 500), [
  own("F", "columns", "columns", rect(0, 0, 1000, 100), Array.from({ length: 5 }, (_, index) => own(`f${index}`, "column", "column", rect(index * 200, 0, index * 200 + 180, 100), [U(`g${index}`, "paragraph", rect(index * 200, 0, index * 200 + 180, 30))]))),
  U("h", "paragraph", rect(0, 200, 1000, 230)),
]);
assert.equal(resolveDrop(full, 182, 50, { takes: takesColumn, dragged: (node) => node.el === "h", aside: fits })?.aside, undefined, "a row of five columns takes no more");

// An empty box takes the line across its content (measure()'s `content`: inside the box's padding
// and border), halfway down it; with no room inside it, 6px above its bottom. Nothing here reads a page.
const hollow = B("main", "main", "root", rect(100, 0, 700, 600), [
  B("empty", "panel", "root", rect(100, 100, 700, 200), [], false, rect(117, 116, 683, 184)),
  B("thin", "panel", "root", rect(100, 300, 700, 310), [], false, rect(110, 310, 690, 300)),
  U("below", "paragraph", rect(100, 400, 700, 430)),
]);
const within = (x, y) => resolveDrop(hollow, x, y, { takes: flows });
assert.deepEqual([within(300, 150).box, within(300, 150).line], ["empty", { left: 117, top: 148.5, right: 683, bottom: 151.5 }], "an empty box: the line across its content, inside its padding and border, halfway down");
assert.deepEqual(within(300, 305).line, { left: 110, top: 302.5, right: 690, bottom: 305.5 }, "an empty box with no room inside its padding: the line 6px above its bottom");
const emptied = resolveDrop(sheet, 300, 215, { takes: flows, dragged: (node) => node.el === "p1" || node.el === "p2" || node.el === "H" });
assert.equal(emptied.line.left, 100, "a box whose blocks are all dragged away: its line over its content too");

// How far a rectangle is from a point, by height then by width (the nearest block to a pointer: the handle's
// block in a gap, the text block a cross-block selection ends in).
const around = rect(100, 100, 300, 200);
assert.deepEqual(gapScore(around, 150, 150), [0, 0], "inside: no gap");
assert.deepEqual(gapScore(around, 50, 150), [0, 50], "left of it: the width gap");
assert.deepEqual(gapScore(around, 350, 90), [10, 50], "above and right of it: both gaps");
assert.deepEqual(gapScore(around, 200, 230), [30, 0], "below it: the height gap");

// A highlight block opens with its icon, its lead (the description's `lead`): no block to pick, no block to fall
// between. A box touching only the icon takes the whole highlight block; a place before the icon is the place after
// it (slot 1, the line from the icon's right), so dragging the first block to above the icon leaves it where it is.
const lit = B("main", "main", "root", rect(100, 0, 700, 600), [
  own("HL", "highlight", "flow", rect(100, 100, 700, 220), [
    U("ic", "icon", rect(116, 116, 140, 140)),
    U("hp1", "paragraph", rect(150, 116, 684, 146)),
    U("hp2", "paragraph", rect(150, 156, 684, 186)),
  ]),
  U("after", "paragraph", rect(100, 300, 700, 330)),
]);
assert.deepEqual(pick(lit, rect(110, 110, 145, 145)), ["HL"], "a box over only the icon: the whole highlight block, not the icon");
assert.deepEqual(pick(lit, rect(104, 104, 112, 112)), ["HL"], "over only the block's padding: the whole highlight block");
assert.deepEqual(pick(lit, rect(110, 120, 400, 170)), ["hp1", "hp2"], "over the icon and its paragraphs: the paragraphs");
const beforeIcon = resolveDrop(lit, 300, 108, { takes: flows });
assert.deepEqual([beforeIcon.box, beforeIcon.slot, beforeIcon.line.left], ["HL", 1, 150], "above the icon: after it, the line from the icon's right");
const topOfFirst = resolveDrop(lit, 300, 108, { takes: flows, dragged: (node) => node.el === "hp1", count: 1 });
assert.equal(topOfFirst.same, true, "the first block dragged to above the icon: where it is already");
assert.equal(resolveDrop(lit, 300, 150, { takes: flows, dragged: (node) => node.el === "hp1", count: 1 }).same, true, "...and on it too");
const between = resolveDrop(lit, 300, 150, { takes: flows });
assert.deepEqual([between.slot, between.line.left], [2, 150], "between its paragraphs: slot 2, from the paragraphs' left");

// A box whose rows wrap (geometry.mjs sideBySide "wrap": a flowchart's nodes as the kit lays them
// out): rows [n1 n2 n3] [n4] [n5 n6], n4 alone in its row (a node holding a picture). In a row of
// several, the places go across and the line stands down between two cards (at a row's end past its
// last, at a row's start before its first); before and after a node alone in its row, above and below
// it by its middle height, the line across it between the rows.
{
  const flow = B("main", "main", "root", rect(100, 0, 700, 600), [
    own("F", "flowchart", "steps", rect(100, 100, 700, 400), [
      U("n1", "step", rect(100, 100, 280, 180)), U("n2", "step", rect(310, 100, 490, 180)), U("n3", "step", rect(520, 100, 700, 180)),
      U("n4", "step", rect(100, 214, 700, 300)),
      U("n5", "step", rect(100, 334, 385, 400)), U("n6", "step", rect(415, 334, 700, 400)),
    ]),
  ]);
  flow.children[0].children[0].row = "wrap";
  const steps = (node) => node.role === "steps";
  const at = (x, y) => {
    const found = resolveDrop(flow, x, y, { takes: steps, dragged: (node) => node.el === "n1", count: 1 });
    const { left, top, right, bottom } = found.line;
    return { slot: found.slot, line: right - left > bottom - top ? `across ${Math.round((top + bottom) / 2)} from ${Math.round(left)} to ${Math.round(right)}` : `down ${Math.round((left + right) / 2)}` };
  };
  assert.deepEqual(at(470, 140), { slot: 1, line: "down 505" }, "in a row of several: across by the cards' middles, the line down between two cards");
  assert.deepEqual(at(650, 140), { slot: 2, line: "down 708" }, "the right half of a row's last card: after it, the line past it");
  assert.deepEqual(at(300, 230), { slot: 2, line: "across 197 from 100 to 700" }, "the upper half of a node alone in its row: before it, the line across it between the rows");
  assert.deepEqual(at(300, 290), { slot: 3, line: "across 317 from 100 to 700" }, "its lower half: after it, the line across it between it and the next row");
  assert.deepEqual(at(650, 320), { slot: 3, line: "across 317 from 100 to 700" }, "between that row and the next, the same place");
  assert.deepEqual(at(150, 360), { slot: 3, line: "down 92" }, "the left half of a row's first card after it: before that card, the line down at its left");
  assert.deepEqual(at(600, 360), { slot: 5, line: "down 708" }, "the right half of the last card: at the end");
  const single = B("main", "main", "root", rect(100, 0, 700, 600), [own("G", "flowchart", "steps", rect(100, 100, 700, 300), [U("m1", "step", rect(100, 100, 700, 180)), U("m2", "step", rect(100, 214, 700, 300))])]);
  single.children[0].children[0].row = true;
  assert.deepEqual(resolveDrop(single, 300, 230, { takes: steps }).slot, 1, "a row that does not wrap (true): across by the middles as ever, a lone card's left half before it");
}

// A box and its units with no kind (null === null is no lead): nothing of theirs is skipped as a lead.
{
  const bare = { type: "box", el: "bare", kind: null, role: "flow", rect: rect(100, 0, 700, 100), children: [
    { type: "unit", el: "b1", kind: null, rect: rect(100, 10, 700, 40), start: 100, empty: false, children: [] },
    { type: "unit", el: "b2", kind: null, rect: rect(100, 50, 700, 80), start: 100, empty: false, children: [] },
  ] };
  assert.deepEqual(pick(bare, rect(100, 10, 700, 80)).sort(), ["b1", "b2"], "units without a kind in a box without one are picked, not taken for its lead");
  assert.equal(resolveDrop(bare, 300, 5, { takes: () => true }).slot, 0, "and a drop above them goes before them, no lead to stand after");
}

console.log("Checked block geometry: box selection lifted to one level (paragraphs of a section, sections across their boundary, list items, a paragraph with a list, an item holding a list whole at its own line and its nested items below it from either side, the blocks of a row's columns, a Sheet area, a panel's blocks and never a tab, the header's lines it touches taken with the page's blocks, never its title), the handle beside empty space (deepest block within 150px, nearest of those side by side, sections, Sheet areas and rows of columns skipped), clicks below the last block (a paragraph in the box clicked, a short column included, the caret into an empty one at the end, none under the last block of a highlight block or a disclosure's content), where dragged blocks go (inside a container by its places, past coinciding edges one container out per step, lists by indentation both ways, nothing over a tab row, never into a dragged block, an empty box's line from the tree alone: no page read; in a box whose rows wrap, across a row of several and above or below a node alone in its row) and beside a block (a new row of columns at a block's right third or left of its handle, a new column past the last column, left of the first or of the next column's handle, a block of a later column down its handle among that column's blocks, a whole column moved, at most five).");
