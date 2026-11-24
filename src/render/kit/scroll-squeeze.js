// A scrollbar the kit draws gives way where its content can go no further: pushed on past an end (the wheel, a
// touchpad's swipe, its thumb dragged), the content does not bounce, the thumb is squeezed from the end it is pushed
// against instead, and springs back the moment the pushing stops. The kit's one scrollbar (scrollbar.js) gives way by
// this module, so every rail it draws does: a table frame's two (tables/scrollbars.js) and a database's sideways one
// under its table and its board (database/ui/rail.js).
//
// - Like a rubber band, the further it is pushed the harder it gets (`rubber`): halfway to its most after
//   SQUEEZE.half px of pushing, never quite there; its most is half the thumb, and SQUEEZE.most px on a long one
//   (`roomOf`), so that every rail feels alike.
// - Only a hand that is still moving squeezes it. A touchpad goes on sending wheel events after the fingers lift (its
//   momentum, the content coasting), with nothing in them to say so: they are told apart by their speed (`coastReader`),
//   which only ever falls, step by step, at one steady rate, where a hand's goes up and down. A step slower than the
//   one before is held back until it is clear which it is; momentum never squeezes, so a swipe that coasts to the end
//   does not either.
// - A swipe that comes to the end within its gesture (the content off the end at one of its events, then at it) gives
//   one bump (`bump`): the thumb squeezed by as much as the speed it came there at says (`bumpOf`: the faster, the
//   more, by less and less, never past SQUEEZE.bumpMost), held SQUEEZE.bumpHold ms, sprung back; nothing more for the
//   rest of that gesture, however it goes on, hand or momentum. The same speed gives the same bump every time (the
//   user's 2026-11-24: a swipe that came to the end squeezed the thumb now and then, as the reading of its run fell
//   out, and once held it squeezed until its momentum was spent: "根据速度设置的固定效果"). A gesture begun at the
//   end squeezes as the reader says, by the rubber band.
// - It springs back at once when the pushing stops: the momentum told, or no push for SQUEEZE.gap ms (a hand at
//   rest, a mouse's notch), the drag let go, or the content scrolled back from the end. The spring is critically
//   damped (no overshoot); a push while it springs back takes the thumb from where it is.
// - With reduced motion, the thumb still follows the push but is whole again at once, with no spring.

export const SQUEEZE = Object.freeze({
  least: 0.5, // the thumb never below this share of its length
  most: 96, // px it gives way at most, however long it is
  half: 120, // px of pushing past the end for the squeeze to come halfway to its most
  step: 30, // px one wheel event counts for at most (a mouse's notch is 100: a notch squeezes a little)
  give: 0.5, // how fast a dragged thumb gives way at first, for each px the pointer goes past the end
  gap: 60, // ms with no push before it springs back (a touchpad's events come every 8 to 16 ms while the hand moves)
  gesture: 120, // ms with no wheel event after which the next one starts a gesture anew
  follow: 40, // ms: the response of the spring that follows the push (a notch's step drawn over a few frames)
  back: 250, // ms: the response of the spring back
  bumpMost: 28, // px a swipe coming to the end squeezes the thumb at most
  bumpSoft: 2, // px/ms: the speed it comes at for its bump to come about two thirds of the way to its most
  bumpLeast: 3, // px it squeezes at least, so that a slow one is seen
  bumpHold: 70, // ms the bump is held before it springs back
});

/** How far a swipe coming to the end at `speed` px/ms squeezes the thumb, `most` the room it has. */
export function bumpOf(speed, most) {
  const by = SQUEEZE.bumpLeast + (SQUEEZE.bumpMost - SQUEEZE.bumpLeast) * (1 - Math.exp(-Math.max(0, speed) / SQUEEZE.bumpSoft));
  return Math.max(0, Math.min(most, by));
}

// The momentum reader's numbers. A hand's speed goes up and down from one event to the next; momentum's falls at one
// steady rate. Over a few events the two look alike now and then, so a decay must run a while and fall far enough
// before it is taken for momentum: a hand's jitter seldom falls so (a steady hand's never does), a hand easing off
// may, and is let go of then. Deltas of whole pixels (some systems send only those) are a pixel's rounding off,
// which a hand's small steps are as well: their decay must run longer and fall further.
const FASTEST = 4; // ms: events closer together are read as this far apart
const SLOWEST = 40; // ms: events further apart (a mouse's notches) are read as this far apart, their speeds alike
const DECAY = { steps: 4, drop: 0.15 }; // events a decay runs after the one it starts from, the share of it lost
const DECAY_WHOLE = { steps: 5, drop: 0.25 }; // the same, in whole pixels
const FIT = 0.02; // each event between within this share of one exponential decay through the first and the last
const WHOLE = 0.5; // px: the rounding of a delta of whole pixels
const RISE = 1.2; // momentum never speeds up: an event this much faster than its slowest is a hand again
const RISE_LEAST = 3; // px: what a hand moves at least to be told from the rounding of a slow coast
const KEPT = 10; // events of a decay kept

/** How far a thumb is squeezed for `pushed` px of pushing: `most * pushed / (pushed + half)`. */
export function rubber(pushed, most, half = SQUEEZE.half) {
  return pushed > 0 && most > 0 ? (most * pushed) / (pushed + half) : 0;
}

/** The pushing that squeezes a thumb by `given` (rubber's inverse). */
export function unrubber(given, most, half = SQUEEZE.half) {
  if (!(given > 0) || !(most > 0)) return 0;
  return given >= most ? Number.MAX_VALUE : (half * given) / (most - given);
}

/** How far a thumb of `size` px may be squeezed: half of it, SQUEEZE.most px at most, never below `smallest / 2` px. */
export function roomOf(size, smallest) {
  return Math.max(0, Math.min(size * (1 - SQUEEZE.least), SQUEEZE.most, size - smallest / 2));
}

/**
 * Reads a run of wheel events along one axis: `read(delta, time)` says whether an event is a hand's push
 * ("push"), the momentum after the fingers lifted ("coast"), or slower than the one before, which may be either
 * until the next ones tell ("hold"). It is fed every wheel event over what scrolls, at the end or not, so that a
 * swipe's momentum is known before it reaches the end.
 */
export function coastReader() {
  let last = null; // the gesture's last event: { time, sign }
  let run = []; // the events since the last that was faster than the one before: { time, speed, size, whole }
  let coasting = false;
  let slowest = null; // the slowest event of the coast
  return {
    read(delta, time) {
      const size = Math.abs(delta);
      const sign = Math.sign(delta);
      const fresh = !last || !(time >= last.time) || time - last.time > SQUEEZE.gesture || sign !== last.sign;
      const dt = fresh ? 0 : Math.min(SLOWEST, Math.max(FASTEST, time - last.time));
      last = { time, sign };
      if (fresh) {
        run = [];
        coasting = false;
        return "push";
      }
      const point = { time, speed: size / dt, size, whole: Number.isInteger(size), dt };
      if (coasting) {
        if (faster(point, slowest, RISE) && size >= RISE_LEAST) {
          coasting = false;
          run = [point];
          return "push";
        }
        if (point.speed < slowest.speed) slowest = point;
        return "coast";
      }
      const before = run.at(-1);
      if (!before || faster(point, before, 1)) {
        run = [point];
        return "push";
      }
      run.push(point);
      if (run.length > KEPT) run.shift();
      if (decays(run)) {
        coasting = true;
        slowest = point;
        run = [];
        return "coast";
      }
      return point.speed < before.speed || point.size < before.size ? "hold" : "push";
    },
    get coasting() { return coasting; },
  };
}

// Whether event `point` is faster than `than` by `by`, beyond a pixel's rounding: by its speed (px per ms) and by
// its px alike, so that neither an event's time stamp nor its px alone, a little off, reads as a speeding up.
function faster(point, than, by) {
  const slack = point.whole ? 2 * WHOLE : 0;
  return point.size > than.size * by + slack && point.speed > than.speed * by + slack / point.dt;
}

// Whether the run's last events are one exponential decay: from some event of the run, DECAY.steps events or more,
// each between within FIT of the curve through the first and the last (and a pixel's rounding), the last having lost
// DECAY.drop of the first. Read by the speed against the events' times, or by the px against their count (events
// that come one a frame, their time stamps a little off): either will do.
function decays(run) {
  const z = run.length - 1;
  const { steps, drop } = run[z].whole ? DECAY_WHOLE : DECAY;
  const along = (value, place, from) => {
    const first = value(run[from]);
    const end = value(run[z]);
    if (!(end <= first * (1 - drop))) return false;
    const rate = Math.log(end / first) / (place(z) - place(from));
    for (let at = from + 1; at < z; at++) {
      const want = first * Math.exp(rate * (place(at) - place(from)));
      const slack = run[at].whole ? WHOLE / (value === speedOf ? run[at].dt : 1) : 0;
      if (Math.abs(value(run[at]) - want) > want * FIT + slack) return false;
    }
    return true;
  };
  for (let from = 0; z - from >= steps; from++) {
    if (along(speedOf, (at) => run[at].time, from) || along(sizeOf, (at) => at, from)) return true;
  }
  return false;
}
const speedOf = (point) => point.speed;
const sizeOf = (point) => point.size;

/**
 * The squeeze of one rail's thumb. `draw(given, side)` is called each frame it changes: the thumb `given` px shorter,
 * from the end `side` says (1 the far end, -1 the near end). Fed every wheel event along its axis (`wheel`) and a
 * drag's place past an end (`drag`), it squeezes and springs back as the module's head says. `clock` replaces the
 * page's time, frames and timers (the unit tests').
 */
export function createSqueeze(draw, clock = {}) {
  const now = clock.now ?? (() => globalThis.performance.now());
  const frame = clock.frame ?? ((callback) => globalThis.requestAnimationFrame(callback));
  const cancel = clock.cancel ?? ((id) => globalThis.cancelAnimationFrame(id));
  const later = clock.later ?? ((callback, ms) => globalThis.setTimeout(callback, ms));
  const clear = clock.clear ?? ((id) => globalThis.clearTimeout(id));
  const motion = clock.reduced ? null : globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  const reduced = clock.reduced ?? (() => Boolean(motion?.matches));
  const reader = coastReader();
  let mode = "rest"; // "push" | "drag" | "back" | "rest"
  let side = 1;
  let given = 0; // px
  let speed = 0; // px/s
  let target = 0;
  let most = 0;
  let pushed = 0; // px of pushing past the end, of this push
  let held = 0; // px of slowing steps held back
  let last = null; // the last wheel event: { time, sign }
  let stream = { off: false, arrived: false }; // this gesture: whether the content stood off the end at one of its events, and whether it came to it since
  let speedNow = 0; // px/ms of the gesture's last event
  let wheelAt = -Infinity; // when the last wheel event came, by the squeeze's own clock (an event's time stamp may be of another)
  let at = 0; // the time the motion is brought up to
  let raf = 0;
  let gap = 0;
  let drawn = { value: 0, side: 1 };

  // The motion brought up to `t`: a critically damped spring from where the thumb is to the target (its exact
  // solution, whatever the time between frames).
  function step(t) {
    const dt = Math.max(0, (t - at) / 1000);
    at = t;
    if (!dt) return;
    if (reduced()) {
      given = target;
      speed = 0;
      return;
    }
    const omega = (2 * Math.PI * 1000) / (mode === "back" ? SQUEEZE.back : SQUEEZE.follow);
    const away = given - target;
    const pull = speed + omega * away;
    const fall = Math.exp(-omega * dt);
    given = target + (away + pull * dt) * fall;
    speed = (speed - omega * pull * dt) * fall;
    if (given < 0) { given = 0; speed = 0; }
    if (given > most) { given = Math.max(0, most); speed = 0; }
  }

  const settled = () => Math.abs(given - target) < 0.05 && Math.abs(speed) < 2;

  function show() {
    const value = Math.round(given * 100) / 100;
    if (drawn.value === value && drawn.side === side) return;
    drawn = { value, side };
    draw(value, side);
  }

  function tick() {
    raf = 0;
    step(now());
    if (settled()) {
      given = target;
      speed = 0;
      if (mode === "back") mode = "rest";
      show();
      return;
    }
    show();
    raf = frame(tick);
  }

  // The thumb sent towards `value`, its motion brought up to now first.
  function aim(value) {
    step(now());
    target = Math.max(0, Math.min(most, value));
    if (reduced()) given = target;
    if (!raf) raf = frame(tick);
  }

  // A push or a drag begun on `towards`, from where the thumb is (a spring back caught where it got to).
  function begin(towards, as) {
    step(now());
    if (mode !== "push" && mode !== "drag") {
      if (towards !== side && given > 0) { given = 0; speed = 0; }
      side = towards;
      pushed = unrubber(given, most);
    }
    mode = as;
  }

  // A swipe come to the end on `towards` at `pace` px/ms: the thumb squeezed by its bump (bumpOf), held
  // SQUEEZE.bumpHold ms, sprung back; a push or a drag on it already is left as it is.
  function arrived(towards, pace, room) {
    if (mode === "push" || mode === "drag") return;
    most = room;
    step(now());
    if (towards !== side && given > 0) { given = 0; speed = 0; }
    side = towards;
    mode = "bump";
    held = 0;
    pushed = 0;
    clear(gap);
    aim(bumpOf(pace, most));
    gap = later(() => {
      gap = 0;
      if (mode !== "bump") return;
      step(now());
      mode = "back";
      aim(0);
    }, SQUEEZE.bumpHold);
  }

  function release() {
    clear(gap);
    gap = 0;
    held = 0;
    pushed = 0;
    if (mode !== "push" && mode !== "drag") return;
    step(now());
    speed = Math.min(0, speed); // let go, it turns back at once, not squeezed on by the way it was going
    mode = "back";
    aim(0);
  }

  return {
    /**
     * A wheel event along the rail's axis: `delta` its px (signed as it scrolls), `time` its time stamp, `end`
     * whether the content is at the end it pushes against, `past` how much of the event the content could not take
     * there, `room` how far the thumb may be squeezed now (roomOf). Returns how the event was read.
     */
    wheel(delta, { time = now(), end = false, past = 0, room = most } = {}) {
      if (!delta) return "push";
      let kind = reader.read(delta, time);
      const fresh = !last || !(time >= last.time) || time - last.time > SQUEEZE.gesture || Math.sign(delta) !== last.sign;
      const size = Math.abs(delta);
      const speed = fresh ? 0 : size / Math.min(SLOWEST, Math.max(FASTEST, time - last.time));
      if (fresh) {
        held = 0;
        stream = { off: false, arrived: false };
      }
      if (speed) speedNow = speed;
      wheelAt = now();
      last = { time, sign: Math.sign(delta) };
      if (!end) {
        stream.off = true;
        stream.arrived = false;
      } else if (stream.off) {
        // Come to the end within this gesture: its one bump, by the speed it came at; nothing more for the rest of it.
        if (!stream.arrived && mode !== "drag") arrived(Math.sign(delta), speed || speedNow, room);
        stream.arrived = true;
        kind = "coast";
      }
      if (mode === "drag") return kind;
      most = room;
      if (!end || kind === "coast") {
        held = 0;
        if (mode === "push") release();
        return kind;
      }
      const amount = Math.min(SQUEEZE.step, Math.max(0, past));
      if (kind === "hold") held += amount;
      else if (held + amount > 0) {
        begin(Math.sign(delta), "push");
        pushed += held + amount;
        held = 0;
        aim(rubber(pushed, most));
      }
      if (mode === "push") {
        clear(gap);
        gap = later(release, SQUEEZE.gap);
      }
      return kind;
    },
    /**
     * The thumb dragged `over` px past the point where it reached the end on `towards` (1 the far end, -1 the near
     * one; 0: not past it), `room` how far it may be squeezed: it gives way as to the wheel's push, the more slowly
     * the further it goes.
     */
    drag(over, towards, room) {
      most = room;
      if (mode !== "drag") {
        if (!(over > 0)) return;
        clear(gap);
        gap = 0;
        held = 0;
        begin(towards, "drag");
      }
      if (over > 0 && towards !== side) { step(now()); side = towards; given = 0; speed = 0; }
      aim(over > 0 ? rubber(over, most, most / SQUEEZE.give) : 0);
    },
    /**
     * The content come to the end on `towards` by the wheel's scroll between its events (a scroll the browser draws
     * on after an event): as an event there would, the gesture's one bump, at its last speed; nothing where the
     * gesture began at the end, is over, or went the other way.
     */
    arrive(towards, room) {
      if (!last || now() - wheelAt > SQUEEZE.gesture || last.sign !== towards || !stream.off || stream.arrived) return;
      stream.arrived = true;
      arrived(towards, speedNow, room);
    },
    /** Springs back: a drag let go, the content scrolled back from the end. */
    release,
    /** The content scrolled away from the end that was pushed: whole again, unless a drag holds the thumb. */
    away() { if (mode === "push") release(); },
    /** How much shorter the thumb is drawn now, px. */
    get given() { return drawn.value; },
    /** The end it is squeezed from: 1 the far end, -1 the near one. */
    get side() { return drawn.side; },
    get mode() { return mode; },
    destroy() {
      clear(gap);
      if (raf) cancel(raf);
      raf = 0;
    },
  };
}
