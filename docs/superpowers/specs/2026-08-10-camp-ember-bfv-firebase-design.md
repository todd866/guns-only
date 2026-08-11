# Camp Ember BF:V firebase (Build 303)

Updated: 2026-08-10

## Intent

Camp Ember must read as a Battlefield Vietnam–density firebase from the AH-1G
rear seat — not a green control disc and not a stack of same-color AABBs.

## Non-goals

- No GLB import / new asset pipeline this build
- No new sim collision unless skid sit regresses
- No canopy back into the pad eye (Build 302 clear-eye rule stays)

## Product rules

### Kill placeholders

1. Ground-war presentation must **not** draw the translucent control cylinder /
   flag beam at the Camp Ember FOB site. Control truth stays in HUD/sim.
2. Landmark `forward-operating-base` must not render as one-material box stacks.

### Authored firebase composer

Dedicated presentation for Camp Ember (`forward-operating-base`):

- Dual PSP helicopter pads (ribbed plate read, laterite/steel tone)
- Sandbag berm ring with gorge-side approach opening
- Revetted ammo / fuel cluster
- 4–6 GP tents / hooches
- Watchtower + thin radio mast (offset from eye)
- Crate / barrel clutter along berms
- Palette: olive drab, sandbag tan, PSP grey-steel, laterite dirt — never control-green

### Constraints

- Presentation-only meshes
- Mast/tower offset so cold-open nose is not a neon beam
- Keep ~120 m jungle/mist clear eye from Build 302

## Success

Owner cold-opens `/cobra-lab/`: skids on a readable Vietnam firebase, not a green
disc or debug boxes.

## Launch-surface repair (2026-08-11)

The first clipping fix flattened analytical terrain but then fed that already-flat field through
the render mesh's 0.42-cell neighbourhood minimum. Coarse mobile triangles consequently fell as
much as 25.291 m below the 202 m contact apron inside the nominal 58 m level radius.

The rendering contract is now:

1. sample the pre-apron analytical field for the conservative neighbourhood minimum;
2. apply the shared 58 m flat apron / 58–110 m blend as the final operation;
3. refine Camp-local axes sufficiently that the complete 58 m rendered apron remains within
   -0.300/+0.050 m of contact height at every tier;
4. keep the full local `x=-8..8`, `z=-10..26`, `y=0.025..5.5` spawn/eye/skid/departure volume free
   of elevated scenery. Thin PSP and laterite surfaces may exist only below its lower plane.

Camp Ember uses one merged draw with individually ribbed PSP, low modular trapezoid revetments,
pitched canvas tents/hooches, separated crates and drums, and a legged tower plus offset mast.
Every part uses explicit centre-height semantics (`centreY`); no implicit base/centre `y` remains.
The current 74-part, 992-triangle firebase leaves 6.0 m minimum horizontal clearance from the
safety volume and remains inside all tier budgets.
