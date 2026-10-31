# RC sound audit

31 Oct 2026. Owner: the sounds are "way too primitive and annoying" (morning), then "the dino needs
dino sounds not car sounds, holistically look at the sounds in the game and talk to the other
agents" (afternoon). This combines a pass over `web/wwwroot/rc/audio.js` and its call sites in
`main.js` (as of main be69f74d) with guns-only-5d's list. Owner of each fix: **5e** (the dark-world
session, which has the sound area until further notice) unless marked otherwise.

## What the game has

- **Recorded clips** (CC0 / CC-BY, `assets/audio/SOURCES.md`): the RC car's motor (low and high
  loops), tyre squeal, gravel roll, bump, plastic landing thud and servo; and since `e3cf4088` the
  creature set: dinosaur roar, small-creature chirp, snort, footfall stomp and wingbeat.
- **Synthesised cues** (all in `audio.js`): `finish` (22 calls), `impact` (21), `radio` (15),
  `coin` (10), `boost` (8), `pickup` (5), `gate` (5), `splash` (4), `landing` (2), `fire` (2),
  `bugle` (2), `beep` (2), `jet`, `splat`, `grinding`, and the hero's `robot` voice.

## What's wrong, and the fix

| # | Problem | Fix | Owner |
|---|---|---|---|
| 1 | **Riding a dinosaur played the RC car's motor.** | Body-aware `audio.update({body})`; creature footfalls, calls, snorts, wingbeats. | 5e, **done** (`e3cf4088`) |
| 2 | **Four generic cues carry almost every event.** A golf hole-out, a penned cow, the Rat King's crown, the digger freed, the booster landing, a small key, retreat and a race win all play `finish` or `coin`, so nothing sounds special. | A small set of distinct cues: **win** (race, boss beaten), **small good** (a penned cow, a hole-out), **discovery** (a new place, a new Dino Book page), **item get** (a short fanfare when a dungeon item is won), **key** (a bright two-note chime). Map every call site to one of them. | 5e |
| 3 | **`radio()` chirps on almost every message.** With the hero's robot beep for his own lines, the radio chime is noise on most callouts. | Radio only for real radio (tower calls, playmate challenges); the hero's lines beep; plain notices are silent. | 5e |
| 4 | **On foot there is no sound at all.** The robot and the cowboy walk silently. | Footsteps from the walk cycle, as the dinosaur does: a light tin-toy tap for the robot, boot clops for the cowboy. | 5e |
| 5 | **The skateboard** has a grind scrape but no wheel roll on concrete. | A wheel-roll loop on the board, pitched by speed; drop the RC motor for the board body. | 5e |
| 6 | **The golf cart** uses the RC car's motor. | An electric whine for `body: 'golf'`. | 5e |
| 7 | **Flight**: no sound for the parachute opening or the retro burn. | A cloth pop on deploy; a filtered hiss-roar for the retro burn that fades out. | 5e |
| 8 | **The booster landing** is two `impact()` calls. | A real low rumble on ascent, a landing-burn roar that fades, then a thump. | 5e |
| 9 | **Bosses use generic impacts**: the Rat King (squeak, charge) and the digger (the hydraulic whine on its sweep tell, the slam). | Their own cues: a squeak and scurry for the Rat King; a hydraulic whine that rises with the tell, then a metal slam, for the digger. | 5e (or 5d after this lands) |
| 10 | **Missing sounds** where things already exist: golf club strike, ball in the cup, a water splash; steers' moo and hooves (meadow); sewer drips and a slime loop; trick-or-treat doorbell or knock and a "boo". | Recorded where a clean CC0 source exists, synthesised otherwise; one per item. | golf cues: 5d offered; the rest 5e |
| 11 | **Everything is close and dry outside**: no wind, no birds, no town hum. | Light ambient beds per place: desert wind, birds by the river, cicadas at dusk, the base's far jet rumble; in the dark world, cattle and windmill creaks. | 5e, after 2–10 |

## Rules for new sounds

- Prefer a recorded clip (Freesound CC0 first, CC-BY with attribution), cut with the scripts in
  `~/.local/state/area51-audio/tools/`, recorded in `SOURCES.md` and the asset manifest
  (`node tools/rc/asset-manifest.mjs update`, then `check`). Synthesise only where no clean
  source exists.
- One sound per meaning; a cue the player hears every few seconds must be soft, short and varied
  (random pitch and level), with a cooldown (`audio.ready`).
- Toy scale: recordings of big things are pitched up a little and kept short.
- Test silently: `?audioQa=silent`, and a QA count of what played (`__gunsOnlyRC.sounds()`).
