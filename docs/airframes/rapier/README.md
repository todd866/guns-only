# Rapier — systems-engineering bible

**Airframe id:** `rapier.public-data-surrogate.v1`

## Epistemic banner

Every number in this bible is tagged, either inline or by the table it sits in:

| Tag | Meaning |
| --- | --- |
| **closed** | Frozen — grounded in a repo constant (`sim/FlightModel.cs`, `sim/Propulsion/TurboRamjetPerformanceMap.cs`, `sim/Doctrine/Beats.cs`, or the mesh in `scene_builders.js`). Do not silently redesign. |
| **surrogate** | A deliberate, physically-reasoned stand-in for real-world OEM data. Not a real aircraft's numbers; this project's own numbers, chosen for coherence. |
| **provisional** | Directionally right, mass/volume/geometry not yet closed. Safe to reference in fiction; do not treat as an engineering commitment. |
| **fiction** | Doctrine, briefing colour, or narrative framing. Never a physics or cost input. |
| **open finding** | A known first-principles gap the sim does not yet model correctly. Named so it cannot be papered over. |

This bible is authoritative for **why** the aircraft is the shape, weight, and material it is. It is
readable without opening the JSON schema, the Airframe Definition, or any renderer code — those
exist to *capture* the decisions recorded here, not to make them. See
`docs/airframes/README.md` for how the capture kit (JSON → blueprints → mesh) relates to this bible.

Source of the numbers below: `docs/superpowers/specs/2026-07-27-rapier-airframe-se-and-jet-kit-design.md`
(Part I, §§1–6). That design document is the design record; this bible is the durable reference
derived from it. If the two ever disagree, the design document's latest revision wins and this
bible should be updated to match.

## The freeze (read this before anything else)

**CMC hot structure** qualified to ~1200 °C sustained (`SkinTemperatureLimitK = 1473.15`) is the
accepted **materials** freeze — stainless cannot survive M4-class stagnation. That does **not**
make a sustained air-breathing Mach-4 dash closed engineering:

- **Mach-4 dash** is **provisional / aspirational fiction** until propulsion is retuned against
  telemetry. Intercept OFT energy-ladder peaks ~**M3.69**; map comments and open findings still
  describe ~M2.9 as the honest cycle story. See
  [`REALISM-AND-OVERPERFORMANCE.md`](REALISM-AND-OVERPERFORMANCE.md).
- Stagnation at Mach 4 is ~910 K (~637 °C). Stainless loses strength by ~600 °C — so
  **stainless + Mach 4 is incoherent** and remains **superseded** as an airframe story
  (`docs/2026-07-26-open-work-and-findings.md` and older setting prose).
- Engine `DesignMach = 2.6` is a **cycle normaliser only**, not a dash claim — see
  [`30-propulsion-and-inlet.md`](30-propulsion-and-inlet.md).
- Wet T/W at design gross is now **≤ 1.20** (84 kN · 1.55 / 11090 kg) — family Identity matched.
  Design gross includes the four-drone bay; see realism audit for remaining fiction (M4 dash).
- Skin HUD previously published instantaneous recovery (dive fake-cooled the gauge); kernel now
  lags structural skin — see realism doc.

**Read first:** [`REALISM-AND-OVERPERFORMANCE.md`](REALISM-AND-OVERPERFORMANCE.md).


This decision keeps **CMC** and rejects stainless. **Mach-4 dash remains fiction-labelled** until
telemetry, Identity T/W, and the map agree — see
[`REALISM-AND-OVERPERFORMANCE.md`](REALISM-AND-OVERPERFORMANCE.md).

## Companions (not replaced by this bible)

- `docs/rapier-gun-drone-system.md` — gun-drone gameplay contract and open system boundary.
- `docs/superpowers/specs/2026-07-27-rapier-glide-drone-vertical-slice-design.md` — first physical
  drone vertical slice.
- `docs/2026-07-26-buried-launch-tube-and-the-ukraine-theatre.md` — buried catapult/gallery
  geometry and Ukraine theatre siting (airframe story there is superseded; basing geometry is not).
- `docs/2026-07-26-reclined-seat-and-ukraine-setting.md` — reclined-occupant physiology thesis
  (airframe story there is superseded; physiology thesis is not).
- ADR-0003 — Ghibli-adjacent presentation discipline (fiction stills are not runtime source of
  truth).

## Chapter index (Part I order — mission drives geometry drives materials drives propulsion drives
mass; systems follow)

| # | Chapter | Status |
| --- | --- | --- |
| [00](00-mission-and-ops.md) | Mission and flight regime | closed regime boxes; surrogate dash claim |
| [10](10-geometry.md) | Geometry | closed envelope |
| [15](15-structure-and-build.md) | Structure and build | provisional gauges; OML closed |
| [20](20-thermal-and-materials.md) | Thermal and materials | closed CMC freeze; surrogate zones |
| [30](30-propulsion-and-inlet.md) | Propulsion and inlet | closed map constants + per-stream fuel |
| [40](40-mass-and-cg.md) | Mass and CG | closed mass statement; provisional CG travel |
| [50](50-crew-escape-fbw.md) | Crew, escape, FBW | provisional escape jettison; surrogate FBW gains |
| [60](60-armament-and-drones.md) | Armament and drones | closed ownship gun; provisional drone packaging |
| [70](70-landing-gear-arrest.md) | Landing gear, arrest | closed catapult geometry; provisional strip/hook detail |
| [80](80-basing-and-ground.md) | Basing and ground | closed gallery clearance; fiction theatre siting |
| [90](90-failure-modes.md) | Failure modes | provisional FMECA seed list |
| [95](95-cost-ledger.md) | Cost ledger | surrogate CMC premium; Phase 2 closes the table |
| [icds/propulsion-airframe](icds/propulsion-airframe.md) | Propulsion ↔ airframe ICD | provisional |
| [icds/fbw-crew](icds/fbw-crew.md) | FBW ↔ crew capsule ICD | provisional |
| [icds/gun-drone-carriage](icds/gun-drone-carriage.md) | Carrier ↔ drone cell ICD | provisional |
| [icds/basing-arrest](icds/basing-arrest.md) | Basing ↔ arrest ICD | provisional |
| [blueprints/](blueprints/README.md) | Plates **00–20** construction package | `rapier.v1.json` @ **1.2.0** |
| [present/](present/index.html) | Teaching deck (MD `/present` grammar) | serve via `web/wwwroot/present/rapier-design/` |
| [REALISM](REALISM-AND-OVERPERFORMANCE.md) | Telemetry / overperformance audit | **read with chapter 00** |

Chapters 00–40 (§§1–5 of the design spec) are the closed engineering spine and must be readable on
their own, without the JSON Airframe Definition or its schema. Chapters 50–95 and the ICDs (§6 of
the design spec) are systems that *follow* from that spine; several are explicitly stubbed and
tagged provisional or open finding rather than filled with invented precision.

**Live deck:** with the web host running, open `/present/rapier-design/` (arrow keys / Space / F).

