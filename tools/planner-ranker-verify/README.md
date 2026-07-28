# Planner ranker verifier

This tooling-only executable loads a trainer-produced integer model through the
same `PlannerIntegerRanker` used by the simulation, verifies the pinned dataset
and model hashes/contracts, and replays every eligible teacher row. It reports
held-out-independent aggregate agreement plus a deterministic rolling hash of
the exact integer logits and selections.

```sh
dotnet run --project tools/planner-ranker-verify -- \
  planner-ranker.json planner-teacher.jsonl
```

Add `--benchmark-iterations 1000000` to time only the warmed-up integer
ranker. The benchmark reuses one validated, eligible dataset row and reports
nanoseconds per evaluation plus bytes allocated on the current thread. It is a
local diagnostic rather than a cross-machine performance promise.
