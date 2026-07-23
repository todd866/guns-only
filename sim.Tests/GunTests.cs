using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

public class GunTests {
    const double Dt = 1.0 / AircraftSim.TickHz;

    static AircraftState State(Vec3D position, double speed = 0.0, double chi = 0.0) =>
        new(position, speed, 0.0, chi, 0.0, FlightModel.Sabre.MassKg);

    static QuaternionD AimAttitude(in Vec3D forward) {
        var worldUp = new Vec3D(0.0, 1.0, 0.0);
        var up = (worldUp - forward * worldUp.Dot(forward)).Normalized();
        var right = up.Cross(forward).Normalized();
        return QuaternionD.FromFrame(right, up, forward);
    }

    [Fact]
    public void LeadSolutionPutsRoundOnCrossingTarget() {
        var gun = new GunKill(ammo: 1, hitsToKill: 1, hitRadiusM: 1.0);
        var own = State(Vec3D.Zero, speed: 210.0);
        var bandit = State(new Vec3D(0.0, 0.0, 650.0), speed: 170.0, chi: Math.PI / 2.0);

        // Refine the body-axis attitude against the kernel's solution while retaining the
        // ownship velocity vector: the fixed gun is on the body, not the flight path.
        for (int i = 0; i < 3; i++) {
            gun.Step(false, own, bandit, 0.0);
            own = own with { BodyAttitude = AimAttitude(gun.LeadDirection) };
        }
        Assert.True(gun.HasLeadSolution);
        Assert.True(gun.LeadDirection.X > 0.1, "a right-crossing target must require right lead");

        bool trigger = true;
        for (int i = 0; i < 360 && gun.Outcome == FightOutcome.Flying; i++) {
            gun.Step(trigger, own, bandit, Dt);
            trigger = false;
            own = own with { Position = own.Position + own.VelocityVector() * Dt };
            bandit = bandit with { Position = bandit.Position + bandit.VelocityVector() * Dt };
        }

        Assert.Equal(1, gun.HitCount);
        Assert.Equal(FightOutcome.Splash, gun.Outcome);
    }

    [Fact]
    public void RealHitsAccumulateDamageToSplash() {
        var gun = new GunKill();
        var own = State(Vec3D.Zero);
        var bandit = State(new Vec3D(0.0, 0.0, 500.0));

        for (int i = 0; i < 300 && gun.Outcome == FightOutcome.Flying; i++)
            gun.Step(true, own, bandit, Dt);

        Assert.Equal(GunKill.DefaultHitsToKill, gun.HitCount);
        Assert.Equal(1.0, gun.KillProgress, 12);
        Assert.Equal(0.0, gun.BanditHealth, 12);
        Assert.False(gun.BanditAlive);
        Assert.Equal(FightOutcome.Splash, gun.Outcome);
    }

    [Fact]
    public void PurePursuitNoseOnTargetBurstAtOneHundredMetresKills() {
        var gun = new GunKill();
        var own = State(new Vec3D(0.0, 3000.0, 0.0), speed: 210.0);
        // A modest crossing component is enough to make pure pursuit differ materially from the
        // exact lead point, while remaining a normal close tail-quarter guns pass.
        var bandit = State(new Vec3D(0.0, 3000.0, 140.0), speed: 170.0,
            chi: 15.0 * Math.PI / 180.0);
        double minFiringRange = double.PositiveInfinity;
        double maxFiringRange = 0.0;
        double maxNoseErrorDeg = 0.0;
        double maxLeadErrorDeg = 0.0;

        for (int i = 0; i < 120 && gun.Outcome == FightOutcome.Flying; i++) {
            double range = (bandit.Position - own.Position).Length;

            // This pilot flies PURE PURSUIT: body-forward follows only the bandit's CURRENT
            // position. It deliberately never reads LeadPipper or LeadDirection to aim the jet.
            var currentLos = (bandit.Position - own.Position).Normalized();
            own = own with { BodyAttitude = AimAttitude(currentLos) };
            var bodyForward = own.BodyAttitude.Rotate(new Vec3D(0.0, 0.0, 1.0));
            double noseErrorDeg = Math.Acos(Math.Clamp(bodyForward.Dot(currentLos), -1.0, 1.0))
                * 180.0 / Math.PI;
            bool firing = i < 72 && range is >= 100.0 and <= 150.0;
            if (firing) {
                minFiringRange = Math.Min(minFiringRange, range);
                maxFiringRange = Math.Max(maxFiringRange, range);
                maxNoseErrorDeg = Math.Max(maxNoseErrorDeg, noseErrorDeg);
            }

            gun.Step(firing, own, bandit, Dt);
            if (firing && gun.HasLeadSolution) {
                double leadErrorDeg = Math.Acos(Math.Clamp(bodyForward.Dot(gun.LeadDirection), -1.0, 1.0))
                    * 180.0 / Math.PI;
                maxLeadErrorDeg = Math.Max(maxLeadErrorDeg, leadErrorDeg);
            }
            own = own with { Position = own.Position + own.VelocityVector() * Dt };
            bandit = bandit with { Position = bandit.Position + bandit.VelocityVector() * Dt };
        }

        Assert.InRange(minFiringRange, 100.0, 150.0);
        Assert.InRange(maxFiringRange, 100.0, 150.0);
        Assert.InRange(maxNoseErrorDeg, 0.0, 2.0);
        Assert.True(maxLeadErrorDeg > 2.0,
            "the regression pilot must remain pure-pursuit, not accidentally fly the ideal lead point");
        Assert.True(gun.RoundsFired > gun.HitCount, "the earned envelope must still permit misses");
        Assert.Equal(GunKill.DefaultHitsToKill, gun.HitCount);
        Assert.Equal(FightOutcome.Splash, gun.Outcome);
        Assert.False(gun.BanditAlive);
    }

    [Fact]
    public void HeldTriggerUsesDeclaredCadenceWithoutSolutionGate() {
        var gun = new GunKill(ammo: 100, hitsToKill: 100);
        var own = State(Vec3D.Zero);
        var offAxisBandit = State(new Vec3D(300.0, 0.0, 0.0));

        for (int i = 0; i < 60; i++) gun.Step(true, own, offAxisBandit, Dt);

        Assert.Equal(8, gun.RoundsFired); // t=0 through t=0.4667 at 15 rounds/second
        Assert.Equal(0, gun.HitCount);
    }

    [Fact]
    public void AmmoDepletesAtFiniteCadence() {
        var gun = new GunKill(ammo: 3, hitsToKill: 100);
        var own = State(Vec3D.Zero);
        var offAxisBandit = State(new Vec3D(500.0, 0.0, 0.0));

        for (int i = 0; i < 120; i++) gun.Step(true, own, offAxisBandit, Dt);

        Assert.Equal(0, gun.AmmoRemaining);
        Assert.Equal(3, gun.RoundsFired);
        Assert.Equal(0, gun.HitCount);
    }

    [Fact]
    public void InfiniteGunHeatRisesAtConfiguredRate() {
        var gun = new GunKill(ammo: 1, hitsToKill: 100,
            heatConfig: GunHeatConfig.PlayerInfiniteAmmo);
        var own = State(Vec3D.Zero);
        var offAxisBandit = State(new Vec3D(500.0, 0.0, 0.0));

        for (int i = 0; i < 2 * AircraftSim.TickHz; i++)
            gun.Step(true, own, offAxisBandit, Dt);

        Assert.Equal(0.4, gun.BarrelHeat, 10);
        Assert.False(gun.BarrelOverheated);
        Assert.True(gun.RoundsFired > 1);
        Assert.Equal(1, gun.AmmoRemaining);
    }

    [Fact]
    public void InfiniteGunCoolsAtConfiguredRate() {
        var gun = new GunKill(ammo: 1, hitsToKill: 100,
            heatConfig: GunHeatConfig.PlayerInfiniteAmmo);
        var own = State(Vec3D.Zero);
        var offAxisBandit = State(new Vec3D(500.0, 0.0, 0.0));

        for (int i = 0; i < 5 * AircraftSim.TickHz; i++)
            gun.Step(true, own, offAxisBandit, Dt);
        Assert.True(gun.BarrelOverheated);
        Assert.Equal(1.0, gun.BarrelHeat, 12);

        for (int i = 0; i < 3 * AircraftSim.TickHz; i++)
            gun.Step(false, own, offAxisBandit, Dt);

        Assert.Equal(0.75, gun.BarrelHeat, 10);
        Assert.True(gun.BarrelOverheated);

        for (int i = 0; i < 9 * AircraftSim.TickHz; i++)
            gun.Step(false, own, offAxisBandit, Dt);

        Assert.Equal(0.0, gun.BarrelHeat, 12);
        Assert.False(gun.BarrelOverheated);
    }

    [Fact]
    public void InfiniteGunLatchesAtMaximumAndRearmsOnlyBelowThreshold() {
        var config = GunHeatConfig.PlayerInfiniteAmmo;
        var gun = new GunKill(ammo: 1, hitsToKill: 100, heatConfig: config);
        var own = State(Vec3D.Zero);
        var offAxisBandit = State(new Vec3D(500.0, 0.0, 0.0));

        for (int i = 0; i < 5 * AircraftSim.TickHz; i++)
            gun.Step(true, own, offAxisBandit, Dt);

        Assert.Equal(1.0, gun.BarrelHeat, 12);
        Assert.True(gun.BarrelOverheated);

        while (gun.BarrelHeat > config.RearmHeatThreshold)
            gun.Step(false, own, offAxisBandit, Dt);

        if (gun.BarrelHeat == config.RearmHeatThreshold) {
            Assert.True(gun.BarrelOverheated);
            gun.Step(false, own, offAxisBandit, Dt);
        }

        Assert.True(gun.BarrelHeat < config.RearmHeatThreshold);
        Assert.False(gun.BarrelOverheated);
    }

    [Fact]
    public void InfiniteGunRefusesFireWhileOverheatIsLatched() {
        var gun = new GunKill(ammo: 1, hitsToKill: 100,
            heatConfig: GunHeatConfig.PlayerInfiniteAmmo);
        var own = State(Vec3D.Zero);
        var offAxisBandit = State(new Vec3D(500.0, 0.0, 0.0));

        for (int i = 0; i < 5 * AircraftSim.TickHz; i++)
            gun.Step(true, own, offAxisBandit, Dt);

        int roundsAtLatch = gun.RoundsFired;
        for (int i = 0; i < AircraftSim.TickHz; i++) {
            gun.Step(true, own, offAxisBandit, Dt);
            Assert.False(gun.FiredThisStep);
        }

        Assert.True(gun.BarrelOverheated);
        Assert.Equal(roundsAtLatch, gun.RoundsFired);
        Assert.Equal(1, gun.AmmoRemaining);
    }

    [Fact]
    public void IdenticalThermalInputsProduceIdenticalHeatTrace() {
        var a = new GunKill(ammo: 1, hitsToKill: 100,
            heatConfig: GunHeatConfig.PlayerInfiniteAmmo);
        var b = new GunKill(ammo: 1, hitsToKill: 100,
            heatConfig: GunHeatConfig.PlayerInfiniteAmmo);
        var own = State(Vec3D.Zero);
        var bandit = State(new Vec3D(500.0, 0.0, 0.0));

        for (int tick = 0; tick < 20 * AircraftSim.TickHz; tick++) {
            bool trigger = tick < 4 * AircraftSim.TickHz
                || tick >= 7 * AircraftSim.TickHz && tick < 13 * AircraftSim.TickHz
                || tick >= 16 * AircraftSim.TickHz;
            a.Step(trigger, own, bandit, Dt);
            b.Step(trigger, own, bandit, Dt);

            Assert.Equal(a.BarrelHeat, b.BarrelHeat);
            Assert.Equal(a.BarrelOverheated, b.BarrelOverheated);
            Assert.Equal(a.FiredThisStep, b.FiredThisStep);
            Assert.Equal(a.RoundsFired, b.RoundsFired);
        }
    }

    [Fact]
    public void NoLeadSolutionFiresButMisses() {
        var gun = new GunKill(ammo: 12);
        var own = State(Vec3D.Zero);
        var beyondRoundLifetime = State(new Vec3D(0.0, 0.0, 4000.0));

        for (int i = 0; i < 420; i++) gun.Step(true, own, beyondRoundLifetime, Dt);

        Assert.False(gun.HasLeadSolution);
        Assert.False(gun.GunSolution);
        Assert.Equal(12, gun.RoundsFired);
        Assert.Equal(0, gun.HitCount);
        Assert.Equal(FightOutcome.Flying, gun.Outcome);
        Assert.Empty(gun.RoundsInFlight);
    }

    [Fact]
    public void GunSolutionRequiresStableAcquisitionAndRelease() {
        var gun = new GunKill();
        var own = State(Vec3D.Zero);
        var onAxis = State(new Vec3D(0.0, 0.0, 400.0));
        var offAxis = State(new Vec3D(300.0, 0.0, 400.0));

        gun.Step(false, own, onAxis, Dt);
        Assert.True(gun.InstantaneousGunSolution);
        Assert.False(gun.GunSolution);
        for (int i = 0; i < 12; i++) gun.Step(false, own, onAxis, Dt);
        Assert.True(gun.GunSolution);

        for (int i = 0; i < 6; i++) gun.Step(false, own, offAxis, Dt);
        Assert.False(gun.InstantaneousGunSolution);
        Assert.True(gun.GunSolution);
        for (int i = 0; i < 12; i++) gun.Step(false, own, offAxis, Dt);
        Assert.False(gun.GunSolution);
    }

    [Fact]
    public void IdenticalInputsProduceIdenticalRoundsAndDamage() {
        var a = new GunKill(ammo: 20);
        var b = new GunKill(ammo: 20);
        var own = State(Vec3D.Zero, 180.0);
        var bandit = State(new Vec3D(30.0, 10.0, 700.0), 145.0, 0.08);

        for (int i = 0; i < 240; i++) {
            bool trigger = i >= 5 && i < 130;
            Assert.Equal(a.Step(trigger, own, bandit, Dt), b.Step(trigger, own, bandit, Dt));
            Assert.Equal(a.AmmoRemaining, b.AmmoRemaining);
            Assert.Equal(a.HitCount, b.HitCount);
            Assert.Equal(a.RoundsInFlight, b.RoundsInFlight);
            own = own with { Position = own.Position + own.VelocityVector() * Dt };
            bandit = bandit with { Position = bandit.Position + bandit.VelocityVector() * Dt };
        }
    }

    [Fact]
    public void NextTargetPreservesWeaponStateButResetsTargetState() {
        var gun = new GunKill(ammo: 20, hitsToKill: 1, hitRadiusM: 1.0);
        var own = State(Vec3D.Zero);
        var bandit = State(new Vec3D(0.0, 0.0, 200.0));

        for (int i = 0; i < 120 && gun.Outcome == FightOutcome.Flying; i++)
            gun.Step(true, own, bandit, Dt);

        Assert.Equal(FightOutcome.Splash, gun.Outcome);
        Assert.NotEmpty(gun.RoundsInFlight);
        var next = gun.CreateForNextTarget();

        Assert.NotSame(gun, next);
        Assert.Equal(gun.AmmoRemaining, next.AmmoRemaining);
        Assert.Equal(gun.RoundsFired, next.RoundsFired);
        Assert.Equal(gun.RoundsInFlight, next.RoundsInFlight);
        Assert.Equal(0, next.HitCount);
        Assert.Equal(0, next.HitsThisStep);
        Assert.Equal(0.0, next.KillProgress, 12);
        Assert.Equal(1.0, next.BanditHealth, 12);
        Assert.True(next.BanditAlive);
        Assert.Equal(FightOutcome.Flying, next.Outcome);
        Assert.False(next.HasLeadSolution);
        Assert.False(next.GunSolution);
    }

    [Fact]
    public void NextTargetRejectsAStillFlyingEngagement() {
        var gun = new GunKill();

        var error = Assert.Throws<InvalidOperationException>(() => gun.CreateForNextTarget());

        Assert.Contains("only after", error.Message);
    }

    [Fact]
    public void FreshShooterKeepsExistingTargetDamageButOwnsFreshWeaponState() {
        var first = new GunKill(ammo: 1, hitsToKill: 3, hitRadiusM: 1.0);
        var own = State(Vec3D.Zero);
        var target = State(new Vec3D(0.0, 0.0, 200.0));

        for (int tick = 0; tick < 120 && first.HitCount == 0; tick++)
            first.Step(true, own, target, Dt);

        Assert.Equal(1, first.HitCount);
        Assert.Equal(FightOutcome.Flying, first.Outcome);
        var replacement = first.CreateForFreshShooterAgainstSameTarget(
            ammo: 13,
            hitRadiusM: GunProfiles.GSh301PublicDataSurrogate.EffectiveHitRadiusM,
            profile: GunProfiles.GSh301PublicDataSurrogate);

        Assert.Equal(first.HitCount, replacement.HitCount);
        Assert.Equal(first.TargetHealth, replacement.TargetHealth, 12);
        Assert.Equal(FightOutcome.Flying, replacement.Outcome);
        Assert.Equal(13, replacement.AmmoRemaining);
        Assert.Equal(0, replacement.RoundsFired);
        Assert.Empty(replacement.RoundsInFlight);
        Assert.Equal(GunProfiles.GSh301PublicDataSurrogate, replacement.Profile);
    }

    [Fact]
    public void NextTargetCanFireAtCadenceBoundaryWherePreviousTargetSplashes() {
        double interval = 1.0 / GunKill.RoundsPerSecond;
        var gun = new GunKill(ammo: 4, hitsToKill: 1, hitRadiusM: 0.05);
        var own = State(Vec3D.Zero);
        var boundaryTarget = State(new Vec3D(
            0.0,
            -0.5 * GunKill.GravityMps2 * interval * interval,
            4.0 + GunKill.MuzzleVelocityMps * interval));

        gun.Step(true, own, boundaryTarget, 0.0);
        Assert.Equal(1, gun.RoundsFired);
        Assert.Equal(FightOutcome.Splash, gun.Step(true, own, boundaryTarget, interval));

        var next = gun.CreateForNextTarget();
        var offAxisTarget = State(new Vec3D(300.0, 0.0, 0.0));
        next.Step(true, own, offAxisTarget, 0.0);

        Assert.Equal(2, next.RoundsFired);
        Assert.Equal(2, next.RoundsInFlight[^1].Id);
        Assert.Equal(2, next.AmmoRemaining);
        Assert.Equal(0, next.HitCount);
        Assert.Equal(FightOutcome.Flying, next.Outcome);
    }

    [Fact]
    public void BallisticFunnelPointWithoutRotationIsTheGravityDroopedGunLine() {
        // Zero angular velocity: the shooter's own displacement cancels exactly, leaving rounds
        // riding the gun line at muzzle velocity and falling with gravity — independent of the
        // shooter's velocity vector.
        var position = new Vec3D(120.0, 2500.0, -800.0);
        var velocity = new Vec3D(30.0, -8.0, 220.0);
        var forward = new Vec3D(0.1, -0.03, 0.99).Normalized();
        const double MuzzleVelocity = 870.0;

        foreach (double age in new[] { 0.0, 0.3, 0.9 }) {
            Vec3D sample = GunKill.BallisticFunnelPoint(position, velocity, forward,
                Vec3D.Zero, MuzzleVelocity, age);
            Vec3D expected = position + forward * GunKill.MuzzleOffsetM
                + forward * (MuzzleVelocity * age)
                + new Vec3D(0.0, -0.5 * GunKill.GravityMps2 * age * age, 0.0);
            Assert.True((sample - expected).Length < 1e-9,
                $"age {age}: {(sample - expected).Length} m off the drooped gun line");
        }
    }

    [Fact]
    public void BallisticFunnelPointLagsBelowTheGunLineDuringAPitchUpPull() {
        // Level flight, nose north, pulling up at a steady positive pitch rate: rounds fired a
        // moment ago left along a LOWER gun line, so the funnel locus must hang below the current
        // boresight, and monotonically more so with age.
        var position = new Vec3D(0.0, 3000.0, 0.0);
        var forward = new Vec3D(0.0, 0.0, 1.0);
        var up = new Vec3D(0.0, 1.0, 0.0);
        var velocity = forward * 230.0;
        Vec3D omega = GunKill.WorldAngularVelocity(forward, up,
            new BodyRates(0.0, 0.20, 0.0)); // ~11.5 deg/s pitch-up

        double previousDepression = 0.0;
        foreach (double age in new[] { 0.225, 0.45, 0.675, 0.9 }) {
            Vec3D sample = GunKill.BallisticFunnelPoint(position, velocity, forward,
                omega, GunKill.MuzzleVelocityMps, age);
            Vec3D line = sample - position;
            double depressionRad = Math.Atan2(-(line.Y - line.Z * forward.Y), line.Z);
            Assert.True(depressionRad > previousDepression,
                $"age {age}: depression {depressionRad} rad must grow below the gun line");
            previousDepression = depressionRad;
        }
        // At 0.9 s of age the lag must dominate gravity drop: more than 2 degrees below boresight.
        Assert.True(previousDepression > 2.0 * Math.PI / 180.0);
    }
}
