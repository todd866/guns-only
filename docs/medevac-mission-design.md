# Medevac mission system: command, pods, and contested extraction

Date: 2026-07-28

Status: parked design exploration; not the current first-slice contract

Setting: late 2030s, synthetic Ukraine theatre

> **Parked 2026-07-28:** The
> [CASEVAC pickup/drop-off design](superpowers/specs/2026-07-28-casevac-pickup-dropoff-design.md)
> supersedes this document's player role, information boundary, and first-playable-slice scope.
> This broader command/clinical concept and its prototype are preserved as research; they are not
> approved implementation scope.

## The one-sentence truth

The player commands a small, heavily automated air-ambulance team: arrive as a prepared casualty pod
becomes ready, decide how much danger and delay each patient can bear, and move no farther into the
war than the rescue actually requires.

This is a humane logistics game under pressure, not a flying-doctor fantasy and not a procedure
trainer. The aircraft, medical crew, autonomous pod network, weather, receivers, and threat picture
all provide evidence. The player remains the mission commander and makes the consequential call.

## Authority and crew

- The player is the front-seat **mission commander**, a paramedic with flight training.
- Flight automation handles routine vehicle control. Automation reduces motor workload; it does not
  select the patient, route, exposure, relay plan, or receiving facility.
- A rear paramedic works directly with the patients. They assess, treat, report trends, recommend a
  course, and use crew-resource-management language to challenge a dangerous decision.
- The commander has final authority. A serious CRM challenge must be heard and explicitly
  acknowledged before an override, but the rear crew member does not become a hidden second player
  or silently veto the commander's decision.
- The experience is not organized around a strict pilot/doctor split. It is a small team of
  warfighting paramedics using a highly automated flying machine.

The useful player question is therefore not “which treatment button do I press?” It is “given what
my crew can actually observe, where do I commit this scarce aircraft and these two pod positions
next?”

## Explored operating concept (parked)

The imperative contract language below is retained to document the exploration and prototype. Its
“must” statements are non-operative unless a later accepted design explicitly revives them.

### Autonomous pod logistics and timed rendezvous

Standardized patient pods are logistics assets, not permanent aircraft furniture. Empty pods travel
autonomously to pickup sites ahead of the crew. People at the site package and load the casualty,
connect the pod systems, and report readiness. The air ambulance aims to arrive as the pod becomes
ready, then couples and departs without carrying spare pods outbound or waiting in the danger area.

The mission model must represent:

- pod location, readiness, preparation confidence, custody, compatibility, and faults;
- the ground team's preparation estimate and subsequent updates;
- vehicle ETA as a range affected by route, weather, threat, and approach conditions;
- early arrival, late preparation, missed rendezvous, diversion, and cancellation;
- coupling, acceptance checks, transfer, and handoff as timed state transitions; and
- exactly one authoritative location and custodian for every patient and pod.

“Arrive exactly when ready” is an optimization target, not scripted coincidence. A good plan
minimizes both untreated delay and aircraft exposure; imperfect information should sometimes make
the best plan arrive early or late.

### Staged extraction

The normal contested-area pattern is:

1. Stage the larger crewed air ambulance—the **big bus**—at the nearest acceptably safe hide or
   landing area.
2. Operate a small, expendable extraction drone over the last dangerous leg.
3. Bring the loaded pod back to the staged aircraft or another declared safe transfer point.
4. Continue in the big bus toward definitive care or a deliberate transport relay.

The extraction drone's control ladder is part of the decision model:

1. **Fibre control:** the preferred low-emission link, with finite length, payout, snag, break, and
   route constraints.
2. **Onboard autonomy:** the immediate fallback after link loss. It follows bounded mission intent
   with its own sensor uncertainty and vehicle limits; it is not omniscient.
3. **RF control:** a deliberate high-risk fallback whose power, duration, propagation, latency, and
   detectable signature are explicit.
4. **Ejected reel/repeater:** a consumable short-range RF option that may improve local link geometry
   while creating a recoverability, location, and signature cost.

Fibre is resistant to radio-frequency jamming while intact; it is not magic, weightless, or
physically invulnerable. RF exposure changes a probabilistic, observer-dependent threat picture. It
must not be implemented as a theatrical “transmit for N seconds, spawn enemies” timer.

If the staged system cannot meet the clinical clock or the small drone cannot recover the pod, the
commander may take the big bus directly to the casualty. That is an exceptional, legible risk
decision: stay as quiet as possible, accept a larger exposed asset, and leave as soon as the pod is
secure. No route is guaranteed safe.

### Two pods and onward movement

The crewed aircraft carries at most two loaded patient pods. Once the first is aboard, every new
call creates a real command problem: collect the second pod, deliver the current patient now, divert
to a better receiver, or use a safe relay.

A patient who needs capabilities available at the destination should normally travel directly
there when the delay and route risk are acceptable. A stable, lower-complexity patient may instead
be transferred—without unnecessary repackaging—to lower-threat rear-area patient transport at a
safe node, returning the scarce warfighting crew to the field. A relay is not automatically inferior;
its transfer time, monitoring continuity, receiving capacity, and risk of information loss are
part of the comparison.

Patient and pod state must survive every transfer. Handoff is a custody change with an ordered
record, not a heal event or a deleted entity.

### Facilities are capabilities, not labels

“Hospital,” “Role 1,” or “Role 2” is presentation shorthand, never sufficient routing truth. Each
receiver advertises time-bounded capabilities and constraints such as resuscitation, blood,
surgery, thoracic care, imaging, active rewarming, monitored holding, landing access, transport
acceptance, and current capacity.

The rear paramedic compares observed patient needs with the latest receiver advertisement. If the
commander selects a receiver missing an observed requirement, the crew states the gap and names a
supported alternative when known. The commander may acknowledge and override because route threat,
weather, time, or information confidence can still make the imperfect receiver the least-bad
choice.

### Terminology note

This draft incorrectly treated **DUSTOFF** as a mission classification that toggles with threat
state. Do not implement that rule. A future design must research and source any use of the term;
immediate threat belongs in its own observer-safe evidence field rather than changing the mission
name.

The fiction assumes protected medical markings no longer provide dependable operational safety in
this theatre. The simulation must not treat a red cross, transponder, paint scheme, or declared
medical status as a threat-immunity buff. This is fictional worldbuilding, not approval of attacks
on protected people or services and not a claim about the law of armed conflict.

## Observer-safe medicine

The medical model must keep three layers separate:

1. **Patient truth:** injuries, physiology, interventions, complications, and deterioration known
   only to the authoritative kernel.
2. **Available evidence:** what the site report, pod sensors, rear-crew examination, equipment, and
   elapsed time can reveal, including missing data, lag, noise, ambiguity, and device failure.
3. **Crew belief and command:** the rear paramedic's assessment and recommendation, and the
   commander's decision made from that evidence.

Presentation and scoring may consume only the latter two layers. They must not infer hidden injury
identity from scenario index, expose a future examination finding, substitute a precise invented
vital sign for a coarse field report, or route by a capability need that nobody has yet observed.
A later assessment can revise an earlier belief without rewriting the evidence that was available
when the earlier decision was made.

The player learns through concise reports, trends, comparisons, CRM challenges, and evidence-based
debrief. Exact clinical actions belong to validated rear-crew task models; the commander allocates
attention, time, route, and destination rather than performing implausible remote procedures from
the front seat.

## Mission rhythm and UX

One mission may contain several calls, but the command loop stays readable:

1. Receive an incomplete call and a pod-preparation estimate.
2. Dispatch or retask a pod; stage the big bus and select a route/profile.
3. Continuously compare aircraft ETA with site readiness and update the rendezvous.
4. Choose small-drone extraction, a control fallback, or exceptional direct-bus pickup.
5. Accept the loaded pod and hear the rear crew's timed assessment.
6. With zero, one, or two positions remaining, choose pickup, definitive receiver, or safe relay.
7. Resolve receiver challenges, transfer custody, and review what was known at each decision.

The interface should normally offer one clear primary command action. Comparisons may preview
alternatives, but confirmation is deliberate. Medical, weather, threat, link, readiness, receiver,
and time information should read as instruments in one command picture rather than independent
minigames. Automation reports what it is doing, why it changed mode, and what authority remains with
the player.

## Deterministic kernel contract

Medevac extends the platform's existing authority boundary; it does not create browser-owned
mission truth.

```text
approved scenario + seed + ordered semantic commands
    -> fixed-step medevac session
        -> vehicle, pod, patient, link, environment, threat, and facility truth
            -> observer-safe crew beliefs and recommendations
                -> immutable presentation snapshot + ordered event stream
```

The versioned mission contract must identify at least stable call, patient, pod, vehicle, site,
transfer-node, facility, route, weather, and threat-source IDs. Semantic commands should express
intent—dispatch pod, stage vehicle, select pickup, approve extraction mode, use link fallback,
select relay/receiver, acknowledge challenge, override, hand off—not renderer clicks or direct
component mutation.

The kernel owns fixed-step time, seeded variation, rendezvous timing, capacity, custody, link state,
flight/ground movement, observed medical state, treatment progress, facility availability, threat
classification, outcomes, and event ordering. No wall clock, renderer result, network timing, sound
cue, generative model, or display name may decide an authoritative transition. Presentation
interpolates immutable snapshots and fails closed if the authoritative bridge is unavailable.

Every recommendation records the observations, facility advertisement, route estimate, and time
used to produce it. Every override records the challenge and acknowledgement. This is necessary for
both teaching and fair grading.

## Historical verification outline (parked)

- **Determinism:** identical seed and timestamped command stream produce identical snapshot/event
  hashes; save/replay reaches the same outcome.
- **Conservation:** a patient and pod occupy exactly one location and custody state; transfers cannot
  duplicate, delete, heal, or reset them; capacity never exceeds two.
- **Rendezvous:** early, on-time, late, cancelled, diverted, and faulted pod preparations are tested,
  including changed site estimates while the aircraft is en route.
- **Extraction controls:** fibre exhaustion/break, autonomous continuation, RF degradation/signature,
  repeater expenditure, and direct-bus fallback each have deterministic state transitions and
  observer-safe indications.
- **Medical observations:** snapshots and recommendations are audited for hidden-truth leaks,
  stale assessments, impossible precision, and findings exposed before the relevant examination.
- **CRM authority:** a capability or safety challenge blocks accidental confirmation, requires
  acknowledgement, permits an explicit commander override, and leaves an auditable event trail.
- **Routing:** capability gaps, temporary receiver unavailability, relay delay, weather, threat, and
  the collect-second-versus-deliver-first branches produce distinct, explainable recommendations.
- **Terminology:** no dynamic `DUSTOFF` threat-state classification is implemented; any future term
  use requires its own sourced design.
- **Physical integration:** LZ and approach grading uses authored surface, obstacle, wind,
  visibility, aircraft-performance, fibre, and clearance truth—not decorative scenery or a macro
  terrain mesh.
- **Product UX:** keyboard, pointer, and narrow layouts preserve one legible primary action, visible
  authority, current pod occupancy, destination, link mode, and rear-crew challenge; loss of the
  kernel cannot fall back to a second medical game in JavaScript.
- **Education and review:** every teachable medical claim has provenance, uncertainty, a declared
  fidelity limit, scenario tests, and emergency-medicine subject-matter review. Flight, autonomy,
  and human-factors claims receive equivalent domain review. Debrief judgments cite recorded
  evidence rather than hidden scenario truth.

## Parked medical research notes

The parked prototype deliberately stops short of treatment simulation. Its coarse
airway/breathing/circulation/temperature observations, transport continuity, crew-resource
management, and capability matching are scaffolding for later subject-matter review—not an invented
clinical protocol.

Current primary references for that review are:

- the [Joint Trauma System Clinical Practice Guideline index](https://jts.health.mil/index.cfm/CPGs/cpgs),
  which is the versioned entry point for en-route care, patient packaging, transport, blood,
  hypothermia, documentation, and related guidance; and
- the Joint Trauma System
  [Interfacility Transport of Patients Between Medical Treatment Facilities](https://jts.health.mil/assets/docs/cpgs/Interfacility_Transport_CoERCCC_OPG.pdf)
  operational guideline, particularly its treatment of capability as actually available trained
  people plus equipment, the need to communicate capability between the sending team, transport
  team, control, and receiver, the trade between lower transport capability and delay, serial
  transfer legs in large-scale combat, platform/crew integration, and continuous documentation.

References identify questions and validation gates; they do not turn their tables into gameplay
thresholds automatically. Versions and theatre applicability must be checked again when clinical
content is authored. A qualified emergency-medicine and en-route-care reviewer still owns acceptance.

## Use boundary

This system is for a fictional game and educational simulation. It is **not clinical decision
support**, a treatment protocol, dispatch software, real navigation, targeting, or operational
planning. It must not provide individualized real-world medical recommendations. Medical behavior
remains behind explicit validation and review gates; uncertainty is shown rather than papered over
with confident numbers.

The theatre, organizations, facilities, people, and incidents are synthetic composites. Patient
portrayal should be restrained and specific: people have lives and context, not collectible
tragic backstories. No gore or celebratory destruction is required. Use painterly light, living
steppe, weathered machinery, quiet aftermath, humane pacing, and cold exact instruments. Do not
copy the characters, assets, frames, or signature style of any film studio.

## What the Gemini conversation does not approve

The supplied conversation is design ideation, not a requirements document. The decisions recorded
above describe the explored concept; they no longer establish current implementation canon.
Gemini's elaborations do not become canon merely because they are detailed. The following remain
unapproved unless adopted in a later design record:

- a specific real aircraft, named crew, real unit markings, real place, or exact 2030s technology;
- parachute pod delivery, mid-air docking, a flying surgical suite, active stealth, exact drone
  swarm behavior, or fixed RF-to-enemy-arrival timers;
- exact vital-sign thresholds, altitude/G rules, automated drugs or procedures, clinical
  contraindications, survival clocks, and claims that a particular manoeuvre causes a particular
  outcome;
- roguelike permadeath, rank loss, equipment tiers, persistent airframe wear, daily missions,
  monetization, LLM-authored story text, and specific campaign characters or plot beats; and
- copying Studio Ghibli, Valve, or any other creator's protected assets or recognizable style.

These ideas may be researched and proposed separately. Until a later design record explicitly
reactivates this concept, contributors should follow the CASEVAC pickup/drop-off design and must not
smuggle this parked command, clinical, story, engineering, business, or art scope into simulation
truth.
