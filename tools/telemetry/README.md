# Safe production telemetry retrieval

Use these dependency-free Node.js tools for every production telemetry retrieval. They are designed
to make the network cost visible and mechanically bounded.

When the private store's master credential is intentionally unavailable on the local machine, use
`admin.mjs` with the separate operator credential. The production-only endpoint keeps the Blob
master token inside Vercel and permits only one bounded list page or one already-selected immutable
chunk. A separate report-only credential permits one bounded aggregate summary page without
returning raw rows, session/sortie identifiers, user agents, Blob URLs, or object pathnames. The
endpoint has no write, delete, CORS, retry, Range, or automatic-pagination path.

> **Never download telemetry with the Vercel dashboard, an ordinary browser, the Codex Chrome
> bridge, or browser automation. Do not automate dashboard Blob list/detail views.** Use only the
> local commands below. Dashboard activity is not the primary cause of the historical transfer
> incident, but it is still an uncontrolled and unnecessary way to trigger full-object reads and
> billed operations.

The primary historical failure was the legacy writer: every one-second flush first downloaded the
entire growing session monolith and then overwrote it. Transfer therefore grew quadratically with
sortie length. Production now writes a new bounded immutable gzip chunk on each 30-second flush and
does not read Blob storage while recording. These retrieval tools protect the separate offline read
path; they are not a substitute for keeping the immutable writer.

While the recorder queue is healthy, the browser retains the full 20 Hz diagnostic cadence and
losslessly encodes unchanged fields as
top-level deltas (`shallow-keyframe-delta-v1`). A complete keyframe is emitted every 40 samples
(two seconds) and at each ordinary upload boundary. The `q` field is a monotonic sample sequence;
`s` carries a full state, `d` carries changed fields, and `x` lists removed fields. Use
`TelemetryStateDecoder` from `web/wwwroot/render/telemetry/state_delta.js` when an analysis needs
full snapshots. It rejects a gap in the monotonic `q` sequence instead of silently applying a delta
to the wrong prior state, and resumes safely at the next keyframe. Never treat a delta row as
zero/default state when its preceding keyframe is unavailable.

Every immutable chunk begins with its own `hdr` row containing schema/encoding version, session,
build, batch ID, session start time, and keyframe interval. A selected chunk is therefore
self-describing without downloading an earlier object; its first state row is also a full keyframe.

This encoding is primarily a browser/envelope and Function-parse optimization. On a real Build 47
trace it reduced uncompressed JSON by about 76%, but gzip of the same trace was effectively
unchanged and Brotli improved by only about 8%. Vercel automatically compresses Fast Origin
Transfer, so do not interpret the raw reduction as an equivalent billing reduction. Verify the
actual post-deploy incoming metric; the immutable, read-free Blob design is the cost-critical
guarantee.

## Safety contract

`download.mjs` retrieves one deliberately selected blob. For a missing output it:

- sends exactly one ordinary `GET`, with no preceding `HEAD`;
- never sends `Range`, never follows a redirect, and has no retry or resume loop;
- rejects an oversized `Content-Length` before streaming and enforces the same cap as bytes arrive;
- streams to a mode-`0600` temporary file in the destination directory, verifies it, then atomically
  renames it to the final path;
- verifies exact size, SHA-256, and/or ETag when supplied;
- writes a token-free SHA-256 metadata sidecar and proves that sidecar against the local file before
  treating a later invocation as a zero-request cache hit;
- refuses an existing file of unknown provenance unless `--skip-existing` or `--replace` is explicit;
- accepts credentials only through `BLOB_READ_WRITE_TOKEN` and never prints the token.

The default hard cap is 134,217,728 bytes (128 MiB). That accommodates the legacy approximately
100 MB monoliths as well as current small `.jsonl.gz` chunks, while failing closed on unexpectedly
large objects. Raising the cap requires an explicit `--max-bytes` value.

`list.mjs` is deliberately separate. Each invocation makes one metadata-only list request, defaults
to 50 results, refuses limits above 100, limits its JSON response to 1 MiB, and never follows a
cursor automatically. Listing is itself a billed Blob operation, so request another page only by
supplying the returned cursor explicitly.

`admin.mjs summary` is the preferred routine reporting path. One operator request lists at most 20
objects, then reads only that page inside Vercel. It caps compressed input at 16 MiB, decompressed
input at 32 MiB, each decompressed chunk at 2 MiB, and total work at 25 seconds. Its response
contains counts, coverage/partiality, build mix, lifecycle outcomes, and aggregate combat measures;
it never returns raw rows or identifiers. `has_more`, `next_cursor`, failed chunks, and skipped
chunks make incomplete coverage explicit. Legacy flat-file objects are reported separately as
`chunks_unsupported_format` and are never downloaded by the summary route. Each summary still
performs billed Blob reads, so keep the prefix narrow and request another cursor only deliberately.

## Workflow

Run from the repository root with the private store token in the environment. There is no token CLI
option, so it cannot be copied into command output by argument handling:

```sh
export BLOB_READ_WRITE_TOKEN='load-this-from-a-secure-local-source'
node tools/telemetry/list.mjs --prefix 'telemetry/' --limit 50 \
  > /tmp/guns-only-telemetry-page.json
```

Or, with the narrower operator credential, write the same single metadata page directly as a
mode-`0600` file (the command refuses to replace an existing path):

```sh
export TELEMETRY_ADMIN_TOKEN='load-this-from-a-secure-local-source'
node tools/telemetry/admin.mjs list \
  --prefix 'telemetry/' --limit 50 \
  --output '/tmp/guns-only-telemetry-page.json'
```

For routine play-session reporting, use the report-only credential. This cannot authorize raw
`list` or `get` actions:

```sh
export TELEMETRY_REPORT_TOKEN='load-this-from-a-secure-local-source'
node tools/telemetry/admin.mjs summary \
  --prefix 'telemetry/web-1784' --limit 20 \
  --output '/tmp/guns-only-telemetry-summary.json'
```

If `scope.partial` is true, review the coverage fields and make a separate explicit request with
the returned cursor only when the additional Blob-read cost is justified.

Review that bounded JSON page locally and select one blob. Copy its `url`, `size`, and `etag` into a
single download command:

```sh
node tools/telemetry/download.mjs \
  --url 'https://STORE.private.blob.vercel-storage.com/telemetry/SESSION/CHUNK.jsonl.gz' \
  --output '/tmp/guns-only-telemetry/CHUNK.jsonl.gz' \
  --expected-size 12345 \
  --etag 'ETAG_FROM_LIST'
```

The operator equivalent makes one request through the authenticated gate and requires the selected
list row's exact size and ETag:

```sh
node tools/telemetry/admin.mjs get \
  --url 'https://STORE.private.blob.vercel-storage.com/telemetry/SESSION/CHUNK.jsonl.gz' \
  --output '/tmp/guns-only-telemetry/CHUNK.jsonl.gz' \
  --expected-size 12345 \
  --etag 'ETAG_FROM_LIST'
```

If a trusted SHA-256 is available, add `--sha256` for cryptographic content verification. The first
successful download computes SHA-256 regardless and records it in
`FILE.blob-metadata.json`. Repeating the same command verifies the local file and sidecar, then
returns `"status": "cached"` without a request. A supplied SHA-256 can also prove an existing file
without a sidecar. `--skip-existing` is an explicit operator assertion for properties not supplied;
size, SHA-256, and ETag are still verified when their options are present. `--replace` deliberately
bypasses cache reuse but still makes only one GET.

Inspect a downloaded chunk entirely on the local filesystem:

```sh
gzip -dc /tmp/guns-only-telemetry/CHUNK.jsonl.gz | wc -l
gzip -dc /tmp/guns-only-telemetry/CHUNK.jsonl.gz | head -n 3
```

For a later list page, make one more explicit list request:

```sh
node tools/telemetry/list.mjs \
  --prefix 'telemetry/' \
  --limit 50 \
  --cursor 'CURSOR_FROM_PREVIOUS_OUTPUT'
```

## Intentional limitations

- There is no bulk sync, automatic pagination, concurrency, retry, range resume, redirect following,
  or client-side summary decompression. A failed transfer removes its partial file; manually
  invoking the command again is a new and visible GET. The production summary endpoint performs
  tightly bounded server-side decompression solely to emit non-identifying aggregates.
- ETag is useful for identity/cache checks but is not treated as a cryptographic checksum. Supply a
  trusted SHA-256 when that distinction matters.
- A cache hit without newly supplied metadata assumes the source URL is immutable. That is true for
  the current chunk writer. When auditing a legacy URL that may once have been overwritten, run one
  bounded list request and supply its current size/ETag, or use `--replace` deliberately.
- Atomic rename requires the temporary and destination files to remain in the same directory. Two
  concurrent processes targeting the same output are unsupported; the late arrival check prevents
  an ordinary accidental overwrite, but there is no cross-process lock.
- The content file is installed before its metadata sidecar. A metadata write failure can therefore
  leave a valid but untrusted output that must be proved with `--sha256`, explicitly skipped, or
  replaced.
- The list command uses Vercel Blob HTTP API version 12, matching the production writer's direct-HTTP
  integration. A future Vercel API change may require an intentional tool update.

Run the focused suite with:

```sh
node --test tools/telemetry/test/*.test.mjs
```
