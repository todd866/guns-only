using GunsOnly.Sim.Doctrine;
using Xunit;

namespace GunsOnly.Sim.Tests;

/// Deterministic contracts for the physical opponent tracking seam. These tests exercise the
/// belief-limited ActorObservation path; they do not fire rounds, move an aircraft by hand, or
/// alter production tuning.
public sealed class PhysicalGunTrackingTests {
    const double Dt = 1.0 / AircraftSim.TickHz;
    static readonly GunProfile Profile = GunProfiles.GSh301PublicDataSurrogate;

    static ReactiveBandit Tracker() {
        var own = new AircraftState(new Vec3D(0, 3000, 0), 250, 0, 0, 0,
            FlightModel.Su27SPublicDataSurrogate.MassKg);
        var tracker = new ReactiveBandit(own, FlightModel.Su27SPublicDataSurrogate,
            PilotSkill.Ace, profile: BanditSkillProfile.For(PilotSkill.Ace));
        tracker.ConfigureGunTracking(Profile);
        return tracker;
    }

    static AircraftState Target(Vec3D position, double speed = 180, double chi = Math.PI / 2) =>
        new(position, speed, 0, chi, 0, FlightModel.F22APublicDataSurrogate.MassKg);

    static Vec3D Muzzle(in AircraftState own) =>
        own.Position + GunKill.GunDirection(own) * GunKill.MuzzleOffsetM;

    [Theory]
    [InlineData(600.0)]
    [InlineData(1050.0)]
    public void ConstantVelocityCrossingUsesExactMuzzleAndConfiguredProfileLead(double muzzleSpeed) {
        ReactiveBandit tracker = Tracker();
        var profile = Profile with { MuzzleVelocityMps = muzzleSpeed };
        tracker.ConfigureGunTracking(profile);
        AircraftState target = Target(new(250, 3000, 900));
        ActorObservation observation = ActorObservation.Capture(target, contactIdentity: 11);

        GunBallisticSolution observed = tracker.TrackingSolution(observation);
        GunBallisticSolution expected = GunKill.EvaluateBallisticLead(
            tracker.State.Position, tracker.State.VelocityVector(),
            GunKill.GunDirection(tracker.State), target.Position, target.VelocityVector(),
            profile, 1.0, Muzzle(tracker.State));

        Assert.True(observed.HasLeadSolution);
        Assert.Equal(expected.TimeOfFlightSeconds, observed.TimeOfFlightSeconds, 12);
        Assert.Equal(expected.LeadDirection.X, observed.LeadDirection.X, 12);
        Assert.Equal(expected.LeadDirection.Y, observed.LeadDirection.Y, 12);
        Assert.Equal(expected.LeadDirection.Z, observed.LeadDirection.Z, 12);
    }

    [Fact]
    public void RepeatingSameTimeObservationDoesNotAdvanceTrackingEstimate() {
        ReactiveBandit tracker = Tracker();
        ActorObservation observation = ActorObservation.Capture(
            Target(new(400, 3000, 1700)), contactIdentity: 17);

        GunBallisticSolution first = tracker.TrackingSolution(observation);
        GunBallisticSolution repeated = tracker.TrackingSolution(observation);

        Assert.Equal(first, repeated);
    }

    [Fact]
    public void ObservationAccelerationImprovesLeadAgainstKnownConstantAcceleration() {
        ReactiveBandit tracker = Tracker();
        const double accelerationMps2 = 35.0;
        const double initialSpeedMps = 120.0;
        const double startRangeM = 1200.0;
        GunBallisticSolution observed = default;
        GunBallisticSolution constantVelocity = default;
        AircraftState finalTarget = default;

        // Step is the only clock advance. The target is a known constant-acceleration crossing;
        // the comparison uses the same current shooter state and actual configured profile.
        for (int tick = 0; tick <= 60; tick++) {
            double t = tick * Dt;
            double x = initialSpeedMps * t + 0.5 * accelerationMps2 * t * t;
            double speed = initialSpeedMps + accelerationMps2 * t;
            AircraftState target = Target(new(x, 3000, startRangeM), speed);
            finalTarget = target;
            ActorObservation observation = ActorObservation.Capture(
                target, sourceTick: tick, contactIdentity: 21);
            observed = tracker.TrackingSolution(observation);
            constantVelocity = GunKill.EvaluateBallisticLead(
                tracker.State.Position, tracker.State.VelocityVector(),
                GunKill.GunDirection(tracker.State), target.Position, target.VelocityVector(),
                Profile, 1.0, Muzzle(tracker.State));
            if (tick < 60) tracker.Step(observation, Dt);
        }

        Assert.True(observed.HasLeadSolution && constantVelocity.HasLeadSolution);
        double observedMiss = ProjectileMiss(tracker.State, observed, finalTarget,
            accelerationMps2);
        double constantVelocityMiss = ProjectileMiss(tracker.State, constantVelocity,
            finalTarget, accelerationMps2);
        Assert.True(observedMiss < constantVelocityMiss,
            $"acceleration-aware miss={observedMiss:R}, constant-velocity miss={constantVelocityMiss:R}");
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void ContactSwitchOrSameTickStaleSampleClearsAcceleration(bool staleSameContact) {
        ReactiveBandit tracker = Tracker();
        for (int tick = 0; tick < 20; tick++) {
            double t = tick * Dt;
            var target = Target(new(100 * t * t, 3000, 1800), 120 + 20 * t);
            ActorObservation observation = ActorObservation.Capture(
                target, sourceTick: tick, contactIdentity: 31);
            _ = tracker.TrackingSolution(observation);
            tracker.Step(observation, Dt);
        }

        AircraftState replacement = Target(new(-300, 3000, 1900), 210, -Math.PI / 2);
        ActorObservation switched = ActorObservation.Capture(replacement,
            sourceTick: 20, contactIdentity: staleSameContact ? 31 : 32);
        if (staleSameContact) {
            _ = tracker.TrackingSolution(switched);
            switched = switched with { ObservationAgeTicks = 1 };
        }
        GunBallisticSolution observed = tracker.TrackingSolution(switched);
        GunBallisticSolution expected = GunKill.EvaluateBallisticLead(
            tracker.State.Position, tracker.State.VelocityVector(),
            GunKill.GunDirection(tracker.State), replacement.Position,
            replacement.VelocityVector(), Profile, 1.0, Muzzle(tracker.State));

        Assert.InRange((expected.LeadDirection - observed.LeadDirection).Length, 0, 1e-12);
        Assert.Equal(expected.TimeOfFlightSeconds, observed.TimeOfFlightSeconds, 12);
    }

    static double ProjectileMiss(in AircraftState own, in GunBallisticSolution solution,
        in AircraftState targetAtImpact, double accelerationMps2) {
        double t = solution.TimeOfFlightSeconds;
        Vec3D projectile = Muzzle(own)
            + (own.VelocityVector() + solution.LeadDirection * Profile.MuzzleVelocityMps) * t
            + new Vec3D(0, -0.5 * GunKill.GravityMps2 * t * t, 0);
        // The final observation is the same target used by both solutions. Its continuation is
        // authoritative for this synthetic constant-acceleration trajectory.
        Vec3D target = targetAtImpact.Position
            + targetAtImpact.VelocityVector() * t
            + new Vec3D(0.5 * accelerationMps2 * t * t, 0, 0);
        return (projectile - target).Length;
    }

    [Fact]
    public void F22BodyOriginIsInsideTrueFuselageForShortAimRay() {
        Assert.True(AirframeHitGeometry.F22.TryBodyEntry(
            Vec3D.Zero, new Vec3D(0, 0, 0.5), out double fraction));
        Assert.Equal(0, fraction);
    }

    [Fact]
    public void PhysicalTrackingIsScopedToModernCombatRoute() {
        static GunProfile? TrackingProfile(IBandit bandit) => bandit switch {
            ReactiveBandit reactive => reactive.TrackingGun,
            NeutralMergeBandit merge => merge.TrackingGun,
            _ => null,
        };
        static SimulationSession Stage(Func<BeatSetup> beat) {
            var session = new SimulationSession();
            session.StartBeat(beat);
            session.Begin();
            session.StepFixed();
            return session;
        }

        SimulationSession modern = Stage(Beats.ModernVisualMerge);
        Assert.NotNull(TrackingProfile(modern.Bandit));
        Assert.Null(modern.OpponentGun.Gimbal);

        SimulationSession ace = Stage(Beats.ModernAceDuel);
        Assert.Null(TrackingProfile(ace.Bandit));
        Assert.Null(ace.OpponentGun.Gimbal);

        SimulationSession firstRun = Stage(Beats.ModernVisualMergeFirstRun);
        Assert.Null(TrackingProfile(firstRun.Bandit));
        Assert.Null(firstRun.OpponentGun.Gimbal);

        SimulationSession arena = Stage(Beats.ModernVisualMerge);
        Assert.True(arena.SetArenaHandicap(
            BanditSkillProfile.For(PilotSkill.Competent), PilotSkill.Competent));
        arena.StepFixed();
        Assert.Null(TrackingProfile(arena.Bandit));
        Assert.Null(arena.OpponentGun.Gimbal);
    }
}
