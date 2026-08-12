# Build 313: Camp Ember becomes a real firebase — design

Owner directives driving this build: "you should get some photos of actual Vietnam War
FOBs and recreate that" + "arguably it should be a FOB with a few Cobras on the ramp, and
if you're damaged bad enough you just swap birds" + "ok, lets get it built". Resequences
the fights-back spec: Build C (FOB loop) lands BEFORE Build B (threat) because crashes and
gear damage (Build 312) already give the swap loop real triggers, and the visual rebuild
and the ramp birds are one authoring effort.

Reference contract: docs/art-direction/vietnam-fob-battlefield-reference.md — deltas 1-6.
House style stays illustrative (TF2 doctrine): structure, massing, palette — not photorealism.

## Scope

### 1. The scar is the base (terrain + surface)
- Irregular laterite apron replacing the neat rectangular pads: an authored blob boundary
  (Granite's read) with the ragged edge meeting jungle. The flatten/blend-last apron
  machinery from Build 311 already supports the contact surface; the visual delta is the
  surface material region: laterite color + track wear + burn patches inside the scar.
- Defoliated fringe: a ring of thinned/dead trees between the scar edge and dense canopy.
- KERNEL CONSTRAINT: the 58 m contact apron and spawn safety volume are UNCHANGED — the
  scar is presentation-region work around the existing authority surface, mirroring only
  if any contact-relevant boundary moves (then the C# mirror moves with it, golden-pinned).

### 2. The firebase reads from the air (parts authoring, extends the 74-part set)
- Berm ring with an inner ring road; revetments and bunker mounds hug the berm's inner
  face (Sedgwick). Departure mouth stays open (existing CAMP_EMBER_DEPARTURE_YAW_RAD).
- Two mortar-scale sandbag rosettes (circular pit + radiating lobes).
- Track spaghetti: narrow faint laterite ribbons looping between pads/berm/gates, reusing
  the road-ribbon system.
- Bunkers become low mounds: sandbag sides, glinting PSP roofs (A Shau read).
- All new parts respect CAMP_EMBER_SPAWN_SAFETY_VOLUME (test-enforced, existing).

### 3. Cobras on the ramp + bird swap (mission runtime)
- Three AH-1G airframes: the player's plus two spares parked in berm-side revetments
  (ah1g_presence model, static pose, outside the safety volume).
- Landing on the pad with gear damage or subsystem damage (Build 314 adds more sources)
  offers SWAP: instant transfer to a healthy airframe; the damaged bird stays parked,
  visibly marked (tilted skid/smoke-smudge decal is enough at this bar).
- Pool consequence: all three crashed/crippled → FOB combat-ineffective terminal state
  with its own cause card. Flyability threshold for "crippled": any latched failure cause
  or gear damage (this build's definition; Build 314 may refine).
- Rearm (existing) and swap share the pad-contact detection.

### 4. Acceptance
- Deterministic: swap transfers control (position/attitude/state of the spare), damaged
  bird persists; pool-exhausted terminal fires; parts stay outside the safety volume;
  determinism preserved.
- Visual (doctrine): rendered aerial + spawn frames read against Sedgwick/Granite —
  scar-not-rectangle, berm ring, rosettes, tracks, parked Cobras. Owner flight is final.
- Perf: parts stay within the single-draw merged-geometry budget pattern; frame-time
  neutral on the balanced tier.

## Out of scope
Threat/AA (Build 314), corridor-wide battlefield (crater sticks, defoliation swathes —
corridor slice), artillery gameplay for the rosettes (set dressing only), timed repair.
