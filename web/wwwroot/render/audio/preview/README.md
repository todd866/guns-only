# Jet audio preview

- `jet_preview.html` — controlled F-22 cue matrix plus gun, gear, and Rapier regressions.
- `cue_matrix.js` — pure snapshot presets and pass/sweep timelines used by the preview and tests.
- `jet_wav_export.html` — OfflineAudioContext → WAV download.
- `wav_dump_server.mjs` — serves this tree + `../samples/jet/`.
- `out/` — rendered listen checks (gitignored).
- `ref/` — local A/B pulls (gitignored).

## Cue matrix

The matrix is organized around controlled comparisons:

- 60 / 80 / 100% F-22 core RPM plus full augmentation at fixed dynamic pressure;
- low / high dynamic pressure at fixed power;
- +1 / +3 / +6 / -2 G at fixed power and dynamic pressure;
- an approaching/crossing/receding close fighter and a distant Tu-95/Bear;
- cockpit versus external-chase perspective at the same F-22 state.

The automatic buttons loop the same states. The live readout shows power, RPM, computed dynamic
pressure, signed G, perspective, and (for traffic) range and closure. Traffic presets drive the
production `updateContactAcousticVoices` path; they do not synthesize a preview-only flyby. Pass
geometry remains on one side of the aircraft—far ahead, abeam, then behind—so the lab also exercises
the production canopy-attenuated stereo position and range-dependent atmospheric filter.

The preview routes engine and event voices through the production-shaped dynamics stage
(`-18 dB` threshold, `12 dB` knee, `4.5:1`, `5 ms` attack, `180 ms` release) and the engine's
own master before the `0.55` preview output gain.

This is intentionally foreground-only tooling. Blur, page hide, or document hide immediately cuts
the preview master, stops its animation loop, clears the pressed cue, and suspends its AudioContext.
The page publishes `data-audio-*` ownership/state attributes on `<html>` for browser QA.

For automated production flight checks, use `/?audioQa=silent` instead of this audible lab. That
mode runs the real flight graph and reports active signal state while holding destination gain at
zero.

## Hybrid beds

Loops and aggregate reference profiles live in `../samples/jet/`.
See `../samples/jet/SOURCES.md`: Rapier primaries are CC0-derived; cockpit alternates are original
synthesis generated from aggregate spectra. No YouTube or DVIDS reference PCM ships.

```bash
PORT=8879 node web/wwwroot/render/audio/preview/wav_dump_server.mjs
open http://127.0.0.1:8879/preview/jet_preview.html
```

Console should log `<character> sample beds attached`. If you see procedural fallback, the loops
are missing.
