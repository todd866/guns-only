using GunsOnly.Sim.Cobra;
using GunsOnly.Sim.Cobra.GroundWar;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Tests.Cobra;

/// <summary>
/// End-to-end crew chain: clear the Depart pad (Ingress seeds the standing seam), keep it inside
/// the gun window, acquire, consent, and expend ammo. Owner Build 270 telemetry showed
/// OutOfLimits ~87% of the sortie and zero rounds away — this harness fails closed on that
/// regression. Build 300 moved the seam off the cold open so the pad is not a knife fight.
/// </summary>
public sealed class CobraCrewChainFlightTests
{
    static CobraAiGunner CreateGunner() => new(new CobraAiGunnerDefinition(
        AcquisitionSeconds: 0.75,
        ReacquisitionSeconds: 0.45,
        SightCoincidenceToleranceRad: 0.06));

    static CobraMissionRuntime CreatePastPadRuntime()
    {
        CobraCanyonDefinition world = CobraCanyonDefinition.Create();
        CobraCanyonRouteDefinition route = world.Routes.First(candidate =>
            string.Equals(candidate.Id, CobraCanyonDefinition.RiverGorgeRouteId, StringComparison.Ordinal));
        CobraCanyonRoutePoint start = route.Points[0];
        CobraCanyonRoutePoint next = route.Points[1];
        double yawRad = Math.Atan2(next.EastM - start.EastM, next.NorthM - start.NorthM);
        double eastDeltaM = next.EastM - start.EastM;
        double northDeltaM = next.NorthM - start.NorthM;
        double lengthM = Math.Sqrt(eastDeltaM * eastDeltaM + northDeltaM * northDeltaM);
        double offsetM = CobraMissionActProgress.DepartPadRadiusM + 40.0;
        if (!world.CreateTerrainSurface().TrySample(start.EastM, start.NorthM, out TerrainSample surface))
            throw new InvalidOperationException("Camp Ember has no terrain datum.");
        var pastPad = new Vec3D(
            start.EastM + eastDeltaM / lengthM * offsetM,
            surface.HeightM + 40.0,
            start.NorthM + northDeltaM / lengthM * offsetM);
        return new CobraMissionRuntime(
            world,
            world.CreateTerrainSurface(),
            CobraCanyonRouteChoice.RiverGorge,
            spawn: new CobraMissionSpawn(pastPad, Vec3D.Zero, yawRad));
    }

    [Fact]
    public void HoverFacingSeamHoldFExpendsAmmo()
    {
        var runtime = CreatePastPadRuntime();
        Assert.Equal(CobraMissionAct.Ingress, runtime.Act);
        var gunner = CreateGunner();
        var turret = new CobraTurretServo();
        GroundUnit seam = runtime.GroundWar.FindUnit(CobraGroundWarRuntime.GunnerySeamUnitId)
            ?? throw new InvalidOperationException("Standing gunnery seam missing after Ingress.");

        // Hold the hover for one second so the pose is settled before we arm the gunner.
        double trim = runtime.Cobra.EstimateHoverCollective(
            runtime.Cobra.State.GrossMassKg,
            CobraMissionRuntime.DefaultAirDensityKgM3);
        var hover = new VerticalLiftPilotCommand(trim, 0.0, 0.0, 0.0);
        for (int i = 0; i < 120; i++)
            runtime.Advance(hover);

        var assessment = CobraGunTargeting.Assess(
            runtime.Cobra.State.PositionWorldM,
            runtime.Cobra.Observation.YawRad,
            seam.PositionWorldM);
        Assert.True(
            assessment.WithinTurretEnvelope,
            $"Seam outside envelope after Ingress: az={assessment.AzimuthErrorRad * 180 / Math.PI:F1}° "
            + $"el={assessment.ElevationRad * 180 / Math.PI:F1}° range={assessment.RangeM:F0}m "
            + $"(aircraft Y={runtime.Cobra.State.PositionWorldM.Y:F0}, seam Y={seam.PositionWorldM.Y:F0}).");
        Assert.True(assessment.HasBallisticSolution, $"range {assessment.RangeM:F0}m");

        int ammoBefore = runtime.GroundWar.Magazine.RoundsRemaining;
        bool sawFireAuthorized = false;
        for (long tick = 0; tick < 120 * 6; tick++) {
            runtime.Advance(hover);
            GroundUnit? live = runtime.GroundWar.FindUnit(CobraGroundWarRuntime.GunnerySeamUnitId);
            Assert.NotNull(live);
            CobraGunnerTargetObservation observation = CobraGunTargeting.AdvanceGunnerObservation(
                runtime.Terrain,
                runtime.ResolvedObstacles,
                runtime.Cobra.State.PositionWorldM,
                runtime.Cobra.Observation.YawRad,
                live!.Id,
                friendly: false,
                live.PositionWorldM,
                turret,
                PlayerVehicleContract.FixedDeltaSeconds);
            CobraAiGunnerDecision decision = gunner.Advance(new CobraAiGunnerInput(
                AuthorityTick: tick,
                SelectedTargetId: live.Id,
                EngagementConsent: true,
                WeaponsArmed: true,
                TurretServiceable: true,
                SelectedTarget: observation));
            if (decision.FireAuthorized) {
                sawFireAuthorized = true;
                runtime.ApplyAuthorizedGunfire(live.Id);
            }
        }

        Assert.True(sawFireAuthorized, "Gunner never authorized fire on the standing seam with F held.");
        int ammoAfter = runtime.GroundWar.Magazine.RoundsRemaining;
        Assert.True(
            ammoAfter < ammoBefore,
            $"Ammo stayed at {ammoAfter} with fire authorized — ApplyAuthorizedGunfire did not drain.");
    }
}
