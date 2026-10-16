# RTB autopilot re-measurement

Implementation source: `ee5853bc7c81e86fa990b6bff0ac3e5924a8e150`,
`playtest/lab-rtb`. The implementation was committed before collection.

## Behavior

Y or `SetTimeCompressionEnabled(true)` transfers F-22 RTB control to the kernel's
autopilot. It uses `RecoverySteering`, extracted from the existing lab recovery
controller: published ingress outside 14 km, then the existing straight-in join
and speed/height feedback. It integrates the ordinary 120 Hz physics ticks;
there are no kinematic shortcuts. Turns and internal control-law settling no
longer block engagement. AP does not select landing configuration.

New player stick input outside an authored 8% deadband, configuration input,
threat, airborne rounds, AUTO-GCAS lead, final guidance or ~3 NM threshold range
disengages both AP and compression. Fast-time credit is discarded. Clearing a
condition does not take control from a player automatically: one Y press
re-engages. A key held across engagement transfers control back on the next
tick; stale filtered commands do not. The lab explicitly retries engagement
and writes no control setters or scripted override while AP is active. It
resumes its manual landing controller after handback.

The host's performance ceiling is separate from safety: it may run AP at 1×,
2× or 4×. AP ownership is independent of tick scheduling, allowing identical
physics at equal tick counts. The HUD cell reads `▸▸ 8× AP`, or the actual
accepted factor, while AP owns the controls. Both JSON and hot snapshots carry
`rtb_autopilot_active`; hot layout version is 35.

## Validation

- **90/90 sorties Finished; 0 timeouts; 56 physical landings; 0 early Ends.**
  Outcomes match the earlier landing cohort: 30 ace wins, 26 novice recoveries,
  four novice losses and 30 clone crashes. All 56 returning survivors used 8×.
- Mean sortie is **367.1 perceived / 808.8 simulated seconds**, with **27.8% / 67.2%
  RTB** and **55.5% / 25.2% combat**. Every new raw tape passed `audit-autopilot.py`,
  including paired combat duration/counter checks and source/mode/hash guards.
- The generated 90-row timeline SVG was rendered with native AppKit at
  **1100×2230** and visually inspected for labels, legend, phase boundaries and
  complete rows. This checks the measurement figure, not the in-game HUD.
- **184 xUnit cases passed; 0 failed, 0 skipped**, executed using the repository's
  in-process xUnit executor. Selection: `RtbCompressionTests`,
  `TimeCompressionTests`, `MeshNavSnapshotTests`, `F22FiniteSortieTests`,
  `CombatHandoffTests`, `ConventionalRunwayRecoveryTests`,
  `ConventionalRunwayPatternRecoveryTests`, `SnapshotHotFrameTests`,
  `KeyGrammarTests`, `RapierEconomyTests`.
- Engagement through Y/API, raw input handback, held-key timing, single-press
  re-engagement, host caps, 3 NM mid-batch handback, threat, rounds, configuration,
  GCAS and snapshot ownership are covered. Three seeds have exactly equal
  aircraft states, fuel, events and sim time at equal tick counts under 1×/8× AP.
- **50 node tests passed; 0 failed** across the compression HUD, HUD readouts
  and measured-cost compression budget. They include AP at 8×/4×/2×/1×,
  non-AP compression and no idle cell after handback.
- **12 Python tests passed** for report/comparison accounting and provenance.
- Lab `--self-test` passed, including explicit engage → 120 hands-off fast ticks
  → threat drop → blocked retry → cleared retry, deterministic/varied seeds,
  all 14 beat staging, exact clock/counter accounting, End without landing, and
  physical full-stop recovery.
- Release lab build: 0 warnings, 0 errors. Test-runner build succeeded; cached
  NU1900 warnings reflect unavailable NuGet vulnerability lookup. All required
  packages were available locally. VSTest was attempted but its loopback
  listener was denied by the sandbox, so the same xUnit cases ran in process.
- Standing refuter reviewed the diff and the added checks; no material objection
  remained. The independent Cursor opinion was attempted with five scoped files
  but its capacity guard refused: `cannot verify helper process identity`.
- Headless HUD QA was attempted at 1280×720, 390×844 and 844×390. The sandbox
  denied the local server listener and Chromium's Mach bootstrap. **No viewport
  screenshot or visual acceptance is claimed.** No owner window was used.

Reproduce the cohort and audits:

```sh
tools/playtest-lab/run --beat 7 --seeds 30 \
  --out analysis/playtest/2026-10-16-beat7-rtb/land-autopilot
python3 analysis/playtest/2026-10-16-beat7-rtb/audit-autopilot.py
```

The output directory must be absent/empty for a fresh run. Default land mode is
used, with all three pilots and seeds 0–29; no `--end-after-combat` flag.
See [comparison.md](comparison.md) and [the complete cohort report](land-autopilot/report.md).

Perceived seconds remain continuous native weighting (`dt / pre-tick factor`),
not browser frame time or execution wall time. Changing ownership alters the
flown recovery trajectory, so a baseline delta is not solely a time-weighting
effect. Combat phases and counters are checked seed by seed against the prior
landing cohort. The clone remains an engagement-policy limitation, not a model
of the owner's human performance.

AC power was verified at 80%. The unchanged installed battery guard's admission
logic ran with a writable temporary state copy, preserving shared/local holds;
each sortie checked admission. Only explicit paths were committed. No push,
deployment or release stamp was performed.
