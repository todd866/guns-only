# Airframes — SE bible + capture kit

This directory holds, per airframe, the **systems-engineering bible**: the readable record of *why*
the aircraft is the shape, weight, and material it is. Each bible is paired with a versioned
**Airframe Definition** JSON under `airframes/` at the repo root, which *captures* the bible's
closed geometry and material numbers so blueprints and the in-game mesh cannot drift from them
without a deliberate revision bump.

**Engineering leads. Capture follows. Not the other way around.**

## Directory shape

```text
airframes/<id>.v1.json          # geometry-of-record, captured from the bible
airframes/schema/...            # JSON Schema that validates the capture
airframes/_template/...         # empty definition template for a new airframe
docs/airframes/<name>/          # SE bible chapters, in Part I order
docs/airframes/<name>/blueprints/ # plates generated/authored from the JSON
analysis/art-refs/<name>/       # fiction-tagged mood stills (ADR-0003; not runtime SoT)
```

See `docs/airframes/rapier/` for the first airframe worked this way, and
`docs/superpowers/specs/2026-07-27-rapier-airframe-se-and-jet-kit-design.md` for the design record
that established this pattern.

## The order every future jet follows

1. **Write Part I of the bible first.** Mission and flight regime → geometry → thermal/materials →
   propulsion → mass and CG. These are engineering decisions with numbers and reasoning, argued in
   prose and closed tables, not a stub waiting for a schema. See
   `docs/airframes/rapier/00-mission-and-ops.md` through `40-mass-and-cg.md` for the pattern:
   each chapter states what is **closed** (a concrete repo constant), what is **surrogate**
   (a deliberate physically-reasoned stand-in), and what is **provisional** or an **open finding**
   (not yet closed — named, not faked).
2. **Then stub the systems chapters** (crew/escape/FBW, armament, landing gear, basing, failure
   modes, cost) that follow from Part I. It is fine — expected — for these to be short and mostly
   `provisional` callouts in a Phase 1 pass. Do not invent closed numbers to make a chapter look
   finished; name the gap instead.
3. **Then copy the template JSON** (`airframes/_template/airframe.v1.json`) and fill it as a **1:1
   migration** of the bible's closed numbers — dimensions, wing planform, material zones, sockets.
   The JSON round-trips the bible; it does not add new engineering decisions of its own. If a number
   in the JSON does not trace to a bible chapter, that is a bug in the JSON, not a shortcut.
4. **Then author blueprint plates** from the JSON — three-view, planform, loft stations, thermal
   zones, and whatever else the airframe needs. Plates cite the definition's `id` and `revision` and
   derive every number from the JSON, never from a separate hand calculation.
5. **Only then does the renderer/mesh work happen**, built from the same Airframe Definition via
   `createAirframeFromDefinition` (or the loader that supersedes it), so the visual OML cannot
   silently diverge from the bible or the JSON.

## No bespoke `createFoo` without an exception note

New airframes should be buildable from the shared loft/planform/socket schema that
`createAirframeFromDefinition` understands. A bespoke, one-off mesh-construction function
(`createFoo`) for a new jet is only acceptable when the shared schema genuinely cannot express the
airframe's OML — and when that is true, the exception must be written down (which geometry the
schema cannot express, and why) next to the bespoke function, not left implicit. The default
assumption for any new airframe is that it fits the existing schema.

## Ghibli / mood references

Fiction-tagged stills under `analysis/art-refs/<name>/` inform palette and mood only, per ADR-0003.
They are never a source of truth for OML, mass, or performance, and they come **after** the
engineering bible exists, not instead of it.

