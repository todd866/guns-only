# Cobra Depart cold-open + golden path

Date: 2026-08-10  
Status: approved for implementation (owner: skids-on-pad Depart; visible path)  
Base: [Ember Run](./2026-08-07-cobra-ember-run-design.md), live Build 299

## Product

Cold open must read as a **FOB departure**, not a knife-fight over the river:

1. Skids on Camp Ember pad, rotors turning, zero groundspeed.
2. No shootable hostile in the open picture.
3. A **visible soft golden path** shows where to fly down the gorge.
4. First job: lift off and follow the path. Combat after Depart → Ingress.

## Rules

| Topic | Rule |
| --- | --- |
| Spawn | CG at terrain + `CenterOfMassToSkidM` over Camp Ember route start; velocity 0; yaw down-route |
| Gunnery seam | Not seeded at t=0. Seed once when act becomes Ingress (aircraft clears pad radius) |
| Path gates | Already sim-authored; presentation must be **legible** at Depart (opacity / visual half), not UFO-wide |
| Tip copy | Keep “DEPART CAMP EMBER · FOLLOW THE PATH” |
| Crew-chain QA | Harness lifts clear of the pad before Tab→F; no fake spawn fight |

## Non-goals

- Full DCS pad procedures / startup checklist
- Replacing soft gates with a hard rail
- Changing Iron Bell win/lose thresholds

## 2026-08-11 launchpad geometry correction

- The simulation and browser analytical samplers level the inner 58 m Camp Ember apron at the
  202 m departure datum, blending back to authored terrain by 110 m.
- The rendered basin adds eleven Camp-local axes at every quality tier. This is required because
  the ordinary 105–174 m cells otherwise span the whole pad and pull river-trench height through
  the PSP even when the analytical surface is flat.
- Firebase boxes use authored centre heights. The previous base-anchor transform floated berms,
  tents, tower and mast by half their height. PSP sheets are terrain-seated and the authored open
  gate is rotated onto the due-east first route leg.

Deferred authority seam: browser terrain shaping uses world `terrain.ribbons`, while C# still
carves its navigation routes. Their base fields can differ by tens of metres outside the exact
inner apron and through its blend ring. A follow-up must unify those carve inputs and add dense
cross-language ring samples; this launchpad correction must not be cited as whole-canyon terrain
parity.
