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
- [x] Pass 6: Mill village + plantation waterworks mist/jungle; fix setFirstPerson park contract
- [x] Stamp Build 280 for overnight pass 6; STATUS next-candidate in sync
- [x] Pass 7: Red Earth quarry + White Pagoda mist; hotter laterite/rim rock bands
- [x] Stamp Build 281 for overnight pass 7; STATUS next-candidate in sync
- [x] Pass 8: Quieter river fresnel/specular; mist 0.38 / waterAccent 0.20; cloudShadow 0.58; bankWidth 12 m
- [x] Stamp Build 282 for overnight pass 8; STATUS next-candidate in sync (silent stills deferred — preview publish stalled)
- [x] Pass 9: Haze density/blend for layered ridgelines; greener jungleMid; plantation waterworks understory (dual-sync world.json)
- [x] Stamp Build 283 for overnight pass 9; STATUS next-candidate in sync
- [x] Pass 10: Taller/wider mist cards; jungle canopy at Camp Ember + Iron Bell; greener valleyFloor; humid hemisphere fill
- [x] Stamp Build 284 for overnight pass 10; STATUS next-candidate in sync
- [x] Pass 11: Jungle canopy at Long Fang + Karst; thicker monsoon cloud shelf/shoulder; more bank waterAccent
- [x] Stamp Build 285 for overnight pass 11; STATUS next-candidate in sync
- [x] Pass 12: Canopy at Split Tooth + White Pagoda; ambient river-mist bump; greener ridgeSage
- [x] Stamp Build 286 for overnight pass 12; STATUS next-candidate in sync
- [x] Pass 13: Canopy at Radio Mast + Mill Stack; mist opacity 0.42; deeper river + bankWidth 13; cloudShadow 0.62
- [x] Stamp Build 287 for overnight pass 13; STATUS next-candidate in sync
- [x] Pass 14: Canopy on plantation waterworks + Red Earth quarry (all 10 set-pieces); taller mist; hazeBandBlend 0.78; cooler/wetter cultivation
- [x] Stamp Build 288 for overnight pass 14; STATUS next-candidate in sync
- [x] Pass 15: Ambient density bump (riparian/bamboo/west canopy/mist); reliefGain 4.75; greener hemisphere bounce; brighter bank sheens
- [x] Stamp Build 289 for overnight pass 15; STATUS next-candidate in sync
- [x] Pass 16: Fill mobile/balanced ambient caps; soften gorge occlusion 0.76; tighter paddy parcels; exposure 1.14
- [x] Stamp Build 290 for overnight pass 16; STATUS next-candidate in sync
- [x] Pass 17: Soft-shade landmarks + Iron Bell deck/piers; cooler karst/ridge/waterfall/FOB landmark tints (ambient caps full — quality axis)
- [x] Stamp Build 291 for overnight pass 17; STATUS next-candidate in sync
- [x] Pass 18: Readable hostile silhouettes — hotter red, role-distinct truck/gun/infantry meshes, haze emissive (Ember Run Task 5)
- [x] Stamp Build 292 for overnight pass 18; STATUS next-candidate in sync
- [x] Pass 19: denser humid haze + greener valley/jungle bands + deeper river (owner scenery still-sucks)
- [x] Pass 20: emptiness look-gate harness; palm-clump jungle (budget-safe); hard scrub islands on basin; park stills force desktop ambient; landmark-correct park poses — gate PASS
- [ ] Do not deploy without owner OK

## Stop conditions

- Triangle/instance budget red that cannot be paid by shedding elsewhere
- Contended claims on presentation/asset kit from another agent
- Owner says stop
