# Working in this repo alongside other agents

## Browser QA stays in the background

The owner requested this on 2026-09-10 after test windows repeatedly stole focus.
Use headless browsers for automated tests and screenshots. Hardware WebGL checks
should use full Chromium headless (`headless: true`, `channel: "chromium"`) and
verify the reported GPU. Do not fall back to visible windows or foreground an app
without an explicit request for visible QA. Keep software rendering labeled and
separate from hardware performance evidence. Close browsers and servers in `finally`.

Several agents work in this checkout at once, often all told "push towards production". Every
rule below is here because it cost someone real time, mostly on 2026-07-31. None of it is
generic advice.

## 1. HEAD moves under you. Re-baseline before you blame yourself.

An agent measured a clean baseline, worked for an hour, found seven failing tests and reported
them as its own. HEAD had advanced **twice** in the meantime; three of those failures belonged to
another agent's in-flight engine rewrite. It then spent four more rounds stashing and building
worktrees to sort out which were which.

**Use `bin/whose-red`.** It answers "what breaks *because of my paths*, holding everyone else's
work — committed and uncommitted — exactly as it is":

```sh
bin/whose-red sim/Doctrine/Beats.cs -- "FullyQualifiedName~Carrier"
```

It never touches the shared working tree. A red suite is not evidence that you broke it.

## 2. Never `git add -A`. Ever.

One agent's `git add -A` swept another agent's *uncommitted, mid-edit* work into its commit —
see `d755413`, whose message honestly admits it is recording "a parallel session's F9F-2
sourcing". The other agent had not finished, had not tested, and had not chosen to commit.

Stage explicit paths, always. `git commit <path>` or `git add <path>`.

## 3. Say what you are in, before you are in it.

```sh
bin/claim take sim/Doctrine/Beats.cs --as korea-panther --why "split recovery fixture"
bin/claim check sim/SimulationSession.cs     # before editing; exits 1 if someone else holds it
bin/claim list
bin/claim release --as korea-panther
```

Claims are **advisory** — nothing stops you editing a held file, but if you do it anyway you own
the merge. They are a directory of plain files on purpose: Claude, Codex, Cursor and a human in an
editor can all read them with `ls` and `cat`, and a crashed agent leaves a visible stale claim
rather than a lock nobody can explain. Clear stale ones with `bin/claim release <path>`.

`git status --porcelain` also shows every agent's uncommitted work, not just yours — use it as the
second check. If a file you want is already modified, you are about to collide. And prefer to
**add a new file** over editing a contended one; new files have no merge surface.

## 4. Do not repoint shared fixtures. Add your own.

`Beats.CarrierApproach()` is not only the Korea carrier beat: other missions compose it as their
generic recovery fixture. An agent changed its airframe for the Korea beat and silently changed
the **Rapier's** recovery aircraft, breaking three automation tests that had nothing to do with
its task.

Before changing a shared setup, `grep` for who composes it. If two callers want different things,
that is the signal to split the fixture, not to pick a winner.

## 5. Beware constants calibrated to one aircraft.

A shared system tuned against a single aircraft will fight the second aircraft that arrives.
When you find one, say so in the code rather than retuning it for your own airframe.

`SimulationSession.UpdateGoldenPath` used to pass `stabiliseSpeedMps: 90.0` for every airframe —
the Rapier's clean stall speed, worn as a generic recovery constant. That instance is fixed.
The call now passes the flying airframe's own approach speed, `stabiliseSpeedMps: approachMps`
(`sim/SimulationSession.cs:4377`). `approachMps` comes from `PlayerApproachTrueAirspeedMps`
(`sim/SimulationSession.cs:4332`), which uses live mass and that airframe's polar. The historical
90 m/s coupling, and why a clean-stall formula was the wrong replacement, is recorded in
`docs/approach-to-land-golden-path.md`.

## 6. The gate serialises, so expect to queue.

`bin/check` holds `/tmp/guns-only-gate.lock`. Parallel gates starved each other into false
timeouts at load 70-85 on 2026-07-29 (five deploy gates died). One at a time is deliberate. Do not
work around the lock.

## 7. Nobody deploys unilaterally.

A `bin/deploy-web --prod` does not ship "your change". It ships the branch you deploy, including
other agents' committed and half-landed work. The old claim that `main` sat 53 commits ahead of
`origin/main` is stale. On 2026-10-01 this checkout's local `main`
(`8e9d28cddf3e4c61011b6a9e5528beab94d499cb`) was 0 commits ahead of the fetched `origin/main`
(`2eca3c9501dd9df0e658e7159770f58bad36f698`) and 2 behind it. Recount before trusting an
ahead/behind figure. Confirm with the human before pushing or deploying, however green your own
work is.

## 8. Land the epistemics with the number.

Airframe data carries an `epistemic` label (`measured` / `surrogate` / `provisional` / `fiction`)
and airframes keep a sources file (see `docs/airframes/f9f-2-panther/00-sources.md`). When you
change a physical constant, record where it came from and what you rejected. Another agent will
otherwise re-derive it, differently, next week.

## 9. Never hand-copy the gitignored payload into a worktree.

A fresh worktree needs ~812 MiB of gitignored terrain-atlas pages plus `.vercel/`. Twice on
2026-08-05 that was done as a wholesale `cp -R web/wwwroot/content …`, which overwrote the
**tracked** `web/wwwroot/content/packs/cobra-vietnam/environment/cobra-canyon.world.json` and
produced ~20 unrelated-looking test failures from one reverted terrain field. The first one cost a
full gate cycle to diagnose.

```sh
bin/worktree-prep .worktrees/prod-deploy-NNN main   # create + hydrate
bin/worktree-prep .worktrees/prod-deploy-NNN        # re-hydrate in place
```

It copies only paths with nothing tracked under them, and fails loudly if hydration left
`git status --porcelain` non-empty. It takes under a second (APFS clone). See
`docs/release-pipeline.md` for the whole ship ritual and for what production now trusts from CI.
