# V2 validation

Implementation source: `df8fc8808824d100f7150e59f06032df8e5717d0` on `pathfinders/lab`.
The Release assemblies were built from the identical source tree immediately before that
commit. No simulation or pilot files changed during collection. The manifest records both
assembly SHA-256 hashes and the source commit. The later evidence commit changes only evidence
and the spec's acceptance note.

Passed checks:

- **82 xUnit cases:** Pathfinder, Rapier gun-drone, Rapier economy and key grammar. These include
  forward lane spacing, the actual first-arrival ROE classification, blocked/clear/blocked drift,
  manual reattack selection, F/weapon-selector store consumption without firing both weapons,
  a released drone's real swept-projectile gondola kill, denied-versus-escaped accounting,
  direct debrief and contract suppression after a town violation.
- **102 additional xUnit cases:** snapshot projection, binary hot-frame layout and production
  Rapier session contracts. This covers the changed hot/cold state path and shared adapters.
- **51 Node tests:** Pathfinder HUD cue, ENVELOPE tag, fixture geometry, relay mesh sag, scene
  wiring, hot snapshot reconstruction and Q/F input source contracts.
- **17 Python tests:** report aggregation, missing observations, loop-excluded versus raw gaps,
  event timing, drone-source accounting and parseable SVG output.
- **Lab self-test:** deterministic paired replay, physical envelope/gondola contacts, ROE and
  event conservation, no fabricated drone counters, censoring, all beat staging, generic
  controller reference checks and actual runway recovery checks for the existing generic lab.
  This passed again against the frozen binaries used for the 90-run cohort.
- **90 full cohort tapes:** independent audit reconciled rounds, envelope hits, player and drone
  kills, drone releases, ROE violations and tick timestamps. All 90 full sorties finished; six
  crashes are completed losses, not censored observations. Thirteen individual reckless loops
  end with the hunt rather than a reacquisition event.
- `git diff --check` passed before the implementation commit.

The standard VSTest host could not open its local socket in this sandbox, so the same xUnit
assembly was executed through the repository's in-process xUnit runner. Cached packages built
successfully; NuGet vulnerability metadata lookup produced network-unavailable warnings.

The browser check remains **unverified**. Headless Chromium failed at launch under the sandbox
(SIGABRT; its cleanup also reported `kill EPERM`). Local HTTP binding was also denied. A final
file-only headless attempt to render the generated SVG failed before producing screenshots.
No owner browser window was opened or controlled. Node/source checks do not establish laptop
or phone viewport fit, visual legibility, or the complete browser Q/F → bridge → simulation
path. No hardware frame-rate claim is made.

The standing refuter reviewed the diff twice. Its manual-selection, escaped-target and actual
ROE-arrival objections were fixed and tested. It found no additional lifecycle/drone defect in
the final review; it retained the behavioral and browser-validation gaps. A scoped Cursor
second opinion could not run: its capacity preflight returned “cannot verify helper process
identity”. No permission or capacity check was bypassed.

Reproduction uses `~/.dotnet` and the existing lab. In this sandbox the build required a single
MSBuild node and disabled compiler-server reuse:

```sh
~/.dotnet/dotnet build tools/playtest-lab/GunsOnly.PlaytestLab.csproj \
  -c Release --no-restore --nologo -m:1 /nodeReuse:false -p:UseSharedCompilation=false
~/.dotnet/dotnet tools/playtest-lab/bin/Release/net8.0/GunsOnly.PlaytestLab.dll \
  --beat 15 --seeds 30 --max-seconds 360 --out analysis/playtest/2026-10-16-beat15-v2
```

Choose a fresh output directory for another run: the launcher refuses to overwrite evidence.
Expensive jobs were admitted through Ian's existing battery guard. Its state directory alone
was redirected to a writable temporary directory; power was AC. Per-sortie admission remained
enabled via `PLAYTEST_POWER_GUARD`. No push, deployment or stamp was performed.
