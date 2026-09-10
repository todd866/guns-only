using System.Text.Json;
using GunsOnly.Sim.Okanagan;

namespace GunsOnly.Sim.Tests.Okanagan;

public sealed class OkanaganFlightPathTests
{
    [Theory]
    [InlineData(OkanaganSortieType.WaterCircuits)]
    [InlineData(OkanaganSortieType.PeachlandDefence)]
    [InlineData(OkanaganSortieType.BigWhiteDefence)]
    [InlineData(OkanaganSortieType.SilverStarDefence)]
    [InlineData(OkanaganSortieType.ApexDefence)]
    public void RealAircraftScoopsWorksAndStopsOnTheRunway(OkanaganSortieType sortie)
    {
        var mission = OkanaganFireMission.Create(sortie);
        var incident = OkanaganIncident.For(sortie);
        var untreatedFire = incident == null ? null : new OkanaganFireGrid(incident);
        var untreatedSites = incident == null ? null : new OkanaganProtection(incident.Sites);
        double untreatedAccumulator = 0;
        bool trackUntreated = false;
        var pilot = new OkanaganTestPilot(mission.Aircraft.InitialElevatorTrim);
        var phases = new List<OkanaganMissionPhase>();
        var samples = new List<object>();
        var releases = new List<object>();
        double lastWater = 0;
        FireBossPilotCommand command = default;
        double maximumWater = 0, minimumTransitClearance = double.PositiveInfinity;
        double nextSample = 0;
        for (int tick = 0; tick < 6_000 / FireBossDynamics.FixedDeltaSeconds; tick++)
        {
            if (tick % 12 == 0)
            {
                var state = mission.Snapshot();
                trackUntreated = state.IncidentActive && !state.IncidentHandedOff;
                bool changed = phases.Count == 0 || phases[^1] != state.Phase;
                if (changed) phases.Add(state.Phase);
                maximumWater = Math.Max(maximumWater, state.Aircraft.WaterLoadKg);
                double agl = state.Aircraft.PositionWorldM.Y
                    - OkanaganCdem.SampleSurfaceHeightM(state.Aircraft.PositionWorldM);
                if (state.Phase is OkanaganMissionPhase.Ingress or OkanaganMissionPhase.Drop or OkanaganMissionPhase.Rtb)
                    minimumTransitClearance = Math.Min(minimumTransitClearance, agl);
                // Every 0.1 s command tick that released water: the actual release track, which
                // the five-second samples cannot resolve.
                if (state.Aircraft.WaterLoadKg < lastWater - 1)
                    releases.Add(new { state.MissionSeconds, Phase = state.Phase.ToString(), state.Aircraft.PositionWorldM,
                        ClearanceM = agl, ReleasedKg = lastWater - state.Aircraft.WaterLoadKg,
                        AimDistanceM = Math.Sqrt(Math.Pow(state.Aircraft.PositionWorldM.X - state.DropAimWorldM.X, 2)
                            + Math.Pow(state.Aircraft.PositionWorldM.Z - state.DropAimWorldM.Z, 2)) });
                lastWater = state.Aircraft.WaterLoadKg;
                if (changed || state.MissionSeconds >= nextSample)
                {
                    samples.Add(new { state.MissionSeconds, Phase = state.Phase.ToString(), state.ActiveGateIndex,
                        state.Aircraft.PositionWorldM, state.Aircraft.TrueAirspeedMps, state.Aircraft.FuelKg,
                        Gate = state.Route.ElementAtOrDefault(Math.Min(state.ActiveGateIndex, state.Route.Count - 1)),
                        state.Aircraft.VerticalSpeedMps, state.Aircraft.HeadingRad, state.Aircraft.RollRad,
                        state.Aircraft.PitchRad, state.Aircraft.AngleOfAttackRad,
                        state.Aircraft.PitchRateRadPerSecond, state.Aircraft.LoadFactor,
                        Command = command,
                        state.Aircraft.WaterLoadKg, state.ScoopTargetWaterKg, state.DropTargetWaterKg, state.Cue,
                        ClearanceM = agl, state.EffectiveWaterKg,
                        Intact = state.Sites.Count(s => s.Status == "intact"),
                        Damaged = state.Sites.Count(s => s.Status == "damaged"), Lost = state.Sites.Count(s => s.Status == "lost") });
                    nextSample = state.MissionSeconds + 5;
                }
                if (state.Phase is OkanaganMissionPhase.Complete or OkanaganMissionPhase.Failed) break;
                command = pilot.Command(state, mission.Aircraft.SharedAircraft.LastEngineOperatingPoint.NetThrustN,
                    mission.RecommendsShallowLoadedClimb());
            }
            mission.Step(command);
            // Match the observed incident clock to 0.1 s, with the same fixed fire step and
            // half-second site updates. This control receives no water from the flown attack.
            if (trackUntreated && untreatedFire != null)
            {
                untreatedFire.Step(FireBossDynamics.FixedDeltaSeconds);
                untreatedAccumulator += FireBossDynamics.FixedDeltaSeconds;
                if (untreatedAccumulator >= .5)
                {
                    untreatedSites!.Step(untreatedAccumulator, untreatedFire);
                    untreatedAccumulator = 0;
                }
            }
        }
        var final = mission.Snapshot();
        string diagnostic = $"{sortie}: {string.Join(" → ", phases)}; {final.MissionSeconds:F1} s; "
            + $"gate {final.ActiveGateIndex}; {final.Aircraft.PositionWorldM}; "
            + $"water {maximumWater:F0}/{final.Aircraft.WaterLoadKg:F0} kg, fuel {final.Aircraft.FuelKg:F1} kg; "
            + $"minimum work/transit clearance {minimumTransitClearance:F1} m";
        string? directory = System.Environment.GetEnvironmentVariable("GUNS_OKANAGAN_FLIGHT_OUTPUT");
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
            File.WriteAllText(Path.Combine(directory, $"{sortie}.json"), JsonSerializer.Serialize(new {
                diagnostic, maximumWater, minimumTransitClearance, final.EffectiveWaterKg,
                mission.PerformancePlan,
                final.ScoopTargetWaterKg, final.DropTargetWaterKg,
                final.IncidentHandedOff, final.DropAimWorldM, final.Sites, UntreatedSites = untreatedSites?.Snapshot(), releases, samples },
                new JsonSerializerOptions {
                    // A flight that never reaches transit leaves its minimum clearance at +∞.
                    // Retain that explicit diagnostic instead of throwing before the assertion.
                    NumberHandling = System.Text.Json.Serialization.JsonNumberHandling.AllowNamedFloatingPointLiterals,
                }));
        }
        Assert.True(final.Phase == OkanaganMissionPhase.Complete, diagnostic);
        Assert.True(final.Aircraft.Flyable && OkanaganGeo.IsOverKelownaRunway(final.Aircraft.PositionWorldM), diagnostic);
        Assert.InRange(final.Aircraft.TrueAirspeedMps, 0, 4);
        Assert.True(final.ScoopTargetWaterKg > 1 && final.DropTargetWaterKg > 0, diagnostic);
        Assert.True(maximumWater >= final.ScoopTargetWaterKg - 1
            && maximumWater - final.Aircraft.WaterLoadKg >= final.DropTargetWaterKg - 1, diagnostic);
        Assert.True(final.Aircraft.FuelKg >= final.FuelPlan.MinimumRtbFuelKg, diagnostic);
        Assert.True(minimumTransitClearance >= 25, diagnostic);
        Assert.Equal(1, final.CompletedCycles);
        Assert.Contains(OkanaganMissionPhase.Scoop, phases);
        Assert.Contains(OkanaganMissionPhase.Approach, phases);
        if (sortie != OkanaganSortieType.WaterCircuits)
        {
            // The defence load is judged by the buildings it reached: the mission must count
            // the drop as effective and the debrief must be able to name the protected sites.
            Assert.True(final.IncidentHandedOff && final.EffectiveDrops == 1, diagnostic);
            Assert.True(final.Sites.Count(s => s.ProtectedByDrop) >= 10,
                $"only {final.Sites.Count(s => s.ProtectedByDrop)} sites were reached by the load. " + diagnostic);
            Assert.Contains(OkanaganMissionPhase.Drop, phases);
            Assert.True(final.Sites.Sum(s => s.Integrity) > untreatedSites!.Snapshot().Sum(s => s.Integrity) + .5,
                "The actual flown drop must improve aggregate site integrity beyond the 0.1 s control-clock tolerance. " + diagnostic);
        }
    }
}
