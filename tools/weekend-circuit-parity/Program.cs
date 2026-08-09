using GunsOnly.Sim.Motorcycle;
using System.Text;

// This tiny process is the renderer-neutral half of the export pipeline. The Node exporter
// consumes stdout immediately, then calls the real Web presentation builder. Keeping the route
// here prevents a copied JavaScript point list from becoming a second circuit authority.
string json = WeekendRouteContract.FromCircuit(PaintedCircuit.WeekendTrackDay()).ToJson();
if (args.Length == 2 && args[0] == "--output")
{
    File.WriteAllText(args[1], json, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
    return;
}
if (args.Length != 0)
    throw new ArgumentException("usage: WeekendCircuitRouteExport [--output PATH]");
Console.Write(json);
