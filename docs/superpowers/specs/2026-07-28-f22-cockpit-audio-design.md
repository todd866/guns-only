# F-22 in-cockpit audio (design)

Status: approved · 2026-07-28 · Reference: [F-22 Raptor Demo flare show (cockpit)](https://www.youtube.com/watch?v=NWxtuDEyK9g) (full ~19 min track)

## Goal

Ownship F-22 must sound like **sealed cockpit**, not an exterior flyby. Match the demo cam: heavy sub/body rumble, muted tip whine, dark cabin ceiling.

## Constraint

Do **not** ship YouTube PCM (copyright). Measure the full recording’s regime spectra; synthesize original `f22_{idle,mil,grit}_loop.wav` beds that match those EQ targets. Procedural stack is the degraded fallback.

## Approach

1. Load F-22 beds when `audio_profile` / aircraft resolves to `f22`.
2. Keep Rapier F-4 beds on the Rapier path only.
3. F-22: no ram handover; duck fan/shaft tonal tells; darker cabin LP; beds keep sub (sample HP ~30 Hz, LP ~3.5 kHz).
4. High-G canopy whine stays as the only bright airframe tell.

## Feel gate

A/B against the reference track at cruise and high power: LF thump present, no screaming tip whine, no Rapier AB grit identity.
