// Hot snapshot bridge: merges the kernel's per-frame numeric buffer onto the low-rate JSON
// snapshot so the render loop stops paying JSON.stringify/parse on every frame.
//
// Contract (see web/SnapshotHotFrame.cs, pinned by sim.Tests golden tests):
// - The buffer layout arrives once as JSON: blocks of named slots (number/boolean/nullable),
//   optional per-block presence slots, and two fixed-capacity tracer regions.
// - Slot values are quantized kernel-side to the same precision the JSON emits, so a decoded
//   field is bit-identical to what JSON.parse would have produced.
// - Slot 0 is cold_version: it bumps whenever anything that only travels in the JSON snapshot
//   (strings, events, presence transitions) changes, so edges re-fetch the JSON that same frame.
//   A fallback interval remains the correctness backstop.
//
// Invariants the merge preserves for downstream consumers (telemetry keyframes retain state
// references for up to 30 s; the delta encoder treats key presence as a signal):
// - a FRESH top-level state object every frame — previously returned objects are never mutated;
// - key-absence semantics: slots in absent blocks are skipped, and the cold base for the current
//   beat never carries those keys (presence only changes on transitions, which bump cold_version);
// - booleans decode to real booleans, NaN sentinels decode to null.

export function parseHotLayout(layoutJson) {
  const raw = JSON.parse(layoutJson);
  return Object.freeze({
    slotCount: raw.slot_count,
    coldVersionIndex: raw.cold_version_index,
    blocks: raw.blocks.map((block) => Object.freeze({
      name: block.name,
      presenceIndex: block.presence_index,
      slots: block.slots.map((slot) => Object.freeze({
        name: slot.name,
        index: slot.index,
        kind: slot.kind,
      })),
    })),
    tracers: raw.tracers.map((tracer) => Object.freeze({
      field: tracer.field,
      countIndex: tracer.count_index,
      start: tracer.start,
      maxRounds: tracer.max_rounds,
      stride: tracer.stride,
    })),
    // Fixed-length arrays of keyed samples (the HUD's gun_trajectory funnel locus): always
    // present, decoded to [{x, y, z, r}, …] to match the JSON snapshot's shape exactly.
    sampleArrays: (raw.sample_arrays ?? []).map((sampleArray) => Object.freeze({
      field: sampleArray.field,
      start: sampleArray.start,
      samples: sampleArray.samples,
      keys: Object.freeze([...sampleArray.keys]),
    })),
  });
}

// Pure per-frame merge: spread the cold base (fresh identity), overlay hot slots, rebuild tracer
// arrays. Nested cold arrays/objects stay shared by reference — nothing downstream mutates the
// snapshot, and the cold base itself is replaced wholesale on re-fetch.
export function decodeHotFrame(layout, hot, coldBase) {
  const state = { ...coldBase };
  for (const block of layout.blocks) {
    if (block.presenceIndex >= 0 && !hot[block.presenceIndex]) continue;
    for (const slot of block.slots) {
      const value = hot[slot.index];
      if (slot.kind === "boolean") state[slot.name] = value === 1;
      else if (slot.kind === "nullable") state[slot.name] = Number.isNaN(value) ? null : value;
      else state[slot.name] = value;
    }
  }
  for (const tracer of layout.tracers) {
    const count = Math.min(hot[tracer.countIndex] | 0, tracer.maxRounds);
    const rounds = new Array(count < 0 ? 0 : count);
    for (let r = 0; r < rounds.length; r++) {
      const base = tracer.start + r * tracer.stride;
      rounds[r] = [
        hot[base], hot[base + 1], hot[base + 2],
        hot[base + 3], hot[base + 4], hot[base + 5],
      ];
    }
    state[tracer.field] = rounds;
  }
  for (const sampleArray of layout.sampleArrays) {
    const keys = sampleArray.keys;
    const samples = new Array(sampleArray.samples);
    for (let i = 0; i < samples.length; i++) {
      const base = sampleArray.start + i * keys.length;
      const sample = {};
      for (let k = 0; k < keys.length; k++) sample[keys[k]] = hot[base + k];
      samples[i] = sample;
    }
    state[sampleArray.field] = samples;
  }
  return state;
}

// Frame source owning the re-fetch policy. readHotFrame must return the buffer contents for this
// frame (the app passes a MemoryView copy); fetchColdState must parse the full JSON snapshot.
// The cold fetch runs synchronously in the same frame that observes a version bump, so the merged
// object is coherent: hot and cold both describe the current kernel state.
export function createHotSnapshotSource({
  layoutJson,
  readHotFrame,
  fetchColdState,
  fallbackMs = 250,
}) {
  const layout = parseHotLayout(layoutJson);
  let coldBase = null;
  let coldVersion = null;
  let coldAtMs = -Infinity;
  let coldFetches = 0;

  return {
    layout,
    frame(nowMs) {
      const hot = readHotFrame();
      const version = hot[layout.coldVersionIndex];
      if (coldBase === null || version !== coldVersion
        || !(nowMs - coldAtMs < fallbackMs)) {
        coldBase = fetchColdState();
        coldVersion = version;
        coldAtMs = nowMs;
        coldFetches += 1;
      }
      return decodeHotFrame(layout, hot, coldBase);
    },
    // QA/diagnostics only — lets browser automation confirm the cold path went low-rate.
    diagnostics() {
      return { coldFetches, coldVersion, coldAtMs, slotCount: layout.slotCount };
    },
  };
}
