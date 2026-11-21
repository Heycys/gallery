import { documentKey } from "./workspace-address.mjs";
// The session between a report page and a workbench that shows it in an iframe of the same origin
// (docs/workbench.md): the page's side is src/editor/page/session.mjs, the workbench's
// src/workbench/app/session/. Every message is { protocol: PROTOCOL, v: VERSION, type, slug, ... },
// posted to the other window for this origin only. Every document uses this service.
//
//   report -> workbench   ready    once the editor started: { commands, title, icon, look, state, annotations, card }
//                         state    when the state, the title, the page's icon, the look it shows, how many 批注 it
//                                  has or whether a detail card is open changed: { title, icon, look, state,
//                                  annotations, card, cardAt } (icon: the page's icon, an emoji, or null; look: the
//                                  document's look on its <html>, shared/document-look.mjs; card: a detail card is open;
//                                  cardAt: when the fade of a card opened, or of the last one closed, started,
//                                  ms since the epoch, timeOrigin + its start time, said once more as it starts)
//                         reply    to a command, once it is done: { id, ok, ... }
//                         key      a key combination the workbench registered, pressed in the page: { key }
//                         notice   something to tell the reader, as the workbench's toast: { text, tone, hold,
//                                  room }
//                         noticeRoom
//                                  the room the page's bottom panels take changed: { room }, px above the
//                                  frame's bottom (0: none), which the workbench's toasts stand above
//                         reload   show the report again (the file changed): the workbench loads it in a
//                                  hidden frame (data-pending) and swaps it in once that page is ready,
//                                  so the reader never sees a page being reloaded; this page has
//                                  stopped (it commits and stores nothing more)
//                         open     go to another document (a link in the page): { target, block }
//                                  (`target` its slug, as `slug` stays the sender's; `block` a block's id
//                                  or null), or { hash } (a workbench's address, which the page cannot
//                                  read without the titles); unsaved text is as for a click in the sidebar
//                         jump     a link goes to a block of this page, sent before the page goes there:
//                                  { block, place } (`place` where the reader is: x, y, top and tabs as
//                                  reading-place.mjs's placeIn gives them, the caret's unit, self and
//                                  offset, the detail cards open as modals): the workbench adds a history
//                                  entry, the way back to it being the command show-place
//                         workspace a page was made under this one (a page block's box, the page itself
//                                  staying as it is): the workbench reads the list of pages again and
//                                  shows this page's row open
//                         consent  a block's card asks to be let online (its 允许访问: the kit's net.js):
//                                  { block (its id), hosts (those of its needs waiting) }: the workbench
//                                  opens its consent dialog, which writes what the reader says
//                         focus    where the reader is on the page, when it changed (editor/page/focus.mjs): { caret, selection },
//                                  caret: { block (a data-block-id, or null), text } or null; selection: { kind ("text" or
//                                  "blocks"), blocks: [data-block-id…], text } or null, each cut to 200 characters. The workbench
//                                  reports it, with the tab's other facts, to its server: gallery status (shared/presence.mjs)
//                         annotations-removed
//                                  a 批注 deleted from its card: { items }: the workbench says so, as
//                                  it does for 全部删除, and its 撤销 puts them back
//   workbench -> report   command  { id, name, ... }

export const PROTOCOL = "gallery/session";
// The protocol's id before the product's rename (2026-10-26). A workbench and a page of different
// versions meet when one was open before the server was updated and the other loaded after: each
// side takes either id. The page, until the workbench has spoken to it (its first command), sends
// every message under both ids, PROTOCOL first; once it has, only under the id the workbench used,
// and it answers a command under the id the command came in. The workbench sends a frame its
// commands under the id the frame last spoke, and takes an OLD_PROTOCOL message from a page that has
// spoken PROTOCOL as the copy it is (ignored). So an old workbench still hears a new page's reload
// and notices, and a new workbench drives an old page; nothing the page says is lost on either.
export const OLD_PROTOCOL = "html-report-studio/session";
/** The ids a message may carry: the new one first. */
export const PROTOCOLS = [PROTOCOL, OLD_PROTOCOL];
export const VERSION = 2;

/**
 * Where a page finds, as it starts, where its reader was ({ x, y, top, unit, self, offset, modals,
 * notice }, once: kept-view.mjs takeView; `top` as reading-place.mjs's placeIn gives it, which the way
 * back from another document keeps): sessionStorage, which a workbench and its frames share. A page
 * puts it there before it is shown again; the workbench before the way back comes to it, and as it
 * loads anew the page it showed (kept-view.mjs keepLeft).
 */
export const viewKey = (slug) => `gallery-edit:${documentKey(slug)}:view`;
/** When this tab last heard someone else write the document (sessionStorage; autosave.mjs: a burst of an Agent's writes goes on from one page of it to the next). */
export const heardKey = (slug) => `gallery-edit:${documentKey(slug)}:heard`;

/**
 * What `state` reports, in this order: editing (the editor runs: the page edits from the start),
 * pending (changes wait to be saved, or are on their way), saving (a commit is on its way), offline
 * (commits do not get through; the changes wait in the browser), conflicts (how many the reader has
 * to decide, a number), changed (someone else wrote the file; the page shows it once nothing waits).
 */
export const STATE_FLAGS = ["editing", "pending", "saving", "offline", "conflicts", "changed"];

/**
 * A key combination as the protocol names it: "Mod" (Ctrl, or ⌘ on a Mac), "Alt", "Shift", then
 * the key (a letter upper-cased), joined by "+": "Mod+K", "Mod+\\", "Mod+Shift+P".
 */
export function keyCombo(event, mac = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? "")) {
  const mod = mac ? event.metaKey : event.ctrlKey;
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  return [mod && "Mod", event.altKey && "Alt", event.shiftKey && "Shift", key].filter(Boolean).join("+");
}
