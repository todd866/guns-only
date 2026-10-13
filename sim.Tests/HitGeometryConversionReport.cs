using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Training;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Deterministic before/after instrument for the C10 target-volume change. This deliberately
/// reports each reference merge separately so a geometry change cannot hide a conversion shift in
/// an aggregate. The paired cases select legacy spheres and airframe solids in the same binary;
/// the scenario seeds and tick ordering are fixed by ProductionCombatDuel.
/// </summary>
public sealed class HitGeometryConversionReport {
    readonly ITestOutputHelper _output;
    public HitGeometryConversionReport(ITestOutputHelper output) => _output = output;

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void ReportReferenceMergesAndFunnelTiers(bool airframeVolumes) {
        if (System.Environment.GetEnvironmentVariable("C10_GEOMETRY_REPORT") != "1") return;
        const int engagements = 6;
        _output.WriteLine("C10 hit geometry conversion report");
        _output.WriteLine($"airframeVolumes={airframeVolumes} engagements={engagements}");

        foreach (PilotSkill tier in new[] {
            PilotSkill.Novice, PilotSkill.Competent, PilotSkill.Veteran, PilotSkill.Ace }) {
            GunConversionFunnelResult funnel = GunConversionFunnel.MeasureEnemy(
                tier, engagements: engagements, useTargetGeometry: airframeVolumes);
            _output.WriteLine(funnel.ToString());
            _output.WriteLine(funnel.TriggerLine);
        }

        foreach (PilotSkill tier in new[] { PilotSkill.Ace }) {
            _output.WriteLine($"duels enemy={tier}");
            for (int engagement = 1; engagement <= engagements; engagement++) {
                ProductionCombatScenario scenario =
                    ProductionCombatScenario.OffsetNeutralMerge(engagement);
                ProductionCombatResult result = ProductionCombatDuel.Fly(
                    scenario, PilotSkill.Veteran, tier, maximumSeconds: 45.0, useTargetGeometry: airframeVolumes);
                _output.WriteLine(
                    $"  seed={engagement} outcome={result.Outcome} elapsed={result.ElapsedSeconds:F2}s "
                    + $"refRounds={result.ReferenceRoundsFired} refHits={result.ReferenceHits} "
                    + $"enemyRounds={result.EnemyRoundsFired} enemyHits={result.EnemyHits} "
                    + $"refRoundsToFirstHit={OrDash(result.ReferenceRoundsToFirstHit)} "
                    + $"enemyRoundsToFirstHit={OrDash(result.EnemyRoundsToFirstHit)}");
            }
        }
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void ReportControlledGunPass(bool airframeVolumes) {
        if (System.Environment.GetEnvironmentVariable("C10_GEOMETRY_REPORT") != "1") return;
        BeatSetup beat = PracticeBeats.Create(PracticeExercise.Gunnery);
        if (!airframeVolumes) beat = beat with { Combat = beat.CombatRules with {
            PlayerTargetGeometry = null, OpponentTargetGeometry = null } };
        var session = new SimulationSession();
        session.StartBeat(() => beat);
        session.Begin();
        session.SetAssistedFlight(false);
        session.FeedKey(GKey.Trigger,true);
        int roundsToFirstHit = 0;
        double firstHitSeconds = double.NaN;
        for (int tick=0; tick<10*AircraftSim.TickHz && session.Practice!.Status==PracticeStatus.Active; tick++) {
            session.StepFixed();
            if (roundsToFirstHit==0 && session.SortiePlayerHits>0) {
                roundsToFirstHit=session.SortiePlayerRoundsFired;
                firstHitSeconds=session.TimeSeconds;
            }
        }
        session.FeedKey(GKey.Trigger,false);
        _output.WriteLine($"practice airframeVolumes={airframeVolumes} firstHit={firstHitSeconds:F4}s "
            + $"roundsToFirstHit={roundsToFirstHit} rounds={session.SortiePlayerRoundsFired} "
            + $"hits={session.SortiePlayerHits} status={session.Practice!.Status} t={session.TimeSeconds:F4}s");
        Assert.True(roundsToFirstHit>0);
    }

    static string OrDash(int value) => value > 0 ? value.ToString() : "-";
}
