# Cobra: the battlefield fights back — design

2026-08-12. Owner-approved design for the first slice of the "turn Cobra into a real game
up to BF:Vietnam standards" push. Decided in dialogue; the option records below are the
contract.

## Standing doctrine established with this push

**"If in doubt, we're trying to clone BF:V."** Battlefield Vietnam's game shape wins every
ambiguous design call: a living combined-arms battlefield, vehicles on ramps, era
atmosphere, the player as one actor among many. The DCS-BS1-grade flight model is the one
deliberate departure from BF:V fidelity — better flying than BF:V, everything else resolved
toward BF:V.

## Why this slice first

As of Build 311 nothing in the Cobra ground war can damage the player
(`sim/Cobra/GroundWar/GroundWarTypes.cs` combatants are legibility fiction fighting each
other). The flight kernel is honest and getting more so; the enemy has no vote. Every later
pillar — mission director, corridor scenery, crewed co-op, infantry — only matters once
flying badly can get you shot down. This is the ground-war extension of the standing
"bandits have to attack" doctrine.

## Decision record

- **First slice:** the battlefield fights back (over living-battlefield director, corridor
  scenery, and crewed co-op — those follow, in that order, each with its own design round).
- **Damage model:** reduced-order subsystem damage degrading the real flight model. No
  hitpoint pool.
- **Damage loop:** land at Camp Ember and swap into a spare Cobra on the ramp. The
  airframe pool is the resource. No repair mechanic at all in this slice (owner superseded
  the earlier repair-over-time answer: "a FOB with a few Cobras on the ramp, and if you're
  damaged bad enough you just swap birds").
- **Sequencing:** three stacked builds, each owner-flyable and gated.
- **No MANPADS anywhere in this slice** — guns-only AA is era-correct for the AH-1G window
  and on-brand. Explicitly out of scope; revisit only by owner instruction.

## Build A (already queued): crash and contact envelope

Per `docs/work-orders/2026-08-12-cobra-crash-consequence.md` (committed alongside this
spec): contact-envelope tiers on the existing `_hardImpactLatched` /
`_rotorStrikeLatched` machinery in `ResolveSkidAndRotorContact` — sink rate (existing,
stays attitude-blind on flare per owner doctrine), lateral velocity + bank (dynamic
rollover), yaw rate at contact, surface suitability. Autorotation energy audit proves a
well-flown auto survives BEFORE any envelope loosening. Terminal cause cards name the
failure. This build is the foundation: being shot down needs a crash to land in.

## Build B: threat + subsystem damage

**Threat actors** — new `GroundWar` roles, placed by the existing seeding machinery:

- `DshkSite` (12.7 mm): revetted, near objectives; the workhorse threat.
- `ZpuSite` (14.5 mm): rare, longer reach; the "respect this" threat.
- Small-arms harassment attached to existing hostile contacts: short range, low lethality,
  area denial near troops in contact.

**Fire model** — sim-owned, deterministic, seeded; reduced-order:

- Each site tracks line of sight through the SAME terrain sampler the rest of the sim uses
  (one-engine doctrine: terrain masking is honest by construction), a range envelope, and
  target exposure time.
- Bursts have travel time and range-scaled dispersion; hit evaluation is burst-geometry
  against airframe capsules (fuselage + tail boom), never instant hitscan.
- Tracer and muzzle-flash events ride the authority snapshot; presentation draws what the
  sim computed. Tracers ARE the telegraph.

**Fairness = legibility** (sports-are-hard + BF:V): first bursts at range are survivable
by dispersion, muzzle flash and tracers are visible from the first burst, the radio
(existing R/T architecture) calls the first engagement, and breaking line of sight breaks
the engagement.

**Subsystem damage** — parameter degradation of real `Ah1gCobraDynamics` inputs:

- Engine: power available × (1 − d).
- Tail rotor: authority × (1 − d) — feeds the existing torque-yaw residual machinery, so a
  tail hit means pedal work, then a spin, then the autorotation Build A made survivable.
- SCAS: out (binary).
- Fuel: leak draining real mass.

Every hit and system state lands in telemetry and cause cards (Cobra telemetry blindness
has cost diagnosis time before — Build 266 lesson).

**Gates** — outcome-based with control experiments (each gate demonstrated to fail against
pre-change code): exposed hover at ~400 ft AGL over open river, ~600 m from a `DshkSite`
→ first damaging hit inside 10–25 s; masked low ingress on the same route → zero hits;
tail hit → measured pedal-workload increase; determinism (same seed, same controls →
identical hits).

## Build C: the FOB ramp loop

- Camp Ember's ramp hosts **three AH-1Gs in revetments** — reuse the `ah1g_presence`
  model, placed outside the test-enforced spawn safety volume; the authored firebase gains
  its most important props.
- Land on the pad → rearm (existing) + **swap birds** when damaged. Instant swap; the
  damaged bird stays parked and visibly damaged for the rest of the mission.
- Pool consequence: all three airframes destroyed or crippled (crashed, or subsystem
  damage beyond a flyability threshold the implementation plan pins) → the FOB is combat-
  ineffective and the mission terminal state reflects it.
- Difficulty tiers per the complexity ladder: portrait gets fewer sites and gentler
  envelopes; enemy skill stays orthogonal to cockpit complexity.
- Radio integration: engagement calls, bird-swap acknowledgement.

**Owner-flight acceptance for the slice:** flying fat and high over the river gets you shot
down; masked ingress lives; a tail-rotor hit forces a flyable emergency; swapping birds at
Ember keeps the sortie going.

## Explicitly out of scope for this slice

MANPADS; any repair mechanic; the mission director (patrols/ambushes/convoys); corridor
scenery; infantry rendering as characters; multiplayer. The roadmap after this slice:
mission director → corridor scenery at BF:V density → crewed co-op on the Build 310 arena
infrastructure → stylized infantry. Each gets its own brainstorm.

## Verification doctrine carried forward

Rendered-frame QA before shipping visual work; live-page flight QA via
`window.__gunsOnlyCobraAuthority`; adversarial review (Codex scoped to web files — its
sandbox has no .NET 8 — plus Cursor with the test files IN the bundle); control experiments
on every new gate; stamp last after a STATUS.md reconcile.
