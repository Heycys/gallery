import bookmark from "./bookmark/index.mjs";
import callout from "./callout/index.mjs";
import code from "./code/index.mjs";
import columns from "./columns/index.mjs";
import details from "./details/index.mjs";
import dialog from "./dialog/index.mjs";
import divider from "./divider/index.mjs";
import embed from "./embed/index.mjs";
import figure from "./figure/index.mjs";
import file from "./file/index.mjs";
import flowchart from "./flowchart/index.mjs";
import heading from "./heading/index.mjs";
import highlight from "./highlight/index.mjs";
import icon from "./icon/index.mjs";
import image from "./image/index.mjs";
import installed from "./installed/index.mjs";
import list from "./list/index.mjs";
import math from "./math/index.mjs";
import paragraph from "./paragraph/index.mjs";
import quote from "./quote/index.mjs";
import section from "./section/index.mjs";
import sheets from "./sheets/index.mjs";
import table from "./table/index.mjs";
import widget from "./widget/index.mjs";
import { CATEGORIES, componentOf } from "../../shared/components/index.mjs";
import { slotAround } from "../../shared/components/installed.mjs";
import { COLOR_CLASSES } from "./colors.mjs";
import { MEDIA_HOSTS } from "./media/parts.mjs";
import { t } from "../../shared/i18n/index.mjs";

// The kit's components as the editor sees them, gathered from their folders (src/editor/components/
// <name>/index.mjs), shared by the page and the server (src/editor/source/). Each is the editor's
// side of the kit's component of the same name (src/shared/components/), or of the one it names
// (`description`: the flowchart's is the list's, ol.doc-flow being a kind of list for the kit),
// whose category it takes: a basic block, a container, a card or a whole block (CATEGORIES there).
// Each describes itself:
//
//   listed      what 设置 › 组件列表 calls it (a function, as the server says it in both languages), for a
//               component the reader meets in the "/" menu or as a block of its own; every component
//               with a type in that menu says it. Its line there shows the icon of its first row in the
//               "/" menu (basic before advanced, by place), or, for a component with no type there (分区),
//               its first unit's `icon`; a listed component with neither throws. hideable: false, it stays offered whatever gallery.json
//               says, its switch there off and locked (文本, 标题, 列表, 分区): what a page cannot do
//               without. What is hidden goes from "/", 在下方新建 and the handle's grid and nothing else
//               (page/offered.mjs); its blocks, its Markdown shortcut and "Blocks at a glance" stay.
//   units       the unit kinds it defines (blocks the reader selects, moves and deletes):
//               { [kind]: { name, icon?, match, chapter?, fixed?, block?, handle?, below?, boxed?, beside?, inRow?, sharesHeight?, entersAfter?, resizable?, copy?, clipboard?, sizes?, toggles?, colors?, colorDefaults?, removedEmpty?, turnsEmpty?, leadsChapter?, canHaveChildren?, emptyIsNothing?, fromWords?, replacedByFile?, selectable?, attributes?, read } }
//               read: how gallery read writes a block of it (src/transfer/read-view.mjs, every kind has
//               one: tests/unit/read.mjs): { name (what the view calls it), rows(node, view) (the default
//               view's rows: read-rows.mjs), label?(node) (its name as it shows: 开头概括, 编号列表), title?(node,
//               view) (a container's name: a tab's), words?(node, view) (its lines in the words alone; none: its
//               blocks'), data?(node, view) (its JSON's data), lost?(node) (what the export's Markdown leaves
//               out of it, a phrase with {n}), alone?(node, writer) (its Markdown read by itself) }.
//               match: rules an element matches by its tag (one of `tag`), its class and its
//               attribute, and by the element it stands in (`parent`: { tag?, class? }, a flowchart's
//               step being an li whose parent is an ol.doc-flow), whichever are given; every
//               component's rules are tried in `rank` order and the first match wins (anything left is
//               "block", a report's own widget).
//               chapter: stands in the page or a Sheet panel besides body text; fixed: never
//               inside a flow; block: false, no block of its own for the reader (a column: a box
//               selection and 选中外层 pass over it to the blocks in it, or the row); handle: where its
//               handle stands, "line" (the default: at its first line), "bar" (a bar along its right
//               side: a section), "none" (none of its own: the blocks it holds have theirs) or "outer"
//               (its container's: a tab's, the Sheet area's, on the tab row); below: false, its menu
//               offers no new block below it (a tab, a Sheet area); boxed: a block with a frame of its
//               own, no text flowing beside it: a double click between two of them makes a paragraph,
//               a click to its right puts the caret after it (page/after/), Enter on it selected puts a paragraph after it unless
//               it is a text block (beside.mjs), and it is a block of its own to Ctrl+A; beside: the
//               same click and Enter without being boxed (a row of columns); inRow(element): whether
//               this one stands beside another now, as a row of columns always does and a flowchart's
//               node when a node shares its line (standsBeside: what stands so keeps the handle across
//               its width, with no 批注 button, its right half being no margin); sharesHeight: its height
//               the tallest's beside it (a column, a flowchart's step), so that a block growing in it may
//               change no height outside it, and what stands beside the page follows such a block's size
//               (annotate/); entersAfter: that Enter alone (a Sheet area); resizable: the elements of
//               it whose edges resize (a selector: resize/ knows how each is dragged, and takes one of
//               this kind that matches); copy:
//               "itself", copied as itself (as a card is) although no card; clipboard: how an element of
//               this kind is written out, where the first type of the kind does not say it (below).
//               sizes: custom properties in its style attribute ("Sizes" in
//               src/render/kit/styles/sizes.css) and the values each takes (a share, a length in px, none),
//               the one that says `height` being what its bottom edge sets (resize/);
//               toggles: classes it may switch on the page, besides its colors (`colors`: the families of
//               colors it takes, components/colors.mjs: ["text", "background"] for a text block (body text,
//               headings, list items), ["background"] for a block of other blocks or of code (a highlight
//               block, a disclosure, a code block); none without; `colorDefaults`: the color of a family it
//               shows with none of it, when that is one of the nine (a callout's background: blue), which
//               颜色 › marks for it in place of 默认, a pick of it taking the class away); attributes: attributes it may set on
//               the page, each with the test of its values. icon: what its handle shows, for a
//               kind no block type stands for (a type's own icon is its `types` entry's). removedEmpty:
//               Backspace on the one empty block in it deletes it whole (a code block, a highlight block,
//               a callout, a quote, a disclosure: typing/). turnsEmpty: it holds nothing to carry, so what it is
//               turned into is an empty block of the type, in its place (a divider line: convert.mjs).
//               leadsChapter: it may stand first in a chapter as the line above its heading, so a
//               folded heading with only such blocks before it covers the chapter (a divider: fold/rule.mjs).
//               canHaveChildren: a block right after it goes under it by Tab, so the
//               keys of a block stand after it as they stand in what it is in (a list: under its last item).
//               emptyIsNothing: a block of it left empty counts as nothing written, in a container
//               that says `removedEmpty`. fromWords: a block of it can be made again from its words alone.
//               replacedByFile: a file pasted at the caret in an empty block of it takes the block's place (the
//               empty text block goes), else it goes after the block (page/clipboard/).
//               selectable: false, never selected (an icon, the page's or a highlight block's, whose own
//               controls are its tools): a box selection, ↑/↓ and
//               Shift+↑/↓, Ctrl+A and select() itself pass over it, and Ctrl+Shift+arrows move no block past it.
//   boxes       the box kinds it defines (containers whose children are units): { [kind]: { role,
//               name?, classes?, find?, owner?, takenBy?, also?, leaveByEnter?, endIsPadding?, lead?, firstLineActs?, firstBlock?, groups?, holdsOne?, emptyIsNothing?, outer?, selectAll? } }, classes being the kit's classes that make an element one
//               (rank order, as above); the others the server knows by their tag (findUnits). find: where
//               a unit's box of this kind is (a list item's lists, a disclosure's content, a Sheet area's
//               panels, an instance's slots by their name: `find(unit, key)`); owner: the element of its unit that takes the box along (a Sheet panel's tab:
//               boxOwner); takenBy: whether a unit's element is that one, for a box of this key, told from
//               the element alone, which may be off the page with the box (takesBox);
//               also: the unit kinds it takes besides what its role takes (a highlight block's icon);
//               leaveByEnter: Enter on its empty last block moves that block out after it (typing/leave.mjs);
//               endIsPadding: what is under its last block is its own padding (a highlight block, a
//               callout, a disclosure's content): a click there makes no block, it is a gap like any other
//               (geometry.mjs endOf, insert/ clickBlank);
//               lead: the kind of unit it opens with as its fixed head, which is no block to fall
//               between (a highlight block's icon: a box selection passes over it, a place before it is
//               the place after it); firstLineActs: its first block shows the container's handle, not a
//               handle of its own (a highlight block's, a callout's, a quote's);
//               firstBlock: the type its first block (after its lead) always is, its first line (a
//               flowchart's node: "paragraph", its title), which is turned into no other type (no
//               转换为, no Markdown shortcut there) and has nothing made, dropped or pasted before it;
//               Enter splits it, what follows the caret a plain paragraph below it (core.mjs firstLineOf);
//               firstSays: what that first line says empty, under the caret;
//               groups: a plain <div> with no class in it is a group of blocks, not a block of its own (the
//               same boxes as the shared descriptions' GROUPING_FLOWS: tests/unit/components.mjs);
//               holdsOne: a change that leaves it empty puts an empty paragraph in it, so there is always a
//               block to write in (a disclosure's content, a highlight block, a callout: core.mjs tidyEmptied);
//               emptyIsNothing: as on a unit, of a box that is an element of its own, by its `classes`;
//               outer: false, a block straight in it has no block around it for the reader, whatever
//               stands around its element: no 选中外层 (a detail card's content: block-info.mjs outerOf);
//               selectAll: the steps of Ctrl+A it is (select-all/): { content?, whole?, top? }, content:
//               its blocks are a step, called what the text says (true: "{its name}里的全部内容");
//               whole: the block it belongs to is a step, whole (a row of columns, a Sheet area); top:
//               no step above it, what is behind it not being its own (a detail card's content)
//   components  classes of elements that are one block: nothing goes in or out, their text is the
//               kit's UI or a field of theirs, and all that stands in one is its component's, whatever
//               its tag (ownerOf); attributes, the same by attribute
//   sealed      a selector: what stands in such an element is no text of a text block around it, as
//               a list item holding it (caret.mjs editable): its own text blocks are the only hosts in it
//   readOnly    why an element of it stays read-only, on hover and on a click (hints/): rules
//               { rank, at, says }, at a selector found from the element (closest), or a function
//               of the element saying whether the rule is its (an instance's own region, heldBy, which
//               no selector tells from its slots), says the reason
//               in the reader's words, or null for an element that needs none, having a tool of its
//               own. Every component's rules are tried in `rank` order, with the page's (PAGE below),
//               and the first match wins: a rule ranked below the page's 80 goes before any control's,
//               and is the one that can claim a button as its own.
//   hosts       the kinds of text block it defines (data-ge-kind): { [kind]: { name, caps, tex?, wrapped?, parts?, opensBefore?, textFilters?, formula?, closed?, inner?, pictures?, blankSays?, placeholder?, untitled?, opensBody? } }, caps
//               ({ bound, blockLevel }) giving what such a text block can do (source/); opensBefore:
//               Enter at its very start, with words in it, puts an empty paragraph before its block
//               where it does not split, as one that splits does (typing/); textFilters: false, what
//               is typed in it is taken as it is, no inline code, no space set by itself;
//               formula: false, no inline formula is offered in it or pasted as one, the kit drawing
//               none there (takesFormula);
//               closed: the page holds no text block for it until the reader opens it (a code block);
//               inner(element): the text a save takes of one, as markup, where that is not what its
//               nodes say (a code block's code); pictures: it holds pictures amid its words (a table
//               cell's), { show(root) (the file's made the page's: where the server serves them),
//               write(element) (one's markup, "" for one of no file, null for no picture) } (core.mjs);
//               parts: the parts of components ([component id, part name]: a part of its shared
//               description edited as text, src/shared/components/) whose elements are text blocks
//               of this kind, found so by the server's scan; tex: its text is a formula's TeX alone; wrapped: the page makes the text block a
//               span inside the element, which keeps its own behaviour (a Sheet tab's button);
//               blankSays: what the status line says of one left blank that must hold words, as a
//               type's says of a block of it (blankSaysOf); placeholder: what one says while it
//               is empty under the caret, whatever part it is (placeholderOf); untitled: it says its
//               placeholder whenever it is empty, the caret in it or not (the page's title:
//               typing/ updatePlaceholder); opensBody: Enter in it goes to the body, what
//               follows the caret a new paragraph right below it (the page's title: typing/ enterBody)
//   placeholders  what an empty text block says while the caret is in it: { [part]: text }, part
//               being a part of its shared description (src/shared/components/) whose element it is
//               (placeholderOf); a heading's own is its type's `placeholder`, and a type's `placeholder:
//               false` says nothing where a block of it would (a list item); a type's `untitled`, as a
//               host's: a block of it says its placeholder whenever it is empty (a heading)
//   types       the blocks the reader can make on the page or turn a block into (the "/" menu,
//               Markdown shortcuts, the block menu), written by the server in the kit's plain markup:
//               { [type]: { tag, className?, kind, box?, leaf?, wraps?, container?, part?, text?, inside?, tex?,
//               empty?, resettable?, emptyToText?, bare?, placeholder?, untitled?, bar?, label?, icon?, hint?, markdown?, words?, turn?, menu?, fresh?,
//               corner?, preload?, onSplit?, create?, takesAsIs?, holder?, nests?, joins?, leadIcon?, fromSelection?, clipboard?, glance? } } and, for the blocks the page
//               and the server write apart from text, title?, content?, keyed?, written?,
//               extras?, textHost?, blanks?, blankSays? (what each says is at its component). Leaves hold
//               inline text; containers (`box`: the kind of box they are) hold blocks; bare: a block that
//               holds no text of its own (a divider, a media block); bar: the gray bar a media block left empty shows (a function
//               giving its markup, its words in the language t() says them in: components/placeholder.mjs
//               mediaBar); resettable: an empty block of the type
//               turns into body text on Enter, and the first of its container on Backspace at its start (a
//               quote's paragraph, a list item: typing/leave.mjs); emptyToText: Backspace in an
//               empty block of the type turns it into an empty paragraph where it stands (a heading, small text: typing/leave.mjs). leaf: the text block a block turned
//               into the type becomes; wraps: such a text block sits in a container of the type, found
//               by `container` (a selector); text: a plain text leaf; empty: a leaf written with no
//               text too (a paragraph, a heading, a list item, a code block: an empty
//               one stays; the page's core.mjs and the server's source/checks.mjs read
//               this and nothing else); inside: the element its text is written in, as plain text
//               (a code block's code element); tex: its text is a formula's TeX alone (a display
//               formula; a host's `tex` says the same of a text block); label, icon,
//               hint (its Markdown) and words (search words): its menu row; markdown: what typed at
//               a block's start turns it into a type, [{ match, type?, props?, alone? }]:
//               match, a RegExp the whole text before the caret must be; type: the type
//               it makes, the one it stands on without; props(match): what the shortcut sets on
//               the block it makes, which its page object's `setProps` does, or null for not this
//               time; alone: no text may stand after it, the block holding nothing else;
//               rules are tried in the order of the definitions, a type a block cannot become passed
//               over (page/markdown/rules.mjs); turn: its place among
//               the types a text block is turned into; fresh: its place among the types made as an
//               empty block that stands for an empty one; menu: [group, place], its place in the "/"
//               menu (group "basic" or "advanced"), which the block menu's 在下方新建 shows too; corner: the
//               type in whose cell of a type grid it sits, as a gray corner, when the grid has both
//               (type-grid.mjs); preload: true, it needs something on the page as soon as a type grid
//               offers it, and before a block with text is turned into it, which its page object's
//               `preload` brings; onSplit(whole, tail): what the part split off a container of the type
//               keeps of the whole (core.mjs newTail); create(what): how a type that is no text block is
//               made (convert.mjs convertBlock), here when it is DOM alone, as `create` of the page
//               object otherwise. It does not give the data of a new block: it makes the node and
//               places it, there being no model to place it from, and it
//               also runs when a block with text is turned into the type. `what` is { type, doc, text,
//               put, stand, paragraph }: the type, the document, the text of the block it stands for,
//               put(node) putting a node at that block's place, stand(node) making a node stand for
//               that block (the save turns the unit it was into this), and paragraph() a new empty
//               paragraph. It returns the node the caret or the choice goes to (null: none); a type
//               without is a text block, made by convert.mjs standIn.
//               takesAsIs: a block turned into it goes into it as it is, each keeping its type (a
//               highlight block, a callout, a disclosure); holder: its place among the containers that turn into
//               one another, what they hold carried along; nests: false, none inside another of its
//               kind; joins: false, a block turned into it never joins the one beside it; leadIcon: the
//               icon a new one opens with; fromSelection: { label, icon }, its row of the format bar's
//               更多, which makes a block of it from the selected text (its page object's `fromSelection`).
//   entry       a chip in the text that opens something of it (a link to a detail card): { at, removed },
//               at a selector, removed what the page says when Backspace or Delete beside it took it
//               away whole (typing/code-edges.mjs), edged as inline code is
//   clipboard   how a block is copied and written out, on a type (for its description) and, where a unit
//               kind needs its own, on a unit (for an element of it, over what the first type of the kind
//               says): { kind?, level?, html?, of?, read?, apart?, headed?, claims?, describe?, data?, keeps?,
//               piece?, across?, endsIn?, lead?, run?, pastedIn?, check?, holds?, build?, text?, grid?, blocks? }
//               (docs/editor.md, "Copying blocks").
//               kind: how it is written out: the writer of that name in
//               page/clipboard/own/writers.mjs, which the copy and the page export both use; one that
//               says none is a paragraph. level: a heading's. html: the writer of its text/html when that
//               is not its kind's. of(element): the clipboard of this very
//               element, on a unit whose elements are not all written alike. read(element, how): what
//               the page export's writer needs of an element, whose markup it does not know; `how` is
//               the writer's own. apart: on a unit that is no block of the page's flow (a detail
//               card), the selector of its elements, which a page export writes after that flow, in
//               file order, and which show what they hold only when opened (APART, writtenApart);
//               reached(element): on such a unit, whether anything on the page leads to the element,
//               which the page export leaves out when nothing does.
//               headed: an entry of a list that holds blocks, its first text block its line (a
//               flowchart's node).
//               The hooks after these are there because Gallery has no block model: there is no record
//               of a block to copy as it is, a block is an element, so what is carried for one and
//               how it is made again are its component's to say. An element goes by the unit it is, and
//               a hook that says undefined leaves it to the kind its tag gives it, then to the types
//               whose mark it carries (askClipboard), an element having another component's class or
//               attribute besides its own; an hr is a divider whatever its class. claims: that mark, a
//               selector (a highlight block's class).
//               describe(node, what): the clipboard's JSON for an element, undefined when the element
//               is not its own, null when it is and cannot be copied; a text block, a list and a quote
//               need none. data(node, what): what a copy carries to be made anew where its unit
//               is not (COPIED_AS_ITSELF below), `what` being { serializeInner, copyOf, clipboardOf, page };
//               keeps: the editor's marks a pasted copy keeps;
//               unsaid: what in the markup of a copy is none of its words, a selector (UNSAID below).
//               piece(host, html, what): a text block selected in part. across(unit, what): what a
//               selection across blocks takes of a block it goes through, undefined when the block is
//               not its own; endsIn(unit, what): the same of a block it ends in (clipboard/own/
//               selection.mjs). lead: it opens the blocks it stands with and is no block of their text
//               (an icon). run: the type a run of them copied on their own makes (rules.mjs groupItems).
//               pastedIn: a box that takes it from the clipboard though accepts() does not.
//               check(block, what): whether the clipboard's JSON, which is not trusted, is such a block; a
//               type that is no `text` type and has no hook is never pasted. holds(block): the
//               blocks it holds where those are no `blocks`. build(what): the block made again, `what`
//               being { doc, block, host(type?), box(type?), inline(html), inner(blocks), one(block),
//               colored(element), pending(figure, src) }; a text type needs none, and a container
//               with no hook is filled with its blocks. Where it needs the page's modules it
//               is the `build` of its page.mjs, listed in builders.mjs: it runs with no editor too
//               (the transfer worker, the unit tests), so it is on no page object.
//               text(block, lines): its lines of text for a place that cannot split (clipboard/own/
//               blocks.mjs joinedHtml). grid(data, columns, cell): a table's rows as a Markdown table's.
//               files(block): the files of the document's folder a description names, each { path, kind }
//               (`kind` the upload kind it is kept as: image, file, embed), which a paste into another
//               document copies into that one's folder first (clipboard/carry.mjs); `build` then has them by
//               `what.fileHere(path)` and where the page serves them by `what.served(route, path)`.
//               said(block, how): what a description says to other programs where its kind's writer asks
//               (a media block's: { src, label }, its address, a file of the folder by `how.served`, and its
//               words). picture(unit): on a unit that is a picture copied alone (an image), { img, label },
//               the picture it shows and its words: a PNG of it goes on the system clipboard (clipboard/picture.mjs).
//               blocks(unit, how): what a `flatten` writes when that is not the units it holds.
//   glance      its part of a row of "Blocks at a glance" (references/writing-html.md, whose table
//               src/cli/glance-table.mjs writes from these), on a type, and on a component (one or a list)
//               for what no type stands for; the colors, no component's, are the page's (PAGE below):
//               { row, name, write, after?, before?, rule }. A type that says none has no row.
//               row: its place among the rows; the parts of one place are one row, in the order
//               of the definitions, a type's before its component's own. name: the block as the
//               user calls it, on a type its menu row's `label` as the source writes it, for these are
//               words for an Agent in whatever language the UI speaks: tests/unit/skill-docs.mjs holds
//               the two together. write: what an Agent writes; after: what the file holds after an
//               export, where that differs; before: what stands between its `write` and the one
//               before it in the row, where that is no comma; rule: the section of that file that
//               holds its rule.
//
// A component's behaviour on the page is its page.mjs, how the server writes it its file.mjs. Of
// the fields an engine reads, those that need the page are on the page object: create (above);
// preload(type), what a type that says `preload` needs brought, a promise while it comes and null
// once it is there; redraw(units), the blocks of a group turned while that was coming drawn again;
// menuVariants(), other entries of its type in the menus (on the page object, as they come from
// what the page holds: an instance's, one for each package), each { label, icon, words,
// preview?, create(what) } by its name, its key in a menu "type:name" (page-objects.mjs menuEntry);
// onCreated(block, type), what follows a new block of its type (by "/", Markdown, 在下方新建, or a
// block with no text turned from its menu), true when what comes next is its
// own, so that no caret goes in it; activate(unit), what Enter on a selected block does, every page
// object being asked and each testing the element itself, true when it was its own;
// setProps(block, props), what a Markdown shortcut's `props` set on the block it made, in
// its undo step, returning the containers that made (there is no model to set them on);
// press(event), what a press does on what is its component's (ownerOf: the nearest
// element around it that is of a component), before anything else hears of it, true when it was its
// own; keys: the keys of a text block of the component (ownerOf), each given the
// one `ctx` (docs/editor.md, "The order of keys") and true when the key was its: enter(ctx),
// shiftEnter, commandEnter, tab(ctx, back), escape, backspace, delete; around: { [key](ctx) }, the same
// keys for a block of another component that stands in it (a node's for what it holds, Esc in an open
// card, a list's for what an item holds) or right after it (`canHaveChildren`), asked of what stands
// around the block, nearest first, after the block's own component; mergeRefused(block), what it says
// of a block of it holding blocks that Backspace could not join to the line above; menuItems(target), the rows of the block
// menu that a block of the component has, by the kind of unit it is, each row as
// menu.mjs takes it; nameOf(target), what the reader calls this block where that is no kind's name (an
// instance, its package's), iconOf(target), the mark at the head of its menu;
// menu(target, { rect, reason, remove }), a menu in place of the block menu ({ items,
// label, width }, or null; reason: why the block may not go, remove(): delete it); rowBeside(target),
// a row for a block of another component, beside its color, every page object being asked and each
// testing the block itself; acceptsFile(file), whether a file pasted makes a block of it, and
// fromFiles(put, files), that block made and handed to `put(block)`, the paste's, which puts it where a
// block pasted at the caret goes (one undo step) and says whether it could (the first page object,
// in their order, that takes the file makes the block), refusesFile(file), why a
// file it takes cannot go in (too big: no block is made), and, for a file dragged in from outside
// (page/drop-in/), forFile(file), { block, fill() }: the new block, not on the page yet, and its fill once
// the drop has put it there (one undo step with it); forPicture(address), the same for a picture of
// another page dragged in; takesDrop(unit, item) and takeDrop(unit, item, options), whether an empty
// block of it (a placeholder) takes what is let go on it ({ type, name? } of a file while it is dragged,
// { file } once dropped, { address } of a picture) and that put in it (as a file dropped on its
// upload menu fills it); fromLink(figure,
// url, options), a block of the component filled from an address (the figure
// is there first: one pasted with its address, `{ pasted: true }`, a bookmark in an embed's place).
// What the rest of the editor asks of a component that does something of its own where every block
// does something: click(event), as `press`; key(event), a key on what is its own, asked of the
// component of what it came down on before any text block is looked for, true when it was its own
// (a tab's F2); undoHere(node), whether Ctrl+Z with the focus on a node of it is the page's (a tab,
// where no text block hears it); field, a text field of it that is no text block of the page's
// being edited (a tab's name), before which the block tools stand back; typed(host) and afterText(host),
// what was typed in a text block of it and what a step of its text undone or redone asks of it;
// type(host, text), text put in a text block of it that takes it as it is (`textFilters`: pasted, a
// line break that came with no key); shortcut(host, data), what `data` just typed in a text block of it
// makes before any type's `markdown` is read, true when it made something (a list in a cell);
// fromSelection(), a block of its type made from the selected text; fromPage(page), one made from what
// a web page says of itself (a link turned into a bookmark); pageIcon(), the page's own icon as it
// shows, or nothing; columnOps, sectionOps, rowOps, what the block tools do with rows of columns and
// with sections, and what the gaps in a row resize, read of whichever page object says them (as the
// drag reads `columnOps`), which keeps each name in one place; modalOps, in the same way,
// what stands open over the page as a modal: open(), the ones open, the one on top last,
// listen(listener), told when that may have changed, closeTop(), the one on top closed, show(node),
// what holds `node` shown for what lands in it, returning where it is, and kept() and reopen(kept),
// for a page shown again; keepsKeys(node, event), whether what happens on a node is its own: its keys, the
// clipboard and a drag there, the editor letting go (keptByComponent, page-objects.mjs), `event` the key
// where one is asked about; dataOf(unit), what of a block its component writes, by part, as the file is to
// hold it (nothing where it writes nothing), what core.mjs dataChanges compares, dataIn(html), the same of
// the file's markup of one (a block a commit wrote whole), dataMost, what one commit carries of it in
// bytes, and definitionOf(unit), the stamp of what it was written by, which the commit carries;
// prepare(block, node), of a kind of text block that says `closed` or `tex`, as editing starts,
// returning its baseline where it has one; panel, an editor of it open over the page, which saving
// waits for and which a press elsewhere, or the page saved or left, ends (`dismiss()`), `holds(node)`
// saying what is no press elsewhere;
// nodes, the elements of it to keep in the top
// layer when a modal dialog opens; install(), called once the block tools are there; blockTools(tools),
// a part of it made with the block tools, { holds(node), hide(), nodes }; tidy(parents), what a
// structural step may leave untidy (history.mjs), each asked in turn; nestBlocks(units, delta),
// selected blocks indented or outdented; addNear(unit, before), the handle's "+" on a block of it,
// undefined to leave it to the page; openAt(pre, point), code closed opened (caret.mjs).
// A new kit component gets a folder of its own and a line below.
export const COMPONENTS = [paragraph, heading, list, flowchart, quote, callout, highlight, details, code, divider, section, sheets, table, figure, image, file, bookmark, embed, columns, math, dialog, widget, icon, installed];

// The "/" menu's groups, in order (MENU_GROUPS below says the same).
const MENU_GROUP_ORDER = ["basic", "advanced"];
const menuRank = ({ menu }) => MENU_GROUP_ORDER.indexOf(menu[0]) * 1000 + menu[1];
// The mark of a component's line in 设置 › 组件列表: the icon of its first row in the "/" menu, the
// same drawing; one with no type there (分区) shows its first unit's (`icon`, a kind no type stands for).
const listedIcon = ({ types = {}, units = {} }) => Object.values(types).filter((spec) => spec.menu && spec.icon).sort((a, b) => menuRank(a) - menuRank(b))[0]?.icon
  ?? Object.values(units).find((unit) => unit.icon)?.icon ?? null;

/** The built-in components 设置 › 组件列表 lists: { id, name() (in the language t() says it in), icon (svg markup), hideable }, by the order above. */
export const LISTED_BLOCKS = COMPONENTS.filter((component) => component.listed).map((component) => ({ id: component.name, name: component.listed, icon: listedIcon(component), hideable: component.hideable ?? true }));
for (const { id, icon } of LISTED_BLOCKS) if (!icon) throw new Error(`component ${id} has a line in the settings (listed), so it needs an icon: a type in the "/" menu, or a unit's icon`);

/** The names of those the reader may hide. */
export const HIDEABLE = new Set(LISTED_BLOCKS.filter(({ hideable }) => hideable).map(({ id }) => id));

/** The built-in components `names`, gallery.json's `hidden`, hide: a package's id there says no block, and a hand's `paragraph` hides none. */
export const blocksHidden = (names) => names.filter((name) => HIDEABLE.has(name));

/** The shared description (src/shared/components/) a component edits: its own name's, or the one it names (`description`). */
export const descriptionOf = (component) => component.description ?? component.name;

// A block's identity: an opaque, meaningless id that the page's edits and merges find it by,
// wherever it moved and however it changed. Only units carry one (paragraphs, headings, list items,
// cards, tables, disclosures, sections...), never cells or inline elements.
// It binds nothing: a block with it still changes type, splits and merges like one without.
export const IDENTITY = "data-block-id";

// What is no component's: the page and its header, plain grouping divs, the text blocks every
// flow has (paragraphs, headings and list items, the report's title), and the caption of the media
// blocks, which stays with whichever of them there are.
const PAGE = {
  glance: { row: 19, name: "颜色", write: "`doc-text-<color>`, `doc-highlight-<color>` on the block", rule: "Kit blocks" },
  boxes: { main: { role: "root", name: t("页面") }, plain: { role: "flow", name: t("分组") }, header: { role: "lines", name: t("页眉"), also: ["icon"] } }, // the page's icon stands in the header
  hosts: {
    // A free text block may be left empty: written as an empty element, one line high.
    flow: { opensBefore: true, caps: ({ bound }) => bound ? ["split", "merge", "links"] : ["split", "merge", "remove", "empty", "links"] },
    // The page's title may be left empty: an untitled document, its title
    // saying 未命名文档 in gray (`untitled`), never written into the file; whatever names the document
    // names it so (the workbench's reportTitle, links/pages.mjs, an export's <title>). Enter in it goes to the
    // body (`opensBody`: typing/ enterBody).
    title: { name: t("文档主标题"), caps: () => ["plain", "empty"], placeholder: t("未命名文档"), untitled: true, opensBody: true },
    ...MEDIA_HOSTS,
  },
  readOnly: [
    { rank: 80, at: "button, label, input, select, textarea", says: t("交互控件暂不能在页面上修改。") },
    { rank: 110, at: "figure, svg, canvas", says: t("图是页面画出来的；要改它的数据或画法，请让 Agent 修改。") },
  ],
};

const all = (part) => Object.assign({}, ...[PAGE, ...COMPONENTS].map((component) => component[part] ?? {}));
const UNITS = all("units");
const BOXES = all("boxes");
const flagged = (flag) => new Set(Object.keys(UNITS).filter((kind) => UNITS[kind][flag]));
const byRank = (rows) => rows.sort((a, b) => a.rank - b.rank).map(({ rank, ...row }) => row);

/** Unit kinds by element, first match wins (source/ unitKind). */
export const UNIT_KINDS = byRank(Object.entries(UNITS).flatMap(([kind, unit]) => (unit.match ?? []).map((rule) => ({ ...rule, kind }))));

/** The kit's containers whose children are units, by class, and the kind of box each is (first match). */
export const BOX_CLASSES = byRank(Object.entries(BOXES).flatMap(([kind, box]) => (box.classes ?? []).map((rule) => ({ rank: rule.rank, row: [rule.class, kind] })))).map(({ row }) => row);

/** The component that defines each block type, by name: its page object in components/pages.mjs. */
export const TYPE_COMPONENT = Object.fromEntries(COMPONENTS.flatMap((component) => Object.keys(component.types ?? {}).map((type) => [type, component.name])));

/** The component that defines each kind of unit, by name. */
export const UNIT_COMPONENT = Object.fromEntries(COMPONENTS.flatMap((component) => Object.keys(component.units ?? {}).map((kind) => [kind, component.name])));

/** Elements that are one block, by class or by attribute. */
export const COMPONENT_CLASSES = COMPONENTS.flatMap((component) => component.components ?? []);
export const COMPONENT_ATTRIBUTES = COMPONENTS.flatMap((component) => component.attributes ?? []);

/** The category of each unit kind: its component's (src/shared/components/), "block", "container", "card" or "whole". */
export const UNIT_CATEGORY = Object.fromEntries(COMPONENTS.flatMap((component) => Object.keys(component.units ?? {}).map((kind) => [kind, componentOf(descriptionOf(component))?.category ?? null])));

/** The unit kinds of the basic blocks: their text blocks are their own lines, where a container's or a card's are blocks in it. */
export const BASIC_UNITS = new Set(Object.keys(UNIT_CATEGORY).filter((kind) => UNIT_CATEGORY[kind] === "block"));

/** What the reader calls each category. */
export const CATEGORY_NAMES = Object.fromEntries(Object.entries(CATEGORIES).map(([category, { name }]) => [category, name]));

/**
 * The unit kinds copied as themselves (clipboard/own/, source/commit.mjs): a card, and a table or a
 * row of columns (copy: "itself"), which the page can make but which keep all their own markup
 * within the report.
 */
export const COPIED_AS_ITSELF = new Set(Object.entries(UNITS).filter(([kind, unit]) => UNIT_CATEGORY[kind] === "card" || unit.copy === "itself").map(([kind]) => kind));

/**
 * The unit kinds drawn with no selection fill while selected alone (their own tools show it), each with
 * the selector its element must hold for that (an image with its picture: a placeholder is filled).
 */
export const UNFILLED_ALONE = Object.fromEntries(Object.entries(UNITS).filter(([, unit]) => unit.unfilled).map(([kind, unit]) => [kind, unit.unfilled]));

/** What the reader calls each kind of unit (block labels while dragging, the block menu). */
export const KIND_NAMES = Object.fromEntries(Object.entries(UNITS).filter(([, unit]) => unit.name).map(([kind, unit]) => [kind, unit.name]));

/** How gallery read writes each kind of unit (its `read`), by kind. */
export const READS = Object.fromEntries(Object.entries(UNITS).filter(([, unit]) => unit.read).map(([kind, unit]) => [kind, unit.read]));

/** The icons of unit kinds no block type stands for (the block menu's 分区与分栏 row shows the columns'). */
export const KIND_ICONS = Object.fromEntries(Object.entries(UNITS).filter(([, unit]) => unit.icon).map(([kind, unit]) => [kind, unit.icon]));

/** What the reader calls each kind of box (the container a drop goes into). */
export const BOX_NAMES = Object.fromEntries(Object.entries(BOXES).filter(([, box]) => box.name).map(([kind, box]) => [kind, box.name]));

/** Why an element stays read-only, the first rule that finds it, in rank order: { at, says } (`readOnly`; hints/). */
export const READ_ONLY_HINTS = byRank([PAGE, ...COMPONENTS].flatMap((component) => component.readOnly ?? []));

/** The kinds of text block: what the reader calls each (refusals) and what each can do (source/). */
export const HOSTS = all("hosts");

/** What a text block left blank says: its kind's or its type's (`blankSays`), or null. */
export const blankSaysOf = (node) => HOSTS[node.getAttribute("data-ge-kind")]?.blankSays ?? BLOCK_TYPES[blockTypeOf(node)]?.blankSays ?? BLOCK_TYPES[textTypeOf(node)]?.blankSays ?? null;

/** Whether what is typed in a text block is read as text (`textFilters`: not in code, nor in a tab's name). */
export const textFilters = (host) => HOSTS[host.getAttribute("data-ge-kind")]?.textFilters !== false;

/** Whether a text block takes an inline formula (`formula`: not an instance's text part, where the kit draws none). */
export const takesFormula = (host) => HOSTS[host.getAttribute("data-ge-kind")]?.formula !== false;

/** Whether a text block's text is a formula's TeX alone (`tex`: a formula block's), which changes in the formula editor alone. */
export const texOnly = (host) => Boolean(HOSTS[host?.getAttribute("data-ge-kind")]?.tex);
export const HOST_NAMES = Object.fromEntries(Object.entries(HOSTS).filter(([, host]) => host.name).map(([kind, host]) => [kind, host.name]));

/**
 * What a text block of `kind` can do, as the text of its data-ge-caps attribute: how the page makes
 * one (nothing refers to it), which is what the server finds in the file for the same block unless
 * that is bound (`bound`).
 */
export const capsFor = (kind, { bound = false } = {}) => HOSTS[kind].caps({ bound, blockLevel: true }).join(" ");

const HINTS = COMPONENTS.flatMap((component) => Object.entries(component.placeholders ?? {})
  .map(([part, text]) => ({ match: componentOf(descriptionOf(component)).match, at: componentOf(descriptionOf(component)).parts[part].at, text })));

/**
 * What an empty text block says while the caret is in it, when its kind says (`placeholder` of
 * `hosts`) or it is the part of a component that says (`placeholders` above), or null. Whatever the
 * block's source: a part of the file says the same as one made on the page.
 */
export const placeholderOf = (host) => HOSTS[host.getAttribute("data-ge-kind")]?.placeholder ?? HINTS.find(({ match, at }) => host.closest(match)?.querySelector(at) === host)?.text ?? null;

// ---------- block types ----------

/** The blocks the reader can make or turn a block into, by type (see `types` above). */
export const BLOCK_TYPES = all("types");

/** Whether a type (its entry in BLOCK_TYPES) is a container whose blocks stand straight in its element: no title, no content region of its own. */
export const holdsStraight = (spec) => Boolean(spec?.box) && !spec.content && !spec.title;

// What each type says of where it shows (`types` above): turn, its place among the types a text
// block is turned into; fresh, its place among the types made as an empty block that stands for an
// empty one (a divider, a media block, a table...); menu, [group, place] in the "/" menu. A type that
// is either must be in the menu, which the block menu's 在下方新建 shows too.
const inOrder = (rank) => {
  const found = Object.entries(BLOCK_TYPES).map(([type, spec]) => [type, rank(spec)]).filter(([, place]) => place !== undefined).sort((a, b) => a[1] - b[1]);
  for (let index = 1; index < found.length; index++) if (found[index][1] === found[index - 1][1]) throw new Error(`two block types share a place: ${found[index - 1][0]}, ${found[index][0]}`);
  return found.map(([type]) => type);
};
for (const [type, spec] of Object.entries(BLOCK_TYPES)) {
  if ((spec.turn !== undefined || spec.fresh !== undefined) && !spec.menu) throw new Error(`block type ${type} is made or turned into, so it needs a menu place`);
  if (spec.menu && !LISTED_BLOCKS.some(({ id }) => id === TYPE_COMPONENT[type])) throw new Error(`block type ${type} has a menu place, so its component needs a line in the settings (listed)`);
}

/** The types a text block can be turned into, in menu order. */
export const TURN_INTO = inOrder((spec) => spec.turn);

/** The types made as an empty block standing for an empty one: no text is carried into them. */
export const FRESH = inOrder((spec) => spec.fresh);

/** The containers that turn into one another, what they hold carried along, in menu order (`holder`). */
export const HOLDERS = inOrder((spec) => spec.holder);

/** The "/" menu's groups of block types, in order: { basic, advanced } (the menu says their names). */
export const MENU_GROUPS = Object.fromEntries(MENU_GROUP_ORDER.map((group) => [group, inOrder((spec) => (spec.menu?.[0] === group ? spec.menu[1] : undefined))]));

/** The types a block is made of from selected text, each with its row of the format bar's 更多 (`fromSelection`). */
export const FROM_SELECTION = Object.entries(BLOCK_TYPES).filter(([, spec]) => spec.fromSelection).map(([type, spec]) => ({ type, ...spec.fromSelection }));

/** The Markdown shortcuts at a block's start, in the order of the definitions: each rule with its type (`markdown` above). */
export const MARKDOWN = Object.entries(BLOCK_TYPES).flatMap(([type, spec]) => (spec.markdown ?? []).map((rule) => ({ type, ...rule })));

const GLANCE_PARTS = [PAGE, ...COMPONENTS].flatMap((component) => [...Object.values(component.types ?? {}).map((spec) => spec.glance), component.glance].flat().filter(Boolean));

/** The rows of "Blocks at a glance", in their places: each the parts that say that place (`glance`). */
export const GLANCE = [...new Set(GLANCE_PARTS.map(({ row }) => row))].sort((a, b) => a - b).map((row) => GLANCE_PARTS.filter((part) => part.row === row));

/** Names, icons, Markdown shortcuts and search words of the block types, as menu rows show them. */
export const TYPE_INFO = Object.fromEntries(Object.entries(BLOCK_TYPES).filter(([, spec]) => spec.label)
  .map(([type, { label, icon, hint, words }]) => [type, { label, icon, ...(hint ? { hint } : {}), words }]));

/**
 * The type of block an element is, as its components describe it: its data-ge-type when it has
 * one (made on the page), else the type whose tag and class it has. Null when none.
 */
export function blockTypeOf(element) {
  const marked = element.getAttribute?.("data-ge-type");
  if (BLOCK_TYPES[marked]) return marked;
  return CLASSED.find(([, spec]) => element.localName === spec.tag && element.classList.contains(spec.className))?.[0] ?? null;
}
const CLASSED = Object.entries(BLOCK_TYPES).filter(([, spec]) => spec.className);

/**
 * The type of a text block's element: its own (blockTypeOf), else the plain type of its tag, which
 * has no class to tell it by (a paragraph, a heading, a list item). Null when none.
 */
export function textTypeOf(element) {
  return blockTypeOf(element) ?? PLAIN[element.localName] ?? null;
}
const PLAIN = {};
for (const [type, spec] of Object.entries(BLOCK_TYPES)) {
  if (spec.className || !["paragraph", "heading", "item"].includes(spec.kind)) continue;
  if (PLAIN[spec.tag]) throw new Error(`two plain text types share <${spec.tag}>: ${PLAIN[spec.tag]}, ${type}`);
  PLAIN[spec.tag] = type;
}

/** The component that defines each kind of text block, by name. */
export const HOST_COMPONENT = Object.fromEntries(COMPONENTS.flatMap((component) => Object.keys(component.hosts ?? {}).map((kind) => [kind, component.name])));

// The elements that are one block (`components`, `attributes`), with the component of each.
const ONE_BLOCK = COMPONENTS.flatMap((component) => [...(component.components ?? []).map((name) => `.${name}`), ...(component.attributes ?? []).map((name) => `[${name}]`)].map((at) => ({ at, name: component.name })));
const ONE_BLOCK_AT = ONE_BLOCK.map(({ at }) => at).join(", ");
/** What no text block around it reaches into (`sealed`), a selector, "" where no component says. */
export const SEALED = COMPONENTS.map((component) => component.sealed).filter(Boolean).join(", ");

// What is one block is found inside the slot whose inside is the document's region an element stands
// in, where it does (an instance's slot holds blocks of their own: installed.mjs slotAround).
const oneBlockOf = (element) => {
  const region = slotAround(element);
  let whole = null;
  for (let around = element.closest(ONE_BLOCK_AT); around && (!region || region.contains(around)); around = around.parentElement?.closest(ONE_BLOCK_AT)) whole = around;
  return whole && ONE_BLOCK.find(({ at }) => whole.matches(at)).name;
};

// The parts its description edits as text, with the component of each: a figure's title, a heading
// by its tag alone.
const TEXT_PARTS = COMPONENTS.flatMap((component) => {
  const { match, parts = {} } = componentOf(descriptionOf(component)) ?? {};
  return Object.values(parts).filter((part) => part.edit === "text").map(({ at }) => ({ name: component.name, match, at }));
});
const textPartOf = (element) => TEXT_PARTS.find(({ match, at }) => [...(element.closest(match)?.querySelectorAll(at) ?? [])].includes(element))?.name;

/**
 * The component an element is of, by name, or null. Nothing inside an element that is one block is
 * anyone else's, whatever its tag or class (a cell's list, a Sheet's tab), but what an instance's slot
 * holds, the document's blocks, each its own. Else that of its kind of text
 * block, where a component defines the kind (a cell, a tab's name), that of the text part of a
 * component it is, that of the unit it is (a flowchart's node, though an li) and last that of its type
 * (a list's item made on the page). What stands in a container is its own component's, not the
 * container's: that of the block the caret is in, not of what holds it.
 */
export const ownerOf = (element) => oneBlockOf(element) ?? HOST_COMPONENT[element.getAttribute("data-ge-kind")] ?? textPartOf(element) ?? UNIT_COMPONENT[element.getAttribute("data-ge-unit-kind")] ?? TYPE_COMPONENT[textTypeOf(element)] ?? null;

/** The chips in a text that open something of a component and go whole by Backspace or Delete (`entry`), with what the page says then. */
export const ENTRIES = COMPONENTS.map((component) => component.entry).filter(Boolean);

/** Whether a block right after this element goes under it by Tab (`canHaveChildren`). */
export const canHaveChildren = (element) => Boolean(UNITS[element.getAttribute("data-ge-unit-kind")]?.canHaveChildren);

/**
 * The elements a new block's text blocks may be part of rather than blocks of their own (a new
 * disclosure's summary, a new code block's pre), as their components declare them (`part`).
 */
export const PART_SELECTOR = Object.values(BLOCK_TYPES).map((spec) => spec.part).filter(Boolean).join(", ");

/**
 * The box of kind `kind` (and `key`) of a unit's element: where its component's description says
 * (`find`: a list item's lists, a disclosure's content region, a Sheet area's panels), else the
 * element itself when it is a box of that kind.
 */
export function boxIn(unit, kind, key = null) {
  const find = BOXES[kind]?.find;
  if (find) return find(unit, key) ?? null;
  return unit.getAttribute("data-ge-box-kind") === kind ? unit : null;
}

/**
 * The element of the unit that takes the box `element` along (its component's `owner`: a Sheet
 * panel's tab), or null. What changes in such a box changes that unit too: its hash covers it.
 */
export const boxOwner = (element) => BOXES[element.getAttribute("data-ge-box-kind")]?.owner?.(element) ?? null;

/** Whether the unit `element` takes the box `{ kind, key }` along (its component's `takenBy`), the two on the page or not. */
export const takesBox = (element, { kind, key }) => Boolean(element && BOXES[kind]?.takenBy?.(element, key));

/** The text blocks that can be made again as new blocks, from their words alone (paragraphs, small text, headings). */
const FROM_WORDS = flagged("fromWords");
export const PLAIN_TEXT = new Set(Object.keys(BLOCK_TYPES).filter((type) => FROM_WORDS.has(BLOCK_TYPES[type].kind)));

/** Plain text leaves (paragraphs, small text, headings). */
export const TEXT_TYPES = new Set(Object.keys(BLOCK_TYPES).filter((type) => BLOCK_TYPES[type].text));

/** The heading type of each heading tag (H1 -> heading1). */
export const HEADING_TYPES = Object.fromEntries(Object.entries(BLOCK_TYPES).filter(([, spec]) => spec.kind === "heading").map(([type, spec]) => [spec.tag.toUpperCase(), type]));

// ---------- how a block is copied and written out ----------

const PARAGRAPH = { kind: "paragraph" };

/** The `clipboard` of a block type; one that says no kind is a paragraph. */
export const clipboardOf = (type) => ({ ...PARAGRAPH, ...BLOCK_TYPES[type]?.clipboard });

// The type a unit kind goes by, when it says nothing itself: the first of that kind.
const TYPE_OF_KIND = {};
for (const [type, spec] of Object.entries(BLOCK_TYPES)) TYPE_OF_KIND[spec.kind] ??= type;

// The `clipboard` of an element as a unit of `kind`: what the unit says over what the first type of the
// kind does, its own where that says `of`. A kind that is none goes as a whole block, as anything no
// rule matches does.
function kindClipboard(kind, element) {
  const said = UNITS[kind] ? { ...BLOCK_TYPES[TYPE_OF_KIND[kind]]?.clipboard, ...UNITS[kind].clipboard } : UNITS.block?.clipboard;
  return { ...PARAGRAPH, ...said, ...said?.of?.(element) };
}

/** The `clipboard` of an element of the page, as the unit it is. */
export const unitClipboard = (element) => kindClipboard(element.getAttribute("data-ge-unit-kind"), element);

// The kind an element's tag gives it (`match` rules that name one, with what they say of its class,
// attribute and parent): a class of another component may have given it another.
const TAG_RULES = UNIT_KINDS.filter((rule) => rule.tag);
const isOf = (element, tag, name) => (!tag || [tag].flat().includes(element?.localName)) && (!name || Boolean(element?.classList.contains(name)));
export const tagKind = (element) => TAG_RULES.find(({ tag, class: name, attr, parent }) => isOf(element, tag, name) && (!attr || element.hasAttribute(attr)) && (!parent || isOf(element.parentElement, parent.tag, parent.class)))?.kind;

const CLAIMING = Object.values(BLOCK_TYPES).map((spec) => spec.clipboard).filter((clipboard) => clipboard?.claims);

/**
 * What the hook `name` of the `clipboard` says of an element, which goes first of all by the unit it
 * is. A hook that says undefined leaves it to the kind its tag gives it, then to the block whose mark
 * it carries (`claims`): an element may have the class or the attribute of a component besides its
 * own. A tag whose block holds nothing (`bare`: an hr) comes before the unit: no class makes that a
 * block of another kind.
 */
export function askClipboard(name, element, ...question) {
  const kind = tagKind(element);
  const owners = [unitClipboard(element), kindClipboard(kind, element)];
  if (BLOCK_TYPES[TYPE_OF_KIND[kind]]?.bare) owners.reverse();
  for (const clipboard of [...owners, ...CLAIMING.filter(({ claims }) => element.matches(claims))]) {
    const answer = clipboard[name]?.(element, ...question);
    if (answer !== undefined) return answer;
  }
  return undefined;
}

const WRITTEN_APART = Object.values(UNITS).map((unit) => unit.clipboard).filter((clipboard) => clipboard?.apart);

/** The elements that are no block of the page's flow (`apart`), as a selector. */
export const APART = WRITTEN_APART.map((clipboard) => clipboard.apart).join(", ");

/** What a page export writes after the page's flow: those elements of `document` that are reached, each with its `clipboard`. */
export const writtenApart = (document) => WRITTEN_APART.flatMap((clipboard) => [...document.querySelectorAll(clipboard.apart)].filter((element) => clipboard.reached?.(element) ?? true).map((element) => ({ element, clipboard })));

/** The `clipboard` hook `name` of each type that has it. */
export const clipboardHooks = (name) => Object.values(BLOCK_TYPES).map((spec) => spec.clipboard?.[name]).filter(Boolean);

/** The editor's marks a pasted copy keeps (`keeps`). */
export const COPY_KEEPS = new Set(Object.values(BLOCK_TYPES).flatMap((spec) => spec.clipboard?.keeps ?? []));

/** What in the markup of a block copied as itself is none of its words: what only a browser reads, and what a unit says (`unsaid`). */
export const UNSAID = ["script, style, template", ...Object.values(UNITS).flatMap((unit) => unit.clipboard?.unsaid ?? [])].join(", ");

// ---------- where blocks may go ----------
// The report is one document of chapters (sections and Sheet areas), each a flow of blocks. Every
// box (findUnits) has a role; the page and the server both check a move against it. Flows are
// the content of sections, panels, disclosures, dialogs, columns and plain grouping divs: body
// text and components read the same in all of them (see "body text in flows" in
// src/render/kit/styles/flow.css), so a block may go into any flow; a column takes any block but
// another row of columns. The report's header takes paragraphs (the lines under its title), a
// quote paragraphs, a row of columns its columns, a list its items, a tab row its own tabs. The
// opening summary is a highlight panel like any other.
const ROLES = Object.fromEntries(Object.entries(BOXES).map(([kind, box]) => [kind, box.role]));
/** What a chapter is: the page and Sheet panels hold these besides body text. */
export const CHAPTER = flagged("chapter");
const FIXED = flagged("fixed"); // never inside a flow
/** What may stand first in a chapter as the line above its heading (`leadsChapter`: a divider, fold/). */
export const LEADS_CHAPTER = flagged("leadsChapter");

/** The kinds of box a plain <div> without a class is a group of blocks in (`groups`; source/units.mjs boxKind). */
export const GROUPING = new Set(Object.keys(BOXES).filter((kind) => BOXES[kind].groups));

/** The role of a box of this kind. */
export const boxRole = (kind) => ROLES[kind] ?? "flow";

/** The box kinds that always hold a block: one a change leaves empty gets an empty paragraph (`holdsOne`). */
export const HOLDS_ONE = new Set(Object.keys(BOXES).filter((kind) => BOXES[kind].holdsOne));

/** The box kinds whose empty last block Enter moves out after the box (`leaveByEnter`). */
export const LEAVES_BY_ENTER = new Set(Object.keys(BOXES).filter((kind) => BOXES[kind].leaveByEnter));

/** Whether what is under the last block of a box of this kind is its own padding (`endIsPadding`): a click there makes no block (geometry.mjs endOf). */
export const endIsPadding = (boxKind) => Boolean(BOXES[boxKind]?.endIsPadding);

/** The unit kinds Backspace deletes whole once nothing is written in them (`removedEmpty`). */
export const REMOVED_EMPTY = Object.keys(UNITS).filter((kind) => UNITS[kind].removedEmpty);

/** Whether Backspace in any of the text blocks of a unit of this kind deletes it (`removedEmpty: "anywhere"`), not only in its first. */
export const removedFromAnywhere = (kind) => UNITS[kind]?.removedEmpty === "anywhere";

/**
 * What may stand in a container Backspace deletes whole, nothing being written in it (`emptyIsNothing`:
 * the tags of the text blocks and of what holds them, and the classes of a box that holds them, a
 * disclosure's content): a block of any other kind is something there.
 */
const NOTHING_EMPTY = flagged("emptyIsNothing");
export const TEXT_BLOCKS = [...new Set(Object.values(BLOCK_TYPES).filter((spec) => NOTHING_EMPTY.has(spec.kind)).map((spec) => spec.tag)), ...Object.values(BOXES).filter((box) => box.emptyIsNothing).flatMap((box) => box.classes.map((rule) => `.${rule.class}`))].join(", ");

/** Whether an empty unit of this kind gives its place to a file pasted at its caret (`replacedByFile`). */
export const replacedByFile = (kind) => Boolean(UNITS[kind]?.replacedByFile);

/** Whether what a unit of this kind is turned into is an empty block in its place (`turnsEmpty`). */
export const turnsEmpty = (kind) => Boolean(UNITS[kind]?.turnsEmpty);

const ALSO = Object.fromEntries(Object.entries(BOXES).filter(([, box]) => box.also).map(([kind, box]) => [kind, new Set(box.also)]));

/** The kind of unit a box of this kind opens with as its fixed head (`lead`), or null. */
export const leadOf = (boxKind) => BOXES[boxKind]?.lead ?? null;
/** Whether a unit of `kind` is the lead of a box of `boxKind` (false for a box with none, whatever the kind: null is no lead). */
export const isLead = (boxKind, kind) => {
  const lead = leadOf(boxKind);
  return lead !== null && kind === lead;
};

/** Whether the first block of a box of this kind shows the box's handle (`firstLineActs`). */
export const firstLineActs = (boxKind) => Boolean(BOXES[boxKind]?.firstLineActs);

/** The type the first block of a box of this kind always is (`firstBlock`: a flowchart node's title, "paragraph"), or null. */
export const firstBlockOf = (boxKind) => BOXES[boxKind]?.firstBlock ?? null;

/** What that first line says empty (`firstSays`), or null. */
export const firstSaysOf = (boxKind) => BOXES[boxKind]?.firstSays ?? null;

// ---------- what the reader sees of a unit ----------

/** Whether a unit of this kind is a block of its own for the reader (`block`: no column is). */
export const isBlock = (kind) => UNITS[kind]?.block !== false;

/** Whether a unit of this kind is ever selected (`selectable`: no icon is). */
export const isSelectable = (kind) => UNITS[kind]?.selectable !== false;

/** Whether a block straight in a box of this kind may have a block around it (`outer`: none in a detail card's content). */
export const hasOuter = (boxKind) => BOXES[boxKind]?.outer !== false;

/** The unit kinds with a frame of their own (`boxed`): a double click between two makes a paragraph (insert/). */
export const BOXED = flagged("boxed");

/** The unit kinds a click to the right of one puts the caret after (page/after/): the boxed ones and those that say `beside` (beside.mjs). */
export const BESIDE = new Set([...BOXED, ...flagged("beside")]);

/** Whether a unit of this kind stands beside another now, `element` being that unit (`beside`, `inRow`). */
export const standsBeside = (kind, element) => Boolean(UNITS[kind]?.beside || UNITS[kind]?.inRow?.(element));

/** The unit kinds whose height is the tallest's beside them (`sharesHeight`: annotate/). */
export const SHARES_HEIGHT = flagged("sharesHeight");

/** Whether `node` is a picture standing as a block, a block's first line before any words (its caption's): where the handle and a marker stand. */
export const standsAsPicture = (node) => node.matches("img") && getComputedStyle(node).display === "block";

/** The unit kinds Enter on one selected puts a paragraph after, unless it is a text block: those and the ones that say `entersAfter` (beside.mjs). */
export const ENTERS_AFTER = new Set([...BESIDE, ...flagged("entersAfter")]);

/** The unit kinds whose edges resize (`resizable`: resize/). */
export const RESIZABLE = flagged("resizable");

/** The elements those edges may belong to: their `resizable` selectors, as one. */
export const RESIZABLE_AT = Object.values(UNITS).map((unit) => unit.resizable).filter(Boolean).join(", ");

/** The steps of Ctrl+A a box of this kind is (`selectAll`), or null when it is none. */
export const selectAllOf = (boxKind) => BOXES[boxKind]?.selectAll ?? null;

/** Whether a block menu offers a new block below a unit of this kind (`below`: none for a tab or a Sheet area). */
export const takesBelow = (kind) => UNITS[kind]?.below !== false;

/** Where the handle of a unit of this kind stands: "line", "bar", "none" or "outer" (`handle`). */
export const handleOf = (kind) => UNITS[kind]?.handle ?? "line";

/** Whether a box of this kind takes a unit of this kind. */
export function accepts(boxKind, unitKind) {
  if (ALSO[boxKind]?.has(unitKind)) return true; // a highlight block's icon, the page's icon in the header (it comes first: source/apply.mjs)
  switch (boxRole(boxKind)) {
    case "root": return CHAPTER.has(unitKind) || !FIXED.has(unitKind); // chapters, and body text as a flow takes it
    case "flow": return !FIXED.has(unitKind);
    case "lines": return unitKind === "paragraph"; // the header: its lines (and the page's icon: `also`)
    case "quote": return unitKind === "paragraph";
    case "column": return !FIXED.has(unitKind) && unitKind !== "columns"; // no row of columns in a column
    case "columns": return unitKind === "column";
    case "list": return unitKind === "item";
    case "nest": return !FIXED.has(unitKind) && unitKind !== "columns"; // a list item holds blocks after its text (no row of columns)
    case "steps": return unitKind === "step"; // a flowchart: its steps (nodes) alone
    case "tabs": return unitKind === "tab";
    default: return false;
  }
}

// ---------- sizes, class switches and attributes ----------

/** The families of colors a unit kind takes (颜色 in the block menu), by kind: those that say `colors`. */
export const COLOR_FAMILIES = Object.fromEntries(Object.entries(UNITS).filter(([, unit]) => unit.colors?.length > 0).map(([kind, unit]) => [kind, unit.colors]));

/** The color of each family a unit kind shows with none of it, when that is one of the nine, by kind: those that say `colorDefaults` ({ background: "blue" }). */
export const COLOR_DEFAULTS = Object.fromEntries(Object.entries(UNITS).filter(([, unit]) => unit.colorDefaults).map(([kind, unit]) => [kind, unit.colorDefaults]));

/** Classes a block may switch on the page, by unit kind: its own, then its colors' (the server allows the same). */
export const TOGGLES = Object.fromEntries(Object.entries(UNITS).map(([kind, unit]) => [kind, [...(unit.toggles ?? []), ...(COLOR_FAMILIES[kind] ?? []).flatMap((family) => COLOR_CLASSES[family])]]).filter(([, names]) => names.length > 0));

/**
 * Sizes a block may carry, by unit kind: custom properties in its style attribute ("Sizes" in
 * src/render/kit/styles/sizes.css) and the values each takes: a share (a number), a length in px, or none.
 */
export const SIZES = Object.fromEntries(Object.entries(UNITS).filter(([, unit]) => unit.sizes).map(([kind, unit]) => [kind, unit.sizes]));

// The last digit of arithmetic: a share worked out to the least or the most a size takes (1/24 less a
// rounding error) is that, not out of range.
const EDGE = 1e-9;

/** The text a size is written as (a share to three places, a length to a whole px), or null when the kind does not take it. */
export function sizeValue(kind, name, value) {
  const rule = SIZES[kind]?.[name];
  if (!rule || typeof value !== "string") return null;
  const text = value.trim();
  if (rule.none && text === "none") return text;
  const match = (rule.px ? /^(\d+(?:\.\d+)?)px$/ : /^(\d*\.?\d+)$/).exec(text);
  const number = match ? Number(match[1]) : NaN;
  if (!(number >= rule.min - EDGE && number <= rule.max + EDGE)) return null;
  return rule.px ? `${Math.round(number)}px` : String(Math.round(number * 1000) / 1000);
}

/**
 * Attributes a block may set on the page, by unit kind (a code block's language): each with the
 * test of the values it takes. Set or removed in its start tag, as classes are switched.
 */
export const ATTRIBUTES = Object.fromEntries(Object.entries(UNITS).filter(([, unit]) => unit.attributes).map(([kind, unit]) => [kind, unit.attributes]));

/** Whether a kind takes this value of this attribute (null: the attribute removed). */
export const attributeValue = (kind, name, value) => Boolean(ATTRIBUTES[kind]?.[name]) && (value === null || (typeof value === "string" && ATTRIBUTES[kind][name](value)));
