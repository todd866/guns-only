# ADR-0001: F-22–first arcade + roguelite opening

Status: Accepted — 2026-07-22

Supersedes the "Korea 1950s historical-fidelity-first" ordering implied by earlier documents
(README "current slice", `platform-architecture.md` pack ordering and migration sequence, and
`content-governance.md` constitutional decision #1). Those documents describe the eventual
historical product, not the current build.

## Context

Guns Only shipped through Build 55 as a mechanically-honest close-range air-combat sim whose
documented spine was a two-era Korean campaign, historical 1950s side first: an F-86 / Sabre-class
energy fight, moving-carrier recovery, and maintenance test flying.

Playtesting the F-86 opener showed it underperforms as a *first* experience — the reduced-order
Sabre is too sluggish and unrewarding for a first-touch player who has no context yet for why an
energy fight is satisfying. The historical-fidelity framing also front-loads cost (a governed
campaign, georeferenced terrain, maintenance procedures) before the core loop has proven it hooks
anyone.

## Decision

1. **Open with the F-22.** The first-touch airframe is the `F22APublicDataSurrogate` already in the
   kernel, not the Sabre. It gives immediate authority and a legible power fantasy.
2. **Arcade-y + roguelite up front.** The opening is a fast, repeatable, run-based experience, not a
   fidelity showcase. Build 55 already ships the linear performance-gated "Raptor program"; the
   run-based *roguelite* structure (seeded run variety, a death/retry economy, and at least one
   build/loadout choice) is the next build target — see **Open questions**.
3. **Defer the historical / two-era content, do not delete it.** The 1950s campaign, the governed
   dossier braid, and the georeferenced Korea terrain become depth for repeat players, scheduled
   after the F-22 loop demonstrably retains players.

## Consequences

**Kept** (serves both the arcade opener and the eventual depth):
- the deterministic float64 / 120 Hz kernel — an ideal reproducible-run substrate for a roguelite;
- honest time-of-flight ballistics and reactive AI with explicit perception limits;
- the F-22 handling prototype, telemetry/debrief infrastructure, and browser-performance work.

**Deferred** (frozen, not removed, until the F-22 run retains players):
- the historical campaign-governance engine and dossier braid;
- further georeferenced-Korea-atlas work;
- the sensor-belief architecture beyond the minimum needed for fair AI perception;
- further F-35C / carrier-conversion polish.

**Honesty vs. arcade.** "Honest" now means *transparent, consistent rules* — real physics,
reproducible seeds, non-omniscient AI — with a **disclosed arcade layer** permitted above it (aim and
threat cues, forgiving assists, transparent fictional modifiers). Never silently falsified F-22
behavior. Evidence-based debrief governs designated simulation sorties; arcade runs are graded on
outcome, style, survival, and improvement.

## The falsifiable-fun gate (before funding more content)

Do not fund further campaign architecture until *"a first-touch player finds F-22 guns-only fun in
their first minute"* is validated with real newcomers. A guns-only merge removes much of the F-22's
real-world fantasy (stealth, sensors, BVR weapons), so the opener must earn its fun through controls,
awareness, aiming, and pacing — not the airframe badge. If newcomer testing shows those are the
failure mode, fix them rather than swapping aircraft again.

## Open questions (need a design pass, not just documentation)

- The concrete roguelite loop: seed → escalating stages → death/reset → one build choice. The kernel
  already accepts seeds (`DifficultyModel.WeatherSeed` / `TurbulenceSeed`) and the progression
  profile already persists to localStorage, so the substrate exists.
- Where the honesty layer ends and the arcade layer begins, per surface (HUD cues, assists, grading).
- Progression-state authority once anything (a leaderboard, rewards) attaches to the persisted
  profile — today it is trusted client localStorage.
