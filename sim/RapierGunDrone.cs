using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim;

/// <summary>
/// One Rapier reusable gun-drone: separate on inherited energy, commit with the gun, then light a
/// cheap turbine and RTB to intermittent pickup. Spec:
/// docs/superpowers/specs/2026-07-27-rapier-glide-drone-vertical-slice-design.md
/// </summary>
public enum RapierGunDronePhase {
    Separate,
    Commit,
    Screen,
    Rtb,
    Recovered,
    Lost
}

public sealed class RapierGunDrone {
    public const double SeparateHoldSeconds = 1.5;
    public const double SeparateAftM = 25.0;
    public const double SeparateBelowM = 12.0;
    public const double TurbineArmMach = 1.15;
    public const double TurbineArmAltitudeM = 12_000.0;
    public const double PickupRadiusM = 400.0;
    public const double PickupAltitudeSlackM = 200.0;
    public const double ThreatVolumeM = 8_000.0;
    public const int DefaultAmmo = 80;

    /// <summary>Quiet FARP ENU offset from the Rapier strip origin (not the arrestor).</summary>
    public static readonly Vec3D PickupOffsetFromStripM = new(-35_000.0, 180.0, -8_000.0);

    readonly AircraftParams _airframe;
    double _ageSeconds;
    PilotCommand _lastCommand;

    public RapierGunDrone(
        AircraftSim sim,
        GunKill gun,
        AircraftParams airframe,
        RapierGunDronePhase phase = RapierGunDronePhase.Separate) {
        Sim = sim ?? throw new ArgumentNullException(nameof(sim));
        Gun = gun ?? throw new ArgumentNullException(nameof(gun));
        _airframe = airframe;
        Phase = phase;
        _lastCommand = new PilotCommand(1.0, 0.0, 0.0, 0.0);
    }

    public AircraftSim Sim { get; }
    public GunKill Gun { get; }
    public RapierGunDronePhase Phase { get; private set; }
    public bool TurbineArmed { get; private set; }
    public bool StillActive => Phase is not RapierGunDronePhase.Recovered
        and not RapierGunDronePhase.Lost;
    public PilotCommand LastAppliedCommand => _lastCommand;

    public static RapierGunDrone SpawnFrom(
        in AircraftState carrier,
        IAtmosphereModel? atmosphere = null,
        int ammo = DefaultAmmo) {
        AircraftParams airframe = FlightModel.RapierGunDroneSurrogate;
        Vec3D forward = carrier.ForwardDir();
        Vec3D position = carrier.Position
            - forward * SeparateAftM
            + new Vec3D(0.0, -SeparateBelowM, 0.0);
        var state = new AircraftState(
            position,
            Math.Max(40.0, carrier.Speed),
            carrier.Gamma,
            carrier.Chi,
            carrier.Bank,
            airframe.MassKg);
        var sim = new AircraftSim(state, airframe, atmosphere ?? StandardAtmosphere1976.Instance);
        var gun = new GunKill(ammo, hitsToKill: 2);
        return new RapierGunDrone(sim, gun, airframe);
    }

    public static Vec3D PickupPoint(in Vec3D stripOrigin) =>
        stripOrigin + PickupOffsetFromStripM;

    public void Step(
        double dt,
        in AircraftState? target,
        bool targetAlive,
        in Vec3D pickup) {
        if (!StillActive) return;
        if (!double.IsFinite(dt) || dt <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(dt));
        _ageSeconds += dt;

        AtmosphericState air = Sim.AtmosphereModel.Sample(Sim.State.Position.Y);
        double mach = Sim.AirspeedMps / Math.Max(1.0, air.SpeedOfSoundMps);
        TurbineArmed = mach <= TurbineArmMach
            && Sim.State.Position.Y <= TurbineArmAltitudeM;

        if (Phase == RapierGunDronePhase.Separate) {
            if (_ageSeconds >= SeparateHoldSeconds)
                Phase = RapierGunDronePhase.Commit;
        }

        if (Phase == RapierGunDronePhase.Commit) {
            if (!targetAlive || Gun.AmmoRemaining <= 0)
                Phase = RapierGunDronePhase.Rtb;
        }

        if ((Phase is RapierGunDronePhase.Commit or RapierGunDronePhase.Screen)
            && !targetAlive) {
            Phase = RapierGunDronePhase.Rtb;
        }

        Vec3D aim = Phase == RapierGunDronePhase.Rtb
            ? pickup
            : targetAlive && target is AircraftState live
                ? live.Position
                : pickup;

        PilotCommand command;
        if (Phase == RapierGunDronePhase.Separate) {
            command = new PilotCommand(1.0, Sim.State.Bank, 0.0, 0.0);
        } else if (Phase == RapierGunDronePhase.Commit && targetAlive) {
            command = CommandToward(Sim.State, aim,
                desiredGamma: Math.Clamp(
                    Math.Atan2(aim.Y - Sim.State.Position.Y,
                        Math.Max(80.0, (aim - Sim.State.Position).Length * 0.35)),
                    -0.25, 0.12),
                throttle: TurbineArmed ? 0.85 : 0.0,
                maximumBankDegrees: 45.0);
        } else if (Phase == RapierGunDronePhase.Rtb) {
            command = CommandToward(Sim.State, aim,
                desiredGamma: Math.Clamp(
                    Math.Atan2(aim.Y - Sim.State.Position.Y,
                        Math.Max(200.0, (aim - Sim.State.Position).Length * 0.2)),
                    -0.15, 0.08),
                throttle: TurbineArmed ? 0.70 : 0.0,
                maximumBankDegrees: 35.0);
        } else {
            command = new PilotCommand(1.0, 0.0, TurbineArmed ? 0.55 : 0.0, 0.0);
        }

        _lastCommand = command;
        Sim.Step(command, dt);

        if (Phase == RapierGunDronePhase.Rtb && InsidePickup(pickup))
            Phase = RapierGunDronePhase.Recovered;

        if (Sim.State.Position.Y < 5.0)
            Phase = RapierGunDronePhase.Lost;
    }

    public bool InsideThreatVolume(in AircraftState contact) =>
        (contact.Position - Sim.State.Position).Length <= ThreatVolumeM;

    /// Relay attack adapter: the generic fighter pursuit law aims the velocity vector at
    /// a contact, which leaves the gun bore above a stationary gondola at high Mach.
    /// This uses the same airframe, separation, turbine gate and physical projectiles,
    /// but flies a lead-corrected body-axis command. It does not assign damage.
    public void StepRelay(double dt, in AircraftState target, bool targetAlive, in Vec3D pickup) {
        if (Phase != RapierGunDronePhase.Commit || !targetAlive || Gun.AmmoRemaining <= 0) {
            Step(dt, target, targetAlive, pickup);
            return;
        }
        var own = Sim.State;
        double range = (target.Position - own.Position).Length;
        double anticipation = Math.Min(.4, range / Math.Max(300, own.Speed) * .5);
        var predictedOwn = own with { Position = own.Position + own.VelocityVector() * anticipation };
        var predictedTarget = target with { Position = target.Position + target.VelocityVector() * anticipation };
        var aim = GunKill.EvaluateBallisticLead(predictedOwn, predictedTarget, Gun.Profile, 1.4).LeadDirection;
        double heading = Math.Atan2(aim.X, aim.Z);
        double error = Math.IEEERemainder(heading - Sim.BodyYawRad, 2 * Math.PI);
        double bank = Math.Clamp(Math.Atan(own.Speed / FlightModel.G0 * error * .2), -1.2, 1.2);
        double up = Math.Atan2(aim.Dot(Sim.BodyUp), Math.Max(.2, aim.Dot(Sim.BodyForward)));
        double q = .5 * Sim.AtmosphericState.DensityKgM3 * Sim.AirspeedMps * Sim.AirspeedMps;
        double mach = Sim.AirspeedMps / Sim.AtmosphericState.SpeedOfSoundMps;
        double alpha = Sim.AngleOfAttackRad + up - .08 * own.BodyRates.Q;
        double g = q * _airframe.WingAreaM2
            * (_airframe.ZeroLiftCoefficient + FlightModel.EffectiveClAlpha(_airframe, mach) * alpha)
            / (own.Mass * FlightModel.G0);
        if (range > 1500) {
            double gamma = Math.Clamp((target.Position.Y - 5 - own.Position.Y) / (own.Speed * 3), -.08, .08);
            g = (Math.Cos(own.Gamma) + own.Speed / FlightModel.G0 * .5 * (gamma - own.Gamma))
                / Math.Max(.3, Math.Cos(own.Bank));
        }
        TurbineArmed = mach <= TurbineArmMach && own.Position.Y <= TurbineArmAltitudeM;
        _lastCommand = new PilotCommand(Math.Clamp(g, -.5, _airframe.PositiveStructuralLimitG), bank, TurbineArmed ? .85 : 0, 0);
        Sim.Step(_lastCommand, dt);
        if (Sim.State.Position.Y < 5) Phase = RapierGunDronePhase.Lost;
    }

    bool InsidePickup(in Vec3D pickup) {
        Vec3D delta = Sim.State.Position - pickup;
        double horizontal = Math.Sqrt(delta.X * delta.X + delta.Z * delta.Z);
        return horizontal <= PickupRadiusM
            && Math.Abs(delta.Y) <= PickupAltitudeSlackM;
    }

    static PilotCommand CommandToward(
        in AircraftState own,
        in Vec3D waypoint,
        double desiredGamma,
        double throttle,
        double maximumBankDegrees) {
        Vec3D delta = waypoint - own.Position;
        double horizontal = Math.Sqrt(delta.X * delta.X + delta.Z * delta.Z);
        double desiredChi = horizontal > 1.0
            ? Math.Atan2(delta.X, delta.Z)
            : own.Chi;
        double headingError = Math.IEEERemainder(desiredChi - own.Chi, 2.0 * Math.PI);
        double bankTarget = Math.Clamp(
            headingError * 1.8,
            -maximumBankDegrees * Math.PI / 180.0,
            maximumBankDegrees * Math.PI / 180.0);
        double gammaError = desiredGamma - own.Gamma;
        double gDemand = Math.Clamp(1.0 + gammaError * 6.0, 0.55, 3.5);
        return new PilotCommand(
            GDemand: gDemand,
            BankTarget: bankTarget,
            Throttle: throttle,
            Rudder: 0.0);
    }
}
