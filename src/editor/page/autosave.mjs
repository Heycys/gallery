import { TEXTS_KEPT, createCommits, nodeHTML, writtenHTML } from "./commit.mjs";
import { randomRequestId } from "../../shared/ids.mjs";
import { heardKey as heardKeyOf } from "../../shared/session.mjs";
import { keepView } from "../../shared/kept-view.mjs";
import { postJson } from "./post.mjs";
import { unpack } from "./sync-state.mjs";
import { placeIn } from "../../shared/reading-place.mjs";

// Autosave (docs/editor.md, "Autosave"): the page is always editing and commits what changed
// (commit.mjs) by itself. A change waits for a pause in typing (IDLE), at most LONGEST while the
// reader keeps typing; a discrete operation (a block deleted, moved, split or converted, a
// formatting step, undo) and the end of an input method's composition commit at once, and Ctrl+S
// commits whatever waits. One commit is on its way at a time; what changes meanwhile goes with the
// next. A commit that does not get through is tried again, later and later, as it was: the file
// may have taken it (only the answer was lost), and one built anew from the page would name what
// it wrote as still to be written (the reader's later words lost, or a conflict with them).
//
// Nothing is lost when the page goes away before a commit is answered: what is not in the file is
// kept in localStorage (the crash buffer): the commit whose answer never came, the commit that
// would carry everything else (what is held for the reader too), and the text of blocks no commit
// can carry yet; with a commit whose answer is not known, what the page knows and the page itself
// (stateKey), so that the next page takes up exactly where this one was. A page opening on the report sends what a closed or crashed page left there
// (recover), and lists what the file did not take (lostKey) until the reader has dealt with it.
// Commits name everything by identity and the blocks made on the page by ids the page proposes,
// so sending one again, from the buffer or after a lost answer, writes it once. Closing the page
// tries a last commit (keepalive) when none is on its way, but that is only a try; the buffer is
// what counts.
//
// The file changing by someone else (the Agent, another tab) is not a question for the reader:
// commits merge with it on the server, and the page shows it where it stands (`pull`, pull/: the user's
// 2026-11-12, "用户写用户的，agent 更新，基本无感") whenever no commit is on its way or waits to be sent again,
// nothing is held for the reader and the reader is in the middle of nothing (a press, a composition), what
// the reader typed and has not saved staying theirs (its commit merges with the file's): once the revert
// check (below) has answered about the version it reads, it puts the words that write changed in the
// blocks it changed, no reload, no swap, the undo steps, the selection, the input method and what is open
// all kept. A write that did more than change words (a block added, taken out or moved, a look, the page's
// head) is shown as before, by loading the page anew: once nothing is left that the file does not have
// (settled) and the reader pauses, the page reloads to show it, where the reader was (reloadView).
// An Agent writes in bursts, a write every few seconds: a write the page shows anew heard within
// BURST_GAP of the last one before it the page showed anew too (with the pull off, every write) is one
// of a burst, and the page waits until the file has been still for one and a half of that gap (BURST at
// least, BURST_MOST at most), so that it is shown again once at the burst's end, not after each write,
// the page live all along (the user's 2026-11-12, who found the page frozen while an Agent wrote: each
// write had the workbench load the page anew, the page out of reach meanwhile, the next write starting
// that again). A write the pull takes in is no part of a burst: it costs the reader nothing, and the one
// after it that the pull cannot take in (a script added) is shown as soon as the reader pauses (the
// user's 2026-11-14: a script added after paragraphs the pull had taken in waited for the Agent to stop
// writing, the page showing none of it meanwhile). A burst that goes on is shown every CATCH_UP to a
// reader who has left the page alone for READER_IDLE (no key, press or wheel). A lone write is shown
// as soon as the reader pauses, as ever. Only when that write put texts the reader committed back as they were (an Agent
// writing the whole file from what it read earlier) does the page ask first: it keeps the texts it
// committed (commits.committed(), and those of its earlier loads: the journal), the blocks it
// made and moved this load (commits.placedUnits(), and those earlier loads made) and what its
// components wrote (commits.written(), those of earlier loads too), and the server says which the
// file now has as before (POST /__gallery/edit/reverted): a text as it was, a block it made gone, a
// block it moved back in the unit it was in, a part as before a write of the page's. A page going away
// keeps all of it in localStorage (journalKey) with the version of the file it last knew; the next
// page of the document, in this tab or another, opening on another version, asks at once.

const IDLE = 1600;
const LONGEST = 8000;
const RETRY = [1000, 2000, 5000, 10000, 30000];
const QUIET = 1500; // how long the reader has changed nothing before the page reloads by itself
const BURST_GAP = 15000; // someone else's write heard this soon after the one before is one of a burst
const BURST = 4000; // a burst: the least time the file has been still before the page shows it…
const BURST_MOST = 12000; // …and the most (one and a half of the gap between its last two writes between them)
const CATCH_UP = 20000; // a burst going on: how long a page shows what it opened on before it shows the file anyway…
const READER_IDLE = 3000; // …to a reader who has not touched the page for this long
const STORE_EVERY = 1000; // the crash buffer while typing, at most this often
const JOURNAL_FOR = 60 * 60 * 1000; // how long a committed text is checked for being put back
const JOURNAL_SIZE = 100_000; // the most characters one document's journal keeps (the newest entries)
const OWN_FOR = 5000; // how long the live-reload channel may still announce a version this page wrote
const ANY = Symbol("any"); // the revert check had nothing to ask of: whatever version the file is, the pull shows it
// A page of the Agent's own (its address's ?agent: the Agent 自用 one gallery open prints, gallery
// component try's): its commits say so (`agent`), and the edit service counts what they write as the
// Agent's, not the reader's (its writerOf and the recent versions: docs/editor.md "Recent versions").
const AGENT_PAGE = typeof location !== "undefined" && new URLSearchParams(location.search).has("agent");

// A committed text as the revert check names it, whichever load named it: the report's title, a block of
// a unit by the unit's id (or what named the unit, with none) and its place in it, any other by what
// names it but the words it had.
const sameText = (block) => JSON.stringify(block?.title ? "title" : block?.unit ? [block.unit.id ?? block.unit.blockId ?? [block.unit.key, block.unit.open], block.self ? true : block.path ?? null] : { ...block, before: undefined });

// The journal's texts (journal()) with those of commits not answered yet (`requests`: on their way, or
// the crash buffer's) taken as committed, as committedText (commit.mjs) takes a commit's: what each
// replaced first stays where the text started, what it was between is `earlier`, and one back as it
// was first and nothing between is none; committed now (`at`).
function folded(texts, requests) {
  const named = new Map(texts.map((entry) => [sameText(entry.block), entry]));
  let serial = 0;
  for (const request of requests) {
    for (const text of request?.texts ?? []) {
      const mine = text?.parts?.find((part) => part.keep)?.html;
      if (typeof mine !== "string" || !text.block) continue;
      const name = sameText(text.block);
      const was = named.get(name);
      const original = was?.original ?? text.block.before;
      if (typeof original !== "string" || (was && was.mine === mine)) continue;
      const earlier = [...new Set([...(was?.earlier ?? []), ...(was ? [was.mine] : [])])].filter((each) => each !== mine && each !== original).slice(-TEXTS_KEPT);
      if (mine === original && earlier.length === 0) {
        named.delete(name);
        continue;
      }
      const entry = { key: was?.key ?? `f${serial++}`, block: { ...text.block, before: mine }, original, mine, ...(earlier.length > 0 ? { earlier } : {}), ...(was?.time ? { time: was.time } : {}), at: Date.now() };
      named.set(name, entry);
    }
  }
  return [...named.values()];
}

/**
 * map: the page's map (slug, version, token); commits: createCommits(); blocked(): commits wait
 * (an input method is composing); changedAt(): when the reader last changed anything; holding(asked):
 * the reader is in the middle of something (a press, a drag), so the page does not reload by
 * itself (`asked`: the page asked to be shown again itself, reloadSoon, where someone else's write
 * alone came before); refresh(): the state changed; applied(result, receipt): a commit was taken in;
 * failed(reason, message): a commit that cannot go through as it is (not a lost connection);
 * warn("storage"): the crash buffer could not be written; storage: localStorage
 * (get/set/remove/keys); tab(): this tab's id (a duplicated tab takes a new one); notice(): what the
 * page says after it reloads by itself (a merge it just made), or null; session: sessionStorage
 * (get/remove), read once for the journal an earlier Gallery kept there; reverted(entries): texts, blocks and components' writes of the reader's that
 * someone else's write put back, for the reader to decide on (decide) before the page shows that
 * write (a component's with `written`: the parts, by name, and the hashes the file holds of them);
 * lapsed(keys): those of them about blocks a later write no longer puts back, by key, gone undecided;
 * listed(): words were added to what the page could not put back (lostKey), to be shown; before(): called right
 * before a commit goes, a promise it waits for (or null): what goes with the edit elsewhere is told
 * first (where the words of the reader's 批注 went: annotate/ sync). pull({ accept(version), ready(), store() }):
 * someone else's write shown where the page stands (pull/apply.mjs: { outcome, version, journal }), or null
 * (the switch off: every write shown by loading the page anew).
 */
export function createAutosave({ map, commits, blocked, changedAt, holding = () => false, refresh, applied, failed, warn = () => {}, storage, tab, notice = () => null, session = null, reverted = () => {}, lapsed = () => {}, listed = () => {}, before = () => null, pull = null }) {
  let known = map.version; // the file's version as the page last knew it
  // Versions this page's commits wrote (and the one it opened on), in order, and when: the
  // live-reload channel announces them too, a little later, in the order they were written. Only
  // for a while, and only in that order: a version is a text, not a write, and someone else writing
  // the file back to one of them (later, or after a newer one of the page's was announced) is a
  // write of theirs. One the page took in where it stands (a pull), and with the pull on the one it
  // opened on, is someone else's write it shows, whose announcement may come after it read the file: its
  // own only while it is the version the page knows (`strict`); written back once the page knows another
  // (an Agent undoing its last edit, or writing back what it read before the reader's commit) it is a write
  // of theirs at once, not after OWN_FOR.
  const own = [{ version: map.version, at: Date.now(), strict: Boolean(pull) }];
  let heardUpTo = 0; // the last of them announced so far (its place in own)
  let flight = null; // the commit on its way: { request, pending }
  let parked = null; // a commit sent whose outcome is not known (no answer, busy): { request, pending }, sent again as it is
  let buffer = null; // the request the crash buffer holds now (leave() sends that very one)
  let chain = Promise.resolve(); // the page's writes, one after another (send)
  let again = false;
  let timer = 0;
  let first = 0; // when the oldest change still waiting was made
  let failures = 0;
  let retryAt = 0;
  let offline = false;
  let stopped = null; // why commits stopped (a refusal that trying again will not change)
  let foreign = false; // someone else wrote the file since the page showed it
  let asked = false; // the page asked to be shown again itself (reloadSoon)
  let reloading = false;
  let heardAt = 0; // when someone else's write was last heard (heard, a commit's receipt)
  let heardGap = Infinity; // how long after the last write before it the page showed anew the last one it shows anew came (a burst's)
  let anewAt = 0; // when the last write the page shows anew was heard (kept for the tab too: heardKey)
  let knownAt = Date.now(); // when the page last learned the file's version (opened, a commit's receipt)
  // The pull (pull/): one at a time (`pulling`, commits waiting for it); once a write did more than change
  // words, the page is shown anew as before, and so is every write after it until it is (`swapping`).
  let pulling = false; // a pull reads the page and takes it in (commits wait for it)
  let trying = false; // a pull is under way, its revert check first
  let swapping = false;
  let partial = null; // the last pull that held blocks back: { version, held, wait }, so that it is not read again and again
  let heldWait = 0; // how long the last pull that waited for the caret or a selection to leave a unit the write takes out or moves waits
  let selectionWatched = false;
  let stash = null; // what the journal would keep of the page right before a pull changed it (bail keeps that)
  let pullTries = 0; // pulls in a row that read a version the revert check had not answered about
  // What the revert check is asked again for (a write heard, a commit answered, a decision sent), and the
  // version its last answer was about at which of them (`checkedAbout`: { generation, version }, version
  // ANY where it had nothing to ask of): the pull shows that version and no other.
  let generation = 0;
  let checkedAbout = null;
  let heardCount = 0; // someone else's writes heard
  let heardVersion = null; // the version the last of them was announced as
  // When the last write the page shows anew was heard, kept for the tab (sessionStorage, by document): the
  // page shown again goes on with the burst the one before it heard, its first write it shows anew no lone one.
  const heardKey = heardKeyOf(map.slug);
  const lastAnew = () => {
    try {
      return Math.max(anewAt, Number(sessionStorage.getItem(heardKey)) || 0);
    } catch {
      return anewAt;
    }
  };
  // The write heard at `at` is shown anew: one of a burst when the last one before it the page showed anew was
  // heard less than BURST_GAP before it.
  const anew = (at) => {
    if (!at) return;
    const last = lastAnew();
    try {
      sessionStorage.setItem(heardKey, String(at));
    } catch {}
    heardGap = last && at > last ? at - last : Infinity;
    anewAt = at;
  };
  // With the pull off, every write heard is shown anew. With it on, a write is shown anew once the pull cannot
  // take it in (showAnew), or when it is heard while the page waits for a burst of them to end (every write is
  // shown by that one load, the file to be still first); one heard while the page waits to show a lone one anew
  // is shown by that load too, and makes no burst of it.
  const hearWrite = () => {
    heardAt = Date.now();
    if (!pull || (swapping && heardGap <= BURST_GAP)) anew(heardAt);
  };
  // The page is to be shown anew (`swapping`): the pull could not take in what was heard last.
  const showAnew = () => {
    if (!swapping) anew(heardAt);
    swapping = true;
  };
  // How long the file is to have been still before the page shows it: none for a lone write. Asked before the
  // page shows anew what the pull holds back (`held`), of the write it would show anew then.
  const burstGap = () => {
    if (!pull || swapping) return heardGap;
    const last = lastAnew();
    return last && heardAt > last ? heardAt - last : Infinity;
  };
  const stillNeeded = () => {
    const gap = burstGap();
    return gap <= BURST_GAP ? Math.min(BURST_MOST, Math.max(BURST, gap * 1.5)) : 0;
  };
  let inputAt = 0; // when the reader last pressed a key, pressed or turned the wheel on the page
  const startedAt = Date.now();
  for (const type of ["keydown", "pointerdown", "wheel", "touchstart"]) addEventListener(type, () => { inputAt = Date.now(); }, { capture: true, passive: true });
  let closed = false; // the page is done with (close)
  let leaving = false; // the page goes away (leave), until it is shown again from the back/forward cache
  let storedAt = 0;
  let flightAt = 0; // when the commit on its way went
  let buffered = false; // the crash buffer holds something
  let unstored = false; // the crash buffer could not be written
  let storedFrom = null; // what the page held (collect()'s result) when the buffer was last written with nothing on its way; null: write it anew
  const events = []; // [version, when]: what the live-reload channel announced while a commit was on its way
  // What earlier pages of the document committed, made and wrote (the journal, journalKey: what each
  // page kept as it went away, by tab), taken by this one as its own: the texts, still checked for an
  // hour, each under a key of its own (`c<n>`: an earlier load's keys name its blocks, as this one's
  // name others); the blocks they made (`m<n>`: by the file's id, with their words), until the file is
  // found without one (listed) or the page no longer shows one it was found with (the reader deleted
  // it); what their components wrote, the commits' own again (carry), by instance. This tab's are taken
  // as the page is made, those of tabs no longer open once it knows which are (opened).
  let carried = [];
  let carriedMade = [];
  let textSerial = 0;
  let madeSerial = 0;
  // Where a block an earlier load made stands and what it holds (revertedUnits' `between`, `holds`): as this
  // page shows it, else as the journal kept it from the page that made it.
  const besideMade = (id, { between, holds } = {}) => {
    const unit = commits.unitOf(id);
    return unit !== null ? commits.besideOf(unit) : { ...(Array.isArray(between) ? { between } : {}), ...(Array.isArray(holds) ? { holds } : {}) };
  };
  // The version of the file the page last knew: every write up to it the page's own or asked of (the
  // revert check answered about it, what it put back held for the reader). What the page keeps as it
  // goes away says it; null while a question about what earlier pages kept is not answered yet.
  let seen = map.version;
  let asking = false; // what earlier pages kept, taken, is to be asked of (the file not the version they last knew)
  const adopt = (departures) => {
    let ask = false;
    for (const { known, entries } of departures) {
      if (known !== map.version) ask = true;
      carried.push(...entries.filter((entry) => entry.instance === undefined && entry.made === undefined && entry.block).map((entry) => ({ ...entry, key: `c${textSerial++}` })));
      carriedMade.push(...entries.filter((entry) => typeof entry.made === "string" && !carriedMade.some((other) => other.id === entry.made))
        .map(({ made, parent, text, time, between, holds }) => ({ key: `m${madeSerial++}`, id: made, parent: parent ?? null, text: String(text ?? ""), time, confirmed: known === map.version, ...(Array.isArray(between) ? { between } : {}), ...(Array.isArray(holds) ? { holds } : {}) })));
      commits.carry(entries.filter((entry) => entry.instance !== undefined).map(({ instance, parts, time }) => ({ id: instance, parts, time })));
    }
    if (ask) {
      asking = true;
      seen = null;
    }
  };
  try {
    adopt([...legacyJournal(session, map.slug), ...takeJournal(storage, map.slug, (id) => id === tab())]);
  } catch {}
  const reverts = new Map(); // key -> entry: put back by someone else, waiting for the reader
  let checking = false;
  const waiters = [];
  const bufferKey = () => pendingKey(map.slug, tab());
  const keptKey = () => stateKey(map.slug, tab());

  // How many changes wait, and how many blocks no commit can carry yet, as last counted
  // (collectEdits is not free): on each change, after each commit. `counted`: what they were
  // counted from (collect()'s result), to know whether they still hold (commits.current).
  let count = 0;
  let drafts = 0;
  let counted = null;
  const recount = (collected = commits.collect()) => {
    ({ waiting: count, drafts } = commits.counts(collected));
    counted = collected;
  };
  const waiting = () => count;

  // ---------- scheduling ----------
  function arm(due) {
    clearTimeout(timer);
    timer = setTimeout(run, Math.max(0, due - Date.now(), retryAt - Date.now()));
  }

  /**
   * A change was made (`collected`: collectEdits' result, when the caller has it): commit after a
   * pause, or at once (`now`) for a discrete operation.
   */
  function changed(now = false, collected = undefined) {
    if (closed) return;
    recount(collected);
    if (stopped || reloading) return;
    if (count === 0 && !now) {
      store({ collected: counted }); // nothing waits (typed and deleted again): nothing to keep but what is on its way
      return;
    }
    const at = Date.now();
    if (!first) first = at;
    arm(now ? at : Math.min(at + IDLE, first + LONGEST));
    if (!buffered || at - storedAt > STORE_EVERY) store({ collected: counted }); // the first change at once, then now and then
  }

  // What waits once nothing holds commits back any more (changes made while the page was being shown anew or written
  // as the reader asked, which changed() only counted; what a pull left to commit): committed after the usual pause.
  function resume() {
    if (closed || stopped || reloading) return;
    recount();
    if (waiting() > 0) arm(first ? Math.min(first + LONGEST, Date.now() + IDLE) : Date.now() + IDLE);
  }

  /** Commit whatever waits, now; resolves with "saved", "nothing", "offline" or "error". */
  function flush() {
    return new Promise((resolve) => {
      waiters.push(resolve);
      retryAt = 0;
      if (flight) again = true;
      else {
        clearTimeout(timer);
        run();
      }
    });
  }

  const settle = (outcome) => waiters.splice(0).forEach((resolve) => resolve(outcome));

  // A commit that throws on the page (a bug) stops autosave and says so, rather than leaving
  // everything waiting without a word.
  async function run() {
    try {
      await commit();
    } catch (error) {
      flight = null;
      stopped = "error";
      failed("error", String(error?.message ?? error));
      refresh();
      settle("error");
      throw error;
    }
  }

  async function commit() {
    timer = 0;
    if (closed) return;
    if (flight) {
      again = true;
      return;
    }
    if (stopped || reloading) return settle("error");
    if (blocked()) return arm(Date.now() + 300); // the composition's end is a change: the commit goes after the pause
    if (pulling) return arm(Date.now() + 100); // a pull reads the file and the page as they are: the commit goes after it
    // A commit whose outcome is not known goes again as it went, before anything newer is built.
    // Otherwise it is built from what the page holds now, which the count and the crash buffer read
    // too (one collect for the three); nothing is built when nothing waited as last counted and
    // nothing changed since (commits.current: a flush with nothing to save, as when the page is left).
    const idle = !parked && count === 0 && commits.current(counted);
    const collected = parked ? undefined : idle ? counted : commits.collect();
    const built = parked ?? (idle ? null : commits.build({ collected }));
    first = 0;
    if (!built) {
      recount(collected);
      store({ collected });
      refresh();
      settle(offline ? "offline" : "nothing");
      maybeReload();
      return;
    }
    flight = parked ?? { request: { ...built.request, known, request: randomRequestId() }, pending: built.pending };
    flightAt = Date.now();
    parked = null;
    store({ collected });
    refresh();
    let receipt;
    try {
      await before();
    } catch {}
    try {
      receipt = await send(flight.request);
    } catch {
      receipt = { ok: false, reason: "offline" };
    }
    const sent = flight;
    flight = null;
    if (closed) return; // the page is gone: nothing to take in
    let after; // with the answer taken in: what the page holds now (anew: the page changed meanwhile), counted and kept
    if (receipt.ok) {
      generation++; // what the page committed changed: the revert check asks of it
      failures = 0;
      retryAt = 0;
      offline = false;
      // Someone else's write the commit went over: a write heard only when none was heard since the page
      // last knew the file (else it is that one, heard already, whose version the page had not taken).
      if (receipt.foreign && heardAt < knownAt) hearWrite();
      known = receipt.version;
      knownAt = Date.now();
      // Written over the version the page last knew, no one else's write between: the page knows this one.
      if (!receipt.foreign && seen !== null && sent.request.known === seen) seen = receipt.version;
      if (receipt.wrote !== false) own.push({ version: receipt.version, at: Date.now() }); // one that changed nothing wrote no version
      if (receipt.foreign) foreign = true;
      deleted(sent.request, receipt);
      applied(commits.apply(sent.pending, receipt, { alone: !foreign }), receipt);
      after = commits.collect();
      recount(after);
      for (const [version, at] of events.splice(0)) heard(version, false, at);
      // Someone else wrote the file before this commit: what that put back is asked now, as when
      // the live-reload channel tells of a write (heard).
      if (receipt.foreign) checkReverted().then((answered) => answered !== null && maybeReload());
    } else if (receipt.reason === "offline" || receipt.reason === "busy" || receipt.reason === "server") {
      parked = sent;
      offline = receipt.reason === "offline";
      failures += 1;
      retryAt = Date.now() + RETRY[Math.min(failures, RETRY.length) - 1];
    } else {
      parked = sent; // kept in the crash buffer: a page opening on the report sends it
      stopped = receipt.reason;
      failed(receipt.reason, receipt.message);
    }
    store({ collected: after });
    refresh();
    if (stopped) return settle("error");
    if (!receipt.ok) {
      settle(offline ? "offline" : "busy");
      arm(retryAt);
      return;
    }
    if (again || waiters.length > 0) {
      again = false;
      if (waiting() > 0) return commit();
    }
    if (waiting() > 0) arm(first ? Math.min(first + LONGEST, Date.now() + IDLE) : Date.now() + IDLE);
    else settle("saved");
    maybeReload();
  }

  // Every write of the page goes through here, one at a time: commits, and the reader's decision
  // on a text someone else put back.
  function send(request) {
    const run = chain.then(() => postCommit(map, request));
    chain = run.catch(() => {});
    return run;
  }

  // ---------- the crash buffer ----------
  // What the file may not have: the commit on its way or whose answer never came (`sent`), the
  // commit of everything that differs from what the last answer left (held conflicts and blocks the
  // file refused too: sent again, what the file does not take is listed for the reader), and the
  // texts no commit carries (`keep`: blocks no commit can carry yet, texts someone else's write put
  // back). Nothing at all: no buffer. While a commit's answer is not known (sent again later, on its
  // way for a while, or the page going away: `leaving`), what the page knows and the page itself go
  // along too (stateKey). From leave() on the page is going away, and so is every store after it as
  // it goes (visibilitychange's flush, sending again the commit whose answer never came). `collected`:
  // collect()'s result, when the caller has it from the same task.
  //
  // With nothing on its way, the buffer is written from the page and what the commits know of it
  // (and what someone else put back): when none of these changed since it was last written
  // (commits.current), it holds this already and is left as it is. A page that is left stores three
  // times in a row (prepare-close; pagehide; visibilitychange's flush), each a pass over every block.
  function store({ collected = undefined } = {}) {
    if (closed) return;
    storedAt = Date.now();
    const sent = flight?.request ?? parked?.request ?? null;
    if (!sent && !unstored && storedFrom !== null && commits.current(storedFrom)) return;
    const from = collected ?? commits.collect();
    const { request: built, drafts: texts, typed = [] } = commits.buffer(from);
    storedFrom = sent ? null : from;
    // Kept with the buffer as it is now or not at all: taken up as it was earlier, it would miss
    // what the page did since (the buffer's commit has it).
    let kept = false;
    if (sent && (parked || leaving || (flight && Date.now() - flightAt > STORE_EVERY))) {
      try {
        kept = storage.set(keptKey(), JSON.stringify({ sent: sent.request, foreign, ...commits.keep((flight ?? parked).pending) })) !== false;
      } catch {}
    }
    if (!kept) storage.remove(keptKey()); // the next page goes on from the buffer (rebase)
    const request = built && { ...built, known: null, request: randomRequestId() };
    buffer = request;
    // Words typed in a block a commit makes have no commit to go with: listed, unless one is on its
    // way, when the page's texts below say what the next page does not show of them.
    const keep = [...[...texts, ...(sent ? [] : typed)].map((text) => ({ why: "draft", text })), ...[...reverts.values()].map((entry) => ({ why: "reverted", html: entry.mine, ...writtenIn(entry.id, entry.data) }))];
    buffered = Boolean(sent || request || keep.length > 0);
    if (!buffered) {
      storage.remove(bufferKey());
      unstored = false;
      return;
    }
    // With a commit whose answer is not known, what follows it is rebuilt on its answer by the next
    // page (recover: rebase), as well as it can be: the texts of the page's blocks go along, and
    // what the page then opened on the file does not show is listed (checkLeft).
    const page = sent ? commits.texts() : undefined;
    const stored = storage.set(bufferKey(), JSON.stringify({
      v: 2, time: Date.now(), sent: sent && { ...sent, known: null }, request, keep, ...(page ? { page } : {}),
    })) !== false;
    if (!stored && !unstored) warn("storage");
    unstored = !stored;
  }

  /**
   * The page goes away: keep what is not in the file, and what it committed for the next load to ask
   * of (keepJournal), and try to commit it (the answer is never read): the very request the buffer
   * holds, so that the next page sending it again gets its answer (the commit is not applied twice).
   */
  function leave() {
    // Closed: the page that shows the report now (a workbench's next one) has the buffer, its own.
    if (closed) return;
    leaving = true;
    store();
    keepJournal([flight?.request ?? parked?.request, buffer]); // what is on its way or in the buffer, as the file is to have it
    if (flight || parked || stopped || waiting() === 0 || !buffer) return; // what is on its way is in the buffer
    postCommit(map, buffer, { keepalive: true }).catch(() => {});
  }

  // ---------- someone else's changes ----------
  /**
   * The live-reload channel says the file is now `version` (`anyway`: it changed, whatever the
   * version, as when this page sent what a closed page left), `at` when it said so.
   */
  function heard(version, anyway = false, at = Date.now()) {
    if (closed) return;
    // A write the reader asked for is on its way (showOwn): what is heard meanwhile is its own, or heard again once it failed.
    if (owning) return void (missed = true);
    // It may be the commit on its way, or one whose answer was lost: known once that one is answered
    // (as of when it was announced).
    if ((flight || parked) && !anyway) return void events.push([version, at]);
    if (!anyway) {
      if (!version) return;
      // The next of the page's own writes to be announced (one before the last announced was
      // written back by someone else).
      const index = own.findIndex((write, place) => place >= heardUpTo && write.version === version);
      if (index >= 0 && (version === known || (!own[index].strict && at - own[index].at < OWN_FOR))) {
        heardUpTo = index;
        return;
      }
    }
    foreign = true;
    generation++;
    heardCount++;
    heardVersion = version ?? null;
    hearWrite();
    refresh();
    // What that write put back of the page's is asked at once, whatever else waits: the reader
    // hears of it now, not once all else is settled.
    checkReverted().then((answered) => answered !== null && maybeReload());
    maybeReload();
  }

  // Whether everything the page shows is in the file: nothing waits, nothing is on its way or
  // waits to be sent again, nothing is held for the reader, no block waits for the reader to finish
  // it (a title still empty). Only then may the page reload by itself.
  const settled = () => !flight && !parked && waiting() === 0 && drafts === 0 && commits.issues.size === 0 && reverts.size === 0;

  // What someone else's write put back of what the page committed (POST /__gallery/edit/reverted):
  // texts as they were before, blocks it made taken out, blocks it moved back where they were, parts
  // components wrote as they were before. Each one is held for the reader (reverted) until decided.
  // Resolves with whether the server answered; null while another check runs (that one asks again
  // when it is done).
  let recheck = false;
  async function checkReverted() {
    if (checking) {
      recheck = true;
      return null;
    }
    const about = generation;
    const texts = journal();
    const units = commits.placedUnits();
    // The blocks earlier pages made: those the file was not yet found with, and those the page shows (one
    // found with it and no longer shown, the reader deleted).
    const made = carriedMade.filter((entry) => !entry.confirmed || commits.unitOf(entry.id) !== null);
    const instances = commits.written();
    if (texts.length === 0 && units.length === 0 && made.length === 0 && instances.length === 0) {
      checkedAbout = { generation: about, version: ANY }; // nothing to ask of: any version is shown as it is
      return true;
    }
    checking = true;
    let answer = null;
    try {
      const response = await postJson("/__gallery/edit/reverted", map.token, { slug: map.slug, opening: map.version, texts: texts.map(({ key, block, original, earlier }) => ({ key, block, original, ...(earlier ? { earlier } : {}) })), units: [...units, ...made.map((entry) => ({ key: entry.key, id: entry.id, parent: entry.parent, ...besideMade(entry.id, entry) }))], instances: instances.map(({ key, id, parts }) => ({ key, id, parts })), pageIds: commits.pageIds(), taken: commits.takenOut() });
      answer = await response.json();
    } catch {}
    checking = false;
    if (closed) return false;
    if (answer?.ok) {
      // A block an earlier page made that the file no longer has is no block of this load's to hold a
      // card for: its words are listed (lostKey), as what a page could not put back is; the others are
      // found with the file, asked of while the page shows them.
      const gone = made.filter(({ key }) => (answer.units ?? []).some((entry) => entry.key === key && entry.gone));
      // One made inside another gone (a quote's paragraph, a list's item) went with it, its words among that one's.
      const goneIds = new Set(gone.map(({ id }) => id));
      const words = gone.filter(({ text, parent }) => text && !goneIds.has(parent)).map(({ text }) => ({ why: "reverted", text }));
      const kept = words.length === 0 || keepLost(storage, map.slug, words);
      if (kept) carriedMade = carriedMade.filter((entry) => !gone.includes(entry)); // asked again otherwise
      for (const entry of made) if (!gone.includes(entry)) entry.confirmed = true;
      if (kept && words.length > 0) listed();
      // All of it asked of (no question waits to be asked again, which may carry more): the page knows the
      // file as it was answered about.
      if (kept && !recheck) {
        seen = answer.version ?? null;
        asking = false;
        if (typeof answer.version === "string") checkedAbout = { generation: about, version: answer.version };
      }
    }
    // A card held for a block this load made or moved that the file, asked of again (a write since), no longer
    // puts back goes, the file taken as 接受 Agent 的 takes it: nothing is left to decide. The write put the block
    // back itself, or its own blocks in the place of it: an Agent taking the reader's paragraph out, then
    // putting the picture it was asked for where it stood, two writes apart (feedback of 2026-11-17).
    const lapsing = answer?.ok && Array.isArray(answer.units) ? [...reverts.values()].filter((entry) => entry.unit !== undefined && !entry.written && units.some((unit) => unit.key === entry.unit) && !answer.units.some((other) => other.key === entry.unit)) : [];
    for (const entry of lapsing) {
      commits.putBack(entry.unit, { gone: entry.gone, mine: false, within: entry.within });
      reverts.delete(entry.key);
    }
    if (lapsing.length > 0) {
      storedFrom = null;
      store();
      refresh();
      lapsed(lapsing.map((entry) => entry.key));
    }
    // Of the blocks it made that the write took out, those inside another such go with it, one card.
    const goneUnits = (answer?.units ?? []).filter(({ gone, key }) => gone && !made.some((entry) => entry.key === key)).map(({ key }) => key);
    const back = answer?.ok ? [
      ...answer.reverted.map(({ key, theirs }) => ({ ...texts.find((entry) => entry.key === key), theirs })).filter((entry) => entry.key),
      // A block put back: by its unit, with what it holds (the reader's words, to copy) and, taken out, the
      // blocks taken out inside it (`within`, decided with it; what it holds that the file still has is not).
      ...(answer.units ?? []).filter(({ key, gone }) => units.some((unit) => unit.key === key) && !(gone && commits.heldWithin?.(key, goneUnits))).map(({ key, gone }) => ({ key: `p${key}`, unit: key, gone: Boolean(gone), mine: commits.unitText(key), ...(gone ? { within: goneUnits.filter((inner) => commits.heldWithin?.(inner, [key])) } : {}) })),
      // Parts a component wrote put back: by its unit, with the hashes the file holds of them (`written`)
      // and what the page holds of them (`data`, the reader's, kept with the crash buffer); none the page
      // holds as the file does, however the file spells it (heldOtherwise).
      ...(answer.parts ?? []).map(({ key, parts, markup }) => {
        const entry = instances.find((instance) => instance.key === key);
        return { entry, parts: entry && parts && typeof parts === "object" ? commits.heldOtherwise(entry.key, parts, markup) : {} };
      }).filter(({ entry, parts }) => entry && Object.keys(parts).length > 0)
        .map(({ entry, parts }) => {
          const data = commits.dataOfUnit(entry.key, Object.keys(parts)) ?? {};
          return { key: `s${entry.key}`, unit: entry.key, id: entry.id, written: parts, data, mine: Object.values(data).join("\n") };
        }),
    ].filter((entry) => !reverts.has(entry.key)) : [];
    if (back.length > 0) {
      for (const entry of back) reverts.set(entry.key, entry);
      storedFrom = null; // the buffer keeps their words too
      store();
      refresh();
      reverted(back);
    }
    if (recheck) {
      recheck = false;
      return checkReverted();
    }
    return Boolean(answer?.ok);
  }

  // Once everything is in the file, the reader pauses and the file is still (a burst's), show the file as
  // it is, where the reader was; unless it put back texts or blocks the reader committed
  // (checkReverted, asked once more right before). What is not in the file yet is settled by a commit
  // or by the reader (each ends by asking again), so only a pause is waited for here.
  let reloadTimer = 0;
  // How long to wait still before the page may be shown again (0: now): the reader's pause, and in a
  // burst the file still for long enough (stillNeeded), or the burst gone on for CATCH_UP and the reader
  // not at the page. A page shown again at the reader's word (reloadSoon) waits for no burst.
  function waitLeft() {
    const now = Date.now();
    const pause = blocked() || holding(asked) ? 300 : QUIET - (now - changedAt());
    const still = asked ? 0 : stillNeeded() - (now - heardAt);
    const caught = still > 0 && now - startedAt >= CATCH_UP && now - inputAt >= READER_IDLE;
    return Math.max(pause, caught ? 0 : Math.min(still, 1000), 0);
  }
  async function maybeReload() {
    clearTimeout(reloadTimer);
    if (!foreign || reloading || stopped || closed) return;
    // A revert check on its way: asked again shortly (one a page opening asked has no one to ask after it).
    if (checking) return void (reloadTimer = setTimeout(maybeReload, 300));
    if (pull && !asked && !swapping) return void tryPull();
    if (!settled()) return;
    const wait = waitLeft();
    if (wait > 0) {
      reloadTimer = setTimeout(maybeReload, Math.max(300, wait));
      return;
    }
    const answered = await checkReverted();
    if (answered === null) return; // another check runs, and asks again when it is done
    if (!answered) return void (reloadTimer = setTimeout(maybeReload, 2000));
    // Anything may have happened meanwhile (a change, a commit and its conflicts, something put back, another write heard): ask again.
    if (!settled() || waitLeft() > 0) return void (reloadTimer = setTimeout(maybeReload, 300));
    reloading = true;
    storage.remove(bufferKey());
    storage.remove(keptKey());
    storedFrom = null; // written anew if anything stores after all
    keepJournal(); // a write landing after that answer and before the page shown again is served is asked of there (opened)
    refresh();
    reloadView(map.slug, null, notice());
  }

  // ---------- the pull: someone else's write shown in place ----------
  // Whenever no commit is on its way or waits to be sent again (its answer asks again), nothing is held for
  // the reader (each decision asks again) and the reader is in the middle of nothing the page would break
  // (a press, a composition, a menu on what is typed: asked again shortly): the revert check asked about the
  // file as it is (once for each write heard and each commit answered: `generation`), then the page reads
  // itself as it is served and takes in the version that check answered about, or, where it had nothing to
  // ask of, whatever it reads (another version read: asked again, a few times, then a moment later). What it
  // reads that is more than words (`structure`) is shown as before, by loading the page anew (`swapping`), and
  // so is everything after it; a change of the page's that is no text waiting, or a text the reader changed
  // in a unit with no id yet (its commit names it by where it stood in the version the page opened on, which
  // a pull changes), is committed first, its answer asking again.
  async function tryPull() {
    if (trying || flight || parked) return;
    if (commits.issues.size > 0 || reverts.size > 0) return;
    if (blocked() || holding(true)) return void (reloadTimer = setTimeout(maybeReload, 300));
    trying = true;
    let next = null; // how long until it is asked again (null: something else asks)
    try {
      next = await pullOnce();
    } catch {
      showAnew(); // it threw before it changed the page (a throw while it changes it is a bail): shown anew, as before
      next = 0;
    }
    trying = pulling = false;
    if (closed || reloading) return;
    if (next !== null) reloadTimer = setTimeout(maybeReload, next);
  }

  async function pullOnce() {
    const heardBefore = heardCount;
    if (checkedAbout?.generation !== generation) {
      const answered = await checkReverted();
      if (answered === null) return 300; // another check runs (one a page opening asked, with no one to ask again after it): shortly
      if (!answered) return 2000;
      if (closed || reloading) return null;
    }
    if (reverts.size > 0) return null; // the reader decides first, and each decision asks again
    if (checkedAbout?.generation !== generation) return 300; // a write or an answer meanwhile, or the answer not all kept (the list not written): asked again
    const about = checkedAbout.version;
    // Nothing changed since the question, no other question on its way (one a page opening asked names what it
    // holds by the version it knew then), the reader in the middle of nothing.
    const ready = () => !closed && !reloading && !stopped && !checking && !flight && !parked && reverts.size === 0 && commits.issues.size === 0 && !blocked() && !holding(true) && checkedAbout?.generation === generation;
    if (!ready()) return 300;
    pulling = true; // commits wait from here: the page is read, and taken in
    const result = await pull({
      accept: (version) => about === ANY || version === about,
      ready,
      store: () => {
        storedFrom = null;
        store();
        stash = departure([buffer]);
      },
    });
    pulling = false;
    if (closed || reloading) return null;
    switch (result.outcome) {
      case "applied":
      case "partial":
      case "same": {
        took(result, heardBefore);
        if (!foreign) return null;
        if (result.outcome !== "partial") return 0; // a write heard meanwhile
        // What it could not show yet (a block the reader holds: its commit's answer asks again; one a selection
        // runs across): read again later, and later still while the same is held of the same version.
        const again = partial?.version === result.version && partial.held === result.held;
        partial = { version: result.version, held: result.held, wait: again ? Math.min(partial.wait * 2, 15000) : 3000 };
        return partial.wait;
      }
      case "unread":
        return 2000; // the page could not be read (the server busy or gone): later
      case "held": {
        // A unit the write takes out or moves that the reader's caret or selection is in (or one it puts in between a
        // selection's ends): once it has left, read again a moment after the selection changes, and meanwhile later
        // and later (1.5 s, twice as long each time, 15 s at most), so that a reader who leaves the caret there is not
        // read for every second. Once the reader has paused as a burst of writes waits for (waitLeft: their last
        // change and the file's last write a while ago), shown anew as before (`swapping`): no write held back for
        // as long as the caret stays.
        if (waitLeft() === 0) {
          heldWait = 0;
          showAnew();
          return 0;
        }
        heldWait = heldWait ? Math.min(heldWait * 2, 15000) : 1500;
        if (!selectionWatched) {
          selectionWatched = true;
          addEventListener("selectionchange", () => {
            selectionWatched = false;
            if (trying || closed || reloading) return;
            clearTimeout(reloadTimer);
            reloadTimer = setTimeout(maybeReload, 300);
          }, { capture: true, once: true });
        }
        return Math.max(300, Math.min(heldWait, waitLeft() || heldWait));
      }
      case "stale":
        if (result.version === undefined) return 300; // the page moved on while it read: shortly
        checkedAbout = null; // the file moved on since the question: asked again of the version there is
        return ++pullTries > 3 ? 1000 : 0;
      case "busy":
      case "idless":
        recount();
        if (waiting() === 0) break; // what waits cannot go (none of it would): shown anew, as before
        arm(Date.now()); // committed now, its answer asking again
        return null;
      case "bail":
        bail();
        return null;
      default:
        break;
    }
    showAnew(); // "structure": more than words, shown anew as before
    return 0;
  }

  // A write taken in (the pull's `result`): the page knows the file as that version, its own from now on (its
  // announcement, coming later, is no write of anyone else's), and as the version the revert check answered
  // about; the texts it had committed in blocks that show the file's words now asked of for the hour, as an
  // earlier page's are (the page committed them; the write that changed them may later put them back). The
  // page shows the file when all of it went in and no other write was heard meanwhile (but this one's).
  function took(result, heardBefore) {
    if (showing) {
      showing = false;
      if (commits.givenUpWords?.() > 0) setTimeout(reloadSoon, 0); // what the pull could not show: as before
    }
    pullTries = 0;
    heldWait = 0;
    if (result.outcome !== "partial") partial = null;
    known = result.version;
    knownAt = Date.now();
    own.push({ version: result.version, at: Date.now(), strict: true });
    // The page's own writes before it are behind it now: one of them announced from here on is another's writing it
    // back (the Agent putting back the file as the reader's press left it), shown, or late, which the pull finds the
    // same (a page that takes writes in lives on, where a page shown anew had no writes of its own yet).
    heardUpTo = own.length - 1;
    if (!asking) seen = result.version;
    carried.push(...(result.journal ?? []).map((entry) => ({ ...entry, key: `c${textSerial++}`, time: Date.now() })));
    foreign = result.outcome === "partial" || (heardCount !== heardBefore && heardVersion !== result.version);
    storedFrom = null;
    store();
    resume(); // counted anew (what the pull showed waits no more; what it held does, a commit armed for it)
    refresh();
  }

  // The pull left the page holding something to commit (it never should: the fuzz looks), or threw while it
  // changed it: the page is shown anew from the crash buffer as it was written right before, nothing stored
  // over it, and the journal as it would have been kept then (`stash`), not of the page half changed.
  function bail() {
    try {
      keepDeparture(storage, map.slug, tab(), stash); // as the page was right before the pull, whose crash buffer the next page sends
    } catch {}
    reloading = true;
    refresh();
    close();
    reloadView(map.slug, null, notice());
  }

  // The texts committed, this load's and earlier ones', one of each block (sameText): what was committed
  // of a block before (`at`, when it was last committed: two tabs' pages are taken in no order of their
  // own) is where that text started, and what it was between (two of one block are no one question: the
  // server's answer would name neither); back as it was first, it is asked of what it was between. Joined
  // with one of this load's, it goes by that one's key and naming (decide lets this load's go by its key).
  const journal = () => {
    const now = commits.committed().map((entry) => ({ ...entry, time: Date.now() }));
    const own = new Set(now.map((entry) => entry.key));
    const texts = new Map();
    const when = (entry) => entry.at ?? entry.time ?? 0;
    for (const entry of [...carried, ...now].sort((a, b) => when(a) - when(b))) {
      const name = sameText(entry.block);
      const was = texts.get(name);
      if (!was) {
        texts.set(name, entry);
        continue;
      }
      const earlier = [...new Set([...(was.earlier ?? []), was.mine, entry.original, ...(entry.earlier ?? [])])].filter((text) => text !== entry.mine && text !== was.original).slice(-TEXTS_KEPT);
      const named = own.has(was.key) && !own.has(entry.key) ? { key: was.key, block: { ...was.block, before: entry.mine } } : {};
      const joined = { ...entry, ...named, original: was.original, earlier, time: Math.max(was.time ?? 0, entry.time ?? 0) || undefined };
      if (earlier.length === 0) delete joined.earlier;
      if (entry.mine === was.original && earlier.length === 0) texts.delete(name);
      else texts.set(name, joined);
    }
    return [...texts.values()];
  };

  // A commit of the page's that the file took deleted blocks (`request`'s removals, answered `receipt`): of
  // the blocks earlier pages made, those (and those made inside them) are the reader's own deletion, asked
  // of by no page any more: this one's, and those kept by pages of tabs gone that no page took yet.
  function deleted(request, receipt) {
    const ids = (request.units ?? []).filter((op) => op.remove && !(receipt.units ?? []).some((answer) => answer.key === op.key && answer.status === "conflict"))
      .flatMap((op) => [op.unit?.id, ...(op.items ?? []).map((item) => item?.id)]).filter((id) => typeof id === "string");
    if (ids.length === 0) return;
    const gone = madeWithin(ids, carriedMade.map(({ id, parent }) => ({ id, parent })));
    carriedMade = carriedMade.filter((entry) => !gone.has(entry.id));
    try {
      forgetMade(storage, map.slug, ids);
    } catch {}
  }

  // What the page committed (journal()), made (its blocks the file has, by their ids, with their words:
  // this load's and those of earlier loads it still shows or has not found the file with yet) and what
  // its components wrote (commits.written()), kept in the journal under this tab with the version of the
  // file it last knew (`known`, null when it does not), for the next page of the document, in this tab
  // or another, which takes them as its own, and asks of them at once if it opens on another version
  // (opened): when the page goes to show the file again, when it goes away (a reload of the reader's,
  // another document opened, the tab closed) and after a write the reader asked for (showOwn). `pending`:
  // commits not answered yet (on their way, or the crash buffer's, which the next page sends), whose
  // texts are taken as committed, the reader's own words (an undo back to what an earlier commit
  // replaced) being no one else's write.
  function keepJournal(pending = []) {
    try {
      keepDeparture(storage, map.slug, tab(), departure(pending));
    } catch {}
  }
  // What keepJournal keeps of the page now ({ known, time, entries }, or null for nothing).
  function departure(pending = []) {
    const time = Date.now();
    const made = new Map();
    for (const { key, id, parent, from, between, holds } of commits.placedUnits()) if (from === undefined && !reverts.has(`p${key}`)) made.set(id, { made: id, parent, text: commits.unitText(key), time, ...(between ? { between } : {}), ...(holds ? { holds } : {}) });
    for (const entry of carriedMade) {
      const unit = commits.unitOf(entry.id);
      if (made.has(entry.id) || (entry.confirmed && unit === null)) continue;
      made.set(entry.id, { made: entry.id, parent: entry.parent, text: (unit !== null && commits.unitText(unit)) || entry.text, time: entry.time ?? time, ...besideMade(entry.id, entry) });
    }
    const entries = [
      ...folded(journal(), pending.filter(Boolean)).map((entry) => ({ ...entry, time: entry.time ?? time })),
      ...commits.written().map(({ id, parts, time }) => ({ instance: id, parts, time })),
      ...made.values(),
    ];
    return entries.length > 0 ? { known: seen, time, entries } : null;
  }

  /**
   * The page opened and edits, the workbench told it is ready (`open`: the ids of the tabs that answered
   * they show the document now). What pages of tabs no longer open kept is taken too (the document
   * opened again in another tab), and where this page opened on another version of the file than an
   * earlier page last knew (someone else's write landing while no page was there to hear of it, or
   * between the last question of a page showing the file again and this page being served, which it
   * never hears of as a write), all it took is asked of at once (checkReverted): a text put back is a
   * card, a block made that the file no longer has is listed. On the very version, nothing is asked.
   * A page done with, or going to be shown again (it kept its journal already), takes nothing: the next
   * page does; one whose write (showOwn) failed takes it then.
   */
  let unopened = null; // opened()'s call while the page was to be shown again by showOwn: { open }
  function opened(open = null) {
    if (closed) return;
    if (reloading) return void (unopened = { open });
    if (open) {
      try {
        adopt(takeJournal(storage, map.slug, (id) => id !== tab() && !open.has(id)));
      } catch {}
      forgetOld(storage);
    }
    if (!asking) return;
    if (checking) recheck = true;
    else checkReverted().then((answered) => answered !== null && maybeReload()); // someone else's write heard meanwhile is shown once it is answered
  }

  /**
   * The reader decided on a text, block or component's write someone else put back: `mine` commits it
   * again over theirs, otherwise theirs stays. Once every one is decided, the page shows the file.
   */
  async function decide(key, mine) {
    const entry = reverts.get(key);
    if (!entry) return;
    if (entry.unit !== undefined) {
      // A block put back: kept (made again, or moved again where the page has it), or the file's. Parts a
      // component wrote: written again over the file's (its hashes of them), or the file's.
      if (entry.written) commits.rewrite(entry.unit, entry.written, mine);
      else commits.putBack(entry.unit, { gone: entry.gone, mine, within: entry.within });
      reverts.delete(key);
      storedFrom = null;
      if (mine) changed(true);
      store();
      refresh();
      if (reverts.size === 0) maybeReload();
      return true;
    }
    if (mine) {
      const texts = [{ key, block: { ...entry.block, before: entry.theirs }, parts: [{ keep: true, html: entry.mine }] }];
      const receipt = await send({ opening: map.version, known: null, texts, units: [], touch: [], request: randomRequestId() }).catch(() => null);
      generation++; // what the file holds of the page's changed: the revert check asks again
      if (!receipt?.ok || receipt.texts?.[0]?.status === "conflict") return false;
    }
    reverts.delete(key);
    storedFrom = null;
    carried = carried.filter((other) => sameText(other.block) !== sameText(entry.block));
    if (!mine) commits.unjournal(key);
    store();
    refresh();
    if (reverts.size === 0) maybeReload();
    return true;
  }

  /**
   * A write the reader asked for that changes the file (撤回 of the Agent's changes and its 撤销:
   * changes/): `run()` makes it, resolving with whether it did (the version it wrote, when known); then the page shows the file as after a
   * write of its own, at once, asking nothing of what it put back (the revert check: the reader asked
   * for it), and what is heard meanwhile shows nothing first. The caller saved what waited first
   * (flush) and made sure nothing waits for the reader. Resolves with whether the page goes.
   */
  let owning = false; // showOwn's write is on its way
  let missed = false; // and the live-reload channel spoke meanwhile
  async function showOwn(run) {
    if (closed || reloading) return false;
    reloading = owning = true;
    missed = false;
    clearTimeout(reloadTimer);
    let done = false;
    let wrote = null; // the version its write left, when run() says
    try {
      const result = await run();
      done = Boolean(result);
      if (typeof result === "string") wrote = result;
    } catch {}
    owning = false;
    if (closed) return done;
    if (!done) {
      reloading = false;
      resume(); // what the reader typed meanwhile
      refresh();
      if (unopened) {
        const { open } = unopened;
        unopened = null;
        opened(open);
      }
      if (missed) heard(null, true);
      else if (foreign) maybeReload();
      return false;
    }
    // With the pull on, the page takes its write in where it stands, as a write of its own (no question of
    // what it put back: the reader asked for it), and goes on; where the pull cannot (another write landed, more than
    // it can show in place), shown anew as before.
    if (pull && typeof wrote === "string" && !swapping && !trying) {
      reloading = false;
      own.push({ version: wrote, at: Date.now(), strict: true });
      foreign = true;
      checkedAbout = { generation, version: wrote };
      trying = true;
      try {
        await pullOnce();
      } catch {}
      trying = pulling = false;
      if (known === wrote && !swapping && !closed) { // took() armed a commit for what the reader typed meanwhile
        refresh();
        if (foreign) maybeReload();
        return "pulled";
      }
      if (closed) return true;
      reloading = true;
    }
    storage.remove(bufferKey());
    storage.remove(keptKey());
    storedFrom = null;
    // The page knew the file it asked to be written as; a write landing before the page shown again is
    // served is asked of there. Not told which version that is, or with a question of its own not answered
    // yet, the next page asks whatever it opens on.
    seen = asking ? null : wrote;
    keepJournal();
    refresh();
    reloadView(map.slug, null, null);
    return true;
  }

  /**
   * Show the file's words in place of what the reader gave up for them (用文件里的 on a card about words: commits
   * `discard`), once nothing waits: by a pull that shows those blocks as the file has them, or, where that
   * leaves any of them given up still (or cannot run), the page shown anew as before (reloadSoon).
   */
  let showing = false;
  function showFile() {
    if (!pull || swapping) return reloadSoon();
    showing = true;
    foreign = true;
    maybeReload();
  }

  /**
   * 用文件里的 on a card about words (`entry`: the card's conflict, `mine` the version it showed): what the reader
   * gives up is what the page holds of the block now, which they may have written on after that version was sent (in
   * it, or in a block split off it: Enter, the commit on its way). What the card did not show is listed (lostKey,
   * listed: 复制文字), as what a page could not put back is, never dropped without a word; the words are then the
   * file's (commits `discard`), shown in place (showFile), or, where a block split off it goes with them (given up
   * with them: a pull showing the file's words would leave it on the page), the page shown anew (reloadSoon).
   */
  function giveUp(entry) {
    const now = commits.textNow?.(entry.block) ?? null;
    const words = (html) => String(html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (now?.mine && !words(entry.mine).includes(words(now.mine)) && keepLost(storage, map.slug, [{ why: entry.reason === "changed" ? "changed" : "refused", html: now.mine }])) listed();
    commits.resolve(entry.key, "discard");
    if (now?.split) reloadSoon();
    else showFile();
  }

  /** Show the file as it is once nothing waits (the reader gave a change up for the file's, or what the page is made of changed). */
  function reloadSoon() {
    foreign = true;
    asked = true;
    maybeReload();
  }

  addEventListener("online", () => {
    retryAt = 0;
    if ((count > 0 || parked) && !flight) arm(Date.now());
  });
  addEventListener("pageshow", (event) => {
    if (event.persisted) leaving = false;
  });

  /**
   * The page is done with (it goes away for good, or a test lets it go): nothing more is committed,
   * stored, tried again or reloaded, and an answer still on its way is not taken in.
   */
  function close() {
    closed = true;
    clearTimeout(timer);
    clearTimeout(reloadTimer);
  }

  return {
    changed,
    flush,
    leave,
    opened,
    heard,
    store,
    decide,
    reloadSoon,
    showFile,
    showOwn,
    giveUp,
    close,
    get state() {
      return { waiting: waiting(), syncing: Boolean(flight), offline, stopped, foreign, reloading, held: commits.issues.size + reverts.size, drafts, unstored, pulling };
    },
  };
}

// A commit sent: the server's answer, or { ok: false, reason: "server" } when it failed or answered
// no JSON (a lost connection rejects: the caller reads that as offline).
async function postCommit(map, request, { keepalive = false } = {}) {
  const response = await postJson("/__gallery/edit/commit", map.token, { slug: map.slug, ...request, ...(AGENT_PAGE ? { agent: true } : {}) }, { keepalive });
  if (response.status >= 500) return { ok: false, reason: "server" };
  return response.json().catch(() => ({ ok: false, reason: "server" }));
}

// ---------- reloading where the reader was ----------


// What a tab keeps in storage, by kind: gallery-edit:<slug>:<kind>:<tab>.
const tabKey = (kind, slug, tab) => `gallery-edit:${slug}:${kind}:${tab}`;

/** Where a tab keeps what waits to be saved (the crash buffer). */
export const pendingKey = (slug, tab) => tabKey("pending", slug, tab);

/** Where it keeps, with a commit whose answer is not known, what the page knows and the page (createCommits' keep). */
export const stateKey = (slug, tab) => tabKey("state", slug, tab);
const PENDING_KEY = /^gallery-edit:([^:]+):pending:(.+)$/;
/** The state key of the tab a crash buffer's key (a pendingKey) belongs to. */
const stateKeyOf = (key) => {
  const [, slug, tab] = PENDING_KEY.exec(key);
  return stateKey(slug, tab);
};

/**
 * Where a page keeps what it could not put back into the file (recover): the reader's words, listed
 * until the reader says they are dealt with. [{ why, html | text, time }]
 */
export const lostKey = (slug) => `gallery-edit:${slug}:lost`;

/**
 * Where a page keeps the texts of the blocks a page it recovered showed (one with a commit whose
 * answer it never learned): the page that opens next lists those it does not show (checkLeft).
 */
const checkKey = (slug) => `gallery-edit:${slug}:check`;

function keepCheck(storage, slug, texts) {
  let list = [];
  try {
    list = JSON.parse(storage.get(checkKey(slug)) ?? "[]") ?? [];
  } catch {}
  return storage.set(checkKey(slug), JSON.stringify([...list, ...texts].slice(-2000))) !== false;
}

/**
 * Once recover() is done and the page shows the file: the texts a page it recovered showed that this
 * one does not (`shown`: its blocks' texts) are listed under lostKey, whatever the rebuilt commits
 * missed (a safety net: no word goes without a trace). Returns how many.
 */
export function checkLeft(storage, slug, shown) {
  let texts = [];
  try {
    texts = JSON.parse(storage.get(checkKey(slug)) ?? "[]") ?? [];
  } catch {}
  if (texts.length === 0) return 0;
  const words = (text) => String(text).replace(/\s+/g, " ").trim();
  // What the page shows, and what is listed already (a block not finished, kept as a draft).
  const listed = readLost(storage, slug).map((item) => item.text ?? String(item.html ?? "").replace(/<[^>]*>/g, ""));
  const here = words([...shown, ...listed].join("\n"));
  const missing = [...new Set(texts.map(words))].filter((text) => text && !here.includes(text));
  if (missing.length > 0 && !keepLost(storage, slug, missing.map((text) => ({ why: "rebase", text })))) return 0;
  storage.remove(checkKey(slug));
  return missing.length;
}

/** What lostKey holds. */
export function readLost(storage, slug) {
  try {
    const list = JSON.parse(storage.get(lostKey(slug)) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// Add to what lostKey holds (the newest 100); false when it could not be written.
function keepLost(storage, slug, items) {
  const time = Date.now();
  return storage.set(lostKey(slug), JSON.stringify([...readLost(storage, slug), ...items.map((item) => ({ ...item, time }))].slice(-100))) !== false;
}

/**
 * Where the pages of a document keep, as they go away, what they committed, made and wrote, for the
 * next page of it to ask of (createAutosave: keepJournal, opened), in localStorage: { v: 1, tabs: {
 * <tab>: { known, time, entries } } }, one departure a tab, `known` the version of the file that page
 * last knew (null: it did not), each entry with its `time`: a text ({ key, block, original, mine,
 * earlier?, at }, `at` when it was last committed), a block made ({ made, parent, text }; taken out of
 * every departure once a page's commit deletes it: forgetMade) or what a component wrote ({ instance, parts }).
 * Entries are kept for JOURNAL_FOR, the newest of them JOURNAL_SIZE characters at most.
 */
export const journalKey = (slug) => `gallery-edit:${slug}:journal`;
const JOURNAL_KEY = /^gallery-edit:(.+):journal$/;

// The departures the journal holds, by tab, their entries still asked of (none left: no departure).
function readJournal(storage, slug) {
  let record = null;
  try {
    record = JSON.parse(storage.get(journalKey(slug)) ?? "null");
  } catch {}
  const tabs = {};
  const now = Date.now();
  for (const [tab, departure] of Object.entries(record?.tabs && typeof record.tabs === "object" ? record.tabs : {})) {
    const entries = (Array.isArray(departure?.entries) ? departure.entries : []).filter((entry) => entry && typeof entry === "object" && now - entry.time < JOURNAL_FOR);
    if (entries.length > 0) tabs[tab] = { known: typeof departure.known === "string" ? departure.known : null, time: departure.time, entries };
  }
  return tabs;
}

// The journal written as `tabs`, the newest entries first as long as they fit (one too long left out),
// or taken away when nothing is left. A write that fails leaves it as it was: the crash buffer comes first.
function writeJournal(storage, slug, tabs) {
  const all = Object.entries(tabs).flatMap(([tab, departure]) => departure.entries.map((entry) => ({ tab, entry, size: JSON.stringify(entry).length })))
    .sort((a, b) => b.entry.time - a.entry.time);
  let room = JOURNAL_SIZE;
  const fits = new Set();
  for (const { entry, size } of all) {
    if (size > room) continue;
    room -= size;
    fits.add(entry);
  }
  const kept = {};
  for (const [tab, departure] of Object.entries(tabs)) {
    const entries = departure.entries.filter((entry) => fits.has(entry));
    if (entries.length > 0) kept[tab] = { ...departure, entries };
  }
  if (Object.keys(kept).length === 0) return void storage.remove(journalKey(slug));
  const text = JSON.stringify({ v: 1, tabs: kept });
  if (storage.get(journalKey(slug)) !== text) storage.set(journalKey(slug), text);
}

// The departures of the tabs `which` picks, taken out of the journal: [{ known, entries }].
function takeJournal(storage, slug, which) {
  const tabs = readJournal(storage, slug);
  const taken = Object.keys(tabs).filter(which);
  if (taken.length === 0) return [];
  const departures = taken.map((tab) => tabs[tab]);
  for (const tab of taken) delete tabs[tab];
  writeJournal(storage, slug, tabs);
  return departures;
}

// The ids of `ids` and of the blocks made (`made`: [{ id, parent }]) inside one of them, at any depth.
function madeWithin(ids, made) {
  const gone = new Set(ids);
  for (let more = true; more;) {
    more = false;
    for (const { id, parent } of made) {
      if (gone.has(id) || !gone.has(parent)) continue;
      gone.add(id);
      more = true;
    }
  }
  return gone;
}

// The blocks made that the reader deleted (`ids`, and those made inside them) taken out of every
// departure the journal holds.
function forgetMade(storage, slug, ids) {
  const tabs = readJournal(storage, slug);
  let changed = false;
  for (const departure of Object.values(tabs)) {
    const gone = madeWithin(ids, departure.entries.filter((entry) => typeof entry.made === "string").map(({ made, parent }) => ({ id: made, parent })));
    const entries = departure.entries.filter((entry) => typeof entry.made !== "string" || !gone.has(entry.made));
    if (entries.length === departure.entries.length) continue;
    departure.entries = entries;
    changed = true;
  }
  if (changed) writeJournal(storage, slug, tabs);
}

// This tab's departure written (null: none), beside the other tabs'.
function keepDeparture(storage, slug, tab, departure) {
  const tabs = readJournal(storage, slug);
  if (departure) tabs[tab] = departure;
  else if (tabs[tab]) delete tabs[tab];
  else if (storage.get(journalKey(slug)) === null) return;
  writeJournal(storage, slug, tabs);
}

// What a Gallery before 2026-11-08 kept for the next load in the tab (sessionStorage, under the same
// key): its entries, or { asked, entries }, read once as this tab's departure, the version it last knew
// that `asked` (none of "own" or nothing: not known).
function legacyJournal(session, slug) {
  if (!session) return [];
  let stored = null;
  try {
    stored = JSON.parse(session.get(journalKey(slug)) ?? "null");
  } catch {}
  session.remove(journalKey(slug));
  const entries = (Array.isArray(stored) ? stored : Array.isArray(stored?.entries) ? stored.entries : []).filter((entry) => entry && typeof entry === "object" && Date.now() - entry.time < JOURNAL_FOR);
  const known = !Array.isArray(stored) && typeof stored?.asked === "string" && stored.asked !== "own" ? stored.asked : null;
  return entries.length > 0 ? [{ known, entries }] : [];
}

// The journals of documents whose every entry is older than JOURNAL_FOR, taken away (a document not
// opened again within the hour leaves none behind).
function forgetOld(storage) {
  for (const key of storage.keys?.() ?? []) {
    const slug = JOURNAL_KEY.exec(key)?.[1];
    if (slug && Object.keys(readJournal(storage, slug)).length === 0) storage.remove(key);
  }
}

/**
 * Reload the page to show the file as it is now, keeping where the reader was (`view`, or now):
 * the scroll position, the block the caret was in (by its data-block-id) with the caret's offset in
 * its text and what the editor keeps besides (keepWith); `notice` is said once the page is back.
 */
export function reloadView(slug, view = null, notice = null) {
  keep(slug, { ...(view ?? viewNow()), notice });
}

/** Where the reader is now, as reloadView keeps it: { x, y, top, unit, self, offset, and what keepWith gives }. */
export function viewNow() {
  const selection = getSelection();
  const anchor = selection.rangeCount ? selection.anchorNode : null;
  const host = (anchor?.nodeType === 1 ? anchor : anchor?.parentElement)?.closest?.("[contenteditable='true']") ?? null; // an empty block's caret stands in the block itself
  const unit = host?.closest("[data-block-id]");
  let offset = null;
  if (host && unit) {
    const head = document.createRange();
    head.setStart(host, 0);
    head.setEnd(selection.anchorNode, selection.anchorOffset);
    offset = head.toString().length;
  }
  // The element at the window's top too (reading-place.mjs placeIn): the page shown again puts it where it
  // stood, so what an Agent added above moves nothing the reader sees (restoreView); the scroll position
  // where it is gone.
  return { x: scrollX, y: scrollY, top: typeof window === "object" ? placeIn(window).top : null, unit: unit?.getAttribute("data-block-id") ?? null, self: unit === host, offset, ...kept() };
}

let kept = () => ({});
/** What a page shown again takes over besides where the reader was: `read()`, its fields (the detail cards open). */
export function keepWith(read) {
  kept = read;
}

let reloader = () => location.reload();
/**
 * How the page is shown again: by default it reloads; in a workbench, the workbench loads the
 * report out of sight and puts it in this page's place once it is drawn (editor.mjs, session.mjs).
 */
export function setReloader(reload) {
  reloader = reload;
}

function keep(slug, view) {
  keepView(slug, view); // shared/kept-view.mjs: the next page of the document in this tab takes it
  reloader();
}

/** Where the reader was before reloadView: { x, y, unit, self, offset, notice, and what keepWith gave } once, or null (shared/kept-view.mjs). */
export { takeView } from "../../shared/kept-view.mjs";

// ---------- recovering what a page left ----------

const partsHTML = (text) => (text?.parts ?? []).map((part) => part.html).filter(Boolean).join("\n");
// A commit sent again is answered once it is known to have gone in or not: not when the server
// could not be reached, was busy or failed (tried again by the next page). A request it can never
// take (`body`) is answered too: what it carried is listed for the reader.
const answered = (receipt) => receipt.ok || receipt.reason === "body";
// Whether the file gave up something of a commit for its package's manifest having changed: nothing
// for the reader to decide, and nothing to list (a page goes by the manifest there is now).
const outdatedIn = (receipt) => Boolean(receipt?.units?.some((answer) => answer.status === "conflict" && answer.reason === "definition"));
// A node as compared between two commits (their keys differ).
const shape = (node) => JSON.stringify(node, (name, value) => (name === "key" ? undefined : value));

// What of `request` the file did not take (answered `receipt`): the reader's words, to list.
function refusedOf(request, receipt) {
  if (!receipt.ok) {
    return [...(request.texts ?? []).map((text) => ({ why: "refused", html: partsHTML(text) })), ...(request.units ?? []).map((op) => ({ why: "refused", html: op.insert ? nodeHTML(op.insert) : writtenHTML(op) }))]
      .filter((item) => item.html);
  }
  const texts = new Map((request.texts ?? []).map((text) => [text.key, text]));
  const ops = new Map((request.units ?? []).map((op) => [op.key, op]));
  const out = [];
  for (const answer of receipt.texts ?? []) {
    const html = answer.status === "conflict" ? partsHTML(texts.get(answer.key)) : "";
    if (html) out.push({ why: answer.reason === "missing" ? "missing" : "changed", html });
  }
  for (const answer of receipt.units ?? []) {
    // What a manifest that changed refused is given up (outdatedIn), nothing the reader keeps.
    const op = answer.status === "conflict" && answer.reason !== "definition" ? ops.get(answer.key) : null;
    // A block made on the page, one turned into another type (its text goes with the conversion), or what a component wrote.
    const html = op?.insert ? nodeHTML(op.insert) : writtenHTML(op) ?? "";
    if (html) out.push({ why: op.insert ? "insert" : answer.reason === "missing" ? "missing" : "changed", html, ...writtenIn(op?.unit?.id ?? op?.unit?.blockId, op?.source) });
  }
  return out;
}

// Of a component's write the file did not take, the block it was written in (its id) and the parts it
// wrote (`parts`, by name), for the reader to copy as that block holding them (editor.mjs showLost).
const writtenIn = (unit, parts) => (typeof unit === "string" && parts && typeof parts === "object" ? { unit, parts } : {});

/**
 * The commit a page left built from the same start as one whose answer it never learned (`sent`,
 * sent again first and answered `answer`), made to go on from what that one wrote. A text both
 * carry starts from what the file took of it. A block `sent` made (a split-off part, a block made
 * on the page, the blocks in it) is not made again: it is in the file, by the id the answer gives,
 * and what the page did to it since goes as done to that block: its text as an edit of what `sent`
 * wrote, a move as a move. Blocks added into or taken out of one it made, or its blocks put in
 * another order, have no start the file knows: what it holds is listed for the reader instead.
 * Returns { request (null: nothing left), dropped }.
 */
function rebase(request, sent, answer) {
  if (!request || !sent || !answer?.ok) return { request, dropped: [] };
  const answers = new Map([...(answer.texts ?? []), ...(answer.units ?? [])].map((entry) => [entry.key, entry]));
  const took = (key) => answers.get(key) && answers.get(key).status !== "conflict";
  const fileId = (key, proposed) => answer.made?.[key] ?? proposed;
  // Proposed id -> { id (the file's), node (as `sent` carried it), place (of an insert, as sent) }.
  const made = new Map();
  const note = (node) => {
    if (node?.blockId) made.set(node.blockId, { id: fileId(node.key, node.blockId), node });
    node?.children?.forEach(note);
  };
  for (const text of sent.texts ?? []) {
    if (!took(text.key)) continue;
    for (const part of text.parts ?? []) if (!part.keep && part.blockId) made.set(part.blockId, { id: fileId(part.key, part.blockId), node: { html: part.html } });
  }
  for (const op of sent.units ?? []) {
    if (!op.insert || !took(op.key)) continue;
    note(op.insert);
    if (op.insert.blockId) made.get(op.insert.blockId).place = shape(op.place);
  }
  const dropped = [];
  const extra = []; // edits of blocks `sent` made
  let serial = 0;
  const ref = (id) => ({ key: `r${serial++}`, id });
  // The text of a block `sent` made, as an edit of what it wrote.
  const edit = (entry, html) => {
    if (html !== undefined && html !== entry.node.html) extra.push({ key: `r${serial++}`, block: { unit: ref(entry.id), self: true, before: entry.node.html ?? "" }, parts: [{ keep: true, html }] });
  };
  // A block made on the page as this commit carries it, against what `sent` made of it: its text and
  // its blocks' texts as edits; false when its blocks differ (added, taken out, in another order).
  const follow = (node, entry) => {
    const now = (node.children ?? []).map((child) => child.blockId ?? null);
    const then = (entry.node.children ?? []).map((child) => child.blockId ?? null);
    if (now.join() !== then.join() || now.some((id) => id === null || !made.has(id))) return false;
    if (node.title !== entry.node.title) return false;
    edit(entry, node.html);
    return (node.children ?? []).every((child) => follow(child, made.get(child.blockId)));
  };

  const before = new Map((sent.texts ?? []).filter((text) => took(text.key)).map((text) => [text.key, text]));
  const texts = [];
  for (const text of request.texts ?? []) {
    const parts = (text.parts ?? []).filter((part) => {
      if (part.keep || !made.has(part.blockId)) return true;
      edit(made.get(part.blockId), part.html);
      return false;
    });
    const earlier = before.get(text.key);
    if (!earlier) {
      texts.push({ ...text, parts });
      continue;
    }
    const sentHTML = earlier.parts.find((part) => part.keep)?.html;
    const mine = parts.find((part) => part.keep)?.html;
    if (parts.length === 1 && mine !== undefined && mine === sentHTML) continue; // nothing since
    const entry = answers.get(text.key);
    const start = entry.status === "merged" ? entry.html : sentHTML;
    // What 保留我的 wrote from (`from`) went in with `sent`: this goes on from what that wrote.
    const { from: _, ...block } = text.block;
    texts.push({ ...text, parts, block: { ...block, before: start ?? text.block.before } });
  }
  const units = [];
  for (const op of request.units ?? []) {
    const entry = op.insert?.blockId ? made.get(op.insert.blockId) : null;
    if (!entry) {
      units.push(op);
      continue;
    }
    if (!follow(op.insert, entry)) {
      dropped.push({ why: "rebase", html: nodeHTML(op.insert) });
      continue;
    }
    if (entry.place !== undefined && shape(op.place) !== entry.place) units.push({ key: op.key, unit: ref(entry.id), move: op.place });
  }
  texts.push(...extra);
  // The units both name, as `sent` left them (as a page takes in an answer): the ids the file gave
  // them and their hashes now, so what this one does to them is not taken for a change of someone
  // else's (a unit's numbers in the page's map are its key in both).
  const known = (ref) => {
    if (!ref || typeof ref !== "object") return;
    if (typeof ref.key === "number") {
      const id = answer.ids?.[ref.key];
      const hash = answer.hashes?.[ref.key];
      if (id) ref.id = id;
      if (hash) ref.hash = hash;
    }
    for (const value of Object.values(ref)) if (value && typeof value === "object") known(value);
  };
  const ops = structuredClone(units);
  const edited = structuredClone(texts);
  ops.forEach(known);
  edited.forEach(known);
  for (const op of ops) if (typeof op.hash === "string" && answer.hashes?.[op.unit?.key]) op.hash = answer.hashes[op.unit.key];
  texts.splice(0, texts.length, ...edited);
  units.splice(0, units.length, ...ops);
  // Changed, it is another commit: an id of its own, the same each time it is made from this one.
  const changed = JSON.stringify([texts, units]) !== JSON.stringify([request.texts ?? [], request.units ?? []]);
  const next = texts.length + units.length > 0 ? { ...request, texts, units, ...(changed && request.request ? { request: `${request.request.slice(0, 38)}r` } : {}) } : null;
  return { request: next, dropped };
}

/**
 * A page that went away with a commit whose answer it never learned (`answer`, now known), taken
 * up: what it knew and the page as it was (`bundle`, stateKey) in a document of their own
 * (`parse`), with that answer taken in. { commits, alone }, or null when it cannot be (the bundle
 * unreadable).
 */
function rehydrate(bundle, answer, parse) {
  try {
    const { document, value } = unpack(bundle, parse);
    let layout = value.layout;
    const commits = createCommits({ root: document, map: value.map, baselines: value.baselines, getLayout: () => layout, setLayout: (next) => (layout = next), restore: value });
    const alone = !bundle.foreign && !answer.foreign;
    commits.apply(value.pending, answer, { alone });
    return { commits, alone };
  } catch {
    return null;
  }
}

// What the file did not take of what a page taken up sent (its commits' issues): the reader's words, to list.
const heldOf = (commits) => [...commits.issues.values()].filter((issue) => issue.mine)
  .map((issue) => ({ why: issue.kind === "insert" ? "insert" : issue.reason === "missing" ? "missing" : "changed", html: issue.mine, ...writtenIn(issue.kind === "unit" ? commits.fileId(issue.unit) : null, issue.change?.source) }));

/**
 * Send what closed or crashed pages of this report left in the crash buffer under `keys`
 * (pendingKey: this tab's own after a reload, those of tabs that are gone), oldest first: a commit
 * whose answer never came first, as it was, then the rest of what waited. What the file does not
 * take, and the texts no commit carried, go to lostKey before the buffer goes; a buffer whose
 * commits are not answered (the server unreachable, busy) stays for the next page. Resolves with
 * { sent: whether the file changed, lost: how many texts were listed, offline: the server could
 * not be reached, left: a buffer stays for a later page (the server busy or failing, the list not
 * written), outdated: what a component wrote was given up, its package's manifest having changed }.
 */
export async function recover({ map, storage, keys, parse = (html) => new DOMParser().parseFromString(html, "text/html") }) {
  keys = keys.filter((key) => PENDING_KEY.test(key) && storage.get(key) !== null);
  if (keys.length === 0) return { sent: false, lost: 0, offline: false };
  const entries = keys.map((key) => {
    const raw = storage.get(key) ?? "";
    try {
      const entry = JSON.parse(raw);
      if (entry?.v === 2) return { key, time: entry.time, sent: entry.sent ?? null, request: entry.request ?? null, keep: Array.isArray(entry.keep) ? entry.keep : [], page: Array.isArray(entry.page) ? entry.page : [] };
    } catch {}
    return { key, time: 0, unreadable: raw };
  }).sort((a, b) => a.time - b.time);
  const send = (request) => postCommit(map, request);
  let sent = false;
  let lost = 0;
  let outdated = false;
  for (const entry of entries) {
    const found = entry.unreadable ? [{ why: "unreadable", text: entry.unreadable.slice(0, 20000) }] : [];
    if (!entry.unreadable) {
      try {
        let answer = null;
        if (entry.sent) {
          answer = await send(entry.sent);
          if (!answered(answer)) return { sent, lost, offline: false, left: true }; // kept for the next page
          if (answer.ok && answer.version !== map.version) sent = true;
          outdated ||= outdatedIn(answer);
        }
        // What followed it: when the page went with what it knew, the page is taken up and goes on as
        // it would have, commit after commit until nothing is left (one may wait for another: an
        // item's conversion for its lists to go), each kept in the buffer, with what the page knows
        // then, before it goes (a page that cannot send it sends that very one); what the file did
        // not take in the end is listed. Otherwise the rest is rebuilt on the answer (rebase).
        let bundle = null;
        try {
          bundle = answer?.ok ? JSON.parse(storage.get(stateKeyOf(entry.key)) ?? "null") : null;
        } catch {}
        const taken = bundle && entry.sent && bundle.sent === entry.sent.request ? rehydrate(bundle, answer, parse) : null;
        if (!taken && entry.sent) found.push(...refusedOf(entry.sent, answer));
        let request = null;
        if (taken) {
          for (let round = 0; round < 8; round++) {
            let built = null;
            try {
              built = taken.commits.build({ held: round === 0 }); // what was held for the reader goes once more
            } catch {}
            if (!built) break;
            const next = { ...built.request, known: null, request: randomRequestId() };
            let state = null;
            try {
              state = JSON.stringify({ sent: next.request, foreign: !taken.alone, ...taken.commits.keep(built.pending) });
            } catch {}
            if (storage.set(entry.key, JSON.stringify({ v: 2, time: entry.time, sent: next, request: null, keep: entry.keep, page: entry.page })) === false) return { sent, lost, offline: false, left: true };
            if (!state || storage.set(stateKeyOf(entry.key), state) === false) storage.remove(stateKeyOf(entry.key));
            const reply = await send(next);
            if (!answered(reply)) return { sent, lost, offline: false, left: true };
            if (reply.ok && reply.version !== map.version) sent = true;
            outdated ||= outdatedIn(reply);
            if (!reply.ok) {
              found.push(...refusedOf(next, reply));
              break;
            }
            taken.commits.apply(built.pending, reply, { alone: taken.alone && !reply.foreign });
          }
          found.push(...heldOf(taken.commits));
          storage.remove(stateKeyOf(entry.key));
        } else {
          const rebased = rebase(entry.request, entry.sent, answer);
          request = rebased.request;
          found.push(...rebased.dropped);
        }
        if (request) {
          const second = await send(request);
          if (!answered(second)) return { sent, lost, offline: false, left: true };
          if (second.ok && second.version !== map.version) sent = true;
          outdated ||= outdatedIn(second);
          found.push(...refusedOf(request, second));
        }
      } catch {
        return { sent, lost, offline: true }; // kept for the next page
      }
      found.push(...entry.keep.filter((item) => item?.html || item?.text));
    }
    if (found.length > 0 && !keepLost(storage, map.slug, found)) return { sent, lost, offline: false, left: true }; // the buffer stays
    if (entry.page?.length > 0 && !keepCheck(storage, map.slug, entry.page)) return { sent, lost, offline: false, left: true };
    lost += found.length;
    storage.remove(entry.key);
    storage.remove(stateKeyOf(entry.key));
  }
  return { sent, lost, offline: false, outdated };
}
