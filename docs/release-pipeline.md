# Shipping a release

Two ships on 2026-08-05/06 (Builds 264 and 265) each spent roughly 75 minutes inside gates, and
almost none of it bought new information. This document records the pipeline that replaced it,
and — more importantly — exactly what is now trusted, from where, and why that is not a downgrade.

## The ritual

```sh
# 1. Prepare a deploy worktree. Hydrates the ~812 MiB of gitignored payload plus .vercel/,
#    and refuses to touch a single tracked file while doing it.
bin/worktree-prep .worktrees/prod-deploy-NNN main

# 2. Ship. Preflight answers in seconds; there is no local re-gate.
cd .worktrees/prod-deploy-NNN && bin/deploy-web --prod
```

`bin/worktree-prep` takes any trailing `git worktree add` arguments (`-b`, `--detach`, a ref) when
the path does not exist yet, and re-hydrates in place when it does.

## Preflight: everything cheap, first, together

`bin/deploy-web` decides every precondition that does not require a build *before it builds
anything*, and reports the whole list at once instead of one failure per cycle:

| check | fails when |
| --- | --- |
| toolchain | `vercel`, `curl`, `node` (24), `python3`, `rsync`, `gh` missing |
| clean tree | anything uncommitted — production provenance must name an exact commit |
| `.vercel/project.json` | the worktree was never linked / hydrated |
| payload hydration | either terrain-atlas `pages/` tree is absent or empty |
| terrain atlas | manifest/page hashes and browser budgets fail `verify_korea_atlas.py` |
| branch | HEAD is not local `main` |
| origin | `origin` is not canonical `todd866/guns-only` |
| exact remote SHA | HEAD ≠ pushed `origin/main` |
| protection | `main` is unprotected, or does not require both Verify contexts strictly |
| release provenance | no acceptable green canonical Verify run for this exact tree |
| freshness | that run is older than 72 h (`GUNS_DEPLOY_MAX_VERIFY_AGE_HOURS`) |

A failing preflight costs ~9 seconds and prints a numbered list. Nothing is built, nothing is
uploaded, and no Vercel alias is touched.

## What is trusted from CI, and why it is not a downgrade

The old script ran the **entire** `bin/check` locally *after* confirming the exact SHA already had
a green canonical Verify run — ~25-30 minutes to re-derive a result it had just finished proving.

`.github/workflows/verify.yml` runs, on protected `main`, for that exact SHA:

* **Deterministic, content, and unit contracts** — `./bin/check` with `GUNS_SKIP_SMOKE=1`
  (every Node/Python/.NET suite, the staged-vs-`wwwroot` content diff, the publish-artifact
  assertions, the release-identity stamp check).
* **Published browser and HUD smoke** — `web/smoke/smoke.test.mjs` against a real published
  artifact in headless Chromium/WebKit, plus the HUD geometry assertions.

Together that is the whole of `bin/check`. The local tree is asserted identical to that SHA
(clean worktree, HEAD == pushed `origin/main`), and re-asserted after publish, before promotion,
and again before rollback identity is pinned. So the local gate was re-running the same function
over the same input.

**What CI does not cover, and is therefore still checked locally:** the gitignored terrain atlas.
CI hydrates it from production; this machine's copy is separate data. It is hash-verified against
the tracked manifest in preflight, re-verified after being staged into the publish tree, and its
digest is compared again on the deployed candidate and on the promoted public origin.

**Nothing after promotion changed.** Candidate route smokes, atlas/content digest identity,
build-info revision match, control-plane/public deployment agreement, the rollback baseline pin,
the live route smokes, and automatic rollback on failure all run exactly as before.

`GUNS_DEPLOY_FULL_GATE=1 bin/deploy-web --prod` restores the local re-gate for the paranoid case
(a toolchain change, or a suspicion that CI and this machine disagree).

## The merge-commit problem

`gh pr merge --merge` lands a **new** commit. Verify ran on the PR head; the merge commit that
becomes `main` has no run of its own, so preflight correctly refused, and the ship waited a second
full CI cycle. That happened on both 264 and 265.

Preflight now accepts, in order of preference:

1. **A push/dispatch Verify run on `main` for the exact deployed SHA.** Unchanged, always preferred.
2. **A merge-queue run for the exact landed commit** (if the merge queue is ever enabled).
3. **A fast-forward-equivalent merge**, which requires all of:
   * the deployed commit is an ordinary two-parent merge (octopus merges are refused);
   * one parent's tree is byte-identical to the merge commit's tree — the merge added nothing;
   * the other parent (the old `main` tip) is an ancestor of that parent — no divergence;
   * GitHub attests the link: a pull request from the canonical repository, based on `main`,
     with that head, whose recorded `merge_commit_sha` is the deployed commit;
   * `main` forbids force pushes and deletions;
   * the borrowed run is a green canonical Verify run for that head, inside the freshness window.

Why (3) is sound. `actions/checkout` on a `pull_request` event builds `refs/pull/N/merge`, i.e.
merge(B, V) where B was `main`'s tip when the run started. Because `main` forbids force pushes and
deletions it only ever moves forward, so B is an ancestor of the current tip — which is either the
verified head V or the old main tip, and the old main tip is required to be an ancestor of V. So B
is an ancestor of V, merge(B, V) has V's tree, and V's tree is the deployed tree. CI tested the
bytes being shipped.

A bare `pull_request` run is still **not** release provenance on its own: it is only usable as
part of that chain, and the chain is unit-tested against every way it can be broken.

## Wall clock

| stage | before | after |
| --- | --- | --- |
| local `bin/check` on the branch | 25-30 min | unchanged (developer's own loop) |
| CI Verify on the PR head | ~12 min | ~12 min |
| second CI Verify on the merge commit | ~12 min | **0** (fast-forward-equivalent) |
| local re-gate inside `bin/deploy-web` | 25-30 min | **0** (CI is the provenance) |
| build, upload, verify, promote, live smokes | ~8 min | ~8 min |
