# Saucer Springs AFB RC design request ledger

This ledger is the traceable scope for the RC game. It separates owner direction from
inherited design proposals and from the current implementation scaffold. A passing test or
render is evidence that a scaffold works; it is not approval that the finished design is right.

## Current opening direction — 24 October 2026

Start in the residential neighbourhood's small skatepark. The school, homes and connecting
paths belong to the same neighbourhood; the larger base skatepark remains a separate venue.
Use the private reference study to preserve convincing spatial relationships, with fictional
names, original art and deliberate adaptations. Do not publish identifying research notes,
source coordinates, personal history or private reference files with the open-source game.
Retain required third-party data attribution separately from personal provenance.

The opening teaches through play: an easy bend, optional ramp with flat bypass, nearby cars
and items, an accessible race, then continued exploration. No mandatory drift or jump,
unlock chore, or explanatory menu sequence. Verify the fresh-profile input journey and
actual toy-eye screenshots. Automated completion does not prove human usability or art quality.

The authored skatepark and reference layout are in progress. The complete neighbourhood
redesign has not been deployed or visually accepted.

## Product contract

| Requirement | Provenance | Current evidence | Design status / missing detail |
|---|---|---|---|
| One large, driveable Saucer Springs AFB; all destinations belong to the same physical world | Owner direction; expanded in `docs/area-51-build-plan.md:170-184` | A verified one-page road-trip sample covered 8.06 km across nine legs (Gate → BX → School → Housing), with no recovery or teleport and 27 streamed cells | **Primary acceptance requirement.** This proves a meaningful continuous route, not the entire world or every venue. Keep the seamless-world contract and extend coverage to the remaining destinations. |
| Re-Volt-style toy handling in a real-scale world, understandable to a six-year-old | Owner direction, `docs/area-51-and-a-half.md:5-30`; engineering proposal, `docs/area-51-build-plan.md:5-35` | Fixed-step vehicle, assists, recovery and controller paths exist | Feel, child playtest and physical suspension quality remain open. The build plan requires rigid body/four wheels; the milestone still calls the handling a fictional approximation (`rc-open-world-milestones.md:25-27`). |
| Kid mode is safe and forgiving; Big Kid is optional | Owner direction, `area-51-and-a-half.md:19-30`; rules, `area-51-design-bible.md:344-346` | Assists, recovery and target rules are scaffolded | Final child playtest outranks automated acceptance (`area-51-build-plan.md:127-138`). |
| Real Nellis-inspired geography and USAF culture, fictional name/signage, no logos or insignia | Owner direction, `area-51-and-a-half.md:71-91`; bible `area-51-design-bible.md:12-27` | OSM-derived tiles, runway axes, fictional signs and ODbL attribution | Geographic/art judgment remains human; terrain is an adapted DEM, not survey fidelity (`rc-open-world-milestones.md:21-27`). |

## Physical AFB districts and destinations

| Place | Owner-requested content | Scaffold / gap |
|---|---|---|
| Main Gate | Defenders booth, gate-guard aircraft, Saucer Springs AFB sign | Implemented landmark; confirm arrival, signage and nearby road continuity. |
| Area III housing | Stucco homes, xeriscape, cul-de-sacs, PCS pods, playgrounds; sprinklers, garage ramps, trampoline, barbecue | Housing district and Liberty Loop exist. Confirm the full lived-in dressing and Paper Route as a hub activity. |
| HQ offices | Desks, rolling chairs, copier, mail-cart shortcut | Explicit owner request (`area-51-and-a-half.md:38-39`); **not clearly represented as a complete physical hub district in the latest ledger**. Must be placed, connected and given an activity or marked deliberately deferred. |
| Hospital | Landmark and ambulance bay | Named destination/scaffold; through-route purpose needs design confirmation. |
| BX / shoppette | Aisles, departments, food court, café, Class 6, parking, stockroom shortcut, knockable cans | Integrated BX exists and has a race. Preserve BX terminology; verify the car can arrive from roads, enter, exit and continue in the same world. |
| School | Gym, slippery floor, locker hall, science pocket, cafeteria, playground slide, tables, shortcuts | Integrated school exists and has a race. Treat the interior floor as a connected building volume, not a replacement level reached by a disconnected menu. |
| Gym / pool | Gym floor, empty pool skate bowl | Named destination and leisure scaffold; confirm physical placement and Deep End activity. |
| Flight line / Red Flag ramp | Real aircraft rows, tugs, jammer carts, fuel trucks, tower | Aircraft catalogue and ramp dressing scaffolded; Ramp Rat, Hot Pit and open driving need human review. |
| Runways | Two long runways and night wave overhead | Runway geometry exists; Runway Drag and airshow/night-wave design need acceptance. |
| Hangar row / demo hangar | Open hangars, maintenance bay, generic demo hangar and demo jets | Hangar slice and rows exist; Hangar Hop and formation-follow remain design/detail work. |
| Petting Zoo | MiG-21/23/29, Su-27, SA-2, SA-6, ZSU-23-4, Flat Face/Fan Song radars that track the car | Named catalogue/scaffold exists; SAM Dodge behavior and visitor path need play design. |
| Golf / Sunrise Vista | Fairways, greens, traps, water, carts | Car Golf and Fairway Rally scaffolded; final course feel and golf-cart unlock remain review. |
| WIC PlayPlace skatepark | Bowl, half-pipes, rails, funbox, stairs | Kit and Furball arena proposal exist; physical placement and stunt route need review. |
| Roller rink | Polished oval, mirror ball, disco lights, rental counter | Night Rink Drift exists as a representative route; art and interaction remain review. |
| Bowling | Lanes as drag strips, pins, ball return | Bowling scaffold exists; ensure it is a place in the same base and not only a mode shortcut. |
| Baseball | Diamond, dugouts, bleachers | Round the Bases is specified; venue dressing and route remain review. |
| Dirtbike track | Whoops, berms, tabletops, mud | Whoops activity specified; physical venue placement remains to verify. |
| Boneyard | Covered retired B-52/F-4/C-130 rows, wing kicker shortcuts | Wing Walker specified; full route and safe fallback need review. |
| Waterpark | Lazy river, splash pads, driveable slides, slowing/spraying water | Splash Down specified; physical world integration and water handling need review. |
| Area 51½ secret zone | Inner fence, bunker, lab, friendly aliens in tubes, saucer under tarp, Janet/Dreamland signs | Specimen unlock/Dreamland finale scaffold exists. Validate that the road, fence, entrance and exit are physically part of the AFB. |

## Activities, progression and modes

The proposed catalogue is Liberty Loop; The BX; The School; Ramp Rat; Runway Drag; Hangar
Hop; Fairway Rally; Whoops; Rink Drift; Round the Bases; Paper Route; Grand Tour; Wing Walker;
Splash Down; and Dreamland Night (`area-51-design-bible.md:109-131`). Each route should use
ordered gates, an AI line, a skill ALT, pickups and challenge coins (`:111-113`), while the
player remains free to ignore events and drive the base.

Furball is an open-zone battle mode rather than a lap: Red Flag ramp, WIC PlayPlace or BX car
park; crates and respawns; balloon lives; last-standing or timed scoring; target/flee AI; and
visible weather balloons and nose-art progression (`area-51-design-bible.md:141-161`). The
owner's Furball direction overrides the older five-balloon kid-mode balancing proposal: do not
silently turn Furball into a no-target race, but keep the explicit Furball rules separate from
ordinary race kid mode (`:149-151`).

The progression loop is exploration → specimens/coins → vehicle and activity choices → races →
Dreamland finale → persistent completion and replay (`rc-open-world-milestones.md:4-17`).
Fast travel may be offered only after discovery; it must not replace the ability to drive between
places.

## Weapons, calls and menu

Built/proposed pickup vocabulary is Afterburner, Splash, Hydraulic Leak, Chaff, Fox Two, Pitbull,
Fox One, Zuni, Winchester and Jammer (`area-51-design-bible.md:163-176`). Flare, Buddy Lase and
JDAM remain designs to complete (`:177-181`). Pending brevity calls are Splash, Fox Two/Fox One,
Tally/No Joy and Cleared to land; Bingo is only an idea (`:183-196`).

The menu requirement is compact and task-first: “Drive”, “Race”, “Furball”, tracks and mute in
one row; move joke labels such as Tumbleweed, RTB and Knock it off into tooltips (`area-51-design-bible.md:309-312`). The world map must be a navigation aid, not a substitute for entering the world and driving.

## Vehicles, aircraft and art inventory

The player vehicle is a real RC buggy chassis with shocks, knobby tyres and antenna under a
snap-on real-type toy jet shell. Initial shell tribes are F-16/Viper, F-15/Eagle, A-10/Warthog,
F-22/Raptor and Su-27/Flanker, with garage selection and aggressor liveries (`area-51-design-bible.md:133-139`). Body choices are hero buggy, monster truck, rally hatch, pickup and golf cart (`:204-213`).

Ramp aircraft: F-16, F-15C, F-15E, F-22, F-35A, A-10, B-52, KC-135, E-3, C-17, EA-18G,
Typhoon, Rafale, Gripen, Tornado, Su-27/aggressor F-16 and MQ-9 (`:215-220`). Petting Zoo:
MiG-21, MiG-23, MiG-29, Su-27, SA-2, SA-6, ZSU-23-4, Flat Face and Fan Song (`:222-225`).
Gate/museum: F-105, F-4, F-100, F-111 and F-117 (`:227-229`). Ground/support/civilian:
MJ-1, tow tug, R-11, P-23, Security Forces pickup, school bus, Janet-style 737, shuttle bus,
golf cart, pickup and parked sedans (`:231-235`).

Landmarks are tower, hangars, BX, school, gym, hospital, chapel, rec centre, bunker, gate booth
and water tower (`area-51-design-bible.md:238-254`). Leisure kits are skatepark, rink, bowling,
baseball, golf and dirtbike (`:256-264`). Props include desert plants/rocks, fences/barriers,
cones, lights, signs, flags, picnic tables, bins, mailboxes, crates, pallets, AGE carts and
hero PT belt/PCS pods/Yard of the Month (`:265-274`). The intended look is bright, warm and
jovial, with a friendly lived-in base and one spooky-fun secret area (`area-51-and-a-half.md:56-60`).

## Explicit design uncertainties

1. The earlier build plan proposes a compressed hub crossed in about 30 seconds (`area-51-build-plan.md:172-176`); the later bible specifies a real-scale 5.8 × 6.3 km world and roughly eight minutes corner-to-corner (`area-51-design-bible.md:36-45`). The master design must choose a travel target and explain streaming/fast travel around it.
2. Earlier docs call BX, School and Housing interior races separate scenes entered through doors (`area-51-design-bible.md:111-113`; `area-51-build-plan.md:177-179`). The current owner requirement supersedes this as a seamless physical world; the transition, collision, persistence and return-to-road behavior need an explicit contract.
3. The current continuation reports a complete named catalogue and an implemented exploration loop, while also acknowledging simplified models and adapted terrain (`rc-open-world-continuation.md:7,19-20,37-43`; `rc-open-world-milestones.md:8-17,23-27`). The verified 8.06 km Gate→BX→School→Housing sample is substantial but does not constitute whole-world or every-venue acceptance. Do not report the scaffold as finished art or complete design acceptance.
4. This ledger is reconstructed from the checked-in design history available in this repository. It may omit requests made only in prior conversations, images or external agent messages; those must be reconciled before declaring the master list complete.

## Recovered direct owner record (Claude transcript)

The following are direct owner messages recovered from the local Claude project transcript. The
line references are JSONL line numbers in
`~/.claude/projects/-Users-iantodd-Projects-guns-only/3ba68d4d-b319-4b15-808e-8db469740f54.jsonl`.
They take precedence over later agent summaries when they conflict.

| Date / transcript line | Direct direction | Ledger consequence |
|---|---|---|
| 2026-10-21, line 110 | The base is an American-style military base with residential area, schools, houses, offices, hangars and secret alien areas. | HQ/offices is an explicit owner requirement, not an optional agent proposal. |
| 2026-10-22, lines 4771, 4830 | The open-world map must be escapable; the name is Saucer Springs AFB; add a skate park, skating rink and possibly baseball. | Preserve the physical hub and these leisure destinations; “Little Nellie” is rejected. |
| 2026-10-22, lines 4856, 5154 | Add dirtbike track and golf course; weapons should be Mario Kart-style; cartoonify recognizable real aircraft like Pixar’s *Planes*. | Dirtbike/golf and recognizable real hardware are owner scope. |
| 2026-10-22, lines 4896, 5176 | Use a big base map with races carved from the open-world setup; build out the design, to-do list, model list and rough base dimensions. | The master design needs a complete traceable inventory and base-scale contract, not only implementation notes. Line 4896 is the transcript's queued human message record; line 5176 is the direct user turn. |
| 2026-10-22, line 8404 | The missile-on-a-trailer idea turned out to be dumb. | **Rejected owner direction:** remove Jammer/trailer gameplay from the canonical design, even if code or earlier docs still mention it. |
| 2026-10-22, lines 8787, 8884 | Retreat must communicate visually while muted: a floating 3-D stop sign; ignoring it sends the player to flag timeout. | The retreat mechanic needs a visible stop-sign cue and a readable timeout state; sound is supplementary. |
| 2026-10-22, lines 9027, 9139 | The timeout/recovery character should sit on a cargo quadrotor and be a robot MP. | Historical superseded direction. Preserve it for provenance, but do not treat the robot MP as the current canonical character after the 2026-10-23 alien-Lakitu steering. |
| 2026-10-22, line 7485 | Instant wins are no fun. | Races need meaningful close competition and rubber-banding; a pass that merely finishes quickly is not acceptable balance. |
| 2026-10-22, line 5539 | “TDY Racing” is pretty good. | This is a liked candidate name, not a final title; do not promote it to a product decision without later confirmation. |

The transcript also records the owner wanting a Nellis cultural reference and layout scale (lines
`4771-4856` and the recovered summary around the owner’s Nellis request), but it does not by
itself settle whether every real Nellis road and building must be reproduced. The master design
should retain “Nellis-inspired, fictional Saucer Springs, physically driveable” as the safe
interpretation until the owner reviews the map.

## Mario Kart 64 reference matrix

The primary reference is Nintendo’s official Mario Kart 64 instruction manual:
[Nintendo Europe PDF](https://www.nintendo.com/eu/media/downloads/games_8/emanuals/nintendo_8/Manual_Nintendo64_MarioKart64_EN.pdf).
The manual’s extracted pages identify the cup order, sixteen race courses, four Battle-only
courses, item behavior and Battle rules. Course names below are reference names only; Saucer
Springs must use original layouts, names and art rather than copy Nintendo tracks.

| Cup / mode | Mario Kart 64 reference courses or rule | Saucer Springs mapping cue |
|---|---|---|
| Mushroom Cup | Luigi Raceway; Moo Moo Farm; Koopa Troopa Beach; Kalimari Desert (manual pp. 10–11, PDF lines 191–198) | Base-gate/start-line circuit; housing/farm-style service roads; **Saucer wave pool** as the Koopa Troopa Beach analogue; desert/range route. |
| Flower Cup | Toad’s Turnpike; Frappe Snowland; Choco Mountain; Mario Raceway (manual pp. 10–11, PDF lines 195–198) | Traffic/convoy road; cold-storage or night/ice joke; quarry/boneyard terrain; ordinary base-road race. |
| Star Cup | Wario Stadium; Sherbet Land; Royal Raceway; Bowser’s Castle (manual pp. 10–11, PDF lines 196–198) | Stadium/skatepark; rink; ceremonial/flightline showcase; bunker/secret-area challenge. |
| Special Cup | DK’s Jungle Parkway; Yoshi Valley; Banshee Boardwalk; Rainbow Road (manual pp. 10–11, PDF lines 197–198) | Rewild/desert parkway; confusing housing/road fork; waterpark boardwalk/roller-rink edge; night-wave/saucer finale. These are archetype mappings, not copied tracks. |
| Battle | Four Battle-only courses; objective is eliminating opponents rather than finishing first (manual p. 15, PDF lines 389–405). Canonical names: **Big Donut, Block Fort, Double Deck, Skyscraper**. | Use open physical AFB arenas: ramp, WIC PlayPlace, BX car park and another venue chosen from the map. Preserve spatial combat rather than converting Battle into a lap. |
| Battle lives | Three balloons per kart; popping all removes the player; in 3–4 player play, defeated players become one-use Mini Bomb Karts that cannot win or use items (manual p. 15, PDF lines 337–350). | Furball can reinterpret balloons as weather balloons and defeated cars as the project’s own ghost/timeout behavior, while keeping ordinary race kid-mode targeting rules separate. |

The same manual documents item roles useful as bounded reference points: straight Green Shell,
homing Red Shell, leader-seeking Spiny Shell, revolving Triple Red Shell barrier, Banana slip,
Fake Item trap and temporary Star invulnerability (PDF lines 271–335). It also states that
items marked with an X do not appear in Battle (lines 279–281); this is a useful reminder to
author a deliberate Furball item set rather than enabling every race pickup by default.

### Lakitu and latest owner steering

On 2026-10-23 the owner first specified **“MP is Lakitu MK64 default when in doubt”**, then
authoritatively superseded that with: **replace the MP robot with an alien for Lakitu**. The
current canonical character is a friendly alien riding a little saucer, retaining the marshal’s
visible recovery/timeout, start/stop signaling and readable silhouette roles. Rainbow Road is
now envisioned as an alien portal: a drive-through Dreamland portal enters a Rainbow Road-style
alien segment and returns the player to the base. This is current owner steering; the game has
not necessarily been changed to match it yet.

The official MK64 manual confirms the relevant game affordances (start signal, fall consequences
and Battle elimination rules), but does not name Lakitu in its extracted text; do not present
Lakitu-specific animation details as a quoted Nintendo requirement.

The “map the base and game parts to MK64 parts” instruction should be implemented as an
archetype matrix: each Saucer Springs venue gets a recognizable mechanical role (beach/wave,
stadium, quarry, boardwalk, maze, fortress, highway, desert, night finale) while the AFB remains
one continuous world and all geometry, names, signs and jokes remain original.

### Residential season and setting (24 October 2026)

Keep the neighbourhood recognisable through its routes, school, civic centre and small skatepark, transplanted into the American Southwest. Late spring/early summer: full leafy shade trees, irrigated lawns and playing fields, warm buildings and desert mountain backdrop. Assume sufficient irrigation across the residential district; keep its lawns and verges green rather than restricting greenery to small garden patches. Reference photographs taken in winter establish architecture only; do not reproduce bare winter vegetation. Personal source locations and photographs remain in the ignored private reference directory.
