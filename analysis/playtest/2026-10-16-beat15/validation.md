# Evidence validation

Measured simulation/controller source: `f534aa8218bd0adb31bef0f044b17f94901d5028`.
The subsequent result commit improves report wording and SVG layout only; the C#
runner, pilots, observer and simulation are unchanged. The manifest records runtime,
assembly hashes, command and all 90 tape paths. Final assembly hashes were checked
against the manifest.

Validation completed:

- Release build: zero warnings/errors.
- `tools/playtest-lab/run --self-test`: passed, including paired hunter replays,
  physical envelope/gondola and ROE fixtures, sight-window transitions, first-pass
  ace kill, no synthetic drones, censoring and generic physical recovery regressions.
- `python3 -m unittest discover -s tools/playtest-lab -p 'test_*.py'`: 16 passed.
- All 90 unique pilot/seed pairs (three pilots, seeds 0–29) reconciled: tick/bin/phase
  durations, rounds/hits/kills, envelope/pass/ROE events, sight-window durations,
  first-window timestamps, denied sectors, safe kills and unchanged assembly hashes.
- Final SVG parsed and rendered at 1240 × 2340; full image inspected for labels,
  legend, marker visibility, minute grid and final rows. `timeline.png` is the
  inspected native AppKit render. Headless Chromium could not launch inside this
  sandbox (SIGABRT); no owner browser/app window was used.
- Independent refuter review completed. Cursor's separate opinion helper could
  not start because its capacity guard could not verify helper process identity.

The evidence does not establish complete sortie duration: all 90 tapes end at
3600 s, still airborne at `GATE 1` with gear up. Hunt ends remain measurable:
87 accepted `RTB:combat-budget` at about 600 s, three accepted
`RTB:route-exhausted` at about 82.6 s. Shared recovery-controller integration
requires separate work; its failure is not evidence that the balloon hunt itself
lasts 60 minutes.

The reckless pilot never killed the town-footprint relay. Zero observed ROE
violations therefore does not establish an effective ROE teaching consequence.
The physical ROE event path is covered by the fixture, separately from the cohort.
No envelope-only passes occurred in the cohort. Drone release/kill is structurally
unobserved because this Phase 1 build has no player drone-release route.
