# PATHFINDERS relay model — Phase 1, Slice 1

The default entry is `Beats.RapierPathfinders()` / built-in beat 15, mission
`mission.rapier.pathfinders.phase1.v1`. It starts at 20,600 m (FL676), M3.6 airspeed,
clear dawn, with the first lane 25 km ahead. The seed defaults to the explicit integer
20261016; there is no wall-clock fallback. `fullSortie: true` retains the buried launcher.
The gallery (beat 12) and dealt `RapierGoFly` factory retain their original contracts.

This is sim groundwork. Dawn is authored mission metadata; no renderer or HUD consumes it in
this slice. Drone inventory and its four × 360 kg carried mass are present, but release/weapon
selection, autonomous firing ROE, the hunt deadline, HUD, and end-to-end recovery/envelope
acceptance remain later Phase-1 work. The existing pilot/bingo RTB and recovery take priority.
The short-start state is authored, not evidence of the spec's 30-second sustained-flight gate
or a demonstrated return with reserve. No shared airframe thrust, G limit or fuel floor changes.

## Card and evidence

| Quantity | Value / derivation | Epistemic / basis |
|---|---|---|
| Neutral float reference | 20,600 m | provisional; inside the owner-approved FL650–700 band |
| Dry assembly mass | 1,600 kg | provisional relay payload/envelope card; not the scientific balloon's mass |
| Helium/air density ratio | 0.138 | surrogate ideal-gas molar-mass ratio, equal temperature/pressure |
| Lift volume | dry mass / ((1 − helium ratio) × standard-atmosphere density at float) | surrogate neutral buoyancy; one separate card, no reuse of the 33.5 km/gallery float |
| Envelope collision | sphere with radius derived from lift volume | surrogate; presentation must use this new transform/scale when added, not silently retain the gallery's 56 m kill sphere |
| Gondola collision | axis-aligned 5.6 × 2.8 × 4.2 m box; centre 13 m below envelope bottom | surrogate dimensions/offset from `web/wwwroot/render/scene/high_altitude_balloon.js`; panels/rigging excluded |
| Gondola disable | first confirmed swept hit | provisional damage threshold from the approved design |
| Envelope puncture | +0.25 normalized leak severity, capped at 1 | provisional; changes neither position nor velocity at impact |
| Support loss | asymptotic leak response, 30 s / leak severity | provisional; continuous progression into a bounded puncture-support deficit |
| Sink response | terminal 2√support-loss m/s; 8 s drag response | provisional linear buoyancy/drag surrogate; approaches 0.5–2 m/s after the initial transient |
| Drift | shared layered sounding + independent seeded horizontal offset within ±0.75 m/s per axis | provisional spatial unresolved-wind surrogate; fixed integer generator keyed by seed and relay ID |
| Gondola fall | 55 m/s terminal descent, vertical response 55/g s, horizontal wind response 10 s | provisional tumbling-body linear drag; live fall and prediction share the integrator |
| Footprint margin | 30 m scatter + 2 m/s horizontal uncertainty × predicted fall time | provisional conservative circle; includes component extent and integration margin, boundary contact is blocked |

The sink law is the analytic solution of a linear drag balance: drag coefficient `c = m/8 s`,
support deficit `c × terminal sink`, and acceleration `(-deficit − c × vertical velocity)/m`.
Leak severity grows only on envelope hits; the support deficit develops continuously with sim
time. It is a bounded puncture model, not a prediction of full gas exhaustion or envelope rupture.
The old scientific-envelope sphere as a lethal payload volume, instant altitude loss, and
envelope-based relay/economic credit were rejected.

The falling-object model terminates at the scenario's flat ground datum (the strip's authored
operating elevation for First Light). It is not terrain-following impact prediction. The margin
is conservative for the authored sounding/card; arbitrary future terrain or unbounded wind
fields need their own validated uncertainty bounds before being authorized for this mission.
The current slice predicts gondola debris only. Live-round ground footprints and drone
authorization/recheck belong to the subsequent weapons slice.

## Authority and settlement

Relay actors own their component IDs, leak state and debris. `GunKill` continues to integrate
real moving-target projectile sweeps; explicit component volumes bypass all fighter aim-radius
forgiveness. Legacy targets retain their sphere and selected-live-target firing behavior.
PATHFINDERS permits pilot gun fire even after the selected relay dies, with no automatic target
hop. Ordered impact fractions advance actors to the contact time before predicting each kill.

`PathfinderMission.KillRecords` retains at most six structural outcomes with sim time, footprint,
classification and reward eligibility. Populated intersection (including tangency) or unknown
prediction records an ROE violation while retaining the physical denial/debris. The two western
lanes are clear; the third balloon's downwind footprint overlaps an authored town polygon.
Populated boundaries are mission content, not terrain-type guesses.

`SimulationSession.PathfinderEconomy` adapts the hunt into the existing operations model. Quota 1
earns one +90 CR balloon contract; two safe kills still earn only one contract. Any ROE violation
withholds that contract for the sortie. Recovery, fuel, rounds, loss and inspection retain their
existing prices. The later debrief must consume this sim adapter rather than the legacy
single-opponent Boolean. Restaging reconstructs actors, weapon, damage and ledger from the seed.

Validation command (only this filter is in scope):

```sh
PATH="$HOME/.dotnet:$PATH" DOTNET_ROOT="$HOME/.dotnet" dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "FullyQualifiedName~Pathfinder"
```
