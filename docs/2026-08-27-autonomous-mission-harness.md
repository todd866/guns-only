# Autonomous mission harness status — 2026-08-27

## Why this exists

The old browser checks could report green while a route was paused behind Ready, authority crawled,
or a QA shortcut skipped the part a player actually flies. The new gates control the production
input path and keep an authority tape. Visual review remains a separate acceptance gate; completing
a mission does not mean it looks good.

## Coverage

| Mission family | Driver | Required proof |
| --- | --- | --- |
| Cobra | `cobra_ai_pilot.mjs` | depart, ingress, live two-sided battle, real gun hit, no friendly kill |
| F-22 | `fixed_wing_ai_pilot.mjs` | single-Ace merge, stable roll capture, held gun solution, kill, no runaway chase |
| First run | `fixed_wing_ai_pilot.mjs` | full canyon, weapon release, both opening splashes |
| Top Gun | `fixed_wing_ai_pilot.mjs` | live intercept and terminal combat evidence |
| Rapier | `fixed_wing_ai_pilot.mjs` | launch-to-climb authority transition |
| Indoor | `indoor_ai_player.mjs` | two optical scans, raised atrium crossing, intact return, no shortcuts |
| Weekend | `weekend_ai_rider.mjs` | full clean lap, all sectors, pause authority hold, visible debrief |
| Okanagan | `okanagan_ai_player.mjs` | runway, scoop, drop, credited circuit, RTB landing and debrief |
| CASEVAC | `casevac_ai_player.mjs` | pickup, stable contact, patient onboard, clinic handoff, result |

`mission_ai_suite.mjs` dispatches these sequentially and fails unknown mission names. Source and
unit coverage are not substitutes for the fresh hardware runs recorded below.

## Acceptance rules

- Hardware runs use the real Metal renderer. SwiftShader may diagnose CPU starvation but cannot
  qualify frame rate or playability.
- The page must stay visible and authority must advance near wall time.
- Input goes through the same keyboard/gamepad handlers as a player.
- Crashes, hidden pages, timeouts, skipped phases and missing terminal evidence fail closed.
- Screenshots are inspected independently for composition, readability and action. Telemetry cannot
  certify graphics.
- Unattended audio runs use `?audioQa=silent` and close the browser before releasing the GPU slot.

## Next gaps

1. Add a visual-scene rubric to the artifact bundle without pretending it can replace human review.
2. Qualify the public `first-merge` 2-v-1 separately; the Ace gate isolates controller behaviour.
3. Run the complete suite on fresh published assets before release; never reuse a stale publish.

## F-22 wrap handoff — 2026-08-29

Status: materially safer and more diagnosable, but **not release-qualified**. Tape 498 survived the
full 180 seconds with no hits taken after the defensive-power repair, then failed acceptance with
12 unconverted passes inside 500 m and no shot. Do not describe survival as a completed fight.

Verified changes in the current worktree:

- The AI requests and applies zero rudder. Tape 498 recorded maximum ARI/effective rudder `0.0007`,
  rolling sideslip `1.82 deg`, no material loaded roll and no settled loaded overbank. The apparent
  top-rudder motion is bank/load geometry plus an aft padlock projection, not hidden rudder input.
- Combat padlock now compresses only the loaded-turn roll shoulder; physical HUD/ADI attitude and
  the solved look direction remain truthful.
- A close-rear defensive reacquisition preserves the nearer physical bank side instead of making a
  lethal cross-horizon reversal.
- The predictable `0.8 G` gunfire unload jink was removed. Live fire and airborne rounds retain the
  maximum available defensive pull.
- A narrow high-closure cone-retention lane can preserve an already captured final-axis solution;
  it does not widen the production gun cone or trigger.
- Active defense now overrides inherited recovery idle and rocks toward bounded `1.05` combat
  power. Tape 497 died at `52.8 s` after power sat at zero for `5.9 s`; Tape 498 exercised the
  override throughout the comparable threat and survived 180 seconds untouched.
- Full and hot snapshots now publish ungated `lead_solution_valid` beside the unchanged,
  weapons-authorized `lead_valid`. This field is tested but is not yet consumed by the AI pilot.

Exact remaining work, in order:

1. Consume `lead_solution_valid` only for F-22 manoeuvring while leaving HUD, trigger and
   `lead_valid` weapons-gated. Tape 498's first merge withheld physical lead until the target was
   already `161 deg` aft.
2. Permit only same-side, magnitude-reducing finisher maintenance when the rate-damped roll command
   is below `0.25` and already moving toward target. At `67.942 s`, a safe `+32.7 -> +19.7 deg`
   correction (`~ -0.218` roll) tripped the static `12.5 deg` interlock, dumped to `0.8 G`, and let
   lateral error grow while lead improved to `4.80 deg`. Cross-side, increasing-bank, wrong-way,
   overbank and material commands must still unload.
3. End the low-plane nose-high trap. Tape 498 held about `3 G` near `60 deg` bank while gamma rose
   `41 -> 47.5 deg` and the shooter sat `34 -> 45.6 deg` below. Lateralize the lift vector or bound
   load until gamma stops rising; retain the combat-power override.
4. Extend the harness with a stable steep/low-load failure (`|bank| >= 65 deg`,
   `|roll rate| <= 12 deg/s`, over `2.5 s`) and a low-plane/below-shooter rising-gamma failure.
   The current `G >= 2.5`, `bank >= 75 deg` wall metric missed Tape 498's `9.28 s` at about
   `70 deg` bank and `1.8-2.5 G`.
5. Make the ordinary `68 deg` pursuit cap forward-quarter only and restore the existing `72 deg`
   aft-turn authority. The global reduction slowed the first post-merge conversion by roughly
   `1.1 deg/s` versus Tape 495.
6. Publish camera yaw/pitch and raw/corrected optical roll, capture settled `TRACK` frames, and add
   a subtle body-fixed rail/wing reference. Do not flatten the aft-view horizon further.
7. Republish and require a fresh silent Metal sortie with a real qualified two-sample gun solution,
   production fire, damage and kill, plus no hits, no missed-pass failure and no new visual-wall
   evidence.

## Claude follow-up — 2026-08-29

Three changes on top of the F-22 wrap handoff above, each test-first.

**Tape survival was not a defensive result.** The handoff credited Tape 498's "survived 180 s with
no hits" to the defensive-power override. It cannot: `sortieOpponentRoundsFired` is `0` in that
tape, and `0` in Tape 495 as well — *before* the override existed. Both fatal tapes (496, 497) show
`9` opponent rounds and three hits. Survival tracked whether the Ace engaged at all, not how
ownship defended, so the override remains **untested rather than proven**.

The assessor now publishes `defensiveSampleValid` and fails an F-22 sortie in which the opponent
never fired and was never killed. A kill before the opponent shoots stays a real result. Replayed
against the recorded tapes: 495 invalid, 496 valid, 497 valid, 498 invalid — the gate separates
"we defended" from "nobody shot at us" on real data, not just fixtures.

**Item 2 (finisher interlock) is done.** `gunLeadFinisherMaintenanceTrim` exempts a same-side,
magnitude-reducing, sub-material trim on a captured plane from the tactical-plane-change unload.
Cross-side, increasing-magnitude, wrong-way, overbank and material commands are untouched.

**Item 5 (pursuit cap) is done, but not as written.** "68 forward-quarter only, restore 72 aft"
cannot be a pure angular threshold: the inverted-recovery handoff releases at 101.3 degrees of
heading error — aft of the 3/9 line — and deliberately expects 68, and Tape 494's release at 144.3
degrees expects a trim away from the 75-degree wall lane. Any single angle satisfies at most two of
the three pinned semantics. Implemented instead as ordinary geometry (68 forward, 72 aft) plus a
stateful `pursuitHandoffTrimActive` latch: armed when the aft seam hold or an inverted recovery
hands control back to ordinary pursuit, holding 68 until the live pursuit side is physically
captured (same side, inside 72 degrees, roll rate settled), released one-way, never latching a
pursuit sign. The 150/145 seam hold is unchanged — widening it would have latched a wrong-side
residual bank in the 100-140 degree band.

Validation: `tools/perf` node suites `310/310` (fixed-wing `208/208`, four new tests). Note that
`git diff --check` proves nothing here — `tools/perf/fixed_wing_ai_pilot.mjs` is still untracked, so
it has no tracked diff to check. **Not flown.** No Metal sortie, no republish, so items 1, 3, 4, 6 and 7
are untouched and the release gate is unchanged. The next run should be a fresh silent Metal
sortie whose tape is now required to be a contested one.

## Known regressions on this branch — 2026-08-29

The focused suites quoted above (`204/204`, `30/30`, `1/1`) are all that was ever run. The full
repo gate, `bin/check`, had not been run against this change set. It fails.

Three defects were mechanical and are fixed here:

- `web/wwwroot/cobra-lab/main.js` imported the new `low_speed_lens.js` at `?v=349` while the
  release identity was still Build 348. Production runtime changed without advancing the build, so
  the release contract refused it. Stamped to Build 349 with `bin/stamp-release`.
- `docs/STATUS.md` still named Build 348 as the candidate; the evergreen status matrix requires the
  current build. Updated, with a Build 349 entry.
- `MeshNavSnapshotTests` pinned hot-frame `layout_version` 32. Adding `lead_solution_valid` bumped
  the layout to 33 and the test was not updated. Fixed, and it now asserts the new field.

**Six behavioural failures remain, and they are regressions, not pre-existing.** All nine of these
tests pass at `origin/main` (`50a2d022`), verified in a clean worktree:

| Test | Symptom |
| --- | --- |
| `GunConversionContractTests.TheAceConvertsItsGunPositionIntoHitsAndKills` | Ace landed hits in 2/6 engagements; a majority is required |
| `GunConversionContractTests.TheAceFiresAtTheBallisticSolutionRatherThanAtTheTarget` | 15.5% of trigger-down time on solution; 20% required |
| `GunConversionContractTests.TheLadderKeepsItsTiersDistinct` | Veteran scored 0 hits from 58 rounds; Novice produced no trigger data at all |
| `BanditArenaLeashTests.PlayerAboveTheFightCeilingCannotBeMadeToRunTheBanditDown` | leash |
| `ReactiveBanditTests.ProductionAceSustainsAHighGDefenseWhileTheAttackerStaysOnItsSix` | sustained defence |
| `SyntheticPilotDuelTests.BanditDoesNotRunFromAPlayerWhoSimplyClimbs` | bandit disengages from a climbing player |

These are the production opponent, not the harness pilot. The last two touch the doctrine that a
bandit must never flee nose-cold, and `TheLadderKeepsItsTiersDistinct` reports a Veteran that fires
58 rounds for no hits — the difficulty ladder has collapsed. Diagnose against the sim, not by
reasoning about the change set: trace a single engagement per tier.

### Root cause of the leash/run failures — traced 2026-08-29

Traced, not reasoned about, per the standing instruction on this file. `ReactiveBandit.Tactic` is a
misleading label here: between `ReengageRangeM` (3.5 km) and `AbandonChaseRangeM` (15 km) the jet
flies `ReengageCommand` while `Tactic` is set to `Return`, so `ReturnCommand`'s "NEVER CLIMB HOME"
dive branch never runs. My first hypothesis — that `Return` was unreachable, the documented trap in
this file — was wrong: `Return` is selected on 252 of 361 sampled ticks.

The leash scenario (player pinned at 4,592 m) traces as:

    t= 27  rng= 3322m  nose= 1.00  spd=225  alt= 4956  cmdG=1.05  bank= -25.8
    t= 30  rng= 3635m  nose= 1.00  spd=249  alt= 4918  cmdG=3.97  bank= -74.5
    t= 45  rng= 8096m  nose=-0.97  spd=316  alt= 5370  cmdG=6.64  bank= -74.5
    t= 63  rng=13407m  nose= 0.64  spd=305  alt= 7900  cmdG=5.07  bank= -74.5
    t=100  rng=19231m  nose=-0.91  spd=131  alt=14912            bank= -74.5

At t=30 the bank target pins to -74.5 degrees and never moves again for 85 s at 5-7 G and full
afterburner. -74.5 degrees is exactly `LimitedBankTo(aim, 1.30)` saturating at its cap. The chain:
`KeepAimInFightVolume` clamps the aim to within `ReturnRadiusM - 500` of the fight centre, so once
the fight drifts past that the command whose whole purpose is re-engagement is handed a phantom near
the centre; `BankToPlaceLiftVectorOn` against a phantom below and behind saturates; a constant-bank,
constant-G pull is a climbing spiral. It carries the fight to 15,823 m (51,900 ft) and 20 km while
speed decays 320 -> 100 m/s. The nose signature is +1.00 -> -0.97 — the same pathology
`ReengageCommand`'s own comment describes as "+1.00 to -0.98". The `aimIsThePlayer` guard correctly
identifies the phantom and disarms the slice, but the fall-through still turns onto it.

`ReengageCannotSpiralTheFightThroughTheCombatCeiling` in `BanditArenaLeashTests` is the reproduction,
kept `Skip`-ped. It fails on the unmodified branch with a 46.3 s saturated-bank leg.

**Why this is not yet fixed.** Taking the horizontal aim from the real contact and keeping only the
vertical clamp does fix the spiral outright — the traced outbound leg goes 19.1 s -> 0.0 s, the nose
holds 1.00, range stabilises near 4 km and the jet descends. But it is not sufficient and not free:

- The leash test then fails later instead, on `maxRadiusM` — the pair drifts 18.8 km from the fight
  centre, because the bandit holds ~4 km at 359 m/s in a 57-degree bank, an 8.5 km turn radius. The
  speed-scrub in `ReengageCommand` does not arm, because it keys on the range *opening* and here the
  range is stable.
- It breaks `WingmanStaysInTheFightTests.BothColdOpponentsFireWhileThePlayerIsAlive`: the clamp is
  load-bearing for wingman containment. Restoring the clamp for `Bracket`/`Extend` roles only does
  not recover that test either.

**The architectural finding.** Containment is currently expressed *through the aim point*, which
couples it to a bank solver that is singular exactly when the aim goes behind the aircraft. That is
why every local patch trades one containment failure for another. Containment wants to be a
constraint on the flown command — bank/vertical authority and a speed scrub that keys on range being
*large*, not on range *opening* — rather than a lie told to the aim. That is a design pass with a
flight-verification loop, not a patch, so I stopped rather than keep guessing.

The three gunnery/tier failures are still unattributed. The hypothesis that they share this root
cause (a fight spending 85 s high and slow would depress Ace conversion and inflate a low-volume
tier's on-solution ratio) is untested — the aim change above did not move them, which is evidence
against it being the whole story.

**Do not merge this branch to main until those six are resolved.** The branch is pushed so the work
is not confined to one machine; CI will be red, accurately.

Current validation: fixed-wing controller/harness `204/204`; camera and production-graphics
`30/30`; focused inhibited physical-lead snapshot regression `1/1`; `git diff --check` clean.
Evidence tapes are `/private/tmp/f22-ai-disciplined-495` through `-498`.

## Latest F-22 proof

Tape 424 passed on Metal after fixing a harness-only control-mode error: the synthetic limiter
button had been held during positive recovery pull, which changed analog pitch from protected G to
commanded alpha. Limiter ownership is now restricted to the deliberate negative-alpha unload;
positive recovery pull stays on the ordinary protected-G path.

The sortie killed in 114.6 s with 99 rounds, 3 hits and a 19-sample shootable qualified solution.
It reached 8.57 actual G, held maximum AoA to 18.88°, reduced ARI/effective rudder from tape 423's
0.787 to 0.0018, reduced maximum sideslip from 16.8° to 7.3°, and recorded zero recovery gun-assist
G, zero physical rocking and zero runaway chase. The assessor now excludes solutions coincident
with recovery, defensive breaks, RTB, cold weapons or pilot interlock; tape 423's recovery-only
solution can no longer masquerade as a firing opportunity.
