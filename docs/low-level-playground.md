# The low-level playground: valleys worth flying, obstacles that kill

*2026-07-23. Pilot direction: "My favourite activity is low flying through valleys… let's get
some better valleys for low flying… ideally some big bridges and power lines to fly under
that'll kill me if I hit them."*

## Terrain: carved valleys

The current procedural Korea surface is rolling-hill terrain — flyable, not thrilling. The next
terrain build carves a deterministic river-valley network into the authoritative heightfield
(KoreaTerrainTruth + the bilinear grid the kernel samples): drainage-following channels with
steep (40–60°) walls, 300–800 m floor widths, connected junctions, and at least one long
(>15 km) marquee run. Constraints: the SAME surface feeds collision truth, GCAS, the bandit's
floor sense, and the renderer (one grid, no visual-only geometry); determinism (seeded carve,
bit-identical); goldens updated as a labelled terrain-version change.

## Obstacles: bridges and power lines

A new obstacle class in the environment truth: line/segment obstacles (catenary spans between
pylons; box-girder bridge decks between banks) that are (a) lethal on contact via the same
DetectImpact path that owns terrain/water strikes (a distinct ImpactSurface kind so the debrief
can say "wires"), (b) fly-UNDER-able — the challenge is the gap, (c) visible from tactically
useful range (pylon silhouettes, marker spheres on the wires per real-world practice), and
(d) known to Auto-GCAS as sweep geometry — with the stable-path 20 ft floor applying, so a
deliberate steady run under a bridge is legal and a sloppy one is not. Placement is authored
per-valley (a content-pack list of spans), not procedural scatter.

## Order

1. Valley carve + goldens + bandit/GCAS verification over the new surface (Codex candidate,
   worktree, corridor tests must stay green over carved terrain).
2. Obstacle truth + collision + renderer + two authored spans in the marquee valley.
3. Debrief hooks: lowest stable pass, wire strikes, time-in-valley — the low-flying scorecard.
