# Fire Boss — scoop approach, flank, hold, shore mark

Audit items 1–4 from `docs/grok-overhaul/audit/fireboss.md`. Item 5 (a fire that remembers you) was not in this slice.

## 1. Initial Attack and Large Force start on the scoop approach

**What.** `CreateForPlayer` for Initial Attack and Large Force spawns airborne over the live north scoop lane, phase `JoinScoop`, hopper empty, cue `FLY DESCEND OVER LAKE`. Water Circuits still starts on Runway 16. `Create()` still starts every sortie on the runway, so the full ferry remains available to tests.

**Why.** The Kelowna departure was most of the clock on the two fire sorties. The defence runs already showed that starting near the work is the right cut. Skipping the scoop as well would repeat the defence mistake: the scoop is the aircraft. The first gate is the descent onto the lane that already exists (`scoop-entry` through `scoop-lane`).

**Audit correction.** `FireBossDynamics.OnScoopApproach` is not an unused spawn. It is the retired southern lane (49.820, −119.568) and dynamics tests still fly it. Pointing the mission there would send the player away from the north lane. The player join is `AtNorthScoopApproach`: 49.898, −119.516, 420 m, heading north, 47 m/s. The hill-crossing gate (`lake-arrival`) is omitted on this start, because that gate exists to get a runway departure down over the water. Entering the drop does not rewind the ingress corridor for this start; the line you are already on stays the line.

**Fuel.** Same block as the runway fire sortie: 760 kg, taxi still on the ladder. Not the 610 kg dynamics-fixture default.

**Tests.** `PlayerAttackStartsOnTheNorthScoopApproachAndStillScoops`. `InitialAttackScoopsWithinSecondsAndDropsWithinMinutes` — on the step at 68 s, loaded in the drop phase inside 9 minutes. The test pilot's release window is 110 m from the fire centre, and the drop gates sit further out, so that flight proves the aircraft arrives with a load. Crediting the load is items 2 and 3.

**Proof.** `docs/grok-overhaul/shots/fireboss-initial-attack-start.png`. Headless Chromium, Apple M5 / Metal, 1400×900, `?audioQa=silent`. Water ahead, hopper `0 / 2,077 L`, command `DESCEND OVER LAKE`. Not `FLY DEPART 16`.

## 2. Grass into timber is a flank the drop can miss

**What.** The Boucherie grid no longer hashes C-7 / O-1 / M-1. Open grass (O-1) is the windward side of the fire, timber (C-7) is downwind. An effective drop on Initial Attack or Large Force requires the existing 420 kg gate and a release whose 185 m footprint wets both. A load that stays in one fuel is dumped and does not count. Defence fires keep their own fuels and still score on buildings.

**Why.** "Grass into timber" is the lead-plane call already on the radio: start in light fuel and carry the load into heavy fuel so the line joins. A hash has no flank to join.

**Wind.** `okanagan-central.world.json` `fire.windFromDeg` 205 and `windSpeedMps` 8.5. The wind blows toward 25°. Spread uses that velocity vector. The old 1.75 downwind peak is recovered at 8.5 m/s, so this authored wind does not retune the game spread; a different speed would. Epistemic label: authored exercise wind, not a forecast. `BoucherieWindMatchesTheAuthoredWorldFire` reads the embedded world file.

**Tests.** `BoucherieFlankIsOpenGrassOnTheWindwardSideAndTimberDownwind`. `ADropEntirelyInOneFuelDoesNotCountUntilItCrossesIntoTheOther`.

## 3. The Air Attack hold withholds the drop

**What.** Water released while the phase is `Hold` still leaves the aircraft and increments `WaterReleasedKg`. It is not applied to the fire, so `EffectiveDrops` stays 0. The same release after the existing 12 s dwell inside 1,350 m counts, once it also crosses the flank. Until that clearance, a drop is also withheld while Helco is inside 200 m of the fire. After clearance, Helco's orbit does not keep vetoing the drop: the sine wave never leaves the fire, and a permanent veto would make the sortie impossible. The clearance call is still "west flank, north to south."

**Why.** Bird-dog practice is that you do not drop until Air Attack clears you, and another aircraft on the line is a conflict. The radio already said "hold west." The sim now refuses the early load.

**Tests.** `AirAttackHoldDumpsWaterWithoutCreditingItUntilTheLineIsClear`. `LargeForceHoldWaitsForAirAttackClearance` is unchanged.

## 4. The training drop is on the shore

**What.** The practice mark is on the bench east of the lake at 49.953, −119.448, at terrain height, not 1.8 km south of downwind on the water. The pattern gate above it stays at least downwind altitude, and at least 120 m above the bench, so the circuit does not become a descent into the hill. A water-circuits salvo counts only when the release is inside the same 185 m footprint `ApplyWater` uses. A release over the lake during downwind does not increment `CompletedCycles`. The overweight-landing cue `RTB · RELEASE LOAD OVER LAKE` is unchanged.

**Why.** Dumping on the lake to get under landing weight is a real out. Teaching the drop that way throws away the only feedback a flat screen can give: did the load hit the mark. The debrief already prints `1 circuit` from `completed_cycles`, so a miss stays "No complete circuits."

**Tests.** `TrainingCircuitCountsOnlyAReleaseThatCoversTheShoreMark`. `WaterCircuitsPublishTheLakePracticeDrop` and `WaterCircuitKeepsItsDescentAndLoadedTakeoffOverMappedWater` now require the mark to be on land; the scoop lane itself stays over water. `RealAircraftScoopsWorksAndStopsOnTheRunway` for Water Circuits still finishes the circuit and stops on the runway. The test pilot releases on the mark's footprint instead of anywhere inside the 900 m gate.

**Proof.** `docs/grok-overhaul/shots/fireboss-training-mark.png`. The orange ring and flag are on the timber bench, with the lake to the east of the camera. This frame is the practice camera (`preview=practice`) while the aircraft is still on the runway, so the HUD still says `DEPART 16`. The circuit count is the kernel test, not this frame.

## What this slice did not do

- Item 5, a fire that persists across launches.
- Foam, a door-time trail, retardant, another defence hill, or more radio.
- Moving `OnScoopApproach` or any shared runway fixture.
- A letter grade, a coverage knob, or a campaign unlock.
- Committing. This worktree was told not to commit.

## Checks

- `dotnet test sim.Tests --filter FullyQualifiedName~Okanagan|FullyQualifiedName~FireBoss` before the shore-gate altitude fix: 189 passed, 1 failed (`RealAircraftScoopsWorksAndStopsOnTheRunway` / WaterCircuits — the mark sat on the ground and the aircraft hit the hill).
- After raising the drop gate: that flight theory, `TrainingCircuitCountsOnlyAReleaseThatCoversTheShoreMark`, `BoucherieWindMatchesTheAuthoredWorldFire`, and `WaterCircuitKeepsItsDescentAndLoadedTakeoffOverMappedWater` — 8 passed.
- `BoucherieWindMatchesTheAuthoredWorldFire` again after the assertion-order warning — 1 passed.
- Headless shots on port 8941, `ANGLE Metal Renderer: Apple M5`. No `bin/check`.

## Review fixes

A pass is no longer credited because grass and timber were each wet somewhere. Water released on consecutive ticks stays one footprint while each step remains inside `DropFootprintRadiusM` (185 m). A gap or a jump starts another footprint. Boucherie counts only when one footprint wets both O1 and C7. The training mark counts only the mass released inside that same radius of the shore mark, and the circuit completes only when that mass reaches the existing 0.85 load fraction. `Separate` coverage is `DropsAfterSplitRelease` inside `ADropEntirelyInOneFuelDoesNotCountUntilItCrossesIntoTheOther`. `TrainingMarkRequiresTheCompletionFractionOnTheMark`.
