"""Editorial source for the offline design atlas. No game files are changed."""
import json
from pathlib import Path

places = []
def place(id, name, sector, x, z, placement, status, purpose, entrance, route, events, shortcut, recovery, art, collectible, acceptance):
    places.append(dict(id=id, number=len(places)+1, name=name, sector=sector, x=x, z=z,
        placement=placement, status=status, purpose=purpose, entrance=entrance, route=route,
        events=[dict(zip(('name','type','length','time','hook'), e)) for e in events],
        shortcut=shortcut, recovery=recovery, art=art, collectible=collectible, acceptance=acceptance))

place('gate','Main Gate & Airpark','town',-607,-29,'Existing anchor','Playable scaffold',
 'First view of the whole base: RC-scale tyres beside full-size aircraft, mountains and the tower. A clear choice between town, flight line and home streets.',
 'Wide open visitor lane links both directions of the perimeter road. Event ring sits in a lay-by, never across the drive-through lane.',
 ['Welcome monument','Defenders booth','Gate-guard aircraft','Visitor car park','Town road'],
 [('Gate Guard','Circuit','300–400 m','40–55 s / lap','Slalom round jet pylons; tow-rope-sized lane markings make the toy scale obvious.')],
 'A low plinth ramp passes under the F-4 tail; a dogleg forces braking before the drop back onto the car park.',
 'Barrier arms stay raised on the public driving path. Falling off a plinth returns to the paved loop.',
 ['Sandstone welcome monument; SAUCER SPRINGS AFB','F-105, F-4, F-100, F-111, F-117 static displays','Alien marshal booth, PT belt, flag and direction signs'],
 'First specimen sits visibly beside the visitor lane; five airpark coins introduce optional exploration.',
 'From fresh start, a child can drive toward any public district without entering a race or selecting a level. Both gate lanes pass the real car.')

place('housing','Family Housing · Liberty Loop','town',-1285,-1132,'Existing anchor','Integrated district; needs art pass',
 'A familiar neighbourhood becomes a giant toy obstacle course. Safe roads are the easy line; gardens reward throttle control.',
 'Two street openings join the north base road. The current south entrance remains flush with the district floor.',
 ['PT-belt start','Cul-de-sac','Sprinkler lawns','Open garage ramp','Backyard barbecue','Playground','Street exit'],
 [('Liberty Loop','Circuit','406 m','45–60 s / lap','Boost pad on the straight; garden obstacles never block the road.'),('Paper Route','Checkpoint run','1.2 km target','2–3 min','Mailbox flags flip when passed; finish back at the neighbourhood entrance.')],
 'Garden Wall Run: box ramp → 0.8 m wall top → braking dogleg → 0.8 m gap. About 8% quicker when clean; misses land in a yard with a broad road opening.',
 'Sprinklers nudge, never pin. Trampoline has sloped access and an open landing apron. Every fenced yard has a car-sized exit.',
 ['Tan/peach/sage stucco and terracotta roofs','Xeriscape, bikes, basketball hoop, trampoline, barbecue','PCS pods/boxes, mailboxes, Yard of the Month, 15 MPH and quiet-hours signs'],
 'Specimen under a barbecue side table; five coins at the garage, trampoline, wall, moving pod and playground.',
 'Complete road lap and every yard exit; a full-throttle shortcut miss rejoins the slow route. No doorstep, kerb or district seam traps the buggy.')

place('hq','HQ Offices · Paperwork Circuit','town',-700,-250,'Proposed site','Missing district — restored to scope',
 'A small office building becomes a maze at wheel height: desk legs, carpet islands, a huge copier and rolling chairs.',
 'Front accessible ramp from the civic road; rear mailroom loading ramp exits onto the same road network. Both doors stay open.',
 ['Reception mat','Desk-leg slalom','Rolling-chair bay','Copier room','Mailroom','Conference table','Front lobby'],
 [('Paperwork Circuit','Circuit','280–340 m','45–60 s / lap','Carpet slows; polished corridor lets you slide. Chairs move across a visible, timed crossing.'),('Mandatory Fun Run','Sprint','500–650 m','75–100 s','HQ rear door → civic green → BX forecourt; a pizza-table finish.')],
 'Mail-cart ramp climbs a low sorting shelf, brakes around a parcel, hops to the adjacent shelf and drops by the conference room. Main route stays at least 3 m wide.',
 'Chairs yield if the car is in their path. Paper stacks are light props; power cables are flattened into collision. Every under-desk pocket has two exits.',
 ['Low-pile blue carpet, cream walls, venetian-blind light','Desks, caster chairs, copier, mail carts, intrays, paper boxes','Fictional squadron noticeboard; one understated meeting joke'],
 'Specimen visible in a transparent outgoing-mail tray; five coins use the copier base, desk tunnel, chair bay, shelf and rear courtyard.',
 'Drive in from town, complete a lap, drive out the loading ramp in the same session. Camera never stays behind a desk panel or chair back.')

place('hospital','Hospital & Civic Green','town',-412,-507,'Reference anchor; footprint to fit','Background landmark; through-route to detail',
 'A recognisable town landmark and a calm route between housing and Main Gate. It adds life without becoming another mandatory race.',
 'Public forecourt joins the north road; pedestrian ramps cross the green. Ambulance bay stays outside the racing line.',
 ['Civic green','Canopy','Forecourt','Shuttle stop','North road'],
 [('Civic connector','Free drive','200–350 m','30–60 s','A shaded alternative to the main road, with chapel and water-tower sightlines.')],
 'Optional planter-edge coin route has sloped access and rejoins the forecourt; no rooftop route.',
 'Parked ambulances remain static; benches and planters never form sealed pockets.',
 ['Hospital canopy and restrained medical symbol','Chapel, water tower, shade structures, shuttle bus','Town landscaping connects to the surrounding housing palette'],
 'Coins on the public route; no extra mandatory specimen added to the existing save requirements.',
 'Forecourt connects at both ends and cannot accidentally start an event. Quiet visual respite between busy venues.')

place('bx','Base Exchange','town',-546,791,'Existing anchor','Integrated district; needs richer finish',
 'The big retail circuit: amber concourse, contrasting departments, giant products, food-court table tunnels and an obvious return to daylight.',
 'Automatic front doors from the car park; stockroom service door is a second physical exit. The racing ribbon remains visible throughout Free Drive.',
 ['Entrance mural','Amber concourse','Electronics islands','Toy corner','Clothing runway','Food-court tables','Checkout 3','Front doors'],
 [('The BX','Circuit','317 m','40–55 s / lap','Department colours and overhead shapes identify the next turn.'),('Parking Lot Scramble','Furball','100 × 80 m arena','3 min','Parked cars and trolley corrals create cover with two exits each.')],
 'Stockroom cuts the clothing loop via a box ramp and pallet deck. Flight Suit Runway is a narrower elevated alternative with a braking dogleg. Neither bypasses a checkpoint.',
 'Trolleys and cans scatter away. Tables give at least 0.55 m clearance; shelf ends are chamfered. Reverse out through either door.',
 ['Reference-led Nellis BX ceiling grid and troffers','Black fixtures with orange bands; amber concrete and wood-look departments','Original signage, toy jets, unbranded café and food counters; no store logos'],
 'Specimen in the stockroom; five coins off the main line, each with an obvious way back.',
 'The route is readable with sound muted. No checkerboard overlap or floor seam. The front door remains visible from the lobby at toy camera height.')

place('commissary','Commissary & Shoppette','town',-690,960,'Proposed campus extension','Not a complete interior yet',
 'Grocery shelves provide a different retail rhythm from the BX: long freezer straights, tight endcap turns and a playful can-stack shortcut.',
 'Shares the BX campus service road, with front supermarket doors and a rear delivery ramp. No scene transition.',
 ['Trolley porch','Produce islands','Freezer straight','Can-stack endcap','Checkout belt ramp','Loading bay','Front aisle'],
 [('Commissary Dash','Circuit','300–360 m','45–60 s / lap','Knock over a stack of cans to expose a short route; freezer doors reflect the car.')],
 'Flattened cartons climb a low checkout counter, then a narrow belt crosses to the bagging shelf. A braking turn avoids the till; a miss drops onto the main aisle.',
 'Cans use capped lightweight effects; collision cannot bury the car. Rear dock has a permanent sloping return path.',
 ['Glossy cream tile, freezer wall, produce crates','Cans, cartons, shopping baskets and checkout counters','Shoppette and Class 6 remain exterior base-life dressing; no drinking gameplay'],
 'Optional grocery coins and a challenge coin reward; no new mandatory specimen gate.',
 'Distinct silhouette and surfaces from the BX; both exits work; toppled props reset only when out of view or on event restart.')

place('school','Saucer Springs Elementary','town',-1228,718,'Existing anchor','Integrated district; needs unified naming/art',
 'A child recognises the gym, lunch tables and playground instantly. Each changes the driving surface and the shape of the line.',
 'Front walk from the school road; playground gate returns via the bus loop. Entrances are continuous with the outside terrain.',
 ['Flagpole walk','Locker hall','Science pocket','Library','Gym drift','Cafeteria tunnel','Playground slide','Front walk'],
 [('School Run','Circuit','322 m','45–60 s / lap','A broad gym slide leads into precise cafeteria steering; the playground slide is the big jump.')],
 'Library diagonal rewards a tight turn; Planter Run climbs beside the flagpole, brakes and jumps back onto the front walk.',
 'Slide has a wide landing lane. Gym walls have rounded lower edges. No racing below a surface the chase camera cannot see through.',
 ['Warm brick/stucco, bright lockers, maple gym floor','Cafeteria tables, parachute, monkey bars, sandbox, library shelving','Toy-scale science display with a cheerful alien specimen'],
 'Science-pocket specimen; five coins distributed across classroom, gym, lunch and playground.',
 'Ribbon stays readable through all rooms. Drive through the front door and leave via the playground without a reload or teleport.')

place('gym','Gym & Deep End Pool','leisure',-1201,1224,'Reference campus; placement needs clearance','Venue expansion to build',
 'A broad polished gym opens onto an empty pool used as a gentle stunt bowl. This is the practice space for learning slides and ramps.',
 'Two recreation-campus paths enter the gym and pool apron. A wide sloping pool ramp is always available.',
 ['Basketball court','Equipment mat','Pool deck','Shallow bowl','Deep end','Exit ramp'],
 [('Deep End','Stunt session','60 × 35 m','Untimed','Link bowl turns and small jumps; bank points by returning to the deck.')],
 'A shallow-to-deep transfer crosses a low divider; a safer roll-through line remains beside it.',
 'No drain suction, drowning or vertical-walled trap. The exit ramp is visible from the deepest point.',
 ['Court markings and stacked mats','Empty painted pool, ladder, diving-board silhouette','Warm evening light and broad visible exits'],
 'Lip coins teach controlled approaches; no required high jump to progress.',
 'Every landing can roll to the exit without recovery. Auto-right works on both the bowl wall and the flat bottom.')

place('ramp','Red Flag Flight Line','airfield',618,71,'Existing anchor','Playable scaffold; hero rows to refine',
 'The main spectacle: a tiny RC car threads under real-sized allied and aggressor jets while ground crews and tugs make the ramp feel alive.',
 'Three wide taxi/service-road approaches. Public RC lanes remain open around aircraft nose wheels and beyond the event area.',
 ['Crew-chief start','Fighter row','Underwing slalom','AGE lane','Bomber shadow','Hot pit','Tower-side return'],
 [('Ramp Rat','Circuit','550–650 m','60–85 s / lap','Use aircraft gear and wings as readable gates.'),('Hot Pit','Pickup race','450–550 m','60–80 s','Collect three coloured service tokens in any order, then return.'),('Ramp Furball','Arena','180 × 140 m','3 min','Aircraft shadows and tugs break sightlines; weather balloons reveal opponents.'),('FOD Walk','Collecting','200 × 150 m','Untimed','Sweep up bright harmless debris; finish with a clean-ramp stamp.')],
 'A low equipment ramp crosses the back of a parked tug, then drops beneath a wing. Wing surfaces are only driveable where explicitly authored.',
 'Crossing tugs signal and yield; no jet blast or lethal machinery. Keep wheel gaps wider than the buggy plus steering margin.',
 ['Recognisable F-16/F-15/F-22/F-35/A-10 silhouettes first','Allied jets, B-52, tankers and transports in coherent parking rows','MJ-1, R-11, tow tugs, crew chiefs, FOD bins, tower and restrained apron paint'],
 'Specimen near a crew-chief ladder; aircraft identification coins are optional discovery rewards.',
 'Underwing route, traffic crossings and camera clearance pass at toy scale. Distant rows use consistent low-detail silhouettes rather than generic triangles.')

place('runway','Runways 03 / 21','airfield',24,1842,'Existing anchor','Playable drag scaffold',
 'A huge straight where a toy feels tiny. Two long diagonals establish the geography from almost anywhere on the base.',
 'Taxiway links at both ends and mid-field. Runway access never depends on starting a drag race.',
 ['Threshold bars','400 m drag grid','Centreline boost pads','Finish runoff','Taxiway return'],
 [('Runway Drag','Sprint','400 m','33–45 s','Afterburner only; launch timing and boost placement decide a close finish.')],
 'No hidden shortcut in the timed drag. Optional parallel taxiway provides a free-drive return trip.',
 'Generous braking runoff; parked and ambient aircraft cannot collide with the player during the event.',
 ['Two recognisable parallel runways on source axes','Threshold paint, edge lights, signs and windsock','Night-wave departures with occasional friendly UFO lights'],
 'Specimen at the return taxiway, never in an active event finish lane.',
 'A slow launch can lose. Night lighting preserves road readability without excessive glare or a dark car silhouette.')

place('hangars','Hangar Row & Garage','airfield',380,400,'Existing anchor','Playable scaffold; approved art target applies',
 'The approved orange-buggy hangar becomes a real place in the base: maintenance bays, tool chests, parked jets and the garage display.',
 'Large open front and rear hangar doors join the service road. Garage interaction is in a side bay outside the racing line.',
 ['Tool-chest grid','Open hangar','Gear-leg tunnel','Hose ramp','Second hangar','Outdoor figure-eight crossover','Service road'],
 [('Hangar Hop','Sprint','500–600 m','60–85 s','Race through two open hangars and cross beneath a service ramp.'),('Hangar Eight','Circuit','450–550 m','55–75 s / lap','An original figure-eight archetype, with physically separated over/under paths.')],
 'A maintenance platform rises beside a jet, turns sharply past a toolbox, hops to a low wing-work stand and rejoins outside.',
 'Hoses are ramps, not snagging cylinders. Fall zones below the elevated line return to the slower road.',
 ['Approved sculpted amber/ivory buggy, graphite chassis, exposed coil-overs','Used concrete, tyre marks, yellow lines, tools and warm practical lights','Original aircraft with clear landing gear and high/low detail versions'],
 'Specimen behind a transparent tool locker; garage displays owned paints, bodies and nose-art milestones.',
 'Match approved reference in material richness and contact shadows. Doors, floor, collision and ambient lighting remain continuous with the world.')

place('demo','Demonstration Team Hangar','airfield',820,400,'Proposed site','Landmark and activity to develop',
 'A neat contrast to the busy Red Flag ramp: immaculate red-white-blue demonstration jets and a playful ground formation exercise.',
 'Service-road loop links Hangar Row to the central ramp; a broad viewing apron doubles as the activity area.',
 ['Display line','Leader start','Shallow slalom','Formation turn','Hangar arch','Viewing apron'],
 [('Formation Follow','Follow-the-leader','400–500 m','90 s','Stay inside a generous moving ground ribbon behind a demo RC car; misses reduce stars, never restart.')],
 'Optional precision lane tightens the formation for a higher medal; it is not the main route.',
 'The leader slows when the player falls far behind. Jets remain static; no real aerial formation task is required.',
 ['Generic red-white-blue demo livery without official logos','Open hangar, floor polish, neat crew equipment','Visible flag/tower landmarks orient the return drive'],
 'A team-style cosmetic coin rewards one completed follow, regardless of score.',
 'The moving ribbon works on mute and during tight turns; finish returns to free drive exactly where the activity ends.')

place('zoo','Petting Zoo','leisure',-1361,2074,'Existing source-backed anchor','Hardware scaffold; activity to build',
 'Captured hardware becomes a friendly museum playground. Swivelling radars invite hide-and-seek between enormous wheels and launch rails.',
 'An open museum loop connects to the southwest base road in two places. Keep the source-backed site; discard the old unverified east-side placement.',
 ['MiG display row','Radar clearing','Launcher shadows','Armour lane','Museum exit'],
 [('SAM Dodge','Hide-and-seek','120 × 100 m','90 s','Collect three flags while avoiding visible radar sweep cones. Detection gives a playful spotlight and a short score pause, not a damaging missile.')],
 'Display plinth ramp crosses behind the SA-6, then drops into a screened lane. A wide path remains around every display.',
 'Radar cones have visual countdowns and broad safe zones. Gun barrels and missiles are museum props, never live weapons.',
 ['MiG-21, MiG-23, MiG-29, Su-27','SA-2, SA-6, ZSU-23-4, Flat Face and Fan Song','Weathered museum labels and swivelling radar dishes'],
 'Specimen behind the radar information board; optional hardware discovery stamps.',
 'Radar line-of-sight agrees with visible cover. Every vehicle silhouette is distinct and recognisable from a low viewpoint.')

place('golf','Sunrise Vista Golf Course','leisure',-330,2776,'Existing anchor','Car Golf and race scaffold',
 'Open green fairways interrupt the desert palette. The car becomes the putter; cart paths become a rally route.',
 'Clubhouse road and two cart-path connections join the south base loop.',
 ['Clubhouse','First green','Sand trap','Pond bridge','Long fairway','Flag green','Cart return'],
 [('Car Golf','Three-hole round','3 × 40–90 m holes','3–5 min','Nudge a large toy ball into each hole; count strokes, always allow retry.'),('Fairway Rally','Circuit','650–750 m','75–100 s / lap','Fast paths versus slower grass and sand; a bridge shortcut crosses the pond.')],
 'A narrow cart bridge saves the pond detour. Falling lands on a shallow bank with a driveable ramp, not in deep water.',
 'Reset ball returns it to the last lie with one stroke; car recovery stays forgiving. Water has sloped edges and no drowning.',
 ['Greens, flags, raked sand, pale cart paths','Clubhouse, golf carts, sparse shade trees','One golf-before-runway visual joke in a dated foundation plaque'],
 'Discovering the course unlocks the golf-cart body. Specimen beside the clubhouse.',
 'All three holes are physically reachable; ball and hole agree visually. No ball can leave the recoverable course boundary.')

place('wic','WIC PlayPlace Skatepark','leisure',-1130,1230,'Existing anchor','Stunt/race scaffold; modules to refine',
 'The best place to play without an objective: flowing bowls, quarter-pipes and transfers at RC scale.',
 'Open campus paths from the gym, rink and baseball grounds. Two low roll-in ramps enter the park.',
 ['Beginner roll-in','Shallow bowl','Funbox','Quarter-pipe','Half-pipe','Rail bypass','Campus exit'],
 [('PlayPlace','Circuit','250–350 m','35–50 s / lap','Choose a safe rolling line or chained transfers.'),('WIC Furball','Arena','90 × 70 m','3 min','Bowls provide cover; balloons remain visible above the lips.'),('Free Session','Stunts','Whole park','Untimed','Coins lead through increasingly precise transfers, without a combo-loss penalty.')],
 'Quarter-pipe transfer over the funbox; brake for a narrow ledge before the last bowl. No mandatory rail grinding system.',
 'All bowls have visible roll-outs. Misses land on lower concrete paths with no sealed pits.',
 ['Painted concrete, scuffed coping, restrained original graphics','Bowl, half-pipe, quarter-pipe, rails, funbox and stairs','Desert shade sails and park benches'],
 'Specimen in the beginner bowl; five difficult coins on lips and ledges, all optional.',
 'Test each module from both directions and upside-down. Camera follows the landing surface rather than the launch angle.')

place('rink','Roller Rink','leisure',-940,1260,'Existing recreation-campus anchor','Floor/event scaffold; full venue to build',
 'Warm varnished wood under a mirror ball: long readable slides and a colourful night venue.',
 'Double doors from the recreation plaza, rear service door to the same campus path. Open throughout the day; lights change with the cycle.',
 ['Rental counter','Entry carpet','Wood oval','Mirror-ball straight','Snack island','Wide return','Plaza doors'],
 [('Rink Drift','Circuit','150–220 m','25–40 s / lap','Hold a controlled slide around the oval; carpet zones let beginners regain grip.')],
 'A raised rental-shoe bench gives a short straight, reached by a low ramp with a tight exit. It is slower if approached flat-out.',
 'Soft rink rail, broad inside apron and two exits. No strobing lights or required rhythm timing.',
 ['Polished wood with restrained reflections','Mirror ball, coloured pools of light, rental skates and snack counter','Strong entrance colour visible from every part of the oval'],
 'Use the existing rec specimen for the campus; rink coins are separate optional discoveries.',
 'Readable at day and night, sound off. A beginner can slow and leave without completing a lap.')

place('bowling','Strike Recreation · Bowling','leisure',-1020,1260,'Existing anchor','Pin mini-game scaffold; full interior to build',
 'The car is the bowling ball. Full-size pins and ball-return tunnels make the scale comic and immediately understandable.',
 'Shared recreation plaza with the rink; open side corridor returns to the plaza without crossing active lanes.',
 ['Shoe desk','Approach mat','Lane','Pin deck','Side return corridor','Plaza'],
 [('Strike!','Five-frame game','20–25 m lanes','3–4 min','Two runs per frame; show pins remaining as icons. Highest total wins, solo always finishes.'),('Lane Drag','Sprint','60–90 m linked lanes','15–25 s','Cross-over ramps join three lanes, with a broad braking apron.')],
 'Side-lane ramp crosses the ball-return cover, braking around its end before rejoining the approach.',
 'Gutters are shallow and ramp out. Pins cannot pile around the car. Reset pins only after the car leaves the pin deck.',
 ['Lane maple, dark gutters, large white pins with red bands','Ball return, seating, shoe counter and original wall mural','Shared rec-centre exterior with a clearly different entrance from the rink'],
 'Existing rec specimen at the shared forecourt; bowling coins sit in the safe return corridor.',
 'All ten pins score exactly once; reset never moves the player. Finish leaves the car on the return path.')

place('diamond','Baseball Diamond','leisure',-1327,1490,'Existing anchor','Sprint scaffold; set dressing to finish',
 'A compact sprint with four obvious turns. The dugouts and bleachers offer an optional toy-sized exploration route.',
 'Two open field gates connect to the recreation loop. Infield remains driveable outside events.',
 ['Home plate','First base','Second base','Third base','Home slide','Dugout exit'],
 [('Round the Bases','Sprint','110 m target','17–25 s','Four turns and a long slide into home; gates use oversized base shapes.')],
 'A bleacher access ramp crosses a low seat row; tight dogleg rejoins behind third base. A longer dirt path is always available.',
 'No wire gaps or dugout steps that trap the car. Outfield fence guides back to an open gate.',
 ['Dirt infield, patchy grass, chalk lines','Dugouts, benches, bleachers, scoreboard','No real team branding'],
 'Specimen by the dugout; optional coins beneath the bleachers.',
 'All bases register in order; cutting directly to home cannot finish. Outfield exploration returns naturally to the road.')

place('dirt','Desert Dirtbike Track','desert',1800,1450,'Existing authored anchor','Whoops scaffold; terrain rhythm to refine',
 'Whoops, berms and tabletops make suspension visible. The main line flows; the fast line demands lifting off before the biggest jump.',
 'Open desert service road connects the track to the runway return and Boneyard.',
 ['Paddock','Small whoops','Left berm','Tabletop','Mud strip','Right berm','Paddock exit'],
 [('Whoops','Circuit','400–500 m','50–70 s / lap','Rhythmic bumps reward measured throttle; one large tabletop gives the hero jump.')],
 'A tighter inside berm leads to a narrow double; a missed landing falls into the broad main-track runoff.',
 'Tabletops have no deep voids; mud slows without bogging. Perimeter slopes return to the service road.',
 ['Warm dirt, gravel shoulders, tyre ruts and sparse scrub','Banners, cones, small paddock shelter','Dust effects bounded and clear enough to see the next landing'],
 'Specimen at the paddock; five coins step from easy berm to optional double.',
 'Landings are stable in every body type. A novice holding throttle can finish the main line without repeated recovery.')

place('boneyard','Desert Boneyard','desert',2350,1600,'Existing authored anchor','Wing route scaffold; aircraft art to refine',
 'Rows of retired airframes form a giant playground. The elevated route hops across wings while the road beneath remains a complete race.',
 'Service loop connects Dirtbike Track to the eastern perimeter road; two wide openings through the storage fence.',
 ['Storage gate','F-4 rows','Kicker ramp','Wing-to-wing line','B-52 shadow','C-130 corridor','Storage exit'],
 [('Wing Walker','Circuit','550–650 m','65–90 s / lap','A safe road loop and a harder elevated wing route share the same gates.')],
 'Ramps reach low maintenance platforms beside the wings; use braking doglegs before gaps. Elevated route saves roughly 8–12% when driven cleanly.',
 'Falling lands on the desert road. Wings are not razor-thin collision; fuselage gaps cannot wedge the chassis.',
 ['B-52, F-4 and C-130 retired rows','Fabric covers, missing panels, muted sun-faded paint','Original warning signs, storage racks and tyre stacks'],
 'Specimen in a shaded ground-level storage bay; wing coins are optional skill rewards.',
 'Every elevated segment has a tested main-road landing fallback; all aircraft retain distinct silhouettes in dusty light.')

place('waterpark','Sunrise Splash Waterpark','leisure',-545,3388,'Existing authored anchor','Slide/splash scaffold; full park to develop',
 'A bright southern destination: dry driveable slides, shallow splash pads and a slow lazy-river route.',
 'Two paths connect to the golf/cart-road network. Entrance plaza is the dry navigation anchor.',
 ['Ticket arch','Splash pad','Lazy-river bank','Slide climb','Flume descent','Wide splash landing','Exit plaza'],
 [('Splash Down','Circuit','350–450 m','50–70 s / lap','Slower shallow water versus the quicker but narrower slide route.')],
 'A service ramp climbs to a broad flume, with a braking bend before the final jump. Main route follows the lazy-river bank.',
 'Water is shallow, with continuous sloped banks. No tube can hide the camera or trap an overturned car; open-top flumes first.',
 ['Turquoise water, coral/yellow flumes, pale concrete','Shade umbrellas, splash jets, lazy-river edging','Sun-faded original park graphics'],
 'Specimen at the splash-pad edge; coins in the river bend and on slide approaches.',
 'The route works dry and wet; water slowing agrees with visible water. A missed jump reaches a driveable bank.')

place('lab','Area 51½ · Dreamland','secret',2500,-1200,'Existing authored anchor','Unlock/finale scaffold; lab adventure to build',
 'The destination hinted at across the base: a cheerful secret lab, friendly aliens and a saucer. Finding specimens opens the gate, then the finale uses everything learned.',
 'Eastern service road ends at a visible inner fence. Locked gate has a specimen display and a safe turnaround. Unlocked doors remain physically open.',
 ['Janet apron','Bunker door','Observation lab','Containment floor','Tram platform','Saucer chamber','Night courtyard','Road exit'],
 [('Dreamland Night','Circuit','450–550 m','60–85 s / lap','Gentle moving light bridges, lab furniture and a glowing saucer reveal; finish celebrates the whole expedition.')],
 'A low maintenance catwalk crosses beside the saucer, then a small jump bypasses a long lab curve. Misses land on the main floor.',
 'Friendly aliens wave; no horror, confinement or violent escape. Moving platforms pause for the car. A ramp leads from every lowered test area.',
 ['Hazard-striped science with warm welcoming light','Friendly aliens in tubes, saucer under a tarp, observation windows','White Janet-style 737 and shuttle; original lab/tram shapes'],
 'Keep the existing 15-specimen unlock and save IDs. Additional venues add optional coins, not surprise new locks. Finale awards Night Wave paint; free exploration continues.',
 'Collect the existing specimens, drive through the opened gate, finish, drive back out and reload with progress intact. The ending never strands the player in a separate scene.')

place('stables','Base Riding Stables','town',-1780,-1400,'Proposed site','New MK64 counterpart',
 'A family recreation paddock gives Moo Moo Farm its base-world home: a short undulating dirt loop with animals safely behind fences.',
 'Housing service lane passes the stable yard and returns to the northern loop.',
 ['Stable gate','Hay bales','Paddock bend','Drainage humps','Feed shed','Yard return'],
 [('Paddock Dash','Circuit','350–450 m','40–55 s / lap','Wide dirt turns, bumps and visible sprinkler heads rising from the inside verge.')],
 'Jump a shallow drainage channel beside stacked hay; overshoot lands on the outer loop.',
 'Horses stay beyond the fence; animated maintenance bots and irrigation heads provide the track hazards. No collision with animals.',
 ['Timber shelters, hay bales, paddock rails, feed bins','Cartoon horses as background life; warm desert dirt'],
 'Optional coins along the feed-shed route; no new specimen requirement.',
 'Fast, simple main loop; every pop-up has a visual tell and enough space to steer round it.')

place('rail','Rail & Supply Depot','desert',1950,2180,'Proposed site','New MK64 counterpart',
 'A base logistics railway makes Kalimari Desert work naturally: desert bends, a slow supply train and two timed level crossings.',
 'A service-road loop connects the southern runway return to Boneyard; the train tracks never cut off all access.',
 ['Supply shed','Desert sweep','Crossing one','Rail cutting','Crossing two','Loading yard'],
 [('Supply Line','Circuit','650–800 m','75–100 s / lap','Read the train and decide whether to brake or take the slower underpass.')],
 'A maintenance underpass saves a wait when the train is crossing, but adds distance when the line is clear.',
 'Crossing lights and gates warn early. Train contact nudges to a safe shoulder; no crushing. Rail grooves cannot catch wheels.',
 ['Small original freight locomotive and supply wagons','Rail depot, loading docks, crossing lights and desert cuttings'],
 'Optional depot coins; a coin on the underpass teaches the safe alternate route.',
 'Train phase is reproducible for time trial; no spawn or recovery on rails. Both crossings are avoidable by road.')

place('coldlab','Cold-Weather Test Hangar','secret',2040,-690,'Proposed site','New MK64 counterpart; public outer campus',
 'A giant environmental test hangar contains the base’s artificial snow course. It is visible before Dreamland’s secret gate unlocks.',
 'Two open equipment doors join the eastern service road. The public test campus is outside the locked alien lab.',
 ['Climate-lock apron','Snowfield','Service slalom','Snow berm','Cooling tower loop','Equipment exit'],
 [('Cold Start','Circuit','500–650 m','65–85 s / lap','Snow grip, wide drifts and cheery snowman-shaped test dummies echo Frappe Snowland.')],
 'A banked snowdrift cuts an S bend; a careful lift prevents sliding into the slow snowbank.',
 'Snowbanks slow and guide rather than swallow the car. Vent puffs have visible timing and never obscure an entire turn.',
 ['Huge insulated hangar, refrigeration pipes and artificial snow','Friendly alien snow sculptures, blue-white light, warm orange exits'],
 'Optional cold-test coins. Secret progress is not required to try this course.',
 'All exits remain visible from the course. Snow grip is distinct from both dirt and rink ice; no white-on-white racing ribbon.')

place('ice','Recreation Ice Rink','leisure',-1070,1580,'Proposed campus annex','New MK64 counterpart',
 'An indoor ice rink provides Sherbet Land’s long slides and obstacle weaving while keeping the original roller rink as a separate warm-wood venue.',
 'Recreation path connects the lobby, rink-side accessible ramp and rear service opening.',
 ['Rubber entry mat','Ice oval','Ice-island slalom','Resurfacer crossing','Practice corner','Grip strip'],
 [('Ice Patrol','Circuit','220–300 m','35–50 s / lap','Long drifts, rounded ice sculptures and slow resurfacer bots create a readable low-grip course.')],
 'A smooth ice bridge crosses the centre island; a narrow exit requires a deliberate steering unwind.',
 'Rubber recovery strips surround the rink. Movable bots yield and bump gently. Ice gaps are shallow blue rubber recesses with ramps.',
 ['Indoor rink, boards, cooling pipes and rented skates','Penguin-shaped maintenance robots and rounded ice islands'],
 'Optional rink coins; no additional mandatory alien specimen.',
 'A child can stop on the rubber border and drive out. The low-grip line is broad enough for both assisted and unassisted cars.')

place('tropical','Tropical Survival Garden','leisure',-760,3060,'Proposed site','New MK64 counterpart',
 'A humid survival-training conservatory adjoining the waterpark provides DK’s lush route: palms, creek banks, a dock and a bridge jump.',
 'Two garden gates connect the golf cart path to the waterpark plaza. Service boardwalk continues around the exterior at night.',
 ['Palm gate','Creek bridge','Muddy bank','Dock straight','Service tunnel','Canopy climb','Garden gate'],
 [('Canopy Run','Circuit','550–700 m','70–90 s / lap','A fast dock jump leads into a winding jungle section; the base’s river-cleaning boat crosses in the background.')],
 'A narrow maintenance walkway trims the muddy bank; misjudging the jump drops onto a slower creek-side return lane.',
 'The creek is shallow. Foliage fades around the camera. Any thrown tropical fruit is a soft score-neutral bump with an obvious warning.',
 ['Original tropical conservatory, palms, broad leaves and mist','Wood boardwalks, rope rails, training signs and small workboat'],
 'Optional canopy coins; both ground and elevated approaches remain accessible.',
 'The route reads through foliage at low camera height. No canopy geometry hides the next gate or recovery location.')

# The wavepool is the owner's explicit Koopa Troopa Beach counterpart.
waterpark=next(p for p in places if p['id']=='waterpark')
waterpark.update(purpose='The base wavepool is Koopa Troopa Beach: a broad sand loop, moving water across the line, a sandbar shortcut and a difficult ramp into a rock tunnel. Slides and the lazy river extend the same driveable park.',
 route=['Wavepool beach start','Dry sand sweep','Wave wash','Rock-arch ramp','Tunnel or outside beach','Sandbar','Lazy-river bridge','Beach finish'],
 shortcut='Timed sandbar cuts the outer beach as a wave retreats. A separate narrow ramp launches into a rock tunnel; miss it and land on the slower beach with no dead end.',
 recovery='A permanent dry outside lane always connects the lap. Waves slow and gently displace the car; the deep-looking basin has a hidden shallow collision shelf and alien recovery if needed. No drowning.',
 art=waterpark['art']+['Large wavepool, sandy beach, artificial rock arch and tunnel','Visible wave-generator wall concealed behind resort rockwork'],
 acceptance='Wave timing and wet-sand grip agree visually. Both shortcuts work without bypassing gates; misses return to the beach. Drive from golf into the park, race, then drive out without reloading.')
waterpark['events'].insert(0,dict(name='Wavepool Beach',type='Circuit',length='500–650 m',time='60–85 s / lap',hook='Koopa Troopa Beach counterpart: broad beach bends, wave timing, a sandbar and the difficult tunnel jump.'))

def course(cup,reference,name,site,route,signature,shortcut,hazards,newWork):
    return dict(cup=cup,reference=reference,name=name,place=site,route=route,signature=signature,shortcut=shortcut,hazards=hazards,newWork=newWork)
courses=[
 course('Mushroom','Luigi Raceway','Gate Guard Raceway','gate',
  ['Visitor grid','Broad left sweeper','Gate-guard tunnel','Long straight','Banked return'],
  'An inviting first oval: wide tarmac, one tunnel and a long clear straight. Learn steering, items and three-lap flow.',
  'A modest inside-apron cut rewards a clean line without a jump.', 'Cones on the verge only; no moving hazard in the first race.', 'Extend the existing gate course into a 400–500 m teaching oval; open-world road passes alongside.'),
 course('Mushroom','Moo Moo Farm','Paddock Dash','stables',
  ['Stable yard','Wide dirt bend','Irrigation humps','Feed shed','Paddock straight'],
  'Short, bumpy farm rhythm becomes the family riding stables. Pop-up irrigation heads stand in for mole-like hazards.',
  'Inside hay-bale line is quicker but bumpier.', 'Visible rising sprinkler heads and shallow ruts; horses stay off the track.', 'Build stable/paddock kit, animated irrigation heads and a 350–450 m dirt loop.'),
 course('Mushroom','Koopa Troopa Beach','Wavepool Beach','waterpark',
  ['Beach start','Dry sand bend','Wave wash','Tunnel jump','Sandbar','Beach finish'],
  'The owner’s explicit pairing: an artificial beach around a huge base wavepool, with rock arch and jump-through tunnel.',
  'Difficult tunnel ramp plus a wave-timed sandbar; both rejoin before the next gate.', 'Waves slow and nudge; a dry outside line is always open.', 'Expand Sunrise Splash with wavepool, sand beach, rock tunnel, wave phase and wet-sand handling.'),
 course('Mushroom','Kalimari Desert','Supply Line','rail',
  ['Depot grid','Desert bend','Crossing one','Rail cutting','Crossing two','Supply shed'],
  'A desert loop punctuated by a moving freight train at two crossings.',
  'The service underpass avoids a train wait but costs distance when the crossing is clear.', 'Early crossing lights; soft train contact and safe rail shoulders.', 'Add rail depot and train loop on the southeast service roads; 650–800 m course.'),
 course('Flower',"Toad’s Turnpike",'Base Traffic','gate',
  ['Main Gate','Bus loop','BX boulevard','Service-road merge','Gate return'],
  'Race among base buses, pickups and tugs on a broad road loop with a clear oncoming lane.',
  'A signed service lane cuts a corner; it is narrower and has a slow-speed dogleg.', 'Traffic telegraphs lane changes and yields when trapping would occur. Kid impacts are brief bumps.', 'Author a connected 1–1.5 km town circuit, deterministic traffic lanes and visible intersections.'),
 course('Flower','Frappe Snowland','Cold Start','coldlab',
  ['Equipment doors','Snowfield','Snow-dummy slalom','Banked drift','Cooling loop','Exit apron'],
  'Artificial snow inside the environmental test hangar preserves the snowy S-bends and playful obstacles in a desert base.',
  'A raised snow bank cuts the final S; hold too much throttle and the soft drift slows you.', 'Snow dummies, soft banks and signalled vent puffs.', 'New public cold-test hangar and snow surface; outer campus accessible before Dreamland unlock.'),
 course('Flower','Choco Mountain','Quarry Run','dirt',
  ['Cutting entrance','Narrow uphill','Rockfall bend','Ridge traverse','Dusty downhill','Track return'],
  'A winding desert quarry extension gives the dirt venue a steep mountain circuit.',
  'A maintenance ledge crosses the inside of the ridge; a miss drops onto the lower main route.', 'Rounded foam test boulders tumble on a visible cycle; no lethal crushing or blind full-width blockage.', 'Expand northeast of Whoops with authored cliff cuttings, ridgeline and boulder runoffs; 500–650 m.'),
 course('Flower','Mario Raceway','Demo Team Circuit','demo',
  ['Demo grid','Hairpin','Hangar pipe tunnel','Grass infield','Technical S','Finish straight'],
  'A tighter showcase circuit: hairpin, S-bend, grass cut and hangar-size tunnel, with a clean demo-team identity.',
  'Boost across a rough infield strip; it loses time without enough speed.', 'Static tyre stacks mark the edge; the driving line is the challenge.', 'Create 450–550 m technical tarmac loop adjacent to demo hangar; share doors with free drive.'),
 course('Star','Wario Stadium','Whoops Stadium','dirt',
  ['Paddock grid','Whoop rhythm','Long berm','Tabletop jump','Cross-under','Final double'],
  'A longer stadium-style dirt loop built from berms, jumps and a memorable large leap.',
  'Inside berm and narrow double reward lifting before the jump; no checkpoint-skipping wall exploit.', 'Bad jumps lose speed and land safely on dirt, never reset a whole lap.', 'Enlarge Whoops to 700–900 m with a separate novice practice loop; 80–110 s per lap.'),
 course('Star','Sherbet Land','Ice Patrol','ice',
  ['Rubber grid','Ice lake oval','Bot slalom','Ice-island tunnel','Long drift','Grip strip'],
  'The recreation ice rink provides long low-grip turns, islands and penguin-shaped maintenance bots.',
  'An ice bridge through the central island requires a controlled entry and exit.', 'Bots cross predictably; blue recesses catch a wheel gently and slope back out.', 'Build the ice annex alongside, not instead of, the roller rink; 220–300 m loop.'),
 course('Star','Royal Raceway','Clubhouse Grand Prix','golf',
  ['Clubhouse grid','Garden bends','Pond approach','Big bridge jump','Clubhouse avenue','Green-side return'],
  'A grand sweeping road course with a large jump and a landmark clubhouse you can explore during free drive.',
  'A narrow cart path cuts the garden section; coins invite a clubhouse forecourt detour outside races.', 'Water margins have shallow banks; a missed jump joins the lower road.', 'Add officers’ club/clubhouse hero exterior and a 650–800 m paved loop beside existing golf.'),
 course('Star',"Bowser’s Castle",'Containment Circuit','lab',
  ['Bunker doors','Press corridor','Moving catwalk','Courtyard turn','Saucer chamber','Lab finish'],
  'The secret lab supplies imposing architecture and timed mechanical obstacles, with friendly aliens watching through glass.',
  'A maintenance catwalk crosses the saucer chamber; brake for its narrow landing.', 'Foam-faced test presses, sweeping doors and animated containment beams; all have anticipation cues and bypasses.', 'Expand Dreamland interior into a 450–600 m route; locked by the existing 15 specimens, with a visible turnaround outside.'),
 course('Special',"D.K.’s Jungle Parkway",'Canopy Run','tropical',
  ['Palm gate','Creek jump','Dock','Jungle bends','Maintenance tunnel','Canopy climb'],
  'A tropical survival conservatory provides the lush creek, dock, bridge jump and winding canopy route.',
  'A raised service walkway skips mud; a missed transfer falls to the slower bank.', 'Foliage never hides gates; workboat is scenery; fruit props give light, clearly cued bumps.', 'Build conservatory/garden next to wavepool and golf; 550–700 m route with two open road exits.'),
 course('Special','Yoshi Valley','Boneyard Maze','boneyard',
  ['Storage gate','Three-way split','Wing bridges','Fuselage canyon','Rejoin','Wide aircraft obstacle','Storage loop'],
  'Many narrow choices through retired aircraft converge before the finish. Route discovery is the skill.',
  'One high wing route is fastest; two ground routes are safer. All branches share equivalent gate progress.', 'A slow rotating radar dome sweeps the rejoin area; falls reach the service road.', 'Add authored multi-path graph and clear shared rejoin gates; keep race position visible in Kid mode.'),
 course('Special','Banshee Boardwalk','After Hours Boardwalk','waterpark',
  ['Closed-park arch','Lagoon boardwalk','Pump-house tunnel','Forked dock','Maintenance shed','Moonlit return'],
  'The wavepool’s after-hours service boardwalk gives the narrow night route, creaking timber and surprise silhouettes.',
  'A narrow maintenance gangway trims the pump-house detour; bright exit arrows prevent dead ends.', 'Friendly inspection drones and moths replace frightening creatures; rail gaps lead to shallow recovery shelves.', 'Build a 450–600 m permanent boardwalk around the lagoon, playable by day and dressed for night races.'),
 course('Special','Rainbow Road','Night Wave Portal','lab',
  ['Dreamland portal','Rainbow climb','Floating curves','Saucer fly-by','Starlight spiral','Return portal','Lab apron'],
  'The finale is Rainbow Road through an alien portal: a luminous floating track in strange space, entered by driving through the Dreamland portal and exited through the same visible connection back to the base.',
  'Optional inside catwalk saves a broad bend but has a narrow dogleg; the main route has guardrails.', 'Slow UFO inspection pods move with clear tells; the alien marshal beams fallen cars back to the last safe course node. A separate exit always returns to the Dreamland apron.', 'Build a 1.5–2 km portal course with luminous roadway, starfield, visible guardrails, saucer fly-bys and two-way return portal. Prepare the course before the portal opens; preserve the same session, car and saved base state. One-lap expedition finale; three-lap full-cup variant. Accessible after Dreamland discovery.')
]
battles=[
 dict(reference='Big Donut',name='Fuel Depot Ring',place='ramp',shape='A broad circular service road around a fenced central storage island; four evenly spaced item bays and no dead-end pockets.',play='See an opponent across the ring, choose which way to chase, cut behind the storage island for cover. Centre is a visible restricted island, not a damaging pit.'),
 dict(reference='Block Fort',name='BX Pallet Forts',place='bx',shape='Four coloured pallet forts in the warehouse yard, three driveable heights, perimeter ramps and narrow connecting bridges.',play='Climb for sightlines and item access; drop to ground to escape. Distinct colours make positions readable above the weather balloons.'),
 dict(reference='Double Deck',name='HQ Parking Decks',place='hq',shape='Three open parking levels connected by ramps on alternating sides, with central openings and broad lower escape lanes.',play='Read opponents’ height from their balloons and ramps; vertical routes offer choices rather than sealed camping pockets.'),
 dict(reference='Skyscraper',name='Hangar Roof Deck',place='hangars',shape='A square elevated maintenance deck with a central opening and four exposed side ledges; a permanent external service ramp connects to the base.',play='The compact roof makes positioning matter. Alien marshal recovers falls; Kid recovery preserves balloons, Big Kid loses one. Roof battle remains optional.')
]
data = dict(
    title='Saucer Springs AFB', subtitle='World design · 23 October 2026',
    note='Design target, not a completion claim. Existing anchors follow the current game; proposed sites are fictional placements pending footprint clearance. Routes within venues are schematic.',
    sectors=[dict(id='town',name='Base town',color='#b77c43'),dict(id='airfield',name='Flight line',color='#537c93'),dict(id='leisure',name='Recreation',color='#568b70'),dict(id='desert',name='Desert playground',color='#bb765d'),dict(id='secret',name='Dreamland',color='#8a78a4')],
    places=places,courses=courses,battles=battles,
    connections=[dict(from_=a,to=b,label=l) for a,b,l in [
      ('gate','hq','Civic road'),('hq','housing','North town road'),('hq','hospital','Civic green'),
      ('gate','bx','Town spine'),('bx','school','School road'),('bx','commissary','Retail campus'),
      ('school','gym','Recreation loop'),('gym','wic','Campus paths'),('wic','rink','Campus paths'),('rink','bowling','Rec plaza'),('bowling','diamond','Recreation loop'),
      ('diamond','zoo','South base road'),('zoo','golf','South loop'),('golf','waterpark','Cart road'),
      ('gate','ramp','Flight-line road'),('ramp','hangars','Service lane'),('hangars','demo','Service lane'),('hangars','runway','Taxiway'),
      ('runway','dirt','Desert service road'),('dirt','boneyard','Storage loop'),('boneyard','lab','Eastern perimeter'),('lab','ramp','North perimeter'),
      ('housing','stables','Housing service lane'),('dirt','rail','Supply road'),('rail','runway','South service road'),('lab','coldlab','Outer test-campus road'),('coldlab','ramp','Eastern service road'),('diamond','ice','Recreation path'),('golf','tropical','Cart path'),('tropical','waterpark','Garden path')]],
    systems=[
      dict(name='One continuous world',detail='Drive through every public door and gate in one session. Races temporarily add gates, rivals and pickups to the existing place; finishing returns control at the finish line.'),
      dict(name='Find a route',detail='Map selects a destination and draws a ground ribbon through real openings. Fast travel is an explicit separate action for discovered places; it never substitutes for a driveable road.'),
      dict(name='Short races, long journeys',detail='Most laps target 40–60 seconds. The existing 5.8 × 6.3 km base remains large; cross-base drives take minutes. Town clusters provide frequent turns, props and optional discoveries.'),
      dict(name='Kid / Big Kid',detail='Kid assists prevent trapping and soften steering; rivals still race competitively. Big Kid removes handling help. Furball uses three balloons each, clear attack cues and post-hit Chaff.'),
      dict(name='Mario Kart 64 correspondence',detail='16 courses and four battle arenas each have a physical Saucer Springs counterpart. Use MK64 as the default for race flow, items, readable hazards and the marshal; Re-Volt supplies toy handling and the connected base supplies exploration.'),
      dict(name='Alien marshal = Lakitu',detail='A friendly alien on a small saucer presents start lights, lap/final-lap boards, wrong-way arrows, the finish flag, Retreat’s stop sign and visible tractor-beam recovery. Every cue works on mute. This supersedes the robot MP design.'),
      dict(name='Progress',detail='15 existing specimens open Dreamland. Coins and records reward optional mastery. Nose art updates from lifetime Furball pops; five bodies and jet shells stay in the garage.'),
      dict(name='Art target',detail='Sculpted toy buggy and recognisable real hardware; warm Nellis-inspired desert town, tactile materials, low-camera detail, friendly aliens, no real unit logos.'),
      dict(name='Weapons',detail='Afterburner, Splash, Hydraulic Leak, Chaff, Fox Two, Pitbull, Fox One and Zuni. Remove the rejected trailer from the target design. Flare, Buddy Lase, JDAM and pudding have bounded optional designs in the specification.')])
for edge in data['connections']:
    edge['from']=edge.pop('from_')
out=Path(__file__).with_name('design.json')
out.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
print(f'{out}: {len(places)} places')

# Keep the reviewable document and the interactive atlas on the same catalogue.
import re
document=Path(__file__).with_name('master-design.md')
if document.exists():
    text=document.read_text()
    matrix=['| Cup | MK64 course | Saucer Springs course / physical home | What carries over |', '|---|---|---|---|']
    for c in courses:
        site=next(p for p in places if p['id']==c['place'])
        matrix.append(f"| {c['cup']} | {c['reference']} | **{c['name']}** — {site['name']} | {c['signature']} |")
    for c in courses:
        matrix += [f"\n### {c['reference']} → {c['name']}",f"**Route:** {' → '.join(c['route'])}.",f"**Shortcut:** {c['shortcut']}",f"**Hazards and fallback:** {c['hazards']}",f"**Construction:** {c['newWork']}"]
    battle=['| MK64 arena | Saucer Springs arena | Physical layout and play |','|---|---|---|']
    for b in battles:battle.append(f"| {b['reference']} | **{b['name']}** | {b['shape']} {b['play']} |")
    briefs=[]
    for p in places:
        briefs += [f"\n## {p['number']:02d}. {p['name']}",f"**Site:** ({p['x']}, {p['z']}) · {p['placement']}. **Current state:** {p['status']}.",p['purpose'],f"**Arrival and exit:** {p['entrance']}",f"**Drive through:** {' → '.join(p['route'])}.", '| Activity | Shape / target | Signature |','|---|---|---|']
        for e in p['events']:briefs.append(f"| {e['name']} | {e['type']} · {e['length']} · {e['time']} | {e['hook']} |")
        briefs += [f"\n**Skill line:** {p['shortcut']}",f"**Recovery and fallback:** {p['recovery']}",f"**Art:** {'; '.join(p['art'])}.",f"**Discovery:** {p['collectible']}",f"**Done when:** {p['acceptance']}"]
    for key,block in [('COURSE_MATRIX',matrix),('BATTLE_MATRIX',battle),('PLACE_BRIEFS',briefs)]:
        start=f'<!-- {key} -->';end=f'<!-- END_{key} -->'
        replacement=start+'\n\n'+'\n\n'.join(block)+'\n\n'+end
        pattern=re.escape(start)+'(?:.*?'+re.escape(end)+')?'
        text=re.sub(pattern,lambda _:replacement,text,flags=re.S)
    # Markdown tables require contiguous rows.
    text=re.sub(r'(?m)(\|[^\n]*\|)\n\n(?=\|)',r'\1\n',text)
    document.write_text(text)
