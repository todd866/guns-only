# Bandit containment — handoff

**Status: ready to commit and deploy. Not "fixed" until someone flies it.**

Pilot report that started this: a bandit opened to 7.0 NM at 81 kt closure and had to be run down
in a stern chase, in a guns-only sim with nothing to shoot at that range. Screenshot showed the
player at 15,067 ft, M1.11.

## What changed

All in `sim/Doctrine/ReactiveBandit.cs`.

1. **`BanditTactic.Return` was unreachable for every lookahead tier.** In `Step()`, the final
   `else` discards whatever `SelectTactic` decided and force-sets `Acquire`. Only `Energy`
   short-circuited before it, so from Veteran up there was no containment at all — neither the
   5.2 km fight-centre leash nor the per-fight ceiling. `Return` now short-circuits the same way.
2. **The anti-camp ceiling guard bypassed the leash**, returning early before the radius check.
   It now sets its intent and falls through.
3. **No hysteresis on that guard** — entry and exit both tested `own.Y > _ceilingM - 900`, so the
   bandit chattered `Energy`/`Acquire` pinned to that altitude. Now arms at `-900`, disarms at
   `-1400`.
4. **The guard only arms when the bandit actually lacks energy** (`speed < _highSpeedMps`). A
   training opponent cannot kill anyone while pointing away, so running is never its best move.
5. **Fight-ceiling headroom 1,000 m → 2,500 m.** The old figure capped the modern merge at
   13,478 ft over 10,000 ft staging — less vertical than one honest high yo-yo, so normal BFM
   tripped an anti-camping rule.
6. **The lookahead scorer guarded `CombatCeilingM` (11.5 km), never the per-fight `_ceilingM`.**
   Traced a bandit at 13,437 m against a 5,608 m ceiling. Now scores against `_ceilingM`.
7. **Two roll-direction singularities.** `Geometry.BankToPlaceLiftVectorOn` returns ±π for an aim
   point in the vertical plane through the velocity vector, and the sign is rounding noise: the
   commanded bank alternated ±1.35 rad every tick at 120 Hz and the jet never rolled at all,
   pitching to 79° nose-up while losing 28 m/s. Fixed with a deterministic roll direction in the
   nose-high recovery and a lateral aim offset in `ReengageCommand`.
8. **New player-relative leash** — `ReengageRangeM` (3.5 km) with `AbandonChaseRangeM` (15 km).
   Beyond 3.5 km *and opening*, the bandit turns back into the player; beyond 15 km the player has
   left and it holds its arena instead of tail-chasing (a recorded track wanders 346 NM on RTB).
   The trigger tests range **rate**, not range: an unqualified range test fired through the whole
   9 km staged run-in, cancelled the lookahead for its duration, and starved the planner-teacher
   pipeline — that broke `PlannerShadowRoutingCoordinatorTests`.

## What the telemetry says

From 37 real post-merge sorties in the local chunk cache: **49% opened past 3 NM, 22% past 7 NM,
29% climbed above 19,550 ft** (the altitude that arms the anti-camp guard). The reported failure
was roughly one fight in five, not an outlier.

## Test suite

- `sim.Tests/BanditArenaLeashTests.cs` — containment corridors.
- `sim.Tests/RealPlayerTrackTests.cs` — replays 12 real flight paths. **Validated to catch the
  bug: 8 of 12 tracks fail the roll-chatter assertion on the pre-fix code, at 12–51 reversals/s.**
- `sim.Tests/SyntheticPilot.cs` — a pilot that flies closed-loop, with reaction latency.
  `Cohort` is fitted to 124,731 samples across 64 real sorties; `Competent` is a hand-specified
  BFM baseline, fitted to nobody.
- `sim.Tests/SyntheticPilotDuelTests.cs` — closed-loop duels, plus a test asserting the synthetic
  pilot's own flown distributions match the cohort it claims to model.
- `tools/telemetry/extract_bfm_fixtures.py` — regenerates the fixture from the local cache. No
  network; the retrieval rules in `tools/telemetry/README.md` still govern filling that cache.

## Open, and NOT part of this change

**Low-altitude stalemate (pre-existing, newly exposed).** Against `PilotProfile.Competent` the
bandit descends 3,181 m → 124 m after the first merge and the fight collapses: both aircraft near
the surface, range oscillating 5.8–7.4 km, bandit alternating `Acquire`/`Return` every two seconds
and commanding negative G at 130 m. Confirmed pre-existing — original code gives 122 m / 29.2 s,
this change gives 124 m / 28.4 s. Recorded as a skipped test in `SyntheticPilotDuelTests`.

Note the asymmetry: against `Cohort` — the profile fitted to the phone traffic that actually
arrives — everything passes. It degenerates only against someone who can fly. That is a candidate
explanation for zero conversions across 150 real sessions *and* for the author's own sorties
ending in tail chases, via two different failure modes.

The duel harness runs with **no `ITerrainSurface`**, so the floor is the bare `FloorM` constant and
the bandit sits below it. Give the duel real terrain before concluding how much of this survives.

## Judgement calls worth revisiting

- `ReengageRangeM = 3500` was chosen, not measured — ~1.7× the 2,060 m gun reach.
- The ceiling headroom change reverses a prior pilot-report-driven decision ("the AI keeps flying
  super high", `Beats.cs:1138`). Most likely source of an opposite complaint.
- `_ceilingDenial` is replay-safe but is not in `PolicyMemory`, so a mid-fight state restore could
  desync inside the hysteresis band.

## Gates

- `sim.Tests`: this change is regression-free, verified by direct A/B (revert only
  `ReactiveBandit.cs`, re-run, diff the failure sets).
- **`bin/check` is red for reasons unrelated to this change**, and it fails *before* reaching the
  dotnet suite:
  - `Rapier definition envelope binds to FlightModel.RapierPublicDataSurrogate` — the JS mirror
    still carries the pre-`e616a4a` engine numbers.
  - `a committed production runtime change cannot silently reuse this build` — `web/wwwroot`
    changed in `1573665` without advancing `RELEASE_BUILD`. Build 212 needs bumping.
  - Plus Rapier/carrier C# tests pinning the old teaching-identity numbers.

  This change is `sim/` C# only and does not touch `web/wwwroot`, so it does not itself require a
  build stamp.

## Before calling it fixed

Fly one sortie: climb above the merge, force the old geometry, confirm he comes back and presses.
Nothing in the suite answers whether 1.9 NM feels like a leash or like being on a string.

And fly a few sorties **with telemetry on** if a synthetic-author profile is wanted — the cache
currently holds no flown desktop sortie, only three macOS sessions of a trimmed jet parked at
10,000 ft.
