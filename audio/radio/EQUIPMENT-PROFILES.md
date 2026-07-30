# Radio equipment and talker profiles

The production speech asset is a **dry performance**, not a completed radio effect. Two explicit
profiles turn that performance into received R/T:

1. `talker_profile` — the physical mouth-to-microphone path: mask, microphone proximity, and
   associated spectral color.
2. `transceiver_profile` — the transmitter/receiver installation: passband, presence, AGC,
   squelch transients, and noise under current link conditions.

They remain separate because a pilot is not a radio. Replacing an aircraft's transceiver must not
force a voice-model recast; changing the mask or microphone may change the performance and does
invalidate its source hash.

## Shipped profile contract

| Profile ID | Physical fiction | Production target |
|---|---|---|
| `rapier.pressure-vessel.emergency-mask` | Rapier pilot inside the sealed composite pressure vessel, wearing a lightweight emergency oxygen/microphone mask | Very close, clean microphone; mild mask color; routine speech has no continuous regulator rasp |
| `modern.fast-jet.oxygen-mask` | Conventional modern fast-jet oxygen mask | Close and intelligible, with stronger mask/microphone color than Rapier |
| `korea.f9f.a13a-mask` | Korean War F9F pilot using the period demand-type mask and its internal microphone | Narrower, more resonant mouth-to-mic path; exact words must remain legible |
| `ground.controller.close-mic` | Tower or tactical controller at a ground microphone | Cleanest talker path |
| `carrier.deck-lso.close-mic` | LSO close to a deck microphone | Firm consonant onset and modest low-frequency rejection; urgency comes from the take |
| `modern.uhf-am.airborne` | Rapier/modern airborne AM set | Clean strong-signal reception with restrained squelch and little carrier noise |
| `modern.uhf-am.ground` | Modern tower/control AM set | Slightly wider and quieter strong-signal reception |
| `modern.uhf-am.deck` | Modern deck/LSO AM set | A little tighter than the ground set; no permanent wind-effects bed |
| `korea.arc-1.vhf-airborne` | F9F-era airborne AN/ARC-1 VHF AM set | Tighter bandwidth, firmer AGC, longer key/unkey transients, more noise when marginal |
| `korea.arc-1.vhf-ship` | Period ship-side AN/ARC-1 net | Similar period signature with a somewhat cleaner installation |

The numeric filters in `radio_equipment_profiles.js` are perceptual production models, not a claim
to be laboratory transfer functions for surviving hardware. They must be tuned against primary
recordings and owner-ear review, while preserving the relative contract above.

F9F radio fit varied by model and modification state: surviving references list both AN/ARC-1 VHF
and AN/ARC-27 UHF installations. The Armstrong 1951 flashback currently treats ARC-1 as the
working hypothesis, not as a universal Panther property. The mission dossier must lock the
aircraft Bureau Number and radio fit before final mix; evidence for ARC-27 means adding/selecting
an ARC-27 profile, never quietly making `korea.arc-1.vhf-airborne` sound like both sets.

## Rapier oxygen-mask policy

The pressure vessel supplies the normal breathing atmosphere. The pilot still wears the mask
because it combines a stable close microphone with immediately available independent oxygen after
smoke, contamination, decompression, or a pressure-system failure. Normal Rapier takes therefore
must not contain the rhythmic regulator breathing associated with a pilot continuously drawing
oxygen. A pressure emergency is a separate performance state: positive-pressure breathing,
shortened phrases, and physical effort belong in the dry take only when simulation state calls for
them.

## Signal quality

`radio_signal_quality` is a normalized receiver-link value from `0` to `1`. A missing value means
`1`: a strong line-of-sight link. Quality changes:

- carrier noise;
- received high- and low-frequency limits;
- key/unkey transient prominence; and
- only a small amount of overall receive level.

It is intentionally not a generic “static amount” or a distance-volume knob. Strong AM R/T is
clear. Marginal R/T gets narrower and noisier. Future terrain/range simulation should project the
quality value from line of sight, range, antenna geometry, and damage; the browser already consumes
the field without requiring a new speech asset.

## Authoring and manifest flow

Catalog version 6 requires both profile IDs on every role. The generator validates them and writes
them into each manifest clip. An existing WAV is reusable only when the previous manifest contains
the same source hash. A talker-profile or performance-prompt change makes the take stale and forces
regeneration; a transceiver-only change preserves it and rewrites only the manifest metadata.
Runtime selection order is:

1. explicit simulation snapshot fields (`radio_talker_profile`,
   `radio_transceiver_profile`, `radio_signal_quality`);
2. clip metadata in the generated manifest; then
3. backward-compatible role defaults for the currently shipped older manifest.

This makes a Korea mission opt in explicitly to the F9F/ARC-1 pair and prevents “pilot” from
silently meaning one universal modern radio sound.
