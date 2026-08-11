# Work order: Cobra crash consequence (post-Build-311)

Owner directive, 2026-08-11 flight on the Build 311 candidate: "full collective with zero
compensation should crash the helicopter, and my shitty autorotation just then should
probably also be a crash, noting that autorotation is tricky to get right on a sim."

## Doctrine constraints (do not violate)

- **Honest physics, not scripted departures.** Build 311 already makes an uncompensated
  full pull genuinely depart (rotor droop 324→266 RPM, 7.7°/s torque yaw, 19° nose-down /
  18° roll / 26 kt drift in 5 s, measured in the live page). The missing piece is the
  consequence at surface contact, not a canned crash.
- **Sink rate alone decides a hard impact on a flared landing.** The owner's earlier
  "landing is impossible" incident came from folding pitch/roll into the kill switch
  (`ResolveSkidAndRotorContact` comment). Attitude/rate terms may only ADD failure modes
  that are physically distinct (rollover, tail strike), never re-penalize a normal
  15–25° nose-up flare.
- **A well-flown autorotation must remain survivable** or every engine failure is a death
  sentence; the owner accepts that autorotation fidelity is hard, but a botched auto
  (no flare, high sink, low Nr) must crash. Prove BOTH sides with deterministic test
  pilots, and prove the crash tests fail without the change (control experiment — the
  Build 311 session caught a can't-fail test exactly this way).

## Existing machinery (verified 2026-08-11)

- `sim/Vehicles/Rotorcraft/Ah1gCobraDynamics.cs` `ResolveSkidAndRotorContact`:
  four-point skid contact, `_hardImpactLatched` on `normalImpactSpeedMps >
  geometry.HardImpactNormalSpeedMps`, `_rotorStrikeLatched` on hub clearance ≤ 0,
  `VehicleContactKind.HardImpact / SurfaceContact / StableSurfaceContact`.
- Mission terminal state "MISSION VEHICLE AUTHORITY LOST · R RESTARTS" already fires and
  freezes the snapshot (observed live when the unpiloted aircraft flew into terrain).
- Memory `landing-is-physics-not-procedure`: a `Kind == None` short-circuit fails quiet
  somewhere in the landing path — find and fix it as part of this work.

## Scope

1. **Contact envelope tiers.** At skid contact, evaluate (a) sink rate (existing),
   (b) lateral velocity + bank toward the contact side (dynamic rollover), (c) yaw rate
   (spin at touchdown), (d) surface suitability (existing gear-rip doctrine). Tiers:
   clean contact → gear damage (degraded further ops) → hard impact (authority lost).
   Thresholds from skid-gear literature (AH-1 family design sink ~2.5 m/s; hard ~4+ m/s)
   tuned so the Build 311 full-pull departure and a no-flare auto both terminate.
2. **Autorotation energy audit.** Verify the FM can actually arrive under the envelope
   from a well-flown auto: engine cut at representative height/speed, scripted
   entry-glide-flare pilot, measure touchdown sink. If the energy budget cannot close,
   tune flare effectiveness (collective pop from stored Nr) BEFORE loosening the
   envelope; document with traces either way.
3. **Wire the tiers to the mission terminal cause cards** (each terminal state has a
   cause card per fix f476ebbd) so the player is told WHY: HARD IMPACT / ROLLOVER /
   ROTOR STRIKE / GEAR COLLAPSE.
4. **Telemetry**: add touchdown sink/lateral/yaw-rate + tier to the Cobra snapshot so
   owner flights produce evidence (the 08-05 handoff proved Cobra telemetry blind spots
   cost diagnosis time).

## Acceptance

- Deterministic: uncompensated full pull from hover IGE → terminal crash within N s;
  no-flare engine-out from 300 ft AGL → crash; scripted flared auto from the same state
  → survivable (possibly gear damage); normal flared landing at ≤ design sink → clean.
  Each crash test demonstrated to fail against the pre-change dynamics.
- Live page: reproduce the owner's two scenarios by hand, read the cause card, screenshot.
- Owner flight is the final gate (difficulty doctrine: hard to earn, honest to convert).
