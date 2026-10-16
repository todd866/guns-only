using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Recovery;

/// Shared navigation/recovery adapter. Follows the published gate and energy schedule;
/// Extracted from the lab recovery pilot: fixed-tick feedback follows
/// RecoveryProfileFlightTests. AP leaves configuration to the pilot. Physical contact and
/// debrief are exclusively the session's responsibility.
internal sealed class RecoverySteering {
    public PilotCommand Command { get; private set; }
    double speedIntegral;
    bool joinedFinal;
    bool goingAround;
    bool inbound;
    double outboundSide;
    bool cueTransitComplete;
    public string Drive(SimulationSession s, bool configureForLanding = true) {
        var own = s.Player.State;
        if (s.RunwayWeightOnWheels || s.ConventionalRunwayPhase == RunwayRecoveryPhase.Rollout
            || s.Recovery == Carrier.Recovery.Trap) {
            Command = new PilotCommand(1, 0, 0, 0); return "rollout";
        }
        var guidance = s.ApproachGuidancePlan;
        Vec3D destination;
        double targetSpeed, targetHeight;
        bool final = guidance.InGroove || guidance.ActivePatternLeg is ApproachPatternLeg.Final or ApproachPatternLeg.Threshold;
        if (guidance.Valid && guidance.Gates.Count > 0) {
            WorldApproachGate gate = guidance.Gates.FirstOrDefault(g => g.Active);
            if (gate.Id is null) gate = guidance.Gates[0];
            destination = new Vec3D(gate.EastM, gate.UpM, gate.NorthM);
            targetHeight = guidance.NextAltitudeM;
            targetSpeed = Math.Max(40, guidance.NextTrueAirspeedMps);
        } else if (s.Carrier is { } ship) {
            destination = ship.ApproachCuePoint;
            targetHeight = destination.Y;
            targetSpeed = 1.1 * SortieSchedule.ApproachTrueAirspeedMps(own.Mass, s.Beat.PlayerAir,
                s.Beat.SystemsProfile ?? AirframeSystemsProfile.F86FResearchBasis, own.Position.Y);
        } else {
            destination = s.Beat.RecoveryPlan?.Position ?? own.Position + own.ForwardDir() * 10000;
            targetHeight = destination.Y + 500;
            targetSpeed = 200;
        }
        // Fly the published ingress while distant from the runway. The first
        // gate is a moving lookahead on that path (often only ~325 m away), so
        // its proximity does not mean transit is complete. Use runway distance
        // to join the existing straight-in landing route.
        bool followPublishedIngress = false;
        if (s.TimeCompressionAvailable && !cueTransitComplete && guidance.Valid && guidance.Gates.Count > 0
            && s.ConventionalRunwayRecovery is { } transitRunway) {
            Vec3D offset = own.Position - transitRunway.Runway.Threshold;
            if (Math.Sqrt(offset.X * offset.X + offset.Z * offset.Z) < 14000
                || guidance.ActivePatternLeg != ApproachPatternLeg.PatternEntry || final)
                cueTransitComplete = true;
            else {
                followPublishedIngress = true;
                var cue = guidance.Gates[0];
                destination = new Vec3D(cue.EastM, cue.UpM, cue.NorthM);
                targetHeight = cue.UpM; targetSpeed = Math.Max(150, guidance.NextTrueAirspeedMps);
                if (configureForLanding && s.PlayerSystems.GearHandle == LandingGearHandle.Down) Press(s, GKey.GearToggle);
            }
        }
        // Use the lab's common, explicit straight-in join. Chasing the overhead
        // director's current gate alone can orbit a gate whose capture also requires
        // alignment with the NEXT leg. This controller owns navigation, never recovery
        // credit; the same production runway still decides touchdown and full stop.
        if (!followPublishedIngress && s.ConventionalRunwayRecovery is { } conventional) {
            var runway = conventional.Runway;
            var frame = runway.Frame(own.Position);
            double alignment = Math.Abs(Math.Atan2(Math.Sin(own.Chi - runway.HeadingRad), Math.Cos(own.Chi - runway.HeadingRad)));
            if (joinedFinal && frame.along > runway.TouchdownAimAlongM + 600) {
                joinedFinal = false; inbound = false; goingAround = true; speedIntegral = 0;
            }
            if (goingAround && frame.height > 450 && own.Speed > 130) goingAround = false;
            if (!goingAround && !joinedFinal && frame.along is < -3500 and > -16000 && Math.Abs(frame.cross) < 1600
                && alignment < .35 && frame.height is > 200 and < 950) joinedFinal = true;
            final = joinedFinal;
            // A fixed waypoint can become an endless orbit. Fly an outbound
            // parallel course, then a cross-track inbound intercept with room to turn.
            if (outboundSide == 0) outboundSide = frame.cross < 0 ? -1 : 1;
            if (!inbound && frame.along < -16000 && frame.height is > 200 and < 950) inbound = true;
            if (inbound && !final && frame.along > -3500) inbound = false;
            double course = inbound
                ? runway.HeadingRad + Math.Clamp(Math.Atan2(-frame.cross, 5000), -.8, .8)
                : runway.HeadingRad + Math.PI + Math.Clamp(Math.Atan2(frame.cross - outboundSide * 6000, 5000), -.8, .8);
            destination = own.Position + new Vec3D(Math.Sin(course), 0, Math.Cos(course)) * 5000;
            targetHeight = runway.Threshold.Y + 600;
            targetSpeed = 150;
            if (goingAround) destination = own.Position + own.ForwardDir() * 4000;
            if (configureForLanding && !final && frame.height > 100 && s.PlayerSystems.GearHandle == LandingGearHandle.Down)
                Press(s, GKey.GearToggle);
        }
        double desiredGamma;
        double heightError = targetHeight - own.Position.Y;
        var delta = destination - own.Position;
        double horizontal = Math.Sqrt(delta.X * delta.X + delta.Z * delta.Z);
        desiredGamma = Math.Clamp(Math.Atan2(heightError, Math.Max(500, horizontal)), -.14, .12);
        var profile = s.Beat.SystemsProfile ?? AirframeSystemsProfile.F86FResearchBasis;
        if (configureForLanding && s.Player.IndicatedAirspeedMps * AirData.MpsToKnots < profile.GearAndFlapLimitKias - 5
            && !followPublishedIngress && (final || targetSpeed < 150)) {
            if (s.PlayerSystems.GearHandle != LandingGearHandle.Down) Press(s, GKey.GearToggle);
            if (s.PlayerSystems.LeftFlapDegrees < profile.FullFlapDegrees - 1 && s.Tick % 120 == 0) Press(s, GKey.FlapDown);
            if (s.Carrier is { IsMaritime: true } && s.PlayerSystems.HookHandle != TailhookHandle.Down) Press(s, GKey.HookToggle);
        }
        if (final && s.ConventionalRunwayRecovery is { } recovery) {
            var runway = recovery.Runway;
            var frame = runway.Frame(own.Position);
            double remaining = runway.TouchdownAimAlongM - frame.along;
            double glideHeight = recovery.ReferenceHeightM + Math.Max(0, remaining) * Math.Tan(3 * Math.PI / 180);
            heightError = glideHeight - frame.height;
            desiredGamma = -3 * Math.PI / 180 + Math.Clamp(heightError / 250, -.08, .08);
            if (remaining < 240) desiredGamma = -.012 + Math.Clamp(heightError / 180, -.035, .055);
            // Track the centreline with a lookahead, not a waypoint behind the aircraft.
            destination = runway.SurfacePoint(Math.Max(runway.TouchdownAimAlongM, frame.along + 900));
            delta = destination - own.Position;
            targetSpeed = SortieSchedule.ApproachTrueAirspeedMps(own.Mass, s.Beat.PlayerAir, profile, own.Position.Y);
        }
        double desiredHeading = Math.Atan2(delta.X, delta.Z);
        double headingError = Math.Atan2(Math.Sin(desiredHeading - own.Chi), Math.Cos(desiredHeading - own.Chi));
        double bank = Math.Clamp(headingError * 1.4, -.7, .7);
        double speedError = targetSpeed - s.Player.AirspeedMps;
        speedIntegral = Math.Clamp(speedIntegral + speedError * SimulationSession.FixedDeltaSeconds, -20, 20);
        double drag = SortieSchedule.RecoveryDragToWeight(own.Mass, s.Beat.PlayerAir, profile, own.Position.Y);
        double trimThrottle = Math.Clamp((drag + Math.Sin(desiredGamma)) * own.Mass * FlightModel.G0 / Math.Max(1, s.Beat.PlayerAir.ThrustMaxN), .04, .8);
        double throttle = Math.Clamp(trimThrottle + .018 * speedError + .0025 * speedIntegral, 0, 1);
        // The simulated gear actuator requires a turning engine. A long idle
        // deceleration can otherwise leave the selected gear physically retracted.
        if (s.PlayerSystems.GearHandle == LandingGearHandle.Down && !s.PlayerSystems.AllGearDownAndLocked)
            throttle = Math.Max(throttle, .08);
        double g = Math.Clamp((Math.Cos(own.Gamma) + own.Speed / FlightModel.G0 * .6 * (desiredGamma - own.Gamma))
            / Math.Max(.3, Math.Cos(own.Bank)), .2, 4);
        double pitch = double.NaN;
        if (final && Math.Abs(headingError) < .3 && Math.Abs(own.Bank) < .3) {
            double q = .5 * s.Player.AtmosphericState.DensityKgM3 * s.Player.AirspeedMps * s.Player.AirspeedMps;
            double cl = own.Mass * FlightModel.G0 / Math.Max(1, q * s.Beat.PlayerAir.WingAreaM2);
            double alpha = (cl - s.PlayerAerodynamicConfiguration.LiftCoefficientIncrement) / Math.Max(1e-6, s.Beat.PlayerAir.CLAlpha);
            pitch = Math.Clamp(desiredGamma + alpha, -5 * Math.PI / 180, 20 * Math.PI / 180);
        }
        Command = new PilotCommand(g, bank, throttle, 0, CommandedPitchRad: pitch);
        return goingAround ? "go-around" : final ? "approach" : inbound ? "join-inbound" : "RTB";
    }
    static void Press(SimulationSession s, GKey key) { s.FeedKey(key, true); s.FeedKey(key, false); }
}
