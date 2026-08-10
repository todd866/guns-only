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
