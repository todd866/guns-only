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

**CMC hot structure** with an authored 1200 °C material-capability card
(`SkinTemperatureLimitK = 1473.15`) is the accepted **materials** freeze — stainless cannot survive
M4-class stagnation. It is not a qualified inlet/bondline/whole-aircraft operating limit. That does **not**
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
- Snapshot/HUD now separates lagged wall skin, flat-skin recovery, true stagnation `T0`, and CMC
  capability; no 650 °C limit or giant pseudo-margin is invented — see realism doc.

**Read first:** [`REALISM-AND-OVERPERFORMANCE.md`](REALISM-AND-OVERPERFORMANCE.md).

## Owner-directed geometry reopening — 2026-07-30

Two local parts of the checked-in 1.4.0 geometry are no longer design authority:

- the pilot is fully reclined in a capsule buried inside the forward centrebody, with **no cockpit
  bump, windscreen, canopy or transparency**; the raised `escapePodSpine` is superseded; and
- Rapier requires directional stability and yaw control, but the current 7.5938 m² twin-fin pair is
  an unsized visual surrogate. Fin count, area, height, cant and rudder geometry are reopened.

The 13 m length, 7.35 m span, 18 m² aerodynamic reference wing, cranked-delta planform, one ventral
inlet and one fixed nozzle remain the controlling starting constraints. Runtime geometry,
and the geometric content of the blueprint plates intentionally remain at the implementation
snapshot until capsule packaging, crew access, directional derivatives, inlet coupling, structure,
thermal, signature and failure gates can move together; status and stale fuel/control annotations
are corrected now. Start with [11 — Visual identity](11-visual-identity-and-buried-capsule.md),
[13 — Tail trade](13-directional-stability-and-tail-trade.md), and
[51 — Crew ingress](51-crew-ingress-egress-and-rescue.md).


This decision keeps **CMC** and rejects stainless. **Mach-4 dash remains fiction-labelled** until
telemetry, Identity T/W, and the map agree — see
[`REALISM-AND-OVERPERFORMANCE.md`](REALISM-AND-OVERPERFORMANCE.md).

## Owner-directed service-life correction — 2026-07-30

Rapier is a long-lived carrier assembled from independently life-limited components. A physical
sortie is not a damage unit, and the former fixed whole-aircraft fifty-sortie story is retired.
The number fifty now labels only the first Block-0 severe-mission-equivalent teardown gate. The
provisional programme ladder labels 250 severe equivalents as the minimum economically useful
production-shell threshold, 500 as the production structural objective, and 1,000 as an
evidence-led extension target. Those labels are inactive and cannot size production, dispatch, or
cost until chapter 85's `SME-v0` reference spectrum exists.

The cold shell, CMC hot shipset, turbine core, ram hot kit, capsule, gear, hook, launch fittings,
avionics, gun, actuators, pumps, and pressure equipment retain independent serialized histories.
Raw exposure, modelled damage, approved life, maintenance state, and cost remain separate. Start
with [85 — Service life, maintenance, and telemetry](85-service-life-maintenance-and-telemetry.md);
its numerical bands are provisional until the qualification programme closes them.

## Companions (not replaced by this bible)

- `docs/rapier-gun-drone-system.md` — gun-drone gameplay contract and open system boundary.
- `docs/superpowers/specs/2026-07-27-rapier-glide-drone-vertical-slice-design.md` — first physical
  drone vertical slice.
- [`11-visual-identity-and-buried-capsule.md`](11-visual-identity-and-buried-capsule.md) — controlling
  no-bump/no-transparency exterior contract and synchronized migration.
- [`13-directional-stability-and-tail-trade.md`](13-directional-stability-and-tail-trade.md) —
  exact legacy-fin audit, low-fin trade, aerodynamic/failure gates and telemetry.
- [`18-signature-and-2040-detectability-trade.md`](18-signature-and-2040-detectability-trade.md) —
  track-delay doctrine, multispectral threat hypotheses and RF/IR/EM test programme.
- [`51-crew-ingress-egress-and-rescue.md`](51-crew-ingress-egress-and-rescue.md) — flush structural
  plug, separate pressure hatch, powered couch sled, rescue and escape-envelope work.
- [`82-launch-gallery-engineering-basis.md`](82-launch-gallery-engineering-basis.md) — durable live
  launch contract plus conceptual civil works, machinery, utilities, cost, visual truth, and
  generated-plate contract.
- [`83-ground-cycle-and-facility.md`](83-ground-cycle-and-facility.md) — alert cells, transporter,
  rear handling hall, shuttle loading, turn, recovery and safety state machine.
- [`84-industrial-network-and-supply-chain.md`](84-industrial-network-and-supply-chain.md) —
  fictional production network grounded in real process analogues, workforce, rate, cost, rotables
  and strategic chokepoints.
- [`85-service-life-maintenance-and-telemetry.md`](85-service-life-maintenance-and-telemetry.md) —
  component-specific service-life doctrine, qualification objectives, maintenance state, bounded
  telemetry, and the retirement of the false fifty-sortie whole-aircraft life.
- `docs/2026-07-26-buried-launch-tube-and-the-ukraine-theatre.md` — historical buried-gallery and
  Ukraine-siting design record; its 150 m/s geometry, timing, loads, and quantities are superseded.
- `docs/2026-07-26-reclined-seat-and-ukraine-setting.md` — reclined-occupant physiology thesis
  (airframe story there is superseded; physiology thesis is not).
- ADR-0003 — Ghibli-adjacent presentation discipline (fiction stills are not runtime source of
  truth).

## Chapter index (Part I order — mission drives geometry drives materials drives propulsion drives
mass; systems follow)

| # | Chapter | Status |
| --- | --- | --- |
| [00](00-mission-and-ops.md) | Mission and flight regime | closed regime boxes; surrogate dash claim |
| [10](10-geometry.md) | Geometry | principal envelope/wing closed; capsule and tail locally reopened |
| [11](11-visual-identity-and-buried-capsule.md) | Visual identity and buried capsule | no bump/transparency closed; synchronized geometry revision open |
| [12](12-aerodynamics-and-controls.md) | Aerodynamics and control allocation | wing/control architecture; tail-derived yaw deck open |
| [13](13-directional-stability-and-tail-trade.md) | Directional stability and tail trade | exact current audit; smaller twins proposed; geometry not frozen |
| [15](15-structure-and-build.md) | Structure and build | provisional gauges; principal OML constrained; capsule/tail attachments reopened |
| [16](16-manufacturing-and-industrial-basis.md) | Manufacturing and the 2026 industrial basis | anchor lineage + 2026 basis; fiction program shape |
| [17](17-signatures-and-survivability.md) | Signatures and survivability | full-LO refusal; kinematic/dispersed doctrine |
| [18](18-signature-and-2040-detectability-trade.md) | Signature and 2040 detectability trade | signature discipline proposed; threat/performance evidence open |
| [20](20-thermal-and-materials.md) | Thermal and materials | closed CMC freeze; surrogate zones |
| [30](30-propulsion-and-inlet.md) | Propulsion and inlet | closed map constants + per-stream fuel |
| [40](40-mass-and-cg.md) | Mass and CG | closed mass statement; provisional CG travel |
| [50](50-crew-escape-fbw.md) | Crew, escape, FBW | provisional escape jettison; surrogate FBW gains |
| [51](51-crew-ingress-egress-and-rescue.md) | Crew ingress, egress, and rescue | flush plug/couch sled proposed; packaging/qualification open |
| [60](60-armament-and-drones.md) | Armament and drones | closed ownship gun; provisional drone packaging |
| [70](70-landing-gear-arrest.md) | Landing gear, arrest | closed catapult geometry; provisional strip/hook detail |
| [80](80-basing-and-ground.md) | Basing and ground | closed gallery clearance; fiction theatre siting |
| [82](82-launch-gallery-engineering-basis.md) | Launch-gallery engineering basis | closed live interface; conceptual construction/cost/presentation contract |
| [83](83-ground-cycle-and-facility.md) | Ground cycle and facility | proposed cell/transfer/shuttle/turn system; safety closure open |
| [84](84-industrial-network-and-supply-chain.md) | Industrial network and supply chain | proposed fictional network; real process analogues and open rate/cost decisions |
| [85](85-service-life-maintenance-and-telemetry.md) | Service life, maintenance, and telemetry | component-ledger doctrine closed; life bands and damage models provisional/open |
| [90](90-failure-modes.md) | Failure modes | provisional FMECA seed list |
| [95](95-cost-ledger.md) | Cost ledger | surrogate CMC premium; Phase 2 closes the table |
| [icds/propulsion-airframe](icds/propulsion-airframe.md) | Propulsion ↔ airframe ICD | provisional |
| [icds/fbw-crew](icds/fbw-crew.md) | FBW ↔ crew capsule ICD | provisional |
| [icds/gun-drone-carriage](icds/gun-drone-carriage.md) | Carrier ↔ drone cell ICD | provisional |
| [icds/basing-arrest](icds/basing-arrest.md) | Basing ↔ arrest ICD | provisional |
| [blueprints/](blueprints/README.md) | Plates **00–20** construction package | current implementation `rapier.v1.json` @ **1.4.0**; capsule/tail revision pending |
| [present/](present/index.html) | Teaching deck (MD `/present` grammar) | serve via `web/wwwroot/present/rapier-design/` |
| [airframe concept](present/rapier-airframe-concept-v4-no-gun-cue.md) | Current no-bump/low-fin visual candidate + exact prompt/provenance | reference only; gun aperture and fin geometry remain open |
| [crew-ingress concept](present/rapier-crew-ingress-concept-v1.md) | Four-stage flush-hatch/couch-sled study + exact prompt | reference only; packaging gate open |
| [ground-cycle concept](present/rapier-ground-cycle-concept-v1.md) | Alert-cell-to-shuttle storyboard + exact prompts | reference only; launcher ICD/runout open |
| [REALISM](REALISM-AND-OVERPERFORMANCE.md) | Telemetry / overperformance audit + dynamics↔sound map | **read with chapter 00**; program: [flight+sound realism design](../../superpowers/specs/2026-07-29-rapier-flight-sound-realism-design.md) |

Chapters 00–40 (§§1–5 of the design spec) are the mission-driven engineering spine and must be
readable on their own, without the JSON Airframe Definition or its schema. Principal planform,
propulsion and mass constraints remain closed; chapters 11, 13 and 18 explicitly reopen the local
capsule/tail/signature integration. Chapters 50–95 and the ICDs (§6 of the design spec) are systems
that *follow* from that spine; several are tagged proposed, provisional or open finding rather than
filled with invented precision.

**Live deck:** with the web host running, open `/present/rapier-design/` (arrow keys / Space / F).
