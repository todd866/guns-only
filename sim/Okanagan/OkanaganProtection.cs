namespace GunsOnly.Sim.Okanagan;

public readonly record struct OkanaganSiteSnapshot(string Id, string Name, string Kind, Vec3D Position,
    double Integrity, double Wetness, double Threat, bool EverThreatened, string Status);

/// <summary>Game-scale exposure and wetting. No real building fire-resistance rating is implied.
/// Surviving sites are reported as intact/damaged; we do not infer counterfactual houses saved.</summary>
public sealed class OkanaganProtection
{
    sealed class State(OkanaganSite site) {
        public readonly OkanaganSite Site = site;
        public double Integrity = 1, Wetness, Threat;
        public bool EverThreatened;
    }
    readonly State[] _sites;
    public OkanaganProtection(IReadOnlyList<OkanaganSite> sites) => _sites = sites.Select(s => new State(s)).ToArray();
    public void Step(double seconds, OkanaganFireGrid fire)
    {
        if (!double.IsFinite(seconds) || seconds < 0) throw new ArgumentOutOfRangeException(nameof(seconds));
        foreach (State s in _sites) {
            s.Threat = fire.ExposureAt(s.Site.Position);
            s.EverThreatened |= s.Threat > 0.08;
            s.Wetness = Math.Max(0, s.Wetness - seconds / 210);
            // Wetting delays damage; lost structures cannot be resurrected by a later drop.
            s.Integrity = Math.Max(0, s.Integrity - Math.Max(0, s.Threat - 0.055) * (1 - s.Wetness * .92) * seconds / 95);
        }
    }
    public void ApplyWater(in Vec3D position, double waterKg)
    {
        if (!double.IsFinite(waterKg) || waterKg <= 0) return;
        foreach (State s in _sites) {
            double weight = Math.Max(0, 1 - OkanaganIncident.HorizontalDistance(s.Site.Position, position) / 185);
            if (s.Integrity > 0) s.Wetness = Math.Min(1, s.Wetness + waterKg * weight / 430);
        }
    }
    public IReadOnlyList<OkanaganSiteSnapshot> Snapshot() => _sites.Select(s => new OkanaganSiteSnapshot(
        s.Site.Id, s.Site.Name, s.Site.Kind, s.Site.Position, s.Integrity, s.Wetness, s.Threat, s.EverThreatened,
        s.Integrity <= 0 ? "lost" : s.Integrity < .95 ? "damaged" : "intact")).ToArray();
    public double OutcomeScore {
        get {
            double exposedValue = _sites.Where(s => s.EverThreatened).Sum(s => s.Site.Value);
            return exposedValue == 0 ? 0 : Math.Round(800 * _sites.Where(s => s.EverThreatened)
                .Sum(s => s.Site.Value * s.Integrity) / exposedValue);
        }
    }
}
