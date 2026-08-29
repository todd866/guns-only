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

### Attempted fixes and why they failed — 2026-08-29

Three attempts, three different failures. Recording them so the next pass does not repeat them.

1. **Take the horizontal aim from the real contact, keep only the vertical clamp.** Fixes the spiral
   outright: traced outbound leg 19.1 s -> 0.0 s, nose holds 1.00, range stabilises near 4 km, the
   jet descends instead of climbing. But the leash test then fails later on `maxRadiusM` (18,798 m
   of wander), and it breaks
   `WingmanStaysInTheFightTests.BothColdOpponentsFireWhileThePlayerIsAlive` — the clamp is
   load-bearing for wingman containment.
2. **The same, but keep the full clamp for `Bracket`/`Extend` roles.** Does not recover the wingman
   test either; the primary in that fixture reports role `Bracket` and still fires zero rounds.
3. **Also arm the `ReengageCommand` speed scrub on range being LARGE rather than OPENING**, to
   attack the 8.5 km turn radius (the bandit holds 4 km at 359 m/s in a 57-degree bank, and
   `openingMps` sits near zero at a stable range so the scrub never fired). Wander came back
   **18,798 m — identical to the metre**, and the trace shows throttle still pinned at 1.61
   throughout.

That last result is the important one: **the wander phase is not flown by `ReengageCommand` at
all.** Its arming conditions were met (range 4,163 m > `ReengageRangeM`, speed 346 > the 290 m/s
ceiling) and `speedBrakeForRecommit` feeds throttle on both its return paths, yet throttle never
moved. So the earlier attribution of the wander to `ReengageCommand` was wrong. `Tactic = Return`
is set by at least three different branches, including the `lowTarget` branch that dispatches
`LowBlockPerchCommand` — and `IsLowTarget` keys on the contact's clearance above terrain, which a
player holding 4,592 m over flat ground can satisfy. `LowBlockPerchCommand` clamps its horizontal
aim to 1,800 m and flies a perch, which is a plausible shape for a 4 km standoff that drifts.

**The first task is therefore instrumentation, not a fix.** `Tactic` is not a command owner and
cannot be used as one — the codebase has roughly eight command owners reachable per tick and no way
to tell from a tape which one flew. Publish the owner alongside `Tactic` (an enum set at each
`LastCommand = ...` site), re-run the leash trace, and only then decide where containment belongs.
Every attempt above failed because it guessed the owner instead of measuring it — the same mistake
the standing "trace, don't reason" instruction on this file already warns about, made three times.

The spiral attribution in the previous section stands: that one was confirmed by fixing it.

### The contracts are not measuring the opponent that matters — 2026-08-29

Owner telemetry, 80 dev-Mac sessions over 30 days, 96 sorties carrying real flight data
(`tools/telemetry/opponent_pressure.py`, billed):

| | |
| --- | --- |
| sorties where it landed any hit on the owner | **5 of 96 (5%)** |
| sorties where it shot the owner down | **5** |
| sorties where the owner flew into the ground | 6 (not its doing) |
| sorties where the owner killed it | **32** |
| rounds it hit the owner with | 16 |
| rounds the owner hit it with | 127 |

Skill flown was `ACE` in 71 of those sorties. So roughly **6:1 against a nominal Ace**, and it
reaches a firing solution in about one sortie in twenty. Its lethality is fine — 16 rounds produced
5 kills — it simply almost never arrives at a shot.

**This telemetry is from the SHIPPED opponent, i.e. main's, not this branch's regressed one.** That
is the uncomfortable part: a bandit that *passes* every gun-conversion contract still only touches
the owner in 5% of sorties. The contracts grade the Ace against a synthetic scripted probe; the
owner is a former fast-jet pilot. Passing them is not evidence of a credible opponent, and they
should not be cited as though it were.

So there is a measurement gap sitting underneath the six regressions, and it is the more important
of the two. Fixing the regressions restores a contract that was already grading the wrong thing.

**Next instrument, before any tuning or learning:** an owner-flight benchmark. There are 96 real
sorties in Blob including 32 the owner won. Replay those geometries, ask what the bandit did at each
merge and what it should have done, and calibrate the contract against that instead of the scripted
probe. Without it there is no metric that would distinguish a better opponent from a worse one —
which is also why reaching for a learned policy now would optimise against the wrong target.

### The owner instrumentation, and what it found — 2026-08-29

`ReactiveBandit.CommandOwner` now publishes the law that produced `LastCommand`, on the tick that
produced it, at all fifteen assignment sites. `BanditCommandOwnerTests` guards it two ways: no tick
may go unlabelled on any skill tier, and `Tactic == Return` must be observed naming more than one
owner — if it ever named exactly one, the instrumentation would be unnecessary. Both pass, which is
itself the confirmation that `Tactic` was never a command owner. It is behaviour-neutral: the same
six tests fail, nothing else moved.

Re-running the leash trace with the owner published resolves the whole engagement:

| window | owner | what it does |
| --- | --- | --- |
| t=0-30 s | `Lookahead` | the merge; healthy, closes to 636 m |
| t=32-72 s | `Reengage` | bank pinned at **-74.5 deg**, climbs 4,898 -> 9,577 m |
| t=76-115 s | `Return` | bank alternating **+/-77.3 deg**, climbs on to 15,823 m |

Counting the bank command per owner over the run:

- `Reengage`: **136 of 173 ticks at +/-74.5 deg** — the 1.30 rad `LimitedBankTo` cap (79%).
- `Return`: **72 of 79 ticks at +/-77.3 deg** — the 1.35 rad cap, and *alternating sign* (91%).

So for roughly **70% of all post-merge ticks the bank command is pinned at its limiter**, in one
owner as steady saturation and in the other as sign chatter. That is the known
`BankToPlaceLiftVectorOn` degeneracy for a coplanar below-and-behind aim, and **both owners inherit
it**.

**This reframes the defect.** It is not a containment-policy problem. `Reengage` and `Return`
disagree about where to go, but neither can express *any* answer, because the shared bank solver is
degenerate for the geometry both of them hand it and `LimitedBankTo` then clamps the garbage to the
cap. That is exactly why all three earlier fixes failed: moving the aim between owners cannot help
when the owners share the broken solver, and it explains why fixing `Reengage`'s aim simply moved
the failure into `Return`.

The next work is the bank solver, not the containment policy: make `BankToPlaceLiftVectorOn`
well-conditioned (or guard its degenerate cone) so a command that asks to point somewhere can
actually be flown, then re-measure containment. `ReengageCannotSpiralTheFightThroughTheCombatCeiling`
stays `Skip`-ped as the reproduction; the trace method is a scratch xunit driver printing
`range / nose-dot / Tactic / CommandOwner / speed / alt / gamma / GDemand / BankTarget` per tick.

### The bank solver: three measured attempts — 2026-08-29

The pinning has a precise cause. `BankToPlaceLiftVectorOn` returns +/-pi for an aim below and nearly
coplanar with the flight path, which is the *honest* answer — roll inverted and pull. `LimitedBankTo`
then clamps that to the flyable limit, keeping a sensible magnitude (a 77-degree slice is exactly how
`ReturnCommand` puts the nose down) while inheriting a **sign decided by numerical noise**. A jet that
rolls left, then right, then left never establishes the slice. Measured on the leash run: the pinned
bank command reverses sign 18 times across 17,080 pinned ticks.

So the magnitude is deliberate and only the sign is the defect. `SlicedBankTo` commits a side on
entry — preferring the side the aircraft is already banked toward, the same idiom as
`_closeCeilingRecoverySide` and `combatAftPursuitBankHoldSign` — and holds it until the solve is
comfortably flyable again. Three scopes were measured, full suite each time (baseline: 6 failures):

| scope | result |
| --- | --- |
| `ReturnCommand` dive + `ReengageCommand` | **8 failures.** Fixes the leash and the chatter; breaks `CeilingDenialDoesNotChatterAgainstItsOwnThreshold`, `FreshBracketSupportCrossesItsSpawnLeashToRejoinTheSharedFight`, `BothColdOpponentsFireWhileThePlayerIsAlive` |
| `ReturnCommand` dive only | Leash and chatter fail again — 79% of the pinning is in `Reengage`, so `Return`-only cannot fix it |
| both, but exempting `Bracket`/`Extend` roles | Leash, chatter and the bracket rejoin all pass; `BothColdOpponentsFireWhileThePlayerIsAlive` and the ceiling guard still fail |

**The finding is that the latch works and its blast radius is the problem.** It fixes the defect it
targets every time it is applied to `Reengage`, and every scope that fixes the leash also perturbs
the pair fight — not through the support path (exempting support roles does not save the wingman
test) but because changing the *solo* bandit's roll behaviour changes the fight the pair is in.

Two further things the attempts exposed, both worth fixing on their own terms:

- **The ceiling guard oscillates at its own threshold.** With the spiral removed the jet stops
  departing and lingers near the ceiling, and the guard then flips `Energy <-> Reengage` **six times
  in eleven seconds** at 11.77-11.85 km against an 11,500 m ceiling — after a stable 139-second
  stretch. That is a real latent defect the spiral was hiding, not a threshold that wants relaxing.
- `TheBankCommandMustNotChatterItsSignWhileSlicingHome` is kept `Skip`-ped beside the spiral
  reproduction.

**What this needs next** is not another scope of the same latch. The pair fight has no equivalent of
`CommandOwner` — there is no way to see *why* the cold pair's lead stops attacking when the solo roll
behaviour changes, so that failure is being read only through its final assertion. Instrument the
wingman fixture the same way the solo one now is, then re-apply the latch. The instrumentation is the
step that turned the solo case from three blind guesses into a measured cause, and the pair case is
currently where the solo case was this morning.

### The slice latch: six measured variants, and why none of them lands — 2026-08-29

`CommandOwner` is now on `IBanditDecisionTraceSource` and carried through `NeutralMergeBandit`, and
the two-ship fixture records `LeadOwner`/`WingOwner`. That immediately paid for itself: the wingman
failure had always read as "the primary fired 0 rounds", which sounds like a gunnery problem. With
the pair instrumented, the last sample says **range 43,999 m**. The lead does not fail to shoot; it
leaves the theatre. Every earlier reading of that test was of the wrong problem.

Six variants of the slice latch, measured against the 6-failure baseline (full suite for the first
three, the five-class combat filter for the rest):

| # | variant | chatter | leash | pair fight |
| --- | --- | --- | --- | --- |
| 1 | latch side from **current bank**, hold | fixed | fixed | **breaks** — lead 44 km out, bracket rejoin, ceiling guard |
| 2 | as 1, `Return` dive only | not fixed | not fixed | intact (79% of the pinning is in `Reengage`) |
| 3 | as 1, exempting `Bracket`/`Extend` | fixed | fixed | bracket rejoin recovers; wingman still breaks |
| 4 | side from **horizontal bearing**, every tick | 18 -> 14 reversals | **worse** (19 s -> 27 s nose-away) | intact |
| 5 | bearing, reversal only past 86 deg | 14 -> **5** reversals | 21 s nose-away | breaks wingman |
| 6 | bearing, commit and hold, support exempt | **fixed** | **fixed** | lead back in the fight at 4.2 km but still 0 rounds; ceiling guard oscillates |

The trade is consistent and it is not about the support path: variant 3 exempts support roles and
still loses the wingman, and variant 6 pulls the lead from 38 km back to 4.2 km without it firing.
Committing the slice hard fixes the solo fight and disturbs the pair; following the bearing keeps the
pair and reinstates the chatter. Chatter falls monotonically as the commitment tightens
(18 -> 14 -> 5 -> 0), so the direction is right and the coupling is real.

**What this says about the shape of the fix.** The slice side is being decided inside a per-aircraft
command with no knowledge of the fight it is part of. A lead that commits a slice is also the ship
its wingman is bracketing around, so committing changes a geometry two aircraft depend on. The side
choice probably belongs above the individual command — at the formation/fight level, where the
existing `FormationDirective` already coordinates — rather than being re-derived independently inside
`ReengageCommand` and `ReturnCommand`. That is a design change, and it should be made with the pair
fixture's owner trace in hand rather than by tuning a seventh variant.

No production change retained; the reproduction stays `Skip`-ped. The instrumentation is kept and is
behaviour-neutral (same six failures, 2,427 passing).

### The learned-policy seam, and the throughput that decides it — 2026-08-29

`SeededCombatBatchRunner` already owned seeded scenarios, the observation/action/reward contracts,
an append-only transition recorder and dataset JSONL — most of a training environment. Its own
summary named the gap: *"a later policy adapter can replace that actor while retaining this
scenario, physics, weapon, reward, recorder, and dataset contract."* That adapter now exists.

`ICombatLearningPolicy` takes a `CombatPolicyObservation` and returns a `CombatPolicyDecision`
(a `PilotCommand` plus fire INTENT, not authorization — the production ammunition, first-pass and
target-alive gates still apply on top, so a learned fighter cannot acquire weapons freedom the
opponent it replaces does not have). `CombatPolicyActor` flies it on an ordinary `AircraftSim`,
supplying pilot controls only, so it is bound by the same aerodynamics and structural limits.

The default path is unchanged **by construction**, not by argument: with no policy supplied the
learning fighter is the same `ReactiveBandit` object it always was, reached through
`ReactiveBanditActor`. `CombatPolicySeamTests` pins both halves — an injected policy is consulted
once per transition and its commanded bank appears in the recorded action, and the default path
stays bit-identical.

**Measured throughput** (`CombatPolicyThroughputBenchmark`, kept `Skip`-ped; Release, 10 workers,
256 episodes of 30 s):

| | |
| --- | --- |
| env steps / second | **150,325** |
| episodes / second | 41.8 |
| realtime factor | **1,253x** |
| 1M steps | 0.1 min |
| 10M steps | 1.1 min |
| 100M steps | 0.2 h |

**The environment is not the bottleneck, and that is worth stating plainly because it contradicts
an earlier assessment in this session.** The claim that the kernel would need rebuilding for
training throughput was wrong by three orders of magnitude. AlphaDogfight-class experience budgets
are minutes of environment time here; the policy forward/backward pass will dominate, not the sim.

What remains before training is worth starting is the reward, and that is a real gap rather than a
delay: `CombatRewardWeights` scalarizes against the same contracts that grade the Ace on a scripted
probe, and a bandit which *passes* those touches the owner in 5% of his sorties (see the opponent
pressure section). Training on that reward converges faster onto the opponent that already exists.
The owner-flight benchmark is the reward function, and it is the same work either way.

### The owner-flight benchmark — 2026-08-29

The reward gap, closed as far as the tapes allow. `tools/telemetry/owner_engagements.py` replays the
owner's cached sorties and extracts every tick where a real engagement crossed inbound through
2.5 km while genuinely closing, with both aircraft's measured states.
`OwnerEngagementScenarios` stages those as `CombatTrainingScenario`s — the owner flies the F-22
surrogate so he is the runner's reference actor and the opponent is the learning actor, the same
role split the seeded factory uses.

Two integrity filters, both earned rather than assumed:

- **The published positions must describe the contact `range_m` is about.** On 204 of 225 candidates
  they agree to a median of **0.03 m**, but a handful disagree by kilometres — a multi-contact sortie
  where `bx/by/bz` is the selected bandit while `range_m` refers to another. Those would stage a
  merge that never happened. Rejected: 225 -> 204.
- **The opponent's velocity is finite-differenced from position, so it must be plausible.** A restage
  between two samples moves the published position hundreds of metres in one 50 ms step, which
  differences to a 4,060 m/s "velocity". Bounded to 60-600 m/s: 204 -> 158 staged.

**Baseline, the shipped Ace over 158 real geometries:**

| | |
| --- | --- |
| staged | 158 |
| graded | 145 |
| left the supported volume | **13** |
| opponent rounds fired | 180 |
| opponent hits | 50 |
| opponent splashes | **11** |
| rounds per engagement | 1.24 |

Two things that baseline exposes, and neither should be smoothed over:

1. **The runner cannot yet fly the owner's fights.** Thirteen of 158 left the supported flight
   volume, because it has a 200 m floor and no out-of-bounds terminal — its own summary says so.
   The owner fights lower than the scripted probe ever does. A benchmark that silently dropped those
   would flatter the opponent by grading it only on the engagements it stayed high in, so they are
   counted. Implementing crash/out-of-bounds terminals is a prerequisite for training on real
   geometries, not an optional nicety.
2. **The geometries are real; the defender still is not.** These episodes replay the owner's
   starting geometry with a scripted Veteran flying his aircraft, so the benchmark grades the
   opponent against real *setups*, not against the owner's actual flying. That is a genuine step up
   from a scripted merge and it is not the whole distance. Replaying his recorded control inputs is
   the next increment, and the tapes carry enough to attempt it.

So the reward is no longer purely synthetic, and it is not yet the owner either. Treat 11 splashes
in 145 as the number a learned policy has to beat, with both caveats attached.

### Both benchmark caveats closed — 2026-08-29

**Out-of-bounds is now an outcome, not an exception.** The runner threw when either aircraft left
its supported volume, which made real geometries unusable and — worse — meant a policy that flew
into the ground had its episode *discarded* rather than penalised. `OwnshipOutOfBounds` is a
terminal scored with the destruction penalty, so the floor cannot become a cheap way to end a losing
engagement; `ReferenceOutOfBounds` stops the episode neutrally, because the learning fighter did not
cause it. Destruction still outranks both: a splashed aircraft leaves the volume on its way down and
that is a kill, not an out-of-bounds.

**The defender is now the owner.** The reference side takes the same policy seam as the learning
side, and `RecordedInputPolicy` replays the pilot's actual `g_cmd` / `bank_target_deg` / `throttle`
from the tape, with the trigger taken from the round ledger advancing. All 158 staged engagements
carry his inputs; none fall back to a script.

One bug worth recording, because it failed silently in exactly the way this document keeps warning
about: the trigger first read `sortie_rounds_fired`, the monotone ledger. **These tapes do not carry
that field** — only the engagement-local `rounds_fired` — so the extractor cheerfully reported that
the owner fires in 1 engagement out of 204. With the fallback (and a decrease read as the
engagement-local counter resetting rather than as a shot) it is **77 of 204, 769 firing ticks**. A
missing field returning a plausible answer is the failure mode to keep checking for.

**Baseline, the shipped Ace against the owner's own inputs over 158 real engagements:**

| | scripted stand-in | owner's actual inputs |
| --- | --- | --- |
| graded | 145 (13 discarded) | **158 (none discarded)** |
| opponent rounds fired | 180 | 210 |
| opponent hits | 50 | **35** |
| opponent kills | 11 | **9** |
| opponent flew out of bounds | n/a | 3 |
| owner flew out of bounds | n/a | 7 |

Against the owner's real flying the opponent lands fewer hits and fewer kills than against a
scripted Veteran, which is the direction the live telemetry already implied and is the first
independent corroboration of it inside the sim.

**The remaining caveat, which does not close:** a replay is OPEN LOOP. These are the controls the
owner used against the opponent he actually met, so the moment the opponent under test diverges from
the tape the replay is flying a fight that is no longer happening — faithful at the merge and
decreasingly so afterwards. Read 9 kills in 158 as evidence about the opening of a real engagement.
Closing that properly means a behaviour-cloned pilot rather than a replay, and the 158 engagements
with inputs are exactly the dataset for it.

### Learning from the pilot — the clone — 2026-08-29

The loop the owner asked for is *he flies, then something learns from him flying*. The pieces now
exist end to end, and the honest summary is that the plumbing is right and the clone is weak.

`HumanPilotFeatures` is the single feature definition — 14 values, all in the ownship body frame,
world position deliberately absent so a clone cannot memorise map locations instead of learning to
fight, and bank carried as a sin/cos pair so it does not tear at the seam. Both invariants are
pinned by tests. The exporter and the flying policy both go through it; computing features twice
would let the clone learn one function and fly another with nothing reporting it, so the manifest
carries reference cases and `ClonedPilotPolicy` refuses to load one it cannot reproduce to 1e-6.

Pipeline: 93,016 frames of real flying across 55 sorties -> feature rows -> `train_pilot_clone.py`
(a small tanh MLP in numpy) -> a 40 KB manifest -> `ClonedPilotPolicy` flying inside the ordinary
seam. **Split by sortie**, never by row: frames within one engagement are near-duplicates at 20 Hz
and a random split would report a score the clone had not earned.

**Two data defects the metrics found, and both were real:**

- `bank_target_deg` is an UNWRAPPED accumulator — measured range −737 to +1341 degrees, 53% of
  samples beyond ±180 — because the controller needs continuity across the seam. Read as a bank
  angle it produced a label with a 7.7 rad standard deviation and a bank head scoring **1.60 times
  worse than predicting a constant**. `requested_bank_target_deg` is the pilot's actual ask, wrapped.
  Fixed: bank went to **0.52**, comfortably better than a constant.
- The firing head reported **99.4% accuracy** and precision and recall of exactly **zero**. The pilot
  fires on 0.6% of ticks, so "never fire" is 99.4% correct. Accuracy is the wrong metric for a rare
  event and it hid a completely degenerate head. With the positives weighted back to parity it
  reaches recall 0.34 at precision 0.05 — over-firing, but no longer a constant.

**Where the clone actually is** (held-out sorties): bank 0.52 and G 0.72 against a constant baseline,
throttle detent agreement 0.78, firing recall 0.34 at precision 0.05. It flies plausibly and shoots
badly. That is a starting point, not a pilot: usable as a training adversary that reacts, which a
replay cannot be, and not yet a faithful model of him.

**The datasets are not committed.** They are a person's own flight telemetry and run to tens of
megabytes; `analysis/owner-pilot-frames.jsonl` and `-rows.jsonl` are gitignored and regenerable, and
the tests that need them skip rather than fail so a fresh clone of this public repository reports the
truth instead of a broken build.

### Six down to five — the first net win — 2026-08-29

`PlayerAboveTheFightCeilingCannotBeMadeToRunTheBanditDown` is fixed, nothing is broken, and the
route there was tracing rather than another variant.

**What landed.** `SlicedBankTo` commits a slice side when the bank solve exceeds what can be flown,
choosing it from the HORIZONTAL BEARING — the quantity that stays well-defined exactly where
`BankToPlaceLiftVectorOn`'s atan2 degenerates — and holding it. Support roles keep the plain clamp.
`ReengageCommand`'s speed scrub now arms on the range being LARGE rather than OPENING. And the
ceiling band got the hysteresis it never had.

**The two things the pair trace corrected, both of which I had wrong.**

The wingman failure was never the lead departing. With `CommandOwner` published on both ships the
lead sits in `Reengage` from t=26 s to t=199 s at 4-6 km, and the decisive line is `plrAlive=False`
from **t=150 s**: once the slice stops chattering the WINGMAN reaches its hits sooner and kills the
fixture player while the lead is still 3.2 km out. Without the change the lead is seen firing at
t=180 s. The contract failed for want of a measurement window, not for want of a lead that attacks —
so the fixture's `PlayerHitsToDefeat` went 30 -> 60, which is the durability doing exactly the job
its own comment describes. The assertions are unchanged and both ships must still fire.

The ceiling-guard oscillation was a bare threshold, and the file already knew the pattern. Entering
`Return` above `_ceilingM + 350` and falling through to `Energy` below it is a single number on
`own.Y`; a jet holding station near the ceiling crosses it repeatedly and alternates tactic —
measured at six flips in eleven seconds at 11.77-11.85 km after a stable 139 seconds. The
`_ceilingDenial` latch has hysteresis for precisely this reason and this boundary was missing it.
It only became visible once the spiral stopped carrying the aircraft out of the band entirely.

**What is still open, stated precisely.** `ReengageCannotSpiralTheFightThroughTheCombatCeiling`
remains `Skip`-ped and remains a real defect, now narrower: the sign chatter and the leash contract
are fixed, but the ALTITUDE RATCHET survives — the scenario still reaches 15,001 m against a player
holding 4,592 m. The leash test passes because it grades wander and nose-away, not altitude. Do not
read its green as the spiral being solved.

One assertion in that reproduction was retired deliberately rather than quietly: it required the
pinned-bank leg to stay under 12 s, which was a proxy for "the aim solver stopped solving" written
when a pinned bank meant chatter. A committed slice holds the limit by design, so the proxy would
now fail the fix it was written to demand. The chattering has its own test; this one asserts the
observable defect, and reports the pinned-bank duration without asserting on it.

Remaining: the three gun-conversion contracts, `ProductionAceSustainsAHighGDefense...`, and
`BanditDoesNotRunFromAPlayerWhoSimplyClimbs`.

**Do not merge this branch to main until those five are resolved.** The branch is pushed so the work
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
