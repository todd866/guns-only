# Overnight Cobra corridor scenery backlog

Working branch: `fix/ember-run-pass2` (Build 275+)
Scope: corridor + set-pieces only. Stay inside `COBRA_CANYON_RENDER_BUDGETS`.
Always dual-sync `content/.../cobra-canyon.world.json` ↔ `web/wwwroot/content/...`.

## Done — pass 1 (2026-08-07 evening)

- [x] Denser humid fog + warmer haze colour; thicker cloud shelf; stronger cloud shadows
- [x] Greener valley/jungle albedo bands
- [x] Quieter river specular; wider bank window
- [x] Taller/softer mist cards; plantation soft normals
- [x] Ambient river mist on balanced tier; Long Fang understory

## Next ticks

- [x] Pass 2: Camp Ember pad set-piece (jungle/mist/rock) + riparian bounds include FOB
- [x] Pass 2: Karst understory + Split Tooth mist/rock
- [x] Pass 2/3 early: Soften rock scatter + waterAccent quota bump
- [x] Pass 3: Thicker monsoon cloud shelf + horizon shoulder; river mist on balanced; exposure 1.12 from dark stills
- [x] Pass 4: Silent stills captured under /tmp/guns-only-scenery-overnight/stills (dismiss onboarding first); park() still shows Camp Ember mission strip — next tick harden parked camera vs vehicle eye
- [x] Stamp Build 278 for overnight pass 3; STATUS next-candidate in sync
- [x] Pass 5: Parked camera skips vehicle eye + clears HUD; radio mast jungle/mist; soft village normals
- [x] Stamp Build 279 for overnight pass 5; STATUS next-candidate in sync
- [ ] Do not deploy without owner OK

## Stop conditions

- Triangle/instance budget red that cannot be paid by shedding elsewhere
- Contended claims on presentation/asset kit from another agent
- Owner says stop
