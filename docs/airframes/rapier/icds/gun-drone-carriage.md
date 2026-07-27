# ICD — Carrier ↔ drone cell

Interface control between the Rapier airframe and the (currently provisional) gun-drone carriage
system ([60 — Armament and drones](../60-armament-and-drones.md), `docs/rapier-gun-drone-system.md`).

## Closed interface points

| Interface | Value | Owner chapter |
| --- | --- | --- |
| Gameplay load | four reusable gun-drones | [60](../60-armament-and-drones.md) |
| Drone skin thermal limit | 593.15 K (~320 °C), far below Rapier's 1473.15 K | [60](../60-armament-and-drones.md), [20](../20-thermal-and-materials.md) |
| Body volume constraint | cells must fit inside the area-ruled OML without wrecking wave drag | [10](../10-geometry.md) |
| Recovery | off Rapier's arresting strip (glide-drone design), not in-flight recovery to Rapier | `docs/rapier-gun-drone-system.md` |

The carrier provides protected carriage, electrical/thermal conditioning, mission data, release
authority, and initial separation — it does not provide in-flight drone recovery, mid-mission
rearming, or drone flight control once released.

## Open findings at this boundary — do not close prematurely

> **provisional / open.** Cell count (2 vs 3 vs 4), door mechanism, packaged mass and volume, CG
> travel on release, and release-speed/altitude envelope relative to Rapier's own dash Mach are all
> unclosed. **No closed drone mass, cell dimension, or release-Mach number should be written into
> this ICD, the SE bible, or the forthcoming JSON Airframe Definition's `droneBay` sockets until the
> packaging trade (Phase 2, see `docs/rapier-gun-drone-system.md`) closes them.** The Airframe
> Definition JSON does not exist yet as of this bible (Task 1 is documentation-only); when it is
> authored (Task 2), it is planned to carry four `droneBay` sockets as placeholders, explicitly
> tagged `"epistemic": "provisional"` — not as closed engineering commitments.

## Epistemic

Gameplay load count and thermal-limit mismatch are **closed** facts about the current system.
Everything about physical packaging is **provisional**, per
[60 — Armament and drones](../60-armament-and-drones.md).

