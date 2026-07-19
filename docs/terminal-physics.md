# Terminal physics and incident lifecycle

`Guns Only` does not treat **splash** as a simulation stop. A gun-kill threshold is the onset of a
catastrophic damage state, not a canned outcome animation. The deterministic session continues the
same aircraft entity through:

1. `DESTROYED`: engine combustion is removed, pilot demand is disconnected, and asymmetric drag
   and moments enter the ordinary rigid-body aerodynamic model.
2. `IMPACT`: a swept water, flight-deck, hull, or island contact applies a collision impulse.
3. Post-impact motion: the wreck bounces/slides relative to the moving deck, can pass a real deck
   edge and fall overboard, or dissipates water-entry momentum around a flooded buoyancy state.
   A second `IMPACT/WATER` event records an overboard water entry after a deck/structure strike.
4. `SETTLED`: motion is negligible relative to the final surface.
5. `SORTIE_FINISHED`: only now does the outcome become final and the debrief interlock open.

A geometrically caught wire has its own continuous failure path. The fixed-capacity arresting
engine integrates actual aircraft kinetic energy against its preselected force curve. If energy,
payout, or safe line load is exhausted, the session emits `ARRESTMENT_FAILED`, preserves the
remaining deck-relative velocity, and hands that state directly into deck contact without applying
another tangential collision impulse. Only an arrestment which reaches `STOPPED` is a recovery or
relaunch.

The state and events are durable in the web snapshot (`player_terminal_state`,
`opponent_terminal_state`, per-aircraft impact surface, and ordered `recent_events`). This keeps a
same-frame respawn or presentation effect from erasing the physical contact that produced a loss.
A 180-second deterministic simulation boundary is a fail-safe against non-resolving trajectories;
it emits `TERMINAL_LIMIT_REACHED` and changes the unresolved aircraft to
`SIMULATION_BOUNDED`. The final integrated state and residual velocity remain evidence; the guard
never emits `SETTLED` and must not masquerade as a physical impact or rest state.

## Fidelity boundary

This is continuous, deterministic, physically based terminal mechanics, but it is not yet a
validated crash-survivability model. The catastrophic aerodynamic increments, collision
restitution, deck friction, broken-airframe drag, and water/flooding response are isolated
phenomenological coefficients. They preserve momentum, surface-relative motion, event causality,
and finite energy dissipation, but require calibration against type-specific structural, ditching,
and impact evidence before any exact quantitative claim.

The arresting profile is likewise provisional. Its finite capacity and energy bookkeeping are
physical invariants, but its force curve, energy and line-load limits are not yet calibrated to a
declared historical carrier/aircraft/equipment combination. `LINE_LOAD_EXCEEDED` currently
identifies the weakest-link boundary, not the specific component which failed.

The intended production seam is a component/structure damage model that supplies remaining wing
area, control authority, engine/accessory failures, mass and inertia changes, separated parts, fire,
and occupant loads. That model can replace the current coefficient set without changing the
session lifecycle, telemetry event contract, renderer binding, or debrief ordering.
