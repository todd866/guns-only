# F9F-2 Panther — flight-model sources

Backs `FlightModel.F9F2Panther` in `sim/FlightModel.cs`.

**Rights posture.** Every figure below is a *fact* located in a copyrighted work — a dimension,
a weight, a thrust rating. Facts are not the author's expression and are not owned. No extracted
text, passage or scan from PaperLibrary is reproduced here or anywhere in this repository, per
`docs/art-direction/korea-1950s/narrative/research-ledger.md`. Where a book is cited, the citation
is a pointer for a human to re-check, not a substitute for the book.

## Measured — public data for the F9F-2

| Quantity | Value | Source |
|---|---|---|
| Length | 37 ft 5 in | Osprey **Duel**, *F9F Panther vs Communist AAA: Korea 1950–53*, "F9F-2 Panther Specification" data box |
| Wingspan | 38 ft 0 in (folds to 23 ft 5 in) | ibid.; fold figure from the same work's technical-specifications chapter |
| Height | 11 ft 4 in | ibid. |
| Wing area | 250 sq ft | ibid.; **independently corroborated** by Ginter, *Grumman F9F Panther Part 1*, in the passage explaining the Cougar grew the wing to 300 sq ft to hold the Panther's carrier approach speed |
| Empty weight | 9,909 lb | Osprey Duel data box |
| Max take-off | 19,494 lb | ibid. (with external stores — **not** the clean figure used for `MassKg`) |
| Max speed | 575 mph at sea level | ibid. |
| Initial climb | 5,140 ft/min | ibid. |
| Service ceiling | 44,600 ft | ibid. |
| Powerplant | P&W J42-P-6, 5,750 lbf | ibid. |
| Water/alcohol injection | 5,750 → 5,950 lbf, ~30 s, 22.5 gal tank | Osprey Duel, technical-specifications chapter |
| Internal fuel | 682 US gal + 2 × 120 gal wingtip | ibid. |

Cross-check note: the same data box is reached in the extracted EPUB text out of document order,
so it sits adjacent to an unrelated F9F-5 photo caption. The block is explicitly headed
*"F9F-2 Panther Specification"* — attribution confirmed by that heading, not by adjacency.

## Derived / provisional — fits and scalings, not measurements

| Field | Value | Basis |
|---|---|---|
| `CD0` | 0.0265 | Fitted so `ThrustMaxN` closes ~500 kt TAS at sea level (575 mph). Sanity: 25,577 N ÷ (½·1.225·23.23·0.0265) → ~504 kt with induced drag included. Compare Sabre 0.0166 — the Panther really was that much draggier. |
| `InducedK` | 0.038 | Sabre's *fitted* 0.045 scaled by aspect ratio 4.77 → 5.78. Not 1/(π·AR·e); the Sabre value is an effective fit and back-solving it gives e > 1. |
| `CLMax` | 1.35 | Straight wing above the swept Sabre's fitted 1.10. No locator held. |
| `MCrit` / `WaveDragK` | 0.76 / 420 | Straight thick unswept wing: drag rise well below the Sabre's M0.89. |
| `SpoolUpTau` | 4.5 s | Centrifugal J42 (licence Nene) lag. **No measured spool figure located** — this is the single most load-bearing provisional number here (see below). |
| `PositiveStructuralLimitG` | 6.5 | No NATOPS-equivalent locator held. Placeholder. |
| `PropulsionModel` | `GenericDensityScaled` | No J42/Nene map exists; the J47's axial lapse is the wrong shape for a centrifugal engine, so the generic model is used rather than a misleading borrowed curve. |

## A correction worth keeping

An earlier draft of the code comment claimed the Panther came aboard because of *lower* wing
loading. It does not: at these masses it is the more heavily loaded of the two (286 kg/m² against
the Sabre's 257 kg/m²). Approach speed scales as sqrt((W/S) / CLmax), and it is the straight
wing's much higher usable CL that buys the approach, not the loading. This matters practically —
raising `CLMax` to "improve" handling silently makes the deck easy.

## Why the engine number decides the carrier beat

Essex in 1951 was post-SCB-27A but still an **axial straight deck** — no angled deck, no mirror,
paddles LSO, barrier at the far end. There is no bolter. A late wave-off is therefore a decision
paid for by an engine that is still spooling, and `SpoolUpTau` is what makes that trade real
rather than decorative. If one number here is worth replacing with a measured one, it is this.

## Known gaps

- **No approach or stall speed with a locator.** The corpus establishes that the Panther's
  approach speed was a binding design constraint (the Cougar wing grew to preserve it) and that
  its stalling speed drew complaints, but no number was found. Currently implied by `CLMax` and
  wing loading rather than asserted.
- Three Panther books in PaperLibrary are **image-only PDFs with no OCR** — *Detail & Scale*,
  *in Action*, and *First Grumman Cat of the Jet Age*. Detail & Scale in particular is where
  approach speeds and structural limits usually live. OCRing those is the obvious next step.
- Water injection is documented but **not modelled**: it is a ~30-second catapult aid, and the
  kernel has no time-boxed boost, so `MaxThrustFraction` stays 1.0. Modelling it as a sustained
  multiplier would hand the pilot a permanent 3.5% — worse than omitting it.

## Operational texture worth using elsewhere

- Essex-class carriers stocked **piston-engine aviation fuel**; early J42-P-4s needed 3%
  lubricating oil added to burn it. Later J42-P-6s did not. (`FuelFreeMassKg` takes internal fuel
  at avgas density for this reason.)
- The Panther burned roughly **four times** the fuel of the F4Us sharing its deck — fuel planning
  was a live pressure, not scenery.
- A hit in the aft fuselage that started a fire would take the tail section off and render the
  aircraft uncontrollable. A damage-model fact, sourced, and not currently represented.
