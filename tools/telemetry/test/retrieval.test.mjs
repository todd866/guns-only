import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { main as downloadMain } from "../download.mjs";
import { main as listMain } from "../list.mjs";
import {
  DEFAULT_MAX_BLOB_BYTES,
  downloadBlob,
  listTelemetryBlobs,
  MAX_LIST_LIMIT,
  metadataPathFor,
} from "../retrieval.mjs";

const BLOB_URL = "https://store.private.blob.vercel-storage.com/telemetry/session/chunk.jsonl.gz";
const TEST_TOKEN = "vercel_blob_rw_test_store_do_not_print";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function temporaryDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), "guns-telemetry-retrieval-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

test("a missing blob uses one full GET, verifies it, and installs it atomically", async (t) => {
  const directory = await temporaryDirectory(t);
  const outputPath = join(directory, "chunk.jsonl.gz");
  const contents = Buffer.from("bounded gzip fixture bytes");
  const calls = [];
  let releaseRemainder;
  let streamPaused;
  const remainderGate = new Promise((resolve) => { releaseRemainder = resolve; });
  const streamPausedGate = new Promise((resolve) => { streamPaused = resolve; });
  let pullCount = 0;

  const body = new ReadableStream({
    async pull(controller) {
      if (pullCount === 0) {
        pullCount += 1;
        controller.enqueue(contents.subarray(0, 8));
        return;
      }
      streamPaused();
      await remainderGate;
      controller.enqueue(contents.subarray(8));
      controller.close();
    },
  });

  const download = downloadBlob({
    url: BLOB_URL,
    outputPath,
    token: TEST_TOKEN,
    expectedSize: contents.byteLength,
    expectedSha256: sha256(contents),
    expectedEtag: "fixture-etag",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(body, {
        status: 200,
        headers: {
          "content-length": String(contents.byteLength),
          etag: '"fixture-etag"',
        },
      });
    },
  });

  await streamPausedGate;
  const finalExistedDuringStream = await exists(outputPath);
  const interimNames = await readdir(directory);
  releaseRemainder();
  assert.equal(finalExistedDuringStream, false, "final path must not expose a partial body");
  assert.ok(interimNames.some((name) => name.endsWith(".partial")));

  const result = await download;
  assert.equal(result.status, "downloaded");
  assert.equal(result.size, contents.byteLength);
  assert.equal(result.sha256, sha256(contents));
  assert.deepEqual(await readFile(outputPath), contents);

  assert.equal(calls.length, 1);
  const [{ url, options }] = calls;
  assert.equal(url.href, BLOB_URL);
  assert.equal(options.method, "GET");
  assert.equal(options.redirect, "error");
  assert.equal(options.headers.Range, undefined);
  assert.equal(options.headers.Authorization, `Bearer ${TEST_TOKEN}`);

  const metadataText = await readFile(metadataPathFor(outputPath), "utf8");
  assert.doesNotMatch(metadataText, new RegExp(TEST_TOKEN));
  const metadata = JSON.parse(metadataText);
  assert.equal(metadata.sourceUrl, BLOB_URL);
  assert.equal(metadata.size, contents.byteLength);
  assert.equal(metadata.sha256, sha256(contents));
  assert.equal(metadata.etag, '"fixture-etag"');
  assert.deepEqual((await readdir(directory)).filter((name) => name.endsWith(".partial")), []);
});

test("verified metadata cache reuse performs no GET and needs no token", async (t) => {
  const directory = await temporaryDirectory(t);
  const outputPath = join(directory, "cached.jsonl.gz");
  const contents = Buffer.from("cache me once");
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    return new Response(contents, {
      status: 200,
      headers: { etag: '"cache-v1"' },
    });
  };

  await downloadBlob({ url: BLOB_URL, outputPath, token: TEST_TOKEN, fetchImpl });
  const cached = await downloadBlob({
    url: BLOB_URL,
    outputPath,
    token: undefined,
    fetchImpl: async () => {
      throw new Error("cache hit must not fetch");
    },
  });

  assert.equal(fetchCalls, 1);
  assert.equal(cached.status, "cached");
  assert.equal(cached.sha256, sha256(contents));
});

test("an explicit skip sends no GET but still honors supplied local validators", async (t) => {
  const directory = await temporaryDirectory(t);
  const outputPath = join(directory, "operator-owned.jsonl.gz");
  const contents = Buffer.from("leave this alone");
  await writeFile(outputPath, contents);
  let fetchCalls = 0;

  const result = await downloadBlob({
    url: BLOB_URL,
    outputPath,
    skipExisting: true,
    expectedSize: contents.byteLength,
    expectedSha256: sha256(contents),
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("must not fetch");
    },
  });

  assert.equal(result.status, "skipped-explicitly");
  assert.equal(result.sha256, sha256(contents));
  assert.equal(fetchCalls, 0);
  assert.deepEqual(await readFile(outputPath), contents);

  await assert.rejects(downloadBlob({
    url: BLOB_URL,
    outputPath,
    skipExisting: true,
    expectedSize: contents.byteLength + 1,
    fetchImpl: async () => { fetchCalls += 1; },
  }), /does not match the expected size/);
  assert.equal(fetchCalls, 0);
});

test("an unknown existing output fails closed before any GET", async (t) => {
  const directory = await temporaryDirectory(t);
  const outputPath = join(directory, "unknown.jsonl.gz");
  await writeFile(outputPath, "unknown provenance");
  let fetchCalls = 0;

  await assert.rejects(downloadBlob({
    url: BLOB_URL,
    outputPath,
    token: TEST_TOKEN,
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response("replacement");
    },
  }), /no matching cache metadata/);
  assert.equal(fetchCalls, 0);
  assert.equal(await readFile(outputPath, "utf8"), "unknown provenance");
});

test("oversized Content-Length is rejected before response streaming", async (t) => {
  const directory = await temporaryDirectory(t);
  const outputPath = join(directory, "too-large.jsonl");
  let fetchCalls = 0;
  let bodyCancellations = 0;

  await assert.rejects(downloadBlob({
    url: BLOB_URL,
    outputPath,
    token: TEST_TOKEN,
    maxBytes: 8,
    fetchImpl: async () => {
      fetchCalls += 1;
      return {
        status: 200,
        headers: new Headers({ "content-length": "9" }),
        body: { cancel: async () => { bodyCancellations += 1; } },
      };
    },
  }), /Content-Length 9 exceeds the 8-byte maximum/);

  assert.equal(fetchCalls, 1);
  assert.equal(bodyCancellations, 1);
  assert.equal(await exists(outputPath), false);
  assert.deepEqual(await readdir(directory), []);
});

test("a lengthless stream is stopped and its partial file removed at the byte cap", async (t) => {
  const directory = await temporaryDirectory(t);
  const outputPath = join(directory, "stream-too-large.jsonl");
  let fetchCalls = 0;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3, 4]));
      controller.enqueue(new Uint8Array([5, 6, 7, 8]));
      controller.close();
    },
  });

  await assert.rejects(downloadBlob({
    url: BLOB_URL,
    outputPath,
    token: TEST_TOKEN,
    maxBytes: 6,
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response(body, { status: 200 });
    },
  }), /stream exceeds the 6-byte maximum/);

  assert.equal(fetchCalls, 1);
  assert.equal(await exists(outputPath), false);
  assert.deepEqual(await readdir(directory), []);
});

test("expected size, ETag, and checksum mismatches fail without installing a file", async (t) => {
  const directory = await temporaryDirectory(t);
  const cases = [
    {
      name: "size",
      options: { expectedSize: 4 },
      response: () => new Response("abc", {
        status: 200,
        headers: { "content-length": "3" },
      }),
      pattern: /does not match expected size/,
    },
    {
      name: "etag",
      options: { expectedEtag: "wanted" },
      response: () => new Response("abc", { status: 200, headers: { etag: '"other"' } }),
      pattern: /ETag does not match/,
    },
    {
      name: "sha",
      options: { expectedSha256: sha256("wanted") },
      response: () => new Response("abc", { status: 200 }),
      pattern: /does not match the expected SHA-256/,
    },
  ];

  for (const fixture of cases) {
    const outputPath = join(directory, `${fixture.name}.jsonl`);
    let fetchCalls = 0;
    await assert.rejects(downloadBlob({
      url: BLOB_URL,
      outputPath,
      token: TEST_TOKEN,
      ...fixture.options,
      fetchImpl: async () => {
        fetchCalls += 1;
        return fixture.response();
      },
    }), fixture.pattern);
    assert.equal(fetchCalls, 1);
    assert.equal(await exists(outputPath), false);
  }
  assert.deepEqual((await readdir(directory)).filter((name) => name.endsWith(".partial")), []);
});

test("network failures are not retried and cannot echo the token", async (t) => {
  const directory = await temporaryDirectory(t);
  let fetchCalls = 0;
  let thrown;
  try {
    await downloadBlob({
      url: BLOB_URL,
      outputPath: join(directory, "network-failure.jsonl"),
      token: TEST_TOKEN,
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error(`upstream included ${TEST_TOKEN}`);
      },
    });
  } catch (error) {
    thrown = error;
  }

  assert.equal(fetchCalls, 1);
  assert.match(thrown.message, /no retry was attempted/);
  assert.doesNotMatch(thrown.message, new RegExp(TEST_TOKEN));
});

test("a timed-out GET is aborted once and is never retried", async (t) => {
  const directory = await temporaryDirectory(t);
  let fetchCalls = 0;
  await assert.rejects(downloadBlob({
    url: BLOB_URL,
    outputPath: join(directory, "timeout.jsonl"),
    token: TEST_TOKEN,
    timeoutMs: 5,
    fetchImpl: async (_url, { signal }) => {
      fetchCalls += 1;
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    },
  }), /timed out; no retry was attempted/);
  assert.equal(fetchCalls, 1);
});

test("non-Vercel URLs are rejected before the authorization token can be sent", async (t) => {
  const directory = await temporaryDirectory(t);
  let fetchCalls = 0;
  await assert.rejects(downloadBlob({
    url: "https://blob.vercel-storage.com.attacker.example/steal",
    outputPath: join(directory, "never-created"),
    token: TEST_TOKEN,
    fetchImpl: async () => { fetchCalls += 1; },
  }), /must be an HTTPS vercel-storage.com Blob URL/);
  assert.equal(fetchCalls, 0);
});

test("listing is one explicit bounded metadata GET and never auto-paginates", async () => {
  const prefix = "telemetry/session/";
  const payload = {
    blobs: [
      {
        pathname: `${prefix}a.jsonl.gz`,
        url: `https://store.private.blob.vercel-storage.com/${prefix}a.jsonl.gz`,
        downloadUrl: `https://store.private.blob.vercel-storage.com/${prefix}a.jsonl.gz?download=1`,
        size: 123,
        uploadedAt: "2026-07-19T12:00:00.000Z",
        etag: '"a"',
      },
      {
        pathname: `${prefix}b.jsonl.gz`,
        url: `https://store.private.blob.vercel-storage.com/${prefix}b.jsonl.gz`,
        size: 456,
        uploadedAt: "2026-07-19T12:01:00.000Z",
        etag: '"b"',
      },
    ],
    hasMore: true,
    cursor: "next-page",
  };
  const bytes = Buffer.from(JSON.stringify(payload));
  const calls = [];

  const result = await listTelemetryBlobs({
    token: TEST_TOKEN,
    prefix,
    limit: 2,
    cursor: "this-page",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(bytes, {
        status: 200,
        headers: { "content-length": String(bytes.byteLength) },
      });
    },
  });

  assert.equal(calls.length, 1);
  const [{ url, options }] = calls;
  assert.equal(url.origin, "https://blob.vercel-storage.com");
  assert.equal(url.searchParams.get("prefix"), prefix);
  assert.equal(url.searchParams.get("limit"), "2");
  assert.equal(url.searchParams.get("cursor"), "this-page");
  assert.equal(url.searchParams.get("mode"), "expanded");
  assert.equal(options.method, "GET");
  assert.equal(options.redirect, "error");
  assert.equal(options.headers.Range, undefined);
  assert.equal(options.headers["x-api-version"], "12");
  assert.equal(result.blobs.length, 2);
  assert.equal(result.hasMore, true);
  assert.equal(result.cursor, "next-page");
  assert.equal(result.autoPaginated, false);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(TEST_TOKEN));
});

test("invalid list scope and limits fail before a list request", async () => {
  let fetchCalls = 0;
  const fetchImpl = async () => { fetchCalls += 1; };
  await assert.rejects(listTelemetryBlobs({
    token: TEST_TOKEN,
    prefix: "other-data/",
    fetchImpl,
  }), /prefix must start with telemetry\//);
  await assert.rejects(listTelemetryBlobs({
    token: TEST_TOKEN,
    limit: MAX_LIST_LIMIT + 1,
    fetchImpl,
  }), /cannot exceed/);
  assert.equal(fetchCalls, 0);
});

test("list response size is capped from Content-Length before JSON streaming", async () => {
  let fetchCalls = 0;
  let bodyCancellations = 0;
  await assert.rejects(listTelemetryBlobs({
    token: TEST_TOKEN,
    maxResponseBytes: 16,
    fetchImpl: async () => {
      fetchCalls += 1;
      return {
        status: 200,
        headers: new Headers({ "content-length": "17" }),
        body: { cancel: async () => { bodyCancellations += 1; } },
      };
    },
  }), /Content-Length exceeds the 16-byte maximum/);
  assert.equal(fetchCalls, 1);
  assert.equal(bodyCancellations, 1);
});

test("a list response without Content-Length is also capped while streaming", async () => {
  let fetchCalls = 0;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"blobs":['));
      controller.enqueue(new TextEncoder().encode('                    '));
      controller.close();
    },
  });
  await assert.rejects(listTelemetryBlobs({
    token: TEST_TOKEN,
    maxResponseBytes: 16,
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response(body, { status: 200 });
    },
  }), /list response exceeds the 16-byte maximum/);
  assert.equal(fetchCalls, 1);
});

test("safe defaults cover old 100 MiB monoliths and CLI help forbids browser downloads", async () => {
  assert.ok(DEFAULT_MAX_BLOB_BYTES > 100 * 1024 * 1024);
  assert.ok(DEFAULT_MAX_BLOB_BYTES < 512 * 1024 * 1024);

  const output = [];
  const errors = [];
  const io = {
    log: (value) => output.push(String(value)),
    error: (value) => errors.push(String(value)),
  };
  await downloadMain(["--help"], { BLOB_READ_WRITE_TOKEN: TEST_TOKEN }, io);
  await listMain(["--help"], { BLOB_READ_WRITE_TOKEN: TEST_TOKEN }, io);
  const help = output.join("\n");
  assert.match(help, /Never (?:download|browse or download) telemetry through the Vercel dashboard/);
  assert.match(help, /Codex Chrome bridge/);
  assert.doesNotMatch(help, new RegExp(TEST_TOKEN));
  assert.deepEqual(errors, []);
});
