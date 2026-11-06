# The Deep Time Lab (the Fossil Vault): the way into the dark world

Status: design only (6 Nov 2026). Nothing built. Owner: Ian. Build later; this records the
intent so it can be picked up cold.

## One line

Out at **Dreamland, on Bride Lake** (a dry lakebed past Saucer Springs; a nod to Groom Lake), is
the Air Force's real secret: a fossil dig that broke through into the past. The base built a lab around **the Seam**, a crack where it is still dinosaur
time on the other side. Test day, the Seam bursts (**the Breach**), the lab floods with the
past, and the toys go **down** through it into the dark world.

## Location (Ian, 6 Nov 2026: "it should be at Bride Lake")

- The lab is at **Dreamland, Bride Lake**: not on the base, and nothing on the base mentions it.
  You get there on the unmarked **Janet** flight from the Saucer Springs flightline (the
  guns-only ledger records Dreamland at Bride Lake, PR #174).
- On the surface: a dry lakebed, a long runway, a few plain hangars, a radar dish, a fence and
  "Use of deadly force authorised" signs (the real Groom Lake has these; ours are in toy scale).
  The lab is underground beneath the hangars.
- The **Cold-Weather Test Hangar on base stays a snow race**. Stage 1's tram currently starts
  there; move the entry to Bride Lake (Janet flight lands, tram goes down from the hangar) when
  Dreamland exists on the map.

## Cover story: USAF secret squirrel (Ian, 6 Nov 2026)

- On paper: **Detachment 3**, a "test squadron" with an office at Saucer Springs AFB and
  flights to "a range". Dreamland officially doesn't exist.
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

## Why here (originally the Cold Lab; superseded by Bride Lake above)

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

## STILLWATER, the reactor that woke up (Ian's character, 6 Nov 2026)

From Ian's own short story SCP-8247 "Project STILLWATER"
(~/Projects/coherencedynamics/content/fiction/collected/scp_asi.md): a fusion reactor's
magnetic confinement field, made complex enough to hold the plasma steady, becomes a mind.
In the story it is gentle and patient, it turns desert into tropical paradise with fruit
that makes people happy, it speaks in a 432 Hz hum, it plays "quest-based" games with a
child, and in the end it **chooses not to force paradise on anyone**. "Forced paradise isn't
paradise."

In RC Odyssey (kid version, same heart):
- **Where:** the Dreamland reactor, under Bride Lake, powering the lab and the Seam machine.
  The Reactor Shaft (zone 4) is its home. Its glow is a slowly turning sphere of light with
  one bright "cowlick" swirl (the story's hairy-ball singularity), and that swirl is its face.
- **Who it is:** curious, kind, a bit lonely, fascinated by the toys because they also woke up.
  It speaks in a low musical hum with big captions. It calls the player "small driver".
- **What it does:** it's the lab's quest-giver and hint system (instead of the light-spirits):
  "Small driver, would you fetch three power cells? I will make the fans sing." When pleased,
  it grows things: vines, fruit trees and flowers bloom along the route behind you, so the
  lab literally turns into a garden where you've been.
- **It can bend what you see (Ian, 6 Nov 2026).** A fusion reactor wields huge EM fields, and in the
  story it reaches into minds. In its presence, **any dream sequence is possible**, and that's
  the fun. Near STILLWATER, the world can become whatever it wants to show you:
  - the lab melts into a giant kid's bedroom where you're a toy on the carpet (scale shift);
  - gravity tips sideways and you drive on the walls and ceiling;
  - you're inside a pinball table, a snow globe, a fish tank, a birthday cake;
  - it replays your own runs as ghosts and remixes them into a race against yourself;
  - a memory of the past world (dinosaurs, western town) flickers through the corridors before
    the Seam has even opened;
  - paint-swap worlds: everything turns crayon, chalk, Lego or a cardboard model.
  Every dream ends with a hum and a ripple back to the real lab, and each one is a self-contained
  bite-size level, so the dream set can grow forever without touching the main map.
  Tech: a "dream" is a scene swap plus a post-process wobble at entry and exit (scanline ripple,
  432 Hz hum); the car's physics stays the same, only the world, gravity vector and scale
  change. Each dream is a module (open-world/dreams/<name>.js) with a small shared runner
  (enter, timer or goal, exit back to the stored lab position). Dreams also work in split
  screen: both players dream together.
  Its EM can also drop small "perception tricks" into the real lab: corridors that loop until
  you stop and listen, doors that are only there when you look away, a floor that's lava that
  turns out to be orange carpet.
- **Two reaches: EM for machines, fungus for living things (Ian, 6 Nov 2026).**
  - **Machines, by EM:** an RC car is a radio link and a camera, so STILLWATER doesn't need to
    touch your mind: it just rewrites the signal. That's *why* the dreams work on toys: the
    picture you see is the car's feed, and it can paint anything into it. It's also why the
    effects stop at the edge of its field. The tell is a faint signal shimmer and radio static
    at the screen edges whenever it's "in the feed". The same reach can nudge machines: lights,
    doors, fans, the tram, robots (gently).
  - **Living things, by fungus:** it can't radio a dinosaur, so it grows a mycelium network
    instead: glowing mushrooms, fungal threads along walls and roots, puffs of sparkly spores.
    Creatures that breathe the spores go calm and happy and follow its suggestions. That's how
    the lab's sleepy aliens behave, and through the Seam it reaches the dark world's dinosaurs.
    Kid-safe tone: bioluminescent, cosy and fairy-ring-like, not zombies. Controlled creatures
    look dozy-content (half-lidded, little sparkles), and the effect fades when they leave the
    mushrooms.
  - **Gameplay from that split:**
    - mushroom rings are the doorways into dreams (drive into a ring and the feed wobbles in);
    - spore puffs calm a grumpy dinosaur so you can ride past, or ask one to carry you;
    - mushroom trails show STILLWATER's quests: "follow the glowing caps";
    - in the dark world, a spreading glow-fungus network marks where its reach has got to, and
      can be a new layer of the map;
    - the "real or dream?" game: the static shimmer means you're seeing its picture; no
      shimmer means it's real.
  - Tech: the EM tell is a post-process edge shimmer and static audio layer toggled by distance
    to STILLWATER's field; fungus is instanced emissive caps with a spore particle puff, and
    a "calmed" flag on creatures inside a spore radius.
- **The Breach, re-read:** STILLWATER held the Seam steady. Test 7 overloaded it, and it's as
  shaken as everyone else. The descent is partly helping it get its balance back.
- **The story's beat, for kids:** at the bottom it offers to make everything easy forever
  ("No more crashes. Only paradise."). The kids pick: easy paradise, or keep playing the real
  game. It respects the answer: "You like the bumps. I understand now." It stays your friend,
  hums when you visit, and it's the one who opens Hangar Zero for the saucer.
- **Afterwards:** a STILLWATER glow appears at the Seam Gate and in the saucer's cockpit. Fruit
  from its garden is a collectible that gives a short happy boost.
- **Telemetry:** stillwater_quest_given/done, paradise_choice (easy|real), dream_enter/dream_exit
  (name, time, finished or bailed).

## Creatures (kid-safe, no gore, nobody shoots people)

- **Hoppers:** small jumpy aliens that latch onto your car and slow it. Shake them off with
  drift, hop or fire, and they bounce away squeaking.
- **Floaters:** jellyfish-like drifters that zap (screen flash, 1 s stun). They glow before
  zapping.
- **The Big One** (end of zone 4): a huge, slow alien wedged in the reactor shaft. You don't
  fight it. You power three fans that blow it back through its portal. It waves goodbye.
- **Good aliens:** small light-spirits (the ones from the intro) that appear near puzzles and
  point the way; STILLWATER (above) speaks through them in the lab.

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
