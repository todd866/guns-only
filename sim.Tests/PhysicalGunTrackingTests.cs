using GunsOnly.Sim.Doctrine;
using Xunit;

namespace GunsOnly.Sim.Tests;

/// Deterministic contracts for the physical opponent tracking seam. These tests exercise the
/// belief-limited ActorObservation path, fixed-barrel emission, and bounded pilot controls.
/// Synthetic observations isolate policy; the pressure suite flies the complete engagement.
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
    [InlineData(true)]
    [InlineData(false)]
    public void SnapshotUsesBallisticLeadRatherThanCrossingContactsCurrentPosition(bool physical) {
        var own = new AircraftState(new Vec3D(0, 3000, 0), 250, 0, 0, 0,
            FlightModel.Su27SPublicDataSurrogate.MassKg, BodyAttitude: QuaternionD.Identity);
        var tracker = new ReactiveBandit(own, FlightModel.Su27SPublicDataSurrogate, PilotSkill.Ace);
        if (physical) tracker.ConfigureGunTracking(Profile);
        // An exactly solvable constant-velocity crossing: the target is well left of the
        // nose, but its intercept is two degrees right. This is a poor snapshot, not a
        // tracking shot, and no collision geometry is used to authorize it.
        const double flightSeconds = 0.65;
        double angle = 2 * Math.PI / 180;
        var lead = new Vec3D(Math.Sin(angle), 0, Math.Cos(angle));
        var velocity = new Vec3D(180, 0, 0);
        var position = Muzzle(tracker.State)
            + (tracker.State.VelocityVector() + lead * Profile.MuzzleVelocityMps - velocity) * flightSeconds
            + new Vec3D(0, -0.5 * GunKill.GravityMps2 * flightSeconds * flightSeconds, 0);
        var contact = ActorObservation.Capture(Target(position));
        Assert.False(BanditFireControl.InFiringEnvelope(tracker.State, contact,
            BanditSkillProfile.For(PilotSkill.Ace).FireConeRad));
        Assert.Equal(physical, tracker.WantsToFire(contact));
        Assert.Equal(physical, tracker.PressureBurstActive);
        Assert.Equal(physical ? 1 : 0, tracker.PressureBurstsFired);
        if (physical) {
            var solution = tracker.TrackingSolution(contact);
            Assert.True(solution.HasLeadSolution);
            Assert.Equal(angle, solution.BoreErrorRad, 8);
            Assert.True(tracker.WantsToFire(contact));
            Assert.Equal(1, tracker.PressureBurstsFired);
            var gun = new GunKill(profile: Profile, targetGeometry: AirframeHitGeometry.F22);
            gun.Step(tracker.WantsToFire(contact), tracker.State, Target(position), Dt);
            var round = Assert.Single(gun.RoundsInFlight);
            Vec3D launchVelocity = round.Velocity
                + new Vec3D(0, GunKill.GravityMps2 * round.AgeSeconds, 0);
            Vec3D expectedVelocity = tracker.State.VelocityVector()
                + GunKill.GunDirection(tracker.State) * Profile.MuzzleVelocityMps;
            Assert.InRange((launchVelocity - expectedVelocity).Length, 0, 1e-8);
            Assert.Null(gun.Gimbal);
        }

        // The same burst must stop as soon as its lead leaves the gate, when the
        // current contact also leaves its snapshot gate. Repeated queries cannot spend another burst.
        var noseContact = ActorObservation.Capture(Target(new(500, 3000, 700)));
        Assert.False(BanditFireControl.InFiringEnvelope(tracker.State, noseContact));
        if (physical) {
            Assert.False(tracker.WantsToFire(noseContact));
            Assert.False(tracker.WantsToFire(contact));
            Assert.Equal(1, tracker.PressureBurstsFired);
        }
    }

    [Theory]
    [InlineData(119.0)]
    [InlineData(901.0)]
    public void PhysicalSnapshotsKeepTheExistingGunRange(double range) {
        var tracker = Tracker();
        var bore = GunKill.GunDirection(tracker.State);
        var right = new Vec3D(0, 1, 0).Cross(bore).Normalized();
        double angle = 2 * Math.PI / 180;
        var contact = ActorObservation.Capture(Target(tracker.State.Position
            + (bore * Math.Cos(angle) + right * Math.Sin(angle)) * range, 250, 0));
        var solution = tracker.TrackingSolution(contact);
        Assert.True(solution.HasLeadSolution);
        Assert.InRange(solution.BoreErrorRad * 180 / Math.PI, 0.81, 3.5);
        Assert.False(tracker.WantsToFire(contact));
        Assert.Equal(0, tracker.PressureBurstsFired);
    }

    [Fact]
    public void PhysicalSnapshotsRemainShortSpacedAndBudgeted() {
        var tracker = Tracker();
        var starts = new List<double>();
        double currentBurstSeconds = 0;
        int previousCount = 0;
        for (int tick = 0; tick < 34 * AircraftSim.TickHz; tick++) {
            var own = tracker.State;
            var bore = GunKill.GunDirection(own);
            var right = new Vec3D(0, 1, 0).Cross(bore).Normalized();
            double angle = 2 * Math.PI / 180;
            var lead = bore * Math.Cos(angle) + right * Math.Sin(angle);
            const double tof = 0.5;
            // Synthetic observations keep a poor two-degree shot available as the pilot
            // flies. Stale samples deliberately clear acceleration estimation: this is a
            // trigger-clock contract, not a second model of a flyable target trajectory.
            var target = own with { Position = Muzzle(own) + lead * (Profile.MuzzleVelocityMps * tof)
                + new Vec3D(0, -0.5 * GunKill.GravityMps2 * tof * tof, 0) };
            var observation = ActorObservation.Capture(target, tick) with { ObservationAgeTicks = 1 };
            bool fire = tracker.WantsToFire(observation);
            if (tracker.PressureBurstsFired > previousCount) {
                starts.Add(tick * Dt);
                previousCount = tracker.PressureBurstsFired;
                currentBurstSeconds = 0;
            }
            if (fire) {
                Assert.True(tracker.PressureBurstActive);
                currentBurstSeconds += Dt;
                Assert.True(currentBurstSeconds <= ReactiveBandit.PressureBurstSeconds + Dt + 1e-8);
            }
            tracker.Step(observation, Dt);
        }
        Assert.Equal(ReactiveBandit.PressureBurstLimit, starts.Count);
        for (int i = 1; i < starts.Count; i++)
            Assert.InRange(starts[i] - starts[i - 1], ReactiveBandit.PressureBurstIntervalSeconds - 1e-8,
                ReactiveBandit.PressureBurstIntervalSeconds + Dt + 1e-8);
    }

    [Theory]
    [InlineData(true, true, true)]
    [InlineData(false, true, false)]
    [InlineData(true, false, false)]
    public void ClosingRampApproachCanRollLiftBelowTheGunLine(
        bool ramp, bool reciprocal, bool noseLowRoll) {
        var initial = new AircraftState(new Vec3D(0, 3000, 0), 250, 0, 0, 0,
            FlightModel.Su27SPublicDataSurrogate.MassKg, BodyAttitude: QuaternionD.Identity);
        var tracker = new ReactiveBandit(initial, FlightModel.Su27SPublicDataSurrogate, PilotSkill.Ace)
            { AttackReengagementEnabled = ramp };
        tracker.ConfigureGunTracking(Profile);
        var target = Target(new(0, 2920, 1000), 250, reciprocal ? Math.PI : 0);
        var observation = ActorObservation.Capture(target);
        Assert.False(tracker.WantsToFire(observation)); // still beyond the firing range
        tracker.Step(observation, Dt);
        Assert.Equal(noseLowRoll, Math.Abs(tracker.LastCommand.BankTarget) > Math.PI / 2);
        Assert.InRange(Math.Abs(tracker.LastCommand.BankTarget), 0, 2.6);
        Assert.InRange(tracker.LastCommand.GDemand, -0.2, 9.0);
        Assert.False(tracker.LastCommand.EnvelopeOverride);
        Assert.InRange((tracker.State.Position - initial.Position).Length, 0, 250 * Dt + 0.1);
    }

    [Theory]
    [InlineData(true, 1399.0, true)]
    [InlineData(true, 1401.0, true)]
    [InlineData(true, 2399.0, true)]
    [InlineData(true, 2401.0, false)]
    [InlineData(false, 1399.0, true)]
    [InlineData(false, 1401.0, false)]
    public void OnlyClosingRampAcePreparesTheShotBeyondNormalCaptureRange(
        bool ramp, double range, bool expectedTracking) {
        var initial = new AircraftState(new Vec3D(0, 3000, 0), 250, 0, 0, 0,
            FlightModel.Su27SPublicDataSurrogate.MassKg, BodyAttitude: QuaternionD.Identity);
        var tracker = new ReactiveBandit(initial, FlightModel.Su27SPublicDataSurrogate, PilotSkill.Ace)
            { AttackReengagementEnabled = ramp };
        tracker.ConfigureGunTracking(Profile);
        var target = Target(initial.Position + new Vec3D(0, -0.05, Math.Sqrt(1 - 0.05 * 0.05)) * range,
            250, Math.PI) with { Bank = 0.4 };
        var observation = ActorObservation.Capture(target);
        Assert.False(tracker.WantsToFire(observation));
        tracker.Step(observation, Dt);
        Assert.Equal(expectedTracking, tracker.FineTrackLatched);
    }

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

    [Theory]
    [InlineData(PilotSkill.Ace, true, false, true)]
    [InlineData(PilotSkill.Ace, true, true, false)]
    [InlineData(PilotSkill.Ace, false, false, false)]
    [InlineData(PilotSkill.Competent, true, false, false)]
    [InlineData(PilotSkill.Veteran, true, false, false)]
    public void OnlyEarnedPhysicalAceStartsFightingBeforeTheScriptedPass(
        PilotSkill skill, bool physical, bool presenting, bool expectedFight) {
        var initial = new AircraftState(new Vec3D(0, 3000, 0), 250, 0, 0, 0,
            FlightModel.Su27SPublicDataSurrogate.MassKg);
        var bandit = new NeutralMergeBandit(initial, FlightModel.Su27SPublicDataSurrogate,
            skill, presenting: presenting);
        var observation = ActorObservation.Capture(Target(new(0, 3000, 4000), 250, Math.PI));
        var before = bandit.State; // AircraftSim initializes body attitude from trim.
        if (physical) bandit.ConfigureGunTracking(Profile);
        Assert.Equal(before, bandit.State);

        bandit.Step(observation, Dt);

        Assert.Equal(expectedFight, bandit.FirstPassComplete);
        Assert.Equal(presenting, bandit.Presenting);
        if (expectedFight) {
            Assert.Equal(skill, bandit.FightSkill);
            Assert.Equal(FlightModel.Su27SPublicDataSurrogate, bandit.FightAircraftParameters);
        }
        // Handoff preserves the airframe: only this tick's ordinary integration moves it.
        Assert.InRange((bandit.State.Position - initial.Position).Length, 0, initial.Speed * Dt + 0.1);
        Assert.InRange(Math.Abs(bandit.State.Speed - initial.Speed), 0, 1.0);
        Assert.False(bandit.WantsToFire(observation)); // still well outside the 900 m gun gate
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
