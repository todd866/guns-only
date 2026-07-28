# Jet sample beds (production)

## Rapier (F-4-derived) — License

Loops are derived from **StoneyJ — “Afterburner sound.wav”** (USAF F-4 Phantom taxi /
run-up / afterburner takeoff), published on Freesound as **Creative Commons 0 (CC0)**.
Mirror used for acquisition: Creazilla public-domain copy of the same recording.

- Source: https://freesound.org/people/StoneyJ/sounds/104883/
- License: CC0 — no attribution required (attribution kept here for provenance)

| File | Segment | Use |
| --- | --- | --- |
| `idle_loop.wav` | Early taxi / low power | Turbine idle bed |
| `mil_loop.wav` | Engine run-up | Military / power bed |
| `grit_loop.wav` | Afterburner-derived HP grit | Combustor edge under power |

## F-22 (cockpit) — License

`f22_{idle,mil,grit}_loop.wav` are **original synthesized** mono 44.1 kHz loops.
EQ targets were measured from the full ~19 min cockpit demo
[F-22 Raptor Demo flare show](https://www.youtube.com/watch?v=NWxtuDEyK9g)
(band energy: heavy sub/body, muted tip whine). No YouTube PCM is shipped.

| File | Regime target | Use |
| --- | --- | --- |
| `f22_idle_loop.wav` | Quieter tercile of demo body | Sealed cabin idle |
| `f22_mil_loop.wav` | Mid power | Cruise / mil cockpit rumble |
| `f22_grit_loop.wav` | Louder tercile | High-power cabin thump |

## Rebuild

```bash
# Rapier — after placing stoney_f4.flac in /tmp/jet-cc0/
ffmpeg -i stoney_f4.flac -ac 1 -ar 44100 f4_mono.wav
# then cut/normalize segments per engine_audio hybrid pipeline notes

# F-22 — re-measure full demo WAV then run analysis/audio-refs spectral match script
```

If loops are missing at runtime, `engine_audio.js` falls back to the procedural stack.
