# Jet audio research library

This is the tracked index for the Guns Only jet-audio corpus. It is deliberately
split from the local media vault:

- `catalog.json` records sources, provenance, perspective, acoustic role, rights
  status, review priority, and timecoded annotations.
- `profiles/` contains small derived measurements. A profile may describe a
  reference recording, but must not contain source PCM.
- `recipes/` records how original production assets were synthesized or mixed.
- `analysis/jet-audio-library/` contains synchronized videos, extracted WAVs,
  thumbnails, and provider metadata. The entire directory is gitignored.

Reference-only media is welcome in the local vault. It cannot be copied into
`web/wwwroot`, and shipping QA treats `reference_local` as a hard boundary.

## Perspectives

Do not compare recordings merely because they feature the same aircraft.
Microphone placement dominates the result. The controlled perspectives are:

- `cockpit_airframe`: camera fixed to cockpit or canopy structure
- `helmet_mask`: pilot-mounted or intercom/mask feed
- `chase_aircraft`: recorded from another aircraft
- `external_near`: flight line, runway edge, or close flyby
- `external_far`: distant flyover or environmental arrival/departure
- `test_cell`: stationary engine instrumentation or camera
- `mechanism_close`: maintenance recording of a component
- `collection`: dataset or archive rather than one recording

## State annotation

Loudness is not throttle. Every useful segment should independently annotate:

- `engine_power`: off, start, idle, taxi, spool-up, military, afterburner,
  spool-down, or unknown
- `dynamic_pressure`: low, medium, high, or unknown
- `g_load`: negative, one-g, positive-moderate, positive-high, onset, unload,
  or unknown
- `events`: configuration, buffet, gun, canopy, touchdown, catapult, flyby,
  pass, and other visible/audible events
- `evidence`: telemetry, visible control/HUD, manoeuvre inference, description,
  or unknown, plus a confidence from 0–1
- `contaminants`: speech, music, radio, wind overload, clipping, camera AGC,
  edits, or replaced audio

The earlier cockpit profiler divided frames into `idle/mil/grit` by RMS
quantiles. Those labels are retained only for reproducibility of existing beds;
new profiles must come from timecoded, independently annotated segments.

## Commands

```bash
python3 tools/audio/jet_library.py validate
python3 tools/audio/jet_library.py list --tag cockpit
python3 tools/audio/jet_library.py fetch --id dvids.759958
python3 tools/audio/jet_library.py fetch --id youtube.aPU8AIqF1l0
python3 tools/audio/jet_library.py probe --id dvids.759958
python3 tools/audio/jet_library.py analyze --id dvids.759958
python3 tools/audio/jet_library.py review-index
python3 -m http.server 8765 --directory analysis/jet-audio-library
```

`fetch` preserves the video and extracts a synchronized mono analysis WAV. It
also writes hashes and ffprobe output into the ignored local vault. Use the
lowest video resolution that preserves HUD/control/manoeuvre evidence; audio is
kept at the best available stream quality. The default fetch ceiling is 480p
and is verified after download because some providers omit format-height
metadata; pass `--max-video-height 720` for a source whose cockpit evidence
genuinely needs more detail, or `0` to retain the fetched resolution.

`review-index` builds `analysis/jet-audio-library/review.html`, a searchable
local gallery with synchronized video playback and source annotations. Serve
the ignored vault and open `http://localhost:8765/review.html`; the page never
embeds or copies media into tracked files.

## Promotion rule

A reference can inform an original synthesis without becoming a production
asset. Source PCM may move into the redistributable tier only when its manifest
has a verified compatible licence. FOSS or educational intent does not itself
change a recording's licence.
