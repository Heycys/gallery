import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { SQUEEZE, bumpOf, coastReader, createSqueeze, roomOf, rubber, unrubber } from "../../src/render/kit/scroll-squeeze.js";

// A drawn scrollbar's thumb giving way past an end (src/render/kit/scroll-squeeze.js, docs/render.md): the rubber
// band's curve, the reading of a touchpad's momentum from a hand's push (a hand's jitter, a steady hand, whole-pixel
// deltas, a mouse's notches against momentum's decay at 8 and 16 ms, its time stamps a little off), and the squeeze
// itself on a clock of the test's: it grows with the push by less and less, holds back steps that may be momentum,
// springs back at once when the momentum is read or the pushing stops, never squeezes again by the momentum, follows
// a drag past the end, and with reduced motion is whole again at once.

// The curve: halfway at `half`, by less and less, never at its most; unrubber its inverse; the room half the thumb,
// SQUEEZE.most px at most, never leaving less than half the smallest thumb.
{
  const most = 80;
  assert.equal(rubber(0, most), 0);
  assert.ok(Math.abs(rubber(SQUEEZE.half, most) - most / 2) < 1e-9, "halfway to its most after SQUEEZE.half px of pushing");
  const at = [0, 60, 120, 240, 480, 960].map((pushed) => rubber(pushed, most));
  const gains = at.slice(1).map((value, index) => (value - at[index]) / ([60, 60, 120, 240, 480][index]));
  assert.ok(gains.every((gain, index) => index === 0 || gain < gains[index - 1] / 1.5), `each px of pushing gives less than the one before: ${gains.map((gain) => gain.toFixed(3))}`);
  assert.ok(rubber(1e7, most) < most, "never quite at its most");
  for (const given of [0.5, 10, 40, 79]) assert.ok(Math.abs(rubber(unrubber(given, most), most) - given) < 1e-9, "unrubber undoes rubber");
  assert.equal(roomOf(100, 24), 50, "half the thumb");
  assert.equal(roomOf(600, 24), SQUEEZE.most, "SQUEEZE.most px of a long one");
  assert.equal(roomOf(30, 24), 15, "half of the smallest thumb left");
  assert.equal(roomOf(20, 24), 8, "a thumb shorter than the smallest keeps half of the smallest");
}

// A seeded sequence, the same every run.
const seeded = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// The momentum reader, over many hands' pushes and many lifts.
{
  const random = seeded(7);
  const hand = (count, base, jitter, whole) => Array.from({ length: count }, () => {
    const size = base * (1 + (random() * 2 - 1) * jitter);
    return whole ? Math.max(1, Math.round(size)) : size;
  });
  // How many times a second a hand pushing read as momentum (each a moment the thumb springs back while it pushes).
  const wrongPerSecond = ({ every, base, jitter, whole = false, stamps = 0 }) => {
    let coasts = 0;
    let events = 0;
    for (let run = 0; run < 200; run++) {
      const reader = coastReader();
      let time = 0;
      for (const delta of hand(60, base, jitter, whole)) {
        time += every;
        if (reader.read(delta, time + (random() * 2 - 1) * stamps) === "coast") coasts++;
        events++;
      }
    }
    return coasts / ((events * every) / 1000);
  };
  for (const [kind, hands, most] of [
    ["a jittery hand at 8 ms", { every: 8, base: 12, jitter: 0.4 }, 0.1],
    ["a hand at 8 ms", { every: 8, base: 12, jitter: 0.15 }, 0.5],
    ["a hand at 16 ms", { every: 16, base: 20, jitter: 0.15 }, 0.3],
    ["a hand, its time stamps a millisecond off", { every: 8, base: 12, jitter: 0.15, stamps: 1 }, 1],
    ["a steady hand", { every: 8, base: 12, jitter: 0.06 }, 0],
    ["a hand in whole pixels at 8 ms", { every: 8, base: 8, jitter: 0.15, whole: true }, 0],
    ["a hand in whole pixels at 16 ms", { every: 16, base: 16, jitter: 0.15, whole: true }, 0.1],
  ]) {
    const wrong = wrongPerSecond(hands);
    assert.ok(wrong <= most, `${kind}: read as momentum ${wrong.toFixed(2)} times a second (at most ${most})`);
  }
  // The momentum after a hand: read within a few events of the fingers lifting, and read so to its end.
  const lift = ({ every, last, ratio, whole = false, stamps = 0 }) => {
    let worst = 0;
    for (let run = 0; run < 100; run++) {
      const reader = coastReader();
      let time = 0;
      for (const delta of hand(30, last, 0.1, whole)) reader.read(delta, (time += every));
      let speed = last;
      let sum = 0;
      let sent = 0;
      let readAt = null;
      for (let event = 1; speed > 0.3; event++) {
        speed *= ratio;
        time += every;
        sum += speed;
        const delta = whole ? Math.round(sum) - sent : speed;
        sent += delta;
        if (!delta) continue;
        const kind = reader.read(delta, time + (random() * 2 - 1) * stamps);
        if (kind === "coast" && readAt === null) readAt = event;
        assert.ok(readAt === null || kind === "coast", `momentum read so once read (${JSON.stringify({ every, last, ratio, whole })}, event ${event}: ${kind})`);
      }
      worst = Math.max(worst, readAt ?? Infinity);
    }
    return worst;
  };
  for (const [kind, momentum, most] of [
    ["8 ms apart, 0.94 of the one before", { every: 8, last: 20, ratio: 0.94 }, 5],
    ["8 ms apart, 0.92", { every: 8, last: 25, ratio: 0.92 }, 5],
    ["8 ms apart, 0.97 (a slow decay)", { every: 8, last: 20, ratio: 0.97 }, 7],
    ["16 ms apart, 0.9", { every: 16, last: 30, ratio: 0.9 }, 5],
    ["16 ms apart, 0.95", { every: 16, last: 30, ratio: 0.95 }, 5],
    ["8 ms apart, time stamps 1.5 ms off", { every: 8, last: 20, ratio: 0.94, stamps: 1.5 }, 5],
    ["in whole pixels, 8 ms apart", { every: 8, last: 25, ratio: 0.94, whole: true }, 7],
    ["in whole pixels, 16 ms apart", { every: 16, last: 25, ratio: 0.92, whole: true }, 7],
  ]) {
    const worst = lift(momentum);
    assert.ok(worst <= most, `momentum ${kind}: read within ${worst} events of the fingers lifting (at most ${most})`);
  }
  // A mouse's notches (100 px each, as far apart as a hand turns the wheel) are never momentum; a hand pushing again
  // during the momentum is a push; a pause starts the gesture anew.
  const notches = coastReader();
  let time = 0;
  for (const apart of [200, 30, 35, 28, 33, 45, 60, 90, 31, 26]) assert.notEqual(notches.read(100, (time += apart)), "coast", "a mouse's notch is never momentum");
  const again = coastReader();
  time = 0;
  for (const delta of [12, 14, 13, 15, 14]) again.read(delta, (time += 8));
  let size = 14;
  for (let event = 0; event < 8; event++) again.read((size *= 0.9), (time += 8));
  assert.equal(again.read(size, (time += 8)), "coast", "the momentum read");
  assert.equal(again.read(size * 2.2, (time += 8)), "push", "a hand pushing again is a push");
  assert.equal(again.read(4, (time += 300)), "push", "after a pause, a gesture anew");
  assert.equal(again.coasting, false);
}

// The squeeze on the test's clock: frames every 8 ms, timers when due.
function clockOf({ reduced = false } = {}) {
  let time = 1000;
  let ids = 0;
  const frames = new Map();
  const timers = new Map();
  const clock = {
    now: () => time,
    frame: (callback) => { frames.set(++ids, callback); return ids; },
    cancel: (id) => frames.delete(id),
    later: (callback, ms) => { timers.set(++ids, { callback, at: time + ms }); return ids; },
    clear: (id) => timers.delete(id),
    reduced: () => reduced,
  };
  // Time goes on by `ms`, a frame each 8 ms, timers when they are due.
  const pass = (ms) => {
    for (const end = time + ms; time < end;) {
      time = Math.min(end, time + 8);
      for (const [id, timer] of [...timers]) if (timer.at <= time) { timers.delete(id); timer.callback(); }
      const due = [...frames.values()];
      frames.clear();
      due.forEach((callback) => callback());
    }
  };
  return { clock, pass, get time() { return time; } };
}

{
  const ROOM = 80;
  const world = clockOf();
  const drawn = [];
  const squeeze = createSqueeze((given, side) => drawn.push({ given, side }), world.clock);
  const at = () => squeeze.given;
  const random = seeded(3);
  // A hand pushing past the far end, 8 ms apart: it grows, by less and less, never past the room.
  const hand = Array.from({ length: 40 }, () => 12 * (1 + (random() * 2 - 1) * 0.3));
  const along = [];
  for (const delta of hand) {
    squeeze.wheel(delta, { time: world.time, end: true, past: delta, room: ROOM });
    world.pass(8);
    along.push(at());
  }
  const thirds = [along[12] - along[0], along[25] - along[13], along[39] - along[26]];
  assert.ok(along[39] > 30 && along[39] < ROOM && thirds[0] > thirds[1] && thirds[1] > thirds[2], `pushed on, the more the further, by less and less: ${along.map((value) => value.toFixed(1)).join(" ")}`);
  assert.equal(squeeze.side, 1, "from the far end");
  assert.equal(squeeze.mode, "push");
  // The fingers lift: the momentum held back, then read, and the thumb springs back at once, never squeezed again.
  const pushed = at();
  let speed = hand.at(-1);
  let back = null;
  const after = [];
  for (let event = 1; speed > 0.3; event++) {
    speed *= 0.94;
    const kind = squeeze.wheel(speed, { time: world.time, end: true, past: speed, room: ROOM });
    world.pass(8);
    after.push(at());
    if (kind === "coast" && back === null) back = event;
  }
  assert.ok(back !== null && back <= 5, `the momentum read within a few events: ${back}`);
  assert.ok(after.slice(0, back).every((value) => value <= pushed + 0.5), "held back until read: the momentum never squeezed it");
  assert.ok(after[back] < after[back - 1], "springing back the frame after it is read");
  assert.ok(after.slice(back).every((value, index, list) => index === 0 || value <= list[index - 1]), "and never squeezed again by the momentum still coming");
  world.pass(400);
  assert.equal(at(), 0, "whole again");
  assert.equal(squeeze.mode, "rest");

  // A push that stops with no momentum after it (a hand at rest, a mouse's notch): back after SQUEEZE.gap.
  for (let event = 0; event < 6; event++) {
    squeeze.wheel(15 + event, { time: world.time, end: true, past: 15 + event, room: ROOM });
    world.pass(8);
  }
  const resting = at();
  world.pass(SQUEEZE.gap - 16);
  assert.ok(at() >= resting && squeeze.mode === "push", "held while the hand may still push");
  world.pass(40);
  assert.ok(squeeze.mode === "back" && at() < resting, "the pushing stopped: springing back");
  // Caught while it springs back, from where it is.
  const caught = at();
  world.pass(200);
  squeeze.wheel(12, { time: world.time, end: true, past: 12, room: ROOM });
  const springing = at();
  world.pass(8);
  assert.ok(at() >= springing - 0.01 && squeeze.mode === "push" && caught > 0, "a push while it springs back takes it from where it is");
  // Scrolled back from the end: whole again.
  squeeze.wheel(-12, { time: world.time, end: false, room: ROOM });
  world.pass(400);
  assert.equal(at(), 0, "the content left the end: whole again");
  // A mouse's notch: a little, then back.
  world.pass(300);
  squeeze.wheel(100, { time: world.time, end: true, past: 100, room: ROOM });
  world.pass(40);
  const notch = at();
  assert.ok(notch > 5 && notch < rubber(SQUEEZE.step, ROOM) + 0.01, `a notch counts for SQUEEZE.step px: ${notch}`);
  world.pass(400);
  assert.equal(at(), 0, "and springs back soon");

  // A drag past the near end: it gives way by the curve, from that end, and springs back let go.
  const dragged = [20, 40, 80, 160].map((over) => { squeeze.drag(over, -1, ROOM); world.pass(120); return at(); });
  assert.ok(dragged.every((value, index) => Math.abs(value - rubber([20, 40, 80, 160][index], ROOM, ROOM / SQUEEZE.give)) < 0.1), `a drag past the end follows the curve: ${dragged}`);
  assert.equal(squeeze.side, -1, "from the near end");
  squeeze.drag(0, -1, ROOM);
  world.pass(120);
  assert.equal(at(), 0, "dragged back short of the end: whole");
  squeeze.drag(120, -1, ROOM);
  world.pass(120);
  squeeze.wheel(30, { time: world.time, end: true, past: 30, room: ROOM });
  assert.equal(squeeze.mode, "drag", "the wheel leaves a held thumb alone");
  squeeze.release();
  world.pass(400);
  assert.equal(at(), 0, "let go, whole again");
  squeeze.destroy();
  assert.ok(drawn.length > 0);
}

// Come to the end within its gesture (the user's 2026-11-24: "根据速度设置的固定效果"): a swipe from the middle, its
// momentum's steps off a clean decay by a real touchpad's rounding and timing, gives one bump at the end, as much as
// the speed it came at says (bumpOf), held and sprung back, never more for the rest of the gesture however long it
// coasts; a faster swipe a bigger one, the same speed the same; a hand still pushing as it comes there the same one
// bump; a gesture begun at the end squeezes by the rubber band at once.
{
  const ROOM = 80;
  assert.ok(bumpOf(0, ROOM) >= SQUEEZE.bumpLeast && bumpOf(1, ROOM) < bumpOf(3, ROOM) && bumpOf(3, ROOM) < bumpOf(8, ROOM) && bumpOf(100, ROOM) <= SQUEEZE.bumpMost, "the bump: the faster, the more, by less and less, within its least and most");
  assert.equal(bumpOf(100, 10), 10, "never past the room");
  // A swipe of `start` px/ms from the middle, coasting on: the most it squeezed, where, and what it is at the end.
  const swipe = (seed, start, noise = 0.1) => {
    const world = clockOf();
    const squeeze = createSqueeze(() => {}, world.clock);
    const random = seeded(seed);
    let scrolled = 0;
    const range = 450;
    let most = 0;
    let peakAt = -1;
    const trace = [];
    let gap = 8;
    const event = (speed) => {
      const delta = Math.max(1, Math.round(speed * gap * (1 + (random() * 2 - 1) * noise)));
      const taken = Math.min(range - scrolled, delta);
      scrolled += taken;
      squeeze.wheel(delta, { time: world.time, end: scrolled >= range, past: delta - taken, room: ROOM });
      gap = 7 + Math.round(random() * 10);
      world.pass(gap);
      trace.push(squeeze.given);
      if (squeeze.given > most) { most = squeeze.given; peakAt = trace.length - 1; }
      return gap;
    };
    for (let step = 0; step < 6; step++) event(start * (1 + (random() * 2 - 1) * 0.2));
    for (let speed = start; speed > 0.05;) speed *= 0.93 ** (event(speed) / 8);
    world.pass(600);
    return { reached: scrolled >= range, most, after: trace.slice(peakAt + 1), end: squeeze.given };
  };
  for (const seed of [5, 6, 7, 8, 9, 10, 11, 12]) {
    const { reached, most, after, end } = swipe(seed, 4);
    assert.ok(reached, `seed ${seed}: the swipe came to the end`);
    assert.ok(most >= SQUEEZE.bumpLeast && most <= SQUEEZE.bumpMost, `seed ${seed}: one bump at the end, within its least and most: ${most}`);
    assert.ok(after.every((value, at) => at === 0 || value <= after[at - 1] + 0.01), `seed ${seed}: after it, only springing back, never squeezed again by the momentum`);
    assert.equal(end, 0, `seed ${seed}: whole again`);
  }
  const slow = swipe(3, 1.6, 0).most;
  const fast = swipe(3, 6, 0).most;
  assert.ok(fast > slow + 3, `a faster swipe, a bigger bump: ${slow.toFixed(1)} then ${fast.toFixed(1)}`);
  assert.equal(swipe(3, 6, 0).most, fast, "the same swipe, the same bump");
  {
    const world = clockOf();
    const squeeze = createSqueeze(() => {}, world.clock);
    const random = seeded(4);
    let scrolled = 0;
    const range = 300;
    let most = 0;
    for (let step = 0; step < 60; step++) {
      const delta = Math.round(14 * (1 + (random() * 2 - 1) * 0.4));
      const taken = Math.min(range - scrolled, delta);
      scrolled += taken;
      squeeze.wheel(delta, { time: world.time, end: scrolled >= range, past: delta - taken, room: ROOM });
      world.pass(8);
      most = Math.max(most, squeeze.given);
    }
    world.pass(600);
    assert.ok(most >= SQUEEZE.bumpLeast && most <= SQUEEZE.bumpMost && squeeze.given === 0, `a hand still pushing as it comes to the end: the same one bump, no more: ${most}`);
  }
  {
    const world = clockOf();
    const squeeze = createSqueeze(() => {}, world.clock);
    squeeze.wheel(14, { time: world.time, end: true, past: 14, room: ROOM });
    world.pass(8);
    squeeze.wheel(15, { time: world.time, end: true, past: 15, room: ROOM });
    world.pass(40);
    assert.ok(squeeze.given > 0 && squeeze.mode === "push", "a gesture begun at the end squeezes at once, by the rubber band");
  }
  {
    // Come to the end by the scroll between its events (arrive): the same bump, once.
    const world = clockOf();
    const squeeze = createSqueeze(() => {}, world.clock);
    for (let step = 0; step < 5; step++) {
      squeeze.wheel(30, { time: world.time, end: false, room: ROOM });
      world.pass(8);
    }
    squeeze.arrive(1, ROOM);
    world.pass(40);
    const once = squeeze.given;
    squeeze.arrive(1, ROOM);
    squeeze.wheel(20, { time: world.time, end: true, past: 20, room: ROOM });
    world.pass(40);
    assert.ok(once >= SQUEEZE.bumpLeast && squeeze.given <= once + 0.01, `come to the end between events: one bump: ${once}`);
    world.pass(600);
    assert.equal(squeeze.given, 0, "and whole again");
  }
}

// With reduced motion: the thumb follows the push and is whole again at once, with no spring.
{
  const world = clockOf({ reduced: true });
  const squeeze = createSqueeze(() => {}, world.clock);
  squeeze.wheel(20, { time: world.time, end: true, past: 20, room: 60 });
  squeeze.wheel(22, { time: world.time + 8, end: true, past: 22, room: 60 });
  world.pass(8);
  assert.ok(Math.abs(squeeze.given - rubber(42, 60)) < 0.01, "reduced motion: at once where the push takes it");
  squeeze.release();
  world.pass(8);
  assert.equal(squeeze.given, 0, "reduced motion: whole again at once");
}

console.log("Checked the scrollbars' squeeze: the rubber band's curve, momentum told from a hand (jitter, a steady hand, whole pixels, notches, 8 and 16 ms), held back and sprung back from at once, never squeezed by it, a pause, a spring back caught, a drag, reduced motion.");
