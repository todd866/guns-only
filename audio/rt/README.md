# Reusable R/T production gate

`tools/audio/rt_performance.py` is the provider-neutral acceptance gate for dry
radio speech. It measures what a synthesis provider actually returned rather
than trusting speed settings, acting prompts, or nominal model quality.

It does not replace phraseology research or the owner ear. It removes obvious
failures before listening and directs human attention to borderline takes.

## Production loop

1. **Authorize the transmission.** Record who needs the call, what shared state
   changes, the workload at key-down, and whether a reply is required. If the
   call changes no useful state, cut it.
2. **Lock canonical words.** Phraseology and historical review own the text.
   Provider punctuation may alter delivery but not add, remove, or reorder
   words.
3. **Assign a performance profile.** Choose `routine`, `pattern-report`,
   `pattern-clearance`, `high-workload`, `acknowledgement`, or
   `degraded-guidance`. Do not infer the profile from an acting adjective.
4. **Generate dry takes.** Stable role identity plus moment direction reaches
   the provider. No radio filter, cockpit bed, or gameplay synthesis.
5. **Run the R/T gate.** Reject padding, clipping, slow packets, and theatrical
   internal pauses before an owner listens.
6. **Review in context.** Blind-review role continuity and exact words, then
   audition the call inside its actual sequence. Quiet time belongs between
   transmissions.
7. **Apply radio presentation.** Band limitation, noise and cockpit masking are
   presentation. They cannot rehabilitate a bad dry performance.

## What the gate measures

- whole-packet words per minute;
- articulation rate with internal pauses removed;
- leading and trailing provider padding;
- every internal pause over 80 ms;
- longest pause and internal-silence ratio;
- clipped-sample ratio;
- PCM format, channel count and sample rate.

The shared thresholds live in `performance-profiles.json`. They have two
boundaries:

- **target** — a miss returns `review`; an owner decides in context;
- **maximum/minimum** — a miss returns `fail` and blocks promotion.

This matters because a 320 ms pause can be worth reviewing while a 530 ms
dramatic pause in a high-workload damage report is a hard failure. A numerical
target must not silently overrule a convincing performance.

Whole-packet WPM cannot tell whether a voice flattened every information unit
to the same pace. `operational-cadence-evidence.json` therefore stores
approximate semantic-unit boundaries from real recordings. The companion
timed audit reports each unit's WPM, its ratio to the whole packet, and its
pace change from the previous unit:

```sh
python3 tools/audio/rt_performance.py timed-audit \
  --spec audio/rt/operational-cadence-evidence.json
```

The seed measurements show a restrained pattern: familiar position,
configuration and intention blocks stay connected at roughly 200–300 WPM,
with local pace shifts rather than theatrical gaps. Identity and numerals
remain intelligible; emphasis comes from modest timing, stress and final
contour—not from reading every comma as a pause.

## Inspect one take

```sh
python3 tools/audio/rt_performance.py inspect \
  /path/to/dry-take.wav \
  --text "Lead, Two. I hit a cable. Right wing's damaged." \
  --profile high-workload
```

The command exits non-zero only for a hard failure. A `REVIEW` result is
eligible for the owner-ear gate but cannot be auto-promoted.

## Audit a packet

Create a JSON audit spec. Relative audio paths resolve from the spec:

```json
{
  "schemaVersion": "1.0.0",
  "items": [
    {
      "id": "pilot-damage-report",
      "path": "takes/pilot-damage-report.wav",
      "role": "pilot",
      "text": "Lead, Two. I hit a cable. Right wing's damaged.",
      "profile": "high-workload"
    },
    {
      "id": "pilot-commit-ack",
      "path": "takes/pilot-commit-ack.wav",
      "role": "pilot",
      "text": "Ghost One One.",
      "profile": "acknowledgement"
    }
  ]
}
```

Run it as a promotion gate:

```sh
python3 tools/audio/rt_performance.py audit \
  --spec /path/to/rt-audit.json \
  --output /path/to/rt-audit-report.json
```

Use `--report-only` while inventorying an existing corpus. It writes the same
results but does not fail the command.

## Generator integration

Every generator should emit, per take:

- stable line and role IDs;
- canonical `text`;
- optional punctuation-only `performanceText`;
- explicit `rtProfile`;
- dry WAV path;
- provider, model, voice and request hash.

The generator should run this audit after normalization and silence trimming,
before writing a promotable manifest. A hard R/T failure makes the generation
manifest incomplete. A review result remains audition-only.

The Korea narrative generator already separates canonical text from validated
performance punctuation. The mission-radio generator composes stable role
behavior with a validated semantic-unit cadence map, trims provider padding,
runs the selected profile, and records the result in its manifest. A `review`
or `fail` take is deleted instead of being promoted. The Korea generator can
consume the same measurement contract without another acting layer.

Do not couple this tool to one provider's speed parameter. The Korea comparison
showed why: a nominally faster Hume request produced a longer file but removed
the internal pauses. Measure the returned audio.

## Human-only gates

The analyzer cannot determine:

- whether the exact words were spoken;
- callsign and numeral pronunciation;
- whether a voice resembles a real person;
- accent, role continuity or period fit;
- semantic urgency and turn ownership;
- whether a transmission should exist at all;
- intelligibility after radio processing and cockpit masking.

Those remain explicit listening, rights, historical and in-sequence gates.
