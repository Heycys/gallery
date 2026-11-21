// Telling a report's pages of a change of its file (docs/render.md, "Live preview"): once the
// preview takes the file (editor/settle.mjs), never while it is half written (an Agent between two
// edits of one change: its pages keep what they show), and once it has not changed for a moment (an
// Agent's next edit usually follows within it), or at once when the edit service wrote it (a commit,
// a hand-in). Each change asks again, and so does the end of the wait it was given. A change that
// comes while an earlier one is looked at is looked at in its own time: the earlier look, done with
// what it read, leaves it be (it neither tells nor puts the newer look off). A file held is looked at
// again every RECHECK at least, so a change no event said (a watcher that missed one) is found soon.

export const RECHECK = 1000;

/**
 * announce(slug): a report's file changed. `settled(slug)` says where its file stands ({ source,
 * held, wait }: the edit service's), `tell(slug, state)` tells its pages, `delay` (ms) is how long
 * a change waits for the next one before it is looked at, `recheck` as RECHECK.
 */
export function createAnnouncer({ settled, tell, delay = 120, recheck = RECHECK }) {
  const timers = new Map(); // slug -> the timer of its next look
  const announce = (slug, after = delay) => {
    clearTimeout(timers.get(slug));
    const timer = setTimeout(async () => {
      const state = await settled(slug).catch(() => ({ source: null, held: false, wait: 0 }));
      if (timers.get(slug) !== timer) return; // a newer change came meanwhile: its look says
      if (state.held) return announce(slug, Math.min(Math.max(state.wait, 50), recheck));
      if (state.wait > 0) return announce(slug, state.wait);
      await tell(slug, state);
    }, after);
    timers.set(slug, timer);
  };
  return announce;
}
