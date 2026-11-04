/**
 * Renderer-independent RC simulation host (V8 / Puerts safe).
 * Runs session + race physics at a fixed 120 Hz with the same accumulator pattern as main.js.
 * Open-world activity steps are not wired here; register them with {@link SimHost#onFixedStep}.
 */
import {createRace, stepRace} from './physics/race.mjs';
import {createSession, stepSession} from './physics/session.mjs';
import {carYaw} from './physics/car.mjs';
import {FLIGHT} from './physics/flight.mjs';

/** @typedef {'kid'|'bigKid'} SimMode */

/**
 * @typedef {Object} SimHostInput
 * @property {number} [throttle=-1..1]
 * @property {number} [steer=-1..1]
 * @property {boolean} [brake]
 * @property {boolean} [handbrake] maps to drift (Shift in the web game)
 * @property {boolean} [boost] afterburner multiplier on the drive step when not flying
 * @property {boolean} [jump] maps to hop
 */

/**
 * @typedef {Object} WheelFrame
 * @property {number} compression
 * @property {number} spin
 * @property {number} slip
 * @property {string|null} surface
 */

/**
 * @typedef {Object} FrameState
 * @property {number} t simulated clock (seconds)
 * @property {number} step count of fixed 1/120 s steps executed
 * @property {Object} player
 * @property {Array<{id:string|number,pos:number[],q:number[],wheels:WheelFrame[]}>} rivals
 * @property {{lap:number,laps:number,gate:number,finished:boolean,time:number}} race
 * @property {Array<unknown>} events race/session events since the previous frame()
 */

/** Fixed physics step, matching web/wwwroot/rc/main.js (1/120 s). */
export const FIXED_DT = 1 / 120;

/**
 * Map the portable SimHost input onto the shape expected by stepSession / stepRace.
 * @param {SimHostInput} [input]
 */
export function mapHostInput(input = {}) {
  const throttle = Math.max(-1, Math.min(1, input.throttle ?? 0));
  const steer = Math.max(-1, Math.min(1, input.steer ?? 0));
  return {
    throttle,
    steer,
    brake: !!input.brake,
    drift: !!input.handbrake,
    hop: !!input.jump
  };
}

function wheelFrame(w) {
  return {
    compression: w.compression,
    spin: w.spin,
    slip: w.slip,
    surface: w.surface ?? null
  };
}

function carPose(car) {
  return {
    pos: [car.pos[0], car.pos[1], car.pos[2]],
    q: [car.q[0], car.q[1], car.q[2], car.q[3]],
    vel: [car.vel[0], car.vel[1], car.vel[2]]
  };
}

/** @param {unknown} value */
function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * @param {{player: import('./physics/session.mjs').createSession extends Function ? ReturnType<typeof createSession> : object, rivals: Array<{session: object, callsign?: string}>, events: unknown[], t: number}} state
 * @param {number} step
 * @param {number} eventFrom
 */
function buildFrameState(state, step, eventFrom) {
  const s = state.player;
  const c = s.car;
  const pose = carPose(c);
  return {
    t: state.t,
    step,
    player: {
      ...pose,
      steer: c.steer,
      speed: c.speed,
      yaw: carYaw(c),
      wheels: c.wheels.map(wheelFrame)
    },
    rivals: state.rivals.map((rival, i) => {
      const rc = rival.session.car;
      const rp = carPose(rc);
      return {
        id: rival.callsign ?? i,
        pos: rp.pos,
        q: rp.q,
        wheels: rc.wheels.map(wheelFrame)
      };
    }),
    race: {
      lap: s.lap,
      laps: s.laps,
      gate: s.gate,
      finished: s.finished,
      time: s.time
    },
    events: jsonClone(state.events.slice(eventFrom))
  };
}

/**
 * @param {Object} options
 * @param {import('./physics/session.mjs').createSession extends Function ? Parameters<typeof createSession>[0] : object} options.course
 * @param {SimMode} [options.mode='kid']
 * @param {Array<unknown>} [options.rivals=[]] length selects AI opponent count; empty uses createSession (no grid offset)
 * @param {object} [options.params] car params passed to createSession
 * @returns {SimHost}
 */
// TODO(phase 2, before Unreal depends on this): the web game always runs createRace (main.js
// createRace wrapper, with roam and track features) even with zero rivals; v1 uses the bare
// session when rivals is empty so its parity test matches the physics tests. Switch to the
// game's race path and move main.js onto SimHost so there is one stepping path, not two.
export function createSimHost({course, mode = 'kid', rivals = [], params} = {}) {
  if (!course) throw new Error('createSimHost: course is required');

  const hostOptions = {course, mode, rivals, params};

  /** @returns {{player: object, rivals: object[], events: unknown[], t: number, useRace: boolean, race?: object}} */
  function makeState() {
    if (rivals.length > 0) {
      const race = createRace(course, {mode, opponents: rivals.length, params});
      return {useRace: true, race, player: race.player, rivals: race.rivals, events: race.events, t: race.t};
    }
    const player = createSession(course, {mode, params});
    return {useRace: false, player, rivals: [], events: [], t: 0};
  }

  let state = makeState();
  let acc = 0;
  let step = 0;
  let eventFrom = 0;
  let lastInput = {};
  /** @type {Array<(dt: number, host: SimHost) => void>} */
  const fixedHooks = [];

  function runFixedStep() {
    const mapped = mapHostInput(lastInput);
    mapped.boost = lastInput.boost && !state.player.flight.mode ? FLIGHT.burnerBoost : 1;
    if (state.useRace) {
      stepRace(state.race, mapped, FIXED_DT);
      state.t = state.race.t;
      state.events = state.race.events;
    } else {
      stepSession(state.player, mapped, FIXED_DT);
      state.t += FIXED_DT;
    }
    for (const fn of fixedHooks) fn(FIXED_DT, host);
    step++;
  }

  const host = {
    /**
     * Advance simulation time with a variable render delta; physics stays at 120 Hz.
     * @param {number} dtSeconds
     * @param {SimHostInput} [input]
     */
    step(dtSeconds, input) {
      if (input !== undefined) lastInput = input;
      acc += dtSeconds;
      while (acc >= FIXED_DT) {
        runFixedStep();
        acc -= FIXED_DT;
      }
    },

    /** @returns {FrameState} */
    frame() {
      const frame = buildFrameState(state, step, eventFrom);
      eventFrom = state.events.length;
      return frame;
    },

    reset() {
      state = makeState();
      acc = 0;
      step = 0;
      eventFrom = 0;
      lastInput = {};
    },

    /**
     * Optional hook for open-world / activity fixed steps (not run in v1).
     * Called once per 1/120 s physics tick after session + race step.
     * @param {(dt: number, host: SimHost) => void} fn
     */
    onFixedStep(fn) {
      fixedHooks.push(fn);
      return () => {
        const i = fixedHooks.indexOf(fn);
        if (i >= 0) fixedHooks.splice(i, 1);
      };
    }
  };

  return host;
}
