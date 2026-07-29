# Rapier flight + sound realism program (design)

Status: Approved for documentation · 2026-07-29 · Approach 1 (expand living audit)

**Spine:** one epistemic map for dynamics and ear cues → sequenced passes →
implementation plans only after Pass 0 inventory lands.

Companions (not replaced):

- `docs/airframes/rapier/REALISM-AND-OVERPERFORMANCE.md` — living dynamics↔sound map
- `docs/airframes/rapier/` SE bible — why the aircraft is shaped and powered
- `docs/superpowers/specs/2026-07-28-better-sound-design.md` — presentation audio bus
- `docs/2026-07-28-rapier-flight-test-reconstruction.md` — measured energy-ladder evidence
- `docs/airframes/rapier/12-aerodynamics-and-controls.md`, `30-propulsion-and-inlet.md`

---

## Goal

Freeze a **single ordered realism program** for the Rapier public-data surrogate where flight
dynamics and sound share the same physical truth — before any thrust, inertia, or sample-bed
retune. The deliverable of this design is the pass order, shared-threshold contract, and the
living audit structure. Code changes belong to later implementation plans, one pass at a time.

## Non-goals

- Retuning propulsion, polar, inertias, or sample beds inside this design document.
- CFD, wind-tunnel, or OEM decks.
- Bending the flight model to make audio interesting (hard rule from the better-sound design).
- Replacing the SE bible or the audio bus architecture.
- Full CL/CD/Cm tables, licensed jet libraries, or cinematic polar lies.

## Approach

**Expand the living audit** (`REALISM-AND-OVERPERFORMANCE.md`) into a dynamics↔sound epistemic
map. This design freezes pass order and the shared-threshold contract; bible chapters stay the
“why”; the better-sound spec stays the bus architecture and cites the audit for regime truth.

Rejected alternatives: a standalone second bible (sync drift), or per-regime mini-specs before
one map exists (wrong granularity for an audit-first ask).

---

## Living map structure

Each regime / gap row in the living audit carries:

| Column | Purpose |
| --- | --- |
| **Regime** | Flight box (FL560 shelf, M2.0–2.8 bucket, dash, FL700 capture, coast/exo, dive/q, …) |
| **Physics truth** | What the kernel actually does (params / map / `RapierAerodynamics`) |
| **Ear cue** | Present / missing / **drifted** (hard-coded ≠ map) |
| **Evidence** | Telemetry OFT, reconstruction, public theory, fiction accept |
| **Tag** | closed / surrogate / provisional / fiction / open finding |
| **Pass** | Which implementation wave owns the close |
| **Shared fields** | Snapshot keys HUD and audio must both consume |

Fiction accepts are first-class: a row may close as **accepted fiction** with an explicit tag,
not a silent engine buff.

---

## Shared threshold contract

| Quantity | Owner | Consumers (must not invent copies) |
| --- | --- | --- |
| Ram light / full / turbine fade / spill | `TurboRamjetPerformanceMap` | Briefing formatter, HUD banners, mission director, `engine_audio` handover knots |
| Normal-law α / control effectiveness / inlet recovery onset | `RapierAerodynamics` | FCS, HUD limit cues, authority/buffet audio |
| Dash claim (fiction vs measured) | Living audit + Identity/OFT | Briefing prose, mission cue Mach, audio “high dash” character |
| Thrust split | Snapshot `rapier_turbine_thrust_kn` / `rapier_ramjet_thrust_kn` | HUD + audio mix |
| q / density / RCS authority | Existing snapshot fields | Rush, coast silence, RCS ticks |

**Contract:** presentation may stylize levels and filters; it may not invent a second Mach
schedule. Prefer kernel-published constants over parallel JS literals. Tests reject hard-coded
numeric transition claims that disagree with the map (same rule as the 28 July reconstruction
narrative-configuration finding).

Audible QA follows workspace audio ownership: prefer `?audioQa=silent`; register
`audio-doctor` before intentional audible previews.

---

## Pass sequence

Passes are sequential. Do not start Pass N+1 until Pass N exit is met or explicitly waived as
accepted fiction.

| Pass | Name | Dynamics | Sound | Exit |
| ---: | --- | --- | --- | --- |
| **0** | Coherence — **exited** (see living audit Pass 0 checklist) | Inventory drift (briefing, map, audio knots, Identity) | Flag every hard-coded Mach/regime duplicate | Single drift checklist in the living audit; no physics retune |
| **1** | Honest dash story — **exited** | `MeasuredDashMach=3.55`; M4 fiction only | Briefing/HUD consume `rapier_design_dash_mach` | Briefing, HUD, OFT agree on measured dash |
| **2** | Handling calibration — **exited** | Mass/q normal-law floor; inertias ×11090/7850 | Authority cues still soft (no fake G roar) | FL720 ≥1 g under ordinary law; inertias match mass |
| **3** | Failure / envelope — **exited** | Sticky unstart seed; `rapier_over_q` placard | Distinct unstart/over-q ear still thin (hot HUD deferred) | Unit/integration proves trip + recovery + flags |
| **4** | Tables / polish — **deferred** | No residual evidenced wrong-feel after 1–3 | Reentry rush optional | Schedule only if feel gate reopens |

### Pass exits (measurement)

| Pass | Dynamics exit | Sound exit | Evidence |
| ---: | --- | --- | --- |
| **0** | Drift inventory committed; each row tagged own / fix / accept | Same inventory covers audio knots | Doc + grep/CI drift tests where cheap |
| **1** | Dash story explicit: fiction-labelled M4 **or** retuned peak toward ~M3.5–3.7 with OFT gate | Handover band = map; thrust-kn owns mix; no M4 ear-sell if fiction-shelved | OFT energy ladder + ear checklist (preview WAV or silent `audioQa`) |
| **2** | Ordinary law can hold authored FL720 at mission mass; inertias derived from design gross | Authority/bind audible before buffet-only; no fake G roar | Unit + OFT; optional reconstruction compare |
| **3** | One taught inlet or V-q failure path with recovery/consequence | Distinct one-shot/bed for that failure | OFT scenario + ear gate |
| **4** | Only if 1–3 leave residual wrong-feel with evidence | Reentry character + leftover Phase-2 polish | Comparison flight vs Build 172 / post-fix baseline |

---

## Evidence base (frozen for sequencing)

| Layer | Status | Anchor |
| --- | --- | --- |
| Geometry | closed | 13 m × 7.35 m × 18 m² S; named body-overlap residual |
| Public theory | surrogate | NACA RM L52H14, NACA TR 970, NASA TP-2771, MIL-E-5008B, stag/recovery heating |
| Flight telemetry | measured | Build 172 reconstruction — peak **M3.69**; energy ladder coherent |
| OFT / Identity | measured | T/W ≤ 1.20, drone mass, per-stream fuel, Mach-scheduled lift |
| OEM / tunnel / CFD | none | Explicitly not claimed |

Known strong systems (do not reopen without new evidence): TBCC overlap shape, density-gated
inlet, thin-air G honesty at FL720/M3.5, q-scaled moments + RCS residual, thrust-stream audio
ownership, separated thermal channels.

---

## Document ownership

| Doc | Owns |
| --- | --- |
| This design | Pass order, shared-threshold contract, non-goals |
| `REALISM-AND-OVERPERFORMANCE.md` | Living regime/gap rows, drift inventory, pass assignments |
| SE bible | First-principles why |
| Better-sound design | Bus, layers, feel-gate process; regime Mach cites map/audit |
| Implementation plans | One plan per pass after that pass’s inventory/exit criteria are clear |

---

## Next step after this design

1. Expand the living audit with the regime map + Pass 0 drift checklist skeleton (same change set
   as this design, or immediately after).
2. User reviews the written spec + audit skeleton.
3. Invoke writing-plans for **Pass 0 only** (coherence inventory + drift tests) — not Passes 1–4
   until Pass 0 exits.
