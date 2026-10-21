# Area 51½ — direction (owner, 2026-10-21)

Supersedes the "Blacksite RC" framing in `rc-blacksite.md`. The engineering in that doc still
stands; the name, audience and world change.

## The pitch

Toy RC cars racing through a whole American military base, Re-Volt style: tiny cars in a
full-size world, bouncy suspension, silly pickups, hidden stars. The base is a small town,
not a compound. Families live there, kids go to school there, the jets park there, and
somewhere behind a fence marked AUTHORIZED PERSONNEL ONLY they keep the aliens.

The name is the joke: it's half of Area 51, at toy scale.

## Audience: a six-year-old

Re-Volt made the owner's six-year-old cry. He is the target player. That is the main design
constraint, and it changes Re-Volt's feel in specific ways:

| Re-Volt pain | Area 51½ answer |
|---|---|
| Car flips and stays stuck | Auto-righting after ~1 s, with a cheerful bounce. Never a dead stop. |
| Twitchy steering at speed | Speed-sensitive steering and traction assist **on by default**. A "Big Kid" toggle removes them. |
| Lost, wrong way | Big floating gate arrows and a glowing ground ribbon to the next gate. Wrong-way turns you round on R. |
| Falling off / out of the world | Soft boundaries that bounce you back. R recovery stays, with no time penalty in kid mode. |
| Last place, again | Opponents stay near the player (rubber-banding is a feature here). Every finish gets a celebration. Collecting things counts as winning too. |
| Long, confusing tracks | Short laps (~40–60 s) inside one district, joined by free roam. |

Difficulty for older players comes from opponent skill and the Big Kid toggle, never from the
handling punishing a small child.

## The base (one connected world, districts as tracks)

1. **Base housing:** cul-de-sacs, lawns, sprinklers that push the car around, garage-door
   ramps, a trampoline, a backyard barbecue.
2. **The school:** a polished gym floor (slidey!), locker hallways, a playground slide as a
   ramp, cafeteria tables to drive under.
3. **HQ offices:** under desks, rolling chairs as moving obstacles, a copier, a mail-cart
   shortcut.
4. **Commissary / BX:** supermarket aisles and stacked cans to knock over (our own nod to a
   Re-Volt classic, with original art).
5. **Flight line:** hangars, under parked jets (existing collision already handles wings vs
   gear), a runway drag strip, tugs crossing.
6. **Area 51½ proper (secret):** bunker doors, a lab, friendly aliens waving from tubes. It
   unlocks by finding the hidden alien specimens across the other districts.

Free roam links the districts the way the current ten-gate route links quarters → hangar →
containment.

## Pickups (cartoony, nothing violent)

Water balloon (lob), fireworks rocket (slow homing), motor-pool oil slick, bubble shield,
cafeteria pudding (sticky puddle), a "brrrp" zoom boost. Hits wobble or spin the target car.
They never wreck it.

## Tone

Bright, warm, jovial. The concept buggy (`assets/rc/concepts/buggy-hangar-v1.png`, approved)
still sets the car finish. The base should look lived-in and friendly (bikes on lawns,
flags, a basketball hoop), with the secret area as the one spooky-fun place.

## What exists vs. what this asks for

Exists: fixed-step sim, ten-gate route, ramps, recovery, specimens, flight-line collision,
original Blender buggy/hangar/aircraft/quarters, flight-shell pause/resume entry.

New: kid-mode assists (auto-right, steering/traction assist, guide ribbon, no recovery
penalty), AI opponents, pickups, the school/offices/PX/housing districts, the secret-area
unlock, and a brighter, friendlier art direction for the whole base.

## USAF flavour (owner, 2026-10-21: "plenty of USAF cultural references")

It's an Air Force base, so it's the BX, not the PX. The jokes are for the parents; the kid gets
bright signs and silly moments. Use no real unit insignia, seals or official logos, and give the
base a fictional name.

In the game:
- **Pickups:** Afterburner (boost), Water Balloon, Hydraulic Leak (oil slick) and Chaff (shield).
- **Gates are steerpoints.** A win is "Sierra Hotel!", a loss is "Next sortie!".
- **Retreat:** once a race the bugle sounds and every rival stops for the flag. The kid can keep
  driving.

On the backlog:
- **Set dressing:** PCS moving trucks and boxes, the reflective PT belt, "Yard of the Month",
  quiet-hours and 15 MPH signs, a gate-guard static jet, squadron rocks, a Security Forces
  "Defenders" booth, a water tower, and a "Flightline → / Area 51½: NO" sign.
- **Collectibles:** challenge coins, as Re-Volt's stars.
- **Flight line:** a FOD-walk mini-game, crew chiefs, the wing commander's reserved parking spot
  as a shortcut, and the golf course built before the runway.
- **Area 51½:** Janet-style flights and "Dreamland" signage.
