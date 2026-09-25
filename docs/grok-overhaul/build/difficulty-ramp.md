# F-22 difficulty ramp — route-level fixes

Built on `grok8-wave1-fix`. Option A stays the ladder. The production doors now actually open on it.

## Rung 0 is inside a kilometre

The menu Fly path staged the authored 9 km reciprocal because `CreateBandit` kept that state. `SpawnForMerge`'s 1,000 m rule only applied to replacements. The valley parked the target 1,800 m past the pop-out (`BanditNorthM` 600, gate −1,200).

The presenting menu opening keeps the authored lateral offset and pulls the along-track split to 1,000 m, so the pass is still a merge. The valley park is `PopOutNorthM + 1,000`.

Tests: `TheLiveOpeningSpawnIsTheUnprovenRungIncludingARestoredValley` (StartBeat 7 and the valley), `PopOutEndsTheCooperativePresentSoThePairCanFight` (range past the gate).

Headless, `?menu=1`, hardware GPU (Apple M5): `.grok-shots/rung0-close-desktop.png` and `.grok-shots/rung0-close-phone.png` (390×844). Both show one contact, bracket about 0.25 NM and closing, two seconds after Fly. A 14-second wait (`rung0-desktop-flight.png`) opens to about 2.1 NM because the pass is already diverging; the spawn itself is the kilometre.

## Present survives the pop-out

Crossing the gate called `EndPresentation()`, so rung 0 fought at once. The neutral-merge actor now runs the same 2 s / 900 m / 12° hold before the reactive pilot takes the pass, and only when the proximity latch is off. Pop-out no longer clears Present.

Test: `PopOutEndsTheCooperativePresentSoThePairCanFight` — ten seconds at 1,200 m stays presenting; 2.5 s at 500 m on the nose ends it.

## Two gun kills open the next sortie

The F-22 beat stays two engagements. Landing ends it. The kill that fills the cap was being closed as a handoff (`SortieOutcome.None`) because RTB was requested before the combat report. That report is written first. The next `StartBeat(7)` with the exported blob opens rung 3, one wingman, Ace, uprated. Restart of that beat keeps the pair.

Spec sentence in `docs/grok-overhaul/audit/difficulty-ramp.md` now says the pair is the next sortie, not a third fight in this one.

Tests: `TwoGunKillsOpenTheNextSortieOnThePairAndThisSortieStaysFinite`, `RestartOnTheF22BeatKeepsTheEarnedPair`.

## Only a gun kill climbs

`ApplyRamp` treated every `SortieOutcome.Victory` as a kill. Missile destruction, terrain impact, and maneuver kills therefore promoted. `EngagementReport.GunKills` is set only when `GunKill.SplashedByGunfire` (the defeat count came from rounds, not `ApplyExternalDestruction`). A victory with no gun kill stays on the rung. A hit still promotes to rung 1.

Tests: `AVictoryWithoutAGunKillDoesNotPromote`. Director fixtures that mean a guns win now pass `GunKills: 1` (`FightDirectorTests.StrongReport`, `FrontDoorRampFixtures`, formation and machine fixtures).

## The ramp does not restage other beats

Imported history used to supply an opening spawn on any continuous beat, and the browser armed that blob before Top Gun. Restore and opening staging run only when `UsesDifficultyRamp` (the F-22 visual merge and the valley). Top Gun no longer calls `armDirectorRestore`. A non-ramp restart keeps director memory and leaves the authored opening alone.

Tests: `AnArmedF22HistoryDoesNotRestageTopGun`, `RestartPreservesDirectorMemoryButStartBeatResetsIt`. Browser: `difficulty_ramp_persist.test.mjs`.

## The blob is actually saved

`saveDirectorState` had no caller. It now runs when the F-22 engagement key changes (engagement, kills, rung, phase) and on `pagehide` and hidden `visibilitychange`. Other programmes do not write the blob.

Test: `director state is saved after an observed engagement and on lifecycle exit`.

## Ready copy

The Guns Only brief no longer says the opening wave is a pair of Aces. The valley card still says Fire launches two heaters and then becomes the gun, then join the one aircraft ahead. It does not say splash the pair. The picker stays wordless.

Test: `the guns-only ready brief does not promise an opening ace pair`, and the updated first-run sentence in `player_action_contract.test.mjs`.

## Deliberately not done

No third engagement inside the F-22 sortie. No new radio lines. No difficulty menu. No change to ballistics, Auto-GCAS, or the gun funnel ceiling. Top Gun, Cobra, Fire Boss, and the ride were not retuned. `Beats.CarrierApproach` was not touched.

## The ramp stays on the F-22

A gun victory on any other beat was still calling `FightDirector.Observe`, and that rung scaled every aircraft's gunnery assist. At rung 2 the scale turns the assist off, so a Rapier restart after a guns kill lost the authored 2.5 G correction (gameplay surrogate on `FlightModel.RapierPublicDataSurrogate`, not a flight-manual number). Other beats still record the fight for the learner and the boss phase. Only the visual merge and the first-run valley advance the rung, and only those two scale the assist. Touch widening on every other beat is the origin/main law: tilt controls widen the cone and add one G, with no rung gate.

Tests: `AnAssistedBeatKeepsAuthoredGainsAfterAStoredRung3Blob` (Rapier 2.2 / 2.5 and a cold Top Gun after a stored rung-3 blob; a guns kill then Restart leaves both gains alone). `SuccessorSpawnsComeFromTheDirectorAndMatchAReplayedReference` still records a non-ramp kill without climbing.

## The menu Fly path and a finite brief

`?menu=1` keeps the picker. Fly calls `WebBridge.StartBeat`, which is `StartBeatWithEnvironment` for beat 7 with that beat's weather and the bridge's angled deck. The valley door is `StartFirstRunValley`: the first-run factory and beat-13 weather. The range test drives those two entries. The menu spawn is Present at about 1,000 m slant. The valley contact is Present, about 1,000 m past the pop-out. The player still starts at the south end of the gorge; that slant is not 1,000 m, and it was not pulled in. Landing after that one aircraft is splashed is a victory. A higher rung can still field a pair; landing with one of them alive is not.

The Guns Only kicker no longer says endless. The catalogue line is two gun engagements, then land. The ready brief already said landing ends the sortie. The front door stays wordless.

Persistence lives in `difficulty_ramp_persist.js` and runs against a fake `localStorage`: save after the engagement key changes, save on `pagehide` and hidden `visibilitychange`, a corrupt blob is not armed (rung 0), a v1 blob is armed so the kernel migrates it to rung 0, and the valley route restores.

Tests: `MenuFlyAndTheValleyOpenPresentAtAboutAKilometre`, `director state saves after an engagement and on hide, and restores on the valley`, `the guns-only sortie is two engagements and then a landing`.

Headless, `?menu=1`, Apple M5: `.grok-shots/ramp-brief-menu.png` is the aircraft picker (Guns Only selected, no endless sentence on the card). `.grok-shots/ramp-brief-flight.png` is about fourteen seconds after Fly, contact 2.1 NM and opening, which is the pass after the kilometre spawn has already diverged. The spawn range is the kernel assertion, not that frame.

## Still not done

No third engagement. No new radio. No difficulty menu. No retune of Top Gun, Cobra, Fire Boss, or the ride. The valley player is not moved up to the pop-out.
