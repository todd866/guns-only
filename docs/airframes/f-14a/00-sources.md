# F-14A Tomcat — flight-model sources

Backs `FlightModel.F14APublicDataSurrogate` in `sim/FlightModel.cs`.

**Rights posture.** Figures below are *facts* from open, unclassified publications — dimensions,
weights, thrust ratings, armament type. No NATOPS, classified performance manuals, or restricted
missile envelopes are cited. Where a museum or Navy fact sheet aggregates figures, the citation is a
pointer for a human to re-check, not a substitute for primary documentation.

## Published / measured — open F-14A (A-model)

| Constant | Value | Epistemic | Source |
| --- | --- | --- | --- |
| Empty mass class | 40,100 lb (18,186 kg) | measured | [National Museum of the U.S. Navy — F-14A Tomcat](https://www.history.navy.mil/content/history/museums/nnam/explore/collections/aircraft/f/f-14a-tomcat.html) |
| Max thrust class (A-model afterburning) | 20,900 lb static thrust each; 2 × Pratt & Whitney TF30-P-412A or -414A | measured | [National Museum of the U.S. Navy — F-14A Tomcat](https://www.history.navy.mil/content/history/museums/nnam/explore/collections/aircraft/f/f-14a-tomcat.html) |
| Wing area / sweep range | 565 sq ft; span max spread 64 ft 1 in, fully swept 38 ft 2 in, overswept 33 ft 3 in | measured | [National Museum of the U.S. Navy — F-14A Tomcat](https://www.history.navy.mil/content/history/museums/nnam/explore/collections/aircraft/f/f-14a-tomcat.html) |
| M61 | 20 mm | measured | [National Museum of the U.S. Navy — F-14A Tomcat](https://www.history.navy.mil/content/history/museums/nnam/explore/collections/aircraft/f/f-14a-tomcat.html) (M-61 cannon listed in armament) |
| AIM-9 v1 count | 2 | provisional | design resolution — Top Gun v1 loadout; not a sourced Tomcat ordnance maximum |

Cross-check: [Western Museum of Flight — Grumman F-14A Tomcat](https://wmof.com/project/grumman-f-14a-tomcat/)
independently lists 40,104 lb empty, 565 sq ft equivalent wing area, and 20,900 lb per-engine
afterburning thrust for the TF30-P-414A.

## Production audio surrogate

The F-14 audio bed is not type-authentic evidence. It is an audio-only derivative of the
47.5–58.5 second airborne cockpit interval in DVIDS
[F-18 Cockpit B-Roll](https://www.dvidshub.net/video/342602/f-18-cockpit-b-roll), credited to
Cpl Anthony Rayis / AFN Iwakuni with footage courtesy of Maj Erik Sprague (2014-06-11,
VIRIN `140611-M-ZP289-002`, DOD ID `DOD_101732906`). It is labelled and used only as an F/A-18
cockpit **surrogate** for game sound; it does not establish an exact F-14 or TF30 acoustic model.
The exact source object, hashes, conditioned-file metrics, rights boundary, and required final
human-listen gate are recorded in
`web/wwwroot/render/audio/samples/jet/SOURCES.md` and `audio/jet-library/catalog.json`.

The DVIDS page explicitly marks its source work **PUBLIC DOMAIN** subject to the
[DVIDS copyright notice](https://www.dvidshub.net/about/copyright). The audio-only derivative
contains no source visuals or marks and is not relicensed under the repository MIT license. This
is a reasonable safe-use assessment, not a legal warranty.

> The appearance of U.S. Department of War (DoW) visual information does not imply or constitute DoW endorsement.

## Explicit mission surrogates — 2026-08-14 control pass

These values are product decisions or transparent reduced-order models. They are deliberately not
presented as NATOPS limits, flight-test results, or a claim about the ultimate strength of a real
airframe.

| Contract | Value | Epistemic | Reason / validation boundary |
| --- | --- | --- | --- |
| Ordinary full-pull protection | 7.5 G | provisional, owner-directed | `ArrowDown` immediately requests the lesser of aerodynamically available load and 7.5 G. This is the game airframe's protected control-law boundary. |
| Emergency override command and achieved-load guard | 11.0 G | provisional, owner-directed | `Space+ArrowDown` exposes an over-limit region but both commanded G and the F-14 lift-force path stop at 11.0 G. Production telemetry had recorded a 13.803 G achieved-load overshoot after override release despite a 5.508 G applied command; 13.8 G is explicitly rejected as the product behavior. |
| Over-limit structural exposure | above 7.5 G; severity cubed over a 7.5–11.0 G span; 8 equivalent cumulative seconds at maximum | provisional consequence model | Brief 1–2 second emergency pulls survive; repeated or sustained abuse accumulates irreversible mission-local airframe strain and can reach failure. Eight seconds is a gameplay budget, not a fatigue-life or ultimate-load inference. Pilot G tolerance remains owned by the shared onset/exposure/AGSM physiology model; crossing 11 G does not itself guarantee G-LOC. |
| Automatic sweep endpoints | 20–68 degrees | public-envelope surrogate | The open fact sheets establish a large variable-span range but do not provide the Mach Sweep Programmer law used here. Endpoints and interpolation remain clearly labelled surrogate. |
| Manual sweep rate | 12 degrees/second | provisional control-feel value | A held command traverses the 48-degree operating range in four seconds; no OEM actuator-rate claim is made. |

The wing angle in snapshots, HUD, effective-span aerodynamics, and exterior articulation is one
authority-owned value. Automatic is the default; forward/aft inputs enter manual mode, and the
dedicated AUTO input returns to the same provisional Mach/CAS schedule. Presentation code does not
run a second sweep schedule.

## Known gaps (Task 2+)

- **Swing-wing schedule vs Mach/CAS** — museum fact sheets give fixed sweep positions, not the
  Mach Sweep Programmer law. The shipped coarse schedule remains `provisional` pending an open,
  reviewable source.
- **Installed thrust lapse and spool** — static sea-level afterburner figures only; no open
  installed-deck map held for ACM altitudes.
- **Aero derivatives (`CD0`, `CLMax`, FBW feel)** — not claimed here; any fit is `surrogate` and
  must close against validation cards, not against classified envelopes.
- **RIO / AWG-9** — out of v1 scope; single-seat control fantasy per design record.
