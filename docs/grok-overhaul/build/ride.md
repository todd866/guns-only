# Weekend Ride — build slice

Club loop on the Rapier strip, a braking reference from the centreline, and a session that ends stopped in the box. The rolling pit-in in section 4 is the previous ending. The mission below replaces it.

## Mission arc, 2026-09-25

Spec: `docs/grok-overhaul/design/ride-mission.md`. Owner decision: pit limit stays 60 km/h, provisional (ACU/MSUK national pit-lane maximum), not a measured R1 figure.

**Cool-down.** After two flying laps (`LapCount` reaches 2) `session_leg` is `cooldown`. That lap is timed and shown. `RideLapTiming` does not write it into `BestLapSeconds`, the split profile, or the best sectors. Phase stays `Active` on the line. Test: `TwoCleanLapsSetABestAndTheCooldownLapDoesNot`.

**Stop.** Legal entry is the first tick of an occupancy at or under 60 km/h. Then speed at or under 0.5 m/s for 0.5 s sets `LegalStop` and `Finish()`. A hot entry latches; slowing inside the box does not finish; leaving the box clears the occupancy. Coming in during `flying` sets `cameInEarly`. Esc `Finish()` is an abandon, `LegalStop` stays false. `ResetToGrid` keeps completed laps so a tip does not erase the checker. Test: `PitInBelowThePostedSpeedIsTheOnlyWorldEventThatFinishes` (the old one-tick finish assertion was the rolling ending).

**Pit window.** Opens on the cool-down when remaining distance to the line is inside 120 m and progress is still past 120 m, so the start of the cool-down lap is not an arrival. Once open it stays open across the stripe: the box sits past the line, and closing the window on the wrap pulled the bike back onto the circuit. A tip clears the latch. While `pit_open`, off-paint does not add `off_track_s` and does not dirty the open lap. Flying laps still spoil. Test: `PitOpenOnTheCooldownDoesNotSpoilOffPaint`.

**Look-ahead.** `look_ahead_lateral_m` is the signed lateral miss of the centreline point `max(12 m, speed × 0.8 s)` ahead. Positive is to the rider's right. When `pit_open`, the target is the pit-box centre. The helmet draws one horizon tick, not a number. A 1.6 s look and a 40 m minimum were tried and rejected: the longer chord cuts the hairpin or turns off the straight. Tests: `MotorcycleSnapshotProjectionTests` (the field is a number, `session_leg` is `flying`), `helmet_hud_status.test.mjs`.

**Sectors.** Gates sit on the first apex, that hairpin's exit, and the second apex (this circuit: about 0.29, 0.34, 0.77 of 1,664 m), not 0.25/0.50/0.75. `SectorCount` stays 4. Apexes closer than 80 m are merged so the gates stay in order. Test: `SectorGatesSitOnTheHairpinsNotOnEqualLengths`.

**HUD and brief.** Caution tone on the same apex line when speed is over the next apex inside 150 m and the cue is not the exit. Cool-down replaces the lap clock with `CHECKER · BRING IT IN` until the pit cue, then `PIT · 60 km/h`. Hot entry in the box: `PIT SPEED`. Legal entry under the stop threshold: `STOPPED`. Brief title `Two laps, then bring it in`. Tests: `helmet_hud_status.test.mjs`, `production-routes` title string.

**Debrief.** One summary, one next line. No legal stop is still on the track, including the quit-before-the-hairpin sentence. Early pit, hot pit, no clean lap, personal best, and ride complete are separate rows. Personal best requires a stored record that this stop beat. A first visit with a clean lap and a legal stop is `RIDE COMPLETE`. Test: `weekend_ride_result.test.mjs`.

**Ramp.** `ApplyRamp` from `guns-only.ride.best.v1`. No matching lap: full apex card and full reflex gains. Matching lap, not brought in: distance only, full gains. Both: distance only, half pitch-governor and lean-hold gains. Only a legal stop writes `broughtIn`. Esc does not. Test: `ReflexRampFollowsStoredLapAndBroughtIn`, `ride_best_lap_store` node tests.

**Cue rider.** `WeekendRideCueRider` reads the snapshot 30 ticks late, slews throttle 2/s, brake 4/s, steer 2/s, then `StepFixed` assisted. It does not read the centreline. Straight target 32 m/s so the opening straight still beats the hairpin's steady speed. Brake toward corner speed inside 150 m, and toward 22 m/s from 280 m, because 250 ms of lag plus the controller's own delay cannot start the stop from the 150 m cue alone. Steer gain rises inside 40 m of an apex so the 12 m look, which is still almost straight on a 39 m hairpin, actually turns the bike. Exit speed stays at corner speed while the look is still off the bow. Pit approach is 12 m/s. Steer snaps to zero on the live in-pit cue so the 250 ms lag does not keep leaning the bike on the grass while it brakes through the 6 m/s tip. Tests: `CueRiderCompletesTheArcFromAColdStart`, `CueRiderBeatsASlowSeedAndStillStops`. Both finish with a legal stop, two laps, a cool-down, and a session under 8 minutes. The cold start stays on the paint for both flying laps and is faster than the hairpin on the opening straight. The seeded case beats a 600 s lap.

**Proof.** Headless Chromium, 1400×900, `ANGLE (Apple, ANGLE Metal Renderer: Apple M5, Unspecified Version)`, `?audioQa=silent&server=off&cueRider=1` on port 8975, from a Release publish at `/private/tmp/grok-pub-grok18-build-ride`. The page driver is `ride_cue_driver.js`, the same policy as the kernel rider, used only with that query. Frames:

| File | What is on it |
| --- | --- |
| `docs/grok-overhaul/build/shots/ride-brief.png` | Title `Two laps, then bring it in`. Phase not active. |
| `docs/grok-overhaul/build/shots/ride-first-corner.png` | Leaned (−41°), `APEX 26 m · 77 km/h`. Lap clock `0:24.16`. The hairpin is leaned only after the clock passes 20 s, because the brake starts 280 m out. |
| `docs/grok-overhaul/build/shots/ride-delta.png` | Lap 2, still flying, delta `−2.88` on the card. |
| `docs/grok-overhaul/build/shots/ride-checker.png` | `CHECKER · BRING IT IN`, on the paint, 114 km/h. |
| `docs/grok-overhaul/build/shots/ride-pit.png` | `PIT · 60 km/h`, speed 57, paddock in frame. |
| `docs/grok-overhaul/build/shots/ride-stopped.png` | `STOPPED`, about 2 km/h, result card not up. |
| `docs/grok-overhaul/build/shots/ride-debrief.png` | `In the box.` Clean lap 1:25.65. Not a six-second quit. |

`shots/ride-corner.png` and `shots/ride-result.png` remain the earlier geometry and rolling-pit frames. They are not the frames above.

**Not done.** Tyre walls, radio, YRC lamps, chase cam, ghost bike, weather, a second bike, a sighting lap, a flag mesh, a mission director. μ, reflex rates, and hairpin radius were not retuned. 60 km/h was not promoted to measured. The look-ahead was not left at 1.6 s.

## 1. A corner inside the first 15 seconds

**What.** `PaintedCircuit.RapierStripWeekend` is no longer a 6 km runway oval. The hairpin builder is unchanged (authored radius 44 m, still measured above 28 m after the 0.35 blend). The control points pull both hairpins in so the first centreline heading change above 0.4 rad sits a few hundred metres from the grid, and `CircuitLengthM` is a club-circuit band of 1,200–2,600 m.

**Why.** The dead time was the control-point list, not the tyre model. A track day that starts with a minute of straight is not a lap.

**Tests.** `PaintedCircuitTests.FirstRealHeadingChangeIsAFewHundredMetresFromTheGrid`, `ClosedCircuitHasPositiveLengthAndTrackWidth` (the old `> 1500` pin still accepted the oval). `WeekendRideMissionRuntimeTests.SustainedThrottleReachesTheFirstCornerInsideFifteenSeconds` holds assisted full throttle — the same rider path as W, not raw wide-open throttle, which wheelies and resets — and requires the bike to pass that heading-change station inside 15 s, still faster than the hairpin's steady speed.

**Proof.** `docs/grok-overhaul/build/shots/ride-corner.png`. Helmet view on the paint, leaned, hairpin kerb and cones in frame, card reading `APEX 79 m · 77 km/h`. Headless Chromium, 1400×900, `ANGLE (Apple, ANGLE Metal Renderer: Apple M5, Unspecified Version)`, `?audioQa=silent&server=off` on port 8944. The scripted rider in that frame is on the brakes for the corner, so the lap clock is past 15 s; the 15 s pin is the kernel test above.

**Test updates.** `CreateDefaultSpawnsOnGridNearEasternThreshold` no longer requires world X > 1,000. That pinned the grid to the 10,000 ft threshold. The grid is still the east straight of this loop. The grass probe in `AssertCorridorIsPaved` walks outward until the runway rectangle ends. A 120 m extrapolation assumed a hairpin on the threshold; a club loop infield of that threshold is still paved at 120 m.

## 2. The corner the bike can already feel

**What.** `PaintedCircuit.NextApex` publishes distance to the next hairpin apex and the steady speed `sqrt(μ g r)`. μ is `YzfR1Definition.TirePeakFrictionCoefficient` (surrogate 1.20, `docs/vehicles/yamaha-yzf-r1/00-sources.md`). g is 9.80665. Once progress is past the apex and still inside the corner, the distance is the exit of that corner. The helmet lap card draws it (`apexCueText`).

**Why.** A braking reference has to come from geometry the tyre model already uses. A painted 3-2-1 the sim ignores is not a procedure.

**Tests.** `FirstRealHeadingChangeIsAFewHundredMetresFromTheGrid` (grid: approaching apex, steady speed 12–28 m/s, under a straight's terminal speed). `InsideTheHairpinTheReferenceIsTheExitNotTheApexUnderTheBike`. `MotorcycleSnapshotProjectionTests.FinishedStateKeepsDebriefEvidenceAtTheBrowserBoundary` requires `next_apex_m`, `next_apex_mps`, `progress_m`, `session_s`. `helmet_hud_status.test.mjs` covers the card line.

## 4. Pit-in ends the session

Superseded by the mission arc above. A roll-through at 60 km/h is no longer a finish. The box and the 60 km/h limit are unchanged.

**What.** The runtime keeps a session clock. The paddock row `track_day_presentation.js` already places beside the grid (x = clamp(grid.x − 80 − (index % 3) × 22, −900, 900), z = 54 and 68) is a pit volume. 60 km/h is the ordinary ACU/MSUK national pit-lane maximum: provisional procedure, not a measured R1 figure. Crossing the line, leaving the paint, and tipping do not finish the session. Esc → Debrief still calls `Finish()`, and that abandon is not a legal stop.

**Why.** A track day ends when you come into the pits under the pit-lane limit, not when you open a pause menu. Lap 1 was left able to count: clean and dirty laps were already separate, and a special "out-lap never counts" rule would have thrown away the only progression the ride has.

**Tests.** `WeekendRideMissionRuntimeTests.PitInBelowThePostedSpeedIsTheOnlyWorldEventThatFinishes`.

**Proof.** `docs/grok-overhaul/build/shots/ride-result.png`. Scripted centreline lap, then a roll into the paddock. The card shows 1 lap, last and record 1:47.21, and the open lap invalid because the roll to the pit left the paint. That is the session ending on a real lap, not a six-second quit.

## 5. Where you stopped, and the seeded record

**What.** `ProgressM` is on the snapshot. The result sentence uses the kernel's remaining distance to the next apex: `Stopped ~2.6 km before the hairpin.` (metres under 1 km). When a record was already seeded and this ride did not beat it, the correction is `Next · 8.0 s off the record.` No new storage.

**Why.** "Bank one clean lap" after six seconds does not say the first corner was still ahead. The carried record was already distinct from a new one; the card now says by how much.

**Tests.** `weekend_ride_result.test.mjs`: `a quit before the hairpin says how far the apex still was`, `a nearer apex is stated in metres from the same progress field`, and the carried-record case now expects the delta sentence.

## Not done

- Item 3, physical tyre walls. The cones and walls are still presentation. Off-paint still spoils the lap and still cuts μ. A wall volume that calls `ResetToGrid` was left so this slice could finish the corner, the cue, the pit, and the debrief.
- No chase camera, no YRC lamps, no riders'-meeting modal, no second bike, no terrain move.
- `RiderCerebellum` stays off the debrief. It still resets on `Begin`.

## Review fixes

`SustainedThrottleReachesTheFirstCornerInsideFifteenSeconds` no longer treats straight-line distance from the grid as proof of the corner. The rider looks ahead on the centreline, brakes when that heading departs, and the test requires circuit `ProgressM` past the first 0.4 rad bend, `IsOnTrack`, and a yaw change of more than 0.4 rad from the grid heading. Peak speed on the straight still has to clear the hairpin's steady speed.
