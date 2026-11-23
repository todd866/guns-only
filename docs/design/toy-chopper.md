# Toy Chopper — co-op couch game design

Dad flies, his 6-year-old is the gunner. One toy helicopter, two pads, split screen on the TV.
Everything is toys: foam darts, water balloons, paint splats, pops and confetti. Nothing explodes,
nothing dies, the gunner cannot lose. The cast, phrases and audio come from the Toy pass
(`web/wwwroot/render/toy/toy_pass.js`); this game composes them, it does not retune them.

## The three loops

**30-second core loop.** Fly → spot → line up → gunner pops → collect → next. The pilot banks the
chopper so a toy drifts into the door arc; the gunner's reticle soft-locks; a dart goes *thup*,
the toy pops with a paint splat, a micro hit-stop and a rumble pulse; a star-bit sparkle floats up
and auto-collects; the announcer calls the next one ("Good splat! More on the left!"). The first
pop happens within 10 seconds of take-off — warm-up balloons float beside the launch pad.

**5-minute mission loop.** Brief (one caption, skippable) → calm approach with easy static pops →
build: movers arrive in waves → climax: a set piece (fort reveal, train bridge, boss phase) →
reward: confetti, star tally for *both* players, sticker drops, one unlock tease. Par 3–5 minutes.

**Session loop.** A campaign map of the toy world (backyard → playroom → night sky). Missions sit
on a ladder: earning any star opens the next node. Stars accumulate toward unlocks (chopper paints,
gunner toys); stickers are one-off achievements shown on the results card and the map. A session is
"one more mission" until bedtime; progress persists in localStorage.

## Cast

**Good guys: classic green plastic army men** (`GOOD_GUYS`). The squad, the friendly pilots, the
toy train crew. Splatting your own army man never fails anything: he falls over stiff in the
classic plastic pose, the toy ambulance (siren, flashing light, wobbly wheels) trundles out, a
stretcher bearer loads him, and he hops out at the spawn good as new while fresh army men march
out to top up the squad. Caption deadpans: "Medic! ...He's fine." Friendly splats are counted in
telemetry for laughs, never penalised. (Timeline: `friendlySplatFrame`, `TOY_REJOIN_S`.)

**Bad guys: the rogues' gallery** (`BAD_GUYS` — look/behaviour/counter already defined there):
wind-up robot (splat the brass key), grumpy jack-in-the-box (hit the lid before the pop), rubber-band
sniper (catch it mid-stretch), evil teddy (water balloon soaks it), plastic dinosaur (feed the open
mouth), RC-car gang (paint the wheels), balloon-animal blimp (one dart pops it), tin soldier in the
wrong colour (bonk the tall hat), spinning-top swarm (wait for the wobble), toy-chest boss (paint
the lid shut). Ground props: balloon towers, cardboard forts, toy-block trucks (`GROUND_TARGETS`).
Each type reads at a glance: distinct silhouette, colour, motion tic, and a one-line counter the
announcer teaches the first time it appears. Generic archetypes only, no licensed characters.

## Mission types

- **Assault** — pop a fortified toy camp (balloon towers screen a cardboard fort).
- **Escort** — the toy train or the army-man squad walks a path; keep wind-up toys off it.
- **Rescue** — army men stranded on the roof/sandpit; pop their captors, hover, winch them up.
- **Defend the sandcastle** — waves converge on a fixed point; between-wave breathers.
- **Boss** — one big inflatable (dinosaur or blimp) with popping phases and strafing toy planes.

**The slice ships three:** *Pop the balloon fort* (assault), *Escort the toy train* (escort),
*Blimp boss* (boss). Pacing per mission: calm (static balloons, 30–60 s) → build (2–3 waves of
movers) → climax (set piece) → reward (confetti + stars).

## Split screen and controls (two 8BitDo pads, Chrome "standard" mapping)

Join via the same START ▶ card as RC Odyssey (`rc/join.mjs`). Menus are pad-driven
(`rc/gamepad-menu.mjs`); no mouse or keyboard anywhere. TV deadzones/curves from
`render/split/pad_flight.mjs`.

**P1 pilot (left half, chase cam, smoothed for TV):** left stick cyclic, RT/LT collective
up/down, d-pad ◄ ► pedal turn, **LB hold-steady** (hover-stabilise for clean shots). The pilot
sees the gunner's current lock as a diamond marker and banks to bring it into the door arc.

**P2 door gunner (right half, camera at the open side door, swings with the aim, feels the
chopper's motion):** left stick aims — fast with gentle acceleration, limited to the door's arc;
soft lock-on snaps to the nearest toy near the reticle. **A** foam-dart cannon (thup-thup,
generous hit boxes, paint splats), **B** water-balloon lob with a visible arc preview, **RB**
short binocular zoom. A small arrow shows where the pilot is heading. When the gunner's pad sits
idle or he's struggling, the controller drawing appears (`rc/pad-art.mjs` + `rc/coach.mjs`).

## Difficulty, fairness, juice

The gunner **cannot fail**. Hits on the chopper only make it wobble and drop one carried balloon;
no mission ends early, no lives, no game over. Dad's flying is the difficulty dial: higher, faster
and more banked means harder shots. Soft lock and generous hit boxes keep a 6-year-old's accuracy
rewarding; a miss costs nothing but the next *thup*.

Juice list (all in the slice): hit-stop micro-pauses on big pops; screen-space hit markers; pad
rumble on hits (`gamepad.vibrationActuator`, skipped when absent); paint splats that persist a
while; confetti on mission clear; cheerful announcer captions that call targets and celebrate
("Good splat! More on the left!"); toy audio cues from `AUDIO_CUES` (thup, pop, splat, siren).

## Rewards and replayability

Stars: each player earns 1–3 per mission (gunner: pops and accuracy, never below 1; pilot: time vs
par and steadiness). Stickers: first pop, sharpshooter, balloon buster, train guard, blimp popper,
medic magnet (3+ friendly splats — the joke reward), ace pilot. Unlocks by total stars: chopper
paints (sunburst, shark smile), then gunner toys — **bubble cannon** (slow, huge, wobbly bubbles)
and **confetti mortar** (pure celebration, pops everything cosmetically). Replayability comes from
chasing 3-star runs, sticker hunting, swapping seats, and the unlock ladder; missions re-roll wave
composition from the roster so a replay isn't identical.

## Second mode (separate job builds it): Toy Blimp Gunship

The AC-130 idea, as toys. A toy blimp/cargo plane circles the backyard **at night**; the gunner
looks straight down through a glowing toy-camera view — high-contrast, stylised (crayon-outline
glow, NOT thermal-realistic). Three toy weapons on a wheel: dart gun (fast), water-balloon drop
(area splat), confetti cannon (celebration burst that also pops balloons). Objective: protect a
squad of green army men walking to a goal while wind-up toys and balloon towers try to stop them.
The pilot flies the orbit in split screen — tighter/wider, faster/slower — and drops supply crates
on the squad's path. Lessons taken from the classic set pieces: the vehicle flies a mostly
authored path so the gunner just shoots; constant target-rich scenes with unmistakable friend/foe
marking (army men glow green, bad toys glow amber); a radio voice in captions calling targets and
celebrating; escalating waves; protect-the-friendlies stakes. Friendly splats get the ambulance,
as always. No realistic violence, no people.

## Telemetry

Mission start/end, duration, gunner shots/hits/accuracy, pops by target type, time from a type's
first spawn to its last pop (which toys take longest), friendly splats, hold-steady usage. Local
summary is pure (`missionTelemetry`); upload rides the existing RC recorder vocabulary
(`activity_start`/`activity_end`) so the shared event table is untouched.
