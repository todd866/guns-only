using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

/// The sortie ledgers exist because the per-engagement weapon graph is not a sortie total. They
/// are only worth publishing if they agree with the guns they are summarising, and the two ways
/// a gun is replaced disagree about what the successor inherits:
///
///   * GunKill.CreateReplacementTarget (CreateForStagedNextTarget / CreateForRetargetedTarget)
///     carries RoundsFired FORWARD and starts damage at zero — the player's gun at every
///     engagement boundary and every drone-raid target advance, and the opponent guns handed to
///     a relief fighter.
///   * GunKill.CreateForFreshShooterAgainstTargets starts rounds at zero and INHERITS damage —
///     the relief fighter's own gun.
///
/// A new object is a new ledger key either way, so a baseline that assumes one family banks the
/// other family's running total a second time. These tests pin both directions.
public class SortieGunLedgerTests {
    static AircraftState ModernState(double z, double speed, double chi, double mass) => new(
        new Vec3D(0.0, 5486.4, z), speed, 0.0, chi, 0.0, mass);

    /// The ContinuousCombatTests close-tail geometry with a magazine deep enough to fly several
    /// engagements on one weapon graph, which is what makes the re-bank visible.
    static BeatSetup CloseTailFixture(int playerAmmo = 400) {
        BeatSetup modern = Beats.ModernVisualMerge();
        return modern with {
            Player = ModernState(0.0, 300.0, 0.0,
                FlightModel.F22APublicDataSurrogate.MassKg),
            Bandit = ModernState(160.0, 285.0, 0.0,
                FlightModel.Su27SPublicDataSurrogate.MassKg),
            UsesNeutralMergeBandit = false,
            UsesReactiveBandit = false,
            VisualMergeEvaluation = null,
            Combat = new CombatConfig(
                PlayerAmmo: playerAmmo,
                OpponentAmmo: 13,
                PlayerHitsToDefeat: 3,
                OpponentHitsToDefeat: 1,
                PlayerGun: GunProfiles.M61A2PublicDataSurrogate,
                OpponentGun: GunProfiles.GSh301PublicDataSurrogate),
            ContinuousCombat = new ContinuousCombatConfig(
                ReplacementDelaySeconds: 0.5, MaximumFormationSize: 1)
        };
    }

    // The player's gun is the ONE counter that already survives an engagement boundary intact:
    // CreateReplacementTarget copies RoundsFired forward precisely so cumulative fire evidence
    // is continuous. So the ledger has nothing to add for the player — it must simply AGREE with
    // the gun. It disagreed by the whole inherited total at every boundary.
    [Fact]
    public void PlayerRoundsLedgerTracksTheInheritedGunTotalAcrossAnEngagementBoundary() {
        var session = new SimulationSession();
        session.StartBeat(() => CloseTailFixture());
        session.Begin();
        session.FeedKey(GKey.Trigger, true);

        for (int tick = 0; tick < 6 * AircraftSim.TickHz && session.KillCount == 0; tick++)
            session.StepFixed();
        Assert.Equal(1, session.KillCount);
        long firstSpawnSequence = session.BanditSpawnSequence;
        int roundsAtSplash = session.PlayerGun.RoundsFired;
        int hitsAtSplash = session.PlayerGun.TotalHitCount;
        Assert.True(roundsAtSplash > 0, "the fixture never fired a round");
        Assert.True(hitsAtSplash > 0, "the fixture never scored a hit");
        Assert.Equal(roundsAtSplash, session.SortiePlayerRoundsFired);
        Assert.Equal(hitsAtSplash, session.SortiePlayerHits);

        // Cross the boundary and keep shooting into the successor.
        for (int tick = 0; tick < 6 * AircraftSim.TickHz
            && session.BanditSpawnSequence == firstSpawnSequence; tick++)
            session.StepFixed();
        Assert.Equal(firstSpawnSequence + 1, session.BanditSpawnSequence);
        Assert.Equal(2, session.EngagementNumber);
        for (int tick = 0; tick < 3 * AircraftSim.TickHz; tick++)
            session.StepFixed();

        int roundsAfterBoundary = session.PlayerGun.RoundsFired;
        Assert.True(roundsAfterBoundary > roundsAtSplash,
            "the successor engagement never fired, so the boundary was not crossed under fire");
        Assert.Equal(roundsAfterBoundary, session.SortiePlayerRoundsFired);

        // The asymmetry that justifies publishing sortie_hits at all: the staged successor's
        // damage ledger starts clean, so `hits` genuinely DOES lose the first engagement's score
        // while the sortie ledger keeps it. This is what `rounds_fired` does NOT do.
        Assert.Equal(hitsAtSplash + session.PlayerGun.TotalHitCount,
            session.SortiePlayerHits);
        Assert.True(session.SortiePlayerHits >= hitsAtSplash);
    }

    static AircraftState HandoffState(Vec3D position, double speed, double heading,
        double mass) => new(
            position, speed, 0.0, heading, 0.0, mass, QuaternionD.Identity);

    /// The CombatHandoffTests fixture, trimmed to what the ledger needs: a continuous-combat F-22
    /// beat (the only shape that accepts KNOCK IT OFF) with a live opponent magazine.
    static BeatSetup HandoffFight(int opponentAmmo) => new(
        "Sortie ledger handoff fixture",
        HandoffState(new Vec3D(0.0, 5000.0, 0.0), 220.0, 0.0,
            FlightModel.F22APublicDataSurrogate.MassKg),
        HandoffState(new Vec3D(0.0, 5000.0, 3000.0), 210.0, Math.PI,
            FlightModel.Su27SPublicDataSurrogate.MassKg),
        new PurePursuitLaw(),
        new() { (0.0, new PilotCommand(1.0, 0.0, 0.75, 0.0)) },
        PlayerParams: FlightModel.F22APublicDataSurrogate,
        BanditParams: FlightModel.Su27SPublicDataSurrogate,
        UsesReactiveBandit: false,
        Combat: new CombatConfig(
            PlayerAmmo: 40,
            OpponentAmmo: opponentAmmo,
            PlayerHitsToDefeat: 3,
            OpponentHitsToDefeat: 2,
            PlayerGun: GunProfiles.M61A2PublicDataSurrogate,
            OpponentGun: GunProfiles.GSh301PublicDataSurrogate),
        Fuel: new FuelConfig(
            CapacityLb: 12_000.0,
            InitialFuelLb: 8_000.0,
            BingoThresholdLb: 3_000.0,
            ConsumesFuel: false),
        PlayerCapability: AircraftCapability.F22ASurrogate,
        BanditCapability: AircraftCapability.Su27SSurrogate,
        ContinuousCombat: new ContinuousCombatConfig(
            ReplacementDelaySeconds: 0.1, MaximumFormationSize: 1),
        BanditSkill: PilotSkill.Ace);

    /// Fire one round from `gun` at a target it cannot hit, so RoundsFired advances deterministically
    /// without any damage bookkeeping getting involved.
    static void LaunchMiss(GunKill gun, long targetId) {
        AircraftState shooter = HandoffState(
            Vec3D.Zero, 0.0, 0.0, FlightModel.F22APublicDataSurrogate.MassKg);
        AircraftState target = shooter with {
            Position = new Vec3D(1000.0, 0.0, 2500.0)
        };
        var targets = new[] { new GunTarget(targetId, target) };
        gun.Step(false, shooter, targetId, targets, 0.0);
        gun.Step(true, shooter, targetId, targets, 0.0);
    }

    // The opponent side reaches CreateReplacementTarget through the combat handoff:
    // RetargetOpponentGun re-stages every live opponent gun against the relief fighter, carrying
    // RoundsFired forward into a brand-new object.
    [Fact]
    public void OpponentRoundsLedgerSurvivesTheReliefHandoffWithoutRebanking() {
        var session = new SimulationSession();
        session.StartBeat(() => HandoffFight(opponentAmmo: 40));
        session.Begin();
        GunKill opponentGun = session.OpponentGun;
        long primaryTargetId = session.PlayerGun.SelectedTargetId;

        // Put real rounds on the primary opponent's gun, then let the session bank them.
        for (int shot = 0; shot < 6; shot++)
            LaunchMiss(opponentGun, targetId: 0);
        session.StepFixed();
        int opponentRoundsBefore = opponentGun.RoundsFired;
        Assert.True(opponentRoundsBefore >= 6,
            $"expected the opponent gun to have fired, saw {opponentRoundsBefore}");
        Assert.Equal(opponentRoundsBefore, session.SortieOpponentRoundsFired);

        session.FeedKey(GKey.KnockItOff, true);
        for (int tick = 0; tick < 8
            && session.CombatHandoffPhase < CombatHandoffPhase.ReliefEngaged; tick++)
            session.StepFixed();
        Assert.Equal(CombatHandoffPhase.ReliefEngaged, session.CombatHandoffPhase);

        GunKill retargeted = Assert.IsType<GunKill>(
            session.ReliefTargetingOpponentGunForTest(primaryTargetId));
        Assert.NotSame(opponentGun, retargeted);
        Assert.Equal(opponentRoundsBefore, retargeted.RoundsFired);

        // The retargeted gun INHERITED the running total. Banking it as a first sighting would
        // report those rounds twice.
        Assert.Equal(opponentRoundsBefore, session.SortieOpponentRoundsFired);
    }

    // The invariant behind AccumulateSortieLedgers() sitting in front of the engagement-active
    // guard. A drone raid deliberately never starts engagement counters (a dogfight report would
    // misattribute the whole raid to one staged skill), so if the ledgers moved behind the guard
    // every drone-raid sortie would report zero rounds fired.
    [Fact]
    public void SortieLedgersAccrueOnASortieThatNeverStartsEngagementCounters() {
        var session = new SimulationSession(8);
        Assert.NotNull(session.DroneRaidEvaluation);
        session.Begin();
        session.FeedKey(GKey.Trigger, true);
        for (int tick = 0; tick < 2 * AircraftSim.TickHz; tick++)
            session.StepFixed();

        Assert.Empty(session.EngagementReports);
        Assert.True(session.PlayerGun.RoundsFired > 0,
            "the raid fixture never fired, so the guard invariant was not exercised");
        Assert.Equal(session.PlayerGun.RoundsFired, session.SortiePlayerRoundsFired);
        Assert.NotEqual(0.0, session.SortiePeakLoadFactorG);
    }
}
