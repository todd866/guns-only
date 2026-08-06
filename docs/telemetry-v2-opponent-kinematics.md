# Telemetry v2 — closing the opponent-diagnosis gap

Status: **partly shipped.** Written 2026-08-02 against Build 238
(`e4c4c3fbc19705548619bb1829b148c4de521a37`). Revised 2026-08-06 against Build 264 (`2694ac7`),
which is when the **per-contact gunnery block below actually shipped**, taking hot
`LayoutVersion` 22 → 23. Priority 1 (the bandit's own lead solution),
priority 2 (bandit kinematics) and priority 3 (intent) remain SPECIFICATION ONLY.

## Shipped 2026-08-06 — per-contact gunnery and scope honesty

The Build 264 owner flight (session `web-1785933989000-15627`, 15,731 rows) proved the original
premise of this document incomplete in a way that mattered more than the missing kinematics: the
opponent weapon fields it lists as "already present" **are not one scope**. In engagement 3 the
`opponent_rounds_fired` counter froze at 7 while four more tracer bursts (18 rounds airborne) flew
with the wingman alive. Every historical "the bandit fired zero rounds" reading was a statement
about the LEAD ONLY, because there were no wingman gunnery fields at all.

### Scope table — every opponent weapon field, before and after

| Field | Scope BEFORE | Scope AFTER | Note |
| --- | --- | --- | --- |
| `opponent_ammo` | primary ship's current gun | unchanged | documented at the source |
| `opponent_rounds_fired` | primary ship's current gun | unchanged | resets at engagement boundary |
| `opponent_trigger_down` | primary ship | unchanged | |
| `opponent_gun_firing` | primary ship | unchanged | |
| `opponent_hits` | SESSION-wide (`PlayerHitsTaken`) | unchanged | rounds the player took from anyone |
| `opponent_tracers` | FORMATION-wide | unchanged | folds retired + relief-targeting guns |
| `w1_/w2_/w3_ammo` | — | per contact | **new** |
| `w1_/w2_/w3_rounds_fired` | — | per contact | **new** |
| `w1_/w2_/w3_hits` | — | per contact | **new** — rounds THIS ship put into the player |
| `w1_/w2_/w3_trigger_down` | — | per contact | **new**, 1/0 like `w1_alive` |
| `w1_/w2_/w3_gun_firing` | — | per contact | **new**, 1/0 |
| `formation_gun_firing` | — | FORMATION-wide | **new** — is ANY enemy ship shooting now |
| `sortie_opponent_rounds_fired` | — | FORMATION-wide, SORTIE-cumulative | **new**, monotone |
| `sortie_rounds_fired` / `sortie_hits` | — | player, SORTIE-cumulative | **new**, monotone |
| `sortie_peak_g` / `sortie_min_g` | — | player, SORTIE-wide | **new**, always live |
| `service_life_capture_active` | — | Rapier recorder state | **new** |

No existing field was renamed or repurposed: archived sessions and every shipped decoder keep
working unchanged. What changed is that the honest question now has an honest field.

**`snapshot_schema_version` stays `1.26.0`, and the original plan to bump it was wrong.** That
string is a CONTENT-PACK COMPATIBILITY HANDSHAKE, not a wire-shape stamp: `app.js`'s
`activatePack` refuses any pack whose `compatibility.snapshotSchemaVersion` differs from the
projected value and falls back to procedural presentation with only a `console.warn`. Bumping it
therefore requires a coordinated edit of `content/packs/*/pack.json` AND its `web/wwwroot` mirror,
and a returning browser holding a cached `pack.json` would lose its presentation pack until the
cache turned over. This change is purely additive, so the wire-shape signals are
`SnapshotHotFrame.LayoutVersion` (a single monotone integer, bumped by one on any slot-set change:
22 → 23) and ordinary feature detection of the new keys in archived JSON rows.

**Naming and encoding follow the existing per-contact convention.** The three fixed additional
aircraft slots `w1`/`w2`/`w3` already carried `{p}_present`, `{p}x/y/z`, `{p}fx/fy/fz`,
`{p}lx/ly/lz`, `{p}_alive` in both writers; the gunnery fields extend that same block with the
same `{prefix}_` naming and the same raw-integer 1/0 flag encoding, so adding a fourth contact is
one more entry in the `foreach (string prefix in ...)` loop in both writers. The primary opponent
is contact slot 0 and keeps the `opponent_*` names it has always had.

### Reset semantics, made discoverable

`rounds_fired`, `hits` and `opponent_rounds_fired` are properties of the CURRENT engagement's
weapon graph. Continuous combat stages a fresh `GunKill` for each successor aircraft, so all three
reset to zero at every engagement boundary. This is correct behaviour, and it means a session-wide
`max()` over the tape understates the sortie. Two things now make that discoverable:

1. `sortie_rounds_fired`, `sortie_hits` and `sortie_opponent_rounds_fired` are monotone ledgers
   over the whole sortie, banked per gun identity so a retired or replaced weapon keeps the rounds
   it already put in the air.
2. `tools/telemetry/report.py` prefers those ledgers and, for tapes recorded before they existed,
   reconstructs the total across resets instead of taking a `max()`.

### Two instruments that were dead, and why

**`service_life_max_g` read 0 against an 11.91 G sortie.** Not a plumbing fault. Every
`service_life_*` field is read off `RapierServiceLife.LatestRecord`, and (a) capture only ever
BEGINS when `RapierMissionAvailable` — that is, on a scripted-intercept (Rapier) mission — and
(b) a record only exists once such a sortie has been FINALIZED. On an ordinary fighter beat the
recorder is never started, so the whole block is a zero default no matter how hard the jet was
flown. `service_life_capture_active` now makes that legible instead of silent, and
`sortie_peak_g`/`sortie_min_g` give the airframe-agnostic, always-live load-factor envelope that
the question actually wanted.

**`formation_coordination_stale` alarmed on every normal cycle** (true in 8% of Build 264 rows on
a ~1.2 s period). It was publishing `EnemyPairCoordinator.SharedContactStale`, whose threshold is
`EvaluationIntervalTicks` — the BEHAVIOURAL fallback bound, the point past which each pilot flies
on its own senses. But a healthy coordinator samples every `EvaluationIntervalTicks` and then
spends `MessageDelayTicks` in the radio path, so the picture age sawtooths to a full
`DeliveryPeriodTicks` (222 ticks, ~1.23 s at 180 Hz) every cycle and crosses that bound by
construction. Telemetry now publishes `SharedContactHealthStale`, thresholded at
`SharedContactHealthStaleAfterTicks = 2 * DeliveryPeriodTicks` (~2.47 s): two full delivery
periods with no fresh picture, which can only mean a delivery was genuinely missed. The
behavioural threshold is untouched — changing it would have changed how the bandits fly.
`SimulationSession.FormationCoordinationBehaviourFallback` exposes the behavioural window
separately for diagnosis.

### Tests pinning the above

- `SnapshotHotFrameTests.WingmanGunneryIsAttributedPerShipWhileTheLeadHoldsFire` — the wingman
  fires and the lead does not; `w1_rounds_fired` is 1 while `opponent_rounds_fired` stays 0.
- `SnapshotHotFrameTests.SortieLedgersBankFormationFireThatTheLeadCounterNeverSees`
- `SnapshotHotFrameTests.LoadFactorEnvelopeIsLiveWhereTheServiceLifeRecordIsRapierScoped`
- `FormationCoordinationTests.HealthStalenessIgnoresTheNormalSawtoothAndFiresOnAMissedDelivery`
- `FormationCoordinationSessionTests.ProductionTickCadenceCyclesTheBehaviourWindowWithoutRaisingTheHealthFlag`
- plus every existing hot/JSON parity test, which covers the new fields automatically.

---

## Original specification (priorities 1–3 still unbuilt)

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

**Schema version.** Superseded — see "`snapshot_schema_version` stays `1.26.0`" above. Bump the
hot `LayoutVersion` (a single monotone integer, currently 23) instead, and touch
`snapshot_schema_version` only as part of a coordinated content-pack release. Additive-only, so the decoder in
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
