# Korea radio performance reference

Status: working direction for voice auditions. This is not a claim that the
reconstructed mission dialogue is a historical transcript.

## The useful distinction

Operational calm is not slow acting. A trained aviator may leave substantial
space between transmissions while listening, flying, or waiting for a reply,
but the information inside one push-to-talk transmission is usually compact.
Urgency appears as fewer words, a shorter breath, and less space between facts;
it does not require shouting or a theatrical "hero voice."

The first Armstrong audition exposed the opposite pattern. Its consonants and
word rate were acceptable, but full stops caused dramatic pauses inside one
damage report. The longest gap was 0.527 seconds, between "cable" and "right
wing." Across the transmission, 0.821 seconds of internal silence made a
3.60-second clip feel hesitant.

## Reference hierarchy

### 1. Authentic high-workload operational audio

The best immediately usable performance reference is Apollo 11's powered
descent. It is not a Korean War radio recording, and its vocabulary must not be
copied into 1951. It is valuable because it captures the same pilot under
extreme workload in a real vehicle.

NASA's synchronized landing film begins at mission elapsed time 102:34:24.
Research excerpts, kept outside the game repository, are:

- `armstrong-korea-research/primary/video/nasa-apollo11-powered-descent-abbrev.mp4`
- `armstrong-korea-research/derived/reference-audio/apollo11-program-alarm.wav`
- `armstrong-korea-research/derived/reference-audio/apollo11-1201-lpd.wav`

NASA's corrected transcript shows the pattern:

- Routine scan: "RCS is good. No flags. DPS pressure is good."
- Alarm identification: "1201."
- Immediate demand under rising workload: "Give me an LPD."
- Visual assessment: "Pretty rocky area."
- Irreversible action: "Shutdown."

The phrases get shorter as the control task gets harder. Longer status reports
are assembled from short clauses, not performed as a slow dramatic sentence.
NASA's commentary explicitly describes only the LPD request as having some
urgency. The effect is a tighter attack and repetition, not a raised theatrical
voice.

Source:
<https://history.nasa.gov/wp-content/uploads/static/history/alsj/a11/a11.landing.html>

### 2. Authentic emergency wording, transcript evidence

During Gemini VIII's uncontrolled roll, David Scott reported, "We have serious
problems here. We're tumbling end over end." Armstrong followed with the
specific control fact: "We're rolling up and we can't turn anything off." The
sequence is operationally useful: declare severity, name observable state,
then omit emotion and explanation.

This is transcript evidence until a provenance-safe audio copy is registered.

Source:
<https://www.nasa.gov/missions/gemini/gemini-viii/geminis-first-docking-turns-to-wild-ride-in-orbit/>

### 3. Radio procedure

The FAA's current radio guidance says to listen before transmitting, think
before keying, pause briefly after keying so the first word is not clipped, and
use a normal conversational tone. It also recommends putting the message or
request into one subsequent-contact transmission when practical.

The older Flight Service guidance's 100–120 words per minute figure is for
copyable data delivery, not a target for every cockpit call. Its durable rule is
that rate must not be excessive and every message part must remain easy to
understand.

Sources:

- <https://www.faa.gov/air_traffic/publications/ATpubs/AIM_html/chap4_section_2.html>
- <https://www.faa.gov/air_traffic/publications/atpubs/FSS/Briefing%20Guide.htm>

### 4. Korean War material

The local Korean War films are strong references for aircraft noise, deck
rhythm, vocabulary, weather, and visual staging. Their soundtrack is largely
formal documentary narration, so it is a bad acting reference for cockpit
speech. No authenticated recording or transcript of Armstrong's cable-strike
radio traffic is currently registered. The mission dialogue remains explicitly
labelled reconstruction.

The Naval History and Heritage Command's accounts are useful for incident
structure. They document terse, task-driven wingman coaching in related Panther
damage incidents, but they do not supply verbatim radio traffic and must not be
presented as dialogue sources.

Source:
<https://www.history.navy.mil/about-us/leadership/director/directors-corner/h-grams/h-gram-061/h-061-1.html>

## Measured audition result

All measurements are from dry 48 kHz masters. Silence is detected at -36 dB
with a minimum duration of 80 ms; values are diagnostic rather than perceptual
truth.

| Provider / take | Duration | Internal pause pattern | Result |
| --- | ---: | --- | --- |
| ElevenLabs a1 | 3.60 s | 0.294 s + 0.527 s | Sounds segmented and reflective |
| ElevenLabs a2 | 3.12 s | 0.299 s | 13% shorter; one compact work burst |
| Hume a1 | 2.30 s | 0.198 s | Fast but visibly phrase-broken |
| Hume a2 | 2.54 s | none over 80 ms | Longer articulation, but continuous delivery |
| Cartesia a1 | 3.60 s | 0.255 s + 0.447 s + 0.397 s | Too many internal stops |
| Cartesia a2 | 3.44 s | 0.198 s + 0.224 s + 0.346 s | Better, but still segmented |

Changing punctuation was more reliable than requesting a faster "emotion."
The ElevenLabs improvement came almost entirely from deleting dead air:
voiced time remained about 2.5 seconds while internal silence fell by roughly
64 percent. Hume shows why duration alone is not enough: its second take is
longer, yet it has no detected internal pause and may feel more operational.

## Direction for generated performances

For routine flight:

- Normal conversational tone.
- Approximately 120–150 effective words per minute for a complete call.
- One thought per breath; no meaningful pause between tightly related values.
- Consonants carry clarity. Do not lengthen vowels to sound "calm."

For high workload:

- Approximately 150–180 effective words per minute in short bursts, when the
  text permits it.
- A brief key-up margin is acceptable; after speech begins, internal gaps
  should normally stay below 250 ms.
- Facts first: addressee, event, aircraft state, request.
- Use repetition when information was missed, not as dramatic emphasis.
- Urgency comes from the attack, breath economy, and reduced syntax.
- No shouting, panic rasp, trailer intensity, or retrospective gravitas.

For recovery:

- Let the inter-transmission gap expand before slowing the words themselves.
- A tired breath can be present without turning the line into confession.
- Preserve the same operational vocabulary until the aircraft is no longer an
  immediate control problem.

These ranges are audition targets, not historical measurements of Korean War
radio traffic. Intelligibility after radio treatment remains the acceptance
test.

## Text and performance text

The line catalog now supports an optional `performanceText`. It may change
punctuation but is validation-blocked from adding, deleting, or reordering
scripted words. Captions and historical review therefore retain the approved
line while providers receive punctuation tuned for speech.

Approved script:

> Lead, Two. I hit a cable. Right wing's damaged.

Provider performance text:

> Lead, Two—I hit a cable; right wing's damaged.

This turns three acted sentences into one keyed transmission without changing
the claim. The compressed take direction is now:

> High workload: one compact information burst. Crisp consonants, minimal
> internal pause, urgency through breath economy and tempo rather than volume
> or melodrama.

The audition CLI also accepts repeatable `--line` and `--take` filters so a
single timing experiment requires one provider request instead of regenerating
the full matrix.

## Acceptance loop

1. Review the dry performance first.
2. Reject pauses or emphasis that create a story beat the pilot did not choose.
3. Confirm every word remains intelligible with the planned radio bandwidth and
   cockpit bed.
4. Check the line in sequence; quiet time between calls belongs to gameplay.
5. Keep the dry master, provider request hash, and timing measurement.
6. Promote only after a blind role-continuity review and rights check.

Authentic recordings in this reference folder are research inputs, not game
assets. They must not be shipped or used to imitate a historical person's
voice.
