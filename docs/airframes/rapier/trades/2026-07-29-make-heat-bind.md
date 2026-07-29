# Trade study (draft): should temperature bind the Rapier envelope?

**Status:** Draft for owner decision — nothing here is adopted. Prompted by owner remark
2026-07-29: "we're thermally overengineered, to an extent."
**Context:** [20 — Thermal and materials](../20-thermal-and-materials.md) froze 1200 °C CMC;
[17 — Signatures](../17-signatures-and-survivability.md) spends that headroom's cousin
(kinematic sanctuary); `sim/FlightModel.cs:635-652` documents the screen: CMC binds ~M5.37 at
FL700 while the engine/inlet binds at M3.0–3.8 — **heat never limits the flown envelope.**

## The question

Today the thermal channel is a *teaching display* (skin/T0/CMC margin on the cycle card) but
never a *constraint*. Is that the right game? Three options:

| Option | What changes | What the player feels | Sim cost | Doctrine fit |
| --- | --- | --- | --- | --- |
| **A — Status quo** (CMC, non-binding) | Nothing | Temps are weather: informative, never limiting. The "ENGINE/INLET LIMITING" tag already names the true bind | None | Clean fit with ch. 16/17 (cost thesis, kinematic sanctuary). The headroom *is* the design story |
| **B — Ti-class hot structure (~450–500 °C)** | `SkinTemperatureLimitK` → ~723–773 K; cost ledger reprices (Ti < CMC); M4 fiction dies outright | A real MiG-25-style thermal game: dash binds ~M3.2–3.5, **time-at-Mach becomes a resource** the ANCA A-row could track ("SKIN LIFE") | Small constant change + a time-at-temp damage/limit model if we want *duration* rather than a hard wall (new sim work; the honest version rides the existing lagged-skin state) | Strengthens "1960s-adjacent" (ch. 16) and the munition price; **weakens** the 2040-materials chapter and re-opens the stainless-adjacent story ch. 00 explicitly superseded |
| **C — CMC skin, honest joints (~800 °C bondline)** | Keep the CMC freeze; bind on a *joint/seal* limit (the 2%-life fatigue claim made explicit) | Binds ~M4.3–4.5 — still outside the flown envelope, so gameplay unchanged; only the margin display shrinks | Small; mostly a second limit channel | Preserves every existing freeze; makes the cost line physically legible; but buys **no gameplay** |

## Recommendation (draft)

**A**, unless the design goal shifts to wanting a thermal-endurance game. The current fiction
is coherent: the aircraft *is* thermally overengineered on purpose, because the material was
chosen for manufacturability-at-price (ch. 16), not for margin, and the binding constraint
(engine/inlet) is already honest and displayed. Option B is the only one that changes play —
if that appeal grows, the honest implementation is **time-at-temperature life** consumption
on the existing lagged-skin state, surfaced on the ANCA Administrate row, not a hard Mach
wall. Option C is bookkeeping dressed as design.

Decision hooks if B is ever taken: re-pin Identity anchors in the same commit
(`InterceptorTbccV1.cs` rule), revise ch. 20 + cost ledger + plate-08/20, and re-run the
plate audit.
