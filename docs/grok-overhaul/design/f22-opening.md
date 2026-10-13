# F-22 opening — the first gun lesson

ID: `first-merge`, rung 0. Routes: `/` and `/?program=first-merge`. Design spec for package a1-opening (2026-10-13 audits: play #1–3, fight #1, feel #1, loop #2). Ian approved the direction; redline here.

**The problem in one line.** A stranger was sent 18 km down a weapons-cold valley, then asked to fire two missiles, then shown a reciprocal pass at ~790 kt closing that left the forward view in 2 s. Portrait pulled 1.4–4 G toward any target in a 60° cone, so hands off climbed away. Zero audit combat hits.

**The fix in one line.** One tap from the wordless picker. Then a Competent single ship flying a gentle turn 650 m ahead, which you can track and hit inside ten seconds. Then he fights.

## The arc

| Clock | Player does | Screen shows | Sim checks |
|---|---|---|---|
| Door | Taps **Fly Guns Only**. The picker is the existing wordless one, F-22 preselected. | No valley brief. **Replay valley intro** stays on the picker. | `shouldAutoStartFirstRunValley` stages the valley only for `?firstRun=1` (`render/onboarding/first_run_valley.js:36`). |
| 0 s | Launch. One contract for the sortie. | First person, 10,000 ft at corner speed. The contact is 4° off the nose, in view in portrait's 33° field. | Rung 0 = Competent, one ship, `Sparring` (`FightDirector.cs:191`). Spawns `RungZeroLeadState`: 650 m ahead on your heading, 45 m to the authored side, 25 m high, 12 m/s slower (`Beats.cs:642`). Phones latch assisted at launch from the device, never the orientation (`app.js:1229`). |
| 0–12 s, Present | Moves the nose onto the target box. Pipper on, solution cue lit, fires. | Lead cue, target box, solution cue. Nothing new is drawn. | The lead flies a constant level 15° bank turn away from you, power on a speed hold (`NeutralMergeBandit.cs:332`), in the same `AircraftSim`. Ballistics, hit radius and damage are unchanged. The gunnery pitch assist is weapons-hot and range-gated (`SimulationSession.PilotAssists.cs:437`). Hands off holds the path; no target term (`DetentLayer.cs:150`). |
| Present ends | — | He breaks. | First exit wins (`NeutralMergeBandit.cs:307`): **first physical hit** (`SimulationSession.Telemetry.cs:340`); **tracking**, 2 s with your nose within 3° inside 900 m; **overrun**, 4 s inside 300 m; **cap**, 12 s whatever you do (`ReactiveBandit.PresentMaximumSeconds`). Then the same physical state becomes the Competent `ReactiveBandit` (sibling c2 owns that fight). |
| Then | Fights. A hit makes rung 1, a kill rung 2, two kills the Ace pair (Option A, unchanged). | — | Replacements and earned rungs keep the reciprocal `SpawnForMerge` merge. |

**Honest compression.** The lead is staged inside gun range on purpose, as a join-up after the merge, which a real pass would have to earn. Nothing else is compressed. G, roll, thrust, hit radius and rounds are the same as in every other fight.

**Why new latches.** The reciprocal exits (2 s inside 12°/900 m, 4 s inside 1.5 km) mean "you reached the merge". The lead starts inside both, so they would end the lesson at t = 2 s whatever the player did. The lead keeps the same three kinds of exit, restated for trail geometry, adds a hit, and keeps the 12 s cap. A loiterer still gets a fight by 12 s. Build 370's endless present stays impossible.

**Failure and partial outcomes.** If you never touch the stick, he turns in at 12 s and fights. If you spray with the cue 4° off, 480 rounds go out and none hit (pinned). If you hold the solution, the burst often lands three hits and kills him. That is honest: three hits defeat a Su-27 in this damage model. It means a first-sortie kill can promote the next sortie to the Ace (see risks).

**Control contract.** A touch phone is assisted in both orientations: corner auto-throttle until you take the lever, qualified auto-fire, path-holding neutral. Desktop and gamepad are manual. Rotating the phone changes the layout only. The HUD shows AUTO only while the hold owns the lever (`auto_throttle`).

## Acceptance (measured; see the handoff for numbers)

- Fresh storage, phone 390×844 and 844×390, and desktop: the root and `?program=first-merge` both land on the F-22 picker. The contact is in the forward view at launch (≤20 s).
- `FirstMergeOpeningAcceptanceTests`: a HUD-cue pilot with 200–350 ms reaction and a rate-limited analog stick, 8 seeds × {touch-assisted, gamepad-manual}. It needs ≥2 s of coarse gun window before 30 s in every seed, a real hit before 30 s in most seeds, and every present ending into a fight by 12 s.
- Hands-off requested G, assisted vs manual at this start: difference under 0.05 G. A target sweep across the old 60° cone edge moves neutral demand by 0 G.
- A poor shot still misses. Headless real-touch flight at both phone sizes; report rounds to first hit.
- Strangers remain the real test.

**Risks.** A kill inside ~6 s promotes the next sortie to the Ace (Option A). Watch whether that ramp is too steep after a near-free first kill. The cloud-break entry (Tier-1 #4, another package) still greys the first second.
