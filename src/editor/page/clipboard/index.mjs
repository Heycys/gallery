import { escapeMarkup, escapeText, escapeTyped } from "../../../shared/escape.mjs";
import { mayBePage } from "../../../shared/page-address.mjs";
import { OUTER, boldThroughout, boxKind, can, holdsAtoms, isEmpty, isFirstLine, isHost, keepLine, nestedLists, newTail, pastedLines, removable, removalTarget, splitBelow, UNIT, textEnd, unitElement } from "../core.mjs";
import { formulaMaker } from "../formula/index.mjs";
import { inlineItems, sideOf, spaceAround } from "../../../shared/inline-spacing.mjs";
import { caretAt, editable, hostOf, select } from "../caret.mjs";
import { formatRange, joinMarks, outOfMarks, rangeAt, rangeOffsets } from "../marks.mjs";
import { BASIC_UNITS, HOSTS, KIND_NAMES, accepts, clipboardOf, replacedByFile, takesFormula, texOnly, unitClipboard } from "../../components/registry.mjs";
import { listType } from "../../components/list/index.mjs";
import { nodeAround } from "../../components/flowchart/index.mjs";
import { cellsData } from "../../components/table/index.mjs";
import { MIME, OLD_MIME, PASTED_SOURCE, build, checkBlocks, describe, describeAcross, filesOf, formats, groupItems, holdsFormulas, joinedHtml, kindOfBlock, ownData, ownRange, parse, parseCells, parseText, plainText, prefixCopies, projectName, projectOf, relinkCopies, reportOf, sameDocument, selectedHtml, textFormats, unmadeCopy } from "./own/index.mjs";
import { carryFiles } from "./carry.mjs";
import { createPictures } from "./picture.mjs";
import { bareAddress, externalContent, readExternal } from "./import/read.mjs";
import { parseClipboardHTML, tableRows } from "./import/html.mjs";
import { fromMarkdown } from "./import/markdown.mjs";
import { addressOf } from "../links/address.mjs";
import { pageObjects, pageOf, typedAsIs } from "../page-objects.mjs";
import { richHtml, toBlocks } from "./import/to-blocks.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// Copying, cutting and pasting (docs/editor.md, "Copying blocks", "Copying text" and "Pasting").
// The clipboard's own format is own/ (selected blocks and text described, checked, made again,
// written for other programs); another program's content is import/ (HTML from web pages, Word,
// Google Docs, Excel…, Markdown and AI answers' formulas).
//
//   Ctrl+C / Ctrl+X with blocks selected (and no text): the blocks go to the clipboard (and with
//     Ctrl+X out of the page as Delete takes them). A button of the editor's copies its block the same
//     way (copyBlocks: a conflict's card).
//   Ctrl+C / Ctrl+X with text selected in a text block: the text with its marks, no block with it
//     (no list's marker, no heading); with Ctrl+X deleted after. Across blocks (text-select/): its
//     blocks, each of its type, its ends partly (copyAcross).
//   Ctrl+V reads the clipboard in this order: the page's own blocks (or text), else another
//     program's content (import/read.mjs) as blocks, one formatted line, or plain text; picture
//     files (a screenshot) become images, unless they come with Office's or a table's HTML (Excel
//     puts a picture of the cells beside them), right after the block, where blocks pasted there go.
//   With the caret in a text block: one line goes in at the caret, keeping the format bar's marks
//     where the block takes them, its own alone, not the caret's (text copied in a block of the page
//     with its line breaks); blocks
//     split the block at the caret: the first, a paragraph, joins the text before it, the others
//     follow (where the block's box takes them not, the list or quote splits there, its blocks after
//     them going on after them), and the text after the caret joins the last pasted text (else a
//     paragraph of its own); where they go out of a box that stays whole with blocks left in it after
//     the caret, the text stays before those, a block of its own; an empty block gives them its place.
//     In code, plain text with its lines; in a field of plain text (the page's title, a code block's
//     title) the words of what is pasted on one line, whatever it is; in a block that cannot split (a
//     cell, a caption), the lines joined. An address alone (read.mjs bareAddress) is a link in any
//     block that takes links.
//   With blocks selected: the blocks go after them, in the first box out from there that takes them all;
//     and so with the caret on a formula block, which has no text to paste into.
//   Into a table's cells (table/cells.mjs, what the clipboard holds as cells: cellsOf), cells go from
//     the caret's cell or the selected ones; in a cell, picture files are pictures of the cell
//     (单元格里的图片, table/pictures.mjs), and a table pasted anywhere keeps its cells' pictures.
//   An image copied alone (Ctrl+C, Ctrl+X, 复制图片) goes on the system clipboard as a PNG too, its HTML
//     carrying the page's own data (picture.mjs). The media blocks of another document, made anew of what
//     their copies carry, bring the files of its folder they name into this one's first (carry.mjs).
// One undo step. Images and embeds of an address are filled once on the page (one step with the paste).

/**
 * editing(): whether the page edits. blocks(): the block tools (blocks.mjs: picked, select, remove).
 * struct(parents, touched, mutate) and recordText(host): undoable
 * changes (history.mjs). say: the status line.
 * loadKatex(): KaTeX on the page (true once there), for pasted formulas. mention(parts, same, from): a
 * link shown with its icon pasted, as a chip of the page (`same`: from a copy of this report's own,
 * whose icon files are its own; `from`: the report of the copy, whose blocks a link within it means). linkPasted(link, page): a web address pasted alone (a web page's link
 * copied too), now a link of the text (links/views.mjs offers its views); `page`: what pageLink said
 * of it. pageLink(address): what an address of this computer pasted alone is when it is a document's
 * of the workspace, a page with its `href` (links/ pageLinkOf: the link a file writes, and its title
 * for words), or null. titleBold(): whether bold
 * is armed at the caret (a flowchart node's empty title: format-bar/), so that what is pasted there
 * is bold as what is typed is. showCaret(): the caret in view after text went in (caret.mjs).
 * pictures(): the pictures of table cells (table/pictures.mjs: fromFiles, resolve, maker), or null.
 * spaced(host): what was pasted into a text block in, before its step is recorded: a space it left
 * where it no longer stands between Chinese and a Latin word goes (typing/spaces.mjs).
 * upload(kind, body): a file sent to the document's folder (POST /__gallery/edit/upload: the server's
 * answer, an Error when it fails), for the files of another document's blocks pasted (carry.mjs).
 * served(route, path): where the page serves a file of the document's folder (route: asset, file, embed).
 */
export function createClipboard({ editing, blocks, struct, recordText, say, loadKatex = async () => Boolean(globalThis.katex), mention: mentionFor = null, linkPasted = () => {}, pageLink = async () => null, titleBold = () => false, showCaret = () => {}, pictures = () => null, spaced = () => {}, upload = async () => { throw new Error(t("上传失败")); }, served = (route, path) => path }) {
  // A picture copied: a PNG of it on the system clipboard too (picture.mjs).
  const shots = createPictures();

  // ---------- copying ----------

  // Ctrl+C or Ctrl+X with blocks selected (and no text): the blocks go to the clipboard, and with
  // Ctrl+X out of the page as Delete takes them. A block the page cannot make stops the copy, and one it
  // can make only from its unit on the page (a card) stops the cut.
  function copy(event) {
    const selection = getSelection();
    if (editing() && selection.rangeCount > 0 && !selection.isCollapsed) {
      copyText(event, selection.getRangeAt(0));
      return;
    }
    const picked = editing() ? blocks().folds.takenWith(blocks().picked) : []; // a folded heading with what it hides (fold/)
    if (picked.length === 0) return;
    event.preventDefault();
    // A list's item selected on its own carries its list's kind (an item is a block of its list's
    // type): pasted where no list takes it, it is an item of a list of that kind (asLists).
    const described = picked.map((node) => {
      const block = describe(node);
      return block?.type === "item" && /^[uo]l$/.test(node.parentElement?.localName ?? "") ? { ...block, list: listType(node.parentElement) } : block;
    });
    const refused = picked.find((_, index) => !described[index]);
    if (refused) {
      say(refusalOf(unmade(refused)), "note", 6000); // the block in it the page cannot make, as a selection across blocks says it
      return;
    }
    const kept = event.type === "cut" ? cutRefusal(described) : null;
    if (kept) {
      say(kept, "note", 6000);
      return;
    }
    const payload = write(event.clipboardData, { blocks: described }, formats(described));
    // One block that is a picture alone (an image with its picture: its definition's `picture`): a PNG of it
    // on the system clipboard too, its HTML carrying the same data (picture.mjs).
    const shown = picked.length === 1 ? unitClipboard(picked[0]).picture?.(picked[0]) : null;
    if (shown) shots.write(shown.img, payload, shown.label, event);
    if (event.type === "cut") blocks().remove(picked);
    else say(t("已复制 {0} · 在要放的块里按 Ctrl+V 粘贴到它后面", picked.length > 1 ? t("{0} 块", picked.length) : t("这一块")));
  }

  /**
   * 复制图片 (an image's block menu): the picture of `unit` on the system clipboard as a
   * PNG, its HTML carrying the clipboard's own data of the block as Ctrl+C writes it (picture.mjs). Returns a
   * promise of whether it went, said on the status line.
   */
  async function copyPicture(unit) {
    const block = describe(unit);
    const shown = block ? unitClipboard(unit).picture?.(unit) : null;
    const went = shown ? await shots.write(shown.img, payloadOf({ blocks: [block] }), shown.label) : false;
    if (went) say(t("已复制图片"));
    else say(t("没能复制图片：浏览器不允许写剪贴板。"), "error");
    return went;
  }

  /**
   * `nodes`, blocks of the page, to the clipboard as Ctrl+C copies them selected, where no copy event
   * of the page's asks (a button of the editor's: a conflict's card): by the browser's copy command,
   * whose event this answers before the page's own does. Returns whether they went.
   */
  function copyBlocks(nodes) {
    const described = nodes.map(describe);
    if (described.length === 0 || !described.every(Boolean)) return false;
    let done = false;
    const answer = (event) => {
      event.stopImmediatePropagation();
      event.preventDefault();
      write(event.clipboardData, { blocks: described }, formats(described));
      done = true;
    };
    window.addEventListener("copy", answer, { capture: true, once: true });
    try {
      document.execCommand("copy");
    } finally {
      window.removeEventListener("copy", answer, true);
    }
    if (done) say(t("已复制 {0} · 在要放的块里按 Ctrl+V 粘贴到它后面", nodes.length > 1 ? t("{0} 块", nodes.length) : t("这一块")));
    return done;
  }

  // Why a block the page cannot make (describe gives none) is not copied: one not saved yet, or a
  // block of the report's own (a whole block, a widget), the Agent's to copy.
  const refusalOf = (node) => (node.hasAttribute("data-ge-new") ? t("选中的块还没保存，保存之后再复制。")
    : t("选中的块里有{0}：文档自己的组件不能在页面上复制，可以让 Agent 复制。", KIND_NAMES[node.getAttribute("data-ge-unit-kind")] ?? t("组件")));

  // Why blocks described for a cut are not cut (null: they are). A cut takes them off the page, and only
  // what a paste makes again comes back: one made only of its unit (a card that carries no data: a chart
  // card, a picture of a web address) is refused, not lost, and so is any the paste would not take
  // (checkBlocks, the check of the clipboard's own data: a paste refusing it pastes its HTML instead, not
  // the blocks that were cut), each checked whatever their number. More than a paste takes at once
  // (checkBlocks' limit, 500) are pasted as their HTML: text comes back as text, as a cut always did, but a
  // block copied as itself (a media block, a table, a row of columns) would come back as a link or a picture
  // of an address, so a cut of so many holding one is refused.
  const cutRefusal = (described) => {
    const kept = unmadeCopy(null, described);
    const cut = (kind) => t("选中的块里有{0}：它剪切之后就没法再粘贴了，所以不能剪切；可以复制它，或者拖动它来移动。", KIND_NAMES[kind] ?? t("组件"));
    if (kept) return cut(kept.kind);
    const refused = described.find((block) => !checkBlocks([block], { limit: Infinity }));
    if (refused) return refused.type === "copy" ? cut(refused.kind) : t("选中的块剪切之后就没法原样粘贴回来了，所以不能剪切；可以复制它们，或者拖动它们来移动。");
    if (checkBlocks(described) || !/"type":"copy"/.test(JSON.stringify(described))) return null;
    return t("选中的块超过 500 块，剪切之后一次粘贴不回来，里面的图片、表格这类块会丢，所以不能剪切；可以分几次剪切，或者拖动它们来移动。");
  };

  // The block in `unit` (it, or the innermost of the blocks it holds) the page cannot make, or null.
  const unmade = (unit) => {
    if (describe(unit)) return null;
    const inner = [...unit.querySelectorAll(UNIT)].find((node) => !describe(node));
    return inner ? unmade(inner) : unit;
  };

  // The clipboard's own data (`own`: { blocks } | { html }), naming the document it was copied in (and its
  // workspace, where it is not the first: two may each have a document of that name).
  const payloadOf = (own) => {
    const project = projectOf();
    return JSON.stringify({ v: 1, report: reportOf(document), ...(project ? { project } : {}), ...own });
  };

  // The clipboard's own data and what other programs read of it. Returns that data.
  const write = (data, own, { html, text }) => {
    const payload = payloadOf(own);
    data.setData(MIME, payload);
    data.setData(OLD_MIME, payload); // a page of the old version (before 2026-10-26) reads this one
    data.setData("text/html", html);
    data.setData("text/plain", text);
    return payload;
  };

  // Text selected in one text block: its inline HTML, the
  // format bar's marks and the chips, as the clipboard's own data, as HTML and as its plain text for
  // other programs; no type of block goes with it (a list item's marker, a heading's size). A cut
  // deletes it after, as typing would (one step). One ending at the start of a block an item holds
  // (a triple click's in such an item) is the item's text; one holding some of that block (an
  // item's text and a block it holds) is the browser's.
  function copyText(event, range) {
    const host = editable(range.startContainer);
    if (!host?.closest("main") || !(editable(range.endContainer) === host || endsAtHeld(host, range))) return;
    const part = ownRange(host, range);
    if (part.collapsed) return;
    event.preventDefault();
    const html = selectedHtml(host, part);
    write(event.clipboardData, { html }, textFormats(html));
    if (event.type !== "cut") return;
    select(part);
    document.execCommand("delete");
  }

  // Whether `range` from `host`'s text ends in a block the host holds with nothing of it selected
  // (its end at that block's start: no text, no picture, no formula).
  function endsAtHeld(host, range) {
    if (!host.contains(range.endContainer)) return false;
    const beyond = document.createRange();
    beyond.setStart(host, textEnd(host));
    beyond.setEnd(range.endContainer, range.endOffset);
    if (beyond.collapsed) return false;
    const held = beyond.cloneContents();
    return held.textContent.trim() === "" && !held.querySelector("img, svg, video, iframe, hr, [data-ge-atom]");
  }

  /**
   * A selection across blocks copied (text-select/: `range` the selection, `pieces` its texts and the
   * blocks it takes whole) to `data`: its blocks, each of its type, the first from where it starts and
   * the last up to where it ends (own/ describeAcross). A cut holding a
   * card's copy is refused as a cut of blocks is, and so is one taking whole a block the page cannot
   * make (a whole block: its copy is its words, which would put no block of it back): nothing goes,
   * as for blocks selected. Returns whether it went to the clipboard.
   */
  function copyAcross(data, range, pieces, cut) {
    const lost = cut ? pieces.wholes.map(unmade).find(Boolean) : null;
    if (lost) {
      say(refusalOf(lost), "note", 6000);
      return false;
    }
    const described = describeAcross(range, pieces);
    if (described.length === 0) return false;
    const kept = cut ? cutRefusal(described) : null;
    if (kept) {
      say(kept, "note", 6000);
      return false;
    }
    write(data, { blocks: described }, formats(described));
    return true;
  }

  // ---------- what is pasted ----------

  // The clipboard as { kind: "blocks", blocks } | { kind: "rich", html } | { kind: "plain", text }:
  // the page's own blocks first (or its text copied in a block), then another program's content
  // (import/). `own`: the page's own; `same`: of this report. A line of text (`rich`) keeps a space
  // at its ends (`edges`, pastedLines): the page's own text the spaces it was copied with (its copy
  // holds those the page showed, own/selection.mjs), another program's those its plain text has.
  function read(data) {
    const own = ownData(data);
    const mine = own ? parse(own) : null;
    if (mine) return { kind: "blocks", blocks: mine, own: true, ...origin(own) };
    const text = own ? parseText(own) : null;
    if (text !== null) return { kind: "rich", html: text, own: true, edges: BOTH_EDGES, ...origin(own) };
    // Cells of a table of the page (its tools' copy): one cell its text, as its words copied in it
    // are (its HTML, a table of one cell, the import unwraps with a divider after it); more a table
    // of them as they were, not as another program's table comes in (made over: a header row, its
    // numbers read).
    // The report they were copied from: their pictures are its files.
    const copied = cellsData(data);
    const cells = parseCells(copied || "null");
    const whence = cells && reportIn(copied) ? origin(copied) : {};
    if (cells?.length === 1 && cells[0].length === 1) return { kind: "rich", html: cells[0][0], own: true, ...whence };
    const table = cells ? checkBlocks([{ type: "table", rows: cells }]) : null;
    if (table) return { kind: "blocks", blocks: table, own: true, ...whence };
    // Text of this page copied by the browser (a selection in a block): one line holding the page's
    // chips (a formula, a link shown with its icon, one left empty) is its text again, each chip as
    // it was (pastedLines), not what another program's HTML would make of it.
    const html = data.getData("text/html");
    if (html && !/\n/.test((data.getData("text/plain") || "").trim()) && holdsAtoms(document, html)) return { kind: "rich", html, edges: plainEdges(data) };
    const external = readExternal(data);
    if (external.kind === "rich") return { kind: "rich", html: richHtml(external.title), edges: plainEdges(data) };
    if (external.kind === "plain") return external;
    // Made as blocks the page takes (not checked as the clipboard's own data is): none is refused for
    // another's sake, however many there are.
    const made = toBlocks(external.specs, null, HELD);
    return made.length > 0 ? { kind: "blocks", blocks: made } : { kind: "plain", text: data.getData("text/plain") };
  }

  // The report the clipboard's own data was copied from (`from`, of the workspace `project`), and whether
  // that is this one (`same`: their links' icons its files, their pictures' files its own).
  const origin = (own) => {
    try {
      const value = JSON.parse(own);
      const from = typeof value?.report === "string" ? value.report : null;
      const project = projectName(value?.project) ? value.project ?? "" : null;
      return { from, project, same: project !== null && sameDocument(document, from, project) };
    } catch {
      return { from: null, project: null, same: false };
    }
  };

  // Links shown with their icon pasted as the page's own (mentionFor).
  let mention = null;

  // Inline formulas pasted as the page's own (KaTeX loaded: formula/ formulaMaker).
  let formula = null;

  // A table's cells' pictures pasted (made files of the document's folder first: table/pictures.mjs
  // resolve), what a cell built of them shows (maker).
  let picture = null;

  // Whether what is pasted was copied in this document (`same`): the keys of tables in it are kept,
  // given anew or taken off by that (own/chart-keys.mjs relinkCopies).
  let here = true;

  // The files of another document's folder that pasted blocks name, copied into this one's (carry.mjs): a
  // Map of each path there to its path here; null in the paste's own document.
  let carriedFiles = null;

  // What the blocks made of the clipboard are made with (own/blocks.mjs build).
  const making = () => ({ formula, mention, picture, files: carriedFiles, served });

  // Images and embeds pasted with an address: filled now they are on the page.
  const fillMedia = (made) => {
    for (const figure of made.flatMap((node) => [node, ...node.querySelectorAll(`[${PASTED_SOURCE}]`)]).filter((node) => node.hasAttribute?.(PASTED_SOURCE))) {
      const src = figure.getAttribute(PASTED_SOURCE);
      figure.removeAttribute(PASTED_SOURCE);
      pageOf(figure)?.fromLink?.(figure, src, { pasted: true }); // the selection left as it is
    }
  };

  // Files pasted by `at`: a block for the first of them the first component takes, in the order of the
  // page objects (`acceptsFile`, `fromFiles`: a picture an image, any other file a file block). Where it
  // goes is the paste's: right after the block of `at`, in the same parent (unitElement: a new code
  // block's code stands for the block), whole, where a block pasted there goes (placeFor: the first box
  // out that takes it, a list or quote that does not splitting after the block), one undo step (`put`,
  // handed to the component, which makes the block and fills it, the fill part of that step). An empty
  // block of a kind that says `replacedByFile` (an empty paragraph) gives its place to the block instead
  // of staying before it. Returns whether one did.
  const fromFiles = (at, files) => {
    const unit = unitElement(at);
    if (!unit?.closest("main")) return false;
    const put = (block) => {
      const place = placeFor(unit, [block.getAttribute("data-ge-unit-kind")]);
      if (!place) {
        say(t("这里放不下这种块。"));
        return false;
      }
      const replaced = replacedByFile(unit.getAttribute("data-ge-unit-kind")) && removableEmpty(unit, unit) && !isFirstLine(unit);
      struct([...new Set([unit.parentElement, ...place.parents])], [], () => {
        const created = placeAfter(place, [block]);
        if (replaced) removalTarget(unit).remove();
        return { touched: [], focus: null, created };
      });
      return true;
    };
    return pageObjects().some((page) => {
      const file = page.acceptsFile && [...files].find(page.acceptsFile);
      return Boolean(file) && page.fromFiles(put, [file]);
    });
  };

  // ---------- blocks into the page ----------

  // Out from `anchor`, the first box that takes every one of `kinds`: { anchor (the block they go
  // after), box, parents (the boxes involved), splits ([container, its blocks after the anchor]:
  // a list or quote that does not take them splits there, unless they leave a box around it, which
  // keeps what it holds), stays (they leave a box with blocks in it after the anchor) }, or null. A
  // list item holding blocks is such a box too: blocks pasted by one of the blocks it holds stay in
  // the item.
  function placeFor(anchor, kinds) {
    const takes = (box) => box?.hasAttribute("data-ge-box") && kinds.every((kind) => accepts(box.getAttribute("data-ge-box-kind"), kind));
    const parents = [];
    let splits = [];
    let stays = false;
    let box = anchor.parentElement;
    while (!takes(box)) {
      // A container made on the page and not written yet (a list just made of "- ", whose
      // contenteditable OUTER passes over) is the block around what it holds, as the file's is.
      const outer = box?.closest(`${OUTER}, [data-ge-new][data-ge-box]`);
      if (!outer?.closest("main")) return null;
      parents.push(box);
      // A list or a quote whose box does not take them splits after the anchor.
      const after = [];
      for (let next = anchor.nextElementSibling; next; next = next.nextElementSibling) after.push(next);
      if (box === outer && (outer.localName === "ul" || outer.localName === "ol" || outer.localName === "blockquote")) {
        if (after.length) splits.push([outer, after]);
      } else if (boxKind(box) !== "nest" || after.length) {
        stays ||= after.length > 0 || splits.length > 0;
        splits = [];
      }
      anchor = outer;
      box = outer.parentElement;
    }
    parents.push(box);
    return { anchor, box, parents, splits, stays };
  }

  // The blocks to make of `list` where they go after `anchor`: as they are, unless items copied on
  // their own (a list's items selected, `list`: their list's kind) go where the box does not take
  // them all, or into a list of another kind; then each run of items of one kind is a list of that
  // kind (an item is a block of its list's type wherever it is pasted: a disclosure's content, a
  // highlight block, a column…; in a list of another kind, the list splits around them). A flowchart's
  // nodes copied on their own are a flowchart of their own the same way, but by a block of a node,
  // where they go after that node in its flowchart as they are (nodes never nest: placeFor finds it).
  function asLists(anchor, list) {
    if (list.every((block) => block.type === "step") && nodeAround(anchor)) return list;
    const parent = anchor.parentElement;
    const box = parent?.getAttribute("data-ge-box-kind");
    const own = parent?.localName === "ul" || parent?.localName === "ol" ? listType(parent) : null;
    const takes = (block) => accepts(box, kindOfBlock(block)) && !(block.type === "item" && own && block.list && block.list !== own);
    return !list.some((block) => clipboardOf(block.type).run) || list.every(takes) ? list : groupItems(list);
  }

  // The blocks after `anchor` (in the first box out that takes them), the containers that split
  // there going on after them. Returns the containers made by splitting.
  function placeAfter(place, made) {
    const { anchor, splits } = place;
    anchor.after(...made);
    const created = [];
    let last = made.at(-1);
    for (const [container, after] of splits) {
      const next = newTail(container, container.localName === "blockquote" ? "quote" : listType(container));
      next.append(...after);
      last.after(next);
      created.push(next);
      last = next;
    }
    return created;
  }

  // The text block a paste's last text goes on in: the last of a block of text (itself, the blocks a
  // list, a quote, a flowchart or a node holds) that is a block of its own, no part of one, and whose
  // text may be any text (no `plain` one, whose text is code or a formula's TeX alone). What a
  // container or a card holds stays its own.
  const lastLine = (node) => (BASIC_UNITS.has(node.getAttribute("data-ge-unit-kind"))
    ? textsOf([node]).filter((text) => unitElement(text) === text && !can(text, "plain") && !heldApart(text, node)).at(-1) ?? null : null);

  // Whether a text block in the block `node` is in a container or a card `node` holds.
  const heldApart = (text, node) => {
    for (let at = text; at !== node; at = at.parentElement) {
      if (at.hasAttribute("data-ge-unit-kind") && !BASIC_UNITS.has(at.getAttribute("data-ge-unit-kind"))) return true;
    }
    return false;
  };

  // The place of `made` (of `kinds`) at a caret in `unit`: the first box out that takes them and, when
  // the last of them has no text block for what stands after the caret, the paragraph of its own that is.
  const placeAtCaret = (unit, made, kinds) => placeFor(unit, lastLine(made.at(-1)) ? kinds : [...kinds, kindOfBlock(TAIL)]);

  /**
   * The one step the two ways in share (pasteIntoText, blocksAt): the text block
   * `host` is split at `range`, `made` (blocks of the page's own making) stand after it in `place`
   * (placeFor), and the text after the caret goes on where `tail` says: "join", in the last of
   * `made` that holds text, the caret between them (else in a paragraph of its own, the caret at its
   * start); "paragraph", in a paragraph of its own with the spaces at the ends of the cut taken off, the
   * caret at its start. Where `made` leaves blocks after the caret in a box that stays whole
   * (`place.stays`), it stays before them, a block of its own below the text before the caret, and the
   * caret goes by `made`. `first`: the lines of a paste's first block, which join the text before the
   * caret; `replace`: the host is empty and goes in the place of `made` (else it goes when the step
   * leaves it empty and `tail` is "paragraph"); `bold`: the lines of `first` made bold (a node's
   * title: titled). One undo step. Returns { placed (`made` and the
   * paragraph the tail went to), caret }, or null when nothing was done.
   */
  function splitAndPlace(host, range, place, made, { tail, first = null, replace = false, bold = false }) {
    const unit = unitElement(host);
    const placed = [...made];
    let caret = null;
    const stays = place.stays && !replace;
    const result = struct([...new Set([host.parentElement, ...place.parents, ...(stays ? [host, ...nestedLists(host).slice(0, 1)] : [])])], [host], () => {
      // The text after the caret, and what joins before it.
      const cut = cutAtCaret(host, range);
      // With no text before it for it to stand apart from, it stays where it is.
      const stayed = stays && holdsWords(cut) && (first || holdsWords(before(host, cut)));
      const title = stayed && isFirstLine(host) && boldThroughout(host);
      const rest = replace || (stays && !stayed) ? null : cut.extractContents();
      if (tail === "paragraph") trimText(host, true);
      if (first) {
        const holder = document.createElement("div");
        holder.append(...pastedLines(document, first.html, { formula, mention }).flatMap((line, index) => (index > 0 ? [document.createElement("br"), ...line] : line)));
        outOfMarks(host, range).insertNode(holder); // its own marks alone, as at a caret
        const lines = [...holder.childNodes];
        holder.replaceWith(...lines);
        if (lines.length && bold) { // a node's title: bold, as typed there (titled)
          const all = document.createRange();
          all.setStartBefore(lines[0]);
          all.setEndAfter(lines.at(-1));
          formatRange(host, all, "bold", true);
        } else if (lines.length) joinBeside(lines[0], lines.at(-1));
        spaceItems(host); // the pasted code and formulas beside the text they joined
      }
      const created = made.length ? placeAfter(place, made) : [];
      const below = stayed ? splitBelow(host, rest, title) : null;
      if (below && below.parentElement.parentElement === host && below.parentElement.hasAttribute("data-ge-new")) created.push(below.parentElement);
      const text = !below && Boolean(rest?.textContent?.trim() || rest?.querySelector?.("[data-ge-atom]"));
      // Where the text after the caret goes on.
      let target = tail === "join" ? (made.length ? lastLine(made.at(-1)) : host) : null;
      if (target) caret = text ? goesOn(target, rest) : { host: target, end: true };
      else if (below) caret = { host: below, start: true };
      else if (text) {
        target = build(document, TAIL);
        if (tail === "paragraph") {
          target.append(rest);
          trimText(target, false);
          caret = { host: target, start: true };
        } else caret = goesOn(target, rest);
        made.at(-1).after(target); // before a list or quote split there
        placed.push(target);
      }
      const gone = replace || (tail === "paragraph" && removableEmpty(host, unit));
      if (gone) removalTarget(host).remove();
      else keepLine(host); // an item left with no text over what it holds
      return { touched: [...new Set([...(gone ? [] : [host]), ...textsOf(placed), ...(below ? [below] : [])])], focus: caret?.host ?? null, select: tail === "join" ? placed : made, created, caret };
    });
    return result ? { placed, caret } : null;
  }

  // The text after the caret (`rest`) on at the end of `target`'s own text, before the blocks an item
  // holds, the caret between the two.
  function goesOn(target, rest) {
    const marker = document.createTextNode("");
    const end = target.childNodes[textEndOf(target)] ?? null;
    target.insertBefore(marker, end);
    target.insertBefore(rest, end);
    spaceItems(target);
    return { host: target, marker };
  }

  // The caret as splitAndPlace left it (`caret`: { host, end } | { host, marker } | { host, start }),
  // else `placed` selected as blocks.
  function restoreCaret(caret, placed) {
    if (caret?.marker) {
      caret.host.focus({ preventScroll: true });
      const at = document.createRange();
      at.setStartBefore(caret.marker);
      at.collapse(true);
      caret.marker.remove();
      select(at);
    } else if (caret) caretAt(caret.host, caret.start ? "start" : "end");
    else blocks().select(placed, { quiet: true });
  }

  /**
   * Blocks pasted at the caret in `host` (`range` there). Returns whether it took them.
   */
  function pasteIntoText(host, range, list, bold = false) {
    const unit = unitElement(host);
    if (!unit?.closest("main")) return false;
    // A node's title, however empty, stays (nothing goes before it in its node): its first paragraph
    // joins it, the others go after it. What is selected goes first, so a block all of it selected
    // is as an empty one.
    const replace = host === unit && removable(host) && emptiedBy(host, range) && !isFirstLine(host);
    const [first, ...rest] = list;
    const joins = !replace && first.type === "paragraph" && !first.color;
    const placed = asLists(unit, joins ? rest : list);
    const made = placed.map((block) => build(document, block, making()));
    relinkCopies(document, made, { same: here }); // a pasted card or view and its table linked to each other alone
    prefixCopies(document, made); // a copy's drawing names its own markers
    const place = made.length ? placeAtCaret(unit, made, placed.map(kindOfBlock)) : { anchor: unit, box: unit.parentElement, parents: [unit.parentElement], splits: [] };
    if (!place) {
      say(t("这里放不下这些块。"));
      return true;
    }
    const done = splitAndPlace(host, range, place, made, { tail: "join", first: joins ? first : null, replace, bold });
    if (!done) return true;
    restoreCaret(done.caret, done.placed);
    (done.caret?.host ?? done.placed.at(-1))?.scrollIntoView?.({ block: "nearest" });
    fillMedia(done.placed);
    say(t("已粘贴 {0} · Ctrl+Z 撤销", list.length > 1 ? t("{0} 块", list.length) : t("一块")));
    return true;
  }

  // Spaces at the end of a text block's own text, or at its start, taken off.
  const trimText = (host, end) => {
    const node = end ? host.childNodes[textEndOf(host) - 1] : host.firstChild;
    if (node?.nodeType === 3) node.data = end ? node.data.replace(/[  ]+$/, "") : node.data.replace(/^[  ]+/, "");
  };

  /**
   * Blocks made elsewhere (`made`, of `kinds`) in the place of `range` in `host` (links/views.mjs: a
   * link turned into a bookmark): the text before it stays in the block, the
   * text after it goes on in a paragraph after them, and a block left empty goes; a list or a quote
   * that does not take them splits there, as for a paste. One undo step, the caret at the start of
   * the text after them, else they are selected. Returns whether they went in.
   */
  function blocksAt(host, range, made, kinds) {
    const unit = unitElement(host);
    const place = unit?.closest("main") ? placeFor(unit, [...kinds, kindOfBlock(TAIL)]) : null;
    if (!place) {
      say(t("这里放不下这种块。"));
      return false;
    }
    const done = splitAndPlace(host, range, place, made, { tail: "paragraph" });
    if (!done) return false;
    restoreCaret(done.caret, made);
    return true;
  }

  // Blocks pasted with blocks selected: after them, in the first box out that takes them all; the
  // new blocks selected.
  function pasteAfter(anchor, pasted) {
    if (!anchor?.closest("main")) {
      say(t("这里不能粘贴块。"));
      return;
    }
    const list = asLists(anchor, pasted);
    const made = list.map((block) => build(document, block, making()));
    relinkCopies(document, made, { same: here }); // a pasted card or view and its table linked to each other alone
    prefixCopies(document, made); // a copy's drawing names its own markers
    const place = placeFor(anchor, list.map(kindOfBlock));
    if (!place) {
      say(t("这里放不下这些块。"));
      return;
    }
    struct(place.parents, [], () => {
      const created = placeAfter(place, made);
      const texts = textsOf(made);
      return { touched: texts, focus: null, select: made, created };
    });
    blocks().select(made, { quiet: true });
    fillMedia(made);
    say(t("已粘贴 {0} · Ctrl+Z 撤销", pasted.length > 1 ? t("{0} 块", pasted.length) : t("一块")));
    return made;
  }

  // ---------- text into a text block ----------

  const caretAfter = (node) => {
    const after = document.createRange();
    if (node.nodeType === 3) after.setStart(node, node.length);
    else after.setStartAfter(node);
    after.collapse(true);
    select(after);
  };

  // Inline code and formulas in `root` stand a space apart from the words beside them, which a paste
  // joined them to (shared/inline-spacing.mjs). Returns the space put after `end`, where it is one of them.
  function spaceItems(root, end = null) {
    let trailing = null;
    for (const item of inlineItems(root)) {
      const { after } = spaceAround(item);
      if (item === end) trailing = after;
    }
    return trailing;
  }

  // Nodes in at the caret, in place of what is selected; one text step. The caret goes after them,
  // past the space put between a last piece of code or formula and the text that follows it. With
  // `own` they carry their own marks alone (pasted HTML keeps its own, not the caret's),
  // the marks around the caret split there and (`join`) a mark beside one the same made one with it;
  // else (plain text) they take the caret's marks, as typing does. `bold`: made bold, the caret at
  // their end inside the bold (a flowchart node's title: titled), as text typed there is.
  function insertNodes(host, range, nodes, { own = false, join = own, bold = false } = {}) {
    if (nodes.length === 0) return;
    range.deleteContents();
    const at = own ? outOfMarks(host, range) : range;
    const fragment = document.createDocumentFragment();
    fragment.append(...nodes);
    const last = nodes.at(-1);
    at.insertNode(fragment);
    showEdgeSpaces(nodes[0], last);
    if (bold) {
      const all = document.createRange();
      all.setStartBefore(nodes[0]);
      all.setEndAfter(last);
      const covered = formatRange(host, all, "bold", true);
      spaceItems(host);
      covered.collapse(false);
      select(covered);
      spaced(host);
      recordText(host);
      showCaret();
      return;
    }
    caretAfter(spaceItems(host, last) ?? last);
    if (join) {
      const selection = getSelection();
      const caret = selection.rangeCount ? rangeOffsets(host, selection.getRangeAt(0)) : null;
      if (joinBeside(nodes[0], last) && caret) select(rangeAt(host, caret));
    }
    spaced(host);
    recordText(host);
    showCaret();
  }

  // A space at an end of pasted nodes (`first` to `last`, a mark's words too) that the line would not
  // show, at its edge or beside another space, is a non-breaking one, as the browser types a space
  // there: words copied with a space after them, pasted at a paragraph's end, show it and stand a
  // space from what is typed next. The file has an ordinary space for it (core.mjs `spaced`).
  function showEdgeSpaces(first, last) {
    const textAt = (node, end) => {
      while (node?.nodeType === 1 && !node.hasAttribute("data-ge-atom") && node.firstChild) node = end ? node.lastChild : node.firstChild;
      return node?.nodeType === 3 ? node : null;
    };
    const hidden = (side) => side === null || (typeof side === "string" && /[ \t\n\r]/.test(side));
    const head = textAt(first, false);
    if (head?.data.startsWith(" ") && hidden(sideOf(head, false))) head.data = `\u00a0${head.data.slice(1)}`;
    const tail = textAt(last, true);
    if (tail?.data.endsWith(" ") && hidden(sideOf(tail, true))) tail.data = `${tail.data.slice(0, -1)}\u00a0`;
  }

  // The marks at either end of pasted nodes (`first` to `last`) made one with the same mark beside
  // them (bold pasted by bold). Returns whether any were.
  function joinBeside(first, last) {
    const before = joinMarks(first.previousSibling, first);
    const end = last.isConnected ? last : before;
    return Boolean(joinMarks(end, end?.nextSibling) || before);
  }

  // One formatted line at the caret: the format bar's marks the block takes. Text copied in a block
  // of the page keeps its line breaks (`breaks`: its lines joined by <br>, else by a space); `edges`, the
  // spaces at its ends (read).
  function pasteRich(host, range, html, breaks = false, bold = false, edges = null) {
    const lines = pastedLines(document, html, { links: can(host, "links"), formula, mention, edges });
    insertNodes(host, range, lines.flatMap((line, index) => (index > 0 ? [breaks ? document.createElement("br") : document.createTextNode(" "), ...line] : line)), { own: true, bold });
  }

  // Into a block that cannot split (a cell, a title): the lines of what is pasted, joined, with the
  // marks the block takes: what read() made of it (a formatted line, or its blocks' text: no list's
  // marker, no Markdown), of the page's own blocks as of another program's.
  function pasteJoined(host, range, content, data) {
    const html = content.kind === "rich" ? content.html : content.kind === "blocks" ? joinedHtml(content.blocks) : "";
    // The page's own blocks with no words have none here: their Markdown is for other programs.
    const raw = content.own ? "" : (data.getData("text/plain") || "").replace(/\r\n?/g, "\n");
    const rich = html && !can(host, "plain") ? pastedLines(document, html, { links: can(host, "links"), formula, formulas: takesFormula(host), mention, edges: content.edges }) : [];
    const lines = rich.length > 0 ? rich : raw.split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
    const nodes = rich.length > 0 ? rich.flatMap((line, index) => (index > 0 ? [document.createTextNode(" "), ...line] : line)) : [document.createTextNode(lines.length > 1 ? lines.join(" ") : raw)];
    if (nodes.length === 1 && nodes[0].nodeType === 3 && !nodes[0].data) return;
    insertNodes(host, range, nodes, { own: rich.length > 0 });
    if (lines.length > 1) say(t("这里不能分段，多行文字已合并为一行。"));
  }

  // ---------- the paste ----------

  async function paste(event) {
    if (!editing()) return;
    const data = event.clipboardData;
    // A formula block has no text a paste goes into, its TeX changing in its editor alone: with the
    // caret on one (a right click puts it there), what is pasted goes after it, as with it selected.
    const at = hostOf(event);
    const host = texOnly(at) ? null : at;
    const picked = host ? [] : texOnly(at) ? [unitElement(at)] : blocks().picked;
    if (!data || (!host && picked.length === 0)) return;
    event.preventDefault();
    const anchor = host ?? picked.at(-1);
    // Picture or other files (a screenshot): an image or a file block after the block, unless they
    // come with the page's own blocks, or Office's or a table's HTML (Excel's picture of its cells).
    const files = data.files;
    const selection = getSelection();
    const range = host && selection.rangeCount && host.contains(selection.getRangeAt(0).startContainer) ? selection.getRangeAt(0).cloneRange() : null;
    if (files?.length > 0 && !ownData(data)) {
      const external = externalContent(data);
      // In a table's cell: pictures of the cell, at the caret (单元格里的图片).
      if (!external.fromOffice && !external.isTable && range && HOSTS[host.getAttribute("data-ge-kind")]?.pictures && pictures() && [...files].some((file) => /^image\//.test(file.type))) {
        const at = rangeOffsets(host, range);
        const made = await pictures().fromFiles(files);
        if (made.length > 0 && host.isConnected) insertNodes(host, rangeAt(host, at), made, { own: true, join: false });
        return;
      }
      if (!external.fromOffice && !external.isTable && fromFiles(host ?? anchor, files)) return;
    }
    if (host && !range) return;
    // In code: the text with its lines.
    if (host && typedAsIs(host, (data.getData("text/plain") || "").replace(/\r\n?/g, "\n"))) return;
    let content = read(data);
    // A field of plain text takes the words of what is pasted, whatever that is. What follows is for
    // blocks and marks and has no say here: a copy with no unit on this page goes in as its words, and
    // nothing waits for KaTeX.
    if (host && can(host, "plain")) {
      const text = plainOf(content, data);
      if (text) insertNodes(host, range, [document.createTextNode(text)]);
      return;
    }
    // A copy of a block of another page (or one gone since) pastes from its data, where it has any.
    const unmade = content.kind === "blocks" ? unmadeCopy(document, content.blocks) : null;
    if (unmade) {
      say(t("复制的{0}只能粘贴到它所在的文档里，而且它还要在页面上。", KIND_NAMES[unmade.kind] ?? t("组件")));
      return;
    }
    // Formulas want KaTeX on the page (the first time it loads).
    const formulas = content.kind === "blocks" ? holdsFormulas(content.blocks) : content.kind === "rich" && content.html.includes("doc-math-inline");
    if (formulas && (!host || takesFormula(host)) && (await loadKatex())) formula = formulaMaker();
    if (mentionFor) mention = (parts) => mentionFor(parts, Boolean(content.same), content.from);
    here = content.same !== false;
    // An address alone, which HTML that reads as no text beside it does not change.
    const href = content.own && content.kind === "blocks" ? null : bareAddress(data) ?? (content.kind === "plain" ? addressOf(content.text) : null);
    const words = href ? (data.getData("text/plain") || content.text || href).trim() : ""; // read now: the clipboard's data goes with its event
    // An address of this computer may be a document's, which the list of them says: the link a file
    // writes, by its title, so that no file holds a port. Never a web page's views.
    const page = href && mayBePage(href) && (!host || can(host, "links")) ? await pageLink(href) : null;
    if (page) content = { kind: "rich", html: `<a href="${escapeMarkup(page.href)}">${escapeMarkup(page.title)}</a>` };
    // A table's cells' pictures, made files of the document's folder before the table is (one undo step with it).
    const celled = content.kind === "blocks" ? pictureTexts(content.blocks) : [];
    if (celled.length > 0 && pictures()) picture = pictures().maker(await pictures().resolve(celled, content.from ?? null, { same: content.same, project: content.project }));
    // Blocks of another document made anew of what they carry (an image, a file, an embed, a bookmark): the
    // files of its folder they name copied into this one's first (carry.mjs), one undo step with the paste;
    // none copied, nothing is pasted.
    const carried = content.kind === "blocks" && content.own && !content.same && (!host || can(host, "split")) ? filesOf(document, content.blocks) : [];
    if (carried.length > 0) {
      carriedFiles = await carryFiles(carried, { from: content.from, project: content.project, upload, say });
      if (!carriedFiles) return;
    }
    try {
      if (!host) {
        // With blocks selected: blocks after them (text as paragraphs, Markdown read).
        const list = content.kind === "blocks" ? content.blocks
          : content.kind === "rich" ? [{ type: "paragraph", html: content.html }] : toBlocks(fromMarkdown(content.text), null, HELD);
        const made = list.length > 0 ? pasteAfter(anchor, list) : null;
        const link = href ? made?.[0].querySelector("a[href]") : null;
        if (link) linkPasted(link, page);
        return;
      }
      if (!host.isConnected || !host.contains(range.startContainer)) return;
      // An address alone: a link wherever the block takes them (a cell, a caption too).
      if (href && can(host, "links")) {
        const link = document.createElement("a");
        link.setAttribute("href", page?.href ?? href);
        link.textContent = page?.title ?? words;
        insertNodes(host, range, [link], { own: true, join: false }); // the link stays the one its views are offered for
        linkPasted(link, page); // 选择视图: the views offered for the link pasted
        return;
      }
      if (!can(host, "split")) return pasteJoined(host, range, content, data);
      // A flowchart node's title made by paste looks as one made by typing: what lands in it bold
      // where bold is armed (its empty title: format-bar/), and plain text bold in a title bold
      // throughout, as typed there (the caret's marks); rich text in a title written keeps its own.
      const titled = isFirstLine(host) && ((isEmpty(host) && titleBold()) || (content.kind === "plain" && boldThroughout(host)));
      if (content.kind === "plain") {
        const text = content.text.replace(/\r?\n/g, " ");
        if (/\n/.test(content.text)) content = { kind: "blocks", blocks: content.text.split(/\r?\n/).filter((line) => line.trim()).map((line) => ({ type: "paragraph", html: escapeTyped(line) })) };
        else return insertNodes(host, range, [document.createTextNode(text)], { bold: titled });
      }
      if (content.kind === "rich") return pasteRich(host, range, content.html, Boolean(content.own), titled, content.edges);
      // A text block of no block of the page (the title, one beside a detail card's content) has no place for blocks after it.
      if (!pasteIntoText(host, range, content.blocks, titled)) pasteJoined(host, range, content, data);
    } finally {
      formula = null;
      mention = null;
      picture = null;
      carriedFiles = null;
      here = true;
    }
  }


  /**
   * The clipboard as rows of cells for a paste into a table's cells (table/cells.mjs: the caret in a
   * cell, or cells selected), each cell its inline HTML: { rows, from } (`from`: the report the
   * page's own was copied from, whose files its pictures are), or null when it holds nothing. In
   * this order: the page's cells (the table tools' copy), its text or blocks (ownCells);
   * another program's table, HTML that is one table and no words outside it (Excel, Google Sheets,
   * Feishu, Notion, Yuque, a web page's: import/html.mjs tableRows), its cells with their marks, links,
   * colors as the import maps them, line breaks and pictures, a table of one column too; a Markdown
   * table (its text alone: Yuque's Markdown, a .md file's), read as a paste's Markdown with its cells'
   * pictures; tab-separated lines (Excel's and Google Sheets' text), two lines or more of as many cells,
   * two or more, a cell in quotes holding tabs, line breaks and "" a quote; else its text, one cell
   * holding its lines.
   */
  function cellsOf(data) {
    const copied = cellsData(data);
    const cells = parseCells(copied || "null");
    if (cells) return { rows: cells, ...(reportIn(copied) ? origin(copied) : { from: null }) }; // the document they were copied in, of its workspace
    const own = ownCells(data);
    if (own) return { rows: own, ...origin(ownData(data)) };
    const external = externalContent(data);
    const table = external.html ? tableRows(parseClipboardHTML(external.html), { colors: external.colors }) : null;
    if (table?.length) return { rows: table.map((row) => row.map((cell) => richHtml(cell, { pictures: true }))), from: null };
    const text = external.text.replace(/\n+$/, "");
    if (/^\s*\|/m.test(text)) {
      const made = toBlocks(fromMarkdown(text), null, HELD);
      if (made.length === 1 && Array.isArray(made[0].rows)) return { rows: made[0].rows, from: null }; // a table alone
    }
    const lines = tabbed(text);
    const html = (words) => escapeText(words).replace(/\n/g, "<br>");
    if (lines) return { rows: lines.map((row) => row.map(html)), from: null };
    return text.trim() ? { rows: [[html(text)]], from: null } : null;
  }

  /**
   * The page's own text or blocks on the clipboard as rows of cells' inline HTML (table/, cells
   * selected): text copied in a block one cell of it; a table copied alone its cells as they are (one
   * with merged cells left to its HTML); other blocks one cell of their lines (joinedHtml: no list's
   * marker, no Markdown); null for anything else (the HTML table of blocks holding one is read).
   */
  function ownCells(data) {
    const own = ownData(data);
    const text = own ? parseText(own) : null;
    if (text !== null) return [[text]];
    const list = own ? parse(own) : null;
    if (!list) return null;
    const table = list.length === 1 ? (list[0].type === "copy" ? list[0].data : list[0]) : null;
    if (table?.type === "table") return table.spans ? null : table.rows;
    if (/"(type|kind)":"table"/.test(JSON.stringify(list))) return null;
    const html = joinedHtml(list);
    return html ? [[html]] : null;
  }

  return { copy, copyAcross, copyBlocks, copyPicture, cellsOf, paste, blocksAt };
}

// The inline HTML among described blocks (`value`, at any depth) that holds pictures: a table's cells' (单元格里的图片).
// A copy's markup (`html`, `text`: the block as it is on the page, a card's picture in it) is no inline HTML
// of a cell: only what it carries (`data`) is looked into.
function pictureTexts(value, found = []) {
  if (typeof value === "string") {
    if (value.includes("<img")) found.push(value);
  } else if (Array.isArray(value)) value.forEach((each) => pictureTexts(each, found));
  else if (value?.type === "copy") pictureTexts(value.data ?? null, found);
  else if (value && typeof value === "object") Object.values(value).forEach((each) => pictureTexts(each, found));
  return found;
}

// The report the table tools' copy of cells says it was copied from, or null.
function reportIn(copied) {
  try {
    const from = JSON.parse(copied)?.report;
    return typeof from === "string" ? from : null;
  } catch {
    return null;
  }
}

/**
 * Tab-separated lines as rows of cells (Excel's and Google Sheets' text: two lines or more, each of
 * as many cells, two or more), or null. A cell starting with a quote is in
 * quotes, holding tabs and line breaks, "" a quote in it (Excel's quoting).
 */
export function tabbed(text) {
  if (!text.includes("\t")) return null;
  const rows = [[]];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (quoted) {
      if (character !== '"') cell += character;
      else if (text[i + 1] === '"') cell += text[++i];
      else quoted = false;
    } else if (character === '"' && cell === "") quoted = true;
    else if (character === "\t" || character === "\n") {
      rows.at(-1).push(cell);
      cell = "";
      if (character === "\n") rows.push([]);
    } else cell += character;
  }
  rows.at(-1).push(cell);
  const width = rows[0].length;
  return rows.length > 1 && width > 1 && rows.every((row) => row.length === width) ? rows : null;
}

// What a field of plain text takes of the clipboard, as one line: the text of the page's own blocks
// (their lines, no list's marker, no Markdown), else the clipboard's plain text.
function plainOf(content, data) {
  if (content.own && content.kind === "blocks") {
    const template = document.createElement("template");
    template.innerHTML = joinedHtml(content.blocks);
    return [...template.content.children].map((line) => plainText(line.innerHTML).replace(/\s+/g, " ").trim()).filter(Boolean).join(" ");
  }
  return (data.getData("text/plain") || "").replace(/\r?\n/g, " ");
}

// The spaces at the ends of a line of text pasted (pastedLines `edges`): all of the page's own text
// copied in a block; of another's HTML, those its plain text has (a space, a tab, a non-breaking
// space: what the program says its words begin or end with, not the line breaks and indentation of
// its markup).
const BOTH_EDGES = { start: true, end: true };
function plainEdges(data) {
  const text = data.getData("text/plain") || "";
  return { start: /^[ \t\u00a0]/.test(text), end: /[ \t\u00a0]$/.test(text) };
}

// Another program's blocks as the page makes them: a list item holds its blocks.
const HELD = { held: true };

// What the text after the caret is when no block pasted takes it: a paragraph of its own.
const TAIL = { type: "paragraph", html: "" };

// Whether a text block is empty and a paste may take its place (or take it away): one of its own
// (not a part of another block), that can be removed, that is not kept, and holds no lists.
const removableEmpty = (host, unit) => host === unit && isEmpty(host) && removable(host);

// Whether a range holds any words or a formula.
function holdsWords(range) {
  const held = range.cloneContents();
  return Boolean(held.textContent.trim() || held.querySelector("[data-ge-atom]"));
}

// The range of a text block's text before `range`.
function before(host, range) {
  const head = document.createRange();
  head.setStart(host, 0);
  head.setEnd(range.startContainer, range.startOffset);
  return head;
}

// Whether a text block holds nothing but what `range` selects: no text and no formula beside it.
function emptiedBy(host, range) {
  const before = document.createRange();
  before.setStart(host, 0);
  before.setEnd(range.startContainer, range.startOffset);
  const after = document.createRange();
  after.setStart(range.endContainer, range.endOffset);
  after.setEnd(host, textEndOf(host));
  const left = document.createElement("div");
  left.append(before.cloneContents(), after.cloneContents());
  return isEmpty(left);
}

// The text blocks of new nodes: the nodes themselves and the editable ones in them (what a change touches).
const textsOf = (nodes) => nodes.flatMap((node) => [node, ...node.querySelectorAll('[contenteditable="true"]')]).filter(isHost);

// The caret's range emptied (what was selected goes), and the range of what stands after it to the
// end of the block's own text (taken out by extractContents()).
function cutAtCaret(host, range) {
  range.deleteContents();
  const tail = document.createRange();
  tail.setStart(range.startContainer, range.startOffset);
  tail.setEnd(host, textEndOf(host));
  return tail;
}

// The end of a block's own text (a list item's text ends before the blocks it holds).
const textEndOf = (host) => textEnd(host);

