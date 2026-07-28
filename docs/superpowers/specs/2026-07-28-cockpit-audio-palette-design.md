# Cockpit audio palette and mechanism pass

Status: implemented through Build 171 · 2026-07-28

Builds on:

- `2026-07-28-better-sound-design.md`
- `2026-07-28-f22-cockpit-audio-design.md`
- `web/wwwroot/render/audio/{engine,event,flight}_audio.js`

## Problem

The first hybrid pass fixed the largest category error—ownship should not sound like an exterior
flyby—but each aircraft still had only one four-second bed per power regime. Long fights exposed
the loop, F-22 and Rapier had too little interior motion, the gun fired identical 18 Hz reports
regardless of the selected weapon, and gear/flap motion was silent.

The answer is a **palette**, not a pile of unrelated one-shots:

1. measure several real cockpit perspectives;
2. retain only aggregate spectra in the repository;
3. synthesize independent, seamless production beds from those targets;
4. vary only where the aircraft state or a deliberately slow F-22 timbre drift calls for it;
5. reserve transients for physical edges (gun start, gear door, downlock, flap actuator).

## Ghibli-adjacent tone alignment

ADR-0003 applies to sound as strongly as it does to light:

- **Mechanical affection, not military fetish.** Pumps, latches, relays, fan bodies, strained
  seals, and air moving through a cabin are intimate and tactile. The weapon is blunt and
  frightening, not a rewarded power chord.
- **Cold instruments / warm physical world.** Warning tones stay unambiguous and clinical. The
  non-instrument layer may be rounded, imperfect, and human-scale.
- **Ma is functional.** Zoom-coast and post-engagement space retain quiet ECS/electrical presence;
  they do not fill every gap with score or synthetic engine wash.
- **No celebratory kill punctuation.** Hit and destruction cues are range-attenuated, cockpit
  filtered, and factual. There is no victory sting.
- **No style copying.** Do not copy Studio Ghibli soundtracks, Joe Hisaishi melodies, proprietary
  sound libraries, or identifiable film cues. "Ghibli-adjacent" means pacing, tenderness toward
  machines, pastoral/industrial contrast, and quiet aftermath.

The future medevac path can reuse this grammar: clean fibre-link control versus dirty EW radio,
quiet patient breathing against a distant propulsion floor, violent reel/winch mechanics at the
front, and the warm acoustic shelter of the large air ambulance after capsule recovery. Those are
later systems, not sounds to fake in the current fighter snapshot.

## Reference corpus

Raw pulls live under gitignored `analysis/audio-refs/`. No reference PCM ships.

| Reference | Rights/use | Finding | Production use |
| --- | --- | --- | --- |
| [F-22 demo cockpit recording](https://www.youtube.com/watch?v=NWxtuDEyK9g) | spectral reference only | 51–64% of analyzed band energy below 80 Hz; centroid falls from ~545 Hz to ~295 Hz in louder regimes | F-22 dark-body alternate beds |
| [DVIDS 158th FW F-16 cockpit footage](https://www.dvidshub.net/video/669814/158th-fw-aerial-f-16-footage) | identified by DVIDS as public-domain U.S. government VI; aggregate analysis only | 47–62% in 80–250 Hz, 27–36% in 250–800 Hz; very little sub-80 energy | Rapier interior mid-body alternates |
| [DVIDS F-22 cockpit B-roll](https://www.dvidshub.net/video/845172/f-22-raptor-demo-team-cockpit-b-roll) | public-domain U.S. government VI | embedded audio stream is effectively digital silence (~−91 dBFS) | rejected; recorded as a corpus failure, not treated as evidence |
| StoneyJ F-4 run-up/takeoff | CC0 | bright turbine/AB identity | existing Rapier primary beds |

The DVIDS public-use notice is broader than a simple license label and includes non-endorsement,
privacy/publicity, and third-party-IP cautions. The production build therefore ships **new
synthesis informed by aggregate measurements**, not DVIDS PCM.

## Reproducible analysis

`tools/audio/cockpit_palette.py` replaces the one-off generation step.

```bash
python3 tools/audio/cockpit_palette.py analyze \
  --input analysis/audio-refs/f22-cockpit-full.wav \
  --output web/wwwroot/render/audio/samples/jet/f22_palette_profile.json \
  --source-id youtube.NWxtuDEyK9g \
  --source-url 'https://www.youtube.com/watch?v=NWxtuDEyK9g'

python3 tools/audio/cockpit_palette.py synthesize \
  --profile web/wwwroot/render/audio/samples/jet/f22_palette_profile.json \
  --output-dir web/wwwroot/render/audio/samples/jet \
  --prefix f22 --suffix alt --seconds 6 \
  --target-rms-dbfs=-16,-14.5,-13.5
```

`analyze` uses overlapping 250 ms frames, classifies quiet/mid/loud regimes by RMS quantiles, and
stores band fractions, centroid, rolloff, and low-frequency peak locations. It rejects effectively
silent sources. `synthesize` starts from random-phase spectral noise, adds authored periodic
cockpit mechanics, gentle saturation, and only restrained loop-periodic modulation. It cannot
reconstruct or redistribute source PCM. Production RMS targets are explicit because recording
gain is not an aircraft property. Rapier's interior beds are 18 seconds long and level-stable;
the short F-4 excerpt is retained only as quiet identity seasoning.

## Runtime mix

### F-22

- Primary and alternate idle/MIL/grit beds move through a full equal-power crossfade.
- Crossfade phase changes only with time, so power, dynamic pressure, and G remain independent
  audible axes rather than also changing the source timbre.
- Both beds are sealed-cockpit synthesis, so either can own the mix.
- A quiet ECS noise bed and 400 Hz electrical floor survive the propulsion coast gate.

### Rapier

- The 18-second F-16-cockpit-profile synthesis owns the level-stable interior body.
- Existing 2.6-second CC0 F-4-derived beds remain at a fixed, quieter weight for bright turbo/ram
  identity without announcing their short envelope.
- Rapier has no wall-clock palette crossfade: a fixed flight state produces fixed bed gains.
- Procedural ram duct/howl/spit still takes over through the Mach 1.9–2.8 handover.

## Gun

The snapshot already publishes `player_gun_profile_id`. Audio now honors it:

| Profile | Sim cadence | Audio treatment |
| --- | ---: | --- |
| M61A2 surrogate | 100 rps | persistent 100 Hz internal cyclic body + gas/mechanism beds + 25 clustered reports/s |
| GSh-301 surrogate | 25 rps | 25 Hz cyclic body + one report per round |
| six M3 .50 cal | 15 rps | 15 Hz cyclic body + slower reports with stronger breech detail |

The M61 cluster rate caps Web Audio graph allocation while the persistent oscillator preserves the
real cadence. Every cluster varies seeded noise, filter center, body pitch, and envelope. A tab
resuming from the background drops stale clusters rather than playing a catch-up burst.

## Configuration mechanisms

Published `gear_{nose,left,right}` and `flap_{left,right}_deg` positions drive:

- movement-rate-scaled hydraulic/track rumble;
- pump/actuator tone;
- gear-door/start clunk;
- gear up-lock/downlock or interrupted-stop body hit;
- quieter flap start/stop transients.

Mute still gates the shared master. Position history continues while muted so unmuting does not
manufacture an edge that did not occur.

## Feel gate

Use `render/audio/preview/jet_preview.html`:

1. F-22 idle → MIL: dark cabin body, no exterior fan scream.
2. Hold either F-22 regime for 30–60 seconds: texture moves without an obvious loop boundary.
3. Hold Rapier idle/MIL for 30 seconds: the body stays steady, with no 2.6 s or 6 s pumping.
4. M61 burst: one dense internal buzz/hammer, not eighteen identical pops per second.
5. Gear extension: bay/pump movement followed by a decisive lock.
6. Zoom coast: propulsion collapses; ECS/electrical floor and RCS remain.
7. Target destruction at range: a muted physical report, no arcade boom or reward sting.

## State-cue and exterior follow-on

The F-22 production graph now keeps its engine submix ahead of the shared compressor. A subtle
structure-borne compressor trace follows core RPM beneath fixed-pitch cockpit beds; delivered
power uses the snapshot's `engine_spool_fraction` and `max_thrust_fraction`, including the F-22's
1.35 augmentation stop. A separate 1.8–8 kHz boundary-layer band follows dynamic pressure and its
rise rate. Pitching the entire broadband bed remains forbidden.

Positive G has low structure, pneumatic suit, and harness components; negative G/unload has a
separate lighter strap/loose-kit voice. Speed-brake aerodynamic level uses dynamic pressure rather
than TAS, and boolean buffet is only an onset floor.

Other-aircraft sound is a separate range/closure-driven graph. Fighter contacts receive a bounded
Doppler spectral shift and one latched pass transient; cockpit mode low-passes them through the
canopy. A second range/climate filter models atmospheric loss independently, so an exterior
listener still loses upper-band detail with distance. Live geometry adds restrained stereo
positioning in the F-22 cockpit and wider positioning externally. Heavy turboprops have a longer
falloff, while the Tu-95/Bear class uses a 750 rpm rotor pulse, approximately 50 Hz four-blade
passage, interaction harmonics, and an intentionally long audibility envelope. External camera
mode opens both ownship and contact spectra.

MIL-to-augmentation is a separate F-22 cue even when governed core RPM remains at 100%: delivered
power above the dry stop drives a low structure/pressure body and shallow pulse. It does not pitch
the fixed broadband cockpit bed. Production also pools three bounded contact graphs for formation
traffic, de-duplicates the selected gun target, and derives missing wingman closure from smoothed
range change. Compact incident replay reconstructs only recorded continuous state and fails quiet
for unrecorded systems instead of leaking final-live audio into historical footage.

## Next highest-value captures

1. Licensed/self-recorded switch, guard, canopy-latch, and harness Foley.
2. Public-domain carrier/deck structural transients, used only after a source-by-source rights check.
3. Rain/hail/canopy impacts and runway/deck tire contact.
4. Radio/intercom voice chain as a separate accessibility-aware system.
5. Pilot breathing/G-strain only after a voice-content direction is approved.
