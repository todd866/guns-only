# F-22 opening — the first gun lesson

ID: `first-merge`, rung 0. Routes: `/` and `/?program=first-merge`. Design spec for package a1-opening (2026-10-13 audits: play #1–3, fight #1, feel #1, loop #2). Ian approved the direction; redline here.

**The problem in one line.** A stranger was sent 18 km down a weapons-cold valley, then asked to fire two missiles, then shown a reciprocal pass at ~790 kt closing that left the forward view in 2 s. Portrait pulled 1.4–4 G toward any target in a 60° cone, so hands off climbed away. Zero audit combat hits.

**The fix in one line.** One tap from the wordless picker. Then a Competent single ship flying a gentle turn 650 m ahead, which you can track and hit inside ten seconds. Then he fights.

## The arc

| Clock | Player does | Screen shows | Sim checks |
|---|---|---|---|
| Door | Taps **Fly Guns Only**. The picker is the existing wordless one, F-22 preselected. | No valley brief. **Replay valley intro** stays on the picker. | `shouldAutoStartFirstRunValley` stages the valley only for `?firstRun=1` (`render/onboarding/first_run_valley.js:36`). |
| 0 s | Launch. One contract for the sortie. | First person, 10,000 ft at corner speed. The contact is 4° off the nose, in view in portrait's 33° field. | Rung 0 = Competent, one ship, `Sparring` (`FightDirector.cs:192`). Spawns `RungZeroLeadState`: 650 m ahead on your heading, 45 m to the authored side, 25 m high, 12 m/s slower (`Beats.cs:642`). Phones latch assisted at launch from the device, never the orientation (`app.js:1229`). |
| 0–12 s, Present | Moves the nose onto the target box. Pipper on, solution cue lit, fires. | Lead cue, target box, solution cue. Nothing new is drawn. | The lead flies a constant level 15° bank turn away from you, power on a speed hold (`NeutralMergeBandit.cs:332`), in the same `AircraftSim`. Ballistics, hit radius and damage are unchanged. The gunnery pitch assist is weapons-hot and range-gated (`SimulationSession.PilotAssists.cs:437`). Hands off holds the path; no target term (`DetentLayer.cs:150`). |
| Present ends | — | He breaks. | First exit wins (`NeutralMergeBandit.cs:307`): **first physical hit** (`SimulationSession.Telemetry.cs:340`); **tracking**, 2 s with your nose within 3° inside 900 m; **overrun**, 4 s inside 300 m; **cap**, 12 s whatever you do (`ReactiveBandit.PresentMaximumSeconds`). Then the same physical state becomes the Competent `ReactiveBandit` (sibling c2 owns that fight). |
| Then | Fights. A hit makes rung 1, a kill rung 2, two kills the Ace pair (Option A, unchanged). | — | Replacements and earned rungs keep the reciprocal `SpawnForMerge` merge. |

**Honest compression.** The lead is staged inside gun range on purpose, as a join-up after the merge, which a real pass would have to earn. Nothing else is compressed. G, roll, thrust, hit radius and rounds are the same as in every other fight.

**Why new latches.** The reciprocal exits (2 s inside 12°/900 m, 4 s inside 1.5 km) mean "you reached the merge". The lead starts inside both, so they would end the lesson at t = 2 s whatever the player did. The lead keeps the same three kinds of exit, restated for trail geometry, adds a hit, and keeps the 12 s cap. A loiterer still gets a fight by 12 s. Build 370's endless present stays impossible.

**Failure and partial outcomes.** If you never touch the stick, he turns in at 12 s and fights. If you spray with the cue 4° off, 480 rounds go out and none hit (pinned). If you hold the solution, the burst often lands three hits and kills him. That is honest: three hits defeat a Su-27 in this damage model. It means a first-sortie kill can promote the next sortie to the Ace (see risks).

**Control contract.** A touch phone is assisted in both orientations: corner auto-throttle until you take the lever, qualified auto-fire, path-holding neutral. Desktop and gamepad are manual. Rotating the phone changes the layout only. The HUD shows AUTO only while the hold owns the lever (`auto_throttle`).

## Acceptance (measured 2026-10-13)

- **Door.** With fresh storage, the root and `?program=first-merge` open the F-22 picker at 390×844, at 844×390 and at 1280×720 (smoke test rewritten). The contact is in the forward view at launch, about 4° off the nose and 650 m away.
- **Kernel HUD pilot** (`FirstMergeOpeningAcceptanceTests`). Every one of 8 seeds × {touch-assisted, gamepad-manual} had a coarse window of 7–9 s or more. Touch: 8/8 hit before 30 s; first hit at 3.7–6.4 s; 32–60 rounds to first hit. Gamepad: 7/8 hit; one seed fired 126 rounds and missed. Every present ended into a fight by 12.0 s.
- **Neutral stick.** Assisted vs manual hands-off G differs by under 0.05 G. Browser hands-off g_cmd averaged 0.999 G in portrait and 1.000 G in landscape, and a hands-off phone held 2.2–2.3° pitch for 12 s. Rotating mid-sortie changed neither the contract, AUTO nor g_cmd.
- **Poor shot.** A 4°-off sprayer emptied 480 rounds and hit nothing.
- **Real touch, headless.** Eight of nine portrait and landscape flights hit, first at 3.5–10.8 s after 14–33 rounds. One portrait run under a load average of about 85 oscillated in roll and never fired.
- Strangers remain the real test.

**Risks.** A kill inside ~6 s promotes the next sortie to the Ace (Option A). Watch whether that ramp is too steep after a near-free first kill. The cloud-break entry (Tier-1 #4, another package) still greys the first second.
