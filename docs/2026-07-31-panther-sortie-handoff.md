# F9F-2 Panther sortie — handoff

State at commit `fdc08d1`, 2026-07-31. Read this before touching the Korea beat or
`SortieSchedule`; it will save you the two hours of diagnosis that produced it.

## Where it stands

**Works, verified in a real browser.** The menu tile *KOREA 1951 · Panther off Essex* launches
mission 14. It stages `mission.korea.panther-sortie.v1` in an F9F-2, fires Essex's catapult
(3 → 93 kt down the stroke), and leaves the deck at 147 kt with the schedule publishing and
commanded power at 1.000.

**Does not work.** About five seconds after the catapult handoff the aircraft terminates with
`player_impact_surface: GROUND` at ~153 m MSL, with `terrain_present: true`. **This is the one
open blocker and it is the next thing to fix.**

Because the flight ends there, **only the `Launch` leg has ever been flown end to end.** `Climb`,
`Transit`, `Recovery` and `Groove` are unit-tested and are publishing correctly, but nothing has
reached them. Treat them as unproven.

## The blocker, and what is already known about it

`Beats.KoreaSortie()` inherits `Environment: Ukraine2030sTheatre.CoastalCell` from
`CarrierApproach()`. The carrier is built at `deckCentre: (0, 20, 0)`, heading 0 (due north).
The climb-out therefore departs north from mission-local zero, and something at roughly 150 m
elevation is in the way.

Why nobody noticed until now: `KoreaCarrierApproach()` starts the aircraft **1500 m astern at 90 m
and only ever descends**. It never climbs out, so it never crosses the departure path. The sortie
beat is the first thing in this project to fly away from that ship.

What has NOT been established, and is the first thing to check:

- Whether the terrain under and north of the carrier is genuinely land, or whether the coastal
  cell's sampling is returning a bad elevation at that anchor. `CoastalCell` sets
  `TerrainSourceAnchorEastM/NorthM = -100_000` with the comment *"lies in the synthetic coastal
  water cell"* — so the intent is clearly water. Verify the intent survived.
- Whether a headless `dotnet` test reproduces it. **It does not today**: `ThePantherActuallyGetsOffTheDeck`
  passes because the kernel test runs with no terrain surface loaded. That gap is why this was
  only ever visible in a browser. If you fix the placement, consider a test that loads terrain.

Do not "fix" it by moving the deck without checking the above — the ship's position also feeds
`RecoveryPlan` and the recovery geometry.

## Things that will bite you

**`Beats.LastBuiltInIndex` must be raised with the switch.** An index past the end does not throw
and does not warn — `StartBeat` silently clamps it to `FirstBuiltInIndex`, i.e. Perch in an F-86.
That produced a browser showing a boot card reading "F9F-2 PANTHER / KOREA SORTIE" over a running
`mission.perch-attack.v1`, with every unit test green, because the tests called `Beats.BuiltIn(14)`
directly and bypassed the validator. `TheIndexTheMenuSendsSurvivesTheSessionsOwnValidator` now
guards that path. **Any new mission needs a test that goes through `StartBeat`, not `BuiltIn`.**

**Do not derive an approach speed from clean `CLMax`.** It has been tried and reverted twice now.
It flatters straight wings and punishes deltas, because the landing configuration changes CLmax by
a different amount on different aircraft. Airframes declare `ApproachFlapCLIncrement` and
`ApproachStallMargin` instead; defaults (0.0 / 1.14) reproduce the legacy expression exactly, so
adding a measured figure to one aeroplane cannot move another.

**`SortieSchedule` is deliberately NOT an extension of `GoldenPath`.** `GoldenPathTests` pins the
saturated-power behaviour (`CommandedPower01 == 0.0` exactly, and a monotone-decreasing sweep), so
an in-place fix breaks those tests. The two coexist; `hud.js` prefers the sortie schedule when
`sortie_valid` is true and falls back to the golden path otherwise.

**Why the session hook is a sibling, not a child.** `UpdateSortieSchedule()` is called next to
`UpdateRecoveryProcedure()` rather than inside it, because that method returns immediately when no
recovery procedure exists — which is precisely the state the aircraft is in while it is still on
the catapult. Nesting it there makes the launch legs unreachable.

## What is still unfixed elsewhere, and relevant

From `docs/2026-07-31-player-path-map.md` (same day):

- Of the seven `golden_path_*` fields, only two are read anywhere. The new `sortie_*` fields are
  in the same danger: **only `sortie_valid`, `sortie_power_01`, `sortie_leg` and `sortie_waveoff_s`
  are consumed today.** `sortie_target_height_m`, `sortie_target_tas_mps`, `sortie_limit` and
  `sortie_distance_to_go_m` are published and unrendered. There is no ribbon. If you want one,
  those fields are already there.
- The climb/cruise multiples in `UpdateSortieSchedule` (`2.2 ×` and `2.7 ×` on-speed) are
  PROVISIONAL and want fitting from a flown profile. They are expressed as multiples of the
  aircraft's own on-speed rather than as authored knots so that a second airframe inherits a shape
  rather than a Panther's numbers.
- `RecoveryDragToWeight` is still a shared `const 0.12` across every airframe.

## Reproducing the browser check

The kernel tests are not sufficient — see above. The probes used here live in a scratch worktree
and are not committed; recreate them or use `web/smoke/`:

```sh
bin/dotnet-env; dotnet publish web/GunsOnly.Web.csproj -c Release -o /tmp/pub
# then serve /tmp/pub/wwwroot and drive ?program=korea-panther in headless Chromium,
# reading globalThis.__gunsState.sortie_* and player_impact_surface.
```

Note that a `dotnet publish` on its own does **not** stage the gitignored Ukraine terrain atlas —
`bin/deploy-web` does that explicitly and fails closed without it. A bare publish will 404 the
atlas pages and interlock the Rapier missions on their 15 s terrain deadline. That is a harness
artifact, not a product bug.

## Test coverage added

`sim.Tests/KoreaSortieScheduleTests.cs`, 10 tests. The load-bearing ones:

- `ThePantherApproachSpeedReproducesTheMeasuredHundredAndFourteenKnots`
- `EveryOtherAirframeKeepsTheApproachSpeedItAlreadyHad` — the regression guard for the above
- `TheScheduleCanAskForMorePowerNotOnlyLess` — the defect `SortieSchedule` exists to fix
- `TheWaveOffWindowIsSetByTheEnginesSpoolNotByTheShip`
- `ThePantherActuallyGetsOffTheDeck` — kernel-level, **no terrain**, see the blocker above
- `TheIndexTheMenuSendsSurvivesTheSessionsOwnValidator`

Full sim suite at commit time: **1673 passed, 1 failed**. The failure
(`RapierMissionTests.AutomationCanFlyTheWholeAuthoredSortie...`) is a parallel agent's in-flight
Rapier work, independently attributed with `bin/whose-red`. It is not this change.
