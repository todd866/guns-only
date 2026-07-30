# Narrative gameplay production plan

Status: scaffold  
Sequence: `sequence.korea-1951.armstrong-cable-strike.v1`

Current design package: treatment, 12-beat playable sequence, screenplay skeleton, 15-line
procedural radio catalog, 12-frame storyboard plan, source register and greybox implementation
contract, plus a voice-production and audio-QA contract. These are validated pre-production
artifacts, not source lock, generated media or runtime implementation.

## Outcome

Ship one continuous, source-backed historical mission in which the player experiences Armstrong's
September 1951 Panther cable strike from USS *Essex* launch through ground recovery. The story is
linear. Performance is simulated. Historical claims, engineering reconstruction and invented
connective tissue remain visibly distinct.

The first useful internal milestone is not a polished trailer. It is a greybox run in which:

1. the player launches a Panther from a straight deck;
2. follows Carpenter through a bounded target route;
3. physically intersects a cable;
4. arrests the resulting asymmetric roll;
5. holds formation for a damage inspection;
6. reaches friendly territory;
7. completes ejection and parachute descent;
8. receives a replay-backed debrief.

## Production dimensions

| Dimension | Questions that must be answered | Artifact / proof |
|---|---|---|
| Historical research | What happened, according to whom, and where do sources disagree? | Governed dossier with page-level source closure |
| Rights and provenance | May the text, image, film, name, likeness, voice and generated asset be used and shipped? | Asset license set, rights review and source/asset separation |
| Narrative design | What is invariant, what does the player perform, and where does the story breathe? | Playable sequence, screenplay and timing pass |
| Mission design | What task naturally creates each beat and how does divergence restart? | Route, gates, predicates, checkpoints and failure contract |
| Character | Who is actually present, what can each person know, and what may they plausibly say? | Cast bible, knowledge boundaries and line provenance |
| Aircraft simulation | What Panther configuration flew, and how is normal and damaged flight bounded? | Capability definition, source card and validation envelope |
| Carrier simulation | What does the 1951 *Essex* launch require? | Deck configuration, procedure and catapult integration |
| Terrain and environment | What target geography, weather, landmarks and cable layout can be defended? | Source-bounded terrain cell and feature pack |
| Damage | How does contact remove structure and change forces without making the aircraft terminal? | Collision, fracture, aerodynamic damage and visual agreement |
| Ejection and parachute | What actions and physics bridge cockpit, seat, canopy and ground? | Authoritative lifecycle with tests and replay |
| AI and supporting actors | How does Carpenter fly, inspect and speak without hidden truth? | Observer-safe formation controller and radio events |
| Visual development | What are the exact shapes, palettes, materials, effects and camera rules? | Character/vehicle/environment sheets, storyboard and engine targets |
| Audio and voice | What is diegetic, sourced, generated, disclosed and accessible? | Line catalog, performance manifests, sound bible and silent QA |
| Interface | How are task, checkpoint, caption, source status and debrief shown? | Briefing, mission strip, restart surface, captions and archive |
| Accessibility | Can critical facts be perceived and actions completed without one sensory or motor assumption? | Caption, contrast, remap, timing and reduced-motion proof |
| Localization | What is translated, performed, preserved as period terminology or kept deliberately untranslated? | String catalog, glossary and locale test matrix |
| Replay and debrief | Can the game explain what the player did without inventing causality? | Ordered events, recorder clip and assessed correction |
| Telemetry and playtest | Is the run readable, demanding and paced correctly? | Questions, bounded metrics and consent-safe playtest plan |
| Performance | Do terrain, carrier, actors, damage and presentation stay within budgets? | Frame-time tails, draw/triangle counts and asset closure |
| Release operations | Can the exact reviewed content be built, deployed, identified and rolled back? | Clean gate, pinned hashes, production smoke and rollback record |

## Phase 0 — research intake

Inputs:

- Armstrong oral history and biographies;
- USS *Essex*, VF-51 and Air Group Five records;
- Korean War and naval aviation histories;
- F9F manuals, drawings, photographs and film;
- 1951 carrier-deck procedures and footage;
- terrain, target-area, weather and map evidence;
- ejection-seat and parachute technical records.

Rules:

- preserve source perspective and disagreement;
- follow secondary citations toward primary records;
- keep copyrighted files in PaperLibrary or the external research archive;
- keep research citation separate from runtime asset licensing;
- never use a novel or later dramatization as a transcript.

Exit: `source-lock`.

## Phase 1 — narrative and mission lock

Deliverables:

- one-page treatment;
- 12-beat sequence with target timing;
- screenplay containing only sourced or labeled reconstructed dialogue;
- route and workload diagram;
- checkpoint and restart specification;
- debrief questions;
- content warning and player-facing historical note.

Key design rules:

- fixed plot, variable performance;
- no alternate biography branch;
- the cable strike is physical but required;
- no player input is solicited if it cannot materially affect performance;
- no cutscene steals control during a flight-critical correction;
- no exposition during maximum workload;
- no Moon foreshadowing in 1951 dialogue;
- no invented character added to carry a moral thesis.

Exit: `scenario-lock`.

## Phase 2 — greybox vertical slice

Build in dependency order:

1. sourced Panther normal-flight surrogate;
2. two-ship formation with Carpenter;
3. route gates and target run;
4. physical cable geometry and swept collision;
5. nonterminal right-wing damage;
6. damaged-flight stabilization gate;
7. observer-safe inspection and decision;
8. southbound route and friendly-territory gate;
9. ejection lifecycle;
10. parachute and ground contact;
11. narrative checkpoints;
12. recorder and debrief.

Use primitive visual geometry and text captions. Do not wait for final art or voice to learn whether
the sequence works.

Greybox questions:

- Does the attack task occupy enough attention that the cable strike feels plausible?
- Is the cable contact visually honest rather than a hidden trigger?
- Can players learn the asymmetric-flight response?
- Is the damaged return long enough to build tension without becoming dead transit?
- Does Carpenter's inspection help without becoming an omniscient tutorial?
- Is the ejection procedure tense and comprehensible?
- Do checkpoint restores remove repetition without flattening consequence?

Exit: `greybox`.

## Phase 3 — content production

### Script and voice

Line record fields:

- stable line ID;
- speaker and callsign;
- exact text;
- function in the beat;
- `history`, `reconstruction` or `fiction` label;
- source and page locator, or reconstruction note;
- direction that describes performance without naming a real voice;
- selected model snapshot and stock/designed voice ID;
- AI disclosure;
- takes, review status, duration, loudness and file hash;
- localized caption and performance status.

Armstrong and Carpenter receive original performances. Prompts explicitly prohibit imitation of
the real people. The existing OpenAI TTS pipeline can produce reproducible fallback assets; another
provider may be evaluated for performance quality only after script lock and with the same
provenance requirements.

### Visual reference

Required new boards:

- young Armstrong: wardrobe, helmet, survival equipment and restrained expression;
- Carpenter and two-ship relationship;
- F9F variant, livery, cockpit and loadout;
- USS *Essex* launch configuration and deck crew;
- target valley, route and cable construction;
- cable contact and right-wing failure;
- damaged formation inspection;
- ejection seat, pilot separation and parachute;
- friendly landing and recovery;
- revised 12-panel continuity board.

Existing generated `long-way-home` images remain palette and atmosphere exploration. They are not
Armstrong, Panther, target, damage or recovery evidence.

### Runtime art

Promote reference decisions through:

- versioned content-pack profiles;
- authored or procedural runtime geometry;
- period materials and livery;
- Korea-specific atmosphere and terrain palette;
- bounded vegetation and settlement density;
- cable, damage and ejection effects with physical anchors;
- generated-image exclusion from the runtime network closure unless a later rights decision
  explicitly changes that policy.

Exit: `content-lock`.

## Phase 4 — integration

Authority:

- the mission controller owns phase, checkpoint and completion;
- the simulation owns route membership, collision, damage, aircraft, seat, pilot, parachute and
  ground contact;
- the radio director owns line identity and timing from authoritative state;
- projection exposes only observer-safe facts;
- presentation owns camera, caption, audio, visual state and quiet interval;
- replay and debrief consume recorded evidence.

The playable-sequence JSON is an authoring contract, not a dynamic rules engine in v1. Implement
explicit typed C# definitions first. A generic data-driven runtime follows only after the Armstrong
slice proves the common shape.

## Phase 5 — QA and review

### Determinism

- beat order is stable at different host-frame schedules;
- checkpoint restoration reproduces seed and state hash;
- cable contact produces one ordered collision and damage transition;
- ejection produces one ordered aircraft/seat/pilot/parachute lifecycle;
- replay renders recorded facts without rerunning simulation.

### Historical and narrative

- every non-fiction claim closes through the approved dossier;
- every line has provenance or a reconstruction label;
- disputed date and subtype are not silently resolved;
- no generated reference is treated as evidence;
- no scene implies NASA, Navy, Armstrong-family or archive endorsement;
- a complete playthrough communicates the story without the archive essay.

### Gameplay

- the required cable strike reads as consequence of the task and route;
- the player understands the first control action after contact;
- damaged flight is demanding across supported control methods;
- restart points prevent the launch and ingress from becoming punishment;
- success measures competent performance without grading whether history happened.

### Accessibility and localization

- critical speech has synchronized captions and speaker identity;
- critical visual information has a non-color-only alternative;
- cable contrast treatment does not move or enlarge collision truth;
- control mapping, hold/toggle, timing assist and reduced motion pass;
- translated text preserves source/reconstruction status and period terms.

### Audio

- catalog, generated files and measured durations agree;
- missing audio degrades to captions without mission delay or failure;
- radio filter, sidechain and event mix preserve intelligibility;
- silent QA exercises the real graph and cleans it up;
- no voice prompt or output imitates a real person.

### Visual and performance

- aircraft, cable and damage remain legible at every supported quality tier;
- required landscape features do not stream in after collision relevance;
- ejection and parachute transitions have no spatial discontinuity;
- draw, triangle, texture, memory and frame-time budgets pass;
- Ukraine and other theatre profiles do not change.

### Rights

- every shipped external asset has a license entry and retained source page;
- every government-work assertion is item-specific;
- copyrighted biographies, books and films remain research-only unless separately licensed;
- name, likeness, quotation and synthetic-performance use passes review.

Exit: `historical-rights-review`, `accessibility`, then `release`.

## Telemetry questions

Collect only what answers a design question:

- Where do players lose the cable route before the authored strike?
- How many attempts are needed to arrest the first roll?
- Which observable cue precedes a successful correction?
- How long can players hold the inspection formation?
- Where does damaged transit become boredom rather than tension?
- Which ejection action is missed and why?
- How often do players request restart from each checkpoint?
- Can players accurately recount why landing was rejected?
- Can captions-only and reduced-motion players complete the same sequence?

Do not collect hidden psychographic inference or use telemetry to rewrite historical facts.

## Immediate critical path

1. Finish PaperLibrary and media intake.
2. Create and validate the governed Armstrong dossier.
3. Resolve the Panther subtype enough to bind the flight model.
4. Lock the cable/target corridor as history plus declared reconstruction.
5. Prototype cable collision and partial-wing damage.
6. Prototype the damaged-flight checkpoint through inspection.
7. Add ejection and parachute lifecycle.
8. Review and lock the drafted source-labeled script against the completed intake.
9. Generate and review original voice performances.
10. Generate the source-bounded Armstrong-specific reference boards and promote only reviewed
    decisions into engine-native art.
