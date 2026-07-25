using GunsOnly.Sim;
using GunsOnly.Sim.Environment;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// What happens after an aircraft hits the ground.
///
/// The pilot's report was "crashing actually resulted in a smoking hole in the ground rather than
/// noclipping through the terrain". Detection was never the bug — SimulationSession.DetectNaturalSurface
/// samples ITerrainSurface correctly and returns ImpactSurface.Ground. The bug was everything after:
/// WreckContactMotion held no terrain at all, folded Ground into the carrier-deck contact mode, and
/// froze the surface height at the impact point. That gave every ground wreck an INFINITE FLAT PLANE
/// pinned to the altitude of whatever it first struck, so a ridge strike slid for kilometres at
/// constant altitude straight through the mountains beyond it.
///
/// These tests are written against terrain with real relief, because on flat ground the old model and
/// the new one are indistinguishable — which is exactly why the defect survived so long.
public class GroundImpactTests {
    readonly ITestOutputHelper _out;
    public GroundImpactTests(ITestOutputHelper output) => _out = output;

    /// A ridge running north-south: high in the west, dropping into a valley in the east. A wreck
    /// striking the crest and carrying east must follow the ground DOWN, not fly level over the valley.
    static ITerrainSurface RidgeAndValley() {
        const int Cells = 129;
        const double HalfExtentM = 32_768.0;
        var heights = new double[Cells, Cells];
        for (int north = 0; north < Cells; north++)
        for (int east = 0; east < Cells; east++) {
            double eastM = -HalfExtentM + east * (2.0 * HalfExtentM / (Cells - 1));
            // 1,400 m crest at x = -2,000 m falling to a 200 m valley floor to the east.
            heights[north, east] = eastM < -2_000.0
                ? 1_400.0
                : System.Math.Max(200.0, 1_400.0 - (eastM + 2_000.0) * 0.12);
        }
        // BilinearHeightGrid takes ORIGIN + SPACING, not bounds. Passing the half-extent as spacing
        // builds a 4,200 km grid at 32 km resolution, where a wreck's few hundred metres of travel
        // never leaves one flat cell — a terrain test that silently tests nothing.
        const double SpacingM = 2.0 * HalfExtentM / (Cells - 1);
        return new BilinearHeightGrid(-HalfExtentM, -HalfExtentM, SpacingM, SpacingM, heights);
    }

    static double GroundHeightAt(ITerrainSurface terrain, in Vec3D position) {
        Assert.True(terrain.TrySample(position.X, position.Z, out TerrainSample sample),
            "the test terrain must cover the wreck's whole travel");
        return sample.HeightM;
    }

    [Fact]
    public void AWreckSlidingOffARidgeFollowsTheGroundDownInsteadOfFlyingOverTheValley() {
        ITerrainSurface terrain = RidgeAndValley();
        var impact = new Vec3D(-2_100.0, 1_400.0, 0.0);
        // 250 m/s EAST in a shallow dive: the classic "flew it into the hill" arrival. Chi is the
        // track angle from north, so east is +pi/2 — with Chi = 0 the wreck slides north ALONG the
        // flat crest and never crosses the slope this test exists to check.
        var state = new AircraftState(impact, 250.0, -0.25, System.Math.PI / 2.0, 0.0,
            FlightModel.F22APublicDataSurrogate.MassKg);
        var wreck = new WreckContactMotion(state, ImpactSurface.Ground,
            Vec3D.Zero, 1_400.0, carrier: null, terrain: terrain);

        double worstPenetrationM = 0.0;
        double worstFloatM = 0.0;
        for (int tick = 0; tick < AircraftSim.TickHz * 40 && !wreck.Settled; tick++) {
            wreck.Step(1.0 / AircraftSim.TickHz);
            Vec3D position = wreck.State.Position;
            double clearanceM = position.Y - GroundHeightAt(terrain, position);
            worstPenetrationM = System.Math.Min(worstPenetrationM, clearanceM);
            worstFloatM = System.Math.Max(worstFloatM, clearanceM);
        }

        _out.WriteLine($"settled={wreck.Settled} at {wreck.State.Position}; "
            + $"worst penetration {worstPenetrationM:F2} m, worst float {worstFloatM:F2} m");
        // The whole defect in one number. The old model held Y at the 1,400 m crest while sliding
        // east, so by the valley floor it was hundreds of metres in the air.
        Assert.True(worstFloatM < 60.0,
            $"the wreck floated {worstFloatM:F0} m above the terrain — it is not following the ground");
        Assert.True(worstPenetrationM > -25.0,
            $"the wreck sank {-worstPenetrationM:F0} m into the terrain");
    }

    [Fact]
    public void AGroundWreckComesToRestOnTheHillsideBeneathIt() {
        ITerrainSurface terrain = RidgeAndValley();
        var impact = new Vec3D(-2_100.0, 1_400.0, 0.0);
        var state = new AircraftState(impact, 190.0, -0.35, System.Math.PI / 2.0, 0.0,
            FlightModel.F22APublicDataSurrogate.MassKg);
        var wreck = new WreckContactMotion(state, ImpactSurface.Ground,
            Vec3D.Zero, 1_400.0, carrier: null, terrain: terrain);

        for (int tick = 0; tick < AircraftSim.TickHz * 90 && !wreck.Settled; tick++)
            wreck.Step(1.0 / AircraftSim.TickHz);

        Assert.True(wreck.Settled, "a ground wreck must come to rest rather than slide forever");
        Vec3D rest = wreck.State.Position;
        double restClearanceM = rest.Y - GroundHeightAt(terrain, rest);
        _out.WriteLine($"rest at {rest}, clearance {restClearanceM:F2} m, "
            + $"travel {(rest - impact).Length:F0} m");
        Assert.InRange(restClearanceM, -1.0, 1.0);
        Assert.Equal(ImpactSurface.Ground, wreck.Surface);
        Assert.True(wreck.HasWeightBearingContact,
            "a settled ground wreck is weight-bearing — the failed-systems model reads this");
    }

    [Fact]
    public void DebrisOverLandArrivesOnTheGroundRatherThanFallingThroughToSeaLevel() {
        ITerrainSurface terrain = RidgeAndValley();
        // Shed high above the 1,400 m crest. The old model tested `position.Y <= 0` and therefore
        // reported a WATER impact on top of a mountain, 1,400 m below the actual surface.
        var state = new AircraftState(new Vec3D(-6_000.0, 2_600.0, 0.0), 60.0, -0.9, 0.0, 0.0,
            FlightModel.F22APublicDataSurrogate.MassKg);
        var wreck = new WreckContactMotion(state, ImpactSurface.CarrierStructure,
            Vec3D.Zero, 0.0, carrier: null, terrain: terrain);

        for (int tick = 0; tick < AircraftSim.TickHz * 60 && !wreck.Settled; tick++)
            wreck.Step(1.0 / AircraftSim.TickHz);

        _out.WriteLine($"surface={wreck.Surface} settled={wreck.Settled} at {wreck.State.Position}");
        Assert.Equal(ImpactSurface.Ground, wreck.Surface);
        Assert.True(wreck.State.Position.Y > 1_000.0,
            $"debris fell through the mountain to {wreck.State.Position.Y:F0} m");
    }

    [Fact]
    public void WithoutTerrainTruthTheModelKeepsItsOldSeaLevelBehaviour() {
        // Constrained builds ship without terrain. The wreck must still resolve — it may not
        // manufacture ground it has no data for, and it may not hang in the air forever.
        var state = new AircraftState(new Vec3D(0.0, 900.0, 0.0), 80.0, -0.8, 0.0, 0.0,
            FlightModel.F22APublicDataSurrogate.MassKg);
        var wreck = new WreckContactMotion(state, ImpactSurface.CarrierStructure,
            Vec3D.Zero, 0.0, carrier: null, terrain: null);

        for (int tick = 0; tick < AircraftSim.TickHz * 120 && !wreck.Settled; tick++)
            wreck.Step(1.0 / AircraftSim.TickHz);

        Assert.Equal(ImpactSurface.Water, wreck.Surface);
        Assert.True(wreck.Settled);
    }
}
