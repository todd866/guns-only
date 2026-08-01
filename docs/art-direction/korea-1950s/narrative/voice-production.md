# Voice and radio production contract

Status: pre-casting design; generation blocked on script lock  
Catalog: [`radio-lines.json`](radio-lines.json)  
Cadence reference: [`radio-performance-reference.md`](radio-performance-reference.md)  
First pass: 15 short procedural lines for Armstrong and Carpenter

## Outcome

Create restrained, intelligible performances that sound like two working military pilots under
changing workload. The voices must serve the simulation and the period without imitating Neil
Armstrong, John Carpenter, an actor, or another identifiable person.

The dry performances are source assets. Radio coloration, interference, cockpit masking and
sidechain behavior are engine-owned presentation. Never bake the only master through a radio
filter.

## Gates

Audio generation begins only when all of these are true:

1. every line has a stable ID, beat, function and reconstruction label;
2. historical review has approved the communication function and removed false quotation;
3. period phraseology, callsigns and pronunciation have been reviewed;
4. the line trigger exists as an observer-safe event or fact;
5. the greybox demonstrates that the line can key without interrupting a critical control action;
6. the chosen provider permits the intended commercial use and asset retention;
7. the synthetic-performance disclosure and performer policy pass rights review.

A script edit invalidates only affected line assets. A trigger or timing edit does not invalidate
the dry performance unless it changes the intended workload.

## Casting boundaries

### Armstrong

Performance brief:

- young U.S. naval aviator;
- economical, technically attentive and not theatrically stoic;
- clear enough for a degraded radio path without exaggerated diction;
- urgency expressed through timing and breath, not shouting;
- no retrospective gravitas and no suggestion of the later astronaut.

### Carpenter

Performance brief:

- somewhat more experienced flight lead;
- concise, observant and calm without becoming a tutorial voice;
- gives only information he can see or infer operationally;
- no paternal speech, inspirational reassurance or omniscient diagnosis.

Do not supply recordings of either historical person to a voice model. Do not request a voice
“like Armstrong,” name a celebrity, use biometric similarity scoring, or select a candidate because
listeners mistake it for the historical person.

## Model and voice selection

Evaluate current high-quality commercial models only after the script gate. Provider reputation is
not a quality result. Run a blind audition using the same neutral evaluation packet:

- one routine formation instruction;
- one clipped acknowledgement;
- one damage report;
- one inspection observation;
- one high-workload decision line;
- one line containing a difficult proper noun from the approved glossary.

Use at least three non-imitative stock or designed voices per role. Normalize loudness before the
blind review and withhold provider, model and price. Reviewers score:

| Criterion | Failure example |
|---|---|
| Natural timing | identical pauses and cadence on every take |
| Operational restraint | trailer-voice gravity or melodrama |
| Workload response | calm recital during aircraft upset |
| Intelligibility | consonants vanish after the radio chain |
| Continuity | age, accent or vocal mass shifts between lines |
| Directional control | the model cannot produce meaningfully different takes |
| Pronunciation | period names, units or callsigns drift |
| Artifact rate | warble, doubled consonant, click or synthetic tail |
| Non-resemblance | performance evokes a famous recording or public figure |

Reject a model that produces one impressive line but cannot sustain a coherent role across the
catalog.

## Direction and takes

Generate three directed takes per line:

1. `restrained`: normal professional cadence;
2. `compressed`: shorter, higher-workload delivery without raised theatrical intensity;
3. `recovery`: controlled urgency after the immediate upset.

The line record chooses one take; alternates remain review material and do not ship by default.
Direction describes the observable situation and speech function. It does not prescribe inner
thought.

Example direction for `line.armstrong.06-damage-report.v1`:

> The first violent roll has just come under partial control. Speak on the first safe breath,
> reporting only the collision and visible problem. Short transmission, no panic, no hindsight.

Never direct the model with “heroic,” “future astronaut,” “legendary,” or “Miyazaki.” Visual tone is
not voice direction.

## Pronunciation and terminology

Maintain a versioned glossary before generation. Initial research entries:

- `Essex`;
- `Pohang`;
- `K-3`;
- `Majon-ni`;
- `VF-51`;
- Panther terminology and any approved callsigns.

Every non-English place name requires a researched pronunciation, reviewer and stable phonetic
representation supported by the provider. Do not force Korean names through an improvised
Anglicized spelling merely to make a model comply.

The final script may omit a proper noun when a pilot would not plausibly say it. The glossary is a
consistency tool, not a mandate to add exposition.

## Master asset specification

Preserve one dry archival master per selected take:

- mono linear PCM WAV;
- 48 kHz;
- 24-bit where the provider supports it without transcoding from a lower-quality source;
- no normalization clipping, radio EQ, reverb, static, music or cockpit noise;
- leading and trailing room kept short but not cut through breath or consonants.

Each master has a sidecar manifest:

```json
{
  "lineId": "line.armstrong.06-damage-report.v1",
  "catalogVersion": "1.0.0-draft",
  "textHash": "sha256:pending",
  "speakerId": "speaker.armstrong.v1",
  "provider": "pending",
  "modelSnapshot": "pending",
  "voiceId": "pending",
  "take": "recovery",
  "directionHash": "sha256:pending",
  "generatedAt": "pending",
  "synthetic": true,
  "imitationProhibited": true,
  "sampleRateHz": 48000,
  "channels": 1,
  "measuredDurationSeconds": 0,
  "integratedLufs": 0,
  "truePeakDbtp": 0,
  "sha256": "pending",
  "reviewStatus": "pending"
}
```

Provider response IDs, generation parameters and raw downloads remain in the private production
ledger when their redistribution is not permitted. The public repository receives only metadata
needed to reproduce or audit the shipped asset.

## Radio presentation

The engine derives a radio presentation asset or applies the chain at runtime:

1. remove unusable generation artifacts without changing words;
2. apply restrained communications-band filtering appropriate to the researched equipment;
3. add light saturation and level control;
4. key transmission onset/termination and optional squelch separately;
5. route through the mission radio bus;
6. sidechain engine, wind and weapons only enough to preserve intelligibility;
7. retain captions as the authoritative accessibility equivalent.

Static never obscures a required instruction. Radio degradation may convey condition, range or
equipment state only when the simulation supplies that state. Do not use random interference to
manufacture drama.

The presentation layer may finish a line after its simulation event, but line playback never
advances the mission. If an advisory line becomes stale, its catalog policy drops it. If a required
line cannot play, the caption and objective path carry the same information without delaying
authority.

## Review

Each selected line receives:

- script and provenance review;
- historical-person non-imitation review;
- pronunciation review;
- clean-master artifact review on headphones and speakers;
- in-engine intelligibility review at representative engine, wind and weapons levels;
- captions-only completion review;
- duration agreement against catalog metadata;
- hash and manifest verification.

Review the entire role in sequence as well as isolated lines. A locally good take fails if it makes
Armstrong age ten years between the coast and ejection or gives Carpenter a different accent after
the cable strike.

## Automated proof

The asset gate should fail on:

- missing or duplicate line assets;
- text hash disagreement;
- unpinned provider model or voice identity;
- duration disagreement beyond the approved tolerance;
- wrong sample rate, channel count or encoding;
- clipping, corrupt PCM or excessive leading/trailing silence;
- missing synthetic disclosure;
- missing caption string;
- unreviewed pronunciation token;
- an asset for a line no longer declared by the sequence;
- a line declared by the sequence with neither audio nor an approved caption-only fallback.

Audio QA uses the repository's silent mode unless the user explicitly requests audible review. An
audible casting session must register ownership with `bin/audio-doctor`, close every player or tab,
and clear ownership afterward.

## Promotion

Voice work is complete only when:

1. the final line catalog validates against the playable sequence and source register;
2. selected dry masters, radio presentation and captions all share the same line IDs;
3. measured durations have been fed back into cue timing;
4. critical lines remain comprehensible under peak approved cockpit masking;
5. captions-only players receive no timing or information disadvantage;
6. the rights ledger and synthetic disclosure are approved;
7. the mission remains deterministic when audio is missing, delayed or disabled.
