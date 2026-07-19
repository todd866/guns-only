# Safe production telemetry retrieval

Use these dependency-free Node.js tools for every production telemetry retrieval. They are designed
to make the network cost visible and mechanically bounded.

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

## Workflow

Run from the repository root with the private store token in the environment. There is no token CLI
option, so it cannot be copied into command output by argument handling:

```sh
export BLOB_READ_WRITE_TOKEN='load-this-from-a-secure-local-source'
node tools/telemetry/list.mjs --prefix 'telemetry/' --limit 50 \
  > /tmp/guns-only-telemetry-page.json
```

Review that bounded JSON page locally and select one blob. Copy its `url`, `size`, and `etag` into a
single download command:

```sh
node tools/telemetry/download.mjs \
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
  or decompression. A failed transfer removes its partial file; manually invoking the command again
  is a new and visible GET.
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
