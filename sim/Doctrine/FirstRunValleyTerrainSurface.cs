using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Doctrine;

/// <summary>
/// Authority-owned terrain relief for the first-flight corridor.
///
/// The Ukraine atlas contains a real drainage draw at this location, but its shallow banks do not
/// read as a valley from a fast jet at the authored eye height. This bounded overlay turns it into
/// a long river-cut canyon with one wide floor, a composite of broad meanders, stratified walls and
/// occasional side-cut openings. The browser constructs its ridge mesh from this same versioned,
/// published profile, so collision, Auto-GCAS, masking and presentation describe one landscape
/// rather than a decorative canyon that can be flown through.
/// </summary>
public sealed class FirstRunValleyTerrainSurface : ITerrainSurface {
    const double NormalDerivativeHalfStepM = 2.0;
    readonly ITerrainSurface _source;

    public const int GeometryVersion = 2;
    public const int CentrelineComponentCount = 3;
    public const double FloorHeightM = 150.0;
    public const double FloorBlendDropM = 70.0;
    // A 680 m floor keeps the line deliberate while retaining recovery room at 420 KCAS.
    public const double FloorHalfWidthM = 340.0;
    public const double CrestOffsetM = 900.0;
    public const double OuterOffsetM = 2_400.0;
    public const double WestRidgeRiseM = 800.0;
    public const double EastRidgeRiseM = 700.0;
    public const double CentreCurveAmplitudeM = 1_200.0;
    public const double CentreCurveWavelengthM =
        FirstRunValleyRuntime.PopOutNorthM - FirstRunValleyRuntime.PlayerNorthM;
    public const double StrataStepHeightM = 26.0;
    public const double StrataBenchFraction = 0.22;
    public const double SideCutDepth01 = 0.78;
    public const double SouthExtentNorthM = FirstRunValleyRuntime.PlayerNorthM - 1_800.0;
    public const double SouthFullNorthM = FirstRunValleyRuntime.PlayerNorthM - 600.0;
    public const double PopOutFadeStartNorthM = FirstRunValleyRuntime.PopOutNorthM - 2_400.0;
    public const double NorthExtentNorthM = FirstRunValleyRuntime.PopOutNorthM + 750.0;

    readonly record struct SideCut(
        double Progress01,
        double HalfSpan01,
        int Side,
        double RelativeDepth01);

    // Tributary mouths alternate sides and widths. They lower a wall; they never alter the broad
    // centre floor or create a false pass-through opening in only one renderer.
    static readonly SideCut[] SideCuts = {
        new(0.18, 0.034, -1, 0.82),
        new(0.39, 0.046,  1, 1.00),
        new(0.64, 0.040, -1, 0.91),
        new(0.82, 0.032,  1, 0.76),
    };
    public static int SideCutCount => SideCuts.Length;

    readonly record struct Butte(
        double Progress01,
        double HalfSpan01,
        int Side,
        double Offset01,
        double HalfWidthM,
        double RelativeRise01);

    // Outer-shelf remnants make the silhouette read as eroded canyon country rather than two
    // continuous berms. Each is still part of collision authority, never a decorative prop.
    static readonly Butte[] Buttes = {
        new(0.29, 0.040,  1, 0.72, 500.0, 0.28),
        new(0.55, 0.050, -1, 0.76, 650.0, 0.34),
        new(0.74, 0.038,  1, 0.70, 480.0, 0.24),
    };
    public static int ButteCount => Buttes.Length;

    public FirstRunValleyTerrainSurface(ITerrainSurface source) {
        _source = source ?? throw new ArgumentNullException(nameof(source));
    }

    public ITerrainSurface Source => _source;
    public TerrainBounds Bounds => _source.Bounds;
    public double HorizontalResolutionM => Math.Min(_source.HorizontalResolutionM, 25.0);
    public double MaximumHeightM => Math.Max(
        _source.MaximumHeightM,
        // Ridge and face variation can combine to ~1.26, then a west butte adds another 0.34.
        // Keep the broad-phase ceiling conservative; under-reporting here could hide real terrain.
        FloorHeightM + Math.Max(WestRidgeRiseM, EastRidgeRiseM) * 1.75);

    public bool TrySample(double eastM, double northM, out TerrainSample sample) {
        if (!_source.TrySample(eastM, northM, out TerrainSample sourceSample)) {
            sample = default;
            return false;
        }
        double heightM = Math.Max(sourceSample.HeightM, AuthoredHeightM(eastM, northM));
        if (heightM <= sourceSample.HeightM + 1e-9) {
            sample = sourceSample;
            return true;
        }

        double eastMinusM = Math.Max(Bounds.MinimumEastM,
            eastM - NormalDerivativeHalfStepM);
        double eastPlusM = Math.Min(Bounds.MaximumEastM,
            eastM + NormalDerivativeHalfStepM);
        double northMinusM = Math.Max(Bounds.MinimumNorthM,
            northM - NormalDerivativeHalfStepM);
        double northPlusM = Math.Min(Bounds.MaximumNorthM,
            northM + NormalDerivativeHalfStepM);
        TryHeightM(eastMinusM, northM, out double eastMinusHeightM);
        TryHeightM(eastPlusM, northM, out double eastPlusHeightM);
        TryHeightM(eastM, northMinusM, out double northMinusHeightM);
        TryHeightM(eastM, northPlusM, out double northPlusHeightM);
        double eastSlope = (eastPlusHeightM - eastMinusHeightM)
            / Math.Max(1e-9, eastPlusM - eastMinusM);
        double northSlope = (northPlusHeightM - northMinusHeightM)
            / Math.Max(1e-9, northPlusM - northMinusM);
        sample = new TerrainSample(heightM,
            new Vec3D(-eastSlope, 1.0, -northSlope).Normalized(),
            TerrainSurfaceKind.Land);
        return true;
    }

    public bool TryHeightM(double eastM, double northM, out double heightM) {
        if (!_source.TryHeightM(eastM, northM, out double sourceHeightM)) {
            heightM = 0.0;
            return false;
        }
        heightM = Math.Max(sourceHeightM, AuthoredHeightM(eastM, northM));
        return true;
    }

    /// <summary>The analytic ridge height before it is composited over the shipped atlas.</summary>
    public static double AuthoredHeightM(double eastM, double northM) {
        if (!double.IsFinite(eastM) || !double.IsFinite(northM)
            || northM <= SouthExtentNorthM || northM >= NorthExtentNorthM)
            return double.NegativeInfinity;

        double centreEastM = CentreEastM(northM);
        double signedOffsetM = eastM - centreEastM;
        double offsetM = Math.Abs(signedOffsetM);
        if (offsetM >= OuterOffsetM)
            return double.NegativeInfinity;

        double southEnvelope = SmoothStep(
            SouthExtentNorthM, SouthFullNorthM, northM);
        double northEnvelope = 1.0 - SmoothStep(
            PopOutFadeStartNorthM, NorthExtentNorthM, northM);
        double longitudinalEnvelope = southEnvelope * northEnvelope;
        if (longitudinalEnvelope <= 0.0) return double.NegativeInfinity;

        double corridorFloorBlend = 1.0
            - SmoothStep(FloorHalfWidthM, OuterOffsetM, offsetM);
        double authoredFloorM = FloorHeightM
            - FloorBlendDropM * (1.0 - longitudinalEnvelope * corridorFloorBlend);
        double innerRise = SmoothStep(FloorHalfWidthM, CrestOffsetM, offsetM);
        double outerFall = 1.0 - SmoothStep(CrestOffsetM, OuterOffsetM, offsetM);
        double crossSection = innerRise * outerFall;
        double sideRiseM = signedOffsetM < 0.0 ? WestRidgeRiseM : EastRidgeRiseM;
        double sidePhase = signedOffsetM < 0.0 ? 0.35 : 2.15;
        double ridgeVariation = 1.0
            + 0.105 * Math.Sin((northM - FirstRunValleyRuntime.PlayerNorthM) / 1_180.0
                + sidePhase)
            + 0.045 * Math.Sin((northM - FirstRunValleyRuntime.PlayerNorthM) / 470.0
                - sidePhase * 0.6);
        // Broad diagonal ribs keep the long faces from reading as extruded walls. They remain
        // analytic and bounded, so the browser, collision and Auto-GCAS all see the same rock.
        double faceRuggedness = 1.0
            + 0.065 * Math.Sin(offsetM / 310.0
                + (northM - FirstRunValleyRuntime.PlayerNorthM) / 540.0
                + sidePhase * 1.8)
            + 0.030 * Math.Sin(offsetM / 145.0
                - (northM - FirstRunValleyRuntime.PlayerNorthM) / 260.0
                - sidePhase);
        double wallRiseM = sideRiseM * crossSection * longitudinalEnvelope
            * ridgeVariation * faceRuggedness
            + ButteRiseM(signedOffsetM, northM) * longitudinalEnvelope;
        double stratifiedRiseM = StratifiedWallRiseM(Math.Max(0.0, wallRiseM));
        double sideCutOpening01 = SideCutOpening01(signedOffsetM, northM);
        return authoredFloorM
            + stratifiedRiseM * (1.0 - sideCutOpening01);
    }

    /// <summary>Broad asymmetric drainage meanders; the entry and mouth point nearly north.</summary>
    public static double CentreEastM(double northM) {
        double progress = Math.Clamp(
            (northM - FirstRunValleyRuntime.PlayerNorthM) / CentreCurveWavelengthM,
            0.0,
            1.0);
        double entryMouthEnvelope = Math.Pow(Math.Sin(Math.PI * progress), 2.0);
        double offset01 = entryMouthEnvelope * (
            0.70 * Math.Sin(3.0 * Math.PI * progress)
            + 0.16 * Math.Sin(Math.PI * progress + 0.50)
            + 0.06 * Math.Sin(5.0 * Math.PI * progress - 0.80));
        return FirstRunValleyRuntime.ValleyEastM + CentreCurveAmplitudeM * offset01;
    }

    /// <summary>
    /// Converts a smooth wall rise into continuous shelves separated by steeper strata faces.
    /// The function reaches the exact next band at its boundary, avoiding collision cracks.
    /// </summary>
    public static double StratifiedWallRiseM(double smoothRiseM) {
        if (!double.IsFinite(smoothRiseM) || smoothRiseM <= 0.0) return 0.0;
        double band = Math.Floor(smoothRiseM / StrataStepHeightM);
        double bandBaseM = band * StrataStepHeightM;
        double phase01 = (smoothRiseM - bandBaseM) / StrataStepHeightM;
        double steppedPhase01 = SmoothStep(StrataBenchFraction, 1.0, phase01);
        return bandBaseM + StrataStepHeightM * steppedPhase01;
    }

    /// <summary>Fraction of the local wall removed by a versioned tributary opening.</summary>
    public static double SideCutOpening01(double signedOffsetM, double northM) {
        if (!double.IsFinite(signedOffsetM) || !double.IsFinite(northM)) return 0.0;
        double progress01 = (northM - FirstRunValleyRuntime.PlayerNorthM)
            / CentreCurveWavelengthM;
        if (progress01 <= 0.0 || progress01 >= 1.0) return 0.0;
        int side = signedOffsetM < 0.0 ? -1 : 1;
        double offsetM = Math.Abs(signedOffsetM);
        double wall01 = SmoothStep(FloorHalfWidthM * 0.88, CrestOffsetM, offsetM)
            * (1.0 - SmoothStep(CrestOffsetM * 1.08, OuterOffsetM, offsetM));
        if (wall01 <= 0.0) return 0.0;
        double opening01 = 0.0;
        foreach (SideCut cut in SideCuts) {
            if (cut.Side != side) continue;
            double distance01 = Math.Abs(progress01 - cut.Progress01);
            double along01 = 1.0 - SmoothStep(0.0, cut.HalfSpan01, distance01);
            opening01 = Math.Max(opening01,
                SideCutDepth01 * cut.RelativeDepth01 * along01 * wall01);
        }
        return Math.Clamp(opening01, 0.0, 0.92);
    }

    /// <summary>Authority height added by isolated outer-shelf erosional remnants.</summary>
    public static double ButteRiseM(double signedOffsetM, double northM) {
        if (!double.IsFinite(signedOffsetM) || !double.IsFinite(northM)) return 0.0;
        double progress01 = (northM - FirstRunValleyRuntime.PlayerNorthM)
            / CentreCurveWavelengthM;
        if (progress01 <= 0.0 || progress01 >= 1.0) return 0.0;
        int side = signedOffsetM < 0.0 ? -1 : 1;
        double offsetM = Math.Abs(signedOffsetM);
        double riseM = 0.0;
        foreach (Butte butte in Buttes) {
            if (butte.Side != side) continue;
            double along01 = 1.0 - SmoothStep(0.0, butte.HalfSpan01,
                Math.Abs(progress01 - butte.Progress01));
            double across01 = 1.0 - SmoothStep(0.0, butte.HalfWidthM,
                Math.Abs(offsetM - OuterOffsetM * butte.Offset01));
            double sideRiseM = side < 0 ? WestRidgeRiseM : EastRidgeRiseM;
            riseM = Math.Max(riseM,
                sideRiseM * butte.RelativeRise01 * along01 * across01);
        }
        return Math.Max(0.0, riseM);
    }

    static double SmoothStep(double edge0, double edge1, double value) {
        if (edge1 <= edge0) return value >= edge1 ? 1.0 : 0.0;
        double t = Math.Clamp((value - edge0) / (edge1 - edge0), 0.0, 1.0);
        return t * t * (3.0 - 2.0 * t);
    }
}
