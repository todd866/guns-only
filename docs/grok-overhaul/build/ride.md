# Weekend Ride — build slice

Club loop on the Rapier strip, a braking reference from the centreline, pit-in as the way the session ends, and a debrief that says where you stopped.

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

**What.** The runtime keeps a session clock. The paddock row `track_day_presentation.js` already places beside the grid (x = clamp(grid.x − 80 − (index % 3) × 22, −900, 900), z = 54 and 68) is a pit volume. Rolling into it at or under 60 km/h calls `Finish()`. 60 km/h is the ordinary ACU/MSUK national pit-lane maximum: provisional procedure, not a measured R1 figure. Crossing the line, leaving the paint, and tipping do not finish the session. Esc → Debrief still calls `Finish()`.

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
