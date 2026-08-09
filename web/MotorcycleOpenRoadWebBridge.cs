using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;
using GunsOnly.Sim.Motorcycle;

namespace GunsOnly.Web;

/// <summary>One-time immutable open-road graph handoff; never part of the 60 Hz snapshot.</summary>
[SupportedOSPlatform("browser")]
public static partial class MotorcycleWebBridge
{
    [JSExport]
    public static string GetRoadNetwork() =>
        WeekendRoadNetworkContract.FromDefaultWeekendWorld().ToJson();
}
