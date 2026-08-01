# Telemetry v2 — closing the opponent-diagnosis gap

Status: **specification, not implemented.** Written 2026-08-02 against Build 238
(`e4c4c3fbc19705548619bb1829b148c4de521a37`).

Motivating evidence: the Build 238 F-22 acceptance flight
(session `web-1785627445839-631596`, 2026-08-02). In that sortie the bandit fired **99 rounds
across 87 trigger-down snapshots** and killed nobody, while the player took 5 kills from 573
rounds for 6 hits. Production telemetry can prove *that* the bandit shot and missed. It cannot
say *why*, and that is the gap this document closes.

## Correct the premise first

An earlier working note claimed the snapshot "carries no opponent kinematics (only health and
alive)". **That is wrong**, and planning from it would have produced duplicate fields.

Already emitted every hot frame, for the bandit:

| Field | Meaning | Precision | Site |
| --- | --- | --- | --- |
| `bx` `by` `bz` | world position | 3 dp | `web/SnapshotHotFrame.cs:1125` |
| `bfx` `bfy` `bfz` | forward basis vector | 5 dp | `web/SnapshotHotFrame.cs:1126` |
| `blx` `bly` `blz` | left/lift basis vector | 5 dp | `web/SnapshotHotFrame.cs:1127` |
| `opponent_present` | actor exists this frame | bool | `web/SnapshotHotFrame.cs:1124` |

The same block shape repeats for three wingmen (`w1` `w2` `w3`) and the Rapier gun drone (`rd1`).
Opponent weapon state is also already present: `opponent_ammo`, `opponent_rounds_fired`,
`opponent_hits`, `opponent_trigger_down`, `opponent_gun_firing`, `opponent_tracers`,
`opponent_health`, `opponent_alive`.

So the bandit's **pose** is fully observable. What is missing is its **motion, energy, and
intent** — and, critically, its **own aiming solution**.

## The actual gap

| Missing | Recoverable offline? | Why it matters |
| --- | --- | --- |
| Bandit velocity (`bvx/bvy/bvz`) | **Partly** — differentiable from `bx/by/bz` at ~15.7 Hz, but noisy and useless across the delta gaps and actor swaps | Every energy and closure question |
| Bandit speed / Mach / AoA / load factor | **No** | Is it cornering, or riding a bad energy state? |
| Bandit body rates | **No** | Can it physically track the required pursuit curve? |
| **Bandit lead solution and lead error** | **No** | *The direct answer to "why did 99 rounds miss"* |
| Bandit AI tactic / doctrine / decision state | **No** | Which branch of the fight director is running |

The player already publishes all of these about itself: `vx/vy/vz`, `mach`, `aoa_deg`,
`g_actual`, `pitch_rate_dps`, `roll_rate_dps`, `yaw_rate_dps`, `lead_x/y/z`, `lead_tof`,
`gunnery_total_lead_error_deg`. The asymmetry is the bug: we instrument the human and fly blind
on the machine.

### Priority 1 — unblocks gunnery diagnosis (build this first)

These exist to answer one question: *when the bandit pulled the trigger, where was it aiming and
where should it have aimed?*

| Field | Precision | Source (mirror of the player's own) |
| --- | --- | --- |
| `opponent_lead_valid` | bool | bandit `GunKill.HasLeadSolution` |
| `opponent_lead_x/y/z` | 3 dp | bandit `GunKill.LeadPipper` |
| `opponent_lead_tof` | 4 dp | bandit `GunKill.LeadTimeOfFlight` |
| `opponent_lead_error_deg` | 3 dp | angle between bandit boresight and its required lead vector |
| `opponent_body_error_deg` | 3 dp | angle between bandit boresight and target line-of-sight |
| `opponent_range_m` | 2 dp | bandit-to-player range at trigger time |

`opponent_lead_error_deg` versus `opponent_body_error_deg` is the whole diagnosis in two numbers.
The Build 100 funnel finding was that the Ace "shoots on the wide body gate with a wrong
ballistic lead — shooting where the target is, not where it will be." If that is still true on
Build 238, these two fields show it directly from a production sortie instead of requiring a
local reproduction that may not match what the pilot actually flew.

### Priority 2 — energy and BFM state

| Field | Precision |
| --- | --- |
| `bvx` `bvy` `bvz` | 3 dp |
| `opponent_mach` | 4 dp |
| `opponent_aoa_deg` | 3 dp |
| `opponent_g` | 3 dp |
| `opponent_alt_ft` / `opponent_radar_alt_ft` | 1 dp |

### Priority 3 — intent

| Field | Type |
| --- | --- |
| `opponent_tier` | int (already partly exposed as `tier`) |
| `opponent_tactic` | short string enum |
| `opponent_roe_hold` | bool — is the first-pass GUNS SAFE hold suppressing this shot? |

`opponent_roe_hold` is deliberately included: the Build 100 funnel showed lower tiers spending
100% of their angular eligibility while the ROE hold was still on. A production-visible flag
turns that from a lab finding into something a single sortie can confirm or refute.

## Implementation constraints

**Two writers, and they must agree.** Every field lands in both:

1. `web/SnapshotHotFrame.cs` — schema declaration block (~line 216 for the bandit pose block)
   **and** the emission call (~line 1125). Declaration order and emission order must match.
2. `web/SnapshotProjection.cs` — the JSON projection (~line 792).

**The guard already exists**, which is why this is safer than it looks:
`sim.Tests/SnapshotHotFrameTests.cs::HotFrameAgreesWithJsonAcrossBeatsAndSteps` (theory, across
beats and steps) and `::HotFrameAgreesWithJsonWhileFiring`. A field added to one writer and not
the other fails these. **Do not add a field without confirming it is covered by the firing-path
test** — the priority-1 fields are only meaningful while the trigger is down, and the
across-beats theory may not exercise that.

**Absent-actor neutrality.** `NoOpponentMissionKeepsHotAndColdSnapshotsNeutralWithoutAHiddenActor`
asserts that a mission with no opponent publishes no hidden actor. Every new field needs an
explicit `opponentPresent ? … : neutral` guard, matching the existing style.

**Schema version.** Bump `snapshot_schema_version` `1.26.0` → `1.27.0`
(`web/SnapshotProjection.cs:1427`). Additive-only, so the decoder in
`web/wwwroot/render/state/hot_snapshot.js` and the delta reader stay backward compatible with
archived 1.26.0 sessions — but the offline decode tooling must not assume the new fields exist
when reading anything recorded before this ships.

**Build stamp.** Any `web/wwwroot/**` change requires the full build-number bump ritual
(`RELEASE_BUILD` in three files, every `?v=NN` in `index.html` and ~10 JS modules, plus test
pins) or `release_identity.test.mjs` fails the gate. Stamp last, immediately before the gate run.

## Bandwidth

Measured baseline from the 2026-08-02 sortie: 6,707 state snapshots over ~428 s (**~15.7 Hz**),
63 chunks, 6,327,040 bytes gzipped ≈ **943 bytes per snapshot compressed**.

The encoding is `shallow-keyframe-delta-v1`: only changed fields ship. Bandit velocity and
attitude change every frame, so priority-2 fields pay full freight; the priority-1 lead fields
only change while an opponent is present and are mostly static otherwise.

Rough estimate, priority 1 + 2 (~14 fields, mostly always-changing):
~200 bytes/snapshot uncompressed, ~60–70 compressed → **~7% growth**, about 450 KB on a
seven-minute sortie. That is comfortably affordable. Priority 3 is negligible (enum + bool,
changes rarely, delta-encodes to near zero).

**Do not** put the priority-2 block on the hot path without checking `tele_ms_avg`/`tele_ms_max`
in the perf rows — they ran 0.07 / 0.3–0.4 ms on this sortie, so there is headroom, but the hot
frame is explicitly allocation-free by design and new per-frame work should preserve that.

## Test plan

1. Extend `HotFrameAgreesWithJsonWhileFiring` to cover the priority-1 lead fields — this is the
   test that matters most, because these fields are only live while firing.
2. Extend `NoOpponentMissionKeepsHotAndColdSnapshotsNeutralWithoutAHiddenActor` for the new
   fields' neutral values.
3. Add a `GunConversionFunnel` cross-check: the funnel's measured lead error for a tier must
   agree with `opponent_lead_error_deg` from a scripted sortie at that tier. This is the
   instrument-validation step that made the Build 100 funnel trustworthy — the funnel predicted
   the telemetry. Preserve that property.
4. `web/wwwroot/render/state/tests/hot_snapshot.test.mjs` — decoder accepts 1.27.0 and still
   accepts 1.26.0.

## What this would have answered on 2026-08-02

Concretely, for that sortie: the bandit fired 99 rounds in 87 snapshots and scored zero. With
priority 1 alone we could partition those 87 snapshots into "aimed correctly, lost the geometry"
versus "took a body-gate shot with a broken lead" — and if it is the latter, read the median
`opponent_lead_error_deg` straight off the flight rather than inferring it from a local rerun.

That is the difference between "the AI feels weak" and a number to fix.
