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

`rapier_{idle,mil,grit}_cockpit_loop.wav` are original synthesized interior-body alternates.
Their aggregate spectral target comes from the public-domain U.S. Air Force
[158th FW F-16 cockpit footage](https://www.dvidshub.net/video/669814/158th-fw-aerial-f-16-footage)
hosted by DVIDS. No DVIDS PCM is shipped. The F-16 profile contributes pressurized-cabin
80–800 Hz body while the CC0 F-4 beds retain Rapier's fictional turbo/ram identity. These beds
run for 18 seconds and keep authored amplitude movement deliberately restrained so a steady
power setting does not pulse at the loop period.

## F-14 cockpit bed — F/A-18 public-domain surrogate

`fa18_cockpit_f14_surrogate_loop.wav` is an **audio-only gameplay surrogate** conditioned from
an airborne cockpit interval in DVIDS
[F-18 Cockpit B-Roll](https://www.dvidshub.net/video/342602/f-18-cockpit-b-roll).
The recording is an F/A-18 source, not an F-14 recording, and the shipped loop makes no exact
F-14 acoustic claim.

- Creator: Cpl Anthony Rayis / AFN Iwakuni; footage courtesy of Maj Erik Sprague.
- Taken: 2014-06-11; VIRIN `140611-M-ZP289-002`; DOD ID `DOD_101732906`.
- Production interval: 47.5–58.5 seconds.
- Acquired source object:
  `https://d34w7g4gy10iej.cloudfront.net/video/1406/DOD_101732906/DOD_101732906-720x406-800k.mp4`
- Acquired source SHA-256:
  `71f280415131d3df76fdbdf0b9431dd62f78958951d6e5f9103c007e81e54e9a`.
- Final WAV: 1,048,364 bytes; 48 kHz mono PCM16; 10.92 seconds; mean −20.0 dBFS,
  maximum −7.0 dBFS; SHA-256
  `4f6312519c9f78ef2896efe19b52fc1d68ec0bbb3caef14d9f22ea4bf939e659`.

The DVIDS item page explicitly marks the work **PUBLIC DOMAIN**, subject to the
[DVIDS copyright notice](https://www.dvidshub.net/about/copyright). The source-derived WAV is
not relicensed under this repository's MIT license. No source visuals, logos, or marks are
distributed. This is a reasonable safe-use assessment, not a legal warranty.

> The appearance of U.S. Department of War (DoW) visual information does not imply or constitute DoW endorsement.

Silent-frame, waveform, and spectrum screening found no obvious speech or music in the selected
interval. That mechanical screening cannot establish semantic absence; a final human listen
remains required before release acceptance.

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

`f22_{idle,mil,grit}_alt_loop.wav` are a second independently seeded set generated from the
tracked aggregate `f22_palette_profile.json`. Runtime equal-power crossfades the two sets.

## Aggregate profiles and rejected references

- `f22_palette_profile.json` — band fractions/centroid/rolloff from the F-22 demo reference.
- `rapier_cockpit_profile.json` — aggregate cockpit spectrum from DVIDS video 669814.
- DVIDS [F-22 cockpit B-roll 845172](https://www.dvidshub.net/video/845172/f-22-raptor-demo-team-cockpit-b-roll)
  was evaluated and rejected: its embedded audio is effectively digital silence.
- The tracked research index is `audio/jet-library/catalog.json`.
- New synchronized reference video/audio, hashes, and review metadata stay under gitignored
  `analysis/jet-audio-library/`; the earlier one-off pulls remain in `analysis/audio-refs/`.
- Reference-only media cannot be promoted into this production directory.

## Rebuild

```bash
# Rapier — after placing stoney_f4.flac in /tmp/jet-cc0/
ffmpeg -i stoney_f4.flac -ac 1 -ar 44100 f4_mono.wav
# then cut/normalize segments per engine_audio hybrid pipeline notes

# F-22 / Rapier cockpit alternates — measure aggregate profiles, then synthesize original beds
python3 -m pip install -r tools/audio/requirements.txt
python3 tools/audio/cockpit_palette.py self-test
python3 -m unittest tools/audio/test_cockpit_palette.py

python3 tools/audio/cockpit_palette.py analyze \
  --input analysis/audio-refs/f22-cockpit-full.wav \
  --output web/wwwroot/render/audio/samples/jet/f22_palette_profile.json \
  --source-id youtube.NWxtuDEyK9g \
  --source-url 'https://www.youtube.com/watch?v=NWxtuDEyK9g'

python3 tools/audio/cockpit_palette.py analyze \
  --input analysis/audio-refs/dvids-f16-cockpit-669814.wav \
  --output web/wwwroot/render/audio/samples/jet/rapier_cockpit_profile.json \
  --source-id dvids.669814 \
  --source-url 'https://www.dvidshub.net/video/669814/158th-fw-aerial-f-16-footage'

python3 tools/audio/cockpit_palette.py synthesize \
  --profile web/wwwroot/render/audio/samples/jet/f22_palette_profile.json \
  --output-dir web/wwwroot/render/audio/samples/jet \
  --prefix f22 --suffix alt --seconds 6 --seed 20260728 \
  --target-rms-dbfs=-16,-14.5,-13.5

python3 tools/audio/cockpit_palette.py synthesize \
  --profile web/wwwroot/render/audio/samples/jet/rapier_cockpit_profile.json \
  --output-dir web/wwwroot/render/audio/samples/jet \
  --prefix rapier --suffix cockpit --seconds 18 --seed 20260729 \
  --target-rms-dbfs=-30,-30,-22

# Final deterministic conditioning for the six primary beds. This removes hard PCM wraps with an
# idempotent 80 ms equal-power overlap; rerunning on an already conditioned bed is byte-preserving.
for bed in idle_loop mil_loop grit_loop f22_idle_loop f22_mil_loop f22_grit_loop; do
  python3 tools/audio/cockpit_palette.py condition-loop \
    --input "web/wwwroot/render/audio/samples/jet/${bed}.wav" \
    --output "web/wwwroot/render/audio/samples/jet/${bed}.wav"
done
```

If loops are missing at runtime, `engine_audio.js` falls back to the procedural stack.
