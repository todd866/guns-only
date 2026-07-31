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

Render stalls are invisible to the sim-tick-scheduled state stream, so the recorder also emits one
`{"k":"perf"}` row per eligible 5-second wall-time window. Eligibility is deliberately narrow:
the session must be `ACTIVE`, unpaused, outside incident replay, and the document must be visible.
Crossing into or out of that state resets the partial window, so a Ready, pause, replay, or hidden
tab delta cannot contaminate foreground-flight evidence. Each emitted row is marked
`active_foreground: 1`.

Perf rows use raw requestAnimationFrame deltas and include `t` (the normal `performance.now()` time
base), `frames`, `window_ms`, `delivered_fps`, `frame_ms_p50`, `frame_ms_p95`,
`frame_ms_p99`, and `frame_ms_max`. The shared 60 fps contract requires at least 59 delivered FPS,
p95 at most 18.5 ms, p99 at most 22 ms, and no more than 3% of frames over the 18.5 ms scheduling
budget. `frame_budget_ms`, `frame_budget_misses` / `frames_over_18_5ms`,
`frame_budget_miss_rate`, `longest_frame_budget_miss_streak`, and `contract_pass` record that
decision. `long_frames` / `frames_over_22ms` remain a separate compatibility diagnostic; they are
not a substitute for the 18.5 ms budget-miss rate.

Rows also carry the quality tier, once-per-window renderer/scene/load counters (including draw
calls, resources, governor level, resolution scale, terrain queues, launch state, and engagement),
plus average and maximum main-thread phase timings when available. Healthy perf rows yield to state
rows when the live queue is already full. A failing foreground contract row is allowed into the
queue, and backpressure retention preserves the newest such breach as a diagnostic anchor. All
perf rows remain diagnostics: state decoders that filter on `k === "st"` ignore them unchanged.

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
contains counts, coverage/partiality, build mix, lifecycle outcomes, aggregate combat measures,
and a non-identifying `performance` summary: observed/contract/healthy windows, delivered FPS,
budget-miss rate, worst p95/p99/MAX, longest miss streak, governor and resolution pressure,
quality-tier mix, launch-window failures, terrain queue pressure, phase peaks, and the dominant
phase of failed windows. Older perf rows without FPS-window, p95, p99, and 18.5 ms budget evidence
remain counted but cannot be called contract-healthy. The endpoint never returns raw rows or
identifiers. `has_more`, `next_cursor`, failed chunks, and skipped chunks make incomplete coverage
explicit. Legacy flat-file objects are reported separately as `chunks_unsupported_format` and are
never downloaded by the summary route. Each summary still performs billed Blob reads, so keep the
prefix narrow and request another cursor only deliberately.

## Workflow

Run from the repository root with the private store token in the environment. There is no token CLI
option, so it cannot be copied into command output by argument handling:

### Credentials, once

The Blob token is created by the Vercel Blob integration and is marked sensitive: `vercel env
pull` returns it **empty**, and `vercel blob` cannot mint one either. There is no CLI path to it.
Every session that tries rediscovers the same dead end and then works around it, which is worse
than having no telemetry at all -- the diagnosis quietly falls back to guessing.

So paste it once into `~/.config/guns-only/telemetry.env` (mode `0600`) and every tool here picks
it up from then on, in this shell and every future one:

```sh
install -m 700 -d ~/.config/guns-only
printf 'BLOB_READ_WRITE_TOKEN=%s\n' 'vercel_blob_rw_...' > ~/.config/guns-only/telemetry.env
chmod 600 ~/.config/guns-only/telemetry.env
```

`TELEMETRY_ADMIN_TOKEN` and `TELEMETRY_REPORT_TOKEN` go in the same file. The environment always
wins, so an explicit `TOKEN=... node tools/telemetry/...` still overrides the file, and a file
readable beyond its owner is refused rather than used.

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

## Offline Rapier flight reconstruction

During the recording, press the backquote key (`` ` ``) once the sortie is active. The HUD flashes a
numbered `FLIGHT TEST SYNC · MARK-NNN` frame for one second and the recorder writes the same marker
ID, wall epoch, current sample key, sortie ID, and held controls. Note the marker's visible time in
the recording.

Once the selected immutable chunks are on disk, reconstruct a sortie locally without network,
credential, or browser access:

```sh
node tools/telemetry/rapier_reconstruct_cli.mjs \
  --input '/tmp/guns-only-telemetry/CHUNK-A.jsonl.gz' \
  --input '/tmp/guns-only-telemetry/CHUNK-B.jsonl.gz' \
  --sortie-id 'sortie-1700000000000-1' \
  --output '/tmp/guns-only-telemetry/rapier-reconstruction.json' \
  --csv '/tmp/guns-only-telemetry/rapier-track.csv' \
  --video-sync-marker 'MARK-001' \
  --video-sync-seconds 4.250 \
  --video-duration-s 253.223
```

The matching visible/telemetry marker derives recording start directly and avoids relying on MOV
container creation time. `--video-start-epoch-ms` remains available for older recordings; it is
mutually exclusive with marker alignment.

The reconstructor accepts only explicit local `.jsonl` or `.jsonl.gz` paths. It reuses the
production `TelemetryStateDecoder`, merges out-of-order inputs, suppresses duplicate rows, rejects
mixed sessions, records coverage intervals and missing sequences, and never invents state across a
gap. The JSON output includes a compact track, numeric phase and propulsion events, extrema,
observed control/phase dwell, video alignment, performance samples, and SHA-256 hashes of the exact
source files. Sync markers are first-class timeline events with their derived video time. The
optional CSV is intended for plots and notebooks.

The output also contains `audit` and `exposure_summary`. The audit calls out clock uncertainty,
coverage gaps, cold-label lag, unexplained phase jumps, frame stalls, cost-dropped fast-time ticks,
abrupt autonomous handoffs, and observed structural/dynamic-pressure/thermal exposure. Exposure is
raw evidence only: the tool explicitly reports damage assessment and cost projection as
`not_computed`, leaving the versioned service-life and economic models to price inspection, repair,
replacement, or loss later.

Current Rapier sorties also finalize a bounded kernel-authored
`guns-only.service-life-sortie.v1` record. Its snapshot seam publishes the record hash, evidence
status, peak load/q, observed exceedance dwell, minimum thermal-proxy margin, and whether an
engineering review is warranted. These fields are retained by the compact reconstruction. They do
not ground an aircraft or book money: both `service_life_damage_assessment` and
`service_life_cost_projection` remain `not_computed` until a separately versioned assessment and
maintenance authority consumes the immutable record.

The dealt Rapier operations mission separately projects
`rapier.operations.allocation-credit.v1` boundary fields: explicit economy opt-in, target contract,
fictional credit basis, finalized record application key, kernel-authored line items, sortie net,
and whether an exceedance inspection was reserved. The reconstructor retains these fields so an
analyst can reconcile the debrief with the same immutable sortie evidence. F-22 arcade fights,
Rapier Circuits, and the fixed engineering intercept publish `rapier_economy_active:false`; target
or airframe names alone never activate a ledger.

Mission-phase event labels come from the numeric hot-state phase code. The independently recorded
cold text label and phase reason remain in the evidence so a transition-time UI lag is visible
instead of silently becoming the reconstruction's ground truth. Recording alignment uses
the header's declared monotonic origin plus `row.t`. For older headers, a stable
`wall_epoch_ms - row.t` sync-marker anchor automatically repairs a proven offset and records the
exact correction. Without such an anchor the tool keeps the original timestamps but reports
`legacy_unverified`; it never guesses a correction from the filename or MOV creation time.
