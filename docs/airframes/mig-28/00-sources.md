# MiG-28 sources

**Identity epistemic: `fiction`.** The name MiG-28 is the Top Gun (1986) aggressor
label. Flight numbers below are **F-5E-class** open-source surrogates, not a real MiG type.

Will back `FlightModel.Mig28F5EClassSurrogate` in `sim/FlightModel.cs` (Task 2).

## F-5E-class surrogates (Northrop F-5E Tiger II)

| Constant | Value | Epistemic | Source |
| --- | --- | --- | --- |
| Empty mass class | 9,558 lb (4,349 kg) | measured | [Hickory Aviation Museum — Northrop F-5 Tiger II](https://www.hickoryaviationmuseum.org/aircraft/northrop-f-5-tiger-ii/) |
| Max thrust class (afterburning) | 5,000 lbf each; 2 × General Electric J85-GE-21B | measured | [Hickory Aviation Museum — Northrop F-5 Tiger II](https://www.hickoryaviationmuseum.org/aircraft/northrop-f-5-tiger-ii/) |
| Wing area | 186 sq ft (17.28 m²) | measured | [Hickory Aviation Museum — Northrop F-5 Tiger II](https://www.hickoryaviationmuseum.org/aircraft/northrop-f-5-tiger-ii/) |
| Gun (F-5E-class) | 2 × 20 mm M39A2 revolver cannon, 280 rounds/gun | measured | [Hickory Aviation Museum F-5 fact sheet PDF](https://www.hickoryaviationmuseum.org/wp-content/uploads/2023/03/Northrop-F-5-Tiger-March-1.pdf) |
| AIM-9 v1 count | 2 | provisional | design resolution — Top Gun v1 loadout; same toy family as Tomcat seat |

Cross-check: [NAVAIR — F-5 Tiger II](https://www.navair.navy.mil/product/F-5-Tiger-II) confirms
J85-GE-21 afterburning thrust class (5,000 lb) and aggressor/adversary training role — the real
airframe Top Gun's MiG-28 fiction stands in for.

## Fiction vs surrogate — read this before Task 2

- **Callsign and HUD label** use MiG-28 (`fiction`).
- **Every flight number** in `FlightModel.Mig28F5EClassSurrogate` must trace to the F-5E table
  above, not to a Soviet type handbook.
- **Gun presentation** may simplify to a single nose gun for v1 gameplay; if so, document the
  reduction in Task 2 — do not silently invent MiG-23/29 cannon performance.

## Known gaps (Task 2+)

- **Aero derivatives and high-alpha behavior** — F-5E open data gives mass/thrust/wing; `CD0` /
  `CLMax` fits are `surrogate` until closed against DACT validation cards.
- **Stores layout** — F-5E hardpoint map is not fully reproduced in v1; AIM-9 count is a design
  resolution, not a sourced F-5E loadout diagram.
