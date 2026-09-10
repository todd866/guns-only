# Fire Boss recorded engine bed

`at802_family_cabin_loop.wav` is an authored **cockpit presentation surrogate**, based on a
real Air Tractor-family engine recording. The source aircraft is the **OA-1K Skyraider II**,
recorded **outside on the ground**, not an AT-802F Fire Boss cockpit. Its microphone response,
propeller RPM and cabin transfer function are not measured Fire Boss data.

## Distributed audio

- Original: [417th Flight Test Squadron OA-1K B-roll](https://www.dvidshub.net/video/991792/417th-flight-test-squadron-conducts-tests-oa-1k-skyraider-ii-b-roll-package).
- Creator: Matthew Veasley, 96th Test Wing; recorded 2025-06-25.
- VIRIN `250625-F-NV708-2185`; object `DOD_111461879`; source interval **640–665 seconds**.
- Public source object: `https://d34w7g4gy10iej.cloudfront.net/video/2512/DOD_111461879/DOD_111461879.mp4`.
- Decoded interval: stereo 48 kHz PCM24, SHA-256
  `bc9aafb9ee39d17105b7ac9bfcb9adc681e4b6599da20c1c8c350a4c834ff480`.
- Production loop: mono 48 kHz PCM16, **24 seconds**, 2,304,044 bytes, RMS −19.00 dBFS,
  peak −5.91 dBFS. SHA-256
  `d2e4f35d148c60d89d18f3d62bec418768f9f66fd5e3d18474608d427a1dd09d`.
- Conditioning: mono, broad smooth EQ, 24 Hz rumble rolloff, high-frequency rolloff, one-second
  equal-power wrap, RMS/peak trim. No pitch shift; actual propeller texture remains in the recording.
- Reproduce using `tools/audio/fireboss_recording.py REVIEWED_NATIVE_INTERVAL.wav OUTPUT.wav`.
  The tool requires the reviewed source checksum. Adjacent JSON records the output measurements.

The source is marked **PUBLIC DOMAIN**, subject to the
[DVIDS notice](https://www.dvidshub.net/about/copyright). No visual, logo, personal likeness or
military mark is distributed. The recording is not relicensed under this repository's MIT license.

> The appearance of U.S. Department of War (DoW) visual information does not imply or constitute DoW endorsement.

## Cockpit reference and limits

[jose galiano's AT-802 FIRE BOSS SCOOPING PILOT VIEW](https://www.youtube.com/watch?v=h1XTbipnVjs),
uploaded 2017-08-31, was acquired privately for analysis. The retrieved metadata exposes no reuse
grant; **none of its PCM is distributed**. The first 20 seconds informed only five broad spectral
proportions (20–80, 80–250, 250–800, 800–2500, 2500–8000 Hz). The final authored target is
27%, 50%, 17%, 4%, 2%; this is neither an impulse response nor a narrow-tone reconstruction.
Camera gain, wind, clipping, hearing protection and aircraft state limit this comparison.

The engine recording is now the primary voice. Live torque changes its amplitude and low-frequency
body without a throttle-driven pitch sweep. The pure shaft and compressor oscillators are removed;
procedural load texture remains subdued. Water and airflow remain separate simulation-driven cues.
The mission's existing 1700 RPM takeoff-config approximation remains unchanged; this asset does
not establish ground idle RPM or a recorded idle/cruise/takeoff sound set.

Source perspective was checked with silent video frames. Waveform, spectral, loop, headroom and
browser checks are objective signal checks; they do not constitute an auditory review or establish
speech-free recording content. The current agent runtime does not support audio perception.

This replaces the previous 4.2-second high-passed U-28/PC-12 exterior surrogate, whose low-frequency
identity was dominated by synthetic oscillators and whose loop had a repeated level dip.

## Native interval acquisition

FFmpeg 8.1 (Homebrew 8.1_1, Apple clang 21) produced the reviewed native interval:

```sh
ffmpeg -hide_banner -loglevel warning -ss 585 \
  -i 'https://d34w7g4gy10iej.cloudfront.net/video/2512/DOD_111461879/DOD_111461879.mp4' \
  -t 195 -map 0:a:0 -vn -c:a pcm_s24le source-585-780.wav
ffmpeg -hide_banner -loglevel error -ss 55 -i source-585-780.wav \
  -t 25 -c:a pcm_s24le source-640-665.wav
```

The intermediate file checksum is `d4ce92f5a81c9e76c58b09a71c92cedf8d2b598cd6b20c2a111ef8f872132dc0`.
Raw candidates and reference recordings remain outside the repository/published site.
