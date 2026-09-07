using GunsOnly.Sim.Okanagan;

namespace GunsOnly.Sim.Tests.Okanagan;

// Regression pilot: ordinary physical commands at 10 Hz, never a pose or phase injection.
// The energy floor is specific to this loaded Fire Boss, not a shared-aircraft assumption.
internal sealed class OkanaganTestPilot
{
    const double Degrees = Math.PI / 180;
    static double Wrap(double value) => Math.Atan2(Math.Sin(value), Math.Cos(value));

    double _verticalTrim;
    OkanaganMissionPhase? _lastPhase;

    public FireBossPilotCommand Command(OkanaganMissionSnapshot state)
    {
        if (state.Route.Count == 0) return new(0, 0, 0, 0, false, false);
        var aircraft = state.Aircraft;
        var phase = state.Phase;
        if (_lastPhase != phase) { _verticalTrim = 0; _lastPhase = phase; }
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
        double bank = onSurface ? 0 : Math.Clamp(headingError * 1.55, -maxBank * Degrees, maxBank * Degrees);
        double roll = onSurface ? 0 : Math.Clamp(Wrap(bank - aircraft.RollRad) / (24 * Degrees), -1, 1);
        double verticalSpeed = 0, pitch = 0;
        if (surface == FireBossSurfaceMode.Runway && phase == OkanaganMissionPhase.Depart)
            pitch = aircraft.TrueAirspeedMps >= 38 ? .55 : .34;
        else if (surface == FireBossSurfaceMode.Water && phase == OkanaganMissionPhase.Climb)
            pitch = .72;
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
            double compensation = (1 / Math.Max(.42, Math.Cos(Math.Clamp(Math.Abs(aircraft.RollRad),
                0, 65 * Degrees))) - 1) / 2.5;
            double verticalError = verticalSpeed - aircraft.VerticalSpeedMps;
            _verticalTrim = Math.Clamp(_verticalTrim + verticalError * .015 * .1, -.6, .28);
            pitch = Math.Clamp(verticalError / 15 + compensation + _verticalTrim, -.75, .7);
        }
        double throttle;
        if (phase == OkanaganMissionPhase.Climb
            || surface == FireBossSurfaceMode.Runway && phase == OkanaganMissionPhase.Depart)
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
        return new(pitch, roll, onSurface ? Math.Clamp(headingError / .28, -1, 1) : 0,
            throttle, phase == OkanaganMissionPhase.Scoop && surface == FireBossSurfaceMode.Water, drop);
    }

    static double HorizontalDistance(Vec3D left, Vec3D right) =>
        Math.Sqrt(Math.Pow(left.X - right.X, 2) + Math.Pow(left.Z - right.Z, 2));
}
