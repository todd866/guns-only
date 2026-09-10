# Fire Boss recorded audio adjustment

The user reported that the Okanagan aircraft did not sound like an Air Tractor. The Build 360
engine graph was primarily synthetic: its five-blade pulse and shaft sine accounted for 81–87%
of the rendered energy across idle, cruise and takeoff test frames. The real recording supplied
only 5–15%. It was a 4.2-second exterior U-28/PC-12 clip, high-passed at 320 Hz, with a repeated
brief level dip at its loop boundary. Fake-node tests passed because they checked wiring and
parameter gains, not the emitted waveform.

## Change

The replacement is a 24-second recording of an OA-1K / Air Tractor-family engine, with actual
propeller texture retained. Five broad EQ bands are informed by an actual Fire Boss pilot-view
YouTube reference. The redistributed PCM comes exclusively from a public-domain DVIDS recording.
The source was recorded outside on the ground: it is an authored cabin surrogate, not an exact
Fire Boss cockpit recording or a flight-power sample set. [Full provenance and reproducible conditioning](../../web/wwwroot/render/audio/samples/turboprop/SOURCES.md)
record the distinction and checksums.

Pure shaft and compressor oscillators have been removed. The recording supplies the main engine
sound; small procedural load textures sit below it and provide a restrained fallback while the
recording loads. Actual mission power adjusts volume and low-frequency body without pitch-sweeping
the entire recording. Water and airspeed cues retain their separate simulation inputs. The 24-second
loop uses an equal-power wrap without a fade to zero. No flight dynamics or RPM authority changed.

Diagnostics now distinguish loading, failed, cooldown and attached recordings. They expose the
recording identity, decoded duration, playback rate and input gain. A running AudioContext is no
longer sufficient evidence that the recording is playing.

## Verification scope

All automated browser work runs headless and silent. OfflineAudioContext renders the actual graph
without a device output. A real-game check runs the exact candidate audio files over the deployed
Build 360 mission and compiled simulation, checking load identity, power response and mute/unmute.
The final promoted release receives the same real-game check against its public files.

Node tests cover load failure, cooldown, successful recovery, a unique attached source, recording
handoff, neutral playback rate under power changes, shared mute and existing water-operation edges.
The new headless rendered-audio regression is part of both the local gate and canonical Verify.

Baseline isolated-graph measurements (before the shared final bus):

| State | RMS dBFS | Synthetic shaft + blade lines | Decoded recording energy |
| --- | ---: | ---: | ---: |
| Idle | −35.70 | 81.1% | 15.0% |
| Cruise | −31.06 | 84.4% | 7.2% |
| Takeoff | −29.16 | 87.1% | 5.5% |

These are signal and software checks, not an auditory review, OEM acoustic validation or a claim
that incidental speech/music has been conclusively excluded. This agent runtime cannot perceive
audio. The user's assessment of the sound remains necessary for perceptual acceptance.

Independent review reproduced the new asset byte-for-byte and found no blocking runtime or
conditioning defect. The reviewed input/source perspective and these evidence limits remain
explicit. Candidate/local evidence is retained under `/private/tmp/fireboss-cockpit-audio-20260910`.

Candidate direct renders span 52 seconds, including both 24- and 48-second loop boundaries:

| State | RMS dBFS | Peak dBFS | Decoded recording energy |
| --- | ---: | ---: | ---: |
| Idle | −32.73 | −19.63 | 100.0% |
| Cruise | −28.14 | −14.82 | 99.2% |
| Takeoff | −25.61 | −12.36 | 99.7% |

The former shaft/blade narrow-line energy falls to approximately 1.6–1.7%, and the isolated pure
compressor tone is zero. No loop click outlier or boundary silence dip was found. Percentages are
isolated signal-power ratios with small cross terms, not a perceptual loudness scale.

The actual-game candidate check passed: the browser fetched all four reviewed audio resources
byte-for-byte, reported the new recording ready at 24 seconds, and advanced its input gain from
0.608 to 0.824 under ordinary W-key power input. Ordinary M-key mute/unmute silenced and restored
the recording in the same context. `audioQa=silent` kept destination gain zero throughout, and the
browser closed in cleanup. Evidence: `game-candidate.json` in the directory above.

Final focused validation passed at the Build 361 stamp: 150 Node audio tests and the real
OfflineAudioContext browser regression. The adversarial simultaneous water/power state peaks at
−12.75 dBFS, has no clipping, and its largest control-edge derivative is 0.877 times ordinary
99.9th-percentile variation. Engine-off decays to zero. The browser test records zero device
AudioContext attempts and closes its browser/server; canonical Verify also retains its JSON evidence.
