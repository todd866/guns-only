using GunsOnly.Sim.Cobra;
using GunsOnly.Sim.Cobra.GroundWar;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

public sealed class MissionIngressTimingTests
{
    static double HorizontalDistance(in Vec3D first, in Vec3D second)
    {
        double east = first.X - second.X;
        double north = first.Z - second.Z;
        return Math.Sqrt(east * east + north * north);
    }

    [Fact]
    public void CobraColdStartKeepsEveryHostileBeyondAOneMinuteHighSpeedIngress()
    {
        CobraCanyonDefinition world = CobraCanyonDefinition.Create();
        CobraCanyonTerrainSurface terrain = world.CreateTerrainSurface();
        var war = new CobraGroundWarRuntime(world, terrain, seed: 42);
        Vec3D camp = CampEmberOperations.CentreWorldM;
        double closestM = war.LivingUnits()
            .Where(unit => unit.Faction == GroundFaction.Hostile)
            .Min(unit => HorizontalDistance(unit.PositionWorldM, camp));

        Assert.True(
            closestM >= MissionStagingStandards.MinimumContactSeparationM(
                MissionStagingStandards.CobraAuthoredIngressSpeedMps),
            $"closest Cobra hostile is {closestM:F0} m from Camp Ember; "
                + "the authored 120 kt NOE ingress must take at least one minute");
    }

    [Fact]
    public void EveryColdLaunchedCombatMissionStaysOutOfAttackForItsFirstMinute()
    {
        int checkedMissions = 0;
        for (int beatIndex = Beats.FirstBuiltInIndex;
            beatIndex <= Beats.LastBuiltInIndex;
            beatIndex++) {
            BeatSetup beat = Beats.BuiltIn(beatIndex);
            if (!beat.StartsOnCatapult
                || beat.ScriptedIntercept is null
                || beat.OpponentPresence != OpponentPresence.Present)
                continue;

            checkedMissions++;
            var session = new SimulationSession(beatIndex);
            session.DecisionCaptureEnabled = false;
            session.Begin();
            session.SetRapierAutomationEnabled(true);
            while (session.TimeSeconds
                < MissionStagingStandards.MinimumColdLaunchToContactSeconds) {
                Assert.NotEqual(RapierMissionPhase.Attack, session.RapierPhase);
                session.StepFixed();
            }
        }

        Assert.True(checkedMissions > 0, "catalogue audit found no cold-launched combat missions");
    }
}
