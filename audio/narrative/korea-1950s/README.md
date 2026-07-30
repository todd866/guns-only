# Korea narrative voice audition

This is a production casting path for the Armstrong cable-strike sequence. It does not use
`audio/radio/mission/lines.json`, `tools/audio/radio_voice.py`, OpenAI TTS or browser/device speech.

The tracked files contain text, provider pins and audition policy only. Generated audio defaults
outside the public repository:

```text
/Users/iantodd/Projects/armstrong-korea-research/derived/voice-auditions/
```

## Validate and inspect the plan

```sh
python3 tools/audio/korea_narrative_voice.py validate
python3 tools/audio/korea_narrative_voice.py plan \
  --candidates audio/narrative/korea-1950s/candidates.example.json
```

An empty candidate file is valid as a template but generation will refuse it.

## Discover voices

Credentials may be set in the environment or stored in macOS Keychain under service
`guns-only-voice-providers`, with the environment-variable name as the account. Environment
variables take precedence. To store a clipboard-held key without printing it:

```sh
security add-generic-password -U \
  -a HUME_API_KEY -s guns-only-voice-providers -w "$(pbpaste)"
```

Then retrieve normalized voice metadata:

```sh
ELEVENLABS_API_KEY=... \
  python3 tools/audio/korea_narrative_voice.py voices \
  --provider elevenlabs --query American

python3 tools/audio/korea_narrative_voice.py voices \
  --provider hume

CARTESIA_API_KEY=... \
  python3 tools/audio/korea_narrative_voice.py voices \
  --provider cartesia --query pilot
```

The command prints IDs, names, descriptions, labels and provider preview URLs. It never downloads
or plays a preview. Listening remains a separate, explicitly owned audible-review session.

Copy `candidates.example.json` to a private or ignored path and add records:

```json
{
  "schemaVersion": "1.0.0",
  "auditionId": "audition.korea-1951.armstrong-cable-strike.v1",
  "candidates": [
    {
      "candidateId": "eleven-armstrong-a",
      "provider": "elevenlabs",
      "speakerId": "speaker.armstrong.v1",
      "voiceId": "provider-voice-id",
      "voiceName": "review label",
      "rightsNote": "Provider voice-library candidate; commercial rights review pending."
    }
  ]
}
```

Voice IDs and provider metadata are not secrets. API keys are.

## Generate dry audition takes

```sh
ELEVENLABS_API_KEY=... \
  python3 tools/audio/korea_narrative_voice.py generate \
  --candidates /private/path/korea-voice-candidates.json \
  --provider elevenlabs
```

The default packet is five representative lines across Armstrong and Carpenter, each generated in
`restrained`, `compressed` and `recovery` profiles. Use repeatable `--candidate ID`, `--line ID`
and `--take ID` filters to narrow a timing experiment to one provider request, and `--dry-run` to
inspect every requested asset without spending credits.

The catalog may provide a punctuation-only `performanceText` for TTS pacing while preserving
the approved `text` for captions and historical review. Validation rejects a performance string
that adds, removes or reorders scripted words. The timing basis and measured examples live in
`docs/art-direction/korea-1950s/narrative/radio-performance-reference.md`.

Outputs include:

- dry mono WAV files;
- an audition manifest with model, voice, line, take, request and file hashes;
- measured sample rate, channel count and duration;
- no key, authorization header or historical recording.

The generator will not overwrite an existing take unless `--force` is supplied.

## Build a blind packet

After generating two or more candidate/model runs:

```sh
python3 tools/audio/korea_narrative_voice.py blind \
  /path/to/run-a/audition-manifest.json \
  /path/to/run-b/audition-manifest.json \
  --output /path/to/blind-review
```

`review-sheet.json` contains only blind clip IDs, role, line, take and scoring criteria.
`blind-map.private.json` retains the provider/candidate mapping and stays away from reviewers.

## Production boundary

Audition success does not promote a clip. Production generation remains blocked until the script,
period phraseology, technical procedure and rights gates in
`docs/art-direction/korea-1950s/narrative/voice-production.md` are closed.

The historical mission has no robotic fallback. If an approved clip is missing, captions carry the
information and authority continues independently of audio.
