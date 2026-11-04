# Saucer Springs AFB audio sources

All files: mono source, 44.1 kHz. `.mp3` is 128 kbps CBR mono. `.ogg` is Ogg Vorbis 96 kbps encoded as dual-mono stereo (the ffmpeg build here has only the native Vorbis encoder, which is stereo-only; gain +2.6 dB to match the mp3 level). Sources were the freesound.org HQ MP3 previews (`cdn.freesound.org/previews/.../*-hq.mp3`). Loops are cut at a rising zero crossing with an equal-power crossfade of the tail into the head, so they loop seamlessly. One-shots are DC-removed, silence-trimmed, with short fades. Raw downloads and the build scripts live in `~/.local/state/area51-audio/` (`raw/`, `tools/build.py`; the creatures: `tools/build-dino.py`).

Only CC0 and CC-BY material is used. CC-BY files need the attribution lines at the bottom.

| File | Source | Author | Licence | Original title | Cut |
|---|---|---|---|---|---|
| `motor_loop` | https://freesound.org/people/designerschoice/sounds/818585/ | designerschoice (Nicholas Judy, The Designer's Choice) | CC BY 4.0 | "TOYMech-Blue Snowball Microphone, CU_Car, RC, Motor_Nicholas Judy_TDC" (15.4 s, close-up RC car motor) | 2.4 s at 4.0 s (steady, level within 1 dB for the whole file; ~840 Hz whine fundamental), 0.12 s crossfade, RMS -20 dBFS |
| `motor_high_loop` | https://freesound.org/people/hookhead/sounds/16031/ | hookhead | CC0 | "toycarwheels.wav" ("spinning wheels of a remote controlled car", micro-track) | 2.3 s from 0.1 s, 0.15 s crossfade. Wheels spinning free: higher pitch and noisier than motor_loop, a stand-in for full speed |
| `servo` | https://freesound.org/people/plingativator/sounds/188917/ | plingativator | CC BY 4.0 | "rc_car_wheel_turn.wav" (Basement Pack 1; "Servo sounds from a remote control car") | one servo burst from 3.8 to 5.2 s, leading/trailing silence trimmed (1.4 s) |
| `squeal_loop` | https://freesound.org/people/johnnydekk/sounds/614627/ | johnnydekk | CC0 | "screeching tyres / tires" (hot water bottle dragged across tiles, Zoom H4n) | 2.4 s from 0.2 s of the first sustained squeal, 0.2 s crossfade, RMS -22 dBFS |
| `bump` | https://freesound.org/people/SpeedyVelcro/sounds/566117/ | SpeedyVelcro | CC0 | "Plastic Toy Car Crash / Impact" (made for the game CircleRC) | whole 0.22 s clip, trimmed, peak -2 dBFS |
| `landing` | https://freesound.org/people/sgrowe/sounds/342539/ | sgrowe | CC0 | "Plastic Thud 1" (Tascam DR-100 + Rode NTG2) | first 1.25 s trimmed to 0.62 s, 50 ms fade-out |
| `gravel_loop` | https://freesound.org/people/Heosound/sounds/825296/ | Heosound | CC0 | "toy car rolling" (toy car rolling on gravel, AT879) | 2.4 s from 0.4 s, 0.2 s crossfade, RMS -22 dBFS |
| `dino_roar` | https://freesound.org/people/Logicogonist/sounds/810951/ | Logicogonist | CC0 | "dinosaur roar 1" (7.8 s) | first 2.4 s, 0.35 s fade-out, peak -2 dBFS; played pitched per kind (the long-neck's is low and slow) |
| `dino_chirp` | https://freesound.org/people/qubodup/sounds/744795/ | qubodup | CC0 | "Small Evil Creature Warning Shout" (1.0 s) | first shout 0–0.32 s, peak -3 dBFS; the raptor's and the quetzalcoatlus's call |
| `dino_snort` | https://freesound.org/people/o_ciz/sounds/475483/ | o_ciz | CC0 | "Horse(snort)_3.wav" | first 0.55 s, peak -3 dBFS; the triceratops's call and every dinosaur's idle snort |
| `dino_step` | https://freesound.org/people/stewadosan/sounds/841139/ | stewadosan | CC0 | "Stomp 1" | one stomp 0.40–0.72 s, peak -2 dBFS; footfalls on the walk/run/gallop clips |
| `wing_flap` | https://freesound.org/people/2create/sounds/670509/ | 2create | CC0 | "Huge wing flaps for bird, dragon, dinosaur." (14.3 s) | one flap 0.95–1.50 s, peak -3 dBFS; the quetzalcoatlus's wingbeats |

Not found: a real RC-scale tyre squeal. `squeal_loop` is a tile-drag simulation of tyre screech (a recording of a real thing that sounds like one), and `landing` is a plastic thud, not an RC landing.

## Attribution (CC BY 4.0, required)

- "TOYMech-Blue Snowball Microphone, CU_Car, RC, Motor" by designerschoice (Nicholas Judy), https://freesound.org/people/designerschoice/sounds/818585/, licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited: trimmed, looped, normalised. Used as `motor_loop`.
- "rc_car_wheel_turn.wav" by plingativator, https://freesound.org/people/plingativator/sounds/188917/, licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Edited: trimmed, normalised. Used as `servo`.

CC0 sources (hookhead, johnnydekk, SpeedyVelcro, sgrowe, Heosound, Logicogonist, qubodup, o_ciz, stewadosan, 2create) need no attribution; SpeedyVelcro appreciates a credit.
