# Carrier incident replay

The carrier replay is a flight recorder, not a second simulation. `SimulationSession` samples the
authoritative player and carrier state at 12 Hz, forces samples on terminal transitions, and latches
the exact pre-impulse contact evidence before `WreckContactMotion` takes ownership. The next fixed
tick records the post-impact trajectory. A clip is frozen after the player's carrier incident has
reached `Settled`; if the explicit numerical guard is reached first, it instead freezes the last
integrated `SimulationBounded` state without inventing physical rest.

## Bounded transport

- The recorder retains at most 30 seconds / 368 samples and 128 ordered events, including up to
  ten seconds of pre-roll.
- The normal per-frame snapshot contains only `incident_replay_id` and an availability flag.
- `WebBridge.ConsumeIncidentReplay(id)` exports the versioned
  `carrier-incident-replay.v4` compact state/event field-table payload once. The browser
  caches it for automatic playback and **Replay incident again**.
- No replay request touches Vercel, telemetry, Blob storage, or another network endpoint; the
  transfer is local WebAssembly-to-JavaScript interop.

## Recorded evidence

The clip includes player position and attitude, moving carrier pose and recovery points, KIAS,
groundspeed, deck-relative sink and closure, lineup/height, angle of attack, flight-path angle,
vertical speed, actual normal load, power-lever command, engine response, post-detent G/bank/rudder/
roll/pitch commands, per-leg gear travel and indications, left/right flap travel, hook/wire result,
recovery state, terminal state, surface, and a bounded ordered event stream. Every replay event
retains its authoritative sequence, completed tick, type/source/target/count/outcome/surface, plus
the target's exact position and velocity at emission. This separate stream preserves a same-tick
impact followed by collision-caused destruction even though the sampled-state policy correctly
keeps only the pre-impulse contact sample for that tick.

Touchdown evidence comes from the same authoritative assessment which owns the live carrier
result: grade, deviation bitmask, primary correction, versioned provisional profile, baseline
limits, on-speed-AOA datum, and the active adaptive-training target. The browser uses a confirmed
deviation and those exported limits only to locate when its measured trend first appeared; it does
not contain a parallel touchdown grader. Carrier contact also retains the `FlightDeck`, `Hull`, or
`Island` collision proxy through initial and secondary wreck contacts.

For an arrestment failure, the frozen clip additionally retains the immutable capability-profile
ID, explicit failure reason, exact engagement closure, initial/absorbed/remaining energy, effective
capacity, peak line load, and maximum line load. Those are recorded simulation facts rather than
thresholds reconstructed in the browser.

The external camera and interpolation are presentation-only. They cannot feed back into physics.
The opponent is hidden because its historical trajectory is not part of a player carrier clip.
Each playback generation receives a distinct presentation event-stream ID. Historical frames
replace the live rolling event window and neutralise unrecorded projectile, counter, and damage
transients, so live-final effects cannot leak into pre-impact replay or Replay Again.

## Teaching contract

The overlay keeps physical outcome, authoritative simulated touchdown assessment, and automated
causal review as three distinct statements. It shows the measured causal evidence, marks the earliest
sample at which the dominant recorded trend was present, and offers one next-pass correction.
Structure contact outranks touchdown-condition diagnoses; gear is treated as a touchdown cause
only for flight-deck contact, while sink/energy/lineup/AOA diagnoses require the simulation's
recorded deviation flags. If no earlier structure-conflict evidence exists, the marker
stays at impact rather than fabricating an eight-second warning.

An arrestment-failure review teaches directly from its recorded energy/load ledger and named
capability. For energy or runout exhaustion, the decision marker uses a closure boundary derived
from exact engagement closure, recorded incident energy, and effective capacity; JavaScript does
not duplicate a magic speed gate. A line-load exceedance in the present fixed-force model is identified as an
equipment/profile fault and is not blamed on pilot technique.

This is explicitly an **automated causal review, not an LSO grade**. The authoritative simulated
touchdown grade is separately labelled with its provisional assessment profile; it is not presented
as an LSO judgement. A real phase-coded LSO trend model can consume the same clip later without
changing the physics or transport contract.

## Honest limits

- The 12 Hz visual replay interpolates recorded states; discontinuous impact evidence itself is
  retained exactly, but this is not a high-speed photogrammetry system.
- Contact physics is a provisional point-mass/debris/water model. It does not yet simulate local
  structural deformation, fire, occupant loads, hook load histories, or type-certified crash data.
- Island and hull proxy contacts are distinct. The current collision model still groups round-down
  and hull/sponson contact under `Hull`; it does not resolve individual ship structures or damage.
- Clips do not yet support scrubbing or alternate camera selection. Playback is real-time, can be
  skipped with **Escape**, and holds the final recorded state briefly before the debrief.

Focused coverage lives in `IncidentReplayRecorderTests`, `IncidentReplaySimulationTests`,
`IncidentReplayProjectionTests`, and `render/replay/tests/incident_replay.test.mjs`.
