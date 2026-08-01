using System.Text.Json;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Recovery;
using GunsOnly.Web;

namespace GunsOnly.Sim.Tests;

public sealed class SortieScheduleSessionTests {
    static BeatSetup FixedRunwayRecoveryCard(double rangeToHomeM, double heightAboveRunwayM,
        double trueAirspeedMps) {
        BeatSetup baseline = Beats.ModernVisualMerge();
        RecoveryPlan plan = baseline.RecoveryPlan
            ?? throw new InvalidOperationException("modern merge must publish its runway home");
        ConventionalRunwayGeometry runway = plan.ConventionalRunway
            ?? throw new InvalidOperationException("modern merge must publish runway geometry");
        AircraftState player = baseline.Player with {
            // Landing heading is east. Stage west of the touchdown aim, on the authored runway
            // centreline, so horizontal range is also along-track distance.
            Position = new Vec3D(
                plan.Position.X - rangeToHomeM,
                runway.ElevationM + heightAboveRunwayM,
                plan.Position.Z),
            Speed = trueAirspeedMps,
            Gamma = 0.0,
            Chi = runway.LandingHeadingRad,
            Bank = 0.0
        };
        return baseline with {
            Player = player,
            UsesNeutralMergeBandit = false,
            UsesReactiveBandit = false,
            ContinuousCombat = null,
            VisualMergeEvaluation = null,
            BanditTimeline = new() {
                (0.0, new PilotCommand(1.0, 0.0, 0.7, 0.0))
            }
        };
    }

    [Fact]
    public void FixedRunwayRecoveryUsesThePerAirframeTwoSidedSchedule() {
        BeatSetup beat = FixedRunwayRecoveryCard(
            rangeToHomeM: 4_000.0,
            heightAboveRunwayM: 60.0,
            trueAirspeedMps: 60.0);
        var session = new SimulationSession();
        session.StartBeat(() => beat);
        Assert.True(session.TrySetRecoveryProcedure((int)RecoveryProcedureKind.StraightIn));
        session.SetAutoGcasEnabled(false);
        session.Begin();
        session.StepFixed();

        Assert.True(session.RecoverySchedule.Valid,
            "the legacy descent geometry remains available during migration");
        Assert.Equal(0.5, session.RecoverySchedule.CommandedPower01, 3);
        Assert.True(session.SortiePlan.Valid);
        Assert.Equal(SortieLeg.Recovery, session.SortiePlan.Leg);
        Assert.True(session.SortiePlan.CommandedPower01 > 0.5,
            $"low and slow must ask for power, got {session.SortiePlan.CommandedPower01:F3}");

        double approachMps = SortieSchedule.ApproachSpeedMps(
            session.Player.State.Mass, beat.PlayerAir);
        Assert.Equal(2.7 * approachMps, session.SortiePlan.TargetSpeedMps, 6);

        using JsonDocument snapshot = JsonDocument.Parse(SnapshotProjection.BuildState(
            session, Carrier.DeckConfiguration.Angled, 0.0, 0.0, false, null));
        JsonElement root = snapshot.RootElement;
        Assert.True(root.GetProperty("sortie_valid").GetBoolean());
        Assert.True(root.GetProperty("sortie_power_01").GetDouble() > 0.5);
    }

    [Fact]
    public void RecoveryAndGrooveMeetAtTheAuthoredFinalGate() {
        SortieScheduleState Outside(double rangeM) {
            BeatSetup beat = FixedRunwayRecoveryCard(
                rangeM, heightAboveRunwayM: 40.0, trueAirspeedMps: 90.0);
            var session = new SimulationSession();
            session.StartBeat(() => beat);
            Assert.True(session.TrySetRecoveryProcedure(
                (int)RecoveryProcedureKind.StraightIn));
            session.SetAutoGcasEnabled(false);
            session.Begin();
            session.StepFixed();
            return session.SortiePlan;
        }

        SortieScheduleState recovery = Outside(801.0);
        SortieScheduleState groove = Outside(799.0);

        Assert.Equal(SortieLeg.Recovery, recovery.Leg);
        Assert.Equal(SortieLeg.Groove, groove.Leg);
        Assert.InRange(Math.Abs(
            recovery.TargetHeightM - groove.TargetHeightM), 0.0, 0.25);
    }
}
