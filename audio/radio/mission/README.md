# Guns Only mission radio

`lines.json` is the authoritative finite speech catalog for tower, approach, tactical, traffic,
fuel, weapons, and mission-result calls. The simulation chooses a catalog ID from physical events;
the browser never invents dialogue.

The wording follows two public baselines:

- FAA AIM 4-2 for clear addressing, complete initial callsigns, number pronunciation, and
  acknowledgements/readbacks — **form**, when addressing ATC.
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
# When lines.json selects provider "elevenlabs":
ELEVENLABS_API_KEY=... python3 tools/audio/radio_voice.py generate
```

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
   trigger call fails here. Pattern traffic has an audience. `GUNS` once on Rapier Intercept
   has an audience. "The player already sees the gun firing" is not an audience.
2. **Delta.** Does this change a field that was already known — including known to the
   machines? Echo readbacks fail. "Report base" / "report break" fail. Second-burst `GUNS`
   fails. Restating ANCA fails.
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

### Two characters on the net

| Who | Register | Sounds like |
|-----|----------|-------------|
| **ATC** (Tower / Approach / Launch / CONTROL) | Exact rulebook | Autistically accurate AIM — complete clearance, correct order, nothing missing |
| **Pilots** (ownship + traffic) | Brevity, cool | Short position + status; never recite the checklist out loud |

Pilots do **not** say "three down and locked" or "gear down and locked." They say what a working
jet actually keys: `base, 3 greens` / `base, gear to come` / `Land Rapier One One.` Tower still
clears with the full rulebook string; the pilot's acknowledgement is the brief clearance take —
not an echo of the whole transmission.

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
| Pre-stroke launch clearance | 0 s | Launcher physically holds through clearance + readback |

Reply gaps are ~0.28–0.60 s (deterministic jitter). Natural dead air comes from authoring fewer
calls, not inserting seconds between every line. Pending calls expire when their operational
moment has passed instead of narrating an old leg.

### Voice bar — characters, not robots

AI-generated snippets are the delivery path; **character** is the product. Every role is a
person with peculiarities of talk, feeling, and intonation — not a neutral TTS reader and not
a sci-fi robot. Standing register lives in `roles.*.instructions`; the moment's feeling lives
in each line's `direction`. The generator composes both (`tools/audio/radio_voice.py`).

**ATC** always follows the rulebook. Complete clearances, correct order, no cool-guy
abbreviation. That precision is the character.

**Pilot (Rapier One One)** is the owner's voice in the fiction: how *you* talk on the radio —
chill, economical, sounding cool without trying. Trend toward brevity; never AIM-complete
when a status word will do. The emotional ladder stays inside that character:

| Stakes | Reads as |
|--------|----------|
| Standard R/T | Chill pilot — bored-precise, easy breath, minimum syllables |
| Working (G, pattern, employment) | Same chill, body in the voice — clipped, not loud |
| Bad news (bingo, gear to come, emergency) | Slightly concerned pilot *trying to give chill pilot* — tighter, flatter, never theatrical |

Traffic pilots share the brevity register (junior crisp, bored One Three, old-head One Four).
Alternate `takes` are the same character with natural micro-timing drift — not a different
person.

Clips are pre-generated and re-used; no live token spend in the sortie loop. `AiGenerated` is
playback/disclosure about the voice path, consistent with machine-keyed mics speaking in a
human register. Owner ear is the acceptance gate: if it sounds like a robot, regenerate.

**Generator engines:** `radio_voice.py` supports the OpenAI Speech API and ElevenLabs PCM output,
normalizing either to the same browser-safe WAV/manifest contract. The checked-in catalog pins
`gpt-4o-mini-tts-2025-12-15` and brisk per-role speeds rather than floating an alias. For the next
full cast, `eleven_v3` plus designed/custom role voices is the preferred character-quality
candidate. Provider, model, voice ID, settings, instructions, line tags, and take number all enter
the source hash. Regenerate the complete catalog after any of them changes, then pass the owner-ear
gate before replacing production clips.

### Binding consequences (current catalog)

- Machines key the mic; the game does not make the player perform echo readbacks.
- Circuits uses launch clearance/readback, initial/break approval, landing clearance, and
  safety calls. Routine downwind/base/final narration is silent.
- Ambient traffic is one base report at most every 45 seconds, never every ship on every leg.
- Package weapons brevity carries no callsign ceremony (`Guns.`, `Fox Two.`, `Splash one.`).
- `GUNS` / `SPLASH` are package calls on Rapier tactical only — never classic guns-only trigger FX.
- CONTROL / Tower / Approach keep callsign when *who* matters to the addressee — and keep
  rulebook wording (full clearances, gear challenges, waveoffs).
- LSO stays ultra-short. Wire final stays silent.
- ANCA holds net/frequency state, not a duplicate transcript. Radio only speaks deltas.
- Radio captions are a one-line opt-in accessibility preference, off by default.

**Not a chore.** Airspace and radio happen in the background as atmosphere and curriculum.
No forced readbacks, no comms minigame — the player's job stays aviate and decide.

## Open work

- **Full character recast**: cast/design stable role voices, generate the finite catalog with
  `eleven_v3` and the current OpenAI snapshot, then choose by blind owner-ear review. The existing
  production clips remain interim until that review; API credentials are intentionally not stored
  in the repository.
- **Chatter tuning**: keep watching call density in Circuits and Rapier recovery. Classic
  guns-only stays quiet on the trigger.
- **Traffic is heard, not seen**: CircuitPatternTraffic ships render no hulls.
- **Geometry unification**: CircuitPatternTraffic re-states Circuits shelf/final constants beside
  RapierMissionDirector; a future pattern edit can desync flown gates from spoken legs.
- **LSO advisor dedup**: UpdateMissionRadio re-runs Lso.AdviseForMode in parallel with the HUD
  path; drift risk.
