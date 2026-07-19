# Deployed telemetry setup

The function in `api/telemetry.js` uses Vercel Blob's HTTP API directly, so this static deployment
does not need a `package.json`, an npm install, or a build step. The browser samples the 120 Hz
authority at 20 Hz, uploads one immutable chunk every 30 seconds, and keeps only one upload in
flight. Failed uploads retain a bounded recent trace and back off exponentially, up to five
minutes, rather than hammering a broken endpoint.
Each successful flush is byte-bounded in the browser, gzip-compressed, and stored as an immutable
private chunk at `telemetry/<session>/<batch-id>.jsonl.gz`; the browser retains that batch ID and
exact request body across transport/storage retries. An already-existing path is therefore a
successful idempotent retry rather than a duplicate object. Chunks are
decompressed and concatenated offline when a full flight trace is needed. The function accepts only
same-origin hosted browser requests with `Content-Type: application/json`, rejects originless writes
on production and preview deployments, and caps the declared, streamed, row-count, and uncompressed
payload sizes. A hidden/pagehide event makes a best-effort immediate tail upload; browsers still do
not guarantee ordinary fetch delivery during final teardown.

The `?v=` value on the `app.js` entry in `index.html` is also the telemetry build identity. Keep it
monotonically increasing across production deployments; bump it whenever the app/module graph
changes, and never reuse a build number from an older deployment.

`vercel.json` gives a one-year immutable browser cache only to heavy pack art requested with its
manifest SHA-256 query (`?sha256=<64 hex characters>`). Direct unversioned art, app/HUD modules,
Blazor/WASM resources, and pack JSON keep Vercel's revalidation behavior.

## One required dashboard step

In the Vercel dashboard, open the **guns-only** project, go to **Storage**, create a **private Blob
store**, and connect it to the project/Production environment. Vercel must expose the resulting
`BLOB_READ_WRITE_TOKEN` environment variable to the project. Redeploy after connecting the store so
the production function receives the variable. Do not put the token in this repository or browser
code.

Deploy from the directory that is the copy/publish output of `web/wwwroot`:

```sh
vercel deploy --prod
```

Because `api/telemetry.js` and `vercel.json` live inside `web/wwwroot`, they are included in that
copy. At the deploy root Vercel discovers `api/telemetry.js` as `/api/telemetry`; `vercel.json`
rewrites the recorder's unchanged `/telemetry` POST to it. The local Python telemetry server still
handles `/telemetry` directly and continues writing JSONL files to disk.

## Verify production capture

First smoke-test the deployed rewrite. A configured deployment returns `204` only after Blob accepts
the immutable object (or confirms that the same batch already exists). Invalid requests return
`400`, oversized requests return `413`, and configuration/storage outages return `503`, allowing the
browser to retain the exact pending batch and back off. Complete the Blob check below as well:

```sh
curl -i -X POST 'https://guns-only.vercel.app/telemetry' \
  -H 'Origin: https://guns-only.vercel.app' \
  -H 'Content-Type: application/json' \
  --data '{"session":"smoke-test","batchId":"batch-smoke-000001","rows":[{"k":"hdr","build":"smoke"}]}'
```

Fly the deployed game for several seconds, then use the repository's bounded local retrieval tools.
The list operation is separate, returns at most 50 items here, and never auto-paginates:

```sh
export BLOB_READ_WRITE_TOKEN='load-this-from-a-secure-local-source'
node tools/telemetry/list.mjs --prefix 'telemetry/' --limit 50 \
  > /tmp/guns-only-telemetry-page.json
```

Review that JSON locally, select one chunk, and pass its listed `url`, `size`, and `etag` to the
single-blob downloader:

```sh
node tools/telemetry/download.mjs \
  --url 'PASTE_ONE_LISTED_BLOB_URL_HERE' \
  --output '/tmp/flight-chunk.jsonl.gz' \
  --expected-size LISTED_SIZE \
  --etag 'LISTED_ETAG'
```

The downloader performs exactly one GET for a missing blob, never uses `HEAD` or `Range`, never
follows redirects or retries, caps bytes before and during streaming, verifies supplied metadata,
and atomically installs the completed file. A verified local cache hit performs no request.

> **Production telemetry must never be downloaded through the Vercel dashboard, a browser, the
> Codex Chrome bridge, or browser automation.** Dashboard activity was not the primary cause of the
> historical transfer incident, but these paths do not enforce the local tool's one-GET and byte-cap
> invariants. The primary incident cause was the retired one-second writer that read the entire
> growing monolithic blob before every overwrite; the immutable gzip-chunk writer removes that
> quadratic read path.

Confirm it contains one or more `hdr`/`st`/`in` rows:

```sh
gzip -dc /tmp/flight-chunk.jsonl.gz | wc -l
gzip -dc /tmp/flight-chunk.jsonl.gz | head -n 3
```

See [`tools/telemetry/README.md`](../../tools/telemetry/README.md) for cache behavior, explicit
replacement/skip controls, safe size overrides for unusual legacy blobs, and honest limitations.

If `/telemetry` returns `503`, inspect the `api/telemetry` Function logs for configuration or Blob
storage failures. A `204` means that the deterministic batch path was stored or already existed.
