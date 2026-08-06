using System;
using System.Collections.Generic;
using GunsOnly.Sim.Environment;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// The broad phase is allowed to skip terrain, and it is NOT allowed to change an answer.
///
/// Auto-GCAS now compares a predicted segment against the terrain's own proven ceiling
/// (ITerrainSurface.MaximumHeightM) and skips marching any segment that stands clear of it. That
/// shortcut is only defensible if it is invisible: the same aircraft over the same ground must
/// draw the same phase, the same cue and the same recovery command with the shortcut as without.
///
/// This suite proves it by construction rather than by argument. A surface that does not know its
/// own ceiling reports positive infinity, which disarms the broad phase entirely — so wrapping the
/// SAME terrain in a ceiling-hiding shim gives an exact-sampling reference running the identical
/// code path on the identical geometry, and the two can be compared state by state.
/// </summary>
public class AutoGcasBroadPhaseEquivalenceTests {
    readonly ITestOutputHelper _output;
    public AutoGcasBroadPhaseEquivalenceTests(ITestOutputHelper output) => _output = output;

    /// Forwards everything except the ceiling, so the broad phase falls back to marching.
    sealed class CeilingHiddenSurface : ITerrainSurface {
        readonly ITerrainSurface _source;
        public long Queries;
        public CeilingHiddenSurface(ITerrainSurface source) => _source = source;
        public TerrainBounds Bounds => _source.Bounds;
        public double HorizontalResolutionM => _source.HorizontalResolutionM;
        public bool TrySample(double eastM, double northM, out TerrainSample sample) {
            Queries++;
            return _source.TrySample(eastM, northM, out sample);
        }
        public bool TryHeightM(double eastM, double northM, out double heightM) {
            Queries++;
            return _source.TryHeightM(eastM, northM, out heightM);
        }
    }

    sealed class CountingSurface : ITerrainSurface {
        readonly ITerrainSurface _source;
        public long Queries;
        public CountingSurface(ITerrainSurface source) => _source = source;
        public TerrainBounds Bounds => _source.Bounds;
        public double HorizontalResolutionM => _source.HorizontalResolutionM;
        public double MaximumHeightM => _source.MaximumHeightM;
        public bool TrySample(double eastM, double northM, out TerrainSample sample) {
            Queries++;
            return _source.TrySample(eastM, northM, out sample);
        }
        public bool TryHeightM(double eastM, double northM, out double heightM) {
            Queries++;
            return _source.TryHeightM(eastM, northM, out heightM);
        }
    }

    /// Real relief, not a plane: ridges and valleys on two scales so a predicted path crosses
    /// rising as well as falling ground, plus a single dominant peak that sets the ceiling far
    /// above the ordinary terrain — the case where a naive "compare against the ground under me"
    /// shortcut would be wrong and a true ceiling still is not.
    static BilinearHeightGrid Relief() {
        const int Points = 241;
        const double SpacingM = 250.0;   // 60 km on a side
        const double OriginM = -30_000.0;
        var heights = new double[Points, Points];
        for (int north = 0; north < Points; north++) {
            for (int east = 0; east < Points; east++) {
                double x = OriginM + east * SpacingM;
                double z = OriginM + north * SpacingM;
                double ridges = 220.0 * Math.Sin(x / 3_100.0) * Math.Cos(z / 4_700.0);
                double swell = 140.0 * Math.Sin((x + z) / 11_000.0);
                double peak = 900.0 * Math.Exp(
                    -((x - 9_000.0) * (x - 9_000.0) + (z - 6_000.0) * (z - 6_000.0))
                    / (2.0 * 2_500.0 * 2_500.0));
                heights[north, east] = Math.Max(0.0, 400.0 + ridges + swell + peak);
            }
        }
        return new BilinearHeightGrid(OriginM, OriginM, SpacingM, SpacingM, heights);
    }

    static AutoGcasInput InputFor(ITerrainSurface terrain, in Vec3D position,
        double speedMps, double gammaRad, double chiRad, double bankRad,
        in PilotCommand command) =>
        new(
            Aircraft: new AircraftState(position, speedMps, gammaRad, chiRad, bankRad,
                FlightModel.F22APublicDataSurrogate.MassKg),
            AircraftParameters: FlightModel.F22APublicDataSurrogate,
            EffectivePilotCommand: command,
            Terrain: terrain,
            IndicatedAirspeedMps: speedMps * 0.82);

    /// <summary>
    /// A wide sweep of states over that relief — altitudes from a few hundred feet AGL to the
    /// mid-twenties, flight-path angles from a hard climb to a near-vertical dive, both a held
    /// turn and a hands-off cruise, on every heading. For each one, the phase, the inhibit reason,
    /// the cue and the commanded recovery must match the exact-sampling reference exactly.
    /// </summary>
    [Fact]
    public void TheBroadPhaseChangesNoDecisionAnywhereOverRealRelief() {
        BilinearHeightGrid relief = Relief();
        var gated = new CountingSurface(relief);
        var exact = new CeilingHiddenSurface(relief);
        _output.WriteLine($"theatre ceiling = {relief.MaximumHeightM:F1} m");
        Assert.True(double.IsFinite(relief.MaximumHeightM));
        Assert.True(((ITerrainSurface)exact).MaximumHeightM == double.PositiveInfinity,
            "the reference surface must genuinely disarm the broad phase");

        var commands = new List<PilotCommand> {
            new(1.0, 0.0, 0.80, 0.0),                                   // hands-off cruise
            new(5.0, 0.0, 1.00, 0.0) { DirectLateralControl = true },   // held pull
            new(0.2, 0.0, 0.40, 0.0),                                   // unloaded
        };

        int compared = 0, gatedFlyUps = 0, warnings = 0, boundLowerCount = 0;
        double worstBoundGapM = 0.0;
        foreach (double altitudeM in new[] {
            520.0, 700.0, 1_000.0, 1_600.0, 2_500.0, 4_000.0, 6_500.0, 9_000.0 })
        foreach (double gammaDeg in new[] { 15.0, 0.0, -5.0, -20.0, -45.0, -70.0, -85.0 })
        foreach (double chiDeg in new[] { 0.0, 55.0, 130.0, 200.0, 285.0 })
        foreach (double speedMps in new[] { 180.0, 320.0, 460.0 })
        foreach (PilotCommand command in commands) {
            var position = new Vec3D(-6_000.0, altitudeM, -8_000.0);
            double gamma = gammaDeg * Math.PI / 180.0;
            double chi = chiDeg * Math.PI / 180.0;
            double bank = (chiDeg > 90.0 ? 25.0 : 3.0) * Math.PI / 180.0;

            AutoGcasStepResult withGate = AutoGcasController.Step(1.0 / 20.0,
                AutoGcasState.Initial(true),
                InputFor(gated, position, speedMps, gamma, chi, bank, command),
                AutoGcasCapabilityProfile.ModernCrewedPublicDataSurrogate);
            AutoGcasStepResult withoutGate = AutoGcasController.Step(1.0 / 20.0,
                AutoGcasState.Initial(true),
                InputFor(exact, position, speedMps, gamma, chi, bank, command),
                AutoGcasCapabilityProfile.ModernCrewedPublicDataSurrogate);
            compared++;

            string where = $"alt={altitudeM:F0} gamma={gammaDeg} chi={chiDeg} "
                + $"spd={speedMps} G={command.GDemand}";
            Assert.True(withGate.State.Phase == withoutGate.State.Phase,
                $"{where}: phase {withGate.State.Phase} with the broad phase, "
                + $"{withoutGate.State.Phase} without it");
            Assert.Equal(withoutGate.State.InhibitReason, withGate.State.InhibitReason);
            Assert.Equal(withoutGate.State.Cue, withGate.State.Cue);
            Assert.Equal(withoutGate.State.ActivationCount, withGate.State.ActivationCount);
            Assert.Equal(withoutGate.RecoveryCommand.HasValue,
                withGate.RecoveryCommand.HasValue);
            if (withGate.RecoveryCommand is { } commanded) {
                PilotCommand reference = withoutGate.RecoveryCommand!.Value;
                Assert.Equal(reference.GDemand, commanded.GDemand, 12);
                Assert.Equal(reference.SasRollControl, commanded.SasRollControl, 12);
                Assert.Equal(reference.Throttle, commanded.Throttle, 12);
            }
            if (withGate.State.Phase == AutoGcasPhase.FlyUp) gatedFlyUps++;
            if (withGate.State.Phase == AutoGcasPhase.Warning) warnings++;

            // The gated clearance is a LOWER bound, never an over-report. That is the property the
            // whole shortcut rests on: reporting low can only make the system more protective.
            double bound = withGate.State.Prediction.PilotMinimumClearanceM;
            double truth = withoutGate.State.Prediction.PilotMinimumClearanceM;
            if (double.IsFinite(bound) && double.IsFinite(truth)) {
                Assert.True(bound <= truth + 1e-6,
                    $"{where}: broad phase reported {bound:F1} m where the truth is {truth:F1} m");
                if (bound < truth - 1e-6) {
                    boundLowerCount++;
                    worstBoundGapM = Math.Max(worstBoundGapM, truth - bound);
                }
            }
        }

        _output.WriteLine($"compared={compared} flyUps={gatedFlyUps} warnings={warnings} "
            + $"loweredBound={boundLowerCount} worstGap={worstBoundGapM:F0} m");
        _output.WriteLine($"terrain queries: gated={gated.Queries:N0} "
            + $"exact={exact.Queries:N0} "
            + $"({exact.Queries / (double)Math.Max(gated.Queries, 1):F1}x)");

        Assert.True(compared >= 800, $"the sweep must be wide (compared {compared})");
        // A sweep that never reaches the trigger would prove nothing about the trigger.
        Assert.True(gatedFlyUps > 0,
            "the sweep must contain genuine fly-up geometries for the comparison to mean anything");
        // This sweep is deliberately hostile to the shortcut — a 1,450 m peak sets the ceiling far
        // above the ordinary ridgeline, and one state in seven is a genuine fly-up — so the saving
        // here is modest by construction. What a sortie actually costs is pinned separately by
        // AutoGcasTerrainBudgetTests; all this needs to show is that the skip is real.
        Assert.True(gated.Queries < exact.Queries,
            $"the broad phase must actually be skipping work "
            + $"(gated {gated.Queries:N0} vs exact {exact.Queries:N0})");
    }

    /// <summary>
    /// The release path, which the sweep above cannot reach because it steps from a cold armed
    /// state every time.
    ///
    /// Releasing an active fly-up is the one decision that reads a clearance against the LARGEST
    /// threshold in the file — ExitClearanceM, and TerrainBufferM + ExitPredictionMarginM — and it
    /// is therefore the decision a lower-bound clearance is most likely to get wrong. An aircraft
    /// climbing away from the ground crosses out of the marched regime and into the gated one
    /// exactly while this gate is being evaluated, so the crossing itself is the case under test.
    /// </summary>
    [Fact]
    public void TheBroadPhaseReleasesAnActiveFlyUpAtTheSamePoint() {
        BilinearHeightGrid relief = Relief();
        var gated = new CountingSurface(relief);
        var exact = new CeilingHiddenSurface(relief);

        int compared = 0, released = 0, heldActive = 0;
        // A recovering aircraft: climbing away, at the altitudes either side of the broad-phase
        // boundary, so the sweep straddles the gated/marched crossing rather than sitting inside
        // one regime.
        foreach (double altitudeM in new[] {
            700.0, 1_100.0, 1_500.0, 1_700.0, 1_756.0, 1_800.0, 1_900.0, 2_200.0,
            3_000.0, 5_000.0 })
        foreach (double gammaDeg in new[] { -5.0, 2.0, 10.0, 25.0, 45.0 })
        foreach (double chiDeg in new[] { 0.0, 95.0, 240.0 }) {
            var position = new Vec3D(-6_000.0, altitudeM, -8_000.0);
            var command = new PilotCommand(1.2, 0.0, 0.9, 0.0) {
                DirectLateralControl = true
            };
            // A fly-up already in progress, part-way through its release dwell.
            var active = new AutoGcasState(AutoGcasPhase.FlyUp, AutoGcasInhibitReason.None,
                "AUTO GCAS · FLYUP", 1, 0, 0, 1.5, 0.98, AutoGcasPrediction.Invalid);

            AutoGcasStepResult withGate = AutoGcasController.Step(1.0 / 20.0, active,
                InputFor(gated, position, 300.0, gammaDeg * Math.PI / 180.0,
                    chiDeg * Math.PI / 180.0, 0.0, command),
                AutoGcasCapabilityProfile.ModernCrewedPublicDataSurrogate);
            AutoGcasStepResult withoutGate = AutoGcasController.Step(1.0 / 20.0, active,
                InputFor(exact, position, 300.0, gammaDeg * Math.PI / 180.0,
                    chiDeg * Math.PI / 180.0, 0.0, command),
                AutoGcasCapabilityProfile.ModernCrewedPublicDataSurrogate);
            compared++;

            string where = $"alt={altitudeM:F0} gamma={gammaDeg} chi={chiDeg}";
            Assert.True(withGate.State.Phase == withoutGate.State.Phase,
                $"{where}: released to {withGate.State.Phase} with the broad phase, "
                + $"{withoutGate.State.Phase} without it");
            Assert.Equal(withoutGate.State.ReleaseCount, withGate.State.ReleaseCount);
            Assert.Equal(withoutGate.State.ClearDwellSeconds, withGate.State.ClearDwellSeconds, 12);
            Assert.Equal(withoutGate.RecoveryCommand.HasValue,
                withGate.RecoveryCommand.HasValue);
            if (withGate.State.Phase == AutoGcasPhase.Armed) released++;
            if (withGate.State.Phase == AutoGcasPhase.FlyUp) heldActive++;
        }

        _output.WriteLine($"compared={compared} released={released} heldActive={heldActive}");
        Assert.True(compared >= 90, $"the sweep must be wide (compared {compared})");
        // Both outcomes must occur, or the comparison only ever tested one branch of the gate.
        Assert.True(released > 0, "the sweep must contain releases");
        Assert.True(heldActive > 0, "the sweep must contain states that stay active");
    }
}
