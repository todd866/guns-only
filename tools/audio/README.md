# Audio operations

## Codex audio doctor

Concurrent Codex tasks have isolated Browser inventories but share the desktop application's audio
service. `bin/audio-doctor` provides a small, local ownership ledger plus a read-only process
snapshot:

```bash
bin/audio-doctor register --label "Build 175 QA" --url "https://guns-only.vercel.app/?audioQa=silent"
bin/audio-doctor heartbeat
bin/audio-doctor snapshot
bin/audio-doctor clear
```

The task id comes from `CODEX_THREAD_ID`; records contain purpose, URL, working directory, and
timestamps—no gameplay or user telemetry. They live in the operating-system temporary directory
and become stale after 30 minutes without a heartbeat.

The process snapshot distinguishes Codex and Chrome audio services, media players, and the local
jet-library static server. It cannot infer whether a Chromium AudioService is actually emitting
sound; use the registered task id to ask the owning task to close its own tab.

Guns Only production browser acceptance uses `?audioQa=silent`. It proves user-gesture activation,
the running shared graph, live signal updates, and deterministic suspend without sending audio to
the hardware destination.
