# Weekend Ride — mission design

ID: `ride`. Route `/weekend-ride/`. Vehicle: 2020 Yamaha YZF-R1, `yamaha-yzf-r1-2020`. Place: the club loop `PaintedCircuit.RapierStripWeekend` on the Rapier strip. This is a design spec. It does not change product code.

The build slice already did the geometry: a club loop, a first corner inside 15 s, an apex speed from the tyre, a paddock box, and a debrief that can say where you stopped (`docs/grok-overhaul/build/ride.md`). What is live is still an open practice that ends when you roll through that box under 60 km/h, or when you press Esc. The audit's complaint stands for the session, not for the length of the straight (`docs/grok-overhaul/audit/ride.md` in the audit worktree). A lap is not a mission. The mission is two timed laps, a cool-down, and a stop in the paddock. The result card follows the stop.

Target length: **about 6 minutes of riding**, plus the brief. Two flying laps and one cool-down. The build proof's scripted centreline lap was 1:47.21. A rider who uses the straights will be quicker. Three laps at that order is the session. A 15–20 minute club practice is not played.

## 1. The fantasy

You are off duty. The Rapier strip is closed to aeroplanes for the afternoon and painted as a club circuit, and the 2020 R1 in the paddock is yours. The sighting laps are already done. This is the last session: two timed laps, then the checker, one cool-down lap, and you stop the bike in your box. Nobody else is on track. There is no race and no trophy. What you can lose is the clean lap you came to bank, and a bike you did not bring back.

## 2. The arc

Clock times below assume a lap on the order of 1:30–1:50, which is the build proof, not a promise. The circuit length is only pinned to 1,200–2,600 m (`sim.Tests/Motorcycle/PaintedCircuitTests.cs:167`). The first real heading change is 120–450 m from the grid (`PaintedCircuitTests.cs:282`). Do not time-warp a straight. The long piece that used to be 2.7 km is already gone.

There is no weather seed and no second bike. "Most seeds" for this mission means the one normal condition the kernel actually has: still air, density 1.225, wind zero, runway friction 2.5, grass 0.75 (`WeekendRideMissionRuntime.cs:309-322`). A stored best lap is a second condition, not a random seed. The acceptance rider must finish both.

### 0:00–0:20 — Brief, bike on the grid, authority paused

**Does.** Reads three facts and presses Start. Does not sit a riders' meeting.

**Shows.** The card, still a dialog over a paused grid (`weekend-ride/index.html:45-64`). Replace the current copy. Kicker stays `RAPIER AIRFIELD · TRACK-DAY BRIEF`. Title: `Two laps, then bring it in`. Summary: `Sighting laps are done. Two timed laps, the checker, one cool-down, stop in the box.` Facts: `Laps / Two, then cool-down`, `First corner / a few hundred metres`, `Finish / stop in the box`. The correction line, only when `guns-only.ride.best.v1` has a matching circuit: `Record · m:ss.ss`. No sector lecture, no flag legend, no control list. Controls stay on the aside that collapses after Start, where they already are.

**Checks.** Phase `Ready` until `Begin()` (`WeekendRideMissionRuntime.cs:110-116`). The best-lap seed already runs from `ride_best_lap_store.js` (`RIDE_BEST_STORAGE_KEY`, line 12). **Missing:** the card still says "One clean lap" and "Pause · End ride" (`index.html:51-56`).

**Why.** The player learns the shape of the session before the clutch is out. Twenty seconds. The real riders' meeting is not a page; the rules it would have read are the rules the sim enforces, below.

### 0:20–0:35 — Launch and the first corner

**Does.** Opens the throttle, brakes before the first hairpin, turns, gets back on the power. Arrows for body if they want them. Default is assisted, auto-clutch (`MotorcycleRiderController.cs:98-116`).

**Shows.** Helmet view, the road, the lap card line that already exists: `APEX {distance} · {km/h}` from `apexCueText` (`helmet_hud.js:36-47`). Speed, gear, rpm. Nothing else until something is wrong. When speed is above `next_apex_mps` and distance is under 150 m and the cue is not the exit, that same line is the brake cue: draw it in the caution tone. Do not add a second line that says "BRAKE".

**Checks.** `NextApex` is `sqrt(μ g r)` with μ = `TirePeakFrictionCoefficient` 1.20 and g = 9.80665 (`PaintedCircuit.cs:206-215`, `YzfR1Definition.cs:59`). At the grid the steady speed is 12–28 m/s, under a straight's terminal speed (`PaintedCircuitTests.cs:283-289`). Assisted full throttle reaches that heading change inside 15 s (`WeekendRideMissionRuntimeTests.SustainedThrottleReachesTheFirstCornerInsideFifteenSeconds`). Off the paint: `OnTrack` false, `off_track_s` accumulates, the lap cannot become the best (`RideLapTiming.cs:8-10`, `WeekendRideMissionRuntime.cs:150-155`). Grass grip is `0.75 / 2.5` of pavement μ (`YzfR1Dynamics.cs:383-388`). A tip sets a 1.5 s flash and `ResetToGrid` (`WeekendRideMissionRuntime.cs:173-176`, `:211-223`).

**Missing.** The caution tone on the existing apex line. A signed look-ahead for the acceptance rider (segment 7). The cones and tyre walls are still meshes (`build/ride.md`, "Not done").

**Why.** This is the first decision, and it arrives before the player is bored. Fifteen seconds.

### 0:35–2:10 — Rest of lap 1, including the far hairpin

**Does.** Rides the return straight and the second hairpin. Same job: be at the posted speed at the apex, stay in the paint, cross the line.

**Shows.** The apex card switches to the far hairpin, then to `EXIT` once progress is inside the corner (`PaintedCircuit.cs:222-234`). Lap clock. No delta yet unless a record was seeded. Off-paint and tip-over use the lines `helmet_hud.js` already has (`OFF COURSE`, `LAP SPOILT`, `TIP-OVER · RECOVERED`, `helmet_hud.js:50-67`).

**Checks.** Lap index increments only on a forward crossing that armed the sectors (`PaintedCircuitTests.cs:214-226`). A dirty lap is stored and cannot become `BestLapSeconds` (`RideLapTiming.cs:8-10`). **Missing:** sector gates are still 25 / 50 / 75 percent of path length (`PaintedCircuit.cs:174`, `RideLapTiming.cs:14-17`). Those are not the two hairpins. Move the three gates to the first apex, the first-hairpin exit, and the second apex, so the four splits are opening straight, first hairpin, return straight, second hairpin. `RideLapTiming` already consumes whatever gates the circuit reports. Do not add a fifth split.

**Why.** The return straight is a few hundred metres, not a minute of runway. The interesting event on it is the second braking point. Do not compress it.

### 2:10–4:00 — Lap 2, the lap that can mean something

**Does.** Same two corners, now against the lap they just rode, or against the stored record.

**Shows.** The live delta that `DeltaToBestSeconds` already computes (`WeekendRideMissionRuntime.cs:88-89`) and the helmet card already has a place for. No new instrument.

**Checks.** `SeedBestLap` plus the 32-sample split profile (`WeekendRideMissionRuntime.cs:227-232`, `RideLapTiming.cs:20-21`). A clean lap 2 that beats the seed is the personal best. A dirty lap 2 leaves the record alone.

**Why.** One lap cannot be a chase. The second lap is the chase. That is the whole scoring game. There is no opponent to add.

### 4:00 — The checker, as you cross the line to start lap 3

**Does.** Nothing special at the line except notice the session changed. Does not stop on the racing line.

**Shows.** The lap card replaces the running flyer with `CHECKER · BRING IT IN`. The apex card stays, because the cool-down still has two hairpins. The minimap does not grow a flag legend.

**Checks.** **Missing.** Add `session_leg` on the snapshot: `flying` until `LapCount` reaches 2, then `cooldown`. `Finish()` must not run on the line (`WeekendRideMissionRuntime.cs:181-185` already refuses that, and the pit test pins it). The cool-down lap is timed and shown, and `RideLapTiming` must refuse it as a record even if it is clean. Today every clean lap can become the best. That is the hole.

**Why.** The checker is the moment the task changes from "go faster" to "bring it home". One line of HUD. No announcer.

### 4:00–5:40 — Cool-down lap

**Does.** Rides both hairpins at a pace that stays upright. The apex speed is still the speed the radius holds; the cool-down is not a licence to tip into the hairpin at straight speed. On the opening straight, once the pit cue is up, leaves the paint on purpose and aims at the box.

**Shows.** `CHECKER · BRING IT IN` until the pit cue. Then the apex line is replaced by `PIT · 60 km/h`, plus the signed look-ahead tick aimed at the box instead of the centreline. Speed, so 60 is comparable. No paragraph.

**Checks.** **Missing.** `pit_open` becomes true on the cool-down only, when remaining distance to the start/finish is inside 120 m (the paddock already sits beside the grid: `PitLaneBeside`, `WeekendRideMissionRuntime.cs:325-338`). Leaving the paint on a flying lap still spoils that lap. Leaving the paint while `pit_open` does not add `off_track_s` and cannot dirty a flyer, because the flyer already closed. There is no brake-temperature or tyre-temperature state (`00-sources.md` gaps; the August design listed tyre temperature out of scope). Do not invent a cool-down by painting a temperature that does not move a force. The cool-down is real because the lap does not count and the next task is the box.

**Why.** This lap is a different job: you still have to make the corners, and then you have to find the pit, which is off the racing line. That is the content. It is one lap, not a parade.

### 5:40–6:10 — Pit-in to a stop

**Does.** Is at or under 60 km/h before the bike is inside the box. Rolls in. Holds the brake until the bike is stopped. Does not need a button to "end the ride".

**Shows.** `PIT · 60 km/h` while moving in the box. If the entry was legal and speed is under the stop threshold, `STOPPED`. If the entry was hot, `PIT SPEED` and the session does not end, including if they then slow down without leaving.

**Checks.** Today the wrong rule is implemented well: inside `PitLane` and `SpeedMps <= PitLaneSpeedLimitMps` (60/3.6) calls `Finish()` on that tick (`WeekendRideMissionRuntime.cs:24-28`, `:181-185`). The test even finishes from a `ResetTo` into the box centre with zero throttle (`WeekendRideMissionRuntimeTests.cs:461-464`). That is a roll-in, not a stop, and a teleport would satisfy it. Replace it.

A legal stop, all of these:

- `session_leg` is `cooldown` or the rider has chosen to come in early (early pit is allowed; see stakes).
- The first tick of this occupancy with `PitLane.Contains` had `SpeedMps <= PitLaneSpeedLimitMps`.
- Speed then stays `<= LapTimingStartSpeedMps` (0.5 m/s, `WeekendRideMissionRuntime.cs:23`) for 0.5 s continuous.
- Only then `Finish()`.

A hot entry latches that occupancy as illegal. Slowing down inside it does not finish. Leaving the box clears the latch; the next entry is judged on its own first tick. Crossing the line, leaving the paint, and tipping still do not finish. Esc → Debrief still calls `Finish()` and is an abandon, not a stop.

**Why.** The session ends when the bike is parked, the way a track day ends. Forty seconds of a real arrival, not a menu.

### Then the result card

Phase `Finished` opens the existing result overlay (`weekend-ride/index.html:82-109`). The card does not appear at the line, at 60 km/h, or on a tip. Copy is section 4. Retry starts a new `Begin()`. Aircraft returns to the picker. Both already exist.

### What is not in the arc

- A sighting lap. Grip does not change, so it would be lap 1 twice. The brief says the sighting laps are done. That is the compression, and it is stated.
- A 20-minute clock, fuel, tyre warmth, a pace bike, or another rider. None of those exist. Adding them to fill time recreates the dead air the build slice removed.
- Radio. Section 3.

## 3. Real procedure

This is a closed-course track day on a 2020 R1, ridden solo because the kernel has one bike. It is not a race start, not a NATOPS recovery, and not the Yamaha YRC menu.

**The bike, as modelled.** Mass, geometry, claimed power and the 56° lean figure are measured OEM numbers (`docs/vehicles/yamaha-yzf-r1/00-sources.md:32-51`). Gearbox ratios, redline 14,500, μ 1.20, inertias, CdA, and the brake forces are surrogate or estimate (`00-sources.md:71-103`). The rider reflex numbers are provisional, not a biometric claim (`00-sources.md:68`, `MotorcycleRiderController.cs:36-38`). ABS, traction control, slide control, lift control, launch control, and the quickshifter are out of scope on purpose (`00-sources.md:127-128`). Do not draw them. A lamp that does not change `YzfR1Dynamics` is the cargo cult the sources file already forbids.

**What a track day actually requires of the rider, and what this session keeps.**

| Real thing | Source class | In this mission |
| --- | --- | --- |
| Riders' briefing: flags, pit speed, where you may pass | Ordinary organiser practice (MSV track days, ACU road-race meetings, US track-day providers). Not re-opened as a PDF in this spec. | Not a modal. Passing is vacuous with one bike. The enforceable leftovers are paint, the apex speed, 60 km/h, and the stop. |
| Sighting laps, often untamed, no passing | Same practice. The point is cold tyres and an unknown line. | Not played. μ is constant 1.20. Said in the brief. |
| Open laps, timed only if you want a number | Same. | Two flying laps. A clean one can become the record. |
| Chequered flag, complete the lap, do not stop on the racing line | Circuit practice, not a fighter manual. | `session_leg = cooldown` at lap 2. The lap is ridden. It cannot be the record. |
| Pit-lane speed, commonly 60 km/h in ACU / Motorsport UK national supplements | The kernel already labels this provisional, not a measured R1 figure (`WeekendRideMissionRuntime.cs:24-28`). This spec does not promote it to measured. | Entry at or under 60, or the stop does not count. |
| Stop in your pit box, session over | The thing the owner asked for. | 0.5 s at or under 0.5 m/s inside `PitLane`. |

Uncertainty, stated once: nobody on this pass opened the 2020 Yamaha owner's manual PDF, the ACU Handbook, or the Motorsport UK Yearbook. The 60 km/h figure stays provisional. If a supplement for a named circuit says 40 or 50, change the constant and the HUD together. Do not invent a second limit.

**Radio.** `audio/radio/mission/lines.json` is a fighter net. Roles are tower, controller, LSO, and Rapier pilots. Every clip is a callsign, a pattern call, a weapon, or a fuel state. None of them are a marshal, a pit, or a checker. The nearest wrong ideas are `tower-hold-position` ("Ghost One One, hold position.", an arrestment call), `pilot-bingo` ("Ghost One One, Bingo."), and `pilot-rtb` ("Control, Ghost One One, RTB."). Playing any of them on a motorcycle is stolen cockpit audio. **No clip fits. The ride stays silent of radio.** New lines are forbidden, so do not write a marshal.

## 4. Stakes, failure, partial success

The bike does not bend, and a tip does not end the day. `ResetToGrid` puts you on the grid with the lap abandoned and the session clock and `off_track_s` kept (`WeekendRideMissionRuntime.cs:211-223`). The debrief must not talk about a walk back or a broken fairing. It may say the bike was back on the grid.

There is no injury and no DNF points table. Outcomes:

**Brought in.** Legal stop in the box. This is success even if the laps were dirty. The session you came to ride includes the stop.

**Clean lap.** At least one flying lap with `CurrentLapValid` all the way across the line. The cool-down cannot supply this.

**Record.** That clean lap beat `recordAtStartSeconds`, the rule `weekend_ride_result.js` already uses (`improvedRecord`, lines 39-40).

Debrief sentences. The result function grows fields; it does not grow a paragraph. Metrics already on the card (laps, last, record, open lap, off track) stay.

| What happened | Title | Summary | Correction |
| --- | --- | --- | --- |
| Legal stop on the cool-down, at least one clean flying lap, no stored record beaten | `RIDE COMPLETE` | `In the box. Clean lap {last}.` | `Next · repeat it clean.` |
| Same, and the clean lap beat the stored record | `PERSONAL BEST` | `In the box. New record · {record}.` | `Next · the corner speed comes off the card.` |
| Legal stop, no clean flying lap | `IN THE BOX` | `In the box. No clean lap. {off} s off the paint.` | `Next · both hairpins inside the paint, then the box.` |
| Legal stop during the flying laps, before the checker | `CAME IN EARLY` | `In the box on lap {n}. The checker was still out.` | `Next · take both laps, then bring it in.` |
| Legal stop, but an earlier occupancy of the box was over 60 | `IN THE BOX` | `In the box. One pit entry was over 60 km/h.` | `Next · be at 60 before the box, then stop.` |
| Esc → Debrief, never stopped, no tip | `STILL ON TRACK` | `Still on track. Stopped ~{distance} before the hairpin.` | `Next · the session ends in the box.` |
| Esc → Debrief after at least one tip, never stopped | `STILL ON TRACK` | `Still on track. The bike went back to the grid.` | `Next · bring it in.` |
| Legal stop after a tip, and a later flying lap was clean | `RIDE COMPLETE` | `In the box. Clean lap {last}. The bike went back to the grid once.` | `Next · repeat it clean.` |

`{distance}` reuses `stoppedBeforeHairpin` (`weekend_ride_result.js:13-17`). Under 1 km it is metres. A tip plus a dirty day uses the "no clean lap" row and adds the grid sentence only when a tip happened. Do not stack three corrections. One summary, one next line.

Hot pit entry is not a black flag and not a failure by itself. You are still riding. The card mentions it only if you eventually stop. If you quit on Esc after a hot entry, the summary is the still-on-track line; the speed bust is not the headline.

Partial success is a real card, not a scold. In the box with no clean lap is a completed session and a missed record. In the box before the checker is a completed stop and a missed session. Still on track is the miss: you left before the ending.

## 5. Difficulty

No difficulty menu. No "new rider?" gate. Same idea as the F-22 ramp: the crutch fades when the device has evidence, and a cue that restates a sim fact is allowed (`docs/grok-overhaul/audit/difficulty-ramp.md`, "Honest on a flat screen"). Do not call `FightDirector`. A gun rung must not scale this bike. The ride's store is `guns-only.ride.best.v1`.

Two crutches exist today, and they are different:

- The apex km/h is a fact, `sqrt(μ g r)`. Showing it is honest. It does not move the bars.
- Assisted mode is a limited crutch that does move the bike: 7 ticks of delay, rate limits, a pitch governor that chops a wheelie you did not ask for, and a lean hold (`MotorcycleRiderController.cs:42-61`). It is labelled, and `T` selects raw. That is the right seam. Do not add a line-follow on top of it.

Ramp, from the store, applied at `Begin()`:

| Evidence on the device | Apex card | Reflex gains |
| --- | --- | --- |
| No matching clean lap | Distance and km/h | Full, assisted by default |
| A matching clean lap, and no brought-in session | Distance only | Full |
| A matching clean lap, and a session that stopped in the box | Distance only | Half |

Half means the pitch-governor and lean-hold gains, published on the snapshot fields that already exist (`PitchReflexAuthority`, `LeanHoldAuthority`). `T` still goes to raw, gains zero, at every rung. A corrupt store is "no best yet", which the store already does (`ride_best_lap_store.js:5-7`), and that rung is the full card and full gains. Quitting on Esc does not write "brought in". Only a legal stop does. That bit has to be added to the same key; a lap time alone cannot prove the stop.

First visit: the number tells you the corner, the reflexes keep an accidental wheelie from looping the bike, and the first corner is 15 s away. That is approachable. It is not a riding line drawn on the asphalt.

Fifth visit: the circuit does not change, and it should not. A new hairpin every day would be a different game. What changes is the record you are chasing, the missing km/h, and reflexes at half if you have parked the bike once. The fifth run is interesting if you care whether you are 0.3 s up at the second apex. If you do not, the mission is short on purpose and you still have to bring it in. Do not add weather, a ghost bike (STATUS records the ghost as cut), or a tyre-wear campaign to manufacture variety.

`RiderCerebellum` resets on `Begin()` (`WeekendRideMissionRuntime.ResetMissionState` calls `Bike.ResetTo`, and the build notes say the cerebellum dies there). It is not a ramp. Leave it off the card and off the debrief.

## 6. What to cut, what to keep

**Cut from the current session, or stop pretending it is the mission.**

- "Bank a clean lap" and "Pause · End ride" as the objective (`index.html:51-56`). The objective is the stop after two laps.
- `Finish()` on a rolling entry at 60 km/h (`WeekendRideMissionRuntime.cs:183-185`).
- Esc as the success path. Keep it as the abandon.
- Equal-length sectors as if they were corners (`PaintedCircuit.cs:174`).
- The static cream flag as information. It does not change (`audit`). The checker is the HUD line. Do not animate a flag the kernel does not own.
- Any YRC lamp, chase camera, combo meter, letter grade, or ghost bike.
- A riders'-meeting modal, a flag key, a numeric briefing page.
- Tyre temperature text. There is no temperature state.
- Radio, including the three clips that almost sound reusable.
- Retuning μ, the reflex rates, or the hairpin radius to make the lap exciting. The lap is exciting at the two apexes or it is not.

**Keep.**

- The club loop and the 15 s first-corner test.
- Helmet view, no chase camera. Lean is the camera.
- Assisted / raw on `T`, auto-clutch by default, manual on `C`.
- The apex card's distance and `sqrt(μ g r)`, until the ramp removes the speed.
- Paint as the legal line, grass at 0.3 of pavement μ, tip-over back to the grid with the lap abandoned and the session kept.
- The paddock box coordinates the presentation already uses.
- `guns-only.ride.best.v1`, the delta, and a dirty lap that is shown and cannot be the record.
- The result card's distance sentence for a quit before the hairpin.
- Physical tyre walls still not done. Leave them out of this mission. Off-paint already has a consequence. A wall volume is a later slice, not the ending.

## 7. Acceptance

A deterministic rider completes the arc, including the stop, in the normal condition, and again with a seeded best lap. There is no random seed to sample. "Most seeds" is this: both of those conditions finish. The rider is not allowed to `ResetTo` onto the centreline or into the box. The pit test that does that (`WeekendRideMissionRuntimeTests.cs:451-464`) is not this test.

The rider, `WeekendRideCueRider`:

- Reads only snapshot cues: speed, `next_apex_m`, `next_apex_mps`, `next_apex_exit`, `on_track`, `lap`, `session_leg`, `pit_open`, `look_ahead_lateral_m`, `in_pit`, `pit_entry_legal`.
- Decisions update 30 ticks late (250 ms at 120 Hz).
- Intent slew is bounded: throttle 2.0 per second, brake 4.0 per second, steer 2.0 per second. It then goes through `StepFixed(intent, Assisted)`, so the existing 7-tick delay and rate limits still apply. Raw mode is not the acceptance path.
- Straight: throttle toward 1 until the apex cue is not the exit, distance < 150 m, and speed > `next_apex_mps`. Then brake toward that speed and steer to null `look_ahead_lateral_m`.
- `look_ahead_lateral_m` is the signed lateral miss, in metres, of the centreline point 0.8 s ahead at current speed, minimum 12 m. The helmet draws it as one tick on the horizon, not a number and not a ribbon. **Missing today.**
- When `pit_open`, the look-ahead target becomes the pit-box centre instead of the centreline, and the rider brakes toward 12 m/s before `in_pit`, then toward 0 once `in_pit` and `pit_entry_legal`.
- It does not shift body, change gear, or toggle the clutch. Auto-shift is already in the powertrain.

Pass: phase `Finished`, a legal stop, `LapCount >= 2`, `session_leg` was `cooldown`, session time under 8 minutes, `IsOnTrack` for the whole of both flying laps, speed on the opening straight of lap 1 exceeded the hairpin steady speed. Seeded-record case: same, and the debrief is the personal-best row only if the rider beat the seed. The cue rider is not required to beat a tight seed. Plant a seed slower than its own lap if the test wants that row.

Fail the build if the only way to go green is to teleport, to finish while still rolling, or to skip the cool-down.

Headless screenshots, 1400×900, Chromium headless, hardware GPU string recorded, `?audioQa=silent&server=off`. One frame is not the test. Each frame has to show the cue for that segment.

| File | Segment | What is on the frame |
| --- | --- | --- |
| `docs/grok-overhaul/design/shots/ride-brief.png` | Brief | Title `Two laps, then bring it in`. Phase not active. |
| `docs/grok-overhaul/design/shots/ride-first-corner.png` | First corner | Helmet, leaned, apex line with metres and km/h, lap clock under 20 s. |
| `docs/grok-overhaul/design/shots/ride-delta.png` | Lap 2 | Delta on the card, still `flying`. |
| `docs/grok-overhaul/design/shots/ride-checker.png` | Cool-down | `CHECKER · BRING IT IN`, bike on the paint, moving. |
| `docs/grok-overhaul/design/shots/ride-pit.png` | Pit entry | `PIT · 60 km/h`, speed at or under 60, paddock in frame. |
| `docs/grok-overhaul/design/shots/ride-stopped.png` | Stop | `STOPPED`, result card not up yet, or the card in the same shot only if the stop and the card are both visible and the speed readout is ~0. Prefer the stopped bike, then the card. |
| `docs/grok-overhaul/design/shots/ride-result.png` | Debrief | `In the box.` and a clean-lap time. Not a six-second quit. |

`docs/grok-overhaul/build/shots/ride-corner.png` and `ride-result.png` are evidence for the build slice. They are not these frames. The result shot in the build slice is a rolling pit-in with the open lap invalid. This mission's result shot is a stop after the cool-down.

## 8. Implementation plan

Reuse the runtime, the lap timer, the apex cue, the pit box, the result function, and the best-lap store. Do not add a mission director, a flag mesh, or a radio hook.

**Step 1. Cool-down leg.** After `LapCount` reaches 2, snapshot `session_leg = cooldown`. `RideLapTiming` still times that lap and may show it as the open lap. It must not write it into `BestLapSeconds` or the split profile, clean or not. A flying-lap record already stored stays the record. Test: two clean centreline laps set a best; a third clean lap leaves that best unchanged; `Phase` stays `Active`. Files: `WeekendRideMissionRuntime.cs`, `RideLapTiming.cs`.

**Step 2. Stop, not a roll-through.** Replace the finish predicate in `StepFixed` (`WeekendRideMissionRuntime.cs:181-185`). Legal entry, then 0.5 s at or under 0.5 m/s. Hot entry does not finish when speed later drops. Leaving the box clears the latch. Early pit during `flying` is allowed and sets a `cameInEarly` bit. Rewrite `PitInBelowThePostedSpeedIsTheOnlyWorldEventThatFinishes`: a `ResetTo` into the box at 0 m/s may still prove the predicate, but add a ridden case that rolls in above 60, slows, stays `Active`, exits, re-enters under 60, holds the stop, and only then is `Finished`. Esc `Finish()` stays.

**Step 3. Pit-open and off-paint.** `pit_open` on the cool-down inside 120 m of the line. While `pit_open`, off-paint does not add `off_track_s`. On a flying lap it still does. Test both.

**Step 4. Look-ahead cue.** Publish `look_ahead_lateral_m` as specified. Helmet draws one tick. `helmet_hud` test: the string is not a number lecture; the tick flips sign with the miss. Projection test: the field is on the JSON.

**Step 5. Sector gates.** Move `PaintedCircuit`'s three gates onto the first apex, that hairpin's exit, and the second apex. `RideLapTiming.SectorCount` stays 4. Test: a centreline walk closes sectors at those progresses, not at 0.25/0.50/0.75.

**Step 6. HUD copy.** Apex caution tone under 150 m when fast. `CHECKER · BRING IT IN`. `PIT · 60 km/h`. `PIT SPEED`. `STOPPED`. Brief strings in `index.html`. Tests in `helmet_hud_status.test.mjs` and the brief smoke that currently expects the title `Bank a clean lap` (`web/smoke/production-routes.mjs:179`). Update that assertion to `Two laps, then bring it in`. Do not delete it.

**Step 7. Debrief rows.** Extend `weekendRideResult` with the table in section 4. Each row is one assertion in `weekend_ride_result.test.mjs`. Keep the existing quit-before-the-hairpin sentence for the Esc case.

**Step 8. Ramp bit.** On a legal stop, persist `broughtIn: true` beside the best lap in `guns-only.ride.best.v1`, keyed to circuit length the way the lap already is. `Begin` reads it: no lap → full card, full gains; lap and no stop → distance only, full gains; both → distance only, half reflex gain. Test the three. A missing key is the first row. Do not read `FightDirector`.

**Step 9. Cue rider.** `WeekendRideCueRider` as specified, in `sim.Tests`. Assert the pass conditions in section 7 for a cold session and a slow seeded record. Run it. If it cannot make the hairpin on the cues alone, fix the cue or the rider's brake window. Do not fix it by teleporting, by raising μ, or by driving from `Circuit.Centreline` inside the rider. The rider may use the snapshot only.

**Step 10. Screenshots.** The seven frames in section 7, headless, hardware GPU, closed afterwards. Kernel tests are the behaviour proof. The frames prove the cue was on the glass.

Order is the dependency order. Steps 1–3 are the mission. Steps 4–7 are how a person and the cue rider can see it. Step 8 is the fifth-run ramp. Step 9 is the acceptance. Step 10 is the pictures. Stop after step 3 and the session already ends in the box; do not ship the pictures as a substitute for step 9.
