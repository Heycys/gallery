import { halfWritten } from "./source/whole.mjs";
import { hashOf } from "./source/html.mjs";

// When the preview takes a report's file (docs/editor.md, "Writing"): an Agent changes a structure
// in several edits, and the file between them is half written (source/whole.mjs). Such a file is
// held: its pages are not told of it (they keep what they show), no commit is applied to it and no
// page is served it while it is held (each waits a while for it: WAIT; a page's load is then served
// what the preview last took). It is taken once it is whole again, or once it has not been written
// for HOLD (an Agent's next edit of the change comes sooner, however slow its change) or has been
// held for LIMIT from the write that made it so (a file that stays so is its author's, odd as it is:
// the checks speak of it), and then what made it odd holds it no more, so that a sign of a new
// half-written change still does (a sign is told from another of its kind by its tag as written).
// Its pages are told of a write once the file is taken and has not changed for QUIET (an Agent's
// next edit usually follows within it), or at once when the write was the edit service's own (a
// commit's, an export's hand-in: whole, and nothing follows it).

export const HOLD = 30000; // a half-written file is held until it has not been written for this long
export const LIMIT = 120000; // and at most this long after the write that made it so
export const QUIET = 1500; // a file is told its pages once it has not changed for this long
export const WAIT = 10000; // a commit, a page's load or the revert check waits at most this long for a held file

// The signs as counts by what they are and their tag (their lines move as the file changes around them).
const counted = (signs) => signs.reduce((counts, { key, tag }) => counts.set(`${key}\n${tag}`, (counts.get(`${key}\n${tag}`) ?? 0) + 1), new Map());

/**
 * The state of each report's file as the preview takes it. `now`: the clock; `hold`, `limit`,
 * `quiet`: as HOLD, LIMIT and QUIET. judge(slug, { source, mtime }) says where a file read now
 * stands: { held, signs (what holds it), wait (ms: until it may be taken, or its pages told of it),
 * own (the service's own write), taken (held: the text last taken of it, which its pages show;
 * undefined when none was) }; wrote(slug, text): the service wrote that text.
 */
export function createSettle({ now = Date.now, hold = HOLD, limit = LIMIT, quiet = QUIET } = {}) {
  const held = new Map(); // slug -> when the write that made it half written was made
  const accepted = new Map(); // slug -> the signs of the file last taken (counts): they hold it no more
  const last = new Map(); // slug -> the text of the file last taken
  const own = new Map(); // slug -> the hash of what the service last wrote
  const known = new Map(); // slug -> { hash, signs }: the file last judged, not parsed again

  return {
    wrote(slug, text) {
      own.set(slug, hashOf(text));
    },
    judge(slug, { source, mtime }) {
      if (source === null) {
        held.delete(slug);
        last.delete(slug);
        return { held: false, signs: [], wait: 0, own: false };
      }
      const hash = hashOf(source);
      let signs = known.get(slug)?.hash === hash ? known.get(slug).signs : null;
      if (!signs) {
        signs = halfWritten(source);
        known.set(slug, { hash, signs });
      }
      const at = now();
      const taken = (wait, mine = false) => {
        held.delete(slug);
        accepted.set(slug, counted(signs));
        last.set(slug, source);
        return { held: false, signs: [], wait, own: mine };
      };
      if (own.get(slug) === hash) return taken(0, true);
      const before = accepted.get(slug) ?? new Map();
      const counts = counted(signs);
      const fresh = [...counts].some(([sign, count]) => count > (before.get(sign) ?? 0));
      if (fresh) {
        const written = Math.min(mtime, at); // its last write
        const since = held.get(slug) ?? written;
        held.set(slug, since);
        const wait = Math.min(hold - (at - written), limit - (at - since));
        if (wait > 0) {
          const holding = signs.filter(({ key, tag }) => counts.get(`${key}\n${tag}`) > (before.get(`${key}\n${tag}`) ?? 0));
          return { held: true, signs: holding, wait, own: false, taken: last.get(slug) };
        }
      }
      return taken(Math.min(quiet, Math.max(0, quiet - (at - mtime))));
    },
  };
}
