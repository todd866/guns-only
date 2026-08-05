# AH-1G Cobra flight foundation

This dossier locks Guns Only to a **late-production Vietnam-era AH-1G** before any mission,
weapon or artwork is allowed to call itself a Cobra. The baseline is the T53-L-13B aircraft with
the standard BHC-540 main rotor, 324 rpm nominal rotor speed, and standard 8.4-inch-chord
starboard tractor tail rotor.

The first code slice is deliberately an unarmed flight-test authority:

- `Ah1gCobraDefinition` pins the variant, mass, rotor, drivetrain, hub locations and reference
  inertias.
- `Ah1gCobraDynamics` implements direct collective/cyclic/pedal input, finite rotor energy and
  dynamic inflow, a lagged governor and transmission ceiling, autorotative energy transfer,
  translational lift, ground effect, continuous vortex-ring and retreating-blade-stall severity,
  anisotropic fuselage/stub-wing forces, four skid points, and rotor clearance.
- `RotorcraftTelemetry` exposes rotor RPM, tail RPM, torque/power, inflow and adverse-regime
  evidence without forcing those concepts into fixed-wing telemetry.

Production exposure is **Hold the Bridge** on `/cobra-lab/` (River Gorge ground war with win/lose).
The CASEVAC aircraft remains a fictional velocity-commanded point mass; the normal fixed-wing
combat path still assumes `AircraftSim`, body gun and fighter HUD. Do not retune those for Cobra.

## Player controls

The existing action IDs remain stable:

| Existing action | AH-1G meaning |
|---|---|
| Arrow up/down | Forward/aft cyclic |
| Arrow left/right | Left/right cyclic |
| A / D | Left/right pedal |
| W / S | Raise or lower a persistent collective lever (game convention, owner ruling 2026-08-05) |
| F | Hold to ask the AI gunner to engage; release to cease fire |
| V / Tab | Padlock the view / cycle the selected target |

W/S must move blade collective pitch. It must not directly command thrust, vertical velocity or
climb rate. In normal operation the twist grip is full open; the mechanical droop compensator and
N2 governor schedule fuel to hold rotor speed. Engine start/stop, governor emergency/manual mode,
and RPM trim belong to secondary controls later.

## Fidelity statement

This is a **flight-foundation model**, not the finished “as accurate as possible” model. It is
meaningfully above the fictional CASEVAC model because rotor RPM, inflow, power and failure energy
are states rather than effects. It is below production-combat fidelity because rotor loads are
still disk-averaged and fuselage attitude is a deterministic reduced-order response fit.

Before production combat, the disk-averaged rotor must be replaced with an azimuth-resolved
two-blade teetering model (BHC-540 Mach/angle-of-attack tables, dynamic stall, flapping stops,
undersling and pitch-cone coupling), an averaged physical tail rotor, source-derived component
forces at their real offsets, full mass/CG/inertia changes, distributed terrain inflow and rotor
strike, and flight-card calibration against Army/NASA data.

## Recommended delivery order

1. **Flight lab:** direct keyboard/touch/gamepad collective, cyclic and pedals; rotorcraft HUD;
   hover, transition, VRS, autorotation, high-speed and landing cards; deterministic replay hash.
2. **Gun lab:** preserve the real two-seat division. The player is the rear-seat pilot; a
   deterministic simulation-owned AI is the front-seat copilot/gunner. Reuse the existing combat
   interaction exactly: the trackpad remains pilot freelook, `Tab` cycles the selected target,
   `V` toggles padlock view, and holding `F` asks the AI gunner to engage the selected target.
   Releasing `F` means cease fire. The AI acquires and tracks through physical M28A1 turret
   authority and cannot bypass masking, limits, safety or a failed ballistic solution. Start with
   dual M134 7.62 mm guns; the alternate M134/M129 fit follows. Preserve the documented
   pilot-fixed-forward mode as a later failure/fallback authority, not the primary player control.
   The port-mounted M35/M195 20 mm system is a valid later AH-1G configuration; the three-barrel
   M197 is not.
3. **Production presentation:** sourced exterior/cockpit LODs; simulation-driven main/tail rotor
   and turret nodes; governed rotor/engine/gearbox audio; rotorcraft warnings and mobile layout.
4. **Combat missions:** ground entities, threats, NOE obstacles, component damage/failures, generic
   replay/debrief and AI. Rockets or TOW require an explicit product decision because this is Guns
   Only. The first ground-war loop is `sim/Cobra/GroundWar/` (BF-Vietnam-legible contested sites,
   balance tipped by M134 fire, Camp Ember rearm); see
   `docs/superpowers/specs/2026-08-03-cobra-canyon-ground-war-design.md`.

See [00-sources.md](./00-sources.md) for the evidence ledger and
[10-flight-model.md](./10-flight-model.md) for equations, known approximations and acceptance
cards.
