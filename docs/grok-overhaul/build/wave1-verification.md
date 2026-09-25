# Wave-1 verification fixes

Remaining review items after the overhead, gun-pit, and Top Gun slices. No new radio lines. Nothing drawn changed, so there is no headless frame.

## 1. Gun-pit chord from the aircraft to the first cue

`BuildPathGates` already lifted both ends of every cue-to-cue segment to the sampled surface plus `GunPitCueClearanceM` (36 m, the Camp Ember departure rotor-clearance surrogate, not a surveyed attack altitude). The aircraft is not a cue. Lifting only the first cue to the ridge top left the straight line from a lower aircraft cutting the ridge.

The first cue is now raised until that chord clears every 100 m sample. Later cues stay put when the ridge is only on the first segment.

Procedure: the transit to the next gun pit has to be flyable, not a cue floating above a ridge the path still intersects.

Tests: `GunPitChainClearsTheRidgeBetweenTheAircraftAndTheFirstCue` (failed first: chord 430.3 m under a 676 m floor), `GunPitChainClearsTerrainOnEverySegment` still holds.

## 2. Gear-up deck strike is an impact

`GearUpDeckContactIsACrashNotABolter` already ended the pass as a crash. It only asserted "not flying". It now requires `AircraftTerminalState.Impacted` and `ImpactSurface.FlightDeck`. The production path was already `RegisterUndamagedCrash` on an unconfigured deck strike, so the assertion passed on the first run. No kernel change.

## 3. Shared overhead, flown per mission

The 30° capture heading and the overhead radii live on `ConventionalRunwayPatternRecoveryDirector`, which every F-22 conventional recovery uses once return-to-base is actually armed.

Kestrel's first run, after the mouth pair is splashed, captures initial through the touchdown gate in the session and rolls to a stop: `KestrelFirstRunOverheadRecoversToAStop` (`RunwayRecoveryPhase.Recovered`, `CombatHandoffPhase.Recovered`, `SortieOutcome.Victory`).

Recovery practice does the same pattern and the same physical stop: `RecoveryPracticeOverheadRecoversToAStop` (`PracticeStatus.Completed`, `SortieOutcome.Discontinued`). Practice does not move the combat handoff to Recovered; the runway phase is the stop.

Ace Duel does not arm that director. `SupportsCombatHandoff` requires a continuous fight, and `UnsupportedAceDuelRunwayStopDoesNotBypassItsSingleFight` already pins a runway stop as not the end of the duel. `AceDuelDoesNotEnterTheSharedOverhead` checks knock-it-off still leaves the pattern dark. The schedule was not split and the shared fixture was not retargeted. There is no existing test pilot that flies an Ace Duel overhead, because the sortie never enters one.

The pattern walk snaps the live `AircraftSim` onto each published gate long enough for the session director to capture it, then uses the same swept-contact rollout the practice recovery test already uses. It is not a closed-loop stick-and-rudder pattern.

## 4. Overhead radio from a real session

`SessionOverheadSpeaksInitialThenBreakThenBaseOnlyWithGearLocked` flies the F-22 practice overhead through `SimulationSession`. On initial the session emits `pilot-initial` then `tower-break-approved`. The perch call `pilot-base` ("three greens") waits until the gear is down and locked. A clean perch does not say it. No new line ids. `lines.json` was not touched.

## Deliberately not done

- No Ace Duel return-to-base. That would end the single fight the existing test forbids.
- No per-mission copy of the overhead schedule.
- No generated radio, no `lines.json` edit.
- No release stamp, push, or deploy.
- No screenshot. The cue altitude and the radio sequence are kernel state.
