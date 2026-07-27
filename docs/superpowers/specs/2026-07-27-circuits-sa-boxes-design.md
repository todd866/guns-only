# Circuits SA: overhead pattern, traffic, boxes, padlock (design)

Status: Approved in conversation 2026-07-27 · Builds on
`2026-07-27-circuits-fd-boxes-design.md` and `2026-07-27-rapier-circuits-oft-design.md`.

## Thesis

Rapier Circuits is pattern school for cheap, rapidly produced attritable jets (Mirage / F-104
class brick, “almost drones”). Teaching needs:

1. A real **military overhead circuit** (not the Intercept 30 km marshal corridor)
2. **Circuit traffic + tower/traffic comms** so Tab SA means something
3. **V** padlock on the threshold; **Tab** cycles threshold ↔ traffic
4. A **Circuits-aware NAVIGATION** console (leg, threshold, box, fuel)
5. **AIRCRAFT SYSTEMS** for failure practice on unreliable airframes
6. **Draggable** nav and systems consoles

## Pattern (Circuits only)

Military overhead — not a GA rectangle:

| Leg | Intent | Ballpark |
|---|---|---|
| `DEPART` | Ski-jump → climb → join INITIAL | Pattern alt **~1,500–2,000 ft AGL** (~550 m) |
| `INITIAL` | Runway heading, midfield | **~300 KT**, hook down |
| `BREAK` | ~180° to downwind | ~45° bank |
| `DOWNWIND` | Opposite parallel, abeam | Offset **~2–2.5 NM**, **~300 KT** |
| `BASE` | Continuous turn toward final | Shed toward **~220 KT** |
| `SHORT_FINAL` | T&G / go-around **before midfield gear** | **~180 KT** |
| `WIRE_FINAL` | Accept trap; aerobrake → wire | **~170–180 KT** |

Intercept Recovery corridor unchanged when `PatternOnly` is false.

## Traffic + comms

2–3 kinematic pattern ships on the same overhead; padlockable; short tower/traffic calls.

## Padlock / Tab

V defaults to threshold on Circuits. Tab cycles threshold ↔ traffic. Labels THRESHOLD / RAPIER n.

## Nav / systems / drag

Circuits-aware nav (not CONTACT · INTERCEPT). Systems + attritable utility faults (clean toggle).
Both consoles draggable with localStorage.

## Acceptance

1. Overhead legs on Circuits; Intercept RTB unchanged
2. Visible traffic; Tab cycles; V → threshold
3. Nav shows pattern destination
4. Failure path + clean mode
5. Draggable consoles
6. Tests updated
