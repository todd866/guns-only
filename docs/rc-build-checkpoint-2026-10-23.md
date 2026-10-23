# Saucer Springs build checkpoint — 23 October 2026

Working tree: `/Users/iantodd/Projects/guns-only`. Production now runs code revision `c4e46f55` (implementation `d1caf0f6`, battle recovery `969ffaaf`). Published and verified 23 October 2026.

Owner direction: freely driveable Saucer Springs AFB, MK64 as the gameplay and UX reference, four cups progressing through Home Base, Flightline, Dreamland and Beyond the Portal. Robot MP initially; alien marshal only after discovering `lab`. Fifteen specimens independently unlock Dreamland events and portal entry. Remove superfluous driving HUD text; add substantially more minimap detail.

Released build includes three-lap circuits, eight racers, four-course cup scoring, four battle arenas, Wavepool Beach, expansion venues, alien-world roads and three courses plus relocated Night Wave, two-way portal, persisted marshal reveal, separate three-lap records, simpler HUD, and detailed minimap. Existing events remain available in the shared world. Course chooser and world map preserve discovery locks.

Evidence so far:
- Real full-course three-lap acceptance passed after Gravity Garden geometry correction (`/tmp/rc-course-acceptance-wavepool.log`).
- Latest full game run: 159/161; the two remaining failures were stale test bounds following the approved relocation/new portal location. Both corrected and focused checks pass. Full release gate must rerun.
- Tools tests: 85/85 (`/tmp/rc-tool-tests-final.log`).
- Headless Apple M5 screenshots: `evidence/rc-open-world/concept-build/`.
- Five viewport menu probes and eight-car/four-course cup-start flow pass (`/tmp/rc-ui-cup-probe.log`).
- Portal round-trip browser harness under correction: proximity threshold missed the actual teleport, and its continuity assertion initially rejected intentional portal travel. Game state is never mutated for these driving checks; only progress is seeded and normal controller input is injected.
- Independent refuter reviewed records, progression, cup scoring and map cache. Discovery bypass, finale records and palette-cache key corrected. Cursor review also identified kid-pack lap denominator and stale marshal state; both corrected.

Publication verified complete:
- Canonical URL: https://guns-only.com/rc/ (HTTP 200).
- Production alias: https://guns-only-rc.vercel.app.
- Deployment: https://guns-only-blqtc7iyi-ian-todds-projects.vercel.app.
- Full final release gate: 162 game tests + 85 tooling tests passed.
- All 511 public files match the local release package.
- Packaged and live hardware smoke passed on Apple M5 Metal, including phone viewport checks.
- Real controller base → alien → base passed live in one document, no console errors, zero rescues, saved progress retained: `evidence/rc-open-world/portal-trip-live-alias/portal-trip.json`.
- Release evidence: `evidence/rc-open-world/deploy-20261023T025421Z/`; log `/tmp/rc-deploy-cups-final.log`.
- All QA was silent and headless. No visible browser windows taken over. Browser cleanup completed. No Git push performed.
- No active implementation workers or deployment process remain. Generated evidence and prior temporary build folders remain untracked; preserved rather than sweeping unrelated work.


Known scope limits to keep honest: authored art is functional low-poly game geometry, not the full polish of the approved concept sheet. Marshal recovery currently signals the physics recovery rather than animating a complete carry flight. Course-specific art and mechanical depth still require continued refinement against the design atlas; do not describe every design-ledger item as complete solely because courses finish.

## Follow-up: open-world-first entry (23 October, afternoon)

User corrections: no startup choice screen; Saucer Springs is the immediately driveable starting point. Remove Area 51½ and Liberty Loop naming, keep aliens a much later discovery, reduce HUD/menu text, improve housing course presentation.

Draft now auto-starts after assets are ready. Legacy base/housing/BX/school links enter the connected world; failed world loads expose Retry rather than a tiny prototype. Pause retains optional course/garage/map shortcuts. Public collectibles are ordinary badges. Lab requires 15 badges and the eight Home Base/Flightline races; alien world additionally requires Dreamland completion. Secret map entries, marshal transformation and portal visuals respect those gates. Exploration minimap shows surrounding roads instead of the selected small race ribbon. Housing is renamed Base Housing, with tighter corners, kerb markings and regenerated ambient-occlusion shading.

Root website stale-cache cause is addressed separately in PR #133 (Build 397), based on protected remote main, without moving this RC checkout. Worktree: `.worktrees/rc-cache-release`; clean main deployment clone: `/Users/iantodd/Projects/guns-only-rc-cache-release`. Root service worker must activate normally before existing controlled tabs use its bypass. Dedicated RC origin bypasses that worker.

Review decisions: corrected refuter's alien-event gate bypass via event-aware admission. Public location deep links remain intentionally allowed, preserving old bookmarks and access to the ordinary base; discovery controls pause-menu shortcuts, not access to public terrain. Cursor independently approved the root cache exclusion, noting existing controlled tabs retain old-worker behavior until normal activation. Do not force the owner's browser or global worker activation.

Validation in progress; not yet published. Prior 163-game-test run passed; subsequent portal visibility test and no-menu-start browser tests still require final packaged release run. Do not repackage a directory while a browser test is reading it (one attempted test was invalidated by temporary missing files during replacement).
