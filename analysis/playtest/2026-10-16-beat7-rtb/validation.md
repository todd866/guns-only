# Validation and interpretation

Runner source: `ecbba841` on `playtest/lab-rtb`. Both 90-sortie cohorts are complete: 180 Finished, zero timeouts.

## Commands

```sh
tools/playtest-lab/run --self-test
python3 -m unittest discover -s tools/playtest-lab -p 'test_*.py'
python3 analysis/playtest/2026-10-16-beat7-rtb/audit.py
tools/playtest-lab/run --beat 7 --seeds 30 --out analysis/playtest/2026-10-16-beat7-rtb/land
tools/playtest-lab/run --beat 7 --seeds 30 --end-after-combat --out analysis/playtest/2026-10-16-beat7-rtb/end-after-combat
python3 tools/playtest-lab/compare.py analysis/playtest/2026-10-16-beat7 \
  analysis/playtest/2026-10-16-beat7-rtb/land \
  analysis/playtest/2026-10-16-beat7-rtb/end-after-combat \
  --out analysis/playtest/2026-10-16-beat7-rtb/comparison.md
```

## Checks completed

- Release build: 0 warnings, 0 errors.
- Native self-test passed: clone reference and deterministic seeds, all 14 beats
  stage, timeout classification, fractional and mixed-factor perceived bins,
  dual-clock phase/dead-air conservation, exact swept near misses versus hits,
  early End without landing, terminal End events without an extra tick, and
  physical recoveries including an actual 8× ace recovery.
- Python: 12 tests passed, including both clock summaries, schema-1 compatibility,
  comparison seed/mode guards, and Markdown table consistency.
- Every saved run passed the committed `audit.py`: exact pilot/seed coverage,
  player/sim bin continuity, phase/dead-air/factor-duration conservation, counter
  and decision conservation, tension bounds, finish-event counts and physical
  recovery/End exclusivity. All 60 unavailable-End tapes match the landing cohort
  exactly after removing execution elapsed time. All 30 ace combat event prefixes
  and round/hit/kill totals match between modes.
- The kernel's `EmitEvent` stamps `_tick + 1` even for between-tick End. The raw
  `simSecond` on that single SortieFinished event is consequently one fixed dt
  beyond the completed simulation duration. The perceived stamp is the actual
  endpoint; no extra tick or duration is fabricated. The audit explicitly checks
  this convention and rejects out-of-range timestamps for all other events.
- Both complete 90-row SVGs were rendered at 1100 × 2230 with AppKit and visually
  inspected: legend, common perceived timescale, labels, phases and event traces.
  All generated Markdown table headers, delimiters and body widths agree.
- Two ace smoke runs completed and physically landed: seed 0 used 31.3833 sim
  seconds at 8×; seed 1 used 31.8. The two-row SVG was rendered and inspected.
- Standing refuter reviewed the integration and recovery controller. Its clock
  concerns were resolved by documenting that the baseline is 1× (so sim equals
  perceived), and that first action retains the baseline start-of-tick-interval
  estimate while event stamps retain tick time. Bins flush at integer perceived
  boundaries, with only the terminal bin fractional. The 14 km ingress handoff
  is explicitly a lab-controller modeling choice.
- Cursor opinion was attempted with six scoped files; its capacity guard refused
  with `cannot verify helper process identity`. No Cursor review is claimed.

## Measurement limits

Perceived time is the documented continuous native model: negotiate `Advance(0, 8)`,
observe one `StepFixed()` production tick, and accumulate fixed dt / entry factor.
All duration weighting and experience bins use that clock. Simulation time remains
separate, and `wallSeconds` remains host execution elapsed time. This is not an
exact browser-frame or renderer-cost-governor measurement.

The recovery pilot follows the published ingress while farther than 14 km from
the runway, then uses the lab's established straight-in join. Quiet aligned
segments release pitch/roll and scripted overrides and retain the throttle lever.
The kernel still owns safety, factor selection and physical landing. Baseline
changes therefore include the necessary recovery-controller route change as well
as the measured factor-weighted time savings; do not attribute every delta to 8×.

Combat = merge + fight + defensive. Phase shares pool durations across runs.
Longest dead air is the maximum contiguous streak, not the average run maximum.
Both modes preserve incomplete/censored runs and distinguish physical landing,
completed combat, early recovery, and intentional End. An unavailable End leaves
the pilot flying the same recovery as default.

The existing clone's repeated crashes are a policy-validity limitation carried
from the baseline, not evidence about the owner's human performance. Native
terrain, scripted profiles, and the existing proxy definitions remain unchanged.

## Environment

.NET runs inside the sandbox. As documented in the original cohort validation,
the installed battery guard's unchanged admission logic uses copied state in a
writable temporary directory (`PLAYTEST_POWER_GUARD`; pointer at
`/tmp/lab-rtb-guard-path`). AC power was checked at 80%; each sortie checks admission.
No visible browser or owner window is used. SVG rendering uses AppKit in a command-
line process with compiler caches in temporary writable directories.

The source was committed before collection so both manifests identify the same
runner revision. The generated reports, summaries, manifests and 180 compressed
raw tapes are retained. The original baseline directory was not modified.
No simulation processes or browsers remain from this task. No external changes,
push or deployment.
