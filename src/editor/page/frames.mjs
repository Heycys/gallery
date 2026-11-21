import { audit, note, provide, report } from "./overlays.mjs";

// The editor's one animation-frame loop (docs/editor.md, "Overlays"). What the editor draws over the
// page follows it through tasks of this loop, never through loops of their own: the block tools
// (fills, the handle, a drag), the dashed frame of the text being edited, a box selection scrolling
// the page. One frame is requested at a time, however often tasks ask, from inside the loop too. A
// task runs on the next frame after wake(), and what its run() returns says when it runs again:
// true, on the next frame (a gesture under way: a drag, a box selection scrolling the page by the
// window's edge); FOLLOW, when something may have moved what it drew over (it stands over blocks: the
// handle, the fills, the frame of the text being edited, the flags); anything else, at its next
// wake(). One that throws takes down what it draws (fail()), the error is said (overlays.mjs report:
// not on every frame), and it waits for the next wake(): no stale picture stays. After the tasks,
// the overlays are audited (overlays.mjs): none may stand for nothing. An event that may show a
// stray (a scroll, a press, a key) asks for an audit too.
//
// The loop rests while nothing moves. Run on every frame while anything was drawn, it measured and
// drew the same things again and again with the pointer resting on a paragraph (its handle shown) or
// blocks selected: 60–160ms of the main thread a second, 115 frames a second, for a picture that did
// not change. What may move a block, and so runs the followers again: the page changed (a mutation
// anywhere but in the editor's own layers, overlay-layer.mjs, whose drawings move nothing), anything
// scrolled (a box of the page that scrolls by itself, the page under what sticks to the window), the
// window or the page resized, a transition or an animation under way (on every frame until it ends,
// LONGEST at most when its end never comes), a picture or a frame loaded (or failing), fonts loaded, the pointer
// onto another element (what :hover styles) or the focus moving (:focus-within), and any task woken
// (the pointer moved, the selection changed). After each, the followers run on SETTLE frames more: a
// layout the page's own frame callbacks change after the editor's (the kit's tables lay themselves
// out in a frame), one the next frame finishes.

/** What run() returns to run again whenever what it drew over may have moved (not on every frame). */
export const FOLLOW = "follow";

const SETTLE = 3; // frames the followers run on after the last thing that may have moved their blocks
const LONGEST = 5000; // ms: a transition or animation whose end never comes (one that repeats for good) stops counting as moving

const tasks = new Map(); // name -> { run, fail, wanted, follows }
let frame = 0;
let requested = 0; // frames requested and not yet run: never more than one
let epoch = 0; // frames run
let lastRun = 0;
let auditWanted = false;
let running = false; // a frame is being run
let settling = 0; // frames the followers still run on without a new reason
const moving = new Map(); // element -> { names: Set of transitions and animations under way on it, since }

const follows = () => {
  for (const task of tasks.values()) if (task.follows) return true;
  return false;
};

function request() {
  if (frame) return;
  requested++;
  frame = requestAnimationFrame(editorFrame);
}

// Transitions and animations under way, their elements still on the page and begun not too long ago.
function stillMoving() {
  if (moving.size === 0) return false;
  const now = performance.now();
  for (const [element, entry] of moving) if (!element.isConnected || now - entry.since > LONGEST) moving.delete(element);
  return moving.size > 0;
}

function editorFrame() {
  frame = 0;
  requested--;
  epoch++;
  lastRun = performance.now();
  // Something may have moved the blocks lately: the followers run on this frame.
  if (settling > 0 || stillMoving()) {
    settling = Math.max(0, settling - 1);
    for (const task of tasks.values()) if (task.follows) task.wanted = true;
  }
  running = true;
  let ran = false;
  for (const [name, task] of tasks) {
    if (!task.wanted) continue;
    task.wanted = false;
    ran = true;
    try {
      const next = task.run();
      task.wanted = next === true;
      task.follows = next === FOLLOW;
    } catch (error) {
      task.wanted = false;
      task.follows = false;
      try {
        task.fail?.();
      } catch (cleanup) {
        report(`${name} (taking it down)`, cleanup);
      }
      report(name, error);
    }
  }
  running = false;
  if (auditWanted || ran) {
    auditWanted = false;
    try {
      audit();
    } catch (error) {
      report("audit", error);
    }
  }
  const following = follows();
  watch(following);
  if ([...tasks.values()].some((task) => task.wanted) || (following && (settling > 0 || moving.size > 0))) request();
}

/**
 * A task of the loop: run() draws (returns true to run again on the next frame, FOLLOW to run again
 * when what it drew over may have moved), fail() takes down what it draws. Returns { wake }: run it
 * on the next frame.
 */
export function task(name, { run, fail }) {
  const entry = { run, fail, wanted: false, follows: false };
  tasks.set(name, entry);
  return {
    wake() {
      entry.wanted = true;
      settling = SETTLE;
      request();
    },
  };
}

/** Audit the overlays on the next frame (an event that may have shown a stray). */
function auditSoon() {
  auditWanted = true;
  request();
}

// Something that may have moved the blocks happened: the followers run on the next frames.
function moved() {
  settling = SETTLE;
  if (follows()) request();
}

// The page's mutations, watched only while a task follows (none to pay for while the reader types
// with nothing drawn): those inside the editor's layers are its own drawings, which move no block.
const mutations = new MutationObserver((records) => {
  for (const record of records) {
    const node = record.target.nodeType === 1 ? record.target : record.target.parentElement;
    if (!node?.closest(".ge-layer")) return moved();
  }
});
let watching = false;
function watch(on) {
  if (on === watching) return;
  watching = on;
  if (on) mutations.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
  else mutations.disconnect();
}
const resizes = new ResizeObserver(() => moved());
resizes.observe(document.documentElement);
const main = document.querySelector("main");
if (main) resizes.observe(main);
for (const type of ["scroll", "resize", "pointerover", "focusin", "focusout"]) addEventListener(type, moved, { capture: true, passive: true });
// A picture's or a frame's load never reaches the window (a load event's path ends at the document).
for (const type of ["load", "error"]) document.addEventListener(type, moved, { capture: true, passive: true });
document.fonts?.addEventListener("loadingdone", moved);
// A transition or an animation begun goes on moving what it moves until it ends (or is cancelled).
const began = (event) => {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest(".ge-layer")) return; // a drawing of the editor's own (an arrival's fills: changes/) moves no block
  let entry = moving.get(event.target);
  if (!entry) moving.set(event.target, (entry = { names: new Set(), since: 0 }));
  entry.names.add(event.propertyName ?? event.animationName);
  entry.since = performance.now();
  moved();
};
const ended = (event) => {
  const entry = moving.get(event.target);
  entry?.names.delete(event.propertyName ?? event.animationName);
  if (entry?.names.size === 0) moving.delete(event.target);
  moved();
};
for (const type of ["transitionrun", "animationstart"]) addEventListener(type, began, { capture: true, passive: true });
for (const type of ["transitionend", "transitioncancel", "animationend", "animationcancel"]) addEventListener(type, ended, { capture: true, passive: true });

/** Frames run so far: a measurement taken in one frame is good for that frame only. */
export const frameNumber = () => epoch;

/** Whether a frame is being run now (outside one, what is measured is measured afresh). */
export const inFrame = () => running;

provide("frames", () => ({
  requested,
  epoch,
  sinceLastRun: lastRun ? Math.round(performance.now() - lastRun) : null,
  settling,
  moving: moving.size,
  watching,
  tasks: [...tasks].map(([name, entry]) => ({ name, wanted: entry.wanted, follows: entry.follows })),
}));

for (const type of ["scroll", "pointerdown", "keyup"]) addEventListener(type, auditSoon, { capture: true, passive: true });
note("frames", "started");
