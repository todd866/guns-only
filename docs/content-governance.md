# Campaign and educational content governance

Status: active authoring contract, 2026-07-21

This document governs campaign structure, mission authorship, educational material, historical
claims, speculative fiction, progression, and representation. It sits above individual mission
implementations and below the project's product thesis. A mission can be mechanically functional
and still be ineligible for release if it does not satisfy this contract.

The machine-readable policy is
[`content/governance/korea-braided/governance.json`](../content/governance/korea-braided/governance.json).
Each authored mission group has a dossier validated against that policy. The first worked dossier
is
[`first-echo.dossier.json`](../content/governance/korea-braided/missions/first-echo.dossier.json).

## Constitutional decisions

These are product identity, not tunable content parameters:

1. **There are two primary storylines.** The historical Korean War and the fictional 2030s Korean
   war are equal campaign spines. Memories of other conflicts, including Ukraine, are nested within
   a character's 2030s story; they do not silently become a third campaign map.
2. **The past changes the meaning of the present.** A 1950s sortie earns its place by making a later
   2030s decision, person, location, or consequence matter more. Historical content is not an
   aircraft museum between modern missions.
3. **The aircraft change; the physical world does not flatter the player.** Permanent progression
   unlocks situations, aircraft, mission types, story, archive knowledge, route information, and
   starting options. It does not grant hidden aerodynamic, weapon-damage, sensor-truth, or AI
   performance bonuses.
4. **Attrition removes privilege, not agency.** F-22 readiness declines through visible losses,
   damage, maintenance, parts, and tasking. Drones have specific limitations and compensating uses.
   The campaign cannot convert one ordinary player failure into an unrecoverable fleet death spiral.
5. **Education follows experience.** The normal loop is encounter a problem, receive a concise
   explanation, then apply the idea in a later sortie. Mandatory exposition may not interrupt the
   decision it is meant to illuminate.
6. **Epistemic status is visible.** Engineering, history, reconstruction, and fiction are labeled
   distinctly. The 2030s campaign is never presented as a forecast. A source proves only what it
   actually supports, and an institution's statement is not treated as neutral omniscience.
7. **Every side retains agency and interiority.** Korean, Chinese, American, Ukrainian, Russian, and
   other people are not equipment labels or delivery systems for another country's plot. Playable
   opposing perspectives require the same mechanical honesty and evidentiary care as friendly ones.

Changing one of these decisions requires an explicit design record, a migration note for affected
dossiers and saves, and a version increment to the campaign governance object.

## Authority boundaries

Campaign state is deliberately separated from sortie truth:

```text
Campaign governance
    -> run director: route, readiness, unlock eligibility, story sequencing
        -> mission contract: scenario, aircraft, environment, objectives, seed
            -> SimulationSession: authoritative physical sortie and outcome
                -> debrief: evidence from recorded events
                    -> profile: durable unlocks and archive knowledge
```

- `SimulationSession` remains authoritative for one deterministic sortie. Campaign code may choose
  inputs and consume its result; it may not rewrite a physical loss into a win or increase aircraft
  performance because of profile level.
- The future run director owns the deterministic route seed, node graph, readiness ledger, mission
  offers, and run-scoped resources. It stores stable content IDs, never display names.
- The durable profile owns unlocked content, discovered archive entries, completed story nodes, and
  records. It does not own transient aircraft physics.
- A debrief explanation must be derivable from the event/snapshot record. If the game cannot show
  what evidence supports a judgment, it may coach cautiously but may not grade that judgment.

## The braid contract

A dossier is the smallest reviewable narrative unit. It normally contains at least one sortie from
each primary timeline and states one shared dramatic question. Its echo map records:

- what remains physically or geographically recognizable;
- what changes because of technology, institutions, landscape, and time;
- what the player learns in the earlier context;
- where that knowledge is tested rather than merely repeated;
- why the order of revelation matters.

Random generation may vary weather, serviceability, route, threat composition, optional objectives,
and available equipment. It may not reorder authored revelations in a way that destroys causality,
contradicts established history, reveals an answer before its question, or presents a nested memory
as objective narration.

The default opening is the F-22 drone-raid defence. It establishes altitude, information, and
airframe availability as privileges. The first historical unlock then reduces both performance and
information while preserving the same underlying problems of closure, identification, fuel, lead,
and recovery. Later modern sorties progressively substitute limited drones as F-22 readiness falls.

## Progression and attrition

State has three lifetimes:

| Lifetime | Examples | Reset rule |
| --- | --- | --- |
| Sortie | position, damage, ammunition, contact belief | ends with the sortie |
| Run | ready airframes, repair queue, parts, network integrity, route, current node | ends with the run |
| Profile | mission and aircraft access, story chapters, archive, records | durable and mergeable |

The run director may create scarcity through ready aircraft, repair capacity, spare engines,
ammunition, datalink/network health, trained controllers, intelligence confidence, and time. Every
readiness change needs a legible cause and a future decision consequence.

An F-22 loss uses a bounded state transition such as `ready -> damaged -> repairable`, `ready ->
inspection`, or `ready -> lost`. Ordinary failure should usually damage readiness or consume time;
catastrophic permanent loss belongs to an explicit, telegraphed outcome. The route generator must
always preserve at least one viable mission offer. A weak drone is a different tactical problem,
not a contemptuous consolation prize.

Durable rewards are additive and merge-safe where possible. Cross-device profile merging uses union
for unlocks and archive discoveries and best-value selection for records. Two active runs are never
merged field by field.

## Educational contract

Every learning objective is written as an observable player capability: “controls closure before
entering gun range,” not “understands closure.” It names:

1. the sortie and event that make the idea felt;
2. the short debrief explanation triggered by recorded evidence;
3. a later sortie that asks the player to apply it;
4. an optional archive entry for greater depth;
5. telemetry that can tell whether the lesson is working.

The three delivery surfaces have different jobs:

- **In flight:** honest cues and consequences; no lecture overlay during tactical workload.
- **Debrief:** one prioritized explanation tied to the player's own recorded decision.
- **Archive:** optional diagrams, technical depth, historical disagreement, sources, and declared
  simulation abstractions.

The game does not use trivia quizzes as proof of learning. It tests transfer through another
decision. Educational prompts are frequency-capped, dismissible after first viewing, and never
withhold basic controls or accessibility information.

## Evidence and disclosure

Every externally checkable statement in a dossier is a claim with one of four labels:

- `engineering`: a physical or technical claim; requires a technical reference, primary document,
  or suitable scholarly source;
- `history`: a claim about real people, events, institutions, or equipment; requires at least one
  cited source and additional perspectives when credible accounts conflict;
- `reconstruction`: a plausible connective interpretation grounded in cited anchors; its uncertain
  portion must be stated;
- `fiction`: invented campaign material; it is declared rather than laundered through a citation.

Primary sources establish what an actor recorded, ordered, measured, or publicly claimed. They do
not automatically establish neutral truth. Disputed claims preserve the disagreement in the
archive and avoid false numerical precision. Simulation abstractions are recorded separately from
claims, including what differs from the source, why playability requires it, and how the player is
told.

Sources also carry rights and provenance obligations when text, imagery, data, or media enters the
shipped product. Research citation does not grant an asset licence.

## Representation and conflict-memory review

A perspective review asks:

- Does the portrayed person have a goal beyond serving the player's factional narrative?
- Are uncertainty, dissent, competence, fear, and responsibility distributed across factions?
- Is a real trauma being used only as aesthetic texture or equipment provenance?
- Does a playable memory clearly identify whose memory it is and what may be incomplete?
- Are civilians and support personnel present where the mission's consequences require them?
- Does the script distinguish institutional claims, character beliefs, and narrator assertions?

Ukraine memories are permitted when they explain a specific 2030s character, skill, relationship,
or wound and create later consequences. They are not generic “gritty drone footage,” a shortcut to
villain competence, or a claim that every DPRK operator shares one experience. Before release they
require dedicated historical sourcing and a perspective review separate from the Korean-history
review.

## Lifecycle and release gates

Mission status advances through `pitch`, `researching`, `prototype`, `review`, `approved`, and
`retired`. Approval requires every configured gate to pass:

| Gate | Blocking question |
| --- | --- |
| Narrative braid | Does the historical sortie change the meaning of the modern one? |
| Simulation integrity | Do aircraft, sensors, weapons, weather, and outcomes obey declared models? |
| Evidence | Are claims labeled, supported, bounded, and separated from abstractions? |
| Learning design | Is there an experience-to-explanation-to-reapplication loop? |
| Representation | Do perspective, agency, trauma, and uncertainty receive deliberate treatment? |
| Production | Can terrain, art, audio, UI, performance, and accessibility deliver the intended cues? |

A waiver records its scope, reason, owner, expiry, and player-facing consequence; it is not the same
as a pass. No dossier marked `approved` may contain a pending, failed, or waived blocking gate.

## Authoring workflow

1. Copy the worked dossier and keep status `pitch`.
2. Name the dramatic question, primary-timeline sorties, player decisions, and reveal order.
3. Add learning objectives before exposition or archive copy.
4. Register claims and sources; record simulation abstractions independently.
5. Declare run/profile unlocks and readiness effects using the campaign allowlists.
6. Define terrain, visual, audio, system, accessibility, and telemetry proof requirements.
7. Record every review gate, even while pending.
8. Run `node tools/content/validate-governance.mjs --strict`.
9. Only then bind the approved dossier to production mission definitions and campaign nodes.

The validator checks schema conformance, IDs and references, primary-timeline coverage, evidence
closure, the learning transfer loop, progression allowlists, and approval gates. Human review still
owns historical interpretation, dramatic quality, educational usefulness, and respectful portrayal;
the schema makes those decisions visible and prevents them from being skipped silently.
