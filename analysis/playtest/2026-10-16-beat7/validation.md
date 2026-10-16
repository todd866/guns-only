# Validation and interpretation

Runner source: `2cc258ff24f8a8d08f62066f4b0c08655b5fe89c`.
Runtime: .NET SDK 8.0.423; Python 3.14.7; macOS.

The manifest records the cohort command, seed range, source revision, model hash,
thresholds and wall time. `report.md` and `summary.json` contain its measurements.

## Measured cohort

All 90 sorties reached the authored finished lifecycle: 19.45 simulated hours in
11 minutes 14 seconds (103.9 times real time), with no timeouts.

| Pilot | Outcomes | Longest dead air |
|---|---|---:|
| clone | 30 ground crashes; no shots fired | 38.1 s |
| novice | 26 recovered after RTB; 4 combat losses; no wins | 836.2 s |
| ace | 30 combat wins with physical landings | 195.2 s |

All 90 runs exceeded the 20-second dead-air threshold. RTB exceeded combat time in
55 runs, approach in 30, and landing/rollout in 9. Novice 0% and ace 100% win rates
both triggered flags. No run exceeded 30 seconds to first action. Tension rose from
engagement 1 to 2 in all 30 eligible ace runs (mean increase 0.163); the other pilots
did not reach a second engagement. There are 186 flags in total, not 186 failed runs.

## Checks

- Release build: no warnings or errors.
- `tools/playtest-lab/run --self-test`: passed clone reference cases, same-seed
  replay and varied-seed checks, all 14 built-in beat staging checks, timeout and
  fractional-second accounting, physical hostile-round near misses versus hits,
  and three actual runway recoveries. The latter include the formerly stuck
  novice/ace seed 1 join cases; no teleport or forced landing credit is used.
- `python3 -m unittest discover -s tools/playtest-lab -p 'test_*.py'`: 7 passed.
- Every saved tape passed a cohort audit of seed coverage, duration/phase/dead-air
  conservation, round/hit/kill/near-miss totals, decisions, tension bounds, completion,
  and physical landing for every win/recovery.
- Full novice seed 1 (1,909.3 s) and ace seed 1 (619.6 s) tapes exactly matched their
  earlier smoke replays after excluding only wall time.
- The complete 90-row SVG was rendered at 1100 × 2230 and visually inspected;
  legend, shared timescale, phase bands, event markers and tension traces are visible.
- A separate CASEVAC beat 13 development smoke reached the authored finished
  lifecycle at 1,133.8 simulated seconds using the shared rotary-wing adapter.
- Read-only adversarial review completed; its actionable findings were resolved.

## Interpretation limits

- The committed clone is the existing engagement policy, unchanged. Its reference
  outputs match the trainer, but its repeated beat 7 ground crashes without firing
  make it unsuitable as evidence of the owner's real performance in this cohort.
  This is a policy validity finding, not a reason to silently replace its decisions.
- The novice and ace are scripted profiles. Their win rates are diagnostic flags,
  not calibrated estimates for human beginners and experts. Seeds vary pilot
  perturbations; they do not randomize the mission or import owner progression.
- Recovery uses a common outbound/inbound join and straight-in final. Long return
  legs include that route and the altitude/position left by the combat pilot.
  They must not be attributed entirely to the authored mission route.
- Threat, decisions, dead air and tension are defined observable proxies. They do
  not measure reported emotion. Missing engagement 2 is N/A for escalation.
- Every beat id is accepted and stages successfully. The full 30-seed cohort is
  beat 7; specialist-beat pilot quality has not been established by that staging
  check. Time-limited runs remain explicitly incomplete/censored.

## Environment

.NET ran successfully in the sandbox. The installed battery guard's normal state
lock was outside writable roots, so this run used its unchanged admission logic
with a temporary writable state directory via `PLAYTEST_POWER_GUARD`. Power was
AC at 80%, and admission was checked before every sortie.

Headless Chromium could not launch in this sandbox. SVG inspection instead used
the native AppKit image decoder in a command-line process, without opening or
focusing any owner window. A separate Cursor opinion was unavailable because its
guard could not verify process identity under the sandbox; the configured refuter
provided the independent code review.
