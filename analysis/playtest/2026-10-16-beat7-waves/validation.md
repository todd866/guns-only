# Iteration 2 validation

Source: `7c19f0fb257d45cdf968d9a80880e1027cff46df`; the final 3 × 30 rerun and remaining verification are in progress. The current implementation is based on the committed source lineage;
the final source/commit identifier will be filled in only after those checks pass.
The [iteration2](iteration2/manifest.json) and baseline tapes remain preserved.
[comparison.md](comparison.md) is not regenerated until the final 90-run cohort exists.
All runs use seeds 0–29, the default land/RTB mode, a 3600-s censoring bound, and the
original experience thresholds.

## Changes and bot validity

The continuation warning lasts 20–24 seconds. W3 is a single committed Veteran.
W4 is a baseline-mounted Ace plus one baseline Veteran (two contacts total). W5 retains the four-Ace
spike. The pending ReactiveBandit change is committed-only rejoin behaviour for
contacts beyond 2,200 m and within 15,000 m, using the existing command and
preserving terrain, energy, and ordinary guards. It addresses the stable 2.6–4 km
orbit seen in mixed-pair ace seeds 21, 23, and 24. No gun, damage,
aircraft-performance, opening-opponent, or game-assist constants changed.

The lab ace requests RTB immediately below 90% health, even before minimum combat
completion, and leaves on bingo, winchester, or five completed waves. The current
three-hit player damage model makes the first hit exceed this light-damage allowance.
A request does not erase rounds already in flight. The survival gate therefore
counts completed survivable outcomes, not a request followed by destruction. The
request count remains a separate diagnostic.

The novice already received the game's full gun assist: `FightDirector.PitchAssist`
is `(1, 1, true)` at every rung, and `ApplyGunneryPitchAssist` also processes scripted
commands. The old delayed world-space pursuit controller rarely brought that aid
into its capture envelope; its restrictive trigger produced 17 rounds and zero
hits across 30 runs. This was a controller validity failure, not evidence for
softening W1–W2.

The repaired novice follows the production lead cue in body coordinates, with
0.4–0.7 s reaction delay, 0.8–2.3 s initial hands-off delay, ±2° aim bias, and an
8° sloppy trigger window inside 900 m. It uses ordinary analog/trigger inputs and
the same gun assist as the player. It clears any previous scripted terrain/search
command when resuming cue control. It does not enable device-specific automatic
fire or write aircraft state, damage, or kills. The clone and ace opening control
parameters remain unchanged. W1 requires a gun kill; the unchanged W2 is the
authored defensive-survival lesson (`ObserveDefensiveLesson`), so two completed
waves must not be described as two gun kills. The preserved calibration result is
30/30 W1 kills and 23/30 W2 completions; all seven W2 failures end in destruction
before that lesson completes. The final 90-run result remains pending.

## Measurement and checks

`waveContacts` records the actual previous-win tick, warning duration, and first
physical threat tick at 120 Hz. The warning is sampled at tick end, so its
remaining time can be 1/120 s below the authored duration; the warning gate allows
only that sampling offset. The arrival clock does not reset on pilot decisions. Contacts
canceled by an elective RTB are listed as canceled, not silently treated as arrivals;
an uncanceled missing arrival fails the gate. The original dead-air definition
and RTB-AP exclusion remain unchanged, including manual approach and wreck descent.
Successful End is complete, not censored; an incomplete sortie remains in every
denominator and length distribution. p50 is the median; p90 uses the lower observed
order statistic at index `floor((n-1)*0.9)`.

**109 xUnit, 27 Node, and 21 Python tests passed, plus the native lab self-test; five
additional ReactiveBandit/leash checks are pending.**
The xUnit selection is the same eight suites listed below, with an added all-30-seed
arrival regression and updated W4/policy assertions. The lab self-test covers
novice live gun hits, stale scripted-control release, damage/resource/wave-limit
policy, and a separate ingress clock despite deliberately noisy pilot decisions.
The saved-tape audit is `python3 analysis/playtest/2026-10-16-beat7-waves/audit_iteration2.py`.
Logs are in [checks/iteration2](checks/iteration2/).

Two complete 90-run calibration datasets are preserved: [Veteran-pair calibration](calibration-veteran-pair/manifest.json), source `dcd968f8`, and [mixed-pair calibration](calibration-mixed-pair/manifest.json), source `f196bc60`. Both directories were renamed only after completion, so each manifest retains its original launch path. The mixed-pair calibration recorded 9 wins, 17 losses, 3 incomplete runs, and 1 crash; its novice result remains 30/30 W1 and 23/30 W2. These calibration tapes are not pooled into the pending final 3 × 30. The historical rationale is calibration evidence, not a claim that the final source or final 90-run result is complete.

The standing refuter's survival-measure objection was fixed. Its concern about
using decision activity as an ingress proxy was addressed with the separate contact
clock. The proposed device auto-trigger change was rejected after verifying that
full gun assist already applies; the refuter accepted that distinction. No remaining
material code objection was reported. The optional Cursor review was attempted
through its guarded helper, which refused because it could not verify helper process
identity in this sandbox; no bypass was used.

The installed battery guard ran through the existing task-local state adapter,
which preserves low-power holds. AC power admitted the jobs. The normal shared
state path remains outside writable sandbox roots. No visible browser was used,
and no UI, full-suite, deployment, push, or stamp claim is made.

---

# Beat 7 wave validation

**108 xUnit, 27 Node and 14 Python tests passed; zero final failures.** The native
lab self-test passed, including stay/go, real full-stop recoveries, hands-off AP,
threat drop and cleared-condition retry. Logs are in [checks](checks/).

This study extends the existing FightDirector, difficulty profiles, formation coordinator,
session combat lifecycle and RTB autopilot. It does not change projectile physics,
hit radii, the player's airframe, or the two authored opening opponents.

## Implementation and scope

- W3: two committed Veterans. W4: an Ace in the uprated mount and two baseline
  Veterans. W5: four Aces, with baseline wing mounts; W6 raises the wing mounts.
  W7 onward can draw the existing Boss profile. Doctrine and approach side/range
  use stateless keyed seed draws. The existing tier ceiling still applies.
- Each win pays 100 points times its wave multiplier: 1, 1, 1.5, 2, 2.5, … .
  The two opening wins satisfy the minimum combat objective and do not end the
  sortie. The next contact warning displays bearing, nautical miles, wave and
  multiplier. Its 18–24-second turn interval precedes a physical 6–8 km ingress.
  Exact arrival depends on the player and closure; the delay alone is not an
  empirical 45–60-second arrival guarantee.
- RTB and End are available throughout the escalating sortie. End before the
  minimum objective is discontinued; End never grants a landing. Bingo and empty
  ammunition force the RTB handoff. The ace lab policy stays until resources;
  novice leaves after two wins or damage; clone policy is unchanged.
- A stateless 35% seed bucket schedules one lone RTB attacker. It waits for the
  original contact/relief gun custody to clear and is canceled on final approach.
  Thus 35% is eligibility, not a promise that 35% of all sorties encounter it.
  A live interceptor restores both sides' weapons and drops compression/AP through
  the existing threat gate. Its result is excluded from wave wins/learning.
- Later committed profiles keep the fight centre with the observed player and
  disable disengagement. The existing pressure/bracket coordinator owns the pair;
  additional wingmen bracket opposite sides of the same sampled contact. The
  first two opponents do not use this committed profile.

## Measurements and provenance

The main cohort is default land plus RTB autopilot, seeds 0–29 for clone, novice
and ace, with the same 3600-s bound and 2500-m threat / 25-m shot-near-miss /
100-m ground-near-miss thresholds as the paired baseline. Perceived time is
`sum(dt / pre-tick compression factor)` at 120 Hz, not browser wall time.
All censored runs remain in the tables. Combat share pools merge/fight/defensive
durations, including pursuit; it must be read with the dead-air measure.
The tested implementation is commit `600b024f190235d647e8d4aa8354f74848636189`.
All 90 tapes passed the audit. The 66 tapes saved before the original exception
replay identically after the fix, excluding execution time. All 30 clone tapes
and all 30 ace opening engagement summaries match the earlier AP cohort.

W3 first threat occurs about **25.5–33.3 s after W2 completion**, mean 29.1 s,
using the start of the first threat-containing one-second bin (up to one-second
quantization). Thus it arrives inside 60 seconds but earlier than the nominal
45–60-second band. Later quiet combat intervals, rather than this initial ingress,
produce the worst ace pacing failures. Aces win two waves in 20 runs, three in
nine, and four in one; that last run reaches W5. W6+ is covered by the configured
ladder, not a claim that this cohort survived to those waves.

Raw dead air is retained. The additional gate counter excludes only actual RTB
autopilot ownership without an active bounce. Warning time, inactive combat,
manual approach, and wreck descent remain eligible. Ownership is sampled at the
observed tick boundary (at most one tick of boundary uncertainty). The baseline
does not have this additional field and is shown as N/A.

The clone file remains SHA-256
`a1ac519084ac414a873933838e4cd00dc816ed9c92fcd4a2b962fad56ba039ef`.
The audit checks continuous bins, clock/factor/phase/counter conservation,
event bounds, exact seed coverage, earned scores, and unchanged clone tapes.
The first-two ace engagement summaries are compared separately with the prior
cohort; later-wave control changes are never attributed solely to AI changes.

The ace adds flight-path/terrain recovery only after two wins and turns toward
the warning bearing. The original delayed HUD cue controller still flies its
fights. A separate five-seed novice speed-aware-throttle probe produced zero
wins; it was rejected, and the original novice controller was restored.
The 30-run novice cohort fires only 17 rounds in total (all in seed 12), scores
zero hits, and spends just 2.28 seconds in an authorized ballistic gun envelope
across all runs. Its zero-win gate therefore remains an unresolved controller/
opening calibration problem, rather than evidence that the later-wave difficulty
changed the first two opponents. Removing its old 600-second fallback exposes
long stalled fights; 20 runs reach the 3600-second censoring bound.

A [seed-0 trace](checks/ace-seed0-trace.log), using the same production lab pilot
and compiled simulator, samples the later fight every ten seconds. At 70 s both
bandits are within 2.3 km but point 76–78° away. At 120 s the wingman is 11.5 km
away in Return; by 140 s it has closed to 1.44 km and points within 2°.
The long quiet interval is therefore a real failure of the unchanged action proxy,
including distant recommit and maneuvering without a firing/threat opportunity.
The implementation does not relabel every combat tick as meaningful action.
The [trace source](checks/ace-seed0-trace.cs) is a console harness referencing the
built `GunsOnly.PlaytestLab` and `GunsOnly.Sim` assemblies, not a changed AI policy.

## Regression found by the cohort

The first attempt at source `b8504825` stopped at ace seed 6 after 66 saved runs.
W4 selected Ace doctrine 2, then incorrectly passed it to Veterans whose profile
has only two doctrines. Those tapes and the exception are retained in
[initial-partial](initial-partial/report.md), not pooled into the final cohort.
The fix maps each wing's doctrine into its own profile and carries that mapping
through promotion. Production-session regression seeds 0, 6 and 7 exercise W3
through W5, including mixed-tier promotion. The main cohort is rerun in full.

The original attempt's manifest RTB-policy sentence predates the final corrected
wording: wave ace/novice do not use the generic 600-second combat budget.
Both recorded cohorts also use the older `RTB:combat-budget` decision label for
the novice's damage-triggered return; the final lab code labels it `RTB:damage`.
That label-only follow-up does not change the policy, controls, event timing or
measurements. A fresh novice seed-0 replay matched its complete saved tape after
normalizing only that label and excluding execution time. Behavior is established
by the source and tapes, not the old label.

## Review and environment limits

The final combined xUnit selection was `SortieWaveTests`, `F22FiniteSortieTests`,
`DifficultyRampTests`, `RtbCompressionTests`, `BfmFlightAcceptanceTests`,
`ContinuousCombatTests`, `FormationCombatTests`, and `FightDirectorSessionTests`.
Finite-sortie fixtures explicitly retain finite configuration; beat 7's new default
has separate production-session coverage. The failing mixed-tier seed is included.
The Node selection covers result rendering, combat/result boundaries and keyboard
controls; the Python tests cover report/comparison metrics and RTB exclusions.

Reproduce the focused xUnit run with:

```sh
bin/test-in-process SortieWaveTests F22FiniteSortieTests DifficultyRampTests \
  RtbCompressionTests BfmFlightAcceptanceTests ContinuousCombatTests \
  FormationCombatTests FightDirectorSessionTests
```

Reproduce the saved-tape checks with:

```sh
python3 analysis/playtest/2026-10-16-beat7-waves/audit.py
python3 analysis/playtest/2026-10-16-beat7-waves/compare-waves.py
```

The standing refuter checked wave reachability, minimum completion versus auto-RTB,
physical threat, ingress timing and mixed-tier construction. Reachability and
minimum-completion objections are covered by session tests; physical danger and
pacing are judged from the cohort, including failed gates. Its mixed-tier promotion
metadata finding was fixed and asserted. Cursor opinion could not run: the guarded
helper could not verify process identity inside this sandbox. No fallback bypass
was used.

The normal VSTest host cannot open its local socket here; xUnit runs through the
repository's in-process runner. Package-vulnerability lookup warnings reflect
unavailable NuGet networking, not test failures. Headless Chromium launch fails at
macOS bootstrap permission checks; no viewport screenshot pass is claimed. The
existing compact result row carries wave/score values; no new panel was added.
No full-sim-suite claim is made; Claude owns that run. No push, deployment, or stamp.

Battery admission used the installed guard with a writable task-local state
location, as supported by the lab launcher. AC power at 74–80% cleared admission.
No power settings or notification authorization changed.
