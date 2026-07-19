using System.Collections.ObjectModel;

namespace GunsOnly.Sim.Propulsion;

/// <summary>
/// A value transcribed from a published engine-performance table. Fuel flow is retained in the
/// source table's lb/hr unit here; the runtime API exposes lb/min.
/// </summary>
public readonly record struct J47PublishedRow(
    string DocumentId,
    string Locator,
    int? Run,
    double AltitudeFt,
    double Mach,
    double Rpm,
    double NetThrustLbf,
    double FuelFlowLbPerHour,
    string Notes = "");

internal readonly record struct J47CurvePoint(
    double Rpm,
    double NetThrustLbf,
    double FuelFlowLbPerHour);

internal sealed record J47Curve(
    double AltitudeFt,
    double Mach,
    J47CurvePoint[] Points);

/// <summary>
/// Checked-in J47 source data and its provenance. The runtime never reads external files, so the
/// same inputs produce the same IEEE-754 operations in desktop and WASM builds.
/// </summary>
public static class J47MapData
{
    public const string Ge27DocumentId = "NASA CR-137674";
    public const string Ge27DocumentUrl =
        "https://ntrs.nasa.gov/api/citations/19760003002/downloads/19760003002.pdf";
    public const string J47DDocumentId = "NACA RM E51B06";
    public const string J47DDocumentUrl =
        "https://ntrs.nasa.gov/api/citations/19930086756/downloads/19930086756.pdf";
    public const string HighMachDocumentId = "NACA RM E9G09";
    public const string HighMachDocumentUrl =
        "https://ntrs.nasa.gov/api/citations/19930093773/downloads/19930093773.pdf";

    // CR-137674's J47-GE-27/F-86F sheet: 5,970 lbf and 1.060 lb/(lbf hr).
    public const double Ge27RatedNetThrustLbf = 5970.0;
    public const double Ge27RatedSpecificFuelConsumption = 1.060;
    public const double Ge27RatedFuelFlowLbPerHour =
        Ge27RatedNetThrustLbf * Ge27RatedSpecificFuelConsumption;
    public const double Ge27RatedFuelFlowLbPerMinute = Ge27RatedFuelFlowLbPerHour / 60.0;

    // E51B06 runs cluster around 7,950 rpm at rated power. 7,955 is the complete Run 9
    // measurement used to invert net thrust into the compatibility power fraction.
    public const double RatedRpm = 7955.0;
    public const double IdleRpm = 2864.0; // 36.0%: midpoint of the F-86F manual's 34-38% idle band.

    static J47PublishedRow E51(int run, double altitudeFt, double mach, double rpm,
        double thrustLbf, double fuelLbPerHour, string notes = "") => new(
            J47DDocumentId, "Table I - Engine Performance Data", run,
            altitudeFt, mach, rpm, thrustLbf, fuelLbPerHour, notes);

    static J47PublishedRow E9(int run, double altitudeFt, double mach, double rpm,
        double thrustLbf, double fuelLbPerHour) => new(
            HighMachDocumentId, "Table I - Engine Performance Data", run,
            altitudeFt, mach, rpm, thrustLbf, fuelLbPerHour);

    // Rows are ordered by RPM so bounded piecewise-linear interpolation is deterministic.
    static readonly J47PublishedRow[] Low6000Rows =
    {
        E51(19, 6000, .197, 2000,   27,  508),
        E51(18, 6000, .190, 3147,  178,  855),
        E51(17, 6000, .177, 4098,  422, 1115),
        E51(16, 6000, .190, 5114,  962, 1475),
        E51(15, 6000, .180, 5944, 1791, 2115),
        E51(14, 6000, .173, 6643, 2742, 2930),
        E51(13, 6000, .164, 6993, 3209, 3390),
        E51(12, 6000, .169, 7386, 3683, 3970),
        E51(11, 6000, .169, 7692, 4096, 4505),
        E51( 9, 6000, .173, 7955, 4284, 4890),
    };

    static readonly J47PublishedRow[] Low15000Rows =
    {
        E51(30, 15000, .197, 1750,  -19,  330),
        E51(29, 15000, .207, 3147,  160,  667),
        E51(28, 15000, .194, 4091,  313,  820),
        E51(27, 15000, .201, 5114,  725, 1080),
        E51(26, 15000, .183, 5944, 1355, 1570),
        E51(25, 15000, .180, 6643, 2045, 2150),
        E51(24, 15000, .169, 6993, 2402, 2500),
        E51(23, 15000, .173, 7386, 2808, 2970),
        E51(22, 15000, .159, 7692, 3173, 3455),
        E51(20, 15000, .164, 7825, 3437, 3915),
    };

    static readonly J47PublishedRow[] MachHalf15000Rows =
    {
        E51(35, 15000, .509, 6643, 1749, 2275),
        E51(34, 15000, .510, 6993, 2134, 2705),
        E51(33, 15000, .509, 7386, 2545, 3155),
        E51(32, 15000, .500, 7692, 2956, 3680),
        E51(31, 15000, .509, 7955, 3357, 4310),
    };

    static readonly J47PublishedRow[] Low25000Rows =
    {
        E51(45, 25000, .197, 2046,  -15,  302),
        E51(44, 25000, .207, 3147,   70,  521),
        E51(43, 25000, .190, 4091,  192,  638),
        E51(42, 25000, .194, 5114,  495,  796),
        E51(41, 25000, .176, 5944,  940, 1113),
        E51(40, 25000, .176, 6643, 1369, 1536),
        E51(39, 25000, .176, 6993, 1599, 1764),
        E51(38, 25000, .173, 7386, 1901, 2125),
        E51(37, 25000, .180, 7692, 2113, 2460,
            "Mach digit corrected from a degraded scan; grouped with the nominal M=0.176 sweep."),
        E51(36, 25000, .176, 7875, 2283, 2690),
    };

    static readonly J47PublishedRow[] MachHalf25000Rows =
    {
        E51(53, 25000, .526, 4091,   15,  482),
        E51(52, 25000, .521, 5114,  300,  676),
        E51(51, 25000, .511, 5944,  767, 1113),
        E51(50, 25000, .509, 6643, 1326, 1656),
        E51(49, 25000, .508, 6993, 1614, 1985),
        E51(48, 25000, .509, 7386, 1980, 2440),
        E51(47, 25000, .511, 7692, 2256, 2845),
        E51(46, 25000, .500, 7900, 2483, 3225),
    };

    static readonly J47PublishedRow[] Mach07125000Rows =
    {
        E51(59, 25000, .716, 5944,  723, 1105),
        E51(58, 25000, .719, 6643, 1419, 1855),
        E51(57, 25000, .709, 6993, 1771, 2220),
        E51(56, 25000, .711, 7386, 2168, 2720),
        E51(55, 25000, .711, 7692, 2454, 3175),
        E51(54, 25000, .711, 7900, 2660, 3470),
    };

    static readonly J47PublishedRow[] Low35000Rows =
    {
        E51(66, 35000, .159, 6643,  942, 1003),
        E51(65, 35000, .159, 6993, 1100, 1184),
        E51(64, 35000, .176, 7386, 1261, 1429),
        E51(63, 35000, .159, 7692, 1459, 1741),
    };

    static readonly J47PublishedRow[] Low45000Rows =
    {
        E51(78, 45000, .200, 5114, 208,  454),
        E51(77, 45000, .216, 5455, 266,  490),
        E51(76, 45000, .190, 5944, 383,  557),
        E51(74, 45000, .180, 6500, 548,  680),
        E51(73, 45000, .183, 6643, 600,  701),
        E51(72, 45000, .190, 6993, 658,  796),
        E51(70, 45000, .169, 7383, 797,  979),
        E51(67, 45000, .180, 7525, 869, 1008),
    };

    // E9G09 is used only beyond E51B06's M=0.711 limit. At 25,000 ft the two reports'
    // low-Mach curves agree closely, making the ratios a bounded transonic extension rather
    // than an absolute re-rating of the GE-27 calibration.
    static readonly J47PublishedRow[] Mach08525000Rows =
    {
        E9(58, 25000, .855, 5024, -172,  346),
        E9(57, 25000, .850, 5944,  526,  970),
        E9(56, 25000, .850, 6459, 1144, 1680),
        E9(55, 25000, .850, 6993, 1785, 2420),
        E9(54, 25000, .855, 7500, 2217, 3050),
        E9(53, 25000, .850, 7895, 2647, 3660),
    };

    static readonly J47PublishedRow[] Mach097525000Rows =
    {
        E9(62, 25000, .975, 6993, 1988, 2640),
        E9(61, 25000, .975, 7500, 2479, 3400),
        E9(60, 25000, .965, 7692, 2674, 3730),
        E9(59, 25000, .982, 7895, 2843, 4000),
    };

    static J47Curve ToCurve(double altitudeFt, double mach, J47PublishedRow[] rows)
    {
        var points = new J47CurvePoint[rows.Length];
        for (int i = 0; i < rows.Length; i++)
            points[i] = new(rows[i].Rpm, rows[i].NetThrustLbf, rows[i].FuelFlowLbPerHour);
        return new J47Curve(altitudeFt, mach, points);
    }

    static J47CurvePoint SampleRows(J47PublishedRow[] rows, double rpm)
    {
        if (rpm <= rows[0].Rpm)
            return new(rows[0].Rpm, rows[0].NetThrustLbf, rows[0].FuelFlowLbPerHour);
        if (rpm >= rows[^1].Rpm)
            return new(rows[^1].Rpm, rows[^1].NetThrustLbf, rows[^1].FuelFlowLbPerHour);

        for (int i = 1; i < rows.Length; i++)
        {
            if (rpm > rows[i].Rpm) continue;
            J47PublishedRow a = rows[i - 1], b = rows[i];
            double t = (rpm - a.Rpm) / (b.Rpm - a.Rpm);
            return new(rpm,
                a.NetThrustLbf + (b.NetThrustLbf - a.NetThrustLbf) * t,
                a.FuelFlowLbPerHour + (b.FuelFlowLbPerHour - a.FuelFlowLbPerHour) * t);
        }
        throw new InvalidOperationException("J47 source rows must be sorted by RPM.");
    }

    static J47Curve BuildSeaLevelStaticCurve()
    {
        double[] rpms = { IdleRpm, 3147, 4098, 5114, 5944, 6643, 6993, 7386, 7692, RatedRpm };
        J47CurvePoint idle = SampleRows(Low6000Rows, IdleRpm);
        J47CurvePoint full = SampleRows(Low6000Rows, RatedRpm);
        double usableSourceThrust = full.NetThrustLbf - idle.NetThrustLbf;
        double fuelScale = Ge27RatedFuelFlowLbPerHour / full.FuelFlowLbPerHour;
        var points = new J47CurvePoint[rpms.Length];

        for (int i = 0; i < rpms.Length; i++)
        {
            J47CurvePoint source = SampleRows(Low6000Rows, rpms[i]);
            double power = Math.Clamp(
                (source.NetThrustLbf - idle.NetThrustLbf) / usableSourceThrust, 0.0, 1.0);
            points[i] = new(rpms[i],
                power * Ge27RatedNetThrustLbf,
                source.FuelFlowLbPerHour * fuelScale);
        }
        // Preserve the published multiplication exactly at the rated anchor.
        points[^1] = new(RatedRpm, Ge27RatedNetThrustLbf, Ge27RatedFuelFlowLbPerHour);
        return new J47Curve(0.0, 0.0, points);
    }

    internal static readonly J47Curve SeaLevelStaticCurve = BuildSeaLevelStaticCurve();

    internal static readonly J47Curve[] LowMachCurves =
    {
        SeaLevelStaticCurve,
        ToCurve( 6000, .173, Low6000Rows),
        ToCurve(15000, .164, Low15000Rows),
        ToCurve(25000, .176, Low25000Rows),
        ToCurve(35000, .159, Low35000Rows),
        ToCurve(45000, .180, Low45000Rows),
    };

    internal static readonly J47Curve[] MachHalfCurves =
    {
        ToCurve(15000, .509, MachHalf15000Rows),
        ToCurve(25000, .500, MachHalf25000Rows),
    };

    internal static readonly J47Curve[] Mach071Curves =
    {
        ToCurve(25000, .711, Mach07125000Rows),
    };

    internal static readonly J47Curve[] Mach085Curves =
    {
        ToCurve(25000, .850, Mach08525000Rows),
    };

    internal static readonly J47Curve[] Mach0975Curves =
    {
        ToCurve(25000, .975, Mach097525000Rows),
    };

    static IReadOnlyList<J47PublishedRow> BuildPublishedRows()
    {
        var rows = new List<J47PublishedRow>
        {
            new(Ge27DocumentId, "MARS data sheet: J47-GE-27, F86F", null,
                0.0, 0.0, RatedRpm, Ge27RatedNetThrustLbf, Ge27RatedFuelFlowLbPerHour,
                "Fuel flow is the published 5,970 lbf multiplied by the published 1.060 TSFC; " +
                "RPM is the E51B06 calibration schedule, not a CR-137674 field."),
        };

        J47PublishedRow[][] groups =
        {
            Low6000Rows, Low15000Rows, MachHalf15000Rows,
            Low25000Rows, MachHalf25000Rows, Mach07125000Rows,
            Low35000Rows, Low45000Rows, Mach08525000Rows, Mach097525000Rows,
        };
        foreach (J47PublishedRow[] group in groups)
            rows.AddRange(group);
        return new ReadOnlyCollection<J47PublishedRow>(rows);
    }

    public static IReadOnlyList<J47PublishedRow> PublishedRows { get; } = BuildPublishedRows();
}
