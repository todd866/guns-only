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
