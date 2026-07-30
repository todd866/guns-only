# Narrative gameplay scaffold

Status: pre-production architecture  
First project: `sequence.korea-1951.armstrong-cable-strike.v1`  
Runtime authority: none; this directory specifies contracts for later implementation

## Product decision

The Armstrong sortie is a **fixed-history reconstruction**, not a branching biography.

The plot owns the documented sequence: carrier launch, low-level armed reconnaissance, cable
strike, damaged flight south, the decision not to land the Panther, ejection, descent and recovery.
The player owns performance inside that sequence: aircraft control, energy, route discipline,
checklist execution, timing and survival.

The cable is physical collision geometry and the wing damage is an authoritative simulation
consequence. The mission corridor and required attack run are authored so the historical flight
intersects the cable. Avoiding the incident by abandoning the run, leaving the corridor or missing
the task does not create an alternate Armstrong timeline; it restarts from the nearest narrative
checkpoint.

This is the working rule:

> Fixed history, variable performance. Authored circumstances, simulated consequences.

## Why a new layer is needed

The repository already owns most of the necessary machinery:

- campaign constitution, evidence labels and release gates in
  `content/governance/korea-braided/`;
- deterministic mission authority in `SimulationSession` and mission-specific controllers;
- ordered observer-safe events and one-shot presentation cursors;
- simulation-owned radio words and timing in `MissionRadio`;
- content-pack visual, asset, camera, HUD, input, audio and effects profiles;
- replay evidence and evidence-backed debriefs.

What is missing is a contract between the sourced mission dossier and those runtime systems. A
playable sequence must say which historical beats are invariant, what the player does during each
beat, which authoritative facts advance it, which cues make those facts legible, and which evidence
the debrief retains.

## Contract stack

```text
campaign governance
  -> sourced mission dossier
    -> playable sequence contract
      -> deterministic mission controller and world simulation
        -> observer-safe events and snapshots
          -> visual/audio/UI presentation
            -> replay-backed debrief and archive
```

Each layer has one job:

| Layer | Owns | Must not own |
|---|---|---|
| Campaign governance | evidence policy, progression constitution, review gates | mission timing or physics |
| Mission dossier | claims, sources, abstractions, dramatic purpose, representation | runtime predicates |
| Playable sequence | invariant order, beat requirements, player task, cue and evidence references | world truth or direct state mutation |
| Mission controller | authoritative phase changes, checkpoints, completion and failure | dialogue performance or camera |
| Simulation | aircraft, collision, damage, ejection, parachute, terrain and weather truth | story copy |
| Projection | observer-safe snapshot and ordered events | hidden truth or new rules |
| Presentation | camera, captions, audio, visual state and accessibility alternatives | mission advancement |
| Debrief | assessed evidence and one prioritized correction | invented causality |

## Beat grammar

Every beat has:

1. a dramatic purpose;
2. an observable player task;
3. an epistemic label and source-claim references;
4. authoritative entry, completion and failure facts;
5. mechanics and presentation cues;
6. a checkpoint policy;
7. evidence to retain for replay and debrief.

Beat kinds are deliberately small:

- `setup`: establish people, machine, place and immediate task;
- `transit`: move through authored geography without filler;
- `task`: perform the operational purpose of the sortie;
- `hazard`: encounter a physical threat;
- `consequence`: control a system after an authoritative event;
- `decision`: make a procedural choice supported by observable evidence;
- `transition`: move between operational phases;
- `aftermath`: allow the consequence to land without adding another task.

The sequence contract may request a camera, line, caption, music state or checkpoint. It may not
declare a collision, damage state, safe ejection, successful recovery or completed objective. Those
remain simulation facts.

## Historical labels

Use the existing campaign labels without inventing synonyms:

- `history`: a claim about an event, person, institution or condition supported by sources;
- `engineering`: a physical or technical claim supported by a technical source;
- `reconstruction`: a necessary modeled detail whose exact historical value is unavailable;
- `fiction`: invented connective material.

Disagreement is not a fifth label. It is recorded as competing claims or a qualification. For this
project the date, Panther subtype, detailed target run, cable placement, exact radio exchange and
ground recovery remain open until the source dossier resolves or explicitly preserves them.

## Character rule

Characters enter because the record and operation require them. There is no representational role
quota.

- Ensign Neil Armstrong is the player character.
- Major John Carpenter is the documented flight lead and the only currently named supporting
  airborne character.
- Launch, control and recovery voices remain operational roles until a source names the person.
- No private thought, invented moral speech or retrospective Moon foreshadowing is written for
  Armstrong.

Historical-person dialogue is restricted to sourced words or restrained procedural reconstruction.
No generated performance may imitate a real recording of Armstrong, Carpenter or another public
figure.

## Player agency

For `fixed_history`:

- plot beats marked `requiredForProgression` occur in authored order;
- skill changes the quality and difficulty of reaching the next beat, not the historical outcome;
- fatal or plot-breaking divergence restarts from the nearest declared checkpoint;
- the restart is presented as reconstruction control, not a counterfactual death or alternate
  biography;
- optional handling variation may change debrief evidence but cannot erase a required beat.

Later projects may use `historical_sandbox` or `fictional` modes, but they must declare that mode
explicitly. Armstrong's sortie does not.

## Files

- [`playable-sequence.schema.json`](playable-sequence.schema.json): runtime-neutral authoring
  contract.
- [`armstrong-ejection.sequence.json`](armstrong-ejection.sequence.json): first filled project
  contract.
- [`source-register.json`](source-register.json): page-level research, source limitations,
  distribution status and media provenance for the current intake snapshot.
- [`treatment.md`](treatment.md): dramatic treatment and fixed-history player arc.
- [`screenplay.md`](screenplay.md): playable 12-scene script skeleton with authority events,
  workload rules and reconstruction labels.
- [`radio-lines.json`](radio-lines.json): stable procedural line catalog and synthetic-performance
  policy; text remains draft until script lock.
- [`voice-production.md`](voice-production.md): non-imitative casting, generation, mastering,
  radio-processing, provenance and QA contract.
- [`storyboard-plan.json`](storyboard-plan.json): one source-bounded production frame per beat,
  with explicit visual exclusions.
- [`greybox-implementation.md`](greybox-implementation.md): typed state-machine, collision,
  damage, radio, ejection and proof plan for the first implementation slice.
- [`research-ledger.md`](research-ledger.md): known source facts, disputes and PaperLibrary intake
  requirements.
- [`production-plan.md`](production-plan.md): complete workstream map, dependencies and gates.
- [`validate.mjs`](validate.mjs): schema and cross-catalog validator for the complete production
  bundle.

Validate the current sequence with:

```sh
node docs/art-direction/korea-1950s/narrative/validate.mjs
node --test docs/art-direction/korea-1950s/narrative/validate.test.mjs
```

The bundle validator requires exact closure: every declared line and storyboard frame must exist,
belong to the beat that references it, and cite only registered sources and governed claims.

## Promotion path

This directory is design evidence. Promotion requires:

1. an Armstrong mission dossier under `content/governance/korea-braided/missions/`;
2. strict governance validation with every non-fiction claim closed against sources;
3. a mission controller whose events implement the beat predicates;
4. content-pack declarations for the Panther, Essex, Korea environment and narrative presentation;
5. generated audio, art and runtime assets with separate provenance and licensing;
6. deterministic tests, silent audio QA, accessibility proof and replay-backed debrief proof.
