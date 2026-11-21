import { blocksText, partOwner, plainText } from "./core.mjs";
import { reveal } from "./folded.mjs";
import { wordDiff } from "./merge.mjs";
import { PANEL_STYLE, panelGone, panelShown } from "./panel.mjs";
import { addStyle, element, fadeIn, fadeOut, mount, still, textButton } from "./ui.mjs";
import { t } from "../../shared/i18n/index.mjs";

// The conflicts the page holds back (docs/editor.md, "Conflicts"), each a card in one panel: what
// happened, the reader's version and the file's where there are two (where they differ, marked in each), and
// what can be done about it. Only the block or operation concerned waits; the rest of the page goes
// on saving, and the reader may leave the page (what waits is in the crash buffer). The block
// concerned is flagged (data-ge-flag="conflict"); a click on it shows its card.
//
// An entry is { key, kind, reason, ... }: kind "text" (block, mine: its text and the blocks split
// off it, written with it; theirs), "unit" (unit, change),
// "insert" (element, mine), "reverted" (mine, theirs: someone else's write put the reader's committed
// text back), "reverted-unit" (unit, gone, mine: it took out a block the reader made, or moved one
// the reader moved back) or "reverted-source" (unit, written: it put back parts of what the block's
// component wrote). act(entry, action) does what the reader chose; it resolves with whether the card goes.
//
// What a component wrote (a unit's `change.source`, or what someone else put back of it) is no text:
// the reader's version is the block as it stands on the page, flagged, and the card prints none of it.
// What it offers to keep is that block, copied as Ctrl+C copies it selected, which pastes as a block of
// the same package holding what the page holds, whatever the reader then chooses.

// The card is the editor's one bottom panel (panel.mjs, shared with the lost texts):
// a popover like the workbench's, no colored frame, the flagged block is what stands out. Where the
// reader's version and the file's differ, each marks its own words in place (a design review,
// 2026-11-17): the reader's on a neutral gray (red, on the page, is what the Agent took out), the file's
// as the Agent's words added look on the page (the green under a 2px green line); the text in both stays
// the text's color.
const STYLE = `
  /* The card looked at, among several: one alone is the one anyway. */
  .ge-conflicts:has(.ge-conflict ~ .ge-conflict) .ge-conflict[data-ge-current] { background: var(--ge-hover); }
  .ge-conflict-label { display: flex; gap: 6px; margin: 10px 0 3px; color: var(--ge-tx2); font-size: 12px; }
  .ge-conflict :is(ins, del) { border-radius: 3px; color: inherit; text-decoration: none; }
  .ge-conflict del { background: var(--ge-diff-mine); }
  .ge-conflict ins { background: var(--ge-diff-add); text-decoration: underline 2px var(--ge-diff-add-line); text-decoration-skip-ink: none; }
  .ge-conflict-quiet { display: flex; gap: 2px; margin-left: auto; }
`;

// The server's reasons for what the file cannot hold, whatever stands in it now (source/checks.mjs).
const UNFIT = new Set(["invalid", "fixed", "empty", "no-package"]);

/** Whether a held entry is what the file cannot hold, no conflict with a newer version of it. */
export const unfit = (entry) => UNFIT.has(entry.reason);

/** Whether a held entry was refused for what became of its component's package, the file as it was. */
export const packageChanged = (entry) => entry.reason === "package";

// Whether what the reader wrote is a block a component writes, kept by copying the block: no text.
const holdsBlock = (entry) => (entry.kind === "unit" && Boolean(entry.change?.source)) || entry.kind === "reverted-source";

// What the card says and offers, by kind and reason.
function describe(entry, restorable) {
  const copy = holdsBlock(entry) ? [t("复制这一块"), "copy-block"] : [t("复制我的文字"), "copy"];
  if (entry.kind === "reverted") {
    return { text: t("Agent 的写入把你之前保存的这段修改改回去了。"), both: true, actions: [[t("恢复我的"), "mine", true], [t("接受 Agent 的"), "theirs"]] };
  }
  if (entry.kind === "reverted-unit") {
    return { text: entry.gone ? t("Agent 的写入删掉了你这次新建的这一块。") : t("Agent 的写入把你移动的这一块放回了原处。"), actions: [[t("恢复我的"), "mine", true], [t("接受 Agent 的"), "theirs"], ...(entry.mine ? [copy] : [])] };
  }
  if (entry.kind === "reverted-source") {
    return { text: t("Agent 的写入把你在这个组件里保存的修改改回去了。"), actions: [[t("恢复我的"), "mine", true], [t("接受 Agent 的"), "theirs"], copy] };
  }
  if (unfit(entry)) return { text: entry.reason === "no-package" ? t("这个组件已经不在这个工作区里，这一块没有保存。") : t("这一处的内容文档存不下，没有保存。"), actions: [entry.kind === "insert" ? [t("撤销这一块"), "undo", true] : [t("用文件里的"), "theirs", true], ...(entry.mine || holdsBlock(entry) ? [copy] : [])] };
  if (entry.kind === "text") {
    if (entry.reason === "changed") return { text: t("这一段你和 Agent 同时改了同一处。"), both: true, actions: [[t("保留我的"), "mine", true], [t("用文件里的"), "theirs"]] };
    if (entry.reason === "missing") return { text: t("你修改的这一块已被 Agent 删除。"), actions: [...(restorable ? [[t("恢复我的"), "restore", true]] : []), [t("接受删除"), "accept"], copy] };
    if (entry.reason === "structure") return { text: t("你修改的这一处所在的组件已被 Agent 改过结构，没法确定对应的位置。"), actions: [[t("用文件里的"), "theirs"], copy] };
    if (packageChanged(entry)) return { text: t("这个自定义块刚刚变了，这处文字不再能修改，你的修改没有写进文件。"), actions: [[t("用文件里的"), "theirs"], copy] };
    return { text: t("这一处在文件里找不到唯一对应的位置，没有保存。"), actions: [[t("用文件里的"), "theirs"], copy] };
  }
  if (entry.kind === "unit") {
    const what = entry.change?.remove ? t("删除") : entry.change?.replace || entry.change?.retag ? t("转换类型") : entry.change?.move ? t("移动") : t("调整");
    const words = entry.mine || holdsBlock(entry) ? [copy] : []; // a conversion carries the block's text, a component's write the block
    const verb = what.toLowerCase(); // in a sentence (English writes it in lower case there)
    // Refused again after 仍然… (`again`): written again since the reader was shown it, which the card says,
    // so that the next word is seen to be a new decision. The block's words as the file holds them (`theirs`)
    // stand beside the reader's: what 仍然… writes over, and, of a block deleted, which one it is.
    if (entry.reason === "changed") return { text: entry.again ? t("Agent 在你看到之后又改了这一块，这次{0}没有保存。", verb) : t("你{0}的这一块已被 Agent 修改。", verb), both: true, actions: [[t("仍然{0}", what), "force", true], [t("保留 Agent 的"), "theirs"], ...words] };
    if (entry.reason === "missing") return { text: t("你{0}的这一块已被 Agent 删除。", verb), actions: [[t("接受删除"), "accept", true], ...words] };
    if (entry.reason === "referenced") return { text: t("你删除的这一块现在被脚本或页面其他地方引用了，不能删除。"), actions: [[t("保留它"), "theirs", true]] };
    if (entry.reason === "ambiguous") return { text: t("你{0}的这一块在文件里找不到唯一对应的一块（Agent 写了一样的内容），没有保存。", verb), actions: [[t("用文件里的"), "theirs", true], ...words] };
    return { text: t("你{0}的这一块没能写进文件（周围的内容已被 Agent 改动）。", verb), actions: [[t("用文件里的"), "theirs", true], ...words] };
  }
  return { text: t("你新建（或放回）的这一块没法放进文件（周围的块已被 Agent 改动或删除）。"), actions: [[t("放到附近"), "nearby", true], [t("撤销这一块"), "undo"], copy] };
}

// The word diff (merge.mjs wordDiff).
export { wordDiff };

/**
 * The two versions as the card prints them, each with the words it alone has marked in place: the reader's in
 * <del>, the file's in <ins> ([mine's nodes, theirs' nodes]). Null, both printed plain, where more than half of
 * either is marked (a rewrite, not an edit: the marks would cover it whole) or where the diff does not give
 * either back whole (it reads the first 1500 words of each).
 */
export function markedVersions(mine, theirs) {
  const runs = wordDiff(mine, theirs);
  const side = (own) => runs.filter(({ tag }) => tag === null || tag === own);
  const ours = side("del");
  const file = side("ins");
  const text = (list) => list.map((run) => run.text).join("");
  const marked = (list) => list.reduce((sum, run) => sum + (run.tag ? run.text.length : 0), 0);
  if (text(ours) !== mine || text(file) !== theirs || marked(ours) > mine.length / 2 || marked(file) > theirs.length / 2) return null;
  const nodes = (list) => list.map(({ tag, text }) => (tag ? element(tag, { text }) : document.createTextNode(text)));
  return [nodes(ours), nodes(file)];
}

/**
 * act(entry, action) -> Promise<boolean>: do what the reader chose ("mine", "theirs", "force",
 * "restore", "accept", "undo", "nearby"; "copy" and "copy-block" are done here); true when the card goes. nodeOf(entry): the
 * block it is about, or null; restorable(entry): whether a text the file lost can be made again
 * as a new block; copyBlock(node): the block to the clipboard as the editor copies one selected (clipboard/
 * copyBlocks), whether it went; say(text, kind): the status line.
 */
export function createConflicts({ act, nodeOf, restorable, copyBlock, say }) {
  addStyle(PANEL_STYLE);
  addStyle(STYLE);
  const cards = new Map(); // key -> { entry, node }
  let panel = null;
  let leaving = null; // the panel fading out, the last card gone (taken back when a card comes meanwhile)
  let serial = 0;
  // Shown again (收起, or fading out): it fades in, as it came (the bottom panels' one entrance, ui.mjs fadeIn).
  const reshow = () => {
    if (panel && (panel.hidden || panel.getAnimations?.().length)) fadeIn(panel);
  };

  const flag = (entry, on) => {
    const node = nodeOf(entry);
    if (on) node?.setAttribute("data-ge-flag", "conflict");
    else if (node?.getAttribute("data-ge-flag") === "conflict") node.removeAttribute("data-ge-flag");
  };

  function render() {
    if (cards.size === 0) {
      // It fades out (100ms ease-in, as the bar); the room it took is given back once it has gone.
      if (panel) {
        const gone = panel;
        leaving = gone;
        fadeOut(gone, 100, () => {
          if (leaving !== gone) return;
          leaving = null;
          gone.remove();
          panelGone(gone);
        });
      }
      panel = null;
      return;
    }
    if (!panel && leaving) {
      panel = leaving;
      leaving = null;
      fadeIn(panel);
    } else if (!panel) {
      // role alert on its first show: a screen reader says it (nothing about what the card decides changes).
      panel = mount(element("div", { class: "ge-conflicts", role: "alert", "aria-label": t("冲突"), hidden: "" }));
      fadeIn(panel);
      panelShown(panel);
    } else panel.setAttribute("role", "region");
    const conflicts = [...cards.values()].every(({ entry }) => !unfit(entry));
    const head = element("div", { class: "ge-conflicts-head" }, element("span", { text: conflicts ? t("{0} 处冲突待处理", cards.size) : t("{0} 处内容待处理", cards.size) }), textButton(t("收起"), () => fadeOut(panel, 100), { quiet: true }));
    panel.replaceChildren(head, ...[...cards.values()].map(({ node }) => node));
  }

  function card(entry) {
    const { text, both, actions } = describe(entry, restorable(entry));
    const mine = entry.mine && !holdsBlock(entry) ? plainText(entry.mine) : "";
    const theirs = typeof entry.theirs === "string" ? plainText(entry.theirs) : "";
    const node = element("div", { class: "ge-conflict" }, element("p", { text }));
    // Both versions shown: where they differ, marked in each.
    const marks = both && mine && theirs ? markedVersions(mine, theirs) : null;
    const versions = element("div");
    if (mine) versions.append(element("div", { class: "ge-conflict-label", text: t("你的版本") }), element("div", { class: "ge-version" }, ...(marks?.[0] ?? [mine])));
    if (both && theirs) versions.append(element("div", { class: "ge-conflict-label", text: t("文件里的（Agent 的）") }), element("div", { class: "ge-version" }, ...(marks?.[1] ?? [theirs])));
    node.append(versions);
    const buttons = element("div", { class: "ge-actions" });
    const quiet = element("span", { class: "ge-conflict-quiet" }); // looking, not deciding: on the right
    for (const [label, action, primary] of actions) {
      buttons.append(textButton(label, async () => {
        if (action === "copy-block") {
          const node = nodeOf(entry);
          if (!node?.isConnected || !copyBlock(node)) say(t("没能完成，请再试一次。"), "error");
          return;
        }
        if (action === "copy") {
          // What the block holds now, with the blocks split off it now (written with it), while on the
          // page: the reader may have written on.
          const node = nodeOf(entry);
          const parts = node?.parentElement ? [...node.parentElement.children].filter((other) => partOwner(other)?.owner === node) : [];
          const text = [node, ...parts].filter((part) => part?.isConnected).map(blocksText).filter(Boolean).join("\n") || mine;
          if (text) navigator.clipboard?.writeText(text).then(() => say(t("已复制")));
          else say(t("没有可复制的文字。"));
          return;
        }
        buttons.querySelectorAll("button").forEach((each) => { each.disabled = true; });
        const done = await act(entry, action).catch(() => false);
        buttons.querySelectorAll("button").forEach((each) => { each.disabled = false; });
        if (done) remove(entry.key);
        else say(t("没能完成，请再试一次。"), "error");
      }, { primary: Boolean(primary) }));
    }
    if (nodeOf(entry)) quiet.append(textButton(t("定位"), () => locate(entry.key), { quiet: true }));
    if (quiet.childElementCount > 0) buttons.append(quiet);
    node.append(buttons);
    return node;
  }

  /** Hold these conflicts for the reader: each a card, its block flagged. */
  function add(entries) {
    for (const entry of entries) {
      // An entry with no key of its own (not one of commits' issues) gets the panel's own.
      const key = entry.key ?? `i${serial++}`;
      const held = { ...entry, key };
      cards.get(key)?.node.remove();
      cards.set(key, { entry: held, node: card(held) });
      flag(held, true);
    }
    render();
    reshow();
  }

  /**
   * The card of `key` goes (decided). Its block stays flagged while another card is about it (a
   * component's write held, and what someone else's write put back of what it wrote before).
   */
  function remove(key) {
    const found = cards.get(key);
    if (!found) return;
    cards.delete(key);
    const node = nodeOf(found.entry);
    if (!node || ![...cards.values()].some(({ entry }) => nodeOf(entry) === node)) flag(found.entry, false);
    render();
  }

  /** The cards `lapsed(entry)` says are about nothing any more go. Returns their entries. */
  function drop(lapsed) {
    const gone = [...cards.values()].map(({ entry }) => entry).filter(lapsed);
    gone.forEach((entry) => remove(entry.key));
    return gone;
  }

  // Scroll to the block of a card, what hides it opened first (a closed disclosure, a tab not shown: the
  // kit's DocKit.reveal), and mark the card as the one looked at.
  function locate(key) {
    const found = cards.get(key);
    const node = found && nodeOf(found.entry);
    if (node) reveal(node); // a folded heading's section too (fold/)
    node?.scrollIntoView({ block: "center", behavior: still() ? "instant" : "smooth" });
    for (const other of cards.values()) other.node.toggleAttribute("data-ge-current", other === found);
  }

  /**
   * Flag again the block each card is about: undo or a conversion may have put another element in
   * its place (the one flagged before is off the page, or no longer what a card is about).
   */
  function reflag() {
    const current = new Set([...cards.values()].map(({ entry }) => nodeOf(entry)).filter(Boolean));
    for (const node of document.querySelectorAll('[data-ge-flag="conflict"]')) if (!current.has(node)) node.removeAttribute("data-ge-flag");
    for (const node of current) if (node.getAttribute("data-ge-flag") !== "conflict") node.setAttribute("data-ge-flag", "conflict");
  }

  /** A click on a flagged block: its card, shown. */
  function show(target) {
    const found = [...cards.values()].find(({ entry }) => nodeOf(entry)?.contains(target));
    if (!found) return false;
    reshow();
    for (const other of cards.values()) other.node.toggleAttribute("data-ge-current", other === found);
    found.node.scrollIntoView({ block: "nearest" });
    return true;
  }

  return { add, remove, drop, show, reflag, node: () => panel };
}
