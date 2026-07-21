export const TELEMETRY_STATE_ENCODING = "shallow-keyframe-delta-v1";
export const DEFAULT_KEYFRAME_INTERVAL_SAMPLES = 40;
const MATERIALIZED_STATE = Symbol("telemetry-materialized-state");

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function signature(value) {
  const encoded = JSON.stringify(value);
  return encoded === undefined ? "undefined" : encoded;
}

function cloneJsonRecord(value) {
  return JSON.parse(JSON.stringify(value));
}

function fullStateRow({ state, time, build, held, sequence }) {
  return {
    k: "st",
    t: time,
    build,
    q: sequence,
    held,
    s: state,
  };
}

function samplingEvidence(row) {
  const evidence = {};
  if (Object.prototype.hasOwnProperty.call(row ?? {}, "authority_tick_delta"))
    evidence.authority_tick_delta = row.authority_tick_delta;
  if (typeof row?.sample_reason === "string") evidence.sample_reason = row.sample_reason;
  return evidence;
}

/**
 * Losslessly removes unchanged top-level fields from the 20 Hz state trace.
 *
 * WebBridge deliberately exposes a stable, flat snapshot contract. Comparing each field's JSON
 * representation therefore captures every nested array/object change without tying the recorder
 * to individual simulation fields. Periodic full states bound recovery after a missing chunk.
 */
export class TelemetryStateEncoder {
  constructor({ keyframeIntervalSamples = DEFAULT_KEYFRAME_INTERVAL_SAMPLES } = {}) {
    this.keyframeIntervalSamples = Number.isSafeInteger(keyframeIntervalSamples)
      && keyframeIntervalSamples > 0
      ? keyframeIntervalSamples
      : DEFAULT_KEYFRAME_INTERVAL_SAMPLES;
    this.sequence = 0;
    this.samplesSinceKeyframe = this.keyframeIntervalSamples;
    this.forceFullState = true;
    this.previousSignatures = new Map();
  }

  forceKeyframe() {
    this.forceFullState = true;
  }

  encode({ state, time, build, held = [] } = {}) {
    if (!isRecord(state)) throw new TypeError("telemetry state must be an object");

    const sequence = this.sequence;
    this.sequence += 1;
    const currentSignatures = new Map();
    const delta = {};
    for (const [key, value] of Object.entries(state)) {
      const nextSignature = signature(value);
      currentSignatures.set(key, nextSignature);
      if (this.previousSignatures.get(key) !== nextSignature) delta[key] = value;
    }

    const removed = [];
    for (const key of this.previousSignatures.keys()) {
      if (!currentSignatures.has(key)) removed.push(key);
    }

    const useKeyframe = this.forceFullState
      || this.samplesSinceKeyframe >= this.keyframeIntervalSamples;
    let row;
    if (useKeyframe) {
      row = fullStateRow({ state, time, build, held: [...held], sequence });
      this.samplesSinceKeyframe = 1;
      this.forceFullState = false;
    } else {
      row = {
        k: "st",
        t: time,
        q: sequence,
        held: [...held],
        d: delta,
      };
      if (removed.length) row.x = removed;

      // A discontinuity can change most of the state at once. In that case a full state is both
      // smaller and easier to inspect, so promote it without waiting for the periodic keyframe.
      const candidateBytes = JSON.stringify(row).length;
      const keyframe = fullStateRow({ state, time, build, held: [...held], sequence });
      if (candidateBytes >= JSON.stringify(keyframe).length) {
        row = keyframe;
        this.samplesSinceKeyframe = 1;
      } else {
        // Retain the already-parsed snapshot only while this row is in the bounded browser queue.
        // It is non-enumerable, so it never enters JSON or Blob storage. If a 2 MiB split or queue
        // truncation lands here, the row can be promoted into an independently decodable keyframe.
        Object.defineProperty(row, MATERIALIZED_STATE, {
          value: Object.freeze({ state, build }),
          enumerable: false,
          configurable: true,
        });
        this.samplesSinceKeyframe += 1;
      }
    }

    this.previousSignatures = currentSignatures;
    return row;
  }
}

/**
 * Ensure the first state row in an upload queue is a full state.
 *
 * Input/context rows may legally precede it. A delta produced by this process can be promoted only
 * while it remains in the browser's bounded queue; persisted rows intentionally carry no hidden
 * state and must instead be decoded from a preceding keyframe.
 */
export function ensureTelemetryChunkKeyframe(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return Array.isArray(rows) ? rows : [];
  const stateIndex = rows.findIndex((row) => row?.k === "st");
  if (stateIndex < 0 || isRecord(rows[stateIndex]?.s)) return rows;

  const hidden = rows[stateIndex]?.[MATERIALIZED_STATE];
  if (!isRecord(hidden?.state)) {
    throw new Error("telemetry chunk begins with a delta that cannot be promoted");
  }
  const delta = rows[stateIndex];
  const promoted = {
    ...fullStateRow({
      state: hidden.state,
      time: delta.t,
      build: hidden.build,
      held: Array.isArray(delta.held) ? delta.held : [],
      sequence: delta.q,
    }),
    ...samplingEvidence(delta),
  };
  const next = [...rows];
  next[stateIndex] = promoted;
  return next;
}

/** Replace any provisional header with the immutable batch's self-describing header. */
export function ensureTelemetryChunkHeader(rows, header) {
  if (!isRecord(header) || header.k !== "hdr") {
    throw new TypeError("telemetry chunk header must be an object with k=hdr");
  }
  const body = Array.isArray(rows) ? rows.filter((row) => row?.k !== "hdr") : [];
  return [{ ...header }, ...body];
}

/** Release queue-only full snapshots after an immutable payload has been serialized. */
export function releaseTelemetryMaterializedStates(rows) {
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    if (row && Object.prototype.hasOwnProperty.call(row, MATERIALIZED_STATE)) {
      delete row[MATERIALIZED_STATE];
    }
  }
}

/** Materialize a keyframe or delta row. Intended for analysis and codec verification tooling. */
export function materializeTelemetryState(row, previousState = null) {
  if (!isRecord(row) || row.k !== "st") {
    throw new TypeError("telemetry row must be a state row");
  }
  if (isRecord(row.s)) return cloneJsonRecord(row.s);
  if (!isRecord(row.d) || !isRecord(previousState)) {
    throw new Error("delta state row requires a preceding keyframe or materialized state");
  }

  const next = { ...cloneJsonRecord(previousState), ...cloneJsonRecord(row.d) };
  if (Array.isArray(row.x)) {
    for (const key of row.x) delete next[key];
  }
  return next;
}

/** Stateful analysis decoder that rejects silent corruption across missing delta rows. */
export class TelemetryStateDecoder {
  constructor() {
    this.state = null;
    this.sequence = null;
  }

  decode(row) {
    if (!isRecord(row) || row.k !== "st") {
      throw new TypeError("telemetry row must be a state row");
    }
    const sequence = Number(row.q);
    if (!Number.isSafeInteger(sequence) || sequence < 0) {
      throw new Error("encoded telemetry state row has an invalid sequence");
    }

    if (isRecord(row.s)) {
      if (Number.isSafeInteger(this.sequence) && sequence <= this.sequence) {
        throw new Error(
          `telemetry keyframe sequence must advance beyond ${this.sequence}, received ${sequence}`,
        );
      }
      this.state = materializeTelemetryState(row);
      this.sequence = sequence;
      return cloneJsonRecord(this.state);
    }
    if (!isRecord(this.state) || !Number.isSafeInteger(this.sequence)) {
      throw new Error("delta state row requires a preceding keyframe");
    }
    if (sequence !== this.sequence + 1) {
      throw new Error(
        `telemetry state sequence gap: expected ${this.sequence + 1}, received ${sequence}`,
      );
    }

    this.state = materializeTelemetryState(row, this.state);
    this.sequence = sequence;
    return cloneJsonRecord(this.state);
  }
}
