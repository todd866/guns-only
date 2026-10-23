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
