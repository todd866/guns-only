# 85 — Service life, maintenance, and telemetry

← [84 — Industrial network and supply chain](84-industrial-network-and-supply-chain.md) ·
→ [90 — Failure modes](90-failure-modes.md) · [95 — Cost ledger](95-cost-ledger.md) ·
[force economy](../../air-war-economy-and-force-management.md) ·
Back to [README](README.md)

> **Status:** the component-ledger architecture and the refusal of a fixed whole-aircraft
> sortie life are **closed programme doctrine**. Numerical life bands are **inactive provisional
> programme placeholders**, not usable planning quantities, predicted capability, warranty, or
> qualified limits until their reference spectra exist. No fatigue-life mechanic is implemented in
> the flight kernel yet.

## 1. Decision

Rapier is a **long-lived carrier assembled from independently life-limited components**. It is not
a fifty-sortie round.

The former fifty-sortie statement came from promoting an explicitly provisional estimate for one
exceptional hard pull—two percent of structural life—into two percent for every sortie. No load
spectrum, residual-strength model, thermal-cycle model, coupon programme, or fleet evidence made
that promotion. The resulting life and cost arithmetic was circular: two percent of the assumed
~$9M flyaway was ~$180k, and the same identity was later read backwards as evidence for the price.

This chapter supersedes that interpretation everywhere in the authoritative Rapier bible:

- a physical sortie is not a unit of damage;
- no universal percentage is deducted merely because the aircraft flew;
- mechanical, thermal, propulsion, launch/recovery, pressure, calendar, and discrete-damage
  histories remain separate;
- each serialized component retains its history when moved between aircraft;
- maintenance may inspect, repair, restrict, overhaul, replace, or condemn a component, but never
  silently resets its life;
- cost follows the components and work actually consumed, not a percentage of whole-aircraft
  flyaway; and
- **fifty severe-mission equivalents is the first Block-0 forensic teardown gate**, not a scrap
  limit.

## 2. What real precedent establishes—and does not

High-speed reusable aircraft make a fifty-flight physical limit implausible as a starting
assumption. SR-71 serial 61-7976 accumulated 942 sorties and 2,981 flying hours
([National Museum of the US Air Force](https://www.nationalmuseum.af.mil/Visit/Museum-Exhibits/Fact-Sheets/Display/Article/198054/AFmuseum/lockheed-sr-71a/));
three X-15 research aircraft completed 199 flights
([NASA](https://www.nasa.gov/aeronautics/x-15/)). Those vehicles had different structures, loads,
temperatures, missions, maintenance systems, and economics. They refute “Mach 3 means fifty
flights”; they do not predict Rapier life.

The applicable engineering pattern is a design-service goal supported by damage tolerance,
inspection, testing, and continuing usage evidence—not a universal sortie counter. FAA
[AC 25.571-1D](https://www.faa.gov/regulations_policies/advisory_circulars/index.cfm/go/document.information/documentID/865446)
describes that structure for transport aircraft, while
[MIL-STD-1530](https://quicksearch.dla.mil/qsDocDetails.aspx?ident_number=36952) establishes the
military aircraft structural-integrity pattern of usage definition, durability and
damage-tolerance testing, individual tracking, inspection, and repair. These are process
analogues, not claims that Rapier is certified under either document.

CMC makes component-specific lifing more important, not less. Creep, oxidation, coatings,
thermomechanical fatigue, impact, joints, attachments, and environmental exposure can govern
different parts. NASA's current reusable-hypersonic hot-structure work therefore proceeds through
coupon, element, subcomponent, and component tests rather than transferring a raw material
temperature into a vehicle life
([NASA reusable SiC/SiC hot structures](https://ntrs.nasa.gov/citations/20230012520)).

## 3. Terms that must not be collapsed

| Term | Meaning |
| --- | --- |
| **Physical sortie** | One launch-to-terminal mission record. It is an operating event, not a damage unit. |
| **Exposure** | Measured or reconstructed load, temperature, duration, energy, cycle, environment, or discrete event. |
| **Damage estimate** | Modelled life consumption for one component and one damage channel, with model version and uncertainty. |
| **Severe-mission equivalent (SME)** | A versioned planning normalisation used for qualification and industrial scenarios. It never replaces the underlying exposure vector. |
| **Inspection gate** | A mandatory evidence-producing action. Reaching it does not imply condemnation. |
| **Design-service objective** | A programme requirement against a specified usage spectrum. It is not a qualified life until testing closes it. |
| **Life limit** | An approved component-specific retirement boundary supported by evidence. No Rapier production limit is closed today. |

An SME is allowed only when its reference mission is published with a versioned load and thermal
spectrum. If the reference changes, old exposure records remain valid and the planning roll-up is
recomputed. “One sortie = one SME” is prohibited. Until an approved `SME-v0` publishes the
reference trajectory, mass/configuration, load and thermal spectra, launch/recovery case, channel
availability, bin definitions, and uncertainty method, every SME number below is an inactive
programme label. It may not size production, set inspection due dates, book cost, or limit dispatch.

## 4. Provisional programme objectives

This ladder records the intended order of qualification decisions so the old fifty-sortie claim
cannot return. It becomes quantitative only after `SME-v0` exists:

| Severe-mission-equivalent point | Programme use | Standing |
| ---: | --- | --- |
| **50** | Block-0 deep inspection and representative-aircraft destructive teardown; update models and intervals | inactive qualification-gate placeholder |
| **250** | Minimum economically useful production-shell requirement before extension credit | inactive threshold placeholder |
| **500** | Production structural design-service objective against the approved mixed mission spectrum | inactive objective placeholder |
| **1,000** | Extension target available only after full-scale and fleet evidence | inactive stretch placeholder |

The companion component bands below are candidate requirements for later trades. They cannot be
compared, costed, or converted to physical sorties until each named cycle/profile is defined:

| Component family | Inactive candidate band | Governing evidence required before use |
| --- | ---: | --- |
| Cold backbone, wing load path, and capsule support structure | 500-SME objective; 1,000-SME extension placeholder | approved `SME-v0`, impact/damage tolerance, joints, moisture/environment, full-scale fatigue |
| Removable inlet lip, leading-edge inserts, liners, and hot panels | 200–500 full-dash thermal cycles | local gradient/dwell, oxidation/coating loss, impact, attachment and seal tests |
| Ram-burner/nozzle hot kit | 100–300 full-hot cycles | pressure/temperature history, creep-fatigue, coating and joint inspection |
| Launch fittings, gear, hook, and arrest attachments | 500–1,000 energy-weighted cycles | measured launch impulse, sink/side load, trap energy, bolter and proof-load history |
| Turbine core and rotating parts | independent starts/cycles/hours limits | rotor-life and hot-section programme; exchange or overhaul rather than shell retirement |
| Pressure/escape capsule | independent pressure, seal, restraint, battery, initiator, calendar, and escape-system lives | pressure/leak tests, crash/escape qualification, scheduled overhaul |

The model must be capable of showing that a low-G balloon patrol avoiding the full thermal dash can
consume less of several channels than the severe reference profile; it must not assign that fraction
before the reference and damage models exist. A maximum-q pull, overtemperature, inlet upset, hard
trap, battle-damage event, or emergency landing may eventually consume more than an ordinary
allowance or trigger inspection independently of accumulated totals.

Every component-family band in the table is inactive. It may force a future test/profile definition,
but it may not size parts, spares, depot capacity, inspection intervals, dispatch, or cost until that
definition and its evidence exist.

## 5. Serialized component ledger

Authority is deliberately split:

1. `SimulationSession` owns one sortie's fixed-step exposure evidence.
2. A future campaign/maintenance service owns serialized components, installation history,
   inspections, repairs, and dispatch state across sorties.
3. A versioned engineering assessment projects damage from immutable exposure.
4. A separate versioned cost model projects money from exposure, assessment, and maintenance.
5. Browser telemetry transports records but never authors fleet truth.

The persistent unit is the component, not the current aircraft installation. The installed assembly
is frozen when the sortie begins so later maintenance cannot alter historical exposure:

```text
guns-only.installed-assembly.v1
  airframe_serial
  airframe_definition_id
  airframe_definition_revision
  manifest_revision
  installed_components[]       # canonical station-id, then serial order
    installation_id
    station_id
    component_serial
    component_definition_id
    configuration_revision
  manifest_sha256
```

At minimum the programme tracks:

1. cold structural shell and wing/carry-through set;
2. inlet lip, leading-edge, liner/panel, and aft hot-kit families;
3. turbine core and life-limited rotating parts;
4. ram-burner/nozzle module;
5. capsule, restraint, escape, life-support, battery, and initiator subassemblies;
6. launch shuttle fitting, nose/main gear, hook, and arrest attachments;
7. gun, drone cells, actuators, pumps, valves, and pressure vessels; and
8. flight computers, sensors, power electronics, and other controlled rotables.

Every ledger entry owns:

- immutable serial, part/configuration, material/process lot, and digital-birth-record references;
- manufacture, storage, installation, removal, and parent-airframe history;
- raw accumulated exposures by channel;
- discrete exceedance, impact, damage, repair, inspection, and concession events;
- the model version that produced each damage estimate;
- lower/nominal/upper damage estimates or an explicit `unknown`, never invented precision;
- current maintenance state, restrictions, next due action, and approving authority; and
- remaining approved limit where one exists, clearly separated from provisional analytical
  predictions.

Moving an engine, capsule, hot panel, computer, or hook into another shell appends an installation
event. It does not create a new component or reset any counter.

## 6. Exposure and damage channels

The fixed-step simulation should accumulate supported raw exposure first. Damage models consume that
record later and remain replaceable as evidence improves.

| Channel | Raw evidence to retain when supported | Candidate derived quantity |
| --- | --- | --- |
| Mechanical flight load | load factor and sign, dynamic pressure, Mach, mass/CG, control/configuration state, duration, and reversals | load-spectrum bins; later shell and joint damage estimate |
| Aerothermal | explicitly identified temperature proxies, ambient state, heat-up/cool-down crossings, dwell, and overtemperature | later component thermal-cycle and oxidation/creep-fatigue estimates |
| Propulsion | combustion transitions, turbine/ram regime dwell, time at power where known, inlet upset/unstart | later core and hot-kit cycle/hour/exceedance consumption |
| Launch and recovery | shuttle acceleration/force history, handoff state, sink/side load, touchdown mass/speed, hook load, arrest energy, bolter | energy/load-weighted fitting, gear, hook, and attachment consumption |
| Pressure and environment | capsule/pressure-vessel cycles, storage time, temperature/humidity/salt/dust where modelled, battery/initiator calendar | calendar/pressure/environmental due actions |
| Discrete damage | projectile/fragment impact, FOD, bird strike, debris, fire, overload, repair and NDI result | mandatory inspection, local residual-strength change, restriction or condemnation |

Peak G alone is insufficient. Two manoeuvres with the same peak but different duration, reversal,
dynamic pressure, mass, temperature, and existing damage need not consume the same life. A
provisional linear cumulative-damage rule may be useful during instrumentation development, but it
must be labelled by model version and cannot masquerade as a qualified composite/CMC fatigue law.

### Current evidence boundary

The current 120 Hz kernel can support load factor, Mach, dynamic pressure, the existing
skin/recovery/stagnation temperature proxies, propulsion-regime dwell, inlet distortion/unstart,
fuel/round/RCS consumption, catapult geometry/energy, touchdown sink/speed, and arrestment
energy/peak-line-load evidence.

The following remain `unavailable`, `partial`, or explicitly `proxy` until their physics exists:

- wing, fin, attachment, and joint stress/strain;
- local CMC gradients, bondline, coating, seal, and hot/cold-joint temperatures;
- validated rainflow, fatigue, crack-growth, creep, or residual-strength laws;
- EGT, rotor stress, true engine starts, overspeed, and hot-section creep;
- gear-strut, tire, brake, hook-attachment, and launch-fitting local loads;
- capsule pressure cycles, seal condition, restraint, battery, and initiator life;
- humidity, salt, dust, corrosion, and calendar ageing;
- localized FOD, projectile/fragment damage, and post-repair strength; and
- authoritative cross-sortie campaign persistence.

The recorder must publish missing-channel identifiers and an evidence status. It may not silently
fill an unsupported channel with zero.

## 7. Deterministic telemetry contract

The first implementation is **measure-only**: it records truth without reducing permitted G,
grounding aircraft, or charging campaign resources. Consequences arrive only after the relevant
model and tests exist.

The kernel-authored bounded sortie record contains exposure, not a life verdict:

```text
guns-only.service-life-sortie.v1
  record_sequence
  session_sortie_sequence
  ledger_sortie_id?                # required for fleet apply; absent means non-persistent test data
  mission_contract_id
  airframe_definition_id
  airframe_definition_revision
  installed_manifest_sha256
  measurement_profile_id
  simulation_model_revision
  authority_tick_hz
  start_tick
  end_tick_exclusive
  termination_reason
  evidence_status                  # complete | partial | gap
  missing_channel_ids[]
  exposure
    active_ticks
    mechanical_bins_and_extrema
    thermal_proxy_bins_cycles_and_extrema
    propulsion_regime_ticks_transitions_and_unstarts
    launch_events
    touchdown_arrestment_and_bolter_events
    consumables
    discrete_events[]
  source_event_sequence_first
  source_event_sequence_last
  record_sha256
```

Integer ticks and fixed-point SI values are used wherever practical. Bin edges, crossing
hysteresis, and channel availability live in the versioned `measurement_profile_id`, not anonymous
constants. Histogram dwell must reconcile to the relevant sampled ticks. Present combustion
transitions are not called real engine starts, and present touchdown/arrest values remain exposure
proxies rather than certified component loads.

The raw record remains airframe/configuration-level until a versioned attribution model can map
supported exposures to particular installed components. The first schema therefore contains no
per-component damage or exposure delta merely because the manifest lists component serials.

After the campaign journal accepts the sortie result, the lifecycle authority projects its record
idempotently into a hash-chained component-ledger event stream:

```text
guns-only.component-ledger-event.v1
  ledger_id
  event_sequence
  event_id
  campaign_time
  kind
  component_serial
  airframe_serial?
  installation_id?
  source_sortie_record_sha256?
  procedure_id?
  procedure_revision?
  finding_set_sha256?
  disposition?
  previous_event_sha256
  event_sha256
```

Event kinds include manufacture, install, remove, sortie exposure applied, inspection ordered and
completed, restriction applied and cleared, repair/overhaul completed, condemnation, loss, and
recovery. The component snapshot is derived from this stream rather than maintained as a second
mutable truth.

Raw exposure is authoritative and replayable. Derived damage may be recomputed under a later model;
the original result and version remain auditable. Maintenance findings may update the component's
condition estimate but do not delete its exposure or repair history.

For persistent application, the campaign journal/orchestrator validates an owner-authorized
reservation and allocates its stable `ledger_sortie_id` before `Begin`; browser wall clock, random
client IDs, and spawn sequence are prohibited. Record bytes use one canonical field order and
integer encoding before hashing. The ledger deduplicates by
`ledger_sortie_id`: the same ID plus the same `record_sha256` is a no-op, while the same ID plus a
different hash is a quarantined conflict requiring reconciliation. A record without a
`ledger_sortie_id` can be inspected and replayed but cannot consume fleet life.

The force-economy `assignment_id` and this `ledger_sortie_id` are the **same stable identity**, not
two aliases. The campaign's atomic `sortie_result_accepted` journal event is the cross-ledger
exactly-once boundary; lifecycle application is an idempotent projection keyed by that event's
sequence and record hash.

Allocation is itself a hash-chained ledger reservation. Each airframe/installed-manifest pair may
have at most one open reservation; restart and reconnect recover that reservation rather than mint
another. The campaign's canonical `sortie_result_accepted` append atomically consumes the
reservation and transitions the assignment to `accepted`; lifecycle exposure is then an
idempotent, rebuildable projection of that journal event. `Accepted` consumes the assignment's
reservation. `Abandoned` closes the assignment reservation state, but does **not** restore the
assembly to availability: another sortie cannot reserve it until a separate owner-authorized
custody, configuration, and serviceability reconciliation establishes that the assembly is present
and dispatchable. A late result for the abandoned assignment is quarantined and can never apply
exposure directly. Reuse of one source event-sequence range under another sortie ID is a
quarantined duplicate.

### Performance boundary

Life telemetry must not steal the frame time it is meant to help explain:

- accumulate fixed-size bins and extrema inside the authoritative fixed tick;
- do not allocate or serialize JSON on every render frame;
- preallocate every counter and event slot at `Begin`; no growable collection is permitted on the
  fixed-tick path;
- make each channel update O(1), with no unbounded Cartesian histogram;
- cap the initial measurement profile at 256 total bin counters, 64 discrete-event slots, and a
  32 KiB canonical encoded sortie record; overflow marks evidence `partial` and records an overflow
  count rather than allocating;
- finalize the record before every finish, destruction, recovery, restart, or restage clears state;
- retain records in a fixed-capacity sequence-addressed recorder with idempotent cursor reads and
  explicit gap reporting;
- keep the existing small session-event bus sparse rather than placing full life records on it;
- emit bounded summaries at sortie boundaries and sparse exceedance events;
- expose only the small current display state through the hot snapshot;
- drain records after authoritative advancement and around restage into a durable terminal outbox,
  not the ordinary droppable high-rate state trace;
- write persistent records off the render path; and
- make the existing frame-performance harness reject any lifecycle implementation that breaches
  the supported 60 fps budget.

## 8. Maintenance state model (post-assessment)

Serviceability, physical installation, and inspection status are independent dimensions:

```text
serviceability
  serviceable | restricted | grounded | condemned | lost

installation_state
  installed | removed | in_repair | scrapped

inspection_state
  current | due | overdue | open_finding
```

Transitions are evidence driven. An exceedance can jump directly to `grounded`; a scheduled
inspection can return a component to `serviceable`; a repair can change approved limits only when
its engineering disposition says so. `unknown` history, a configuration mismatch, corrupt ledger,
or missing required sensor is not interpreted as zero damage. Removal is not inherently a worse
serviceability state, and a restricted component may remain installed.

These transitions begin only in the assessment/campaign phases. Measure-only instrumentation emits
exposure, evidence status, and exceedance flags; it cannot change any of these states.

The aircraft's dispatch state is the most restrictive installed component state plus independent
configuration and maintenance checks. The shell may expire while its capsule, engine, avionics,
gun, gear, or hot modules remain usable. A regional depot strips, inspects, and reassigns those
rotables under their existing serial histories.

## 9. Economics and industrial planning

Booked sortie cost contains only observed consumption and completed/confirmed work:

```text
fuel + ammunition + lost stores
+ inspections and maintenance performed
+ confirmed repair, replacement, and combat loss
- confirmed salvage credit
```

It is not `flyaway × shell_damage`. Charging whole-aircraft value for a structural increment
wrongly depreciates the reusable engine, capsule, avionics, gun, gear, and other rotables at the
same rate.

Economics is a downstream projection, never a field in physics or the component ledger:

```text
guns-only.service-life-cost-projection.v1
  cost_model_id
  price_basis_id
  currency
  price_year
  source_sortie_record_sha256
  source_ledger_revision
  line_items[]
    category
    component_serial?
    amount_low
    amount_nominal
    amount_high
    epistemic
  excluded_categories[]
  total_low
  total_nominal
  total_high
  projection_sha256
```

Categories distinguish consumables, inspection, repair, replacement, combat loss, and salvage
credit. A separate optional reserve scenario may multiply component replacement value by a
versioned lower/nominal/upper damage projection, but that uncertain amount is never booked as actual
sortie cost. Infrastructure capital cost remains excluded and is amortised at the lane or programme
level. Given present uncertainty, ranges are more honest than cent precision.

The old arithmetic assigned `$9M / 50 = $180k` to every sortie and is rejected. No valid life
amortisation exists until `SME-v0`, qualified component lives, mission mix, repair yield, inspection
cost, and recovered value exist.

Annual production demand therefore comes from:

- required fleet size and readiness;
- mission mix and measured component consumption;
- combat and accident loss;
- inspection findings, repair yield, and depot turnaround;
- rotable and distribution-stock policy; and
- mobilisation/expansion requirements.

It must not be calculated as annual airframe output multiplied by an invented fixed sortie life.
The production line remains strategic because it replaces combat loss, supplies expansion,
supports destructive qualification, and feeds rotables—not because healthy aircraft are planned
scrap after fifty launches.

## 10. Player and world presentation

During measure-only instrumentation the debrief may show supported raw exposure, proxy labels,
missing-channel/gap status, and sparse exceedance flags only. After the assessment and campaign
phases exist, it may additionally show:

- mechanical load-spectrum severity;
- thermal cycles/dwell and hot-component inspection triggers;
- engine/hot-kit starts, hours, transitions, and exceedances;
- launch and recovery loads;
- newly due inspections, restrictions, repairs, and component exchanges;
- evidence confidence and unresolved inspection findings; and
- confirmed component-level maintenance cost plus any separately labelled projection band.

It must not show a precise “airframe life remaining” percentage while the underlying component
models are provisional. The pilot may know that a hard pull ordered an inspection before the depot
knows the residual strength. That uncertainty is part of the engineering and campaign decision,
not missing UI polish.

This system preserves the intended gameplay: G, heat, a hard recovery, and battle damage can be
expensive choices. It removes the false claim that ordinary flying automatically destroys two
percent of the jet. The 12 G command ceiling remains the ceiling until a residual-strength model
and failure consequences exist; this chapter does not reopen a free over-limit mode.

## 11. Implementation sequence

1. **Measure only:** fixed-size kernel accumulators, lifecycle finalization, record ring,
   capture-on/off bit-identity tests, and no flight or campaign consequence.
2. **Transport:** cursor drain, durable terminal outbox, offline decoder, replay parity, bounded
   payload and explicit gap tests.
3. **Fleet ledger:** frozen installed manifests, serialized installation events, pure deterministic
   event reducer, and persistence authority outside `SimulationSession`.
4. **Assessments:** versioned lower/nominal/upper damage estimates and inspection triggers; no
   automatic retirement from a single scalar.
5. **Campaign and economics:** dispatch, depot queues, rotables, repair/salvage, cost projection,
   and industrial-demand feedback.
6. **Physics and qualification depth:** add component-specific load, thermal, pressure, environment,
   and damage signals; replace provisional models with coupon-to-fleet evidence while preserving
   original records and versions.

The implementation must be deterministic under replay, bounded in storage and hot-path work,
schema-versioned, and testable without a renderer.

## 12. Acceptance invariants

- Authoritative Rapier documents contain no fixed fifty-sortie whole-aircraft life.
- Fifty SMEs means first Block-0 deep inspection/teardown only.
- Physical sorties and SMEs are never assumed one-to-one.
- The installed manifest is frozen and hashed at sortie begin.
- The measure-only record is configuration-level; component attribution requires a separate
  versioned model.
- Raw exposure, modelled damage, approved limit, and maintenance state remain distinct fields.
- No component changes serial or loses history during removal, repair, overhaul, or installation.
- Exposure totals never decrease; since-repair or since-overhaul views derive from event boundaries.
- Unknown or missing evidence never becomes zero damage.
- A model-version change recomputes derived estimates without rewriting raw history.
- The same stable ledger-sortie ID and hash is a no-op; the same ID with a different hash is a
  quarantined conflict.
- A ledger reservation is unique per active assembly and survives retry. Acceptance consumes it;
  abandonment closes the assignment but requires separate custody, configuration, and
  serviceability reconciliation before another reservation can open.
- Ledger events are strictly ordered and hash chained.
- Browser, renderer, replay, and debrief are never component-ledger authorities.
- Costs accrue to consumed components and work, not undifferentiated flyaway value.
- Telemetry work remains off the render-frame path and is covered by the 60 fps performance gate.
- No life model silently changes flight limits until its consequences and tests land together.

## Epistemic

The architecture and semantic corrections are **closed programme doctrine**. Every numerical life
band in §4 is an **inactive provisional placeholder**, not a planning requirement, until its
reference profile and evidence exist. The cited historical aircraft and standards are **external
analogues**. Rapier's actual allowables, spectra, life models, inspection intervals, repair limits,
and component retirement lives remain **open findings** until the qualification programme produces
evidence.
