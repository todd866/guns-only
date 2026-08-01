# Future air-war economy and force management

Date: 2026-07-30  
Status: accepted owner direction; authoritative campaign-economy design  
Source horizon: public material available through 2026-07-30

Related:
[product north star](product-north-star.md) ·
[campaign governance](content-governance.md) ·
[systems simulation](systems-simulation.md) ·
[world research](world-backstory-research.md) ·
[Rapier industrial network](airframes/rapier/84-industrial-network-and-supply-chain.md) ·
[Rapier service life](airframes/rapier/85-service-life-maintenance-and-telemetry.md) ·
[Rapier cost ledger](airframes/rapier/95-cost-ledger.md)

## Decision

The campaign economy copies the **institutional loop** visible in Ukraine's current wartime
management system, not merely its combat-points table:

> centralize fiduciary control, contracting, airworthiness, and strategic allocation; decentralize
> product choice, configuration, urgent purchasing, field testing, and feedback; turn operational
> evidence into procurement and industrial decisions.

This is not a shop bolted onto the sortie loop. It is the persistent causal system that converts
money, authority, people, time, factories, repair capacity, transport, information, and recovered
hardware into combat-ready packages under attack.

There is no universal war currency. A unit can have money and still lack a qualified maintainer,
current crypto, a launcher slot, an engine hot kit, a safe transport route, or permission to use a
partner-funded system. A warehouse can contain twenty aircraft and produce zero legal sorties.

Combat points are one **supplemental allocation instrument**. They are not money, cost, inventory,
readiness, airworthiness, industrial capacity, or personal pilot income. Baseline fuel, food,
safety work, minimum defensive capability, and rescue are never made contingent on earning kills.

## What the current Ukrainian system actually contributes

The public model is several overlapping channels rather than one procurement mechanism:

```text
mission contract
    -> operational record
        -> effect claim and verification
            -> optional outcome-linked allocation
                -> unit selects a compatible product
                    -> central agency contracts, pays, and tracks delivery
                        -> inventory, issue, mission use, repair, and feedback
                            -> central demand, supplier rating, and next production decision

parallel inputs:
    baseline state procurement
    + direct unit allocations
    + innovation grants and trial stock
    + partner-earmarked industrial finance
    + volunteer or community gap-filling
```

The source-bounded observations below describe institutions' public accounts of their own systems.
They are not independent audits of combat effect, fraud resistance, cost, or causal impact.

### Operational evidence

Ukraine's Ministry of Defence says Mission Control within DELTA records unmanned-system plans and
missions, produces dashboards within minutes, and makes structured information available from
battalion level through the General Staff and Ministry. The useful design lesson is a shared,
versioned operational evidence stream—not a claim that every record is complete or correct.

Source:
[Mission Control across corps and force groupings, 26 March 2026](https://mod.gov.ua/en/news/two-months-since-the-launch-of-mission-control-within-the-delta-ecosystem-the-system-is-now-operational-across-all-corps-and-force-groupings).

### Outcome-linked allocation

The updated ePoints programme awards points under its programme rules and lets units redeem them
through Brave1 Market, with state payment and delivery through DOT-Chain Defence. By June 2026 the
official programme included reconnaissance, logistics, and evacuation missions as well as
destructive effects. Separate Ministry reporting describes destructive strikes as video-confirmed;
the public material does not establish one verification method for every non-strike category.
That widening matters: a system rewarding only easy-to-film kills misprices the work that makes
those kills possible.

Sources:
[Brave1 Market combat-points workflow, 24 June 2026](https://mod.gov.ua/en/news/over-500-000-drones-ordered-by-the-military-through-brave1-market-using-combat-points) ·
[reported video confirmation for destructive strikes, 26 January 2026](https://mod.gov.ua/en/news/army-of-drones-bonus-program-delivers-results-nearly-820-000-russian-targets-hit-in-2025-says-mykhailo-fedorov).

### Decentralized choice, centralized execution

DOT-Chain Defence lets combat units choose among available products using allocated budgets while
the procurement authority handles contracts, payment, and logistics. The reported nine-day
average in May 2026 applies to the marketplace flow and available goods; it is not a valid lead
time for an engine, aircraft, launch gallery, new factory, or unbuilt preorder.

Source:
[DOT-Chain Defence operating model, 26 May 2026](https://mod.gov.ua/en/news/nearly-half-a-million-ua-vs-and-other-equipment-delivered-to-the-military-through-dot-chain-defence).

### Several procurement lanes

The Defence Procurement Agency has publicly distinguished direct contracts for unique systems,
competitive framework agreements for common performance classes, and a marketplace in which units
choose. From January 2026, Ukraine placed overall military purchasing under one procurement agency
while retaining policy and oversight in the Ministry. The pattern is central accountability with
multiple routes to supply—not a free market and not monolithic central issue.

Sources:
[unmanned-systems procurement lanes, 29 May 2025](https://mod.gov.ua/en/news/the-ministry-of-defence-s-defence-procurement-agency-dpa-introduces-a-new-procurement-model-for-unmanned-systems) ·
[procurement consolidation, 1 January 2026](https://mod.gov.ua/en/news/denys-shmyhal-from-january-1-all-military-procurement-is-centralized-under-the-mo-d-defence-procurement-agency).

### Direct unit authority

Combat formations also receive discretionary allocations rather than relying only on centrally
chosen supply. A public August 2025 decision used a per-frontline-battalion funding formula.
The number is historical context, not a 2040 balance parameter. The transferable idea is a
predictable, needs-based local envelope that lets a formation close urgent gaps.

Source:
[direct brigade allocation, 12 August 2025](https://mod.gov.ua/en/news/headquarters-decision-each-brigade-will-receive-uah-7-million-per-combat-battalion).

### Community and foundation sidecar

Brave1 Market's public description also permits local authorities, charitable foundations, and
volunteers to buy listed products. The useful design lesson is an auditable gap-filling channel
that can discover needs and move quickly, while formally transferring custody and configuration
records. It cannot be treated as dependable baseline sustainment or an excuse for central supply
failure.

Source:
[Brave1 Market overview](https://market.brave1.gov.ua/pro-marketpleis/).

### Evidence-driven scale and protected experimentation

In March 2026 the Ministry announced central drone demand based on technical requirements rather
than brands and ratings drawn from several operational and procurement systems. Its declared
budget split sent 80 percent to proven products and reserved 20 percent for new systems and combat
testing. We copy the separation between exploitation and exploration, not the numerical ratio as
a universal law.

Source:
[frontline-data procurement model, 10 March 2026](https://mod.gov.ua/en/news/ministry-of-defence-changes-approach-to-drone-procurement-demand-will-be-generated-automatically-based-on-frontline-data).

### Innovation, codification, and manufacturer responsibility

Brave1 publicly describes an ecosystem linking developers, military users, investors, grants,
codification, combat testing, and implementation. Ukraine also separated technical codification
from the existence of a current state procurement line in 2026. The transferable lesson is that
technical eligibility, a validated need, a buying decision, and production readiness are separate
gates.

Sources:
[Brave1 institutional scope](https://brave1.gov.ua/en/about) ·
[Brave1 manufacturer pathway](https://brave1.gov.ua/en/manufacturers) ·
[codification reform, 2 March 2026](https://mod.gov.ua/en/news/ministry-of-defence-streamlines-weapons-codification-and-accelerates-the-supply-of-new-developments-to-the-military).

### Logistics and industrial finance

Ukraine's public Digital Logistics Management System joins stock, movement, procurement, and
financial accounting across strategic and unit levels. Supplier working capital can also be a
bottleneck: the procurement agency introduced performance-conditioned advances for marketplace
manufacturers. Partners separately finance Ukrainian production through mechanisms including the
Danish model and direct purchases. These are different ledgers and may carry different conditions.

Sources:
[Digital Logistics Management System, 5 January 2026](https://mod.gov.ua/en/news/the-military-officially-launches-the-digital-logistics-management-system) ·
[manufacturer advances, 28 April 2026](https://mod.gov.ua/en/news/more-drones-for-the-front-dot-chain-defence-introduces-an-advance-payment-mechanism-to-accelerate-deliveries-to-the-armed-forces-of-ukraine) ·
[foreign industrial finance in 2025, 3 January 2026](https://mod.gov.ua/en/news/the-ministry-of-defence-secured-over-6-billion-for-ukraine-s-defense-industry-in-2025).

### What must not be copied literally

- Public programme-owner statistics are not independent effectiveness studies.
- A delivery interval for stocked small drones does not transfer to complex aircraft.
- Rapid delegated certification for attritable systems does not transfer to capsules, primary
  structure, propulsion, flight controls, or launch machinery.
- A product's observed result is confounded by crew skill, mission, weather, threat, software,
  sector, support, and sample size.
- More catalogue variety creates training, spare, firmware, crypto, test, and configuration debt.
- A verified-effects programme can produce Goodhart effects, selective reporting, target farming,
  and rich-get-richer unit allocation unless baseline supply and counterweights remain explicit.
- Central visibility can become an operational-security liability. Procurement and logistics tools
  must minimize location and force-structure data and compartment last-mile delivery.
- Neither Ukraine nor this design makes people, casualties, or medical care fungible efficiency
  tokens.

## Fictional 2040 institutional topology

Names remain open; responsibilities do not.

| Institution | Owns | Does not own |
| --- | --- | --- |
| Campaign journal/orchestrator | stable identities, reservation and assignment transitions, validation of signed owner decisions, canonical append order, projection cursors | mission priority, budget policy, technical disposition, claim judgment, resource allocation |
| Theatre command | defended effects, mission priority, minimum readiness, scarce-asset policy, baseline allocation | individual product selection, physical sortie truth |
| Run director | derived run-state view, viable mission offers, route and story sequencing | canonical stock, readiness, funding, or evidence ledgers |
| Procurement authority | supplier qualification, tenders, contracts, payment, acceptance, audit, delivery oversight | tactical target claims, airworthiness exceptions |
| Type and airworthiness authority | approved configurations, flight limits, maintenance procedures, concessions, grounding | budgets, mission scoring, political rewards |
| Innovation authority | problem statements, grants, trials, evidence thresholds, transition into catalogue | guaranteed production orders, operational command |
| Rate-policy authority | ex-ante eligibility, contribution rules, caps, category weights, policy revisions | verifying individual claims, posting its own rewards after launch |
| Partner cell | earmarked money and stock, origin/use/data/geography caveats, release approval | rewriting domestic priorities or sortie outcomes |
| Logistics authority | custody, stock, transport, warehousing, last-mile issue, loss and salvage | product effectiveness claims |
| Depot and industrial network | production lots, repair, overhaul, quality escape, workforce and capacity | unit mission selection |
| Unit or detachment | local need, compatible product choice, sortie configuration, repair/recovery priority, field feedback | national contracts, type certification, unlimited expenditure |
| Mission-control cell | operational record intake, evidence provenance, gaps, access control | deciding its own claim, procurement, physical inventory |
| Independent verification cell | corroboration, confidence, claim disposition, dispute record | rate policy, purchasing, allocation posting |
| Allocation accountant and audit/appeal | posts authorized envelopes; reconciles corrections; audits separation of duties; decides appeals through declared procedure | inventing evidence, changing a frozen mission rate |

The campaign journal is a nondiscretionary transaction boundary, not a super-ministry. It accepts
decisions only from the institution that owns them. No unit may define a rate, submit a claim,
verify it, post its own allocation, and decide its appeal. The player sees and influences the
responsibilities of the role currently inhabited; other institutions continue making bounded
decisions in the world.

## The seven ledgers

The economy uses typed ledgers joined by references. No scalar may stand in for all seven.

### 1. Funding and obligation

Records:

- state baseline appropriation;
- direct unit discretionary allocation;
- supplemental verified-effect allocation;
- partner-earmarked money;
- innovation and trial funding;
- donor or community gap-filling;
- contract obligation, advance, milestone, acceptance, payment, refund, and expiry;
- currency, price year, amount range, and accounting basis.

Every envelope declares who may spend it, eligible categories, geographic and origin restrictions,
data obligations, expiry, approval threshold, and whether funds are cash, reimbursement, credit,
or in-kind stock. Two equal nominal amounts are not automatically interchangeable.

### 2. Physical stock and custody

Records:

- serialized aircraft, propulsion modules, hot shipsets, capsules, guns, sensor racks, and launch
  hardware;
- lot-tracked ammunition, fuel, gas, coatings, filters, batteries, electronics, and raw material;
- configuration, location class, custodian, reservation, transit, quarantine, issue, return,
  recovery, cannibalization, salvage, write-off, and loss;
- software, model, crypto, data-rights, and mission-legality baselines.

Inventory means an object exists. It does not mean that it is serviceable, reachable, compatible,
current, or legal for the mission.

### 3. Airworthiness and work

Records:

- installed manifests and immutable sortie exposures;
- inspections, findings, restrictions, concessions, repair, overhaul, and condemnation;
- work-order skill, tool, part, facility, procedure, and evidence requirements;
- work begun, waiting, complete, rejected, reworked, or returned to service.

The controlling Rapier component model is
[85 — Service life, maintenance, and telemetry](airframes/rapier/85-service-life-maintenance-and-telemetry.md).
The economy consumes its facts; it never invents a flat percentage of aircraft life.

### 4. Production and repair capacity

Records:

- line, cell, furnace, rig, depot, inspection, launcher, recovery, test, and transport slots;
- throughput range, changeover, yield, queue, outage, power, workforce, tooling, and material
  dependencies;
- supplier working capital, advance, backlog, delivery history, and quality escapes.

Capacity is a dated reservation, not a factory-health bar. Money can finance an expansion, but
people, buildings, tools, permits, grids, material, and qualification make it real only over time.

### 5. People and qualification

Records:

- role and qualification scope;
- currency, recency, duty time, fatigue, training, supervision, and availability;
- team dependencies and scarce specialist skills;
- injury, evacuation, reassignment, leave, and loss as human states—not purchasable items.

People constrain the system and retain agency. The game may value time, training, and exposure but
never prices a person as an interchangeable consumable.

### 6. Operational evidence and trust

Records:

- frozen mission contract and protected effect;
- sortie result and sensor provenance;
- effect claim, corroboration, confidence, dispute, verification, and appeal;
- product revision, mission profile, environment, sample size, observed failure, and field review;
- missing channels, offline evidence, possible deception, and analyst backlog.

Unknown is not zero. A broken link does not automatically erase a legitimate mission or create a
free claim.

### 7. Time, access, and command authority

Records:

- campaign time, requested-by and needed-by dates, lead-time range, queue age, and shelf life;
- transport routes, border and airspace access, convoy or escort need, disruption, and last-mile
  risk;
- tasking, delegation, approval, release, weapons authority, partner caveat, and emergency power.

This ledger explains why a technically ready object may still be unavailable and who can change
that condition.

## A combat-ready package

The useful unit is not an airframe or a wallet balance. It is a time-bounded package:

```text
ready_packages(at_time, mission) =
    maximum feasible matching and schedule over:
        compatible, airworthy, unreserved aircraft and installed components
        qualified and rested crews
        launch, recovery, rescue, maintenance, and transport time windows
        sufficient fuel, ammunition, gas, and mission stores
        mutually compatible software, models, keys, data, and interfaces
        legal authority, partner release, and mission-specific configuration
```

The minimum of raw counts is only an upper bound. Two aircraft, two crews, and two launcher slots
can still yield zero packages if their qualifications, configurations, keys, or time windows do not
match. The UI may summarize the solved result, but it must preserve the binding cause. “7 ready” is
insufficient; the player needs “7 now; 3 await keys; 2 await hot-kit inspection; 1 lacks a recovery
slot.” Matching runs deterministically over a bounded candidate set only when campaign state or the
requested mission changes; it is not a render-frame or fixed-tick task.

## Conversion loop

Every material change follows an inspectable chain:

```text
need case
    -> authorization and funding envelope
        -> compatible offer or approved source
            -> reservation and order
                -> contract / issue / work order
                    -> production, repair, or stock movement
                        -> acceptance and custody transfer
                            -> configuration and dispatch
                                -> mission
                                    -> reconciliation, inspection, and effect claim
                                        -> verification and field feedback
                                            -> next allocation and demand signal
```

An order never teleports stock. A payment never repairs a component. A kill claim never manufactures
a drone. Each arrow consumes time, capacity, authority, and evidence owned by the relevant ledger.

## Procurement and sustainment lanes

The same system cannot sensibly buy a battery and a launch gallery on one clock.

| Lane | 2040 use | Decision owner | Proposed gameplay horizon |
| --- | --- | --- | ---: |
| Local issue or exchange | stocked rounds, filters, batteries, keys, line-replaceable modules | unit logistics | same shift–24 h |
| Unit marketplace, in stock | attritable drones, EW modules, sensors, ordinary spares | unit chooses; procurement authority executes | 2–10 days |
| Supplier preorder | a revised batch, scarce module, configured drone, specialist store | unit or central allocation | 2–6 weeks |
| Framework competition | common capability class with several qualified suppliers | procurement authority | weeks–months |
| Direct strategic contract | unique aircraft, engine, capsule, gallery machinery, depot plant | central authority | 2–24 months |
| Innovation trial | prototype, limited lot, instrumented field trial | innovation authority + host unit | days–months |
| Partner channel | imported subsystem, foreign repair, licensed or jointly funded production | partner cell + domestic authority | uncertain 1–18 months |
| Field repair | inspect, patch, exchange a line-replaceable module | local maintenance | hours–2 days |
| Regional depot | shell assessment, engine/hot-kit/capsule exchange, major NDI | depot authority | days–weeks |
| Deep depot or original manufacturer | furnace work, rotor overhaul, major structural or software requalification | industrial network | weeks–months |
| Capacity investment | new line, shadow plant, grid, workforce, tooling, strategic stock | government + partners | months–years |

These are fictional gameplay bands. They are not forecasts of Ukrainian or allied performance.
Every actual item carries its own low/nominal/high lead-time estimate and epistemic label.

## Campaign clock and cadence

Campaign time is an explicit deterministic simulation clock. Queue progress never depends on the
number of debrief screens opened, repeated sandbox sorties, or an unannounced wall-clock jump.

- A campaign assignment reserves a scheduled preparation, launch, mission, recovery, and
  reconciliation window.
- Flying it advances campaign time by those recorded intervals. Immediate “fly again” practice is
  a separate sandbox action and consumes no campaign stock or time.
- After reconciliation, the director advances to the next player-owned decision event: a mission
  window, work completion, delivery range, verification decision, disruption, or command deadline.
- The player may advance deliberately to a later event, but the same interval advances enemy
  action, consumption, fatigue recovery, repairs, production, transport, weather, and opportunity
  expiry. Waiting is therefore a decision, not a free skip.
- The player may instead take another available profession action—maintenance, logistics,
  engineering, training, negotiation, observation, or command—whose own duration and conflicts are
  explicit.
- Offline wall-clock time does not mutate an authoritative single-player campaign by default. A
  hosted persistent world may adopt real-time advancement only as a declared server policy shared
  by all participants.
- Lead times use ranges and event thresholds. The exact completion time is revealed only when the
  responsible process would know it.

## Demand, products, and industrial learning

### Capability before brand

A need case describes the effect and constraints:

- target or mission class;
- range, environment, endurance, payload, accuracy, and latency;
- acceptable emissions and signatures;
- interface, software, crypto, and transport constraints;
- operator, maintainer, and training burden;
- expected quantity and required date;
- evidence needed for acceptance.

Offers may then compete against that statement. A popular brand cannot silently redefine the need.

### Proven capacity and exploration capacity

Every recurring allocation reserves:

- a **baseline share** for reliable systems with enough evidence;
- a **trial share** for new revisions and prototypes;
- an **adaptation reserve** for an unforecast urgent threat.

The exact split is scenario policy, not a universal 80/20 constant. Honest prototype failure is paid
from the trial pool and does not bankrupt the host unit. Successful trials still require
manufacturing, integration, training, and acceptance before scale.

### Product evidence is conditional

Supplier ratings must be grouped by:

- exact product and software revision;
- mission and target class;
- crew experience;
- environment, threat, jamming, and support;
- sample size and confidence interval;
- failure mode and whether the article was recovered;
- data completeness and possible survivorship bias.

A single global five-star score is prohibited. Manufacturers receive actionable, anonymized
failure evidence without receiving unit locations or operational plans.

### Working capital and capacity

The economy distinguishes demand from the supplier's ability to finance production. Advance
payments can accelerate a proven line while increasing non-delivery exposure. Long-term contracts
can justify tooling and workforce. Grants buy learning, not guaranteed procurement. Partner money
can use idle domestic capacity but may carry origin, reporting, data-rights, or export constraints.

## Verification and outcome-linked allocation

### Assignment before reward

Every mission freezes:

- `assignment_id`;
- protected effect and acceptable evidence;
- rate-card and policy revision;
- participating units, ex-ante eligibility, minimum causal contribution, and attribution rules;
- ROE, abort, recovery, and safety conditions;
- maximum supplemental allocation;
- no-action, no-threat, deterrence-only, and failed-opportunity dispositions;
- offline and disputed-evidence path.

The system rewards the assigned effect, not the most countable event that happened nearby.

Examples of effects:

- defended node remained operational through a raid window;
- hostile relay or carrier ceased contributing to the enemy system;
- reconnaissance answer arrived before the decision deadline;
- corridor remained open;
- damaged aircraft, capsule, or specialist component was recovered;
- evacuation or resupply reached the receiving party;
- prototype trial produced an accepted evidence package.

Human casualty counts are not a player-facing currency.

If a defended node remains operational because no relevant threat arrives, the assignment closes
`null-threat` or `no-action`: stock and work reconcile, but no performance bonus is implied. If
deterrence or presence is itself the assigned effect, its contribution and evidence rule must have
been frozen before launch. A unit cannot retrospectively redefine ordinary survival as a rewarded
effect.

### Claim states

```text
draft -> submitted -> corroborating -> confirmed
                            \-> probable
                            \-> disputed -> appealed -> resolved
                            \-> unobserved
                            \-> ineligible
                            \-> null-threat / no-action
```

Verification is delayed work performed by people and systems. Pending, probable, and disputed are
real states. Manual or offline evidence is allowed. A later correction appends a new event; it does
not mutate history invisibly. The submitting unit cannot verify or post its own claim; rate-policy,
verification, allocation, audit, and appeal authorities remain separated.

### Supplemental means supplemental

Verified-effect allocation:

- expands local choice within allowed equipment categories;
- is capped by policy and the assigned mission;
- cannot be sold, transferred as cash, or used for personal progression;
- cannot buy a Rapier, launch gallery, safety waiver, human labour, or strategic industrial slot;
- never replaces baseline supply or emergency defence allocation;
- cannot starve a formation whose defensive assignment produces few visible claims.

The current thin `PointsLedger` is therefore a political presentation prototype. Its kill/fuel/loss
balance is not campaign truth and must eventually migrate into this typed policy channel.

### Current runtime reality

No authoritative campaign economy is implemented yet.

- `sim/PointsLedger.cs` calculates a fictional sortie slip; it does not know the persistent
  balance, funding, stock, maintenance, or dispatch state.
- `web/wwwroot/app.js` stores the prototype balance in browser-local profile state and suppresses
  repeat presentation with a mission/outcome/net tuple rather than a stable assignment identity.
  That key can collapse two physically distinct identical sorties and is not a persistence
  contract.
- `web/SnapshotProjection.cs` emits the slip fields for finished missions generally, while
  `app.js` gates persistence—but not all presentation—on Rapier identity. The fiction can therefore
  leak into other debriefs.
- Current copy such as “Verified splash,” “Allocation posted,” and “grounded” claims more authority
  than exists: there is no effect-verification service, allocation posting authority, or dispatch
  reducer behind it.
- `campaign_progression.js` deliberately leaves every mission available, and the current
  “grounded” message still allows immediate restage. That is correct for sandbox availability but
  proves the label is not dispatch authority.
- Phase 0 must quarantine the slip to its intended Rapier fiction, remove copy that falsely claims
  verification/allocation/dispatch, and add executable cross-mission and identical-sortie tests.
  The new economy then begins beside it with stable assignments and shadow records. It must not
  grow authoritative stock, cost, repair, or procurement state inside browser local storage and
  must not attempt to migrate the existing point balance into money.

## Player experience

The player is not asked to become a national purchasing ministry between every flight.

### Before a sortie: allocation brief

Show:

- the protected effect and why this mission exists;
- available packages and the binding constraint on each;
- one optional requisition or configuration choice;
- one repair, recovery, or reserve priority;
- material caveats, including partner restrictions and uncertainty;
- what will be consumed, reserved, merely exposed, and returned if recovered.

### During a sortie

No economy reducer runs in the render or physics hot path. The simulation records bounded physical
and operational evidence. Prices, rewards, queues, and campaign mutation cannot alter aerodynamics,
weapons, AI truth, or frame time.

### Immediate debrief: reconciliation

Show facts now known:

- fuel, ammunition, gas, and stores consumed;
- aircraft, drones, components, and people returned, missing, damaged, or recovered;
- inspections and work orders opened;
- inventory reservations released or consumed;
- effect claims submitted and evidence gaps;
- no speculative replacement-value charge presented as actual cost.

### Later debrief: verification

Show:

- confirmed, probable, disputed, or unobserved effects;
- supplemental allocation posted, if any;
- product feedback accepted;
- any correction to readiness or cost from inspection;
- the policy revision that produced the result.

### Readiness turn

Offer two or three decisions with real opportunity cost:

- repair one aircraft first or exchange a scarce hot kit;
- consume local interceptor stock now or reserve it;
- host a prototype trial or use proven equipment;
- expedite a transport at exposure cost;
- disperse tonight and lose maintenance time, or remain and accept strike risk.

Central supply, factories, partners, and other units continue acting. The player does not manually
place every purchase order or schedule every worker unless playing that profession.

### Campaign board

The normal board shows:

- the three current binding bottlenecks;
- packages ready now and after the next known transitions;
- incoming allocations and deliveries with ranges, not false exact times;
- verification, repair, production, and transport queues;
- one disruption and its causal path;
- one decision that can materially change the next period.

Every blocked item answers:

> What is missing? Who owns the next action? What is the earliest credible completion? How
> uncertain is it? Which missions become possible or impossible?

## Roles and progression

The same economy supports several deep professions:

| Role | Meaningful decisions |
| --- | --- |
| Pilot or operator | configuration, abort/recovery judgment, evidence quality, honest deficiency report |
| Flight or detachment lead | package selection, local allocation, repair priority, trial hosting, reserve policy |
| Maintainer or engineer | diagnosis, procedure, substitution, concession request, configuration control, release evidence |
| Logistician | stock posture, transport, custody, distribution, salvage, dispersed support |
| Product team | problem statement, design revision, test plan, defect response, production readiness |
| Procurement officer | lane selection, supplier risk, contract terms, acceptance, audit, working-capital decision |
| Commander | priorities, readiness floor, scarce-asset allocation, partner negotiation, industrial resilience |

Progress comes from demonstrated competence, trustworthy contribution, and delegated access. There
is no XP wallet that lets a pilot buy structural strength or skip an airworthiness finding.

The unrestricted current mission picker remains **sandbox mode**. Campaign scarcity cannot remove
the player's ability to practise a purchased or authored aircraft outside the persistent run.

## Worked scenario: Rapier against the Ceiling

### Situation

Sixteen stratospheric carrier balloons approach the projected release corridor for Gallery G-12.
Most are sensors, relays, decoys, or magazines whose exact roles remain uncertain. Local
interceptors can cover some predicted release footprints; strategic missiles can cover others but
are scarce. One Rapier launch and recovery slot is available before the gallery must close.

### Allocation brief

- Rapier 04 is airworthy in its installed configuration.
- Pilot, capsule, launcher, recovery, rescue, keys, fuel, rounds, and weather minima align for one
  package.
- Its engine and hot shipset have margin; the sortie will record exposure rather than deducting a
  fixed life fraction.
- The player may reserve cheap local interceptors for the next raid or commit them now.
- The protected effect is **G-12 remains able to launch through the night window**. The contract is
  not “farm sixteen balloons.”
- Supplemental eligibility requires corroborated Rapier contribution to reducing the predicted
  carrier/relay effect below the declared threshold. A null threat or an already-safe gallery
  closes without performance allocation.

### Sortie

Rapier breaks the useful part of the formation, destroying eleven carriers and damaging two so
that they fail to contribute. Three terminal threats enter the local defensive layer. The aircraft
returns and traps.

### Immediate reconciliation

- actual fuel and rounds leave physical stock;
- returned aircraft and installed components return to custody;
- launcher, thermal, mechanical, propulsion, and arrestment evidence enters the component ledger;
- inspections are ordered only where the approved model or an exceedance requires them;
- one local-interceptor package was consumed and the rest preserved;
- effect claims enter verification; nine carrier outcomes correlate immediately and four remain
  incomplete or contested.

### Economic result

- G-12 remained operational: the assigned effect is fulfilled.
- Rapier enters only the work required by its physical evidence and maintenance policy.
- Verified-effect allocation posts later as a capped supplemental equipment envelope, not eleven
  bounties.
- Supplier analytics receive anonymized ammunition, sensor, and reliability observations.
- Theatre command learns when Rapier is economical against this profile: the relevant comparison
  includes launch/recovery opportunity, inspection, local interceptor conservation, and the next
  threat—not only dollars per balloon.
- A later inspection, repair, or loss may create actual cost. Replacement value multiplied by a
  guessed damage fraction does not.

## Failure modes the economy must make playable

| Failure | Visible symptom | Player response |
| --- | --- | --- |
| Goodharted effect credits | units optimize countable claims while protection or reconnaissance degrades | change contract/rate policy; restore baseline allocation; audit displaced work |
| Product-rating confounding | one product appears superior because elite crews used it in easy sectors | normalize cohorts; run controlled trials; show uncertainty |
| Catalogue fragmentation | many revisions work individually but spares, keys, training, and software diverge | consolidate interfaces; fund retrofit; retire revisions deliberately |
| Working-capital starvation | demand exists but supplier cannot finance the next batch | advance against evidence; accept default exposure; qualify another source |
| Quality escape | fast supplier delivers a bad lot | quarantine lot; trace custody; activate alternate source; investigate evidence |
| Verification backlog | units wait for supplemental allocation and lose trust | add analysts/automation; accept bounded provisional states; prioritize high-consequence claims |
| Central visibility compromise | one database reveals units, routes, or deliveries | compartment, minimize, degrade gracefully, separate last-mile identity |
| Donor caveat conflict | useful stock cannot legally serve the highest-priority mission | renegotiate, swap eligible domestic stock, alter tasking, expose the opportunity cost |
| Repair bottleneck | many owned aircraft but few releaseable packages | move rotables/people/tools; choose work order; recover components; expand depot capacity |
| Power or transport attack | production complete but inaccessible | reroute, disperse, escort, repair grid, use regional reserve |
| Innovation lockout | evidence model only buys incumbents | protect trial share; specify capability not brand; fund negative results |
| Rich-get-richer allocation | successful units compound equipment advantage while exhausted defenders starve | cap bonus share; allocate baseline by threat/need; normalize for assignment and opportunity |

The economy should let institutions fail competently, not manufacture arbitrary scarcity. A broken
process has a cause, owner, evidence trail, and possible intervention.

## Campaign authority and deterministic contracts

The economy lives outside `SimulationSession`.

```text
ledger owners issue signed decisions
    -> campaign journal/orchestrator validates authority and appends assignment_reserved
        -> SimulationSession produces immutable SortieResult
            -> one atomic append:
                sortie_result_accepted
                + assignment state transition
                + reservation consumed/released facts
                    -> independently replayable, idempotent projections:
                        physical reconciliation
                        lifecycle assessment
                        maintenance proposals and work state
                        financial cost
                        effect verification
                        supplemental allocation
                        supplier and command analytics
```

The canonical append—not a chain of materialized views—is the exactly-once boundary. Each
projection stores its last accepted journal sequence and model revision, can resume after a crash,
and can rebuild from the journal. A crash after inventory projection but before cost projection
therefore neither re-consumes stock nor suppresses unfinished work. Later inspection, verification,
repair, payment, or appeal decisions append their own owner-authorized events.

Assignment lifecycle:

```text
draft -> reserved -> launched -> result_pending -> accepted
draft or reserved -> cancelled
reserved -> expired
launched or result_pending -> abandoned
```

Cancellation or expiry is allowed only before launch and releases the exact reservation by an
owner-authorized journal event. After launch, a missing result becomes an explicit abandoned or
incident-reconciliation event; assets, people, and exposure remain unknown or quarantined rather
than silently returning to stock. Abandonment closes the assignment, but does not restore assembly
availability: a separate owner-authorized custody, configuration, and serviceability reconciliation
must establish that the assembly is present and dispatchable before it can be reserved again.
`accepted` means the canonical result event exists, not that every materialized projection has
caught up.

Submission handling is orthogonal to assignment state:

```text
submission_disposition =
    new
    | duplicate_same_hash
    | conflicting_hash_quarantined
    | late_after_abandonment
```

A same-ID/same-hash retry is a no-op. Before acceptance, a same-ID/different-hash submission leaves
the assignment in `result_pending` while the conflicting records are quarantined for
reconciliation. After acceptance, a same-ID/different-hash submission appends a conflict-case
record, but the accepted canonical result stays accepted and is never displaced. A late result for
an abandoned identity is quarantined for reconciliation rather than applied.

Minimum record families:

```text
guns-only.sortie-assignment.v1
guns-only.sortie-result.v1
guns-only.effect-claim.v1
guns-only.force-ledger-event.v1
guns-only.funding-envelope.v1
guns-only.procurement-order.v1
guns-only.custody-transfer.v1
guns-only.maintenance-work-order.v1
guns-only.capacity-reservation.v1
guns-only.product-observation.v1
```

### Required invariants

- The campaign reserves a stable `assignment_id` before launch.
- `assignment_id` is the same stable value as Rapier lifecycle `ledger_sortie_id`, not a second
  alias that can drift.
- The immutable result references that assignment and its installed-manifest hash.
- Atomically appending the same result identity and canonical hash twice is a no-op.
- The same identity with different content receives `conflicting_hash_quarantined`; an accepted
  canonical result stays accepted.
- Every ledger event records policy/model revision, source event or document, actor/authority,
  campaign time, and previous hash or revision.
- Reservations are explicit; one item or capacity slot cannot satisfy two simultaneous assignments.
- Stock, money, airworthiness, work, capacity, evidence, and authority mutate only from canonical
  events authorized by their owners. Materialized projections never become a second truth.
- Unknown, missing, disputed, or gapped evidence never becomes zero.
- Corrections append events and compensating entries; released records are not silently rewritten.
- Browser local storage, presentation state, lossy telemetry, tactical scores, and debrief copy
  never author campaign truth.
- Mission score, verified effect, financial cost, lifecycle exposure, and political allocation
  remain separate projections.
- A policy cannot change the reward or evidence requirement for a sortie after its assignment was
  frozen.
- Offline play can produce signed **provisional evidence**, not authoritative physical or economic
  state. On reconnect the authority validates the frozen contract and content hashes, checks
  deterministic replay where supported, and either appends one accepted event or retains the
  result in a private/untrusted branch. A device signature proves provenance, not truth.
- Campaign mutation and persistence remain off the render and fixed-step hot paths.

## Route generation and humane failure

Scarcity changes the problem; it does not create a hidden unwinnable menu.

- Every generated campaign state retains at least one launchable, repair, logistics, observation,
  training, negotiation, or recovery action.
- Ordinary failure consumes visible time, stock, readiness, confidence, or capacity. It does not
  arbitrarily delete a strategic asset.
- Catastrophic loss is explicit and recoverable components remain worth retrieving.
- Minimum defensive supply, medical care, rescue, food, and required safety work do not depend on
  effect points.
- A formation with few claim opportunities receives baseline allocation by mission, threat, and
  need.
- Safe abort, ROE compliance, civilian protection, rescue, and honest prototype failure do not
  become financially irrational.
- Campaign collapse, when possible, is a declared terminal outcome with causal warning—not a
  balance crossing a hidden scalar threshold.

## Metrics are instruments, not the objective

No single optimization metric governs the economy. The command view may inspect:

- ready packages now and at future decision times;
- percentage of nominal inventory legal and compatible for assigned missions;
- time from validated need to fielded revision;
- median and tail delivery, repair, and verification time;
- stock cover by critical component and mission;
- production yield, quality escape, no-fault-found, and rework;
- component recovery and repair yield;
- mission effects achieved per scarce effector, launch slot, and specialist hour;
- prototype learning rate and transition rate;
- supplier concentration and single-point vulnerabilities;
- workforce fatigue, exposure, qualification depth, and lost training time;
- number of blocked missions with a named cause, owner, and recovery path.

Metrics disclose policy and uncertainty. They never silently turn into rewards or automatic demand
without a versioned rule and review.

## Doctrine lint versus executable proof

`tools/content/test/economy-doctrine-lint.test.mjs` protects the written authority boundaries and
prevents the old points or arcade currencies from being promoted silently. It is not an
implementation test and does not prove that the present runtime has stable identities,
compatibility matching, an atomic journal, idempotent projections, or correct persistence.

Each delivery phase must add executable negative and recovery tests before its feature can gate
play. Phase 0 owns cross-mission points leakage and identical-sortie presentation. Later phases own
assignment cancellation/expiry, partial-projection crash recovery, compatibility matching,
offline provisional evidence, verification separation of duties, and campaign-time advancement.
The acceptance list below is a future runtime contract until those tests and services exist.

## Delivery sequence

### Phase 0 — quarantine the old points prototype

- limit its entire presentation to the intended Rapier fiction;
- replace unsupported “verified,” “allocation,” and “grounded” claims with presentation-only copy;
- add runtime tests for non-Rapier leakage and two identical consecutive sorties;
- preserve sandbox availability and never migrate its browser balance into campaign money.

### Phase 1 — shadow economy

- freeze assignment identities and mission contracts;
- record physical consumption, returned/lost assets, component exposure, and effect claims;
- display immediate versus pending facts;
- implement no campaign gating;
- compare records with debrief and telemetry for completeness.

### Phase 2 — physical readiness

- serialized custody and reservations;
- work orders, inspection, repair, recovery, and rotable exchange;
- people, facility, launcher, recovery, and transport capacity;
- deterministic route guarantee;
- unrestricted sandbox remains available.

### Phase 3 — dual allocation

- baseline need/threat allocation;
- supplemental verified-effect envelopes;
- frozen policy/rate revisions, verification states, caps, and appeals;
- retire the current universal points balance as clearance authority.

### Phase 4 — curated marketplace

- a small compatible catalogue with stock, price, configuration, evidence, and lead-time range;
- central execution and explicit last-mile custody;
- no broad catalogue until training, software, spares, and revision debt are modeled.

### Phase 5 — industrial feedback

- supplier lots and revisions;
- working capital, preorders, frameworks, trial share, production and depot queues;
- quality escapes, substitution, partner earmarks, and capacity disruption.

### Phase 6 — coupled persistent world

- playable logistics, maintenance, engineering, procurement, command, negotiation, and production
  professions;
- factories, grids, transport, communities, medicine, training, and combat share people and
  consequences;
- player-authored capability enters through the same need, test, evidence, supply, and authority
  loop as built-in content.

## Acceptance gates

The system is not ready to gate a campaign until:

1. two identical consecutive sorties receive distinct stable assignment identities;
2. reload, reconnect, replay, and debrief cannot double-apply a result;
3. a crash between any two projections resumes from the canonical accepted-result journal without
   double consumption or lost downstream work;
4. cancellation, expiry, abandonment, conflict, and late-result handling preserve reservations and
   unknown state honestly;
5. a missing telemetry channel remains unknown rather than free stock or zero wear;
6. the same aircraft can be physically present but blocked independently by airworthiness,
   configuration, crew, launcher, recovery, authority, or transport;
7. compatibility-aware matching can return zero even when every raw resource count is nonzero;
8. money cannot instantly create stock or capacity;
9. effect points cannot buy baseline safety, fuel, a Rapier, or airworthiness approval;
10. no-action and null-threat missions cannot farm effect allocation;
11. a safe abort and an honest failed prototype trial do not create a punishment exploit;
12. supplier comparisons retain revision, mission, environment, sample, and uncertainty;
13. every readiness delta names its source, owner, duration/range, and missions affected;
14. every state retains at least one meaningful action and sandbox practice remains available;
15. the campaign reducer runs outside the fixed-step/render hot paths and preserves the 60 fps
    contract; and
16. a worked balloon-defence campaign demonstrates actual stocks, opportunity cost, repair,
    verification delay, and industrial feedback without a kill-to-cash shortcut.

## Epistemic summary

| Claim | Status |
| --- | --- |
| Ukraine publicly operates linked operational-record, outcome-credit, marketplace, procurement, innovation, logistics, and industrial-finance channels | sourced current institutional description |
| Those channels' published performance statistics prove causal combat superiority or eliminate corruption | not established |
| Central fiduciary control plus delegated unit choice is the design inspiration | accepted product doctrine |
| The fictional 2040 institutions, ledgers, interfaces, timings, and Rapier applications | fiction / proposed simulation design |
| Combat points are the whole economy or a valid personal pilot currency | rejected |
| One scalar can represent money, readiness, stock, industry, evidence, and authority | rejected |
| Browser local storage or lossy telemetry may own persistent force state | rejected |
| Current thin points presentation is already an authoritative campaign economy | false; migration scaffold only |
