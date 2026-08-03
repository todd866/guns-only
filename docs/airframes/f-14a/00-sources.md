# F-14A Tomcat — flight-model sources

Will back `FlightModel.F14APublicDataSurrogate` in `sim/FlightModel.cs` (Task 2).

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

## Known gaps (Task 2+)

- **Swing-wing schedule vs Mach/CAS** — museum fact sheets give fixed sweep positions, not the
  Mach Sweep Programmer law. Task 6 owns a coarse schedule; label `provisional` until bound.
- **Installed thrust lapse and spool** — static sea-level afterburner figures only; no open
  installed-deck map held for ACM altitudes.
- **Aero derivatives (`CD0`, `CLMax`, FBW feel)** — not claimed here; any fit is `surrogate` and
  must close against validation cards, not against classified envelopes.
- **RIO / AWG-9** — out of v1 scope; single-seat control fantasy per design record.
