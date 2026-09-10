namespace GunsOnly.Sim.Okanagan;

public readonly record struct FireBossMissionPerformancePlan(
    double AltitudeM,
    double MaximumGrossMassKg,
    bool MeetsClimbRequirement,
    double ClimbRateMps,
    double AirspeedMps,
    double AngleOfAttackRad,
    double FlightPathAngleRad);

/// <summary>
/// A preflight performance allowance, not an in-flight controller. The 2.5 m/s climb requirement
/// makes the existing mission fuel-planning assumption explicit; 12 degrees of lift-vector bank
/// allows shallow climb turns. Both are exercise assumptions, not AT-802 operating limits.
/// Standard atmosphere, clean configuration, still air, and the existing full-power engine/polar
/// supply the force authority. Call once for the route altitude and retain the immutable result.
/// </summary>
public static class FireBossMissionPerformance
{
    public const double RequiredClimbMps = 2.5;
    public const double PlanningBankRad = 12 * Math.PI / 180;
    const int MassIterations = 18;
    const int SpeedIntervals = 64;
    const int IncidenceIterations = 28;
    const double MaximumSearchSpeedMps = 90;

    public static FireBossMissionPerformancePlan AtAltitude(double altitudeM)
    {
        if (!double.IsFinite(altitudeM) || altitudeM < 0 || altitudeM > 10_000)
            throw new ArgumentOutOfRangeException(nameof(altitudeM));
        var search = new Search(altitudeM);
        double upper = FireBossDynamics.MaximumGrossMassKg;
        Point upperPoint = search.BestAtMass(upper);
        if (upperPoint.ClimbRateMps >= RequiredClimbMps) return Plan(upper, upperPoint, true);

        double lower = FireBossDynamics.EmptyOperatingMassKg;
        Point lowerPoint = search.BestAtMass(lower);
        if (lowerPoint.ClimbRateMps < RequiredClimbMps) return Plan(0, lowerPoint, false);
        for (int iteration = 0; iteration < MassIterations; iteration++)
        {
            double mass = (lower + upper) * 0.5;
            Point candidate = search.BestAtMass(mass);
            if (candidate.ClimbRateMps >= RequiredClimbMps) { lower = mass; lowerPoint = candidate; }
            else upper = mass;
        }
        // Return the tested feasible side of the bracket, never an untested rounded-up mass.
        return Plan(lower, lowerPoint, true);

        FireBossMissionPerformancePlan Plan(double mass, Point point, bool feasible) => new(
            altitudeM, mass, feasible, point.ClimbRateMps, point.Speed, point.Alpha, point.Gamma);
    }

    readonly record struct Point(double ClimbRateMps, double Speed, double Alpha, double Gamma);

    sealed class Search
    {
        readonly AircraftParams _parameters = FlightModel.At802fFireBossPublicDataSurrogate;
        readonly double _altitude;
        readonly double _density;
        readonly AircraftSim _engine;

        internal Search(double altitude)
        {
            _altitude = altitude;
            _density = StandardAtmosphere1976.Instance.Sample(altitude).DensityKgM3;
            _engine = new AircraftSim(new AircraftState(new Vec3D(0, altitude, 0), 60,
                0, 0, 0, FireBossDynamics.MaximumGrossMassKg, QuaternionD.Identity), _parameters);
        }

        internal Point BestAtMass(double mass)
        {
            // Keep the entire search above 1.1 times the model's bank-adjusted stall speed.
            // No new flap state or published stall-speed interpretation is introduced here.
            double minimumSpeed = 1.1 * Math.Sqrt(2 * mass * FlightModel.G0
                / (_density * _parameters.WingAreaM2 * _parameters.CLMax * Math.Cos(PlanningBankRad)));
            Point best = new(double.NegativeInfinity, minimumSpeed, 0, 0);
            if (minimumSpeed > MaximumSearchSpeedMps) return best;
            for (int sample = 0; sample <= SpeedIntervals; sample++)
            {
                double speed = minimumSpeed + (MaximumSearchSpeedMps - minimumSpeed) * sample / SpeedIntervals;
                Point candidate = AtSpeed(mass, speed);
                if (candidate.ClimbRateMps > best.ClimbRateMps) best = candidate;
            }
            return best;
        }

        Point AtSpeed(double mass, double speed)
        {
            // This private engine instance is only evaluated at static candidate conditions.
            // It never advances the player, consumes mission fuel, or corrects a flown state.
            _engine.AdoptExternalKinematics(new AircraftState(new Vec3D(0, _altitude, 0), speed,
                0, 0, 0, mass, QuaternionD.Identity));
            _engine.SeedEnginePowerFraction(1);
            double thrust = _engine.LastEngineOperatingPoint.NetThrustN;
            double lower = (_parameters.CLMin - _parameters.ZeroLiftCoefficient) / _parameters.CLAlpha;
            double upper = (_parameters.CLMax - _parameters.ZeroLiftCoefficient) / _parameters.CLAlpha;
            double alpha = 0, gamma = 0;
            for (int iteration = 0; iteration < IncidenceIterations; iteration++)
            {
                alpha = (lower + upper) * 0.5;
                AeroResult force = Forces(mass, speed, alpha, thrust);
                // At level flight-path attitude, Z is along the relative wind. Rotate the
                // force-balanced path until gravity cancels excess thrust, then balance its
                // normal component. The X acceleration supplies the planned banked turn.
                gamma = Math.Asin(Math.Clamp(force.Accel.Z / FlightModel.G0, -0.99, 0.99));
                double normalResidual = force.Accel.Y + FlightModel.G0 * (1 - Math.Cos(gamma));
                if (normalResidual > 0) upper = alpha; else lower = alpha;
            }
            return new(speed * Math.Sin(gamma), speed, alpha, gamma);
        }

        AeroResult Forces(double mass, double speed, double alpha, double thrust)
        {
            var velocityDirection = new Vec3D(0, 0, 1);
            var liftDirection = new Vec3D(Math.Sin(PlanningBankRad), Math.Cos(PlanningBankRad), 0);
            Vec3D forward = velocityDirection * Math.Cos(alpha) + liftDirection * Math.Sin(alpha);
            Vec3D up = liftDirection * Math.Cos(alpha) - velocityDirection * Math.Sin(alpha);
            QuaternionD attitude = QuaternionD.FromFrame(up.Cross(forward), up, forward);
            var raw = new RawState(new Vec3D(0, _altitude, 0), velocityDirection * speed,
                PlanningBankRad, mass, attitude, default);
            return FlightModel.Aerodynamics(raw, new PilotCommand(1, PlanningBankRad, 1, 0,
                ElevatorControl: 0), _parameters, Vec3D.Zero, thrust, AirframeAerodynamicState.Clean);
        }
    }
}
