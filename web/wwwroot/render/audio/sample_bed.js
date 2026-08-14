// Optional decoded recording beds for aircraft-specific presentation graphs.
//
// The recording carries recognisable cockpit machinery; the procedural graph still owns live
// power, load, wind, and configuration modulation. Beds are fetched only after their aircraft is
// selected, decoded in the already-existing shared AudioContext, and routed exclusively through
// that aircraft graph's decodedBedInput. A missing or undecodable file is therefore silent and
// recoverable rather than fatal to flight audio.

export const SAMPLE_BED_BUILD = "330";
export const SAMPLE_BED_RETRY_MS = 30_000;

function stampedUrl(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  url.searchParams.set("v", SAMPLE_BED_BUILD);
  return url.href;
}

export const F14_COCKPIT_SAMPLE_BED = Object.freeze({
  id: "f14-fa18-cockpit-surrogate",
  url: stampedUrl("./samples/jet/fa18_cockpit_f14_surrogate_loop.wav"),
});

export const COBRA_COCKPIT_SAMPLE_BED = Object.freeze({
  id: "cobra-uh1h-t53-surrogate",
  url: stampedUrl("./samples/rotorcraft/uh1h_t53_ah1g_surrogate_loop.wav"),
});

// AudioBuffer ownership and decode behavior vary by implementation, so buffers are deliberately
// cached per AudioContext rather than globally. Rejected loads retain only a retry timestamp; they
// never poison the success cache for the page lifetime.
const contextRecords = new WeakMap();
const inputAttachments = new WeakMap();

function recordsFor(audioContext) {
  let records = contextRecords.get(audioContext);
  if (!records) {
    records = new Map();
    contextRecords.set(audioContext, records);
  }
  return records;
}

function attachmentsFor(decodedBedInput) {
  let attachments = inputAttachments.get(decodedBedInput);
  if (!attachments) {
    attachments = new Map();
    inputAttachments.set(decodedBedInput, attachments);
  }
  return attachments;
}

function monotonicNowMs() {
  const now = globalThis.performance?.now?.();
  return Number.isFinite(now) ? now : Date.now();
}

function runtimeOrigin() {
  const documentOrigin = String(globalThis.location?.origin ?? "");
  if (documentOrigin && documentOrigin !== "null") return documentOrigin;
  return new URL(import.meta.url).origin;
}

/** Reject an unversioned or cross-origin recording before it can reach fetch(). */
export function validateSampleBedUrl(value, {
  origin = runtimeOrigin(),
  build = SAMPLE_BED_BUILD,
} = {}) {
  const url = new URL(String(value), import.meta.url);
  if (url.origin !== origin)
    throw new TypeError("aircraft sample beds must be same-origin");
  if (url.searchParams.get("v") !== String(build))
    throw new TypeError("aircraft sample beds must carry the current release stamp");
  return url;
}

function decodeAudioBuffer(audioContext, bytes) {
  // slice() protects the fetch-owned buffer for WebKit implementations that detach their input.
  return audioContext.decodeAudioData(bytes.slice(0));
}

/**
 * Fetch and decode one immutable, build-stamped bed.
 *
 * Concurrent callers share an in-flight promise. Success is cached for this AudioContext. A
 * rejection is allowed to retry after a bounded cooldown so a temporary offline/cache failure can
 * recover without turning a 60/120 Hz render loop into a request storm.
 */
export function loadSampleBed(audioContext, definition, {
  fetchImpl = globalThis.fetch,
  nowMs = monotonicNowMs,
  retryMs = SAMPLE_BED_RETRY_MS,
  origin = runtimeOrigin(),
} = {}) {
  if (!audioContext?.decodeAudioData || typeof fetchImpl !== "function")
    return Promise.reject(new TypeError("sample-bed decoding is unavailable"));
  const id = String(definition?.id ?? "").trim();
  if (!id) return Promise.reject(new TypeError("sample-bed id is required"));

  let url;
  try {
    url = validateSampleBedUrl(definition?.url, { origin });
  } catch (error) {
    return Promise.reject(error);
  }

  const records = recordsFor(audioContext);
  const existing = records.get(id);
  if (existing?.buffer) return Promise.resolve(existing.buffer);
  if (existing?.promise) return existing.promise;
  const now = Number(nowMs());
  if (Number.isFinite(existing?.retryAtMs)
    && Number.isFinite(now)
    && now < existing.retryAtMs) {
    return Promise.resolve(null);
  }

  const request = Promise.resolve().then(async () => {
    const response = await fetchImpl(url.href, Object.freeze({
      method: "GET",
      mode: "same-origin",
      credentials: "same-origin",
      cache: "force-cache",
    }));
    if (!response?.ok || (response.status != null && Number(response.status) !== 200))
      throw new Error(`sample-bed HTTP ${response?.status ?? "failure"}`);
    if (response.url) validateSampleBedUrl(response.url, { origin });
    const raw = await response.arrayBuffer();
    const buffer = await decodeAudioBuffer(audioContext, raw);
    if (!buffer) throw new Error("sample-bed decode returned no AudioBuffer");
    records.set(id, { buffer });
    return buffer;
  }).catch((error) => {
    const failedAt = Number(nowMs());
    records.set(id, {
      retryAtMs: (Number.isFinite(failedAt) ? failedAt : 0) + Math.max(0, Number(retryMs) || 0),
    });
    throw error;
  });
  records.set(id, { promise: request });
  return request;
}

function setAt(parameter, value, at) {
  if (typeof parameter?.setValueAtTime === "function") parameter.setValueAtTime(value, at);
  else if (parameter) parameter.value = value;
}

function target(parameter, value, at, timeConstant) {
  if (typeof parameter?.setTargetAtTime === "function")
    parameter.setTargetAtTime(value, at, timeConstant);
  else if (parameter) parameter.value = value;
}

/**
 * Attach exactly one page-lifetime loop for this bed/input pair.
 *
 * Its only route is source -> fade gain -> graph.decodedBedInput. The fade starts at true zero so
 * an asynchronously completed decode cannot click or jump around the graph's own state envelope.
 */
export function attachLoopingSampleBed(audioContext, decodedBedInput, definition, buffer, {
  fadeTimeConstant = 0.12,
} = {}) {
  if (!audioContext?.createBufferSource || !audioContext?.createGain
    || !decodedBedInput || !buffer) return null;
  const id = String(definition?.id ?? "").trim();
  if (!id) return null;
  const attachments = attachmentsFor(decodedBedInput);
  const existing = attachments.get(id);
  if (existing) return existing;

  const now = Number.isFinite(audioContext.currentTime) ? audioContext.currentTime : 0;
  const fade = audioContext.createGain();
  setAt(fade.gain, 0, now);
  fade.connect(decodedBedInput);
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  if (source.playbackRate) source.playbackRate.value = 1;
  source.connect(fade);
  source.start(now);
  target(fade.gain, 1, now, Math.max(0.01, Number(fadeTimeConstant) || 0.12));

  const attachment = Object.freeze({ id, source, fade, input: decodedBedInput });
  attachments.set(id, attachment);
  return attachment;
}

/** Load, decode, and attach one optional loop. Call only from the selected aircraft branch. */
export async function ensureLoopingSampleBed(audioContext, voiceGraph, definition, options = {}) {
  const input = voiceGraph?.decodedBedInput;
  if (!input) return null;
  const existing = attachmentsFor(input).get(String(definition?.id ?? ""));
  if (existing) return existing;
  const buffer = await loadSampleBed(audioContext, definition, options);
  if (!buffer) return null;
  return attachLoopingSampleBed(audioContext, input, definition, buffer, options);
}
