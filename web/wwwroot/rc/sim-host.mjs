/**
 * Renderer-independent RC simulation host (V8 / Puerts safe).
 * Runs session + race physics at a fixed 120 Hz with the same accumulator pattern as main.js.
 * Open-world activity steps register with {@link SimHost#onFixedStep}; pre-race work uses
 * {@link SimHost#onBeforeFixedStep} and {@link SimHost#setStepInput}.
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
 * @property {boolean} contact
 * @property {number[]|null} contactPoint
 */

/**
 * @typedef {Object} FrameState
 * @property {number} t simulated clock (seconds)
 * @property {number} step count of fixed 1/120 s steps executed
 * @property {Object} player
 * @property {Array<{id:string|number,pos:number[],q:number[],vel:number[],params:object,wheels:WheelFrame[]}>} rivals
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

/** @param {import('./physics/car.mjs').createCar extends Function ? ReturnType<typeof createCar>['wheels'][number] : object} w */
function wheelFrame(w) {
  return {
    compression: w.compression,
    spin: w.spin,
    slip: w.slip,
    surface: w.surface ?? null,
    contact: !!w.contact,
    contactPoint: w.contactPoint ? [w.contactPoint[0], w.contactPoint[1], w.contactPoint[2]] : null
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
 * @param {{player: object, rivals: Array<{session: object, callsign?: string}>, events: unknown[], t: number}} state
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
      forwardSpeed: c.forwardSpeed,
      yaw: carYaw(c),
      grounded: c.grounded,
      contacts: c.contacts,
      flightMode: s.flight.mode ?? null,
      params: jsonClone(c.params),
      wheels: c.wheels.map(wheelFrame)
    },
    rivals: state.rivals.map((rival, i) => {
      const rc = rival.session.car;
      const rp = carPose(rc);
      return {
        id: rival.callsign ?? i,
        pos: rp.pos,
        q: rp.q,
        vel: rp.vel,
        steer: rc.steer,
        speed: rc.speed,
        params: jsonClone(rc.params),
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

/** @param {object} race */
function bindRaceState(race) {
  return {
    attached: true,
    useRace: true,
    race,
    player: race.player,
    rivals: race.rivals,
    events: race.events,
    t: race.t
  };
}

/**
 * @param {Object} options
 * @param {object} [options.race] live race from the web game (createRace); steps with setStepInput
 * @param {import('./physics/session.mjs').createSession extends Function ? Parameters<typeof createSession>[0] : object} [options.course]
 * @param {SimMode} [options.mode='kid']
 * @param {Array<unknown>} [options.rivals=[]] length selects AI opponent count; empty uses createSession (no grid offset)
 * @param {object} [options.params] car params passed to createSession
 * @returns {SimHost}
 */
export function createSimHost({race, course, mode = 'kid', rivals = [], params} = {}) {
  if (!race && !course) throw new Error('createSimHost: course or race is required');

  /** @type {object|undefined} */
  let attachedRace = race;

  /** @returns {{player: object, rivals: object[], events: unknown[], t: number, useRace: boolean, race?: object, attached?: boolean}} */
  function makeState() {
    if (attachedRace) return bindRaceState(attachedRace);
    if (rivals.length > 0) {
      const r = createRace(course, {mode, opponents: rivals.length, params});
      return {useRace: true, race: r, player: r.player, rivals: r.rivals, events: r.events, t: r.t};
    }
    const player = createSession(course, {mode, params});
    return {useRace: false, player, rivals: [], events: [], t: 0};
  }

  let state = makeState();
  let acc = 0;
  let step = 0;
  let eventFrom = 0;
  let lastInput = {};
  /** @type {object} full stepRace / stepSession input for the attached race path */
  let raceStepInput = {};
  /** @type {Array<(dt: number, host: SimHost) => void>} */
  const beforeHooks = [];
  /** @type {Array<(dt: number, host: SimHost) => void>} */
  const fixedHooks = [];

  function runFixedStep() {
    for (const fn of beforeHooks) fn(FIXED_DT, host);
    if (state.attached) {
      stepRace(state.race, raceStepInput, FIXED_DT);
      state.t = state.race.t;
      state.events = state.race.events;
    } else {
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
      // Drain consumed events so the race array stays bounded (main.js used to splice(0) each frame).
      state.events.length = 0;
      eventFrom = 0;
      return frame;
    },

    reset() {
      state = makeState();
      acc = 0;
      step = 0;
      eventFrom = 0;
      lastInput = {};
      raceStepInput = {};
    },

    /** Drop leftover accumulator time (countdown hold in main.js). */
    clearAccumulator() {
      acc = 0;
    },

    /** @param {object} nextRace */
    setRace(nextRace) {
      attachedRace = nextRace;
      state = bindRaceState(nextRace);
      eventFrom = 0; // creation events are shown, as before the SimHost refactor
    },

    /** @param {object} input passed verbatim to stepRace on the attached-race path */
    setStepInput(input) {
      raceStepInput = input;
    },

    /**
     * Called once per 1/120 s tick before session / race step (input build, tennis, etc.).
     * @param {(dt: number, host: SimHost) => void} fn
     */
    onBeforeFixedStep(fn) {
      beforeHooks.push(fn);
      return () => {
        const i = beforeHooks.indexOf(fn);
        if (i >= 0) beforeHooks.splice(i, 1);
      };
    },

    /**
     * Open-world / activity fixed steps; once per 1/120 s tick after session + race step.
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
