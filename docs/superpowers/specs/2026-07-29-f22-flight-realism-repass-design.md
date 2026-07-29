# F-22 flight realism re-pass: public corridors, not M2.5 invention

Status: Design approved in conversation 2026-07-29 · Child of
`docs/f22-performance-audit.md` and `sim.Tests/F22SupersonicPerformanceTests.cs` ·
`F22APublicDataSurrogate` only.

## Thesis

Playtesting raised a suspicion that the F-22 “struggles to make M2.5.” The existing
public-data audit already treats that as expected: USAF language is **Mach two class**,
executable gates require **positive** specific excess power at FL500 / M2.0 full
augmentation and **negative** excess power by FL500 / M2.3, and the FL450 dynamic
augmented run only claims about M1.9–2.15.

This pass is an **honesty re-measure plus small fixes**. If telemetry and physics match
publicly available anchors, Mach-two-class dash stands. We do **not** retune wave drag or
thrust to invent a sustained M2.5.

## Scope / architecture

| Seam | Job |
|---|---|
| **Corridor re-measure** | Recompute level-flight Ps and FL450 accel against existing `F22SupersonicPerformanceTests` anchors; record live numbers in the audit |
| **Public-claim ledger** | Explicit mapping: USAF supercruise / Mach-two class / ceiling / thrust class → which gate covers it; **M2.5 = out of claim**, not a bug |
| **Mismatch fixes** | Only defects that make the jet or instruments dishonest vs those anchors (e.g. detent thrust-estimate vs turbofan √density lapse, any HUD/telemetry Mach/thrust lie found during re-measure) |

### Non-goals

- Inventing M2.5 (or any unpublished top-speed point) as a product target
- A new F119 engine deck, inlet schedule, or thermal ceiling claim
- Range / endurance claims (fuel-flow surrogates remain unvalidated for that use)
- Rapier or other airframes (except shared turbofan helpers touched by an F-22 fix)

## Audit / fix protocol

### Re-measure (no retune)

1. Run `F22SupersonicPerformanceTests` green as the baseline contract.
2. Dump Ps (and T/D) at FL400/FL500 for M1.5 dry, M2.0 AB, M2.3 AB, and M2.5 AB so the
   audit can show numerically why M2.5 fails while M2.0 still has margin.
3. Confirm FL450 dynamic corridors still land in the claimed Mach bands.

### Claim gate (keep)

| Public / product claim | Executable gate |
|---|---|
| >M1.5 supercruise (dry) | Positive Ps @ 40k & 50k ft / M1.5 / military power |
| Mach two class (augmented) | Positive Ps @ 50k / M2.0 / max thrust fraction; negative Ps @ 50k / M2.3 |
| Dynamic through former transonic wall | FL450 military accel from ~M1.05 into dry supercruise band |
| Dynamic Mach-two class | FL450 full AB from ~M1.70 into ~M1.90–2.15 |
| M2.5 sustained dash | **Not a claim** — assert negative Ps @ FL500 / M2.5 AB so the suspicion has a named contract |

### Fix only if

1. A public-anchor test fails, or
2. Instruments / telemetry disagree with kernel Mach, thrust, or fuel in a way a pilot would
   trust, or
3. A known path still uses the wrong lapse model for the F-22
   (`DetentLayer.ThrottleForRequiredThrust` linear density vs kernel √density turbofan)
   **and** that path affects assisted / speed-hold honesty (full-power dash already bypasses
   it).

### Fix style

- Prefer one shared thrust-available helper over a third duplicated formula.
- No `WaveDragPeakMach` / `WaveDragK` retune unless a public-anchor test fails.
- Keep epistemic labels: surrogate corridors, not OEM data.

## Testing / docs

- Keep `F22SupersonicPerformanceTests` as the executable claim ledger; add an explicit
  FL500 / M2.5 AB **negative-Ps** assertion.
- Any detent / thrust-helper fix gets a focused unit test (F-22 estimate tracks √density
  turbofan at altitude, not linear density).
- Refresh `docs/f22-performance-audit.md` with today’s numbers and a short
  “M2.5 out of claim” section pointing at USAF Mach-two language and the M2.3/M2.5 gates.
- Companion sources remain those cited in the existing audit (USAF fact sheet / flight
  reporting; NASA F119 ~35,000 lbf class).

## Success criteria

- Pilot-facing answer to “why not M2.5?” is one sentence in the audit plus a failing-Ps
  test at M2.5.
- Public supercruise and Mach-two-class gates remain green.
- Any code change is justified by a failed honesty check above, not by desire for a higher
  top Mach.
