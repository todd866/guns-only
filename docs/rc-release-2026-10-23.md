# RC production release checkpoint — 2026-10-23

## Local continuation, 23 October 2026

The resumed local chat recovered the owner's explicit deployment request from **Expand RC Open World**. Normal authenticated CLI inspection now verifies `ian-todds-projects/guns-only-rc` (`prj_xlcRr8jlZrfPzOasUWDrlCYp5Fep`). No elevation was requested and the earlier connector/approval denials were not retried.

Before release, actual Apple M5 screenshots exposed two concrete defects missed by the earlier acceptance: overlapping gate labels and overlapping BX checkerboard rows. Removed the redundant gate label, placed the location marker beside the welcome sign, fixed the checker bounds in the Blender source, and rebuilt the BX GLB and editable `.blend` with the normal AO bake. `art-overlap.test.mjs` failed on the old exported checkerboard (two surfaces at one sample) and passes the rebuilt asset (one surface at all 34 samples).

The release pipeline now requires default-hub startup, real driving, the packaged/live hardware guide checks, and SHA-256 equality for every public RC file. It preserves Vercel's exit failure, reads URLs from stdout, uses an ephemeral local smoke port, and retains timestamped evidence. Unversioned assets revalidate on reload to avoid combining old world data/art with new code.

Fresh evidence:

- `repaired-hardware/release.json`: Apple M5, zero browser errors, open world, map, standalone/connected BX guidance, difficulty rules and Furball. Actual viewport screenshots include laptop, portrait and landscape phone.
- `viewport-resume/report.json`: all 12 reusable viewport-helper checks passed (menu/map/garage at 1280×720, 390×844, 667×375 and 640×360). The last is a reflow check equivalent in CSS size to 200% zoom on the laptop, not a physical assistive-technology session.
- `resume-tests.txt`: 198 passing top-level RC/tool tests. The release gate additionally discovers the nested world tests and runs the new release-tool tests; its final logs are authoritative for the complete suite.

Current release state: **prepared; production deployment not attempted yet in this continuation**. The earlier checkpoint below is historical and records why the previous session stopped.

---

The owner explicitly requested deployment of the current RC version. **Not deployed:** this session could not reach the production deployment step.

## Candidate

- Target: `guns-only-rc`, team `ian-todds-projects`, production. The existing main-site `/rc/` rewrite points to this project.
- Package: `.rc-release-dist/`, 32.4 MiB. `evidence/rc-open-world/release-manifest.json` records every public file's SHA256, source HEAD `50b805269acd0449c532416236e8975f241423f2`, and the fact that this is a shared working-tree release.
- Carries the previous agents' complete open-world candidate. Only `rc/main.js` and `rc/open-world/runtime.js` differ from the prior review package.
- Restores racing guidance during Free Drive in standalone districts, including BX. The connected world also shows each district's authored line while the player is inside its bounds. Free Drive retains guidance in both difficulties; Big Kid races and Furball retain their previous rules.

## Verification

- All 212 tests across 47 test files passed: `evidence/rc-open-world/release-tests.txt`.
- Targeted Node DOM/real geometry checks passed for standalone BX and connected BX. Both difficulty settings retain the guide; keyboard movement measured 13.9 m and 12.6 m. Evidence: `release-bx-runtime.jsonl` and `release-connected-bx-runtime.jsonl`. These use a no-op GPU and are **not visual acceptance**.
- Corrected the older Node harness to dispatch bubbling keyboard input from the focused canvas and represent the newly added environment-map lifecycle.
- `git diff --check` and syntax checks passed.
- Previous candidate hardware screenshots/performance evidence remain under `evidence/rc-open-world/`, as documented in `rc-open-world-continuation.md`. They predate this guidance change.
- New silent hardware release harness: `tools/rc/check-release.cjs`. It covers default open world, map, standalone/connected BX guidance and driving, difficulty rules, Furball, phone layout, renderer identity and browser errors. Its launch in this session aborted with SIGABRT/EPERM before rendering; it has not passed yet.

## Access blockers

- Vercel connector `get_project`: HTTP 403, connection lacks access to `ian-todds-projects` (`team_BpXZ1f5uALRBRZFS1zbn97pJ`). The error requests team authorization, but the named authorization tool is not exposed in this session.
- Scoped CLI `vercel --scope ian-todds-projects project inspect guns-only-rc`: network fetch failed in the restricted execution environment.
- The request for elevated CLI access was automatically rejected because sandbox approval is disabled. No credential extraction, alternate-scope deployment, foreground browser, or access-policy workaround was attempted.

## Resume with authorized access

Run the fresh hardware gate against this package, then the established RC deployment pipeline. User deployment authorization is already present; do not ask again merely because AGENTS.md ordinarily requires owner confirmation.

```sh
cd /Users/iantodd/Projects/guns-only
RC_QA_ROOT=.rc-release-dist heavy-slot -- node tools/rc/check-release.cjs evidence/rc-open-world/release-hardware
bin/deploy-rc
heavy-slot -- node tools/rc/check-release.cjs evidence/rc-open-world/release-live https://guns-only-rc.vercel.app
```

All browser checks are headless and use `audioQa=silent`; browsers close in `finally`. Recheck the package hashes and working-tree changes before shipping if work has continued since this checkpoint.
