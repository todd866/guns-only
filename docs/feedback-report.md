# Feedback report handoff

F8 opens Report; Backquote already owns the flight-test sync marker. The shared pause/picker/debrief
utility row includes ⚑ Report. The dialog captures before adding its own pause reason and removes
only that reason on close. Enter sends; Escape cancels. Sent and Queued receipts close after 2 s.

Capture copies the active WebGL scene and HUD into a detached 2D canvas synchronously after
`view.update()` renders both, before the RAF returns. JPEG encoding/downscaling then reads only
that frozen copy. The full state comes from `bridge.GetState()` at that same tick, in a telemetry
keyframe (`state.s`); the separately retained 120 s ring uses the telemetry scheduler/delta codec.
This local ring survives automatic telemetry flushes and diagnostics opt-out.

Limits: 6,000 history rows, 50 console entries, 2,000 note characters, 16 MiB uncompressed JSON,
1.5 MiB gzip, 1.5 MiB JPEG. Oldest history is trimmed only when a byte/row cap requires it;
`historyDroppedRows` records payload trimming, and the first retained state remains a keyframe.
The complete current state is never trimmed. Images start at JPEG quality .85 and downscale.

`GET /report` advertises only whether the server has `BLOB_READ_WRITE_TOKEN`. A verified capability
is cached per build for seven days for offline reloads; a successful disabled response revokes it.
Unsupported deployments stay disabled. Explicit submissions use a separate IndexedDB database,
`guns-feedback-outbox`, capped at eight entries (oldest evicted), and keep exact gzip/JPEG request
bodies across retry. Automatic diagnostics opt-out leaves these explicit reports intact. Network
errors and receiver rejections retain the body; background retries back off from 30 s to 5 min.
The receiver's deterministic private JSON/JPEG paths let a retry repair a partial pair.

Retrieval: see [tools/feedback/README.md](../tools/feedback/README.md). The existing operator bearer
can list/get reports; the aggregate-summary credential cannot read them.

## Browser checks for Claude

No browser was launched in this task. Use a test server for the capability/upload endpoints or
stub GET `/report` with `{ "enabled": true }` and POST with 204, 503, or an offline failure.
A static dev server without that capability intentionally leaves Report disabled.

- At 1280×720, phone portrait/landscape, and 200% text: inspect one-row fit, focus, glyph tooltip,
  Send/close controls, and the utility button on pause, picker, and debrief.
- In flight, hold a control and press F8. Confirm the tick stops, the JPEG is nonblack and includes
  the HUD at the captured camera pose. Inspect `state.s`, settings, device/GPU and perf values.
  Repeat with postprocessing and adaptive resolution active; preserveDrawingBuffer remains off.
- Type flight shortcut letters into the note; Enter sends once. Escape restores the prior
  flight/pause/picker/debrief state. Check success receipt for 2 s and focus return.
- With automatic diagnostics off, fly, send offline, reload offline, send again, restore networking,
  and confirm exact IDs upload once per object and the queue drains. Check no-token disabled mode.
- Download with `--latest 1` and `--id <full-id>`, then compare JSON tick, note and JPEG visually.

The Node suite includes API/auth/limits, payload/history, capture-copy ordering, modal ownership,
queue/reload, CLI pagination, telemetry, settings and release tests. The release-history test is
expected to fail on this feature branch because the owner explicitly requested no build stamp.
Build 381 and its release identity are unchanged. Browser rendering, real IndexedDB, WebGL pixels,
and live Vercel Blob writes still need the integration pass above.
