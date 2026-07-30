# Guns Only mission radio

`lines.json` is the authoritative finite speech catalog for tower, approach, tactical, traffic,
fuel, weapons, and mission-result calls. The simulation chooses a catalog ID from physical events;
the browser never invents dialogue.

The wording follows two public baselines:

- FAA AIM 4-2 for clear addressing, complete initial callsigns, number pronunciation, and
  acknowledgements/readbacks — **form**, when addressing ATC.
- AFTTP 3-2.5 for tactical brevity. A defined word is still transmitted only when an operational
  recipient needs the delta: `FOX TWO` means an IR air-to-air missile was launched, `SPLASH`
  follows a destruction event, `JOKER`/`BINGO` follow configured fuel thresholds, `REMINGTON`
  means no usable air-to-air ordnance except gun, and `WINCHESTER` means no ordnance remains.

`PERFORMANCE-CORPUS.md` is the equally binding listening baseline. It maps game events to
operational recordings and specifies packet length, turn timing, escalation, and silence.

Validate the catalog and preview the generation plan:

```sh
python3 tools/audio/radio_voice.py validate
python3 tools/audio/radio_voice.py generate --dry-run
```

Generate WAV clips and the web manifest:

```sh
OPENAI_API_KEY=... python3 tools/audio/radio_voice.py generate
# When lines.json selects provider "elevenlabs":
ELEVENLABS_API_KEY=... python3 tools/audio/radio_voice.py generate
```

The generator also supports Hume and Cartesia Sonic 3.5. Directed Hume performances use Octave 1
with a catalog-validated acting description of no more than 100 characters; Octave 2 currently
accepts speed and saved voices but not per-utterance acting descriptions. Provider credentials may
be supplied through the environment or stored in macOS Keychain under service
`guns-only-voice-providers`, using the environment-variable name (`ELEVENLABS_API_KEY`,
`HUME_API_KEY`, or `CARTESIA_API_KEY`) as the account. Environment variables take precedence.
Production catalogs pin the provider model or snapshot; gameplay always consumes authored WAVs
and never contacts a speech provider.

Production WAVs and their manifest are tracked assets. A missing clip fails silent and increments
the presentation QA counter; it never falls through to browser/device speech synthesis. Radio is
atmosphere, not a gameplay dependency, so silence is safer than changing a character mid-sortie.

## Comms doctrine

### AI-first airspace (why this radio exists)

Guns Only / ANCA2040 asks: **how would we redesign the world for an AI-first system?** In that
battlespace the shared mental model still matters — who / where / cleared / want — but it is
mostly held and updated by machines. Tower, CONTROL, traffic, and the jet itself are agents.
Speech is how a human stays on the loop, not how two humans negotiate every gate by hand.

So R/T is **machine-keyed a lot of the time**, diegetically: the automation keys the mic, picks
the brevity word, and plays an owner-approved performance in a military register. The player's
job is judgment (commit, refuse, RTB, waveoff override), not performing the phraseology.

That splits the Communicate channel cleanly:

| Surface | Job |
|---------|-----|
| **ANCA panel** | Continuous machine truth — glanceable who/where/cleared/want |
| **Radio** | Sparse spoken *deltas* when a human ear (yours or someone else's) needs the update now |
| **Optional caption** | One current-line accessibility transcript, off by default |

If the panel already shows it and no other human-in-the-fiction needs to hear it, silence is
correct. Talking because "radios talk in sims" fails the redesign.

### The shared mental model

Every radio call is an update to a shared mental model:

> **Who am I · where am I · what do I think I'm cleared to do · what do I want to be cleared to do.**

Calls that carry none of those four fields are noise. Calls that do are curriculum
(aviate, navigate, communicate, administrate — present and realistic even when automated).
The unit of correctness is the whole exchange, not an isolated sentence.
`MissionRadioExchangeContracts` declares which fields carry forward from the established
frequency, track, pattern, or datalink; which ordered turns add new information; what must be
known when the exchange closes; and whether new authority requires a callsign acknowledgment,
full readback, or observable compliance. Tests fail when inherited context plus the exchange
leave a required field uncertain.

Those contracts are enforced at runtime, not just linted as documentation. The director keeps a
per-channel communications picture and an exchange ledger. A field becomes shared only when its
turn actually keys the mic. A dependent clearance, response, or readback cannot transmit until
the preceding turn established its prerequisites; expiry or urgent preemption abandons the rest
of that exchange. Observable acknowledgments close only after the aircraft performs the declared
action (for example flying the approved break or beginning the return). A bounded decision trail
records queued, transmitted, duplicate, missing-context, expired, preempted, and completed
outcomes so tests and telemetry can explain both speech and intelligent silence.

### The authoring gate

**Correct R/T = the shortest utterance that updates at least one of the four fields for someone who needs it.**

| Field | Question the call answers | If nobody needed that answer… |
|-------|---------------------------|-------------------------------|
| Who | Who is talking / who is addressed | drop the callsign ceremony |
| Where | Position in the world or the pattern | drop the geography |
| Cleared | What authority currently holds | drop the ritual ack |
| Want | What authority is being requested | drop the request |

Apply four filters, in order. Fail any filter → the line does not ship.

1. **Audience.** Who is the shared model *for*? Another agent, a human on the loop, tower,
   package — or only the player's ears as narration? Classic guns-only has no package. A
   trigger call fails here. Pattern traffic has an audience. "The player already sees the gun
   firing" is not an audience, and the current Rapier missions establish no recipient who needs
   a `GUNS` call for authority, deconfliction, or coordination.
2. **Delta.** Does this change a field that was already known — including known to the
   machines? Echo readbacks fail. "Report base" / "report break" fail. Trigger narration fails.
   Restating ANCA fails.
3. **Workload.** Would a human key the mic *right now*, or would the automation speak only
   if a human ear needs it? Short final, mid-guns, waveoff: fly first. Silence is correct R/T
   when speech steals the scan.
4. **Ambient curriculum, not substitute judgment.** The radio teaches the AI-first model by
   exposure. It must never become a chore, a score, or a narration track for what the panel
   or the eyes already show. Judgment stays with the player; phraseology stays with the
   machines.

AIM shapes **ATC form**. AFTTP shapes **whether anyone speaks** and how pilots speak when they
do. Full callsign on first contact with tower; brevity on package; machine silence when the
only listener is yourself watching the pipper.

### Working registers on the net

| Who | Register | Sounds like |
|-----|----------|-------------|
| **ATC** (Tower / Approach / CONTROL) | Exact rulebook | Connected task speech; complete when a clearance requires it, compressed when shared context permits |
| **Pilots** (ownship + traffic) | Brevity | Short position or state update; never recite the checklist out loud |
| **LSO** | Correction ladder | Mostly silent; calm information, then a firmer correction, then a calm waveoff |

Formation members in the local pattern use the sourced compact form `Ghost One Two, gear`.
The flight lead acknowledges the landing clearance with callsign rather than echoing the whole
transmission. Checklist state stays on ANCA.

One-breath test: *which field, for whom (human or agent), what's the delta, and would this be
keyed in an AI-first cockpit?*

### Sequencing — ANCA before the mic

Priority is always **Aviate → Navigate → Communicate → Administrate**. The radio is Communicate;
it must not jump the queue the instant an event fires. Pilots fly the airplane, then talk.

| After… | Hold before keying | Why |
|--------|--------------------|-----|
| Tactical/package event | ~0.25 s | Machine-keyed and tied to the employment beat |
| Pilot / CONTROL event | ~0.45 s | One human-scale beat, never several seconds late |
| Tower / traffic after an event | ~0.30 s | Prompt, without sounding sample-quantized |
| LSO | ~0.15 s | Flying the pass *with* the pilot |
| Urgent (waveoff, bingo) | ~0.10 s | Safety is effectively immediate |

Reply gaps are ~0.18–0.35 s (deterministic jitter). Natural dead air comes from authoring fewer
calls, not inserting seconds between every line. Pending calls expire when their operational
moment has passed instead of narrating an old leg.

Pattern traffic uses the same occupied frequency rather than an ambient-chatter timer. Each
aircraft has a stable training role, configuration state, and reaction delay. It creates a compact
`GEAR` intention only after the gear is actually down and locked; that intention waits behind an
occupied frequency, expires if the aircraft leaves base, and yields to urgent safety traffic.
Several legitimate intentions may therefore make the frequency briefly busy, while an
uneventful circuit remains quiet. Character comes from flying/configuration judgment and key-down
timing, not longer dialogue.

### Voice bar — behavior, not acting

AI-generated snippets are the delivery path, but acting adjectives are not the route to
character. Every role is a stable person; the listener recognizes them through vocal grain,
accent, microphone onset, compression habits, omissions, and turn timing. Stable voice identity
lives in `roles.*.instructions`; speech-act timing lives in each line's `direction` and
`target_duration_s`. The generator composes both (`tools/audio/radio_voice.py`).

Short packets are not governed by one global words-per-minute target. Each line declares its
audible-duration window, legitimate phrase boundary, information focus, final contour, and
urgency. Callsigns and numbers remain clear; a line may rise, fall, compress, or pause only when
its speech act calls for it.

Urgency changes key-down timing, syntax, and consonant firmness. It does not create shouting,
growling, a movie-trailer register, or an “explosive” LSO. Repetition occurs only when the
aircraft has not adequately responded. Alternate `takes` preserve the same role and wording
with natural micro-timing drift.

Clips are pre-generated and re-used; no live token spend in the sortie loop. `AiGenerated` is
playback/disclosure about the voice path, consistent with machine-keyed mics speaking in a
human register. Owner ear is the acceptance gate: if it sounds like a robot, regenerate.

**Generator engines:** `radio_voice.py` supports OpenAI, ElevenLabs, Hume, and Cartesia and
normalizes them to the same browser-safe WAV/manifest contract. Provider padding is trimmed to
a short key-up/key-down margin; clips with more than 120 ms of residual tail or an audible
duration outside the authored window fail generation. Directed Hume auditions use
Octave 1 because its per-utterance `description` separates voice identity from performance; the
live Octave 2 endpoint rejects that field and is usable here only as an undirected stock voice.
The first Hume audition used Octave 2 and therefore did not test the authored direction.
Cartesia Sonic 3.5 is treated as transcript/voice-only because its speed controls are disabled;
Eleven v3 likewise has no speed control and relies on voice design, tags, and take selection.
Provider, model, voice ID, settings, instructions, line direction, and take number all enter the
source hash. Regenerate the complete catalog after any of them changes, then pass the owner-ear
gate before replacing production clips.

### Binding consequences (current catalog)

- Machines key the mic; the game does not make the player perform echo readbacks.
- Launch is a visual shot-crew sequence. It has no radio clearance and audio cannot hold the catapult.
- Circuits establishes initial/break once, then keeps only each required landing transaction and
  safety calls. Routine downwind/base/final narration is silent.
- Each formation member independently reports achieved `GEAR`; the shared frequency arbitrates
  simultaneous calls and discards stale ones instead of applying a global chatter throttle.
- Tactical COMMIT is `Ghost, commit` followed by the required callsign acknowledgment; no
  cinematic engage order.
- Package weapons brevity carries no callsign ceremony (`Fox Two.`, `Splash one.`).
- Gun employment stays in telemetry/AAR. No current mission emits `GUNS`; add it only with a
  specific recipient and authority/deconfliction contract, and never queue it after the moment.
- CONTROL / Tower / Approach keep callsign when *who* matters to the addressee — and keep
  rulebook wording (full clearances, gear challenges, waveoffs).
- LSO stays ultra-short. Wire final stays silent.
- ANCA holds net/frequency state, not a duplicate transcript. Radio only speaks deltas.
- Radio captions are a one-line opt-in accessibility preference, off by default.

**Not a chore.** Airspace and radio happen in the background as atmosphere and curriculum.
No forced readbacks, no comms minigame — the player's job stays aviate and decide.

## Open work

- **Evidence-led recast**: design stable Hume role voices, send the complete performance
  description on every directed Octave 1 utterance, and owner-review a small representative scene before
  regenerating the finite catalog. Existing production clips remain interim; API credentials are
  intentionally not stored in the repository.
- **Ball timing event**: add a physical carrier-gate event before shipping the pilot ball /
  `Roger ball` exchange. Do not approximate it with approach-mode engagement.
- **Chatter tuning**: keep watching call density in Circuits and Rapier recovery. Classic
  guns-only stays quiet on the trigger.
- **Traffic is heard, not seen**: CircuitPatternTraffic ships render no hulls.
- **Geometry unification**: CircuitPatternTraffic re-states Circuits shelf/final constants beside
  RapierMissionDirector; a future pattern edit can desync flown gates from spoken legs.
- **LSO advisor dedup**: UpdateMissionRadio re-runs Lso.AdviseForMode in parallel with the HUD
  path; drift risk.
