# Mission radio performance corpus

This is the listening reference for `lines.json` and `sim/MissionRadio.cs`. Written
phraseology alone does not establish believable R/T. The game also has to reproduce who
owns the frequency, why a transmission exists, how long the packet lasts, when a reply is
required, and when a professional stays silent.

The product rule is **background-first**: radio can establish place, workload, and other
people in the airspace, but no ordinary transmission is required to understand or control
the game. Captions are optional and off by default. Safety-critical state remains visible
through the aircraft and ANCA.

## What the recordings changed

| Game event | Real-world analogue | Observed behavior | Binding decision |
|---|---|---|---|
| Buried-tube launch | Carrier catapult shot | The flight deck uses standardized visual hand signals; the pilot salutes readiness and the shot crew launches the aircraft. This is not a pilot/controller radio-clearance transaction. | No launch R/T and no audio-dependent launcher interlock. First possible call is after the aircraft is airborne. |
| Fighter pattern | Nellis overhead/formation recovery | Aircraft report initial. A flight lead owns the landing clearance; following formation members reduce their call to callsign plus `GEAR`. ATC moves the break only when sequencing requires it. | Establish the pattern once, retain one landing transaction per pass, and allow at most one ambient `GEAR` call per 90 seconds. |
| Tactical commit | Current US multiservice air-control procedure | Pre-COMMIT the controller has priority. With controller authority, the directive ends `[flight] COMMIT`; the fighter acknowledges with callsign. During employment, fighters become the priority communicators. | `Ghost, commit.` / `Ghost One One.` replaces the invented “you are ordered to engage.” Check-in is not replayed when the playable beat begins in medias res. |
| Normal carrier pass | LSO/aircraft ball exchange | The pilot's ball call hands control to the LSO. `Roger ball` is prompt and calm. A good pass can then be silent to touchdown. | Silence is the normal LSO state. Do not add encouragement or continuous talkdown. A correctly timed ball event still needs simulation support before it can ship. |
| Degrading carrier pass | LSO correction ladder | Calls begin as information or a small correction, become shorter and firmer only if the aircraft does not respond, then terminate in a calm waveoff. Repetition follows an inadequate response; it is not flavor. | Directions ban barking, shouting, and “explosive” delivery. Call density must follow a persistent deviation, not elapsed time. |
| Weapons employment | Real tactical cockpit recording and current doctrine | Shared context produces one-to-four-word packets when a recipient needs authority, deconfliction, coordination, or shared-state change. A valid brevity definition does not itself justify keying the mic. | Current missions do not emit `Guns`; trigger evidence belongs in telemetry/AAR. Any future employment call must be immediate and tied to a proved exchange, never replayed stale. |

## Primary and operational references

### Launch

- The US Navy describes catapult readiness and launch as a hand-signal sequence in
  [Ford Sailors Ensure Safety During Flight Operations](https://www.dvidshub.net/news/383371/ford-sailors-ensure-safety-flight-operations).
  The Naval Safety Command also publishes the
  [flight-deck hand-signal chart](https://navalsafetycommand.navy.mil/Portals/100/Hand_signals-Chart2.pdf).
- There is no real land-based buried-catapult radio analogue. Inventing one created both
  bad phraseology and the out-of-order clearance bug.

### Pattern

- [NELLISAFBI 11-250, 9 July 2026](https://static.e-publishing.af.mil/production/1/nellisafb/publication/nellisafbi11-250/nellisafbi11-250.pdf),
  paragraphs 4.14 and 4.14.1, requires an initial report, has Tower assign break direction
  and runway before initial, and reduces subsequent formation members to a gear call such
  as `HOSS 2, GEAR`.
- The same instruction uses `BREAK MIDFIELD TO FOLLOW TRAFFIC` as the model for an actual
  sequencing delta. A controller need not decorate every lap with a different sentence.

### Intercept and employment

- [ATP 3-52.4 / NTTP 6-02.9 / AFTTP 3-2.8, October 2024](https://www.alssa.mil/Portals/9/Documents/mttps/acc_2024.pdf)
  assigns communication priority by intercept phase. The controller leads before and just
  after COMMIT; fighters lead during targeting, employment, merge, and post-merge.
- Its controller-authority example ends the picture with `RAPTOR COMMIT`; the fighter's
  complete acknowledgment is only `RAPTOR 1`. It also says targeting communications use
  the minimum words required when datalink already carries the correlated picture.
- The public-domain
  [1989 Gulf of Sidra cockpit recording](https://commons.wikimedia.org/wiki/File:Gulf_of_Sidra_Incident.webm)
  demonstrates the behavior behind the doctrine: shared-context packets such as `Say your
  angels`, `Fox one`, `Breaking right`, and `Good hit` replace complete sentences.

### LSO

- The Navy's [Landing Signal Officer School](https://www.airlant.usff.navy.mil/lso/)
  defines the LSO as the final visual control and safety layer.
- A Navy account of LSO work places `Roger ball` about eighteen seconds before touchdown:
  [LSOs: Safety on Deck](https://www.navy.mil/Press-Office/News-Stories/display-news/Article/2250388/lsos-safety-on-deck/).
- [LSO NATOPS](https://studylib.net/doc/25912373/lso-natops-may09) warns that frequent
  or verbose calls degrade performance; short meaningful calls must be instantly understood.
- Pilot-posted operational examples used for timing study:
  [rough-sea F/A-18E pass](https://www.youtube.com/watch?v=CvncJwCxxV0),
  [Clara night talkdown](https://www.youtube.com/watch?v=5Jtineh7v1E), and
  [offshore carrier scanner recording](https://www.youtube.com/watch?v=8XIsRQ1q_HA).
  These are listening references only and are not redistribution assets.

## Measured packet behavior

Measurements are approximate because receiver squelch, overlapping speakers, and uploaded
edits obscure exact key-down boundaries. They are sufficient to reject the game’s former
four-second dramatic reads.

| Material | Useful observed timing | Performance implication |
|---|---|---|
| Normal/rough carrier ball exchange | Ball call about 2.5–3.5 s because it carries side number, type, fuel, and mode; `Roger ball` about 0.6–1.0 s; response begins promptly rather than after a dramatic pause. | Data determines duration. An acknowledgment is a quick turn, not a scene beat. |
| Degrading pass scanner sample | Corrections are usually 0.5–1.5 s. `Power` repeats at roughly human reaction intervals when the low trend continues. Waveoff terminates the sequence. | Repeat only after observing no adequate aircraft response. Escalate syntax and timing, not acting. |
| Clara talkdown | Longer 1–4 s packets are used because the pilot lacks ordinary visual cues. Corrections are separated into actionable chunks; the voice remains even. | Verbosity is a degraded-mode service, not the default LSO personality. |
| Gulf of Sidra intercept | Most tactical turns are one clause and roughly 0.5–2.0 s. Traffic becomes denser as range closes and the fighters gain the most timely picture. | Character comes from turn ownership, omission, and response latency. Do not slow a short line to sound important. |

## Generation contract

### Speech behavior

- Timing is authored per speech act as a target audible-duration window. Words per minute is
  useful for longer data calls but is a poor control for one-to-four-word packets.
- Each line names its legitimate phrase boundary, information focus, final contour, and urgency.
  Do not impose globally flat rhythm or insert a dramatic pause.
- Callsign and numeral articulation survive compression. Familiar connector words and
  brevity terms may reduce naturally.
- A narrow habitual pitch range is normal, but contour remains speech-act specific.
  “Authoritative,” “heroic,” “chill,”
  “coiled,” “explosive,” “bark,” and similar acting prompts are prohibited.
- Urgency is earlier key-down, fewer words, a firmer consonant onset, and—only when the
  aircraft fails to respond—repetition. It is not shouting or a deeper movie-trailer voice.
- Voice identity comes from stable age, vocal grain, accent, microphone onset, and habitual
  compression. Do not ask the model to perform a personality adjective on each line.

The pacing envelope also agrees with the
[FAA AIM radio technique](https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap4_section_2.html):
know the transmission before keying, pause briefly after push-to-talk, be brief, and make
understandability primary.

### Engine requirements

1. Offline fixed assets only; never synthesize during gameplay.
2. Role identity and moment direction must both reach the provider request. Provider-facing
   acting cues stay concise; the full production brief is not copied blindly into every API.
3. The provider must support a saved/designed voice and per-utterance prosody direction.
4. Leading/trailing silence is trimmed; a one-word packet must not become a 1.5-second
   recital. More than 120 ms of residual tail fails generation.
5. Dry speech is reviewed before UHF filtering. Radio processing may locate the voice in
   the cockpit but may not be used to hide a bad performance.
6. Every final clip must be checked for exact words, callsign/number pronunciation,
   authored duration, artifacts, and consistency with the role’s other clips.

Hume Octave 1 is the next directed candidate because it accepts an utterance `description`,
saved designed voices, speed, and continuation context. The live Octave 2 endpoint rejects the
description field, so the first Octave 2 audition tested stock voices without the authored
performance. Hume recommends acting descriptions no longer than 100 characters. A long-description
test leaked instruction words into the generated speech, so the generator now enforces that limit
and each candidate is transcribed locally before review. Eleven v3 remains a secondary candidate,
but its own guidance says very short prompts are less consistent; radio’s one-word calls are
therefore an unfavorable default use case. Cartesia Sonic 3.5 currently exposes transcript and
voice choice here but disables speed control, so it cannot satisfy the directed timing contract
without moving to a model/API path that supports generation configuration.

## Acceptance examples

- **Normal pattern:** long silence; `Ghost One One, initial` / prompt Tower response; long
  silence; one landing clearance and a callsign acknowledgment.
- **Ambient pattern:** at most one unrelated formation `GEAR` call in ninety seconds.
- **Direct-join intercept:** no catch-up check-in dialogue; `Ghost, commit` / `Ghost One One`.
- **Good carrier pass:** ball exchange, then silence.
- **Decaying carrier pass:** one correction; wait for response; repeat or strengthen only
  if the measured trend persists; calm waveoff if the pass becomes unsafe.
