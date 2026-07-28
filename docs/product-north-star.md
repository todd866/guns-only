# Product north star: Cohort, a world in which you can learn anything

Date: 2026-07-28  
Status: owner direction; use for future planning

## Product identity

**Working product identity: `cohort.md`.** The owner controls the domain and has pointed its
nameservers at Vercel. Cohort is an **open-source educational game world**: a DIY MMORPG with a
realism and hard-science-fiction bias, where players and communities can bring their own domain
content and use a coding agent to make that content playable.

The name is part of the thesis. A cohort can enter the same world to learn, practise, build, teach,
and compare judgment without everyone having to follow the same profession or linear campaign.

## The whole game

This is a persistent, explorable role-playing world in which a player can learn **anything that can
be modelled honestly enough to practise**. Aviation and medicine form the first connected spine,
not the boundary of the platform. Its shorthand is:

> **World of Warcraft structure, Studio Ghibli–adjacent humanity and beauty, World War III.**

Those names describe the ambition and the player experience, not assets or IP to copy:

- **World of Warcraft structure** means a large shared-feeling world, memorable places and people,
  long-lived roles, repeatable mastery, specialisation, and reasons to return. It does not mean
  copying its fiction, characters, interface, quests, or progression systems.
- **Studio Ghibli–adjacent tone** means painterly natural beauty, humane pacing, tenderness toward
  ordinary life, quiet between crises, and specific machines. The accepted no-copy rules in
  [ADR-0003](adr-0003-ghibli-adjacent-world-presentation.md) remain binding.
- **World War III** is the fictional late-2030s setting already established by
  [the no-man's-land canon](no-mans-land-canon.md): a beautiful rewilding landscape shaped by
  automated war, fragile communities, medicine, logistics, and morally consequential command.

The dogfight simulator is therefore the first playable discipline inside a much larger world, not
the final shape of the product. The meta-loop is **player → practitioner → builder → teacher**:
learn a system, use it in the world, alter or extend it, and make the resulting knowledge available
to another cohort.

## The world is the curriculum

The product is not a menu of disconnected educational minigames. Knowledge changes what a player
can perceive, make, negotiate, repair, operate, and teach inside one consequential world.

- A player can fly an aircraft, practise paediatrics, run a clinic, command a formation, design a
  new jet, manufacture a component, organise transport, negotiate a contract, or specialise in
  supply.
- Engineering is not a free vehicle editor. A credible new jet depends on requirements,
  aerodynamics, propulsion, materials, manufacturing, test evidence, money, people, basing,
  maintenance, fuel, and negotiated access to supply.
- Supply is not background inventory. Procurement, substitution, transport, storage, reliability,
  scarcity, trust, and negotiation are themselves playable disciplines.
- Medicine, engineering, logistics, command, and aviation share people and consequences. A design
  decision can become a maintenance problem, a supply mission, an evacuation constraint, a
  clinical case, and eventually a command decision.
- Progress should come from demonstrated competence, contribution, relationships, and access—not
  an arbitrary XP number standing in for knowledge.

The promise is not that the built-in game already contains every subject. The promise is that its
open contracts let a community add subjects without rebuilding the world from scratch.

## Any teacher, any classroom

The basic adoption loop is:

> A teacher brings a classroom into the open world and simulates the thing they are teaching.

The teacher should not need to become a game developer. They bring a lesson, question, source,
dataset, case, system, place, or procedure; the coding agent and platform help turn it into a
credible scenario. The teacher chooses the learning objective, location, starting conditions,
student roles, available information, time pressure, assistance, safety boundaries, and debrief.
Students then learn by acting together inside the same causal world rather than watching a
simulation or completing a detached quiz.

A classroom run may be:

- a temporary sandbox or branch of the world that can be paused, replayed, and compared;
- a private cohort space with its own roster, policies, content, and data;
- an offline or local-network session that synchronises later;
- an authorised event whose consequences become part of a persistent shared world.

Teachers need orchestration tools: invite, assign roles, brief, observe, introduce events, pause,
branch, rewind, inspect evidence, and conduct a debrief. Students need agency and privacy: classroom
telemetry must be visible, proportionate, interpretable, and useful for feedback rather than covert
surveillance.

“Any subject” does not waive epistemic standards. A contributed simulation must say what it models,
what it simplifies, where its evidence came from, and what must not be inferred from it.

## DIY and bring-your-own content

Players must be able to cross the line from consuming the world to extending it. A coding agent is
the primary workshop assistant: it can help turn a lesson, dataset, model, case library, asset pack,
or domain expert's procedure into a tested playable module.

Every contributed discipline should eventually have explicit contracts for:

1. **world content** — people, places, organisations, resources, equipment, and scenarios;
2. **rules and models** — what state exists, what changes it, and which claims are simulated;
3. **instruments and interaction** — what the player can observe and do in first person;
4. **teaching and assessment** — objectives, scaffolding, feedback, mastery evidence, and debrief;
5. **economy and dependencies** — inputs, supply constraints, permissions, and consequences;
6. **telemetry** — evidence of confusion, strategies, improvement, unsafe guessing, and transfer;
7. **provenance and validation** — sources, licences, uncertainty, review status, tests, and safety;
8. **classroom orchestration** — objectives, roles, permissions, branching, observation, debrief,
   privacy, retention, and teacher controls.

Open source is structural, not promotional: the engine, schemas, authoring tools, reference content,
and validation harnesses should be inspectable and extensible. Different servers or cohorts may
curate different worlds and safety policies while retaining interoperable content contracts where
practical.

The product layer defaults public: code, schemas, tools, tests, owned reference content, telemetry
definitions, and the complete self-hosting path. Learning records and telemetry stay on the
learner's device or classroom host by default; core play and teaching do not require central
collection. People inspect, export, delete, or deliberately share only what they choose. Anything
entrusted to a hosted service, plus required identities/consent, institutional operations, and
corporate/legal material, remains in a private stewardship layer. Privacy must protect people, not
conceal product source; a public checkout cannot depend on the private company repository.

## The career arc

The first authored invitation runs:

1. **High-altitude flyer** — master aircraft, energy, navigation, interception, survival, and the
   strategic view from above.
2. **Medevac pilot** — bring aviation skill down into weather, terrain, landing zones, triage,
   transport physiology, handover, and responsibility for people rather than targets.
3. **Clinical crossover** — “you flyboys make good doctors; come help me out.” Knowledge of
   systems, pressure, incomplete information, crew coordination, and disciplined procedure becomes
   the bridge into medicine.
4. **Doctor** — assess, decide, treat, reassess, communicate, and learn through first-person cases
   grounded in the same people and places encountered from the air.
5. **Military commander** — accept responsibility for the coupled system: people, access,
   intelligence, force, logistics, evacuation, clinical capacity, and consequences over time.

This is an invitation, **not the platform's complete profession list or a one-way promotion
ladder**. A player may remain in any role and practise it indefinitely, enter through a different
discipline, or author a new one. Every role must become a deep, replayable discipline rather than a
tutorial discarded on the way to command. Progress adds perspectives and responsibilities; it
does not invalidate the craft already learned.

## Dimensions of progression

Future plans must preserve all three:

- **Vertical breadth:** flyer → medevac → clinical crossover → doctor → commander.
- **Horizontal mastery:** continued practice, harder cases, different conditions, specialisation,
  better judgment, and reflection within any chosen role.
- **Authorship and contribution:** inspect, modify, validate, publish, teach, and maintain new
  content or systems for a cohort.

Unlocking a new role must never silently retire an earlier one. The world, relationships, and
consequences connect the roles; the player chooses where to work today. Authorship is not an
out-of-world cheat code: player-created capability should still enter the world through credible
testing, supply, institutions, and negotiation.

## Mission grammar

Missions should be experienced in first person and ask the player to observe, reason, act, and
reassess under pressure. The common grammar across aviation and medicine is:

1. receive an imperfect brief;
2. inspect the real situation;
3. identify the binding risks;
4. choose and execute a plan using honest instruments;
5. notice change and revise;
6. hand over, debrief, and retain consequences in the world.

Assistance may teach repetitive motor work, but the player owns the meaningful decisions. This is
the same doctrine already used by the flight complexity ladder and adaptive teacher.

## Near-term practice focus: paediatrics

Paediatrics is the next medical practice lane to prepare. Near-term planning should tee up:

- a structured patient/case model that treats age, developmental stage, weight, observations,
  history, allergies, medications, caregivers, trends, interventions, and reassessment as
  first-class data;
- first-person assessment and handover interactions that reward noticing, prioritisation,
  communication, escalation, and follow-up—not trivia recall or rapid button pressing;
- repeatable cases with controlled variation and deterministic replay where appropriate, so the
  player can practise a skill rather than memorise a script;
- a clear separation between simulated observations, player inference, and confirmed findings;
- explicit provenance, review status, uncertainty, contraindications, units, and safety guardrails
  for clinical content;
- continuity from medevac pickup through transport, receiving handover, treatment, and later
  follow-up in the same world.

The first paediatric slice should be small and deep: one credible assessment/reassessment loop,
excellent feedback, and useful telemetry before a broad catalogue of shallow diagnoses. It must be
designed as practice and reflection, not as unsupervised real-world clinical authority.

## Planning tests

Every major feature proposal should answer:

1. Which role does this deepen?
2. Is it vertical breadth, horizontal mastery, or authorship?
3. What first-person decision does the player own?
4. How does it connect to people, places, and consequences already in the world?
5. Does it preserve the beautiful-world / cold-instruments contrast?
6. Can the player practise it repeatedly and receive evidence-based feedback?
7. What telemetry will show confusion, improvement, unsafe guessing, or mastery?
8. Does it respect the fiction, no-copy art rules, and medical safety boundaries?
9. What resources, supply relationships, institutions, or negotiations make it real in the world?
10. Could a domain expert and coding agent add or improve this through stable, documented
    contracts?
11. Can a teacher bring a classroom into it, assign meaningful roles, and debrief evidence of
    learning without writing game code?

If a feature cannot answer those questions, it may still be a useful experiment, but it is not yet
part of the product spine.
