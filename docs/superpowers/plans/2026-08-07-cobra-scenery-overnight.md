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

- [ ] Pass 2: Camp Ember pad dressing (jungle/mist around landmark approach) if a set-piece exists or via ambient bounds near FOB
- [ ] Pass 2: Karst + Split Tooth mist/riffle density without blowing instance caps
- [ ] Pass 3: Soften rock scatter silhouette; bank waterAccent quota bump on gorge route
- [ ] Pass 3: Sky horizon warm-up / hazeBandBlend fine-tune after silent screenshot
- [ ] Pass 4: Silent browser stills at Camp Ember / mid-gorge / Iron Bell (`?audioQa=silent`) and adjust from evidence
- [ ] Stamp Build 276+ when a coherent pass lands; keep STATUS next-candidate in sync
- [ ] Do not deploy without owner OK

## Stop conditions

- Triangle/instance budget red that cannot be paid by shedding elsewhere
- Contended claims on presentation/asset kit from another agent
- Owner says stop
