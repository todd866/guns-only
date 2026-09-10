# Cobra recorded machinery mix — candidate Build 363

The player reported that Cobra still sounded poor after approving the Air Tractor sound. Cobra
already shipped an 11-second UH-1H/T53 airborne cabin recording, but synthetic turbine, gearbox
and tail-rotor tones played continuously over it. This change makes that recording the running
machinery, with a small load-responsive texture underneath. It does not claim an exact AH-1G
recording; provenance remains in `web/wwwroot/render/audio/samples/rotorcraft/SOURCES.md`.

The decoded recording gain now responds to collective/load, while its playback rate stays 1.
Successful AudioBuffer attachment crossfades down the redundant synthetic machinery. Startup,
coast-down, failed loading, mute, wind and combat events retain their existing authority inputs.
The Air Tractor graph and recording bytes are unchanged.

## Evidence

151 focused audio behavior tests pass. `web/smoke/cobra-audio-acoustics.test.mjs` renders the actual
voice graph and shipped WAV in a headless browser using only OfflineAudioContext. Sixteen-second
renders cross the 11-second loop boundary. Isolated branch outputs reconstruct the full render
with relative error below 8e-8. The unchanged Build 362 graph fails the new mix regression.

| Scenario | Previous recording power | Candidate recording power | Previous synthetic tone power | Candidate synthetic tone power | Candidate peak |
| --- | ---: | ---: | ---: | ---: | ---: |
| Hover | 76.7% | 99.99% | 22.0% | 0.000142% | 0.302 |
| Cruise | 69.6% | 99.24% | 25.6% | 0.000163% | 0.321 |
| Loaded | 61.6% | 98.64% | 30.2% | 0.000200% | 0.334 |

These are isolated signal-power ratios, not perceptual quality scores. There is no clipping or
exceptional loop-boundary discontinuity. The real missing-file path retains fallback sound;
muting and completed shutdown settle to silence, with sound during rotor coast. All test browsers
close in cleanup and no device audio is emitted. This is a measured mix correction, not human
listening acceptance or a claim of acoustically calibrated AH-1G simulation.

Run the acoustic check explicitly with `SMOKE_WWWROOT=web/wwwroot node --test
web/smoke/cobra-audio-acoustics.test.mjs` from a checkout with the smoke dependencies installed.

A silent headless check on the production Cobra route with candidate audio overlaid verified the
exact served module/WAV bytes, recording attachment, unchanged playback rate under collective
input, sound-off silence and sound-on recovery. No browser errors; cleanup closed the browser.

Independent Cursor review identified a late-decode transition risk; the recording input is now
closed until attachment is present, and the unit regression covers this. The suggested fallback
volume restoration was not adopted: quieter fallback tones are intentional and the rendered
missing-file path remains audible. The hypothetical clipping concern was checked against the
actual shipped WAV and complete graph (peak 0.334 at maximum load), rather than assumed for a
full-scale replacement asset. Replacing the recording must re-run the acoustic headroom test.
