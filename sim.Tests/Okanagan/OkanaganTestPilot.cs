using GunsOnly.Sim.Okanagan;

namespace GunsOnly.Sim.Tests.Okanagan;

// Regression route pilot: ordinary physical commands at 10 Hz, never a pose or phase injection.
// This feedback controller proves mission reachability, not unassisted human handling.
// The energy floor is specific to this loaded Fire Boss, not a shared-aircraft assumption.
internal sealed class OkanaganTestPilot(double initialElevatorTrim)
{
    const double Degrees = Math.PI / 180;
    static double Wrap(double value) => Math.Atan2(Math.Sin(value), Math.Cos(value));
    static readonly AircraftParams Parameters = FlightModel.At802fFireBossPublicDataSurrogate;

    public FireBossPilotCommand Command(OkanaganMissionSnapshot state, double engineThrustN,
        bool shallowLoadedClimbRecommended)
    {
        if (state.Route.Count == 0) return new(0, 0, 0, 0, false, false);
        var aircraft = state.Aircraft;
        var phase = state.Phase;
        var surface = aircraft.SurfaceMode;
        var position = aircraft.PositionWorldM;
        int index = Math.Clamp(state.ActiveGateIndex, 0, state.Route.Count - 1);
        if (surface == FireBossSurfaceMode.Water
            && phase is OkanaganMissionPhase.Scoop or OkanaganMissionPhase.JoinScoop)
            index = state.Route.Count - 1;
        var gate = state.Route[index];
        var target = gate.PositionWorldM;
        var steering = target;
        if (phase == OkanaganMissionPhase.JoinScoop && gate.Id == "scoop-touch"
            && index + 1 < state.Route.Count)
            steering = state.Route[index + 1].PositionWorldM;
        if (phase == OkanaganMissionPhase.Approach && gate.Id == "threshold")
        {
            // Keep following the runway centreline after passing its threshold/aiming point.
            var axis = new Vec3D(Math.Sin(160 * Degrees), 0, Math.Cos(160 * Degrees));
            double along = (position.X - target.X) * axis.X + (position.Z - target.Z) * axis.Z;
            steering = target + axis * Math.Max(1200, along + 1200);
        }
        double distance = HorizontalDistance(position, target);
        double headingError = Wrap(Math.Atan2(steering.X - position.X, steering.Z - position.Z)
            - aircraft.HeadingRad);
        bool onSurface = surface is FireBossSurfaceMode.Water or FireBossSurfaceMode.Runway;
        double landingHeight = phase == OkanaganMissionPhase.JoinScoop
            && gate.Id is "scoop-touch" or "scoop-lane" ? 342
            : phase == OkanaganMissionPhase.Approach && gate.Id == "threshold" ? 433 : double.NaN;
        double clearance = position.Y - landingHeight;
        double maxBank = phase == OkanaganMissionPhase.Climb ? (distance > 2000 ? 30 : 22)
            : !double.IsNaN(landingHeight) && clearance < 55 ? 9
            : phase is OkanaganMissionPhase.JoinScoop or OkanaganMissionPhase.Approach ? 26 : 38;
        // A heavy mountain climb cannot spend its small excess power on the former steep
        // holding turns. Fly a shallow climbing turn; resume route interception once high enough.
        if (shallowLoadedClimbRecommended)
            maxBank = Math.Min(maxBank, 12);
        double bank = onSurface ? 0 : Math.Clamp(headingError * 1.55, -maxBank * Degrees, maxBank * Degrees);
        double roll = onSurface ? 0 : Math.Clamp(Wrap(bank - aircraft.RollRad) / (24 * Degrees), -1, 1);
        double verticalSpeed = 0, pitch = 0;
        if (surface == FireBossSurfaceMode.Runway && phase == OkanaganMissionPhase.Depart)
            pitch = aircraft.TrueAirspeedMps >= 38 ? .55 : .34;
        else if (surface == FireBossSurfaceMode.Water
            && phase is OkanaganMissionPhase.Climb or OkanaganMissionPhase.Rtb)
            pitch = aircraft.TrueAirspeedMps >= OkanaganFireMission.SuggestedWaterRotationSpeedMps(aircraft)
                ? .72 : 0;
        else if (!onSurface)
        {
            if (!double.IsNaN(landingHeight))
            {
                verticalSpeed = clearance <= 3 ? -.9 : clearance <= 10 ? -1.25
                    : Math.Clamp((target.Y - position.Y) / Math.Max(350, distance)
                        * Math.Clamp(aircraft.TrueAirspeedMps, 35, 65), -2.4, -1.15);
            }
            else
            {
                double error = target.Y - position.Y;
                double requested = error < 0
                    ? error / Math.Max(250, distance - gate.RadiusM * .8) * aircraft.TrueAirspeedMps
                    : error * (phase == OkanaganMissionPhase.Climb ? .020 : .014);
                double maximumClimb = phase == OkanaganMissionPhase.Climb
                    ? (gate.Id == "lift-off" ? 4 : 3.8) : 3.8;
                verticalSpeed = Math.Clamp(requested,
                    phase == OkanaganMissionPhase.Approach ? -3
                        : phase is OkanaganMissionPhase.Ingress or OkanaganMissionPhase.Drop ? -10 : -3.8, maximumClimb);
            }
            if (phase is OkanaganMissionPhase.Climb or OkanaganMissionPhase.Ingress
                or OkanaganMissionPhase.Drop or OkanaganMissionPhase.Rtb)
                verticalSpeed = Math.Min(verticalSpeed, (aircraft.TrueAirspeedMps - (42 + 10 * Math.Clamp(aircraft.WaterLoadKg / 2800, 0, 1))) * .65);
            // The actuator is now elevator position, not a G request. Estimate the attached
            // lift/weight trim once per observation, then track the desired body pitch with
            // a damped angle controller. There is no integral or correction of authority state.
            double speed = Math.Max(25, aircraft.TrueAirspeedMps);
            double density = StandardAtmosphere1976.Instance.Sample(position.Y).DensityKgM3;
            double qS = .5 * density * speed * speed * Parameters.WingAreaM2;
            double gammaTarget = Math.Asin(Math.Clamp(verticalSpeed / speed, -.25, .25));
            double normalForce = aircraft.GrossMassKg * FlightModel.G0 * Math.Cos(gammaTarget)
                / Math.Max(.6, Math.Cos(aircraft.RollRad));
            double alpha = 0;
            for (int iteration = 0; iteration < 4; iteration++)
            {
                // A nose-up propeller also supports weight. Omitting this term over-trims a
                // slow approach and can make the route pilot float above the runway.
                double cl = (normalForce - engineThrustN * Math.Sin(alpha)) / qS;
                alpha = Math.Clamp((cl - Parameters.ZeroLiftCoefficient) / Parameters.CLAlpha,
                    -5 * Degrees, .95 * (Parameters.CLMax - Parameters.ZeroLiftCoefficient) / Parameters.CLAlpha);
            }
            double targetPitch = gammaTarget + alpha;
            var tail = Parameters.ConventionalTail;
            // A steady banked turn has positive BODY pitch rate even at constant world pitch.
            // Its rate trim must overcome CmQ; damping toward zero would fight the turn itself.
            double qTarget = FlightModel.G0 / speed * Math.Pow(Math.Sin(aircraft.RollRad), 2)
                / Math.Max(.6, Math.Cos(aircraft.RollRad)) * Math.Cos(gammaTarget) * Math.Cos(targetPitch);
            double chord = Parameters.WingAreaM2 / Parameters.WingSpanM;
            double elevator = -(tail.CmAlpha * alpha + tail.CmQ * qTarget * chord / (2 * speed))
                / (tail.CmDeltaElevator * tail.MaxElevatorDeflectionRad);
            pitch = Math.Clamp(elevator - initialElevatorTrim
                + Wrap(targetPitch - aircraft.PitchRad) + .6 * (qTarget - aircraft.PitchRateRadPerSecond), -.75, .7);
        }
        double throttle;
        if (phase == OkanaganMissionPhase.Climb
            || surface == FireBossSurfaceMode.Runway && phase == OkanaganMissionPhase.Depart
            || surface == FireBossSurfaceMode.Water && phase == OkanaganMissionPhase.Rtb)
            throttle = 1;
        else if (phase is OkanaganMissionPhase.Landed or OkanaganMissionPhase.Complete)
            throttle = 0;
        else if (surface == FireBossSurfaceMode.Water)
            throttle = Math.Clamp(.78 + (gate.TargetSpeedMps - aircraft.TrueAirspeedMps) * .045, .42, .95);
        else
            throttle = Math.Clamp((phase is OkanaganMissionPhase.JoinScoop or OkanaganMissionPhase.Approach ? .46 : .64)
                + (gate.TargetSpeedMps - aircraft.TrueAirspeedMps) * .032 + Math.Max(0, verticalSpeed) * .018, .12, 1);
        if (!double.IsNaN(landingHeight))
            throttle = Math.Clamp(.25 + (gate.TargetSpeedMps - aircraft.TrueAirspeedMps) * .05, .02, .75);
        if (verticalSpeed < -4) throttle = Math.Min(throttle, .25);
        // The salvo leaves in about 1.6 s (roughly 90 m of track), so open the doors about two
        // seconds short of the aim and the load straddles it rather than landing 100 m early.
        bool drop = phase == OkanaganMissionPhase.Drop && HorizontalDistance(position, state.DropAimWorldM) < 110
            || phase == OkanaganMissionPhase.Downwind && aircraft.WaterLoadKg > 300
                && (gate.Id == "training-drop" && distance <= gate.RadiusM + 250 || state.ActiveGateIndex >= 2);
        // Follow the player's recovery-load advice only over the actual central lake. This
        // jettison earns no work completion; the flight tests still require the incident drop.
        drop |= OkanaganFireMission.NeedsRecoveryLoadRelease(phase, aircraft)
            && OkanaganGeo.IsOverCentralLake(position);
        return new(pitch, roll, onSurface ? Math.Clamp(headingError / .28, -1, 1) : 0,
            throttle, phase == OkanaganMissionPhase.Scoop && surface == FireBossSurfaceMode.Water, drop);
    }

    static double HorizontalDistance(Vec3D left, Vec3D right) =>
        Math.Sqrt(Math.Pow(left.X - right.X, 2) + Math.Pow(left.Z - right.Z, 2));
}
