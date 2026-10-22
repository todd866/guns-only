# Area 51½: design bible

Living document, started 2026-10-22. It is the single source for the world, models, races and to-do
list. Direction history lives in `area-51-and-a-half.md`; engine and pipeline notes live in
`area-51-build-plan.md`.

## 1. Pillars

1. **A Re-Volt spiritual successor:** rigid-body toy physics, cartoon weapons, shortcuts that
   reward skill.
2. **Forza Horizon 5 for a six-year-old:** one big open world, with races carved out of it. Free
   roam, discovery, collecting.
3. **Nellis during Red Flag:** the real layout at real scale. Every air force's jets are on the
   ramps and aliens fly in the night wave. The lore is background, never spelled out; it's there to
   nerd out on.
4. **Kid mode first:** nothing targets the kid, nothing traps the kid. Big Kid mode is opt-in.
5. **Art rule:** real aircraft, vehicles and weapons, cartoonified like Pixar's *Planes*. They must
   be recognisably the real type, but carry no manufacturer logos or real unit insignia. The base's
   jokes are fictional; its hardware is real.

## 2. The world: Saucer Springs AFB

| Fact | Value | Source |
|---|---|---|
| Layout | Real Nellis AFB layout from OpenStreetMap (ODbL, credit "© OpenStreetMap contributors") | `docs/research/area51-nellis-osm-layout.md`, data in `~/.local/state/area51-nellis/` |
| Frame | Origin 36.241303 N, 115.044658 W; +x east, +y north (glTF: −z north), metres | same |
| Playable world | Airfield and Area III housing: **≈ 5.8 × 6.3 km** (x −2558…3219, y −4036…2291) | OSM |
| World edge | The base perimeter fence (≈ 26 km). Real fences, no invisible walls | OSM |
| Scale | 1:1 world, 1:10 toy car (0.42 m long, top speed ≈ 13 m/s ≈ 47 km/h) | physics |
| Crossing time | Corner to corner at full speed ≈ 8 min (FH5-like). Fast travel to discovered event rings | design |
| Streaming | 256 m tiles: **302 non-empty**. Collision and visuals load around the car | OSM tiling plan |
| Budget | Extruded footprints ≈ 50 k triangles base-wide; the hero art goes into landmarks and props | OSM tiling plan |
| Buildings | 1,176 footprints (0.80 km²) | OSM |
| Roads | 198 km (92 km service, 52 km unclassified, 21 km residential) | OSM |
| Runways | Two parallel, heading 041°: 03R/21L 3,081 × 46 m and 03L/21R 3,076 × 61 m, 307 m apart | OSM |
| Ramps | 1.16 km² of apron; the main ramp is 656,000 m², centred at (+618, −71) | OSM |

### Zones (real positions in metres; ★ = in OSM; ✎ = placed by hand)

| Zone | Where | What's there | Events carved out |
|---|---|---|---|
| **Main Gate** ★ | (−607, +29) | Security Forces "Defenders" booth, a gate-guard jet park (cartoon F-105, F-4, F-16 on pylons), "SAUCER SPRINGS AFB" sign | Free-roam spawn; "Gate Guard" time trial |
| **Area III family housing** ★ | (−1285, +1132), 1.5 km² | Stucco ranch houses, xeriscape, cul-de-sacs, PCS pods, playgrounds (29 base-wide) | **Liberty Loop** (existing track); "Paper Route" checkpoint run |
| **Hospital** ★ | (−412, +507) | Big landmark, ambulance bay | Through-route only |
| **BX and shoppette** ★ | (−546, −791) | Big-box BX, food court, Starbucks-style café, Class 6, car park | **The BX** (existing interior); "Parking Lot Scramble" |
| **School** ★ | near Lomie Heard Elem. (−1228, −718) | Saucer Springs Elementary: gym, cafeteria, playground slide | **The School** (existing interior) |
| **Gym and pool** ★ | Warrior gym (−1201, −1224), McClintock Pool | Gym floor, empty-pool bowl (a skate spot!) | "Deep End" stunt bowl |
| **Main flight line, the Red Flag ramp** ★ | ramp (+618, −71) | **Rows of real fighters from every Red Flag nation**, tugs, MJ-1 "jammer" carts, fuel trucks, a tower | **"Ramp Rat"** slalom under wings; "Hot Pit" pickup race |
| **Runways** ★ | 03L/R, 041° | 3 km straights | **Runway Drag** (zoom-only drag race); the night wave flies overhead |
| **Hangar row** ★ | six hangars near (+380, −400) | Open hangars, a maintenance bay, the existing hangar-slice art | "Hangar Hop" through-the-doors route |
| **Thunderbirds-style demo hangar** ✎ | by the ramp | Hangar, a ramp of demo jets in a generic red-white-blue (no real logos) | Formation-follow mini-game (later) |
| **Petting Zoo** ✎ | east side, off the flight line | **Captured enemy hardware:** MiG-21, MiG-23, MiG-29, Su-27, SA-2 and SA-6 launchers, a Flat Face radar. The radars swivel to track you | Free-roam landmark; "SAM Dodge" hide-and-seek |
| **Golf course (Sunrise Vista)** ★ | (−330, −2776), 0.87 km² | Fairways, greens, sand traps, water hazard, carts | **Car Golf** (nudge a big ball into the hole); "Fairway Rally" |
| **Skatepark** ✎ | by the gym or a park | Bowls, half-pipes, quarter-pipes, rails, funbox | **Free-roam stunt park** with coins on the lips |
| **Roller rink** ✎ | rec centre | Polished wood oval, mirror ball, disco lights, rental counter | **Rink Drift** (night race, everything slides) |
| **Bowling alley** ✎ | rec centre | Lanes as drag strips, pins to knock over | **Strike!** mini-game; lane drag |
| **Baseball diamond** ★ | one of the 11 pitches | Dirt infield, dugouts, bleachers | **Round the Bases** sprint |
| **Dirtbike track** ✎ | open desert inside the fence (SE) | Whoops, berms, tabletops, mud | **Whoops** race (Re-Volt style jumps) |
| **Boneyard** ✎ | open desert inside the fence | Rows of retired jets (B-52s, F-4s, C-130s) under covers. **Kicker ramps launch you across their wings: a skill shortcut**, and falling off lands you on the desert road | **Wing Walker** (wing-hop ALT route) |
| **Waterpark** ✎ | by the base pool | Lazy river, splash pads, slides you can drive down, shallow water that slows and sprays | **Splash Down** (slides as jumps, water as slow zones) |
| **Area 51½ (secret)** ✎ | behind an inner fence toward the weapons storage area | Bunker doors, lab, friendly aliens in tubes, a saucer under a tarp | Unlocks after every specimen is found; **night race** |

## 2a. Meme-page humour (from the owner's follows, 2026-10-22)

Sources: the bios and captions of 12 USAF meme pages (airforce_intel_memes, mudhen_memes,
blind_nordo_memes, remotelypilotedmemes, memelord_usaf, tankertoad87, hercmemes, wso_union_memes,
viper_punk_memes, guardreserve_mafia, fighter_pilots_of_amc, plus amc_memery).

- **House style: a fake meaning for a real acronym.** "AMC = Alcoholics Moving Cargo",
  "ACC = Air Checkride Command". Kid-safe versions for our UI: TDY = "Temporary Duty Yeehaw",
  PCS = "Pretty Cool Speedsters", FOD = "Found Our Doughnuts".
- **"Toad" names:** Tanker Toad, Load Toad. Use it for things like "Ramp Toads" (the rival crew).
- **TDY is a staple** ("Ready for the next TDY ✈️"), which backs the TDY Racing frontrunner.
- **Type tribes:** Mudhen (F-15E), Viper (F-16), Herc ("Prop Gang"), Tankers, WSOs, Guard/Reserve.
  These become rival team names and liveries: Prop Gang, Viper Punks, Mudhen Mafia, Tanker Toads.
- **Office life** for parents: "a meeting that could've been an email", the "non-mandatory
  mandatory Friday pizza party", "Big Blue", vibes-based shot doc, Thirsty Thursday.
  - In-game: the **Non-Mandatory Mandatory Fun Run** (a race), and a pause-menu tip "This pause
    could have been an email".
- **WIC (Weapons School):** the meme calls it "a McDonald's PlayPlace from hell", which makes a
  perfect name for the skatepark: **The WIC PlayPlace**.
- **Brevity and comms:** "Two's Blind", "Nordo", "lost link" (drones), "Hotel Tango".
  - Callouts: "TWO'S BLIND" when you lose sight of the leader; "LOST LINK" when an Afterburner
    runs out.
- Avoid: the drinking and crude jokes (Jeremiah Weed, "ur moms"), politics and named people.
  The game stays kid-safe; parents get the in-jokes.

## 2b. Inspiration (how to borrow without copying)

- **Classic N64 Mario Kart:** borrow track *archetypes*, never copy layouts. Examples: a figure-8
  with an overpass, a beach with tide-pool shortcuts, a big-wheel/funfair circuit, a night
  "rainbow" course. Rebuild each as a Saucer Springs place (a figure-8 through the hangar row; the
  waterpark as the beach). Copying Nintendo layouts or names is out: they are protected, and
  Nintendo enforces.
- **Original Half-Life:** the *vibe* of the secret lab: a test chamber, a tram ride, hazard-stripe
  science, something escaping a containment field, with "Area 51½" as a cheerful kid-safe take.
  No Valve names, creatures or logos, and nothing scary or violent; the aliens are friendly.
- **Pixar *Planes*:** the look of the real hardware (see Art rule).

## 3. Race catalogue (carved from the open world)

Each race is a route on the open-world map: gates, an AI racing line, ALT skill shortcuts, pickups
and coins. All of them use the `GATE_ / AI_ / ALT_<name>_ / PICKUP_ / COIN_` contract. Interior
races (BX, School) stay as separate scenes entered through their doors.

| # | Race | Zone | Type | Length | Signature |
|---|---|---|---|---|---|
| 1 | Liberty Loop | housing | circuit | 406 m | garden-wall ALT |
| 2 | The BX | BX interior | circuit | 317 m | stockroom and runway ALTs |
| 3 | The School | school interior | circuit | 322 m | slide jump, gym drift |
| 4 | Ramp Rat | Red Flag ramp | circuit | ≈ 600 m | under wings, between gear legs |
| 5 | Runway Drag | runway | drag | 400 m | Afterburner only |
| 6 | Hangar Hop | hangar row | point-to-point | ≈ 500 m | through the doors |
| 7 | Fairway Rally | golf | circuit | ≈ 700 m | sand traps, water hazard |
| 8 | Whoops | dirtbike track | circuit | ≈ 450 m | jumps, berms |
| 9 | Rink Drift | roller rink | circuit (night) | ≈ 150 m | all-slippery |
| 10 | Round the Bases | baseball | sprint | 110 m | slide into home |
| 11 | Paper Route | housing | checkpoint run | ≈ 1.2 km | mailbox gates |
| 12 | Grand Tour | whole base | point-to-point | ≈ 6 km | the FH5 showcase race |
| 14 | Wing Walker | boneyard | circuit | ≈ 600 m | kicker jumps across parked wings |
| 15 | Splash Down | waterpark | circuit | ≈ 400 m | slides, splash pads, lazy river |
| 13 | Dreamland Night | Area 51½ | circuit (night) | ≈ 500 m | unlocked last |

## 3a. Cars are toy jets

Owner, 2026-10-22: the cars are real RC buggies (chassis, shocks, knobbly tyres, the antenna)
wearing snap-on toy jet shells that resemble real jets. Shipped first pass (`rc/jets.js`):
player F-16 Viper; rivals F-15 Eagle, A-10 Warthog, F-22 Raptor, Su-27 Flanker. Next: Blender
shells per type, a garage to pick your shell, tribe liveries (Viper Punks, Mudhen Mafia, Prop Gang).
Meme pages to mine: also **Mandatory Fun Day** (owner, 2026-10-22).

## 3b. Furball (battle mode, Mario Kart style)

Owner, 2026-10-22. "Furball" is real slang for a chaotic multi-ship dogfight.
- **Arena:** an open zone, not a lap: the Red Flag ramp, the WIC PlayPlace skatepark, the BX car
  park (for now: free-drive areas of the existing tracks). Crates everywhere, 3 s respawn.
- **Lives:** each car carries 3 kill-mark balloons; any weapon hit pops one. At zero you are shot
  down: spectate, or come back as a ghost that can only drop Hydraulic Leak.
- **Win:** last car flying, or most pops in 3 minutes (timed variant).
- **Kid mode:** rivals DO target the kid here (being hunted is the mode), so to balance it the kid
  gets 5 balloons to their 3, rivals have a longer fire cooldown, and each pop gives 2 s of Chaff
  invulnerability. The race rule (nothing targets the kid) is unchanged.
- **AI:** no item → nearest crate; armed → chase the nearest car and fire on rivalWants; flee
  briefly after being popped.
- **Callouts:** FURBALL! (start), SPLASH ONE (you pop someone), LAST MAN STANDING (two left).
- **Weather balloons** (owner, 2026-10-22): lives are weather balloons on 3–4.5 m tethers, tinted
  in the car's paint, so you can see where everyone is over the rooftops; a popped one sails away.
- **Nose art** (owner, 2026-10-22): each kill paints a star on the spine (every jet, this round);
  lifetime player kills unlock art painted on automatically: 1 shark mouth, 3 lightning bolt,
  6 checkerboard tail, 10 gold stars (`guns-only.rc.kills`). Next: more art (pin-up-free:
  cartoon mascots, mission tallies, squadron tails), a garage to show it off front-on.
- **Cost:** about 2–3% of a week; reuses weapons, pickups, free drive and auto-unstick.

## 4. Weapons and pickups

| Pickup | Brevity code | Behaviour | Status |
|---|---|---|---|
| Boost | Afterburner | +60% push for 1.4 s | built |
| Water balloon | Splash | Lobbed; spins the car it hits | built |
| Oil slick | Hydraulic Leak | Dropped; grip ×0.35 | built |
| Shield | Chaff | Eats one hit for 5 s | built |
| Heat-seeker | Fox Two | Locks the car ahead (red shell) | built |
| Active missile | Pitbull | Hunts the race leader (blue shell) | built |
| Beam-rider | Fox One | Steer the radar beam; the missile chases it | built |
| Unguided rocket | Zuni | Bounces off walls (green shell) | built |
| Missile 3-packs | Winchester | Calls WINCHESTER when empty | built |
| Munitions trailer | Jammer | Carried missiles ride behind you; a hit loses the load | built |
| To design | Flare | Drops behind you; decoys Fox Two | todo |
| To design | Buddy Lase | Paints the leader for everyone | todo |
| To design | JDAM | Lobbed to a marked spot | todo |

Kid mode: no weapon or rival item ever targets the player.

## 5. Brevity codes in the UI

| Code | Use | Status |
|---|---|---|
| Knock it off | pause | built |
| Tumbleweed | recover/unstick | built |
| RTB | exit to the flight game | built |
| Winchester | empty pickup slot / 3-pack spent | built |
| Splash | water-balloon hit callout | todo |
| Fox Two / Fox One | launch callouts | todo |
| Tally / No Joy | rival in sight / lost | todo |
| Bingo | battery low (if batteries come) | idea |
| Sierra Hotel | win | built |
| Mission complete? "Mission accomplished" is not brevity; use "Cleared to land" for the finish | todo |

## 6. Model manifest

The order inside each group is build priority. **Tri** is a per-model budget, LOD0. All models are
original Blender work (scripts in `tools/rc/blender/`), or CC0 kits where noted. Every aircraft is a
real type, cartoonified.

### 6.1 Player and rival cars

| Model | Notes | Tri |
|---|---|---|
| Buggy (hero) remodel | To the approved concept: sculpted amber shell, coil-overs, knobby tyres, wing | 25 k |
| Monster truck | Big tyres, bouncy (Re-Volt "Toyeca" vibe) | 20 k |
| Rally hatch | Low, grippy | 18 k |
| Pickup truck | Base-life truck, toy scale | 18 k |
| Golf cart | Slow and silly; unlocked at the golf course | 12 k |
| Shared: wheels, suspension and paint kit | One set of pivots and liveries ("aggressor" schemes) | — |

### 6.2 Aircraft, the Red Flag ramp (USAF plus allies and aggressors)

F-16, F-15C, F-15E, F-22, F-35A, A-10, B-52 (ramp hero, huge), KC-135, E-3 AWACS, C-17, EA-18G,
Typhoon, Rafale, Gripen, Tornado, Su-27 or F-16 aggressor schemes, MQ-9. **≈ 17 types.** Instanced,
in aggressor and national-style colours without real insignia. Budget 8–15 k triangles each, plus
impostors for the far rows.

### 6.3 The Petting Zoo

MiG-21, MiG-23, MiG-29, Su-27 (static); SA-2 launcher with missile, SA-6 TEL, ZSU-23-4, a "Flat
Face" radar (it swivels), a "Fan Song" radar (it swivels). **≈ 9 models**, 6–12 k triangles each.

### 6.4 Gate guards and the museum

F-105, F-4, F-100, F-111, F-117: **5 static**, on pylons, 8 k each.

### 6.5 Ground vehicles (flight line and base life)

MJ-1 "jammer" munitions loader, tow tug, R-11 fuel truck, P-23 crash/fire truck, Security Forces
pickup, school bus, white Janet-style 737 (at the Dreamland end), shuttle bus, golf cart, pickup and
sedan civilian cars (parked). **≈ 10 models**, 4–10 k each.

### 6.6 Buildings kit

Driven by OSM footprints: an extruded generic building with desert stucco and roof variants.
Landmarks are hand-built:

- control tower
- hangars (generic plus demo hangar)
- BX exterior
- school exterior
- gym
- hospital
- chapel
- rec centre (rink and bowling)
- Area 51½ bunker
- gate booth
- water tower

**≈ 11 landmarks.**

### 6.7 Leisure kits

- **Skatepark:** bowl, half-pipe, quarter-pipe, rail, funbox and stairs (≈ 8 modules).
- **Rink:** oval floor, rail, mirror ball, lights.
- **Bowling:** lane, pins, ball return.
- **Baseball:** diamond, dugout, bleachers.
- **Golf:** green, flag, sand trap, cart path.
- **Dirtbike:** whoop, berm, tabletop, banners.

### 6.8 Props and set dressing

The CC0 kit route (Kenney, Quaternius) for the generic pieces:

- palms, Joshua trees, agave, rocks
- fences, Jersey barriers, cones
- light poles, signs (brevity-code and Nevada jokes), flags, picnic tables, bins, mailboxes
- crates, pallets, AGE carts

Hand-built hero props: PT belt, PCS pods, the Yard of the Month sign.

### 6.9 Aliens and night

Friendly specimen (in tubes), a cartoon saucer, night-wave "lights": UFO light rigs that mix in with
the aircraft lights.

### 6.10 Materials, sky and light

Done: an HDRI sky (Goegap, CC0). To do:

- a night HDRI
- CC0 PBR textures (asphalt, concrete, stucco, tile, gravel, gym wood, rink wood, grass)
- decals (oil stains, cracks, tyre marks, paint wear)
- a Blender light bake per landmark

## 7. To-do (prioritised; ≈ token cost as a share of a week's Claude budget)

**Now (this week, about 15% left)**
- [x] HD look (HDRI, bloom, SMAA): shipping as Build 391
- [ ] Ship Build 392: missiles, trailer, Winchester, beam-rider, brevity labels, Saucer Springs, line fix (≈ 3%)
- [ ] Relabel Free Drive as "this track" until the hub exists (≈ 0.5%)
- [ ] Splash / Fox Two / Tally callouts (≈ 1%)

- [x] **Furball mode** v1 on the current track (menu button, `?mode=furball`); next: a proper arena (Red Flag ramp, WIC PlayPlace)
- [ ] Rework the fake-acronym jokes (owner: TDY/PCS/FOD versions need work)
- [x] Escape menu, mute, calmer motor; Liberty Loop boost pads and kicker jumps (built)

**After the reset (27 Oct)**
1. [ ] **Hero buggy remodel** to the concept (≈ 8%)
2. [ ] **CC0 PBR textures and decals**, plus a light bake on the three districts (≈ 10%)
3. [ ] **Open-world pipeline:** OSM to Blender tile generator, tile streaming in the engine,
       fast travel, event rings (≈ 25%)
4. [ ] **Main gate, ramp and runway zones** with the Red Flag ramp, using the first 6 aircraft
       (F-16, F-15, F-22, F-35, A-10, Typhoon) (≈ 15%)
5. [ ] **Skatepark** (≈ 6%), then the **roller rink** (≈ 6%)
6. [ ] **Petting Zoo** (≈ 8%)
7. [ ] **Golf course and Car Golf**, **dirtbike track**, **baseball**, **bowling** (≈ 5% each)
8. [ ] **Night cycle and night wave**, then **Area 51½ secret zone** (≈ 10%)
9. [ ] **Garage**: the second to fifth cars and liveries (≈ 8%)
10. [ ] Remaining aircraft types, ground vehicles and landmarks (ongoing)

**Rules that stay true:** kid mode never targets the player; falls never trap; real hardware is
cartoonified with no logos or insignia; every asset carries provenance (CC0, CC-BY credited, or
original); OSM is credited on screen.
