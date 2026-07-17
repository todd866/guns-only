# Shared brief: jet-drone family derivation (mission → design → control law)

You are deriving ONE airframe for a guns-only jet-drone dogfight game. Everything below is
established and must be respected. Derive from first principles; show arithmetic.

## The world (established, do not re-litigate)

- **Guns only, no missiles of our own.** Derived: (1) cost-exchange — a $2M interceptor vs a
  $50k drone loses the war economically even when it wins; you need a ~$10/shot weapon;
  (2) magazine depth — 2-4 missiles vs hundreds of rounds; (3) EW — mature counter-seeker
  jamming/spoofing collapses missile Pk, and you cannot jam a bullet. Passive EO/IR + gun is
  the kill chain that survives. Facing INCOMING missiles is allowed; we just never carry them.
- **Fixed forward gun** (deliberate design choice: a gimbal would delete BFM entirely; also
  mass/cost/ammo-feed/recoil-through-CG on an attritable). Do not propose a gimbaled gun.
- **Unmanned.** No pilot: no physiological G cap, no life support, no ejection seat, no cockpit.
- **Cheap attritables invert multirole logic.** A $100M manned jet must be multirole to amortise;
  a $50k drone should be a NARROW SPECIALIST. Cost is a first-order design driver.
- **The player is the onboard tactical AI.** The drone's own flight AI flies airmanship
  (envelope-protected); the player is the tactical layer. Holding the pull key = the flight AI's
  tactically-appropriate G; holding an override key = permission to exceed envelope protection
  toward the aero/structural limit ("max G, at your own risk").
- **Delivery matters and is a design axis.** Balloon loft to ~60,000 ft then cut loose is
  available. This DECOUPLES "get to the fight" from "win the fight": a balloon-delivered
  airframe needs neither climb performance nor cruise range, freeing that mass for wing/gun.
- **Threat ladder:** Tier 0 junk drones (Shahed-type: slow, non-maneuvering, defenceless);
  Tier 0.5 enabler strike (tanker/AWACS — huge, undefended, cannot dodge); Tier 1 peer
  gun-drones (the core BFM fight); Tier 2 a manned 4th/5th-gen whose missiles are already spent.

## Physics established (from the live sim; reuse these methods)

Current placeholder airframe (Sabre-like, NOT a target — it's the reference we measured):
`m=6900 kg, S=26.8 m², T=26300 N (T/W 0.39), CD0=0.0180, k=0.083 (AR 4.76, e≈0.80), CLmax=1.10`

Measured from it (ISA, 10k ft = 3000 m):
- **The wing binds before the structure at all fighting speeds.** aero-max G = q·S·CLmax/W:
  7.9G @ 389 kt, 11.4G @ 467 kt, 15.5G @ 544 kt. **20G would require 618 kt (M~0.97).**
  → Unmanned buys DURATION at the aero limit, not peak G. Structure ~12G is the honest build
  number; above that is mass you cannot use.
- **Sustained G is thrust-limited** (solve CD0 + k·CL² = T/(q·S)): only **3.6G** at 467 kt for
  T/W 0.39, vs 11.4G the wing could make.
- **A max-aero pull eats itself:** riding CLmax from 467 kt → 11.4G@t=0, 9.5G@2.5s, 8.2G@5s
  (−72 kt), 6.4G@10s, 4.5G@20s. Ps at 11.4G = −226 m/s; drag = 4× thrust; induced = 6× parasite.
  Max-G buys 122° of turn in 5 s vs sustained's 40° — 3× the angles for 72 knots.
- **Altitude collapses G:** at 30k ft aero-max is only 5.9G and sustained 1.8G (thin air, low q).
- **T/W governs whether the energy game exists at all** (sustained G vs the wing's 11.4G):
  `0.40→5.2G (gap 6.2G, strong tension) · 0.50→6.3G (5.2G) · 0.75→8.4G (3.0G, weak) ·
  0.90→9.4G (gap 2.0G — energy game nearly DEAD, hard turns stop costing anything)`.
  **If sustained ≈ aero limit, the energy game dies.** Preserve the tension or justify killing it.

## What to deliver (be concrete, show arithmetic, flag assumptions)

1. **Mission** — concrete: what does it kill, launched/delivered how, from where, engagement
   duration, success criterion, rough unit-cost target and why.
2. **Design derived from that mission** — mass budget, wing area + AR + loading, T/W and why,
   CLmax, structural limit, gun (calibre/rate/rounds/mass) and why, sensor + gimbal, fuel and
   endurance, delivery, silhouette in two sentences. Every number must trace to the mission.
3. **Envelope, computed** — corner speed; sustained G; aero-max G; turn rate/radius at 2-3
   representative conditions (include one at altitude); climb/ceiling if relevant; Mach limit.
   Use the methods above. State the sustained-vs-wing gap and whether the energy game survives.
4. **Control law implications** — what should THIS airframe's flight AI do by default? What is
   "tactically appropriate G" for it and how does that differ from the other archetypes? What
   does the override (max-G) buy it, concretely? What does its detent/valley feel like?
5. **Matchup** — where it sits on energy-vs-angles; what it beats; what beats it; the one
   mistake that kills it.
6. **Honest flags** — where your derivation is weak, assumed, or where cost/physics conflict.

Be brutal about cost. Be brutal about whether the mission actually justifies the airframe.
If the mission implies an airframe that is bad for the GAME (e.g. kills the energy tension,
or makes BFM irrelevant), say so plainly — that is a finding, not a failure.
