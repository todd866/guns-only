using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Recovery;

namespace GunsOnly.Sim.Tests.TopGun;

public sealed class TopGunContinuousCarrierRtbTests
{
    static SimulationSession Start()
    {
        var session = new SimulationSession();
        session.StartBeat(() => Beats.TopGunAcm(TopGunSeat.F14A));
        session.Begin();
        return session;
    }

    static SimulationSession StartConfiguredCarrierRtb()
    {
        SimulationSession session = Start();
        session.ForceOpponentDefeatForTest();
        session.FeedKey(GKey.KnockItOff, true);
        session.FeedKey(GKey.KnockItOff, false);
        Assert.Equal(CombatHandoffPhase.PlayerRtb, session.CombatHandoffPhase);

        // Let the production actuator model dirty the aeroplane at approach speed while safely
        // above the carrier, then put that same live AircraftSim onto a one-tick wire fixture.
        Carrier ship = session.Carrier!;
        AircraftState cleanAir = new(
            ship.LandingPoint(along: -1_000.0, height: 500.0),
            70.0, -0.06, ship.LandingHeadingRad, 0.0, session.Player.State.Mass);
        session.Player.AdoptExternalKinematics(
            ship.ToWorldStateFromAir(cleanAir, DetentLayer.OnSpeedAoARad));
        session.SelectAutomaticConfigurationTarget(FlightConfigurationTarget.Recovery);
        for (int tick = 0; tick < 8 * (int)AircraftSim.TickHz
            && session.ConfigurationTransitionActive; tick++)
            session.StepFixed();

        Assert.False(session.ConfigurationTransitionActive);
        Assert.True(session.PlayerSystems.AllGearDownAndLocked);
        Assert.Same(ArrestmentCapabilityProfile.Mk7Mod3PublicDataSurrogate,
            session.Arrestment.Capability);
        return session;
    }

    static void StageCarrierContact(SimulationSession session, double alongM,
        double airspeedMps = 70.0)
    {
        Carrier ship = session.Carrier!;
        AircraftState airState = new(
            ship.LandingPoint(along: alongM, height: 0.02),
            airspeedMps, -0.06, ship.LandingHeadingRad, 0.0,
            session.Player.State.Mass);
        double configuredOnSpeedAoa = DetentLayer.OnSpeedAoARad
            - session.PlayerSystems.AerodynamicState.LiftCoefficientIncrement
                / session.Beat.PlayerAir.CLAlpha;
        session.Player.AdoptExternalKinematics(
            ship.ToWorldStateFromAir(airState, configuredOnSpeedAoa));
    }

    [Fact]
    public void BeatFieldsAnAceReplacementStreamAndCarrierRecovery()
    {
        BeatSetup beat = Beats.TopGunAcm(TopGunSeat.F14A);

        Assert.NotNull(beat.ContinuousCombat);
        Assert.Equal(1, beat.ContinuousCombat.MaximumFormationSize);
        Assert.Equal(PilotSkill.Ace, beat.BanditSkill);
        Assert.NotNull(beat.Carrier);
        Assert.True(beat.Carrier.IsMaritime);
        Assert.NotNull(beat.RecoveryPlan);
        Assert.True(beat.RecoveryCompletesSortie);
        Assert.False(beat.BolterCompletesSortie);
        Assert.True(Beats.CarrierApproach().BolterCompletesSortie);
        Assert.True(beat.PlayerAircraft.SystemsSimulated);
        Assert.Equal(AirframeSystemsProfile.CarrierJetRecoverySurrogate,
            beat.SystemsProfile);
        Assert.True(beat.SystemsProfile!.FullFlapDegrees > 0.0);
    }

    [Fact]
    public void AirborneAcmStartsCleanAtTheAuthoredMergeDespiteOwningACarrier()
    {
        BeatSetup authored = Beats.TopGunAcm(TopGunSeat.F14A);
        SimulationSession session = Start();

        Assert.Equal(authored.Player.Position, session.Player.State.Position);
        Assert.Equal(FlightConfigurationTarget.Combat, session.ConfigurationTarget);
        Assert.Equal(LandingGearHandle.Up, session.PlayerSystems.GearHandle);
        Assert.True(session.PlayerSystems.AllGearUpAndLocked);
        Assert.Equal(0.0, session.PlayerSystems.LeftFlapDegrees, precision: 12);
        Assert.Equal(0.0, session.PlayerSystems.RightFlapDegrees, precision: 12);
        ArrestmentCapabilityProfile gear = session.Arrestment.Capability;
        Assert.Same(ArrestmentCapabilityProfile.Mk7Mod3PublicDataSurrogate, gear);
        Assert.Equal(gear.RatedEnergyJ, gear.ForceCurveWorkJ, precision: 6);
        Assert.True(gear.PeakForceN <= gear.MaximumLineLoadN);
    }

    [Fact]
    public void Mk7SurrogateRetainsThePublishedNavairCapabilityAnchors()
    {
        const double joulesPerFootPound = 1.3558179483314004;
        const double metresPerFoot = 0.3048;
        ArrestmentCapabilityProfile gear =
            ArrestmentCapabilityProfile.Mk7Mod3PublicDataSurrogate;

        Assert.Equal(43_500_000.0 * joulesPerFootPound,
            gear.RatedEnergyJ, precision: 6);
        Assert.Equal(340.0 * metresPerFoot,
            gear.RunoutDistanceM, precision: 9);
        Assert.Equal(gear.RatedEnergyJ / gear.RunoutDistanceM,
            gear.PeakForceN, precision: 6);
        Assert.Equal(gear.PeakForceN, gear.MaximumLineLoadN, precision: 6);
    }

    [Fact]
    public void SplashSchedulesAndStagesAnotherJet()
    {
        SimulationSession session = Start();
        long firstSequence = session.BanditSpawnSequence;

        session.ForceOpponentDefeatForTest();

        Assert.True(session.OpponentReplacementPending);
        Assert.True(session.OpponentReplacementSeconds > 0.0);
        for (int tick = 0; tick < 5 * (int)AircraftSim.TickHz
            && session.BanditSpawnSequence == firstSequence; tick++)
            session.StepFixed();

        Assert.True(session.PrimaryOpponentAlive);
        Assert.True(session.BanditSpawnSequence > firstSequence);
        Assert.Equal(2, session.EngagementNumber);
    }

    [Fact]
    public void KnockItOffAfterSplashSelectsCarrierRtbAndBuildsSkyway()
    {
        SimulationSession session = Start();
        session.ForceOpponentDefeatForTest();
        Assert.True(session.OpponentReplacementPending);
        Assert.True(session.CombatHandoffAvailable);

        session.FeedKey(GKey.KnockItOff, true);
        session.FeedKey(GKey.KnockItOff, false);

        Assert.True(session.CombatHandoffRequested);
        Assert.False(session.OpponentReplacementPending);
        Assert.Equal(CombatHandoffPhase.PlayerRtb, session.CombatHandoffPhase);
        Assert.Null(session.Relief);
        for (int tick = 0; tick < 4 && !session.PlayerRtbActive; tick++)
            session.StepFixed();

        Assert.True(session.PlayerRtbActive);
        for (int tick = 0; tick < 20
            && !session.ApproachGuidancePlan.GuidanceActive; tick++)
            session.StepFixed();

        ApproachGuidanceState guidance = session.ApproachGuidancePlan;
        Assert.True(guidance.GuidanceActive);
        Assert.True(guidance.Valid);
        Assert.NotEmpty(guidance.Gates);
        Assert.Equal(ApproachExtensionKind.None, guidance.Extension);
        Assert.Equal("INITIAL · 3 NM", guidance.NextLabel);
        Assert.Equal(new[] {
            "INITIAL · 3 NM",
            "BREAK LEFT",
            "DOWNWIND · DIRTY",
            "ABEAM · START 180",
            "90 · 450 FT",
            "45 · 350 FT",
            "GROOVE · 3/4 NM",
            "WIRES · NO FLARE",
        }, guidance.Gates.Select(gate => gate.Label));
        Assert.All(guidance.Gates.Take(2), gate => Assert.False(gate.DirtyConfig));
        Assert.All(guidance.Gates.Skip(2), gate => Assert.True(gate.DirtyConfig));
        Assert.All(guidance.Gates, gate =>
        {
            Assert.True(double.IsFinite(gate.EastM));
            Assert.True(double.IsFinite(gate.NorthM));
            Assert.True(double.IsFinite(gate.UpM));
        });
        session.StepFixed((int)AircraftSim.TickHz);
        MeshPlace liveHome = Assert.IsType<MeshPlace>(session.MeshNav.HomePlate);
        Assert.Equal(session.Carrier!.Position.X, liveHome.EastM, precision: 6);
        Assert.Equal(session.Carrier.Position.Z, liveHome.NorthM, precision: 6);
        Assert.Equal(SortieLeg.Recovery, session.SortiePlan.Leg);
    }

    [Fact]
    public void KnockItOffDuringALiveFightHandsOffThenArmsCarrierGuidance()
    {
        SimulationSession session = Start();

        session.FeedKey(GKey.KnockItOff, true);
        session.FeedKey(GKey.KnockItOff, false);
        Assert.Equal(CombatHandoffPhase.Requested, session.CombatHandoffPhase);

        for (int tick = 0; tick < 8
            && session.CombatHandoffPhase < CombatHandoffPhase.ReliefEngaged; tick++)
            session.StepFixed();

        Assert.True(session.CombatHandoffActive);
        Assert.NotNull(session.Relief);
        Assert.True(session.PlayerRtbActive);
        for (int tick = 0; tick < 20
            && !session.ApproachGuidancePlan.GuidanceActive; tick++)
            session.StepFixed();
        Assert.True(session.ApproachGuidancePlan.GuidanceActive);
        Assert.NotEmpty(session.ApproachGuidancePlan.Gates);
    }

    [Fact]
    public void BolterKeepsCarrierRtbActiveForAnotherPass()
    {
        SimulationSession session = StartConfiguredCarrierRtb();
        Carrier ship = session.Carrier!;
        StageCarrierContact(session,
            ship.WireAlongM(4) + Carrier.HookToMainGearM + 4.8);

        session.StepFixed();
        Assert.Equal(Carrier.Recovery.Bolter, session.Recovery);
        for (int tick = 0; tick < 8 * (int)AircraftSim.TickHz
            && session.Recovery != Carrier.Recovery.Flying; tick++)
            session.StepFixed();

        Assert.Equal(Carrier.Recovery.Flying, session.Recovery);
        Assert.Equal(SimulationSession.LifecycleState.Active, session.Lifecycle);
        Assert.Equal(CombatHandoffPhase.PlayerRtb, session.CombatHandoffPhase);
        Assert.True(session.PlayerRtbActive);
    }

    [Fact]
    public void StoppedTrapCompletesCarrierRtbBeforeSortieFinishes()
    {
        SimulationSession session = StartConfiguredCarrierRtb();
        Carrier ship = session.Carrier!;
        StageCarrierContact(session,
            ship.WireAlongM(3) + Carrier.HookToMainGearM);

        session.StepFixed();
        Assert.Equal(Carrier.Recovery.Trap, session.Recovery);
        Assert.True(session.Arrestment.InitialEnergyJ
            > ArrestmentCapabilityProfile.ProvisionalKoreaJet.EffectiveEnergyCapacityJ);
        Assert.True(session.Arrestment.InitialEnergyJ
            < session.Arrestment.Capability.EffectiveEnergyCapacityJ);
        for (int tick = 0; tick < 10 * (int)AircraftSim.TickHz
            && session.Lifecycle != SimulationSession.LifecycleState.Finished; tick++)
            session.StepFixed();

        Assert.Equal(ArrestmentModel.ArrestmentPhase.Stopped,
            session.Arrestment.Phase);
        Assert.Equal(SimulationSession.LifecycleState.Finished, session.Lifecycle);
        Assert.Equal(CombatHandoffPhase.Recovered, session.CombatHandoffPhase);
        Assert.False(session.PlayerRtbActive);
        Assert.Equal(SortieOutcome.Victory, session.Outcome);
    }
}
