# Rapier v2: shape-first engineering core

Rapier v2 replaces the old habit of maintaining a drawing, flight constants, mass numbers, and
thermal claims as separate truths. The authored airframe is
[`airframes/rapier.v2.json`](../../../airframes/rapier.v2.json). Its exterior coordinates and
engineering assumptions are canonical. Dimensions, aerodynamic reference quantities, volumes,
mass properties, thermal-zone areas, and the M4 dash screen are derived from that definition.

This is an engineering surrogate, not a claim that preliminary geometry has become a qualified
aircraft. It is deliberately small enough to audit and strict enough to fail when its shape cannot
support its claims.

## What the aircraft is

Rapier is a 13 m long, 7.35 m span, 2.229 m high tailless cranked-delta interceptor. It has a needle
nose, one continuous smooth and opaque upper centrebody, and no canopy or raised capsule spine. A single
blended ventral inlet begins under the forward centrebody, is visibly inclined 7.5 degrees into its
design flow, and becomes one deep, blended propulsion tunnel ending in one fixed nozzle. Inside that
tunnel a central turbine package leaves an annular high-speed path around it; both modes use the same
inlet and nozzle, while turbine- and ram-stream thrust remain separately observable. Two low, slightly
canted fins sit well aft. The only mission aperture is a
single offset gun muzzle; catapult and arresting-hook fittings are flush. There are no external
stores and no drone bay.

The form is intended to look like one load path and one captured-air system rather than an assemblage of
cockpit, nacelle, wing, and tail modules. The buried reclined escape capsule is an internal volume,
not a second exterior fuselage. The deeper belly is the engine and its high-speed duct, not styling:
it houses a `1.22 m × 4.88 m` core inside a `1.34 m × 5.48 m` installed envelope with explicit
structural, thermal, fire-bulkhead, and equipment clearances.

## What problem it solves

The baseline mission is intentionally narrow: catapult launch, climb, high-altitude M4-class dash,
zoom to one balloon gun pass, reentry, and arrested recovery on a 10,000 ft (3,048 m) runway whose
arrestor is at the exact midpoint. It is a one-aircraft, one-attack, gun-only mission; its drone
count is fixed at zero.

This is not a general-purpose fighter requirement. The system trades broad low-altitude agility,
external carriage, and repeated attacks for a short high-altitude energy window. The M4.2 design
point is at 24 km because dynamic pressure and heating make the same speed dishonest at ordinary
combat altitude.

## Authority chain

1. `airframes/rapier.v2.json` authors exterior coordinates, materials, zone assignment, installed
   mass assumptions, and the fixed operating contract.
2. `tools/assets/airframes/derive_shape_first_airframe.mjs` validates that no derived result has
   been hand-authored, then derives the engineering quantities.
3. `airframes/generated/rapier.v2.engineering.json` is the deterministic, checked-in bridge for
   runtime consumption. It is generated evidence, not a second authority.
4. `authority.runtimeBinding` names `FlightModel.RapierPublicDataSurrogate`; runtime integration
   must bind that model to the generated values and the same canonical exterior.
5. `web/wwwroot/airframes/rapier.v2.json` is required to be byte-identical to the source definition.
6. `web/wwwroot/airframes/rapier_v2.embedded.js` is the generated synchronous browser module; its
   embedded value and hash must match the same source.

The focused test rejects duplicate authored area, volume, mass, CG, inertia, inlet-area, or thermal-
area fields. It also byte-compares the generated artifact to a fresh derivation, preventing a shape
edit from silently leaving runtime engineering behind.

Run the freshness check from the repository root:

```sh
node tools/assets/airframes/derive_shape_first_airframe.mjs \
  airframes/rapier.v2.json --check airframes/generated/rapier.v2.engineering.json
node tools/assets/airframes/derive_shape_first_airframe.mjs \
  airframes/rapier.v2.json --check-embedded web/wwwroot/airframes/rapier_v2.embedded.js
```

The helper prints the deterministic artifact to standard output when invoked with only the source
path. Regeneration must be reviewed like a code change because geometry edits can alter every
downstream property.

## Closed requirements and provisional engineering

The user-fixed facts are the catapult launch, 3,048 m runway, 1,524 m arrestor station, honest M4+
high-altitude dash, canonical known exterior, meaningful thermal limit, plausible CMC use, and the
single balloon gun intercept with no drones. Those are product requirements, not externally sourced
historical facts.

The 84 kN sea-level-static dry turbine rating, 1.35 maximum turbine-only augmented ratio,
M1.9-to-M3.0 turbine fade, and 10.08/144.48/453.6 lb/min idle/military/augmented fuel anchors are
**local provisional closures**, not user-fixed product requirements. They keep the current model
finite and testable and may be replaced by a better supported engine deck. Augmentation never
multiplies ram-stream thrust.

The installed propulsion architecture is likewise explicit but provisional: one inlet feeds a
central variable-cycle turbine package and a co-annular high-speed/ram path, and both discharge
through one fixed nozzle. NASA's Mach-4-class variable-cycle fan work establishes that turbine-to-
ramjet transition and very wide fan operating range are real engineering subjects. NASA LIMX work
establishes the inlet transition, recovery, distortion, and isolator problems for a **dual over-under
flowpath**. Neither validates Rapier's fictional co-annular integration. The current geometry only
passes a transparent packaging and choked-area screen.

The 7.5-degree inlet incidence is also canonical. High-altitude level-flight trim at M4.2 is derived
as 7.593 degrees body alpha, leaving only 0.093 degrees of inlet off-design angle. Recovery and
unstart are functions of deviation from this installed incidence plus sideslip, not absolute body
alpha. This closes the visual intake orientation, the engineering thrust screen, and runtime inlet
loss to one convention.

Everything else remains a model with an epistemic label. The geometry calculations are analytical
preliminary-design approximations, not a CAD boolean model. The propulsion and drag calculation is a
shape-driven turbo-ramjet screen, not an engine deck or CFD. Thermal calculations are adiabatic
temperature limits, not transient conjugate heat-transfer analysis. Mass comes from shaped shell,
installed-volume, and fuel-volume assumptions, not a parts list.

See [sources and evidence](00-sources.md) and the
[derivation and acceptance results](10-shape-derived-engineering.md).
