import assert from "node:assert/strict";
import test from "node:test";

import {
  COBRA_COCKPIT_SAMPLE_BED,
  F14_COCKPIT_SAMPLE_BED,
  SAMPLE_BED_BUILD,
  attachLoopingSampleBed,
  ensureLoopingSampleBed,
  loadSampleBed,
  validateSampleBedUrl,
} from "../sample_bed.js";

const ORIGIN = "https://guns-only.test";
const DEFINITION = Object.freeze({
  id: "test-bed",
  url: `${ORIGIN}/render/audio/samples/test_loop.wav?v=${SAMPLE_BED_BUILD}`,
});

class FakeAudioParam {
  constructor(value = 0) {
    this.value = value;
    this.events = [];
  }
  setValueAtTime(value, at) {
    this.value = value;
    this.events.push({ kind: "set", value, at });
  }
  setTargetAtTime(value, at, timeConstant) {
    this.value = value;
    this.events.push({ kind: "target", value, at, timeConstant });
  }
}

class FakeAudioNode {
  constructor(kind) {
    this.kind = kind;
    this.connections = [];
    this.gain = new FakeAudioParam();
    this.playbackRate = new FakeAudioParam(1);
    this.loop = false;
    this.buffer = null;
    this.starts = [];
  }
  connect(destination) {
    this.connections.push(destination);
    return destination;
  }
  start(at) { this.starts.push(at); }
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 12.5;
    this.created = [];
    this.decodeCalls = 0;
  }
  createGain() {
    const node = new FakeAudioNode("gain");
    this.created.push(node);
    return node;
  }
  createBufferSource() {
    const node = new FakeAudioNode("buffer-source");
    this.created.push(node);
    return node;
  }
  async decodeAudioData(bytes) {
    this.decodeCalls += 1;
    return Object.freeze({ context: this, byteLength: bytes.byteLength });
  }
}

function response(bytes = new Uint8Array([1, 2, 3, 4]), url = DEFINITION.url) {
  return {
    ok: true,
    status: 200,
    url,
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}

test("publishes honest same-origin build-stamped aircraft bed paths", () => {
  assert.equal(SAMPLE_BED_BUILD, "328",
    "aircraft sample beds must advance with the canonical release identity");
  const f14 = new URL(F14_COCKPIT_SAMPLE_BED.url);
  const cobra = new URL(COBRA_COCKPIT_SAMPLE_BED.url);
  assert.equal(f14.pathname.endsWith(
    "/samples/jet/fa18_cockpit_f14_surrogate_loop.wav"), true);
  assert.equal(cobra.pathname.endsWith(
    "/samples/rotorcraft/uh1h_t53_ah1g_surrogate_loop.wav"), true);
  assert.equal(f14.search, `?v=${SAMPLE_BED_BUILD}`);
  assert.equal(cobra.search, `?v=${SAMPLE_BED_BUILD}`);

  assert.equal(validateSampleBedUrl(DEFINITION.url, { origin: ORIGIN }).href, DEFINITION.url);
  assert.throws(() => validateSampleBedUrl(
    `https://cdn.example/render/audio/test.wav?v=${SAMPLE_BED_BUILD}`,
    { origin: ORIGIN },
  ), /same-origin/);
  assert.throws(() => validateSampleBedUrl(
    `${ORIGIN}/render/audio/test.wav`,
    { origin: ORIGIN },
  ), /release stamp/);
});

test("shares one in-flight decode and caches success per AudioContext", async () => {
  const firstContext = new FakeAudioContext();
  let fetchCalls = 0;
  const requests = [];
  const fetchImpl = async (url, options) => {
    fetchCalls += 1;
    requests.push({ url, options });
    await Promise.resolve();
    return response();
  };

  const first = loadSampleBed(firstContext, DEFINITION, { fetchImpl, origin: ORIGIN });
  const concurrent = loadSampleBed(firstContext, DEFINITION, { fetchImpl, origin: ORIGIN });
  assert.strictEqual(first, concurrent, "concurrent callers share the exact in-flight promise");
  const [firstBuffer, concurrentBuffer] = await Promise.all([first, concurrent]);
  assert.strictEqual(firstBuffer, concurrentBuffer);
  assert.equal(fetchCalls, 1);
  assert.equal(firstContext.decodeCalls, 1);
  assert.deepEqual(requests[0], {
    url: DEFINITION.url,
    options: {
      method: "GET",
      mode: "same-origin",
      credentials: "same-origin",
      cache: "force-cache",
    },
  });

  assert.strictEqual(
    await loadSampleBed(firstContext, DEFINITION, { fetchImpl, origin: ORIGIN }),
    firstBuffer,
  );
  assert.equal(fetchCalls, 1, "a successful decode is reused within its AudioContext");

  const secondContext = new FakeAudioContext();
  const secondBuffer = await loadSampleBed(secondContext, DEFINITION, {
    fetchImpl,
    origin: ORIGIN,
  });
  assert.notStrictEqual(secondBuffer, firstBuffer);
  assert.equal(fetchCalls, 2, "a different AudioContext gets its own decoded buffer");
  assert.equal(secondContext.decodeCalls, 1);
});

test("a rejected load cools down, then retries instead of poisoning the cache", async () => {
  const audio = new FakeAudioContext();
  let timeMs = 1_000;
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    if (fetchCalls === 1) throw new Error("temporarily offline");
    return response();
  };
  const options = {
    fetchImpl,
    origin: ORIGIN,
    nowMs: () => timeMs,
    retryMs: 30_000,
  };

  await assert.rejects(loadSampleBed(audio, DEFINITION, options), /temporarily offline/);
  assert.equal(await loadSampleBed(audio, DEFINITION, options), null,
    "render-rate calls during cooldown neither throw nor start another request");
  assert.equal(fetchCalls, 1);

  timeMs += 30_000;
  const recovered = await loadSampleBed(audio, DEFINITION, options);
  assert.ok(recovered);
  assert.equal(fetchCalls, 2);
  assert.equal(audio.decodeCalls, 1);
});

test("rejects redirected final responses that lose origin or release identity", async () => {
  for (const finalUrl of [
    `https://cdn.example/render/audio/test_loop.wav?v=${SAMPLE_BED_BUILD}`,
    `${ORIGIN}/render/audio/samples/test_loop.wav`,
  ]) {
    const audio = new FakeAudioContext();
    let fetchCalls = 0;
    const options = {
      origin: ORIGIN,
      nowMs: () => 500,
      fetchImpl: async () => {
        fetchCalls += 1;
        return response(new Uint8Array([1]), finalUrl);
      },
    };
    await assert.rejects(loadSampleBed(audio, DEFINITION, options),
      /same-origin|release stamp/);
    assert.equal(audio.decodeCalls, 0,
      "a redirected response is revalidated before untrusted bytes are decoded");
    assert.equal(await loadSampleBed(audio, DEFINITION, options), null,
      "a rejected final URL enters the same bounded retry window");
    assert.equal(fetchCalls, 1);
  }
});

test("attaches one zero-started looping source only through decodedBedInput", async () => {
  const audio = new FakeAudioContext();
  const decodedBedInput = new FakeAudioNode("decoded-bed-input");
  const buffer = Object.freeze({ name: "decoded" });

  const first = attachLoopingSampleBed(
    audio,
    decodedBedInput,
    DEFINITION,
    buffer,
  );
  const duplicate = attachLoopingSampleBed(
    audio,
    decodedBedInput,
    DEFINITION,
    buffer,
  );
  assert.strictEqual(first, duplicate);
  assert.equal(audio.created.filter((node) => node.kind === "buffer-source").length, 1);
  assert.equal(first.source.buffer, buffer);
  assert.equal(first.source.loop, true);
  assert.deepEqual(first.source.starts, [audio.currentTime]);
  assert.deepEqual(first.source.connections, [first.fade]);
  assert.deepEqual(first.fade.connections, [decodedBedInput]);
  assert.deepEqual(first.fade.gain.events, [
    { kind: "set", value: 0, at: audio.currentTime },
    { kind: "target", value: 1, at: audio.currentTime, timeConstant: 0.12 },
  ]);
});

test("ensure remains allocation-free until called and deduplicates its graph attachment", async () => {
  const audio = new FakeAudioContext();
  const graph = { decodedBedInput: new FakeAudioNode("decoded-bed-input") };
  let fetchCalls = 0;
  assert.equal(audio.created.length, 0,
    "importing the loader alone does not allocate or fetch an aircraft recording");
  const options = {
    origin: ORIGIN,
    fetchImpl: async () => {
      fetchCalls += 1;
      return response();
    },
  };

  const [first, second] = await Promise.all([
    ensureLoopingSampleBed(audio, graph, DEFINITION, options),
    ensureLoopingSampleBed(audio, graph, DEFINITION, options),
  ]);
  assert.strictEqual(first, second);
  assert.equal(fetchCalls, 1);
  assert.equal(audio.created.filter((node) => node.kind === "buffer-source").length, 1);
});
