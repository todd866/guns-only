# Cobra slice — next gun pit, pad rearm, DShK calls

Items 1, 3 and 4 from the 2026-09-25 cobra audit. Items 2 and 5 were out of this slice.

## 1. Path to the next gun pit after the bridge flips

After Cau Song Ma (Iron Bell) is friendly, Engage and Hold publish a four-gate chain from the aircraft to the next hostile site in authority order (Phu Rieng, then Dat Do). The active gate sits on that site, inside its capture radius, and not on the bridge. Until the bridge flips, Engage/Hold publish no chain, so the gorge ladder does not stay up through the fight. The renderer draws that chain instead of dropping every Engage/Hold gate.

The order is the existing contested-site list and each site's owner and position. The control readout is not read.

Procedure: the job after the bridge is the next gun pit. The old path ended at Iron Bell and the picture then went blank for the 4 km transit.

Tests: `EngagePathPointsAtTheNextHostileGunPitAfterIronBellFlips`, `PathGatesHighlightBridgeDuringEngage` (still the no-site diagnostic), node `engage and hold draw the next gun-pit chain the kernel publishes`.

Not done: no new route, no Lead flight model, no change to the capture or ticket rules.

## 3. Rearm is a pad action

`TryResupplyAtFob` fills the magazine only after `FobRearmDwellSeconds` (3 s, gameplay, not a TM 55-1520-221-10 time) inside the existing pad zone, with collective at or below `CobraTurnaroundRuntime.MaximumShutdownCollective` and gunner consent released. The first authority frame returns false. A hover above the existing 9 m clearance cannot rearm. The ground war keeps advancing during the hold. Consent is the bridge's engagement flag, passed into `CobraMissionRuntime.Advance`.

Procedure: guns safe, collective down, time on the pad while the fight continues. Rounds come back at the end of the hold.

Tests: `CampEmberRearmIsAPadDwellNotAVolumeEnter`. `CampEmberPadRearmsADryMagazine`, `ScriptedFireSupportHoldsTheBasinAndWins` and `KillingTheGarrisonLetsTheSamePushTakeThePoint` now pass the dwell so the scripted gunner completes the same action; the win conditions are unchanged.

Not done: no checklist page, no crew animation, no change to the battle-damage turnaround.

## 4. DShK call and caution follow the mask

"DShK ahead. Ridge masks us." is emitted only when `masking.state` is `masked` inside the existing departure range band. It is no longer a distance-from-the-pad line. `receiving_fire` emits "Taking fire." once, and the formation presenter still expires the call after 3.2 s. The HUD draws `MASKED` (caution) only when the assessment is masked and `acquisition_progress` is already above zero, and still draws `GROUND FIRE` / the clock call while a burst is in flight. Predicted impact time stays off the plate.

Tests: node `the DShK mask call follows the masking assessment, and taking fire follows the burst`, `a masked DShK acquisition draws a caution, and a burst in flight draws taking fire`.

Not done: no new DShK ballistics, no change to acquisition timing in `CobraThreatFireRuntime`.

## Headless

`snap.sh` 8943 tag `cobra`, publish `/private/tmp/grok-pub-cobra`, GPU `ANGLE Metal Renderer: Apple M5`. The script's flight frame is the F-22 menu path (`.grok-shots/cobra-menu.png`, `cobra-flight.png`). Separate headless loads of `/cobra-lab/?audioQa=silent` and `battleQa=1`:

- `cobra-pad.png`: Camp Ember, `DEPART CAMP EMBER · FOLLOW THE PATH`, `AMMO 900`, no checklist.
- `cobra-battle.png`: bridge still hostile, strip `DESTROY GUN PIT · CAU SONG MA`, no gorge ladder across the windscreen. The post-flip Phu Rieng chain and the `MASKED` plate are not on these frames; they need a friendly Iron Bell or a live masked acquisition, which this hop does not force. Those two states are the kernel and node tests above.

## Deliberately not done

- Item 2 (a vehicle must cross the bridge) and item 5 (station clock / fuel).
- Rockets, TOW, mouse turret, cockpit switches, route picker, ticket widgets.
- No commit in this worktree: the session constraint forbids commits.

## Review fixes

The gun-pit chain samples terrain every 100 m on each segment and lifts both ends of that segment to the surface plus `GunPitCueClearanceM` (36 m, the same rotor-clearance surrogate as the Camp Ember departure route, not a surveyed attack altitude). A ridge between two cues raises those cues. It does not lift the rest of the chain, and it does not move the pit. `GunPitChainClearsTerrainOnEverySegment`.
