import { postAnswer } from "../post.mjs";

// What a custom page's board editing sends the page service (POST /__gallery/pages/<slug>/cards:
// src/editor/page-service.mjs), one task at a time, in the order asked. A task is the whole of what the
// page does for one gesture or one step of undo: what it sends, built only once its turn comes, and what
// it does with the answer (each card's cells and base taken in, the undo step pushed or moved), all done
// before the next task starts. So a write sent while one before it waits for its answer goes with the
// bases that answer gave (a block's two context.edit calls in a row, two quick Ctrl+Z on one card, a
// Ctrl+Z pressed before a drop is answered, which undoes the drop), never with those it had when it was
// asked, which the service would refuse as changed. It knows which versions of the page are its own (the
// one it was served at, and each its ops wrote), so that the live script's "page <version>" of its own
// write changes nothing, and it says when an answer was applied to a version that is none of them:
// someone else wrote the page meanwhile (`others`), which the page then shows again.

/**
 * slug, token, version: the page map's. others(): someone else wrote the page (an op's answer was
 * applied to another version than the page's). Returns { run(task) (task(send) run once every task asked
 * before it is done, `send(body)` giving the service's answer: { ok, … }, its refusal, or { ok: false,
 * reason: "offline" } where it cannot be reached; resolves with what the task gives), ours(version), busy,
 * idle() (a promise of the tasks asked so far being done) }.
 */
export function createClient({ slug, token, version, others = () => {} }) {
  const route = `/__gallery/pages/${slug}/cards`;
  const ours = new Set([version]);
  let current = version;
  let waiting = 0;
  let chain = Promise.resolve();
  const send = async (body) => {
    const answer = await postAnswer(route, token, body);
    if (answer?.ok) {
      const before = answer.before;
      ours.add(answer.version);
      if (before !== current && !ours.has(before)) others();
      current = answer.version;
    }
    return answer;
  };
  const run = (task) => {
    waiting++;
    const done = chain.then(() => task(send)).finally(() => {
      waiting--;
    });
    chain = done.catch(() => {}); // a task that threw is its asker's to hear of; the next goes on
    return done;
  };
  return {
    run,
    /** Whether `version` is the page's own: served at it, or written to it by an op. */
    ours: (version) => ours.has(version),
    /** Whether a task is asked and not yet done (sent, answered and taken in). */
    get busy() {
      return waiting > 0;
    },
    /** Once every task asked so far is done. */
    idle: () => chain,
  };
}
