using GunsOnly.Sim.Doctrine;
using Xunit;

namespace GunsOnly.Sim.Tests;

public class AirframeHitGeometryTests {
    static readonly AircraftState Target = new(new Vec3D(0, 100, 0), 0, 0, 0, 0, 20_000,
        QuaternionD.Identity);
    static void Hit(AirframeHitGeometry shape, Vec3D start, Vec3D end) {
        Assert.True(shape.TryBodyEntry(start, end - start, out double fraction));
        Assert.InRange(fraction, 0, 1);
    }
    static void Miss(AirframeHitGeometry shape, Vec3D start, Vec3D end) =>
        Assert.False(shape.TryBodyEntry(start, end - start, out _));

    [Fact] public void Su27NoseTenMetresForwardIsSolidButSurroundingAirIsNot() {
        Hit(AirframeHitGeometry.Su27, new(-3,0,10), new(3,0,10));
        Miss(AirframeHitGeometry.Su27, new(-3,1,10), new(3,1,10));
        Miss(AirframeHitGeometry.Su27, new(-3,0,11.3), new(3,0,11.3));
    }
    [Fact] public void NineMetresBeyondWingtipMisses() {
        double x = 14.698 / 2 + 9;
        Miss(AirframeHitGeometry.Su27, new(x,0,-20), new(x,0,20));
        // Also pin the actual edge, not just the easy far miss.
        Miss(AirframeHitGeometry.Su27, new(7.36,0,-20), new(7.36,0,20));
        Hit(AirframeHitGeometry.Su27, new(7.30,-1,-4), new(7.30,1,-4));
    }
    [Fact] public void RoundCrossingFromBetweenFinsHitsFinAndTheGapRemainsEmpty() {
        Hit(AirframeHitGeometry.Su27, new(0,2,-8), new(5,2,-8));
        Miss(AirframeHitGeometry.Su27, new(0,2,-12), new(0,2,-4));
        Miss(AirframeHitGeometry.Su27, new(0,3.5,-8), new(5,3.5,-8));
    }
    [Fact] public void WingsAreThinAndSweptNotASpanWideBox() {
        Hit(AirframeHitGeometry.Su27, new(5,-1,-3), new(5,1,-3));
        Miss(AirframeHitGeometry.Su27, new(5,.2,-10), new(5,.2,10));
        Miss(AirframeHitGeometry.Su27, new(5,-1,4), new(5,1,4));
        Hit(AirframeHitGeometry.Su27, new(4,-1,-9.5), new(4,1,-9.5));
    }
    [Fact] public void TinyCanopyEndSectionsDoNotCreateUnboundedSolids() {
        // Just above the forward canopy pole: fuselage is below this height.
        Miss(AirframeHitGeometry.Su27,new(-1,1.001,7.01),new(1,1.001,7.01));
        Hit(AirframeHitGeometry.Su27,new(-1,1.001,6.95),new(1,1.001,6.95));
        Miss(AirframeHitGeometry.Su27,new(-1,2,6.95),new(1,2,6.95));
    }
    [Fact] public void F22HasItsOwnLengthSpanAndCantedFins() {
        Assert.Equal(18.9, AirframeHitGeometry.F22.Maximum.Z - AirframeHitGeometry.F22.Minimum.Z, 9);
        Assert.Equal(13.6, AirframeHitGeometry.F22.Maximum.X - AirframeHitGeometry.F22.Minimum.X, 9);
        Hit(AirframeHitGeometry.F22, new(-2,0,8), new(2,0,8));
        Miss(AirframeHitGeometry.F22, new(-2,0,10), new(2,0,10));
        Hit(AirframeHitGeometry.F22, new(6,-1,-2.4), new(6,1,-2.4));
        Miss(AirframeHitGeometry.F22, new(6.81,-1,-2.4), new(6.81,1,-2.4));
        Hit(AirframeHitGeometry.F22, new(0,2,-6.5), new(4,2,-6.5));
        Miss(AirframeHitGeometry.F22, new(0,2,-12), new(0,2,-3));
    }
    [Fact] public void PublishedSu27ExtentsAndSharedSu35PresentationArePinned() {
        Assert.Equal(21.935, AirframeHitGeometry.Su27.Maximum.Z - AirframeHitGeometry.Su27.Minimum.Z, 9);
        Assert.Equal(14.698, AirframeHitGeometry.Su27.Maximum.X - AirframeHitGeometry.Su27.Minimum.X, 9);
        Assert.Same(AirframeHitGeometry.Su27, AirframeHitGeometry.Su35);
    }
    [Fact] public void UsesBodyAttitudeRatherThanVelocityIncludingRollAndPitch() {
        var q = new QuaternionD(.71, .21, -.37, .52).Normalized();
        var state = Target with { BodyAttitude = q, Chi = 2, Gamma = .7, Bank = -.3 };
        Vec3D a = q.Rotate(new Vec3D(-3,0,10)), b = q.Rotate(new Vec3D(3,0,10));
        Assert.True(AirframeHitGeometry.Su27.TryEntry(state,a,b-a,0,1.0/120,out _));
        a = q.Rotate(new Vec3D(0,2,-12)); b = q.Rotate(new Vec3D(0,2,-4));
        Assert.False(AirframeHitGeometry.Su27.TryEntry(state,a,b-a,0,1.0/120,out _));
    }
    [Fact] public void UninitialisedAttitudeFallsBackToHeadingPitchAndBank() {
        var state = Target with { BodyAttitude = default, Chi = Math.PI/2, Bank = Math.PI/2 };
        Assert.True(AirframeHitGeometry.Su27.TryEntry(state,new(10,-3,0),new(0,6,0),0,1.0/120,out _));
    }
    [Fact] public void RotatingFinSweepsAcrossAStationaryRelativeRound() {
        // At z=-8, the right fin rotates rightward with positive body roll p.
        var state = Target with { BodyRates = new BodyRates(3,0,0) };
        Vec3D point = new(2.42,2,-8);
        Assert.False(AirframeHitGeometry.Su27.TryBodyEntry(point,Vec3D.Zero,out _));
        Assert.True(AirframeHitGeometry.Su27.TryEntry(state,point,Vec3D.Zero,0,.04,out _));
    }
    static GunKill FireAcrossNose(AirframeHitGeometry? shape, double z, double y = 0) {
        var gun = new GunKill(ammo:1,hitsToKill:1, targetGeometry:shape);
        var own = Target with { Position = new(-9,100+y,z), Chi = Math.PI/2,
            BodyAttitude = QuaternionD.FromFrame(new(0,0,-1),new(0,1,0),new(1,0,0)) };
        gun.Step(true,own,Target,1.0/120);
        return gun;
    }
    [Fact] public void RealRoundCrossesNoseWithinOne120HzTickWithoutTunnelling() {
        GunKill gun = FireAcrossNose(AirframeHitGeometry.Su27,10);
        Assert.Equal(1,gun.HitCount);
        Assert.Single(gun.ImpactsThisStep);
        Assert.InRange(gun.ImpactsThisStep[0].StepFraction,.1,.99);
        Assert.Equal(0,FireAcrossNose(null,10).HitCount);
    }
    [Fact] public void LegacySphereIsStillUsedOnlyWhenNoShapeIsSupplied() {
        Assert.Equal(1,FireAcrossNose(null,0,4).HitCount);
        Assert.Equal(0,FireAcrossNose(AirframeHitGeometry.Su27,0,4).HitCount);
    }
    [Fact] public void MovingTargetCrossesRoundChordAndEarliestAirframeWins() {
        var gun = new GunKill(ammo:1,hitsToKill:1,targetGeometry:AirframeHitGeometry.Su27);
        var own = Target with { Position=new(0,100,0) };
        // Target translates 10 m right during the tick; its body is still north-facing.
        var moving = Target with { Position=new(-5,100,15), Speed=1200, Chi=Math.PI/2 };
        gun.Step(true,own,9,new GunTarget[] { new(9,moving), new(3,moving with {Position=new(-5,100,40)}) },1.0/120);
        Assert.Equal(1,gun.TotalHitCount);
        Assert.Equal(9,Assert.Single(gun.ImpactsThisStep).TargetId);
    }
    [Fact] public void FinEntryFractionIsTheSurfaceNotTheCentreOrExit() {
        Assert.True(AirframeHitGeometry.Su27.TryBodyEntry(new(0,2,-8),new(5,0,0),out double fraction));
        Assert.Equal((2.3-.07)/5,fraction,9);
        Assert.True(AirframeHitGeometry.Su27.TryBodyEntry(new(2.3,2,-8),Vec3D.Zero,out fraction));
        Assert.Equal(0,fraction);
    }
    [Fact] public void TailChaseDoesNotInflateAirframe() {
        var own=Target with {Position=new(0,104,-100)};
        var physical=new GunKill(ammo:1,hitsToKill:1,targetGeometry:AirframeHitGeometry.Su27);
        var legacy=new GunKill(ammo:1,hitsToKill:1);
        physical.Step(true,own,Target,.2);
        legacy.Step(true,own,Target,.2);
        Assert.Equal(0,physical.HitCount);
        Assert.Equal(1,legacy.HitCount);
    }
    [Fact] public void ReplacementAndReliefGunsRetainGeometry() {
        var gun = new GunKill(targetGeometry:AirframeHitGeometry.Su27);
        
        Assert.Same(gun.TargetGeometry,gun.CreateForRetargetedTarget().TargetGeometry);
        Assert.Same(gun.TargetGeometry,gun.CreateForFreshShooterAgainstSameTarget(20,8,GunProfiles.SixM3FiftyCal).TargetGeometry);
        gun.ApplyExternalDestruction(gun.SelectedTargetId);
        Assert.Same(gun.TargetGeometry,gun.CreateForNextTarget().TargetGeometry);
        Assert.Same(gun.TargetGeometry,gun.CreateForStagedNextTarget().TargetGeometry);
    }
    [Fact] public void FrontDoorAndPracticeOptInWhileFrozenConfigsStayLegacy() {
        Assert.Same(AirframeHitGeometry.Su27,Beats.ModernVisualMerge().CombatRules.PlayerTargetGeometry);
        Assert.Same(AirframeHitGeometry.F22,Beats.ModernVisualMergeFirstRun().CombatRules.OpponentTargetGeometry);
        Assert.Null(Beats.ModernAceDuel().CombatRules.PlayerTargetGeometry);
        Assert.Null(CombatConfig.ModernVisualMerge.PlayerTargetGeometry); // shared Rapier fixture
        Assert.Null(CombatConfig.TopGunAcm.PlayerTargetGeometry);
        Assert.Null(CombatConfig.Fighter.OpponentTargetGeometry);
    }
    [Fact] public void ArenaHandicapSwitchesExistingGunsWithoutRepairOrRearming() {
        var session = new SimulationSession(7);
        var playerGun = session.PlayerGun;
        var enemyGun = session.OpponentGun;
        Assert.Same(AirframeHitGeometry.Su27,playerGun.TargetGeometry);
        Assert.True(playerGun.HasGimbal);
        Assert.NotNull(playerGun.FirePathClear);
        playerGun.FirePathClear = (_, _, _) => false;
        playerGun.Step(true, session.Player.State, session.Bandit.State, 0.01);
        Assert.True(playerGun.GimbalFireInhibited);
        int ammo = playerGun.AmmoRemaining;
        int damage = playerGun.TotalHitCount;
        session.SetArenaHandicap(BanditSkillProfile.For(PilotSkill.Competent),PilotSkill.Competent);
        Assert.Same(playerGun,session.PlayerGun);
        Assert.Same(enemyGun,session.OpponentGun);
        Assert.Null(playerGun.TargetGeometry);
        Assert.Null(enemyGun.TargetGeometry);
        Assert.False(playerGun.HasGimbal);
        Assert.Null(playerGun.FirePathClear);
        Assert.False(playerGun.GimbalFireInhibited);
        Assert.False(playerGun.GimbalTracking);
        Assert.Equal(0, playerGun.GimbalOffsetRad);
        Assert.Equal(ammo, playerGun.AmmoRemaining);
        Assert.Equal(damage, playerGun.TotalHitCount);
        session.ClearArenaHandicap();
        Assert.Same(AirframeHitGeometry.F22,enemyGun.TargetGeometry);
        Assert.Same(AirframeHitGeometry.Su27,playerGun.TargetGeometry);
        Assert.True(playerGun.HasGimbal);
        Assert.NotNull(playerGun.FirePathClear);
        Assert.Equal(ammo, playerGun.AmmoRemaining);
        Assert.Equal(damage, playerGun.TotalHitCount);
    }
    [Fact] public void ArenaTransitionKeepsAirborneRoundsDamageAndTriggerCadence() {
        var session = new SimulationSession(7);
        var gun = session.PlayerGun;
        var own = session.Player.State with {
            Position = new Vec3D(0, 3000, 0), Speed = 0, Gamma = 0, Chi = 0,
            BodyAttitude = QuaternionD.Identity
        };
        var target = own with { Position = new Vec3D(0, 3000, 150) };
        gun.Step(true, own, target, 0);
        gun.Step(false, own, target, 0.2);
        Assert.Equal(1, gun.TotalHitCount);
        gun.Step(true, own, target, 0);
        var rounds = gun.RoundsInFlight.ToArray();
        Assert.Single(rounds);
        int fired = gun.RoundsFired, ammo = gun.AmmoRemaining;
        session.SetArenaHandicap(BanditSkillProfile.For(PilotSkill.Competent), PilotSkill.Competent);
        Assert.Equal(rounds, gun.RoundsInFlight);
        Assert.Equal(1, gun.TotalHitCount);
        Assert.Equal(ammo, gun.AmmoRemaining);
        gun.Step(true, own, target, 0.001);
        Assert.Equal(fired, gun.RoundsFired); // held trigger must not restart cadence
        rounds = gun.RoundsInFlight.ToArray();
        session.ClearArenaHandicap();
        Assert.Equal(rounds, gun.RoundsInFlight);
        Assert.Equal(1, gun.TotalHitCount);
        Assert.Equal(ammo, gun.AmmoRemaining);
        gun.Step(true, own, target, 0.001);
        Assert.Equal(fired, gun.RoundsFired);
    }

}
