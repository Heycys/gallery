import { ALIVE_FOR, cleanReport, saveOf } from "../shared/presence.mjs";

// What the server knows of what the reader has open (gallery status, shared/presence.mjs): one record for each workbench
// tab that reported lately, kept in memory only (a server that stops forgets them; the tabs report again within 20 s). A
// tab's record goes when the tab says it closed (`gone`) and when it has not reported for ALIVE_FOR (a browser that crashed,
// a computer that slept). Reported by POST /__gallery/workspace/presence (checked as any change: Host, Origin, the token),
// read by GET /__gallery/workspace/status (Host and the token); one store for every workspace the server hosts.

/** The entries `describeTab` is given, most recently used first: { tab, entry, kind, title, visible, focused, flags, notes, caret, selection, used, seen }. */
export function createPresence({ now = Date.now, aliveFor = ALIVE_FOR } = {}) {
  const tabs = new Map(); // tab -> its last report, with `used` (when the reader last did something there) and `seen` (when it last reported)

  const expire = () => {
    for (const [tab, record] of tabs) if (now() - record.seen > aliveFor) tabs.delete(tab);
  };

  return {
    /** Take a report (the request's body): { ok: true }, or { ok: false } when it is none. */
    report(body) {
      const report = cleanReport(body);
      if (!report) return { ok: false };
      if (report.gone) {
        tabs.delete(report.tab);
        return { ok: true };
      }
      const known = tabs.get(report.tab);
      // What the reader did lately: a report with something to say (`touched`), a tab opening, a tab showing another document.
      const used = !known || report.touched || known.entry !== report.entry ? now() : known.used;
      tabs.set(report.tab, { ...report, used, seen: now() });
      expire();
      return { ok: true };
    },
    /** The tabs that reported lately, the one the reader used last first (the oldest report of a tie last). */
    list() {
      expire();
      return [...tabs.values()].sort((a, b) => b.used - a.used || b.seen - a.seen);
    },
    /** Forget every tab (the server's tests; a server that is shutting down). */
    clear: () => tabs.clear(),
    /** The time (ms). */
    now,
  };
}

/**
 * A record as gallery status gives it: the fields of the entry open (`facts`: { file, workspace } the server found for it),
 * the save state as one word, how long ago the reader last did something there, in seconds.
 */
export function describeTab(record, facts, at) {
  return {
    tab: record.tab,
    kind: record.kind,
    slug: record.entry.replace(/^@/, ""),
    title: record.title,
    file: facts.file ?? null,
    workspace: facts.workspace ?? null,
    visible: record.visible,
    focused: record.focused,
    idle: Math.max(0, Math.round((at - record.used) / 1000)),
    save: saveOf(record.flags),
    conflicts: record.flags.conflicts,
    notes: record.notes,
    caret: record.caret,
    selection: record.selection,
  };
}
