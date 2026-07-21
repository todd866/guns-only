# Deployed telemetry setup

The function in `api/telemetry.js` uses Vercel Blob's HTTP API directly, so this static deployment
does not need a `package.json`, an npm install, or a build step. The browser samples the 120 Hz
authority at 20 Hz and losslessly omits unchanged retained snapshot fields between two-second
keyframes. It
uploads one immutable chunk every 30 seconds and keeps only one upload in flight. Failed uploads
retain a bounded recent trace and back off exponentially, up to five minutes, rather than
hammering a broken endpoint.
Each successful flush is byte-bounded in the browser, gzip-compressed, and stored as an immutable
private chunk at `telemetry/<session>/<batch-id>.jsonl.gz`; the browser retains that batch ID and
exact request body across transport/storage retries. An already-existing path is therefore a
successful idempotent retry rather than a duplicate object. Chunks are
decompressed and concatenated offline when a full flight trace is needed. The function accepts only
same-origin hosted browser requests with `Content-Type: application/json`, rejects originless writes
on production and preview deployments, and caps the declared, streamed, row-count, and uncompressed
payload sizes. A hidden/pagehide event makes a best-effort immediate tail upload; browsers still do
not guarantee ordinary fetch delivery during final teardown.

The release number is declared in `render/release/release_identity.js` and `api/build-info.js`; the
`?v=` value on the `app.js` entry in `index.html` is an independent cache key used to detect a
mixed shell/module graph. Keep all three values equal and monotonically increasing across
production releases. Production telemetry adds the Vercel revision and deployment identity, so
two deployments of the same human-facing build can still be distinguished. The briefing/debrief
surface warns about a stale or mixed tab and blocks only the next sortie until it is reloaded.

`vercel.json` gives a one-year immutable browser cache only to heavy pack art requested with its
manifest SHA-256 query (`?sha256=<64 hex characters>`). Direct unversioned art, app/HUD modules,
Blazor/WASM resources, and pack JSON keep Vercel's revalidation behavior.

## One required dashboard step

In the Vercel dashboard, open the **guns-only** project, go to **Storage**, create a **private Blob
store**, and connect it to the project/Production environment. Vercel must expose the resulting
`BLOB_READ_WRITE_TOKEN` environment variable to the project. Redeploy after connecting the store so
the production function receives the variable. Do not put the token in this repository or browser
code.

Deploy only through the repository's guarded publish command:

```sh
bin/deploy-web --prod
```

Do **not** run Vercel from the checked-in `web/wwwroot` directory. That source tree contains the
shell but not the generated `_framework` WebAssembly runtime, producing a superficially healthy
deployment whose flight kernel can never start. `bin/deploy-web` performs a Release publish in an
isolated directory, requires the loader and boot manifest, rejects leaked test files, smoke-tests
the deployment, and promotes it only after those checks pass.

Because the API functions and `vercel.json` live inside `web/wwwroot`, the publish artifact includes
them. At the deploy root Vercel discovers the write endpoint, public build-provenance endpoint, and
production-only operator endpoint under `/api`; `vercel.json` provides the stable `/telemetry` and
`/telemetry-admin` rewrites, while the shell reads build provenance from `/api/build-info`. The
local Python telemetry server still handles
`/telemetry` directly and continues writing JSONL files to disk.

## Verify production capture

First smoke-test the deployed rewrite. A configured deployment returns `204` only after Blob accepts
the immutable object (or confirms that the same batch already exists). Invalid requests return
`400`, oversized requests return `413`, and configuration/storage outages return `503`, allowing the
browser to retain the exact pending batch and back off. Complete the Blob check below as well:

The Origin check prevents browser cross-site writes; it is provenance, not authentication, because
a command-line caller can supply the same header. Production must therefore keep a Vercel Firewall
per-IP rate limit on `POST /telemetry`, a spend alert, and an operator kill switch. The function also
bounds both streamed and Vercel-preparsed request envelopes, including requests without
`Content-Length`.

```sh
curl -i -X POST 'https://guns-only.vercel.app/telemetry' \
  -H 'Origin: https://guns-only.vercel.app' \
  -H 'Content-Type: application/json' \
  --data '{"session":"smoke-test","batchId":"batch-smoke-000001","rows":[{"k":"hdr","build":"smoke"}]}'
```

Fly the deployed game for several seconds, then use the repository's bounded local operator tool.
Load the separate read-only operator credential from Keychain; do not export the Blob store's
master token. The list operation returns at most 50 items here and never auto-paginates:

```sh
export TELEMETRY_ADMIN_TOKEN="$(security find-generic-password -w \
  -a iantodd -s com.gunsonly.telemetry-admin)"
node tools/telemetry/admin.mjs list \
  --prefix 'telemetry/' --limit 50 \
  --output '/tmp/guns-only-telemetry-page.json'
```

Review that JSON locally, select one chunk, and pass its listed `url`, `size`, and `etag` to the
single-blob downloader:

```sh
node tools/telemetry/admin.mjs get \
  --url 'PASTE_ONE_LISTED_BLOB_URL_HERE' \
  --output '/tmp/flight-chunk.jsonl.gz' \
  --expected-size LISTED_SIZE \
  --etag 'LISTED_ETAG'
unset TELEMETRY_ADMIN_TOKEN
```

The operator endpoint and downloader together perform exactly one GET for a selected missing blob,
never use `HEAD` or `Range`, never follow redirects or retry, cap bytes before and during streaming,
verify supplied metadata, and atomically install the completed file. A verified local cache hit
performs no request. The endpoint is production-only, bearer-authenticated, uncached, and has no
CORS grant; the Blob master token remains inside Vercel.

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
