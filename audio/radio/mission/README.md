# Guns Only mission radio

`lines.json` is the authoritative finite speech catalog for tower, approach, tactical, traffic,
fuel, weapons, and mission-result calls. The simulation chooses a catalog ID from physical events;
the browser never invents dialogue.

The wording follows two public baselines:

- FAA AIM 4-2 for clear addressing, complete initial callsigns, number pronunciation, and
  acknowledgements/readbacks.
- AFTTP 3-2.5 for tactical brevity. Brevity is used only for its defined event: `GUNS` means the
  gun is firing, `FOX TWO` means an IR air-to-air missile was launched, `SPLASH` follows a
  destruction event, `JOKER`/`BINGO` follow configured fuel thresholds, `REMINGTON` means no
  usable air-to-air ordnance except gun, and `WINCHESTER` means no ordnance remains.

Validate the catalog and preview the generation plan:

```sh
python3 tools/audio/radio_voice.py validate
python3 tools/audio/radio_voice.py generate --dry-run
```

Generate WAV clips and the web manifest:

```sh
OPENAI_API_KEY=... python3 tools/audio/radio_voice.py generate
```

The generated WAV files are intentionally untracked. The tracked manifest can remain empty; when
a clip is absent, the browser uses device speech and still applies the same radio band-pass,
compression, squelch, and engine ducking.

## Comms doctrine (2026-07-29)

Every radio call is an update to a shared mental model: **who am I, where am I, what do I think
I'm cleared to do, what do I want to be cleared to do.** Calls that carry none of those four
fields are noise; calls that do are curriculum ("aviate, navigate, communicate, administrate" —
comms must be present and realistic even when automated). Voice bar: emotion and feeling in a
military register — controlled urgency, not flat TTS. Clips are pre-generated and re-used;
no live token spend.

## Open work

- **Chatter everywhere**: the doctrine wants realistic traffic across every part of the game —
  the guns-only dogfight, the Rapier intercept, Medevac — not just the Circuits pattern. Tactical
  phases currently react to Intercept/Escape/RTB/Recovery only.
- **Clip catalog**: `manifest.json` ships empty; device-speech fallback carries the feature.
  Authored WAV generation (mil-register, emotional) needs a voice pipeline and the user's ear.
- **Captions beyond Circuits**: tactical/approach calls have no caption surface yet.
- **Traffic is heard, not seen**: CircuitPatternTraffic ships render no hulls.
- **AiGenerated labeling**: decide at playback (catalog clip vs device speech), not at authoring.
- **Geometry unification**: CircuitPatternTraffic re-states Circuits shelf/final constants beside
  RapierMissionDirector; a future pattern edit can desync flown gates from spoken legs.
- **LSO advisor dedup**: UpdateMissionRadio re-runs Lso.AdviseForMode in parallel with the HUD
  path; drift risk.
