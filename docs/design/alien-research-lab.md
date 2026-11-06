# The Deep Time Lab (the Fossil Vault): the way into the dark world

Status: design only (6 Nov 2026). Nothing built. Owner: Ian. Build later; this records the
intent so it can be picked up cold.

## One line

Under the Cold-Weather Test Hangar is the base's real secret: a fossil dig that broke through
into the past. The base built a lab around **the Seam**, a crack where it is still dinosaur
time on the other side. Test day, the Seam bursts (**the Breach**), the lab floods with the
past, and the toys go **down** through it into the dark world.

## Cover story: USAF secret squirrel (Ian, 6 Nov 2026)

- On paper: **Detachment 3, Saucer Springs AFB**, the "Cold-Weather Test Squadron". The snow
  race at the Cold-Weather Test Hangar is the public face.
- In reality: **Program COLD SEAM** (classified). The Seam, the Vault, the lab and Hangar Zero
  all belong to it.
- Telltale details everywhere: badge readers, "NEED TO KNOW" doors, a visitor sign-out
  clipboard, redacted whiteboards (black bars over diagrams of RC cars), a brass plaque
  reading "This facility does not exist", Det 3 squadron patch (a toy saucer over a
  snowflake), coffee mugs stencilled COLD SEAM, a robot security guard who checks
  "clearances" (a sticker you earn).
- The announcer is a Det 3 duty officer: clipped military radio voice before the accident,
  very much less clipped after.

## Lore (Ian, 6 Nov 2026: "this is how you get to the dark world")

- Decades of fossil digging under the Cold Lab hit a pocket where the rock is warm, there are
  jungle sounds, and the footprints are fresh. The base sealed it, and the "Cold" Lab exists
  to keep the Seam cold and stable.
- The lab studies both sides: the present's aliens (the good aliens who woke the toys, and
  the bad aliens' signal) and the past (dinosaurs, western, blocky ground). The Seam is why
  the bad aliens are interested.
- Test day, the toys are the first things sent through on purpose. The holding machine
  overloads and the Breach opens.
- After the level, a stable **Seam Gate** stays in the Vault: the main crossing between the
  light and dark worlds. The dig (open-world/dig.mjs) stays the secret way across. Dark and
  light worlds remain separate worlds crossed by portals (owner ruling 31 Oct 2026).

## Why here

- Jake (6) ignored the N64 classics on the TV and only wanted RC Odyssey (6 Nov 2026). The lab
  is the next big "place" for him.
- The lore already points here. The intro cards say good aliens woke the toys and bad aliens
  are signalling "from the other side". The lab is where the base has been studying both.
- The Cold Lab venue (`coldlab`, pos [2040, 0, -690], open-world/expansion-venues.mjs) is a
  snow race today. Its insulated hangar, cooling pipes and alien snow sculptures already read
  as "something's kept cold in there".

## Shape of the experience (about 20–30 minutes first time, replayable in about 8)

1. **Arrival.** The hangar has a freight lift and a tram platform. On the first visit the
   doors are shut: "Authorised toys only". The key is earned elsewhere (a badge count, or
   finishing the Old Silver Mine), so the lab is a reward.
2. **Ride in, on rails.** You can only look around. A slow tram goes down a long sloped
   tunnel. The lab's daily life plays out behind glass: robot scientists, a crystal conveyor,
   a cafeteria, a specimen hall with sleeping aliens in tanks, a loudspeaker voice with dry
   jokes. This builds the place before anything breaks. Skippable after the first time.
3. **The test.** The tram stops at the Test Chamber. Your RC car is the test vehicle. You
   drive it onto the pad yourself, which is the only input. Robots count down, the beam
   powers up and the crystal is lowered, then it goes wrong: power surge, red emergency
   light, alarms, and portals ripping open around the chamber. A short blackout.
4. **Wake up in the wreck.** The lab is changed. Lights are dead or flickering, the tram is
   off its rails, corridors have collapsed into ramps, and pipes vent steam and cold.
   Portals flicker in and out. "Get to the surface."
5. **The descent.** Five zones, each teaching one form or idea (below), going DOWN through the
   lab. Each level is more overgrown: concrete and steel, then vines through vents, then sand
   pouring down stairwells, then ferns, mud and amber light.
   On the ride in, through a slit window: **Hangar Zero**, a sealed bay where Det 3 has spent
   years reverse-engineering a **recovered flying saucer**, half under tarps, with scaffolding
   and robots on clipboards.
6. **Through the Seam.** The last door opens onto the dark world: daylight, dinosaurs, the
   blocky past. A stable Seam Gate stays behind. Returning through it lands you back in the
   Vault.

## The reward: the saucer (Ian, 6 Nov 2026: "it should eventually unlock a flying saucer that you can fly")

- After the first trip through the Seam and back, Det 3 "loses" the saucer to you: Hangar
  Zero's roof opens and it's yours.
- A new vehicle beside car, robot, board and plane: **hover** (holds height, slides like an
  air-hockey puck), **climb/dive**, **tractor beam** (pick up and carry things: crates,
  pumpkins, a willing friend's car in co-op), **cloak shimmer** for a few seconds.
- **It goes anywhere** (Ian, 6 Nov 2026): the light world, the dark world, the alien-world
  courses (open-world/alien-world.mjs), venues and interiors big enough to fit. No zone
  is closed to it.
- It flies **between worlds**: the Seam Gate is big enough for it, and in the dark world it's
  the only thing that flies apart from the winged dinosaurs.
- Controls on the pads: same layout as the plane (LB/L to take off and land, sticks to fly),
  bottom face = beam on/off, top face = cloak. The forms bar gains 🛸.
- Tech: a new flight profile in physics/flight (hover mode with altitude hold) and a saucer
  body in vehicle-bodies.js. The tractor beam reuses pickup/attach logic (bowling and delivery
  already carry things).
- Gate: unlocked after the first round trip through the Seam; summon from the Vault or
  Hangar Zero; later from anywhere via the Places menu.

## Zones (top to bottom; read the table as the order you meet them)

| # | Zone | Teaches | Hazards and set pieces | Co-op hook |
|---|------|---------|------------------------|------------|
| 1 | Test Chamber ring | Drive in the dark; headlights | Rotating debris, sparking floor plates (timed) | One holds a lever to stop the turntable |
| 2 | Specimen Hall | Walk (robot form) through gaps | Tanks cracked open, sleepy aliens wake and follow you (harmless, they bump and giggle) | One distracts the aliens, the other sneaks past |
| 3 | Cryo Storage | Skate (board form) on ice | Ice floors, cold vents that freeze you for 2 s, sliding crates | Push a crate together to bridge a gap |
| 4 | Reactor Shaft | Fly (flight form), vertical | Rising updraft column, rotating shields, power cells to collect | One powers the fan from a switch, the other flies the shaft |
| 5 | The Seam | Everything, timed | A collapsing gantry down into the Breach while the past pours in (sand, vines, a curious dinosaur); the Seam narrows | Both must cross; the gate waits for the second player |

Each zone ends at a **checkpoint terminal**, a robot scientist sheltering behind a desk. Reaching
it rescues them and saves progress, and they ride along on your car (stacking robots on the
roof is the visible score).

## Creatures (kid-safe, no gore, nobody shoots people)

- **Hoppers:** small jumpy aliens that latch onto your car and slow it. Shake them off with
  drift, hop or fire, and they bounce away squeaking.
- **Floaters:** jellyfish-like drifters that zap (screen flash, 1 s stun). They glow before
  zapping.
- **The Big One** (end of zone 4): a huge, slow alien wedged in the reactor shaft. You don't
  fight it. You power three fans that blow it back through its portal. It waves goodbye.
- **Good aliens:** small light-spirits (the ones from the intro) that appear near puzzles and
  point the way. They're the hint system, standing in for text.

## Forms in the lab

All four existing forms carry over, and each zone favours one:
- 🚗 car: default, headlights on in the lab.
- 🚶 robot: fits through vents and gaps; can press buttons and carry power cells.
- 🛹 board: fastest on ice; can grind pipes.
- ✈️ fly: only in tall spaces (reactor shaft, specimen hall atrium).
Player 2 can't use robot form yet (see the split-screen notes); give player 2 a board route
until P2 robot exists.

## The look

- Concrete, steel and safety yellow, with cold blue lab light. After the accident it turns to
  red emergency light and green portal glow.
- Readable at TV distance: big shapes, strong silhouettes, colour-coded doors (yellow is open,
  red is locked, green is a portal).
- The lab is lived in. Mugs, whiteboards with diagrams of RC cars, a vending machine, lab
  coats on hooks, a staff photo of robots. These are the details that make it feel real.
- Signage is in the house style (short, funny, readable by a 6-year-old): "DO NOT LICK THE
  CRYSTALS", "Test 7 today!", "Lift → Surface".

## Sound

- Loudspeaker announcer, as on-screen captions plus a beep. It's chatty before the accident
  and panicky after.
- A low hum that changes after the accident, alarm loops, portal whooshes, aliens giggling,
  robots cheering when rescued.
- All through the existing SoundKit (audio.js). Synthesise first, recordings later.

## Tech plan (fits the current code)

- **Interior:** build it like the Old Silver Mine adventure interior (search `adventure`,
  `mineWorldPos`, `underground` in main.js), in its own metre frame below the Cold Lab so
  open-world streaming isn't involved. Modules: `open-world/annex.mjs` (pure layout, zone
  graph, state machine, checkpoints, with node:test tests), `open-world/annex.js` (three.js
  build: merged static geometry per zone, instanced props and robots).
- **Ride in:** reuse the cinematic machinery in open-world/intro.js (letterbox, cards, camera
  rail). The camera follows a spline; left stick looks around within a clamp.
- **The accident:** a scripted timeline (state machine in annex.mjs) driving lights
  (emissive and colour swaps), shake (existing camera shake if present, otherwise a small
  offset), portal discs (animated shader-free rings), and audio cues.
- **Lighting:** dark zones need the car's headlights. Add a spot light to the player car only
  while underground, plus emissive strips for wayfinding. Keep the light count low.
- **Split screen:** works as is (two cameras, one scene). The lift and the co-op doors use
  both cars' positions: `s.car` and `race.rivals[0].session.car` when split is on.
- **Controls:** no new buttons. Morph (X/Y), fly (LB/L), use (top face) and fire (bottom)
  cover every interaction. The controller-drawing coach shows the needed form when a player
  is stuck at a zone gate.
- **Saves:** checkpoint index in localStorage (`guns-only.rc.annex.v1`), like other progress.
- **Telemetry** (existing API and the home-TV pad log): annex_enter, ride_skipped,
  accident_seen, zone_enter/zone_clear (with time and deaths), checkpoint, creature_latched,
  coop_switch_used, surface_reached. The audit (`~/.local/state/rc-split/audit.py`) should
  report time per zone and where players stall.

## Build stages

1. Ride in and the accident, ending in the dark chamber with a "Get out!" callout (playable
   slice).
2. Zones 1–2 with checkpoints and hoppers.
3. Zones 3–4, The Big One.
4. Zone 5 Seam finale, the dark-world arrival, the stable Seam Gate.
5. Hangar Zero and the flyable saucer (hover, beam, cloak, crossing the Seam).
6. Polish: Det 3 props and signage, announcer lines, sound, first-visit gating.

## Open questions

- Gate: badge count, Old Silver Mine finish, or open from the start? (Jake wants it now.)
- Saucer in split screen: one pilot with the other riding in the beam, or two saucers?
