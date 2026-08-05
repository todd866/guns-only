namespace GunsOnly.Sim.Motorcycle;

/// <summary>2020 Yamaha YZF-R1 sourced constants. See docs/vehicles/yamaha-yzf-r1/00-sources.md.</summary>
public static class YzfR1Definition
{
    public const string VehicleId = "yamaha-yzf-r1-2020";
    public const string DynamicsProviderId = "yzf-r1-single-track-v1";

    // --- Measured (OEM / published spec) ---
    public const double CurbMassKg = 203.2;           // measured (OEM curb / wet)
    public const double WheelbaseM = 1.405;           // measured
    public const double RakeRad = 24.0 * Math.PI / 180.0; // measured
    public const double TrailM = 0.102;               // measured
    public const double SeatHeightM = 0.856;          // measured
    public const double GroundClearanceM = 0.130;     // measured
    public const double FrontSuspensionTravelM = 0.119; // measured
    public const double RearSuspensionTravelM = 0.119;  // measured
    public const double PeakCrankPowerW = 200.0 * 745.7; // claimed crank hp → W
    public const double PeakPowerRpm = 13_500.0;      // measured (claimed)
    public const double PeakTorqueNm = 112.4;         // measured (claimed)
    public const double PeakTorqueRpm = 11_500.0;     // measured (claimed)
    public const int GearCount = 6;                   // measured
    public const double PrimaryReductionRatio = 1.634; // measured (67/41 published spec)
    public const double MaxLeanRad = 56.0 * Math.PI / 180.0; // measured (OEM lean claim)
    public const double FrontTireRadiusM = 0.300;     // derived from 120/70-ZR17
    public const double RearTireRadiusM = 0.320;    // derived from 190/55-ZR17

    // --- Provisional (default rider / presentation) ---
    public const double RiderMassKg = 80.0;           // provisional default rider
    public const double RiderCgLateralRangeM = 0.12;  // provisional hang-off envelope
    public const double RiderCgForeAftRangeM = 0.10;  // provisional fore/aft envelope
    public const double HeadStabilizationFraction = 0.25; // provisional helmet roll damping

    // --- Surrogate (pending handbook / dyno validation) ---
    public const double RedlineRpm = 14_500.0;        // surrogate pending handbook
    public const double IdleRpm = 2_000.0;            // surrogate warm idle
    public const double AutoUpshiftRpm = 12_000.0;    // surrogate auto-shift lower bound
    public const double AutoDownshiftRpm = 4_000.0;   // surrogate auto-shift upper bound
    public const double StallRpm = 1_200.0;           // surrogate manual-clutch stall threshold
    public const double EngineInertiaKgM2 = 0.055;    // surrogate crank/internals
    public const double CombinedCgHeightM = 0.585;    // surrogate bike + default rider
    public const double RollInertiaKgM2 = 95.0;       // surrogate roll axis
    public const double PitchInertiaKgM2 = 165.0;     // surrogate pitch axis
    public const double YawInertiaKgM2 = 110.0;       // surrogate yaw axis
    public const double FrontSpringRateNPerM = 18_000.0; // surrogate fork spring
    public const double RearSpringRateNPerM = 22_000.0;  // surrogate shock spring
    public const double FrontDamperCoefficientNPerMps = 1_800.0; // surrogate fork damper
    public const double RearDamperCoefficientNPerMps = 2_200.0;  // surrogate shock damper
    public const double FinalDriveRatio = 2.470;      // surrogate sprocket pair
    public const double TirePeakFrictionCoefficient = 1.05; // surrogate dry peak µ
    public const double TireLoadSensitivity = 0.85;   // surrogate Pacejka-like load exponent
    public const double TireCamberStiffnessNPerRad = 1_200.0; // surrogate camber thrust slope

    // --- Estimated (labelled estimates, not measured) ---
    public const double AeroDragAreaCdAM2 = 0.35;     // estimate: sport bike + tucked rider CdA
    public const double RollingResistanceCoefficient = 0.015; // estimate: sport radial on asphalt
    public const double EngineBrakingTorqueNmAtRedline = 20.0; // estimate: closed-throttle motoring

    /// <summary>Gearbox input→output ratios, 1st..6th. Surrogate — see 00-sources.md.</summary>
    public static readonly double[] GearRatios = [2.846, 2.200, 1.850, 1.600, 1.421, 1.320];

    public static double CombinedMassKg => CurbMassKg + RiderMassKg;

    /// <summary>Primary × gearbox × final-drive ratio for gear 1..<see cref="GearCount"/>.</summary>
    public static double TotalRatio(int gear)
    {
        if (gear is < 1 or > GearCount)
            throw new ArgumentOutOfRangeException(nameof(gear));
        return GearRatios[gear - 1] * PrimaryReductionRatio * FinalDriveRatio;
    }
}
