# Jet audio preview

- `jet_preview.html` — live regimes (click to unlock). Hybrid: real beds + procedural.
- `jet_wav_export.html` — OfflineAudioContext → WAV download.
- `wav_dump_server.mjs` — serves this tree + `../samples/jet/`.
- `out/` — rendered listen checks (gitignored).
- `ref/` — local A/B pulls (gitignored).

## Hybrid beds

Loops live in `../samples/jet/` (`idle_loop.wav`, `mil_loop.wav`, `grit_loop.wav`).
See `../samples/jet/SOURCES.md` — current beds are temporary local extracts until
confirmed CC0 / US-gov PD replacements land.

```bash
PORT=8879 node web/wwwroot/render/audio/preview/wav_dump_server.mjs
open http://127.0.0.1:8879/preview/jet_preview.html
```

Console should log `jet sample beds attached`. If you see procedural fallback, the loops are missing.
