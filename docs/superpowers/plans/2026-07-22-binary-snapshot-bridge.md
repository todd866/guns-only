# Binary snapshot bridge: per-frame hot buffer + low-rate cold JSON

## Why

Every rAF frame today does `bridge.Advance(dt)` then `JSON.parse(bridge.GetState())`
(app.js:5311): C# hand-builds a ~190-field JSON string on the Mono interpreter, marshals it
across the WASM boundary, and JS parses it into a fresh object tree — allocation and GC churn
on both heaps at display rate. Profiling-by-inspection says this bridge, not three.js and not
the 6DOF kernel, is the dominant per-frame overhead that is cheap to remove.

## Shape of the fix

Split the contract by cadence, not by consumer:

- **Hot path (every frame):** `SnapshotHotFrame` fills a persistent `double[]` with every
  per-frame numeric/boolean field (~840 slots incl. two 48-round tracer regions), quantized to
  the same `F*` precision the JSON uses so downstream values are identical. `WebBridge`
  exports the buffer once as an `ArraySegment<double>` (a JS `MemoryView`); JS reads
  `view.slice()` per frame. `Advance(dt)` fills after stepping; a new `RefreshHotFrame()`
  fills without stepping (used when the JS loop skips `Advance` while paused).
- **Cold path (on change + fallback):** the existing `SnapshotProjection.BuildState` JSON —
  entirely unchanged — is fetched only when slot 0 (`cold_version`) changes, or every ~250 ms
  as a safety net. `cold_version` is bumped by a transition fingerprint compared during each
  fill: lifecycle/outcome/terminal enums, spawn sequences, incident-replay clip id, latest
  `recent_events` sequence, weather profile ref, pilot state, Auto-GCAS phase/inhibit/cue,
  gear/flap tokens, maintenance/merge/drone evaluation signatures, carrier
  recovery/touchdown/arrest/pass signatures, the mode string and LSO call/severity
  (recomputed via the same per-frame Lso.AdviseForMode the old path already paid, carrier
  beats only), advice context, cue strings, world origin. The fingerprint is a heuristic to
  make edges land same-frame; the 250 ms fallback is the correctness backstop for anything
  it misses. Accepted chatter: the merge cue embeds a 0.1 s dwell counter, so during
  rear-quarter tracking the cue text — and therefore the cold fetch — runs at ~10 Hz; that
  is the cue's native change rate (exact display fidelity), and still a 5-6× reduction in
  that window.
- **Merge (JS):** a new `render/state/` module builds, per frame,
  `state = { ...coldBase }` then decodes hot slots onto it. Fresh top-level object every
  frame; nested cold arrays/objects shared by reference (existing invariant: nothing mutates
  the snapshot).

## Invariants the recon catalogs proved load-bearing

1. **Fresh object identity per frame.** Telemetry keyframes retain live `state` references up
   to 30 s before stringify (state_delta.js); `latestState`, `hudFrame.state`,
   `PresentationAssetManager.lastState` all retain snapshots. The merge must mint a new
   top-level object each frame and never mutate a previously returned one.
2. **Key presence is a signal.** The telemetry delta encoder records disappearing keys; HUD
   panels use `typeof === 'boolean'` presence as "indication exists"; the carrier block's
   ~79 keys vanish on non-carrier beats. Hot decode skips absent blocks (presence slots), and
   block presence changes only on transitions, which force a same-frame cold refetch — so the
   merged object's key set always equals today's JSON key set.
3. **Strict boolean comparisons everywhere** (`=== true`, `=== false`, `!== false` with
   different defaults). Hot bool slots decode to real booleans.
4. **Null-able numbers** (`FiniteNumberJson`/`NullableNumberJson` emit JSON `null`): hot
   slots use NaN as the wire sentinel and decode to `null`, so NaN never leaks (same guard as
   the JSON path).
5. **Value identity.** Hot values are rounded in C# to each field's current F-precision, so
   telemetry delta signatures, dedup keys, and displayed numbers match what `JSON.parse`
   produces today.
6. **Frame-fresh set** (from the consumer catalog): poses/bases, carrier deck + arrestment,
   attitude/rates/energy, gun window/solution/lead/tracers/rounds/hits/`hit`/`gun_firing`,
   physiology ramps, Auto-GCAS state, controls, fuel flow, `tick` + `t` (telemetry scheduler
   and multiplayer publish both key on `tick`).
7. **One-shot handshakes** (`incident_replay_id`/`_available`) and `recent_events` FIFO ride
   the cold path but their sequences are in the fingerprint → advertised same-frame.

## Build 68 reconciliation (integration onto pivot-hardening)

This plan was written before Build 64 added per-frame gunnery fields to the snapshot. Under
the bridge those would have ridden the cold path and gone up to 250 ms stale — a wrong
gunsight. Reconciliation, landed with the integration:

- **`vx`/`vy`/`vz`** (world ground velocity, the FPV's projection input) and
  **`gun_trajectory`** (the 9-sample bullets-in-the-air locus the HUD funnel projects) are
  hot slots. The trajectory is a new fixed-size keyed sample-array region in the layout
  (`sample_arrays`: 9 × `x,y,z,r`), decoded back to the JSON's `[{x,y,z,r}…]` shape.
- **Kernel-side sampling was chosen over recomputing the locus in JS from hot state**: the
  hot slots for `BallisticFunnelPoint`'s inputs are quantized for display (body rates at 2
  decimals in degrees, axes at 5), so a client-side recompute could not reproduce the JSON's
  exact F2/F1 samples — it would break the bridge's bit-identical value contract and its
  golden tests, and would duplicate the rotation-integral ballistics in a second language.
- Also moved hot, same reasoning (per-frame HUD inputs added in Builds 64-67):
  `calibrated_airspeed_kts`, the `*_kcas` stall/corner trio, the twelve
  `padlock_roll_*`/`padlock_target_*` assist fields, `fuel_flow_pph`,
  `fuel_minutes_to_joker`, and the `fuel_joker`/`fuel_minimum`/`fuel_emergency` flags.
- Layout version 1 → 2 (adds the `sample_arrays` section; the JS parser treats a missing
  section as empty). Golden coverage extends to the new slots automatically, plus a dedicated
  maneuvering test pinning the funnel + ground velocity against the JSON while rolling and
  pulling. Schema stays 1.5.0 — `BuildState` output is unchanged.

## Not doing (explicitly)

- No change to `BuildState` output, schema version (stays 1.4.0), multiplayer protocol,
  or any of the 51 render modules' reads.
- No AOT flag in this change (separate measurement task; needs `wasm-tools` workload).
- Not fixing the pre-existing raw interpolation of `lso`/`difficulty_label` (flagged for a
  follow-up; out of scope here).

## Steps

1. `web/SnapshotHotFrame.cs` (browser-free, linked into sim.Tests): static declarative
   layout, `Fill(buffer, session, …)` with name-asserted positional writes, fingerprint,
   `LayoutJson()`.
2. `sim.Tests/SnapshotHotFrameTests.cs` — golden agreement: across beats (arcade 7, carrier 5,
   valley 1) and many steps, every hot slot equals the parsed `BuildState` JSON field
   (bool↔bool, NaN↔null, presence↔key-presence, tracer arrays element-wise);
   `cold_version` monotonic, bumps on Begin/StartBeat/pause/terminal edges, stable during
   steady flight.
3. `web/wwwroot/render/state/hot_snapshot.js` + `render/state/tests/hot_snapshot.test.mjs`
   (node:test ESM): decode kinds, absent blocks, fresh identity, refetch policy (version
   change / fallback interval), tracer shape.
4. `web/WebBridge.cs` exports; `app.js` tick rewiring (minimal diff, respecting
   release_identity.test.mjs's literal-pattern assertions on app.js).
5. Build stamp 62 → 63 (release_identity.js, build-info.js, index.html ×2).
6. Full `bin/check` (includes headless boot smoke on the published app), then adversarial
   review (Codex + Claude), then commit as `Ship Build 63: …`.
