# ICD — FBW ↔ crew capsule

Interface control between the fly-by-wire control law and the occupant/escape-pod system
([50 — Crew, escape, FBW](../50-crew-escape-fbw.md)).

## Closed interface points

| Interface | Value | Owner chapter |
| --- | --- | --- |
| Structural G ceiling FBW must not silently exceed for the pilot's benefit | 12 G qualified / 15 G override | [50](../50-crew-escape-fbw.md) |
| Bank-hold rate gain | `RollHoldRateGainNms` 1.2e6 (surrogate) | [50](../50-crew-escape-fbw.md) |
| Pod is sealed, opaque, no windscreen | — | [20](../20-thermal-and-materials.md), [50](../50-crew-escape-fbw.md) |

The load-bearing rule at this interface: `PilotPhysiologyProfile.RapierReclinedInterceptor` must not
silently re-impose upright-seat G limits on top of the airframe's structural ceiling. FBW and aim
assist sit strictly on the control-authority side of this interface — they must not be modelled as
adding lift, thrust, or guaranteed hits.

## Open findings at this boundary

> **provisional.** Escape pod jettison sequence, separation dynamics, and any survivability claim
> are interface-only — there is no closed jettison model to cite here. Power draw for FBW actuation
> and capsule environmental conditioning is qualitative, not a watts figure, pending the Phase 2
> power budget in [50 — Crew, escape, FBW](../50-crew-escape-fbw.md).

## Epistemic

G-ceiling and control-gain values are **closed**/**surrogate**. Escape jettison and power draw are
**provisional**.

