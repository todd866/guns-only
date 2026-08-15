using GunsOnly.Sim.Cobra;
using GunsOnly.Sim.Cobra.GroundWar;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Tests.Cobra;

/// <summary>
/// End-to-end crew chain against the real Iron Bell garrison: stage in the attack area, keep the
/// objective inside the gun window, acquire, consent, and expend ammo. The harness deliberately
/// uses an authored mission target rather than manufacturing a disposable hostile in Camp
/// Ember's protected departure lane.
/// </summary>
public sealed class CobraCrewChainFlightTests
{
    static CobraAiGunner CreateGunner() => new(new CobraAiGunnerDefinition(
        AcquisitionSeconds: 0.75,
        ReacquisitionSeconds: 0.45,
        SightCoincidenceToleranceRad: 0.06));

    static CobraMissionRuntime CreateIronBellAttackRuntime()
    {
        CobraCanyonDefinition world = CobraCanyonDefinition.Create();
        CobraCanyonLandmarkDefinition bridge = world.Landmarks.First(landmark =>
            string.Equals(
                landmark.Id,
                "landmark.cobra-canyon.iron-bell-bridge.v1",
                StringComparison.Ordinal));
        CobraCanyonTerrainSurface terrain = world.CreateTerrainSurface();
        double attackEastM = bridge.EastM;
        double attackNorthM = bridge.NorthM - 420.0;
        Assert.True(terrain.TrySample(attackEastM, attackNorthM, out TerrainSample surface));
        var attackPosition = new Vec3D(attackEastM, surface.HeightM + 60.0, attackNorthM);
        return new CobraMissionRuntime(
            world,
            terrain,
            CobraCanyonRouteChoice.RiverGorge,
            spawn: new CobraMissionSpawn(attackPosition, Vec3D.Zero, YawRad: 0.0));
    }

    [Fact]
    public void HoverFacingIronBellGarrisonHoldFExpendsAmmo()
    {
        var runtime = CreateIronBellAttackRuntime();
        // This harness deliberately stages inside the objective radius. A resumed or repositioned
        // sortie there must enter Engage immediately rather than retain departure/ingress cues
        // that point back behind the aircraft.
        Assert.Equal(CobraMissionAct.Engage, runtime.Act);
        var gunner = CreateGunner();
        var turret = new CobraTurretServo();
        GroundUnit target = runtime.GroundWar.FindUnit(
            CobraGroundWarRuntime.GarrisonUnitId("site.iron-bell-bridge.v1"))
            ?? throw new InvalidOperationException("Iron Bell garrison missing from the objective.");

        // Hold the hover for one second so the pose is settled before we arm the gunner.
        double trim = runtime.Cobra.EstimateHoverCollective(
            runtime.Cobra.State.GrossMassKg,
            CobraMissionRuntime.DefaultAirDensityKgM3);
        var hover = new VerticalLiftPilotCommand(trim, 0.0, 0.0, 0.0);
        for (int i = 0; i < 120; i++)
            runtime.Advance(hover);

        Assert.Equal(CobraMissionAct.Engage, runtime.Act);
        var assessment = CobraGunTargeting.Assess(
            runtime.Cobra.State.PositionWorldM,
            runtime.Cobra.Observation.YawRad,
            target.PositionWorldM);
        Assert.True(
            assessment.WithinTurretEnvelope,
            $"Iron Bell outside envelope: az={assessment.AzimuthErrorRad * 180 / Math.PI:F1}° "
            + $"el={assessment.ElevationRad * 180 / Math.PI:F1}° range={assessment.RangeM:F0}m "
            + $"(aircraft Y={runtime.Cobra.State.PositionWorldM.Y:F0}, target Y={target.PositionWorldM.Y:F0}).");
        Assert.True(assessment.HasBallisticSolution, $"range {assessment.RangeM:F0}m");

        int ammoBefore = runtime.GroundWar.Magazine.RoundsRemaining;
        double healthBefore = target.Health;
        bool sawFireAuthorized = false;
        bool sawExactSelectedEntityFire = false;
        for (long tick = 0; tick < 120 * 6; tick++) {
            runtime.Advance(hover);
            GroundUnit? live = runtime.GroundWar.FindUnit(target.Id);
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
                sawExactSelectedEntityFire |= string.Equals(
                    decision.AssignedTargetId,
                    live.Id,
                    StringComparison.Ordinal);
                runtime.ApplyAuthorizedGunfire(live.Id);
            }
        }

        Assert.True(sawFireAuthorized, "Gunner never authorized fire on the Iron Bell garrison with F held.");
        Assert.True(sawExactSelectedEntityFire,
            "Hold F authorized a different entity than the selected visual/gunner target.");
        int ammoAfter = runtime.GroundWar.Magazine.RoundsRemaining;
        Assert.True(
            ammoAfter < ammoBefore,
            $"Ammo stayed at {ammoAfter} with fire authorized — ApplyAuthorizedGunfire did not drain.");
        GroundUnit damaged = runtime.GroundWar.FindUnit(target.Id)
            ?? throw new InvalidOperationException("Selected target disappeared from authority.");
        Assert.True(damaged.Health < healthBefore,
            $"Hold F spent rounds on {damaged.Id} but health stayed at {damaged.Health:F1}.");
    }
}
