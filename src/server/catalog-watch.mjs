import { existsSync } from "node:fs";
import { HOLD, LIMIT, QUIET } from "../editor/settle.mjs";
import { catalogStamp, currentCatalog, keepCatalog, readCatalog } from "../shared/component-catalog.mjs";

// What a change under components/ is to the server (docs/render.md, "The catalog of component
// packages"): the catalog read anew, and taken in place of the one in use (keepCatalog) once what the
// disk says has stood still, when its pages are told. The disk is what is looked at, never the events:
// a stamp that has not changed ends a look whatever was heard, so a touch tells nothing, and an event
// only brings the next look nearer, never puts it off, as the watcher of a folder that was removed can
// fire without end on Windows (./watch.mjs) and a look put off by each would never come.
//
// An Agent writes a package file by file, as it does a document (editor/settle.mjs, whose times these
// are): a change is taken once the disk has not changed for QUIET, and a package that loaded and now
// reads as broken, a manifest half written or taken away with its folder standing, is held: the
// catalog in use keeps it as it was, its instances running, until the disk has not changed for HOLD
// or it has been so for LIMIT, when it is its author's. A package whose folder is gone is gone once
// the disk is quiet: no half-written file says it comes back. What gallery.json says of the components
// is read with the rest, a file edited by hand heard as a package's is, and what the server wrote of
// it is taken at once (`taken`): a package turned off is no package half written, and is never held.
// A gallery.json that does not read holds what it said last for as long as it stays so: nothing has
// said otherwise, and the switches of a package are no one's to throw by a slip of the hand.

/** How long after a change under components/ is heard the disk is first looked at, in ms. */
export const FIRST_LOOK = 120;

// The ids that are something else in `next` than in `before`, sorted.
function changedIds(before, next) {
  const stamps = ({ packages, problems }) => new Map([...packages, ...problems].map(([id, { stamp }]) => [id, stamp]));
  const [was, is] = [stamps(before), stamps(next)];
  return [...new Set([...was.keys(), ...is.keys()])].filter((id) => was.get(id) !== is.get(id)).sort();
}

/**
 * changed(): something changed under `root`'s components/. `tell(catalog, ids)`: its pages are told of
 * the catalog taken and of the packages that changed with it. taken(): gallery.json was written here,
 * and what it says is in use by the time this returns. `delay` (ms) until the first look; `quiet`,
 * `hold`, `limit` as QUIET, HOLD and LIMIT; `now`: the clock, and `timers` ({ set(run, ms), clear(timer) }, the
 * global setTimeout and clearTimeout): a test's own clock and its timers fired by hand, with which no load of the
 * machine changes when a look comes. close() ends it.
 */
export function createCatalogWatch({ root, tell, delay = FIRST_LOOK, quiet = QUIET, hold = HOLD, limit = LIMIT, now = Date.now, timers = { set: (run, ms) => setTimeout(run, ms), clear: (timer) => clearTimeout(timer) } }) {
  let timer = null;
  let due = 0; // when the next look is
  let seen = null; // { stamp, at }: what the disk said at the last look, and since when
  const held = new Map(); // id -> since when it has read as broken
  currentCatalog(root); // read as the server starts: what a change is one to
  const lookIn = (wait) => {
    if (timer && due <= now() + wait) return;
    timers.clear(timer);
    due = now() + wait;
    timer = timers.set(look, wait);
    timer.unref?.();
  };
  function look({ settled = false } = {}) {
    timer = null;
    const kept = currentCatalog(root);
    const read = readCatalog(root, kept.settings);
    const at = now();
    if (read.stamp !== seen?.stamp) seen = { stamp: read.stamp, at };
    const still = at - seen.at;
    if (still < quiet && !settled) return lookIn(quiet - still);
    const packages = new Map(read.packages);
    const problems = new Map(read.problems);
    let left = Infinity;
    for (const [id, loaded] of kept.packages) {
      const broken = !read.settings.disabled.includes(id) && (problems.has(id) || (!packages.has(id) && existsSync(loaded.folder)));
      if (!broken) {
        held.delete(id);
        continue;
      }
      if (!held.has(id)) held.set(id, seen.at);
      const wait = Math.min(hold - still, limit - (at - held.get(id)));
      if (wait <= 0) {
        held.delete(id);
        continue;
      }
      packages.set(id, loaded);
      problems.delete(id);
      left = Math.min(left, wait);
    }
    const { settings, packs } = read;
    const stamp = catalogStamp({ packages, problems, settings, packs });
    if (stamp !== kept.stamp) {
      const catalog = { packages, problems, settings, packs, stamp };
      keepCatalog(root, catalog);
      tell(catalog, changedIds(kept, catalog));
    }
    if (left !== Infinity) lookIn(left);
  }
  return {
    changed: () => lookIn(delay),
    taken() {
      timers.clear(timer);
      look({ settled: true });
    },
    close() {
      timers.clear(timer);
      timer = null;
    },
  };
}
