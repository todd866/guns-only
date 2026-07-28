# Jet sample beds (production)

## License

Loops are derived from **StoneyJ — “Afterburner sound.wav”** (USAF F-4 Phantom taxi /
run-up / afterburner takeoff), published on Freesound as **Creative Commons 0 (CC0)**.
Mirror used for acquisition: Creazilla public-domain copy of the same recording.

- Source: https://freesound.org/people/StoneyJ/sounds/104883/
- License: CC0 — no attribution required (attribution kept here for provenance)

## Files

| File | Segment | Use |
| --- | --- | --- |
| `idle_loop.wav` | Early taxi / low power | Turbine idle bed |
| `mil_loop.wav` | Engine run-up | Military / power bed |
| `grit_loop.wav` | Afterburner-derived HP grit | Combustor edge under power |

Loops are mono 44.1 kHz, envelope-flattened and crossfaded for seamless playback.
Raw `_*.wav` / source FLAC stay local/gitignored — do not commit.

## Rebuild

```bash
# After placing stoney_f4.flac in /tmp/jet-cc0/
ffmpeg -i stoney_f4.flac -ac 1 -ar 44100 f4_mono.wav
# then cut/normalize segments per engine_audio hybrid pipeline notes
```

If loops are missing at runtime, `engine_audio.js` falls back to the procedural stack.
