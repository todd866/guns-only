import { consumeRecentEvents } from "./session_event_cursor.js";

export const LIVE_EVENT_STREAM_ID = "live";

function safeStreamId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 160
    ? value
    : LIVE_EVENT_STREAM_ID;
}

/**
 * Keep one-shot presentation cursors scoped to their source timeline. The live cursor survives a
 * replay, while each replay generation gets a fresh bounded cursor and can intentionally replay
 * the same deterministic effects.
 */
export class PresentationEventStreams {
  constructor() {
    this.cursors = new Map([[LIVE_EVENT_STREAM_ID, 0]]);
    this.activeStreamId = LIVE_EVENT_STREAM_ID;
  }

  consume(streamId, events) {
    const id = safeStreamId(streamId);
    const streamChanged = this.switchTo(id);
    const consumed = [];
    const cursor = consumeRecentEvents(events, this.cursors.get(id) ?? 0,
      (event) => consumed.push(event));
    this.cursors.set(id, cursor);
    return Object.freeze({
      streamId: id,
      streamChanged,
      cursor,
      events: Object.freeze(consumed),
    });
  }

  switchTo(streamId) {
    const id = safeStreamId(streamId);
    const changed = id !== this.activeStreamId;
    if (changed && id !== LIVE_EVENT_STREAM_ID) {
      for (const existing of this.cursors.keys()) {
        if (existing !== LIVE_EVENT_STREAM_ID && existing !== id) this.cursors.delete(existing);
      }
    }
    this.activeStreamId = id;
    if (!this.cursors.has(id)) this.cursors.set(id, 0);
    return changed;
  }

  cursor(streamId = this.activeStreamId) {
    return this.cursors.get(safeStreamId(streamId)) ?? 0;
  }
}

/**
 * Terminal physics can emit IMPACT then DESTROYED in one completed tick. That is one visual burst,
 * while an airborne destruction and a later surface impact are two distinct physical events.
 */
export function terminalVisualEvents(events) {
  if (!Array.isArray(events) || events.length === 0) return Object.freeze([]);
  const impacts = new Set(events
    .filter((event) => event?.type === "IMPACT")
    .map((event) => `${event.target ?? "NONE"}:${event.tick ?? -1}`));
  return Object.freeze(events.filter((event) => {
    if (event?.type === "IMPACT") return event.surface !== "SIMULATION_BOUNDARY";
    if (event?.type !== "DESTROYED") return false;
    return !impacts.has(`${event.target ?? "NONE"}:${event.tick ?? -1}`);
  }));
}

/** Convert an authoritative simulation vector into the renderer's Z-flipped world frame. */
export function presentationVector(value) {
  const components = Array.isArray(value)
    ? value
    : value && typeof value === "object" ? [value.x, value.y, value.z] : null;
  if (!components || components.length !== 3 || !components.every(Number.isFinite)) return null;
  return Object.freeze([components[0], components[1], -components[2]]);
}
