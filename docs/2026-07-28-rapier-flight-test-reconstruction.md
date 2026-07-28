# Rapier flight-test reconstruction — 28 July 2026

## Executive summary

The flown profile demonstrated that the Rapier can execute its intended energy ladder: launch,
climb to the FL560 shelf, cross the turbo-ramjet transition, reach Mach 3.69, and arrive at the
FL700 intercept gate with roughly 2,430 kt of closure. The propulsion model, thermal envelope, and
frame-time protection all behaved coherently in the observed data.

The flight was not yet a good manual reference profile. It spent at least 44.2 observed seconds
beyond 90 degrees of bank, entered ACCELERATE nearly inverted, descended about 5,000 ft while
crossing the ram transition, and then converted the FL700 capture into an extreme zoom. Four and a
half seconds after the director entered INTERCEPT, the pilot commanded 11.8 G; the aircraft passed
FL700 at high climb energy and ended the recording at 134,002 ft, Mach 2.98, 131 KIAS, and
+89,140 ft/min while the mission target remained 70,000 ft. This was pilot-commanded rather than
an unexplained flight-model impulse, but the system did too little to make the capture error
salient.

The event exposed three product defects or design risks:

1. Numeric Rapier phase changes are frame-current, but phase name, cue, and reason travel through
   the cold snapshot. `ColdFingerprint` does not include those Rapier fields, so all three observed
   mission transitions carried stale text until the five-second fallback refresh.
2. The intercept briefing says RAM LIGHT begins at M1.6 and full ram at M2.2. The live
   `TurboRamjetPerformanceMap` and transition banners use M2.00 and M2.80. The flight followed the
   latter. Briefing prose and executable truth have drifted apart.
3. The frame governor successfully protected 60 fps, but level 4 suppressed ambient scenery in 42
   of 43 sampled windows and cannot recover quality during a sortie. A featureless high-altitude
   picture makes a 180-degree bank and a missed altitude capture harder to perceive just when
   manual guidance must carry the workload.

## Evidence and confidence

The screen recording is 253.223 seconds long. Its MOV creation time aligns it to one production
Build 172 sortie. Nine immutable telemetry chunks were selected from the session and decoded
offline; raw production telemetry is not committed to the repository.

- Video-aligned telemetry samples: 4,234 at the recorded 20 Hz target rate.
- Directly covered video time: 211.756 seconds, or 83.62%.
- Contiguous evidence intervals: 4.346–5.206, 15.037–78.234, 87.934–150.983,
  159.584–222.684, and 231.634–253.184 seconds.
- The four interior holes are 8.6–9.8 seconds long. They result from deliberately bounded chunk
  retrieval, not a claim that production telemetry failed.
- Exact claims below use observed samples within a contiguous interval. The M2.00 crossing is
  bracketed by a gap: the last pre-gap sample was M1.937 and the first post-gap sample was M2.041.

Video and telemetry agree on the visible cockpit state. Around 60 seconds the recording shows
approximately M1.00, 28,151 ft, +58,900 ft/min, turbine thrust near 91 kN, zero ram thrust, and the
FL560 climb cue. That is consistent with the decoded climb trace.

## Reconstructed timeline

| Video time | State | Reconstruction |
| ---: | --- | --- |
| 4.346 s | Launch | First aligned sample: 395 ft, M0.022, 14 KIAS, 3,600 lb fuel. |
| 15.037 s | Climb established | 518 ft, M0.365, 239 KIAS, +4,992 ft/min; FL560 target active. |
| 110.585 s | ACCELERATE edge | 55,873 ft, M1.344, +23,347 ft/min, bank 173°. Numeric phase changed while cold text still said CLIMB. |
| 112.085 s | Maximum bank | 179.97° bank at M1.356. The pilot held roll-right; the mission FD requested approximately 1° bank. |
| 159.584 s | RAM LIGHT bracket | First post-gap sample was M2.041 at 57,018 ft, still near 180° bank. Exact M2.00 crossing lies inside the preceding gap. |
| 165.634 s | RAMCLIMB edge | 55,658 ft, M2.202, −25,925 ft/min. Numeric phase changed while cold text still said ACCELERATE. |
| 173.034 s | FULL RAM observed | Exact upward M2.80 crossing at 51,993 ft, 698 KIAS, −33,379 ft/min. |
| 193.483 s | Peak Mach | M3.686 at 59,215 ft, +38,758 ft/min, 2,440 kt closure. |
| 209.185 s | INTERCEPT edge | 69,381 ft, M3.668, +38,971 ft/min; target 70,000 ft. Cold text still said RAMCLIMB. |
| 213.634 s | Peak load | Pilot pull commanded 11.776 G; actual 11.723 G, 21.47° AoA, 72,373 ft. |
| 253.184 s | End of recording | 134,002 ft, M2.980, 131 KIAS, +89,140 ft/min; FL700 target still active and contact still 271 NM away. |

## Flight-path assessment

### What worked

The launch was decisive and repeatable. The observed trace left the runway region cleanly and was
already at 239 KIAS by the first complete climb sample. The FL560 energy shelf also worked: the
aircraft reached the shelf near the intended transonic state and then accelerated rather than
trying to force the ramjet in dense air.

The propulsion transition was dynamically effective. The aircraft traded roughly 5,000 ft for
speed between the first post-gap M2.04 sample and the exact M2.80 full-ram crossing. That trade put
the jet through the thrust bucket and yielded M3.69 twenty seconds later. Thermal margin was never
the binding constraint: the minimum observed margin was 752°C, with maximum stagnation temperature
448°C.

The run also generated useful mission energy. Maximum closure was 2,443 kt, target range fell by
96.4 NM over the covered recording, and only 640 lb (17.8% of starting fuel) was burned. The
article was not fuel- or temperature-limited during this segment.

### What should change in the flown technique

The aircraft should not be rolled through and held near inverted during the FL560 acceleration
shelf. At the ACCELERATE edge the aircraft was at 173° bank while the flight director requested
about 1°. Across directly covered telemetry, absolute bank exceeded 90° for 44.2 seconds and 135°
for 38.4 seconds. That added orientation workload and turned the entry to RAMCLIMB into a rolling,
descending correction rather than a clean lift-vector transition.

The M2.0–M2.8 altitude trade was useful, but its execution was deeper and less controlled than
necessary. At the RAMCLIMB edge the aircraft was descending at 25,925 ft/min and reached
−34,728 ft/min before recovering. A better manual profile is wings-level acceleration on the FL560
shelf, permit only the required shallow dip through the thrust bucket, then establish the
low-AoA ram climb once the ram contribution is unmistakable.

The FL700 capture was the largest error. INTERCEPT began at 69,381 ft, but the aircraft still had
nearly +39,000 ft/min. Instead of unloading and capturing, the pilot pulled 11.8 G. AoA remained
above 15° for 20.1 observed seconds, G exceeded 9 for 2.65 seconds, and the aircraft spent 34.1
observed INTERCEPT seconds above FL700. This converted useful dash energy into altitude and reduced
IAS to 131 kt by the end of the recording. The better profile is to begin unloading before the
geometric gate, cross FL700 close to level, retain M3+ dash energy, and spend it on closure rather
than a zoom that the non-lob mission did not request.

## What the event says about the systems

### The hot/cold snapshot contract is semantically inconsistent

`rapier_mission_phase` is in the numeric hot frame, while `rapier_mission_phase_name`,
`rapier_mission_cue`, and `rapier_phase_reason` are emitted by the cold JSON projection. The cold
version only advances for fields in `ColdFingerprint`, and those Rapier fields are absent. The
browser therefore relies on its five-second fallback.

This was observable, not hypothetical. At all three covered phase edges the numeric phase changed
first:

- CLIMB → ACCELERATE while cold text still read CLIMB.
- ACCELERATE → RAMCLIMB while cold text still read ACCELERATE.
- RAMCLIMB → INTERCEPT while cold text still read RAMCLIMB.

Derive the phase label from the numeric phase in the browser, as the reconstruction now does.
Fields that cannot be derived, especially cue and reason, should either join the hot contract or
participate in `ColdFingerprint`. Add an edge-coherence test that asserts the numeric phase,
presented label, cue, and reason change on the same frame.

### Narrative configuration must not duplicate propulsion constants

The current preflight brief still teaches M1.6/M2.2, while
`TurboRamjetPerformanceMap.RamFadeStartMach` and `FullRamMach` are M2.00/M2.80. The runtime
transition banners already format their values from those constants, so the cockpit was correct
and the briefing was not.

Move the brief's threshold text into a generated/configured value sourced from the propulsion map,
or add a test that rejects hard-coded numeric transition claims. The same rule should cover target
altitudes, design Mach, fuel configuration, and other values repeated across prose, HUD, mission
logic, and flight-test criteria.

### Phase gates need predictive capture cues for manual flight

The RAMCLIMB → INTERCEPT transition is based on geometric altitude: below cruise altitude minus
200 m remains RAMCLIMB; otherwise the phase advances. That is adequate for active automation,
which owns an altitude-capture gamma, but not for a manual pilot arriving at +39,000 ft/min.

Manual presentation should expose time-to-capture or vertical lead. A cue such as
`CAPTURE FL700 · UNLOAD` should appear before the phase edge when altitude error divided by climb
rate falls below a tested capture horizon. A limit cue should become unmistakable if the pilot
commands high G while already above the non-lob target. This does not require taking control away;
it makes the intended energy decision legible.

### Performance protection worked, but became a persistent visual-state change

Across 43 video-window performance samples, worst p95 frame time was 17.7 ms, worst frame was
17.8 ms, no frame exceeded 22 ms, and no time-compression ticks were dropped. The governor did its
primary job.

It also reached level 4 and suppressed ambient scenery in 42 of 43 windows. The governor only
sheds quality during a sortie; it resets on the next sortie but does not re-earn quality after
sustained clean windows. This turns a launch/loading transient into a four-minute visual downgrade.

Test a conservative recovery path after several clean windows, with hysteresis to prevent
oscillation. Independently preserve a cheap synthetic horizon, bank-error emphasis, and altitude
capture cue so spatial/energy awareness does not depend on expensive scenery.

### Telemetry is already good enough for post-flight engineering

The 20 Hz numeric trace, periodic keyframes, independently decodable chunks, input events, and
five-second performance windows were sufficient to distinguish pilot command, aircraft response,
mission director intent, propulsion state, thermal state, and renderer behavior. That is a strong
systems-observability result.

Two improvements would make future tests faster and less inferential:

1. Add a pilot-invoked sync marker that records a telemetry event and flashes a unique visual
   frame, eliminating dependence on MOV container time.
2. Include a compact derived label-coherence diagnostic or cold-version evidence so hot/cold
   presentation lag is obvious in a standard reconstruction.

## Offline reconstruction module

The reusable implementation is:

- `tools/telemetry/rapier_reconstruct.mjs` — local input loading, exact source hashing,
  decoder-based merge, gap/coverage accounting, video alignment, track projection, phase and
  propulsion events, extrema, performance summary, and CSV export.
- `tools/telemetry/rapier_reconstruct_cli.mjs` — dependency-free local CLI.
- `tools/telemetry/test/rapier_reconstruct.test.mjs` — ten focused regression tests.

It accepts only local `.jsonl` or `.jsonl.gz` files, rejects mixed sessions and URLs, records rather
than interpolates gaps, keeps numeric phase truth separate from observed cold labels, and reports
source SHA-256 hashes. Run all telemetry tests with:

```sh
node --test tools/telemetry/test/*.test.mjs
```

The current suite passes 30/30.

## Recommended order of work

1. Fix phase/cue/reason edge coherence and add a hot/cold transition test.
2. Remove hard-coded RAM thresholds from the Rapier briefing and add configuration-drift tests.
3. Design and test predictive FL700 capture guidance for manual/direct mode.
4. Add governor recovery hysteresis and retain low-cost attitude/energy reference cues.
5. Add the flight-test sync marker and make reconstruction part of the standard sortie review.

This order fixes false or stale information first, then improves flight guidance, then presentation
quality and analysis ergonomics. None of these recommendations requires changing the evidenced
propulsion or thermal model; those were the strongest parts of this event.
